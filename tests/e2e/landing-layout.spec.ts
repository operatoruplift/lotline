import { expect, test } from '@playwright/test';

test('contribution preview keeps its labels, values, and badges separate at every layout', async ({ page }) => {
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await expect(page.getByText('Your next contribution', { exact: true })).toBeVisible();
    const layout = await page.evaluate(() => {
      const bounds = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const title = bounds('.preview-heading > span:first-child');
      const example = bounds('.example-pill');
      const card = bounds('.product-preview');
      const badges = [...document.querySelectorAll('.preview-float-chip')].map(node => node.getBoundingClientRect());
      const rows = [...document.querySelectorAll('.preview-row')].map(row => {
        const columns = [...row.children].map(column => column.getBoundingClientRect());
        return columns.every((column, index) => index === 0 || column.left >= columns[index - 1].right - 0.5);
      });
      const links = [...document.querySelectorAll('.site-header nav > *')].map(node => {
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        const lineTops: number[] = [];
        while (walker.nextNode()) {
          if (!walker.currentNode.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(walker.currentNode);
          lineTops.push(...[...range.getClientRects()].filter(rect => rect.width > 1).map(rect => rect.top));
        }
        return lineTops.length === 0 || Math.max(...lineTops) - Math.min(...lineTops) < 3;
      });
      return {
        noOverflow: document.documentElement.scrollWidth <= innerWidth,
        separateHeading: title.right <= example.left && title.bottom <= card.bottom,
        badgesOutsideCard: badges.every(badge => badge.top >= card.bottom + 8),
        separateBadges: badges.every((badge, index) => index === 0 || badge.left >= badges[index - 1].right || badge.top >= badges[index - 1].bottom),
        separateRowColumns: rows.every(Boolean),
        singleLineNavigation: links.every(Boolean),
      };
    });
    expect(layout, `Preview layout at ${width}px`).toEqual({
      noOverflow: true,
      separateHeading: true,
      badgesOutsideCard: true,
      separateBadges: true,
      separateRowColumns: true,
      singleLineNavigation: true,
    });
  }
});
