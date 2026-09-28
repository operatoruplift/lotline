import { createHash } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { allocate } from '../lib/domain/math';
import { canonicalIntent, type ContributionIntent } from '../lib/domain/execution';

const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), createAttempt: vi.fn(), transition: vi.fn(), order: vi.fn(), assets: vi.fn(), issuer: vi.fn(), references: vi.fn(), current: vi.fn(), proof: vi.fn(), wallet: vi.fn(), batchEnabled: vi.fn() }));
vi.mock('@/lib/server/execution/repository', () => ({ ACTIVE_ATTEMPT_STATES: ['review-required', 'awaiting-wallet', 'signed', 'submitted', 'confirming', 'unknown'], getSnapshot: mocks.snapshot, createAttempt: mocks.createAttempt, transitionAttempt: mocks.transition }));
vi.mock('@/lib/server/execution/orders', () => ({ createExecutionOrder: mocks.order }));
vi.mock('@/lib/server/catalog', () => ({ selectedAssets: mocks.assets, getIssuerAsset: mocks.issuer }));
vi.mock('@/lib/server/execution/market-reference', () => ({ requirePythReview: mocks.references, requireCurrentReview: mocks.current }));
vi.mock('@/lib/server/execution/proof-policy', () => ({ requireSemanticProof: mocks.proof }));
vi.mock('@/lib/server/execution/config', () => ({ requireExecutionWallet: mocks.wallet, batchSigningEnabled: mocks.batchEnabled }));
vi.mock('@/lib/server/execution/http', () => ({
  ensureExecutionEnabled: () => ({ config: { limits: { slippageBps: 100, maximumPriorityFeeLamports: '5000000', maximumTotalSolCostLamports: '10000000', maximumTokenFeeBps: 100 } } }),
  requireSameOrigin() {}, requireExecutionOwner: async () => ({ kind: 'user', id: 'owner' }), enforceExecutionRateLimit: async () => {},
  json: (body: unknown, status = 200) => Response.json(body, { status }), failure: (error: unknown) => Response.json({ state: 'unavailable', message: error instanceof Error ? error.message : 'failure' }, { status: 503 }),
}));
import { POST } from '../app/api/execution/runs/[runId]/batch-order/route';

const wallet = '11111111111111111111111111111111';
const mints = ['XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', 'XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX', 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh'];
const budget = 3_000_000n;
const inputs = allocate(budget, [3334, 3333, 3333]);
const intent: ContributionIntent = {
  version: 1, chain: 'solana:mainnet', wallet, inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', budgetRaw: budget.toString(),
  legs: mints.map((mint, index) => ({ id: `leg-${index}`, issuerId: ['AAPLx', 'MSFTx', 'NVDAx'][index], mint, allocationBps: [3334, 3333, 3333][index], maximumInputRaw: inputs[index].toString() })),
  policyVersion: '2026-09-14.v1', reviewedLimits: { slippageBps: 100, maximumPriorityFeeLamports: '5000000', maximumTotalSolCostLamports: '10000000', maximumTokenFeeBps: 100 },
};
const intentHash = createHash('sha256').update(canonicalIntent(intent)).digest('hex');
const legIds = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'];
const snapshot = (attempts: { state: string; provider_expires_at?: string; id?: string }[] = []) => ({
  run: { id: 'run', wallet, input_mint: intent.inputMint, intent_hash: intentHash, policy_version: intent.policyVersion },
  legs: legIds.map((id, index) => ({ id, mint: mints[index], input_raw: inputs[index].toString(), state: 'planned' })),
  attempts: attempts.map((attempt, index) => ({ id: attempt.id ?? `attempt-${index}`, leg_id: legIds[index], evidence: {}, ...attempt })),
});
const request = (body: unknown) => new Request('https://lotline.test/api/execution/runs/run/batch-order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const context = { params: Promise.resolve({ runId: 'run' }) };
const order = (mint: string, inAmount: string) => ({ requestId: `req-${mint.slice(0, 4)}`, messageHash: 'a'.repeat(64), originalBlockhash: 'b', lastValidBlockHeight: '10', expiresAt: new Date(Date.now() + 30_000).toISOString(), minimumOutputRaw: '1', inputMint: intent.inputMint, outputMint: mint, inAmount, outAmount: '2', router: 'metis', transaction: 'AQID', prioritizationFeeLamports: '1', signatureFeeLamports: '1', rentFeeLamports: '0', totalSolCostLamports: '2', feeBps: 0, feeMint: mint, platformFee: null, semanticProof: { version: 'v1' } });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.batchEnabled.mockReturnValue(true);
  mocks.snapshot.mockResolvedValue(snapshot());
  mocks.references.mockResolvedValue(Date.now() + 60_000);
  mocks.assets.mockImplementation(async ([mint]: string[]) => [{ mint, symbol: ['AAPLx', 'MSFTx', 'NVDAx'][mints.indexOf(mint)], halted: false }]);
  mocks.issuer.mockImplementation(async (symbol: string) => ({ mint: mints[['AAPLx', 'MSFTx', 'NVDAx'].indexOf(symbol)], halted: false }));
  mocks.order.mockImplementation(async (_intent: ContributionIntent, asset: { mint: string }) => order(asset.mint, inputs[mints.indexOf(asset.mint)].toString()));
  mocks.createAttempt.mockImplementation(async (_owner, _runId, legId: string, prepared: { requestId: string; messageHash: string }, batchId: string) => ({ id: `attempt-${legId.slice(-1)}`, provider_request_id: prepared.requestId, transaction_message_hash: prepared.messageHash, state: 'review-required', batch_id: batchId }));
});

