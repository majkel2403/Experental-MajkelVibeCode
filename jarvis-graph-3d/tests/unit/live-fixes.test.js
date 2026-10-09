/* Poprawki po teście na żywo (2026-10-04, prawdziwa przeglądarka + Hermes): niepewny Jev oddaje Hermesowi zamiast pytać,
   pogoda nie łyka reszty zdania, „powiedz, co zrobiłeś” to prośba o raport, tytuł notatki, cudzysłowy w zadaniu, brak odpowiedzi ≠ „Nie”. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, refShort } = require('../harness.js');
const { makeJev } = require('../jevmock.js');
const wait = ms => new Promise(r => setTimeout(r, ms));

const J0 = load({ state: { settings: { hermesOn: false } } });
const R = J0.registry, P = J0.policy;
const V = (id, conf, alts = []) => ({ intent: { id, confidence: conf, alts }, destructive: 0, clarify: 0, current: 0 });
const ctxFor = (id, o = {}) => { const cmd = R.get(id); const level = P.level(cmd, o.args); return { cmd, level, risk: level === 'A0' ? 'confirm' : 'safe', undoable: !!cmd?.undoable, source: 'typed', parserAgrees: false, slots: 'complete', mode: 'auto', ...o }; };
const route = (id, conf, o = {}, alts) => P.route(V(id, conf, alts), ctxFor(id, o));

test('polityka: Hermes osiągalny → niepewność idzie do Hermesa zamiast „Chodzi o…?”', () => {
  // A3 i A2 przy średniej pewności bez zgody parsera
  assert.deepEqual([route('open_app', .6).action, route('open_app', .6, { hermes: true }).action], ['ask_intent', 'hermes']);
  const w = route('create_widget', .89, { hermes: true }); assert.equal(w.action, 'hermes'); assert.equal(w.reason, 'R16');   // „Dodaj widget z zegarem”
  assert.equal(route('create_widget', .89).action, 'ask_intent', 'bez Hermesa pytamy jak dotąd');
  // nieodwracalne przy niskiej pewności
  assert.equal(route('notes_delete', .6, { hermes: true }).action, 'hermes');
  assert.equal(route('notes_delete', .6).action, 'ask_intent');
  // niejasne z alternatywami
  const alts = [{ id: 'unclear', p: .5 }, { id: 'wm_arrange', p: .35 }, { id: 'wm_minimize', p: .3 }];
  assert.equal(P.route(V('unclear', .5, alts), { source: 'typed', hermes: true }).action, 'hermes');
  assert.equal(P.route(V('unclear', .5, alts), { source: 'typed' }).action, 'ask_alternatives');
  // tryb „zawsze pytaj” wygrywa z Hermesem
  assert.equal(route('open_app', .6, { hermes: true, mode: 'ask' }).action, 'ask_intent');
});

test('polityka: brakujące szczegóły — sam Jev oddaje Hermesowi, parser zgodny pyta lokalnie', () => {
  const free = route('start_timer', .97, { hermes: true, slots: 'free' }); assert.equal(free.action, 'hermes'); assert.equal(free.reason, 'R15');
  assert.equal(route('start_timer', .97, { hermes: true, slots: 'free', parserAgrees: true }).action, 'ask_slots', '„ustaw minutnik” → „Na ile minut?” zostaje');
  const en = route('set_theme', .9, { hermes: true, slots: 'enum' }); assert.equal(en.action, 'fill_enum'); assert.equal(en.handoff, true, 'Jev może wybrać z listy sam, ale nie pyta');
  assert.equal(route('set_theme', .9, { hermes: true, slots: 'enum', parserAgrees: true }).handoff, undefined);
  assert.equal(route('open_app', .99, { hermes: true }).action, 'exec', 'pewne polecenia dalej lokalnie');
});

/* ścieżka Jeva na atrapie: Hermes „osiągalny” (flow.hermesUp), sam Hermes nie jest tu wołany */
const setup = async rules => {
  const mock = makeJev(rules);
  const J = load({ dom: true, fetch: mock.fetch, state: { settings: { hermesOn: false, jevOn: true, jevKey: 'k', sound: false, speech: false } } });
  J.__ctx.setTimeout = refShort;
  const st = { asks: [], asked: [] };
  J.ask = Object.assign(async (q, items) => { st.asked.push({ q, items }); return st.asks.shift(); }, { pending: false, timedOut: false });
  await wait(30);
  return { J, st, fast: t => J.flow.fast(t, { source: 'typed', run: (id, a, c) => J.registry.run(id, a, c) }) };
};

