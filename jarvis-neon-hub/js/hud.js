/* =========================================================
   JARVIS OS — HUD: 10 kart wokół Core + geometria sceny
   Karty pokazują WYŁĄCZNIE to, co faktycznie zgłosiły zdarzenia
   (J.engine). Nic nie „udaje” postępu: bez zdarzenia karta jest
   przygaszona, a jej linia do Core pusta.
   ========================================================= */
'use strict';
(() => {
const { $, h, esc } = J;
const eg = J.engine;

/* ---------- ikony kart (obrys, viewBox 24) ---------- */
const IC = {
  brain: '<path d="M9.5 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3.2 3.2 0 0 0 2 5 3 3 0 0 0 5-1.5V5.5A2 2 0 0 0 9.5 4Z"/><path d="M14.5 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3.2 3.2 0 0 1-2 5 3 3 0 0 1-5-1.5V5.5A2 2 0 0 1 14.5 4Z"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/><path d="M8.5 11h7M8.5 14h4"/>',
  tools: '<path d="M14.7 6.3a4 4 0 0 0-5 5L3.5 17.5a1.8 1.8 0 0 0 2.6 2.6l6.2-6.2a4 4 0 0 0 5-5l-2.4 2.4-2.2-.6-.6-2.2z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  db: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  shield: '<path d="M12 3 5 6v5c0 4.6 3 8.3 7 10 4-1.7 7-5.4 7-10V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'
};
const svg = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${IC[n]}</svg>`;

/* położenie środków kart względem środka Core (px przy skali 1) — jak na makiecie */
const CARDS = [
  { id: 'model',    tone: 'blue',   ic: 'brain',  title: 'Model AI',            dx: 6,    dy: -240, w: 226, side: 'b' },
  { id: 'intent',   tone: 'blue',   ic: 'chat',   title: 'Analiza polecenia',   dx: -274, dy: -186, w: 240, side: 'r' },
  { id: 'tools',    tone: 'purple', ic: 'tools',  title: 'Tool Calls',          dx: 306,  dy: -200, w: 200, side: 'l' },
  { id: 'internet', tone: 'teal',   ic: 'globe',  title: 'Internet',            dx: -358, dy: -52,  w: 208, side: 'r' },
  { id: 'external', tone: 'teal',   ic: 'db',     title: 'Dane zewnętrzne',     dx: 366,  dy: -78,  w: 226, side: 'l' },
  { id: 'files',    tone: 'blue',   ic: 'doc',    title: 'Pliki i dokumenty',   dx: -364, dy: 66,   w: 220, side: 'r' },
  { id: 'status',   tone: 'green',  ic: 'shield', title: 'Status systemu',      dx: 360,  dy: 52,   w: 214, side: 'l' },
  { id: 'exec',     tone: 'purple', ic: 'bolt',   title: 'Wykonywanie zadania', dx: -262, dy: 174,  w: 238, side: 'r' },
  { id: 'logic',    tone: 'blue',   ic: 'list',   title: 'Logika i decyzje',    dx: 268,  dy: 174,  w: 206, side: 'l' },
  { id: 'done',     tone: 'purple', ic: 'flag',   title: 'Zakończenie',         dx: 182,  dy: 252,  w: 196, side: 'l' }
];
const CH = 74;   // wysokość karty (px przy skali 1)

/* ---------- geometria sceny (jedno źródło prawdy dla Core, karty, jeziora) ---------- */
const scene = { W: 0, H: 0, k: 1, cx: 0, cy: 0, R: 108, foot: 0, horizon: 0, narrow: false, wall: '' };
/* horyzont tapety (px od góry #desktop): jezioro/aurora/pustka — stała .624 obrazu zdjęcia; neon — scena shadera ma linię za Orbem, lekko poniżej jego środka
   (podstawa wiązki leży wtedy na podłodze siatki). Jedno źródło prawdy dla bg-gl.js (uHz), CSS-owego fallbacku (--hz) i geometrii jeziora. */
const horizonFor = (wall, cy, R, photo) => wall === 'neon' ? cy + .3 * R : photo;
/* prostokąty paneli czatu i logu w układzie #desktop (stałe z css: .chat-panel / .log-panel, z poprawką na skalę interfejsu); ≤ 900 px panele są nakładkami na całą szerokość */
const CMIN = 56;   // szerokość karty zwiniętej do samej ikony (34 px ikony + padding)
const panelBoxes = (W, H, chat, log, z = 1) => {
  if (W <= 900 || (!chat && !log)) return [];
  const pw = Math.min(392 * z, W - 32), x1 = W - 16, x0 = x1 - pw, out = [];
  if (chat) { const hh = log ? H / 2 - 40 : Math.min(540 * z, H - 90); out.push({ x0, x1, y0: H - 62 - hh, y1: H - 62 }); }
  if (log) { const hh = chat ? H / 2 - 28 : Math.min(560 * z, H - 28); out.push({ x0, x1, y0: 14, y1: 14 + hh }); }
  return out;
};
/* Karty nachodzące na otwarty panel zwijają się do ikony (pełna treść zostaje w aria i podpowiedzi): lewa krawędź karty prawej strony (side 'l') zostaje na miejscu,
   a gdy i ona leży pod panelem — karta przesuwa się w lewo tak, by jej prawy brzeg był 12 px od panelu. Zwraca {mini, dx, w} (dx/w w jednostkach sceny przy k=1) */
const fitCard = (c, cx, cy, k, boxes) => {
  const hh = (c.id === 'model' ? 150 : 84) * k, px = cx + c.dx * k, py = cy + c.dy * k, hit = (l, r) => boxes.filter(b => r > b.x0 - 12 && l < b.x1 + 12 && py + hh / 2 > b.y0 - 12 && py - hh / 2 < b.y1 + 12);
  if (!hit(px - c.w * k / 2, px + c.w * k / 2).length) return { mini: false, dx: c.dx, w: c.w };
  let dx = c.side === 'l' ? c.dx - (c.w - CMIN) / 2 : c.side === 'r' ? c.dx + (c.w - CMIN) / 2 : c.dx;
  const hs = hit(cx + dx * k - CMIN * k / 2, cx + dx * k + CMIN * k / 2);
  if (hs.length) dx -= (cx + dx * k + CMIN * k / 2 - (Math.min(...hs.map(b => b.x0)) - 12)) / k;
  return { mini: true, dx, w: CMIN };
};
let layoutVer = 0;   // numer wersji geometrii: kanwa linii przerysowuje się przy zmianie układu, a nie co klatkę
const layout = () => {
  const d = $('#desktop'); if (!d) return;
  const W = d.clientWidth, H = d.clientHeight; if (!W || !H) return;
  const vw = innerWidth, vh = innerHeight, topbar = d.getBoundingClientRect().top;
  let k = J.clamp(Math.min(W / 1240, H / 690), .5, 1.12);
  /* karty sięgają od 300·k nad Core (najwyższa, z wykresem fali) do 289·k pod nim: na niskich ekranach zmniejszamy scenę tak, żeby zmieściły się
     między paskiem zadania u góry (56 px) a dokiem u dołu (100 px) i nie chowały się pod nimi */
  if (W >= 760) k = Math.max(.5, Math.min(k, (H - 156) / 589));
  // linia horyzontu tapety (jezioro) — tapeta jest „cover” w elemencie o 30 px większym z każdej strony
  const ww = vw + 60, wh = vh + 60, sc = Math.max(ww / 1920, wh / 1178), sh = 1178 * sc;
  const photoH = -30 + (wh - sh) / 2 + .624 * sh - topbar, wall = J.state?.settings?.wall || 'photo';
  const R = 108 * k;
  const cyLow = W >= 760 ? Math.max(H * .3, 56 + 300 * k) : H * .3;
  const cy = J.clamp(photoH - R * 1.03 - 6 * k, cyLow, Math.max(cyLow, H * .5));   // położenie Core nie zależy od tapety (zmiana tapety nie przesuwa kart ani nie zmienia kolizji)
  const horizon = horizonFor(wall, cy, R, photoH);
  Object.assign(scene, { W, H, k, cx: W / 2, cy, R, foot: cy + 1.37 * R, horizon, top: topbar, narrow: W < 760, wall });
  { const app = $('#app'); if (app) app.style.setProperty('--hz', ((horizon + topbar) / (vh || 1) * 100).toFixed(2) + '%'); }   // fallback CSS neonu (.bg-fb) rysuje horyzont w tym samym miejscu co shader
  /* panele czatu/logu otwarte → karty, które na nie nachodzą, zwijają się do ikon (fitCard); geometria efektywna (dxe/we) jest jedynym źródłem dla linii, chipów i elementu */
  const ws = $('#workspace'), z = J.clamp((+J.state?.settings?.uiScale || 100) / 100, .8, 1.3), boxes = panelBoxes(W, H, ws && !ws.classList.contains('chat-closed'), !!ws?.classList.contains('log-open'), z);
  const fit = bx => CARDS.forEach(c => { const f = fitCard(c, scene.cx, cy, k, bx); c.mini = f.mini; c.dxe = f.dx; c.we = f.w; });
  fit(boxes);
  /* chipy (zgoda, wynik, cofnij) stają po lewej od karty „Zakończenie” — dolny rząd kart jest jedynym miejscem nad dokiem, a ta karta jest w nim jedyna;
     prawy brzeg chipa = lewy brzeg karty − 14 px, szerokość do panelu telemetrii (≥ 1180 px) albo paska ikon. Wąski ekran (bez kart): chipy zostają na środku.
     Widoczny chip (realnie 2–3 wiersze pytania, ok. 125 px) jest dla kart takim samym „panelem” jak czat: nachodzące na niego zwijają się do ikon (drugie przejście fit) */
  { const app = $('#app'), dn = CARDS.find(c => c.id === 'done'); if (app && dn) { const st = app.style, L = scene.cx + (dn.dxe - dn.we / 2) * k - 14;
    if (W >= 760) { st.setProperty('--chip-l', Math.round(L) + 'px'); st.setProperty('--chip-tx', '-100%'); st.setProperty('--chip-w', Math.max(240, Math.round(L - (W >= 1180 ? 332 : 112))) + 'px');
      const cb = []; ['#askChip', '#undoChip', '#resultChip'].forEach(q => { const el = $(q); if (el && el.classList.contains('show')) { const y1 = vh - topbar - 98; cb.push({ x0: L - el.offsetWidth, x1: L, y0: y1 - el.offsetHeight, y1 }); } });   // chip: bottom 98 px od dołu #app
      if (cb.length) fit(boxes.concat(cb)); }
    else { st.removeProperty('--chip-l'); st.removeProperty('--chip-tx'); st.removeProperty('--chip-w'); } } }
  layoutVer++;
  const wrap = $('#coreWrap'); wrap.style.left = scene.cx + 'px'; wrap.style.top = cy + 'px'; wrap.style.transform = `scale(${k})`;
  CARDS.forEach(c => {
    const px = scene.cx + c.dxe * k, py = cy + c.dy * k;
    c.x = px; c.y = py;
    let A;
    if (c.side === 'r') A = { x: px + c.we / 2 * k, y: py };
    else if (c.side === 'l') A = { x: px - c.we / 2 * k, y: py };
    else A = { x: px, y: py + CH / 2 * k };
    const th = Math.atan2(A.y - cy, A.x - scene.cx), rr = R + 7 * k;
    const B = c.side === 'b' ? { x: scene.cx, y: cy - rr } : { x: scene.cx + Math.cos(th) * rr, y: cy + Math.sin(th) * rr };
    if (c.side === 'b') A.x = scene.cx;
    const M = (c.side === 'b' || Math.abs(A.y - B.y) < 8) ? null : { x: A.x + (B.x - A.x) * .52, y: A.y };
    c.A = A; c.B = B; c.pts = M ? [A, M, B] : [A, B];
    c.L = []; c.tot = 0; for (let i = 1; i < c.pts.length; i++) { const l = Math.hypot(c.pts[i].x - c.pts[i - 1].x, c.pts[i].y - c.pts[i - 1].y); c.L.push(l); c.tot += l; }   // długości odcinków liczone raz (pointAt w pętli rysującej nie alokuje)
    if (c.el) { c.el.style.left = px + 'px'; c.el.style.top = py + 'px'; c.el.style.width = c.we + 'px'; if (c.el._mini !== c.mini) { c.el._mini = c.mini; c.el.classList.toggle('mini', c.mini); } c.el.style.transform = `translate(-50%,-50%) scale(${k})`; c.el.style.setProperty('--k', k); }   // --k: skala karty, używana też przez styl :hover (bez niej karta skakała do skali 1)
  });
};

/* ---------- stan kart z rzeczywistych zdarzeń ---------- */
const pretty = t => String(t || '').replace(/[_.-]+/g, ' ').trim();
const cut = (t, n) => { t = String(t || ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const fmtD = ms => ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(1) + ' s';
const nodeCard = (id, idle, activeTxt, doneTxt) => {
  const n = eg.nodes[id];
  if (!n) return { s: 'idle', sub: idle, pct: 0, r: '' };
  if (n.status === 'active') return { s: 'active', sub: activeTxt(n), pct: null, r: '' };
  if (n.status === 'failed') return { s: 'failed', sub: 'Błąd: ' + cut(pretty(n.lastTool), 26), pct: 1, r: '' };
  return { s: 'done', sub: doneTxt(n), pct: 1, r: '✓' };
};
const STATE = {
  model() {
    const n = eg.nodes.model, ai = J.aiReady(), hs = J.hermes?.status;
    let pill = !ai ? 'Lokalny' : hs === 'down' ? 'Offline' : hs === 'up' ? 'Połączony' : 'Skonfigurowany';
    if (n?.status === 'active') pill = 'Generuje';
    return { s: n?.status === 'active' ? 'active' : n?.status === 'failed' ? 'failed' : (ai && hs !== 'down') ? 'done' : 'idle', sub: ai ? cut(J.state.settings.hermesModel, 26) : 'Lokalny silnik', r: pill, pill: true };
  },
  intent: () => eg.title ? { s: 'done', sub: cut(eg.title, 34), pct: 1, r: '100%' } : { s: 'idle', sub: 'Czeka na polecenie', pct: 0, r: '' },
  tools() {
    const st = eg.toolsStarted, fin = eg.toolsFinished;
    if (!st) return { s: 'idle', sub: 'Brak wywołań narzędzi', pct: 0, r: '0 / 0' };
    return { s: fin < st ? 'active' : eg.toolsFailed ? 'failed' : 'done', sub: eg.toolNames.slice(0, 3).map(pretty).join(' • '), pct: fin / st, r: fin + ' / ' + st };
  },
  internet: () => nodeCard('internet', 'Nieużywany w tym zadaniu', n => 'Pobieranie: ' + cut(pretty(n.lastTool), 24), n => 'Gotowe · ' + n.calls + '× ' + cut(pretty(n.lastTool), 18)),
  external() {
    const x = eg.ext;
    if (!x.started) return { s: 'idle', sub: 'Brak narzędzi po stronie Hermesa', pct: 0, r: '' };
    if (x.active) return { s: 'active', sub: 'Hermes: ' + cut(pretty(x.last), 24), pct: null, r: x.finished + ' / ' + x.started };
    return { s: eg.toolsFailed ? 'failed' : 'done', sub: 'Hermes wykonał ' + x.finished + ' ' + J.pl(x.finished, 'narzędzie', 'narzędzia', 'narzędzi'), pct: 1, r: '✓' };
  },
  files: () => nodeCard('files', 'Nieużywane w tym zadaniu', n => 'Praca na plikach: ' + cut(pretty(n.lastTool), 18), n => 'Gotowe · ' + n.calls + '× ' + cut(pretty(n.lastTool), 18)),
  status() {
    if (eg.toolsFailed) return { s: 'failed', sub: eg.toolsFailed + ' ' + J.pl(eg.toolsFailed, 'błąd', 'błędy', 'błędów') + ' narzędzi w zadaniu', pct: null, r: '', dot: true };
    if (J.aiReady() && J.hermes?.status === 'down') return { s: 'failed', sub: 'Hermes offline — silnik lokalny', pct: null, r: '', dot: true };
    if (!navigator.onLine) return { s: 'failed', sub: 'Brak połączenia z internetem', pct: null, r: '', dot: true };
    return { s: 'done', sub: 'Wszystko działa poprawnie', pct: null, r: '', dot: true };
  },
  exec() {
    const st = eg.toolsStarted, fin = eg.toolsFinished;
    if (!st) return { s: 'idle', sub: 'Brak działań do wykonania', pct: 0, r: '' };
    if (fin < st) return { s: 'active', sub: 'Wykonywanie: ' + cut(pretty(eg.toolNames[eg.toolNames.length - 1]), 22), pct: fin / st, r: Math.round(fin / st * 100) + '%' };
    return { s: eg.toolsFailed ? 'failed' : 'done', sub: 'Wykonano ' + fin + ' z ' + st, pct: 1, r: '100%' };
  },
  logic() {
    const n = eg.nodes.model;
    const jv = eg.judge; if (jv && Date.now() - jv.t < 20000 && !(eg.plan && eg.plan.steps.length)) return { s: jv.route === 'execute' ? 'done' : 'active', sub: 'Jev: ' + jv.intent.id + ' → ' + ({ execute: 'wykonaj', ask: 'zapytaj', hermes: 'Hermes' })[jv.route], pct: jv.intent.confidence, r: Math.round(jv.intent.confidence * 100) + '%' };
    if (eg.plan && eg.plan.steps.length) { const d = eg.plan.done, t = eg.plan.steps.length; return { s: d >= t ? 'done' : 'active', sub: d < t ? 'Plan: ' + cut(eg.plan.steps[d], 30) : 'Plan wykonany (' + t + ' kroków)', pct: d / t, r: d + ' / ' + t }; }
    if (!eg.turns) return { s: 'idle', sub: 'Bez udziału modelu', pct: 0, r: '' };
    if (n?.status === 'active') return { s: 'active', sub: eg.thinkChars ? 'Rozumowanie: ' + eg.thinkChars + ' zn.' : 'Tura modelu ' + eg.turns, pct: null, r: '' };
    return { s: n?.status === 'failed' ? 'failed' : 'done', sub: eg.turns + ' ' + J.pl(eg.turns, 'tura', 'tury', 'tur') + ' modelu', pct: 1, r: '✓' };
  },
  done() {
    if (eg.hold === 'APPROVAL_REQUIRED') return { s: 'ask', sub: 'Czeka na Twoją zgodę', pct: null, r: '', dot: true };
    if (eg.hold === 'PAUSED') return { s: 'ask', sub: 'Wstrzymane — budżet tury', pct: null, r: '', dot: true };
    if (eg.taskId) return { s: 'active', sub: 'Zadanie w toku…', pct: null, r: '', dot: true };
    const k = eg.flash.kind, dur = eg.flash.t && eg.startedAt ? eg.flash.t - eg.startedAt : 0;
    if (k === 'ok') return { s: 'done', sub: 'Zakończono w ' + fmtD(dur), pct: 1, r: '', dot: true };
    if (k === 'err') return { s: 'failed', sub: 'Zadanie nie powiodło się', pct: 1, r: '', dot: true };
    if (k === 'cancel') return { s: 'idle', sub: 'Zadanie przerwane', pct: 0, r: '', dot: true };
    return { s: 'idle', sub: 'Czeka na zadanie', pct: 0, r: '', dot: true };
  }
};

/* ---------- DOM ---------- */
let mounted = false, lastPaint = 0, shown = false;
const mount = () => {
  const hud = $('#hud'); if (!hud || mounted) return; mounted = true;
  CARDS.forEach((c, i) => {
    const el = h('div', { class: 'hc', 'data-id': c.id, 'data-tone': c.tone, 'data-s': 'idle', role: 'button', tabindex: '0' },
      `<span class="hc-ic">${svg(c.ic)}</span><div class="hc-t"><b>${esc(c.title)}</b><small class="hc-sub"></small></div><em class="hc-r"></em><i class="hc-en" aria-hidden="true"></i>` +
      (c.id === 'model' ? '<canvas class="hc-wave" width="400" height="40"></canvas>' : '<div class="hc-bar"><i></i></div>'));
    c.el = el; c.q = { sub: el.querySelector('.hc-sub'), r: el.querySelector('.hc-r'), bar: el.querySelector('.hc-bar i'), wave: el.querySelector('canvas') };
    c.cache = {}; c.st = { s: 'idle' };
    el.style.transitionDelay = (i * 45) + 'ms';
    el.title = 'Kliknij: szczegóły w Process Log';
    el.onclick = () => { J.sfx.click(); if (c.id === 'model') { J.wm.open('settings', { view: 'section', target: 'hermes' }); } if (c.id === 'model') J.toast((J.aiReady() ? 'Hermes · ' + J.state.settings.hermesModel + (J.hermes.latency ? ' · ping ' + J.hermes.latency + ' ms' : '') : 'Silnik lokalny') + ' · tury: ' + eg.turns + ' · znaki rozumowania: ' + eg.thinkChars); else if (c.id === 'status') J.wm.open('monitor'); else if (c.id === 'files' && J.apps.files) J.wm.open('files'); else if (c.id === 'done' && eg.last) $('#resultChip')?.classList.add('show'); else J.proc.open(); };
    el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.onclick(); } };   // karta jest przyciskiem także z klawiatury
    hud.appendChild(el);
  });
  hud.inert = true;   // karty są przezroczyste, dopóki HUD się nie pokaże — wtedy poza kolejnością Tab i czytnikiem
  layout();
};
const paint = () => {
  CARDS.forEach(c => {
    const st = STATE[c.id](); c.st = st; const q = c.q, ca = c.cache;
    if (ca.s !== st.s) { c.el.dataset.s = st.s; ca.s = st.s; }
    if (ca.sub !== st.sub) { q.sub.textContent = st.sub; ca.sub = st.sub; }
    const r = st.r || '';
    if (ca.r !== r) { if (r === '✓') q.r.innerHTML = J.icon('check'); else q.r.textContent = r; ca.r = r; q.r.classList.toggle('pill', !!st.pill); q.r.classList.toggle('dotr', !!st.dot); }
    if (q.bar) {
      const p = st.pct == null ? -1 : Math.round(st.pct * 100);
      if (ca.p !== p) { ca.p = p; q.bar.parentElement.classList.toggle('ind', p < 0); q.bar.style.transform = p < 0 ? '' : 'scaleX(' + p / 100 + ')'; }
    }
  });
  markLead();
};
/* obramowanie energii (css/neon.css) dostaje jedna aktywna karta: ta, do której trafił ostatni pakiet (realne zdarzenie narzędzia/modelu), a gdy nie jest aktywna —
   pierwsza aktywna. Jeden pierścień zamiast siedmiu = ~4× mniej warstw kompozytora; klasa zmienia się tylko przy zmianie wskazania */
let leadId = null;
const pickLead = () => {
  const act = CARDS.filter(c => c.st.s === 'active' && c.id !== 'done'); if (!act.length) return null;
  const pk = eg.packets[eg.packets.length - 1], pri = pk ? J.hud.cardsFor(pk)[0] : null;
  return (act.find(c => c.id === pri) || act[0]).id;
};
const markLead = () => { const id = pickLead(); if (id === leadId) return; const was = CARDS.find(c => c.id === leadId), now = CARDS.find(c => c.id === id); leadId = id; was?.el.classList.remove('lead'); now?.el.classList.add('lead'); };
/* fala modelu: dane zmieniają się ~11×/s (co 90 ms), więc rysujemy tylko po zmianie próbek lub stanu on/off; jeden gradient na stan (alfa słupka przez globalAlpha) zamiast 56 gradientów na klatkę */
let waveSig = NaN, waveOn = null; const waveGrad = [null, null];
const drawWave = () => {
  const c = CARDS[0], cv = c.q.wave, wv = eg.wave, on = eg.nodes.model?.status === 'active';
  let sg = on ? 1 : 0; for (let i = 0; i < wv.length; i++) sg = sg * 1.0003 + wv[i];
  if (sg === waveSig) return; waveSig = sg;
  const g = cv.getContext('2d'), w = cv.width, hh = cv.height;
  g.clearRect(0, 0, w, hh);
  const gi = on ? 1 : 0;
  if (!waveGrad[gi] || waveGrad[gi].cv !== g) {
    const gr = g.createLinearGradient(0, hh, 0, 0), col = on ? '90,170,255' : '70,110,190';
    gr.addColorStop(0, `rgba(${col},1)`); gr.addColorStop(1, 'rgba(150,110,255,.8)'); waveGrad[gi] = { g: gr, cv: g };
  }
  g.fillStyle = waveGrad[gi].g;
  const n = wv.length, bw = w / n;
  for (let i = 0; i < n; i++) {
    const v = wv[i], a = on ? .35 + v * .65 : .28;
    const bh = 2 + v * (hh - 6) * (.55 + .45 * Math.sin(i * .9 + 1.3) ** 2);
    g.globalAlpha = a; g.fillRect(i * bw + 1, hh - bh, Math.max(1.5, bw - 2), bh);
  }
  g.globalAlpha = 1;
};

const visible = () => !scene.narrow && (!!eg.taskId || Date.now() < eg.hudUntil);
const frame = now => {
  if (!mounted) return;
  const v = visible();
  if (v !== shown) { shown = v; $('#hud').classList.toggle('show', v); $('#hud').inert = !v; $('#workspace').classList.toggle('hud-on', v); if (v) paint(); }
  $('#hud').classList.toggle('busy', !!eg.taskId);
  if (!v) return;
  if (now - lastPaint > 160) { lastPaint = now; paint(); }
  drawWave();
};

J.hud = {
  CARDS, scene, layout, horizonFor, frame, paint, pickLead, panelBoxes, fitCard, get visible() { return shown; }, get ver() { return layoutVer; },
  /* które karty dostają pakiet danych o danym węźle */
  cardsFor(pk) {
    const out = pk.node === 'model' ? ['model', 'logic'] : pk.node === 'internet' ? ['internet', 'tools'] : pk.node === 'files' ? ['files', 'tools'] : ['tools'];
    if (pk.node !== 'model') out.push('exec');
    if (pk.src === 'hermes' && pk.node !== 'model') out.push('external');
    return out;
  },
  init() { mount(); new ResizeObserver(layout).observe($('#desktop')); addEventListener('resize', layout); J.on('panels', layout); J.ev.on('*', () => { if (mounted) paint(); }); layout(); }
};
})();
