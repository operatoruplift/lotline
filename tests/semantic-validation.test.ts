import { beforeEach, describe, expect, it, vi } from 'vitest';
import { address } from '@solana/kit';
import { accountBytes, decodeLookupTable, LOOKUP_TABLE_PROGRAM, resolveMessageAccounts } from '../lib/server/execution/chain-accounts';
import { inspectRouteAccounts, inspectRouteInstructions, inspectTokenAccount, JUPITER_PROGRAM, RAYDIUM_CLMM_PROGRAM } from '../lib/server/execution/route-semantics';
import { inspectSimulation } from '../lib/server/execution/semantic-validation';
import { rpcRequest } from '../lib/server/solana';
import { TOKEN_2022_PROGRAM, TOKEN_PROGRAM, U64_MAX, USDC_MINT } from '../lib/server/common';
import { binaryAccount, keyBytes, mutateRoute, semanticFixture, syntheticKey, tokenAccount } from './semantic-fixtures';

vi.mock('../lib/server/solana', async original => ({ ...await original<typeof import('../lib/server/solana')>(), rpcRequest: vi.fn() }));
beforeEach(() => vi.mocked(rpcRequest).mockReset());

describe('encoded Jupiter route_v2 semantic policy — controlled synthetic accounts', () => {
  it('accepts the direct exact-in route and proves its gross input, rounded minimum and default fee', async () => {
    const f = semanticFixture(); const resolved = await resolveMessageAccounts(f.message);
    const proof = inspectRouteInstructions(f.message, resolved, f.order, f.wallet);
    expect(proof).toMatchObject({ source: f.source, destination: f.destination, pool: f.pool, encodedInputRaw: '1000000', encodedMinimumOutputRaw: '99502', tokenFeeRaw: '1000', priorityFeeLamports: '1000', createsDestination: false });
    const accounts = inspectRouteAccounts(proof, f.chain, f.outputMint, f.wallet);
    expect(accounts.source.amount).toBe(2_000_000n);
    expect(accounts.destination?.amount).toBe(500n);
    expect(rpcRequest).not.toHaveBeenCalled();
  });

  it.each([
    ['wrong input', (data: Buffer) => data.writeBigUInt64LE(1_000_001n, 8)],
    ['weakened output', (data: Buffer) => data.writeBigUInt64LE(1n, 16)],
    ['broadened slippage', (data: Buffer) => data.writeUInt16LE(500, 24)],
    ['hidden referral fee', (data: Buffer) => data.writeUInt16LE(11, 26)],
    ['positive slippage fee', (data: Buffer) => data.writeUInt16LE(1, 28)],
    ['multiple route legs', (data: Buffer) => data.writeUInt32LE(2, 30)],
    ['unknown swap variant', (data: Buffer) => { data[34] = 255; }],
    ['partial route percentage', (data: Buffer) => data.writeUInt16LE(9999, 35)],
    ['wrong output token index', (data: Buffer) => { data[38] = 0; }],
  ] as const)('rejects %s encoded inside the actual route instruction', async (_label, mutate) => {
    const f = semanticFixture(); const message = mutateRoute(f.message, mutate);
    const resolved = await resolveMessageAccounts(message);
    expect(() => inspectRouteInstructions(message, resolved, f.order, f.wallet)).toThrow();
  });

  it('does not accept a different provider minimum or understated compute fee', async () => {
    const f = semanticFixture(); const resolved = await resolveMessageAccounts(f.message);
    expect(() => inspectRouteInstructions(f.message, resolved, { ...f.order, minimumOutputRaw: '99501' }, f.wallet)).toThrow(/minimum/);
    expect(() => inspectRouteInstructions(f.message, resolved, { ...f.order, prioritizationFeeLamports: '999' }, f.wallet)).toThrow(/compute fee/);
  });

  it('rejects a redirected destination, wrong token program, and additional top-level transfer', async () => {
    const f = semanticFixture(); const resolved = await resolveMessageAccounts(f.message);
    const original = f.message.instructions.at(-1)!;
    const indices = [...original.accountIndices!]; indices[16] = f.index(f.inputVault);
    const redirected = { ...f.message, instructions: [...f.message.instructions.slice(0, -1), { ...original, accountIndices: indices }] };
    expect(() => inspectRouteInstructions(redirected, resolved, f.order, f.wallet)).toThrow(/recipient|CPI/);
    const programs = [...original.accountIndices!]; programs[6] = f.index(TOKEN_PROGRAM);
    expect(() => inspectRouteInstructions({ ...redirected, instructions: [...f.message.instructions.slice(0, -1), { ...original, accountIndices: programs }] }, resolved, f.order, f.wallet)).toThrow();
    const extra = { programAddressIndex: f.index(TOKEN_PROGRAM), accountIndices: [f.index(f.source), f.index(f.inputVault), 0], data: new Uint8Array([3, 1, 0, 0, 0, 0, 0, 0, 0]) };
    expect(() => inspectRouteInstructions({ ...f.message, instructions: [...f.message.instructions, extra] }, resolved, f.order, f.wallet)).toThrow();
  });

  it('binds vaults, tick arrays, token owner and delegate state to the reviewed wallet and pool', async () => {
    const f = semanticFixture(); const proof = inspectRouteInstructions(f.message, await resolveMessageAccounts(f.message), f.order, f.wallet);
    const redirected = new Map(f.chain); redirected.set(f.destination, tokenAccount(f.outputMint, syntheticKey('attacker'), 500n, TOKEN_2022_PROGRAM));
    expect(() => inspectRouteAccounts(proof, redirected, f.outputMint, f.wallet)).toThrow(/ownership/);
    const wrongPool = new Map(f.chain); const pool = accountBytes(f.chain.get(f.pool)!); keyBytes(syntheticKey('foreign-vault')).copy(pool, 137); wrongPool.set(f.pool, binaryAccount(RAYDIUM_CLMM_PROGRAM, pool));
    expect(() => inspectRouteAccounts(proof, wrongPool, f.outputMint, f.wallet)).toThrow(/pool does not bind/);
    const wrongTick = new Map(f.chain); const tick = accountBytes(f.chain.get(f.tick)!); keyBytes(syntheticKey('foreign-pool')).copy(tick, 8); wrongTick.set(f.tick, binaryAccount(RAYDIUM_CLMM_PROGRAM, tick));
    expect(() => inspectRouteAccounts(proof, wrongTick, f.outputMint, f.wallet)).toThrow(/different pool/);
    const delegated = accountBytes(f.chain.get(f.source)!); delegated.writeUInt32LE(1, 72); keyBytes(syntheticKey('delegate')).copy(delegated, 76);
    expect(() => inspectTokenAccount(binaryAccount(TOKEN_PROGRAM, delegated), { mint: USDC_MINT, owner: f.wallet, program: TOKEN_PROGRAM })).toThrow(/authority/);
  });

  it('rejects read-only pool accounts, unused writable accounts, and mismatched ATA destination', async () => {
    const f = semanticFixture(true); const resolved = await resolveMessageAccounts(f.message);
    const readonlyPool = { ...resolved, accounts: resolved.accounts.map(account => account.address === f.pool ? { ...account, writable: false } : account) };
    expect(() => inspectRouteInstructions(f.message, readonlyPool, f.order, f.wallet)).toThrow(/permissions/);
    expect(() => inspectRouteInstructions(f.message, { ...resolved, accounts: [...resolved.accounts, { address: syntheticKey('unused-writable'), writable: true, signer: false }] }, f.order, f.wallet)).toThrow(/unused writable/);
    const instructions = f.message.instructions.map((instruction, index) => index === 2 ? { ...instruction, accountIndices: [...instruction.accountIndices!].map((account, accountIndex) => accountIndex === 1 ? f.index(f.source) : account) } : instruction);
    expect(() => inspectRouteInstructions({ ...f.message, instructions }, resolved, f.order, f.wallet)).toThrow(/created account/);
  });

  it.each(['frozen', 'close-authority', 'wrong-program'] as const)('rejects token account %s control', mutation => {
    const f = semanticFixture(); const account = f.chain.get(f.source)!; const bytes = accountBytes(account);
    if (mutation === 'frozen') bytes[108] = 2;
    if (mutation === 'close-authority') { bytes.writeUInt32LE(1, 129); keyBytes(syntheticKey('closer')).copy(bytes, 133); }
    expect(() => inspectTokenAccount(binaryAccount(mutation === 'wrong-program' ? TOKEN_2022_PROGRAM : TOKEN_PROGRAM, bytes), { mint: USDC_MINT, owner: f.wallet, program: TOKEN_PROGRAM })).toThrow();
  });
});

