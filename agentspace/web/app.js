// Hermes · Centrum dowodzenia (web). The interface is the shared template, logic and style of packages/ui — the same
// files the canvas boards embed. This file only connects them to the server: the run list (Event Store), the
// recorded events, LIVE following over WebSocket, and a few page options.
//   ?run=<id>   open a run     ?compat=1  draw only what real Gource can show (comparison harness)
//   ?chrome=0   scene only (no panels)
import { parseJsonl, validateEvent, createTimeline, runFacts, appState, matchTask, mmss, studioState, legendOf, cssRgb, narrate, lanesOf, runSummary } from '/packages/core/index.js';
import { createViewer } from '/packages/core/render/viewer.js';
import { markup } from '/packages/ui/hermes.markup.mjs';
import { mount } from '/web/dc-lite.js';

const params = new URLSearchParams(location.search);
const NAMES = { 'repo-fix': 'Naprawa repo', panel: 'Panel sprzedaży', medytacja: 'Premiera aplikacji', niemcy: 'Wejście do Niemiec' };
const ORDER = Object.keys(NAMES);
let list = [];
let key = '';
const subs = [];

async function refresh() {
  let rows;
  try { rows = await (await fetch('/api/runs')).json(); } catch { return; }
  const k = JSON.stringify(rows.map((r) => [r.run, r.status, r.title, r.source]));
  if (k === key) return;
  key = k;
  list = rows.sort((a, b) => {
    const ia = ORDER.indexOf(a.run); const ib = ORDER.indexOf(b.run);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return b.startedAt - a.startedAt;
  }).map((r) => ({ id: r.run, name: NAMES[r.run] || r.title || r.run, meta: r.source === 'demo' ? 'demo' : r.status === 'stale' && r.source === 'recorded' ? 'przerwany' : 'zapis', live: r.status === 'running' && r.source === 'recorded' }));
  subs.forEach((f) => f());
}
await refresh();

window.HX_HOST = {
  runs: () => list,
  initial: () => ({ id: params.get('run') || (list.find((r) => r.id === 'repo-fix') || list[0] || {}).id, intro: !params.get('run') }),
  onRuns: (cb) => subs.push(cb),
  async load(id) {
    const txt = await (await fetch('/api/runs/' + encodeURIComponent(id))).text();
    const u = new URL(location.href); u.searchParams.set('run', id); history.replaceState(null, '', u);
    return parseJsonl(txt).events;
  },
  live(id, cb) {
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/live?run=' + encodeURIComponent(id));
    let last = -Infinity;
    ws.onmessage = (m) => {
      let r; try { r = validateEvent(JSON.parse(m.data)); } catch { return; }
      if (!r.ok || r.event.ts < last) return;
      last = r.event.ts; cb(r.event);
    };
    return () => ws.close();
  },
};

if (params.get('compat') === '1' || params.get('chrome') === '0') {
  // scene only: the canvases fill the page, no interface
  document.getElementById('app').innerHTML = '<canvas id="gl" style="position:fixed;inset:0;width:100%;height:100%"></canvas><canvas id="ov" style="position:fixed;inset:0;width:100%;height:100%"></canvas>';
  const v = createViewer({ gl: document.getElementById('gl'), overlay: document.getElementById('ov'), compat: params.get('compat') === '1', studio: params.get('compat') === '1' ? false : undefined, autoRotate: true, caption: params.get('compat') !== '1' });
  window.__NW = v;
  const id = HX_HOST.initial().id;
  const T = createTimeline(await HX_HOST.load(id));
  v.setTimeline(T); v.setTime(0); v.play();
} else {
  window.NW = { parseJsonl, createTimeline, createViewer, app: { runFacts, appState, matchTask, mmss, studioState, legendOf, cssRgb, narrate, lanesOf, runSummary } };
  const src = await (await fetch('/packages/ui/hermes.logic.js')).text();
  const Logic = new Function('NW', 'HX_HOST', 'DCLogic', src + '\nreturn Component;');
  mount(document.getElementById('app'), markup('height:100%'), (Base) => Logic(window.NW, window.HX_HOST, Base));
  setInterval(refresh, 5000);
  // Space plays / pauses, Escape closes the inspector
  window.addEventListener('keydown', (e) => {
    if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName) || e.target.closest('button')) return;
    if (e.code === 'Space') { e.preventDefault(); document.querySelector('[aria-label="Wstrzymaj"],[aria-label="Odtwórz"]').click(); }
    if (e.key === 'Escape' && window.__NW) window.__NW.select(null);
  });
}
