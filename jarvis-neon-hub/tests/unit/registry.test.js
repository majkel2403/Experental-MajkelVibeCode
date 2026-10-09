'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const eq = (a, b, m) => assert.equal(JSON.stringify(a), JSON.stringify(b), m);
const { load } = require('../harness.js');
const J = load({ state: { settings: { hermesOn: false } } });
const R = J.registry;

const TABLE = require('../fixtures/utterances.js').filter(([, id]) => id !== 'conversation' && id !== 'multi_step');
for (const [text, id, args] of TABLE) {
  test('match: ' + text, () => {
    const m = R.match(text)[0];
    assert.ok(m, 'brak dopasowania dla „' + text + '”');
    assert.equal(m.id, id, 'oczekiwano ' + id + ', jest ' + m.id + ' ' + JSON.stringify(m.args));
    for (const [k, v] of Object.entries(args || {})) eq(m.args[k], v, 'arg ' + k + ' w ' + JSON.stringify(m.args));
  });
}
test('match: brak dopasowania dla swobodnego tekstu', () => {
  assert.equal(R.match('opowiedz mi o teorii względności')[0], undefined);
  assert.equal(R.match('hej')[0], undefined);
});
test('chain: dwa polecenia w jednym zdaniu', () => {
  const c = R.chain('otwórz harmonogram i ułóż okna');
  eq(c.map(m => m.id), ['open_app', 'wm_arrange']);
  assert.equal(R.match('otwórz harmonogram i ułóż okna')[0], undefined);   // całość nie udaje jednego polecenia
  assert.equal(R.chain('zanotuj: mleko i chleb'), null);   // „i” w treści notatki to nie łańcuch — całość pasuje do create_note
  assert.equal(R.match('zanotuj: mleko i chleb')[0].id, 'create_note');
});
test('coerce: typy, enum przez aliasy, format czasu i daty', () => {
  eq(R.coerce('open_app', { app: 'notatnik' }).args, { app: 'notes' });
  assert.equal(R.coerce('open_app', { app: 'lodówka' }).code, 'INVALID_ARGS');
  assert.equal(R.coerce('open_app', {}).code, 'INVALID_ARGS');
  eq(R.coerce('start_timer', { seconds: '300', show: 'nie' }).args, { seconds: 300, show: false });
  assert.equal(R.coerce('start_timer', { seconds: 'dużo' }).code, 'INVALID_ARGS');
  const t = R.coerce('add_task', { text: 'x', time: '18', date: 'jutro' }).args;
  assert.equal(t.time, '18:00'); assert.match(t.date, /^\d{4}-\d{2}-\d{2}$/);
  eq(R.coerce('create_widget', { type: 'list', title: 't', items: 'a, b\nc' }).args.items, ['a', 'b', 'c']);
  eq(R.coerce('set_theme', { color: 'purpurowy' }).args, { color: 'fiolet' });
});
test('tools: definicje dla modelu mają schemat i opis', () => {
  const tools = R.tools();
  assert.ok(tools.length >= 50);
  for (const t of tools) { assert.equal(t.type, 'function'); assert.ok(t.function.name && t.function.description); assert.equal(t.function.parameters.type, 'object'); assert.match(t.function.name, /^[a-z0-9_]+$/); }
  assert.ok(!tools.find(t => t.function.name === 'help'), 'help nie jest narzędziem modelu');
});
test('run: koperta wyniku, NOT_FOUND, AMBIGUOUS', async () => {
  const r = await R.run('nope', {}, { source: 'ui' }); assert.equal(r.ok, false); assert.equal(r.code, 'NOT_FOUND');
  const n1 = await R.run('create_note', { title: 'Zakupy', content: 'mleko', show: false }, { source: 'ui' });
  assert.equal(n1.ok, true); assert.equal(n1.code, 'OK'); assert.equal(n1.data.title, 'Zakupy');
  await R.run('create_note', { title: 'Zakupy weekend', content: 'x', show: false }, { source: 'ui' });
  const amb = await R.run('notes_read', { note: 'zakupy' }, { source: 'ui' });
  assert.equal(amb.ok, true, 'dokładny tytuł wygrywa');   // norm('Zakupy') === 'zakupy'
  const amb2 = await R.run('notes_append', { note: 'zaku', text: 'y' }, { source: 'ui' });
  assert.equal(amb2.code, 'AMBIGUOUS'); assert.equal(amb2.data.candidates.length, 2);
  const nf = await R.run('notes_read', { note: 'nie ma takiej' }, { source: 'ui' }); assert.equal(nf.code, 'NOT_FOUND');
});
test('run: potwierdzenia — źródło hermes pyta, ui nie; DENIED; zawsze zezwalaj', async () => {
  let asked = 0; J.confirm = async () => { asked++; return 'no'; };
  await R.run('create_note', { title: 'Do usunięcia', content: 'x', show: false }, { source: 'ui' });
  const d = await R.run('notes_delete', { note: 'Do usunięcia' }, { source: 'hermes' });
  assert.equal(d.code, 'DENIED'); assert.equal(asked, 1);
  const ok = await R.run('notes_delete', { note: 'Do usunięcia' }, { source: 'local' });
  assert.equal(ok.ok, true); assert.equal(asked, 1, 'polecenie użytkownika nie pyta');
  J.confirm = async () => 'always';
  await R.run('create_note', { title: 'Tmp', content: 'x', show: false }, { source: 'ui' });
  const a = await R.run('notes_delete', { note: 'Tmp' }, { source: 'hermes' }); assert.equal(a.ok, true); assert.equal(asked, 1);
  assert.ok(R.allowed('notes_delete'));
  await R.run('create_note', { title: 'Tmp2', content: 'x', show: false }, { source: 'ui' });
  J.confirm = async () => { throw new Error('nie powinno pytać'); };
  const b = await R.run('notes_delete', { note: 'Tmp2' }, { source: 'hermes' }); assert.equal(b.ok, true);
});
test('run: zaufane domeny open_url bez potwierdzenia', async () => {
  let asked = 0; J.confirm = async () => { asked++; return 'no'; };
  const r = await R.run('open_url', { url: 'youtube.com' }, { source: 'hermes' }); assert.equal(r.ok, true); assert.equal(asked, 0);
  const r2 = await R.run('open_url', { url: 'http://evil.example' }, { source: 'hermes' }); assert.equal(r2.code, 'DENIED'); assert.equal(asked, 1);
});
test('zadania: dodanie, odhaczenie, przełożenie, lista', async () => {
  const add = await R.run('add_task', { text: 'trening', time: '18:00' }, { source: 'ui' }); assert.equal(add.ok, true);
  const rel = await R.run('add_task', { text: 'telefon', in: '20 minut' }, { source: 'ui' }); assert.match(rel.data.time, /^\d{2}:\d{2}$/);
  const done = await R.run('tasks_complete', { task: 'trening' }, { source: 'ui' }); assert.equal(done.data.done, true);
  const upd = await R.run('tasks_update', { task: 'trening', time: '19:30' }, { source: 'ui' }); assert.equal(upd.data.time, '19:30'); assert.equal(upd.data.done, false);
  const l = await R.run('tasks_list', { range: 'today' }, { source: 'ui' }); assert.ok(l.data.tasks.some(t => t.text === 'trening'));
});
test('pamięć: remember/recall/forget', async () => {
  await R.run('memory_remember', { fact: 'lubię kawę o 9', scope: 'preference' }, { source: 'ui' });
  const r = await R.run('memory_recall', { query: 'kawę' }, { source: 'ui' }); assert.equal(r.data.facts.length, 1);
  const f = await R.run('memory_forget', { fact: 'kawę' }, { source: 'local' }); assert.equal(f.data.removed, 1);
});
test('describe i groups', () => { assert.match(R.describe(), /Notatki/); assert.ok(Object.keys(R.groups()).length >= 6); });
test('run: market_watch B9 — hermes pyta o confirm (default), silent=true nie pyta', async () => {
  let asked = 0; let captured = '';
  J.confirm = async req => { asked++; captured = req.question; return 'no'; };
  // 1) default (silent brak) → source=hermes → prosi o confirm → user klika Nie → DENIED, alert NIE zapisany
  J.state.alerts = [];
  const r1 = await R.run('market_watch', { symbol: 'BTC', direction: 'above', price: 999999999 }, { source: 'hermes' });
  assert.equal(r1.code, 'DENIED', 'default musi pytać, user odmówił');
  assert.equal(asked, 1, 'J.confirm powinien być wywołany dokładnie raz');
  assert.match(captured, /BTC.*\$999,999,999/, 'pytanie powinno zawierać symbol + kwotę');
  assert.equal((J.state.alerts || []).length, 0, 'alert NIE powinien być zapisany po odmowie');
  // 2) silent=true → trusted escape → wykonuje cicho, alert zapisany
  J.state.alerts = [];
  const r2 = await R.run('market_watch', { symbol: 'BTC', direction: 'above', price: 999999999, silent: true }, { source: 'hermes' });
  assert.equal(r2.ok, true, 'silent=true musi wykonać cicho');
  assert.equal(r2.code, 'OK');
  assert.equal(asked, 1, 'J.confirm NIE powinien być wywołany dla silent=true');
  assert.equal((J.state.alerts || []).length, 1, 'alert zapisany');
  // 3) ui source → trusted zawsze, bez pytania nawet bez silent
  J.state.alerts = [];
  const r3 = await R.run('market_watch', { symbol: 'ETH', direction: 'below', price: 1000 }, { source: 'ui' });
  assert.equal(r3.ok, true);
  assert.equal(asked, 1, 'ui nie pyta');
  // 4) local source → trusted zawsze
  J.state.alerts = [];
  const r4 = await R.run('market_watch', { symbol: 'SOL', direction: 'above', price: 200 }, { source: 'local' });
  assert.equal(r4.ok, true);
  assert.equal(asked, 1, 'local nie pyta');
});
