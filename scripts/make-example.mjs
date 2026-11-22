#!/usr/bin/env node
/**
 * make-example.mjs: run the whole pipeline on a made-up founder, so you can see every engine work before you record.
 *
 *   npm run example                 Kokoro voices if VOICE_PYTHON (or .venv/) is set up, otherwise stops and says how
 *   npm run example -- --engine say  the computer's own voices instead (macOS), no setup
 *
 * It makes projects/example/footage/ (a stand-in interview, recordings and screenshots of the fictional site and app in
 * site/), transcribes the interview, records the
 * voiceover, and renders projects/example/cut.json in both formats with a contact sheet each. Everything in the
 * example is fictional. Your own projects start from `npm run new -- <name>`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderCards } from '../engines/cards/render.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EX = join(ROOT, 'projects', 'example');
const FOOT = join(EX, 'footage');
const BRAND = join(ROOT, 'brands', 'example-co');
const engine = process.argv.includes('--engine') ? ['--engine', process.argv[process.argv.indexOf('--engine') + 1]] : [];
const step = (label, cmd, args) => {
  console.log(`\n▸ ${label}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT });
  if (r.status) { console.error(`✗ ${label} failed`); process.exit(r.status || 1); }
};
mkdirSync(FOOT, { recursive: true });

/* 1. the stand-in interview: the founder's lines, spoken, over a placeholder frame */
step('voice the stand-in founder', 'node', ['engines/voice/voice.mjs', join(EX, 'founder-lines.json'), ...engine]);
const lines = JSON.parse(readFileSync(join(EX, 'founder-lines.json'), 'utf8')).steps;
const takes = lines.map((l) => join(EX, 'founder-lines', `${l.id}.mp3`));
console.log('\n▸ stand-in footage');
await renderCards([
  { template: 'placeholder', data: { title: 'Interview footage goes here', sub: 'Your studio recording, shot 16:9 with you in the middle.', narrow: true }, format: '16x9', brand: BRAND, out: join(FOOT, 'interview-frame.png') },
]);
const ff = (args) => { const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args]); if (r.status) { console.error(r.stderr.toString()); process.exit(1); } };
/* the answers in order, 1.4 s of room tone between them, the way a host's questions are cut out */
const parts = takes.flatMap((t, i) => (i ? ['-f', 'lavfi', '-t', '1.4', '-i', 'anullsrc=r=48000:cl=mono', '-i', t] : ['-i', t]));
const n = takes.length * 2 - 1;
ff([...parts, '-filter_complex', `${Array.from({ length: n }, (_, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=mono[a${i}]`).join(';')};${Array.from({ length: n }, (_, i) => `[a${i}]`).join('')}concat=n=${n}:v=0:a=1[a]`, '-map', '[a]', join(FOOT, 'interview.wav')]);
ff(['-loop', '1', '-framerate', '30', '-i', join(FOOT, 'interview-frame.png'), '-i', join(FOOT, 'interview.wav'), '-vf', 'format=yuv420p',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-c:a', 'aac', '-shortest', join(FOOT, 'interview.mp4')]);

/* Example Co.'s website and app (fictional pages in site/): recorded and screenshotted the way you would your own */
const SITE = join(EX, 'site');
step('record the website, scrolling', 'node', ['engines/screen/record.mjs', join(SITE, 'index.html'), join(FOOT, 'site-scroll.mp4'), '--seconds', '8']);
step('record the app, live, on a phone', 'node', ['engines/screen/record.mjs', join(SITE, 'app.html'), join(FOOT, 'app-phone.mp4'), '--mode', 'live', '--device', 'phone', '--seconds', '6', '--wait', '300']);
step('screenshot the website', 'node', ['engines/cards/shoot.mjs', join(SITE, 'index.html'), join(FOOT, 'site.png')]);
step('screenshot the app', 'node', ['engines/cards/shoot.mjs', join(SITE, 'app.html') + '?still=open', join(FOOT, 'app.png'), '--device', 'phone']);
console.log('  footage/: interview.mp4, site-scroll.mp4, app-phone.mp4, site.png, app.png');

/* 2. transcribe, 3. the product voiceover, 4. music, 5. the cut in both shapes */
step('transcribe the interview', 'node', ['engines/interview/transcribe.mjs', join(FOOT, 'interview.mp4'), join(EX, 'transcript.json'), '--list']);
step('record the product voiceover', 'node', ['engines/voice/voice.mjs', join(EX, 'vo.json'), ...engine]);
step('fetch the music', 'node', ['music/fetch-music.mjs']);
step('cut, 9:16', 'python3', ['engines/cut/cut.py', join(EX, 'cut.json'), '--proof']);
step('cut, 16:9', 'python3', ['engines/cut/cut.py', join(EX, 'cut.json'), '--format', '16x9', '--proof']);
console.log('\n✓ the example is in projects/example/out/. Open the -proof.jpg files to see every scene, then watch the MP4s.');
