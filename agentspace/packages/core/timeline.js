// Timeline: the ordered event log of one run with relative times (ms), for the clock, the Process Log,
// the scrub bar ticks and the caption. The picture itself comes from the Gource-style player.
export function createTimeline(inputEvents) {
  const events = [];
  const rel = [];
  const listeners = new Set();
  let t0 = null;
  const push = (ev) => {
    if (t0 == null) t0 = ev.ts;
    const t = Math.max(0, ev.ts - t0);
    if (events.length && t < rel[rel.length - 1]) throw new Error('events must be appended in time order');
    events.push(ev);
    rel.push(t);
  };
  (inputEvents || []).forEach(push);
  // index of the last event with rel <= t, or -1
  const lastAt = (t) => {
    let lo = 0; let hi = rel.length - 1; let ans = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (rel[mid] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return ans;
  };
  return {
    events,
    rel,
    listeners,
    get t0() { return t0; },
    get duration() { return rel.length ? rel[rel.length - 1] : 0; },
    append(ev) { push(ev); for (const f of listeners) f(ev); },
    indexAt: lastAt,
  };
}
