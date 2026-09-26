import 'server-only';
import { address, getAddressDecoder, getAddressEncoder, getBase58Decoder, getProgramDerivedAddress } from '@solana/kit';
import { BN, Program, type Idl } from '@coral-xyz/anchor';
import { DynamicBondingCurveIdl, swapQuote, type PoolConfig, type VirtualPool } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { z } from 'zod';
import { XSTOCK_REGISTRY } from '../domain/assets';
import { PRESTOCK_REGISTRY } from '../domain/prestocks';
import {
  DBC_ACCOUNT_SIZES, DBC_COPY, DBC_DISCRIMINATORS, DBC_FRESHNESS_MS, DBC_MAX_ITEMS, DBC_MAX_POOLS,
  DBC_OFFSETS, DBC_POOL_LOOKUPS, DBC_POOL_SLICE, DBC_PROGRAM_ID, dbcCliffFeeBps, dbcFeeBps, dbcProgressBps, dbcSourceLabel,
  type DbcConfigKind, type DbcItem, type DbcPointKind, type DbcPool, type DbcResponse, type DbcSwapEstimate,
} from '../domain/dbc';
import { addressSchema, BoundedCache, isBoundedRaw, safeMessage, ServiceError, SpacedQueue } from './common';
import { rpcConfigured, rpcRequest, verifyMainnetRpc } from './solana';

/**
 * Meteora Dynamic Bonding Curve reads, mirroring the Pyth adapter: one dedicated
 * spaced queue, a bounded cache, a program-owner assertion on every account, and a
 * source plus freshness label on every figure.
 *
 * Meteora publishes no HTTP API for DBC, so discovery is on-chain. The public
 * mainnet RPC throttles getProgramAccounts to roughly one call every 1.5 seconds,
 * hence the dedicated queue and the small per-request budgets. Nothing here builds,
 * signs or sends a transaction: the only SDK call is the pure exact-in swap quote.
 */
const CLOCK = 'SysvarC1ock11111111111111111111111111111111';
const CLOCK_OWNER = 'Sysvar1111111111111111111111111111111111111';
const BADGE_SEED = 'token_badge';
/** getProgramAccounts spacing for the public endpoint, with its own small backlog. */
const GPA_INTERVAL_MS = 1600;
const GPA_CAPACITY = 4;
/** Pool discovery spends at most this many getProgramAccounts calls per asset. */
const MAX_POOL_CALLS = 4;
const SNAPSHOT_TTL_MS = 5 * 60_000;
const MAX_PENDING = 4;
const MAX_DISCOVERED_CONFIGS = 20_000;
const U64_CEILING = 18_446_744_073_709_551_615n;
const U128_CEILING = 340_282_366_920_938_463_463_374_607_431_768_211_455n;

const gpaQueue = new SpacedQueue(GPA_INTERVAL_MS, GPA_CAPACITY);
const snapshots = new BoundedCache<DbcSnapshot>(32);
const pending = new Map<string, Promise<DbcSnapshot>>();
const xstockMints = new Map(XSTOCK_REGISTRY.map(asset => [asset.mint, asset.symbol]));
const prestockMints = new Set(PRESTOCK_REGISTRY.map(asset => asset.mint));
const badgeAddresses = new Map<string, Promise<string>>();

const base58 = getBase58Decoder();
const addressDecoder = getAddressDecoder();
const addressEncoder = getAddressEncoder();
const discriminatorFilterBytes = (bytes: readonly number[]) => base58.decode(Uint8Array.from(bytes));

const accountSchema = z.object({
  data: z.tuple([z.string().max(4096).regex(/^[A-Za-z0-9+/]*={0,2}$/), z.literal('base64')]),
  owner: z.string(), executable: z.boolean(), lamports: z.number().nonnegative(),
});
const contextSchema = z.object({ slot: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) });
const multipleAccountsSchema = z.object({ context: contextSchema, value: z.array(accountSchema.nullable()).max(100) });
const programAccountsSchema = z.object({
  context: contextSchema,
  value: z.array(z.object({ pubkey: addressSchema, account: accountSchema })).max(MAX_DISCOVERED_CONFIGS),
});

