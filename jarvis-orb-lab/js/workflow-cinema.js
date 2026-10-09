/* =========================================================
   JARVIS OS — Film (J.workflows.cinema): przebieg workflow i „Film dnia” jak sceny z filmu, na cały ekran.
   Bohaterem jest Orb Jarvisa: film otwiera się z Orba na pulpicie (przesłona), kamera wchodzi w niego i wylatuje
   w kosmos, gdzie kroki tworzą konstelację zapalaną wiązkami z Orba; na koniec energia kroków wraca do Orba.
   Lektorem jest Jarvis (w pierwszej osobie, jego głosem), muzyka rozwija motyw dźwięku startu Jarvisa.
   Sceny: plansze aktów, montaż krótkich kroków (pasek z podpisem), uderzenie przy ukończeniu, hologram z wynikiem
   (przewijany jak prompter) i z pisaniem Hermesa na żywo, „Korekta kursu”, „Awaria”, finał, napisy, „Koniec”
   z dalszymi działaniami (README projektu, nowy projekt). Sterowanie jak w odtwarzaczu: pauza,
   rozdziały, przewijanie. Jakość obrazu dopasowuje się do płynności. Ruch wg J.fx: 0 = cięcia, bez lotów.
   ========================================================= */
'use strict';
(() => {
const WF = J.workflows;
if (!WF?.ui) return;
const { renderArt, KIND_IC, KIND_PL, fxRank, ACTIVE, fmtS, blank, api, clock, typeText } = WF.ui;
const R = J.registry, { ok, fail } = R, h = J.h, norm = J.norm, clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- czyste pomocnicze (testy: WF.cinema._t) ---------- */
const GAP = 520, MEAN_Z = 1400, ORB = { x: 0, y: -60, z: MEAN_Z + 2200 }, ORB_R = 300;
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
const ORD = ['pierwszy', 'drugi', 'trzeci', 'czwarty', 'piąty', 'szósty', 'siódmy', 'ósmy', 'dziewiąty', 'dziesiąty', 'jedenasty', 'dwunasty'];
const roman = n => ROMAN[n - 1] || String(n);
/* kod czasowy jak na planie: GG:MM:SS:KK (24 klatki na sekundę) */
const timecode = s => { s = Math.max(0, s || 0); const t = Math.floor(s); return [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60, Math.floor((s - t) * 24)].map(x => String(x).padStart(2, '0')).join(':'); };
/* konstelacja kroków w świecie 3D: kręta ścieżka w głąb, przed Orbem */
const slot = (i, n, centered = true) => ({ x: (centered ? i - (n - 1) / 2 : i) * GAP, y: Math.sin(i * 1.15 + .4) * 190, z: MEAN_Z + Math.cos(i * .85) * 320 });
const layout = n => Array.from({ length: n }, (_, i) => slot(i, n));
const layoutDyn = n => Array.from({ length: n }, (_, i) => slot(i, n, false));   // kroki przybywają w trakcie: pozycje liczone od zera, żeby istniejące nie „skakały”
const KIC = { ...KIND_IC, workflow: 'flow', telegram: 'chat', cron: 'timer', cli: 'terminal', task: 'bolt', notes: 'notes', server: 'bolt', answer: 'chat' };
const KPL = { ...KIND_PL, workflow: 'workflow', telegram: 'zadanie z Telegrama', cron: 'zadanie z harmonogramu', cli: 'zadanie z konsoli', task: 'zadanie na pulpicie', notes: 'notatki', server: 'narzędzie Hermesa', hermes: 'Hermes myśli', answer: 'odpowiedź' };
const PLATFORM = { telegram: 'Telegram', cron: 'Harmonogram', cli: 'Konsola', discord: 'Discord', slack: 'Slack', whatsapp: 'WhatsApp', signal: 'Signal' };
const TOOL_IC = t => /skill/.test(t) ? '📚' : /terminal|shell|exec/.test(t) ? '💻' : /search|web|browser/.test(t) ? '🔍' : /file|read|write/.test(t) ? '📄' : '🛠';
/* długości scen (ms przy prędkości 1) — reżyser czeka tyle, a test sprawdza długość filmu */
const D = { orb: 1100, dive: 1500, intro1: 2500, intro2: 3900, reveal: 1300, act: 2600, ignite: 900, again: 1800, quick: 1200, retry: 2600, impact: 700, holo: 4400, dayHolo: 2600,
  plain: 1700, quickDone: 900, skip: 1200, fail: 2800, ask: 2400, answered: 1400, resumed: 1600, pull: 3000, big: 4600 };
/* skrócony czas „myślenia” w filmie: minuta pracy Hermesa ≈ 2,7 s ekranu */
const holdMs = gapS => clamp((gapS || 0) * 45, 1300, 3400);
const hasArt = s => !!(s?.artifact && s.kind !== 'tool');
/* krótkie sceny (montaż bez planszy aktu): polecenia pulpitu i sprawdzenia; w zapisie także kroki < 4 s (poza zapisem plików);
   w filmie dnia wszystko poza workflow */
const isQuick = (s, ms, day) => day === 'task' ? s.kind === 'tool' || s.kind === 'server' || s.kind === 'check'   // zadanie z Process Logu: narzędzia to montaż, odpowiedź to scena z hologramem
  : day ? s.kind !== 'workflow' : s.kind === 'tool' || s.kind === 'check' || (ms != null && ms < 4000 && s.kind !== 'write_files');
const quickMap = (evs, day) => {
  const kinds = {}, m = {};
  (evs.find(e => e.type === 'run.started')?.steps || []).forEach(s => { kinds[s.id] = s.kind; });
  evs.forEach(e => { if (e.type === 'step.completed' || e.type === 'step.skipped') m[e.step_id] = isQuick({ kind: kinds[e.step_id] || e.kind }, e.ms, day); });
  Object.keys(kinds).forEach(id => { if (!(id in m)) m[id] = isQuick({ kind: kinds[id] }, null, day); });
  return m;
};
const pace = (e, s, o = {}) => {
  switch (e.type) {
    case 'run.started': return D.orb + D.dive + D.intro1 + D.intro2 + D.reveal;
    case 'run.resumed': return D.resumed;
    case 'step.started': return (e.attempt || 1) > 1 ? D.again : o.quick ? D.quick : D.act + D.ignite;
    case 'step.retry': return D.retry;
    case 'step.completed': return D.impact + (hasArt(s) || hasArt(e) ? (o.day ? D.dayHolo : D.holo) : o.quick ? D.quickDone : D.plain);
    case 'step.skipped': return D.skip;
    case 'step.failed': return D.fail;
    case 'ask.waiting': return D.ask;
    case 'ask.answered': return D.answered;
    case 'run.completed': case 'run.failed': case 'run.stopped': return D.pull + D.big;
  }
  return 0;
};
const thinkMs = (gapS, quick) => quick ? 400 : holdMs(gapS);
/* przybliżona długość filmu z zapisu (s), bez napisów końcowych */
const filmLength = (evs, o = {}) => {
  let ms = 0; const started = {}, quick = quickMap(evs, o.day);
  evs.forEach(e => {
    if (e.type === 'step.started') started[e.step_id] = e.ts;
    if (/^step\.(completed|failed|retry)$/.test(e.type)) ms += thinkMs(e.ts - (started[e.step_id] ?? e.ts), quick[e.step_id]);
    ms += pace(e, e, { quick: quick[e.step_id], day: o.day });
  });
  return ms / 1000;
};
/* rozdziały filmu: otwarcie, pierwsza scena każdego kroku, finał */
const chapterList = (evs, steps, day) => {
  const out = [{ i: 0, label: '▶', title: 'Otwarcie' }], seen = new Set();
  evs.forEach((e, i) => {
    if (e.type === 'step.started' && !seen.has(e.step_id)) { seen.add(e.step_id); const k = steps.findIndex(s => s.id === e.step_id); if (k >= 0) out.push({ i, label: day ? String(k + 1) : roman(k + 1), title: steps[k].title }); }
    if (/^run\.(completed|failed|stopped)$/.test(e.type)) out.push({ i, label: 'F', title: 'Finał' });
  });
  return out;
};
const ideaOf = r => { const i = r?.inputs || {}; return String(i.pomysl || Object.values(i)[0] || '').trim(); };
const projectName = r => { for (const s of r?.steps || []) { const f = s.kind !== 'tool' && s.artifact?.fields; if (f && f.nazwa) return String(f.nazwa); } return ''; };
const firstSentence = t => { t = String(t || '').replace(/\s+/g, ' ').trim(); const m = /^(.{20,200}?[.!?])(\s|$)/.exec(t); return m ? m[1] : t.slice(0, 200); };
/* ścieżki Windows w napisach: od JarvisWorkspace, ze strzałkami — krótko i czytelnie */
const prettyPath = t => String(t || '').replace(/[A-Za-z]:\\(?:[^\\\s"„”()]+\\)*?(JarvisWorkspace(?:\\[^\\\s,"„”()]+)*)/g, (m, p) => p.split('\\').join(' › '));
/* tekst JSON-a z odpowiedzi czytelnie: \n jako nowa linia, \" jako cudzysłów */
const unesc = t => String(t || '').replace(/\\n/g, '\n').replace(/\\t/g, '  ').replace(/\\"/g, '"');
const untimed = t => String(t || '').replace(/^\d{1,2}:\d{2} · /, '');
const hhmm = ts => new Date(ts * 1000).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

/* zdarzenia odtworzone ze stanu przebiegu — gdy zapis zdarzeń zniknął (rotacja), most jest niedostępny albo to Film dnia */
const synth = src => {
  let ts = src.started || Date.now() / 1000;
  const base = { v: 1, run_id: src.id, workflow: src.workflow, name: src.name, total: (src.steps || []).length };
  const out = [{ ...base, type: 'run.started', ts, state: 'running', autonomy: src.autonomy, steps: (src.steps || []).map(s => ({ id: s.id, title: s.title, kind: s.kind })) }];
  (src.steps || []).forEach((s, i) => {
    if (!s.state || s.state === 'pending') return;
    const one = { ...base, step_id: s.id, n: i + 1, kind: s.kind, title: s.title }, att = Math.max(1, s.attempts || 1), per = (s.ms || 20000) / 1000 / att;
    for (let a = 1; a <= att; a++) {
      out.push({ ...one, type: 'step.started', ts, attempt: a });
      ts += per;
      if (a < att) out.push({ ...one, type: 'step.retry', ts, attempt: a, reason: (s.errors || [])[a - 1] || 'sprawdzenie nie przeszło' });
    }
    const end = s.state === 'done' ? 'step.completed' : s.state === 'skipped' ? 'step.skipped' : s.state === 'running' ? null : 'step.failed';
    if (end) out.push({ ...one, type: end, ts, ms: s.ms, score: s.score, preview: s.preview || '', artifact: s.artifact || null, ...(end === 'step.failed' ? { reason: (s.errors || []).slice(-1)[0] || '', soft: !!src.scen } : {}) });
  });
  if (src.state && !ACTIVE(src.state)) out.push({ ...base, type: src.state === 'done' ? 'run.completed' : src.state === 'failed' ? 'run.failed' : 'run.stopped', ts: src.ended || ts, state: src.state, report: src.report, reason: src.reason, budget_used: src.budget_used });
  return out;
};

/* ---------- Film dnia: sceny z przebiegów workflow, dziennika zadań Hermesa (Telegram, cron), Process Logu i notatek ---------- */
const dayScenes = ({ runs = [], tasks = [], history = [], notes = [] }, since, until) => {
  const inDay = ts => ts >= since && ts < until, items = [], seen = new Set();
  runs.filter(r => inDay(r.started || 0)).forEach(r => {
    const fw = r.steps.map(s => s.artifact).find(a => a?.kind === 'files_written'), name = projectName(r), doneN = r.steps.filter(s => s.state === 'done').length;
    items.push({ ts: r.started, kind: 'workflow', title: r.name + (name ? ': ' + name : ''), state: r.state === 'done' ? 'done' : ACTIVE(r.state) || r.state === 'stopped' ? 'skipped' : 'failed',
      ms: r.steps.reduce((a, s) => a + (s.ms || 0), 0) || null, artifact: fw || { kind: 'fields', fields: { title: name || r.name, Kroki: doneN + ' z ' + r.steps.length } } });
  });
  const groups = new Map();   // to samo zadanie wiele razy (np. z harmonogramu) = jedna scena „×N”
  /* „[System note: …]” to wewnętrzna wiadomość Hermesa (np. po restarcie gatewaya), nie zadanie użytkownika */
  tasks.filter(t => inDay(t.started || 0) && !/^\s*\[system note/i.test(t.title || '')).forEach(t => { const k = (t.platform || '') + '|' + norm(t.title || ''); (groups.get(k) || groups.set(k, []).get(k)).push(t); });
  groups.forEach(list => {
    const t = list[list.length - 1], n = list.length, fails = list.filter(x => x.status === 'failed').length;
    seen.add(norm(t.title || ''));
    const where = PLATFORM[t.platform] || 'Hermes';
    items.push({ ts: list[0].started, kind: t.platform === 'cron' ? 'cron' : t.platform === 'cli' ? 'cli' : 'telegram', title: (t.title || 'Zadanie') + (n > 1 ? ' (×' + n + ')' : ''),
      state: fails ? 'failed' : t.status === 'done' ? 'done' : 'skipped', ms: list.reduce((a, x) => a + (x.ended ? Math.round((x.ended - x.started) * 1000) : 0), 0) || null,
      artifact: { kind: 'fields', fields: { title: t.title || 'Zadanie', Skąd: where, Wynik: String(t.result || (t.status === 'running' ? 'w toku albo przerwane' : '—')).slice(0, 220),
        ...(n > 1 ? { Razy: n + (fails ? ' (' + fails + ' z błędem)' : '') } : {}), ...(t.tools ? { Narzędzia: String(t.tools) } : {}) } } });
  });
  const small = [];
  history.filter(x => inDay((x.ts || 0) / 1000)).forEach(x => {
    const title = String(x.title || 'Zadanie');
    if (/^Workflow:/i.test(title)) return;   // przebiegi workflow mają własne sceny
    const m = /^(Telegram|Cron|Harmonogram|Hermes|Konsola|Discord|Slack|WhatsApp|Signal)[^:]*:\s*(.+)$/i.exec(title);
    if (m && (tasks.length || seen.has(norm(m[2])))) return;   // to samo zadanie jest już w dzienniku mostu
    const it = { ts: x.ts / 1000, kind: m ? 'telegram' : 'task', title: m ? m[2] : title, state: x.status === 'err' ? 'failed' : x.status === 'abort' ? 'skipped' : 'done', ms: x.dur ?? null,
      artifact: { kind: 'fields', fields: { title: m ? m[2] : title, Skąd: m ? m[1] : 'Pulpit', Wynik: String(x.result || '').slice(0, 220) || '—' } } };
    (!m && (x.dur || 0) < 4000 ? small : items).push(it);
  });
  if (small.length > 2) items.push({ ts: small[0].ts, kind: 'task', title: 'Drobne polecenia (' + small.length + ')', state: 'done', ms: small.reduce((a, x) => a + (x.ms || 0), 0),
    artifact: { kind: 'fields', fields: { title: 'Drobne polecenia', Polecenia: small.map(x => x.title.slice(0, 40)).slice(0, 12) } } });
  else items.push(...small);
  const ns = notes.filter(x => !x.deleted && inDay((x.created || x.ts || 0) / 1000));
  if (ns.length) items.push({ ts: Math.min(...ns.map(x => (x.created || x.ts) / 1000)), kind: 'notes', title: ns.length === 1 ? 'Notatka: ' + ns[0].title : 'Notatki (' + ns.length + ')', state: 'done', ms: null,
    artifact: { kind: 'fields', fields: { title: ns.length === 1 ? ns[0].title : 'Notatki z dnia', Tytuły: ns.map(x => String(x.title || '').slice(0, 40)).slice(0, 12) } } });
  items.sort((a, b) => a.ts - b.ts);
  return (items.length > 16 ? items.slice(-16) : items).map((x, k) => ({ id: 'd' + k, title: hhmm(x.ts) + ' · ' + String(x.title).slice(0, 70), kind: x.kind, state: x.state, attempts: 1, ms: x.ms, ts: x.ts, artifact: x.artifact, errors: [] }));
};
const dayStats = steps => {
  const c = k => steps.filter(s => s.kind === k).length, fails = steps.filter(s => s.state === 'failed').length;
  const parts = [steps.length + ' ' + J.pl(steps.length, 'scena', 'sceny', 'scen')];
  if (c('workflow')) parts.push(c('workflow') + ' workflow');
  const tg = c('telegram') + c('cron') + c('cli'); if (tg) parts.push(tg + ' od Hermesa');
  if (fails) parts.push(fails + ' ' + J.pl(fails, 'błąd', 'błędy', 'błędów'));
  return parts.join(' · ');
};
const daySrc = (steps, d0) => {
  const ymd = d0.getFullYear() + '-' + String(d0.getMonth() + 1).padStart(2, '0') + '-' + String(d0.getDate()).padStart(2, '0');
  const label = d0.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
  const first = steps[0]?.ts || d0.getTime() / 1000, last = steps.length ? steps[steps.length - 1].ts : first;
  return { id: 'dzien-' + ymd, workflow: 'dzien', name: 'Dzień z Jarvisem', state: 'done', started: first, ended: last, inputs: {}, steps,
    report: 'Tak minął ' + label + ': ' + dayStats(steps) + '.', day: { date: ymd, label } };
};

/* napisy końcowe */
const credits = (r, o = {}) => {
  const steps = r.steps || [];
  if (o.day) {
    const src = {}; steps.forEach(s => { const k = KPL[s.kind] || s.kind; src[k] = (src[k] || 0) + 1; });
    return [
      { h: 'Jarvis OS przedstawia', big: 'Dzień z Jarvisem' },
      { h: r.day?.label || '', lines: [dayStats(steps)] },
      { h: 'W rolach głównych', lines: ['Jarvis — pulpit, głos i reżyseria', 'Hermes — myślenie i zadania z Telegrama', 'Ty — pomysły i decyzje'] },
      { h: 'Sceny dnia', lines: steps.map(s => s.title + (s.state === 'failed' ? ' — błąd' : s.state === 'skipped' ? ' — w toku / przerwane' : '')) },
      { h: 'Skąd przyszły zadania', lines: Object.entries(src).map(([k, v]) => k + ': ' + v) },
      { h: '', lines: ['Nakręcono w JarvisWorkspace'] }
    ];
  }
  if (o.scen) {   // zadanie z Process Logu (czat, Telegram, harmonogram): krótsze napisy niż dla workflow
    const task = String(ideaOf(r) || r.name), done = steps.filter(s => s.state === 'done').length, bad = steps.filter(s => s.state === 'failed').length;
    const secs = Math.max(0, ((r.ended || 0) - (r.started || 0)));
    return [
      { h: 'Jarvis OS przedstawia', big: r.name },
      { h: 'Polecenie', lines: ['„' + task.slice(0, 140) + '”'] },
      { h: 'Reżyseria i lektor', lines: ['Jarvis'] },
      { h: 'W rolach głównych', lines: ['Hermes — myśli i działa'].concat(steps.some(s => s.kind === 'tool') ? ['Pulpit Jarvis OS — narzędzia'] : [], ['Ty — polecenie']) },
      steps.length && { h: 'Sceny', lines: steps.map((s, i) => String(i + 1).padStart(2, '0') + ' · ' + untimed(s.title) + (s.state === 'failed' ? ' — nie wyszło' : s.ms != null && s.state === 'done' ? ' — ' + fmtS(s.ms) : '')) },
      { h: 'Statystyki', lines: ['Kroki: ' + done + ' z ' + steps.length + (bad ? ' · nieudane: ' + bad : ''), secs ? 'Czas pracy: ' + clock(secs) : ''].filter(Boolean) },
      { h: '', lines: ['Nakręcono' + (o.live ? ' na żywo' : '') + ' w JarvisWorkspace'] }
    ].filter(Boolean);
  }
  const fw = steps.map(s => s.artifact).find(a => a?.kind === 'files_written') || {};
  const secs = steps.reduce((a, s) => a + (s.ms || 0), 0) / 1000, retries = steps.reduce((a, s) => a + Math.max(0, (s.attempts || 1) - 1), 0), tok = r.budget_used?.tokens;
  const when = r.started ? new Date(r.started * 1000).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const scene = (s, i) => String(i + 1).padStart(2, '0') + ' · ' + s.title + ' — ' + (s.state === 'done' ? [s.ms != null ? fmtS(s.ms) : 'gotowe', s.score != null ? 'ocena ' + s.score : '', s.attempts > 1 ? s.attempts + ' ' + J.pl(s.attempts, 'próba', 'próby', 'prób') : ''].filter(Boolean).join(' · ')
    : s.state === 'skipped' ? 'pominięta' : s.state === 'pending' ? 'nienakręcona' : s.state === 'running' ? 'w trakcie' : 'przerwana');
  const files = fw.files || [];
  return [
    { h: 'Jarvis OS przedstawia', big: projectName(r) || r.name },
    ideaOf(r) && { h: 'Na podstawie pomysłu', lines: ['„' + ideaOf(r) + '”'] },
    { h: 'Reżyseria i lektor', lines: ['Jarvis'] },
    { h: 'Scenariusz', lines: ['workflow „' + r.name + '”'] },
    { h: 'W rolach głównych', lines: ['Hermes — myśli, projektuje i pisze'].concat(steps.some(s => s.kind === 'check') ? ['Jev — kontrola jakości'] : [], steps.some(s => s.kind === 'tool') ? ['Pulpit Jarvis OS — pokaz'] : [], ['Ty — pomysł' + (steps.some(s => s.kind === 'ask') ? ' i decyzje' : '')]) },
    { h: 'Sceny', lines: steps.map(scene) },
    files.length && { h: 'Zapisane pliki', mono: true, lines: files.slice(0, 40).concat(files.length > 40 ? ['… i ' + (files.length - 40) + ' więcej'] : []) },
    fw.root && { h: 'Plan zdjęciowy', mono: true, lines: [prettyPath(fw.root) + (fw.commit ? ' · git ' + fw.commit : '')] },
    { h: 'Statystyki', lines: ['Czas pracy: ' + clock(secs), 'Ponowienia: ' + retries].concat(tok ? ['Tokeny: ' + Math.round(tok / 1000) + ' tys.'] : []) },
    { h: '', lines: ['Nakręcono' + (o.live ? ' na żywo' : '') + (when ? ' ' + when : '') + ' w JarvisWorkspace'] }
  ].filter(Boolean);
};

/* lektor: Jarvis mówi o swojej pracy w pierwszej osobie */
const START = { hermes: 'Zlecam Hermesowi: {t}.', check: 'Sprawdzam: {t}.', write_files: 'Zapisuję projekt na dysk.', tool: 'Przygotowuję pulpit: {t}.', ask: 'Potrzebuję Twojej decyzji.',
  workflow: 'Workflow: {t}.', telegram: 'Telegram: {t}.', cron: 'Z harmonogramu: {t}.', cli: 'Z konsoli: {t}.', task: 'Na pulpicie: {t}.', notes: '{t}.', server: 'Hermes sięga po: {t}.', answer: 'Hermes odpowiada.' };
const THINK = { server: ['Narzędzie pracuje…'], answer: ['Hermes układa odpowiedź…'], hermes: ['Hermes analizuje…', 'Hermes układa myśli w strukturę…', 'Hermes waży kompromisy…', 'Pilnuję czasu i budżetu…', 'Jeszcze chwila — dobra robota wymaga czasu.'],
  check: ['Sprawdzam każdy punkt…', 'Porównuję z wymaganiami…'], write_files: ['Zapisuję pliki na dysk…'], tool: ['Pulpit wykonuje polecenie…'], ask: ['Czekam na Twoją decyzję…'] };
const startLine = s => (START[s.kind] || 'Scena: {t}.').replace('{t}', untimed(s.title));
const thinkLine = (s, k = 0) => { const a = THINK[s.kind] || THINK.hermes; return a[k % a.length]; };
const doneWhat = s => {
  const a = s.artifact || {}, nh = (a.headings || []).length, np = (a.paths || []).length, nf = a.count || 0, name = a.fields?.nazwa || a.fields?.title;
  return s.kind === 'answer' ? 'Odpowiedź gotowa.' : a.kind === 'fields' && name ? (s.kind === 'hermes' ? 'Powstał brief: „' + name + '”.' : s.kind === 'tool' ? 'Na pulpicie: „' + name + '”.' : '')
    : a.kind === 'doc' ? 'Dokument: ' + nh + ' ' + J.pl(nh, 'sekcja', 'sekcje', 'sekcji') + ', ' + (a.chars || 0) + ' znaków.'
    : a.kind === 'tree' ? np + ' ' + J.pl(np, 'plik', 'pliki', 'plików') + ' ' + (a.filled ? 'z gotową treścią.' : 'w planie struktury.')
    : a.kind === 'files_written' ? nf + ' ' + J.pl(nf, 'plik zapisany', 'pliki zapisane', 'plików zapisanych') + ' na dysku.' : '';
};
const doneLine = s => {
  const tail = [s.ms != null ? fmtS(s.ms) : '', s.score != null ? 'ocena ' + s.score : ''].filter(Boolean).join(', ');
  return 'Mam to: ' + untimed(s.title) + (tail ? ' (' + tail + ')' : '') + '. ' + doneWhat(s);
};
const doneSay = s => doneWhat(s) || 'Gotowe: ' + untimed(s.title) + '.';
const stateLine = (s, day) => s.state === 'running' ? (KPL[s.kind] || s.kind) + (s.attempts > 1 ? ' · próba ' + s.attempts : '') + '…'
  : s.state === 'done' ? [s.ms != null ? fmtS(s.ms) : '', s.score != null ? 'ocena ' + s.score : ''].filter(Boolean).join(' · ') || 'gotowe'
  : ({ pending: 'czeka', skipped: day ? 'w toku / przerwane' : 'pominięte', failed: 'nie powiodło się', denied: 'odmowa' }[s.state] || s.state);

/* ---------- ścieżka dźwiękowa (Web Audio, ten sam kontekst co J.sfx): buczenie, echo, motyw startu Jarvisa ---------- */
const Soundtrack = () => {
  let ctx = null, out = null, comp = null, echo = null, drone = null, noise = null, curve = null, on = false, wantDrone = false, duckK = 1, pauseK = 1;
  const vol = () => clamp((J.state?.settings?.volume ?? 60) / 60, 0, 1.67) * .5 * duckK * pauseK;
  const level = () => { if (out && ctx) out.gain.setTargetAtTime(on ? vol() : 0, ctx.currentTime, .12); };
  const init = () => {
    if (ctx) return ctx;
    try { ctx = J.sfx?.unlock?.() || null; } catch (e) { ctx = null; }
    if (!ctx) return null;
    out = ctx.createGain(); out.gain.value = on ? vol() : 0;
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
    out.connect(comp); comp.connect(ctx.destination);
    /* echo (przestrzeń): opóźnienie z filtrowanym sprzężeniem */
    echo = ctx.createGain(); echo.gain.value = .35;
    const dl = ctx.createDelay(1), fb = ctx.createGain(), lp = ctx.createBiquadFilter();
    dl.delayTime.value = .32; fb.gain.value = .38; lp.type = 'lowpass'; lp.frequency.value = 2600;
    echo.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(out);
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noise = buf; curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) curve[i] = Math.tanh((i / 512 - 1) * 2.6);
    return ctx;
  };
  const env = (g, t, a, peak, hold, rel) => { g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.setValueAtTime(peak, t + a + hold); g.gain.exponentialRampToValueAtTime(.0001, t + a + hold + rel); };
  const bus = (wet = false) => { const g = ctx.createGain(); g.gain.value = .0001; g.connect(out); if (wet) g.connect(echo); return g; };
  const osc = (type, f, t, dur, dest) => { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.connect(dest); o.start(t); o.stop(t + dur + .1); return o; };
  const hiss = (t, dur, dest) => { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; s.connect(dest); s.start(t); s.stop(t + dur + .1); return s; };
  const filt = (type, f, q, dest) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; b.connect(dest); return b; };
  const play = fn => { if (!on || !init()) return; try { fn(ctx.currentTime + .02); } catch (e) { /* dźwięk jest dodatkiem */ } };
  const A = {
    get on() { return on; },
    set(v) { on = !!v; if (on) init(); level(); if (on && wantDrone && !drone) A.drone(); },
    duck(v) { duckK = v ? .45 : 1; level(); },     // lektor mówi — muzyka cichnie
    pause(v) { pauseK = v ? .3 : 1; level(); },
    drone() {
      wantDrone = true;
      play(t => {
        if (drone) return;
        const g = bus(), lp = filt('lowpass', 260, 5, g), lfo = ctx.createOscillator(), lg = ctx.createGain();
        lfo.frequency.value = .07; lg.gain.value = 140; lfo.connect(lg).connect(lp.frequency); lfo.start(t);
        const os = [['sawtooth', 55], ['sawtooth', 55.4], ['sine', 41.2], ['triangle', 110.3]].map(([ty, f]) => { const o = ctx.createOscillator(); o.type = ty; o.frequency.value = f; o.connect(lp); o.start(t); return o; });
        g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.15, t + 3.5);
        drone = { g, os: os.concat(lfo) };
      });
    },
    fadeDrone(sec = 1.2) {
      wantDrone = false; if (!drone || !ctx) return;
      const t = ctx.currentTime, d = drone; drone = null;
      d.g.gain.cancelScheduledValues(t); d.g.gain.setValueAtTime(Math.max(.0001, d.g.gain.value), t); d.g.gain.exponentialRampToValueAtTime(.0001, t + sec);
      d.os.forEach(o => { try { o.stop(t + sec + .1); } catch (e) { /* już zatrzymany */ } });
    },
    /* motyw Jarvisa — ten sam co dźwięk startu pulpitu (J.sfx.boot): bas wznoszący się o oktawę i arpeggio C–E–G–C, z echem */
    motif(slow = 1, up = 1) {
      play(t => {
        const g = bus(), o = osc('sine', 55 * up, t, 2 * slow, g); o.frequency.exponentialRampToValueAtTime(110 * up, t + 1.6 * slow); env(g, t, .25, .45, .6 * slow, 1.1 * slow);
        const g2 = bus(true), o2 = osc('triangle', 110 * up, t + .1, 1.8 * slow, g2); o2.frequency.exponentialRampToValueAtTime(220 * up, t + 1.5 * slow); env(g2, t + .1, .3, .1, .5 * slow, 1 * slow);
        [523.25, 659.25, 783.99, 1046.5].forEach((f, k) => { const gg = bus(true), tt = t + (.5 + k * .13) * slow; osc('sine', f * up, tt, 1.5, gg); env(gg, tt, .01, .085, .12, 1.2); });
      });
    },
    whoosh(dur = .9) { play(t => { const g = bus(), bp = filt('bandpass', 300, 1.4, g); bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(2800, t + dur * .55); bp.frequency.exponentialRampToValueAtTime(420, t + dur); hiss(t, dur, bp); env(g, t, dur * .5, .5, 0, dur * .5); }); },
    riser(dur = 2.4) {
      play(t => {
        const g = bus(), bp = filt('bandpass', 180, 2, g); bp.frequency.setValueAtTime(180, t); bp.frequency.exponentialRampToValueAtTime(5200, t + dur); hiss(t, dur, bp);
        g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.3, t + dur * .95); g.gain.exponentialRampToValueAtTime(.0001, t + dur + .08);
        const g2 = bus(), o = osc('sawtooth', 110, t, dur, g2); o.frequency.exponentialRampToValueAtTime(880, t + dur);
        g2.gain.setValueAtTime(.0001, t); g2.gain.exponentialRampToValueAtTime(.045, t + dur * .95); g2.gain.exponentialRampToValueAtTime(.0001, t + dur + .08);
      });
    },
    impact() {
      play(t => {
        const g = bus(), o = osc('sine', 95, t, .9, g); o.frequency.exponentialRampToValueAtTime(30, t + .7); env(g, t, .005, .9, .05, .8);
        const g2 = bus(); hiss(t, .5, filt('lowpass', 1100, 0, g2)); env(g2, t, .003, .4, .02, .4);
        const g3 = bus(true); osc('triangle', 2093, t, 1.2, g3); osc('sine', 3136, t, 1.2, g3); env(g3, t, .004, .045, 0, 1.1);
      });
    },
    hit() { play(t => { const g = bus(), o = osc('sine', 72, t, .5, g); o.frequency.exponentialRampToValueAtTime(40, t + .4); env(g, t, .005, .45, 0, .45); }); },
    /* „BRAAAM” — dęciaki jak w zwiastunach */
    braam() {
      play(t => {
        const g = bus(), lp = filt('lowpass', 160, 3, g), ws = ctx.createWaveShaper(); ws.curve = curve; ws.connect(lp);
        lp.frequency.setValueAtTime(160, t); lp.frequency.exponentialRampToValueAtTime(1400, t + .35); lp.frequency.exponentialRampToValueAtTime(260, t + 3);
        [55, 55.6, 82.4, 110].forEach(f => osc('sawtooth', f, t, 3.4, ws));
        env(g, t, .06, .45, .4, 2.8);
      });
    },
    chord(dur = 7) {
      play(t => {
        const g = bus(true), lp = filt('lowpass', 500, 0, g); lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(4200, t + 2.2);
        [130.81, 196, 261.63, 329.63, 392, 493.88, 587.33].forEach((f, k) => { osc('triangle', f, t + k * .05, dur, lp); osc('sine', f * 2.003, t + k * .05, dur, lp); });
        g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.11, t + 1.4); g.gain.setValueAtTime(.11, t + dur - 3.5); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      });
    },
    glitch() {
      play(t => {
        const g = ctx.createGain(); g.gain.value = .07; g.connect(out);
        for (let k = 0; k < 12; k++) { const s = t + Math.random() * .55, o = ctx.createOscillator(), gg = ctx.createGain(); o.type = 'square'; o.frequency.value = 180 + Math.random() * 1800; gg.gain.setValueAtTime(.0001, s); gg.gain.setValueAtTime(1, s + .002); gg.gain.setValueAtTime(.0001, s + .02 + Math.random() * .03); o.connect(gg).connect(g); o.start(s); o.stop(s + .07); }
        const g2 = bus(); hiss(t, .5, filt('highpass', 2500, 0, g2)); env(g2, t, .01, .18, .25, .2);
      });
    },
    alarm() { play(t => { const g = bus(), o = osc('sawtooth', 440, t, 2.2, filt('lowpass', 1800, 0, g)); for (let k = 0; k < 6; k++) o.frequency.setValueAtTime(k % 2 ? 330 : 440, t + k * .35); env(g, t, .02, .08, 2, .2); }); },
    ping() { play(t => { const g = bus(true); osc('sine', 1318.5, t, .9, g); osc('sine', 1975.5, t + .12, .8, g); env(g, t, .005, .07, 0, .85); }); },
    holo() { play(t => { const g = bus(), o = osc('sine', 600, t, .5, g); o.frequency.exponentialRampToValueAtTime(1500, t + .3); env(g, t, .01, .045, .05, .35); }); },
    stop() {
      A.fadeDrone(.6);
      if (out && ctx) { out.gain.setTargetAtTime(0, ctx.currentTime, .15); const o = out, c = comp, e = echo; setTimeout(() => { try { o.disconnect(); c.disconnect(); e.disconnect(); } catch (er) { /* już odłączone */ } }, 1500); }
      out = null; ctx = null; on = false; wantDrone = false;   // spóźnione efekty (timery finału) już nie zagrają
    }
  };
  return A;
};

