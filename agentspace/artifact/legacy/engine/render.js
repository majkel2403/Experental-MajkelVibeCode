// ---------------------------------------------------------------------- renderer
// draw3d() builds one per-frame context object G and hands it to independent stages, back to front:
//   drawGalaxy(G) -> drawOrbits(G) -> list = drawSynapses(G) -> drawFlows(G, list) -> N = drawNeurons(G)
//   -> drawFx(G, N) -> drawLabels(G, N) -> drawCards(G, N) -> vignette
// G = { ctx, W, H, S, m, t, fx, q, rm, cam, proj, unit, kref, f, dist, cx, cy, sf, cyw, syw, cpt, spt }
//   m.P holds the world position of every node this frame (3 floats per node), m.edges[].pts the current curve (world),
//   proj(x,y,z) -> shared array [screenX, screenY, perspectiveScale, cameraDepth] (copy values out immediately; skip depth < NEAR).
//   q = quality 0|1|2 (adaptive), rm = reduced motion, fx = wall clock seconds (ambient animation), t = scene time.
// Each stage lives between @@MODULE markers and may be replaced independently of the others.
const TMP3 = [0, 0, 0];
const FRAME = {};
// colour of a travelling message impulse
function pulseColor(ev, nodes) {
  if (!nodes[ev.from]) return GOLD;
  if (ev.kind === 'critique' || ev.kind === 'revision' || ev.kind === 'approve' || ev.kind === 'question' || ev.kind === 'assign') return KIND[ev.kind].color;
  return nodes[ev.from].light;
}

// @@MODULE:GALAXY-BEGIN
// GALAXY: deep-space background + a spiral galaxy COPLANAR with the orbit lanes (same LANE_TILT, same rotation sense) +
// the ACCRETION DISK of the central black hole. Pieces, back to front:
//   1. space gradient + sky nebulae (screen space, slide a little with the camera yaw)
//   2. three star layers on the sky sphere (far / mid / bright), twinkling in 16 sync groups (no per-star strings)
//   3. soft plane glow of the disk, spiral-arm haze sprites, dark dust lanes, pink HII knots (all glow sprites)
//   4. the particle disk: 2 + 2 logarithmic arms (particles concentrated in the arms), a small bulge, a thin inter-arm
//      disk and a sparse halo; differential rotation winds the arms but saturates (tanh) so a long session never turns
//      them into mush
//   5. the FAR half of the accretion disk (ring band GX_AR0..GX_AR1 world units in the lane plane: a baked band sprite,
//      ~900 streaming dots in 6 Keplerian rings x 12 sectors, tangential streaks, Doppler brightening on the approaching
//      side). gxAccDraw(G, 1) draws the NEAR half: NEURONS calls it right after the dark core (guarded with typeof), so the
//      core occludes the far half and the near half passes in front of it.
// Everything is pre-generated once (mulberry seeds) into typed arrays and bucketed by colour/brightness, so the frame loop
// only projects and fillRects; the galaxy stays dim inside the lane region (r < ~175) so agents/labels remain the focus,
// and there is NO star glow at the origin any more: the centre is a black hole.
const GX_R = 420;
const GX_B = 0.19;
const GX_R0 = 30;
const GX_RIN = 56;
const GX_COLS = ['#FFE2A8', '#FFD07A', '#FFEBC8', '#F2F2FF', '#CFE0FF', '#9EC4FF', '#7FA6FF', '#B9A4FF', '#9C7DFF', '#FF9FD0'];
const GX_ALPHA = [0.5, 0.78, 1];
const GX_N = 1050;
const GX_NB = GX_COLS.length * 3;
const GX_SKYC = ['#BFD4FF', '#FFFFFF', '#FFE6C0', '#C9B8FF'];
const GX_SKYN = [128, 60, 10];
const gxSets = [null, null, null];
const gxSkySets = [null, null, null];
let gxM = null;
let gxSky = null;
let gxHz = null;
let gxErr = null;

const gxSpr = {};
// flatter, gaussian-like light sprite (the shared sprite() peaks too sharply for haze); falls back to a gradient
function gxGlow(ctx, x, y, rad, hex, a) {
  if (!(rad > 0.6) || !(a > 0.004)) return;
  let s = gxSpr[hex];
  if (s === undefined) {
    s = null;
    try {
      if (typeof OffscreenCanvas === 'function') {
        const c = new OffscreenCanvas(128, 128);
        const g = c.getContext('2d');
        if (g) {
          const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
          gr.addColorStop(0, rgba(hex, 1));
          gr.addColorStop(0.18, rgba(hex, 0.78));
          gr.addColorStop(0.38, rgba(hex, 0.38));
          gr.addColorStop(0.62, rgba(hex, 0.1));
          gr.addColorStop(1, rgba(hex, 0));
          g.fillStyle = gr;
          g.fillRect(0, 0, 128, 128);
          s = c;
        }
      }
    } catch (e) { s = null; }
    gxSpr[hex] = s;
  }
  const ga = ctx.globalAlpha;
  if (!s) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, rgba(hex, a));
    g.addColorStop(0.38, rgba(hex, a * 0.38));
    g.addColorStop(1, rgba(hex, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    return;
  }
  ctx.globalAlpha = ga * (a > 1 ? 1 : a);
  ctx.drawImage(s, x - rad, y - rad, rad * 2, rad * 2);
  ctx.globalAlpha = ga;
}
const gxExp = (rnd, hs, span) => -hs * Math.log(1 - rnd() * (1 - Math.exp(-span / hs)));
const gxSmooth = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };

function gxGen() {
  const rnd = mulberry(90210);
  const gs = () => (rnd() + rnd() + rnd() + rnd() - 2) * 1.732;
  const N = GX_N;
  const M = { r: new Float32Array(N), th: new Float32Array(N), h: new Float32Array(N), s: new Float32Array(N), dw: new Float32Array(N), b: new Uint8Array(N) };
  const armTh = [0, 1.5708, 3.1416, 4.7124];
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  for (let i = 0; i < N; i++) {
    const tp = rnd();
    let r = 0;
    let th = 0;
    let h = 0;
    let c = 3;
    let cls = 0;
    const u = rnd();
    if (tp < 0.06) {
      // bulge: small flattened gaussian blob, warm
      const sg = 30;
      const gx = gs() * sg;
      const gz = gs() * sg;
      r = Math.hypot(gx, gz);
      th = Math.atan2(gz, gx);
      h = gs() * sg * 0.4;
      c = pick([0, 1, 2, 2, 1, 0]);
      cls = u < 0.75 ? 0 : 1;
    } else if (tp < 0.84) {
      // spiral arms: trailing logarithmic spirals; two strong, two faint; narrow scatter so the arms read
      const v = rnd();
      const a = v < 0.38 ? 0 : v < 0.76 ? 1 : v < 0.88 ? 2 : 3;
      r = GX_RIN + gxExp(rnd, 170, GX_R - GX_RIN);
      const w = 5 + 0.04 * r;
      const wide = rnd() < 0.1 ? 2.6 : 1;
      th = armTh[a] - Math.log(r / GX_R0) / GX_B + gs() * (w / r) * wide;
      h = gs() * (1.8 + 0.009 * r);
      const uu = r / 380;
      c = uu < 0.3 ? pick([1, 2, 3, 2]) : uu < 0.5 ? pick([3, 4, 4, 5, 3]) : uu < 0.78 ? pick([4, 5, 5, 6, 7, 4]) : pick([7, 8, 8, 6, 7]);
      if (r > 100 && rnd() < 0.08) c = 9;
      const fb = (r < 140 ? 0.35 : 1) * (a < 2 ? 1.3 : 0.75);
      cls = u < 0.13 * fb ? 2 : u < 0.13 * fb + 0.4 ? 1 : 0;
    } else if (tp < 0.95) {
      // thin inter-arm disk
      r = rnd() < 0.3 ? 30 + gxExp(rnd, 70, 200) : GX_RIN + gxExp(rnd, 280, GX_R - GX_RIN);
      th = rnd() * 6.2832;
      h = gs() * (2.2 + 0.01 * r);
      const uu = r / 380;
      c = uu < 0.3 ? pick([1, 2, 3]) : uu < 0.55 ? pick([3, 4, 5, 3]) : uu < 0.8 ? pick([5, 6, 7, 4]) : pick([7, 8, 6]);
      cls = u < 0.03 * (r < 140 ? 0.3 : 1) ? 2 : u < 0.25 ? 1 : 0;
    } else {
      // halo: sparse spherical scatter
      const rr = 90 + Math.pow(rnd(), 1.5) * 320;
      const uz = rnd() * 2 - 1;
      r = rr * Math.sqrt(1 - uz * uz);
      th = rnd() * 6.2832;
      h = rr * uz;
      c = pick([5, 6, 7, 8, 3, 4]);
      cls = u < 0.8 ? 0 : 1;
    }
    M.r[i] = r;
    M.th[i] = th;
    M.h[i] = h;
    M.s[i] = (0.85 + rnd() * 0.8) * (cls === 2 ? 1.5 : cls === 1 ? 1.2 : 1);
    M.dw[i] = 0.02 * 70 / (r + 70);
    M.b[i] = c * 3 + cls;
  }
  return M;
}

function gxPack(key, n, nk) {
  const bs = new Int32Array(nk + 1);
  for (let i = 0; i < n; i++) bs[key[i] + 1]++;
  for (let k = 0; k < nk; k++) bs[k + 1] += bs[k];
  const pos = bs.slice(0, nk);
  const ord = new Uint16Array(n);
  for (let i = 0; i < n; i++) ord[pos[key[i]]++] = i;
  return { n, ord, bs };
}

function gxDiskSet(q) {
  if (!gxM) gxM = gxGen();
  let s = gxSets[q];
  if (!s) { s = gxSets[q] = gxPack(gxM.b, q >= 2 ? GX_N : q === 1 ? Math.round(GX_N * 0.55) : Math.round(GX_N * 0.25), GX_NB); s.sz = q >= 2 ? 1 : q === 1 ? 1.12 : 1.3; }
  return s;
}

function gxSkyGen() {
  const rnd = mulberry(7);
  const L = [];
  for (let l = 0; l < 3; l++) {
    const n = GX_SKYN[l];
    const o = { x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), s: new Float32Array(n), a: new Float32Array(n), g: new Uint8Array(n), c: new Uint8Array(n) };
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1;
      const a = rnd() * 6.2832;
      const sq = Math.sqrt(1 - u * u);
      o.x[i] = sq * Math.cos(a); o.y[i] = u; o.z[i] = sq * Math.sin(a);
      o.s[i] = l === 0 ? 0.55 + rnd() * 0.6 : l === 1 ? 1 + rnd() * 0.7 : 1.7 + rnd() * 0.9;
      o.a[i] = l === 0 ? 0.2 + rnd() * 0.35 : l === 1 ? 0.4 + rnd() * 0.4 : 0.75 + rnd() * 0.25;
      const c = Math.floor(rnd() * 4);
      o.c[i] = c;
      o.g[i] = c * 4 + Math.floor(rnd() * 4);
    }
    L.push(o);
  }
  return L;
}

function gxSkySet(l, q) {
  if (!gxSky) gxSky = gxSkyGen();
  let s = gxSkySets[l] && gxSkySets[l][q];
  if (!s) {
    if (!gxSkySets[l]) gxSkySets[l] = [null, null, null];
    const n = GX_SKYN[l];
    s = gxSkySets[l][q] = gxPack(gxSky[l].g, q >= 2 ? n : Math.round(n * (q === 1 ? 0.62 : 0.34)), 16);
  }
  return s;
}

// haze sprites: spiral-arm clouds, inter-arm body, dust lanes (dark) and HII knots; rotate exactly like the particles
function gxHazeGen() {
  const rnd = mulberry(4242);
  const gs = () => (rnd() + rnd() + rnd() + rnd() - 2) * 1.732;
  const H = { arm: [], body: [], dust: [], hii: [], clu: [] };
  const armTh = [0, 1.5708, 3.1416, 4.7124];
  const col = (r) => (r < 120 ? '#FFC98C' : r < 190 ? '#B7C8FF' : r < 280 ? '#86B2FF' : r < 360 ? '#8C98FF' : '#A58BFF');
  for (let a = 0; a < 4; a++) {
    const major = a < 2;
    const M = major ? 56 : 22;
    for (let j = 0; j < M; j++) {
      const r = 48 + 372 * (j + rnd() * 0.7) / M;
      const th = armTh[a] - Math.log(r / GX_R0) / GX_B + gs() * ((7 + 0.06 * r) / r);
      const fin = 0.7 + 0.3 * gxSmooth(70, 210, r);
      const bump = 1 + 0.6 * Math.exp(-Math.pow((r - 185) / 80, 2));
      const al = (major ? 0.34 : 0.16) * Math.exp(-r / 215) * fin * bump * (0.75 + rnd() * 0.5) * (r < 175 ? 0.55 : 1);
      H.arm.push({ r, th, rad: (22 + 0.11 * r + rnd() * 10) * (j % 2 ? 0.85 : 1.5), a: al * (j % 2 ? 1.1 : 0.4), hex: col(r), j });
      if (major && j % 3 === 0 && r > 80 && r < 340) H.dust.push({ r, th: th + 0.14, rad: 10 + 0.04 * r, a: 0.42 * (0.6 + rnd() * 0.6), hex: '#02030C', j });
      if (major && r > 110 && r < 380 && rnd() < 0.4) H.hii.push({ r, th: th + gs() * 0.05, rad: 7 + rnd() * 8, a: 0.26 + rnd() * 0.24, hex: rnd() < 0.55 ? '#FF8FC8' : rnd() < 0.5 ? '#FFB4DA' : '#BFD8FF', j });
    }
  }
  for (let a = 0; a < 4; a++) {
    const n = a < 2 ? 40 : 12;
    for (let j = 0; j < n; j++) {
      const r = 78 + gxExp(rnd, 150, 330);
      const th = armTh[a] - Math.log(r / GX_R0) / GX_B + gs() * ((6 + 0.05 * r) / r);
      const rr = rnd();
      H.clu.push({ r, th, rad: 3.5 + rnd() * 6, a: (0.16 + rnd() * 0.26) * (a < 2 ? 1 : 0.6) * (0.55 + 0.45 * gxSmooth(80, 180, r)) * (r < 175 ? 0.6 : 1), hex: r < 140 ? '#FFE2B0' : rr < 0.6 ? '#CFE0FF' : rr < 0.85 ? '#B0C8FF' : '#E2D4FF', j });
    }
  }
  for (let i = 0; i < 32; i++) {
    const r = 64 + rnd() * 190;
    H.dust.push({ r, th: rnd() * 6.2832, rad: 14 + 0.06 * r + rnd() * 8, a: 0.2 * (0.5 + rnd() * 0.7), hex: '#02030C', j: i });
  }
  for (let i = 0; i < 14; i++) {
    const r = 60 + rnd() * 300;
    H.body.push({ r, th: rnd() * 6.2832, rad: 70 + rnd() * 50, a: 0.028 * Math.exp(-r / 280) * (0.4 + 0.6 * gxSmooth(70, 220, r)), hex: r < 150 ? '#FFC98C' : '#7C98FF', j: i });
  }
  return H;
}

const gxMat = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
// local disk coords (x, h, z) in the LANE PLANE -> camera space (x1, y2, z2) = M * local + offset. Same plane as lanePt:
// local (x, 0, zz) is world (x, zz * LT_S, zz * LT_C); h is the plane normal. Same yaw/pitch/target as G.proj.
function gxMatCol(o, k, vx, vy, vz, cyw, syw, cpt, spt) {
  const x1 = vx * cyw - vz * syw;
  const z1 = vx * syw + vz * cyw;
  o[k] = x1; o[k + 3] = vy * cpt - z1 * spt; o[k + 6] = vy * spt + z1 * cpt;
}
function gxMatrix(G) {
  const { cyw, syw, cam, cpt, spt } = G;
  const o = gxMat;
  gxMatCol(o, 0, 1, 0, 0, cyw, syw, cpt, spt);
  gxMatCol(o, 1, 0, LT_C, -LT_S, cyw, syw, cpt, spt);
  gxMatCol(o, 2, 0, LT_S, LT_C, cyw, syw, cpt, spt);
  const x1 = -cam.tx * cyw + cam.tz * syw;
  const z1 = -cam.tx * syw - cam.tz * cyw;
  o[9] = x1; o[10] = -cam.ty * cpt - z1 * spt; o[11] = -cam.ty * spt + z1 * cpt;
  return o;
}

// ---------------------------------------------------------------------------------------------------- accretion disk
const GX_AR0 = 27; // inner edge of the band (just outside the dark disc: n.r 20 * NEU_CORE_K 1.32 * 0.96 ~ 25)
const GX_AR1 = 52; // outer edge (lane 0 sits at 62)
const GX_ARN = 6; // Keplerian rings (each ring has one angular speed, so ring x sector buckets stay coherent forever)
const GX_ASN = 12; // angular sectors per ring (Doppler factor is set once per bucket)
const GX_AN = 760; // dots at q2
const GX_AK = 72; // tangential streaks at q2
const GX_ACOL = ['#FFFFFF', '#FFF6E0', '#FFE6AE', '#FFC870', '#FFA242', '#FF7C26'];
const GX_AALP = [0.95, 0.9, 0.85, 0.8, 0.72, 0.62];
const GX_AW = new Float32Array(GX_ARN);
const GX_ASPR_R = 60; // world radius of the band sprite
(function () { for (let k = 0; k < GX_ARN; k++) { const rm = GX_AR0 + (GX_AR1 - GX_AR0) * (k + 0.5) / GX_ARN; GX_AW[k] = 1.7 * Math.pow(GX_AR0 / rm, 1.5); } })();
let gxAcc = null;
let gxAccSpr;
const gxAccSets = [null, null, null];
const gxAccKSets = [null, null, null];
const gxAccSX = new Float32Array(GX_AN);
const gxAccSY = new Float32Array(GX_AN);
const gxAccSZ = new Float32Array(GX_AN);
const gxAccSide = new Uint8Array(GX_AN); // 0 far, 1 near, 2 culled
const gxAccBA = new Float32Array(GX_ARN * GX_ASN);
const gxAccKX = new Float32Array(GX_AK * 4);
const gxAccKSide = new Uint8Array(GX_AK);
const gxAccKA = new Float32Array(GX_ARN * 4);
const gxAccSt = { stamp: -1, ok: false, qq: 0, kr: 1, far: 0 };

