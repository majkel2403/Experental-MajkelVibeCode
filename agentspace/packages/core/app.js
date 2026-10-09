import { gHex, gUserColour } from "./gource/colour.js";
// The Hermes app model, shared by the web app and the canvas boards: what the panels show at time t, read from
// the event log (phases, readouts, process log, conversations, files, final report) and matching a typed order
// to the closest recorded run. Pure functions; the views only lay them out.

export const TONES = {
  assign: ['zlecenie', '#F2C14E'], question: ['pytanie', '#7CC4FF'], answer: ['odpowiedź', '#D6BEFF'], handoff: ['przekazanie', '#D6BEFF'],
  critique: ['krytyka', '#FF8F9A'], revision: ['poprawka', '#FFB48A'], approve: ['akceptacja', '#34D3BE'], result: ['wynik', '#FFE7A8'], brief: ['brief', '#E8ECF8'],
};
// keywords that match a typed order to a recorded run (the demo has no live model behind it)
export const RUN_KEYWORDS = {
  'repo-fix': ['repo', 'napraw', 'blad', 'bug', 'socket', 'test', 'kod', 'reconnect', 'rozlacz', 'heartbeat', 'github', 'commit'],
  panel: ['panel', 'csv', 'dashboard', 'wykres', 'sprzeda', 'sklep', 'zamowie', 'alert', 'mvp', 'kpi'],
  medytacja: ['medyt', 'aplikac', 'rodzic', 'dziec', 'premier', 'kampan', 'komunikat', 'pozycjon', 'marketing'],
  niemcy: ['niem', 'rynek', ' de', 'kosmetyk', 'e-sklep', 'ekspansj', 'go/no-go', 'amazon', 'vat', 'berlin'],
};

const normText = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
export const isBad = (type) => type.indexOf('fail') >= 0 || type === 'error';
export const isGood = (type) => type.indexOf('passed') >= 0 || type.indexOf('completed') >= 0;
export const eventColour = (type) => (isBad(type) ? '#FF5A6A' : isGood(type) ? '#7CFF9A' : type === 'agent.spawned' ? '#F2C14E' : type === 'message.sent' ? '#D6BEFF' : type.indexOf('file.') === 0 || type === 'workspace.scanned' ? '#9FE3FF' : '#2A3560');
export const mmss = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const eventText = (e) => e.text || e.resource || e.command || e.tool || e.name || '';
const WRITE = /^file\.(created|modified|deleted)$|^resource\.written$/;

// the run id whose keywords best match a typed order, or null
export function matchTask(text, ids) {
  const x = ' ' + normText(text) + ' ';
  let best = null; let bs = 0;
  for (const id of ids) {
    let s = 0;
    for (const k of RUN_KEYWORDS[id] || []) if (x.indexOf(k) >= 0) s++;
    if (s > bs) { bs = s; best = id; }
  }
  return best;
}

// facts that do not depend on time: the phases (the plan, or the run's own milestones) and the order
export function runFacts(T) {
  const ev = T.events;
  const rel = T.rel;
  const plan = ev.filter((e) => e.type === 'planner.step' && Array.isArray(e.steps)).pop();
  let phases;
  if (plan) {
    phases = plan.steps.map((name, k) => {
      const i = ev.findIndex((e) => Number(e.step) === k);
      return { name, start: i >= 0 ? rel[i] : null };
    });
    phases.forEach((p, k) => { if (p.start == null) p.start = k ? phases[k - 1].start : 0; });
  } else {
    const at = (pred, d) => { const i = ev.findIndex(pred); return i >= 0 ? rel[i] : d; };
    const firstSpawn = at((e) => e.type === 'agent.spawned', 0);
    const spawns = ev.map((e, i) => (e.type === 'agent.spawned' ? rel[i] : -1)).filter((x) => x >= 0);
    const lastSpawn = spawns.length ? spawns[spawns.length - 1] : firstSpawn;
    const firstResult = at((e) => e.type === 'result.returned', T.duration * 0.85);
    phases = [{ name: 'Analiza', start: 0 }, { name: 'Skład zespołu', start: firstSpawn }, { name: 'Współpraca', start: lastSpawn }, { name: 'Dostawa', start: Math.max(lastSpawn, firstResult) }];
  }
  phases.forEach((p, k) => { p.end = k + 1 < phases.length ? Math.max(p.start, phases[k + 1].start) : T.duration; });
  const started = ev.find((e) => e.type === 'task.started');
  return { phases, title: started ? started.text || '' : '', by: started && started.user ? started.user : '' };
}

