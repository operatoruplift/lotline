import 'server-only';
import { createHash } from 'node:crypto';
import { getAddressDecoder, unwrapOption } from '@solana/kit';
import { AccountState, getTokenDecoder } from '@solana-program/token-2022';
import type { CompiledTransactionMessage } from '@solana/transaction-messages';
import { ServiceError, TOKEN_2022_PROGRAM, TOKEN_PROGRAM, USDC_MINT } from '@/lib/server/common';
import type { ExecutionOrder } from './orders';
import { accountBytes, type ChainAccount, type ResolvedMessage } from './chain-accounts';

export const SEMANTIC_VALIDATOR_VERSION = 'jupiter-route-v2-raydium-clmm-v1';
export const JUPITER_PROGRAM = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
export const RAYDIUM_CLMM_PROGRAM = 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK';
export const COMPUTE_PROGRAM = 'ComputeBudget111111111111111111111111111111';
export const ASSOCIATED_TOKEN_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
const EVENT_AUTHORITY = 'D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf';
const MEV_MARKER = 'jitodontfront1111111111111111JustUseJupiter';
// Pinned from the dated, independently inspected default Jupiter USDC fee route.
// A provider rotating this destination needs a reviewed policy update, not a fallback.
export const JUPITER_USDC_FEE_ACCOUNT = '5SPztfEn1VAaWDBAXjQKwVrGbr6e8g3F6JJnUc9eCuSe';
export const JUPITER_USDC_FEE_OWNER = 'HFqp6ErWHY6Uzhj8rFyjYuDya2mXUpYEk8VW75K9PSiY';
export const JUPITER_USDC_FEE_OWNERS: Readonly<Record<string, string>> = {
  [JUPITER_USDC_FEE_ACCOUNT]: JUPITER_USDC_FEE_OWNER,
  DY6pE7aiDafuk35REZF9p9av3vbV2VQrvdZ4YyB1pZ4C: 'HU23r7UoZbqTUuh3vA7emAGztFtqwTeVips789vqxxBw',
};
const ROUTE_V2 = Buffer.from([187, 100, 250, 204, 49, 196, 175, 20]);

function fail(message = 'This route has unsupported transaction instructions or accounts. Review it independently on Jupiter.'): never { throw new ServiceError('unavailable', message); }
const discriminator = (name: string) => createHash('sha256').update(`account:${name}`).digest().subarray(0, 8);

export type RouteProof = {
  source: string; destination: string; pool: string; createsDestination: boolean;
  computeUnits: number; microLamports: string; priorityFeeLamports: string;
  encodedInputRaw: string; encodedMinimumOutputRaw: string; tokenFeeRaw: string;
  routeAccountAddresses: string[];
};

