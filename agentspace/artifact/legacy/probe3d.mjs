#!/usr/bin/env node
// probe3d.mjs <Main.dc.html>
// Headless probe of the 3D scene model + renderer + cockpit data (no browser).
// Checks: finite coordinates, node separation, files/decisions all placed, every canvas call gets finite numbers,
// scrub-determinism (same t -> identical draw calls), inspector data for file/decision/report selections.
import fs from 'node:fs';

const file = process.argv[2];
const text = fs.readFileSync(file, 'utf8');
const sm = /<script type="text\/x-dc" data-dc-script([^>]*)>([\s\S]*?)<\/script>/.exec(text);
const code = sm[2];
class DCLogic {
  constructor(p) { this.props = p || {}; this.state = {}; }
  setState(p) { const n = typeof p === 'function' ? p(this.state) : p; this.state = { ...this.state, ...n }; }
  componentDidMount() {} componentWillUnmount() {}
}
globalThis.window = globalThis;
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};
const api = new Function('DCLogic', 'StreamableLogic', 'React', code + '\n;return { Component, SCEN, prep3d, draw3d, posAt, curves, bornAt, DUR, REPORT3D_AT };')(DCLogic, class {}, {});
const { Component, SCEN, prep3d, draw3d, posAt, curves, bornAt, DUR } = api;
const problems = [];
const bad = (m) => problems.push('ERROR ' + m);
const warn = (m) => problems.push('WARN  ' + m);

// ---- recording 2D context: every numeric argument must be finite
function makeCtx(log) {
  let calls = 0;
  const state = {};
  const check = (name, args) => {
    calls++;
    for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) { bad('non-finite arg to ctx.' + name + ': ' + args.join(',')); return; }
    if (log) log.push(name + ':' + args.map((a) => (typeof a === 'number' ? Math.round(a * 100) / 100 : typeof a === 'string' ? a.slice(0, 24) : '')).join(','));
  };
  const grad = { addColorStop(o, c) { if (!Number.isFinite(o)) bad('gradient stop offset ' + o); if (typeof c !== 'string' || /NaN|undefined/.test(c)) bad('gradient colour ' + c); } };
  return new Proxy({}, {
    get(_, k) {
      if (k === '__calls') return () => calls;
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6.5 });
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return (...a) => { check(k, a); return grad; };
      if (k in state) return state[k];
      return (...a) => check(String(k), a);
    },
    set(_, k, v) {
      if ((k === 'fillStyle' || k === 'strokeStyle' || k === 'shadowColor') && typeof v === 'string' && /NaN|undefined|Infinity/.test(v)) bad('bad ' + k + ' = ' + v);
      if ((k === 'lineWidth' || k === 'globalAlpha' || k === 'lineDashOffset' || k === 'shadowBlur') && typeof v === 'number' && !Number.isFinite(v)) bad('bad ' + k + ' = ' + v);
      if (k === 'lineWidth' && typeof v === 'number' && v < 0) bad('negative lineWidth ' + v);
      state[k] = v; return true;
    },
  });
}

const cam = () => ({ yaw: 0.97, pitch: 0.42, dyaw: 0, dpitch: 0, dist: 380, zoom: 1, zoomT: 1, tx: 0, ty: 0, tz: 0 });

