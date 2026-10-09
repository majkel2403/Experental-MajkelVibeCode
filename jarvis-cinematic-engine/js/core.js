/* =========================================================
   JARVIS OS — rdzeń: narzędzia, stan, dźwięk, głos, okna
   ========================================================= */
'use strict';
const J = window.J = {};

/* ---------- narzędzia ---------- */
J.$ = (sel, root = document) => root.querySelector(sel);
J.$$ = (sel, root = document) => [...root.querySelectorAll(sel)];
J.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
J.h = (tag, attrs = {}, html = '') => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  if (html) e.innerHTML = html;
  return e;
};
J.uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
J.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
J.pad = n => String(n).padStart(2, '0');
/* wspólne pomocniki (wcześniej powielone w apps.js/widgets.js i ai.js/process.js) */
J.mdLite = t => J.esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');   // **pogrubienie** i `kod` w bezpiecznym HTML
J.fmtDur = ms => ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(ms < 10000 ? 2 : 1) + ' s';
J.hhmm = (d = new Date()) => J.pad(d.getHours()) + ':' + J.pad(d.getMinutes());
/* zdejmuje cudzysłowy obejmujące cały tekst: „sprawdzić logi” → sprawdzić logi (cudzysłów w środku zostaje) */
J.unquote = t => { const s = String(t ?? '').trim(), m = /^[„"“”'«‚]+([^„"“”«»]*?)[”"“'»‘’]+$/.exec(s); return m && m[1].trim() ? m[1].trim() : s; };
J.today = () => { const d = new Date(); return d.getFullYear() + '-' + J.pad(d.getMonth() + 1) + '-' + J.pad(d.getDate()); };
J.fmtMoney = v => v >= 1000 ? '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : v >= 1 ? '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '$' + v.toPrecision(4);
J.pl = (n, one, few, many) => n === 1 ? one : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? few : many;   // polskie liczby mnogie
J.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
J.rgb = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(','); };

