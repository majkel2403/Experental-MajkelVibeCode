// ---------------------------------------------------------------------- galaxy layout: parallel orbit lanes
// Hermes is the star in the centre. Each working line (R/C/Q/D) is one orbit lane: a ring in its own plane; all lane
// planes are PARALLEL (same tilt) and stacked a few units apart. Agents ride their lane (inner lanes are faster),
// files are moons orbiting their author, decisions float at the centroid of the agents that took them.
// Everything is a pure function of scene time t (plus a tiny ambient drift from fx), so scrubbing stays consistent.
const LANE_BASE = 70;
const LANE_STEP = 28;
const LANE_DY = 15;
const LANE_TILT = 0.14;
const NEAR = 60;
const SCENE_R = 176;
const laneR = (li) => LANE_BASE + LANE_STEP * li;
const laneW = (li) => 0.3 * Math.pow(LANE_BASE / laneR(li), 1.5);
const laneY = (li) => LANE_DY * (1.5 - li);
const LT_C = Math.cos(LANE_TILT);
const LT_S = Math.sin(LANE_TILT);
// point on lane li at angle th (radius scaled by k)
function lanePt(li, th, k, out) {
  const r = laneR(li) * k;
  const zz = Math.sin(th) * r;
  out[0] = Math.cos(th) * r;
  out[1] = laneY(li) + zz * LT_S;
  out[2] = zz * LT_C;
  return out;
}

