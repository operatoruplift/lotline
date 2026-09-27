import { expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { PYTH_FEED_MAPPINGS, PYTH_USDC_FEED_ID, PYTH_USDC_LAZER_ID } from '../lib/domain/market-reference';
import { LAZER_DEFAULT_HOSTS } from '../lib/server/pyth-lazer';

/**
 * Explicit opt-in only (PYTH_LIVE=1). Calls the official Pyth MCP server's keyless
 * `get_symbols` tool over Streamable HTTP and checks that every feed id Lotline
 * pins is the one Pyth publishes for that symbol. No price is requested and no
 * credential is sent.
 */
const MCP_ENDPOINT = 'https://mcp.pyth.network/mcp';
const MCP_PROTOCOL_VERSION = '2025-06-18';
const HEADERS = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': MCP_PROTOCOL_VERSION };
type JsonRpcResponse = { id?: number; result?: unknown; error?: { code?: number; message?: string } };
type SymbolFeed = { symbol: string; hermes_id: string; asset_type: string };

/** The server answered plain JSON so far; SSE framing is accepted as well. */
async function rpc(id: number, method: string, params: unknown, session?: string): Promise<{ response: JsonRpcResponse; session?: string }> {
  const response = await fetch(MCP_ENDPOINT, { method: 'POST', headers: { ...HEADERS, ...(session ? { 'mcp-session-id': session } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }), signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`MCP ${method} answered HTTP ${response.status}`);
  const nextSession = response.headers.get('mcp-session-id') ?? session;
  const text = await response.text();
  if (response.headers.get('content-type')?.includes('text/event-stream')) {
    const messages = text.split('\n').filter(line => line.startsWith('data:')).map(line => JSON.parse(line.slice(5).trim()) as JsonRpcResponse);
    const match = messages.find(message => message.id === id);
    if (!match) throw new Error(`MCP ${method} returned no response for id ${id}`);
    return { response: match, session: nextSession };
  }
  return { response: JSON.parse(text) as JsonRpcResponse, session: nextSession };
}

async function getSymbols(id: number, query: string, assetType: string, session?: string): Promise<SymbolFeed[]> {
  const { response } = await rpc(id, 'tools/call', { name: 'get_symbols', arguments: { query, asset_type: assetType } }, session);
  if (response.error) throw new Error(`get_symbols ${query}: ${response.error.message ?? 'error'}`);
  const content = (response.result as { content?: { type: string; text?: string }[] }).content ?? [];
  const text = content.find(item => item.type === 'text')?.text;
  if (!text) throw new Error(`get_symbols ${query}: no text content`);
  const parsed = JSON.parse(text) as { feeds?: SymbolFeed[] };
  return parsed.feeds ?? [];
}

const checks = [
  ...PYTH_FEED_MAPPINGS.flatMap(mapping => [
    { query: mapping.symbol, assetType: 'equity', symbol: `Equity.US.${mapping.symbol}/USD`, pinned: mapping.underlying, lazer: mapping.lazerUnderlying, role: `${mapping.symbol} underlying` },
    { query: `${mapping.symbol}X`, assetType: 'crypto', symbol: `Crypto.${mapping.symbol}X/USD`, pinned: mapping.token, lazer: mapping.lazerToken, role: `${mapping.symbol} token` },
  ]),
  { query: 'USDC', assetType: 'crypto', symbol: 'Crypto.USDC/USD', pinned: PYTH_USDC_FEED_ID, lazer: PYTH_USDC_LAZER_ID, role: 'currency' },
];
type LazerRegistryRow = { pyth_lazer_id: number; symbol: string; hermes_id: string; exponent: number; asset_type: string };

it.skipIf(process.env.PYTH_LIVE !== '1')('every pinned feed id equals the hermes_id the official Pyth MCP get_symbols tool publishes', async () => {
  const startedAt = new Date().toISOString();
  const { response: initialized, session } = await rpc(1, 'initialize', { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'lotline-feed-identity-check', version: '1.0.0' } });
  expect(initialized.error).toBeUndefined();
  const serverInfo = (initialized.result as { serverInfo?: { name?: string; version?: string }; protocolVersion?: string }) ?? {};
  const results: { role: string; symbol: string; pinned: string; published: string | null; match: boolean }[] = [];
  for (const [index, check] of checks.entries()) {
    const feeds = await getSymbols(index + 2, check.query, check.assetType, session);
    const published = feeds.find(feed => feed.symbol === check.symbol)?.hermes_id ?? null;
    results.push({ role: check.role, symbol: check.symbol, pinned: check.pinned, published, match: published === check.pinned });
  }
  const evidence = { startedAt, completedAt: new Date().toISOString(), endpoint: MCP_ENDPOINT, protocolVersion: MCP_PROTOCOL_VERSION, tool: 'get_symbols', credentialSent: false, pricesRequested: 0, serverInfo, results };
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
  await writeFile(new URL('../test-results/pyth-identity-live.json', import.meta.url), `${JSON.stringify(evidence, null, 2)}\n`);
  expect(results).toHaveLength(PYTH_FEED_MAPPINGS.length * 2 + 1);
  for (const result of results) expect(result, `${result.role} ${result.symbol}`).toMatchObject({ published: result.pinned, match: true });
}, 120_000);

/**
 * Explicit opt-in only (PYTH_LIVE=1). Downloads the keyless Lazer symbol registry
 * and checks that every pinned Lazer id names the pinned symbol and the pinned
 * hermes_id, so the numeric ids the keyless path requests are the same feeds
 * the on-chain cross-check reads. No price is requested and no credential is sent.
 */
it.skipIf(process.env.PYTH_LIVE !== '1')('every pinned Lazer id names the pinned symbol and hermes_id in the Lazer registry', async () => {
  const startedAt = new Date().toISOString();
  const host = LAZER_DEFAULT_HOSTS[0];
  const response = await fetch(`${host}/v1/symbols`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(60_000) });
  expect(response.status).toBe(200);
  const rows = (await response.json()) as LazerRegistryRow[];
  const registry = new Map(rows.map(row => [row.pyth_lazer_id, row]));
  const results = checks.map(check => {
    const row = registry.get(check.lazer);
    return { role: check.role, lazerId: check.lazer, symbol: check.symbol, pinned: check.pinned, publishedSymbol: row?.symbol ?? null, publishedHermesId: row?.hermes_id ?? null, exponent: row?.exponent ?? null, match: row?.symbol === check.symbol && row?.hermes_id === check.pinned };
  });
  const evidence = { startedAt, completedAt: new Date().toISOString(), endpoint: `${host}/v1/symbols`, feedsListed: rows.length, credentialSent: false, pricesRequested: 0, results };
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
  await writeFile(new URL('../test-results/pyth-lazer-registry-live.json', import.meta.url), `${JSON.stringify(evidence, null, 2)}\n`);
  expect(results).toHaveLength(PYTH_FEED_MAPPINGS.length * 2 + 1);
  for (const result of results) expect(result, `${result.role} ${result.symbol}`).toMatchObject({ publishedSymbol: result.symbol, publishedHermesId: result.pinned, match: true });
}, 120_000);
