#!/usr/bin/env node
/**
 * motion.mjs: animated cards, rendered with HyperFrames (github.com/heygen-com/hyperframes, Apache-2.0) from the same
 * HTML and brand the cards engine draws as still pictures.
 *
 *   node engines/motion/motion.mjs jobs.json                     render every job (the cut engine calls this for "motion": true)
 *   node engines/motion/motion.mjs --sample <brand> [--format 16x9]   one of each animated card, into build/motion-sample/
 *   node engines/motion/motion.mjs --check                        is HyperFrames available?
 *
 * A job is a card job (template, data, format, brand, theme) with dur, the seconds it lasts, and out. Cards come out
 * as MP4; the lower third comes out as WebM with transparency, to lie over the speaker. The moves follow the motion
 * defaults HyperFrames measured from its own films: titles arrive word by word and then stay still, arrivals land on a
 * long ease and exits are shorter, nothing loops or bounces, and every card leaves with a quick blur at its end.
 *
 * HyperFrames runs through npx (downloaded on first use, about a minute) unless it is installed in the kit. It drives
 * your own Google Chrome and needs ffmpeg, like the rest of the kit. Nothing is uploaded.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SIZES, TEMPLATES, cardPage } from '../cards/render.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
/* HyperFrames sends usage telemetry unless told not to; the kit keeps everything on your computer. */
export const HF_ENV = { ...process.env, HYPERFRAMES_NO_TELEMETRY: '1', DO_NOT_TRACK: '1' };
const ENV = HF_ENV;
export const HYPERFRAMES = 'hyperframes@0.9.81';
export const MOTION_TEMPLATES = ['title', 'stat', 'quote', 'end', 'site', 'step', 'lower'];

const IN = 'cubic-bezier(.16, 1, .3, 1)';     // arrivals land on a long tail
const OUT = 'cubic-bezier(.55, 0, 1, .45)';   // exits accelerate away, and are shorter
export const MOTION_CSS = `
#root, #root > .clip { position: absolute; inset: 0; }
@keyframes mo-in { from { opacity: 0; filter: blur(8px); } to { opacity: 1; filter: blur(0); } }
@keyframes mo-word { from { opacity: 0; filter: blur(6px); } to { opacity: 1; filter: blur(0); } }
@keyframes mo-ink { from { opacity: .22; } to { opacity: 1; } }
@keyframes mo-settle { from { opacity: 0; transform: scale(1.04); filter: blur(6px); } to { opacity: 1; transform: none; filter: blur(0); } }
@keyframes mo-ring { from { opacity: 0; transform: scale(.5); } to { opacity: 1; transform: none; } }
@keyframes mo-slide { from { opacity: 0; transform: translateX(calc(var(--u) * -5)); filter: blur(8px); } to { opacity: 1; transform: none; filter: blur(0); } }
@keyframes mo-out { to { opacity: 0; filter: blur(6px); } }
.motion .w { display: inline-block; }
.motion .frame { animation: mo-out .2s ${OUT} calc(var(--dur) - .2s) both; }

.motion .logo { animation: mo-in .45s ${IN} .1s both; }
.motion .eyebrow, .motion .num { animation: mo-in .45s ${IN} .18s both; }
.motion h1 .w, .motion h2 .w { animation: mo-word .13s ease-out calc(.3s + var(--i) * .067s) both; }
.motion .sub { animation: mo-in .4s ${IN} calc(.45s + var(--n, 4) * .067s) both; }

.motion .big { animation: mo-settle .55s ${IN} .25s both; }
.motion .label { animation: mo-in .45s ${IN} .6s both; }
.motion .source { animation: mo-in .4s ${IN} .85s both; }

.motion blockquote .w { animation: mo-ink .2s ease-out calc(.25s + var(--i) * var(--step, .08s)) both; }
.motion .who { animation: mo-in .4s ${IN} calc(.4s + var(--n, 8) * var(--step, .08s)) both; }

.motion .url { animation: mo-in .4s ${IN} calc(.5s + var(--n, 3) * .067s) both; }
.motion .qr { animation: mo-in .45s ${IN} calc(.7s + var(--n, 3) * .067s) both; }
.motion .small { animation: mo-in .4s ${IN} calc(.9s + var(--n, 3) * .067s) both; }

.motion .browser { animation: mo-settle .6s ${IN} .2s both; }
.motion .pw { animation: mo-settle .55s ${IN} .2s both; }
.motion .co .ring { animation: mo-ring .35s ${IN} calc(.75s + var(--k, 0) * .12s) both; }
.motion .co .stem, .motion .co .tag { animation: mo-in .3s ${IN} calc(.9s + var(--k, 0) * .12s) both; }

.motion .lower { animation: mo-slide .55s ${IN} .05s both, mo-out .25s ${OUT} calc(var(--dur) - .25s) forwards; }
`;

