#!/usr/bin/env node
// Motion report: steps a run tick by tick and measures what a viewer perceives as jumps.
//   node tools/motion-report.mjs [--focus] [run ...]   (default: every demo run; --focus: camera follows the work)
// Prints growth per second, camera zoom speed, avatar speed jumps/teleports, beam spacing; exits 1 on a failed criterion.
import fs from 'node:fs';
import path from 'node:path';
import { createPlayer } from '../packages/core/gource/player.js';
import { STEP } from '../packages/core/gource/sim.js';
import { view } from '../packages/core/gource/frame.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FOCUS = process.argv.includes('--focus');
const args = process.argv.slice(2).filter((a) => a !== '--focus');
const runs = args.length ? args : fs.readdirSync(path.join(ROOT, 'demo/runs')).map((f) => f.replace(/\.jsonl$/, ''));
const LIMIT = { growthShare: 0.12, filesPerTick: 4, zoomPerSec: 0.35, speedJump: 150, teleport: 20, bursts: 0, clipped: 0, fill: 0.45 };

let failed = false;
for (const run of runs) {
  const events = fs.readFileSync(path.join(ROOT, 'demo/runs', run + '.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const P = createPlayer({ aspect: 16 / 9, focus: FOCUS });
  P.load(events);
  const dur = (events[events.length - 1].ts - events[0].ts) / 1000 + 4;
  const n = Math.ceil(dur / STEP);
  const visAt = [];
  let maxPerTick = 0; let prevVis = 0;
  let maxZoom = 0; const zHist = [];
  let maxJump = 0; let maxTele = 0;
  let clipped = 0; let fill = 0; let clippedResized = 0;
  const vel = {}; const lastAct = {}; const gaps = {};
  for (let k = 1; k <= n; k++) {
    const { s } = P.at(k * STEP);
    let vis = 0;
    for (const f of s.files) if (!f.dead && !f.hidden) vis++;
    maxPerTick = Math.max(maxPerTick, vis - prevVis);
    prevVis = vis;
    if (k % 60 === 0) visAt.push(vis);
    zHist.push(-s.cam.z);
    // framing at 1280×720: the tree must stay on screen, and fill the frame once it has grown
    const b = s.dirBounds;
    if (b) {
      const V = view(s, 1, 1280, 720);
      const x0 = V.sx(b.x0); const x1 = V.sx(b.x1); const y0 = V.sy(b.y0); const y1 = V.sy(b.y1);
      if (x0 < -8 || y0 < -8 || x1 > 1288 || y1 > 728) clipped++;
      fill = Math.max((x1 - x0) / 1280, (y1 - y0) / 720);
      // the same simulation shown after the window was resized to a phone shape (no re-run)
      const R = view(s, 1, 390, 650);
      if (R.sx(b.x0) < -8 || R.sy(b.y0) < -8 || R.sx(b.x1) > 398 || R.sy(b.y1) > 658) clippedResized++;
    }
    if (zHist.length > 60) {
      const z0 = zHist[zHist.length - 61]; const z1 = zHist[zHist.length - 1];
      maxZoom = Math.max(maxZoom, Math.abs(z1 - z0) / Math.max(z0, z1));
    }
    for (const u of s.users) {
      if (u.dead) { delete vel[u.id]; continue; }
      const d = Math.hypot(u.x - u.px, u.y - u.py);
      if (u.elapsed > 0.1) maxTele = Math.max(maxTele, d);
      const v = [(u.x - u.px) / STEP, (u.y - u.py) / STEP];
      const h = vel[u.id] || (vel[u.id] = []);
      h.push(v);
      if (h.length > 6) {
        h.shift();
        maxJump = Math.max(maxJump, Math.hypot(v[0] - h[0][0], v[1] - h[0][1]));
      }
      for (const ai of u.active) {
        const a = s.acts[ai];
        if (a && a.started === undefined) {
          a.started = s.t;
          if (lastAct[u.id] != null) (gaps[u.id] = gaps[u.id] || []).push(s.t - lastAct[u.id]);
          lastAct[u.id] = s.t;
        }
      }
    }
  }
  // the same run on a phone-shaped view (390×650): the tree must stay on screen there too
  const PM = createPlayer({ aspect: 0.6, focus: FOCUS });
  PM.load(events);
  let clippedPortrait = 0;
  for (let k = 1; k <= n; k += 2) {
    const { s } = PM.at(k * STEP);
    const b = s.dirBounds;
    if (!b) continue;
    const V = view(s, 1, 390, 650);
    if (V.sx(b.x0) < -8 || V.sy(b.y0) < -8 || V.sx(b.x1) > 398 || V.sy(b.y1) > 658) clippedPortrait++;
  }
  const final = visAt.length ? Math.max(...visAt, prevVis) : prevVis;
  let maxShare = 0; let p = 0;
  for (const v of visAt) { maxShare = Math.max(maxShare, (v - p) / Math.max(1, final)); p = v; }
  let cvMax = 0; let bursts = 0;
  for (const id in gaps) bursts += gaps[id].filter((x) => x < 0.1).length;
  for (const id in gaps) {
    const g = gaps[id].filter((x) => x < 2);
    if (g.length < 5) continue;
    const m = g.reduce((a, b) => a + b, 0) / g.length;
    const sd = Math.sqrt(g.reduce((a, b) => a + (b - m) ** 2, 0) / g.length);
    cvMax = Math.max(cvMax, sd / m);
  }
  const rows = [
    ['wzrost: max udział drzewa w 1 s', maxShare, LIMIT.growthShare, (x) => (x * 100).toFixed(1) + '%'],
    ['wzrost: max plików w 1 kroku', maxPerTick, LIMIT.filesPerTick, (x) => String(x)],
    ['kamera: max zmiana zoomu / s', maxZoom, LIMIT.zoomPerSec, (x) => (x * 100).toFixed(1) + '%'],
    ['awatary: max skok prędkości / 0,1 s', maxJump, LIMIT.speedJump, (x) => x.toFixed(0)],
    ['awatary: max przesunięcie w kroku', maxTele, LIMIT.teleport, (x) => x.toFixed(1)],
    ['promienie: salwy (odstęp < 0,1 s)', bursts, LIMIT.bursts, (x) => String(x)],
    ['kadr: kroki z drzewem poza ekranem', clipped, LIMIT.clipped, (x) => String(x)],
    ['kadr (telefon): kroki poza ekranem', clippedPortrait, LIMIT.clipped, (x) => String(x)],
    ['kadr po zmianie rozmiaru: poza ekranem', clippedResized, LIMIT.clipped, (x) => String(x)],
    ['kadr: drzewo zajmuje na końcu', 1 - fill, 1 - LIMIT.fill, (x) => ((1 - x) * 100).toFixed(0) + '% kadru'],
  ];
  console.log('\n== ' + run + (FOCUS ? ' [kamera śledzi pracę]' : '') + ' (' + final + ' plików, ' + dur.toFixed(0) + ' s)');
  // following the work frames a part of the tree on purpose: the whole-tree framing rows do not apply
  for (const [name, v, lim, fmt] of FOCUS ? rows.filter((r) => !r[0].startsWith('kadr')) : rows) {
    const ok = v <= lim;
    if (!ok) failed = true;
    console.log((ok ? '  ok   ' : '  FAIL ') + name.padEnd(38) + fmt(v).padStart(8) + '  (limit ' + fmt(lim) + ')');
  }
  console.log('  info: max CV odstępów promieni ' + cvMax.toFixed(2));
  console.log('  krzywa (pliki/s): ' + visAt.join(' '));
}
process.exit(failed ? 1 : 0);
