import { expect, test } from './test';
import { readFile } from 'node:fs/promises';
import type { BrowserContext, Page } from '@playwright/test';
import { EXAMPLE_ASSETS } from '../../lib/demo/example';
import { BASKET_STORAGE_KEY } from '../../lib/domain/storage';
import type { ContributionIntent, ExecutionState } from '../../lib/domain/execution';

test.use({ serviceWorkers: 'block', video: process.env.LOTLINE_RECORD_EXECUTION === '1' ? { mode: 'on', size: { width: 1440, height: 1000 } } : 'off' });

const walletAddress = '11111111111111111111111111111111';
const limits = { slippageBps: 50, maximumPriorityFeeLamports: '10000', maximumTotalSolCostLamports: '5000000', maximumTokenFeeBps: 0 };
type TestWallet = { reject: boolean; hold: boolean; release?: () => void; disconnect: () => void };
declare global { interface Window { lotlineTestWallet: TestWallet } }
type TestLeg = { id: string; leg_key: string; mint: string; input_raw: string; state: ExecutionState };
type TestAttempt = { id: string; leg_id: string; state: ExecutionState; signature?: string; evidence?: Record<string, unknown> };

async function fixture(context: BrowserContext, count = 1) {
  const assets = EXAMPLE_ASSETS.slice(0, count);
  const basket = { version: 1, budget: '100', items: assets.map(asset => ({ mint: asset.mint, percent: String(100 / count) })) };
  const state = {
    intent: null as ContributionIntent | null, legs: [] as TestLeg[], attempts: [] as TestAttempt[],
    orders: [] as string[], executions: [] as string[], reconciliations: [] as string[],
    paused: false, unknownLeg: -1, failedLeg: -1, lostResponse: false, expireOnSubmit: false, orderLifetime: 30_000,
    cloudWrites: [] as string[], schedules: [] as Record<string, unknown>[],
  };
  await context.addInitScript(({ basket, key, walletAddress }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(basket));
    const account = { address: walletAddress, publicKey: new Uint8Array(32), chains: ['solana:mainnet'], features: ['solana:signTransaction'] };
    let accounts = [account];
    const listeners = new Set<(change: { accounts: typeof accounts }) => void>();
    window.lotlineTestWallet = { reject: false, hold: false, disconnect: () => { accounts = []; listeners.forEach(listener => listener({ accounts })); } };
    const wallet = {
      version: '1.0.0', name: 'Controlled test wallet', icon: 'data:image/svg+xml;base64,PHN2Zy8+', chains: ['solana:mainnet'], get accounts() { return accounts; },
      features: {
        'standard:connect': { version: '1.0.0', connect: async () => ({ accounts }) },
        'standard:events': { version: '1.0.0', on: (_event: string, listener: (change: { accounts: typeof accounts }) => void) => { listeners.add(listener); return () => listeners.delete(listener); } },
        'solana:signTransaction': { version: '1.0.0', supportedTransactionVersions: [0], signTransaction: async (...inputs: { account: typeof account; transaction: Uint8Array; chain: string }[]) => {
          const input = inputs[0];
          if (inputs.length !== 1 || Array.isArray(input) || input.account.address !== walletAddress || input.chain !== 'solana:mainnet' || !(input.transaction instanceof Uint8Array)) throw new Error('Invalid Wallet Standard signing contract.');
          sessionStorage.setItem('lotline:test-sign-count', String(Number(sessionStorage.getItem('lotline:test-sign-count') ?? 0) + 1));
          if (window.lotlineTestWallet.reject) throw new Error('Test wallet rejected the signature.');
          if (window.lotlineTestWallet.hold) await new Promise<void>(resolve => { window.lotlineTestWallet.release = resolve; });
          return [{ signedTransaction: input.transaction }];
        } },
      },
    };
    window.addEventListener('wallet-standard:app-ready', event => (event as CustomEvent<{ register: (wallet: unknown) => void }>).detail.register(wallet));
  }, { basket, key: BASKET_STORAGE_KEY, walletAddress });
  await context.route('**/api/assets', route => route.fulfill({ json: { state: 'success', assets, unavailable: [] } }));
  await context.route('**/api/auth/session', route => route.fulfill({ json: { state: 'signed-in', user: { id: 'test-owner' } } }));
  await context.route('**/api/quotes', route => {
    const { items } = route.request().postDataJSON() as { items: { mint: string; usdcRaw: string }[] };
    return route.fulfill({ json: { state: 'success', quotes: items.map(item => ({ ...item, state: 'success', outRaw: '123000000', units: '1.23', fetchedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30000).toISOString(), source: 'Controlled Jupiter fixture' })) } });
  });
  await context.route('**/api/execution/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/config')) return route.fulfill({ json: { state: state.paused ? 'configuration-required' : 'success', enabled: !state.paused, reconciliationAvailable: true, limits, policyVersion: '2026-09-14.v1', ...(state.paused ? { message: 'In-app purchases are not available in this release. You can plan a contribution and review it independently on Jupiter.' } : {}) } });
    if (path.endsWith('/runs') && route.request().method() === 'POST') {
      state.intent = route.request().postDataJSON().intent;
      state.legs = state.intent!.legs.map((leg, index) => ({ id: `leg-${index}`, leg_key: leg.id, mint: leg.mint, input_raw: leg.maximumInputRaw, state: 'planned' }));
      return route.fulfill({ json: { state: 'success', run: { id: 'fixture-run', intent: state.intent }, legs: state.legs } });
    }
    if (path === '/api/execution/runs/fixture-run') return route.fulfill({ json: { state: 'success', run: { id: 'fixture-run', intent: state.intent }, legs: state.legs, attempts: state.attempts } });
    const orderMatch = path.match(/\/legs\/(leg-\d+)\/order$/);
    if (orderMatch) {
      const leg = state.legs.find(leg => leg.id === orderMatch[1])!;
      state.orders.push(leg.id); leg.state = 'review-required';
      const id = `00000000-0000-4000-8000-${String(state.attempts.length + 1).padStart(12, '0')}`;
      state.attempts.push({ id, leg_id: leg.id, state: 'review-required' });
      return route.fulfill({ json: { state: 'success', transaction: 'AQIDBA==', attempt: { id, requestId: id, state: 'review-required', messageHash: 'a'.repeat(64), inputRaw: leg.input_raw, outputRaw: '123000000', minimumOutputRaw: '122000000', router: 'metis', expiresAt: new Date(Date.now() + state.orderLifetime).toISOString(), prioritizationFeeLamports: '5000', signatureFeeLamports: '5000', rentFeeLamports: '2000000', totalSolCostLamports: '2010000', feeBps: 0, feeMint: state.intent!.inputMint } } });
    }
    const executeMatch = path.match(/\/legs\/(leg-\d+)\/execute$/);
    if (executeMatch) {
      const leg = state.legs.find(leg => leg.id === executeMatch[1])!;
      const attempt = state.attempts.find(attempt => attempt.id === route.request().postDataJSON().requestId)!;
      state.executions.push(leg.id);
      if (state.expireOnSubmit) { leg.state = 'expired-unbroadcast'; attempt.state = 'expired-unbroadcast'; return route.fulfill({ status: 409, json: { state: 'expired-unbroadcast', message: 'The order expired during approval.' } }); }
      leg.state = 'confirming'; attempt.state = 'confirming'; attempt.signature = `fixture-signature-${leg.id}`;
      if (state.lostResponse) return route.abort('failed');
      return route.fulfill({ json: { state: 'confirming', signature: attempt.signature } });
    }
    const reconcileMatch = path.match(/\/attempts\/([^/]+)\/reconcile$/);
    if (reconcileMatch) {
      const attempt = state.attempts.find(attempt => attempt.id === reconcileMatch[1])!;
      const leg = state.legs.find(leg => leg.id === attempt.leg_id)!;
      state.reconciliations.push(attempt.id);
      const index = state.legs.indexOf(leg);
      if (index === state.unknownLeg) { leg.state = 'unknown'; attempt.state = 'unknown'; return route.fulfill({ status: 503, json: { state: 'unknown', message: 'RPC history is unavailable.' } }); }
      if (index === state.failedLeg) { leg.state = 'failed-onchain'; attempt.state = 'failed-onchain'; return route.fulfill({ json: { state: 'failed-onchain', message: 'Solana returned meta.err.' } }); }
      leg.state = 'confirmed'; attempt.state = 'confirmed'; attempt.evidence = { confirmationStatus: 'finalized', slot: '123456', inputDebitRaw: leg.input_raw, outputCreditRaw: '123000000', feeLamports: '10000', walletSolDebitLamports: '2010000' };
      return route.fulfill({ json: { state: 'confirmed', signature: attempt.signature, confirmationStatus: 'finalized', slot: '123456' } });
    }
    return route.fulfill({ status: 404, json: { state: 'not-found' } });
  });
  await context.route('**/api/contribution-schedules', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { state: 'success', schedules: state.schedules } });
    state.cloudWrites.push(route.request().method());
    const body = route.request().postDataJSON();
    const schedule = { id: body.id ?? '00000000-0000-4000-8000-000000000001', budget_raw: body.budgetRaw, allocations: body.allocations, cadence: body.cadence, timezone: body.timezone, next_due_at: body.nextDueAt, paused: body.paused, plan_version: state.cloudWrites.length };
    state.schedules = [schedule];
    return route.fulfill({ json: { state: 'success', schedule } });
  });
  return state;
}