function gxAccGen() {
  const rnd = mulberry(31337);
  const gs = () => (rnd() + rnd() + rnd() + rnd() - 2) * 1.732;
  const N = GX_AN;
  const K = GX_AK;
  const A = { r: new Float32Array(N), th: new Float32Array(N), h: new Float32Array(N), s: new Float32Array(N), b: new Uint8Array(N), kr: new Float32Array(K), kth: new Float32Array(K), kl: new Float32Array(K), kb: new Uint8Array(K) };
  const sw = 6.2832 / GX_ASN;
  for (let i = 0; i < N; i++) {
    let ring = Math.floor(GX_ARN * Math.pow(rnd(), 1.35));
    if (ring >= GX_ARN) ring = GX_ARN - 1;
    const r = GX_AR0 + (GX_AR1 - GX_AR0) * (ring + rnd()) / GX_ARN;
    const sec = Math.floor(rnd() * GX_ASN);
    A.r[i] = r;
    A.th[i] = (sec + rnd()) * sw;
    A.h[i] = gs() * (0.5 + 0.07 * (r - GX_AR0));
    A.s[i] = 0.8 + rnd() * 0.9;
    A.b[i] = ring * GX_ASN + sec;
  }
  for (let i = 0; i < K; i++) {
    const ring = 1 + Math.floor(rnd() * (GX_ARN - 1));
    const sec = Math.floor(rnd() * 4);
    A.kr[i] = GX_AR0 + (GX_AR1 - GX_AR0) * (ring + rnd()) / GX_ARN;
    A.kth[i] = (sec + rnd()) * 1.5708;
    A.kl[i] = 2.5 + rnd() * 4;
    A.kb[i] = ring * 4 + sec;
  }
  return A;
}
function gxAccSet(qq) {
  if (!gxAcc) gxAcc = gxAccGen();
  let s = gxAccSets[qq];
  if (!s) s = gxAccSets[qq] = gxPack(gxAcc.b, qq >= 2 ? GX_AN : qq === 1 ? Math.round(GX_AN * 0.55) : Math.round(GX_AN * 0.3), GX_ARN * GX_ASN);
  return s;
}
function gxAccKSet(qq) {
  if (!gxAcc) gxAcc = gxAccGen();
  let s = gxAccKSets[qq];
  if (!s) s = gxAccKSets[qq] = gxPack(gxAcc.kb, qq >= 2 ? GX_AK : qq === 1 ? GX_AK >> 1 : 0, GX_ARN * 4);
  return s;
}
// band sprite: inner edge white-hot, outer edge deep orange, soft outside (256 px = 2 * GX_ASPR_R world units)
function gxAccSprite() {
  if (gxAccSpr !== undefined) return gxAccSpr;
  let s = null;
  try {
    if (typeof OffscreenCanvas === 'function') {
      const c = new OffscreenCanvas(256, 256);
      const g = c.getContext('2d');
      if (g) {
        const r0 = GX_AR0; const r1 = GX_AR1;
        const u = (r) => Math.min(0.999, r / GX_ASPR_R);
        const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
        gr.addColorStop(0, 'rgba(255,255,255,0)');
        gr.addColorStop(u(r0 - 4), 'rgba(255,255,255,0)');
        gr.addColorStop(u(r0 - 1), 'rgba(255,250,235,0.55)');
        gr.addColorStop(u(r0 + 1.5), 'rgba(255,255,255,0.95)');
        gr.addColorStop(u(r0 + 5), 'rgba(255,236,190,0.85)');
        gr.addColorStop(u(r0 + 11), 'rgba(255,200,110,0.68)');
        gr.addColorStop(u(r0 + 19), 'rgba(255,150,60,0.5)');
        gr.addColorStop(u(r1), 'rgba(255,110,36,0.3)');
        gr.addColorStop(u(r1 + 6), 'rgba(255,90,30,0.08)');
        gr.addColorStop(1, 'rgba(255,80,30,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, 256, 256);
        s = c;
      }
    }
  } catch (e) { s = null; }
  gxAccSpr = s;
  return s;
}
// half = 0: far half (called by GALAXY), half = 1: near half (called by NEURONS after the dark core). Composite 'lighter'
// on entry and exit. The far pass projects every particle once and caches screen data for the near pass.
function gxAccDraw(G, half) {
  const { ctx, W, H, q, rm, fx, cx, cy, kref, dist, f } = G;
  const fxe = rm ? 11 : fx;
  const qq = q >= 2 ? 2 : q === 1 ? 1 : 0;
  const stamp = fx * 1000 + G.t;
  const st = gxAccSt;
  if (half === 0) {
    st.stamp = stamp; st.ok = false; st.qq = qq;
    const p0 = G.proj(0, 0, 0);
    if (p0[3] < NEAR + 10) return;
    st.ok = true;
  } else if (st.stamp !== stamp || !st.ok || st.qq !== qq) {
    // the far pass did not run this frame (module swapped out): draw both halves now
    gxAccDraw(G, 0);
    if (!st.ok) return;
  }
  const M = gxMatrix(G);
  const m00 = M[0]; const m01 = M[1]; const m02 = M[2];
  const m10 = M[3]; const m11 = M[4]; const m12 = M[5];
  const m20 = M[6]; const m21 = M[7]; const m22 = M[8];
  const o0 = M[9]; const o1 = M[10]; const o2 = M[11];
  const zc0 = o2 + dist;
  const k0 = f / Math.max(zc0, 40);
  const ox = cx + o0 * k0;
  const oy = cy - o1 * k0;
  const dpr = G.S.dpr || 1;
  const kk0 = 1 / (kref > 0.05 ? kref : 0.05);
  let kr = k0 * kk0;
  kr = kr < 0.55 ? 0.55 : kr > 1.6 ? 1.6 : kr;
  const aFar = Math.atan2(m22, m20); // local plane angle pointing away from the camera
  const tw = rm ? 1 : 0.94 + 0.06 * Math.sin(fxe * 2.1);
  ctx.globalCompositeOperation = 'lighter';
  // ---- band sprite (one half), affine in the plane
  const spr = gxAccSprite();
  if (spr) {
    const a = m00 * k0 * dpr; const b = -m10 * k0 * dpr; const c = m02 * k0 * dpr; const d = -m12 * k0 * dpr;
    const cf = Math.cos(aFar + 3.14159); const sf = Math.sin(aFar + 3.14159);
    ctx.setTransform(a * cf + c * sf, b * cf + d * sf, -a * sf + c * cf, -b * sf + d * cf, ox * dpr, oy * dpr);
    ctx.globalAlpha = (qq >= 1 ? 0.42 : 0.5) * tw;
    const S = GX_ASPR_R;
    if (half === 0) ctx.drawImage(spr, 0, 0, 128, 256, -S, -S, S, 2 * S);
    else ctx.drawImage(spr, 128, 0, 128, 256, 0, -S, S, 2 * S);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
  } else if (half === 0 && qq >= 1) {
    gxGlow(ctx, ox, oy, 40 * k0, '#FFB060', 0.3);
  }
  // Doppler: the approaching side (velocity towards the camera) glows brighter
  if (half === 0 && qq >= 1) {
    const aApp = aFar + 1.5708;
    const xl = Math.cos(aApp) * 35; const zl = Math.sin(aApp) * 35;
    const zc = m20 * xl + m22 * zl + o2 + dist;
    if (zc > NEAR) {
      const k = f / (zc > 40 ? zc : 40);
      gxGlow(ctx, cx + (m00 * xl + m02 * zl + o0) * k, cy - (m10 * xl + m12 * zl + o1) * k, 26 * k, '#FFF0D0', 0.3 * tw);
    }
  }
  // ---- dots
  const A = gxAcc;
  const set = gxAccSet(qq);
  const ord = set.ord;
  const bs = set.bs;
  const AR = A.r; const AT = A.th; const AH = A.h; const AS = A.s;
  const sw = 6.2832 / GX_ASN;
  const szK = qq >= 2 ? 1 : qq === 1 ? 1.15 : 1.35;
  let lastRing = -1;
  for (let b = 0; b < GX_ARN * GX_ASN; b++) {
    const i0 = bs[b];
    const i1 = bs[b + 1];
    if (i0 === i1) continue;
    const ring = (b / GX_ASN) | 0;
    const rot = GX_AW[ring] * fxe;
    let al;
    if (half === 0) {
      const mean = ((b % GX_ASN) + 0.5) * sw + rot;
      const vz = m22 * Math.cos(mean) - m20 * Math.sin(mean);
      const dop = 1 + 0.55 * (vz < -1 ? 1 : vz > 1 ? -1 : -vz);
      al = GX_AALP[ring] * dop * tw;
      gxAccBA[b] = al;
    } else al = gxAccBA[b];
    if (ring !== lastRing) { ctx.fillStyle = GX_ACOL[ring]; lastRing = ring; }
    ctx.globalAlpha = al > 1 ? 1 : al;
    if (half === 0) {
      for (let i = i0; i < i1; i++) {
        const j = ord[i];
        const r = AR[j];
        const ang = AT[j] + rot;
        const xl = r * Math.cos(ang);
        const zl = r * Math.sin(ang);
        const h = AH[j];
        const zc = m20 * xl + m21 * h + m22 * zl + o2 + dist;
        if (zc < NEAR) { gxAccSide[j] = 2; continue; }
        const k = f / (zc > 40 ? zc : 40);
        const sx = cx + (m00 * xl + m01 * h + m02 * zl + o0) * k;
        const sy = cy - (m10 * xl + m11 * h + m12 * zl + o1) * k;
        if (sx < -3 || sx > W + 3 || sy < -3 || sy > H + 3) { gxAccSide[j] = 2; continue; }
        let sz = AS[j] * szK * kr * Math.min(1, Math.max(0.45, G.unit / 1.7));
        if (zc < 150) sz *= (zc - NEAR) / 90;
        if (sz < 0.35) { gxAccSide[j] = 2; continue; }
        if (sz > 2.6) sz = 2.6;
        gxAccSX[j] = sx; gxAccSY[j] = sy; gxAccSZ[j] = sz;
        if (zc > zc0) { gxAccSide[j] = 0; ctx.fillRect(sx - sz * 0.5, sy - sz * 0.5, sz, sz); } else gxAccSide[j] = 1;
      }
    } else {
      for (let i = i0; i < i1; i++) {
        const j = ord[i];
        if (gxAccSide[j] !== 1) continue;
        const sz = gxAccSZ[j];
        ctx.fillRect(gxAccSX[j] - sz * 0.5, gxAccSY[j] - sz * 0.5, sz, sz);
      }
    }
  }
  // ---- tangential streaks (batched: one path per bucket)
  const ks = gxAccKSet(qq);
  if (ks.n > 0) {
    const kord = ks.ord;
    const kbs = ks.bs;
    const KR = A.kr; const KT = A.kth; const KL = A.kl;
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    for (let b = 0; b < GX_ARN * 4; b++) {
      const i0 = kbs[b];
      const i1 = kbs[b + 1];
      if (i0 === i1) continue;
      const ring = b >> 2;
      const rot = GX_AW[ring] * fxe;
      let al;
      if (half === 0) {
        const mean = ((b & 3) + 0.5) * 1.5708 + rot;
        const vz = m22 * Math.cos(mean) - m20 * Math.sin(mean);
        al = GX_AALP[ring] * 0.8 * (1 + 0.55 * (vz < -1 ? 1 : vz > 1 ? -1 : -vz)) * tw;
        gxAccKA[b] = al;
      } else al = gxAccKA[b];
      ctx.strokeStyle = GX_ACOL[ring];
      ctx.globalAlpha = al > 1 ? 1 : al;
      let cnt = 0;
      ctx.beginPath();
      for (let i = i0; i < i1; i++) {
        const j = kord[i];
        if (half === 0) {
          const r = KR[j];
          const ang = KT[j] + rot;
          const cs = Math.cos(ang); const sn = Math.sin(ang);
          const xl = r * cs;
          const zl = r * sn;
          const zc = m20 * xl + m22 * zl + o2 + dist;
          if (zc < NEAR + 5) { gxAccKSide[j] = 2; continue; }
          const k = f / (zc > 40 ? zc : 40);
          const sx = cx + (m00 * xl + m02 * zl + o0) * k;
          const sy = cy - (m10 * xl + m12 * zl + o1) * k;
          if (sx < -8 || sx > W + 8 || sy < -8 || sy > H + 8) { gxAccKSide[j] = 2; continue; }
          // screen tangent (direction of motion), scaled by ring speed
          let tx = (m02 * cs - m00 * sn) * k;
          let ty = -(m12 * cs - m10 * sn) * k;
          const tl = Math.hypot(tx, ty);
          if (tl < 1e-4) { gxAccKSide[j] = 2; continue; }
          const L = KL[j] * kr * (0.6 + 0.4 * GX_AW[ring] / GX_AW[0]) * (tl / (tl + 0.2)) * 0.5;
          tx = tx / tl * L; ty = ty / tl * L;
          const o4 = j * 4;
          gxAccKX[o4] = sx - tx; gxAccKX[o4 + 1] = sy - ty; gxAccKX[o4 + 2] = sx + tx; gxAccKX[o4 + 3] = sy + ty;
          gxAccKSide[j] = zc > zc0 ? 0 : 1;
          if (zc > zc0) { ctx.moveTo(sx - tx, sy - ty); ctx.lineTo(sx + tx, sy + ty); cnt++; }
        } else if (gxAccKSide[j] === 1) {
          const o4 = j * 4;
          ctx.moveTo(gxAccKX[o4], gxAccKX[o4 + 1]); ctx.lineTo(gxAccKX[o4 + 2], gxAccKX[o4 + 3]); cnt++;
        }
      }
      if (cnt) ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

// per-frame haze parameters (module scope: no closures in the frame loop)
const gxFP = { fxe: 0, rm: false };
// a glow sprite squashed into the lane plane (affine ellipse of the plane through the origin)
function gxPlaneGlow(ctx, M, k0, dpr, ox, oy, rad, hex, a) {
  const sx = rad * k0;
  ctx.setTransform(dpr * M[0] * sx, -dpr * M[3] * sx, dpr * M[2] * sx, -dpr * M[5] * sx, dpr * ox, dpr * oy);
  gxGlow(ctx, 0, 0, 1, hex, a);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
// one haze layer (arr = baked sprites {r, th, rad, hex, a, j}) wound by the differential rotation, drawn in the plane
function gxHazeDraw(G, M, P, arr, sc, stp, rk, cap, shim) {
  const { ctx, W, H, cx, cy, dist, f } = G;
  const fxe = P.fxe; const rm = P.rm;
  const m00 = M[0]; const m02 = M[2]; const m10 = M[3]; const m12 = M[5]; const m20 = M[6]; const m22 = M[8];
  const o0 = M[9]; const o1 = M[10]; const o2 = M[11];
  for (let i = 0; i < arr.length; i += stp) {
    const s = arr[i];
    const r = s.r;
    const ang = s.th + 0.03 * fxe + 1.5 * Math.tanh((0.02 * 70 / (r + 70)) * fxe / 1.5);
    const xl = r * Math.cos(ang);
    const zl = r * Math.sin(ang);
    const zc = m20 * xl + m22 * zl + o2 + dist;
    if (zc < NEAR + 20) continue;
    const k = f / (zc > 40 ? zc : 40);
    const sx = cx + (m00 * xl + m02 * zl + o0) * k;
    const sy = cy - (m10 * xl + m12 * zl + o1) * k;
    let rp = s.rad * rk * k;
    if (rp > cap) rp = cap;
    if (sx < -rp || sx > W + rp || sy < -rp || sy > H + rp) continue;
    let nf = zc < 150 ? (zc - NEAR - 20) / 70 : 1;
    if (k > 2.2) nf *= 2.2 / k;
    if (shim && !rm) nf *= 0.76 + 0.24 * Math.sin(fxe * 1.3 + s.j * 1.9);
    gxGlow(ctx, sx, sy, rp, s.hex, s.a * sc * nf);
  }
}
function drawGalaxy(G) {
  try {
    gxDraw(G);
  } catch (e) {
    gxErr = e;
    // never throw out of a stage: restore the context to the state the next stage expects
    const c = G.ctx;
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.setTransform(G.S.dpr || 1, 0, 0, G.S.dpr || 1, 0, 0);
  }
}
function gxDraw(G) {
  const { ctx, W, H, q, rm, fx, cam, cx, cy, kref, dist, f, proj } = G;
  const fxe = rm ? 0 : fx;
  const qq = q >= 2 ? 2 : q === 1 ? 1 : 0;
  // ---------- 1. space ----------
  const bg = ctx.createRadialGradient(cx, cy * 0.92, 0, cx, cy, Math.max(W, H) * 0.8);
  bg.addColorStop(0, '#0A1230');
  bg.addColorStop(0.5, '#050A20');
  bg.addColorStop(1, '#03050F');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  if (q >= 1) {
    const mx = Math.max(W, H);
    const nb = [['#6DB6FF', 0.16, 0.3, 0.5, 0.065], ['#D6BEFF', 0.84, 0.22, 0.48, 0.06], ['#FFAE5C', 0.7, 0.88, 0.45, 0.035], ['#4FF0D8', 0.14, 0.82, 0.42, 0.04]];
    for (let i = 0; i < nb.length; i++) {
      const b = nb[i];
      glow(ctx, W * b[1] + Math.sin(cam.yaw * 0.7 + i * 1.7) * W * 0.06, H * b[2] + Math.cos(cam.yaw * 0.5 + i) * H * 0.04, mx * b[3], b[0], b[4]);
    }
  }

  // ---------- 2. stars on the sky sphere (far layer turns slower than the mid layer: parallax when the user orbits) ----------
  gxStars(G, qq, fxe);

  // ---------- 3/4. the galaxy ----------
  const M = gxMatrix(G);
  const m00 = M[0]; const m01 = M[1]; const m02 = M[2];
  const m10 = M[3]; const m11 = M[4]; const m12 = M[5];
  const m20 = M[6]; const m21 = M[7]; const m22 = M[8];
  const o0 = M[9]; const o1 = M[10]; const o2 = M[11];
  const k0 = f / Math.max(o2 + dist, 40);
  const kk0 = 1 / (kref > 0.05 ? kref : 0.05);
  const pOrg = proj(0, 0, 0);
  const ox = pOrg[0];
  const oy = pOrg[1];
  const ok0 = pOrg[3] >= NEAR;
  // foreshortening: |camera-z of the plane normal| (1 face-on, 0 edge-on); edge-on stacks the same light into a thin
  // band, so haze and particles are dimmed accordingly
  // (alpha roughly proportional to fs with a floor: the stacked edge-on band must stay below the orbit lanes)
  let fs = m21 < 0 ? -m21 : m21;
  fs = fs < 0.1 ? 0.1 : fs > 1 ? 1 : fs;
  const hs = 0.14 + 0.86 * fs;
  const pa = 0.34 + 0.66 * fs;

  // soft plane glow of the whole disk (affine ellipse of the disk plane; very soft, so perspective error is invisible)
  if (ok0 && q >= 1) {
    const dpr = G.S.dpr || 1;
    gxGlow(ctx, ox, oy, 330 * k0, '#5C74FF', 0.035);
    gxPlaneGlow(ctx, M, k0, dpr, ox, oy, 420, '#5568E8', 0.08 * hs);
    gxPlaneGlow(ctx, M, k0, dpr, ox, oy, 240, '#8C98F8', 0.07 * hs);
  }

  // haze sprites
  if (!gxHz) gxHz = gxHazeGen();
  const Wmax = 1.5;
  const rotW = 0.03;
  const stride = qq >= 2 ? 1 : qq === 1 ? 2 : 3;
  const radK = qq >= 2 ? 1 : qq === 1 ? 1.25 : 1.5;
  if (ok0) {
    const P = gxFP;
    P.fxe = fxe; P.rm = rm;
    gxHazeDraw(G, M, P, gxHz.body, hs, stride, radK, 260, false);
    gxHazeDraw(G, M, P, gxHz.arm, hs, stride, radK, 240, false);
    if (qq >= 1) {
      // dark dust lanes along the inner edge of the strong arms
      ctx.globalCompositeOperation = 'source-over';
      gxHazeDraw(G, M, P, gxHz.dust, 1, qq >= 2 ? 1 : 2, 1, 120, false);
      ctx.globalCompositeOperation = 'lighter';
    }
    if (qq >= 2) gxHazeDraw(G, M, P, gxHz.hii, hs, 1, 1, 40, true);
    if (qq >= 1) gxHazeDraw(G, M, P, gxHz.clu, hs, qq >= 2 ? 1 : 2, 1, 34, true);
  }

  // particle disk
  const set = gxDiskSet(qq);
  const MR = gxM.r; const MT = gxM.th; const MH = gxM.h; const MS = gxM.s; const MD = gxM.dw;
  const ord = set.ord;
  const bs = set.bs;
  const szK = set.sz * Math.min(1, Math.max(0.45, G.unit / 1.7));
  for (let b = 0; b < GX_NB; b++) {
    const i0 = bs[b];
    const i1 = bs[b + 1];
    if (i0 === i1) continue;
    const tw = rm ? 1 : 0.9 + 0.1 * Math.sin(fxe * 1.3 + b * 1.7);
    ctx.globalAlpha = GX_ALPHA[b % 3] * tw * pa;
    ctx.fillStyle = GX_COLS[(b / 3) | 0];
    for (let i = i0; i < i1; i++) {
      const j = ord[i];
      const r = MR[j];
      const ang = MT[j] + rotW * fxe + Wmax * Math.tanh(MD[j] * fxe / Wmax);
      const xl = r * Math.cos(ang);
      const zl = r * Math.sin(ang);
      const h = MH[j];
      const zc = m20 * xl + m21 * h + m22 * zl + o2 + dist;
      if (zc < NEAR) continue;
      const k = f / (zc > 40 ? zc : 40);
      const sx = cx + (m00 * xl + m01 * h + m02 * zl + o0) * k;
      const sy = cy - (m10 * xl + m11 * h + m12 * zl + o1) * k;
      if (sx < -4 || sx > W + 4 || sy < -4 || sy > H + 4) continue;
      let kr = k * kk0;
      kr = kr < 0.55 ? 0.55 : kr > 1.35 ? 1.35 : kr;
      let sz = MS[j] * szK * kr;
      if (zc < 150) sz *= (zc - NEAR) / 90;
      if (sz < 0.3) continue;
      if (sz > 2.7) sz = 2.7;
      ctx.fillRect(sx - sz * 0.5, sy - sz * 0.5, sz, sz);
    }
  }
  ctx.globalAlpha = 1;

  // ---------- 5. the far half of the accretion disk ----------
  if (ok0) gxAccDraw(G, 0);
  else gxAccSt.ok = false;
  ctx.globalCompositeOperation = 'source-over';
}

// three layers of stars; groups = colour x twinkle phase, so alpha/colour change 16 times per layer at most
function gxStars(G, qq, fxe) {
  const { ctx, W, H, rm, cam } = G;
  for (let l = 0; l < 3; l++) {
    const set = gxSkySet(l, qq);
    const S = gxSky[l];
    const yaw = l === 0 ? cam.yaw * 0.5 : cam.yaw;
    const pit = l === 0 ? 0.42 + (cam.pitch - 0.42) * 0.55 : cam.pitch;
    const cyw = Math.cos(yaw); const syw = Math.sin(yaw); const cpt = Math.cos(pit); const spt = Math.sin(pit);
    const fs = (l === 0 ? 0.62 : 0.7) * Math.min(W, H) * (l === 0 ? 1 : 1.08);
    const cxs = G.cx;
    const cys = G.cy;
    const ord = set.ord;
    const bs = set.bs;
    for (let g = 0; g < 16; g++) {
      const i0 = bs[g];
      const i1 = bs[g + 1];
      if (i0 === i1) continue;
      const tw = rm ? 1 : 0.68 + 0.32 * Math.sin(fxe * (1.1 + l * 0.35) + (g & 3) * 1.6 + l);
      ctx.fillStyle = GX_SKYC[g >> 2];
      let ga = -1;
      for (let i = i0; i < i1; i++) {
        const j = ord[i];
        const x1 = S.x[j] * cyw - S.z[j] * syw;
        const z1 = S.x[j] * syw + S.z[j] * cyw;
        const y2 = S.y[j] * cpt - z1 * spt;
        const z2 = S.y[j] * spt + z1 * cpt;
        if (z2 < 0.12) continue;
        const sx = cxs + (x1 / z2) * fs;
        const sy = cys - (y2 / z2) * fs;
        if (sx < -4 || sx > W + 4 || sy < -4 || sy > H + 4) continue;
        const a = S.a[j] * tw;
        if (a !== ga) { ctx.globalAlpha = a > 1 ? 1 : a; ga = a; }
        const sz = S.s[j];
        ctx.fillRect(sx - sz * 0.5, sy - sz * 0.5, sz, sz);
        if (l === 2) {
          ctx.globalAlpha = a * 0.35;
          ctx.fillRect(sx - sz * 3, sy - 0.4, sz * 6, 0.8);
          ctx.fillRect(sx - 0.4, sy - sz * 3, 0.8, sz * 6);
          ga = -1;
        }
      }
    }
  }
  ctx.globalAlpha = 1;
}
// @@MODULE:GALAXY-END

// @@MODULE:ORBITS-BEGIN
// ORBITS: the four parallel lane rings (lanePt / laneR / laneW / laneY in the model) drawn as thin, elegant ellipses that stay
// DIMMER than the synapses: a 1 px tinted core (alpha <= 0.35) over one very soft bloom stroke, a sparse band of ring dust
// orbiting at the lane speed, a subtle comet tail behind every agent that is working (task intervals via agentAt(), smoothed)
// and a draw-in with a bright tip when the lane's first agent spawns. No tick marks, no travelling highlights: the rings must
// never read as a second line family next to the synapses. Ambient motion uses fx (frozen under reduced motion); what exists
// and what is lit is a pure function of the scene time t.
const ORB_SEG = [56, 44, 32];
const ORB_DUST = [26, 16, 8];
const ORB_LX = new Float32Array(72);
const ORB_LY = new Float32Array(72);
const ORB_LZ = new Float32Array(72);
const ORB_AX = new Float32Array(24);
const ORB_AY = new Float32Array(24);
const ORB_COL = {};
const orbCache = new Map();
let orbDust = null;
let orbErr = null;

function orbDustGen() {
  const rnd = mulberry(5150);
  const gs = () => (rnd() + rnd() + rnd() + rnd() - 2) * 1.732;
  const lanes = [];
  const n = ORB_DUST[0];
  for (let li = 0; li < 4; li++) {
    const D = { a: new Float32Array(n), dr: new Float32Array(n), dy: new Float32Array(n), sp: new Float32Array(n), s: new Float32Array(n) };
    for (let i = 0; i < n; i++) {
      D.a[i] = rnd() * 6.2832;
      D.dr[i] = gs() * (2.6 + li * 0.5);
      D.dy[i] = gs() * 2.2;
      D.sp[i] = 0.85 + rnd() * 0.35;
      D.s[i] = 0.9 + rnd() * 0.9;
    }
    lanes.push(D);
  }
  return lanes;
}
// per-scenario agent cache: task intervals flattened [from, to, review] for the smooth "is working" intensity
function orbAgents(m) {
  let c = orbCache.get(m);
  if (c) return c;
  c = { iv: [] };
  m.nodes.forEach((n) => {
    if (n.kind !== 'agent') return;
    const tk = (m.base && m.base.tasks && m.base.tasks[n.id]) || [];
    const a = new Float32Array(tk.length * 3);
    for (let i = 0; i < tk.length; i++) { a[i * 3] = tk[i].from; a[i * 3 + 1] = tk[i].to; a[i * 3 + 2] = tk[i].review ? 1 : 0; }
    c.iv[n.i] = a;
  });
  orbCache.set(m, c);
  return c;
}
function orbWork(iv, t) {
  let w = 0;
  if (!iv) return 0;
  for (let j = 0; j < iv.length; j += 3) {
    const up = clamp((t - iv[j]) / 0.6, 0, 1);
    const dn = clamp((t - iv[j + 1]) / 1.0, 0, 1);
    const v = up * up * (3 - 2 * up) * (1 - dn * dn * (3 - 2 * dn)) * (iv[j + 2] ? 0.78 : 1);
    if (v > w) w = v;
  }
  return w;
}
function orbLight(col) {
  let c = ORB_COL[col];
  if (!c) c = ORB_COL[col] = { c0: rgba(col, 0), c6: rgba(col, 0.6) };
  return c;
}
// projects n samples of lane li between angles th0..th1 into ORB_AX/AY; false when a sample is behind the near plane
function orbArc(G, li, th0, th1, n) {
  const proj = G.proj;
  const r = laneR(li);
  const y0 = laneY(li);
  for (let s = 0; s < n; s++) {
    const th = th0 + ((th1 - th0) * s) / (n - 1);
    const zz = Math.sin(th) * r;
    const p = proj(Math.cos(th) * r, y0 + zz * LT_S, zz * LT_C);
    if (p[3] < NEAR) return false;
    ORB_AX[s] = p[0]; ORB_AY[s] = p[1];
  }
  return true;
}
function orbStrokeArc(ctx, n) {
  ctx.beginPath();
  ctx.moveTo(ORB_AX[0], ORB_AY[0]);
  for (let s = 1; s < n; s++) ctx.lineTo(ORB_AX[s], ORB_AY[s]);
}

function drawOrbits(G) {
  try {
    orbDraw(G);
  } catch (e) {
    if (!orbErr && typeof console !== 'undefined') console.warn('ORBITS: drawOrbits failed, rings skipped', e);
    orbErr = e;
    const c = G.ctx;
    c.lineCap = 'round';
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  }
}
function orbDraw(G) {
  const { ctx, m, t, q, rm, fx, kref, proj } = G;
  if (!orbDust) orbDust = orbDustGen();
  const qq = q >= 2 ? 2 : q === 1 ? 1 : 0;
  const fxe = rm ? 0 : fx;
  const S = ORB_SEG[2 - qq];
  const nd = ORB_DUST[2 - qq];
  const ag = orbAgents(m);
  const nodes = m.nodes;
  const dk = 1 / (kref > 0.05 ? kref : 0.05);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let li = 0; li < m.lanes.length && li < 4; li++) {
    const L = m.lanes[li];
    if (t < L.first - 0.3) continue;
    const gr = clamp((t - (L.first - 0.3)) / 1.7, 0, 1);
    const g = gr * gr * (3 - 2 * gr);
    const col = L.color;
    const pc = proj(0, laneY(li), 0);
    if (pc[3] < NEAR) continue;
    const ks = clamp(pc[2] * dk, 0.55, 1.5);
    const th0 = 0.5 + li * 2.1;
    const nseg = Math.max(2, Math.ceil(g * S));
    const full = g >= 0.999;
    const R = laneR(li);
    const y0 = laneY(li);

    // ---- ring path (projected once): one soft bloom + a thin tinted core ----
    let nv = 0;
    for (let s = 0; s <= nseg; s++) {
      const th = th0 + (s / S) * 6.2832;
      const zz = Math.sin(th) * R;
      const p = proj(Math.cos(th) * R, y0 + zz * LT_S, zz * LT_C);
      ORB_LX[s] = p[0]; ORB_LY[s] = p[1]; ORB_LZ[s] = p[3];
      nv++;
    }
    ctx.beginPath();
    let pen = false;
    for (let s = 0; s < nv; s++) {
      if (ORB_LZ[s] < NEAR) { pen = false; continue; }
      if (!pen) { ctx.moveTo(ORB_LX[s], ORB_LY[s]); pen = true; } else ctx.lineTo(ORB_LX[s], ORB_LY[s]);
    }
    ctx.strokeStyle = col;
    if (qq >= 1) { ctx.lineWidth = 5 * ks; ctx.globalAlpha = 0.04 + 0.03 * (1 - g); ctx.stroke(); }
    ctx.lineWidth = 1;
    ctx.globalAlpha = Math.min(0.35, 0.24 + 0.1 * (1 - g));
    ctx.stroke();
    // growing tip while the ring draws in
    if (!full) {
      const e = nv - 1;
      if (ORB_LZ[e] >= NEAR) {
        ctx.globalAlpha = 1;
        glow(ctx, ORB_LX[e], ORB_LY[e], 9 * ks, '#FFFFFF', 0.5);
        glow(ctx, ORB_LX[e], ORB_LY[e], 22 * ks, col, 0.45);
      }
    }

    // ---- sparse ring dust: dim specks orbiting at the lane speed ----
    {
      const D = orbDust[li];
      const wl = laneW(li);
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.4 * g * g;
      for (let i = 0; i < nd; i++) {
        const th = D.a[i] + wl * D.sp[i] * fxe;
        if (!full && ((((th - th0) % 6.2832) + 6.2832) % 6.2832) > g * 6.2832) continue;
        const rr = R + D.dr[i];
        const zz = Math.sin(th) * rr;
        const p = proj(Math.cos(th) * rr, y0 + zz * LT_S + D.dy[i], zz * LT_C);
        if (p[3] < NEAR) continue;
        let sz = D.s[i] * p[2] * dk;
        sz = sz < 0.7 ? 0.7 : sz > 1.8 ? 1.8 : sz;
        ctx.fillRect(p[0] - sz * 0.5, p[1] - sz * 0.5, sz, sz);
      }
    }
  }

  // ---- subtle comet tails behind the agents that are working right now ----
  const nn = qq >= 2 ? 12 : qq === 1 ? 9 : 6;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.kind !== 'agent' || t < n.spawn + 0.9) continue;
    const L = m.lanes[n.lane];
    if (!L || t < L.first) continue;
    const w = orbWork(ag.iv[n.i], t);
    if (w < 0.03) continue;
    const I = w * clamp((t - n.spawn - 0.9) / 1.0, 0, 1);
    const len = 0.45 + 0.45 * w;
    if (!orbArc(G, n.lane, n.th - len, n.th, nn)) continue;
    const pc = proj(0, laneY(n.lane), 0);
    const ks = clamp(pc[2] * dk, 0.55, 1.5);
    const lc = orbLight(L.color);
    const gt = ctx.createLinearGradient(ORB_AX[0], ORB_AY[0], ORB_AX[nn - 1], ORB_AY[nn - 1]);
    gt.addColorStop(0, lc.c0);
    gt.addColorStop(1, lc.c6);
    orbStrokeArc(ctx, nn);
    ctx.strokeStyle = gt;
    if (qq >= 1) { ctx.lineWidth = 6 * ks; ctx.globalAlpha = 0.12 * I; ctx.stroke(); }
    ctx.lineWidth = 1.5 * ks; ctx.globalAlpha = 0.42 * I; ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
// @@MODULE:ORBITS-END

// @@MODULE:SYNAPSES-BEGIN
// synapses: every connection as a thin neural line + comets for every message; returns the list of visible edges.
// Hierarchy (legibility rule): idle lines are DIM and tinted by the line colour; they are stroked in buckets (one stroke per
// colour / alpha / width / dash class, solid colours, no gradients). The trunk lines (spoke, link, report) carry a static fan
// of thin fibres that converge on both ends (the reference's line bundles). Edges with a live or recent message are drawn
// individually: brighter colour body, white-hot core and a travelling wave. Decision lines are dashed pale yellow, lineage
// lines short dashes in the file colour - both at a width/alpha that stays visible under the galaxy. Message impulses are
// comets: a tapered particle tail (solid strokes of decreasing length), dust, sparks and a white head.
// Style per kind: w = core width (px at reference depth), a = idle core alpha, fan = fibre fan when idle, bead = terminal
// bouton, br = birth flash weight, dash = 0 solid / 1 short dashes / 2 long dashes.
const SYN_STY = {
  spoke: { w: 1.1, a: 0.32, fan: 1, bead: 1, br: 0.5, dash: 0 },
  link: { w: 1.25, a: 0.36, fan: 1, bead: 1, br: 0.6, dash: 0 },
  chat: { w: 1.05, a: 0.32, fan: 0, bead: 1, br: 0.6, dash: 0 },
  report: { w: 1.7, a: 0.55, fan: 1, bead: 1, br: 0.8, dash: 0 },
  author: { w: 1.0, a: 0.31, fan: 0, bead: 0, br: 0.9, dash: 0 },
  deliver: { w: 1.0, a: 0.29, fan: 0, bead: 0, br: 0.9, dash: 0 },
  lineage: { w: 1.3, a: 0.44, fan: 0, bead: 0, br: 0.6, dash: 1 },
  decision: { w: 1.45, a: 0.5, fan: 0, bead: 0, br: 0.7, dash: 2 },
};
const SYN_BLK = '#000000';
const SYN_WHT = '#FFFFFF';
const SYN_PX = new Float32Array(32);
const SYN_PY = new Float32Array(32);
const SYN_TX = new Float32Array(12);
const SYN_TY = new Float32Array(12);
const SYN_O = [0, 0, 0, 0, 0];
const SYN_D0 = [];
const SYN_DD = [0.1, 5];
const SYN_DW = [4, 12];
// colour buckets: id = ((ci * 3 + dash) * 4 + widthLevel) * 6 + alphaLevel; ci = index of the hex colour (SYN_HEX)
const SYN_NCI = 96;
const SYN_WL = [0.75, 1.05, 1.4, 1.85];
const SYN_AL = [0.08, 0.15, 0.22, 0.3, 0.4, 0.52];
const SYN_HEX = [];
const SYN_CIX = {};
const SYN_RGBA = new Array(SYN_NCI * 6).fill(null);
const SYN_HEAD = new Int32Array(SYN_NCI * 3 * 4 * 6);
const SYN_NEXT = new Int32Array(1024);
const SYN_IE = new Int16Array(1024);
const SYN_IS = new Int8Array(1024);
const SYN_DASH1 = [2.5, 3.5];
const SYN_DASH2 = [5.5, 4];
// the colour tables belong to one model: a scenario switch resets them and drops the per-edge caches (which pin colour indices)
let SYN_lastM = null;
function SYN_reset(m) {
  if (m === SYN_lastM) return;
  SYN_lastM = m;
  SYN_HEX.length = 0;
  for (const k in SYN_CIX) delete SYN_CIX[k];
  SYN_RGBA.fill(null);
  const edges = m.edges;
  for (let i = 0; i < edges.length; i++) edges[i].synN = null;
}
function SYN_ci(hex) {
  let i = SYN_CIX[hex];
  if (i !== undefined) return i;
  i = SYN_HEX.length < SYN_NCI ? SYN_HEX.length : -1;
  if (i >= 0) SYN_HEX.push(hex);
  SYN_CIX[hex] = i;
  return i;
}
function SYN_col(ci, al) {
  const k = ci * 6 + al;
  let s = SYN_RGBA[k];
  if (!s) s = SYN_RGBA[k] = rgba(SYN_HEX[ci], SYN_AL[al]);
  return s;
}
// per-edge cache (colours as ready strings, per-sample scale and screen arc length, activity state shared with FLOWS)
function SYN_net(e, nodes) {
  let c = e.synN;
  if (c) return c;
  const na = nodes[e.a];
  const nb = nodes[e.b];
  let c0 = e.color;
  let c1 = e.color2;
  if (e.kind === 'spoke') { c0 = mixHex(GOLD, nb.color, 0.35); c1 = nb.color; }
  else if (e.kind === 'author') { c0 = mixHex(nb.color, na.color, 0.3); c1 = nb.color; }
  else if (e.kind === 'deliver') { c0 = na.color; c1 = mixHex(na.color, nb.color, 0.3); }
  else if (e.kind === 'decision') { c0 = DEC_COL; c1 = mixHex(DEC_COL, nb.color, 0.25); }
  else if (e.kind === 'lineage') { c0 = na.color; c1 = mixHex(na.color, nb.color, 0.5); }
  else if (e.kind === 'report') { c0 = mixHex(e.color, GOLD, 0.65); c1 = REPORT_COL; }
  const cm = mixHex(c0, c1, 0.5);
  c = e.synN = {
    c0, c1, cm,
    ci: SYN_ci(cm), ci0: SYN_ci(c0), ci1: SYN_ci(c1),
    cw: mixHex(cm, SYN_WHT, 0.62), cb: mixHex(cm, SYN_WHT, 0.3),
    p0: mixHex(c0, SYN_WHT, 0.38), pm: mixHex(cm, SYN_WHT, 0.38), p1: mixHex(c1, SYN_WHT, 0.38),
    same: c0 === c1,
    fc: na.kind === 'file' && (e.kind === 'deliver' || e.kind === 'report') ? na.color : '',
    fl2: na.kind === 'file' && (e.kind === 'deliver' || e.kind === 'report') ? na.light : '',
    hubA: na.kind === 'hermes' || na.kind === 'report',
    hubB: nb.kind === 'hermes' || nb.kind === 'report',
    ks: new Float32Array(SAMPLES), cl: new Float32Array(SAMPLES), len: 1, wl: 1,
    act: 0, mem: 0, uses: 0, dir: 0, fl: 0, fa: 0, fb: 0, boost: 0, fog: 1, birth: 0, idle: 0, st: 3, kss: 1,
  };
  return c;
}
// point at fraction u along the projected edge: o = [x, y, tangent x, tangent y, scale]
function SYN_at(e, ks, u, o) {
  const n1 = e.n - 1;
  let ff = u * n1;
  if (!(ff > 0)) ff = 0;
  if (ff > n1 - 0.0001) ff = n1 - 0.0001;
  const i = ff | 0;
  const k = ff - i;
  const x0 = e.sx[i];
  const y0 = e.sy[i];
  const dx = e.sx[i + 1] - x0;
  const dy = e.sy[i + 1] - y0;
  const l = Math.sqrt(dx * dx + dy * dy) || 1;
  o[0] = x0 + dx * k; o[1] = y0 + dy * k; o[2] = dx / l; o[3] = dy / l; o[4] = ks[i] + (ks[i + 1] - ks[i]) * k;
}
// point at screen arc distance d from the start of the edge
function SYN_atD(e, c, d, o) {
  const cl = c.cl;
  let i = 1;
  while (i < e.n - 1 && cl[i] < d) i++;
  const span = cl[i] - cl[i - 1] || 1;
  const k = clamp((d - cl[i - 1]) / span, 0, 1);
  o[0] = e.sx[i - 1] + (e.sx[i] - e.sx[i - 1]) * k;
  o[1] = e.sy[i - 1] + (e.sy[i] - e.sy[i - 1]) * k;
  o[4] = c.ks[i - 1] + (c.ks[i] - c.ks[i - 1]) * k;
}
// message history of one edge: fast activity (flight + afterglow), slow memory, terminal flares
function SYN_scan(c, evs, t) {
  let act = 0;
  let dir = 0;
  let uses = 0;
  let last = 1e9;
  let fa = 0;
  let fb = 0;
  let fl = 0;
  for (let k = 0; k < evs.length; k++) {
    const ev = evs[k];
    if (ev.t > t) break;
    uses++;
    const age = t - ev.t;
    last = age;
    let a;
    if (age < FLIGHT) { a = age < 0.14 ? age / 0.14 : 1; fl++; } else a = 0.72 * Math.exp(-(age - FLIGHT) / 1.5);
    if (a > act) { act = a; dir = ev.dir; }
    if (age < 0.8) { const f = 1 - age / 0.8; if (ev.dir > 0) { if (f > fa) fa = f; } else if (f > fb) fb = f; }
    const aa = age - FLIGHT;
    if (aa > -0.12 && aa < 0.9) {
      const f = 1 - Math.max(0, aa) / 0.9;
      if (ev.dir > 0) { if (f > fb) fb = f; } else if (f > fa) fa = f;
    }
  }
  c.act = act; c.dir = dir; c.uses = uses; c.fl = fl; c.fa = fa; c.fb = fb;
  c.mem = uses ? (1 - Math.exp(-uses * 0.6)) * Math.exp(-last / 9) : 0;
}
// smooth curve through the first n scratch points (quadratic curves through midpoints)
function SYN_curve(ctx, n) {
  ctx.moveTo(SYN_PX[0], SYN_PY[0]);
  if (n < 3) { ctx.lineTo(SYN_PX[n - 1], SYN_PY[n - 1]); return; }
  ctx.lineTo((SYN_PX[0] + SYN_PX[1]) * 0.5, (SYN_PY[0] + SYN_PY[1]) * 0.5);
  for (let i = 1; i < n - 1; i++) ctx.quadraticCurveTo(SYN_PX[i], SYN_PY[i], (SYN_PX[i] + SYN_PX[i + 1]) * 0.5, (SYN_PY[i] + SYN_PY[i + 1]) * 0.5);
  ctx.lineTo(SYN_PX[n - 1], SYN_PY[n - 1]);
}
// trunk points (stride st through the visible samples, always ending on the last visible sample)
function SYN_trunk(e, up, st) {
  let n = 0;
  let s = 0;
  for (;;) {
    SYN_PX[n] = e.sx[s]; SYN_PY[n] = e.sy[s]; n++;
    if (s >= up - 1) break;
    s += st;
    if (s > up - 1 || up - 1 - s < st * 0.5) s = up - 1;
  }
  return n;
}
// one fibre of the static fan: offset along the screen normal, bulging in the middle and converging on both ends
function SYN_fibre(e, up, st, side, amp, seed) {
  let n = 0;
  let s = 0;
  const den = e.n - 1;
  for (;;) {
    const s0 = s > 0 ? s - 1 : 0;
    const s1 = s < up - 1 ? s + 1 : up - 1;
    const nx = -(e.sy[s1] - e.sy[s0]);
    const ny = e.sx[s1] - e.sx[s0];
    const nl = Math.sqrt(nx * nx + ny * ny) || 1;
    const u = s / den;
    const off = side * amp * Math.sin(u * 3.1416) * (0.75 + 0.25 * Math.sin(u * 9.42 + seed));
    SYN_PX[n] = e.sx[s] + (nx / nl) * off;
    SYN_PY[n] = e.sy[s] + (ny / nl) * off;
    n++;
    if (s >= up - 1) break;
    s += st;
    if (s > up - 1 || up - 1 - s < st * 0.5) s = up - 1;
  }
  return n;
}
function SYN_dash(ctx, d, ks) {
  if (d === 1) { SYN_DD[0] = 2.5 * ks; SYN_DD[1] = 3.5 * ks; ctx.setLineDash(SYN_DD); }
  else if (d === 2) { SYN_DD[0] = 7 * ks; SYN_DD[1] = 5 * ks; ctx.setLineDash(SYN_DD); }
  else ctx.setLineDash(SYN_D0);
}
const SYN_CMP = (a, b) => b.zc - a.zc;

function drawSynapses(G) {
  const { ctx, S, m, t, fx, q, rm, dist, kref, proj } = G;
  const edges = m.edges;
  const nodes = m.nodes;
  const P = m.P;
  const selI = S && S.sel && S.sel !== 'hermes' && m.idx[S.sel] != null ? m.idx[S.sel] : -1;
  const hovI = S && S.hover && m.idx[S.hover] != null ? m.idx[S.hover] : -1;
  const kr = kref > 0 ? kref : 1;
  SYN_reset(m);
  // ---------- visibility, projection, per-edge state ----------
  const list = [];
  let focus = 0;
  for (let ei = 0; ei < edges.length; ei++) {
    const e = edges[ei];
    const g = e.kind === 'author' ? ease(clamp((t - e.appear) / 1.1, 0, 1)) : clamp((t - e.appear) / 0.9, 0, 1);
    if (g <= 0) continue;
    const c = SYN_net(e, nodes);
    const upto = Math.max(2, Math.ceil(g * (e.n - 1)) + 1);
    const mid = Math.min(e.n - 1, e.n >> 1);
    let near = false;
    let acc = 0;
    for (let s = 0; s < e.n; s++) {
      const p = proj(e.pts[s * 3], e.pts[s * 3 + 1], e.pts[s * 3 + 2]);
      if (s > 0) { const dx = p[0] - e.sx[s - 1]; const dy = p[1] - e.sy[s - 1]; acc += Math.sqrt(dx * dx + dy * dy); }
      e.sx[s] = p[0]; e.sy[s] = p[1];
      c.ks[s] = p[2] / kr;
      c.cl[s] = acc;
      if (p[3] < NEAR) near = true;
      if (s === mid) { e.zc = p[3]; e.km = p[2]; }
    }
    if (near) continue;
    c.len = acc + 0.5;
    const a3 = e.a * 3;
    const b3 = e.b * 3;
    const wx = P[b3] - P[a3];
    const wy = P[b3 + 1] - P[a3 + 1];
    const wz = P[b3 + 2] - P[a3 + 2];
    c.wl = Math.sqrt(wx * wx + wy * wy + wz * wz) * 1.06 + 1;
    e.up = upto; e.g = g;
    SYN_scan(c, m.edgeEv[e.i], t);
    const hl = (selI >= 0 && (e.a === selI || e.b === selI) ? 0.36 : 0) || (hovI >= 0 && (e.a === hovI || e.b === hovI) ? 0.46 : 0);
    c.boost = Math.max(c.act, hl);
    if (c.act > focus) focus = c.act;
    const bb = clamp(1 - (t - e.appear) / 2.4, 0, 1);
    c.birth = bb * bb;
    c.fog = clamp(1.12 - ((e.zc - (dist - 170)) / 340) * 0.78, 0.3, 1);
    c.kss = clamp(e.km / kr, 0.5, 1.9);
    c.st = c.len < 70 ? 4 : q >= 2 && c.len > 150 ? 2 : 3;
    list.push(e);
  }
  list.sort(SYN_CMP);

  // ---------- idle lines + fibre fans, bucketed by colour class (additive blending: order inside a bucket is irrelevant) ----------
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 1;
  SYN_HEAD.fill(-1);
  let ni = 0;
  const fanOn = q >= 2;
  for (let li = 0; li < list.length; li++) {
    const e = list[li];
    const c = e.synN;
    const K = SYN_STY[e.kind] || SYN_STY.link;
    const fog = c.fog;
    const use = 1 - Math.exp(-c.uses * 0.55);
    const ramp = e.kind === 'report' ? ease(clamp((t - e.appear) / 3, 0, 1)) * 0.65 + 0.35 : 1;
    const breath = rm ? 1 : 0.92 + 0.08 * Math.sin(fx * 0.9 + e.i * 1.7);
    const dimF = 1 - 0.22 * focus * (1 - Math.min(1, c.boost * 2));
    const idle = (K.a * (0.75 + 0.25 * use) * ramp * breath + c.mem * 0.12 + c.birth * 0.4 * K.br) * dimF * fog;
    c.idle = idle;
    if (c.ci < 0 || ni >= 1000) {
      // no bucket slot left for this colour (only after 64 distinct colours): stroke it on its own
      if (idle < 0.035) continue;
      const n0 = SYN_trunk(e, e.up, c.st);
      ctx.beginPath();
      SYN_curve(ctx, n0);
      SYN_dash(ctx, K.dash, c.kss);
      ctx.strokeStyle = c.cm;
      ctx.globalAlpha = Math.min(0.5, idle);
      ctx.lineWidth = Math.max(0.8, K.w * c.kss);
      ctx.stroke();
      ctx.setLineDash(SYN_D0);
      ctx.globalAlpha = 1;
      continue;
    }
    const wk = K.w * c.kss;
    const wl = wk < 1.12 ? 1 : wk < 1.5 ? 2 : 3;
    let al = Math.round(idle / 0.085);
    if (al > 5) al = 5;
    if (al < 0) al = 0;
    if (al === 0 && idle < 0.035) continue;
    let bk = ((c.ci * 3 + K.dash) * 4 + wl) * 6 + al;
    SYN_IE[ni] = li; SYN_IS[ni] = 0; SYN_NEXT[ni] = SYN_HEAD[bk]; SYN_HEAD[bk] = ni; ni++;
    if (fanOn && K.fan && e.up > 4 && c.len > 48 && c.ci0 >= 0 && c.ci1 >= 0 && ni < 999) {
      let fa = Math.round((idle * 0.6) / 0.085);
      if (fa > 4) fa = 4;
      if (fa >= 1) {
        bk = ((c.ci0 * 3) * 4 + 0) * 6 + fa;
        SYN_IE[ni] = li; SYN_IS[ni] = -1; SYN_NEXT[ni] = SYN_HEAD[bk]; SYN_HEAD[bk] = ni; ni++;
        bk = ((c.ci1 * 3) * 4 + 0) * 6 + fa;
        SYN_IE[ni] = li; SYN_IS[ni] = 1; SYN_NEXT[ni] = SYN_HEAD[bk]; SYN_HEAD[bk] = ni; ni++;
        if (e.kind !== 'link' && ni < 998) {
          // third, wider fibre in the mid colour at the lowest visible level (denser bundle on spoke / report trunks)
          bk = ((c.ci * 3) * 4 + 0) * 6 + (fa > 2 ? fa - 1 : 1);
          SYN_IE[ni] = li; SYN_IS[ni] = (e.i & 1) ? 2 : -2; SYN_NEXT[ni] = SYN_HEAD[bk]; SYN_HEAD[bk] = ni; ni++;
        }
      }
    }
  }
  const nb = SYN_HEAD.length;
  let curDash = 0;
  for (let bk = 0; bk < nb; bk++) {
    let it = SYN_HEAD[bk];
    if (it < 0) continue;
    const al = bk % 6;
    const wl = ((bk / 6) | 0) % 4;
    const dash = ((bk / 24) | 0) % 3;
    const ci = (bk / 72) | 0;
    if (dash !== curDash) { SYN_dash(ctx, dash, 1); curDash = dash; }
    ctx.strokeStyle = SYN_col(ci, al);
    ctx.lineWidth = SYN_WL[wl];
    ctx.beginPath();
    while (it >= 0) {
      const e = list[SYN_IE[it]];
      const c = e.synN;
      const side = SYN_IS[it];
      let n;
      if (side === 0) n = SYN_trunk(e, e.up, c.st);
      else if (side === 2 || side === -2) n = SYN_fibre(e, e.up, c.st < 3 ? 3 : c.st, side >> 1, 10.5 * c.kss, e.i * 1.3 + 2.1);
      else n = SYN_fibre(e, e.up, c.st < 3 ? 3 : c.st, side, 6 * c.kss, e.i * 1.3);
      SYN_curve(ctx, n);
      it = SYN_NEXT[it];
    }
    ctx.stroke();
  }
  if (curDash) ctx.setLineDash(SYN_D0);

  // ---------- live edges (message in flight / afterglow / hover / selection): drawn individually on top ----------
  for (let li = 0; li < list.length; li++) {
    const e = list[li];
    const c = e.synN;
    const K = SYN_STY[e.kind] || SYN_STY.link;
    const boost = c.boost;
    const fog = c.fog;
    const ks = c.kss;
    if (boost > 0.06) {
      const wk = K.w * ks;
      const n = SYN_trunk(e, e.up, c.st);
      ctx.beginPath();
      SYN_curve(ctx, n);
      SYN_dash(ctx, K.dash, ks);
      if (q >= 1) {
        ctx.strokeStyle = c.cb;
        ctx.globalAlpha = Math.min(0.5, boost * 0.45) * fog;
        ctx.lineWidth = (1.5 + 1.3 * boost) * wk;
        ctx.stroke();
      }
      ctx.strokeStyle = c.cw;
      ctx.globalAlpha = Math.min(0.62, 0.12 + boost * 0.55) * fog;
      ctx.lineWidth = Math.max(0.8, ks * (0.6 + 0.5 * boost));
      ctx.stroke();
      ctx.setLineDash(SYN_D0);
      if (q >= 1 && c.fl > 0) {
        // signal pulses: five bright dots travelling along the line while the conversation is live
        const dr = c.dir >= 0 ? 1 : -1;
        ctx.fillStyle = SYN_WHT;
        ctx.globalAlpha = 0.6 * fog;
        for (let j = 0; j < 5; j++) {
          let v = j * 0.2 + (rm ? 0.1 : dr * fx * 0.45);
          v -= Math.floor(v);
          SYN_at(e, c.ks, v * e.g, SYN_O);
          const sz = Math.max(1.4, 2 * clamp(SYN_O[4], 0.5, 1.9));
          ctx.fillRect(SYN_O[0] - sz * 0.5, SYN_O[1] - sz * 0.5, sz, sz);
        }
      }
      ctx.globalAlpha = 1;
    }
    // terminal boutons on the rim of the neuron: a tinted dot on the trunk lines, a flare when a message leaves or lands
    if (e.g >= 1) {
      const hotA = Math.max(c.fa * (rm ? 0.5 : 1), boost * 0.5);
      const hotB = Math.max(c.fb * (rm ? 0.5 : 1), boost * 0.5);
      if (K.bead || hotA > 0.25 || hotB > 0.25) {
        const na = nodes[e.a];
        const nb2 = nodes[e.b];
        const lim = c.len * 0.3;
        const ra = Math.min(lim, na.r * c.ks[0] * kr * 1.2 + 3);
        const rb = Math.min(lim, nb2.r * c.ks[e.n - 1] * kr * 1.2 + 3);
        for (let end = 0; end < 2; end++) {
          const hot = end === 0 ? hotA : hotB;
          if (!K.bead && hot <= 0.25) continue;
          if (q < 1 && hot <= 0.25) continue;
          SYN_atD(e, c, end === 0 ? ra : c.len - rb, SYN_O);
          const col = end === 0 ? c.p0 : c.p1;
          const bs = SYN_O[4] > 0.2 ? clamp(SYN_O[4], 0.5, 1.9) : ks;
          if (hot > 0.25) {
            glow(ctx, SYN_O[0], SYN_O[1], (3 + 5 * hot) * bs, col, (0.3 + 0.6 * hot) * fog);
            ctx.fillStyle = SYN_WHT;
            ctx.globalAlpha = Math.min(1, 0.4 + 0.6 * hot) * fog;
            const rr = (0.9 + 0.8 * hot) * bs;
            ctx.fillRect(SYN_O[0] - rr, SYN_O[1] - rr, rr * 2, rr * 2);
          } else {
            ctx.fillStyle = col;
            ctx.globalAlpha = (0.3 + 0.3 * boost) * fog;
            const rr = 1.1 * bs;
            ctx.fillRect(SYN_O[0] - rr, SYN_O[1] - rr, rr * 2, rr * 2);
          }
          ctx.globalAlpha = 1;
        }
      }
    } else {
      // growing tip of a line that is still being drawn
      const k2 = e.up - 1;
      glow(ctx, e.sx[k2], e.sy[k2], 8 * ks, c.p1, 0.8 * fog);
      glow(ctx, e.sx[k2], e.sy[k2], 3 * ks, SYN_WHT, 0.9 * fog);
      if (q >= 1) {
        ctx.fillStyle = c.p1;
        for (let j = 0; j < 4; j++) {
          const ph = rm ? (j + 0.5) / 4 : (fx * 2.4 + j * 0.25 + e.i * 0.31) % 1;
          const an = j * 1.9 + e.i * 2.3;
          const rr = ph * 10 * ks;
          const sz = Math.max(1, (1 - ph * 0.5) * 1.8 * ks);
          ctx.globalAlpha = (1 - ph) * 0.9 * fog;
          ctx.fillRect(e.sx[k2] + Math.cos(an) * rr - sz * 0.5, e.sy[k2] + Math.sin(an) * rr - sz * 0.5, sz, sz);
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  // ---------- message impulses (comets) on top of all lines ----------
  const TN = 10;
  for (let li = 0; li < list.length; li++) {
    const e = list[li];
    const c = e.synN;
    if (!c.fl) continue;
    const evs = m.edgeEv[e.i];
    const fog = c.fog;
    const ks = c.kss;
    for (let k = 0; k < evs.length; k++) {
      const ev = evs[k];
      const age = t - ev.t;
      if (age < 0) break;
      if (age > FLIGHT) continue;
      const u0 = ease(clamp(age / FLIGHT, 0, 1));
      let u = ev.dir > 0 ? u0 : 1 - u0;
      if (ev.dir > 0 && u > e.g) u = e.g;
      const td = ev.dir > 0 ? -1 : 1;
      const col = pulseColor(ev, nodes);
      const big = ev.kind === 'critique' || ev.kind === 'approve' || ev.kind === 'revision' ? 1.2 : 1;
      const grow = clamp(age / 0.2, 0.3, 1) * big;
      const span = 0.16 + 0.28 * (1 - Math.abs(2 * u0 - 1));
      for (let j = 0; j < TN; j++) {
        SYN_at(e, c.ks, clamp(u + (td * j * span) / (TN - 1), 0, 1), SYN_O);
        SYN_TX[j] = SYN_O[0]; SYN_TY[j] = SYN_O[1];
      }
      SYN_at(e, c.ks, u, SYN_O);
      const hx = SYN_O[0];
      const hy = SYN_O[1];
      const tgx = SYN_O[2];
      const tgy = SYN_O[3];
      const kh = clamp(SYN_O[4] > 0.2 ? SYN_O[4] : ks, 0.5, 1.9) * grow;
      // particle tail: tapered ribbon = solid strokes of decreasing length (no gradients), fading into the dark
      ctx.lineCap = 'round';
      ctx.strokeStyle = col;
      for (let ly = 0; ly < 3; ly++) {
        const cnt = ly === 0 ? TN : ly === 1 ? 7 : 4;
        ctx.beginPath();
        ctx.moveTo(SYN_TX[0], SYN_TY[0]);
        for (let j = 1; j < cnt; j++) ctx.lineTo(SYN_TX[j], SYN_TY[j]);
        ctx.globalAlpha = (ly === 0 ? 0.14 : ly === 1 ? 0.3 : 0.6) * fog;
        ctx.lineWidth = (ly === 0 ? 7 : ly === 1 ? 3.8 : 1.8) * kh;
        ctx.stroke();
      }
      ctx.strokeStyle = SYN_WHT;
      ctx.beginPath();
      ctx.moveTo(SYN_TX[0], SYN_TY[0]);
      ctx.lineTo(SYN_TX[1], SYN_TY[1]);
      ctx.lineTo(SYN_TX[2], SYN_TY[2]);
      ctx.globalAlpha = 0.8 * fog;
      ctx.lineWidth = Math.max(1, 1.2 * kh);
      ctx.stroke();
      // dust along the tail and sparks flung out of the head
      ctx.fillStyle = col;
      const bu = ev.burst;
      for (let j = 1; j < TN; j++) {
        const jx = bu[j * 3] * 3.4 * kh * (j / TN + 0.3);
        const jy = bu[j * 3 + 1] * 3.4 * kh * (j / TN + 0.3);
        const sz = Math.max(1, (2.2 - j * 0.17) * kh);
        ctx.globalAlpha = (0.9 - j * 0.08) * fog;
        ctx.fillRect(SYN_TX[j] + jx - sz * 0.5, SYN_TY[j] + jy - sz * 0.5, sz, sz);
      }
      const ns = q >= 2 ? 6 : q === 1 ? 3 : 0;
      for (let j = 0; j < ns; j++) {
        const ph = rm ? (j + 0.5) / ns : (fx * 2.1 + j * 0.125 + ev.i * 0.37) % 1;
        const tj = ph * (TN - 2) * 0.7;
        const i0 = Math.min(TN - 2, tj | 0);
        const kk = tj - i0;
        const bx = SYN_TX[i0] + (SYN_TX[i0 + 1] - SYN_TX[i0]) * kk + bu[j * 3] * ph * 15 * kh;
        const by = SYN_TY[i0] + (SYN_TY[i0 + 1] - SYN_TY[i0]) * kk + bu[j * 3 + 1] * ph * 15 * kh;
        const sz = Math.max(1, (1 - ph * 0.55) * 2 * kh);
        ctx.fillStyle = j & 1 ? SYN_WHT : col;
        ctx.globalAlpha = (1 - ph) * 0.95 * fog;
        ctx.fillRect(bx - sz * 0.5, by - sz * 0.5, sz, sz);
      }
      ctx.globalAlpha = 1;
      // head: tinted halo, crisp white core, light cross along and across the path
      glow(ctx, hx, hy, 16 * kh, col, 0.7 * fog);
      glow(ctx, hx, hy, 6 * kh, SYN_WHT, 0.95 * fog);
      if (q >= 1) {
        ctx.strokeStyle = SYN_WHT;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.45 * fog;
        ctx.beginPath();
        const fa = 18 * kh;
        const fb = 7 * kh;
        ctx.moveTo(hx - tgx * fa * (td < 0 ? 0.35 : 1), hy - tgy * fa * (td < 0 ? 0.35 : 1));
        ctx.lineTo(hx + tgx * fa * (td < 0 ? 1 : 0.35), hy + tgy * fa * (td < 0 ? 1 : 0.35));
        ctx.moveTo(hx + tgy * fb, hy - tgx * fb);
        ctx.lineTo(hx - tgy * fb, hy + tgx * fb);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (ev.carry >= 0) diamond(ctx, hx, hy, Math.max(3.6, 5 * kh), nodes[ev.carry].color, nodes[ev.carry].light, rm ? 0 : fx * 3, fog);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1;
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.setLineDash(SYN_D0);
  return list;
}
// @@MODULE:SYNAPSES-END

// @@MODULE:FLOWS-BEGIN
// particle flows: ambient streams along the synapses, thin Hermes bipolar jets, inflow spiralling along the lane plane.
// Everything is a pure function of (fx, edge index, particle index): phases are seeded once into typed arrays.
// Cost discipline: at most FLW_CAP particles per edge INCLUDING hover / selection / activity boosts, dots batched by colour
// bucket (fillRect), streaks only on live or backbone lines, one plasma bead and one file glyph per edge.
// The jets start 52 world units from the core and stay thin and dim near it (the core's black hole + accretion disk are
// drawn by NEURONS); the inflow dust fades out before it reaches 55 units.
const FLW_E = 192;
const FLW_PP = 12;
const FLW_CAP = 9;
const FLW_PH = new Float32Array(FLW_E * FLW_PP);
const FLW_SP = new Float32Array(FLW_E * FLW_PP);
const FLW_LA = new Float32Array(FLW_E * FLW_PP);
const FLW_LR = new Float32Array(FLW_E * FLW_PP);
const FLW_SZ = new Float32Array(FLW_E * FLW_PP);
const FLW_JN = 36;
const FLW_JPH = new Float32Array(FLW_JN * 2);
const FLW_JRF = new Float32Array(FLW_JN * 2);
const FLW_JSW = new Float32Array(FLW_JN * 2);
const FLW_JSP = new Float32Array(FLW_JN * 2);
const FLW_IN = 72;
const FLW_IPH = new Float32Array(FLW_IN);
const FLW_ITH = new Float32Array(FLW_IN);
const FLW_ISP = new Float32Array(FLW_IN);
const FLW_IH = new Float32Array(FLW_IN);
const FLW_X = new Float32Array(128);
const FLW_Y = new Float32Array(128);
const FLW_X2 = new Float32Array(128);
const FLW_Y2 = new Float32Array(128);
const FLW_A = new Float32Array(128);
const FLW_S = new Float32Array(128);
const FLW_B = new Uint8Array(128);
const FLW_O = [0, 0, 0, 0, 0];
const FLW_PC = ['#FFF', '#FFF', '#FFF'];
(function () {
  const r = mulberry(90210);
  for (let i = 0; i < FLW_E; i++) {
    const off = r();
    for (let p = 0; p < FLW_PP; p++) {
      const k = i * FLW_PP + p;
      const v = p * 0.6180339887 + off;
      FLW_PH[k] = v - Math.floor(v);
      FLW_SP[k] = 0.72 + r() * 0.56;
      FLW_LA[k] = r() * 6.2832;
      FLW_LR[k] = 0.3 + 0.7 * Math.sqrt(r());
      FLW_SZ[k] = r();
    }
  }
  for (let p = 0; p < FLW_JN * 2; p++) {
    const v = (p % FLW_JN) * 0.6180339887 + (p >= FLW_JN ? 0.37 : 0);
    FLW_JPH[p] = v - Math.floor(v);
    FLW_JRF[p] = 0.25 + 0.75 * Math.sqrt(r());
    FLW_JSW[p] = r() * 6.2832;
    FLW_JSP[p] = 0.8 + 0.4 * r();
  }
  for (let p = 0; p < FLW_IN; p++) {
    const v = p * 0.6180339887;
    FLW_IPH[p] = v - Math.floor(v);
    FLW_ITH[p] = (p % 3) * 2.0944 + (r() - 0.5) * 0.14;
    FLW_ISP[p] = 0.75 + 0.5 * r();
    FLW_IH[p] = r() * 2 - 1;
  }
})();
// per kind: n = ambient particles at full quality, sp = world units / s, tube = stream radius px, a = brightness, fwd = flows a->b only
const FLW_STY = {
  spoke: { n: 5, sp: 18, tube: 3.0, a: 0.55, fwd: 0, sk: 1, bd: 1 },
  link: { n: 4, sp: 17, tube: 3.0, a: 0.55, fwd: 0, sk: 1, bd: 1 },
  chat: { n: 4, sp: 17, tube: 3.0, a: 0.52, fwd: 0, sk: 0, bd: 0 },
  report: { n: 7, sp: 24, tube: 3.6, a: 0.9, fwd: 1, sk: 1, bd: 1 },
  author: { n: 2, sp: 11, tube: 1.8, a: 0.45, fwd: 1, sk: 0 },
  deliver: { n: 2, sp: 14, tube: 2, a: 0.48, fwd: 1, sk: 0 },
  lineage: { n: 1, sp: 12, tube: 1.6, a: 0.36, fwd: 1, sk: 0 },
  decision: { n: 1, sp: 10, tube: 1.7, a: 0.4, fwd: 1, sk: 0 },
};
const FLW_JC = ['#FFF6D8', '#FFD27A', '#FFAE5C'];
const FLW_IC = ['#8CB4FF', '#CDBBFF', '#FFE2A8'];
const FLW_GL = {};
// file glyph sprite (small two-tone diamond) cached per colour; null when OffscreenCanvas is not available
function FLW_glyph(col, lit) {
  let g = FLW_GL[col];
  if (g !== undefined) return g;
  g = null;
  try {
    if (typeof OffscreenCanvas === 'function') {
      const cv = new OffscreenCanvas(24, 28);
      const x = cv.getContext('2d');
      if (x) {
        x.fillStyle = col;
        x.beginPath(); x.moveTo(12, 3); x.lineTo(19, 13); x.lineTo(12, 24); x.lineTo(5, 13); x.closePath(); x.fill();
        x.fillStyle = lit;
        x.beginPath(); x.moveTo(12, 3); x.lineTo(19, 13); x.lineTo(12, 24); x.closePath(); x.fill();
        x.strokeStyle = 'rgba(255,255,255,0.75)';
        x.lineWidth = 1;
        x.beginPath(); x.moveTo(12, 3); x.lineTo(19, 13); x.lineTo(12, 24); x.lineTo(5, 13); x.closePath(); x.stroke();
        g = cv;
      }
    }
  } catch (e) { g = null; }
  FLW_GL[col] = g;
  return g;
}
const FLW_AX = [0, 0, 0];
const FLW_U1 = [1, 0, 0];
const FLW_U2 = [0, 0, 0];

function FLW_at(e, ks, u, o) {
  const n1 = e.n - 1;
  let ff = u * n1;
  if (!(ff > 0)) ff = 0;
  if (ff > n1 - 0.0001) ff = n1 - 0.0001;
  const i = ff | 0;
  const k = ff - i;
  const x0 = e.sx[i];
  const y0 = e.sy[i];
  const dx = e.sx[i + 1] - x0;
  const dy = e.sy[i + 1] - y0;
  const l = Math.sqrt(dx * dx + dy * dy) || 1;
  o[0] = x0 + dx * k; o[1] = y0 + dy * k; o[2] = dx / l; o[3] = dy / l; o[4] = ks[i] + (ks[i + 1] - ks[i]) * k;
}
// draw the particles collected in the scratch arrays, batched by colour bucket
function FLW_batch(ctx, n, streaks, sw) {
  for (let b = 0; b < 3; b++) {
    let any = false;
    let sa = 0;
    let sn = 0;
    for (let p = 0; p < n; p++) if (FLW_B[p] === b) { any = true; sa += FLW_A[p]; sn++; }
    if (!any) continue;
    ctx.fillStyle = FLW_PC[b];
    for (let p = 0; p < n; p++) {
      if (FLW_B[p] !== b) continue;
      const s = FLW_S[p];
      ctx.globalAlpha = FLW_A[p];
      ctx.fillRect(FLW_X[p] - s * 0.5, FLW_Y[p] - s * 0.5, s, s);
    }
    if (streaks && sn) {
      ctx.strokeStyle = FLW_PC[b];
      ctx.lineWidth = sw;
      ctx.globalAlpha = Math.min(0.7, (sa / sn) * 0.55);
      ctx.beginPath();
      for (let p = 0; p < n; p++) {
        if (FLW_B[p] !== b || FLW_A[p] < 0.1) continue;
        ctx.moveTo(FLW_X2[p], FLW_Y2[p]);
        ctx.lineTo(FLW_X[p], FLW_Y[p]);
      }
      ctx.stroke();
    }
  }
}

function drawFlows(G, list) {
  const { ctx, m, t, fx, q, rm, kref, proj, dist } = G;
  const kr = kref > 0 ? kref : 1;
  const qs = q >= 2 ? 1 : q === 1 ? 0.55 : 0.25;
  const fxm = rm ? 0 : fx;
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';

  // ---------- ambient particles along the synapses ----------
  for (let li = 0; li < list.length; li++) {
    const e = list[li];
    const c = e.synN;
    if (!c || e.g < 0.03) continue;
    const K = FLW_STY[e.kind] || FLW_STY.link;
    const boost = c.boost;
    const use = 1 - Math.exp(-c.uses * 0.55);
    let ramp = 1;
    if (e.kind === 'report') ramp = 0.25 + 1.2 * ease(clamp((t - REPORT3D_AT) / 5, 0, 1));
    const fc = Math.min(FLW_CAP, (K.n * (0.75 + 0.25 * use) * ramp + boost * 5 + c.mem * 2) * qs);
    const np = Math.min(FLW_PP, Math.ceil(fc - 0.001));
    if (np <= 0) continue;
    const ks0 = clamp(e.km / kr, 0.5, 1.9);
    const spd = (K.sp * (1 + 1.8 * boost) * (e.kind === 'report' ? 0.7 + 0.6 * ramp : 1)) / (c.wl + 10);
    const base = (e.i % FLW_E) * FLW_PP;
    const fog = c.fog;
    const g = e.g;
    FLW_PC[0] = c.p0; FLW_PC[1] = c.pm; FLW_PC[2] = c.p1;
    let cnt = 0;
    let lead = 0;
    const live = boost > 0.1;
    for (let p = 0; p < np; p++) {
      const idx = base + p;
      // ambient particles alternate direction on conversational lines; flow lines are one-way; the extra (activity) ones follow the last message
      let dsg = 1;
      if (!K.fwd) dsg = p >= K.n * qs ? (c.dir >= 0 ? 1 : -1) : (p & 1 ? -1 : 1);
      let v = FLW_PH[idx] + dsg * fxm * spd * FLW_SP[idx];
      v -= Math.floor(v);
      const u = v * g;
      FLW_at(e, c.ks, u, FLW_O);
      const ang = FLW_LA[idx] + v * 7 + fxm * 0.7 * dsg;
      const ksl = clamp(FLW_O[4], 0.4, 1.9);
      const rad = FLW_LR[idx] * K.tube * (1 + boost * 0.9) * ksl;
      const off = Math.cos(ang) * rad;
      const df = Math.sin(ang);
      const env = Math.min(1, v * 6, (1 - v) * 6);
      const fade = clamp(fc - p, 0, 1);
      const al = K.a * (0.55 + 0.45 * (0.5 + 0.5 * df)) * env * fade * fog * (0.7 + 0.3 * Math.min(1, boost * 2 + c.birth));
      if (al < 0.02) continue;
      const x = FLW_O[0] - FLW_O[3] * off;
      const y = FLW_O[1] + FLW_O[2] * off;
      FLW_X[cnt] = x;
      FLW_Y[cnt] = y;
      const sl = rm || (!K.sk && !live) ? 0 : (2.2 + 6 * boost + (e.kind === 'report' ? 3 * ramp : 0)) * ksl;
      FLW_X2[cnt] = x - FLW_O[2] * dsg * sl;
      FLW_Y2[cnt] = y - FLW_O[3] * dsg * sl;
      FLW_S[cnt] = Math.max(1.3, (1.1 + 1.1 * FLW_SZ[idx] + boost * 0.9) * ksl * (0.85 + 0.3 * df));
      FLW_A[cnt] = Math.min(1, al);
      FLW_B[cnt] = v < 0.34 ? 0 : v < 0.67 ? 1 : 2;
      if (boost > 0.2 && lead < 2 && p < 2 && al > 0.25) {
        lead++;
        ctx.globalAlpha = 1;
        glow(ctx, x, y, 5.5 * ksl, FLW_PC[FLW_B[cnt]], Math.min(0.8, al * 0.8));
      }
      cnt++;
    }
    if (cnt) FLW_batch(ctx, cnt, q >= 1 && (K.sk || live) && !rm, Math.max(1, 1.1 * ks0));
    if (c.fc && q >= 1) {
      // a file glyph travelling along the delivery line (and into the report): a different shape than the plain data dots
      const gs = FLW_glyph(c.fc, c.fl2);
      let v = e.i * 0.371 + fxm * spd * 0.55;
      v -= Math.floor(v);
      FLW_at(e, c.ks, v * g, FLW_O);
      const env = Math.min(1, v * 6, (1 - v) * 6);
      const sc = 0.36 * clamp(FLW_O[4], 0.5, 1.9) * (e.kind === 'report' ? 1.15 : 1);
      const x = FLW_O[0];
      const y = FLW_O[1];
      ctx.globalAlpha = Math.min(1, 0.85 * env * fog * Math.min(1, ramp));
      if (gs) ctx.drawImage(gs, x - 12 * sc, y - 13 * sc, 24 * sc, 28 * sc);
      else {
        const rr = 9 * sc;
        ctx.fillStyle = c.fc;
        ctx.beginPath();
        ctx.moveTo(x, y - rr);
        ctx.lineTo(x + rr * 0.75, y);
        ctx.lineTo(x, y + rr * 1.15);
        ctx.lineTo(x - rr * 0.75, y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (K.bd && q >= 1) {
      // one slow soft plasma bead riding each backbone line
      ctx.globalAlpha = 1;
      let v = e.i * 0.173 + fxm * spd * 0.7;
      v -= Math.floor(v);
      FLW_at(e, c.ks, v * g, FLW_O);
      const env = Math.min(1, v * 5, (1 - v) * 5);
      glow(ctx, FLW_O[0], FLW_O[1], (5 + 5 * boost) * clamp(FLW_O[4], 0.5, 1.9), v < 0.5 ? c.p0 : c.p1, (0.18 + 0.4 * boost) * env * fog * Math.min(1, ramp));
    }
  }

  // ---------- inflow: dust spiralling in along the lane plane toward the core (fades out before 55 world units) ----------
  const nIn = Math.round(FLW_IN * qs);
  const inS = 0.6 * clamp(t / 3, 0, 1) * (t > 56 ? 1 + 0.4 * clamp((t - 56) / 2, 0, 1) : 1);
  if (nIn > 0 && inS > 0.01) {
    const hx = m.P[0];
    const hy = m.P[1];
    const hz = m.P[2];
    FLW_PC[0] = FLW_IC[0]; FLW_PC[1] = FLW_IC[1]; FLW_PC[2] = FLW_IC[2];
    let cnt = 0;
    for (let p = 0; p < nIn; p++) {
      const pi = (p * (FLW_IN / nIn)) | 0;
      let s = FLW_IPH[pi] + fxm * 0.034 * FLW_ISP[pi];
      s -= Math.floor(s);
      const r1 = 56 + 150 * Math.pow(1 - s, 1.6);
      const th = FLW_ITH[pi] + 7.4 * Math.pow(s, 1.3);
      const hj = FLW_IH[pi] * 6 * (r1 / 200);
      const pr = proj(hx + Math.cos(th) * r1, hy + Math.sin(th) * r1 * LT_S + hj, hz + Math.sin(th) * r1 * LT_C);
      if (pr[3] < NEAR) continue;
      const px = pr[0];
      const py = pr[1];
      const pz = pr[3];
      const kk = clamp(pr[2] / kr, 0.4, 2);
      const s2 = Math.max(0, s - (0.008 + 0.05 * s));
      const r2 = 56 + 150 * Math.pow(1 - s2, 1.6);
      const th2 = FLW_ITH[pi] + 7.4 * Math.pow(s2, 1.3);
      const pr2 = proj(hx + Math.cos(th2) * r2, hy + Math.sin(th2) * r2 * LT_S + hj, hz + Math.sin(th2) * r2 * LT_C);
      const fog = clamp(1.1 - ((pz - (dist - 170)) / 340) * 0.7, 0.35, 1);
      FLW_X[cnt] = px;
      FLW_Y[cnt] = py;
      FLW_X2[cnt] = rm ? px : pr2[0];
      FLW_Y2[cnt] = rm ? py : pr2[1];
      FLW_S[cnt] = Math.max(1.3, (1.1 + 1.2 * s) * kk);
      FLW_A[cnt] = inS * Math.min(1, s * 9, (1 - s) * 4) * (0.35 + 0.65 * s) * fog;
      FLW_B[cnt] = s < 0.4 ? 0 : s < 0.75 ? 1 : 2;
      cnt++;
    }
    if (cnt) FLW_batch(ctx, cnt, q >= 1 && !rm, 1.1);
  }

  // ---------- thin Hermes bipolar jets along the lane-plane axis (they leave the inner 50 units to the core) ----------
  const up = clamp((t - 12) / 5, 0, 1);
  const dn = clamp((52 - t) / 5, 0, 1);
  const coord = ease(Math.min(up, dn));
  const beat = rm ? 1 : 0.9 + 0.1 * Math.sin(fx * 1.3);
  let hf = 0;
  const ev = m.ev;
  for (let i = 0; i < ev.length; i++) {
    const v = ev[i];
    if (v.t > t) break;
    if (t - v.t > 2.2) continue;
    if (v.from === 0 || v.to === 0) { const a = t - v.t; hf = Math.max(hf, a < 0.2 ? a / 0.2 : Math.exp(-(a - 0.2) * 1.5)); }
  }
  const jS = clamp(t / 3, 0, 1) * (0.4 + 0.6 * coord) * beat * (1 + 0.4 * hf * (rm ? 0.4 : 1)) * (t > 52 ? 1 + 0.3 * clamp((t - 56) / 2, 0, 1) : 1);
  const nJ = Math.round(FLW_JN * qs);
  const J0 = 52;
  if (nJ > 0 && jS > 0.01) {
    const hx = m.P[0];
    const hy = m.P[1];
    const hz = m.P[2];
    FLW_AX[0] = 0; FLW_AX[1] = LT_C; FLW_AX[2] = -LT_S;
    FLW_U2[0] = 0; FLW_U2[1] = -LT_S; FLW_U2[2] = -LT_C;
    const repOn = t >= REPORT3D_AT - 0.8;
    const repK = repOn ? ease(clamp((t - (REPORT3D_AT - 0.8)) / 2, 0, 1)) : 0;
    FLW_PC[0] = FLW_JC[0]; FLW_PC[1] = FLW_JC[1]; FLW_PC[2] = FLW_JC[2];
    for (let dr = 0; dr < 2; dr++) {
      const dir = dr === 0 ? 1 : -1;
      const JL = dir > 0 ? 110 - 70 * repK : 96;
      if (JL < 10) continue;
      const strength = jS * (dir > 0 ? 1 : 0.8) * (dir > 0 && repOn ? 0.7 : 1);
      // spine: gradient from a dim warm base to nothing, soft narrow body + a hairline
      ctx.globalAlpha = 1;
      const b0 = proj(hx + FLW_AX[0] * dir * J0, hy + FLW_AX[1] * dir * J0, hz + FLW_AX[2] * dir * J0);
      const bx = b0[0];
      const by = b0[1];
      const bz = b0[3];
      const bk = clamp(b0[2] / kr, 0.5, 1.9);
      const b1 = proj(hx + FLW_AX[0] * dir * (J0 + JL), hy + FLW_AX[1] * dir * (J0 + JL), hz + FLW_AX[2] * dir * (J0 + JL));
      if (bz >= NEAR && b1[3] >= NEAR) {
        const gr = ctx.createLinearGradient(bx, by, b1[0], b1[1]);
        gr.addColorStop(0, '#000000');
        gr.addColorStop(0.18, '#FFD27A');
        gr.addColorStop(1, '#000000');
        ctx.strokeStyle = gr;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(b1[0], b1[1]);
        ctx.globalAlpha = 0.1 * strength;
        ctx.lineWidth = 5 * bk;
        ctx.stroke();
        ctx.globalAlpha = 0.3 * strength;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // two plasma knots travelling outwards
      for (let i = 0; i < 2; i++) {
        let sk = i / 2 + fxm * 0.17 + dr * 0.19;
        sk -= Math.floor(sk);
        const d = J0 + 4 + sk * JL;
        const kp = proj(hx + FLW_AX[0] * dir * d, hy + FLW_AX[1] * dir * d, hz + FLW_AX[2] * dir * d);
        if (kp[3] < NEAR) continue;
        const kk = clamp(kp[2] / kr, 0.5, 1.9);
        const fa = strength * Math.min(1, sk * 8) * (1 - sk);
        glow(ctx, kp[0], kp[1], (4 + 4 * (1 - sk)) * kk, '#FFE2A0', 0.45 * fa);
      }
      let cnt = 0;
      for (let p = 0; p < nJ; p++) {
        const pi = dr * FLW_JN + ((p * (FLW_JN / nJ)) | 0);
        let s = FLW_JPH[pi] + fxm * 0.15 * FLW_JSP[pi];
        s -= Math.floor(s);
        const sd = Math.pow(s, 1.35);
        const d = J0 + sd * JL;
        const rr = 0.8 + (d - J0) * 0.06 * FLW_JRF[pi];
        const an = FLW_JSW[pi] + s * 5.2 + fxm * 0.9 * dir;
        const ca = Math.cos(an) * rr;
        const sa = Math.sin(an) * rr;
        const pr = proj(hx + FLW_AX[0] * dir * d + FLW_U1[0] * ca + FLW_U2[0] * sa, hy + FLW_AX[1] * dir * d + FLW_U1[1] * ca + FLW_U2[1] * sa, hz + FLW_AX[2] * dir * d + FLW_U1[2] * ca + FLW_U2[2] * sa);
        if (pr[3] < NEAR) continue;
        const px = pr[0];
        const py = pr[1];
        const kk = clamp(pr[2] / kr, 0.4, 2);
        const s2 = Math.max(0, s - 0.04);
        const d2 = J0 + Math.pow(s2, 1.35) * JL;
        const rr2 = 0.8 + (d2 - J0) * 0.06 * FLW_JRF[pi];
        const an2 = FLW_JSW[pi] + s2 * 5.2 + fxm * 0.9 * dir;
        const ca2 = Math.cos(an2) * rr2;
        const sa2 = Math.sin(an2) * rr2;
        const pr2 = proj(hx + FLW_AX[0] * dir * d2 + FLW_U1[0] * ca2 + FLW_U2[0] * sa2, hy + FLW_AX[1] * dir * d2 + FLW_U1[1] * ca2 + FLW_U2[1] * sa2, hz + FLW_AX[2] * dir * d2 + FLW_U1[2] * ca2 + FLW_U2[2] * sa2);
        const wave = 0.5 + 0.5 * Math.sin(6.2832 * (s * 2.4 - fxm * 0.5) + (dir > 0 ? 0 : 1.7));
        FLW_X[cnt] = px;
        FLW_Y[cnt] = py;
        FLW_X2[cnt] = rm ? px : pr2[0];
        FLW_Y2[cnt] = rm ? py : pr2[1];
        FLW_S[cnt] = Math.max(1.2, (1.0 + 1.0 * (1 - s)) * kk);
        FLW_A[cnt] = Math.min(1, strength * Math.pow(1 - s, 1.1) * (0.35 + 0.65 * wave) * Math.min(1, s * 6) * 0.9);
        FLW_B[cnt] = s < 0.2 ? 0 : s < 0.55 ? 1 : 2;
        cnt++;
      }
      if (cnt) FLW_batch(ctx, cnt, q >= 1 && !rm, 1);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return list;
}
// @@MODULE:FLOWS-END

// @@MODULE:NEURONS-BEGIN
// neurons: Hermes = BLACK HOLE (dark core that occludes, thin white-hot photon ring brighter on the approaching side, one
// soft gold corona, a lensed arc of the far disk over the core, and the NEAR half of the accretion disk drawn right after
// the core through gxAccDraw(G, 1) from GALAXY; the jets belong to FLOWS); agents = glossy orbs in their lane colour with the role
// letter (a.mono) in the middle + an orbital progress arc; files = crystal moons on their owner's orbit; decisions =
// binary comet-stars; report = a golden faceted crystal with ONE soft halo. Fills picks and the label candidate list.
// Luminance discipline: at most 2-3 additive layers anywhere near the centre, alpha <= 0.5 on big sprites; nothing is
// ever drawn INSIDE the dark core after it (the ignition glow goes before it), so the hole is dark from the first frame.
const NEU_CORE_K = 1.32; // the black hole is drawn larger than its model radius (n.r 20 -> ~26 world units of dark disc)
const NEU_TAU = 6.283185307179586;
const NEU = { orb: {}, pal: {}, font: {}, bk: 0 };
const NEU_EA = {}; // scratch ellipse
const NEU_LV = [0, 0, 0]; // scratch light vector (view space)
const NEU_VX = new Float32Array(16);
const NEU_VY = new Float32Array(16);
const NEU_INK = '#0B1026';
const NEU_CORE = '#03050E';

// offscreen canvas helper (null when unavailable: every user falls back to plain drawing)
function neuCv(w, h) {
  try {
    if (typeof OffscreenCanvas === 'function') {
      const c = new OffscreenCanvas(w, h);
      const g = c.getContext('2d');
      if (g) return { c, g };
    }
  } catch (e) { /* no offscreen canvas */ }
  return null;
}

// ---- baked sprites ----------------------------------------------------------------------------------------------------
// glossy orb per colour: lit from the upper left, darker limb, a soft top gloss; disc radius 60 px in a 128 px sprite
function neuOrb(hex) {
  let s = NEU.orb[hex];
  if (s !== undefined) return s;
  s = null;
  const cv = neuCv(128, 128);
  if (cv) {
    try {
      const g = cv.g;
      const lt = mixHex(hex, '#FFFFFF', 0.55);
      const dk = mixHex(hex, '#07102A', 0.45);
      const gr = g.createRadialGradient(50, 46, 2, 62, 62, 66);
      gr.addColorStop(0, lt);
      gr.addColorStop(0.3, mixHex(hex, '#FFFFFF', 0.12));
      gr.addColorStop(0.72, hex);
      gr.addColorStop(1, dk);
      g.fillStyle = gr;
      g.beginPath(); g.arc(64, 64, 60, 0, NEU_TAU); g.fill();
      // limb: a darker edge ring and a thin bright rim on the lit side
      const lm = g.createRadialGradient(64, 64, 44, 64, 64, 60);
      lm.addColorStop(0, 'rgba(4,8,24,0)');
      lm.addColorStop(1, 'rgba(4,8,24,0.42)');
      g.fillStyle = lm;
      g.beginPath(); g.arc(64, 64, 60, 0, NEU_TAU); g.fill();
      // gloss: a soft white highlight across the upper third
      g.save();
      g.beginPath(); g.arc(64, 64, 60, 0, NEU_TAU); g.clip();
      g.translate(64, 36); g.scale(1, 0.55);
      const sp = g.createRadialGradient(0, 0, 0, 0, 0, 46);
      sp.addColorStop(0, 'rgba(255,255,255,0.5)');
      sp.addColorStop(0.5, 'rgba(255,255,255,0.18)');
      sp.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = sp;
      g.fillRect(-48, -48, 96, 96);
      g.restore();
      g.lineWidth = 2;
      g.strokeStyle = rgba(lt, 0.55);
      g.beginPath(); g.arc(64, 64, 59, 3.4, 5.6); g.stroke();
      s = cv.c;
    } catch (e) { s = null; }
  }
  NEU.orb[hex] = s;
  return s;
}

// 8 shade levels (dark to bright) of a crystal colour: reused strings, no per-frame colour maths
function neuPal(hex) {
  let p = NEU.pal[hex];
  if (p) return p;
  p = [];
  // shadows keep the hue (darkened colour with a hint of violet), highlights go to white
  const bk = [0.8, 0.62, 0.44, 0.24];
  for (let i = 0; i < 8; i++) {
    const c = i < 4 ? mixHex(mixHex(hex, '#000000', bk[i]), '#2A1A6A', 0.1) : i === 4 ? hex : mixHex(hex, '#FFFFFF', [0, 0, 0, 0, 0, 0.25, 0.5, 0.85][i]);
    p.push(rgba(c, 0.98));
  }
  NEU.pal[hex] = p;
  return p;
}
// cached font strings per integer pixel size
function neuFont(px) {
  let f = NEU.font[px];
  if (!f) f = NEU.font[px] = '700 ' + px + 'px "IBM Plex Mono", ui-monospace, Menlo, monospace';
  return f;
}

// ---- geometry helpers -------------------------------------------------------------------------------------------------
// screen ellipse of a 3D circle (centre o, unit axes u1/u2, radius rad) as conjugate diameters -> axes + parameter mapping,
// so one ctx.ellipse call draws the orbit or any arc of it
function neuOrbit(G, ox, oy, oz, u1x, u1y, u1z, u2x, u2y, u2z, rad, E) {
  const proj = G.proj;
  let p = proj(ox, oy, oz);
  const cx = p[0]; const cy = p[1]; const dc = p[3];
  if (dc < NEAR) return false;
  p = proj(ox + u1x * rad, oy + u1y * rad, oz + u1z * rad);
  const ax = p[0] - cx; const ay = p[1] - cy; const da = p[3] - dc;
  p = proj(ox + u2x * rad, oy + u2y * rad, oz + u2z * rad);
  const bx = p[0] - cx; const by = p[1] - cy; const db = p[3] - dc;
  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const psi = 0.5 * Math.atan2(2 * (ax * bx + ay * by), a2 - b2);
  const cp = Math.cos(psi); const sp = Math.sin(psi);
  const ux = ax * cp + bx * sp; const uy = ay * cp + by * sp;
  const vx = -ax * sp + bx * cp; const vy = -ay * sp + by * cp;
  const rx = Math.hypot(ux, uy); const ry = Math.hypot(vx, vy);
  if (!(rx < 1e5) || !(ry < 1e5)) return false;
  E.cx = cx; E.cy = cy; E.ax = ax; E.ay = ay; E.bx = bx; E.by = by;
  E.rx = Math.max(0.01, rx); E.ry = Math.max(0.01, ry); E.rot = Math.atan2(uy, ux);
  E.psi = psi; E.same = ux * vy - uy * vx > 0; E.phi = Math.atan2(db, da);
  return true;
}
// append the arc of circle parameter a..b (a < b) to the current path
function neuArc(ctx, E, a, b) {
  ctx.ellipse(E.cx, E.cy, E.rx, E.ry, E.rot, E.same ? a - E.psi : E.psi - b, E.same ? b - E.psi : E.psi - a, false);
}
// light direction (towards the core at the origin) in view space (x right, y up, z towards the viewer), mixed with a camera fill light
function neuLight(G, wx, wy, wz, out) {
  const l = Math.hypot(wx, wy, wz) || 1;
  const dx = -wx / l; const dy = -wy / l; const dz = -wz / l;
  const x1 = dx * G.cyw - dz * G.syw;
  const z1 = dx * G.syw + dz * G.cyw;
  const y2 = dy * G.cpt - z1 * G.spt;
  const z2 = dy * G.spt + z1 * G.cpt;
  out[0] = x1 * 0.6; out[1] = y2 * 0.6 + 0.14; out[2] = -z2 * 0.6 + 0.36;
  return out;
}
// thin crossing diamonds through (x,y): n axes starting at angle a0, half length L, half width w (one path, caller fills)
function neuRays(ctx, x, y, a0, L, w, n) {
  ctx.beginPath();
  for (let k = 0; k < n; k++) {
    const a = a0 + (k * 3.141592653589793) / n;
    const c = Math.cos(a); const s = Math.sin(a);
    ctx.moveTo(x - c * L, y - s * L);
    ctx.lineTo(x - s * w, y + c * w);
    ctx.lineTo(x + c * L, y + s * L);
    ctx.lineTo(x + s * w, y - c * w);
  }
}
// four-point twinkle (two strokes in one path)
function neuTwinkle(ctx, x, y, L, a0) {
  const c = Math.cos(a0) * L; const s = Math.sin(a0) * L;
  ctx.beginPath();
  ctx.moveTo(x - c, y - s); ctx.lineTo(x + c, y + s);
  ctx.moveTo(x + s, y - c); ctx.lineTo(x - s, y + c);
  ctx.stroke();
}
// soft streak between two screen points using the shared radial sprite stretched along the segment (2 ends fade)
function neuStreak(ctx, x0, y0, x1, y1, w, hex, a, dpr) {
  if (!(a > 0.01)) return;
  const dx = x1 - x0; const dy = y1 - y0;
  const L = Math.hypot(dx, dy);
  if (!(L > 1)) return;
  const s = sprite(hex);
  if (!s) {
    ctx.lineWidth = Math.max(0.8, w * 0.4);
    ctx.strokeStyle = rgba(hex, a);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    return;
  }
  const c = dx / L; const sn = dy / L;
  ctx.setTransform(c * dpr, sn * dpr, -sn * dpr, c * dpr, x0 * dpr, y0 * dpr);
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * (a > 1 ? 1 : a);
  ctx.drawImage(s, 0, -w * 0.5, L, w);
  ctx.globalAlpha = ga;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// faceted gem (S-sided, pointed both ends): flat-shaded facets lit from the core, spinning about its axis, optional assembly from shards
function neuGem(ctx, x, y, R, ph, tl, pal, L, fog, asm, S, edge, bias) {
  const ct = Math.cos(tl); const st = Math.sin(tl);
  const step = NEU_TAU / S;
  const rho = 0.58; const yr = 0.3;
  NEU_VX[0] = x; NEU_VY[0] = y - ct * R;
  NEU_VX[1] = x; NEU_VY[1] = y + ct * R;
  for (let j = 0; j < S; j++) {
    const a = ph + (j + 0.5) * step;
    const X = Math.cos(a) * rho; const Z = Math.sin(a) * rho;
    NEU_VX[2 + j] = x + X * R; NEU_VX[2 + S + j] = x + X * R;
    NEU_VY[2 + j] = y - (yr * ct - Z * st) * R;
    NEU_VY[2 + S + j] = y - (-yr * ct - Z * st) * R;
  }
  const dh = 1 - yr;
  const rmid = rho * Math.cos(Math.PI / S);
  const nl = Math.hypot(dh, rmid);
  const cT = dh / nl; const sT = rmid / nl;
  const nf = 3 * S;
  const assembling = asm < 0.999;
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = 'rgba(255,255,255,0.46)';
  ctx.lineJoin = 'round';
  for (let pass = assembling ? 0 : 1; pass < 2; pass++) {
    for (let f = 0; f < nf; f++) {
      const kind = f < S ? 0 : f < 2 * S ? 1 : 2;
      const j = f - kind * S;
      const j1 = j + 1 < S ? j + 1 : 0;
      const am = ph + (j + 1) * step;
      const ca = Math.cos(am); const sa = Math.sin(am);
      let nx; let ny; let nz;
      if (kind === 0) { nx = cT * ca; ny = sT; nz = cT * sa; } else if (kind === 1) { nx = ca; ny = 0; nz = sa; } else { nx = cT * ca; ny = -sT; nz = cT * sa; }
      const ny2 = ny * ct - nz * st;
      const nz2 = ny * st + nz * ct;
      if ((nz2 > 0) !== (pass === 1)) continue;
      let si = ((bias + 0.9 * (nx * L[0] + ny2 * L[1] + nz2 * L[2])) * 7.99) | 0;
      if (pass === 0) si -= 3;
      let ox = 0; let oy = 0; let al = fog;
      if (assembling) {
        const e = ease(clamp(asm * 1.55 - (f / nf) * 0.55, 0, 1));
        const off = (1 - e) * R * 2.6;
        ox = nx * off; oy = -ny2 * off; al = fog * e;
        if (al < 0.01) continue;
      }
      ctx.globalAlpha = al;
      ctx.fillStyle = pal[si < 0 ? 0 : si > 7 ? 7 : si];
      ctx.beginPath();
      if (kind === 0) { ctx.moveTo(NEU_VX[0] + ox, NEU_VY[0] + oy); ctx.lineTo(NEU_VX[2 + j] + ox, NEU_VY[2 + j] + oy); ctx.lineTo(NEU_VX[2 + j1] + ox, NEU_VY[2 + j1] + oy); } else if (kind === 2) {
        ctx.moveTo(NEU_VX[1] + ox, NEU_VY[1] + oy); ctx.lineTo(NEU_VX[2 + S + j1] + ox, NEU_VY[2 + S + j1] + oy); ctx.lineTo(NEU_VX[2 + S + j] + ox, NEU_VY[2 + S + j] + oy);
      } else {
        ctx.moveTo(NEU_VX[2 + j] + ox, NEU_VY[2 + j] + oy); ctx.lineTo(NEU_VX[2 + S + j] + ox, NEU_VY[2 + S + j] + oy);
        ctx.lineTo(NEU_VX[2 + S + j1] + ox, NEU_VY[2 + S + j1] + oy); ctx.lineTo(NEU_VX[2 + j1] + ox, NEU_VY[2 + j1] + oy);
      }
      ctx.fill();
      if (edge && kind !== 2) { ctx.closePath(); ctx.stroke(); }
    }
  }
  ctx.globalAlpha = 1;
}

// ---- bodies -------------------------------------------------------------------------------------------------------------
// the black hole at the origin
function neuHermes(G, v, n, R, fog, dpr, ST) {
  const ctx = G.ctx; const q = G.q; const rm = G.rm; const fx = G.fx; const proj = G.proj;
  const x = v.x; const y = v.y;
  const br = rm ? 0.5 : 0.5 + 0.5 * Math.sin(fx * 1.1);
  // local plane angle pointing away from the camera (camera depth of a unit direction in the lane plane is maximal there)
  const aFar = Math.atan2(LT_S * G.spt + LT_C * G.cyw * G.cpt, G.syw * G.cpt);
  const aApp = aFar + 1.5708; // approaching side of the disk (matter moves at +angle)
  let p = proj(Math.cos(aFar) * 30, Math.sin(aFar) * 30 * LT_S, Math.sin(aFar) * 30 * LT_C);
  const phF = p[3] >= NEAR ? Math.atan2(p[1] - y, p[0] - x) : -1.5708;
  p = proj(Math.cos(aApp) * 30, Math.sin(aApp) * 30 * LT_S, Math.sin(aApp) * 30 * LT_C);
  const phA = p[3] >= NEAR ? Math.atan2(p[1] - y, p[0] - x) : 0;
  const ag = G.t - n.spawn;
  ctx.globalCompositeOperation = 'lighter';
  // corona: ONE soft gold glow (the accretion band sprite is the other additive layer here)
  glow(ctx, x, y, R * 2.3, '#FFB85C', 0.26 + 0.06 * br);
  // ignition at the very start of a run: a gold bloom BEHIND the core (the disc below occludes it: the hole is dark from
  // the first frame) and a ring expanding out of it (no white flash)
  const ign = ag < 1.8 && ag >= 0 ? ag / 1.8 : -1;
  if (ign >= 0) glow(ctx, x, y, R * (2 + 5 * ign), '#FFC46A', 0.3 * (1 - ign));
  // the dark core occludes everything behind it
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = NEU_CORE;
  ctx.beginPath(); ctx.arc(x, y, R * 0.96, 0, NEU_TAU); ctx.fill();
  // photon ring: thin white-hot, brighter on the approaching side
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  if (q >= 2) {
    ctx.lineWidth = Math.max(2, R * 0.13);
    ctx.strokeStyle = rgba('#FFC46A', 0.35);
    ctx.beginPath(); ctx.arc(x, y, R * 1.0, 0, NEU_TAU); ctx.stroke();
  }
  ctx.lineWidth = Math.max(1.2, R * 0.05);
  ctx.strokeStyle = rgba('#FFF6E0', 0.85);
  ctx.beginPath(); ctx.arc(x, y, R * 0.975, 0, NEU_TAU); ctx.stroke();
  ctx.lineWidth = Math.max(1.6, R * 0.08);
  ctx.strokeStyle = rgba('#FFFFFF', 0.55);
  ctx.beginPath(); ctx.arc(x, y, R * 0.975, phA - 1.25, phA + 1.25); ctx.stroke();
  // the near half of the accretion disk passes in front of the core
  if (typeof gxAccDraw === 'function') {
    try { gxAccDraw(G, 1); } catch (e) { /* keep drawing */ }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
  }
  // lensed image of the far side of the disk: the band bends over the core towards the far direction on screen
  // (at a shallow view the whole far half hides behind the core, so this arc is what makes it a black hole); it fades
  // out as the view turns face-on (intro, user orbit), where the far half is simply visible behind the core
  const fsn = LT_C * G.spt - LT_S * G.cyw * G.cpt; // camera-z of the plane normal: 1 face-on, 0 edge-on
  const la = clamp((0.72 - (fsn < 0 ? -fsn : fsn)) / 0.4, 0, 1);
  if (q >= 1 && la > 0.02) {
    ctx.globalAlpha = la;
    const rot = phF - 1.5708;
    const ex = x + Math.cos(phF) * R * 0.18; const ey = y + Math.sin(phF) * R * 0.18;
    const rx = R * 1.8; const ry = R * 1.36;
    if (q >= 2) {
      ctx.lineWidth = Math.max(4, R * 0.46);
      ctx.strokeStyle = rgba('#FF8A30', 0.26);
      ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry, rot, 0.12, 3.02, false); ctx.stroke();
    }
    ctx.lineWidth = Math.max(2, R * 0.2);
    ctx.strokeStyle = rgba('#FFC870', 0.42);
    ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry * 0.97, rot, 0.2, 2.94, false); ctx.stroke();
    ctx.lineWidth = Math.max(1.2, R * 0.075);
    ctx.strokeStyle = rgba('#FFF6E4', 0.8);
    ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry * 0.94, rot, 0.3, 2.84, false); ctx.stroke();
    // and the thin lensed near-side image hugging the bottom of the core
    ctx.lineWidth = Math.max(1, R * 0.06);
    ctx.strokeStyle = rgba('#FFE2A0', 0.34);
    ctx.beginPath(); ctx.ellipse(x - Math.cos(phF) * R * 0.12, y - Math.sin(phF) * R * 0.12, R * 1.2, R * 0.6, rot, 3.5, 5.9, false); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (ign >= 0) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba('#FFE9A8', (1 - ign) * 0.6);
    ctx.beginPath(); ctx.arc(x, y, R * (1.4 + 4 * ign), 0, NEU_TAU); ctx.stroke();
  }
}

function neuAgent(G, v, n, R, as, fog, dpr, ST) {
  const ctx = G.ctx; const q = G.q; const rm = G.rm; const fx = G.fx;
  const x = v.x; const y = v.y;
  const col = n.color;
  const wait = as.st === 'wait';
  const act = as.st === 'work' || as.st === 'review';
  const ph = rm ? 0.5 : 0.5 + 0.5 * Math.sin(fx * 3 + n.i);
  const rr = R * 1.72;
  const lw = Math.max(1.4, R * 0.105);
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, x, y, R * 3.2, col, (wait ? 0.1 : 0.2 + (act ? 0.12 * ph : 0.04)) * fog);
  // glossy orb
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = fog * (wait ? 0.78 : 1);
  const orb = neuOrb(col);
  if (orb) {
    const Rs = R * 64 / 60;
    ctx.drawImage(orb, x - Rs, y - Rs, Rs * 2, Rs * 2);
  } else {
    const gb = ctx.createRadialGradient(x - R * 0.3, y - R * 0.35, R * 0.05, x, y, R * 1.03);
    gb.addColorStop(0, rgba(n.light, 1));
    gb.addColorStop(0.55, rgba(col, 0.98));
    gb.addColorStop(1, 'rgba(10,16,48,1)');
    ctx.fillStyle = gb;
    ctx.beginPath(); ctx.arc(x, y, R, 0, NEU_TAU); ctx.fill();
  }
  if (wait) {
    ctx.globalAlpha = fog * 0.35;
    ctx.fillStyle = '#060A22';
    ctx.beginPath(); ctx.arc(x, y, R, 0, NEU_TAU); ctx.fill();
  }
  // role letter in the middle of the orb (dark ink on the bright orb), only when it can be legible
  if (R >= 11) {
    const px = R * 1.05 < 12 ? 12 : (R * 1.05) | 0;
    ctx.globalAlpha = fog * (wait ? 0.7 : 0.9);
    ctx.fillStyle = NEU_INK;
    ctx.font = neuFont(px);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(n.a && n.a.mono ? n.a.mono : n.label.charAt(0).toUpperCase(), x, y + px * 0.06);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'lighter';
  // ignition flash when the orb appears (lane colour, not white)
  const ag = G.t - n.spawn;
  if (ag < 1.5 && ag >= 0) {
    const e = ag / 1.5;
    glow(ctx, x, y, R * (2 + 2.5 * e), n.light, 0.45 * (1 - e));
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = rgba(col, (1 - e) * 0.75);
    ctx.beginPath(); ctx.arc(x, y, R * (1.2 + 2.4 * e), 0, NEU_TAU); ctx.stroke();
  }
  // orbital progress arc
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, lw * 0.55);
  if (wait) ctx.setLineDash([lw * 1.1, lw * 2.3]);
  ctx.strokeStyle = rgba('#9FB2EE', (wait ? 0.4 : 0.2) * fog);
  ctx.beginPath(); ctx.arc(x, y, rr, 0, NEU_TAU); ctx.stroke();
  ctx.setLineDash([]);
  if (as.prog > 0.004) {
    const a1 = -1.5708 + as.prog * NEU_TAU;
    if (q >= 2) {
      ctx.lineWidth = lw * 3;
      ctx.strokeStyle = rgba(col, 0.17 * fog);
      ctx.beginPath(); ctx.arc(x, y, rr, -1.5708, a1); ctx.stroke();
    }
    ctx.lineWidth = lw;
    if (as.st === 'review') ctx.setLineDash([lw * 0.45, lw * 1.7]);
    ctx.strokeStyle = rgba(mixHex(col, '#FFFFFF', 0.25), (as.st === 'work' ? 0.82 + 0.18 * ph : 0.98) * fog);
    ctx.beginPath(); ctx.arc(x, y, rr, -1.5708, a1); ctx.stroke();
    ctx.setLineDash([]);
    if (as.st === 'work' && q >= 1) {
      const a0 = Math.max(-1.5708, a1 - 0.55);
      ctx.lineWidth = lw * 1.7;
      ctx.strokeStyle = rgba('#FFFFFF', (0.35 + 0.3 * ph) * fog);
      ctx.beginPath(); ctx.arc(x, y, rr, a0, a1); ctx.stroke();
    }
    if (as.st === 'done' && q >= 2 && !rm) {
      const a0 = fx * 0.7 + n.i * 2.1;
      ctx.lineWidth = lw * 1.5;
      ctx.strokeStyle = rgba('#FFFFFF', 0.5 * fog);
      ctx.beginPath(); ctx.arc(x, y, rr, a0, a0 + 0.6); ctx.stroke();
    }
    if (as.st !== 'done') {
      const hxp = x + Math.cos(a1) * rr; const hyp = y + Math.sin(a1) * rr;
      glow(ctx, hxp, hyp, Math.max(5, R * 0.7), n.light, 0.9 * fog);
    }
  }
  if (act && !rm && q >= 2) {
    const pp = (fx * 0.9 + n.i * 0.37) % 1;
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = rgba(col, (1 - pp) * 0.34 * fog);
    ctx.beginPath(); ctx.arc(x, y, R * (1.9 + pp * 1.0), 0, NEU_TAU); ctx.stroke();
  }
  if (as.st === 'done') {
    const bx = x + Math.cos(-0.7854) * rr; const by = y + Math.sin(-0.7854) * rr;
    const br = Math.max(4.4, R * 0.4);
    glow(ctx, bx, by, br * 2.4, col, 0.55 * fog);
    ctx.fillStyle = rgba(col, 0.98 * fog);
    ctx.beginPath(); ctx.arc(bx, by, br, 0, NEU_TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = '#0B1020'; ctx.lineWidth = Math.max(1.3, br * 0.26);
    ctx.beginPath(); ctx.moveTo(bx - br * 0.48, by + br * 0.02); ctx.lineTo(bx - br * 0.1, by + br * 0.4); ctx.lineTo(bx + br * 0.55, by - br * 0.38); ctx.stroke();
  }
}

function neuFile(G, v, n, R, fog, dpr, ST) {
  const ctx = G.ctx; const q = G.q; const rm = G.rm; const fx = G.fx; const t = G.t;
  const x = v.x; const y = v.y;
  const col = n.color;
  const fin = n.file.ver === 'final';
  const age = t - n.spawn;
  const u = clamp(age / 1.1, 0, 1);
  const P = G.m.P;
  ctx.globalCompositeOperation = 'lighter';
  // faint orbit around the owner plus a comet-like trail behind the moon
  if (q >= 1 && u > 0.05) {
    const o = n.of * 3;
    const E = NEU_EA;
    if (neuOrbit(G, P[o], P[o + 1], P[o + 2], n.u1[0], n.u1[1], n.u1[2], n.u2[0], n.u2[1], n.u2[2], n.fr * ease(u), E)) {
      const th = n.fph + n.fw * Math.max(0, age) + fx * 0.12 * (n.fw > 0 ? 1 : -1);
      const dr = n.fw > 0 ? 1 : -1;
      const ga = fog * Math.min(1, v.s);
      ctx.lineCap = 'round';
      ctx.lineWidth = 1;
      if (q >= 2 && fin) {
        ctx.strokeStyle = rgba(col, 0.13 * ga);
        ctx.beginPath(); ctx.ellipse(E.cx, E.cy, E.rx, E.ry, E.rot, 0, NEU_TAU); ctx.stroke();
      }
      for (let s = 0; s < 2; s++) {
        const a0 = dr > 0 ? th - (s + 1) * 0.55 : th + s * 0.55;
        ctx.lineWidth = 2 - s * 0.6;
        ctx.strokeStyle = rgba(col, (0.6 - s * 0.28) * ga);
        ctx.beginPath(); neuArc(ctx, E, a0, a0 + 0.55); ctx.stroke();
      }
    }
  }
  const Rg = R;
  glow(ctx, x, y, Rg * (fin ? 3.6 : 3.1), col, (fin ? 0.4 : 0.28) * fog);
  // birth: white-hot at first, cooling to the type colour; a spark and a pulse at the owner
  const hot = age < 1.9 ? 1 - clamp((age - 0.5) / 1.4, 0, 1) : 0;
  const gph = rm ? 0.6 : fx * 1.0 + n.i * 1.7;
  ctx.globalCompositeOperation = 'source-over';
  if (q < 1) {
    // lowest quality: a two-tone diamond
    const pl = neuPal(col);
    const wv = Math.max(0.35, Math.abs(Math.cos(gph)));
    ctx.globalAlpha = fog;
    ctx.fillStyle = pl[fin ? 7 : 6];
    ctx.beginPath(); ctx.moveTo(x, y - Rg); ctx.lineTo(x + Rg * 0.62 * wv, y); ctx.lineTo(x, y + Rg); ctx.fill();
    ctx.fillStyle = pl[3];
    ctx.beginPath(); ctx.moveTo(x, y - Rg); ctx.lineTo(x - Rg * 0.62 * wv, y); ctx.lineTo(x, y + Rg); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
    return;
  }
  neuLight(G, v.wx, v.wy, v.wz, NEU_LV);
  neuGem(ctx, x, y, Rg, gph, 0.5 + (rm ? 0 : 0.14 * Math.sin(fx * 0.7 + n.i)), neuPal(fin ? mixHex(col, '#FFFFFF', 0.18) : col), NEU_LV, fog, 1, 4, q >= 2 && fin, 0.5);
  ctx.globalCompositeOperation = 'lighter';
  if (hot > 0.01) glow(ctx, x, y, Rg * 2.2, '#FFFFFF', 0.6 * hot * fog);
  if (fin) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(col, 0.7 * fog);
    ctx.setLineDash([3, 4]);
    ctx.lineDashOffset = rm ? 0 : -fx * 8;
    ctx.beginPath(); ctx.arc(x, y, Rg * 1.9, 0, NEU_TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }
  // glint
  const gl = rm ? 0.3 : Math.pow(Math.max(0, Math.sin(fx * 1.35 + n.i * 2.7)), 18);
  const bs = Math.max(gl, age > 0.4 && age < 1.4 ? 1 - Math.abs(age - 0.9) / 0.5 : 0);
  if (bs > 0.05 && q >= 1) {
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = rgba('#FFFFFF', 0.85 * bs * fog);
    neuTwinkle(ctx, x - Rg * 0.12, y - Rg * 0.52, Rg * (0.8 + 1.5 * bs), 0);
    glow(ctx, x - Rg * 0.12, y - Rg * 0.52, Rg * 1.1, '#FFFFFF', 0.5 * bs * fog);
  }
  if (age > 0 && age < 1.6) {
    const ow = ST.PV[n.of];
    if (ow) {
      const e = age / 1.6;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = rgba(col, (1 - e) * 0.6);
      ctx.beginPath(); ctx.arc(ow.x, ow.y, Math.max(8, ow.n.r * ow.k * ow.s) * (1.3 + 1.3 * e), 0, NEU_TAU); ctx.stroke();
    }
  }
}

function neuDecision(G, v, n, R, fog, dpr, ST) {
  const ctx = G.ctx; const rm = G.rm; const fx = G.fx; const t = G.t;
  const x = v.x; const y = v.y;
  const col = n.color;
  const age = t - n.spawn;
  const al = fog * Math.min(1, v.s * 1.4);
  ctx.globalCompositeOperation = 'lighter';
  // tail opposite to the drift direction (the decision circles its agents)
  const uu = fx * 0.4 + n.dph + n.slot * 2.1;
  const p = G.proj(v.wx - Math.sin(uu) * 3.6 * 0.5, v.wy + Math.cos(uu * 1.3) * 1.56 * 0.5, v.wz + Math.cos(uu) * 3.6 * 0.5);
  let tx = x - p[0]; let ty = y - p[1];
  const tl = Math.hypot(tx, ty);
  if (tl > 0.0001) { tx /= tl; ty /= tl; } else { tx = -1; ty = 0; }
  const Lt = R * 8;
  const px = -ty; const py = tx;
  const q = G.q;
  for (let s2 = q >= 2 ? 0 : 1; s2 < 3; s2 += q >= 2 ? 2 : 1) {
    const w = R * (0.9 - s2 * 0.27);
    ctx.fillStyle = rgba(col, (0.1 + s2 * 0.1) * al);
    ctx.beginPath();
    ctx.moveTo(x + px * w, y + py * w);
    ctx.lineTo(x + tx * Lt * (1 - s2 * 0.25), y + ty * Lt * (1 - s2 * 0.25));
    ctx.lineTo(x - px * w, y - py * w);
    ctx.fill();
  }
  glow(ctx, x, y, R * 3.4, col, 0.32 * al);
  // cross flare
  const a0 = rm ? 0.2 : fx * 0.45 + n.i;
  ctx.fillStyle = rgba(col, 0.7 * al);
  neuRays(ctx, x, y, a0, R * 3, R * 0.14, 2); ctx.fill();
  if (q >= 2) { ctx.fillStyle = rgba(col, 0.42 * al); neuRays(ctx, x, y, a0 + 0.7854, R * 1.7, R * 0.1, 2); ctx.fill(); }
  glow(ctx, x, y, R * 1.3, '#FFF6D6', 0.5 * al);
  ctx.fillStyle = rgba('#FFFDF0', 0.95 * al);
  ctx.beginPath(); ctx.arc(x, y, Math.max(1.8, R * 0.42), 0, NEU_TAU); ctx.fill();
  // companion star
  if (q >= 1) {
    const cth = (rm ? 0.9 : fx * 2.6) + n.i * 1.3;
    const co = R * 2;
    const cxp = x + Math.cos(cth) * co; const cyp = y + Math.sin(cth) * co * 0.5;
    glow(ctx, cxp, cyp, R * 1.7, '#FFB873', 0.7 * al);
    ctx.fillStyle = rgba('#FFE3C0', 0.98 * al);
    ctx.beginPath(); ctx.arc(cxp, cyp, Math.max(1.5, R * 0.3), 0, NEU_TAU); ctx.fill();
  }
  // birth flash
  if (age < 0.9 && age >= 0 && !rm) {
    const e = age / 0.9;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = rgba(col, (1 - e) * 0.7);
    ctx.beginPath(); ctx.arc(x, y, R * (1.5 + 3.5 * e), 0, NEU_TAU); ctx.stroke();
  }
}

// the report: a golden faceted crystal (source-over facets) with ONE soft halo
function neuReport(G, v, n, R, fog, dpr, ST) {
  const ctx = G.ctx; const q = G.q; const rm = G.rm; const fx = G.fx; const t = G.t;
  const x = v.x; const y = v.y;
  const age = Math.max(0, t - n.spawn);
  const ua = clamp(age / 1.9, 0, 1);
  const ue = ease(ua);
  const Rg = R * 1.5;
  const pulse = rm ? 0.5 : 0.5 + 0.5 * Math.sin(fx * 1.6);
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, x, y, R * 3.8, GOLD, (0.3 + 0.08 * pulse) * ue);
  // the crystal, assembled from shards (self-lit: a fixed key light from the upper left)
  NEU_LV[0] = -0.34; NEU_LV[1] = 0.42; NEU_LV[2] = 0.5;
  ctx.globalCompositeOperation = 'source-over';
  neuGem(ctx, x, y, Rg, rm ? 0.5 : fx * 0.6, 0.42, neuPal('#FFB830'), NEU_LV, fog, ua, q >= 1 ? 6 : 4, q >= 1, 0.34);
  ctx.globalCompositeOperation = 'lighter';
  // a glint travelling on the top facet
  if (q >= 1 && ua > 0.6) {
    const gl = rm ? 0.5 : Math.pow(Math.max(0, Math.sin(fx * 0.9 + 1.2)), 10);
    if (gl > 0.05) {
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = rgba('#FFFFFF', 0.75 * gl);
      neuTwinkle(ctx, x - Rg * 0.1, y - Rg * 0.55, Rg * (0.5 + 0.7 * gl), 0.3);
    }
  }
  // birth: a gold ring leaves the crystal (no white bloom)
  if (age < 1.8) {
    const e = clamp(age / 1.5, 0, 1);
    ctx.lineWidth = 2.2 * (1 - e) + 0.6;
    ctx.strokeStyle = rgba('#FFD27A', (1 - e) * 0.6);
    ctx.beginPath(); ctx.arc(x, y, R * (1.2 + 6 * ease(e)), 0, NEU_TAU); ctx.stroke();
  }
}

function drawNeurons(G) {
  const { ctx, S, m, t, fx, q, rm, dist, proj } = G;
  const nodes = m.nodes;
  const picks = [];
  // ---------- neurons ----------
  const vn = [];
  const PV = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (t < n.spawn) continue;
    const o3 = n.i * 3;
    TMP3[0] = m.P[o3]; TMP3[1] = m.P[o3 + 1]; TMP3[2] = m.P[o3 + 2];
    const p = proj(TMP3[0], TMP3[1], TMP3[2]);
    if (p[3] < NEAR) continue;
    const v = { n, x: p[0], y: p[1], k: p[2], z: p[3], s: Math.max(0.01, easeOutBack(clamp((t - n.spawn) / 0.8, 0, 1))), wx: TMP3[0], wy: TMP3[1], wz: TMP3[2] };
    PV[n.i] = v;
    vn.push(v);
  }
  vn.sort((a, b) => b.z - a.z);
  const labels = [];
  NEU.bk = 0;
  const dpr = S.dpr || 1;
  const hp = proj(0, 0, 0);
  const ST = { hx: hp[0], hy: hp[1], PV };
  ctx.lineJoin = 'round';
  let ri = -1;
  for (let vi = 0; vi < vn.length; vi++) if (vn[vi].n.kind === 'report') ri = vi;
  const total = vn.length;
  for (let oi = 0; oi < total; oi++) {
    // the report crystal is drawn last: nothing may hide the finale
    const vi = ri < 0 ? oi : oi < total - 1 ? (oi < ri ? oi : oi + 1) : ri;
    const v = vn[vi];
    const n = v.n;
    const x = v.x;
    const y = v.y;
    const r = n.r * v.k * v.s;
    const sk = v.s < 1 ? v.s : 1;
    const fog = clamp(1.05 - ((v.z - (dist - 170)) / 330) * 0.6, 0.4, 1);
    const sel = S.sel === n.id;
    const hov = S.hover === n.id;
    let R;
    let rSel;
    let rPick;
    let lDy;
    if (n.kind === 'agent') {
      R = Math.max(r, 9 * sk);
      const as = agentAt(m.base.tasks[n.id] || [], t);
      neuAgent(G, v, n, R, as, fog, dpr, ST);
      rSel = Math.max(R * 2.45, 20); rPick = Math.max(R * 1.9, 15); lDy = R * 1.72 + 14;
    } else if (n.kind === 'hermes') {
      R = Math.max(r, 10 * sk) * NEU_CORE_K;
      v.cr = R * 0.96; // radius of the dark disc on screen (FX keeps its halos outside it)
      neuHermes(G, v, n, R, fog, dpr, ST);
      rSel = R * 2.3; rPick = Math.max(R * 1.4, 18); lDy = R * 1.9 + 14;
    } else if (n.kind === 'file') {
      R = Math.max(r * 1.18, 6 * sk);
      neuFile(G, v, n, R, fog, dpr, ST);
      rSel = Math.max(R * 2.3, 13); rPick = Math.max(R * 1.9, 13); lDy = Math.max(R * 1.8, 8) + 14;
    } else if (n.kind === 'decision') {
      R = Math.max(r, 4.5 * sk);
      neuDecision(G, v, n, R, fog, dpr, ST);
      rSel = Math.max(R * 3, 14); rPick = Math.max(R * 2.3, 13); lDy = Math.max(R * 1.8, 8) + 14;
    } else {
      R = Math.max(r, 9 * sk);
      neuReport(G, v, n, R, fog, dpr, ST);
      rSel = R * 2.5; rPick = Math.max(R * 1.9, 17); lDy = R * 1.8 + 14;
    }
    picks.push({ id: n.id, x: x, y: y, r: rPick, z: v.z });
    // selection / hover marks
    if (sel || hov) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      glow(ctx, x, y, rSel * 1.1, n.kind === 'hermes' ? GOLD : n.color, sel ? 0.16 : 0.1);
      if (sel) {
        ctx.lineWidth = 5;
        ctx.strokeStyle = rgba('#FFFFFF', 0.09);
        ctx.beginPath(); ctx.arc(x, y, rSel, 0, NEU_TAU); ctx.stroke();
      }
      ctx.lineWidth = sel ? 1.7 : 1.4;
      ctx.strokeStyle = rgba('#FFFFFF', sel ? 0.95 : 0.55);
      ctx.setLineDash([6, 5]);
      ctx.lineDashOffset = rm ? 0 : -fx * 14;
      ctx.beginPath(); ctx.arc(x, y, rSel, 0, NEU_TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      if (sel) {
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          const c = Math.cos(k * 1.5708); const s = Math.sin(k * 1.5708);
          ctx.moveTo(x + c * (rSel - 4), y + s * (rSel - 4)); ctx.lineTo(x + c * (rSel + 5), y + s * (rSel + 5));
        }
        ctx.stroke();
      }
    }
    // label candidates
    const recent = (n.kind === 'file' && t - n.spawn < 7) || (n.kind === 'decision' && t - n.spawn < 4.5);
    if (n.kind === 'agent' || n.kind === 'hermes' || n.kind === 'report' || sel || hov || recent) {
      labels.push({ v, pr: sel ? 9 : hov ? 8 : n.kind === 'hermes' ? 7 : n.kind === 'agent' ? 6 : n.kind === 'report' ? 6 : 3, text: n.label, dy: lDy });
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  return { PV, vn, labels, picks };
}
// @@MODULE:NEURONS-END

// @@MODULE:FX-BEGIN
// ====================================================================================================================
// FX: cinematic camera flythrough (camIntro) and one-off effects drawn on top of the neurons (drawFx):
//   intro dressing (ghost lanes, camera-blurred dust), spawn shockwaves, message impacts, phase pulses (t = 6 / 14 / 50),
//   a gentle corona pulse on story beats (no lens flare: the centre is a black hole, so every Hermes pulse is an ANNULAR
//   halo, fxHalo, that leaves the dark disc untouched), and the finale (report forming, golden delivery wave in the lane
//   plane). Whites are kept for thin cores only; big glows are gold and <= 0.35 alpha.
// Story state is a pure function of the scene time t (scrub-safe). Wall-clock G.fx only drives the flare breathing.
// Rings are 3D circles in the galaxy plane (same tilt as the lanes) projected through G.proj with 8 cubic Beziers.
// ====================================================================================================================
const FXN = 64;
const FXU = new Float32Array(FXN * 3); // golden-angle sphere directions
const FXR = new Float32Array(FXN * 2); // per direction randoms
const FXMN = 56;
const FXM = new Float32Array(FXMN * 5); // dust motes: x y z size tone
const FXCS = new Float32Array(18); // cos / sin of j * pi / 4
const FXK8 = 0.26521648983954404; // 4/3 * tan(pi/16): handle length of an octant Bezier
const FXPH = [6, 14, 50]; // phase starts (PH[1..3])
const FXD0 = 56; // delivery
const FXSPR = {};
const FXHSPR = {};
const FXPALE = '#FFF3C4';
const FXOC = typeof OffscreenCanvas === 'function'; // without sprites the glows cost ~6 calls each: cap the quality
(function () {
  const r = mulberry(4242);
  for (let k = 0; k < FXN; k++) {
    const y = 1 - (2 * (k + 0.5)) / FXN;
    const rr = Math.sqrt(Math.max(0, 1 - y * y));
    const ph = k * 2.399963229728653;
    FXU[k * 3] = Math.cos(ph) * rr; FXU[k * 3 + 1] = y; FXU[k * 3 + 2] = Math.sin(ph) * rr;
    FXR[k * 2] = r(); FXR[k * 2 + 1] = r();
  }
  for (let k = 0; k < FXMN; k++) {
    const a = r() * 6.2832;
    const rad = 62 + 215 * Math.pow(r(), 0.75);
    FXM[k * 5] = Math.cos(a) * rad;
    FXM[k * 5 + 1] = (r() + r() + r() - 1.5) * 80;
    FXM[k * 5 + 2] = Math.sin(a) * rad;
    FXM[k * 5 + 3] = 0.6 + r() * 1.5;
    FXM[k * 5 + 4] = r();
  }
  for (let j = 0; j <= 8; j++) { FXCS[j * 2] = Math.cos((j * Math.PI) / 4); FXCS[j * 2 + 1] = Math.sin((j * Math.PI) / 4); }
})();

const fxSm = (u) => { u = u < 0 ? 0 : u > 1 ? 1 : u; return u * u * (3 - 2 * u); };
const fxEo = (u, p) => { u = u < 0 ? 0 : u > 1 ? 1 : u; return 1 - Math.pow(1 - u, p); };
const fxRest = (u, p) => 1 - Math.pow(1 - fxSm(u), p); // starts and ends at rest, long soft landing
const fxPulse = (age, rise, decay) => (age < 0 ? 0 : age < rise ? fxSm(age / rise) : Math.exp(-(age - rise) / decay));

// ---------------------------------------------------------------------------------------------------- camera
// camIntro(t) -> multiplicative zoom, additive pitch / yaw (radians) on top of the user's camera.
// A rest-to-rest ease-out swoop: high, almost top-down view (lanes read as concentric rings) -> working angle at t = 10.
function camIntro(t) {
  if (!(t < 10)) return { zoom: 1, pitch: 0, yaw: 0 };
  if (!(t > 0)) t = 0;
  return {
    zoom: 0.58 + 0.42 * fxRest(t / 10, 1.7),
    pitch: 0.8 * (1 - fxRest((t - 1.5) / 8.5, 1.6)),
    yaw: -1.25 * (1 - fxRest((t - 0.2) / 9.8, 2.1)),
  };
}

// ---------------------------------------------------------------------------------------------------- sprites
// a soft tapered streak, transparent tail at x = 0, bright head at x = 1 (drawn through a transform, see fxStreak)
function fxStreakSpr(hex) {
  let s = FXSPR[hex];
  if (s !== undefined) return s;
  s = null;
  try {
    if (typeof OffscreenCanvas === 'function') {
      const c = new OffscreenCanvas(128, 16);
      const g = c.getContext('2d');
      if (g) {
        const gr = g.createLinearGradient(0, 0, 128, 0);
        gr.addColorStop(0, rgba(hex, 0));
        gr.addColorStop(0.55, rgba(hex, 0.22));
        gr.addColorStop(0.9, rgba(hex, 0.8));
        gr.addColorStop(1, rgba(hex, 1));
        g.fillStyle = gr;
        g.fillRect(0, 0, 128, 16);
        g.globalCompositeOperation = 'destination-in';
        const gv = g.createLinearGradient(0, 0, 0, 16);
        gv.addColorStop(0, 'rgba(0,0,0,0)');
        gv.addColorStop(0.5, 'rgba(0,0,0,1)');
        gv.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gv;
        g.fillRect(0, 0, 128, 16);
        s = c;
      }
    }
  } catch (e) { s = null; }
  FXSPR[hex] = s;
  return s;
}
// streak from the tail (x0,y0) to the head (x1,y1), w px wide (sets and restores the transform itself)
function fxStreak(G, x0, y0, x1, y1, w, hex, a) {
  if (!(a > 0.012)) return;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L = Math.hypot(dx, dy);
  if (!(L > 0.9)) return;
  const ctx = G.ctx;
  const s = fxStreakSpr(hex);
  const ga = ctx.globalAlpha;
  if (s) {
    const d = G.S.dpr || 1;
    const k = w / L;
    ctx.setTransform(dx * d, dy * d, -dy * k * d, dx * k * d, x0 * d, y0 * d);
    ctx.globalAlpha = ga * (a > 1 ? 1 : a);
    ctx.drawImage(s, 0, -0.5, 1, 1);
    ctx.globalAlpha = ga;
    ctx.setTransform(d, 0, 0, d, 0, 0);
  } else {
    ctx.lineWidth = Math.max(0.8, w * 0.5);
    ctx.strokeStyle = rgba(hex, a);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
}
function fxEnd(G) {
  const d = G.S.dpr || 1;
  G.ctx.setTransform(d, 0, 0, d, 0, 0);
}
// annular halo sprite: transparent inside 0.46 of the radius, brightest at 0.58, soft to the rim (keeps the black hole dark)
function fxHaloSpr(hex) {
  let s = FXHSPR[hex];
  if (s !== undefined) return s;
  s = null;
  try {
    if (typeof OffscreenCanvas === 'function') {
      const c = new OffscreenCanvas(128, 128);
      const g = c.getContext('2d');
      if (g) {
        const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        gr.addColorStop(0, rgba(hex, 0));
        gr.addColorStop(0.44, rgba(hex, 0));
        gr.addColorStop(0.5, rgba(hex, 0.55));
        gr.addColorStop(0.58, rgba(hex, 1));
        gr.addColorStop(0.74, rgba(hex, 0.4));
        gr.addColorStop(1, rgba(hex, 0));
        g.fillStyle = gr;
        g.fillRect(0, 0, 128, 128);
        s = c;
      }
    }
  } catch (e) { s = null; }
  FXHSPR[hex] = s;
  return s;
}
// ONE drawImage (or one stroked ring without OffscreenCanvas); rad >= 2.6 * the core's model radius keeps the disc dark
function fxHalo(ctx, x, y, rad, hex, a) {
  if (!(a > 0.01) || !(rad > 1)) return;
  const s = fxHaloSpr(hex);
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * (a > 1 ? 1 : a);
  if (s) ctx.drawImage(s, x - rad, y - rad, rad * 2, rad * 2);
  else {
    ctx.lineWidth = rad * 0.3;
    ctx.strokeStyle = rgba(hex, 0.6);
    ctx.beginPath(); ctx.arc(x, y, rad * 0.6, 0, 6.2832); ctx.stroke();
  }
  ctx.globalAlpha = ga;
}

// ---------------------------------------------------------------------------------------------------- 3D circle
// closed circle of radius R around (x,y,z) in the galaxy plane, as a path (8 Beziers); false when it reaches behind the camera
function fxCircle(G, x, y, z, R) {
  if (!(R > 0.3)) return false;
  const ctx = G.ctx;
  const proj = G.proj;
  const h = R * FXK8;
  let p = proj(x + R, y, z);
  if (p[3] < NEAR) return false;
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  for (let j = 0; j < 8; j++) {
    const c0 = FXCS[j * 2];
    const s0 = FXCS[j * 2 + 1];
    const c1 = FXCS[j * 2 + 2];
    const s1 = FXCS[j * 2 + 3];
    let v = R * s0 + h * c0;
    p = proj(x + R * c0 - h * s0, y + v * LT_S, z + v * LT_C);
    if (p[3] < NEAR) return false;
    const ax = p[0];
    const ay = p[1];
    v = R * s1 - h * c1;
    p = proj(x + R * c1 + h * s1, y + v * LT_S, z + v * LT_C);
    if (p[3] < NEAR) return false;
    const bx = p[0];
    const by = p[1];
    v = R * s1;
    p = proj(x + R * c1, y + v * LT_S, z + v * LT_C);
    if (p[3] < NEAR) return false;
    ctx.bezierCurveTo(ax, ay, bx, by, p[0], p[1]);
  }
  ctx.closePath();
  return true;
}
// a luminous ring: soft halo + body + hot core; w = core width in px, a = overall alpha, q-aware
function fxRing(G, x, y, z, R, hex, core, a, w) {
  if (!(a > 0.012)) return;
  if (!fxCircle(G, x, y, z, R)) return;
  const ctx = G.ctx;
  if (G.q >= 2) { ctx.lineWidth = w * 5.5; ctx.strokeStyle = rgba(hex, a * 0.1); ctx.stroke(); }
  ctx.lineWidth = w * 2.1;
  ctx.strokeStyle = rgba(hex, a * 0.42);
  ctx.stroke();
  ctx.lineWidth = Math.max(0.8, w * 0.8);
  ctx.strokeStyle = rgba(core, a * 0.92);
  ctx.stroke();
}
const FXV3 = [0, 0, 0];
// screen scale of a world point (perspective scale relative to the focus plane)
function fxKs(G, x, y, z) {
  const p = G.proj(x, y, z);
  if (p[3] < NEAR) return 0;
  const k = p[2] / G.kref;
  return k < 0.55 ? 0.55 : k > 1.7 ? 1.7 : k;
}

// ---------------------------------------------------------------------------------------------------- intro dressing
function fxIntro(G, N) {
  const { ctx, m, t, q, rm } = G;
  if (t >= 16) return;
  // ghost lanes: dotted rings that sweep out of Hermes like a radar before the real lanes appear (cross-fade with ORBITS).
  // They are drawn on top of the neurons, so the black hole is cut out of them (even-odd clip): a ring never crosses the disc
  const tail = 1 - fxSm((t - 12) / 3);
  ctx.lineCap = 'round';
  const hv = N.PV[0];
  const hr = hv ? (hv.cr > 1 ? hv.cr : hv.n.r * hv.k * hv.s * 1.25) : 0;
  const cut = hr > 1 && tail > 0.01;
  if (cut) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(-4, -4, G.W + 8, G.H + 8);
    ctx.arc(hv.x, hv.y, hr, 0, 6.2832, true);
    ctx.clip('evenodd');
  }
  for (let li = 0; li < m.lanes.length; li++) {
    const L = m.lanes[li];
    const grow = rm ? 1 : fxEo((t - (1.0 + 0.62 * li)) / 1.9, 3);
    if (grow <= 0.003) continue;
    const gone = ease(clamp((t - (L.first - 0.3)) / 1.4, 0, 1));
    const a = (1 - gone) * tail;
    if (a < 0.01) continue;
    // still inside the black hole (the ring grows in its own stacked plane, so its centre can sit over the disc on screen):
    // nothing is drawn over the dark disc until the ring clears it
    if (laneR(li) * grow < 32 + Math.abs(laneY(li))) continue;
    if (!fxCircle(G, 0, laneY(li), 0, laneR(li) * grow)) continue;
    const edge = rm ? 0 : 1 - grow;
    if (q >= 2) { ctx.lineWidth = 6; ctx.strokeStyle = rgba(L.color, a * (0.035 + 0.1 * edge)); ctx.stroke(); }
    ctx.setLineDash([1.5, 8]);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = rgba(L.color, a * (0.5 + 0.4 * edge));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(L.color, a * (0.1 + 0.25 * edge));
    ctx.stroke();
    // a light runs along each ghost lane (the agents will ride these)
    if (!rm && grow > 0.5) {
      const th = t * laneW(li) * 4.5 + li * 1.7;
      lanePt(li, th, grow, FXV3);
      let p = G.proj(FXV3[0], FXV3[1], FXV3[2]);
      if (p[3] >= NEAR) {
        const hx = p[0];
        const hy = p[1];
        const kk = p[2] / G.kref;
        lanePt(li, th - 0.5, grow, FXV3);
        p = G.proj(FXV3[0], FXV3[1], FXV3[2]);
        if (p[3] >= NEAR) {
          fxStreak(G, p[0], p[1], hx, hy, 4 * kk, L.color, a * 0.9);
          glow(ctx, hx, hy, 6 * kk, L.color, a * 0.8);
          glow(ctx, hx, hy, 2.4 * kk, '#FFFFFF', a * 0.7);
        }
      }
    }
  }
  if (cut) ctx.restore();
  fxEnd(G);
  ctx.globalCompositeOperation = 'lighter';
  // lane ignition: a bright pen tip runs ahead of the real lane ring while ORBITS draws it (same ease and start angle)
  if (!rm) {
    for (let li = 0; li < m.lanes.length; li++) {
      const L = m.lanes[li];
      const gp = (t - (L.first - 0.3)) / 1.4;
      if (!(gp > 0 && gp < 1.12)) continue;
      const th = ease(clamp(gp, 0, 1)) * 6.2832;
      const env = 1 - fxSm((gp - 0.86) / 0.26);
      lanePt(li, th, 1, FXV3);
      let p = G.proj(FXV3[0], FXV3[1], FXV3[2]);
      if (p[3] < NEAR) continue;
      const hx = p[0];
      const hy = p[1];
      const kk = p[2] / G.kref;
      lanePt(li, th - 0.7, 1, FXV3);
      p = G.proj(FXV3[0], FXV3[1], FXV3[2]);
      if (p[3] < NEAR) continue;
      fxStreak(G, p[0], p[1], hx, hy, 5.5 * kk, L.color, env * 0.9);
      glow(ctx, hx, hy, 11 * kk, L.color, env * 0.85);
      glow(ctx, hx, hy, 4 * kk, '#FFFFFF', env * 0.8);
    }
  }
  // dust motes: parallax and camera motion blur while the camera swoops
  if (rm || q < 1 || t >= 12.5) return;
  const env = 1 - fxSm((t - 8.5) / 4);
  if (env <= 0.01) return;
  const cam = G.cam;
  const c1 = camIntro(t);
  const c0 = camIntro(t - 0.1);
  const yaw0 = cam.yaw - c1.yaw + c0.yaw;
  const pit0 = cam.pitch - c1.pitch + c0.pitch;
  const dist0 = G.dist * (c1.zoom / c0.zoom);
  const cy0 = Math.cos(yaw0);
  const sy0 = Math.sin(yaw0);
  const cp0 = Math.cos(pit0);
  const sp0 = Math.sin(pit0);
  const f0 = G.unit * dist0;
  const cnt = q >= 2 ? FXMN : 32;
  const proj = G.proj;
  for (let k = 0; k < cnt; k++) {
    const wx = FXM[k * 5];
    const wy = FXM[k * 5 + 1];
    const wz = FXM[k * 5 + 2];
    const p = proj(wx, wy, wz);
    const zc = p[3];
    if (zc < NEAR + 40) continue;
    const x1 = p[0];
    const y1 = p[1];
    const kk = p[2];
    let xx = wx - cam.tx;
    let yy = wy - cam.ty;
    let zz = wz - cam.tz;
    const px = xx * cy0 - zz * sy0;
    const pz = xx * sy0 + zz * cy0;
    const py = yy * cp0 - pz * sp0;
    const pd = yy * sp0 + pz * cp0 + dist0;
    const k0 = f0 / Math.max(pd, 40);
    const x0 = G.cx + px * k0;
    const y0 = G.cy - py * k0;
    const tone = FXM[k * 5 + 4];
    const fade = clamp((zc - NEAR - 40) / 80, 0, 1);
    const a = env * fade * (0.22 + 0.5 * tone);
    const w = FXM[k * 5 + 3] * (kk / G.kref) * 1.15;
    const hex = tone > 0.72 ? '#FFE6C0' : tone > 0.3 ? '#CFE0FF' : '#9FC4FF';
    const L = Math.hypot(x1 - x0, y1 - y0);
    if (L > 1.2) fxStreak(G, x0, y0, x1, y1, Math.max(1, w * 1.4), hex, a * 1.2);
    else glow(ctx, x1, y1, Math.max(1.4, w * 1.8), hex, a);
  }
  fxEnd(G);
}

// ---------------------------------------------------------------------------------------------------- phases
function fxPings(G, N, front, band, hexOverride, k) {
  const vn = N.vn;
  const ctx = G.ctx;
  for (let i = 0; i < vn.length; i++) {
    const v = vn[i];
    if (v.n.kind === 'hermes') continue;
    const rho = Math.hypot(v.wx, v.wz);
    const d = Math.abs(rho - front);
    if (d >= band) continue;
    const a = (1 - d / band) * (1 - d / band) * k;
    glow(ctx, v.x, v.y, Math.max(8, v.n.r * v.k * v.s * 3.4), hexOverride || v.n.light, a);
  }
}
function fxLanePass(G, front, band, k) {
  const m = G.m;
  const ctx = G.ctx;
  for (let li = 0; li < m.lanes.length; li++) {
    const d = Math.abs(laneR(li) - front);
    if (d >= band) continue;
    const a = (1 - d / band) * (1 - d / band) * k;
    if (!fxCircle(G, 0, laneY(li), 0, laneR(li))) continue;
    ctx.lineWidth = 6.5; ctx.strokeStyle = rgba(m.lanes[li].color, a * 0.2); ctx.stroke();
    ctx.lineWidth = 1.7; ctx.strokeStyle = rgba(m.lanes[li].color, a * 0.85); ctx.stroke();
  }
}
function fxPhases(G, N) {
  const { ctx, t, q, rm } = G;
  if (rm) return;
  const hv = N.PV[0];
  for (let pi = 0; pi < 3; pi++) {
    const age = t - FXPH[pi];
    if (age <= 0 || age >= 3.6) continue;
    const str = pi === 1 ? 0.8 : 1;
    const u = age / 3.4;
    const R = 14 + (pi === 2 ? 206 : 188) * fxEo(u, 2.3);
    const env = Math.pow(1 - fxSm(u), 1.1) * Math.min(1, age / 0.12) * str;
    const ks = fxKs(G, 0, 0, 0) || 1;
    fxRing(G, 0, 0, 0, R, '#FFDC8A', '#FFF1C8', env * 0.62, 2.4 * ks);
    if (q >= 1) fxRing(G, 0, 0, 0, R * 0.82, '#FFDC8A', '#FFE2A0', env * 0.28, 1.4 * ks);
    fxLanePass(G, R, 15, env * 0.9);
    fxPings(G, N, R, 15, null, env * 0.75);
    if (hv) {
      const rs = hv.n.r * hv.k * hv.s;
      fxHalo(ctx, hv.x, hv.y, rs * (3.6 + 2.2 * u), '#FFB85C', 0.3 * fxPulse(age, 0.18, 0.75) * str);
    }
  }
}

// ---------------------------------------------------------------------------------------------------- spawn shockwaves
// dur, R0, R1 (world), sparks, strength
const FXSPN = { hermes: [2.8, 20, 168, 24, 1], agent: [1.6, 11, 58, 20, 1], file: [1.5, 6, 31, 12, 0.75], decision: [1.4, 5, 27, 12, 0.75], report: [2.4, 14, 108, 24, 1] };
function fxSpawn(G, N, n, age) {
  const sp = FXSPN[n.kind];
  if (!sp) return;
  const dur = sp[0];
  const u = age / dur;
  if (!(u > 0 && u < 1)) return;
  const { ctx, m, q, rm } = G;
  const o = n.i * 3;
  const x = m.P[o];
  const y = m.P[o + 1];
  const z = m.P[o + 2];
  const col = n.color;
  const lt = n.light;
  const str = sp[4];
  const pv = N.PV[n.i];
  const hole = n.kind === 'hermes';
  if (rm) {
    if (pv && !hole) glow(ctx, pv.x, pv.y, Math.max(10, n.r * pv.k * 3.4), col, 0.4 * (1 - u) * str);
    else if (pv) fxHalo(ctx, pv.x, pv.y, Math.max(10, n.r * pv.k * 3.6), col, 0.4 * (1 - u) * str);
    return;
  }
  const e = fxEo(u, 3);
  const R = sp[1] + (sp[2] - sp[1]) * e;
  const a = Math.pow(1 - u, 1.3) * Math.min(1, age / 0.06) * str;
  const ks = fxKs(G, x, y, z);
  if (ks <= 0) return;
  const w = (1 + 2.6 * (1 - u)) * ks;
  fxRing(G, x, y, z, R, col, lt, a, w);
  if (q >= 1) {
    const u2 = (age - 0.16 * dur) / (dur * 0.84);
    if (u2 > 0 && u2 < 1) fxRing(G, x, y, z, sp[1] + (sp[2] * 0.62 - sp[1]) * fxEo(u2, 3), col, lt, Math.pow(1 - u2, 1.3) * 0.6 * str, w * 0.7);
  }
  // birth flash at the node (the black hole gets an annular bloom: its disc stays dark)
  if (pv) {
    const fl = Math.pow(1 - u, 2.4);
    if (hole) fxHalo(ctx, pv.x, pv.y, Math.max(12, (n.r * 3.4 + 20 * e) * pv.k), lt, 0.45 * fl * str);
    else {
      glow(ctx, pv.x, pv.y, Math.max(10, (n.r * 1.2 + 20 * e) * pv.k), lt, 0.5 * fl * str);
      glow(ctx, pv.x, pv.y, Math.max(6, n.r * 1.6 * pv.k), lt, 0.3 * fl * str);
    }
  }
  // sparks: oblate burst in the galaxy plane, decelerating, with short streaks
  const ns = Math.floor(sp[3] * (q >= 2 ? 1 : q === 1 ? 0.6 : 0.3));
  const u1 = u > 0.11 ? u - 0.11 : 0;
  const e1 = fxEo(u1, 2.3);
  const e2 = fxEo(u, 2.3);
  const fade = Math.pow(1 - u, 1.15) * str;
  const proj = G.proj;
  for (let s = 0; s < ns; s++) {
    const idx = (s * 5 + n.i * 11) & 63;
    const dx = FXU[idx * 3];
    const dy = FXU[idx * 3 + 1] * 0.38;
    const dz = FXU[idx * 3 + 2];
    const Dm = sp[2] * 1.02 * (0.5 + 0.5 * FXR[idx * 2]);
    const d0 = Dm * e1;
    const d1 = Dm * e2;
    if (hole && d1 < 30) continue; // sparks start outside the dark disc
    let p = proj(x + dx * d0, y + dy * d0, z + dz * d0);
    if (p[3] < NEAR) continue;
    const x0 = p[0];
    const y0 = p[1];
    p = proj(x + dx * d1, y + dy * d1, z + dz * d1);
    if (p[3] < NEAR) continue;
    fxStreak(G, x0, y0, p[0], p[1], (2.1 + 2.3 * FXR[idx * 2 + 1]) * ks, lt, fade);
    if (q >= 1) glow(ctx, p[0], p[1], (2.6 + 2.2 * FXR[idx * 2 + 1]) * ks, lt, fade * 0.85);
  }
  fxEnd(G);
}
function fxSpawns(G, N) {
  const nodes = G.m.nodes;
  const t = G.t;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const age = t - n.spawn;
    if (age > 0 && age < 2.8) fxSpawn(G, N, n, age);
  }
}

// ---------------------------------------------------------------------------------------------------- messages
function fxMessages(G, N) {
  const { ctx, m, t, q, rm, proj } = G;
  const nodes = m.nodes;
  const P = m.P;
  const PV = N.PV;
  for (let i = 0; i < m.ev.length; i++) {
    const ev = m.ev[i];
    if (ev.t > t) break;
    const age = t - ev.t;
    if (age > FLIGHT + 1.35) continue;
    const from = nodes[ev.from];
    if (!from) continue;
    const col = pulseColor(ev, nodes);
    const kind = ev.kind;
    // speech ring at the sender
    if (age < 1.0 && !rm) {
      const u = age / 1.0;
      const o = ev.from * 3;
      const toUser = ev.to < 0;
      const ks = fxKs(G, P[o], P[o + 1], P[o + 2]);
      if (ks > 0) {
        const R = from.r * (1.25 + (toUser ? 4.2 : 2.7) * fxEo(u, 2.2));
        fxRing(G, P[o], P[o + 1], P[o + 2], R, toUser ? GOLD : col, toUser ? FXPALE : '#FFFFFF', (1 - u) * (1 - u) * (toUser ? 0.75 : 0.6), 1.3 * ks);
        if (q >= 2 && !toUser) fxRing(G, P[o], P[o + 1], P[o + 2], from.r * (1.1 + 1.7 * fxEo(u, 2.4)), col, col, (1 - u) * (1 - u) * 0.3, 1 * ks);
      }
    }
    // arrival at the receiver
    const aa = age - FLIGHT;
    if (!(aa >= 0 && aa < 1.35) || ev.to < 0) continue;
    const to = nodes[ev.to];
    const tv = PV[ev.to];
    if (!to || !tv) continue;
    const u = aa / 1.2;
    if (rm) { glow(ctx, tv.x, tv.y, Math.max(10, to.r * tv.k * 3.2), col, 0.45 * (1 - fxSm(aa / 1.35))); continue; }
    const uu = u > 1 ? 1 : u;
    const o = ev.to * 3;
    const ks = fxKs(G, P[o], P[o + 1], P[o + 2]);
    if (ks <= 0) continue;
    const a = Math.pow(1 - uu, 1.5);
    const approve = kind === 'approve';
    const hit = kind === 'critique';
    const R = to.r * (1.15 + (hit ? 2.4 : 3.1) * fxEo(uu, 2.6));
    fxRing(G, P[o], P[o + 1], P[o + 2], R, col, '#FFFFFF', a * 0.85, (hit ? 2.2 : 1.7) * ks);
    if (q >= 1 && (approve || ev.carry >= 0)) {
      const u2 = clamp((aa - 0.18) / 1.1, 0, 1);
      fxRing(G, P[o], P[o + 1], P[o + 2], to.r * (1.1 + 4.4 * fxEo(u2, 2.4)), ev.carry >= 0 ? nodes[ev.carry].color : col, ev.carry >= 0 ? nodes[ev.carry].light : col, Math.pow(1 - u2, 1.5) * 0.6, 1.2 * ks);
    }
    const rpx = to.r * tv.k * tv.s;
    glow(ctx, tv.x, tv.y, rpx * (2.4 + 2.2 * (1 - a)), col, 0.4 * Math.pow(1 - uu, 2.8));
    glow(ctx, tv.x, tv.y, rpx * 1.4, '#FFFFFF', 0.2 * Math.pow(1 - uu, 4));
    if (q >= 1) {
      const nb = q >= 2 ? 10 : 5;
      const e1 = fxEo(uu > 0.09 ? uu - 0.09 : 0, 2.4);
      const e2 = fxEo(uu, 2.4);
      const D = (hit ? 44 : 34);
      for (let b = 0; b < nb; b++) {
        const bx = ev.burst[b * 3];
        const by = ev.burst[b * 3 + 1] + (approve ? 0.8 : 0);
        const bz = ev.burst[b * 3 + 2];
        const Dm = D * (0.62 + 0.38 * FXR[((ev.i * 7 + b * 3) & 63) * 2]);
        const d0 = to.r + Dm * e1;
        const d1 = to.r + Dm * e2;
        let p = proj(tv.wx + bx * d0, tv.wy + by * d0, tv.wz + bz * d0);
        if (p[3] < NEAR) continue;
        const x0 = p[0];
        const y0 = p[1];
        p = proj(tv.wx + bx * d1, tv.wy + by * d1, tv.wz + bz * d1);
        if (p[3] < NEAR) continue;
        fxStreak(G, x0, y0, p[0], p[1], 1.9 * ks, col, a * 0.95);
        glow(ctx, p[0], p[1], 3 * ks, col, a * 0.85);
      }
      fxEnd(G);
    }
  }
}

// ---------------------------------------------------------------------------------------------------- finale
// light rays converging on (x,y,z); each ray lives `trav` seconds, start times spread over `span`
function fxRays(G, x, y, z, t0, span, trav, count, R0, R1, hexA, hexB, gain, seed, flat) {
  const { ctx, t, proj } = G;
  for (let k = 0; k < count; k++) {
    const idx = (k * 7 + seed) & 63;
    const rk = FXR[idx * 2];
    const u = (t - t0 - rk * span) / trav;
    if (!(u > 0 && u < 1)) continue;
    const dx = FXU[idx * 3];
    const dy = FXU[idx * 3 + 1] * flat;
    const dz = FXU[idx * 3 + 2];
    const ua = u > 0.24 ? u - 0.24 : 0;
    const d1 = R1 + (R0 - R1) * (1 - u) * (1 - u);
    const d0 = R1 + (R0 - R1) * (1 - ua) * (1 - ua);
    let p = proj(x + dx * d0, y + dy * d0, z + dz * d0);
    if (p[3] < NEAR) continue;
    const x0 = p[0];
    const y0 = p[1];
    const ks = p[2] / G.kref;
    p = proj(x + dx * d1, y + dy * d1, z + dz * d1);
    if (p[3] < NEAR) continue;
    const a = gain * Math.min(1, u * 4) * (1 - Math.pow(u, 6));
    const hex = FXR[idx * 2 + 1] < 0.34 ? hexB : hexA;
    fxStreak(G, x0, y0, p[0], p[1], (2.2 + 2.6 * u) * (ks < 0.6 ? 0.6 : ks > 1.6 ? 1.6 : ks), hex, a);
    if (u > 0.3 && u < 0.9) glow(ctx, p[0], p[1], 2.6 + 3 * u, hex, a * 0.55);
  }
  fxEnd(G);
}
// a ring that implodes onto (x,y,z) between ta and tb
function fxImplode(G, x, y, z, ta, tb, R0, R1, hex, core, gain) {
  const t = G.t;
  if (!(t > ta && t < tb)) return;
  const u = (t - ta) / (tb - ta);
  const R = R1 + (R0 - R1) * Math.pow(1 - u, 2.2);
  const a = gain * Math.min(1, u * 5) * (u < 0.9 ? 1 : (1 - u) * 10);
  const ks = fxKs(G, x, y, z) || 1;
  fxRing(G, x, y, z, R, hex, core, a, (1.1 + 1.4 * u) * ks);
}
// a vertical column of light rising from (x,y,z)
function fxPillar(G, x, y, z, a, wpx, len) {
  if (!(a > 0.015)) return;
  const proj = G.proj;
  let p = proj(x, y, z);
  if (p[3] < NEAR) return;
  const bx = p[0];
  const by = p[1];
  const ks = p[2] / G.kref;
  p = proj(x, y + len, z);
  if (p[3] < NEAR) return;
  fxStreak(G, p[0], p[1], bx, by, wpx * 3.6 * ks, '#FFD27A', a * 0.4);
  fxStreak(G, p[0], p[1], bx, by, wpx * 1.1 * ks, '#FFF1C2', a * 0.55);
  fxEnd(G);
}
function fxFinale(G, N) {
  const { ctx, m, t, q, rm } = G;
  if (t < 49.8) return;
  const PV = N.PV;
  const hv = PV[0];
  if (rm) {
    if (t >= FXD0 && t < FXD0 + 3.5) {
      const a = fxSm((t - FXD0) / 0.5) * (1 - fxSm((t - FXD0 - 3) / 0.5));
      const ks = fxKs(G, 0, 0, 0) || 1;
      fxRing(G, 0, 0, 0, laneR(3) + 34, GOLD, FXPALE, a * 0.4, 1.6 * ks);
    }
    return;
  }
  const ri = m.idx.report;
  const rn = ri != null ? m.nodes[ri] : null;
  const rv = ri != null ? PV[ri] : null;
  const ro = ri != null ? ri * 3 : 0;
  // ---- the report forms: light converges from the dark, rings implode, the node swells, a completion ring leaves it
  if (rn && t < 54.2 && t >= rn.spawn - 0.3) {
    const rx = m.P[ro];
    const ry = m.P[ro + 1];
    const rz = m.P[ro + 2];
    const n1 = q >= 2 ? 34 : q === 1 ? 20 : 9;
    fxRays(G, rx, ry, rz, 50.0, 1.5, 1.45, n1, 235, 20, '#FFE9A8', '#FFF6DC', 0.6, 3, 0.34);
    if (q >= 1) fxRays(G, rx, ry, rz, 51.2, 1.1, 1.2, n1 >> 1, 200, 20, '#FFD27A', '#FFF1C2', 0.6, 29, 0.3);
    fxImplode(G, rx, ry, rz, 50.15, 52.35, 120, 14, '#FFD27A', '#FFF1C2', 0.7);
    if (q >= 1) fxImplode(G, rx, ry, rz, 50.75, 52.4, 150, 14, '#FFE9A8', '#FFF6DC', 0.4);
    if (rv) {
      const swell = fxSm((t - 49.9) / 2.5) * (1 - fxSm((t - 53) / 1.2));
      const rpx = rn.r * rv.k * rv.s;
      glow(ctx, rv.x, rv.y, rpx * (3.2 + 3.2 * swell), GOLD, 0.03 + 0.08 * swell);
    }
    const ca = t - 52.4;
    if (ca > 0 && ca < 1.9) {
      const u = ca / 1.8;
      const ks = fxKs(G, rx, ry, rz) || 1;
      fxRing(G, rx, ry, rz, rn.r * 1.2 + 70 * fxEo(u, 2.5), GOLD, FXPALE, Math.pow(1 - u, 1.4) * 0.85, (1.2 + 2.2 * (1 - u)) * ks);
      if (q >= 1) fxRing(G, rx, ry, rz, rn.r * 1.2 + 44 * fxEo(u, 2.5), '#FFF1C2', '#FFF6DC', Math.pow(1 - u, 2) * 0.35, 1.1 * ks);
    }
  }
  // ---- anticipation: the whole galaxy inhales into the core
  if (t > 54.9 && t < FXD0 && hv) {
    const u = (t - 54.9) / 1.1;
    const n2 = q >= 2 ? 32 : q === 1 ? 18 : 8;
    fxRays(G, 0, 0, 0, 54.95, 0.5, 0.7, n2, 250, 30, '#FFD27A', '#FFF1C2', 0.7, 41, 0.3);
    fxImplode(G, 0, 0, 0, 54.95, 56.0, 235, 26, '#FFD27A', '#FFF1C2', 0.65);
    if (q >= 1) fxImplode(G, 0, 0, 0, 55.2, 56.0, 190, 26, '#FFE9A8', '#FFF6DC', 0.35);
    fxHalo(ctx, hv.x, hv.y, hv.n.r * hv.k * (3.2 + 1.6 * fxSm(u)), '#FFB85C', 0.08 + 0.22 * fxSm(u));
  }
  // ---- delivery: a golden shockwave through the galaxy plane, a column of light from the report
  const a = t - FXD0;
  if (a > 0 && a < 4.2) {
    const u = a / 3.6;
    const R = 20 + 262 * fxEo(u, 2.1);
    const env = Math.pow(1 - fxSm(u > 1 ? 1 : u), 1.05) * Math.min(1, a / 0.1);
    const ks = fxKs(G, 0, 0, 0) || 1;
    fxRing(G, 0, 0, 0, R, GOLD, '#FFF6DC', env * 0.95, (2 + 3.6 * (1 - u)) * ks);
    if (q >= 1) {
      const ue = (a - 0.38) / 3.4;
      if (ue > 0 && ue < 1) fxRing(G, 0, 0, 0, 20 + 250 * fxEo(ue, 2.1), '#FFD27A', '#FFE9A8', Math.pow(1 - ue, 1.2) * 0.6, 1.8 * ks);
    }
    if (q >= 2) fxRing(G, 0, 0, 0, R * 0.78 - 6, '#FFB65C', '#FFD27A', env * 0.3, 1.2 * ks);
    fxLanePass(G, R, 17, env * 1.1);
    fxPings(G, N, R, 17, '#FFE9A8', env * 0.9);
    if (hv) {
      const rs = hv.n.r * hv.k * hv.s;
      const pk = a < 0.2 ? fxSm(a / 0.2) : Math.exp(-(a - 0.2) / 0.7);
      fxHalo(ctx, hv.x, hv.y, rs * (3.4 + 2 * pk), '#FFB85C', 0.32 * pk);
      fxHalo(ctx, hv.x, hv.y, Math.max(40, R * hv.k * 1.05), GOLD, 0.06 * env);
    }
    if (rn) fxPillar(G, m.P[ro], m.P[ro + 1], m.P[ro + 2], fxPulse(a - 0.05, 0.3, 1.2) * 0.8, 4.6, 420);
    // golden dust flung outwards in the plane
    if (q >= 1) {
      const nd = q >= 2 ? 44 : 22;
      const ed = fxEo(u, 2.1);
      const ga = Math.pow(1 - fxSm(u > 1 ? 1 : u), 1.2);
      for (let k = 0; k < nd; k++) {
        const idx = (k * 3 + 1) & 63;
        const ang = FXR[idx * 2] * 6.2832 + k * 2.4;
        const sc = (0.5 + 0.5 * FXR[idx * 2 + 1]) * 270 * ed + 24;
        const px = Math.cos(ang) * sc;
        const pz = Math.sin(ang) * sc;
        const p = G.proj(px, pz * LT_S + (FXU[idx * 3 + 1]) * 14, pz * LT_C);
        if (p[3] < NEAR) continue;
        glow(ctx, p[0], p[1], 2.2 + 2.2 * FXR[idx * 2 + 1], FXR[idx * 2] > 0.5 ? '#FFE9A8' : '#FFF6DC', ga * 0.65);
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------- core pulse
// the black hole has no star to flare: on story beats (start, phases, report, delivery) the corona breathes a little
// (an annular halo: the dark disc is never filled)
function fxFlare(G, N) {
  const { ctx, t, rm } = G;
  const hv = N.PV[0];
  if (!hv || rm) return;
  let E = 1.0 * fxPulse(t - 0.05, 0.4, 0.95) + 0.7 * fxPulse(t - 6, 0.25, 1.0) + 0.5 * fxPulse(t - 14, 0.25, 1.0);
  E += 0.8 * fxPulse(t - 50, 0.3, 1.2) + 1.0 * fxPulse(t - FXD0, 0.18, 1.2);
  if (t > 55 && t < FXD0) E += 0.5 * fxSm((t - 55) / 1);
  if (!(E > 0.02)) return;
  const rs = hv.n.r * hv.k * hv.s;
  if (!(rs > 1)) return;
  ctx.globalCompositeOperation = 'lighter';
  fxHalo(ctx, hv.x, hv.y, rs * (3.0 + 1.2 * E), '#FFC46A', Math.min(0.36, 0.3 * E));
}

// ---------------------------------------------------------------------------------------------------- stage
function drawFx(G, N) {
  const ctx = G.ctx;
  const q0 = G.q;
  if (!FXOC && q0 > 1) G.q = 1;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  fxIntro(G, N);
  fxPhases(G, N);
  fxSpawns(G, N);
  fxMessages(G, N);
  fxFinale(G, N);
  fxFlare(G, N);
  fxEnd(G);
  G.q = q0;
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
// @@MODULE:FX-END

// @@MODULE:LABELS-BEGIN
// labels: pills next to nodes with node-aware placement. The exclusion discs use the orbs' full radius (1.6 x the drawn
// radius), agent pills never cover another agent's orb (hard rule, more candidate slots before giving up), the Hermes label
// sits below the core, and file / decision pills appear only while the node is recent, selected or hovered (they fade out).
const LAB_DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0], [0.75, 0.75], [-0.75, 0.75], [0.75, -0.75], [-0.75, -0.75]];
// placement scratch (module level, no per-frame objects): exclusion discs of the visible nodes and the boxes already placed
const LAB_ND = 96;
const LAB_DX = new Float32Array(LAB_ND);
const LAB_DY = new Float32Array(LAB_ND);
const LAB_DR = new Float32Array(LAB_ND);
const LAB_DI = new Int16Array(LAB_ND);
const LAB_DA = new Int8Array(LAB_ND);
const LAB_NP = 64;
const LAB_PB = new Float32Array(LAB_NP * 4);
let LAB_nd = 0;
let LAB_np = 0;
// penalty of the box (x1,y1,x2,y2): 0 = free, 1 = overlaps a small node, 2 = overlaps a placed pill or an agent / hub orb
function labHit(x1, y1, x2, y2, own) {
  let pen = 0;
  for (let k = 0; k < LAB_np; k++) {
    const o = k * 4;
    if (x1 < LAB_PB[o + 2] && LAB_PB[o] < x2 && y1 < LAB_PB[o + 3] && LAB_PB[o + 1] < y2) return 2;
  }
  for (let k = 0; k < LAB_nd; k++) {
    if (LAB_DI[k] === own) continue;
    const dx = LAB_DX[k];
    const dy = LAB_DY[k];
    const nx = x1 > dx ? x1 : dx < x2 ? dx : x2;
    const ny = y1 > dy ? y1 : dy < y2 ? dy : y2;
    const rr = LAB_DR[k];
    if ((nx - dx) * (nx - dx) + (ny - dy) * (ny - dy) < rr * rr) { if (LAB_DA[k]) return 2; pen = 1; }
  }
  return pen;
}
const LAB_FONT = "600 FSpx 'Instrument Sans', 'Segoe UI', system-ui, sans-serif";
const LAB_FONTS = {};
const LAB_SHORT = new Map();
// decision titles can be whole sentences: keep the pill compact (cached per title text and font size; node indices
// are shared between scenarios, so the text itself is the key)
function labText(ctx, n, text, fs, maxW) {
  if (n.kind !== 'decision') return text;
  const key = text + '|' + ((fs * 2) | 0);
  let s = LAB_SHORT.get(key);
  if (s !== undefined) return s;
  s = text;
  if (ctx.measureText(s).width > maxW) {
    const words = text.split(' ');
    s = '';
    for (let i = 0; i < words.length; i++) {
      const tryS = s ? s + ' ' + words[i] : words[i];
      if (ctx.measureText(tryS + '…').width > maxW && s) break;
      s = tryS;
    }
    s = s.replace(/[ ,.;:]*$/, '') + '…';
  }
  LAB_SHORT.set(key, s);
  return s;
}
const labCmp = (a, b) => b.pr - a.pr;
function labFont(fs) {
  let f = LAB_FONTS[fs];
  if (!f) f = LAB_FONTS[fs] = LAB_FONT.replace('FS', String(fs));
  return f;
}
function drawLabels(G, N) {
  const { ctx, kref, t, S } = G;
  const labels = N.labels;
  const vn = N.vn;
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  labels.sort(labCmp);
  LAB_np = 0;
  LAB_nd = 0;
  for (let k = 0; k < vn.length && LAB_nd < LAB_ND; k++) {
    const v = vn[k];
    const kind = v.n.kind;
    LAB_DI[LAB_nd] = v.n.i; LAB_DX[LAB_nd] = v.x; LAB_DY[LAB_nd] = v.y;
    LAB_DR[LAB_nd] = Math.max(v.n.r * v.k * v.s * 1.6, kind === 'agent' ? 14 : 4);
    LAB_DA[LAB_nd] = kind === 'agent' || kind === 'hermes' || kind === 'report' ? 1 : 0;
    LAB_nd++;
  }
  ctx.textBaseline = 'middle';
  for (let li = 0; li < labels.length; li++) {
    const lb = labels[li];
    const v = lb.v;
    const n = v.n;
    const isAgent = n.kind === 'agent';
    const isHub = n.kind === 'hermes' || n.kind === 'report';
    let alpha = 1;
    if (n.kind === 'file' || n.kind === 'decision') {
      const sel = S && (S.sel === n.id || S.hover === n.id);
      const age = t - n.spawn;
      const life = n.kind === 'file' ? 6.5 : 4.5;
      if (!sel) {
        if (age > life) continue;
        alpha = clamp((life - age) / 0.8, 0, 1) * clamp(age / 0.4, 0, 1);
        if (alpha < 0.04) continue;
      }
    }
    const fs = clamp(Math.round(12.5 * clamp(v.k / kref, 0.85, 1.25) * 2) / 2, 12, 15);
    ctx.font = labFont(fs);
    const text = labText(ctx, n, lb.text, fs, 150);
    const tw = ctx.measureText(text).width + (isAgent ? 29 : 12);
    const h = fs + 9;
    const r = Math.max(n.r * v.k * v.s * 1.6, isAgent ? 14 : 4);
    const gap = r + (isHub ? 10 : 6);
    const ndir = isHub ? 1 : isAgent ? 8 : 6;
    let found = false;
    let bestPen = 9;
    let bx = 0;
    let by = 0;
    let ringUsed = 0;
    for (let ring = 0; ring < (isAgent ? 3 : 2) && !found; ring++) {
      ringUsed = ring;
      const dd = gap * (1 + ring * 0.55);
      for (let k = 0; k < ndir; k++) {
        const dx = LAB_DIRS[k][0];
        const dy = LAB_DIRS[k][1];
        const cx = v.x + dx * (dd + (tw / 2) * Math.abs(dx));
        const cy = v.y + dy * (dd + h / 2);
        const pen = labHit(cx - tw / 2, cy - h / 2, cx + tw / 2, cy + h / 2, n.i);
        if (pen === 0) { found = true; bx = cx; by = cy; break; }
        if (pen < bestPen && !(isAgent && pen === 2)) { bestPen = pen; bx = cx; by = cy; }
      }
    }
    if (!found) {
      // nothing free: hubs keep the least bad slot, agents and small nodes give up rather than cover an orb or a pill
      if (!isHub || bestPen === 9) continue;
    }
    const bx1 = bx - tw / 2;
    const by1 = by - h / 2;
    if (LAB_np < LAB_NP) { const o = LAB_np * 4; LAB_PB[o] = bx1; LAB_PB[o + 1] = by1; LAB_PB[o + 2] = bx1 + tw; LAB_PB[o + 3] = by1 + h; LAB_np++; }
    ctx.globalAlpha = alpha;
    if (isAgent && ringUsed > 0) {
      // the pill floated away from its orb: a thin leader tick from the orb rim to the nearest pill edge
      const ex = Math.max(bx1, Math.min(v.x, bx1 + tw));
      const ey = Math.max(by1, Math.min(v.y, by1 + h));
      let dx = ex - v.x;
      let dy = ey - v.y;
      const dl = Math.sqrt(dx * dx + dy * dy);
      const r0 = r / 1.6 + 2;
      if (dl > r0 + 3) {
        dx /= dl; dy /= dl;
        ctx.strokeStyle = rgba(n.color, 0.55);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(v.x + dx * r0, v.y + dy * r0); ctx.lineTo(ex, ey); ctx.stroke();
      }
    }
    rrect(ctx, bx1, by1, tw, h, h / 2);
    ctx.fillStyle = 'rgba(4,7,18,0.8)';
    ctx.fill();
    ctx.strokeStyle = rgba(n.color, 0.34);
    ctx.lineWidth = 1;
    ctx.stroke();
    if (isAgent) {
      ctx.fillStyle = n.color;
      ctx.beginPath(); ctx.arc(bx1 + 12, by, 8.5, 0, 6.2832); ctx.fill();
      ctx.fillStyle = '#0B1020';
      ctx.font = "600 12px 'IBM Plex Mono', ui-monospace, monospace";
      ctx.textAlign = 'center';
      ctx.fillText(n.line, bx1 + 12, by + 0.5);
      ctx.font = labFont(fs);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#EAF0FF';
      ctx.fillText(lb.text, bx1 + 25, by);
    } else {
      ctx.textAlign = 'center';
      ctx.fillStyle = n.kind === 'file' ? mixHex(n.color, '#FFFFFF', 0.25) : n.kind === 'decision' ? DEC_COL : '#EAF0FF';
      ctx.fillText(text, bx, by);
    }
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'left';
}
function drawCards(G, N) {
  const { ctx, m, t } = G;
  const nodes = m.nodes;
  const sf = G.sf;
  const PV = N.PV;
  // ---------- conversation cards (docked at the bottom of the free area, wired to the speaker) ----------
  const cardList = [];
  for (let i = m.ev.length - 1; i >= 0 && cardList.length < 2; i--) {
    const ev = m.ev[i];
    if (ev.t > t) continue;
    if (t - ev.t > 4.6) break;
    if (PV[ev.from]) cardList.push(ev);
  }
  cardList.reverse();
  const cw2 = Math.min(262, Math.max(180, (sf.r - sf.l - 24) / (cardList.length > 1 ? 2 : 1) - 6));
  for (let ci = 0; ci < cardList.length; ci++) {
    const ev = cardList[ci];
    const sv = PV[ev.from];
    const age = t - ev.t;
    const al = clamp(age / 0.3, 0, 1) * clamp((4.6 - age) / 0.9, 0, 1);
    const col = pulseColor(ev, nodes);
    ctx.font = "500 12.5px 'Instrument Sans', 'Segoe UI', system-ui, sans-serif";
    const lines = wrapText(ctx, ev.text, cw2 - 26, 3);
    const h = lines.length * 16 + 32;
    const total = cardList.length * cw2 + (cardList.length - 1) * 8;
    const bx = (sf.l + sf.r) / 2 - total / 2 + ci * (cw2 + 8);
    const by = sf.b - h - 4;
    ctx.globalAlpha = al * 0.8;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(col, 0.8);
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(bx + cw2 / 2, by); ctx.lineTo(sv.x, sv.y + Math.max(8, sv.n.r * sv.k * 1.5)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = al;
    rrect(ctx, bx, by, cw2, h, 10);
    ctx.fillStyle = 'rgba(7,11,28,0.88)';
    ctx.fill();
    ctx.strokeStyle = rgba(col, 0.7);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = "500 12px 'IBM Plex Mono', ui-monospace, monospace";
    ctx.fillStyle = col;
    let tag = (KIND[ev.kind] ? KIND[ev.kind].label : ev.kind).toUpperCase() + '  ' + nodes[ev.from].label + ' > ' + (ev.to >= 0 ? nodes[ev.to].label : 'Ty');
    if (ctx.measureText(tag).width > cw2 - 24) {
      tag = (KIND[ev.kind] ? KIND[ev.kind].label : ev.kind).toUpperCase() + '  ' + nodes[ev.from].label + ' >';
      while (tag.length > 4 && ctx.measureText(tag + '…').width > cw2 - 24) tag = tag.slice(0, -1);
      if (!tag.endsWith('>')) tag += '…';
    }
    ctx.fillText(tag, bx + 12, by + 15);
    ctx.font = "500 12.5px 'Instrument Sans', 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = '#E8ECF8';
    for (let l = 0; l < lines.length; l++) ctx.fillText(lines[l], bx + 12, by + 33 + l * 16);
    ctx.globalAlpha = 1;
  }
}
// @@MODULE:LABELS-END

function draw3d(ctx, W, H, S) {
  const m = S.m;
  const t = S.t;
  const cam = S.cam;
  const sf = S.safe || { l: 0, r: W, t: 0, b: H };
  const cards = S.cards !== false;
  const cw = sf.r - sf.l;
  const ch = sf.b - sf.t - (cards ? 70 : 0);
  const unit = (S.k || 1) * Math.max(0.3, Math.min(cw / 380, ch / 262));
  const G = FRAME;
  G.ctx = ctx; G.W = W; G.H = H; G.S = S; G.m = m; G.t = t; G.fx = S.fx; G.q = S.q; G.rm = S.rm; G.cam = cam; G.sf = sf;
  G.cyw = Math.cos(cam.yaw); G.syw = Math.sin(cam.yaw); G.cpt = Math.cos(cam.pitch); G.spt = Math.sin(cam.pitch);
  G.unit = unit; G.kref = unit; G.dist = cam.dist; G.f = unit * cam.dist;
  G.cx = (sf.l + sf.r) * 0.5;
  G.cy = (sf.t + sf.b - (cards ? 70 : 0)) * 0.5;
  const PP = [0, 0, 0, 0];
  const { cyw, syw, cpt, spt, f, dist, cx, cy } = G;
  G.proj = (x, y, z) => {
    x -= cam.tx; y -= cam.ty; z -= cam.tz;
    const x1 = x * cyw - z * syw;
    const z1 = x * syw + z * cyw;
    const y2 = y * cpt - z1 * spt;
    const z2 = y * spt + z1 * cpt;
    const zc = z2 + dist;
    const k = f / Math.max(zc, 40);
    PP[0] = cx + x1 * k; PP[1] = cy - y2 * k; PP[2] = k; PP[3] = zc;
    return PP;
  };
  posAt(m, t, S.fx);
  curves(m);

  ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineDashOffset = 0;
  ctx.setLineDash([]);

  drawGalaxy(G);
  drawOrbits(G);
  const list = drawSynapses(G);
  drawFlows(G, list);
  const N = drawNeurons(G);
  drawFx(G, N);
  drawLabels(G, N);
  if (cards) drawCards(G, N);

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  const vg = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.34, cx, cy, Math.max(W, H) * 0.78);
  vg.addColorStop(0, 'rgba(2,4,12,0)');
  vg.addColorStop(1, 'rgba(2,4,12,0.62)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  return N.picks;
}
