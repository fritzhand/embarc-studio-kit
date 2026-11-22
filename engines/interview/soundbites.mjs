#!/usr/bin/env node
/**
 * soundbites.mjs: the transcript as a numbered list, for picking soundbites.
 *
 *   node engines/interview/soundbites.mjs projects/<name>/transcript.json
 *   node engines/interview/soundbites.mjs projects/<name>/transcript.json --find "customers"
 *
 * Each line is a sentence id, its time in the recording, its length, and its words. A soundbite in cut.json is
 * one sentence ("from": "S4") or a run of them ("from": "S4", "to": "S6"). Good soundbites stand alone: they
 * make sense to someone who did not hear the question.
 */
import { readFileSync } from 'node:fs';

const [file, ...rest] = process.argv.slice(2);
if (!file) { console.error('usage: node engines/interview/soundbites.mjs <transcript.json> [--find words]'); process.exit(1); }
const t = JSON.parse(readFileSync(file, 'utf8'));
const find = rest.includes('--find') ? rest[rest.indexOf('--find') + 1].toLowerCase() : null;
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;
let shown = 0;
for (const s of t.sentences) {
  if (find && !s.text.toLowerCase().includes(find)) continue;
  console.log(`${s.id.padEnd(5)} ${mmss(s.start)}  ${(s.end - s.start).toFixed(1).padStart(5)} s  ${s.text}`);
  shown++;
}
console.log(`\n${shown} of ${t.sentences.length} sentences, ${mmss(t.duration || t.sentences.at(-1)?.end || 0)} in all. ${t.note || ''}`);
