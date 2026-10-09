/* paleta stanów: w każdym motywie IDLE/THINKING/APPROVAL/ERROR/COMPLETED różnią się odcieniem o ≥ 35° (Faza 2, poprawki po weryfikacji) */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../harness.js');

const STATES = ['IDLE', 'THINKING', 'APPROVAL_REQUIRED', 'ERROR', 'COMPLETED'];
const hue = rgb => { const [r, g, b] = rgb.split(',').map(n => n / 255), mx = Math.max(r, g, b), d = mx - Math.min(r, g, b); if (!d) return 0; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
const gap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

test('każdy z motywów J.THEMES: pięć stanów rozróżnialnych odcieniem (≥ 35°)', () => {
  const J = load({ state: { settings: { hermesOn: false } } });
  for (const [name, [a, b]] of Object.entries(J.THEMES)) {
    const P = J.statePalette(a, b);
    for (let i = 0; i < STATES.length; i++) for (let j = i + 1; j < STATES.length; j++) {
      const d = gap(hue(P[STATES[i]]), hue(P[STATES[j]]));
      assert.ok(d >= 35, `${name}: ${STATES[i]} ↔ ${STATES[j]} tylko ${d.toFixed(1)}° (${P[STATES[i]]} vs ${P[STATES[j]]})`);
    }
  }
});

test('motywy bez kolizji zachowują nominalne barwy planu (ERROR #ff3b5c, APPROVAL #ffb020, COMPLETED #3dffa0)', () => {
  const J = load({ state: { settings: { hermesOn: false } } });
  const P = J.statePalette(...J.THEMES.jarvis);
  assert.equal(P.ERROR, '255,59,92'); assert.equal(P.APPROVAL_REQUIRED, '255,176,32'); assert.equal(P.COMPLETED, '61,255,160');
  assert.equal(P.IDLE, '51,214,255'); assert.equal(P.THINKING, '162,92,255');
});

test('engine.rgb() czyta paletę aktualnego motywu (kolizja przesuwa odcień, IDLE zostaje akcentem)', () => {
  const J = load({ state: { settings: { hermesOn: false, accent: '#ff4d6d', accent2: '#ffb84d' } } });
  J.ev.emit('task.created', { task_id: 'a' }); J.ev.emit('task.failed', { task_id: 'a' });
  const err = J.engine.rgb(), idle = J.rgb('#ff4d6d');
  assert.notEqual(err, '255,59,92', 'czerwony motyw: ERROR nie może być czerwienią akcentu');
  assert.ok(gap(hue(err), hue(idle)) >= 35);
});

test('niestandardowy, nienasycony akcent nie psuje palety', () => {
  const J = load({ state: { settings: { hermesOn: false } } });
  const P = J.statePalette('#888888', '#aaaaaa');
  for (const k of STATES) assert.match(P[k], /^\d+,\d+,\d+$/);
});

test('THINKING i ERROR różnią się wyraźnie (≥ 60°) w każdym motywie, w tym neon (magenta vs czerwień)', () => {
  const J = load({ state: { settings: { hermesOn: false } } });
  for (const [name, [a, b]] of Object.entries(J.THEMES)) { const P = J.statePalette(a, b), d = gap(hue(P.THINKING), hue(P.ERROR)); assert.ok(d >= 60, `${name}: THINKING ↔ ERROR tylko ${d.toFixed(1)}°`); }
  const n = J.statePalette(...J.THEMES.neon); assert.ok(gap(hue(n.THINKING), hue(J.rgb(J.THEMES.neon[1]))) > 10, 'neon: THINKING przesunięty względem czystej magenty akcentu 2');
});
