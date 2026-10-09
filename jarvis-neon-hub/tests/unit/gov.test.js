/* js/gov.js: regulator czasu klatki na fałszywym zegarze (czyste jądro J.Gov + integracja z J.fx.lower/raise) */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../harness.js');
const J = load({ state: { settings: { hermesOn: false } } }), Gov = J.Gov;

/* symulacja: kosztFn(skala, t) → dt/gpu; krok 16,7 ms; zwraca log zdarzeń hosta */
const mk = (o = {}) => {
  const ev = [], st = { cap: 3, scalable: true };
  const host = { hint: () => o.hint || null, saveHint: v => { st.hint = v; }, scalable: () => st.scalable, setStep: (i, s, why) => ev.push(['scale', s, why]), lower: why => { if (st.cap <= 1) return false; st.cap--; ev.push(['lower', st.cap]); return true; }, raise: () => { if (st.cap >= 3) return false; st.cap++; ev.push(['raise', st.cap]); return true; }, capped: () => st.cap < 3 };
  const g = new Gov(host, o.opt), c = { t: 1000 }; ev.at = () => c.t;
  const run = (ms, cost, gpuFn) => { const end = c.t + ms; while (c.t < end) { const k = cost(g.scale(), c.t), dt = Math.max(o.vs || 16.7, k); c.t += dt; g.update(c.t, dt, gpuFn ? gpuFn(g.scale(), c.t) : null); } };
  return { g, ev, st, run, c };
};
const scales = ev => ev.filter(e => e[0] === 'scale').map(e => e[1]);

