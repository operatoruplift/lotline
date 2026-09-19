import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getAttempt: vi.fn(), transitionAttempt: vi.fn(), rpc: vi.fn(), verify: vi.fn(), owner: vi.fn(), limit: vi.fn() }));
vi.mock('@/lib/server/execution/repository', () => ({ getAttempt: mocks.getAttempt, transitionAttempt: mocks.transitionAttempt }));
vi.mock('@/lib/server/solana', () => ({ rpcRequest: mocks.rpc }));
vi.mock('@/lib/server/execution/receipts', () => ({ verifyExecutionReceipt: mocks.verify }));
vi.mock('@/lib/server/execution/http', () => ({
  requireSameOrigin(request: Request) { if (request.headers.get('origin') !== new URL(request.url).origin) throw new Error('origin'); },
  requireExecutionOwner: mocks.owner, enforceExecutionRateLimit: mocks.limit,
  json: (body: unknown, status = 200) => Response.json(body, { status }),
  failure: () => Response.json({ state: 'unavailable' }, { status: 503 }),
}));
import { reconcileExecution } from '../lib/server/execution/reconciliation';

const id = '00000000-0000-4000-8000-000000000001';
const found = () => ({
  run: { id: 'run', wallet: 'wallet', input_mint: 'USDC', intent: { reviewedLimits: { maximumTotalSolCostLamports: '10000' } } },
  leg: { id: 'leg', mint: 'asset', input_raw: '1000000' },
  attempt: { id, signature: 'original-signature', state: 'unknown', transaction_message_hash: 'hash', original_blockhash: 'original-blockhash', minimum_output_raw: '123', evidence: { transaction: 'original-unsigned' } },
});
const request = (attemptId = id) => new Request(`https://lotline.test/api/execution/attempts/${id}/reconcile`, { method: 'POST', headers: { origin: 'https://lotline.test', 'content-type': 'application/json' }, body: JSON.stringify({ attemptId }) });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('SOLANA_RPC_URL', 'https://rpc.invalid');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.invalid');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_test-fixture');
  vi.stubEnv('LOTLINE_EXECUTION_MIGRATIONS_READY', 'true');
  vi.stubEnv('LOTLINE_EXECUTION_REPOSITORY', 'supabase');
  vi.stubEnv('LOTLINE_EXECUTION_GUEST_MIGRATIONS_READY', 'true');
  vi.stubEnv('LOTLINE_EXECUTION_INTEGRITY_MIGRATIONS_READY', 'true');
  vi.stubEnv('LOTLINE_EXECUTION_ENABLED', 'false');
  mocks.owner.mockResolvedValue({ kind: 'user', id: 'owner' });
  mocks.getAttempt.mockResolvedValue(found());
  mocks.rpc.mockImplementation(async (method: string) => method);
  mocks.verify.mockResolvedValue({ state: 'confirmed', message: 'Verified', evidence: { slot: '42', confirmationStatus: 'confirmed', inputDebitRaw: '1000000' } });
});
afterEach(() => vi.unstubAllEnvs());

it('requires the atomic integrity migration before updating receipt state', async () => {
  vi.stubEnv('LOTLINE_EXECUTION_INTEGRITY_MIGRATIONS_READY', 'false');
  expect((await reconcileExecution(request(), { attemptId: id })).status).toBe(503);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.transitionAttempt).not.toHaveBeenCalled();
});

it('reconciles the original message while new purchases are paused', async () => {
  const response = await reconcileExecution(request(), { attemptId: id });
  expect(await response.json()).toMatchObject({ state: 'confirmed', signature: 'original-signature', slot: '42' });
  expect(mocks.rpc).toHaveBeenCalledWith('getTransaction', ['original-signature', { encoding: 'base64', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
  expect(mocks.verify).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ transaction: 'original-unsigned', messageHash: 'hash', originalBlockhash: 'original-blockhash', maximumInputRaw: '1000000', minimumOutputRaw: '123' }));
  expect(mocks.transitionAttempt.mock.calls.map(args => args[2])).toEqual(['confirming', 'confirmed']);
});

it('preserves unknown settlement when RPC is unavailable', async () => {
  mocks.rpc.mockRejectedValue(new Error('timeout'));
  expect(await (await reconcileExecution(request(), { runId: 'run', legId: 'leg' })).json()).toMatchObject({ state: 'unknown', signature: 'original-signature' });
  expect(mocks.transitionAttempt.mock.calls.map(args => args[2])).toEqual(['confirming', 'unknown']);
  expect(mocks.verify).not.toHaveBeenCalled();
});

it('only releases an expired review after the journal proves no submission signature exists', async () => {
  mocks.getAttempt.mockResolvedValue({ ...found(), attempt: { ...found().attempt, state: 'awaiting-wallet', signature: null, provider_expires_at: '2020-01-01T00:00:00Z' } });
  expect(await (await reconcileExecution(request(), { attemptId: id })).json()).toMatchObject({ state: 'expired-unbroadcast' });
  expect(mocks.transitionAttempt.mock.calls.map(args => args[2])).toEqual(['expired-unbroadcast']);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it('does not release an unsigned review whose approval window is still open', async () => {
  mocks.getAttempt.mockResolvedValue({ ...found(), attempt: { ...found().attempt, state: 'awaiting-wallet', signature: null, provider_expires_at: '2099-01-01T00:00:00Z' } });
  expect(await (await reconcileExecution(request(), { attemptId: id })).json()).toMatchObject({ state: 'unknown' });
  expect(mocks.transitionAttempt).not.toHaveBeenCalled();
});

it('does not claim confirmation when original approved bytes are missing', async () => {
  mocks.getAttempt.mockResolvedValue({ ...found(), attempt: { ...found().attempt, evidence: {} } });
  expect(await (await reconcileExecution(request(), { attemptId: id })).json()).toMatchObject({ state: 'unknown' });
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it('binds both path variants to the owned attempt and rejects mismatched paths before RPC', async () => {
  expect((await reconcileExecution(request(), { attemptId: '00000000-0000-4000-8000-000000000002' })).status).toBe(400);
  expect((await reconcileExecution(request(), { runId: 'other-run', legId: 'leg' })).status).toBe(404);
  mocks.getAttempt.mockResolvedValue(null);
  expect((await reconcileExecution(request(), { attemptId: id })).status).toBe(404);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it('retains terminal journal evidence when later chain history is unavailable', async () => {
  mocks.getAttempt.mockResolvedValue({ ...found(), attempt: { ...found().attempt, state: 'confirmed' } });
  mocks.rpc.mockRejectedValue(new Error('timeout'));
  expect(await (await reconcileExecution(request(), { attemptId: id })).json()).toMatchObject({ state: 'unknown' });
  expect(mocks.transitionAttempt).not.toHaveBeenCalled();
});
