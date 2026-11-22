#!/usr/bin/env node
/**
 * fetch-engines.mjs: the two open-source repos this kit builds on, copied into vendor/ (not committed).
 *
 *   npm run engines:fetch            clone what is missing
 *   npm run engines:fetch -- --pull  bring both up to date
 *
 *   vendor/collateral-builder/          fritzhand/collateral-builder (MIT): posts, slides, flyers, one-pagers
 *   vendor/history-of-block-printing/   fritzhand/history-of-block-printing (CC0): the reel engine and the narrated
 *                                       tour overlay (only those parts are checked out; the site's 3D and media are not)
 */
import { existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = join(ROOT, 'vendor');
mkdirSync(VENDOR, { recursive: true });
const git = (args, cwd = VENDOR) => {
  const r = spawnSync('git', args, { cwd, stdio: 'inherit' });
  if (r.status) { console.error(`✗ git ${args.join(' ')}`); process.exit(1); }
};
const REPOS = [
  { dir: 'collateral-builder', url: 'https://github.com/fritzhand/collateral-builder.git' },
  { dir: 'history-of-block-printing', url: 'https://github.com/fritzhand/history-of-block-printing.git',
    sparse: ['/reel/', '!/reel/out/', '!/reel/voice/', '/tools/', '/js/', '/css/', '/data/demo/', '/tour/', '/REUSE.md', '/AGENTS.md', '/LICENSE'] },
];
for (const r of REPOS) {
  const dest = join(VENDOR, r.dir);
  if (existsSync(dest)) {
    if (process.argv.includes('--pull')) { console.log(`▸ updating ${r.dir}`); git(['pull', '--ff-only'], dest); }
    else console.log(`· ${r.dir} is here (--pull to update)`);
    continue;
  }
  console.log(`▸ ${r.dir}`);
  if (r.sparse) {
    git(['clone', '--depth', '1', '--filter=blob:none', '--sparse', r.url, r.dir]);
    git(['sparse-checkout', 'set', '--no-cone', ...r.sparse], dest);
  } else git(['clone', '--depth', '1', r.url, r.dir]);
}
console.log('\n✓ vendor/ is ready. engines/reel/, engines/tour/ and engines/collateral/ say what to do next.');
