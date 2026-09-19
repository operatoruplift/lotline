import 'server-only';
import { EXECUTION_POLICY_VERSION, type ExecutionLimits } from '@/lib/domain/execution';
import { SEMANTIC_VALIDATOR_VERSION } from './route-semantics';
import { addressSchema, ServiceError } from '@/lib/server/common';

function restrictedWallets(): string[] {
  const values = process.env.LOTLINE_EXECUTION_ALLOWED_WALLETS?.split(',').map(value => value.trim()).filter(Boolean) ?? [];
  return values.length > 0 && values.length <= 20 && values.every(value => addressSchema.safeParse(value).success) ? [...new Set(values)] : [];
}

/** Initial release is limited to operator-reviewed participants; a wallet string alone authorizes no spending. */
export function requireExecutionWallet(wallet: string) {
  if (process.env.LOTLINE_EXECUTION_ACCESS_POLICY !== 'restricted-launch-v1' || !restrictedWallets().includes(wallet)) throw new ServiceError('invalid-input', 'In-app purchases are not available for this wallet during the restricted launch. Planning and the independent Jupiter handoff remain available.');
}

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
  validatorVersion: string;
  limits: ExecutionLimits;
  supportedWalletFeatures: readonly ['solana:signTransaction'];
  message?: string;
  reasons: string[];
};

export function executionConfig(): ExecutionConfig {
  const reasons: string[] = [];
  if (process.env.LOTLINE_EXECUTION_ENABLED !== 'true') reasons.push('Execution is paused until the server readiness flag is enabled.');
  if (!process.env.JUPITER_API_KEY?.trim()) reasons.push('A server-side Jupiter API key is required for executable orders.');
  if (!process.env.SOLANA_RPC_URL?.trim()) reasons.push('A server-side Solana RPC URL is required for transaction checks and reconciliation.');
  if (!process.env.SUPABASE_SECRET_KEY?.trim()) reasons.push('The private execution journal is not configured.');
  else if (!process.env.SUPABASE_SECRET_KEY.trim().startsWith('sb_secret_')) reasons.push('The execution journal requires a current sb_secret_ key.');
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) reasons.push('Supabase must be configured for the private execution journal.');
  if (process.env.LOTLINE_EXECUTION_MIGRATIONS_READY !== 'true') reasons.push('Execution journal migrations have not been confirmed.');
  if (process.env.LOTLINE_EXECUTION_GUEST_MIGRATIONS_READY !== 'true') reasons.push('Guest execution journal migration has not been confirmed.');
  if (process.env.LOTLINE_EXECUTION_INTEGRITY_MIGRATIONS_READY !== 'true') reasons.push('Execution concurrency and immutable-journal migration has not been confirmed.');
  if (process.env.LOTLINE_EXECUTION_PROOF_MIGRATIONS_READY !== 'true') reasons.push('Semantic-proof immutability migration has not been confirmed.');
  if (process.env.LOTLINE_EXECUTION_REPOSITORY !== 'supabase') reasons.push('The durable execution repository is not enabled.');
  if (process.env.LOTLINE_EXECUTION_VALIDATOR_READY !== SEMANTIC_VALIDATOR_VERSION) reasons.push('The deployed semantic validator version has not been acknowledged.');
  if (process.env.LOTLINE_EXECUTION_ACCESS_POLICY !== 'restricted-launch-v1') reasons.push('Issuer access requirements need an operator-approved restricted launch policy.');
  if (!restrictedWallets().length) reasons.push('No operator-reviewed wallets are configured for the restricted launch.');
  return {
    enabled: reasons.length === 0,
    reconciliationAvailable: Boolean(process.env.SOLANA_RPC_URL?.trim() && process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SECRET_KEY?.trim().startsWith('sb_secret_') && process.env.LOTLINE_EXECUTION_REPOSITORY === 'supabase' && process.env.LOTLINE_EXECUTION_MIGRATIONS_READY === 'true' && process.env.LOTLINE_EXECUTION_GUEST_MIGRATIONS_READY === 'true' && process.env.LOTLINE_EXECUTION_INTEGRITY_MIGRATIONS_READY === 'true'),
    chain: 'solana:mainnet',
    policyVersion: EXECUTION_POLICY_VERSION,
    validatorVersion: SEMANTIC_VALIDATOR_VERSION,
    limits: EXECUTION_LIMITS,
    supportedWalletFeatures: ['solana:signTransaction'],
    ...(reasons.length ? { message: 'In-app purchases are not available in this release. You can plan a contribution and review it independently on Jupiter.' } : {}),
    reasons,
  };
}

/** Public capability state excludes server setup and credential diagnostics. */
export function publicExecutionConfig(config = executionConfig()) {
  const { reasons: _operatorReasons, ...capability } = config;
  void _operatorReasons;
  return capability;
}
