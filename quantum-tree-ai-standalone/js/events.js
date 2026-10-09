/* =========================================================
   JARVIS OS — Event Bus + maszyna stanów (Visual Engine, warstwa 1)

   Zasada: animacja wynika WYŁĄCZNIE z rzeczywistych zdarzeń.
   Hermes / lokalny silnik → J.ev.emit(typ, payload) → reducer → visual state → renderer.
   Nie ma tu zdarzeń „na niby": planowanie, weryfikacja, pauza i zgoda
   pojawią się dopiero, gdy backend faktycznie je udostępni.

   Wystawiane dziś:  task.created · task.completed · task.failed · task.cancelled
                     model.started · model.completed · model.failed
                     tool.started · tool.completed · tool.failed
   Stany (mode):     IDLE · LISTENING · THINKING · EXECUTING · APPROVAL_REQUIRED · PAUSED · RECOVERING · COMPLETED · ERROR
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

/* ---------- Visual State (to czyta renderer) ---------- */
const engine = J.engine = {
  mode: 'IDLE', activity: .06, taskId: null, since: Date.now(),
  nodes: {},            // id -> {id,label,status:'active'|'done'|'failed', active, calls, spawn, doneAt}
  packets: [],          // {node, dir:'in'|'out', t0}
  flash: { t: 0, kind: '' },   // puls zakończenia zadania
  listening: false,
  title: '', turns: 0, toolsStarted: 0, toolsFinished: 0, toolsFailed: 0, toolNames: [], ext: { started: 0, active: 0, finished: 0, last: '' }, thinkChars: 0, hudUntil: 0,
  wave: new Array(56).fill(0), _pend: 0,
  plan: null, hold: null,   // plan z <plan>; hold = tryb wstrzymany (APPROVAL_REQUIRED/PAUSED) do czasu wznowienia
  log: [],                  // ostatnie zdarzenia (wszystkie zadania) do Context Packet
  /* code przy zakończeniu narzędzia: DENIED liczy się jako „completed” (to nie awaria), ale bez kodu model brał odmowę za sukces;
     answer przy approval.resolved: null = nikt nie odpowiedział (limit czasu), nie „zgoda” */
  recent(n = 5) { return this.log.slice(-n).map(e => ({ t: Math.round((Date.now() - e.timestamp) / 1000) + 's', type: e.type, tool: e.payload.tool || e.payload.title || undefined, ...(e.payload.code && e.payload.code !== 'OK' ? { code: e.payload.code } : {}), ...(e.type === 'approval.resolved' ? { answer: e.payload.answer ?? 'timeout' } : {}) })); },
  /* realny przepływ znaków ze strumienia modelu → fala w karcie Model AI */
  feed(n) { this._pend += n; },
  last: null,           // podsumowanie ostatniego zadania {task_id,title,tools,nodes,dur,status,result}
  get state() { return this; },
  /* kolor Core zależny od stanu (r,g,b) albo null = kolor motywu */
  rgb() {
    const now = Date.now();
    if (this.mode === 'COMPLETED' && now - this.since < 2600) return '57,229,154';
    if (this.mode === 'ERROR' && now - this.since < 3500) return '255,184,77';
    if (this.mode === 'THINKING') return J.rgb(J.state.settings.accent2);
    if (this.mode === 'APPROVAL_REQUIRED' || this.mode === 'PAUSED' || this.mode === 'RECOVERING') return '255,184,77';
    return null;
  }
};
const setMode = m => { if (engine.mode !== m) { engine.mode = m; engine.since = Date.now(); } };
const activeCount = () => Object.values(engine.nodes).filter(n => n.status === 'active' && n.id !== 'model').length;
const recompute = () => {
  if (!engine.taskId || engine.hold) return;
  const tools = activeCount(), model = engine.nodes.model?.status === 'active';
  if (tools) { setMode('EXECUTING'); engine.activity = Math.min(.95, .55 + .12 * tools); }
  else if (model) { setMode('THINKING'); engine.activity = .4; }
  else { setMode('THINKING'); engine.activity = .3; }   // między krokami zadania
};
const node = id => engine.nodes[id] || (engine.nodes[id] = { id, label: LABEL[id] || id, status: 'active', active: 0, calls: 0, spawn: Date.now(), doneAt: 0 });
const packet = (id, dir, src) => { engine.packets.push({ node: id, dir, src, t0: Date.now() }); if (engine.packets.length > 60) engine.packets.shift(); };

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
    case 'model.completed': case 'model.failed': { const n = node('model'); n.active = Math.max(0, n.active - 1); if (!n.active) { n.status = e.type === 'model.failed' ? 'failed' : 'done'; n.doneAt = e.timestamp; } packet('model', 'in', e.source); recompute(); break; }
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
      packet(n.id, 'in', e.source); recompute(); break;
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
setInterval(() => { const v = Math.min(1, engine._pend / 26); engine._pend = 0; engine.wave.push(v); engine.wave.shift(); }, 90);

/* płynne opadanie aktywności w spoczynku */
setInterval(() => { if (!engine.taskId && (engine.mode === 'IDLE')) engine.activity += (.06 - engine.activity) * .2; }, 250);
})();
