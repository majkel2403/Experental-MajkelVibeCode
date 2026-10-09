/* motyw „neon”: obecny w J.THEMES, w enumie set_theme i osiągalny poleceniem (z cofnięciem) */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../harness.js');

test('neon: akcent cyjan + magenta, enum set_theme bierze klucze J.THEMES', async () => {
  const J = load({ state: { settings: { hermesOn: false } } });
  assert.deepEqual(Array.from(J.THEMES.neon), ['#4df3ff', '#ff2bd6']);
  assert.equal(Object.keys(J.THEMES).length, 9);
  assert.ok(J.registry.get('set_theme').args.properties.color.enum.includes('neon'));
  const magenta = Object.entries(J.THEMES).filter(([, [a, b]]) => b === '#ff2bd6' || a === '#ff2bd6').map(([k]) => k);
  assert.deepEqual(magenta, ['neon'], 'magenta tylko w motywie neon');
  const r = await J.registry.run('set_theme', { color: 'neon' }, { source: 'local' });
  assert.equal(r.ok, true, r.text); assert.equal(J.state.settings.accent, '#4df3ff'); assert.equal(J.state.settings.accent2, '#ff2bd6');
});

test('alias koloru: „neon” i „cyberpunk” prowadzą do motywu neon (i tylko on)', () => {
  const J = load({ state: { settings: { hermesOn: false } } });
  const al = J.registry.aliases.color, who = w => Array.from(al.filter(([, re]) => re.test(w)).map(([v]) => v));
  assert.deepEqual(who('neon'), ['neon']); assert.deepEqual(who('cyberpunk'), ['neon']);
  assert.deepEqual(who('cyjan'), ['cyjan']);
  for (const [v] of al) assert.ok(v in J.THEMES, 'alias wskazuje istniejący motyw: ' + v);
});
