/* Luki z audytu 2026-10-05: trzy polecenia bez żadnego testu (palette_open, notes_dictate, web_task_status)
   oraz limit wpisów systemowych w Process Logu. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../harness.js');

const plain = x => JSON.parse(JSON.stringify(x));
const mk = (reply) => {
  const urls = [];
  const fetch = async url => { urls.push(url); return { ok: true, status: 200, json: async () => reply }; };
  return { J: load({ dom: true, fetch, state: { settings: { bridgeOn: false, bridgeToken: 't', bridgeUrl: 'http://b', hermesOn: false } } }), urls };
};

test('palette_open: otwiera paletę z zapytaniem albo bez', async () => {
  const { J } = mk({}), seen = [];
  J.palette = { open: q => seen.push(q) };
  const r = await J.registry.run('palette_open', { query: 'notat' });
  assert.equal(r.ok, true); assert.equal(r.text, 'Paleta otwarta.');
  await J.registry.run('palette_open', {});
  assert.deepEqual(seen, ['notat', undefined]);
  assert.equal(J.registry.get?.('palette_open')?.hermes, false, 'paleta to funkcja pulpitu — nie narzędzie Hermesa');
});

test('notes_dictate: zdania, koniec dyktowania, brak otwartej notatki', async () => {
  const { J } = mk({}), m = t => J.registry.match(t)[0];
  assert.deepEqual(plain(m('koniec dyktowania').args), { stop: true });
  assert.equal(m('zakończ dyktowanie').id, 'notes_dictate');
  assert.deepEqual(plain(m('dyktuj do tej notatki').args), { note: 'current' });
  assert.equal(m('dyktuj do notatki zakupy').args.note, 'zakupy');
  const stop = await J.registry.run('notes_dictate', { stop: true });
  assert.equal(stop.ok, true); assert.equal(stop.text, 'Dyktowanie nie trwa.'); assert.equal(stop.data.active, false);
  const none = await J.registry.run('notes_dictate', {});   // brak otwartej notatki
  assert.equal(none.ok, false); assert.equal(none.code, 'INVALID_ARGS');
});

test('web_task_status: bezczynne i trwające zadanie, błąd mostu', async () => {
  const idle = mk({ state: 'idle' });
  const r = await idle.J.registry.run('web_task_status', {});
  assert.equal(r.ok, true); assert.equal(r.text, 'Żadne zadanie w internecie nie było uruchomione.'); assert.match(idle.urls[0], /\/agents\/webtask\/status$/);
  const busy = mk({ state: 'running', goal: 'znajdź najtańszy bilet do Gdańska', steps: [{ n: 1, text: 'otwieram stronę' }], step: 1 });
  const b = await busy.J.registry.run('web_task_status', {});
  assert.equal(b.ok, true); assert.match(b.text, /znajdź najtańszy bilet do Gdańska/);
  const J = load({ dom: true, fetch: async () => { throw new TypeError('fetch failed'); }, state: { settings: { bridgeOn: false, bridgeToken: 't', bridgeUrl: 'http://b', hermesOn: false } } });
  const off = await J.registry.run('web_task_status', {});
  assert.equal(off.ok, false); assert.match(off.code, /OFFLINE|INTERNAL/);
});

test('Process Log: wpisy systemowe mają limit 300 na zadanie, prawdziwe kroki nie', () => {
  const { J } = mk({});
  J.proc.start('Długie zadanie');
  for (let i = 0; i < 450; i++) J.log('wpis ' + i, 'szczegół');
  assert.equal(J.proc.current.steps.length <= 301, true, 'kroków: ' + J.proc.current.steps.length);
  const before = J.proc.current.steps.length;
  J.proc.step('server', 'Prawdziwy krok po limicie', [], {});
  assert.equal(J.proc.current.steps.length, before + 1, 'krok narzędzia nie jest ucinany limitem');
  J.log('jeszcze jeden wpis systemowy');
  assert.equal(J.proc.current.steps.length, before + 1, 'wpisy systemowe nadal pomijane');
  J.proc.end('ok', 'koniec');
  J.proc.start('Następne zadanie'); J.log('świeży wpis');
  assert.equal(J.proc.current.steps.length >= 1, true, 'nowe zadanie znów przyjmuje wpisy');
});
