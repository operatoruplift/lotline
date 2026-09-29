import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '../e2e/test';
import { SIGN_IN_STATEMENT } from '../../lib/client/wallet-sign-in';

const address = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const userId = '5b3e2c0a-7d4f-4f61-9a55-0c8e6d1f2a90';
type Behaviour = 'sign-in' | 'sign-message' | 'reject' | 'hang';

function fixtureSession() {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, aud: 'authenticated', role: 'authenticated', exp: now + 3600, iat: now })}.${Buffer.from('unsigned-test-fixture').toString('base64url')}`,
    refresh_token: 'not-a-real-refresh-token', token_type: 'bearer', expires_in: 3600,
    user: { id: userId, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'web3', providers: ['web3'] }, user_metadata: {}, identities: [{ id: `web3:solana:${address}`, provider: 'web3', identity_data: { sub: `web3:solana:${address}` } }], created_at: '2026-01-01T00:00:00Z' },
  };
}

/** Registers controlled Wallet Standard wallets. Signatures are fixed bytes: Supabase Auth is a local fixture here. */
async function wallets(page: Page, list: { name: string; behaviour: Behaviour }[]) {
  await page.addInitScript(({ list, address }) => {
    const icon = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><rect width="28" height="28" rx="7" fill="#285238"/></svg>')}`;
    const signature = new Uint8Array(64).fill(7);
    const account = { address, publicKey: new Uint8Array(32), chains: ['solana:mainnet'], features: ['solana:signIn', 'solana:signMessage'] };
    const signed: string[] = [];
    Object.assign(window, { lotlineSigned: signed });
    // A real wallet writes the text itself; this one puts URI before Version, as the Wallet Standard helper does.
    const text = (input: Record<string, string>) => [`${input.domain} wants you to sign in with your Solana account:`, address, '', input.statement, '', `URI: ${input.uri}`, `Version: ${input.version}`, `Issued At: ${input.issuedAt}`].join('\n');
    for (const { name, behaviour } of list) {
      const features: Record<string, unknown> = {
        'standard:connect': { version: '1.0.0', connect: async () => ({ accounts: [account] }) },
        'standard:events': { version: '1.0.0', on: () => () => undefined },
      };
      if (behaviour === 'sign-message') features['solana:signMessage'] = { version: '1.0.0', signMessage: async (...inputs: { message: Uint8Array }[]) => inputs.map(input => { signed.push(new TextDecoder().decode(input.message)); return { signedMessage: input.message, signature }; }) };
      else features['solana:signIn'] = { version: '1.0.0', signIn: async (...inputs: Record<string, string>[]) => {
        if (behaviour === 'reject') throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
        if (behaviour === 'hang') return new Promise(() => undefined);
        return inputs.map(input => { signed.push(text(input)); return { account, signedMessage: new TextEncoder().encode(text(input)), signature }; });
      } };
      const wallet = { version: '1.0.0', name, icon, chains: ['solana:mainnet'], accounts: [], features };
      window.addEventListener('wallet-standard:app-ready', event => (event as CustomEvent<{ register: (wallet: unknown) => void }>).detail.register(wallet));
    }
  }, { list, address });
}

/** Every account request answers from a fixture; the web3 grant is recorded. */
async function auth(page: Page, grant: (body: Record<string, unknown>) => { status: number; json: unknown; headers?: Record<string, string> }) {
  const grants: Record<string, unknown>[] = [];
  await page.route('**/auth/v1/**', route => route.fulfill({ status: 401, json: { code: 'bad_jwt', msg: 'Fixture session only' } }));
  await page.route('**/auth/v1/token?grant_type=web3', route => { const body = route.request().postDataJSON() as Record<string, unknown>; grants.push(body); return route.fulfill(grant(body)); });
  await page.route('**/api/auth/session', route => route.fulfill({ json: { state: 'signed-in', user: { id: userId, wallet: address } } }));
  await page.route('**/api/plans', route => route.fulfill({ json: { plans: [] } }));
  await page.route('**/api/gallery/mine', route => route.fulfill({ json: { shared: [] } }));
  await page.route('**/api/assets', route => route.fulfill({ status: 503, json: { state: 'configuration-required', assets: [], unavailable: [] } }));
  return grants;
}

