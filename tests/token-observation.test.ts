import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { address, type ReadonlyUint8Array } from '@solana/kit';
import { AccountState, getMintEncoder, getTokenEncoder, type ExtensionArgs } from '@solana-program/token-2022';
import { MAINNET_GENESIS_HASH } from '../lib/server/solana-network';

const MINT = 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp';
const SECOND = 'XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX';
const OWNER = '11111111111111111111111111111111';
const PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const CLOCK = 'SysvarC1ock11111111111111111111111111111111';
const scale: ExtensionArgs = { __kind: 'ScaledUiAmountConfig', authority: address(OWNER), multiplier: 1.25, newMultiplier: 2.5, newMultiplierEffectiveTimestamp: 2000n };
const info = { tokenProgram: PROGRAM, decimals: 8, scaled: true };
const binary = (bytes: ReadonlyUint8Array, owner = PROGRAM) => ({ owner, executable: false, lamports: 100, data: [Buffer.from(bytes).toString('base64'), 'base64'] });
const mintBytes = (extensions: ExtensionArgs[] = [scale]) => getMintEncoder().encode({ mintAuthority: null, supply: 1000000000n, decimals: 8, isInitialized: true, freezeAuthority: null, extensions });
const tokenRow = (amount: bigint, pubkey = MINT, state = AccountState.Initialized, extensions: ExtensionArgs[] | null = null) => ({ pubkey, account: binary(getTokenEncoder().encode({ mint: address(MINT), owner: address(OWNER), amount, delegate: null, state, isNative: null, delegatedAmount: 0n, closeAuthority: null, extensions })) });
const payload = (rows: unknown[]) => ({ context: { slot: 654 }, value: rows });

