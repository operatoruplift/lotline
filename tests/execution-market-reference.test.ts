import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ references: vi.fn(), reserve: vi.fn(), fetch: vi.fn() }));
vi.mock('@/lib/server/pyth', async importOriginal => ({ ...await importOriginal<object>(), getMarketReferences: mocks.references }));
vi.mock('@/lib/server/provider-limits', () => ({ reserveProviderSlot: mocks.reserve }));
vi.mock('@/lib/server/common', async importOriginal => ({ ...await importOriginal<object>(), fetchJson: mocks.fetch }));
import { parsePythReferences, PYTH_FEEDS } from '../lib/server/pyth';
import { requirePythReview, requireCurrentReview } from '../lib/server/execution/market-reference';
import { executeOnJupiter } from '../lib/server/execution/submit';

const now = Date.parse('2026-09-23T14:00:00Z');
const mapping = PYTH_FEEDS[0];
function reference(age = 0) {
  return parsePythReferences({ parsed: [mapping.underlying, mapping.token].map(id => ({ id, price: { price: '20000', conf: '10', expo: -2, publish_time: now / 1000 - age } })) }, [mapping.mint], new Date(now).toISOString(), now);
}
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now); vi.stubEnv('JUPITER_API_KEY', 'test-only'); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it('requires mapped reference coverage and original fresh publish times', async () => {
  mocks.references.mockResolvedValue(reference());
  expect(await requirePythReview(mapping.mint)).toBe(now + 60000);
  mocks.references.mockResolvedValue(reference(60));
  await expect(requirePythReview(mapping.mint)).rejects.toThrow('Fresh Pyth');
  mocks.references.mockResolvedValue({ state: 'configuration-required', items: [] });
  await expect(requirePythReview(mapping.mint)).rejects.toThrow('Fresh Pyth');
});
it('does not invent a Pyth requirement for an unmapped asset', async () => {
  expect(await requirePythReview('XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB')).toBeNull();
  expect(mocks.references).not.toHaveBeenCalled();
});
it('checks reference and order expiry at the exact boundary', () => {
  expect(() => requireCurrentReview(now, new Date(now + 30000).toISOString())).toThrow('expired');
  expect(() => requireCurrentReview(now + 60000, new Date(now).toISOString())).toThrow('expired');
  expect(() => requireCurrentReview(now + 60000, new Date(now + 30000).toISOString())).not.toThrow();
});
it('never sends signed bytes when references expire while queued for Jupiter', async () => {
  mocks.reserve.mockImplementation(async () => { vi.setSystemTime(now + 60000); });
  await expect(executeOnJupiter('signed-bytes', 'request', 'signature', undefined, () => requireCurrentReview(now + 60000))).rejects.toThrow('expired');
  expect(mocks.reserve).toHaveBeenCalledOnce();
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it('dispatches only after the current-review guard passes', async () => {
  const guard = vi.fn(() => requireCurrentReview(now + 60000));
  const signature = '1'.repeat(88);
  mocks.fetch.mockResolvedValue({ status: 'Success', signature });
  await expect(executeOnJupiter('signed-bytes', 'request', signature, undefined, guard)).resolves.toMatchObject({ status: 'Success' });
  expect(guard).toHaveBeenCalledOnce();
  expect(mocks.reserve.mock.invocationCallOrder[0]).toBeLessThan(guard.mock.invocationCallOrder[0]);
  expect(guard.mock.invocationCallOrder[0]).toBeLessThan(mocks.fetch.mock.invocationCallOrder[0]);
});
