import 'server-only';
import { address, getProgramDerivedAddress } from '@solana/kit';
import { z } from 'zod';
import { PYTH_USDC_FEED_ID, buildPythObservation, type PythObservation } from '../domain/market-reference';
import { BoundedCache, ServiceError } from './common';
import { rpcConfigured, rpcRequest, verifyMainnetRpc } from './solana';

/**
 * Keyless Pyth reads from Solana mainnet.
 *
 * Pyth sponsors PriceUpdateV2 accounts for a set of feeds. Each is a PDA of the
 * push-oracle program with seeds [shard u16 little-endian, feed id] and is owned by
 * the receiver program. Reading one is an ordinary account read through the RPC
 * the app already verifies, with no Pyth credential involved. The bytes carry the
 * feed id, the aggregate price, its confidence, exponent and original publish
 * time, plus the verification level the receiver applied when it posted them.
 *
 * Program ids: pyth-crosschain target_chains/solana/pyth_solana_receiver_sdk
 * (PYTH_PUSH_ORACLE_ID) and target_chains/solana/programs/pyth-solana-receiver.
 */
export const PYTH_PUSH_ORACLE_PROGRAM = 'pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT';
export const PYTH_RECEIVER_PROGRAM = 'rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ';
/** sha256('account:PriceUpdateV2')[0..8]: the Anchor account discriminator. */
export const PRICE_UPDATE_V2_DISCRIMINATOR = '22f123639d7ef4cd';
/** Anchor allocates the widest enum variant, so a Full-verified account carries one pad byte. */
export const PRICE_UPDATE_V2_LENGTH = 134;
export const PYTH_SPONSORED_SHARD = 0;
/**
 * A keyed Hermes read and the on-chain post describe the same aggregate within
 * the 60-second window, so a wider gap than this marks a read that cannot be
 * trusted as the USDC/USD leg of a benchmark.
 */
export const USDC_CROSS_CHECK_MAX_BPS = 100n;
const MAX_PUBLISH_TIME = 4_102_444_800;
const CACHE_TTL_MS = 5000;

const accountSchema = z.object({
  data: z.tuple([z.string().max(4096).regex(/^[A-Za-z0-9+/]*={0,2}$/), z.literal('base64')]),
  owner: z.string(), executable: z.boolean(), lamports: z.number().nonnegative(),
});
const multipleAccountsSchema = z.object({
  context: z.object({ slot: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }),
  value: z.array(accountSchema.nullable()).max(100),
});

export type PriceUpdateV2 = {
  feedId: string; price: string; confidence: string; exponent: number; publishTime: number;
  prevPublishTime: number; emaPrice: string; emaConfidence: string; postedSlot: string; verification: 'full';
};
export type ReceiverRead = PriceUpdateV2 & { account: string; fetchedAt: string; slot: number };

const pdaCache = new Map<string, Promise<string>>();
const readCache = new BoundedCache<ReceiverRead>(8);
const pending = new Map<string, Promise<ReceiverRead | undefined>>();

/** PDA of the sponsored account for one feed on shard 0. Deterministic; cached per feed. */
export function receiverAddress(feedId: string, shard = PYTH_SPONSORED_SHARD): Promise<string> {
  if (!/^[a-f0-9]{64}$/.test(feedId) || !Number.isInteger(shard) || shard < 0 || shard > 0xffff) throw new ServiceError('invalid-input', 'The Pyth feed id is invalid.');
  const key = `${shard}:${feedId}`;
  let derived = pdaCache.get(key);
  if (!derived) {
    const shardBytes = new Uint8Array([shard & 0xff, shard >> 8]);
    derived = getProgramDerivedAddress({ programAddress: address(PYTH_PUSH_ORACLE_PROGRAM), seeds: [shardBytes, Uint8Array.from(Buffer.from(feedId, 'hex'))] }).then(([pda]) => pda as string);
    pdaCache.set(key, derived);
  }
  return derived;
}

/**
 * Borsh layout: 8 discriminator | 32 write_authority | VerificationLevel
 * (u8 tag; Partial = 0 carries a u8 num_signatures, Full = 1) | 32 feed_id |
 * i64 price | u64 conf | i32 expo | i64 publish_time | i64 prev_publish_time |
 * i64 ema_price | u64 ema_conf | u64 posted_slot. Only Full-verified posts for
 * the expected feed pass; everything else is rejected before any price is read.
 */
