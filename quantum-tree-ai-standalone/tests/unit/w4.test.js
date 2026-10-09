/* Fala W4: widgety z opisu (schemat, zasady bezpieczeństwa, dane z poleceń A3, odświeżanie wstrzymane, Cofnij),
   wykresy (chart_show, stats_series), rutyny (tworzenie, uruchomienie, kroki A0 pytają, zdanie uruchamiające, wyzwalacz czasowy),
   sterowanie planem (pauza przed kolejnym narzędziem Hermesa), proaktywność tylko jako propozycja. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { load, refShort } = require('../harness.js');
const { validate } = require('../../tools/schema-lite.js');
const wait = ms => new Promise(r => setTimeout(r, ms));
const mk = (settings = {}, extra = {}) => { const J = load({ dom: true, ...extra, state: { settings: { hermesOn: false, sound: false, speech: false, ...settings } } }); J.__ctx.setTimeout = refShort; return J; };
const run = (J, id, args, source = 'ui') => J.registry.run(id, args, { source });
const arr = x => JSON.parse(JSON.stringify(x));
const text = el => !el ? '' : (el.textContent || '') + ' ' + (el.children || []).map(text).join(' ');
const SPEC_DIR = path.join(__dirname, '..', '..', 'docs', 'spec');
const EX = JSON.parse(fs.readFileSync(path.join(SPEC_DIR, 'widget-przyklady.json'), 'utf8'));

test('schemat w silniku = docs/spec/widget.schema.json; walidator zgodny z tools/schema-lite.js', () => {
  const J = mk();
  const file = JSON.parse(fs.readFileSync(path.join(SPEC_DIR, 'widget.schema.json'), 'utf8')); delete file.$comment;
  assert.deepEqual(arr(J.wspec.SCHEMA), file, 'js/widget-spec.js ma nieaktualną kopię schematu');
  const bad = { v: 1, title: 'x', blocks: [{ kind: 'html', html: '<b>' }] };
  assert.equal(J.wspec.validate(J.wspec.SCHEMA, bad).length > 0, validate(file, bad).length > 0);
  EX.forEach(e => assert.deepEqual(arr(J.wspec.validate(J.wspec.SCHEMA, e.spec)), validate(file, e.spec)));
});

test('5 przykładów ze specyfikacji przechodzi pełne sprawdzenie (źródła A3, polecenia istnieją)', () => {
  const J = mk();
  EX.forEach(e => assert.deepEqual(arr(J.wspec.check(e.spec)), [], e.prompt));
});

test('opis odrzucony: blok spoza listy, pole html/onclick, źródło zapisujące, odświeżanie < 15 s, zły odnośnik, za duży', () => {
  const J = mk();
  const base = { v: 1, title: 'T', blocks: [{ kind: 'text', text: 'a' }] };
  const bad = [
    { ...base, blocks: [{ kind: 'iframe', src: 'x' }] },
    { ...base, blocks: [{ kind: 'text', text: 'a', html: '<img src=x onerror=alert(1)>' }] },
    { ...base, blocks: [{ kind: 'buttons', buttons: [{ label: 'x', command: 'open_app', onclick: 'alert(1)' }] }] },
    { ...base, sources: { a: { command: 'create_note', args: { title: 'x' } } } },
    { ...base, sources: { a: { command: 'notes_delete', args: { note: 'x' } } } },
    { ...base, sources: { a: { command: 'get_crypto_prices', refresh: 5 } } },
    { ...base, blocks: [{ kind: 'text', text: '{{$brak.x}}' }] },
    { ...base, blocks: [{ kind: 'markdown', text: 'x'.repeat(3999) }, { kind: 'markdown', text: 'x'.repeat(3999) }, { kind: 'markdown', text: 'x'.repeat(3999) }, { kind: 'markdown', text: 'x'.repeat(3999) }, { kind: 'markdown', text: 'x'.repeat(3999) }] },
    { ...base, blocks: [{ kind: 'buttons', buttons: [{ label: 'x', command: 'nie_ma_takiego' }] }] }
  ];
  bad.forEach((s, i) => assert.ok(J.wspec.check(s).length > 0, 'przypadek ' + i + ' powinien być odrzucony'));
});

test('widget_build: dane z poleceń, odnośniki i formaty, tekst z HTML pokazany jako tekst; Cofnij usuwa', async () => {
  const J = mk();
  J.tasks.add('09:00', 'Zadanie A', J.today()); const b = J.tasks.add('10:00', 'Zadanie B', J.today()); b.done = true;
  const spec = { v: 1, title: 'Dzień', sources: { zad: { command: 'tasks_list', args: { range: 'today' }, event: 'tasks' } }, blocks: [
    { kind: 'kpi', label: 'Zrobione', value: '$zad.done', format: 'number' }, { kind: 'progress', label: 'Postęp', value: '$zad.ratio', max: 1 },
    { kind: 'list', items: '$zad.tasks', field: 'text', meta: 'time' }, { kind: 'text', text: '<img src=x onerror=alert(1)> {{$zad.total}} zadań' }] };
  const r = await run(J, 'widget_build', { spec }); assert.equal(r.ok, true, r.text);
  const w = J.widgets.list.find(x => x.id === r.data.id); assert.equal(w.type, 'spec'); await wait(60);
  const body = J.wm.ctx('w:' + w.id).body, t = text(body);
  assert.match(t, /Zadanie A/); assert.match(t, /Zadanie B/); assert.match(t, /<img src=x onerror=alert\(1\)> 2 zadań/, 'HTML jako zwykły tekst, wstawka policzona');
  assert.equal(J.wspec.live.get(w.id).state, 'live');
  assert.equal(J.wspec.live.get(w.id).data.zad.done, 1);
  await J.undo.run(); await wait(20); assert.equal(J.widgets.list.some(x => x.id === w.id), false);
  const bad = await run(J, 'widget_build', { spec: { v: 1, title: 'x', blocks: [{ kind: 'script', src: 'x' }] } }); assert.equal(bad.code, 'INVALID_ARGS');
});

test('przepisy lokalne: zdanie → widget bez modelu (top 5, wykres BTC, pogoda+zadania, checklista, odliczanie)', () => {
  const J = mk();
  const cases = [['zrób widget z top 5 tokenów i zmianą 24h', 'table'], ['mini wykres BTC na pulpicie', 'chart'], ['widget z pogodą i zadaniami na dziś', 'kpi'], ['zrób kartę z checklistą na dziś', 'checklist'], ['zrób odliczanie do urlopu 15 października', 'countdown']];
  cases.forEach(([s, kind]) => { const spec = J.wspec.fromPrompt(s); assert.ok(spec, s); assert.deepEqual(arr(J.wspec.check(spec)), [], s); assert.ok(spec.blocks.some(b => b.kind === kind), s + ' → ' + kind); });
  assert.equal(J.registry.match('zrób widget z top 3 tokenów')[0].id, 'widget_build');
  assert.equal(J.wspec.fromPrompt('widget z czymś dziwnym'), null);
});

test('wspólna pamięć podręczna i odświeżanie wstrzymane przy zwiniętym widgecie', async () => {
  const J = mk();
  const spec = { v: 1, title: 'A', sources: { s: { command: 'get_datetime', args: {}, refresh: 15 } }, blocks: [{ kind: 'text', text: '{{$s.time}}' }] };
  await run(J, 'widget_build', { spec }); await run(J, 'widget_build', { spec: { ...spec, title: 'B' } }); await wait(60);
  assert.equal(J.wspec.stats.calls, 1, 'to samo polecenie i argumenty w dwóch widgetach = jedno wywołanie');
  const w = J.widgets.list.find(x => x.title === 'A'); J.widgets.collapse(w.id, true);
  const before = J.wspec.stats.calls; J.emit('tasks'); await wait(30);
  assert.equal(J.wspec.stats.calls, before);
  await run(J, 'widget_refresh', {}); assert.ok(J.wspec.stats.calls > before, 'widget_refresh wymusza pobranie');
});

test('widget_edit: tytuł, odświeżanie i wykres zdaniem, łatka JSON; Cofnij przywraca opis; zła łatka odrzucona', async () => {
  const J = mk(); J.market.ensure = async () => { }; J.market.subscribe = () => { }; J.market.unsubscribe = () => { };   // bez sieci
  const r0 = await run(J, 'widget_build', { prompt: 'widget z top 5 tokenów' }); assert.equal(r0.ok, true, r0.text); const id = r0.data.id;
  let r = await run(J, 'widget_edit', { widget: id, instruction: 'zmień tytuł widgetu na Krypto' }); assert.equal(r.ok, true, r.text);
  let w = J.widgets.list.find(x => x.id === id); assert.equal(w.title, 'Krypto');
  r = await run(J, 'widget_edit', { widget: id, instruction: 'odświeżaj co minutę' }); assert.equal(J.widgets.list.find(x => x.id === id).spec.sources.ceny.refresh, 60);
  r = await run(J, 'widget_edit', { widget: id, instruction: 'zmień ten widget na wykres słupkowy' }); assert.equal(r.ok, true, r.text);
  w = J.widgets.list.find(x => x.id === id); assert.ok(w.spec.blocks.some(b => b.kind === 'chart' && b.chart === 'bar'));
  await J.undo.run(); w = J.widgets.list.find(x => x.id === id); assert.ok(w.spec.blocks.some(b => b.kind === 'table'), 'Cofnij przywraca tabelę');
  r = await run(J, 'widget_edit', { widget: id, patch: { blocks: [{ kind: 'html', html: 'x' }] } }); assert.equal(r.code, 'INVALID_ARGS');
  r = await run(J, 'widget_edit', { widget: id, patch: { tone: 'purple' } }); assert.equal(J.widgets.list.find(x => x.id === id).spec.tone, 'purple');
  assert.equal(J.widgets.list.filter(x => x.id === id).length, 1, 'bez duplikatów po zmianach');
});

test('przycisk z poleceniem A0 w widgecie pyta zawsze, zwykły działa od razu', async () => {
  const J = mk(); const asked = []; J.confirm = async q => { asked.push(q.question); return 'no'; };
  J.registry.allowAlways('close_app');
  const spec = { v: 1, title: 'Przyciski', blocks: [{ kind: 'buttons', buttons: [{ label: 'Zamknij wszystko', command: 'close_app', args: { app: 'all' } }, { label: 'Notatnik', command: 'open_app', args: { app: 'notes' } }] }] };
  const r = await run(J, 'widget_build', { spec }, 'hermes'); assert.equal(r.ok, true); await wait(30);
  const w = J.widgets.list.find(x => x.id === r.data.id); assert.equal(w.author, 'model');
  const btns = []; const walk = el => { if (!el) return; if (el.tagName === 'BUTTON' && el.onclick) btns.push(el); (el.children || []).forEach(walk); }; walk(J.wm.ctx('w:' + w.id).body);
  await btns.find(b => b.textContent === 'Zamknij wszystko').onclick(); assert.equal(asked.length, 1, 'A0 pyta mimo „zawsze zezwalaj”');
  await btns.find(b => b.textContent === 'Notatnik').onclick(); await wait(20); assert.equal(J.wm.isOpen('notes'), true); assert.equal(asked.length, 1);
});

test('widget od modelu: przycisk zapisujący pyta i pokazuje PRAWDZIWE polecenie; odczyt/nawigacja bez pytania; widget użytkownika bez zmian', async () => {
  const J = mk(); const asked = []; J.confirm = async q => { asked.push(q.question); return 'yes'; };
  const btns = w => { const out = []; const walk = el => { if (!el) return; if (el.tagName === 'BUTTON' && el.onclick) out.push(el); (el.children || []).forEach(walk); }; walk(J.wm.ctx('w:' + w.id).body); return out; };
  // model podpisał przycisk „Pokaż pogodę”, a naprawdę tworzy notatkę
  const spec = { v: 1, title: 'Model', blocks: [{ kind: 'buttons', buttons: [{ label: 'Pokaż pogodę', command: 'create_note', args: { title: 'X', content: 'y' } }, { label: 'Notatnik', command: 'open_app', args: { app: 'notes' } }] }] };
  let r = await run(J, 'widget_build', { spec }, 'hermes'); await wait(30);
  const wm = J.widgets.list.find(x => x.id === r.data.id);
  await btns(wm).find(b => b.textContent === 'Pokaż pogodę').onclick(); await wait(20);
  assert.equal(asked.length, 1, 'zapis z widgetu modelu pyta'); assert.match(asked[0], /zbudowany przez model/); assert.match(asked[0], /wykona: Utwórz notatkę|wykona: .*notat/i);
  await btns(wm).find(b => b.textContent === 'Notatnik').onclick(); await wait(20); assert.equal(asked.length, 1, 'nawigacja (A3) bez pytania');
  // ten sam przycisk w widgecie zbudowanym przez użytkownika — bez pytania
  r = await run(J, 'widget_build', { spec: { ...spec, title: 'Mój' } }, 'ui'); await wait(30);
  const wu = J.widgets.list.find(x => x.id === r.data.id); assert.equal(wu.author, 'user');
  await btns(wu).find(b => b.textContent === 'Pokaż pogodę').onclick(); await wait(20); assert.equal(asked.length, 1);
  // model zmienia widget użytkownika → widget traci pełne zaufanie
  r = await run(J, 'widget_edit', { widget: wu.id, patch: { title: 'Mój 2' } }, 'hermes'); assert.equal(r.ok, true, r.text); assert.equal(wu.author, 'model');
});

test('wykresy: chart_show i stats_series (zadania w tygodniu, aktywność)', async () => {
  const J = mk();
  J.tasks.add('09:00', 'x', J.today()); J.tasks.add('10:00', 'y', J.today());
  let r = await run(J, 'stats_series', { kind: 'tasks_week' }); assert.equal(r.data.points.length, 7); assert.equal(r.data.points[0].y, 2);
  J.action('test'); r = await run(J, 'stats_series', { kind: 'activity' }); assert.equal(r.data.points.length, 14); assert.ok(r.data.points[13].y >= 1);
  r = await run(J, 'chart_show', { source: 'tasks_week' }); assert.equal(r.ok, true, r.text);
  assert.ok(J.widgets.list.some(w => w.type === 'spec' && w.spec.blocks[0].kind === 'chart'));
  r = await run(J, 'chart_show', { source: 'crypto', symbol: 'XYZQ' }); assert.equal(r.code, 'NOT_FOUND');
  assert.equal(J.registry.match('pokaż wykres zadań w tym tygodniu')[0].id, 'chart_show');
  assert.equal(typeof J.chart, 'function'); assert.deepEqual(arr(J.chart.points([1, { x: 'a', y: 2 }, null])), [{ x: 0, y: 1 }, { x: 'a', y: 2 }]);
});

test('rutyny: tworzenie zdaniem, uruchomienie, zdanie uruchamiające, limit, brak rutyn w rutynach, usuwanie za zgodą', async () => {
  const J = mk();
  let r = await run(J, 'routine_create', J.cmdKit.parseRoutine('zrób rutynę poranek: pogoda, zadania na dziś i otwórz notatnik'));
  assert.equal(r.ok, true, r.text); assert.equal(r.data.steps.length, 3); assert.deepEqual(arr(r.data.steps.map(s => s.command)), ['get_weather', 'tasks_list', 'open_app']);
  J.weather.get = async () => { throw Object.assign(new Error('offline'), { code: 'OFFLINE' }); };
  r = await run(J, 'routine_run', { name: 'poranek' }); assert.match(r.text, /Rutyna „poranek”/); await wait(20); assert.equal(J.wm.isOpen('notes'), true, 'krok otwórz notatnik wykonany');
  assert.equal(J.state.routines[0].runs, 1);
  r = await run(J, 'routine_create', { name: 'Pętla', steps: [{ command: 'routine_run', args: { name: 'poranek' } }] }); assert.equal(r.code, 'INVALID_ARGS');
  r = await run(J, 'routine_create', { name: 'poranek', steps: [{ command: 'get_datetime' }] }); assert.equal(r.code, 'DUPLICATE');
  r = await run(J, 'routine_create', J.cmdKit.parseRoutine('kiedy mówię start pracy, otwórz notatnik')); assert.equal(r.ok, true, r.text); assert.equal(r.data.trigger.kind, 'phrase');
  assert.equal(J.registry.match('start pracy')[0].id, 'routine_run');
  r = await run(J, 'routine_list', {}); assert.equal(r.data.routines.length, 2);
  const asked = []; J.confirm = async q => { asked.push(1); return 'no'; };
  r = await run(J, 'routine_remove', { name: 'poranek' }, 'voice'); assert.equal(r.code, 'DENIED'); assert.equal(asked.length, 1);
  r = await run(J, 'routine_remove', { name: 'poranek' }); assert.equal(r.ok, true); assert.equal(J.state.routines.length, 1);
  await J.undo.run(); assert.equal(J.state.routines.length, 2);
});

test('rutyny: krok wymagający zgody pyta zawsze (źródło „routine”), wyzwalacz czasowy raz dziennie', async () => {
  const J = mk(); const asked = []; J.confirm = async q => { asked.push(q.source); return 'no'; };
  J.registry.allowAlways('memory_forget');
  await J.memory.remember('lubię herbatę');
  let r = await run(J, 'routine_create', { name: 'Sprzątanie', steps: [{ command: 'memory_forget', args: { fact: 'herbatę' } }] }); assert.equal(r.ok, true, r.text);
  r = await run(J, 'routine_run', { name: 'Sprzątanie' }); assert.equal(r.ok, false, 'odmowa zatrzymuje rutynę');
  assert.deepEqual(asked, ['routine'], 'krok ze zgodą pyta, mimo „zawsze zezwalaj” z czatu');
  assert.equal((await J.memory.all()).length, 1, 'fakt nie został usunięty');
  const now = new Date(); const at = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  r = await run(J, 'routine_create', { name: 'Zegar', trigger: { kind: 'time', at }, steps: [{ command: 'get_datetime' }] }); assert.equal(r.ok, true, r.text);
  J.userRoutines.tick(); await wait(30); J.userRoutines.tick(); await wait(30);
  assert.equal(J.state.routines.find(x => x.name === 'Zegar').runs, 1, 'wyzwalacz czasowy uruchamia raz');
  r = await run(J, 'routine_create', { name: 'Zła', trigger: { kind: 'time', at: '25:00' }, steps: [{ command: 'get_datetime' }] }); assert.equal(r.code, 'INVALID_ARGS');
});

test('plan_control: pauza zatrzymuje przed następnym narzędziem, wznowienie kończy; pominięcie', async () => {
  const J = mk();
  J.plan.set('pause'); let passed = false; const p = J.plan.gate().then(g => { passed = g; });
  await wait(30); assert.equal(passed, false, 'czeka w pauzie');
  J.plan.set('resume'); await p; assert.equal(passed, 'go');
  J.plan.set('skip'); assert.equal(await J.plan.gate(), 'skip'); assert.equal(await J.plan.gate(), 'go');
  J.plan.set('stop'); assert.equal(await J.plan.gate(), 'stop'); J.plan.reset();
  const r = await run(J, 'plan_control', { op: 'pause' }); assert.match(r.text, /Nic teraz nie wykonuję/);
});

test('proaktywność: Jarvis sam z siebie (sygnał) tylko proponuje — nie zmienia i nie przełącza okien', async () => {
  const J = mk(); const notes = []; J.notice = n => { notes.push(n); };
  const before = J.state.tasks.length;
  let r = await J.registry.run('add_task', { text: 'Trening', time: '18:00' }, { source: 'signal' });
  assert.equal(r.ok, true); assert.equal(r.data.proposed, true); assert.equal(J.state.tasks.length, before, 'nic nie dodano');
  assert.equal(notes[0].actions[0].cmd, 'add_task');
  r = await J.registry.run('open_app', { app: 'schedule' }, { source: 'signal' }); assert.equal(r.data.proposed, true); assert.equal(J.wm.isOpen('schedule'), false);
  r = await J.registry.run('tasks_list', {}, { source: 'signal' }); assert.equal(r.data.proposed, undefined, 'odczyt działa normalnie');
});

test('parser rozpoznaje polecenia W4', () => {
  const J = mk();
  const m = s => J.registry.match(s)[0]?.id;
  const cases = [['odśwież widgety', 'widget_refresh'], ['jakie mam rutyny', 'routine_list'], ['usuń rutynę poranek', 'routine_remove'], ['uruchom rutynę poranek', 'routine_run'], ['zrób rutynę wieczór: podsumowanie dnia', 'routine_create'], ['pokaż wykres aktywności', 'chart_show'], ['mini wykres BTC', 'widget_build']];
  const bad = cases.filter(([s, id]) => m(s) !== id).map(([s, id]) => s + ' → ' + m(s) + ' (oczekiwano ' + id + ')');
  assert.deepEqual(bad, []);
});
