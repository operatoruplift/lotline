import { test as base, expect, type Page } from '@playwright/test';

/**
 * Every route streams behind app/loading.tsx. Until React reveals the streamed segment the document
 * holds BOTH the fallback <main class="route-state"> and the real page parked in a hidden container,
 * and locators match hidden nodes. The hosted stream can also briefly hold a visible real page AND
 * a parked copy after the fallback disappears. Wait for one visible main in the complete DOM before
 * using strict page locators; never filter away duplicates that might be a real rendering defect.
 */
export const test = base.extend({
  page: async ({ page }, provide) => {
    const goto: Page['goto'] = page.goto.bind(page);
    page.goto = async (url, options) => {
      const response = await goto(url, options);
      await expect(page.locator('main.route-state')).toHaveCount(0);
      await expect(page.locator('main#main')).toHaveCount(1);
      await expect(page.locator('main#main')).toBeVisible();
      return response;
    };
    await provide(page);
  },
});

export { devices, expect, type Page } from '@playwright/test';
