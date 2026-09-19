import 'server-only';
import { getAddressDecoder } from '@solana/kit';
import type { CompiledTransactionMessage } from '@solana/transaction-messages';
import { z } from 'zod';
import { addressSchema, rawSchema, ServiceError, U64_MAX } from '@/lib/server/common';
import { rpcRequest } from '@/lib/server/solana';

export const LOOKUP_TABLE_PROGRAM = 'AddressLookupTab1e1111111111111111111111111';
const rpcInteger = z.union([rawSchema, z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).transform(String)]);
export const chainAccountSchema = z.object({
  owner: addressSchema, executable: z.boolean(), lamports: rpcInteger,
  data: z.tuple([z.string().max(200_000), z.literal('base64')]),
});
export type ChainAccount = z.infer<typeof chainAccountSchema>;
export type ResolvedAccount = { address: string; signer: boolean; writable: boolean };
export type ResolvedMessage = {
  accounts: ResolvedAccount[];
  loadedAddresses: { writable: string[]; readonly: string[] };
  lookupContextSlot: string | null;
};

function unavailable(message: string): never { throw new ServiceError('unavailable', message); }

export function accountBytes(account: ChainAccount): Buffer {
  const encoded = account.data[0];
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) unavailable('The chain account encoding is invalid.');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')) unavailable('The chain account encoding is not canonical.');
  return bytes;
}

/** A single confirmed bank snapshot, never a client-selected RPC or parsed token account. */
export async function readChainAccounts(addresses: string[], minContextSlot?: string): Promise<{ slot: string; accounts: (ChainAccount | null)[] }> {
  if (!addresses.length || addresses.length > 100 || addresses.some(item => !addressSchema.safeParse(item).success)) unavailable('The transaction requests an unsupported account set.');
  const minimum = minContextSlot === undefined ? undefined : Number(minContextSlot);
  if (minimum !== undefined && (!Number.isSafeInteger(minimum) || minimum < 0)) unavailable('The transaction account context is invalid.');
  const parsed = z.object({ context: z.object({ slot: rpcInteger }), value: z.array(chainAccountSchema.nullable()).max(100) }).safeParse(
    await rpcRequest('getMultipleAccounts', [addresses, { encoding: 'base64', commitment: 'confirmed', ...(minimum === undefined ? {} : { minContextSlot: minimum }) }]),
  );
  if (!parsed.success || parsed.data.value.length !== addresses.length || (minContextSlot !== undefined && BigInt(parsed.data.context.slot) < BigInt(minContextSlot))) unavailable('The transaction account snapshot is incomplete or stale.');
  return { slot: parsed.data.context.slot, accounts: parsed.data.value };
}

/** Solana's 56-byte LookupTableMeta + packed Pubkeys. Reject deactivating tables. */
export function decodeLookupTable(account: ChainAccount, observedSlot: string): string[] {
  if (account.owner !== LOOKUP_TABLE_PROGRAM || account.executable) unavailable('The lookup table is not owned by the Solana lookup-table program.');
  const bytes = accountBytes(account);
  if (bytes.length < 56 || bytes.length > 56 + 256 * 32 || (bytes.length - 56) % 32 !== 0 || bytes.readUInt32LE(0) !== 1 || bytes[21] > 1) unavailable('The lookup table layout is unsupported.');
  if (bytes.readBigUInt64LE(4) !== U64_MAX) unavailable('The lookup table is deactivated or deactivating. Refresh the order.');
  const extendedSlot = bytes.readBigUInt64LE(12);
  if (extendedSlot > BigInt(observedSlot)) unavailable('The lookup table observation predates its extension.');
  const storedCount = (bytes.length - 56) / 32;
  const activeCount = extendedSlot === BigInt(observedSlot) ? bytes[20] : storedCount;
  if (activeCount > storedCount) unavailable('The lookup table extension boundary is invalid.');
  const decode = getAddressDecoder();
  return Array.from({ length: activeCount }, (_, index) => String(decode.decode(bytes.subarray(56 + index * 32, 88 + index * 32))));
}

/** Resolve runtime order: static accounts, all loaded writable, all loaded readonly. */
export async function resolveMessageAccounts(message: CompiledTransactionMessage): Promise<ResolvedMessage> {
  if (message.version !== 0) unavailable('Only Solana v0 transactions are supported.');
  const header = message.header;
  const staticCount = message.staticAccounts.length;
  if (header.numSignerAccounts !== 1 || header.numReadonlySignerAccounts !== 0 || header.numReadonlyNonSignerAccounts > staticCount - 1) unavailable('The transaction signer or account permissions are unsupported.');
  const accounts: ResolvedAccount[] = message.staticAccounts.map((item, index) => ({ address: String(item), signer: index === 0, writable: index < staticCount - header.numReadonlyNonSignerAccounts }));
  const lookups = message.addressTableLookups ?? [];
  const loadedAddresses: ResolvedMessage['loadedAddresses'] = { writable: [], readonly: [] };
  let lookupContextSlot: string | null = null;
  if (lookups.length) {
    if (lookups.length > 16 || new Set(lookups.map(item => item.lookupTableAddress)).size !== lookups.length) unavailable('The transaction contains duplicate or excessive lookup tables.');
    const snapshot = await readChainAccounts(lookups.map(item => String(item.lookupTableAddress)));
    lookupContextSlot = snapshot.slot;
    lookups.forEach((lookup, index) => {
      const account = snapshot.accounts[index];
      if (!account) unavailable('A transaction lookup table is missing.');
      const addresses = decodeLookupTable(account, snapshot.slot);
      const indexes = [...lookup.writableIndexes, ...lookup.readonlyIndexes];
      if (new Set(indexes).size !== indexes.length || indexes.some(value => value >= addresses.length)) unavailable('The transaction references an unavailable lookup-table address.');
      loadedAddresses.writable.push(...lookup.writableIndexes.map(value => addresses[value]));
      loadedAddresses.readonly.push(...lookup.readonlyIndexes.map(value => addresses[value]));
    });
    accounts.push(...loadedAddresses.writable.map(address => ({ address, signer: false, writable: true })), ...loadedAddresses.readonly.map(address => ({ address, signer: false, writable: false })));
  }
  if (!accounts.length || accounts.length > 100 || new Set(accounts.map(item => item.address)).size !== accounts.length) unavailable('The resolved transaction account set is unsupported or contains duplicates.');
  if (!message.instructions.length || message.instructions.some(instruction => instruction.programAddressIndex >= accounts.length || (instruction.accountIndices ?? []).some(index => index >= accounts.length))) unavailable('The transaction contains an invalid instruction account index.');
  for (const instruction of message.instructions) {
    const program = accounts[instruction.programAddressIndex];
    if (program.signer || program.writable) unavailable('An executable program cannot be a writable account or signer.');
  }
  return { accounts, loadedAddresses, lookupContextSlot };
}
