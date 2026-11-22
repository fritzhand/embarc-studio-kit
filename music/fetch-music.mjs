#!/usr/bin/env node
/* Downloads the example soundtrack into music/ (audio is not committed: this script and README.md are the record).
     node music/fetch-music.mjs
   "Inspired" by Kevin MacLeod (incompetech.com), Creative Commons Attribution 4.0. Trimmed to its first 150 s. */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Inspired.mp3';
const OUT = join(HERE, 'inspired-kevin-macleod.mp3');
const FULL_BYTES = 9156393; // the file as downloaded on 18-Nov-2026
if (existsSync(OUT)) { console.log('· music/inspired-kevin-macleod.mp3 is here'); process.exit(0); }
const res = await fetch(SRC, { redirect: 'follow' });
if (!res.ok) { console.error(`✗ ${SRC}: ${res.status}`); process.exit(1); }
const buf = Buffer.from(await res.arrayBuffer());
if (buf.length !== FULL_BYTES) console.warn(`! ${buf.length} bytes, not the ${FULL_BYTES} recorded: check it is the same track`);
const tmp = join(tmpdir(), 'inspired-full.mp3');
writeFileSync(tmp, buf);
const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-t', '150', '-c:a', 'libmp3lame', '-b:a', '256k', OUT], { encoding: 'utf8' });
rmSync(tmp, { force: true });
if (r.status) { console.error(r.stderr); process.exit(1); }
console.log(`✓ music/inspired-kevin-macleod.mp3 (sha256 ${createHash('sha256').update(readFileSync(OUT)).digest('hex').slice(0, 16)}…)`);
