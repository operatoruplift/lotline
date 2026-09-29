/**
 * Crypto that can join a plan, pinned like the stock catalog. Each mint was
 * checked on Solana mainnet (SPL Token program, decimals, authorities) and is on
 * Jupiter's strict verified list; the server re-verifies decimals and program
 * against the chain before an asset appears. Deliberately short: the network's
 * own coin, bitcoin and ether with a named issuer or bridge, and the largest
 * staked-SOL pools. Anything without an identified issuer stays out.
 */
export type CryptoKind = 'coin' | 'bridged' | 'staked';
export interface CryptoIdentity {
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
  kind: CryptoKind;
  /** What the token tracks. */
  underlying: 'SOL' | 'BTC' | 'ETH';
  /** Who stands behind it: the mint, bridge or stake pool. */
  issuer: string;
  /** Whether the issuer can freeze holders' balances. */
  freezable: boolean;
  /** What stands behind one token, in a sentence. */
  backing: string;
  logoUrl: string;
}

export const SPL_TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112';

export const CRYPTO_REGISTRY: readonly Readonly<CryptoIdentity>[] = [
  { symbol: 'SOL', name: 'Solana', mint: WRAPPED_SOL_MINT, decimals: 9, kind: 'coin', underlying: 'SOL', issuer: 'Solana native mint', freezable: false, backing: 'SOL itself, wrapped as a token so it can sit in a plan', logoUrl: '/logos/crypto/SOL.png' },
  { symbol: 'cbBTC', name: 'Coinbase Wrapped BTC', mint: 'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij', decimals: 8, kind: 'bridged', underlying: 'BTC', issuer: 'Coinbase', freezable: true, backing: 'Bitcoin held by Coinbase, one for one', logoUrl: '/logos/crypto/cbBTC.png' },
  { symbol: 'WBTC', name: 'Wrapped BTC (Wormhole)', mint: '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh', decimals: 8, kind: 'bridged', underlying: 'BTC', issuer: 'Wormhole Portal', freezable: false, backing: 'Wrapped bitcoin locked in the Wormhole Portal bridge', logoUrl: '/logos/crypto/WBTC.png' },
  { symbol: 'ETH', name: 'Ether (Wormhole)', mint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', decimals: 8, kind: 'bridged', underlying: 'ETH', issuer: 'Wormhole Portal', freezable: false, backing: 'Ether locked in the Wormhole Portal bridge', logoUrl: '/logos/crypto/ETH.png' },
  { symbol: 'JitoSOL', name: 'Jito Staked SOL', mint: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', decimals: 9, kind: 'staked', underlying: 'SOL', issuer: 'Jito stake pool', freezable: false, backing: 'SOL staked in the Jito pool; each token redeems for more SOL as rewards accrue', logoUrl: '/logos/crypto/JitoSOL.png' },
  { symbol: 'mSOL', name: 'Marinade Staked SOL', mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', decimals: 9, kind: 'staked', underlying: 'SOL', issuer: 'Marinade', freezable: false, backing: 'SOL staked through Marinade; each token redeems for more SOL as rewards accrue', logoUrl: '/logos/crypto/mSOL.png' },
  { symbol: 'JupSOL', name: 'Jupiter Staked SOL', mint: 'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v', decimals: 9, kind: 'staked', underlying: 'SOL', issuer: 'Jupiter stake pool', freezable: false, backing: 'SOL staked in the Jupiter pool; each token redeems for more SOL as rewards accrue', logoUrl: '/logos/crypto/JupSOL.png' },
  { symbol: 'INF', name: 'Sanctum Infinity', mint: '5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm', decimals: 9, kind: 'staked', underlying: 'SOL', issuer: 'Sanctum', freezable: false, backing: 'A Sanctum pool of staked-SOL tokens; each token redeems for more SOL as rewards accrue', logoUrl: '/logos/crypto/INF.png' },
];

export const CRYPTO_MINTS: readonly string[] = CRYPTO_REGISTRY.map(asset => asset.mint);
const byMint = new Map(CRYPTO_REGISTRY.map(asset => [asset.mint, asset]));

export function cryptoIdentity(mint: string): Readonly<CryptoIdentity> | undefined {
  return byMint.get(mint);
}
