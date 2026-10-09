/* Test end-to-end: PRAWDZIWA strona Jarvis OS (Chromium) → most → agent WWW (Chromium + atrapa Jeva) i zadanie „na komputerze”
   (atrapa programu). Klika zgody tak jak użytkownik. Bez klucza, bez internetu, bez ruszania Twojej myszy.
     node integrations/tests/e2e-jarvis.mjs
   Wymaga: wdrożone jev-voice-browser (setup.ps1) i Python Hermesa (venv z mcp). */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.resolve(HERE, '..', '..');
const VENDOR = process.env.JARVIS_JEV_BROWSER || path.join(os.homedir(), '.jarvis-os', 'vendor', 'jev-voice-browser');
const PY = path.join(os.homedir(), '.hermes', 'hermes-agent', 'venv', 'Scripts', 'python.exe');
if (!fs.existsSync(path.join(VENDOR, 'node_modules')) || !fs.existsSync(PY)) { console.log('pominięto: brak jev-voice-browser albo Pythona Hermesa'); process.exit(0); }
const { chromium } = await import(pathToFileURL(path.join(VENDOR, 'node_modules', 'playwright', 'index.mjs')).href);

const TOKEN = 'e2e-token', P = { page: 4010, bridge: 18671, agent: 18672, shop: 18673 };
let fails = 0; const check = (name, cond, extra = '') => { console.log((cond ? '  ok   ' : '  FAIL ') + name + (!cond && extra ? '  [' + extra + ']' : '')); if (!cond) fails++; };

/* statyczny serwer Jarvis OS z katalogu repozytorium */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const app = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname), f = path.join(REPO, u === '/' ? 'index.html' : u);
  if (u === '/config.local.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end('/* e2e: bez lokalnej konfiguracji (klucz Jeva nie może wyciec do testu) */'); }
  if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nie ma'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
/* sklep testowy */
let bought = 0;
const shop = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/buy') { bought++; return res.end('ok'); }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(u.pathname === '/' ? `<title>Sklep e2e</title><h1>Sklep e2e</h1><a href="/a">First result</a> <a href="/b">Second result</a> <button onclick="fetch('/buy')">Buy now</button><p>Kod promocyjny: ZIELONE-JABŁKA</p>` : `<title>Podstrona ${u.pathname}</title><p>To jest ${u.pathname}</p>`);
});
await Promise.all([[app, P.page], [shop, P.shop]].map(([s, p]) => new Promise(r => s.listen(p, '127.0.0.1', r))));

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-e2e-'));
fs.copyFileSync(path.join(REPO, 'bridge', 'tools.json'), path.join(home, 'tools.json'));
const bridge = spawn(PY, [path.join(REPO, 'bridge', 'jarvis_bridge.py')], { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env,
  JARVIS_BRIDGE_TOKEN: TOKEN, JARVIS_BRIDGE_PORT: String(P.bridge), JARVIS_HOME: home, JARVIS_BRIDGE_TOOLS_FILE: path.join(home, 'tools.json'), JARVIS_BRIDGE_ORIGINS: `http://127.0.0.1:${P.page}`,
  JARVIS_WEB_AGENT_URL: `http://127.0.0.1:${P.agent}`, JARVIS_FAKE_JEV: '1', JARVIS_WEB_HEADLESS: '1', JARVIS_JEV_BROWSER: VENDOR,
  JARVIS_COMPUTER_CMD: JSON.stringify([PY, path.join(REPO, 'bridge', 'fake_computer.py'), '{goal}', '{out}']) } });