/** The only accepted Borsh layout is the pinned IDL's single RaydiumClmmV2 exact-in route. */
export function inspectRouteInstructions(message: CompiledTransactionMessage, resolved: ResolvedMessage, order: ExecutionOrder, wallet: string): RouteProof {
  if (message.version !== 0 || resolved.accounts[0]?.address !== wallet) fail();
  let computeUnits: number | undefined;
  let microLamports: bigint | undefined;
  let route: RouteProof | undefined;
  let ataAccounts: string[] | undefined;
  const used = new Set<number>();
  for (const instruction of message.instructions) {
    used.add(instruction.programAddressIndex);
    for (const index of instruction.accountIndices ?? []) used.add(index);
    const program = resolved.accounts[instruction.programAddressIndex]?.address;
    const accounts = (instruction.accountIndices ?? []).map(index => resolved.accounts[index]?.address ?? fail());
    const data = Buffer.from(instruction.data ?? []);
    if (program === COMPUTE_PROGRAM && !route && !ataAccounts && accounts.length === 0) {
      if (data.length === 5 && data[0] === 2 && computeUnits === undefined) {
        computeUnits = data.readUInt32LE(1);
        if (computeUnits < 1 || computeUnits > 1_400_000) fail();
      } else if (data.length === 9 && data[0] === 3 && microLamports === undefined) microLamports = data.readBigUInt64LE(1);
      else fail('The compute-budget instructions are duplicated or unsupported.');
      continue;
    }
    if (program === ASSOCIATED_TOKEN_PROGRAM && !route && !ataAccounts && data.length === 1 && data[0] === 1 && accounts.length === 6) {
      if (accounts[0] !== wallet || accounts[2] !== wallet || accounts[3] !== order.outputMint || accounts[4] !== SYSTEM_PROGRAM || accounts[5] !== TOKEN_2022_PROGRAM) fail('Account creation is not for the reviewed wallet and output mint.');
      ataAccounts = accounts;
      continue;
    }
    if (program !== JUPITER_PROGRAM || route || computeUnits === undefined || microLamports === undefined) fail();
    // 8-byte discriminator, two u64s, three u16s, vec length, variant40, bps, two indexes.
    if (data.length !== 39 || !data.subarray(0, 8).equals(ROUTE_V2) || data.readUInt32LE(30) !== 1 || data[34] !== 40 || data.readUInt16LE(35) !== 10_000 || data[37] !== 0 || data[38] !== 1) fail('Only one direct Raydium CLMM exact-in leg is supported. Other routes remain available through the Jupiter handoff.');
    const input = data.readBigUInt64LE(8);
    const quoted = data.readBigUInt64LE(16);
    const slippage = data.readUInt16LE(24);
    const platformFee = data.readUInt16LE(26);
    const positiveSlippageFee = data.readUInt16LE(28);
    const minimum = quoted * BigInt(10_000 - slippage) / 10_000n;
    if (slippage > 500 || slippage !== order.slippageBps || input !== BigInt(order.inAmount) || quoted !== BigInt(order.outAmount) || minimum <= 0n || minimum !== BigInt(order.minimumOutputRaw)) fail('The encoded spend or minimum output does not match the review.');
    // Default xStocks fee only: no referral fee, gasless surcharge or positive-slippage fee.
    if (platformFee !== 10 || platformFee !== order.feeBps || positiveSlippageFee !== 0 || order.feeMint !== USDC_MINT || order.platformFee?.feeBps !== 10 || order.platformFee.feeMint !== USDC_MINT) fail('The encoded fee is outside the reviewed default Jupiter fee policy.');
    if (accounts.length < 28 || accounts.length > 33) fail();
    const fixed: Record<number, string> = { 0: wallet, 3: USDC_MINT, 4: order.outputMint, 5: TOKEN_PROGRAM, 6: TOKEN_2022_PROGRAM, 7: JUPITER_PROGRAM, 8: EVENT_AUTHORITY, 9: JUPITER_PROGRAM, 11: RAYDIUM_CLMM_PROGRAM, 12: wallet, 15: accounts[1], 16: accounts[2], 20: TOKEN_PROGRAM, 21: TOKEN_2022_PROGRAM, 22: MEMO_PROGRAM, 23: USDC_MINT, 24: order.outputMint };
    if (!Object.hasOwn(JUPITER_USDC_FEE_OWNERS, accounts[10]) || Object.entries(fixed).some(([index, expected]) => accounts[Number(index)] !== expected) || accounts.at(-2) !== JUPITER_PROGRAM || accounts.at(-1) !== MEV_MARKER) fail('The route contains an unexpected authority, recipient, token program or CPI layout.');
    if (ataAccounts && ataAccounts[1] !== accounts[2]) fail('The created account is not the reviewed output destination.');
    const priority = (BigInt(computeUnits) * microLamports + 999_999n) / 1_000_000n;
    if (priority.toString() !== order.prioritizationFeeLamports) fail('The encoded compute fee differs from the reviewed fee.');
    const roles = new Map(resolved.accounts.map(account => [account.address, account]));
    for (const index of [1, 2, 10, 14, 17, 18, 19, ...Array.from({ length: accounts.length - 27 }, (_, index) => index + 25)]) if (!roles.get(accounts[index])?.writable || roles.get(accounts[index])?.signer) fail('A route token or pool account has incorrect permissions.');
    for (const index of [3, 4, 5, 6, 7, 8, 9, 11, 13, 20, 21, 22, 23, 24, accounts.length - 2, accounts.length - 1]) if (roles.get(accounts[index])?.writable || roles.get(accounts[index])?.signer) fail('A route program, mint or configuration has unexpected write access.');
    if (new Set([accounts[1], accounts[2], accounts[10], accounts[14], accounts[17], accounts[18], accounts[19], ...accounts.slice(25, -2)]).size !== 7 + accounts.length - 27) fail('A route account is unexpectedly aliased.');
    route = { source: accounts[1], destination: accounts[2], pool: accounts[14], createsDestination: Boolean(ataAccounts), computeUnits, microLamports: microLamports.toString(), priorityFeeLamports: priority.toString(), encodedInputRaw: input.toString(), encodedMinimumOutputRaw: minimum.toString(), tokenFeeRaw: (input * BigInt(platformFee) / 10_000n).toString(), routeAccountAddresses: accounts };
  }
  if (!route || resolved.accounts.some((account, index) => account.writable && !used.has(index))) fail('The transaction has no supported swap or contains unused writable accounts.');
  return route;
}

