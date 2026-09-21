import 'server-only';
import { address, unwrapOption, type GetAccountInfoApi, type Rpc } from '@solana/kit';
import { AccountState, amountToUiAmountForMintWithoutSimulation, getMintDecoder, getTokenDecoder, type Mint } from '@solana-program/token-2022';
import { z } from 'zod';
import type { UnitContext } from '../domain/types';
import { addressSchema, BoundedCache, fetchJson, rawSchema, ServiceError, SpacedQueue, TOKEN_2022_PROGRAM, TOKEN_PROGRAM, U64_MAX, USDC_MINT } from './common';
import { reserveProviderSlot } from './provider-limits';
import { MAINNET_GENESIS_HASH } from './solana-network';

const CLOCK = 'SysvarC1ock11111111111111111111111111111111';
const rpcQueue = new SpacedQueue(120, 40);
const mintCache = new BoundedCache<MintInfo>(2_001);
const binaryCache = new BoundedCache<BinaryResult>(2_002);
const networkCache = new BoundedCache<true>(4);
const pendingNetworkChecks = new Map<string, Promise<void>>();
const binaryAccountSchema = z.object({
    data: z.tuple([z.string().max(32_000).regex(/^[A-Za-z0-9+/]*={0,2}$/), z.literal('base64')]),
    owner: z.string(), executable: z.boolean(), lamports: z.number().nonnegative(), rentEpoch: z.number().nonnegative().optional(),
  });
const contextSchema = z.object({ slot: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) });
const binarySchema = z.object({
  context: contextSchema,
  value: binaryAccountSchema.nullable(),
});
const multipleAccountsSchema = z.object({ context: contextSchema, value: z.array(binaryAccountSchema.nullable()).max(100) });
type BinaryResult = z.infer<typeof binarySchema>;
export type MintInfo = { decimals: number; tokenProgram: string; scaled: boolean; extensions?: string[]; transferBlockedReasons?: string[]; issuerControlled?: boolean };
export type MintSnapshot = { info: MintInfo; mint: Mint; slot: number };

export function rpcConfigured(): boolean { return Boolean(process.env.SOLANA_RPC_URL?.trim()); }
function rpcUrl(): string {
  const raw = process.env.SOLANA_RPC_URL?.trim();
  if (!raw) throw new ServiceError('configuration-required', 'Live needs SOLANA_RPC_URL on the server. Example mode is ready to use.');
  try { const parsed = new URL(raw); if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error(); }
  catch { throw new ServiceError('configuration-required', 'The server RPC configuration is invalid. Example mode is ready to use.'); }
  return raw;
}
export async function rpcRequest(method: string, params: unknown[]): Promise<unknown> {
  const url = rpcUrl();
  return rpcQueue.run(async () => {
    await reserveProviderSlot('solana');
    const parsed = z.object({ result: z.unknown().optional(), error: z.unknown().optional() }).safeParse(await fetchJson(url, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }));
    if (!parsed.success || parsed.data.error || !('result' in parsed.data)) throw new ServiceError('unavailable', 'The Solana RPC could not return verified data. Please retry.');
    return parsed.data.result;
  });
}

/** Read-only planning verifies the full network identity; execution performs its own fresh check. */
export async function verifyMainnetRpc(): Promise<void> {
  const endpoint = rpcUrl();
  if (networkCache.get(endpoint)) return;
  const pending = pendingNetworkChecks.get(endpoint);
  if (pending) return pending;
  const check = (async () => {
    if (await rpcRequest('getGenesisHash', []) !== MAINNET_GENESIS_HASH) throw new ServiceError('unavailable', 'The configured RPC is not verified as Solana mainnet. Live data is unavailable.');
    networkCache.set(endpoint, true, 60_000);
  })().finally(() => pendingNetworkChecks.delete(endpoint));
  pendingNetworkChecks.set(endpoint, check);
  return check;
}
async function binaryAccount(mint: string, fresh = false): Promise<BinaryResult> {
  const existing = !fresh && binaryCache.get(mint);
  if (existing) return existing;
  const parsed = binarySchema.safeParse(await rpcRequest('getAccountInfo', [mint, { encoding: 'base64', commitment: 'confirmed' }]));
  if (!parsed.success || !parsed.data.value || parsed.data.value.executable) throw new ServiceError('unavailable', 'The chain account could not be verified.');
  const value = parsed.data;
  if (mint === CLOCK) {
    if (value.value!.owner !== 'Sysvar1111111111111111111111111111111111111' || Buffer.from(value.value!.data[0], 'base64').length !== 40) throw new ServiceError('unavailable', 'Chain time is unavailable. Units cannot be verified.');
  }
  binaryCache.set(mint, value, mint === CLOCK ? 1000 : 5000);
  return value;
}
export async function loadMint(mint: string, fresh = false): Promise<MintInfo> {
  await verifyMainnetRpc();
  const cached = !fresh && mintCache.get(mint);
  if (cached) return cached;
  const account = (await binaryAccount(mint, fresh)).value!;
  return verifyMintAccount(mint, account);
}

