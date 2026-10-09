/* desk-bottom — bayesian update · activity log · drift vs noise (prefix dkb-). Everything here is SIMULATED.
 * bayes : conjugate-gaussian prior x book likelihood -> posterior, re-centred on every 'decision' (edge_bps nudges the book)
 * log   : DOM list, newest on top, rows slide by transform only; fed by bus 'agentstep' + 'decision' (self-synthesised if absent)
 * drift : 140 random walks with a small positive drift, drawn incrementally on a persistent canvas (+ live end-value histogram) */
JEV.mod('desk-bottom', () => {
  const J = JEV, $ = J.$, C = J.C, S = J.S, clamp = J.clamp, fmt = J.fmt, gauss = J.gauss, TAU = J.TAU;
  const bay = $('#dkb-bayes'), lgc = $('#dkb-log'), drc = $('#dkb-drift');
  if (!bay || !lgc || !drc) return;
  const MONO = "'JetBrains Mono', ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace";
  const rgbOf = (h) => { const n = parseInt(h.slice(1), 16); return (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255); };
  const setT = (el, s) => { if (el && el.textContent !== s) el.textContent = s; };
  const sgn = (v, d) => (v >= 0 ? '+' : '-') + Math.abs(v).toFixed(d == null ? 1 : d);
  const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  /** soft additive glow sprite (drawn with 'lighter'; replaces shadowBlur) */
  const sprite = (rgb) => {
    const c = document.createElement('canvas'); c.width = c.height = 48;
    const g = c.getContext('2d'), gr = g.createRadialGradient(24, 24, 0, 24, 24, 24);
    gr.addColorStop(0, 'rgba(' + rgb + ',1)'); gr.addColorStop(.28, 'rgba(' + rgb + ',.35)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = gr; g.fillRect(0, 0, 48, 48); return c;
  };
  /** cards reveal with a small scale/translate (.rv) — JEV.fit measures the transformed rect, so re-fit once the reveal settles */
  const afterReveal = (card, fn) => {
    card.addEventListener('transitionend', (e) => { if (e.target === card && e.propertyName === 'transform') fn(); });
    J.onView(card, () => setTimeout(fn, 1300), { threshold: 0.05 });
  };
  /** bake a pill label to a tiny sprite (text is the costly part of a canvas frame; sprites are re-baked only when the label changes) */
  const bake = (cv, txt, w, h, fill, stroke, color, font) => {
    cv.width = Math.round(w * J.DPR); cv.height = Math.round(h * J.DPR);
    const g = cv.getContext('2d'); g.setTransform(J.DPR, 0, 0, J.DPR, 0, 0);
    rr(g, 0.5, 0.5, w - 1, h - 1, 4); g.fillStyle = fill; g.fill(); g.strokeStyle = stroke; g.lineWidth = 1; g.stroke();
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = color; g.fillText(txt, w / 2, h / 2 + 3.4);
  };
  const onFonts = []; // canvas text needs the web font loaded; redraw static layers once it is
  try { if (document.fonts && document.fonts.load) Promise.all([document.fonts.load("700 9px 'JetBrains Mono'"), document.fonts.load("9px 'JetBrains Mono'")]).then(() => onFonts.forEach((f) => f())).catch(() => {}); } catch (e) { /* ignore */ }
  /** Abramowitz-Stegun erf, enough for a tail-probability label */
  const erf = (x) => { const sg = x < 0 ? -1 : 1, a = Math.abs(x), t = 1 / (1 + 0.3275911 * a); return sg * (1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-a * a)); };
  const DASH = [3, 4], DOT = [1.5, 3.5], NODASH = [], F_TAG = '700 9px ' + MONO, F_HALT = '700 9.5px ' + MONO;

  /* =====================================================================================================
   * 1) BAYESIAN UPDATE
   * ===================================================================================================== */
  const initBayes = () => {
    const wrap = $('#dkb-bw'), cs = $('#dkb-bs'), cd = $('#dkb-bc');
    if (!wrap || !cs || !cd) return;
    const eRg = $('#dkb-rg'), eRgv = $('#dkb-rgv'), eBig = $('#dkb-bp'), eV = $('#dkb-bv'), eK1 = $('#dkb-bk1'), eK2 = $('#dkb-bk2'), eN = $('#dkb-bn');
    const lg = { pm: $('#dkb-pm'), ps: $('#dkb-ps'), lm: $('#dkb-lm'), ls: $('#dkb-ls'), om: $('#dkb-om'), os: $('#dkb-os') };
    const X0 = 0.2, X1 = 1.0, PEAK = 9.0, MAXP = 220, NSP = 120, NE = 56;
    const YP = new Float32Array(MAXP), YL = new Float32Array(MAXP), YO = new Float32Array(MAXP), XS = new Float32Array(MAXP), SPK = new Float32Array(NSP);
    const EX = new Float32Array(NE), EY = new Float32Array(NE), EV = new Float32Array(NE), EA = new Float32Array(NE), EM = new Float32Array(NE), EZ = new Float32Array(NE);
    const B = { mp: 0.54, sp: 0.095, ml: 0.676, sl: 0.072, tmp: 0.54, tml: 0.676, tsl: 0.072, bias: 0.1, flash: 0, ring: 1, n: 1204, spT: 0, si: 0, domT: 9, post: 0.627, ps: 0.057, dmp: 0.54, dsp: 0.095, dml: 0.676, dsl: 0.072, up: true };
    const TAG = [
      { f: 'rgba(255,193,61,.15)', s: 'rgba(255,193,61,.7)', t: '#ffd47a', l: 'rgba(255,193,61,.5)' },
      { f: 'rgba(77,141,255,.17)', s: 'rgba(106,163,255,.75)', t: '#9cc2ff', l: 'rgba(106,163,255,.55)' },
      { f: 'rgba(46,230,166,.17)', s: 'rgba(46,230,166,.85)', t: '#9dffd9', l: 'rgba(200,255,235,.6)' },
    ];
    const SPR = { ok: sprite('46,230,166'), kill: sprite('255,77,94') };
    // pointer probe: hover/drag along the axis to read P(up > x) — the posterior's upper tail lights up
    const PRB = { on: false, x: 0, k: '', t: -9, w: 90, cv: document.createElement('canvas') };
    cd.addEventListener('pointermove', (e) => { PRB.on = true; PRB.x = e.offsetX; });
    cd.addEventListener('pointerleave', () => { PRB.on = false; });
    cd.addEventListener('pointercancel', () => { PRB.on = false; });
    const ST = {
      ok: { g10: null, g4: null, core: null, hot: null, crgb: '141,255,208', coreS: '#8dffd0', hrgb: '212,255,238', rgb: '46,230,166', tail: 'rgba(141,255,208,.24)', fillTop: 'rgba(46,230,166,.6)', fillMid: 'rgba(46,230,166,.22)', fillBot: 'rgba(46,230,166,.02)', fill: null, spark: null },
      kill: { g10: null, g4: null, core: null, hot: null, crgb: '255,143,154', coreS: '#ff8f9a', hrgb: '255,214,218', rgb: '255,77,94', tail: 'rgba(255,143,154,.24)', fillTop: 'rgba(255,77,94,.55)', fillMid: 'rgba(255,77,94,.2)', fillBot: 'rgba(255,77,94,.02)', fill: null, spark: null },
    };
    let W = 0, H = 0, gs = null, gd = null, np = 0, L = 12, pw = 0, baseY = 0, curveH = 0, scale = 1, sy0 = 0, sy1 = 0, ok = false;
    const px = (p) => L + ((p - X0) / (X1 - X0)) * pw;
    const yS = (v) => sy1 - clamp((v - 0.3) / 0.5, 0, 1) * (sy1 - sy0 - 4) - 2;

    const solve = () => { const a = 1 / (B.dsp * B.dsp), b = 1 / (B.dsl * B.dsl), s2 = 1 / (a + b); B.post = (B.dmp * a + B.dml * b) * s2; B.ps = Math.sqrt(s2); };
    B.dmp = B.mp; B.dsp = B.sp; B.dml = B.ml; B.dsl = B.sl; solve();
    { let v = B.post; for (let i = NSP - 1; i >= 0; i--) { SPK[i] = v; v += (0.52 - v) * 0.03 + (Math.random() - 0.5) * 0.022; } SPK[NSP - 1] = B.post; }
    for (let i = 0; i < NE; i++) { EM[i] = 1; EA[i] = 1; EZ[i] = 1; }

    const drawStatic = () => {
      const g = gs; g.clearRect(0, 0, W, H);
      g.font = '9px ' + MONO; g.textBaseline = 'alphabetic'; g.lineWidth = 1;
      for (let k = 1; k <= 3; k++) { const y = Math.round(baseY - (curveH * k) / 4) + 0.5; g.strokeStyle = 'rgba(255,255,255,.04)'; g.beginPath(); g.moveTo(L, y); g.lineTo(L + pw, y); g.stroke(); }
      g.textAlign = 'center';
      for (let p = 0.3; p < 0.9001; p += 0.1) {
        const x = Math.round(px(p)) + 0.5, half = Math.abs(p - 0.5) < 0.01;
        g.setLineDash(half ? DASH : NODASH);
        g.strokeStyle = half ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.055)';
        g.beginPath(); g.moveTo(x, half ? 6 : baseY - curveH); g.lineTo(x, baseY + 4); g.stroke();
        g.setLineDash(NODASH);
        g.fillStyle = half ? 'rgba(240,233,248,.95)' : 'rgba(181,172,196,.82)';
        g.fillText(String(Math.round(p * 100)), x, baseY + 15);
      }
      g.strokeStyle = 'rgba(255,255,255,.26)'; g.beginPath(); g.moveTo(L, baseY + 0.5); g.lineTo(L + pw, baseY + 0.5); g.stroke();
      g.textAlign = 'left'; g.fillStyle = 'rgba(170,161,184,.9)'; g.font = '8.5px ' + MONO;
      g.fillText('P(up 5m) % · simulated', L, baseY + 26);
      g.textAlign = 'right'; g.fillText('50 = coin flip', L + pw, baseY + 26);
      // posterior history strip
      g.strokeStyle = 'rgba(255,255,255,.07)'; g.beginPath(); g.moveTo(L, sy0 - 0.5); g.lineTo(L + pw, sy0 - 0.5); g.stroke();
      const y50 = Math.round(yS(0.5)) + 0.5;
      g.setLineDash(DOT); g.strokeStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.moveTo(L, y50); g.lineTo(L + pw, y50); g.stroke(); g.setLineDash(NODASH);
      g.textAlign = 'left'; g.fillStyle = 'rgba(170,161,184,.85)'; g.fillText('posterior · last 30 s', L, sy0 + 10);
      g.textAlign = 'right'; g.fillText('50', L + pw, y50 + 9);
    };

    const lay = () => {
      const a = J.fit(cs), b = J.fit(cd);
      W = a.W; H = a.H; gs = a.g; gd = b.g;
      ok = W > 150 && H > 150;
      if (!ok) return;
      L = 12; pw = W - 24;
      const stripH = H < 250 ? 28 : 40;
      sy1 = H - 6; sy0 = sy1 - stripH; baseY = sy0 - 32;
      curveH = baseY - 58; scale = (curveH * 0.97) / PEAK;
      np = Math.min(MAXP, Math.max(60, Math.round(pw / 2.4)));
      for (let i = 0; i < np; i++) XS[i] = L + (pw * i) / (np - 1);
      for (const k of ['ok', 'kill']) {
        const s = ST[k];
        const f = gd.createLinearGradient(0, baseY - curveH, 0, baseY); f.addColorStop(0, s.fillTop); f.addColorStop(0.55, s.fillMid); f.addColorStop(1, s.fillBot); s.fill = f;
        const p = gd.createLinearGradient(0, sy0, 0, sy1); p.addColorStop(0, 'rgba(' + s.rgb + ',.34)'); p.addColorStop(1, 'rgba(' + s.rgb + ',0)'); s.spark = p;
        // glow + core fade out toward the baseline so the flat tails never smear into the axis
        const fade = (rgb, a0, a1) => { const q = gd.createLinearGradient(0, baseY, 0, baseY - curveH * 0.6); q.addColorStop(0, 'rgba(' + rgb + ',' + a0 + ')'); q.addColorStop(1, 'rgba(' + rgb + ',' + a1 + ')'); return q; };
        s.g10 = fade(s.rgb, 0, 0.075); s.g4 = fade(s.rgb, 0, 0.2); s.core = fade(s.crgb, 0.1, 1); s.hot = fade(s.hrgb, 0, 1);
      }
      drawStatic();
    };
    J.watch(wrap, lay); afterReveal(bay, lay);
    onFonts.push(() => { TAGK[0] = TAGK[1] = TAGK[2] = ''; if (ok) drawStatic(); });

    /* ---- dynamics: means drift with noise, re-centre on each decision ---- */
    const dyn = (t, dt) => {
      const sq = Math.sqrt(dt);
      B.bias *= Math.exp(-dt / 10);
      B.tml += (0.5 + B.bias - B.tml) * (1 - Math.exp(-dt * 0.5)) + gauss() * 0.075 * sq;
      B.tmp += (0.535 - B.tmp) * (1 - Math.exp(-dt * 0.05)) + gauss() * 0.03 * sq;
      B.tml = clamp(B.tml, 0.26, 0.82); B.tmp = clamp(B.tmp, 0.34, 0.7);
      const k4 = 1 - Math.exp(-dt * 3.2), k5 = 1 - Math.exp(-dt * 4.4);
      B.mp += (B.tmp - B.mp) * k4; B.ml += (B.tml - B.ml) * k5;
      B.sl += ((S.killed ? 0.15 : B.tsl) - B.sl) * k4; B.sp += (0.095 - B.sp) * k4;
      B.dmp = B.mp; B.dml = B.ml;
      B.dsp = B.sp * (1 + 0.1 * Math.sin(t * 0.7)); B.dsl = B.sl * (1 + 0.12 * Math.sin(t * 1.1 + 1.3));
      solve();
      B.flash *= Math.exp(-dt * 2.4);
      if (B.ring < 1) B.ring += dt * 1.5;
      B.spT += dt;
      if (B.spT >= 0.25) { B.spT -= 0.25; SPK[B.si] = B.post; B.si = (B.si + 1) % NSP; }
    };
    const nudge = (d) => {
      const st = d.state || {}, e = +st.edge_bps || 0, im = +st.imbalance || 0;
      B.bias = clamp(e / 60, -1, 1) * 0.2 + im * 0.06;
      B.tmp += (B.post - B.tmp) * 0.25;                      // yesterday's posterior leaks into today's prior
      B.tml = 0.5 + B.bias;                                  // the book re-centres on the new evidence
      if (Math.abs(B.tml - B.tmp) < 0.045) B.tml = B.tmp + (B.tml >= B.tmp ? 0.045 : -0.045);   // keep the two curves readable
      B.tsl = clamp(0.1 - (d.conf || 0.7) * 0.05, 0.045, 0.09);
      B.flash = 1; B.ring = 0; B.n++;
      setT(eN, fmt(B.n));
    };
    J.bus.on('decision', nudge);
    J.bus.on('tick', (k) => { if (k && k.price) B.bias = clamp(B.bias + clamp((k.dp / k.price) * 250, -0.008, 0.008), -0.3, 0.3); });

    /* ---- drawing ---- */
    const curveY = (m, s, out) => {
      const k = scale / (s * 2.5066), c = -0.5 / (s * s), x0 = X0, dx = (X1 - X0) / (np - 1);
      for (let i = 0; i < np; i++) { const d = x0 + dx * i - m; out[i] = baseY - k * Math.exp(c * d * d); }
    };
    const trace = (g, ys) => { g.beginPath(); g.moveTo(XS[0], ys[0]); for (let i = 1; i < np; i++) g.lineTo(XS[i], ys[i]); };
    const closeDown = (g) => { g.lineTo(XS[np - 1], baseY); g.lineTo(XS[0], baseY); g.closePath(); };
    /** tags are baked to tiny sprites (text is the costly part of a canvas frame) and only re-baked when the label changes, <= ~9 Hz */
    const TCV = [document.createElement('canvas'), document.createElement('canvas'), document.createElement('canvas')], TAGK = ['', '', ''], TAGT = [-9, -9, -9], TAGW = [60, 60, 60];
    const tag = (g, i, name, v, row, killed, t) => {
      const T = TAG[i], dead = i === 2 && killed;
      if (t - TAGT[i] > 0.11 || !TAGK[i]) {
        TAGT[i] = t;
        const txt = name + ' ' + (v * 100).toFixed(1), key = dead ? txt + '!' : txt;
        if (key !== TAGK[i]) { TAGK[i] = key; TAGW[i] = txt.length * 5.6 + 12; bake(TCV[i], txt, TAGW[i], 15, dead ? 'rgba(255,77,94,.2)' : T.f, dead ? 'rgba(255,77,94,.85)' : T.s, dead ? '#ffc3c9' : T.t, F_TAG); }
      }
      const w = TAGW[i], xm = px(v), x = clamp(xm - w / 2, 3, W - w - 3), y = 5 + row * 17;
      g.setLineDash(DASH); g.lineWidth = 1; g.strokeStyle = dead ? 'rgba(255,170,178,.6)' : T.l;
      g.beginPath(); g.moveTo(Math.round(xm) + 0.5, y + 16); g.lineTo(Math.round(xm) + 0.5, baseY); g.stroke(); g.setLineDash(NODASH);
      g.drawImage(TCV[i], x, y, w, 15);
    };
    const spawn = (i) => {
      const x = clamp(B.post + B.ps * gauss(), X0 + 0.02, X1 - 0.02), d = x - B.post;
      const h = (scale / (B.ps * 2.5066)) * Math.exp((-0.5 * d * d) / (B.ps * B.ps));
      EX[i] = px(x); EY[i] = baseY - h * J.rnd(0.04, 0.98); EV[i] = J.rnd(9, 24); EM[i] = J.rnd(1.1, 2.5); EA[i] = 0; EZ[i] = J.rnd(4, 9);
    };
    for (let i = 0; i < NE; i++) { EM[i] = J.rnd(1.1, 2.5); EA[i] = -J.rnd(0, 2.5); EV[i] = 12; EX[i] = -50; EY[i] = 0; EZ[i] = 5; }

    const frame = (t, dt) => {
      if (!ok) return;
      dyn(t, dt);
      const g = gd, kill = S.killed, st = kill ? ST.kill : ST.ok;
      g.clearRect(0, 0, W, H);
      curveY(B.dmp, B.dsp, YP); curveY(B.dml, B.dsl, YL); curveY(B.post, B.ps, YO);
      g.lineJoin = 'round'; g.lineCap = 'round';
      // prior (amber, dim)
      trace(g, YP); g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,193,61,.62)'; g.stroke(); closeDown(g); g.fillStyle = 'rgba(255,193,61,.075)'; g.fill();
      // book likelihood (blue, dim)
      trace(g, YL); g.lineWidth = 1.5; g.strokeStyle = 'rgba(106,163,255,.7)'; g.stroke(); closeDown(g); g.fillStyle = 'rgba(77,141,255,.085)'; g.fill();
      // posterior (green, bright, glow)
      g.globalCompositeOperation = 'lighter';
      trace(g, YO);
      g.lineWidth = 11; g.strokeStyle = st.g10; g.stroke();
      g.lineWidth = 5; g.strokeStyle = st.g4; g.stroke();
      if (B.flash > 0.03) { g.globalAlpha = Math.min(1, B.flash * 0.6); g.lineWidth = 6; g.strokeStyle = st.hot; g.stroke(); g.globalAlpha = 1; }
      closeDown(g); g.fillStyle = st.fill; g.fill();
      g.globalCompositeOperation = 'source-over';
      trace(g, YO); g.lineWidth = 1.9; g.strokeStyle = st.core; g.stroke();
      // embers: samples drawn from the posterior
      g.globalCompositeOperation = 'lighter';
      const spr = kill ? SPR.kill : SPR.ok;
      for (let i = 0; i < NE; i++) {
        const was = EA[i]; EA[i] += dt;
        if (EA[i] >= EM[i] || (was < 0 && EA[i] >= 0)) spawn(i);
        if (EA[i] < 0) continue;
        EY[i] -= EV[i] * dt;
        const a = Math.sin((EA[i] / EM[i]) * Math.PI), r = EZ[i];
        g.globalAlpha = a; g.drawImage(spr, EX[i] - r, EY[i] - r, r * 2, r * 2);
      }
      g.globalAlpha = 1;
      // ripple at the posterior peak on every decision
      if (B.ring < 1) {
        const pk = baseY - scale / (B.ps * 2.5066), r = 5 + B.ring * 40;
        g.globalAlpha = (1 - B.ring) * 0.8; g.lineWidth = 1.5; g.strokeStyle = st.coreS;
        g.beginPath(); g.arc(px(B.post), pk, r, 0, TAU); g.stroke(); g.globalAlpha = 1;
      }
      g.globalCompositeOperation = 'source-over';
      // probe: P(up > x) for the pointer's x
      if (PRB.on) {
        const xp = clamp(PRB.x, L, L + pw), pv = X0 + ((xp - L) / pw) * (X1 - X0), tail = 0.5 * (1 - erf((pv - B.post) / (B.ps * 1.41421)));
        let i0 = 0; while (i0 < np - 1 && XS[i0] < xp) i0++;
        g.globalCompositeOperation = 'lighter'; g.beginPath(); g.moveTo(xp, baseY); g.lineTo(xp, YO[i0]);
        for (let i = i0; i < np; i++) g.lineTo(XS[i], YO[i]);
        g.lineTo(XS[np - 1], baseY); g.closePath(); g.fillStyle = st.tail; g.fill(); g.globalCompositeOperation = 'source-over';
        g.setLineDash(NODASH); g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.moveTo(Math.round(xp) + 0.5, 58); g.lineTo(Math.round(xp) + 0.5, baseY); g.stroke();
        if (t - PRB.t > 0.08) {
          PRB.t = t; const txt = 'P(up > ' + (pv * 100).toFixed(0) + ') = ' + (tail * 100).toFixed(0) + '%';
          if (txt !== PRB.k) { PRB.k = txt; PRB.w = txt.length * 5.6 + 12; bake(PRB.cv, txt, PRB.w, 15, 'rgba(10,6,16,.9)', 'rgba(255,255,255,.7)', '#fff', F_TAG); }
        }
        g.drawImage(PRB.cv, clamp(xp + 8 + PRB.w > W - 3 ? xp - 8 - PRB.w : xp + 8, 3, W - PRB.w - 3), baseY - 24, PRB.w, 15);
      }
      // mean ticks + tags (three rows, so they never collide)
      tag(g, 0, 'prior', B.dmp, 0, false, t); tag(g, 1, 'book', B.dml, 1, false, t); tag(g, 2, 'post', B.post, 2, kill, t);
      // posterior history strip
      g.beginPath();
      for (let i = 0; i < NSP; i++) { const v = SPK[(B.si + i) % NSP], x = L + (pw * i) / (NSP - 1), y = yS(v); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.lineWidth = 1.4; g.strokeStyle = st.coreS; g.stroke();
      g.lineTo(L + pw, sy1); g.lineTo(L, sy1); g.closePath(); g.fillStyle = st.spark; g.fill();
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.9; g.drawImage(spr, L + pw - 9, yS(B.post) - 9, 18, 18); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';

      // DOM at 4 Hz
      B.domT += dt;
      if (B.domT >= 0.25 || J.reduce) {
        B.domT = 0;
        const p = B.post, up = p >= 0.5;
        setT(eV, (p * 100).toFixed(1));
        if (up !== B.up) { B.up = up; eBig.classList.toggle('dn', !up); }
        setT(eK1, sgn((p - 0.5) * 100) + 'pp'); setT(eK2, sgn((p - B.dmp) * 100) + 'pp');
        setT(lg.pm, (B.dmp * 100).toFixed(1)); setT(lg.ps, (B.dsp * 100).toFixed(1));
        setT(lg.lm, (B.dml * 100).toFixed(1)); setT(lg.ls, (B.dsl * 100).toFixed(1));
        setT(lg.om, (p * 100).toFixed(1)); setT(lg.os, (B.ps * 100).toFixed(1));
        const pa = 1 / (B.dsp * B.dsp), pb = 1 / (B.dsl * B.dsl), wb = (100 * pb) / (pa + pb);
        if (eRg) { eRg.style.setProperty('--dkb-w', wb.toFixed(1)); setT(eRgv, String(Math.round(wb))); }
      }
    };
    J.task(bay, frame);
  };

  /* =====================================================================================================
   * 2) ACTIVITY LOG
   * ===================================================================================================== */
  const initLog = () => {
    const list = $('#dkb-rl'), holder = $('#dkb-rows'), chipsEl = $('#dkb-chips'), cnt = $('#dkb-cnt'), liveB = $('#dkb-live'), lv = $('#dkb-lv');
    if (!list || !holder || !chipsEl) return;
    const META = {}, ORDER = [];
    J.AGENTS.forEach((a) => { const m = { key: a.key, name: a.name, col: a.col, rgb: rgbOf(a.col), n: 0, muted: false, chip: null, nEl: null }; META[a.key] = m; META[a.name.toLowerCase()] = m; ORDER.push(m); });
    const JEVM = { key: 'jev', name: 'JEV', col: C.pink, rgb: rgbOf(C.pink) };
    const GRAY = { key: 'x', name: '?', col: '#b8b2c2', rgb: '184,178,194' };
    let rows = [], q = [], rh = 27, rn = 12, anim = null, resolved = 27, lastReal = -1e9, lastIns = 0, nextSyn = 0, hover = false, hold = false;
    const VENUES = ['binance', 'okx', 'bybit', 'hyperliquid', 'coinbase', 'kraken'];
    const px = () => J.pick(['btc', 'btc', 'eth', 'sol']);
    const money = (v) => (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(2);

    // ---- chips (mute / unmute an agent) ----
    ORDER.forEach((m) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'dkb-ch'; b.setAttribute('aria-pressed', 'true'); b.title = m.name.toLowerCase() + ' · ' + (J.AGENTS.find((a) => a.key === m.key) || {}).role;
      b.style.setProperty('--a', m.col); b.style.setProperty('--ar', m.rgb);
      const i = document.createElement('i'), n = document.createElement('b'), u = document.createElement('u');
      n.textContent = m.name; u.textContent = '0'; b.append(i, n, u); m.dot = i;
      b.addEventListener('click', () => { m.muted = !m.muted; b.setAttribute('aria-pressed', String(!m.muted)); });
      chipsEl.appendChild(b); m.chip = b; m.nEl = u;
    });

    // ---- synthesiser (only used while no 'agentstep' arrives) ----
    const mkt = () => Math.round(J.market.price);
    const lastD = () => J.recent[0] || null;
    const GEN = {
      spotter: [
        () => ['scan', null, 'cross-checked three feeds · ' + J.pick(VENUES) + ' leads'],
        () => ['scan', null, 'spread ' + J.rnd(0.5, 3.2).toFixed(1) + 'bps on ' + px() + ' · book ok'],
        () => ['feed', null, 'heartbeat ok · latency ' + J.ri(12, 88) + 'ms'],
        () => ['scan', null, 'imbalance ' + sgn(J.rnd(-0.6, 0.6), 2) + ' on ' + J.pick(VENUES)],
      ],
      prior: [
        () => ['prior', null, 'updated on ' + fmt(1204 + J.ri(0, 90)) + ' passes'],
        () => ['update', null, 'p(up 5m) ' + J.rnd(48, 66).toFixed(1) + '% · n=' + fmt(1204 + J.ri(0, 90))],
        () => ['prior', null, 'implied drift flat · carry does not clear fees'],
        () => ['scan', Math.random() < 0.5 ? J.rnd(8, 60) : null, 'prediction-book check · fair ' + fmt(mkt() + J.ri(-9, 14))],
      ],
      edge: [
        () => ['edge', null, sgn(J.rnd(0.5, 6), 1) + 'bps over threshold · pass to kelly'],
        () => ['fair', null, 'fair ' + fmt(mkt() + J.ri(-6, 14)) + ' vs market ' + fmt(mkt())],
        () => ['edge', null, 'net of costs ' + sgn(J.rnd(-1, 4), 1) + 'bps · thin, wait'],
        () => { const d = lastD(); return ['edge', null, d ? 'jev asked · edge ' + sgn(d.state.edge_bps, 1) + 'bps on ' + d.symbol.split('-')[0].toLowerCase() : 'no edge above the floor']; },
      ],
      kelly: [
        () => ['size', null, 'kelly ' + J.pick(['0.5', '1', '2', '1']) + '% · capped by 4% max position'],
        () => ['size', null, 'drawdown guard ' + J.rnd(0.1, 1.8).toFixed(1) + '/10 · ok'],
        () => ['size', null, 'vol ' + J.ri(48, 118) + ' · size cut to 0.5%'],
      ],
      taker: [
        () => ['cross', J.rnd(-30, 80), 'crossed spread · ' + J.pick(['bought', 'sold']) + ' ' + J.rnd(0.04, 0.4).toFixed(2) + ' btc'],
        () => ['fill', J.rnd(-20, 55), 'filled on ' + J.pick(VENUES) + ' · slip ' + J.rnd(0.1, 0.9).toFixed(1) + 'bps'],
        () => ['queue', null, 'waiting for jev to clear the ticket'],
      ],
      closer: [
        () => ['close', J.rnd(10, 90), 'target hit · closed +' + J.rnd(3, 14).toFixed(1) + 'bps'],
        () => ['stop', -J.rnd(8, 60), 'stop hit · closed -' + J.rnd(3, 11).toFixed(1) + 'bps · rule held'],
        () => ['trail', null, 'trail moved to ' + fmt(mkt() - J.ri(5, 40))],
      ],
    };
    const WGT = ['spotter', 'spotter', 'prior', 'prior', 'edge', 'edge', 'kelly', 'taker', 'taker', 'closer'];
    const synth = () => { const k = J.pick(WGT), g = J.pick(GEN[k])(); return step(META[k], g[0], g[1], g[2]); };

    // ---- items ----
    const step = (m, verb, pnl, text) => {
      m = m || GRAY; const has = typeof pnl === 'number' && isFinite(pnl) && Math.abs(pnl) >= 0.005;
      return { m, name: m.name, col: m.col, rgb: m.rgb, verb: String(verb || 'step'), val: has ? money(pnl) : '—', tone: has ? (pnl >= 0 ? 'up' : 'dn') : '', text: String(text == null ? '' : text), cls: '' };
    };
    const decItem = (d) => {
      const dest = d.dest, tone = dest === 'execute' ? 'up' : dest === 'review' ? 'am' : 'gy';
      const act = d.action, sz = act === 'hold' ? '' : ' ' + d.size + '%';
      return { m: JEVM, name: 'JEV', col: C.pink, rgb: JEVM.rgb, verb: 'choice', val: '→ ' + dest, tone, cls: 'dkb-j',
        text: act + ' ' + d.symbol.split('-')[0].toLowerCase() + sz + ' · conf ' + d.conf.toFixed(2).replace(/^0/, '') + (dest === 'execute' || act === 'hold' ? '' : ' · ' + d.reason) };
    };
    const kill = (on) => ({ m: JEVM, name: 'JEV', col: on ? C.red : C.green, rgb: on ? rgbOf(C.red) : rgbOf(C.green), verb: on ? 'kill' : 'armed', val: on ? '■ halted' : '● armed', tone: on ? 'dn' : 'up', cls: on ? 'dkb-j dkb-rk' : 'dkb-j',
      text: on ? 'kill switch thrown · every order routes to review' : 'kill switch released · gate open at ' + S.floor.toFixed(2) });

    const mk = (it) => {
      const li = document.createElement('li');
      li.className = 'dkb-r' + (it.cls ? ' ' + it.cls : '');
      li.style.setProperty('--a', it.col); li.style.setProperty('--ar', it.rgb);
      const d = document.createElement('i'); d.className = 'dkb-d';
      const b = document.createElement('b'); b.className = 'dkb-ag'; b.textContent = it.name;
      const v = document.createElement('span'); v.className = 'dkb-vb'; v.textContent = it.verb;
      const p = document.createElement('span'); p.className = 'dkb-v' + (it.tone ? ' ' + it.tone : ''); p.textContent = it.val;
      const m = document.createElement('span'); m.className = 'dkb-ms'; m.textContent = it.text;
      li.title = it.name.toLowerCase() + ' · ' + it.verb + ' · ' + it.text;
      li.append(d, b, v, p, m);
      return li;
    };
    const count = (it, flash) => {
      const m = it.m;
      if (m && m.nEl) { m.n++; setT(m.nEl, String(m.n)); if (flash && m.dot.animate && !J.reduce) m.dot.animate([{ transform: 'scale(2.4)', opacity: 1 }, { transform: 'scale(1)', opacity: 1 }], { duration: 480, easing: 'cubic-bezier(.2,.8,.2,1)' }); }
      resolved++; setT(cnt, fmt(resolved));
    };
    const trim = (extra) => { while (rows.length > rn + extra) rows.pop().remove(); };
    /** the whole list is ONE moving layer: it jumps up by one row and eases back, so rows can never overlap or tear */
    const shift = () => {
      if (J.reduce || !list.animate) return;
      if (anim) anim.cancel();
      // 520 ms with a fast-out curve: the leftover offset of the previous shift (<1px at our 400 ms spacing) is negligible, and a starved frame loop can never stack offsets
      anim = list.animate([{ transform: 'translateY(' + -rh + 'px)' }, { transform: 'translateY(0px)' }], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' });
      anim.onfinish = () => { anim = null; trim(0); };
    };
    const push = (it) => {
      const li = mk(it);
      if (!J.reduce) { li.classList.add('new'); li.addEventListener('animationend', () => li.classList.remove('new'), { once: true }); }
      list.prepend(li); rows.unshift(li);
      shift(); trim(1); count(it, true);
    };
    const fillTo = (n) => { while (rows.length < n) { const it = synth(); const li = mk(it); list.appendChild(li); rows.push(li); count(it, false); } };
    const enqueue = (it) => {
      if (it.m && it.m.muted) return;
      q.push(it); if (q.length > 14) q.shift();
    };

    // ---- layout vars from css (--rh / --rn change with the container width) ----
    let seeded = false;
    const readVars = () => {
      const cs = getComputedStyle(holder);
      rh = parseFloat(cs.getPropertyValue('--rh')) || 27; rn = parseInt(cs.getPropertyValue('--rn'), 10) || 12;
      trim(0); fillTo(rn);
      if (!seeded) { // a few real-looking JEV rows among the agent rows
        seeded = true;
        for (let i = 0; i < 3; i++) { const at = 1 + i * 4; if (at >= rows.length) break; const nu = mk(decItem(J.makeDecision())); rows[at].replaceWith(nu); rows[at] = nu; }
      }
    };
    J.watch(holder, readVars); J.watch(lgc, readVars);

    // ---- sources ----
    J.bus.on('agentstep', (s) => {
      if (!s) return; lastReal = performance.now();
      enqueue(step(META[String(s.agent == null ? '' : s.agent).toLowerCase()] || (s.agent ? { key: 'x', name: String(s.agent).toUpperCase().slice(0, 7), col: GRAY.col, rgb: GRAY.rgb } : GRAY), s.verb, s.pnl, s.text));
    });
    J.bus.on('decision', (d) => { if (d && d.state) enqueue(decItem(d)); });
    J.bus.on('kill', (on) => { q.length = 0; push(kill(!!on)); });

    // ---- hover / tap pauses ----
    const paused = () => hover || hold;
    const sync = () => { const p = paused(); liveB.setAttribute('aria-pressed', String(p)); setT(lv, p ? 'paused' : 'live'); };
    const resume = () => { if (q.length > 4) q.splice(0, q.length - 4); lastIns = 0; };
    const rw = holder.parentElement;
    rw.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { hover = true; sync(); } });
    rw.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { hover = false; sync(); if (!paused()) resume(); } });
    liveB.addEventListener('click', () => { hold = !hold; sync(); if (!paused()) resume(); });

    J.task(list, (t) => {
      const now = t * 1000;
      if (paused()) return;
      if (performance.now() - lastReal > 2600 && now >= nextSyn) { enqueue(synth()); nextSyn = now + 1000 + Math.random() * 500; }
      if (q.length && now - lastIns > 400) { push(q.shift()); lastIns = now; }
    });
  };

  /* =====================================================================================================
   * 3) DRIFT VS NOISE
   * ===================================================================================================== */
  const initDrift = () => {
    const wrap = $('#dkb-dw'), cs = $('#dkb-ds'), cA = $('#dkb-dp'), cB = $('#dkb-dq'), co = $('#dkb-do');
    if (!wrap || !cs || !cA || !cB || !co) return;
    const ePP = $('#dkb-pp'), eTr = $('#dkb-tr'), ePool = $('#dkb-pool'), eRuns = $('#dkb-runs');
    const N = 140, T = 220, S1 = T + 1, NB = 14, NBIN = 30, RATE = T / 7.2, HOLD = 3.2, XF = 0.9, PRE = 44, MU0 = 0.8, SG0 = 8.6, VMIN = -150, VSTEP = 600 / NB;
    // the whole run is drawn up front (PX = equity of path i at step k), so a path can be coloured by where it ENDS and a resize re-draws the same run instead of re-rolling it
    const PX = new Float32Array(N * S1), MN = new Float32Array(S1), BKI = new Uint8Array(N), BKS = new Uint16Array(NB + 1), BKP = new Uint16Array(NB);
    const HB = new Float32Array(NBIN), HC = new Uint16Array(NBIN), CV = [cA, cB], CG = [null, null];
    // colour = where a path ENDS (bps): hot pink (loss) -> violet -> blue -> cyan -> green -> amber (big win); bucketed so a whole bucket strokes in one call
    const STOPS = [[-150, 255, 46, 110], [-50, 166, 107, 255], [40, 77, 141, 255], [120, 92, 225, 255], [190, 46, 230, 166], [290, 255, 193, 61], [420, 255, 226, 170]];
    const ramp = (v) => {
      let i = 1; while (i < STOPS.length - 1 && v > STOPS[i][0]) i++;
      const a = STOPS[i - 1], b = STOPS[i], f = clamp((v - a[0]) / (b[0] - a[0]), 0, 1);
      return ((a[1] + (b[1] - a[1]) * f) | 0) + ',' + ((a[2] + (b[2] - a[2]) * f) | 0) + ',' + ((a[3] + (b[3] - a[3]) * f) | 0);
    };
    const CORE = [], HALO = [], BAR = [], HEAD = [];
    for (let q = 0; q < NB; q++) { const s = ramp(VMIN + (q + 0.5) * VSTEP); CORE[q] = 'rgba(' + s + ',.34)'; HALO[q] = 'rgba(' + s + ',.035)'; BAR[q] = 'rgba(' + s + ',.85)'; HEAD[q] = 'rgba(' + s + ',.9)'; }
    const bk = (v) => clamp(Math.floor((v - VMIN) / VSTEP), 0, NB - 1);
    let W = 0, H = 0, gs = null, go = null, ok = false, lw = 0, lh = 0, have = false, snap = true;
    let padL = 36, padT = 24, padB = 22, hx0 = 0, hx1 = 0, histW = 52, px0 = 0, px1 = 0, pw = 0, ph = 0, dx = 1, lo = 0, hi = 1, invR = 1;
    let mu = MU0, sg = SG0, step = 0, phase = 0, phT = 0, acc = 0, cur = 0, xf = XF, poolW = 0, poolN = 0, runs = 0, domT = 9, my = 0, meanStr = '+0';
    const yPx = (v) => padT + ph - (v - lo) * invR * ph;
    const meanCv = document.createElement('canvas'), haltCv = document.createElement('canvas'); let meanW = 40;
    // pointer probe: a horizontal threshold line — the label says what share of the 140 paths sits above it
    const PRD = { on: false, y: 0, k: '', t: -9, w: 100, cv: document.createElement('canvas') };
    co.addEventListener('pointermove', (e) => { PRD.on = true; PRD.y = e.offsetY; });
    co.addEventListener('pointerleave', () => { PRD.on = false; });
    co.addEventListener('pointercancel', () => { PRD.on = false; });
    const bakeMean = () => { meanW = meanStr.length * 5.6 + 12; bake(meanCv, meanStr, meanW, 15, 'rgba(10,6,16,.88)', 'rgba(255,255,255,.55)', '#fff', F_TAG); };
    const bakeHalt = () => bake(haltCv, 'HALTED · NO ORDERS, NO WALK', 168, 22, 'rgba(40,6,12,.86)', 'rgba(255,77,94,.8)', '#ff9aa4', F_HALT);

    // the first run is pre-resolved from the endpoint distribution so the caption never starts empty
    { let w = 0; for (let i = 0; i < N; i++) if (MU0 * T + SG0 * Math.sqrt(T) * gauss() > 0) w++; poolW = w; poolN = N; runs = 1; }

    const drawStatic = () => {
      const g = gs; g.clearRect(0, 0, W, H); g.lineWidth = 1; g.font = '9px ' + MONO; g.textBaseline = 'alphabetic';
      // y grid + labels (bps)
      const rng = hi - lo, p10 = Math.pow(10, Math.floor(Math.log10(rng / 4))), nn = rng / 4 / p10, stp = (nn < 1.5 ? 1 : nn < 3.5 ? 2 : nn < 7.5 ? 5 : 10) * p10;
      g.textAlign = 'right';
      for (let v = Math.ceil(lo / stp) * stp; v <= hi; v += stp) {
        const y = Math.round(yPx(v)) + 0.5, zero = Math.abs(v) < 1e-6;
        g.setLineDash(zero ? DASH : NODASH); g.strokeStyle = zero ? 'rgba(255,255,255,.26)' : 'rgba(255,255,255,.05)';
        g.beginPath(); g.moveTo(px0, y); g.lineTo(px1 + 4, y); g.stroke(); g.setLineDash(NODASH);
        g.fillStyle = zero ? 'rgba(240,233,248,.95)' : 'rgba(181,172,196,.82)'; g.fillText(zero ? '0' : (v > 0 ? '+' : '') + Math.round(v), padL - 6, y + 3);
      }
      // ±2σ noise cone (dotted) and the drift line (dashed)
      g.setLineDash(DOT); g.strokeStyle = 'rgba(255,255,255,.2)';
      for (const sd of [2, -2]) { g.beginPath(); for (let k = 0; k <= T; k += 4) { const x = px0 + k * dx, y = yPx(MU0 * k + sd * SG0 * Math.sqrt(k)); if (k) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); }
      g.setLineDash(DASH); g.strokeStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.moveTo(px0, yPx(0)); g.lineTo(px1, yPx(MU0 * T)); g.stroke(); g.setLineDash(NODASH);
      // x axis
      g.fillStyle = 'rgba(181,172,196,.85)'; g.textAlign = 'left'; g.fillText('trade 1', px0, H - 7); g.textAlign = 'center'; g.fillText(String(T >> 1), px0 + pw / 2, H - 7); g.textAlign = 'right'; g.fillText(String(T), px1, H - 7);
      // caption + histogram well
      g.textAlign = 'left'; g.fillStyle = 'rgba(170,161,184,.9)'; g.font = '8.5px ' + MONO; g.fillText('equity · bps of capital · simulated', padL, 12);
      rr(g, hx0, padT, histW, ph, 5); g.fillStyle = 'rgba(255,255,255,.03)'; g.fill(); g.strokeStyle = 'rgba(255,255,255,.07)'; g.stroke();
      g.textAlign = 'right'; g.fillStyle = 'rgba(170,161,184,.9)'; g.fillText('end values', hx1, 12);
    };

    /** roll a whole run (140 walks) once, sort the paths into colour buckets by their end value, and cache the sample mean per step */
    const gen = () => {
      mu = MU0 * (0.94 + Math.random() * 0.12); sg = SG0 * (0.97 + Math.random() * 0.06);
      MN.fill(0);
      for (let i = 0; i < N; i++) {
        const o = i * S1, vs = sg * (0.82 + Math.random() * 0.36); let x = 0; PX[o] = 0;
        for (let k = 1; k < S1; k++) { x += mu + vs * gauss(); PX[o + k] = x; MN[k] += x; }
      }
      for (let k = 1; k < S1; k++) MN[k] /= N;
      BKS.fill(0);
      for (let i = 0; i < N; i++) BKS[bk(PX[i * S1 + T]) + 1]++;
      for (let q = 0; q < NB; q++) BKS[q + 1] += BKS[q];
      BKP.set(BKS.subarray(0, NB));
      for (let i = 0; i < N; i++) BKI[BKP[bk(PX[i * S1 + T])]++] = i;
    };
    /** draw steps a..b of the current run: ONE stroke per colour bucket per layer, however many steps (a frame, the head start, or a whole re-draw after a resize) */
    const paint = (g, a, b) => {
      if (b <= a) return;
      const xa = px0 + a * dx;
      g.globalCompositeOperation = 'lighter'; g.lineJoin = 'round'; g.lineCap = 'butt';
      for (let pass = 0; pass < 2; pass++) {
        g.lineWidth = pass ? 1 : 3.2;
        for (let q = 0; q < NB; q++) {
          const s0 = BKS[q], s1 = BKS[q + 1]; if (s0 === s1) continue;
          g.strokeStyle = pass ? CORE[q] : HALO[q]; g.beginPath();
          for (let j = s0; j < s1; j++) { const o = BKI[j] * S1; g.moveTo(xa, yPx(PX[o + a])); for (let k = a + 1; k <= b; k++) g.lineTo(px0 + k * dx, yPx(PX[o + k])); }
          g.stroke();
        }
      }
      // the sample mean: the bright spine of the cloud
      g.beginPath(); g.moveTo(xa, yPx(MN[a])); for (let k = a + 1; k <= b; k++) g.lineTo(px0 + k * dx, yPx(MN[k]));
      g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,.09)'; g.stroke();
      g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,.92)'; g.stroke();
      g.globalCompositeOperation = 'source-over';
    };
    /** a fresh run on the active layer, already `pre` steps in — the cloud is never empty */
    const newRun = (pre) => {
      gen(); const g = CG[cur]; g.clearRect(0, 0, W, H);
      step = 0; acc = 0; paint(g, 0, pre); step = pre;
    };
    /** crossfade: the finished run dissolves out on its layer while the new one dissolves in on the other */
    const fade = () => {
      const k = Math.min(1, xf / XF), e = k * k * (3 - 2 * k);
      CV[cur].style.opacity = e >= 1 ? '1' : e.toFixed(3); CV[cur ^ 1].style.opacity = e >= 1 ? '0' : (1 - e).toFixed(3);
    };

    const lay = () => {
      const a = J.fit(cs), b = J.fit(cA), b2 = J.fit(cB), c = J.fit(co);
      CG[0] = b.g; CG[1] = b2.g; gs = a.g; go = c.g;
      if (a.W === lw && a.H === lh && ok) return;
      W = a.W; H = a.H; lw = W; lh = H;
      ok = W > 150 && H > 150;
      if (!ok) return;
      histW = W < 340 ? 36 : 52; padL = 36; padT = 24; padB = 22;
      hx1 = W - 6; hx0 = hx1 - histW; px0 = padL; pw = hx0 - 12 - px0; px1 = px0 + pw; ph = H - padT - padB; dx = pw / T;
      const m = MU0 * T, s = SG0 * Math.sqrt(T); lo = m - 3.1 * s; hi = m + 3.0 * s; invR = 1 / (hi - lo);
      drawStatic(); my = yPx(0); bakeMean(); bakeHalt();
      if (!have) { have = true; newRun(J.reduce ? T : PRE); if (J.reduce) { phase = 1; xf = XF; } }
      else { // same run, new geometry (the resize cleared the layers)
        CG[cur ^ 1].clearRect(0, 0, W, H); CG[cur].clearRect(0, 0, W, H); paint(CG[cur], 0, step);
        xf = XF; fade();
      }
      snap = true; if (J.reduce) overlay(0, 0.016, S.killed);
    };
    onFonts.push(() => { if (!ok) return; drawStatic(); bakeMean(); bakeHalt(); });

    const wins = () => { let w = 0; for (let i = 0; i < N; i++) if (PX[i * S1 + step] > 0) w++; return w; };
    const finish = () => { poolW += wins(); poolN += N; runs++; };
    let mv = 0;

    /** overlay layer: histogram of the current values, run heads, sample-mean tag, probe, kill banner */
    const overlay = (t, dt, killed) => {
      const g = go; g.clearRect(0, 0, W, H);
      const xh = px0 + step * dx, o = step;
      HC.fill(0);
      for (let i = 0; i < N; i++) { const v = (PX[i * S1 + o] - lo) * invR * NBIN; if (v >= 0 && v < NBIN) HC[v | 0]++; }
      const sn = snap || J.reduce, binH = ph / NBIN, kb = sn ? 1 : 1 - Math.exp(-dt * 14);
      g.globalCompositeOperation = 'lighter';
      for (let b = 0; b < NBIN; b++) {
        HB[b] += (Math.min(1, HC[b] * (1 / (N * 0.1))) - HB[b]) * kb;
        const w = HB[b] * (histW - 5); if (w < 0.7) continue;
        g.fillStyle = BAR[bk(lo + ((b + 0.5) / NBIN) * (hi - lo))]; g.fillRect(hx1 - 1 - w, padT + ph - (b + 1) * binH + 0.6, w, Math.max(1, binH - 1.2));
      }
      snap = false;
      g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(hx1 - 1, padT, 1, ph);
      // frontier line + heads (each head wears its path's colour)
      if (step > 0 && step < T) { g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(xh - 0.5, padT, 1, ph); }
      for (let q = 0; q < NB; q++) { const s0 = BKS[q], s1 = BKS[q + 1]; if (s0 === s1) continue; g.fillStyle = HEAD[q]; for (let j = s0; j < s1; j++) g.fillRect(xh - 1, yPx(PX[BKI[j] * S1 + o]) - 1, 2, 2); }
      g.globalCompositeOperation = 'source-over';
      // mean tag riding the histogram
      mv = MN[o];
      my += (yPx(mv) - my) * (sn ? 1 : 1 - Math.exp(-dt * 13));
      g.setLineDash(DOT); g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 1; g.beginPath(); g.moveTo(xh, my + 0.5); g.lineTo(hx0 - 2, my + 0.5); g.stroke(); g.setLineDash(NODASH);
      g.drawImage(meanCv, hx0 - 4 - meanW, my - 7.5, meanW, 15);
      if (PRD.on && PRD.y > padT && PRD.y < padT + ph) {
        const thr = lo + (1 - (PRD.y - padT) / ph) * (hi - lo); let above = 0;
        for (let i = 0; i < N; i++) if (PX[i * S1 + o] > thr) above++;
        g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(hx0 + 1, padT, histW - 2, PRD.y - padT);
        g.setLineDash(NODASH); g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,.65)'; g.beginPath(); g.moveTo(px0, Math.round(PRD.y) + 0.5); g.lineTo(hx1, Math.round(PRD.y) + 0.5); g.stroke();
        if (t - PRD.t > 0.08) {
          PRD.t = t; const txt = sgn(thr, 0) + 'bp · ' + Math.round((above / N) * 100) + '% of paths above';
          if (txt !== PRD.k) { PRD.k = txt; PRD.w = txt.length * 5.6 + 12; bake(PRD.cv, txt, PRD.w, 15, 'rgba(10,6,16,.9)', 'rgba(255,255,255,.7)', '#fff', F_TAG); }
        }
        g.drawImage(PRD.cv, px0 + 6, clamp(PRD.y - 19, padT + 2, padT + ph - 17), PRD.w, 15);
      }
      if (killed) {
        g.fillStyle = 'rgba(255,60,80,.07)'; g.fillRect(px0, padT, hx1 - px0, ph);
        g.drawImage(haltCv, px0 + pw / 2 - 84, padT + ph / 2 - 11, 168, 22);
      }
    };

    const frame = (t, dt) => {
      if (!ok) return;
      const killed = S.killed;
      if (J.reduce) { if (step < T) { paint(CG[cur], step, T); step = T; finish(); phase = 1; xf = XF; fade(); } }
      else if (!killed) {
        if (phase === 0) {
          acc += dt * RATE; const n = Math.min(Math.floor(acc), T - step);
          if (n > 0) { acc -= n; paint(CG[cur], step, step + n); step += n; }
          if (step >= T) { phase = 1; phT = 0; finish(); }
        } else { phT += dt; if (phT > HOLD) { cur ^= 1; newRun(PRE); phase = 0; xf = 0; fade(); } }
        if (xf < XF) { xf = Math.min(XF, xf + dt); fade(); }
      }
      overlay(t, dt, killed);

      // ---- DOM at 4 Hz ----
      domT += dt;
      if (domT >= 0.25 || J.reduce) {
        domT = 0;
        setT(ePP, ((wins() / N) * 100).toFixed(1)); setT(eTr, String(step));
        const ms = sgn(mv, 0); if (ms !== meanStr) { meanStr = ms; bakeMean(); }
        setT(ePool, ((poolW / poolN) * 100).toFixed(1) + '%'); setT(eRuns, runs + (runs === 1 ? ' run' : ' runs'));
      }
    };
    J.watch(wrap, lay); afterReveal(drc, lay);
    J.task(drc, frame);
  };

  initBayes();
  initLog();
  initDrift();
});
