import { SolanaSignIn, type SolanaSignInFeature } from '@solana/wallet-standard-features';
import type { Wallet } from '@wallet-standard/base';

/**
 * Shown in the wallet's sign-in prompt and stored with the account. Sign in
 * with Solana allows one line, and most wallets refuse to sign without one.
 */
export const SIGN_IN_STATEMENT = 'Sign in to Lotline. This proves you hold this wallet; it sends no transaction and moves no funds.';
/** Shown beside a Solana wallet that cannot sign in, after its name. */
export const UNSUPPORTED_WALLET_NOTE = 'doesn’t support Sign in with Solana yet. Update it, or use a wallet that does, such as Phantom, Solflare or Backpack.';

const isSolanaChain = (chain: string) => chain.startsWith('solana:');
type Features = Partial<SolanaSignInFeature>;
const NONCE_BYTES = 8;

/** Where and when the proof is made, with a nonce for this attempt. Supabase Auth rejects a URI it does not allow and a message older than ten minutes. */
export interface SignInRequest { domain: string; uri: string; issuedAt: string; nonce: string }
/** What Supabase Auth verifies: the exact text the wallet signed and its Ed25519 signature. */
export interface SignInProof { message: string; signature: Uint8Array }

/** A wallet on a Solana chain, whether or not it can sign in. */
export function isSolanaWallet(wallet: Wallet): boolean {
  return wallet.chains.some(isSolanaChain);
}

/**
 * Only Sign in with Solana qualifies. The wallet then writes the message
 * itself, checks the page's domain and shows its dedicated prompt; a page-written
 * message signed as plain bytes gave the wallet nothing to check.
 */
export function canSignIn(wallet: Wallet): boolean {
  return isSolanaWallet(wallet) && Boolean((wallet.features as Features)[SolanaSignIn]);
}

/** A fresh nonce for one attempt: sixteen hex characters, which Sign in with Solana accepts (eight or more alphanumerics). */
export function signInNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(NONCE_BYTES)), byte => byte.toString(16).padStart(2, '0')).join('');
}

function untilAborted<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    pending.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}

/**
 * Asks the wallet to prove its address with Sign in with Solana. A prompt
 * someone walks away from never settles, so the signal ends the wait without it.
 */
export async function signInProof(wallet: Wallet, request: SignInRequest, signal: AbortSignal): Promise<SignInProof> {
  const signIn = (wallet.features as Features)[SolanaSignIn];
  if (!signIn || !isSolanaWallet(wallet)) throw new Error('This wallet does not support Sign in with Solana.');
  const [output] = await untilAborted(signIn.signIn({ ...request, statement: SIGN_IN_STATEMENT, version: '1' }), signal);
  if (!output) throw new Error('The wallet returned no signature.');
  return { message: new TextDecoder().decode(output.signedMessage), signature: output.signature };
}

/** Wallets report a declined prompt in their own words; these cover the common ones. */
export function isWalletRejection(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, name, message } = error as { code?: unknown; name?: unknown; message?: unknown };
  return code === 4001 || code === 'ERROR_AUTHORIZATION_FAILED' || /reject|denied|declin|cancel/i.test(`${typeof name === 'string' ? name : ''} ${typeof message === 'string' ? message : ''}`);
}

/** What went wrong, in words someone can act on. `auth` is the Supabase Auth error, when the server answered. */
export function walletSignInMessage(error: unknown, auth?: { code?: string; status?: number } | null): string {
  if (auth) {
    // Supabase's client reports a request that never got an answer with status 0.
    if (!auth.status) return 'The account service could not be reached. Check your connection and try again.';
    if (auth.code === 'web3_provider_disabled') return 'Wallet sign-in isn’t switched on for this deployment yet. You can keep planning as a guest.';
    if (auth.status === 429 || auth.code?.includes('rate_limit')) return 'Too many sign-in attempts from this network. Please wait a few minutes and try again.';
    if (auth.status === 400 || auth.status === 422) return 'Lotline couldn’t verify that signature. Check that your device’s clock is right, then try again.';
    return 'The account service could not complete this request. Please try again. You can continue planning as a guest.';
  }
  if (isWalletRejection(error)) return 'No signature was made, so nothing changed. Try again when you’re ready.';
  return 'The wallet couldn’t complete the sign-in. Unlock it, make sure it’s on Solana, and try again.';
}
