/* Fala W3: notatki (tagi, foldery, przypinanie, kosz, wersje, duplikat, zadanie z notatki), zadania (powtarzanie, priorytet,
   podzadania, przenoszenie wielu, czyszczenie zrobionych, eksport/import .ics), minutniki, rynek, pamięć, dok, widgety, Pliki, Markdown. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, refShort } = require('../harness.js');
const wait = ms => new Promise(r => setTimeout(r, ms));
const mk = (settings = {}, extra = {}) => { const J = load({ dom: true, ...extra, state: { settings: { hermesOn: false, sound: false, speech: false, ...settings } } }); J.__ctx.setTimeout = refShort; return J; };
const run = (J, id, args, source = 'ui') => J.registry.run(id, args, { source });
const arr = x => JSON.parse(JSON.stringify(x));
const plus = (J, k) => { const d = new Date(J.today() + 'T12:00'); d.setDate(d.getDate() + k); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

test('notatki: tagi, przypinanie, folder, duplikat — każda zmiana z „Cofnij”', async () => {
  const J = mk();
  const n = J.notes.add('Zakupy', 'mleko');
  let r = await run(J, 'notes_tag', { note: 'Zakupy', add: ['Dom', '#pilne'] }); assert.equal(r.ok, true); assert.deepEqual(arr(n.tags), ['dom', 'pilne']);
  r = await run(J, 'notes_tag', { note: n.id, remove: ['dom'] }); assert.deepEqual(arr(n.tags), ['pilne']);
  await J.undo.run(); assert.deepEqual(arr(n.tags), ['dom', 'pilne']);
  r = await run(J, 'notes_pin', { note: 'zakupy' }); assert.equal(n.pinned, true);
  r = await run(J, 'notes_folder', { note: 'zakupy', folder: 'Dom' }); assert.equal(n.folder, 'Dom'); await J.undo.run(); assert.equal(n.folder, '');
  r = await run(J, 'notes_duplicate', { note: 'zakupy' }); assert.equal(r.ok, true); const c = J.state.notes.find(x => x.title === 'Zakupy (kopia)'); assert.ok(c); assert.deepEqual(arr(c.tags), ['dom', 'pilne']);
  await J.undo.run(); assert.equal(J.state.notes.some(x => x.title === 'Zakupy (kopia)'), false);
  const hits = await J.search.query('#pilne', { types: ['notes'] }); assert.equal(hits[0].id, n.id, 'wyszukiwanie po tagu');
});

test('notatki: kosz (usuń → przywróć → opróżnij za zgodą), wersje i przywracanie wersji', async () => {
  const J = mk();
  const n = J.notes.add('Plan', 'wersja 1'); J.notes.add('Inna', 'x');
  let r = await run(J, 'notes_delete', { note: 'Plan' }); assert.equal(r.ok, true); assert.ok(n.deleted, 'usunięcie = kosz');
  r = await run(J, 'notes_trash', {}); assert.equal(r.data.notes.length, 1); assert.match(r.text, /Plan/);
  assert.equal((await J.search.query('plan', { types: ['notes'] })).length, 0, 'notatek z kosza nie ma w wyszukiwaniu');
  r = await run(J, 'notes_restore', { note: 'plan' }); assert.equal(r.ok, true); assert.equal(n.deleted, null);
  r = await run(J, 'notes_update', { note: 'Plan', content: 'wersja 2' }); assert.equal(r.ok, true); assert.equal(n.body, 'wersja 2');
  const v = await J.notes.versions(n.id); assert.ok(v.length >= 1, 'wersja przed zmianą Jarvisa'); assert.equal(v[v.length - 1].body, 'wersja 1');
  r = await run(J, 'notes_versions', { note: 'Plan' }); assert.equal(r.ok, true); assert.ok(r.data.versions.length >= 1);
  r = await run(J, 'notes_revert', { note: 'Plan', version: 'previous' }); assert.equal(r.ok, true); assert.equal(n.body, 'wersja 1');
  await J.undo.run(); assert.equal(n.body, 'wersja 2', 'Cofnij przywrócenia wersji');
  await run(J, 'notes_delete', { note: 'Plan' }); await run(J, 'notes_delete', { note: 'Inna' });
  const asked = []; J.confirm = async q => { asked.push(q.question || q); return 'no'; };
  r = await run(J, 'notes_empty_trash', {}, 'hermes'); assert.equal(r.code, 'DENIED'); assert.equal(asked.length, 1); assert.equal(J.notes.trashed().length, 2);
  r = await run(J, 'notes_empty_trash', {}); assert.equal(r.ok, true); assert.equal(J.notes.trashed().length, 0); assert.equal(J.state.notes.some(x => x.title === 'Plan'), false);
});

test('notatka → zadanie; zadanie pamięta notatkę', async () => {
  const J = mk();
  const n = J.notes.add('Oddać książki', 'biblioteka');
  const r = await run(J, 'notes_to_task', { note: 'oddać', time: '17:00' }); assert.equal(r.ok, true);
  const t = J.state.tasks.find(x => x.text === 'Oddać książki'); assert.ok(t); assert.equal(t.note, n.id); assert.equal(t.time, '17:00');
  await J.undo.run(); assert.equal(J.state.tasks.length, 0);
});

test('zadania: powtarzanie tworzy następne wystąpienie po odhaczeniu; priorytet sortuje; podzadania', async () => {
  const J = mk();
  const t = J.tasks.add('08:00', 'Leki', J.today());
  let r = await run(J, 'tasks_repeat', { task: 'leki', rule: 'daily' }); assert.equal(r.ok, true); assert.equal(t.repeat.rule, 'daily'); assert.equal(t.seriesId, t.id);
  r = await run(J, 'tasks_complete', { task: t.id }); assert.equal(r.ok, true);
  const next = J.state.tasks.find(x => x !== t && x.text === 'Leki'); assert.ok(next, 'następne wystąpienie'); assert.equal(next.date, plus(J, 1)); assert.equal(next.seriesId, t.id);
  assert.equal(J.tasks.nextDate({ date: '2026-09-25', repeat: { rule: 'weekdays' } }), '2026-09-28', 'piątek → poniedziałek');
  assert.equal(J.tasks.nextDate({ date: '2026-01-31', repeat: { rule: 'monthly' } }), '2026-02-28', 'koniec miesiąca');
  assert.equal(J.tasks.nextDate({ date: '2026-09-28', repeat: { rule: 'daily', until: '2026-09-28' } }), null, 'reguła się kończy');
  const a = J.tasks.add('09:00', 'Zwykłe', J.today()), b = J.tasks.add('09:00', 'Ważne', J.today());
  r = await run(J, 'tasks_priority', { task: 'ważne', priority: 'high' }); assert.equal(b.priority, 'high');
  const same = J.state.tasks.filter(x => x.time === '09:00'); assert.equal(same[0], b, 'wysoki priorytet pierwszy przy tej samej godzinie');
  r = await run(J, 'tasks_subtask', { task: 'zwykłe', op: 'add', text: 'krok 1' }); r = await run(J, 'tasks_subtask', { task: 'zwykłe', op: 'add', text: 'krok 2' });
  r = await run(J, 'tasks_subtask', { task: 'zwykłe', op: 'check', text: 'krok 1' }); assert.match(r.text, /1\/2/);
  r = await run(J, 'tasks_subtask', { task: 'zwykłe', op: 'check', text: 'krok 2' }); assert.match(r.text, /odhaczyć też/);
  await J.undo.run(); assert.equal(a.subtasks.filter(s => s.done).length, 1);
  r = await run(J, 'tasks_subtask', { task: 'zwykłe', op: 'remove', text: 'nie ma' }); assert.equal(r.code, 'NOT_FOUND');
});

test('zadania: przenieś wiele (zaległe → dziś) jednym „Cofnij”; usuń zrobione za zgodą', async () => {
  const J = mk();
  const y = plus(J, -1);
  J.tasks.add('10:00', 'Stare 1', y); J.tasks.add('11:00', 'Stare 2', y); const done = J.tasks.add('12:00', 'Zrobione', y); done.done = true;
  let r = await run(J, 'tasks_move_many', { from: 'overdue', to: J.today() }); assert.equal(r.data.moved, 2);
  assert.equal(J.state.tasks.filter(t => t.date === J.today()).length, 2);
  await J.undo.run(); assert.equal(J.state.tasks.filter(t => t.date === y).length, 3, 'jedno Cofnij cofa całość');
  const asked = []; J.confirm = async q => { asked.push(1); return 'no'; };
  r = await run(J, 'tasks_clear_done', { range: 'all' }, 'voice'); assert.equal(r.code, 'DENIED'); assert.equal(asked.length, 1);
  r = await run(J, 'tasks_clear_done', { range: 'all' }); assert.equal(r.data.removed, 1); assert.equal(J.state.tasks.length, 2);
  await J.undo.run(); assert.equal(J.state.tasks.length, 3);
});

test('.ics: eksport z RRULE i przypomnieniem, import odtwarza powtarzanie', async () => {
  const J = mk();
  const t = J.tasks.add('09:30', 'Stand-up; zespół', '2026-10-05', { repeat: { rule: 'weekly', days: ['pn', 'sr'] }, remind: 15, priority: 'high' });
  J.tasks.add('', 'Urodziny', '2026-10-07');
  const ics = J.ics.export(J.state.tasks);
  assert.match(ics, /BEGIN:VCALENDAR\r\n/); assert.match(ics, /DTSTART:20261005T093000/); assert.match(ics, /DTEND:20261005T100000/);
  assert.match(ics, /SUMMARY:Stand-up\\; zespół/); assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=MO,WE/); assert.match(ics, /TRIGGER:-PT15M/); assert.match(ics, /PRIORITY:1/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261007/);
  assert.deepEqual(arr(J.ics.rrule('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')), { rule: 'weekdays' });
  assert.deepEqual(arr(J.ics.rrule('FREQ=DAILY;INTERVAL=3;UNTIL=20261231T000000Z')), { rule: 'every_n_days', n: 3, until: '2026-12-31' });
  const J2 = mk(); const n = J2.ics.import(ics); assert.equal(n, 2);
  const s = J2.state.tasks.find(x => x.date === '2026-10-05'); assert.equal(s.time, '09:30'); assert.deepEqual(arr(s.repeat), { rule: 'weekly', days: ['pn', 'sr'] });
  const r = await run(J, 'tasks_export_ics', { range: 'all' }); assert.equal(r.ok, true); assert.equal(r.data.count, 2);
  assert.ok(t);
});

test('minutniki: kilka naraz, lista, limit 5, pauza i wznowienie po etykiecie', async () => {
  const J = mk();
  let r = await run(J, 'start_timer', { seconds: 300, label: 'Herbata' }); assert.equal(r.ok, true);
  r = await run(J, 'start_timer', { seconds: 600, label: 'Pranie' }); assert.equal(r.ok, true);
  r = await run(J, 'timer_list', {}); assert.equal(r.data.timers.length, 2); assert.match(r.text, /Herbata/); assert.match(r.text, /Pranie/);
  r = await run(J, 'timer_control', { action: 'pause', label: 'pranie' }); assert.equal(r.ok, true); assert.equal(J.timers.find('Pranie').paused, true);
  r = await run(J, 'timer_control', { action: 'resume', label: 'pranie' }); assert.equal(J.timers.find('Pranie').paused, false);
  for (const l of ['A', 'B', 'C']) await run(J, 'start_timer', { seconds: 60, label: l });
  r = await run(J, 'start_timer', { seconds: 60, label: 'Szósty' }); assert.equal(r.ok, false); assert.equal(r.code, 'LIMIT');
  J.timers.all().forEach(t => t.stop());
  r = await run(J, 'timer_list', {}); assert.match(r.text, /Żaden minutnik/);
});

test('rynek: lista obserwowanych (dodaj/usuń/limit/nieznana) i alerty kursów', async () => {
  const J = mk();
  let r = await run(J, 'market_watchlist', { op: 'list' }); const before = arr(r.data.symbols); assert.ok(before.includes('BTC'));
  r = await run(J, 'market_watchlist', { op: 'add', symbol: 'doge' }); assert.equal(r.ok, true); assert.ok(J.market.COINS.some(c => c.sym === 'DOGE'));
  await J.undo.run(); assert.equal(J.market.COINS.some(c => c.sym === 'DOGE'), false);
  r = await run(J, 'market_watchlist', { op: 'add', symbol: 'XYZQ' }); assert.equal(r.code, 'NOT_FOUND');
  r = await run(J, 'market_watchlist', { op: 'remove', symbol: 'ETH' }); assert.equal(r.ok, true); assert.equal(J.market.COINS.some(c => c.sym === 'ETH'), false);
  J.state.alerts = [{ id: 'a1', symbol: 'BTC', direction: 'above', price: 100000 }, { id: 'a2', symbol: 'SOL', direction: 'below', price: 100 }];
  r = await run(J, 'market_alerts', { op: 'list' }); assert.match(r.text, /BTC > /);
  r = await run(J, 'market_alerts', { op: 'remove', alert: 'bitcoin' }); assert.equal(r.ok, true); assert.equal(J.state.alerts.length, 1);
  r = await run(J, 'market_alerts', { op: 'clear' }); assert.equal(J.state.alerts.length, 0); await J.undo.run(); assert.equal(J.state.alerts.length, 1);
});

test('pamięć: poprawka faktu z „Cofnij”; dane poufne odrzucone', async () => {
  const J = mk(); await wait(20);
  await J.memory.remember('pracuję w banku', 'work');
  let r = await run(J, 'memory_edit', { fact: 'banku', text: 'pracuję w szkole' }); assert.equal(r.ok, true);
  assert.equal((await J.memory.all())[0].fact, 'pracuję w szkole');
  await J.undo.run(); assert.equal((await J.memory.all())[0].fact, 'pracuję w banku');
  r = await run(J, 'memory_edit', { fact: 'banku', text: 'moje hasło to Tajne123!' }); assert.equal(r.code, 'DENIED');
  r = await run(J, 'memory_edit', { fact: 'kosmos', text: 'x' }); assert.equal(r.code, 'NOT_FOUND');
});

test('dok i widgety: kolejność w doku, duplikat, zwijanie, pozycje listy', async () => {
  const J = mk();
  let r = await run(J, 'dock_order', { item: 'weather', position: 1 }); assert.equal(r.ok, true); assert.equal(J.state.settings.dockOrder[0], 'weather');
  await J.undo.run(); assert.equal((J.state.settings.dockOrder || []).length, 0);
  const w = J.widgets.create('list', { title: 'Zakupy', items: ['mleko', 'chleb'] }); await wait(20);
  r = await run(J, 'widget_items', { widget: 'zakupy', op: 'add', item: 'masło' }); assert.equal(w.data.items.length, 3);
  r = await run(J, 'widget_items', { widget: 'zakupy', op: 'check', item: 'mleko' }); assert.equal(w.data.items[0].done, true);
  r = await run(J, 'widget_items', { widget: 'zakupy', op: 'clear_done' }); assert.equal(w.data.items.length, 2);
  await J.undo.run(); assert.equal(w.data.items.length, 3);
  r = await run(J, 'widget_duplicate', { widget: 'zakupy' }); assert.equal(r.ok, true); assert.equal(J.widgets.list.length, 2);
  const copy = J.widgets.list.find(x => x.id !== w.id); assert.equal(copy.data.items.length, 3); assert.notEqual(copy.data.items, w.data.items, 'kopia danych, nie wspólna tablica');
  await J.undo.run(); await wait(250); assert.equal(J.widgets.list.length, 1);
  r = await run(J, 'widget_collapse', { widget: 'zakupy', on: true }); assert.equal(w.collapsed, true); assert.equal(J.wm.ctx('w:' + w.id).el.classList.contains('collapsed'), true);
  await J.undo.run(); assert.equal(w.collapsed, false);
  const n = J.widgets.create('note', { title: 'Szkic', content: 'x' }); await wait(20);
  r = await run(J, 'widget_items', { widget: 'szkic', op: 'add', item: 'a' }); assert.equal(r.code, 'INVALID_ARGS'); assert.ok(n);
});

test('Pliki: okno otwiera się na ścieżce; bez File System Access pokazuje wyjaśnienie', async () => {
  const J = mk(); await wait(20);
  const r = await run(J, 'files_open', { path: 'notatki/todo.md' }); assert.equal(r.ok, true); await wait(40);
  assert.equal(J.wm.isOpen('files'), true);
  assert.equal(J.apps.files.state(J.wm.ctx('files')).view, 'path');
  assert.throws(() => J.files.split('../etc/passwd'), /poza folder/);
  assert.deepEqual(arr(J.files.split('a//b/./c.md')), ['a', 'b', 'c.md']);
});

test('Markdown: podgląd bez wstrzykiwania HTML, linki tylko http(s)', () => {
  const J = mk();
  const html = J.md('# Tytuł\n- **raz**\n- [dwa](https://x.pl)\n<img src=x onerror=alert(1)>\n[zły](javascript:alert(1))\n```\n<b>kod</b>\n```');
  assert.match(html, /<h3>Tytuł<\/h3>/); assert.match(html, /<li><strong>raz<\/strong><\/li>/); assert.match(html, /href="https:\/\/x.pl"/);
  assert.doesNotMatch(html, /<img/); assert.doesNotMatch(html, /href="javascript/); assert.match(html, /&lt;b&gt;kod/);
});

test('Notatnik: widok kosza i filtr tagu przez app_view; Harmonogram: tydzień i zaległe', async () => {
  const J = mk();
  const n = J.notes.add('Tajny plan', 'x', { tags: ['praca'] }); J.notes.add('Inne', 'y'); J.notes.trash(J.state.notes.find(x => x.title === 'Inne').id);
  let r = await run(J, 'app_view', { app: 'notes', view: 'trash' }); assert.equal(r.ok, true); await wait(20);
  assert.equal(J.apps.notes.state(J.wm.ctx('notes')).view, 'trash');
  r = await run(J, 'app_view', { app: 'notes', view: 'tag', target: 'praca' }); await wait(20);
  assert.equal(J.apps.notes.state(J.wm.ctx('notes')).target, n.id, 'filtr tagu wybiera notatkę z tagiem');
  J.tasks.add('10:00', 'Zaległe X', plus(J, -2));
  r = await run(J, 'app_view', { app: 'schedule', view: 'overdue' }); assert.equal(r.ok, true); await wait(20);
  assert.equal(J.apps.schedule.state(J.wm.ctx('schedule')).view, 'overdue');
  r = await run(J, 'app_view', { app: 'schedule', view: 'week' }); assert.equal(J.apps.schedule.state(J.wm.ctx('schedule')).view, 'week');
  assert.ok(n);
});

test('parser rozpoznaje nowe polecenia W3', () => {
  const J = mk();
  const m = s => J.registry.match(s)[0]?.id;
  const cases = [
    ['przypnij notatkę zakupy', 'notes_pin'], ['co jest w koszu', 'notes_trash'], ['opróżnij kosz', 'notes_empty_trash'],
    ['przenieś notatkę zakupy do folderu dom', 'notes_folder'], ['powtarzaj leki codziennie', 'tasks_repeat'], ['przestań powtarzać leki', 'tasks_repeat'],
    ['ustaw wysoki priorytet dla raport', 'tasks_priority'], ['przenieś zaległe na dziś', 'tasks_move_many'], ['usuń zrobione zadania', 'tasks_clear_done'],
    ['eksportuj zadania do kalendarza', 'tasks_export_ics'], ['lista minutników', 'timer_list'], ['dodaj doge do obserwowanych', 'market_watchlist'],
    ['pokaż alerty kursów', 'market_alerts'], ['zwiń wszystkie widgety', 'widget_collapse'], ['pokaż plik raport.csv', 'files_open'],
    ['pokaż cały tydzień', 'app_view'], ['zrób zadanie z notatki zakupy', 'notes_to_task']
  ];
  const bad = cases.filter(([s, id]) => m(s) !== id).map(([s, id]) => s + ' → ' + m(s) + ' (oczekiwano ' + id + ')');
  assert.deepEqual(bad, []);
});