/* ziarno taśmy: szum generowany raz na stronę */
let grainURL = '';
const grain = () => {
  if (grainURL) return grainURL;
  try {
    const c = document.createElement('canvas'); c.width = c.height = 160;
    const x = c.getContext('2d'), im = x.createImageData(160, 160);
    for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255 | 0; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
    x.putImageData(im, 0, 0); grainURL = c.toDataURL('image/png');
  } catch (e) { /* bez ziarna */ }
  return grainURL;
};

/* ---------- projekcja ---------- */
let cur = null;
const SEEK = Symbol('seek');
const mount = (src, evs, o = {}) => {
  const film = !!evs, live = !film, day = !!o.day, runId = src.id;
  const scen = !!o.scen, dyn = live && !!o.dyn;   // scen: zadanie z Process Logu (nie workflow); dyn: kroki przybywają w trakcie
  /* źródło przebiegu na żywo: domyślnie workflow z mostu (karta + zdarzenia „workflows”); inne scenariusze podają własne (o.feed → tu: link) */
  const link = o.feed || { get: () => WF.runs.get(runId), on: fn => J.on('workflows', p => { if (p?.id === runId && p.e) fn(p.e); }), eta: sh => WF.eta(sh), resync: true };
  const rank = fxRank(), still = rank < 1;
  let rq = rank;   // jakość bieżąca — spada sama przy słabej płynności
  const css = getComputedStyle(document.querySelector('#app') || document.documentElement), col = (v, d) => css.getPropertyValue(v).trim() || d;
  const ACC = col('--accent-rgb', '51,214,255'), ACC2 = col('--accent2-rgb', '162,92,255'), OK = col('--ok-rgb', '62,240,163'), WARN = col('--warn-rgb', '255,184,77'), ERR = col('--err-rgb', '255,93,122'), WHITE = '255,255,255';
  const start = film ? evs.find(e => e.type === 'run.started') : null;
  const meta = { id: 'kino:' + runId, name: src.name || start?.name || '', workflow: src.workflow || start?.workflow, inputs: src.inputs || {}, budget: src.budget, started: src.started || start?.ts, day: src.day || null };
  const mkRun = () => Object.assign(film ? Object.assign(blank(start), { autonomy: start.autonomy })
    : Object.assign(blank({ run_id: src.id, workflow: src.workflow, name: src.name, ts: src.started, steps: src.steps }), { state: src.state, autonomy: src.autonomy, pending: src.pending, budget_used: src.budget_used, steps: (src.steps || []).map(s => ({ errors: [], ...s })) }), meta);
  const run = mkRun();
  let n = run.steps.length;
  const P = dyn ? layoutDyn(n) : layout(n), PP = new Array(n);
  const quick = film ? quickMap(evs, day || (scen ? 'task' : false)) : {}, quickOf = s => film ? !!quick[s.id] : s.kind === 'tool' || s.kind === 'check' || (scen && s.kind === 'server');
  const lab = i => day ? (run.steps[i].title.match(/^\d{1,2}:\d{2}/)?.[0] || '') : scen ? 'Krok ' + (i + 1) : 'Akt ' + roman(i + 1);   // podpis sceny: godzina / „Krok N” / „Akt N”
  const chapters = film ? chapterList(evs, run.steps, day) : [];
  let alive = true, spoke = false, speaking = false, paused = false;
  const audio = Soundtrack();

  /* ---------- DOM ---------- */
  const prevFocus = document.activeElement;
  const el = h('div', { class: 'cin ' + (film ? 'cin-film' : 'cin-live') + (day ? ' cin-day' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': (day ? 'Film dnia' : 'Film: ' + run.name), 'data-r': String(rq), tabindex: '-1' },
    '<div class="cin-stage"><canvas class="cin-cv" aria-hidden="true"></canvas><div class="cin-world" aria-hidden="true"></div>' +
      '<div class="cin-holo" aria-hidden="true"><div class="cin-holo-h"><i></i><span></span><b class="cin-holo-n"></b></div><div class="cin-holo-tool"></div><div class="cin-holo-b"></div></div></div>' +
    '<div class="cin-flash" aria-hidden="true"></div><div class="cin-l3" aria-hidden="true"></div><div class="cin-title" aria-hidden="true"></div><div class="cin-credits" aria-hidden="true"></div>' +
    '<div class="cin-leak" aria-hidden="true"><i></i><i></i></div><div class="cin-grain" aria-hidden="true"></div><div class="cin-vig" aria-hidden="true"></div><div class="cin-pause" aria-hidden="true">‖ Pauza</div>' +
    '<div class="cin-bar top"><span class="cin-rec"><i></i><b></b></span><span class="cin-act"></span><span class="cin-tc">00:00:00:00</span></div>' +
    '<div class="cin-bar bot"><span class="cin-left"><span class="cin-eta"></span><span class="cin-chap" role="group" aria-label="Rozdziały"></span></span><p class="cin-sub" aria-live="polite"></p><span class="cin-ctl"><span class="cin-opts"></span>' +
      '<button class="cin-b" type="button" data-a="pause" title="Pauza (spacja)" aria-label="Pauza">⏸</button><button class="cin-b" type="button" data-a="narr"></button><button class="cin-b" type="button" data-a="snd"></button>' +
      '<button class="cin-b" type="button" data-a="skip" title="Przewiń do finału">⏭</button><button class="cin-b" type="button" data-a="close" title="Zamknij (Esc)" aria-label="Zamknij film">✕</button></span></div>');
  const $ = s => el.querySelector(s);
  const stage = $('.cin-stage'), cv = $('.cin-cv'), g = cv.getContext('2d'), world = $('.cin-world'), holo = $('.cin-holo'), ttl = $('.cin-title'), subEl = $('.cin-sub'),
    tcEl = $('.cin-tc'), actEl = $('.cin-act'), etaEl = $('.cin-eta'), optsEl = $('.cin-opts'), flashEl = $('.cin-flash'), sndB = $('[data-a=snd]'), narrB = $('[data-a=narr]'),
    skipB = $('[data-a=skip]'), pauseB = $('[data-a=pause]'), chapEl = $('.cin-chap'), l3 = $('.cin-l3'), holoBody = $('.cin-holo-b'), holoHead = $('.cin-holo-h span'), holoN = $('.cin-holo-n'), holoTool = $('.cin-holo-tool');
  if (grain()) el.style.setProperty('--grain', 'url(' + grain() + ')');
  $('.cin-rec b').textContent = live ? 'REC · na żywo' : day ? 'Film dnia' : 'Zapis';
  skipB.hidden = live;
  const makeNode = (s, i) => {
    const nEl = h('div', { class: 'cin-node', 'data-s': s.state || 'pending', 'data-k': s.kind },
      '<span class="cin-core"><svg class="cin-ring" viewBox="0 0 144 144"><circle cx="72" cy="72" r="66"/></svg><span class="cin-ic">' + J.icon(KIC[s.kind] || 'star') + '</span><span class="cin-ok">✓</span></span>');
    const l = h('div', { class: 'cin-lbl' }, '<em></em><b></b><small></small>');
    l.querySelector('em').textContent = lab(i); l.querySelector('b').textContent = untimed(s.title);
    world.appendChild(nEl); world.appendChild(l);
    return { n: nEl, l, small: l.querySelector('small'), st: null, blur: -1 };
  };
  const NODES = run.steps.map(makeNode);
  /* przesłona: film wychodzi z Orba na pulpicie i do niego wraca */
  const coreR = document.querySelector('#core')?.getBoundingClientRect?.();
  const iris = coreR && coreR.width > 20 && coreR.top < innerHeight && coreR.bottom > 0 ? { x: coreR.left + coreR.width / 2, y: coreR.top + coreR.height / 2, r: coreR.width / 2 }
    : { x: innerWidth / 2, y: innerHeight / 2, r: Math.min(innerWidth, innerHeight) * .1 };
  if (!still) { el.classList.add('iris'); el.style.clipPath = 'circle(' + iris.r + 'px at ' + iris.x + 'px ' + iris.y + 'px)'; }
  document.body.appendChild(el);
  if (!still) { void el.offsetWidth; el.style.transition = 'clip-path 1.1s cubic-bezier(.7,0,.2,1)'; el.style.clipPath = 'circle(150% at ' + iris.x + 'px ' + iris.y + 'px)'; }
  setTimeout(() => { if (!alive) return; document.body.classList.add('cin-under'); el.style.transition = ''; el.style.clipPath = ''; }, still ? 300 : 1250);   // pulpit pod spodem nie musi się rysować

  /* ---------- kamera ---------- */
  let W = 0, H = 0, F = 1, holoRect = null;
  const resize = () => {
    const dpr = Math.min(rq >= 3 ? 1.5 : 1.25, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); g.setTransform(dpr, 0, 0, dpr, 0, 0); F = H * 1.05; holoRect = null;
  };
  resize();
  const cam = { x: 0, y: 0, z: 0, roll: 0 }, vel = { x: 0, y: 0, z: 0 };
  let prevCam = { ...cam }, shot = null, drift = 0, focusI = -1, tNow = 0, shakeA = 0, hx = 0, hy = 0, cr = 1, sr = 0;
  let dimK = 0, dimT = 0, orbE = .3, orbBoost = 0, orbA = 1;   // orbA: Orb przygasa, gdy kamera pracuje przy krokach
  const lit = run.steps.map(() => still ? 1 : 0), litAt = run.steps.map(() => Infinity);   // konstelacja zapala się wiązkami z Orba
  const easeIO = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2, easeOut = k => 1 - Math.pow(1 - k, 3), easeIn = k => k * k * k;
  const over = () => { const span = (n - 1) * GAP + 760, dz = Math.max(F * span / (.84 * W), F * 900 / (.62 * H)); return { x: dyn ? (n - 1) * GAP / 2 : 0, y: 0, z: MEAN_Z - dz, roll: 0 }; };
  const near = (i, dist = 520, side = 0) => { const p = P[i]; return { x: p.x + side * .17 * W * dist / F, y: p.y + 14, z: p.z - dist, roll: (i % 2 ? 1 : -1) * .03 }; };
  /* kamera, przy której Orb świata leży dokładnie tam, gdzie Orb pulpitu (ten sam rozmiar) */
  const orbCam = () => { const dz = ORB_R * F / Math.max(20, iris.r); return { x: ORB.x - (iris.x - W / 2) * dz / F, y: ORB.y - (iris.y - H / 2) * dz / F, z: ORB.z - dz, roll: 0 }; };
  const fly = (to, ms, ez = easeIO) => { const t = { ...cam, ...to }; if (still || !ms) { Object.assign(cam, t); shot = null; return; } shot = { a: { ...cam }, b: t, t0: tNow, d: Math.max(.05, ms / 1000 / speed()), ez }; };
  const proj = (p, c = cam) => {
    const dz = p.z - c.z; if (dz < 30) return null;
    const k = F / dz, x = (p.x - c.x - hx) * k, y = (p.y - c.y - hy) * k;
    return { x: W / 2 + x * cr - y * sr, y: H / 2 + x * sr + y * cr, k, dz };
  };
  Object.assign(cam, orbCam());

  /* ---------- gwiazdy, mgławice, efekty ---------- */
  const NS = q => q >= 3 ? 700 : q === 2 ? 450 : 260, STAR_C = [WHITE, '200,225,255', '170,200,255', ACC, ACC2];
  const spawnStar = any => ({ x: cam.x + (Math.random() - .5) * 9000, y: cam.y + (Math.random() - .5) * 5600, z: cam.z + (any ? 60 + Math.random() * 6000 : 5600 + Math.random() * 500), b: .35 + Math.random() * .65, tw: Math.random() * 6.28, c: STAR_C[Math.random() < .86 ? Math.random() * 3 | 0 : 3 + (Math.random() * 2 | 0)] });
  const stars = Array.from({ length: NS(rq) }, () => spawnStar(true));
  const NEB = [[.22, .32, ACC2, .15, .55], [.78, .62, ACC, .11, .6], [.55, .18, '60,90,200', .13, .5]];
  let sparks = [], waves = [], flares = [], streams = [], beams = [];
  const sprites = {};
  const sprite = rgb => {
    if (sprites[rgb]) return sprites[rgb];
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.18, 'rgba(' + rgb + ',.9)'); gr.addColorStop(.5, 'rgba(' + rgb + ',.22)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return (sprites[rgb] = c);
  };
  let drawOrbA = 1;   // przezroczystość rysowanego Orba (blaski też ją dziedziczą)
  const glow = (x, y, r, rgb, a = 1) => { if (r < .5 || a <= 0) return; g.globalAlpha = Math.min(1, a) * drawOrbA; g.drawImage(sprite(rgb), x - r, y - r, r * 2, r * 2); g.globalAlpha = drawOrbA; };
  const spark = (i, c, cnt) => {
    if (rq < 2) return; const p = P[i];
    for (let k = 0; k < cnt; k++) { const u = Math.random() * 2 - 1, a = Math.random() * 6.28, s = Math.sqrt(1 - u * u), v = 250 + Math.random() * 520; sparks.push({ x: p.x, y: p.y, z: p.z, vx: s * Math.cos(a) * v, vy: s * Math.sin(a) * v, vz: u * v, life: 1, c: Math.random() < .25 ? WHITE : c }); }
  };
  const flash = (a = .6) => { if (rank < 1) return; flashEl.style.setProperty('--fa', String(a)); flashEl.classList.remove('on'); void flashEl.offsetWidth; flashEl.classList.add('on'); };
  const shake = a => { shakeA = rq >= 2 ? a : 0; };
  const impact = (i, c) => { flash(.55); shake(16); waves.push({ i, r: 70, life: 1, c }, { i, r: 30, life: 1.3, c: WHITE }); spark(i, c, rq >= 3 ? 90 : 50); flares.push({ i, life: 1, c }); orbBoost = Math.max(orbBoost, .5); audio.impact(); };
  const ignite = i => { waves.push({ i, r: 60, life: 1, c: ACC }); spark(i, ACC, 24); audio.hit(); };
  /* zapalenie konstelacji: wiązka z Orba do każdego kroku po kolei */
  const reveal = (gap = 140) => run.steps.forEach((s, i) => { if (litAt[i] === Infinity) { litAt[i] = tNow + .3 + i * gap / 1000; beams.push({ i, at: litAt[i] - .3, life: 1 }); } });
  /* nowy krok w trakcie filmu (tylko dyn): węzeł, pozycja i znacznik zapalenia dochodzą na końcu konstelacji */
  const addStep = st => {
    run.steps.push({ ...st, state: 'pending', attempts: 0, ms: null, preview: '', score: null, errors: [] });
    const i = run.steps.length - 1; n = run.steps.length;
    P.push(slot(i, n, false)); PP.push(null); lit.push(still ? 1 : 0); litAt.push(Infinity); NODES.push(makeNode(run.steps[i], i));
  };

  /* Orb Jarvisa w świecie — ten sam wygląd co na pulpicie: kula z plazmą, orbity, pionowa wiązka, napis JARVIS */
  const ORBITS = [[1.45, .42, -.35, 1.1, 0], [1.7, .3, .2, .8, 2.1], [1.25, .55, .9, 1.5, 4.2]];
  const orbits = (p, R, front, e) => ORBITS.forEach(([rx, ry, rot, sp, ph], k) => {
    const c = k === 1 ? ACC2 : ACC;
    g.save(); g.translate(p.x, p.y); g.rotate(rot + Math.sin(tNow * .3 + k) * .05);
    g.beginPath(); g.ellipse(0, 0, R * rx, R * ry, 0, front ? 0 : Math.PI, front ? Math.PI : 2 * Math.PI);
    g.strokeStyle = 'rgba(' + c + ',' + (front ? .85 : .3) + ')'; g.lineWidth = Math.max(.8, R * (front ? .012 : .008)); g.stroke();
    for (let tr = 0; tr < 6; tr++) { const a = tNow * sp * (1 + e) + ph - tr * .08, sn = Math.sin(a); if ((sn > 0) !== front) continue; glow(Math.cos(a) * R * rx, sn * R * ry, Math.max(2, R * (tr ? .03 : .06)) * (1 - tr / 7), WHITE, (1 - tr / 6) * .9); }
    g.restore();
  });
  const drawOrb = (p, R, e) => {
    if (!p || R < 2) return;
    g.globalCompositeOperation = 'lighter';
    glow(p.x, p.y, R * 3.6, ACC2, .16 + .18 * e); glow(p.x, p.y, R * 2.3, ACC, .22 + .3 * e);
    const bw = Math.max(1.6, R * .022); let gr = g.createLinearGradient(0, p.y - R * 2.8, 0, p.y + R * 1.9);
    gr.addColorStop(0, 'rgba(' + ACC + ',0)'); gr.addColorStop(.45, 'rgba(150,210,255,' + (.45 + .3 * e) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(p.x - bw / 2, p.y - R * 2.8, bw, R * 4.7);
    orbits(p, R, false, e);
    g.globalCompositeOperation = 'source-over';
    g.save(); g.beginPath(); g.arc(p.x, p.y, R, 0, 6.283); g.clip();
    gr = g.createRadialGradient(p.x - R * .25, p.y - R * .35, R * .05, p.x, p.y, R);
    gr.addColorStop(0, 'rgba(70,110,220,.96)'); gr.addColorStop(.55, 'rgba(10,18,74,.97)'); gr.addColorStop(.86, 'rgba(' + ACC + ',.55)'); gr.addColorStop(1, 'rgba(' + ACC2 + ',.85)');
    g.fillStyle = gr; g.fillRect(p.x - R, p.y - R, R * 2, R * 2);
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 7; k++) { const a0 = tNow * (.6 + k * .15) * (1 + e) + k * 1.7; g.beginPath(); g.arc(p.x, p.y, R * (.3 + k * .085), a0, a0 + 1.1 + k * .25); g.strokeStyle = 'rgba(' + (k % 2 ? ACC2 : '90,200,255') + ',' + (.22 + .45 * e) + ')'; g.lineWidth = Math.max(1, R * .022); g.stroke(); }
    g.restore();
    g.beginPath(); g.arc(p.x, p.y, R, 0, 6.283); g.strokeStyle = 'rgba(' + ACC + ',' + (.5 + .35 * e) + ')'; g.lineWidth = Math.max(1, R * .014); g.stroke();
    orbits(p, R, true, e);
    g.globalCompositeOperation = 'source-over';
    if (R > 34) {
      g.font = '700 ' + Math.round(R * .19) + 'px Orbitron, Rajdhani, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      if ('letterSpacing' in g) g.letterSpacing = Math.round(R * .045) + 'px';
      g.shadowColor = 'rgba(' + ACC + ',.95)'; g.shadowBlur = 16; g.fillStyle = 'rgba(235,248,255,' + (.7 + .25 * e) + ')'; g.fillText('JARVIS', p.x, p.y); g.shadowBlur = 0;
      if ('letterSpacing' in g) g.letterSpacing = '0px';
    }
  };

  const draw = dt => {
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.fillStyle = '#01030a'; g.fillRect(0, 0, W, H);
    NEB.forEach(([fx, fy, c, a, rr], k) => {
      const x = fx * W - cam.x * .03 * (k + 1), y = fy * H - cam.y * .03 * (k + 1), R = Math.max(W, H) * rr * (1 + .05 * Math.sin(tNow * .2 + k));
      const gr = g.createRadialGradient(x, y, 0, x, y, R); gr.addColorStop(0, 'rgba(' + c + ',' + a + ')'); gr.addColorStop(1, 'rgba(' + c + ',0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    });
    g.globalCompositeOperation = 'lighter';
    /* gwiazdy: paralaksa z kamery; przy szybkim locie — smugi */
    const v = Math.hypot(vel.x, vel.y, vel.z), streak = rq >= 2 && v > 450, cB = streak ? { x: cam.x - vel.x * .05, y: cam.y - vel.y * .05, z: cam.z - vel.z * .05 } : null;
    g.lineCap = 'round';
    for (const s of stars) {
      const dz0 = s.z - cam.z;
      if (dz0 < 40) Object.assign(s, spawnStar(false)); else if (dz0 > 6300) s.z -= 6000;
      if (Math.abs(s.x - cam.x) > 4800) s.x = cam.x + (Math.random() - .5) * 9000;
      if (Math.abs(s.y - cam.y) > 3000) s.y = cam.y + (Math.random() - .5) * 5600;
      const p = proj(s); if (!p || p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) continue;
      const a = s.b * clamp(1 - p.dz / 6000, 0, 1) * (still ? 1 : .75 + .25 * Math.sin(tNow * 2 + s.tw)), r = clamp(p.k * 2.2, .35, 2.6);
      if (streak) { const q = proj(s, cB); if (q) { g.strokeStyle = 'rgba(' + s.c + ',' + a + ')'; g.lineWidth = r; g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(p.x, p.y); g.stroke(); continue; } }
      g.fillStyle = 'rgba(' + s.c + ',' + a + ')'; g.fillRect(p.x - r / 2, p.y - r / 2, r, r);
      if (r > 1.6) glow(p.x, p.y, r * 4, s.c, a * .5);
    }
    /* Orb (za konstelacją) */
    const op = proj(ORB), ri = run.steps.findIndex(s => s.state === 'running');
    orbBoost = Math.max(0, orbBoost - dt * .6);
    orbE += ((.25 + (speaking ? .5 + .25 * Math.sin(tNow * 18) : 0) + (ri >= 0 ? .3 : 0) + orbBoost) - orbE) * (1 - Math.exp(-dt * 6));
    orbA += ((focusI >= 0 && !inFinale ? .32 : 1) * (1 - .62 * dimK) - orbA) * (1 - Math.exp(-dt * 2.5));
    if (op) { g.globalAlpha = 1; const a0 = orbA; g.save(); g.globalAlpha = a0; drawOrbA = a0; drawOrb(op, ORB_R * op.k, clamp(orbE, 0, 1.6)); g.restore(); drawOrbA = 1; }
    g.globalCompositeOperation = 'lighter';
    /* wiązki z Orba zapalające kroki */
    beams = beams.filter(b => b.life > 0);
    beams.forEach(b => {
      if (tNow < b.at) return; b.life -= dt * 1.6; const p = PP[b.i]; if (!op || !p) return;
      const a = Math.max(0, Math.min(1, b.life)), gr = g.createLinearGradient(op.x, op.y, p.x, p.y);
      gr.addColorStop(0, 'rgba(' + ACC + ',' + a * .9 + ')'); gr.addColorStop(1, 'rgba(255,255,255,' + a + ')');
      g.strokeStyle = gr; g.lineWidth = 1 + 3 * a; g.beginPath(); g.moveTo(op.x, op.y); g.lineTo(p.x, p.y); g.stroke(); glow(p.x, p.y, 40 * a * p.k + 6, ACC, a);
    });
    /* połączenia kroków */
    for (let i = 0; i < n - 1; i++) {
      const a = PP[i], b = PP[i + 1]; if (!a || !b || lit[i] * lit[i + 1] < .05) continue;
      g.globalAlpha = (1 - .72 * dimK) * Math.min(lit[i], lit[i + 1]);
      const sa = run.steps[i].state, sb = run.steps[i + 1].state, passed = sa === 'done' || sa === 'skipped', hot = sb === 'running';
      const lw = clamp((a.k + b.k) * 2.2, .6, 5);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
      if (passed) {
        const gr = g.createLinearGradient(a.x, a.y, b.x, b.y); gr.addColorStop(0, 'rgba(' + OK + ',.85)'); gr.addColorStop(1, 'rgba(' + (hot ? ACC : OK) + ',.95)');
        g.strokeStyle = 'rgba(' + (hot ? ACC : OK) + ',.12)'; g.lineWidth = lw * 5; g.stroke();
        g.strokeStyle = gr; g.lineWidth = lw; g.stroke();
        if (rq >= 2) { g.setLineDash([lw * 1.4, lw * 8]); g.lineDashOffset = -tNow * (hot ? 220 : 70); g.strokeStyle = 'rgba(255,255,255,.85)'; g.stroke(); g.setLineDash([]); }
      } else { g.setLineDash([6, 10]); g.lineDashOffset = 0; g.strokeStyle = 'rgba(150,180,240,.16)'; g.lineWidth = Math.max(.6, lw * .5); g.stroke(); g.setLineDash([]); }
    }
    g.globalAlpha = 1;
    /* projektor hologramu */
    if (holoI >= 0 && PP[holoI]) {
      if (!holoRect) { const b = holo.getBoundingClientRect(); if (b.width > 40) holoRect = b; }
      if (holoRect) {
        const p = PP[holoI], fl = .7 + .3 * Math.sin(tNow * 23) * Math.sin(tNow * 7), gr = g.createLinearGradient(p.x, p.y, holoRect.left, p.y);
        gr.addColorStop(0, 'rgba(' + ACC + ',' + .26 * fl + ')'); gr.addColorStop(1, 'rgba(' + ACC + ',.03)');
        g.fillStyle = gr; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(holoRect.left, holoRect.top + 8); g.lineTo(holoRect.left, holoRect.bottom - 8); g.closePath(); g.fill();
      }
    }
    /* krok w toku: aura, satelity na orbicie 3D, strumienie danych zbiegające do węzła */
    if (ri >= 0 && PP[ri] && !still && lit[ri] > .5) {
      const p = PP[ri];
      glow(p.x, p.y, 160 * p.k * (1 + .08 * Math.sin(tNow * 3)), ACC, .55);
      if (rq >= 2) for (let k = 0; k < 3; k++) for (let tr = 0; tr < 7; tr++) {
        const a = tNow * (1.5 + k * .4) + k * 2.09 - tr * .07, R = 95 + k * 22;
        const q = proj({ x: P[ri].x + Math.cos(a) * R, y: P[ri].y + Math.sin(a * .7 + k) * 26, z: P[ri].z + Math.sin(a) * R });
        if (q) glow(q.x, q.y, (tr ? 7 : 12) * q.k * (1 - tr / 8), k === 1 ? ACC2 : ACC, (1 - tr / 7) * .9);
      }
      if (rq >= 2 && Math.random() < dt * (rq >= 3 ? 26 : 14)) { const ang = Math.random() * 6.28, d = Math.max(W, H) * .62; streams.push({ x0: p.x + Math.cos(ang) * d, y0: p.y + Math.sin(ang) * d, t: 0, v: .55 + Math.random() * .6, to: ri, c: Math.random() < .7 ? ACC : ACC2 }); }
    }
    streams = streams.filter(s => s.t < 1 && (s.to === 'orb' ? op : PP[s.to]) && (s.from == null || PP[s.from]));
    streams.forEach(s => {
      const p = s.to === 'orb' ? op : PP[s.to], o0 = s.from != null ? PP[s.from] : { x: s.x0, y: s.y0 }, t0 = s.t; s.t += s.v * dt; if (s.t < 0) return;
      const at = t => { const e = t * t; return { x: o0.x + (p.x - o0.x) * e, y: o0.y + (p.y - o0.y) * e }; }, a = at(Math.max(0, t0 - .06)), b = at(Math.min(1, s.t));
      g.strokeStyle = 'rgba(' + s.c + ',' + (.25 + .6 * s.t) + ')'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); glow(b.x, b.y, 6, s.c, .8);
    });
    /* fale uderzeniowe */
    waves = waves.filter(w => w.life > 0);
    waves.forEach(w => {
      w.r += 900 * dt; w.life -= dt * 1.1; const p = PP[w.i]; if (!p) return;
      const R = w.r * p.k, a = Math.max(0, Math.min(1, w.life));
      g.beginPath(); g.arc(p.x, p.y, R, 0, 6.283); g.strokeStyle = 'rgba(' + w.c + ',' + a * .25 + ')'; g.lineWidth = 14 * a + 2; g.stroke();
      g.strokeStyle = 'rgba(' + w.c + ',' + a * .9 + ')'; g.lineWidth = 1 + 3 * a; g.stroke();
    });
    /* iskry w 3D */
    sparks = sparks.filter(s => s.life > 0);
    sparks.forEach(s => {
      const pb = proj(s); s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; const dr = Math.exp(-dt * 1.8); s.vx *= dr; s.vy *= dr; s.vz *= dr; s.life -= dt * .85;
      const p = proj(s); if (!p) return;
      if (pb) { g.strokeStyle = 'rgba(' + s.c + ',' + s.life + ')'; g.lineWidth = clamp(p.k * 3, .6, 3); g.beginPath(); g.moveTo(pb.x, pb.y); g.lineTo(p.x, p.y); g.stroke(); }
      glow(p.x, p.y, clamp(10 * p.k, 2, 14) * (.4 + s.life), s.c, s.life);
    });
    /* flara anamorficzna: pozioma smuga przez cały kadr + odblaski soczewki */
    flares = flares.filter(f => f.life > 0);
    flares.forEach(f => {
      f.life -= dt * .8; const p = f.orb ? op : PP[f.i]; if (!p) return;
      const a = Math.max(0, Math.min(1, f.life)), len = W * (.45 + .6 * a);
      g.globalAlpha = a * .9; g.drawImage(sprite(f.c), p.x - len, p.y - 16 * a - 3, len * 2, 32 * a + 6);
      g.globalAlpha = a * .55; g.drawImage(sprite(WHITE), p.x - len * .5, p.y - 2, len, 4); g.globalAlpha = 1;
      glow(p.x, p.y, 110 * a + 30, WHITE, a * .9);
      const dx = W / 2 - p.x, dy = H / 2 - p.y;
      [[.6, 26, ACC], [1.3, 60, ACC2], [1.7, 16, OK], [2.1, 38, ACC]].forEach(([s, r, c]) => glow(p.x + dx * s, p.y + dy * s, r, c, a * .3));
    });
    g.globalCompositeOperation = 'source-over';
  };

  /* węzły DOM: pozycja z kamery, głębia ostrości (rozmycie poza płaszczyzną ostrości) */
  const place = () => {
    const fz = focusI >= 0 && PP[focusI] ? PP[focusI].dz : MEAN_Z - cam.z;
    for (let i = 0; i < n; i++) {
      const p = PP[i], N = NODES[i], s = run.steps[i], key = s.state + ':' + (s.attempts || 0);
      if (N.st !== key) { N.st = key; N.n.dataset.s = s.state; N.small.textContent = stateLine(s, day); }
      if (!p || p.x < -320 || p.x > W + 320 || p.y < -320 || p.y > H + 320) { N.n.style.opacity = '0'; N.l.style.opacity = '0'; continue; }
      const k = p.k, blur = rq >= 2 ? Math.round(clamp(Math.abs(p.dz - fz) / 230 - .4, 0, 7) * 2) / 2 : 0, z = String(5000 - Math.round(p.dz / 2));
      N.n.style.transform = 'translate3d(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px,0) translate(-50%,-50%) scale(' + k.toFixed(3) + ')';
      N.n.style.opacity = String(clamp(k * 2.4, .3, 1) * lit[i]); N.n.style.zIndex = z;
      if (N.blur !== blur) { N.blur = blur; N.n.style.filter = N.l.style.filter = blur ? 'blur(' + blur + 'px)' : ''; }
      N.l.style.transform = 'translate3d(' + p.x.toFixed(1) + 'px,' + (p.y + 66 * k + 10).toFixed(1) + 'px,0) translateX(-50%) scale(' + clamp(k, .5, 1.25).toFixed(3) + ')';
      N.l.style.opacity = String(clamp((k - .22) * 2.4, 0, 1) * lit[i]); N.l.style.zIndex = z;
    }
    const wo = (1 - .72 * dimK).toFixed(2); if (world.style.opacity !== wo) world.style.opacity = wo;
  };

  /* jakość obrazu wg płynności: < 28 kl./s przez 3 s → mniej gwiazd i efektów; ≥ 55 przez 6 s → z powrotem */
  let fpsN = 0, fpsAt = 0, lowS = 0, hiS = 0;
  const setQ = q => {
    rq = q; el.dataset.r = String(q);
    const want = NS(q); if (stars.length > want) stars.length = want; else while (stars.length < want) stars.push(spawnStar(true));
  };
  const adapt = now => {
    fpsN++; if (!fpsAt) fpsAt = now; if (now - fpsAt < 1000) return;
    const fps = fpsN * 1000 / (now - fpsAt); fpsN = 0; fpsAt = now; C.fps = Math.round(fps);
    if (C.noAdapt || still) return;
    if (fps < 28) { lowS++; hiS = 0; if (lowS >= 3 && rq > 1) { setQ(rq - 1); lowS = 0; } }
    else if (fps >= 55) { hiS++; lowS = 0; if (hiS >= 6 && rq < rank) { setQ(rq + 1); hiS = 0; } }
    else { lowS = 0; hiS = 0; }
  };

  /* ---------- zegar filmu: oczekiwania reżysera biegną z obrazem (pauza je zatrzymuje, przewijanie przyspiesza) ---------- */
  let raf = 0, last = 0, lastReal = 0, lastDraw = 0, vt = 0;
  const waits = [];
  const wait = ms => new Promise((res, rej) => { if (!alive) return rej(SEEK); waits.push({ at: vt + ms / 1000, res, rej }); });
  /* pisanie Hermesa w hologramie (na żywo z mostu albo — w zapisie — wynik kroku wpisywany w czasie „myślenia”) */
  const wr = { i: -1, att: 0, buf: '', shown: 0, chars: 0, cps: 120, el: null, len: -1 };
  let scr = null, holoI = -1, holoKind = '';
  const frame = now => {
    raf = 0; if (!alive) return;
    raf = requestAnimationFrame(frame);
    const rdt = lastReal ? Math.min(.25, (now - lastReal) / 1000) : 0; lastReal = now;
    if (!paused) vt += rdt * speed();
    for (let k = waits.length - 1; k >= 0; k--) if (waits[k].at <= vt) waits.splice(k, 1)[0].res();
    if (still && now - lastDraw < 100) return;   // „ogranicz ruch”: obraz stoi — wystarczy ~10 klatek/s
    lastDraw = now; adapt(now);
    const dt = paused ? 0 : last ? Math.min(.05, (now - last) / 1000) : 1 / 60; last = now; tNow += dt;
    if (shot) { const k = clamp((tNow - shot.t0) / shot.d, 0, 1), e = shot.ez(k); ['x', 'y', 'z', 'roll'].forEach(q => { cam[q] = shot.a[q] + (shot.b[q] - shot.a[q]) * e; }); if (k >= 1) shot = null; }
    else if (!still) cam.z += drift * dt;
    if (dt) { vel.x = (cam.x - prevCam.x) / dt; vel.y = (cam.y - prevCam.y) / dt; vel.z = (cam.z - prevCam.z) / dt; } prevCam = { ...cam };
    const hand = rq >= 2 ? 1 : 0;   // kamera „z ręki”
    hx = hand * (Math.sin(tNow * .53) * 7 + Math.sin(tNow * 1.37) * 3); hy = hand * (Math.cos(tNow * .47) * 5 + Math.sin(tNow * 1.11) * 2.5);
    const roll = cam.roll + hand * Math.sin(tNow * .31) * .006; cr = Math.cos(roll); sr = Math.sin(roll);
    for (let i = 0; i < n; i++) PP[i] = proj(P[i]);
    dimT = ttl.querySelector('.cin-t.main:not(.out),.cin-t.big:not(.out),.cin-t.end:not(.out)') || el.querySelector('.cin-credits.on:not(.gone),.cin-reader') ? 1
      : ttl.querySelector('.cin-t.warn:not(.out),.cin-t.err:not(.out)') ? .8 : ttl.querySelector('.cin-t.act:not(.out)') ? .4 : 0;
    dimK += (dimT - dimK) * (1 - Math.exp(-(dt || rdt) * (still ? 60 : 3.5)));
    for (let i = 0; i < n; i++) if (lit[i] < 1 && tNow >= litAt[i]) { if (!lit[i]) { waves.push({ i, r: 20, life: .7, c: ACC }); spark(i, ACC, 8); } lit[i] = Math.min(1, lit[i] + dt * 2.5); }
    /* hologram: pisanie i przewijanie jak prompter */
    if (holoKind === 'write' && wr.el && wr.shown < wr.buf.length && dt) {
      wr.shown = Math.min(wr.buf.length, wr.shown + wr.cps * dt);
      const vis = Math.floor(wr.shown);
      if (vis !== wr.len) { wr.len = vis; wr.el.textContent = unesc(wr.buf.slice(Math.max(0, vis - 1800), vis)); holoBody.scrollTop = holoBody.scrollHeight; if (film) holoN.textContent = vis.toLocaleString('pl-PL') + ' znaków'; }
    }
    if (scr && holoKind === 'result' && dt) {
      const max = holoBody.scrollHeight - holoBody.clientHeight; scr.t += dt;
      if (max > 6) {
        if (scr.phase === 'wait' && scr.t > 1.1) { scr.phase = 'down'; scr.t = 0; scr.v = Math.max(18, max / Math.max(1.5, scr.hold - 2.4)); }
        else if (scr.phase === 'down') { holoBody.scrollTop = Math.min(max, holoBody.scrollTop + scr.v * dt); if (holoBody.scrollTop >= max - 1) { scr.phase = 'hold'; scr.t = 0; } }
        else if (scr.phase === 'hold' && scr.t > 2.2 && live) { scr.phase = 'up'; scr.t = 0; }
        else if (scr.phase === 'up') { holoBody.scrollTop = Math.max(0, holoBody.scrollTop - max * dt * 1.5); if (holoBody.scrollTop <= 0) { scr.phase = 'wait'; scr.t = 0; } }
      }
    }
    draw(dt); place();
    if (shakeA > .3 && dt) { stage.style.transform = 'translate(' + ((Math.random() - .5) * shakeA).toFixed(1) + 'px,' + ((Math.random() - .5) * shakeA).toFixed(1) + 'px)'; shakeA *= Math.exp(-dt * 7); }
    else if (shakeA <= .3 && shakeA) { shakeA = 0; stage.style.transform = ''; }
    tcEl.textContent = timecode(tNow);
  };

  /* ---------- plansze, napisy, lektor, hologram ---------- */
  const title = (kind, big, small, extra) => {
    [...ttl.children].forEach(c => { c.classList.add('out'); setTimeout(() => c.remove(), 700); });
    const t = h('div', { class: 'cin-t ' + kind });
    if (small) { const s = h('small'); s.textContent = small; t.appendChild(s); }
    if (big) { const b = h('b'); b.textContent = big; t.appendChild(b); }
    const em = h('em'); if (extra) em.textContent = extra; t.appendChild(em);
    if (kind === 'act') t.appendChild(h('i', { class: 'streak' }));
    ttl.appendChild(t); t.em = em; return t;
  };
  const titleOut = () => [...ttl.children].forEach(c => { c.classList.add('out'); setTimeout(() => c.remove(), 700); });
  /* pasek z podpisem (montaż krótkich scen) */
  const lower = (small, big) => {
    l3.innerHTML = ''; const x = h('div', { class: 'cin-l3x' }, '<em></em><b></b>');
    x.querySelector('em').textContent = small; x.querySelector('b').textContent = big; l3.appendChild(x);
    setTimeout(() => x.classList.add('out'), 2400); setTimeout(() => x.remove(), 3200);
  };
  let subT = 0, thinkAt = 0, thinkK = 0, narrOn = !!J.state?.settings?.speech;
  const sub = text => { thinkAt = tNow; clearTimeout(subT); subEl.classList.remove('on'); subT = setTimeout(() => { subEl.textContent = text || ''; subEl.classList.toggle('on', !!text); }, still ? 0 : 220); };
  const say = text => { if (!narrOn || !text || !J.voice?.speak) return; spoke = true; J.voice.speak(text, { priority: 1, force: true, replace: true }); };
  const holoShow = (kind, i, head) => {
    const same = holo.classList.contains('show') && holoKind === kind && holoI === i;
    holoI = i; holoKind = kind; holoHead.textContent = head; holo.dataset.k = kind;
    if (same) return false;
    holoBody.innerHTML = ''; holoBody.scrollTop = 0; holoN.textContent = ''; holoTool.textContent = ''; holoTool.classList.remove('on'); scr = null; wr.el = null;
    holo.classList.remove('show'); void holo.offsetWidth; holo.classList.add('show'); holoRect = null; setTimeout(() => { holoRect = null; }, 650); audio.holo();
    return true;
  };
  const holoOn = (i, s, hold) => { holoShow('result', i, 'Wynik · ' + untimed(s.title)); try { holoBody.appendChild(renderArt(s.artifact)); } catch (e) { /* hologram bez treści */ } scr = { t: 0, phase: 'wait', hold: (hold || D.holo) / 1000 }; };
  const holoWrite = (i, s) => {
    if (holoShow('write', i, 'Hermes pisze · ' + untimed(s.title)) || !wr.el) { holoBody.innerHTML = ''; const pre = h('div', { class: 'cin-write' }, '<span></span><i class="cin-cur"></i>'); holoBody.appendChild(pre); wr.el = pre.firstChild; wr.len = -1; }
  };
  const holoOff = () => { holo.classList.remove('show'); holoI = -1; holoKind = ''; scr = null; wr.el = null; };
  /* nowy fragment tekstu (na żywo: ostatnie ~900 znaków + licznik — dopisujemy tylko przyrost) */
  const feed = (i, att, tail, chars) => {
    if (wr.i !== i || wr.att !== att) Object.assign(wr, { i, att, buf: '', shown: 0, chars: 0 });
    const delta = chars - wr.chars;
    if (delta <= 0) return;
    if (!wr.buf || delta >= tail.length) { wr.buf = tail; wr.shown = Math.max(0, tail.length - 240); } else wr.buf += tail.slice(-delta);
    wr.chars = chars;
    if (wr.buf.length > 5000) { const cut = wr.buf.length - 3000; wr.buf = wr.buf.slice(cut); wr.shown = Math.max(0, wr.shown - cut); }
    wr.cps = Math.max(70, (wr.buf.length - wr.shown) / .7);
    holoN.textContent = chars.toLocaleString('pl-PL') + ' znaków';
  };
  const liveCount = () => { if (wr.chars) holoN.textContent = wr.chars.toLocaleString('pl-PL') + ' znaków'; };
  const toolChip = (tool, label, status) => {
    if (!tool) return;
    holoTool.textContent = TOOL_IC(tool) + ' sięga po: ' + tool + (label ? ' · ' + label : '');
    holoTool.classList.add('on'); if (status === 'completed') setTimeout(() => holoTool.classList.remove('on'), 1400);
  };
  const opts = list => {
    optsEl.innerHTML = '';
    (list || []).forEach((label, k) => {
      const b = h('button', { class: 'cin-b' + (k ? '' : ' pri'), type: 'button' }); b.textContent = label;
      b.onclick = async () => {
        [...optsEl.children].forEach(x => { x.disabled = true; });
        try { await api('/workflows/runs/' + encodeURIComponent(runId) + '/answer', { method: 'POST', body: { answer: label } }); }
        catch (er) { sub('Nie przekazano odpowiedzi: ' + er.message); [...optsEl.children].forEach(x => { x.disabled = false; }); }
      };
      optsEl.appendChild(b);
    });
  };
  /* rozdziały (film z zapisu) */
  let pos = -1;
  const drawChapters = () => {
    chapEl.hidden = !film; if (!film) return; chapEl.innerHTML = '';
    chapters.forEach(c => { const b = h('button', { class: 'cin-ch', type: 'button', title: c.title, 'aria-label': 'Rozdział: ' + c.title }); b.textContent = c.label; b.onclick = () => seek(c.i); chapEl.appendChild(b); });
  };
  const markChapter = () => { if (!film) return; let k = 0; chapters.forEach((c, j) => { if (c.i <= pos) k = j; }); [...chapEl.children].forEach((b, j) => b.classList.toggle('on', j === k)); };
  const hud = () => {
    if (!alive) return;
    if (live) { const sh = link.get(), left = sh && ACTIVE(sh.state) && link.eta ? link.eta(sh) : 0; etaEl.textContent = left ? '≈ ' + clock(left) + ' do końca' : ''; }
    else etaEl.textContent = '';
    const ri = run.steps.findIndex(s => s.state === 'running');
    if (live && !busy && !q.length && ri >= 0 && !paused) {
      if (wr.i === ri && wr.buf && holoKind !== 'write') { holoWrite(ri, run.steps[ri]); fly(near(ri, 620, 1), 1600); drift = 6; liveCount(); }
      if (tNow - thinkAt > 7) sub(thinkLine(run.steps[ri], ++thinkK));
    }
  };

  /* ---------- reżyser: kolejka zdarzeń → sceny ---------- */
  const q = film ? evs.slice() : [{ type: '_intro' }];
  let busy = false, ff = false, inFinale = false;
  const startedTs = {};
  const speed = () => film ? (ff && !inFinale ? 40 : 1) : (q.length > 2 ? 2.5 : 1);
  const pump = async () => {
    if (busy) return; busy = true;
    try {
      while (alive && q.length) {
        const e = q.shift(); if (film) { pos = evs.length - q.length - 1; markChapter(); }
        try { await beat(e); } catch (er) { if (er !== SEEK) console.error('[kino]', er); }
      }
    } finally { busy = false; }
  };

  const intro = async liveIntro => {
    audio.drone(); audio.motif();
    const K = scen ? .55 : 1;   // zadania z pulpitu są krótsze niż workflow — wstęp nie może trwać dłużej niż one
    Object.assign(cam, orbCam()); shot = null;
    await wait(D.orb * K);   // przesłona otwiera się na Orbie
    if (!still) { audio.whoosh(1.5); fly({ x: ORB.x, y: ORB.y, z: ORB.z - ORB_R * 1.06, roll: .05 }, D.dive * K, easeIn); }
    await wait(D.dive * K);
    flash(1);
    /* cięcie: po drugiej stronie Orba — odjazd z głębi kosmosu do konstelacji */
    Object.assign(cam, over()); cam.z -= liveIntro ? 1500 : 2600; cam.roll = .1; shot = null;
    fly(over(), (liveIntro ? 4000 : 6000) * K, easeOut);
    audio.riser(2.6);
    title('intro', '', 'Jarvis OS przedstawia'); sub('');
    await wait(D.intro1 * K);
    audio.braam(); flash(.35); shake(6);
    const idea = ideaOf(run), t = title('main', day ? 'Dzień z Jarvisem' : run.name, '');
    typeText(t.em, day ? (src.day?.label || '') : idea ? '„' + idea + '”' : '', 1800);
    if (day) { sub('Oto mój dzień.'); say('Oto mój dzień: ' + (src.day?.label || 'dzisiaj') + '.'); }
    else { sub(idea ? 'Wszystko zaczyna się od jednego pomysłu.' : 'Zaczynam pracę.'); say(idea ? 'Wszystko zaczyna się od pomysłu: ' + idea + '.' : 'Zaczynam.'); }
    await wait((liveIntro ? 3000 : D.intro2) * K);
    titleOut(); reveal(); audio.ping();
    if (!liveIntro) return wait(D.reveal);   // chwila na zapalenie się konstelacji przed Aktem I
    /* na żywo: krótkie „poprzednio” i lot do bieżącej sceny */
    const doneI = run.steps.map((s, i) => s.state === 'done' || s.state === 'skipped' ? i : -1).filter(i => i >= 0);
    if (doneI.length) {
      sub('Dotąd: ' + doneI.length + (dyn ? '' : ' z ' + n) + ' ' + J.pl(doneI.length, 'scena gotowa', 'sceny gotowe', 'scen gotowych') + '.');
      for (const i of doneI) { fly(near(i, 760), 800); await wait(850); waves.push({ i, r: 50, life: .8, c: OK }); }
    }
    const ri = run.steps.findIndex(s => s.state === 'running');
    if (ri >= 0) { startedTs[run.steps[ri].id] = Date.now() / 1000; await act(ri, { attempt: 1 }); }
    else if (run.state === 'waiting') await asking(run.pending);
  };
  const act = async (i, e) => {
    const s = run.steps[i]; holoOff(); focusI = i; reveal(60);
    const time = day ? (s.title.match(/^\d{1,2}:\d{2}/)?.[0] || '') : '', name = untimed(s.title), label = lab(i);
    actEl.textContent = (day ? time + ' · ' : scen ? label + ' · ' : 'Akt ' + roman(i + 1) + ' / ' + roman(n) + ' · ') + name;
    if ((e.attempt || 1) > 1) { audio.whoosh(.6); fly(near(i, 560), 1200); sub('Próba ' + e.attempt + ': ' + thinkLine(s, e.attempt)); return wait(D.again); }
    if (quickOf(s)) {   // montaż: cięcie z błyskiem, pasek z podpisem zamiast planszy aktu
      audio.hit(); flash(.18); fly(near(i, 640), 450, easeOut);
      lower(label + ' · ' + (KPL[s.kind] || ''), name);
      sub(startLine(s)); if (day) say(name);
      return wait(D.quick);
    }
    audio.whoosh(); fly(near(i, 980), D.act * .85);
    title('act', name, label, KPL[s.kind] || ''); say((day ? time + '. ' : scen ? '' : 'Akt ' + (ORD[i] || i + 1) + '. ') + name + '.');
    sub(startLine(s));
    await wait(D.act); titleOut();
    ignite(i); fly(near(i, 540), 1500); drift = 14;
    await wait(D.ignite);
  };
  const done = async i => {
    const s = run.steps[i], qk = quickOf(s); focusI = i;
    if (qk) { waves.push({ i, r: 40, life: .9, c: OK }); spark(i, OK, 26); audio.hit(); flash(.15); orbBoost = Math.max(orbBoost, .3); } else impact(i, OK);
    sub(doneLine(s)); if (!day) say(doneSay(s));
    await wait(D.impact);
    if (hasArt(s)) { const hold = day ? D.dayHolo : D.holo; fly(near(i, 600, 1), 1300); drift = 8; holoOn(i, s, hold); await wait(hold); }
    else await wait(qk ? D.quickDone : D.plain);
  };
  const retry = async (i, e) => {
    holoOff(); el.classList.remove('glitch'); void el.offsetWidth; el.classList.add('glitch'); setTimeout(() => el.classList.remove('glitch'), 750);
    audio.glitch(); shake(10); waves.push({ i, r: 50, life: 1, c: WARN });
    title('warn', 'Korekta kursu', 'Sprawdzenie nie przeszło', String(e.reason || '').slice(0, 110));
    sub('Sprawdzenie nie przeszło' + (e.reason ? ': ' + String(e.reason).slice(0, 140) : '') + '. Odsyłam do poprawki.'); say('Korekta kursu.');
    await wait(D.retry); titleOut();
  };
  const failed = async (i, e) => {
    if (e.soft) {   // pojedyncze nieudane narzędzie w zadaniu (Hermes zwykle próbuje dalej) — czerwony węzeł i pasek, bez planszy „Awaria”
      waves.push({ i, r: 45, life: .9, c: ERR }); spark(i, ERR, 16); audio.hit(); fly(near(i, 640), 450, easeOut);
      lower(lab(i) + ' · nie wyszło', untimed(run.steps[i].title)); sub('Nie wyszło: ' + untimed(run.steps[i].title) + (e.reason ? ' — ' + String(e.reason).slice(0, 120) : '') + '.');
      return wait(D.quick);
    }
    holoOff(); el.classList.add('alarm'); audio.alarm(); waves.push({ i, r: 60, life: 1.2, c: ERR }); spark(i, ERR, 40); shake(14);
    title('err', 'Awaria', day ? untimed(run.steps[i].title) : lab(i), String(e.reason || '').slice(0, 110));
    sub('Ta scena się nie udała: ' + untimed(run.steps[i].title) + (e.reason ? ' — ' + String(e.reason).slice(0, 140) : '') + '.'); say('Awaria.');
    await wait(D.fail); titleOut(); el.classList.remove('alarm');
  };
  const asking = async p => {
    audio.ping(); sub('⏸ ' + (p?.question || 'Potrzebuję Twojej decyzji.')); say(p?.question || 'Potrzebuję Twojej decyzji.');
    if (live) opts(p?.options || []);
    await wait(D.ask);
  };
  const finale = async e => {
    inFinale = true; holoOff(); opts(null); focusI = -1;
    const okk = e.type === 'run.completed', c = okk ? OK : e.type === 'run.failed' ? ERR : WARN, fails = run.steps.filter(s => s.state === 'failed' || s.state === 'denied').length;
    actEl.textContent = 'Finał'; skipB.title = 'Przewiń napisy';
    audio.riser(3); fly(over(), D.pull); drift = -12;
    sub(day ? 'Tak minął dzień. Energia wraca do Orba…' : okk ? 'Wszystkie sceny nakręcone. Energia wraca do Orba…' : 'Koniec zdjęć.');
    run.steps.forEach((s, i) => setTimeout(() => {
      if (!alive) return;
      waves.push({ i, r: 40, life: 1, c: s.state === 'done' ? OK : s.state === 'skipped' ? '150,170,200' : ERR }); spark(i, c, 14);
      for (let k = 0; k < 4; k++) streams.push({ from: i, to: 'orb', t: -k * .12, v: .7 + Math.random() * .3, c: s.state === 'done' ? OK : ACC });
    }, i * 220));
    await wait(D.pull);
    orbBoost = 1.6; flash(.9); audio.braam(); if (okk) { audio.chord(); audio.motif(1.35, 2); } shake(12);
    flares.push({ orb: true, life: 1.4, c: okk ? OK : c });
    if (okk && rq >= 2) [0, 650, 1300].forEach(d => setTimeout(() => { if (alive) run.steps.forEach((s, i) => spark(i, [OK, ACC, ACC2, WARN][(i + d / 650) % 4], rq >= 3 ? 34 : 20)); }, d));
    const bigT = day ? (fails ? 'Dzień zamknięty' : 'To był dobry dzień') : okk ? 'Misja zakończona' : e.type === 'run.stopped' ? 'Misja zatrzymana' : 'Misja przerwana';
    title('big ' + (okk ? 'ok' : 'err'), bigT, '', day ? dayStats(run.steps) : projectName(run) || (scen && ideaOf(run)) || run.name);
    say(day ? bigT + '.' : okk ? 'Misja zakończona.' + (projectName(run) ? ' Projekt ' + projectName(run) + ' jest gotowy.' : '') : 'Musiałem przerwać.');
    sub(prettyPath(firstSentence(run.report || run.reason || '')));
    await wait(D.big); titleOut();
    await roll();
    end();
  };
  const roll = async () => {
    const box = $('.cin-credits'), r = h('div', { class: 'cin-roll' });
    credits(run, { live, day, scen }).forEach(sec => {
      const se = h('section', sec.mono ? { class: 'mono' } : {});
      if (sec.h) { const x = h('h4'); x.textContent = sec.h; se.appendChild(x); }
      if (sec.big) { const x = h('div', { class: 'big' }); x.textContent = sec.big; se.appendChild(x); }
      (sec.lines || []).forEach(t => { const x = h('p'); x.textContent = t; se.appendChild(x); });
      r.appendChild(se);
    });
    box.innerHTML = ''; box.className = 'cin-credits on'; box.appendChild(r); sub('');
    if (still) return wait(1200);   // bez ruchu: lista stoi (można przewinąć)
    const dist = r.offsetHeight + box.clientHeight, dur = clamp(dist / 90, 10, 26);
    r.style.setProperty('--dist', dist + 'px'); r.style.animationDuration = dur + 's'; r.classList.add('go');
    await wait(dur * 1000);
  };
  /* README projektu w czytniku-hologramie (most czyta plik tylko z folderu tego przebiegu) */
  const readme = async () => {
    let j; try { j = await api('/workflows/runs/' + encodeURIComponent(runId) + '/file?path=README.md', { timeout: 8000 }); } catch (er) { sub('README niedostępne: ' + er.message); return; }
    el.querySelector('.cin-reader')?.remove();
    const rd = h('div', { class: 'cin-reader', role: 'document', 'aria-label': 'README projektu' }, '<div class="cin-reader-h"><span></span><button class="cin-b" type="button" aria-label="Zamknij czytnik">✕</button></div><div class="cin-reader-b"></div>');
    rd.querySelector('span').textContent = '📄 README · ' + prettyPath(j.root || '');
    rd.querySelector('.cin-reader-b').innerHTML = J.md(j.text || '') + (j.truncated ? '<p>…</p>' : '');
    rd.querySelector('button').onclick = () => { rd.classList.add('out'); el.classList.remove('reading'); setTimeout(() => rd.remove(), 400); el.querySelector('.cin-endb .cin-b')?.focus(); };
    el.appendChild(rd); el.classList.add('reading'); rd.querySelector('button').focus(); audio.holo();
  };
  const end = () => {
    if (!alive) return;
    skipB.hidden = true; actEl.textContent = '';
    const row = h('div', { class: 'cin-endb' });
    const btn = (label, fn, pri) => { const b = h('button', { class: 'cin-b' + (pri ? ' pri' : ''), type: 'button' }); b.textContent = label; b.onclick = fn; row.appendChild(b); return b; };
    const again = btn('↻ Jeszcze raz', () => o.again ? o.again() : day ? C.openDay(src.day?.date) : C.open(runId, { film: true }), true);
    if (!day && !scen) {
      if (run.steps.some(s => s.artifact?.kind === 'files_written')) btn('📄 README projektu', () => readme());
      btn('➕ Nowy projekt', () => { close(); setTimeout(() => { J.chatPanel?.show?.(); const inp = document.querySelector('#chatInput'); if (inp) { inp.value = 'zrób projekt z pomysłu '; inp.focus(); inp.dispatchEvent(new Event('input')); } }, 80); });
    }
    btn('✕ Zamknij', () => close());
    if (still) { const r = $('.cin-roll'), k = h('div', { class: 'big' }); k.textContent = 'Koniec'; r?.append(k, row); }   // bez ruchu: napisy zostają do przeczytania
    else { $('.cin-credits').classList.add('gone'); title('end', 'Koniec', '', '').appendChild(row); }
    again.focus(); audio.fadeDrone(6);
  };

  const beat = async e => {
    if (e.type === '_intro') return intro(true);
    if (e.type === 'run.snapshot' || e.type === 'step.progress') return;
    let s0 = run.steps.find(x => x.id === e.step_id);
    if (!s0 && dyn && e.type === 'step.started' && e.step) { addStep(e.step); s0 = run.steps[run.steps.length - 1]; }   // zadanie z pulpitu: nowa scena w locie
    if (/^step\./.test(e.type) && !s0) return;
    /* zdarzenie już widoczne (np. dosłane po synchronizacji) — bez powtórki sceny */
    if (e.type === 'step.started' && s0.state === 'running' && (s0.attempts || 1) === (e.attempt || 1) && startedTs[s0.id]) return;
    if ((e.type === 'step.completed' || e.type === 'step.skipped') && (s0.state === 'done' || s0.state === 'skipped')) return;
    if (/^run\.(completed|failed|stopped)$/.test(e.type) && inFinale) return;
    if (film && /^step\.(completed|failed|retry)$/.test(e.type)) {
      /* „myślenie” w skrócie; w zapisie Hermes „pisze” w hologramie wynik tego kroku */
      const ri = run.steps.indexOf(s0), qk = quickOf(s0), hold = thinkMs(e.ts - (startedTs[s0.id] ?? e.ts), qk), txt = String(e.artifact?.excerpt || e.preview || '');
      focusI = ri; sub(thinkLine(s0, thinkK++));
      if (!qk && txt.length > 20 && e.type === 'step.completed' && s0.kind === 'hermes') { holoWrite(ri, s0); fly(near(ri, 620, 1), 1200); Object.assign(wr, { i: ri, att: e.attempt || 1, buf: txt, shown: 0, chars: txt.length, cps: Math.max(40, txt.length / (hold * .8 / 1000)) }); }
      await wait(hold);
    }
    WF.reduce(run, e); if (e.budget_used) run.budget_used = e.budget_used;
    const i = s0 ? run.steps.indexOf(s0) : -1;
    switch (e.type) {
      case 'run.started': return intro(false);
      case 'run.resumed': sub('Most wstał po restarcie — wracam do zapisanego kroku.'); return wait(D.resumed);
      case 'step.started': startedTs[s0.id] = e.ts || Date.now() / 1000; return act(i, e);
      case 'step.retry': return retry(i, e);
      case 'step.completed': return done(i);
      case 'step.skipped': sub((day ? '' : 'Scena pominięta: ') + untimed(s0.title) + (day ? ' — w toku albo przerwane.' : '.')); fly(near(i, 760), 900); return wait(D.skip);
      case 'step.failed': return failed(i, e);
      case 'ask.waiting': return asking(e);
      case 'ask.answered': opts(null); sub('Decyzja zapadła' + (e.answer ? ': „' + e.answer + '”' : '') + '.'); return wait(D.answered);
      case 'run.completed': case 'run.failed': case 'run.stopped': return finale(e);
    }
  };

  /* przewijanie do rozdziału: stan odtworzony z zapisu do tego miejsca, czysty kadr, dalej normalnie */
  const seek = idx => {
    if (!film || !alive) return;
    idx = clamp(idx, 0, evs.length - 1);
    waits.splice(0).forEach(w => w.rej(SEEK));
    const fresh = mkRun(); Object.keys(run).forEach(k => { delete run[k]; }); Object.assign(run, fresh);
    Object.keys(startedTs).forEach(k => { delete startedTs[k]; });
    evs.slice(0, idx).forEach(e => { WF.reduce(run, e); if (e.budget_used) run.budget_used = e.budget_used; if (e.type === 'step.started') startedTs[e.step_id] = e.ts; });
    titleOut(); holoOff(); opts(null); l3.innerHTML = ''; const cr = $('.cin-credits'); cr.className = 'cin-credits'; cr.innerHTML = ''; el.querySelector('.cin-reader')?.remove(); el.classList.remove('reading');
    el.classList.remove('glitch', 'alarm'); sparks = []; waves = []; flares = []; streams = []; beams = [];
    inFinale = false; ff = false; skipB.hidden = false; skipB.title = 'Przewiń do finału'; drift = 0;
    if (idx === 0) { lit.fill(0); litAt.fill(Infinity); }
    else { lit.fill(1); litAt.fill(-1); const k = run.steps.findIndex(s => s.id === evs[idx].step_id); Object.assign(cam, k >= 0 ? near(k, 900) : over()); shot = null; focusI = k; }
    q.length = 0; q.push(...evs.slice(idx)); pos = idx - 1; markChapter();
    if (paused) togglePause(false);
    audio.whoosh(.5); flash(.2);
    pump();
  };
  const chapterStep = dir => { if (!film) return; let k = 0; chapters.forEach((c, j) => { if (c.i <= pos) k = j; }); seek(chapters[clamp(k + dir, 0, chapters.length - 1)].i); };

  /* na żywo: zdarzenia z mostu (podgląd pisania od razu, reszta w kolejce) + dosłanie tego, co mogło umknąć */
  const onProgress = e => {
    const s = WF.reduce(run, e), i = s ? run.steps.indexOf(s) : -1; if (i < 0 || s.state !== 'running') return;
    if (typeof e.tail === 'string') feed(i, e.attempt || 1, e.tail, e.chars || e.tail.length);
    if (e.tool) toolChip(e.tool, e.label, e.status);
    if (!busy && !q.length && !inFinale && !paused && holoKind !== 'write' && wr.buf) { holoWrite(i, s); fly(near(i, 620, 1), 1600); drift = 6; liveCount(); if (e.tool) toolChip(e.tool, e.label, e.status); }
  };
  const offEv = live ? link.on(e => { if (!alive) return; if (e.type === 'step.progress') return onProgress(e); q.push(e); pump(); }) : () => { };
  const offVoice = J.on('voice', on => { speaking = !!on; audio.duck(speaking); });
  const resync = () => {
    if (!live || busy || q.length || inFinale || !link.resync) return;   // własne źródło (zadanie z pulpitu) działa w tym samym oknie — zdarzenia nie giną
    const sh = link.get(); if (!sh) return;
    const base = { v: 1, run_id: runId, workflow: run.workflow, name: run.name, total: n, ts: Date.now() / 1000 };
    sh.steps.forEach((x, i) => {
      const mine = run.steps[i]; if (!mine || mine.state === x.state) return;
      const one = { ...base, step_id: x.id, n: i + 1, kind: x.kind, title: x.title };
      if (mine.state === 'pending' && x.state !== 'pending') q.push({ ...one, type: 'step.started', attempt: x.attempts || 1 });
      if (x.state === 'done') q.push({ ...one, type: 'step.completed', ms: x.ms, score: x.score, preview: x.preview, artifact: x.artifact });
      else if (x.state === 'skipped') q.push({ ...one, type: 'step.skipped' });
      else if (x.state === 'failed' || x.state === 'denied') q.push({ ...one, type: 'step.failed', reason: (x.errors || []).slice(-1)[0] || '' });
    });
    if (!ACTIVE(sh.state) && ACTIVE(run.state)) q.push({ ...base, type: sh.state === 'done' ? 'run.completed' : sh.state === 'failed' ? 'run.failed' : 'run.stopped', state: sh.state, report: sh.report, reason: sh.reason, budget_used: sh.budget_used, ts: sh.ended || base.ts });
    if (q.length) pump();
  };
  const iv = setInterval(() => { hud(); resync(); }, 1000);

  /* ---------- sterowanie ---------- */
  const setSnd = v => { audio.set(v); sndB.textContent = audio.on ? '🔊' : '🔇'; sndB.setAttribute('aria-label', audio.on ? 'Wycisz muzykę' : 'Włącz muzykę'); sndB.title = (audio.on ? 'Wycisz muzykę' : 'Włącz muzykę') + ' (M)'; };
  const setNarr = v => { narrOn = !!v; if (!narrOn && spoke) J.voice?.stop?.(); narrB.textContent = '🎙'; narrB.classList.toggle('off', !narrOn); narrB.setAttribute('aria-label', narrOn ? 'Wyłącz lektora' : 'Włącz lektora'); narrB.title = (narrOn ? 'Wyłącz lektora' : 'Włącz lektora (głos Jarvisa)') + ' (L)'; };
  const togglePause = v => {
    paused = v ?? !paused; el.classList.toggle('paused', paused); audio.pause(paused);
    pauseB.textContent = paused ? '▶' : '⏸'; pauseB.setAttribute('aria-label', paused ? 'Wznów' : 'Pauza'); pauseB.title = (paused ? 'Wznów' : 'Pauza') + ' (spacja)';
    if (paused && spoke) J.voice?.stop?.();
  };
  setSnd(!J.sfx?.muted?.()); setNarr(narrOn); drawChapters();
  sndB.onclick = () => setSnd(!audio.on);
  narrB.onclick = () => setNarr(!narrOn);
  pauseB.onclick = () => togglePause();
  skipB.onclick = () => { if (inFinale) waits.forEach(w => { w.at = vt; }); else ff = true; };
  $('[data-a=close]').onclick = () => close();
  const onKey = ev => {
    const reader = el.querySelector('.cin-reader');
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); if (reader) reader.querySelector('button').click(); else close(); return; }
    const plain = !ev.ctrlKey && !ev.metaKey && !ev.altKey;
    if (plain && (ev.key === 'm' || ev.key === 'M')) { ev.preventDefault(); setSnd(!audio.on); }
    else if (plain && (ev.key === 'l' || ev.key === 'L')) { ev.preventDefault(); setNarr(!narrOn); }
    else if (plain && ev.key === ' ' && !(ev.target instanceof HTMLButtonElement)) { ev.preventDefault(); togglePause(); }
    else if (plain && ev.key === 'ArrowLeft' && !reader) { ev.preventDefault(); chapterStep(-1); }
    else if (plain && ev.key === 'ArrowRight' && !reader) { ev.preventDefault(); chapterStep(1); }
    ev.stopPropagation();   // skróty pulpitu nie działają pod filmem
  };
  window.addEventListener('keydown', onKey, true);
  addEventListener('resize', resize);

  const close = () => {
    if (!alive) return; alive = false;
    waits.splice(0).forEach(w => w.rej(SEEK)); offEv(); offVoice(); clearInterval(iv); clearTimeout(subT);
    window.removeEventListener('keydown', onKey, true); removeEventListener('resize', resize);
    audio.stop(); if (spoke) J.voice?.stop?.();
    document.body.classList.remove('cin-under');
    if (still) el.remove();
    else {   // przesłona zamyka się na Orbie pulpitu (rysowanie pod spodem już wróciło)
      setTimeout(() => cancelAnimationFrame(raf), 800);
      el.style.transition = ''; el.style.clipPath = 'circle(150% at ' + iris.x + 'px ' + iris.y + 'px)'; void el.offsetWidth;
      el.classList.add('closing'); el.style.transition = 'clip-path .8s cubic-bezier(.6,0,.35,1)'; el.style.clipPath = 'circle(0px at ' + iris.x + 'px ' + iris.y + 'px)';
      setTimeout(() => el.remove(), 850);
    }
    if (still) cancelAnimationFrame(raf);
    if (cur?.el === el) cur = null;
    try { prevFocus?.focus?.(); } catch (e) { /* element zniknął */ }
    J.emit('cinema', { open: false, id: runId });
  };

  el.focus();
  raf = requestAnimationFrame(frame);
  hud(); pump();
  J.emit('cinema', { open: true, id: runId, live, day });
  return { el, close, live, runId, seek, togglePause, get queue() { return q.length; }, get paused() { return paused; } };
};

const C = WF.cinema = {
  get active() { return !!cur; },
  get live() { return !!cur?.live; },
  get current() { return cur; },
  noAdapt: false, fps: 0,
  /* tryb propozycji dla scenariusza (workflow, day, telegram, cron, chat…): 'off' | 'ask' | 'auto' — ustawienia i wyłącznik modułu w js/film-scenarios.js;
     bez modułu (testy, stary pulpit) obowiązuje dawne ustawienie „Film workflow” */
  mode(id) { return J.state?.settings?.wfFilm || 'ask'; },
  /* otwiera film z dowolnego źródła (moduł scenariuszy): src = przebieg-podobny obiekt (kroki), evs = zdarzenia (film z zapisu) albo null (na żywo, wtedy o.feed) */
  openSource(src, evs, o = {}) {
    if (typeof document === 'undefined' || !document.body?.appendChild) return false;
    if (!J.booted) J.bootEnter?.();
    if (cur) cur.close();
    cur = mount(src, evs, o);
    return true;
  },
  /* otwiera projekcję przebiegu: na żywo, gdy trwa (chyba że o.film), inaczej film z zapisu zdarzeń */
  async open(runId, o = {}) {
    if (typeof document === 'undefined' || !document.body?.appendChild) return false;
    const base = WF.runs.get(runId);
    let snap = null, evs = null;
    try { snap = await api('/workflows/runs/' + encodeURIComponent(runId), { timeout: 8000 }); } catch (e) { /* most niedostępny — stan z karty */ }
    const src = snap ? { ...(base || {}), ...snap, inputs: snap.inputs || base?.inputs } : base;
    if (!src || !Array.isArray(src.steps)) { J.toast?.('Nie ma takiego przebiegu.', 3000); return false; }
    const live = !o.film && ACTIVE(src.state);
    if (!live) {
      try { evs = ((await api('/workflows/runs/' + encodeURIComponent(runId) + '?events=1', { timeout: 10000 })).events || []).filter(e => e.type !== 'run.snapshot' && e.type !== 'step.progress'); } catch (e) { evs = null; }
      if (!evs?.some(e => e.type === 'run.started')) evs = synth(src);
    }
    if (!J.booted) J.bootEnter?.();   // ekran startowy przykryłby film — wejście jak przy desktop_open
    if (cur) cur.close();
    cur = mount(src, live ? null : evs, o);
    return true;
  },
  /* Film dnia: dziś (albo date = RRRR-MM-DD) — przebiegi workflow, zadania Hermesa z dziennika mostu, Process Log, notatki */
  async openDay(date) {
    if (typeof document === 'undefined' || !document.body?.appendChild) return false;
    const d0 = date ? new Date(date + 'T00:00:00') : new Date(); d0.setHours(0, 0, 0, 0);
    const since = d0.getTime() / 1000, until = since + 86400;
    await WF.refresh?.();
    let tasks = []; try { tasks = (await api('/bridge/agent-history?since=' + Math.floor(since), { timeout: 8000 })).tasks || []; } catch (e) { /* most niedostępny — bez dziennika */ }
    const steps = dayScenes({ runs: WF.list, tasks, history: J.state.history || [], notes: J.state.notes || [] }, since, until);
    if (!steps.length) return false;
    const src = daySrc(steps, d0);
    if (!J.booted) J.bootEnter?.();
    if (cur) cur.close();
    cur = mount(src, synth(src), { day: true });
    return true;
  },
  /* propozycje w czacie: przy starcie przebiegu (ustawienie „Film workflow”) i gdy film jest gotowy */
  offer(r, when) {
    const mode = C.mode('workflow');
    if (mode === 'off' || !r || typeof document === 'undefined') return;
    const card = (text, opts, fn) => { r._filmCard?.remove?.(); r._filmCard = J.chat.quick?.(text, opts, v => { r._filmCard?.remove?.(); r._filmCard = null; fn(v); }) || null; };
    if (when === 'start') {
      if (mode === 'auto' && !cur && !document.hidden && (J.booted || !J.bootEnter)) { C.open(r.id); return; }
      // „włącz sam”, a pulpit stoi jeszcze na ekranie startowym (film schowałby się pod zasłoną) — tylko propozycja
      if (mode === 'ask' || mode === 'auto') card('🎬 Oglądać „' + r.name + '” na żywo jako film?', [{ label: '🎬 Oglądaj na żywo', value: 'go', primary: true }, { label: 'Nie teraz', value: 'no' }], v => { if (v === 'go') C.open(r.id); });
      return;
    }
    r._filmCard?.remove?.(); r._filmCard = null;
    if (r.state === 'stopped' || cur?.runId === r.id) return;
    card('🎬 Film z przebiegu „' + r.name + '” jest gotowy' + (r.state === 'done' ? '.' : ' — z awarią w roli głównej.'), [{ label: '🎬 Obejrzyj', value: 'go', primary: true }, { label: 'Później', value: 'no' }], v => { if (v === 'go') C.open(r.id, { film: true }); });
  },
  close() { cur?.close(); },
  _t: { roman, timecode, layout, holdMs, pace, filmLength, synth, credits, doneLine, doneSay, stateLine, firstSentence, ideaOf, projectName, prettyPath, unesc, isQuick, quickMap, chapterList, dayScenes, dayStats, daySrc, startLine, D }
};

/* ---------- polecenie „film dnia” i wieczorna propozycja ---------- */
R.add({ id: 'day_film', group: 'Workflow', label: 'Film dnia', idempotent: true, reads: ['workflows'],
  description: 'Film dnia: montaż tego, co Jarvis i Hermes zrobili dziś (workflow, zadania z Telegrama i harmonogramu, zadania na pulpicie, notatki) — na cały ekran, z lektorem i napisami końcowymi. Esc zamyka.',
  args: { type: 'object', properties: { date: { type: 'string', description: 'RRRR-MM-DD; domyślnie dziś' } } },
  examples: ['film dnia', 'pokaz film dnia', 'podsumuj dzien jako film', 'film z dzisiaj'],
  parse(raw, n) { return /^(?:pokaz\s+|odtworz\s+|wlacz\s+|pusc\s+)?film\s+(?:dnia|z\s+dzisiaj|z\s+dzisiejszego\s+dnia|z\s+calego\s+dnia)$|^(?:podsumuj\s+)?dzien\s+jako\s+film$/.test(n) ? { args: {}, score: 46 } : null; },
  async run({ date }) {
    if (typeof document === 'undefined' || !document.body?.appendChild) return fail('OFFLINE', 'Film dnia działa tylko na pulpicie Jarvis OS.');
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('INVALID_ARGS', 'Data w formacie RRRR-MM-DD.');
    try {
      return await C.openDay(date) ? ok({ date: date || null }, 'Film dnia — Esc zamyka.') : fail('NOT_FOUND', 'Tego dnia nic się jeszcze nie wydarzyło — nie ma czego pokazać.');
    } catch (e) { return fail('INTERNAL', e.message || String(e)); }
  } });
J.policy?.A3?.add('day_film');

const eveningCheck = () => {
  try {
    if (typeof document === 'undefined' || document.hidden || cur || !J.state?.settings) return;
    if (C.mode('day') === 'off') return;
    const now = new Date(); if (now.getHours() < 20) return;
    const ymd = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    if (J.state.ui?.dayFilm === ymd) return;
    const d0 = new Date(now); d0.setHours(0, 0, 0, 0); const since = d0.getTime() / 1000;
    const count = (J.state.history || []).filter(t => t.ts / 1000 >= since).length + WF.list.filter(r => (r.started || 0) >= since).length;
    if (count < 3) return;
    J.state.ui = { ...(J.state.ui || {}), dayFilm: ymd }; J.save?.();
    const c = J.chat.quick?.('🎬 Film dnia gotowy — ' + count + ' ' + J.pl(count, 'scena', 'sceny', 'scen') + ' z dzisiaj. Obejrzysz?', [{ label: '🎬 Obejrzyj', value: 'go', primary: true }, { label: 'Nie dziś', value: 'no' }], v => { c?.remove?.(); if (v === 'go') C.openDay(); });
  } catch (e) { /* propozycja jest dodatkiem */ }
};
if (typeof setInterval === 'function') { const t = setInterval(eveningCheck, 10 * 60e3); t?.unref?.(); const t2 = setTimeout(eveningCheck, 90e3); t2?.unref?.(); }
})();
