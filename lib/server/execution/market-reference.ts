import 'server-only';
import { PYTH_MAPPED_MINTS, pythReferencesReady } from '@/lib/domain/market-reference';
import { getMarketReferences } from '@/lib/server/pyth';
import { ServiceError } from '@/lib/server/common';

/** Recheck server observations before preparing or submitting a mapped asset. */
export async function requirePythReview(mint: string): Promise<number | null> {
  if (!PYTH_MAPPED_MINTS.includes(mint)) return null;
  const references = await getMarketReferences([mint]);
  if (!pythReferencesReady(references, [mint])) {
    throw new ServiceError('unavailable', 'Fresh Pyth equity and token references are required for this purchase. They may be unavailable outside market hours. Refresh references before reviewing again. No transaction was submitted.');
  }
  const item = references.items.find(item => item.mint === mint)!;
  return Math.min(Date.parse(item.underlying!.expiresAt), Date.parse(item.token!.expiresAt));
}

export class ReviewExpiredBeforeDispatch extends ServiceError {
  constructor() { super('unavailable', 'The order or Pyth references expired before transmission. Refresh estimates and references before reviewing again.'); }
}

export function requireCurrentReview(referenceExpiry: number | null, orderExpiry?: string | null): void {
  const deadline = Math.min(referenceExpiry ?? Infinity, orderExpiry ? Date.parse(orderExpiry) : Infinity);
  if (Number.isNaN(deadline) || Date.now() >= deadline) throw new ReviewExpiredBeforeDispatch();
}
