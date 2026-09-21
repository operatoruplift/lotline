import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const run = promisify(execFile);
const output = new URL('../public/brand-kit/', import.meta.url);
const mark = JSON.parse(await readFile(new URL('../lib/brand/mark.json', import.meta.url), 'utf8'));
await mkdir(output, { recursive: true });
const C = { forest: '#174D3C', deep: '#112B24', paper: '#F5F4EE', sage: '#BFD5A9', moss: '#6E8D6B', ink: '#18211D', eucalyptus: '#87998A', stone: '#DCDDD2' };
const files = [];
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const symbol = (x, y, size, color = C.forest) => `<g transform="translate(${x} ${y}) scale(${size / 32})"><path d="${mark.path}" fill="none" stroke="${color}" stroke-width="${mark.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
const text = (value, x, y, size, color = C.forest, o = {}) => `<text x="${x}" y="${y}" fill="${color}" font-family="${o.serif ? 'Georgia, serif' : 'Arial, Helvetica, sans-serif'}" font-size="${size}" font-weight="${o.weight ?? 400}" letter-spacing="${o.spacing ?? 0}" text-anchor="${o.anchor ?? 'start'}"${o.italic ? ' font-style="italic"' : ''}>${esc(value)}</text>`;
const lockup = (x, y, size = 42, color = C.forest) => `${symbol(x, y - size * .79, size, color)}${text('Lotline.', x + size * 1.35, y, size, color, { weight: 700, spacing: -size * .045 })}`;
const label = (value, x, y, size = 13, color = C.forest, anchor = 'start') => text(value, x, y, size, color, { weight: 600, spacing: size * .14, anchor });
const rect = (x, y, width, height, fill, extra = '') => `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" ${extra}/>`;
const svg = (w, h, body, title = 'Lotline brand artwork') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><title>${esc(title)}</title>${body}</svg>`;
const rule = (x, y, width, color = C.forest, opacity = .2) => `<path d="M${x} ${y}h${width}" fill="none" stroke="${color}" stroke-opacity="${opacity}"/>`;
async function save(name, data) { await writeFile(new URL(name, output), data); files.push(name); }
async function png(name, source) { await save(name, await sharp(Buffer.from(source)).png({ compressionLevel: 9 }).toBuffer()); }

// Generated artwork is a background material. The production mark and every
// text label remain deterministic vector geometry in these native SVG layouts.
const art = {};
for (const tone of ['ivory', 'forest']) {
  const data = await sharp(new URL(`art/${tone}-sculpture.png`, output).pathname).jpeg({ quality: 94, chromaSubsampling: '4:4:4' }).toBuffer();
  art[tone] = `data:image/jpeg;base64,${data.toString('base64')}`;
}
const artwork = (tone, x, y, w, h, position = 'xMidYMid slice') => `<image href="${art[tone]}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${position}"/>`;
const fade = (id, color, direction = 'down') => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="${direction === 'right' ? '1' : '0'}" y2="${direction === 'right' ? '0' : '1'}"><stop stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>`;