/* Splits headlines and quotes into words, once, before the first frame, so each word can arrive on its own. It reads
   nothing that changes while rendering, so every frame comes out the same. */
export const WORDS = `(() => {
  const dur = parseFloat(getComputedStyle(document.body).getPropertyValue('--dur')) || 3;
  const split = (el) => {
    let i = 0;
    const walk = (node) => {
      for (const n of [...node.childNodes]) {
        if (n.nodeType === 3) {
          const f = document.createDocumentFragment();
          for (const p of n.textContent.split(/(\\s+)/)) {
            if (!p) continue;
            if (/^\\s+$/.test(p)) { f.append(p); continue; }
            const s = document.createElement('span');
            s.className = 'w';
            s.style.setProperty('--i', i++);
            s.textContent = p;
            f.append(s);
          }
          n.replaceWith(f);
        } else if (n.nodeType === 1) walk(n);
      }
    };
    walk(el);
    return i;
  };
  for (const el of document.querySelectorAll('.frame h1, .frame h2, .frame blockquote')) {
    const n = split(el);
    const frame = el.closest('.frame') || document.body;
    frame.style.setProperty('--n', n);
    if (el.tagName === 'BLOCKQUOTE') frame.style.setProperty('--step', Math.min(0.1, (dur * 0.45) / Math.max(1, n)) + 's');
  }
  document.querySelectorAll('.co').forEach((c, k) => c.style.setProperty('--k', k));
})();`;

/** The HyperFrames command: the kit's own install if there is one, otherwise npx with the pinned version. */
export function hyperframes() {
  const local = join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'hyperframes.cmd' : 'hyperframes');
  return existsSync(local) ? [local, []] : [process.platform === 'win32' ? 'npx.cmd' : 'npx', ['--yes', HYPERFRAMES]];
}

/** Writes a HyperFrames project for one job into `dir`: the card's page as a timed composition, with the brand folder
    and every picture copied in (HyperFrames serves the project over http, and a browser will not load file:// links
    from an http page). */
export function writeProject(job, dir) {
  if (!MOTION_TEMPLATES.includes(job.template)) throw new Error(`no motion for "${job.template}" (have: ${MOTION_TEMPLATES.join(', ')})`);
  const [w, h] = SIZES[job.format] || (() => { throw new Error(`format must be 9x16 or 16x9, not "${job.format}"`); })();
  const dur = Number(job.dur);
  if (!(dur > 0.5)) throw new Error('dur must be more than half a second');
  mkdirSync(dir, { recursive: true });
  let html = cardPage(job, {
    extraCss: MOTION_CSS,
    bodyAttrs: ` style="--dur:${dur}s"`,
    wrap: (inner) => `<div id="root" data-composition-id="root" data-start="0" data-width="${w}" data-height="${h}" data-duration="${dur}">`
      + `<div class="clip" data-start="0" data-duration="${dur}" data-track-index="0">${inner}</div></div><script>${WORDS}</script>`,
  }).replace('<body class="', '<body class="motion ');
  const brand = resolve(job.brand);
  cpSync(brand, join(dir, 'brand'), { recursive: true });
  html = html.split(`${pathToFileURL(brand).href}/`).join('brand/');
  html = html.replace(/file:\/\/[^'")\s]+/g, (u) => {
    const f = fileURLToPath(u);
    const name = `media/${createHash('sha1').update(f).digest('hex').slice(0, 8)}-${basename(f).replace(/[^\w.-]+/g, '-')}`;
    mkdirSync(join(dir, 'media'), { recursive: true });
    copyFileSync(f, join(dir, name));
    return name;
  });
  writeFileSync(join(dir, 'index.html'), html);
  return dir;
}

