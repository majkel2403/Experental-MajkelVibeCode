/* Test pętli rozmowy z Hermesem (ai.js) na atrapie serwera: strumień SSE, oba formaty narzędzi,
   wynik narzędzia wraca do modelu, historia ma poprawną budowę, awaria sieci → silnik lokalny. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, refShort } = require('../harness.js');

const enc = new TextEncoder();
const sse = parts => new Response(new ReadableStream({ start(c) { parts.forEach(p => c.enqueue(enc.encode(p))); c.close(); } }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
const chunk = d => 'data: ' + JSON.stringify({ choices: [{ delta: d }] }) + '\n\n';
const eq = (a, b, m) => assert.equal(JSON.stringify(a), JSON.stringify(b), m);   // porównanie danych niezależne od „świata” (vm) tablicy
const wait = ms => new Promise(r => setTimeout(r, ms));

/* nowe środowisko z atrapą serwera; responses = lista odpowiedzi na kolejne /chat/completions */
const setup = async (settings, responses) => {
  const requests = []; let n = 0;
  const fetch = async (url, init) => {
    if (/\/models$/.test(url)) return { ok: true, status: 200, json: async () => ({ data: [] }) };
    requests.push(JSON.parse(init.body));
    const r = responses[Math.min(n++, responses.length - 1)];
    if (r instanceof Error) throw r;
    return r();
  };
  const J = load({ dom: true, fetch, state: { settings: { hermesOn: true, hermesProvider: 'custom', hermesUrl: 'http://serwer.test/v1', hermesModel: 'm', sound: false, speech: false, ...settings } } });
  J.__ctx.setTimeout = refShort; J.HERMES_RETRY_MS = 5;   // ponowienie po błędzie sieci bez czekania 2 s
  const seen = []; const add = J.chat.add; J.chat.add = (role, text, silent) => { const h = add(role, text, silent); seen.push({ role, h }); return h; };
  await wait(30);   // ai.js wczytuje historię asynchronicznie
  return { J, requests, seen, jarvisText: () => seen.filter(x => x.role === 'jarvis').map(x => x.h.text).pop() };
};
const toolCallText = (name, args) => '<tool_call>' + JSON.stringify({ name, arguments: args }) + '</tool_call>';

test('pętla (format <tool_call>): narzędzie wykonane, wynik wraca do modelu, historia poprawna', async () => {
  const call = toolCallText('create_note', { title: 'Zakupy', content: 'mleko', show: false });
  const { J, requests, jarvisText } = await setup({ toolFormat: 'hermes' }, [
    () => sse([chunk({ content: 'Robię to. ' + call.slice(0, 40) }), chunk({ content: call.slice(40) })]),   // wywołanie rozcięte na dwie porcje strumienia
    () => sse([chunk({ content: 'Gotowe, dodałem notatkę.' })])
  ]);
  await J.brain.handle('zanotuj zakupy');
  assert.equal(J.state.notes.some(n => n.title === 'Zakupy' && n.body === 'mleko'), true, 'notatka powstała');
  assert.equal(requests.length, 2, 'dwie tury: wywołanie i podsumowanie');
  assert.equal(requests[0].tools, undefined, 'w formacie tekstowym nie wysyłamy pola tools');
  assert.equal(requests[0].messages[0].role, 'system');
  assert.equal(requests[0].messages[0].content, requests[1].messages[0].content, 'prompt systemowy stały między turami');
  const firstUser = requests[0].messages.at(-1).content; assert.match(firstUser, /^<environment>/); assert.match(firstUser, /zanotuj zakupy$/);
  const back = requests[1].messages.filter(m => m.role === 'user').at(-1).content; assert.match(back, /^<tool_response>/); assert.match(back, /"ok":true/); assert.match(back, /"name":"create_note"/);
  eq(J.brain.history.map(m => m.role), ['user', 'assistant', 'user', 'assistant']);
  assert.equal(J.brain.history[0].content, 'zanotuj zakupy', 'w historii zostaje czyste pytanie, bez bloku środowiska');
  assert.match(jarvisText(), /dodałem notatkę/); assert.doesNotMatch(jarvisText(), /tool_call/);
  assert.equal(J.hermes.status, 'up');
});

