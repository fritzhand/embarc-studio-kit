#!/usr/bin/env node
/**
 * render.mjs: the cards between and over your clips, drawn as HTML in your brand and saved as PNGs.
 *
 *   node engines/cards/render.mjs jobs.json            render every job in the file
 *   node engines/cards/render.mjs --list               list the templates and their fields
 *   node engines/cards/render.mjs --sample <brand>     one of each template, both formats, into build/cards-sample/
 *
 * jobs.json is a list of { template, data, format, brand, out, theme? }:
 *   template  title | stat | quote | image | end | lower | caption | placeholder
 *   format    "9x16" (1080 x 1920) or "16x9" (1920 x 1080)
 *   brand     a brand folder (brands/<name>/), the same contract as the collateral builder's
 *   theme     light | dark | accent (the brand's three themes; default light, captions and lower thirds ignore it)
 *
 * `lower` and `caption` come out transparent, to lay over video. The cut engine calls this for you; run it
 * yourself to proof a card. Needs Google Chrome or Chromium (CHROME_PATH to point at another).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SIZES = { '9x16': [1080, 1920], '16x9': [1920, 1080] };

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/* *word* in a headline is set as a highlight, the way the collateral builder's templates do it */
const hl = (s) => esc(s).replace(/\*(.+?)\*/g, '<em class="hl">$1</em>');
const img = (p) => (p ? pathToFileURL(resolve(p)).href : '');

