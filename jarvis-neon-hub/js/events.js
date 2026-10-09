/* =========================================================
   JARVIS OS — Event Bus + maszyna stanów (Visual Engine, warstwa 1)

   Zasada: animacja wynika WYŁĄCZNIE z rzeczywistych zdarzeń.
   Hermes / lokalny silnik → J.ev.emit(typ, payload) → reducer → visual state → renderer.
   Nie ma tu zdarzeń „na niby": planowanie, weryfikacja, pauza i zgoda
   pojawią się dopiero, gdy backend faktycznie je udostępni.

   Wystawiane dziś:  task.created · task.completed · task.failed · task.cancelled
                     model.started · model.completed · model.failed
                     tool.started · tool.completed · tool.failed
   Stany (mode):     IDLE · LISTENING · THINKING · EXECUTING · VERIFYING · APPROVAL_REQUIRED · PAUSED · RECOVERING · COMPLETED · ERROR
   Dodatkowo:        plan.created / plan.step (plan z <plan>), signal (sygnał środowiska)
   ========================================================= */
'use strict';
(() => {
const MAX_EVENTS = 400;

/* ---------- Event Bus ---------- */
const subs = {};
let seq = 0, replayTimers = [];
const byTask = new Map();       // task_id -> [events]
J.ev = {
  emit(type, payload = {}, source = 'jarvis') {
    const e = { event_id: 'evt_' + (++seq), task_id: payload.task_id || J.proc?.current?.id || engine.taskId || null, timestamp: Date.now(), type, source, payload };
    if (e.task_id) { const l = byTask.get(e.task_id) || []; l.push(e); if (l.length > MAX_EVENTS) l.shift(); byTask.set(e.task_id, l); if (byTask.size > 30) byTask.delete(byTask.keys().next().value); }
    reduce(e);
    for (const k of [type, '*']) (subs[k] || []).forEach(fn => { try { fn(e); } catch (err) { console.error(err); } });
    return e;
  },
  on(type, fn) { (subs[type] = subs[type] || []).push(fn); return () => { subs[type] = subs[type].filter(f => f !== fn); }; },
  events: id => byTask.get(id) || [],
  /* Replay: odtwarza zapisany przebieg na Core (rekonstrukcja ścieżki, nie nagranie).
     Czas skompresowany do max ~7 s; przerywa się, gdy zacznie się prawdziwe zadanie. */
  replay(events, title = '') {
    J.ev.stopReplay();
    if (!events?.length || engine.taskId) return false;
    const t0 = events[0].t, span = Math.max(1, events[events.length - 1].t - t0), k = Math.min(1, 7000 / span);
    engine.replaying = true; J.orb.set('thinking', 'Replay: ' + title.slice(0, 50));
    replayTimers = events.map(e => setTimeout(() => {
      if (!engine.replaying) return;
      J.ev.emit(e.type, { tool: e.tool, node: e.node, title, replay: true, task_id: 'replay' }, e.source || 'jarvis');
    }, Math.max(0, (e.t - t0) * k) + 200));
    replayTimers.push(setTimeout(() => { J.ev.stopReplay(); J.orb.set('idle', 'koniec replay'); }, (span * k) + 4600));   // pełne sprzątanie (taskId/nodes/IDLE) — UI nie zostaje „busy”
    return true;
  },
  stopReplay() { replayTimers.forEach(clearTimeout); replayTimers = []; if (engine.replaying) { engine.replaying = false; engine.taskId = null; engine.nodes = {}; setMode('IDLE'); } },
  /* zdarzenia zadania w postaci zwięzłej do zapisania w historii */
  compact(id) { const l = byTask.get(id) || []; if (!l.length) return []; const t0 = l[0].timestamp; return l.slice(0, 200).map(e => ({ t: e.timestamp - t0, type: e.type, tool: e.payload.tool, node: e.payload.node, source: e.source })); },
  /* kategoria węzła dla narzędzia (klienckiego lub serwerowego Hermesa) */
  nodeFor(tool) {
    const t = String(tool || '').toLowerCase();
    if (/weather|crypto|open_url|search|web|browser|fetch|http|url|scrape/.test(t)) return 'internet';
    if (/note|notat/.test(t)) return 'notes';
    if (/task|timer|datetime|schedule|calendar|cron/.test(t)) return 'calendar';
    if (/file|read|write|patch|terminal|shell|exec|bash|code|edit/.test(t)) return 'files';
    if (/memory|remember|recall/.test(t)) return 'memory';
    if (/delegate|agent|spawn/.test(t)) return 'agent';
    if (/calc/.test(t)) return 'calc';
    if (/open_app|close_app|theme|wallpaper|shortcut|widget|focus|status/.test(t)) return 'desktop';
    return 'tool';
  }
};
const LABEL = { model: 'Model', internet: 'Internet', notes: 'Notatki', calendar: 'Harmonogram', files: 'Pliki', memory: 'Pamięć', agent: 'Agent', calc: 'Obliczenia', desktop: 'Pulpit', tool: 'Narzędzie' };

/* ---------- paleta stanów zależna od motywu ----------
   Stałe barwy ERROR/APPROVAL/COMPLETED (plan: #ff3b5c, #ffb020, #3dffa0), IDLE = akcent, THINKING = akcent2. Gdy któryś z motywem zlewa się odcieniem
   (< PAL_MIN°) z już przydzieloną barwą, przesuwamy odcień o najmniejszy krok (stałe semantyczne do ±PAL_SEM°, THINKING swobodnie); IDLE (akcent) się nie rusza.
   Jedno miejsce prawdy dla rim, Orba i kolorów linii — test przechodzi po wszystkich J.THEMES i liczy odległości odcieni. */
const PAL_MIN = 36, PAL_THINK = 60, PAL_SEM = 70,   // PAL_THINK: THINKING (często magenta/fiolet akcentu 2) ma być wyraźnie inne niż ERROR, nie tylko rozróżnialne
  PAL_NOM = { ERROR: '255,59,92', APPROVAL_REQUIRED: '255,176,32', COMPLETED: '61,255,160' };
const toHsl = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2; let h = 0;
  if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; }
  return [h, d ? d / (1 - Math.abs(2 * l - 1)) : 0, l]; };
