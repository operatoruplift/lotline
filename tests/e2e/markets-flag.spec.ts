import { expect, test } from './test';

// The main suite runs with LOTLINE_MARKETS_ENABLED unset: the judged interface must not change.
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
