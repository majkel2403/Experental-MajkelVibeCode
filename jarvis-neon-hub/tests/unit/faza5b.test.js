/* Faza 5B: efekty kinowe cz. 2 — hologramowe okna, equalizer, paralaksa, tilt kart HUD, cząstki GL, regulator */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('hologramowe okna: .holo tylko od cinema, jeden element, tylko transform/opacity/clip-path, off zeruje animacje', () => {
  const css = rd('css/neon.css'), core = rd('js/core.js');
  assert.match(core, /J\.fx\?\.rank\?\.\(\) >= 3 && !J\.fxd\?\.calm\?\.\(\) \? 'window holo' : 'window'/, 'klasa .holo nadawana tylko na poziomie cinema');
  for (const k of ['winHolo', 'winHoloOut', 'holoEdge']) assert.match(css, new RegExp('@keyframes ' + k + '\\{'), k);
  const kf = [...css.matchAll(/@keyframes (winHolo|winHoloOut|holoEdge)\{(.*)\}\n/g)].map(m => m[2]).join('');
  assert.ok(!/filter|blur|box-shadow|top:|left:|width:|height:/.test(kf), 'tylko transform/opacity/clip-path');
  assert.match(css, /#app\[data-fx=cinema\]:not\(\.present\):not\(\.focus\) \.window\.closing\{animation:winHoloOut \.28s/);
  assert.match(core, /setTimeout\(\(\) => w\.el\.remove\(\), J\.fx\?\.rank\?\.\(\) >= 3 \? 300 : 220\)/, 'zwijanie do linii zdąży się odegrać przed usunięciem');
  assert.match(core, /\/\^win\(In\|Holo\)\/\.test\(a\.animationName\)/, 'drag kończy też animację hologramu (transform nie startuje pod animacją wejścia)');
  assert.match(rd('css/jarvis.css'), /#app\[data-fx="off"\] \*,#app\[data-fx="off"\] \*::before,#app\[data-fx="off"\] \*::after\{animation:none!important;transition:none!important\}/, 'off: animation none (asercja e2e)');
});

test('duch okna: przy każdym otwarciu w cinema (wm.open), bez powtórki z agent-ui w < 900 ms i bez ducha przy przywracaniu układu', () => {
  const core = rd('js/core.js'), main = rd('js/main.js');
  assert.match(core, /J\.sfx\.open\(\); J\.fx\?\.ghost\?\.\(id\);/);
  assert.match(main, /if \(J\.fx\.rank\(\) < 3 \|\| !J\.booted \|\| J\.fxd\?\.calm\?\.\(\)\) return;/);
  assert.match(main, /t - \(gs\[id\] \|\| -1e4\) < 900\) return;/);
  assert.ok(!/el\.offsetWidth/.test(main.slice(main.indexOf('ghost(id)'), main.indexOf('ghost(id)') + 700)), 'wymiary ducha ze stylu, bez odczytu layoutu');
});

/* ---------- fx-cinema: equalizer, paralaksa, tilt (logika bez przeglądarki; atrapy elementów i zegara) ---------- */
const vm = require('vm');
const { load } = require('../harness.js');
const mkCin = (rank = 3) => {
  const J = load({ state: { settings: { hermesOn: false } } }), ctx = J.__ctx;
  let now = 1e6; ctx.performance = { now: () => now };
  const els = {}, mk = () => ({ style: {}, classList: { contains: () => false, add() { }, remove() { } }, appendChild(c) { this.kids = (this.kids || []).concat(c); }, remove() { this.gone = true; } });
  for (const s of ['#coreWrap', '#hud', '#fx', '#desktop', '#app']) els[s] = mk();
  ctx.document.querySelector = s => els[s] || null; ctx.document.hidden = false;
  const cvs = []; ctx.document.createElement = () => { const c = mk(); c.getContext = () => new Proxy({}, { get: (t, k) => k === 'clearRect' ? (() => { c.cleared = (c.cleared || 0) + 1; }) : k === 'fillRect' ? (() => { c.rects = (c.rects || 0) + 1; }) : (() => { }) }), c.setAttribute = () => { }; cvs.push(c); return c; };
  const cardEls = [mk(), mk()]; ctx.document.querySelectorAll = s => s === '#hud .hc' ? cardEls : []; els.cards = cardEls; els['#hud'].classList.contains = c => c === 'show';
  J.fx = { rank: () => rank }; J.ear = { analyser: null }; J.bgGl = { par: [0, 0] };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'fx-cinema.js'), 'utf8'), ctx, { filename: 'fx-cinema.js' });
  return { J, C: J.cin, els, cvs, advance: ms => { now += ms; return now; }, now: () => now, setRank: r => { rank = r; } };
};