// everything the panels show at time t (ms): label(id) names agents, actions are the player's action stream
export function appState(T, facts, t, label, actions) {
  const ev = T.events;
  const idx = T.indexAt(t);
  const upto = ev.slice(0, idx + 1);
  const done = upto.some((e) => e.type === 'task.completed');
  const failed = upto.some((e) => e.type === 'task.failed');
  const phases = facts.phases.map((p, k) => {
    const fill = t >= p.end ? 100 : t <= p.start ? 0 : Math.round(((t - p.start) / Math.max(1, p.end - p.start)) * 100);
    const cur = t >= p.start && t < p.end;
    const num = String(k + 1).padStart(2, '0');
    return { num, name: p.name, cur, fill, label: cur ? num + ' ' + p.name : num, colour: cur ? '#F2C14E' : fill >= 100 ? '#C5CEE8' : '#5C6894' };
  });
  const spawned = upto.filter((e) => e.type === 'agent.spawned').length;
  const spawnedAll = ev.filter((e) => e.type === 'agent.spawned').length;
  const touched = new Set(upto.filter((e) => WRITE.test(e.type)).map((e) => e.resource)).size;
  const msgs = upto.filter((e) => e.type === 'message.sent').length;
  const tp = upto.filter((e) => e.type === 'test.passed').length;
  const tf = upto.filter((e) => e.type === 'test.failed').length;
  const kpis = [
    { label: 'agenci', value: spawned + ' / ' + spawnedAll, colour: '#E8ECF8' },
    { label: 'pliki', value: String(touched), colour: '#E8ECF8' },
    { label: 'wiadomości', value: String(msgs), colour: '#E8ECF8' },
  ];
  if (ev.some((e) => e.type.indexOf('test.') === 0)) kpis.push({ label: 'testy', value: tp + ' ✓ ' + tf + ' ✗', colour: tf && !done ? '#FF8F9A' : '#8CFFB4' });

  const log = [];
  for (let i = idx; i >= 0 && log.length < 120; i--) {
    const e = ev[i];
    log.push({ i, time: mmss(T.rel[i]), type: e.type, who: e.agent ? label(e.agent) : '', text: eventText(e), colour: eventColour(e.type) });
  }
  const talk = [];
  for (let i = idx; i >= 0 && talk.length < 80; i--) {
    const e = ev[i];
    if (e.type !== 'message.sent') continue;
    const tn = TONES[e.tone] || ['wiadomość', '#A3AED0'];
    talk.push({ i, time: mmss(T.rel[i]), from: label(e.agent || 'hermes'), to: e.to === 'user' ? (facts.by || 'Zlecający') : label(e.to || 'hermes'), tone: tn[0], colour: tn[1], text: e.text || '' });
  }
  const byEv = new Map();
  for (const a of actions) if (!byEv.has(a.ev)) byEv.set(a.ev, a.path);
  const seen = new Map();
  for (let i = 0; i <= idx; i++) {
    const e = ev[i];
    if (!WRITE.test(e.type)) continue;
    const res = String(e.resource || '');
    const lines = (x) => String(x).split('\n');
    const add = e.content != null ? lines(e.content).length : e.patch != null ? lines(e.patch).filter((l) => l[0] === '+').length : 0;
    const del = e.patch != null ? lines(e.patch).filter((l) => l[0] === '-').length : 0;
    seen.set(res, {
      i, time: mmss(T.rel[i]), name: res.split('/').pop(), dir: res.split('/').slice(0, -1).join('/') || '/', who: label(e.agent || 'hermes'),
      kind: e.type === 'file.created' ? 'nowy' : e.type === 'file.deleted' ? 'usunięty' : 'zmiana',
      colour: e.type === 'file.created' ? '#7CFF9A' : e.type === 'file.deleted' ? '#FF5A6A' : '#FFB48A',
      diff: add || del ? '+' + add + (del ? ' −' + del : '') : '', id: byEv.has(i) ? 'file:' + byEv.get(i) : null,
    });
  }
  const files = [...seen.values()].sort((a, b) => b.i - a.i);

  const doc = done ? [...upto].reverse().find((e) => e.type === 'file.created' && e.content && /\.md$/i.test(String(e.resource || ''))) : null;
  const completed = upto.find((e) => e.type === 'task.completed');
  const report = {
    status: failed ? 'Przebieg zakończony błędem' : 'Zadanie wykonane', title: facts.title, summary: completed ? completed.text || '' : '',
    kpis: [{ label: 'czas', value: mmss(T.duration) }, { label: 'agenci', value: String(spawnedAll) }, { label: 'pliki', value: String(touched) }, { label: 'wiadomości', value: String(msgs) }],
    doc: doc ? String(doc.content) : '', docPath: doc ? String(doc.resource || '') : '',
    results: upto.filter((e) => e.type === 'result.returned').map((e) => ({ who: label(e.agent || 'hermes'), text: e.text || '' })),
  };
  return { idx, done, failed, phases, kpis, log, talk, files, report };
}

