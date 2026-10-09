/* JEV core — shared runtime for every module. Exposes window.JEV. Loaded after engine.js, before modules. */
(function () {
  'use strict';
  const J = (window.JEV = {});
  const E = window.JEVEngine;

  /* ---------- tiny utils ---------- */
  J.$ = (s, r) => (r || document).querySelector(s);
  J.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  J.TAU = Math.PI * 2;
  J.clamp = E.clamp;
  J.lerp = (a, b, t) => a + (b - a) * t;
  J.rnd = (a, b) => (b === undefined ? Math.random() * (a === undefined ? 1 : a) : a + Math.random() * (b - a));
  J.ri = (a, b) => Math.floor(J.rnd(a, b + 1));
  J.pick = (a) => a[(Math.random() * a.length) | 0];
  J.gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(J.TAU * v); };
  J.rng = (seed) => { let a = seed | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  /** number → "1,234.50"; one cached Intl.NumberFormat per digit count (toLocaleString rebuilt a formatter on every call: ~27x slower, ~100 calls/s page-wide) */
  const NF = [];
  J.fmt = (n, d) => { d = d > 0 ? Math.min(20, d | 0) : 0; return (NF[d] || (NF[d] = new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }))).format(n); };
  J.usd = (n, d) => (n < 0 ? '-$' : '$') + J.fmt(Math.abs(n), d || 0);
  J.sgn = (n, d) => (n >= 0 ? '+' : '-') + J.fmt(Math.abs(n), d == null ? 1 : d);
  /** device-pixel ratio used by every canvas: ≤ 2, and lowered (never below 1) only when a viewport-sized canvas would exceed the backing-store budget (~8.4 MP: 1920×1080@2x, 1440×900@2x are untouched) */
  J.DPR = Math.max(1, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(8.4e6 / Math.max(1, window.innerWidth * window.innerHeight))));
  J.reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  J.narrow = () => window.innerWidth < 700;
  J.C = { pink: '#ff2e6e', pink2: '#ff7ab3', green: '#2ee6a6', blue: '#4d8dff', amber: '#ffc13d', violet: '#a66bff', orange: '#ff8a3d', cyan: '#3be0ff', red: '#ff4d5e', ink: '#f4eef6', mut: '#8d8499', dim: '#837a8f', bg: '#05030a' };
  J.rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; };

  /* ---------- event bus: 'decision' · 'tick' · 'kill' · 'floor' ---------- */
  const L = {};
  J.bus = {
    on(n, f) { (L[n] || (L[n] = [])).push(f); return () => J.bus.off(n, f); },
    off(n, f) { const a = L[n]; if (a) { const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); } },
    emit(n, d) { (L[n] || []).slice().forEach((f) => { try { f(d); } catch (e) { console.error('[bus:' + n + ']', e); } }); },
  };

  /* ---------- pointer ---------- */
  J.pointer = { x: -9999, y: -9999, nx: 0, ny: 0, down: false };
  window.addEventListener('pointermove', (e) => {
    const p = J.pointer; p.x = e.clientX; p.y = e.clientY; p.nx = (e.clientX / innerWidth) * 2 - 1; p.ny = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });
  window.addEventListener('pointerdown', () => (J.pointer.down = true), { passive: true });
  window.addEventListener('pointerup', () => (J.pointer.down = false), { passive: true });
  /** pointer position relative to an element's top-left (CSS px); x/y are -9999 when far away */
  J.rel = (el) => { const r = el.getBoundingClientRect(); return { x: J.pointer.x - r.left, y: J.pointer.y - r.top, w: r.width, h: r.height }; };

  /* ---------- frame loop: J.task(el, fn(t,dt)) runs only while `el` is on screen ---------- */
  const tasks = new Set();
  let raf = 0;
  /** (re)arm the frame loop; it disarms itself when no task is visible (footer, hidden tab…) so the main thread can sleep */
  const wake = () => { if (!raf) raf = requestAnimationFrame(frame); };
  const io = new IntersectionObserver((es) => {
    let on = false;
    for (const e of es) { const ks = e.target.__jevTasks || []; for (const k of ks) k.vis = e.isIntersecting; if (e.isIntersecting && ks.length) on = true; }
    if (on) wake();
  }, { rootMargin: '160px 0px' });
  J.task = (el, fn) => {
    const k = { el, fn, vis: !el, n: 0 };
    if (el) { (el.__jevTasks || (el.__jevTasks = [])).push(k); io.observe(el); }
    tasks.add(k); if (k.vis) wake();
    return { stop() { tasks.delete(k); } };
  };
  J.time = 0;
  let last = 0;
  function frame(ms) {
    raf = 0;
    const t = ms / 1000, dt = Math.min(0.05, t - last || 0.016);
    last = t; J.time = t;
    let busy = false;
    for (const k of tasks) {
      if (!k.vis) continue;
      if (J.reduce && k.n >= 3) continue; // reduced motion: render a few frames then freeze
      busy = true; k.n++;
      try { k.fn(t, dt); k.err = 0; } catch (e) { console.error('[task]', e); if ((k.err = (k.err || 0) + 1) >= 5) tasks.delete(k); } // drop a task only after 5 failures in a row
    }
    if (busy) wake();
  }
  wake();

  /* ---------- off-screen pause: sections / cards / stages far outside the viewport get .is-off → base.css pauses their CSS animations ---------- */
  /* (every running CSS animation costs a style invalidation per frame whether or not it is visible; ~220 of them run on this page) */
  const OFF_SEL = 'body > section, body > footer, main > section, .card, [class*="-stage"]';
  const offIo = 'IntersectionObserver' in window ? new IntersectionObserver((es) => {
    for (const e of es) e.target.classList.toggle('is-off', !e.isIntersecting);
  }, { rootMargin: '200px 0px' }) : null;
  const pauseOffscreen = () => { if (offIo) document.querySelectorAll(OFF_SEL).forEach((el) => offIo.observe(el)); };

  /* ---------- canvas helpers ---------- */
  /**
   * size a canvas' backing store to its CSS box × DPR; returns {g, W, H, dpr} in CSS px with the transform applied.
   * Measures the LAYOUT box (clientWidth/Height), not getBoundingClientRect: a canvas inside a `.rv` reveal is mid-scale(.985) when first fitted,
   * and ResizeObserver never fires when that transform ends, so the rect would leave the backing store ~1.5% small for good.
   * Optional 2nd arg (number = dpr cap, or {dpr, maxPx}) or data-dpr / data-maxpx on the canvas: cap the ratio for glow-only canvases
   * (e.g. data-dpr="1.5"), or the backing-store pixel budget. A capped canvas must draw through the returned `g` (or use the returned `dpr`), never J.DPR.
   */
  J.fit = (c, o) => {
    let cw = c.clientWidth, ch = c.clientHeight;
    if (!cw || !ch) { const r = c.getBoundingClientRect(); cw = r.width; ch = r.height; } // inline / detached canvas
    const W = Math.max(1, Math.round(cw)), H = Math.max(1, Math.round(ch));
    if (typeof o === 'number') o = { dpr: o };
    const ds = c.dataset || {};
    let dpr = J.DPR;
    const cap = (o && o.dpr) || +ds.dpr; if (cap > 0) dpr = Math.min(dpr, cap);
    const px = (o && o.maxPx) || +ds.maxpx; if (px > 0) dpr = Math.min(dpr, Math.max(1, Math.sqrt(px / (W * H))));
    dpr = Math.min(dpr, 8192 / Math.max(W, H)); // hard side limit (older mobile browsers refuse bigger canvases)
    const w = Math.max(1, Math.round(W * dpr)), h = Math.max(1, Math.round(H * dpr));
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const g = c.getContext('2d');
    g.setTransform(w / W, 0, 0, h / H, 0, 0);
    return { g, W, H, dpr: w / W };
  };
  /** call cb(rect) now and whenever el resizes (coalesced to one rAF); also once more when an enclosing `.rv` reveal finishes (its scale() transform changes the rect without a resize) */
  J.watch = (el, cb) => {
    let raf = 0;
    const run = () => { raf = 0; cb(el.getBoundingClientRect()); };
    const kick = () => { if (!raf) raf = requestAnimationFrame(run); };
    const ro = new ResizeObserver(kick);
    ro.observe(el); run();
    if (!J.reduce) {
      for (let a = el.closest('.rv'); a; a = a.parentElement && a.parentElement.closest('.rv')) {
        if (a.classList.contains('fx-done') || (a.classList.contains('in') && getComputedStyle(a).transform === 'none')) continue;
        const done = (e) => { if (e.target !== a || e.propertyName !== 'transform') return; a.removeEventListener('transitionend', done); kick(); };
        a.addEventListener('transitionend', done);
      }
    }
    return ro;
  };
  J.onView = (el, cb, o) => {
    o = o || {};
    const i2 = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { cb(e); if (o.once !== false) i2.disconnect(); } }), { threshold: o.threshold == null ? 0.15 : o.threshold, rootMargin: o.rootMargin || '0px' });
    i2.observe(el); return i2;
  };

  /* ---------- text fx ---------- */
  J.countTo = (el, to, o) => {
    o = o || {}; const from = o.from || 0, dur = (o.dur || 1400) / (J.reduce ? 1000 : 1), f = o.fmt || ((v) => J.fmt(Math.round(v)));
    const t0 = performance.now();
    const step = (now) => { const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = f(from + (to - from) * e); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
  const SC = '▓▒░<>/\\|—_+*#@%&01';
  J.scramble = (el, text, ms) => {
    text = text == null ? el.textContent : text; ms = (ms || 900) / (J.reduce ? 1000 : 1);
    const t0 = performance.now(), n = text.length;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / ms); let s = '';
      for (let i = 0; i < n; i++) { const c = text[i]; s += c === ' ' || i < p * n * 1.15 - 2 ? c : SC[(Math.random() * SC.length) | 0]; }
      el.textContent = s; if (p < 1) requestAnimationFrame(step); else el.textContent = text;
    };
    requestAnimationFrame(step);
  };

  /* ---------- global state, rules, kill switch ---------- */
  J.RULES = E.RULES; J.ACTIONS = E.ACTIONS; J.SIZES = E.SIZES; J.STATE_KEYS = E.STATE_KEYS;
  const S = (J.S = { killed: false, floor: E.RULES.floor, count: 1892, cost: 0.046, ms: [3.1, 3.4, 2.9, 3.2, 3.6], counts: { choice: 1934, flag: 1102, score: 600 }, dest: { execute: 0, review: 0, skip: 0 } });
  J.setFloor = (v) => { if (!isFinite(+v) || v === null || v === '') return; S.floor = J.clamp(+v, 0.5, 0.99); E.RULES.floor = S.floor; J.bus.emit('floor', S.floor); hud(); };
  J.setKilled = (v) => { S.killed = !!v; document.body.classList.toggle('killed', S.killed); J.bus.emit('kill', S.killed); hud(); };

  /* ---------- shared catalogues (modules read, never mutate) ---------- */
  /** ten builds — all are the same decision layer asking typed questions (choice | score | flag) */
  J.BUILDS = [
    { key: 'entry', name: 'entry gate', tag: 'ENTER', col: 'pink', prim: 'choice', k1: 'picks', v1: 'buy · sell · hold', ms: 3.2 },
    { key: 'sizer', name: 'position sizer', tag: 'SIZE', col: 'gray', prim: 'score', k1: 'picks', v1: '0.5% → 4%', ms: 2.8 },
    { key: 'guard', name: 'risk guard', tag: 'RISK', col: 'pink', prim: 'flag', k1: 'asks', v1: 'risk_ok?', ms: 2.1 },
    { key: 'router', name: 'venue router', tag: 'ROUTE', col: 'gray', prim: 'choice', k1: 'picks', v1: 'which venue', ms: 4.4 },
    { key: 'exit', name: 'exit manager', tag: 'EXIT', col: 'pink', prim: 'choice', k1: 'picks', v1: 'close · hold', ms: 3.6 },
    { key: 'funding', name: 'funding carry', tag: 'CARRY', col: 'gray', prim: 'score', k1: 'scores', v1: 'basis · funding', ms: 5.1 },
    { key: 'news', name: 'headline filter', tag: 'NEWS', col: 'pink', prim: 'flag', k1: 'asks', v1: 'trade or ignore', ms: 6.3 },
    { key: 'mm', name: 'quote skew', tag: 'MAKER', col: 'gray', prim: 'score', k1: 'scores', v1: 'widen · tighten', ms: 2.6 },
    { key: 'liq', name: 'liquidation guard', tag: 'FLATTEN', col: 'pink', prim: 'flag', k1: 'asks', v1: 'flatten now?', ms: 1.9 },
    { key: 'rebal', name: 'rebalancer', tag: 'ALLOC', col: 'gray', prim: 'choice', k1: 'picks', v1: 'which asset', ms: 7.8 },
  ];
  /** the six desk agents (screenshot: prior · kelly · closer · spotter · edge · taker) */
  J.AGENTS = [
    { key: 'spotter', name: 'SPOTTER', role: 'scans books and venues', col: '#2ee6a6' },
    { key: 'prior', name: 'PRIOR', role: 'prior from history', col: '#ffc13d' },
    { key: 'edge', name: 'EDGE', role: 'fair value vs market', col: '#ff2e6e' },
    { key: 'kelly', name: 'KELLY', role: 'sizes the ticket', col: '#a66bff' },
    { key: 'taker', name: 'TAKER', role: 'crosses the spread', col: '#4d8dff' },
    { key: 'closer', name: 'CLOSER', role: 'takes profit / stops', col: '#ff8a3d' },
  ];
  /** the three heads of the build (screenshot 1): Hermes writes · Dots feeds · Jev decides */
  J.TRIO = [
    { key: 'hermes', name: 'HERMES', line: 'writes the strategy and the risk rules', sub: 'hermes agent · strategy.yaml', col: '#ff8a3d' },
    { key: 'dots', name: 'DOTS', line: 'pulls and cleans four years of data', sub: 'the data side', col: '#4d8dff' },
    { key: 'jev', name: 'JEV', line: 'backtests, caps and arms it', sub: 'the gate · cap · kill switch · orders', col: '#ff2e6e' },
  ];

  /* ---------- tab visibility ---------- */
  /* A hidden tab gets no animation frames, so document.timeline stands still and every Element.animate() a 'decision'/'tick' handler starts can never finish:
     the live-animation count (and heap) grew ~16/s until the tab came back. The market tick and the decision stream therefore stop while hidden and
     resume on return WITHOUT catching up (no burst of queued decisions). */
  J.hidden = () => document.hidden;
  /** Element.animate that is a no-op (returns null) while the tab is hidden or the element has no WAAPI — use for fire-and-forget flashes */
  J.animate = (el, kf, o) => { if (document.hidden || !el || !el.animate) return null; try { return el.animate(kf, o); } catch (e) { return null; } };

  /* ---------- simulated market (4 Hz) ---------- */
  const M = (J.market = { price: 84722, open: 84722, hist: [], vol: 0.00016 });
  let tickT = 0;
  const tick = () => {
    const dp = M.price * (J.gauss() * M.vol + (84722 - M.price) * 1e-6);
    M.price = Math.max(1000, M.price + dp);
    M.hist.push(M.price); if (M.hist.length > 1200) M.hist.shift();
    J.bus.emit('tick', { price: M.price, dp });
  };
  const runTick = (on) => { if (on && !tickT) tickT = setInterval(tick, 250); else if (!on && tickT) { clearInterval(tickT); tickT = 0; } };
  runTick(!document.hidden);
  for (let i = 0; i < 300; i++) { M.price += M.price * J.gauss() * M.vol; M.hist.push(M.price); }

  /* ---------- live decision stream (real engine on sampled states) ---------- */
  J.recent = [];
  let seq = 0;
  function pickBuild(d) {
    if (d.action === 'buy' || d.action === 'sell') return J.pick(['entry', 'entry', 'entry', 'router', 'sizer', 'guard']);
    if (d.action === 'close') return J.pick(['exit', 'exit', 'guard']);
    if (d.action === 'flatten') return J.pick(['liq', 'liq', 'guard']);
    return J.pick(['news', 'mm', 'funding', 'rebal', 'guard']);
  }
  J.decide = (state, o) => E.decide(state, Object.assign({ floor: S.floor, killed: S.killed }, o));
  J.makeDecision = () => {
    const sm = E.sampleState(() => M.price);
    const d = J.decide(sm.state);
    // display confidence: slight organic jitter on top of the engine output
    d.conf = J.clamp(d.conf * (0.965 + Math.random() * 0.035), 0.3, 0.995);
    if (d.dest === 'execute' && d.conf < S.floor) { d.dest = 'review'; d.reason = 'conf ' + d.conf.toFixed(2) + ' < ' + S.floor.toFixed(2); }
    else if (d.reason.indexOf('conf ') === 0) d.reason = 'conf ' + d.conf.toFixed(2) + ' < ' + S.floor.toFixed(2); // reason quotes the displayed (jittered) confidence
    d.id = (++seq).toString(16).padStart(4, '0') + Math.random().toString(16).slice(2, 6);
    d.state = sm.state; d.arch = sm.arch; d.build = pickBuild(d);
    d.symbol = sm.state.symbol; d.venue = sm.state.venue;
    d.line = d.symbol + ' edge ' + J.sgn(sm.state.edge_bps) + 'bps imb ' + J.sgn(sm.state.imbalance, 2) + ' spr ' + sm.state.spread_bps.toFixed(1);
    return d;
  };
  /** emit one decision now (counters + bus). Used by the live stream and by manual triggers (clicks). */
  J.fire = () => {
    const d = J.makeDecision();
    S.count++; S.cost += 0.00003; S.ms.push(d.ms); if (S.ms.length > 41) S.ms.shift();
    S.counts.choice++; if (Math.random() < 0.55) S.counts.flag++; if (Math.random() < 0.3) S.counts.score++;
    S.dest[d.dest]++;
    J.recent.unshift(d); if (J.recent.length > 40) J.recent.pop();
    J.bus.emit('decision', d); hud();
    return d;
  };
  let loopT = 0, started = false;
  function loop() { loopT = 0; if (document.hidden) return; try { J.fire(); } catch (e) { console.error('[loop]', e); } loopT = setTimeout(loop, 700 + Math.random() * 650); }
  J.start = () => { started = true; if (!document.hidden && !loopT) loopT = setTimeout(loop, 400); };
  document.addEventListener('visibilitychange', () => {
    const on = !document.hidden;
    runTick(on);
    if (on) { if (started && !loopT) loopT = setTimeout(loop, 500 + Math.random() * 600); } // resume gently, nothing queued while away
    else { clearTimeout(loopT); loopT = 0; }
  });

  /* ---------- HUD (header metrics + kill switch) ---------- */
  function median(a) { const s = a.slice().sort((x, y) => x - y); return s[(s.length / 2) | 0]; }
  const hudEls = {};
  function hud() {
    const set = (id, v) => { const el = hudEls[id] || (hudEls[id] = document.getElementById(id)); if (el && el.textContent !== v) el.textContent = v; };
    set('mDec', J.fmt(S.count)); set('mCost', '$' + S.cost.toFixed(3));
    set('mMed', median(S.ms).toFixed(1) + ' ms'); set('mFloor', S.floor.toFixed(2));
    set('secExec', J.fmt(S.dest.execute)); set('secRev', J.fmt(S.dest.review)); set('secSkip', J.fmt(S.dest.skip)); // desk header: live gate tally (this session)
    if (hudEls.fl !== S.floor) { hudEls.fl = S.floor; document.querySelectorAll('.foot-fl').forEach((el) => (el.textContent = 'floor ' + S.floor.toFixed(2))); }
    const k = hudEls.killBtn || (hudEls.killBtn = document.getElementById('killBtn'));
    if (k) { k.setAttribute('aria-pressed', String(S.killed)); const t = hudEls.killTxt || (hudEls.killTxt = document.getElementById('killTxt')); if (t && t.textContent !== (S.killed ? 'HALTED' : 'ARMED')) t.textContent = S.killed ? 'HALTED' : 'ARMED'; }
  }
  J.hud = hud;

  /* ---------- module registry: JEV.mod(name, init) — each module is a closure, no globals ---------- */
  const mods = [];
  J.mod = (name, init) => mods.push({ name, init });
  J.boot = () => {
    const kb = document.getElementById('killBtn');
    if (kb) kb.addEventListener('click', () => J.setKilled(!S.killed));
    hud(); pauseOffscreen();
    for (const m of mods) {
      const t0 = performance.now();
      try { m.init(); } catch (e) { console.error('[module:' + m.name + ']', e); }
      J.bootLog = (J.bootLog || []); J.bootLog.push(m.name + ' ' + (performance.now() - t0).toFixed(1) + 'ms');
    }
    J.start();
    document.documentElement.classList.add('ready');
  };
})();
