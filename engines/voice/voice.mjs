#!/usr/bin/env node
/**
 * voice.mjs: a voiceover script in, one checked MP3 per line out.
 *
 *   node engines/voice/voice.mjs projects/<name>/vo.json            speak the lines that changed, check each take
 *   node engines/voice/voice.mjs projects/<name>/vo.json --check    list the lines with no current take (exit 1 if any)
 *   node engines/voice/voice.mjs projects/<name>/vo.json --all      speak every line again
 *   --engine say        a quick draft in the computer's own voice (macOS), no setup; Kokoro for anything you post
 *   --no-verify         skip the transcription check
 *
 * vo.json: { "voice": { "engine": "Kokoro-82M", "voice": "af_heart", "speed": 1.0 }, "pronounce": { "SaaS": "sass" },
 *            "steps": [ { "id": "intro", "text": "..." } ] }
 * Takes go to a folder named after the script, beside it: vo.json → vo/<id>.mp3, with vo/manifest.json. A take is current only while its words and voice
 * are unchanged, so editing one line re-records only that line. Put a take on a segment in cut.json: "vo": "vo/intro.mp3".
 *
 * Adapted from fritzhand/history-of-block-printing (tools/demo-voice.mjs, CC0). The voice is Kokoro-82M's
 * af_heart (Apache-2.0): open source, and it clones no one. Kokoro runs in Python: set VOICE_PYTHON to a
 * python that has `kokoro` and `soundfile`, or make .venv/ in this repo (engines/voice/README.md).
 * Each take is transcribed back with whisper.cpp and compared with its line, which catches a dropped or changed
 * word but not a wrong emphasis: listen to every take before you post.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildScript } from './voice-script.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const argv = process.argv.slice(2);
const opt = (n, d = null) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const file = argv.find((a) => a.endsWith('.json'));
if (!file) { console.error('usage: node engines/voice/voice.mjs <vo.json> [--check] [--all] [--engine say]'); process.exit(1); }
const SRC = resolve(file), DIR = join(dirname(SRC), basename(SRC, '.json')), MANIFEST = join(DIR, 'manifest.json');
const ENGINE = opt('--engine', 'kokoro');
const source = JSON.parse(readFileSync(SRC, 'utf8'));
source.voice ||= { engine: 'Kokoro-82M', voice: 'af_heart', speed: 1.0 };
if (ENGINE === 'say') source.voice = { engine: 'macOS say', voice: opt('--say-voice', 'Samantha'), speed: 1.0 };
const script = buildScript(source);
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { takes: {} };
manifest.takes ||= {};
const mp3 = (id) => join(DIR, `${id}.mp3`);
const stale = script.steps.filter((s) => argv.includes('--all') || manifest.takes[s.id]?.hash !== s.hash || !existsSync(mp3(s.id)));

if (argv.includes('--check') || !stale.length) {
  if (!stale.length) { console.log('voice: every line has a current take'); process.exit(0); }
  console.error(`voice: ${stale.length} line(s) have no current take: ${stale.map((s) => s.id).join(', ')}`);
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), 'voice-')), wavs = join(work, 'wav');
mkdirSync(wavs, { recursive: true });
console.log(`speaking ${stale.length} line(s) with ${script.voice.voice} (${script.voice.engine})`);
if (ENGINE === 'say') {
  for (const s of stale) {
    const aiff = join(work, `${s.id}.aiff`);
    const r = spawnSync('say', ['-v', script.voice.voice, '-o', aiff, s.say]);
    if (r.status) { console.error('✗ `say` failed: it is macOS only. Use Kokoro (the default) elsewhere.'); process.exit(1); }
    spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', aiff, join(wavs, `${s.id}.wav`)]);
  }
} else {
  const py = (process.env.VOICE_PYTHON || join(ROOT, '.venv', 'bin', 'python')).replace(/^~/, homedir());
  if (!existsSync(py)) { console.error(`✗ no Python with Kokoro at ${py}: set VOICE_PYTHON, or see engines/voice/README.md. For a quick draft, add --engine say.`); process.exit(1); }
  writeFileSync(join(work, 'lines.json'), JSON.stringify(stale.map((s) => ({ id: s.id, text: s.say }))));
  const r = spawnSync(py, [join(HERE, 'speak.py'), join(work, 'lines.json'), wavs, script.voice.voice, String(script.voice.speed)], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status) { console.error('✗ speaking failed'); process.exit(r.status || 1); }
}

/* the check: transcribe each take and compare it with its line, letters only */
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const below100 = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''));
const words = (n) => (n < 100 ? below100(n) : n < 1000 ? ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + below100(n % 100) : '') : words(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? ' ' + words(n % 1000) : ''));
const letters = (t) => t.toLowerCase().replace(/\b\d{1,4}\b/g, (n) => words(parseInt(n, 10))).replace(/[^a-z]+/g, '');
const cer = (ref, hyp) => {
  const a = letters(ref), b = letters(hyp), d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) { let prev = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; } }
  return d[b.length] / Math.max(1, a.length);
};
const MODEL = (process.env.WHISPER_MODEL || join(homedir(), '.cache', 'whisper', 'ggml-small.en.bin')).replace(/^~/, homedir());
const verify = !argv.includes('--no-verify') && existsSync(MODEL);
if (!argv.includes('--no-verify') && !verify) console.warn(`! no whisper model at ${MODEL}: the takes are not checked`);

mkdirSync(DIR, { recursive: true });
let drifted = 0;
for (const s of stale) {
  const wav = join(wavs, `${s.id}.wav`);
  const e = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-af', 'loudnorm=I=-18:TP=-1.5:LRA=9', '-ac', '1', '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '128k', mp3(s.id)]);
  if (e.status) { console.error(`✗ ${s.id}: ffmpeg failed`); process.exit(1); }
  const seconds = Math.round(parseFloat(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3(s.id)], { encoding: 'utf8' }).stdout) * 100) / 100;
  manifest.takes[s.id] = { hash: s.hash, seconds };
  let note = '';
  if (verify) {
    const w16 = join(work, `${s.id}-16k.wav`);
    spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-ar', '16000', w16]);
    const heard = spawnSync('whisper-cli', ['-m', MODEL, '-f', w16, '-nt', '-np'], { encoding: 'utf8' }).stdout.replace(/\s+/g, ' ').trim();
    const err = cer(s.say, heard);
    note = `  ${(err * 100).toFixed(0)}% off`;
    if (err > 0.1) { drifted++; note = `  ✗ letter error ${(err * 100).toFixed(0)}%\n       said:  ${s.say}\n       heard: ${heard}`; }
  }
  console.log(`${s.id.padEnd(14)} ${String(seconds).padStart(6)} s${note}`);
}
const ids = new Set(script.steps.map((s) => s.id));
for (const id of Object.keys(manifest.takes)) if (!ids.has(id)) delete manifest.takes[id];
for (const f of readdirSync(DIR)) if (f.endsWith('.mp3') && !ids.has(f.slice(0, -4))) rmSync(join(DIR, f));
manifest.voice = script.voice;
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
rmSync(work, { recursive: true, force: true });
console.log(`\n✓ ${stale.length} take(s) in ${DIR}`);
if (drifted) { console.error(`✗ ${drifted} take(s) differ from their line: listen, then change the words or "pronounce" and run again`); process.exit(1); }
