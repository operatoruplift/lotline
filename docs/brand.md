# Lotline identity

The user selected **concept 02 from the revised logo board** on September 12, 2026: three curved branches around an open junction. This replaces the original ascending bars. It is not the folded L from the first exploration.

## Geometry and color

Three rounded paths represent separate contribution amounts meeting in one plan. The mark uses forest `#174D3C` on paper `#F5F4EE`, or paper on forest. Keep its orientation and all three open channels; do not rotate, stretch, or fill the central space.

`lib/brand/mark.json` is the shared geometry source. `components/brand-mark.tsx` renders it in the header, footer, route loader, and planner empty state. The loader gently scales the complete symbol and respects reduced motion.

Run `npm run brand:generate` to regenerate the SVG marks, favicon, PNG app icons, and `docs/screenshots/brand-sizes.png`. Sharp is pinned as a development dependency. No image-generation service is required for these production exports.

## Exports

- `public/brand/mark.svg`: forest symbol with transparent background.
- `public/brand/mark-light.svg`: paper symbol with transparent background.
- `public/brand/monochrome.svg`: charcoal symbol.
- `public/brand/wordmark.svg`: horizontal Lotline lockup with editable text and a system font stack.
- `public/brand/favicon.svg`: paper symbol on a forest rounded tile.
- `app/favicon.ico`: conventional browser favicon with 16, 32, and 48 px frames.
- `app/icon.svg` and `app/apple-icon.png`: Next.js file-based metadata icons with generated versioned links.
- `public/icons/icon-source.svg`: full-bleed forest tile for standard app icons.
- `public/icons/icon-maskable-source.svg`: separately padded source for OS masks.
- `public/icons/`: 180 px Apple touch, 192 px and 512 px standard, and 512 px maskable PNGs.

The maskable foreground fits within the central 80%-diameter safe circle. The OS supplies the final icon mask. Versioned icon URLs and a new public offline cache version deliver the replacement artwork without changing the installed app's identity.

The earlier pitch and technical videos and dated screenshot records retain the branding shown when they were produced. Their original records are historical evidence, not current-brand exports.

## Social brand kit

The complete downloadable kit is available at [`/brand-kit`](https://lotline.dev/brand-kit) and is generated with `npm run brand:kit`. It contains the current SVG marks and wordmarks, light and dark profile images, phone and desktop wallpapers, reusable paper and forest backgrounds, social square and story artwork, ad and Open Graph images, and X and LinkedIn headers. The page provides individual downloads for saving to a phone plus `lotline-brand-kit.zip` for the full package and `brand-guide.md` for usage notes.


## Sculpture collection, September 21, 2026

The downloadable kit now uses warm ivory and smoked-sage glass artwork with editorial type. All 19 existing export names and dimensions remain available. Profile images use the exact selected mark with generous circular-crop clearance. Wallpapers reserve space for phone clocks and desktop icons; headers keep important type away from the lower-left avatar area. Every asset can be opened at full size or downloaded individually. The complete ZIP also includes both source-art masters.

The core logo geometry and production app icons are unchanged. Source materials and generation prompts are documented in [the collection release notes](brand-sculpture-20260921.md). The footer retains continuous animation with a muted sage grade and a warm paper wash.
