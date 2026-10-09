/* Workflow w karcie (js/workflows.js, ADR 0007): polecenia rejestru, zdarzenia z mostu → karta w czacie, Process Log, Orb,
   pierwszeństwo zadania z czatu, pytania przebiegu → odpowiedź do mostu. Silnik (bridge/workflow_engine.py) ma testy w Pythonie. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../harness.js');

const DEF = { id: 'od-pomyslu-do-projektu', name: 'Od pomysłu do projektu', autonomy: 'L3', inputs: { pomysl: { type: 'string', required: true, description: 'pomysł' } }, steps: ['Brief projektu', 'Architektura'] };
const STEPS = [{ id: 'brief', title: 'Brief projektu', kind: 'hermes' }, { id: 'architektura', title: 'Architektura', kind: 'hermes' }];
const mk = (extra = {}) => {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    const j = /\/workflows$/.test(url) ? { workflows: [DEF] } : /\/workflows\/run$/.test(url) ? { id: 'r1', name: DEF.name, autonomy: 'L3', steps: STEPS } : /\/answer$/.test(url) ? { ok: true } : /\/workflows\/runs$/.test(url) ? { runs: [] } : {};
    return { ok: true, status: 200, json: async () => j };
  };
  const J = load({ dom: true, fetch, state: { settings: { bridgeOn: false, bridgeToken: 't', bridgeUrl: 'http://b', hermesOn: false, sound: false, speech: false, ...extra } } });
  const said = []; const add = J.chat.add; J.chat.add = (role, text, silent) => { const hd = add(role, text, silent); const rec = { role, text }; said.push(rec); const set = hd.set; hd.set = t => { rec.text = t; return set(t); }; return hd; };
  const ev = (type, x = {}) => J.workflows.onEvent({ v: 1, type, run_id: 'r1', workflow: DEF.id, name: DEF.name, ts: Date.now() / 1000, state: 'running', total: 2, ...x });
  return { J, calls, said, ev };
};

test('zdania → polecenia workflow; poziomy autonomii', () => {
  const { J } = mk(), R = J.registry, m = t => R.match(t)[0];
  assert.equal(JSON.stringify(m('Zrób projekt z pomysłu aplikacja do nawyków i treningów').args), JSON.stringify({ workflow: 'od-pomyslu-do-projektu', inputs: { pomysl: 'aplikacja do nawyków i treningów' } }));
  assert.equal(m('od pomysłu do projektu: bot do przypomnień').args.inputs.pomysl, 'bot do przypomnień');
  assert.equal(m('stop wszystko').id, 'workflow_stop'); assert.equal(m('stop').id, 'plan_control', 'samo „stop” bez zmian');
  assert.equal(m('status workflow').id, 'workflow_status');
  for (const id of ['workflow_list', 'workflow_status', 'workflow_stop']) assert.equal(J.policy.level(id), 'A3', id);
  assert.equal(J.policy.level('workflow_run'), 'A1', 'uruchomienie: Jev bez parsera pyta');
});

test('przebieg na żywo: karta w czacie, Process Log, plan i Orb; raport na końcu', async () => {
  const { J, said, ev } = mk();
  ev('run.started', { steps: STEPS, autonomy: 'L3' });
  const card = said.find(x => x.role === 'jarvis' && /Workflow: Od pomysłu/.test(x.text));
  assert.ok(card, 'karta przebiegu w czacie');
  assert.match(J.proc.current.title, /^Workflow: Od pomysłu do projektu/);
  assert.equal(J.engine.taskId, 'r1', 'Orb śledzi przebieg');
  ev('step.started', { step_id: 'brief', n: 1, kind: 'hermes', title: 'Brief projektu', attempt: 1 });
  assert.match(card.text, /⟳ Brief projektu/);
  ev('step.retry', { step_id: 'brief', n: 1, kind: 'hermes', title: 'Brief projektu', attempt: 1, reason: 'ocena 0.40 < 0.7' });
  ev('step.started', { step_id: 'brief', n: 1, kind: 'hermes', title: 'Brief projektu', attempt: 2 });
  assert.match(card.text, /Brief projektu \(próba 2\)/);
  ev('step.completed', { step_id: 'brief', n: 1, kind: 'hermes', title: 'Brief projektu', attempt: 2, ms: 12000, preview: '{"nazwa":"Nawyki"}', score: 0.9 });
  assert.match(card.text, /✓ Brief projektu · 12 s · 2 próby/);
  const r = J.workflows.runs.get('r1'); assert.equal(r.steps[0].score, 0.9); assert.equal(r.steps[0].errors[0], 'ocena 0.40 < 0.7');
  ev('step.completed', { step_id: 'architektura', n: 2, kind: 'hermes', title: 'Architektura', ms: 30000 });
  ev('run.completed', { state: 'done', report: 'Projekt „Nawyki” gotowy: C:\\projects\\nawyki (6 plików).' });
  assert.match(card.text, /zakończony[\s\S]*Projekt „Nawyki” gotowy/);
  assert.equal(J.proc.active, false, 'zadanie w Process Logu zamknięte');
  assert.equal(J.state.history[0].status, 'ok'); assert.ok(J.state.history[0].steps.some(s => s.kind === 'reply'));
});

test('trwa zadanie z czatu karty → workflow nie przejmuje Process Logu (karta w czacie zostaje)', () => {
  const { J, said, ev } = mk();
  J.proc.start('lokalne polecenie');
  ev('run.started', { steps: STEPS });
  ev('step.started', { step_id: 'brief', n: 1, kind: 'hermes', title: 'Brief projektu', attempt: 1 });
  assert.equal(J.proc.current.title, 'lokalne polecenie');
  assert.equal(J.proc.current.steps.filter(s => s.kind === 'server').length, 0);
  assert.ok(said.some(x => /Workflow: Od pomysłu/.test(x.text)));
  J.proc.end('ok', 'zrobione');   // polecenie z czatu (np. to, które uruchomiło przebieg) się skończyło
  ev('step.completed', { step_id: 'brief', n: 1, kind: 'hermes', title: 'Brief projektu', ms: 1000 });
  ev('step.started', { step_id: 'architektura', n: 2, kind: 'hermes', title: 'Architektura', attempt: 1 });
  assert.match(J.proc.current.title, /^Workflow: Od pomysłu/, 'wolny Process Log przejęty przy następnym kroku');
  assert.equal(J.engine.taskId, 'r1');
});

test('migawka po podłączeniu karty i pytanie przebiegu → odpowiedź do mostu', async () => {
  const { J, calls, ev } = mk();
  J.workflows.onEvent({ v: 1, type: 'run.snapshot', run_id: 'r2', ts: 1, snapshot: { id: 'r2', workflow: DEF.id, name: DEF.name, state: 'running', started: 1, steps: STEPS.map(s => ({ ...s, state: 'pending', attempts: 0 })) } });
  assert.equal(J.workflows.runs.get('r2').steps.length, 2);
  J.ask = async (q, opts) => { assert.match(q, /Wykonać krok „Zapis projektu”/); assert.deepEqual(opts.map(o => o.value), ['Tak', 'Nie']); return 'Tak'; };
  ev('ask.waiting', { run_id: 'r2', step_id: 'zapis', n: 3, question: 'Wykonać krok „Zapis projektu”?', options: ['Tak', 'Nie'] });
  await new Promise(r => setTimeout(r, 20));
  const post = calls.find(c => /\/workflows\/runs\/r2\/answer$/.test(c.url));
  assert.ok(post, 'odpowiedź wysłana do mostu'); assert.equal(post.body.answer, 'Tak');
});

test('workflow_run z karty: start przez most; brak wymaganego wejścia → INVALID_ARGS; stop wszystko', async () => {
  const { J, calls } = mk(), R = J.registry;
  const r = await R.run('workflow_run', { workflow: 'od pomyslu do projektu', inputs: { pomysl: 'aplikacja do nawyków' } }, { source: 'ui' });
  assert.equal(r.ok, true, r.text); assert.match(r.text, /Uruchomiłem „Od pomysłu do projektu”/);
  const start = calls.find(c => /\/workflows\/run$/.test(c.url)); assert.equal(start.body.workflow, 'od-pomyslu-do-projektu');
  const bad = await R.run('workflow_run', { workflow: 'od-pomyslu-do-projektu', inputs: {} }, { source: 'ui' });
  assert.equal(bad.code, 'INVALID_ARGS');
  const none = await R.run('workflow_run', { workflow: 'nie-ma' }, { source: 'ui' });
  assert.equal(none.code, 'NOT_FOUND');
  await R.run('workflow_stop', {}, { source: 'ui' });
  assert.ok(calls.some(c => /\/workflows\/runs\/all\/stop$/.test(c.url) && c.method === 'POST'));
});

test('bezpiecznik: zgubione zdarzenie końca → stan z mostu domyka przebieg (Process Log, karta czatu)', async () => {
  const { J, ev, said } = mk(), WF = J.workflows;
  ev('run.started', { steps: STEPS });
  const r = WF.runs.get('r1'); r.lastEventAt = Date.now() - 120000;
  J.agents.api = async path => /\/workflows\/runs$/.test(path) ? { runs: [{ id: 'r1', workflow: DEF.id, name: DEF.name, state: 'failed', started: 1, ended: 2, reason: 'błąd silnika: test', steps: STEPS.map(s => ({ ...s, state: 'done' })) }] } : {};
  WF.refreshedAt = 0; WF.watchdog();
  await new Promise(res => setTimeout(res, 30));
  assert.equal(r.state, 'failed'); assert.equal(J.proc.active, false, 'Process Log zamknięty');
  assert.ok(said.some(x => /nie powiódł się[\s\S]*błąd silnika: test/.test(x.text)), 'karta w czacie z powodem');
});
