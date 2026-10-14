import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { AAPLX, migratedDatabase, publish, runAs, savePlan } from './migrated-database';

let db: PGlite;
const [alice, bruno] = ['00000000-0000-4000-8000-0000000002a1', '00000000-0000-4000-8000-0000000002b1'];
const WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<{ result: T }>(sql, params)).rows[0]?.result as T;
const count = (table: string, where: string, params: unknown[]) => one<number>(`select count(*)::int as result from public.${table} where ${where}`, params);

/** A reviewed run with one leg and one attempt, the way the execution journal records a purchase. */
async function purchaseRecord(owner: string, intentHash: string) {
  const run = await one<string>(`insert into public.lotline_execution_runs (user_id, chain, wallet, input_mint, budget_raw, intent, intent_hash, policy_version, state)
    values ($1, 'solana:mainnet', $2, $3, '1000000', '{}', $4, 'test', 'planned') returning id as result`, [owner, WALLET, USDC, intentHash]);
  const leg = await one<string>(`insert into public.lotline_execution_legs (run_id, leg_key, issuer_id, mint, allocation_bps, input_raw, state)
    values ($1, 'one', 'xstocks', $2, 10000, '1000000', 'planned') returning id as result`, [run, AAPLX]);
  await db.query(`insert into public.lotline_execution_attempts (leg_id, provider_request_id, transaction_message_hash, original_blockhash, minimum_output_raw, state, signature)
    values ($1, $2, $3, $4, '1', 'confirmed', $5)`, [leg, `request-${intentHash.slice(0, 8)}`, intentHash, WALLET, `signature-${intentHash.slice(0, 8)}`]);
  return run;
}

beforeAll(async () => {
  db = await migratedDatabase();
  await db.exec(`insert into auth.users (id) values ('${alice}'), ('${bruno}');`);
}, 120_000);
afterAll(async () => { await db.close(); });

describe('deleting an account in Supabase Auth', () => {
  it('removes everything the account owns, and nothing that belongs to other members', async () => {
    // Alice saves and shares plans, copies and reports Bruno's, keeps a reminder whose
    // occurrence started one of her runs, and has a purchase in the execution journal.
    const alicePlan = await savePlan(db, alice, 'Alice core');
    const aliceShared = await publish(db, alice, alicePlan, 'Alice');
    const brunoShared = await publish(db, bruno, await savePlan(db, bruno, 'Bruno core'), 'Bruno');
    expect(await runAs(db, alice, 'select public.lotline_record_plan_copy($1) as result', [brunoShared])).toBe(1);
    expect(await runAs(db, bruno, 'select public.lotline_record_plan_copy($1) as result', [aliceShared])).toBe(1);
    expect(await runAs(db, alice, `select public.lotline_report_plan($1, 'spam') as result`, [brunoShared])).toBe(true);
    const run = await purchaseRecord(alice, 'a'.repeat(64));
    const schedule = await one<string>(`insert into public.lotline_contribution_schedules (user_id, name, budget_raw, allocations, cadence, timezone, next_due_at)
      values ($1, 'Weekly', '1000000', $2::jsonb, 'weekly', 'UTC', now()) returning id as result`, [alice, JSON.stringify([{ mint: AAPLX, bps: '10000' }])]);
    await db.query(`insert into public.lotline_contribution_occurrences (schedule_id, occurrence_key, due_at, plan_snapshot, run_id) values ($1, 'first', now(), '{}', $2)`, [schedule, run]);
    await purchaseRecord(bruno, 'b'.repeat(64));

    // The admin API's delete: one statement on auth.users, cascading as the table owner.
    await db.query('delete from auth.users where id = $1', [alice]);

    for (const table of ['lotline_contribution_plans', 'lotline_published_plans', 'lotline_plan_copies', 'lotline_contribution_schedules', 'lotline_execution_runs']) {
      expect(await count(table, 'user_id = $1', [alice])).toBe(0);
    }
    expect(await count('lotline_plan_reports', 'reporter_id = $1', [alice])).toBe(0);
    expect(await count('lotline_contribution_occurrences', 'schedule_id = $1', [schedule])).toBe(0);
    expect(await count('lotline_execution_legs', 'run_id = $1', [run])).toBe(0);
    expect(await count('lotline_execution_events', 'run_id = $1', [run])).toBe(0);
    expect(await count('lotline_execution_attempts', `provider_request_id = 'request-aaaaaaaa'`, [])).toBe(0);
    expect(await runAs(db, null, 'select public.lotline_published_plan($1) as result', [aliceShared])).toBeNull();

    // Bruno keeps his plan, his purchase record and the copy count Alice added, which names no one.
    expect(await runAs(db, null, 'select public.lotline_published_plan($1) as result', [brunoShared])).toMatchObject({ id: brunoShared, copy_count: 1 });
    expect(await count('lotline_execution_runs', 'user_id = $1', [bruno])).toBe(1);
    expect(await count('lotline_plan_copies', 'user_id = $1', [bruno])).toBe(0);
  });
});
