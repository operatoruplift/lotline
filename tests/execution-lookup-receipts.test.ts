import { beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { address } from '@solana/addresses';
import { getCompiledTransactionMessageEncoder } from '@solana/transaction-messages';
import { getSignatureFromTransaction, signTransaction, type Transaction } from '@solana/transactions';
import { verifyExecutionReceipt } from '../lib/server/execution/receipts';
import { mergeAttemptEvidence } from '../lib/server/execution/repository';
import type { SemanticProof } from '../lib/server/execution/semantic-validation';
import { MAINNET_GENESIS_HASH } from '../lib/server/solana-network';
import { TOKEN_2022_PROGRAM } from '../lib/server/common';
import { executionFixture } from './execution-fixtures';

/** Local crypto fixture only: proves receipt binding, not a mainnet Jupiter settlement. */
async function lookupFixture() {
  const base = await executionFixture();
  const loaded = base.compiled.staticAccounts.slice(3, 6);
  const compiled = { ...base.compiled, staticAccounts: [base.compiled.staticAccounts[0], base.compiled.staticAccounts[1], base.compiled.staticAccounts[2], base.compiled.staticAccounts[6]], instructions: [{ programAddressIndex: 3, accountIndices: [0, 1, 2, 4, 5, 6], data: new Uint8Array([1]) }], addressTableLookups: [{ lookupTableAddress: address('XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX'), writableIndexes: [1, 4, 8], readonlyIndexes: [] }] };
  const messageBytes = getCompiledTransactionMessageEncoder().encode(compiled) as Transaction['messageBytes'];
  const unsigned: Transaction = { messageBytes, signatures: { [base.expected.wallet]: null } };
  const signed = await signTransaction([base.keyPair], unsigned);
  const proof: SemanticProof = { version: 'jupiter-route-v2-raydium-clmm-v1', genesisHash: MAINNET_GENESIS_HASH, lookupContextSlot: 1200, loadedAddresses: { writable: loaded, readonly: [] }, source: loaded[0], destination: loaded[1], pool: base.expected.outputMint, inputRaw: '1000000', minimumOutputRaw: '990', tokenFeeRaw: '1000', simulationSlot: 1201, unitsConsumed: 100000, networkFeeLamports: '5000', rentLamports: '0', totalSolCostLamports: '5000', checkedAt: '2026-09-19T00:00:00.000Z', issuerControlled: true, outputUnitContext: { source: 'clock-sysvar', kind: 'scaled', decimals: 6, tokenProgram: TOKEN_2022_PROGRAM, mintSlot: 1201, clockSlot: 1201, unixTimestamp: '1789776000', multiplier: 1.25, observedAt: '2026-09-19T00:00:00.000Z' } };
  const expected = { ...base.expected, signature: getSignatureFromTransaction(signed), transaction: base.encode(unsigned), messageHash: createHash('sha256').update(Buffer.from(messageBytes)).digest('hex'), semanticProof: proof };
  const payload = { ...structuredClone(base.payload), transaction: { ...structuredClone(base.payload.transaction), meta: { ...structuredClone(base.payload.transaction.meta), loadedAddresses: { writable: [...loaded] as string[], readonly: [] as string[] } } } };
  payload.transaction.transaction[0] = base.encode(signed);
  const reorder = (balances: number[]) => [balances[0], balances[1], balances[2], balances[6], balances[3], balances[4], balances[5]];
  payload.transaction.meta.preBalances = reorder(payload.transaction.meta.preBalances);
  payload.transaction.meta.postBalances = reorder(payload.transaction.meta.postBalances);
  for (const rows of [payload.transaction.meta.preTokenBalances, payload.transaction.meta.postTokenBalances]) for (const row of rows) row.accountIndex++;
  payload.transaction.meta.postTokenBalances[0].uiTokenAmount.amount = '1000000';
  payload.transaction.meta.postTokenBalances[2].uiTokenAmount.amount = '500000';
  return { expected, payload };
}

describe('immutable lookup receipt context', () => {
  let fixture: Awaited<ReturnType<typeof lookupFixture>>;
  beforeAll(async () => { fixture = await lookupFixture(); });
  it('confirms lookup-address raw deltas with the original multiplier without reading current tables', async () => {
    const receipt = await verifyExecutionReceipt(fixture.payload, fixture.expected);
    expect(receipt.state).toBe('confirmed');
    expect(receipt.evidence).toMatchObject({ inputDebitRaw: '1000000', outputCreditRaw: '1000', outputUnits: '0.00125', outputUnitContext: fixture.expected.semanticProof.outputUnitContext, approvedLoadedAddresses: fixture.expected.semanticProof.loadedAddresses, reviewedTokenFeeRaw: '1000' });
  });
  it('requires the original semantic proof for a lookup-table transaction', async () => {
    expect((await verifyExecutionReceipt(fixture.payload, { ...fixture.expected, semanticProof: undefined })).state).toBe('unknown');
  });
  it('rejects substituted, reordered, or omitted confirmed lookup addresses', async () => {
    for (const writable of [[], [...fixture.payload.transaction.meta.loadedAddresses.writable].reverse(), [fixture.expected.inputMint, ...fixture.payload.transaction.meta.loadedAddresses.writable.slice(1)]]) {
      const changed = structuredClone(fixture.payload); changed.transaction.meta.loadedAddresses.writable = writable;
      expect((await verifyExecutionReceipt(changed, fixture.expected)).state).toBe('unknown');
    }
  });
  it('rejects a proof with mismatched bounds or source/destination identity', async () => {
    for (const change of [{ inputRaw: '999999' }, { minimumOutputRaw: '1' }, { source: fixture.expected.outputMint }, { destination: fixture.expected.inputMint }, { genesisHash: 'wrong' }]) {
      expect((await verifyExecutionReceipt(fixture.payload, { ...fixture.expected, semanticProof: { ...fixture.expected.semanticProof, ...change } })).state).toBe('unknown');
    }
  });
  it('supports a newly created destination but rejects redirected output', async () => {
    const created = structuredClone(fixture.payload);
    created.transaction.meta.preTokenBalances.splice(1, 1);
    created.transaction.meta.postTokenBalances[1].uiTokenAmount.amount = '1000';
    expect((await verifyExecutionReceipt(created, fixture.expected)).state).toBe('confirmed');
    created.transaction.meta.postTokenBalances[1].accountIndex = 2;
    expect((await verifyExecutionReceipt(created, fixture.expected)).state).toBe('unknown');
  });
  it('preserves chain failure for the original lookup transaction', async () => {
    const failed = structuredClone(fixture.payload);
    failed.transaction.meta.err = failed.statuses.value[0].err = { InstructionError: [0, 'Custom'] };
    expect((await verifyExecutionReceipt(failed, fixture.expected)).state).toBe('failed-onchain');
  });
  it('keeps semantic proof immutable across structural JSON copies and prevents retroactive proof', () => {
    const previous = { semanticProof: fixture.expected.semanticProof, slippageBps: 100, reason: 'review' };
    expect(mergeAttemptEvidence(previous, { semanticProof: structuredClone(fixture.expected.semanticProof), reason: 'confirmed' })).toMatchObject({ semanticProof: fixture.expected.semanticProof });
    expect(() => mergeAttemptEvidence(previous, { semanticProof: { ...fixture.expected.semanticProof, minimumOutputRaw: '1' } })).toThrow('immutable');
    expect(() => mergeAttemptEvidence(previous, { slippageBps: 200 })).toThrow('immutable');
    expect(() => mergeAttemptEvidence({ reason: 'legacy' }, { semanticProof: fixture.expected.semanticProof })).toThrow('cannot acquire');
  });
});