test('pętla (natywne tool_calls): argumenty składane ze strumienia, poprawna para assistant→tool', async () => {
  const { J, requests, jarvisText } = await setup({ toolFormat: 'openai' }, [
    () => sse([chunk({ tool_calls: [{ index: 0, id: 'call_1', function: { name: 'create_note', arguments: '{"content":"chleb",' } }] }), chunk({ tool_calls: [{ index: 0, function: { arguments: '"show":false}' } }] })]),
    () => sse([chunk({ content: 'Zapisane.' })])
  ]);
  // długa, wcześniejsza rozmowa z narzędziami: przycięcie nie może zacząć się od „osieroconej” odpowiedzi narzędzia
  for (let i = 0; i < 25; i++) J.brain.history.push({ role: 'user', content: 'u' + i }, { role: 'assistant', content: '', tool_calls: [{ id: 'x' + i, type: 'function', function: { name: 'get_datetime', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'x' + i, content: '{}' }, { role: 'assistant', content: 'ok' });
  await J.brain.handle('dopisz chleb');
  assert.equal(J.state.notes.some(n => n.body === 'chleb'), true);
  assert.ok(requests[0].tools.length >= 50 && requests[0].tool_choice === 'auto');
  const first = requests[0].messages[1]; assert.equal(first.role, 'user', 'po prompcie systemowym zaczyna się prawdziwa wypowiedź');
  for (const req of requests) req.messages.forEach((m, i) => { if (m.role === 'tool') { const prev = req.messages.slice(0, i).reverse().find(x => x.role === 'assistant'); assert.ok(prev && (prev.tool_calls || []).some(t => t.id === m.tool_call_id), 'odpowiedź narzędzia ma swoje wywołanie'); } });
  const t2 = requests[1].messages; assert.ok(t2.some(m => m.role === 'tool' && m.tool_call_id === 'call_1'));
  const last4 = J.brain.history.slice(-4).map(m => m.role); eq(last4, ['user', 'assistant', 'tool', 'assistant']);
  assert.match(jarvisText(), /Zapisane/);
});

test('pętla: awaria sieci → silnik lokalny odpowiada i pokazuje ostrzeżenie', async () => {
  const { J, jarvisText } = await setup({ toolFormat: 'hermes' }, [new TypeError('Failed to fetch')]);
  await J.brain.handle('która godzina');
  assert.match(jarvisText(), /Jest \d{2}:\d{2}/); assert.match(jarvisText(), /Hermes jest offline/);
  assert.equal(J.hermes.status, 'down');
});

test('pętla: zły JSON w wywołaniu daje INVALID_ARGS zamiast wyjątku i model dostaje szansę poprawki', async () => {
  const { J, requests } = await setup({ toolFormat: 'hermes' }, [
    () => sse([chunk({ content: '<tool_call>{to nie jest json}</tool_call>' })]),
    () => sse([chunk({ content: 'Przepraszam, spróbuję inaczej.' })])
  ]);
  await J.brain.handle('zrób coś');
  assert.equal(requests.length, 2);
  assert.match(requests[1].messages.filter(m => m.role === 'user').at(-1).content, /INVALID_ARGS/);
});

test('Process Log: historia trafia do IndexedDB (store), a główny klucz zostaje lekki', async () => {
  const { J } = await setup({ toolFormat: 'hermes' }, [() => sse([chunk({ content: 'Cześć!' })])]);
  J.proc.init(); await wait(50);
  assert.equal(J.historyMigrated, true, 'migracja zakończona');
  await J.brain.handle('cześć jarvis');
  await wait(700);   // zapis historii ma opóźnienie (debounce)
  const saved = await J.store.get('proc.history', []);
  assert.equal(saved.length, 1); assert.equal(saved[0].title, 'cześć jarvis');
  assert.equal(JSON.parse(J.__ctx.localStorage.getItem('jarvis-os:v2') || '{"history":[]}').history.length, 0, 'główny klucz nie trzyma historii zadań');
});

test('Process Log: stara historia z głównego klucza jest przenoszona, nic nie ginie', async () => {
  const legacy = [{ id: 'stare1', title: 'stare zadanie', ts: 5, status: 'ok', steps: [] }];
  const J = load({ dom: true, state: { settings: { hermesOn: false }, history: legacy } });
  await J.store.set('proc.history', [{ id: 'nowe1', title: 'nowsze', ts: 9, status: 'ok', steps: [] }]);
  J.proc.init(); await wait(500);   // migracja + opóźniony zapis stanu (debounce)
  eq(J.state.history.map(h => h.id), ['nowe1', 'stare1'], 'scalone i posortowane od najnowszego');
  assert.equal((await J.store.get('proc.history', [])).length, 2);
  assert.equal(JSON.parse(J.__ctx.localStorage.getItem('jarvis-os:v2')).history.length, 0, 'po migracji główny klucz jest lekki');
});