for (const sc of SCEN) {
  const m = prep3d(sc);
  const attachNames = new Set(sc.events.filter((e) => e.attach).map((e) => e.attach));
  // --- model
  m.nodes.forEach((n) => { ['x', 'y', 'z'].forEach((c) => { if (!Number.isFinite(n[c])) bad(sc.id + ' node ' + n.id + ' has non-finite ' + c); }); });
  const files = m.nodes.filter((n) => n.kind === 'file');
  const decs = m.nodes.filter((n) => n.kind === 'decision');
  const agents = m.nodes.filter((n) => n.kind === 'agent');
  if (files.length !== attachNames.size) bad(sc.id + ' files nodes ' + files.length + ' != distinct attachments ' + attachNames.size);
  if (decs.length !== (sc.decisions || []).length) bad(sc.id + ' decision nodes ' + decs.length + ' != ' + (sc.decisions || []).length);
  if (agents.length !== sc.agents.length) bad(sc.id + ' agent nodes ' + agents.length + ' != ' + sc.agents.length);
  attachNames.forEach((nm) => { if (!files.find((f) => f.file.name === nm)) bad(sc.id + ' attachment without file node: ' + nm); });
  files.forEach((f) => { if (!f.file.summary || !f.file.preview || !f.file.preview.length) bad(sc.id + ' file ' + f.file.name + ' lacks summary/preview'); });
  // separation over time (all nodes that exist at that moment), plus finite positions and curves
  let minD = 1e9; let minPair = '';
  for (let t = 0; t <= 60.001; t += 1.5) {
    posAt(m, t, t * 1.3); curves(m);
    for (let i = 0; i < m.nodes.length; i++) {
      for (const c of [0, 1, 2]) if (!Number.isFinite(m.P[i * 3 + c])) bad(sc.id + ' non-finite position node ' + m.nodes[i].id + ' t=' + t);
    }
    for (let i = 0; i < m.nodes.length; i++) for (let j = i + 1; j < m.nodes.length; j++) {
      const A = m.nodes[i]; const Bn = m.nodes[j];
      if (t < Math.max(A.spawn, Bn.spawn) + 2) continue;
      if ((A.kind === 'file' && A.of === Bn.i) || (Bn.kind === 'file' && Bn.of === A.i)) continue; // moon and its planet
      const d = Math.hypot(m.P[i * 3] - m.P[j * 3], m.P[i * 3 + 1] - m.P[j * 3 + 1], m.P[i * 3 + 2] - m.P[j * 3 + 2]);
      if (d < minD) { minD = d; minPair = A.id + '~' + Bn.id + '@' + t; }
    }
  }
  if (minD < 9) warn(sc.id + ' nodes ' + minPair + ' only ' + minD.toFixed(1) + 'u apart');
  posAt(m, 33, 2); curves(m);
  m.edges.forEach((e) => { for (let i = 0; i < e.pts.length; i++) if (!Number.isFinite(e.pts[i])) { bad(sc.id + ' edge ' + e.i + ' non-finite sample'); break; } });
  m.ev.forEach((e) => { if (e.edge < 0 && !e.toUser && e.from !== 0 && e.to !== 0) warn(sc.id + ' event #' + e.i + ' (' + e.kind + ') has no synapse path'); });

  // --- renderer sweep
  const sizes = [[1392, 1010, { l: 354, r: 1008, t: 150, b: 760 }], [640, 540, null], [380, 520, null]];
  let maxCalls = 0;
  for (const [W, H, safe] of sizes) {
    for (let t = 0; t <= DUR + 0.001; t += 0.5) {
      const ctx = makeCtx();
      let picks;
      try {
        picks = draw3d(ctx, W, H, { m, t, fx: t * 1.3, q: t % 3 < 1 ? 2 : t % 3 < 2 ? 1 : 0, rm: false, cam: cam(), dpr: 1, sel: t > 30 ? 'hermes' : null, hover: null, safe });
      } catch (e) { bad(sc.id + ' draw3d threw at t=' + t + ' ' + W + 'x' + H + ': ' + e.message); break; }
      picks.forEach((p) => { if (![p.x, p.y, p.r].every(Number.isFinite)) bad(sc.id + ' non-finite pick ' + p.id); });
      maxCalls = Math.max(maxCalls, ctx.__calls());
      if (t === 40) {
        const ids = new Set(picks.map((p) => p.id));
        if (!ids.has('hermes')) bad(sc.id + ' hermes not pickable at t=40');
        agents.forEach((a) => { if (!ids.has(a.id)) bad(sc.id + ' agent ' + a.id + ' not pickable at t=40'); });
      }
    }
  }
  // reduced motion + selected nodes of every kind
  const selIds = ['hermes', 'report'].concat(files.slice(0, 2).map((f) => f.id), decs.slice(0, 2).map((d) => d.id), agents.slice(0, 1).map((a) => a.id));
  selIds.forEach((id) => {
    try { draw3d(makeCtx(), 1392, 1010, { m, t: 55, fx: 3, q: 2, rm: true, cam: cam(), dpr: 1, sel: id, hover: id, safe: { l: 354, r: 1008, t: 150, b: 760 } }); } catch (e) { bad(sc.id + ' draw3d threw for sel ' + id + ': ' + e.message); }
  });
  // determinism: two draws at the same t give the same call log
  const la = []; const lb = [];
  const c1 = cam(); const c2 = cam();
  draw3d(makeCtx(la), 1000, 700, { m, t: 33.3, fx: 7, q: 2, rm: false, cam: c1, dpr: 1, sel: null, hover: null, safe: null });
  draw3d(makeCtx(lb), 1000, 700, { m, t: 33.3, fx: 7, q: 2, rm: false, cam: c2, dpr: 1, sel: null, hover: null, safe: null });
  if (la.join('|') !== lb.join('|')) bad(sc.id + ' draw3d is not deterministic for equal inputs');

  // --- cockpit data per selection kind
  const logic = new Component({});
  const sweepSel = [['hermes', 'hermes'], ['report', 'report']]
    .concat(files.map((f) => [f.id, 'file']), decs.map((d) => [d.id, 'decision']), agents.map((a) => [a.id, 'agent']));
  for (const [id, kind] of sweepSel) {
    for (const t of [0, 5, 12, 25, 38, 46, 52, 60]) {
      logic.state = { ...logic.state, sid: sc.id, sel: id, t, reportClosed: true, started: true, playing: false, tab: 'files', anTab: -1, view: '3d' };
      let v;
      try { v = logic.renderVals(); } catch (e) { bad(sc.id + ' renderVals threw sel=' + id + ' t=' + t + ': ' + e.message); continue; }
      const flags = [v.isHermes, v.isAgent, v.isFile, v.isDecision, v.isReportSel].filter(Boolean).length;
      if (flags !== 1) bad(sc.id + ' sel=' + id + ' t=' + t + ' inspector flags exclusive violated (' + flags + ')');
      const node = m.nodes[m.idx[id]];
      const shown = id === 'hermes' ? true : t >= bornAt(node);
      if (shown && id !== 'hermes') {
        const want = kind;
        const got = v.isFile ? 'file' : v.isDecision ? 'decision' : v.isReportSel ? 'report' : v.isAgent ? 'agent' : 'hermes';
        if (want !== got) bad(sc.id + ' sel=' + id + ' t=' + t + ' expected inspector ' + want + ' got ' + got);
      }
      if (v.isFile && (!v.fi.name || !v.fi.preview.length)) bad(sc.id + ' file inspector empty for ' + id);
      if (v.isDecision && (!v.di.title || !v.di.agents.length)) bad(sc.id + ' decision inspector empty for ' + id);
      const nf = v.fileRows.length;
      const nd = v.decRows.length;
      const expF = files.filter((f) => t >= bornAt(f)).length;
      const expD = decs.filter((d) => t >= bornAt(d)).length;
      if (nf !== expF) bad(sc.id + ' t=' + t + ' fileRows ' + nf + ' != ' + expF);
      if (nd !== expD) bad(sc.id + ' t=' + t + ' decRows ' + nd + ' != ' + expD);
      if (v.agentChips.length !== 1 + agents.filter((a) => t >= a.spawn).length) bad(sc.id + ' t=' + t + ' agentChips count');
      if (v.anTabs.length !== 3) bad('anTabs count');
      const str = JSON.stringify({ stats: v.stats, tabs: v.tabs.map((x) => [x.label, x.count]), anItems: v.anItems });
      if (/NaN|undefined/.test(str)) bad(sc.id + ' t=' + t + ' NaN/undefined in cockpit data: ' + str.slice(0, 120));
    }
  }
  // handlers
  logic.state = { ...logic.state, sid: sc.id, sel: 'hermes', t: 45, reportClosed: true, tab: 'feed' };
  let v = logic.renderVals();
  try {
    v.agentChips[1].pick(); v.agentChips[1].hov(); v.agentChips[1].unhov();
    v.tabs[1].pick(); logic.renderVals().fileRows[0].pick(); logic.renderVals().tabs[2].pick(); logic.renderVals().decRows[0].pick();
    v = logic.renderVals(); v.anTabs[2].pick(); v.setViewFlat(); v.setView3d(); v.toggleOrbit(); v.zoomIn(); v.zoomOut(); v.resetCam();
    logic.renderVals();
  } catch (e) { bad(sc.id + ' cockpit handler threw: ' + e.stack.split('\n').slice(0, 3).join(' | ')); }
  console.log('scenario ' + sc.id + ': nodes=' + m.nodes.length + ' edges=' + m.edges.length + ' files=' + files.length + ' decisions=' + decs.length + ' minSeparation=' + minD.toFixed(1) + 'u maxCanvasCalls/frame=' + maxCalls);
}

problems.forEach((p) => console.log(p));
const errs = problems.filter((p) => p.startsWith('ERROR')).length;
console.log(errs ? '\nFAIL: ' + errs + ' error(s)' : '\nOK: 3D probe passed (' + problems.length + ' warning(s))');
process.exit(errs ? 1 : 0);
