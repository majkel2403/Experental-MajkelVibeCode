/* code — the "jev-starter" editor window under the hero (bottom of the JEV DECIDES reference).
 * desk.py (light) · state.json (hot pink, re-types itself with the latest real decision) · questions.py (light) · zsh (dark, streams real decisions)
 * own tiny highlighter · per-line typing reveal · moving current-line band · minimaps · audio-bars glyph · live queue status bar.
 * Everything is simulated: the decisions come from the shared JEV bus. */
JEV.mod('code', () => {
  const J = JEV, $ = J.$, clamp = J.clamp, reduce = J.reduce;
  const root = $('#code'), win = root && $('#code-win', root);
  if (!win) return;
  const doc = document;

  /* =====================================================================
   * 1. tiny python highlighter (regex tokens -> classes code-k/-s/-n/-c/-f/-fd/-b/-ct/-a/-o/-v/-w)
   * ===================================================================== */
  const KW = new Set('import from def return if elif else and or not in is as for while with pass lambda True False None'.split(' '));
  const RE = /(#.*$)|(f?"(?:[^"\\]|\\.)*"?|f?'(?:[^'\\]|\\.)*'?)|(\d+(?:\.\d+)?)|([A-Za-z_]\w*)|(\s+)|(->|>=|<=|==|!=|[^\sA-Za-z_\d])/g;
  function hl(src) {
    const out = []; let m, prev = '';
    RE.lastIndex = 0;
    while ((m = RE.exec(src))) {
      const s = m[0]; let c = 'o';
      if (m[1]) c = 'c';
      else if (m[2]) c = 's';
      else if (m[3]) c = 'n';
      else if (m[4]) {
        const call = src.charAt(RE.lastIndex) === '(';
        if (KW.has(s)) c = 'k';
        else if (prev === 'def') c = 'fd';
        else if (/^[A-Z]/.test(s) && !/^[A-Z0-9_]+$/.test(s)) c = 'b';
        else if (call) c = 'f';
        else if (prev === '.') c = 'a';
        else if (/^[A-Z][A-Z0-9_]+$/.test(s)) c = 'ct';
        else c = 'v';
      } else if (m[5]) {
        if (out.length) { out[out.length - 1].t += s; continue; } // trailing space joins the previous token
        c = 'w';
      }
      if (c !== 'w' && m[5] === undefined) prev = s;
      const last = out[out.length - 1];
      if (last && last.c === c && (c === 'o' || c === 'v' || c === 'w') && last.t.trim().length === last.t.length) { last.t += s; continue; }
      out.push({ c, t: s });
    }
    return out;
  }

  /* =====================================================================
   * 2. panes (static code + json) : build · type · band · scroll · minimap
   * ===================================================================== */
  const MMC = {
    light: { k: '#c10f58', s: '#08704c', n: '#a14f00', c: '#bfb5c9', f: '#1b4fd1', fd: '#1b4fd1', b: '#7b34d8', ct: '#a63c06', a: '#6f6480', o: '#8a1f55', v: '#6f6480', p: '#9a8fa8', jk: '#2a2033' },
    hot: { live: 'rgba(255,255,255,.95)', v: 'rgba(12,2,7,.7)' },
  };
  const panes = {};
  const mk = (k, cfg) => {
    const el = $('.code-pane[data-k="' + k + '"]', win), mm = $('.code-mm', el);
    const P = Object.assign({
      k, el, body: $('.code-body', el), doc: $('.code-doc', el), mmW: mm, mmC: $('canvas', mm), mmV: $('i', mm), skin: el.classList.contains('code-hot') ? 'hot' : 'light',
      mLn: $('.code-ln-n', el), mLnV: '', mTs: $('.code-ts-n', el), mTsV: '', dot: $('.code-pd', el),
      band: doc.createElement('i'), caret: doc.createElement('i'), lines: [], mode: 'idle', li: 0, ti: 0, ci: 0, began: false, pause: 0, carry: 0, wait: 0, rt: false,
      cur: 0, sy: 0, ty: 0, lh: 19, rows: 14, hv: 282, dh: 0, gm: null, seen: false, out: true, ts: 0, typedAt: -9,
    }, cfg);
    P.band.className = 'code-band'; P.band.setAttribute('aria-hidden', 'true'); P.caret.className = 'code-caret'; P.caret.setAttribute('aria-hidden', 'true');
    panes[k] = P;
    return P;
  };
  const D = mk('desk', { cps: 190, delay: 0, base: 9.3, hop: { ask: 9, gate: 12, skip: 14, write: 19 }, rest: 19, tab: 'desk' });
  const S = mk('state', { cps: 160, delay: 0.18, base: 9.4, hop: { id: 1, action: 13, size: 14, risk: 15, dest: 17 }, rest: 17, tab: 'state' });
  const Q = mk('q', { cps: 190, delay: 0.38, base: 9.3, hop: { action: 5, size: 6, risk: 7, floor: 10, cap: 11, kill: 13, gate: 15 }, rest: 15, tab: 'q' });

  function build(P, models) {
    const d = P.doc;
    d.textContent = ''; d.appendChild(P.band);
    P.lines = models.map((toks, i) => {
      const el = doc.createElement('div'), no = doc.createElement('span');
      el.className = 'code-ln'; no.className = 'code-no'; no.textContent = String(i + 1); el.appendChild(no);
      if (P.hop.kill === i) el.setAttribute('data-kill', '');
      const tk = toks.map((m) => { const s = doc.createElement('span'), tn = doc.createTextNode(''); s.className = 'code-' + m.c + (m.x ? ' ' + m.x : ''); s.appendChild(tn); el.appendChild(s); return { el: s, tn, c: m.c, t: m.t, live: !!m.live, x: m.x || '' }; });
      d.appendChild(el);
      return { el, no, toks: tk, on: false, done: false };
    });
    P.dh = P.lines.length * P.lh + 16;
  }
  const cls = (k) => { k.el.className = 'code-' + k.c + (k.x ? ' ' + k.x : ''); };
  function setModel(P, m) { m.forEach((toks, i) => toks.forEach((tk, j) => { const k = P.lines[i].toks[j]; k.t = tk.t; k.x = tk.x || ''; })); }
  function blank(P) {
    for (const L of P.lines) { L.on = L.done = false; L.el.classList.remove('on'); for (const k of L.toks) { k.tn.nodeValue = ''; cls(k); } }
    P.cur = 0; P.sy = P.ty = 0; P.li = P.ti = P.ci = 0; P.began = false; P.carry = 0;
    applyScroll(P); band(P, 0);
  }
  function fillAll(P) {
    for (const L of P.lines) { L.on = L.done = true; L.el.classList.add('on'); for (const k of L.toks) { k.tn.nodeValue = k.t; cls(k); } }
    P.mode = 'idle'; P.el.classList.remove('code-typing');
    P.caretEnd = -2; band(P, P.rest); mm(P);
  }
  function band(P, i) {
    P.cur = i; P.band.style.transform = 'translate3d(0,' + (i * P.lh) + 'px,0)';
    const L = P.lines[i];
    if (L) { const tk = L.toks, at = tk.length ? tk[tk.length - 1].el.nextSibling : null; if (P.caret.parentNode !== L.el || P.caretEnd !== i) { L.el.insertBefore(P.caret, at); P.caretEnd = i; } }
    follow(P, i);
  }
  function follow(P, i) {
    const y0 = 8 + i * P.lh, m = 2 * P.lh, max = Math.max(0, P.dh - P.hv);
    if (y0 < P.ty + m) P.ty = y0 - m; else if (y0 + P.lh > P.ty + P.hv - m) P.ty = y0 + P.lh - P.hv + m;
    P.ty = clamp(P.ty, 0, max);
  }
  function applyScroll(P) {
    P.doc.style.transform = 'translate3d(0,' + (-P.sy).toFixed(2) + 'px,0)';
    P.mmV.style.transform = 'translate3d(0,' + (4 + (P.sy / P.lh) * 4).toFixed(2) + 'px,0)';
  }
  function scroll(P, dt) {
    const d = P.ty - P.sy;
    if (Math.abs(d) < 0.04) { if (d !== 0) { P.sy = P.ty; applyScroll(P); } return; }
    P.sy += d * (1 - Math.exp(-dt * 9)); applyScroll(P);
  }

  /* minimap: coloured stubs per typed line (0.5 px per char, 4 px pitch) */
  function mm(P) {
    const m = P.gm; if (!m) return;
    const g = m.g; g.clearRect(0, 0, m.W, m.H);
    const pal = MMC[P.skin];
    for (let i = 0; i < P.lines.length; i++) {
      const L = P.lines[i]; if (!L.done && !P.rt) break;
      let x = 3;
      for (const k of L.toks) {
        const w = k.t.length * 0.5;
        if (k.c !== 'w' && k.t.trim()) { g.fillStyle = k.live ? pal.live : pal[k.c] || pal.v; g.fillRect(x, 4 + i * 4, Math.max(0.6, Math.min(w, m.W - x - 1)), 1.8); }
        x += w;
        if (x > m.W) break;
      }
    }
  }
  for (const P of [D, S, Q]) {
    J.watch(P.mmW, () => { const f = J.fit(P.mmC); P.gm = f; mm(P); });
    J.watch(P.body, () => {
      const cs = getComputedStyle(win);
      P.lh = parseFloat(cs.getPropertyValue('--code-lh')) || 19; P.rows = parseFloat(cs.getPropertyValue('--code-rows')) || 14;
      P.hv = P.rows * P.lh + 16; P.dh = P.lines.length * P.lh + 16; P.mmV.style.height = (P.rows * 4 + 2) + 'px';
      band(P, P.cur); P.sy = P.ty = clamp(P.ty, 0, Math.max(0, P.dh - P.hv)); applyScroll(P);
    });
  }

  /* ---- typing engine: one line at a time, tokens in order; "live" tokens (json values) pop in whole with a flash ---- */
  function flash(el) {
    if (reduce || !el.animate) return;
    el.animate([{ backgroundColor: '#ffffff', boxShadow: '0 0 0 3px #fff, 0 0 22px 6px rgba(255,255,255,.95)' }], { duration: 950, easing: 'ease-out' });
  }
  function beginLine(P, L) {
    if (P.rt) for (const k of L.toks) { k.tn.nodeValue = ''; cls(k); }
    L.on = true; L.done = false; L.el.classList.add('on');
    P.cur = P.li; P.band.style.transform = 'translate3d(0,' + (P.li * P.lh) + 'px,0)';
    L.el.insertBefore(P.caret, L.no.nextSibling); P.caretEnd = -1;
    follow(P, P.li); P.began = true;
  }
  function endLine(P, L) {
    L.done = true; P.began = false; P.li++; P.ti = 0; P.ci = 0;
    const toks = L.toks.length;
    P.pause = (toks === 0 ? 0.05 : 0.035 + Math.random() * 0.07) * (P.rt ? 0.7 : 1);
    mm(P);
    if (P.li >= P.lines.length) finish(P);
  }
  function finish(P) {
    P.mode = 'idle'; P.rt = false; P.el.classList.remove('code-typing'); P.idleAt = J.time;
    P.caretEnd = -2; band(P, P.rest); mm(P);
  }
  function type(P, dt) {
    if (P.mode !== 'type') return;
    if (P.wait > 0) { P.wait -= dt; return; }
    if (P.pause > 0) { P.pause -= dt; return; }
    const b = P.cps * dt + P.carry; let n = Math.floor(b); P.carry = b - n;
    let guard = 160;
    while (n > 0 && P.mode === 'type' && guard-- > 0) {
      const L = P.lines[P.li];
      if (!L) { finish(P); break; }
      if (!P.began) beginLine(P, L);
      const k = L.toks[P.ti];
      if (!k) { endLine(P, L); if (P.pause > 0) break; continue; }
      if (k.live) { k.tn.nodeValue = k.t; flash(k.el); L.el.insertBefore(P.caret, k.el.nextSibling); P.ti++; P.ci = 0; n -= 3; continue; }
      if (!k.t.trim()) { k.tn.nodeValue = k.t; P.ti++; P.ci = 0; continue; } // indentation is free
      const take = Math.min(n, k.t.length - P.ci);
      P.ci += take; n -= take; k.tn.nodeValue = k.t.slice(0, P.ci);
      if (P.ci >= k.t.length) { P.ti++; P.ci = 0; L.el.insertBefore(P.caret, k.el.nextSibling); }
    }
    if (P.mode === 'type' && P.lines[P.li] && P.lines[P.li].toks.length === 0 && P.began) endLine(P, P.lines[P.li]);
  }
  function start(P, o) {
    o = o || {};
    if (reduce) { fillAll(P); return; }
    P.rt = !!o.rt;
    if (!P.rt) blank(P); else { P.li = P.ti = P.ci = 0; P.began = false; P.carry = 0; P.ty = 0; }
    P.mode = 'type'; P.wait = o.delay || 0; P.cps = o.cps || P.cps; P.pause = 0; P.el.classList.add('code-typing'); P.typedAt = J.time;
    tab(P.tab);
  }

  /* ---- static panes ---- */
  const lineModels = (P) => $('.code-src', P.doc).textContent.replace(/\n$/, '').split('\n').map(hl);
  build(D, lineModels(D)); build(Q, lineModels(Q));

  /* ---- state.json: model built from a real decision record ---- */
  const DEF = { id: 'b71d44a2', symbol: 'BTC-PERP', action: 'buy', conf: 0.93, size: 1, sizeIdx: 1, sizes: [0.1, 0.62, 0.2, 0.08], riskOk: true, pRisk: 0.96, dest: 'execute', reason: 'ok', ms: 3.2, floor: 0.85, killed: false,
    state: { price: 84722.4, edge_bps: 22.4, spread_bps: 1.2, imbalance: 0.41, position_pct: 0.5, daily_pnl: 312, latency_ms: 41 } };
  function stateModel(d) {
    const s = d.state;
    const T = (c, t) => ({ c, t }), V = (c, t, x) => ({ c, t, live: true, x: 'code-live' + (x ? ' ' + x : '') });
    const w = (n) => T('w', '  '.repeat(n)), jk = (k) => T('jk', '"' + k + '"'), p = (t) => T('p', t);
    const str = (v, x) => V('s', '"' + v + '"', x), num = (v) => V('n', String(v)), bool = (b) => V('k', String(!!b), 'code-bool' + (b ? '' : ' no'));
    const row = (n, k, val, last) => [w(n), jk(k), p(': '), val, p(last ? '' : ',')];
    const f1 = (v) => (+v).toFixed(1), f2 = (v) => (+v).toFixed(2);
    return [
      [p('{')],
      row(1, 'id', str(d.id)),
      [w(1), jk('state'), p(': {')],
      row(2, 'symbol', str(d.symbol)), row(2, 'price', num(s.price)), row(2, 'edge_bps', num(f1(s.edge_bps))), row(2, 'spread_bps', num(f1(s.spread_bps))),
      row(2, 'imbalance', num(f2(s.imbalance))), row(2, 'position_pct', num(f1(s.position_pct))), row(2, 'daily_pnl', num(Math.round(s.daily_pnl))), row(2, 'latency_ms', num(Math.round(s.latency_ms)), true),
      [w(1), p('},')],
      [w(1), jk('answers'), p(': {')],
      [w(2), jk('action'), p(': { '), jk('choice'), p(': '), str(d.action, 'code-d-' + d.action), p(', '), jk('conf'), p(': '), num(f2(d.conf)), p(' },')],
      [w(2), jk('size'), p(': { '), jk('pct'), p(': '), num(d.size), p(', '), jk('p'), p(': '), num(f2(d.sizes[d.sizeIdx])), p(' },')],
      [w(2), jk('risk_ok'), p(': { '), jk('flag'), p(': '), bool(d.riskOk), p(', '), jk('p'), p(': '), num(f2(d.pRisk)), p(' }')],
      [w(1), p('},')],
      row(1, 'dest', str(d.dest, 'code-d-' + d.dest)),
      row(1, 'why', str(d.reason)),
      row(1, 'ms', num(f1(d.ms)), true),
      [p('}')],
    ];
  }
  let latest = null, lastRetype = -99;
  build(S, stateModel(DEF));
  function retype(d, t) {
    setModel(S, stateModel(d));
    lastRetype = t;
    start(S, { rt: true, cps: 230 });
  }

  /* ---- start / restart when a pane scrolls into view ---- */
  if ('IntersectionObserver' in window) {
    const byEl = new Map([D, S, Q].map((P) => [P.el, P]));
    const io = new IntersectionObserver((es) => {
      for (const e of es) {
        const P = byEl.get(e.target);
        if (e.intersectionRatio >= 0.3 && P.out) {
          P.out = false;
          if (P === S && latest) setModel(S, stateModel(latest));
          start(P, { delay: P.delay });
          if (P === S) lastRetype = J.time;
        } else if (e.intersectionRatio === 0) P.out = true;
      }
    }, { threshold: [0, 0.3] });
    for (const P of [D, S, Q]) io.observe(P.el);
  } else for (const P of [D, S, Q]) fillAll(P);
  if (reduce) for (const P of [D, S, Q]) fillAll(P);

  /* =====================================================================
   * 3. zsh : real decisions from the bus, ~900 ms behind so each lands as the hero's code-act card fires
   * ===================================================================== */
  const zel = $('.code-pane[data-k="zsh"]', win), zout = $('.code-out', zel), zbody = $('.code-term', zel), zmmW = $('.code-mm', zel), zmmC = $('canvas', zmmW), zmmV = $('i', zmmW);
  const Z = { q: [], hist: [], n: 0, ndec: 0, off: 0, lh: 19, rows: 14, caret: doc.createElement('i'), gm: null, hold: false, lastPrint: -9, mLn: $('.code-ln-n', zel), mTs: $('.code-ts-n', zel), mLnV: '', mTsV: '', tag: $('.code-paused', zel), dirty: false };
  Z.caret.className = 'code-caret'; Z.caret.setAttribute('aria-hidden', 'true');
  const DELAY = 0.9, STEP = 0.095;
  const pad = (s, n) => s + ' '.repeat(Math.max(1, n - s.length));
  function zFormat(d) {
    const L = [], a = d.action, ms = Math.max(1, Math.round(d.ms)), ms2 = Math.max(1, Math.round(d.ms * 0.62));
    L.push([['tx', 'choice='], ['t-' + a, pad(a, 8)], ['tx', 'conf='], ['t-conf', d.conf.toFixed(2)], ['td', '  ' + ms + ' ms']]);
    L.push([['tx', 'size='], ['tx', d.size + '%'], ['td', ' (score)']]);
    L.push([['tx', 'risk_ok='], [d.riskOk ? 't-ok' : 't-no', String(d.riskOk)], ['td', ' (flag)   ' + ms2 + ' ms']]);
    const r = d.reason;
    if (r === 'hold') L.push([['td', '> '], ['t-warn', 'hold -> skip, nothing to send']]);
    else if (r === 'kill switch') L.push([['td', '> '], ['t-warn', 'kill switch -> human review']]);
    else if (r === 'risk flag') L.push([['td', '> '], ['t-warn', 'risk_ok=false -> human review']]);
    else if (d.dest === 'review') L.push([['td', '> '], ['t-warn', 'below ' + d.floor.toFixed(2) + ' -> human review']]);
    const sv = [['tx', 'Saved handoff: '], ['td', 'queue/'], ['t-dest', d.dest], ['td', '/'], ['tx', d.id + '.json']]; sv.fx = d.dest;
    L.push(sv);
    if (++Z.ndec % 20 === 0) {
      L.push([['t-ps', '$ '], ['t-cmd', 'ls queue/']]);
      L.push([['t-ok', 'execute/ '], ['t-conf', 'review/ '], ['t-warn', 'skip/']]);
    }
    return L;
  }
  function zPush(lines, at, seed) { lines.forEach((toks, i) => Z.q.push({ at: at + i * STEP, toks, seed: !!seed })); if (Z.q.length > 44) Z.q.splice(0, Z.q.length - 44); }
  function zPrint(e, instant) {
    const el = doc.createElement('div');
    el.className = 'code-tl' + (instant || e.seed || reduce ? ' seed' : '');
    for (const [c, t] of e.toks) { const s = doc.createElement('span'); s.className = 'code-' + c; s.textContent = t; el.appendChild(s); }
    zout.appendChild(el); el.appendChild(Z.caret);
    while (zout.childNodes.length > 40) zout.removeChild(zout.firstChild);
    Z.hist.push(e.toks); if (Z.hist.length > 60) Z.hist.shift();
    Z.n++; Z.dirty = true; Z.lastPrint = J.time;
    if (e.toks.fx && !instant && !e.seed && !reduce) land(e.toks.fx);
    if (!instant && !e.seed && !reduce) Z.off = Math.min(Z.off + Z.lh, Z.lh * 3);
  }
  const ZC = { 't-buy': '#2ee6a6', 't-sell': '#ff4d5e', 't-hold': '#b6aec2', 't-close': '#ff8a3d', 't-flatten': '#a66bff', 't-conf': '#ffc13d', 't-ok': '#2ee6a6', 't-no': '#ff4d5e', 't-dest': '#ff7ab3', 't-warn': '#ff7ab3', 't-ps': '#ff2e6e', 't-cmd': '#f4eef6', 'tx': '#cfc6d8', 'td': '#6f6680', 'tm': '#8d8499', 't-kill': '#ff4d5e', 't-arm': '#2ee6a6' };
  function zMm() {
    const m = Z.gm; if (!m) return;
    const g = m.g; g.clearRect(0, 0, m.W, m.H);
    const n = Z.hist.length;
    for (let i = 0; i < n; i++) {
      let x = 3;
      for (const [c, t] of Z.hist[i]) { const w = t.length * 0.5; if (t.trim()) { g.fillStyle = ZC[c] || '#cfc6d8'; g.fillRect(x, 4 + i * 4, Math.max(0.6, Math.min(w, m.W - x - 1)), 1.8); } x += w; if (x > m.W) break; }
    }
    const top = 4 + Math.max(0, n - Z.rows) * 4;
    zmmV.style.transform = 'translate3d(0,' + top + 'px,0)'; zmmV.style.height = (Math.min(n, Z.rows) * 4 + 2) + 'px';
  }
  J.watch(zmmW, () => { Z.gm = J.fit(zmmC); zMm(); });
  J.watch(zbody, () => { const cs = getComputedStyle(win); Z.lh = parseFloat(cs.getPropertyValue('--code-lh')) || 19; Z.rows = parseFloat(cs.getPropertyValue('--code-rows')) || 14; Z.cw = (parseFloat(cs.getPropertyValue('--code-fs')) || 12) * 0.6; });
  // seed: the prompt, then whatever the engine already decided
  zPush([[['t-ps', '$ '], ['t-cmd', 'jev watch queue/ --sim']], [['td', 'floor ' + J.S.floor.toFixed(2) + ' - cap $' + J.fmt(J.RULES.lossCap) + ' - max ' + J.RULES.maxPos + '% - listening']]], 0, true);
  for (const d of J.recent.slice(0, 3).reverse()) zPush(zFormat(d), 0, true);
  { const first = Z.q.splice(0); first.forEach((e) => zPrint(e, true)); Z.off = 0; }
  if (zel) {
    const fine = (e) => e.pointerType === 'mouse';
    zbody.addEventListener('pointerenter', (e) => { if (fine(e)) { Z.hold = true; Z.tag.hidden = false; } }); // hover the log to freeze it; the header (and the run button) never freeze it
    zbody.addEventListener('pointerleave', (e) => { if (fine(e)) { Z.hold = false; Z.tag.hidden = true; } });
    $('.code-run', zel).addEventListener('click', () => { J.fire(); });
  }
  function zFlush(t, dt) {
    if (Z.off > 0.05) { Z.off *= Math.exp(-dt * 13); zout.style.transform = 'translate3d(0,' + Z.off.toFixed(2) + 'px,0)'; } else if (Z.off !== 0) { Z.off = 0; zout.style.transform = ''; }
    if (Z.hold) return;
    let k = 0;
    while (k < Z.q.length && Z.q[k].at <= t) { const e = Z.q[k++]; if (t - e.at > 1.6) e.seed = true; zPrint(e, false); }
    if (k) { Z.q.splice(0, k); }
    if (Z.dirty) { Z.dirty = false; zMm(); }
  }

  /* =====================================================================
   * 4. chrome: tabs · hops · meta · status bar · audio-bars glyph
   * ===================================================================== */
  const tabs = {};
  for (const el of J.$$('.code-tab', win)) tabs[el.dataset.t] = { el, until: 0, on: false };
  function tab(k) { const o = tabs[k]; if (!o) return; o.until = J.time + 0.75; if (!o.on) { o.on = true; o.el.classList.add('hot'); } }
  function pop(el) { if (!reduce && el.animate) el.animate([{ transform: 'scale(1.9)' }, { transform: 'none' }], { duration: 480, easing: 'cubic-bezier(.2,.8,.2,1)' }); }
  const fnodes = J.$$('.code-fn', root).map((el) => ({ el, until: 0, on: false, b: el.querySelector('b'), d: el.dataset.d || '' }));
  function fnode(i, d) {
    const o = fnodes[i]; if (!o) return;
    if (d) { o.b.textContent = d.dest; if (o.d !== d.dest) { o.d = d.dest; o.el.setAttribute('data-d', d.dest); } }
    o.until = J.time + 0.8; if (!o.on) { o.on = true; o.el.classList.add('on'); }
  }
  const hops = []; let lastHop = -9, eqAct = 0;
  function planHops(d, t0) {
    eqAct = Math.min(1, eqAct + 0.7);
    if (hops.length > 40) hops.splice(0, hops.length - 12); // nobody is looking (section off screen): never let the plan grow
    hops.push({ at: t0, flow: 0 }, { at: t0 + 0.2, flow: 1 }, { at: t0 + 0.5, flow: 2 }, { at: t0 + DELAY, flow: 3, d });
    if (t0 - lastHop < 2.0) return; lastHop = t0;
    hops.push({ at: t0, P: D, i: D.hop.ask, tab: 'desk' }, { at: t0 + 0.12, P: Q, i: Q.hop.action }, { at: t0 + 0.2, P: S, i: S.hop.action }, { at: t0 + 0.3, P: Q, i: Q.hop.size },
      { at: t0 + 0.45, P: D, i: D.hop.gate }, { at: t0 + 0.48, P: Q, i: Q.hop.risk }, { at: t0 + 0.6, P: S, i: S.hop.dest });
    if (d.dest === 'skip') hops.push({ at: t0 + 0.66, P: D, i: D.hop.skip });
    hops.push({ at: t0 + 0.72, P: Q, i: d.killed ? Q.hop.kill : Q.hop.gate, tab: 'q' }, { at: t0 + DELAY, P: D, i: D.hop.write, tab: 'queue' });
  }
  function runHops(t) {
    for (let i = hops.length - 1; i >= 0; i--) {
      const h = hops[i]; if (h.at > t) continue;
      hops.splice(i, 1);
      if (t - h.at > 1.5) continue; // stale (frame stall / tab was hidden): skip instead of replaying
      if (h.flow != null) { fnode(h.flow, h.d); continue; }
      if (h.P.mode === 'idle' && !h.P.out) { band(h.P, h.i); pop(h.P.dot); }
      if (h.tab) tab(h.tab);
    }
  }
  const nX = $('#code-n-x'), nR = $('#code-n-r'), nS = $('#code-n-s'), fl = $('#code-fl'), kl = $('#code-kl'), qb = J.$$('.code-qbar i', win);
  const st = { x: -1, r: -1, s: -1, f: '', k: '' };
  function status() {
    const c = J.S.dest;
    if (c.execute !== st.x) { st.x = c.execute; nX.textContent = c.execute; qb[0].style.flexGrow = Math.max(0.2, c.execute); }
    if (c.review !== st.r) { st.r = c.review; nR.textContent = c.review; qb[1].style.flexGrow = Math.max(0.2, c.review); }
    if (c.skip !== st.s) { st.s = c.skip; nS.textContent = c.skip; qb[2].style.flexGrow = Math.max(0.2, c.skip); }
    const f = J.S.floor.toFixed(2); if (f !== st.f) { st.f = f; fl.textContent = f; }
    const k = J.S.killed ? 'THROWN' : 'armed'; if (k !== st.k) { st.k = k; kl.textContent = k; }
  }
  function meta(P, t) {
    const typing = P.mode === 'type';
    const ln = String(P.cur + 1), ts = typing ? (P.base + Math.sin(t * 3.1) * 0.45 + Math.sin(t * 7.3) * 0.25).toFixed(1) : '0.0';
    if (ln !== P.mLnV) { P.mLnV = ln; P.mLn.textContent = ln; }
    if (ts !== P.mTsV) { P.mTsV = ts; P.mTs.textContent = ts; }
  }
  function zMeta(t) {
    const ln = String(Z.n), act = t - Z.lastPrint < 1.4, ts = act ? (7.7 + Math.sin(t * 3.7) * 0.5 + Math.sin(t * 9.1) * 0.2).toFixed(1) : '0.0';
    if (ln !== Z.mLnV) { Z.mLnV = ln; Z.mLn.textContent = ln; }
    if (ts !== Z.mTsV) { Z.mTsV = ts; Z.mTs.textContent = ts; }
  }

  /* audio-bars glyph: breathes, jumps on every decision, rides the typing */
  const eq = $('#code-eq'), NB = 16, bars = new Float32Array(NB); let eg = null, ew = 72, eh = 20, egr = null;
  J.watch(eq, () => { const f = J.fit(eq); eg = f.g; ew = f.W; eh = f.H; egr = eg.createLinearGradient(0, eh, 0, 0); egr.addColorStop(0, '#ff2e6e'); egr.addColorStop(0.55, '#ff9cc4'); egr.addColorStop(1, '#ffffff'); });
  J.task(eq, (t, dt) => {
    if (!eg) return;
    const typing = (D.mode === 'type' ? 1 : 0) + (S.mode === 'type' ? 1 : 0) + (Q.mode === 'type' ? 1 : 0);
    eqAct *= Math.exp(-dt * 3.2);
    const act = Math.min(1, eqAct + typing * 0.22), bw = (ew - (NB - 1) * 2) / NB;
    eg.clearRect(0, 0, ew, eh);
    eg.fillStyle = J.S.killed ? '#ff8a96' : egr;
    for (let i = 0; i < NB; i++) {
      const n = 0.5 + 0.5 * Math.sin(t * (2.1 + i * 0.41) + i * 1.9), n2 = 0.5 + 0.5 * Math.sin(t * (4.3 + i * 0.27) + i * 0.7);
      const tg = clamp(0.1 + 0.17 * n + act * (0.28 + 0.55 * n2), 0.08, 1);
      bars[i] += (tg - bars[i]) * (tg > bars[i] ? 0.5 : 0.12);
      const h = Math.max(2, Math.round(bars[i] * eh)), x = Math.round(i * (bw + 2));
      eg.fillRect(x, eh - h, Math.max(1.5, bw), h);
    }
  });


  /* =====================================================================
   * 4b. handoff packets: every "Saved handoff" line sends a burst of light into its queue/ counter (additive sprites on a small canvas)
   * ===================================================================== */
  const fxc = $('#code-fx'), qEls = { execute: $('.code-q-x', win), review: $('.code-q-r', win), skip: $('.code-q-s', win) };
  const SPR = {}, SC = { execute: ['#ff9cc4', '#ff2e6e'], review: ['#ffe08a', '#ffa21a'], skip: ['#e4dff0', '#9b92a8'] };
  for (const k in SC) { // pre-rendered glow sprites (no shadowBlur in the frame loop)
    const c = doc.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'), r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, '#fff'); r.addColorStop(0.1, '#fff'); r.addColorStop(0.2, SC[k][0]); r.addColorStop(0.5, SC[k][1] + 'cc'); r.addColorStop(1, SC[k][1] + '00'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); SPR[k] = c;
  }
  let fg = null, fW = 0, fH = 0, geoDirty = true;
  if (fxc) J.watch(fxc, () => { const f = J.fit(fxc); fg = f.g; fW = f.W; fH = f.H; geoDirty = true; });
  const PN = 40, pts = [];
  for (let i = 0; i < PN; i++) pts.push({ on: false, k: 'execute', t: 0, sp: 1, x0: 0, y0: 0, cx: 0, cy: 0, x1: 0, y1: 0, s: 1, hit: false });
  const ring = { execute: 0, review: 0, skip: 0, x: { execute: 0, review: 0, skip: 0 }, y: { execute: 0, review: 0, skip: 0 } };
  let alive = 0;
  const geo = { x0: 0, y0: 0 }; // landing geometry relative to the fx canvas, cached: measured on resize, never inside a decision's DOM writes
  function measure() {
    geoDirty = false;
    const cr = fxc.getBoundingClientRect(), br = zbody.getBoundingClientRect();
    geo.x0 = br.left - cr.left; geo.y0 = br.bottom - cr.top;
    for (const k in qEls) { const i = qEls[k] && $('i', qEls[k]); if (!i) continue; const tr = i.getBoundingClientRect(); geo[k] = { x: tr.left - cr.left + tr.width / 2, y: tr.top - cr.top + tr.height / 2 }; }
  }
  if (fxc) { J.watch(zbody, () => { geoDirty = true; }); J.watch(win, () => { geoDirty = true; }); }
  function land(dest) {
    if (!fg || !qEls[dest]) return;
    if (geoDirty) measure();
    const g = geo[dest]; if (!g || fW < 2) return;
    const cw = Z.cw || 7.2;
    const x0 = geo.x0 + 14 + 38 * cw + 4, y0 = geo.y0 - 17, x1 = g.x, y1 = g.y;
    ring.x[dest] = x1; ring.y[dest] = y1;
    const n = J.narrow() ? 7 : 11; let made = 0;
    for (const p of pts) {
      if (p.on) continue;
      p.on = true; p.hit = false; p.k = dest; p.t = -Math.random() * 0.18; p.sp = 1 / (0.55 + Math.random() * 0.35); p.s = 0.55 + Math.random() * 0.7;
      p.x0 = x0 + (Math.random() - 0.5) * 6; p.y0 = y0 + (Math.random() - 0.5) * 6; p.x1 = x1 + (Math.random() - 0.5) * 3; p.y1 = y1 + (Math.random() - 0.5) * 2;
      p.cx = p.x0 - 14 - Math.random() * 46; p.cy = Math.min(y1 + 5 + Math.random() * 8, fH - 5); // drops out of the log line, then runs along the bottom gutter into the counter
      alive++; if (++made >= n) break;
    }
  }
  function drawFx(dt) {
    if (!fg) return;
    if (!alive && !ring.execute && !ring.review && !ring.skip) return;
    fg.clearRect(0, 0, fW, fH);
    fg.globalCompositeOperation = 'lighter';
    for (const p of pts) {
      if (!p.on) continue;
      p.t += dt * p.sp;
      if (p.t >= 1) {
        p.on = false; alive--;
        if (!p.hit) { p.hit = true; ring[p.k] = 1; const el = qEls[p.k]; if (el && el.animate && !reduce) el.animate([{ transform: 'translateY(-2px) scale(1.12)' }, { transform: 'none' }], { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)' }); }
        continue;
      }
      if (p.t < 0) continue;
      const spr = SPR[p.k];
      for (let j = 0; j < 4; j++) { // comet: head + 3 trail samples
        const u = Math.max(0, p.t - j * 0.035), e = u * u * (3 - 2 * u), a = 1 - e * 0.15, m = 1 - e;
        const x = m * m * p.x0 + 2 * m * e * p.cx + e * e * p.x1, y = m * m * p.y0 + 2 * m * e * p.cy + e * e * p.y1;
        const sz = (11 - j * 2.2) * p.s;
        fg.globalAlpha = (1 - j * 0.24) * a; fg.drawImage(spr, x - sz, y - sz, sz * 2, sz * 2);
      }
    }
    for (const k in SPR) { // arrival flare
      if (ring[k] <= 0.01) { ring[k] = 0; continue; }
      const r = ring[k], sz = 30 * (1.4 - r * 0.7);
      fg.globalAlpha = r * 0.9; fg.drawImage(SPR[k], ring.x[k] - sz, ring.y[k] - sz, sz * 2, sz * 2);
      ring[k] *= Math.exp(-dt * 6);
    }
    fg.globalAlpha = 1; fg.globalCompositeOperation = 'source-over';
    if (!alive && !ring.execute && !ring.review && !ring.skip) fg.clearRect(0, 0, fW, fH);
  }

  /* pointer tilt (fine pointers only): the whole window leans a degree or two toward the cursor */
  const stage = $('.code-stage', root), fineP = !!(window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)').matches);
  const tilt = { rx: 0, ry: 0, tx: 0, ty: 0, r: null, dirty: true, on: false };
  if (fineP && !reduce && stage) {
    stage.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      if (tilt.dirty || !tilt.r) { tilt.r = stage.getBoundingClientRect(); tilt.dirty = false; }
      const r = tilt.r; tilt.tx = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1) * 1.5; tilt.ty = -clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1) * 1.1; tilt.on = true;
    }, { passive: true });
    stage.addEventListener('pointerleave', () => { tilt.tx = tilt.ty = 0; });
    window.addEventListener('scroll', () => { tilt.dirty = true; }, { passive: true });
    window.addEventListener('resize', () => { tilt.dirty = true; }, { passive: true });
  }
  function tiltStep(dt) {
    if (!tilt.on) return;
    const k = 1 - Math.exp(-dt * 6);
    tilt.rx += (tilt.ty - tilt.rx) * k; tilt.ry += (tilt.tx - tilt.ry) * k;
    if (!tilt.tx && !tilt.ty && Math.abs(tilt.rx) < 0.01 && Math.abs(tilt.ry) < 0.01) { tilt.rx = tilt.ry = 0; tilt.on = false; stage.style.transform = ''; return; }
    stage.style.transform = 'perspective(1500px) rotateX(' + tilt.rx.toFixed(3) + 'deg) rotateY(' + tilt.ry.toFixed(3) + 'deg)';
  }

  /* =====================================================================
   * 5. master tick (runs only while #code is on screen)
   * ===================================================================== */
  const PANES = [D, S, Q];
  let lastMeta = 0, lastT = 0;
  J.task(root, (t) => {
    const dt = Math.min(0.3, t - lastT || 0.016); lastT = t; // wall-clock dt: typing keeps its pace even on a slow frame rate
    for (let i = 0; i < 3; i++) { type(PANES[i], dt); scroll(PANES[i], dt); }
    if (S.mode === 'idle' && latest && !S.out && t - lastRetype >= 5 && latest.id !== S.last) { S.last = latest.id; retype(latest, t); }
    runHops(t);
    zFlush(t, dt);
    drawFx(dt); tiltStep(dt);
    for (const k in tabs) { const o = tabs[k]; if (o.on && t > o.until) { o.on = false; o.el.classList.remove('hot'); } }
    for (const o of fnodes) if (o.on && t > o.until) { o.on = false; o.el.classList.remove('on'); }
    if (t - lastMeta > 0.25) { lastMeta = t; for (let i = 0; i < 3; i++) meta(PANES[i], t); zMeta(t); status(); }
  });

  /* =====================================================================
   * 6. bus
   * ===================================================================== */
  J.bus.on('decision', (d) => {
    latest = d;
    const t = J.time;
    zPush(zFormat(d), t + DELAY, false);
    planHops(d, t);
  });
  J.bus.on('kill', (on) => {
    const t = J.time;
    zPush([[[on ? 't-kill' : 't-arm', on ? ' KILL SWITCH - routing all to review ' : ' ARMED - gate open at floor ' + J.S.floor.toFixed(2) + ' ']]], t, false);
    if (Q.mode === 'idle' && !Q.out) { band(Q, on ? Q.hop.kill : Q.hop.gate); }
    tab('q'); eqAct = 1;
    status();
  });
  J.bus.on('floor', (v) => { zPush([[['td', '> '], ['t-warn', 'FLOOR set to ' + (+v).toFixed(2)]]], J.time, false); status(); });
  status();
});
