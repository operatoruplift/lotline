import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { canTransition, type ContributionIntent, type ExecutionState } from '@/lib/domain/execution';
import type { ExecutionOrder } from './orders';
import { ServiceError } from '@/lib/server/common';

type RunRow = {
  id: string;
  user_id: string | null;
  chain: string;
  wallet: string;
  input_mint: string;
  budget_raw: string;
  intent: ContributionIntent;
  intent_hash: string;
  policy_version: string;
  state: ExecutionState;
  created_at: string;
  updated_at: string;
};

type LegRow = {
  id: string;
  run_id: string;
  leg_key: string;
  issuer_id: string;
  mint: string;
  allocation_bps: number;
  input_raw: string;
  state: ExecutionState;
  state_version: number;
  receipt: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type AttemptRow = {
  id: string;
  leg_id: string;
  provider_request_id: string;
  transaction_message_hash: string;
  original_blockhash: string;
  original_last_valid_block_height: string | null;
  provider_expires_at: string | null;
  minimum_output_raw: string;
  signature: string | null;
  state: ExecutionState;
  state_version: number;
  evidence: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type ExecutionSnapshot = { run: RunRow; legs: LegRow[]; attempts: AttemptRow[] };

function client(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key || (!key.startsWith('sb_secret_') && !key.startsWith('service_role'))) {
    throw new ServiceError('configuration-required', 'The private execution journal is not configured.');
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(12_000)]) : AbortSignal.timeout(12_000) }) } });
}

function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new ServiceError('unavailable', 'The execution journal is temporarily unavailable.');
  return result.data;
}

export async function createRun(ownerId: string, intent: ContributionIntent, intentHash: string): Promise<ExecutionSnapshot> {
  const db = client();
  const inserted = await db.from('lotline_execution_runs').insert({ user_id: ownerId, chain: intent.chain, wallet: intent.wallet, input_mint: intent.inputMint, budget_raw: intent.budgetRaw, intent, intent_hash: intentHash, policy_version: intent.policyVersion, state: 'planned' }).select('*').single();
  let run: RunRow;
  let wasExisting = false;
  if (inserted.error?.code === '23505') {
    const existing = check(await db.from('lotline_execution_runs').select('*').eq('user_id', ownerId).eq('intent_hash', intentHash).maybeSingle()) as RunRow | null;
    if (!existing) throw new ServiceError('unavailable', 'The contribution review already exists but could not be loaded.');
    run = existing;
    wasExisting = true;
  } else run = check(inserted) as RunRow;
  if (wasExisting || run.state !== 'planned') {
    const legs = check(await db.from('lotline_execution_legs').select('*').eq('run_id', run.id).order('created_at')) as LegRow[];
    const legIds = legs.map(leg => leg.id);
    const attempts = legIds.length ? check(await db.from('lotline_execution_attempts').select('id,leg_id,provider_request_id,transaction_message_hash,original_blockhash,original_last_valid_block_height,provider_expires_at,minimum_output_raw,signature,state,state_version,evidence,created_at,updated_at').in('leg_id', legIds).order('created_at')) as AttemptRow[] : [];
    return { run, legs, attempts };
  }
  const legs = check(await db.from('lotline_execution_legs').insert(intent.legs.map(leg => ({ run_id: run.id, leg_key: leg.id, issuer_id: leg.issuerId, mint: leg.mint, allocation_bps: leg.allocationBps, input_raw: leg.maximumInputRaw, state: 'planned' }))).select('*')) as LegRow[];
  check(await db.from('lotline_execution_events').insert({ run_id: run.id, to_state: 'planned', reason: 'Contribution reviewed locally.' }));
  return { run, legs, attempts: [] };
}

export async function getSnapshot(ownerId: string, runId: string): Promise<ExecutionSnapshot | null> {
  const db = client();
  const run = check(await db.from('lotline_execution_runs').select('*').eq('id', runId).eq('user_id', ownerId).maybeSingle()) as RunRow | null;
  if (!run) return null;
  const legs = check(await db.from('lotline_execution_legs').select('*').eq('run_id', runId).order('created_at')) as LegRow[];
  const legIds = legs.map(leg => leg.id);
  const attempts = legIds.length ? check(await db.from('lotline_execution_attempts').select('id,leg_id,provider_request_id,transaction_message_hash,original_blockhash,original_last_valid_block_height,provider_expires_at,minimum_output_raw,signature,state,state_version,evidence,created_at,updated_at').in('leg_id', legIds).order('created_at')) as AttemptRow[] : [];
  return { run, legs, attempts };
}