test('fx-cinema: bramki — equalizer tylko z realnym analyserem w LISTENING i cinema; paralaksa nie na dotyku, skupieniu, prezentacji, w tle', () => {
  const { C } = mkCin(), an = {};
  const eq = o => C.eqWanted({ analyser: an, state: 'listening', rank: 3, calm: false, hidden: false, ...o });
  assert.ok(eq({}));
  for (const o of [{ analyser: null }, { state: 'idle' }, { state: 'thinking' }, { rank: 2 }, { rank: 1 }, { rank: 0 }, { calm: true }, { hidden: true }]) assert.ok(!eq(o), JSON.stringify(o));
  const pr = o => C.parWanted({ rank: 3, calm: false, touch: false, hidden: false, ...o });
  assert.ok(pr({}));
  for (const o of [{ rank: 2 }, { rank: 0 }, { calm: true }, { touch: true }, { hidden: true }]) assert.ok(!pr(o), JSON.stringify(o));
});

test('fx-cinema: słupki z widma — cisza = 0, głośno rośnie, potem opada; tilt ≤ 3° i brak tilt-u pośrodku karty', () => {
  const { C } = mkCin(), out = new Float32Array(C.EQ.bars), bins = new Uint8Array(128);
  assert.equal(C.eqBars(bins, out), 0); assert.ok(out.every(v => v === 0));
  bins.fill(200); const loud = C.eqBars(bins, out); assert.ok(loud > .7 && out.every(v => v > .7), 'głośno: ' + loud);
  bins.fill(0); C.eqBars(bins, out); const a = out[3]; C.eqBars(bins, out); assert.ok(out[3] < a && a < .7, 'opada, nie znika skokiem');
  assert.equal(C.tiltOf(0, 0), null);
  for (const [x, y] of [[1, 1], [1, 0], [-.4, .9], [5, 5], [.05, 0]]) { const t = C.tiltOf(x, y); assert.ok(t && t.deg <= 3 + 1e-9 && t.deg > 0, JSON.stringify([x, y, t])); assert.ok(Math.abs(Math.hypot(t.ax, t.ay) - 1) < .01, 'oś jednostkowa'); }
  assert.ok(C.ease(0, 1, 140) > .6 && C.ease(0, 1, 140) < .64, 'τ = 140 ms');
});

test('fx-cinema: paralaksa rusza Orb (i tło GL) tylko podczas ruchu kursora, wraca do spoczynku (translate pusty, par 0) i znika poniżej cinema', () => {
  const t = mkCin(3), { C, els, J } = t;
  C.frame(t.advance(16)); assert.equal(els['#coreWrap'].style.translate, undefined, 'bez ruchu kursora nic nie zapisujemy');
  C.px = 1; C.py = -1; C.moveAt = t.now();
  for (let i = 0; i < 6; i++) C.frame(t.advance(40));
  assert.match(els['#coreWrap'].style.translate, /px .*px/); assert.equal(els.cards[0].style.translate, undefined, 'karty HUD nie jadą z paralaksą (koszt rastra)'); assert.equal(els['#hud'].style.translate, undefined); assert.equal(C.AMP.hud, undefined); assert.ok(J.bgGl.par[0] > .3, 'shader dostaje przesunięcie');
  assert.ok(Math.abs(parseFloat(els['#coreWrap'].style.translate)) <= C.AMP.orb + 1e-9, 'Orb ≤ ' + C.AMP.orb + ' px');
  C.frame(t.advance(800)); C.frame(t.advance(16));
  assert.equal(els['#coreWrap'].style.translate, ''); assert.deepEqual(J.bgGl.par, [0, 0], 'po bezruchu spoczynek');
  C.moveAt = t.now(); C.frame(t.advance(40)); C.frame(t.advance(40)); assert.ok(els['#coreWrap'].style.translate);
  t.setRank(2); C.frame(t.advance(16)); assert.equal(els['#coreWrap'].style.translate, '', 'spadek poniżej cinema zdejmuje ruch od razu');
});

