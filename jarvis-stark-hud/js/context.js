/* =========================================================
   JARVIS OS — kontekst dla modelu, sygnały środowiska, pamięć, rutyny
   Context Packet: zwięzły obraz środowiska dołączany do każdej tury (jako diff).
   Sygnały: zdarzenia (minutnik, przypomnienie, alert), które model może zobaczyć
   w następnej turze (tryb cichy) albo które same wywołują turę (tryb aktywny).
   Pamięć: fakty użytkownika (IndexedDB) wstrzykiwane do kontekstu.
   Rutyny: briefing poranny i podsumowanie dnia o zadanej godzinie.
   ========================================================= */
'use strict';
(() => {
const S = () => J.state.settings;

/* ---------- PAMIĘĆ (fakty) ---------- */
let facts = null;
const loadFacts = async () => { if (!facts) facts = await J.store.get('memory.facts', []); return facts; };
J.memory = {
  async all() { return [...await loadFacts()]; },
  /* po imporcie kopii: wczytaj fakty od nowa z magazynu */
  reload() { facts = null; J.emit('memory'); },
  async remember(fact, scope = 'other') {
    const l = await loadFacts(); const n = J.norm(fact);
    const dup = l.find(f => J.norm(f.fact) === n); if (dup) { dup.ts = Date.now(); await J.store.set('memory.facts', l); return dup; }
    const f = { id: J.uid(), fact: String(fact).trim(), scope, ts: Date.now() }; l.push(f); while (l.length > 200) l.shift();
    await J.store.set('memory.facts', l); J.emit('memory'); return f;
  },
  async recall(query) { const l = await loadFacts(); if (!query) return l.slice(-30); const q = J.norm(query); const words = q.split(' ').filter(w => w.length > 2); return l.filter(f => { const n = J.norm(f.fact); return n.includes(q) || words.some(w => n.includes(w)); }); },
  async forget(q) { const l = await loadFacts(); const n = J.norm(q); const keep = l.filter(f => f.id !== q && !J.norm(f.fact).includes(n)); const removed = l.length - keep.length; if (removed) { facts = keep; await J.store.set('memory.facts', keep); J.emit('memory'); } return removed; },
  /* poprawka treści faktu (memory_edit, Ustawienia → Pamięć) */
  async update(id, text) { const l = await loadFacts(); const f = l.find(x => x.id === id); if (!f) return null; f.fact = String(text).trim().slice(0, 300); f.ts = Date.now(); await J.store.set('memory.facts', l); J.emit('memory'); return f; },
  /* synchroniczny wycinek do pakietu (po pierwszym załadowaniu) */
  snapshot() { return (facts || []).slice(-12).map(f => f.fact); }
};
loadFacts().catch(() => { facts = []; });

/* ---------- SYGNAŁY ŚRODOWISKA ---------- */
const queue = [];   // niedostarczone sygnały (do pakietu / tury aktywnej)
let activeCount = [];   // znaczniki czasu tur aktywnych (limit/h)
const LABEL = { 'timer.ended': 'minutnik zakończony', 'task.due': 'przypomnienie', 'task.overdue': 'zaległe zadania', 'market.alert': 'alert kursu', 'network.changed': 'zmiana połączenia', 'hermes.status': 'status Hermesa', 'task.failed': 'zadanie nie powiodło się', 'routine': 'rutyna', 'files.changed': 'pliki' };
const quietNow = () => { const s = S(); if (!s.quietFrom || !s.quietTo) return false; const now = J.hhmm(); return s.quietFrom <= s.quietTo ? (now >= s.quietFrom && now < s.quietTo) : (now >= s.quietFrom || now < s.quietTo); };
const rel = ts => { const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? 'przed chwilą' : m < 60 ? m + ' min temu' : Math.round(m / 60) + ' h temu'; };
J.signals = {
  LABEL,
  push(type, payload = {}, opts = {}) {
    const sig = { id: J.uid(), type, payload, ts: Date.now(), text: opts.text || (LABEL[type] || type) + (payload.label ? ': ' + payload.label : payload.text ? ': ' + payload.text : ''), prompt: opts.prompt || null, delivered: false };
    queue.push(sig); while (queue.length > 40) queue.shift();
    J.store.push('signals.log', { type, ts: sig.ts, text: sig.text }, 300).catch(() => { });
    J.ev.emit('signal', { signal: sig }); J.emit('signal', sig);
    if (opts.notice !== false) J.notice?.({ title: sig.text.split(':')[0], body: sig.text.split(':').slice(1).join(':').trim() || undefined, kind: type.split('.')[0], signal: true, actions: opts.actions });
    if (sig.prompt) J.signals.maybeActive(sig);
    return sig;
  },
  pending: () => queue.filter(s => !s.delivered),
  /* pakiet zabiera niedostarczone sygnały i oznacza je jako przekazane */
  drain() { const l = queue.filter(s => !s.delivered).map(s => { s.delivered = true; return { t: rel(s.ts), type: s.type, text: s.text }; }); return l; },
  clear() { queue.length = 0; },
  quietNow,
  /* tryb aktywny: Jarvis sam rozpoczyna turę na podstawie sygnału (z limitem i zasadami) */
  canActive() {
    const s = S(); if (s.proactive !== 'active') return false;
    if (document.hidden || quietNow() || J.brain?.busy || !J.aiReady() || J.hermes.status !== 'up') return false;
    const inp = document.activeElement; if (inp && /INPUT|TEXTAREA/.test(inp.tagName) && inp.value) return false;
    activeCount = activeCount.filter(t => Date.now() - t < 3600e3); return activeCount.length < (s.proactiveMax || 4);
  },
  async maybeActive(sig) {
    if (!J.signals.canActive()) return false;
    if (J.judge?.enabled()) { const u = await J.judge.urgency(sig); if (u != null && u < J.judge.thresholds().interrupt) { J.proc.active || J.log('Sygnał odłożony', sig.text + ' · pilność ' + Math.round(u * 100) + '%'); return false; } }
    if (!J.signals.canActive()) return false;
    activeCount.push(Date.now()); sig.delivered = true;
    J.sfx.signal();
    setTimeout(() => J.brain.handle(sig.prompt, { source: 'signal', signal: sig, silentWindow: true }), 400);
    return true;
  }
};

/* ---------- ZDARZENIA → SYGNAŁY ---------- */
J.on('timer-ended', t => J.signals.push('timer.ended', { label: t.label, total_s: Math.round(t.total / 1000) }, { actions: [{ label: '+5 min', cmd: 'start_timer', args: { seconds: 300, label: t.label } }], prompt: 'Sygnał środowiska: minutnik „' + t.label + '” właśnie się skończył. Zapytaj krótko, co dalej (np. przerwa lub kolejny blok), i zaproponuj konkretną akcję.', notice: false }));
J.on('task-due', t => J.signals.push('task.due', { id: t.id, text: t.text, time: t.time }, { actions: [{ label: 'Zrobione', cmd: 'tasks_complete', args: { task: t.id } }, { label: '+15 min', cmd: 'tasks_update', args: { task: t.id, snooze_minutes: 15 } }, { label: 'Jutro', cmd: 'tasks_update', args: { task: t.id, date: J.nlp.date('jutro') } }], prompt: 'Sygnał środowiska: nadszedł czas zadania „' + t.text + '” (' + t.time + '). Przypomnij o nim jednym zdaniem i zapytaj, czy odhaczyć albo przełożyć.', notice: false }));
J.on('task-overdue', list => J.signals.push('task.overdue', { count: list.length, text: list.map(t => t.time + ' ' + t.text).join(', ') }, { text: 'W międzyczasie minęły: ' + list.map(t => t.time + ' ' + t.text).join(', '), prompt: 'Sygnał środowiska: w czasie nieobecności minęły zadania: ' + list.map(t => t.time + ' ' + t.text).join(', ') + '. Zaproponuj, co z nimi zrobić (odhaczyć, przełożyć).' }));
J.on('market-alert', a => J.signals.push('market.alert', { symbol: a.symbol, price: a.price, text: a.symbol + ' ' + (a.direction === 'above' ? 'przekroczył' : 'spadł poniżej') + ' ' + J.fmtMoney(a.price) + ' (teraz ' + J.fmtMoney(a.now) + ')' }, { actions: [{ label: 'Pokaż', cmd: 'app_view', args: { app: 'market', view: 'coin', target: a.symbol } }], prompt: 'Sygnał środowiska: kurs ' + a.symbol + ' ' + (a.direction === 'above' ? 'przekroczył' : 'spadł poniżej') + ' ' + J.fmtMoney(a.price) + ' — aktualnie ' + J.fmtMoney(a.now) + '. Poinformuj użytkownika jednym zdaniem.' }));
addEventListener('online', () => J.signals.push('network.changed', { online: true, text: 'połączenie przywrócone' }, { notice: false }));
addEventListener('offline', () => J.signals.push('network.changed', { online: false, text: 'brak internetu' }, { notice: false }));
J.on('hermes', () => { const st = J.hermes.status; if (st === 'down') J.signals.push('hermes.status', { status: st, text: 'Hermes offline — działa silnik lokalny' }, { notice: false }); });
J.ev.on('task.failed', e => { if (!e.payload.replay && e.payload.title) J.signals.push('task.failed', { text: e.payload.title }, { notice: false }); });

/* ---------- PRZYPOMNIENIA: dokładny timer + zaległe po powrocie ---------- */
let dueTimer = null;
const schedule = () => {
  clearTimeout(dueTimer);
  const today = J.today(), now = J.hhmm();
  const next = J.state.tasks.filter(t => !t.fired && !t.done && t.time && t.date === today && alarmOf(t) > now).sort((a, b) => alarmOf(a).localeCompare(alarmOf(b)))[0];
  if (!next) return;
  const [hh, mm] = alarmOf(next).split(':').map(Number); const at = new Date(); at.setHours(hh, mm, 0, 0);
  dueTimer = setTimeout(check, Math.max(500, at - Date.now() + 200));
};
/* godzina przypomnienia: termin minus remind (minuty przed) */
const alarmOf = t => { if (!t.remind) return t.time; const [h, m] = t.time.split(':').map(Number); const v = Math.max(0, h * 60 + m - t.remind); return J.pad(Math.floor(v / 60)) + ':' + J.pad(v % 60); };
const check = () => {
  const now = J.hhmm(), today = J.today(), nowMin = +now.slice(0, 2) * 60 + +now.slice(3);
  const overdue = [];
  J.state.tasks.forEach(t => {
    if (t.fired || t.done || !t.time || t.date !== today || alarmOf(t) > now) return;
    t.fired = true;
    const late = nowMin - (+alarmOf(t).slice(0, 2) * 60 + +alarmOf(t).slice(3));
    if (late > 2) { overdue.push(t); return; }
    if (J.notifChannel?.(t.priority === 'high' ? 'agent' : 'task').sound !== false || t.priority === 'high') J.sfx.notify(); J.toast('⏰ ' + t.time + ' — ' + t.text + (t.remind ? ' (za ' + t.remind + ' min)' : ''), 6000);
    J.log('Przypomnienie', t.time + ' — ' + t.text, 'warn');
    J.voice.speak('Przypomnienie: ' + t.text, { priority: 2 });
    J.notify?.('Jarvis — przypomnienie', t.time + ' ' + t.text);
    J.emit('task-due', t);
  });
  if (overdue.length) { J.save(); J.emit('task-overdue', overdue); }
  J.save(); schedule();
};
J.tasks.check = check;
J.on('tasks', schedule);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { check(); J.routines.tick(); } });
setInterval(check, 60e3);   // siatka bezpieczeństwa (przeglądarka potrafi opóźnić timery w tle)
schedule();

