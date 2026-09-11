import { expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { getCatalog } from '../lib/server/catalog';
import { getHoldings, getUnits } from '../lib/server/holdings';
import { getQuotes } from '../lib/server/quotes';

/** Explicit opt-in only. Reads mainnet/issuer data and requests one quote; never signs or executes. */
it.skipIf(process.env.LOTLINE_LIVE_SMOKE !== '1')('real issuer, chain holdings, mint scaling and keyless quote smoke', async () => {
  // Public address read from AAPLx's onchain mintAuthority during verification. This is not a sample user wallet.
  const owner = '7pt9tkctJPK7PPNQJ77GKg8ZffSF6QxoMiCFYHxrtaCj';
  const startedAt = new Date().toISOString();
  const catalog = await getCatalog();
  const mint = catalog.assets.find(asset => asset.symbol === 'AAPLx')?.mint;
  const holdings = mint ? await getHoldings(owner, [mint]) : null;
  const quotes = mint ? await getQuotes([{ mint, usdcRaw: '10000000' }]) : null;
  const raw = holdings?.holdings[0]?.raw;
  const outRaw = quotes?.quotes[0]?.outRaw;
  const projected = mint && raw !== null && raw !== undefined && outRaw ? await getUnits([{ mint, raw: (BigInt(raw) + BigInt(outRaw)).toString() }]) : null;
  const evidence = { startedAt, completedAt: new Date().toISOString(), owner, ownerSource: 'AAPLx onchain mintAuthority; independently public address, not a user wallet or purchase.', rpc: 'Configured SOLANA_RPC_URL (value intentionally omitted)', jupiterKeyConfigured: Boolean(process.env.JUPITER_API_KEY), quoteRequest: { endpoint: 'https://api.jup.ag/swap/v2/order', inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', outputMint: mint, amount: '10000000', takerIncluded: false }, catalog, holdings, quotes, projected, transactionsSigned: 0, transactionsSubmitted: 0 };
  await writeFile(new URL('../docs/live-smoke.json', import.meta.url), `${JSON.stringify(evidence, null, 2)}\n`);
  expect(catalog.assets).toHaveLength(6);
  expect(holdings?.state).toBe('success');
  expect(quotes?.quotes[0]?.state).toBe('success');
  expect(quotes?.quotes[0]?.units).not.toBeNull();
  expect(projected?.state).toBe('success');
}, 120_000);
