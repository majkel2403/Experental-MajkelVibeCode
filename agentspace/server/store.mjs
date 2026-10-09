// Event Store: one append-only JSONL file per run (data/runs/<run>.jsonl) + in-memory index.
import fs from 'node:fs';
import path from 'node:path';
import { validateEvent, parseJsonl } from '../packages/core/index.js';

export function createStore(dir, seedDirs) {
  fs.mkdirSync(dir, { recursive: true });
  const runs = new Map(); // run -> { events: [], file, source }
  const load = (file, source) => {
    const { events } = parseJsonl(fs.readFileSync(file, 'utf8'));
    if (!events.length) return;
    const run = events[0].run;
    runs.set(run, { events, file, source, updatedAt: fs.statSync(file).mtimeMs });
  };
  for (const d of seedDirs || []) if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) if (f.endsWith('.jsonl')) load(path.join(d, f), 'demo');
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.jsonl')) load(path.join(dir, f), 'recorded');
  // file name for a run: readable, plus a short hash when characters had to be replaced, so 'a/b' and 'a_b'
  // never share a file
  const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const safe = (run) => { const r = String(run); const c = r.replace(/[^\w.-]+/g, '_').slice(0, 80); return c === r ? c : c + '-' + hash(r); };
  // a run that has not sent anything for this long is shown as interrupted, not live
  const STALE_MS = 10 * 60 * 1000;
  return {
    list() {
      return [...runs.entries()].map(([run, r]) => ({ run, source: r.source, events: r.events.length, startedAt: r.events[0].ts, endedAt: r.events[r.events.length - 1].ts, title: (r.events.find((e) => e.type === 'task.started') || {}).text || run, status: r.events.some((e) => e.type === 'task.completed') ? 'done' : r.events.some((e) => e.type === 'task.failed') ? 'error' : r.source === 'demo' || Date.now() - r.updatedAt > STALE_MS ? 'stale' : 'running' }));
    },
    get(run) { return runs.get(run) || null; },
    /** validate + append; returns { ok, event, error } */
    append(raw) {
      const r = validateEvent(raw);
      if (!r.ok) return r;
      const ev = r.event;
      let rec = runs.get(ev.run);
      if (!rec || rec.source === 'demo') {
        if (rec) console.warn('run "' + ev.run + '" is a demo run id: recording it shadows the demo until restart');
        rec = { events: [], file: path.join(dir, safe(ev.run) + '.jsonl'), source: 'recorded', updatedAt: Date.now() };
        runs.set(ev.run, rec);
      }
      const lastTs = rec.events.length ? rec.events[rec.events.length - 1].ts : -Infinity;
      if (ev.ts < lastTs) ev.ts = lastTs; // keep each run monotonic for live viewers
      rec.events.push(ev);
      rec.updatedAt = Date.now();
      fs.appendFileSync(rec.file, JSON.stringify(ev) + '\n');
      return { ok: true, event: ev };
    },
  };
}