const fromHsl = (h, s, l) => { const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, i = Math.floor(h / 60) % 6, v = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][i];
  return v.map(t => Math.round((t + m) * 255)).join(','); };
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const hslOf = rgb => toHsl(...String(rgb).split(',').map(Number));
J.hueGap = hueGap;
let palKey = '', palVal = null;
J.statePalette = (accent, accent2) => {
  const key = accent + '|' + accent2; if (key === palKey) return palVal;
  const a = hslOf(J.rgb(accent || '#33d6ff')), b = hslOf(J.rgb(accent2 || '#a25cff')), used = a[1] < .15 ? [] : [a[0]], out = {};   // akcent bez nasycenia nie ma odcienia
  const place = (h0, lim, min = PAL_MIN) => { let best = h0, bd = -1;
    for (let o = 0; o <= lim; o += 3) for (const sg of o ? [1, -1] : [1]) { const h = (h0 + sg * o + 360) % 360, d = used.length ? Math.min(...used.map(u => hueGap(h, u))) : 360; if (d >= min) return h; if (d > bd) { bd = d; best = h; } }
    return best; };
  out.IDLE = J.rgb(accent || '#33d6ff');
  for (const k of ['ERROR', 'APPROVAL_REQUIRED', 'COMPLETED']) { const [h0, s, l] = hslOf(PAL_NOM[k]), h = place(h0, PAL_SEM); used.push(h); out[k] = Math.abs(h - h0) < .5 ? PAL_NOM[k] : fromHsl(h, s, l); }
  const h = place(b[0], 180, PAL_THINK); out.THINKING = hueGap(h, b[0]) < .5 ? J.rgb(accent2 || '#a25cff') : fromHsl(h, b[1], b[2]);
  palKey = key; return (palVal = out);
};

