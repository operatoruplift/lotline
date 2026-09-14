import { MAX_PLAN_ASSETS } from './limits';
import { allocate } from './math';

export const EXECUTION_POLICY_VERSION = '2026-09-14.v1';
export const EXECUTION_STATES = [
  'planned', 'quoting', 'review-required', 'awaiting-wallet', 'signed', 'submitted',
  'confirming', 'confirmed', 'rejected', 'failed-onchain', 'expired-unbroadcast', 'unknown',
] as const;
export type ExecutionState = typeof EXECUTION_STATES[number];

export type ExecutionLimits = {
  slippageBps: number;
  maximumPriorityFeeLamports: string;
  maximumTotalSolCostLamports: string;
  maximumTokenFeeBps: number;
};

export type ExecutionLegIntent = {
  id: string;
  issuerId: string;
  mint: string;
  allocationBps: number;
  maximumInputRaw: string;
};

export type ContributionIntent = {
  version: 1;
  chain: 'solana:mainnet';
  wallet: string;
  inputMint: string;
  budgetRaw: string;
  legs: ExecutionLegIntent[];
  policyVersion: string;
  reviewedLimits: ExecutionLimits;
  scheduleOccurrenceId?: string;
};

export type ExecutionTransition = {
  state: ExecutionState;
  at: string;
  reason?: string;
  signature?: string;
};

const allowedTransitions: Record<ExecutionState, readonly ExecutionState[]> = {
  planned: ['quoting', 'expired-unbroadcast'],
  quoting: ['review-required', 'failed-onchain', 'expired-unbroadcast'],
  'review-required': ['awaiting-wallet', 'quoting', 'expired-unbroadcast'],
  'awaiting-wallet': ['signed', 'rejected', 'expired-unbroadcast'],
  signed: ['submitted', 'unknown', 'rejected'],
  submitted: ['confirming', 'unknown', 'failed-onchain'],
  confirming: ['confirmed', 'failed-onchain', 'unknown'],
  confirmed: [],
  rejected: [],
  'failed-onchain': [],
  'expired-unbroadcast': [],
  unknown: ['confirming', 'failed-onchain'],
};

export function canTransition(from: ExecutionState, to: ExecutionState): boolean {
  return allowedTransitions[from].includes(to);
}

export function transition(state: ExecutionState, next: ExecutionState, reason?: string, signature?: string): ExecutionTransition {
  if (!canTransition(state, next)) throw new Error(`Execution cannot move from ${state} to ${next}.`);
  return { state: next, at: new Date().toISOString(), ...(reason ? { reason } : {}), ...(signature ? { signature } : {}) };
}

export function isTerminalState(state: ExecutionState): boolean {
  return state === 'confirmed' || state === 'rejected' || state === 'failed-onchain' || state === 'expired-unbroadcast';
}

export function isRetryBlocked(state: ExecutionState): boolean {
  return state === 'signed' || state === 'submitted' || state === 'confirming' || state === 'unknown';
}

export function countConfirmed(states: readonly ExecutionState[]): { confirmed: number; total: number; complete: boolean } {
  const confirmed = states.filter(state => state === 'confirmed').length;
  return { confirmed, total: states.length, complete: states.length > 0 && confirmed === states.length };
}

export function canonicalIntent(intent: ContributionIntent): string {
  const legs = [...intent.legs].sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify({ ...intent, legs });
}

export function validateIntentShape(intent: ContributionIntent): string | null {
  if (intent.version !== 1 || intent.chain !== 'solana:mainnet') return 'This execution intent is for an unsupported Solana network.';
  if (!intent.wallet || !intent.inputMint || !/^\d+$/.test(intent.budgetRaw)) return 'The execution intent has invalid wallet or amount data.';
  if (BigInt(intent.budgetRaw) <= 0n) return 'The contribution amount must be greater than zero.';
  if (intent.legs.length < 1 || intent.legs.length > MAX_PLAN_ASSETS) return `Choose one to ${MAX_PLAN_ASSETS} assets.`;
  if (new Set(intent.legs.map(leg => leg.id)).size !== intent.legs.length || new Set(intent.legs.map(leg => leg.mint)).size !== intent.legs.length) return 'Each execution leg must have a unique asset.';
  if (intent.legs.some(leg => !/^\d+$/.test(leg.maximumInputRaw) || !Number.isSafeInteger(leg.allocationBps) || leg.allocationBps < 0 || leg.allocationBps > 10_000)) return 'The execution intent contains an invalid allocation.';
  if (intent.legs.reduce((sum, leg) => sum + leg.allocationBps, 0) !== 10_000) return 'The execution allocations must total 100%.';
  const budget = BigInt(intent.budgetRaw);
  const legInputs = intent.legs.map(leg => BigInt(leg.maximumInputRaw));
  if (!legInputs.some(amount => amount > 0n)) return 'At least one execution leg must have a positive contribution.';
  if (legInputs.reduce((sum, amount) => sum + amount, 0n) !== budget) return 'The execution legs must add up to the reviewed contribution amount.';
  try {
    const expected = allocate(budget, intent.legs.map(leg => leg.allocationBps));
    if (expected.some((amount, index) => amount !== legInputs[index])) return 'The execution allocations do not match the reviewed contribution split.';
  } catch {
    return 'The contribution amount is outside the supported execution range.';
  }
  if (!/^\d+$/.test(intent.reviewedLimits.maximumPriorityFeeLamports) || !/^\d+$/.test(intent.reviewedLimits.maximumTotalSolCostLamports)) return 'The fee policy is invalid.';
  if (intent.reviewedLimits.slippageBps < 0 || intent.reviewedLimits.slippageBps > 500 || intent.reviewedLimits.maximumTokenFeeBps < 0 || intent.reviewedLimits.maximumTokenFeeBps > 100) return 'The reviewed limits are outside the supported range.';
  return null;
}
