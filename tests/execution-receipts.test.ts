import { beforeAll, describe, expect, it } from 'vitest';
import { verifyExecutionReceipt } from '../lib/server/execution/receipts';
import { executionFixture } from './execution-fixtures';

describe('execution chain receipt proof', () => {
  let fixture: Awaited<ReturnType<typeof executionFixture>>;
  beforeAll(async () => { fixture = await executionFixture(); });
  it('confirms the original signed message and exact owner token sums across accounts', async () => {
    const result = await verifyExecutionReceipt(fixture.payload, fixture.expected);
    expect(result.state).toBe('confirmed');
    expect(result.evidence).toMatchObject({ inputDebitRaw: '1000000', outputCreditRaw: '1000', feeLamports: '5000', walletSolDebitLamports: '5000', slot: '1234', confirmationStatus: 'confirmed' });
    expect(result.evidence.rawTokenBalances).toEqual({ before: fixture.payload.transaction.meta.preTokenBalances, after: fixture.payload.transaction.meta.postTokenBalances });
  });
  it('preserves uncertainty after provider timeout when RPC history is missing', async () => {
    expect((await verifyExecutionReceipt({ ...fixture.payload, statuses: { value: [null] }, transaction: null }, fixture.expected)).state).toBe('unknown');
    expect((await verifyExecutionReceipt({ ...fixture.payload, transaction: null }, fixture.expected)).state).toBe('unknown');
  });
  it('can confirm the original signature after an execution HTTP response was lost', async () => {
    const missing = await verifyExecutionReceipt({ ...fixture.payload, transaction: null }, fixture.expected);
    const recovered = await verifyExecutionReceipt(fixture.payload, fixture.expected);
    expect(missing.state).toBe('unknown');
    expect(recovered.state).toBe('confirmed');
    expect(recovered.evidence.signature).toBe(fixture.expected.signature);
  });
  it('requires mainnet identity and matching slots before accepting settlement', async () => {
    expect((await verifyExecutionReceipt({ ...fixture.payload, genesisHash: 'devnet' }, fixture.expected)).state).toBe('unknown');
    expect((await verifyExecutionReceipt({ ...fixture.payload, transaction: { ...fixture.payload.transaction, slot: 999 } }, fixture.expected)).state).toBe('unknown');
  });
  it('does not treat processed errors as final failure', async () => {
    const payload = structuredClone(fixture.payload);
    payload.statuses.value[0].confirmationStatus = 'processed';
    payload.statuses.value[0].err = { InstructionError: [0, 'Custom'] };
    expect((await verifyExecutionReceipt(payload, fixture.expected)).state).toBe('confirming');
  });
  it('records confirmed chain failure only with the original signed transaction', async () => {
    const payload = structuredClone(fixture.payload);
    payload.transaction.meta.err = payload.statuses.value[0].err = { InstructionError: [0, 'Custom'] };
    const result = await verifyExecutionReceipt(payload, fixture.expected);
    expect(result.state).toBe('failed-onchain');
    expect(result.evidence.metaError).toEqual(payload.transaction.meta.err);
    payload.transaction.transaction[0] = fixture.unsignedBase64;
    expect((await verifyExecutionReceipt(payload, fixture.expected)).state).toBe('unknown');
  });
  it('requires error evidence to be present and consistent', async () => {
    const payload = structuredClone(fixture.payload);
    payload.transaction.meta.err = undefined;
    expect((await verifyExecutionReceipt(payload, fixture.expected)).state).toBe('unknown');
    payload.transaction.meta.err = { InstructionError: [0, 'Custom'] };
    expect((await verifyExecutionReceipt(payload, fixture.expected)).state).toBe('unknown');
  });
  it.each(['wallet', 'signature', 'messageHash', 'originalBlockhash'] as const)('rejects a different original %s', async field => {
    expect((await verifyExecutionReceipt(fixture.payload, { ...fixture.expected, [field]: 'incorrect' })).state).toBe('unknown');
  });
  it('does not count output delivered to another wallet', async () => {
    const payload = structuredClone(fixture.payload);
    payload.transaction.meta.postTokenBalances[1].owner = fixture.expected.inputMint as typeof fixture.expected.wallet;
    expect((await verifyExecutionReceipt(payload, fixture.expected)).state).toBe('unknown');
  });
  it.each(['1', '899', '100000000000000000000000'])('rejects insufficient or overflowing raw output %s', async amount => {
    const payload = structuredClone(fixture.payload);
    payload.transaction.meta.postTokenBalances[1].uiTokenAmount.amount = amount;
    expect((await verifyExecutionReceipt(payload, fixture.expected)).state).toBe('unknown');
  });
  it('does not confirm a swap that spent more or less than the approved exact input', async () => {
    for (const amount of ['1299999', '1300001']) {
      const payload = structuredClone(fixture.payload);
      payload.transaction.meta.postTokenBalances[0].uiTokenAmount.amount = amount;
      expect((await verifyExecutionReceipt(payload, fixture.expected)).state).toBe('unknown');
    }
  });
  it('rejects token metadata duplicates, wrong programs, and missing owners', async () => {
    for (const update of [
      (payload: typeof fixture.payload) => payload.transaction.meta.postTokenBalances.push(payload.transaction.meta.postTokenBalances[0]),
      (payload: typeof fixture.payload) => { payload.transaction.meta.postTokenBalances[1].programId = fixture.payload.transaction.meta.postTokenBalances[0].programId; },
      (payload: typeof fixture.payload) => { Reflect.deleteProperty(payload.transaction.meta.postTokenBalances[1], 'owner'); },
    ]) {
      const payload = structuredClone(fixture.payload); update(payload);
      expect((await verifyExecutionReceipt(payload, fixture.expected)).state).toBe('unknown');
    }
  });
  it('records a newly created output account and a closed source account accurately', async () => {
    const payload = structuredClone(fixture.payload);
    payload.transaction.meta.preTokenBalances.splice(1, 1);
    payload.transaction.meta.postTokenBalances[1].uiTokenAmount.amount = '1000';
    payload.transaction.meta.postTokenBalances[0].uiTokenAmount.amount = '1500000';
    payload.transaction.meta.postTokenBalances.pop();
    expect((await verifyExecutionReceipt(payload, fixture.expected)).state).toBe('confirmed');
  });
  it('rejects excess network fees or native SOL debit', async () => {
    const feePayload = structuredClone(fixture.payload);
    feePayload.transaction.meta.fee = 10000001;
    expect((await verifyExecutionReceipt(feePayload, fixture.expected)).state).toBe('unknown');
    const rentPayload = structuredClone(fixture.payload);
    rentPayload.transaction.meta.postBalances[0] = 1;
    expect((await verifyExecutionReceipt(rentPayload, fixture.expected)).state).toBe('unknown');
  });
  it('rejects unsafe rounded JSON integers', async () => {
    const payload = structuredClone(fixture.payload);
    payload.transaction.slot = Number.MAX_SAFE_INTEGER + 1;
    payload.statuses.value[0].slot = Number.MAX_SAFE_INTEGER + 1;
    expect((await verifyExecutionReceipt(payload, fixture.expected)).state).toBe('unknown');
  });
});