async function openReview(page: Page) {
  await page.goto('/app');
  await page.getByRole('button', { name: 'Get estimates', exact: true }).click();
  await page.getByRole('button', { name: 'Controlled test wallet', exact: true }).click();
  await page.getByRole('button', { name: 'Review purchase', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign this purchase', exact: true })).toBeEnabled();
}
async function signatures(page: Page) { return page.evaluate(() => Number(sessionStorage.getItem('lotline:test-sign-count') ?? 0)); }

test('one leg reviews exact units, signs with Wallet Standard and restores the confirmed receipt', async ({ page, context }) => {
  const state = await fixture(context);
  await openReview(page);
  await expect(page.locator('.execution-review')).toContainText('100.000000 USDC');
  await expect(page.locator('.execution-review')).toContainText('5000 lamports');
  await expect(page.locator('.execution-review')).toContainText('Solana mainnet');
  await page.getByRole('button', { name: 'Sign this purchase', exact: true }).click();
  await expect(page.getByText('All reviewed contribution legs are confirmed on Solana.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'View original transaction' })).toHaveCount(1);
  expect(state.executions).toEqual(['leg-0']); expect(await signatures(page)).toBe(1);
  await expect(page.getByText(/Settled debit 100.000000 USDC/)).toBeVisible();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download receipts', exact: true }).click();
  const receipt = JSON.parse(await readFile((await (await downloaded).path())!, 'utf8'));
  expect(receipt.receipts[0].evidence.inputDebitRaw).toBe('100000000');
  expect(receipt.receipts[0].evidence.outputCreditRaw).toBe('123000000');
  expect(receipt.receipts[0]).not.toHaveProperty('transaction');
  await page.reload();
  await expect(page.getByText('All reviewed contribution legs are confirmed on Solana.')).toBeVisible();
  await expect(page.getByText(/1 of 1 legs confirmed/)).toBeVisible();
  expect(state.orders).toEqual(['leg-0']);
});

test('wallet rejection, unsigned expiry and changed plan never submit stale bytes', async ({ page, context }) => {
  const state = await fixture(context);
  await openReview(page);
  await page.evaluate(() => { window.lotlineTestWallet.reject = true; });
  await page.getByRole('button', { name: 'Sign this purchase', exact: true }).click();
  await expect(page.getByText('Test wallet rejected the signature.')).toBeVisible();
  expect(state.executions).toEqual([]);
  await page.evaluate(() => { window.lotlineTestWallet.reject = false; });
  state.orderLifetime = -1000;
  await page.getByRole('button', { name: 'Resume remaining', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Update review', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Update review', exact: true }).click();
  state.orderLifetime = 30000;
  await page.getByRole('button', { name: 'Resume remaining', exact: true }).click();
  await page.getByLabel('USDC budget').fill('200');
  await expect(page.getByRole('button', { name: 'Sign this purchase', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Update review', exact: true })).toBeVisible();
  expect(state.executions).toEqual([]); expect(await signatures(page)).toBe(1);
});

test('lost execute response blocks another signature and recovers by the original receipt', async ({ page, context }) => {
  const state = await fixture(context);
  state.lostResponse = true;
  await openReview(page);
  await page.getByRole('button', { name: 'Sign this purchase', exact: true }).click();
  await expect(page.getByText(/The submission outcome is uncertain/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign this purchase', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Check original receipt', exact: true }).click();
  await expect(page.getByText('All reviewed contribution legs are confirmed on Solana.')).toBeVisible();
  expect(state.executions).toEqual(['leg-0']); expect(await signatures(page)).toBe(1);
});

test('expiry during wallet approval clears only after authoritative unsigned expiry', async ({ page, context }) => {
  const state = await fixture(context);
  state.expireOnSubmit = true;
  await openReview(page);
  await page.getByRole('button', { name: 'Sign this purchase', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Check original receipt', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Check original receipt', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume remaining', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem('lotline:pending-execution:fixture-run'))).toBeNull();
  expect(await signatures(page)).toBe(1);
});

test('a second tab cannot prompt while the first wallet approval is pending', async ({ page, context }) => {
  const state = await fixture(context);
  await openReview(page);
  const second = await context.newPage();
  await second.goto('/app');
  await second.evaluate(() => sessionStorage.setItem('lotline:last-execution-run', 'fixture-run'));
  await second.reload();
  await second.getByRole('button', { name: 'Controlled test wallet', exact: true }).click();
  await second.getByRole('button', { name: 'Resume remaining', exact: true }).click();
  await page.evaluate(() => { window.lotlineTestWallet.hold = true; });
  await page.getByRole('button', { name: 'Sign this purchase', exact: true }).click();
  await expect.poll(() => signatures(page)).toBe(1);
  await second.getByRole('button', { name: 'Sign this purchase', exact: true }).click();
  await expect(second.getByText(/Another Lotline tab is reviewing a wallet approval/)).toBeVisible();
  expect(await signatures(second)).toBe(0);
  await page.evaluate(() => window.lotlineTestWallet.release?.());
  await expect(page.getByText('All reviewed contribution legs are confirmed on Solana.')).toBeVisible();
  expect(state.executions).toEqual(['leg-0']);
  await second.close();
});

test('disconnect during approval never submits the returned bytes', async ({ page, context }) => {
  const state = await fixture(context);
  await openReview(page);
  await page.evaluate(() => { window.lotlineTestWallet.hold = true; });
  await page.getByRole('button', { name: 'Sign this purchase', exact: true }).click();
  await expect.poll(() => signatures(page)).toBe(1);
  await page.evaluate(() => { window.lotlineTestWallet.disconnect(); window.lotlineTestWallet.release?.(); });
  await expect(page.getByText('The plan, wallet, or catalog changed during approval. The signed bytes were not submitted.')).toBeVisible();
  expect(state.executions).toEqual([]);
});

test.describe('controlled execution walkthrough — fixtures only', () => {
  test('four legs stop after two confirmations and an unknown third, then safely resume and save cadence', async ({ page, context }, testInfo) => {
    const state = await fixture(context, 4);
    state.unknownLeg = 2;
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { const label = document.createElement('div'); label.textContent = 'CONTROLLED TEST FIXTURE • Mocked wallet and providers • No funds moved'; label.style.cssText = 'position:fixed;top:0;left:0;right:0;text-align:center;background:#163c28;color:white;padding:8px;z-index:9999;font:12px sans-serif;pointer-events:none'; document.body.append(label); }));
    await openReview(page);
    await page.locator('.execution-card').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('fixture-review-1440.png') });
    for (let index = 0; index < 3; index += 1) {
      await page.getByRole('button', { name: 'Sign this purchase', exact: true }).click();
      if (index < 2) await expect(page.getByText(`${index + 1} of 4 legs confirmed`, { exact: false })).toBeVisible();
    }
    await expect(page.getByText(/previous leg still needs reconciliation/)).toBeVisible();
    expect(state.executions).toEqual(['leg-0', 'leg-1', 'leg-2']); expect(await signatures(page)).toBe(3);
    await expect(page.getByRole('button', { name: 'Sign this purchase', exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('fixture-partial-recovery-1440.png') });
    await page.reload();
    await expect(page.getByText(/2 of 4 legs confirmed/)).toBeVisible();
    await page.getByRole('button', { name: 'Check original receipt', exact: true }).click();
    expect(await signatures(page)).toBe(3); expect(state.orders).toEqual(['leg-0', 'leg-1', 'leg-2']);
    state.unknownLeg = -1;
    await page.getByRole('button', { name: 'Check original receipt', exact: true }).click();
    await expect(page.getByText(/3 of 4 legs confirmed/)).toBeVisible();
    await page.getByRole('button', { name: 'Controlled test wallet', exact: true }).click();
    await page.getByRole('button', { name: 'Resume remaining', exact: true }).click();
    await page.getByRole('button', { name: 'Sign this purchase', exact: true }).click();
    await expect(page.getByText('All reviewed contribution legs are confirmed on Solana.')).toBeVisible();
    expect(state.executions).toEqual(['leg-0', 'leg-1', 'leg-2', 'leg-3']); expect(await signatures(page)).toBe(4);
    await page.getByRole('button', { name: 'Save review reminder', exact: true }).click();
    await expect(page.getByText(/Review reminder saved on this device/)).toBeVisible();
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.locator('.execution-card').scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`fixture-receipts-${width}.png`) });
      await page.locator('.schedule-card').scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`fixture-schedule-${width}.png`) });
    }
  });
});