/* ---------- ikony (SVG, obrys) ---------- */
const P = {
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/>',
  notes: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  market: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-7"/><path d="M16 7h4v4"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h2M14 14h2M8 18h2"/>',
  monitor: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  terminal: '<path d="m4 17 6-5-6-5M12 19h8"/>',
  weather: '<path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.8A6 6 0 1 0 6 16.4"/><path d="M8 19h9.5"/>',
  calc: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h4"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M10 2h4M12 2v3"/>',
  settings: '<path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  apps: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
  focus: '<circle cx="12" cy="12" r="3"/><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>',
  sound: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  mute: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  min: '<path d="M5 12h14"/>',
  max: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  spark: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  pin: '<path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3z"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
  flow: '<circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M7 6h10M6.2 7.8l4.6 8.4M17.8 7.8l-4.6 8.4"/>',
  wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10.5 10.5 0 0 1 14 0M8.5 16a5.5 5.5 0 0 1 7 0"/><path d="M12 19.5h.01"/>',
  screen: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  grid: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>'
};
J.icon = (name, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${P[name] || P.star}</svg>`;

/* ---------- stan (localStorage) ---------- */
const KEY = 'jarvis-os:v2';
const DEFAULTS = () => ({
  settings: {
    accent: '#33d6ff', accent2: '#a25cff', look: 4, wall: 'photo', particles: true, sound: true,
    speech: true, voiceName: '',
    hermesOn: true, hermesProvider: 'agent', hermesUrl: 'http://localhost:8642/v1', hermesKey: '', hermesModel: 'hermes-agent', toolFormat: 'auto', hermesMode: 'auto',
    bridgeOn: true, bridgeUrl: 'http://127.0.0.1:8651', bridgeToken: '', city: 'Wrocław', lat: 51.1079, lon: 17.0385,
    user: 'JD', skipBoot: false,
    proactive: 'quiet', proactiveMax: 4, wakeWord: false, quietFrom: '', quietTo: '', briefingTime: '', summaryTime: '', silentVoice: false,
    openrouterKey: '', jevOn: false, jevKey: '', jevModel: 'typesafe/jev-1.13', jevUrl: '', jevExecute: .85, jevAsk: .5, jevDestructive: .8, jevInterrupt: .6, jevVerify: .4, jevPrivacy: 'P1', jevA3: .8, jevA2: .92, jevBudget: 5, jevAutonomy: 'auto', jevFast: true, jevShadow: false, jevLogText: false, hermesModelLite: '',
    uiScale: 100, fxLevel: 'standard', minimap: false, startMode: 'work', filmOn: true, filmScen: { telegram: 'auto', cron: 'auto', chat: 'auto' }, volume: 60, speechRate: 1, sttLang: 'pl-PL', units: { temp: 'C', wind: 'kmh' }, notif: {}, keys: {}, layoutStartup: 'none', watchlist: ['BTC', 'ETH', 'SOL', 'BNB'], favCities: [], dockOrder: [], hermesPreset: 'balanced', hermesDailyBudget: 0, offlineMode: false, wfFilm: 'ask', flags: {}
  },
  notes: [
    { id: J.uid(), title: 'Projekty Jarvis OS', body: '• Wirtualne środowisko użytkownika\n• Jarvis steruje pulpitem i aplikacjami\n• Tworzenie skrótów z poleceń\n• Widgety jako żywe obiekty\n• Orb = wizualny stan systemu', ts: Date.now() }
  ],
  tasks: [],   // bez przykładowych zadań o stałych godzinach: uruchomione wieczorem od razu ogłaszały „zaległe”
  shortcuts: [],
  log: [],
  history: [],
  widgets: [],
  alerts: [],
  notifs: [],
  layouts: {},
  ui: { chatClosed: true, logPinned: false, deckMin: false, allowAlways: [], routinesRun: {}, recent: [], onboarded: false },
  winPos: {},
  stats: { actions: 0 }
});
const STATE_VERSION = 3;
const MIGRATIONS = [
  /* v1→v2 */ s => { delete s.settings.apiKey; delete s.settings.model; },
  /* v2→v3 */ s => { if (s.settings.look !== 4) { s.settings.look = 4; if (['#21d9ff', '#3d8bff'].includes(s.settings.accent)) { s.settings.accent = '#33d6ff'; s.settings.accent2 = '#a25cff'; } } }
];
J.state = (() => {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { /* brak dostępu do storage */ }
  let s = null;
  try { s = JSON.parse(raw || 'null'); } catch (e) {
    if (raw) { try { localStorage.setItem(KEY + ':broken:' + Date.now(), raw.slice(0, 8000)); } catch (e2) { } }
    J.__stateBroken = true;   // J.toast jeszcze nie istnieje w tym momencie — ostrzeżenie pokaże main.js po starcie UI
  }
  const d = DEFAULTS();
  if (!s) return d;
  const ver = s._v || 1;
  MIGRATIONS.slice(ver - 1).forEach(fn => { try { fn(s); } catch (e) { } });
  s._v = STATE_VERSION;
  s.settings = Object.assign(d.settings, s.settings || {});
  for (const k of ['notes', 'tasks', 'shortcuts', 'log', 'history', 'widgets', 'alerts', 'notifs']) if (!Array.isArray(s[k])) s[k] = d[k];
  s.ui = Object.assign(d.ui, s.ui || {}); s.winPos = s.winPos || {}; s.stats = s.stats || { actions: 0 }; s.layouts = s.layouts && typeof s.layouts === 'object' ? s.layouts : {};
  return s;
})();
/* Zapis stanu. Historia Process Log jest duża, więc leży osobno (IndexedDB, J.saveHistory) i nie zapycha
   głównego klucza. Gdy przeglądarka odmówi zapisu (brak miejsca / tryb prywatny), nie kończy się to po cichu:
   najpierw zwalniamy odtwarzalne dane i próbujemy jeszcze raz, a jeśli i to zawiedzie — użytkownik dostaje ostrzeżenie. */
J.saveNow = () => {
  // historia zostaje w głównym kluczu tylko do czasu, aż bezpiecznie trafi do IndexedDB (J.historyMigrated)
  const write = slim => localStorage.setItem(KEY, JSON.stringify({ ...J.state, history: (J.historyMigrated || slim) ? [] : (J.state.history || []) }));
  try { write(false); J.saveFailed = false; return true; } catch (e) { /* spróbujemy zwolnić miejsce */ }
  try { J.state.notifs.length = Math.min(J.state.notifs.length, 20); J.state.log = []; write(true); J.saveFailed = false; return true; } catch (e) { /* nadal nie */ }
  if (!J.saveFailed) { J.saveFailed = true; J.toast?.('⚠ Nie mogę zapisać danych w przeglądarce (brak miejsca albo tryb prywatny). Zmiany znikną po zamknięciu karty — wyeksportuj dane w Ustawieniach.', 10000); }
  return false;
};
J.save = J.debounce(() => J.saveNow(), 250);
J.DEFAULTS = () => DEFAULTS();
/* tryb bez sieci: żadnych zapytań poza tę stronę (Ustawienia → Interfejs) */
{ const f0 = window.fetch; if (typeof f0 === 'function') window.fetch = (u, o) => { const url = String(u?.url || u); if (J.state?.settings?.offlineMode && /^(https?|wss?):/i.test(url) && !url.startsWith(location.origin)) return Promise.reject(new TypeError('Tryb bez sieci jest włączony')); return f0.call(window, u, o); }; }
/* ostatnia prawdziwa aktywność użytkownika w tej karcie (zgoda z rozmowy: fokus okna nie dowodzi, że ktoś przy nim siedzi —
   okno bywa na pierwszym planie po manewrach agenta albo przy pustym biurku). 0 = od otwarcia karty nikt jej nie dotknął. */
J.lastInput = 0;
{ let t = 0; const mark = () => { const n = Date.now(); if (n - t > 1000) { t = n; J.lastInput = n; } };
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove']) addEventListener(ev, mark, { passive: true, capture: true }); }
J.userActive = (ms = 120000) => J.lastInput > 0 && Date.now() - J.lastInput < ms;
/* BroadcastChannel — inicjalizowany w main.js po bootowaniu aplikacji */
J.tabChannel = { primary: true, claim: () => {}, release: () => {} };
/* flagi funkcji (Ustawienia → O programie → Eksperymenty): domyślnie włączone */
J.flag = k => (J.state.settings.flags || {})[k] !== false;
J.saveHistory = J.debounce(() => { try { J.store.set('proc.history', J.state.history); } catch (e) { /* historia jest pomocnicza */ } }, 400);
/* Konfiguracja z zewnątrz (klucze i ustawienia bez wpisywania w UI):
   1) window.JARVIS_CONFIG z pliku config.local.js (ignorowany przez git, tylko lokalnie);
   2) jednorazowo z adresu: index.html?jevKey=sk-or-…&jevOn=1&hermesKey=… — parametry są zapisywane i usuwane z paska adresu.
   Dozwolone klucze ustawień: tylko z listy poniżej. */
J.bootstrapConfig = () => {
  const ALLOW = ['openrouterKey', 'jevKey', 'jevOn', 'jevModel', 'jevPrivate', 'jevPrivacy', 'jevBudget', 'jevAutonomy', 'jevShadow', 'hermesKey', 'hermesOn', 'hermesUrl', 'hermesModel', 'hermesProvider', 'hermesMode', 'bridgeOn', 'bridgeUrl', 'city', 'user', 'wakeWord', 'proactive', 'briefingTime', 'summaryTime', 'skipBoot'];
  const BOOL = ['jevOn', 'jevPrivate', 'hermesOn', 'bridgeOn', 'wakeWord', 'skipBoot'];
  const apply = (src, from) => { let n = 0; for (const [k, v] of Object.entries(src || {})) { if (!ALLOW.includes(k) || v == null || v === '') continue; J.state.settings[k] = BOOL.includes(k) ? /^(1|true|tak|on|yes)$/i.test(String(v)) : String(v); n++; } if (n) { J.save(); J.configuredFrom = from; } return n; };
  let n = 0;
  try { if (window.JARVIS_CONFIG) n += apply(window.JARVIS_CONFIG, 'config.local.js'); } catch (e) { }
  try {
    /* Zalecane: fragment po znaku # (index.html#jevKey=…) — przeglądarka NIE wysyła go do serwera strony.
       Stary sposób (?jevKey=…) nadal działa, ale adres z „?” trafia do serwera hostingu, więc dajemy ostrzeżenie. */
    const u = new URL(location.href); const src = {}; let hit = false, viaQuery = false, viaHash = false;
    const hp = new URLSearchParams(String(u.hash || '').replace(/^#/, ''));
    for (const k of ALLOW) {
      if (hp.has(k)) { src[k] = hp.get(k); hp.delete(k); hit = viaHash = true; }
      if (u.searchParams.has(k)) { src[k] = u.searchParams.get(k); u.searchParams.delete(k); hit = viaQuery = true; }
    }
    if (hit) {
      n += apply(src, 'url'); if ((src.jevKey || src.openrouterKey) && src.jevOn == null) { J.state.settings.jevOn = true; J.save(); }
      if (viaQuery && (src.jevKey || src.openrouterKey || src.hermesKey)) J.configViaQuery = true;
      if (viaHash) u.hash = hp.toString() ? '#' + hp.toString() : '';
      history.replaceState?.(null, '', u.pathname + (u.search || '') + (u.hash || ''));
    }
  } catch (e) { }
  return n;
};
J.bootstrapConfig();
J.resetAll = () => { try { localStorage.removeItem(KEY); } catch (e) { } location.reload(); };

/* ---------- zdarzenia ---------- */
const bus = {};
J.on = (ev, fn) => { (bus[ev] = bus[ev] || []).push(fn); return () => { bus[ev] = bus[ev].filter(f => f !== fn); }; };
J.emit = (ev, data) => (bus[ev] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } });

/* ---------- dźwięk (Web Audio, syntezowany) ---------- */
J.sfx = (() => {
  let ctx = null;
  const ac = () => { if (!ctx) { const A = window.AudioContext || window.webkitAudioContext; if (A) ctx = new A(); } if (ctx && ctx.state === 'suspended') ctx.resume(); return ctx; };
  /* głośność 0–100 %, wyciszenie w ciszy nocnej i w trybie prezentacji (alarm minutnika gra zawsze) — docs/spec/09-wyglad-stany.md §8 */
  let forced = false;
  const muted = () => !J.state.settings.sound || (!forced && (J.uiMode?.get?.() === 'present' || !!J.signals?.quietNow?.()));
  const gain = () => J.clamp((J.state.settings.volume ?? 60) / 60, 0, 1.67);
  const tone = (f, dur = .12, type = 'sine', vol = .06, delay = 0, slide = 0) => {
    if (muted()) return; const c = ac(); if (!c) return; vol *= gain(); if (vol <= 0) return;
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + .05);
  };
  return {
    unlock: ac,
    click: () => tone(1800, .04, 'sine', .025),
    open: () => { tone(520, .12, 'sine', .045, 0, 880); tone(1320, .08, 'triangle', .02, .06); },
    close: () => tone(700, .12, 'sine', .04, 0, 320),
    notify: () => { tone(880, .12, 'sine', .05); tone(1320, .18, 'sine', .05, .1); },
    alarm: () => { forced = true; try { for (let i = 0; i < 6; i++) { tone(1046, .12, 'square', .03, i * .25); tone(1318, .12, 'square', .03, i * .25 + .12); } } finally { forced = false; } },
    /* dźwięk powiadomienia wg kanału (Ustawienia → Powiadomienia: „dźwięk”) */
    forKind: kind => { const ch = J.notifChannel ? J.notifChannel(kind) : { on: true, sound: true }; if (!ch.on || !ch.sound) return false; (kind === 'timer' ? J.sfx.signal : J.sfx.notify)(); return true; },
    muted,
    error: () => { tone(220, .18, 'sawtooth', .04); tone(160, .25, 'sawtooth', .04, .12); },
    listen: () => { tone(660, .08, 'sine', .05); tone(990, .1, 'sine', .05, .08); },
    boot: () => {
      tone(55, 1.6, 'sine', .12, 0, 110); tone(110, 1.4, 'triangle', .04, .1, 220);
      [523, 659, 784, 1046].forEach((f, i) => tone(f, .5, 'sine', .035, .5 + i * .12));
    },
    type: () => tone(2400 + Math.random() * 600, .015, 'square', .008),
    success: () => { tone(660, .09, 'sine', .04); tone(880, .1, 'sine', .04, .07); tone(1320, .22, 'sine', .035, .14); },
    signal: () => { tone(740, .1, 'triangle', .035); tone(988, .16, 'triangle', .03, .11); },
    ask: () => { tone(880, .1, 'sine', .04); tone(1108, .18, 'sine', .04, .1); tone(1320, .2, 'sine', .03, .2); },
    confirm: () => { tone(523, .1, 'sine', .04); tone(392, .16, 'sine', .04, .1); },
    wake: () => { tone(1046, .08, 'sine', .04); tone(1568, .16, 'sine', .035, .07); },
    pause: () => { tone(440, .14, 'triangle', .035); tone(330, .2, 'triangle', .03, .12); },
    tick: () => tone(1500, .03, 'sine', .02),
    snap: () => tone(300, .06, 'sine', .03, 0, 600)
  };
})();

/* ---------- głos: synteza mowy (kolejka z priorytetami, barge-in) ---------- */
J.voice = (() => {
  const synth = window.speechSynthesis;
  let voices = [], queue = [], current = null;
  const load = () => { voices = synth ? synth.getVoices() : []; };
  if (synth) { load(); synth.onvoiceschanged = load; }
  const pick = () => { const want = J.state.settings.voiceName; return voices.find(v => v.name === want) || voices.find(v => /pl/i.test(v.lang) && /google|natural|online/i.test(v.name)) || voices.find(v => /^pl/i.test(v.lang)) || null; };
  const clean = t => String(t).replace(/[*_`#>]/g, '').replace(/https?:\/\/\S+/g, 'link').replace(/[⚙⚠⛔⏹🔊📈⏰✓✦◈]/g, '').slice(0, 900);
  const next = () => {
    if (current || !queue.length || !synth) return;
    const it = queue.shift(); current = it;
    const u = new SpeechSynthesisUtterance(it.text);
    const v = pick(); if (v) u.voice = v; u.lang = v ? v.lang : 'pl-PL'; u.rate = 1.04 * J.clamp(+J.state.settings.speechRate || 1, .7, 1.5); u.pitch = .92; u.volume = J.clamp((J.state.settings.volume ?? 60) / 60, 0, 1);
    u.onstart = () => { api.speaking = true; J.orb.set('speaking'); J.emit('voice', true); };
    u.onend = u.onerror = () => { current = null; api.speaking = false; if (!queue.length) { J.orb.set('idle'); J.emit('voice', false); } it.resolve(); setTimeout(next, 120); };
    synth.speak(u);
  };
  const api = {
    supported: !!synth, speaking: false,
    list: () => voices.filter(v => /^pl/i.test(v.lang)).concat(voices.filter(v => !/^pl/i.test(v.lang))),
    /* priority: 0 = niski (czeka), 1 = normalny, 2 = wysoki (przerywa bieżącą wypowiedź) */
    speak(text, o = {}) {
      const t = clean(text || '').trim();
      if (!synth || !t || (!J.state.settings.speech && !o.force)) return Promise.resolve();
      return new Promise(resolve => {
        const it = { text: t, priority: o.priority ?? 1, resolve };
        if (it.priority >= 2 && current) { queue.unshift(it); synth.cancel(); return; }   // onend bieżącej uruchomi next()
        if (o.replace) { queue = queue.filter(q => q.priority >= 2); }
        queue.push(it); queue.sort((a, b) => b.priority - a.priority); next();
      });
    },
    stop() { queue.forEach(q => q.resolve()); queue = []; if (synth) synth.cancel(); current = null; api.speaking = false; J.emit('voice', false); },
    get pending() { return queue.length; }
  };
  return api;
})();

