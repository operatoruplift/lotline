import { expect, test } from './test';

test('execution reports its disabled server boundary and Example never signs', async ({ page, request }) => {
  const config = await request.get('/api/execution/config');
  // The resource is always retrievable; "disabled" is its content, not a 5xx.
  expect(config.status()).toBe(200);
  const body = await config.json();
  expect(body.state).toBe('configuration-required');
  expect(body.enabled).toBe(false);
  expect(body.reasons).toBeUndefined();
  expect(body.validatorVersion).toBe('jupiter-route-v2-raydium-clmm-v1');
  expect(body.message).toContain('In-app purchases are not available');

  await page.goto('/app?mode=example');
  await expect(page.getByRole('heading', { name: 'Practice mode stays read-only.' })).toBeVisible();
  await expect(page.getByText('Example plans never connect a wallet, request a signature, or submit a purchase.')).toBeVisible();
  await expect(page.getByText('No funds move in Example mode.')).toBeVisible();
  await expect(page.getByRole('button', { name: /sign this purchase/i })).toHaveCount(0);
});
