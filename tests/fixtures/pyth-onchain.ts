import { PYTH_FEED_MAPPINGS, PYTH_USDC_FEED_ID } from '../../lib/domain/market-reference';
import { MAINNET_GENESIS_HASH } from '../../lib/server/solana-network';

/**
 * A real Solana mainnet account, read with getMultipleAccounts (base64, confirmed)
 * on 2026-09-26T06:00:17.579Z at slot 450587581 from api.mainnet-beta.solana.com.
 * It is the sponsored PriceUpdateV2 account for Crypto.USDC/USD: PDA of
 * pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT with seeds [u16le(0), feed id],
 * owned by rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ, 134 bytes, Full verification.
 */
export const USDC_RECEIVER_ACCOUNT = 'Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX';
export const AAPL_UNDERLYING_RECEIVER_ACCOUNT = 'DJ2FyTgUAkEtXW3U5P9PF19meFTRtW4ZWKKFgACfVbUy';
export const AAPL_TOKEN_RECEIVER_ACCOUNT = 'Gs4DVtiGSJ9LJvXaQFjYp6vhLNK2QsH4qWox2ck1kuMp';
export const USDC_RECEIVER_BASE64 = 'IvEjY51+9M2+k5qDCfVkBxh//zCsVLFpSYvpn22OG/1CRGgM1PfR4gHqoCDGHMR5cSgTRhzhU4lKlqbACyHtDPwnmNH5qenJSta/9QUAAAAAakAAAAAAAAD4////RV+3agAAAABEX7dqAAAAAPbG9QUAAAAAKzsAAAAAAAAaa9saAAAAAAA=';
export const USDC_RECEIVER_SLOT = 450587581;
export const USDC_RECEIVER_FETCHED_AT = '2026-09-26T06:00:17.579Z';
export const USDC_RECEIVER_DECODED = {
  feedId: PYTH_USDC_FEED_ID, price: '99991510', confidence: '16490', exponent: -8, publishTime: 1790402373,
  prevPublishTime: 1790402372, emaPrice: '99993334', emaConfidence: '15147', postedSlot: '450587418', verification: 'full' as const,
};
export const AAPL_MAPPING = PYTH_FEED_MAPPINGS[0];

export function receiverAccountJson(changes: Record<string, unknown> = {}) {
  return { data: [USDC_RECEIVER_BASE64, 'base64'], owner: 'rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ', executable: false, lamports: 1823631, rentEpoch: 0, ...changes };
}

/** Answers the two JSON-RPC methods the on-chain reader uses; anything else is 404. */
export function rpcResponder(accounts: unknown[] = [receiverAccountJson()], genesis = MAINNET_GENESIS_HASH) {
  return async (_url: URL | string, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { method?: string };
    if (body.method === 'getGenesisHash') return Response.json({ jsonrpc: '2.0', id: 1, result: genesis });
    if (body.method === 'getMultipleAccounts') return Response.json({ jsonrpc: '2.0', id: 1, result: { context: { slot: USDC_RECEIVER_SLOT }, value: accounts } });
    return new Response('', { status: 404 });
  };
}
