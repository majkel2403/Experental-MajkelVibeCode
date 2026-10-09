/* =========================================================
   JARVIS OS — nakładka pomiarowa ?perf=1 (Faza 0)
   Bez parametru w adresie moduł nic nie robi (zero węzłów DOM, zero pętli rAF, zero nasłuchów).
   Z parametrem: jeden mały element w rogu (p50/p95 czasu klatki z pętli rAF z okna ~4 s, FPS, long-animation-frame/longtask
   o ile przeglądarka je zna). Nie używa J.emit ani J.* — nie wpływa na działanie aplikacji.
   ========================================================= */
'use strict';
(() => {
  let on = false;
  try { on = /[?&]perf=1(?:&|$)/.test(location.search); } catch (e) { }
  if (!on) return;
  const N = 240, buf = new Float32Array(N); let n = 0, last = 0, lt = 0, ltMs = 0, loaf = 0, loafMs = 0;
  const q = (a, p) => a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : 0;
  for (const [type, f] of [['longtask', e => { lt++; ltMs += e.duration; }], ['long-animation-frame', e => { loaf++; loafMs += e.duration; }]]) {
    try { new PerformanceObserver(l => l.getEntries().forEach(f)).observe({ type, buffered: true }); } catch (e) { }
  }
  const el = document.createElement('div');
  el.id = 'perfHud'; el.setAttribute('aria-hidden', 'true');
  /* pointer-events:none — nakładka nie przechwytuje kliknięć; z-index ponad wszystkim; bez filtrów i cieni */
  el.style.cssText = 'position:fixed;right:6px;bottom:6px;z-index:2147483647;pointer-events:none;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;color:#9fffb0;background:rgba(0,0,0,.78);padding:4px 7px;border-radius:4px;white-space:pre;min-width:150px';
  const mount = () => document.body.appendChild(el);
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount, { once: true });
  const stats = () => {
    const c = Math.min(n, N), a = Array.from(buf.subarray(0, c)).sort((x, y) => x - y), sum = a.reduce((s, x) => s + x, 0);
    return { frames: n, p50: +q(a, .5).toFixed(1), p95: +q(a, .95).toFixed(1), max: +(a[c - 1] || 0).toFixed(1), fps: sum ? +(1000 * c / sum).toFixed(1) : 0, longtasks: lt, longtaskMs: Math.round(ltMs), loaf, loafMs: Math.round(loafMs) };
  };
  const tick = t => { if (last) { buf[n % N] = t - last; n++; } last = t; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  setInterval(() => { const s = stats(); el.textContent = `frame p50 ${s.p50} ms · p95 ${s.p95} ms\n${s.fps} fps · max ${s.max} ms\nlongtask ${s.longtasks} (${s.longtaskMs} ms) · LoAF ${s.loaf}`; }, 500);
  window.__perf = { stats, reset: () => { n = 0; last = 0; lt = ltMs = loaf = loafMs = 0; } };
})();
