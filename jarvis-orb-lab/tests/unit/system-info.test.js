/* Polecenie system_info (js/agents.js): rozpoznawanie zdań, wywołanie mostu (/bridge/system), poziom zgody.
   Moduł mostu ma własne testy: bridge/test_system_info.py i bridge/test_bridge.py. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../harness.js');

const mk = (reply) => {
  const calls = [];
  const fetch = async url => { calls.push(url); return { ok: true, status: 200, json: async () => reply }; };
  const J = load({ dom: true, fetch, state: { settings: { bridgeOn: false, bridgeToken: 't', bridgeUrl: 'http://b', hermesOn: false } } });
  return { J, calls };
};

test('zdania o dysku, pamięci i stanie komputera → system_info (z literą dysku)', () => {
  const { J } = mk({}), m = t => J.registry.match(t)[0];
  assert.equal(m('Ile mam miejsca na dysku?').id, 'system_info');
  assert.deepEqual(JSON.parse(JSON.stringify(m('ile wolnego miejsca na dysku C').args)), { drive: 'C' });
  assert.deepEqual(JSON.parse(JSON.stringify(m('ile miejsca na dysku d').args)), { drive: 'D' });
  for (const t of ['ile mam wolnej pamięci ram', 'co zjada pamięć', 'stan komputera', 'jak długo działa komputer']) assert.equal(m(t)?.id, 'system_info', t);
});

test('nie kradnie zdań innych poleceń', () => {
  const { J } = mk({}), m = t => J.registry.match(t)[0]?.id;
  assert.equal(m('ile mam wolnego miejsca w notatkach'), undefined);
  assert.equal(m('ile mam zadań'), undefined);
  assert.equal(m('ile to jest 15% z 240'), 'calculate');
  assert.equal(m('jaka jest pogoda'), 'get_weather');
  assert.equal(m('otwórz monitor systemu'), 'open_app');
  assert.equal(m('otwórz eksplorator plików'), 'open_app');
});

test('run: woła most z literą dysku i liczbą procesów, oddaje tekst z mostu', async () => {
  const { J, calls } = mk({ ok: true, data: { disks: [{ drive: 'C', free_gb: 34.3, total_gb: 475.7 }] }, text: 'Dysk C: wolne 34,3 GB z 475,7 GB (zajęte 92,8%).' });
  const r = await J.registry.run('system_info', { drive: 'C', processes: 2 });
  assert.equal(r.ok, true); assert.match(r.text, /Dysk C: wolne 34,3 GB/);
  assert.match(calls[0], /\/bridge\/system\?drive=C&processes=2$/);
  const r2 = await J.registry.run('system_info', {}); assert.match(calls[1], /\/bridge\/system$/, 'bez argumentów — bez zapytania');
  assert.equal(r2.ok, true);
});

test('most niedostępny → czytelny błąd, nie wyjątek', async () => {
  const J = load({ dom: true, fetch: async () => { throw new TypeError('fetch failed'); }, state: { settings: { bridgeOn: false, bridgeToken: 't', bridgeUrl: 'http://b', hermesOn: false } } });
  const r = await J.registry.run('system_info', {});
  assert.equal(r.ok, false); assert.match(r.code, /OFFLINE|INTERNAL/);
});

test('poziom zgody: sam odczyt, bez pytania (A3), bez skutków ubocznych', () => {
  const { J } = mk({});
  assert.equal(J.policy.level('system_info'), 'A3');
  const c = J.registry.get ? J.registry.get('system_info') : null;
  if (c) { assert.ok(c.idempotent); assert.ok(!(c.writes || []).length); }
});
