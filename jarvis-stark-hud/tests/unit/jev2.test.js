/* Jev v2: bezpiecznik, budżet, walidacja odpowiedzi, cache, dziennik; naprawy L2; cofanie poleceń; nawigacja. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../harness.js');
const { makeJev } = require('../jevmock.js');
const wait = ms => new Promise(r => setTimeout(r, ms));
const mk = (rules, settings = {}, mockOpts = {}, extra = {}) => { const mock = makeJev(rules, mockOpts); const J = load({ fetch: mock.fetch, ...extra, state: { settings: { hermesOn: false, jevOn: true, jevKey: 'k', ...settings } } }); return { J, mock }; };

test('bezpiecznik: 3 błędy sieci → Jev pomijany bez czekania, powiadomienie raz, zmiana klucza zdejmuje pauzę', async () => {
  const { J, mock } = mk([], {}, { fail: 'network' }); const notices = []; J.notice = n => notices.push(n.title);
  for (let i = 0; i < 3; i++) assert.equal(await J.judge.decide('otwórz notatnik'), null);
  assert.equal(mock.calls.length, 3); assert.equal(J.judge.breaker.open, true); assert.equal(J.judge.available(), false);
  for (let i = 0; i < 5; i++) await J.judge.decide('otwórz notatnik');
  assert.equal(mock.calls.length, 3, 'przy otwartym bezpieczniku nie ma prób połączenia'); assert.equal(notices.filter(t => /wstrzymany/.test(t)).length, 1);
  J.state.settings.jevKey = 'nowy'; J.emit('settings'); assert.equal(J.judge.breaker.open, false, 'zmiana klucza zdejmuje pauzę');
});
test('bezpiecznik: 401/403 → długa pauza z powodem; 429 → krótka', async () => {
  const a = mk([], {}, { status: 401 }); a.J.notice = () => { }; await a.J.judge.decide('x');
  assert.equal(a.J.judge.breaker.open, true); assert.match(a.J.judge.breaker.reason, /klucz odrzucony/); assert.ok(a.J.judge.breaker.until - Date.now() > 3000e3);
  const b = mk([], {}, { status: 429 }); b.J.notice = () => { }; await b.J.judge.decide('x'); assert.ok(b.J.judge.breaker.until - Date.now() < 100e3); assert.match(b.J.judge.breaker.reason, /429/);
});
test('limit czasu: wolny Jev nie blokuje polecenia dłużej niż limit', async () => {
  /* atrapa odpowiada po 5 s, limit decide() to 1,5 s — próg 4 s odróżnia abort od czekania na odpowiedź
     i nie flakuje na obciążonym runnerze (poprzednio margines wynosił 300 ms) */
  const { J } = mk([{ re: /./, intent: 'open_app' }], {}, { delay: 5000 });
  const t0 = Date.now(); const v = await J.judge.decide('otwórz notatnik'); assert.equal(v, null); assert.ok(Date.now() - t0 < 4000, 'przerwano po ~1,5 s: ' + (Date.now() - t0));
});
test('walidacja: wybór spoza listy jest odrzucany; poprawne pola przy błędnych zostają', async () => {
  const g = mk([], {}, { fail: 'garbage' }); g.J.notice = () => { };
  assert.equal(await g.J.judge.decide('otwórz notatnik'), null); assert.ok(g.J.judge.status.invalid >= 1);
  // część odpowiedzi niepoprawna (noul = 1,5) → pole pomijamy, reszta działa
  const fetch = async (u, i) => { const b = JSON.parse(i.body); return { ok: true, status: 200, json: async () => ({ answers: { intent: { type: 'choice', choice: 'open_app', confidence: .9, probabilities: { open_app: .9 } }, destructive: { type: 'noul', noul: 1.5 }, clarify: { type: 'noul', noul: .1 }, current: { type: 'noul', noul: .1 } }, usage: { cost: 0 } }) }; };
  const J = load({ fetch, state: { settings: { hermesOn: false, jevOn: true, jevKey: 'k' } } });
  const v = await J.judge.decide('x'); assert.equal(v.intent.id, 'open_app'); assert.equal(v.destructive, 0, 'niepoprawne pole → domyślnie 0'); assert.equal(J.judge.status.invalid, 1);
});
test('budżet miesięczny: po przekroczeniu Jev jest pauzowany; 0 = bez limitu', async () => {
  const a = mk([{ re: /./, intent: 'open_app' }], { jevBudget: 0.0002 }); a.J.notice = () => { };
  await a.J.judge.decide('raz'); assert.equal(a.J.judge.available(), true, 'koszt 0,000126 < 0,0002'); await a.J.judge.decide('dwa'); assert.equal(a.J.judge.budget.exceeded(), true); assert.equal(a.J.judge.available(), false);
  const b = mk([{ re: /./, intent: 'open_app' }], { jevBudget: 0 }); for (let i = 0; i < 4; i++) await b.J.judge.decide('t' + i); assert.equal(b.J.judge.available(), true, 'bez limitu');
  assert.ok(Math.abs(b.J.judge.budget.used() - 4 * 0.000126) < 1e-9);
});
test('cache 60 s: to samo zdanie i ten sam stan → jedno wywołanie', async () => {
  const { J, mock } = mk([{ re: /./, intent: 'open_app' }]);
  const a = await J.judge.decide('otwórz notatnik'), b = await J.judge.decide('otwórz notatnik'); assert.equal(mock.calls.length, 1); assert.equal(b.cached, true); assert.equal(a.intent.id, b.intent.id);
  await J.judge.decide('otwórz kalkulator'); assert.equal(mock.calls.length, 2);
});
test('dziennik decyzji: domyślnie tylko skrót zdania (nie treść); opcja zapisu treści; statystyki i eksport', async () => {
  const { J } = mk([{ re: /./, intent: 'open_app' }]);
  const v = await J.judge.decide('tajne zdanie o zdrowiu'); const e = J.judge.log.all().pop();
  assert.ok(e.h && !('text' in e), 'brak treści'); assert.ok(!J.judge.log.export().includes('zdrowiu'));
  J.judge.log.update(v.logId, { outcome: 'executed' }); const st = J.judge.log.stats(); assert.equal(st.decisions, 1); assert.equal(st.executed, 1);
  const J2 = load({ fetch: makeJev([{ re: /./, intent: 'open_app' }]).fetch, state: { settings: { hermesOn: false, jevOn: true, jevKey: 'k', jevLogText: true } } });
  await J2.judge.decide('jawne zdanie'); assert.equal(J2.judge.log.all().pop().text, 'jawne zdanie');
});