describe('lookup-table ownership, warmup, indices and resolved permissions', () => {
  const lookup = (keys: string[], extendedSlot = 100n, boundary = keys.length) => {
    const bytes = Buffer.alloc(56 + keys.length * 32); bytes.writeUInt32LE(1); bytes.writeBigUInt64LE(U64_MAX, 4); bytes.writeBigUInt64LE(extendedSlot, 12); bytes[20] = boundary;
    keys.forEach((key, index) => keyBytes(key).copy(bytes, 56 + index * 32));
    return binaryAccount(LOOKUP_TABLE_PROGRAM, bytes);
  };

  it('resolves all writable addresses before readonly addresses across separate tables', async () => {
    const f = semanticFixture(); const w1 = syntheticKey('loaded-w1'); const r1 = syntheticKey('loaded-r1'); const w2 = syntheticKey('loaded-w2'); const r2 = syntheticKey('loaded-r2');
    vi.mocked(rpcRequest).mockResolvedValue({ context: { slot: 200 }, value: [lookup([w1, r1]), lookup([w2, r2])] });
    const result = await resolveMessageAccounts({ ...f.message, addressTableLookups: [{ lookupTableAddress: address(syntheticKey('table1')), writableIndexes: [0], readonlyIndexes: [1] }, { lookupTableAddress: address(syntheticKey('table2')), writableIndexes: [0], readonlyIndexes: [1] }] });
    expect(result.loadedAddresses).toEqual({ writable: [w1, w2], readonly: [r1, r2] });
    expect(result.accounts.slice(-4)).toEqual([{ address: w1, writable: true, signer: false }, { address: w2, writable: true, signer: false }, { address: r1, writable: false, signer: false }, { address: r2, writable: false, signer: false }]);
    expect(result.lookupContextSlot).toBe('200');
  });

  it('validates the same encoded route after real instruction accounts move into a lookup table', async () => {
    const f = semanticFixture();
    const writable = [f.source, f.destination, f.pool, f.inputVault, f.outputVault]; const readonly = [f.outputMint];
    const loaded = [...writable, ...readonly];
    const staticAccounts = f.message.staticAccounts.filter(key => !loaded.includes(String(key)));
    const all = [...staticAccounts.map(String), ...loaded];
    const translated = { ...f.message, header: { ...f.message.header, numReadonlyNonSignerAccounts: f.message.header.numReadonlyNonSignerAccounts - 1 }, staticAccounts,
      addressTableLookups: [{ lookupTableAddress: address(syntheticKey('route-table')), writableIndexes: [0, 1, 2, 3, 4], readonlyIndexes: [5] }],
      instructions: f.message.instructions.map(instruction => ({ ...instruction, programAddressIndex: all.indexOf(String(f.message.staticAccounts[instruction.programAddressIndex])), accountIndices: instruction.accountIndices?.map(index => all.indexOf(String(f.message.staticAccounts[index]))) })),
    };
    vi.mocked(rpcRequest).mockResolvedValue({ context: { slot: 200 }, value: [lookup(loaded)] });
    const resolved = await resolveMessageAccounts(translated);
    expect(inspectRouteInstructions(translated, resolved, f.order, f.wallet)).toMatchObject({ source: f.source, destination: f.destination, encodedInputRaw: '1000000', encodedMinimumOutputRaw: '99502' });
    expect(resolved.accounts.at(-1)).toEqual({ address: f.outputMint, writable: false, signer: false });
  });

  it('does not expose newly extended addresses before the next slot', () => {
    const keys = [syntheticKey('old'), syntheticKey('new')]; const table = lookup(keys, 200n, 1);
    expect(decodeLookupTable(table, '200')).toEqual([keys[0]]);
    expect(decodeLookupTable(table, '201')).toEqual(keys);
    expect(() => decodeLookupTable(table, '199')).toThrow(/predates/);
  });

  it('rejects incorrect owner, deactivation, malformed layout and noncanonical account encoding', () => {
    const table = lookup([syntheticKey('table-entry')]);
    expect(() => decodeLookupTable({ ...table, owner: address(TOKEN_PROGRAM) }, '200')).toThrow(/owned/);
    const deactivated = accountBytes(table); deactivated.writeBigUInt64LE(199n, 4);
    expect(() => decodeLookupTable(binaryAccount(LOOKUP_TABLE_PROGRAM, deactivated), '200')).toThrow(/deactivat/);
    expect(() => decodeLookupTable(binaryAccount(LOOKUP_TABLE_PROGRAM, deactivated.subarray(0, 60)), '200')).toThrow(/layout/);
    expect(() => accountBytes({ ...table, data: ['AA*=', 'base64'] })).toThrow(/encoding/);
  });

  it.each(['missing', 'duplicate-index', 'out-of-bounds', 'duplicate-static', 'duplicate-table'] as const)('rejects %s lookup evidence', async kind => {
    const f = semanticFixture(); const table = lookup([kind === 'duplicate-static' ? f.wallet : syntheticKey('lookup-entry')]);
    vi.mocked(rpcRequest).mockResolvedValue({ context: { slot: 200 }, value: [kind === 'missing' ? null : table] });
    const entry = { lookupTableAddress: address(syntheticKey('table')), writableIndexes: [kind === 'out-of-bounds' ? 1 : 0], readonlyIndexes: kind === 'duplicate-index' ? [0] : [] };
    await expect(resolveMessageAccounts({ ...f.message, addressTableLookups: kind === 'duplicate-table' ? [entry, entry] : [entry] })).rejects.toThrow();
  });

  it('rejects an instruction program marked writable or an unresolved instruction index', async () => {
    const f = semanticFixture();
    await expect(resolveMessageAccounts({ ...f.message, instructions: [{ programAddressIndex: 1, accountIndices: [], data: new Uint8Array() }] })).rejects.toThrow(/writable/);
    await expect(resolveMessageAccounts({ ...f.message, instructions: [{ programAddressIndex: f.index(JUPITER_PROGRAM), accountIndices: [255], data: new Uint8Array() }] })).rejects.toThrow(/index/);
  });
});

