import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getCompiledTransactionMessageEncoder } from '@solana/transaction-messages';
import type { Transaction } from '@solana/transactions';
import type { SignatureBytes } from '@solana/keys';
import { canonicalIntent, canTransition, validateIntentShape } from '../lib/domain/execution';
import { executionConfig } from '../lib/server/execution/config';
import { parseOrder, stricterLimits } from '../lib/server/execution/orders';
import { contributionState, mergeAttemptEvidence } from '../lib/server/execution/repository';
import { intentSchema, scheduleSchema } from '../lib/server/execution/schemas';
import { validateSignedTransaction } from '../lib/server/execution/submit';
import { executionFixture } from './execution-fixtures';

afterEach(() => vi.unstubAllEnvs());

describe('execution validation and immutable review', () => {
  let fixture: Awaited<ReturnType<typeof executionFixture>>;
  beforeAll(async () => { fixture = await executionFixture(); });
  it('cannot enable unimplemented instruction validation by setting environment flags', () => {
    for (const flag of ['LOTLINE_EXECUTION_ENABLED', 'LOTLINE_EXECUTION_MIGRATIONS_READY', 'LOTLINE_EXECUTION_GUEST_MIGRATIONS_READY', 'LOTLINE_EXECUTION_INTEGRITY_MIGRATIONS_READY', 'LOTLINE_EXECUTION_VALIDATOR_READY']) vi.stubEnv(flag, 'true');
    vi.stubEnv('JUPITER_API_KEY', 'local-fixture');
    vi.stubEnv('SOLANA_RPC_URL', 'https://rpc.example');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_fixture');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('LOTLINE_EXECUTION_REPOSITORY', 'supabase');
    expect(executionConfig().enabled).toBe(false);
    expect(executionConfig().reasons).toEqual(['Executable swap instruction validation is not implemented. Purchases remain unavailable.']);
  });
  it('canonicalizes property order without losing allocation tie-breaker order', () => {
    const original = fixture.intent;
    const shuffled = { ...original, reviewedLimits: { maximumTokenFeeBps: 100, maximumTotalSolCostLamports: '10000000', maximumPriorityFeeLamports: '5000000', slippageBps: 100 }, legs: [{ maximumInputRaw: '1000000', allocationBps: 10000, mint: original.legs[0].mint, issuerId: 'AAPLx', id: 'aaplx' }] };
    expect(canonicalIntent(shuffled)).toBe(canonicalIntent(original));
    const two = { ...original, legs: [original.legs[0], { ...original.legs[0], id: 'other' }] };
    expect(canonicalIntent({ ...two, legs: [...two.legs].reverse() })).not.toBe(canonicalIntent(two));
  });
  it.each(['01', '-1', '1e6', '1.2', '1000000000001', '9'.repeat(100)])('rejects raw intent amount %s without throwing', amount => {
    expect(validateIntentShape({ ...fixture.intent, budgetRaw: amount })).not.toBeNull();
    expect(() => intentSchema.safeParse({ ...fixture.intent, budgetRaw: amount })).not.toThrow();
    expect(intentSchema.safeParse({ ...fixture.intent, budgetRaw: amount }).success).toBe(false);
  });
  it('rejects nonintegral or nonfinite policy limits', () => {
    expect(validateIntentShape({ ...fixture.intent, reviewedLimits: { ...fixture.intent.reviewedLimits, slippageBps: NaN } })).not.toBeNull();
    expect(validateIntentShape({ ...fixture.intent, reviewedLimits: { ...fixture.intent.reviewedLimits, maximumTokenFeeBps: 0.5 } })).not.toBeNull();
  });
  it('accepts documented numeric lamport fees as canonical strings for metadata checks only', () => {
    const parsed = parseOrder(fixture.order, fixture.intent, fixture.asset, fixture.intent.reviewedLimits, new Date().toISOString());
    expect(parsed.prioritizationFeeLamports).toBe('5000');
    expect(parsed.validation).toBe('v0-payer-and-lifetime-checked');
  });
  it.each([
    { taker: '11111111111111111111111111111111' },
    { signatureFeePayer: '11111111111111111111111111111111' },
    { inputMint: '11111111111111111111111111111111' },
    { inAmount: '1000001' }, { otherAmountThreshold: '0' }, { otherAmountThreshold: '980' },
    { slippageBps: 101 }, { feeBps: 101 }, { prioritizationFeeLamports: 5000001 },
    { rentFeeLamports: 10000000 }, { router: 'jupiterz' }, { router: 'iris' },
    { swapMode: 'ExactOut' }, { expireAt: '2020-01-01T00:00:00.000Z' },
  ])('rejects an order that violates reviewed metadata: %j', patch => {
    expect(() => parseOrder({ ...fixture.order, ...patch }, fixture.intent, fixture.asset, fixture.intent.reviewedLimits, new Date().toISOString())).toThrow();
  });
  it('never broadens the limits snapshotted in an existing intent', () => {
    const reviewed = { slippageBps: 25, maximumPriorityFeeLamports: '1000', maximumTotalSolCostLamports: '10000', maximumTokenFeeBps: 0 };
    expect(stricterLimits(reviewed, fixture.intent.reviewedLimits)).toEqual(reviewed);
    expect(() => parseOrder(fixture.order, { ...fixture.intent, reviewedLimits: reviewed }, fixture.asset, fixture.intent.reviewedLimits, new Date().toISOString())).toThrow();
  });
  it('rejects extra signers even when the provider supplied their signature', () => {
    const compiled = { ...fixture.compiled, header: { ...fixture.compiled.header, numSignerAccounts: 2 } };
    const transaction: Transaction = { messageBytes: getCompiledTransactionMessageEncoder().encode(compiled) as Transaction['messageBytes'], signatures: { [fixture.expected.wallet]: null, [fixture.intent.inputMint]: new Uint8Array(64).fill(1) as SignatureBytes } };
    expect(() => parseOrder({ ...fixture.order, transaction: fixture.encode(transaction) }, fixture.intent, fixture.asset, fixture.intent.reviewedLimits, new Date().toISOString())).toThrow(/payer|layout/);
  });
  it('verifies only the exact approved message with its actual Ed25519 signature', async () => {
    const result = await validateSignedTransaction(fixture.expected, fixture.signedBase64, fixture.expected.wallet);
    expect(result.chainSignature).toBe(fixture.expected.signature);
    expect(result.encoded).toBe(fixture.signedBase64);
    expect(result.signedTransactionHash).toMatch(/^[a-f0-9]{64}$/);
    await expect(validateSignedTransaction({ ...fixture.expected, messageHash: '0'.repeat(64) }, fixture.signedBase64, fixture.expected.wallet)).rejects.toThrow(/reviewed order/);
    await expect(validateSignedTransaction(fixture.expected, fixture.unsignedBase64, fixture.expected.wallet)).rejects.toThrow(/complete signature/);
    const tampered = Buffer.from(fixture.signedBase64, 'base64'); tampered[1] ^= 1;
    await expect(validateSignedTransaction(fixture.expected, tampered.toString('base64'), fixture.expected.wallet)).rejects.toThrow(/signature could not be verified/);
  });
  it('rejects oversized or trailing payload bytes', async () => {
    await expect(validateSignedTransaction(fixture.expected, 'A'.repeat(1648), fixture.expected.wallet)).rejects.toThrow();
    const trailing = Buffer.concat([Buffer.from(fixture.signedBase64, 'base64'), Buffer.from([1])]).toString('base64');
    await expect(validateSignedTransaction(fixture.expected, trailing, fixture.expected.wallet)).rejects.toThrow();
  });
  it('preserves reviewed transaction metadata throughout state transitions', () => {
    const original = { transaction: fixture.unsignedBase64, router: 'metis', inAmount: '1000000', platformFee: null, reason: 'review' };
    const signed = mergeAttemptEvidence(original, { reason: 'signed', expectedSignature: fixture.expected.signature });
    const unknown = mergeAttemptEvidence(signed, { reason: 'timeout' });
    expect(unknown).toMatchObject({ transaction: fixture.unsignedBase64, router: 'metis', inAmount: '1000000', expectedSignature: fixture.expected.signature, reason: 'timeout' });
    expect(() => mergeAttemptEvidence(unknown, { transaction: 'altered' })).toThrow(/immutable/);
    expect(() => mergeAttemptEvidence(unknown, { expectedSignature: 'altered' })).toThrow(/immutable/);
  });
  it('keeps a partial four-leg run unresolved after its third leg is ambiguous', () => {
    const legs = [{ state: 'confirmed' as const, input_raw: '1' }, { state: 'confirmed' as const, input_raw: '1' }, { state: 'unknown' as const, input_raw: '1' }, { state: 'planned' as const, input_raw: '1' }];
    expect(contributionState(legs)).toBe('unknown');
    expect(canTransition('signed', 'rejected')).toBe(false);
    expect(canTransition('unknown', 'planned')).toBe(false);
    expect(contributionState(legs.slice(0, 2))).toBe('confirmed');
    expect(contributionState([...legs.slice(0, 2), { state: 'planned', input_raw: '0' }])).toBe('confirmed');
    expect(contributionState([{ state: 'confirmed', input_raw: '1' }, { state: 'planned', input_raw: '1' }])).toBe('planned');
  });
  it('validates IANA timezone and malformed schedule budget without BigInt exceptions', () => {
    const schedule = { name: 'Next review', budgetRaw: '1000000', allocations: [{ mint: fixture.asset.mint, bps: '10000' }], cadence: 'weekly', timezone: 'Asia/Ho_Chi_Minh', nextDueAt: '2026-09-26T10:00:00.000Z' };
    expect(scheduleSchema.safeParse(schedule).success).toBe(true);
    expect(scheduleSchema.safeParse({ ...schedule, timezone: 'Moon/Base' }).success).toBe(false);
    expect(() => scheduleSchema.safeParse({ ...schedule, budgetRaw: 'invalid' })).not.toThrow();
    expect(scheduleSchema.safeParse({ ...schedule, budgetRaw: 'invalid' }).success).toBe(false);
  });
});