/* Orb: kolor rdzenia i „oddech” zależne od trybu — czysta funkcja (testowalna bez canvasa), wynik do `out` (bez alokacji na klatkę).
   Zgoda oddycha, pauza stoi przygaszona, awaria miga wolno, błąd = 2 pulsy w 1,2 s, czuwanie przygaszone; reszta jak w orbDraw. */
/* segmentowy pierścień planu wokół Orba (cinema): n segmentów (≤ 16) = kroki planu z Hermesa (plan.created), done = ukończone (przy > 16 krokach proporcjonalnie); null = brak planu → brak pierścienia */
J.planSegs = plan => { const t = plan?.steps?.length | 0; if (!t) return null; const n = Math.min(16, t); return { n, done: Math.min(n, t > n ? Math.floor(plan.done / t * n) : plan.done) }; };
J.orbLook = (out, mode, since, t, standby, idle, ov, accent) => {
  out.col = ov || (standby ? '70,150,185' : accent);
  out.breath = mode === 'APPROVAL_REQUIRED' ? .72 + .28 * Math.sin(t / 650) : mode === 'PAUSED' ? .5 : mode === 'RECOVERING' ? (Math.sin(t / 700) > 0 ? 1 : .38)
    : mode === 'ERROR' && since < 1200 ? 1 + .45 * Math.max(0, Math.sin(since / 1200 * Math.PI * 4)) : standby ? .55 : idle ? .78 + .22 * Math.sin(t / 1600) : 1;
  return out;
};
J.FPS_LOW = 30; J.FPS_OK = 55;   // progi licznika FPS (dioda w pasku) i regulatora efektów (main.js adapt): < 30 obniża, >= 55 przywraca
J.fpsBand = fps => !fps ? '' : fps >= J.FPS_OK ? 'up' : fps >= J.FPS_LOW ? 'down' : 'bad';

/* ---------- Visual State (to czyta renderer) ---------- */
const engine = J.engine = {
  mode: 'IDLE', activity: .06, taskId: null, since: Date.now(),
  nodes: {},            // id -> {id,label,status:'active'|'done'|'failed', active, calls, spawn, doneAt}
  packets: [],          // {node, dir:'in'|'out', t0}
  flash: { t: 0, kind: '' },   // puls zakończenia zadania
  listening: false,
  title: '', turns: 0, toolsStarted: 0, toolsFinished: 0, toolsFailed: 0, toolNames: [], ext: { started: 0, active: 0, finished: 0, last: '' }, thinkChars: 0, hudUntil: 0,
  wave: new Array(56).fill(0), _pend: 0, rain: 0,   // rain 0–1: wygładzony strumień znaków modelu → „deszcz danych” w wiązce Orba (bez strumienia 0 = wiązka pusta)
  plan: null, hold: null,   // plan z <plan>; hold = tryb wstrzymany (APPROVAL_REQUIRED/PAUSED) do czasu wznowienia
  log: [],                  // ostatnie zdarzenia (wszystkie zadania) do Context Packet
  /* code przy zakończeniu narzędzia: DENIED liczy się jako „completed” (to nie awaria), ale bez kodu model brał odmowę za sukces;
     answer przy approval.resolved: null = nikt nie odpowiedział (limit czasu), nie „zgoda” */
  recent(n = 5) { return this.log.slice(-n).map(e => ({ t: Math.round((Date.now() - e.timestamp) / 1000) + 's', type: e.type, tool: e.payload.tool || e.payload.title || undefined, ...(e.payload.code && e.payload.code !== 'OK' ? { code: e.payload.code } : {}), ...(e.type === 'approval.resolved' ? { answer: e.payload.answer ?? 'timeout' } : {}) })); },
  /* realny przepływ znaków ze strumienia modelu → fala w karcie Model AI */
  feed(n) { this._pend += n; },
  last: null,           // podsumowanie ostatniego zadania {task_id,title,tools,nodes,dur,status,result}
  get state() { return this; },
  /* kolor Core zależny od stanu (r,g,b) albo null = kolor motywu; barwy ze statePalette (rozsunięte względem motywu) */
  rgb() {
    const now = Date.now(), m = this.mode, st = J.state.settings, P = J.statePalette(st.accent, st.accent2);
    if (m === 'COMPLETED') return now - this.since < 2600 ? P.COMPLETED : null;
    if (m === 'ERROR') return now - this.since < 3500 ? P.ERROR : null;
    switch (m) {
      case 'LISTENING': return '190,245,255';
      case 'THINKING': return P.THINKING;
      case 'VERIFYING': return '196,160,255';
      case 'APPROVAL_REQUIRED': return P.APPROVAL_REQUIRED;
      case 'PAUSED': return '176,128,40';
      case 'RECOVERING': return '255,122,41';
    }
    return null;   // IDLE / EXECUTING: barwa motywu (EXECUTING dostaje biały rdzeń w orbDraw)
  }
};
/* jedyne miejsce zmiany trybu — emituje 'mode' raz na zmianę (także dla wygaszenia czasowego i hold); UI (fx-director) nie dubluje reduktora */
const setMode = m => { if (engine.mode !== m) { engine.mode = m; engine.since = Date.now(); J.emit('mode', { mode: m, since: engine.since }); } };
const activeCount = () => Object.values(engine.nodes).filter(n => n.status === 'active' && n.id !== 'model').length;
const recompute = () => {
  if (!engine.taskId || engine.hold) return;
  const tools = activeCount(), model = engine.nodes.model?.status === 'active';
  if (tools) { setMode('EXECUTING'); engine.activity = Math.min(.95, .55 + .12 * tools); }
  else if (model) { setMode('THINKING'); engine.activity = .4; }
  else { setMode('THINKING'); engine.activity = .3; }   // między krokami zadania
};
const node = id => engine.nodes[id] || (engine.nodes[id] = { id, label: LABEL[id] || id, status: 'active', active: 0, calls: 0, spawn: Date.now(), doneAt: 0 });
const packet = (id, dir, src, bad) => { engine.packets.push({ node: id, dir, src, bad: !!bad, t0: Date.now() }); if (engine.packets.length > 60) engine.packets.shift(); };