// ---- the studio panels (team, plan, code, terminal) and the scene legend, from the story (story.js) and the frame
const CODE_KW = new Set('const let var function return if else for while do switch case break continue new this class extends import export from default async await try catch finally throw typeof instanceof in of null undefined true false private public protected readonly static interface type void describe it expect before after beforeEach afterEach'.split(' '));
export const CODE_COLOURS = { kw: '#C9A2FF', str: '#B8E986', com: '#7F8BB3', num: '#FFAD7A', fn: '#7FD3FF', code: '#D9E1F2', head: '#F2C14E' };
export const cssRgb = (c, a) => (c ? 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ',' + (a == null ? 1 : a) + ')' : '#A3AED0');

// a code line as coloured tokens (JS/TS-like; markdown headings)
export function codeTokens(s, md) {
  const K = CODE_COLOURS;
  if (md) return [{ s, c: /^#/.test(s) ? K.head : K.code }];
  const out = [];
  const re = /(\/\/.*$)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)/g;
  let last = 0; let m;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ s: s.slice(last, m.index), c: K.code });
    const c = m[1] ? K.com : m[2] ? K.str : m[3] ? K.num : m[4] ? (CODE_KW.has(m[4]) ? K.kw : K.fn) : CODE_KW.has(m[5]) ? K.kw : K.code;
    out.push({ s: m[0], c });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ s: s.slice(last), c: K.code });
  return out;
}

const AGENT_STATUS = {
  done: ['gotowe', '#8CFFB4'], fail: ['błąd', '#FF8F9A'], wait: ['czeka', '#FFC979'], work: ['pracuje', '#8CFFB4'],
};