test('a wallet signs one message, Supabase Auth gets exactly that text, and the planner shows the wallet', async ({ page, context, baseURL }) => {
  await wallets(page, [{ name: 'Grove Wallet', behaviour: 'sign-in' }]);
  const grants = await auth(page, () => ({ status: 200, json: fixtureSession() }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/sign-in');
  // The header follows the operator flags here too, so the way back to Portfolio stays one tap away.
  const header = page.getByRole('navigation', { name: 'Main navigation' });
  for (const name of ['Portfolio', 'Markets', 'Community']) await expect(header.getByRole('link', { name, exact: true })).toBeVisible();
  const section = page.getByRole('region', { name: 'Sign in with a Solana wallet' });
  await expect(section.getByRole('list', { name: 'Wallets in this browser' }).getByRole('button')).toHaveCount(1);
  await expect(page.getByText('or sign in with email', { exact: true })).toBeVisible();
  await expect(page.getByText(/Wallet sign-in reads your address and one signed message/)).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations.map(violation => violation.id)).toEqual([]);

  await section.getByRole('button', { name: 'Sign in with Grove Wallet' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText('Signed in as wallet 7xKX…gAsU')).toBeVisible();
  const signed = await page.evaluate(() => (window as unknown as { lotlineSigned: string[] }).lotlineSigned);
  expect(grants).toHaveLength(1);
  expect(grants[0].chain).toBe('solana');
  // The wallet's own text goes to Supabase unchanged, bound to this page.
  expect(grants[0].message).toBe(signed[0]);
  const host = new URL(baseURL!).host;
  expect(String(grants[0].message).split('\n').slice(0, 7)).toEqual([`${host} wants you to sign in with your Solana account:`, address, '', SIGN_IN_STATEMENT, '', `URI: ${baseURL}/sign-in`, 'Version: 1']);
  expect(String(grants[0].signature)).toMatch(/^[A-Za-z0-9_-]{86}$/);
  expect((await context.cookies()).some(cookie => cookie.name.startsWith('sb-auth-fixture-auth-token'))).toBe(true);
});

test('a wallet that can only sign messages connects and signs the Lotline text', async ({ page }) => {
  await wallets(page, [{ name: 'Message Wallet', behaviour: 'sign-message' }]);
  const grants = await auth(page, () => ({ status: 200, json: fixtureSession() }));
  await page.goto('/sign-up');
  const section = page.getByRole('region', { name: 'Create an account with a Solana wallet' });
  await expect(page.getByText('Email sign-up opens once delivery is set up.', { exact: false })).toBeVisible();
  await expect(page.getByText('Signup and recovery emails aren’t available yet.')).toHaveCount(0);
  await section.getByRole('button', { name: 'Continue with Message Wallet' }).click();
  await expect(page).toHaveURL(/\/app$/);
  const signed = await page.evaluate(() => (window as unknown as { lotlineSigned: string[] }).lotlineSigned);
  expect(grants.map(grant => grant.message)).toEqual(signed);
  expect(signed[0]).toContain(`\n${SIGN_IN_STATEMENT}\n\nVersion: 1\nURI: `);
});

test('declining, a switched-off provider and a prompt left open all leave the page usable', async ({ page }) => {
  await wallets(page, [{ name: 'Declining Wallet', behaviour: 'reject' }, { name: 'Idle Wallet', behaviour: 'hang' }, { name: 'Grove Wallet', behaviour: 'sign-in' }]);
  let disabled = true;
  // As Supabase Auth answers: its client reads `code` only from a response that states its API version.
  const switchedOff = { status: 422, headers: { 'x-supabase-api-version': '2024-01-01', 'access-control-expose-headers': 'X-Supabase-Api-Version' }, json: { code: 'web3_provider_disabled', message: 'Solana Web3 provider is disabled' } };
  const grants = await auth(page, () => disabled ? switchedOff : { status: 200, json: fixtureSession() });
  await page.goto('/sign-in');
  const section = page.getByRole('region', { name: 'Sign in with a Solana wallet' });

  await section.getByRole('button', { name: 'Sign in with Declining Wallet' }).click();
  await expect(section.getByRole('alert')).toHaveText('No signature was made, so nothing changed. Try again when you’re ready.');
  expect(grants).toHaveLength(0);

  await section.getByRole('button', { name: 'Sign in with Grove Wallet' }).click();
  await expect(section.getByRole('alert')).toHaveText(/isn’t switched on for this deployment yet/);
  expect(grants).toHaveLength(1);

  // A prompt nobody answers must not hold up the next sign-in.
  await section.getByRole('button', { name: 'Sign in with Idle Wallet' }).click();
  await expect(section.getByRole('status')).toContainText('Check Idle Wallet to sign the message.');
  await expect(section.getByRole('button', { name: 'Sign in with Grove Wallet' })).toBeDisabled();
  await section.getByRole('button', { name: 'Cancel', exact: true }).click();
  disabled = false;
  await section.getByRole('button', { name: 'Sign in with Grove Wallet' }).click();
  await expect(page).toHaveURL(/\/app$/);
  expect(grants).toHaveLength(2);
});

test('without a wallet the page says how to get one, and email sign-in is unchanged', async ({ page }) => {
  await auth(page, () => ({ status: 500, json: {} }));
  await page.goto('/sign-in');
  await expect(page.getByText(/No Solana wallet found in this browser/)).toBeVisible();
  await expect(page.getByLabel('Email address')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
});
