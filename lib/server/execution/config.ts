import 'server-only';
import { EXECUTION_POLICY_VERSION, type ExecutionLimits } from '@/lib/domain/execution';

export const EXECUTION_LIMITS: ExecutionLimits = {
  slippageBps: 100,
  maximumPriorityFeeLamports: '5000000',
  maximumTotalSolCostLamports: '10000000',
  maximumTokenFeeBps: 100,
};

export type ExecutionConfig = {
  enabled: boolean;
  reconciliationAvailable: boolean;
  chain: 'solana:mainnet';
  policyVersion: string;
  limits: ExecutionLimits;
  supportedWalletFeatures: readonly ['solana:signTransaction'];
  message?: string;
  reasons: string[];
};

export function executionConfig(): ExecutionConfig {
  const reasons: string[] = [];
  // An operator flag cannot substitute for proof of the encoded swap's spend and
  // minimum-output bounds. Keep the write path closed until that validator exists.
  reasons.push('Executable swap instruction validation is not implemented. Purchases remain unavailable.');
  if (process.env.LOTLINE_EXECUTION_ENABLED !== 'true') reasons.push('Execution is paused until the server readiness flag is enabled.');
  if (!process.env.JUPITER_API_KEY?.trim()) reasons.push('A server-side Jupiter API key is required for executable orders.');
  if (!process.env.SOLANA_RPC_URL?.trim()) reasons.push('A server-side Solana RPC URL is required for transaction checks and reconciliation.');
  if (!process.env.SUPABASE_SECRET_KEY?.trim()) reasons.push('The private execution journal is not configured.');
  else if (!process.env.SUPABASE_SECRET_KEY.trim().startsWith('sb_secret_')) reasons.push('The execution journal requires a current sb_secret_ key.');
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) reasons.push('Supabase must be configured for the private execution journal.');
  if (process.env.LOTLINE_EXECUTION_MIGRATIONS_READY !== 'true') reasons.push('Execution journal migrations have not been confirmed.');
  if (process.env.LOTLINE_EXECUTION_GUEST_MIGRATIONS_READY !== 'true') reasons.push('Guest execution journal migration has not been confirmed.');
  if (process.env.LOTLINE_EXECUTION_INTEGRITY_MIGRATIONS_READY !== 'true') reasons.push('Execution concurrency and immutable-journal migration has not been confirmed.');
  if (process.env.LOTLINE_EXECUTION_REPOSITORY !== 'supabase') reasons.push('The durable execution repository is not enabled.');
  if (process.env.LOTLINE_EXECUTION_VALIDATOR_READY !== 'true') reasons.push('The supported-instruction validator still needs an explicit operator review.');
  return {
    enabled: reasons.length === 0,
    reconciliationAvailable: Boolean(process.env.SOLANA_RPC_URL?.trim() && process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SECRET_KEY?.trim().startsWith('sb_secret_') && process.env.LOTLINE_EXECUTION_REPOSITORY === 'supabase' && process.env.LOTLINE_EXECUTION_MIGRATIONS_READY === 'true' && process.env.LOTLINE_EXECUTION_GUEST_MIGRATIONS_READY === 'true' && process.env.LOTLINE_EXECUTION_INTEGRITY_MIGRATIONS_READY === 'true'),
    chain: 'solana:mainnet',
    policyVersion: EXECUTION_POLICY_VERSION,
    limits: EXECUTION_LIMITS,
    supportedWalletFeatures: ['solana:signTransaction'],
    ...(reasons.length ? { message: reasons[0] } : {}),
    reasons,
  };
}
