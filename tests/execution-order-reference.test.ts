import { createHash } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), create: vi.fn(), transition: vi.fn(), order: vi.fn(), references: vi.fn() }));
vi.mock('@/lib/server/catalog', () => ({ getIssuerAsset: vi.fn(), selectedAssets: vi.fn() }));
vi.mock('@/lib/server/execution/repository', () => ({ getSnapshot: mocks.snapshot, createAttempt: mocks.create, transitionAttempt: mocks.transition }));
vi.mock('@/lib/server/execution/orders', () => ({ createExecutionOrder: mocks.order }));
vi.mock('@/lib/server/execution/proof-policy', () => ({ requireSemanticProof() {} }));
vi.mock('@/lib/server/execution/config', () => ({ requireExecutionWallet() {} }));
vi.mock('@/lib/server/execution/market-reference', async importOriginal => ({ ...await importOriginal<object>(), requirePythReview: mocks.references }));
vi.mock('@/lib/server/execution/http', () => ({
  ensureExecutionEnabled: () => ({ config: { limits: {} } }), requireSameOrigin() {},
  requireExecutionOwner: async () => ({ kind: 'user', id: 'owner' }), enforceExecutionRateLimit: async () => {},
  json: (body: unknown, status = 200) => Response.json(body, { status }), failure: () => Response.json({ state: 'unavailable' }, { status: 503 }),
}));
import { canonicalIntent } from '../lib/domain/execution';
import { executionFixture } from './execution-fixtures';
import { POST } from '../app/api/execution/runs/[runId]/legs/[legId]/order/route';

beforeEach(() => vi.resetAllMocks());
it.each([false, true])('blocks a %s reused order without fresh references before any transaction is returned', async reused => {
  const fixture = await executionFixture();
  mocks.snapshot.mockResolvedValue({
    run: { wallet: fixture.intent.wallet, intent_hash: createHash('sha256').update(canonicalIntent(fixture.intent)).digest('hex'), policy_version: fixture.intent.policyVersion },
    legs: [{ id: 'leg', mint: fixture.asset.mint, input_raw: '1000000', state: 'planned' }],
    attempts: reused ? [{ leg_id: 'leg', state: 'review-required', provider_expires_at: new Date(Date.now() + 30000).toISOString(), evidence: { transaction: fixture.unsignedBase64 } }] : [],
  });
  mocks.references.mockRejectedValue(new Error('stale references'));
  const request = new Request('https://lotline.test/api/execution/runs/run/legs/leg/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ intent: fixture.intent, mint: fixture.asset.mint }) });
  const response = await POST(request, { params: Promise.resolve({ runId: 'run', legId: 'leg' }) });
  expect(response.status).toBe(503);
  expect(await response.json()).not.toHaveProperty('transaction');
  expect(mocks.references).toHaveBeenCalledWith(fixture.asset.mint);
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.order).not.toHaveBeenCalled();
  expect(mocks.transition).not.toHaveBeenCalled();
});
