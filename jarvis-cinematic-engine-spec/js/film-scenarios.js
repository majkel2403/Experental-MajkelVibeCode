/* =========================================================
   JARVIS OS — Film jako moduł scenariuszy (ADR 0009).
   Silnik filmu (js/workflow-cinema.js) umie pokazać każdą pracę jako scenę z filmu; ten moduł decyduje, KIEDY i Z CZEGO:
   · rejestr scenariuszy — workflow, zadania Hermesa (Telegram, konsola…), harmonogram, polecenia z czatu, film dnia;
     każdy ma własny tryb: wyłączony / zaproponuj w czacie / włącz sam; wyłącznik całego modułu: ustawienie „filmOn”;
   · obserwuje Process Log (J.proc.observe) — czyli każde zadanie, skądkolwiek przyszło — i dla dłuższych buduje film
     na żywo (kroki dochodzą w trakcie) albo proponuje go; po zakończeniu proponuje powtórkę z zapisu;
   · „pokaż film z zadania” + przycisk 🎬 w Process Logu: powtórka dowolnego zadania z historii.
   Nowy scenariusz = jedno J.workflows.cinema.registerScenario({...}); ustawienia dostają dla niego wiersz same.
   ========================================================= */
'use strict';
(() => {
const C = J.workflows?.cinema;
if (!C || !J.proc?.observe) return;
const R = J.registry, { ok, fail } = R, T = C._t, { fxRank } = J.workflows.ui;
const MODE_PL = { off: 'wyłączone', ask: 'zaproponuj w czacie', auto: 'włącz sam na żywo' };
const CAP = 14;   // tyle scen naraz w konstelacji; dalsze narzędzia zwijają się do licznika (odpowiedź zawsze dostaje własną scenę)
const COOLDOWN = 45000;   // po zamknięciu filmu przez następne 45 s film sam się już nie włącza (najwyżej propozycja)

/* ---------- rejestr scenariuszy ---------- */
const SCEN = new Map();
const register = def => {
  if (!def?.id) throw new Error('scenariusz bez id');
  const d = { fallback: 'ask', modes: ['off', 'ask', 'auto'], order: 50, th: null, name: def.label, ...def };
  SCEN.set(d.id, d); return d;
};
register({ id: 'workflow', label: 'Workflow', hint: 'Przebiegi z silnika workflow (np. „zrób projekt z pomysłu …”).', fallback: 'ask', order: 0 });
register({ id: 'telegram', label: 'Zadania Hermesa', name: 'Zadanie od Hermesa', fallback: 'auto', order: 10, th: { steps: 3, ms: 8000 },
  hint: 'Praca Hermesa zlecona z Telegrama, konsoli i innych kanałów.', match: t => /^(Telegram|Konsola|Hermes):\s/.test(t) });
register({ id: 'cron', label: 'Zadania z harmonogramu', name: 'Zadanie z harmonogramu', fallback: 'auto', order: 11, th: { steps: 3, ms: 8000 },
  hint: 'Automatyczne zadania Hermesa o stałych porach (raporty, radar…).', match: t => /^Cron:\s/.test(t) });
register({ id: 'chat', label: 'Dłuższe polecenia z czatu', name: 'Zadanie z pulpitu', fallback: 'auto', order: 90, th: { steps: 4, ms: 12000 },
  hint: 'Polecenia wpisane albo powiedziane na pulpicie; krótkie zostają bez filmu.', match: () => true });
register({ id: 'day', label: 'Film dnia', fallback: 'ask', modes: ['off', 'ask'], order: 99, hint: 'Wieczorna propozycja filmu z całego dnia (po 20:00, od 3 scen).' });

const S = () => J.state?.settings || {};
/* tryb scenariusza z ustawień (bez wyłącznika modułu) */
const rawMode = id => {
  const d = SCEN.get(id), s = S();
  if (id === 'workflow') return MODE_PL[s.wfFilm] ? s.wfFilm : d.fallback;
  if (id === 'day') { const v = s.filmScen?.day; return d.modes.includes(v) ? v : s.wfFilm === 'off' ? 'off' : 'ask'; }   // dawniej: „nie proponuj” wyłączało też film dnia
  const v = s.filmScen?.[id];
  return d?.modes.includes(v) ? v : d?.fallback || 'ask';
};
C.mode = id => (S().filmOn === false ? 'off' : SCEN.has(id) ? rawMode(id) : 'off');
C.rawMode = rawMode;
C.setMode = (id, v) => {
  const d = SCEN.get(id), s = S(); if (!d || !d.modes.includes(v)) return false;
  if (id === 'workflow') s.wfFilm = v; else s.filmScen = { ...(s.filmScen || {}), [id]: v };
  J.save?.(); J.emit?.('settings'); return true;
};
C.scenarios = () => [...SCEN.values()].sort((a, b) => a.order - b.order);
C.registerScenario = register;
C.modeLabels = MODE_PL;
/* opis progu „dłuższego” zadania do ustawień */
C.describe = d => d.hint + (d.th ? ' Film od ' + d.th.steps + ' narzędzi albo ' + Math.round(d.th.ms / 1000) + ' s pracy.' : '');

/* ---------- co jest zadaniem na film ---------- */
const classify = title => {
  const t = String(title || '');
  if (/^Workflow:\s/i.test(t)) return null;   // przebiegi workflow mają własny film (silnik z mostu)
  return C.scenarios().find(d => d.match?.(t)) || null;
};
const bare = t => String(t || '').replace(/^(Telegram|Cron|Konsola|Hermes):\s*/, '');
const pretty = st => st.kind === 'tool' ? (R.get?.(st.title)?.label || String(st.title)) : String(st.title).replace(/\s+/g, ' ').slice(0, 70);
const textOf = st => String((st.fields || []).find(f => f[0] === 'Treść')?.[1] ?? st.preview ?? '').trim();
const replyScene = (id, text) => ({ id: 'p' + id, title: 'Odpowiedź', kind: 'answer', state: 'done', ms: null, artifact: { kind: 'fields', fields: { title: 'Odpowiedź', Treść: String(text || '—').slice(0, 700) } } });

/* ---------- zapisane zadanie → sceny (powtórka) ---------- */
const scenesOfSaved = steps => {
  const out = [];
  (steps || []).forEach(st => {
    if (st.kind === 'tool' || st.kind === 'server') out.push({ id: 'p' + st.id, title: pretty(st), kind: st.kind === 'server' ? 'server' : 'tool', state: st.status === 'err' ? 'failed' : 'done', ms: Math.max(1, st.dur || 0), err: st.status === 'err' ? String(st.preview || '') : '' });
    else if (st.kind === 'reply') out.push(replyScene(st.id, textOf(st)));
  });
  return out;
};
/* kolejne takie same narzędzia → jedna scena „×N”; nadmiar w środku → jedna scena zbiorcza; odpowiedź zostaje na końcu */
const compact = (list, max = CAP) => {
  const merged = [];
  list.forEach(s => {
    const p = merged[merged.length - 1];
    if (p && p.kind === s.kind && s.kind !== 'answer' && p.base === s.title && p.state === s.state) { p.n++; p.ms = (p.ms || 0) + (s.ms || 0); p.title = p.base + ' (×' + p.n + ')'; }
    else merged.push({ ...s, base: s.title, n: 1 });
  });
  if (merged.length <= max) return merged;
  const tail = merged[merged.length - 1].kind === 'answer' ? 1 : 0, keep = max - 1 - tail;   // początek + scena zbiorcza + (odpowiedź) = max
  const head = merged.slice(0, keep), rest = merged.slice(keep, merged.length - tail);
  return [...head, { id: 'p-rest', title: 'Kolejne kroki (' + rest.reduce((a, s) => a + s.n, 0) + ')', kind: 'tool', base: '', n: 0, state: rest.some(s => s.state === 'failed') ? 'failed' : 'done', ms: rest.reduce((a, s) => a + (s.ms || 0), 0) }, ...merged.slice(merged.length - tail)];
};
const runStep = s => ({ id: s.id, title: s.title, kind: s.kind, state: s.state, attempts: s.state === 'pending' ? 0 : 1, ms: s.ms ?? null, score: null, preview: s.preview || '', artifact: s.artifact || null, errors: s.err ? [s.err] : [] });

/* film z zapisu (powtórka): zdarzenia odtworzone ze stanu zadania */
const playback = p => {
  const scenes = compact(p.scenes);
  if (!scenes.length) return false;
  const src = { id: 'task:' + p.id, name: p.d.name, workflow: p.d.id, state: p.state, started: p.started, ended: p.ended, inputs: { zadanie: p.title }, steps: scenes.map(runStep), report: p.state === 'done' ? p.report : '', reason: p.state === 'done' ? '' : p.report, scen: true };
  return C.openSource(src, T.synth(src), { scen: p.d.id, again: () => playback(p) });
};
const stateOf = status => status === 'ok' ? 'done' : status === 'abort' ? 'stopped' : 'failed';
const replaySaved = saved => {
  const d = classify(saved?.title); if (!d) return false;
  return playback({ id: saved.id, d, title: bare(saved.title), state: stateOf(saved.status), started: saved.ts / 1000, ended: (saved.ts + (saved.dur || 0)) / 1000, report: String(saved.result || ''), scenes: scenesOfSaved(saved.steps) });
};

/* ---------- zadania na żywo (obserwator Process Logu) ---------- */
const recs = new Map();   // id zadania → zapis; trzymamy kilka ostatnich
let approvals = 0, lastCloseAt = 0;
const emit = (rec, e) => { const ev = { v: 1, run_id: 'task:' + rec.id, workflow: rec.d.id, name: rec.d.name, ts: Date.now() / 1000, state: 'running', total: rec.scenes.length, ...e }; rec.listeners.forEach(fn => { try { fn(ev); } catch (er) { /* film zamknięty */ } }); };
const snap = rec => ({ id: 'task:' + rec.id, name: rec.d.name, workflow: rec.d.id, state: rec.state, started: rec.t0 / 1000, ended: rec.t1 ? rec.t1 / 1000 : null, inputs: { zadanie: rec.title }, scen: true, steps: rec.scenes.map(runStep) });
const sceneEvt = (rec, s) => ({ step_id: s.id, n: rec.scenes.indexOf(s) + 1, kind: s.kind, title: s.title, attempt: 1, step: { id: s.id, title: s.title, kind: s.kind } });
const finish = (rec, s, st) => {
  s.ms = Math.max(1, st.dur || 0); s.state = st.status === 'err' ? 'failed' : 'done';
  if (s.state === 'failed') { s.err = String(st.preview || '').slice(0, 120); emit(rec, { ...sceneEvt(rec, s), type: 'step.failed', soft: true, reason: s.err }); }   // pojedyncze nieudane narzędzie — łagodnie, bez „Awarii”
  else emit(rec, { ...sceneEvt(rec, s), type: 'step.completed', ms: s.ms, preview: st.preview || '' });
};

/* czy film może włączyć się sam: nic mu nie przeszkadza i nikt nie jest w trakcie pisania, zgody ani prezentacji */
const quietNow = () => { const s = S(); if (!s.quietFrom || !s.quietTo) return false; const now = J.hhmm(), a = s.quietFrom, b = s.quietTo; return a <= b ? now >= a && now < b : now >= a || now < b; };
const typing = () => { const a = typeof document !== 'undefined' ? document.activeElement : null; return !!a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && String(a.value || '').trim().length > 0; };
const blocked = () => typeof document === 'undefined' ? 'brak okna' : document.hidden ? 'karta w tle' : C.active ? 'trwa inny film' : !(J.booted || !J.bootEnter) ? 'ekran startowy'
  : fxRank() < 1 ? 'efekty wyłączone' : quietNow() ? 'cisza nocna' : typing() ? 'piszesz w polu' : approvals > 0 ? 'czeka zgoda' : ['present', 'focus'].includes(J.state?.ui?.mode) ? 'tryb prezentacji/skupienia'
  : Date.now() - lastCloseAt <= COOLDOWN ? 'film zamknięty przed chwilą' : '';
const canAuto = () => !blocked();

const openLive = rec => {
  if (rec.state !== 'running' || !rec.scenes.length) return false;
  rec.card?.remove?.(); rec.card = null; rec.opened = true; rec.closed = false;
  const link = { get: () => snap(rec), on: fn => { rec.listeners.add(fn); return () => rec.listeners.delete(fn); }, eta: null, resync: false };
  return C.openSource(snap(rec), null, { scen: rec.d.id, dyn: true, feed: link, again: () => playRec(rec) });
};
const playRec = rec => playback({ id: rec.id, d: rec.d, title: rec.title, state: rec.state === 'running' ? 'done' : rec.state, started: rec.t0 / 1000, ended: (rec.t1 || Date.now()) / 1000, report: rec.report, scenes: rec.scenes.map(s => ({ ...s })) });
const card = (rec, text, opts, fn) => { rec.card?.remove?.(); rec.card = J.chat?.quick?.(text, opts, v => { rec.card?.remove?.(); rec.card = null; fn(v); }) || null; };

/* „dłuższe” zadanie: dość narzędzi (ale nie pędzących w ułamku sekundy — film z błyskawicznego łańcucha nie ma sensu) albo dość długo trwa */
const MIN_MS = 2500;
const isLong = (rec, now = Date.now()) => { const th = rec.d.th; if (!th) return false; const el = now - rec.t0; return (rec.count >= th.steps && el >= MIN_MS) || (rec.count >= 2 && el >= th.ms); };
/* tryb „sam” przy przeszkodzie degraduje się do propozycji w czacie */
const consider = rec => {
  if (!rec.d.th || rec.opened || rec.offered || rec.closed || rec.state !== 'running' || !isLong(rec)) return;
  const mode = C.mode(rec.d.id); if (mode === 'off') return;
  rec.offered = true;
  const why = mode === 'auto' ? blocked() : '';
  if (mode === 'auto' && !why) { openLive(rec); return; }
  rec.why = why;   // dlaczego tylko propozycja (diagnostyka)
  card(rec, '🎬 Oglądać „' + rec.title.slice(0, 60) + '” na żywo jako film?', [{ label: '🎬 Oglądaj na żywo', value: 'go', primary: true }, { label: 'Nie teraz', value: 'no' }], v => { if (v === 'go') openLive(rec); });
};

const onProc = (type, p) => {
  const task = p.task;
  if (type === 'start') {
    const d = classify(task.title); if (!d) return;
    recs.set(task.id, { id: task.id, d, title: bare(task.title), t0: task.ts, t1: 0, state: 'running', scenes: [], byStep: new Map(), count: 0, report: '', listeners: new Set(), opened: false, offered: false, closed: false, card: null });
    if (recs.size > 6) recs.delete(recs.keys().next().value);
    /* próg czasu mija także wtedy, gdy zadanie stoi między krokami (np. Hermes pisze odpowiedź) */
    const rec = recs.get(task.id);
    if (d.th) rec.timers = [MIN_MS + 50, d.th.ms + 50].map(ms => { const t = setTimeout(() => consider(rec), ms); t?.unref?.(); return t; });
    return;
  }
  const rec = recs.get(task.id); if (!rec) return;
  if (type === 'step') {
    const st = p.step;
    if (st.kind === 'tool' || st.kind === 'server') {
      rec.count++;
      if (rec.scenes.length < CAP - 1) {
        const s = { id: 'p' + st.id, title: pretty(st), kind: st.kind === 'server' ? 'server' : 'tool', state: 'running', ms: null };
        rec.scenes.push(s); rec.byStep.set(st.id, s);
        emit(rec, { ...sceneEvt(rec, s), type: 'step.started' });
        if (st.status !== 'run') finish(rec, s, st);
      }
    } else if (st.kind === 'reply') {
      rec.report = textOf(st);
      const s = replyScene(st.id, rec.report); s.state = 'running'; rec.scenes.push(s);
      emit(rec, { ...sceneEvt(rec, s), type: 'step.started' });
      s.state = 'done'; emit(rec, { ...sceneEvt(rec, s), type: 'step.completed', ms: null, preview: rec.report.slice(0, 70), artifact: s.artifact });
    }
    consider(rec);
  } else if (type === 'stepEnd') {
    const s = rec.byStep.get(p.step.id); if (s && s.state === 'running') finish(rec, s, p.step);
  } else if (type === 'end') {
    (rec.timers || []).forEach(clearTimeout);
    rec.state = stateOf(p.saved.status); rec.t1 = Date.now(); rec.report = String(p.saved.result || rec.report || '');
    emit(rec, { type: rec.state === 'done' ? 'run.completed' : rec.state === 'stopped' ? 'run.stopped' : 'run.failed', state: rec.state, report: rec.state === 'done' ? rec.report : '', reason: rec.state === 'done' ? '' : rec.report });
    /* po zadaniu: film, którego nikt nie otworzył, można obejrzeć z zapisu (dla stopniowanych „wyłączonych” — cisza) */
    if (!rec.opened && !rec.closed && rec.d.th && isLong(rec, rec.t1) && C.mode(rec.d.id) !== 'off' && rec.state !== 'stopped') {
      card(rec, '🎬 Film z zadania „' + rec.title.slice(0, 60) + '” jest gotowy.', [{ label: '🎬 Obejrzyj', value: 'go', primary: true }, { label: 'Później', value: 'no' }], v => { if (v === 'go') playRec(rec); });
    }
    rec.listeners.clear();
  }
};
J.proc.observe((type, p) => { try { onProc(type, p); } catch (e) { console.error('[film]', e); } });

/* zgoda użytkownika zasłonięta filmem byłaby pułapką — film ustępuje, i nie wraca w tym zadaniu */
const liveRec = () => { const id = C.current?.runId; return id && id.startsWith('task:') ? recs.get(id.slice(5)) : null; };
J.ev?.on?.('approval.requested', () => { approvals++; const rec = liveRec(); if (rec && C.active) { rec.closed = true; C.close(); J.toast?.('Film zamknięty — czekam na Twoją zgodę.', 4000); } });
J.ev?.on?.('approval.resolved', () => { approvals = Math.max(0, approvals - 1); });
J.on('cinema', p => { if (p?.open === false) { lastCloseAt = Date.now(); const rec = p.id?.startsWith?.('task:') ? recs.get(p.id.slice(5)) : null; if (rec) { rec.closed = true; rec.opened = false; } } });

/* ---------- polecenie „pokaż film z zadania” i przycisk 🎬 w Process Logu ---------- */
R.add({ id: 'task_film', group: 'Workflow', label: 'Film z zadania', idempotent: true, reads: ['workflows'],
  description: 'Film z zadania z Process Logu (polecenie z czatu, zadanie z Telegrama albo harmonogramu): powtórka z zapisu jako scena z filmu — kroki, narzędzia, odpowiedź. Domyślnie zadanie oglądane w Process Logu albo ostatnie. Esc zamyka.',
  args: { type: 'object', properties: { id: { type: 'string', description: 'id zadania z historii Process Logu; domyślnie oglądane lub ostatnie' } } },
  examples: ['pokaz film z zadania', 'film z ostatniego zadania', 'pokaz film z ostatniego polecenia', 'odtworz film z zadania'],
  parse(raw, n) { return /^(?:pokaz\s+|odtworz\s+|pusc\s+)?film\s+z\s+(?:ostatni(?:ego|ej)\s+)?(?:zadania|polecenia|zlecenia)$/.test(n) ? { args: {}, score: 47 } : null; },
  async run({ id }) {
    if (typeof document === 'undefined' || !document.body?.appendChild) return fail('OFFLINE', 'Film działa tylko na pulpicie Jarvis OS.');
    const hist = J.state?.history || [], v = J.proc.viewing, shown = v?.steps && v !== J.proc.current ? hist.find(x => x.id === v.id) || v : null;   // oglądane w panelu (nie trwające) albo najnowsze
    const saved = id ? hist.find(x => x.id === id) : shown || hist[0];
    if (!saved) return fail('NOT_FOUND', id ? 'Nie ma takiego zadania w historii.' : 'Nie ma jeszcze żadnego zadania w historii.');
    if (/^Workflow:\s/i.test(saved.title || '')) return fail('INVALID_ARGS', 'To przebieg workflow — powiedz „pokaż film”.');
    return replaySaved(saved) ? ok({ id: saved.id }, 'Film z zadania „' + bare(saved.title).slice(0, 60) + '” — Esc zamyka.') : fail('NOT_FOUND', 'To zadanie nie miało kroków do pokazania.');
  } });
J.policy?.A3?.add('task_film');

const bindButton = () => {
  const b = typeof document !== 'undefined' ? document.querySelector('#lpFilm') : null; if (!b) return;
  b.onclick = async () => {
    const now = J.proc.current, rec = now ? recs.get(now.id) : null;
    if (rec) { if (!openLive(rec)) J.toast?.('To zadanie ma jeszcze za mało kroków na film.', 3000); return; }
    const r = await J.uiRun?.(now ? 'workflow_film' : 'task_film', {});
    if (r && !r.ok) J.toast?.(r.text || r.message || 'Nie da się teraz pokazać filmu.', 3500);
  };
};
bindButton();
C._scen = { resetCooldown: () => { lastCloseAt = 0; }, blocked, classify, compact, scenesOfSaved, canAuto, consider, isLong, recs, SCEN, bare, pretty, replaySaved, playback };   // testy
})();
