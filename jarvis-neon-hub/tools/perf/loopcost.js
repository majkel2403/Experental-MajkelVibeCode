/* Koszt JS na klatkę pętli rysującej + alokacje na klatkę (HeapProfiler sampling) dla sceny.
   node tools/perf/loopcost.js --scene idle|hud|work --fx cinema --ms 6000 [--url http://…] [--dsf 1]
   Wynik: JSON (@@JSON@@). „jsMs” = suma czasu wszystkich callbacków rAF w klatce (mediana/średnia/p95) — to, co aplikacja zajmuje wątek główny;
   „allocKB” = bajty próbkowane (także zwolnione przez GC) w oknie / liczba klatek, „allocKBps” = na sekundę (bez GPU liczba klatek jest mała, więc porównuj KB/s). Bez GPU (SwiftShader) liczy się proporcja A/B, nie wartość bezwzględna. */
'use strict';
const L = require('./lib.js');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
(async () => {
  const scene = arg('scene', 'idle'), ms = +arg('ms', 6000), url = arg('url', undefined);
  const { b, p, cdp } = await L.open({ width: 1600, height: 900, dsf: +arg('dsf', 1), url, settleMs: 1500 });
  try {
    await L.forceFx(p, arg('fx', 'cinema'));
    await L.SCENES[scene](p); await p.waitForTimeout(1500);
    await p.evaluate(() => {
      const W = window.__lc = { frames: [], cur: 0, lt: -1 };
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = cb => raf(t => { const s = performance.now(); try { return cb(t); } finally { if (t !== W.lt) { if (W.lt >= 0) W.frames.push(W.cur); W.cur = 0; W.lt = t; } W.cur += performance.now() - s; } });
    });
    await cdp.send('HeapProfiler.enable'); await cdp.send('HeapProfiler.startSampling', { samplingInterval: 256, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    await p.waitForTimeout(ms);
    const prof = (await cdp.send('HeapProfiler.stopSampling')).profile;
    const sum = n => (n.selfSize || 0) + (n.children || []).reduce((s, c) => s + sum(c), 0);
    const r = { f: await p.evaluate(() => window.__lc.frames) };
    const frames = r.f.length, mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
    process.stdout.write('@@JSON@@' + JSON.stringify({ scene, frames, jsMs: { median: q(r.f, .5), mean: mean(r.f), p95: q(r.f, .95) }, allocKB: +(sum(prof.head) / 1024 / Math.max(1, frames)).toFixed(1), allocKBps: +(sum(prof.head) / 1024 / (ms / 1000)).toFixed(1), errors: p.errs }) + '\n');
  } finally { await b.close().catch(() => { }); }
})().catch(e => { console.error(e); process.exit(1); });
