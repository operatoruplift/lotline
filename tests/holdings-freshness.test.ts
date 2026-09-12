import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../lib/server/catalog', () => ({ selectedAssets: async () => [] }));
vi.mock('../lib/server/solana', () => ({ loadRawBalance: async () => { vi.setSystemTime(Date.now() + 10_000); return '100'; }, convertRawUnits: async () => '1' }));
afterEach(() => vi.useRealTimers());
it('dates a sequential balance snapshot from its first read and keeps it on cache hits', async () => {
  vi.useFakeTimers(); const started = Date.now();
  const { getHoldings } = await import('../lib/server/holdings');
  const owner = '11111111111111111111111111111111';
  const mint = 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp';
  const result = await getHoldings(owner,[mint]);
  expect(Date.now()).toBe(started + 20_000);
  expect(Date.parse(result.fetchedAt)).toBe(started);
  expect((await getHoldings(owner,[mint])).fetchedAt).toBe(result.fetchedAt);
});
