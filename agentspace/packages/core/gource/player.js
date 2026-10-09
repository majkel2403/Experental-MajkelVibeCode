// Player: event log -> action stream -> simulation, with checkpoints so any time can be shown exactly
// (scrubbing backwards restores the nearest earlier checkpoint and steps forward).
//   const P = createPlayer({ aspect }); P.load(events) / P.append(event); P.at(seconds) -> { s, k }
import { createActionStream } from './actions.js';
import { createSim, step, STEP } from './sim.js';

const EVERY = 60; // ticks between checkpoints (1 s)
// memory stays bounded on long (LIVE) runs: every second for the last 30 s, every 10 s up to 10 min back,
// then one a minute; a seek further back re-simulates at most a minute from the nearest kept state
const RECENT = 30;
const MID = 600;
const clone = typeof structuredClone === 'function' ? structuredClone : (o) => JSON.parse(JSON.stringify(o));

export function createPlayer(opts) {
  const P = { aspect: (opts && opts.aspect) || 16 / 9, autoRotate: !(opts && opts.autoRotate === false), focus: !!(opts && opts.focus), events: [], t0: null, stream: null, cps: [], cur: null, bake: null };
  const ctx = () => ({ actions: P.stream.actions, notes: P.stream.notes, label: P.stream.label, parent: P.stream.parent });
  let C = null;

  function reset() {
    P.stream = createActionStream();
    const s0 = createSim({ aspect: P.aspect, autoRotate: P.autoRotate, focus: P.focus });
    P.cps = [clone(s0)];
    P.cur = s0;
    P.bake = null;
    C = ctx();
  }
  reset();

  const rel = (ev) => (ev.ts - P.t0) / 1000;
  P.load = (events) => {
    P.events = events.slice();
    P.t0 = events.length ? events[0].ts : null;
    reset();
    P.events.forEach((ev, i) => P.stream.push(ev, rel(ev), i));
  };
  // LIVE: add one event (timestamps are monotonic from the server)
  P.append = (ev) => {
    if (P.t0 == null) P.t0 = ev.ts;
    const i = P.events.length;
    P.events.push(ev);
    const t = rel(ev);
    P.stream.push(ev, t, i);
    // states after this event's time no longer hold: drop them and rewind if needed
    const keep = Math.floor((t - 1e-9) / (EVERY * STEP));
    if (P.cps.length > keep + 1) P.cps.length = Math.max(1, keep + 1);
    while (!P.cps[P.cps.length - 1]) P.cps.length--;
    if (P.cur.t >= t - 1e-9) P.cur = null;
    if (P.bake && P.bake.t >= t - 1e-9) P.bake = null;
  };
  P.setAspect = (a) => {
    // framing adapts at draw time; only the automatic rotation depends on landscape vs portrait, so the history
    // is re-run only when the orientation flips and rotation is on
    if (Math.abs(a - P.aspect) / P.aspect < 0.04) return false;
    const flip = (a > 1) !== (P.aspect > 1);
    P.aspect = a;
    if (!flip || !P.autoRotate) return false;
    const ev = P.events;
    P.load(ev);
    return true;
  };

  function thin(k) {
    const a = k - RECENT - 1; const b = k - MID - 1;
    if (a > 0 && a % 10 !== 0) P.cps[a] = null;
    if (b > 0 && b % 60 !== 0) P.cps[b] = null;
  }
  // nearest kept checkpoint at or before index k
  const kept = (k) => { while (k > 0 && !P.cps[k]) k--; return k; };
  P.kept = () => P.cps.filter(Boolean).length;
  function advance(s, n) {
    while (s.tick < n) {
      step(s, C);
      if (s.tick % EVERY === 0) {
        const k = s.tick / EVERY;
        if (!P.cps[k] && P.cps.length === k) { P.cps.push(clone(s)); thin(k); }
      }
    }
  }
  // state at time t (seconds); k = fraction towards the next step for smooth drawing
  P.at = (t) => {
    const n = Math.max(0, Math.floor(t / STEP + 1e-6));
    let s = P.cur;
    if (!s || s.tick > n || n - s.tick > EVERY * 2) {
      const k = kept(Math.min(Math.floor(n / EVERY), P.cps.length - 1));
      if (!s || s.tick > n || P.cps[k].tick > s.tick) s = clone(P.cps[k]);
    }
    advance(s, n);
    P.cur = s;
    return { s, k: Math.max(0, Math.min(1, t / STEP - n)) };
  };
  // fill checkpoints ahead of time within a time budget (ms); returns true when everything up to `until` is baked
  P.bakeAhead = (until, budgetMs) => {
    const n = Math.floor(until / STEP);
    const last = (P.cps.length - 1) * EVERY;
    if (last >= n) return true;
    const t0 = Date.now();
    let s = P.bake && P.bake.tick >= last ? P.bake : clone(P.cps[P.cps.length - 1]);
    while (s.tick < n && Date.now() - t0 < budgetMs) advance(s, Math.min(n, s.tick + 10));
    P.bake = s;
    return s.tick >= n;
  };
  P.actions = () => P.stream.actions;
  P.label = (id) => P.stream.label(id);
  return P;
}
