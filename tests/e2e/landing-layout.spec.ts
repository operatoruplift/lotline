import { expect, test } from './test';

test('three contribution previews keep labels, amounts and navigation separate at every layout', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    // Accessible landmarks exclude Next's hidden streamed HTML staging copies.
    // Exact counts still reject duplicate rendered landmarks and cards.
    const main = page.getByRole('main');
    const banner = page.getByRole('banner');
    await expect(main).toHaveCount(1);
    await expect(banner).toHaveCount(1);
    await expect(main.locator('[data-preview]')).toHaveCount(3);
    const previewRows = main.locator('[data-preview-row]');
    await expect(previewRows).toHaveCount(3);
    await expect(page.getByRole('heading', { name: 'Your next contribution', exact: true })).toBeVisible();
    const layout = await main.evaluate(root => {
      const card = root.querySelector('[data-preview="contribution"]')!;
      const title = card.querySelector('h2')!.getBoundingClientRect();
      const example = card.querySelector('h2')!.nextElementSibling!.getBoundingClientRect();
      const cards = [...root.querySelectorAll('[data-preview]')].map(node => node.getBoundingClientRect());
      const rows = [...root.querySelectorAll('[data-preview-row]')].map(row => {
        const columns = [...row.children].map(column => column.getBoundingClientRect());
        return columns.every((column, index) => index === 0 || column.left >= columns[index - 1].right - .5);
      });
      return { noOverflow: document.documentElement.scrollWidth <= innerWidth, separateHeading: title.right <= example.left,
        separateRows: rows.every(Boolean), threeCards: cards.length === 3,
        desktopBottomsAligned: innerWidth < 801 || Math.max(...cards.map(card => card.bottom)) - Math.min(...cards.map(card => card.bottom)) < 1 };
    });
    const singleLineNavigation = await banner.evaluate(root => {
      const links = [...root.querySelectorAll('nav > *')].map(node => {
        const range = document.createRange(); range.selectNodeContents(node);
        const rects = [...range.getClientRects()].filter(rect => rect.width > 1 && rect.height > 6);
        return rects.length === 0 || Math.max(...rects.map(rect => rect.top)) - Math.min(...rects.map(rect => rect.top)) < 6;
      });
      return links.length > 0 && links.every(Boolean);
    });
    expect({ ...layout, singleLineNavigation }, `Layout at ${width}px`).toEqual({ noOverflow: true, separateHeading: true, separateRows: true, singleLineNavigation: true, threeCards: true, desktopBottomsAligned: true });
    await expect(previewRows.nth(0)).toContainText('500.00');
    await expect(previewRows.nth(1)).toContainText('300.00');
    await expect(previewRows.nth(2)).toContainText('200.00');
  }
});

test('Veloce bottoms align and landscape footer moves below copy at tablet width', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/');
  const main = page.getByRole('main');
  await expect(main).toHaveCount(1);
  const features = main.locator('[data-feature]');
  await expect(features).toHaveCount(3);
  const cards = await features.evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { bottom: r.bottom, height: r.height, radius: getComputedStyle(node).borderRadius }; }));
  expect(cards.map(card => card.height)).toEqual([450, 350, 450]);
  expect(new Set(cards.map(card => card.bottom)).size).toBe(1);
  expect(cards.every(card => card.radius === '40px')).toBe(true);
  await page.setViewportSize({ width: 1100, height: 800 });
  const footerLandmark = page.getByRole('contentinfo');
  await expect(footerLandmark).toHaveCount(1);
  const footer = await footerLandmark.evaluate(node => {
    const copy = node.children[0].getBoundingClientRect(), media = node.children[1].getBoundingClientRect();
    return { below: media.top >= copy.bottom, aspect: media.width / media.height };
  });
  expect(footer.below).toBe(true); expect(footer.aspect).toBeCloseTo(16 / 9, 2);
  await expect(page.getByRole('complementary', { name: 'Install Lotline', exact: true })).toHaveCount(1);
  await expect(page.locator('#install-lotline:visible')).toHaveCount(1);
});