test('fx-cinema: equalizer — brak elementu bez analysera; powstaje przy LISTENING z analyserem, gaśnie po 1 s ciszy, znika po nasłuchu', () => {
  const t = mkCin(3), { C, J, cvs } = t; let amp = 180;
  J.orb = { state: 'listening' };
  for (let i = 0; i < 5; i++) C.frame(t.advance(50)); assert.equal(cvs.length, 0, 'bez analysera nic na niby'); assert.equal(C.eq, null);
  J.ear.analyser = { frequencyBinCount: 128, getByteFrequencyData(a) { a.fill(amp); } };
  for (let i = 0; i < 5; i++) C.frame(t.advance(50)); assert.equal(cvs.length, 1); assert.ok(C.eq && cvs[0].rects > 0, 'słupki rysowane');
  amp = 10; for (let i = 0; i < 15; i++) C.frame(t.advance(50)); const lv = Math.max(...C.eq.lv); assert.ok(lv > .01, 'szum poniżej progu: przed upływem 1 s słupki jeszcze trzymają poziom: ' + lv);
  for (let i = 0; i < 40; i++) C.frame(t.advance(50)); assert.ok(Math.max(...C.eq.lv) < .02, 'po > 1 s ciszy zgaszone');
  J.orb = { state: 'idle' }; for (let i = 0; i < 6; i++) C.frame(t.advance(50)); assert.equal(C.eq, null, 'koniec nasłuchu: element usunięty'); assert.ok(cvs[0].gone);
});

