import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  parseJsonl, validateEvent, createTimeline, toGourceLines, createPlayer, createActionStream, resourcePath,
  gStringHash, gColourHash, gFileColour, gUserColour, inspect,
} from '../packages/core/index.js';
import { STEP } from '../packages/core/gource/sim.js';
import { buildFrame, view } from '../packages/core/gource/frame.js';

const runs = fs.readdirSync(new URL('../demo/runs/', import.meta.url)).filter((f) => f.endsWith('.jsonl'));
const load = (f) => parseJsonl(fs.readFileSync(new URL('../demo/runs/' + f, import.meta.url), 'utf8'));
const dur = (events) => (events[events.length - 1].ts - events[0].ts) / 1000;
// positions of everything on screen, to compare two simulation states
const snap = (s) => JSON.stringify({
  t: s.tick,
  d: s.dirs.filter((d) => !d.dead).map((d) => [d.path, d.x, d.y, d.r]),
  f: s.files.filter((f) => !f.dead && !f.hidden).map((f) => [f.path, f.x, f.y, f.elapsed]),
  u: s.users.filter((u) => !u.dead).map((u) => [u.id, u.x, u.y, u.pending.length, u.active.length]),
  c: [s.cam.x, s.cam.y, s.cam.z],
});

test('schema rejects malformed events', () => {
  assert.equal(validateEvent({ type: 'nope', run: 'r', ts: 1 }).ok, false);
  assert.equal(validateEvent({ type: 'tool.started', run: 'r', ts: 1, agent: 'a' }).ok, false);
  assert.equal(validateEvent({ type: 'task.started', run: 'r', ts: 'not a date' }).ok, false);
  assert.equal(validateEvent({ type: 'task.started', run: 'r', ts: '2026-10-06T10:00:00Z' }).ok, true);
  assert.equal(validateEvent({ type: 'workspace.scanned', run: 'r', ts: 1, agent: 'a', resource: 'repo' }).ok, false);
  assert.equal(validateEvent({ type: 'workspace.scanned', run: 'r', ts: 1, agent: 'a', resource: 'repo', paths: ['a.js', 'src/b.js'] }).ok, true);
  const { events, errors } = parseJsonl('{"type":"task.started","run":"r","ts":2}\nnot json\n{"type":"task.completed","run":"r","ts":1}\n');
  assert.equal(errors.length, 1);
  assert.deepEqual(events.map((e) => e.ts), [1, 2]);
});

test('colour hash follows Gource (seed 31, XOR multiplier, normalised)', () => {
  // by hand: 'js' -> 'j'(106)*(31^2=29) + 's'(115)*(31^1=30) = 3074 + 3450 = 6524
  assert.equal(gStringHash('js'), 6524);
  const c = gColourHash('js'); // (6524/7 % 255, 6524/3 % 255, 6524 % 255) = (167, 134, 149) normalised
  const l = Math.hypot(167, 134, 149);
  assert.deepEqual(c.map((v) => v.toFixed(6)), [167 / l, 134 / l, 149 / l].map((v) => v.toFixed(6)));
  assert.deepEqual(gFileColour('src/Makefile'), [1, 1, 1]);
  assert.deepEqual(gFileColour('a/b.js'), c);
  gUserColour('Coder').forEach((v) => assert.ok(v >= 0.36 && v <= 0.9));
});

