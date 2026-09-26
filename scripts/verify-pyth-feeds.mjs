#!/usr/bin/env node
/**
 * Verify Lotline's pinned Pyth feed ids against the official Pyth MCP server.
 *
 *   node scripts/verify-pyth-feeds.mjs
 *
 * Reads the pinned ids straight from lib/domain/market-reference.ts, calls the
 * keyless `get_symbols` tool at https://mcp.pyth.network/mcp (Streamable HTTP,
 * JSON-RPC, protocol 2025-06-18) for each symbol, and prints the published
 * hermes_id next to the pinned one. Exit code 1 on any mismatch. No price is
 * requested and no credential is sent.
 */
import { readFile } from 'node:fs/promises';

const MCP_ENDPOINT = 'https://mcp.pyth.network/mcp';
const MCP_PROTOCOL_VERSION = '2025-06-18';
const HEADERS = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': MCP_PROTOCOL_VERSION };

async function pinnedFeeds() {
  const source = await readFile(new URL('../lib/domain/market-reference.ts', import.meta.url), 'utf8');
  const usdc = source.match(/PYTH_USDC_FEED_ID = '([a-f0-9]{64})'/)?.[1];
  const mappings = [...source.matchAll(/symbol: '([A-Z]+)', underlying: '([a-f0-9]{64})', token: '([a-f0-9]{64})'/g)].map(([, symbol, underlying, token]) => ({ symbol, underlying, token }));
  if (!usdc || mappings.length < 3) throw new Error('Could not read the pinned feed ids from lib/domain/market-reference.ts');
  return { usdc, mappings };
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

const { usdc, mappings } = await pinnedFeeds();
const checks = [
  ...mappings.flatMap(mapping => [
    { query: mapping.symbol, assetType: 'equity', symbol: `Equity.US.${mapping.symbol}/USD`, pinned: mapping.underlying },
    { query: `${mapping.symbol}X`, assetType: 'crypto', symbol: `Crypto.${mapping.symbol}X/USD`, pinned: mapping.token },
  ]),
  { query: 'USDC', assetType: 'crypto', symbol: 'Crypto.USDC/USD', pinned: usdc },
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
process.exit(failures ? 1 : 0);
