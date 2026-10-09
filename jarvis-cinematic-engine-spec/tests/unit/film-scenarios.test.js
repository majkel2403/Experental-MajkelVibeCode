/* Film jako moduł scenariuszy (js/film-scenarios.js): tryby i wyłącznik, klasyfikacja zadań z Process Logu, progi „dłuższego” zadania,
   włączanie samo / propozycja / cisza, kroki dochodzące w trakcie, powtórka z zapisu i polecenie „pokaż film z zadania”.
   Obraz i dźwięk filmu sprawdza e2e (tests/e2e/smoke.js) i próba na żywo — tu silnik filmu jest atrapą (C.openSource). */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../harness.js');

const arr = x => JSON.parse(JSON.stringify(x));   // tablice i obiekty z innego kontekstu vm
const mk = (settings = {}) => {
  const J = load({ dom: true, state: { settings: { sound: false, speech: false, ...settings } } });
  const C = J.workflows.cinema, S = C._scen, opened = [], cards = [];
  C.openSource = (src, evs, o) => { opened.push({ src: arr(src), evs: evs ? arr(evs) : null, o }); return true; };
  J.chat.quick = (text, opts, cb) => { const c = { text, opts, cb, removed: false, remove() { c.removed = true; } }; cards.push(c); return c; };
  /* zadanie z Process Logu: n narzędzi (każde kończy się od razu), czas „zaczął się” sekundy temu */
  const task = (title, { tools = 4, kind = 'tool', ago = 3, fail = -1, reply = 'Gotowe.', end = 'ok' } = {}) => {
    const t = J.proc.start(title); t.ts -= ago * 1000; const rec = S.recs.get(t.id); if (rec) rec.t0 = t.ts;
    for (let i = 0; i < tools; i++) { const st = J.proc.step(kind, kind === 'tool' ? 'get_weather' : 'terminal — ls ' + i, [], { running: true }); if (i === fail) st.fail('brak sieci'); else st.done(); }
    if (reply !== null) J.proc.step('reply', 'Odpowiedź Jarvisa', [['Treść', reply]], { preview: reply.slice(0, 70) });
    return { t, rec, end: () => J.proc.end(end, reply || '') };
  };
  return { J, C, S, opened, cards, task };
};

test('tryby: domyślne, wyłącznik modułu, ustawienia i zgodność ze starym „Film workflow”', () => {
  const { C, J } = mk();
  assert.deepEqual(arr(['workflow', 'telegram', 'cron', 'chat', 'day'].map(id => C.mode(id))), ['ask', 'auto', 'auto', 'auto', 'ask']);
  assert.deepEqual(arr(C.scenarios().map(d => d.id)), ['workflow', 'telegram', 'cron', 'chat', 'day']);
  assert.equal(C.setMode('chat', 'ask'), true); assert.equal(C.mode('chat'), 'ask'); assert.equal(C.mode('telegram'), 'auto', 'inne scenariusze bez zmian');
  assert.equal(C.setMode('workflow', 'auto'), true); assert.equal(J.state.settings.wfFilm, 'auto', 'workflow dalej w starym kluczu');
  assert.equal(C.setMode('day', 'auto'), false, 'film dnia nie ma trybu „sam”'); assert.equal(C.setMode('nie-ma', 'ask'), false); assert.equal(C.setMode('chat', 'zle'), false);
  J.state.settings.filmOn = false;
  assert.deepEqual(arr(['workflow', 'telegram', 'cron', 'chat', 'day'].map(id => C.mode(id))), ['off', 'off', 'off', 'off', 'off'], 'wyłącznik modułu gasi wszystko');
  assert.equal(C.rawMode('chat'), 'ask', 'ustawienia scenariuszy zostają pod wyłącznikiem');
  const old = mk({ wfFilm: 'off' }); assert.equal(old.C.mode('day'), 'off', 'dawne „nie proponuj” wyłączało też film dnia');
  const bad = mk({ filmScen: { chat: 'dziwne' } }); assert.equal(bad.C.mode('chat'), 'auto', 'zła wartość → domyślna');
});

test('klasyfikacja zadań: kanał z tytułu, workflow pomijany, reszta to polecenia z czatu', () => {
  const { S } = mk(), id = t => S.classify(t)?.id ?? null;
  assert.equal(id('Telegram: sprawdź pogodę'), 'telegram'); assert.equal(id('Konsola: ls'), 'telegram'); assert.equal(id('Hermes: coś'), 'telegram');
  assert.equal(id('Cron: raport rynku'), 'cron'); assert.equal(id('Workflow: Od pomysłu do projektu'), null);
  assert.equal(id('ustaw minutnik i otwórz notatnik'), 'chat');
  assert.equal(S.bare('Telegram: sprawdź pogodę'), 'sprawdź pogodę'); assert.equal(S.bare('zwykłe polecenie'), 'zwykłe polecenie');
});