/** Fresh public mint state for execution policy checks; the caller still validates token accounts. */
export async function loadMintSnapshot(mint: string, fresh = true): Promise<MintSnapshot> {
  if (!addressSchema.safeParse(mint).success) throw new ServiceError('invalid-input', 'The mint address is invalid.');
  await verifyMainnetRpc();
  const account = await binaryAccount(mint, fresh);
  const info = verifyMintAccount(mint, account.value!);
  return { info, mint: getMintDecoder().decode(Buffer.from(account.value!.data[0], 'base64')), slot: account.context.slot };
}

/** Decoding supports balances even when a transfer policy is not supported. */
export function inspectMintTransferPolicy(mint: Mint): Pick<MintInfo, 'extensions' | 'transferBlockedReasons' | 'issuerControlled'> {
  const extensions = unwrapOption(mint.extensions) ?? [];
  const transferBlockedReasons: string[] = [];
  let issuerControlled = unwrapOption(mint.freezeAuthority) !== null;
  for (const extension of extensions) {
    switch (extension.__kind) {
      case 'ScaledUiAmountConfig': case 'MetadataPointer': case 'TokenMetadata':
      case 'GroupPointer': case 'GroupMemberPointer': case 'TokenGroup': case 'TokenGroupMember':
      case 'MintCloseAuthority': case 'ConfidentialTransferMint': break;
      case 'PermanentDelegate': issuerControlled = true; break;
      case 'DefaultAccountState':
        if (extension.state !== AccountState.Initialized) transferBlockedReasons.push('DefaultAccountState');
        break;
      case 'PausableConfig':
        if (extension.paused) transferBlockedReasons.push('PausableConfig');
        break;
      case 'TransferHook':
        if (extension.programId !== '11111111111111111111111111111111') transferBlockedReasons.push('TransferHook');
        break;
      default: transferBlockedReasons.push(extension.__kind);
    }
  }
  return { extensions: extensions.map(extension => extension.__kind), transferBlockedReasons, issuerControlled };
}

/** Shared by single-account reads and ordered getMultipleAccounts responses. */
function verifyMintAccount(mint: string, account: z.infer<typeof binaryAccountSchema>): MintInfo {
  if (account.executable) throw new ServiceError('unavailable', 'The chain account could not be verified.');
  const expectedProgram = mint === USDC_MINT ? TOKEN_PROGRAM : TOKEN_2022_PROGRAM;
  if (account.owner !== expectedProgram) throw new ServiceError('unavailable', 'The asset is not a supported mainnet token mint.', 'unsupported-token');
  try {
    const decoded = getMintDecoder().decode(Buffer.from(account.data[0], 'base64'));
    if (!decoded.isInitialized || decoded.decimals > 18 || (mint === USDC_MINT && decoded.decimals !== 6)) throw new Error();
    const extensions = unwrapOption(decoded.extensions) ?? [];
    const scale = extensions.find(extension => extension.__kind === 'ScaledUiAmountConfig');
    if (mint !== USDC_MINT && (!scale || extensions.some(extension => extension.__kind === 'InterestBearingConfig'))) throw new Error();
    if (scale && (!(scale.multiplier > 0) || !Number.isFinite(scale.multiplier) || !(scale.newMultiplier > 0) || !Number.isFinite(scale.newMultiplier))) throw new Error();
    if (new Set(extensions.map(extension => extension.__kind)).size !== extensions.length) throw new Error();
    const info = { decimals: decoded.decimals, tokenProgram: account.owner, scaled: Boolean(scale), ...inspectMintTransferPolicy(decoded) };
    mintCache.set(mint, info, 60 * 60_000);
    return info;
  } catch { throw new ServiceError('unavailable', 'Mint scaling could not be verified. Units unavailable.', 'unsupported-token'); }
}