/* ---------- L2 i pozostałe zaostrzenia ---------- */
test('L2: terminal_run — polecenia mutujące wymagają zgody od modelu; okno Terminala i bezpieczne polecenia bez zmian', async () => {
  const { J } = mk([]); let asked = 0, ans = 'no'; J.confirm = async () => { asked++; return ans; };
  const denied = await J.registry.run('terminal_run', { command: 'note tajna treść' }, { source: 'hermes' });
  assert.equal(denied.code, 'DENIED'); assert.equal(asked, 1); assert.ok(!J.state.notes.some(n => n.body === 'tajna treść'));
  const ok1 = await J.registry.run('terminal_run', { command: 'date' }, { source: 'hermes' }); assert.equal(ok1.ok, true); assert.equal(asked, 1, 'date bez pytania');
  ans = 'yes'; const ok2 = await J.registry.run('terminal_run', { command: 'note tajna treść' }, { source: 'hermes' }); assert.equal(ok2.ok, true); assert.ok(J.state.notes.some(n => n.body === 'tajna treść'));
  const ui = await J.registry.run('terminal_run', { command: 'close all' }, { source: 'ui' }); assert.equal(ui.ok, true);
  assert.equal(J.registry.get('terminal_run').risk, 'confirm');
});
test('settings_set: klucze o skutkach ubocznych (proaktywność, nasłuch) wymagają zgody; zwykłe nie', async () => {
  const { J } = mk([]); let asked = 0; J.confirm = async () => { asked++; return 'no'; };
  const a = await J.registry.run('settings_set', { key: 'proactive', value: 'active' }, { source: 'hermes' }); assert.equal(a.code, 'DENIED'); assert.equal(asked, 1); assert.equal(J.state.settings.proactive, 'quiet');
  const b = await J.registry.run('settings_set', { key: 'user', value: 'ab' }, { source: 'hermes' }); assert.equal(b.ok, true); assert.equal(asked, 1); assert.equal(J.state.settings.user, 'AB');
});
test('files_export_note: nigdy nie nadpisuje istniejącego pliku (dopisuje numer)', async () => {
  const { J } = mk([]); const written = []; J.files.list = async () => [{ name: 'Zakupy.md' }, { name: 'Zakupy (2).md' }]; J.files.write = async (name) => { written.push(name); };
  J.notes.add('Zakupy', 'mleko'); const r = await J.registry.run('files_export_note', { note: 'Zakupy' }, { source: 'ui' });
  assert.equal(r.ok, true); assert.deepEqual(written, ['Zakupy (3).md']);
});