test('„Dodaj widget z zegarem.” przy Hermesie: bez pytań, sprawa dla Hermesa', async () => {
  const { J, st, fast } = await setup([{ re: /zegarem/, intent: 'create_widget', conf: .89 }]);
  J.flow.hermesUp = () => true;
  const r = await fast('Dodaj widget z zegarem.');
  assert.equal(r.handled, false); assert.equal(st.asked.length, 0, 'żadnego „Chodzi o…?” ani „Jaki rodzaj widgetu?”');
});

test('pytanie bez odpowiedzi (minął czas) → wyjaśnienie zamiast samego „Anulowano.”', async () => {
  const { J, st, fast } = await setup([{ re: /cos w wygladzie/, intent: 'set_theme', conf: .6 }]);
  J.flow.hermesUp = () => false;
  st.asks.push(null); J.ask.timedOut = true;
  const r = await fast('zrób coś w wyglądzie');
  assert.equal(r.reply, J.flow.NO_ANSWER);
  J.ask.timedOut = false; st.asks.push('yes', null);
  const r2 = await fast('zrób coś w wyglądzie');
  assert.equal(r2.reply, 'Anulowano.', 'świadome anulowanie dalej krótko');
});

test('łańcuch: „potem powiedz krótko, co zrobiłeś” to prośba o raport, nie polecenie „Powiedz na głos”', () => {
  const c = R.chain('Ustaw minutnik na 2 minuty i dodaj zadanie „sprawdzić logi Hermesa” na jutro na 9:00, potem powiedz krótko, co zrobiłeś.');
  assert.deepEqual(Array.from(c, x => x.id), ['start_timer', 'add_task']);   // Array.from: tablica z kontekstu vm ≠ tablica testu
  assert.deepEqual(Array.from(R.chain('ustaw minutnik na 5 minut i podsumuj'), x => x.id), ['start_timer'], 'jedna czynność + raport');
  assert.equal(R.chain('zanotuj: mleko i chleb'), null, 'zwykła treść notatki bez zmian');
  assert.notEqual(R.match('powiedz krótko, co zrobiłeś')[0]?.id, 'speak');
  assert.equal(R.match('powiedz dzień dobry')[0].id, 'speak');
  const m = R.match('ustaw minutnik na 2 minuty')[0];
  assert.equal(R.uncovered('ustaw minutnik na 2 minuty, potem powiedz krótko, co zrobiłeś', m).length, 0, 'raport nie jest „niepokrytą” częścią zdania');
});

test('zadanie bez cudzysłowów wokół treści; J.unquote', async () => {
  const m = R.match('dodaj zadanie „sprawdzić logi Hermesa” na jutro na 9:00')[0];
  assert.equal(m.id, 'add_task'); assert.equal(m.args.text, 'sprawdzić logi Hermesa');
  const r = await R.run('add_task', { text: '"kupić mleko"', time: '18:00' }, { source: 'ui' });
  assert.match(r.text, /^Dodałem: „kupić mleko” —/);
  assert.equal(J0.unquote('a „b” c'), 'a „b” c', 'cudzysłów w środku zostaje');
});

