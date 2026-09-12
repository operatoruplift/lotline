import { expect, test } from '@playwright/test';

const tokenUrl = '**/auth/v1/token?grant_type=password';
const userId = 'a1180b50-b02b-4a02-a86a-2e2da5af7d00';
function fixtureSession(id = userId, email = 'qa@example.test') {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, aud: 'authenticated', role: 'authenticated', exp: now + 3600, iat: now })}.${Buffer.from('unsigned-test-fixture').toString('base64url')}`,
    refresh_token: 'not-a-real-refresh-token', token_type: 'bearer', expires_in: 3600,
    user: { id, aud: 'authenticated', role: 'authenticated', email, app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  };
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/auth/session', route => route.fulfill({ status: 401, json: { state: 'signed-out' } }));
  await page.route('**/api/assets', route => route.fulfill({ status: 503, json: { state: 'configuration-required', assets: [], unavailable: [] } }));
  await page.route('**/api/plans', route => route.fulfill({ json: { plans: [] } }));
  // All account responses are local fixtures. Never send credentials to a provider.
  await page.route('**/auth/v1/**', route => route.fulfill({ status: 401, json: { code: 'bad_jwt', msg: 'Fixture session only' } }));
});

test('a delayed sign-in cannot replace the guest route or save a session after leaving the form', async ({ page, context }) => {
  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const requested = new Promise<void>(resolve => { started = resolve; });
  await page.route(tokenUrl, async route => { started(); await held; await route.fulfill({ json: fixtureSession() }); });
  try {
    await page.goto('/sign-in');
    await page.getByLabel('Email address').fill('qa@example.test');
    await page.getByLabel('Password', { exact: true }).fill('only-a-local-test-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await requested;
    const cancelled = page.waitForEvent('requestfailed', request => request.url().includes('/auth/v1/token?grant_type=password'));
    await page.getByRole('link', { name: 'Continue without an account', exact: true }).click();
    await expect(page).toHaveURL(/\/app\?mode=example$/);
    await cancelled;
    release();
    // Give the SDK's session notification and the old continuation time to settle.
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/app\?mode=example$/);
    await expect(page.getByRole('button', { name: 'Example', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect((await context.cookies()).filter(cookie => /-auth-token(?:\.\d+)?$/.test(cookie.name))).toEqual([]);
  } finally { release(); }
});

test('an abandoned A response cannot overwrite a newer B session in browser cookies or account UI', async ({ page, context }) => {
  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const requested = new Promise<void>(resolve => { started = resolve; });
  const accountB = fixtureSession('b1180b50-b02b-4a02-a86a-2e2da5af7d00', 'account-b@example.test');
  const authCookies = async () => (await context.cookies()).filter(cookie => /-auth-token(?:\.\d+)?$/.test(cookie.name)).sort((a, b) => a.name.localeCompare(b.name));
  await page.route('**/api/auth/session', async route => {
    const cookies = await authCookies();
    if (!cookies.length) { await route.fulfill({ status: 401, json: { state: 'signed-out' } }); return; }
    const encoded = cookies.map(cookie => cookie.value).join('').replace(/^base64-/, '');
    const saved = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    await route.fulfill({ json: { state: 'signed-in', user: saved.user } });
  });
  await page.route(tokenUrl, async route => {
    if (route.request().postDataJSON().email === 'qa@example.test') { started(); await held; await route.fulfill({ json: fixtureSession() }); }
    else await route.fulfill({ json: accountB });
  });
  await page.route('**/auth/v1/logout?scope=local', route => route.fulfill({ status: 204 }));
  try {
    await page.goto('/sign-in');
    await page.getByLabel('Email address').fill('qa@example.test');
    await page.getByLabel('Password', { exact: true }).fill('only-a-local-test-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await requested;
    const cancelled = page.waitForEvent('requestfailed', request => request.url().includes('/auth/v1/token?grant_type=password'));
    await page.getByRole('link', { name: 'Continue without an account', exact: true }).click();
    await cancelled;
    await page.getByRole('link', { name: 'Sign in to save plans', exact: true }).click();
    await page.getByLabel('Email address').fill('account-b@example.test');
    await page.getByLabel('Password', { exact: true }).fill('only-a-local-test-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Signed in as account-b@example.test', { exact: true })).toBeVisible();
    const saved = await authCookies();
    expect(saved.length).toBeGreaterThan(0);
    release();
    await page.waitForTimeout(500);
    expect(await authCookies()).toEqual(saved);
    await page.getByRole('button', { name: 'Refresh saved plans', exact: true }).click();
    await expect(page.getByText('Signed in as account-b@example.test', { exact: true })).toBeVisible();
    await expect(page.getByText('Signed in as qa@example.test', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Sign in to save plans', exact: true })).toBeVisible();
    expect(await authCookies()).toEqual([]);
  } finally { release(); }
});

test('back-to-back submits issue one request and recover after an error', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let attempts = 0;
  await page.route(tokenUrl, async route => { attempts += 1; await held; await route.fulfill({ status: 400, headers: { 'x-supabase-api-version': '2024-01-01', 'access-control-expose-headers': 'x-supabase-api-version' }, json: { code: 'invalid_credentials', msg: 'Fixture rejection' } }); });
  try {
    await page.goto('/sign-in');
    await page.getByLabel('Email address').fill('qa@example.test');
    await page.getByLabel('Password', { exact: true }).fill('only-a-local-test-password');
    await page.locator('[data-glass-card] form').evaluate(form => {
      (form as HTMLFormElement).requestSubmit();
      (form as HTMLFormElement).requestSubmit();
    });
    await expect.poll(() => attempts).toBeGreaterThan(0);
    release();
    await expect(page.locator('[data-glass-card]').getByRole('alert')).toContainText('email or password didn’t match');
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
    expect(attempts).toBe(1);
  } finally { release(); }
});
