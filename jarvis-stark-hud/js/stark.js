/* =========================================================
   JARVIS OS — układ „Stark” (pulpit w stylu HUD Iron Mana)
   Pasek dni miesiąca, tarcza daty, dyski, RAM, sieć, pogoda, system,
   ostatnia notatka, powiadomienia, bieżące zadanie i reaktor wokół Core.
   Zasada projektu bez wyjątków: każda liczba pochodzi z realnego źródła
   (zegar, J.weather, most: /bridge/system, navigator.*, J.engine, J.state).
   Bez źródła pole pokazuje „—” albo powód (np. „most offline”).
   ========================================================= */
'use strict';
(() => {
const { $, $$, h, esc } = J;
const S = () => J.state.settings;
const eg = J.engine;
const app = $('#app'), desktop = $('#desktop');
const isOn = () => (S().layout || 'stark') === 'stark';

/* ---------- pomocnicze SVG ---------- */
const P = (r, a) => [Math.cos((a - 90) * Math.PI / 180) * r, Math.sin((a - 90) * Math.PI / 180) * r];   // 0° = góra, zgodnie z zegarem
const arc = (r, a0, a1) => { const [x0, y0] = P(r, a0), [x1, y1] = P(r, a1); return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
const ticks = (r, len, n, every = 5, long = 2) => { let d = ''; for (let i = 0; i < n; i++) { const l = i % every ? len : len * long, [x0, y0] = P(r, i * 360 / n), [x1, y1] = P(r - l, i * 360 / n); d += `M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}`; } return d; };
/* tarcza z obwódką postępu (0–1) — wspólna dla daty, pogody, RAM i sieci */
const dial = (id, size, inner) => `<svg class="sk-ring" viewBox="-60 -60 120 120" width="${size}" height="${size}" aria-hidden="true">
  <circle r="56" class="sk-r0"/><path class="sk-tk" d="${ticks(56, 3, 60)}"/>
  <circle r="47" class="sk-r1"/><path class="sk-pr" id="${id}" d="${arc(47, 0, 359.99)}" pathLength="100" stroke-dasharray="0 100"/>
  <circle r="40" class="sk-r2"/><path class="sk-spin" d="${arc(52, 20, 70)}M${P(52, 200).join(' ')}${arc(52, 200, 250).slice(arc(52, 200, 250).indexOf('A'))}"/>
</svg><div class="sk-dial-in">${inner}</div>`;
const setPr = (id, v) => { const e = document.getElementById(id); if (e) e.setAttribute('stroke-dasharray', (v == null ? 0 : J.clamp(v, 0, 1) * 100).toFixed(2) + ' 100'); };

/* zmiana wartości = krótki błysk hologramu; liczby dobiegają do nowej wartości (bez wymyślania pośrednich danych — to tylko animacja przejścia) */
const flash = e => { e.classList.remove('sk-flash'); void e.offsetWidth; e.classList.add('sk-flash'); };
const put = (id, txt) => { const e = document.getElementById(id); if (!e || e.textContent === txt) return; const was = e.textContent; e.textContent = txt; if (was && was !== '—' && was !== '--°') flash(e); };
const RM = matchMedia('(prefers-reduced-motion: reduce)');
const count = (id, v, fmt) => {
  const e = document.getElementById(id); if (!e) return;
  if (v == null || !isFinite(v)) { e._v = null; put(id, fmt(null)); return; }
  const from = e._v; e._v = v;
  if (from == null || from === v || RM.matches || (J.fx?.rank?.() ?? 2) < 2) { put(id, fmt(v)); return; }
  flash(e); const t0 = performance.now(), run = t => { const k = Math.min(1, (t - t0) / 700), q = 1 - Math.pow(1 - k, 3); if (e._v !== v) return; e.textContent = fmt(from + (v - from) * q); if (k < 1) requestAnimationFrame(run); };
  requestAnimationFrame(run);
};

/* ---------- budowa warstwy ---------- */
const root = h('div', { class: 'stark', id: 'stark', 'aria-label': 'Panel Stark' }, `
  <div class="sk-days" id="skDays" role="list" aria-label="Dni miesiąca"></div>
  <div class="sk-title" aria-hidden="true"><i></i><span>J.A.R.V.I.S.</span><i></i></div>
  <aside class="sk-col sk-left">
    <button class="sk-dial sk-date" id="skDate" title="Harmonogram">${dial('skDatePr', 168, '<small id="skWd">—</small><b id="skDay">--</b><span id="skMon">—</span><em id="skTime">--:--:--</em>')}</button>
    <section class="sk-box" id="skDiskBox"><h4>Dyski <em id="skDiskSrc"></em></h4><div id="skDisks"><div class="sk-dim">—</div></div></section>
    <div class="sk-pair">
      <button class="sk-dial sk-mini" id="skRam" title="Pamięć RAM (Monitor systemu)">${dial('skRamPr', 104, '<small>RAM</small><b id="skRamV">—</b><span id="skRamS">—</span>')}</button>
      <button class="sk-dial sk-mini" id="skNet" title="Połączenie sieciowe">${dial('skNetPr', 104, '<small>Sieć</small><b id="skNetV">—</b><span id="skNetS">—</span>')}</button>
    </div>
    <section class="sk-box sk-lines" id="skUp">
      <div><span>Komputer działa</span><b id="skUpPc">—</b></div>
      <div><span>Sesja Jarvisa</span><b id="skUpJ">0:00</b></div>
      <div><span>Hermes</span><b id="skHerm">—</b></div>
      <div><span>Most pulpitu</span><b id="skBridge">—</b></div>
    </section>
    <section class="sk-box sk-holo" id="skHolo" aria-hidden="true"><h4>Skan systemu</h4><svg viewBox="0 0 120 220" aria-hidden="true"><g class="sk-fig"><circle cx="60" cy="24" r="13"/><path d="M44 44h32l14 10 6 52-10 4-6-34v34l4 66h-14l-6-62-6 62H48l4-66v-34l-6 34-10-4 6-52z"/><path class="in" d="M60 54v40M48 62h24M52 100h16"/><circle class="arc" cx="60" cy="68" r="5"/></g><rect class="sk-scan" x="0" y="0" width="120" height="3"/></svg><div class="sk-hs"><div><span>Tryb</span><b id="skHsM">—</b></div><div><span>Aktywność</span><b id="skHsA">—</b></div><div><span>Okna</span><b id="skHsW">—</b></div><div><span>Akcje</span><b id="skHsT">—</b></div></div></section>
    <button class="sk-search" id="skSearch" title="Paleta poleceń (Ctrl+K)"><span>Szukaj</span><kbd>Ctrl K</kbd></button>
  </aside>
  <aside class="sk-col sk-right">
    <button class="sk-dial sk-wx" id="skWx" title="Pogoda">${dial('skWxPr', 150, '<small id="skWxCity">—</small><b id="skWxT">--°</b><span id="skWxD">—</span><em id="skWxF"></em>')}</button>
    <section class="sk-box sk-sys"><h4>System <em id="skSysSrc"></em></h4>
      <div class="sk-bar" data-k="cpu"><span>Procesor</span><i><u id="skCpuB"></u></i><b id="skCpu">—</b></div>
      <div class="sk-bar" data-k="ram"><span>Pamięć RAM</span><i><u id="skMemB"></u></i><b id="skMem">—</b></div>
      <div class="sk-bar" data-k="disk"><span id="skDskL">Dysk</span><i><u id="skDskB"></u></i><b id="skDsk">—</b></div>
      <div class="sk-sparkbox"><canvas class="sk-spark" id="skSpark"></canvas><span class="sk-lg"><i class="c"></i>CPU <i class="m"></i>RAM <em id="skSparkN"></em></span></div>
    </section>
    <button class="sk-box sk-note" id="skNote" title="Notatnik"><h4>Notatka</h4><b id="skNoteT">—</b><p id="skNoteB"></p></button>
    <section class="sk-box sk-news"><h4>Powiadomienia <em id="skNewsN"></em></h4><div id="skNews"></div></section>
  </aside>
  <section class="sk-project" id="skProject" aria-live="polite"><h4>Zadanie Jarvisa</h4><div class="sk-pj"><b id="skPjT">Brak aktywnego zadania</b><span id="skPjS">—</span></div><i class="sk-pjbar"><u id="skPjB"></u></i></section>`);
desktop.insertBefore(root, $('.center-stage', desktop));

/* reaktor wokół Core: rysowany w #coreWrap, więc dziedziczy jego położenie i skalę z hud.js */
const MODE_PL = { IDLE: 'GOTOWY', LISTENING: 'SŁUCHAM', THINKING: 'ANALIZA', EXECUTING: 'DZIAŁANIE', APPROVAL_REQUIRED: 'ZGODA?', PAUSED: 'PAUZA', RECOVERING: 'AWARYJNIE', VERIFYING: 'WERYFIKACJA', COMPLETED: 'GOTOWE', ERROR: 'BŁĄD' };
const SEG = 24;
const reactor = h('div', { class: 'sk-reactor', 'aria-hidden': 'false' }, `
  <svg viewBox="-360 -360 720 720" aria-hidden="true">
    <defs><path id="skDiagPath" d="${arc(236, 222, 318)}"/><path id="skModePath" d="${(() => { const [x0, y0] = P(176, 240), [x1, y1] = P(176, 120); return `M${x0} ${y0}A176 176 0 0 0 ${x1} ${y1}`; })()}"/></defs>
    <circle r="268" class="sk-r0"/><path class="sk-tk" d="${ticks(266, 5, 120, 5, 2.2)}"/>
    <circle r="300" class="sk-r3"/><path class="sk-tk2" d="${ticks(300, 4, 72, 3, 2)}"/>
    <g class="sk-deg">${[30, 150, 180, 210, 330].map(dg => { const [x, y] = P(282, dg); return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="middle">${String(dg).padStart(3, '0')}</text>`; }).join('')}</g>
    <g class="sk-rot c">${[45, 135, 225, 315].map(dg => { const [x0, y0] = P(256, dg - 3), [x1, y1] = P(256, dg + 3), [x2, y2] = P(244, dg); return `<path class="sk-tri" d="M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}Z"/>`; }).join('')}</g>
    <g class="sk-rot d"><path class="sk-lock" d="${arc(312, 350, 370)}"/><path class="sk-lock" d="${arc(312, 170, 190)}"/></g>
    <g class="sk-rot a"><path class="sk-arcw" d="${arc(248, 10, 80)}"/><path class="sk-arcw" d="${arc(248, 130, 160)}"/><path class="sk-arcw" d="${arc(248, 190, 300)}"/></g>
    <g class="sk-rot b"><circle r="228" class="sk-dash"/></g>
    <circle r="212" class="sk-r1"/><path class="sk-pr" id="skSecPr" d="${arc(212, 0, 359.99)}" pathLength="60" stroke-dasharray="0 60"/>
    <path class="sk-frame" d="${arc(196, 300, 420)}"/><path class="sk-frame" d="${arc(196, 140, 220)}"/>
    <g id="skSegs">${Array.from({ length: SEG }, (_, i) => `<path class="sk-seg" d="${arc(160, i * 360 / SEG + 2, (i + 1) * 360 / SEG - 2)}"/>`).join('')}</g>
    <text class="sk-curve"><textPath href="#skDiagPath" startOffset="50%" text-anchor="middle">SYSTEM DIAGNOSTICS · JARVIS</textPath></text>
    <text class="sk-mode"><textPath href="#skModePath" startOffset="50%" text-anchor="middle" id="skModeT">GOTOWY</textPath></text>
    <text class="sk-clock" y="-178" text-anchor="middle" id="skClock">--:--</text>
  </svg>
  <canvas class="sk-spec" id="skSpec" aria-hidden="true"></canvas>
  <div class="sk-diag" id="skDiag"></div>
  <div class="sk-apps" id="skApps"></div>`);
$('#coreWrap').appendChild(reactor);

/* ---------- dni miesiąca (pasek górny) ---------- */
let daysKey = '';
const renderDays = () => {
  const d = new Date(), y = d.getFullYear(), m = d.getMonth(), n = new Date(y, m + 1, 0).getDate(), today = d.getDate();
  const busy = new Set(J.state.tasks.filter(t => !t.done && t.date?.startsWith(y + '-' + J.pad(m + 1))).map(t => +t.date.slice(8, 10)));
  const key = y + '-' + m + '-' + today + '|' + [...busy].join(',');
  if (key === daysKey) return; daysKey = key;
  const box = $('#skDays'); box.innerHTML = '';
  for (let i = 1; i <= n; i++) {
    const wd = new Date(y, m, i).getDay();
    const b = h('button', { class: 'sk-dd' + (i === today ? ' now' : i < today ? ' past' : '') + (wd === 0 || wd === 6 ? ' we' : '') + (busy.has(i) ? ' busy' : ''), role: 'listitem', title: new Date(y, m, i).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }) + (busy.has(i) ? ' · są zadania' : '') }, J.pad(i));
    b.onclick = () => { J.wm.open('schedule'); J.sfx.click(); };
    box.appendChild(b);
  }
};

/* ---------- reaktor: stan systemu i skróty aplikacji ---------- */
const APPS = ['chat', 'notes', 'market', 'schedule', 'weather', 'terminal', 'monitor', 'calc', 'timer'];
const APP_LABEL = { chat: 'Czat', notes: 'Notatnik', market: 'Tokeny', schedule: 'Harmonogram', weather: 'Pogoda', terminal: 'Terminal', monitor: 'Monitor', calc: 'Kalkulator', timer: 'Minutnik' };
const ARC_R = 292;
const place = (el, i, n, side) => { const y = (i - (n - 1) / 2) * 34, x = Math.sqrt(Math.max(0, ARC_R * ARC_R - y * y)); el.style.transform = `translate(${side * x}px,${y}px)`; el.style.setProperty('--j', String(i)); };
const renderApps = () => {
  const box = $('#skApps'); box.innerHTML = '';
  const ids = APPS.filter(id => J.apps[id]);
  ids.forEach((id, i) => {
    const b = h('button', { class: 'sk-app', 'data-app': id, title: J.apps[id].title }, `<i></i><span>${esc(APP_LABEL[id] || J.apps[id].title)}</span>`);
    b.onclick = () => { id === 'chat' ? J.chatPanel.toggle() : J.wm.toggle(id); J.sfx.click(); };
    place(b, i, ids.length, 1); box.appendChild(b);
  });
  syncApps();
};
const syncApps = () => $$('.sk-app', reactor).forEach(b => { const id = b.dataset.app; b.classList.toggle('run', id === 'chat' ? !!J.chatPanel?.isOpen : J.wm.isOpen(id)); });

/* diagnostyka: realne stany podsystemów */
const DIAG = [
  ['hermes', 'Hermes', () => !J.aiReady() ? ['off', 'lokalny'] : J.hermes.status === 'up' ? ['ok', 'online'] : J.hermes.status === 'down' ? ['err', 'offline'] : ['wait', 'sprawdzam']],
  ['bridge', 'Most', () => J.bridge.connected ? ['ok', 'połączony'] : S().bridgeOn ? ['err', 'offline'] : ['off', 'wyłączony']],
  ['jev', 'Jev', () => !J.judge?.enabled() ? ['off', 'wyłączony'] : J.judge.status.state === 'down' ? ['err', 'błąd'] : ['ok', J.judge.status.state === 'up' ? J.judge.status.latency + ' ms' : 'gotowy']],
  ['voice', 'Głos', () => J.ear.active ? ['ok', 'słucham'] : J.ear.standby ? ['ok', 'czuwam'] : J.ear.supported ? ['off', 'gotowy'] : ['err', 'brak']],
  ['net', 'Sieć', () => navigator.onLine && !S().offlineMode ? ['ok', 'online'] : ['err', S().offlineMode ? 'tryb offline' : 'offline']],
  ['tools', 'Narzędzia', () => [eg.taskId ? 'ok' : 'off', eg.taskId ? eg.toolsFinished + '/' + eg.toolsStarted : String(J.state.stats.actions || 0) + ' akcji']]
];
const renderDiag = () => {
  const box = $('#skDiag'); box.innerHTML = '';
  DIAG.forEach(([k, label], i) => { const r = h('div', { class: 'sk-dg', 'data-k': k }, `<b></b><span>${label}</span><i></i>`); place(r, i, DIAG.length, -1); box.appendChild(r); });
};
const syncDiag = () => DIAG.forEach(([k, , f]) => { const r = $(`.sk-dg[data-k="${k}"]`, reactor); if (!r) return; const [s, t] = f(); r.dataset.s = s; if (r.firstChild.textContent !== t) r.firstChild.textContent = t; });

/* ---------- stan komputera z mostu (bridge/system_info.py) ---------- */
let sys = null, sysErr = '', sysT = 0, sysBusy = false;
const hist = [];   // realne próbki [CPU %, RAM %] z mostu co 5 s (ostatnie 5 minut)
const drawSpark = () => {
  const cvs = $('#skSpark'); if (!cvs) return; const w = cvs.clientWidth, hh = cvs.clientHeight; if (!w || !hh) return;
  const dpr = Math.min(devicePixelRatio || 1, 2); if (cvs.width !== Math.round(w * dpr)) { cvs.width = Math.round(w * dpr); cvs.height = Math.round(hh * dpr); }
  const c = cvs.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, hh);
  c.strokeStyle = 'rgba(120,190,255,.10)'; c.lineWidth = 1; c.beginPath(); for (let y = 0; y <= 4; y++) { const yy = Math.round(y / 4 * (hh - 1)) + .5; c.moveTo(0, yy); c.lineTo(w, yy); } c.stroke();
  $('#skSparkN').textContent = hist.length ? hist.length * 5 + ' s' : 'brak próbek';
  if (hist.length < 2) { c.fillStyle = 'rgba(143,176,212,.7)'; c.font = '10px Rajdhani, sans-serif'; c.textAlign = 'center'; c.fillText(sys ? 'zbieram próbki…' : 'wykres po połączeniu mostu', w / 2, hh / 2 + 3); return; }
  const A = J.rgb(S().accent), B = J.rgb(S().accent2), X = i => w - (hist.length - 1 - i) * (w / 59), Y = v => hh - 1 - J.clamp(v, 0, 100) / 100 * (hh - 3);
  [[0, A], [1, B]].forEach(([k, rgb]) => {
    c.beginPath(); let st = false; hist.forEach((s, i) => { if (s[k] == null) { st = false; return; } st ? c.lineTo(X(i), Y(s[k])) : c.moveTo(X(i), Y(s[k])); st = true; });
    c.strokeStyle = `rgba(${rgb},.95)`; c.lineWidth = 1.4; c.shadowColor = `rgba(${rgb},.9)`; c.shadowBlur = 6; c.stroke(); c.shadowBlur = 0;
    c.lineTo(X(hist.length - 1), hh); c.lineTo(X(hist.findIndex(s => s[k] != null)), hh); c.closePath(); const g = c.createLinearGradient(0, 0, 0, hh); g.addColorStop(0, `rgba(${rgb},.22)`); g.addColorStop(1, `rgba(${rgb},0)`); c.fillStyle = g; c.fill();
  });
};
const fetchSys = async () => {
  if (sysBusy || document.hidden || !isOn()) return;
  if (!S().bridgeToken || !J.bridge.connected) { sys = null; sysErr = S().bridgeOn ? 'most offline' : 'most wyłączony'; renderSys(); return; }
  sysBusy = true;
  try {
    const r = await fetch(String(S().bridgeUrl || 'http://127.0.0.1:8651').replace(/\/+$/, '') + '/bridge/system?processes=0', { headers: { 'X-Bridge-Token': S().bridgeToken }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(); sys = j.data || null; sysErr = ''; sysT = Date.now();
    if (sys) { hist.push([sys.cpu?.percent ?? null, sys.memory?.used_pct ?? null]); if (hist.length > 60) hist.shift(); }
  } catch (e) { sysErr = 'brak odczytu'; if (Date.now() - sysT > 30000) sys = null; }
  finally { sysBusy = false; renderSys(); }
};
const pct = v => v == null ? '—' : Math.round(v) + '%';
const gb = v => v == null ? '—' : (v >= 100 ? Math.round(v) : v.toFixed(1).replace('.', ',')) + ' GB';
const bar = (id, v) => { const e = document.getElementById(id); if (e) { e.style.width = (v == null ? 0 : J.clamp(v, 0, 100)) + '%'; e.parentElement.parentElement.dataset.hot = v >= 90 ? '2' : v >= 75 ? '1' : '0'; } };
let storeEst = null;
navigator.storage?.estimate?.().then(e => { storeEst = e; renderSys(); }).catch(() => { });
const renderSys = () => {
  const src = sys ? 'most' : sysErr;
  $('#skSysSrc').textContent = src; $('#skDiskSrc').textContent = src;
  const disks = sys?.disks || [], mem = sys?.memory, cpu = sys?.cpu?.percent;
  /* dyski */
  const box = $('#skDisks');
  if (disks.length) {
    box.innerHTML = disks.slice(0, 3).map(d => `<div class="sk-disk"><div><span>Dysk ${esc(String(d.drive))}</span><b>${gb(d.free_gb)} wolne</b></div><i data-hot="${d.used_pct >= 90 ? 2 : d.used_pct >= 75 ? 1 : 0}"><u style="width:${J.clamp(+d.used_pct || 0, 0, 100)}%"></u></i><small>${gb(d.used_gb)} z ${gb(d.total_gb)} · ${pct(d.used_pct)}</small></div>`).join('');
  } else if (storeEst?.quota) {
    const u = storeEst.usage / 1048576, q = storeEst.quota / 1073741824;
    box.innerHTML = `<div class="sk-disk"><div><span>Dane przeglądarki</span><b>${u.toFixed(1).replace('.', ',')} MB</b></div><i data-hot="0"><u style="width:${J.clamp(storeEst.usage / storeEst.quota * 100, 0.5, 100)}%"></u></i><small>limit ${gb(q)} · dyski komputera po połączeniu mostu</small></div>`;
  } else box.innerHTML = '<div class="sk-dim">Dyski komputera widać po połączeniu mostu.</div>';
  /* RAM: z mostu, a bez niego — sterta tej karty */
  if (mem) { count('skRamV', mem.used_pct, pct); put('skRamS', gb(mem.free_gb) + ' wolne'); setPr('skRamPr', mem.used_pct / 100); }
  else if (performance.memory) { const used = performance.memory.usedJSHeapSize, lim = performance.memory.jsHeapSizeLimit; count('skRamV', used / 1048576, v => v == null ? '—' : Math.round(v) + ' MB'); $('#skRamS').textContent = 'ta karta'; setPr('skRamPr', used / lim); }
  else { $('#skRamV').textContent = '—'; $('#skRamS').textContent = 'brak odczytu'; setPr('skRamPr', null); }
  /* paski systemu */
  count('skCpu', cpu, pct); bar('skCpuB', cpu);
  count('skMem', mem?.used_pct, pct); bar('skMemB', mem?.used_pct);
  const d0 = disks[0]; $('#skDskL').textContent = d0 ? 'Dysk ' + d0.drive : 'Dysk'; count('skDsk', d0?.used_pct, pct); bar('skDskB', d0?.used_pct);
  drawSpark();
  put('skUpPc', sys?.uptime_h != null ? fmtH(sys.uptime_h) : '—');
  drawSpark();
};
const fmtH = hh => { const d = Math.floor(hh / 24), r = hh - d * 24; return (d ? d + ' d ' : '') + String(Math.round(r * 10) / 10).replace('.', ',') + ' h'; };

/* ---------- sieć (navigator.connection, tylko gdy przeglądarka podaje) ---------- */
const renderNet = () => {
  const cn = navigator.connection, online = navigator.onLine && !S().offlineMode;
  if (!online) { $('#skNetV').textContent = 'OFF'; $('#skNetS').textContent = S().offlineMode ? 'tryb offline' : 'brak sieci'; setPr('skNetPr', 0); $('#skNet').dataset.s = 'off'; return; }
  $('#skNet').dataset.s = 'ok';
  if (cn?.downlink) { $('#skNetV').textContent = (cn.downlink >= 10 ? Math.round(cn.downlink) : cn.downlink.toFixed(1).replace('.', ',')) + ''; $('#skNetS').textContent = 'Mb/s · ' + (cn.rtt != null ? cn.rtt + ' ms' : (cn.effectiveType || '').toUpperCase()); setPr('skNetPr', Math.min(1, cn.downlink / 10)); }   // przeglądarka zaokrągla downlink i obcina go na 10 Mb/s
  else { $('#skNetV').textContent = 'ON'; $('#skNetS').textContent = 'online'; setPr('skNetPr', 1); }
};

/* ---------- pogoda (J.weather — te same dane co telemetria) ---------- */
const renderWx = d => {
  d = d || J.weather.data; if (!d?.current) return;
  const c = d.current, [ico, txt] = J.wxInfo(c.weather_code), u = d.units?.temp || '°C';
  $('#skWxCity').textContent = d.city + (d.stale ? ' · z pamięci' : '');
  count('skWxT', c.temperature_2m, v => v == null ? '--°' : Math.round(v) + '°');
  $('#skWxD').textContent = ico + ' ' + txt;
  $('#skWxF').textContent = 'odczuwalna ' + Math.round(c.apparent_temperature) + u.slice(0, 1) + ' · 💧' + c.relative_humidity_2m + '%';
  setPr('skWxPr', (c.relative_humidity_2m || 0) / 100);   // obwódka = wilgotność
};
J.on('weather', renderWx);

/* ---------- notatka, powiadomienia, zadanie ---------- */
const renderNote = () => {
  const n = [...J.state.notes].sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
  $('#skNoteT').textContent = n ? n.title || 'Bez tytułu' : 'Brak notatek';
  $('#skNoteB').textContent = n ? String(n.body || '').slice(0, 220) : 'Powiedz „zanotuj: …”, a notatka pojawi się tutaj.';
};
const rel = ts => { const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? 'teraz' : m < 60 ? m + ' min' : m < 1440 ? Math.round(m / 60) + ' h' : new Date(ts).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }); };
const renderNews = () => {
  const l = J.state.notifs.slice(0, 5), box = $('#skNews'), un = J.notifs?.unread?.() || 0;
  $('#skNewsN').textContent = un ? un + ' nowe' : '';
  box.innerHTML = '';
  if (!l.length) { box.innerHTML = '<div class="sk-dim">Cisza. Przypomnienia, minutnik i alerty pojawią się tutaj.</div>'; return; }
  l.forEach(n => { const b = h('button', { class: 'sk-nw' + (n.read ? '' : ' un') }, '<b></b><small></small>'); b.firstChild.textContent = n.title + (n.body ? ' — ' + n.body : ''); b.lastChild.textContent = rel(n.ts); b.onclick = () => J.notifs.open(); box.appendChild(b); });
};
const renderProject = () => {
  const busy = !!eg.taskId, txt = $('#taskText')?.textContent || '';
  const today = J.tasks.today(), done = today.filter(t => t.done).length;
  $('#skProject').classList.toggle('busy', busy);
  if (busy) {
    $('#skPjT').textContent = txt || 'Jarvis pracuje…';
    $('#skPjS').textContent = (MODE_PL[eg.mode] || eg.mode) + ' · narzędzia ' + eg.toolsFinished + '/' + eg.toolsStarted;
    $('#skPjB').style.width = (eg.toolsStarted ? J.clamp(eg.toolsFinished / eg.toolsStarted, 0, 1) * 100 : 8) + '%';
  } else {
    const next = today.find(t => !t.done);
    $('#skPjT').textContent = next ? (next.time ? next.time + ' · ' : '') + next.text : today.length ? 'Wszystkie dzisiejsze zadania zrobione' : 'Brak zadań na dziś';
    $('#skPjS').textContent = 'dziś: ' + done + ' / ' + today.length + ' zadań';
    $('#skPjB').style.width = (today.length ? done / today.length * 100 : 0) + '%';
  }
};

/* ---------- zegar i reaktor (co sekundę / co 250 ms) ---------- */
const fmtUp = s => { const hh = Math.floor(s / 3600), mm = Math.floor(s % 3600 / 60); return hh ? hh + ':' + J.pad(mm) + ':' + J.pad(Math.floor(s % 60)) : mm + ':' + J.pad(Math.floor(s % 60)); };
const secTick = () => {
  if (!isOn()) return;
  const d = new Date();
  $('#skWd').textContent = d.toLocaleDateString('pl-PL', { weekday: 'long' });
  $('#skDay').textContent = J.pad(d.getDate());
  $('#skMon').textContent = d.toLocaleDateString('pl-PL', { month: 'long' });
  $('#skTime').textContent = d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  $('#skClock').textContent = d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  setPr('skDatePr', (d.getDate() - 1 + (d.getHours() * 60 + d.getMinutes()) / 1440) / dim);   // obwódka = upływ miesiąca
  $('#skSecPr').setAttribute('stroke-dasharray', d.getSeconds() + ' 60');
  $('#skUpJ').textContent = fmtUp((Date.now() - (J.bootTime || Date.now())) / 1000);
  const ai = J.aiReady(); $('#skHerm').textContent = !ai ? 'lokalny' : J.hermes.status === 'up' ? 'online' : J.hermes.status === 'down' ? 'offline' : 'sprawdzam…';
  $('#skBridge').textContent = J.bridge.connected ? 'połączony' : S().bridgeOn ? 'offline' : 'wyłączony';
  const ns = J.state.notifs.length + ':' + (J.state.notifs[0]?.ts || 0) + ':' + (J.notifs?.unread?.() || 0);   // powiadomienia nie mają własnego zdarzenia — podpis listy
  if (ns !== newsSig) { newsSig = ns; renderNews(); }
  put('skHsW', String(J.wm.count())); put('skHsT', String(J.state.stats.actions || 0));
  if (!J.weather.data) { put('skWxCity', S().city || '—'); put('skWxD', !navigator.onLine || S().offlineMode ? 'offline' : 'brak danych'); }
  renderDays(); renderNet(); renderProject(); syncDiag();
};
let newsSig = '';
let lastMode = '', segOn = -1;
const fastTick = () => {
  if (!isOn()) return;
  const m = eg.mode;
  if (m !== lastMode) { lastMode = m; $('#skHolo').dataset.mode = m; $('#skModeT').textContent = MODE_PL[m] || m; reactor.dataset.mode = m; }
  const n = Math.round(J.clamp(eg.activity, 0, 1) * SEG);   // segmenty = aktywność agenta (J.engine.activity)
  put('skHsA', Math.round(J.clamp(eg.activity, 0, 1) * 100) + '%'); put('skHsM', MODE_PL[m] || m);
  if (n !== segOn) { segOn = n; $$('.sk-seg', reactor).forEach((s, i) => s.classList.toggle('on', i < n)); }
  app.classList.toggle('sk-hud', !!J.hud?.visible);   // karty HUD w trakcie zadania mają pierwszeństwo przed bocznymi listami reaktora
};

/* ---------- akcje ---------- */
$('#skDate').onclick = () => { J.wm.open('schedule'); J.sfx.click(); };
$('#skWx').onclick = () => { J.wm.open('weather'); J.sfx.click(); };
$('#skRam').onclick = () => { J.wm.open('monitor'); J.sfx.click(); };
$('#skNet').onclick = () => { J.wm.open('monitor'); J.sfx.click(); };
$('#skNote').onclick = () => { J.wm.open('notes'); J.sfx.click(); };
$('#skSearch').onclick = () => $('#searchPill').click();

/* ---------- filmowe wejście: panele składają się po kolei, reaktor rozkręca się od środka ---------- */
let introT = null;
const intro = () => {
  const parts = [$('.sk-title', root), $('#skDays'), ...$$('.sk-left>*', root), ...$$('.sk-right>*', root), $('#skProject')].filter(Boolean);
  parts.forEach((e, i) => e.style.setProperty('--i', String(i)));
  [root, reactor].forEach(e => { e.classList.remove('sk-intro'); void e.offsetWidth; e.classList.add('sk-intro'); });
  J.starkFx?.replayBoot?.();
  clearTimeout(introT); introT = setTimeout(() => { root.classList.remove('sk-intro'); reactor.classList.remove('sk-intro'); }, 3400);
};
/* intro po wejściu z ekranu startowego (wcześniej pulpit jest zasłonięty) */
new MutationObserver((m, o) => { if (app.classList.contains('on')) { o.disconnect(); if (isOn()) intro(); } }).observe(app, { attributes: true, attributeFilter: ['class'] });

/* ---------- pierścień widma: realny sygnał mikrofonu (J.ear.analyser), gdy Jarvis słucha ---------- */
const spec = $('#skSpec'), BARS = 96;
let specOn = false;
const drawSpec = () => {
  requestAnimationFrame(drawSpec);
  if (!isOn() || document.hidden) return;
  const f = J.starkFx?.freq || null;
  if (!f) { if (specOn) { spec.getContext('2d').clearRect(0, 0, spec.width, spec.height); specOn = false; reactor.classList.remove('sk-listen'); } return; }
  const dpr = Math.min(devicePixelRatio || 1, 2), size = 440, px = Math.round(size * dpr);
  if (spec.width !== px) { spec.width = px; spec.height = px; }
  const c = spec.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, size / 2 * dpr, size / 2 * dpr); c.clearRect(-size / 2, -size / 2, size, size);
  const rgb = eg.rgb() || J.rgb(S().accent);
  c.lineCap = 'round'; c.lineWidth = 3; c.strokeStyle = `rgba(${rgb},.92)`; c.shadowColor = `rgba(${rgb},.95)`; c.shadowBlur = 10;
  c.beginPath();
  for (let i = 0; i < BARS; i++) {
    const half = i < BARS / 2 ? i : BARS - 1 - i, v = f[2 + Math.floor(half / (BARS / 2) * 60)] / 255;   // symetrycznie: niskie tony u góry i u dołu
    const a = i / BARS * Math.PI * 2 - Math.PI / 2, r0 = 168, r1 = r0 + 2 + v * 26;
    c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); c.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
  }
  c.stroke(); specOn = true; reactor.classList.add('sk-listen');
};
requestAnimationFrame(drawSpec);

/* ---------- paralaksa: panele lekko odchylają się za kursorem (głębia jak w hologramie) ---------- */
let pxT = 0, pxX = 0, pxY = 0;
addEventListener('pointermove', e => {
  pxX = e.clientX / innerWidth * 2 - 1; pxY = e.clientY / innerHeight * 2 - 1;
  if (pxT) return; pxT = requestAnimationFrame(() => { pxT = 0; const on = isOn() && (J.fx?.rank?.() ?? 2) >= 2 && !RM.matches; root.style.setProperty('--px', on ? pxX.toFixed(3) : '0'); root.style.setProperty('--py', on ? pxY.toFixed(3) : '0'); });
}, { passive: true });

/* ---------- przełączanie układu ---------- */
let sysTimer = null;
const apply = () => {
  const on = isOn();
  app.dataset.layout = on ? 'stark' : 'classic';
  root.inert = !on; reactor.inert = !on;
  clearInterval(sysTimer); sysTimer = null;
  if (on) { renderAll(); fetchSys(); sysTimer = setInterval(fetchSys, 5000); intro(); }
  requestAnimationFrame(() => J.hud?.layout?.());
};
const renderAll = () => { daysKey = ''; renderDays(); renderApps(); renderDiag(); renderSys(); renderWx(); renderNote(); renderNews(); secTick(); fastTick(); };
J.stark = { apply, refresh: renderAll };

J.on('settings', () => { if ((app.dataset.layout === 'stark') !== isOn()) apply(); });
J.on('wm', syncApps);
J.on('notes', renderNote);
J.on('tasks', () => { daysKey = ''; renderDays(); renderProject(); });
J.on('bridge', () => { if (isOn()) fetchSys(); });
addEventListener('online', renderNet); addEventListener('offline', renderNet);
navigator.connection?.addEventListener?.('change', renderNet);
document.addEventListener('visibilitychange', () => { if (!document.hidden && isOn()) fetchSys(); });
setInterval(secTick, 1000);
setInterval(fastTick, 250);
setInterval(() => { if (isOn()) renderNews(); }, 30000);   // względne czasy („5 min”) i powiadomienia dodane poza zdarzeniem
apply();
})();
