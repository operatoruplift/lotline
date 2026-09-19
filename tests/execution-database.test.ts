import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';

// Isolated PostgreSQL/WASM: never reads credentials or connects to Supabase.
const db = new PGlite();
const wallet = '11111111111111111111111111111111';
const hash = (value: number) => value.toString(16).padStart(64, '0');
let sequence = 100;

async function run(owner = ++sequence, state = 'planned') {
  const result = await db.query<{ id: string }>(`insert into public.lotline_execution_runs
    (guest_capability_hash, chain, wallet, input_mint, budget_raw, intent, intent_hash, policy_version, state)
    values (decode($1, 'hex'), 'solana:mainnet', $2, $2, '1000000', '{}', $3, 'test', $4) returning id`,
  [hash(owner), wallet, hash(++sequence), state]);
  return result.rows[0].id;
}

async function leg(runId: string, key = 'one') {
  const result = await db.query<{ id: string }>(`insert into public.lotline_execution_legs
    (run_id, leg_key, issuer_id, mint, allocation_bps, input_raw, state)
    values ($1, $2, 'xstocks', $3, 10000, '1000000', 'planned') returning id`,
  [runId, key, key === 'one' ? wallet : '22222222222222222222222222222222']);
  return result.rows[0].id;
}

async function attempt(legId: string, state = 'review-required', evidence: Record<string, unknown> | null = null) {
  const result = await db.query<{ id: string }>(`insert into public.lotline_execution_attempts
    (leg_id, provider_request_id, transaction_message_hash, original_blockhash, minimum_output_raw, state, evidence)
    values ($1, $2, $3, $4, '1', $5, $6) returning id`, [legId, `test-${++sequence}`, hash(sequence), wallet, state, evidence]);
  return result.rows[0].id;
}

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;`);
  const directory = new URL('../supabase/migrations/', import.meta.url);
  for (const name of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(name, directory), 'utf8'));
  }
}, 120_000);
afterAll(async () => { await db.close(); });

describe('execution migrations in isolated PostgreSQL', () => {
  it('isolates equal intents belonging to different guest capabilities', async () => {
    const id = await run();
    await expect(db.query(`insert into public.lotline_execution_runs
      (guest_capability_hash, chain, wallet, input_mint, budget_raw, intent, intent_hash, policy_version, state)
      select decode($1, 'hex'), chain, wallet, input_mint, budget_raw, intent, intent_hash, policy_version, state
      from public.lotline_execution_runs where id=$2`, [hash(++sequence), id])).resolves.toBeDefined();
    await expect(db.query(`insert into public.lotline_execution_runs
      (guest_capability_hash, chain, wallet, input_mint, budget_raw, intent, intent_hash, policy_version, state)
      select guest_capability_hash, chain, wallet, input_mint, budget_raw, intent, intent_hash, policy_version, state
      from public.lotline_execution_runs where id=$1`, [id])).rejects.toThrow(/unique|duplicate/);
  });

  it('denies anonymous and authenticated journal access and limiter execution', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      try {
        await expect(db.query('select * from public.lotline_execution_runs')).rejects.toThrow(/permission denied/);
        await expect(db.query("select public.lotline_consume_guest_execution_ip_slot($1)", [hash(1)])).rejects.toThrow(/permission denied/);
      } finally { await db.exec('reset role'); }
    }
  });

  it('enforces per-capability quotas and shared request buckets', async () => {
    const owner = ++sequence;
    for (let i = 0; i < 20; i++) await run(owner);
    await expect(run(owner)).rejects.toThrow(/guest_execution_quota_exceeded/);
    for (const expected of [true, true, false]) {
      const result = await db.query<{ allowed: boolean }>('select public.lotline_consume_guest_execution_ip_slot($1, 2, 60) as allowed', [hash(9999)]);
      expect(result.rows[0].allowed).toBe(expected);
    }
  });

  it('permits expiry only for an unsigned attempt', async () => {
    const id = await attempt(await leg(await run()));
    await expect(db.query("update public.lotline_execution_attempts set state='expired-unbroadcast' where id=$1", [id])).resolves.toBeDefined();
    const signed = await attempt(await leg(await run()));
    await db.query("update public.lotline_execution_attempts set state='signed', signature=$1 where id=$2", ['3'.repeat(88), signed]);
    await expect(db.query("update public.lotline_execution_attempts set state='expired-unbroadcast' where id=$1", [signed])).rejects.toThrow(/signed_attempt_cannot_expire/);
  });

  it('rejects a second active attempt on another leg of the same run', async () => {
    const runId = await run();
    const first = await attempt(await leg(runId));
    const secondLeg = await leg(runId, 'two');
    await expect(attempt(secondLeg)).rejects.toThrow(/run_active_attempt_exists/);
    await db.query("update public.lotline_execution_attempts set state='rejected' where id=$1", [first]);
    await expect(attempt(secondLeg)).resolves.toBeTypeOf('string');
  });

  it('preserves unresolved attempts even when an old run has a terminal summary', async () => {
    const unresolvedRun = await run(undefined, 'confirmed');
    const id = await attempt(await leg(unresolvedRun));
    await db.query("update public.lotline_execution_attempts set state='unknown', signature=$1 where id=$2", ['4'.repeat(88), id]);
    const abandoned = await run();
    await db.query("update public.lotline_execution_runs set updated_at=now()-interval '40 days' where id in ($1,$2)", [unresolvedRun, abandoned]);
    await db.query('select public.lotline_prune_guest_execution_runs()');
    const result = await db.query<{ id: string }>('select id from public.lotline_execution_runs where id in ($1,$2)', [unresolvedRun, abandoned]);
    expect(result.rows.map(row => row.id)).toEqual([unresolvedRun]);
  });

  it('prevents rewriting a recorded signature or reviewed transaction identity', async () => {
    const id = await attempt(await leg(await run()));
    await db.query("update public.lotline_execution_attempts set state='signed', signature=$1 where id=$2", ['5'.repeat(88), id]);
    await expect(db.query('update public.lotline_execution_attempts set signature=$1 where id=$2', ['6'.repeat(88), id])).rejects.toThrow(/execution_identity_immutable/);
    await expect(db.query('update public.lotline_execution_attempts set minimum_output_raw=$1 where id=$2', ['2', id])).rejects.toThrow(/execution_identity_immutable/);
  });

  it('preserves semantic proof and slippage under direct database writes while allowing receipt observations', async () => {
    const evidence = { transaction: 'original', slippageBps: 100, semanticProof: { version: 'fixture', loadedAddresses: { writable: [wallet], readonly: [] } } };
    const id = await attempt(await leg(await run()), 'review-required', evidence);
    await db.query("update public.lotline_execution_attempts set evidence=evidence || '{\"reason\":\"observed\",\"slot\":\"123\"}' where id=$1", [id]);
    for (const replacement of [{ ...evidence, semanticProof: null }, { ...evidence, slippageBps: 200 }, { ...evidence, transaction: 'different' }, { transaction: 'original', slippageBps: 100 }]) {
      await expect(db.query('update public.lotline_execution_attempts set evidence=$1 where id=$2', [replacement, id])).rejects.toThrow(/execution_evidence_immutable/);
    }
    const legacy = await attempt(await leg(await run()));
    await expect(db.query('update public.lotline_execution_attempts set evidence=$1 where id=$2', [{ semanticProof: evidence.semanticProof }, legacy])).rejects.toThrow(/execution_evidence_immutable/);
  });

  it('does not create a second intent for the same owner and schedule occurrence', async () => {
    const owner = ++sequence;
    const first = await run(owner);
    const second = await run(owner);
    await db.query(`update public.lotline_execution_runs set intent='{"scheduleOccurrenceId":"schedule:2026-09-19"}' where id=$1`, [first]);
    await expect(db.query(`update public.lotline_execution_runs set intent='{"scheduleOccurrenceId":"schedule:2026-09-19"}' where id=$1`, [second])).rejects.toThrow(/unique|duplicate/);
  });

  it('retains a fresh terminal receipt when the parent summary timestamp is stale', async () => {
    const runId = await run(undefined, 'confirmed');
    await attempt(await leg(runId), 'confirmed');
    await db.query("update public.lotline_execution_runs set updated_at=now()-interval '40 days' where id=$1", [runId]);
    await db.query('select public.lotline_prune_guest_execution_runs()');
    expect((await db.query('select id from public.lotline_execution_runs where id=$1', [runId])).rows).toHaveLength(1);
  });

  it('enforces schedule ownership, valid allocation, timezone and server-owned versions', async () => {
    const userId = '00000000-0000-4000-8000-000000000001';
    await db.query('insert into auth.users(id) values ($1)', [userId]);
    await db.exec('set role authenticated');
    try {
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
      const allocations = JSON.stringify([{ mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', bps: '10000' }]);
      const saved = await db.query<{ id: string; plan_version: number }>(`insert into public.lotline_contribution_schedules
        (user_id,name,budget_raw,allocations,cadence,timezone,next_due_at,plan_version)
        values ($1,'Monthly plan','1000000',$2,'monthly','Asia/Ho_Chi_Minh',now(),99) returning id,plan_version`, [userId, allocations]);
      expect(saved.rows[0].plan_version).toBe(1);
      const changed = await db.query<{ plan_version: number }>("update public.lotline_contribution_schedules set paused=true,plan_version=123 where id=$1 returning plan_version", [saved.rows[0].id]);
      expect(changed.rows[0].plan_version).toBe(2);
      await expect(db.query("update public.lotline_contribution_schedules set allocations='[]' where id=$1", [saved.rows[0].id])).rejects.toThrow(/invalid_contribution_schedule/);
      await expect(db.query("update public.lotline_contribution_schedules set timezone='not/a-zone' where id=$1", [saved.rows[0].id])).rejects.toThrow(/invalid_contribution_schedule/);
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", ['00000000-0000-4000-8000-000000000002']);
      expect((await db.query('select id from public.lotline_contribution_schedules')).rows).toHaveLength(0);
      expect((await db.query("update public.lotline_contribution_schedules set paused=false where id=$1 returning id", [saved.rows[0].id])).rows).toHaveLength(0);
    } finally { await db.exec('reset role'); }
  });

  it('atomically updates leg receipts and run progress with append-only events', async () => {
    const runId = await run();
    const firstLeg = await leg(runId);
    const secondLeg = await leg(runId, 'two');
    const firstAttempt = await attempt(firstLeg);
    await db.query(`update public.lotline_execution_attempts set state='confirmed', evidence='{"inputDebitRaw":"1000000","transaction":"private-bytes"}' where id=$1`, [firstAttempt]);
    expect((await db.query<{ state: string }>('select state from public.lotline_execution_runs where id=$1', [runId])).rows[0].state).toBe('planned');
    const first = (await db.query<{ state: string; receipt: unknown }>('select state,receipt from public.lotline_execution_legs where id=$1', [firstLeg])).rows[0];
    expect(first).toEqual({ state: 'confirmed', receipt: { inputDebitRaw: '1000000' } });
    await expect(attempt(firstLeg)).rejects.toThrow(/execution_leg_not_reviewable/);
    const secondAttempt = await attempt(secondLeg);
    await db.query("update public.lotline_execution_attempts set state='unknown',signature=$1 where id=$2", ['7'.repeat(88), secondAttempt]);
    await db.query("update public.lotline_execution_attempts set state='confirmed' where id=$1", [firstAttempt]);
    expect((await db.query<{ state: string }>('select state from public.lotline_execution_runs where id=$1', [runId])).rows[0].state).toBe('unknown');
    await db.query("update public.lotline_execution_attempts set state='confirmed' where id=$1", [secondAttempt]);
    expect((await db.query<{ state: string }>('select state from public.lotline_execution_runs where id=$1', [runId])).rows[0].state).toBe('confirmed');
    expect((await db.query('select id from public.lotline_execution_events where run_id=$1', [runId])).rows).toHaveLength(6);
    await db.exec('set role service_role');
    try { await expect(db.query('delete from public.lotline_execution_events where run_id=$1', [runId])).rejects.toThrow(/permission denied/); }
    finally { await db.exec('reset role'); }
  });
});
