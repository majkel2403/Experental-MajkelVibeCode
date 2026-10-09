/* Fala W1 (docs/spec/17-wdrozenie.md): widoki w aplikacjach, „wróć/dalej”, okna (przypinanie, ponowne otwieranie,
   przywracanie, „zostaw tylko”, przesuwanie słowami, pół na pół), cofanie (wiele, kolizje, usuwanie), skróty, parser. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, refShort } = require('../harness.js');
const wait = ms => new Promise(r => setTimeout(r, ms));
const mk = (settings = {}) => { const J = load({ dom: true, state: { settings: { hermesOn: false, sound: false, speech: false, ...settings } } }); J.__ctx.setTimeout = refShort; return J; };
const run = (J, id, args, source = 'ui') => J.registry.run(id, args, { source });
const st = (J, app) => J.apps[app].state(J.wm.ctx(app));

test('app_view: widoki w aplikacjach otwierają właściwe miejsce, a state() je zwraca', async () => {
  const J = mk();
  const n = J.notes.add('Zakupy', 'mleko');
  let r = await run(J, 'app_view', { app: 'notes', view: 'note', target: 'zakupy' }); assert.equal(r.ok, true, r.text); await wait(20);
  assert.equal(st(J, 'notes').target, n.id); assert.equal(st(J, 'notes').view, 'note');
  r = await run(J, 'app_view', { app: 'schedule', target: 'piątek' }); assert.equal(r.ok, true, r.text); assert.match(st(J, 'schedule').target, /^\d{4}-\d{2}-\d{2}$/); assert.equal(new Date(st(J, 'schedule').target + 'T12:00').getDay(), 5);
  r = await run(J, 'app_view', { app: 'timer', view: 'stopwatch' }); assert.equal(r.ok, true); assert.equal(st(J, 'timer').view, 'stopwatch');
  r = await run(J, 'app_view', { app: 'market', target: 'ethereum' }); assert.equal(r.ok, true, r.text); await wait(80); assert.equal(st(J, 'market').target, 'ETH');
  r = await run(J, 'app_view', { app: 'settings', target: 'jev' }); assert.equal(r.ok, true, r.text); await wait(120); assert.equal(st(J, 'settings').target, 'jev');
  r = await run(J, 'app_view', { app: 'timer', view: 'kalendarz' }); assert.equal(r.ok, false); assert.equal(r.code, 'INVALID_ARGS'); assert.match(r.text, /stopwatch/);
  r = await run(J, 'app_view', { app: 'market', target: 'dogecoin' }); assert.equal(r.code, 'NOT_FOUND');
  r = await run(J, 'app_view', { app: 'notes', target: 'nie ma takiej' }); assert.equal(r.code, 'NOT_FOUND');
});

test('„wróć” i „dalej” pamiętają widoki, a nowa nawigacja kasuje „dalej”', async () => {
  const J = mk();
  await run(J, 'app_view', { app: 'schedule', target: '2026-10-01' }); await wait(300);
  await run(J, 'app_view', { app: 'schedule', target: '2026-10-05' }); await wait(300);
  let r = await run(J, 'nav_back', {}); assert.equal(r.ok, true, r.text); await wait(300); assert.equal(st(J, 'schedule').target, '2026-10-01');
  r = await run(J, 'nav_forward', {}); assert.equal(r.ok, true, r.text); await wait(300); assert.equal(st(J, 'schedule').target, '2026-10-05');
  await run(J, 'nav_back', {}); await wait(300);
  await run(J, 'app_view', { app: 'timer', view: 'stopwatch' }); await wait(300);
  assert.equal((await run(J, 'nav_forward', {})).ok, false, 'po nowej nawigacji nie ma „dalej”');
});

test('okna: przypinanie (maks. 3), ponowne otwieranie w tej samej pozycji, przywracanie, „zostaw tylko”', async () => {
  const J = mk();
  ['notes', 'schedule', 'timer', 'calc'].forEach(a => J.wm.open(a));
  for (const a of ['notes', 'schedule', 'timer']) assert.equal((await run(J, 'wm_pin', { app: a })).ok, true);
  await run(J, 'wm_pin', { app: 'calc' });
  assert.deepEqual(['notes', 'schedule', 'timer', 'calc'].filter(a => J.wm.isPinned(a)), ['schedule', 'timer', 'calc'], 'najstarsze przypięte zostało odpięte');
  const u = await run(J, 'wm_pin', { app: 'calc', on: false }); assert.equal(J.wm.isPinned('calc'), false); await J.undo.run(); assert.equal(J.wm.isPinned('calc'), true, 'Cofnij przywraca przypięcie');
  J.wm.move('notes', 111, 77); J.wm.close('notes'); J.wm.close('schedule');
  let r = await run(J, 'wm_reopen', {}); assert.equal(r.data.app, 'schedule', 'najpierw ostatnio zamknięte');
  r = await run(J, 'wm_reopen', {}); assert.equal(r.data.app, 'notes'); const i = J.wm.info().find(w => w.id === 'notes'); assert.equal(i.x, 111); assert.equal(i.y, 77);
  assert.equal((await run(J, 'wm_reopen', {})).ok, false);
  await run(J, 'wm_minimize', { app: 'all' }); assert.ok(J.wm.list().every(k => J.wm.isMin(k)));
  r = await run(J, 'wm_restore', { app: 'all' }); assert.ok(r.data.restored >= 4); assert.ok(J.wm.list().every(k => !J.wm.isMin(k)));
  r = await run(J, 'wm_close_others', { app: 'timer' }); assert.deepEqual(J.wm.list(), ['timer']);
  await J.undo.run(); assert.ok(['notes', 'schedule', 'calc'].every(a => J.wm.isOpen(a)), 'Cofnij otwiera zamknięte okna');
});

test('zamknięcie jednego okna: bez pytania także od Jeva, z „Cofnij”; zamknięcie wszystkich od modelu pyta', async () => {
  const J = mk(); const asked = []; J.confirm = async q => { asked.push(q.question); return 'no'; };
  J.wm.open('notes'); J.wm.open('weather');
  let r = await run(J, 'close_app', { app: 'weather' }, 'jev'); assert.equal(r.ok, true); assert.equal(asked.length, 0); assert.equal(J.wm.isOpen('weather'), false);
  await J.undo.run(); assert.equal(J.wm.isOpen('weather'), true);
  r = await run(J, 'close_app', { app: 'all' }, 'hermes'); assert.equal(r.code, 'DENIED'); assert.equal(asked.length, 1);
  r = await run(J, 'close_app', { app: 'calc' }); assert.equal(r.code, 'NOT_FOUND'); assert.match(r.text, /Kalkulator nie jest otwarty/);
  r = await run(J, 'wm_focus', { app: 'settings' }); assert.match(r.text, /Ustawienia nie są otwarte/);
  assert.equal(J.policy.level('close_app', { app: 'notes' }), 'A3'); assert.equal(J.policy.level('close_app', { app: 'all' }), 'A0');
});

test('przesuwanie i rozmiar słowami (kierunek, preset, minimum aplikacji, widgety) + cofanie', async () => {
  const J = mk(); J.wm.open('timer'); J.wm.move('timer', 300, 200);
  let r = await run(J, 'wm_move', { app: 'minutnik', direction: 'left', amount: 'small' }); assert.equal(r.ok, true, r.text);
  assert.equal(J.wm.info().find(w => w.id === 'timer').x, 260);
  await J.undo.run(); assert.equal(J.wm.info().find(w => w.id === 'timer').x, 300);
  J.wm.open('notes'); r = await run(J, 'wm_move', { app: 'notes', size: 'S' }); const nw = J.wm.info().find(w => w.id === 'notes');
  assert.ok(nw.w >= 420, 'minimalna szerokość Notatnika to 420 px, a jest ' + nw.w);
  const w = J.widgets.create('list', { title: 'Zakupy', items: ['mleko'] });
  r = await run(J, 'wm_move', { app: 'Zakupy', x: 50, y: 60 }); assert.equal(r.ok, true, r.text); assert.equal(J.wm.info().find(k => k.id === 'w:' + w.id).x, 50);
  assert.equal((await run(J, 'wm_move', { app: 'kalkulator', x: 1 })).code, 'NOT_FOUND');
});

test('pół na pół i kafelki: układ i „Cofnij” przywraca poprzednie pozycje', async () => {
  const J = mk(); J.wm.open('notes'); J.wm.open('schedule'); J.wm.move('notes', 33, 44); J.wm.move('schedule', 55, 66);
  const r = await run(J, 'wm_arrange', { mode: 'split', apps: ['notatnik', 'harmonogram'] }); assert.equal(r.ok, true, r.text);
  const a = J.wm.info().find(w => w.id === 'notes'), b = J.wm.info().find(w => w.id === 'schedule'); assert.ok(a.x < b.x, 'notatnik po lewej');
  await J.undo.run(); assert.equal(J.wm.info().find(w => w.id === 'notes').x, 33); assert.equal(J.wm.info().find(w => w.id === 'schedule').y, 66);
  await run(J, 'wm_arrange', { mode: 'tile' }); await J.undo.run(); assert.equal(J.wm.info().find(w => w.id === 'notes').x, 33);
});

test('cofanie: kilka naraz, wszystko z ostatnich minut, kolizja z późniejszą edycją, lista', async () => {
  const J = mk();
  await run(J, 'add_task', { text: 'a' }); await run(J, 'add_task', { text: 'b' }); await run(J, 'add_task', { text: 'c' });
  let r = await run(J, 'undo', { count: 2 }); assert.equal(r.ok, true, r.text); assert.deepEqual([...J.state.tasks.map(t => t.text)], ['a']);
  await run(J, 'add_task', { text: 'd' }); r = await run(J, 'undo', { minutes: 5 }); assert.equal(J.state.tasks.length, 0, r.text);
  const n = J.notes.add('Plan', 'x'); await run(J, 'notes_append', { note: 'Plan', text: 'y' }); n.body += '\nręczna zmiana';
  r = await run(J, 'undo', {}); assert.equal(r.code, 'CONFLICT'); assert.match(n.body, /ręczna/);
  r = await run(J, 'undo', { force: true }); assert.equal(r.ok, true); assert.equal(n.body, 'x');
  await run(J, 'add_task', { text: 'e' }); assert.match((await run(J, 'undo_list', {})).text, /Dodałem: „e”/);
});

test('usuwanie ma „Cofnij”: notatka (to samo miejsce), zadanie, skrót, widget, fakt w pamięci', async () => {
  const J = mk();
  J.notes.add('A', ''); J.notes.add('B', ''); J.notes.add('C', ''); const order = J.state.notes.map(n => n.title).join();
  const before = J.notes.live().length; await run(J, 'notes_delete', { note: 'B' }); assert.equal(J.notes.live().length, before - 1);
  await J.undo.run(); assert.equal(J.notes.live().map(n => n.title).join(), order);
  await run(J, 'add_task', { text: 'trening', time: '18:00' }); await run(J, 'tasks_remove', { task: 'trening' }); assert.equal(J.state.tasks.length, 0); await J.undo.run(); assert.equal(J.state.tasks[0].text, 'trening');
  J.shortcuts.add('GitHub', { url: 'https://github.com' }); await run(J, 'shortcut_remove', { name: 'github' }); assert.equal(J.state.shortcuts.length, 0); await J.undo.run(); assert.equal(J.state.shortcuts[0].name, 'GitHub');
  const w = J.widgets.create('list', { title: 'Lista', items: ['x'] }); await run(J, 'widgets_remove', { widget: 'Lista' }); assert.equal(J.widgets.list.length, 0);
  await J.undo.run(); assert.equal(J.widgets.list[0].title, 'Lista'); assert.equal(J.wm.isOpen('w:' + w.id), true);
  await J.memory.remember('lubię kawę', 'preference'); await run(J, 'memory_forget', { fact: 'kawę' }); assert.equal((await J.memory.all()).length, 0);
  await J.undo.run(); assert.equal((await J.memory.all())[0].fact, 'lubię kawę');
});

test('skróty: edycja nazwy i adresu z cofaniem', async () => {
  const J = mk(); J.shortcuts.add('GitHub', { url: 'https://github.com' });
  let r = await run(J, 'shortcut_edit', { shortcut: 'github', name: 'Kod' }); assert.equal(r.ok, true); assert.equal(J.state.shortcuts[0].name, 'Kod');
  r = await run(J, 'shortcut_edit', { shortcut: 'kod', url: 'gitlab.com' }); assert.equal(J.state.shortcuts[0].url, 'https://gitlab.com');
  await J.undo.run(); await J.undo.run(); assert.equal(J.state.shortcuts[0].name, 'GitHub'); assert.equal(J.state.shortcuts[0].url, 'https://github.com');
});

test('parser rozpoznaje nowe polecenia W1', () => {
  const J = mk(); const R = J.registry; J.wm.open('terminal'); J.wm.open('calc');
  const cases = [['idź dalej', 'nav_forward'], ['pokaż stoper', 'app_view'], ['otwórz ustawienia na sekcji głos', 'app_view'], ['pokaż ethereum w rynku', 'app_view'], ['otwórz terminal z neofetch', 'app_view'],
    ['przesuń kalkulator w lewo', 'wm_move'], ['powiększ terminal', 'wm_move'], ['zrób kalkulator małym', 'wm_move'], ['przypnij kalkulator', 'wm_pin'], ['przywróć ostatnio zamknięte okno', 'wm_reopen'], ['przywróć wszystkie okna', 'wm_restore'],
    ['zamknij wszystko oprócz terminala', 'wm_close_others'], ['zostaw tylko notatnik', 'wm_close_others'], ['pół na pół terminal i rynek', 'wm_arrange'], ['notatnik i harmonogram obok siebie', 'wm_arrange'], ['zamknij kalkulator', 'close_app'],
    ['cofnij ostatnie trzy', 'undo'], ['cofnij mimo to', 'undo'], ['historia do cofnięcia', 'undo_list'], ['co mogę cofnąć', 'undo_list'], ['zmień nazwę skrótu github na kod', 'shortcut_edit'], ['cofnij okno', 'nav_back']];
  for (const [t, id] of cases) assert.equal(R.match(t)[0]?.id, id, t + ' → ' + R.match(t)[0]?.id);
  assert.equal(R.match('cofnij ostatnie trzy')[0].args.count, 3); assert.deepEqual([...R.match('pół na pół terminal i rynek')[0].args.apps], ['terminal', 'market']);
  assert.equal(R.match('przesuń kalkulator w lewo')[0].args.direction, 'left');
});
