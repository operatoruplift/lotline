import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PYTH_USDC_FEED_ID, marketReferenceResponseSchema, pythObservationSchema } from '../lib/domain/market-reference';
import { PRICE_UPDATE_V2_DISCRIMINATOR, PRICE_UPDATE_V2_LENGTH, decodePriceUpdateV2, parseReceiverAccount, priceDivergenceBps, receiverAddress } from '../lib/server/pyth-onchain';
import { AAPL_MAPPING, AAPL_TOKEN_RECEIVER_ACCOUNT, AAPL_UNDERLYING_RECEIVER_ACCOUNT, USDC_RECEIVER_ACCOUNT, USDC_RECEIVER_BASE64, USDC_RECEIVER_DECODED, USDC_RECEIVER_FETCHED_AT, receiverAccountJson, rpcResponder } from './fixtures/pyth-onchain';

const fixtureNow = Date.parse(USDC_RECEIVER_FETCHED_AT);
const bytes = () => Buffer.from(USDC_RECEIVER_BASE64, 'base64');
// Borsh offsets for a Full-verified account: tag at 40, feed id 41..73, then the numeric fields.
const OFFSET = { tag: 40, price: 73, conf: 81, expo: 89, publish: 93, prev: 101 };
function mutated(change: (buffer: Buffer) => void): Buffer { const buffer = bytes(); change(buffer); return buffer; }

