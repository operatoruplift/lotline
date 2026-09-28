#!/usr/bin/env node
/**
 * Classifies each pinned xStock's underlying as an ETF or a share, from Nasdaq
 * Trader's public symbol directory (the "ETF" column covers every US listing).
 * Underlyings with purely numeric symbols are Hong Kong listings, which the
 * directory does not cover; they are recorded separately, never guessed.
 *
 *   node scripts/classify-xstocks.mjs            # writes lib/domain/xstocks-kinds.json
 *   node scripts/classify-xstocks.mjs --check    # exits 1 when the file is out of date
 */
import { readFile, writeFile } from 'node:fs/promises';

const SOURCE = 'https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqtraded.txt';
const registry = JSON.parse(await readFile(new URL('../lib/domain/xstocks-registry.json', import.meta.url), 'utf8'));
const response = await fetch(SOURCE, { redirect: 'error', signal: AbortSignal.timeout(60_000) });
if (!response.ok) throw new Error(`Directory request failed with HTTP ${response.status}`);
const lines = (await response.text()).split(/\r?\n/).filter(Boolean);
const header = lines[0].split('|');
const column = name => { const index = header.indexOf(name); if (index < 0) throw new Error(`Directory is missing the ${name} column`); return index; };
const [symbolAt, etfAt, testAt] = [column('Symbol'), column('ETF'), column('Test Issue')];
const created = lines.at(-1).startsWith('File Creation Time:') ? lines.at(-1).split(':').slice(1).join(':').split('|')[0].trim() : null;
const listings = new Map();
for (const line of lines.slice(1)) {
  const parts = line.split('|');
  if (parts.length !== header.length || parts[testAt] === 'Y') continue;
  listings.set(parts[symbolAt], parts[etfAt] === 'Y');
}
const lookup = symbol => [symbol, symbol.replace('.', '-'), symbol.replace('-', '.')].map(candidate => listings.get(candidate)).find(value => value !== undefined);
const etf = [], hongKong = [], unclassified = [];
for (const asset of registry) {
  const isEtf = lookup(asset.underlyingSymbol);
  if (isEtf === true) etf.push(asset.symbol);
  else if (isEtf === undefined && /^\d{1,5}$/.test(asset.underlyingSymbol)) hongKong.push(asset.symbol);
  else if (isEtf === undefined) unclassified.push(asset.symbol);
}
const output = { source: SOURCE, directoryCreated: created, registryCount: registry.length, etf: etf.sort(), hongKong: hongKong.sort(), unclassified: unclassified.sort() };
const target = new URL('../lib/domain/xstocks-kinds.json', import.meta.url);
const text = `${JSON.stringify(output, null, 2)}\n`;
if (process.argv.includes('--check')) {
  const current = JSON.parse(await readFile(target, 'utf8'));
  const same = ['etf', 'hongKong', 'unclassified'].every(key => JSON.stringify(current[key]) === JSON.stringify(output[key]));
  console.log(same ? 'xstocks-kinds.json matches the current directory.' : 'xstocks-kinds.json differs from the current directory; rerun without --check.');
  process.exit(same ? 0 : 1);
}
await writeFile(target, text);
console.log(`ETF ${etf.length} · Hong Kong ${hongKong.length} · unclassified ${unclassified.length} · shares ${registry.length - etf.length - hongKong.length - unclassified.length}`);
