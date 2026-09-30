import { chromium, expect } from '@playwright/test';
import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';

// Always use a new output directory. Historical narrated releases are immutable.
const output = resolve('public/videos/release-20260930');
const work = resolve('work/app-tour-20260930');
const origin = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3153';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('Record only a local preview.');
const ffmpeg = process.env.FFMPEG_PATH ?? '/usr/local/bin/ffmpeg';
const ffprobe = process.env.FFPROBE_PATH ?? '/usr/local/bin/ffprobe';
await mkdir(output, { recursive: true });
await mkdir(work, { recursive: true });
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const stamp = seconds => new Date(seconds * 1000).toISOString().slice(11, 23);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const browser = await chromium.launch();
const films = {};
const blockedWrites = [];
const explanationText = new WeakMap();

async function frame(title, subtitle, index, count, film, destination) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><radialGradient id="g"><stop stop-color="#2d5146"/><stop offset="1" stop-color="#142e26"/></radialGradient></defs><rect width="1920" height="1080" fill="url(#g)"/><circle cx="1760" cy="60" r="400" fill="#baceac" opacity=".025"/><text x="120" y="52" font-family="Arial" font-size="19" letter-spacing="4" fill="#bfd0ba">LOTLINE / ${film === 'product' ? 'APP TOUR' : 'TECHNICAL TOUR'} / ${String(index + 1).padStart(2, '0')}</text><text x="120" y="105" font-family="Arial" font-weight="600" font-size="38" fill="#faf5ec">${escape(title)}</text><text x="120" y="140" font-family="Arial" font-size="23" fill="#d2ded2">${escape(subtitle)}</text><text x="1800" y="52" text-anchor="end" font-family="Arial" font-size="18" fill="#bfd0ba">30 SEP 2026 · NO FUNDS MOVED</text><rect x="114" y="160" width="1692" height="878" rx="15" fill="#dce4d5"/><rect x="120" y="1053" width="1680" height="3" fill="#456456"/><rect x="120" y="1053" width="${1680 * (index + 1) / count}" height="3" fill="#c2d8ac"/></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(destination);
}

async function explain(page, eyebrow, title, lines, footnote) {
  explanationText.set(page, [eyebrow, title, ...lines, footnote]);
  await page.setContent(`<html lang="en"><head><title>${escape(title)}</title><style>*{box-sizing:border-box}body{margin:0;background:#fbf6ec;color:#142e26;font-family:Arial,sans-serif;padding:70px 90px}small{font-size:16px;letter-spacing:3px;color:#536a5a}h1{font-size:54px;letter-spacing:-2px;max-width:1100px;line-height:1.1;margin:25px 0 40px}ol{list-style:none;padding:0;display:grid;gap:16px;counter-reset:steps}li{counter-increment:steps;font-size:25px;padding:22px 25px;background:white;border:1px solid #d9e1d3;border-radius:12px;display:flex;gap:23px;align-items:center}li:before{content:counter(steps,decimal-leading-zero);font-size:19px;color:#56785c}footer{font-size:17px;line-height:1.6;color:#596456;max-width:1120px;margin-top:30px}</style></head><body><small>${escape(eyebrow)} · TECHNICAL EXPLAINER</small><h1>${escape(title)}</h1><ol>${lines.map(line => `<li>${escape(line)}</li>`).join('')}</ol><footer>${escape(footnote)}</footer></body></html>`);
}

