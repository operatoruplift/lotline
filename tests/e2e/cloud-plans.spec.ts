import { expect, test } from '@playwright/test';

test('account changes clear the previous owner’s plans before a new plan request completes', async ({ page }) => {
  let account = 'first';
  let releasePlans: (() => void) | undefined;
  const heldPlans = new Promise<void>(resolve => { releasePlans = resolve; });
  await page.route('**/api/auth/session', route => route.fulfill({ json: { state: 'signed-in', user: { id: account, email: `${account}@example.test` } } }));
  await page.route('**/api/plans', async route => {
    if (account === 'second') {
      await heldPlans;
      return route.fulfill({ status: 503, json: { state: 'unavailable' } });
    }
    return route.fulfill({ json: { state: 'success', plans: [{
      id: 'ccf2689b-66a7-45c0-8d7f-ebdf84c7e2e7', name: 'Private first-account split', budget_raw: '10000001',
      allocations: [{ mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', bps: '10000' }], created_at: '2026-09-11T16:00:00Z',
    }] } });
  });
  try {
    await page.goto('/app?mode=example');
    const cloud = page.getByRole('region', { name: 'Keep a plan for later' });
    await expect(cloud.getByText('Private first-account split', { exact: true })).toBeVisible();
    await cloud.getByLabel('Plan name', { exact: true }).fill('First account’s unsaved name');
    account = 'second';
    await cloud.getByRole('button', { name: 'Refresh saved plans', exact: true }).click();
    await expect(cloud.getByText('Signed in as second@example.test')).toBeVisible();
    await expect(cloud.getByText('Private first-account split', { exact: true })).toHaveCount(0);
    await expect(cloud.getByLabel('Plan name', { exact: true })).toHaveValue('My contribution');
    releasePlans!();
    await expect(cloud.getByRole('alert')).toContainText('Your cloud plans could not be loaded');
    await expect(cloud.getByText('Private first-account split', { exact: true })).toHaveCount(0);
    await expect(cloud.getByRole('button', { name: 'Load Private first-account split' })).toHaveCount(0);
    await expect(cloud.getByRole('button', { name: 'Save this plan', exact: true })).toBeEnabled();
    await expect(cloud.getByRole('button', { name: 'Refresh saved plans', exact: true })).toBeEnabled();
  } finally { releasePlans!(); }
});

test('a held plan refresh blocks mutations, then a saved plan survives the next refresh', async ({ page }) => {
  const existing = {
    id: 'ccf2689b-66a7-45c0-8d7f-ebdf84c7e2e7', name: 'Existing split', budget_raw: '10000001',
    allocations: [{ mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', bps: '10000' }], created_at: '2026-09-11T16:00:00Z',
  };
  const savedPlans = [existing];
  let reads = 0;
  let writes = 0;
  let releasePlans: (() => void) | undefined;
  let observedRefresh: (() => void) | undefined;
  const heldPlans = new Promise<void>(resolve => { releasePlans = resolve; });
  const refreshStarted = new Promise<void>(resolve => { observedRefresh = resolve; });
  await page.route('**/api/auth/session', route => route.fulfill({ json: { state: 'signed-in', user: { id: 'same-owner', email: 'owner@example.test' } } }));
  await page.route('**/api/plans', async route => {
    if (route.request().method() === 'POST') {
      writes += 1;
      const saved = { ...route.request().postDataJSON(), id: 'ee81e8d9-ce56-4907-b03b-caa60b6e1663', created_at: '2026-09-12T01:00:00Z' };
      savedPlans.unshift(saved);
      return route.fulfill({ status: 201, json: { state: 'success', plan: saved } });
    }
    reads += 1;
    // Hold an old snapshot: accepting mutations now could overwrite their new list.
    const snapshot = [...savedPlans];
    if (reads === 2) { observedRefresh!(); await heldPlans; }
    return route.fulfill({ json: { state: 'success', plans: snapshot } });
  });
  try {
    await page.goto('/app?mode=example');
    const cloud = page.getByRole('region', { name: 'Keep a plan for later' });
    const save = cloud.getByRole('button', { name: 'Save this plan', exact: true });
    const refresh = cloud.getByRole('button', { name: 'Refresh saved plans', exact: true });
    await expect(cloud.getByText('Existing split', { exact: true })).toBeVisible();
    await expect(save).toBeEnabled();
    await refresh.click();
    await refreshStarted;
    for (const control of [save, refresh, cloud.getByRole('button', { name: 'Sign out', exact: true }), cloud.getByRole('button', { name: 'Load Existing split' }), cloud.getByRole('button', { name: 'Delete Existing split' })]) await expect(control).toBeDisabled();
    // Enter/programmatic submit must obey the same guard as the disabled button.
    await cloud.locator('form').dispatchEvent('submit');
    expect(writes).toBe(0);
    releasePlans!();
    await expect(save).toBeEnabled();
    await expect(refresh).toBeEnabled();
    await cloud.getByLabel('Plan name', { exact: true }).fill('Saved after refresh');
    await save.click();
    await expect(cloud.getByText('Saved after refresh', { exact: true })).toBeVisible();
    expect(writes).toBe(1);
    await refresh.click();
    await expect(refresh).toBeEnabled();
    await expect(cloud.getByText('Saved after refresh', { exact: true })).toBeVisible();
    await expect(cloud.getByRole('button', { name: 'Load Saved after refresh' })).toBeEnabled();
    expect(reads).toBe(3);
  } finally { releasePlans!(); }
});

for (const action of ['refresh', 'save', 'delete'] as const) {
  test(`an expired session during ${action} clears private plans and preserves the local draft`, async ({ page }) => {
    const privateName = 'Private plan before expiry';
    let planReads = 0;
    await page.route('**/api/auth/session', route => route.fulfill({ json: { state: 'signed-in', user: { id: 'expiring-owner', email: 'owner@example.test' } } }));
    await page.route(/\/api\/plans(?:\?|$)/, route => {
      if (route.request().method() === 'GET' && ++planReads === 1) {
        return route.fulfill({ json: { state: 'success', plans: [{
          id: 'ccf2689b-66a7-45c0-8d7f-ebdf84c7e2e7', name: privateName, budget_raw: '10000001',
          allocations: [{ mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', bps: '10000' }], created_at: '2026-09-11T16:00:00Z',
        }] } });
      }
      // An authentication failure remains authoritative even without a JSON body.
      return route.fulfill({ status: 401, contentType: 'text/plain', body: 'Session expired' });
    });
    await page.goto('/app?mode=example');
    const cloud = page.getByRole('region', { name: 'Keep a plan for later' });
    await expect(cloud.getByText(privateName, { exact: true })).toBeVisible();
    await page.getByLabel('USDC budget').fill('125.000001');
    await cloud.getByLabel('Plan name', { exact: true }).fill('Unsaved account name');
    if (action === 'refresh') await cloud.getByRole('button', { name: 'Refresh saved plans', exact: true }).click();
    if (action === 'save') await cloud.getByRole('button', { name: 'Save this plan', exact: true }).click();
    if (action === 'delete') await cloud.getByRole('button', { name: `Delete ${privateName}`, exact: true }).click();
    await expect(cloud.getByRole('alert')).toContainText('Your account session ended.');
    await expect(cloud.getByRole('link', { name: 'Sign in to save plans', exact: true })).toBeVisible();
    await expect(cloud.getByText(privateName, { exact: true })).toHaveCount(0);
    await expect(cloud.getByText('Signed in as owner@example.test')).toHaveCount(0);
    await expect(cloud.getByLabel('Plan name', { exact: true })).toHaveCount(0);
    await expect(cloud.getByRole('button', { name: /^(Load|Delete|Save this plan|Sign out)/ })).toHaveCount(0);
    await expect(page.getByLabel('USDC budget')).toHaveValue('125.000001');
    await expect(page.getByRole('button', { name: 'Get estimates', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Get estimates', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Download CSV', exact: true })).toBeEnabled();
  });
}