/* ---------- cofanie: każde polecenie odwracalne przywraca stan ---------- */
test('cofanie: polecenia odwracalne przywracają poprzedni stan', async () => {
  const { J } = mk([], {}, {}, { dom: true }); const R = J.registry; const run = (id, a) => R.run(id, a, { source: 'ui' });
  const snap = () => JSON.stringify({ n: J.state.notes, t: J.state.tasks, s: J.state.shortcuts, a: J.state.alerts, w: J.widgets.list.map(x => x.id), l: J.state.layouts, ac: J.state.settings.accent, wall: J.state.settings.wall, snd: [J.state.settings.sound, J.state.settings.speech] });
  const note = J.notes.add('Baza', 'treść'); const task = J.tasks.add('10:00', 'zadanie'); const before = snap();
  const cases = [
    ['create_note', { content: 'nowa', show: false }], ['notes_append', { note: note.id, text: 'dopisek', show: false }], ['notes_update', { note: note.id, title: 'Inny', content: 'zmiana' }],
    ['add_task', { text: 'kupić chleb', time: '12:00' }], ['tasks_complete', { task: task.id }], ['tasks_update', { task: task.id, text: 'zmienione', time: '11:00' }],
    ['create_widget', { type: 'note', title: 'W' }], ['add_shortcut', { name: 'Skrót', app: 'notes' }], ['market_watch', { symbol: 'BTC', direction: 'above', price: 100000 }],
    ['set_theme', { color: 'fiolet' }], ['set_wallpaper', { wallpaper: 'void' }], ['sound_toggle', { sound: false, speech: false }]
  ];
  for (const [id, args] of cases) {
    const r = await run(id, args); assert.equal(r.ok, true, id + ': ' + r.text); assert.ok(r.undoEntry, id + ' nie zapisało cofania');
    assert.notEqual(snap(), before, id + ' nic nie zmieniło?'); const u = await J.undo.run(); assert.equal(u.ok, true, id); assert.equal(snap(), before, id + ' — cofnięcie nie przywróciło stanu');
  }
  // minutnik: start zastępujący działający + przedłużenie + stop
  J.timer.start(600, 'Pierwszy'); await run('start_timer', { seconds: 60, label: 'Drugi', show: false }); assert.deepEqual([...J.timers.all().map(t => t.label)], ['Pierwszy', 'Drugi'], 'drugi minutnik obok pierwszego'); await J.undo.run(); assert.deepEqual([...J.timers.all().map(t => t.label)], ['Pierwszy']); assert.equal(J.timer.label, 'Pierwszy'); assert.ok(J.timer.left() > 500e3);
  await run('timer_control', { action: 'extend', seconds: 120 }); const ext = J.timer.left(); await J.undo.run(); assert.ok(ext - J.timer.left() > 110e3);
  await run('timer_control', { action: 'stop' }); assert.equal(J.timer.running, false); await J.undo.run(); assert.equal(J.timer.running, true); J.timer.stop();
  // pamięć: nowy fakt da się cofnąć, istniejący nie jest usuwany przez cofnięcie duplikatu
  await run('memory_remember', { fact: 'lubię kawę' }); await J.undo.run(); assert.equal((await J.memory.all()).length, 0);
  await run('memory_remember', { fact: 'lubię herbatę' }); const dup = await run('memory_remember', { fact: 'lubię herbatę' }); assert.ok(!dup.undoEntry, 'duplikat faktu: nic do cofnięcia'); assert.equal((await J.memory.all()).length, 1);
});
test('stos cofania: limit czasu, kolejność, brak wpisu', async () => {
  const { J } = mk([]); assert.equal((await J.undo.run()).ok, false);
  let x = 0; J.undo.push({ id: 'a', label: 'A', undo: () => { x += 1; } }); J.undo.push({ id: 'b', label: 'B', undo: () => { x += 10; } });
  await J.undo.run(); assert.equal(x, 10, 'najpierw ostatnia akcja'); J.undo.stack[0].ts = Date.now() - 20 * 60e3; assert.equal((await J.undo.run()).ok, false, 'po 10 minutach nie cofamy');
});