test('zwijanie scen: powtórzone narzędzia ×N, nadmiar w jedną scenę, odpowiedź zostaje na końcu', () => {
  const { S } = mk();
  const t = (id, title, state = 'done') => ({ id: 'p' + id, title, kind: 'tool', state, ms: 10 });
  const c1 = arr(S.compact([t(1, 'Pogoda'), t(2, 'Pogoda'), t(3, 'Pogoda'), t(4, 'Notatka')]));
  assert.deepEqual(c1.map(s => s.title), ['Pogoda (×3)', 'Notatka']); assert.equal(c1[0].ms, 30);
  assert.equal(arr(S.compact([t(1, 'A'), t(2, 'A', 'failed')])).length, 2, 'nieudane nie zlewa się z udanymi');
  const many = Array.from({ length: 30 }, (_, i) => t(i, 'Narzędzie ' + i)).concat([{ id: 'pr', title: 'Odpowiedź', kind: 'answer', state: 'done' }]);
  const c2 = arr(S.compact(many, 8));
  assert.equal(c2.length, 8); assert.equal(c2[c2.length - 1].title, 'Odpowiedź'); assert.match(c2[6].title, /^Kolejne kroki \(\d+\)$/);
  assert.equal(c2.slice(0, 6).map(s => s.title).join(), many.slice(0, 6).map(s => s.title).join(), 'początek bez zmian');
});

test('tryb „sam”: dłuższe zadanie z czatu włącza film na żywo, kroki i koniec dochodzą w trakcie', () => {
  const { task, opened, cards, J } = mk();
  const k = task('sprawdź pogodę i zrób notatkę', { tools: 4, reply: null });
  assert.equal(opened.length, 1, 'po 4 narzędziach film rusza sam'); assert.equal(cards.length, 0);
  const o = opened[0]; assert.equal(o.evs, null, 'na żywo'); assert.equal(o.o.scen, 'chat'); assert.equal(o.o.dyn, true); assert.equal(o.src.name, 'Zadanie z pulpitu');
  assert.equal(o.src.inputs.zadanie, 'sprawdź pogodę i zrób notatkę'); assert.deepEqual(o.src.steps.map(s => s.state), ['done', 'done', 'done', 'running'], 'film rusza w chwili, gdy czwarte narzędzie jeszcze trwa'); assert.ok(o.src.steps.every(s => s.kind === 'tool'));
  assert.equal(o.o.feed.get().steps[3].state, 'done', 'a migawka na żywo zna już jego koniec');
  const got = []; const off = o.o.feed.on(e => got.push(arr(e)));
  const st = J.proc.step('server', 'terminal — ls', [], { running: true });
  assert.equal(got.length, 1); assert.equal(got[0].type, 'step.started'); assert.equal(got[0].step.kind, 'server'); assert.equal(got[0].step.title, 'terminal — ls'); assert.equal(got[0].run_id, o.src.id);
  st.done(); assert.equal(got[1].type, 'step.completed');
  const bad = J.proc.step('tool', 'get_weather', [], { running: true }); bad.fail('brak sieci');
  assert.equal(got[3].type, 'step.failed'); assert.equal(got[3].soft, true, 'pojedyncze nieudane narzędzie jest łagodne'); assert.match(got[3].reason, /brak sieci/);
  J.proc.step('reply', 'Odpowiedź Jarvisa', [['Treść', 'Jest 18 stopni.']], { preview: 'Jest 18 stopni.' });
  assert.equal(got.at(-1).type, 'step.completed'); assert.equal(got.at(-1).artifact.fields.Treść, 'Jest 18 stopni.'); assert.equal(got.at(-1).kind, 'answer');
  J.proc.end('ok', 'Jest 18 stopni.');
  assert.equal(got.at(-1).type, 'run.completed'); assert.equal(got.at(-1).state, 'done'); assert.equal(got.at(-1).report, 'Jest 18 stopni.');
  assert.equal(cards.length, 0, 'film się otworzył — po zadaniu bez dodatkowej propozycji');
  assert.equal(o.o.feed.get().state, 'done'); off();
});