const P3 = {};
function prep3d(sc) {
  if (P3[sc.id]) return P3[sc.id];
  const B = prep(sc);
  const rnd = mulberry(hashStr(sc.id));
  const nodes = [];
  const idx = {};
  const add = (nd) => { nd.i = nodes.length; idx[nd.id] = nd.i; nd.x = 0; nd.y = 0; nd.z = 0; nd.light = mixHex(nd.color, '#FFFFFF', 0.55); nodes.push(nd); return nd; };
  const unit3 = () => { const u = rnd() * 2 - 1; const a = rnd() * 6.2832; const s = Math.sqrt(1 - u * u); return [s * Math.cos(a), u, s * Math.sin(a)]; };
  (sc.decisions || []).forEach((d) => { d.files = d.files || []; d.agents = d.agents || []; });

  add({ id: 'hermes', kind: 'hermes', spawn: 0, r: 24, color: GOLD, label: 'Hermes' });
  const lanes = B.order.map((letter, li) => ({ letter, li, color: NEON[letter], r: laneR(li), w: laneW(li), y: laneY(li), first: 1e9 }));
  const perLane = {};
  B.agents.forEach((a) => { (perLane[a.line] = perLane[a.line] || []).push(a); });
  B.agents.forEach((a) => {
    const li = Math.max(0, B.order.indexOf(a.line));
    const grp = perLane[a.line];
    add({ id: a.id, kind: 'agent', spawn: a.spawn, r: 12, color: NEON[a.line], line: a.line, label: a.short, a, lane: li, th0: (grp.indexOf(a) / grp.length) * 6.2832 + li * 1.7 + rnd() * 0.7, th: 0 });
    if (lanes[li]) lanes[li].first = Math.min(lanes[li].first, a.spawn);
  });

  // project files: the first attachment of a name (in time order) is the moment the file is born
  const defs = {};
  (sc.files || []).forEach((f) => { defs[f.name] = Object.assign({}, f, { t: null, to: [] }); });
  const fileList = [];
  B.ev.forEach((e) => {
    if (!e.attach) return;
    let d = defs[e.attach];
    if (!d) d = defs[e.attach] = { name: e.attach, kind: e.attach.split('.').pop(), owner: e.from, ver: '', from: [], summary: '', preview: [], t: null, to: [] };
    if (d.t == null) { d.t = e.t; d.to = []; fileList.push(d); }
    if (d.to.indexOf(e.to) < 0) d.to.push(e.to);
  });
  const moons = {};
  fileList.forEach((d) => {
    const oi = idx[d.owner] != null ? idx[d.owner] : 0;
    const k = (moons[oi] = (moons[oi] || 0) + 1);
    const u1 = unit3();
    const tmp = unit3();
    let u2 = [u1[1] * tmp[2] - u1[2] * tmp[1], u1[2] * tmp[0] - u1[0] * tmp[2], u1[0] * tmp[1] - u1[1] * tmp[0]];
    const l2 = Math.hypot(u2[0], u2[1], u2[2]) || 1;
    u2 = [u2[0] / l2, u2[1] / l2, u2[2] / l2];
    add({ id: 'f:' + d.name, kind: 'file', spawn: d.t - 1.1, born: d.t, r: d.ver === 'final' ? 8.5 : 7, color: FILE_COL[d.kind] || '#9FE3FF', label: d.name, file: d, of: oi, fr: 19 + 3.5 * ((k - 1) % 4), fph: rnd() * 6.2832, fw: (0.9 + rnd() * 0.8) * (rnd() < 0.5 ? -1 : 1), u1, u2 });
  });
  const decSlots = {};
  (sc.decisions || []).forEach((d) => {
    const key = d.agents.slice().sort().join('|');
    const slot = (decSlots[key] = (decSlots[key] == null ? 0 : decSlots[key] + 1));
    add({ id: 'd:' + d.id, kind: 'decision', spawn: d.t, born: d.t, r: 5.5, color: DEC_COL, label: d.title, dec: d, dph: rnd() * 6.2832, slot });
  });
  const rep = add({ id: 'report', kind: 'report', spawn: REPORT3D_AT - 0.8, born: REPORT3D_AT - 0.8, r: 14, color: REPORT_COL, label: 'Raport' });

  const edges = [];
  const conv = {};
  const mk = (a, b, kind, appear, o) => {
    const e = Object.assign({ i: edges.length, a, b, kind, appear, w: 1, base: 0.25, color: nodes[a].color, color2: nodes[b].color }, o || {});
    e.rv = unit3();
    e.bu = (kind === 'author' || kind === 'deliver' ? 0.1 : 0.14) + rnd() * 0.12;
    edges.push(e);
    return e;
  };
  B.agents.forEach((a) => {
    const e = mk(0, idx[a.id], 'spoke', a.spawn - 0.3, { w: 1.0, base: 0.2, color: GOLD, color2: NEON[a.line] });
    conv[ukey('hermes', a.id)] = e.i;
  });
  sc.links.forEach((l) => {
    const k = ukey(l.from, l.to);
    if (conv[k] != null || idx[l.from] == null || idx[l.to] == null) return;
    const e = mk(idx[l.from], idx[l.to], 'link', Math.max(B.byId[l.from].spawn, B.byId[l.to].spawn) + 0.2, { w: 1.5, base: 0.36 });
    conv[k] = e.i;
  });
  fileList.forEach((d) => {
    const fn = nodes[idx['f:' + d.name]];
    const ow = nodes[fn.of];
    mk(ow.i, fn.i, 'author', fn.spawn, { w: 0.8, base: 0.34, color: ow.color, color2: fn.color });
    d.to.forEach((to) => {
      if (to === 'user' || idx[to] == null) return;
      mk(fn.i, idx[to], 'deliver', d.t, { w: 0.8, base: 0.24, color: fn.color, color2: nodes[idx[to]].color });
    });
    (d.from || []).forEach((nm) => {
      const s = idx['f:' + nm];
      if (s == null) return;
      mk(s, fn.i, 'lineage', fn.spawn + 0.2, { w: 0.8, base: 0.3, color: nodes[s].color, color2: fn.color });
    });
  });
  nodes.filter((nd) => nd.kind === 'decision').forEach((dn) => {
    dn.dec.agents.forEach((id) => { if (idx[id] != null) mk(dn.i, idx[id], 'decision', dn.spawn, { w: 0.8, base: 0.34, color: DEC_COL, color2: nodes[idx[id]].color }); });
    // a decision can only wire to a file once that file exists
    dn.dec.files.forEach((nm) => { const s = idx['f:' + nm]; if (s != null) mk(dn.i, s, 'decision', Math.max(dn.spawn + 0.15, nodes[s].spawn + 0.25), { w: 0.7, base: 0.26, color: DEC_COL, color2: nodes[s].color }); });
  });
  mk(0, rep.i, 'report', REPORT3D_AT, { w: 1.7, base: 0.5, color: GOLD, color2: REPORT_COL });
  let ri = 0;
  fileList.forEach((d) => {
    if (d.to.indexOf('hermes') < 0 && d.ver !== 'final') return;
    const fn = nodes[idx['f:' + d.name]];
    mk(fn.i, rep.i, 'report', REPORT3D_AT + 0.3 + ri * 0.35, { w: 1.0, base: 0.4, color: fn.color, color2: REPORT_COL });
    ri++;
  });
  B.ev.forEach((e) => {
    if (e.to === 'user' || e.from === 'user') return;
    const k = ukey(e.from, e.to);
    if (conv[k] != null || idx[e.from] == null || idx[e.to] == null) return;
    const e2 = mk(idx[e.from], idx[e.to], 'chat', e.t - 0.1, { w: 1.1, base: 0.25 });
    conv[k] = e2.i;
  });
  edges.forEach((e) => {
    e.n = SAMPLES;
    e.pts = new Float32Array(SAMPLES * 3);
    e.sx = new Float32Array(SAMPLES);
    e.sy = new Float32Array(SAMPLES);
    e.zc = 0; e.km = 1; e.up = 2; e.g = 0;
  });

  // dendrites: short glowing filaments that make a node look like a neuron
  nodes.forEach((nd) => {
    nd.dend = [];
    if (nd.kind !== 'agent' && nd.kind !== 'hermes' && nd.kind !== 'report') return;
    const cnt = nd.kind === 'hermes' ? 12 : nd.kind === 'report' ? 8 : 6;
    for (let k = 0; k < cnt; k++) {
      const d = unit3();
      const L = nd.r * 1.15 + 7 + rnd() * 13;
      const w = unit3();
      const pts = new Float32Array(12);
      for (let s = 0; s < 4; s++) {
        const u = s / 3;
        const wig = Math.sin(u * 3.1416) * 2.4;
        pts[s * 3] = d[0] * L * u + w[0] * wig;
        pts[s * 3 + 1] = d[1] * L * u + w[1] * wig;
        pts[s * 3 + 2] = d[2] * L * u + w[2] * wig;
      }
      nd.dend.push({ pts, ph: rnd() * 6.28 });
    }
  });

  // conversation events mapped onto synapse paths
  const ev = B.ev.map((e, i) => {
    const k = e.to === 'user' || e.from === 'user' ? null : ukey(e.from, e.to);
    const ei = k && conv[k] != null ? conv[k] : -1;
    const burst = new Float32Array(30);
    for (let q = 0; q < 10; q++) { const u = unit3(); burst[q * 3] = u[0]; burst[q * 3 + 1] = u[1]; burst[q * 3 + 2] = u[2]; }
    return { i, t: e.t, from: idx[e.from], to: e.to === 'user' ? -1 : idx[e.to], kind: e.kind, text: e.text, attach: e.attach || '', edge: ei, dir: ei >= 0 ? (edges[ei].a === idx[e.from] ? 1 : -1) : 1, carry: e.attach && idx['f:' + e.attach] != null ? idx['f:' + e.attach] : -1, burst, toUser: e.to === 'user' };
  });
  const edgeEv = edges.map(() => []);
  ev.forEach((e) => { if (e.edge >= 0) edgeEv[e.edge].push(e); });

  const out = { nodes, edges, idx, ev, edgeEv, base: B, fileList, lanes, P: new Float32Array(nodes.length * 3), counts: { files: fileList.length, decisions: (sc.decisions || []).length } };
  P3[sc.id] = out;
  return out;
}

