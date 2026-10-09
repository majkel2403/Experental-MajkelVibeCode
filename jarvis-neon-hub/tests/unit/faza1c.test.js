/* Faza 1C: canvas i runtime — fitCanvas (bez resetu bufora przy niecałkowitym DPR), cache rozmiaru, dirty-check J.spark. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../harness.js');

const cv = (cw, ch) => { let resets = 0, w = 0, h = 0; const ops = []; const o = { clientWidth: cw, clientHeight: ch, get width() { return w; }, set width(v) { w = v; resets++; }, get height() { return h; }, set height(v) { h = v; }, get resets() { return resets; }, ops, getContext: () => new Proxy({}, { get: (_, k) => (...a) => { ops.push(k); return { addColorStop() { } }; }, set: () => true }) }; return o; };

test('fitCanvas: bufor = round(CSS·DPR); przy DPR 1,25 i szerokości 282,5 nie jest resetowany przy kolejnych wywołaniach', () => {
  const J = load({});
  J.__ctx.devicePixelRatio = 1.25;
  const c = cv(282, 40);
  J.fitCanvas(c, 282.5, 40);
  assert.equal(c.width, Math.round(282.5 * 1.25)); assert.equal(c.height, 50);
  const r0 = c.resets;
  for (let i = 0; i < 5; i++) J.fitCanvas(c, 282.5, 40);
  assert.equal(c.resets, r0, 'ten sam rozmiar nie kasuje bufora');
  J.fitCanvas(c, 300, 40); assert.equal(c.width, 375);
});

test('fitCanvas: limit DPR', () => {
  const J = load({});
  J.__ctx.devicePixelRatio = 3;
  const c = cv(100, 50); const d = J.fitCanvas(c, 100, 50, 2);
  assert.equal(d, 2); assert.equal(c.width, 200);
});

test('canvasBox: zwraca rozmiar CSS i czyta go ponownie, dopóki canvas jest ukryty (0×0)', () => {
  const J = load({});
  const c = cv(0, 0);
  assert.equal(J.canvasBox(c).w, 0);
  c.clientWidth = 120; c.clientHeight = 30;
  const b = J.canvasBox(c); assert.equal(b.w, 120); assert.equal(b.h, 30);
});

test('J.spark: te same dane/kolor/rozmiar nie przerysowują, zmiana danych przerysowuje', () => {
  const J = load({});
  const c = cv(100, 30);
  J.spark(c, [1, 2, 3], '#39e5ff'); const n1 = c.ops.length; assert.ok(n1 > 0);
  J.spark(c, [1, 2, 3], '#39e5ff'); assert.equal(c.ops.length, n1, 'identyczne dane — bez rysowania');
  J.spark(c, [1, 2, 4], '#39e5ff'); assert.ok(c.ops.length > n1, 'nowe dane — rysuje');
  const n2 = c.ops.length; J.spark(c, [1, 2, 4], '#ff0000'); assert.ok(c.ops.length > n2, 'inny kolor — rysuje');
});

/* ---------- 1F: czat i Process Log ---------- */
const mkRec = (J, counters) => {
  const ctx = J.__ctx, orig = ctx.document.createElement, q = [];
  ctx.requestAnimationFrame = f => q.push(f); ctx.cancelAnimationFrame = () => { };
  ctx.document.createElement = tag => {
    const e = orig(tag); let v = ''; const rm = e.remove;
    Object.defineProperty(e, 'innerHTML', { get: () => v, set: x => { v = x; counters.html++; }, configurable: true });
    e.remove = () => { counters.removed++; rm(); };
    return e;
  };
  return { q, orig, flush: () => { const l = q.splice(0); l.forEach(f => f()); } };
};

