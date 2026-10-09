/* =========================================================
   JARVIS OS — szybka ścieżka: parser → Jev → dopytanie → wykonanie → „Cofnij”
   Orkiestruje drzewo decyzyjne z docs/JEV-PLAN.md (sekcja 7). Sama nie podejmuje decyzji o zaufaniu:
   robi to czysta funkcja J.policy.route, a ryzyko egzekwuje rejestr poleceń (registry.run).
   Zwraca { handled:true, reply } gdy polecenie załatwiono bez Hermesa albo { handled:false, verdict? } gdy sprawę
   przejmuje Hermes (verdict trafia do niego jako podpowiedź <judge>).
   ========================================================= */
'use strict';
(() => {
const R = J.registry, P = J.policy, norm = J.norm, S = () => J.state.settings;
const CONJ = /\s(i|oraz|potem|nastepnie|a nastepnie|a potem)\s/;   // spójniki łączące kilka poleceń: parser sam nie rozstrzyga
const MAX_HOPS = 6;

/* ---------- wartości z zamkniętej listy (D8) ---------- */
const LABELS = {
  app: () => ({ ...J.APP_NAMES, all: 'wszystkie okna', current: 'aktywne okno', next: 'następne okno' }),
  wallpaper: () => ({ photo: 'zdjęcie: jezioro w górach', aurora: 'aurora', void: 'pustka i ciemność' }),
  range: () => ({ today: 'dzisiaj', tomorrow: 'jutro', week: 'w tym tygodniu', all: 'wszystkie', overdue: 'zaległe' }),
  mode: () => ({ tile: 'kafelki', left: 'lewa połowa', right: 'prawa połowa', top: 'górna połowa', bottom: 'dolna połowa', max: 'maksymalizuj', center: 'wyśrodkuj', layout: 'zapisany układ okien' }),
  action: () => ({ stop: 'zatrzymaj', extend: 'przedłuż', status: 'ile zostało' }),
  type: () => ({ note: 'notatka', list: 'lista', result: 'wynik zadania' }),
  direction: () => ({ above: 'powyżej', below: 'poniżej' }),
  scope: () => ({ profile: 'profil', preference: 'preferencja', project: 'projekt', other: 'inne' })
};
/* opcje właściwości: z enum schematu albo z listy dynamicznej polecenia (np. zapisane układy okien) */
const optionsFor = (cmd, prop) => {
  const p = cmd.args.properties?.[prop]; if (!p) return null;
  const vals = p.enum || cmd.slotOptions?.[prop]?.(); if (!vals || !vals.length) return null;
  const lab = LABELS[prop]?.() || {};
  return vals.map(v => ({ value: String(v), label: lab[v] ? String(v) + ' — ' + lab[v] : String(v) }));
};
const missingRequired = (cmd, args) => [...(cmd.args.required || []), ...(cmd.needs?.(args) || [])].filter(k => args[k] === undefined || args[k] === null || args[k] === '');
/* complete | enum (da się wybrać z listy) | free (tekst/liczba/czas — pyta Jarvis) */
const classify = (cmd, missing) => !missing.length ? 'complete' : missing.some(k => optionsFor(cmd, k)) ? 'enum' : 'free';

/* „to/tu” (D4): brakujący argument = aktywny obiekt */
const fillDeixis = (cmd, args, v) => {
  const out = { ...args }; const f = J.wm.focused();
  if (!v || !(v.current >= .7) || !f) return out;
  for (const k of missingRequired(cmd, out)) {
    if (k === 'note' && f === 'notes') { const st = J.apps.notes?.state?.(J.wm.ctx('notes')); if (st?.noteId) out.note = st.noteId; }
    else if (k === 'app') { const en = cmd.args.properties.app.enum || []; if (en.includes('current')) out.app = 'current'; else if (en.includes(f)) out.app = f; }
    else if (k === 'widget' && f.startsWith('w:')) out.widget = f.slice(2);
  }
  return out;
};

/* ---------- pytania o brakujące wartości (slot-ask) ---------- */
const PROMPTS = { seconds: 'Na ile minut ustawić minutnik?', text: 'Co mam zapisać w zadaniu?', content: 'Co zapisać w notatce?', note: 'Której notatki dotyczy polecenie?', task: 'Którego zadania dotyczy polecenie?', widget: 'Którego widgetu dotyczy polecenie?', query: 'Czego mam szukać?', expression: 'Co policzyć?', title: 'Jaki tytuł?', name: 'Jaka nazwa?', fact: 'Co mam zapamiętać?', url: 'Jaki adres?', command: 'Jakie polecenie wykonać?', key: 'Które ustawienie?', value: 'Jaka wartość?' };
const ENUM_PROMPTS = { app: 'Którą aplikację?', color: 'Jaki kolor?', wallpaper: 'Którą tapetę?', range: 'Z jakiego zakresu pokazać zadania?', mode: 'Jak ułożyć okna?', layout: 'Który układ?', action: 'Co zrobić z minutnikiem?', type: 'Jaki rodzaj widgetu?', symbol: 'Który symbol?', direction: 'W którą stronę?', scope: 'Jaki to rodzaj faktu?' };
const promptFor = (cmd, k) => PROMPTS[k] || ENUM_PROMPTS[k] || cmd.args.properties[k]?.description || ('Podaj wartość: ' + k);
/* kandydaci lokalni (bez wysyłania niczego na zewnątrz): notatki, zadania, widgety */
const candidatesFor = k => k === 'note' ? J.notes.live().slice(0, 6).map(n => ({ id: n.id, label: n.title || 'Bez tytułu' }))
  : k === 'task' ? J.state.tasks.filter(t => !t.done).slice(0, 6).map(t => ({ id: t.id, label: (t.time || '--:--') + ' ' + t.text }))
  : k === 'widget' ? J.widgets.list.slice(0, 6).map(w => ({ id: w.id, label: w.title })) : [];
const parseFree = (k, prop, a) => {
  const s = String(a).trim();
  if (k === 'seconds') { const d = J.nlp.duration(s); if (d) return d; const n = J.nlp.numIn(s); return n != null ? Math.round(n * 60) : s; }
  if (prop?.format === 'time') return J.nlp.time(s) || J.nlp.time('o ' + s) || s;
  if (prop?.format === 'date') return J.nlp.date(s) || s;
  if (prop?.type === 'number' || prop?.type === 'integer') { const n = J.nlp.numIn(s); return n != null ? n : s; }
  return s;
};
const CANCEL = /^(anuluj|nie|stop|zostaw|niewazne|nic)\b/;
const askChips = async (question, opts, o) => {
  const items = opts.map((x, i) => ({ label: x.label, value: x.value, primary: i === 0 })).concat([{ label: 'Anuluj', value: '__cancel', danger: true }]);
  const a = await J.ask(question, items, { timeout: 30000, speak: true });
  if (a == null || a === '__cancel') return null;
  if (opts.some(x => x.value === a)) return a;
  const n = norm(String(a));
  if (CANCEL.test(n)) return null;   // „nie”/„anuluj” wpisane słowami to odmowa, nie wybór — includes dopasowywał „nie” do „niebieski”
  const toks = n.split(/\s+/).filter(Boolean);   // dopasowanie po całych tokenach (plus prefiks ≥3 znaki dla niedokończonych słów)
  const tokHas = (hay, needles) => { const H = norm(hay).split(/\s+/); return needles.length && needles.every(t => H.includes(t) || (t.length >= 3 && H.some(h => h.startsWith(t)))); };
  const hit = opts.find(x => tokHas(x.label, toks) || tokHas(n, norm(String(x.value)).split(/\s+/).filter(Boolean)));
  return hit ? hit.value : null;
};
const fillEnums = async (cmd, args, missing, text, th, noAsk = false) => {
  const props = missing.map(k => ({ name: k, options: optionsFor(cmd, k) })).filter(p => p.options);
  const res = await J.judge.slots(props.map(p => ({ name: p.name, options: p.options.map(o => ({ value: o.value, label: o.label })) })), text);
  const out = {}; let asked = 0;
  for (const p of props) {
    const r = res?.[p.name];
    if (r && r.confidence >= th.slot) { out[p.name] = r.value; continue; }
    if (noAsk) return { handoff: true };
    const v = await askChips(ENUM_PROMPTS[p.name] || promptFor(cmd, p.name), p.options); asked++;
    if (v == null) return { cancel: true };
    out[p.name] = v;
  }
  return { values: out, asked };
};
const askFree = async (cmd, args, missing) => {
  const out = {};
  for (const k of missing) {
    if (optionsFor(cmd, k)) continue;
    const cands = candidatesFor(k);
    if (cands.length) { const v = await askChips(promptFor(cmd, k), cands.map(c => ({ value: c.id, label: c.label }))); if (v == null) return { cancel: true }; out[k] = v; continue; }
    const a = await J.ask(promptFor(cmd, k), [], { timeout: 45000, speak: true });
    if (a == null || CANCEL.test(norm(String(a)))) return { cancel: true };
    out[k] = parseFree(k, cmd.args.properties[k], a);
  }
  return { values: out };
};

/* ---------- wykonanie przez rejestr, z rozstrzyganiem niejednoznaczności ---------- */
const execute = async (cmd, args, trust, o, verdict) => {
  const source = trust === 'local' ? 'local' : trust === 'voice' ? 'voice' : 'jev';
  let a = { ...args }, r = await o.run(cmd.id, a, { source, signal: o.signal, judge: verdict });
  if (!r.ok && r.code === 'AMBIGUOUS' && r.data?.candidates?.length) {
    const key = ['note', 'task', 'widget', 'name'].find(k => a[k] !== undefined) || 'note';
    const c = r.data.candidates.slice(0, 5), labels = c.map(x => ({ value: x.id, label: x.title || ((x.time || '--:--') + ' ' + (x.text || '')) || x.id }));
    const v = await askChips('Które z nich?', labels);
    if (v == null) return { r: { ok: false, code: 'CANCELLED', text: cancelled() }, args: a };
    a[key] = v; r = await o.run(cmd.id, a, { source, signal: o.signal, judge: verdict });
  }
  return { r, args: a };
};

const log = (id, patch) => { if (id) J.judge?.log.update(id, patch); };
/* pytanie bez odpowiedzi (minął czas) to nie odmowa — użytkownik ma wiedzieć, czemu nic się nie stało */
const NO_ANSWER = 'Nie dostałem odpowiedzi, więc nic nie zrobiłem. Powtórz polecenie, gdy będziesz gotów.';
const cancelled = () => J.ask?.timedOut ? NO_ANSWER : 'Anulowano.';
/* decyzja polityki w Process Logu (Jev podaje intencję i pewność, a to tutaj zapada „wykonuję / pytam / oddaję Hermesowi”) */
const DECISION = { exec: 'wykonuję lokalnie', hermes: 'oddaję Hermesowi', ask_intent: 'dopytuję', ask_alternatives: 'dopytuję', fill_enum: 'uzupełniam szczegóły', ask_slots: 'dopytuję o szczegóły' };
const WHY = { R4: 'pewność poniżej progu', R15: 'brakuje szczegółów', R16: 'intencja niepewna', R3: 'intencja niejasna', R0: 'brak takiego polecenia' };
const decisionStep = (intent, conf, route) => { if (!J.proc?.active) return; const why = WHY[route.reason]; J.proc.step('judge', 'Jev: decyzja', [['Polecenie', intent], ['Pewność', Math.round(conf * 100) + '%'], ['Reguła', route.reason]], { preview: DECISION[route.action] + (why ? ' — ' + why : '') }); };

const flow = J.flow = {
  optionsFor, missingRequired, classify, fillDeixis, parseFree, CONJ, NO_ANSWER,
  /* Hermes skonfigurowany i nie zgłoszony jako niedostępny — wtedy niepewne polecenia idą do niego zamiast pytań */
  hermesUp: () => !!(J.aiReady?.() && J.hermes && J.hermes.status !== 'down'),

  /* czy parser jest na tyle pewny, by pominąć Jeva (tylko A3: odczyty i nawigacja; zapisy zawsze przez Jeva) */
  parserSure(text, top) {
    if (!top || !top.cmd) return false;
    if (P.level(top.cmd, top.args) !== 'A3' || top.score < 100) return false;
    if (!top.cmd.spansConj && (CONJ.test(' ' + norm(text) + ' ') || /,/.test(text))) return false;   // lista rzeczy po przecinku = kilka poleceń (chyba że polecenie samo obejmuje całe zdanie, np. „otwórz youtube i puść X”)
    if (top.cmd.sure && !top.cmd.sure(top.args)) return false;   // polecenie samo wie, kiedy argumenty wyglądają na pewne
    return missingRequired(top.cmd, top.args).length === 0;
  },

  /* o: { source: 'typed'|'voice'|'signal'|'routine', signal, run, prevText, prevAt } */
  async fast(text, o) {
    if (o.source === 'signal' || o.source === 'routine') return { handled: false };
    const top = R.match(text)[0], t0 = performance.now();
    // 1) parser pewny i polecenie tylko do odczytu/nawigacji → bez Jeva i bez Hermesa
    if (J.judge.enabled() && S().jevFast !== false && !S().jevShadow && flow.parserSure(text, top)) {
      const id = J.judge.log.add({ kind: 'decide', text, intent: top.id, conf: 1, route: 'fast', outcome: 'fast', ms: Math.round(performance.now() - t0), cost: 0, src: o.source });
      const { r } = await execute(top.cmd, top.args, o.source === 'voice' ? 'voice' : 'local', o, null);
      return { handled: true, reply: r.text, fast: true, ok: r.ok, logId: id };
    }
    if (!J.judge.available()) return { handled: false };
    // 2) Jev
    const prev = o.prevText && Date.now() - (o.prevAt || 0) < 300e3 ? o.prevText : null;
    const v = await J.judge.decide(text, { prev });
    if (!v) return { handled: false };
    log(v.logId, { src: o.source, local: top?.id || null });
    if (S().jevShadow) return { handled: false, shadow: true, logId: v.logId, local: top?.id || null, verdictForLog: v };   // tryb cienia: Jev liczy, ale nic nie robi
    const th = P.thresholds(v.intent.id);
    // 3) „anuluj / cofnij” rozpoznane jako akt dialogowy (D16)
    if (v.act && v.act.id === 'cancel' && v.act.confidence >= J.judge.thresholds().act && J.undo.last(60e3)) {
      const u = await J.undo.run(60e3); log(v.logId, { outcome: 'undone' });
      return { handled: true, reply: u.text, logId: v.logId };
    }
    return flow.resolve(v, top, text, o, th);
  },

  async resolve(v, top, text, o, th) {
    let intent = v.intent.id, confirmed = false, carry = {}, hops = 0, verdict = v, asked = false;
    for (;;) {
      if (++hops > MAX_HOPS) return { handled: false, verdict };
      const cmd = R.get(intent);
      const agrees = !!(top && top.id === intent);
      let args = { ...(agrees ? top.args : {}), ...carry };
      if (cmd) args = fillDeixis(cmd, args, v);
      const missing = cmd ? missingRequired(cmd, args) : [];
      const level = cmd ? P.level(cmd, args) : 'A1';
      const ctx = { cmd, level, risk: level === 'A0' ? 'confirm' : 'safe', undoable: !!cmd?.undoable, source: o.source === 'voice' ? 'voice' : 'typed', parserAgrees: agrees, userConfirmed: confirmed, slots: cmd ? classify(cmd, missing) : 'complete', mode: P.mode(), th: P.thresholds(intent), hermes: flow.hermesUp() };
      const vv = intent === v.intent.id ? v : { ...v, intent: { ...v.intent, id: intent, confidence: 1 } };
      const route = P.route(vv, ctx);
      log(v.logId, { route: route.reason });
      decisionStep(intent, vv.intent.confidence, route);

      if (route.action === 'hermes') { log(v.logId, { outcome: 'hermes' }); return { handled: false, verdict }; }

      if (route.action === 'ask_alternatives' || route.action === 'ask_intent') {
        const alts = (route.alts || []).map(a => R.get(a.id)).filter(Boolean);
        const first = route.action === 'ask_intent' ? cmd : null;
        const items = [];
        if (first) items.push({ label: 'Tak', value: 'yes', primary: true });
        alts.forEach(c => items.push({ label: c.label, value: 'alt:' + c.id, primary: !first && items.length === 0 }));
        items.push({ label: route.action === 'ask_intent' ? 'Nie' : 'Coś innego', value: 'no', danger: true });
        const q = route.action === 'ask_intent' ? 'Chodzi o: ' + cmd.label + '?' : 'Nie jestem pewien. Chodzi o: ' + alts.map(c => c.label).join(' czy ') + '?';
        const a = await J.ask(q, items, { timeout: 30000, speak: true });
        asked = true;
        if (a == null) { log(v.logId, { outcome: 'asked_no' }); return { handled: true, reply: J.ask?.timedOut ? NO_ANSWER : 'Dobrze, zostawiam.', logId: v.logId }; }
        if (a === 'yes') { confirmed = true; continue; }
        if (String(a).startsWith('alt:')) { intent = String(a).slice(4); confirmed = true; carry = {}; continue; }
        // „Nie” albo własne słowa: zapamiętaj odrzucenie i oddaj Hermesowi
        P.reject(intent); log(v.logId, { outcome: 'asked_no' });
        return { handled: false, verdict: { ...verdict, rejected: [...(verdict.rejected || []), intent] } };
      }

      if (route.action === 'fill_enum') {
        const en = await fillEnums(cmd, args, missing.filter(k => optionsFor(cmd, k)), text, th, !!route.handoff);
        if (en.handoff) { log(v.logId, { outcome: 'hermes', route: 'R15' }); return { handled: false, verdict }; }   // Jev nie umie wybrać z listy, a pytanie mogłoby nie mieć pasującej opcji (np. „widget z zegarem”)
        if (en.cancel) { log(v.logId, { outcome: 'asked_no' }); return { handled: true, reply: cancelled(), logId: v.logId }; }
        Object.assign(carry, en.values); if (en.asked) asked = true; continue;
      }

      if (route.action === 'ask_slots') {
        const fr = await askFree(cmd, args, missing);
        if (fr.cancel) { log(v.logId, { outcome: 'asked_no' }); return { handled: true, reply: cancelled(), logId: v.logId }; }
        Object.assign(carry, fr.values); asked = true; continue;
      }

      if (route.action === 'exec') {
        /* Jev wybrał jedno polecenie, ale zdanie ma dalsze części, których ono nie obejmuje — to zadanie dla Hermesa, nie pół zadania */
        if (!confirmed && R.uncovered(text, { cmd, args }).length) { log(v.logId, { outcome: 'hermes', route: 'partial' }); return { handled: false, verdict: { ...verdict, intent: { ...verdict.intent, id: 'multi_step' } } }; }
        const { r, args: used } = await execute(cmd, args, route.trust, o, verdict);
        if (!r.ok && !agrees && !confirmed && ['NOT_FOUND', 'INVALID_ARGS', 'AMBIGUOUS', 'UNSUPPORTED'].includes(r.code)) { log(v.logId, { outcome: 'hermes' }); return { handled: false, verdict }; }   // decyzja samego Jeva zawiodła — niech spróbuje Hermes
        log(v.logId, { outcome: r.ok ? (asked || confirmed ? 'asked_yes' : 'executed') : 'error' });
        if (r.ok && r.undoEntry) { r.undoEntry.logId = v.logId; r.undoEntry.intent = intent; r.undoEntry.viaJev = true; if (route.undo) J.undo.offer(r.undoEntry); }
        if (r.ok && r.ui?.highlight && verdict.current >= .7) J.ui?.highlight(r.ui.highlight);
        return { handled: true, reply: r.text, ok: r.ok, logId: v.logId, args: used };
      }
      return { handled: false, verdict };
    }
  }
};
})();
