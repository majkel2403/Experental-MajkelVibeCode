'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const eq = (a, b, m) => assert.equal(JSON.stringify(a), JSON.stringify(b), m);
const { load } = require('../harness.js');
const J = load({ state: { settings: { hermesOn: false } } });

test('parseCalls: <tool_call> w tekście, arguments jako obiekt i jako string, błędny JSON', () => {
  const raw = 'Robię to.\n<tool_call>\n{"name":"open_app","arguments":{"app":"notes"}}\n</tool_call>\n<tool_call>{"name":"add_task","arguments":"{\\"text\\":\\"x\\"}"}</tool_call>\n<tool_call>{oops</tool_call>';
  const c = J.brain.parseCalls(raw);
  assert.equal(c.length, 3);
  eq(c[0], { name: 'open_app', args: { app: 'notes' }, ok: true, idx: c[0].idx });
  eq(c[1].args, { text: 'x' });
  assert.equal(c[2].ok, false);
});
test('parsePlan: JSON i lista tekstowa', () => {
  eq(J.brain.parsePlan('<plan>["a","b"]</plan> tekst'), ['a', 'b']);
  eq(J.brain.parsePlan('<plan>\n1. sprawdź pogodę\n2. zapisz notatkę\n</plan>'), ['sprawdź pogodę', 'zapisz notatkę']);
  assert.equal(J.brain.parsePlan('bez planu'), null);
});
test('visible: ukrywa think/plan/tool_call/environment', () => {
  const v = J.brain.visible('<think>hm</think><plan>["x"]</plan>Cześć.<tool_call>{}</tool_call>\n\n\n<environment>{}</environment>');
  assert.equal(v, 'Cześć.');
});
test('local: small talk i polecenia z rejestru', async () => {
  assert.match(await J.brain.local('cześć'), /W czym mogę pomóc/);
  assert.match(await J.brain.local('kim jesteś'), /Jarvis/);
  assert.match(await J.brain.local('ile to 15% z 2400'), /360/);
  assert.match(await J.brain.local('która godzina'), /Jest \d{2}:\d{2}/);
  assert.equal(await J.brain.local('opowiedz mi o teorii względności'), null);
});
test('local: łańcuch poleceń wykonuje oba kroki', async () => {
  const r = await J.brain.local('otwórz notatnik i minutnik 2 minuty');
  assert.match(r, /Notatnik/); assert.match(r, /Minutnik ustawiony/);
  // „i” wewnątrz treści notatki nie rozbija polecenia
  assert.match(await J.brain.local('zanotuj: mleko i chleb'), /notatkę „mleko i chleb”/);
  J.timer.stop();
});
test('events: reduktor, plan, hold, log', () => {
  const eg = J.engine;
  J.ev.emit('task.created', { title: 't', task_id: 'x1' });
  assert.equal(eg.mode, 'THINKING'); assert.equal(eg.taskId, 'x1');
  J.ev.emit('plan.created', { steps: ['a', 'b'], task_id: 'x1' });
  assert.equal(eg.plan.steps.length, 2);
  J.ev.emit('tool.started', { tool: 'get_weather', task_id: 'x1' });
  assert.equal(eg.mode, 'EXECUTING');
  J.ev.emit('approval.requested', { task_id: 'x1' });
  assert.equal(eg.mode, 'APPROVAL_REQUIRED'); assert.equal(eg.hold, 'APPROVAL_REQUIRED');
  J.ev.emit('tool.completed', { tool: 'get_weather', task_id: 'x1' });
  assert.equal(eg.mode, 'APPROVAL_REQUIRED', 'hold blokuje recompute');
  assert.equal(eg.plan.done, 1);
  J.ev.emit('approval.resolved', { task_id: 'x1' });
  assert.notEqual(eg.hold, 'APPROVAL_REQUIRED');
  J.ev.emit('task.paused', { task_id: 'x1' }); assert.equal(eg.mode, 'PAUSED');
  J.ev.emit('task.resumed', { task_id: 'x1' });
  J.ev.emit('task.completed', { title: 't', task_id: 'x1' });
  assert.equal(eg.mode, 'COMPLETED'); assert.equal(eg.taskId, null);
  assert.ok(eg.recent(3).length === 3);
  assert.match(eg.rgb() || '', /57,229,154/);
});
test('context.packet: pełny i diff', () => {
  J.context.reset();
  const full = J.context.packet({ full: true });
  assert.equal(full._full, true); assert.ok(full.desktop && full.tasks && full.notes && full.conn);
  assert.equal(full.conn.hermes, 'off');
  const diff = J.context.packet();
  assert.equal(diff._full, false); assert.ok(diff.time); assert.equal(diff.notes, undefined, 'niezmienione sekcje są pomijane');
  J.notes.add('Nowa', 'x');
  const diff2 = J.context.packet();
  assert.ok(diff2.notes, 'zmiana notatek trafia do diffu');
  const txt = J.context.text(); assert.match(txt, /^<environment>/);
});
test('signals: kolejka i drenaż do pakietu', () => {
  J.signals.push('timer.ended', { label: 'Pomodoro' }, { notice: false });
  assert.equal(J.signals.pending().length, 1);
  const p = J.context.packet({ full: true });
  assert.equal(p.signals.length, 1); assert.match(p.signals[0].text, /Pomodoro/);
  assert.equal(J.signals.pending().length, 0, 'po wysłaniu sygnał jest dostarczony');
});
test('ics: import wydarzeń', () => {
  const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20261001T090000\r\nSUMMARY:Dentysta\\, kontrola\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261002\r\nSUMMARY:Urlop\r\nEND:VEVENT\r\nEND:VCALENDAR';
  const ev = J.ics.parse(ics);
  assert.equal(ev.length, 2); assert.equal(ev[0].start.time, '09:00'); assert.equal(ev[0].summary, 'Dentysta, kontrola'); assert.equal(ev[1].start.time, '');
  assert.equal(J.ics.import(ics), 2); assert.equal(J.ics.import(ics), 0, 'duplikaty pomijane');
});
test('bootstrapConfig: config.local.js i parametry adresu, tylko dozwolone pola', () => {
  const { load: L } = require('../harness.js');
  const K = L({ files: ['core.js'], config: { jevKey: 'sk-or-file', jevOn: 'true', hackerField: 'no', city: 'Gdańsk' } });
  assert.equal(K.state.settings.jevKey, 'sk-or-file'); assert.equal(K.state.settings.jevOn, true); assert.equal(K.state.settings.city, 'Gdańsk'); assert.equal(K.state.settings.hackerField, undefined);
  const U = L({ files: ['core.js'], location: { href: 'http://localhost/index.html?jevKey=sk-or-url&hermesOn=0&foo=1#x', search: '?jevKey=sk-or-url&hermesOn=0&foo=1' } });
  assert.equal(U.state.settings.jevKey, 'sk-or-url'); assert.equal(U.state.settings.jevOn, true, 'sam klucz włącza Jeva'); assert.equal(U.state.settings.hermesOn, false);
  assert.equal(U.configuredFrom, 'url');
  assert.ok(!/jevKey/.test(U.__ctx.location.href), 'klucz usunięty z adresu'); assert.ok(/foo=1/.test(U.__ctx.location.href), 'obce parametry zostają');
});

