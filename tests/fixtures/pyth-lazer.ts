/**
 * A real answer from Pyth Lazer's keyless proxy: GET {LAZER_HOST}/v1/latest_price
 * for the seven pinned feeds on 2026-09-27T07:57:37.600Z (timestampUs 1790495857600000), a Sunday.
 * No credential was sent. USDC/USD and the three token feeds are in their regular
 * session and current to the request; the three equities carry Friday's last
 * print, published at 23:59:59 UTC, and are flagged marketSession 'closed' by Pyth itself.
 * Confidence and feedUpdateTimestamp arrive as JSON numbers, price as a string.
 */
export const LAZER_HOST = 'https://pyth-lazer-proxy-3.dourolabs.app';
export const LAZER_HOSTS = ['https://pyth-lazer-proxy-3.dourolabs.app', 'https://pyth-lazer-proxy-1.dourolabs.app', 'https://pyth-lazer-proxy-2.dourolabs.app'] as const;
export const LAZER_FETCHED_AT = '2026-09-27T07:57:37.600Z';
export const LAZER_TIMESTAMP_US = '1790495857600000';
export type LazerFeedJson = {
  priceFeedId: number; price: string; bestBidPrice: string; bestAskPrice: string; publisherCount: number; exponent: number;
  confidence: number; marketSession: string; emaPrice: string; emaConfidence: number; feedUpdateTimestamp: number;
};
export const LAZER_LIVE_FEEDS: readonly LazerFeedJson[] = [
  { priceFeedId: 7, price: '99989901', bestBidPrice: '99988506', bestAskPrice: '99999999', publisherCount: 21, exponent: -8, confidence: 26299, marketSession: 'regular', emaPrice: '99990860', emaConfidence: 25832, feedUpdateTimestamp: 1790495857600000 },
  { priceFeedId: 922, price: '34143006', bestBidPrice: '34140544', bestAskPrice: '34148000', publisherCount: 12, exponent: -5, confidence: 4994, marketSession: 'closed', emaPrice: '34125100', emaConfidence: 3719, feedUpdateTimestamp: 1790380799950000 },
  { priceFeedId: 1292, price: '51785207', bestBidPrice: '51785000', bestAskPrice: '51790000', publisherCount: 10, exponent: -5, confidence: 4793, marketSession: 'closed', emaPrice: '51784336', emaConfidence: 7177, feedUpdateTimestamp: 1790380799950000 },
  { priceFeedId: 1314, price: '22497508', bestBidPrice: '22495000', bestAskPrice: '22498626', publisherCount: 11, exponent: -5, confidence: 2508, marketSession: 'closed', emaPrice: '22502673', emaConfidence: 1623, feedUpdateTimestamp: 1790380799950000 },
  { priceFeedId: 1792, price: '34137990237', bestBidPrice: '34133563204', bestAskPrice: '34150531810', publisherCount: 6, exponent: -8, confidence: 8318171, marketSession: 'regular', emaPrice: '34129205240', emaConfidence: 11345580, feedUpdateTimestamp: 1790495857600000 },
  { priceFeedId: 1833, price: '22530472393', bestBidPrice: '22528972670', bestAskPrice: '22531972116', publisherCount: 11, exponent: -8, confidence: 4470501, marketSession: 'regular', emaPrice: '22514002540', emaConfidence: 4703996, feedUpdateTimestamp: 1790495857600000 },
  { priceFeedId: 3116, price: '51742543000', bestBidPrice: '51683889000', bestAskPrice: '51801197000', publisherCount: 3, exponent: -8, confidence: 288457000, marketSession: 'regular', emaPrice: '51736144500', emaConfidence: 269576195, feedUpdateTimestamp: 1790495857600000 },
];
export const LAZER_LIVE_PAYLOAD = { timestampUs: LAZER_TIMESTAMP_US, priceFeeds: LAZER_LIVE_FEEDS };

/** The live payload with per-feed overrides and optional omissions; the original is never mutated. */
export function lazerPayload(changes: Record<number, Partial<LazerFeedJson>> = {}, omit: readonly number[] = []) {
  return { timestampUs: LAZER_TIMESTAMP_US, priceFeeds: LAZER_LIVE_FEEDS.filter(feed => !omit.includes(feed.priceFeedId)).map(feed => ({ ...feed, ...(changes[feed.priceFeedId] ?? {}) })) };
}

/** Every feed republished at one second, in the given session: an in-session read for freshness and gate cases. */
export function lazerPayloadAt(publishTime: number, marketSession = 'regular') {
  const feedUpdateTimestamp = publishTime * 1_000_000;
  return { timestampUs: String(feedUpdateTimestamp), priceFeeds: LAZER_LIVE_FEEDS.map(feed => ({ ...feed, feedUpdateTimestamp, marketSession })) };
}

/**
 * A fetch stand-in for the proxy: the feeds the URL asked for from the given
 * payload (all of them when the URL names none) for a 200, an empty body otherwise.
 */
export function lazerResponder(payload: { priceFeeds: readonly LazerFeedJson[]; timestampUs?: string } = LAZER_LIVE_PAYLOAD, status = 200) {
  return async (url: URL | string = LAZER_HOST): Promise<Response> => {
    if (status !== 200) return new Response('', { status });
    const asked = new URL(String(url), LAZER_HOST).searchParams.getAll('price_feed_ids').map(Number);
    const priceFeeds = asked.length ? payload.priceFeeds.filter(feed => asked.includes(feed.priceFeedId)) : payload.priceFeeds;
    return Response.json({ ...payload, priceFeeds });
  };
}