/* A QR code as an SVG data URI, by Python's segno (pip3 install segno): dark on white, no quiet zone (the card is the margin). */
const qrCache = new Map();
export function qr(url) {
  if (!qrCache.has(url)) {
    try {
      qrCache.set(url, execFileSync('python3', ['-c', "import sys,segno\nq=segno.make(sys.argv[1],error='m')\nprint(q.svg_data_uri(scale=8,border=0,dark='#111111',light='#ffffff',omitsize=True))", url], { encoding: 'utf8' }).trim());
    } catch { throw new Error('QR codes need Python\'s segno: pip3 install segno'); }
  }
  return qrCache.get(url);
}
const href = (u) => (/^https?:\/\//.test(u) ? u : `https://${u}`);
const qrBox = (url, label) => `<div class="qr"><img src="${qr(href(url))}" alt=""><span>${esc(label || String(url).replace(/^https?:\/\//, '').replace(/\/$/, ''))}</span></div>`;
/* how-to callouts: a ring on each point (x, y in percent of the photo) and a label at the end of a stem (dir: left | right | up | down) */
const callout = (c) => `<div class="co co-${esc(c.dir || 'right')}" style="left:${+c.x}%;top:${+c.y}%;--len:${+(c.len ?? 7)}"><i class="ring"></i>${c.label ? `<i class="stem"></i><b class="tag">${esc(c.label)}</b>` : ''}</div>`;

export const TEMPLATES = {
  title: { fields: 'eyebrow, title (*word* highlights), sub', html: (d) => `
    <div class="frame center">
      <div class="logo"></div>
      ${d.eyebrow ? `<p class="eyebrow">${esc(d.eyebrow)}</p>` : ''}
      <h1>${hl(d.title)}</h1>
      ${d.sub ? `<p class="sub">${esc(d.sub)}</p>` : ''}
    </div>` },
  stat: { fields: 'eyebrow, n (the figure), label, source (required: where the figure comes from)', html: (d) => `
    <div class="frame center">
      ${d.eyebrow ? `<p class="eyebrow">${esc(d.eyebrow)}</p>` : ''}
      <p class="big">${esc(d.n)}</p>
      <p class="label">${esc(d.label)}</p>
      <p class="source">${d.source ? `Source: ${esc(d.source)}` : '<span class="tbd">Source needed</span>'}</p>
    </div>` },
  quote: { fields: 'text (the speaker\'s exact words), name, role', html: (d) => `
    <div class="frame center">
      <blockquote>&ldquo;${esc(d.text)}&rdquo;</blockquote>
      <p class="who"><b>${esc(d.name)}</b>${d.role ? `<br>${esc(d.role)}` : ''}</p>
    </div>` },
  image: { fields: 'src (a picture: screenshot, product shot, photo), caption, fit (contain | cover)', html: (d) => `
    <div class="frame image ${d.fit === 'cover' ? 'cover' : 'contain'}">
      <div class="pic" style="background-image:url('${img(d.src)}')"></div>
      ${d.caption ? `<p class="caption-line">${esc(d.caption)}</p>` : ''}
    </div>` },
  end: { fields: 'line, url, qr (a link for a QR code, or true for the url), qrLabel, small', html: (d) => `
    <div class="frame center ${d.qr ? 'with-qr' : ''}">
      <div class="logo big-logo"></div>
      ${d.line ? `<h2>${hl(d.line)}</h2>` : ''}
      ${d.url ? `<p class="url">${esc(d.url)}</p>` : ''}
      ${d.qr ? qrBox(d.qr === true ? d.url : d.qr, d.qrLabel) : ''}
      ${d.small ? `<p class="small">${esc(d.small)}</p>` : ''}
    </div>` },
  site: { fields: 'eyebrow, title, body, url (shown in the address bar), shot (a screenshot: npm run shoot), qr (true for a QR code to the url), qrLabel', html: (d) => `
    <div class="frame site">
      <div class="site-text">
        ${d.eyebrow ? `<p class="eyebrow">${esc(d.eyebrow)}</p>` : ''}
        ${d.title ? `<h2>${hl(d.title)}</h2>` : ''}
        ${d.body ? `<p class="sub">${esc(d.body)}</p>` : ''}
        ${d.qr ? qrBox(d.qr === true ? d.url : d.qr, d.qrLabel) : ''}
      </div>
      <div class="browser"><div class="bar"><i></i><i></i><i></i><span>${esc(String(d.url || '').replace(/^https?:\/\//, ''))}</span></div>
        <div class="shot" style="background-image:url('${img(d.shot)}')"></div></div>
    </div>` },
  step: { fields: 'num, eyebrow, title, body, photo, callouts [{ x, y, label, dir, len }] (x and y in percent of the photo)', html: (d) => `
    <div class="frame step">
      <div class="step-text">
        ${d.eyebrow ? `<p class="eyebrow">${esc(d.eyebrow)}</p>` : ''}
        ${d.num != null ? `<p class="num">${esc(d.num)}</p>` : ''}
        ${d.title ? `<h2>${hl(d.title)}</h2>` : ''}
        ${d.body ? `<p class="sub">${esc(d.body)}</p>` : ''}
      </div>
      <div class="step-photo"><div class="pw"><img src="${img(d.photo)}" alt="">${(d.callouts || []).map(callout).join('')}</div></div>
    </div>` },
  screen: { fields: 'device (browser | phone), url, eyebrow, title, caption, box [x, y, w, h], text [x, y, w, h] (the cut engine sets box and text: a recording plays in the box)', html: (d) => {
    const [x, y, w, h] = d.box || [0, 0, 0, 0], [tx, ty, tw, th] = d.text || [0, 0, 0, 0];
    const words = `<div class="scr-text" style="left:${tx}px;top:${ty}px;width:${tw}px;height:${th}px">
        ${d.eyebrow ? `<p class="eyebrow">${esc(d.eyebrow)}</p>` : ''}${d.title ? `<h2>${hl(d.title)}</h2>` : ''}${d.caption ? `<p class="sub">${esc(d.caption)}</p>` : ''}</div>`;
    const dev = d.device === 'phone'
      ? `<div class="phone2" style="left:${x - 18}px;top:${y - 18}px;width:${w + 36}px;height:${h + 36}px"><div class="scr" style="inset:18px"></div></div>`
      : `<div class="browser2" style="left:${x}px;top:${y - 48}px;width:${w}px;height:${h + 48}px"><div class="bar2"><i></i><i></i><i></i><span>${esc(String(d.url || '').replace(/^https?:\/\//, '').replace(/\/$/, ''))}</span></div><div class="scr" style="top:48px"></div></div>`;
    return words + dev;
  } },
  lower: { fields: 'name, role (transparent: lies over the speaker)', transparent: true, html: (d) => `
    <div class="lower"><b>${esc(d.name)}</b>${d.role ? `<span>${esc(d.role)}</span>` : ''}</div>` },
  caption: { fields: 'text (transparent: lies over video); or words and active, the group with the word being spoken highlighted', transparent: true, html: (d) => {
    const words = Array.isArray(d.words) ? d.words : null;
    const inner = words ? words.map((w, i) => (i === d.active ? `<b class="on">${esc(w)}</b>` : esc(w))).join(' ') : esc(d.text);
    return `<div class="cap"><span>${inner}</span></div>`;
  } },
  placeholder: { fields: 'title, sub, narrow (stand-in footage for the example project; narrow keeps the words in the middle, for a 9:16 crop)', html: (d) => `
    <div class="frame center placeholder ${d.narrow ? 'narrow' : ''}">
      <p class="eyebrow">Stand-in footage</p>
      <h2>${esc(d.title)}</h2>
      ${d.sub ? `<p class="sub">${esc(d.sub)}</p>` : ''}
    </div>` },
};

export const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; }
  html, body { width: var(--w); height: var(--h); overflow: hidden; }
  body { --u: calc(var(--short) / 100); background: var(--paper); color: var(--ink);
    font-family: var(--font-body); font-weight: var(--weight-body, 400); line-height: var(--lh-body, 1.4); }
  body.clear { background: transparent; }
  .frame { position: absolute; inset: 0; padding: calc(var(--u) * 9); display: flex; flex-direction: column; gap: calc(var(--u) * 3); }
  .center { justify-content: center; }
  .v .frame { padding: calc(var(--u) * 9) calc(var(--u) * 8); }
  h1, h2, .big, blockquote { font-family: var(--font-display); font-weight: var(--weight-display, 700);
    line-height: var(--lh-display, 1.05); letter-spacing: var(--track-display, 0); color: var(--display-color, var(--ink)); }
  h1 { font-size: calc(var(--u) * 10); }
  .v h1 { font-size: calc(var(--u) * 11.5); }
  h2 { font-size: calc(var(--u) * 7.5); }
  .hl { font-style: var(--style-hl, normal); color: var(--accent); }
  .eyebrow { font-family: var(--font-eyebrow, var(--font-body)); font-weight: var(--weight-eyebrow, var(--weight-strong, 600));
    text-transform: var(--case-eyebrow, uppercase); letter-spacing: var(--track-eyebrow, .12em);
    color: var(--eyebrow-color, var(--accent)); font-size: calc(var(--u) * 2.6); }
  .sub, .label { font-size: calc(var(--u) * 3.8); color: var(--ink-muted); max-width: 30em; }
  .big { font-size: calc(var(--u) * 26); color: var(--kpi-color, var(--accent)); line-height: .95; }
  .label { color: var(--ink); font-size: calc(var(--u) * 4.6); }
  .source { margin-top: calc(var(--u) * 4); font-size: calc(var(--u) * 2.2); color: var(--ink-muted); }
  .tbd { background: #ffe066; color: #000; padding: 0 .3em; }
  blockquote { font-family: var(--font-quote, var(--font-display)); font-style: var(--style-quote, normal); font-size: calc(var(--u) * 6.6); }
  .v blockquote { font-size: calc(var(--u) * 7.6); }
  .who { font-size: calc(var(--u) * 3); color: var(--ink-muted); }
  .who b { color: var(--ink); font-weight: var(--weight-strong, 600); }
  .logo { background-repeat: no-repeat; background-position: left center; background-size: contain;
    height: calc(var(--u) * 6); width: calc(var(--u) * 6 * var(--logo-ratio, 4) * var(--logo-scale, 1)); max-width: 80%; margin-bottom: calc(var(--u) * 3); }
  .big-logo { height: calc(var(--u) * 9); width: calc(var(--u) * 9 * var(--logo-ratio, 4) * var(--logo-scale, 1)); }
  .url { font-size: calc(var(--u) * 4.2); font-weight: var(--weight-strong, 600); color: var(--accent); }
  .small { font-size: calc(var(--u) * 2); color: var(--ink-muted); max-width: 60em; }
  .image { padding: calc(var(--u) * 6); justify-content: center; }
  .pic { flex: 1; background-repeat: no-repeat; background-position: center; background-size: contain; }
  .cover .pic { background-size: cover; position: absolute; inset: 0; }
  .contain .pic { border-radius: calc(var(--u) * var(--radius, 1)); }
  .caption-line { position: relative; font-size: calc(var(--u) * 3.4); font-weight: var(--weight-strong, 600); text-align: center; }
  .cover .caption-line { position: absolute; left: 0; right: 0; bottom: 0; padding: calc(var(--u) * 4); background: var(--scrim, rgb(0 0 0 / .7)); color: #fff; }
  .placeholder { background: repeating-linear-gradient(135deg, var(--paper) 0 calc(var(--u) * 4), var(--accent-soft, var(--paper)) calc(var(--u) * 4) calc(var(--u) * 8)); }
  .qr { display: inline-flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 1); background: #fff; color: #111;
    padding: calc(var(--u) * 1.6); border-radius: calc(var(--u) * 1.2); align-self: flex-start; box-shadow: 0 calc(var(--u) * .6) calc(var(--u) * 2) rgb(0 0 0 / .18); }
  .qr img { width: calc(var(--u) * 17); height: calc(var(--u) * 17); display: block; image-rendering: pixelated; }
  .qr span { font-size: calc(var(--u) * 1.9); font-weight: var(--weight-strong, 600); }
  .h .with-qr .qr { position: absolute; right: calc(var(--u) * 9); top: 50%; transform: translateY(-50%); }
  .site { display: grid; grid-template-columns: 1fr 1.45fr; gap: calc(var(--u) * 6); align-items: center; }
  .v .site { grid-template-columns: 1fr; grid-template-rows: auto auto; align-content: center; }
  .site-text { display: flex; flex-direction: column; gap: calc(var(--u) * 2.4); }
  .site h2, .step h2 { font-size: calc(var(--u) * 6.4); }
  .v .site h2, .v .step h2 { font-size: calc(var(--u) * 7.6); }
  .browser { background: #fff; border-radius: calc(var(--u) * 1.4); overflow: hidden; box-shadow: 0 calc(var(--u) * 1.4) calc(var(--u) * 5) rgb(0 0 0 / .22); border: 1px solid rgb(0 0 0 / .08); }
  .bar { height: calc(var(--u) * 4.4); display: flex; align-items: center; gap: calc(var(--u) * .8); padding: 0 calc(var(--u) * 1.6); background: #eef0f2; }
  .bar i { width: calc(var(--u) * 1.2); height: calc(var(--u) * 1.2); border-radius: 50%; background: #c9ccd1; }
  .bar span { margin-left: calc(var(--u) * 1.4); flex: 1; background: #fff; border-radius: 99px; font-size: calc(var(--u) * 1.8); color: #444; padding: calc(var(--u) * .5) calc(var(--u) * 1.6); }
  .shot { aspect-ratio: 16 / 10; background: #fff center top / cover no-repeat; }
  .step { display: grid; grid-template-columns: .8fr 1.2fr; gap: calc(var(--u) * 6); align-items: center; }
  .v .step { grid-template-columns: 1fr; align-content: center; }
  .step-text { display: flex; flex-direction: column; gap: calc(var(--u) * 2.4); }
  .num { width: calc(var(--u) * 7); height: calc(var(--u) * 7); border-radius: 50%; background: var(--accent); color: var(--accent-ink);
    display: grid; place-items: center; font-family: var(--font-display); font-size: calc(var(--u) * 3.6); font-weight: var(--weight-display, 700); }
  .step-photo { display: flex; justify-content: center; }
  .pw { position: relative; display: inline-block; }
  .pw img { display: block; max-width: 100%; max-height: calc(var(--h) * .62); border-radius: calc(var(--u) * 1.2); box-shadow: 0 calc(var(--u) * 1) calc(var(--u) * 3.5) rgb(0 0 0 / .2); }
  .h .pw img { max-height: calc(var(--h) * .74); }
  .co { position: absolute; width: 0; height: 0; --r: calc(var(--u) * 4); --l: calc(var(--u) * var(--len)); }
  .co .ring { position: absolute; left: calc(var(--r) * -1); top: calc(var(--r) * -1); width: calc(var(--r) * 2); height: calc(var(--r) * 2); border-radius: 50%;
    border: calc(var(--u) * .7) solid var(--accent); box-shadow: 0 0 0 calc(var(--u) * .45) rgb(0 0 0 / .35); }
  .co .stem { position: absolute; background: var(--accent); }
  .co .tag { position: absolute; white-space: nowrap; background: var(--accent); color: var(--accent-ink); font-size: calc(var(--u) * 2.6);
    font-weight: var(--weight-strong, 600); padding: calc(var(--u) * .8) calc(var(--u) * 1.6); border-radius: calc(var(--u) * .8); }
  .co-right .stem { left: var(--r); top: calc(var(--u) * -.25); width: var(--l); height: calc(var(--u) * .5); }
  .co-right .tag { left: calc(var(--r) + var(--l)); top: 0; transform: translateY(-50%); }
  .co-left .stem { right: var(--r); top: calc(var(--u) * -.25); width: var(--l); height: calc(var(--u) * .5); }
  .co-left .tag { right: calc(var(--r) + var(--l)); top: 0; transform: translateY(-50%); }
  .co-up .stem { bottom: var(--r); left: calc(var(--u) * -.25); height: var(--l); width: calc(var(--u) * .5); }
  .co-up .tag { bottom: calc(var(--r) + var(--l)); left: 0; transform: translateX(-50%); }
  .co-down .stem { top: var(--r); left: calc(var(--u) * -.25); height: var(--l); width: calc(var(--u) * .5); }
  .co-down .tag { top: calc(var(--r) + var(--l)); left: 0; transform: translateX(-50%); }
  .scr-text { position: absolute; display: flex; flex-direction: column; justify-content: center; gap: calc(var(--u) * 2.2); }
  .scr-text h2 { font-size: calc(var(--u) * 6.2); }
  .v .scr-text h2 { font-size: calc(var(--u) * 7.4); }
  .browser2, .phone2 { position: absolute; }
  .browser2 { border-radius: 14px; overflow: hidden; background: #fff; box-shadow: 0 24px 60px rgb(0 0 0 / .28); border: 1px solid rgb(0 0 0 / .08); }
  .bar2 { height: 48px; display: flex; align-items: center; gap: 9px; padding: 0 18px; background: #2a2d33; }
  .bar2 i { width: 12px; height: 12px; border-radius: 50%; background: #5d6169; }
  .bar2 span { margin-left: 14px; background: #3a3e45; color: #e8e9eb; border-radius: 99px; padding: 5px 18px; font: 600 17px var(--font-body); }
  .scr { position: absolute; left: 0; right: 0; bottom: 0; background: #fff; }
  .phone2 { border-radius: 64px; background: #16181c; box-shadow: 0 30px 70px rgb(0 0 0 / .32), inset 0 0 0 3px #3a3d44; }
  .phone2 .scr { border-radius: 46px; }
  .narrow { align-items: center; text-align: center; }
  .narrow > * { max-width: 26%; }
  .narrow h2 { font-size: calc(var(--u) * 5.4); }
  .lower { position: absolute; left: calc(var(--u) * 6); bottom: calc(var(--u) * 20); padding: calc(var(--u) * 2.2) calc(var(--u) * 3.2);
    background: var(--paper); color: var(--ink); border-left: calc(var(--u) * 1) solid var(--accent); border-radius: calc(var(--u) * .6);
    display: flex; flex-direction: column; gap: calc(var(--u) * .4); max-width: 80%; }
  .v .lower { bottom: calc(var(--u) * 80); }
  .lower b { font-family: var(--font-display); font-weight: var(--weight-display, 700); font-size: calc(var(--u) * 4); line-height: 1.05; }
  .lower span { font-size: calc(var(--u) * 2.6); color: var(--ink-muted); }
  .cap { position: absolute; left: 0; right: 0; bottom: calc(var(--u) * 9); display: flex; justify-content: center; padding: 0 calc(var(--u) * 6); }
  .v .cap { bottom: calc(var(--u) * 64); padding: 0 calc(var(--u) * 12); }
  .cap span { background: rgb(0 0 0 / .72); color: #fff; font-family: var(--font-body); font-weight: var(--weight-strong, 600);
    font-size: calc(var(--u) * 4.6); line-height: 1.2; padding: calc(var(--u) * 1) calc(var(--u) * 2); border-radius: calc(var(--u) * .8); text-align: center; }
  .v .cap span { font-size: calc(var(--u) * 6.4); }
  .cap b.on { font-weight: inherit; color: var(--accent-ink, #111); background: var(--accent); border-radius: .16em;
    box-shadow: 0 0 0 .1em var(--accent); -webkit-box-decoration-break: clone; box-decoration-break: clone; }
`;

/** The card as a whole HTML page. The motion engine (engines/motion/) wraps the same page in a HyperFrames composition:
    `extraCss` adds its animations, `bodyAttrs` its timing variables, and `wrap` puts the card inside its timed clip. */
export function cardPage(job, { extraCss = '', bodyAttrs = '', wrap = (html) => html } = {}) {
  const t = TEMPLATES[job.template];
  if (!t) throw new Error(`no template "${job.template}" (have: ${Object.keys(TEMPLATES).join(', ')})`);
  const [w, h] = SIZES[job.format] || (() => { throw new Error(`format must be 9x16 or 16x9, not "${job.format}"`); })();
  const brandCss = join(resolve(job.brand), 'brand.css');
  if (!existsSync(brandCss)) throw new Error(`no brand.css in ${job.brand}`);
  const theme = t.transparent ? 'theme-light' : `theme-${job.theme || 'light'}`;
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${pathToFileURL(brandCss).href}">
<style>:root{--w:${w}px;--h:${h}px;--short:${Math.min(w, h)}px}${BASE_CSS}${extraCss}</style></head>
<body class="${theme} ${h > w ? 'v' : 'h'} ${t.transparent ? 'clear' : ''}"${bodyAttrs}>${wrap(t.html(job.data || {}))}</body></html>`;
}
const page = (job) => cardPage(job);

export function chromePath() {
  const c = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const p = c.find((x) => x && existsSync(x));
  if (!p) throw new Error('no Chrome or Chromium found: install one, or set CHROME_PATH');
  return p;
}

function shoot(chrome, html, out, [w, h], transparent) {
  const tmp = join(tmpdir(), `card-${process.pid}-${Math.random().toString(36).slice(2)}.html`);
  writeFileSync(tmp, html);
  mkdirSync(dirname(resolve(out)), { recursive: true });
  const args = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', `--window-size=${w},${h}`,
    `--screenshot=${resolve(out)}`, '--virtual-time-budget=4000', ...(transparent ? ['--default-background-color=00000000'] : []), pathToFileURL(tmp).href];
  return new Promise((ok, fail) => {
    const p = spawn(chrome, args, { stdio: 'ignore' });
    p.on('exit', (code) => { rmSync(tmp, { force: true }); existsSync(resolve(out)) ? ok(out) : fail(new Error(`Chrome did not write ${out} (exit ${code})`)); });
  });
}

/** Render jobs, four at a time. Returns the paths written. */
export async function renderCards(jobs, { parallel = 4 } = {}) {
  const chrome = chromePath();
  const queue = jobs.map((j) => ({ j, html: page(j), size: SIZES[j.format], transparent: !!TEMPLATES[j.template].transparent }));
  const done = [];
  await Promise.all(Array.from({ length: Math.min(parallel, queue.length) }, async () => {
    while (queue.length) { const q = queue.shift(); done.push(await shoot(chrome, q.html, q.j.out, q.size, q.transparent)); }
  }));
  return done;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv.slice(2);
  if (arg[0] === '--list' || !arg.length) {
    for (const [k, t] of Object.entries(TEMPLATES)) console.log(`${k.padEnd(12)} ${t.fields}`);
    process.exit(0);
  }
  let jobs;
  if (arg[0] === '--sample') {
    const brand = arg[1] || join(HERE, '..', '..', 'brands', 'example-co');
    const out = join(process.cwd(), 'build', 'cards-sample');
    const data = {
      title: { eyebrow: 'Founder story', title: 'Why we built *Example Co.*', sub: 'A two-minute conversation with our founder.' },
      stat: { eyebrow: 'Sample figure', n: '42%', label: 'Sample label: replace with a figure you can source', source: 'Sample source, replace it' },
      quote: { text: 'Sample quote: use the speaker\'s exact words.', name: 'Sample Name', role: 'Founder, Example Co.' },
      end: { line: 'See it for *yourself.*', url: 'example.com', small: 'Sample closing line.' },
      lower: { name: 'Sample Name', role: 'Founder, Example Co.' },
      caption: { text: 'Captions sit here, a few words at a time' },
      placeholder: { title: 'Interview footage goes here', sub: 'The example project uses this frame in place of a camera.' },
    };
    jobs = [];
    for (const f of ['9x16', '16x9']) for (const [t, d] of Object.entries(data)) jobs.push({ template: t, data: d, format: f, brand, out: join(out, `${f}-${t}.png`), theme: t === 'end' ? 'dark' : 'light' });
  } else {
    const file = resolve(arg[0]);
    jobs = JSON.parse(readFileSync(file, 'utf8')).map((j) => ({ ...j, brand: resolve(dirname(file), j.brand), out: resolve(dirname(file), j.out) }));
  }
  const t0 = Date.now();
  const done = await renderCards(jobs);
  console.log(`✓ ${done.length} card(s) in ${((Date.now() - t0) / 1000).toFixed(1)} s${arg[0] === '--sample' ? ' → build/cards-sample/' : ''}`);
}
