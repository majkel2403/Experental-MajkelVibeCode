// Frame description: turns a simulation state into what Gource draws, in screen pixels, in Gource's order:
// edges (shadow, then line), file shadows, action beams, files, user shadows, users, bloom; then text.
// Backends (WebGL, Canvas 2D) only rasterise this description.
import { SIM, fileAlpha, fileColour, userAlpha, nameAlpha, dirVisible, camDistance } from './sim.js';
import { ACTION_COLOUR } from './actions.js';

const lerp = (a, b, k) => a + (b - a) * k;

// camera: Gource looks straight down with a 90° vertical field of view, so the visible world height is 2·distance
export function view(s, k, W, H, user, inset) {
  const c = s.cam;
  // the scene is framed inside the free area between panels (insets), like Gource framing its whole window
  const L = inset ? inset.l || 0 : 0; const R = inset ? inset.r || 0 : 0; const Tp = inset ? inset.t || 0 : 0; const B = inset ? inset.b || 0 : 0;
  // distance from the tracked half extents and this screen's free area, so any window size frames the tree
  const aspect = Math.max(0.2, Math.max(40, W - L - R) / Math.max(40, H - Tp - B));
  const z = camDistance(lerp(c.pex, c.ex, k), lerp(c.pey, c.ey, k), aspect) * (user ? user.zoom : 1);
  const cx = lerp(c.px, c.x, k) + (user ? user.panX : 0);
  const cy = lerp(c.py, c.y, k) + (user ? user.panY : 0);
  const ox = L + (W - L - R) / 2; const oy = Tp + (H - Tp - B) / 2;
  const K = (Math.max(40, H - Tp - B) / 2) / Math.max(1, z);
  return { cx, cy, K, W, H, sx: (x) => ox + (x - cx) * K, sy: (y) => oy + (y - cy) * K };
}

export function buildFrame(s, k, W, H, o) {
  o = o || {};
  const V = view(s, k, W, H, o.camera, o.inset);
  const K = V.K;
  const F = { V, edges: [], files: [], users: [], beams: [], blooms: [], labels: [], picks: [], key: [], counts: { files: 0, dirs: 0, users: 0 } };
  if (s.root < 0) return F;
  const dirs = s.dirs;
  const P = (d) => [V.sx(lerp(d.px, d.x, k)), V.sy(lerp(d.py, d.y, k))];

  // edges and bloom, walking the tree like Gource (an edge is drawn for a visible child of a drawn node)
  const walk = (d) => {
    const vis = dirVisible(s, d);
    if (vis) {
      F.counts.dirs++;
      const p = P(d);
      // with the studio on the camera comes close, where full-strength glow of big directories would wash out the scene
      const bl = o.agentNames ? 0.32 : 0.75;
      F.blooms.push({ x: p[0], y: p[1], R: d.r * 2 * K, Rw: d.r * 2, col: [d.col[0] * bl, d.col[1] * bl, d.col[2] * bl] });
      if (d.parent >= 0) {
        const par = dirs[d.parent];
        const p1 = P(par);
        const sp = [V.sx(lerp(d.psx, d.sx, k)), V.sy(lerp(d.psy, d.sy, k))];
        F.edges.push(spline(p1, par.col, p, d.col, sp));
        if (d.sinceNode < 5 && !o.hideDirNames) {
          F.labels.push({ kind: 'dir', text: d.token, x: p1[0] * 0.25 + p[0] * 0.25 + sp[0] * 0.5, y: p1[1] * 0.25 + p[1] * 0.25 + sp[1] * 0.5, a: Math.max(0, 5 - d.sinceNode) / 5 });
        }
      }
    }
    for (const c of d.children) { const ch = dirs[c]; if (dirVisible(s, ch)) walk(ch); }
  };
  walk(dirs[s.root]);

  // files
  const fs = SIM.FILE_SIZE;
  for (const d of dirs) {
    if (d.dead) continue;
    const dx = lerp(d.px, d.x, k); const dy = lerp(d.py, d.y, k);
    for (const fi of d.files) {
      const f = s.files[fi];
      if (f.hidden) continue;
      const wx = dx + lerp(f.px, f.x, k); const wy = dy + lerp(f.py, f.y, k);
      const a = fileAlpha(f);
      const sel = o.selected === 'file:' + f.path;
      const hl = sel || o.highlight === 'file:' + f.path;
      const col = sel ? [1, 1, 1] : fileColour(f);
      const x = V.sx(wx); const y = V.sy(wy);
      F.files.push({ x, y, size: Math.max(2, fs * K), col, a, shadow: 2 * K, path: f.path });
      F.counts.files++;
      F.picks.push({ id: 'file:' + f.path, x, y, r: Math.max(5, fs * K * 0.6) });
      const na = hl ? 1 : f.nameInt > 0 && fs * K >= 4 ? nameAlpha(f.nameInt, SIM.FILENAME_TIME) : 0;
      if (na > 0.01 && !o.hideFileNames) F.labels.push({ kind: hl ? 'file-sel' : 'file', text: f.name, x: V.sx(wx + 5.5), y: V.sy(wy - (hl ? 2 : 1)), a: na });
    }
  }

  // users and their beams
  const uw = SIM.USER_SIZE; const uh = uw * SIM.USER_RATIO;
  for (const u of s.users) {
    if (u.dead) continue;
    const ux = lerp(u.px, u.x, k); const uy = lerp(u.py, u.y, k);
    for (const ai of u.active) {
      const ac = s.acts[ai];
      if (ac.progress >= 1) continue;
      const f = s.files[ac.f]; const d = dirs[f.dir];
      const fx = lerp(d.px, d.x, k) + lerp(f.px, f.x, k); const fy = lerp(d.py, d.y, k) + lerp(f.py, f.y, k);
      const kind = o.compat && (ac.kind === 'R' || ac.kind === 'P' || ac.kind === 'F') ? 'M' : ac.kind;
      F.beams.push(beam(V, ux, uy, fx, fy, Math.max(fs * 0.5, 0.9 / K), ACTION_COLOUR[kind] || ACTION_COLOUR.M, 1 - ac.progress));
    }
    const a = userAlpha(u);
    const sel = o.selected === 'user:' + u.id;
    const hl = sel || o.highlight === 'user:' + u.id;
    const x = V.sx(ux); const y = V.sy(uy);
    const minW = o.agentNames ? 22 : 14;
    F.users.push({ x, y, w: Math.max(minW, uw * K), h: Math.max(minW, uw * K) * SIM.USER_RATIO, col: sel ? [1, 1, 1] : u.col, a, shadow: 2 * K, id: u.id, label: u.label, ucol: u.col });
    F.counts.users++;
    F.picks.push({ id: 'user:' + u.id, x, y, r: Math.max(8, uw * K * 0.6) });
    // with the studio on, agents are always named (they are the story); otherwise names fade as in Gource
    const na = hl ? 1 : o.agentNames ? a : u.nameInt > 0 ? nameAlpha(u.nameInt, SIM.NAME_TIME) : 0;
    if (na > 0.01) F.labels.push({ kind: hl ? 'user-sel' : 'user', text: u.label, x, y: y - Math.max(minW, uw * K) * SIM.USER_RATIO * 0.5, a: na });
    // tool in use (our addition): a small tag under the avatar while the tool runs
    if (u.tool && u.toolT >= 0 && !o.compat) {
      const age = s.t - u.toolT;
      const ta = u.toolState === 'run' ? Math.min(1, age * 2) : Math.max(0, 1 - age / 1.5);
      if (ta > 0.02 && a > 0.05) F.labels.push({ kind: u.toolState === 'fail' ? 'tool-fail' : 'tool', text: u.tool, x, y: y + uh * K * 0.5 + 2, a: ta * a });
    }
  }
  // messages between agents (our addition): a thin beam from sender to receiver
  if (!o.compat) {
    for (const m of s.msgs) {
      const A = s.users[m.a]; const B = s.users[m.b];
      if (!A || !B || A.dead || B.dead) continue;
      const age = s.t - m.t0;
      F.beams.push(beam(V, lerp(A.px, A.x, k), lerp(A.py, A.y, k), lerp(B.px, B.x, k), lerp(B.py, B.y, k), 3, m.col, Math.max(0, 1 - age / 1.5) * 0.85));
    }
  }

  // file extension key (animated in the simulation like Gource's: rows slide, entries fade)
  F.key = Object.values(s.keyEnt).filter((e) => e.dest > 0 && e.alpha > 0)
    .map((e) => ({ ext: e.ext, n: Math.max(0, s.key[e.ext] || 0), col: e.ext ? colourOf(e.ext, s) : [1, 1, 1], alpha: e.alpha, row: e.y }));
  return F;
}