test('pogoda: miasto bez reszty zdania', () => {
  const m = R.match('Jaka jest teraz pogoda w Gorinchem i czy brać parasol?')[0];
  assert.equal(m.id, 'get_weather'); assert.equal(m.args.city, 'Gorinchem');
  assert.equal(R.match('pogoda w Nowym Sączu')[0].args.city, 'Nowym Sączu');
  assert.ok(R.uncovered('Jaka jest teraz pogoda w Gorinchem i czy brać parasol?', m).length, 'pytanie o parasol = dalsza część → Hermes, nie pół odpowiedzi');
});

test('tytuł notatki: część przed „—” / „: ”, inaczej granica słowa', async () => {
  const t = J0.noteTitle;
  assert.equal(t('zakupy — mleko, chleb, masło'), 'zakupy');
  assert.equal(t('Audyt Hermesa — sprawdzić bezpieczeństwo, kontekst i narzędzia.'), 'Audyt Hermesa');
  assert.equal(t('Uwaga: jutro serwis'), 'Uwaga');
  assert.equal(t('10:30 dentysta'), '10:30 dentysta');
  const long = t('Sprawdzić wszystkie konfiguracje serwerów produkcyjnych przed wdrożeniem nowej wersji aplikacji');
  assert.ok(long.endsWith('…') && long.length <= 61 && !/\s…$/.test(long), long);
  const r = await R.run('create_note', { content: 'zakupy — mleko, chleb, masło', show: false }, { source: 'ui' });
  assert.equal(r.text, 'Utworzyłem notatkę „zakupy”.');
  assert.equal(J0.state.notes.find(n => n.title === 'zakupy').body, 'zakupy — mleko, chleb, masło', 'treść w całości');
});

