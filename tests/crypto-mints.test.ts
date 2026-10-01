import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { address, type ReadonlyUint8Array } from '@solana/kit';
import { getMintEncoder, type ExtensionArgs } from '@solana-program/token-2022';
import { MAINNET_GENESIS_HASH } from '../lib/server/solana-network';

// Real-shaped mint accounts behind a fake RPC: the pinned crypto are classic SPL Token
// mints with no extensions, unlike every stock token (Token-2022 with a display multiplier).
const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const SOL = 'So11111111111111111111111111111111111111112';
const CBBTC = 'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij';
const ETH = '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs';
const JITOSOL = 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn';
const UNPINNED = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
const OWNER = '11111111111111111111111111111111';
const mint = (decimals: number, freeze: string | null = null, extensions: ExtensionArgs[] | null = null) => getMintEncoder().encode({ mintAuthority: null, supply: 1_000_000n, decimals, isInitialized: true, freezeAuthority: freeze ? address(freeze) : null, extensions });
const account = (bytes: ReadonlyUint8Array, owner = TOKEN) => ({ owner, executable: false, lamports: 1_461_600, data: [Buffer.from(bytes).toString('base64'), 'base64'] });
const accounts: Record<string, ReturnType<typeof account>> = {
  [SOL]: account(mint(9)),
  [CBBTC]: account(mint(8, OWNER)),
  // A pinned mint whose chain decimals no longer match the pin is refused.
  [ETH]: account(mint(9)),
  // A pinned mint that moved to Token-2022 is refused.
  [JITOSOL]: account(mint(9), TOKEN_2022),
  // Classic mints outside the pin stay unsupported, as before.
  [UNPINNED]: account(mint(5)),
};

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('SOLANA_RPC_URL', 'https://rpc.example.test'); vi.stubEnv('SUPABASE_SECRET_KEY', ''); vi.stubEnv('VERCEL', ''); vi.stubEnv('LOTLINE_SHARED_LIMITS', '');
  vi.stubGlobal('fetch', vi.fn(async (_input: string, init?: RequestInit) => {
    const { method, params } = JSON.parse(init!.body as string);
    if (method === 'getGenesisHash') return Response.json({ result: MAINNET_GENESIS_HASH });
    if (method === 'getMultipleAccounts') return Response.json({ result: { context: { slot: 7 }, value: (params[0] as string[]).map(key => accounts[key] ?? null) } });
    if (method === 'getAccountInfo') return Response.json({ result: { context: { slot: 7 }, value: accounts[params[0]] ?? null } });
    throw new Error(`unexpected ${method}`);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('verifies the pinned crypto as classic SPL Token mints, and nothing outside the pin', async () => {
  const { loadMints } = await import('../lib/server/solana');
  const result = await loadMints([SOL, CBBTC, ETH, JITOSOL, UNPINNED]);
  expect(result.get(SOL)).toMatchObject({ decimals: 9, tokenProgram: TOKEN, scaled: false, issuerControlled: false });
  expect(result.get(CBBTC)).toMatchObject({ decimals: 8, tokenProgram: TOKEN, issuerControlled: true });
  expect(String(result.get(ETH))).toMatch(/could not be verified/);
  expect(String(result.get(JITOSOL))).toMatch(/not a supported mainnet token mint/);
  expect(String(result.get(UNPINNED))).toMatch(/not a supported mainnet token mint/);
});

it('reads a pinned crypto mint for its chart with no display multiplier', async () => {
  const { loadMintSnapshot } = await import('../lib/server/solana');
  const snapshot = await loadMintSnapshot(SOL);
  expect(snapshot.info).toMatchObject({ tokenProgram: TOKEN, scaled: false });
  expect(snapshot.mint.decimals).toBe(9);
});
