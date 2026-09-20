import { expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { PRESTOCK_REGISTRY } from '../lib/domain/prestocks';
import { getPreStocksCatalog, getPreStocksQuotes, getPreStocksUnits } from '../lib/server/prestocks';

/** Explicit opt-in only: public issuer/mint reads and one Jupiter quote without taker. */
it.skipIf(process.env.LOTLINE_PRESTOCKS_LIVE !== '1')('verifies the PreStocks adapter against live issuer, chain, and quote data', async () => {
  const startedAt = new Date().toISOString();
  const catalog = await getPreStocksCatalog();
  expect(catalog.state).toBe('success'); expect(catalog.assets).toHaveLength(PRESTOCK_REGISTRY.length);
  const asset = catalog.assets.find(item => item.symbol === 'OPENAI')!;
  expect(asset.halted).toBeNull();
  const quotes = await getPreStocksQuotes([{ mint: asset.mint, usdcRaw: '10000000' }]);
  const quote = quotes.quotes[0];
  const projected = quote.outRaw ? await getPreStocksUnits([{ mint: asset.mint, raw: quote.outRaw }]) : null;
  const evidence = { startedAt, completedAt: new Date().toISOString(), catalog, quotes, projected, quoteRequest: { endpoint: 'https://api.jup.ag/swap/v2/order', inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', outputMint: asset.mint, amount: '10000000', takerIncluded: false }, transactionsSigned: 0, transactionsSubmitted: 0 };
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
  await writeFile(new URL('../test-results/prestocks-live-smoke.json', import.meta.url), `${JSON.stringify(evidence, null, 2)}\n`);
  expect(quote.state).toBe('success'); expect(quote.units).not.toBeNull(); expect(quote.unitContext?.kind).toBe('scaled');
  expect(projected?.state).toBe('success');
}, 120_000);