/** Verify a large catalog with at most 100 mint accounts in each bounded RPC request. */
export async function loadMints(mints: readonly string[]): Promise<Map<string, MintInfo | ServiceError>> {
  if (mints.length > 2_000 || new Set(mints).size !== mints.length || mints.some(mint => !addressSchema.safeParse(mint).success)) throw new ServiceError('invalid-input', 'The mint verification batch is invalid.');
  await verifyMainnetRpc();
  const result = new Map<string, MintInfo | ServiceError>();
  const pending: string[] = [];
  for (const mint of mints) {
    const cached = mintCache.get(mint);
    if (cached) result.set(mint, cached);
    else pending.push(mint);
  }
  const batches = Array.from({ length: Math.ceil(pending.length / 100) }, (_, index) => pending.slice(index * 100, (index + 1) * 100));
  // Four in flight keeps cold starts short while retaining the RPC/provider queue limits.
  for (let offset = 0; offset < batches.length; offset += 4) {
    await Promise.all(batches.slice(offset, offset + 4).map(async batch => {
      try {
        const parsed = multipleAccountsSchema.safeParse(await rpcRequest('getMultipleAccounts', [batch, { encoding: 'base64', commitment: 'confirmed' }]));
        if (!parsed.success || parsed.data.value.length !== batch.length) throw new ServiceError('unavailable', 'The chain account batch could not be verified.');
        for (const [index, mint] of batch.entries()) {
          try {
            const account = parsed.data.value[index];
            if (!account) throw new ServiceError('unavailable', 'The chain account could not be verified.');
            const info = verifyMintAccount(mint, account);
            binaryCache.set(mint, { context: parsed.data.context, value: account }, 5_000);
            result.set(mint, info);
          } catch (error) {
            result.set(mint, error instanceof ServiceError ? error : new ServiceError('unavailable', 'The chain account could not be verified.'));
          }
        }
      } catch (error) {
        const failure = error instanceof ServiceError ? error : new ServiceError('unavailable', 'The chain account batch could not be verified.');
        for (const mint of batch) result.set(mint, failure);
      }
    }));
  }
  return result;
}

type ChainAccount = NonNullable<z.infer<typeof multipleAccountsSchema>['value'][number]>;

/**
 * Convert one mint against an already-captured snapshot. The caller supplies the
 * exact mint and Clock bytes plus the slot they were read at, so a batch shares
 * one observation instead of re-reading the Clock once per mint.
 */
async function convertAgainstSnapshot(mint: string, raw: string, mintAccount: ChainAccount, clockAccount: ChainAccount | null, slot: number, observedAt: string): Promise<{ units: string; context: UnitContext }> {
  const info = verifyMintAccount(mint, mintAccount);
  const decoded = getMintDecoder().decode(Buffer.from(mintAccount.data[0], 'base64'));
  const scale = (unwrapOption(decoded.extensions) ?? []).find(extension => extension.__kind === 'ScaledUiAmountConfig');
  const context: UnitContext = { source: 'mint', kind: 'standard', decimals: info.decimals, tokenProgram: info.tokenProgram, mintSlot: slot, observedAt };
  if (scale) {
    const clock = clockAccount;
    if (!clock || clock.executable || clock.owner !== 'Sysvar1111111111111111111111111111111111111') throw new ServiceError('unavailable', 'Chain time is unavailable. Units cannot be verified.');
    const clockBytes = Buffer.from(clock.data[0], 'base64');
    if (clockBytes.length !== 40) throw new ServiceError('unavailable', 'Chain time is unavailable. Units cannot be verified.');
    // The helper decodes this same Clock timestamp. No block-time or local-clock fallback is used.
    const timestamp = clockBytes.readBigInt64LE(32);
    if (timestamp < 0n) throw new ServiceError('unavailable', 'Chain time is unavailable. Units cannot be verified.');
    Object.assign(context, { source: 'clock-sysvar', kind: 'scaled', clockSlot: slot, unixTimestamp: timestamp.toString(), multiplier: timestamp >= scale.newMultiplierEffectiveTimestamp ? scale.newMultiplier : scale.multiplier });
  }
  const rpc = {
    getAccountInfo: (key: string) => ({ send: async () => {
      if (key !== mint && key !== CLOCK) throw new ServiceError('unavailable', 'Unexpected scaling account.');
      const account = key === mint ? mintAccount : clockAccount;
      return { context: { slot: BigInt(slot) }, value: account && {
        ...account, lamports: BigInt(Math.trunc(account.lamports)), rentEpoch: 0n,
      } };
    } }),
  } as unknown as Rpc<GetAccountInfoApi>;
  try {
    const units = await amountToUiAmountForMintWithoutSimulation(rpc, address(mint), BigInt(raw));
    if (!/^\d+(\.\d+)?$/.test(units)) throw new Error();
    return { units, context };
  } catch { throw new ServiceError('unavailable', 'Mint scaling or chain time could not be verified. Units unavailable.'); }
}

