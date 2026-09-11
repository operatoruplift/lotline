# Lotline pitch production

The pitch uses a native Higgsedit 0.14.0 timeline, original Lotline graphics, and actual Example-mode screenshots. It does not use generated app screens or represent example prices as current quotes.

## Source and previews

- [Watch the 54-second pitch visual cut](https://d2ol7oe51mr4n9.cloudfront.net/user_316WRAwjtWmpOAHb5tUQ2Grs4QP/a669773a-6a53-4db3-9797-172a20bd3ab4.mp4)
- [Native edit source](pitch.mjs)
- [54-second storyboard](../pitch-storyboard.md)
- [Editable Higgsedit project ZIP](https://d2ol7oe51mr4n9.cloudfront.net/user_316WRAwjtWmpOAHb5tUQ2Grs4QP/95e4d4b9-8eeb-4ef4-ba98-264206f9539b.zip)
- [Rendered contact sheet](https://d2ol7oe51mr4n9.cloudfront.net/user_316WRAwjtWmpOAHb5tUQ2Grs4QP/0e0dcb3a-5385-48d9-a21c-4a4baa7a23ae.png)

The archive contains the native `project.json`, imported media, original screenshots, cropped screen assets, and `pitch.mjs`. It is an editable file-backed project, not a hosted editor link. Use a compatible Higgsedit installation to open it.

```sh
higgsedit check project
higgsedit render project --out renders/lotline-pitch.mp4 --bitrate 8M
```

To rebuild the timeline from the script, run `higgsedit build pitch.mjs` from the extracted archive root. A whole-script build replaces timeline edits; preserve a copy first if you have edited the project manually.

## Composition

The 54-second edit has seven scenes: original three-bar brand opening, product overview, exact 10.000001 USDC allocation, estimated units in context, copy/export/Jupiter handoff, mobile and desktop views, and a closing call to action. Target output is 1920 × 1080, 30 fps, H.264 MP4. All media processing and rendering run in the Higgsfield sandbox.

The UI assets come from the public repository at commit `233b9d2`. The exact allocation scene uses native editable text and shapes. The results and handoff scenes show an explicitly labeled synthetic 1,000 USDC Example plan. No trade confirmation, native App Store availability, or completed Supabase account flow is claimed in the film.

## Narration status

Voice selection is pending. The current edit is a visual cut with readable explanatory text. A Higgsfield voice picker was requested; spoken narration can be generated only after the exact voice ID and voice type are selected. The storyboard supplies the intended narration.

## Visual review

All seven chapter frames were inspected in a native rendered contact sheet on September 11, 2026. The review checked readable hierarchy, exact allocation strings, visible Example labels, unclipped copy, real app imagery, and the original logo. The final media metadata and confirmed output URLs are recorded in `delivery.json` once export completes.
