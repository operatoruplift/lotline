import 'server-only';
import { createHash } from 'node:crypto';
import { getPublicKeyFromAddress, isAddress } from '@solana/addresses';
import { verifySignature } from '@solana/keys';
import { getTransactionDecoder, getTransactionEncoder, getTransactionSize, type Transaction } from '@solana/transactions';
import { getBase58Decoder } from '@solana/codecs-strings';
import type { Address } from '@solana/addresses';
import { z } from 'zod';
import type { ExecutionOrder } from './orders';
import { fetchJson, rawSchema, ServiceError } from '@/lib/server/common';
import { reserveProviderSlot } from '@/lib/server/provider-limits';

const MAX_TRANSACTION_BYTES = 1232;
const executeResponseSchema = z.object({
  status: z.enum(['Success', 'Failed']),
  signature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{80,100}$/).optional(),
  code: z.number().int().optional(),
  error: z.string().max(500).optional(),
  inputAmountResult: rawSchema.optional(),
  outputAmountResult: rawSchema.optional(),
}).passthrough();

function decodeBase64(value: string): Uint8Array {
  if (value.length > 1644 || value.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new ServiceError('invalid-input', 'The signed transaction is not valid base64.');
  const bytes = new Uint8Array(Buffer.from(value, 'base64'));
  if (!bytes.length || bytes.length > MAX_TRANSACTION_BYTES || Buffer.from(bytes).toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')) throw new ServiceError('invalid-input', 'The signed transaction could not be decoded.');
  return bytes;
}

/** Validate the exact transaction the server approved before it is sent to Jupiter. */
export async function validateSignedTransaction(order: Pick<ExecutionOrder, 'transaction' | 'messageHash'>, signedTransaction: string, wallet: string): Promise<{ encoded: string; signature: string; chainSignature: string; signedTransactionHash: string }> {
  const approvedBytes = decodeBase64(order.transaction);
  const signedBytes = decodeBase64(signedTransaction);
  let approved: Transaction;
  let signed: Transaction;
  try {
    approved = getTransactionDecoder().decode(approvedBytes);
    signed = getTransactionDecoder().decode(signedBytes);
  } catch { throw new ServiceError('invalid-input', 'The signed transaction could not be decoded safely.'); }
  if (!Buffer.from(getTransactionEncoder().encode(approved)).equals(Buffer.from(approvedBytes)) || !Buffer.from(getTransactionEncoder().encode(signed)).equals(Buffer.from(signedBytes))) throw new ServiceError('invalid-input', 'The transaction contains trailing or noncanonical bytes.');
  if (getTransactionSize(signed) > MAX_TRANSACTION_BYTES) throw new ServiceError('invalid-input', 'The signed transaction exceeds Solana’s size limit.');
  const signedMessage = signed.messageBytes as unknown as Uint8Array;
  const approvedMessage = approved.messageBytes as unknown as Uint8Array;
  const signedHash = createHash('sha256').update(signedMessage).digest('hex');
  const approvedHash = createHash('sha256').update(approvedMessage).digest('hex');
  if (signedHash !== order.messageHash || approvedHash !== order.messageHash || Buffer.compare(Buffer.from(signedMessage), Buffer.from(approvedMessage)) !== 0) throw new ServiceError('invalid-input', 'The signed bytes do not match the reviewed order. Refresh the review and sign that transaction.');
  if (!isAddress(wallet) || !(wallet in signed.signatures)) throw new ServiceError('invalid-input', 'The connected wallet is not a required signer for this order.');
  if (Object.keys(approved.signatures).length !== 1 || Object.keys(signed.signatures).length !== 1 || approved.signatures[wallet] !== null) throw new ServiceError('invalid-input', 'This order needs another signer or is already signed. Lotline only supports one wallet signer.');
  const signature = signed.signatures[wallet];
  if (!signature || signature.length !== 64) throw new ServiceError('invalid-input', 'The wallet did not provide a complete signature.');
  try {
    const publicKey = await getPublicKeyFromAddress(wallet as Address);
    if (!(await verifySignature(publicKey, signature, signedMessage))) throw new ServiceError('invalid-input', 'The wallet signature could not be verified.');
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError('invalid-input', 'The wallet signature could not be verified.');
  }
  const encoded = Buffer.from(getTransactionEncoder().encode(signed)).toString('base64');
  const firstSignature = signed.signatures[Object.keys(signed.signatures)[0] as keyof typeof signed.signatures];
  if (!firstSignature) throw new ServiceError('invalid-input', 'The signed transaction has no fee-payer signature.');
  const chainSignature = getBase58Decoder().decode(firstSignature);
  return { encoded, signature: Buffer.from(signature).toString('base64'), chainSignature, signedTransactionHash: createHash('sha256').update(signedBytes).digest('hex') };
}

export async function executeOnJupiter(signedTransaction: string, requestId: string, expectedSignature: string, lastValidBlockHeight?: string): Promise<{ status: 'Success' | 'Failed'; signature?: string; code?: number; error?: string; inputAmountResult?: string; outputAmountResult?: string }> {
  const apiKey = process.env.JUPITER_API_KEY?.trim();
  if (!apiKey) throw new ServiceError('configuration-required', 'Executable orders need a server-side Jupiter API key.');
  await reserveProviderSlot('jupiter');
  const payload = await fetchJson('https://api.jup.ag/swap/v2/execute', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': apiKey }, body: JSON.stringify({ signedTransaction, requestId, ...(lastValidBlockHeight ? { lastValidBlockHeight } : {}) }) });
  const parsed = executeResponseSchema.safeParse(payload);
  if (!parsed.success) throw new ServiceError('unavailable', 'Jupiter returned an unsupported execution response.');
  if (parsed.data.status === 'Success' && !parsed.data.signature) throw new ServiceError('unavailable', 'Jupiter accepted the order without a transaction signature.');
  if (parsed.data.signature && parsed.data.signature !== expectedSignature) throw new ServiceError('unavailable', 'Jupiter returned a signature that does not match the reviewed transaction.');
  return parsed.data;
}