describe('simulation proves same-bank gross input, output, fees and account bytes', () => {
  it.each([false, true])('accepts exact gross debit/output/SOL cost with destination creation=%s', async createsDestination => {
    const f = semanticFixture(createsDestination); const resolved = await resolveMessageAccounts(f.message); const route = inspectRouteInstructions(f.message, resolved, f.order, f.wallet);
    expect(inspectSimulation(f.simulation, resolved, route, f.order, f.wallet, 8, '6000', 200)).toEqual({ slot: 200, unitsConsumed: 120000, rentLamports: createsDestination ? '2039280' : '0', totalSolCostLamports: createsDestination ? '2045280' : '6000' });
  });

  it.each(['extra-usdc-debit', 'insufficient-output', 'wrong-token-owner', 'unreported-sol-transfer', 'wrong-fee', 'wrong-slot', 'wrong-lookup', 'account-bytes-disagree', 'missing-token-balance', 'duplicate-token-balance'] as const)('rejects %s rather than trusting provider success', async mutation => {
    const f = semanticFixture(); const resolved = await resolveMessageAccounts(f.message); const route = inspectRouteInstructions(f.message, resolved, f.order, f.wallet); const simulation = structuredClone(f.simulation);
    if (mutation === 'extra-usdc-debit') simulation.value.postTokenBalances[0].uiTokenAmount.amount = '999999';
    if (mutation === 'insufficient-output') simulation.value.postTokenBalances[1].uiTokenAmount.amount = '600';
    if (mutation === 'wrong-token-owner') simulation.value.postTokenBalances[1].owner = syntheticKey('attacker');
    if (mutation === 'unreported-sol-transfer') simulation.value.postBalances[f.index(f.inputVault)] = '2039281';
    if (mutation === 'wrong-fee') simulation.value.fee = 6001;
    if (mutation === 'wrong-slot') simulation.context.slot = 199;
    if (mutation === 'wrong-lookup') simulation.value.loadedAddresses.writable.push(syntheticKey('hidden-account'));
    if (mutation === 'account-bytes-disagree') simulation.value.accounts[2] = tokenAccount(f.outputMint, f.wallet, 1n, TOKEN_2022_PROGRAM);
    if (mutation === 'missing-token-balance') simulation.value.postTokenBalances.pop();
    if (mutation === 'duplicate-token-balance') simulation.value.postTokenBalances.push(simulation.value.postTokenBalances[0]);
    expect(() => inspectSimulation(simulation, resolved, route, f.order, f.wallet, 8, '6000', 200)).toThrow();
  });
});