test('events map to Gource actions on workspace paths', () => {
  assert.equal(resourcePath('https://socket.io/docs/v4/x?y#z', 'ws'), 'web/socket.io/docs/v4/x_z');
  assert.equal(resourcePath('src/a.js', 'socket.io'), 'socket.io/src/a.js');
  const S = createActionStream();
  const ev = (o) => Object.assign({ run: 'r', ts: 0 }, o);
  S.push(ev({ type: 'task.started', user: 'Ola' }), 0, 0);
  S.push(ev({ type: 'workspace.scanned', agent: 'research', resource: 'repo', paths: ['a.js', 'lib/b.ts'] }), 1, 1);
  S.push(ev({ type: 'file.modified', agent: 'coder', resource: 'lib/b.ts' }), 2, 2);
  S.push(ev({ type: 'file.created', agent: 'coder', resource: 'lib/c.ts' }), 3, 3);
  S.push(ev({ type: 'file.deleted', agent: 'coder', resource: 'a.js' }), 4, 4);
  S.push(ev({ type: 'test.failed', agent: 'tester', name: 'x' }), 5, 5);
  S.push(ev({ type: 'tool.started', agent: 'coder', tool: 'edit' }), 6, 6);
  assert.deepEqual(S.actions.map((a) => [a.user, a.path, a.kind]), [
    ['user', '/r/zadanie/opis.md', 'A'],
    ['research', '/r/repo/a.js', 'S'], ['research', '/r/repo/lib/b.ts', 'S'],
    ['coder', '/r/repo/lib/b.ts', 'M'], ['coder', '/r/repo/lib/c.ts', 'A'], ['coder', '/r/repo/a.js', 'D'],
    ['tester', '/r/testy/x', 'F'],
  ]);
  assert.equal(S.label('user'), 'Ola');
  assert.deepEqual(S.notes.map((n) => [n.kind, n.user, n.text]), [['tool', 'coder', 'edit']]);
});

test('files sit on Gource rings: centre, then 6, 9, 12 … per ring', () => {
  const P = createPlayer();
  const paths = Array.from({ length: 1 + 6 + 9 + 12 }, (_, i) => 'f' + i + '.txt');
  P.load([{ run: 'r', ts: 0, type: 'workspace.scanned', agent: 'a', resource: 'w', paths }]);
  const { s } = P.at(30);
  const d = s.dirs.find((x) => x.path === '/r/w/');
  const dist = d.files.map((fi) => Math.round(s.files[fi].dist));
  const ring = (r) => dist.filter((x) => x === r).length;
  assert.deepEqual([ring(0), ring(8), ring(16), ring(24)], [1, 6, 9, 12]);
  // radius from the area of visible files: sqrt(n · π·4²) · 1.5
  assert.ok(Math.abs(d.r - Math.sqrt(paths.length * 16 * Math.PI) * 1.5) < 1e-9);
});

test('directory tree only branches where paths diverge (Gource radix tree)', () => {
  const P = createPlayer();
  P.load([{ run: 'r', ts: 0, type: 'workspace.scanned', agent: 'a', resource: 'w', paths: ['a/b/c/x.js', 'a/b/d/y.js', 'z.md'] }]);
  const { s } = P.at(20);
  const live = s.dirs.filter((d) => !d.dead).map((d) => d.path).sort();
  assert.deepEqual(live, ['/r/w/', '/r/w/a/b/', '/r/w/a/b/c/', '/r/w/a/b/d/']);
  assert.equal(s.dirs[s.dirByPath['/r/w/a/b/']].token, 'a/b');
});

test('a large listing grows the tree gradually and the camera keeps it in frame', () => {
  const paths = Array.from({ length: 600 }, (_, i) => 'pkg' + (i % 12) + '/src/m' + (i % 7) + '/f' + i + '.js');
  const P = createPlayer({ aspect: 16 / 9 });
  P.load([
    { run: 'r', ts: 0, type: 'workspace.scanned', agent: 'research', resource: 'w', paths },
    { run: 'r', ts: 40000, type: 'task.completed' },
  ]);
  let prev = 0; let maxStep = 0; const perSec = [];
  for (let k = 1; k <= 30 * 60; k++) {
    const { s } = P.at(k * STEP);
    const vis = s.files.filter((f) => !f.hidden).length;
    maxStep = Math.max(maxStep, vis - prev); prev = vis;
    if (k % 60 === 0) perSec.push(vis);
    // the camera frames the tree: its bounds never leave a 1280×720 view
    if (s.dirBounds && k % 10 === 0) {
      const K = 360 / -s.cam.z; const b = s.dirBounds;
      assert.ok((b.x1 - b.x0) * K <= 1280 + 16 && (b.y1 - b.y0) * K <= 720 + 16, 'tree fits at ' + s.t.toFixed(2));
    }
  }
  assert.ok(maxStep <= 2, 'at most 2 files appear per step, got ' + maxStep);
  assert.equal(prev, 600);
  assert.ok(perSec.findIndex((v) => v === 600) >= 6, 'growth takes several seconds: ' + perSec.join(' '));
  // the scanning agent sweeps through the tree with a beam every ~0.35 s rather than one per file
  const acts = P.at(30).s.acts.length;
  assert.ok(acts > 10 && acts < 120, 'scan beams: ' + acts);
});

