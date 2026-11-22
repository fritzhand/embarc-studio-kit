#!/usr/bin/env node
/* new-project.mjs: start a project folder for one company's content.
     npm run new -- <name> [--brand <brand>]
   Makes projects/<name>/ with footage/, assets/, a blank storyboard.md, a cut.json to fill in, and a vo.json for
   voiceover lines. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const name = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--brand');
const brand = argv.includes('--brand') ? argv[argv.indexOf('--brand') + 1] : 'example-co';
if (!name || !/^[a-z0-9-]+$/.test(name)) { console.error('usage: npm run new -- <name, lowercase-with-dashes> [--brand <brand>]'); process.exit(1); }
const dir = join(ROOT, 'projects', name);
if (existsSync(dir)) { console.error(`✗ projects/${name}/ already exists`); process.exit(1); }
for (const d of ['footage', 'assets']) mkdirSync(join(dir, d), { recursive: true });
if (!existsSync(join(ROOT, 'brands', brand))) console.warn(`! no brands/${brand}/ yet: add your brand (brands/README.md), then set "brand" in cut.json`);
writeFileSync(join(dir, 'cut.json'), JSON.stringify({
  name, format: '9x16', brand: `../../brands/${brand}`, transcript: 'transcript.json', captions: true,
  music: { file: '../../music/inspired-kevin-macleod.mp3', level: -21, duck: 0.88,
    credit: '"Inspired" Kevin MacLeod (incompetech.com) Licensed under Creative Commons: By Attribution 4.0 https://creativecommons.org/licenses/by/4.0/' },
  segments: [
    { type: 'card', template: 'title', dur: 2.8, data: { eyebrow: 'Founder story', title: 'Why we built *Your Company*', sub: 'Your name, founder' } },
    { type: 'clip', src: 'footage/interview.mp4', from: 'S1', to: 'S2', lower: { name: 'Your name', role: 'Founder, Your Company' } },
    { type: 'card', template: 'end', theme: 'dark', dur: 3.4, transition: 'fadeblack', data: { line: 'Your closing line', url: 'yourcompany.com', small: 'Music: "Inspired" Kevin MacLeod (incompetech.com), CC BY 4.0.' } },
  ],
}, null, 2) + '\n');
const blank = readFileSync(join(ROOT, 'engines/cut/STORYBOARD.md'), 'utf8').match(/## Blank storyboard\s+```markdown\n([\s\S]*?)```/);
if (blank) writeFileSync(join(dir, 'storyboard.md'), blank[1].replace('<video name>', name));
writeFileSync(join(dir, 'vo.json'), JSON.stringify({ voice: { engine: 'Kokoro-82M', voice: 'af_heart', speed: 1.0 }, pronounce: {}, steps: [] }, null, 2) + '\n');
console.log(`✓ projects/${name}/
  1. Prepare (engines/interview/PREP.md), then put the interview in footage/interview.mp4 (RUN-OF-SHOW.md)
  2. npm run transcribe -- projects/${name}/footage/interview.mp4 projects/${name}/transcript.json --list
  3. Fill in storyboard.md (engines/cut/STORYBOARD.md)
  4. Ask your agent to write the cut (AGENTS.md, "Founder video"), then npm run cut -- projects/${name}/cut.json --proof`);