export const dbcRequestSchema = z.object({
  items: z.array(z.object({
    mint: addressSchema,
    quoteRaw: z.string().refine(value => isBoundedRaw(value)).optional(),
  }).strict()).min(1).max(DBC_MAX_ITEMS),
}).strict().refine(value => new Set(value.items.map(item => item.mint)).size === value.items.length);

type DiscoveredConfig = { config: string; kind: DbcConfigKind };
type DiscoveredPool = { pool: string; config: string; kind: DbcConfigKind; quoteReserve: bigint; migrated: boolean };
type PoolSnapshot = { pool: string; config: string; kind: DbcConfigKind; state: PoolStateView; curve: CurveConfigView; virtualPool: VirtualPool; poolConfig: PoolConfig };
type DbcSnapshot = {
  mint: string; quoteToken: boolean; badgeAccount: string;
  configCount: number; configsProbed: number; truncated: boolean;
  slot: number; fetchedAt: string; currentPoint: bigint; pointKind: DbcPointKind;
  pools: PoolSnapshot[];
};
/** Only the pool fields Lotline reports, each range-checked after decoding. */
type PoolStateView = { config: string; baseMint: string; baseReserve: bigint; quoteReserve: bigint; sqrtPrice: bigint; activationPoint: bigint; migrated: boolean };
/** Only the curve config fields Lotline reports, each range-checked after decoding. */
type CurveConfigView = { quoteMint: string; tokenDecimal: number; activationType: number; migrationQuoteThreshold: bigint; cliffFeeNumerator: bigint };
/** The SDK returns camelCase BN fields; the published IDL type spells them snake_case. */
type SwapResultView = { actualInputAmount: bigint; outputAmount: bigint; tradingFee: bigint; protocolFee: bigint; referralFee: bigint; minimumAmountOut: bigint };

/**
 * The IDL is stored snake_case and the SDK's pure functions read camelCase, which
 * is the conversion an Anchor Program applies on construction. The provider's
 * connection is a throwing stub: this program is a decoder, never a transport, so
 * every chain read stays on the app's verified, queued RPC.
 */
let programCoder: Program<Idl>['coder'] | undefined;
function accountsCoder(): Program<Idl>['coder'] {
  if (!programCoder) {
    const connection = new Proxy({}, { get(_target, property) { throw new ServiceError('unavailable', `The DBC decoder performs no chain access (${String(property)}).`); } });
    programCoder = new Program(DynamicBondingCurveIdl as Idl, { connection } as never).coder;
  }
  return programCoder;
}
type DbcAccountName = 'virtualPool' | 'transferHookPool' | 'poolConfig' | 'configWithTransferHook' | 'tokenBadge';
function decodeAccount<T>(name: DbcAccountName, bytes: Buffer): T {
  try { return accountsCoder().accounts.decode<T>(name, bytes); }
  catch { throw new ServiceError('unavailable', 'A Meteora DBC account could not be decoded.', 'provider-unavailable'); }
}
const unverified = (): never => { throw new ServiceError('unavailable', 'A Meteora DBC account could not be verified.', 'provider-unavailable'); };
/** Decoded numbers arrive as BN; only a bounded unsigned integer is accepted. */
function unsigned(value: unknown, ceiling: bigint): bigint {
  const text = typeof value === 'object' && value !== null && 'toString' in value ? String(value) : '';
  if (!/^(0|[1-9][0-9]{0,39})$/.test(text)) unverified();
  const parsed = BigInt(text);
  if (parsed > ceiling) unverified();
  return parsed;
}
function pubkey(value: unknown): string {
  const text = typeof value === 'object' && value !== null && 'toBase58' in value && typeof value.toBase58 === 'function' ? String(value.toBase58()) : '';
  if (!addressSchema.safeParse(text).success) unverified();
  return text;
}
function byte(value: unknown, maximum: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > maximum) unverified();
  return value as number;
}

/** PDA ['token_badge', mint] under the pinned program; deterministic and cached. */
export function badgeAddress(mint: string): Promise<string> {
  if (!addressSchema.safeParse(mint).success) throw new ServiceError('invalid-input', 'The asset mint is invalid.');
  let derived = badgeAddresses.get(mint);
  if (!derived) {
    derived = getProgramDerivedAddress({
      programAddress: address(DBC_PROGRAM_ID),
      seeds: [BADGE_SEED, addressEncoder.encode(address(mint))],
    }).then(([pda]) => pda as string);
    badgeAddresses.set(mint, derived);
  }
  return derived;
}

