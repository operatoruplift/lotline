import { expect, test } from './test';

// The main suite runs with every operator flag unset: the judged interface must not change.
test('markets, the add link and the phone tab bar stay dark without the operator flag', async ({ page }) => {
  const response = await page.request.get('/markets');
  expect(response.status()).toBe(404);
  expect((await page.request.get('/api/markets')).status()).toBe(404);
  expect((await page.request.get('/plans')).status()).toBe(404);
  expect((await page.request.get('/plans/6a1f8c4e-2b7d-4c1e-9f0a-3d5b7e9c1a2b')).status()).toBe(404);
  expect((await page.request.get('/api/gallery')).status()).toBe(404);
  expect((await page.request.get('/portfolio')).status()).toBe(404);
  await page.route('**/api/assets', route => route.fulfill({ status: 503, json: { state: 'configuration-required', assets: [], unavailable: [] } }));
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/app?add=XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp');
  await expect(page.getByRole('navigation', { name: 'Planning sections' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Markets' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Community' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Portfolio' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Browse all markets/ })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('wallet sign-in stays dark without its operator flag', async ({ page }) => {
  await page.route('**/auth/v1/**', route => route.fulfill({ status: 401, json: { code: 'bad_jwt', msg: 'Fixture session only' } }));
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { name: /Solana wallet/ })).toHaveCount(0);
  await expect(page.getByText('or sign in with email', { exact: true })).toHaveCount(0);
  await expect(page.getByText('An account saves only the amounts and splits you choose to upload. It never connects to or controls your wallet.', { exact: true })).toBeVisible();
  await page.goto('/sign-up');
  await expect(page.getByRole('heading', { name: /Solana wallet/ })).toHaveCount(0);
  await expect(page.getByText('Signup and recovery emails aren’t available yet.', { exact: true })).toBeVisible();
});