for (const f of runs) {
  test('demo run ' + f + ' parses cleanly, ends completed, simulates without NaN', () => {
    const { events, errors } = load(f);
    assert.equal(errors.length, 0);
    assert.equal(events[events.length - 1].type, 'task.completed');
    const P = createPlayer();
    P.load(events);
    const { s } = P.at(dur(events) + 2);
    assert.ok(s.files.some((x) => !x.hidden));
    for (const d of s.dirs) assert.ok(Number.isFinite(d.x + d.y + d.r), d.path);
    for (const u of s.users) assert.ok(Number.isFinite(u.x + u.y), u.id);
  });

  test('scrubbing is exact: any order of seeks gives the same state as one pass (' + f + ')', () => {
    const { events } = load(f);
    const D = dur(events);
    const A = createPlayer(); A.load(events);
    const ts = [D, D * 0.7, 1.2, D * 0.33, 0.05, D * 0.9];
    const seeks = ts.map((t) => snap(A.at(t).s));
    ts.forEach((t, i) => {
      const B = createPlayer(); B.load(events);
      assert.equal(seeks[i], snap(B.at(t).s), 'state differs at t=' + t);
    });
  });

  test('gource adapter writes valid custom-log lines (' + f + ')', () => {
    const { events } = load(f);
    const lines = toGourceLines(events);
    assert.ok(lines.length > 5);
    for (const l of lines) assert.match(l, /^\d+\|[^|]+\|[AMD]\|\/[^|]+$/);
  });
}

test('LIVE: appending events one by one equals loading them at once', () => {
  const { events } = load('repo-fix.jsonl');
  const part = events.slice(0, 60);
  const t = (part[part.length - 1].ts - part[0].ts) / 1000 + 1;
  const A = createPlayer(); A.load(part);
  const B = createPlayer(); B.load([]);
  for (const ev of part) { B.append(ev); B.at(Math.max(0, (ev.ts - part[0].ts) / 1000 - 0.3)); }
  assert.equal(snap(A.at(t).s), snap(B.at(t).s));
});

test('inspector tells what a file and an agent did', () => {
  const { events } = load('repo-fix.jsonl');
  const T = createTimeline(events);
  const P = createPlayer(); P.load(events);
  const D = dur(events);
  const mod = events.find((e) => e.type === 'file.modified');
  const file = P.actions().find((a) => a.ev === events.indexOf(mod)).path;
  const fi = inspect(P, T, 'file:' + file, D);
  assert.equal(fi.kind, 'file');
  assert.ok(fi.events.some((e) => e.type === 'file.modified'));
  const ui = inspect(P, T, 'user:coder', D);
  assert.equal(ui.label, 'Coder');
  assert.ok(ui.events.length > 3);
  assert.ok(STEP > 0);
});

test('long runs keep a bounded number of checkpoints and still scrub exactly', () => {
  // a 20-minute run: an agent touching files every few seconds
  const events = [{ run: 'r', ts: 0, type: 'task.started' }];
  for (let i = 1; i < 400; i++) events.push({ run: 'r', ts: i * 3000, type: 'file.modified', agent: 'coder', resource: 'src/m' + (i % 9) + '/f' + (i % 50) + '.js' });
  events.push({ run: 'r', ts: 1200000, type: 'task.completed' });
  const A = createPlayer(); A.load(events);
  A.bakeAhead(1200, 1e9);
  // 1 s for the last 30 s, every 10 s to 10 min back, then one a minute: about 30 + 57 + 10
  assert.ok(A.kept() <= 110, 'kept ' + A.kept());
  const far = snap(A.at(95.5).s);
  const B = createPlayer(); B.load(events);
  assert.equal(snap(B.at(95.5).s), far);
});

