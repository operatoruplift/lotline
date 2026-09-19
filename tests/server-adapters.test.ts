import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { address } from '@solana/kit';
import { getMintEncoder } from '@solana-program/token-2022';
import { MAINNET_GENESIS_HASH } from '../lib/server/solana-network';

const AAPL = 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp';
const MSFT = 'XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const OWNER = '11111111111111111111111111111111';
const CLOCK = 'SysvarC1ock11111111111111111111111111111111';
const issuer = { symbol: 'AAPLx', name: 'Apple xStock', isin: 'CH1436219187', underlyingSymbol: 'AAPL', underlyingIsin: 'US0378331005', logo: 'https://xstocks-metadata.backed.fi/logos/tokens/AAPLx.png', isTradingHalted: false, trading: { isTradingHalted: false }, deployments: [{ network: 'Solana', address: AAPL }, { network: 'Ethereum', address: '0xnot-solana' }] };
const upstreamQuote = { inputMint: USDC, outputMint: AAPL, inAmount: '10000000', outAmount: '2968207', transaction: null, router: 'metis', feeBps: 10, feeMint: USDC, taker: null, signatureFeeLamports: 0 };
const info = { decimals: 8, tokenProgram: PROGRAM, scaled: true };
const account = (amount: string, pubkey = 'a') => ({ pubkey, account: { owner: PROGRAM, executable: false, data: { parsed: { type: 'account', info: { mint: AAPL, owner: OWNER, state: 'initialized', tokenAmount: { amount, decimals: 8, uiAmountString: 'IGNORE-ALREADY-SCALED' } } } } } });

beforeEach(() => { vi.resetModules(); vi.stubEnv('SOLANA_RPC_URL', 'https://rpc.example.test/?secret=DO-NOT-LEAK'); vi.stubEnv('JUPITER_API_KEY', ''); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('issuer and narrow inputs', () => {
  it('resolves exact Solana deployment and both halt signals', async () => {
    const { parseIssuerAsset } = await import('../lib/server/catalog');
    expect(parseIssuerAsset(issuer, 'AAPLx')).toMatchObject({ mint: AAPL, halted: false });
    expect(parseIssuerAsset({ ...issuer, trading: { isTradingHalted: true } }, 'AAPLx').halted).toBe(true);
    expect(() => parseIssuerAsset({ ...issuer, symbol: 'FAKEx' }, 'AAPLx')).toThrow();
    expect(() => parseIssuerAsset({ ...issuer, deployments: [{ network: 'solana', address: AAPL }] }, 'AAPLx')).toThrow();
    expect(() => parseIssuerAsset({ ...issuer, deployments: [...issuer.deployments, issuer.deployments[0]] }, 'AAPLx')).toThrow();
  });
  it('keeps issuer identity details and accepts only the matching official logo', async () => {
    const { parseIssuerAsset } = await import('../lib/server/catalog');
    expect(parseIssuerAsset(issuer, 'AAPLx')).toMatchObject({ issuerIsin: 'CH1436219187', underlyingSymbol: 'AAPL', underlyingIsin: 'US0378331005', logoSourceUrl: issuer.logo });
    expect(parseIssuerAsset({ ...issuer, logo: 'https://example.com/wrong.png' }, 'AAPLx').logoSourceUrl).toBeUndefined();
  });
  it('missing RPC is explicit; missing Jupiter key alone is not configuration-required', async () => {
    vi.stubEnv('SOLANA_RPC_URL', '');
    const { getCatalog } = await import('../lib/server/catalog');
    expect((await getCatalog()).state).toBe('configuration-required');
  });
  it('bounds raw amounts, membership shape, duplicate mints, count and total budget', async () => {
    const { quotesRequestSchema, unitsRequestSchema, parseMints } = await import('../lib/server/requests');
    expect(quotesRequestSchema.safeParse({ items: [{ mint: AAPL, usdcRaw: '10000000' }] }).success).toBe(true);
    for (const amount of ['oops', '', '-1', '1e6', '1.0', '1000000000001', '999999999999999999999999999']) expect(quotesRequestSchema.safeParse({ items: [{ mint: AAPL, usdcRaw: amount }] }).success).toBe(false);
    expect(quotesRequestSchema.safeParse({ items: [{ mint: AAPL, usdcRaw: '600000000000' }, { mint: MSFT, usdcRaw: '600000000000' }] }).success).toBe(false);
    expect(() => parseMints(`${AAPL},${AAPL}`)).toThrow();
    expect(unitsRequestSchema.safeParse({ items: [{ mint: AAPL, raw: '18446744073709551616' }] }).success).toBe(false);
    expect(quotesRequestSchema.safeParse({ items: [{ mint: AAPL, usdcRaw: '1', taker: OWNER }] }).success).toBe(false);
  });
});

describe('all-account raw balances', () => {
  it('sums every raw account using BigInt and distinguishes confirmed zero', async () => {
    const { sumTokenAccounts } = await import('../lib/server/solana');
    expect(sumTokenAccounts({ value: [account('9007199254740993'), account('7', 'b')] }, OWNER, AAPL, info)).toBe('9007199254741000');
    expect(sumTokenAccounts({ value: [] }, OWNER, AAPL, info)).toBe('0');
  });
  it('rejects RPC failures, wrong mint, wallet, token program and duplicate accounts', async () => {
    const { sumTokenAccounts } = await import('../lib/server/solana');
    expect(() => sumTokenAccounts({ error: 'down' }, OWNER, AAPL, info)).toThrow();
    expect(() => sumTokenAccounts({ value: [account('1')] }, MSFT, AAPL, info)).toThrow();
    expect(() => sumTokenAccounts({ value: [account('1')] }, OWNER, MSFT, info)).toThrow();
    expect(() => sumTokenAccounts({ value: [account('1')] }, OWNER, AAPL, { ...info, tokenProgram: 'wrong' })).toThrow();
    expect(() => sumTokenAccounts({ value: [account('1'), account('1')] }, OWNER, AAPL, info)).toThrow();
    const { unavailableHoldings } = await import('../lib/server/holdings');
    expect(unavailableHoldings([AAPL], Error('down')).holdings[0]).toMatchObject({ state: 'unavailable', raw: null, units: null });
  });
});

describe('installed mint-aware conversion, including chain-time activation', () => {
  async function convert(timestamp: bigint, raw: string, supported = true) {
    const encoded = getMintEncoder().encode({ mintAuthority: null, supply: 100000000000n, decimals: 8, isInitialized: true, freezeAuthority: null, extensions: supported ? [{ __kind: 'ScaledUiAmountConfig', authority: address(OWNER), multiplier: 1.25, newMultiplier: 2.5, newMultiplierEffectiveTimestamp: 2000n }] : null });
    const clock = Buffer.alloc(40); clock.writeBigInt64LE(timestamp, 32);
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      if (body.method === 'getGenesisHash') return Response.json({ result: MAINNET_GENESIS_HASH });
      expect(body.method).toBe('getMultipleAccounts');
      expect(body.params[0]).toEqual([AAPL, CLOCK]);
      return Response.json({ jsonrpc: '2.0', id: 1, result: { context: { slot: 1 }, value: body.params[0].map((key: string) => ({ owner: key === CLOCK ? 'Sysvar1111111111111111111111111111111111111' : PROGRAM, executable: false, lamports: 100, rentEpoch: 0, data: [Buffer.from(key === CLOCK ? clock : encoded).toString('base64'), 'base64'] })) } });
    }));
    const { convertRawUnits } = await import('../lib/server/solana');
    return convertRawUnits(AAPL, raw);
  }
  it('uses the prior multiplier before the exact activation second', async () => { expect(await convert(1999n, '200000000')).toBe('2.5'); });
  it('uses the new multiplier at the exact activation second', async () => { expect(await convert(2000n, '200000000')).toBe('5'); });
  it('converts projected raw sum, avoiding adding rounded UI strings', async () => {
    const holdingsRaw = 123456789n; const outRaw = 2968207n;
    expect(await convert(2000n, (holdingsRaw + outRaw).toString())).toBe('3.1606249');
  });
  it('unsupported scaling never silently assumes multiplier one', async () => { await expect(convert(2000n, '100', false)).rejects.toThrow('scaling'); });
});

