#!/usr/bin/env node
// Convert a Neural Workflow event log (JSONL) into a log for the real Gource (custom format).
//   node adapters/to-gource.mjs demo/runs/repo-fix.jsonl > repo-fix.gource.log
//   gource --log-format custom --seconds-per-day 864 repo-fix.gource.log       (time ×100, 1 s = 1 s)
//   --scale N   multiply run time by N (default 100; Gource timestamps are whole seconds)
// Live:  tail -n +1 -f data/runs/<run>.jsonl | node adapters/to-gource.mjs --stream | gource --log-format custom --realtime -
import fs from 'node:fs';
import readline from 'node:readline';
import { parseJsonl, validateEvent, toGourceLines, createActionStream, toGourceLog } from '../packages/core/index.js';

const args = process.argv.slice(2);
const si = args.indexOf('--scale');
const scale = si >= 0 ? Number(args[si + 1]) : null;
if (args.includes('--stream')) {
  // real time: one second of the run is one second for Gource (--realtime)
  const S = createActionStream();
  let t0 = null;
  let printed = 0;
  let n = 0;
  readline.createInterface({ input: process.stdin }).on('line', (line) => {
    if (!line.trim()) return;
    let raw;
    try { raw = JSON.parse(line); } catch (e) { return; }
    const r = validateEvent(raw);
    if (!r.ok) return;
    if (t0 == null) t0 = r.event.ts;
    S.push(r.event, (r.event.ts - t0) / 1000, n++);
    const lines = toGourceLog(S, Math.floor(t0 / 1000), scale || 1);
    for (; printed < lines.length; printed++) process.stdout.write(lines[printed] + '\n');
  });
} else {
  const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--scale');
  if (!file) { console.error('usage: to-gource.mjs <run.jsonl> [--scale N] | --stream'); process.exit(2); }
  const { events, errors } = parseJsonl(fs.readFileSync(file, 'utf8'));
  errors.forEach((e) => console.error('line ' + e.line + ': ' + e.error));
  process.stdout.write(toGourceLines(events, scale || 100).join('\n') + '\n');
}