// St: storyAt(...) at the viewer's time; o.reduce: no typing (prefers-reduced-motion), o.maxLines: editor lines
export function studioState(St, o) {
  o = o || {};
  if (!St) return { brief: null, team: [], plan: null, code: null, term: null };
  const names = new Map(St.agents.map((a) => [a.id, a.label]));
  const name = (id) => names.get(id) || id;
  const team = St.agents.map((a) => {
    const st = a.status === 'idle' ? [a.id === 'hermes' ? 'koordynuje' : 'wolny', '#7F8BB3'] : AGENT_STATUS[a.status] || ['', '#7F8BB3'];
    return {
      id: a.id, name: a.label, role: a.role || '', depth: a.depth || 0, colour: cssRgb(a.col), task: a.task || '',
      status: a.status === 'work' && a.tool ? a.tool : st[0], statusColour: st[1], state: a.status, working: a.status === 'work', fresh: a.age != null && a.age < 2.4,
    };
  });
  let plan = null;
  if (St.plan) {
    const cur = St.plan.cur;
    plan = { total: St.plan.steps.length, done: Math.min(cur, St.plan.steps.length), steps: St.plan.steps.map((text, k) => ({ n: String(k + 1).padStart(2, '0'), text, state: k < cur ? 'done' : k === cur ? 'cur' : 'todo' })) };
  }
  let code = null;
  const w = St.lastCode;
  if (w) {
    const md = /\.md$/i.test(w.file);
    let budget = o.reduce ? Infinity : w.typed;
    const lines = [];
    for (const l of w.lines) {
      if (l.t === '+') {
        if (budget <= 0) break;
        const take = Math.min(l.s.length, budget);
        lines.push({ n: l.n == null ? '' : String(l.n), sign: '+', kind: 'add', tokens: codeTokens(l.s.slice(0, take), md), caret: take < l.s.length || budget - l.s.length - 1 <= 0 });
        budget -= l.s.length + 1;
      } else lines.push({ n: l.n == null ? '' : String(l.n), sign: l.t === '-' ? '−' : ' ', kind: l.t === '-' ? 'del' : 'ctx', tokens: codeTokens(l.s, md), caret: false });
    }
    const typing = w.typing && !o.reduce;
    lines.forEach((l, k) => { l.caret = typing && k === lines.length - 1; });
    const max = o.maxLines || 40;
    code = { file: w.file, path: w.full, who: name(w.who), created: w.created, add: w.add, del: w.del, typing, lines: lines.slice(-max) };
  }
  let term = null;
  const tw = St.lastTerm;
  if (tw) {
    const typed = o.reduce ? tw.command.length : tw.typed;
    term = { who: name(tw.who), tool: tw.tool, command: tw.command.slice(0, typed), typing: !o.reduce && typed < tw.command.length, running: tw.end == null, fail: !!tw.fail,
      lines: tw.lines.slice(-14).map((l) => ({ s: l.s, bad: !!l.bad })) };
  }
  return { brief: St.brief, team, plan, code, term };
}

// the file-extension key of the frame as chips (the app shows it as HTML; the canvas Gource key is off)
export function legendOf(F, max) {
  if (!F || !F.key) return [];
  return F.key.slice().sort((a, b) => a.row - b.row).slice(0, max || 6).map((k) => ({ ext: k.ext ? '.' + k.ext : 'inne', n: String(k.n), colour: cssRgb(k.col) }));
}