beforeEach(() => { vi.resetModules(); vi.stubEnv('SOLANA_RPC_URL', 'https://rpc.example.test'); vi.stubEnv('SUPABASE_SECRET_KEY', ''); vi.stubEnv('VERCEL', ''); vi.stubEnv('LOTLINE_SHARED_LIMITS', ''); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

function mockRpc(operation: (_input: string, init?: RequestInit) => Promise<Response>) {
  return vi.fn(async (input: string, init?: RequestInit) => JSON.parse(init!.body as string).method === 'getGenesisHash' ? Response.json({ result: MAINNET_GENESIS_HASH }) : operation(input, init));
}

function conversionResponse(timestamp: bigint, clockOwner = 'Sysvar1111111111111111111111111111111111111') {
  const clock = Buffer.alloc(40); clock.writeBigInt64LE(timestamp, 32);
  return { context: { slot: 456 }, value: [binary(mintBytes()), binary(clock, clockOwner)] };
}

describe('planning network identity', () => {
  it.each(['EtWTRABZaYq6iMfeYKouRu166VU2xqa1', '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'])('rejects wrong or truncated genesis %s before account reads', async genesis => {
    const fetcher = vi.fn(async () => Response.json({ result: genesis }));
    vi.stubGlobal('fetch', fetcher);
    const { convertRawUnitsWithContext } = await import('../lib/server/solana');
    await expect(convertRawUnitsWithContext(MINT, '100')).rejects.toThrow('not verified as Solana mainnet');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('coalesces checks and revalidates after sixty seconds and endpoint changes', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => Response.json({ result: MAINNET_GENESIS_HASH }));
    vi.stubGlobal('fetch', fetcher);
    const { verifyMainnetRpc } = await import('../lib/server/solana');
    await Promise.all([verifyMainnetRpc(), verifyMainnetRpc(), verifyMainnetRpc()]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await verifyMainnetRpc();
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 60_001);
    await verifyMainnetRpc();
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.stubEnv('SOLANA_RPC_URL', 'https://other-rpc.example.test');
    vi.setSystemTime(Date.now() + 1_000);
    await verifyMainnetRpc();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('does not cache a failed network check', async () => {
    vi.useFakeTimers();
    let valid = false;
    const fetcher = vi.fn(async () => Response.json({ result: valid ? MAINNET_GENESIS_HASH : 'wrong-network' }));
    vi.stubGlobal('fetch', fetcher);
    const { verifyMainnetRpc } = await import('../lib/server/solana');
    await expect(verifyMainnetRpc()).rejects.toThrow('not verified');
    valid = true; vi.setSystemTime(Date.now() + 1_000);
    await verifyMainnetRpc();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe('conversion provenance', () => {
  it.each([[1999n, '2.5', 1.25], [2000n, '5', 2.5], [2001n, '5', 2.5]])('uses one observed Clock snapshot at %s', async (timestamp, expected, multiplier) => {
    const fetcher = mockRpc(async (_input: string, init?: RequestInit) => {
      const request = JSON.parse(init!.body as string);
      expect(request).toMatchObject({ method: 'getMultipleAccounts', params: [[MINT, CLOCK], { commitment: 'confirmed', encoding: 'base64' }] });
      return Response.json({ result: conversionResponse(timestamp) });
    });
    vi.stubGlobal('fetch', fetcher);
    const { convertRawUnitsWithContext } = await import('../lib/server/solana');
    const converted = await convertRawUnitsWithContext(MINT, '200000000');
    expect(converted).toMatchObject({ units: expected, context: { source: 'clock-sysvar', kind: 'scaled', mintSlot: 456, clockSlot: 456, unixTimestamp: timestamp.toString(), multiplier } });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('keeps the official helper rounding for raw values beyond JS safe integer', async () => {
    vi.stubGlobal('fetch', mockRpc(async () => Response.json({ result: conversionResponse(2000n) })));
    const { convertRawUnitsWithContext } = await import('../lib/server/solana');
    // Token-2022 display conversion deliberately follows f64 semantics, not exact accounting math.
    expect((await convertRawUnitsWithContext(MINT, '9007199254740993')).units).toBe('225179981.36852479');
  });
  it('never substitutes local time for missing or untrusted Clock data', async () => {
    vi.stubGlobal('fetch', mockRpc(async () => Response.json({ result: conversionResponse(2000n, PROGRAM) })));
    const { convertRawUnitsWithContext } = await import('../lib/server/solana');
    await expect(convertRawUnitsWithContext(MINT, '100')).rejects.toThrow('Chain time');
  });
  it('rejects unsafe context slots instead of rounding provenance', async () => {
    vi.stubGlobal('fetch', mockRpc(async () => Response.json({ result: { ...conversionResponse(2000n), context: { slot: 9007199254740992 } } })));
    const { convertRawUnitsWithContext } = await import('../lib/server/solana');
    await expect(convertRawUnitsWithContext(MINT, '100')).rejects.toThrow('could not be verified');
  });
});

describe('binary wallet-account coverage', () => {
  it('sums all raw balances exactly, retaining frozen balance and confirmed slot', async () => {
    const { sumBinaryTokenAccounts } = await import('../lib/server/solana');
    expect(sumBinaryTokenAccounts(payload([tokenRow(9007199254740993n), tokenRow(7n, SECOND, AccountState.Frozen)]), OWNER, MINT, info)).toEqual({ raw: '9007199254741000', frozenRaw: '7', slot: 654, accountCount: 2 });
    expect(sumBinaryTokenAccounts(payload([]), OWNER, MINT, info)).toEqual({ raw: '0', frozenRaw: '0', slot: 654, accountCount: 0 });
  });
  it('rejects missing coverage, duplicates, invalid states and mismatched identities', async () => {
    const { sumBinaryTokenAccounts } = await import('../lib/server/solana');
    for (const data of [{ value: [] }, payload([tokenRow(1n), tokenRow(1n)]), payload([tokenRow(1n, MINT, AccountState.Uninitialized)])]) expect(() => sumBinaryTokenAccounts(data, OWNER, MINT, info)).toThrow();
    expect(() => sumBinaryTokenAccounts(payload([tokenRow(1n)]), SECOND, MINT, info)).toThrow();
    expect(() => sumBinaryTokenAccounts(payload([tokenRow(1n)]), OWNER, SECOND, info)).toThrow();
    expect(() => sumBinaryTokenAccounts(payload([tokenRow(1n)]), OWNER, MINT, { ...info, tokenProgram: OWNER })).toThrow();
  });
  it('supports public-balance account extensions without claiming they are freely transferable', async () => {
    const { sumBinaryTokenAccounts } = await import('../lib/server/solana');
    const extensions: ExtensionArgs[] = [{ __kind: 'ImmutableOwner' }, { __kind: 'TransferHookAccount', transferring: false }, { __kind: 'PausableAccount' }];
    expect(sumBinaryTokenAccounts(payload([tokenRow(10n, MINT, AccountState.Initialized, extensions)]), OWNER, MINT, info).raw).toBe('10');
  });
  it('rejects fee/confidential or unknown account extensions without reporting a false zero', async () => {
    const { sumBinaryTokenAccounts } = await import('../lib/server/solana');
    expect(() => sumBinaryTokenAccounts(payload([tokenRow(0n, MINT, AccountState.Initialized, [{ __kind: 'TransferFeeAmount', withheldAmount: 5n }])]), OWNER, MINT, info)).toThrow('unsupported balance extensions');
    const confidential: ExtensionArgs = { __kind: 'ConfidentialTransferAccount', approved: true, elgamalPubkey: address(OWNER), pendingBalanceLow: new Uint8Array(64), pendingBalanceHigh: new Uint8Array(64), availableBalance: new Uint8Array(64), decryptableAvailableBalance: new Uint8Array(36), allowConfidentialCredits: true, allowNonConfidentialCredits: true, pendingBalanceCreditCounter: 0n, maximumPendingBalanceCreditCounter: 10n, expectedPendingBalanceCreditCounter: 0n, actualPendingBalanceCreditCounter: 0n };
    expect(() => sumBinaryTokenAccounts(payload([tokenRow(0n, MINT, AccountState.Initialized, [confidential])]), OWNER, MINT, info)).toThrow('unsupported balance extensions');
    const row = tokenRow(0n, MINT, AccountState.Initialized, [{ __kind: 'ImmutableOwner' }]);
    const bytes = Buffer.from(row.account.data[0], 'base64'); bytes.writeUInt16LE(65534, 166); row.account.data[0] = bytes.toString('base64');
    expect(() => sumBinaryTokenAccounts(payload([row]), OWNER, MINT, info)).toThrow('could not be verified');
  });
});

describe('mint transfer policy and fresh reads', () => {
  it('keeps public planning available while separating inactive and active transfer restrictions', async () => {
    const extensions: ExtensionArgs[] = [scale, { __kind: 'PermanentDelegate', delegate: address(OWNER) }, { __kind: 'TransferHook', authority: address(OWNER), programId: address(OWNER) }, { __kind: 'DefaultAccountState', state: AccountState.Initialized }, { __kind: 'PausableConfig', authority: null, paused: false }];
    let reads = 0;
    vi.stubGlobal('fetch', mockRpc(async () => {
      reads++;
      const current = reads === 1 ? extensions : [...extensions.filter(item => item.__kind !== 'TransferHook'), { __kind: 'TransferHook' as const, authority: address(OWNER), programId: address(SECOND) }];
      return Response.json({ result: { context: { slot: reads }, value: binary(mintBytes(current)) } });
    }));
    const { loadMintSnapshot } = await import('../lib/server/solana');
    expect((await loadMintSnapshot(MINT)).info).toMatchObject({ scaled: true, issuerControlled: true, transferBlockedReasons: [] });
    expect((await loadMintSnapshot(MINT)).info.transferBlockedReasons).toEqual(['TransferHook']);
    expect(reads).toBe(2);
  });
  it('reports paused/default-frozen restrictions while retaining readable units', async () => {
    vi.stubGlobal('fetch', mockRpc(async () => Response.json({ result: { context: { slot: 3 }, value: binary(mintBytes([scale, { __kind: 'DefaultAccountState', state: AccountState.Frozen }, { __kind: 'PausableConfig', authority: null, paused: true }])) } })));
    const { loadMintSnapshot } = await import('../lib/server/solana');
    expect((await loadMintSnapshot(MINT)).info.transferBlockedReasons).toEqual(['DefaultAccountState', 'PausableConfig']);
  });
});
