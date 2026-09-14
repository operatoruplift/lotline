import { rpcRequest } from '@/lib/server/solana';
import { readSmallJson } from '@/lib/server/common';
import { getAttempt, transitionAttempt } from '@/lib/server/execution/repository';
import { ensureExecutionEnabled, failure, json, requireSameOrigin, requireUser } from '@/lib/server/execution/http';
import { reconcileRequestSchema } from '@/lib/server/execution/schemas';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
const statusSchema = z.object({ value: z.array(z.object({ slot: z.number().int().nonnegative().optional(), confirmationStatus: z.enum(['processed', 'confirmed', 'finalized']).nullable().optional(), err: z.unknown().nullable() }).nullable()).length(1) });
const transactionSchema = z.object({ slot: z.number().int().nonnegative(), meta: z.object({ err: z.unknown().nullable() }).nullable() }).passthrough();

export async function POST(request: Request, context: { params: Promise<{ runId: string; legId: string }> }) {
  try {
    requireSameOrigin(request);
    const ready = ensureExecutionEnabled();
    if (ready.response) return ready.response;
    const body = reconcileRequestSchema.safeParse(await readSmallJson(request));
    if (!body.success) return json({ state: 'invalid-input', message: 'Choose a valid execution attempt.' }, 400);
    const { runId, legId } = await context.params;
    const user = await requireUser();
    const found = await getAttempt(user.id, body.data.attemptId);
    if (!found || found.run.id !== runId || found.leg.id !== legId) return json({ state: 'not-found', message: 'That execution attempt is no longer available.' }, 404);
    if (!found.attempt.signature) return json({ state: 'confirming', message: 'No chain signature is available yet.' });
    const parsed = statusSchema.safeParse(await rpcRequest('getSignatureStatuses', [[found.attempt.signature], { searchTransactionHistory: true }]));
    if (!parsed.success) return json({ state: 'unknown', message: 'The Solana receipt could not be verified. Retry reconciliation later.' }, 503);
    const receipt = parsed.data.value[0];
    if (!receipt) return json({ state: 'confirming', signature: found.attempt.signature, message: 'The signature is not confirmed yet. No new order was created.' });
    if (receipt.err !== null) { await transitionAttempt(user.id, found.attempt.id, 'failed-onchain', { reason: 'Solana reported an on-chain error.', rpc: receipt.err }); return json({ state: 'failed-onchain', signature: found.attempt.signature, message: 'Solana reported an on-chain error. No retry was created.' }); }
    if (receipt.confirmationStatus !== 'confirmed' && receipt.confirmationStatus !== 'finalized') return json({ state: 'confirming', signature: found.attempt.signature, message: 'The signature is still being confirmed.' });
    const transaction = transactionSchema.safeParse(await rpcRequest('getTransaction', [found.attempt.signature, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]));
    if (!transaction.success || !transaction.data.meta) return json({ state: 'unknown', signature: found.attempt.signature, message: 'The confirmed signature has no readable transaction metadata yet. Retry reconciliation later.' }, 503);
    if (transaction.data.meta.err !== null) { await transitionAttempt(user.id, found.attempt.id, 'failed-onchain', { reason: 'Solana transaction metadata reports an on-chain error.', rpc: transaction.data.meta.err }); return json({ state: 'failed-onchain', signature: found.attempt.signature, message: 'Solana reported an on-chain error. No retry was created.' }); }
    await transitionAttempt(user.id, found.attempt.id, 'confirmed', { reason: 'Solana returned a confirmed receipt with null transaction error.', confirmationStatus: receipt.confirmationStatus, slot: transaction.data.slot });
    return json({ state: 'confirmed', signature: found.attempt.signature, confirmationStatus: receipt.confirmationStatus, slot: receipt.slot });
  } catch (error) { return failure(error); }
}