test('stała ocena: lekka scena nie zmienia nic (brak oscylacji)', () => {
  const { g, ev, run } = mk(); run(40000, () => 10);
  assert.equal(ev.length, 0); assert.equal(g.scale(), 1);
});
test('przeciążenie: skala spada krokami z listy i zbiega, potem stabilnie (dt, bez timera GPU)', () => {
  const { g, ev, run } = mk(); run(30000, s => 40 * s * s);   // 40 ms przy pełnej skali, koszt ~ s²
  const sc = scales(ev); assert.ok(sc.length >= 1, 'jest obniżenie'); for (const s of sc) assert.ok(g.steps.includes(s));
  assert.ok(40 * g.scale() ** 2 <= 16.7 * 1.2, 'końcowa skala mieści się w klatce: ' + g.scale());
  const ch = g.changes; run(5000, s => 40 * s * s); assert.ok(g.changes - ch <= 2, 'po zbieżności co najwyżej jedna próba w górę');
});
test('reakcja ≤ 1 s od końca rozruchu: pierwsze obniżenie skali', () => {
  const { g, ev, c, run } = mk(); run(g.o.warm + 100, () => 10);   // rozgrzewka (3 s) lekka
  const t0 = c.t; run(2000, () => 50); const e = ev.find(x => x[0] === 'scale'); assert.ok(e, 'obniżono'); 
  assert.ok(g.trace[0][0] - t0 <= 1000, 'reakcja po ' + (g.trace[0][0] - t0) + ' ms');
});
test('rozruch (3 s) nie wyzwala obniżenia, nawet przy ciężkich klatkach', () => {
  const { ev, run } = mk(); run(2900, () => 60); assert.equal(ev.length, 0);
});
test('timer GPU: skala od razu właściwa (bez próbowania w dół i w górę)', () => {
  const { g, ev, run } = mk(); run(15000, () => 16.7, s => 30 * s * s);   // GPU 30 ms przy 1,0
  const first = scales(ev); assert.ok(first.length <= 2, 'zbieżność w 1–2 krokach: ' + first);
  assert.ok(30 * g.scale() ** 2 <= 14 * .85 + .01, 'koszt GPU w budżecie');
  assert.ok(ev.filter(e => e[0] === 'scale').length === first.length);
});
test('podnoszenie dopiero po ≥ 8 s stabilności, o jeden krok, i nie wraca w pętli gdy jest za drogo', () => {
  const { g, ev, c, run } = mk(); run(8000, s => 40 * s * s); const lowI = g.i; assert.ok(lowI > 0);
  const t1 = c.t; run(4000, () => 10); assert.equal(g.i, lowI, 'przed 8 s bez zmian');
  run(6000, () => 10); assert.equal(g.i, lowI - 1, 'po 8 s o jeden krok');
  assert.ok(ev.length > 1 && t1);
});
test('próba w górę, która się nie udaje: cofnięcie, wykładniczy backoff (cap 60 s), brak oscylacji', () => {
  const { g, ev, c, run } = mk(); const heavy = s => (s >= .85 ? 40 : 10);   // powyżej 0,7 klatka zawsze za długa
  run(120000, heavy); const ups = ev.filter(e => e[0] === 'scale' && e[2] === 'cofnięcie próby').length;
  assert.ok(ups >= 2 && ups <= 6, 'liczba nieudanych prób ograniczona: ' + ups); assert.ok(g.fails >= 2);
  assert.ok(g.upWait() <= 60000); const f = g.fails; g.fails = 10; assert.equal(g.upWait(), 60000); g.fails = 2; assert.equal(g.upWait(), 16000); g.fails = 3; assert.equal(g.upWait(), 32000); g.fails = 0; assert.equal(g.upWait(), 8000); g.fails = f;
  const n = g.changes; run(20000, heavy); assert.ok(g.changes - n <= 2);
});
test('dno skali + p90 > 1,5× budżet przez 5 s → lower(); potem blokada podnoszenia poziomu ≥ 60 s i brak przywrócenia przy lekkich klatkach', () => {
  const { g, ev, st, c, run } = mk(); run(20000, () => 60);   // nawet na dnie za wolno
  assert.ok(g.floor()); const low = ev.filter(e => e[0] === 'lower'); assert.ok(low.length >= 1, 'lower po dnie');
  const tLow = ev.findIndex(e => e[0] === 'lower'); assert.ok(tLow > 0 || scales(ev).length >= 1, 'najpierw skala');
  const capNow = st.cap; run(1, () => 10); const t0 = c.t; run(50000, () => 10);
  assert.ok(!ev.some(e => e[0] === 'raise'), 'w 60 s blokady brak raise'); assert.equal(st.cap, capNow);
  run(60000, () => 10); assert.ok(ev.some(e => e[0] === 'raise'), 'po blokadzie wraca'); assert.ok(c.t - t0 > 60000);
});
test('blokada 60 s po lower() działa także bez skali do podnoszenia (sam poziom efektów)', () => {
  const { g, ev, st, run } = mk(); st.scalable = false; run(14000, () => 60); assert.ok(ev.some(e => e[0] === 'lower'));
  run(1, () => 10); const n = ev.length; run(30000, () => 10); assert.equal(ev.length, n, 'brak raise przez ≥ 30 s po obniżeniu'); run(40000, () => 10); assert.ok(ev.some(e => e[0] === 'raise'));
});
test('lower() bez skalowalnej warstwy (brak GL): obniża bez kroków skali po 5 s', () => {
  const { g, ev, st, run } = mk(); st.scalable = false; run(4000 + g.o.warm - 1000, () => 40); assert.equal(ev.filter(e => e[0] === 'lower').length, 0);
  run(8000, () => 40); assert.ok(ev.some(e => e[0] === 'lower')); assert.equal(scales(ev).length, 0);
});
test('klatki przy zbliżonym budżecie (16–18 ms) nie obniżają niczego: histereza między progami', () => {
  const { ev, run } = mk(); run(60000, (s, t) => 16.7 + (Math.sin(t / 700) > .6 ? 1.2 : 0)); assert.equal(ev.length, 0);
});
test('karta w tle (przerwa > 1 s) zeruje pomiar zamiast liczyć ogromne dt', () => {
  const { g, ev, c, run } = mk(); run(5000, () => 10); c.t += 30000; g.update(c.t, 30000, null); run(2000, () => 10); assert.equal(ev.length, 0);
});
test('przeciążenie CPU przy lekkim GPU (cpuBound) obniża poziom efektów bez ruszania skali', () => {
  const { g, ev, run } = mk(); run(15000, () => 60, () => 3); assert.equal(scales(ev).length, 0); assert.ok(ev.some(e => e[0] === 'lower'));
  assert.equal(g.scale(), 1);
});
test('nieudany wzrost poziomu (raise → lower w 20 s) zwiększa licznik porażek', () => {
  const { g, ev, st, c, run } = mk(); st.scalable = false; st.cap = 2;
  run(70000, () => 10); assert.ok(ev.some(e => e[0] === 'raise'), 'próba raise po 60 s lock? (lock 0 na starcie)');
  const f0 = g.fails; run(15000, () => 60); assert.ok(g.fails > f0 || ev.some(e => e[0] === 'lower'), 'po nieudanej próbie: lower');
});