const keyCache = {};
function colourOf(ext, s) {
  if (!keyCache[ext]) {
    for (const f of s.files) if (f.ext === ext) { keyCache[ext] = f.col; break; }
  }
  return keyCache[ext] || [1, 1, 1];
}

// quadratic spline from parent (p1) to child (p2) through the lagging control point, 1..10 segments
function spline(p1, c1, p2, c2, sp) {
  const mx = (p1[0] - p2[0]) * 0.5; const my = (p1[1] - p2[1]) * 0.5;
  const tx = p1[0] - sp[0]; const ty = p1[1] - sp[1];
  const lm = Math.hypot(mx, my) || 1; const lt = Math.hypot(tx, ty) || 1;
  const dp = Math.min(1, (tx * mx + ty * my) / (lm * lt));
  let n = Math.min(10, Math.floor(Math.acos(Math.max(-1, dp)) / Math.PI * 100));
  if (n < 1) n = 1;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n; const tt = 1 - t;
    const ax = p1[0] * t + sp[0] * tt; const ay = p1[1] * t + sp[1] * tt;
    const bx = sp[0] * t + p2[0] * tt; const by = sp[1] * t + p2[1] * tt;
    pts.push(ax * t + bx * tt, ay * t + by * tt,
      c1[0] * t + c2[0] * tt, c1[1] * t + c2[1] * tt, c1[2] * t + c2[2] * tt, c1[3] * t + c2[3] * tt);
  }
  return pts; // [x, y, r, g, b, a] per point, child first
}

// tapered beam from a source (thin, faint) to a target (wide, opaque), in world units
function beam(V, sx, sy, tx, ty, half, col, a) {
  let nx = tx - sx; let ny = ty - sy; const l = Math.hypot(nx, ny) || 1;
  nx /= l; ny /= l;
  const px = -ny * half; const py = nx * half;
  return {
    q: [V.sx(sx - px * 0.3), V.sy(sy - py * 0.3), V.sx(sx + px * 0.3), V.sy(sy + py * 0.3), V.sx(tx + px), V.sy(ty + py), V.sx(tx - px), V.sy(ty - py)],
    col, a,
  };
}
