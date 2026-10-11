/* quant — a simulated quant desk: candles + ladder, a six-stage execution rail, an 8-layer MLP whose pulses fire forward, a quincunx of left/right gates,
 * a robustness grid and a monte carlo fan with a live histogram. Everything is generated in the browser: no market data, no orders.
 * The kill switch (bus 'kill') halts the rail; decisions (bus 'decision') count as trades; the floor (bus 'floor') is shown on the quincunx. */
JEV.mod('quant', () => {
  'use strict';
  const J = JEV;
  const root = J.$('#quant');
  if (!root) return;
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => Array.from(root.querySelectorAll(s));
  const C = J.C, TAU = J.TAU, clamp = J.clamp, lerp = J.lerp, rgba = J.rgba;
  const rnd = J.rnd, ri = J.ri, gauss = J.gauss, EXP = Math.exp;
  const setTxt = (el, t) => { if (el && el.textContent !== t) el.textContent = t; };
  const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const pct = (x, d) => (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(d == null ? 1 : d) + '%';
  const signed = (x, d) => (x >= 0 ? '+' : '') + x.toFixed(d);
  let halted = false;

  /* run fn(t) at most every `sec` seconds, only while el is on screen (J.task gating) */
  const every = (el, sec, fn) => {
    if (!el) return null;
    let next = 0;
    return J.task(el, (t) => { if (t >= next) { next = t + sec; fn(t); } });
  };

  /* canvas: J.fit() on every resize; draw code works in CSS px through s.g */
  const cv = (sel, onsize, cap) => {
    const c = $(sel);
    if (!c) return null;
    const s = { c, g: null, W: 0, H: 0 };
    J.watch(c, () => {
      const f = J.fit(c, cap);
      s.g = f.g; s.W = f.W; s.H = f.H;
      if (onsize) onsize(s);
    });
    return s;
  };

  /* soft glow sprites: drawImage is far cheaper per frame than a radial gradient or shadowBlur */
  const sprite = (hex) => {
    const n = 64, c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d'), gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.16, hex); gr.addColorStop(0.42, rgba(hex, 0.32)); gr.addColorStop(1, rgba(hex, 0));
    g.fillStyle = gr; g.fillRect(0, 0, n, n);
    return c;
  };
  const SP = { pink: sprite(C.pink), green: sprite(C.green), blue: sprite(C.blue), violet: sprite(C.violet), red: sprite(C.red) };
  const glow = (g, sp, x, y, r, a) => { g.globalAlpha = a; g.drawImage(sp, x - r, y - r, r * 2, r * 2); g.globalAlpha = 1; };

  /* a line with a soft area under it, normalised to the canvas */
  const plot = (g, W, H, arr, hex, pad) => {
    let lo = Infinity, hi = -Infinity;
    for (const v of arr) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const span = hi - lo || 1, n = arr.length;
    const X = (i) => (i / (n - 1)) * W, Y = (v) => H - pad - ((v - lo) / span) * (H - pad * 2);
    const line = new Path2D();
    arr.forEach((v, i) => (i ? line.lineTo(X(i), Y(v)) : line.moveTo(X(i), Y(v))));
    const area = new Path2D(line); area.lineTo(W, H); area.lineTo(0, H); area.closePath();
    const fill = g.createLinearGradient(0, 0, 0, H);
    fill.addColorStop(0, rgba(hex, 0.3)); fill.addColorStop(1, rgba(hex, 0));
    g.fillStyle = fill; g.fill(area);
    g.lineWidth = 5; g.strokeStyle = rgba(hex, 0.16); g.stroke(line);
    g.lineWidth = 1.6; g.strokeStyle = hex; g.stroke(line);
    g.beginPath(); g.arc(X(n - 1), Y(arr[n - 1]), 3.2, 0, TAU); g.fillStyle = '#fff'; g.fill();
  };

  /* bus: kill halts the rail, decisions are trades, floor is shown on the quincunx */
  const haltEl = root;
  J.bus.on('kill', (on) => { halted = !!on; haltEl.classList.toggle('qt-halt', halted); });
  const tradesEl = $('#qtTrades');
  let trades = 73020;
  J.bus.on('decision', () => { trades++; setTxt(tradesEl, J.fmt(trades, 0)); });
  const floorEl = $('#qtFloor');
  J.bus.on('floor', (v) => { if (isFinite(+v)) setTxt(floorEl, 'floor ' + (+v).toFixed(2)); });

  /* ---------- 1 · candidate: a scrolling equity curve and a count-up multiple ---------- */
  const eq = [];
  let eqV = 1;
  for (let i = 0; i < 120; i++) { eqV *= 1 + 0.011 + gauss() * 0.028; eq.push(eqV); }
  const eqS = cv('#qtEq');
  let eqNext = 0;
  if (eqS) J.task(eqS.c, (t) => {
    if (t >= eqNext) {
      eqNext = t + 2.2;
      eqV *= 1 + 0.011 + gauss() * 0.028;
      eq.shift(); eq.push(eqV);
    }
    const { g, W, H } = eqS;
    g.clearRect(0, 0, W, H);
    plot(g, W, H, eq, C.green, 8);
  });
  const multEl = $('#qtMult'), heroEl = $('.qt-hero');
  if (multEl && heroEl) J.onView(heroEl, () => J.countTo(multEl, 96, { dur: 1600 }), { threshold: 0.3 });

  /* ---------- 2 · book: daily pnl bars and an all-time counter that drifts ---------- */
  const days = Array.from({ length: 34 }, () => gauss() + 0.35);
  const barS = cv('#qtBars');
  let barNext = 0;
  if (barS) J.task(barS.c, (t) => {
    if (t >= barNext) { barNext = t + 1.2; days.shift(); days.push(gauss() + 0.35); }
    const { g, W, H } = barS;
    g.clearRect(0, 0, W, H);
    let m = 0;
    for (const d of days) m = Math.max(m, Math.abs(d));
    m = m || 1;
    const bw = W / days.length, mid = H / 2;
    g.fillStyle = rgba(C.ink, 0.1); g.fillRect(0, mid, W, 1);
    days.forEach((d, i) => {
      const h = Math.max(1, (Math.abs(d) / m) * (H / 2 - 4));
      g.fillStyle = d >= 0 ? rgba(C.green, 0.8) : rgba(C.red, 0.8);
      g.fillRect(i * bw + bw * 0.22, d >= 0 ? mid - h : mid, bw * 0.56, h);
    });
  });
  const pnlEl = $('#qtPnl');
  let pnl = 78940;
  every($('.qt-pnl'), 1.1, () => {
    pnl += gauss() * 140 + 70;
    setTxt(pnlEl, (pnl >= 0 ? '+' : '') + J.usd(pnl, 0));
    setTxt(tradesEl, J.fmt(trades += ri(1, 3), 0));
  });

  /* ---------- 3 · tape: candles, a moving average, entry dots, a ladder that jitters ---------- */
  const cand = [];
  let px = 78940;
  const newCandle = () => {
    const o = px, c = o * (1 + gauss() * 0.0042 + 0.00015);
    const h = Math.max(o, c) * (1 + Math.abs(gauss()) * 0.0016), l = Math.min(o, c) * (1 - Math.abs(gauss()) * 0.0016);
    px = c;
    cand.push({ o, c, h, l, mk: Math.random() < 0.08 });
    if (cand.length > 56) cand.shift();
  };
  for (let i = 0; i < 56; i++) newCandle();

  const drawCandles = (g, W, H) => {
    let lo = Infinity, hi = -Infinity;
    for (const k of cand) { if (k.l < lo) lo = k.l; if (k.h > hi) hi = k.h; }
    const span = hi - lo || 1, n = cand.length, cw = W / n;
    const Y = (v) => H - 10 - ((v - lo) / span) * (H - 20);
    g.clearRect(0, 0, W, H);
    // moving average first, so the candles sit on top of it
    g.beginPath();
    cand.forEach((k, i) => {
      let s = 0, m = 0;
      for (let j = Math.max(0, i - 9); j <= i; j++) { s += cand[j].c; m++; }
      const x = i * cw + cw / 2, y = Y(s / m);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.lineWidth = 1.2; g.strokeStyle = rgba(C.pink, 0.75); g.stroke();
    cand.forEach((k, i) => {
      const x = i * cw + cw / 2, col = k.c >= k.o ? C.green : C.red;
      g.strokeStyle = col; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, Y(k.h)); g.lineTo(x, Y(k.l)); g.stroke();
      const top = Y(Math.max(k.o, k.c)), bot = Y(Math.min(k.o, k.c));
      g.fillStyle = col;
      g.fillRect(x - cw * 0.32, top, cw * 0.64, Math.max(1.5, bot - top));
      if (k.mk) { g.beginPath(); g.arc(x, Y(k.c), 2.8, 0, TAU); g.fillStyle = C.pink; g.fill(); }
    });
  };
  const candS = cv('#qtCandles');
  let candNext = 0;
  if (candS) J.task(candS.c, (t) => {
    if (t >= candNext) { candNext = t + 0.9; newCandle(); }
    drawCandles(candS.g, candS.W, candS.H);
  });

  const priceEl = $('#qtPrice'), lad = $('#qtLad');
  const rows = [];
  if (lad) for (let i = 0; i < 10; i++) {
    const r = document.createElement('div');
    r.className = 'qt-lr ' + (i < 5 ? 'ask' : 'bid');
    r.innerHTML = '<i></i><b></b><em></em>';
    lad.appendChild(r); rows.push(r);
  }
  every($('.qt-mkt'), 0.3, () => {
    const last = cand[cand.length - 1];
    setTxt(priceEl, J.fmt(last.c, 0));
    rows.forEach((r, i) => {
      const ask = i < 5, k = ask ? 4 - i : i - 5;   // k = distance from mid, asks listed high to low
      const price = last.c * (1 + (ask ? 1 : -1) * (0.0004 + k * 0.00065));
      r.querySelector('i').style.transform = 'scaleX(' + rnd(0.2, 1).toFixed(2) + ')';
      setTxt(r.querySelector('b'), J.fmt(price, 0));
      setTxt(r.querySelector('em'), rnd(0.2, 4).toFixed(2));
    });
  });

  /* ---------- 4 · execution rail: six stages, one comet, halts with the kill switch ---------- */
  const cyc = $('#qtCycle'), rail = cyc && cyc.querySelector('.qt-rail');
  const stages = $$('.qt-st');
  const units = ['markets', 'signals', 'gates', 'lots', 'fills', 'trades'];
  const cnt = [412, 38, 7, 12, 9, 6];
  const fillEl = $('#qtFill'), cycEl = $('#qtCycN');
  let si = 0, cycleN = 483, fill = 0.66, nextStage = 0;
  if (cyc && stages.length) J.task(cyc, (t) => {
    if (halted || t < nextStage) return;
    nextStage = t + 0.95;
    stages.forEach((s, i) => s.classList.toggle('on', i === si));
    cnt[si] += ri(0, si === 0 ? 40 : 3);
    setTxt(stages[si].querySelector('small'), cnt[si] + ' ' + units[si]);
    if (si === 4) { fill = clamp(fill + gauss() * 0.03, 0.4, 0.99); setTxt(fillEl, fill.toFixed(2)); }
    if (rail) rail.style.setProperty('--p', (si / (stages.length - 1)).toFixed(3));
    si = (si + 1) % stages.length;
    if (si === 0) { cycleN++; setTxt(cycEl, '#' + cycleN); }
  });

  /* ---------- 5 · deep mlp: 8 layers; a pulse fires along a weight, the node it reaches lights up ---------- */
  const LAY = [6, 10, 10, 10, 10, 10, 10, 10, 3];
  const act = LAY.map((n) => new Float32Array(n));
  const edges = [];
  for (let l = 0; l < LAY.length - 1; l++)
    for (let i = 0; i < LAY[l]; i++)
      for (let j = 0; j < LAY[l + 1]; j++) edges.push({ l, i, j, w: gauss() });
  const pulses = [];
  let NODES = [];
  const layoutNN = ({ W, H }) => {
    const px0 = 40, py0 = 26;
    NODES = LAY.map((n, l) => Array.from({ length: n }, (_, i) => ({
      x: px0 + (l * (W - px0 * 2)) / (LAY.length - 1),
      y: n === 1 ? H / 2 : py0 + (i * (H - py0 * 2)) / (n - 1),
    })));
  };
  const nnS = cv('#qtNN', layoutNN);
  const trainEl = $('#qtTrain'), progEl = $('#qtProg');
  let trainStep = 47, epoch = 2, nextTrain = 0;
  if (nnS) J.task(nnS.c, (t, dt) => {
    const { g, W, H } = nnS;
    g.clearRect(0, 0, W, H);

    // weights: two batched paths, pink = positive, blue = negative
    g.lineWidth = 0.7;
    for (const pos of [true, false]) {
      g.strokeStyle = pos ? rgba(C.pink, 0.2) : rgba(C.blue, 0.16);
      g.beginPath();
      for (const e of edges) {
        if ((e.w >= 0) !== pos) continue;
        const a = NODES[e.l][e.i], b = NODES[e.l + 1][e.j];
        g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
      }
      g.stroke();
    }

    // forward pulses
    if (Math.random() < dt * 24 && pulses.length < 220) pulses.push({ e: edges[(Math.random() * edges.length) | 0], p: 0, sp: rnd(0.8, 1.7) });
    g.globalCompositeOperation = 'lighter';
    for (let k = pulses.length - 1; k >= 0; k--) {
      const q = pulses[k];
      q.p += dt * q.sp;
      if (q.p >= 1) { act[q.e.l + 1][q.e.j] = 1; pulses.splice(k, 1); continue; }
      const a = NODES[q.e.l][q.e.i], b = NODES[q.e.l + 1][q.e.j];
      glow(g, q.e.w >= 0 ? SP.pink : SP.blue, lerp(a.x, b.x, q.p), lerp(a.y, b.y, q.p), 6, 0.95);
    }

    // nodes: activation decays, glow scales with it
    const dec = EXP(-dt * 2.4);
    NODES.forEach((layer, l) => layer.forEach((n, i) => {
      act[l][i] *= dec;
      const a = act[l][i];
      glow(g, a > 0.25 ? SP.pink : SP.violet, n.x, n.y, 6 + 14 * a, 0.2 + 0.8 * a);
    }));
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = C.ink;
    g.beginPath();
    NODES.forEach((layer) => layer.forEach((n) => { g.moveTo(n.x + 2, n.y); g.arc(n.x, n.y, 2, 0, TAU); }));
    g.fill();

    if (t >= nextTrain) {
      nextTrain = t + 0.22;
      if (++trainStep > 100) { trainStep = 1; epoch++; }
      const loss = Math.max(0.011, 0.9 * EXP(-epoch * 0.42)) * (0.92 + Math.random() * 0.16);
      setTxt(trainEl, 'epoch ' + epoch + ' · step ' + trainStep + '/100 · loss ' + loss.toFixed(3));
      if (progEl) progEl.style.width = trainStep + '%';
    }
  });

  /* ---------- 6 · quincunx: each ball takes a left/right decision per gate and lands in a bin ---------- */
  const R = 8, LT = 0.12;                       // gates, seconds per gate
  const bins = new Float32Array(R + 1);
  const balls = [];
  const Q = { cx: 0, top: 0, rowH: 1, sx: 1, baseY: 0 };
  const xAt = (L, k) => Q.cx + (k - L / 2) * Q.sx;
  const yAt = (L) => Q.top + L * Q.rowH;
  const quinS = cv('#qtQuin', ({ W, H }) => {
    Q.cx = W / 2; Q.top = 16; Q.sx = W / (R + 3); Q.rowH = (H - 70) / (R + 1); Q.baseY = H - 14;
  });
  const quinN = $('#qtQuinN');
  let qNext = 0, landed = 0;
  if (quinS) J.task(quinS.c, (t) => {
    const { g, W, H } = quinS;
    if (t >= qNext && balls.length < 70) { qNext = t + 0.16; balls.push({ t0: t, path: Array.from({ length: R }, () => (Math.random() < 0.5 ? 0 : 1)) }); }
    g.clearRect(0, 0, W, H);

    // gates
    g.fillStyle = rgba(C.ink, 0.26);
    g.beginPath();
    for (let L = 0; L < R; L++) for (let k = 0; k <= L; k++) { g.moveTo(xAt(L, k) + 1.6, yAt(L)); g.arc(xAt(L, k), yAt(L), 1.6, 0, TAU); }
    g.fill();

    // bins: the outcome histogram, left half red, right half green
    let maxC = 1;
    for (let b = 0; b <= R; b++) if (bins[b] > maxC) maxC = bins[b];
    const bh = Q.baseY - (yAt(R) + 10);
    for (let b = 0; b <= R; b++) {
      const h = Math.max(1.5, (bins[b] / maxC) * bh);
      g.fillStyle = b >= R / 2 ? rgba(C.green, 0.72) : rgba(C.red, 0.68);
      g.fillRect(xAt(R, b) - Q.sx * 0.36, Q.baseY - h, Q.sx * 0.72, h);
    }

    // balls: move gate by gate, hop over each peg, land in a bin
    g.globalCompositeOperation = 'lighter';
    for (let q = balls.length - 1; q >= 0; q--) {
      const b = balls[q], e = (t - b.t0) / LT, L = Math.floor(e);
      if (L >= R) {
        let k = 0;
        for (const bit of b.path) k += bit;
        bins[k] += 1; landed++;
        balls.splice(q, 1);
        continue;
      }
      let k = 0;
      for (let i = 0; i < L; i++) k += b.path[i];
      const f = ease(e - L), nk = k + b.path[L];
      const x = lerp(xAt(L, k), xAt(L + 1, nk), f);
      const y = lerp(yAt(L), yAt(L + 1), f) - Math.sin(f * Math.PI) * Q.rowH * 0.22;
      glow(g, SP.pink, x, y, 6, 0.9);
    }
    g.globalCompositeOperation = 'source-over';

    // keep the histogram readable: once it gets heavy, halve it
    if (landed > 900) { for (let b = 0; b <= R; b++) bins[b] *= 0.5; landed *= 0.5; }
  });
  every($('.qt-quin'), 0.5, () => setTxt(quinN, J.fmt(Math.round(landed), 0)));

  /* ---------- 7 · robustness: seven checks x four stress variants; cells breathe, the ring is the pass score ---------- */
  const rbGrid = $('#qtRb');
  const ROWS = ['return', 'sharpe', 'max dd', 'fill rate', 'latency', 'spread', 'regime'];
  const COLS = ['base', 'vol +50%', 'lag 2 bars', 'thin book'];
  const cells = [];
  const cellBg = (v) => { const a = clamp(0.14 + Math.abs(v) * 0.22, 0.14, 0.8); return v >= 0 ? rgba(C.green, a) : rgba(C.red, a); };
  if (rbGrid) {
    rbGrid.appendChild(document.createElement('span'));
    COLS.forEach((c) => { const h = document.createElement('span'); h.className = 'h'; h.textContent = c; rbGrid.appendChild(h); });
    ROWS.forEach((name, i) => {
      const lab = document.createElement('span'); lab.textContent = name; rbGrid.appendChild(lab);
      const row = COLS.map((_, j) => {
        const el = document.createElement('b');
        rbGrid.appendChild(el);
        const target = rnd(0.5, 1.7) - j * rnd(0, 0.9) - (i === 4 ? 0.2 : 0);
        return { el, target, v: target };
      });
      cells.push(row);
    });
  }
  const ringEl = $('#qtRing'), scoreEl = $('#qtScore');
  every($('.qt-rb'), 0.35, () => {
    let sum = 0, n = 0;
    for (const row of cells) for (const c of row) {
      c.target = clamp(c.target + gauss() * 0.12, -2, 2);
      c.v = lerp(c.v, c.target, 0.4);
      c.el.style.background = cellBg(c.v);
      setTxt(c.el, signed(c.v, 1));
      sum += c.v; n++;
    }
    const score = Math.round(clamp(60 + (n ? sum / n : 0) * 18, 0, 99));
    setTxt(scoreEl, String(score));
    if (ringEl) ringEl.style.strokeDashoffset = (113.1 * (1 - score / 100)).toFixed(1);
  });

  /* ---------- 8 · monte carlo: 240 paths fan out and fade; end values stack into the histogram on the right ---------- */
  const MCN = 240, MCS = 170, HB = 28, HMIN = -0.4, HMAX = 0.4;
  const hist = new Float32Array(HB);
  let histTotal = 0, mcNext = 0;
  const paths = Array.from({ length: MCN }, () => ({ s: ri(0, MCS - 1), v: gauss() * 0.02, px: 0, py: 0, fresh: true, sig: rnd(0.8, 1.35), mu: rnd(-0.0004, 0.0012) }));
  const mcS = cv('#qtMC');
  const pctEl = $('#qtPct');
  const valAt = (b) => HMIN + ((b + 0.5) / HB) * (HMAX - HMIN);
  const quantile = (f) => { let acc = 0; for (let b = 0; b < HB; b++) { acc += hist[b]; if (acc / histTotal >= f) return valAt(b); } return HMAX; };
  if (mcS) J.task(mcS.c, (t) => {
    const { g, W, H } = mcS;
    const plotW = W * 0.7, midY = H / 2, sy = (H / 2 - 12) / 0.4;

    // fade the previous frames: destination-out keeps the canvas transparent over the glass
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = 'rgba(0,0,0,0.012)';
    g.fillRect(0, 0, W, H);

    if (t >= mcNext) {
      mcNext = t + 1 / 30;
      g.globalCompositeOperation = 'lighter';
      g.lineWidth = 1;
      for (const p of paths) {
        if (p.fresh) { p.fresh = false; p.px = (p.s / MCS) * plotW; p.py = midY - p.v * sy; }
        p.s++;
        p.v += p.mu + gauss() * 0.019 * p.sig;
        const x = (p.s / MCS) * plotW, y = midY - p.v * sy;
        g.strokeStyle = p.v >= 0 ? rgba(C.green, 0.55) : rgba(C.red, 0.5);
        g.beginPath(); g.moveTo(p.px, p.py); g.lineTo(x, y); g.stroke();
        p.px = x; p.py = y;
        if (p.s >= MCS) {
          hist[clamp(Math.floor(((p.v - HMIN) / (HMAX - HMIN)) * HB), 0, HB - 1)] += 1; histTotal++;
          p.s = 0; p.v = 0; p.px = 0; p.py = midY;
        }
      }
      if (histTotal > 6000) { for (let b = 0; b < HB; b++) hist[b] *= 0.5; histTotal *= 0.5; }
    }

    // zero line + histogram of end values (right third), drawn over the fade every frame
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = rgba(C.ink, 0.1); g.fillRect(0, midY, plotW, 1);
    const hx = W * 0.74, hw = W - hx - 6, base = H - 14, bw = hw / HB;
    let maxH = 1;
    for (let b = 0; b < HB; b++) if (hist[b] > maxH) maxH = hist[b];
    for (let b = 0; b < HB; b++) {
      const h = (hist[b] / maxH) * (H - 44);
      g.fillStyle = valAt(b) >= 0 ? rgba(C.green, 0.72) : rgba(C.red, 0.68);
      g.fillRect(hx + b * bw + 1, base - h, Math.max(1, bw - 2), h);
    }
  });
  every($('.qt-mc'), 0.25, () => {
    if (!histTotal) return;
    let loss = 0;
    for (let b = 0; b < HB; b++) if (valAt(b) < 0) loss += hist[b];
    setTxt(pctEl, 'P5 ' + pct(quantile(0.05)) + '  ·  P50 ' + pct(quantile(0.5)) + '  ·  P95 ' + pct(quantile(0.95)) + '  ·  P(loss) ' + ((loss / histTotal) * 100).toFixed(0) + '%');
  });
});
