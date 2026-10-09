/* logika stanów Orba (J.orbLook: kolor rdzenia + „oddech”) i progi diody FPS (J.fpsBand) — czyste funkcje, bez canvasa */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { load } = require('../harness.js');
const J = load({ state: { settings: { hermesOn: false } } });
const look = (mode, o = {}) => J.orbLook({}, mode, o.since ?? 5000, o.t ?? 0, !!o.standby, !!o.idle, o.ov ?? null, o.accent ?? '51,214,255');

test('kolor: nadpisanie stanu wygrywa, STANDBY = przygaszony cyjan, inaczej akcent motywu', () => {
  assert.equal(look('IDLE').col, '51,214,255');
  assert.equal(look('IDLE', { standby: true }).col, '70,150,185');
  assert.equal(look('ERROR', { ov: '255,59,92' }).col, '255,59,92');
  assert.equal(look('IDLE', { standby: true, ov: '1,2,3' }).col, '1,2,3');
});

test('oddech: APPROVAL oddycha .44..1, PAUSED stoi na .5, RECOVERING miga 1/.38, STANDBY .55, IDLE .56..1, reszta 1', () => {
  const sw = m => [0, 650 * Math.PI / 2, 650 * Math.PI * 1.5].map(t => look(m, { t }).breath);
  const ap = sw('APPROVAL_REQUIRED'); assert.ok(Math.abs(ap[0] - .72) < 1e-9 && Math.abs(ap[1] - 1) < 1e-9 && Math.abs(ap[2] - .44) < 1e-9, 'APPROVAL: ' + ap);
  assert.equal(look('PAUSED').breath, .5);
  assert.equal(look('RECOVERING', { t: 700 * Math.PI / 2 }).breath, 1); assert.equal(look('RECOVERING', { t: 700 * Math.PI * 1.5 }).breath, .38);
  assert.equal(look('IDLE', { standby: true }).breath, .55);
  assert.ok(Math.abs(look('IDLE', { idle: true, t: 0 }).breath - .78) < 1e-9); assert.ok(Math.abs(look('IDLE', { idle: true, t: 1600 * Math.PI / 2 }).breath - 1) < 1e-9);
  for (const m of ['THINKING', 'EXECUTING', 'COMPLETED', 'LISTENING', 'VERIFYING']) assert.equal(look(m).breath, 1, m);
});

test('ERROR: dwa pulsy w pierwszych 1,2 s (maksima ~1,45 przy since 150/750 ms), potem 1', () => {
  const b = since => look('ERROR', { since }).breath;
  assert.ok(Math.abs(b(150) - 1.45) < 1e-9 && Math.abs(b(750) - 1.45) < 1e-9, 'maksima pulsów: ' + b(150) + ' ' + b(750));
  const near = (x, y) => Math.abs(x - y) < 1e-9; assert.ok(near(b(300), 1) && near(b(0), 1)); assert.ok(near(b(450), 1) && near(b(900), 1), 'zero poza pulsami (sin<0)');
  const peaks = []; for (let s = 1; s < 1200; s += 10) { const v = b(s), p = b(s - 10), n = b(s + 10); if (v > 1.2 && v >= p && v >= n) peaks.push(s); }
  assert.equal(peaks.length, 2, 'dokładnie dwa pulsy: ' + peaks); assert.equal(b(1200), 1); assert.equal(b(5000), 1);
});

test('dioda FPS: progi 29/30/54/55 i brak pomiaru', () => {
  assert.equal(J.fpsBand(29), 'bad'); assert.equal(J.fpsBand(30), 'down'); assert.equal(J.fpsBand(54), 'down'); assert.equal(J.fpsBand(55), 'up');
  assert.equal(J.fpsBand(60), 'up'); assert.equal(J.fpsBand(1), 'bad'); assert.equal(J.fpsBand(0), ''); assert.equal(J.fpsBand(undefined), '');
});
test('progi FPS wspólne: dash.js i regulator efektów (gov.js) czytają J.FPS_LOW / J.FPS_OK', () => {
  const root = path.join(__dirname, '..', '..'), rd = f => fs.readFileSync(path.join(root, 'js', f), 'utf8');
  assert.equal(J.FPS_LOW, 30); assert.equal(J.FPS_OK, 55);
  assert.ok(!/adapt\(/.test(rd('main.js')), 'adapt() usunięte: jedno źródło decyzji to gov.js'); assert.ok(/J\.gov\.frame\(/.test(rd('main.js')), 'pętla rAF karmi regulator');
  assert.ok(/J\.fpsBand\(fps\)/.test(rd('dash.js')), 'dioda używa J.fpsBand');
});
