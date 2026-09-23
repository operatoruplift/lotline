import { PYTH_FEED_MAPPINGS, marketReferenceResponseSchema, pythConfidenceBps, pythDecimal, pythRatio, type MarketReferenceItem, type MarketReferenceResponse, type PythObservation } from '../../lib/domain/market-reference';

/** Controlled observations use the real pinned identities; no provider or wallet is called. */
export function pythReferences(mints: string[], now: number, price = '20000', age = 0): MarketReferenceResponse {
  const publishTime = Math.floor(now / 1000) - age;
  const fetchedAt = new Date(now).toISOString();
  const expiresAt = new Date((publishTime + 60) * 1000).toISOString();
  const observationState = age >= 60 ? 'stale' : 'fresh';
  const observation = (mapping: typeof PYTH_FEED_MAPPINGS[number], kind: PythObservation['kind']): PythObservation => ({
    feedId: mapping[kind], symbol: kind === 'token' ? `Crypto.${mapping.symbol}X/USD` : `Equity.US.${mapping.symbol}/USD`,
    kind, quoteCurrency: 'USD', unitBasis: kind === 'token' ? 'unverified-token-unit' : 'underlying-share',
    price, confidence: '10', exponent: -2, publishTime, publishedAt: new Date(publishTime * 1000).toISOString(), fetchedAt, expiresAt, state: observationState,
    displayPrice: pythDecimal(price, -2), displayConfidence: '0.1', confidenceBps: pythConfidenceBps(price, '10'),
  });
  const items: MarketReferenceItem[] = mints.map(mint => {
    const mapping = PYTH_FEED_MAPPINGS.find(mapping => mapping.mint === mint);
    if (!mapping) return { mint, state: 'unavailable', comparison: 'not-comparable' };
    const underlying = observation(mapping, 'underlying');
    const token = observation(mapping, 'token');
    return { mint, state: age >= 60 ? 'stale' : 'success', underlying, token, ...(age >= 60 ? { comparison: 'not-comparable' as const } : { comparison: 'cross-feed-context' as const, comparisonRatio: pythRatio(token, underlying) }) };
  });
  const hasObservations = items.some(item => item.underlying || item.token);
  const state = !hasObservations ? 'unavailable' : age >= 60 ? 'stale' : items.every(item => item.state === 'success') ? 'success' : 'partial';
  return marketReferenceResponseSchema.parse({ source: 'pyth', state, fetchedAt, expiresAt: hasObservations ? expiresAt : fetchedAt, items });
}
