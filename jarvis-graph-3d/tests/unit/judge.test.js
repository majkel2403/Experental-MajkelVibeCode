'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../harness.js');

/* zamockowany OpenRouter /systemone: odpowiada według treści wypowiedzi */
const calls = [];
const fakeFetch = async (url, init) => {
  const body = JSON.parse(init.body); calls.push({ url, body, auth: init.headers.Authorization });
  if (init.headers.Authorization !== 'Bearer sk-or-test') return { ok: false, status: 401, json: async () => ({ error: { message: 'bad key' } }) };
  const u = body.state.utterance || '';
  const answers = {};
  for (const [id, q] of Object.entries(body.questions)) {
    if (q.type === 'choice') {
      const opts = Object.keys(q.criteria);
      let choice = opts.includes('open_app') && /notatnik/.test(u) ? 'open_app' : opts.includes('conversation') && /teori/.test(u) ? 'conversation' : opts.includes('notes_delete') && /usu/.test(u) ? 'notes_delete' : opts[0];
      const conf = /pewnie/.test(u) ? .95 : /moze/.test(u) ? .6 : /slabo/.test(u) ? .3 : .9;
      answers[id] = { type: 'choice', choice, confidence: conf, probabilities: Object.fromEntries(opts.map(o => [o, o === choice ? conf : (1 - conf) / (opts.length - 1)])) };
    } else if (q.type === 'noul') answers[id] = { type: 'noul', noul: id === 'destructive' ? (/usu/.test(u) ? .92 : .05) : id === 'grounded' ? (/klam/.test(body.state.reply || '') ? .1 : .9) : .1 };
    else answers[id] = { type: 'score', score: /alarm/.test(body.state.signal || '') ? 3 : 1, probabilities: {}, confidence: .8 };
  }
  return { ok: true, status: 200, json: async () => ({ model: 'jev-1.13.0', answers, usage: { input_tokens: 400, output_tokens: 20, cost: 0.00002 } }) };
};
const J = load({ fetch: fakeFetch, state: { settings: { hermesOn: false, jevOn: true, jevKey: 'sk-or-test', jevPrivacy: 'P2' } } });

