// What did this file or this agent do, up to time t (seconds)? Shared by the web app and the artifact.
import { ACTION_LABEL } from './actions.js';

const evText = (ev) => ev.text || ev.resource || ev.tool || ev.name || '';

export function inspect(player, T, id, t) {
  if (!id || !T) return null;
  const acts = player.actions();
  const upto = T.indexAt(t * 1000);
  if (id.startsWith('file:')) {
    const path = id.slice(5);
    const mine = acts.filter((a) => a.path === path && a.ev <= upto);
    const seen = new Set();
    const events = [];
    for (let k = mine.length - 1; k >= 0 && events.length < 12; k--) {
      const a = mine[k];
      if (seen.has(a.ev)) continue;
      seen.add(a.ev);
      const ev = T.events[a.ev];
      events.push({ i: a.ev, rel: T.rel[a.ev], type: ev.type, who: player.label(a.user), kind: a.kind, text: evText(ev) });
    }
    const by = {};
    for (const a of mine) by[player.label(a.user)] = (by[player.label(a.user)] || 0) + 1;
    const last = mine[mine.length - 1];
    return {
      kind: 'file', label: path.split('/').pop(), sub: path.split('/').slice(2).join('/'),
      status: last ? ACTION_LABEL[last.kind] : '—',
      stats: [['akcje', String(mine.length)], ['kto', Object.keys(by).map((k) => k + ' ' + by[k]).join(', ') || '—']],
      events,
    };
  }
  if (id.startsWith('user:')) {
    const uid = id.slice(5);
    const mine = acts.filter((a) => a.user === uid && a.ev <= upto);
    const kinds = {};
    const files = new Set();
    for (const a of mine) { kinds[a.kind] = (kinds[a.kind] || 0) + 1; files.add(a.path); }
    const evs = [];
    const tools = new Set();
    let tokens = 0;
    for (let i = 0; i <= upto; i++) {
      const ev = T.events[i];
      const who = ev.agent || (ev.type.startsWith('hermes') || ev.type.startsWith('planner') || ev.type.startsWith('task') ? 'hermes' : ev.type === 'task.started' ? 'user' : '');
      if (who !== uid && !(uid === 'user' && ev.type === 'task.started')) continue;
      if (ev.tool) tools.add(ev.tool);
      if (ev.tokens) tokens += Number(ev.tokens) || 0;
      evs.push(i);
    }
    const lastEv = evs.length ? T.events[evs[evs.length - 1]] : null;
    return {
      kind: 'user', label: player.label(uid), sub: uid === 'hermes' ? 'orkiestrator' : uid === 'user' ? 'zlecający' : 'agent',
      status: lastEv ? lastEv.type : '—',
      stats: [
        ['akcje', Object.keys(kinds).map((k) => ACTION_LABEL[k] + ' ' + kinds[k]).join(', ') || '—'],
        ['pliki', String(files.size)],
        ['narzędzia', [...tools].join(', ') || '—'],
        ['tokeny', tokens ? tokens.toLocaleString('pl-PL') : '—'],
      ],
      events: evs.slice(-12).reverse().map((i) => ({ i, rel: T.rel[i], type: T.events[i].type, who: '', kind: '', text: evText(T.events[i]) })),
    };
  }
  return null;
}