test('fx-cinema: tilt kart HUD — tylko rotate (spoczynek pusty), zdejmowany po wyjściu kursora i przy spadku poniżej cinema; CSS: perspektywa tylko na czas ruchu', () => {
  const t = mkCin(3), { C, els } = t, card = { style: {} };
  C.tilt = { el: card, r: { left: 100, top: 100, width: 200, height: 80 }, nx: 0, ny: 0, leave: false }; C.mx = 290; C.my = 110;
  els['#hud'].classList.contains = c => c === 'show'; C.frame(t.advance(16)); C.frame(t.advance(100));
  assert.match(card.style.rotate, /^-?[\d.]+ -?[\d.]+ 0 [\d.]+deg$/); assert.ok(parseFloat(card.style.rotate.split(' ')[3]) <= 3);
  C.tilt.leave = true; for (let i = 0; i < 30; i++) C.frame(t.advance(60)); assert.equal(card.style.rotate, ''); assert.equal(C.tilt, null, 'po wyjściu kursora karta wraca do spoczynku');
  C.tilt = { el: card, r: { left: 0, top: 0, width: 100, height: 100 }, nx: 0, ny: 0, leave: false }; C.mx = 99; C.my = 1; C.frame(t.advance(100)); t.setRank(2); C.frame(t.advance(16)); assert.equal(card.style.rotate, ''); assert.equal(C.tilt, null);
  const css = rd('css/neon.css'); assert.match(css, /#hud\.tilt\{perspective:900px\}/); assert.match(rd('js/fx-cinema.js'), /el\.style\.rotate = ''/);
  assert.ok(!/style\.transform/.test(rd('js/fx-cinema.js').replace(/\/\*[\s\S]*?\*\//g, '')), 'tilt i paralaksa nie piszą w transform (zostaje skala/pozycja z hud.js i main.js)');
});

test('fx-cinema: podpięcie — skrypt w index.html i SHELL, wywołanie w pętli rAF, bg-gl czyta par w shaderze', () => {
  assert.match(rd('index.html'), /<script defer src="js\/fx-cinema\.js"><\/script>/); assert.match(rd('sw.js'), /'js\/fx-cinema\.js'/);
  assert.match(rd('js/main.js'), /J\.cin\?\.frame\(now\);/); const gl = rd('js/bg-gl.js'); assert.match(gl, /uniform vec2 uM,uPar;/); assert.match(gl, /gl\.uniform2f\(u\.uPar, run && rk >= 3/);
});

/* ---------- regulator: cząstki jako pierwsze pokrętło ---------- */
test('gov: przy przeciążeniu GPU najpierw maleje liczba cząstek (100→50→25→0 %), skala rozdzielczości stoi; po odciążeniu cząstki wracają dopiero po pełnej skali', () => {
  const J = load({ state: { settings: { hermesOn: false } } }), Gov = J.Gov;
  const st = { idx: 0 }, FR = [1, .5, .25, 0], ev = [];
  const host = { scalable: () => true, setStep: (i, s) => ev.push(['scale', s]), lower: () => false, raise: () => false, capped: () => false,
    shed: () => { if (st.idx >= 3) return false; st.idx++; ev.push(['shed', st.idx]); return true; }, canGrow: () => st.idx > 0, grow: () => { st.idx--; ev.push(['grow', st.idx]); return true; } };
  const g = new Gov(host), c = { t: 1000 };
  const run = (ms, gpuOf) => { const end = c.t + ms; while (c.t < end) { c.t += 16.7; g.update(c.t, 16.7, gpuOf(g.scale(), st.idx)); } };
  run(20000, (s, i) => s * s * (10 + 12 * FR[i]));   // 22 ms przy pełnych cząstkach, 10 ms bez nich (budżet ~11,9)
  assert.deepEqual(ev.slice(0, 3), [['shed', 1], ['shed', 2], ['shed', 3]], 'trzy kroki cząstek, żadnej zmiany skali przed nimi');
  assert.equal(g.scale(), 1, 'rozdzielczość nietknięta, gdy wystarczyły cząstki');
  /* odciążenie: wymuś skalę 0,7 i brak cząstek → najpierw skala w górę, potem cząstki */
  const n = ev.length; g.i = 2; g.reset(c.t, 0); g.lockUntil = 0; g.fails = 0; g.probe = null;
  run(60000, () => 4);
  const tail = ev.slice(n), firstGrow = tail.findIndex(e => e[0] === 'grow'), lastScale = tail.map(e => e[0]).lastIndexOf('scale');
  assert.ok(tail.some(e => e[0] === 'scale'), 'skala wraca'); assert.ok(firstGrow < 0 || firstGrow > lastScale, 'kolejność: wszystkie ruchy skali przed pierwszym wzrostem cząstek');
  assert.ok(tail.slice(0, firstGrow < 0 ? 0 : firstGrow).every(e => e[0] === 'scale'), 'przed pierwszym wzrostem cząstek tylko ruchy skali');
  assert.ok(st.idx < 3, 'cząstki zaczęły wracać');
});

test('gov: host bez cząstek (poniżej cinema, ustawienie wyłączone) zachowuje się jak dotąd — shed zwraca false i regulator schodzi skalą', () => {
  const J = load({ state: { settings: { hermesOn: false } } }), Gov = J.Gov, ev = [];
  const host = { scalable: () => true, setStep: (i, s) => ev.push(['scale', s]), lower: () => false, raise: () => false, capped: () => false, shed: () => false, canGrow: () => false, grow: () => false };
  const g = new Gov(host); let t = 1000; while (t < 20000) { t += 16.7; g.update(t, 16.7, 30 * g.scale() ** 2); }
  assert.ok(ev.length >= 1 && ev.every(e => e[0] === 'scale'));
});

/* ---------- fx-director: iskry (uBurst) ---------- */
const setupFxd = (rank = 3) => {
  const J = load({ state: { settings: { hermesOn: false } } }), ctx = J.__ctx; let now = 1e6;
  ctx.Date = { now: () => now }; ctx.performance = { now: () => now }; ctx.setTimeout = () => 1; ctx.clearTimeout = () => { };
  const el = ctx.document.createElement('div'); el.dataset = {}; el.style = { setProperty() { }, removeProperty() { } };
  J.fxd.el = el; J.fx = { rank: () => rank }; J.fxd.apply();
  return { J, el, advance: ms => { now += ms; }, setRank: r => { rank = r; } };
};
test('iskry GL: tool.started (siła .5) i task.completed (1) ustawiają tylko czas i siłę; cinema, nie w prezentacji, nie dla powtórek, najwyżej raz na 250 ms', () => {
  let t = setupFxd(3); assert.equal(t.J.fxd.sparkAt, 0, 'bez zdarzenia brak iskier');
  t.J.ev.emit('tool.started', { tool: 'x' }); assert.equal(t.J.fxd.sparkK, .5); const at = t.J.fxd.sparkAt; assert.ok(at > 0);
  t.advance(100); t.J.ev.emit('task.completed', { task_id: 'a' }); assert.equal(t.J.fxd.sparkAt, at, '< 250 ms: pominięte (nie zalewamy ekranu)');
  t.advance(200); t.J.ev.emit('task.completed', { task_id: 'a' }); assert.equal(t.J.fxd.sparkK, 1); assert.ok(t.J.fxd.sparkAt > at);
  t = setupFxd(3); t.J.ev.emit('tool.started', { replay: true }); t.J.ev.emit('task.completed', { replay: true }); assert.equal(t.J.fxd.sparkAt, 0, 'powtórka milczy');
  t = setupFxd(2); t.J.ev.emit('tool.started', {}); t.J.ev.emit('task.completed', {}); assert.equal(t.J.fxd.sparkAt, 0, 'standard: bez iskier');
  t = setupFxd(3); t.el.classList.add('present'); t.J.ev.emit('tool.started', {}); assert.equal(t.J.fxd.sparkAt, 0, 'prezentacja: bez iskier');
  t = setupFxd(3); t.J.ev.emit('tool.started', {}); t.setRank(2); t.J.emit('fx', 'standard'); assert.equal(t.J.fxd.sparkAt, 0, 'spadek poniżej cinema kasuje iskry');
  assert.ok(t.J.fxd.life.spark > 0 && t.J.fxd.life.spark < 1000, 'życie iskier < 1 s');
});

test('spec 09 §7: tabela „zdarzenie → efekt” obejmuje efekty 5B (okna, equalizer, paralaksa, tilt, iskry, deszcz, regulator) — każdy z emiterem w kodzie', () => {
  const sp = rd('docs/spec/09-wyglad-stany.md'), a = sp.indexOf('### Zdarzenie → efekt'), b = sp.indexOf('## 8. Dźwięki'), tab = sp.slice(a, b);
  for (const k of ['hologramowe otwarcie okna', 'zwija się do linii', 'equalizer', 'paralaksa', 'tilt karty', 'iskry GL', 'deszcz danych GL', 'zmniejsza liczbę cząstek']) assert.ok(tab.includes(k), 'brak wiersza: ' + k);
  for (const row of tab.split('\n').filter(l => /^\| /.test(l) && /cinema \|$/.test(l.trim()))) assert.ok(/`js\/[\w.-]+\.js:\d+=/.test(row), 'wiersz cinema bez emitera: ' + row.slice(0, 60));
  assert.match(sp, /cząstki GL \(deszcz danych, pył, iskry; 6 tys\. punktów/, 'opis poziomu cinema');
});

test('fx-cinema: paralaksa nie pracuje podczas gestu z wciśniętym przyciskiem (przeciąganie okna) — kod pointermove zeruje moveAt', () => {
  const src = rd('js/fx-cinema.js'); assert.match(src, /if \(e\.buttons\) \{ C\.moveAt = 0; return; \}/);
});

test('gest okna: #app.wdrag zakłada się przy starcie przeciągania/zmiany rozmiaru, zdejmuje przy końcu, a CSS zatrzymuje dekoracje animowane w nieskończoność', () => {
  const core = rd('js/core.js'), css = rd('css/neon.css');
  assert.match(core, /started = true; J\.\$\('#app'\)\?\.classList\.add\('wdrag'\)/); assert.match(core, /classList\.remove\('edge-snap', 'dragging'\); J\.\$\('#app'\)\?\.classList\.remove\('wdrag'\)/);
  assert.match(css, /#app\.wdrag :is\(#tsClock,#clockBig\) \.c\{animation:none!important\}/); assert.match(css, /#app\.wdrag :is\(\.hc-en,\.win-en\):before[^{]*\{animation-play-state:paused!important\}/);
});
