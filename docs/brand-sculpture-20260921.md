# Lotline Sculpture collection and custom domain

The September 21, 2026 collection replaces the original plain brand-kit compositions with sculptural smoked-sage glass, warm ivory, deep forest, and editorial typography. The selected three-branch logo remains the geometry source; no new logo was introduced.

## Deliverables

All 19 established export filenames and dimensions remain available at [lotline.dev/brand-kit](https://lotline.dev/brand-kit). The 23-file ZIP includes those exports, two original artwork PNGs, the usage guide and manifest. SHA-256 checks verify the exports against their archived bytes. Wallpapers leave clock or icon space; profile marks fit circular crops; headers keep essential text away from lower-left profile-photo overlays. Social posts, stories, ads and covers have separate compositions. The gallery offers original-file opening and individual downloads for mobile saving.

The footer's video is preserved with a desaturated sage grade, a light warm-paper wash, and a longer top fade. Normal-motion playback remains active while visible. Existing reduced-motion and autoplay fallback behavior remain intact.

## Original artwork and prompts

Generated with the built-in image-generation tool, then used as background materials in the existing native SVG export pipeline. Production marks and all text are vector geometry and typesetting from `scripts/generate-brand-kit.mjs`. No financial figures, prices, transactions or interface screenshots are invented in these graphics.

Source files:

- `public/brand-kit/art/ivory-sculpture.png`
- `public/brand-kit/art/forest-sculpture.png`

Ivory prompt:

> Create a finished, premium abstract brand-art background for Lotline, a calm precision-focused contribution planning product. Landscape 3:2 composition, highest practical resolution. No text, letters, logos, numbers, stock charts, coins, interface, borders or watermark. Art direction: museum-quality sculptural product photography meets contemporary editorial finance branding. A single elegant arrangement of three broad, gently curving translucent smoked-sage glass ribbons with softly rounded edges meeting near one open junction, like three paths converging, placed entirely in the right 55% of the frame. The sculpture rests just above a warm ivory limestone surface and casts soft long shadows and subtle caustic light. Tactile frosted glass, restrained polished edges, tiny natural material detail. Very pale warm ivory background #F5F4EE with beautifully controlled subtle shadow gradients. Main glass colors muted eucalyptus #839386 and desaturated deep forest #174D3C, pale champagne glints only. Left 45% is mostly clean warm ivory negative space, suitable for large typography added separately. Directional afternoon studio light from upper left. Rich 3D depth, exquisite craftsmanship, high-end art-book aesthetic. Avoid bright emerald or lime, cyan, purple, metallic chrome, generic glowing blobs, spheres, grid lines, thin line diagrams, and excessive reflections.

Forest prompt:

> Create a premium abstract phone wallpaper for Lotline, a quiet and precise financial planning brand. Portrait 2:3 canvas, highest practical resolution. No text, letters, logo, numbers, coins, stock charts, interface, watermark, or border. A close-up art-directed sculpture made of three broad translucent smoked-sage and deep forest glass ribbons, each gently folding around the same open space, curving from lower left to right. Cropped like high-end architectural photography; beautiful material texture, luminous edges, frosted interiors, warm champagne highlights, soft natural shadows. The lower two thirds carries the elegant sculpture; the upper third is a quiet seamless almost-black green atmosphere fading into soft grey-green light for phone clock legibility. Restrained palette: midnight forest #112B24, dusty eucalyptus #87998A, warm ivory #F5F4EE light reflections, absolutely no electric green/cyan/purple. Rich cinematic depth, tasteful museum-quality product photography, tactile modern luxury, subtle film grain, spacious controlled composition. It should feel like a collectible art wallpaper, never a corporate template, geometric diagram or generic gradients.

The original sources are 1536×1024 and 1024×1536. Wallpaper exports use the stated larger canvas dimensions; this does not claim native 4K source photography. Exact typography and mark geometry remain crisp at export resolution.

## Domain

The preferred lotline.xyz was unavailable. The user's fallback, lotline.dev, is assigned to the existing Vercel project and serves HTTPS. Vercel's authenticated search displayed Free with Pro and the free option was selected; the displayed standard renewal is $13/year. Registration is completed for one year, expiring September 21, 2027, with auto-renew disabled. The registrar order API lists a $9.99 price but does not expose discount or net-charge fields, so the actual invoice charge is not asserted here. Existing Vercel aliases remain accessible. Canonical metadata, sitemap, robots and social previews now use the custom domain.

Supabase's hosted Site URL is https://lotline.dev. The new origin, callback, and recovery callback were added while retaining all prior allowed redirects. Read-back matched the applied configuration. Runtime auth and share links already derive their origin from the current browser/request, so no new secret or origin environment variable is required. This configuration check does not claim SMTP delivery verification. Device-local plans and sessions remain scoped to their original origin; the old address stays available rather than forcing a redirect that would strand those drafts.

## Verification

The generator completed and the fresh ZIP contains all 23 expected entries, including both source masters. Manifest hashes and archived bytes match. Local lint and typecheck passed. The build caught Next's new restriction on local image query strings; a narrow exact allowlist now permits only the new brand-kit cache version while keeping other local query strings restricted. Code and TypeScript reviews approved the changes. Browser and production release evidence are recorded after verification.
