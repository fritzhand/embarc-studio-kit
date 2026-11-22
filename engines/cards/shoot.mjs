#!/usr/bin/env node
/**
 * shoot.mjs: a screenshot of a web page, for a `site` card (a browser frame), a step's photo, or a still.
 *
 *   node engines/cards/shoot.mjs https://yourcompany.com projects/<name>/assets/site.png
 *   node engines/cards/shoot.mjs <url or local .html> <out.png> --device phone          390 x 844 at 2x, a phone's view
 *   node engines/cards/shoot.mjs <url> <out.png> --size 1440x900 --wait 4000
 *
 * Headless Chrome, sized through the DevTools protocol so a phone view is a true phone view. A page behind a login,
 * a cookie wall or a bot check comes out as that wall: look at the picture, and take the screenshot yourself if so.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { withChrome } from '../../lib/chrome.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const [url, out] = argv.filter((a, i) => !a.startsWith('--') && !['--size', '--wait', '--device'].includes(argv[i - 1]));
if (!url || !out) { console.error('usage: node engines/cards/shoot.mjs <url> <out.png> [--device phone] [--size 1440x900] [--wait 4000]'); process.exit(1); }
const phone = opt('--device', 'desktop') === 'phone';
const [w, h] = opt('--size', phone ? '390x844' : '1440x900').split('x').map(Number);
const scale = phone ? 2 : 1;
const [path, query] = url.split('?');
const target = /^[a-z]+:\/\//i.test(url) ? url : pathToFileURL(resolve(path)).href + (query ? `?${query}` : '');

await withChrome({ width: w, height: h, scale }, async ({ s, goto }) => {
  if (phone) {
    await s('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: scale, mobile: true });
    await s('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  }
  if (!(await goto(target))) console.warn('! the page did not finish loading');
  await new Promise((r) => setTimeout(r, Number(opt('--wait', 2500))));
  const { data } = await s('Page.captureScreenshot', { format: 'png' });
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(resolve(out), Buffer.from(data, 'base64'));
});
console.log(`✓ ${out}  (${w} x ${h}${phone ? ' at 2x' : ''}). Look at it before you use it.`);
