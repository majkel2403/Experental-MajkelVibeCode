/* =========================================================
   JARVIS OS — most do Hermesa (MCP)
   Hermes wywołuje natywne narzędzia mcp__jarvis_desktop__* → most (bridge/jarvis_bridge.py)
   → SSE do tej karty → wykonanie z Command Registry (walidacja, uprawnienia, Process Log)
   → koperta {ok, code, data, text} wraca do Hermesa jako wynik narzędzia.
   Po połączeniu karta wysyła mostowi schematy z rejestru, więc Hermes widzi te same narzędzia co silnik lokalny.
   ========================================================= */
'use strict';
(() => {
const S = () => J.state.settings;
const base = () => String(S().bridgeUrl || 'http://127.0.0.1:8651').replace(/\/+$/, '');
const auth = () => ({ 'Content-Type': 'application/json', 'X-Bridge-Token': S().bridgeToken });
let es = null, retry = 0, retryTimer = null, pollTimer = null, sig = '', myId = '';

J.bridge = { status: 'off', connected: false, tools: [], hermes: {}, checked: 0, connect, disconnect, refresh };
const set = st => { const ch = J.bridge.status !== st; J.bridge.status = st; J.bridge.connected = st === 'up'; if (ch) J.emit('bridge'); };

/* czy Hermes, z którym rozmawiamy, rzeczywiście używa mostu (profil = nazwa modelu) — wtedy tryb „auto” = MCP */
J.bridge.hermesUses = model => {
  const s = J.bridge.hermes[model]; return J.bridge.connected && s != null && s < 900;
};

async function refresh() {
  if (!J.bridge.connected || !S().bridgeToken) return;
  try {
    const r = await fetch(base() + '/bridge/status', { headers: auth(), signal: AbortSignal.timeout(5000) });
    if (r.ok) { const j = await r.json(); J.bridge.hermes = j.hermes || {}; J.bridge.agents = j.agents || null; J.bridge.tools = j.tools || J.bridge.tools; J.bridge.checked = Date.now(); J.emit('bridge'); }
  } catch (e) { /* most chwilowo niedostępny */ }
}

async function autoPair() {
  try {
    const r = await fetch(base() + '/bridge/pair', { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return false;
    const j = await r.json(); if (!j.token) return false;
    S().bridgeToken = j.token; J.save(); return true;
  } catch (e) { return false; }
}

/* schematy z rejestru → most (zapisuje je do bridge/tools.json; Hermes zobaczy zmiany po restarcie gatewaya) */
async function publishTools() {
  try {
    const tools = J.registry.tools().map(t => t.function);
    const r = await fetch(base() + '/bridge/tools', { method: 'POST', headers: auth(), body: JSON.stringify({ tools }) });
    const j = await r.json();
    /* most ma nowszą wersję Jarvisa niż ta karta (np. po wdrożeniu) — odśwież raz, gdy Jarvis nic nie robi; inaczej Hermes wołałby
       narzędzia, których ta karta nie zna */
    if (j.stale) {
      let done = false; try { done = sessionStorage.getItem('jarvis-stale-reload') === String(j.tools); } catch (e) { }
      if (!done) {
        try { sessionStorage.setItem('jarvis-stale-reload', String(j.tools)); } catch (e) { }
        J.toast?.('Jest nowsza wersja Jarvisa — odświeżam kartę', 4000);
        const go = () => (J.brain?.queue || busyNow()) ? setTimeout(go, 3000) : location.reload();
        setTimeout(go, 2500);
      } else J.log('Most: ta karta ma starszą wersję Jarvisa', 'Brakuje: ' + (j.missing || []).slice(0, 5).join(', ') + ' — odśwież stronę (Ctrl+F5)', 'warn');
    }
    if (j.changed) J.log('Most: zmieniona lista narzędzi', 'Zrestartuj gateway Hermesa (hermes\\start-desktop-gateway.bat), by zobaczył ' + j.tools + ' narzędzi', 'warn');
  } catch (e) { /* most starszej wersji albo chwilowo niedostępny */ }
}

/* Hermes jarvis-desktop bez ręcznej konfiguracji. Karta z ustawieniem domyślnym (:8642 bez klucza — to inny profil) albo z
   niedziałającym Hermesem sama bierze adres, model i klucz od mostu. Własnego wyboru (chmura, własny serwer) nie ruszamy. */
let hermesTried = 0;
async function ensureHermes(why) {
  const s = S();
  if (s.offlineMode || !S().bridgeToken || Date.now() - hermesTried < 60000) return false;
  if (!['agent', 'desktop', '', undefined].includes(s.hermesProvider)) return false;
  /* direct = karta rozmawia z gatewayem bezpośrednio, z kluczem w localStorage (sprzed 2026-10-04) — przejdź na most */
  const direct = !J.viaBridge?.(s.hermesUrl) && /\/\/(localhost|127\.0\.0\.1):8643\b/.test(s.hermesUrl || '');
  const unset = (!s.hermesKey && !J.viaBridge?.(s.hermesUrl)) || /:8642\b/.test(s.hermesUrl || '') || !s.hermesUrl || direct;
  if (!unset && J.hermes.status !== 'down') return false;
  hermesTried = Date.now();
  try {
    const r = await fetch(base() + '/bridge/hermes', { headers: auth(), signal: AbortSignal.timeout(5000) });
    if (!r.ok) return false;
    const j = await r.json(); if (!j.url || (!j.key && !j.proxy)) return false;
    const key = j.proxy ? '' : j.key;   // most-pośrednik: klucza nie ma i nie powinno być w przeglądarce
    if (s.hermesUrl === j.url && s.hermesKey === key && s.hermesModel === j.model && s.hermesOn) return false;
    Object.assign(s, { hermesProvider: j.preset || 'desktop', hermesUrl: j.url, hermesModel: j.model, hermesKey: key, hermesOn: true });
    J.save(); J.emit('settings'); J.brain?.reset?.();
    J.log('Hermes połączony automatycznie', 'Profil ' + j.model + ' (' + j.url + ') — ustawienie wzięte z mostu (' + why + ')', 'info');
    J.toast?.('Połączono z Hermesem (' + j.model + ')', 4000);
    J.hermesPing?.();
    return true;
  } catch (e) { return false; }
}
J.bridge.ensureHermes = ensureHermes;
J.on('hermes', () => { if (J.hermes.status === 'down' && J.bridge.connected) ensureHermes('Hermes nie odpowiadał'); });

const busyNow = () => !!document.querySelector('.orb.thinking, #orb.thinking') || J.orb?.state === 'thinking';

const safe = v => { try { return JSON.parse(JSON.stringify(v ?? null)); } catch (e) { return null; } };
/* karta w trybie podglądu (druga karta) ma wyłączony zapis — nie może wykonywać poleceń Hermesa, bo zmiana zniknęłaby po odświeżeniu */
const previewTab = () => J.tabChannel?.primary === false;
async function handle(cmd) {
  let r;
  if (previewTab()) {
    try { await fetch(base() + '/bridge/result', { method: 'POST', headers: auth(), body: JSON.stringify({ id: cmd.id, ok: false, code: 'OFFLINE', data: null, text: 'Ta karta Jarvis OS jest w trybie podglądu — polecenia wykonuje karta główna.' }) }); } catch (e) { }
    return;
  }
  J.bootEnter?.();   // karta stoi na ekranie „Kliknij, aby wejść” — wejdź, inaczej okno zgody jest niewidoczne pod zasłoną
  try { r = await J.brain.run(cmd.name, cmd.args || {}, { source: 'hermes', bridge: true }); }   // bridge: polecenie przyszło z mostu (Telegram/API), nie z czatu w tej karcie
  catch (e) { r = { ok: false, code: 'INTERNAL', text: 'Błąd pulpitu: ' + e.message, data: null }; }
  if (!J.brain.busy && !cmd.quiet) J.chat?.add('action', (r.ok ? '⚙ ' : '⚠ ') + 'Hermes (most): ' + cmd.name + ' → ' + r.text);   // quiet: testy E2E mostu — bez wpisów w czacie użytkownika
  try {
    await fetch(base() + '/bridge/result', { method: 'POST', headers: auth(), body: JSON.stringify({ id: cmd.id, ok: !!r.ok, code: r.code, data: safe(r.data), text: String(r.text ?? '') }) });
  } catch (e) { /* most zniknął — Hermes dostanie timeout */ }
}

/* zgłaszamy mostowi, czy ta karta jest widoczna — polecenia trafiają do aktywnej karty, nie do „najnowszej” */
const reportFocus = () => {
  if (!myId || !S().bridgeToken) return;
  fetch(base() + '/bridge/focus', { method: 'POST', headers: auth(), body: JSON.stringify({ client: myId, visible: document.visibilityState === 'visible' && document.hasFocus() && !previewTab() }) }).catch(() => { });
};
document.addEventListener('visibilitychange', reportFocus); addEventListener('focus', reportFocus); addEventListener('blur', reportFocus);
J.on('tab-role', reportFocus);   // karta przejęła rolę główną albo przeszła w podgląd (js/main.js)

function disconnect(quiet) {
  clearTimeout(retryTimer); clearInterval(pollTimer);
  if (es) { es.close(); es = null; }
  if (!quiet) set('off');
}

/* "Budzę się" — handshake do mostu, że karta właśnie startuje. Most czeka do WAKE_WAIT na prawdziwe połączenie SSE,
   więc pierwsze wywołanie MCP w tym oknie nie wyściga się z handshake. Bez tego → OFFLINE przy cold starcie. */
const reportWake = () => {
  if (!S().bridgeOn || !S().bridgeToken) return;
  fetch(base() + '/bridge/wake', { method: 'POST', headers: auth() }).catch(() => { });
};

async function connect() {
  disconnect(true);
  if (!S().bridgeOn) return set('off');
  if (!S().bridgeToken && !(await autoPair())) { set('down'); retryTimer = setTimeout(connect, Math.min(30000, 1500 * 2 ** Math.min(retry++, 5))); return; }
  set('connecting');
  reportWake();
  es = new EventSource(base() + '/bridge/events?token=' + encodeURIComponent(S().bridgeToken));
  es.addEventListener('hello', e => {
    retry = 0; try { const h = JSON.parse(e.data); J.bridge.tools = h.tools || []; myId = h.client || ''; } catch (er) { }
    reportFocus(); publishTools(); ensureHermes('start');
    set('up'); refresh(); clearInterval(pollTimer); pollTimer = setInterval(refresh, 20000);
    J.log('Most Hermes połączony', J.bridge.tools.length + ' narzędzi MCP dostępnych dla Hermesa', 'info');
  });
  es.addEventListener('cmd', e => { try { handle(JSON.parse(e.data)); } catch (er) { console.error(er); } });
  es.addEventListener('agent', e => { try { J.bridge.agentEvent(JSON.parse(e.data)); } catch (er) { console.error(er); } });
  es.addEventListener('workflow', e => { try { J.workflows?.onEvent(JSON.parse(e.data)); } catch (er) { console.error(er); } });   // przebiegi workflow z mostu (ADR 0007)
  es.onerror = async () => {
    if (es) { es.close(); es = null; }
    clearInterval(pollTimer); set('down');
    if (retry === 0 && S().bridgeToken) { const old = S().bridgeToken; S().bridgeToken = ''; if (await autoPair() && S().bridgeToken !== old) { retry = 0; return connect(); } S().bridgeToken = old; J.save(); }
    retryTimer = setTimeout(connect, Math.min(30000, 1500 * 2 ** Math.min(retry++, 5)));
  };
}

/* Zadania Hermesa spoza tej karty (Telegram, cron, CLI) — zdarzenia z wtyczki jarvis-events przez most (SSE „agent”).
   Zasilają tę samą magistralę co zadania z czatu (J.ev → Orb, HUD) i Process Log, więc pulpit pokazuje prawdziwą pracę agenta.
   Narzędzia pulpitu (mcp__jarvis_desktop__*) karta rejestruje sama przy wykonaniu — tu je pomijamy, żeby nie było duplikatów. */
const PLATFORM = { telegram: 'Telegram', cron: 'Cron', cli: 'Konsola', tui: 'Konsola' };
const remote = { id: null, proc: null, steps: new Map(), watchdog: null };
const remoteEnd = (status, result) => {
  if (!remote.id) return;
  clearTimeout(remote.watchdog);
  J.ev.emit(status === 'ok' ? 'task.completed' : status === 'abort' ? 'task.cancelled' : 'task.failed', { task_id: remote.id, result: String(result || '').slice(0, 300) }, 'hermes');
  if (remote.proc && J.proc.current === remote.proc) J.proc.end(status, result || '');
  remote.id = null; remote.proc = null; remote.steps.clear();
};
J.bridge.agentEvent = e => {
  if (!e || typeof e.type !== 'string' || typeof e.task_id !== 'string') return;
  if (e.type === 'task.created') {
    if (remote.id) remoteEnd('abort', 'Zastąpione nowym zadaniem');
    if (J.brain?.busy || J.proc.active) return;   // trwa zadanie z czatu tej karty — nie mieszamy dwóch zadań na jednym Orbie
    remote.id = e.task_id;
    const where = PLATFORM[e.platform] || 'Hermes', title = String(e.title || 'Zadanie').slice(0, 160);
    remote.proc = J.proc.start(where + ': ' + title);
    J.ev.emit('task.created', { task_id: e.task_id, title, source: e.platform || 'hermes' }, 'hermes');
  } else if (e.task_id !== remote.id) return;
  /* w międzyczasie ruszyło zadanie z czatu tej karty i przejęło Orb oraz Process Log — dalsze kroki zadania z Telegrama trafiałyby
     do niego (test na żywo 2026-10-04: „patch” i „execute_code” z rozmowy na Telegramie w zadaniu „Zamknij widgety”) */
  if (remote.proc && J.proc.current !== remote.proc) { clearTimeout(remote.watchdog); remote.id = null; remote.proc = null; remote.steps.clear(); return; }
  clearTimeout(remote.watchdog);
  remote.watchdog = setTimeout(() => remoteEnd('abort', 'Brak wieści od Hermesa (10 min) — zadanie mogło zostać przerwane'), 600000);
  remote.watchdog?.unref?.();   // Node (testy): zegar czuwania nie trzyma procesu; w przeglądarce bez znaczenia
  if (e.type === 'tool.started' || e.type === 'tool.completed' || e.type === 'tool.failed') {
    const tool = String(e.tool || 'narzędzie');
    if (tool.startsWith('mcp__jarvis_desktop__')) return;
    const key = e.call_id || tool;
    if (e.type === 'tool.started') {
      J.ev.emit('tool.started', { task_id: remote.id, tool, source: 'hermes' }, 'hermes');
      remote.steps.set(key, J.proc.step('server', tool + (e.label ? ' — ' + e.label : ''), [['Narzędzie', tool], ...(e.label ? [['Argument', e.label]] : [])], { running: true }));
    } else {
      J.ev.emit(e.type, { task_id: remote.id, tool, source: 'hermes', code: e.type === 'tool.failed' ? 'ERROR' : 'OK' }, 'hermes');
      const st = remote.steps.get(key); remote.steps.delete(key);
      if (e.type === 'tool.failed') st?.fail(e.error || 'błąd narzędzia'); else st?.done(e.ms != null ? [['Czas', J.fmtDur(e.ms)]] : null);
    }
  } else if (e.type === 'task.completed' || e.type === 'task.failed') {
    if (e.result && remote.proc) J.proc.step('reply', 'Odpowiedź Hermesa', [['Treść', e.result]], { preview: String(e.result).slice(0, 70) });
    remoteEnd(e.type === 'task.completed' ? 'ok' : 'err', e.result || '');
  }
};

/* zgłaszamy mostowi, czy ta karta jest widoczna — polecenia trafiają do aktywnej karty, nie do „najnowszej" */
J.on('settings', () => { const n = [S().bridgeOn, S().bridgeUrl, S().bridgeToken].join('|'); if (n !== sig) { sig = n; connect(); } });
sig = [S().bridgeOn, S().bridgeUrl, S().bridgeToken].join('|');
/* Wyślij /bridge/wake OD RAZU (przed setTimeout(connect, 600)) — bridge ma 4 s na SSE handshake,
   więc już pierwsze wywołanie MCP po otwarciu karty nie wyściga się. Bez tego: race 0.4-1.2 s OFFLINE
   na zimnym starcie Edge (drill t_93ab5e70). */
reportWake();
setTimeout(connect, 600);
})();
