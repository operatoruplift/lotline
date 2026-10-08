/**
 * Regenerates the Solana dApp Store listing kit in docs/dapp-store/.
 *
 *   node scripts/generate-store-kit.mjs             banner and screenshots
 *   node scripts/generate-store-kit.mjs --banner    banner only
 *   node scripts/generate-store-kit.mjs --screens   screenshots only
 *   node scripts/generate-store-kit.mjs --verify    check the kit on disk, capture nothing
 *
 * - docs/dapp-store/banner-1200x600.png: scripts/store-kit/banner.html (brand kit art, the exact
 *   mark files and the app's type) rendered by Playwright at 1200 x 600, deviceScaleFactor 1.
 * - docs/dapp-store/screenshots/*.png: portrait captures of the LIVE production site,
 *   https://lotline.dev, at 360 x 640 and deviceScaleFactor 3 (1080 x 1920) with Android
 *   Chrome emulation and service workers blocked. The browser only reads: it seeds a draft plan
 *   in its own local storage, as the planner does, and asks for read-only estimates. It never
 *   signs in, signs, saves, shares or reports anything. Production data changes, so every run
 *   shows that day's prices and estimates.
 *
 * Every run ends by checking the whole kit: the banner must be exactly 1200 x 600, and each
 * screenshot exactly 1080 x 1920 and under 3 MB, all the same size. Any violation exits non-zero.
 */
import { chromium, devices } from '@playwright/test';
import sharp from 'sharp';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const KIT = join(ROOT, 'docs', 'dapp-store');
const SCREENS = join(KIT, 'screenshots');
const BANNER = join(KIT, 'banner-1200x600.png');
const BANNER_SOURCE = join(ROOT, 'scripts', 'store-kit', 'banner.html');
const ORIGIN = 'https://lotline.dev';
const BANNER_SIZE = { width: 1200, height: 600 };
const SCREEN_SIZE = { width: 1080, height: 1920 };
const MAX_SCREEN_BYTES = 3_000_000;
const SCREEN_COUNT = { min: 5, max: 6 };

const MINTS = {
  AAPLx: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp',
  MSFTx: 'XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX',
  NVDAx: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh',
};
/** A realistic three-asset draft, in the shape the planner keeps under lotline:basket:v1. */
const PLAN = { version: 1, budget: '250', items: [
  { mint: MINTS.AAPLx, percent: '40' },
  { mint: MINTS.MSFTx, percent: '35' },
  { mint: MINTS.NVDAx, percent: '25' },
] };

const options = process.argv.slice(2);
const unknown = options.filter(option => !['--banner', '--screens', '--verify'].includes(option));
if (unknown.length || (options.includes('--verify') && options.length > 1)) {
  console.error(`Use --banner, --screens, --verify on its own, or nothing for the banner and the screenshots.`);
  process.exit(2);
}
const verifyOnly = options.includes('--verify');
const wantBanner = !verifyOnly && (options.length === 0 || options.includes('--banner'));
const wantScreens = !verifyOnly && (options.length === 0 || options.includes('--screens'));

async function renderBanner(browser) {
  const page = await browser.newPage({ viewport: BANNER_SIZE, deviceScaleFactor: 1 });
  const failed = [];
  page.on('requestfailed', request => failed.push(request.url()));
  await page.goto(pathToFileURL(BANNER_SOURCE).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  if (failed.length) throw new Error(`The banner could not load ${failed.join(', ')}`);
  await page.screenshot({ path: BANNER, type: 'png' });
  await page.close();
  console.log(`Rendered ${relative(ROOT, BANNER)}`);
}

/** One visible page, fonts and in-view images ready, no focus ring or skip link showing. */
async function settle(page) {
  await page.waitForFunction(() => !document.querySelector('main.route-state') && document.querySelectorAll('main#main').length === 1, null, { timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every(image => {
    const box = image.getBoundingClientRect();
    const inView = box.width > 0 && box.bottom > 0 && box.top < window.innerHeight;
    return !inView || (image.complete && image.naturalWidth > 0);
  }), null, { timeout: 20_000 }).catch(() => console.warn('  Some images in view were still loading.'));
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.waitForTimeout(600);
}

/** Scrolls so the element's top sits `gap` pixels below the top of the screen. */
async function scrollToTop(page, locator, gap) {
  await locator.first().evaluate((element, offset) => {
    window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - offset, behavior: 'instant' });
  }, gap);
}

