#!/usr/bin/env node
// Builds the demo runs in demo/runs/*.jsonl (deterministic; rerun after changing the scenarios).
//  - repo-fix:  the example "przeanalizuj repo, znajdź problem i go napraw" (planner, research, coder, tester,
//               memory, an MCP gateway, a failing then passing test)
//  - medytacja / panel / niemcy: the three scripted Hermes team runs rewritten as workflow events
// These are RECORDED DEMO RUNS, not live output: a real producer sends the same event shapes (see README).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const DIR = path.dirname(new URL(import.meta.url).pathname);
const T0 = Date.parse('2026-10-06T10:00:00Z');

function writer(run) {
  const evs = [];
  return {
    at(t, type, o) { evs.push(Object.assign({ ts: T0 + Math.round(t * 1000), run, type }, o || {})); },
    save() {
      evs.sort((a, b) => a.ts - b.ts);
      fs.writeFileSync(path.join(DIR, 'runs', run + '.jsonl'), evs.map((e) => JSON.stringify(e)).join('\n') + '\n');
      return evs.length;
    },
  };
}

// ---------------------------------------------------------------- repo-fix
// The example "przeanalizuj repo, znajdź problem i go napraw" on a REAL repository tree (file list of
// socketio/socket.io, demo/workspaces/socket.io.txt — or your own: --workspace <dir> uses `git ls-files`).
// The tree is real; the bug and the fix in the story are a demonstration.
function workspace() {
  const i = process.argv.indexOf('--workspace');
  if (i >= 0) {
    const dir = process.argv[i + 1];
    const files = execFileSync('git', ['-C', dir, 'ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean).slice(0, 5000);
    return { name: path.basename(path.resolve(dir)), files };
  }
  const lines = fs.readFileSync(path.join(DIR, 'workspaces', 'socket.io.txt'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
  return { name: 'socket.io', files: lines };
}
function repoFix() {
  const w = writer('repo-fix');
  const ws = workspace();
  const has = (f) => ws.files.includes(f);
  // pick real paths by pattern (falls back to any file so a custom workspace works too)
  const pickAll = (re, n) => ws.files.filter((f) => re.test(f)).slice(0, n);
  const pick = (re, i = 0) => pickAll(re, i + 1)[i] || ws.files[(i * 7919) % ws.files.length];
  const readme = has('README.md') ? 'README.md' : pick(/readme/i);
  const docs = pickAll(/^docs\/.*\.md$/, 5);
  const core = pick(/engine\.io-client\/lib\/socket\.ts$/);
  const transport = pick(/engine\.io-client\/lib\/transport\.ts$/);
  const ws1 = pick(/engine\.io-client\/lib\/transports\/websocket\.ts$/);
  const srcReads = pickAll(/engine\.io-client\/lib\/[^/]+\.ts$/, 6);
  const tests = pickAll(/engine\.io-client\/test\/[^/]+\.js$/, 4);
  const pkg = core.split('/').slice(0, -2).join('/');
  const newTest = pkg + '/test/regression/heartbeat-reconnect.js';
  const report = 'docs/heartbeat-reconnect-raport.md';
  const STEPS = ['Rozpoznanie repozytorium', 'Diagnoza heartbeat', 'Poprawka i test regresyjny', 'Testy', 'Raport dla zlecającego'];
  const msg = (t, from, to, tone, text, o) => w.at(t, 'message.sent', Object.assign({ agent: from, to, tone, text }, o || {}));

  // ---- 0. the order and the plan
  w.at(0, 'task.started', { text: 'Przeanalizuj repo, znajdź problem i go napraw.', user: 'Michał', step: 0 });
  w.at(1.0, 'hermes.reasoning', { text: 'Zgłoszenie: po ponownym połączeniu klient rozłącza się po ~25 s. Wygląda na timer heartbeat, który przeżywa stare połączenie.', tokens: 820, step: 0 });
  w.at(5.5, 'memory.read', { agent: 'hermes', resource: 'kontekst/ostatnie_zgloszenia', text: 'Zgłoszenie #4821: rozłączenie ~25 s po reconnect.' });
  w.at(7.0, 'planner.step', { text: 'Plan w pięciu krokach. Potrzebuję rozpoznania, programisty i testera.', steps: STEPS, tokens: 640, step: 0 });
  // ---- 1. Hermes creates the first agent and gives it a task
  w.at(11.0, 'agent.spawned', { agent: 'research', label: 'Research', parent: 'hermes', text: 'Rozpoznanie: mapa repozytorium, zgłoszenia, specyfikacja protokołu.' });
  msg(13.0, 'hermes', 'research', 'assign', 'Zrób mapę repozytorium i znajdź kod odpowiedzialny za ping/pong po stronie klienta.', { task: 'Mapa repo + kod heartbeat', step: 0 });
  msg(17.0, 'research', 'hermes', 'answer', 'Przyjąłem. Zaczynam od listy plików, potem zgłoszenia i specyfikacja.');
  w.at(19.5, 'tool.started', { agent: 'research', tool: 'terminal', command: 'git ls-files', text: 'Lista plików repozytorium.' });
  // the real tree arrives through listing events, one per package / top-level directory, in proportion to size
  const groups = new Map();
  const groupOf = (f) => { const p = f.split('/'); return p.length < 2 ? '.' : p[0] === 'packages' && p.length > 2 ? p[0] + '/' + p[1] : p[0]; };
  for (const f of ws.files) { const g = groupOf(f); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(f); }
  const order = [...groups.keys()].sort((a, b) => groups.get(b).length - groups.get(a).length || (a < b ? -1 : 1));
  let done = 0;
  const startOf = order.map((g) => { const t = 21 + (done / ws.files.length) * 16; done += groups.get(g).length; return t; });
  order.forEach((g, i) => w.at(startOf[i], 'workspace.scanned', { agent: 'research', tool: 'terminal', resource: ws.name, paths: groups.get(g), text: g + ': ' + groups.get(g).length + ' plików' }));
  w.at(37.5, 'tool.completed', { agent: 'research', tool: 'terminal', output: ws.files.length + ' plików w ' + order.length + ' pakietach / katalogach', latencyMs: 18000 });
  w.at(24.0, 'tool.started', { agent: 'research', tool: 'read' });
  [readme, ...docs].forEach((f, i) => w.at(24.5 + i * 1.6, 'file.read', { agent: 'research', tool: 'read', resource: f }));
  w.at(34.0, 'tool.completed', { agent: 'research', tool: 'read' });
  w.at(38.5, 'gateway.call', { agent: 'research', name: 'GitHub MCP', resource: 'issues', text: 'Otwarte zgłoszenia o rozłączeniach: 3 (#4821, #4790, #4655).', latencyMs: 640 });
  w.at(40.0, 'resource.read', { agent: 'research', tool: 'web_search', resource: 'https://socket.io/docs/v4/engine-io-protocol/', text: 'Specyfikacja ping/pong: pingInterval 25 s, pingTimeout 20 s.' });
  w.at(42.0, 'tool.started', { agent: 'research', tool: 'terminal', command: 'git grep -n "_pingTimeoutTimer" ' + pkg + '/lib', step: 1 });
  w.at(44.5, 'tool.completed', { agent: 'research', tool: 'terminal', output: [
    'lib/socket.ts:389:  private _pingTimeoutTimer: ReturnType<typeof setTimeout>;',
    'lib/socket.ts:541:    this.clearTimeoutFn(this._pingTimeoutTimer);',
    'lib/socket.ts:542:    this._pingTimeoutTimer = this.setTimeoutFn(() => {',
    'lib/socket.ts:801:      this.clearTimeoutFn(this._reconnectTimer);',
  ].join('\n') });
  w.at(45.5, 'file.read', { agent: 'research', tool: 'read', resource: core });
  msg(47.0, 'research', 'hermes', 'result', 'Mam podejrzenie: przy zamknięciu połączenia czyszczony jest tylko _reconnectTimer, a _pingTimeoutTimer zostaje (socket.ts:801).', { step: 1 });
  w.at(49.5, 'agent.completed', { agent: 'research' });
  // ---- 2. Hermes builds the rest of the team; the programmer creates its own tester
  w.at(51.0, 'hermes.reasoning', { text: 'Diagnoza wiarygodna (0,82). Potrzebny programista do poprawki, a on dobierze sobie testera.', tokens: 540, confidence: 0.82, step: 1 });
  w.at(55.0, 'agent.spawned', { agent: 'coder', label: 'Coder', parent: 'hermes', text: 'Programista: poprawka w engine.io-client i test regresyjny.' });
  msg(57.0, 'hermes', 'coder', 'assign', 'Wyczyść timer pingTimeout przy każdym zamknięciu połączenia i dopisz test regresyjny.', { task: 'Napraw timer pingTimeout', step: 2 });
  msg(61.0, 'coder', 'hermes', 'question', 'Czy poprawka ma objąć też transport websocket, czy tylko socket.ts?');
  msg(64.5, 'hermes', 'coder', 'answer', 'Zacznij od socket.ts. Websocket niech sprawdzi tester na prawdziwym połączeniu.');
  w.at(68.0, 'agent.spawned', { agent: 'tester', label: 'Tester', parent: 'coder', text: 'Tester: uruchamia testy klienta i pilnuje regresji.' });
  msg(70.0, 'coder', 'tester', 'assign', 'Przygotuj testy klienta engine.io; dam znać, gdy poprawka będzie gotowa.', { task: 'Testy regresji reconnect' });
  // ---- 3. writing the fix
  w.at(73.0, 'tool.started', { agent: 'coder', tool: 'edit' });
  srcReads.filter((f) => f !== core).slice(0, 2).forEach((f, i) => w.at(73.4 + i * 0.8, 'file.read', { agent: 'coder', tool: 'read', resource: f }));
  w.at(75.5, 'memory.write', { agent: 'coder', resource: 'kontekst/diagnoza', text: 'Przyczyna: niewyczyszczony _pingTimeoutTimer.' });
  w.at(77.0, 'file.modified', { agent: 'coder', tool: 'edit', resource: core, line: 795, step: 2, text: 'Czyszczenie timera pingTimeout przy zamknięciu.', patch: [
    '   private _onClose(reason: string, description?: CloseDetails | Error) {',
    '     if ("opening" === this.readyState || "open" === this.readyState) {',
    '       debug(\'socket close with reason: "%s"\', reason);',
    ' ',
    '-      // clear timers',
    '+      // clear timers: the heartbeat of this connection must not outlive it',
    '       this.clearTimeoutFn(this._reconnectTimer);',
    '+      this.clearTimeoutFn(this._pingTimeoutTimer);',
    '+      this._pingTimeoutTimer = null;',
    ' ',
    '       // stop event from firing again for transport',
    '       this.transport.removeAllListeners("close");',
  ].join('\n') });
  w.at(85.0, 'file.modified', { agent: 'coder', tool: 'edit', resource: transport, line: 148, text: 'Zdarzenie close przekazuje szczegóły.', patch: [
    '   protected onClose(details?: CloseDetails) {',
    '     this.readyState = "closed";',
    '-    super.emitReserved("close");',
    '+    super.emitReserved("close", details);',
    '   }',
  ].join('\n') });
  w.at(90.0, 'file.created', { agent: 'coder', tool: 'edit', resource: newTest, text: 'Test regresyjny: ponowne połączenie nie dziedziczy timera.', content: [
    'const expect = require("expect.js");',
    'const { Socket } = require("../..");',
    '',
    'describe("heartbeat after reconnect", () => {',
    '  it("does not inherit the old pingTimeout timer", (done) => {',
    '    const socket = new Socket({ transports: ["websocket"] });',
    '    socket.on("open", () => socket.transport.close());',
    '    socket.on("close", () => {',
    '      expect(socket._pingTimeoutTimer).to.be(null);',
    '      done();',
    '    });',
    '  });',
    '});',
  ].join('\n') });
  w.at(98.0, 'tool.completed', { agent: 'coder', tool: 'edit', latencyMs: 25000 });
  msg(98.5, 'coder', 'tester', 'handoff', 'Gotowe: socket.ts, transport.ts i nowy test w test/regression/. Uruchom proszę.');
  // ---- 4. tests: first run fails
  w.at(102.0, 'tool.started', { agent: 'tester', tool: 'terminal', command: 'npm test -w engine.io-client -- --grep reconnect', step: 3 });
  w.at(105.0, 'test.started', { agent: 'tester', name: 'heartbeat-reconnect', output: '  heartbeat after reconnect' });
  w.at(106.5, 'test.passed', { agent: 'tester', name: 'socket', output: '    ✓ reconnects after transport close (412ms)' });
  w.at(108.5, 'test.failed', { agent: 'tester', name: 'heartbeat-reconnect', text: 'Po zamknięciu websocketa timer nadal działa.', output: '    ✗ does not inherit the old pingTimeout timer\n      AssertionError: expected Timeout {} to be null\n      at Socket._onClose (lib/transports/websocket.ts:87)' });
  w.at(109.5, 'tool.failed', { agent: 'tester', tool: 'terminal', output: '\n  1 passing (2s)\n  1 failing', latencyMs: 7500 });
  msg(111.0, 'tester', 'coder', 'critique', 'heartbeat-reconnect nie przechodzi: przy zamknięciu websocketa timer zostaje (websocket.ts:87).');
  msg(115.0, 'coder', 'tester', 'answer', 'Widzę: websocket woła onClose bez szczegółów, więc ta gałąź się nie wykonuje. Poprawiam.');
  w.at(118.0, 'tool.started', { agent: 'coder', tool: 'edit' });
  w.at(118.5, 'file.read', { agent: 'coder', tool: 'read', resource: ws1 });
  w.at(120.0, 'file.modified', { agent: 'coder', tool: 'edit', resource: ws1, line: 84, text: 'onClose ze szczegółami także dla websocket.', patch: [
    '     this.ws.onclose = (closeEvent) =>',
    '-      this.onClose();',
    '+      this.onClose({',
    '+        description: "websocket connection closed",',
    '+        context: closeEvent,',
    '+      });',
  ].join('\n') });
  w.at(125.0, 'tool.completed', { agent: 'coder', tool: 'edit' });
  msg(125.5, 'coder', 'tester', 'revision', 'Poprawione w websocket.ts, proszę o powtórkę całego zestawu.');
  // ---- second run passes
  w.at(129.0, 'tool.started', { agent: 'tester', tool: 'terminal', command: 'npm test -w engine.io-client', step: 3 });
  tests.slice(0, 2).forEach((f, i) => w.at(131 + i * 0.6, 'file.read', { agent: 'tester', tool: 'terminal', resource: f }));
  ['socket', 'connection', 'transport', 'heartbeat-reconnect'].forEach((n, i) => w.at(133 + i * 1.3, 'test.passed', { agent: 'tester', name: n, output: '    ✓ ' + { socket: 'reconnects after transport close (398ms)', connection: 'connects and upgrades (221ms)', transport: 'emits close with details (12ms)', 'heartbeat-reconnect': 'does not inherit the old pingTimeout timer (87ms)' }[n] }));
  w.at(139.0, 'tool.completed', { agent: 'tester', tool: 'terminal', output: '\n  4 passing (3s)', latencyMs: 10000 });
  msg(140.5, 'tester', 'hermes', 'result', 'Wszystkie testy przechodzą (4/4). Regresja zabezpieczona nowym testem.');
  w.at(142.5, 'agent.completed', { agent: 'tester' });
  w.at(143.0, 'result.returned', { agent: 'coder', text: 'Poprawka w 3 plikach + test regresyjny.' });
  w.at(143.5, 'agent.completed', { agent: 'coder' });
  // ---- 5. the report
  w.at(145.0, 'hermes.reasoning', { text: 'Składam raport: przyczyna, zmiany, dowód z testów.', tokens: 700, confidence: 0.93, step: 4 });
  w.at(148.5, 'file.created', { agent: 'hermes', tool: 'edit', resource: report, text: 'Raport dla zlecającego.', step: 4, content: [
    '# Rozłączanie po ponownym połączeniu',
    '',
    '## Przyczyna',
    'Timer pingTimeout starego połączenia nie był czyszczony,',
    'gdy zamknięcie przychodziło z transportu websocket.',
    '',
    '## Zmiany',
    '- lib/socket.ts: czyszczenie timera przy zamknięciu',
    '- lib/transport.ts: close przekazuje szczegóły',
    '- lib/transports/websocket.ts: onClose ze szczegółami',
    '- test/regression/heartbeat-reconnect.js: nowy test',
    '',
    '## Dowód',
    'npm test: 4 passing, 0 failing',
  ].join('\n') });
  msg(157.0, 'hermes', 'user', 'result', 'Gotowe: przyczyna znaleziona, poprawka w 3 plikach, nowy test, 4/4 przechodzą. Raport w docs/.');
  w.at(161.0, 'task.completed', { text: 'Naprawiono rozłączanie po ponownym połączeniu; testy 4/4.' });
  return w.save();
}

// ---------------------------------------------------------------- scripted Hermes teams
const TONE = { brief: 'assign', assign: 'assign', question: 'question', answer: 'answer', handoff: 'handoff', critique: 'critique', revision: 'revision', approve: 'approve', result: 'result' };
function slug(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }

const POOL = {
  R: [{ src: 'zrodlo', draft: 'notatka', ext: 'md' }, { src: 'raport_branzowy', draft: 'zestawienie', ext: 'csv' }, { src: 'wpis_forum', draft: 'cytaty', ext: 'txt' }, { src: 'opinia', draft: 'tabela', ext: 'csv' }, { src: 'dane', draft: 'wykres', ext: 'png' }],
  C: [{ src: 'brief', draft: 'szkic', ext: 'md' }, { src: 'wzor', draft: 'wariant', ext: 'md' }, { src: 'referencja', draft: 'makieta', ext: 'png' }, { src: 'notatka', draft: 'fragment', ext: 'txt' }, { src: 'kod', draft: 'modul', ext: 'js' }],
  Q: [{ src: 'wymaganie', draft: 'checklista', ext: 'md' }, { src: 'przypadek', draft: 'uwagi', ext: 'txt' }, { src: 'log', draft: 'raport_testu', ext: 'json' }],
  D: [{ src: 'sekcja', draft: 'rozdzial', ext: 'md' }, { src: 'zalacznik', draft: 'pakiet', ext: 'zip' }, { src: 'uwaga', draft: 'spis', ext: 'md' }],
};
function team(id) {
  const sc = JSON.parse(fs.readFileSync(path.join(DIR, 'scenarios', id + '.json'), 'utf8'));
  const ex = JSON.parse(fs.readFileSync(path.join(DIR, 'scenarios', id + '.extra.json'), 'utf8'));
  const w = writer(id);
  w.at(0, 'task.started', { text: sc.task });
  const an = sc.analysis || {};
  w.at(0.6, 'hermes.reasoning', { text: 'Cel: ' + an.goal, tokens: 600 });
  (an.constraints || []).forEach((c, i) => w.at(1.7 + i * 0.5, 'hermes.reasoning', { text: 'Ograniczenie: ' + c }));
  (an.success || []).forEach((c, i) => w.at(3.1 + i * 0.5, 'hermes.reasoning', { text: 'Kryterium: ' + c }));
  (an.risks || []).forEach((c, i) => w.at(4.5 + i * 0.45, 'hermes.reasoning', { text: 'Ryzyko: ' + c }));
  w.at(6, 'planner.step', { text: 'Skład zespołu: ' + sc.agents.map((a) => a.short).join(', ') + '.' });
  sc.agents.forEach((a) => w.at(a.spawn, 'agent.spawned', { agent: a.id, label: a.short, text: a.name + ' — ' + a.why }));
  // each task -> tool session; tool name from the agent's tool list
  const used = {};
  (sc.tasks || []).forEach((k) => {
    const a = sc.agents.find((x) => x.id === k.agent);
    if (!a) return;
    const n = (used[a.id] = (used[a.id] || 0) + 1);
    const tool = slug(a.tools[(n - 1) % a.tools.length]);
    w.at(k.from, 'tool.started', { agent: a.id, tool, text: k.label });
    // the agent's working steps while the tool runs: sources read and drafts written (~1 per 0.7 s)
    const steps = Math.max(2, Math.round((k.to - k.from) / 0.7));
    const pool = POOL[a.line] || POOL.R;
    for (let i = 0; i < steps; i++) {
      const tt = k.from + ((i + 0.5) * (k.to - k.from)) / steps;
      const p = pool[(i + n) % pool.length];
      if (i % 3 === 2) w.at(tt, i % 6 === 5 ? 'file.modified' : 'file.created', { agent: a.id, tool, resource: a.id + '/' + tool + '/' + p.draft + '_' + n + '_' + Math.ceil(i / 3) + '.' + p.ext, text: k.label });
      else w.at(tt, 'resource.read', { agent: a.id, tool, resource: a.id + '/' + tool + '/' + p.src + '_' + n + '_' + (i + 1), text: k.label });
    }
    w.at(k.to, k.review ? 'test.passed' : 'tool.completed', k.review ? { agent: a.id, name: slug(k.label) } : { agent: a.id, tool, latencyMs: Math.round((k.to - k.from) * 1000) });
    if (k.review) w.at(k.from + 0.1, 'test.started', { agent: a.id, name: slug(k.label) });
  });
  const born = new Set();
  sc.events.forEach((e) => {
    const from = e.from === 'hermes' ? 'hermes' : e.from;
    if (e.to === 'user') w.at(e.t, 'result.returned', { agent: from === 'hermes' ? 'hermes' : from, text: e.text });
    else w.at(e.t, 'message.sent', { agent: from, to: e.to, tone: TONE[e.kind] || 'handoff', text: e.text });
    if (e.attach && from !== 'hermes') {
      w.at(e.t - 0.3, born.has(e.attach) ? 'file.modified' : 'file.created', { agent: from, resource: 'projekt/' + e.attach, text: e.text });
      born.add(e.attach);
      if (e.to !== 'hermes' && e.to !== 'user') w.at(e.t + 1.4, 'file.read', { agent: e.to, resource: 'projekt/' + e.attach });
    }
    if (e.kind === 'approve') w.at(e.t + 0.2, 'agent.completed', { agent: from });
  });
  (ex.decisions || []).forEach((d) => w.at(d.t, 'memory.write', { agent: d.agents[0], resource: 'decyzje/' + d.id, text: d.title + ' — ' + d.why }));
  const last = {};
  (sc.tasks || []).forEach((k) => { last[k.agent] = Math.max(last[k.agent] || 0, k.to); });
  Object.entries(last).forEach(([a, t]) => w.at(Math.min(t + 0.4, 57), 'agent.completed', { agent: a }));
  w.at(58.5, 'task.completed', { text: sc.report.title });
  return w.save();
}

fs.mkdirSync(path.join(DIR, 'runs'), { recursive: true });
console.log('repo-fix', repoFix());
for (const id of ['medytacja', 'panel', 'niemcy']) console.log(id, team(id));
