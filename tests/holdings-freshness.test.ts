import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../lib/server/catalog', () => ({ selectedAssets: async () => [] }));
vi.mock('../lib/server/solana', () => ({ loadRawBalanceWithContext: async () => { vi.setSystemTime(Date.now() + 10_000); return { raw: '100', slot: 123, frozenRaw: '0', accountCount: 1 }; }, convertRawUnitsWithContext: async () => ({ units: '1', context: { source: 'clock-sysvar', kind: 'scaled', decimals: 8, tokenProgram: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', mintSlot: 123, clockSlot: 123, unixTimestamp: '1789840000', multiplier: 1, observedAt: new Date().toISOString() } }) }));
afterEach(() => vi.useRealTimers());
it('dates a sequential balance snapshot from its first read and keeps it on cache hits', async () => {
  vi.useFakeTimers(); const started = Date.now();
  const { getHoldings } = await import('../lib/server/holdings');
  const owner = '11111111111111111111111111111111';
  const mint = 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp';
  const result = await getHoldings(owner,[mint]);
  expect(Date.now()).toBe(started + 20_000);
  expect(Date.parse(result.fetchedAt)).toBe(started);
  expect(result.holdings[0]).toMatchObject({ balanceSlot: 123, unitContext: { clockSlot: 123, multiplier: 1 } });
  expect((await getHoldings(owner,[mint])).fetchedAt).toBe(result.fetchedAt);
});
