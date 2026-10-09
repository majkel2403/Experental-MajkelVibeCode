// The studio layer: what the team is doing at time t, read only from the event log (no simulation state), so
// it scrubs exactly like the scene. Who created which agent, the plan, task assignments, conversations, code being
// written into files (from the recorded content / patch) and commands in a terminal (from the recorded output).
// Typing is paced for reading; the text itself is exactly what the producer recorded.
//   storyAt(T, info, tMs) -> { brief, agents, plan, spawns, packets, bubbles, windows, tags, lastCode, lastTerm }
//   info: { label(id), colour(id), pathsOfEv(i) -> tree paths the event touched }

export const STORY = {
  BUBBLE_CPS: 42, BUBBLE_HOLD: 2.6, BUBBLE_FADE: 0.5,
  PACKET: 0.9, SPAWN: 2.4, TAG: 3.5,
  CODE_CPS: 55, CODE_MAX: 7, WIN_HOLD: 3.2, WIN_FADE: 0.6, MAX_WINDOWS: 2,
  CMD_CPS: 26,
};

const typeTime = (n, cps, max) => Math.max(0.5, Math.min(max || 99, n / Math.max(cps, n / (max || 99))));

// patch text -> lines { t: '+' | '-' | ' ', s, n (line number in the new file, or null) }
export function patchLines(patch, start) {
  const out = [];
  let n = Number.isFinite(Number(start)) ? Number(start) : 1;
  for (const raw of String(patch).replace(/\r/g, '').split('\n')) {
    if (raw.startsWith('@@')) continue;
    const t = raw[0] === '+' || raw[0] === '-' ? raw[0] : ' ';
    const s = raw[0] === '+' || raw[0] === '-' || raw[0] === ' ' ? raw.slice(1) : raw;
    out.push({ t, s, n: t === '-' ? null : n });
    if (t !== '-') n++;
  }
  while (out.length && out[out.length - 1].t === ' ' && !out[out.length - 1].s.trim()) out.pop();
  return out;
}