await save('lotline-mark.svg', svg(32, 32, symbol(0, 0, 32)));
await save('lotline-mark-light.svg', svg(32, 32, symbol(0, 0, 32, C.paper)));
await save('lotline-mark-monochrome.svg', svg(32, 32, symbol(0, 0, 32, C.ink)));
await save('lotline-wordmark.svg', svg(520, 128, lockup(14, 91, 80)));
await save('lotline-wordmark-light.svg', svg(520, 128, lockup(14, 91, 80, C.paper)));
function profile(dark) {
  const bg = dark ? C.deep : C.paper;
  const fg = dark ? C.paper : C.forest;
  return svg(1024, 1024, `<defs><radialGradient id="light" cx=".24" cy=".12" r=".94"><stop stop-color="${dark ? '#486157' : '#FFFFFF'}"/><stop offset="1" stop-color="${bg}"/></radialGradient></defs>${rect(0, 0, 1024, 1024, 'url(#light)')}${symbol(232, 232, 560, fg)}`, 'Lotline profile image');
}
for (const [tone, dark] of [['light', false], ['dark', true]]) {
  await save(`profile-${tone}.svg`, profile(dark));
  await png(`profile-${tone}.png`, profile(dark));
}
// Quiet clock and icon areas; the exact mark is a small signature only.
const phone = svg(1290, 2796, `${rect(0, 0, 1290, 2796, C.deep)}${artwork('forest', 0, 0, 1290, 2796)}${symbol(592, 2440, 106, C.paper)}`, 'Lotline sculptural phone wallpaper');
const desktop = svg(2880, 1800, `${artwork('ivory', 0, 0, 2880, 1800)}${lockup(180, 1624, 56)}${label('A SMALL PLAN. A CLEAR NEXT STEP.', 182, 1683, 17)}`, 'Lotline sculptural desktop wallpaper');
await png('wallpaper-phone.png', phone);
await png('wallpaper-desktop.png', desktop);
await save('background-paper.svg', svg(1920, 1080, artwork('ivory', 0, 0, 1920, 1080), 'Lotline ivory sculpture background'));
await save('background-forest.svg', svg(1920, 1080, `${rect(0, 0, 1920, 1080, C.deep)}${artwork('forest', 600, -240, 1320, 1980)}${fade('left', C.deep, 'right')}${rect(600, 0, 600, 1080, 'url(#left)')}`, 'Lotline forest sculpture background'));
const square = svg(1080, 1080, `${rect(0, 0, 1080, 1080, C.paper)}${artwork('ivory', 0, 330, 1080, 720)}${fade('top', C.paper)}${rect(0, 330, 1080, 170, 'url(#top)')}${lockup(68, 105, 40)}${label('CONTRIBUTION PLANNING', 1012, 98, 12, C.forest, 'end')}${text('Small steps.', 65, 252, 94, C.forest, { serif: true, spacing: -4 })}${text('Clear direction.', 65, 359, 94, C.forest, { serif: true, italic: true, spacing: -4 })}${rect(0, 966, 1080, 114, C.deep)}${text('Your assets. Your split. Your next contribution.', 68, 1020, 22, C.paper)}${label('LOTLINE / ON SOLANA', 68, 1051, 10, '#BFCDBF')}`, 'Lotline social post: Small steps. Clear direction.');
const story = svg(1080, 1920, `${rect(0, 0, 1080, 1920, C.deep)}${artwork('forest', 0, 200, 1080, 1720)}${fade('top', C.deep)}${rect(0, 190, 1080, 430, 'url(#top)')}${lockup(82, 200, 48, C.paper)}${label('YOUR NEXT CONTRIBUTION', 86, 340, 14, '#C2CDBF')}${text('A little clarity.', 80, 466, 89, C.paper, { serif: true, spacing: -3 })}${text('A clear next step.', 80, 571, 89, C.paper, { serif: true, italic: true, spacing: -3 })}${rect(66, 1510, 948, 242, C.paper, 'rx="6"')}${label('ONE CONTRIBUTION AT A TIME', 110, 1568, 12)}${text('Choose your assets.', 110, 1632, 40, C.forest, { serif: true })}${text('Make your split.', 110, 1682, 40, C.forest, { serif: true, italic: true })}${symbol(850, 1600, 85)}${label('LOTLINE / ON SOLANA', 540, 1805, 13, C.paper, 'middle')}`, 'Lotline story: A little clarity. A clear next step.');
function landscape(height) {
  return svg(1200, height, `${rect(0, 0, 1200, height, C.paper)}${artwork('ivory', 400, 0, 940, height)}${fade('left', C.paper, 'right')}${rect(370, 0, 290, height, 'url(#left)')}${lockup(60, 100, 36)}${label('YOUR NEXT CONTRIBUTION', 64, 216, 11)}${text('Make room', 60, 302, 76, C.forest, { serif: true, spacing: -3 })}${text('for clarity.', 60, 384, 76, C.forest, { serif: true, italic: true, spacing: -3 })}${text('A precise plan for the assets you choose.', 64, 443, 18)}${rule(64, 509, 300)}${label('PLAN / VERIFY / REVIEW', 64, 546, 11)}`, 'Lotline: Make room for clarity.');
}
// Header lockups stay above the lower-left profile-photo overlap area.
const headerX = svg(1500, 500, `${rect(0, 0, 1500, 500, C.deep)}${artwork('forest', 880, -430, 760, 1140)}${fade('left', C.deep, 'right')}${rect(880, 0, 360, 500, 'url(#left)')}${lockup(108, 130, 40, C.paper)}${text('Your next contribution,', 340, 245, 57, C.paper, { serif: true, spacing: -2 })}${text('clearly.', 340, 315, 65, C.paper, { serif: true, italic: true, spacing: -2 })}${label('A SMALL PLAN. A CLEAR NEXT STEP.', 345, 372, 11, '#C1CDBF')}`, 'Lotline X profile header');
const headerLinkedIn = svg(1584, 396, `${artwork('ivory', 680, 0, 904, 603)}${rect(0, 0, 740, 396, C.paper)}${fade('left', C.paper, 'right')}${rect(700, 0, 260, 396, 'url(#left)')}${lockup(350, 99, 32)}${text('Your next contribution,', 349, 200, 54, C.forest, { serif: true, spacing: -2 })}${text('clearly.', 349, 261, 60, C.forest, { serif: true, italic: true, spacing: -2 })}${label('PRECISE PLANS / ON SOLANA', 354, 319, 10)}`, 'Lotline LinkedIn cover');
for (const [name, source] of [['social-square.png', square], ['social-story.png', story], ['ad-landscape.png', landscape(628)], ['og-image.png', landscape(630)], ['header-x.png', headerX], ['header-linkedin.png', headerLinkedIn]]) await png(name, source);
await save('brand-guide.md', `# Lotline brand kit\n\nSculpture collection, September 21, 2026. A contribution planner on Solana.\n\n## Visual direction\n\nWarm ivory, smoked sage glass, deep forest and restrained typography. The sculpture is an atmospheric background, not a new logo. Keep the selected three-branch mark exactly as supplied. No neon green, fake performance charts, investment promises or decorations crossing text.\n\n## Palette\n\n${Object.entries(C).map(([name, value]) => `- ${name}: ${value}`).join('\n')}\n\n## Formats and safe areas\n\n- Profiles: 1024 × 1024 PNG and SVG. Mark only, with generous circular-crop clearance.\n- Phone wallpaper: 1290 × 2796. Quiet upper area for the clock; minimal lower branding.\n- Desktop wallpaper: 2880 × 1800. Artwork to the right, icon space to the left.\n- Social square: 1080 × 1080. Story: 1080 × 1920.\n- Ad: 1200 × 628. Open Graph: 1200 × 630.\n- X header: 1500 × 500. LinkedIn: 1584 × 396. Important type stays out of the lower-left avatar overlap. Platform crops vary; inspect your uploaded preview.\n- Backgrounds: 1920 × 1080 self-contained SVGs with embedded artwork for decks and new layouts.\n\n## Production\n\nThe two original background materials were generated with the built-in image-generation tool. Source PNGs are preserved in art/. Typography and the exact production mark are native vector layouts in scripts/generate-brand-kit.mjs. PNG exports are rasterized from those compositions. The core logo geometry, orientation and colors are unchanged.\n\n## Saving on a phone\n\nUse Open full size, then save through the browser image or share menu. Downloads may go to Files. The ZIP includes all 19 exports, both original artwork files, this guide and the manifest.\n\n## Voice\n\nYour next contribution, clearly. Explain the next action in plain words. Never imply investment performance or that an illustration proves a completed purchase.\n`);
const metadata = { version: 2, collection: 'Sculpture', updated: '2026-09-21', brand: 'Lotline', palette: C, sourceArt: ['art/ivory-sculpture.png', 'art/forest-sculpture.png'], assets: {} };
for (const name of files) {
  const data = await readFile(new URL(name, output));
  metadata.assets[name] = { bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
  if (name.endsWith('.png')) { const { width, height } = await sharp(data).metadata(); Object.assign(metadata.assets[name], { width, height }); }
}
await save('manifest.json', `${JSON.stringify(metadata, null, 2)}\n`);
const archive = new URL('lotline-brand-kit.zip', output);
await rm(archive, { force: true });
await run('zip', ['-q', archive.pathname, ...files, ...metadata.sourceArt], { cwd: output.pathname });
console.log(`Generated ${files.length} brand-kit files and a fresh ZIP.`);
