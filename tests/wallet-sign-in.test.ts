import { createClient } from '@supabase/supabase-js';
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import { describe, expect, it } from 'vitest';
import { canSignIn, isWalletRejection, SIGN_IN_STATEMENT, signInMessage, signInProof, walletSignInMessage, type SignInRequest } from '@/lib/client/wallet-sign-in';
import { shortAddress, walletAddress } from '@/lib/supabase/wallet-identity';

const address = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const request: SignInRequest = { domain: 'lotline.dev', uri: 'https://lotline.dev/sign-in', issuedAt: '2026-09-29T08:00:00.000Z' };
const never = new AbortController().signal;

async function keypair() {
  const keys = await crypto.subtle.generateKey('Ed25519', false, ['sign', 'verify']) as CryptoKeyPair;
  return { keys, sign: async (bytes: Uint8Array) => new Uint8Array(await crypto.subtle.sign('Ed25519', keys.privateKey, new Uint8Array(bytes))) };
}
const verified = (keys: CryptoKeyPair, proof: { message: string; signature: Uint8Array }) => crypto.subtle.verify('Ed25519', keys.publicKey, new Uint8Array(proof.signature), new TextEncoder().encode(proof.message));

function wallet(features: Record<string, unknown>, chains = ['solana:mainnet']): Wallet {
  return { version: '1.0.0', name: 'Fixture', icon: 'data:image/svg+xml;base64,PHN2Zy8+', chains, accounts: [], features } as unknown as Wallet;
}
const account = (chains = ['solana:mainnet'], features = ['solana:signMessage']): WalletAccount => ({ address, publicKey: new Uint8Array(32), chains, features } as unknown as WalletAccount);

describe('wallet sign-in proof', () => {
  it('accepts wallets that can prove an address on Solana, and only those', () => {
    const connect = { 'standard:connect': { version: '1.0.0', connect: async () => ({ accounts: [] }) } };
    const sign = { 'solana:signMessage': { version: '1.0.0', signMessage: async () => [] } };
    expect(canSignIn(wallet({ 'solana:signIn': { version: '1.0.0', signIn: async () => [] } }))).toBe(true);
    expect(canSignIn(wallet({ ...connect, ...sign }))).toBe(true);
    expect(canSignIn(wallet(sign))).toBe(false);
    expect(canSignIn(wallet({ ...connect, ...sign }, ['ethereum:1']))).toBe(false);
  });

  it('prefers Sign in with Solana and sends exactly the text the wallet signed', async () => {
    const { keys, sign } = await keypair();
    const inputs: unknown[] = [];
    const proof = await signInProof(wallet({ 'solana:signIn': { version: '1.0.0', signIn: async (...given: Record<string, string>[]) => {
      inputs.push(...given);
      // A wallet writes its own text, here with a chain ID Lotline did not ask for.
      const signedMessage = new TextEncoder().encode(`${signInMessage({ ...request, address })}\nChain ID: mainnet`);
      return [{ account: account(), signedMessage, signature: await sign(signedMessage) }];
    } } }), request, never);
    expect(inputs).toEqual([{ ...request, statement: SIGN_IN_STATEMENT, version: '1' }]);
    expect(proof.message.endsWith('Chain ID: mainnet')).toBe(true);
    expect(await verified(keys, proof)).toBe(true);
  });

  it('otherwise connects, picks the Solana account that can sign, and signs the Lotline text', async () => {
    const { keys, sign } = await keypair();
    const signed: { account: WalletAccount; message: Uint8Array }[] = [];
    const proof = await signInProof(wallet({
      'standard:connect': { version: '1.0.0', connect: async () => ({ accounts: [account(['ethereum:1']), account(['solana:mainnet'], []), account()] }) },
      'solana:signMessage': { version: '1.0.0', signMessage: async (input: { account: WalletAccount; message: Uint8Array }) => { signed.push(input); return [{ signedMessage: input.message, signature: await sign(input.message) }]; } },
    }), request, never);
    expect(signed).toHaveLength(1);
    expect(signed[0].account.features).toEqual(['solana:signMessage']);
    expect(proof.message).toBe(signInMessage({ ...request, address }));
    expect(await verified(keys, proof)).toBe(true);
  });

  it('writes the same text as Supabase’s own client, so Supabase Auth parses it', async () => {
    let written = '';
    const auth = createClient('https://auth-fixture.invalid', 'sb_publishable_fixture', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async () => Response.json({ code: 'fixture', message: 'fixture' }, { status: 400 }) },
    }).auth;
    await auth.signInWithWeb3({
      chain: 'solana', statement: SIGN_IN_STATEMENT,
      wallet: { publicKey: { toBase58: () => address }, signMessage: async (bytes: Uint8Array) => { written = new TextDecoder().decode(bytes); return new Uint8Array(64); } },
      options: { url: request.uri, signInWithSolana: { issuedAt: request.issuedAt } },
    });
    expect(signInMessage({ ...request, address })).toBe(written);
  });

  it('stops waiting on a prompt someone walked away from', async () => {
    const controller = new AbortController();
    const pending = signInProof(wallet({ 'solana:signIn': { version: '1.0.0', signIn: () => new Promise(() => undefined) } }), request, controller.signal);
    controller.abort(new Error('cancelled'));
    await expect(pending).rejects.toThrow('cancelled');
  });

  it('refuses a wallet that shares no Solana account able to sign', async () => {
    const proof = signInProof(wallet({ 'standard:connect': { version: '1.0.0', connect: async () => ({ accounts: [account(['ethereum:1'])] }) }, 'solana:signMessage': { version: '1.0.0', signMessage: async () => [] } }), request, never);
    await expect(proof).rejects.toThrow('no Solana account');
  });
});

