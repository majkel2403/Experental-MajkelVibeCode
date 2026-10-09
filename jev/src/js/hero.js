/* hero — "JEV DECIDES": a luminous neural-network diagram. Every live decision flows left -> right:
 * state -> encode -> jev system one -> typed questions -> answers -> code acts.  Two canvases:
 *   #hero-static  cached mesh (panels, ~1100 additive edges, nodes, labels) — redrawn only on resize / fonts
 *   #hero-live    per-frame: beams (white-hot head, pink tail), flashes, bars, counters, pointer glow
 *   + four small offscreen text canvases (state values, answer %, code cards, typed-question labels) blitted on top, each re-drawn only when its text changes
 * Everything is simulated; decisions come from the shared JEV bus. */
JEV.mod('hero', () => {
  'use strict';
  const J = JEV, clamp = J.clamp;
  const stage = J.$('#heroStage'), net = J.$('#heroNet'), cs = J.$('#hero-static'), cl = J.$('#hero-live');
  if (!stage || !net || !cs || !cl) return;
  const cardEl = J.$('.hero-card', stage), titleEl = J.$('#heroTitle'), chipEl = J.$('#hero-chip');
  const CH = { sym: J.$('#hero-c-sym'), act: J.$('#hero-c-act'), conf: J.$('#hero-c-conf'), size: J.$('#hero-c-size'), risk: J.$('#hero-c-risk'), dest: J.$('#hero-c-dest'), ms: J.$('#hero-c-ms'), why: J.$('#hero-c-why') };
  const FF = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
  const SF = "'Fraunces', 'Playfair Display', 'Iowan Old Style', Georgia, serif";
  const hasLS = 'letterSpacing' in CanvasRenderingContext2D.prototype;
  const KEYS = J.STATE_KEYS, ACTS = J.ACTIONS;
  const ROW = ['buy', 'sell', 'hold', 'close', 'flatten', '0.5%', '1%', '2%', '4%', 'go', 'no-go'];
  const GRP = [0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2];
  const GFIRST = [0, 5, 9], GLAST = [4, 8, 10];
  const DEST = { execute: 0, review: 1, skip: 2 };
  const DSUB = ['send the order', 'human queue', 'no order'];
  const DASH = [2, 3], NODASH = [];

  /* ---------- colour ramps + glow sprites (pre-rendered; no shadowBlur per frame) ---------- */
  const T_PINK = 0, T_AMB = 1, T_RED = 2, T_WHT = 3, T_DIM = 4;
  const RGB = [[255, 46, 110], [255, 193, 61], [255, 77, 94], [255, 255, 255], [196, 150, 178]];
  const RAMP = RGB.map((c) => { const a = []; for (let i = 0; i <= 32; i++) a.push('rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (i / 32).toFixed(3) + ')'); return a; });
  const BRGB = [[255, 148, 198], [255, 216, 128], [255, 132, 142], [255, 255, 255], [226, 196, 212]]; // lighter ramps for beam trails, so they read on top of the bright mesh
  const BRAMP = BRGB.map((c) => { const a = []; for (let i = 0; i <= 32; i++) a.push('rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (i / 32).toFixed(3) + ')'); return a; });
  const SPR = RGB.map((c) => {
    const s = document.createElement('canvas'); s.width = s.height = 96;
    const x = s.getContext('2d'), gr = x.createRadialGradient(48, 48, 0, 48, 48, 48), hi = c.map((v) => Math.round(v + (255 - v) * 0.62)).join(',');
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.1, 'rgba(' + hi + ',.96)'); gr.addColorStop(0.28, 'rgba(' + c.join(',') + ',.55)');
    gr.addColorStop(0.6, 'rgba(' + c.join(',') + ',.13)'); gr.addColorStop(1, 'rgba(' + c.join(',') + ',0)');
    x.fillStyle = gr; x.fillRect(0, 0, 96, 96); return s;
  });

  /* wave-beam head = tint glow + white-hot core, baked into ONE sprite per tint (was two drawImage calls per live beam; the core is ~0.36 of the glow's width on desktop, ~0.43 on phone) */
  const SPRH = [0.36, 0.43].map((k) => SPR.map((sp) => {
    const s = document.createElement('canvas'); s.width = s.height = 96; const x = s.getContext('2d'), c = 96 * k;
    x.drawImage(sp, 0, 0); x.globalCompositeOperation = 'lighter'; x.drawImage(SPR[T_WHT], 48 - c / 2, 48 - c / 2, c, c); return s;
  }));

  const SOFT = RGB.map((c) => {
    const s = document.createElement('canvas'); s.width = s.height = 64; const x = s.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(' + c.join(',') + ',.7)'); gr.addColorStop(0.5, 'rgba(' + c.join(',') + ',.28)'); gr.addColorStop(1, 'rgba(' + c.join(',') + ',0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return s;
  });
  const BND = RGB.map((c) => { // horizontal glow band for a selected answer row (strong at the port, fading right)
    const s = document.createElement('canvas'); s.width = 128; s.height = 32; const x = s.getContext('2d'); let gr = x.createLinearGradient(0, 0, 0, 32);
    gr.addColorStop(0, 'rgba(' + c.join(',') + ',0)'); gr.addColorStop(0.5, 'rgba(' + c.join(',') + ',.85)'); gr.addColorStop(1, 'rgba(' + c.join(',') + ',0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 32);
    x.globalCompositeOperation = 'destination-in'; gr = x.createLinearGradient(0, 0, 128, 0); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,.25)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 32); return s;
  });

  /* ---------- graph: 8 layers, one flat node array, one flat edge array ---------- */
  const LC = [15, 12, 18, 24, 18, 3, 11, 3]; // state · encode · jev a/b/c · questions · answers · code
  const LS = [0]; for (let i = 0; i < 8; i++) LS.push(LS[i] + LC[i]);
  const NN = LS[8];
  const nx = new Float32Array(NN), ny = new Float32Array(NN), nfl = new Float32Array(NN), nL = new Uint8Array(NN);
  for (let l = 0; l < 8; l++) for (let i = LS[l]; i < LS[l + 1]; i++) nL[i] = l;
  const EMAX = 1500;
  const ex0 = new Float32Array(EMAX), ey0 = new Float32Array(EMAX), ex1 = new Float32Array(EMAX), ey1 = new Float32Array(EMAX);
  const e2 = new Float32Array(EMAX), elen = new Float32Array(EMAX), eA = new Float32Array(EMAX);
  const esrc = new Int16Array(EMAX), edst = new Int16Array(EMAX), ec = new Uint8Array(EMAX), eTr = new Uint8Array(EMAX);
  const nout0 = new Int16Array(NN), noutN = new Int16Array(NN), lES = new Int16Array(9);
  let EN = 0, topoMode = -1;

  function buildTopo(dens) {
    const R = J.rng(2718), seen = new Uint8Array(32); let n = 0;
    for (let tr = 0; tr < 7; tr++) {
      lES[tr] = n;
      const an = LC[tr], bn = LC[tr + 1], a0 = LS[tr], b0 = LS[tr + 1];
      const al = tr === 0 ? 0.4 : tr === 1 ? 0.3 : tr === 2 || tr === 3 ? [0.34, 0.27, 0.2][dens] : tr === 4 ? 0.46 : tr === 5 ? 0.7 : 0.3;
      const curve = tr === 2 || tr === 3 ? 0 : 1;
      for (let i = 0; i < an; i++) {
        nout0[a0 + i] = n; seen.fill(0);
        const pick = (j) => { if (j < 0 || j >= bn || seen[j]) return; seen[j] = 1; esrc[n] = a0 + i; edst[n] = b0 + j; eA[n] = al * (0.72 + R() * 0.56); ec[n] = curve; eTr[n] = tr; n++; };
        if (tr === 0) { const j = Math.round(i * (bn - 1) / (an - 1)); pick(j); pick(j - 1); pick(j + 1); pick(Math.floor(R() * bn)); }
        else if (tr === 1) { const c = Math.round(i * (bn - 1) / (an - 1)), k = [2, 3, 4][dens]; for (let d = -k; d <= k; d++) pick(c + d); }
        else if (tr === 2 || tr === 3) {
          if (dens === 2) for (let j = 0; j < bn; j++) pick(j);
          else { const k = dens === 1 ? 14 : 8, off = R() * bn; for (let t = 0; t < k; t++) pick(Math.floor((off + t * bn / k) % bn)); }
        } else if (tr === 5) { for (let j = GFIRST[i]; j <= GLAST[i]; j++) pick(j); }
        else for (let j = 0; j < 3; j++) pick(j); // tr 4 (c -> questions) and tr 6 (answers -> code)
        noutN[a0 + i] = n - nout0[a0 + i];
      }
    }
    lES[7] = n; EN = n; topoMode = dens;
  }
  /* point on edge i at u in 0..1 -> PX, PY (S-curve for panel-to-panel edges, straight inside jev) */
  let PX = 0, PY = 0;
  function ep(i, u) {
    const x0 = ex0[i], y0 = ey0[i], x1 = ex1[i], y1 = ey1[i];
    if (ec[i]) { const s = u * u * (3 - 2 * u), xs = u * (1.5 - 1.5 * u + u * u); PX = x0 + (x1 - x0) * xs; PY = y0 + (y1 - y0) * s; }
    else { PX = x0 + (x1 - x0) * u; PY = y0 + (y1 - y0) * u; }
  }

  /* ---------- layout (recomputed on resize only) ---------- */
  let W = 0, H = 0, M = false, gs = null, gl = null, FS = 9, FS2 = 9, FSS = 9, QX = 0, qFS = 9, qFS2 = 9, cFS = 9, cFS2 = 9, fFS = 9, kFS = 8, confW = 26;
  const HALO = 'rgba(8,4,13,.88)';
  const P = [0, 1, 2, 3, 4, 5].map(() => ({ x: 0, y: 0, w: 0, h: 0 }));
  const CARDS = [0, 1, 2].map(() => ({ x: 0, y: 0, w: 0, h: 0 })), QP = [0, 1, 2].map(() => ({ x: 0, y: 0, w: 0, h: 0 })); // QP: dark label plates behind the typed-question text
  const rowY = new Float32Array(11), grpY = new Float32Array(3), qy = new Float32Array(3);
  let pitch = 28, bx0 = 0, bx1 = 0, barH = 5, qr = 14, hdrH = 40, spitch = 28;
  const cabX = new Float32Array(49), cabY = new Float32Array(49);
  let jcx = 0, jcy = 0;

  function layout() {
    const m = M, top = m ? 52 : 64, bot = H - (m ? 30 : 36), ah = bot - top;
    let pad, w, gp;
    if (m) { const k = W / 390; pad = 5 * k; w = [14, 22, 100, 44, 88, 54].map((v) => v * k); gp = [14, 12, 12, 10, 8].map((v) => v * k); }
    else {
      const cmp = W < 1000, kw = clamp(W / 1440, 1, 1.4); pad = clamp(W * 0.02, 14, 30); // kw: past 1440 the column caps grow with the stage, so the type can grow with it
      w = cmp ? [92, 38, clamp(W * 0.2, 140, 230), 124, 110, 88] : [clamp(W * 0.095, 132, 150 * kw), clamp(W * 0.046, 54, 68 * kw), clamp(W * 0.225, 212, 330 * kw), clamp(W * 0.095, 124, 148 * kw), clamp(W * 0.145, 140, 212 * kw), clamp(W * 0.103, 104, 152 * kw)];
      const rem = W - 2 * pad - w.reduce((a, b) => a + b, 0), wt = [1, 1.15, 1.2, 1, 0.7];
      gp = wt.map((v) => Math.max(16, rem * v / 5.05));
    }
    const X = []; let x = pad; for (let i = 0; i < 6; i++) { X.push(x); x += w[i] + (gp[i] || 0); }
    let cardT = 1e9, cardRt = -1;
    if (!m && cardEl) { cardT = cardEl.offsetTop; cardRt = cardEl.offsetLeft + cardEl.offsetWidth; }
    const colBot = (i) => (X[i] < cardRt + 6 ? Math.min(bot, cardT - 14) : bot);
    // type scales with the stage (>= 9px on desktop, 12px at 1800+); phone: 8px answer rows, 7px elsewhere
    FS = m ? 8 : W < 1000 ? 9 : clamp(Math.round(W / 75) / 2, 9, 12); FS2 = m ? 7 : W < 1000 ? 8.5 : Math.max(9, FS - 0.5); FSS = m ? 7 : W < 1000 ? 8.5 : Math.max(9, FS2 - 1); hdrH = m ? 24 : 40; // FS2: titles, group names, floor/conf tags · FSS: the small grey sub-lines
    // STATE
    let p = P[0], av = colBot(0) - top;
    spitch = Math.min(m ? 22 : 30, (av - hdrH - 12) / 15);
    p.x = X[0]; p.w = w[0]; p.h = hdrH + 15 * spitch + 10; p.y = top + (av - p.h) / 2;
    for (let i = 0; i < 15; i++) { nx[i] = p.x + p.w - (m ? 6 : 8); ny[i] = p.y + hdrH + (i + 0.5) * spitch; }
    const cE = p.y + p.h / 2;
    // ENCODE (narrow, zig-zag)
    p = P[1]; p.x = X[1]; p.w = w[1]; p.h = Math.min(colBot(1) - top, P[0].h * 0.92); p.y = cE - p.h / 2;
    { const y0 = p.y + hdrH + 2, y1 = p.y + p.h - 12;
      for (let j = 0; j < 12; j++) { nx[15 + j] = p.x + p.w * (j % 2 ? 0.7 : 0.3); ny[15 + j] = y0 + (j + 0.5) * (y1 - y0) / 12; } }
    // JEV SYSTEM ONE (tall, three dense layers)
    p = P[2]; p.x = X[2]; p.w = w[2]; p.y = top; p.h = colBot(2) - top;
    const hJ = m ? 24 : 46, iy0 = p.y + hJ, iy1 = p.y + p.h - (m ? 9 : 15), ih = iy1 - iy0;
    const LY = [[0.13, 0.08, 0.92], [0.5, 0.02, 0.98], [0.87, 0.08, 0.92]];
    for (let l = 0; l < 3; l++) { const n = LC[2 + l], b = LS[2 + l], c = LY[l]; for (let i = 0; i < n; i++) { nx[b + i] = p.x + p.w * c[0] + (i % 2 ? 1.5 : -1.5); ny[b + i] = iy0 + ih * (c[1] + (c[2] - c[1]) * i / (n - 1)); } }
    jcx = p.x + p.w / 2; jcy = p.y + p.h / 2;
    // TYPED QUESTIONS
    const mid = top + ah / 2, qs = clamp(ah * 0.2, 62, 130); qr = m ? 7.5 : 15;
    p = P[3]; p.x = X[3]; p.w = w[3];
    for (let i = 0; i < 3; i++) { qy[i] = mid + (i - 1) * qs; nx[LS[5] + i] = p.x + (m ? p.w / 2 : 26); ny[LS[5] + i] = qy[i]; }
    p.y = qy[0] - qr - (m ? 30 : 46); p.h = qy[2] + qr + (m ? 44 : 44) - p.y;
    if (!m) { // label block right of each node: fonts shrink to the card, a dark plate keeps the wires from striking through it
      QX = p.x + 26 + qr + 8; qFS = fitSz(gs, 'which action?', 700, Math.min(FS, 11), 0, p.x + p.w - 6 - QX, 7.5); qFS2 = Math.min(FSS, qFS);
      const pw = Math.min(p.x + p.w - 4 - (QX - 6), Math.ceil(13 * 0.6 * qFS) + 12);
      for (let i = 0; i < 3; i++) { const q = QP[i]; q.x = QX - 6; q.y = qy[i] - 15; q.w = pw; q.h = 42; }
    }
    // ANSWERS (11 rows, 3 groups)
    const gh = m ? 12 : 16, gg = m ? 6 : 11;
    pitch = clamp((ah - 6 - hdrH - 3 * gh - 2 * gg - 12) / 11, 16, m ? 24 : 31);
    const spanH = hdrH + 3 * gh + 2 * gg + 11 * pitch + 12;
    p = P[4]; p.x = X[4]; p.w = w[4]; p.h = spanH; p.y = top + (ah - spanH) / 2;
    { let y = p.y + hdrH;
      for (let g = 0; g < 3; g++) { grpY[g] = y + gh * 0.62; y += gh; for (let r = GFIRST[g]; r <= GLAST[g]; r++) { rowY[r] = y + pitch / 2; y += pitch; } y += gg; }
      for (let r = 0; r < 11; r++) { nx[LS[6] + r] = p.x + (m ? 6 : 10); ny[LS[6] + r] = rowY[r]; } }
    barH = m ? 3.5 : 5;
    // the bar track starts after the longest row label ("flatten") and stops before a 2-digit percentage
    bx0 = m ? p.x + 14 : p.x + 22 + Math.ceil(4.2 * FS) + 8; bx1 = m ? p.x + p.w - 5 : p.x + p.w - 9 - Math.ceil(1.8 * FS) - 4;
    confW = Math.ceil(2.4 * FS2) + 10; // plate behind the confidence tick's "0.93"
    // CODE ACTS (3 glowing cards)
    p = P[5]; p.x = X[5]; p.w = w[5]; p.h = spanH; p.y = P[4].y;
    const ch = m ? 48 : clamp(pitch * 2.3, 56, 76), fr = [0.17, 0.5, 0.83];
    for (let k = 0; k < 3; k++) {
      const c = CARDS[k]; c.w = p.w - (m ? 9 : 16); c.h = ch; c.x = p.x + (m ? 4.5 : 8); c.y = p.y + hdrH + (spanH - hdrH - 8) * fr[k] - ch / 2;
      nx[LS[7] + k] = c.x; ny[LS[7] + k] = c.y + ch / 2;
    }
    cFS = m ? 7 : fitSz(gs, 'orders/execute', 700, Math.min(FS, 11), 0.6, CARDS[0].w - 16, 7); cFS2 = m ? 7 : fitSz(gs, 'send the order', 500, FSS, 0, CARDS[0].w - 16, 7);
    fFS = m ? 7 : FS2; kFS = m ? 7 : fitSz(gs, 'halted \u00b7 all to review', 700, FS2, 0, P[5].w - 14, 7.5); // floor / confidence / halted labels
    // main cable (catmull-rom through the middle of the tower, bottom-left -> top-right like the reference)
    const jp = P[2], pts = [[P[1].x + P[1].w, cE], [jp.x, jcy + jp.h * 0.1], [nx[LS[2] + 9], jcy + jp.h * 0.06], [jcx, jcy - jp.h * 0.01], [nx[LS[4] + 9], jcy - jp.h * 0.13], [jp.x + jp.w, jcy - jp.h * 0.21], [P[3].x, qy[1]]];
    let ci = 0;
    for (let s = 0; s < 6; s++) {
      const p0 = pts[Math.max(0, s - 1)], p1 = pts[s], p2 = pts[s + 1], p3 = pts[Math.min(6, s + 2)];
      for (let k = 0; k < 8; k++) {
        const t = k / 8, t2 = t * t, t3 = t2 * t;
        cabX[ci] = 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
        cabY[ci] = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
        ci++;
      }
    }
    cabX[48] = pts[6][0]; cabY[48] = pts[6][1];
    // edges
    for (let i = 0; i < EN; i++) {
      const s = esrc[i], d = edst[i]; ex0[i] = nx[s]; ey0[i] = ny[s]; ex1[i] = nx[d]; ey1[i] = ny[d];
      const dx = ex1[i] - ex0[i], dy = ey1[i] - ey0[i]; e2[i] = dx * dx + dy * dy + 1; elen[i] = Math.sqrt(e2[i]) * (ec[i] ? 1.06 : 1);
    }
    net.style.setProperty('--hero-jx', jcx.toFixed(0) + 'px'); net.style.setProperty('--hero-jy', jcy.toFixed(0) + 'px');
  }

  /* ---------- static layer: bloom, panels, additive mesh, nodes, labels, cards ---------- */
  function rr(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function T(g, s, x, y, ls) { if (ls && hasLS) { g.letterSpacing = ls + 'px'; g.fillText(s, x, y); g.letterSpacing = '0px'; } else g.fillText(s, x, y); }
  /* halo text: a dark outline under the glyphs so a wire that crosses a label never reads as a strike-through */
  function TH(g, s, x, y, ls, lw) {
    const sp = ls && hasLS; if (sp) g.letterSpacing = ls + 'px';
    g.lineJoin = 'round'; g.lineWidth = lw || 3; g.strokeStyle = HALO; g.strokeText(s, x, y); g.fillText(s, x, y);
    if (sp) g.letterSpacing = '0px';
  }
  /* largest font size <= sz (weight wt, letter-spacing ls) whose text fits maxW; never below min. Sets g.font as a side effect. */
  function fitSz(g, str, wt, sz, ls, maxW, min) {
    const sp = hasLS && ls ? ls * str.length : 0; let s = sz;
    for (;;) { g.font = wt + ' ' + s + 'px ' + FF; if (s <= min || g.measureText(str).width + sp <= maxW) return s; s = Math.max(min, s - 0.25); }
  }
  function panel(g, p, title, sub, hot) {
    rr(g, p.x, p.y, p.w, p.h, M ? 5 : 9);
    if (hot) { const gr = g.createLinearGradient(0, p.y, 0, p.y + p.h); gr.addColorStop(0, 'rgba(38,8,32,.9)'); gr.addColorStop(0.5, 'rgba(52,8,40,.84)'); gr.addColorStop(1, 'rgba(18,5,22,.9)'); g.fillStyle = gr; }
    else g.fillStyle = 'rgba(9,4,15,.84)';
    g.fill();
    g.save(); if (hot) { g.shadowColor = 'rgba(255,46,110,.75)'; g.shadowBlur = 26; }
    g.lineWidth = 1; g.strokeStyle = hot ? 'rgba(255,96,152,.66)' : 'rgba(255,70,140,.26)'; g.stroke(); g.restore();
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    const ts = M ? 7 : FS2, tl = M ? 0.5 : 1.6; g.fillStyle = hot ? '#ffd0e2' : '#e9dff0'; if (M) g.font = '700 7px ' + FF; else fitSz(g, title, 700, ts, tl, p.w - 18, 7); T(g, title, p.x + (M ? 3 : 10), p.y + (M ? 12 : 17), tl);
    if (sub && !M) { g.fillStyle = '#a095ac'; fitSz(g, sub, 500, FSS, 0.4, p.w - 13, 7); T(g, sub, p.x + 10, p.y + 29, 0.4); }
  }
  function strokeEdge(g, i) {
    g.beginPath(); g.moveTo(ex0[i], ey0[i]);
    if (ec[i]) { const mx = (ex0[i] + ex1[i]) / 2; g.bezierCurveTo(mx, ey0[i], mx, ey1[i], ex1[i], ey1[i]); } else g.lineTo(ex1[i], ey1[i]);
    g.stroke();
  }
  function drawStatic() {
    const g = gs; g.setTransform(J.DPR, 0, 0, J.DPR, 0, 0); g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    const jp = P[2];
    // blooms
    g.save(); g.translate(jcx, jcy + jp.h * 0.04); g.scale(1, jp.h / (jp.w * 1.25));
    let gr = g.createRadialGradient(0, 0, 0, 0, 0, jp.w * 1.2); gr.addColorStop(0, 'rgba(255,36,110,.34)'); gr.addColorStop(0.4, 'rgba(255,36,110,.12)'); gr.addColorStop(1, 'rgba(255,36,110,0)');
    g.fillStyle = gr; g.fillRect(-jp.w * 1.3, -jp.w * 1.3, jp.w * 2.6, jp.w * 2.6); g.restore();
    { const p = P[5]; gr = g.createRadialGradient(p.x + p.w * 0.5, p.y + p.h * 0.5, 0, p.x + p.w * 0.5, p.y + p.h * 0.5, Math.max(p.h * 0.7, 120));
      gr.addColorStop(0, 'rgba(255,36,110,.2)'); gr.addColorStop(1, 'rgba(255,36,110,0)'); g.fillStyle = gr; g.fillRect(p.x - 120, p.y - 60, p.w + 240, p.h + 120); }
    // panels
    panel(g, P[0], 'STATE', '15 fields \u00b7 from dots', false); panel(g, P[1], 'ENCODE', M ? '' : 'to vector', false);
    panel(g, P[2], 'JEV · SYSTEM ONE', 'decision layer · one pass', true);
    panel(g, P[3], M ? 'QUESTIONS' : 'TYPED QUESTIONS', 'choice · score · flag', false);
    panel(g, P[4], 'ANSWERS', 'real probabilities', false); panel(g, P[5], 'CODE ACTS', 'plain code sends', false);
    // tower glow column
    { const lg = g.createLinearGradient(jp.x + jp.w * 0.25, 0, jp.x + jp.w * 0.75, 0); lg.addColorStop(0, 'rgba(255,60,130,0)'); lg.addColorStop(0.5, 'rgba(255,90,160,.12)'); lg.addColorStop(1, 'rgba(255,60,130,0)');
      g.globalCompositeOperation = 'lighter'; g.fillStyle = lg; g.fillRect(jp.x + jp.w * 0.25, jp.y + 40, jp.w * 0.5, jp.h - 50); }
    // mesh
    g.globalCompositeOperation = 'lighter'; g.lineWidth = M ? 0.8 : 0.75;
    for (let i = 0; i < EN; i++) { g.strokeStyle = 'rgba(255,62,134,' + eA[i].toFixed(3) + ')'; strokeEdge(g, i); }
    // woven cable strands (the bright diagonal "tower" through the middle)
    for (let k = -3; k <= 3; k++) {
      g.strokeStyle = k === 0 ? 'rgba(255,190,220,.75)' : 'rgba(255,100,170,' + (0.5 - Math.abs(k) * 0.07).toFixed(3) + ')'; g.lineWidth = k === 0 ? 1.5 : 1;
      g.beginPath();
      for (let i = 0; i < 49; i++) {
        const a = Math.max(0, i - 1), b = Math.min(48, i + 1); let nxv = cabY[b] - cabY[a], nyv = cabX[a] - cabX[b]; const nl = Math.hypot(nxv, nyv) || 1; nxv /= nl; nyv /= nl;
        const off = Math.sin(i * 0.42 + k * 1.3) * (M ? 3 : 7) * (k / 3) * Math.sin(Math.PI * i / 48);
        if (i) g.lineTo(cabX[i] + nxv * off, cabY[i] + nyv * off); else g.moveTo(cabX[i], cabY[i]);
      }
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    // nodes
    for (let i = 0; i < NN; i++) {
      const l = nL[i]; if (l === 6 || l === 7) continue;
      g.beginPath();
      if (l === 0) { g.arc(nx[i], ny[i], M ? 2.6 : 3.4, 0, J.TAU); g.fillStyle = '#0b0610'; g.fill(); g.strokeStyle = 'rgba(255,110,170,.85)'; g.lineWidth = 1; g.stroke(); }
      else if (l === 5) { g.arc(nx[i], ny[i], qr, 0, J.TAU); const rg = g.createRadialGradient(nx[i], ny[i], 0, nx[i], ny[i], qr); rg.addColorStop(0, 'rgba(255,60,130,.55)'); rg.addColorStop(1, 'rgba(60,8,36,.9)'); g.fillStyle = rg; g.fill(); g.strokeStyle = 'rgba(255,120,176,.95)'; g.lineWidth = M ? 1.2 : 1.8; g.stroke(); g.beginPath(); g.arc(nx[i], ny[i], qr * 0.38, 0, J.TAU); g.fillStyle = 'rgba(255,214,230,.9)'; g.fill(); }
      else { const r = l === 1 ? (M ? 1.8 : 2.4) : (M ? 1.5 : 2); g.arc(nx[i], ny[i], r, 0, J.TAU); g.fillStyle = l === 1 ? '#ffa2c6' : '#ff8fbb'; g.fill(); }
    }
    // state labels (right-aligned to the ports)
    g.textBaseline = 'middle';
    if (!M) { g.textAlign = 'right'; g.font = '500 ' + FS + 'px ' + FF; g.fillStyle = '#b0a5bb'; for (let i = 0; i < 15; i++) g.fillText(KEYS[i], nx[i] - 10, ny[i] + 0.5); }
    // answer rows
    const pa = P[4];
    for (let r = 0; r < 11; r++) {
      const y = rowY[r], gx = nx[LS[6] + r];
      g.beginPath(); g.arc(gx, y, M ? 2.4 : 3.2, 0, J.TAU); g.fillStyle = '#0b0610'; g.fill(); g.strokeStyle = 'rgba(255,110,170,.85)'; g.lineWidth = 1; g.stroke();
      g.textAlign = 'left'; g.fillStyle = '#b0a5bb'; g.font = '500 ' + FS + 'px ' + FF;
      TH(g, ROW[r], pa.x + (M ? 14 : 22), M ? y - 3.5 : y + 0.5, 0, M ? 2 : 3);
      g.fillStyle = 'rgba(255,255,255,.075)'; g.fillRect(bx0, M ? y + 2.5 : y - barH / 2, bx1 - bx0, barH);
    }
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    const GN = ['choice', 'score', 'flag'], GR = ['', 'of capital', 'risk_ok'];
    for (let q = 0; q < 3; q++) {
      g.font = '600 ' + (M ? 7 : FS2) + 'px ' + FF; g.textAlign = 'left'; g.fillStyle = '#ff9cc4'; T(g, GN[q], pa.x + (M ? 5 : 10), grpY[q] + 3, 0.8);
      if (GR[q] && !M) { g.fillStyle = '#a095ac'; g.textAlign = 'right'; g.font = '500 ' + FS2 + 'px ' + FF; g.fillText(GR[q], pa.x + pa.w - 8, grpY[q] + 3); g.textAlign = 'left'; }
      g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1; g.beginPath(); g.moveTo(pa.x + 5, grpY[q] + (M ? 6 : 8)); g.lineTo(pa.x + pa.w - 5, grpY[q] + (M ? 6 : 8)); g.stroke();
    }
    // typed questions: a dark glass plate under each label block (the wires run behind it); the text itself lives in the cached text layer, above the beams
    if (!M) for (let i = 0; i < 3; i++) { const q = QP[i]; rr(g, q.x, q.y, q.w, q.h, 7); g.fillStyle = 'rgba(8,4,13,.9)'; g.fill(); g.lineWidth = 1; g.strokeStyle = 'rgba(255,90,150,.2)'; g.stroke(); }
    // code cards
    const CN = ['execute', 'review', 'skip'];
    for (let k = 0; k < 3; k++) {
      const c = CARDS[k]; g.save(); g.shadowColor = 'rgba(255,46,110,.7)'; g.shadowBlur = 24; rr(g, c.x, c.y, c.w, c.h, M ? 5 : 8);
      const cg = g.createLinearGradient(0, c.y, 0, c.y + c.h); cg.addColorStop(0, k === 2 ? '#5a1238' : '#8a1146'); cg.addColorStop(1, k === 2 ? '#2f0a22' : '#4a0b2b'); g.fillStyle = cg; g.fill(); g.restore();
      const hg = g.createLinearGradient(0, c.y, 0, c.y + c.h * 0.5); hg.addColorStop(0, 'rgba(255,255,255,.2)'); hg.addColorStop(1, 'rgba(255,255,255,0)'); rr(g, c.x + 1, c.y + 1, c.w - 2, c.h * 0.5, M ? 4 : 7); g.fillStyle = hg; g.fill();
      rr(g, c.x, c.y, c.w, c.h, M ? 5 : 8); g.strokeStyle = k === 2 ? 'rgba(255,140,185,.55)' : 'rgba(255,140,185,.95)'; g.lineWidth = 1.2; g.stroke();
      g.beginPath(); g.arc(c.x, c.y + c.h / 2, M ? 2.8 : 3.6, 0, J.TAU); g.fillStyle = '#ffd0e2'; g.fill();
    }
  }

  /* ---------- live state ---------- */
  const stLit = new Float32Array(15), stTxt = new Array(15).fill('');
  const aVal = new Float32Array(11), aTg = new Float32Array(11), aSel = new Float32Array(11), aSelT = new Float32Array(11), aHot = new Float32Array(11);
  const aTxt = new Array(11).fill('0%'), aTxtV = new Int16Array(11).fill(-1);
  const qFl = new Float32Array(3), qOn = new Float32Array(3), qTxt = ['', '', ''], qLab = ['', '', ''];
  const cPulse = new Float32Array(3), cCount = [J.S.dest.execute, J.S.dest.review, J.S.dest.skip], cTint = [T_PINK, T_AMB, T_DIM], cTxt = ['0', '0', '0'], cCV = [-1, -1, -1];
  let confV = -1, confTxt = '', confA = 0, confOk = true, confRow = 0;
  let floorV = J.S.floor, floorTxt = 'floor ' + floorV.toFixed(2), killed = J.S.killed, PK = killed ? T_RED : T_PINK, killFl = 0;
  let mx = -9999, my = -9999, hov = 0, now = 0, lastRun = 0, cableS = -1, cableT0 = 0, cableTint = 0;
  const RIPN = 8, ripT = new Float32Array(RIPN).fill(-9), ripK = new Uint8Array(RIPN), ripC = new Uint8Array(RIPN); let ripI = 0;

  /* beams: ring buffer, struct-of-arrays */
  const BN = 520, bE = new Int16Array(BN), bT0 = new Float32Array(BN), bDur = new Float32Array(BN), bW = new Float32Array(BN), bTint = new Uint8Array(BN), bAmb = new Uint8Array(BN), bDone = new Uint8Array(BN);
  /* ambient shimmer is capped: nAmb live beams at most (AMB_CAP, scaled by the cost governor ambK), so the arrive() chain can never snowball */
  let bi = 0, nAmb = 0, ambK = 1; const AMB_CAP = () => Math.round((M ? 22 : 40) * ambK);
  function beam(e, t0, dur, w, tint, amb) { const b = bi; bi = (bi + 1) % BN; if (bDur[b] !== 0 && bAmb[b]) nAmb--; if (amb) nAmb++; bE[b] = e; bT0[b] = t0; bDur[b] = dur; bW[b] = w > 1 ? 1 : w; bTint[b] = tint; bAmb[b] = amb; bDone[b] = 0; }
  function arrive(b, e) {
    const d = edst[e]; nfl[d] = Math.min(1, nfl[d] + (bAmb[b] ? 0.32 : 0.55 + 0.45 * bW[b]));
    if (bAmb[b] && eTr[e] < 4 && noutN[d] > 0 && nAmb < AMB_CAP() && Math.random() < 0.72) beam(nout0[d] + ((Math.random() * noutN[d]) | 0), now, bDur[b] * 0.92, bW[b] * 0.92, bTint[b], 1);
  }

  /* waves: one per decision, ~1.1 s, overlapping */
  const ST = [0, 0.125, 0.25, 0.375, 0.5, 0.68, 0.84, 1.08];
  const WV = []; for (let i = 0; i < 6; i++) WV.push({ on: false, t0: 0, st: 0, d: null, demo: false, dk: 0, lit: new Uint8Array(15), sal: new Float32Array(15), tg: new Int16Array(5 * 40), tn: new Uint8Array(5) });
  const SAL = [null, null,
    (s) => Math.abs(s.vwap_dist_bps) / 14, (s) => s.spread_bps / 10, (s) => Math.abs(s.imbalance) / 0.55, (s) => Math.abs(s.funding_bps) / 6, (s) => s.vol_1h / 140,
    (s) => Math.abs(s.edge_bps) / 26, (s) => Math.abs(s.position_pct) / 2.5, (s) => -s.daily_pnl / 1600 + 0.15, (s) => s.drawdown_pct / 8, (s) => s.latency_ms / 260, (s) => s.signal_age_s / 50];
  function stateText(s) {
    const t = stTxt; t[0] = s.symbol; t[1] = s.price >= 1000 ? J.fmt(s.price, 0) : J.fmt(s.price, s.price < 100 ? 2 : 1);
    t[2] = J.sgn(s.vwap_dist_bps, 1); t[3] = s.spread_bps.toFixed(1); t[4] = J.sgn(s.imbalance, 2); t[5] = J.sgn(s.funding_bps, 1); t[6] = Math.round(s.vol_1h) + '';
    t[7] = J.sgn(s.edge_bps, 1); t[8] = J.sgn(s.position_pct, 1); t[9] = J.sgn(s.daily_pnl, 0); t[10] = s.drawdown_pct.toFixed(1); t[11] = Math.round(s.latency_ms) + '';
    t[12] = s.signal_age_s.toFixed(1); t[13] = s.venue; t[14] = s.regime; txD[0] = 1;
  }
  function pushT(w, l, n) { const o = l * 40; for (let i = 0; i < w.tn[l]; i++) if (w.tg[o + i] === n) return; if (w.tn[l] < 40) w.tg[o + w.tn[l]++] = n; }
  function startWave(d, demo) {
    let w = null; for (let i = 0; i < WV.length; i++) if (!WV[i].on) { w = WV[i]; break; }
    if (!w) { w = WV[0]; for (let i = 1; i < WV.length; i++) if (WV[i].t0 < w.t0) w = WV[i]; while (w.st < 8) runStage(w, w.st++); }
    w.on = true; w.t0 = performance.now() / 1000; w.st = 0; w.d = d; w.demo = demo; w.tn.fill(0); w.lit.fill(0);
    // which state fields matter: top salience (+ always the symbol)
    const s = d.state; w.sal.fill(0.1); w.sal[0] = 0.5; w.sal[1] = 0.35; w.sal[13] = 0.3; w.sal[14] = 0.3;
    for (let i = 2; i < 13; i++) w.sal[i] = clamp(SAL[i](s), 0, 1.2);
    for (let n = 0; n < 5; n++) { let bi2 = -1, bv = 0.25; for (let i = 2; i < 13; i++) if (!w.lit[i] && w.sal[i] > bv) { bv = w.sal[i]; bi2 = i; } if (bi2 < 0) break; w.lit[bi2] = 1; }
    w.lit[0] = 1;
    stateText(s);
    return w;
  }
  const lessM = () => (M ? 0.6 : 1);
  function runStage(w, k) {
    const d = w.d, t0 = w.t0 + ST[k], R = Math.random, dm = lessM();
    if (k === 0) {
      for (let i = 0; i < 15; i++) if (w.lit[i]) {
        stLit[i] = Math.min(1, 0.5 + 0.5 * Math.min(1, w.sal[i] + 0.3)); nfl[i] = 1;
        for (let q = 0; q < 2; q++) { const e = nout0[i] + ((R() * noutN[i]) | 0); beam(e, t0 + q * 0.03 + R() * 0.02, 0.18, 0.62 + 0.38 * Math.min(1, w.sal[i]), PK, 0); pushT(w, 1, edst[e] - LS[1]); }
      }
    } else if (k <= 3) {
      const l = k, o = l * 40, n = w.tn[l], per = k === 1 ? 2 : 3;
      for (let a = 0; a < n; a++) { const src = LS[l] + w.tg[o + a]; for (let q = 0; q < per; q++) { if (R() > dm) continue; const e = nout0[src] + ((R() * noutN[src]) | 0); beam(e, t0 + R() * 0.035, 0.17, 0.5 + R() * 0.45, PK, 0); pushT(w, l + 1, edst[e] - LS[l + 1]); } }
      if (k === 1) { cableS = 0; cableT0 = t0; cableTint = PK; }
      if (k === 3) { for (let q = 0; q < 6; q++) pushT(w, 4, (R() * 18) | 0); }
    } else if (k === 4) {
      const o = 4 * 40, n = w.tn[4];
      for (let a = 0; a < n; a++) { const src = LS[4] + w.tg[o + a]; for (let q = 0; q < 3; q++) if (R() < 0.62 * dm + 0.2) beam(nout0[src] + q, t0 + R() * 0.04, 0.17, 0.5 + R() * 0.5, PK, 0); }
    } else if (k === 5) {
      const q0 = LS[5];
      for (let q = 0; q < 3; q++) { qFl[q] = 1; qOn[q] = 1; nfl[q0 + q] = 1; }
      qTxt[0] = d.action; qTxt[1] = (d.size < 1 ? '0.5' : d.size) + '%'; qTxt[2] = d.riskOk ? 'go' : 'no-go'; for (let q = 0; q < 3; q++) qLab[q] = '= ' + qTxt[q]; txD[3] = 1;
      const pr = [d.p.buy, d.p.sell, d.p.hold, d.p.close, d.p.flatten, d.sizes[0], d.sizes[1], d.sizes[2], d.sizes[3], d.pRisk, 1 - d.pRisk];
      for (let q = 0; q < 3; q++) for (let r = GFIRST[q]; r <= GLAST[q]; r++) beam(nout0[q0 + q] + (r - GFIRST[q]), t0, 0.17, 0.3 + 0.7 * Math.min(1, pr[r] * 1.3), PK, 0);
    } else if (k === 6) {
      const rA = ACTS.indexOf(d.action), rS = 5 + d.sizeIdx, rK = d.riskOk ? 9 : 10, cs = confShown(d);
      aTg[0] = d.p.buy; aTg[1] = d.p.sell; aTg[2] = d.p.hold; aTg[3] = d.p.close; aTg[4] = d.p.flatten;
      for (let i = 0; i < 4; i++) aTg[5 + i] = d.sizes[i]; aTg[9] = d.pRisk; aTg[10] = 1 - d.pRisk;
      aTg[rA] = cs; // the chosen action's bar IS the confidence (see confShown)
      aSelT.fill(0); aSelT[rA] = 1; aSelT[rS] = 1; aSelT[rK] = 1; aHot[rA] = 1; aHot[rS] = 1; aHot[rK] = 1; txD[1] = 1;
      confOk = cs >= d.floor; confRow = rA; confA = 0;
      // the readout chip waits until the chosen row's percentage has landed (the bars ease; the chip must never lead them)
      chipD = d; chipCs = cs; chipRow = rA; chipPc = pct(aTg[rA]); chipT0 = w.t0 + ST[6];
      const dk = DEST[d.dest], tint = d.dest === 'skip' ? T_DIM : d.dest === 'review' ? (killed ? T_RED : T_AMB) : PK, bw = d.dest === 'skip' ? 0.5 : 1;
      w.dk = dk;
      [rA, rS, rK].forEach((r, i) => beam(nout0[LS[6] + r] + dk, w.t0 + 0.86 + i * 0.02, 0.22, bw, tint, 0));
    } else {
      const dk = w.dk, tint = dk === 2 ? T_DIM : dk === 1 ? (killed ? T_RED : T_AMB) : PK;
      cPulse[dk] = 1; cTint[dk] = tint; nfl[LS[7] + dk] = 1; ripT[ripI] = w.t0 + ST[7]; ripK[ripI] = dk; ripC[ripI] = tint; ripI = (ripI + 1) % RIPN;
      if (!w.demo) cCount[dk]++;
      w.on = false;
    }
  }
  /* one number everywhere: the bar, the tick and the chip all show the probability of the chosen action. core.makeDecision jitters d.conf by up to 3.5% below it,
     so d.conf is used only when that jitter alone pushed a decision under the floor (p >= floor but d.conf < floor, ~0.3% of decisions) and the printed reason must stay true. */
  const pct = (v) => Math.min(99, Math.round(v * 100));
  function confShown(d) { const pa = d.p[d.action]; return d.reason.indexOf('conf') === 0 && pa >= d.floor ? Math.min(pa, d.conf) : pa; }
  function whyText(d, cs) {
    if (d.reason === 'ok') return ''; if (d.reason.indexOf('conf') !== 0) return d.reason;
    const f = d.floor.toFixed(2); let c = (pct(cs) / 100).toFixed(2); if (c === f) c = (Math.floor(cs * 1000 + 1e-9) / 1000).toFixed(3); return 'conf ' + c + ' < ' + f;
  }
  let chipD = null, chipCs = 0, chipRow = 0, chipPc = 0, chipT0 = 0;
  const chipV = {}; // last text written per readout field: an unchanged field costs no DOM write
  function setC(k, v) { if (chipV[k] !== v) { chipV[k] = v; CH[k].textContent = v; } }
  function updateChip(d, pc, cs) {
    setC('sym', d.symbol); setC('act', d.action); setC('conf', (pc / 100).toFixed(2));
    setC('size', d.action === 'hold' ? '—' : (d.size < 1 ? '0.5' : d.size) + '%'); setC('risk', d.riskOk ? 'ok' : 'flag');
    if (chipV.dest !== d.dest) CH.dest.setAttribute('data-d', d.dest); setC('dest', d.dest); setC('ms', d.ms.toFixed(1)); setC('why', whyText(d, cs));
    if (!J.reduce) J.animate(chipEl, [{ borderColor: 'rgba(255,255,255,.95)', boxShadow: '0 0 46px rgba(255,46,110,.95), inset 0 0 18px rgba(255,120,170,.35)' }, {}], { duration: 560, easing: 'ease-out' });
  }

  /* ---------- per-frame ---------- */
  function spr(t, x, y, s, a) { gl.globalAlpha = a > 1 ? 1 : a; gl.drawImage(SPR[t], x - s / 2, y - s / 2, s, s); }
  function sprh(t, x, y, s, a) { gl.globalAlpha = a > 1 ? 1 : a; gl.drawImage(SPRH[M ? 1 : 0][t], x - s / 2, y - s / 2, s, s); }
  function strokeLive(g, i) { g.beginPath(); g.moveTo(ex0[i], ey0[i]); if (ec[i]) { const m = (ex0[i] + ex1[i]) / 2; g.bezierCurveTo(m, ey0[i], m, ey1[i], ex1[i], ey1[i]); } else g.lineTo(ex1[i], ey1[i]); g.stroke(); }
  /* cached text layer: four small offscreen canvases, one per region that holds changing text (state values · answer percentages · code-card tags + counters ·
     typed-question labels), each with its own dirty flag and sized to just its rect (device-pixel aligned, so a blit is a 1:1 copy). The old single full-size layer
     (cl.width x cl.height) was cleared and re-drawn whole whenever one percentage ticked. */
  const TXN = 4, txCv = [], txG = [], txR = [], txD = new Uint8Array(TXN); let stVals = false, tAns = -1; const stBr = new Uint8Array(15);
  for (let i = 0; i < TXN; i++) { txCv.push(document.createElement('canvas')); txG.push(null); txR.push({ x: 0, y: 0, w: 0, h: 0 }); }
  function txSize(i, x, y, w, h) {
    const D = J.DPR, r = txR[i], c = txCv[i];
    r.x = Math.floor(x * D) / D; r.y = Math.floor(y * D) / D; r.w = Math.ceil((x + w) * D) / D - r.x; r.h = Math.ceil((y + h) * D) / D - r.y;
    c.width = Math.max(1, Math.round(r.w * D)); c.height = Math.max(1, Math.round(r.h * D)); txG[i] = c.getContext('2d'); txD[i] = 1;
  }
  function txLayout() {
    const pst = P[0], pa = P[4], pq = P[3], c0 = CARDS[0], c2 = CARDS[2];
    txSize(0, pst.x + 4, pst.y + hdrH, pst.w - 8, 15 * spitch);
    txSize(1, pa.x + 4, rowY[0] - pitch * 0.5, pa.w - 8, rowY[10] - rowY[0] + pitch);
    txSize(2, c0.x - 1, c0.y - 1, c0.w + 2, c2.y + c2.h - c0.y + 2);
    if (M) txSize(3, pq.x + 1, qy[0] + qr, pq.w - 2, qy[2] - qy[0] + 44); else txSize(3, QP[0].x - 1, QP[0].y - 1, QP[0].w + 2, QP[2].y + QP[2].h - QP[0].y + 2);
    tAns = -1;
  }
  function txBegin(i) { const g = txG[i], r = txR[i], D = J.DPR; g.setTransform(D, 0, 0, D, -r.x * D, -r.y * D); g.clearRect(r.x, r.y, r.w, r.h); g.textBaseline = 'middle'; txD[i] = 0; return g; }
  function blit(g, i) { const r = txR[i]; g.drawImage(txCv[i], r.x, r.y, r.w, r.h); }
  function txState() {
    const g = txBegin(0), pst = P[0]; g.font = '500 ' + FS + 'px ' + FF;
    if (stVals) { g.textAlign = 'left'; for (let i = 0; i < 15; i++) { g.fillStyle = stBr[i] ? '#fff' : '#8f859b'; g.fillText(stTxt[i], pst.x + 9, ny[i] + 0.5); } }
    if (!M) { g.textAlign = 'right'; g.fillStyle = '#fff'; for (let i = 0; i < 15; i++) if (stBr[i]) g.fillText(KEYS[i], nx[i] - 10, ny[i] + 0.5); }
  }
  function txAns() { // percentages (+ the selected rows' names) carry a halo: the wires from the answer ports to the code cards run straight through this column
    const g = txBegin(1), pa = P[4], lw = M ? 2 : 3, px = pa.x + pa.w - (M ? 4 : 9); g.font = '500 ' + FS + 'px ' + FF; g.lineJoin = 'round'; g.lineWidth = lw; g.strokeStyle = HALO;
    for (let r = 0; r < 11; r++) {
      const sel = aSelT[r] > 0.5, ty = M ? rowY[r] - 3.5 : rowY[r] + 0.5;
      g.textAlign = 'right'; g.fillStyle = sel ? '#fff' : '#a89db3'; g.strokeText(aTxt[r], px, ty); g.fillText(aTxt[r], px, ty);
      if (sel) { g.textAlign = 'left'; g.fillStyle = '#fff'; g.strokeText(ROW[r], pa.x + (M ? 14 : 22), ty); g.fillText(ROW[r], pa.x + (M ? 14 : 22), ty); }
    }
  }
  function txCards() {
    const g = txBegin(2), CN = ['execute', 'review', 'skip']; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    for (let k = 0; k < 3; k++) {
      const c = CARDS[k]; g.font = '700 ' + cFS + 'px ' + FF; g.fillStyle = '#fff'; T(g, M || c.w < 116 ? CN[k] : 'orders/' + CN[k], c.x + (M ? 5 : 10), c.y + (M ? 12 : 17), M ? 0.2 : 0.6);
      if (!M) { g.font = '500 ' + cFS2 + 'px ' + FF; g.fillStyle = '#ffc7dc'; g.fillText(DSUB[k], c.x + 10, c.y + 29); }
      g.font = '700 ' + (M ? 11 : 25) + 'px ' + SF; g.fillStyle = '#fff'; g.fillText(cTxt[k], c.x + (M ? 5 : 10), c.y + c.h - (M ? 7 : 11));
    }
  }
  function txQ() { // typed-question labels: name · primitive · "= answer" (desktop: on the static plates; phone: centred under the node)
    const g = txBegin(3), pq = P[3], QN = ['which action?', 'how much?', 'risk ok?'], QT = ['choice', 'score', 'flag'], QM = [['which', 'action?'], ['how', 'much?'], ['risk', 'ok?']];
    for (let i = 0; i < 3; i++) {
      if (M) {
        const cx = pq.x + pq.w / 2; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = '#f4eef6'; g.font = '600 7px ' + FF; g.fillText(QM[i][0], cx, qy[i] + qr + 9); g.fillText(QM[i][1], cx, qy[i] + qr + 17);
        g.fillStyle = '#ff9cc4'; g.font = '500 7px ' + FF; g.fillText(QT[i], cx, qy[i] + qr + 25);
        if (qTxt[i]) { g.textBaseline = 'middle'; g.font = '700 7px ' + FF; g.fillText(qTxt[i], cx, qy[i] + qr + 34); }
      } else {
        g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = '#f4eef6'; g.font = '700 ' + qFS + 'px ' + FF; g.fillText(QN[i], QX, qy[i] - 4.5);
        g.fillStyle = '#ff9cc4'; g.font = '500 ' + qFS2 + 'px ' + FF; T(g, QT[i], QX, qy[i] + 7, 0.8);
        if (qLab[i]) { g.textBaseline = 'middle'; g.font = '700 ' + qFS + 'px ' + FF; g.fillText(qLab[i], QX, qy[i] + 20); }
      }
    }
  }
  let ambAcc = 0, ax = 0, ay = 0, lax = 0, lay = 0, prevT = 0; const auraEl = J.$('.hero-aura', stage);
  /* ambient beams are stroked in batches: every beam with the same colour ramp step shares one path (the ramp only has 8 reachable steps at ambient strength) */
  const aX0 = new Float32Array(BN), aY0 = new Float32Array(BN), aX1 = new Float32Array(BN), aY1 = new Float32Array(BN), aKey = new Uint8Array(BN), aPres = new Uint8Array(40);
  /* cost governor (as in builds.js): when the 90-frame average JS cost per frame is over 4.5 ms the ambient shimmer thins out, and it comes back when the device recovers */
  let gCost = 0, gN = 0;
  function frame(t, dt) {
    const a0 = performance.now(); draw(t, dt); gCost += performance.now() - a0;
    if (++gN === 90) { const avg = gCost / gN; if (avg > 4.5 && ambK > 0.4) ambK = Math.max(0.4, ambK * 0.8); else if (avg < 2.2 && ambK < 1) ambK = Math.min(1, ambK * 1.15); gCost = 0; gN = 0; }
  }
  function draw(t, dt) {
    const g = gl; if (!g || !W) return;
    now = t; lastRun = t; const dk = dt || 0.016;
    for (let i = 0; i < WV.length; i++) { const w = WV[i]; if (!w.on) continue; while (w.st < 8 && t >= w.t0 + ST[w.st]) runStage(w, w.st++); }
    ambAcc += dk * (M ? 8 : 15) * ambK; const cap = AMB_CAP(); while (ambAcc >= 1) { ambAcc -= 1; if (nAmb >= cap) continue; const e = lES[1] + ((Math.random() * (lES[5] - lES[1])) | 0); beam(e, t, 0.8 + Math.random() * 0.8, 0.22 + Math.random() * 0.2, PK, 1); }
    // value tweens (bars, row glow) follow the wall clock, not the dt that core caps at 50 ms: on a slow GPU they still land ~0.5 s after the wave reaches them (the readout waits for them)
    const dA = Math.exp(-dk * 2.1), dB = Math.exp(-dk * 3.4), dC = Math.exp(-dk * 2.2), kE = Math.min(1, Math.max(dk, Math.min(0.3, t - prevT)) * 8); prevT = t;
    g.setTransform(J.DPR, 0, 0, J.DPR, 0, 0); g.clearRect(0, 0, W, H); g.lineCap = 'round'; g.globalCompositeOperation = 'lighter';
    if (killFl > 0.01) { spr(T_RED, jcx, jcy, Math.max(W, H) * 1.3, killFl * 0.35); killFl *= Math.exp(-dk * 1.8); }
    if (auraEl) { const tx = J.pointer.nx * 16, ty = J.pointer.ny * 10; ax += (tx - ax) * Math.min(1, dk * 2.5); ay += (ty - ay) * Math.min(1, dk * 2.5); if (Math.abs(ax - lax) + Math.abs(ay - lay) > 0.08) { lax = ax; lay = ay; auraEl.style.transform = 'translate3d(' + ax.toFixed(1) + 'px,' + ay.toFixed(1) + 'px,0)'; } }
    /* pointer: soft spotlight, nearby edges + nodes light up */
    const inside = mx > -1000; hov += ((inside ? 1 : 0) - hov) * Math.min(1, dk * 7);
    if (hov > 0.02) {
      const PR = M ? 70 : 118, R2 = PR * PR; spr(PK, mx, my, PR * 2.6, hov * 0.32); let cnt = 0; g.lineWidth = 1.2; const rp = BRAMP[PK];
      for (let i = 0; i < EN && cnt < 150; i++) {
        const vx = ex1[i] - ex0[i], vy = ey1[i] - ey0[i]; let u = ((mx - ex0[i]) * vx + (my - ey0[i]) * vy) / e2[i]; u = u < 0 ? 0 : u > 1 ? 1 : u;
        const dx = ex0[i] + u * vx - mx, dy = ey0[i] + u * vy - my, d2 = dx * dx + dy * dy; if (d2 > R2) continue;
        cnt++; const k = 1 - Math.sqrt(d2) / PR; g.strokeStyle = rp[((0.16 + 0.7 * k * k) * hov * 32) | 0]; strokeLive(g, i);
      }
      for (let i = 0; i < NN; i++) { const dx = nx[i] - mx, dy = ny[i] - my, d2 = dx * dx + dy * dy; if (d2 < R2) { const k = 1 - Math.sqrt(d2) / PR; spr(PK, nx[i], ny[i], (M ? 12 : 16) + 18 * k, k * 0.95 * hov); } }
    }
    /* idle shimmer + wave beams */
    let aN = 0;
    for (let b = 0; b < BN; b++) {
      const dur = bDur[b]; if (dur === 0) continue;
      const u = (t - bT0[b]) / dur; if (u < 0) continue;
      const e = bE[b], amb = bAmb[b], span = Math.min(0.75, Math.max(0.16, (amb ? 56 : 120) / (elen[e] + 1)));
      if (u >= 1 && !bDone[b]) { bDone[b] = 1; arrive(b, e); }
      if (u >= 1 + span) { bDur[b] = 0; if (amb) nAmb--; continue; }
      const hu = u > 1 ? 1 : u, tu = u - span < 0 ? 0 : u - span, w = bW[b] * (u > 1 ? 1 - (u - 1) / span : 1), R = BRAMP[bTint[b]];
      ep(e, tu); const x0 = PX, y0 = PY; ep(e, hu); const x3 = PX, y3 = PY;
      if (amb) { const ri = (w * 0.55 * 32) | 0; if (ri > 0) { aX0[aN] = x0; aY0[aN] = y0; aX1[aN] = x3; aY1[aN] = y3; aKey[aN++] = bTint[b] * 8 + (ri > 7 ? 7 : ri); } if (w > 0.1) spr(bTint[b], x3, y3, 7, w * 0.8); continue; }
      const sp = hu - tu; ep(e, tu + sp * 0.45); const x1 = PX, y1 = PY; ep(e, tu + sp * 0.78); const x2 = PX, y2 = PY;
      g.lineWidth = M ? 1.3 : 1.6; g.strokeStyle = R[(w * 0.34 * 32) | 0]; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.lineWidth = M ? 1.7 : 2.1; g.strokeStyle = R[(w * 0.7 * 32) | 0]; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      g.lineWidth = M ? 2.1 : 2.8; g.strokeStyle = R[(w * 32) | 0]; g.beginPath(); g.moveTo(x2, y2); g.lineTo(x3, y3); g.stroke();
      sprh(bTint[b], x3, y3, (M ? 11 : 15) + 14 * w, w);
    }
    if (aN) { // one stroke per (tint, ramp step) instead of one per beam
      g.lineWidth = 1; g.globalAlpha = 1; aPres.fill(0); for (let j = 0; j < aN; j++) aPres[aKey[j]] = 1;
      for (let k = 0; k < 40; k++) if (aPres[k]) { g.strokeStyle = BRAMP[k >> 3][k & 7]; g.beginPath(); for (let j = 0; j < aN; j++) if (aKey[j] === k) { g.moveTo(aX0[j], aY0[j]); g.lineTo(aX1[j], aY1[j]); } g.stroke(); }
    }
    /* main cable pulse (thick, white-hot) */
    if (cableS >= 0) {
      const s = (t - cableT0) / 0.62; if (s > 1.3) cableS = -1; else {
        const hs = Math.min(1, s), ts = Math.max(0, s - 0.3), fa = s > 1 ? 1 - (s - 1) / 0.3 : 1, R = BRAMP[cableTint], i0 = (ts * 48) | 0, i1 = (hs * 48) | 0;
        for (let pass = 0; pass < 3; pass++) {
          g.lineWidth = [M ? 6 : 9, M ? 3 : 4.5, M ? 1.4 : 1.8][pass]; g.strokeStyle = pass === 2 ? RAMP[T_WHT][(fa * 0.9 * 32) | 0] : R[(fa * [0.2, 0.55][pass] * 32) | 0];
          g.beginPath(); g.moveTo(cabX[i0], cabY[i0]); for (let i = i0 + 1; i <= i1; i++) g.lineTo(cabX[i], cabY[i]); g.stroke();
        }
        spr(cableTint, cabX[i1], cabY[i1], (M ? 30 : 46), fa); spr(T_WHT, cabX[i1], cabY[i1], (M ? 10 : 14), fa);
      }
    }
    /* node flashes */
    for (let i = 0; i < NN; i++) {
      const f = nfl[i]; if (f < 0.03) continue; nfl[i] = f * dB; const l = nL[i];
      if (l === 7) continue;
      spr(PK, nx[i], ny[i], l === 5 ? (M ? 18 + 18 * f : 34 + 40 * f) : l === 6 ? 16 + 14 * f : l === 0 ? 18 + 16 * f : (M ? 9 : 11) + 14 * f, f);
    }
    /* state rows that matter */
    const pst = P[0];
    for (let i = 0; i < 15; i++) {
      const v = stLit[i], nb = v > 0.3 ? 1 : 0; if (nb !== stBr[i]) { stBr[i] = nb; txD[0] = 1; } if (v < 0.02) continue; stLit[i] = v * dA;
      g.globalAlpha = 1; g.fillStyle = RAMP[PK][(v * 0.16 * 32) | 0]; g.fillRect(pst.x + 3, ny[i] - spitch / 2 + 1, pst.w - 6, spitch - 2);
      spr(PK, nx[i], ny[i], 22 + 12 * v, v * 0.95);
    }
    /* questions */
    for (let q = 0; q < 3; q++) { const f = qFl[q], o = qOn[q]; if (o > 0.01) { spr(PK, nx[LS[5] + q], ny[LS[5] + q], M ? qr * 2 + 8 + 16 * f : qr * 2 + 22 + 40 * f, 0.34 * o + 0.6 * f); qFl[q] = f * dB; } }
    /* answers: row glow */
    const pa = P[4]; g.globalAlpha = 1;
    for (let r = 0; r < 11; r++) {
      aSel[r] += (aSelT[r] - aSel[r]) * kE; const s = aSel[r], h = aHot[r]; if (h > 0.01) aHot[r] = h * dC;
      if (s > 0.02 || h > 0.02) { g.globalAlpha = Math.min(1, s * 0.5 + h * 0.6); g.drawImage(BND[PK], pa.x + 3, rowY[r] - pitch * 0.62, pa.w - 6, pitch * 1.24); }
    }
    /* code acts: pulse + ripples */
    for (let k = 0; k < 3; k++) {
      const p = cPulse[k], c = CARDS[k]; if (p < 0.02) continue; cPulse[k] = p * Math.exp(-dk * 2.1);
      g.globalAlpha = Math.min(1, p * 0.95); g.drawImage(SOFT[cTint[k]], c.x - c.w * 0.45, c.y - c.h * 0.9, c.w * 1.9, c.h * 2.8); g.globalAlpha = 1; g.fillStyle = RAMP[cTint[k]][(p * 0.3 * 32) | 0]; rr(g, c.x, c.y, c.w, c.h, M ? 5 : 8); g.fill();
    }
    g.lineWidth = 1.5;
    for (let i = 0; i < RIPN; i++) {
      const age = t - ripT[i]; if (age < 0 || age > 0.85) continue; const k = age / 0.85, c = CARDS[ripK[i]], e = 1 - (1 - k) * (1 - k), gx = (M ? 12 : 22) * e, gy = (M ? 8 : 16) * e;
      g.strokeStyle = RAMP[ripC[i]][((1 - k) * 0.85 * 32) | 0]; rr(g, c.x - gx, c.y - gy, c.w + gx * 2, c.h + gy * 2, (M ? 5 : 8) + gx * 0.6); g.stroke();
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    /* ---- bars + text (slow-changing text is cached in an offscreen canvas and blitted by sub-rect) ---- */
    g.textBaseline = 'middle';
    const bw = bx1 - bx0;
    for (let r = 0; r < 11; r++) {
      let v = aVal[r]; const tg = aTg[r]; v += (tg - v) * kE; if (v - tg < 0.002 && tg - v < 0.002) v = tg; aVal[r] = v; // settle (no endless asymptote)
      const s = aSel[r], y = rowY[r], by = M ? y + 2.5 : y - barH / 2, w = Math.max(0, v * bw);
      g.fillStyle = RAMP[PK][((0.42 + 0.58 * s) * 32) | 0]; g.fillRect(bx0, by, w, barH);
      if (s > 0.04) { g.globalAlpha = s; g.fillStyle = '#fff'; g.fillRect(bx0 + w - 2, by - 1, 2, barH + 2); g.globalAlpha = 1; }
      const pv = pct(v); if (pv !== aTxtV[r]) { aTxtV[r] = pv; aTxt[r] = pv + '%'; txD[1] = 1; }
    }
    for (let k = 0; k < 3; k++) if (cCV[k] !== cCount[k]) { cCV[k] = cCount[k]; cTxt[k] = J.fmt(cCount[k]); txD[2] = 1; }
    { const fx = bx0 + floorV * bw; g.strokeStyle = 'rgba(255,193,61,.9)'; g.lineWidth = 1; g.setLineDash(DASH); g.beginPath(); g.moveTo(fx, rowY[0] - pitch * 0.5); g.lineTo(fx, rowY[4] + pitch * 0.5); g.stroke(); g.setLineDash(NODASH); } // floor line sits under the text layer
    if (txD[0]) txState();
    if (txD[1] && (t - tAns >= 0.04 || J.reduce)) { tAns = t; txAns(); } // percentages tick at <= 25 Hz
    if (txD[2]) txCards();
    if (txD[3]) txQ();
    for (let i = 0; i < TXN; i++) blit(g, i);
    if (chipD && (aTxtV[chipRow] === chipPc || t - chipT0 > 1.6)) { const cd = chipD; chipD = null; updateChip(cd, chipPc, chipCs); } // the readout lands with the bars
    for (let r = 0; r < 11; r++) { const s = aSel[r]; if (s < 0.04) continue; const y = rowY[r]; g.globalAlpha = 1; g.fillStyle = RAMP[PK][(s * 32) | 0]; g.fillRect(pa.x + 2, y - pitch * 0.38, 2, pitch * 0.76); }
    /* floor + confidence tick on the choice group. The tick sits on the tip of the chosen bar (same eased value, so it can never disagree with the bar or the
       percentage); its "0.93" label lives on a dark plate in the row's own gap, clear of the neighbouring rows' bars and percentages. */
    {
      g.textAlign = 'right'; g.font = '700 ' + fFS + 'px ' + FF; g.fillStyle = '#ffc13d'; g.fillText(floorTxt, pa.x + pa.w - (M ? 4 : 8), grpY[0] + 3);
      confA += (1 - confA) * Math.min(1, dk * 9);
      if (confA > 0.02) {
        const cx = bx0 + aVal[confRow] * bw, ry = rowY[confRow], hh = M ? pitch * 0.5 : Math.min(9, pitch * 0.3), col = confOk ? '#2ee6a6' : '#ffc13d', yy = M ? ry + 2.5 : ry, dn = confRow === 0 ? -1 : 1; // dn: +1 = marker above the bar
        g.globalAlpha = confA; g.fillStyle = col; g.beginPath();
        if (M) {
          if (confRow === 0) { g.fillRect(cx - 1, yy - hh * 0.55, 2, hh * 1.55); g.moveTo(cx - 3.5, yy + hh + 4.5); g.lineTo(cx + 3.5, yy + hh + 4.5); g.lineTo(cx, yy + hh - 0.5); }
          else { g.fillRect(cx - 1, yy - hh, 2, hh * 2); g.moveTo(cx - 3.5, yy - hh - 4.5); g.lineTo(cx + 3.5, yy - hh - 4.5); g.lineTo(cx, yy - hh + 0.5); }
          g.closePath(); g.fill();
        } else {
          g.fillRect(cx - 1, yy - hh, 2, hh * 2); const ty = yy - dn * hh; g.moveTo(cx - 3.5, ty - dn * 4.5); g.lineTo(cx + 3.5, ty - dn * 4.5); g.lineTo(cx, ty + dn * 0.5); g.closePath(); g.fill();
          const cvp = aTxtV[confRow]; if (cvp !== confV) { confV = cvp; confTxt = (cvp / 100).toFixed(2); }
          const ph = fFS + 3, pcy = ty - dn * (4.5 + 1 + ph / 2), plx = clamp(cx, bx0 + confW / 2, pa.x + pa.w - 6 - confW / 2);
          rr(g, plx - confW / 2, pcy - ph / 2, confW, ph, 4); g.fillStyle = 'rgba(8,4,13,.94)'; g.fill(); g.lineWidth = 1; g.strokeStyle = col; g.globalAlpha = confA * 0.55; g.stroke(); g.globalAlpha = confA;
          g.fillStyle = col; g.textAlign = 'center'; g.font = '700 ' + fFS + 'px ' + FF; g.fillText(confTxt, plx, pcy + 0.5);
        }
        g.globalAlpha = 1;
      }
    }
    if (killed) {
      const p = P[5]; g.fillStyle = 'rgba(9,4,15,.96)'; g.fillRect(p.x + 2, p.y + (M ? 14 : 21), p.w - 4, M ? 8 : 11);
      g.globalAlpha = 0.65 + 0.35 * Math.sin(t * 7); g.fillStyle = '#ff4d5e'; g.font = '700 ' + kFS + 'px ' + FF; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(M ? 'halted' : 'halted · all to review', p.x + (M ? 3 : 10), p.y + (M ? 18 : 27)); g.globalAlpha = 1;
    }
    g.textBaseline = 'middle';
  }

  /* ---------- build / resize ---------- */
  function rebuild() {
    const a = J.fit(cs), b = J.fit(cl); gs = a.g; gl = b.g; W = a.W; H = a.H; M = W < 700;
    const dens = M ? 0 : W < 1000 ? 1 : 2; if (dens !== topoMode) buildTopo(dens);
    layout(); stVals = !M && P[0].w >= 128; txLayout(); drawStatic(); if (!J.reduce || !lastRun) frame(performance.now() / 1000, 0.016); else frame(lastRun, 0.016);
  }
  J.watch(net, rebuild);
  if (document.fonts) { document.fonts.ready.then(() => W && rebuild()).catch(() => {}); if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => W && rebuild()); }

  /* ---------- events ---------- */
  function snap(d, demo) {
    const w = startWave(d, demo); while (w.st < 8) runStage(w, w.st++);
    aVal.set(aTg); aSel.set(aSelT); qFl.fill(0); aHot.fill(0); stLit.forEach((v, i) => (stLit[i] = w.lit[i] ? 0.6 : 0)); cPulse.fill(0); nfl.fill(0); bDur.fill(0); nAmb = 0; cableS = -1; confA = 1;
    if (chipD) { const cd = chipD; chipD = null; updateChip(cd, chipPc, chipCs); }
  }
  J.bus.on('decision', (d) => { if (J.reduce) { snap(d, false); frame(performance.now() / 1000, 0.016); } else startWave(d, false); });
  J.bus.on('kill', (k) => { killed = !!k; PK = killed ? T_RED : T_PINK; killFl = 1; });
  J.bus.on('floor', (f) => { floorV = f; floorTxt = 'floor ' + f.toFixed(2); });
  const fire = () => { const t = performance.now(); if (t - (fire.t || 0) > 160) { fire.t = t; J.fire(); } };
  const setP = (e) => { const r = cl.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; };
  cl.addEventListener('pointermove', setP, { passive: true }); cl.addEventListener('pointerdown', setP, { passive: true });
  cl.addEventListener('pointerleave', () => { mx = my = -9999; }); cl.addEventListener('pointercancel', () => { mx = my = -9999; });
  cl.addEventListener('click', fire);
  const fb = J.$('#hero-fire'); if (fb) fb.addEventListener('click', fire);

  /* intro: once the boot overlay has left (or on first view), the network wipes in left -> right and the title decodes */
  stage.classList.add('hero-pre');
  J.onView(stage, () => {
    let n = 0;
    const go = () => {
      const b = document.getElementById('fx-boot');
      if (!b || b.classList.contains('fx-out') || ++n > 30) {
        stage.classList.remove('hero-pre');
        if (titleEl) J.scramble(titleEl, 'JEV DECIDES', 1100);
      } else setTimeout(go, 100);
    };
    go();
  }, { threshold: 0.2 });

  /* seed with the latest decision so the diagram is populated from the first frame */
  { const d0 = J.recent[0] || J.makeDecision(); snap(d0, true); }
  J.task(stage, frame);
});