beforeEach(() => { vi.resetModules(); vi.stubEnv('SOLANA_RPC_URL', ''); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('decodes the pinned mainnet USDC/USD receiver account exactly', () => {
  const buffer = bytes();
  expect(buffer).toHaveLength(PRICE_UPDATE_V2_LENGTH);
  expect(buffer.subarray(0, 8).toString('hex')).toBe(PRICE_UPDATE_V2_DISCRIMINATOR);
  expect(decodePriceUpdateV2(buffer, PYTH_USDC_FEED_ID, fixtureNow)).toEqual(USDC_RECEIVER_DECODED);
  expect(parseReceiverAccount(receiverAccountJson(), PYTH_USDC_FEED_ID, fixtureNow)).toEqual(USDC_RECEIVER_DECODED);
  // Only the reference Solana sysvar-free decode is used: no publish time is borrowed from the clock.
  expect(USDC_RECEIVER_DECODED.publishTime * 1000).toBeLessThan(fixtureNow);
});
it('derives the sponsored receiver addresses from the push-oracle program, shard zero and the feed id', async () => {
  await expect(receiverAddress(PYTH_USDC_FEED_ID)).resolves.toBe(USDC_RECEIVER_ACCOUNT);
  await expect(receiverAddress(AAPL_MAPPING.underlying)).resolves.toBe(AAPL_UNDERLYING_RECEIVER_ACCOUNT);
  await expect(receiverAddress(AAPL_MAPPING.token)).resolves.toBe(AAPL_TOKEN_RECEIVER_ACCOUNT);
  await expect(receiverAddress(PYTH_USDC_FEED_ID, 1)).resolves.not.toBe(USDC_RECEIVER_ACCOUNT);
  for (const feedId of ['', 'a'.repeat(63), 'g'.repeat(64), PYTH_USDC_FEED_ID.toUpperCase()]) expect(() => receiverAddress(feedId)).toThrow('feed id is invalid');
  expect(() => receiverAddress(PYTH_USDC_FEED_ID, 65_536)).toThrow('feed id is invalid');
});
it.each<[string, Buffer]>([
  ['one byte short', bytes().subarray(0, PRICE_UPDATE_V2_LENGTH - 1)],
  ['one byte long', Buffer.concat([bytes(), Buffer.from([0])])],
  ['a different discriminator', mutated(buffer => { buffer[0] ^= 0xff; })],
  ['partial verification', mutated(buffer => { buffer[OFFSET.tag] = 0; })],
  ['an unknown verification tag', mutated(buffer => { buffer[OFFSET.tag] = 2; })],
  ['a zero price', mutated(buffer => { buffer.writeBigInt64LE(0n, OFFSET.price); })],
  ['a negative price', mutated(buffer => { buffer.writeBigInt64LE(-1n, OFFSET.price); })],
  ['confidence equal to price', mutated(buffer => { buffer.writeBigUInt64LE(BigInt(USDC_RECEIVER_DECODED.price), OFFSET.conf); })],
  ['an exponent above twelve', mutated(buffer => { buffer.writeInt32LE(13, OFFSET.expo); })],
  ['an exponent below minus twelve', mutated(buffer => { buffer.writeInt32LE(-13, OFFSET.expo); })],
  ['a zero publish time', mutated(buffer => { buffer.writeBigInt64LE(0n, OFFSET.publish); })],
  ['a publish time beyond 2100', mutated(buffer => { buffer.writeBigInt64LE(4_102_444_801n, OFFSET.publish); })],
  ['a previous publish time after the publish time', mutated(buffer => { buffer.writeBigInt64LE(BigInt(USDC_RECEIVER_DECODED.publishTime + 1), OFFSET.prev); })],
])('rejects an account with %s before any price is read', (_label, buffer) => {
  expect(() => decodePriceUpdateV2(buffer, PYTH_USDC_FEED_ID, fixtureNow)).toThrow('could not be verified');
});
it('rejects a feed id mismatch, a future publish time and an unusable clock', () => {
  expect(() => decodePriceUpdateV2(bytes(), AAPL_MAPPING.underlying, fixtureNow)).toThrow('could not be verified');
  expect(() => decodePriceUpdateV2(bytes(), PYTH_USDC_FEED_ID, (USDC_RECEIVER_DECODED.publishTime - 1) * 1000)).toThrow('could not be verified');
  expect(() => decodePriceUpdateV2(bytes(), PYTH_USDC_FEED_ID, Number.NaN)).toThrow('could not be verified');
  expect(decodePriceUpdateV2(bytes(), PYTH_USDC_FEED_ID, USDC_RECEIVER_DECODED.publishTime * 1000).publishTime).toBe(USDC_RECEIVER_DECODED.publishTime);
});
it.each([
  { owner: 'pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT' }, { executable: true }, { data: [USDC_RECEIVER_BASE64, 'base58'] }, { data: ['not base64!', 'base64'] }, { lamports: -1 },
])('rejects a receiver account with %j', changes => {
  expect(() => parseReceiverAccount(receiverAccountJson(changes), PYTH_USDC_FEED_ID, fixtureNow)).toThrow('could not be verified');
  expect(() => parseReceiverAccount(null, PYTH_USDC_FEED_ID, fixtureNow)).toThrow('could not be verified');
});
it('measures price divergence in basis points with integer arithmetic across exponents', () => {
  expect(priceDivergenceBps({ price: '99991510', exponent: -8 }, { price: '99991510', exponent: -8 })).toBe(0n);
  expect(priceDivergenceBps({ price: '10100', exponent: -2 }, { price: '10000', exponent: -2 })).toBe(99n);
  expect(priceDivergenceBps({ price: '10000', exponent: -2 }, { price: '10100', exponent: -2 })).toBe(100n);
  expect(priceDivergenceBps({ price: '1', exponent: 0 }, { price: '100', exponent: -2 })).toBe(0n);
  expect(priceDivergenceBps({ price: '99990000', exponent: -8 }, { price: '99991510', exponent: -8 })).toBe(0n);
  expect(priceDivergenceBps({ price: '98000000', exponent: -8 }, { price: '99991510', exponent: -8 })).toBe(203n);
  for (const invalid of [{ price: '0', exponent: 0 }, { price: '-1', exponent: 0 }, { price: 'x', exponent: 0 }, { price: '1', exponent: 13 }, { price: '1', exponent: 0.5 }]) {
    expect(() => priceDivergenceBps(invalid, { price: '1', exponent: 0 })).toThrow('comparison inputs are invalid');
    expect(() => priceDivergenceBps({ price: '1', exponent: 0 }, invalid)).toThrow('comparison inputs are invalid');
  }
});
it('reads, labels, caches and ages the on-chain currency observation from the original publish time', async () => {
  vi.stubEnv('SOLANA_RPC_URL', 'https://rpc.example');
  // Read 56 seconds after publication: fresh now, and the five-second cache still holds at the 60-second boundary.
  const readAt = (USDC_RECEIVER_DECODED.publishTime + 56) * 1000;
  vi.useFakeTimers(); vi.setSystemTime(readAt);
  const fetcher = vi.fn(rpcResponder()); vi.stubGlobal('fetch', fetcher);
  const { readOnchainUsdcObservation, readReceiverAccount } = await import('../lib/server/pyth-onchain');
  const request = readOnchainUsdcObservation();
  await vi.advanceTimersByTimeAsync(1000);
  const observation = await request;
  expect(observation).toMatchObject({ provenance: 'solana-receiver', feedId: PYTH_USDC_FEED_ID, symbol: 'Crypto.USDC/USD', kind: 'currency', unitBasis: 'usdc-unit', quoteCurrency: 'USD', price: '99991510', confidence: '16490', exponent: -8, displayPrice: '0.9999151', displayConfidence: '0.0001649', publishTime: USDC_RECEIVER_DECODED.publishTime, publishedAt: '2026-09-26T05:59:33.000Z', expiresAt: '2026-09-26T06:00:33.000Z', state: 'fresh' });
  expect(pythObservationSchema.safeParse(observation).success).toBe(true);
  expect(marketReferenceResponseSchema.safeParse({ source: 'pyth', state: 'partial', fetchedAt: observation!.fetchedAt, expiresAt: observation!.expiresAt, items: [], usdc: observation }).success).toBe(true);
  const methods = fetcher.mock.calls.map(([, init]) => (JSON.parse(String((init as RequestInit).body)) as { method: string }).method);
  expect(methods).toEqual(['getGenesisHash', 'getMultipleAccounts']);
  const [, accountsInit] = fetcher.mock.calls[1] as unknown as [string, RequestInit];
  expect(JSON.parse(String(accountsInit.body)).params).toEqual([[USDC_RECEIVER_ACCOUNT], { encoding: 'base64', commitment: 'confirmed' }]);
  const read = await readReceiverAccount(PYTH_USDC_FEED_ID);
  expect(read).toMatchObject({ ...USDC_RECEIVER_DECODED, account: USDC_RECEIVER_ACCOUNT, slot: 450587581 });
  expect(fetcher).toHaveBeenCalledTimes(2);
  vi.setSystemTime(Date.parse('2026-09-26T06:00:33.000Z'));
  expect((await readOnchainUsdcObservation())?.state).toBe('stale');
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('resolves to no observation without a configured RPC, off mainnet, or for a missing or foreign account', async () => {
  const silent = vi.fn(); vi.stubGlobal('fetch', silent);
  const inert = await import('../lib/server/pyth-onchain');
  expect(await inert.readOnchainUsdcObservation()).toBeUndefined(); expect(silent).not.toHaveBeenCalled();
  vi.stubEnv('SOLANA_RPC_URL', 'https://rpc.example');
  vi.useFakeTimers(); vi.setSystemTime(fixtureNow);
  const cases: [unknown[], string | undefined][] = [
    [[null], undefined],
    [[receiverAccountJson({ owner: 'pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT' })], undefined],
    [[receiverAccountJson()], '4'.repeat(43)],
    [[receiverAccountJson(), receiverAccountJson()], undefined],
  ];
  for (const [accounts, genesis] of cases) {
    vi.resetModules();
    const fetcher = vi.fn(rpcResponder(accounts, genesis)); vi.stubGlobal('fetch', fetcher);
    const { readOnchainUsdcObservation } = await import('../lib/server/pyth-onchain');
    const request = readOnchainUsdcObservation();
    await vi.advanceTimersByTimeAsync(1000);
    expect(await request).toBeUndefined();
    if (genesis) expect(fetcher).toHaveBeenCalledTimes(1);
  }
});
