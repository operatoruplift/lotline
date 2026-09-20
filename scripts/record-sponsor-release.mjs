import { chromium, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PRESTOCK_REGISTRY, PRESTOCK_ISSUER_URL } from '../lib/domain/prestocks.ts';

const baseURL = process.env.E2E_BASE_URL;
if (!baseURL) throw new Error('Set E2E_BASE_URL to the verified production server before recording.');
const server = new URL(baseURL);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(server.hostname)) throw new Error('This controlled release recording requires a local production server.');
const output = 'public/videos/release-20260921';
const rawDirectory = join(tmpdir(), `lotline-sponsor-video-20260921-${process.pid}`);
await mkdir(output, { recursive: true });
await mkdir(rawDirectory, { recursive: true });
const tokenProgram = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const verifiedAt = new Date().toISOString();
const preStocks = PRESTOCK_REGISTRY.map(asset => ({ ...asset, issuerId: 'prestocks', issuerSourceUrl: PRESTOCK_ISSUER_URL, instrumentId: `prestocks:solana:${asset.mint}`, halted: null, tokenProgram, verifiedAt }));
const xstocks = JSON.parse(await readFile('lib/domain/xstocks-registry.json', 'utf8')).slice(0, 3).map(asset => ({ ...asset, tokenProgram, halted: false, verifiedAt }));
const openai = preStocks.find(asset => asset.symbol === 'OPENAI');
const anthropic = preStocks.find(asset => asset.symbol === 'ANTHROPIC');
expect(openai).toBeTruthy(); expect(anthropic).toBeTruthy();
const banner = 'CONTROLLED REHEARSAL · CATALOG / QUOTES MOCKED · PYTH UNAVAILABLE FIXTURE · NO WALLET OR FUNDS';
const scenes = [];
const unexpectedRequests = [];
let oracleRequests = 0;
const browser = await chromium.launch();

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'], recordVideo: { dir: rawDirectory, size: { width: 1440, height: 1000 } } });
  context.setDefaultTimeout(20_000);
  context.setDefaultNavigationTimeout(30_000);
  await context.addInitScript(({ banner, xstock }) => {
    if (location.pathname === '/app' && !localStorage.getItem('lotline:basket:v1')) localStorage.setItem('lotline:basket:v1', JSON.stringify({ version: 1, budget: '10.000001', items: [{ mint: xstock.mint, percent: '100' }] }));
    window.addEventListener('DOMContentLoaded', () => {
      const note = document.createElement('div');
      note.id = 'controlled-recording-note'; note.setAttribute('role', 'note');
      Object.assign(note.style, { position: 'fixed', top: '0', left: '0', right: '0', zIndex: '2147483647', minHeight: '64px', display: 'grid', placeItems: 'center', padding: '12px 24px', color: '#fff', background: '#174D3C', font: '600 13px/1.5 system-ui', textAlign: 'center', pointerEvents: 'none' });
      note.textContent = banner; document.body.append(note); document.body.style.paddingTop = '64px';
    });
  }, { banner, xstock: xstocks[0] });
  await context.route('**/api/**', route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (path === '/api/prestocks/assets') return route.fulfill({ json: { state: 'success', assets: preStocks, unavailable: [] } });
    if (path === '/api/assets') return route.fulfill({ json: { state: 'success', assets: xstocks, unavailable: [] } });
    if (path === '/api/execution/config') return route.fulfill({ json: { state: 'configuration-required', enabled: false, reconciliationAvailable: false, reasons: ['Purchase approval is disabled for this controlled recording.'], message: 'Planning rehearsal only.' } });
    if (path === '/api/auth/session') return route.fulfill({ json: { state: 'guest', user: null } });
    if (path === '/api/quotes' || path === '/api/prestocks/quotes') {
      const { items } = request.postDataJSON(); const fetchedAt = new Date().toISOString();
      return route.fulfill({ json: { state: 'success', quotes: items.map(item => ({ ...item, state: 'success', outRaw: '1000000000', units: '1.25', fetchedAt, expiresAt: new Date(Date.now() + 30_000).toISOString(), source: 'Controlled quote fixture' })) } });
    }
    if (path === '/api/market-reference') {
      oracleRequests += 1; const fetchedAt = new Date().toISOString();
      return route.fulfill({ status: 503, json: { source: 'pyth', state: 'configuration-required', fetchedAt, expiresAt: fetchedAt, items: [], message: 'Pyth credentials are not configured in this controlled rehearsal.' } });
    }
    unexpectedRequests.push({ path, method: request.method() });
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  const recordingStarted = Date.now();
  const scene = async text => {
    console.log(JSON.stringify({ scene: scenes.length + 1, text }));
    await page.evaluate(({ banner, text }) => { document.getElementById('controlled-recording-note').textContent = `${banner} — ${text}`; }, { banner, text });
    // Each cut uses a settled, visibly labeled application state. Navigation and
    // compilation delays are omitted; no replacement UI or oracle prices are drawn.
    await page.waitForTimeout(1_000);
    scenes.push({ rawStart: (Date.now() - recordingStarted) / 1000, duration: 5, text });
    await page.waitForTimeout(6_000);
  };
  await page.goto(`${baseURL}/pre-ipo`);
  await expect(page.locator('main.route-state')).toHaveCount(0);
  await expect(page.getByLabel('Choose a verified PreStock', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Example', exact: true })).toHaveCount(0);
  await scene('PreStocks has a separate planning catalog and device draft. Issuer trading-halt status is not published.');
  await page.getByLabel('Choose a verified PreStock', { exact: true }).selectOption(openai.mint);
  await page.getByRole('button', { name: 'Add an asset', exact: true }).click();
  await page.getByLabel('Choose a verified PreStock', { exact: true }).selectOption(anthropic.mint);
  await page.getByLabel('USDC budget').fill('10.000001');
  await page.getByLabel('OPENAI percentage').fill('50');
  await page.getByLabel('ANTHROPIC percentage').fill('50');
  await page.locator('.plan-panel').scrollIntoViewIfNeeded();
  await scene('Choose your own split. This illustrative 50 / 50 contribution is a fixture, not a recommendation.');
  await page.getByRole('button', { name: 'Get estimates', exact: true }).click();
  await expect(page.locator('.results-table td[data-label="Estimated +units"]')).toHaveText(['+1.25', '+1.25']);
  await page.locator('.results-panel').scrollIntoViewIfNeeded();
  await expect(page.locator('.allocation-cell')).toHaveText(['5.000001', '5.000000']);
  await scene('Exact allocation: 10.000001 USDC = 5.000001 + 5.000000. Estimated token outputs are mocked.');
  await page.screenshot({ path: `${output}/sponsor-planning-poster.jpg` });
  await page.getByText('Verify this plan', { exact: true }).click();
  await page.locator('.verification-receipt').scrollIntoViewIfNeeded();
  await expect(page.getByRole('link', { name: 'PreStocks asset metadata' }).first()).toHaveAttribute('href', PRESTOCK_ISSUER_URL);
  await expect(page.getByText('Not published by PreStocks', { exact: true })).toHaveCount(2);
  await scene('Inspect exact Solana mints, PreStocks issuer links, original quote times, and unpublished halt status.');
  await page.getByText('Verify this plan', { exact: true }).click();
  await page.locator('.handoff-panel').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Copy plan link', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Plan link copied.' })).toBeVisible();
  const link = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  expect(link.pathname).toBe('/pre-ipo');
  expect(JSON.parse(Buffer.from(link.hash.slice(6), 'base64url').toString())).toMatchObject({ v: 2, universe: 'prestocks', mode: 'live' });
  await expect(page.getByRole('button', { name: 'Sign this purchase', exact: true })).toHaveCount(0);
  await scene('Copy or export a planning-only split. Shared links exclude the wallet and estimates; no purchase is signed.');
  await page.goto(`${baseURL}/app`);
  await expect(page.locator('main.route-state')).toHaveCount(0);
  await page.getByRole('button', { name: 'Get estimates', exact: true }).click();
  await expect(page.locator('[data-market-reference]')).toContainText('Pyth market data is currently unavailable.');
  await page.locator('[data-market-reference]').scrollIntoViewIfNeeded();
  await scene('xStocks estimates show the Pyth reference status. This unavailable fixture makes no live price comparison claim.');
  expect(oracleRequests).toBe(1); expect(unexpectedRequests).toEqual([]);
  const rawVideo = await page.video().path();
  await context.close();

  const segments = scenes.map((item, index) => `[0:v]trim=start=${item.rawStart.toFixed(3)}:duration=${item.duration},setpts=PTS-STARTPTS[v${index}]`);
  const filter = `${segments.join(';')};${scenes.map((_, index) => `[v${index}]`).join('')}concat=n=${scenes.length}:v=1:a=0[outv]`;
  const mp4 = `${output}/sponsor-planning.mp4`;
  execFileSync('ffmpeg', ['-y', '-i', rawVideo, '-filter_complex', filter, '-map', '[outv]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4], { stdio: 'ignore' });
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height,codec_name,codec_type', '-of', 'json', mp4], { encoding: 'utf8' }));
  const durationSeconds = Number(probe.format.duration);
  expect(durationSeconds).toBeGreaterThanOrEqual(25); expect(durationSeconds).toBeLessThanOrEqual(45);
  expect(probe.streams.every(stream => stream.codec_type === 'video')).toBe(true);
  const stamp = seconds => `00:${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.000`;
  const transcript = `${banner}. Silent application recording captured from the local production build on September 21, 2026. Cuts omit navigation delays between six observed application states.\n\n${scenes.map(item => item.text).join('\n\n')}\n\nPreStocks catalog and quote responses are controlled fixtures using pinned issuer identities. Pyth unavailability is explicitly simulated; no live oracle observation or token-price comparison is claimed. No wallet connected, transaction signed, or funds moved. The five earlier films remain unchanged.\n`;
  await writeFile(`${output}/sponsor-planning.transcript.txt`, transcript);
  await writeFile(`${output}/sponsor-planning.en.vtt`, `WEBVTT\n\n${scenes.map((item, index) => `${index + 1}\n${stamp(index * 5)} --> ${stamp((index + 1) * 5)}\n${item.text}`).join('\n\n')}\n`);
  const bytes = await readFile(mp4);
  const manifest = { recordedAt: new Date().toISOString(), source: 'local production build; controlled catalog, quotes and Pyth-unavailable fixture', realFundsMoved: false, signed: false, settlementVerified: false, films: { 'sponsor-planning': { src: '/videos/release-20260921/sponsor-planning.mp4', poster: '/videos/release-20260921/sponsor-planning-poster.jpg', captions: '/videos/release-20260921/sponsor-planning.en.vtt', description: '/videos/release-20260921/sponsor-planning.transcript.txt', durationSeconds, width: 1440, height: 1000, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), silent: true, fixtureOnly: true, pythStatus: 'explicit-unavailable-fixture', evidenceClasses: ['controlled-local-ui'], transcript } } };
  await writeFile(`${output}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  await mkdir('docs/releases/2026-09-21', { recursive: true });
  await writeFile('docs/releases/2026-09-21/sponsor-video.json', `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ film: 'sponsor-planning', durationSeconds, bytes: bytes.length, sha256: manifest.films['sponsor-planning'].sha256, rawVideo }));
} finally { await browser.close(); }
