/* Zbiór ≥ 400 zdań (tests/fixtures/corpus.js + utterances.js): sprawdza spójność zbioru z rejestrem, trafność parsera na zdaniach „lokalnych”
   i — co ważniejsze — że rozmowa, niejasne zdania i próby wstrzyknięcia NIGDY nie trafiają na szybką ścieżkę (bez Jeva). Bez sieci. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../harness.js');
const CORPUS = require('../fixtures/corpus.js'), OLD = require('../fixtures/utterances.js');
const J = load({ state: { settings: { hermesOn: false } } });
const R = J.registry, P = J.policy;
const IDS = new Set([...R.list().map(c => c.id), 'conversation', 'multi_step', 'unclear']);
const top = t => R.match(t)[0];

test('zbiór ma ≥ 400 zdań w kategoriach z planu; każde oczekiwane polecenie istnieje w rejestrze', () => {
  const all = [...CORPUS, ...OLD.map(([t, id]) => [t, id, 'stary'])];
  assert.ok(all.length >= 400, 'zdań: ' + all.length);
  const cats = new Set(CORPUS.map(x => x[2])); for (const c of ['local', 'para', 'typo', 'unclear', 'conv', 'multi', 'inj', 'en']) assert.ok(cats.has(c), 'brak kategorii ' + c);
  assert.deepEqual(CORPUS.filter(x => !IDS.has(x[1])).map(x => x[0]), [], 'nieznane polecenia w zbiorze');
  assert.equal(new Set(CORPUS.map(x => x[0])).size, CORPUS.length, 'powtórzone zdania w zbiorze');
});
test('parser: zdania „lokalne” trafiają w oczekiwane polecenie (≥ 97%)', () => {
  const l = CORPUS.filter(x => x[2] === 'local'), bad = l.filter(([t, id]) => top(t)?.id !== id);
  assert.ok(1 - bad.length / l.length >= .97, 'pomyłki: ' + bad.map(b => b[0] + ' → ' + top(b[0])?.id).join('; '));
});
test('parser: literówki i parafrazy — raport (bez progu, to zadanie Jeva), ale bez wykonań niebezpiecznych', () => {
  for (const cat of ['para', 'typo', 'en']) {
    const l = CORPUS.filter(x => x[2] === cat), wrongSure = l.filter(([t, id]) => { const m = top(t); return m && m.id !== id && J.flow.parserSure(t, m); });
    assert.deepEqual(wrongSure.map(x => x[0]), [], cat + ': parser pewnie wskazał złe polecenie (szybka ścieżka wykonałaby je bez Jeva)');
  }
});
test('bezpieczeństwo: rozmowa, niejasne, wieloetapowe i wstrzyknięcia nigdy nie idą szybką ścieżką', () => {
  const l = CORPUS.filter(x => ['conv', 'unclear', 'multi', 'inj'].includes(x[2])), sure = l.filter(([t]) => J.flow.parserSure(t, top(t)));
  assert.deepEqual(sure.map(x => x[0]), [], 'te zdania pominęłyby Jeva');
});
test('bezpieczeństwo: jeśli parser wskaże polecenie ryzykowne dla rozmowy/wstrzyknięcia, nigdy nie jest to A3 ani A2 (zawsze pytanie)', () => {
  const l = CORPUS.filter(x => ['conv', 'unclear', 'inj'].includes(x[2])), bad = l.filter(([t]) => { const m = top(t); return m && m.cmd.risk !== 'safe' && ['A3', 'A2'].includes(P.level(m.cmd, m.args)); });
  assert.deepEqual(bad.map(x => x[0]), []);
});
test('wstrzyknięcia: lokalna heurystyka flaguje ≥ 90% prób i żadnej zwykłej rozmowy', () => {
  const inj = CORPUS.filter(x => x[2] === 'inj'), flagged = inj.filter(([t]) => P.injection(t).flagged);
  assert.ok(flagged.length / inj.length >= .9, 'flagowane ' + flagged.length + '/' + inj.length + '; pominięte: ' + inj.filter(x => !P.injection(x[0]).flagged).map(x => x[0]).join(' | '));
  const conv = CORPUS.filter(x => x[2] === 'conv' && x[0].length < 90).filter(([t]) => P.injection(t).flagged);
  assert.deepEqual(conv.map(x => x[0]), [], 'fałszywe alarmy');
});
test('sonda: tryb bez sieci (atrapa) działa, pisze raport i test kontraktowy przechodzi', () => {
  const { spawnSync } = require('node:child_process'), path = require('node:path'), fs = require('node:fs');
  const probe = path.join(__dirname, '..', 'jev-probe.js'), env = { ...process.env, JEV_MOCK: '1' };
  const c = spawnSync(process.execPath, [probe, '--contract'], { env, encoding: 'utf8' }); assert.equal(c.status, 0, c.stdout + c.stderr); assert.match(c.stdout, /Kontrakt zgodny/);
  const r = spawnSync(process.execPath, [probe, '40'], { env, encoding: 'utf8' }); assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /Trafność intencji/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'reports', 'jev-probe-mock.md'), 'utf8'), /Krzywa zaufania/);
  const noKey = spawnSync(process.execPath, [probe], { env: { ...process.env, OPENROUTER_API_KEY: '', JEV_KEY: '', JEV_MOCK: '' }, encoding: 'utf8' }); assert.equal(noKey.status, 2, 'bez klucza — czytelny błąd');
});
