/* Fala W2: wyszukiwanie wszędzie, ostatnie, tryby przestrzeni, skala, układy, kanały powiadomień, skróty, reset sekcji,
   wątki czatu (szukanie, eksport, czyszczenie z „Cofnij”), kopia danych v2, tryb bez sieci, kody OFFLINE/RATE_LIMITED. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, refShort } = require('../harness.js');
const wait = ms => new Promise(r => setTimeout(r, ms));
const mk = (settings = {}, extra = {}) => { const J = load({ dom: true, ...extra, state: { settings: { hermesOn: false, sound: false, speech: false, ...settings } } }); J.__ctx.setTimeout = refShort; return J; };
const run = (J, id, args, source = 'ui') => J.registry.run(id, args, { source });
const arr = x => JSON.parse(JSON.stringify(x));

test('wyszukiwanie: bez polskich znaków, literówki, typy, kolejność (dokładne > początek > fragment)', async () => {
  const J = mk();
  J.notes.add('Zażółć gęślą jaźń', 'test'); J.notes.add('Faktura za prąd', 'zapłacić do 10'); J.notes.add('Plan', 'faktura VAT w treści');
  J.tasks.add('10:00', 'Zapłacić fakturę', J.today()); J.shortcuts.add('Bank', { url: 'https://bank.pl' });
  await J.memory.remember('mój bank to mBank', 'other');
  let hits = await J.search.query('zazolc'); assert.equal(hits[0].title, 'Zażółć gęślą jaźń');
  hits = await J.search.query('faktura'); assert.equal(hits[0].title, 'Faktura za prąd', 'tytuł przed treścią'); assert.ok(hits.some(h => h.type === 'tasks'));
  hits = await J.search.query('faktra'); assert.ok(hits.some(h => h.title === 'Faktura za prąd'), 'literówka (1 znak)');
  hits = await J.search.query('bank', { types: ['memory'] }); assert.deepEqual([...new Set(hits.map(h => h.type))], ['memory']);
  hits = await J.search.query('glos'); assert.ok(hits.some(h => h.type === 'settings' && h.id === 'glos'));
  const r = await run(J, 'search_all', { query: 'faktura', show: true }); assert.equal(r.ok, true); assert.match(r.text, /Znalazłem/); await wait(30); assert.equal(J.wm.isOpen('notes'), true, 'show=true otwiera najlepszy wynik');
  assert.match((await run(J, 'search_all', { query: 'qqqzzz' })).text, /Nic nie pasuje/);
});

test('rozmowy: wątki mają osobną historię, szukanie przez wątki, eksport, czyszczenie z „Cofnij”', async () => {
  const J = mk(); await wait(30);
  J.chat.add('user', 'jaki jest przepis na pierogi'); J.chat.add('jarvis', 'Pierogi: mąka, woda, farsz.'); await wait(600);
  let r = await run(J, 'chat_thread', { op: 'new', name: 'Praca' }); assert.equal(r.ok, true); assert.equal(J.threads.list().length, 2);
  assert.equal(J.chat.items().length, 0, 'nowy wątek jest pusty'); J.chat.add('user', 'raport kwartalny'); await wait(600);
  r = await run(J, 'chat_search', { query: 'pierogi', show: false }); assert.equal(r.ok, true); assert.equal(r.data.hits[0].thread, 'Ogólny');
  r = await run(J, 'chat_thread', { op: 'switch', name: 'ogólny' }); assert.equal(J.threads.current(), 'main'); assert.match(arr(J.chat.items()).map(i => i.text).join(), /pierogi/);
  r = await run(J, 'chat_export', { range: 'all' }); assert.match(r.data.markdown, /## Wątek: Ogólny/); assert.match(r.data.markdown, /## Wątek: Praca/); assert.match(r.data.markdown, /raport kwartalny/);
  r = await run(J, 'chat_clear', {}); assert.equal(r.ok, true); assert.equal(J.chat.items().filter(i => i.role === 'user').length, 0);
  await J.undo.run(); assert.match(arr(J.chat.items()).map(i => i.text).join(), /pierogi/, 'Cofnij przywraca rozmowę');
  const asked = []; J.confirm = async q => { asked.push(q.question); return 'no'; };
  r = await run(J, 'chat_clear', {}, 'hermes'); assert.equal(r.code, 'DENIED'); assert.equal(asked.length, 1, 'model nie czyści rozmowy bez zgody');
});

test('tryby przestrzeni: clean minimalizuje i przywraca okna; present; cofanie', async () => {
  const J = mk(); J.wm.open('notes'); J.wm.open('timer');
  let r = await run(J, 'ui_mode', { mode: 'clean' }); assert.equal(r.ok, true); assert.ok(J.wm.list().every(k => J.wm.isMin(k)));
  r = await run(J, 'ui_mode', { mode: 'work' }); assert.ok(['notes', 'timer'].every(k => !J.wm.isMin(k)), 'powrót do pracy przywraca okna');
  await run(J, 'ui_mode', { mode: 'present' }); assert.equal(J.uiMode.get(), 'present'); assert.equal(J.$('#app').classList.contains('present'), true);
  await J.undo.run(); assert.equal(J.uiMode.get(), 'work');
  assert.equal(J.registry.match('tryb prezentacji')[0].id, 'ui_mode'); assert.equal(J.registry.match('posprzątaj pulpit')[0].args.mode, 'clean');
});

test('skala interfejsu, układy (lista, nazwa, usuwanie, startowy), kanały powiadomień, reset sekcji', async () => {
  const J = mk();
  let r = await run(J, 'ui_scale', { step: 'up' }); assert.equal(J.state.settings.uiScale, 110); assert.equal((await run(J, 'ui_scale', { percent: 200 })).code, 'INVALID_ARGS', 'poza zakresem 80–130'); await run(J, 'ui_scale', { percent: 128 }); assert.equal(J.state.settings.uiScale, 130, 'zaokrąglone do 5'); await J.undo.run();
  await J.undo.run(); assert.equal(J.state.settings.uiScale, 100, 'drugie Cofnij wraca do 100');
  J.wm.open('notes'); await run(J, 'layout_save', { name: 'Biuro' });
  r = await run(J, 'layout_list', {}); assert.match(r.text, /Biuro/); assert.match(r.text, /praca/);
  r = await run(J, 'layout_rename', { name: 'biuro', to: 'Dom' }); assert.equal(r.ok, true); assert.ok(J.state.layouts.Dom);
  assert.equal((await run(J, 'layout_rename', { name: 'Dom', to: 'praca' })).code, 'INVALID_ARGS', 'nazwa presetu zajęta');
  r = await run(J, 'layout_startup', { name: 'dom' }); assert.equal(J.state.settings.layoutStartup, 'Dom');
  r = await run(J, 'layout_remove', { name: 'Dom' }); assert.equal(r.ok, true); assert.equal(J.state.settings.layoutStartup, 'none', 'usunięty układ startowy wyłącza start');
  await J.undo.run(); assert.ok(J.state.layouts.Dom);
  assert.equal((await run(J, 'layout_remove', { name: 'praca' })).code, 'DENIED', 'presetu nie da się usunąć');
  r = await run(J, 'notif_channel', { kind: 'market', on: false }); assert.equal(J.notifChannel('market').on, false); assert.equal(J.notifChannel('task').on, true);
  assert.equal(J.registry.match('wyłącz powiadomienia z rynku')[0].args.kind, 'market');
  J.state.settings.jevA2 = .99; J.state.settings.jevPrivacy = 'P0'; J.state.settings.jevKey = 'sekret';
  r = await run(J, 'settings_reset', { section: 'jev' }); assert.equal(J.state.settings.jevA2, .92); assert.equal(J.state.settings.jevPrivacy, 'P1'); assert.equal(J.state.settings.jevKey, 'sekret', 'klucz zostaje');
  await J.undo.run(); assert.equal(J.state.settings.jevA2, .99);
});

test('skróty klawiszowe: przypisanie, konflikt, zakaz skrótów przeglądarki, reset', async () => {
  const J = mk(); J.KEY_ACTIONS = { palette: { label: 'Paleta', def: 'Ctrl+K' }, chat: { label: 'Czat', def: 'Alt+1' } };
  let r = await run(J, 'keys_set', { action: 'palette', keys: 'Alt+P' }); assert.equal(r.ok, true); assert.equal(J.state.settings.keys.palette, 'Alt+P');
  assert.equal((await run(J, 'keys_set', { action: 'chat', keys: 'alt+p' })).code, 'INVALID_ARGS', 'konflikt');
  assert.match((await run(J, 'keys_set', { action: 'chat', keys: 'Ctrl+T' })).text, /przeglądarki/);
  assert.equal((await run(J, 'keys_set', { action: 'chat', keys: 'P' })).code, 'INVALID_ARGS', 'bez Ctrl/Alt');
  await run(J, 'keys_set', { action: 'all', keys: 'reset' }); assert.deepEqual(arr(J.state.settings.keys), {});
  assert.equal(J.normCombo('shift+Ctrl+x'), 'ctrl+shift+x');
});

test('kopia danych v2: eksport bez kluczy, podgląd, scalanie po id, zastąpienie, rozmowy i pamięć', async () => {
  const A = mk({ jevKey: 'tajne', openrouterKey: 'tajne2' }); await wait(30);
  A.notes.add('Wspólna', 'a'); A.notes.add('Tylko w kopii', 'b'); await A.memory.remember('lubię herbatę', 'preference'); A.chat.add('user', 'cześć z kopii'); await wait(600);
  const dump = await A.backup.export();
  assert.equal(dump.exportVersion, 2); assert.equal(dump.state.settings.jevKey, ''); assert.ok(dump.idb['memory.facts']);
  const B = mk({ jevKey: 'moj' }); await wait(30); B.state.notes = [JSON.parse(JSON.stringify(dump.state.notes.find(n => n.title === 'Wspólna')))]; B.notes.add('Tylko u mnie', 'c');
  const pv = B.backup.preview(dump); assert.match(pv.text, /notatek/);
  await B.backup.import(dump, 'merge');
  assert.ok(['Tylko u mnie', 'Tylko w kopii', 'Wspólna'].every(t => B.state.notes.some(n => n.title === t)), 'scalenie: moje + z kopii');
  assert.equal(B.state.notes.filter(n => n.title === 'Wspólna').length, 1, 'bez duplikatów po id');
  assert.equal(B.state.settings.jevKey, 'moj', 'klucz zostaje'); assert.equal((await B.memory.all()).length, 1);
  await B.backup.import(dump, 'replace'); assert.ok(!B.state.notes.some(n => n.title === 'Tylko u mnie'), 'zastąpienie'); assert.equal(B.state.settings.jevKey, 'moj');
  assert.throws(() => B.backup.preview({ foo: 1 }), /nie jest kopi/);
});

test('tryb bez sieci: zapytania na zewnątrz zablokowane (OFFLINE), Jev i Hermes wyłączone; ostatnio otwierane', async () => {
  let calls = 0; const J = mk({ offlineMode: true, jevOn: true, jevKey: 'k', hermesOn: true }, { fetch: async () => { calls++; return { ok: true, json: async () => ({}) }; } });
  assert.equal(J.aiReady(), false); assert.equal(J.judge.enabled(), false);
  const r = await run(J, 'get_weather', { city: 'Kraków', show: false }); assert.equal(r.code, 'OFFLINE', r.text); assert.equal(calls, 0);
  const K = mk(); await run(K, 'app_view', { app: 'timer', view: 'stopwatch' }); await wait(300); await run(K, 'open_app', { app: 'notes' }); await wait(300);
  const rl = await run(K, 'recent_list', {}); assert.match(rl.text, /Notatnik/); assert.match(rl.text, /stoper/);
});

test('parser rozpoznaje nowe polecenia W2', () => {
  const J = mk(); const R = J.registry;
  const cases = [['szukaj wszędzie dentysta', 'search_all'], ['gdzie mam coś o wakacjach', 'search_all'], ['ostatnio otwierane', 'recent_list'], ['włącz tryb prezentacji', 'ui_mode'], ['czysty pulpit', 'ui_mode'],
    ['powiększ wszystko', 'ui_scale'], ['litery są za małe', 'ui_scale'], ['pokaż moje układy okien', 'layout_list'], ['usuń układ wieczór', 'layout_remove'], ['zmień nazwę układu test na nocny', 'layout_rename'], ['układ startowy praca', 'layout_startup'],
    ['wyłącz powiadomienia o sieci', 'notif_channel'], ['zmień skrót palety na Alt+P', 'keys_set'], ['przywróć domyślne ustawienia wyglądu', 'settings_reset'],
    ['szukaj w czacie urlop', 'chat_search'], ['eksportuj rozmowę', 'chat_export'], ['wyczyść historię czatu', 'chat_clear'], ['nowy wątek', 'chat_thread'], ['jakie mam wątki', 'chat_thread']];
  for (const [t, id] of cases) assert.equal(R.match(t)[0]?.id, id, t + ' → ' + R.match(t)[0]?.id);
});