export function storyAt(T, info, tMs) {
  const t = tMs / 1000;
  const upto = T.indexAt(tMs);
  const S = { brief: null, agents: [], plan: null, spawns: [], packets: [], bubbles: [], windows: [], tags: [], done: false, lastCode: null, lastTerm: null };
  const ag = new Map();
  const agent = (id) => {
    if (!ag.has(id)) ag.set(id, { id, label: info.label(id), parent: id === 'hermes' ? null : 'hermes', role: id === 'hermes' ? 'orkiestrator' : '', spawnT: null, status: 'idle', tool: '', task: '', taskT: -1, statusT: 0 });
    return ag.get(id);
  };
  agent('hermes').spawnT = 0;
  const bubbles = new Map();
  const terms = new Map();
  const wins = [];
  const seenDirs = new Set();
  let steps = null; let step = -1;
  for (let i = 0; i <= upto; i++) {
    const ev = T.events[i];
    const et = T.rel[i] / 1000;
    const age = t - et;
    const who = ev.agent || 'hermes';
    if (ev.step != null) step = Math.max(step, Number(ev.step));
    switch (ev.type) {
      case 'task.started': S.brief = { text: ev.text || '', by: ev.user || 'Użytkownik' }; break;
      case 'planner.step':
        if (Array.isArray(ev.steps)) steps = ev.steps;
        bubbles.set('hermes', { who: 'hermes', text: ev.text || '', t0: et, kind: 'think' });
        break;
      case 'hermes.reasoning': bubbles.set('hermes', { who: 'hermes', text: ev.text || '', t0: et, kind: 'think' }); break;
      case 'agent.spawned': {
        const a = agent(ev.agent);
        a.label = ev.label || a.label; a.parent = ev.parent || 'hermes'; a.role = ev.text || ''; a.spawnT = et; a.status = 'idle'; a.statusT = et;
        agent(a.parent);
        if (age < STORY.SPAWN) S.spawns.push({ parent: a.parent, child: a.id, age, label: a.label, role: a.role });
        break;
      }
      case 'agent.waiting': agent(who).status = 'wait'; agent(who).statusT = et; break;
      case 'agent.completed': agent(who).status = 'done'; agent(who).statusT = et; break;
      case 'agent.failed': agent(who).status = 'fail'; agent(who).statusT = et; break;
      case 'tool.started': {
        const a = agent(who); a.status = 'work'; a.tool = ev.tool || ''; a.statusT = et;
        if (ev.command) terms.set(who, { kind: 'term', who, tool: ev.tool || '', command: ev.command, t0: et, lines: [], end: null, fail: false });
        break;
      }
      case 'tool.completed': case 'tool.failed': {
        const a = agent(who); a.status = ev.type === 'tool.failed' ? 'fail' : 'idle'; a.statusT = et;
        const w = terms.get(who);
        if (w && w.end == null) { if (ev.output) pushOut(w, ev.output, et, ev.type === 'tool.failed'); w.end = et; w.fail = w.fail || ev.type === 'tool.failed'; }
        break;
      }
      case 'test.started': case 'test.passed': case 'test.failed': {
        const w = terms.get(who);
        if (w && w.end == null && ev.output) pushOut(w, ev.output, et, ev.type === 'test.failed');
        if (w && ev.type === 'test.failed') w.fail = true;
        break;
      }
      case 'message.sent': {
        const to = ev.to === 'user' ? 'user' : ev.to || 'hermes';
        if (ev.tone === 'assign' && to !== 'user') { const r = agent(to); r.task = ev.task || short(ev.text, 60); r.taskT = et; }
        if (age < STORY.PACKET) S.packets.push({ from: who, to, tone: ev.tone || '', age, task: ev.tone === 'assign' ? (ev.task || '') : '' });
        bubbles.set(who, { who, to, text: ev.text || '', t0: et, kind: 'say', tone: ev.tone || '' });
        break;
      }
      case 'file.created': case 'file.modified': case 'resource.written': {
        const path = info.pathsOfEv(i)[0];
        const fresh = path && !seenDirs.has(dirOf(path));
        if (ev.content != null || ev.patch != null) {
          const lines = ev.patch != null ? patchLines(ev.patch, ev.line) : String(ev.content).replace(/\r/g, '').split('\n').map((s, k) => ({ t: '+', s, n: k + 1 }));
          const chars = lines.reduce((n, l) => n + (l.t === '+' ? l.s.length + 1 : 0), 0);
          const dur = typeTime(chars, STORY.CODE_CPS, STORY.CODE_MAX);
          wins.push({ kind: 'code', who, path, file: String(ev.resource || '').split('/').pop(), full: ev.resource || '', created: ev.type === 'file.created', lines, chars, t0: et, dur, end: et + dur,
            add: lines.filter((l) => l.t === '+').length, del: lines.filter((l) => l.t === '-').length });
        }
        if (fresh && ev.type === 'file.created' && age < STORY.TAG) S.tags.push({ path, text: '+ folder ' + dirOf(String(ev.resource || '')), age });
        break;
      }
      case 'task.completed': S.done = true; agent('hermes').status = 'done'; break;
      default: break;
    }
    // every directory seen so far (to spot new folders)
    for (const p of info.pathsOfEv(i)) seenDirs.add(dirOf(p));
  }
  // team (tree order: each agent after its parent, in order of creation)
  const list = [...ag.values()].filter((a) => a.id !== 'user' && a.spawnT != null && a.spawnT <= t);
  const kids = (pid) => list.filter((a) => a.parent === pid).sort((x, y) => x.spawnT - y.spawnT);
  const walk = (a, depth) => { a.depth = depth; a.age = t - a.spawnT; a.col = info.colour(a.id); S.agents.push(a); for (const k of kids(a.id)) walk(k, depth + 1); };
  const root = ag.get('hermes');
  walk(root, 0);
  for (const a of list) if (!S.agents.includes(a)) walk(a, 1);
  if (steps) S.plan = { steps, cur: S.done ? steps.length : Math.max(0, step) };
  // speech and thought bubbles: typed, held, then faded
  for (const b of bubbles.values()) {
    const age = t - b.t0;
    const tt = typeTime(b.text.length, STORY.BUBBLE_CPS, 3);
    const a = 1 - Math.max(0, Math.min(1, (age - tt - STORY.BUBBLE_HOLD) / STORY.BUBBLE_FADE));
    if (a <= 0 || !b.text) continue;
    S.bubbles.push(Object.assign({}, b, { age, shown: Math.min(b.text.length, Math.floor(b.text.length * Math.min(1, age / tt))), a: Math.min(1, age / 0.25) * a }));
  }
  // windows: code being written and terminals; the newest stay, older ones fade out
  for (const w of terms.values()) wins.push(Object.assign(w, { dur: typeTime(w.command.length, STORY.CMD_CPS, 2.5) }));
  wins.sort((a, b) => a.t0 - b.t0);
  // the newest code and terminal windows, kept after they fade from the scene (the app's Code panel shows them)
  const progress = (w) => {
    const age = t - w.t0; const p = Math.max(0, Math.min(1, age / w.dur));
    return Object.assign({}, w, { age, typed: w.kind === 'code' ? Math.floor(w.chars * p) : Math.floor(w.command.length * p), typing: p < 1, lines: w.kind === 'term' ? w.lines.filter((l) => l.t <= t) : w.lines });
  };
  for (let k = wins.length - 1; k >= 0 && (!S.lastCode || !S.lastTerm); k--) {
    if (wins[k].kind === 'code' && !S.lastCode) S.lastCode = progress(wins[k]);
    if (wins[k].kind === 'term' && !S.lastTerm) S.lastTerm = progress(wins[k]);
  }
  const live = wins.filter((w) => {
    const stop = w.kind === 'term' ? (w.end == null ? Infinity : w.end) : w.end;
    return t - stop < STORY.WIN_HOLD + STORY.WIN_FADE;
  });
  const shown = live.slice(-STORY.MAX_WINDOWS);
  for (const w of shown) {
    const age = t - w.t0;
    const stop = w.kind === 'term' ? (w.end == null ? Infinity : w.end) : w.end;
    const fade = 1 - Math.max(0, Math.min(1, (t - stop - STORY.WIN_HOLD) / STORY.WIN_FADE));
    const p = Math.max(0, Math.min(1, age / w.dur));
    S.windows.push(Object.assign({}, w, { age, a: Math.min(1, age / 0.3) * fade, typed: w.kind === 'code' ? Math.floor(w.chars * p) : Math.floor(w.command.length * p), typing: p < 1, lines: w.kind === 'term' ? w.lines.filter((l) => l.t <= t) : w.lines }));
  }
  return S;
}

function pushOut(w, text, t, bad) {
  for (const s of String(text).replace(/\r/g, '').split('\n')) w.lines.push({ s, t, bad: bad && /fail|✗|error|błąd|×/i.test(s) });
}
const dirOf = (p) => { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i + 1); };
const short = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