const reduce = e => {
  const p = e.payload;
  if (!p.replay && e.type !== 'signal') { engine.log.push(e); if (engine.log.length > 60) engine.log.shift(); }
  switch (e.type) {
    case 'plan.created': engine.plan = { steps: p.steps || [], done: 0 }; break;
    case 'plan.step': if (engine.plan) engine.plan.done = Math.min(engine.plan.steps.length, (p.index ?? engine.plan.done) + 1); break;
    case 'approval.requested': engine.hold = 'APPROVAL_REQUIRED'; setMode('APPROVAL_REQUIRED'); engine.activity = .25; break;
    case 'approval.resolved': engine.hold = null; if (engine.taskId) recompute(); else setMode(engine.listening ? 'LISTENING' : 'IDLE'); break;
    case 'task.paused': engine.hold = 'PAUSED'; setMode('PAUSED'); engine.activity = .15; break;
    case 'task.resumed': engine.hold = null; recompute(); break;
    case 'task.recovering': engine.hold = null; setMode('RECOVERING'); engine.activity = .3; break;
    case 'task.verifying': if (engine.taskId) { engine.hold = 'VERIFYING'; setMode('VERIFYING'); engine.activity = .3; } break;
    case 'task.verified': if (engine.hold === 'VERIFYING') { engine.hold = null; recompute(); } break;
    case 'signal': if (!engine.taskId) engine.activity = Math.max(engine.activity, .35); break;
    case 'task.created':
      if (!p.replay) J.ev.stopReplay();
      engine.taskId = e.task_id; engine.nodes = {}; engine.packets = []; engine.startedAt = e.timestamp; engine.toolCalls = 0; engine.plan = null; engine.hold = null;
      Object.assign(engine, { title: p.title || '', turns: 0, toolsStarted: 0, toolsFinished: 0, toolsFailed: 0, toolNames: [], ext: { started: 0, active: 0, finished: 0, last: '' }, thinkChars: 0, hudUntil: 0 });
      setMode('THINKING'); engine.activity = .35; break;
    case 'model.started': { const n = node('model'); n.status = 'active'; n.active++; n.calls++; engine.turns++; packet('model', 'out', e.source); recompute(); break; }
    case 'model.completed': case 'model.failed': { const n = node('model'); n.active = Math.max(0, n.active - 1); if (!n.active) { n.status = e.type === 'model.failed' ? 'failed' : 'done'; n.doneAt = e.timestamp; } packet('model', 'in', e.source, e.type === 'model.failed'); recompute(); break; }
    case 'tool.started': { const n = node(p.node || J.ev.nodeFor(p.tool)); n.status = 'active'; n.active++; n.calls++; n.lastTool = p.tool; engine.toolCalls++; engine.toolsStarted++;
      if (p.tool && !engine.toolNames.includes(p.tool)) engine.toolNames.push(p.tool);
      if (e.source === 'hermes') { engine.ext.started++; engine.ext.active++; engine.ext.last = p.tool || ''; }
      packet(n.id, 'out', e.source); recompute(); break; }
    case 'tool.completed': case 'tool.failed': {
      const n = node(p.node || J.ev.nodeFor(p.tool)); n.active = Math.max(0, n.active - 1);
      if (engine.plan && e.source !== 'hermes' && engine.plan.done < engine.plan.steps.length) { engine.plan.done++; J.emit('plan', engine.plan); }
      engine.toolsFinished++; if (e.type === 'tool.failed') { n.failed = true; engine.toolsFailed++; }
      if (e.source === 'hermes') { engine.ext.active = Math.max(0, engine.ext.active - 1); engine.ext.finished++; }
      if (!n.active) { n.status = n.failed ? 'failed' : 'done'; n.doneAt = e.timestamp; }
      packet(n.id, 'in', e.source, e.type === 'tool.failed'); recompute(); break;
    }
    case 'task.completed': case 'task.failed': case 'task.cancelled': {
      const ok = e.type === 'task.completed';
      Object.values(engine.nodes).forEach(n => { if (n.status === 'active') { n.status = 'done'; n.doneAt = e.timestamp; n.active = 0; } });
      engine.flash = { t: e.timestamp, kind: ok ? 'ok' : e.type === 'task.failed' ? 'err' : 'cancel' };
      if (!p.replay) engine.last = { task_id: e.task_id, title: p.title || '', status: e.type.slice(5), tools: engine.toolCalls || 0, nodes: Object.keys(engine.nodes).filter(k => k !== 'model').length, dur: e.timestamp - (engine.startedAt || e.timestamp), result: p.result || '' };
      engine.hold = null; setMode(ok ? 'COMPLETED' : e.type === 'task.failed' ? 'ERROR' : 'IDLE'); engine.activity = ok ? .2 : .3;
      engine.taskId = null; engine.hudUntil = e.timestamp + 9000;
      setTimeout(() => { if (engine.taskId === null && (engine.mode === 'COMPLETED' || engine.mode === 'ERROR')) setMode(engine.listening ? 'LISTENING' : 'IDLE'); }, 3600);
      break;
    }
  }
};

/* mikrofon = LISTENING (tylko gdy nie trwa zadanie) */
J.on('ear', on => { engine.listening = on; if (!engine.taskId) setMode(on ? 'LISTENING' : 'IDLE'); if (on && !engine.taskId) engine.activity = .2; });

/* fala: jedna próbka co 90 ms z faktycznie odebranych znaków (bez ruchu = płaska linia) */
engine.sample = () => { const v = Math.min(1, engine._pend / 26); engine._pend = 0; engine.wave.push(v); engine.wave.shift(); engine.rain += (v - engine.rain) * .35; if (engine.rain < .02) engine.rain = 0; };
setInterval(engine.sample, 90);

/* płynne opadanie aktywności w spoczynku */
setInterval(() => { if (!engine.taskId && (engine.mode === 'IDLE')) engine.activity += (.06 - engine.activity) * .2; }, 250);
})();
