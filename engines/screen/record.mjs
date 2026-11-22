#!/usr/bin/env node
/**
 * record.mjs: a video of your website or web app, with no screen-recording software.
 *
 *   node engines/screen/record.mjs https://yoursite.com projects/<name>/footage/site-scroll.mp4
 *   node engines/screen/record.mjs <url> <out.mp4> --mode live --seconds 6          the page as it moves on its own
 *   node engines/screen/record.mjs <url> <out.mp4> --device phone                   a phone-sized view
 *
 *   --mode scroll    (default) the page scrolls smoothly from the top to the bottom (or --to <px>), holding at each end.
 *                    Every frame is placed exactly, so the scroll never stutters, however slow the computer.
 *   --mode live      the page plays as it is: an animation, a map turning, a dashboard filling in. Frames are captured
 *                    as fast as the computer allows, each with its time, and laid back at their real pace.
 *   --device         desktop (1440 x 900, the default) or phone (390 x 844 at 2x, with a phone's user agent)
 *   --seconds        how long (default 8 for scroll, 6 for live); --wait ms before recording starts (default 2500)
 *
 * Put the recording in a browser or phone frame in cut.json ("frame": { "device": "browser", "url": "..." }).
 * For clicks and typing, record the screen yourself (QuickTime, or the Xbox Game Bar on Windows) or use the reel
 * engine. A page behind a login or a cookie banner records as that: look at the result.
 * This is how the Embarc Collective Studio's own videos show live sites (a map turning, a page scrolling).
 */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { withChrome } from '../../lib/chrome.mjs';

const argv = process.argv.slice(2);
const FLAGS = ['--mode', '--seconds', '--device', '--wait', '--to', '--fps'];
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const [url, out] = argv.filter((a, i) => !a.startsWith('--') && !FLAGS.includes(argv[i - 1]));
if (!url || !out) { console.error('usage: node engines/screen/record.mjs <url> <out.mp4> [--mode scroll|live] [--device desktop|phone] [--seconds 8]'); process.exit(1); }
const MODE = opt('--mode', 'scroll'), DEVICE = opt('--device', 'desktop'), FPS = Number(opt('--fps', 30));
const SECONDS = Number(opt('--seconds', MODE === 'live' ? 6 : 8)), WAIT = Number(opt('--wait', 2500));
const PHONE = DEVICE === 'phone';
const [W, H, SCALE] = PHONE ? [390, 844, 2] : [1440, 900, 1];
const work = mkdtempSync(join(tmpdir(), 'record-'));
const target = /^[a-z]+:\/\//i.test(url) ? url : 'file://' + resolve(url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await withChrome({ width: W, height: H, scale: SCALE }, async ({ s, ev, goto }) => {
  if (PHONE) {
    await s('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: SCALE, mobile: true });
    await s('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  }
  const shot = async () => Buffer.from((await s('Page.captureScreenshot', { format: 'jpeg', quality: 92, optimizeForSpeed: true })).data, 'base64');
  if (!(await goto(target))) console.warn('! the page did not finish loading; recording what is there');
  await sleep(WAIT);
  const frames = [];
  if (MODE === 'live') {
    const t0 = Date.now();
    while (Date.now() - t0 < SECONDS * 1000) frames.push({ img: await shot(), t: (Date.now() - t0) / 1000 });
  } else {
    /* load what loads on scroll, then come back to the top */
    const total = await ev(`(async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=${H}){scrollTo(0,y);await new Promise(r=>setTimeout(r,120));}scrollTo(0,0);await new Promise(r=>setTimeout(r,400));return document.documentElement.scrollHeight})()`);
    const end = Math.max(0, Math.min(Number(opt('--to', total)), total) - H);
    const n = Math.round(SECONDS * FPS), hold = Math.round(0.7 * FPS);
    for (let i = 0; i < n; i++) {
      const p = Math.min(1, Math.max(0, (i - hold) / Math.max(1, n - 2 * hold)));
      const y = Math.round(end * (0.5 - 0.5 * Math.cos(Math.PI * p)));            // eased: starts and stops gently
      await ev(`scrollTo(0, ${y}); new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
      frames.push({ img: await shot(), t: i / FPS });
    }
    if (!end) console.warn('! the page is no taller than the screen: nothing to scroll (try --mode live)');
  }
  /* frames, each held until the next one's time, then a steady 30 fps file */
  const list = [];
  frames.forEach((f, i) => {
    const name = `f${String(i).padStart(5, '0')}.jpg`;
    writeFileSync(join(work, name), f.img);
    const next = i + 1 < frames.length ? frames[i + 1].t : SECONDS;
    list.push(`file '${name}'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`);
  });
  list.push(`file 'f${String(frames.length - 1).padStart(5, '0')}.jpg'`);
  writeFileSync(join(work, 'list.txt'), list.join('\n') + '\n');
  mkdirSync(dirname(resolve(out)), { recursive: true });
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', join(work, 'list.txt'), '-vf', `fps=${FPS},scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-movflags', '+faststart', resolve(out)], { encoding: 'utf8' });
  if (r.status) { console.error(r.stderr); process.exit(1); }
  const rate = MODE === 'live' ? `, ${(frames.length / SECONDS).toFixed(0)} frames a second captured` : '';
  console.log(`✓ ${out}  ${W * SCALE} x ${H * SCALE}, ${SECONDS} s, ${MODE}${rate}. Watch it before you use it.`);
});
rmSync(work, { recursive: true, force: true });
