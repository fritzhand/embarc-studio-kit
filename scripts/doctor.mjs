#!/usr/bin/env node
/* doctor.mjs: is everything the engines need installed? Run it first, and whenever something fails. */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromePath } from '../engines/cards/render.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ok = (cmd, args) => { try { return spawnSync(cmd, args, { encoding: 'utf8' }).status === 0; } catch { return false; } };
const model = (process.env.WHISPER_MODEL || join(homedir(), '.cache', 'whisper', 'ggml-small.en.bin')).replace(/^~/, homedir());
const py = (process.env.VOICE_PYTHON || join(ROOT, '.venv', 'bin', 'python')).replace(/^~/, homedir());
let chrome = false; try { chrome = !!chromePath(); } catch {}
const rows = [
  ['Node 22+', Number(process.versions.node.split('.')[0]) >= 22, 'everything', 'https://nodejs.org'],
  ['ffmpeg', ok('ffmpeg', ['-version']), 'cut, voice, transcribe', 'brew install ffmpeg'],
  ['Python 3 with numpy', ok('python3', ['-c', 'import numpy']), 'cut', 'pip3 install numpy'],
  ['Chrome or Chromium', chrome, 'cards and captions', 'install Google Chrome, or set CHROME_PATH'],
  ['whisper-cli', ok('whisper-cli', ['--help']), 'transcribe; checks voice takes', 'brew install whisper-cpp'],
  ['whisper model', existsSync(model), 'transcribe', 'engines/interview/README.md, "Set up"'],
  ['segno (optional)', ok('python3', ['-c', 'import segno']), 'QR codes on cards', 'pip3 install segno'],
  ['Kokoro (optional)', existsSync(py) && ok(py, ['-c', 'import kokoro, soundfile']), 'voiceover in the open-source voice', 'engines/voice/README.md (or use --engine say for drafts)'],
  ['music', existsSync(join(ROOT, 'music', 'inspired-kevin-macleod.mp3')), 'the example soundtrack', 'npm run music'],
  ['HyperFrames (optional)', existsSync(join(ROOT, 'node_modules', '.bin', 'hyperframes')), 'animated cards ("motion": true)', 'downloads on first use; engines/motion/README.md'],
  ['MCP server (optional)', existsSync(join(ROOT, 'node_modules', '@modelcontextprotocol', 'sdk')), 'the engines as tools for Claude Desktop and others', 'npm install, then mcp/README.md'],
];
let bad = 0;
for (const [name, pass, for_, fix] of rows) {
  const optional = name.includes('optional') || name === 'music';
  if (!pass && !optional) bad++;
  console.log(`${pass ? '✓' : optional ? '·' : '✗'} ${name.padEnd(22)} ${for_.padEnd(38)} ${pass ? '' : `→ ${fix}`}`);
}
console.log(bad ? `\n${bad} missing. Install them, then run npm run doctor again.` : '\nReady. Try npm run example.');
process.exit(bad ? 1 : 0);