/* ---------- ALERTY RYNKOWE (sprawdzane przy każdej aktualizacji kursu) ---------- */
J.on('market', sym => {
  const al = J.state.alerts; if (!al?.length) return;
  const hit = al.filter(a => { const d = J.market.data[a.symbol]; if (!d || !d.price || (sym && sym !== a.symbol)) return false; return a.direction === 'above' ? d.price >= a.price : d.price <= a.price; });
  if (!hit.length) return;
  J.state.alerts = al.filter(a => !hit.includes(a)); J.save();
  hit.forEach(a => { const now = J.market.data[a.symbol].price; J.sfx.notify(); J.toast('📈 ' + a.symbol + ' ' + (a.direction === 'above' ? '≥ ' : '≤ ') + J.fmtMoney(a.price) + ' (teraz ' + J.fmtMoney(now) + ')', 8000); J.voice.speak('Alert: ' + a.symbol + ' ' + (a.direction === 'above' ? 'przekroczył' : 'spadł poniżej') + ' ' + Math.round(a.price) + ' dolarów.', { priority: 2 }); J.emit('market-alert', { ...a, now }); });
});

/* ---------- CONTEXT PACKET ---------- */
let lastSent = null, turnsSinceFull = 0;
const build = (opts = {}) => {
  const s = S(), d = new Date();
  const today = J.today(), now = J.hhmm();
  const tasks = J.state.tasks;
  const plus1 = (() => { const x = new Date(); x.setDate(x.getDate() + 1); return x.getFullYear() + '-' + J.pad(x.getMonth() + 1) + '-' + J.pad(x.getDate()); })();
  const focusedId = J.wm.focused();
  const appState = focusedId && J.apps[focusedId]?.state ? (J.apps[focusedId].state(J.wm.ctx(focusedId)) || null) : null;
  const p = {
    v: 1,
    time: { iso: d.toISOString(), local: d.toLocaleString('pl-PL'), weekday: d.toLocaleDateString('pl-PL', { weekday: 'long' }), tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
    user: { initials: s.user, city: s.city, lang: 'pl', profile: J.memory.snapshot() },
    conn: { online: navigator.onLine, hermes: !J.aiReady() ? 'off' : J.hermes.status, model: s.hermesModel, agent_tools: J.hermes.tools || [] },
    desktop: {
      focused: focusedId ? { app: focusedId, title: J.apps[focusedId]?.title, state: appState } : null,
      windows: J.wm.info().map(w => ({ app: w.id, min: w.min })),
      widgets: J.widgets.list.map(w => ({ id: w.id, type: w.type, title: w.title, preview: w.type === 'list' ? w.data.items.length + ' poz., ' + w.data.items.filter(i => i.done).length + ' ✓' : w.type === 'spec' ? 'z opisu: ' + w.spec.blocks.map(b => b.kind).join(', ') : String(w.data.text || '').slice(0, 60) })),
      shortcuts: J.state.shortcuts.map(x => x.name),
      focus_mode: !!document.querySelector('#app.focus'), theme: Object.keys(J.THEMES).find(k => J.THEMES[k][0] === s.accent) || s.accent, wallpaper: s.wall,
      timer: J.timer.running ? { label: J.timer.label, left_s: Math.round(J.timer.left() / 1000) } : null,
      timers: J.timers.all().length > 1 ? J.timers.all().map(t => ({ label: t.label, left_s: Math.round(t.left() / 1000) })) : undefined,
      sound: !!s.sound, speech: !!s.speech, proactive: s.proactive || 'quiet',
      ui_mode: J.state.ui.mode || 'work', pinned: J.wm.info().filter(w => J.wm.isPinned?.(w.id)).map(w => w.id),
      chat_thread: J.threads?.current?.() || 'main', undo_available: J.undo ? J.undo.list().length : 0,
      routines: (J.state.routines || []).map(r => r.name + (r.enabled === false ? ' (wył.)' : '')),
      plan: J.plan?.paused ? 'paused' : undefined
    },
    notes: { count: J.notes.live().length, recent: J.notes.live().slice(0, 10).map(n => ({ id: n.id, title: n.title })) },
    tasks: { today: tasks.filter(t => t.date === today).map(t => ({ id: t.id, time: t.time, text: t.text, done: t.done })), overdue: tasks.filter(t => !t.done && (t.date < today || (t.date === today && t.time && t.time < now))).length, tomorrow: tasks.filter(t => t.date === plus1).length },
    alerts: (J.state.alerts || []).map(a => a.symbol + ' ' + (a.direction === 'above' ? '>' : '<') + ' ' + a.price),
    last_task: J.engine.last ? { title: J.engine.last.title, status: J.engine.last.status, summary: String(J.engine.last.result || '').slice(0, 160) } : null,
    events: J.engine.recent ? J.engine.recent(5) : [],
    signals: opts.quiet ? J.signals.pending().map(x => ({ t: rel(x.ts), type: x.type, text: x.text })) : J.signals.drain(),
    unread_notifications: J.notifs ? J.notifs.unread() : 0
  };
  return p;
};
J.context = {
  packet(opts = {}) {
    const p = build(opts);
    if (opts.quiet) return p;
    let out; turnsSinceFull++;
    if (opts.full || !lastSent || turnsSinceFull >= 8) { out = { ...p, _full: true }; turnsSinceFull = 0; }
    else {
      out = { v: 1, _full: false, time: p.time };
      for (const k of Object.keys(p)) { if (k === 'time' || k === 'v') continue; if (JSON.stringify(p[k]) !== JSON.stringify(lastSent[k])) out[k] = p[k]; }
    }
    lastSent = p;
    let txt = JSON.stringify(out);
    if (txt.length > 6000) { out.notes = { count: p.notes.count, recent: p.notes.recent.slice(0, 4) }; out.events = []; txt = JSON.stringify(out); }
    return out;
  },
  text(opts) { const p = J.context.packet(opts); return '<environment>\n' + JSON.stringify(p) + '\n</environment>'; },
  reset() { lastSent = null; turnsSinceFull = 0; },
  describeSignals(list) { return list.map(s => s.t + ': ' + s.text).join('; '); }
};

/* ---------- RUTYNY: briefing poranny, podsumowanie dnia ---------- */
const ROUTINES = {
  briefing: { key: 'briefingTime', label: 'Poranny briefing', prompt: () => 'Rutyna: poranny briefing. Na podstawie kontekstu środowiska (pogoda przez get_weather, zadania na dziś, zaległe, alerty, kursy jeśli użytkownik je śledzi) przygotuj zwięzły briefing dnia w 3–5 zdaniach do odczytania na głos. Zacznij od powitania odpowiedniego do pory dnia.' },
  summary: { key: 'summaryTime', label: 'Podsumowanie dnia', prompt: () => 'Rutyna: podsumowanie dnia. Sprawdź zadania (tasks_list today), notatki z dzisiaj (notes_list) i podsumuj w 3 zdaniach, co zostało zrobione, a co przechodzi na jutro. Zaproponuj przełożenie niewykonanych zadań, ale nie wykonuj tego bez zgody.' }
};
J.routines = {
  list: () => Object.entries(ROUTINES).map(([id, r]) => ({ id, label: r.label, time: S()[r.key] || '', last: (J.state.ui.routinesRun || {})[id] || null })),
  tick() {
    const s = S(), today = J.today(), now = J.hhmm(); const run = J.state.ui.routinesRun = J.state.ui.routinesRun || {};
    for (const [id, r] of Object.entries(ROUTINES)) {
      const at = s[r.key]; if (!at || run[id] === today || now < at) continue;
      const lateMin = (+now.slice(0, 2) * 60 + +now.slice(3)) - (+at.slice(0, 2) * 60 + +at.slice(3));
      if (lateMin > 10 && !(J.state.ui.routinesRun[id + ':late'] === today)) { run[id + ':late'] = today; J.save(); J.notice({ title: r.label, body: 'pominięty (karta była nieaktywna o ' + at + ')', kind: 'routine' }); continue; }
      run[id] = today; J.save();
      if (J.brain.busy || !J.aiReady() || J.hermes.status !== 'up') { J.signals.push('routine', { label: r.label }, { text: r.label + ' czeka — Hermes niedostępny lub trwa zadanie' }); continue; }
      J.sfx.signal(); J.brain.handle(r.prompt(), { source: 'routine', silentWindow: true, routine: id });
    }
  },
  reschedule() { }
};
setInterval(() => J.routines.tick(), 60e3);
setTimeout(() => J.routines.tick(), 8000);
})();