// the moment a node counts as "there" for the cockpit lists (files are crystals a moment before their first attachment)
const bornAt = (n) => (n.born != null ? n.born : n.spawn);

// world positions of every node at scene time t -> m.P (3 floats per node); node order guarantees parents come first
const TV = [0, 0, 0];
function posAt(m, t, fx) {
  const N = m.nodes;
  const P = m.P;
  for (let i = 0; i < N.length; i++) {
    const n = N[i];
    let x = 0;
    let y = 0;
    let z = 0;
    if (n.kind === 'agent') {
      const age = Math.max(0, t - n.spawn);
      const e = age < 1.6 ? 1 - ease(age / 1.6) : 0;
      const th = n.th0 + laneW(n.lane) * t + fx * 0.01 + e * 2.2;
      lanePt(n.lane, th, 1 + 1.6 * e * e, TV);
      n.th = th;
      x = TV[0]; y = TV[1]; z = TV[2];
    } else if (n.kind === 'file') {
      const b = ease(clamp((t - n.spawn) / 1.1, 0, 1));
      const ph = n.fph + n.fw * Math.max(0, t - n.spawn) + fx * 0.12 * (n.fw > 0 ? 1 : -1);
      const c = Math.cos(ph) * n.fr * b;
      const s = Math.sin(ph) * n.fr * b;
      const o = n.of * 3;
      x = P[o] + n.u1[0] * c + n.u2[0] * s;
      y = P[o + 1] + n.u1[1] * c + n.u2[1] * s;
      z = P[o + 2] + n.u1[2] * c + n.u2[2] * s;
    } else if (n.kind === 'decision') {
      const ag = n.dec.agents;
      let k = 0;
      for (let a = 0; a < ag.length; a++) {
        const j = m.idx[ag[a]];
        if (j == null) continue;
        x += P[j * 3]; y += P[j * 3 + 1]; z += P[j * 3 + 2]; k++;
      }
      if (k) { x /= k; y /= k; z /= k; }
      const u = fx * 0.4 + n.dph + n.slot * 2.1;
      x += Math.cos(u) * 9; z += Math.sin(u) * 9; y += 24 + n.slot * 12 + Math.sin(u * 1.3) * 3;
    } else if (n.kind === 'report') {
      y = 56 + Math.sin(fx * 0.7) * 1.5;
    }
    P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
  }
  return P;
}

