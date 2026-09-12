import { expect, test } from '@playwright/test';

test('three contribution previews keep labels, amounts and navigation separate at every layout', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Your next contribution', exact: true })).toBeVisible();
    const layout = await page.evaluate(() => {
      const card = document.querySelector('[data-preview="contribution"]')!;
      const title = card.querySelector('h2')!.getBoundingClientRect();
      const example = card.querySelector('h2')!.nextElementSibling!.getBoundingClientRect();
      const cards = [...document.querySelectorAll('[data-preview]')].map(node => node.getBoundingClientRect());
      const rows = [...document.querySelectorAll('[data-preview-row]')].map(row => {
        const columns = [...row.children].map(column => column.getBoundingClientRect());
        return columns.every((column, index) => index === 0 || column.left >= columns[index - 1].right - .5);
      });
      const links = [...document.querySelectorAll('.site-header nav > *')].map(node => {
        const range = document.createRange(); range.selectNodeContents(node);
        const rects = [...range.getClientRects()].filter(rect => rect.width > 1 && rect.height > 6);
        return rects.length === 0 || Math.max(...rects.map(rect => rect.top)) - Math.min(...rects.map(rect => rect.top)) < 6;
      });
      return { noOverflow: document.documentElement.scrollWidth <= innerWidth, separateHeading: title.right <= example.left,
        separateRows: rows.every(Boolean), singleLineNavigation: links.every(Boolean), threeCards: cards.length === 3,
        desktopBottomsAligned: innerWidth < 801 || Math.max(...cards.map(card => card.bottom)) - Math.min(...cards.map(card => card.bottom)) < 1 };
    });
    expect(layout, `Layout at ${width}px`).toEqual({ noOverflow: true, separateHeading: true, separateRows: true, singleLineNavigation: true, threeCards: true, desktopBottomsAligned: true });
    await expect(page.locator('[data-preview-row]').nth(0)).toContainText('500.00');
    await expect(page.locator('[data-preview-row]').nth(1)).toContainText('300.00');
    await expect(page.locator('[data-preview-row]').nth(2)).toContainText('200.00');
  }
});

test('Veloce bottoms align and landscape footer moves below copy at tablet width', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/');
  const cards = await page.locator('[data-feature]').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { bottom: r.bottom, height: r.height, radius: getComputedStyle(node).borderRadius }; }));
  expect(cards.map(card => card.height)).toEqual([450, 350, 450]);
  expect(new Set(cards.map(card => card.bottom)).size).toBe(1);
  expect(cards.every(card => card.radius === '40px')).toBe(true);
  await page.setViewportSize({ width: 1100, height: 800 });
  const footer = await page.locator('footer').evaluate(node => {
    const copy = node.children[0].getBoundingClientRect(), media = node.children[1].getBoundingClientRect();
    return { below: media.top >= copy.bottom, aspect: media.width / media.height };
  });
  expect(footer.below).toBe(true); expect(footer.aspect).toBeCloseTo(16 / 9, 2);
  await expect(page.locator('#install-lotline')).toHaveCount(1);
});
