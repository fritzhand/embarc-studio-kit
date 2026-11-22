#!/usr/bin/env node
/**
 * transcribe.mjs: a recording in, every sentence and word out, with times.
 *
 *   node engines/interview/transcribe.mjs <video or audio> [out.json]      default out: transcript.json beside the file
 *   node engines/interview/transcribe.mjs <file> --model ~/.cache/whisper/ggml-medium.en.bin
 *   node engines/interview/transcribe.mjs <file> --list                     also print the sentences
 *
 * Runs whisper.cpp locally (nothing leaves the computer). The transcript has:
 *   sentences  [{ id: "S1", start, end, text }]   the units an agent picks soundbites by, in cut.json ("from": "S4")
 *   words      [{ w, start, end }]               for captions, timed to each word
 * Needs ffmpeg and whisper-cli (https://github.com/ggml-org/whisper.cpp) with a model, by default
 * ~/.cache/whisper/ggml-small.en.bin. Read the transcript before you quote it: speech recognition mishears names.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const opt = (n, d = null) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const pos = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--model'].includes(argv[i - 1])));
if (!pos[0]) { console.error('usage: node engines/interview/transcribe.mjs <video or audio> [out.json] [--list]'); process.exit(1); }
const SRC = resolve(pos[0]);
const OUT = resolve(pos[1] || join(dirname(SRC), 'transcript.json'));
const MODEL = (opt('--model') || process.env.WHISPER_MODEL || join(homedir(), '.cache', 'whisper', 'ggml-small.en.bin')).replace(/^~/, homedir());
if (!existsSync(SRC)) { console.error(`✗ no file ${SRC}`); process.exit(1); }
if (!existsSync(MODEL)) { console.error(`✗ no whisper model at ${MODEL}: see engines/interview/README.md, "Set up"`); process.exit(1); }

const work = mkdtempSync(join(tmpdir(), 'transcribe-'));
const wav = join(work, 'audio.wav');
let r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', SRC, '-vn', '-ac', '1', '-ar', '16000', wav], { encoding: 'utf8' });
if (r.status) { console.error(`✗ ffmpeg could not read the sound: ${r.stderr}`); process.exit(1); }
console.log(`transcribing ${basename(SRC)} with ${basename(MODEL)}…`);
/* -nfa (flash attention off) gives noticeably better word times on whisper.cpp builds that have it */
r = spawnSync('whisper-cli', ['-m', MODEL, '-f', wav, '-ojf', '-of', join(work, 'w'), '-np', '-nfa'], { encoding: 'utf8', maxBuffer: 1 << 28 });
if (r.status || !existsSync(join(work, 'w.json'))) r = spawnSync('whisper-cli', ['-m', MODEL, '-f', wav, '-ojf', '-of', join(work, 'w'), '-np'], { encoding: 'utf8', maxBuffer: 1 << 28 });
if (r.status || !existsSync(join(work, 'w.json'))) { console.error(`✗ whisper-cli failed: ${r.stderr?.slice(-1500)}`); process.exit(1); }
/* the real pauses, from the sound itself: whisper's times drift by up to a second, silences do not */
const sd = spawnSync('ffmpeg', ['-i', wav, '-af', 'silencedetect=noise=-38dB:d=0.25', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
const silences = [];
for (const m of sd.matchAll(/silence_start: (-?[\d.]+)[\s\S]*?silence_end: ([\d.]+)/g)) silences.push([Math.max(0, +m[1]), +m[2]]);
const raw = JSON.parse(readFileSync(join(work, 'w.json'), 'utf8'));
rmSync(work, { recursive: true, force: true });

/* tokens to words: a token that starts with a space starts a new word; punctuation joins the word before it */
const words = [];
for (const seg of raw.transcription) {
  for (const tok of seg.tokens || []) {
    const text = tok.text;
    if (/^\[_|^\[[A-Z_]+\]$|^<\|/.test(text.trim())) continue;
    const from = tok.offsets.from / 1000, to = tok.offsets.to / 1000;
    if (/^\s/.test(text) || !words.length) words.push({ w: text.trim(), start: from, end: to });
    else { const w = words[words.length - 1]; w.w += text; w.end = Math.max(w.end, to); }
  }
}
const clean = words.filter((w) => w.w && !/^[-–—]+$/.test(w.w)).map((w) => ({ w: w.w, start: +w.start.toFixed(3), end: +Math.max(w.end, w.start + 0.05).toFixed(3) }));

/* words to sentences. A sentence closes on . ? ! when the next word starts a new sentence, so "Example Co. is"
   stays whole. */
const groups = [];
let cur = [];
clean.forEach((w, i) => {
  cur.push(w);
  const next = clean[i + 1];
  if (!next || (/[.?!]["”')]?$/.test(w.w) && /^["“(]?[A-Z0-9]/.test(next.w))) { groups.push(cur); cur = []; }
});
/* Whisper places the start of a sentence well and its end late, so: snap each start to the end of the silence
   just before it, and end each sentence at the last real silence before the next one starts. A cut then lands
   in a pause and never clips a word. The words move with their sentence, for the captions. */
const AUDIO_END = parseFloat(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', SRC], { encoding: 'utf8' }).stdout) || clean.at(-1)?.end || 0;
const starts = groups.map((g) => {
  const t = g[0].start;
  const c = silences.filter(([, e]) => e > t - 1.2 && e < t + 0.5).sort((x, y) => Math.abs(x[1] - t) - Math.abs(y[1] - t))[0];
  return c ? c[1] : t;
});
const sentences = groups.map((g, k) => {
  const s1 = starts[k], limit = k + 1 < groups.length ? starts[k + 1] : AUDIO_END;
  const pause = silences.filter(([s]) => s > s1 + 0.3 && s <= limit).at(-1);
  const e1 = pause ? pause[0] : limit;
  const s0 = g[0].start, e0 = g[g.length - 1].end;
  const map = (t) => +Math.min(e1, Math.max(s1, s1 + ((t - s0) / Math.max(0.01, e0 - s0)) * (e1 - s1))).toFixed(3);
  for (const w of g) { w.start = map(w.start); w.end = map(w.end); }
  return { id: `S${k + 1}`, start: +s1.toFixed(3), end: +e1.toFixed(3), text: g.map((w) => w.w).join(' ') };
});

const duration = AUDIO_END || null;
const out = { source: basename(SRC), duration, model: basename(MODEL), made: new Date().toISOString().slice(0, 10),
  note: 'Machine transcript. Check names, figures and anything you quote against the recording.', sentences, words: clean };
writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(`✓ ${sentences.length} sentences, ${clean.length} words → ${OUT}`);
if (argv.includes('--list')) spawnSync(process.execPath, [join(dirname(new URL(import.meta.url).pathname), 'soundbites.mjs'), OUT], { stdio: 'inherit' });
