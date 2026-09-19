import { expect, it } from 'vitest';
import { requireSemanticProof } from '../lib/server/execution/proof-policy';
import { MAINNET_GENESIS_HASH } from '../lib/server/solana-network';
import { TOKEN_2022_PROGRAM } from '../lib/server/common';
import { syntheticKey } from './semantic-fixtures';
const proof = { version: 'jupiter-route-v2-raydium-clmm-v1', genesisHash: MAINNET_GENESIS_HASH, lookupContextSlot: 10, loadedAddresses: { writable: [], readonly: [] }, source: syntheticKey('source'), destination: syntheticKey('destination'), pool: syntheticKey('pool'), inputRaw: '1000000', minimumOutputRaw: '99502', tokenFeeRaw: '1000', simulationSlot: 11, unitsConsumed: 100000, networkFeeLamports: '6000', rentLamports: '0', totalSolCostLamports: '6000', checkedAt: '2026-09-20T00:00:00Z', issuerControlled: true, outputUnitContext: { source: 'clock-sysvar', kind: 'scaled', decimals: 8, tokenProgram: TOKEN_2022_PROGRAM, mintSlot: 12, clockSlot: 12, observedAt: '2026-09-20T00:00:00Z', unixTimestamp: '1789842617', multiplier: 1.003269 } };
const evidence = { validation: proof.version, semanticProof: proof, inAmount: '1000000', totalSolCostLamports: '6000' };
it('accepts complete preserved semantic proof and rejects legacy labels despite a valid proof object', () => {
 expect(requireSemanticProof(evidence,'1000000','99502')).toEqual(proof);
 expect(() => requireSemanticProof({...evidence,validation:'v0-payer-and-lifetime-checked'},'1000000','99502')).toThrow(/older review/);
});
it.each([null, {}, { ...proof, version:'unknown' }, { ...proof, genesisHash:'devnet' }, { ...proof, outputUnitContext:undefined }, { ...proof, inputRaw:'1' }, { ...proof, minimumOutputRaw:'1' }, { ...proof, totalSolCostLamports:'0' }])('rejects incomplete or changed proof %j', changed => {
 expect(() => requireSemanticProof({...evidence,semanticProof:changed},'1000000','99502')).toThrow();
});