test('judge: domyślnie poziom P1 — bez tytułów notatek, widgetów i profilu; pick i verify wymagają P2', async () => {
  const P = load({ fetch: fakeFetch, state: { settings: { hermesOn: false, jevOn: true, jevKey: 'sk-or-test' } } });
  assert.equal(P.judge.tier(), 'P1');
  calls.length = 0; P.notes.add('Tajna notatka', 'x');
  await P.judge.decide('otwórz notatnik');
  const st = calls[0].body.state;
  assert.equal(st.notes, undefined); assert.equal(st.widgets, undefined); assert.equal(st.user_profile, undefined);
  assert.ok(!JSON.stringify(calls[0].body).includes('Tajna notatka'), 'tytuł notatki nie wychodzi do zewnętrznego serwisu');
  assert.equal(await P.judge.pick('q', [{ id: 'a', label: 'Tajna notatka' }, { id: 'b', label: 'Inna' }], 'x'), null, 'pick wysyła tytuły — tylko P2');
  assert.equal(await P.judge.verify('Zrobione.', [{ name: 'x', ok: true }]), null, 'verify wysyła treść odpowiedzi — tylko P2');
  assert.ok(!calls.some(c => JSON.stringify(c.body).includes('Tajna notatka')));
});
test('judge: poziom P0 wysyła tylko zdanie (bez stanu pulpitu)', async () => {
  const P = load({ fetch: fakeFetch, state: { settings: { hermesOn: false, jevOn: true, jevKey: 'sk-or-test', jevPrivacy: 'P0' } } });
  calls.length = 0; await P.judge.decide('otwórz notatnik');
  assert.deepEqual(Object.keys(calls[0].body.state), ['utterance']);
  assert.equal(calls[0].body.questions.clarify, undefined, 'pytania o stan pulpitu są pomijane na P0');
  assert.ok(calls[0].body.questions.intent && calls[0].body.questions.destructive);
});
test('judge: wyłączony bez klucza → null', async () => {
  const J2 = load({ fetch: fakeFetch, state: { settings: { hermesOn: false, jevOn: true, jevKey: '' } } });
  assert.equal(J2.judge.enabled(), false); assert.equal(await J2.judge.decide('otwórz notatnik'), null);
});
test('judge.decide: fan-out, trasa execute / ask / hermes, stan bez treści notatek', async () => {
  calls.length = 0;
  const v = await J.judge.decide('otwórz notatnik pewnie');
  assert.equal(v.intent.id, 'open_app'); assert.equal(v.route, 'execute'); assert.ok(v.intent.confidence >= .85);
  assert.equal(Object.keys(calls[0].body.questions).sort().join(','), 'clarify,current,destructive,intent');
  assert.equal(calls[0].body.model, 'typesafe/jev-1.13'); assert.equal(calls[0].body.state.utterance, 'otwórz notatnik pewnie');
  assert.ok(Array.isArray(calls[0].body.state.notes)); assert.equal(typeof calls[0].body.state.notes[0], 'string');
  assert.ok(Object.keys(calls[0].body.questions.intent.criteria).length >= 55);
  assert.equal((await J.judge.decide('otwórz notatnik moze')).route, 'ask');
  assert.equal((await J.judge.decide('otwórz notatnik slabo')).route, 'hermes');
  assert.equal((await J.judge.decide('opowiedz o teorii')).route, 'hermes');
  assert.equal(J.judge.status.state, 'up'); assert.ok(J.judge.status.calls >= 4); assert.ok(J.state.stats.jevCost > 0);
});
test('judge: ryzyko destrukcyjne wymusza potwierdzenie dla narzędzia „safe” ze źródła hermes', async () => {
  const v = await J.judge.decide('usuń wszystko z notatki'); assert.ok(v.destructive >= .8);
  let asked = 0; J.confirm = async () => { asked++; return 'no'; };
  const r = await J.registry.run('create_note', { title: 'X', content: 'y', show: false }, { source: 'hermes', judge: v });
  assert.equal(r.code, 'DENIED'); assert.equal(asked, 1);
  const r2 = await J.registry.run('create_note', { title: 'X', content: 'y', show: false }, { source: 'hermes', judge: { destructive: .1 } });
  assert.equal(r2.ok, true); assert.equal(asked, 1);
});
test('judge.pick rozstrzyga dwuznaczność notatek', async () => {
  J.notes.add('Zakupy', 'a'); J.notes.add('Zakupy weekend', 'b');
  J.brain.currentText = 'dopisz do notatki zakupy chleb';
  const r = await J.registry.run('notes_append', { note: 'zaku', text: 'chleb' }, { source: 'ui' });
  assert.equal(r.ok, true, JSON.stringify(r));   // mock wybiera pierwszego kandydata z pewnością .9 ≥ .85
});
test('judge.verify i urgency', async () => {
  assert.ok((await J.judge.verify('Zrobione.', [{ name: 'x', ok: true }])) >= .8);
  assert.ok((await J.judge.verify('klamie', [{ name: 'x', ok: false }])) < .4);
  assert.equal(await J.judge.verify('x', []), null);
  assert.equal(await J.judge.urgency({ text: 'alarm', type: 'timer.ended' }), 1);
  assert.ok((await J.judge.urgency({ text: 'cisza', type: 'x' })) < .5);
});
test('judge: błąd klucza → null i status down, bez wyjątku', async () => {
  J.state.settings.jevKey = 'zly';
  assert.equal(await J.judge.decide('otwórz notatnik'), null); assert.equal(J.judge.status.state, 'down'); assert.match(J.judge.status.lastError, /401/);
  await assert.rejects(() => J.judge.test(), /HTTP 401/);
  J.state.settings.jevKey = 'sk-or-test';
});
test('judge.test zwraca opis z latencją', async () => { assert.match(await J.judge.test(), /odpowiada \(\d+ ms\): intencja „open_app”/); });
