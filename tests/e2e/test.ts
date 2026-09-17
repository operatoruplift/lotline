import { test as base, expect, type Page } from '@playwright/test';

/**
 * Every route streams behind app/loading.tsx. Until React reveals the streamed segment the document
 * holds BOTH the fallback <main class="route-state"> and the real page parked in a hidden container,
 * and locators match hidden nodes — so a strict locator fired straight after goto() can resolve to two
 * elements on a slow runner (the CI-only "resolved to 2 elements" failures). goto() here settles once
 * the fallback is gone, which is the deterministic signal that the swap has happened.
 */
export const test = base.extend({
  page: async ({ page }, provide) => {
    const goto: Page['goto'] = page.goto.bind(page);
    page.goto = async (url, options) => {
      const response = await goto(url, options);
      await expect(page.locator('main.route-state')).toHaveCount(0);
      return response;
    };
    await provide(page);
  },
});

export { devices, expect, type Page } from '@playwright/test';