describe('wallet sign-in messages', () => {
  it('recognises a declined prompt across wallets', () => {
    expect([{ code: 4001 }, new Error('User rejected the request.'), { name: 'WalletSignMessageError', message: 'Approval Denied' }, { code: 'ERROR_AUTHORIZATION_FAILED' }].every(isWalletRejection)).toBe(true);
    expect([new Error('Wallet locked'), null, 'rejected'].some(isWalletRejection)).toBe(false);
    expect(walletSignInMessage({ code: 4001 })).toMatch(/nothing changed/);
    expect(walletSignInMessage(new Error('Wallet locked'))).toMatch(/Unlock it/);
  });
  it('explains what the account service answered', () => {
    expect(walletSignInMessage(null, { code: 'web3_provider_disabled', status: 422 })).toMatch(/isn’t switched on/);
    expect(walletSignInMessage(null, { code: 'over_request_rate_limit', status: 429 })).toMatch(/Too many/);
    expect(walletSignInMessage(null, { status: 400 })).toMatch(/clock/);
    expect(walletSignInMessage(null, { status: 0 })).toMatch(/could not be reached/);
    expect(walletSignInMessage(null, { status: 500 })).toMatch(/could not complete/);
  });
});

describe('wallet identity', () => {
  const identity = (provider: string, sub: string) => ({ id: sub, user_id: 'u', identity_id: 'i', provider, identity_data: { sub, custom_claims: {} } });
  it('reads the Solana address Supabase Auth recorded, and nothing else', () => {
    expect(walletAddress({ identities: [identity('email', 'u'), identity('web3', `web3:solana:${address}`)] })).toBe(address);
    expect(walletAddress({ identities: [identity('web3', 'web3:ethereum:0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2')] })).toBeNull();
    expect(walletAddress({ identities: [identity('web3', 'web3:solana:not-an-address!')] })).toBeNull();
    expect(walletAddress({ identities: undefined })).toBeNull();
    expect(shortAddress(address)).toBe('7xKX…gAsU');
  });
});
