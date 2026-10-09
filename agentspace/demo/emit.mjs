#!/usr/bin/env node
// Streams a recorded run to the server in real time, as a live producer would (Hermes / Jarvis Event Bus).
//   node demo/emit.mjs demo/runs/repo-fix.jsonl [--speed 1] [--url http://127.0.0.1:4777] [--run new-id]
import fs from 'node:fs';
import { parseJsonl } from '../packages/core/index.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const file = args.find((a) => !a.startsWith('--') && a.endsWith('.jsonl')) || 'demo/runs/repo-fix.jsonl';
const speed = Number(opt('--speed', '1'));
const url = opt('--url', 'http://127.0.0.1:4777');
const { events } = parseJsonl(fs.readFileSync(file, 'utf8'));
const run = opt('--run', events[0].run + '-live-' + Date.now().toString(36));
const start = Date.now();
const t0 = events[0].ts;
for (const ev of events) {
  const due = start + (ev.ts - t0) / speed;
  const wait = due - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const out = Object.assign({}, ev, { run, ts: Date.now() });
  const res = await fetch(url + '/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(out) });
  if (!res.ok && res.status !== 207) console.error('server said', res.status);
  process.stdout.write('.');
}
console.log('\nsent', events.length, 'events as run', run);