/* Hermes „zapowiada” czynność bez wywołania narzędzia („Mam 1 widget — zamykam.” i nic) → jedno przypomnienie */
const enc = new TextEncoder();
const sse = parts => new Response(new ReadableStream({ start(c) { parts.forEach(p => c.enqueue(enc.encode(p))); c.close(); } }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
const chunk = d => 'data: ' + JSON.stringify({ choices: [{ delta: d }] }) + '\n\n';
const hermesSetup = async responses => {
  const requests = []; let n = 0;
  const fetch = async (url, init) => {
    if (/\/models$/.test(url)) return { ok: true, status: 200, json: async () => ({ data: [] }) };
    requests.push(JSON.parse(init.body));
    return responses[Math.min(n++, responses.length - 1)]();
  };
  const J = load({ dom: true, fetch, state: { settings: { hermesOn: true, hermesProvider: 'custom', hermesUrl: 'http://serwer.test/v1', hermesModel: 'm', toolFormat: 'hermes', sound: false, speech: false } } });
  J.__ctx.setTimeout = refShort; J.HERMES_RETRY_MS = 5;
  const seen = []; const add = J.chat.add; J.chat.add = (role, text, silent) => { const h = add(role, text, silent); seen.push({ role, h }); return h; };
  await wait(30);
  return { J, requests, jarvisText: () => seen.filter(x => x.role === 'jarvis').map(x => x.h.text).pop() };
};
const call = (name, args) => '<tool_call>' + JSON.stringify({ name, arguments: args }) + '</tool_call>';

test('Hermes mówi „dodałem”, ale nie wywołał narzędzia → przypomnienie, potem czynność naprawdę wykonana', async () => {
  const { J, requests, jarvisText } = await hermesSetup([
    () => sse([chunk({ content: 'Dodałem zadanie, szefie.' })]),
    () => sse([chunk({ content: call('add_task', { text: 'kupić mleko', time: '18:00' }) })]),
    () => sse([chunk({ content: 'Dodałem: kupić mleko o 18:00.' })])
  ]);
  await J.brain.handle('dodaj zadanie kupić mleko o 18:00');
  assert.equal(requests.length, 3, 'odpowiedź bez narzędzia → przypomnienie → wywołanie → podsumowanie');
  assert.match(requests[1].messages.at(-1).content, /Nie wywołałeś żadnego narzędzia pulpitu/);
  assert.equal(J.state.tasks.filter(t => t.text === 'kupić mleko').length, 1, 'zadanie naprawdę powstało (raz)');
  assert.match(jarvisText(), /kupić mleko o 18:00/); assert.doesNotMatch(jarvisText(), /⚠/);
});

test('po przypomnieniu dalej bez narzędzia → uczciwe ostrzeżenie; pytania i odczyty bez przypomnienia', async () => {
  const a = await hermesSetup([() => sse([chunk({ content: 'Zamykam.' })])]);
  await a.J.brain.handle('dodaj zadanie kupić chleb o 19:00');
  assert.equal(a.requests.length, 2, 'tylko jedno przypomnienie');
  assert.match(a.jarvisText(), /⚠ Hermes nie wykonał tej czynności/);
  const b = await hermesSetup([() => sse([chunk({ content: 'Jest 19°C i słonecznie.' })])]);
  await b.J.brain.handle('jaka jest pogoda w Krakowie');
  assert.equal(b.requests.length, 1, 'odczyt (A3) bez przypomnienia');
});

test('„Zamknij wszystkie widgety”: widgets_remove widget="all" — jedno potwierdzenie, jedno „Cofnij”', async () => {
  const J = load({ dom: true, state: { settings: { hermesOn: false, sound: false, speech: false } } });
  const R2 = J.registry;
  assert.equal(R2.match('Zamknij wszystkie widgety na pulpicie.')[0].id, 'widgets_remove');
  assert.equal(R2.match('zamknij wszystkie widgety')[0].args.widget, 'all');
  assert.equal(R2.match('zwiń wszystkie widgety')[0].id, 'widget_collapse', 'zwijanie bez zmian');
  const none = await R2.run('widgets_remove', { widget: 'all' }, { source: 'ui' });
  assert.equal(none.code, 'NOT_FOUND');
  await R2.run('create_widget', { type: 'note', title: 'A', content: 'x', show: false }, { source: 'ui' });
  await R2.run('create_widget', { type: 'list', title: 'B', items: ['1'], show: false }, { source: 'ui' });
  assert.equal(J.widgets.list.length, 2);
  assert.match(R2.get('widgets_remove').confirmText({ widget: 'all' }), /wszystkie widgety z pulpitu \(2\)/);
  const r = await R2.run('widgets_remove', { widget: 'all' }, { source: 'ui' });
  assert.equal(r.ok, true, r.text); assert.equal(J.widgets.list.length, 0); assert.match(r.text, /wszystkie widgety \(2\): „A”, „B”/);
  r.undoEntry ? await r.undoEntry.undo() : await J.undo.run();
  assert.equal(J.widgets.list.length, 2, 'Cofnij przywraca oba');
});

test('„Dodaj widget z listą: mleko, chleb.” → lista z pozycjami (było: notatka z tytułem „z listą: mleko, chleb.”)', () => {
  const a = s => JSON.stringify(R.match(s)[0].args);
  assert.equal(a('Dodaj widget z listą: mleko, chleb.'), JSON.stringify({ type: 'list', title: 'Lista', items: ['mleko', 'chleb'] }));
  assert.equal(a('dodaj widget lista Zakupy: mleko, chleb i masło'), JSON.stringify({ type: 'list', title: 'Zakupy', items: ['mleko', 'chleb', 'masło'] }));
  assert.equal(a('dodaj widget notatka Spotkanie: jutro o 10'), JSON.stringify({ type: 'note', title: 'Spotkanie', content: 'jutro o 10' }));
  assert.equal(a('dodaj widget Pomysły'), JSON.stringify({ type: 'note', title: 'Pomysły' }));
  assert.equal(R.match('Dodaj widget z zegarem.')[0].id, 'widget_build', 'zegar: lokalny przepis widgetu bez zmian');
});
