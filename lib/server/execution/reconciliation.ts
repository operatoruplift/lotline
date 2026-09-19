import 'server-only';
import { readSmallJson, ServiceError } from '@/lib/server/common';
import { rpcRequest } from '@/lib/server/solana';
import { getAttempt, transitionAttempt } from './repository';
import { enforceExecutionRateLimit, failure, json, requireExecutionOwner, requireSameOrigin } from './http';
import { reconcileRequestSchema } from './schemas';
import { verifyExecutionReceipt } from './receipts';

type Scope = { attemptId: string } | { runId: string; legId: string };

export function requireJournalReadiness(requireRpc = true) {
  if ((requireRpc && !process.env.SOLANA_RPC_URL?.trim()) || !process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    || !process.env.SUPABASE_SECRET_KEY?.trim().startsWith('sb_secret_')
    || process.env.LOTLINE_EXECUTION_MIGRATIONS_READY !== 'true'
    || process.env.LOTLINE_EXECUTION_REPOSITORY !== 'supabase') {
    throw new ServiceError('configuration-required', 'The original receipt cannot be checked until the journal and Solana RPC are configured.');
  }
  if (requireRpc && (process.env.LOTLINE_EXECUTION_INTEGRITY_MIGRATIONS_READY !== 'true'
    || process.env.LOTLINE_EXECUTION_GUEST_MIGRATIONS_READY !== 'true')) {
    throw new ServiceError('configuration-required', 'Receipt updates need the integrity and guest journal migrations before reconciliation.');
  }
}

/** Read original chain evidence even when creation of new purchases is paused. */
export async function reconcileExecution(request: Request, scope: Scope) {
  try {
    requireSameOrigin(request);
    requireJournalReadiness();
    const body = reconcileRequestSchema.safeParse(await readSmallJson(request));
    if (!body.success || ('attemptId' in scope && body.data.attemptId !== scope.attemptId)) {
      return json({ state: 'invalid-input', message: 'Choose the original execution attempt.' }, 400);
    }
    const owner = await requireExecutionOwner();
    await enforceExecutionRateLimit(owner, request);
    const found = await getAttempt(owner, body.data.attemptId);
    if (!found || ('runId' in scope && (found.run.id !== scope.runId || found.leg.id !== scope.legId))) {
      return json({ state: 'not-found', message: 'That execution attempt is no longer available.' }, 404);
    }
    const signature = found.attempt.signature;
    if (!signature) {
      if (['review-required', 'awaiting-wallet'].includes(found.attempt.state)
        && found.attempt.provider_expires_at
        && Date.parse(found.attempt.provider_expires_at) <= Date.now()) {
        // Submission always journals a signature before contacting Jupiter.
        // The CAS transition refuses expiry if another request recorded one.
        await transitionAttempt(owner, found.attempt.id, 'expired-unbroadcast', { reason: 'The review expired with no server-recorded signature or submission.' });
        return json({ state: 'expired-unbroadcast', message: 'The server did not submit this expired review. A fresh review is now required.' });
      }
      return json({ state: 'unknown', message: 'No original chain signature is recorded. No replacement purchase was created.' });
    }
    let state = found.attempt.state;
    if (state === 'signed') {
      await transitionAttempt(owner, found.attempt.id, 'unknown', { reason: 'Checking the preserved signature after an incomplete submission.' }, signature);
      state = 'unknown';
    }
    if (state === 'unknown' || state === 'submitted') {
      await transitionAttempt(owner, found.attempt.id, 'confirming', { reason: 'Checking original transaction history.' }, signature);
      state = 'confirming';
    }
    const unsigned = found.attempt.evidence?.transaction;
    if (typeof unsigned !== 'string') {
      if (state === 'confirming') await transitionAttempt(owner, found.attempt.id, 'unknown', { reason: 'The original approved transaction is missing from the journal.' });
      return json({ state: 'unknown', signature, message: 'The original approved transaction is missing. Its settlement cannot be verified.' });
    }
    let verified;
    try {
      const [genesisHash, statuses, transaction] = await Promise.all([
        rpcRequest('getGenesisHash', []),
        rpcRequest('getSignatureStatuses', [[signature], { searchTransactionHistory: true }]),
        rpcRequest('getTransaction', [signature, { encoding: 'base64', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]),
      ]);
      verified = await verifyExecutionReceipt({ genesisHash, statuses, transaction }, {
        wallet: found.run.wallet, signature, messageHash: found.attempt.transaction_message_hash,
        transaction: unsigned, originalBlockhash: found.attempt.original_blockhash,
        inputMint: found.run.input_mint, outputMint: found.leg.mint,
        maximumInputRaw: found.leg.input_raw, minimumOutputRaw: found.attempt.minimum_output_raw,
        maximumTotalSolCostLamports: found.run.intent.reviewedLimits.maximumTotalSolCostLamports,
      });
    } catch {
      verified = { state: 'unknown' as const, message: 'Solana history is temporarily unavailable. Reconcile the same signature later.', evidence: { reason: 'Receipt RPC unavailable; no replacement created.' } };
    }
    // Terminal evidence is not rewound when a later provider read is unavailable.
    if (state === 'confirming' || state === verified.state) {
      await transitionAttempt(owner, found.attempt.id, verified.state, verified.evidence, signature);
    }
    return json({ state: verified.state, signature, message: verified.message, receipt: verified.evidence,
      confirmationStatus: verified.evidence.confirmationStatus, slot: verified.evidence.slot });
  } catch (error) { return failure(error); }
}