async function shoot(page, name) {
  const path = join(SCREENS, name);
  await page.screenshot({ path, type: 'png', animations: 'disabled', caret: 'hide' });
  // Lossless recompression keeps every screen well under the 3 MB limit.
  const compressed = await sharp(path).png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 }).toBuffer();
  await sharp(compressed).toFile(path);
  console.log(`Captured ${relative(ROOT, path)}`);
}

async function portfolio(page, name) {
  await page.goto(`${ORIGIN}/portfolio`, { waitUntil: 'domcontentloaded' });
  await page.getByText(/Prices are Jupiter’s market snapshot/).waitFor({ timeout: 60_000 });
  await settle(page);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await shoot(page, name);
}

async function planner(page, name) {
  await page.goto(`${ORIGIN}/app`, { waitUntil: 'domcontentloaded' });
  await page.getByText(/\d+ (issuer-)?verified assets/).first().waitFor({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Change NVDAx' }).waitFor({ timeout: 30_000 });
  await settle(page);
  await scrollToTop(page, page.locator('.split-label'), 16);
  await page.waitForTimeout(300);
  await shoot(page, name);
}

/** Live estimates for the seeded plan, taken right away: the planner marks quotes stale after 30 seconds. */
async function estimates(page, name) {
  for (let attempt = 1; ; attempt += 1) {
    await page.getByRole('button', { name: /^(Get|Refresh) estimates/ }).click();
    const received = page.getByText('Live quotes received');
    await received.or(page.getByText('Quotes unavailable')).waitFor({ timeout: 90_000 });
    if (await received.isVisible()) break;
    if (attempt === 3) throw new Error('Jupiter returned no live estimates after three attempts.');
    console.warn(`  Estimates were unavailable (attempt ${attempt}); retrying in 20 seconds.`);
    await page.waitForTimeout(20_000);
  }
  const dismiss = page.getByRole('button', { name: 'Dismiss notification' });
  if (await dismiss.isVisible()) await dismiss.click();
  await page.waitForTimeout(800);
  await scrollToTop(page, page.locator('#contribution-results .panel-kicker'), 16);
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.waitForTimeout(500);
  await shoot(page, name);
}

async function markets(page, name) {
  await page.goto(`${ORIGIN}/markets?category=stocks`, { waitUntil: 'domcontentloaded' });
  await page.getByText(/Snapshot from Jupiter at/).waitFor({ timeout: 60_000 });
  await page.getByRole('heading', { level: 1, name: 'Find what goes in your next contribution.' }).waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: /Open details$/ }).first().waitFor({ timeout: 30_000 });
  await settle(page);
  await scrollToTop(page, page.getByRole('group', { name: 'Asset type' }), 16);
  await page.waitForTimeout(400);
  await shoot(page, name);
}

/** An asset sheet with its price chart. Tries the next asset when a pool has no chart to draw. */
async function asset(page, name) {
  for (const [symbol, mint] of Object.entries(MINTS)) {
    await page.goto(`${ORIGIN}/markets?asset=${mint}`, { waitUntil: 'domcontentloaded' });
    const sheet = page.getByRole('dialog');
    await sheet.waitFor({ timeout: 60_000 });
    await sheet.getByRole('button', { name: '7D' }).click();
    const charted = await sheet.locator('figure svg').waitFor({ timeout: 45_000 }).then(() => true, () => false);
    if (!charted) { console.warn(`  No price chart for ${symbol}; trying the next asset.`); continue; }
    await settle(page);
    await shoot(page, name);
    return;
  }
  throw new Error('No asset sheet showed a price chart.');
}

async function signIn(page, name) {
  await page.goto(`${ORIGIN}/sign-in`, { waitUntil: 'domcontentloaded' });
  const wallet = page.getByRole('button', { name: /Mobile Wallet Adapter/ });
  const found = await wallet.waitFor({ timeout: 30_000 }).then(() => true, () => false);
  if (!found) console.warn('  Mobile Wallet Adapter did not register; the screen shows the no-wallet state.');
  await settle(page);
  await page.waitForTimeout(1_500);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await shoot(page, name);
}

/** Runs a capture step, retrying once after a transient failure such as a slow production response. */
async function retryOnce(label, step) {
  try { await step(); }
  catch (error) {
    console.warn(`  ${label} failed (${error instanceof Error ? error.message.split('\n')[0] : error}); retrying once.`);
    await step();
  }
}

