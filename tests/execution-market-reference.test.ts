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
it('does not dispatch without configured execution provider access', async () => {
  vi.stubEnv('JUPITER_API_KEY', '');
  vi.stubEnv('LOTLINE_EXECUTION_KEYLESS_JUPITER', '');
  await expect(executeOnJupiter('signed-bytes', 'request', 'signature')).rejects.toThrow('explicit keyless execution access');
  expect(mocks.reserve).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it('uses no blank key header for explicit keyless dispatch and still checks queued expiry', async () => {
  vi.stubEnv('JUPITER_API_KEY', '');
  vi.stubEnv('LOTLINE_EXECUTION_KEYLESS_JUPITER', 'true');
  const signature = '1'.repeat(88);
  const guard = vi.fn(() => requireCurrentReview(now + 60000));
  mocks.fetch.mockResolvedValue({ status: 'Success', signature });
  await expect(executeOnJupiter('signed-bytes', 'request', signature, '123', guard)).resolves.toMatchObject({ signature });
  const [url, options] = mocks.fetch.mock.calls[0];
  expect(url).toBe('https://api.jup.ag/swap/v2/execute');
  expect(options.headers).toEqual({ 'content-type': 'application/json' });
  expect(JSON.parse(options.body)).toEqual({ signedTransaction: 'signed-bytes', requestId: 'request', lastValidBlockHeight: '123' });
  expect(guard).toHaveBeenCalledOnce();
  mocks.fetch.mockClear();
  mocks.reserve.mockImplementation(async () => { vi.setSystemTime(now + 60000); });
  await expect(executeOnJupiter('signed-bytes', 'request', signature, undefined, guard)).rejects.toThrow('expired');
  expect(mocks.fetch).not.toHaveBeenCalled();
});
