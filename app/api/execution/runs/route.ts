import { createHash } from 'node:crypto';
import { canonicalIntent } from '@/lib/domain/execution';
import { selectedAssets } from '@/lib/server/catalog';
import { readSmallJson } from '@/lib/server/common';
import { createRun } from '@/lib/server/execution/repository';
import { ensureExecutionEnabled, failure, json, requireSameOrigin, requireUser } from '@/lib/server/execution/http';
import { runRequestSchema } from '@/lib/server/execution/schemas';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const ready = ensureExecutionEnabled();
    if (ready.response) return ready.response;
    const parsed = runRequestSchema.safeParse(await readSmallJson(request));
    if (!parsed.success) return json({ state: 'invalid-input', message: 'Review a valid contribution before continuing.' }, 400);
    const user = await requireUser();
    const assets = await selectedAssets(parsed.data.intent.legs.map(leg => leg.mint));
    if (assets.some(asset => asset.halted)) return json({ state: 'invalid-input', message: 'One selected issuer is currently halted. Refresh the catalog before reviewing.' }, 400);
    const intent = parsed.data.intent;
    if (intent.legs.some(leg => assets.find(asset => asset.mint === leg.mint)?.symbol !== leg.issuerId)) return json({ state: 'invalid-input', message: 'The reviewed issuer identity does not match the verified catalog.' }, 400);
    const intentHash = createHash('sha256').update(canonicalIntent(intent)).digest('hex');
    const snapshot = await createRun(user.id, intent, intentHash);
    return json({ state: 'success', run: { id: snapshot.run.id, intentHash, state: snapshot.run.state, createdAt: snapshot.run.created_at }, legs: snapshot.legs.map(leg => ({ id: leg.id, key: leg.leg_key, mint: leg.mint, allocationBps: leg.allocation_bps, inputRaw: leg.input_raw, state: leg.state })) }, 201);
  } catch (error) { return failure(error); }
}
