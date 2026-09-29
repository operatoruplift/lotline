import { SolanaSignIn, SolanaSignMessage, type SolanaSignInFeature, type SolanaSignMessageFeature } from '@solana/wallet-standard-features';
import type { Wallet } from '@wallet-standard/base';
import { StandardConnect, type StandardConnectFeature } from '@wallet-standard/features';

/**
 * Shown in the wallet's sign-in prompt and stored with the account. Sign in
 * with Solana allows one line, and most wallets refuse to sign without one.
 */
export const SIGN_IN_STATEMENT = 'Sign in to Lotline. This proves you hold this wallet; it sends no transaction and moves no funds.';

const isSolanaChain = (chain: string) => chain.startsWith('solana:');
type Features = Partial<SolanaSignInFeature & SolanaSignMessageFeature & StandardConnectFeature>;

/** Where and when the proof is made. Supabase Auth rejects a URI it does not allow and a message older than ten minutes. */
export interface SignInRequest { domain: string; uri: string; issuedAt: string }
/** What Supabase Auth verifies: the exact text the wallet signed and its Ed25519 signature. */
export interface SignInProof { message: string; signature: Uint8Array }

/** A wallet can sign in with Sign in with Solana, or by connecting and signing a message. */
export function canSignIn(wallet: Wallet): boolean {
  const features = wallet.features as Features;
  return wallet.chains.some(isSolanaChain) && (!!features[SolanaSignIn] || (!!features[StandardConnect] && !!features[SolanaSignMessage]));
}

/** The Sign in with Solana text, in the field order Supabase Auth's own client writes. */
export function signInMessage({ domain, uri, issuedAt, address }: SignInRequest & { address: string }): string {
  return [`${domain} wants you to sign in with your Solana account:`, address, '', SIGN_IN_STATEMENT, '', 'Version: 1', `URI: ${uri}`, `Issued At: ${issuedAt}`].join('\n');
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
 * Asks the wallet to prove its address. Sign in with Solana is preferred: the
 * wallet then checks the page's domain itself and shows a dedicated prompt.
 * Otherwise it connects and signs the same text as a message. A prompt someone
 * walks away from never settles, so the signal ends the wait without it.
 */
export async function signInProof(wallet: Wallet, request: SignInRequest, signal: AbortSignal): Promise<SignInProof> {
  const features = wallet.features as Features;
  const signIn = features[SolanaSignIn];
  if (signIn) {
    const [output] = await untilAborted(signIn.signIn({ ...request, statement: SIGN_IN_STATEMENT, version: '1' }), signal);
    if (!output) throw new Error('The wallet returned no signature.');
    return { message: new TextDecoder().decode(output.signedMessage), signature: output.signature };
  }
  const connect = features[StandardConnect];
  const signMessage = features[SolanaSignMessage];
  if (!connect || !signMessage) throw new Error('This wallet cannot sign in.');
  const { accounts } = await untilAborted(connect.connect(), signal);
  const account = accounts.find(item => item.chains.some(isSolanaChain) && item.features.includes(SolanaSignMessage));
  if (!account) throw new Error('The wallet shared no Solana account that can sign a message.');
  const message = signInMessage({ ...request, address: account.address });
  const [output] = await untilAborted(signMessage.signMessage({ account, message: new TextEncoder().encode(message) }), signal);
  if (!output) throw new Error('The wallet returned no signature.');
  return { message, signature: output.signature };
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
