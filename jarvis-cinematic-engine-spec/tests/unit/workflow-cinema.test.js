/* Tryb kinowy workflow (js/workflow-cinema.js): czysta logika filmu — długość scen, zdarzenia odtworzone ze stanu przebiegu,
   napisy końcowe i lektor — oraz polecenie „tryb kinowy”. Obraz i dźwięk sprawdza e2e (tests/e2e/smoke.js) i zrzuty na żywo. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../harness.js');

const J = load({ dom: true, state: { settings: { sound: false, speech: false } } });
const T = J.workflows.cinema._t;
const arr = x => JSON.parse(JSON.stringify(x));   // tablice z innego kontekstu vm

const STEPS = [
  { id: 'brief', title: 'Brief projektu', kind: 'hermes', state: 'done', attempts: 2, ms: 41000, score: 0.9, errors: ['brak sekcji „ryzyka”'], artifact: { kind: 'fields', fields: { nazwa: 'Habit Tracker', cel: 'nawyki' } } },
  { id: 'architektura', title: 'Architektura', kind: 'hermes', state: 'done', attempts: 1, ms: 52000, artifact: { kind: 'doc', headings: ['Komponenty', 'Dane'], chars: 4200 } },
  { id: 'zapis', title: 'Zapis plików', kind: 'write_files', state: 'done', attempts: 1, ms: 900, artifact: { kind: 'files_written', count: 3, root: 'projects/habit-tracker', commit: 'abc1234', files: ['README.md', 'docs/ARCHITEKTURA.md', 'src/app.js'] } },
  { id: 'pokaz', title: 'Notatka na pulpicie', kind: 'tool', state: 'skipped', attempts: 1, ms: 5 }
];
const RUN = { id: 'r1', workflow: 'od-pomyslu-do-projektu', name: 'Od pomysłu do projektu', state: 'done', started: 1759600000, ended: 1759600100, report: 'Projekt gotowy. Trzy pliki.', inputs: { pomysl: 'aplikacja do nawyków' }, budget_used: { tokens: 120000 }, steps: STEPS };

test('kod czasowy, numeracja aktów, konstelacja kroków', () => {
  assert.equal(T.timecode(0), '00:00:00:00');
  assert.equal(T.timecode(3725.5), '01:02:05:12', '24 klatki na sekundę');
  assert.equal(T.roman(4), 'IV'); assert.equal(T.roman(25), '25');
  const L = arr(T.layout(6));
  assert.equal(L.length, 6);
  assert.ok(L[0].x < L[5].x, 'kroki od lewej do prawej');
  assert.ok(L.every(p => p.z > 900 && p.z < 1900), 'wszystkie w głębi przed kamerą');
});

test('zdarzenia odtworzone ze stanu: start, próby z poprawką, wyniki, pominięcie, finał', () => {
  const ev = arr(T.synth(RUN)), types = ev.map(e => e.type);
  assert.deepEqual(types, ['run.started', 'step.started', 'step.retry', 'step.started', 'step.completed', 'step.started', 'step.completed', 'step.started', 'step.completed', 'step.started', 'step.skipped', 'run.completed']);
  assert.equal(ev[2].reason, 'brak sekcji „ryzyka”', 'powód poprawki z błędów kroku');
  assert.equal(ev[3].attempt, 2);
  assert.equal(ev[4].artifact.fields.nazwa, 'Habit Tracker', 'wynik kroku do hologramu');
  assert.ok(ev.every((e, i) => !i || e.ts >= ev[i - 1].ts), 'czas rośnie');
  const running = arr(T.synth({ ...RUN, state: 'running', steps: [STEPS[0], { ...STEPS[1], state: 'running', artifact: null }, { ...STEPS[2], state: 'pending' }] })).map(e => e.type);
  assert.deepEqual(running.slice(-2), ['step.completed', 'step.started'], 'trwający krok bez końca, brak finału');
});

test('film z zapisu trwa ~1–2 min: minuta pracy Hermesa to kilka sekund ekranu', () => {
  assert.equal(T.holdMs(0), 1300); assert.equal(T.holdMs(60), 2700); assert.equal(T.holdMs(600), 3400);
  const six = { ...RUN, steps: [0, 1, 2, 3, 4, 5].map(i => ({ id: 's' + i, title: 'Krok ' + i, kind: i === 5 ? 'tool' : 'hermes', state: 'done', attempts: 1, ms: 45000, artifact: i === 5 ? null : { kind: 'doc', headings: ['A'] } })) };
  const len = T.filmLength(arr(T.synth(six)));
  assert.ok(len > 50 && len < 115, 'długość filmu bez napisów: ' + len + ' s');
  assert.ok(T.pace({ type: 'step.completed', kind: 'hermes', artifact: { kind: 'doc' } }) > T.pace({ type: 'step.completed', kind: 'tool', artifact: { kind: 'fields' } }), 'hologram tylko dla wyników treści');
});

test('napisy końcowe: tytuł projektu, pomysł, obsada, sceny z czasami, pliki, statystyki', () => {
  const c = arr(T.credits(RUN, { live: true })), txt = JSON.stringify(c);
  assert.equal(c[0].big, 'Habit Tracker', 'nazwa projektu z briefu');
  assert.match(txt, /„aplikacja do nawyków”/);
  assert.match(txt, /01 · Brief projektu — 41 s · ocena 0.9 · 2 próby/);
  assert.match(txt, /04 · Notatka na pulpicie — pominięta/);
  assert.match(txt, /src\/app\.js/); assert.match(txt, /projects\/habit-tracker · git abc1234/); assert.match(txt, /Reżyseria i lektor/);
  assert.match(txt, /Ponowienia: 1/); assert.match(txt, /Tokeny: 120 tys\./); assert.match(txt, /Nakręcono na żywo/);
  assert.ok(!/Jev/.test(txt), 'bez kroków sprawdzenia — bez Jeva w obsadzie');
});

test('lektor: zdanie o wyniku kroku i stan węzła', () => {
  assert.match(T.doneLine(STEPS[0]), /^Mam to: Brief projektu \(41 s, ocena 0.9\)\. Powstał brief: „Habit Tracker”\.$/);
  assert.equal(T.doneSay(STEPS[0]), 'Powstał brief: „Habit Tracker”.', 'lektor mówi krótko');
  assert.equal(T.startLine({ kind: 'hermes', title: 'Architektura' }), 'Zlecam Hermesowi: Architektura.', 'Jarvis w pierwszej osobie');
  assert.match(T.doneLine(STEPS[1]), /2 sekcje, 4200 znaków/);
  assert.match(T.doneLine(STEPS[2]), /3 pliki zapisane na dysku/);
  assert.equal(T.stateLine({ state: 'running', kind: 'hermes', attempts: 2 }), 'Hermes myśli · próba 2…');
  assert.equal(T.firstSentence('Projekt gotowy w folderze X. Reszta raportu.'), 'Projekt gotowy w folderze X.');
  assert.equal(T.ideaOf(RUN), 'aplikacja do nawyków'); assert.equal(T.projectName(RUN), 'Habit Tracker');
});

test('polecenie filmu: zdania (bez zabierania „tryb kinowy” poziomowi efektów), zgoda, brak przebiegów', async () => {
  const R = J.registry, m = t => R.match(t)[0];
  for (const t of ['pokaż film', 'pokaż film z workflow', 'odtwórz film z pracy', 'workflow jak film', 'tryb kinowy workflow', 'kino z pracy']) assert.equal(m(t)?.id, 'workflow_film', t);
  assert.equal(m('tryb kinowy')?.id, 'fx_level', '„tryb kinowy” dalej ustawia poziom efektów');
  assert.equal(J.policy.level('workflow_film'), 'A3', 'sam pokaz — bez pytania');
  const r = await R.run('workflow_film', {});
  assert.equal(r.ok, false); assert.equal(r.code, 'NOT_FOUND', 'nic nie działało — nie ma czego pokazać');
});

test('krótkie ścieżki w napisach i montaż krótkich scen', () => {
  const W = String.fromCharCode(92);
  const raw = 'Projekt gotowy: C:' + W + 'Users' + W + 'majke' + W + 'JarvisWorkspace' + W + 'projects' + W + 'dziennik-nastroju (34 pliki, commit fdfdf2c).';
  assert.equal(T.prettyPath(raw), 'Projekt gotowy: JarvisWorkspace › projects › dziennik-nastroju (34 pliki, commit fdfdf2c).');
  assert.equal(T.prettyPath('bez ścieżki'), 'bez ścieżki');
  assert.equal(T.isQuick({ kind: 'tool' }), true); assert.equal(T.isQuick({ kind: 'check' }), true);
  assert.equal(T.isQuick({ kind: 'hermes' }, 60000), false); assert.equal(T.isQuick({ kind: 'hermes' }, 900), true, 'bardzo krótki krok Hermesa');
  assert.equal(T.isQuick({ kind: 'write_files' }, 1800), false, 'zapis projektu zawsze z planszą aktu');
  assert.equal(T.isQuick({ kind: 'telegram' }, null, true), true); assert.equal(T.isQuick({ kind: 'workflow' }, null, true), false, 'w filmie dnia workflow dostaje akt');
  const m = arr(T.quickMap(arr(T.synth(RUN))));
  assert.deepEqual(m, { brief: false, architektura: false, zapis: false, pokaz: true });
});

test('rozdziały filmu: otwarcie, pierwsza scena każdego kroku (bez powtórzeń przy poprawce), finał', () => {
  const ev = arr(T.synth(RUN)), ch = arr(T.chapterList(ev, STEPS));
  assert.deepEqual(ch.map(c => c.label), ['▶', 'I', 'II', 'III', 'IV', 'F']);
  assert.equal(ev[ch[1].i].type, 'step.started'); assert.equal(ev[ch[1].i].attempt, 1, 'rozdział zaczyna się od pierwszej próby');
  assert.equal(ev[ch[5].i].type, 'run.completed');
});

test('Film dnia: sceny z workflow, dziennika Hermesa, Process Logu i notatek — bez podwójnych zadań', () => {
  const day0 = new Date(2026, 9, 4); day0.setHours(0, 0, 0, 0);
  const since = day0.getTime() / 1000, at = (hh, mm) => since + hh * 3600 + mm * 60;
  const runs = [{ ...RUN, started: at(19, 5), steps: STEPS }, { ...RUN, id: 'wczoraj', started: since - 3600, steps: STEPS }];
  const tasks = [{ id: 't1', platform: 'telegram', title: 'Sprawdź pogodę', started: at(8, 10), ended: at(8, 11), status: 'done', result: 'Słonecznie', tools: 2 },
    { id: 't2', platform: 'cron', title: 'Raport rynku', started: at(9, 0), ended: at(9, 2), status: 'failed', result: 'timeout', tools: 1 },
    { id: 't3', platform: 'cron', title: 'Raport rynku', started: at(9, 30), ended: at(9, 31), status: 'done', result: 'ok', tools: 1 },
    { id: 't4', platform: 'api_server', title: '[System note: The previous turn was interrupted by a gateway shutdown;', started: at(9, 40), status: 'done', result: '' }];   // wewnętrzne — bez sceny
  const history = [{ ts: at(8, 10) * 1000, title: 'Telegram: Sprawdź pogodę', status: 'ok', dur: 60000 }, { ts: at(19, 5) * 1000, title: 'Workflow: Od pomysłu do projektu', status: 'ok', dur: 300000 },
    { ts: at(10, 0) * 1000, title: 'Ustaw minutnik 5 min', status: 'ok', dur: 300 }, { ts: at(10, 5) * 1000, title: 'Pogoda', status: 'ok', dur: 900 }, { ts: at(10, 6) * 1000, title: 'Otwórz notatnik', status: 'ok', dur: 200 },
    { ts: at(12, 0) * 1000, title: 'Przygotuj plan tygodnia', status: 'err', dur: 45000, result: 'brak kalendarza' }];
  const notes = [{ title: 'Zakupy', created: at(11, 0) * 1000 }, { title: 'Pomysły', created: at(11, 30) * 1000 }, { title: 'Stara', created: (since - 100) * 1000 }];
  const steps = arr(T.dayScenes({ runs, tasks, history, notes }, since, since + 86400));
  assert.deepEqual(steps.map(s => s.kind), ['telegram', 'cron', 'task', 'notes', 'task', 'workflow'], JSON.stringify(steps.map(s => s.title)));
  assert.match(steps[0].title, /^08:10 · Sprawdź pogodę$/); assert.equal(steps[0].artifact.fields.Skąd, 'Telegram');
  assert.equal(steps[1].state, 'failed'); assert.match(steps[1].title, /Raport rynku \(×2\)$/, 'powtarzane zadanie z harmonogramu = jedna scena');
  assert.equal(steps[1].artifact.fields.Razy, '2 (1 z błędem)');
  assert.match(steps[2].title, /Drobne polecenia \(3\)/, 'krótkie polecenia złączone w jedną scenę');
  assert.match(steps[3].title, /Notatki \(2\)/); assert.equal(steps[4].state, 'failed');
  assert.match(steps[5].title, /Od pomysłu do projektu: Habit Tracker/); assert.equal(steps[5].artifact.kind, 'files_written');
  assert.equal(T.dayStats(steps), '6 scen · 1 workflow · 2 od Hermesa · 2 błędy');
  const src = T.daySrc(steps, day0), ev = arr(T.synth(src));
  assert.equal(ev[0].type, 'run.started'); assert.equal(ev[ev.length - 1].type, 'run.completed');
  const len = T.filmLength(ev, { day: true }); assert.ok(len > 30 && len < 90, 'film dnia: ' + len + ' s');
  const c = JSON.stringify(arr(T.credits({ ...src, steps }, { day: true })));
  assert.match(c, /Dzień z Jarvisem/); assert.match(c, /Skąd przyszły zadania/); assert.match(c, /zadanie z Telegrama: 1/);
});

test('polecenie „film dnia”: zdania i brak danych', async () => {
  const R = J.registry, m = t => R.match(t)[0];
  for (const t of ['film dnia', 'pokaż film dnia', 'podsumuj dzień jako film', 'film z dzisiaj']) assert.equal(m(t)?.id, 'day_film', t);
  assert.equal(m('pokaż film')?.id, 'workflow_film', '„pokaż film” dalej pokazuje workflow');
  assert.equal(J.policy.level('day_film'), 'A3');
  const r = await R.run('day_film', { date: '04-10-2026' }); assert.equal(r.code, 'INVALID_ARGS');
});
