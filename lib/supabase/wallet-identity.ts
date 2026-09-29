import type { User } from '@supabase/supabase-js';

/** Supabase Auth names a wallet identity `web3:<chain>:<address>`. */
const SOLANA_IDENTITY = /^web3:solana:([1-9A-HJ-NP-Za-km-z]{32,44})$/;

/** The Solana address a wallet sign-in proved, or null for any other account. */
export function walletAddress(user: Pick<User, 'identities'>): string | null {
  for (const identity of user.identities ?? []) {
    if (identity.provider !== 'web3') continue;
    const subject = typeof identity.identity_data?.sub === 'string' ? identity.identity_data.sub : identity.id;
    const match = SOLANA_IDENTITY.exec(subject);
    if (match) return match[1];
  }
  return null;
}

/** First and last four characters, the way wallets show an address. */
export function shortAddress(address: string): string {
  return address.length > 10 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}
