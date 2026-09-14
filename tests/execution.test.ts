import { afterEach, describe, expect, it, vi } from 'vitest';
import { calendarEvent, nextOccurrence } from '../lib/domain/contribution-schedules';
import { canTransition, countConfirmed, transition, validateIntentShape } from '../lib/domain/execution';
import { executionConfig } from '../lib/server/execution/config';
import { parseOrder } from '../lib/server/execution/orders';

afterEach(() => vi.unstubAllEnvs());

describe('execution safety boundary', () => {
  it('keeps execution disabled and explains missing gates by default', () => {
    const config = executionConfig();
    expect(config.enabled).toBe(false);
    expect(config.reasons).toContain('Execution is paused until the server readiness flag is enabled.');
  });

  it('only permits forward state transitions and blocks retry after signing', () => {
    expect(canTransition('planned', 'quoting')).toBe(true);
    expect(canTransition('planned', 'submitted')).toBe(false);
    expect(canTransition('unknown', 'confirming')).toBe(true);
    expect(() => transition('signed', 'planned')).toThrow();
  });

  it('counts partial completion without treating one receipt as a full run', () => {
    expect(countConfirmed(['confirmed', 'confirming', 'failed-onchain'])).toEqual({ confirmed: 1, total: 3, complete: false });
    expect(countConfirmed(['confirmed', 'confirmed'])).toEqual({ confirmed: 2, total: 2, complete: true });
  });
});

describe('execution intent and review schedules', () => {
  const intent = {
    version: 1 as const, chain: 'solana:mainnet' as const, wallet: '11111111111111111111111111111111', inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', budgetRaw: '1000000',
    legs: [{ id: 'aaplx', issuerId: 'AAPLx', mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', allocationBps: 10000, maximumInputRaw: '1000000' }],
    policyVersion: 'test', reviewedLimits: { slippageBps: 100, maximumPriorityFeeLamports: '5000000', maximumTotalSolCostLamports: '10000000', maximumTokenFeeBps: 100 },
  };

  it('rejects malformed intents before any provider request', () => {
    expect(validateIntentShape({ ...intent, legs: [] })).toContain('Choose one');
    expect(validateIntentShape({ ...intent, legs: [{ ...intent.legs[0], allocationBps: 9000 }] })).toContain('total 100%');
    expect(validateIntentShape({ ...intent, legs: [{ ...intent.legs[0], maximumInputRaw: '0' }] })).toContain('positive contribution');
    expect(validateIntentShape({ ...intent, budgetRaw: '2000000' })).toContain('add up');
    expect(validateIntentShape({ ...intent, legs: [{ ...intent.legs[0], id: 'a', allocationBps: 5000, maximumInputRaw: '1000000' }, { ...intent.legs[0], id: 'b', issuerId: 'MSFTx', mint: 'H1nR2Lz3W4xY5vU6tS7qP8oN9mKjHgF2dC3bA4eZ5yX', allocationBps: 5000, maximumInputRaw: '0' }] })).toContain('match');
  });

  it('fails closed when Jupiter omits an executable transaction', () => {
    const asset = { symbol: 'AAPLx', name: 'Apple', mint: intent.legs[0].mint, decimals: 6, tokenProgram: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', halted: false, verifiedAt: new Date().toISOString() };
    expect(() => parseOrder({ requestId: 'req', inputMint: intent.inputMint, outputMint: asset.mint, inAmount: '1000000', outAmount: '2', otherAmountThreshold: '1', router: 'metis', transaction: null }, intent, asset, intent.reviewedLimits, new Date().toISOString())).toThrow(/unsupported order|No wallet approval/);
  });

  it('creates a review-only calendar event with no wallet or auto-trade permission', () => {
    const start = new Date('2026-09-14T10:00:00.000Z');
    expect(nextOccurrence(start, 'weekly').toISOString()).toBe('2026-09-21T10:00:00.000Z');
    const ics = calendarEvent({ id: 'schedule-1', name: 'Monthly plan', nextDueAt: start.toISOString(), timezone: 'UTC' });
    expect(ics).toContain('Review Monthly plan');
    expect(ics).toContain('No transaction is submitted automatically.');
    expect(ics).not.toContain(intent.wallet);
  });
});