/* ---------- głos: rozpoznawanie mowy (pojedyncze + czuwanie ze słowem wybudzającym) ---------- */
J.ear = (() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, active = false, stream = null, srec = null, standby = false, restartT = null, answerCb = null;
  const api = { supported: !!SR, active: false, standby: false, analyser: null };
  const WAKE = /^(?:hej |ok |okej |okay |halo )?(?:jarvis|dzarvis|dżarwis|jarwis|jarvisie|dżarwisie|jarwisie)[,!.]?\s*(.*)$/i;
  const startAnalyser = async () => {
    try {
      if (stream || !navigator.mediaDevices?.getUserMedia) return;
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const c = J.sfx.unlock(); if (!c) return;
      const src = c.createMediaStreamSource(stream);
      const an = c.createAnalyser(); an.fftSize = 256; src.connect(an); api.analyser = an;
    } catch (e) { /* brak zgody — orb pokaże animację zastępczą */ }
  };
  const stopAnalyser = () => { if (standby) return; if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; api.analyser = null; };
  /* odpowiedź na pytanie Jarvisa (J.ask) — następna wypowiedź trafia tu zamiast do poleceń */
  api.expectAnswer = cb => { answerCb = cb; };
  const deliver = t => { if (answerCb) { const cb = answerCb; answerCb = null; cb(t); return true; } return false; };
  api.stop = () => { if (rec) try { rec.stop(); } catch (e) { } };
  api.toggle = () => active ? api.stop() : api.start();
  api.start = (o = {}) => {
    if (!SR) { J.toast('Twoja przeglądarka nie obsługuje rozpoznawania mowy — użyj Chrome lub Edge'); J.sfx.error(); return; }
    if (active) return;
    J.voice.stop();
    if (srec) { try { srec.abort(); } catch (e) { } }
    rec = new SR(); rec.lang = J.state.settings.sttLang || 'pl-PL'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    let finalText = '';
    rec.onstart = () => { active = api.active = true; J.sfx.listen(); J.orb.set('listening', o.answer ? 'słucham odpowiedzi…' : 'słucham…'); J.emit('ear', true); startAnalyser(); };
    rec.onresult = e => { let interim = ''; for (let i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) finalText += e.results[i][0].transcript; else interim += e.results[i][0].transcript; } J.orb.banner('„' + (finalText + interim).trim() + '”'); };
    rec.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { J.toast('Brak dostępu do mikrofonu — zezwól w ustawieniach przeglądarki'); api.setStandby(false); } else if (e.error !== 'no-speech' && e.error !== 'aborted') J.toast('Błąd rozpoznawania mowy: ' + e.error); };
    rec.onend = () => {
      active = api.active = false; stopAnalyser(); J.emit('ear', false);
      const t = finalText.trim();
      if (t && deliver(t)) { J.orb.set('idle'); J.orb.banner(null); }
      else if (t) { const m = WAKE.exec(t); J.emit('voice-command', m && m[1] ? m[1] : t); }
      else { J.orb.set('idle'); J.orb.banner(null); if (o.answer) deliver(''); }
      if (standby) restart(400);
    };
    try { rec.start(); } catch (e) { J.toast('Nie udało się uruchomić mikrofonu'); }
  };
  /* czuwanie: nasłuch ciągły; polecenie = wypowiedź zaczynająca się od „Jarvis” */
  const restart = ms => { clearTimeout(restartT); if (!standby) return; restartT = setTimeout(() => { if (standby && !active) startStandby(); }, ms); };
  const startStandby = () => {
    if (!SR || active) return;
    try { srec = new SR(); } catch (e) { return; }
    srec.lang = J.state.settings.sttLang || 'pl-PL'; srec.interimResults = true; srec.continuous = true; srec.maxAlternatives = 1;
    let heard = '';
    srec.onstart = () => { startAnalyser(); J.emit('ear-standby', true); };
    srec.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript.trim();
        if (!e.results[i].isFinal) { if (WAKE.test(t) && !heard) { heard = 'x'; J.sfx.wake(); J.orb.set('listening', 'słucham…'); } continue; }
        heard = '';
        if (deliver(t)) continue;
        const m = WAKE.exec(t); if (!m) { if (J.orb.state === 'listening') J.orb.set('idle'); continue; }
        const cmd = m[1].trim();
        if (!cmd) { J.sfx.wake(); J.orb.set('listening', 'tak?'); api.expectAnswer(a => { if (a) J.emit('voice-command', a); else J.orb.set('idle'); }); continue; }
        J.emit('voice-command', cmd);
      }
    };
    srec.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { api.setStandby(false); J.toast('Czuwanie wyłączone — brak dostępu do mikrofonu'); } };
    srec.onend = () => { srec = null; J.emit('ear-standby', false); restart(600); };
    try { srec.start(); } catch (e) { restart(3000); }
  };
  api.setStandby = on => {
    standby = api.standby = !!on && !!SR; J.state.settings.wakeWord = standby; J.save();
    if (standby) { startStandby(); J.toast('Czuwanie: powiedz „Jarvis, …”'); } else { clearTimeout(restartT); if (srec) { try { srec.abort(); } catch (e) { } srec = null; } stream?.getTracks().forEach(t => t.stop()); stream = null; api.analyser = null; J.emit('ear-standby', false); }
    J.emit('settings');
  };
  document.addEventListener('visibilitychange', () => { if (standby && !document.hidden && !srec && !active) restart(300); });
  return api;
})();

