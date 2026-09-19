import { createHash } from 'node:crypto';
import { address, getAddressDecoder, getAddressEncoder, getCompiledTransactionMessageDecoder, getCompiledTransactionMessageEncoder } from '@solana/kit';
import { AccountState, getTokenEncoder } from '@solana-program/token-2022';
import type { CompiledTransactionMessage } from '@solana/transaction-messages';
import type { ChainAccount } from '../lib/server/execution/chain-accounts';
import type { ExecutionOrder } from '../lib/server/execution/orders';
import { ASSOCIATED_TOKEN_PROGRAM, COMPUTE_PROGRAM, JUPITER_PROGRAM, JUPITER_USDC_FEE_ACCOUNT, JUPITER_USDC_FEE_OWNER, RAYDIUM_CLMM_PROGRAM, SYSTEM_PROGRAM } from '../lib/server/execution/route-semantics';
import { TOKEN_PROGRAM, TOKEN_2022_PROGRAM, USDC_MINT } from '../lib/server/common';

// Deterministic public keys for controlled account fixtures; no real wallet/provider order.
export const syntheticKey = (name: string) => String(getAddressDecoder().decode(createHash('sha256').update(`lotline-semantic-fixture:${name}`).digest()));
export const keyBytes = (key: string) => Buffer.from(getAddressEncoder().encode(address(key)));
const accountDiscriminator = (name: string) => createHash('sha256').update(`account:${name}`).digest().subarray(0, 8);
export const binaryAccount = (owner: string, bytes: ArrayLike<number>, lamports = '2039280'): ChainAccount => ({ owner: address(owner), executable: false, lamports, data: [Buffer.from(bytes).toString('base64'), 'base64'] });
export function tokenAccount(mint: string, owner: string, amount: bigint, program = TOKEN_PROGRAM): ChainAccount {
  return binaryAccount(program, getTokenEncoder().encode({ mint: address(mint), owner: address(owner), amount, delegate: null, state: AccountState.Initialized, isNative: null, delegatedAmount: 0n, closeAuthority: null, extensions: null }));
}

