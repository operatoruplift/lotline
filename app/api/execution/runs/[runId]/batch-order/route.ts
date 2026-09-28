import { createHash, randomUUID } from 'node:crypto';
import { canonicalIntent } from '@/lib/domain/execution';
import { getIssuerAsset, selectedAssets } from '@/lib/server/catalog';
import { readSmallJson, ServiceError } from '@/lib/server/common';
import { ACTIVE_ATTEMPT_STATES, createAttempt, getSnapshot, transitionAttempt } from '@/lib/server/execution/repository';
import { createExecutionOrder } from '@/lib/server/execution/orders';
import { ensureExecutionEnabled, enforceExecutionRateLimit, failure, json, requireSameOrigin, requireExecutionOwner } from '@/lib/server/execution/http';
import { batchOrderRequestSchema } from '@/lib/server/execution/schemas';
import { requireSemanticProof } from '@/lib/server/execution/proof-policy';
import { batchSigningEnabled, requireExecutionWallet } from '@/lib/server/execution/config';
import { requirePythReview, requireCurrentReview } from '@/lib/server/execution/market-reference';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Prepares executable orders for several legs of one run under a shared batch
 * id, so the wallet can approve them in one prompt. Orders are built one after
 * another; if any leg cannot be prepared, the ones already prepared are expired
 * unsigned and nothing from the batch can be signed.
 */
export async function POST(request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    requireSameOrigin(request);
    const ready = ensureExecutionEnabled();
    if (ready.response) return ready.response;
    if (!batchSigningEnabled()) return json({ state: 'configuration-required', message: 'Approving several legs at once is not enabled in this release. Review one leg at a time.' }, 503);
    const parsed = batchOrderRequestSchema.safeParse(await readSmallJson(request));
    if (!parsed.success) return json({ state: 'invalid-input', message: 'Review a valid contribution and choose up to three legs before requesting a batch.' }, 400);
    const { runId } = await context.params;
    const owner = await requireExecutionOwner();
    await enforceExecutionRateLimit(owner, request);
    const snapshot = await getSnapshot(owner, runId);
    if (!snapshot) return json({ state: 'not-found', message: 'That contribution review is no longer available.' }, 404);
    const intent = parsed.data.intent;
    requireExecutionWallet(intent.wallet);
    if (createHash('sha256').update(canonicalIntent(intent)).digest('hex') !== snapshot.run.intent_hash || intent.policyVersion !== snapshot.run.policy_version) return json({ state: 'invalid-input', message: 'The execution intent changed after review. Start a new contribution review.' }, 400);
    if (intent.wallet !== snapshot.run.wallet) return json({ state: 'invalid-input', message: 'The batch request does not match the reviewed contribution.' }, 400);
    const legs = parsed.data.legIds.map(id => snapshot.legs.find(leg => leg.id === id));
    if (legs.some(leg => !leg)) return json({ state: 'not-found', message: 'A requested contribution leg is no longer available.' }, 404);
    // Unsigned orders whose provider window has closed are expired first, so a
    // batch the user abandoned never blocks the next one.
    for (const attempt of snapshot.attempts) {
      if ((attempt.state === 'review-required' || attempt.state === 'awaiting-wallet') && attempt.provider_expires_at && Date.parse(attempt.provider_expires_at) <= Date.now()) {
        await transitionAttempt(owner, attempt.id, 'expired-unbroadcast', { reason: 'The unsigned provider order expired before approval.' });
        attempt.state = 'expired-unbroadcast';
      }
    }
    if (snapshot.attempts.some(attempt => ACTIVE_ATTEMPT_STATES.includes(attempt.state))) return json({ state: 'in-progress', message: 'A leg of this contribution already has an active review. Finish or reconcile it before approving a batch.' }, 409);
    for (const leg of legs as NonNullable<typeof legs[number]>[]) {
      if (leg.input_raw === '0' || !['planned', 'quoting', 'expired-unbroadcast'].includes(leg.state)) return json({ state: 'in-progress', message: 'A requested leg is skipped, completed, or already has an attempt. Refresh the contribution review.' }, 409);
      if (intent.legs.find(item => item.mint === leg.mint)?.maximumInputRaw !== leg.input_raw) return json({ state: 'invalid-input', message: 'The batch request does not match the reviewed contribution.' }, 400);
    }
    const batchId = randomUUID();
    const prepared: { id: string; legId: string; mint: string; requestId: string; state: string; messageHash: string; inputRaw: string; outputRaw: string; minimumOutputRaw: string; router: string; expiresAt: string | null; prioritizationFeeLamports: string; signatureFeeLamports: string; rentFeeLamports: string; totalSolCostLamports: string; feeBps: number; feeMint: string; platformFee: unknown; semanticProof: unknown; transaction: string }[] = [];
    try {
      for (const leg of legs as NonNullable<typeof legs[number]>[]) {
        const referenceExpiry = await requirePythReview(leg.mint);
        const asset = (await selectedAssets([leg.mint]))[0];
        const issuer = await getIssuerAsset(asset.symbol, { fresh: true });
        if (asset.halted || issuer.halted || issuer.mint !== asset.mint) throw new ServiceError('invalid-input', 'This issuer is currently unavailable or changed. Refresh before continuing.');
        const order = await createExecutionOrder(intent, asset, ready.config.limits);
        requireCurrentReview(referenceExpiry, order.expiresAt);
        requireSemanticProof(order, leg.input_raw, order.minimumOutputRaw);
        const attempt = await createAttempt(owner, runId, leg.id, order, batchId);
        requireCurrentReview(referenceExpiry, order.expiresAt);
        prepared.push({ id: attempt.id, legId: leg.id, mint: leg.mint, requestId: attempt.provider_request_id, state: attempt.state, messageHash: attempt.transaction_message_hash, inputRaw: order.inAmount, outputRaw: order.outAmount, minimumOutputRaw: order.minimumOutputRaw, router: order.router, expiresAt: order.expiresAt, prioritizationFeeLamports: order.prioritizationFeeLamports, signatureFeeLamports: order.signatureFeeLamports, rentFeeLamports: order.rentFeeLamports, totalSolCostLamports: order.totalSolCostLamports, feeBps: order.feeBps, feeMint: order.feeMint, platformFee: order.platformFee, semanticProof: order.semanticProof, transaction: order.transaction });
      }
    } catch (error) {
      // Nothing was signed. Orders already prepared for this batch are expired so
      // the run is free for a fresh review, then the original failure is reported.
      for (const attempt of prepared) {
        try { await transitionAttempt(owner, attempt.id, 'expired-unbroadcast', { reason: 'Batch preparation stopped before approval.' }); } catch { /* The next review expires it by its provider window. */ }
      }
      throw error;
    }
    return json({ state: 'success', batchId, attempts: prepared });
  } catch (error) { return failure(error); }
}