/* ---------- toasty ---------- */
J.toast = (text, ms = 2600) => {
  const box = J.$('#toasts'); if (!box) return;
  J.lastToastAt = Date.now();
  const t = J.h('div', { class: 'toast' }, '<i></i><span></span>');
  t.querySelector('span').textContent = text;
  box.appendChild(t);
  while (box.children.length > 2) box.firstElementChild.remove();   // najwyżej dwa naraz — stos powiadomień zasłaniał interfejs
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, ms);
};

/* ---------- orb / stan asystenta ---------- */
J.orb = (() => {
  let state = 'idle', bannerTimer;
  const labels = { idle: 'centrum środowiska', listening: 'słucham', thinking: 'analizuję', speaking: 'mówię', alert: 'uwaga' };
  return {
    get state() { return state; },
    set(s, bannerText) {
      state = s;
      const w = J.$('#coreWrap'); if (w) w.dataset.state = s;
      const cs = J.$('#coreState'); if (cs) cs.textContent = labels[s] || s;
      if (bannerText !== undefined) this.banner(bannerText);
      if (s === 'idle') { clearTimeout(bannerTimer); bannerTimer = setTimeout(() => this.banner(null), 2600); }
    },
    banner(text) {
      const b = J.$('#task'); if (!b) return;
      clearTimeout(bannerTimer);
      if (!text) { b.classList.remove('show'); return; }
      J.$('#taskText').textContent = text; b.classList.add('show');
    }
  };
})();