/**
 * Convert several mints from a single confirmed observation.
 *
 * Each Live read reserves a slot from one globally shared provider budget, so
 * reading the Clock once per mint multiplied that cost by the basket size for no
 * added accuracy. One read also gives every mint the same slot, which is a more
 * honest snapshot than per-mint slots taken seconds apart. Failures stay
 * per-mint: a mint that cannot be verified does not spoil the others.
 */
export async function convertRawUnitsBatch(entries: readonly { mint: string; raw: string }[]): Promise<Map<string, { units: string; context: UnitContext } | ServiceError>> {
  const result = new Map<string, { units: string; context: UnitContext } | ServiceError>();
  if (entries.length === 0) return result;
  const invalid = new ServiceError('invalid-input', 'The mint or raw units are invalid.');
  const valid = entries.filter(entry => {
    const ok = addressSchema.safeParse(entry.mint).success && rawSchema.safeParse(entry.raw).success;
    if (!ok) result.set(entry.mint, invalid);
    return ok;
  });
  if (valid.length === 0) return result;
  await verifyMainnetRpc();
  const mints = [...new Set(valid.map(entry => entry.mint))];
  const unavailable = new ServiceError('unavailable', 'Mint scaling could not be verified. Units unavailable.');
  let parsed;
  try {
    parsed = multipleAccountsSchema.safeParse(await rpcRequest('getMultipleAccounts', [[...mints, CLOCK], { encoding: 'base64', commitment: 'confirmed' }]));
  } catch (error) {
    for (const entry of valid) result.set(entry.mint, error instanceof ServiceError ? error : unavailable);
    return result;
  }
  if (!parsed.success || parsed.data.value.length !== mints.length + 1) {
    for (const entry of valid) result.set(entry.mint, unavailable);
    return result;
  }
  const snapshot = parsed.data;
  const clockAccount = snapshot.value[mints.length] ?? null;
  const observedAt = new Date().toISOString();
  await Promise.all(valid.map(async entry => {
    const mintAccount = snapshot.value[mints.indexOf(entry.mint)];
    if (!mintAccount) { result.set(entry.mint, unavailable); return; }
    try {
      result.set(entry.mint, await convertAgainstSnapshot(entry.mint, entry.raw, mintAccount, clockAccount, snapshot.context.slot, observedAt));
    } catch (error) {
      result.set(entry.mint, error instanceof ServiceError ? error : unavailable);
    }
  }));
  return result;
}

/** Capture both accounts at one confirmed slot, then give those exact bytes to the official helper. */
export async function convertRawUnitsWithContext(mint: string, raw: string): Promise<{ units: string; context: UnitContext }> {
  const outcome = (await convertRawUnitsBatch([{ mint, raw }])).get(mint);
  if (!outcome) throw new ServiceError('unavailable', 'Mint scaling could not be verified. Units unavailable.');
  if (outcome instanceof ServiceError) throw outcome;
  return outcome;
}


/** Compatibility wrapper for callers that do not display historical conversion provenance. */
export async function convertRawUnits(mint: string, raw: string): Promise<string> {
  return (await convertRawUnitsWithContext(mint, raw)).units;
}

