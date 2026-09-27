import { PYTH_FEED_MAPPINGS, marketReferenceResponseSchema, pythConfidenceBps, pythDecimal, pythRatio, type MarketReferenceItem, type MarketReferenceResponse, type PythObservation } from '../../lib/domain/market-reference';

/**
 * Controlled observations use the real pinned identities; no provider or wallet is
 * called. With closedMarket, each equity carries its last session print from an hour
 * ago flagged closed by Pyth (what Lazer sends over a weekend) while the token feed
 * stays current, so the item is partial and never comparable.
 */
export function pythReferences(mints: string[], now: number, price = '20000', age = 0, closedMarket = false): MarketReferenceResponse {
  const fetchedAt = new Date(now).toISOString();
  const observation = (mapping: typeof PYTH_FEED_MAPPINGS[number], kind: Exclude<PythObservation['kind'], 'currency'>): PythObservation => {
    const closed = closedMarket && kind === 'underlying';
    const publishTime = Math.floor(now / 1000) - (closed ? 3600 : age);
    const expiresAt = new Date((publishTime + 60) * 1000).toISOString();
    return {
      feedId: mapping[kind], symbol: kind === 'token' ? `Crypto.${mapping.symbol}X/USD` : `Equity.US.${mapping.symbol}/USD`,
      kind, quoteCurrency: 'USD', unitBasis: kind === 'token' ? 'unverified-token-unit' : 'underlying-share',
      price, confidence: '10', exponent: -2, publishTime, publishedAt: new Date(publishTime * 1000).toISOString(), fetchedAt, expiresAt, state: closed || age >= 60 ? 'stale' : 'fresh',
      displayPrice: pythDecimal(price, -2), displayConfidence: '0.1', confidenceBps: pythConfidenceBps(price, '10'),
      ...(closedMarket ? { provenance: 'lazer-proxy' as const, marketSession: closed ? 'closed' as const : 'regular' as const } : { provenance: 'hermes' as const }),
    };
  };
  const items: MarketReferenceItem[] = mints.map(mint => {
    const mapping = PYTH_FEED_MAPPINGS.find(mapping => mapping.mint === mint);
    if (!mapping) return { mint, state: 'unavailable', comparison: 'not-comparable' };
    const underlying = observation(mapping, 'underlying');
    const token = observation(mapping, 'token');
    if (closedMarket) return { mint, state: age >= 60 ? 'stale' : 'partial', underlying, token, comparison: 'not-comparable' as const };
    return { mint, state: age >= 60 ? 'stale' : 'success', underlying, token, ...(age >= 60 ? { comparison: 'not-comparable' as const } : { comparison: 'cross-feed-context' as const, comparisonRatio: pythRatio(token, underlying) }) };
  });
  const hasObservations = items.some(item => item.underlying || item.token);
  const expiries = items.flatMap(item => [item.underlying, item.token]).filter((value): value is PythObservation => Boolean(value)).map(value => Date.parse(value.expiresAt));
  const state = !hasObservations ? 'unavailable' : age >= 60 ? 'stale' : items.every(item => item.state === 'success') ? 'success' : 'partial';
  return marketReferenceResponseSchema.parse({ source: 'pyth', state, fetchedAt, expiresAt: hasObservations ? new Date(Math.min(...expiries)).toISOString() : fetchedAt, items });
}
