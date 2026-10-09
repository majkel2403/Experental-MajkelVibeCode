/* =========================================================
   JARVIS OS — agent WWW: prawdziwa przeglądarka (Playwright) sterowana przez Jeva
   Opakowuje repozytorium moritzkremb/jev-voice-browser (bez zmiany jego kodu):
     zdanie → Jev (intencja + wybór elementu ~300 ms) → polityka → Playwright → wynik JSON.
   Celowo NIE uruchamia panelu z mikrofonem ani gniazda WebSocket autora — gniazdo na 127.0.0.1 jest dostępne
   z każdej strony otwartej w Twojej przeglądarce. Tu jest tylko HTTP z tokenem, odrzucający żądania ze stron
   (nagłówek Origin) i ataki DNS-rebinding (nagłówek Host). Woła go most (bridge/jarvis_bridge.py).

   Uruchomienie:  node integrations/web/agent.mjs [--port 8788] [--headless] [--start-url https://…]
   Zmienne:       JARVIS_WEB_PORT, JARVIS_WEB_HEADLESS=1, JARVIS_WEB_PROFILE, JARVIS_WEB_START_URL,
                  JARVIS_FAKE_JEV=1 (atrapa Jeva — bez klucza, tylko do prób), JARVIS_JEV_BROWSER (ścieżka repo)
   Klucz i adres API czyta z %USERPROFILE%\.jarvis-os\jev.env (TYPESAFE_API_KEY, TYPESAFE_BASE_URL, JEV_MODEL).
   ========================================================= */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HOME = path.join(os.homedir(), '.jarvis-os');
const HERE = path.dirname(fileURLToPath(import.meta.url));

/* KEY=VALUE z pliku; nie nadpisuje zmiennych już ustawionych w środowisku */
export function loadEnvFile(file) {
  if (!fs.existsSync(file)) return 0;
  let n = 0;
  for (const raw of fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('='), k = line.slice(0, i).trim(), v = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    if (k && v && process.env[k] === undefined) { process.env[k] = v; n++; }
  }
  return n;
}
export const readToken = () => {
  if (process.env.JARVIS_BRIDGE_TOKEN) return process.env.JARVIS_BRIDGE_TOKEN.trim();
  try { return fs.readFileSync(path.join(HOME, 'bridge-token'), 'utf8').trim(); } catch { return ''; }
};