/* faza 3D: okres vsync mierzony, nie zakładany (ekrany 30/48/120 Hz, pojedyncze szarpnięcia) */
for (const [hz, vs] of [[48, 20.8], [60, 16.7], [120, 8.3]]) test('ekran ' + hz + ' Hz, lekka scena (5 ms): brak obniżeń skali i poziomu przez 5 min', () => {
  const { g, ev, run } = mk({ vs }); run(300000, () => 5);
  assert.equal(ev.length, 0, hz + ' Hz: ' + JSON.stringify(ev.slice(0, 4))); assert.equal(g.scale(), 1);
});
test('ekran 120 Hz liczony jak 60 (cel 60 FPS), 48 Hz mierzony od razu (20,8 ms nie bywa kwantem ekranu 60 Hz)', () => {
  const b = mk({ vs: 8.3 }); b.run(20000, () => 5); assert.ok(Math.abs(b.g.per - 16.7) < .1, 'per ' + b.g.per);
  const c = mk({ vs: 20.8 }); c.run(20000, () => 5); assert.ok(Math.abs(c.g.per - 20.8) < 1, 'per ' + c.g.per);
});
/* stałe 30 FPS to albo ekran 30 Hz, albo ekran 60 Hz ze sceną za ciężką na 16,7 ms (dt skwantowane do 33,3) — z samych dt tego nie widać: ≥ 25 ms uznajemy za vsync dopiero po 60 s bez szybkiej klatki */
test('ekran 30 Hz bez dowodu: przez pierwsze 60 s regulator reaguje (jak na wolnej scenie 60 Hz), potem uznaje 33,3 ms za vsync, zapisuje dowód i się uspokaja', () => {
  const { g, ev, st, run, c } = mk({ vs: 33.3 }); run(30000, () => 5);
  assert.ok(scales(ev).length >= 1, 'w wątpliwości = 60 Hz: reaguje'); assert.ok(g.per < 17, 'okres nie uznany za 33,3 przed czasem: ' + g.per);
  run(40000, () => 5); assert.ok(Math.abs(g.per - 33.3) < 1, 'po > 60 s bez szybkiej klatki: per ' + g.per); assert.equal(st.hint, 'slow', 'dowód zapisany (sessionStorage)');
  const n = ev.length; run(60000, () => 5); assert.ok(ev.every((e, i) => i < n || e[0] === 'scale' || e[0] === 'raise'), 'po uznaniu vsync nie obniża poziomu: ' + JSON.stringify(ev.slice(n)));
  run(120000, () => 5); assert.equal(g.scale(), 1, 'skala wraca do pełnej');
});
test('ekran 30 Hz z zapamiętanym dowodem „slow” (po przeładowaniu): zero reakcji od początku; pierwsza szybka klatka go unieważnia', () => {
  const a = mk({ vs: 33.3, hint: 'slow' }); a.run(300000, () => 5); assert.equal(a.ev.length, 0, JSON.stringify(a.ev.slice(0, 3))); assert.ok(Math.abs(a.g.per - 33.3) < 1);
  const b = mk({ vs: 33.3, hint: 'slow' }); b.run(10000, () => 5); b.g.update(b.c.t + 16.7, 10, null); b.c.t += 16.7; b.run(20000, () => 33.3);
  assert.ok(b.g.per < 17 && b.ev.some(e => e[0] === 'scale' || e[0] === 'lower'), 'po szybkiej klatce znów 60 Hz i reakcja: per ' + b.g.per);
});
test('ekran 60 Hz z chwilowym stałym 30 FPS (scena ciężka przez 50 s): okres zostaje 16,7 ms, regulator reaguje, a po odciążeniu skala wraca', () => {
  const { g, ev, run } = mk(); run(5000, () => 5); run(50000, () => 33.3);
  assert.ok(g.per < 17, 'nie wzięty za ekran 30 Hz: ' + g.per); assert.ok(scales(ev).length >= 1 && ev.some(e => e[0] === 'lower'), 'reakcja na wolne klatki');
  run(120000, () => 5); assert.equal(g.scale(), 1, 'po odciążeniu skala wraca: ' + g.scale()); assert.ok(g.per < 17);
});
test('ekran 60 Hz ze stałym 30 FPS od startu (> 60 s): pierwsze 60 s reaguje; dowód „fast” (≥ 30 szybkich klatek, np. z poprzedniego rozruchu) zakazuje uznania ekranu za wolny', () => {
  const a = mk({ vs: 33.3, hint: 'fast' }); a.run(200000, () => 5); assert.ok(a.g.per < 17, 'hint fast: nigdy per 33,3: ' + a.g.per); assert.ok(a.ev.length >= 1);
  const b = mk(); b.run(3000, () => 5); b.run(5000, () => 33.3); assert.equal(b.st.hint, 'fast', 'szybkie klatki zapisują dowód'); 
});
test('ekran 30 Hz: rzeczywiste przeciążenie (klatka 70 ms, nie pasuje do vsync) nadal obniża efekty', () => {
  const { g, ev, run } = mk({ vs: 33.3 }); run(15000, () => 5); run(30000, () => 70);
  assert.ok(scales(ev).length >= 1 || ev.some(e => e[0] === 'lower'), 'regulator reaguje'); assert.ok(g.per <= 16.8 + .1 || g.per > 33, 'okres nie „uczy się” wolnego renderu: ' + g.per);
});
test('okazjonalne szarpnięcia (co 8. klatka 30 ms, ~12%) przy lekkiej scenie nie obniżają niczego', () => {
  const { ev, run } = mk(); let n = 0; run(120000, () => (++n % 8 ? 5 : 30)); assert.equal(ev.length, 0, JSON.stringify(ev.slice(0, 3)));
});
test('tryb still (warstwa nie rysuje): skala nie rośnie, a próba wyższego poziomu nie resetuje skali do pełnej', () => {
  const { g, ev, st, run } = mk(); run(15000, s => 40 * s * s); const i = g.i; assert.ok(i > 0);
  st.scalable = false; run(120000, () => 10); assert.equal(g.i, i, 'skala bez zmian w still'); assert.ok(!scales(ev).slice(-1).some(v => v === 1), 'brak powrotu do 1');
  st.cap = 2; run(70000, () => 10); assert.ok(ev.some(e => e[0] === 'raise'), 'poziom efektów da się podnieść w still'); assert.equal(g.i, i, 'nadal ostatnia bezpieczna skala');
});
test('kształt listy kroków skali i reset po długiej przerwie', () => {
  assert.deepEqual([...Gov.prototype.constructor.length ? new Gov({}).steps : []], [1, .85, .7, .6, .5, .42]);
  const { g, c, run } = mk(); run(5000, () => 10); g.probe = { kind: 'scale', from: 1, at: c.t }; g.stableSince = c.t; c.t += 5000; g.update(c.t, 16.7, null);
  assert.equal(g.probe, null, 'probe zerowany'); assert.equal(g.dtW.length, 1, 'okno pomiaru zaczyna od nowa'); assert.equal(g.stableSince, 0); assert.ok(g.vsOk, 'okres vsync zachowany');
});
test('udana próba w górę zeruje licznik porażek', () => {
  const { g, c, run } = mk(); run(8000, s => 40 * s * s); g.fails = 3; g.probe = { kind: 'scale', from: g.i + 1, at: c.t }; run(6000, () => 10);
  assert.equal(g.fails, 0);
});
test('?gov=0 wyłącza regulator (G.frame nic nie robi)', () => {
  const fs = require('fs'), vm = require('vm'), src = fs.readFileSync(require('path').join(__dirname, '..', '..', 'js', 'gov.js'), 'utf8');
  const mkJ = q => { const calls = []; const ctx = { J: { bgGl: null, log() { }, state: { settings: {} }, on() { }, fx: { lower: () => (calls.push('l'), true), cap: 3 } }, location: { search: q }, performance: { now: () => 0 } }; ctx.window = ctx; vm.runInNewContext(src, ctx); return { J: ctx.J, calls }; };
  const off = mkJ('?gov=0'), on = mkJ('?x=1'); let t = 0; for (let i = 0; i < 2000; i++) { t += 60; off.J.gov.frame(t, 60); on.J.gov.frame(t, 60); }
  assert.equal(off.calls.length, 0, 'gov=0: brak obniżeń'); assert.ok(on.calls.length >= 1, 'bez parametru: reaguje');
});