/* ===================== testy napraw po audycie ===================== */
test('settings_get: żaden klucz API nie trafia do modelu', async () => {
  const K = load({ state: { settings: { hermesOn: false, openrouterKey: 'sk-or-SEKRET1', jevKey: 'sk-or-SEKRET2', hermesKey: 'SEKRET3' } } });
  const r = await K.registry.run('settings_get', {}, { source: 'hermes' });
  assert.equal(r.ok, true);
  const txt = JSON.stringify(r);
  for (const s of ['SEKRET1', 'SEKRET2', 'SEKRET3']) assert.ok(!txt.includes(s), 'wyciek: ' + s);
  assert.equal(Object.keys(r.data).filter(k => /key$/i.test(k)).length, 0);
  assert.equal(r.data.city, 'Wrocław', 'zwykłe ustawienia nadal są zwracane');
});
test('zgoda z rozmowy: cofalne działanie z mostu bez użytkownika przy ekranie → NEEDS_CONFIRMATION od razu, potem wykonanie z flagą', async () => {
  const K = load({ state: { settings: { hermesOn: false } } });
  K.__ctx.document.hasFocus = () => false;   // użytkownik pisze na Telegramie, karta na drugim monitorze
  let asked = 0; K.confirm = async () => { asked++; return 'timeout'; };
  K.widgets.create('note', { title: 'Do usunięcia', content: '' });
  const t0 = Date.now();
  let r = await K.registry.run('widgets_remove', { widget: 'Do usunięcia' }, { source: 'hermes', bridge: true });
  assert.equal(r.code, 'NEEDS_CONFIRMATION'); assert.equal(asked, 0, 'bez okna, którego nikt nie zobaczy'); assert.ok(Date.now() - t0 < 500, 'od razu, nie po minucie');
  assert.match(r.text, /user_confirmed_in_chat=true/);
  r = await K.registry.run('widgets_remove', { widget: 'Do usunięcia', user_confirmed_in_chat: true }, { source: 'hermes', bridge: true });
  assert.equal(r.ok, true, r.text); assert.equal(K.widgets.list.length, 0); assert.equal(asked, 0);
  await K.undo.run(); assert.equal(K.widgets.list.length, 1, 'zgoda z rozmowy nie odbiera „Cofnij”');
});
test('zgoda z rozmowy: sam fokus okna nie oznacza obecności — liczy się niedawna aktywność w karcie', async () => {
  const K = load({ state: { settings: { hermesOn: false } } });
  K.__ctx.document.hasFocus = () => true; K.__ctx.document.visibilityState = 'visible';   // okno na pierwszym planie…
  let asked = 0; K.confirm = async () => { asked++; return 'yes'; };
  K.widgets.create('note', { title: 'A', content: '' }); K.widgets.create('note', { title: 'B', content: '' });
  K.lastInput = Date.now() - 10 * 60e3;   // …ale nikt go nie dotknął od 10 minut
  let r = await K.registry.run('widgets_remove', { widget: 'A' }, { source: 'hermes', bridge: true });
  assert.equal(r.code, 'NEEDS_CONFIRMATION'); assert.equal(asked, 0);
  K.lastInput = Date.now() - 5e3;   // ruch myszą przed chwilą: użytkownik jest — zwykłe okno zgody
  r = await K.registry.run('widgets_remove', { widget: 'B' }, { source: 'hermes', bridge: true });
  assert.equal(r.ok, true, r.text); assert.equal(asked, 1);
});
test('zgoda z rozmowy NIE działa dla nieodwracalnych, przy manipulacji ani dla źródeł innych niż Hermes', async () => {
  const K = load({ state: { settings: { hermesOn: false } } });
  K.__ctx.document.hasFocus = () => false;
  let asked = 0; K.confirm = async () => { asked++; return 'no'; };
  // nieodwracalne/wrażliwe: flaga ignorowana, decyduje okno na ekranie
  for (const [id, args] of [['clipboard_read', {}], ['open_url', { url: 'https://example.com' }], ['notes_empty_trash', {}]]) {
    const r = await K.registry.run(id, { ...args, user_confirmed_in_chat: true }, { source: 'hermes', bridge: true });
    assert.equal(r.code, 'DENIED', id + ': ' + r.text);
  }
  assert.equal(asked, 3, 'każde z nich pytało na ekranie');
  // wykryta manipulacja (forceConfirm): flaga ignorowana
  K.widgets.create('note', { title: 'X', content: '' });
  let r = await K.registry.run('widgets_remove', { widget: 'X', user_confirmed_in_chat: true }, { source: 'hermes', bridge: true, forceConfirm: 'Podejrzana treść — potwierdź' });
  assert.equal(r.code, 'DENIED'); assert.equal(K.widgets.list.length, 1);
  // głos / Jev: flaga nic nie znaczy
  r = await K.registry.run('widgets_remove', { widget: 'X', user_confirmed_in_chat: true }, { source: 'voice' });
  assert.equal(r.code, 'DENIED'); assert.equal(K.widgets.list.length, 1);
  // schemat dla Hermesa: flaga tylko przy działaniach cofalnych
  const names = t => Object.keys(K.registry.tools().find(x => x.function.name === t).function.parameters.properties || {});
  assert.ok(names('widgets_remove').includes('user_confirmed_in_chat'));
  assert.ok(!names('computer_use').includes('user_confirmed_in_chat')); assert.ok(!names('files_write').includes('user_confirmed_in_chat'));
});
test('aliasy pól: pomyłki modelu z prawdziwej rozmowy działają zamiast INVALID_ARGS', async () => {
  const K = load({ state: { settings: { hermesOn: false } } });
  const R = K.registry;
  // set_theme {theme} → color
  let r = await R.run('set_theme', { theme: 'złoty' }, { source: 'local' }); assert.equal(r.ok, true, r.text);
  // ui_highlight {selector} → target (tylko koercja — bez DOM)
  let c = R.coerce('ui_highlight', { selector: 'dock', text: 'tu' }); assert.equal(c.ok, true, c.text); assert.equal(c.args.target, 'dock');
  // widgets_remove {id} → widget
  c = R.coerce('widgets_remove', { id: 'uc0lal8oi7y' }); assert.equal(c.ok, true, c.text); assert.equal(c.args.widget, 'uc0lal8oi7y');
  // create_note {title, text} → content; prawdziwe pole ma pierwszeństwo przed aliasem
  c = R.coerce('create_note', { title: 'A', text: 'treść' }); assert.equal(c.ok, true, c.text); assert.equal(c.args.content, 'treść');
  c = R.coerce('create_note', { title: 'A', content: 'prawdziwa', text: 'alias' }); assert.equal(c.args.content, 'prawdziwa');
  // widgetId (camelCase) → widget
  c = R.coerce('widgets_remove', { widgetId: 'x1' }); assert.equal(c.args.widget, 'x1');
  // brak jakiegokolwiek dopasowania → nadal czytelny błąd
  c = R.coerce('widgets_remove', { foo: 'x' }); assert.equal(c.ok, false); assert.match(c.text, /widget/);
});
test('usuwanie: brak obiektu → NOT_FOUND bez pytania o zgodę; same spacje nie pasują do wszystkiego', async () => {
  const K = load({ state: { settings: { hermesOn: false } } });
  let asked = 0; K.confirm = async () => { asked++; return 'yes'; };
  K.notes.add('Zakupy', 'mleko'); K.widgets.create('note', { title: 'Lista', content: '' });
  for (const [id, args] of [['widgets_remove', { widget: 'nie-ma-takiego' }], ['notes_delete', { note: 'nie ma takiej' }], ['tasks_remove', { task: 'nie ma' }], ['shortcut_remove', { name: 'nie ma' }]]) {
    const r = await K.registry.run(id, args, { source: 'hermes' });
    assert.equal(r.code, 'NOT_FOUND', id + ': ' + r.text);
  }
  assert.equal(asked, 0, 'żadnego okna zgody dla nieistniejących rzeczy');
  let r = await K.registry.run('notes_delete', { note: '   ' }, { source: 'hermes' });
  assert.equal(r.code, 'INVALID_ARGS', 'same spacje nie trafiają w losową notatkę');
  r = await K.registry.run('widgets_remove', { widget: 'Lista' }, { source: 'hermes' });   // istnieje → normalnie pyta
  assert.equal(r.ok, true, r.text); assert.equal(asked, 1);
});
test('memory_remember: poufne dane z modelu/mostu nie trafiają do pamięci; ręcznie wpisane — tak', async () => {
  const K = load({ state: { settings: { hermesOn: false } } });
  let r = await K.registry.run('memory_remember', { fact: 'moje hasło do banku to Kot123' }, { source: 'hermes', bridge: true });
  assert.equal(r.code, 'DENIED'); assert.equal((await K.memory.all()).length, 0);
  r = await K.registry.run('memory_remember', { fact: 'PESEL 90010112345' }, { source: 'jev' });
  assert.equal(r.code, 'DENIED');
  r = await K.registry.run('memory_remember', { fact: 'lubię kawę o 9' }, { source: 'hermes' });
  assert.equal(r.ok, true, 'zwykłe fakty bez zmian');
  r = await K.registry.run('memory_remember', { fact: 'hasło do wifi: Dom2024' }, { source: 'local' });
  assert.equal(r.ok, true, 'wpisane ręcznie — decyzja użytkownika');
  K.confirm = async () => 'yes';   // ścieżka Hermesa w karcie: strażnik pyta (forceConfirm), użytkownik mówi „tak” → zapis
  r = await K.registry.run('memory_remember', { fact: 'kod do bramy to PIN 4321' }, { source: 'hermes', forceConfirm: 'To wygląda na poufną informację. Zapamiętać?' });
  assert.equal(r.ok, true, 'po zgodzie na ekranie — zapisane: ' + r.text);
});
test('desktop_open: karta wchodzi do systemu bez kliknięcia i raportuje stan', async () => {
  const K = load({ state: { settings: { hermesOn: false } } });
  let entered = 0; K.bootEnter = () => { entered++; K.booted = true; K.bootVia = 'bridge'; K.bootAt = Date.now(); K.bootEnter = null; };
  let r = await K.registry.run('desktop_open', {}, { source: 'hermes', bridge: true });
  assert.equal(r.ok, true, r.text); assert.equal(entered, 1); assert.equal(r.data.booted, true); assert.equal(r.data.entered_now, true);
  assert.match(r.text, /Wszedłem do systemu/);
  r = await K.registry.run('desktop_open', {}, { source: 'hermes', bridge: true });   // drugi raz: nic do zdejmowania
  assert.equal(entered, 1); assert.equal(r.data.booted, true);
  assert.equal(K.policy.level('desktop_open'), 'A1', 'bezpieczne — bez okna zgody');
});
test('e2e_cleanup: usuwa tylko artefakty testów mostu, nic więcej', async () => {
  const K = load({ state: { settings: { hermesOn: false } } });
  K.notes.add('__E2E_LEFTOVER_1791061718630__', 'x'); K.notes.add('E2E test note 1791061718630', 'x'); K.notes.add('Moje E2E notatki', 'nie ruszać'); K.notes.add('__E2E_LEFTOVER', 'też nie — brak sufiksu?');
  K.widgets.create('list', { title: '__E2E_LEFTOVER_WIDGET_1791061718630__', items: [] }); K.widgets.create('list', { title: 'E2E drill widget 1791061718630', items: [] }); K.widgets.create('note', { title: 'Zakupy', content: '' }); K.widgets.create('note', { title: 'E2E drill widget', content: 'bez liczby — prawdziwy' });
  const r = await K.registry.run('e2e_cleanup', {}, { source: 'hermes' });
  assert.equal(r.ok, true); assert.equal(r.code, 'OK', 'bez pytania o zgodę');
  assert.equal(JSON.stringify(K.widgets.list.map(w => w.title).sort()), JSON.stringify(['E2E drill widget', 'Zakupy']));   // tablica z kontekstu vm — porównanie przez JSON
  assert.ok(K.state.notes.some(n => n.title === 'Moje E2E notatki'));
  assert.ok(!K.state.notes.some(n => /^E2E test note \d/.test(n.title)));
});
test('settings_get: tokeny i sekrety (bridgeToken itp.) też nie trafiają do modelu', async () => {
  const K = load({ state: { settings: { hermesOn: false, bridgeToken: 'SEKRET-TOK1', gatewayToken: 'SEKRET-TOK2', webhookSecret: 'SEKRET-SEC1' } } });
  const r = await K.registry.run('settings_get', {}, { source: 'hermes' });
  assert.equal(r.ok, true);
  const txt = JSON.stringify(r);
  for (const s of ['SEKRET-TOK1', 'SEKRET-TOK2', 'SEKRET-SEC1']) assert.ok(!txt.includes(s), 'wyciek: ' + s);
  assert.equal(Object.keys(r.data).filter(k => /(key|token|secret)$/i.test(k)).length, 0);
});
test('głos: ryzykowne polecenia pytają o zgodę, wpisane ręcznie — nie', async () => {
  const K = load({ state: { settings: { hermesOn: false } } });
  let asked = 0, answer = 'no'; K.confirm = async () => { asked++; return answer; };
  K.notes.add('Testowa', 'x');
  K.brain.lastSource = 'voice';
  const denied = await K.brain.local('usuń notatkę Testowa');
  assert.equal(asked, 1, 'głos → pytanie'); assert.match(denied, /odmówił/); assert.equal(K.state.notes.some(n => n.title === 'Testowa'), true, 'notatka została');
  answer = 'yes';
  const done = await K.brain.local('usuń notatkę Testowa');
  assert.equal(asked, 2); assert.match(done, /do kosza/); assert.equal(K.notes.live().some(n => n.title === 'Testowa'), false);
  K.notes.add('Druga', 'x'); K.brain.lastSource = 'user';
  const typed = await K.brain.local('usuń notatkę Druga');
  assert.equal(asked, 2, 'tekst wpisany ręcznie nie pyta'); assert.match(typed, /do kosza/);
});
test('trimHistory: przycięcie zawsze zaczyna się od prawdziwej wypowiedzi użytkownika', () => {
  const h = []; for (let i = 0; i < 25; i++) { h.push({ role: 'user', content: 'u' + i }, { role: 'assistant', content: '', tool_calls: [{ id: 'c' + i }] }, { role: 'tool', tool_call_id: 'c' + i, content: '{}' }, { role: 'assistant', content: 'ok' }); }
  for (const max of [3, 7, 8, 10, 39, 40, 41]) { const t = J.brain.trimHistory(h, max); assert.equal(t[0].role, 'user', 'max=' + max); assert.ok(t.length >= Math.min(max, h.length)); assert.equal(t[t.length - 1], h[h.length - 1]); }
  // format tekstowy: wynik narzędzia to wiadomość „user” z <tool_response> — też nie może być początkiem
  const g = [{ role: 'user', content: 'pytanie' }, { role: 'assistant', content: '<tool_call>{}</tool_call>' }, { role: 'user', content: '<tool_response>{}</tool_response>' }, { role: 'assistant', content: 'gotowe' }];
  assert.equal(J.brain.trimHistory(g, 2)[0].content, 'pytanie');
  // bieżące pytanie (keep) nigdy nie znika, nawet gdy wymiana jest dłuższa niż limit
  const longRun = [{ role: 'user', content: 'stare' }, { role: 'assistant', content: 'x' }, { role: 'user', content: 'BIEŻĄCE' }]; for (let i = 0; i < 30; i++) longRun.push({ role: 'assistant', content: 'a' + i }, { role: 'user', content: '<tool_response>r</tool_response>' });
  const keep = longRun[2]; assert.ok(J.brain.trimHistory(longRun, 10, keep).includes(keep));
  assert.equal(J.brain.trimHistory([], 5).length, 0);
});
test('prompt systemowy jest stały: godzina i streszczenie nie zmieniają go między turami', () => {
  const K = load({ state: { settings: { hermesOn: false } } });
  K.hhmm = () => '10:00'; const a = K.brain.systemPrompt('hermes'); K.hhmm = () => '10:01'; const b = K.brain.systemPrompt('hermes');
  assert.equal(a, b); assert.ok(!/godzina \d/.test(a)); assert.match(a, /<environment>/); assert.match(a, /<summary>/);
});
test('zapis stanu: przepełnienie nie jest ciche — najpierw odzysk miejsca, potem ostrzeżenie (raz)', () => {
  const K = load({ files: ['core.js'] }); const ls = K.__ctx.localStorage, orig = ls.setItem.bind(ls);
  let toasts = 0; K.toast = () => { toasts++; };
  for (let i = 0; i < 100; i++) K.state.notifs.push({ id: 'n' + i, title: 'x'.repeat(200) });
  ls.setItem = (k, v) => { if (v.length > 8000) throw new Error('QuotaExceededError'); orig(k, v); };
  assert.equal(K.saveNow(), true, 'po przycięciu powiadomień zapis się udaje'); assert.equal(toasts, 0); assert.ok(K.state.notifs.length <= 20);
  ls.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.equal(K.saveNow(), false); assert.equal(toasts, 1, 'użytkownik dostaje ostrzeżenie');
  assert.equal(K.saveNow(), false); assert.equal(toasts, 1, 'ostrzeżenie tylko raz');
  ls.setItem = orig; assert.equal(K.saveNow(), true); assert.equal(K.saveFailed, false, 'po powrocie miejsca flaga się czyści');
});
test('zapis stanu: historia Process Log nie jest w głównym kluczu po migracji', () => {
  const K = load({ files: ['core.js'] }); K.state.history = [{ id: 'h1', title: 'zadanie', ts: 1, steps: [] }];
  K.saveNow(); assert.equal(JSON.parse(K.__ctx.localStorage.getItem('jarvis-os:v2')).history.length, 1, 'przed migracją historia jest zachowana');
  K.historyMigrated = true; K.saveNow(); assert.equal(JSON.parse(K.__ctx.localStorage.getItem('jarvis-os:v2')).history.length, 0, 'po migracji zapis jest lekki');
  assert.equal(K.state.history.length, 1, 'w pamięci historia zostaje');
});
test('konfiguracja przez fragment #: działa, czyści adres, nie ostrzega o serwerze', () => {
  const H = load({ files: ['core.js'], location: { href: 'http://localhost/index.html#jevKey=sk-or-hash&city=Sopot&inne=1', search: '', hash: '#jevKey=sk-or-hash&city=Sopot&inne=1' } });
  assert.equal(H.state.settings.jevKey, 'sk-or-hash'); assert.equal(H.state.settings.city, 'Sopot'); assert.equal(H.state.settings.jevOn, true);
  assert.equal(H.configViaQuery, undefined);
  const href = H.__ctx.location.href; assert.ok(!/jevKey|Sopot/.test(href), 'sekrety zniknęły z adresu: ' + href); assert.ok(/inne=1/.test(href), 'obce parametry zostają');
  const Q = load({ files: ['core.js'], location: { href: 'http://localhost/?jevKey=sk-or-q', search: '?jevKey=sk-or-q' } });
  assert.equal(Q.state.settings.jevKey, 'sk-or-q'); assert.equal(Q.configViaQuery, true, 'klucz w „?” daje ostrzeżenie');
});
test('polityka A0–A3 zgodna z rejestrem: każdy wpis A3/A2 istnieje i naprawdę ma ten poziom', () => {
  const K = load({ state: { settings: { hermesOn: false } } });
  const bad = [];
  for (const [name, set] of [['A3', K.policy.A3], ['A2', K.policy.A2]]) for (const id of set) { const c = K.registry.get(id); if (!c) bad.push(name + ': brak ' + id); else if (K.policy.level(c, {}) !== name) bad.push(name + ': ' + id + ' → ' + K.policy.level(c, {})); }
  assert.deepEqual(bad, [], 'martwe albo sprzeczne wpisy: ' + bad.join(', '));
});
test('store.push: 50 równoczesnych dopisań do jednego logu — żaden wpis nie ginie, limit działa', async () => {
  const K = load({ state: { settings: { hermesOn: false } } });
  await Promise.all(Array.from({ length: 50 }, (_, i) => K.store.push('t.log', i)));
  assert.equal((await K.store.get('t.log', [])).length, 50);
  await Promise.all(Array.from({ length: 30 }, (_, i) => K.store.push('t.cap', i, 10)));
  const cap = await K.store.get('t.cap', []); assert.equal(cap.length, 10); assert.equal(cap[9], 29, 'zostają najnowsze');
});
test('service worker: każdy plik powłoki istnieje, a każdy skrypt ze strony jest w powłoce offline', () => {
  const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const shell = JSON.parse(sw.match(/const SHELL = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  const missing = shell.filter(f => f !== './' && !fs.existsSync(path.join(ROOT, f)));
  assert.deepEqual(missing, [], 'brakujące pliki w SHELL: ' + missing.join(', '));
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/src="(js\/[^"]+)"/g)].map(m => m[1]);
  const notCached = scripts.filter(s => !shell.includes(s));
  assert.deepEqual(notCached, [], 'skrypty strony bez wersji offline: ' + notCached.join(', '));
});
