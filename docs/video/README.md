# Lotline pitch production

The pitch uses a native Higgsedit 0.14.0 timeline, original Lotline graphics, and actual Example-mode screenshots. It does not use generated app screens or represent example prices as current quotes.

## Source and previews

- [Watch the narrated 54-second pitch](https://d2ol7oe51mr4n9.cloudfront.net/user_316WRAwjtWmpOAHb5tUQ2Grs4QP/b87047f8-d625-4416-b6f7-485f4c92b73e.mp4)
- [Native edit source](pitch.mjs)
- [54-second storyboard](../pitch-storyboard.md)
- [Editable Higgsedit project ZIP](https://d2ol7oe51mr4n9.cloudfront.net/user_316WRAwjtWmpOAHb5tUQ2Grs4QP/9d753b4b-a7b5-4198-8907-1c43ce559ee9.zip)
- [Rendered contact sheet](https://d2ol7oe51mr4n9.cloudfront.net/user_316WRAwjtWmpOAHb5tUQ2Grs4QP/0e0dcb3a-5385-48d9-a21c-4a4baa7a23ae.png)

The archive contains the native `project.json`, imported media, original screenshots, cropped screen assets, six Ainsley narration takes, captions, the narration ledger, and `pitch.mjs`. Use a compatible Higgsedit installation to open this editable file-backed project.

```sh
higgsedit check project
higgsedit render project --out renders/lotline-pitch.mp4 --bitrate 8M
```

To rebuild the timeline from the script, run `higgsedit build pitch.mjs` from the extracted archive root. A whole-script build replaces timeline edits; preserve a copy first if you have edited the project manually.

## Composition

The 54-second edit has seven scenes: original three-bar brand opening, product overview, exact 10.000001 USDC allocation, estimated units in context, copy/export/Jupiter handoff, mobile and desktop views, and a closing call to action. Target output is 1920 × 1080, 30 fps, H.264 MP4. All media processing and rendering run in the Higgsfield sandbox.

The UI assets come from the public repository at commit `233b9d2`. The exact allocation scene uses native editable text and shapes. The results and handoff scenes show an explicitly labeled synthetic 1,000 USDC Example plan. No trade confirmation, native App Store availability, or completed Supabase account flow is claimed in the film.

## Narration status

Narration is complete in the user-selected **Ainsley** preset voice. Higgsfield generated six Seed Audio takes at neutral speech and pitch settings. Every take's wording was checked using Whisper, and measured speech fits the original scene windows. The 54-second visual timeline is preserved; no audio was accelerated or time-stretched. Only trailing silence in the fifth take was trimmed.

The final MP4 includes stereo AAC audio at 48 kHz, with a measured peak of −1.7 dB. Thirteen English caption cues follow the spoken phrases using measured word timestamps and timeline offsets. The exact voice pair, generation IDs, text, and placements are recorded in [pitch-narration.json](pitch-narration.json); file metadata and verification are in [delivery.json](delivery.json).

## Visual review

All seven chapter frames were inspected in a native rendered contact sheet on September 11, 2026. The review checked readable hierarchy, exact allocation strings, visible Example labels, unclipped copy, real app imagery, and the original logo. The final media metadata and confirmed output URLs are recorded in `delivery.json` once export completes.