/* ---------- nawigacja ---------- */
test('historia nawigacji: „wróć” przywraca poprzednie okno, także zamknięte', async () => {
  const { J } = mk([], {}, {}, { dom: true });
  J.wm.open('notes'); J.nav.record(); J.wm.open('schedule'); J.nav.record(); J.wm.open('weather'); J.nav.record();
  assert.equal(J.wm.focused(), 'weather'); const r = await J.registry.run('nav_back', {}, { source: 'ui' }); assert.equal(r.ok, true); assert.equal(J.wm.focused(), 'schedule');
  J.wm.close('notes'); J.nav.record(); assert.equal((await J.registry.run('nav_back', {}, { source: 'ui' })).ok, true);
  const empty = mk([], {}, {}, { dom: true }); assert.equal((await empty.J.registry.run('nav_back', {}, { source: 'ui' })).ok, false);
});
test('nawigacja poleceniami: dzień w harmonogramie, sekcja ustawień, układ jako wartość z listy', async () => {
  const { J } = mk([], {}, {}, { dom: true }); const R = J.registry;
  const m1 = R.match('pokaż dzień piątek')[0]; assert.equal(m1.id, 'schedule_day'); assert.match(m1.args.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(R.match('pokaż harmonogram na jutro')[0].id, 'schedule_day');
  assert.equal(R.match('otwórz harmonogram')[0].id, 'open_app', 'sam harmonogram to otwarcie aplikacji');
  const r = await R.run('schedule_day', { date: '2026-10-02' }, { source: 'ui' }); assert.equal(r.ok, true); assert.equal(J.wm.ctx('schedule').state().day, '2026-10-02');
  const s = R.match('otwórz ustawienia jev')[0]; assert.equal(s.id, 'settings_open'); assert.equal(R.coerce('settings_open', s.args).args.section, 'jev');
  assert.equal(R.match('otwórz ustawienia')[0].id, 'open_app');
  const arr = R.get('wm_arrange'); assert.ok(J.flow.optionsFor(arr, 'layout').some(o => o.value === 'praca'), 'presety układów są opcjami'); assert.deepEqual([...J.flow.missingRequired(arr, { mode: 'layout' })], ['layout']); assert.deepEqual([...J.flow.missingRequired(arr, { mode: 'tile' })], []);
});