/* integracja z J.fx (main.js jest DOM-owy, więc atrapa o tym samym kształcie): jedno źródło decyzji */
test('integracja: J.gov.frame karmi regulator, host woła J.fx.lower()/raise() i J.bgGl.setScale', () => {
  const fx = { cap: 3, calls: [] }; fx.lower = why => { if (fx.cap <= 1) return false; fx.calls.push('lower'); fx.cap--; return true; }; fx.raise = () => { fx.calls.push('raise'); fx.cap = 3; return true; };
  const real = J.bgGl; J.fx = fx; J.bgGl = { active: true, mode: 'run', scale: .65, gpuMs: () => null, setScale(v) { this.scale = Math.round(Math.min(1, Math.max(.3, v)) * 100) / 100; } };
  const G = J.gov; let t = 1000; const b0 = J.bgGl.scale;
  for (let i = 0; i < 400; i++) { t += 45; G.frame(t, 45); }   // 45 ms/klatkę
  assert.ok(J.bgGl.scale < b0, 'skala warstwy GL zmniejszona: ' + J.bgGl.scale); assert.ok(J.bgGl.scale >= .3);
  for (let i = 0; i < 600; i++) { t += 45; G.frame(t, 45); }
  assert.ok(fx.calls.length >= 1 && fx.calls.every(c => c === 'lower'), 'lower po dnie skali, bez raise w blokadzie: ' + fx.calls); J.bgGl = real;
});
test('kod: main.js nie ma już własnej pętli decyzyjnej (adapt), index.html/sw.js ładują gov.js po bg-gl.js i przed main.js', () => {
  const fs = require('fs'), r = f => fs.readFileSync(require('path').join(__dirname, '..', '..', f), 'utf8');
  assert.ok(!/adapt\(\)/.test(r('js/main.js'))); const h = r('index.html');
  assert.ok(h.indexOf('js/bg-gl.js') < h.indexOf('js/gov.js') && h.indexOf('js/gov.js') < h.indexOf('js/main.js')); assert.ok(r('sw.js').includes("'js/gov.js'"));
  assert.ok(/id="tsEco"/.test(h) && /#app\.present #tsEco/.test(r('css/jarvis.css')));
});

test('wskaźnik ECO ≤ 900 px: .top-status nie jest ukryty w całości, zostaje sama dioda z opisem (aria/title)', () => {
  const fs = require('fs'), r = f => fs.readFileSync(require('path').join(__dirname, '..', '..', f), 'utf8'), css = r('css/jarvis.css');
  const m = /@media \(max-width:900px\)\{([\s\S]*?)\n\}/.exec(css); assert.ok(m, 'blok 900 px');
  assert.ok(!/\.top-status\s*[,{]/.test(m[1].replace(/\.top-status \.ts:not\(#tsEco\)\{display:none\}/, '')), 'top-status nie znika w całości');
  assert.ok(/\.top-status \.ts:not\(#tsEco\)\{display:none\}/.test(m[1]) && /\.ts#tsEco b\{display:none\}/.test(m[1]));
  assert.ok(/id="tsEco"[^>]*role="img"[^>]*aria-label=/.test(r('index.html'))); assert.ok(/tsEco\.setAttribute\('aria-label'/.test(r('js/dash.js')));
});