try {
  for (const film of ['product', 'technical']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 740 }, deviceScaleFactor: 1, serviceWorkers: 'block', recordVideo: { dir: work, size: { width: 1440, height: 740 } } });
    await context.route('**/api/**', route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      // This capture must never publish, save an account plan or request a transaction.
      if (request.method() !== 'GET' && !['/api/quotes', '/api/market-reference'].includes(path)) {
        blockedWrites.push({ path, method: request.method() });
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    const began = Date.now();
    const video = page.video();
    const scenes = [];
    async function scene(title, subtitle, prepare, act = async () => {}, seconds = 8) {
      console.log(`${film}: preparing ${title}`);
      explanationText.delete(page);
      await prepare();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(350);
      const from = (Date.now() - began) / 1000;
      await act();
      const elapsed = (Date.now() - began) / 1000 - from;
      await page.waitForTimeout(Math.max(0, seconds - elapsed) * 1000);
      scenes.push({ title, subtitle, from, duration: Math.max(seconds, elapsed), textAlternative: explanationText.get(page) ?? [subtitle] });
      console.log(`${film}: captured ${title}`);
    }
    const example = async budget => {
      await page.goto(`${origin}/app?mode=example`);
      await expect(page.getByLabel('USDC budget')).toBeVisible();
      await page.getByRole('button', { name: 'Reset example', exact: true }).click();
      await page.getByLabel('USDC budget').fill(budget);
    };
    const estimates = async () => {
      await page.getByRole('button', { name: 'Get estimates', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Refresh estimates', exact: true })).toBeEnabled();
    };
    if (film === 'product') {
      await scene('A familiar place to return.', 'Your saved contribution plan, at a glance.', async () => {
        await example('1000');
        await page.goto(`${origin}/portfolio`);
        await expect(page.getByRole('heading', { level: 1 })).toContainText('Your plan');
      });
      await scene('Explore before you add.', 'Browse identities, then inspect the asset. Market snapshots are not quotes.', async () => {
        await page.goto(`${origin}/markets`);
        await page.getByLabel('Search markets').fill('apple');
        await expect(page.getByRole('button', { name: 'AAPLx, Apple xStock. Open details' })).toBeVisible();
      }, async () => {
        await page.waitForTimeout(1400);
        await page.getByRole('button', { name: 'AAPLx, Apple xStock. Open details' }).click();
        await expect(page.getByRole('dialog', { name: 'Apple xStock' })).toBeVisible();
      }, 10);
      await scene('Your amount. Your split.', 'Example mode uses synthetic balances and estimates. Nothing is bought.', async () => {
        await example('1000');
        await page.getByLabel('USDC budget').scrollIntoViewIfNeeded();
      }, async () => {
        await page.waitForTimeout(1200);
        await page.getByLabel('USDC budget').fill('250');
        await estimates();
        await page.locator('#contribution-results').scrollIntoViewIfNeeded();
      }, 10);
      await scene('Every micro-USDC accounted for.', 'Open the calculation and inspect the sources behind each line.', async () => {
        await page.locator('.verification-receipt summary').click();
        await page.locator('.receipt-total').scrollIntoViewIfNeeded();
      });
      await scene('A starting point, never an auto-trade.', 'Browse community splits. Copying or following never approves a purchase.', async () => {
        await page.goto(`${origin}/plans`);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      });
      await scene('Keep the next step close.', 'Portfolio, Markets, Plan and Community stay within reach on your phone.', async () => {
        await page.setViewportSize({ width: 390, height: 740 });
        await page.goto(`${origin}/portfolio`);
        await expect(page.getByRole('navigation', { name: 'Planning sections' })).toBeVisible();
      }, async () => {
        await page.waitForTimeout(2000);
        await page.getByRole('navigation', { name: 'Planning sections' }).getByRole('link', { name: 'Markets', exact: true }).click();
      });
      scenes.at(-1).phone = true;
    } else {
      await scene('Precision starts with the budget.', 'Actual Example calculation. The extra micro-unit stays accounted for.', async () => {
        await example('10.000001'); await estimates();
        await page.locator('.verification-receipt summary').click();
        await page.locator('.receipt-total').scrollIntoViewIfNeeded();
      }, async () => {}, 10);
      await scene('Freshness is part of the result.', 'An estimate belongs to an amount and a time.', async () => {
        await explain(page, 'Provider boundaries', 'A price is context. A quote is specific.', ['Issuer identity and on-chain mint checks come first.', 'Changing the budget or split clears old estimates.', 'Pyth references retain their timestamp and confidence.'], 'Pyth may fall back or be unavailable. Expired references stay visibly stale; an earlier successful read cannot authorize a later purchase.');
      }, async () => {}, 10);
      await scene('Pre-IPO has its own planning path.', 'Actual PreStocks screen. Discovery does not promise a purchase route.', async () => {
        await page.goto(`${origin}/pre-ipo`);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await page.getByLabel('USDC budget').scrollIntoViewIfNeeded();
      });
      await scene('Validate before the wallet signs.', 'Technical explanation of the supported execution path.', async () => {
        await explain(page, 'Supported xStocks routes', 'The unsigned message has to match.', ['Check the wallet, mints, exact amounts and allowed programs.', 'Bound slippage and fees; validate the transaction instructions.', 'Simulate the unsigned message, then require wallet approval.'], 'Current validator scope is direct Raydium CLMM through Metis for supported scaled xStocks. This slide is an explanation, not a transaction or proof that every asset can settle.');
      }, async () => {}, 10);
      await scene('Uncertain is not complete.', 'A receipt follows confirmed chain evidence.', async () => {
        await explain(page, 'Recovery', 'Stop. Reconcile. Then continue.', ['Persist the original signature before submission.', 'Pause later approvals when the outcome is unknown.', 'Confirm the original transaction and actual token movements.'], 'Historical unsigned simulation and mocked recovery tests are separate evidence. Neither proves a real purchase. No wallet was connected and no funds moved in this recording.');
      }, async () => {}, 10);
    }
    await context.close();
    const raw = await video.path();
    let at = 0;
    const chapters = [];
    const paths = [];
    for (let index = 0; index < scenes.length; index++) {
      const part = scenes[index];
      const background = join(work, `${film}-${index}.png`);
      await frame(part.title, part.subtitle, index, scenes.length, film, background);
      const path = join(work, `${film}-${index}.mp4`);
      const screen = part.phone ? 'crop=390:740:0:0,scale=454:864' : 'scale=1680:864';
      const x = part.phone ? 733 : 120;
      execFileSync(ffmpeg, ['-y', '-v', 'error', '-loop', '1', '-framerate', '30', '-i', background, '-ss', String(part.from), '-i', raw, '-filter_complex', `[1:v]${screen},setsar=1[v];[0:v][v]overlay=${x}:167:shortest=1,fade=t=in:st=0:d=0.18,fade=t=out:st=${part.duration - .18}:d=0.18[out]`, '-map', '[out]', '-t', String(part.duration), '-r', '30', '-c:v', 'libx264', '-preset', 'fast', '-crf', '19', '-pix_fmt', 'yuv420p', '-an', path]);
      paths.push(path);
      chapters.push({ at, title: part.title, description: part.subtitle, duration: part.duration, phone: !!part.phone, textAlternative: part.textAlternative });
      at += part.duration;
    }
    const list = join(work, `${film}-concat.txt`);
    await writeFile(list, paths.map(path => `file '${path.replaceAll("'", "'\\''")}'`).join('\n'));
    const final = join(output, `${film}.mp4`);
    execFileSync(ffmpeg, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', final]);
    execFileSync(ffmpeg, ['-y', '-v', 'error', '-ss', '2', '-i', final, '-frames:v', '1', '-update', '1', join(output, `${film}-poster.jpg`)]);
    execFileSync(ffmpeg, ['-v', 'error', '-i', final, '-f', 'null', '-']);
    const probe = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=width,height,codec_name', '-of', 'json', final], { encoding: 'utf8' }));
    const captions = `WEBVTT\n\n${chapters.map(ch => `${stamp(ch.at)} --> ${stamp(ch.at + ch.duration)}\n${ch.title}\n${ch.description}`).join('\n\n')}\n`;
    await writeFile(join(output, `${film}.en.vtt`), captions);
    await writeFile(join(output, `${film}.transcript.txt`), `Lotline — September 30, 2026 ${film} tour. Caption-led, no narration. Actual local application footage; technical explanation slides are labeled. No generated UI, mocked wallet, purchase, signature or funds moved. Market observations are dated and may be unavailable. Example data is synthetic.\n\n${chapters.map(ch => `${ch.title}\n${ch.textAlternative.join('\n')}`).join('\n\n')}\n`);
    films[film] = { src: `/videos/release-20260930/${film}.mp4`, poster: `/videos/release-20260930/${film}-poster.jpg`, captions: `/videos/release-20260930/${film}.en.vtt`, transcript: `/videos/release-20260930/${film}.transcript.txt`, durationSeconds: Number(probe.format.duration), width: 1920, height: 1080, fps: 30, audio: false, fullDecode: 'passed', sha256: sha(await readFile(final)), chapters };
  }
  if (blockedWrites.length) throw new Error(`Capture attempted unexpected writes: ${JSON.stringify(blockedWrites)}`);
  await writeFile(join(output, 'manifest.json'), `${JSON.stringify({ recordedAt: new Date().toISOString(), source: origin, footage: 'Actual app; no mocked API responses. Technical slides explicitly labeled.', narration: { status: 'unavailable', reason: 'Higgsfield connected workspace has zero credits; no generation submitted.', requestedVoice: 'Ainsley', voiceId: '731b4ffe-e95e-59f4-8c00-81608936091f' }, signed: false, submitted: false, settlementProven: false, films }, null, 2)}\n`);
  console.log(JSON.stringify({ films: Object.fromEntries(Object.entries(films).map(([name, film]) => [name, { duration: film.durationSeconds, sha256: film.sha256 }])), blockedWrites }));
} finally {
  await browser.close();
}
