// Workflow events -> Gource-style actions (who touched which path, how) and avatar notes.
// One stream feeds both our simulation and the adapter that writes a log for the real Gource,
// so a side-by-side comparison shows the same history.
//
//   action: { t (s, relative to the run start), user (agent id), path ('/run/...'), kind, ev (event index) }
//   kind:   A create · M modify · D delete (as in Gource) · R read · P test passed · F test failed
//   note:   { t, kind: 'tool'|'tool-end'|'tool-fail'|'msg'|'done'|'fail'|'error', user, to?, text?, tone? }

export const ACTION_COLOUR = {
  A: [0, 1, 0],
  M: [1, 0.7, 0.3],
  D: [1, 0, 0],
  R: [0.35, 0.65, 1],
  P: [0.45, 1, 0.55],
  F: [1, 0.22, 0.25],
};
export const ACTION_LABEL = { A: 'utworzenie', M: 'zmiana', D: 'usunięcie', R: 'odczyt', P: 'test zaliczony', F: 'test nieudany' };
export const TONE_COLOUR = { assign: [0.95, 0.76, 0.31], question: [0.49, 0.77, 1], answer: [0.84, 0.75, 1], critique: [1, 0.56, 0.64], revision: [1, 0.71, 0.54], approve: [0.2, 0.83, 0.75], handoff: [0.84, 0.75, 1], result: [1, 0.91, 0.66], brief: [0.91, 0.93, 0.97] };

const clean = (s) => String(s).replace(/[|\r\n]+/g, ' ').trim();
const seg = (s) => clean(s).replace(/\s+/g, '_').replace(/\/+/g, '-') || '_';
const rel = (p) => clean(p).replace(/\\/g, '/').replace(/^\.?\/+/, '').replace(/\/{2,}/g, '/');

// resource -> path inside the run's workspace tree
export function resourcePath(res, ws) {
  const s = clean(res);
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)([^?#]*)(?:\?[^#]*)?(#.*)?$/i.exec(s);
  if (m) {
    let rest = rel(m[3] || '');
    if (m[4]) rest += (rest ? '_' : '') + m[4].slice(1);
    return 'web/' + m[2].toLowerCase() + '/' + (rest || 'index');
  }
  return (ws || 'projekt') + '/' + rel(s);
}

export function createActionStream() {
  const S = {
    actions: [],
    notes: [],
    users: { hermes: { id: 'hermes', label: 'Hermes' } },
    ws: 'projekt',
    seen: new Set(),
    t0: null,
  };
  const label = (id) => (S.users[id] ? S.users[id].label : id);
  const userOf = (id) => {
    if (!S.users[id]) S.users[id] = { id, label: id.charAt(0).toUpperCase() + id.slice(1) };
    return id;
  };
  let run = 'run';
  const full = (p) => '/' + seg(run) + '/' + p;
  const act = (t, user, path, kind, ev) => {
    const p = full(path);
    let k = kind;
    // a write to a path nobody has seen yet is a creation (Gource draws it green)
    if (k === 'M' && !S.seen.has(p)) k = 'A';
    S.seen.add(p);
    S.actions.push({ t, user: userOf(user), path: p, kind: k, ev });
  };
  const note = (t, kind, user, o, ev) => S.notes.push(Object.assign({ t, kind, user: userOf(user), ev }, o || {}));

  // push(event, tSeconds, eventIndex)
  S.push = (ev, t, i) => {
    run = ev.run || run;
    const a = ev.agent || 'hermes';
    switch (ev.type) {
      case 'task.started': {
        const who = 'user';
        S.users.user = { id: 'user', label: ev.user || 'Użytkownik' };
        act(t, who, 'zadanie/opis.md', 'A', i);
        break;
      }
      case 'hermes.reasoning': act(t, 'hermes', 'hermes/rozumowanie.md', 'M', i); break;
      case 'planner.step': act(t, 'hermes', 'hermes/plan.md', 'M', i); break;
      case 'agent.spawned':
        S.users[ev.agent] = { id: ev.agent, label: ev.label || label(ev.agent), parent: ev.parent || 'hermes' };
        act(t, ev.parent || 'hermes', 'zespol/' + seg(ev.agent) + '.md', 'A', i);
        note(t, 'spawn', ev.agent, { parent: ev.parent || 'hermes' }, i);
        break;
      case 'agent.waiting': break;
      case 'agent.completed': note(t, 'done', a, null, i); break;
      case 'agent.failed': note(t, 'fail', a, { text: ev.text }, i); break;
      case 'tool.started': note(t, 'tool', a, { text: ev.tool }, i); break;
      case 'tool.completed': note(t, 'tool-end', a, { text: ev.tool }, i); break;
      case 'tool.failed': note(t, 'tool-fail', a, { text: ev.tool }, i); break;
      case 'workspace.scanned': {
        S.ws = seg(ev.resource || ev.root || S.ws);
        for (const p of ev.paths || []) act(t, a, S.ws + '/' + rel(p), 'S', i);
        break;
      }
      case 'resource.read':
      case 'file.read': act(t, a, resourcePath(ev.resource, S.ws), 'R', i); break;
      case 'file.created': act(t, a, resourcePath(ev.resource, S.ws), 'A', i); break;
      case 'resource.written':
      case 'file.modified': act(t, a, resourcePath(ev.resource, S.ws), 'M', i); break;
      case 'file.deleted': {
        const p = resourcePath(ev.resource, S.ws);
        if (S.seen.has(full(p))) act(t, a, p, 'D', i);
        break;
      }
      case 'memory.read': act(t, a, 'pamięć/' + rel(ev.resource || 'kontekst'), 'R', i); break;
      case 'memory.write': act(t, a, 'pamięć/' + rel(ev.resource || 'kontekst'), 'M', i); break;
      case 'gateway.call': act(t, a, 'mcp/' + seg(ev.name) + '/' + rel(ev.resource || 'wywołanie'), 'M', i); break;
      case 'test.started': act(t, a, 'testy/' + seg(ev.name), 'R', i); break;
      case 'test.passed': act(t, a, 'testy/' + seg(ev.name), 'P', i); break;
      case 'test.failed': act(t, a, 'testy/' + seg(ev.name), 'F', i); break;
      case 'message.sent': note(t, 'msg', a, { to: ev.to === 'user' ? 'user' : ev.to || 'hermes', tone: ev.tone, text: ev.text }, i); break;
      case 'result.returned': act(t, a, 'wyniki/' + seg(a) + '.md', 'M', i); break;
      case 'task.completed': act(t, 'hermes', 'wynik/raport.md', 'M', i); break;
      case 'task.failed': act(t, 'hermes', 'wynik/raport.md', 'F', i); break;
      case 'error': note(t, 'error', a, { text: ev.text }, i); break;
      default: break;
    }
  };
  S.label = label;
  S.parent = (id) => (S.users[id] ? S.users[id].parent || null : null);
  return S;
}

// Lines for the real Gource (`gource --log-format custom`): timestamp|user|A/M/D|path
// Our extra kinds map to M (Gource has no read / test result). No colour column, so Gource colours files
// by extension exactly like we do. Gource timestamps are whole seconds, so time is scaled by `scale`
// (play with --seconds-per-day 86400/scale for 1 s of run time = 1 s on screen).
export function toGourceLog(stream, t0Unix, scale = 100) {
  const out = [];
  for (const a of stream.actions) {
    const kind = a.kind === 'A' || a.kind === 'D' ? a.kind : 'M';
    out.push(Math.round(t0Unix + a.t * scale) + '|' + clean(stream.label(a.user)) + '|' + kind + '|' + a.path);
  }
  return out;
}
