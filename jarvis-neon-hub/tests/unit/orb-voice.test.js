/* amplituda Orba przy mowie: z onboundary, a bez nich stała spokojna (bez losowości) */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../harness.js');

/* atrapa syntezy: zapamiętuje utterance, testy sterują onstart/onboundary/onend ręcznie */
const setup = () => {
  const spoken = [];
  const J = load({ state: { settings: { hermesOn: false, speech: true } }, globals: { speechSynthesis: { getVoices: () => [], speak: u => spoken.push(u), cancel() { } }, SpeechSynthesisUtterance: function (t) { this.text = t; } } });
  return { J, spoken };
};

test('amp: bez mowy i bez boundary stała spokojna wartość (deterministyczna)', () => {
  const { J } = setup();
  const a = [0, 50, 500, 5000].map(t => J.voice.amp(t));
  assert.ok(a.every(x => x === a[0]) && a[0] > 0 && a[0] < 1, 'stała: ' + a);
});

test('amp: onstart bez boundary -> nadal stała; onboundary daje impuls opadający; onend zeruje', () => {
  const { J, spoken } = setup(); const V = J.voice;
  V.speak('Dzień dobry, to jest test.'); const u = spoken[0]; assert.ok(u, 'utterance powstał');
  u.onstart(); assert.equal(V.speaking, true);
  const calm = V.amp(100); assert.equal(V.amp(900), calm, 'brak boundary: stała, bez losowania');
  const t0 = performance.now(); u.onboundary({});
  const hi = V.amp(t0 + 5), mid = V.amp(t0 + 200), lo = V.amp(t0 + 2000);
  assert.ok(hi > mid && mid > lo, `opada: ${hi} > ${mid} > ${lo}`); assert.ok(hi <= 1 && lo >= .3 - 1e-9);
  u.onend(); assert.equal(V.speaking, false); assert.equal(V.amp(t0 + 5), calm, 'po onend znów stała (impuls zerowany)');
});

test('main.js: ścieżka rysowania Orba nie używa Math.random do amplitudy mowy', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../js/main.js'), 'utf8');
  const orb = src.slice(src.indexOf('let orbT = 0'), src.indexOf('orbAmp += (target - orbAmp)'));
  assert.ok(orb.length > 200 && !/Math\.random/.test(orb));
});
