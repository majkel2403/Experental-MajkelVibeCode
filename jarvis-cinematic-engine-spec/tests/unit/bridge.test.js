'use strict';
/* Most MCP (Jarvis OS ⇄ Hermes): migawka narzędzi, wybór trybu MCP, kształt zapytania i wykonanie polecenia z mostu. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { load } = require('../harness.js');

const FILES = ['core.js', 'events.js', 'store.js', 'registry.js', 'undo.js', 'jev-policy.js', 'process.js', 'apps.js', 'apps-settings.js', 'widgets.js', 'chart.js', 'widget-spec.js', 'commands.js', 'search.js', 'commands-ext.js', 'commands-data.js', 'commands-w4.js', 'context.js', 'judge.js', 'jev-flow.js', 'ai.js', 'bridge.js'];   // jak domyślnie w harness.js + klient mostu
const DESKTOP = { hermesOn: true, hermesProvider: 'desktop', hermesUrl: 'http://localhost:8643/v1', hermesModel: 'jarvis-desktop', hermesKey: 'k', bridgeOn: false };

test('bridge/tools.json odpowiada Command Registry (node bridge/export-tools.js)', () => {
  const J = load();
  const want = J.registry.tools().map(t => t.function);
  const have = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'bridge', 'tools.json'), 'utf8'));
  assert.equal(JSON.stringify(have.map(t => t.name)), JSON.stringify(want.map(t => t.name)));
  assert.equal(JSON.stringify(have), JSON.stringify(want));
});

test('tryb MCP: tylko gdy most połączony i profil Hermesa z niego korzysta', () => {
  const J = load({ files: FILES, state: { settings: { ...DESKTOP } } });
  assert.equal(J.brain.mcp, false, 'most niepołączony');
  J.bridge.connected = true; J.bridge.hermes = { 'jarvis-desktop': 12 };
  assert.equal(J.brain.mcp, true);
  J.bridge.hermes = { 'jarvis-desktop': 5000 };
  assert.equal(J.brain.mcp, false, 'profil dawno się nie zgłaszał');
  J.state.settings.hermesMode = 'mcp';
  assert.equal(J.brain.mcp, true, 'wymuszony MCP');
  J.state.settings.hermesMode = 'prompt';
  assert.equal(J.brain.mcp, false, 'wymuszony prompt');
  J.state.settings.hermesMode = 'mcp'; J.state.settings.hermesProvider = 'openrouter';
  assert.equal(J.brain.mcp, false, 'chmura nie ma mostu');
});

test('zapytanie w trybie MCP: bez definicji narzędzi, krótki prompt, bez nagłówka X-Hermes-Session-Key', async () => {
  const reqs = [];
  const fetch = async (url, o = {}) => {
    reqs.push({ url, headers: o.headers || {}, body: o.body ? JSON.parse(o.body) : null });
    return { ok: true, status: 200, body: null, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message: { content: 'Otworzyłem notatnik.' } }] }) };
  };
  const J = load({ files: FILES, fetch, state: { settings: { ...DESKTOP, hermesMode: 'mcp' } } });
  // bez DOM: czat, okna, orb i głos jako atrapy — testujemy tylko to, co idzie do Hermesa
  J.chat = { add: () => ({ set() { } }) }; J.wm.open = () => { }; J.wm.isOpen = () => true; J.wm.isMin = () => false;
  J.orb = { set() { }, state: 'idle' }; J.voice = { speak() { } }; J.state.settings.speech = false;
  const st = () => ({ done() { }, fail() { }, set() { }, append() { }, step: { ts: Date.now() } });
  J.proc = { start() { }, end() { }, step: st, plan() { }, planStep() { }, active: false }; J.sfx = new Proxy({}, { get: () => () => { } });
  await J.brain.handle('opowiedz mi coś ciekawego o teorii względności');
  const chat = reqs.find(r => /chat\/completions$/.test(r.url));
  assert.ok(chat, 'wysłano zapytanie do Hermesa');
  assert.equal(chat.body.tools, undefined);
  assert.match(chat.body.messages[0].content, /mcp__jarvis_desktop__/);
  assert.doesNotMatch(chat.body.messages[0].content, /<tools>/);
  assert.match(chat.body.messages.at(-1).content, /<environment>/);
  assert.equal(chat.headers['X-Hermes-Session-Key'], undefined);
  assert.equal(chat.headers.Authorization, 'Bearer k');
  assert.equal(reqs.filter(r => /chat\/completions$/.test(r.url)).length, 1, 'pętlę narzędzi prowadzi Hermes — jedna tura');
});

test('polecenie z mostu idzie przez rejestr i zwraca kopertę', async () => {
  const J = load({ files: FILES, state: { settings: { ...DESKTOP } } });
  const ok = await J.brain.run('create_note', { title: 'Z mostu', content: 'treść', show: false }, { source: 'hermes' });
  assert.equal(ok.ok, true); assert.equal(ok.code, 'OK');
  assert.ok(J.state.notes.some(n => n.title === 'Z mostu'));
  const bad = await J.brain.run('open_app', { app: 'nie-ma-takiej' }, { source: 'hermes' });
  assert.equal(bad.ok, false); assert.equal(bad.code, 'INVALID_ARGS');
});

test('Hermes: karta z ustawieniem domyślnym (:8642, bez klucza) sama łączy się z jarvis-desktop przez most; własnego wyboru nie rusza', async () => {
  const calls = [];
  let reply = { url: 'http://b/bridge/v1', key: '', model: 'jarvis-desktop', preset: 'desktop', proxy: true };
  const fetch = async (url, o = {}) => { calls.push({ url, token: o.headers?.['X-Bridge-Token'] }); return { ok: true, status: 200, json: async () => reply }; };
  const mk = settings => { const J = load({ files: FILES, fetch, state: { settings: { bridgeOn: false, bridgeToken: 't', bridgeUrl: 'http://b', ...settings } } }); J.hermesPing = async () => 'up'; J.toast = () => { }; return J; };
  const J = mk({ hermesProvider: 'agent', hermesUrl: 'http://localhost:8642/v1', hermesKey: '', hermesModel: 'hermes-agent', hermesOn: true });
  assert.equal(await J.bridge.ensureHermes('test'), true);
  const s = J.state.settings;
  assert.deepEqual([s.hermesProvider, s.hermesUrl, s.hermesKey, s.hermesModel, s.hermesOn], ['desktop', 'http://b/bridge/v1', '', 'jarvis-desktop', true], 'przez most-pośrednika, bez klucza w przeglądarce');
  assert.equal(calls.at(-1).url, 'http://b/bridge/hermes'); assert.equal(calls.at(-1).token, 't', 'z tokenem mostu');
  assert.equal(await J.bridge.ensureHermes('test'), false, 'drugi raz w ciągu minuty nic nie robi');
  const own = mk({ hermesProvider: 'openrouter', hermesUrl: 'https://openrouter.ai/api/v1', hermesKey: 'sk-or-x', hermesOn: true });
  assert.equal(await own.bridge.ensureHermes('test'), false, 'chmura wybrana przez użytkownika zostaje');
  assert.equal(own.state.settings.hermesUrl, 'https://openrouter.ai/api/v1');
  const direct = mk({ hermesProvider: 'desktop', hermesUrl: 'http://localhost:8643/v1', hermesKey: 'moj', hermesModel: 'jarvis-desktop', hermesOn: true });
  assert.equal(await direct.bridge.ensureHermes('test'), true, 'połączenie bezpośrednie z kluczem (sprzed 2026-10-04) przechodzi na most');
  assert.deepEqual([direct.state.settings.hermesUrl, direct.state.settings.hermesKey], ['http://b/bridge/v1', ''], 'klucz znika z ustawień karty');
  const proxied = mk({ hermesProvider: 'desktop', hermesUrl: 'http://b/bridge/v1', hermesKey: '', hermesModel: 'jarvis-desktop', hermesOn: true });
  assert.equal(await proxied.bridge.ensureHermes('test'), false, 'działające ustawienie (most-pośrednik) zostaje');
  reply = { url: 'http://localhost:8643/v1', key: 'hk', model: 'jarvis-desktop', preset: 'desktop' };   // starszy most: wydaje klucz
  const old = mk({ hermesProvider: 'agent', hermesUrl: 'http://localhost:8642/v1', hermesKey: '', hermesModel: 'hermes-agent', hermesOn: true });
  assert.equal(await old.bridge.ensureHermes('test'), true, 'zgodność ze starszą wersją mostu');
  assert.equal(old.state.settings.hermesKey, 'hk');
});

test('Hermes przez most: zapytania niosą token mostu zamiast klucza gatewaya', async () => {
  const seen = [];
  const fetch = async (url, o = {}) => { seen.push({ url, headers: o.headers || {} }); return { ok: true, status: 200, json: async () => ({ data: [{ id: 'jarvis-desktop' }] }) }; };
  const J = load({ files: FILES, fetch, state: { settings: { bridgeOn: false, bridgeToken: 'tok', bridgeUrl: 'http://b', hermesProvider: 'desktop', hermesUrl: 'http://b/bridge/v1', hermesKey: 'NIE-WYSYLAJ', hermesModel: 'jarvis-desktop', hermesOn: true } } });
  assert.equal(J.viaBridge('http://b/bridge/v1'), true);
  assert.equal(J.viaBridge('http://localhost:8643/v1'), false);
  await J.brain.models();
  const h = seen.find(x => /\/bridge\/v1\/models$/.test(x.url)).headers;
  assert.equal(h['X-Bridge-Token'], 'tok');
  assert.equal(h.Authorization, undefined, 'klucz gatewaya nie wychodzi z przeglądarki');
});
test('Zadanie Hermesa z Telegrama (zdarzenia z mostu) zasila Orb i Process Log; narzędzia pulpitu bez duplikatów', async () => {
  const J = load({ dom: true, files: FILES, fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }), state: { settings: { bridgeOn: false, bridgeToken: 't', bridgeUrl: 'http://b' } } });
  const ev = (type, extra = {}) => J.bridge.agentEvent({ v: 1, type, task_id: 'h-s1-1', ...extra });
  ev('task.created', { platform: 'telegram', title: 'sprawdź pogodę i zapisz notatkę' });
  assert.equal(J.proc.active, true, 'zadanie w Process Logu');
  assert.match(J.proc.current.title, /^Telegram: sprawdź pogodę/);
  assert.equal(J.engine.taskId, 'h-s1-1', 'Orb śledzi zadanie z Telegrama');
  ev('tool.started', { call_id: 'c1', tool: 'web_search', label: 'pogoda Gorinchem' });
  assert.equal(J.engine.mode, 'EXECUTING', 'Orb: działanie');
  ev('tool.completed', { call_id: 'c1', tool: 'web_search', ms: 840 });
  ev('tool.started', { call_id: 'c2', tool: 'mcp__jarvis_desktop__create_note' });
  ev('tool.completed', { call_id: 'c2', tool: 'mcp__jarvis_desktop__create_note' });
  const steps = J.proc.current.steps;
  assert.equal(steps.filter(s => s.kind === 'server').length, 1, 'narzędzie pulpitu nie dubluje się (karta loguje je sama)');
  assert.equal(steps.find(s => s.kind === 'server').status, 'ok');
  J.bridge.agentEvent({ v: 1, type: 'tool.started', task_id: 'inne-zadanie', tool: 'terminal' });
  assert.equal(J.proc.current.steps.length, steps.length, 'zdarzenia innego zadania są ignorowane');
  ev('task.completed', { result: '12°C, notatka zapisana' });
  assert.equal(J.proc.active, false, 'zadanie zamknięte');
  assert.equal(J.state.history[0].status, 'ok');
  assert.ok(J.state.history[0].steps.some(s => s.kind === 'reply'), 'odpowiedź Hermesa w historii');
  assert.equal(J.engine.taskId, null);
  assert.equal(J.engine.mode, 'COMPLETED');
});

test('Zadanie z Telegrama nie przejmuje Orba, gdy trwa zadanie z czatu tej karty', async () => {
  const J = load({ dom: true, files: FILES, fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }), state: { settings: { bridgeOn: false, bridgeToken: 't', bridgeUrl: 'http://b' } } });
  J.proc.start('lokalne polecenie');
  J.bridge.agentEvent({ v: 1, type: 'task.created', task_id: 'h-s2-1', platform: 'telegram', title: 'zdalne' });
  assert.equal(J.proc.current.title, 'lokalne polecenie');
  J.bridge.agentEvent({ v: 1, type: 'tool.started', task_id: 'h-s2-1', tool: 'terminal' });
  assert.equal(J.proc.current.steps.filter(s => s.kind === 'server').length, 0);
});

test('Zadanie z czatu karty zaczęte W TRAKCIE zadania z Telegrama: dalsze kroki Telegrama nie trafiają do niego', async () => {
  const J = load({ dom: true, files: FILES, fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }), state: { settings: { bridgeOn: false, bridgeToken: 't', bridgeUrl: 'http://b' } } });
  J.bridge.agentEvent({ v: 1, type: 'task.created', task_id: 'h-s3-1', platform: 'telegram', title: 'film o Jevie' });
  assert.match(J.proc.current.title, /^Telegram: film o Jevie/);
  J.proc.start('Zamknij wszystkie widgety na pulpicie.');   // użytkownik pisze w karcie, Telegram dalej pracuje
  J.bridge.agentEvent({ v: 1, type: 'tool.started', task_id: 'h-s3-1', call_id: 'p1', tool: 'patch', label: 'jev.html' });
  J.bridge.agentEvent({ v: 1, type: 'tool.completed', task_id: 'h-s3-1', call_id: 'p1', tool: 'patch' });
  J.bridge.agentEvent({ v: 1, type: 'task.completed', task_id: 'h-s3-1', result: 'gotowe' });
  assert.equal(J.proc.current.title, 'Zamknij wszystkie widgety na pulpicie.');
  assert.equal(J.proc.current.steps.filter(s => s.kind === 'server' || s.kind === 'reply').length, 0, 'żadnych kroków z Telegrama w zadaniu karty');
  assert.equal(J.proc.active, true, 'zadanie karty nie zostało zamknięte przez koniec zadania z Telegrama');
});