/** Every DBC account read asserts the pinned program owner, size and discriminator. */
export function programAccountBytes(account: unknown, expectedLength: number, discriminator: readonly number[]): Buffer {
  const parsed = accountSchema.safeParse(account);
  if (!parsed.success || parsed.data.executable || parsed.data.owner !== DBC_PROGRAM_ID) unverified();
  const bytes = Buffer.from(parsed.data!.data[0], 'base64');
  if (bytes.length !== expectedLength || bytes.subarray(0, 8).toString('hex') !== Buffer.from(discriminator).toString('hex')) unverified();
  return bytes;
}

async function programAccounts(filters: unknown[], dataSlice: { offset: number; length: number }): Promise<z.infer<typeof programAccountsSchema>> {
  return gpaQueue.run(async () => {
    const parsed = programAccountsSchema.safeParse(await rpcRequest('getProgramAccounts', [DBC_PROGRAM_ID, {
      encoding: 'base64', commitment: 'confirmed', withContext: true, dataSlice, filters,
    }]));
    if (!parsed.success) throw new ServiceError('unavailable', 'Meteora DBC discovery could not be verified.', 'provider-unavailable');
    return parsed.data;
  });
}

/** Configs whose quote mint is this asset, under both config account layouts. */
export function configFilters(mint: string, kind: DbcConfigKind): unknown[] {
  return [
    { memcmp: { offset: DBC_OFFSETS.discriminator, bytes: discriminatorFilterBytes(kind === 'pool-config' ? DBC_DISCRIMINATORS.poolConfig : DBC_DISCRIMINATORS.configWithTransferHook) } },
    { memcmp: { offset: DBC_OFFSETS.configQuoteMint, bytes: mint } },
  ];
}
/** Pools whose config is this curve config, under both pool account layouts. */
export function poolFilters(config: string, layout: 'virtual-pool' | 'transfer-hook-pool'): unknown[] {
  return [
    { memcmp: { offset: DBC_OFFSETS.discriminator, bytes: discriminatorFilterBytes(layout === 'virtual-pool' ? DBC_DISCRIMINATORS.virtualPool : DBC_DISCRIMINATORS.transferHookPool) } },
    { memcmp: { offset: DBC_OFFSETS.poolConfig, bytes: config } },
  ];
}

async function discoverConfigs(mint: string): Promise<DiscoveredConfig[]> {
  const found: DiscoveredConfig[] = [];
  for (const kind of ['pool-config', 'config-with-transfer-hook'] as const) {
    const result = await programAccounts(configFilters(mint, kind), { offset: 0, length: 0 });
    for (const entry of result.value) found.push({ config: entry.pubkey, kind });
  }
  // A stable order means the same request reads the same configs on every retry.
  return found.sort((a, b) => a.config.localeCompare(b.config));
}

/** Curve identity and reserves straight from the discovery slice. */
export function decodePoolSlice(pool: string, config: string, kind: DbcConfigKind, slice: Buffer): DiscoveredPool {
  if (slice.length !== DBC_POOL_SLICE.length) unverified();
  const at = (offset: number) => offset - DBC_POOL_SLICE.offset;
  return {
    pool, config, kind,
    quoteReserve: slice.readBigUInt64LE(at(DBC_OFFSETS.poolQuoteReserve)),
    migrated: slice.readUInt8(at(DBC_OFFSETS.poolIsMigrated)) !== 0,
  };
}