async function captureScreens(browser) {
  await mkdir(SCREENS, { recursive: true });
  for (const file of await readdir(SCREENS)) if (file.endsWith('.png')) await rm(join(SCREENS, file));
  const gallery = await fetch(`${ORIGIN}/api/gallery?sort=copies&page=1`).then(response => response.json()).catch(() => null);
  const shared = Array.isArray(gallery?.plans) ? gallery.plans.length : 0;
  // Community has no shared plans yet, so the live estimates stand in for it rather than an empty state.
  if (shared > 0) console.warn(`Community now lists ${shared} shared plan(s). Consider a Community screenshot; see docs/dapp-store/listing.md.`);

  const context = await browser.newContext({
    ...devices['Pixel 7'],
    viewport: { width: 360, height: 640 }, screen: { width: 360, height: 640 }, deviceScaleFactor: 3,
    isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'en-US', timezoneId: 'UTC', reducedMotion: 'reduce',
  });
  await context.addInitScript(plan => { try { window.localStorage.setItem('lotline:basket:v1', plan); } catch { /* A blocked store just shows an empty plan. */ } }, JSON.stringify(PLAN));
  const page = await context.newPage();
  await retryOnce('Portfolio', () => portfolio(page, '01-portfolio.png'));
  await retryOnce('Planner', () => planner(page, '02-planner.png'));
  await retryOnce('Estimates', () => estimates(page, '03-estimates.png'));
  await retryOnce('Markets', () => markets(page, '04-markets.png'));
  await retryOnce('Asset sheet', () => asset(page, '05-asset-chart.png'));
  await retryOnce('Sign in', () => signIn(page, '06-sign-in-with-solana.png'));
  await context.close();
}

async function verify() {
  const rows = [];
  const problems = [];
  const describe = async path => {
    const [{ width, height }, { size }] = await Promise.all([sharp(path).metadata(), stat(path)]);
    rows.push({ file: relative(ROOT, path), width, height, bytes: size });
    return { width, height, bytes: size };
  };
  const banner = await describe(BANNER).catch(() => null);
  if (!banner) problems.push(`${relative(ROOT, BANNER)} is missing.`);
  else if (banner.width !== BANNER_SIZE.width || banner.height !== BANNER_SIZE.height) problems.push(`The banner is ${banner.width} x ${banner.height}, not ${BANNER_SIZE.width} x ${BANNER_SIZE.height}.`);

  const files = (await readdir(SCREENS).catch(() => [])).filter(file => file.endsWith('.png')).sort();
  if (files.length < SCREEN_COUNT.min || files.length > SCREEN_COUNT.max) problems.push(`Expected ${SCREEN_COUNT.min} to ${SCREEN_COUNT.max} screenshots, found ${files.length}.`);
  for (const file of files) {
    const screen = await describe(join(SCREENS, file));
    if (screen.width !== SCREEN_SIZE.width || screen.height !== SCREEN_SIZE.height) problems.push(`${file} is ${screen.width} x ${screen.height}, not ${SCREEN_SIZE.width} x ${SCREEN_SIZE.height}.`);
    if (screen.bytes >= MAX_SCREEN_BYTES) problems.push(`${file} is ${screen.bytes} bytes, over the 3 MB limit.`);
  }

  const width = Math.max(...rows.map(row => row.file.length), 4);
  console.log(`\n${'File'.padEnd(width)}  ${'Size'.padStart(11)}  ${'Bytes'.padStart(9)}`);
  for (const row of rows) console.log(`${row.file.padEnd(width)}  ${`${row.width} x ${row.height}`.padStart(11)}  ${String(row.bytes).padStart(9)}`);
  if (problems.length) {
    console.error(`\nThe kit does not meet the store limits:\n- ${problems.join('\n- ')}`);
    process.exitCode = 1;
  } else {
    console.log(`\nThe kit meets the store limits: banner ${BANNER_SIZE.width} x ${BANNER_SIZE.height}, ${files.length} screenshots at ${SCREEN_SIZE.width} x ${SCREEN_SIZE.height}, each under 3 MB.`);
  }
}

await mkdir(KIT, { recursive: true });
if (wantBanner || wantScreens) {
  const browser = await chromium.launch();
  try {
    if (wantBanner) await renderBanner(browser);
    if (wantScreens) await captureScreens(browser);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}
if (!process.exitCode) await verify();