// ---- the story in words: what just happened, as one sentence, and who did what when (swimlanes)
const lineCount = (x) => String(x).split('\n').length;
// ev: an event; label(id): display name. -> { whoId, who, verb, obj, extra, colour }
export function narrate(ev, label) {
  const whoId = ev.agent || 'hermes';
  const who = ev.agent ? label(ev.agent) : 'Hermes';
  const file = String(ev.resource || '').split('/').pop();
  const diff = ev.content != null ? '+' + lineCount(ev.content) : ev.patch != null ? '+' + String(ev.patch).split('\n').filter((l) => l[0] === '+').length + ' −' + String(ev.patch).split('\n').filter((l) => l[0] === '-').length : '';
  const o = (verb, obj, extra, colour) => ({ whoId, who, verb, obj: obj || '', extra: extra || '', colour: colour || '#E8ECF8' });
  switch (ev.type) {
    case 'task.started': return o('przyjmuje zlecenie', '', ev.text, '#F2C14E');
    case 'planner.step': return o('planuje', '', ev.text, '#F2C14E');
    case 'hermes.reasoning': return o('myśli', '', ev.text, '#C5CEE8');
    case 'agent.spawned': return o('tworzy agenta', ev.label || label(ev.agent), ev.text, '#F2C14E');
    case 'agent.completed': return o('kończy pracę', '', ev.text, '#8CFFB4');
    case 'agent.failed': return o('zawodzi', '', ev.text, '#FF8F9A');
    case 'agent.waiting': return o('czeka', '', ev.text, '#FFC979');
    case 'message.sent': {
      const to = ev.to === 'user' ? 'zlecającego' : label(ev.to || 'hermes');
      const t = TONES[ev.tone] || ['wiadomość', '#A3AED0'];
      return o(ev.tone === 'assign' ? 'zleca ' + to : ev.tone === 'approve' ? 'akceptuje u ' + to : '→ ' + to, '', ev.task || ev.text, t[1]);
    }
    case 'file.created': return o('tworzy', file, diff, '#7CFF9A');
    case 'file.modified': case 'resource.written': return o('zmienia', file, diff, '#FFB48A');
    case 'file.deleted': return o('usuwa', file, '', '#FF5A6A');
    case 'file.read': case 'resource.read': return o('czyta', file, '', '#7CC4FF');
    case 'workspace.scanned': return o('skanuje przestrzeń roboczą', '', ev.text, '#7CC4FF');
    case 'tool.started': return o('uruchamia', ev.tool || '', ev.command, '#C5CEE8');
    case 'tool.completed': return o('kończy', ev.tool || '', '', '#8CFFB4');
    case 'tool.failed': return o('ma błąd w', ev.tool || '', ev.text, '#FF8F9A');
    case 'test.started': return o('uruchamia testy', '', ev.text, '#C5CEE8');
    case 'test.passed': return o('testy przechodzą', '', ev.text, '#8CFFB4');
    case 'test.failed': return o('testy nie przechodzą', '', ev.text, '#FF8F9A');
    case 'result.returned': return o('zwraca wynik', '', ev.text, '#FFE7A8');
    case 'task.completed': return o('kończy zadanie', '', ev.text, '#8CFFB4');
    case 'task.failed': return o('przerywa zadanie', '', ev.text, '#FF8F9A');
    default: return o(ev.type, file, ev.text || ev.tool || '', eventColour(ev.type));
  }
}

const markKind = (e) => (isBad(e.type) ? 'bad' : isGood(e.type) ? 'good' : e.type === 'message.sent' ? 'talk' : e.type.indexOf('file.') === 0 || e.type === 'resource.written' ? 'file' : e.type.indexOf('tool.') === 0 ? 'tool' : 'x');
// one lane per agent: when it lived (spawn..completion) and its events, for the timeline
export function lanesOf(T, label) {
  const order = []; const map = new Map();
  const lane = (id) => {
    if (!map.has(id)) { const l = { id, name: label(id), colour: gHex(gUserColour(label(id))), from: null, to: null, marks: [] }; map.set(id, l); order.push(l); }
    return map.get(id);
  };
  lane('hermes');
  T.events.forEach((e, i) => {
    const id = e.agent || 'hermes';
    if (id === 'user') return;
    const l = lane(id); const t = T.rel[i];
    if (e.type === 'agent.spawned') l.from = t;
    if (e.type === 'agent.completed') l.to = t;
    l.marks.push({ t, k: markKind(e) });
  });
  for (const l of order) {
    if (l.from == null) l.from = l.marks.length ? l.marks[0].t : 0;
    if (l.to == null) l.to = l.id === 'hermes' ? T.duration : l.marks.length ? l.marks[l.marks.length - 1].t : T.duration;
    l.name = label(l.id);
  }
  return order;
}

// a run at a glance, for the run cards: length, team, files, messages
export function runSummary(T) {
  const ev = T.events;
  const files = new Set(ev.filter((e) => WRITE.test(e.type)).map((e) => e.resource));
  const agents = ev.filter((e) => e.type === 'agent.spawned').length;
  const started = ev.find((e) => e.type === 'task.started');
  return { dur: T.duration, agents, files: files.size, msgs: ev.filter((e) => e.type === 'message.sent').length, title: started ? started.text || '' : '' };
}