/* ---------- akcent kolorystyczny ---------- */
J.applyScale = () => { try { document.documentElement.style.setProperty('--ui-scale', String(J.clamp((+J.state.settings.uiScale || 100) / 100, .8, 1.3))); } catch (e) { } };
J.applyTheme = () => {
  const s = J.state.settings, r = document.documentElement.style;
  J.applyScale();
  r.setProperty('--accent', s.accent); r.setProperty('--accent-rgb', J.rgb(s.accent));
  r.setProperty('--accent2', s.accent2); r.setProperty('--accent2-rgb', J.rgb(s.accent2));
  const app = J.$('#app'); if (app) app.dataset.wall = s.wall;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', '#03060f');
};
J.THEMES = {
  jarvis: ['#33d6ff', '#a25cff'], cyjan: ['#21d9ff', '#39e59a'], niebieski: ['#3d8bff', '#21d9ff'], fiolet: ['#b07cff', '#ff5ec4'],
  zielony: ['#39e59a', '#21d9ff'], złoty: ['#ffc24d', '#ff6a3d'], czerwony: ['#ff4d6d', '#ffb84d'], różowy: ['#ff5ec4', '#9a63ff']
};

/* ---------- menedżer okien ---------- */
J.apps = {};           // rejestr aplikacji: id -> {title, icon, w, h, mount(body, ctx)}
J.wm = (() => {
  const open = {};      // id -> {el, cleanups, minimized, pinned}
  let z = 30, zp = 10000, cascade = 0;
  const MIN_W = 280, MIN_H = 180;
  const minOf = id => { const a = J.apps[id] || {}; return { w: a.minW || MIN_W, h: a.minH || MIN_H }; };
  const closedStack = () => (J.state.ui.closedStack = J.state.ui.closedStack || []);
  const desk = () => J.$('#desktop');
  const isMobile = () => innerWidth <= 640;

  const savePos = (id, el) => {
    if (el.classList.contains('max') || isMobile()) return;
    J.state.winPos[id] = { ...(J.state.winPos[id] || {}), x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight, pin: !!open[id]?.pinned }; J.save();
  };
  const focus = id => {
    const w = open[id]; if (!w) return;
    w.el.style.zIndex = w.pinned ? ++zp : ++z;
    J.$$('.window.focused').forEach(e => e.classList.remove('focused'));
    w.el.classList.add('focused');
    J.emit('wm');
  };
  const place = (id, el, app) => {
    const d = desk().getBoundingClientRect();
    const p = J.state.winPos[id];
    let w = p?.w || app.w || 380, h = p?.h || app.h || 320, x, y;
    w = Math.min(w, d.width - 20); h = Math.min(h, d.height - 100);
    if (p) { x = p.x; y = p.y; }
    else { x = Math.max(100, d.width / 2 - w / 2 + (cascade % 6 - 2.5) * 34); y = Math.max(12, d.height / 2 - h / 2 - 30 + (cascade % 6 - 2.5) * 26); cascade++; }
    x = J.clamp(x, 0, Math.max(0, d.width - w)); y = J.clamp(y, 0, Math.max(0, d.height - h - 80));
    Object.assign(el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
  };
  /* przyciąganie do innych okien (docs/spec/04-okna.md §5): próg 10 px, krawędzie zewnętrzne i wyrównanie */
  const EDGE = 10;
  const edgeSnap = (id, x, y, w, h) => {
    let bx = null, by = null, dxBest = EDGE + 1, dyBest = EDGE + 1;
    Object.entries(open).forEach(([oid, o]) => {
      if (oid === id || o.minimized || o.el.classList.contains('max')) return;
      const L = o.el.offsetLeft, T = o.el.offsetTop, R = L + o.el.offsetWidth, B = T + o.el.offsetHeight;
      const vOverlap = y < B + EDGE && y + h > T - EDGE, hOverlap = x < R + EDGE && x + w > L - EDGE;
      if (vOverlap) [[R, x], [L - w, x], [L, x], [R - w, x]].forEach(([cand]) => { const dd = Math.abs(cand - x); if (dd < dxBest) { dxBest = dd; bx = cand; } });
      if (hOverlap) [[B, y], [T - h, y], [T, y], [B - h, y]].forEach(([cand]) => { const dd = Math.abs(cand - y); if (dd < dyBest) { dyBest = dd; by = cand; } });
    });
    return { x: bx ?? x, y: by ?? y, hit: bx != null || by != null };
  };
  const drag = (id, el, handle, mode, edge = 'se') => {
    handle.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('.win-actions')) return;
      if (isMobile()) return;   // na telefonie okna zajmują cały ekran
      e.preventDefault(); focus(id);
      const d = desk().getBoundingClientRect();
      if (mode === 'move' && el.classList.contains('max')) {
        const ratio = (e.clientX - d.left) / d.width;
        el.classList.remove('max');
        el.style.left = (e.clientX - d.left - el.offsetWidth * ratio) + 'px'; el.style.top = (e.clientY - d.top - 20) + 'px';
      }
      const sx = e.clientX, sy = e.clientY, ox = el.offsetLeft, oy = el.offsetTop, ow = el.offsetWidth, oh = el.offsetHeight;
      handle.setPointerCapture(e.pointerId);
      const move = ev => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (mode === 'move') {
          let nx = J.clamp(ox + dx, -ow + 120, d.width - 120), ny = J.clamp(oy + dy, 0, d.height - 60);
          if (!ev.altKey) { const sn = edgeSnap(id, nx, ny, ow, oh); nx = sn.x; ny = sn.y; el.classList.toggle('edge-snap', sn.hit); }   // krawędź do krawędzi innego okna (Alt = bez przyciągania)
          el.style.left = nx + 'px'; el.style.top = ny + 'px';
          const px = ev.clientX - d.left, py = ev.clientY - d.top, m = 14;
          snapPos = px < m ? (py < m ? 'tl' : py > d.height - 90 ? 'bl' : 'left') : px > d.width - m ? (py < m ? 'tr' : py > d.height - 90 ? 'br' : 'right') : py < m ? 'top' : null;
          showSnap(snapPos, d);
        } else {
          const mn = minOf(id);
          if (edge.includes('e')) el.style.width = J.clamp(ow + dx, mn.w, d.width - ox) + 'px';
          if (edge.includes('s')) el.style.height = J.clamp(oh + dy, mn.h, d.height - oy) + 'px';
          if (edge.includes('w')) { const nw = J.clamp(ow - dx, mn.w, ox + ow); el.style.width = nw + 'px'; el.style.left = (ox + ow - nw) + 'px'; }
          if (edge.includes('n')) { const nh = J.clamp(oh - dy, mn.h, oy + oh); el.style.height = nh + 'px'; el.style.top = (oy + oh - nh) + 'px'; }
          const asp = J.apps[id]?.aspect; if (asp) el.style.height = Math.max(mn.h, Math.round(el.offsetWidth / asp)) + 'px';   // stałe proporcje (np. kalkulator)
        }
      };
      let snapPos = null;
      const up = () => { dragging = null; el.classList.remove('edge-snap'); handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up); showSnap(null); if (snapPos) { api.snap(id, snapPos); snapPos = null; return; } savePos(id, el); J.emit('wm-resize', id); };
      dragging = id;
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
    });
  };

  let dragging = null;   // okno przeciągane teraz przez użytkownika (agent nie może go wtedy ruszać)
  /* podgląd przyciągania przy przeciąganiu okna do krawędzi */
  let snapEl = null;
  const showSnap = (pos, d) => {
    if (!pos) { snapEl?.classList.remove('on'); return; }
    if (!snapEl) { snapEl = J.h('div', { class: 'snap-preview' }); desk().appendChild(snapEl); }
    const W = d.width, H = d.height - 84, g = 8, half = (W - g * 3) / 2, hh = (H - g * 3) / 2;
    const R = { left: [g, g, half, H - g * 2], right: [g * 2 + half, g, half, H - g * 2], top: [g, g, W - g * 2, hh], tl: [g, g, half, hh], tr: [g * 2 + half, g, half, hh], bl: [g, g * 2 + hh, half, hh], br: [g * 2 + half, g * 2 + hh, half, hh] }[pos];
    Object.assign(snapEl.style, { left: R[0] + 'px', top: R[1] + 'px', width: R[2] + 'px', height: R[3] + 'px' }); snapEl.classList.add('on');
  };
  /* pulpit zmienia rozmiar (panel logu, czat, okno przeglądarki) → okna mieszczą się w nowych granicach */
  const reflow = () => {
    const d = desk().getBoundingClientRect(); if (!d.width || isMobile()) return;
    Object.values(open).forEach(({ el }) => {
      if (el.classList.contains('max')) return;
      const w = Math.min(el.offsetWidth, Math.max(MIN_W, d.width - 16)), h = Math.min(el.offsetHeight, Math.max(MIN_H, d.height - 92));
      if (w !== el.offsetWidth) el.style.width = w + 'px'; if (h !== el.offsetHeight) el.style.height = h + 'px';
      el.style.left = J.clamp(el.offsetLeft, 0, Math.max(0, d.width - w)) + 'px'; el.style.top = J.clamp(el.offsetTop, 0, Math.max(0, d.height - h - 80)) + 'px';
    });
  };
  let ro = null;
  const api = {
    open(id, arg) {
      if (id === 'chat') { J.chatPanel?.show(arg); return true; }   // czat = stały lewy panel
      const app = J.apps[id]; if (!app || !desk()) return false;
      if (open[id]) {
        const w = open[id];
        if (w.minimized) { w.minimized = false; w.el.classList.remove('hidden', 'minimizing'); }
        focus(id); if (app.onArg && arg !== undefined) app.onArg(arg, w.ctx);
        return true;
      }
      const el = J.h('div', { class: 'window', 'data-app': id, role: 'dialog', 'aria-label': app.title });
      el.innerHTML = `<div class="win-head"><button class="bk" title="Wróć" aria-label="Wróć">‹</button><span class="wico">${J.icon(app.icon)}</span><b></b>
        <div class="win-actions"><button class="pn" title="Przypnij na wierzchu">${J.icon('pin')}</button><button class="mn" title="Minimalizuj">${J.icon('min')}</button><button class="mx" title="Maksymalizuj">${J.icon('max')}</button><button class="x" title="Zamknij">${J.icon('close')}</button></div></div>
        <div class="win-body ${app.flush ? 'flush' : ''}"></div><div class="resize"></div>${['n', 's', 'e', 'w', 'ne', 'nw', 'sw'].map(e => `<div class="rz rz-${e}" data-e="${e}"></div>`).join('')}`;
      el.querySelector('b').textContent = app.title;
      desk().appendChild(el); place(id, el, app);
      if (!ro && window.ResizeObserver) { ro = new ResizeObserver(J.debounce(reflow, 60)); ro.observe(desk()); }
      const cleanups = [];
      const ctx = {
        el, body: el.querySelector('.win-body'),
        onClose: fn => cleanups.push(fn),
        setTitle: t => { el.querySelector('.win-head b').textContent = t; },
        close: () => api.close(id)
      };
      open[id] = { el, cleanups, minimized: false, ctx, pinned: false };
      const head = el.querySelector('.win-head');
      drag(id, el, head, 'move'); drag(id, el, el.querySelector('.resize'), 'resize', 'se');
      el.querySelectorAll('.rz').forEach(r => drag(id, el, r, 'resize', r.dataset.e));
      el.querySelector('.pn').onclick = () => api.pin(id, !open[id]?.pinned);
      el.querySelector('.bk').onclick = () => J.uiRun ? J.uiRun('nav_back', {}, { quiet: true }) : null;
      head.addEventListener('dblclick', e => { if (!e.target.closest('.win-actions')) api.toggleMax(id); });
      el.querySelector('.mn').onclick = () => api.minimize(id);
      el.querySelector('.mx').onclick = () => api.toggleMax(id);
      el.querySelector('.x').onclick = () => api.close(id);
      el.addEventListener('pointerdown', () => focus(id), true);
      try { app.mount(ctx.body, ctx, arg); } catch (e) { console.error(e); ctx.body.innerHTML = '<div class="empty">Błąd aplikacji: ' + J.esc(e.message) + '</div>'; }
      if (J.state.winPos[id]?.pin) api.pin(id, true, true);
      focus(id); J.sfx.open();
      J.log('Uruchomiono: ' + app.title, 'Okno aplikacji otwarte na pulpicie.', 'info');
      J.emit('wm');
      return true;
    },
    close(id) {
      if (id === 'chat') { J.chatPanel?.hide(); return; }
      const w = open[id]; if (!w) return;
      savePos(id, w.el);
      if (!id.startsWith('w:')) { const st = closedStack(), view = J.apps[id]?.state?.(w.ctx) || null; st.push({ id, pos: { ...J.state.winPos[id] }, max: w.el.classList.contains('max'), view, ts: Date.now() }); if (st.length > 10) st.shift(); J.save(); }
      w.cleanups.forEach(fn => { try { fn(); } catch (e) { } });
      delete open[id];
      w.el.classList.add('closing'); J.sfx.close();
      setTimeout(() => w.el.remove(), 220);
      J.emit('wm');
    },
    closeAll() { Object.keys(open).filter(id => !id.startsWith('w:')).forEach(api.close); },   // widgety zostają (zamknięcie widgetu = usunięcie)
    minimize(id) {
      const w = open[id]; if (!w) return;
      w.minimized = true; w.el.classList.add('minimizing'); w.el.classList.remove('focused');
      setTimeout(() => { if (w.minimized) w.el.classList.add('hidden'); }, 290);
      J.emit('wm');
    },
    minimizeAll() { Object.keys(open).forEach(api.minimize); },
    toggleMax(id) { const w = open[id]; if (w) { w.el.classList.toggle('max'); J.emit('wm-resize', id); } },
    toggle(id) {
      if (id === 'chat') { J.chatPanel?.toggle(); return true; }
      const w = open[id];
      if (!w) return api.open(id);
      if (w.minimized) return api.open(id);
      if (w.el.classList.contains('focused')) return api.minimize(id);
      focus(id);
    },
    remember: id => { if (open[id]) savePos(id, open[id].el); },
    focused() { const id = Object.keys(open).find(i => open[i].el.classList.contains('focused') && !open[i].minimized); return id || null; },
    info() { return Object.entries(open).map(([id, w]) => ({ id, title: J.apps[id]?.title || id, x: w.el.offsetLeft, y: w.el.offsetTop, w: w.el.offsetWidth, h: w.el.offsetHeight, min: !!w.minimized, max: w.el.classList.contains('max'), focused: w.el.classList.contains('focused') })); },
    cycle() { const ids = Object.keys(open); if (!ids.length) return null; const cur = api.focused(); const i = ids.indexOf(cur); const nxt = ids[(i + 1) % ids.length]; api.open(nxt); return nxt; },
    move(id, x, y) { const w = open[id]; if (!w) return; const d = desk().getBoundingClientRect(); w.el.classList.remove('max'); if (x != null) w.el.style.left = J.clamp(x, 0, Math.max(0, d.width - w.el.offsetWidth)) + 'px'; if (y != null) w.el.style.top = J.clamp(y, 0, Math.max(0, d.height - w.el.offsetHeight - 80)) + 'px'; savePos(id, w.el); J.emit('wm-resize', id); },
    resize(id, wd, ht) { const w = open[id]; if (!w) return; const d = desk().getBoundingClientRect(); w.el.classList.remove('max'); if (wd != null) w.el.style.width = J.clamp(wd, minOf(id).w, d.width - w.el.offsetLeft) + 'px'; if (ht != null) w.el.style.height = J.clamp(ht, minOf(id).h, d.height - w.el.offsetTop - 80) + 'px'; savePos(id, w.el); J.emit('wm-resize', id); },
    /* przyciąganie do krawędzi / ćwiartek: left right top bottom tl tr bl br center */
    snap(id, pos) {
      const w = open[id]; if (!w) return; const d = desk().getBoundingClientRect(), W = d.width, H = d.height - 84, g = 8, half = (W - g * 3) / 2, hh = (H - g * 3) / 2;
      const R = { left: [g, g, half, H - g * 2], right: [g * 2 + half, g, half, H - g * 2], top: [g, g, W - g * 2, hh], bottom: [g, g * 2 + hh, W - g * 2, hh], tl: [g, g, half, hh], tr: [g * 2 + half, g, half, hh], bl: [g, g * 2 + hh, half, hh], br: [g * 2 + half, g * 2 + hh, half, hh], center: [(W - Math.min(W * .6, 720)) / 2, (H - Math.min(H * .7, 520)) / 2, Math.min(W * .6, 720), Math.min(H * .7, 520)] }[pos];
      if (!R) return; w.minimized = false; w.el.classList.remove('hidden', 'minimizing', 'max'); w.el.classList.add('snapping');
      Object.assign(w.el.style, { left: R[0] + 'px', top: R[1] + 'px', width: Math.max(280, R[2]) + 'px', height: Math.max(180, R[3]) + 'px' });
      setTimeout(() => w.el.classList.remove('snapping'), 320); focus(id); savePos(id, w.el); J.sfx.snap(); J.emit('wm-resize', id);
    },
    tile(ids) {
      const l = (ids || Object.keys(open)).filter(i => open[i] && !open[i].minimized); if (!l.length) return 0;
      const n = l.length, cols = n === 1 ? 1 : n <= 4 ? 2 : 3, rows = Math.ceil(n / cols), d = desk().getBoundingClientRect(), g = 8, W = (d.width - g * (cols + 1)) / cols, H = (d.height - 84 - g * (rows + 1)) / rows;
      l.forEach((id, i) => { const w = open[id], c = i % cols, r = Math.floor(i / cols); w.el.classList.remove('max'); w.el.classList.add('snapping'); Object.assign(w.el.style, { left: g + c * (W + g) + 'px', top: g + r * (H + g) + 'px', width: Math.max(280, W) + 'px', height: Math.max(180, H) + 'px' }); setTimeout(() => w.el.classList.remove('snapping'), 320); savePos(id, w.el); });
      J.sfx.snap(); J.emit('wm-resize'); return n;
    },
    setMax(id, on) { const w = open[id]; if (!w) return; w.el.classList.toggle('max', on !== false); J.emit('wm-resize', id); },
    /* przypięcie „zawsze na wierzchu” (maks. 3 naraz; czwarte odpina najstarsze) */
    pin(id, on = true, quiet) {
      const w = open[id]; if (!w) return false;
      if (on && !w.pinned) { const pinned = Object.keys(open).filter(k => open[k].pinned).sort((a, b) => (+open[a].el.style.zIndex) - (+open[b].el.style.zIndex)); if (pinned.length >= 3) { api.pin(pinned[0], false, true); if (!quiet) J.toast?.('Odpięto „' + (J.apps[pinned[0]]?.title || pinned[0]) + '” (maks. 3 przypięte)'); } }
      w.pinned = !!on; w.el.classList.toggle('pinned', w.pinned); w.el.style.zIndex = w.pinned ? ++zp : ++z;
      J.state.winPos[id] = { ...(J.state.winPos[id] || {}), pin: w.pinned }; J.save(); J.emit('wm'); return true;
    },
    isPinned: id => !!open[id]?.pinned,
    /* ostatnio zamknięte okna (stos 10) → otwórz ponownie w tej samej pozycji i widoku */
    closed: () => closedStack().slice(),
    reopen(id) {
      const st = closedStack(); let i = st.length - 1; if (id) i = st.map(x => x.id).lastIndexOf(id); if (i < 0) return null;
      const e = st.splice(i, 1)[0]; J.save(); if (!J.apps[e.id]) return null;
      api.open(e.id, e.view || undefined); if (e.pos && e.pos.w) { api.move(e.id, e.pos.x, e.pos.y); api.resize(e.id, e.pos.w, e.pos.h); } if (e.max) api.setMax(e.id, true);
      return e.id;
    },
    restore(id) { const ids = id === 'all' || !id ? Object.keys(open) : [id]; let n = 0; ids.forEach(k => { const w = open[k]; if (w?.minimized) { w.minimized = false; w.el.classList.remove('hidden', 'minimizing'); n++; } }); if (n) { focus(ids[ids.length - 1]); J.emit('wm'); } return n; },
    closeOthers(keep) { const l = Object.keys(open).filter(k => k !== keep && !k.startsWith('w:')); l.forEach(api.close); return l; },
    /* migawka położenia wszystkich okien (do „Cofnij” po kafelkach, przyciąganiu, układzie) */
    snapshot() { return Object.entries(open).map(([id, w]) => ({ id, x: w.el.offsetLeft, y: w.el.offsetTop, w: w.el.offsetWidth, h: w.el.offsetHeight, min: !!w.minimized, max: w.el.classList.contains('max') })); },
    applySnapshot(snap) { const ids = new Set(snap.map(s => s.id)); Object.keys(open).forEach(k => { if (!ids.has(k) && !k.startsWith('w:')) api.minimize(k); }); snap.forEach(s => { if (!J.apps[s.id]) return; if (!open[s.id]) api.open(s.id); const w = open[s.id]; w.el.classList.toggle('max', !!s.max); w.el.style.left = s.x + 'px'; w.el.style.top = s.y + 'px'; w.el.style.width = s.w + 'px'; w.el.style.height = s.h + 'px'; if (s.min) api.minimize(s.id); else if (w.minimized) { w.minimized = false; w.el.classList.remove('hidden', 'minimizing'); } savePos(s.id, w.el); }); J.emit('wm-resize'); J.emit('wm'); },
    dragging: () => dragging,
    minSize: minOf,
    isOpen: id => id === 'chat' || !!open[id],
    isMin: id => !!open[id]?.minimized,
    edgeSnap: (id, x, y, w, h) => edgeSnap(id, x, y, w, h),
    isFocused: id => !!open[id]?.el.classList.contains('focused'),
    ctx: id => open[id]?.ctx,
    count: () => Object.keys(open).length,
    list: () => Object.keys(open),
    closeTop() {
      const ids = Object.keys(open).filter(i => !open[i].minimized && !i.startsWith('w:'));   // widgety nie znikają po Esc (zamknięcie = usunięcie)
      if (!ids.length) return false;
      ids.sort((a, b) => (+open[b].el.style.zIndex) - (+open[a].el.style.zIndex));
      api.close(ids[0]); return true;
    }
  };
  return api;
})();

