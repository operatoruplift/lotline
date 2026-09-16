import { createHash } from 'node:crypto';
import { canonicalIntent } from '@/lib/domain/execution';
import { getIssuerAsset, selectedAssets } from '@/lib/server/catalog';
import { readSmallJson } from '@/lib/server/common';
import { createAttempt, getSnapshot, transitionAttempt } from '@/lib/server/execution/repository';
import { createExecutionOrder } from '@/lib/server/execution/orders';
import { ensureExecutionEnabled, enforceExecutionRateLimit, failure, json, requireSameOrigin, requireExecutionOwner } from '@/lib/server/execution/http';
import { orderRequestSchema } from '@/lib/server/execution/schemas';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request: Request, context: { params: Promise<{ runId: string; legId: string }> }) {
  try {
    requireSameOrigin(request);
    const ready = ensureExecutionEnabled();
    if (ready.response) return ready.response;
    const parsed = orderRequestSchema.safeParse(await readSmallJson(request));
    if (!parsed.success) return json({ state: 'invalid-input', message: 'Review a valid contribution leg before requesting an order.' }, 400);
    const { runId, legId } = await context.params;
    const owner = await requireExecutionOwner();
    await enforceExecutionRateLimit(owner, request);
    const snapshot = await getSnapshot(owner, runId);
    const leg = snapshot?.legs.find(item => item.id === legId);
    if (!snapshot || !leg) return json({ state: 'not-found', message: 'That contribution leg is no longer available.' }, 404);
    const intent = parsed.data.intent;
    if (createHash('sha256').update(canonicalIntent(intent)).digest('hex') !== snapshot.run.intent_hash || intent.policyVersion !== snapshot.run.policy_version) return json({ state: 'invalid-input', message: 'The execution intent changed after review. Start a new contribution review.' }, 400);
    if (intent.wallet !== snapshot.run.wallet || intent.legs.find(item => item.mint === leg.mint)?.maximumInputRaw !== leg.input_raw || parsed.data.mint !== leg.mint) return json({ state: 'invalid-input', message: 'The order request does not match the reviewed contribution.' }, 400);
    const activeAttempt = snapshot.attempts.find(item => item.leg_id === leg.id && ['review-required', 'awaiting-wallet', 'signed', 'submitted', 'confirming', 'unknown'].includes(item.state));
    let expiredActiveAttempt = false;
    if (activeAttempt) {
      if ((activeAttempt.state === 'review-required' || activeAttempt.state === 'awaiting-wallet') && activeAttempt.provider_expires_at && Date.parse(activeAttempt.provider_expires_at) <= Date.now()) {
        await transitionAttempt(owner, activeAttempt.id, 'expired-unbroadcast', { reason: activeAttempt.state === 'awaiting-wallet' ? 'The wallet approval window expired before a valid signed payload arrived.' : 'The unsigned provider order expired before approval.' });
        expiredActiveAttempt = true;
      } else {
        if ((activeAttempt.state === 'review-required' || activeAttempt.state === 'awaiting-wallet') && typeof activeAttempt.evidence?.transaction === 'string') {
          const evidence = activeAttempt.evidence;
          return json({ state: 'success', attempt: { id: activeAttempt.id, requestId: activeAttempt.provider_request_id, state: activeAttempt.state, messageHash: activeAttempt.transaction_message_hash, inputRaw: typeof evidence.inAmount === 'string' ? evidence.inAmount : leg.input_raw, outputRaw: typeof evidence.outAmount === 'string' ? evidence.outAmount : activeAttempt.minimum_output_raw, minimumOutputRaw: activeAttempt.minimum_output_raw, expiresAt: activeAttempt.provider_expires_at, router: typeof evidence.router === 'string' ? evidence.router : 'validated route' }, transaction: evidence.transaction });
        }
        return json({ state: 'in-progress', message: 'This leg already has an active review. Reconcile it before requesting another order.' }, 409);
      }
    }
    if (!expiredActiveAttempt && ['confirmed', 'rejected', 'failed-onchain', 'submitted', 'confirming', 'signed', 'awaiting-wallet'].includes(leg.state)) {
      return json({ state: 'in-progress', message: 'This leg already has a completed or pending attempt. Start a new contribution review if the plan changed.' }, 409);
    }
    const asset = (await selectedAssets([leg.mint]))[0];
    const issuer = await getIssuerAsset(asset.symbol, { fresh: true });
    if (asset.halted || issuer.halted || issuer.mint !== asset.mint) return json({ state: 'invalid-input', message: 'This issuer is currently unavailable or changed. Refresh before continuing.' }, 400);
    const order = await createExecutionOrder(intent, asset, ready.config.limits);
    const attempt = await createAttempt(owner, runId, legId, order);
    return json({ state: 'success', attempt: { id: attempt.id, requestId: attempt.provider_request_id, state: attempt.state, messageHash: attempt.transaction_message_hash, inputRaw: order.inAmount, outputRaw: order.outAmount, minimumOutputRaw: order.minimumOutputRaw, router: order.router, expiresAt: order.expiresAt, prioritizationFeeLamports: order.prioritizationFeeLamports, platformFee: order.platformFee }, transaction: order.transaction });
  } catch (error) { return failure(error); }
}
