import 'server-only';
import { address, unwrapOption, type GetAccountInfoApi, type Rpc } from '@solana/kit';
import { amountToUiAmountForMintWithoutSimulation, getMintDecoder } from '@solana-program/token-2022';
import { z } from 'zod';
import { BoundedCache, fetchJson, rawSchema, ServiceError, SpacedQueue, TOKEN_2022_PROGRAM, TOKEN_PROGRAM, U64_MAX, USDC_MINT } from './common';
import { reserveProviderSlot } from './provider-limits';

const CLOCK = 'SysvarC1ock11111111111111111111111111111111';
const rpcQueue = new SpacedQueue(120, 40);
const mintCache = new BoundedCache<MintInfo>(12);
const binaryCache = new BoundedCache<BinaryResult>(16);
const binarySchema = z.object({
  context: z.object({ slot: z.number().int().nonnegative() }),
  value: z.object({
    data: z.tuple([z.string().max(32_000).regex(/^[A-Za-z0-9+/]*={0,2}$/), z.literal('base64')]),
    owner: z.string(), executable: z.boolean(), lamports: z.number().nonnegative(), rentEpoch: z.number().nonnegative().optional(),
  }).nullable(),
});
type BinaryResult = z.infer<typeof binarySchema>;
export type MintInfo = { decimals: number; tokenProgram: string; scaled: boolean };

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
async function binaryAccount(mint: string): Promise<BinaryResult> {
  const existing = binaryCache.get(mint);
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
  const cached = !fresh && mintCache.get(mint);
  if (cached) return cached;
  const account = (await binaryAccount(mint)).value!;
  const expectedProgram = mint === USDC_MINT ? TOKEN_PROGRAM : TOKEN_2022_PROGRAM;
  if (account.owner !== expectedProgram) throw new ServiceError('unavailable', 'The asset is not a supported mainnet token mint.');
  try {
    const decoded = getMintDecoder().decode(Buffer.from(account.data[0], 'base64'));
    if (!decoded.isInitialized || decoded.decimals > 18 || (mint === USDC_MINT && decoded.decimals !== 6)) throw new Error();
    const extensions = unwrapOption(decoded.extensions) ?? [];
    const scale = extensions.find(extension => extension.__kind === 'ScaledUiAmountConfig');
    if (mint !== USDC_MINT && (!scale || extensions.some(extension => extension.__kind === 'InterestBearingConfig'))) throw new Error();
    if (scale && (!(scale.multiplier > 0) || !Number.isFinite(scale.multiplier) || !(scale.newMultiplier > 0) || !Number.isFinite(scale.newMultiplier))) throw new Error();
    const info = { decimals: decoded.decimals, tokenProgram: account.owner, scaled: Boolean(scale) };
    mintCache.set(mint, info, 60 * 60_000);
    return info;
  } catch { throw new ServiceError('unavailable', 'Mint scaling could not be verified. Units unavailable.'); }
}

/** The installed helper decodes the mint and selects its scheduled multiplier using the clock sysvar. */
export async function convertRawUnits(mint: string, raw: string): Promise<string> {
  if (!rawSchema.safeParse(raw).success) throw new ServiceError('invalid-input', 'Raw units exceed the supported token range.');
  await loadMint(mint, true);
  // A narrow read-only RPC facade gives the official helper validated, timed-out account reads.
  // It cannot access any other RPC methods or accounts, and never simulates a transaction.
  const rpc = {
    getAccountInfo: (key: string) => ({ send: async () => {
      if (key !== mint && key !== CLOCK) throw new ServiceError('unavailable', 'Unexpected scaling account.');
      const result = await binaryAccount(key);
      return { ...result, context: { slot: BigInt(result.context.slot) }, value: result.value && {
        ...result.value, lamports: BigInt(Math.trunc(result.value.lamports)), rentEpoch: BigInt(Math.trunc(result.value.rentEpoch ?? 0)),
      } };
    } }),
  } as unknown as Rpc<GetAccountInfoApi>;
  try {
    const units = await amountToUiAmountForMintWithoutSimulation(rpc, address(mint), BigInt(raw));
    if (!/^\d+(\.\d+)?$/.test(units)) throw new Error();
    return units;
  } catch { throw new ServiceError('unavailable', 'Mint scaling or chain time could not be verified. Units unavailable.'); }
}

const tokenAccountsSchema = z.object({ value: z.array(z.object({
  pubkey: z.string(), account: z.object({ owner: z.string(), executable: z.boolean(), data: z.object({ parsed: z.object({
    type: z.literal('account'), info: z.object({ mint: z.string(), owner: z.string(), tokenAmount: z.object({ amount: rawSchema, decimals: z.number().int() }) }),
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
export async function loadRawBalance(owner: string, mint: string): Promise<string> {
  const info = await loadMint(mint);
  const result = await rpcRequest('getTokenAccountsByOwner', [owner, { mint }, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
  return sumTokenAccounts(result, owner, mint, info);
}