// synapse paths: quadratic bezier between the current node positions with a deterministic sideways bulge
function curves(m) {
  const P = m.P;
  const E = m.edges;
  for (let ei = 0; ei < E.length; ei++) {
    const e = E[ei];
    const a = e.a * 3;
    const b = e.b * 3;
    const dx = P[b] - P[a];
    const dy = P[b + 1] - P[a + 1];
    const dz = P[b + 2] - P[a + 2];
    const len = Math.hypot(dx, dy, dz) + 0.01;
    const rv = e.rv;
    let px = dy * rv[2] - dz * rv[1];
    let py = dz * rv[0] - dx * rv[2];
    let pz = dx * rv[1] - dy * rv[0];
    const pl = Math.hypot(px, py, pz) + 0.01;
    const bl = (len * e.bu) / pl;
    px *= bl; py *= bl; pz *= bl;
    const cx = (P[a] + P[b]) / 2 + px;
    const cy = (P[a + 1] + P[b + 1]) / 2 + py;
    const cz = (P[a + 2] + P[b + 2]) / 2 + pz;
    const pts = e.pts;
    for (let s = 0; s < SAMPLES; s++) {
      const u = s / (SAMPLES - 1);
      const w0 = (1 - u) * (1 - u);
      const w1 = 2 * (1 - u) * u;
      const w2 = u * u;
      pts[s * 3] = w0 * P[a] + w1 * cx + w2 * P[b];
      pts[s * 3 + 1] = w0 * P[a + 1] + w1 * cy + w2 * P[b + 1];
      pts[s * 3 + 2] = w0 * P[a + 2] + w1 * cz + w2 * P[b + 2];
    }
  }
}

// ---------------------------------------------------------------------- glow sprites (cheap soft light: one drawImage instead of a gradient)
const SPR = {};
function sprite(hex) {
  let s = SPR[hex];
  if (s !== undefined) return s;
  s = null;
  try {
    if (typeof OffscreenCanvas === 'function') {
      const c = new OffscreenCanvas(96, 96);
      const g = c.getContext('2d');
      if (g) {
        const gr = g.createRadialGradient(48, 48, 0, 48, 48, 48);
        gr.addColorStop(0, rgba(hex, 1));
        gr.addColorStop(0.4, rgba(hex, 0.32));
        gr.addColorStop(1, rgba(hex, 0));
        g.fillStyle = gr;
        g.fillRect(0, 0, 96, 96);
        s = c;
      }
    }
  } catch (e) { s = null; }
  SPR[hex] = s;
  return s;
}
// soft light at (x,y); keeps whatever globalAlpha / composite mode the caller set
function glow(ctx, x, y, rad, hex, a) {
  if (!(rad > 0.6) || !(a > 0.004)) return;
  const s = sprite(hex);
  const ga = ctx.globalAlpha;
  if (s) {
    ctx.globalAlpha = ga * (a > 1 ? 1 : a);
    ctx.drawImage(s, x - rad, y - rad, rad * 2, rad * 2);
    ctx.globalAlpha = ga;
    return;
  }
  const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
  g.addColorStop(0, rgba(hex, a));
  g.addColorStop(0.4, rgba(hex, a * 0.32));
  g.addColorStop(1, rgba(hex, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, 6.2832);
  ctx.fill();
}