let berr = ''; bridge.stderr.on('data', d => berr += d);
const B = (m, p, body) => fetch(`http://127.0.0.1:${P.bridge}${p}`, { method: m, headers: { 'X-Bridge-Token': TOKEN, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const cleanup = async browser => { await browser?.close().catch(() => { }); bridge.kill(); app.close(); shop.close(); };

try {
  for (let i = 0; i < 360; i++) { try { if ((await fetch(`http://127.0.0.1:${P.bridge}/bridge/status`)).status) break; } catch { await new Promise(r => setTimeout(r, 250)); } if (bridge.exitCode !== null) throw new Error('most padł: ' + berr.slice(0, 300)); }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://127.0.0.1:${P.page}/?skipBoot=1&hermesOn=0&bridgeOn=1&bridgeUrl=${encodeURIComponent('http://127.0.0.1:' + P.bridge)}`);
  await page.waitForFunction(() => window.J?.bridge && window.J.agents && window.J.registry?.get('web_command'), null, { timeout: 30000 });
  await page.waitForFunction(() => J.bridge.status === 'up', null, { timeout: 30000 });
  console.log('Jarvis OS ↔ most');
  check('strona połączyła się z mostem (SSE + parowanie tokenu)', true);
  const tools = await page.evaluate(() => J.registry.tools().map(t => t.function.name));
  check('rejestr ma polecenia agentów', ['web_command', 'web_read', 'computer_use', 'computer_stop'].every(t => tools.includes(t)));
  const st = (await B('GET', '/bridge/status')).body;
  check('most zna schematy narzędzi z rejestru strony (w tym agentów)', st.tools.includes('computer_use') && st.tools.includes('web_command'), st.tools.length + ' narzędzi');

  const say = t => page.evaluate(t => J.brain.handle(t), t);
  const idle = () => page.waitForFunction(() => !J.brain.busy, null, { timeout: 60000 });
  const answer = async word => { await page.waitForFunction(() => J.ask.pending, null, { timeout: 30000 }); await page.evaluate(w => J.ask.answer(w), word); };
  const agentUrl = async () => (await B('GET', '/agents/web/state')).body.page?.url || '';

  console.log('\nInternet: polecenia po polsku przez czat');
  let t0 = Date.now(); await say(`w przeglądarce wejdź na http://127.0.0.1:${P.shop}/`); await idle();
  check('„w przeglądarce wejdź na …” otwiera stronę wprost (bez Jeva)', (await agentUrl()) === `http://127.0.0.1:${P.shop}/`, await agentUrl());
  console.log(`       (${Date.now() - t0} ms łącznie z startem agenta i Chromium)`);
  t0 = Date.now(); await say('w przeglądarce kliknij drugi wynik'); await idle();
  check('„kliknij drugi wynik” → Jev wybiera element → klik', (await agentUrl()).endsWith('/b'), await agentUrl());
  console.log(`       (${Date.now() - t0} ms; decyzja atrapy Jeva ~4 ms)`);
  await say('w przeglądarce wróć'); await idle();
  if (process.env.E2E_DEBUG) console.log('  [debug] historia:', JSON.stringify(await page.evaluate(() => J.brain.history.slice(-2).map(m => String(m.content).slice(0, 200)))), '| stan agenta:', JSON.stringify((await B('GET', '/agents/web/state')).body.page));
  check('„wróć” → go back', (await agentUrl()) === `http://127.0.0.1:${P.shop}/`, await agentUrl());
  const read = await page.evaluate(() => J.registry.run('web_read', {}, { source: 'hermes' }));
  check('web_read zwraca treść jako dane niezaufane', read.ok && /ZIELONE-JABŁKA/.test(read.text) && /niezaufane/.test(read.text), read.text?.slice(0, 120));

  console.log('\nInternet: działanie nieodwracalne wymaga Twojej zgody');
  let job = say('w przeglądarce kliknij buy now'); await answer('Nie'); await job; await idle();
  await new Promise(r => setTimeout(r, 500)); check('odmowa → nic nie kupiono', bought === 0, String(bought));
  job = say('w przeglądarce kliknij buy now'); await answer('Tak'); await job; await idle();
  await new Promise(r => setTimeout(r, 700)); check('zgoda → kliknięto dokładnie raz', bought === 1, String(bought));

  console.log('\nPrawdziwy komputer (atrapa programu): zgoda, wynik, odmowa, przerwanie');
  t0 = Date.now();
  const pr = page.evaluate(() => J.registry.run('computer_use', { goal: 'open Notepad and type hello' }, { source: 'hermes' }));
  await answer('Tak'); const r = await pr;
  check('z zgodą zadanie kończy się sukcesem z wynikiem programu', r.ok && /Gotowe/.test(r.text) && r.data.steps === 2, JSON.stringify(r).slice(0, 200));
  console.log(`       (${Date.now() - t0} ms)`);
  const before = (await B('GET', '/agents/computer/status')).body.id;
  const pr2 = page.evaluate(() => J.registry.run('computer_use', { goal: 'delete everything' }, { source: 'hermes' }));
  await answer('Nie'); const r2 = await pr2;
  check('odmowa → DENIED i żadne zadanie nie startuje', !r2.ok && r2.code === 'DENIED' && (await B('GET', '/agents/computer/status')).body.id === before, JSON.stringify(r2).slice(0, 160));
  const typed = page.evaluate(() => J.brain.handle('na komputerze otwórz kalkulator'));
  await answer('Tak'); await typed; await idle();
  check('polecenie wpisane ręcznie też pyta o zgodę i działa', (await B('GET', '/agents/computer/status')).body.goal === 'otwórz kalkulator');
  const hang = page.evaluate(() => J.registry.run('computer_use', { goal: 'hang please', wait_s: 60 }, { source: 'local' }));
  await answer('Tak'); await new Promise(r => setTimeout(r, 1500));
  await page.evaluate(() => J.brain.abort ? J.brain.abort() : 0);
  await B('POST', '/agents/computer/stop');
  await hang.catch(() => { });
  const fin = (await B('GET', '/agents/computer/status')).body;
  check('stop zatrzymuje zadanie', fin.state === 'stopped', fin.state);
  check('brak błędów JS na stronie', errs.length === 0, errs.slice(0, 2).join(' | '));
  await cleanup(browser);
} catch (e) { console.log('  FAIL wyjątek:', e.message); fails++; await cleanup(); }
console.log('\n' + (fails ? `BŁĘDY: ${fails}` : 'WSZYSTKO OK')); process.exit(fails ? 1 : 0);
