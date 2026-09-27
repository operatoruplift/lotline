#!/usr/bin/env node
/**
 * Verify Lotline's pinned Pyth feed identities two ways.
 *
 *   node scripts/verify-pyth-feeds.mjs
 *
 * Reads the pinned ids straight from lib/domain/market-reference.ts, then
 *  1. calls the keyless `get_symbols` tool of the official Pyth MCP server at
 *     https://mcp.pyth.network/mcp (Streamable HTTP, JSON-RPC, protocol 2025-06-18)
 *     for each symbol and prints the published hermes_id next to the pinned one;
 *  2. downloads the Pyth Lazer symbol registry (/v1/symbols, keyless) and checks
 *     that every pinned Lazer id names the same symbol and the same hermes_id.
 * Exit code 1 on any mismatch. No price is requested and no credential is sent.
 */
import { readFile } from 'node:fs/promises';

const MCP_ENDPOINT = 'https://mcp.pyth.network/mcp';
const LAZER_HOST = 'https://pyth-lazer-proxy-3.dourolabs.app';
const MCP_PROTOCOL_VERSION = '2025-06-18';
const HEADERS = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': MCP_PROTOCOL_VERSION };

async function pinnedFeeds() {
  const source = await readFile(new URL('../lib/domain/market-reference.ts', import.meta.url), 'utf8');
  const usdc = source.match(/PYTH_USDC_FEED_ID = '([a-f0-9]{64})'/)?.[1];
  const usdcLazer = Number(source.match(/PYTH_USDC_LAZER_ID = (\d+)/)?.[1]);
  const mappings = [...source.matchAll(/symbol: '([A-Z]+)', underlying: '([a-f0-9]{64})', token: '([a-f0-9]{64})', lazerUnderlying: (\d+), lazerToken: (\d+)/g)]
    .map(([, symbol, underlying, token, lazerUnderlying, lazerToken]) => ({ symbol, underlying, token, lazerUnderlying: Number(lazerUnderlying), lazerToken: Number(lazerToken) }));
  if (!usdc || !Number.isInteger(usdcLazer) || mappings.length < 3) throw new Error('Could not read the pinned feed ids from lib/domain/market-reference.ts');
  return { usdc, usdcLazer, mappings };
}

/** The Lazer registry keyed by Lazer id: symbol, hermes_id, exponent and asset type for every feed Pyth serves there. */
async function lazerRegistry() {
  const response = await fetch(`${LAZER_HOST}/v1/symbols`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Lazer /v1/symbols answered HTTP ${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error('Lazer /v1/symbols did not answer with a list');
  return new Map(rows.map(row => [row.pyth_lazer_id, row]));
}

async function rpc(id, method, params, session) {
  const response = await fetch(MCP_ENDPOINT, { method: 'POST', headers: { ...HEADERS, ...(session ? { 'mcp-session-id': session } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }), signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`MCP ${method} answered HTTP ${response.status}`);
  const nextSession = response.headers.get('mcp-session-id') ?? session;
  const text = await response.text();
  if (response.headers.get('content-type')?.includes('text/event-stream')) {
    const match = text.split('\n').filter(line => line.startsWith('data:')).map(line => JSON.parse(line.slice(5).trim())).find(message => message.id === id);
    if (!match) throw new Error(`MCP ${method} returned no response for id ${id}`);
    return { response: match, session: nextSession };
  }
  return { response: JSON.parse(text), session: nextSession };
}

async function getSymbols(id, query, assetType, session) {
  const { response } = await rpc(id, 'tools/call', { name: 'get_symbols', arguments: { query, asset_type: assetType } }, session);
  if (response.error) throw new Error(`get_symbols ${query}: ${response.error.message ?? 'error'}`);
  const text = (response.result?.content ?? []).find(item => item.type === 'text')?.text;
  if (!text) throw new Error(`get_symbols ${query}: no text content`);
  return JSON.parse(text).feeds ?? [];
}

const { usdc, usdcLazer, mappings } = await pinnedFeeds();
const checks = [
  ...mappings.flatMap(mapping => [
    { query: mapping.symbol, assetType: 'equity', symbol: `Equity.US.${mapping.symbol}/USD`, pinned: mapping.underlying, lazer: mapping.lazerUnderlying },
    { query: `${mapping.symbol}X`, assetType: 'crypto', symbol: `Crypto.${mapping.symbol}X/USD`, pinned: mapping.token, lazer: mapping.lazerToken },
  ]),
  { query: 'USDC', assetType: 'crypto', symbol: 'Crypto.USDC/USD', pinned: usdc, lazer: usdcLazer },
];
const { response: initialized, session } = await rpc(1, 'initialize', { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'lotline-verify-pyth-feeds', version: '1.0.0' } });
const server = initialized.result?.serverInfo ?? {};
console.log(`Pyth MCP ${MCP_ENDPOINT} · ${server.name ?? 'server'} ${server.version ?? ''} · protocol ${initialized.result?.protocolVersion ?? MCP_PROTOCOL_VERSION}`);
let failures = 0;
for (const [index, check] of checks.entries()) {
  const feeds = await getSymbols(index + 2, check.query, check.assetType, session);
  const published = feeds.find(feed => feed.symbol === check.symbol)?.hermes_id ?? null;
  const match = published === check.pinned;
  if (!match) failures += 1;
  console.log(`${match ? 'MATCH   ' : 'MISMATCH'} ${check.symbol.padEnd(22)} pinned ${check.pinned} · published ${published ?? '(not listed)'}`);
}
console.log(failures ? `${failures} pinned id(s) differ from the published hermes_id.` : `All ${checks.length} pinned feed ids match the published hermes_ids.`);

const registry = await lazerRegistry();
console.log(`Pyth Lazer ${LAZER_HOST}/v1/symbols · ${registry.size} feeds listed`);
let lazerFailures = 0;
for (const check of checks) {
  const row = registry.get(check.lazer);
  const match = row?.symbol === check.symbol && row?.hermes_id === check.pinned;
  if (!match) lazerFailures += 1;
  console.log(`${match ? 'MATCH   ' : 'MISMATCH'} Lazer id ${String(check.lazer).padEnd(5)} ${check.symbol.padEnd(22)} registry ${row ? `${row.symbol} · ${row.hermes_id}` : '(not listed)'}`);
}
console.log(lazerFailures ? `${lazerFailures} pinned Lazer id(s) differ from the registry.` : `All ${checks.length} pinned Lazer ids name the pinned symbols and hermes_ids.`);
process.exit(failures || lazerFailures ? 1 : 0);