const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const json = (res, code, body) => { const s = JSON.stringify(body); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(s); };
const readBody = req => new Promise((resolve, reject) => {
  let n = 0; const chunks = [];
  req.on('data', c => { n += c.length; if (n > 65536) { reject(Object.assign(new Error('body too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
  req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(Object.assign(new Error('bad json'), { status: 400 })); } });
  req.on('error', reject);
});

/* tylko http(s); „youtube.com” → https://youtube.com */
export function normalizeUrl(input) {
  let s = String(input || '').trim();
  if (!s || /\s/.test(s)) throw Object.assign(new Error('nieprawidłowy adres'), { status: 400 });
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
  const u = new URL(s);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw Object.assign(new Error('dozwolone tylko http/https'), { status: 400 });
  return u.toString();
}

/* Ścieżka do zainstalowanego Google Chrome (nie do Chromium z Playwrighta) albo null */
export function findChrome() {
  const env = process.env;
  return [env.JARVIS_CHROME_PATH, path.join(env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(env.ProgramFiles || '', 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(env['ProgramFiles(x86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe')]
    .find(p => p && fs.existsSync(p)) || null;
}

/* Uruchamia (albo wznawia) Chrome'a z debugowaniem tylko na 127.0.0.1 i OSOBNYM profilem. Chrome 136+ odmawia debugowania domyślnego
   profilu, a poza tym nie chcemy dotykać Twoich okien z zalogowanymi kontami. Zwraca null, gdy tryb to chromium albo Chrome nie jest zainstalowany. */
export async function startChrome({ log = () => { }, profileDir, port, mode } = {}) {
  const m = mode || process.env.JARVIS_WEB_BROWSER || 'auto';
  if (m === 'chromium') return null;
  const exe = findChrome();
  if (!exe) { if (m === 'chrome') throw new Error('JARVIS_WEB_BROWSER=chrome, ale nie znaleziono Google Chrome (JARVIS_CHROME_PATH)'); return null; }
  const dir = profileDir || process.env.JARVIS_CHROME_PROFILE || path.join(HOME, 'chrome-profile');
  fs.mkdirSync(dir, { recursive: true });
  /* Podpinamy się WYŁĄCZNIE pod Chrome'a, którego sami uruchomiliśmy (pid zapisany w profilu agenta). Wcześniej każdy Chrome
     z debugowaniem na tym porcie (np. prywatny użytkownika) był przejmowany — z jego kartami i zalogowanymi kontami. */
  const stateFile = path.join(dir, '.jarvis-cdp.json');
  const readState = () => { try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { return null; } };
  const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const probeAt = async port => { try { const r = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) }); return r.ok ? await r.json() : null; } catch { return null; } };
  let p = port || +process.env.JARVIS_CDP_PORT || 9223;
  let info = await probeAt(p);
  const st = readState();
  const ours = !!info && st?.port === p && st?.pid && alive(st.pid);
  if (info && !ours) {   // obcy proces na naszym porcie — omijamy go, szukając wolnego portu obok
    log(`Port ${p} zajmuje obca przeglądarka z debugowaniem — nie podpinam się, szukam wolnego portu`);
    info = null;
    for (let q = p + 1; q <= p + 20; q++) if (!(await probeAt(q))) { p = q; break; }
  }
  const endpoint = `http://127.0.0.1:${p}`;
  const probe = () => probeAt(p);
  let child = null; const reused = !!info;
  if (!info) {
    child = spawn(exe, [`--remote-debugging-port=${p}`, '--remote-debugging-address=127.0.0.1', `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check',
      '--disable-features=BackForwardCache',   // jak w Chromium z Playwrighta: przy bfcache goBack(domcontentloaded) czeka do limitu 15 s
      '--autoplay-policy=no-user-gesture-required',   // „puść piosenkę”: film ma grać z dźwiękiem od razu, a nie czekać na kliknięcie
      '--window-size=1280,900', '--window-position=40,40', 'about:blank'], { stdio: 'ignore', detached: false });
    child.on('error', e => log('Chrome nie wystartował: ' + e.message));
    for (let i = 0; i < 100 && !info; i++) { await new Promise(r => setTimeout(r, 150)); info = await probe(); if (child.exitCode !== null) break; }
    if (!info) { child.kill(); if (m === 'chrome') throw new Error('Chrome nie otworzył portu debugowania na ' + endpoint); return null; }
    try { fs.writeFileSync(stateFile, JSON.stringify({ port: p, pid: child.pid, started: new Date().toISOString() })); } catch (e) { log('Nie zapisałem stanu Chrome agenta: ' + e.message); }
  }
  return { endpoint, version: (info.Browser || '').replace(/^Chrome\//, ''), reused, stop() { if (child && child.exitCode === null) { try { child.kill(); } catch { /* już zamknięty */ } } } };
}

export async function createAgent(opts = {}) {
  const vendor = opts.vendor || process.env.JARVIS_JEV_BROWSER || path.join(HOME, 'vendor', 'jev-voice-browser');
  if (!fs.existsSync(path.join(vendor, 'src', 'controller.js'))) throw new Error('Brak jev-voice-browser w ' + vendor + ' — uruchom integrations\\setup.ps1');
  const imp = f => import(pathToFileURL(path.join(vendor, 'src', f)).href);
  const [{ BrowserManager }, { Controller }, jev, policy] = await Promise.all([imp('browser.js'), imp('controller.js'), imp('jev.js'), imp('policy.js')]);
  const log = opts.log || ((...a) => console.error('[web-agent]', ...a));

  let decideFn = opts.decideFn;
  if (!decideFn) {
    if (process.env.JARVIS_FAKE_JEV === '1') { decideFn = (await import('./fake-jev.mjs')).makeFakeDecide(jev.buildRequest); log('UWAGA: atrapa Jeva (JARVIS_FAKE_JEV=1) — bez modelu, tylko do prób'); }
    else if (!jev.hasApiKey()) throw new Error('Brak klucza Jeva: uruchom integrations\\set-key.ps1 (zapisze %USERPROFILE%\\.jarvis-os\\jev.env)');
    else decideFn = jev.decide;
  }

  const browser = new BrowserManager();
  /* Przeglądarka: prawdziwy Google Chrome (osobna instancja z własnym profilem, podpięta przez CDP) albo Chromium z Playwrighta.
     JARVIS_WEB_BROWSER=chrome|chromium|auto (domyślnie auto: Chrome, gdy jest zainstalowany). Twoje zwykłe okna Chrome nie są ruszane. */
  const chrome = opts.headless || opts.chromium ? null : await startChrome({ log, profileDir: opts.chromeProfile, port: opts.cdpPort, mode: opts.browserMode });
  await browser.launch(chrome
    ? { cdp: chrome.endpoint, startUrl: opts.startUrl || 'about:blank' }
    : { headless: !!opts.headless, profileDir: opts.profileDir || path.join(HOME, 'web-profile'), startUrl: opts.startUrl || 'about:blank' });
  browser.context.setDefaultTimeout(+process.env.JARVIS_WEB_ACTION_TIMEOUT || 6000);   // Playwright czeka domyślnie 30 s na element; polecenie ma się wykonać albo szybko zawieść
  log(chrome ? `przeglądarka: Google Chrome ${chrome.version} (CDP ${chrome.endpoint}${chrome.reused ? ', istniejąca instancja' : ''})` : 'przeglądarka: Chromium (Playwright)');
  const controller = new Controller({ browser, decideFn });
  /* Samoleczenie: elementy są znakowane atrybutem data-vb-id w chwili zrzutu, a nowoczesne strony (Wikipedia/Vue, React) odtwarzają węzły
     przed akcją — atrybut znika i Playwright czekał na nieistniejący element (6–30 s). Przed akcją sprawdzamy, czy element jeszcze jest;
     jeśli nie, odświeżamy zrzut i szukamy tego samego elementu (rola + tekst + placeholder) pod nowym id. */
  const execOriginal = controller._execute;
  controller._execute = async (action, br) => {
    if (action.targetId) {
      const page = await br.ensurePage();
      const present = await page.locator(`[data-vb-id="${action.targetId}"]`).count().catch(() => 0);
      if (!present) {
        const old = controller.snapshot?.elements?.find(x => x.id === action.targetId);
        await controller.refreshSnapshot().catch(() => { });
        const same = e => old && e.role === old.role && e.text === old.text && (e.placeholder || '') === (old.placeholder || '');
        const fresh = controller.snapshot?.elements?.find(same);
        if (!fresh && action.type === 'type_into_field' && action.submit && action.text) {   // pole wyszukiwania zniknęło: tak jak autor, gdy pola brak — wyszukiwarka
          log(`pole „${old?.text || action.targetId}” zniknęło — wyszukuję przez DuckDuckGo`);
          return execOriginal({ type: 'navigate_url', url: 'https://duckduckgo.com/?q=' + encodeURIComponent(action.text), label: `search: ${action.text}`, query: action.text }, br);
        }
        if (!fresh) throw new Error(`element "${old?.text || action.targetId}" zniknął ze strony (strona odtworzyła DOM)`);
        log(`element ${action.targetId} zniknął — przemapowany na ${fresh.id}`);
        return execOriginal({ ...action, targetId: fresh.id }, br);
      }
    }
    return execOriginal(action, br);
  };
  controller.on('error', () => { });   // Controller emituje 'error' bez nasłuchu = wyjątek nieobsłużony i zabicie procesu; błędy Jeva zgłaszamy w wyniku polecenia
  await controller.start();

  const token = opts.token ?? readToken();
  if (!token) throw new Error('Brak tokenu mostu (~/.jarvis-os/bridge-token) — uruchom most raz albo ustaw JARVIS_BRIDGE_TOKEN');

  const pageInfo = () => ({ url: controller.snapshot?.url || browser.currentUrl?.() || '', title: controller.snapshot?.title || '' });
  /* Controller odświeża migawkę dopiero PO zdarzeniu „action”; bez tego wynik miałby adres sprzed akcji, a kolejne polecenie — nieaktualną listę elementów */
  /* Wykonawca autora kończy „czekanie na stronę” od razu po Enter (waitForLoadState zwraca natychmiast dla wciąż załadowanej strony), więc po
     wysłaniu formularza wynik i następne polecenie widziałyby starą stronę. Gdy akcja mogła wywołać nawigację, czekamy na zmianę adresu (do 0,8 s). */
  const NAV_ACTIONS = new Set(['type_into_field', 'press_enter']);
  const settle = async (nav) => {
    const page = browser.page;
    if (nav && page) {
      const t0 = Date.now();
      while (Date.now() - t0 < 800 && page.url() === nav.before) await new Promise(r => setTimeout(r, 40));
      if (page.url() !== nav.before) await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => { });
    }
    await controller.refreshSnapshot().catch(() => { });
    return pageInfo();
  };
  const brief = a => a ? { type: a.type, label: a.label, url: a.url, text: a.text } : null;

  /* jedno polecenie naraz; kolejne czekają */
  let chain = Promise.resolve();
  const serial = fn => { const p = chain.then(fn, fn); chain = p.catch(() => { }); return p; };

  const stopRetries = () => { const u = controller.utterance; if (u) u.actedOn = true; clearTimeout(controller.silenceTimer); clearTimeout(controller.debounceTimer); };

  /* zdanie → decyzja Jeva → akcja; kończy się na pierwszym rozstrzygnięciu */
  const runCommand = (text, timeoutMs = 25000) => serial(() => new Promise(resolve => {
    const t0 = Date.now(), off = [], urlBefore = browser.currentUrl?.() || ''; let done = false, decisionInfo = null;
    const on = (ev, fn) => { controller.on(ev, fn); off.push(() => controller.off(ev, fn)); };
    const finish = payload => {
      if (done) return; done = true; clearTimeout(timer); off.forEach(f => f());
      if (payload.status !== 'done' && payload.status !== 'failed') stopRetries();
      const ms = Date.now() - t0;
      settle(NAV_ACTIONS.has(payload.action?.type) ? { before: urlBefore } : null).then(page => resolve({ ...payload, ms, decision: decisionInfo, page }));
    };
    on('decision', d => {
      decisionInfo = { jevMs: d.latencyMs, costUsd: d.costUsd, model: d.model, policy: d.policy.decision, summary: d.policy.summary };
      const p = d.policy.decision;
      if (p === 'act') return;   // czekamy na zdarzenie „action”
      if (p === 'confirm') finish({ status: 'confirm', summary: d.policy.summary, pending: brief(d.policy.action) });
      else if (p === 'disambiguate') finish({ status: 'candidates', summary: d.policy.summary, candidates: (d.policy.candidates || []).map((c, i) => ({ n: i + 1, id: c.id, label: c.label, p: c.p })) });   // controller.candidates ustawia się dopiero po emit — bierzemy z decyzji
      else if (p === 'cancel') finish({ status: 'cancelled', summary: d.policy.summary });
      else if (p === 'ignore') finish({ status: 'ignored', summary: d.policy.summary });
      else finish({ status: 'unrecognized', summary: d.policy.summary });   // „wait”: dla gotowego zdania to brak rozpoznanej komendy
    });
    on('action', a => finish({ status: a.ok ? 'done' : 'failed', summary: policy.describe(a.action), action: brief(a.action), detail: a.detail || '', executeMs: a.executeMs }));
    on('error', e => finish({ status: 'error', error: String(e?.message || e) }));
    const timer = setTimeout(() => finish({ status: 'timeout' }), Math.min(Math.max(+timeoutMs || 25000, 2000), 60000));
    controller.handleCommand(text);
  }));

  /* czeka na jedno zdarzenie „action” z limitem czasu i kanałem „error”.
     Wcześniej confirm()/pick() czekały bez limitu — wyjątek w _runAction zostawiał Promise nierozstrzygnięty,
     a przez serial() wieszał CAŁEGO agenta aż do restartu procesu. */
  const awaitAction = (run, ms = 30000) => new Promise(resolve => {
    let done = false;
    const hA = a => finish(a);
    const hE = e => finish({ ok: false, action: null, detail: String(e?.message || e) });
    const finish = v => { if (done) return; done = true; clearTimeout(t); controller.off('action', hA); controller.off('error', hE); resolve(v); };
    const t = setTimeout(() => finish({ ok: false, action: null, detail: 'timeout (30 s bez zdarzenia action)' }), ms);
    controller.on('action', hA); controller.on('error', hE);
    try { run(); } catch (e) { hE(e); }
  });

  const confirm = accept => serial(async () => {
    const p = controller.pending;
    if (!p) return { status: 'none', summary: 'Nic nie czeka na potwierdzenie.', page: await settle() };
    controller.pending = null; controller.emit('pending', null);
    if (!accept) return { status: 'cancelled', summary: 'Anulowano: ' + policy.describe(p), page: await settle() };
    const out = await awaitAction(() => controller._runAction({ ...p, confirmed: true }, { via: 'jarvis-confirm' }));
    return { status: out.ok ? 'done' : 'failed', summary: out.action ? policy.describe(out.action) : (out.detail || 'błąd'), detail: out.detail || '', page: await settle() };
  });

  /* wybór jednego z kandydatów po numerze (kontroler robi to tylko przez 8 s po pytaniu; tu z własnym limitem) */
  const pick = n => serial(async () => {
    const c = controller.candidates, cand = c?.list?.[(+n || 0) - 1];
    if (!cand) return { status: 'none', summary: 'Nie ma takiego kandydata.', page: await settle() };
    const action = { ...c.intent, targetId: cand.id, label: cand.label };
    controller.candidates = null; await browser.overlay('clearCandidates');
    const out = await awaitAction(() => controller._runAction(action, { via: 'jarvis-pick' }));
    return { status: out.ok ? 'done' : 'failed', summary: out.action ? policy.describe(out.action) : (out.detail || 'błąd'), detail: out.detail || '', page: await settle() };
  });

  const goto = url => serial(async () => {
    const target = normalizeUrl(url), t0 = Date.now();
    const page = await browser.ensurePage();
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const ms = Date.now() - t0;
    return { status: 'done', summary: 'open ' + target, ms, page: await settle() };
  });

  /* „puść X”: wyszukiwanie na YouTube → ekran zgody na cookies (UE) → pierwszy prawdziwy film (bez reklam, Shorts i kanałów) → sprawdzenie,
     że gra. Deterministycznie, bez Jeva: ta sama sekwencja zawsze, ~3–6 s. Adres bazowy można podmienić (JARVIS_YT_BASE) — dla testów. */
  const YT = (process.env.JARVIS_YT_BASE || 'https://www.youtube.com').replace(/\/+$/, '');
  /* zgoda na cookies (UE): osobna strona consent.youtube.com ALBO okno „Zanim przejdziesz do YouTube” na samej stronie —
     to okno zasłania odtwarzacz (przechwytuje kliknięcia) i blokuje odtwarzanie, dopóki się go nie zamknie. Przyciski szukamy po
     WIDOCZNYM tekście: ich nazwa dostępności to długi opis („Nie wyrażaj zgody na wykorzystywanie plików cookie…”). */
  const REJECT = /^\s*(odrzuć wszystko|reject all|alle ablehnen)\s*$/i, ACCEPT = /^\s*(zaakceptuj wszystko|accept all|alle akzeptieren)\s*$/i;
  const passConsent = async page => {
    const btn = re => page.locator('button, [role="button"]').filter({ hasText: re, visible: true }).first();
    let b = btn(REJECT);   // najpierw „Odrzuć” (mniej śledzenia), inaczej „Zaakceptuj”
    if (!(await b.count().catch(() => 0))) { b = btn(ACCEPT); if (!(await b.count().catch(() => 0))) return false; }
    const onPage = /consent\.(youtube|google)\./.test(page.url());
    await b.click({ timeout: 5000 });
    if (onPage) await page.waitForURL(u => !/consent\./.test(String(u)), { timeout: 10000 }).catch(() => { });
    else await b.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => { });
    return true;
  };
  /* Odtwarzacz YouTube steruje się jego własnym API (#movie_player.playVideo/pauseVideo/nextVideo). Bezpośrednie video.play()
     YouTube natychmiast cofa do pauzy (sprawdzone: „play” i zaraz „pause”), zwłaszcza w trakcie reklamy. Bez API (inne strony,
     testy) — zwykły element <video>. ctl: 'play' | 'pause' | 'next' | null (tylko odczyt). */
  const player = (page, ctl) => page.evaluate(ctl => {
    const pl = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
    const v = document.querySelector('#movie_player video, video');
    if (!v && !pl?.getPlayerState) return null;
    const api = typeof pl?.playVideo === 'function';
    const ad = !!pl?.classList.contains('ad-showing');
    if (ctl === 'play') {
      if (ad) document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern')?.click();   // „Pomiń reklamę”, gdy już można
      if (api) { const s = pl.getPlayerState(); if (s !== 1 && s !== 3) pl.playVideo(); if (pl.isMuted?.()) pl.unMute(); }
      else if (v) { if (v.paused) v.play().catch(() => { }); v.muted = false; }
    } else if (ctl === 'pause') { if (api) pl.pauseVideo(); else v?.pause(); }
    else if (ctl === 'next' && api && typeof pl.nextVideo === 'function') pl.nextVideo();
    const state = api ? pl.getPlayerState() : null;   // 1 gra, 2 pauza, 3 buforuje, -1 nie ruszył, 0 koniec, 5 w kolejce
    const t = api ? pl.getCurrentTime() : v?.currentTime ?? 0, d = api ? pl.getDuration() : v?.duration || 0;
    const title = (api && !ad && pl.getVideoData?.().title) || document.querySelector('h1.ytd-watch-metadata, #title h1, h1.title')?.innerText?.trim() || document.title.replace(/\s*-\s*YouTube$/, '');
    return { api, state, paused: api ? state !== 1 && state !== 3 : !!v?.paused, muted: api ? !!pl.isMuted?.() : !!v?.muted, t, d, ad, title };
  }, ctl || null).catch(() => null);
  const probe = page => player(page, 'play');
  /* „gra” = czas filmu naprawdę idzie do przodu (sam brak pauzy kłamie: YouTube podmienia źródło na reklamę, która potrafi stanąć) */
  const ensurePlaying = async (page, maxMs = 15000) => {
    const end = Date.now() + maxMs, quarter = Date.now() + maxMs * 0.25, half = Date.now() + maxMs * 0.5; let last = null, st = null, moving = 0, reloaded = false, clicked = false;
    while (Date.now() < end) {
      /* nie wystartował (-1) / buforuje w miejscu (3) / czeka w kolejce (5) — prawdziwe kliknięcie w odtwarzacz (gest użytkownika) */
      if (!clicked && Date.now() > quarter && !moving && st?.api && [-1, 3, 5].includes(st.state)) { clicked = true; await page.locator('#movie_player').click({ position: { x: 200, y: 150 }, timeout: 2000 }).catch(() => { }); }
      /* odtwarzacz zawieszony (np. reklama, która zaczęła się pod oknem zgody) — jedno przeładowanie strony zwykle go odblokowuje */
      if (!reloaded && Date.now() > half && !moving && /\/watch\?v=/.test(page.url())) { reloaded = true; await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => { }); last = null; continue; }
      await passConsent(page).catch(() => false);   // okno zgody na stronie filmu zatrzymuje odtwarzacz
      st = await probe(page);
      if (st && last && !st.paused && st.t > last.t + 0.2) { if (++moving >= 2) return { ...st, playing: true }; } else moving = 0;
      last = st; await new Promise(r => setTimeout(r, 400));
    }
    return { ...(st || {}), playing: false };
  };

  const play = query => serial(async () => {
    const q = String(query || '').trim().slice(0, 200);
    if (!q) return { status: 'failed', summary: 'Nie podano, co puścić.' };
    const t0 = Date.now(), page = await browser.ensurePage();
    await page.bringToFront().catch(() => { });
    const results = YT + '/results?search_query=' + encodeURIComponent(q);
    await page.goto(results, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const link = page.locator('ytd-video-renderer a#video-title[href*="/watch?v="]').first();
    let consent = false, found = false;
    for (const end = Date.now() + (+process.env.JARVIS_YT_WAIT_MS || 12000); Date.now() < end && !found;) {   // okno zgody bywa dorysowane po chwili
      if (await passConsent(page).catch(() => false)) { consent = true; if (!/\/results/.test(page.url())) await page.goto(results, { waitUntil: 'domcontentloaded', timeout: 15000 }); }
      found = await link.isVisible().catch(() => false);
      if (!found) await new Promise(r => setTimeout(r, 250));
    }
    if (!found) return { status: 'failed', summary: 'play ' + q, detail: 'Nie znalazłem żadnego filmu w wynikach YouTube.', consent, ms: Date.now() - t0, page: await settle() };
    const title = ((await link.getAttribute('title').catch(() => null)) || (await link.innerText().catch(() => '')) || q).trim();
    const href = await link.getAttribute('href');
    /* prawdziwe kliknięcie = gest użytkownika (dźwięk dozwolony także bez flagi autoplay); gdy nakładka YouTube przechwytuje mysz
       („subtree intercepts pointer events”), klik skryptem, a w ostateczności wejście wprost w adres filmu */
    let via = 'click';
    try { await link.click({ timeout: 2500 }); }
    catch { via = 'js'; await link.evaluate(a => a.click()).catch(() => { }); }
    try { await page.waitForURL(/\/watch\?v=/, { timeout: 4000 }); }
    catch { via = 'goto'; await page.goto(new URL(href, page.url()).href, { waitUntil: 'domcontentloaded', timeout: 15000 }); }
    const st = await ensurePlaying(page, +process.env.JARVIS_YT_PLAY_MS || 15000);
    const playing = st.playing;
    return { status: playing ? 'done' : 'failed', summary: 'play ' + q, title: st.ad || !st.title || st.title === 'YouTube' ? title : st.title, playing, muted: !!st.muted, ad: !!st.ad, consent, via, detail: playing ? '' : 'Film otwarty, ale odtwarzacz nie ruszył.', ms: Date.now() - t0, page: await settle() };
  });

  /* sterowanie tym, co gra: pause | resume | next (następny w kolejce/miksie YouTube) | status */
  const media = action => serial(async () => {
    const page = await browser.ensurePage();
    const look = () => player(page, null);
    let st = await look();
    if (!st) return { status: 'failed', summary: 'media ' + action, detail: 'Nic nie jest otwarte w odtwarzaczu.', page: await settle() };
    if (!['pause', 'resume', 'next', 'status'].includes(action)) return { status: 'failed', summary: 'media ' + action, detail: 'Nieznana akcja.' };
    if (action === 'pause') { await player(page, 'pause'); await page.waitForTimeout(300); st = { ...(await look()), playing: false }; }
    else if (action === 'next') {
      const before = page.url();
      if (!st.api) await page.keyboard.press('Shift+N').catch(() => { }); else await player(page, 'next');
      await page.waitForURL(u => String(u) !== before, { timeout: 6000 }).catch(() => { });
      st = await ensurePlaying(page, +process.env.JARVIS_YT_PLAY_MS || 15000);
    } else if (action === 'resume') st = await ensurePlaying(page, +process.env.JARVIS_YT_PLAY_MS || 15000);
    else { const a = await look(); await page.waitForTimeout(800); const b = await look(); st = { ...b, playing: !!a && !!b && !b.paused && b.t > a.t }; }
    return { status: 'done', summary: 'media ' + action, playing: !!st.playing, ad: !!st.ad, title: st.title, position: st.t != null ? Math.round(st.t) : null, duration: st.d ? Math.round(st.d) : null, page: await settle() };
  });

  /* zwięzły widok strony dla planisty zadania (bridge/web_task.py): elementy najpierw z widocznej części, fragment tekstu */
  /* banery cookies (dowolna strona): przycisk o dokładnym napisie „Odrzuć…/Akceptuj…”, ale tylko wewnątrz bloku, którego tekst mówi
     o cookies/prywatności — żeby nie kliknąć przypadkiem innego „OK”. Najpierw odrzucenie. */
  const dismissCookies = page => page.evaluate(() => {
    const REJ = /^\s*(odrzuć wszystk\w*|odrzuć|odmów|odmowa|nie zgadzam się|tylko niezbędne|reject all|reject|decline|only necessary)\s*$/i;
    const ACC = /^\s*(zaakceptuj wszystk\w*|akceptuj wszystk\w*|akceptuję|zgadzam się|zaakceptuj|akceptuj|accept all|accept|agree|i agree|ok, rozumiem|rozumiem)\s*$/i;
    const about = el => { for (let p = el, i = 0; p && i < 7; p = p.parentElement, i++) if (/cookie|ciasteczk|prywatno|zgod[ay]|consent|rodo|gdpr/i.test(p.innerText || '')) return true; return false; };
    const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
    const btns = [...document.querySelectorAll('button, [role="button"], a[role="button"], input[type="button"], input[type="submit"]')].filter(vis);
    const pick = re => btns.find(b => re.test((b.innerText || b.value || '').trim()) && about(b));
    const b = pick(REJ) || pick(ACC);
    if (!b) return null;
    b.click(); return (b.innerText || b.value || '').trim();
  }).catch(() => null);

  const view = (maxEls = 60) => serial(async () => {
    const pg = await browser.ensurePage();
    if (await dismissCookies(pg)) await new Promise(r => setTimeout(r, 600));
    await controller.refreshSnapshot().catch(() => { });
    const s = controller.snapshot || {}, els = (s.elements || []).slice();
    els.sort((a, b) => (b.inViewport - a.inViewport) || (a.top - b.top));
    const page = await browser.ensurePage();
    const text = await page.evaluate(() => (document.body?.innerText || '').replace(/\n{3,}/g, '\n\n').trim()).catch(() => '');
    return {
      page: pageInfo(),
      elements: els.slice(0, Math.min(Math.max(+maxEls || 60, 10), 150)).map(e => ({ id: e.id, role: e.role, text: String(e.text || '').slice(0, 80), ...(e.placeholder ? { placeholder: String(e.placeholder).slice(0, 60) } : {}), ...(e.inViewport ? {} : { below: true }) })),
      total: els.length,
      text: text.slice(0, 2500),
      pending: controller.pending ? policy.describe(controller.pending) : null,
      candidates: controller.candidates?.list?.map((c, i) => ({ n: i + 1, label: c.label })) || null
    };
  });

  const read = (maxChars = 4000) => serial(async () => {   // w serial(): refreshSnapshot w settle() równolegle z trwającym poleceniem = wyścig na migawce
    const page = await browser.ensurePage();
    const text = await page.evaluate(() => (document.body?.innerText || '').replace(/\n{3,}/g, '\n\n').trim()).catch(() => '');
    const n = Math.min(Math.max(+maxChars || 4000, 200), 20000);
    return { page: await settle(), text: text.slice(0, n), truncated: text.length > n };
  });

  const state = () => {
    const s = controller.uiState();
    return { page: pageInfo(), site: s.snapshot?.site, elements: s.snapshot?.elements?.length ?? 0, tabs: s.snapshot?.tabs || browser.tabInfo(), pending: s.pending, stats: s.stats, model: s.model };
  };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (req.headers.origin) return json(res, 403, { error: 'żądania ze stron są zabronione' });   // przeglądarkowy fetch/WebSocket z obcej strony
      const host = String(req.headers.host || '');
      const port = server.address().port;
      if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return json(res, 403, { error: 'zły nagłówek Host' });
      if (!safeEq(req.headers['x-bridge-token'] || '', token)) return json(res, 401, { error: 'unauthorized' });
      const route = req.method + ' ' + url.pathname;
      if (route === 'GET /agent/health') return json(res, 200, { ok: true, ...state() });
      if (route === 'GET /agent/state') return json(res, 200, state());
      if (route === 'GET /agent/read') return json(res, 200, await read(url.searchParams.get('max')));
      if (route === 'GET /agent/view') return json(res, 200, await view(url.searchParams.get('max')));
      if (req.method === 'POST') {
        const b = await readBody(req);
        if (url.pathname === '/agent/command') { const text = String(b.text || '').trim().slice(0, 400); if (!text) return json(res, 400, { error: 'brak text' }); return json(res, 200, await runCommand(text, b.timeoutMs)); }
        if (url.pathname === '/agent/confirm') return json(res, 200, await confirm(b.accept !== false));
        if (url.pathname === '/agent/goto') return json(res, 200, await goto(b.url));
        if (url.pathname === '/agent/pick') return json(res, 200, await pick(b.n));
        if (url.pathname === '/agent/play') return json(res, 200, await play(b.query));
        if (url.pathname === '/agent/media') return json(res, 200, await media(String(b.action || 'status')));
      }
      json(res, 404, { error: 'nie ma takiej ścieżki' });
    } catch (e) { json(res, e.status || 500, { error: String(e.message || e) }); }
  });
  await new Promise(r => server.listen(opts.port ?? 8788, opts.host || '127.0.0.1', r));
  const boundPort = server.address().port;

  return {
    server, controller, browser, port: boundPort,
    async close() { await new Promise(r => server.close(r)); await controller.close(); await browser.close().catch(() => { }); chrome?.stop(); }
  };
}

/* ---------- uruchomienie z linii poleceń ---------- */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  loadEnvFile(path.join(HOME, 'jev.env'));
  const a = process.argv.slice(2), arg = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  process.on('unhandledRejection', e => console.error('[web-agent] nieobsłużony błąd:', e?.message || e));
  createAgent({
    port: +(arg('--port') || process.env.JARVIS_WEB_PORT || 8788),
    headless: a.includes('--headless') || process.env.JARVIS_WEB_HEADLESS === '1',
    profileDir: process.env.JARVIS_WEB_PROFILE || undefined,
    startUrl: arg('--start-url') || process.env.JARVIS_WEB_START_URL || 'about:blank'
  }).then(ag => {
    console.error(`[web-agent] gotowy: http://127.0.0.1:${ag.port}/agent/*  ·  model ${ag.controller.stats.model}  ·  ${a.includes('--headless') ? 'headless' : 'okno widoczne'}`);
    const bye = async () => { await ag.close().catch(() => { }); process.exit(0); };
    process.on('SIGINT', bye); process.on('SIGTERM', bye);
  }).catch(e => { console.error('[web-agent] BŁĄD:', e.message); process.exit(1); });
}