test('saved schedule restores exact snapshot, due state, pause, occurrence and updates the same cloud reminder', async ({ page, context }) => {
  const state = await fixture(context);
  await page.goto('/app');
  await page.getByLabel('Next review', { exact: true }).fill('2026-01-15T09:30');
  await page.getByRole('combobox', { name: 'Cadence', exact: true }).selectOption('weekly');
  await page.getByRole('button', { name: 'Save review reminder', exact: true }).click();
  await expect(page.getByText('Your contribution review is due', { exact: true })).toBeVisible();
  await page.getByLabel('USDC budget').fill('200');
  await page.reload();
  await page.getByRole('button', { name: 'Review saved split', exact: true }).click();
  await expect(page.getByLabel('USDC budget')).toHaveValue('100');
  await page.getByRole('button', { name: 'Get estimates', exact: true }).click();
  await page.getByRole('button', { name: 'Controlled test wallet', exact: true }).click();
  await page.getByRole('button', { name: 'Review purchase', exact: true }).click();
  expect(state.intent?.scheduleOccurrenceId).toContain(':2026-01-');
  await page.getByRole('button', { name: 'Pause reminder', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review saved split', exact: true })).toBeDisabled();
  await expect(page.getByText('Your contribution review is due', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Resume reminder', exact: true }).click();
  await page.getByRole('button', { name: 'Schedule next review', exact: true }).click();
  await expect(page.getByText(/No catch-up purchase was created/)).toBeVisible();
  await page.getByRole('button', { name: 'Sync account', exact: true }).click();
  await expect(page.getByText(/Reminder synced to your account/)).toBeVisible();
  await page.getByRole('button', { name: 'Sync account', exact: true }).click();
  await expect.poll(() => state.cloudWrites).toEqual(['POST', 'PATCH']);
  expect(state.executions).toEqual([]);
});


test('on-chain failure stops the basket and keeps the original failed receipt', async ({ page, context }) => {
  const state = await fixture(context, 4);
  state.failedLeg = 0;
  await openReview(page);
  await page.getByRole('button', { name: 'Sign this purchase', exact: true }).click();
  await expect(page.getByText(/This contribution stopped after a failed or rejected leg/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume remaining', exact: true })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'View original transaction' })).toHaveCount(1);
  expect(state.orders).toEqual(['leg-0']); expect(await signatures(page)).toBe(1);
});

test('receipt reconciliation remains available when new purchases are paused', async ({ page, context }) => {
  const state = await fixture(context);
  state.lostResponse = true; state.unknownLeg = 0;
  await openReview(page);
  await page.getByRole('button', { name: 'Sign this purchase', exact: true }).click();
  await expect(page.getByText(/The submission outcome is uncertain/)).toBeVisible();
  state.paused = true;
  await context.route('**/api/assets', route => route.fulfill({ status: 503, json: { state: 'unavailable', assets: [], unavailable: [], message: 'Controlled catalog outage.' } }));
  await page.reload();
  await expect(page.getByText('Live catalog unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText(/In-app purchases are not available/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check original receipt', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Controlled test wallet', exact: true })).toHaveCount(0);
  state.unknownLeg = -1;
  await page.getByRole('button', { name: 'Check original receipt', exact: true }).click();
  await expect(page.getByText('All reviewed contribution legs are confirmed on Solana.')).toBeVisible();
  expect(state.executions).toEqual(['leg-0']); expect(await signatures(page)).toBe(1);
});

test('cloud acknowledgement preserves a newer device reminder edited during the request', async ({ page, context }) => {
  await fixture(context);
  let release: (() => void) | undefined;
  await context.route('**/api/contribution-schedules', async route => {
    const body = route.request().postDataJSON();
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ json: { state: 'success', schedule: { id: body.id, plan_version: 1 } } });
  });
  await page.goto('/app');
  await page.getByRole('button', { name: 'Save review reminder', exact: true }).click();
  await page.getByRole('button', { name: 'Sync account', exact: true }).click();
  await expect.poll(() => typeof release).toBe('function');
  await expect(page.getByLabel('Next review', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Pause reminder', exact: true })).toBeDisabled();
  await page.evaluate(() => {
    const key = 'lotline:contribution-schedule:v2';
    const newer = JSON.parse(localStorage.getItem(key)!);
    newer.paused = true; newer.basket.budget = '250'; newer.planVersion = 2;
    localStorage.setItem(key, JSON.stringify(newer));
  });
  release!();
  await expect(page.getByText(/Newer device edits are preserved/)).toBeVisible();
  await expect(page.getByText(/Saved plan v2: 250 USDC/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume reminder', exact: true })).toBeVisible();
});

test('catalog loss blocks resume and rejects an outstanding wallet approval even after catalog recovery', async ({ page, context }) => {
  const state = await fixture(context);
  await openReview(page);
  await page.evaluate(() => { window.lotlineTestWallet.hold = true; });
  await page.getByRole('button', { name: 'Sign this purchase', exact: true }).click();
  await expect.poll(() => signatures(page)).toBe(1);
  let available = false;
  await context.route('**/api/assets', route => available ? route.fulfill({ json: { state: 'success', assets: EXAMPLE_ASSETS.slice(0, 1), unavailable: [] } }) : route.fulfill({ status: 503, json: { state: 'unavailable', assets: [], unavailable: [], message: 'Controlled catalog outage.' } }));
  await page.getByRole('button', { name: 'Refresh catalog', exact: true }).click();
  await expect(page.getByText('Live catalog unavailable', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign this purchase', exact: true })).toHaveCount(0);
  available = true;
  await page.getByRole('button', { name: 'Retry catalog', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Get estimates', exact: true })).toBeEnabled();
  await page.evaluate(() => { window.lotlineTestWallet.release?.(); });
  await expect(page.getByText(/catalog changed during approval. The signed bytes were not submitted/)).toBeVisible();
  expect(state.executions).toEqual([]);
  expect(await signatures(page)).toBe(1);
  available = false;
  await page.getByRole('button', { name: 'Refresh catalog', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume remaining', exact: true })).toBeDisabled();
  expect(state.orders).toEqual(['leg-0']);
});