async function discoverPools(configs: DiscoveredConfig[]): Promise<{ pools: DiscoveredPool[]; probed: number; exhausted: boolean }> {
  const primary = (kind: DbcConfigKind) => kind === 'pool-config' ? 'virtual-pool' as const : 'transfer-hook-pool' as const;
  const pools: DiscoveredPool[] = [];
  let calls = 0;
  let probed = 0;
  for (const config of configs.slice(0, DBC_POOL_LOOKUPS)) {
    if (calls >= MAX_POOL_CALLS) break;
    const lookup = async (layout: 'virtual-pool' | 'transfer-hook-pool') => {
      calls += 1;
      const result = await programAccounts(poolFilters(config.config, layout), DBC_POOL_SLICE);
      return result.value.map(entry => decodePoolSlice(entry.pubkey, config.config, layout === 'virtual-pool' ? 'pool-config' : 'config-with-transfer-hook', Buffer.from(entry.account.data[0], 'base64')));
    };
    let found = await lookup(primary(config.kind));
    // A launch pool uses the Token-2022 transfer-hook account layout when its base
    // mint carries a hook, under either config layout, so the second layout is read
    // when the first names no pool for this config.
    if (!found.length && calls < MAX_POOL_CALLS) found = await lookup(primary(config.kind) === 'virtual-pool' ? 'transfer-hook-pool' : 'virtual-pool');
    probed += 1;
    for (const entry of found) pools.push({ ...entry, config: config.config });
  }
  const live = pools.filter(pool => !pool.migrated)
    .sort((a, b) => (b.quoteReserve > a.quoteReserve ? 1 : b.quoteReserve < a.quoteReserve ? -1 : a.pool.localeCompare(b.pool)));
  return { pools: live.slice(0, DBC_MAX_POOLS), probed, exhausted: calls >= MAX_POOL_CALLS };
}

export function poolStateView(virtualPool: VirtualPool): PoolStateView {
  const state = (virtualPool as { poolState?: Record<string, unknown> }).poolState;
  if (!state) unverified();
  return {
    config: pubkey(state!.config), baseMint: pubkey(state!.baseMint),
    baseReserve: unsigned(state!.baseReserve, U64_CEILING), quoteReserve: unsigned(state!.quoteReserve, U64_CEILING),
    sqrtPrice: unsigned(state!.sqrtPrice, U128_CEILING), activationPoint: unsigned(state!.activationPoint, U64_CEILING),
    migrated: byte(state!.isMigrated, 255) !== 0,
  };
}
export function curveConfigView(poolConfig: PoolConfig): CurveConfigView {
  const config = poolConfig as unknown as Record<string, unknown>;
  const fees = config.poolFees as { baseFee?: Record<string, unknown> } | undefined;
  if (!fees?.baseFee) unverified();
  return {
    quoteMint: pubkey(config.quoteMint), tokenDecimal: byte(config.tokenDecimal, 9), activationType: byte(config.activationType, 1),
    migrationQuoteThreshold: unsigned(config.migrationQuoteThreshold, U64_CEILING),
    cliffFeeNumerator: unsigned(fees!.baseFee!.cliffFeeNumerator, U64_CEILING),
  };
}

