/* Spójność specyfikacji (docs/spec): katalogi aktualne względem kodu, planowane polecenia poprawne i opisane,
   przykłady widgetów zgodne ze schematem i z rejestrem, zdania testowe dla każdego planowanego polecenia, odnośniki w dokumentach działają. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { spawnSync } = require('node:child_process');
const { load } = require('../harness.js');
const { validate } = require('../../tools/schema-lite.js');
const ROOT = path.join(__dirname, '..', '..'), SPEC = path.join(ROOT, 'docs', 'spec');
const NEW = require('../../docs/spec/nowe-polecenia.js');
const CORPUS_NEW = require('../fixtures/corpus-nowe.js'), CORPUS = require('../fixtures/corpus.js');
const J = load({ state: { settings: { hermesOn: false } } });
const R = J.registry, P = J.policy;
const WAVES = ['W1', 'W2', 'W3', 'W4', 'W5'];
const DATA_WRITES = ['notes', 'tasks', 'files', 'memory', 'chat', 'routines', 'alerts', 'timers', 'shortcuts', 'layouts'];

test('katalogi w docs/spec są aktualne względem kodu (node tools/gen-spec.js)', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'gen-spec.js'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr + r.stdout);
});

test('planowane polecenia: unikalne, bez kolizji z rejestrem (poza rozszerzeniami), poprawne schematy i pola', () => {
  const ids = NEW.map(c => c.id); assert.equal(new Set(ids).size, ids.length, 'powtórzone id');
  for (const c of NEW) {
    const exists = !!R.get(c.id);
    if (c.extends) assert.ok(exists, c.id + ': rozszerzenie nieistniejącego polecenia'); else assert.ok(!exists, c.id + ': już jest w rejestrze — przenieś do „extends” albo usuń z planu');
    assert.match(c.id, /^[a-z][a-z0-9_]{1,40}$/, c.id);
    for (const f of ['group', 'label', 'description', 'level', 'risk', 'phase', 'doc']) assert.ok(c[f], c.id + ': brak pola ' + f);
    assert.ok(WAVES.includes(c.phase), c.id + ': fala ' + c.phase);
    assert.equal(c.args?.type, 'object', c.id + ': args.type');
    for (const r of c.args.required || []) assert.ok(c.args.properties[r], c.id + ': wymagane „' + r + '” nie ma w properties');
    for (const [k, v] of Object.entries(c.args.properties)) { assert.ok(v.type || v.enum, c.id + '.' + k + ': brak typu'); if (v.enum) assert.ok(v.enum.length && new Set(v.enum).size === v.enum.length, c.id + '.' + k + ': enum'); }
    assert.ok(c.examples?.length >= 3, c.id + ': mniej niż 3 przykłady');
    assert.ok(Array.isArray(c.writes), c.id + ': writes');
  }
});

test('planowane polecenia: zasady poziomów autonomii (jak w js/jev-policy.js)', () => {
  for (const c of NEW) {
    assert.match(c.level, /^A[0-3]$/, c.id);
    if (c.level === 'A0') assert.equal(c.risk, 'confirm', c.id + ': A0 musi mieć risk=confirm');
    if (c.risk === 'confirm') assert.equal(c.level, 'A0', c.id + ': risk=confirm tylko dla A0');
    if (c.level === 'A2') assert.ok(c.undo, c.id + ': A2 wymaga opisu cofania');
    if (c.level === 'A3') assert.ok(!c.writes.some(w => DATA_WRITES.includes(w)), c.id + ': A3 nie może zmieniać danych użytkownika (' + c.writes + ')');
    if (c.writes.some(w => DATA_WRITES.includes(w)) && !c.undo) assert.equal(c.level, 'A0', c.id + ': zapis danych bez cofania musi być A0');
  }
  // rozszerzenia nie mogą osłabić istniejącej ochrony bez jawnej flagi (poziom zależny od argumentów)
  for (const c of NEW.filter(x => x.extends)) {
    const cur = P.level(R.get(c.id)), order = ['A3', 'A2', 'A1', 'A0'];
    if (order.indexOf(c.level) < order.indexOf(cur)) assert.ok(c.levelDependsOnArgs, c.id + ': obniża poziom ' + cur + ' → ' + c.level + ' bez levelDependsOnArgs');
  }
});

test('każde planowane polecenie jest opisane w swoim dokumencie i ma dokument', () => {
  for (const c of NEW) {
    const f = path.join(SPEC, c.doc); assert.ok(fs.existsSync(f), c.id + ': brak ' + c.doc);
    assert.ok(fs.readFileSync(f, 'utf8').includes(c.id), c.id + ': nie występuje w ' + c.doc);
  }
});

test('zdania dla planowanych poleceń: każde polecenie ma ≥ 2 zdania, bez powtórzeń i kolizji z obecnym zbiorem', () => {
  const ids = new Set(NEW.map(c => c.id));
  for (const [t, id, cat] of CORPUS_NEW) { assert.ok(ids.has(id), '„' + t + '” → nieznane planowane polecenie ' + id); assert.ok(['local', 'para'].includes(cat), t); }
  for (const c of NEW) assert.ok(CORPUS_NEW.filter(x => x[1] === c.id).length >= 2, c.id + ': mniej niż 2 zdania w corpus-nowe.js');
  const texts = CORPUS_NEW.map(x => x[0]); assert.equal(new Set(texts).size, texts.length, 'powtórzone zdania');
  const old = new Set(CORPUS.map(x => x[0])); assert.deepEqual(texts.filter(t => old.has(t)), [], 'zdania już są w corpus.js');
  for (const c of NEW) for (const e of c.examples) assert.ok(!texts.includes(e), c.id + ': przykład „' + e + '” powtórzony w corpus-nowe (ma być parafraza)');
});

test('bezpieczeństwo planu: zdania dla nowych zapisów nie trafiają dziś na szybką ścieżkę parsera jako inne polecenie zapisujące', () => {
  // dziś parser nie zna nowych poleceń; ważne, żeby nie wykonał po cichu czegoś innego (A3 z zapisem jest niemożliwe, więc sprawdzamy zgodność poziomu)
  for (const [t] of CORPUS_NEW) {
    const m = R.match(t)[0]; if (!m || !J.flow.parserSure(t, m)) continue;
    assert.equal(P.level(m.cmd, m.args), 'A3', '„' + t + '” → szybka ścieżka ' + m.id + ' (poziom ' + P.level(m.cmd, m.args) + ')');
  }
});

test('widgety z opisu: 5 przykładów zgodnych ze schematem, źródła = istniejące polecenia A3 z poprawnymi argumentami, przyciski = polecenia rejestru lub planowane', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(SPEC, 'widget.schema.json'), 'utf8'));
  const ex = JSON.parse(fs.readFileSync(path.join(SPEC, 'widget-przyklady.json'), 'utf8'));
  assert.ok(ex.length >= 5);
  const known = id => !!R.get(id) || NEW.some(c => c.id === id);
  for (const { prompt, spec } of ex) {
    assert.deepEqual(validate(schema, spec), [], prompt);
    for (const [name, s] of Object.entries(spec.sources || {})) {
      const cmd = R.get(s.command); assert.ok(cmd, prompt + ': źródło ' + s.command + ' nie istnieje');
      assert.equal(P.level(cmd, s.args || {}), 'A3', prompt + ': źródło ' + s.command + ' musi być odczytem (A3)');
      assert.notEqual(R.coerce(s.command, s.args || {}).ok, false, prompt + ': złe argumenty źródła ' + name);
      assert.ok(!s.refresh || s.refresh >= 15, prompt + ': odświeżanie co ≥ 15 s');
    }
    const refs = JSON.stringify(spec.blocks).match(/\$([a-z][a-z0-9_]*)\./g) || [];
    for (const r of refs) assert.ok(spec.sources && spec.sources[r.slice(1, -1)], prompt + ': odnośnik ' + r + ' do nieistniejącego źródła');
    for (const b of spec.blocks) {
      for (const btn of b.buttons || []) assert.ok(known(btn.command), prompt + ': przycisk → ' + btn.command);
      if (b.on_check) assert.ok(known(b.on_check), prompt + ': on_check → ' + b.on_check);
    }
  }
  // opisy niedozwolone są odrzucane
  for (const bad of [{ v: 1, title: 'x', blocks: [{ kind: 'html', html: '<b>' }] }, { v: 1, title: 'x', blocks: [{ kind: 'text', text: 'a', onclick: 'x()' }] }, { v: 1, title: 'x', blocks: [] }, { v: 2, title: 'x', blocks: [{ kind: 'divider' }] }, { v: 1, title: 'x', blocks: [{ kind: 'divider' }], script: 'alert(1)' }])
    assert.notDeepEqual(validate(schema, bad), [], JSON.stringify(bad));
});

test('dokumenty: README wymienia każdy plik, a wszystkie odnośniki względne prowadzą do istniejących plików', () => {
  const files = fs.readdirSync(SPEC).filter(f => /\.(md|json|js)$/.test(f) && f !== 'README.md');
  const readme = fs.readFileSync(path.join(SPEC, 'README.md'), 'utf8');
  for (const f of files) assert.ok(readme.includes(f), 'README nie wymienia ' + f);
  for (const f of fs.readdirSync(SPEC).filter(f => f.endsWith('.md'))) {
    const src = fs.readFileSync(path.join(SPEC, f), 'utf8');
    for (const m of src.matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)/g)) {
      if (/^https?:/.test(m[1])) continue;
      assert.ok(fs.existsSync(path.join(SPEC, m[1])), f + ': zły odnośnik ' + m[1]);
    }
  }
});