it('prepares one order per leg under a single batch id and returns every reviewed transaction', async () => {
  const response = await POST(request({ intent, legIds }), context);
  const body = await response.json() as { state: string; batchId: string; attempts: { legId: string; transaction: string; inputRaw: string }[] };
  expect(response.status).toBe(200);
  expect(body.state).toBe('success');
  expect(body.attempts.map(attempt => attempt.legId)).toEqual(legIds);
  expect(body.attempts.map(attempt => attempt.inputRaw)).toEqual(inputs.map(String));
  expect(body.attempts.every(attempt => attempt.transaction === 'AQID')).toBe(true);
  const batchIds = new Set(mocks.createAttempt.mock.calls.map(call => call[4]));
  expect(batchIds.size).toBe(1);
  expect([...batchIds][0]).toBe(body.batchId);
  expect(mocks.order).toHaveBeenCalledTimes(3);
  expect(mocks.proof).toHaveBeenCalledTimes(3);
  expect(mocks.transition).not.toHaveBeenCalled();
});

it('expires the orders already prepared when a later leg cannot be prepared, and signs nothing', async () => {
  mocks.order.mockImplementationOnce(async (_intent: ContributionIntent, asset: { mint: string }) => order(asset.mint, inputs[0].toString())).mockRejectedValueOnce(new Error('provider timeout'));
  const response = await POST(request({ intent, legIds }), context);
  expect(response.status).toBe(503);
  expect(mocks.createAttempt).toHaveBeenCalledTimes(1);
  expect(mocks.transition).toHaveBeenCalledTimes(1);
  expect(mocks.transition.mock.calls[0][2]).toBe('expired-unbroadcast');
});

it('refuses a batch while any leg of the run has an active review', async () => {
  mocks.snapshot.mockResolvedValue(snapshot([{ state: 'review-required', provider_expires_at: new Date(Date.now() + 20_000).toISOString() }]));
  const response = await POST(request({ intent, legIds }), context);
  expect(response.status).toBe(409);
  expect(mocks.order).not.toHaveBeenCalled();
});

it('expires an abandoned unsigned order whose provider window closed, then prepares the batch', async () => {
  mocks.snapshot.mockResolvedValue(snapshot([{ id: 'stale', state: 'review-required', provider_expires_at: new Date(Date.now() - 1_000).toISOString() }]));
  const response = await POST(request({ intent, legIds }), context);
  expect(response.status).toBe(200);
  expect(mocks.transition).toHaveBeenCalledWith(expect.anything(), 'stale', 'expired-unbroadcast', expect.objectContaining({ reason: expect.stringContaining('expired') }));
  expect(mocks.order).toHaveBeenCalledTimes(3);
});

it('caps a batch at three legs and rejects repeated legs before any provider work', async () => {
  for (const ids of [[...legIds, '00000000-0000-4000-8000-000000000004'], [legIds[0], legIds[0]], []]) {
    const response = await POST(request({ intent, legIds: ids }), context);
    expect(response.status).toBe(400);
  }
  expect(mocks.order).not.toHaveBeenCalled();
});

it('answers 503 until the batch journal migration is acknowledged', async () => {
  mocks.batchEnabled.mockReturnValue(false);
  const response = await POST(request({ intent, legIds }), context);
  expect(response.status).toBe(503);
  expect((await response.json()).state).toBe('configuration-required');
  expect(mocks.snapshot).not.toHaveBeenCalled();
});

it('rejects an intent that no longer matches the journaled run', async () => {
  const response = await POST(request({ intent: { ...intent, budgetRaw: '3000001', legs: intent.legs.map((leg, index) => ({ ...leg, maximumInputRaw: allocate(3_000_001n, [3334, 3333, 3333])[index].toString() })) }, legIds }), context);
  expect(response.status).toBe(400);
  expect(mocks.order).not.toHaveBeenCalled();
});