test('progi: krótkie i błyskawiczne zadania zostają bez filmu; Telegram od 3 narzędzi; wyłączone = cisza', () => {
  const a = mk(); a.task('pogoda', { tools: 2, ago: 5 }).end();
  assert.equal(a.opened.length, 0, '2 narzędzia w 5 s to nie jest „dłuższe” zadanie'); assert.equal(a.cards.length, 0);
  const b = mk(); b.task('cztery szybkie narzędzia', { tools: 4, ago: 0.2 }).end();
  assert.equal(b.opened.length, 0, 'łańcuch w ułamku sekundy nie dostaje filmu'); assert.equal(b.cards.length, 0);
  const c = mk(); c.task('Telegram: sprawdź system', { tools: 3, kind: 'server', ago: 4, reply: 'ok' });
  assert.equal(c.opened.length, 1); assert.equal(c.opened[0].o.scen, 'telegram'); assert.equal(c.opened[0].src.name, 'Zadanie od Hermesa'); assert.equal(c.opened[0].src.inputs.zadanie, 'sprawdź system');
  const d = mk({ filmScen: { chat: 'off' } }); d.task('dużo roboty', { tools: 6 }).end();
  assert.equal(d.opened.length, 0); assert.equal(d.cards.length, 0, 'tryb wyłączony — żadnej propozycji');
  const e = mk({ filmOn: false }); e.task('dużo roboty', { tools: 6 }).end();
  assert.equal(e.opened.length + e.cards.length, 0, 'wyłącznik modułu');
  const f = mk(); const w = f.J.proc.start('Workflow: Od pomysłu do projektu'); for (let i = 0; i < 5; i++) f.J.proc.step('tool', 'get_weather', [], { running: true }).done();
  assert.equal(f.S.recs.size, 0); assert.equal(f.opened.length, 0, 'workflow ma własny film'); f.J.proc.end('ok', '');
});

test('tryb „zaproponuj”: karta w czacie na żywo, po zadaniu karta z filmem z zapisu', () => {
  const { task, opened, cards } = mk({ filmScen: { chat: 'ask' } });
  const k = task('zrób mi porządek', { tools: 4, reply: 'Zrobione.' });
  assert.equal(opened.length, 0, 'bez zgody film się nie włącza'); assert.equal(cards.length, 1); assert.match(cards[0].text, /Oglądać „zrób mi porządek” na żywo/);
  cards[0].cb('no'); assert.equal(opened.length, 0);
  k.end();
  assert.equal(cards.length, 2); assert.match(cards[1].text, /Film z zadania „zrób mi porządek” jest gotowy/); assert.equal(cards[0].removed, true, 'stara karta znika');
  cards[1].cb('go');
  assert.equal(opened.length, 1); const o = opened[0];
  assert.ok(o.evs && o.evs[0].type === 'run.started' && o.evs.at(-1).type === 'run.completed', 'powtórka = zdarzenia od startu do końca');
  assert.equal(o.o.scen, 'chat'); assert.ok(!o.o.dyn); assert.equal(typeof o.o.again, 'function');
  assert.deepEqual(o.src.steps.map(s => s.title), ['Pogoda (×4)'.replace('Pogoda', o.src.steps[0].title.replace(/ \(×4\)$/, '')), 'Odpowiedź'], 'cztery takie same narzędzia = jedna scena ×4, potem odpowiedź');
  cards[0].cb('go'); assert.equal(opened.length, 1, 'zdjęta karta nie otwiera drugi raz');
  const again = o.o.again(); assert.equal(again, true); assert.equal(opened.length, 2, '„Jeszcze raz” puszcza powtórkę ponownie');
});

test('tryb „sam” ustępuje: zgoda do udzielenia, pisanie w czacie, tryb prezentacji i cisza nocna zamieniają film w propozycję', () => {
  const a = mk(); a.J.ev.emit('approval.requested', { question: 'Usunąć?' }); a.task('jedno', { tools: 4 });
  assert.equal(a.opened.length, 0); assert.equal(a.cards.length, 1, 'zgoda czeka — film nie zasłania okna');
  const b = mk(); b.J.ev.emit('approval.requested', {}); b.J.ev.emit('approval.resolved', {}); b.task('dwa', { tools: 4 }); assert.equal(b.opened.length, 1, 'po odpowiedzi znów wolno');
  const c = mk(); c.J.document = null; const doc = c.J.__ctx.document; doc.activeElement = { tagName: 'TEXTAREA', value: 'piszę właśnie…' }; c.task('trzy', { tools: 4 });
  assert.equal(c.opened.length, 0); assert.equal(c.cards.length, 1, 'ktoś pisze — tylko propozycja');
  const d = mk(); d.J.state.ui.mode = 'present'; d.task('cztery', { tools: 4 }); assert.equal(d.opened.length, 0); assert.equal(d.cards.length, 1, 'prezentacja ekranu');
  const now = new Date(), hh = n => String(n).padStart(2, '0'), from = hh(now.getHours()) + ':00', to = hh((now.getHours() + 1) % 24) + ':00';
  const e = mk({ quietFrom: from, quietTo: to }); e.task('pięć', { tools: 4 }); assert.equal(e.opened.length, 0); assert.equal(e.cards.length, 1, 'cisza nocna');
  const f = mk(); f.J.workflows.cinema.openSource({ id: 'x' }, null, {}); assert.equal(f.S.canAuto(), true, 'atrapa nie zajmuje filmu');
});

