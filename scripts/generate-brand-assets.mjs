import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// Shared with the inline React mark so every export uses the same geometry.
const mark = JSON.parse(await readFile(new URL('../lib/brand/mark.json', import.meta.url), 'utf8'));
const path = (color) => `<path d="${mark.path}" fill="none" stroke="${color}" stroke-width="${mark.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
const svg = (viewBox, title, contents) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><title>${title}</title>${contents}</svg>\n`;
const save = (name, data) => writeFile(new URL(`../public/${name}`, import.meta.url), data);

await save('brand/mark.svg', svg(mark.viewBox, 'Lotline', path(mark.forest)));
await save('brand/monochrome.svg', svg(mark.viewBox, 'Lotline monochrome', path('#18211D')));
await save('brand/mark-light.svg', svg(mark.viewBox, 'Lotline reversed', path(mark.paper)));
await save('brand/favicon.svg', svg(mark.viewBox, 'Lotline', `<rect width="32" height="32" rx="7" fill="${mark.forest}"/><g transform="translate(4 4) scale(.75)">${path(mark.paper)}</g>`));
await save('brand/wordmark.svg', svg('0 0 148 36', 'Lotline', `<g transform="translate(0 2)">${path(mark.forest)}</g><text x="41" y="27" fill="${mark.forest}" font-family="Arial,Helvetica,sans-serif" font-size="27" font-weight="700" letter-spacing="-1.3">Lotline.</text>`));

// The full-bleed background is masked by the OS. The smaller mark stays inside
// the maskable icon's central safe circle, including every rounded stroke cap.
const icon = (maskable) => svg('0 0 512 512', 'Lotline', `<rect width="512" height="512" fill="${mark.forest}"/><g transform="translate(${maskable ? '96 96' : '72 72'}) scale(${maskable ? 10 : 11.5})">${path(mark.paper)}</g>`);
const standard = icon(false);
const maskable = icon(true);
await save('icons/icon-source.svg', standard);
await save('icons/icon-maskable-source.svg', maskable);
for (const [name, size, source] of [
  ['icon-192.png', 192, standard],
  ['icon-512.png', 512, standard],
  ['apple-touch-icon.png', 180, standard],
  ['icon-maskable-512.png', 512, maskable],
]) {
  await save(`icons/${name}`, await sharp(Buffer.from(source)).resize(size, size).png().toBuffer());
}

const samples = [16, 24, 32, 48, 64];
const row = (color, y) => samples.map((size, index) => `<g transform="translate(${80 + index * 100} ${y}) scale(${size / 32})">${path(color)}</g><text x="${80 + index * 100}" y="${y + 90}" font-size="13" fill="${color}" font-family="Arial,Helvetica,sans-serif">${size} px</text>`).join('');
const proof = svg('0 0 1100 660', 'Lotline branching logo: production size proof', `<rect width="1100" height="660" fill="${mark.paper}"/><rect x="600" width="500" height="660" fill="${mark.forest}"/><g transform="translate(80 58) scale(5)">${path(mark.forest)}</g><text x="270" y="175" font-size="72" font-weight="600" letter-spacing="-3" font-family="Arial,Helvetica,sans-serif" fill="${mark.forest}">Lotline.</text>${row(mark.forest, 290)}${row(mark.forest, 460)}<g transform="translate(718 65) scale(8)">${path(mark.paper)}</g><text x="718" y="400" font-size="54" font-weight="600" letter-spacing="-2" font-family="Arial,Helvetica,sans-serif" fill="${mark.paper}">Lotline.</text><text x="720" y="468" font-size="16" font-family="Arial,Helvetica,sans-serif" fill="${mark.paper}">Three contributions. One clear plan.</text><text x="80" y="270" font-size="14" font-family="Arial,Helvetica,sans-serif" fill="${mark.forest}">ACTUAL SYMBOL SIZES</text><text x="80" y="440" font-size="14" font-family="Arial,Helvetica,sans-serif" fill="${mark.forest}">APP ICON SIZES</text>`);
// Use the actual exported app-icon design for the second proof row.
const tiles = await Promise.all(samples.map(async (size, index) => ({
  input: await sharp(Buffer.from(standard)).resize(size, size).png().toBuffer(),
  left: 80 + index * 100,
  top: 460,
})));
await writeFile(new URL('../docs/screenshots/brand-sizes.png', import.meta.url), await sharp(Buffer.from(proof)).composite(tiles).png().toBuffer());
console.log('Generated Lotline SVG marks, app icons, and the size proof.');
