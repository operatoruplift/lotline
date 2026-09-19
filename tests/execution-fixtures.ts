import { createHash } from 'node:crypto';
import { address, getAddressFromPublicKey } from '@solana/addresses';
import { generateKeyPair } from '@solana/keys';
import { getCompiledTransactionMessageEncoder } from '@solana/transaction-messages';
import { getSignatureFromTransaction, getTransactionEncoder, signTransaction, type Transaction } from '@solana/transactions';
import { MAINNET_GENESIS_HASH } from '../lib/server/execution/receipts';
import { TOKEN_2022_PROGRAM, TOKEN_PROGRAM, USDC_MINT } from '../lib/server/common';

/** Local cryptographic fixture only: this instruction is not an executable Jupiter swap. */
export async function executionFixture() {
  const keyPair = await generateKeyPair();
  const wallet = await getAddressFromPublicKey(keyPair.publicKey);
  const outputMint = 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp';
  const originalBlockhash = '11111111111111111111111111111111';
  const accounts = await Promise.all(Array.from({ length: 3 }, async () => getAddressFromPublicKey((await generateKeyPair()).publicKey)));
  const compiled = {
    version: 0 as const,
    header: { numSignerAccounts: 1, numReadonlySignerAccounts: 0, numReadonlyNonSignerAccounts: 1 },
    staticAccounts: [wallet, address(USDC_MINT), address(outputMint), ...accounts, address(TOKEN_PROGRAM)],
    instructions: [{ programAddressIndex: 6, accountIndices: [0, 1, 2, 3, 4, 5], data: new Uint8Array([1]) }],
    lifetimeToken: address(originalBlockhash),
  };
  const messageBytes = getCompiledTransactionMessageEncoder().encode(compiled) as Transaction['messageBytes'];
  const transaction: Transaction = { messageBytes, signatures: { [wallet]: null } };
  const signed = await signTransaction([keyPair], transaction);
  const encode = (tx: Transaction) => Buffer.from(getTransactionEncoder().encode(tx)).toString('base64');
  const unsignedBase64 = encode(transaction);
  const signedBase64 = encode(signed);
  const messageHash = createHash('sha256').update(Buffer.from(messageBytes)).digest('hex');
  const signature = getSignatureFromTransaction(signed);
  const expected = { wallet, signature, messageHash, transaction: unsignedBase64, originalBlockhash, inputMint: USDC_MINT, outputMint, maximumInputRaw: '1000000', minimumOutputRaw: '990', maximumTotalSolCostLamports: '10000000' };
  const token = (accountIndex: number, mint: string, amount: string) => ({ accountIndex, mint, owner: wallet, programId: mint === USDC_MINT ? TOKEN_PROGRAM : TOKEN_2022_PROGRAM, uiTokenAmount: { amount, decimals: 6 } });
  const payload = {
    genesisHash: MAINNET_GENESIS_HASH,
    statuses: { value: [{ slot: 1234, confirmationStatus: 'confirmed', err: null as unknown }] },
    transaction: {
      slot: 1234, blockTime: 1789804800, version: 0,
      transaction: [signedBase64, 'base64'],
      meta: { err: null as unknown, fee: 5000,
        preBalances: [100000000, 1, 1, 2039280, 2039280, 2039280, 1],
        postBalances: [99995000, 1, 1, 2039280, 2039280, 2039280, 1],
        preTokenBalances: [token(3, USDC_MINT, '2000000'), token(4, outputMint, '100'), token(5, USDC_MINT, '500000')],
        postTokenBalances: [token(3, USDC_MINT, '1300000'), token(4, outputMint, '1100'), token(5, USDC_MINT, '200000')],
        loadedAddresses: { writable: [], readonly: [] },
      },
    },
  };
  const intent = { version: 1 as const, chain: 'solana:mainnet' as const, wallet, inputMint: USDC_MINT, budgetRaw: '1000000', legs: [{ id: 'aaplx', issuerId: 'AAPLx', mint: outputMint, allocationBps: 10000, maximumInputRaw: '1000000' }], policyVersion: 'fixture', reviewedLimits: { slippageBps: 100, maximumPriorityFeeLamports: '5000000', maximumTotalSolCostLamports: '10000000', maximumTokenFeeBps: 100 } };
  const order = { requestId: 'fixture-request', transaction: unsignedBase64, inputMint: USDC_MINT, outputMint, inAmount: '1000000', outAmount: '1000', otherAmountThreshold: '990', router: 'metis', taker: wallet, swapMode: 'ExactIn', slippageBps: 100, prioritizationFeeLamports: 5000, signatureFeeLamports: 5000, rentFeeLamports: 0, signatureFeePayer: wallet, prioritizationFeePayer: wallet, rentFeePayer: null, feeBps: 0, feeMint: USDC_MINT };
  const asset = { symbol: 'AAPLx', name: 'Apple', mint: outputMint, decimals: 6, tokenProgram: TOKEN_2022_PROGRAM, halted: false, verifiedAt: new Date().toISOString() };
  return { keyPair, compiled, transaction, signed, unsignedBase64, signedBase64, messageHash, expected, payload, intent, order, asset, encode };
}
