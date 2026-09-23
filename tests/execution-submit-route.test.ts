import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), transition: vi.fn(), submitted: vi.fn(), execute: vi.fn(), validate: vi.fn(), proof: vi.fn(), wallet: vi.fn(), references: vi.fn() }));
vi.mock('@/lib/server/execution/market-reference', async importOriginal => ({ ...await importOriginal<object>(), requirePythReview: mocks.references }));
vi.mock('@/lib/server/execution/proof-policy', () => ({ requireSemanticProof: mocks.proof }));
vi.mock('@/lib/server/execution/config', () => ({ requireExecutionWallet: mocks.wallet }));
vi.mock('@/lib/server/execution/repository', () => ({ getAttemptByRequestId: mocks.get, transitionAttempt: mocks.transition, recordSubmitted: mocks.submitted }));
vi.mock('@/lib/server/execution/submit', () => ({ executeOnJupiter: mocks.execute, validateSignedTransaction: mocks.validate }));
vi.mock('@/lib/server/execution/http', () => ({
  ensureExecutionEnabled: () => ({ config: {} }),
  requireSameOrigin() {}, requireExecutionOwner: async () => ({ kind: 'user', id: 'owner' }), enforceExecutionRateLimit: async () => {},
  json: (body: unknown, status = 200) => Response.json(body, { status }), failure: () => Response.json({ state: 'unavailable' }, { status: 503 }),
}));
import { POST } from '../app/api/execution/runs/[runId]/legs/[legId]/execute/route';
import { ReviewExpiredBeforeDispatch } from '../lib/server/execution/market-reference';

const messageHash = 'a'.repeat(64);
const request = () => new Request('https://lotline.test/api/execution/runs/run/legs/leg/execute', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId: 'request', signedTransaction: 'c2lnbmVk', messageHash }) });
const context = { params: Promise.resolve({ runId: 'run', legId: 'leg' }) };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.get.mockResolvedValue({ run: { id: 'run', wallet: 'wallet' }, leg: { id: 'leg' }, attempt: { id: 'attempt', state: 'review-required', provider_request_id: 'request', transaction_message_hash: messageHash, evidence: { transaction: 'approved' } } });
  mocks.validate.mockResolvedValue({ encoded: 'exact-signed-bytes', chainSignature: 'original-signature', signedTransactionHash: 'signed-hash' });
});

it('keeps provider-reported failure unresolved until the original signature is checked', async () => {
  mocks.execute.mockResolvedValue({ status: 'Failed', code: -1 });
  expect(await (await POST(request(), context)).json()).toMatchObject({ state: 'unknown', signature: 'original-signature' });
  expect(mocks.transition.mock.calls.map(args => args[2])).toEqual(['awaiting-wallet', 'signed', 'unknown']);
  expect(mocks.transition.mock.calls[1][3]).toMatchObject({ signedTransactionHash: 'signed-hash' });
  expect(mocks.submitted).not.toHaveBeenCalled();
});

it('persists ambiguity before returning a lost provider response', async () => {
  mocks.execute.mockRejectedValue(new Error('timeout'));
  expect((await POST(request(), context)).status).toBe(503);
  expect(mocks.transition.mock.calls.map(args => args[2])).toEqual(['awaiting-wallet', 'signed', 'unknown']);
});

it('requires the durable signed transition before any provider submission', async () => {
  mocks.transition.mockImplementation(async (_owner, _id, state) => { if (state === 'signed') throw new Error('journal write failed'); });
  expect((await POST(request(), context)).status).toBe(503);
  expect(mocks.execute).not.toHaveBeenCalled();
});

it('rejects an old unproved attempt before accepting a signature or transmitting bytes', async () => {
  mocks.proof.mockImplementation(() => { throw new Error('legacy proof'); });
  expect((await POST(request(), context)).status).toBe(503);
  expect(mocks.validate).not.toHaveBeenCalled();
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(mocks.transition).not.toHaveBeenCalled();
});
it('enforces restricted participant access on direct submission requests', async () => {
  mocks.wallet.mockImplementation(() => { throw new Error('unapproved participant'); });
  expect((await POST(request(), context)).status).toBe(503);
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(mocks.transition).not.toHaveBeenCalled();
});
it('blocks direct submission before any signing transition when Pyth references are unavailable', async () => {
  mocks.references.mockRejectedValue(new Error('stale references'));
  expect((await POST(request(), context)).status).toBe(503);
  expect(mocks.validate).not.toHaveBeenCalled();
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(mocks.transition).not.toHaveBeenCalled();
});
it('records known local non-transmission while preserving the original signed receipt lock', async () => {
  mocks.execute.mockRejectedValue(new ReviewExpiredBeforeDispatch());
  const response = await POST(request(), context);
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ state: 'unknown', signature: 'original-signature' });
  expect(mocks.transition.mock.calls.at(-1)?.[3]).toMatchObject({ lotlineTransmitted: false });
  expect(mocks.submitted).not.toHaveBeenCalled();
});