export function decodePriceUpdateV2(bytes: Uint8Array, expectedFeedId: string, now = Date.now()): PriceUpdateV2 {
  const reject = (): never => { throw new ServiceError('unavailable', 'The Pyth receiver account could not be verified.'); };
  if (bytes.length !== PRICE_UPDATE_V2_LENGTH || !/^[a-f0-9]{64}$/.test(expectedFeedId) || !Number.isFinite(now)) reject();
  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.subarray(0, 8).toString('hex') !== PRICE_UPDATE_V2_DISCRIMINATOR) reject();
  const tag = view.readUInt8(40);
  if (tag !== 1) reject();
  let offset = 41;
  const feedId = view.subarray(offset, offset + 32).toString('hex'); offset += 32;
  if (feedId !== expectedFeedId) reject();
  const price = view.readBigInt64LE(offset); offset += 8;
  const confidence = view.readBigUInt64LE(offset); offset += 8;
  const exponent = view.readInt32LE(offset); offset += 4;
  const publishTime = view.readBigInt64LE(offset); offset += 8;
  const prevPublishTime = view.readBigInt64LE(offset); offset += 8;
  const emaPrice = view.readBigInt64LE(offset); offset += 8;
  const emaConfidence = view.readBigUInt64LE(offset); offset += 8;
  const postedSlot = view.readBigUInt64LE(offset); offset += 8;
  if (offset !== PRICE_UPDATE_V2_LENGTH - 1) reject();
  if (price <= 0n || confidence >= price || exponent < -12 || exponent > 12) reject();
  if (publishTime < 1n || publishTime > BigInt(MAX_PUBLISH_TIME) || publishTime > BigInt(Math.floor(now / 1000))) reject();
  if (prevPublishTime < 0n || prevPublishTime > publishTime) reject();
  return {
    feedId, price: price.toString(), confidence: confidence.toString(), exponent, publishTime: Number(publishTime),
    prevPublishTime: Number(prevPublishTime), emaPrice: emaPrice.toString(), emaConfidence: emaConfidence.toString(), postedSlot: postedSlot.toString(), verification: 'full',
  };
}

/** Owner and executable flags are checked before the bytes are decoded. */
export function parseReceiverAccount(account: unknown, expectedFeedId: string, now = Date.now()): PriceUpdateV2 {
  const parsed = accountSchema.safeParse(account);
  if (!parsed.success || parsed.data.executable || parsed.data.owner !== PYTH_RECEIVER_PROGRAM) throw new ServiceError('unavailable', 'The Pyth receiver account could not be verified.');
  return decodePriceUpdateV2(Buffer.from(parsed.data.data[0], 'base64'), expectedFeedId, now);
}

/** |a − b| relative to a, in basis points, rounded down; exponents may differ. */
export function priceDivergenceBps(a: Pick<PythObservation, 'price' | 'exponent'>, b: Pick<PythObservation, 'price' | 'exponent'>): bigint {
  for (const observation of [a, b]) {
    if (!/^[1-9][0-9]{0,18}$/.test(observation.price) || !Number.isInteger(observation.exponent) || Math.abs(observation.exponent) > 12) throw new ServiceError('unavailable', 'The Pyth price comparison inputs are invalid.');
  }
  const commonExponent = Math.min(a.exponent, b.exponent);
  const scaledA = BigInt(a.price) * 10n ** BigInt(a.exponent - commonExponent);
  const scaledB = BigInt(b.price) * 10n ** BigInt(b.exponent - commonExponent);
  const difference = scaledA > scaledB ? scaledA - scaledB : scaledB - scaledA;
  return difference * 10_000n / scaledA;
}

/**
 * One confirmed read of one sponsored account. Coalesced and cached for five
 * seconds; the original publish time, never the cache, governs freshness. Any
 * failure resolves to undefined so a keyed Hermes response is never taken down
 * by the RPC, and a keyless response carries no invented observation.
 */
export async function readReceiverAccount(feedId: string): Promise<ReceiverRead | undefined> {
  if (!rpcConfigured()) return undefined;
  const cached = readCache.get(feedId);
  if (cached) return cached;
  let promise = pending.get(feedId);
  if (!promise) {
    promise = (async () => {
      await verifyMainnetRpc();
      const account = await receiverAddress(feedId);
      const fetchedAt = new Date().toISOString();
      const parsed = multipleAccountsSchema.safeParse(await rpcRequest('getMultipleAccounts', [[account], { encoding: 'base64', commitment: 'confirmed' }]));
      if (!parsed.success || parsed.data.value.length !== 1 || !parsed.data.value[0]) throw new ServiceError('unavailable', 'The Pyth receiver account could not be verified.');
      const read = { ...parseReceiverAccount(parsed.data.value[0], feedId), account, fetchedAt, slot: parsed.data.context.slot };
      readCache.set(feedId, read, CACHE_TTL_MS);
      return read;
    })().catch(() => undefined).finally(() => pending.delete(feedId));
    pending.set(feedId, promise);
  }
  return promise;
}

/** The pinned Crypto.USDC/USD feed as a labelled observation, or undefined. */
export async function readOnchainUsdcObservation(now = Date.now()): Promise<PythObservation | undefined> {
  const read = await readReceiverAccount(PYTH_USDC_FEED_ID);
  if (!read) return undefined;
  return buildPythObservation({ feedId: read.feedId, symbol: 'Crypto.USDC/USD', kind: 'currency', price: read.price, confidence: read.confidence, exponent: read.exponent, publishTime: read.publishTime, fetchedAt: read.fetchedAt, provenance: 'solana-receiver' }, now);
}