/* ---------- układy okien (zapisane + presety) ---------- */
J.layouts = (() => {
  const PRESETS = {
    praca: { apps: ['notes', 'schedule'], mode: 'tile' },
    rynek: { apps: ['market', 'terminal'], mode: 'tile' },
    'skupienie': { apps: ['notes'], mode: 'center' },
    czysto: { apps: [], mode: 'min' }
  };
  return {
    list: () => [...Object.keys(PRESETS), ...Object.keys(J.state.layouts || {})],
    save(name) { const apps = J.wm.info().filter(w => !w.min).map(w => { let view = null; try { view = J.apps[w.id]?.state?.(J.wm.ctx(w.id)) || null; } catch (e) { } return { id: w.id, x: w.x, y: w.y, w: w.w, h: w.h, max: w.max, pin: J.wm.isPinned(w.id), view }; }); J.state.layouts[name] = { apps, ts: Date.now() }; J.save(); return { name, apps: apps.map(a => a.id) }; },
    presets: () => Object.keys(PRESETS),
    isPreset: n => Object.keys(PRESETS).some(k => J.norm(k) === J.norm(n)),
    remove(name) { delete J.state.layouts[name]; J.save(); },
    apply(name) {
      const key = J.norm(name || ''); const custom = Object.keys(J.state.layouts).find(k => J.norm(k) === key); const preset = Object.keys(PRESETS).find(k => J.norm(k) === key);
      if (custom) { const l = J.state.layouts[custom]; J.wm.minimizeAll(); const have = l.apps.filter(a => J.apps[a.id]); have.forEach(a => { J.wm.open(a.id, a.view || undefined); J.wm.move(a.id, a.x, a.y); J.wm.resize(a.id, a.w, a.h); if (a.max) J.wm.setMax(a.id, true); if (a.pin) J.wm.pin(a.id, true, true); }); return { ok: true, name: custom, apps: have.map(a => a.id), skipped: l.apps.length - have.length }; }
      if (preset) { const p = PRESETS[preset]; J.wm.minimizeAll(); if (p.mode === 'min') return { ok: true, name: preset, apps: [] }; p.apps.forEach(id => J.wm.open(id)); if (p.mode === 'tile') J.wm.tile(p.apps); else p.apps.forEach(id => J.wm.snap(id, 'center')); return { ok: true, name: preset, apps: p.apps }; }
      return { ok: false };
    }
  };
})();

/* ---------- licznik akcji (tool calls) ---------- */
J.action = (label) => {
  J.state.stats.actions = (J.state.stats.actions || 0) + 1;
  /* dzienna historia (wykres aktywności, stats_series): 30 dni */
  const dh = J.state.stats.daily = J.state.stats.daily || {}, d = J.today(); dh[d] = dh[d] || { actions: 0, cost: 0 }; dh[d].actions++;
  const ks = Object.keys(dh).sort(); while (ks.length > 30) delete dh[ks.shift()];
  J.save();
  J.emit('action', label);
};
