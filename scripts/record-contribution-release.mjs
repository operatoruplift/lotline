import { chromium, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3113';
const output = 'public/videos/release-20260920';
const rawDirectory = join(tmpdir(), 'lotline-video-release-20260920');
await mkdir(output, { recursive: true });
await mkdir(rawDirectory, { recursive: true });
const identities = JSON.parse(await readFile('lib/domain/xstocks-registry.json', 'utf8'));
const assets = identities.slice(0, 8).map(asset => ({ ...asset, tokenProgram: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', halted: false, verifiedAt: new Date().toISOString() }));
const banner = 'CONTROLLED REHEARSAL · CATALOG / QUOTES MOCKED · NO WALLET OR FUNDS';
const evidenceBanner = 'TECHNICAL EVIDENCE EXPLAINER · SEPARATE FROM THE APP · REAL SETTLEMENT UNVERIFIED';
const unsignedProof = JSON.parse(await readFile('docs/releases/2026-09-20/unsigned-semantic-proof.json', 'utf8'));
expect(unsignedProof.kind).toBe('unsigned-mainnet-simulation');
expect(unsignedProof.signed).toBe(false);
expect(unsignedProof.broadcast).toBe(false);
expect(unsignedProof.settlementVerified).toBe(false);
const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const browser = await chromium.launch();
const films = {};
const stamp = seconds => {
  const ms = Math.max(0, Math.round(seconds * 1000));
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
};

try {
  for (const name of ['first-minute', 'technical-proof']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', recordVideo: { dir: rawDirectory, size: { width: 1440, height: 1000 } } });
    await context.addInitScript(({ banner }) => {
      window.addEventListener('DOMContentLoaded', () => {
        if (location.protocol === 'about:') return;
        const note = document.createElement('div');
        note.id = 'controlled-recording-note';
        note.setAttribute('role', 'note');
        Object.assign(note.style, { position: 'fixed', top: '0', left: '0', right: '0', zIndex: '2147483647', padding: '10px 18px', color: '#fff', background: '#174D3C', font: '600 13px/1.4 system-ui', textAlign: 'center', pointerEvents: 'none', boxShadow: '0 1px 0 #abc' });
        note.textContent = banner;
        document.body.append(note);
        document.body.style.paddingTop = '40px';
      });
    }, { banner });
    let quoteLifetime = name === 'technical-proof' ? 9_000 : 30_000;
    const networkWrites = [];
    await context.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/assets') return route.fulfill({ json: { state: 'success', assets, unavailable: [] } });
      if (path === '/api/execution/config') return route.fulfill({ json: { state: 'configuration-required', enabled: false, reconciliationAvailable: false, reasons: ['This recording keeps purchase approval disabled. It proves planning behavior only.'], message: 'Purchase approval is unavailable in this controlled recording.' } });
      if (path === '/api/quotes') {
        const { items } = route.request().postDataJSON();
        const fetchedAt = new Date().toISOString();
        return route.fulfill({ json: { state: 'success', quotes: items.map(item => ({ ...item, state: 'success', outRaw: '123000000', units: '1.23', fetchedAt, expiresAt: new Date(Date.now() + quoteLifetime).toISOString(), source: 'Controlled quote fixture' })) } });
      }
      if (route.request().method() !== 'GET') { networkWrites.push(path); return route.abort('blockedbyclient'); }
      return route.continue();
    });
    const page = await context.newPage();
    const started = Date.now(); const cues = [];
    const hold = async (text, duration = 3_000, label = banner) => {
      const start = (Date.now() - started) / 1000;
      await page.evaluate(({ label, text }) => { document.getElementById('controlled-recording-note').textContent = `${label} — ${text}`; }, { label, text });
      cues.push({ start, end: start + duration / 1000, text });
      await page.waitForTimeout(duration);
    };
    const evidenceSlide = async ({ title, eyebrow, rows, note, source, caption }) => {
      // These are explanatory slides, never rendered as a fake application state.
      await page.goto('about:blank');
      await page.setContent(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Lotline technical evidence explainer</title><style>
        *{box-sizing:border-box}body{margin:0;padding:92px 88px 50px;background:#082c22;color:#f1f4ea;font:24px/1.5 system-ui,sans-serif;height:100vh}#controlled-recording-note{position:fixed;top:0;left:0;right:0;padding:14px 30px;background:#cedfa8;color:#133c2c;font-size:14px;font-weight:700;text-align:center}header{font-size:17px;letter-spacing:.13em;text-transform:uppercase;color:#d3e8b5}h1{font-size:58px;line-height:1.1;font-weight:500;margin:24px 0 34px;letter-spacing:-.045em}main{display:grid;gap:12px}.item{display:grid;grid-template-columns:310px 1fr;gap:28px;border:1px solid #8ca98b55;border-radius:14px;background:#ffffff06;padding:18px 22px}.label{font-size:18px;color:#bdcfb6}.value{font-size:25px;overflow-wrap:anywhere}aside{font-size:21px;color:#dbe9bf;margin-top:24px}footer{font:15px/1.5 ui-monospace,monospace;color:#a5c3ad;position:absolute;bottom:32px;left:88px;right:88px;overflow-wrap:anywhere}</style><div id="controlled-recording-note">${escapeHtml(evidenceBanner)}</div><header>${escapeHtml(eyebrow)}</header><h1>${escapeHtml(title)}</h1><main>${rows.map(([label, value]) => `<div class="item"><span class="label">${escapeHtml(label)}</span><span class="value">${escapeHtml(value)}</span></div>`).join('')}</main><aside>${escapeHtml(note)}</aside><footer>${escapeHtml(source)}</footer></html>`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('aside').getBoundingClientRect().bottom < document.querySelector('footer').getBoundingClientRect().top)).toBe(true);
      await hold(caption, 7_500, evidenceBanner);
    };
    await page.goto(`${baseURL}/app`);
    await expect(page.locator('main.route-state')).toHaveCount(0);
    await expect(page.getByLabel('Search stocks and ETFs')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apply illustrative split', exact: true })).toBeVisible();
    await hold(name === 'first-minute' ? 'Start planning without an account. The searchable Live catalog here is a fixture.' : 'Technical walkthrough: exact integer allocation and explicit provenance; all quoted values are fixtures.');
    if (name === 'first-minute') {
      await page.getByLabel('Search stocks and ETFs').fill('Apple');
      await hold('Search by company, ticker, or exact mint. Nothing is selected automatically.', 2_500);
      await page.getByLabel('Search stocks and ETFs').fill('');
    }
    await page.getByRole('button', { name: 'Apply illustrative split', exact: true }).click();
    await page.getByLabel('USDC budget').fill('10.000001');
    await expect(page.getByLabel('AAPLx percentage')).toHaveValue('50');
    await expect(page.getByLabel('MSFTx percentage')).toHaveValue('30');
    await expect(page.getByLabel('NVDAx percentage')).toHaveValue('20');
    await page.locator('.plan-panel').scrollIntoViewIfNeeded();
    await hold('Explicitly apply the illustrative 50 / 30 / 20 split. Every asset and percentage stays editable.');
    await page.getByRole('button', { name: 'Get estimates', exact: true }).click();
    await expect(page.getByRole('cell', { name: '+1.23', exact: true })).toHaveCount(3);
    await page.locator('.results-panel').scrollIntoViewIfNeeded();
    await hold('10.000001 USDC is conserved exactly: 5.000001 + 3.000000 + 2.000000. Outputs shown are mocked.', 4_000);
    await page.screenshot({ path: `${output}/${name}-poster.jpg` });
    await page.getByText('Verify this plan', { exact: true }).click();
    await page.locator('.verification-receipt').scrollIntoViewIfNeeded();
    await expect(page.locator('.receipt-assets')).toContainText(assets[0].mint);
    await hold('Inspect the exact mint, issuer source, original quote time, and micro-USDC remainder.', 4_000);
    await page.getByText('Verify this plan', { exact: true }).click();
    if (name === 'technical-proof') {
      await expect(page.getByText(/Estimates are stale/)).toBeVisible({ timeout: 15_000 });
      await page.locator('.quote-freshness').scrollIntoViewIfNeeded();
      await hold('Expired estimates remain visibly stale. Saving or copying a plan cannot make its quotes fresh.', 4_000);
      quoteLifetime = 30_000;
      await page.getByRole('button', { name: 'Refresh estimates', exact: true }).click();
      await expect(page.locator('.quote-freshness')).not.toHaveClass(/is-stale/);
      await hold('Request new estimates to obtain a new observation and expiry.', 2_500);
    }
    await page.locator('.execution-card').scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Sign this purchase', exact: true })).toHaveCount(0);
    await hold('Purchase approval is gated. This clip proves planning UI, not wallet approval or real settlement.', 4_000);
    if (name === 'technical-proof') {
      await evidenceSlide({
        eyebrow: 'Recorded live read + unsigned simulation · not a settlement',
        title: 'One supported unsigned route.',
        rows: [
          ['Exact input / enforced minimum', `1 USDC (${unsignedProof.inputRaw} raw) → AAPLx ≥ ${unsignedProof.minimumOutputRaw} raw`],
          ['Observed simulation costs', `${unsignedProof.networkFeeLamports} network lamports · ${unsignedProof.rentLamports} rent · ${unsignedProof.tokenFeeRaw} raw USDC token fee`],
          ['Original chain context', `Slot ${unsignedProof.simulationSlot} · ${unsignedProof.lookupTableCount} lookup tables · ${unsignedProof.loadedAddressCount} loaded addresses`],
          ['Original output unit context', `Decimals ${unsignedProof.outputUnitContext.decimals} · clock multiplier ${unsignedProof.outputUnitContext.multiplier} · raw amounts retained`],
          ['Semantic validator', unsignedProof.validator],
        ],
        note: `Observed ${unsignedProof.observedAt} · message SHA-256 ${unsignedProof.transactionMessageHash.slice(0, 16)}… · No signature or broadcast.`,
        source: 'Source: docs/releases/2026-09-20/unsigned-semantic-proof.json · supported Jupiter route_v2 / Raydium CLMM subset only',
        caption: `Recorded unsigned mainnet evidence: 1 USDC, minimum ${unsignedProof.minimumOutputRaw} raw AAPLx, ${unsignedProof.networkFeeLamports} network lamports, slot ${unsignedProof.simulationSlot}. No signing, broadcast, or verified settlement.`,
      });
      await evidenceSlide({
        eyebrow: 'Implemented source call path · an explanation, not a wallet recording',
        title: 'Before a wallet can approve.',
        rows: [
          ['1 · createExecutionOrder', 'Fresh exact-mint Jupiter order for immutable run intent.'],
          ['2 · validateExecutableOrder', 'Decode route, ALT accounts, exact input/minimum, owner/mint/program and fee limits; simulate.'],
          ['3 · createAttempt', 'Persist approved message hash, original lifetime, request ID and semantic proof.'],
          ['4 · Review + wallet approval', 'Wallet signs the exact reviewed message; server verifies message bytes and Ed25519 signature.'],
        ],
        note: 'Unknown instruction variants fail closed. Issuer controls and trusted program behavior remain explicit limitations.',
        source: 'Source: lib/server/execution/{orders,semantic-validation,repository,submit}.ts · components/execution-review.tsx',
        caption: 'Source path: createExecutionOrder → validateExecutableOrder → createAttempt → explicit wallet review. Exact signed message bytes and the required signature are verified before submission.',
      });
      await evidenceSlide({
        eyebrow: 'Implemented recovery contract · controlled recovery film shown separately',
        title: 'Persist, submit, reconcile.',
        rows: [
          ['Before the network write', 'Durably persist signed state + original chain signature, then call Jupiter execute.'],
          ['Provider response is evidence', 'Solana receipt must match original message, raw mint deltas, fees and confirmation status.'],
          ['Lost response → unknown', 'Reconcile the original signature. Unknown blocks a replacement purchase.'],
          ['Partial contribution', 'Confirmed legs stay confirmed. Later legs wait; resume reviews only the remaining safe leg.'],
        ],
        note: 'No automatic equivalent retry. This source explanation and fixture tests do not establish a real funded settlement.',
        source: 'Source: app/api/execution/runs/[runId]/legs/[legId]/execute/route.ts · lib/server/execution/{repository,reconciliation,receipts}.ts',
        caption: 'Persist original signature before execute. An unknown result blocks replacement until original-signature reconciliation. Receipt checks and durable history protect partial contributions; real settlement remains unverified.',
      });
    }
    expect(networkWrites).toEqual([]);
    const rawVideo = await page.video().path();
    await context.close();
    const mp4 = `${output}/${name}.mp4`;
    execFileSync('ffmpeg', ['-y', '-i', rawVideo, '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4], { stdio: 'ignore' });
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height,codec_name', '-of', 'json', mp4], { encoding: 'utf8' }));
    const evidenceDescription = name === 'technical-proof' ? `\n\nAfter the controlled UI recording, separate explanatory slides summarize the sanitized unsigned mainnet proof from ${unsignedProof.observedAt}, validator ${unsignedProof.validator}, message SHA-256 ${unsignedProof.transactionMessageHash.slice(0, 16)}…, and the implemented source call path. The original output unit context retains decimals ${unsignedProof.outputUnitContext.decimals} and clock-derived multiplier ${unsignedProof.outputUnitContext.multiplier}; raw transaction amounts stay authoritative. These slides are not application screens or a recording of wallet approval. The simulation is unsigned; source and fixture evidence are not real settlement.\n` : '';
    const transcript = `${banner}. Silent recording captured from the current local application on September 20, 2026.\n\n${cues.map(cue => cue.text).join('\n\n')}${evidenceDescription}\n\nNo real wallet connected, transaction signed, or funds moved. UI catalog and quote responses are controlled fixtures. This is not evidence of a mainnet settlement. Original September 12 narrated films are preserved separately.\n`;
    await writeFile(`${output}/${name}.transcript.txt`, transcript);
    await writeFile(`${output}/${name}.en.vtt`, `WEBVTT\n\n${cues.map((cue, index) => `${index + 1}\n${stamp(cue.start)} --> ${stamp(cue.end)}\n${cue.text}`).join('\n\n')}\n`);
    const bytes = await readFile(mp4);
    films[name] = { src: `/videos/release-20260920/${name}.mp4`, poster: `/videos/release-20260920/${name}-poster.jpg`, captions: `/videos/release-20260920/${name}.en.vtt`, description: `/videos/release-20260920/${name}.transcript.txt`, durationSeconds: Number(probe.format.duration), width: 1440, height: 1000, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, silent: true, fixtureOnly: name === 'first-minute', evidenceClasses: name === 'first-minute' ? ['controlled-local-ui'] : ['controlled-local-ui', 'recorded-unsigned-mainnet-proof', 'source-call-path-explainer'], settlementVerified: false, transcript };
    console.log(JSON.stringify({ film: name, ...films[name], transcript: undefined }));
  }
  await writeFile(`${output}/manifest.json`, `${JSON.stringify({ recordedAt: new Date().toISOString(), source: 'current local production build with controlled catalog/quotes; separate source and recorded unsigned-evidence explainer', realFundsMoved: false, films }, null, 2)}\n`);
} finally { await browser.close(); }