test('czat: strumień jest koalescowany do 1 renderu na klatkę, a przycisk „przypnij” pojawia się dopiero po zakończeniu', () => {
  const J = load({ dom: true }), cnt = { html: 0, removed: 0 }, rec = mkRec(J, cnt);
  const box = rec.orig('div'); J.chat.bind(box); rec.flush();
  const b = J.chat.add('jarvis', ''); rec.flush(); cnt.html = 0;
  for (let i = 1; i <= 50; i++) b.stream('x'.repeat(i));
  assert.equal(cnt.html, 0, 'nic nie renderuje się synchronicznie w trakcie strumienia');
  assert.equal(b.text, 'x'.repeat(50), 'tekst jest zapamiętany od razu (zapis historii widzi pełną wartość)');
  rec.flush();
  assert.ok(cnt.html <= 2, 'po klatce: jeden render ogona (' + cnt.html + ')');
  const msg = box.children[box.children.length - 1];
  assert.equal(msg.children.some(c => /msg-pin/.test(c.className || '')), false, 'bez przycisku pin w trakcie strumienia');
  b.set('gotowe'); assert.equal(msg.children.filter(c => /msg-pin/.test(c.className || '')).length, 1, 'pin dodany raz po zakończeniu');
});

test('czat: limit DOM jak items[] (200) — nadmiarowe dymki są usuwane z drzewa', () => {
  const J = load({ dom: true }), cnt = { html: 0, removed: 0 }, rec = mkRec(J, cnt);
  const box = rec.orig('div'); J.chat.bind(box); rec.flush();
  const before = cnt.removed;
  for (let i = 0; i < 210; i++) J.chat.add('user', 'm' + i, true);
  assert.ok(cnt.removed - before >= 10, 'usunięto ' + (cnt.removed - before));
});

test('Process Log: end() nie przebudowuje już narysowanego logu', () => {
  const J = load({ dom: true }), cnt = { html: 0, removed: 0 }, rec = mkRec(J, cnt);
  const box = J.$('#lpSteps'); box.querySelector = () => null; Object.defineProperty(box, 'childElementCount', { get: () => box.children.length });
  J.proc.start('Zadanie testowe');
  for (let i = 0; i < 40; i++) J.proc.step('tool', 'krok ' + i, [['Arg', 'v' + i]]).done();
  rec.flush();
  const n = box.children.length; assert.ok(n >= 41);
  J.proc.end('ok', 'wynik');
  assert.equal(box.children.length, n, 'brak ponownego dopisywania kroków przy zakończeniu');
});

test('Process Log: okno DOM — przy długim logu rysowane jest tylko 150 ostatnich kroków (+ „pokaż starsze”)', () => {
  const J = load({ dom: true }), cnt = { html: 0, removed: 0 }, rec = mkRec(J, cnt);
  const box = J.$('#lpSteps'); box.querySelector = sel => sel === '.pstep' ? box.children.find(c => /pstep/.test(c.className || '')) || null : null; Object.defineProperty(box, 'childElementCount', { get: () => box.children.length });
  J.proc.start('Długie');
  for (let i = 0; i < 200; i++) J.proc.step('tool', 'krok ' + i, []).done();
  assert.ok(cnt.removed >= 50, 'starsze kroki zdjęte z DOM: ' + cnt.removed);
  assert.equal(J.proc.current.steps.length, 201, 'dane kroków zostają w pamięci');
});

/* ---------- poprawki po weryfikacji Fazy 1: wykres odświeża się po zmianie rozmiaru kontenera ---------- */
test('J.chart: zmiana rozmiaru (maksymalizacja / agentowy resize) przerysowuje wykres z ostatnich danych na nowym rozmiarze', () => {
  const J = load({}), ctx = J.__ctx; let cb = null;
  ctx.ResizeObserver = class { constructor(f) { cb = f; } observe() { } unobserve() { } };
  ctx.requestAnimationFrame = f => f();
  const c = cv(100, 60); c.isConnected = true;
  assert.equal(J.chart(c, [1, 3, 2, 5], { kind: 'line' }), true);
  assert.equal(c.width, 100);
  const n = c.ops.length;
  cb([{ target: c, contentRect: { width: 240, height: 90 } }]);   // toggleMax: ResizeObserver zgłasza nowy rozmiar
  assert.equal(c.width, 240, 'bufor dopasowany do nowego kontenera'); assert.equal(c.height, 90);
  assert.ok(c.ops.length > n, 'wykres przerysowany bez nowego wywołania z zewnątrz');
  cb([{ target: c, contentRect: { width: 240, height: 90 } }]); const m = c.ops.length;
  cb([{ target: c, contentRect: { width: 240, height: 90 } }]); assert.equal(c.ops.length, m, 'ten sam rozmiar nie przerysowuje');
});
