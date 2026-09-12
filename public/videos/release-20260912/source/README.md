# Lotline video release sources — 2026-09-12

These files author the refreshed product and technical films. They preserve the exact current logo and use actual Playwright recordings of the reviewed local production application, including synthetic Example mode and a separately dated read-only Live quote request. No previous film footage is reused.

The repository's `docs/video-release-manifest.json` records the finished media hashes, source archive, Ainsley audio jobs, captions and durations. `narration.json` is the submitted spoken copy; public `.transcript.txt` files reflect the final caption transcription with canonical product spellings.

Use the Higgsfield cloud sandbox, which has Higgsedit, FFmpeg and ImageMagick installed. Download the manifest's source archive and narration audio there. Put the source files and `raw/` in `/home/user/work/lotline`, or set `LOTLINE_VIDEO_WORKSPACE`. Join the two technical WAV files in their recorded order without changing speed. Place the final narration at `voices/product.wav` and `voices/technical.wav`.

Run `python3 prepare.py`, then `higgsedit build edit.mjs`. The build renders native poster and chapter frames for inspection. `RENDER=1 higgsedit build edit.mjs` also renders both pictures. The film's timing starts narration at two seconds; extend silence to the authored duration, normalize speech to -16 LUFS and encode AAC at 128 kbps. Mux with the native H.264 picture using `-movflags +faststart`. Never time-stretch the narration.

The source clip freezes on its last actual frame when its action finishes before the chapter narration. This is a recorded demonstration, not a replay of current quotes. Live chapters retain a dated recording label and explicitly state that estimates expire. No wallet signing, transaction submission, account creation or email was recorded.