export async function createAttempt(ownerId: string, runId: string, legId: string, order: ExecutionOrder): Promise<AttemptRow> {
  const snapshot = await getSnapshot(ownerId, runId);
  const leg = snapshot?.legs.find(item => item.id === legId);
  if (!snapshot || !leg) throw new ServiceError('invalid-input', 'That contribution leg is no longer available.');
  const db = client();
  const row = check(await db.from('lotline_execution_attempts').insert({ leg_id: legId, provider_request_id: order.requestId, transaction_message_hash: order.messageHash, original_blockhash: order.originalBlockhash, original_last_valid_block_height: order.lastValidBlockHeight ?? null, provider_expires_at: order.expiresAt, minimum_output_raw: order.minimumOutputRaw, state: 'review-required', evidence: { transaction: order.transaction, router: order.router, inputMint: order.inputMint, outputMint: order.outputMint, inAmount: order.inAmount, outAmount: order.outAmount, prioritizationFeeLamports: order.prioritizationFeeLamports, validation: order.validation } }).select('id,leg_id,provider_request_id,transaction_message_hash,original_blockhash,original_last_valid_block_height,provider_expires_at,minimum_output_raw,signature,state,state_version,evidence,created_at,updated_at').single()) as AttemptRow;
  check(await db.from('lotline_execution_legs').update({ state: 'review-required', updated_at: new Date().toISOString() }).eq('id', legId).eq('run_id', runId));
  const now = new Date().toISOString();
  check(await db.from('lotline_execution_runs').update({ state: 'quoting', updated_at: now }).eq('id', runId).eq('user_id', ownerId));
  check(await db.from('lotline_execution_events').insert({ run_id: runId, leg_id: legId, from_state: 'planned', to_state: 'quoting', reason: 'Requesting a provider order for the reviewed leg.' }));
  check(await db.from('lotline_execution_runs').update({ state: 'review-required', updated_at: new Date().toISOString() }).eq('id', runId).eq('user_id', ownerId));
  check(await db.from('lotline_execution_events').insert({ run_id: runId, leg_id: legId, from_state: 'quoting', to_state: 'review-required', reason: 'A provider order passed server validation.' }));
  return row;
}

export async function getAttemptByRequestId(ownerId: string, requestId: string): Promise<{ attempt: AttemptRow; leg: LegRow; run: RunRow } | null> {
  const db = client();
  const attempt = check(await db.from('lotline_execution_attempts').select('id,leg_id,provider_request_id,transaction_message_hash,original_blockhash,original_last_valid_block_height,provider_expires_at,minimum_output_raw,signature,state,state_version,evidence,created_at,updated_at').eq('provider_request_id', requestId).maybeSingle()) as AttemptRow | null;
  if (!attempt) return null;
  const leg = check(await db.from('lotline_execution_legs').select('*').eq('id', attempt.leg_id).maybeSingle()) as LegRow | null;
  if (!leg) return null;
  const run = check(await db.from('lotline_execution_runs').select('*').eq('id', leg.run_id).eq('user_id', ownerId).maybeSingle()) as RunRow | null;
  return run ? { attempt, leg, run } : null;
}

export async function getAttempt(ownerId: string, attemptId: string): Promise<{ attempt: AttemptRow; leg: LegRow; run: RunRow } | null> {
  const db = client();
  const attempt = check(await db.from('lotline_execution_attempts').select('id,leg_id,provider_request_id,transaction_message_hash,original_blockhash,original_last_valid_block_height,provider_expires_at,minimum_output_raw,signature,state,state_version,evidence,created_at,updated_at').eq('id', attemptId).maybeSingle()) as AttemptRow | null;
  if (!attempt) return null;
  const leg = check(await db.from('lotline_execution_legs').select('*').eq('id', attempt.leg_id).maybeSingle()) as LegRow | null;
  if (!leg) return null;
  const run = check(await db.from('lotline_execution_runs').select('*').eq('id', leg.run_id).eq('user_id', ownerId).maybeSingle()) as RunRow | null;
  return run ? { attempt, leg, run } : null;
}

export async function transitionAttempt(ownerId: string, attemptId: string, state: ExecutionState, evidence: Record<string, unknown> = {}, signature?: string): Promise<void> {
  const found = await getAttempt(ownerId, attemptId);
  if (!found) throw new ServiceError('invalid-input', 'That execution attempt is no longer available.');
  if (found.attempt.state !== state && !canTransition(found.attempt.state, state)) throw new ServiceError('invalid-input', 'This execution attempt is no longer at the expected step. Refresh the contribution review.');
  const db = client();
  const now = new Date().toISOString();
  const changed = await db.from('lotline_execution_attempts').update({ state, ...(signature ? { signature } : {}), evidence, state_version: found.attempt.state_version + 1, updated_at: now }).eq('id', attemptId).eq('leg_id', found.leg.id).eq('state', found.attempt.state).eq('state_version', found.attempt.state_version).select('id').maybeSingle();
  if (changed.error || !changed.data) throw new ServiceError('invalid-input', 'This execution attempt changed in another tab. Refresh the contribution review.');
  check(await db.from('lotline_execution_legs').update({ state, updated_at: now }).eq('id', found.leg.id).eq('run_id', found.run.id));
  check(await db.from('lotline_execution_runs').update({ state, updated_at: now }).eq('id', found.run.id).eq('user_id', ownerId));
  check(await db.from('lotline_execution_events').insert({ run_id: found.run.id, leg_id: found.leg.id, from_state: found.attempt.state, to_state: state, reason: typeof evidence.reason === 'string' ? evidence.reason : null, evidence }));
}

export async function recordSubmitted(ownerId: string, attemptId: string, signature: string, provider: Record<string, unknown>): Promise<void> {
  await transitionAttempt(ownerId, attemptId, 'submitted', { ...provider, reason: 'Provider accepted the signed transaction for broadcast.' }, signature);
  await transitionAttempt(ownerId, attemptId, 'confirming', { ...provider, reason: 'Provider accepted the signed transaction; chain confirmation is still pending.' }, signature);
}
