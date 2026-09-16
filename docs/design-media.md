# Selected redesign media

**Last updated:** September 12, 2026.

The seven decorative clips and two mobile variants are derivatives of the **exact URLs supplied in the Lotline redesign brief**. They are not screenshots, regenerated imitations, replacement footage, or financial data. The [machine-readable manifest](./design-media-manifest.json) records each original URL, SHA-256, dimensions, duration, codec, frame rate, audio streams and byte size, plus the same measurements for its public video and poster.

The unchanged Lotline mark remains in the existing brand source. These media files introduce no Kova, Veloce, Heritage Grove, or Solace branding.

## Public files

| Section | Video | Poster |
| --- | --- | --- |
| Kova hero | `/media/design/hero-boomerang.mp4` | `/media/design/hero-poster.jpg` |
| How your plan works | `/media/design/support.mp4` | `/media/design/support-poster.jpg` |
| Verified assets | `/media/design/feature-verified.mp4` | `/media/design/feature-verified-poster.jpg` |
| Your chosen split | `/media/design/feature-split.mp4` | `/media/design/feature-split-poster.jpg` |
| A plan to keep | `/media/design/feature-keep.mp4` | `/media/design/feature-keep-poster.jpg` |
| Heritage Grove footer | `/media/design/footer-landscape.mp4` | `/media/design/footer-landscape-poster.jpg` |
| Liquid Glass account screens | `/media/design/auth-glass.mp4` | `/media/design/auth-glass-poster.jpg` |
| Hero mobile variant | `/media/design/hero-boomerang-mobile.mp4` | `/media/design/hero-mobile-poster.jpg` |
| Account mobile variant | `/media/design/auth-glass-mobile.mp4` | `/media/design/auth-glass-mobile-poster.jpg` |

The footer JPEG is optimized from the **provided original poster**, preserving its teal-ink mountains, lake, pines, cranes and quiet sky. Although the supplied URL ends in `.png`, the CDN actually serves a 1920×1086 WebP. Those unmodified bytes are retained with the correct extension at `/media/design/footer-original-poster.webp` (254,446 bytes). Every other poster is an actual first frame from its associated derivative, optimized with MozJPEG quality 82. No gradient masquerades as a media fallback.

## Encoding and boomerang behavior

All seven originals are 24 fps and contain no audio. Outputs use silent H.264 high profile, `yuv420p`, 24 fps, CRF 25, two-second keyframe spacing and a fast-start MP4 movie index. Dimensions are reduced with Lanczos scaling while preserving the original aspect ratio; they are never stretched or portrait-cropped in the encoding. All frames of every output are decoded again with `ffmpeg -xerror` during generation.

The hero source is **50,375,940 bytes, 3828×2164 and 10.041667 seconds**. Its derivative contains the entire source forward, followed by the same frames in reverse. Both halves play at the original natural speed. The encoded file is approximately 20.083334 seconds, rather than speeding the pair into ten seconds or silently using a forward-only loop. The endpoint frame repeats at each turn for one original frame interval (1/24 second).

The hero is scaled to 1280×724 **before** the `reverse` filter. This bounds its reverse-frame buffer to approximately 320 MiB rather than retaining hundreds of full-resolution frames. Encoding is a one-time local preparation step with two encoder/decoder threads; playback requires no reverse canvas or frame collection in the browser.

The delivered desktop hero is 4,683,736 bytes (90.7% smaller than its original despite containing twice the playback time); its mobile variant is 2,139,553 bytes. The account backgrounds are 3,083,685 and 1,323,232 bytes respectively. Each feature video is under 281 KB, the supporting video is 222 KB and the footer is 1.16 MB. This preserves landscape detail on desktop while keeping phone transfer smaller. The clips are streamed on demand, rather than fetched together at initial page load.

As an additional encoded-content check, reversing the output's return half and comparing all 241 corresponding frame pairs with the forward half produces SSIM **0.987897**. The small difference reflects lossy H.264 encoding; the frame ordering and duration retain the intended outward/return journey. First, midpoint and return samples were also visually inspected, alongside the actual footer artwork and every section poster.

```sh
ffmpeg -i public/media/design/hero-boomerang.mp4 \
  -filter_complex '[0:v]split=2[a][b];[a]trim=end_frame=241,setpts=PTS-STARTPTS[f];[b]trim=start_frame=241,reverse,setpts=PTS-STARTPTS[r];[f][r]ssim' \
  -an -f null -
```

Other target widths are 768 pixels for the square supporting clip, 720 pixels for each square feature clip, and 1280 pixels for the landscape footer and account background. The hero and account mobile variants are 768 pixels wide, selected at widths up to 700 pixels; the hero variant retains its complete boomerang. The smaller sources avoid making phones fetch desktop detail, while the lightweight square card clips need no extra variant. Footer video keeps its 16:9 composition and its original still keeps its 1920:1086 aspect; responsive placement/cropping belongs to the section layout. The account derivative is same-origin, so a canvas or WebGL sampler can read decoded pixels without relying on remote CORS behavior or adding a media proxy.

## Reproduce or verify

Use the repository's existing Node 22+ environment and installed `sharp`, plus local `ffmpeg` with `libx264` and `ffprobe`:

```sh
node scripts/prepare-design-media.mjs --download-only
node scripts/prepare-design-media.mjs
node scripts/prepare-design-media.mjs --verify-only
```

The default original-source directory is `../../work/redesign-media-sources/` relative to the repository, outside Git and the public directory. Set `LOTLINE_MEDIA_SOURCE_DIR` to another dedicated directory if needed. Original videos are not included in the application bundle or downloaded at first paint.

Only fixed URLs in the preparation script are fetched, at most two concurrently, with a 120-second timeout and 120 MiB per-file limit. Downloads are streamed to temporary files and renamed on completion. Original SHA-256 hashes are pinned in the script: a changed CDN response or unrelated existing source file fails clearly instead of being silently relabeled as an approved original. The script invokes tools using argument arrays, with no shell interpolation. The manifest is written only after all nine encodes and full-frame decode checks succeed. `--verify-only` checks every video against the recorded hash, performs full decoding, checks its fast-start index and verifies poster hashes and the preserved original artwork.

Exact encoded bytes may differ between `ffmpeg`/`libx264` versions. The manifest records the actual toolchain used and the hashes of the outputs delivered with this checkout.

## Runtime requirements and preservation

The UI owns decorative playback: muted, inline, continuously playing when visible, reduced-motion preference changes, rejection-safe autoplay, poster fallbacks, visibility-aware loading, pause offscreen/in background and cleanup on route changes. There is no manual pause control; the browser's reduced-motion preference remains respected, and an autoplay rejection exposes only a retry action. The build script deliberately does not alter application logic or make playback a prerequisite for any planner or authentication action. Glass refraction must sample this real same-origin video behind crisp native form controls; CSS blur is only its readable fallback.

`/demo` films are a separate class of media and are **untouched by this decorative-media pipeline**. The September 12 [video release](video-release.md) replaces the featured product and technical demonstrations with current application recordings and fresh Ainsley narration. Their players retain native controls, audio, caption tracks and text transcripts. Original September 11 film sources, delivery JSON and caption files remain archival records; the no-audio description applies only to the old technical cut. No decorative clip replaces, autoplays or mutes a spoken product demonstration.

The baseline and final application verification documents record the UI's motion mapping and browser playback checks. This manifest establishes file provenance and decode integrity; it does not, by itself, claim successful browser autoplay, time advancement, pause behavior or optical sampling.
