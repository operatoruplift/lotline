#!/usr/bin/env node
/**
 * Build the selected design's decorative media from the exact user-provided
 * originals. Requires Node 22+, ffmpeg (libx264), ffprobe, and the existing sharp.
 * Originals live outside the repository; only bounded derivatives are public.
 * See docs/design-media.md for provenance, playback requirements, and commands.
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = resolve(process.env.LOTLINE_MEDIA_SOURCE_DIR || resolve(root, '../../work/redesign-media-sources'));
const outputDirectory = resolve(root, 'public/media/design');
const manifestPath = resolve(root, 'docs/design-media-manifest.json');
const sourceBase = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/';
const clips = [
  { name: 'hero-boomerang', poster: 'hero-poster', source: 'hf_20260517_070729_32a7eb4e-d6e2-4571-badc-91b4dab1ecbe.mp4', width: 1280, boomerang: true },
  { name: 'support', poster: 'support-poster', source: 'hf_20260517_074029_c7a854bd-2d6e-4b62-96b3-ae8c16311e44.mp4', width: 768 },
  { name: 'feature-verified', poster: 'feature-verified-poster', source: 'hf_20260405_143605_bc7bd6c0-9c68-49ff-a9d3-073a10759fa4.mp4', width: 720 },
  { name: 'feature-split', poster: 'feature-split-poster', source: 'hf_20260405_145119_f4ec4d9f-3ecd-4116-baa3-26e8cf2df976.mp4', width: 720 },
  { name: 'feature-keep', poster: 'feature-keep-poster', source: 'hf_20260405_140728_ae719193-f10b-4105-82fc-c989610b3aa6.mp4', width: 720 },
  { name: 'footer-landscape', poster: 'footer-landscape-poster', source: 'hf_20260901_122529_931c22c8-8d2d-47c0-ad51-b97f56a91e42.mp4', width: 1280 },
  { name: 'auth-glass', poster: 'auth-glass-poster', source: 'hf_20260606_135315_5f9e8a4c-09bc-4a97-9f75-8a387d4258ee.mp4', width: 1280 },
  { name: 'hero-boomerang-mobile', variantOf: 'hero-boomerang', poster: 'hero-mobile-poster', source: 'hf_20260517_070729_32a7eb4e-d6e2-4571-badc-91b4dab1ecbe.mp4', width: 768, boomerang: true },
  { name: 'auth-glass-mobile', variantOf: 'auth-glass', poster: 'auth-glass-mobile-poster', source: 'hf_20260606_135315_5f9e8a4c-09bc-4a97-9f75-8a387d4258ee.mp4', width: 768 },
];
const footerPoster = {
  // The supplied .png URL serves WebP bytes; keep the original source filename
  // locally, but expose those exact bytes with their correct public extension.
  name: 'footer-original-poster.png',
  publicName: 'footer-original-poster.webp',
  url: 'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/4f690bd1-881a-4192-82f2-d714d34c8fb9.png',
};
// Pin the exact inspected bytes so a changed CDN response or an unrelated local
// file cannot silently be attributed to the supplied media in the manifest.
const sourceHashes = {
  'hf_20260517_070729_32a7eb4e-d6e2-4571-badc-91b4dab1ecbe.mp4': '002b2ee5b124727afbe11ab691cf5a6b5c0133ccad4df39b8a038e2f148ead07',
  'hf_20260517_074029_c7a854bd-2d6e-4b62-96b3-ae8c16311e44.mp4': '1352ba4f244a9a23027065d24977d54dc8b0849d5b2d1727cdb757f6ea699d4e',
  'hf_20260405_143605_bc7bd6c0-9c68-49ff-a9d3-073a10759fa4.mp4': 'f615e7854572ea191d62d5bed7ddbc1b4114670f434ee1a39b0763dd96f6659d',
  'hf_20260405_145119_f4ec4d9f-3ecd-4116-baa3-26e8cf2df976.mp4': '1d89cda160e0f0a2fa50ff4519c5b064fd60aa012d583b08c5d238cbecff5507',
  'hf_20260405_140728_ae719193-f10b-4105-82fc-c989610b3aa6.mp4': 'bc0ad0d5930ae5f8ca2b0985916dd80b8a786d2fb8ea3737231cca70844404bd',
  'hf_20260901_122529_931c22c8-8d2d-47c0-ad51-b97f56a91e42.mp4': '6621e1a9faa46f98dd64340abb2237a66698060997017a87a505a1ab0d1a8272',
  'hf_20260606_135315_5f9e8a4c-09bc-4a97-9f75-8a387d4258ee.mp4': '4dde87d1aa2ba0bbb7b8245c223bbbe46021704b5310148c4ea0f28d3412be5a',
  [footerPoster.name]: 'e73c04aa555ad589a8896c56da65ccd2cccee5914c7901e266d26661cd075a2b',
};
const downloadOnly = process.argv.includes('--download-only');
const verifyOnly = process.argv.includes('--verify-only');
if (process.argv.slice(2).some((arg) => !['--download-only', '--verify-only'].includes(arg)) || (downloadOnly && verifyOnly)) {
  throw new Error('Use no arguments, --download-only, or --verify-only.');
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr = (stderr + chunk).slice(-16000); });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolveRun(stdout) : reject(new Error(`${command} exited ${code}: ${stderr}`)));
  });
}

async function hash(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}

async function describe(path) {
  const probe = JSON.parse(await run('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', path]));
  const video = probe.streams.find((stream) => stream.codec_type === 'video');
  if (!video) throw new Error(`No video/image stream in ${path}`);
  return {
    bytes: (await stat(path)).size,
    sha256: await hash(path),
    width: video.width,
    height: video.height,
    durationSeconds: Number(probe.format.duration || video.duration) || null,
    videoCodec: video.codec_name,
    pixelFormat: video.pix_fmt,
    framesPerSecond: video.avg_frame_rate,
    audioStreams: probe.streams.filter((stream) => stream.codec_type === 'audio').length,
  };
}

async function download(url, path) {
  if (await exists(path)) return;
  const limit = 120 * 1024 * 1024;
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok || !response.body) throw new Error(`Source download failed: ${response.status} ${url}`);
  if (Number(response.headers.get('content-length')) > limit) throw new Error(`Source exceeds 120 MiB: ${url}`);
  let bytes = 0;
  const bound = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      callback(bytes > limit ? new Error('Source exceeded download budget') : null, chunk);
    },
  });
  const temporary = `${path}.partial`;
  try {
    await pipeline(Readable.fromWeb(response.body), bound, createWriteStream(temporary, { flags: 'wx' }));
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function validateClip(path) {
  const metadata = await describe(path);
  if (metadata.videoCodec !== 'h264' || metadata.pixelFormat !== 'yuv420p' || metadata.audioStreams !== 0) {
    throw new Error(`Expected silent broadly compatible H.264/yuv420p: ${path}`);
  }
  // Decode every frame, rather than treating a successful HTTP/download as proof.
  await run('ffmpeg', ['-v', 'error', '-xerror', '-i', path, '-map', '0:v:0', '-f', 'null', '-']);
  // MP4 starts playback without fetching its trailing movie index.
  const bytes = await readFile(path);
  const moov = bytes.indexOf(Buffer.from('moov'));
  const mdat = bytes.indexOf(Buffer.from('mdat'));
  if (moov < 0 || mdat < 0 || moov > mdat) throw new Error(`Missing fast-start MP4 index: ${path}`);
  return { ...metadata, decodedEveryFrame: true, fastStart: true };
}

async function encode(clip) {
  const input = resolve(sourceDirectory, clip.source);
  const output = resolve(outputDirectory, `${clip.name}.mp4`);
  // Bound pixel dimensions *before* reverse buffers frames. fps keeps wall-clock
  // timing unchanged; it only samples at a practical decorative playback rate.
  const scale = `scale=w='min(${clip.width},iw)':h=-2:flags=lanczos,setsar=1,fps=24,format=yuv420p`;
  const filter = clip.boomerang
    ? ['-filter_complex', `[0:v:0]${scale},split=2[forward][backward];[backward]reverse,setpts=PTS-STARTPTS[return];[forward]setpts=PTS-STARTPTS[outward];[outward][return]concat=n=2:v=1:a=0[video]`, '-map', '[video]']
    : ['-vf', scale, '-map', '0:v:0'];
  await run('ffmpeg', [
    '-y', '-v', 'error', '-threads', '2', '-filter_threads', '1', '-filter_complex_threads', '1', '-i', input, ...filter,
    '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '25',
    '-profile:v', 'high', '-level:v', '4.0', '-pix_fmt', 'yuv420p',
    '-g', '48', '-keyint_min', '24', '-movflags', '+faststart',
    '-map_metadata', '-1', '-threads', '2', output,
  ]);
  const poster = resolve(outputDirectory, `${clip.poster}.jpg`);
  if (clip.name === 'footer-landscape') {
    // The requested still is the actual original artwork, not a guessed frame.
    await sharp(resolve(sourceDirectory, footerPoster.name))
      .resize({ width: 1600, withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true }).toFile(poster);
  } else {
    const frame = resolve(sourceDirectory, `${clip.name}-poster-frame.png`);
    try {
      await run('ffmpeg', ['-y', '-v', 'error', '-i', output, '-frames:v', '1', frame]);
      await sharp(frame).jpeg({ quality: 82, mozjpeg: true }).toFile(poster);
    } finally {
      await rm(frame, { force: true });
    }
  }
  const source = await describe(input);
  const derivative = await validateClip(output);
  const expectedDuration = source.durationSeconds * (clip.boomerang ? 2 : 1);
  if (Math.abs(derivative.durationSeconds - expectedDuration) > 0.15) throw new Error(`Unexpected speed/duration change in ${clip.name}`);
  console.log(`${clip.name}: ${source.width}×${source.height}, ${source.durationSeconds}s, ${source.bytes} source bytes → ${derivative.width}×${derivative.height}, ${derivative.durationSeconds}s, ${derivative.bytes} bytes`);
  return {
    name: clip.name,
    ...(clip.variantOf ? { variantOf: clip.variantOf } : {}),
    purpose: 'Silent decorative imagery; never a product demo or a source of financial data.',
    source: { url: sourceBase + clip.source, ...source },
    derivative: { path: `/media/design/${clip.name}.mp4`, ...derivative },
    poster: { path: `/media/design/${clip.poster}.jpg`, origin: clip.name === 'footer-landscape' ? footerPoster.url : 'First frame of the same-source derivative', ...await describe(poster) },
    timing: clip.boomerang
      ? 'The complete original plays forward at natural speed, then all frames play backward at natural speed. The encoded file loops the full forward/return cycle; no browser reverse buffer is required. Endpoint frames repeat once at each turn (1/24 second).'
      : 'Original chronology and natural wall-clock duration retained; loop controlled by the decorative media component.',
  };
}

await mkdir(sourceDirectory, { recursive: true });
await mkdir(outputDirectory, { recursive: true });
if (verifyOnly) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  for (const clip of manifest.clips) {
    const output = resolve(root, `public${clip.derivative.path}`);
    const metadata = await validateClip(output);
    if (metadata.sha256 !== clip.derivative.sha256) throw new Error(`Derivative changed since manifest: ${clip.name}`);
    if (await hash(resolve(root, `public${clip.poster.path}`)) !== clip.poster.sha256) throw new Error(`Poster changed since manifest: ${clip.name}`);
    console.log(`Verified ${clip.name}: ${metadata.durationSeconds}s, ${metadata.bytes} bytes; all frames decoded.`);
  }
  if (await hash(resolve(root, `public${manifest.footerOriginalPoster.path}`)) !== manifest.footerOriginalPoster.sha256) throw new Error('Original footer artwork changed since manifest.');
} else {
  const originals = [...new Set(clips.map((clip) => clip.source))];
  const jobs = originals.map((source) => ({ url: sourceBase + source, path: resolve(sourceDirectory, source), sha256: sourceHashes[source] }));
  jobs.push({ url: footerPoster.url, path: resolve(sourceDirectory, footerPoster.name), sha256: sourceHashes[footerPoster.name] });
  // At most two downloads in flight. No source URL comes from application input.
  for (let index = 0; index < jobs.length; index += 2) {
    await Promise.all(jobs.slice(index, index + 2).map(async (job) => {
      await download(job.url, job.path);
      if (await hash(job.path) !== job.sha256) throw new Error(`Source hash differs from inspected original: ${job.path}`);
      console.log(`Source ready: ${job.path} (${(await stat(job.path)).size} bytes)`);
    }));
  }
  if (downloadOnly) {
    for (const clip of clips) console.log(JSON.stringify({ name: clip.name, ...await describe(resolve(sourceDirectory, clip.source)) }));
  } else {
    const outputs = [];
    for (const clip of clips) outputs.push(await encode(clip));
    const originalPoster = resolve(sourceDirectory, footerPoster.name);
    const posterMetadata = await describe(originalPoster);
    await copyFile(originalPoster, resolve(outputDirectory, footerPoster.publicName));
    await writeFile(manifestPath, `${JSON.stringify({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      sourceAuthority: 'Exact media URLs supplied in the selected Lotline redesign brief; no replacement generation or stock footage.',
      recipe: 'node scripts/prepare-design-media.mjs',
      toolchain: { ffmpeg: (await run('ffmpeg', ['-version'])).split('\n')[0], node: process.version },
      codec: 'H.264 high profile, yuv420p, 24fps, CRF 25, fast-start MP4, no audio or metadata streams',
      footerOriginalPoster: { url: footerPoster.url, path: `/media/design/${footerPoster.publicName}`, preservation: 'Unmodified original WebP bytes from the supplied .png URL; optimized JPEG is used for the website poster.', ...posterMetadata },
      clips: outputs,
    }, null, 2)}\n`);
    console.log(`Wrote ${manifestPath}`);
  }
}