/** Pool, config and Clock captured together, so every figure shares one slot. */
async function readPoolState(mint: string, discovered: DiscoveredPool[], badgeAccount: string, configCount: number, configsProbed: number, truncated: boolean): Promise<DbcSnapshot> {
  const configKeys = [...new Set(discovered.map(pool => pool.config))];
  const keys = [...discovered.map(pool => pool.pool), ...configKeys, CLOCK];
  const fetchedAt = new Date().toISOString();
  const parsed = multipleAccountsSchema.safeParse(await rpcRequest('getMultipleAccounts', [keys, { encoding: 'base64', commitment: 'confirmed' }]));
  if (!parsed.success || parsed.data.value.length !== keys.length) throw new ServiceError('unavailable', 'Meteora DBC pool state could not be verified.', 'provider-unavailable');
  const clock = parsed.data.value[keys.length - 1];
  const clockBytes = clock && !clock.executable && clock.owner === CLOCK_OWNER ? Buffer.from(clock.data[0], 'base64') : undefined;
  if (!clockBytes || clockBytes.length !== 40 || clockBytes.readBigInt64LE(32) < 0n) throw new ServiceError('unavailable', 'Chain time could not be verified for the DBC curve point.');
  const unixTimestamp = clockBytes.readBigInt64LE(32);
  const pools: PoolSnapshot[] = [];
  let pointKind: DbcPointKind = 'timestamp';
  for (const [index, discoveredPool] of discovered.entries()) {
    try {
      const poolLayout = discoveredPool.kind === 'pool-config' ? 'virtualPool' : 'transferHookPool';
      const poolBytes = programAccountBytes(parsed.data.value[index], DBC_ACCOUNT_SIZES[poolLayout], DBC_DISCRIMINATORS[poolLayout]);
      const configLayout: DbcAccountName = discoveredPool.kind === 'pool-config' ? 'poolConfig' : 'configWithTransferHook';
      const configBytes = programAccountBytes(parsed.data.value[discovered.length + configKeys.indexOf(discoveredPool.config)], DBC_ACCOUNT_SIZES[configLayout], DBC_DISCRIMINATORS[configLayout]);
      const virtualPool = decodeAccount<VirtualPool>(poolLayout, poolBytes);
      const poolConfig = configLayout === 'poolConfig'
        ? decodeAccount<PoolConfig>('poolConfig', configBytes)
        : decodeAccount<{ config: PoolConfig }>('configWithTransferHook', configBytes).config;
      const state = poolStateView(virtualPool);
      const curve = curveConfigView(poolConfig);
      // The pinned byte offsets and the IDL decoder must agree on every identity and
      // reserve field before a figure is reported.
      if (addressDecoder.decode(poolBytes.subarray(DBC_OFFSETS.poolConfig, DBC_OFFSETS.poolConfig + 32)) !== state.config
        || addressDecoder.decode(poolBytes.subarray(DBC_OFFSETS.poolBaseMint, DBC_OFFSETS.poolBaseMint + 32)) !== state.baseMint
        || addressDecoder.decode(configBytes.subarray(DBC_OFFSETS.configQuoteMint, DBC_OFFSETS.configQuoteMint + 32)) !== curve.quoteMint
        || poolBytes.readBigUInt64LE(DBC_OFFSETS.poolQuoteReserve) !== state.quoteReserve
        || poolBytes.readBigUInt64LE(DBC_OFFSETS.poolBaseReserve) !== state.baseReserve
        || (poolBytes.readUInt8(DBC_OFFSETS.poolIsMigrated) !== 0) !== state.migrated) unverified();
      // The pool must name this exact config and the config must quote this exact mint.
      if (state.config !== discoveredPool.config || curve.quoteMint !== mint || curve.migrationQuoteThreshold <= 0n) unverified();
      if (curve.activationType === 0) pointKind = 'slot';
      pools.push({ pool: discoveredPool.pool, config: discoveredPool.config, kind: discoveredPool.kind, state, curve, virtualPool, poolConfig });
    } catch { /* One unreadable pool never withholds the others. */ }
  }
  return {
    mint, quoteToken: true, badgeAccount, configCount, configsProbed, truncated,
    slot: parsed.data.context.slot, fetchedAt,
    currentPoint: pointKind === 'slot' ? BigInt(parsed.data.context.slot) : unixTimestamp,
    pointKind, pools,
  };
}

async function readSnapshot(mint: string): Promise<DbcSnapshot> {
  await verifyMainnetRpc();
  const badgeAccount = await badgeAddress(mint);
  const fetchedAt = new Date().toISOString();
  const badge = multipleAccountsSchema.safeParse(await rpcRequest('getMultipleAccounts', [[badgeAccount], { encoding: 'base64', commitment: 'confirmed' }]));
  if (!badge.success || badge.data.value.length !== 1) throw new ServiceError('unavailable', 'The Meteora DBC token badge could not be verified.', 'provider-unavailable');
  const base: DbcSnapshot = {
    mint, quoteToken: false, badgeAccount, configCount: 0, configsProbed: 0, truncated: false,
    slot: badge.data.context.slot, fetchedAt, currentPoint: 0n, pointKind: 'timestamp', pools: [],
  };
  if (!badge.data.value[0]) return base;
  const badgeBytes = programAccountBytes(badge.data.value[0], DBC_ACCOUNT_SIZES.tokenBadge, DBC_DISCRIMINATORS.tokenBadge);
  if (pubkey(decodeAccount<{ tokenMint: unknown }>('tokenBadge', badgeBytes).tokenMint) !== mint) unverified();
  const configs = await discoverConfigs(mint);
  if (!configs.length) return { ...base, quoteToken: true };
  const discovery = await discoverPools(configs);
  const truncated = configs.length > discovery.probed || discovery.exhausted;
  if (!discovery.pools.length) return { ...base, quoteToken: true, configCount: configs.length, configsProbed: discovery.probed, truncated };
  return readPoolState(mint, discovery.pools, badgeAccount, configs.length, discovery.probed, truncated);
}

