import { mkdtemp, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { getMintDecoder } from '@solana-program/token-2022';
import { isAddress, unwrapOption } from '@solana/kit';
import sharp from 'sharp';
import { z } from 'zod';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = 'https://api.xstocks.fi/api/v2/public/assets';
const logoHost = 'https://xstocks-metadata.backed.fi';
const program = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const pageSize = 100;
const maximumPages = 20;
const featured = ['AAPLx', 'MSFTx', 'NVDAx', 'TSLAx', 'SPYx', 'QQQx'];
const issuerSchema = z.object({
  symbol: z.string().regex(/^[A-Za-z0-9.]{1,15}x$/), name: z.string().min(1).max(120), isin: z.string().min(1).max(32),
  underlyingSymbol: z.string().min(1).max(16), underlyingIsin: z.string().min(1).max(32),
  underlying: z.object({ symbol: z.string().min(1).max(16), isin: z.string().max(32).nullable() }).nullable().optional(),
  logo: z.string(), isTradingHalted: z.boolean(), trading: z.object({ isTradingHalted: z.boolean() }).nullable().optional(),
  deployments: z.array(z.object({ network: z.string(), address: z.string() })).max(100),
});
const pageSchema = z.object({ nodes: z.array(issuerSchema).max(pageSize), page: z.object({ currentPage: z.number().int().nonnegative(), hasNextPage: z.boolean() }) });

async function fetchBytes(url, init, maxBytes = 2_000_000) {
  const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Upstream request failed with HTTP ${response.status}.`);
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length > maxBytes) throw new Error('Upstream response exceeds the supported size.');
  return data;
}
async function fetchJson(url, init) { return JSON.parse((await fetchBytes(url, init)).toString('utf8')); }

if (!process.env.SOLANA_RPC_URL) {
  try { process.loadEnvFile(join(root, '.env.local')); } catch { /* An externally supplied RPC is also supported. */ }
}
const rpc = process.env.SOLANA_RPC_URL?.trim();
if (!rpc || !['https:', 'http:'].includes(new URL(rpc).protocol)) throw new Error('Set SOLANA_RPC_URL before refreshing the verified catalog.');
const rows = [];
for (let page = 0; page < maximumPages; page++) {
  const payload = pageSchema.parse(await fetchJson(`${source}?network=Solana&pageSize=${pageSize}&page=${page}`));
  if (payload.page.currentPage !== page || (payload.page.hasNextPage && payload.nodes.length !== pageSize)) throw new Error('Issuer pagination is inconsistent.');
  rows.push(...payload.nodes);
  if (!payload.page.hasNextPage) break;
  if (page === maximumPages - 1) throw new Error('Issuer catalog exceeds the bounded refresh limit.');
}
const symbols = new Set();
const mints = new Set();
for (const row of rows) {
  const deployments = row.deployments.filter(deployment => deployment.network === 'Solana');
  if (deployments.length !== 1 || !isAddress(deployments[0].address)) throw new Error(`Invalid Solana deployment for ${row.symbol}.`);
  row.mint = deployments[0].address;
  if (symbols.has(row.symbol) || mints.has(row.mint)) throw new Error('Issuer catalog includes duplicate symbols or deployments.');
  if (row.logo !== `${logoHost}/logos/tokens/${encodeURIComponent(row.symbol)}.png`) throw new Error(`Unrecognized logo source for ${row.symbol}.`);
  symbols.add(row.symbol); mints.add(row.mint);
}
const accepted = [];
const excluded = [];
const slots = [];
for (let offset = 0; offset < rows.length; offset += 100) {
  const batch = rows.slice(offset, offset + 100);
  const payload = await fetchJson(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getMultipleAccounts', params: [batch.map(row => row.mint), { encoding: 'base64', commitment: 'confirmed' }] }) });
  if (payload.error || !Number.isSafeInteger(payload.result?.context?.slot) || !Array.isArray(payload.result?.value) || payload.result.value.length !== batch.length) throw new Error('Solana account verification failed.');
  slots.push(payload.result.context.slot);
  for (const [index, row] of batch.entries()) {
    const account = payload.result.value[index];
    try {
      if (!account || account.executable || account.owner !== program || account.data?.[1] !== 'base64') throw new Error('Missing or unsupported Token2022 mint.');
      const mint = getMintDecoder().decode(Buffer.from(account.data[0], 'base64'));
      const extensions = unwrapOption(mint.extensions) ?? [];
      const scale = extensions.find(extension => extension.__kind === 'ScaledUiAmountConfig');
      if (!mint.isInitialized || mint.decimals > 18 || !scale || extensions.some(extension => extension.__kind === 'InterestBearingConfig') || !(scale.multiplier > 0) || !Number.isFinite(scale.multiplier) || !(scale.newMultiplier > 0) || !Number.isFinite(scale.newMultiplier)) throw new Error('Unsupported mint scaling configuration.');
      accepted.push({ ...row, decimals: mint.decimals });
    } catch (error) { excluded.push({ symbol: row.symbol, mint: row.mint, reason: error.message }); }
  }
}
accepted.sort((a, b) => {
  const aIndex = featured.indexOf(a.symbol); const bIndex = featured.indexOf(b.symbol);
  return (aIndex < 0 ? featured.length : aIndex) - (bIndex < 0 ? featured.length : bIndex) || a.symbol.localeCompare(b.symbol, 'en');
});
const stage = await mkdtemp(join(tmpdir(), 'lotline-xstocks-'));
try {
  let cursor = 0;
  const logos = new Map();
  const outcomes = await Promise.allSettled(Array.from({ length: 8 }, async () => {
    while (cursor < accepted.length) {
      const asset = accepted[cursor++];
      const bytes = await fetchBytes(asset.logo, undefined, 1_000_000);
      const metadata = await sharp(bytes).metadata();
      if (metadata.format !== 'png' || !metadata.width || !metadata.height || metadata.width > 1024 || metadata.height > 1024) throw new Error(`Unsupported logo image for ${asset.symbol}.`);
      await writeFile(join(stage, `${asset.symbol}.png`), bytes);
      logos.set(asset.symbol, { sha256: createHash('sha256').update(bytes).digest('hex'), width: metadata.width, height: metadata.height });
    }
  }));
  if (outcomes.some(outcome => outcome.status === 'rejected') || logos.size !== accepted.length) throw new Error('At least one issuer logo could not be verified. No registry update was applied.');
  const registry = accepted.map(asset => ({ symbol: asset.symbol, name: asset.name, mint: asset.mint, decimals: asset.decimals, logoUrl: `/logos/xstocks/${asset.symbol}.png`, logoSourceUrl: asset.logo, issuerIsin: asset.isin, underlyingSymbol: asset.underlying?.symbol ?? asset.underlyingSymbol, underlyingIsin: asset.underlying?.isin ?? asset.underlyingIsin }));
  const evidence = { verifiedAt: new Date().toISOString(), source, documentation: 'https://docs.xstocks.fi/apis/openapi/assets', network: 'Solana', commitment: 'confirmed', mintProgram: program, issuerCount: rows.length, supportedCount: registry.length, excluded, haltedSymbols: accepted.filter(asset => asset.isTradingHalted || asset.trading?.isTradingHalted).map(asset => asset.symbol), verificationSlots: slots, logos: Object.fromEntries(registry.map(asset => [asset.symbol, logos.get(asset.symbol)])) };
  const logoDirectory = join(root, 'public/logos/xstocks');
  await mkdir(logoDirectory, { recursive: true });
  for (const asset of registry) await rename(join(stage, `${asset.symbol}.png`), join(logoDirectory, `${asset.symbol}.png`));
  await writeFile(join(root, 'lib/domain/xstocks-registry.json'), `${JSON.stringify(registry, null, 2)}\n`);
  await writeFile(join(root, 'docs/xstocks-catalog-verification.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`Verified ${registry.length}/${rows.length} Solana xStocks and ${logos.size} official logos; ${excluded.length} excluded.`);
} finally { await rm(stage, { recursive: true, force: true }); }