const tokenAccountsSchema = z.object({ value: z.array(z.object({
  pubkey: z.string(), account: z.object({ owner: z.string(), executable: z.boolean(), data: z.object({ parsed: z.object({
    type: z.literal('account'), info: z.object({ mint: z.string(), owner: z.string(), state: z.enum(['initialized', 'frozen']), tokenAmount: z.object({ amount: rawSchema, decimals: z.number().int() }) }),
  }) }) }),
})).max(10_000) });
/** Sum raw strings from every returned account; UI amounts are deliberately ignored. */
export function sumTokenAccounts(payload: unknown, owner: string, mint: string, info: MintInfo): string {
  const parsed = tokenAccountsSchema.safeParse(payload);
  if (!parsed.success) throw new ServiceError('unavailable', 'Token accounts could not be verified.');
  const seen = new Set<string>();
  let total = 0n;
  for (const row of parsed.data.value) {
    const token = row.account.data.parsed.info;
    if (seen.has(row.pubkey) || row.account.executable || row.account.owner !== info.tokenProgram || token.owner !== owner || token.mint !== mint || token.tokenAmount.decimals !== info.decimals) throw new ServiceError('unavailable', 'Token account ownership or mint did not match.');
    seen.add(row.pubkey);
    total += BigInt(token.tokenAmount.amount);
  }
  if (total > U64_MAX) throw new ServiceError('unavailable', 'Token balance exceeds the supported range.');
  return total.toString();
}
const binaryTokenAccountsSchema = z.object({ context: contextSchema, value: z.array(z.object({ pubkey: addressSchema, account: binaryAccountSchema })).max(10_000) });
export type RawBalanceSnapshot = { raw: string; slot: number; frozenRaw: string; accountCount: number };

/** Every account is decoded, including frozen accounts. Encrypted balances cannot masquerade as zero. */
export function sumBinaryTokenAccounts(payload: unknown, owner: string, mint: string, info: MintInfo): RawBalanceSnapshot {
  const parsed = binaryTokenAccountsSchema.safeParse(payload);
  if (!parsed.success) throw new ServiceError('unavailable', 'Token accounts could not be verified.');
  const seen = new Set<string>();
  let total = 0n;
  let frozen = 0n;
  for (const row of parsed.data.value) {
    if (seen.has(row.pubkey) || row.account.executable || row.account.owner !== info.tokenProgram) throw new ServiceError('unavailable', 'Token account ownership or mint did not match.');
    seen.add(row.pubkey);
    try {
      const token = getTokenDecoder().decode(Buffer.from(row.account.data[0], 'base64'));
      if (token.owner !== owner || token.mint !== mint || ![AccountState.Initialized, AccountState.Frozen].includes(token.state) || unwrapOption(token.isNative) !== null) throw new Error();
      const extensions = unwrapOption(token.extensions) ?? [];
      if (new Set(extensions.map(extension => extension.__kind)).size !== extensions.length) throw new Error();
      // These extensions do not hide any raw balance. Transfer restrictions still need
      // separate fresh validation against the specific source/destination before signing.
      const readable = new Set(['ImmutableOwner', 'MemoTransfer', 'CpiGuard', 'TransferHookAccount', 'PausableAccount', 'NonTransferableAccount']);
      if (extensions.some(extension => !readable.has(extension.__kind))) throw new ServiceError('unavailable', 'A token account has unsupported balance extensions. The complete balance is unavailable.');
      total += token.amount;
      if (token.state === AccountState.Frozen) frozen += token.amount;
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError('unavailable', 'Token account data or state could not be verified.');
    }
  }
  if (total > U64_MAX) throw new ServiceError('unavailable', 'Token balance exceeds the supported range.');
  return { raw: total.toString(), slot: parsed.data.context.slot, frozenRaw: frozen.toString(), accountCount: seen.size };
}

export async function loadRawBalanceWithContext(owner: string, mint: string): Promise<RawBalanceSnapshot> {
  if (!addressSchema.safeParse(owner).success || !addressSchema.safeParse(mint).success) throw new ServiceError('invalid-input', 'The wallet or mint address is invalid.');
  const info = await loadMint(mint);
  const result = await rpcRequest('getTokenAccountsByOwner', [owner, { mint }, { encoding: 'base64', commitment: 'confirmed' }]);
  return sumBinaryTokenAccounts(result, owner, mint, info);
}
export async function loadRawBalance(owner: string, mint: string): Promise<string> {
  return (await loadRawBalanceWithContext(owner, mint)).raw;
}