function snapshot(mint: string): Promise<DbcSnapshot> {
  const cached = snapshots.get(mint);
  if (cached) return Promise.resolve(cached);
  let promise = pending.get(mint);
  if (!promise) {
    if (pending.size >= MAX_PENDING) return Promise.reject(new ServiceError('unavailable', 'Meteora DBC reads are busy. Wait a moment, then refresh.', 'rate-limited'));
    promise = readSnapshot(mint).then(result => { snapshots.set(mint, result, SNAPSHOT_TTL_MS); return result; }).finally(() => pending.delete(mint));
    pending.set(mint, promise);
  }
  return promise;
}

/** The SDK's pure exact-in quote over the captured pool, config and curve point. */
export function estimateSwap(entry: PoolSnapshot, mint: string, amountInRaw: string, currentPoint: bigint, pointKind: DbcPointKind): DbcSwapEstimate {
  if (!isBoundedRaw(amountInRaw) || BigInt(amountInRaw) <= 0n) throw new ServiceError('invalid-input', 'The DBC input amount is invalid.');
  const raw = swapQuote(entry.virtualPool, entry.poolConfig, false, new BN(amountInRaw), 0, false, new BN(currentPoint.toString()), false) as unknown as Record<string, unknown>;
  const result: SwapResultView = {
    actualInputAmount: unsigned(raw.actualInputAmount, U64_CEILING), outputAmount: unsigned(raw.outputAmount, U64_CEILING),
    tradingFee: unsigned(raw.tradingFee, U64_CEILING), protocolFee: unsigned(raw.protocolFee, U64_CEILING),
    referralFee: unsigned(raw.referralFee, U64_CEILING), minimumAmountOut: unsigned(raw.minimumAmountOut, U64_CEILING),
  };
  const amountIn = BigInt(amountInRaw);
  const feeRaw = result.tradingFee + result.protocolFee + result.referralFee;
  if (result.actualInputAmount > amountIn || result.outputAmount <= 0n || result.minimumAmountOut > result.outputAmount) {
    throw new ServiceError('unavailable', 'The Meteora DBC curve estimate could not be verified.', 'provider-unavailable');
  }
  const feeSide = result.actualInputAmount < amountIn ? 'input' : 'output';
  if (feeSide === 'input' && amountIn - result.actualInputAmount !== feeRaw) {
    throw new ServiceError('unavailable', 'The Meteora DBC curve estimate could not be verified.', 'provider-unavailable');
  }
  const gross = feeSide === 'input' ? amountIn : result.outputAmount + feeRaw;
  return {
    amountInRaw, netAmountInRaw: result.actualInputAmount.toString(), outRaw: result.outputAmount.toString(),
    minimumOutRaw: result.minimumAmountOut.toString(), feeRaw: feeRaw.toString(),
    feeBps: dbcFeeBps(feeRaw.toString(), gross.toString()),
    feeMint: feeSide === 'input' ? mint : entry.state.baseMint, feeSide,
    currentPoint: currentPoint.toString(), pointKind,
  };
}

export function poolFromSnapshot(entry: PoolSnapshot, data: DbcSnapshot, amountInRaw?: string): DbcPool {
  const pool: DbcPool = {
    pool: entry.pool, config: entry.config, configKind: entry.kind,
    baseMint: entry.state.baseMint, baseDecimals: entry.curve.tokenDecimal,
    quoteReserveRaw: entry.state.quoteReserve.toString(), baseReserveRaw: entry.state.baseReserve.toString(),
    migrationQuoteThresholdRaw: entry.curve.migrationQuoteThreshold.toString(),
    progressBps: dbcProgressBps(entry.state.quoteReserve.toString(), entry.curve.migrationQuoteThreshold.toString()),
    sqrtPrice: entry.state.sqrtPrice.toString(), activationPoint: entry.state.activationPoint.toString(),
    migrated: entry.state.migrated, cliffFeeBps: dbcCliffFeeBps(entry.curve.cliffFeeNumerator.toString()),
  };
  if (pool.migrated) return { ...pool, message: 'This curve has migrated to a Meteora AMM pool, so its launch curve no longer quotes.' };
  if (!amountInRaw || !isBoundedRaw(amountInRaw) || BigInt(amountInRaw) <= 0n) return pool;
  try { return { ...pool, estimate: estimateSwap(entry, data.mint, amountInRaw, data.currentPoint, data.pointKind) }; }
  catch (error) { return { ...pool, message: `The curve did not return an estimate for this amount. ${safeMessage(error)}` }; }
}

