import 'server-only';
import { ServiceError } from '@/lib/server/common';
import { semanticProofSchema } from './receipts';
import { SEMANTIC_VALIDATOR_VERSION } from './route-semantics';

/** Old envelope-only attempts remain readable but can never enter the write path. */
export function requireSemanticProof(evidence: Record<string, unknown> | null | undefined, inputRaw: string, minimumOutputRaw: string) {
  const proof = semanticProofSchema.safeParse(evidence?.semanticProof);
  if (evidence?.validation !== SEMANTIC_VALIDATOR_VERSION || !proof.success || !proof.data.outputUnitContext || proof.data.inputRaw !== inputRaw || proof.data.inputRaw !== evidence.inAmount || proof.data.minimumOutputRaw !== minimumOutputRaw || proof.data.totalSolCostLamports !== evidence.totalSolCostLamports) throw new ServiceError('invalid-input', 'This older review does not have current transaction proof. Request a fresh purchase review.');
  return proof.data;
}