/** Renders each job with HyperFrames, one after another (each render already uses several Chrome workers). Returns
    the outputs written; a job that fails is reported and left out, so the cut can fall back to its still card. */
export function renderMotion(jobs, { quiet = false } = {}) {
  const [cmd, pre] = hyperframes();
  const done = [];
  for (const job of jobs) {
    const t0 = Date.now();
    const work = mkdtempSync(join(tmpdir(), 'motion-'));
    try {
      writeProject(job, join(work, 'project'));
      const transparent = !!TEMPLATES[job.template].transparent;
      const ext = transparent ? '.webm' : '.mp4';
      const tmp = join(work, `out${ext}`);
      const r = spawnSync(cmd, [...pre, 'render', join(work, 'project'), '--output', tmp, '--format', ext.slice(1), '--fps', String(job.fps || 30), '--quiet'],
        { encoding: 'utf8', env: ENV });
      if (r.status !== 0 || !existsSync(tmp)) throw new Error(`HyperFrames could not render it: ${(r.stderr || r.stdout || r.error?.message || '').trim().split('\n').slice(-6).join(' | ')}`);
      const out = resolve(job.out);
      mkdirSync(dirname(out), { recursive: true });
      try { renameSync(tmp, out); } catch { copyFileSync(tmp, out); }
      done.push(out);
      if (!quiet) console.log(`  ✓ ${job.template} ${job.format} ${job.dur} s → ${basename(out)} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    } catch (e) {
      console.error(`  ✗ ${job.template}: ${e.message}`);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
  return done;
}

const SAMPLES = {
  title: { dur: 2.8, data: { eyebrow: 'Founder story', title: 'Why I built *Example Co.*', sub: 'Sam Rivera, founder' } },
  stat: { dur: 3.2, data: { eyebrow: 'Sample figure', n: '3', label: 'chairs filled in a week (made up for the sample)', source: 'Fictional sample' } },
  quote: { dur: 4.5, data: { text: 'I watched empty chairs cost our clinic real money every single week.', name: 'Sam Rivera', role: 'Founder, Example Co.' } },
  end: { dur: 3.4, data: { line: 'Fill every *chair.*', url: 'example.com', qr: true, small: 'A fictional example.' } },
  lower: { dur: 4, data: { name: 'Sam Rivera', role: 'Founder, Example Co.' } },
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv[0] === '--check') {
    const [cmd, pre] = hyperframes();
    const r = spawnSync(cmd, [...pre, '--version'], { encoding: 'utf8', env: ENV });
    console.log(r.status === 0 ? `HyperFrames ${r.stdout.trim()}` : `HyperFrames is not available: ${(r.stderr || r.error?.message || '').trim()}`);
    process.exit(r.status === 0 ? 0 : 1);
  }
  let jobs;
  if (argv[0] === '--sample') {
    const brand = argv[1] || 'brands/example-co';
    const format = argv.includes('--format') ? argv[argv.indexOf('--format') + 1] : '9x16';
    jobs = Object.entries(SAMPLES).map(([template, s]) => ({ template, ...s, format, brand, out: join(ROOT, 'build', 'motion-sample', `${template}-${format}${TEMPLATES[template].transparent ? '.webm' : '.mp4'}`) }));
  } else if (argv[0]) {
    jobs = JSON.parse(readFileSync(argv[0], 'utf8'));
  } else {
    console.error('usage: node engines/motion/motion.mjs <jobs.json> | --sample <brand> [--format 16x9] | --check');
    process.exit(1);
  }
  const done = renderMotion(jobs);
  console.log(`motion: ${done.length} of ${jobs.length} animated`);
  process.exit(done.length === jobs.length ? 0 : 1);
}