export function buildDbcItem(data: DbcSnapshot, amountInRaw: string | undefined, symbol: string): DbcItem {
  const pools = data.pools.map(entry => poolFromSnapshot(entry, data, amountInRaw));
  const state: DbcItem['state'] = !pools.length ? 'unavailable' : data.truncated || pools.some(pool => !pool.estimate) ? 'partial' : 'success';
  const message = !data.quoteToken ? DBC_COPY.noBadge(symbol)
    : !pools.length ? (data.configCount ? DBC_COPY.noPools(symbol) : DBC_COPY.noBadge(symbol))
    : `${DBC_COPY.role(symbol)} ${DBC_COPY.thin}`;
  return {
    mint: data.mint, state, quoteToken: data.quoteToken, badgeAccount: data.badgeAccount,
    configCount: data.configCount, configsProbed: data.configsProbed, pools,
    source: dbcSourceLabel(pools.length === 1 ? pools[0].pool : undefined),
    slot: data.slot, fetchedAt: data.fetchedAt,
    expiresAt: new Date(Date.parse(data.fetchedAt) + DBC_FRESHNESS_MS).toISOString(),
    ...(pools.length ? {} : { reasonCode: 'no-route' as const }),
    message,
  };
}

export function unavailableDbcItem(mint: string, message: string, badgeAccount: string, slot = 0): DbcItem {
  const fetchedAt = new Date().toISOString();
  return {
    mint, state: 'unavailable', quoteToken: false, badgeAccount, configCount: 0, configsProbed: 0, pools: [],
    source: dbcSourceLabel(), slot, fetchedAt,
    expiresAt: new Date(Date.parse(fetchedAt) + DBC_FRESHNESS_MS).toISOString(),
    reasonCode: 'no-route', message,
  };
}

export function dbcResponse(items: DbcItem[], state: DbcResponse['state'], message?: string): DbcResponse {
  const fetchedAt = new Date().toISOString();
  return {
    source: 'meteora-dbc', program: DBC_PROGRAM_ID, state, items,
    fetchedAt, expiresAt: new Date(Date.parse(fetchedAt) + DBC_FRESHNESS_MS).toISOString(),
    ...(message ? { message } : {}),
  };
}

/**
 * One request reads at most two assets. PreStocks mints, and every other mint
 * outside the verified xStocks catalog, answer with the scope statement: Meteora
 * issues DBC token badges for xStocks quote tokens.
 */
export async function getDbcPairs(items: { mint: string; quoteRaw?: string }[]): Promise<DbcResponse> {
  if (!dbcRequestSchema.safeParse({ items }).success) {
    return dbcResponse([], 'invalid-input', 'Choose one or two unique verified xStocks and a raw asset amount.');
  }
  if (!rpcConfigured()) {
    const badges = await Promise.all(items.map(item => badgeAddress(item.mint)));
    return dbcResponse(items.map((item, index) => unavailableDbcItem(item.mint, 'Meteora DBC reads use the server Solana mainnet RPC. Jupiter estimates and issuer identity remain available.', badges[index])), 'configuration-required');
  }
  const results = await Promise.all(items.map(async (item): Promise<DbcItem> => {
    const symbol = xstockMints.get(item.mint);
    const badge = await badgeAddress(item.mint);
    if (!symbol) return unavailableDbcItem(item.mint, prestockMints.has(item.mint) ? DBC_COPY.prestocks : `${DBC_COPY.prestocks} ${DBC_COPY.scope}`, badge);
    try { return buildDbcItem(await snapshot(item.mint), item.quoteRaw, symbol); }
    catch (error) {
      const failure = unavailableDbcItem(item.mint, safeMessage(error), badge);
      return { ...failure, reasonCode: error instanceof ServiceError ? error.reasonCode ?? 'provider-unavailable' : 'provider-unavailable' };
    }
  }));
  const complete = results.filter(item => item.state === 'success').length;
  const state: DbcResponse['state'] = complete === results.length ? 'success' : results.some(item => item.state !== 'unavailable') ? 'partial' : 'unavailable';
  return dbcResponse(results, state, DBC_COPY.readOnly);
}