/** Reject account-level controls that can change standard public transfer semantics. */
export function inspectTokenAccount(account: ChainAccount, expected: { mint: string; owner: string; program: string }) {
  if (account.owner !== expected.program || account.executable) fail('The token account program is not the reviewed program.');
  let token;
  try { token = getTokenDecoder().decode(accountBytes(account)); } catch { fail('The token account cannot be decoded.'); }
  if (token.mint !== expected.mint || token.owner !== expected.owner || token.state !== AccountState.Initialized || unwrapOption(token.delegate) || unwrapOption(token.closeAuthority) || unwrapOption(token.isNative) || token.delegatedAmount !== 0n) fail('A token account has unexpected ownership, state or authority.');
  const extensions = unwrapOption(token.extensions) ?? [];
  if (extensions.some(extension => !['ImmutableOwner', 'PausableAccount', 'TransferHookAccount'].includes(extension.__kind) || (extension.__kind === 'TransferHookAccount' && extension.transferring))) fail('The token account has unsupported transfer extensions.');
  return token;
}

/** Tie Raydium CPI accounts to the pool's on-chain mint/vault/config identities. */
export function inspectRouteAccounts(route: RouteProof, byAddress: Map<string, ChainAccount | null>, outputMint: string, wallet: string) {
  const a = route.routeAccountAddresses;
  const requireAccount = (key: string): ChainAccount => byAddress.get(key) ?? fail('A required route account is missing.');
  const decodeKey = (bytes: Buffer, offset: number) => String(getAddressDecoder().decode(bytes.subarray(offset, offset + 32)));
  const pool = requireAccount(route.pool);
  const poolBytes = accountBytes(pool);
  if (pool.owner !== RAYDIUM_CLMM_PROGRAM || pool.executable || poolBytes.length !== 1544 || !poolBytes.subarray(0, 8).equals(discriminator('PoolState'))) fail('The Raydium pool layout is unsupported.');
  const mint0 = decodeKey(poolBytes, 73); const mint1 = decodeKey(poolBytes, 105);
  const vault0 = decodeKey(poolBytes, 137); const vault1 = decodeKey(poolBytes, 169);
  const inputIs0 = mint0 === USDC_MINT && mint1 === outputMint;
  const inputIs1 = mint1 === USDC_MINT && mint0 === outputMint;
  if ((!inputIs0 && !inputIs1) || decodeKey(poolBytes, 9) !== a[13] || decodeKey(poolBytes, 201) !== a[19] || a[17] !== (inputIs0 ? vault0 : vault1) || a[18] !== (inputIs0 ? vault1 : vault0)) fail('The pool does not bind the reviewed mints, vaults and configuration.');
  const typed = (key: string, name: string) => {
    const account = requireAccount(key); const bytes = accountBytes(account);
    if (account.owner !== RAYDIUM_CLMM_PROGRAM || account.executable || bytes.length < 40 || !bytes.subarray(0, 8).equals(discriminator(name))) fail('A Raydium pool account has an unsupported identity.');
    return bytes;
  };
  typed(a[13], 'AmmConfig');
  const observation = typed(a[19], 'ObservationState');
  // ObservationState begins with initialized(bool), recent_epoch(u64), observation_index(u16).
  if (decodeKey(observation, 19) !== route.pool) fail('The observation account belongs to a different pool.');
  let tickCount = 0; let bitmapCount = 0;
  for (const key of a.slice(25, -2)) {
    const account = requireAccount(key); const bytes = accountBytes(account);
    if (account.owner !== RAYDIUM_CLMM_PROGRAM || account.executable || bytes.length < 40 || decodeKey(bytes, 8) !== route.pool) fail('A tick account belongs to a different pool.');
    if (bytes.subarray(0, 8).equals(discriminator('TickArrayState')) && bytes.length === 10240) tickCount++;
    else if (bytes.subarray(0, 8).equals(discriminator('TickArrayBitmapExtension')) && bytes.length === 1832) bitmapCount++;
    else fail('The Raydium remaining-account layout is unsupported.');
  }
  if (tickCount < 1 || tickCount > 5 || bitmapCount > 1) fail();
  const source = inspectTokenAccount(requireAccount(route.source), { mint: USDC_MINT, owner: wallet, program: TOKEN_PROGRAM });
  const destinationAccount = byAddress.get(route.destination);
  const destination = destinationAccount ? inspectTokenAccount(destinationAccount, { mint: outputMint, owner: wallet, program: TOKEN_2022_PROGRAM }) : null;
  if (!destination && !route.createsDestination) fail('The output token account is missing and the order does not create it.');
  inspectTokenAccount(requireAccount(a[17]), { mint: USDC_MINT, owner: route.pool, program: TOKEN_PROGRAM });
  inspectTokenAccount(requireAccount(a[18]), { mint: outputMint, owner: route.pool, program: TOKEN_2022_PROGRAM });
  inspectTokenAccount(requireAccount(a[10]), { mint: USDC_MINT, owner: JUPITER_USDC_FEE_OWNERS[a[10]], program: TOKEN_PROGRAM });
  const allowedWritable = new Set([wallet, route.source, route.destination, a[10], route.pool, a[17], a[18], a[19], ...a.slice(25, -2)]);
  return { source, destination, allowedWritable };
}