describe('quote schema and freshness', () => {
  it('normalizes current real response shape without transaction, wallet or zero network fee claims', async () => {
    const { normalizeQuote } = await import('../lib/server/quotes');
    const result = normalizeQuote(upstreamQuote, AAPL, '10000000');
    expect(result).toMatchObject({ state: 'success', outRaw: '2968207', feeBps: 10 });
    expect(result).not.toHaveProperty('transaction'); expect(result).not.toHaveProperty('signatureFeeLamports'); expect(result).not.toHaveProperty('taker');
    expect(Date.parse(result.expiresAt) - Date.parse(result.fetchedAt)).toBe(30000);
  });
  it('uses provider expiry when earlier and rejects expired quotes', async () => {
    const { normalizeQuote } = await import('../lib/server/quotes');
    const expiry = new Date(Date.now() + 5000).toISOString();
    expect(normalizeQuote({ ...upstreamQuote, expireAt: expiry }, AAPL, '10000000').expiresAt).toBe(expiry);
    expect(() => normalizeQuote({ ...upstreamQuote, expireAt: '2020-01-01T00:00:00.000Z' }, AAPL, '10000000')).toThrow('expired');
  });
  it('rejects wrong amount, mint, zero output, malformed output, service error and unexpected transaction', async () => {
    const { normalizeQuote } = await import('../lib/server/quotes');
    for (const patch of [{ outputMint: MSFT }, { inputMint: MSFT }, { inAmount: '1' }, { outAmount: '0' }, { outAmount: '1e9' }, { errorCode: 3 }, { transaction: 'base64-transaction' }, { errorMessage: 'No route' }]) expect(() => normalizeQuote({ ...upstreamQuote, ...patch }, AAPL, '10000000')).toThrow();
  });
  it('sanitizes HTTP and transport failures without leaking credential URLs', async () => {
    const { fetchJson } = await import('../lib/server/common');
    vi.stubGlobal('fetch', vi.fn(async () => { throw Error('https://rpc.example.test/?secret=DO-NOT-LEAK'); }));
    await expect(fetchJson('https://rpc.example.test/?secret=DO-NOT-LEAK')).rejects.not.toThrow('DO-NOT-LEAK');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('private upstream error', { status: 429 })));
    await expect(fetchJson('https://example.test')).rejects.toThrow('rate limit');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));
    await expect(fetchJson('https://example.test')).rejects.toThrow('invalid data');
  });
  it('spaces requests evenly and refuses work beyond the bounded queue', async () => {
    vi.useFakeTimers();
    const { SpacedQueue } = await import('../lib/server/common');
    const queue = new SpacedQueue(2100, 3); const times: number[] = [];
    const start = () => queue.run(async () => { times.push(Date.now()); return 1; });
    const work = [start(), start(), start()];
    await expect(start()).rejects.toThrow('busy');
    await vi.runAllTimersAsync(); await Promise.all(work);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(2100); expect(times[2] - times[1]).toBeGreaterThanOrEqual(2100);
  });
});
