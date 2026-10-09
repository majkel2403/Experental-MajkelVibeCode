/* =========================================================
   JARVIS OS — Dashboard agenta: tryb, pasek statusu, telemetria
   Wszystko z realnych źródeł: J.engine (maszyna stanów), J.hermes,
   J.fps, performance.memory, navigator.*, J.state. Bez danych „na niby”.
   ========================================================= */
'use strict';
(() => {
const { $, $$ } = J;
const eg = J.engine;
J.bootTime = J.bootTime || Date.now();

/* ---------- tryb agenta (segmentowy wskaźnik w pasku górnym) ---------- */
const MODE_LABEL = { IDLE: 'GOTOWY', STANDBY: 'CZUWAM', LISTENING: 'SŁUCHAM', THINKING: 'ANALIZA', EXECUTING: 'DZIAŁANIE', APPROVAL_REQUIRED: 'ZGODA?', PAUSED: 'PAUZA', RECOVERING: 'AWARYJNIE', VERIFYING: 'WERYFIKACJA', COMPLETED: 'GOTOWE', ERROR: 'BŁĄD', SPEAKING: 'MÓWIĘ' };
const SEG_OF = { APPROVAL_REQUIRED: 'EXECUTING', PAUSED: 'EXECUTING', RECOVERING: 'EXECUTING', VERIFYING: 'EXECUTING', ERROR: 'COMPLETED', STANDBY: 'IDLE' };
const modeHud = $('#modeHud'), segs = $$('.mh-seg', modeHud), dkMode = $('#dkMode');
let lastMode = '', lastFine = '';
const syncMode = () => {
  const m = eg.mode === 'IDLE' && J.ear.standby ? 'STANDBY' : eg.mode;
  if (m !== lastMode) {
    lastMode = m; modeHud.dataset.mode = m;
    const seg = SEG_OF[m] || m;
    segs.forEach(s => s.classList.toggle('on', s.dataset.m === seg));
    segs[segs.length - 1].textContent = m === 'ERROR' ? 'Błąd' : 'Gotowe';
    segs[3].textContent = m === 'APPROVAL_REQUIRED' ? 'Zgoda?' : m === 'PAUSED' ? 'Pauza' : m === 'RECOVERING' ? 'Awaryjnie' : 'Działanie';
    segs[0].textContent = m === 'STANDBY' ? 'Czuwam' : 'Gotowy';
  }
  /* linia skanu (.scan): #app[data-working] ustawia js/fx-director.js (jedno źródło prawdy) */
  const fine = (m === 'IDLE' || m === 'STANDBY') && J.orb.state === 'speaking' ? 'SPEAKING' : m;
  if (fine !== lastFine) { lastFine = fine; dkMode.textContent = MODE_LABEL[fine] || fine; dkMode.dataset.m = fine; }
};

/* ---------- status Hermesa / narzędzi / FPS / zegar ---------- */
const tsAi = $('#tsAi'), tsTools = $('#tsTools'), tsFps = $('#tsFps'), tsClock = $('#tsClock'), tsEco = $('#tsEco');
/* rozbłysk diody przy realnej zmianie stanu (opacity+transform pseudo-elementu, 0,7 s); tylko standard/cinema, koniec przez animationend */
const flash = el => { if (J.fx?.rank?.() < 2) return; el.classList.add('flash'); };   // trwający rozbłysk nie jest restartowany (bez wymuszania layoutu)
document.addEventListener('animationend', e => { if (e.animationName === 'tsFlash') e.target.parentElement?.classList.remove('flash'); });
const syncAi = () => {
  const ai = J.aiReady(), st = J.hermes.status;
  const [s, t] = !ai ? ['local', 'lokalny'] : st === 'up' ? ['up', J.state.settings.hermesModel] : st === 'down' ? ['down', 'offline'] : ['unknown', 'sprawdzam…'];
  if (tsAi.dataset.s !== s) { tsAi.dataset.s = s; flash(tsAi); } $('em', tsAi).textContent = t;
};
J.on('hermes', syncAi); J.on('settings', syncAi); J.on('bridge', syncAi);
/* Jev (sędzia): widoczny w pasku tylko gdy włączony */
const tsJev = $('#tsJev');
const syncJev = () => { const on = J.judge?.enabled(); tsJev.classList.toggle('hidden', !on); if (!on) return; const st = J.judge.status; const ds = st.state === 'up' ? 'up' : st.state === 'down' ? 'down' : 'unknown'; if (tsJev.dataset.s !== ds) { tsJev.dataset.s = ds; flash(tsJev); } $('em', tsJev).textContent = st.state === 'up' ? st.latency + ' ms · ' + st.calls : st.state === 'down' ? 'błąd' : 'gotowy'; tsJev.title = 'Jev (sędzia) · wywołania: ' + st.calls + ' · koszt: $' + st.cost.toFixed(5) + (st.lastError ? ' · ' + st.lastError : ''); };
J.on('judge', syncJev); J.on('settings', syncJev); syncJev();
const syncTools = () => {
  const busy = !!eg.taskId;
  J.led($('em', tsTools), busy ? eg.toolsFinished + '/' + eg.toolsStarted : String(J.state.stats.actions || 0));
  tsTools.classList.toggle('busy', busy);
};
J.ev.on('*', syncTools); J.on('action', syncTools);

/* ---------- telemetria (dolny lewy róg) ---------- */
const deck = $('#deck');
let bat = null; navigator.getBattery?.().then(b => { bat = b; }).catch(() => { });
const fmtUp = s => { const hh = Math.floor(s / 3600), mm = Math.floor(s % 3600 / 60); return hh ? hh + ':' + J.pad(mm) + ':' + J.pad(Math.floor(s % 60)) : mm + ':' + J.pad(Math.floor(s % 60)); };
/* ECO: dioda tylko, gdy regulator (J.fx.lower) realnie obniżył poziom efektów; gaśnie po przywróceniu (zdarzenie 'fx') */
const ecoSync = () => { const on = !!J.fx?.eco?.(); tsEco.classList.toggle('hidden', !on); if (on) { const t = 'Obniżono poziom efektów do „' + J.fx.level() + '” — FPS ' + (J.fps || '—'); tsEco.title = t; tsEco.setAttribute('aria-label', t); } };
J.on('fx', ecoSync);
const tick = () => {
  const fps = J.fps || 0; if (!tsEco.classList.contains('hidden')) ecoSync();
  J.led($('em', tsFps), fps || '--');
  const fb = J.fpsBand(fps); if (tsFps.dataset.s !== fb) tsFps.dataset.s = fb;   // progi wspólne z regulatorem efektów (J.FPS_LOW/J.FPS_OK, main.js adapt)
  J.led(tsClock.querySelector('em'), new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  if (deck.classList.contains('min')) return;
  J.led($('#dkFps'), fps || '--');
  const mem = performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null;
  $('#dkMem').textContent = mem != null ? mem.toFixed(0) + ' MB' : 'n/d';
  const cn = navigator.connection;
  $('#dkNet').textContent = !navigator.onLine ? 'OFFLINE' : cn?.effectiveType ? cn.effectiveType.toUpperCase() : 'ONLINE';
  $('#dkNet').dataset.s = navigator.onLine ? 'ok' : 'off';
  $('#dkBat').textContent = bat ? Math.round(bat.level * 100) + '%' + (bat.charging ? ' ⚡' : '') : 'n/d';
  const today = J.tasks.today(), done = today.filter(t => t.done).length;
  $('#dkTasks').textContent = today.length ? done + ' / ' + today.length : '0';
  J.led($('#dkTools'), String(J.state.stats.actions || 0));
  J.led($('#dkUp'), fmtUp((Date.now() - J.bootTime) / 1000));
  $('#dkWin').textContent = String(J.wm.count());
};

/* wykres aktywności agenta: próbka co 250 ms z J.engine.activity (stała skala 0–1) */
const spark = $('#dkSpark'), hist = new Array(96).fill(0);
/* przerysowanie tylko po zmianie obrazu (nowe dane, kolor, rozmiar, rozwinięcie panelu); wymiary z cache ResizeObserver — bez odczytu layoutu 4×/s */
let skDirty = true, skRgb = '', flat = 0, lastV = -1;
const drawSpark = () => {
  if (deck.classList.contains('min') || document.hidden) return;
  const bx = J.canvasBox(spark), w = bx.w, hh = bx.h; if (!w || !hh) return;
  const rgb = eg.rgb() || J.rgb(J.state.settings.accent);
  if (!skDirty && rgb === skRgb) return; skDirty = false; skRgb = rgb;
  const dpr = J.fitCanvas(spark, w, hh, 2);
  const c = spark.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, hh);
  const X = i => i / (hist.length - 1) * w, Y = v => hh - 2 - J.clamp(v, 0, 1) * (hh - 5);
  c.beginPath(); hist.forEach((v, i) => i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v)));
  c.globalAlpha = .2; c.strokeStyle = `rgb(${rgb})`; c.lineWidth = 6; c.stroke(); c.globalAlpha = 1;   // poświata: szeroki przebieg zamiast shadowBlur
  c.strokeStyle = `rgba(${rgb},.95)`; c.lineWidth = 1.5; c.stroke();
  c.lineTo(w, hh); c.lineTo(0, hh); c.closePath();
  const g = c.createLinearGradient(0, 0, 0, hh); g.addColorStop(0, `rgba(${rgb},.35)`); g.addColorStop(1, `rgba(${rgb},0)`); c.fillStyle = g; c.fill();
  // siatka HUD
  c.strokeStyle = 'rgba(160,200,255,.08)'; c.lineWidth = 1; c.beginPath(); for (let x = 0; x < w; x += 24) { c.moveTo(x + .5, 0); c.lineTo(x + .5, hh); } c.stroke();
};
let lastAct = '';
setInterval(() => {
  const v = J.clamp(eg.activity, 0, 1);
  /* linia płaska od całej długości historii i bez zmiany wartości = ten sam obraz: nie przerysowujemy */
  flat = v === lastV ? flat + 1 : 0; lastV = v; hist.push(v); hist.shift(); if (flat < hist.length) skDirty = true;
  const t = Math.round(v * 100) + '%'; if (t !== lastAct) { lastAct = t; $('#dkAct').textContent = t; }
  drawSpark();
}, 250);
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { skDirty = true; }).observe(spark);

/* zwijanie telemetrii (zapamiętywane) */
const setDeck = min => { deck.classList.toggle('min', min); J.state.ui.deckMin = min; J.save(); };
$('#deckHead').onclick = () => { setDeck(!deck.classList.contains('min')); J.sfx.click(); };
deck.classList.toggle('min', !!J.state.ui.deckMin);

/* ---------- start ---------- */
syncAi(); syncTools(); syncMode(); tick();
setInterval(syncMode, 150);
setInterval(tick, 1000);
addEventListener('online', tick); addEventListener('offline', tick);
J.on('wm', () => { $('#dkWin').textContent = String(J.wm.count()); });
J.on('tasks', tick);
})();
