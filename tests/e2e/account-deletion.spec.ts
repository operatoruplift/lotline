import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from './test';

const member = { id: 'a1180b50-b02b-4a02-a86a-2e2da5af7d00', email: 'reader@example.test' };
type Reply = { status: number; json: Record<string, unknown> };

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Every account request answers from a fixture; nothing reaches a provider.
  await page.route('**/auth/v1/**', route => route.fulfill({ status: 401, json: { code: 'bad_jwt', msg: 'Fixture session only' } }));
  await page.route('**/api/assets', route => route.fulfill({ status: 503, json: { state: 'configuration-required', assets: [], unavailable: [] } }));
  // The confirmation lives in the page; a browser confirm() would fail this test.
  page.on('dialog', dialog => { throw new Error(`Unexpected browser dialog: ${dialog.message()}`); });
});

/** A signed-in member whose deletion request answers with `reply`. Returns the methods the account route saw. */
async function signedIn(page: Page, reply: Reply) {
  let deleted = false;
  const requests: string[] = [];
  await page.route('**/api/auth/session', route => route.fulfill({ json: deleted ? { state: 'guest', user: null } : { state: 'signed-in', user: member } }));
  await page.route('**/api/plans', route => route.fulfill({ json: { state: 'success', plans: [] } }));
  await page.route('**/api/account', route => {
    requests.push(route.request().method());
    if (reply.status === 200) deleted = true;
    return route.fulfill(reply);
  });
  return requests;
}

test('a member deletes their account from the planner after an in-page confirmation', async ({ page }) => {
  const requests = await signedIn(page, { status: 200, json: { state: 'deleted' } });
  await page.goto('/app?mode=example');
  const cloud = page.getByRole('region', { name: 'Keep a plan for later' });
  await expect(cloud.getByText('Signed in as reader@example.test')).toBeVisible();

  await cloud.getByRole('button', { name: 'Delete account', exact: true }).click();
  const confirm = page.getByRole('group', { name: 'Delete your account?' });
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('cannot be undone');
  await expect(confirm).toContainText('Transactions on Solana are public and permanent');
  await confirm.getByRole('button', { name: 'Keep my account' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(cloud.getByRole('button', { name: 'Delete account', exact: true })).toBeFocused();
  expect(requests).toEqual([]);

  await cloud.getByRole('button', { name: 'Delete account', exact: true }).click();
  const accessibility = await new AxeBuilder({ page }).include('[data-delete-account]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.getByRole('group', { name: 'Delete your account?' }).getByRole('button', { name: 'Delete my account' }).click();
  await expect(cloud.getByRole('status')).toContainText('Your account and its saved data were deleted.');
  await expect(cloud.getByRole('link', { name: 'Sign in to save plans', exact: true })).toBeVisible();
  await expect(cloud.getByText('Signed in as reader@example.test')).toHaveCount(0);
  expect(requests).toEqual(['DELETE']);
});

test('a failed deletion keeps the account and says nothing was removed', async ({ page }) => {
  const requests = await signedIn(page, { status: 503, json: { state: 'unavailable', message: 'Your account could not be deleted right now. Nothing was removed. Please try again.' } });
  await page.goto('/app?mode=example');
  const cloud = page.getByRole('region', { name: 'Keep a plan for later' });
  await cloud.getByRole('button', { name: 'Delete account', exact: true }).click();
  const confirm = page.getByRole('group', { name: 'Delete your account?' });
  await confirm.getByRole('button', { name: 'Delete my account' }).click();
  await expect(confirm.getByRole('alert')).toContainText('Nothing was removed.');
  await expect(cloud.getByText('Signed in as reader@example.test')).toBeVisible();
  await expect(confirm.getByRole('button', { name: 'Delete my account' })).toBeEnabled();
  expect(requests).toEqual(['DELETE']);
});

test('the account page shows a signed-in member their account, with sign out and delete', async ({ page }) => {
  const requests = await signedIn(page, { status: 200, json: { state: 'deleted' } });
  await page.goto('/sign-in');
  const card = page.locator('[data-glass-card]');
  await expect(card.getByRole('heading', { level: 1, name: 'You’re signed in.' })).toBeVisible();
  await expect(card.getByText('Signed in as reader@example.test')).toBeVisible();
  await expect(card.getByRole('link', { name: 'Open your planner' })).toHaveAttribute('href', '/app');
  await expect(card.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await expect(card.getByLabel('Email address')).toHaveCount(0);

  await card.getByRole('button', { name: 'Delete account', exact: true }).click();
  await card.getByRole('group', { name: 'Delete your account?' }).getByRole('button', { name: 'Delete my account' }).click();
  await expect(card.getByRole('status')).toContainText('Your account and its saved data were deleted.');
  await expect(card.getByRole('heading', { level: 1, name: 'Sign in to Lotline' })).toBeVisible();
  await expect(card.getByLabel('Email address')).toBeVisible();
  expect(requests).toEqual(['DELETE']);
});
