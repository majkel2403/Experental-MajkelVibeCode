#!/usr/bin/env node
// probe-main.mjs <Main.filled.dc.html>
// Headless engine/geometry probe for the Hermes map (no browser). Sweeps every scenario over time and checks
// invariants: finite numbers, stations/labels inside the map, label overlaps, route-vs-station collisions,
// monotone agent progress, packets concurrency, event sanity.
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
const Component = new Function('DCLogic', 'StreamableLogic', 'React', code + '\n;return Component;')(DCLogic, class {}, {});
// expose SCEN: re-evaluate the const by regex-free trick
const SCEN = new Function(code.slice(0, code.indexOf('const DUR')) + '\nreturn SCEN;')();
const problems = [];
const warn = (m) => problems.push('WARN  ' + m);
const bad = (m) => problems.push('ERROR ' + m);
const VW = 820, VH = 500;

function walkNums(obj, path, cb) {
  if (typeof obj === 'number') { cb(path, obj); return; }
  if (Array.isArray(obj)) { obj.forEach((v, i) => walkNums(v, path + '[' + i + ']', cb)); return; }
  if (obj && typeof obj === 'object') for (const k of Object.keys(obj)) walkNums(obj[k], path + '.' + k, cb);
  if (typeof obj === 'string' && /undefined|NaN|Infinity/.test(obj)) bad('string with undefined/NaN at ' + path + ': ' + obj.slice(0, 80));
}

for (const sc of SCEN) {
  const logic = new Component({});
  logic.state = { ...logic.state, sid: sc.id, sel: 'hermes', reportClosed: false, playing: false, started: true };
  let prevProg = {};
  let maxPackets = 0;
  let maxFeed = 0;
  const seenStations = new Set();
  for (let t = 0; t <= 60.001; t += 0.25) {
    logic.state = { ...logic.state, t };
    let v;
    try { v = logic.renderVals(); } catch (e) { bad(sc.id + ' t=' + t + ' renderVals threw: ' + e.message); break; }
    walkNums({ spokes: v.spokes, rails: v.rails, links: v.links, packets: v.packets, stations: v.stations, nodes: v.nodes, hub: v.hub, ganttRows: v.ganttRows, phaseSteps: v.phaseSteps }, '', (p, n) => { if (!Number.isFinite(n)) bad(sc.id + ' t=' + t + ' non-finite at ' + p); });
    maxPackets = Math.max(maxPackets, v.packets.length / 4);
    maxFeed = Math.max(maxFeed, v.feed.length);
    v.nodes.forEach((n) => {
      seenStations.add(n.id);
      if (n.left < 0 || n.left > 100 || n.top < 0 || n.top > 100) bad(sc.id + ' node ' + n.id + ' outside map: ' + n.left + ',' + n.top);
    });
    // label overlap at the end of spawn (all visible)
    if (Math.abs(t - 40) < 0.01) {
      const boxes = v.nodes.map((n) => {
        const cx = (n.left / 100) * VW, cy = (n.top / 100) * VH;
        const hub = n.id === 'hermes';
        // label block ≈ 92 x 34 viewBox units (at ~0.86 scale 80px) starting below the circle
        return { id: n.id, x1: cx - 48, x2: cx + 48, y1: cy + (hub ? 60 : 36), y2: cy + (hub ? 60 : 36) + 38 };
      });
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2) bad(sc.id + ' label overlap: ' + a.id + ' vs ' + b.id);
        if (a.y2 > VH + 2) bad(sc.id + ' label of ' + a.id + ' leaves the map bottom (' + a.y2.toFixed(0) + ' > ' + VH + ')');
      }
      const st = v.nodes.filter((n) => n.id !== 'hermes').map((n) => ({ id: n.id, x: (n.left / 100) * VW, y: (n.top / 100) * VH }));
      for (let i = 0; i < st.length; i++) for (let j = i + 1; j < st.length; j++) {
        const d = Math.hypot(st[i].x - st[j].x, st[i].y - st[j].y);
        if (d < 78) bad(sc.id + ' stations too close: ' + st[i].id + '/' + st[j].id + ' d=' + d.toFixed(0));
      }
      // link polylines vs stations (other than endpoints)
      v.links.forEach((l, li) => {
        const pts = l.points.split(' ').map((p) => p.split(',').map(Number));
        st.forEach((s) => {
          let min = 1e9;
          for (let k = 1; k < pts.length; k++) {
            const [x1, y1] = pts[k - 1], [x2, y2] = pts[k];
            const dx = x2 - x1, dy = y2 - y1;
            const L2 = dx * dx + dy * dy || 1;
            const u = Math.max(0, Math.min(1, ((s.x - x1) * dx + (s.y - y1) * dy) / L2));
            min = Math.min(min, Math.hypot(s.x - (x1 + u * dx), s.y - (y1 + u * dy)));
          }
          const endpoint = pts.some(([x, y]) => Math.hypot(x - s.x, y - s.y) < 2);
          if (!endpoint && min < 30) warn(sc.id + ' link #' + li + ' passes ' + min.toFixed(0) + 'u from station ' + s.id);
        });
      });
    }
    // monotone progress
    v.stations.forEach((s, i) => {
      const prog = parseFloat(s.prog);
      if (prevProg[i] != null && prog + 0.5 < prevProg[i]) bad(sc.id + ' station #' + i + ' progress decreased at t=' + t);
      prevProg[i] = prog;
    });
    if (t === 60) {
      if (v.stations.some((s) => !s.done)) bad(sc.id + ' not every station is done at t=60');
      if (!v.reportOpen) bad(sc.id + ' report not open at t=60');
      if (v.reportSections.length !== sc.report.sections.length) bad(sc.id + ' report sections not all visible at t=60');
    }
  }
  if (seenStations.size !== sc.agents.length + 1) bad(sc.id + ' not all agents became visible: ' + seenStations.size);
  console.log('scenario ' + sc.id + ': agents=' + sc.agents.length + ' events=' + sc.events.length + ' maxConcurrentPackets=' + maxPackets + ' maxFeed=' + maxFeed);
  if (maxPackets > 3) warn(sc.id + ' up to ' + maxPackets + ' packets in flight at once (busy)');
}
// click handlers don't throw
try {
  const logic = new Component({});
  logic.state = { ...logic.state, t: 36 };
  const v = logic.renderVals();
  v.chips[Math.min(1, v.chips.length - 1)].pick(); logic.renderVals();
  v.run(); const v2 = logic.renderVals();
  v2.togglePlay(); v2.restart(); v2.speeds[2].pick(); v2.onScrub({ target: { value: '555' } });
  const v3 = logic.renderVals();
  v3.nodes[1] && v3.nodes[1].pick();
  v3.closeReport(); v3.showReport();
  logic.renderVals();
  console.log('handlers ok');
} catch (e) { bad('handler threw: ' + e.stack.split('\n').slice(0, 3).join(' | ')); }

problems.forEach((p) => console.log(p));
const errs = problems.filter((p) => p.startsWith('ERROR')).length;
console.log(errs ? '\nFAIL: ' + errs + ' error(s)' : '\nOK: engine probe passed (' + problems.length + ' warning(s))');
process.exit(errs ? 1 : 0);