test('a frame description is finite and the tree fits any window shape without re-running', () => {
  const { events } = load('repo-fix.jsonl');
  const P = createPlayer({ aspect: 16 / 9 }); P.load(events);
  const { s, k } = P.at(40);
  for (const [W, H] of [[1280, 720], [390, 844], [800, 800]]) {
    const F = buildFrame(s, k, W, H, {});
    assert.ok(F.counts.files > 500 && F.counts.users > 0);
    for (const f of F.files) assert.ok(Number.isFinite(f.x + f.y + f.size + f.a));
    for (const e of F.edges) assert.ok(e.every(Number.isFinite));
    const V = view(s, k, W, H);
    const b = s.dirBounds;
    assert.ok(V.sx(b.x0) > -10 && V.sx(b.x1) < W + 10 && V.sy(b.y0) > -10 && V.sy(b.y1) < H + 10, W + 'x' + H);
  }
});

test('studio: who created whom, tasks, plan, typed code and terminal output come from the log', async () => {
  const { storyAt, patchLines } = await import('../packages/core/gource/story.js');
  const { events } = load('repo-fix.jsonl');
  const T = createTimeline(events);
  const P = createPlayer(); P.load(events);
  const paths = new Map();
  for (const a of P.actions()) { if (!paths.has(a.ev)) paths.set(a.ev, []); paths.get(a.ev).push(a.path); }
  const info = { label: (id) => P.label(id), colour: () => [1, 1, 1], pathsOfEv: (i) => paths.get(i) || [] };
  const at = (s) => storyAt(T, info, s * 1000);
  // team tree: Hermes created Research and Coder, Coder created Tester
  const team = at(80).agents.map((a) => a.id + ':' + a.depth);
  assert.deepEqual(team, ['hermes:0', 'research:1', 'coder:1', 'tester:2']);
  assert.equal(at(80).agents.find((a) => a.id === 'coder').task, 'Napraw timer pingTimeout');
  assert.equal(at(80).plan.cur, 2);
  assert.equal(at(170).plan.cur, at(170).plan.steps.length);
  // the fix is typed into socket.ts: partly at first, completely a few seconds later
  const w1 = at(78).windows.find((w) => w.kind === 'code');
  const w2 = at(82).windows.find((w) => w.kind === 'code');
  assert.ok(w1 && w1.typing && w1.typed > 0 && w1.typed < w1.chars, 'typing');
  assert.ok(w2 && !w2.typing && w2.typed === w2.chars && w2.add === 3 && w2.del === 1);
  // the first test run fails in the terminal, the second passes
  const t1 = at(110).windows.find((w) => w.kind === 'term');
  assert.ok(t1.fail && t1.lines.some((l) => /failing/.test(l.s)));
  const t2 = at(140).windows.find((w) => w.kind === 'term');
  assert.ok(!t2.fail && t2.lines.some((l) => /4 passing/.test(l.s)));
  // a new folder is announced, messages fly and are said out loud
  assert.ok(at(91).tags.some((g) => /regression\//.test(g.text)));
  assert.ok(at(57.3).packets.some((m) => m.from === 'hermes' && m.to === 'coder' && m.task));
  const b = at(57.5).bubbles.find((x) => x.who === 'hermes');
  assert.ok(b && b.shown > 0 && b.shown < b.text.length);
  // unified-style patch lines get new-file line numbers
  assert.deepEqual(patchLines(' a\n-b\n+c\n d', 10).map((l) => [l.t, l.n]), [[' ', 10], ['-', null], ['+', 11], [' ', 12]]);
});
