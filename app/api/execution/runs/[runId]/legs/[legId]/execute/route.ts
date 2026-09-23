import { readSmallJson, ServiceError } from '@/lib/server/common';
import { getAttemptByRequestId, transitionAttempt, recordSubmitted } from '@/lib/server/execution/repository';
import { executeOnJupiter, validateSignedTransaction } from '@/lib/server/execution/submit';
import { ensureExecutionEnabled, enforceExecutionRateLimit, failure, json, requireSameOrigin, requireExecutionOwner } from '@/lib/server/execution/http';
import { executeRequestSchema } from '@/lib/server/execution/schemas';
import { requireSemanticProof } from '@/lib/server/execution/proof-policy';
import { requireExecutionWallet } from '@/lib/server/execution/config';
import { requirePythReview, requireCurrentReview, ReviewExpiredBeforeDispatch } from '@/lib/server/execution/market-reference';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request: Request, context: { params: Promise<{ runId: string; legId: string }> }) {
  try {
    requireSameOrigin(request);
    const ready = ensureExecutionEnabled();
    if (ready.response) return ready.response;
    const parsed = executeRequestSchema.safeParse(await readSmallJson(request));
    if (!parsed.success) return json({ state: 'invalid-input', message: 'The signed transaction payload is incomplete.' }, 400);
    const { runId, legId } = await context.params;
    const owner = await requireExecutionOwner();
    await enforceExecutionRateLimit(owner, request);
    const found = await getAttemptByRequestId(owner, parsed.data.requestId);
    if (!found || found.run.id !== runId || found.leg.id !== legId) return json({ state: 'not-found', message: 'That execution review is no longer available.' }, 404);
    if (found.attempt.transaction_message_hash !== parsed.data.messageHash) return json({ state: 'invalid-input', message: 'The signed transaction does not match the reviewed order.' }, 400);
    if (found.attempt.provider_expires_at && Date.parse(found.attempt.provider_expires_at) <= Date.now() && (found.attempt.state === 'review-required' || found.attempt.state === 'awaiting-wallet')) {
      await transitionAttempt(owner, found.attempt.id, 'expired-unbroadcast', { reason: 'The approved provider order expired before submission.' });
      return json({ state: 'expired-unbroadcast', message: 'This reviewed order expired before submission. No transaction was sent; request a fresh review.' }, 409);
    }
    if (found.attempt.state === 'confirming' || found.attempt.state === 'submitted') return json({ state: 'success', status: 'confirming', message: 'This order was already submitted and is being verified.' });
    if (found.attempt.state !== 'review-required' && found.attempt.state !== 'awaiting-wallet') return json({ state: 'invalid-input', message: 'This order is no longer awaiting a wallet signature.' }, 409);
    requireExecutionWallet(found.run.wallet);
    requireSemanticProof(found.attempt.evidence, found.leg.input_raw, found.attempt.minimum_output_raw);
    const referenceExpiry = await requirePythReview(found.leg.mint);
    const unsigned = found.attempt.evidence?.transaction;
    if (typeof unsigned !== 'string') throw new ServiceError('unavailable', 'The reviewed transaction is unavailable. Request a fresh order.');
    await transitionAttempt(owner, found.attempt.id, 'awaiting-wallet', { reason: 'The user chose to sign the reviewed order.' });
    const signed = await validateSignedTransaction({ transaction: unsigned, messageHash: found.attempt.transaction_message_hash }, parsed.data.signedTransaction, found.run.wallet);
    await transitionAttempt(owner, found.attempt.id, 'signed', { reason: 'The wallet signature passed exact message and Ed25519 checks.', expectedSignature: signed.chainSignature, signedTransactionHash: signed.signedTransactionHash }, signed.chainSignature);
    let response: Awaited<ReturnType<typeof executeOnJupiter>>;
    try {
      response = await executeOnJupiter(signed.encoded, found.attempt.provider_request_id, signed.chainSignature, found.attempt.original_last_valid_block_height ?? undefined, () => requireCurrentReview(referenceExpiry, found.attempt.provider_expires_at));
    } catch (error) {
      if (error instanceof ReviewExpiredBeforeDispatch) {
        // Signed bytes may still be broadcast by the wallet; preserve the original
        // signature and reconciliation lock even though this server sent nothing.
        const message = 'The order or Pyth references expired before transmission. Lotline did not send the signed transaction. Check the original receipt before another approval.';
        await transitionAttempt(owner, found.attempt.id, 'unknown', { reason: message, lotlineTransmitted: false });
        return json({ state: 'unknown', signature: signed.chainSignature, message }, 409);
      }
      await transitionAttempt(owner, found.attempt.id, 'unknown', { reason: 'The provider response was inconclusive. Reconcile this attempt before any retry.', error: error instanceof Error ? error.message : 'provider-unavailable' });
      throw error;
    }
    if (response.status === 'Failed') {
      await transitionAttempt(owner, found.attempt.id, 'unknown', { reason: 'Jupiter reported failure after receiving signed bytes. Chain reconciliation is still required.', code: response.code ?? null });
      return json({ state: 'unknown', status: 'Failed', signature: signed.chainSignature, message: 'Jupiter reported a failure. The original signature must be reconciled before any new purchase.', code: response.code });
    }
    if (!response.signature) {
      await transitionAttempt(owner, found.attempt.id, 'unknown', { reason: 'Jupiter returned a success-shaped response without a chain signature. Reconcile the signed transaction before any retry.', status: response.status }, signed.chainSignature);
      return json({ state: 'unknown', message: 'Jupiter did not return a chain signature. The signed attempt is preserved for reconciliation; no replacement order was created.' }, 503);
    }
    await recordSubmitted(owner, found.attempt.id, response.signature, { status: response.status, inputAmountResult: response.inputAmountResult ?? null, outputAmountResult: response.outputAmountResult ?? null });
    return json({ state: 'confirming', status: 'Success', signature: response.signature, message: 'Submitted to Jupiter. Lotline is verifying the Solana receipt before marking this contribution complete.' });
  } catch (error) { return failure(error); }
}