test('powtórka z zapisu: zadanie z historii → film z kolejnych scen (błąd narzędzia łagodny), błędy odpowiedzi i workflow', () => {
  const { task, opened, J, S } = mk({ filmScen: { chat: 'off' } });
  const k = task('sprawdź i napisz', { tools: 3, fail: 1, reply: 'Dwa na trzy się udały.' }); k.end();
  const saved = J.state.history[0]; assert.ok(saved && saved.steps.length >= 4);
  assert.equal(S.replaySaved(saved), true); const o = opened.at(-1), types = o.evs.map(e => e.type);
  assert.equal(o.evs[0].type, 'run.started'); assert.equal(types.at(-1), 'run.completed'); assert.ok(types.includes('step.failed'));
  assert.equal(o.evs.find(e => e.type === 'step.failed').soft, true, 'w powtórce też łagodnie');
  assert.equal(o.src.name, 'Zadanie z pulpitu'); assert.equal(o.src.inputs.zadanie, 'sprawdź i napisz');
  const reply = o.src.steps.at(-1); assert.equal(reply.kind, 'answer'); assert.equal(reply.artifact.fields.Treść, 'Dwa na trzy się udały.');
  const bad = task('padło', { tools: 1, reply: 'Nie wyszło.', end: 'err' }); bad.end(); S.replaySaved(J.state.history[0]);
  assert.equal(opened.at(-1).evs.at(-1).type, 'run.failed'); assert.equal(opened.at(-1).src.state, 'failed');
  const stop = task('przerwane', { tools: 1, reply: null, end: 'abort' }); stop.end(); S.replaySaved(J.state.history[0]);
  assert.equal(opened.at(-1).evs.at(-1).type, 'run.stopped');
  assert.equal(S.replaySaved({ id: 'w', title: 'Workflow: x', status: 'ok', ts: 1, dur: 1, steps: [] }), false, 'przebieg workflow nie jest zadaniem do powtórki');
  assert.equal(S.replaySaved({ id: 'p', title: 'puste', status: 'ok', ts: 1, dur: 1, steps: [{ kind: 'input', title: 'Polecenie', status: 'ok' }] }), false, 'zadanie bez narzędzi i odpowiedzi nie ma scen');
});

test('polecenie „pokaż film z zadania”: rozpoznawanie, ostatnie zadanie z historii, brak historii, workflow', async () => {
  const { J, opened, task } = mk({ filmScen: { chat: 'off' } }), R = J.registry, m = t => R.match(t)[0];
  for (const t of ['pokaż film z zadania', 'film z ostatniego zadania', 'odtwórz film z polecenia']) assert.equal(m(t)?.id, 'task_film', t);
  assert.equal(m('pokaż film')?.id, 'workflow_film', '„pokaż film” dalej pokazuje workflow'); assert.equal(m('film dnia')?.id, 'day_film');
  assert.equal(J.policy.level('task_film'), 'A3');
  J.state.history.length = 0;
  assert.equal((await R.run('task_film', {})).code, 'NOT_FOUND', 'pusta historia');
  task('coś robię', { tools: 2, reply: 'ok' }).end();
  const r = await R.run('task_film', {}); assert.ok(r.ok, r.text); assert.match(r.text, /Film z zadania „coś robię”/); assert.equal(opened.length, 1);
  assert.equal((await R.run('task_film', { id: 'nie-ma' })).code, 'NOT_FOUND');
  J.state.history.unshift({ id: 'wf', title: 'Workflow: Od pomysłu', status: 'ok', ts: 1, dur: 1, steps: [] });
  assert.equal((await R.run('task_film', { id: 'wf' })).code, 'INVALID_ARGS');
});

test('rejestr: nowy scenariusz dostaje tryb, wiersz w ustawieniach i klasyfikację bez zmian w silniku', () => {
  const { C, S, task, opened } = mk();
  C.registerScenario({ id: 'jev', label: 'Agent WWW Jeva', name: 'Zadanie Jeva', fallback: 'auto', order: 12, th: { steps: 2, ms: 4000 }, hint: 'Przeglądarka sterowana przez Jeva.', match: t => /^Jev:\s/.test(t) });
  assert.equal(C.mode('jev'), 'auto'); assert.ok(C.scenarios().some(d => d.id === 'jev')); assert.equal(S.classify('Jev: znajdź cenę').id, 'jev'); assert.equal(S.classify('Telegram: x').id, 'telegram');
  assert.match(C.describe(C.scenarios().find(d => d.id === 'jev')), /Film od 2 narzędzi albo 4 s/);
  C.setMode('jev', 'off'); assert.equal(C.mode('jev'), 'off');
  task('Jev: znajdź cenę', { tools: 3, kind: 'server' }).end(); assert.equal(opened.length, 0, 'wyłączony nowy scenariusz milczy');
});
