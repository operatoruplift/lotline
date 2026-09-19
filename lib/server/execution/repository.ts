import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { canTransition, type ContributionIntent, type ExecutionState } from '@/lib/domain/execution';
import type { ExecutionOrder } from './orders';
import { ServiceError } from '@/lib/server/common';
import type { ExecutionOwner } from './http';

type RunRow = {
  id: string;
  user_id: string | null;
  guest_capability_hash: string | null;
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

function ownerColumn(owner: ExecutionOwner): { user_id: string | null; guest_capability_hash: string | null } {
  return owner.kind === 'user'
    ? { user_id: owner.id, guest_capability_hash: null }
    : { user_id: null, guest_capability_hash: `\\x${owner.capabilityHash}` };
}

function guestValue(hash: string) {
  return `\\x${hash}`;
}

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

async function hydrateSnapshot(db: SupabaseClient, run: RunRow): Promise<ExecutionSnapshot> {
  const legs = check(await db.from('lotline_execution_legs').select('*').eq('run_id', run.id).order('created_at')) as LegRow[];
  const legIds = legs.map(leg => leg.id);
  const attempts = legIds.length ? check(await db.from('lotline_execution_attempts').select('id,leg_id,provider_request_id,transaction_message_hash,original_blockhash,original_last_valid_block_height,provider_expires_at,minimum_output_raw,signature,state,state_version,evidence,created_at,updated_at').in('leg_id', legIds).order('created_at')) as AttemptRow[] : [];
  return { run, legs, attempts };
}

async function findOccurrence(db: SupabaseClient, owner: ExecutionOwner, occurrenceId: string): Promise<RunRow | null> {
  const query = () => db.from('lotline_execution_runs').select('*').eq('intent->>scheduleOccurrenceId', occurrenceId);
  const own = check(owner.kind === 'user'
    ? await query().eq('user_id', owner.id).maybeSingle()
    : await query().eq('guest_capability_hash', guestValue(owner.capabilityHash)).maybeSingle()) as RunRow | null;
  if (own || owner.kind !== 'user' || !owner.guestCapabilityHash) return own;
  return check(await query().eq('guest_capability_hash', guestValue(owner.guestCapabilityHash)).maybeSingle()) as RunRow | null;
}

/** Recover a run inserted immediately before a process crash without rewriting any leg. */
async function hydrateCreatedRun(db: SupabaseClient, run: RunRow): Promise<ExecutionSnapshot> {
  if (run.state === 'planned') {
    check(await db.from('lotline_execution_legs').upsert(run.intent.legs.map(leg => ({ run_id: run.id, leg_key: leg.id, issuer_id: leg.issuerId, mint: leg.mint, allocation_bps: leg.allocationBps, input_raw: leg.maximumInputRaw, state: 'planned' })), { onConflict: 'run_id,leg_key', ignoreDuplicates: true }));
  }
  return hydrateSnapshot(db, run);
}

export async function createRun(owner: ExecutionOwner, intent: ContributionIntent, intentHash: string): Promise<ExecutionSnapshot> {
  const db = client();
  if (intent.scheduleOccurrenceId) {
    const occurrence = await findOccurrence(db, owner, intent.scheduleOccurrenceId);
    if (occurrence) return hydrateCreatedRun(db, occurrence);
  }
  if (owner.kind === 'user' && owner.guestCapabilityHash) {
    const guestExisting = check(await db.from('lotline_execution_runs').select('*').eq('guest_capability_hash', guestValue(owner.guestCapabilityHash)).eq('intent_hash', intentHash).maybeSingle()) as RunRow | null;
    if (guestExisting) return hydrateCreatedRun(db, guestExisting);
  }
  const inserted = await db.from('lotline_execution_runs').insert({ ...ownerColumn(owner), chain: intent.chain, wallet: intent.wallet, input_mint: intent.inputMint, budget_raw: intent.budgetRaw, intent, intent_hash: intentHash, policy_version: intent.policyVersion, state: 'planned' }).select('*').single();
  let run: RunRow;
  let wasExisting = false;
  if (inserted.error?.code === '23505') {
    if (intent.scheduleOccurrenceId) {
      const occurrence = await findOccurrence(db, owner, intent.scheduleOccurrenceId);
      if (occurrence) return hydrateCreatedRun(db, occurrence);
    }
    const existingResult = owner.kind === 'user'
      ? await db.from('lotline_execution_runs').select('*').eq('user_id', owner.id).eq('intent_hash', intentHash).maybeSingle()
      : await db.from('lotline_execution_runs').select('*').eq('guest_capability_hash', guestValue(owner.capabilityHash)).eq('intent_hash', intentHash).maybeSingle();
    let existing = check(existingResult) as RunRow | null;
    if (!existing && owner.kind === 'user' && owner.guestCapabilityHash) {
      existing = check(await db.from('lotline_execution_runs').select('*').eq('guest_capability_hash', guestValue(owner.guestCapabilityHash)).eq('intent_hash', intentHash).maybeSingle()) as RunRow | null;
    }
    if (!existing) throw new ServiceError('unavailable', 'The contribution review already exists but could not be loaded.');
    run = existing;
    wasExisting = true;
  } else run = check(inserted) as RunRow;
  if (wasExisting || run.state !== 'planned') {
    return hydrateCreatedRun(db, run);
  }
  const snapshot = await hydrateCreatedRun(db, run);
  check(await db.from('lotline_execution_events').insert({ run_id: run.id, to_state: 'planned', reason: 'Contribution reviewed locally.' }));
  return snapshot;
}

export async function getSnapshot(owner: ExecutionOwner, runId: string): Promise<ExecutionSnapshot | null> {
  const db = client();
  const runResult = owner.kind === 'user'
    ? await db.from('lotline_execution_runs').select('*').eq('id', runId).eq('user_id', owner.id).maybeSingle()
    : await db.from('lotline_execution_runs').select('*').eq('id', runId).eq('guest_capability_hash', guestValue(owner.capabilityHash)).maybeSingle();
  let run = check(runResult) as RunRow | null;
  if (!run && owner.kind === 'user' && owner.guestCapabilityHash) {
    run = check(await db.from('lotline_execution_runs').select('*').eq('id', runId).eq('guest_capability_hash', guestValue(owner.guestCapabilityHash)).maybeSingle()) as RunRow | null;
  }
  if (!run) return null;
  return hydrateSnapshot(db, run);
}

export async function createAttempt(owner: ExecutionOwner, runId: string, legId: string, order: ExecutionOrder): Promise<AttemptRow> {
  const snapshot = await getSnapshot(owner, runId);
  const leg = snapshot?.legs.find(item => item.id === legId);
  if (!snapshot || !leg) throw new ServiceError('invalid-input', 'That contribution leg is no longer available.');
  if (leg.input_raw === '0' || !['planned', 'quoting', 'expired-unbroadcast'].includes(leg.state)) throw new ServiceError('invalid-input', 'This leg is skipped, completed, or already has an execution attempt.');
  if (snapshot.attempts.some(attempt => ['review-required', 'awaiting-wallet', 'signed', 'submitted', 'confirming', 'unknown'].includes(attempt.state))) throw new ServiceError('invalid-input', 'Finish or reconcile the current leg before reviewing another purchase.');
  if (order.inputMint !== snapshot.run.input_mint || order.outputMint !== leg.mint || order.inAmount !== leg.input_raw) throw new ServiceError('invalid-input', 'This order does not match the immutable contribution leg.');
  const db = client();
  const row = check(await db.from('lotline_execution_attempts').insert({ leg_id: legId, provider_request_id: order.requestId, transaction_message_hash: order.messageHash, original_blockhash: order.originalBlockhash, original_last_valid_block_height: order.lastValidBlockHeight ?? null, provider_expires_at: order.expiresAt, minimum_output_raw: order.minimumOutputRaw, state: 'review-required', evidence: { transaction: order.transaction, router: order.router, inputMint: order.inputMint, outputMint: order.outputMint, inAmount: order.inAmount, outAmount: order.outAmount, prioritizationFeeLamports: order.prioritizationFeeLamports, signatureFeeLamports: order.signatureFeeLamports, rentFeeLamports: order.rentFeeLamports, totalSolCostLamports: order.totalSolCostLamports, feeBps: order.feeBps, feeMint: order.feeMint, platformFee: order.platformFee ?? null, validation: order.validation } }).select('id,leg_id,provider_request_id,transaction_message_hash,original_blockhash,original_last_valid_block_height,provider_expires_at,minimum_output_raw,signature,state,state_version,evidence,created_at,updated_at').single()) as AttemptRow;
  // The integrity migration updates leg/run projections and appends its event in
  // the same database transaction as the attempt insert.
  return row;
}

export async function getAttemptByRequestId(owner: ExecutionOwner, requestId: string): Promise<{ attempt: AttemptRow; leg: LegRow; run: RunRow } | null> {
  const db = client();
  const attempt = check(await db.from('lotline_execution_attempts').select('id,leg_id,provider_request_id,transaction_message_hash,original_blockhash,original_last_valid_block_height,provider_expires_at,minimum_output_raw,signature,state,state_version,evidence,created_at,updated_at').eq('provider_request_id', requestId).maybeSingle()) as AttemptRow | null;
  if (!attempt) return null;
  const leg = check(await db.from('lotline_execution_legs').select('*').eq('id', attempt.leg_id).maybeSingle()) as LegRow | null;
  if (!leg) return null;
  const runResult = owner.kind === 'user'
    ? await db.from('lotline_execution_runs').select('*').eq('id', leg.run_id).eq('user_id', owner.id).maybeSingle()
    : await db.from('lotline_execution_runs').select('*').eq('id', leg.run_id).eq('guest_capability_hash', guestValue(owner.capabilityHash)).maybeSingle();
  let run = check(runResult) as RunRow | null;
  if (!run && owner.kind === 'user' && owner.guestCapabilityHash) {
    run = check(await db.from('lotline_execution_runs').select('*').eq('id', leg.run_id).eq('guest_capability_hash', guestValue(owner.guestCapabilityHash)).maybeSingle()) as RunRow | null;
  }
  return run ? { attempt, leg, run } : null;
}

export async function getAttempt(owner: ExecutionOwner, attemptId: string): Promise<{ attempt: AttemptRow; leg: LegRow; run: RunRow } | null> {
  const db = client();
  const attempt = check(await db.from('lotline_execution_attempts').select('id,leg_id,provider_request_id,transaction_message_hash,original_blockhash,original_last_valid_block_height,provider_expires_at,minimum_output_raw,signature,state,state_version,evidence,created_at,updated_at').eq('id', attemptId).maybeSingle()) as AttemptRow | null;
  if (!attempt) return null;
  const leg = check(await db.from('lotline_execution_legs').select('*').eq('id', attempt.leg_id).maybeSingle()) as LegRow | null;
  if (!leg) return null;
  const runResult = owner.kind === 'user'
    ? await db.from('lotline_execution_runs').select('*').eq('id', leg.run_id).eq('user_id', owner.id).maybeSingle()
    : await db.from('lotline_execution_runs').select('*').eq('id', leg.run_id).eq('guest_capability_hash', guestValue(owner.capabilityHash)).maybeSingle();
  let run = check(runResult) as RunRow | null;
  if (!run && owner.kind === 'user' && owner.guestCapabilityHash) {
    run = check(await db.from('lotline_execution_runs').select('*').eq('id', leg.run_id).eq('guest_capability_hash', guestValue(owner.guestCapabilityHash)).maybeSingle()) as RunRow | null;
  }
  return run ? { attempt, leg, run } : null;
}

export async function transitionAttempt(owner: ExecutionOwner, attemptId: string, state: ExecutionState, evidence: Record<string, unknown> = {}, signature?: string): Promise<void> {
  const found = await getAttempt(owner, attemptId);
  if (!found) throw new ServiceError('invalid-input', 'That execution attempt is no longer available.');
  if (found.attempt.state !== state && !canTransition(found.attempt.state, state)) throw new ServiceError('invalid-input', 'This execution attempt is no longer at the expected step. Refresh the contribution review.');
  const nextSignature = signature ?? found.attempt.signature ?? undefined;
  if (found.attempt.signature && nextSignature !== found.attempt.signature) throw new ServiceError('invalid-input', 'An execution attempt cannot change its original signature.');
  if (['signed', 'submitted', 'confirming', 'unknown'].includes(state) && !nextSignature) {
    throw new ServiceError('invalid-input', 'A chain signature is required before this attempt can be marked as broadcast or unresolved.');
  }
  const db = client();
  const now = new Date().toISOString();
  const cumulativeEvidence = mergeAttemptEvidence(found.attempt.evidence, evidence);
  const changed = await db.from('lotline_execution_attempts').update({ state, ...(nextSignature ? { signature: nextSignature } : {}), evidence: cumulativeEvidence, state_version: found.attempt.state_version + 1, updated_at: now }).eq('id', attemptId).eq('leg_id', found.leg.id).eq('state', found.attempt.state).eq('state_version', found.attempt.state_version).select('id').maybeSingle();
  if (changed.error || !changed.data) throw new ServiceError('invalid-input', 'This execution attempt changed in another tab. Refresh the contribution review.');
  // Projection/event writes are an atomic database trigger, never a second
  // request that could arrive after a newer transition from another browser.
}

/** Keep the reviewed order and prior chain evidence available after retries/reloads. */
export function mergeAttemptEvidence(previous: Record<string, unknown> | null, next: Record<string, unknown>): Record<string, unknown> {
  const result = { ...previous, ...next };
  for (const key of ['transaction', 'router', 'inputMint', 'outputMint', 'inAmount', 'outAmount', 'prioritizationFeeLamports', 'signatureFeeLamports', 'rentFeeLamports', 'totalSolCostLamports', 'feeBps', 'feeMint', 'platformFee', 'validation', 'expectedSignature', 'signedTransactionHash']) {
    if (previous && Object.hasOwn(previous, key)) {
      if (Object.hasOwn(next, key) && next[key] !== previous[key]) throw new ServiceError('invalid-input', 'The immutable execution evidence cannot be changed.');
      result[key] = previous[key];
    }
  }
  return result;
}

/** A leg receipt must not label the entire multi-leg contribution as complete. */
export function contributionState(legs: readonly { state: ExecutionState; input_raw: string }[]): ExecutionState {
  const active = legs.filter(leg => leg.input_raw !== '0');
  if (active.length && active.every(leg => leg.state === 'confirmed')) return 'confirmed';
  for (const state of ['unknown', 'signed', 'submitted', 'confirming', 'awaiting-wallet', 'review-required', 'quoting', 'failed-onchain', 'rejected'] as const) {
    if (active.some(leg => leg.state === state)) return state;
  }
  return 'planned';
}

export async function recordSubmitted(owner: ExecutionOwner, attemptId: string, signature: string, provider: Record<string, unknown>): Promise<void> {
  await transitionAttempt(owner, attemptId, 'submitted', { ...provider, reason: 'Provider accepted the signed transaction for broadcast.' }, signature);
  await transitionAttempt(owner, attemptId, 'confirming', { ...provider, reason: 'Provider accepted the signed transaction; chain confirmation is still pending.' }, signature);
}
