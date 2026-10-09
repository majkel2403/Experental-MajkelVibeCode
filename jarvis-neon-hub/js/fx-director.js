/* =========================================================
   JARVIS OS — FX Director (Neon Holo-Glass, warstwa 2)

   Jedno źródło prawdy o „nastroju” pulpitu dla CSS: tłumaczy realne zdarzenia (J.emit('mode'), J.ev, ear, fx)
   na atrybuty #app — data-mode, data-working, --glow-state (raz na zmianę trybu), --activity (≤10 Hz, tylko przy zmianie)
   oraz jednorazowe impulsy .fx-pulse-* (<1 s). Nie rysuje i nie czyta layoutu; animacje robi CSS (opacity/transform).
   Bramkowanie: J.fx.rank() czytane leniwie (J.fx powstaje w main.js) — off/tool: tylko kolor stanu, standard/cinema: pełne.
   ========================================================= */
'use strict';
(() => {
const D = J.fxd = { el: null, mode: '', glow: null, act: 0, actOut: -1, timers: [], ptimers: {} };   // ptimers: id timera sprzątającego per rodzaj impulsu (max 3 wpisy)
const app = () => D.el || (D.el = document.querySelector('#app'));
const rank = () => J.fx?.rank?.() ?? 2;   // przed main.js (testy) zachowuj się jak „standard”
const PULSE_MS = 900;
const setProp = (el, k, v) => v == null ? el.style.removeProperty?.(k) : el.style.setProperty(k, v);

/* kolor stanu: rgb() silnika (paleta + wygasanie 2600/3500 ms) albo motyw; zapis tylko przy zmianie wartości */
const syncGlow = () => {
  const el = app(); if (!el) return;
  const c = J.engine.rgb() || null;
  if (c !== D.glow) { D.glow = c; setProp(el, '--glow-state', c); }
};
const clearTimers = () => { D.timers.forEach(clearTimeout); D.timers = []; };

/* efektywny tryb widoczny dla UI: IDLE + czuwanie na słowo wywołania = STANDBY */
const effective = () => { const m = J.engine.mode; return m === 'IDLE' && J.ear?.standby ? 'STANDBY' : m; };
const applyMode = () => {
  const el = app(); if (!el) return;
  const m = effective(), prev = D.mode; D.mode = m;
  if (m !== prev) {
    el.dataset.mode = m;
    const w = m === 'THINKING' || m === 'EXECUTING';
    if (w) el.setAttribute('data-working', ''); else el.removeAttribute('data-working');   // linia skanu (.scan) w css
  }
  syncGlow(); clearTimers();
  /* barwa COMPLETED/ERROR gaśnie po czasie bez zmiany trybu — odśwież kolor, gdy silnik przestanie ją zwracać */
  const eg = J.engine, left = m === 'COMPLETED' ? 2600 : m === 'ERROR' ? 3500 : 0;
  if (left) D.timers.push(setTimeout(syncGlow, Math.max(0, left - (Date.now() - eg.since)) + 30));
};

/* impuls jednorazowy: klasa na #app na < 1 s; ponowny impuls w trakcie trwania jest pomijany (burst = jeden błysk).
   Brak impulsów w trybie prezentacji (spec §7). Timer zapasowy (gdyby animationend nie nadszedł, np. display:none) jest jeden na rodzaj:
   kasujemy go przy zakończeniu, żeby stary timer nie obciął następnego impulsu tego samego rodzaju. */
const pulse = kind => {
  if (rank() < 2) return;
  const el = app(); if (!el || el.classList.contains('present')) return;
  const cls = 'fx-pulse-' + kind;
  if (el.classList.contains(cls)) return;
  el.classList.add(cls); D.pulseAt = performance.now(); D.pulseKind = kind;   // bg-gl: fala siatki / aberracja liczone od realnego impulsu
  clearTimeout(D.ptimers[kind]); D.ptimers[kind] = setTimeout(() => endPulse(el, kind), PULSE_MS);
};
const endPulse = (el, kind) => { clearTimeout(D.ptimers[kind]); delete D.ptimers[kind]; el.classList.remove('fx-pulse-' + kind); };
D.pulse = pulse; D.apply = applyMode;

/* wspólna bramka efektów kinowych: w prezentacji i w skupieniu milczą (skupienie = tylko opacity warstw tła); impulsy standardu (pulse) milczą tylko w prezentacji */
D.calm = () => { const cl = app()?.classList; return !!cl && (cl.contains('present') || cl.contains('focus')); };
/* limity życia efektów kinowych (ms; każdy < 1 s) i poziom, od którego działają: jedyna tablica prawdy dla bramkowania i testu „żaden efekt nie trwa ≥ 1 s” */
const FX_LIFE = { ca: 200, scan: 600, tb: 700, spark: 900, ok: PULSE_MS, err: PULSE_MS, warn: PULSE_MS }, BURST_CLS = { ca: 'fx-ca', scan: 'fx-scan', tb: 'fx-tb' };
D.life = FX_LIFE;
/* czy zdarzenie jest realną porażką (a nie degradacją do trybu lokalnego z „⚠ Hermes offline” — ta kończy się task.completed z ostrzeżeniem w treści) i nie powtórką */
D.realFail = e => { const p = e?.payload || {}; return !p.replay && !p.degraded && !/Hermes (jest )?offline|tryb lokalny/i.test(String(p.result || '')); };
/* jednorazowy efekt z klasą na #app na czas FX_LIFE[kind]; ponowne wywołanie w trakcie jest pomijane (burst = jeden błysk). minRank: poziom efektów, od którego działa */
const burst = (kind, minRank) => {
  if (rank() < minRank) return false;
  const cls = BURST_CLS[kind], el = app(); if (!el || D.calm() || el.classList.contains(cls)) return false;
  el.classList.add(cls); clearTimeout(D.ptimers[kind]); D.ptimers[kind] = setTimeout(() => { delete D.ptimers[kind]; el.classList.remove(cls); }, FX_LIFE[kind]);
  return true;
};
/* aberracja chromatyczna (150–220 ms): shader (bg-gl.js, uK od D.caAt) na tapecie GL, a na pozostałych .fx-ca → drgnięcie Orba i marki paska (transform). Tylko cinema, tylko po realnej porażce */
D.ca = () => { if (!burst('ca', 3)) return false; D.caAt = performance.now(); return true; };
/* iskry GL (bg-gl.js, cząstki): realne zdarzenie ustawia tylko czas i siłę (uniformy uAge/uK), a shader liczy ruch cząstek; życie 900 ms, najwyżej raz na 250 ms, tylko cinema */
D.sparkAt = 0; D.sparkK = 0;
D.spark = k => {
  if (rank() < 3 || !app() || D.calm()) return false;
  const t = performance.now(); if (t - D.sparkAt < 250) return false; D.sparkAt = t; D.sparkK = k; return true;
};
const clearPulses = () => { const el = app(); if (!el) return; ['ok', 'err', 'warn'].forEach(k => endPulse(el, k)); };
D.clearPulses = clearPulses;
/* spadek poniżej cinema: kasuje też efekty kinowe (aberracja, skan, błysk paska) — bez czekania na ich timery */
const clearBursts = () => { const el = app(); if (!el) return; for (const k in BURST_CLS) { clearTimeout(D.ptimers[k]); delete D.ptimers[k]; el.classList.remove(BURST_CLS[k]); } D.caAt = 0; D.sparkAt = 0; D.sparkK = 0; };
D.clearBursts = clearBursts;

/* „NO LINK”: realna utrata łączności — Hermes skonfigurowany i J.hermes.status === 'down' (po nieudanym zapytaniu/pingu) albo navigator.onLine === false.
   NIE dla 'unknown', trybu lokalnego (Hermes wyłączony) ani offlineMode (świadomy wybór użytkownika). Brak sieci (onLine false) — od razu; Hermes „down” — dopiero po
   NL_DELAY ciągłej awarii: pojedyncze nieudane zapytanie albo restart gatewaya przez watchdog nie zmienia wyglądu pulpitu. Standard+: cienka bursztynowa linia pod paskiem,
   mała etykieta i migająca dioda sieci (#btnNet) — bez przyciemniania sceny i okien (czytelność). Wejście/wyjście płynne (opacity .6 s); element istnieje tylko, gdy jest potrzebny */
D.noLinkWanted = i => !i.offlineMode && (i.onLine === false || (!!i.aiReady && i.status === 'down'));
D.nl = null; D.nlOn = false; D.nlSince = 0; D.NL_DELAY = 15000;
const nlSync = () => {
  const el = app(); if (!el) return;
  const i = { offlineMode: J.state?.settings?.offlineMode, onLine: typeof navigator !== 'undefined' ? navigator.onLine : true, aiReady: J.aiReady?.(), status: J.hermes?.status };
  const raw = rank() >= 2 && !el.classList.contains('present') && D.noLinkWanted(i), now = Date.now();
  if (!raw) { D.nlSince = 0; clearTimeout(D.nlW); } else if (!D.nlSince) D.nlSince = now;
  const want = raw && (i.onLine === false || now - D.nlSince >= D.NL_DELAY);
  if (raw && !want) { clearTimeout(D.nlW); D.nlW = setTimeout(nlSync, D.NL_DELAY - (now - D.nlSince) + 5); }   // sprawdź ponownie, gdy minie zwłoka (bez nowego zdarzenia)
  if (want === D.nlOn) return; D.nlOn = want; clearTimeout(D.nlT);
  if (want) {
    if (!D.nl) { const n = document.createElement('div'); n.id = 'fxNoLink'; n.setAttribute('aria-hidden', 'true'); n.innerHTML = '<i class="nl-bar"></i><b>NO LINK</b>'; el.appendChild(n); D.nl = n; }
    el.setAttribute('data-nolink', ''); requestAnimationFrame(() => { if (D.nlOn && D.nl) D.nl.classList.add('on'); });
  } else {
    el.removeAttribute('data-nolink'); const n = D.nl; n?.classList.remove('on');
    D.nlT = setTimeout(() => { if (!D.nlOn && D.nl) { D.nl.remove(); D.nl = null; } }, 700);   // po zakończeniu przejścia element znika z układu
  }
};
D.nlSync = nlSync;
J.on('hermes', nlSync); J.on('settings', nlSync); J.on('fx', nlSync);
addEventListener('online', nlSync); addEventListener('offline', nlSync);

/* --activity: wygładzone engine.activity, kwantyzowane do 0,05; zapis tylko gdy wartość się zmieni (a nie na klatkę) */
D.tick = () => {
  const el = app(); if (!el) return;
  nlSync();   // tani test warunku (bez DOM, gdy bez zmiany): łapie też zmiany bez zdarzenia
  if (rank() < 2) { if (D.actOut !== 0) { D.actOut = 0; D.act = 0; setProp(el, '--activity', '0'); } return; }
  D.act += (J.clamp(J.engine.activity, 0, 1) - D.act) * .35;
  const q = Math.round(D.act * 20) / 20;
  if (q !== D.actOut) { D.actOut = q; setProp(el, '--activity', String(q)); }
};

/* pasek LED pod dokiem: 12 segmentów = realne wywołania narzędzi bieżącego zadania (engine.toolsStarted/Finished/Failed, zliczane z tool.* w reduktorze).
   Kolejno: zakończone (d), nieudane (f), w toku (r — oddycha opacity); reszta przygaszona. Po zadaniu zostaje do końca okna HUD (hudUntil), potem gaśnie.
   Funkcja czysta (testowalna bez DOM); zapis do DOM tylko dla segmentów, które zmieniły stan. Poziomy off/tool: ten sam układ, ale statyczny (CSS .lowfx). */
const LED_N = 12;
D.ledSegs = (st, live) => {
  if (!live) return '.'.repeat(LED_N);
  const lit = Math.min(LED_N, st.started | 0), run = Math.min(lit, Math.max(0, (st.started | 0) - (st.finished | 0))), fail = Math.min(lit - run, st.failed | 0), done = lit - run - fail;
  return 'd'.repeat(done) + 'f'.repeat(fail) + 'r'.repeat(run) + '.'.repeat(LED_N - lit);
};
D.ledSig = '';
const ledSync = () => {
  const box = D.led || (D.led = document.querySelector('#dockLed')); if (!box) return;
  const eg = J.engine, live = !!eg.taskId || Date.now() < eg.hudUntil, sig = D.ledSegs({ started: eg.toolsStarted, finished: eg.toolsFinished, failed: eg.toolsFailed }, live);
  if (sig === D.ledSig) return; D.ledSig = sig;
  if (!box.children?.length) for (let i = 0; i < LED_N; i++) box.appendChild(document.createElement('i'));
  for (let i = 0; i < LED_N; i++) { const c = sig[i] === '.' ? '' : sig[i], seg = box.children[i]; if (seg.dataset.s !== c) { if (c) seg.dataset.s = c; else delete seg.dataset.s; } }
};
D.ledSync = ledSync;

/* dioda zadania w doku (bursztyn, css/neon.css): realne sygnały task.due / task.overdue (J.signals.push → J.emit('signal')); gaśnie, gdy Harmonogram zostanie sfokusowany.
   Atrybut na #dock, a nie na przycisku: dok jest przebudowywany przy każdej zmianie okien */
D.task = '';
const taskDiode = v => { D.task = v; const d = document.querySelector('#dock'); if (!d) return; if (v) d.dataset.task = v; else delete d.dataset.task; };
D.taskDiode = taskDiode;
J.on('signal', sig => { if (sig?.type === 'task.due') taskDiode(D.task === 'overdue' ? 'overdue' : 'due'); else if (sig?.type === 'task.overdue') taskDiode('overdue'); });
J.on('wm', () => { if (D.task && J.wm?.isFocused?.('schedule') && !J.wm.isMin?.('schedule')) taskDiode(''); });

/* dźwięk zsynchronizowany ze stanem: jedno miejsce zamiast wywołań rozsianych po ai.js; wyciszenie (przełącznik sound, cisza nocna, present) i głośność zostają w J.sfx.
   Każdy dźwięk ma odpowiednik wizualny w tym samym zdarzeniu (spec 09 §8): tik = segment LED/pierścień karty, gotowe/błąd = impuls ekranu i kolor stanu. Powtórka milczy.
   Dźwięk pytania gra J.ask (main.js) — ma własne wywołanie przy tworzeniu chipa, więc approval.requested go nie dubluje */
D.tickAt = 0;
const sound = (name, e) => { if (e?.payload?.replay) return; try { J.sfx[name]?.(); } catch (err) { } };
J.ev.on('tool.started', e => { const t = Date.now(); if (t - D.tickAt < 150) return; D.tickAt = t; sound('tick', e); });
J.ev.on('task.completed', e => sound('success', e));
J.ev.on('task.failed', e => sound('error', e));

J.on('mode', applyMode);
J.on('ear-standby', applyMode);
J.on('ear', applyMode);   // wejście/wyjście z nasłuchu: tryb już policzył reduktor, tu tylko odświeżamy kolor/atrybuty
J.on('fx', () => { if (rank() < 2) clearPulses(); if (rank() < 3) clearBursts(); D.actOut = -1; D.tick(); applyMode(); });
J.on('settings', syncGlow);
J.ev.on('task.completed', () => pulse('ok'));
J.ev.on('task.failed', () => pulse('err'));
J.ev.on('tool.failed', () => pulse('err'));
J.ev.on('approval.requested', () => pulse('warn'));

/* pierścień odliczania prośby o zgodę: 24 segmenty gasną po kolei, aż do realnego limitu (payload approval.requested.timeout_ms = limit J.ask). Montuje go chip przy tworzeniu (J.fxd.ringMount),
   odliczanie 4×/s dotyka tylko segmentów, które zmieniły stan (opacity); koniec: approval.resolved / ukrycie chipa. Bez timeout_ms w zdarzeniu — brak pierścienia (nic na niby) */
const RING_N = 24;
D.ask = null; D.ringBox = null;
const ringStop = () => { clearInterval(D.ringT); D.ringT = 0; D.ringBox = null; D.ask = null; D.ringChip?.classList?.remove('ringed'); D.ringChip = null; };
const ringTick = () => {
  const a = D.ask, box = D.ringBox; if (!a || !box) return ringStop();
  const lit = J.clamp(Math.ceil((a.t0 + a.ms - Date.now()) / (a.ms / RING_N)), 0, RING_N), segs = box.children; if (!segs) return;
  for (let i = 0; i < RING_N; i++) { const off = i >= lit; if (segs[i] && !!segs[i]._off !== off) { segs[i]._off = off; segs[i].classList.toggle('off', off); } }
};
D.ringLit = (ms, left) => J.clamp(Math.ceil(left / (ms / RING_N)), 0, RING_N);
D.ringMount = chip => {
  clearInterval(D.ringT); D.ringT = 0; D.ringBox = null; chip.classList?.remove('ringed');
  if (!D.ask) return;
  const box = document.createElement('div'); box.className = 'ac-ring'; box.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < RING_N; i++) { const s = document.createElement('i'); s.style.setProperty('--a', (i * 360 / RING_N) + 'deg'); box.appendChild(s); }
  chip.appendChild(box); chip.classList?.add('ringed'); D.ringChip = chip; D.ringBox = box; D.ringT = setInterval(ringTick, 250); ringTick();
};
J.ev.on('approval.requested', e => { const ms = +e.payload?.timeout_ms; D.ask = ms > 0 ? { ms, t0: Date.now() } : null; });
J.ev.on('approval.resolved', ringStop);
/* sukces: błysk linii topbara (standard+) i — gdy zadanie użyło narzędzi — zielona linia skanu przez ekran (cinema); jedna warstwa (#app:before), jednorazowo */
J.ev.on('task.completed', e => { if (e.payload?.replay) return; burst('tb', 2); if ((J.engine.last?.tools | 0) >= 1) burst('scan', 3); });
J.ev.on('task.completed', e => { if (!e.payload?.replay) D.spark(1); });
J.ev.on('tool.started', e => { if (!e.payload?.replay) D.spark(.5); });
J.ev.on('task.failed', e => { if (D.realFail(e)) D.ca(); });
J.ev.on('tool.failed', e => { if (!e.payload?.replay) D.ca(); });
J.ev.on('model.failed', e => { const p = e.payload || {}; if (!p.replay && !p.aborted && !p.net) D.ca(); });   // Stop i błąd sieci (→ degradacja) to nie „realna porażka”
J.ev.on('security.injection', e => { if (!e.payload?.replay) D.ca(); });
for (const t of ['task.created', 'tool.started', 'tool.completed', 'tool.failed']) J.ev.on(t, ledSync);
for (const t of ['task.completed', 'task.failed', 'task.cancelled']) J.ev.on(t, () => { ledSync(); clearTimeout(D.ledT); D.ledT = setTimeout(ledSync, Math.max(0, J.engine.hudUntil - Date.now()) + 50); });   // po oknie HUD segmenty gasną
setInterval(() => D.tick(), 100);
D.animEnd = e => { if (e.target === D.el && /^fxPulse/.test(e.animationName)) clearPulses(); };   // koniec animacji impulsu (nie innych animacji potomków)
app()?.addEventListener('animationend', D.animEnd);
applyMode();
})();