/** Synthetic single RaydiumClmmV2 route, encoded using the pinned Jupiter route_v2 IDL layout. */
export function semanticFixture(createsDestination = false) {
  const wallet = syntheticKey('wallet'); const source = syntheticKey('source'); const destination = syntheticKey('destination');
  const outputMint = syntheticKey('output-mint'); const pool = syntheticKey('pool'); const config = syntheticKey('config');
  const inputVault = syntheticKey('input-vault'); const outputVault = syntheticKey('output-vault'); const observation = syntheticKey('observation'); const tick = syntheticKey('tick');
  const a = [wallet, source, destination, USDC_MINT, outputMint, TOKEN_PROGRAM, TOKEN_2022_PROGRAM, JUPITER_PROGRAM,
    'D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf', JUPITER_PROGRAM, JUPITER_USDC_FEE_ACCOUNT, RAYDIUM_CLMM_PROGRAM,
    wallet, config, pool, source, destination, inputVault, outputVault, observation, TOKEN_PROGRAM, TOKEN_2022_PROGRAM,
    'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', USDC_MINT, outputMint, tick, JUPITER_PROGRAM, 'jitodontfront1111111111111111JustUseJupiter'];
  const writable = [wallet, source, destination, JUPITER_USDC_FEE_ACCOUNT, pool, inputVault, outputVault, observation, tick];
  const readonly = [...new Set([...a, COMPUTE_PROGRAM, SYSTEM_PROGRAM, ...(createsDestination ? [ASSOCIATED_TOKEN_PROGRAM] : [])])].filter(key => !writable.includes(key));
  const staticAccounts = [...writable, ...readonly].map(address);
  const index = (key: string) => staticAccounts.indexOf(address(key));
  const limit = Buffer.alloc(5); limit[0] = 2; limit.writeUInt32LE(200_000, 1);
  const price = Buffer.alloc(9); price[0] = 3; price.writeBigUInt64LE(5000n, 1);
  // Official route_v2 discriminator and one Borsh RoutePlanStepV2: RaydiumClmmV2(40), 10000bps, input0/output1.
  const route = Buffer.alloc(39); Buffer.from([187, 100, 250, 204, 49, 196, 175, 20]).copy(route);
  route.writeBigUInt64LE(1_000_000n, 8); route.writeBigUInt64LE(100_003n, 16);
  route.writeUInt16LE(50, 24); route.writeUInt16LE(10, 26); route.writeUInt16LE(0, 28);
  route.writeUInt32LE(1, 30); route[34] = 40; route.writeUInt16LE(10_000, 35); route[37] = 0; route[38] = 1;
  const compiled = {
    version: 0 as const, header: { numSignerAccounts: 1, numReadonlySignerAccounts: 0, numReadonlyNonSignerAccounts: readonly.length },
    staticAccounts, lifetimeToken: address(syntheticKey('blockhash')),
    instructions: [
      { programAddressIndex: index(COMPUTE_PROGRAM), accountIndices: [], data: limit },
      { programAddressIndex: index(COMPUTE_PROGRAM), accountIndices: [], data: price },
      ...(createsDestination ? [{ programAddressIndex: index(ASSOCIATED_TOKEN_PROGRAM), accountIndices: [wallet, destination, wallet, outputMint, SYSTEM_PROGRAM, TOKEN_2022_PROGRAM].map(index), data: new Uint8Array([1]) }] : []),
      { programAddressIndex: index(JUPITER_PROGRAM), accountIndices: a.map(index), data: route },
    ],
  };
  const encoded = getCompiledTransactionMessageEncoder().encode(compiled);
  const message = getCompiledTransactionMessageDecoder().decode(encoded);
  if (message.version !== 0) throw new Error('The controlled fixture must decode as a v0 message.');
  const rent = createsDestination ? '2039280' : '0';
  const order: ExecutionOrder = {
    requestId: 'controlled-semantic-fixture', transaction: 'not-for-broadcast', messageHash: createHash('sha256').update(Buffer.from(encoded)).digest('hex'),
    inputMint: USDC_MINT, outputMint, inAmount: '1000000', outAmount: '100003', minimumOutputRaw: '99502',
    router: 'metis', originalBlockhash: String(compiled.lifetimeToken), expiresAt: '2099-01-01T00:00:00.000Z',
    prioritizationFeeLamports: '1000', signatureFeeLamports: '5000', rentFeeLamports: rent, totalSolCostLamports: (6000n + BigInt(rent)).toString(),
    feeBps: 10, slippageBps: 50, feeMint: USDC_MINT, platformFee: { feeBps: 10, feeMint: USDC_MINT }, validation: 'v0-payer-and-lifetime-checked',
  };
  const poolBytes = Buffer.alloc(1544); accountDiscriminator('PoolState').copy(poolBytes);
  for (const [offset, key] of [[9, config], [73, USDC_MINT], [105, outputMint], [137, inputVault], [169, outputVault], [201, observation]] as const) keyBytes(key).copy(poolBytes, offset);
  const configBytes = Buffer.alloc(128); accountDiscriminator('AmmConfig').copy(configBytes);
  const observationBytes = Buffer.alloc(128); accountDiscriminator('ObservationState').copy(observationBytes); keyBytes(pool).copy(observationBytes, 19);
  const tickBytes = Buffer.alloc(10240); accountDiscriminator('TickArrayState').copy(tickBytes); keyBytes(pool).copy(tickBytes, 8);
  const chain = new Map<string, ChainAccount | null>([
    [source, tokenAccount(USDC_MINT, wallet, 2_000_000n)],
    [destination, createsDestination ? null : tokenAccount(outputMint, wallet, 500n, TOKEN_2022_PROGRAM)],
    [inputVault, tokenAccount(USDC_MINT, pool, 10_000_000n)],
    [outputVault, tokenAccount(outputMint, pool, 10_000_000n, TOKEN_2022_PROGRAM)],
    [JUPITER_USDC_FEE_ACCOUNT, tokenAccount(USDC_MINT, JUPITER_USDC_FEE_OWNER, 200n)],
    [pool, binaryAccount(RAYDIUM_CLMM_PROGRAM, poolBytes)], [config, binaryAccount(RAYDIUM_CLMM_PROGRAM, configBytes)],
    [observation, binaryAccount(RAYDIUM_CLMM_PROGRAM, observationBytes)], [tick, binaryAccount(RAYDIUM_CLMM_PROGRAM, tickBytes)],
  ]);
  const token = (key: string, mint: string, owner: string, amount: string) => ({ accountIndex: index(key), mint, owner, programId: mint === USDC_MINT ? TOKEN_PROGRAM : TOKEN_2022_PROGRAM, uiTokenAmount: { amount, decimals: mint === USDC_MINT ? 6 : 8 } });
  const preBalances = staticAccounts.map(() => '2039280'); preBalances[0] = '100000000';
  if (createsDestination) preBalances[index(destination)] = '0';
  const postBalances = [...preBalances]; postBalances[0] = (100_000_000n - BigInt(order.totalSolCostLamports)).toString();
  postBalances[index(destination)] = '2039280';
  const simulation = {
    context: { slot: 200 }, value: {
      err: null, replacementBlockhash: null, fee: 6000, unitsConsumed: 120_000, loadedAddresses: { writable: [] as string[], readonly: [] as string[] }, preBalances, postBalances,
      preTokenBalances: [token(source, USDC_MINT, wallet, '2000000'), ...(createsDestination ? [] : [token(destination, outputMint, wallet, '500')]), token(JUPITER_USDC_FEE_ACCOUNT, USDC_MINT, JUPITER_USDC_FEE_OWNER, '200'), token(inputVault, USDC_MINT, pool, '10000000'), token(outputVault, outputMint, pool, '10000000')],
      postTokenBalances: [token(source, USDC_MINT, wallet, '1000000'), token(destination, outputMint, wallet, createsDestination ? '100003' : '100503'), token(JUPITER_USDC_FEE_ACCOUNT, USDC_MINT, JUPITER_USDC_FEE_OWNER, '1200'), token(inputVault, USDC_MINT, pool, '10999000'), token(outputVault, outputMint, pool, '9899997')],
      accounts: [binaryAccount(SYSTEM_PROGRAM, new Uint8Array(), postBalances[0]), tokenAccount(USDC_MINT, wallet, 1_000_000n), tokenAccount(outputMint, wallet, createsDestination ? 100003n : 100503n, TOKEN_2022_PROGRAM)],
    },
  };
  return { wallet, source, destination, outputMint, pool, config, inputVault, outputVault, observation, tick, a, message, order, chain, simulation, index };
}

export function mutateRoute(message: Extract<CompiledTransactionMessage, { version: 0 }>, mutation: (data: Buffer) => void): Extract<CompiledTransactionMessage, { version: 0 }> {
  const instructions = message.instructions.map((instruction, index) => {
    if (index !== message.instructions.length - 1) return instruction;
    const data = Buffer.from(instruction.data ?? []); mutation(data); return { ...instruction, data };
  });
  return { ...message, instructions };
}
