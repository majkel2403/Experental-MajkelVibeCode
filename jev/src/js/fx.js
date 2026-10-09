/* fx — page-wide atmosphere + micro-interaction layer.
 * webgl plasma background · cursor/card light · reveal · boot · orb eyes · nav · kill-switch theatre · JEV.toast / JEV.pulse */
JEV.mod('fx', () => {
  const J = JEV, doc = document, root = doc.documentElement;
  const $ = J.$, $$ = J.$$, clamp = J.clamp, reduce = J.reduce;
  const fine = !!(window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)').matches);
  const hudEl = $('#hud'), decEl = $('#mDec'), killBtn = $('#killBtn');
  let winW = window.innerWidth, winH = window.innerHeight, scrollY = window.scrollY || 0, scrollMax = 1, away = false;

  /* =====================================================================
   * 0. pulse + toast API (defined first so other modules can call them)
   * ===================================================================== */
  let bgPost = null; // set once the plasma (worker or main thread) is alive: bgPost(message)

  function hudGlow(s) {
    if (!hudEl || reduce || !hudEl.animate) return;
    const c = J.S.killed ? '255,77,94' : '255,46,110';
    hudEl.animate([{ boxShadow: '0 8px 0 -8px rgba(' + c + ',0)' }, { boxShadow: '0 10px 38px -8px rgba(' + c + ',' + (0.2 + 0.55 * s).toFixed(2) + ')', offset: 0.22 }, { boxShadow: '0 10px 38px -8px rgba(' + c + ',0)' }], { duration: 780, easing: 'ease-out' });
  }
  /** kick the shader ripple (ring from the viewport centre) + a brief hud glow */
  J.pulse = (s) => {
    s = clamp(s == null ? 0.5 : +s || 0, 0, 1);
    if (s <= 0) return;
    hudGlow(s);
    if (bgPost) bgPost({ t: 'p', s });
  };

  const toastHost = $('#fx-toasts'), toasts = [];
  function dismiss(t, fast) {
    if (t.gone) return;
    t.gone = true; clearTimeout(t.timer);
    const i = toasts.indexOf(t); if (i >= 0) toasts.splice(i, 1);
    t.el.classList.add('fx-t-out'); if (fast) t.el.classList.add('fast');
    setTimeout(() => t.el.remove(), fast ? 170 : 400);
  }
  /** bottom-centre glass pill, auto-dismiss 3 s, max 2 stacked. kind: 'info' | 'ok' | 'kill' */
  J.toast = (msg, kind) => {
    if (!toastHost) return;
    kind = kind || 'info';
    for (const o of toasts.slice()) if (o.msg === msg) dismiss(o, true);
    const el = doc.createElement('div'), dot = doc.createElement('i'), tx = doc.createElement('span'), bar = doc.createElement('b');
    el.className = 'fx-toast fx-t-' + kind; dot.className = 'fx-t-dot'; bar.className = 'fx-t-bar'; tx.textContent = msg;
    el.append(dot, tx, bar); toastHost.appendChild(el);
    const t = { el, msg, gone: false, timer: 0 };
    toasts.push(t);
    while (toasts.length > 2) dismiss(toasts[0], true);
    t.timer = setTimeout(() => dismiss(t), 3000);
  };

  /* =====================================================================
   * 1. #fx-bg — webgl plasma (domain-warped fbm), data bands, grain, pointer glow, pulse ripple, kill shift.
   *    renders in a worker on an OffscreenCanvas (context creation + compile never block the main thread),
   *    with the very same code as a main-thread fallback; css gradient fallback when there is no webgl at all.
   * ===================================================================== */
  const bg = $('#fx-bg');
  const VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  const FS = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH', 'precision highp float;', '#else', 'precision mediump float;', '#endif',
    'uniform vec2 uRes,uPtr;uniform float uSc,uT,uKill,uScroll,uProg,uPA;uniform vec2 uPu[3];',
    'const float CAP=.0049;', // linear-luminance ceiling of the plasma: keeps 12px grey text >= 4.5:1 anywhere
    'const mat2 ROT=mat2(.8,-.6,.6,.8);const vec3 LW=vec3(.2126,.7152,.0722);',
    'vec3 hue(vec3 c){return c/dot(c,LW);}',
    'float h11(float p){p=fract(p*.1031);p*=p+33.33;p*=p+p;return fract(p);}',
    'float h12(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}',
    'float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h12(i),h12(i+vec2(1.,0.)),f.x),mix(h12(i+vec2(0.,1.)),h12(i+vec2(1.,1.)),f.x),f.y);}',
    'float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<OCT;i++){v+=a*vn(p);p=ROT*p*2.02+17.3;a*=.5;}return v;}',
    'float ring(float d,vec2 u){float r=u.x*.62,w=.03+u.x*.045,x=(d-r)/w;return u.y*exp(-x*x)*exp(-u.x*1.4);}',
    'void main(){',
    ' vec2 fc=gl_FragCoord.xy,uv=fc/uRes;float asp=uRes.x/uRes.y;vec2 p=(uv-.5)*vec2(asp,1.);',
    ' float d0=length(p);float rg=ring(d0,uPu[0])+ring(d0,uPu[1])+ring(d0,uPu[2]);',
    ' vec2 pw=p+(p/(d0+.001))*rg*.06;', // ripple refracts the plasma
    ' float t=uT;vec2 q=pw*1.7+vec2(0.,uScroll*.00024);',
    ' vec2 w=vec2(fbm(q+vec2(0.,t*.05)),fbm(q+vec2(5.2,1.3)+vec2(-t*.04,t*.012)));',
    ' float f=fbm(q*1.15+2.9*(w-.5)+vec2(t*.03,-t*.021));',
    ' float k=uKill;',
    // palette at unit luminance, so every layer below has an explicit luminance budget (linear light)
    ' vec3 hInd=hue(mix(vec3(.03,.05,.60),vec3(.55,.03,.02),k));',
    ' vec3 hVio=hue(mix(vec3(.30,.02,.80),vec3(.95,.30,.012),k));',
    ' vec3 hMag=hue(mix(vec3(1.,.025,.28),vec3(1.,.08,.04),k));',
    ' float hf=smoothstep(.26,.74,.55*f+.45*w.y+.14*sin(uProg*6.2832));', // hue field: indigo -> violet -> magenta, drifts with plasma + page progress
    ' vec3 hc=mix(mix(hInd,hVio,clamp(hf*2.,0.,1.)),hMag,clamp(hf*2.-1.,0.,1.));',
    ' float a1=smoothstep(.30,.78,f);float a2=smoothstep(.42,.82,.5*(w.x+w.y)+.4*(f-.45));',
    ' float r1=pow(1.-abs(2.*f-1.),6.)*smoothstep(.28,.66,f);float r2=pow(1.-abs(2.*w.x-1.),8.)*smoothstep(.3,.7,w.y);', // aurora filaments (iso-contours of the noise)
    ' float ray=pow(.5+.5*sin(pw.x*9.+w.y*6.5+t*.12),6.)*smoothstep(.15,.95,uv.y)*smoothstep(.3,.72,f);', // slow vertical curtains, strongest toward the top
    ' vec3 col=vec3(.0015,.0009,.003);',
    ' col+=hc*(a1*.0017+a2*.0010);',
    ' col+=mix(hVio,hMag,.6)*(r1*.0024+r2*.0011);',
    ' col+=hInd*ray*.0013;',
    ' float side=smoothstep(.15,.95,abs(p.x)/(asp*.5));float wide=smoothstep(1.25,1.9,asp);', // calmer behind the centre column on wide screens
    ' col*=mix(1.,mix(.55,1.15,side),wide);',
    // faint horizontal data bands: dashed hairline + soft fill, sliding segments (css-px space)
    ' vec2 cp=fc/uSc;float row=floor(cp.y/34.);float rs=h11(row*1.37+3.1);float on=step(.78,rs);',
    ' float spd=(h11(row+7.7)-.5)*.05;float bx=fract(rs*13.7+t*spd);float seg=.10+.5*h11(row+1.9);float u=fract(uv.x-bx);',
    ' float inSeg=smoothstep(0.,.015,u)*(1.-smoothstep(seg,seg+.02,u));',
    ' float my=mod(cp.y,34.);float line=(1.-smoothstep(0.,1.3,abs(my-1.5)*uSc))*(.5+.5*step(.5,fract((cp.x+row*19.)/14.)));',
    ' col+=mix(hVio,hMag,hf)*on*inSeg*(line*.0016+.0005*(1.-smoothstep(0.,30.,my)));',
    // killed: slow red sweep
    ' float sw=exp(-pow((fract(uv.y*.9-t*.16)-.5)*8.,2.));col+=vec3(.9,.04,.02)*sw*k*.003;',
    // soft luminance limiter
    ' float L=dot(col,LW);col*=1./pow(1.+pow(L/CAP,3.),1./3.);',
    // vignette baked in (plasma only, never over text): dark corners, red-hot edges while killed
    ' float vg=smoothstep(.5,1.12,length(p*vec2(.86,1.)));col*=1.-.7*vg;col+=vec3(.9,.02,.03)*k*vg*.0011;',
    // drifting data motes: two parallax layers of tiny twinkling points (full-quality path only; points are far too small to touch text contrast)
    '#ifdef MOTES',
    ' float mo=0.;',
    ' for(int Ly=0;Ly<2;Ly++){float sc=Ly==0?64.:104.;vec2 g=vec2(cp.x,cp.y-t*(Ly==0?3.2:5.4))/sc;vec2 id=floor(g),f=fract(g)-.5;float hh=h12(id+float(Ly)*17.);',
    '  vec2 of=(vec2(h12(id+3.1),h12(id+7.7))-.5)*.62;float dd=length(f-of)*sc;float tw=.5+.5*sin(t*(.8+hh*2.2)+hh*40.);',
    '  mo+=step(.74,hh)*(1.-smoothstep(.6,3.1,dd))*(.35+.65*tw)*(Ly==0?1.:.6);}',
    ' col+=mix(hVio,hMag,hf)*mo*.0062*(.4+.6*smoothstep(0.,.5,a1+a2));',
    '#endif',
    // pointer glow + ripple light (added after the limiter, small bounded budget)
    ' vec2 pp=(uPtr-.5)*vec2(asp,1.);float dg=length(p-pp);float g=exp(-dg*dg*60.)*.8+exp(-dg*dg*7.)*.2;',
    ' col+=mix(vec3(.9,.03,.22),vec3(1.,.12,.03),k)*g*uPA*.0065;',
    ' col+=mix(vec3(.9,.1,.5),vec3(1.,.4,.05),k)*min(rg,1.3)*.0125;',
    ' col=pow(col,vec3(.4545));col+=(h12(fc+fract(t*7.3)*91.7)-.5)*.0075;', // gamma + dither/grain
    ' gl_FragColor=vec4(col,1.);}',
  ].join('\n');

  /* renderer + simulation. SELF-CONTAINED (no closure access): its source is shipped into the worker via toString().
   * messages: Float32Array[nx, ny, idle, away, scroll, prog] · {t:'k',v} kill · {t:'p',s} pulse · {t:'r',w,h} css size */
  function createBg(canvas, VS, FS, o) {
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const S = { T: 11.7, kill: o.killed ? 1 : 0, killT: o.killed ? 1 : 0, sx: 0.5, sy: 0.55, pa: 0.5, nx: 0.5, ny: 0.5, idle: 1, away: 0, scroll: 0, prog: 0, cw: o.w, ch: o.h, qual: 1, reduce: !!o.reduce };
    const P = [{ a: 9, s: 0 }, { a: 9, s: 0 }, { a: 9, s: 0 }], pu = new Float32Array(6);
    let pi = 0, gl = null, U = null, soft = false, info = '', warm = 0, gAcc = 0, gN = 0;
    const cb = o.cb || function () {};

    function init() {
      const t0 = performance.now();
      let g = null;
      try {
        const ob = { alpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: false };
        g = canvas.getContext('webgl', ob) || canvas.getContext('experimental-webgl', ob);
      } catch (e) { g = null; }
      if (!g) return false;
      const t1 = performance.now();
      try { // software rasteriser (swiftshader / llvmpipe): start small, cheaper noise, lower frame rate
        const dbg = g.getExtension('WEBGL_debug_renderer_info');
        soft = /swiftshader|llvmpipe|software|basic render/i.test(String(dbg ? g.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : ''));
      } catch (e) { soft = false; }
      if (soft) S.qual = 0.4;
      const mk = (type, src) => { const sh = g.createShader(type); g.shaderSource(sh, src); g.compileShader(sh); return g.getShaderParameter(sh, g.COMPILE_STATUS) ? sh : null; };
      const vs = mk(g.VERTEX_SHADER, VS), fs = mk(g.FRAGMENT_SHADER, '#define OCT ' + (soft ? 3 : 4) + '\n' + (soft ? '' : '#define MOTES\n') + FS);
      if (!vs || !fs) return false;
      const pr = g.createProgram(); g.attachShader(pr, vs); g.attachShader(pr, fs); g.linkProgram(pr);
      if (!g.getProgramParameter(pr, g.LINK_STATUS)) return false;
      g.useProgram(pr);
      g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer());
      g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
      const al = g.getAttribLocation(pr, 'a'); g.enableVertexAttribArray(al); g.vertexAttribPointer(al, 2, g.FLOAT, false, 0, 0);
      U = {};
      ['uRes', 'uPtr', 'uSc', 'uT', 'uKill', 'uScroll', 'uProg', 'uPA'].forEach((n) => (U[n] = g.getUniformLocation(pr, n)));
      U.uPu = g.getUniformLocation(pr, 'uPu[0]');
      gl = g;
      info = (soft ? 'software' : 'hw') + ' ctx ' + (t1 - t0).toFixed(0) + 'ms compile+link ' + (performance.now() - t1).toFixed(0) + 'ms';
      return true;
    }
    function size() {
      if (!gl) return;
      const base = Math.min(0.5, Math.sqrt(520000 / Math.max(1, S.cw * S.ch))); // <= 0.5x, and <= ~0.5 MP on huge screens
      const w = Math.max(16, Math.round(S.cw * base * S.qual)), h = Math.max(16, Math.round(S.ch * base * S.qual));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
      draw();
    }
    function draw() {
      if (!gl) return;
      pu[0] = P[0].a; pu[1] = P[0].s; pu[2] = P[1].a; pu[3] = P[1].s; pu[4] = P[2].a; pu[5] = P[2].s;
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform2f(U.uPtr, S.sx, S.sy);
      gl.uniform1f(U.uSc, canvas.width / S.cw);
      gl.uniform1f(U.uT, S.T);
      gl.uniform1f(U.uKill, S.kill);
      gl.uniform1f(U.uScroll, S.scroll);
      gl.uniform1f(U.uProg, S.prog);
      gl.uniform1f(U.uPA, S.pa);
      gl.uniform2fv(U.uPu, pu);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function step(dt) {
      if (!S.reduce) S.T += dt;
      S.kill += (S.killT - S.kill) * (1 - Math.exp(-dt * 3.2));
      if (Math.abs(S.killT - S.kill) < 0.002) S.kill = S.killT;
      let tx, ty, ta;
      if (S.idle) { tx = 0.5 + 0.3 * Math.sin(S.T * 0.21); ty = 0.55 - 0.25 * Math.sin(S.T * 0.17 + 1.3); ta = 0.5; } // no pointer yet: an ambient light wanders
      else { tx = S.nx; ty = S.ny; ta = S.away ? 0.35 : 1; }
      const k = 1 - Math.exp(-dt * 5); S.sx += (tx - S.sx) * k; S.sy += (ty - S.sy) * k; S.pa += (ta - S.pa) * k;
      for (let i = 0; i < 3; i++) { const p = P[i]; if (p.s > 0) { p.a += dt; if (p.a > 3) p.s = 0; } }
    }
    function once() { step(0.016); draw(); }
    const api = {
      ok: false,
      get soft() { return soft; },
      get info() { return info; },
      get minDt() { return S.qual < 0.7 ? 0.045 : 0.028; }, // plasma is slow and soft: ~30 fps (20 on weak gpus) is plenty
      tick(dt) {
        step(dt); draw();
        // resolution governor: if the plasma itself cannot keep ~24 fps, drop its resolution (floor 0.4 x)
        if (!S.reduce && ++warm > 60) { gAcc += dt; if (++gN >= 60) { if (gAcc / gN > 0.05 && S.qual > 0.4) { S.qual = Math.max(0.4, S.qual * 0.85); size(); } gAcc = gN = 0; } }
      },
      msg(m) {
        if (m instanceof Float32Array) { S.nx = m[0]; S.ny = m[1]; S.idle = m[2]; S.away = m[3]; S.scroll = m[4]; S.prog = m[5]; return; }
        if (m.t === 'k') { S.killT = m.v ? 1 : 0; if (S.reduce) { S.kill = S.killT; once(); } }
        else if (m.t === 'p') { const p = P[pi]; p.a = 0; p.s = m.s; pi = (pi + 1) % 3; if (S.reduce) once(); }
        else if (m.t === 'r') { S.cw = m.w; S.ch = m.h; size(); }
      },
    };
    api.ok = init();
    if (api.ok) {
      size();
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); gl = null; cb('lost'); });
      canvas.addEventListener('webglcontextrestored', () => { if (init()) { size(); cb('ready'); } });
    }
    return api;
  }

  /* worker side: autonomous render loop (generation token so pause/resume can never double the loop) */
  function bgWorkerMain() {
    let inst = null, running = false, gen = 0, acc = 0, n = 0, reduce = false, last = 0;
    const raf = self.requestAnimationFrame ? (f) => self.requestAnimationFrame(f) : (f) => setTimeout(() => f(performance.now()), 33);
    function start() {
      if (running || !inst) return;
      running = true; last = performance.now(); const g = ++gen;
      const f = (now) => {
        if (!running || g !== gen) return;
        raf(f);
        const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now; acc += dt;
        if (acc < inst.minDt) return;
        const d = acc; acc = 0; inst.tick(d);
        if (reduce && ++n >= 3) running = false; // reduced motion: a few frames, then still
      };
      raf(f);
    }
    self.onmessage = (e) => {
      const m = e.data;
      if (m.t === 'init') {
        reduce = !!m.reduce;
        inst = createBg(m.c, m.vs, m.fs, Object.assign(m, { cb: (t) => self.postMessage({ t }) }));
        self.postMessage({ t: inst.ok ? 'ready' : 'fail', info: inst.info });
        if (inst.ok) start();
      } else if (m.t === 'v') { if (m.h) running = false; else start(); }
      else if (inst) inst.msg(m);
    };
    self.postMessage({ t: 'hi' });
  }

  const note = (m) => { (J.bootLog || (J.bootLog = [])).push(m); };
  let bgMode = '';

  /* main-thread wiring shared by both paths: css size -> bg, pointer/scroll state -> bg (only when it changed) */
  function wireBg(post, drive) {
    bgPost = post; root.classList.add('fx-gl');
    J.watch(bg, (r) => { winW = Math.max(1, Math.round(r.width)); winH = Math.max(1, Math.round(r.height)); post({ t: 'r', w: winW, h: winH }); });
    const st = new Float32Array(6), last = new Float32Array(6).fill(-9);
    let acc = 0;
    J.task(bg, (t, dt) => {
      if (doc.hidden) return;
      const p = J.pointer, idle = p.x < -1000 ? 1 : 0;
      st[0] = idle ? 0.5 : p.x / winW; st[1] = idle ? 0.5 : 1 - p.y / winH; st[2] = idle; st[3] = away ? 1 : 0; st[4] = scrollY; st[5] = clamp(scrollY / scrollMax, 0, 1);
      if (Math.abs(st[0] - last[0]) + Math.abs(st[1] - last[1]) > 0.0004 || st[2] !== last[2] || st[3] !== last[3] || Math.abs(st[4] - last[4]) > 0.5 || Math.abs(st[5] - last[5]) > 0.0005) { last.set(st); post(st); }
      if (drive) { acc += dt; if (acc >= drive.minDt || J.reduce) { drive.tick(J.reduce ? 0.016 : acc); acc = 0; } }
    });
  }
  function startMain() { // fallback: same renderer on the main thread
    if (bgMode) return; bgMode = 'main';
    const inst = createBg(bg, VS, FS, { w: winW, h: winH, reduce, killed: J.S.killed, cb: (t) => { if (t === 'lost') root.classList.add('fx-nogl'); else root.classList.remove('fx-nogl'); } });
    if (!inst.ok) { root.classList.add('fx-nogl'); return; }
    note('fx-gl main-thread ' + inst.info);
    wireBg((m) => inst.msg(m), inst);
  }
  function startWorker() {
    let wk = null, url = '', transferred = false, done = false, to = 0;
    const toMain = () => { if (done) return; done = true; clearTimeout(to); try { wk && wk.terminate(); } catch (e) { /* ignore */ } if (transferred) root.classList.add('fx-nogl'); else fallbackMain(); };
    try {
      const src = 'const createBg=' + createBg.toString() + ';(' + bgWorkerMain.toString() + ')();';
      url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      wk = new Worker(url);
    } catch (e) { fallbackMain(); return; }
    to = setTimeout(toMain, 4000); // the worker never said hello
    wk.onerror = toMain;
    wk.onmessage = (e) => {
      const m = e.data;
      if (m.t === 'hi') {
        clearTimeout(to); try { URL.revokeObjectURL(url); } catch (err) { /* ignore */ }
        try {
          const off = bg.transferControlToOffscreen(); transferred = true;
          wk.postMessage({ t: 'init', c: off, vs: VS, fs: FS, w: winW, h: winH, reduce, killed: J.S.killed }, [off]);
          bgPost = (msg) => wk.postMessage(msg); // messages queue behind init, so a kill thrown while the context is still warming up is never lost
        } catch (err) { toMain(); }
      } else if (m.t === 'ready') {
        if (bgMode === 'worker') { root.classList.remove('fx-nogl'); return; } // context restored
        bgMode = 'worker'; note('fx-gl worker ' + m.info);
        wireBg((msg) => wk.postMessage(msg), null);
        doc.addEventListener('visibilitychange', () => wk.postMessage({ t: 'v', h: doc.hidden }));
      } else if (m.t === 'fail') { root.classList.add('fx-nogl'); done = true; wk.terminate(); }
      else if (m.t === 'lost') root.classList.add('fx-nogl');
    };
  }
  // main-thread fallback waits for the boot overlay's wipe (a context + compile there can stall the main thread for 50 ms - 3 s on weak gpus)
  let bootDone = false, wantMain = false, mainStarted = false;
  const runMain = () => { if (mainStarted) return; mainStarted = true; requestAnimationFrame(() => setTimeout(startMain, 0)); };
  const fallbackMain = () => { wantMain = true; if (bootDone) runMain(); };
  const startBgOnce = () => { bootDone = true; if (wantMain) runMain(); };
  setTimeout(startBgOnce, 2300); // failsafe (hidden tab / boot never finishes)
  if (bg) {
    const canWorker = typeof Worker === 'function' && typeof OffscreenCanvas === 'function' && typeof Blob === 'function' && !!bg.transferControlToOffscreen && !!window.URL && !!URL.createObjectURL;
    if (canWorker) requestAnimationFrame(() => setTimeout(startWorker, 0)); else fallbackMain();
  }
  root.addEventListener('mouseleave', () => (away = true));
  root.addEventListener('mouseenter', () => (away = false));

  /* =====================================================================
   * scroll / resize bookkeeping (cached, never read per frame)
   * ===================================================================== */
  let scrollTimer = 0, resizeTimer = 0;
  const onScrollEnd = [], onResizeEnd = [];
  function measureDoc() { scrollMax = Math.max(1, root.scrollHeight - winH); }
  window.addEventListener('scroll', () => {
    scrollY = window.scrollY || 0;
    clearTimeout(scrollTimer); scrollTimer = setTimeout(() => onScrollEnd.forEach((f) => f()), 160);
  }, { passive: true });
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { measureDoc(); onResizeEnd.forEach((f) => f()); }, 160);
  }, { passive: true });
  setTimeout(measureDoc, 600); setTimeout(measureDoc, 2600);

  /* =====================================================================
   * 3. cursor spotlight + card border light (one delegated listener)
   * ===================================================================== */
  const spotWrap = $('#fx-spotwrap'), spot = $('#fx-spot');
  if (fine && !reduce && spotWrap && spot) {
    let cx = 0, cy = 0, seen = false, lx = -1, ly = -1;
    J.task(spotWrap, (t, dt) => {
      const p = J.pointer;
      if (p.x < -1000) return;
      if (!seen) { seen = true; cx = p.x; cy = p.y; spotWrap.classList.add('on'); }
      const k = 1 - Math.exp(-dt * 16);
      cx += (p.x - cx) * k; cy += (p.y - cy) * k;
      if (Math.abs(cx - lx) < 0.05 && Math.abs(cy - ly) < 0.05) return;
      lx = cx; ly = cy;
      spot.style.transform = 'translate3d(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px,0)';
    });
    root.addEventListener('mouseleave', () => spotWrap.classList.remove('on'));
    root.addEventListener('mouseenter', () => { if (seen) spotWrap.classList.add('on'); });
  }
  {
    let ev = null, raf = 0, lastCard = null, lxx = -1, lyy = -1;
    const run = () => {
      raf = 0; if (!ev) return;
      const c = ev.target && ev.target.closest ? ev.target.closest('.card') : null;
      if (!c) { lastCard = null; return; }
      if (c === lastCard && Math.abs(ev.x - lxx) < 0.5 && Math.abs(ev.y - lyy) < 0.5) return;
      lastCard = c; lxx = ev.x; lyy = ev.y;
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', (ev.x - r.left).toFixed(1) + 'px'); c.style.setProperty('--my', (ev.y - r.top).toFixed(1) + 'px');
    };
    doc.addEventListener('pointermove', (e) => { ev = { target: e.target, x: e.clientX, y: e.clientY }; if (!raf) raf = requestAnimationFrame(run); }, { passive: true });
  }

  /* =====================================================================
   * 4. reveal: IntersectionObserver adds .in to .rv (stagger via --i); failsafes so nothing stays hidden
   * ===================================================================== */
  const boot = $('#fx-boot');
  const seen = new WeakSet(), pend = new Set();
  let held = [], rio = null;
  function landed(els) { setTimeout(() => els.forEach((e) => e.classList.add('fx-done')), 1900); }
  function revealBatch(els) {
    els = els.filter((e) => !e.classList.contains('in'));
    if (!els.length) return;
    const rank = els.map((e) => (getComputedStyle(e).getPropertyValue('--i').trim() ? -1 : 1)); // honour --i set by the module itself
    let n = 0;
    els.forEach((e, i) => { if (rank[i] > 0) e.style.setProperty('--i', String(Math.min(n, 10))); n++; });
    els.forEach((e) => { e.classList.add('in'); pend.delete(e); if (rio) rio.unobserve(e); });
    landed(els);
  }
  const byPos = (a, b) => { const ra = a.boundingClientRect, rb = b.boundingClientRect; return Math.round(ra.top / 40) - Math.round(rb.top / 40) || ra.left - rb.left; };
  function scanRv() {
    for (const e of $$('.rv')) {
      if (seen.has(e)) continue; seen.add(e);
      if (e.classList.contains('in')) continue;
      if (reduce || !rio) { e.classList.add('in'); continue; }
      pend.add(e); rio.observe(e);
    }
  }
  function sweep(inView) { // failsafe: reveal what is above (and, when asked, within) the viewport
    const hit = [];
    for (const e of pend) { const r = e.getBoundingClientRect(); if (r.bottom < 0 || (inView && r.top < winH)) hit.push(e); }
    hit.forEach((e) => { e.classList.add('in'); pend.delete(e); if (rio) rio.unobserve(e); });
    if (hit.length) landed(hit);
  }
  if ('IntersectionObserver' in window && !reduce) {
    rio = new IntersectionObserver((es) => {
      const vis = es.filter((e) => e.isIntersecting).sort(byPos).map((e) => e.target);
      if (!vis.length) return;
      if (held) { held.push.apply(held, vis); return; } // boot still on screen: park reveals until the wipe starts
      revealBatch(vis);
    }, { rootMargin: '0px 0px -5% 0px', threshold: 0 });
  }
  function releaseReveal() {
    if (!held) return;
    const h = held; held = null;
    h.sort((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return Math.round(ra.top / 40) - Math.round(rb.top / 40) || ra.left - rb.left; });
    revealBatch(h);
  }
  if (reduce || !rio || !boot) held = null;
  scanRv();
  onScrollEnd.push(() => sweep(false));
  setTimeout(() => { releaseReveal(); sweep(true); }, 3500);
  if ('MutationObserver' in window) {
    let mt = 0;
    new MutationObserver(() => { if (!mt) mt = setTimeout(() => { mt = 0; scanRv(); }, 220); }).observe(doc.body, { childList: true, subtree: true });
  }

  /* =====================================================================
   * 5. boot overlay (<= 1.6 s, click / any key skips, removes itself)
   * ===================================================================== */
  if (!boot) startBgOnce();
  if (boot) {
    if (reduce) { boot.remove(); releaseReveal(); startBgOnce(); }
    else {
      const LINES = [
        ['jev-1.13.0 > typed questions ...', 'ok'], ['hermes > strategy.yaml ...', 'ok'], ['dots > 4y candles ...', 'ok'],
        ['floor 0.85 | loss cap $2,000 | max pos 4% | kill switch', 'ARMED'], ['simulation only | no real orders | desk', 'online'],
      ];
      const starts = [0.04, 0.24, 0.44, 0.64, 0.84], durs = [0.19, 0.19, 0.19, 0.19, 0.17], OUT = 1.04;
      const logEl = $('#fx-blog'), fill = $('#fx-bfill'), pct = $('#fx-bpct');
      const rows = LINES.map((l) => {
        const row = doc.createElement('div'), a = doc.createElement('span'), b = doc.createElement('em');
        row.className = 'fx-bl'; row.append(a, b); logEl.appendChild(row);
        return { row, a, b, t: l[0], ok: l[1], n: -1, done: false };
      });
      let T0 = -1, over = false, lastPct = -1, tk = null;
      const finish = (fast) => {
        if (over) return; over = true;
        if (tk) tk.stop();
        boot.classList.add('fx-out'); if (fast) boot.classList.add('fx-fast');
        releaseReveal(); startBgOnce();
        doc.removeEventListener('keydown', skip, true);
        setTimeout(() => boot.remove(), fast ? 330 : 560);
      };
      const skip = () => finish(true);
      boot.addEventListener('pointerdown', skip, { once: true });
      doc.addEventListener('keydown', skip, true);
      tk = J.task(boot, (t) => {
        if (over) return;
        if (T0 < 0) T0 = t;
        const e = t - T0; // wall clock: the overlay is gone <= 1.6 s after its first frame no matter how slow the frames are
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i], p = clamp((e - starts[i]) / durs[i], 0, 1), n = Math.floor(p * r.t.length);
          if (p > 0 && n !== r.n) { r.n = n; r.a.textContent = r.t.slice(0, n); r.row.classList.add('show'); }
          r.row.classList.toggle('cur', p > 0 && p < 1);
          if (p >= 1 && !r.done) { r.done = true; r.b.textContent = r.ok; }
        }
        const f = clamp(e / (OUT - 0.02), 0, 1), q = Math.round(f * 100);
        fill.style.transform = 'scaleX(' + f.toFixed(3) + ')';
        if (q !== lastPct) { lastPct = q; pct.textContent = (q < 10 ? '0' : '') + q + '%'; }
        if (e >= OUT) finish(false);
      });
    }
  }

  /* =====================================================================
   * 6. orbs: pupils follow the pointer, idle wander otherwise.
   *    - geometry comes from IntersectionObserver entries: the browser computes their rects after layout, so this module never
   *      forces a layout of its own (the old 1.4 s getBoundingClientRect poll did, mid-frame, after other tasks had dirtied the tree).
   *      Re-observing an orb re-delivers its rect: done on scroll/resize end and every 1.5 s for the visible ones (orbiting agents move).
   *    - eye offsets are quantised to 0.25 px and written straight to the two eyes only when a step is crossed (was: two custom
   *      properties per orb per frame). Inline `translate` also keeps this module the single driver of the pupils.
   * ===================================================================== */
  const tick = $('#fx-tick');
  if (tick && !reduce) {
    const orbs = [], byEl = new Map();
    let lpx = -1, lpy = -1, still = 0, lastRe = 0;
    const geo = (o, r, on) => { // r: viewport rect of the orb, on: inside the viewport +-400px
      o.cx = r.left + r.width / 2; o.cy = r.top + r.height / 2 + scrollY; o.max = clamp(r.width * 0.045, 1.2, 3); o.vis = on && r.width >= 6;
    };
    const oio = 'IntersectionObserver' in window ? new IntersectionObserver((es) => {
      for (const e of es) { const o = byEl.get(e.target); if (o) geo(o, e.boundingClientRect, e.isIntersecting); }
    }, { rootMargin: '400px 0px' }) : null;
    const scanOrbs = () => {
      for (const el of $$('.orb')) {
        if (byEl.has(el)) continue;
        const eyes = $$('.e', el); if (!eyes.length) continue;
        const o = { el, eyes, x: 0, y: 0, qx: 0, qy: 0, ph: Math.random() * 6.28, cx: 0, cy: 0, max: 1.2, vis: false };
        byEl.set(el, o); orbs.push(o);
        if (oio) oio.observe(el); else geo(o, el.getBoundingClientRect(), true); // no IntersectionObserver: measure once, then on scroll / resize end
      }
    };
    const remeasure = (all) => {
      scanOrbs();
      for (const o of orbs) {
        if (oio) { if (all || o.vis) { oio.unobserve(o.el); oio.observe(o.el); } }
        else geo(o, o.el.getBoundingClientRect(), true);
      }
    };
    onScrollEnd.push(() => remeasure(true)); onResizeEnd.push(() => remeasure(true));
    scanOrbs();
    J.task(tick, (t, dt) => {
      if (oio && t - lastRe > 1.5) { lastRe = t; remeasure(false); }
      const p = J.pointer;
      if (Math.abs(p.x - lpx) + Math.abs(p.y - lpy) > 0.5) { lpx = p.x; lpy = p.y; still = 0; } else still += dt;
      const idle = p.x < -1000 || still > 3.5;
      const k = 1 - Math.exp(-dt * 9);
      for (let i = 0; i < orbs.length; i++) {
        const o = orbs[i]; if (!o.vis) continue;
        const oy = o.cy - scrollY;
        if (oy < -80 || oy > winH + 80) continue;
        let tx, ty;
        if (idle) { tx = Math.cos(t * 0.6 + o.ph) * o.max * 0.7; ty = Math.sin(t * 0.43 + o.ph * 1.7) * o.max * 0.45; }
        else {
          const dx = p.x - o.cx, dy = p.y - oy, d = Math.sqrt(dx * dx + dy * dy) || 1, s = Math.min(1, d / 170);
          tx = (dx / d) * o.max * s; ty = (dy / d) * o.max * s;
        }
        o.x += (tx - o.x) * k; o.y += (ty - o.y) * k;
        const qx = Math.round(o.x * 4) / 4, qy = Math.round(o.y * 4) / 4;
        if (qx === o.qx && qy === o.qy) continue;
        o.qx = qx; o.qy = qy;
        const v = qx + 'px ' + qy + 'px';
        for (let j = 0; j < o.eyes.length; j++) o.eyes[j].style.translate = v;
      }
    });
  }

  /* =====================================================================
   * 7. nav: highlight the section in view (sliding pink underline)
   * ===================================================================== */
  const nav = $('.nav');
  if (nav) {
    const links = $$('a[href^="#"]', nav), secs = links.map((a) => doc.getElementById(a.getAttribute('href').slice(1)));
    const bar = doc.createElement('i'); bar.className = 'fx-navbar'; bar.setAttribute('aria-hidden', 'true'); nav.appendChild(bar);
    let cur = -1;
    const place = () => {
      const a = links[cur];
      if (!a || !a.offsetWidth) { bar.classList.remove('on'); return; }
      bar.style.left = a.offsetLeft + 10 + 'px'; bar.style.width = Math.max(4, a.offsetWidth - 20) + 'px'; bar.classList.add('on');
    };
    const mark = (i) => {
      if (i === cur) return; cur = i;
      links.forEach((a, j) => { a.classList.toggle('on', j === i); if (j === i) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
      place();
    };
    if ('IntersectionObserver' in window) {
      const band = new Set();
      const nio = new IntersectionObserver((es) => {
        es.forEach((e) => (e.isIntersecting ? band.add(e.target) : band.delete(e.target)));
        let idx = -1; secs.forEach((s, i) => { if (s && band.has(s)) idx = i; });
        if (idx >= 0) mark(idx);
      }, { rootMargin: '-38% 0px -58% 0px', threshold: 0 });
      secs.forEach((s) => s && nio.observe(s));
    }
    if (scrollY < 80) mark(0);
    if ('ResizeObserver' in window) new ResizeObserver(place).observe(nav);
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(place);
  }

  /* =====================================================================
   * 8. kill-switch theatre + decision / floor reactions
   * ===================================================================== */
  const shockHost = $('#fx-shock');
  function shock(green) {
    if (!shockHost || reduce) return;
    let cx = winW - 90, cy = 28;
    if (killBtn) { const r = killBtn.getBoundingClientRect(); if (r.width) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; } }
    const far = Math.max(Math.hypot(cx, cy), Math.hypot(winW - cx, cy), Math.hypot(cx, winH - cy), Math.hypot(winW - cx, winH - cy));
    const s = ((far * 2.1) / 520).toFixed(2);
    (green ? [''] : ['', 'b']).forEach((cls) => {
      const el = doc.createElement('i');
      el.className = 'fx-ring ' + (green ? 'g ' : '') + cls; el.style.left = cx + 'px'; el.style.top = cy + 'px'; el.style.setProperty('--s', green ? (s * 0.75).toFixed(2) : s);
      el.addEventListener('animationend', () => el.remove(), { once: true });
      shockHost.appendChild(el);
      setTimeout(() => el.remove(), 1700);
    });
  }
  let glitchT = 0;
  function glitch() {
    if (reduce) return;
    clearTimeout(glitchT); root.classList.remove('fx-glitch');
    requestAnimationFrame(() => { root.classList.add('fx-glitch'); glitchT = setTimeout(() => root.classList.remove('fx-glitch'), 380); });
  }
  J.bus.on('kill', (on) => {
    if (bgPost) bgPost({ t: 'k', v: on });
    shock(!on);
    if (on) {
      glitch(); J.pulse(1);
      J.toast('KILL SWITCH THROWN - every order now routes to human review', 'kill');
    } else {
      J.pulse(0.6);
      J.toast('ARMED - gate open at floor ' + J.S.floor.toFixed(2), 'ok');
    }
  });

  let decAnim = null;
  function flashDec() {
    if (!decEl || reduce || !decEl.animate) return;
    if (decAnim) decAnim.cancel();
    decEl.style.transformOrigin = 'left center';
    decAnim = decEl.animate([{ color: '#fff', textShadow: '0 0 14px #ff2e6e, 0 0 30px rgba(255,46,110,.9)', transform: 'scale(1.14)', offset: 0 }, { offset: 1 }], { duration: 640, easing: 'ease-out' });
  }
  J.bus.on('decision', (d) => { if (d && d.dest === 'execute') { J.pulse(0.35); flashDec(); } });

  let floorT = 0;
  J.bus.on('floor', (v) => { clearTimeout(floorT); floorT = setTimeout(() => J.toast('floor -> ' + (+v).toFixed(2)), 600); });
});
