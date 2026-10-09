/* =========================================================
   JARVIS OS — start, pulpit, efekty, paleta, skróty
   ========================================================= */
'use strict';
/* BroadcastChannel — dwie karty: druga przechodzi w tryb „tylko podgląd" z przyciskiem „Przejmij".
   JEDYNY mechanizm ochrony dwóch kart (D-14): karta-podgląd ma od razu wyłączony zapis (J.save/J.saveNow),
   więc nie nadpisuje localStorage karty głównej nawet przez chwilę. */
J.tabChannel = (() => {
  if (typeof BroadcastChannel === 'undefined') return J.tabChannel;
  const CH = 'jarvis-os', id = J.uid();
  let primary = false, ch = null, heartT = null, missT = null;
  const saves = { save: J.save, saveNow: J.saveNow };
  delete J.state.__primary;   // historyczna flaga trwała w localStorage i na zawsze wyłączała ochronę dwóch kart
  const setReadonly = on => {
    document.body?.classList.toggle('readonly-tab', on);
    J.save = on ? () => { } : saves.save;
    J.saveNow = on ? () => false : saves.saveNow;
  };
  const claim = () => {
    primary = true;
    setReadonly(false);
    document.getElementById('tab-viewer')?.remove();
    ch?.postMessage({ type: 'claim', id });
    clearInterval(heartT);
    heartT = setInterval(() => ch?.postMessage({ type: 'heartbeat', id }), 3000);
    J.emit?.('tab-role', 'primary');
  };
  const release = () => { primary = false; clearInterval(heartT); J.emit?.('tab-role', 'preview'); };
  const showViewer = () => {
    setReadonly(true);   // najpierw stop zapisu, potem UI — żadnego okna, w którym dwie karty piszą naraz
    if (document.getElementById('tab-viewer')) return;
    const d = document.createElement('div'); d.id = 'tab-viewer';
    d.innerHTML = '<span>Ta karta jest w trybie podglądu — Jarvis działa w innej karcie. Zmiany nie są zapisywane.</span><button id="tab-takeover">Przejmij</button>';
    document.body.appendChild(d);
    document.getElementById('tab-takeover').onclick = () => { claim(); d.remove(); };
  };
  try {
    ch = new BroadcastChannel(CH);
    ch.onmessage = ({ data: m }) => {
      if (!m) return;
      if (m.type === 'heartbeat' && m.id !== id) { clearTimeout(missT); missT = setTimeout(() => { if (!primary) claim(); }, 9000); if (!primary) showViewer(); }
      if (m.type === 'claim' && m.id !== id) { release(); showViewer(); }
    };
    ch.postMessage({ type: 'ping', id });
    setTimeout(() => { if (!primary) claim(); }, 400);
  } catch (e) { primary = true; }
  window.addEventListener('beforeunload', () => { release(); ch?.postMessage({ type: 'gone', id }); });
  return { get primary() { return primary; }, claim, release };
})();

(() => {
const { $, $$, h, esc, icon } = J;
const S = J.state.settings;
J.bootTime = Date.now();
J.applyTheme();

/* =================== BOOT =================== */
const boot = () => new Promise(resolve => {
  const el = $('#boot');
  let entered = false;
  const finish = (via = 'user') => {
    if (entered) return; entered = true; J.bootEnter = null;
    J.booted = true; J.bootVia = via === 'bridge' ? 'bridge' : 'user'; J.bootAt = Date.now();   // desktop_open raportuje to Hermesowi zamiast zgadywania
    try { J.sfx.unlock(); J.sfx.boot(); } catch (e) { /* bez gestu użytkownika dźwięk bywa zablokowany — to nie powód, by nie wejść */ }
    el.classList.add('out'); $('#app').classList.add('on');
    setTimeout(() => el.remove(), 1000);
    resolve();
  };
  /* wejście bez kliknięcia: polecenie z mostu (Hermes z Telegrama) przy karcie otwartej przez autostart.
     Okno zgody rysuje się w #app — pod zasłoną startową nikt nie mógł go kliknąć i każde ryzykowne polecenie kończyło się DENIED. */
  J.bootEnter = () => finish('bridge');
  if (S.skipBoot) {
    $('#bootTitle').textContent = 'JARVIS'; $('#bootBar').style.width = '100%'; $('#bootPct').textContent = '100%';
    const e = $('#bootEnter'); e.classList.add('show');
    const go = () => { removeEventListener('keydown', go); el.removeEventListener('click', go); finish(); };
    addEventListener('keydown', go); el.addEventListener('click', go);
    return;
  }
  $('#bootTitle').innerHTML = [...'JARVIS'].map((c, i) => `<span style="animation-delay:${.3 + i * .09}s">${c}</span>`).join('');
  const lines = [
    'BIOS v2.0.26 · weryfikacja rdzenia…', 'ładowanie jądra neuronowego  <span class="ok">[OK]</span>', 'montowanie warstwy pulpitu  <span class="ok">[OK]</span>',
    'kalibracja reaktora łukowego… 3.2 GJ/s', 'moduł mowy pl-PL  <span class="ok">[OK]</span>', 'synchronizacja: pogoda · rynek · harmonogram',
    'przywracanie pamięci użytkownika (' + J.notes.live().length + ' notatek, ' + J.state.tasks.length + ' zadań)', 'uruchamianie interfejsu holograficznego…', 'wszystkie systemy online  <span class="ok">✓</span>'
  ];
  const log = $('#bootLog'), bar = $('#bootBar');
  let i = 0; let done = false;
  const step = () => {
    if (entered) return;   // wejście z mostu albo z Filmu w trakcie animacji — zasłona już znika, nie ma czego dopisywać
    if (i < lines.length) {
      log.appendChild(h('div', {}, '&gt; ' + lines[i])); i++;
      bar.style.width = (i / lines.length * 100) + '%'; $('#bootPct').textContent = Math.round(i / lines.length * 100) + '%';
      setTimeout(step, 180 + Math.random() * 200);
    } else if (!done) {
      done = true; const e = $('#bootEnter'); e.classList.add('show');
      const go = ev => { if (ev.type === 'keydown' && ev.key === 'Tab') return; removeEventListener('keydown', go); el.removeEventListener('click', go); finish(); };
      addEventListener('keydown', go); el.addEventListener('click', go);
    }
  };
  setTimeout(step, 600);
});

/* =================== TŁO: sieć cząsteczek + FPS =================== */
const RM = matchMedia('(prefers-reduced-motion: reduce)');   // systemowe „ogranicz ruch”
const FX = ['off', 'tool', 'standard', 'cinema'];
J.fx = {
  LEVELS: FX, cap: 3,   // cap = samoczynne ograniczenie po spadku płynności (3 = bez ograniczenia)
  rank() { return Math.min(Math.max(0, FX.indexOf(S.fxLevel || 'standard')), RM.matches ? 0 : 3, J.fx.cap); },
  level() { return FX[J.fx.rank()]; },
  apply() { const lv = J.fx.level(), app = $('#app'); if (!app) return lv; app.dataset.fx = lv; app.classList.toggle('lowfx', J.fx.rank() < 2); document.documentElement.dataset.fx = lv; J.emit('fx', lv); return lv; },
  lower() { const r = J.fx.rank(); if (r <= 1) return false; J.fx.cap = r - 1; J.fx.apply(); J.log('Efekty', 'Niska płynność (FPS < 30 przez 5 s) — obniżam poziom efektów do „' + J.fx.level() + '”', 'warn'); return true; },
  orbits: () => J.fx.rank() >= 2,
  /* „duch” okna: w trybie kinowym zarys okna pojawia się, zanim agent je otworzy */
  ghost(id) { if (J.fx.rank() < 3) return; const el = J.wm.ctx(id)?.el; if (!el) return; const g = h('div', { class: 'win-ghost' }); Object.assign(g.style, { left: el.style.left, top: el.style.top, width: el.offsetWidth + 'px', height: el.offsetHeight + 'px' }); el.parentElement?.appendChild(g); setTimeout(() => g.remove(), 900); }
};
RM.addEventListener?.('change', () => J.fx.apply());
J.on('settings', () => J.fx.apply());
const fx = (() => {
  const cv = $('#fx'), c = cv.getContext('2d');
  let W, H, pts = [], mouse = { x: -999, y: -999 }, frames = 0, last = performance.now();
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.min(70, Math.round(W * H / 26000));
    pts = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35, r: Math.random() * 1.6 + .4 }));
  };
  addEventListener('resize', resize); resize();
  /* spoczynek: brak zadania, Orb bezczynny i 15 s bez ruchu myszy/klawiatury → rysujemy co 3. klatkę (~20/s zamiast 60/s);
     każda aktywność albo zadanie przywraca pełną płynność. Licznik FPS dalej liczy wszystkie klatki (adapt() nie obniża jakości). */
  let activeAt = performance.now(), tick = 0;
  const wake = () => { activeAt = performance.now(); };
  addEventListener('keydown', wake, { passive: true }); addEventListener('wheel', wake, { passive: true }); addEventListener('pointerdown', wake, { passive: true });
  const resting = () => J.engine?.mode === 'IDLE' && !J.engine?.taskId && performance.now() - activeAt > 15000;
  addEventListener('pointermove', e => {
    wake();
    mouse.x = e.clientX; mouse.y = e.clientY;
    const wp = $('#wallpaper'); if (wp) wp.style.transform = `translate(${(e.clientX / W - .5) * -18}px,${(e.clientY / H - .5) * -12}px) scale(1.02)`;
  });
  /* poziom efektów (docs/spec/09-wyglad-stany.md §7): min(ustawienie, systemowe „ogranicz ruch”, samoczynne obniżenie przy FPS < 30 przez 5 s) */
  let lowSince = 0, okSince = 0; J.quality = 'high';
  const adapt = () => {
    const f = J.fps, t = Date.now();
    if (f && f < 30) { okSince = 0; lowSince = lowSince || t; if (t - lowSince > 5000 && J.fx.lower()) lowSince = 0; }
    else { lowSince = 0; if (J.fx.cap < 3 && f >= 55) { okSince = okSince || t; if (t - okSince > 8000) { J.fx.cap = Math.min(3, J.fx.cap + 1); okSince = 0; J.fx.apply(); J.log('Efekty', 'Płynność wróciła — przywracam poziom ' + J.fx.level()); } } else okSince = 0; }
    J.quality = J.fx.rank() >= 2 ? 'high' : 'low';
  };
  const loop = now => {
    if (document.hidden || document.body.classList.contains('cin-under')) { setTimeout(() => requestAnimationFrame(loop), 500); return; }   // w tle i pod Filmem nic nie rysujemy
    frames++;
    if (now - last >= 1000) { J.fps = Math.round(frames * 1000 / (now - last)); frames = 0; last = now; adapt(); }
    if (++tick % 3 && resting()) { requestAnimationFrame(loop); return; }
    c.clearRect(0, 0, W, H);
    const LOW = J.quality === 'low';
    if (S.particles && !LOW && J.fx.rank() >= 2 && !$('#app').classList.contains('focus')) {
      const rgb = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim() || '33,217,255';
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1;
        const dx = mouse.x - p.x, dy = mouse.y - p.y, d = Math.hypot(dx, dy);
        if (d < 160) { p.x -= dx * .004; p.y -= dy * .004; }
      }
      c.lineWidth = .6;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        for (let j = i + 1; j < pts.length; j++) {
          const b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 105) { c.strokeStyle = `rgba(${rgb},${(1 - d / 105) * .07})`; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }
        }
        const dm = Math.hypot(a.x - mouse.x, a.y - mouse.y);
        if (dm < 170) { c.strokeStyle = `rgba(${rgb},${(1 - dm / 170) * .45})`; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(mouse.x, mouse.y); c.stroke(); }
        c.fillStyle = `rgba(${rgb},.75)`; c.beginPath(); c.arc(a.x, a.y, a.r, 0, 7); c.fill();
      }
    }
    const tt = RM.matches ? 3000 : now;   // „ogranicz ruch”: Core i jezioro stoją w miejscu, ale nadal zmieniają kolor i jasność ze stanem
    J.hud.frame(now); orbDraw(tt); flowDraw(tt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { last = performance.now(); frames = 0; } });
  return { resize };
})();

/* =================== CORE: szklana kula, orbity, wiązka, cząstki =================== */
const orbCv = $('#orbCanvas'), oc = orbCv.getContext('2d');
let orbAmp = 0, freq = new Uint8Array(128);
const SZ = 560, C0 = SZ / 2, RB = 108;
const rnd = (() => { let s = 11; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const PART = Array.from({ length: 130 }, () => ({ a: rnd() * 6.283, r: .16 + rnd() * .8, sp: (.12 + rnd() * .55) * (rnd() < .5 ? -1 : 1), s: .5 + rnd() * 1.5, v: rnd() < .4 }));
const SPARK = Array.from({ length: 54 }, () => ({ a: rnd() * 6.283, r: 1.12 + rnd() * .95, ph: rnd() * 6.283, s: .5 + rnd() * 1.4, sp: (rnd() - .5) * .04 }));
const ARCS = Array.from({ length: 18 }, (_, i) => ({ r: .36 + rnd() * .58, a: rnd() * 6.283, len: .3 + rnd() * 1.2, sp: (.25 + rnd() * .9) * (i % 2 ? -1 : 1), w: .8 + rnd() * 1.8, v: rnd() < .45 }));
const RAIN = Array.from({ length: 14 }, () => ({ x: (rnd() - .5) * 60, y: rnd(), l: 6 + rnd() * 18, sp: .2 + rnd() * .5 }));
const ORBITS = [{ rx: 1.55, ry: .40, rot: -14, sp: .00042, ph: 0, v: true }, { rx: 1.40, ry: .34, rot: 11, sp: -.00058, ph: 2, v: false }, { rx: 1.78, ry: .52, rot: -32, sp: .0003, ph: 4, v: true, act: true }];
const TWO = Math.PI * 2;

function orbDraw(t) {
  const LOW = J.quality === 'low';
  const dpr = Math.min(devicePixelRatio || 1, 2);
  if (orbCv.width !== SZ * dpr) orbCv.width = orbCv.height = SZ * dpr;
  oc.setTransform(dpr, 0, 0, dpr, 0, 0); oc.clearRect(0, 0, SZ, SZ);
  const st = J.orb.state, eg = J.engine, an = J.ear.analyser;
  const A = J.rgb(S.accent), V = J.rgb(S.accent2), ov = eg.rgb();
  const col = ov || A;
  let target = st === 'speaking' ? .55 + Math.random() * .45 : st === 'listening' ? .25 : st === 'thinking' ? .35 : st === 'alert' ? .6 : .08;
  if (st !== 'speaking' && st !== 'listening') target = Math.max(target, eg.activity * .8);
  if (st === 'listening' && an) { an.getByteFrequencyData(freq); target = Math.min(1, freq.slice(2, 40).reduce((a, b) => a + b, 0) / 38 / 110); }
  orbAmp += (target - orbAmp) * .12;
  const idle = st === 'idle' && eg.mode === 'IDLE';
  const breath = idle ? .78 + .22 * Math.sin(t / 1600) : 1;
  const act = J.clamp(eg.activity, 0, 1), busy = !!eg.taskId, energy = J.clamp(.3 + act * .95 + orbAmp * .4, 0, 1.4);
  const sp = .6 + energy * 1.6;   // prędkość ruchu elementów

  // — poświata
  let g = oc.createRadialGradient(C0, C0, RB * .5, C0, C0, RB * 2.4);
  g.addColorStop(0, `rgba(${col},${.5 * breath * (.65 + energy * .4)})`); g.addColorStop(.4, `rgba(${V},${.16 + .12 * energy})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  oc.fillStyle = g; oc.fillRect(0, 0, SZ, SZ);

  // — wiązka pionowa (przez całą kulę, do lustra wody) + „cyfrowy deszcz”
  const yTop = C0 - RB - 120, yBot = C0 + RB * 1.37;
  g = oc.createLinearGradient(0, yTop, 0, yBot);
  g.addColorStop(0, `rgba(${A},0)`); g.addColorStop(.28, `rgba(150,210,255,${.7 * breath})`); g.addColorStop(.7, `rgba(150,210,255,${.55 * breath})`); g.addColorStop(1, 'rgba(255,255,255,.95)');
  oc.fillStyle = g; oc.fillRect(C0 - .8, yTop, 1.6, yBot - yTop);
  g = oc.createLinearGradient(0, yTop, 0, yBot);
  g.addColorStop(0, `rgba(${A},0)`); g.addColorStop(.5, `rgba(${A},${.13 * breath})`); g.addColorStop(1, `rgba(${A},.38)`);
  oc.fillStyle = g; oc.fillRect(C0 - 7, yTop, 14, yBot - yTop);
  RAIN.forEach(r => {
    const u = (r.y + t / 1000 * r.sp * (busy ? 1.6 : .7)) % 1, y = yTop + 20 + u * 100;
    oc.fillStyle = `rgba(160,215,255,${.5 * (1 - u) * breath})`; oc.fillRect(C0 + r.x, y, 1, r.l);
  });

  // — orbity (tylna połowa)
  const orbs = ORBITS.filter(o => !o.act || busy);
  const orbitPath = (o, front) => {
    const rot = (o.rot + Math.sin(t / 3800 + o.ph) * 3) * Math.PI / 180, oc_ = o.v ? V : A;
    oc.save(); oc.translate(C0, C0); oc.rotate(rot);
    oc.beginPath(); oc.ellipse(0, 0, RB * o.rx, RB * o.ry, 0, front ? 0 : Math.PI, front ? Math.PI : TWO);
    oc.strokeStyle = `rgba(${oc_},${(front ? .9 : .34) * breath})`; oc.lineWidth = front ? 1.7 : 1.1; oc.shadowColor = `rgba(${oc_},.95)`; oc.shadowBlur = LOW ? 0 : (front ? 12 : 4); oc.stroke(); oc.shadowBlur = 0;
    // cząstka biegnąca po orbicie + ogon
    for (let i = 0; i < 7; i++) {
      const a = t * o.sp * sp * 1.3 + o.ph - i * .07, sn = Math.sin(a);
      if ((sn > 0) !== front) continue;
      oc.fillStyle = `rgba(230,245,255,${(1 - i / 7) * .95})`; oc.beginPath(); oc.arc(Math.cos(a) * RB * o.rx, sn * RB * o.ry, (i ? 1.2 : 2.6), 0, TWO); oc.fill();
    }
    oc.restore();
  };
  if (J.fx.orbits()) orbs.forEach(o => orbitPath(o, false));

  // — kula: korpus
  oc.save(); oc.beginPath(); oc.arc(C0, C0, RB, 0, TWO); oc.clip();
  g = oc.createRadialGradient(C0 - RB * .25, C0 - RB * .35, RB * .05, C0, C0, RB);
  g.addColorStop(0, 'rgba(100,140,255,.20)'); g.addColorStop(.55, 'rgba(10,18,74,.46)'); g.addColorStop(.86, `rgba(${col},.30)`); g.addColorStop(1, `rgba(${V},.58)`);
  oc.fillStyle = g; oc.fillRect(C0 - RB, C0 - RB, RB * 2, RB * 2);
  g = oc.createRadialGradient(C0 + RB * .55, C0 + RB * .6, 0, C0 + RB * .55, C0 + RB * .6, RB * .95);
  g.addColorStop(0, `rgba(${V},${.34 + .2 * energy})`); g.addColorStop(1, `rgba(${V},0)`); oc.fillStyle = g; oc.fillRect(C0 - RB, C0 - RB, RB * 2, RB * 2);
  g = oc.createRadialGradient(C0 - RB * .6, C0 - RB * .5, 0, C0 - RB * .6, C0 - RB * .5, RB * .8);
  g.addColorStop(0, `rgba(70,220,255,${.22 + .1 * energy})`); g.addColorStop(1, 'rgba(70,220,255,0)'); oc.fillStyle = g; oc.fillRect(C0 - RB, C0 - RB, RB * 2, RB * 2);

  // plazma: łuki wirujące w środku (mocniej przy pracy)
  const nArc = LOW ? 5 : idle ? 7 : ARCS.length;
  for (let i = 0; i < nArc; i++) {
    const a = ARCS[i], a0 = a.a + t / 1000 * a.sp * sp;
    oc.beginPath(); oc.arc(C0, C0, RB * a.r, a0, a0 + a.len);
    oc.strokeStyle = `rgba(${a.v ? V : '90,200,255'},${(.18 + .5 * energy) * breath})`; oc.lineWidth = a.w; oc.stroke();
  }
  // cząstki wewnątrz
  const nP = LOW ? 30 : idle ? 46 : PART.length;
  for (let i = 0; i < nP; i++) {
    const p = PART[i], a = p.a + t / 1000 * p.sp * sp, r = RB * p.r;
    oc.fillStyle = `rgba(${p.v ? '200,150,255' : '150,220,255'},${(.25 + .6 * ((i * 37) % 10) / 10) * breath * (.6 + energy * .4)})`;
    oc.beginPath(); oc.arc(C0 + Math.cos(a) * r, C0 + Math.sin(a) * r, p.s, 0, TWO); oc.fill();
  }
  // celownik + pierścienie techniczne
  oc.strokeStyle = 'rgba(140,200,255,.26)'; oc.lineWidth = 1;
  oc.beginPath(); oc.moveTo(C0 - RB * .92, C0); oc.lineTo(C0 - RB * .64, C0); oc.moveTo(C0 + RB * .64, C0); oc.lineTo(C0 + RB * .92, C0); oc.moveTo(C0, C0 - RB * .92); oc.lineTo(C0, C0 - RB * .64); oc.moveTo(C0, C0 + RB * .64); oc.lineTo(C0, C0 + RB * .92); oc.stroke();
  oc.save(); oc.translate(C0, C0); oc.rotate(t / 12000 * sp);
  for (let i = 0; i < 72; i++) { oc.rotate(TWO / 72); oc.fillStyle = `rgba(150,215,255,${i % 6 ? .18 : .5})`; oc.fillRect(RB * .93, -.5, i % 6 ? 3 : 6, 1); }
  oc.restore();
  oc.setLineDash([2, 7]); oc.lineDashOffset = -t / 70; oc.strokeStyle = 'rgba(160,215,255,.5)'; oc.lineWidth = 1.2; oc.beginPath(); oc.arc(C0, C0, RB * .64, 0, TWO); oc.stroke(); oc.setLineDash([]);
  for (let i = 0; i < 4; i++) {   // grube łuki (cyjan) wokół napisu
    const a0 = t / 1000 * (i % 2 ? -.9 : .7) * sp + i * 1.9;
    oc.beginPath(); oc.arc(C0, C0, RB * (.78 - (i > 1 ? .07 : 0)), a0, a0 + .95 - i * .1);
    oc.strokeStyle = `rgba(70,225,255,${.95 * breath})`; oc.lineWidth = 3.4 - i * .3; oc.shadowColor = 'rgba(70,225,255,.9)'; oc.shadowBlur = LOW ? 0 : (8); oc.stroke(); oc.shadowBlur = 0;
  }
  // główny pierścień z napisem
  oc.beginPath(); oc.arc(C0, C0, RB * .5, 0, TWO);
  oc.strokeStyle = `rgba(${ov || '120,190,255'},${.95 * breath})`; oc.lineWidth = 3 + orbAmp * 3; oc.shadowColor = `rgba(${col},1)`; oc.shadowBlur = LOW ? 0 : (16); oc.stroke(); oc.shadowBlur = 0;
  oc.beginPath(); oc.arc(C0, C0, RB * .5 - 6, 0, TWO); oc.strokeStyle = `rgba(${col},.22)`; oc.lineWidth = 1; oc.stroke();
  // odblask
  g = oc.createLinearGradient(C0 - RB * .7, C0 - RB * .9, C0 + RB * .1, C0 - RB * .1);
  g.addColorStop(0, 'rgba(255,255,255,.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  oc.fillStyle = g; oc.beginPath(); oc.ellipse(C0 - RB * .32, C0 - RB * .52, RB * .5, RB * .26, -.5, 0, TWO); oc.fill();
  oc.restore();

  // — krawędź kuli (fresnel)
  g = oc.createLinearGradient(C0 - RB, C0 - RB, C0 + RB, C0 + RB);
  g.addColorStop(0, 'rgba(130,230,255,.98)'); g.addColorStop(.5, `rgba(${col},.9)`); g.addColorStop(1, `rgba(${V},.98)`);
  oc.beginPath(); oc.arc(C0, C0, RB, 0, TWO); oc.strokeStyle = g; oc.lineWidth = 2.8; oc.shadowColor = `rgba(${col},1)`; oc.shadowBlur = LOW ? 0 : (22); oc.stroke(); oc.shadowBlur = 0;
  oc.beginPath(); oc.arc(C0, C0, RB - 6, 0, TWO); oc.strokeStyle = 'rgba(200,230,255,.22)'; oc.lineWidth = 1; oc.stroke();
  // pierścień reagujący na głos / mikrofon (fala)
  for (let ring = 0; ring < 2; ring++) {
    oc.beginPath();
    const N = 140;
    for (let i = 0; i <= N; i++) {
      const a = i / N * TWO; let k;
      if (st === 'listening' && an) k = (freq[(i % 70) + 2] / 255) * 26 * (ring ? .6 : 1);
      else k = (Math.sin(a * 6 + t / (ring ? 420 : 300)) * .5 + Math.sin(a * 11 - t / 260) * .35 + Math.sin(a * 3 + t / 900) * .4) * orbAmp * 22 * (ring ? .7 : 1);
      const r = RB + 9 + ring * 8 + k; i ? oc.lineTo(C0 + Math.cos(a) * r, C0 + Math.sin(a) * r) : oc.moveTo(C0 + Math.cos(a) * r, C0 + Math.sin(a) * r);
    }
    oc.closePath(); oc.strokeStyle = `rgba(${col},${(ring ? .16 : .34 + orbAmp * .4) * breath})`; oc.lineWidth = ring ? 1 : 1.3; oc.stroke();
  }
  if (st === 'thinking' || eg.mode === 'THINKING') for (let k = 0; k < 3; k++) {
    const a0 = t / (300 + k * 140) * (k % 2 ? -1 : 1) + k * 2;
    oc.beginPath(); oc.arc(C0, C0, RB + 26 + k * 9, a0, a0 + .9); oc.strokeStyle = `rgba(${col},${.7 - k * .18})`; oc.lineWidth = 2; oc.stroke();
  }

  // — orbity (przednia połowa)
  if (J.fx.orbits()) orbs.forEach(o => orbitPath(o, true));

  // — iskry wokół
  SPARK.forEach(s => {
    const a = s.a + t * s.sp / 1000, r = RB * s.r, tw = .5 + .5 * Math.sin(t / 520 * s.s + s.ph);
    oc.fillStyle = `rgba(${s.ph > 3.1 ? '190,150,255' : '150,215,255'},${tw * .75 * breath})`; oc.beginPath(); oc.arc(C0 + Math.cos(a) * r, C0 + Math.sin(a) * r * .92, s.s * .9, 0, TWO); oc.fill();
  });
  // — romby płynące po wiązce (tylko gdy trwa zadanie)
  if (busy) for (let i = 0; i < 3; i++) {
    const u = ((t / 1500) + i / 3) % 1, y = C0 + RB * 1.02 + u * RB * .32, sz = 3.4 * (1 - u * .4);
    oc.save(); oc.translate(C0, y); oc.rotate(Math.PI / 4); oc.fillStyle = `rgba(${i % 2 ? '190,140,255' : '120,215,255'},${.95 * (1 - u * .5)})`; oc.shadowColor = `rgba(${col},1)`; oc.shadowBlur = LOW ? 0 : (10); oc.fillRect(-sz, -sz, sz * 2, sz * 2); oc.restore();
  }
}

/* =================== SCENA: jezioro (odbicie, fale), linie obwodów HUD, puls zakończenia =================== */
const flowCv = $('#flowCanvas'), fc = flowCv.getContext('2d');
const refCv = document.createElement('canvas'), rc = refCv.getContext('2d');
const easeOut = x => 1 - Math.pow(1 - x, 3);
const TONE = { blue: '90,165,255', purple: '178,116,255', teal: '52,232,212', green: '62,235,152', amber: '255,184,77' };
let lineA = 0;
const pointAt = (pts, u) => {
  let tot = 0; const L = []; for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); L.push(l); tot += l; }
  let d = J.clamp(u, 0, 1) * tot;
  for (let i = 0; i < L.length; i++) { if (d <= L[i] || i === L.length - 1) { const f = L[i] ? d / L[i] : 0; return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f }; } d -= L[i]; }
};
function reflect(dpr, sc, now) {
  const yA = C0 + (sc.foot - sc.cy) / sc.k, hR = Math.min(300, yA);
  const w = SZ * dpr, hh = Math.round(hR * dpr);
  if (refCv.width !== w || refCv.height !== hh) { refCv.width = w; refCv.height = hh; }
  rc.setTransform(1, 0, 0, 1, 0, 0); rc.globalCompositeOperation = 'source-over'; rc.clearRect(0, 0, w, hh);
  for (let r = 0; r < hR; r += 3) {
    const sy = yA - r - 3; if (sy < 0) break;
    const wob = Math.sin(r * .34 + now / 430) * (.8 + r * .022) + Math.sin(r * .1 - now / 950) * 1.4;
    rc.drawImage(orbCv, 0, sy * dpr, w, 3 * dpr, wob * dpr, r * dpr, w, 3 * dpr);
  }
  rc.globalCompositeOperation = 'destination-in';
  const g = rc.createLinearGradient(0, 0, 0, hh); g.addColorStop(0, 'rgba(0,0,0,.95)'); g.addColorStop(.5, 'rgba(0,0,0,.42)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  rc.fillStyle = g; rc.fillRect(0, 0, w, hh);
  fc.save(); fc.globalCompositeOperation = 'screen'; fc.drawImage(refCv, sc.cx - C0 * sc.k, sc.foot, SZ * sc.k, hR * sc.k); fc.restore();
}
let flowFrame = 0;
function flowDraw(now) {
  const sc = J.hud.scene; if (!sc.W) return;
  const LOW = J.quality === 'low'; flowFrame++;
  const dpr = Math.min(devicePixelRatio || 1, 2), W = sc.W, H = sc.H, { cx, cy, R, k, foot } = sc;
  if (flowCv.width !== Math.round(W * dpr) || flowCv.height !== Math.round(H * dpr)) { flowCv.width = Math.round(W * dpr); flowCv.height = Math.round(H * dpr); }
  fc.setTransform(dpr, 0, 0, dpr, 0, 0); fc.clearRect(0, 0, W, H);
  const eg = J.engine; flowCv.classList.toggle('over', !!eg.taskId);
  const wall = Date.now(), A = J.rgb(S.accent), V = J.rgb(S.accent2), col = eg.rgb() || A, act = eg.activity, busy = !!eg.taskId;

  // — jezioro: odbicie kuli, poświata u podstawy wiązki, fale
  if (!LOW || flowFrame % 2 === 0) reflect(dpr, sc, now); else { fc.save(); fc.globalCompositeOperation = 'screen'; fc.drawImage(refCv, sc.cx - C0 * sc.k, sc.foot, SZ * sc.k, refCv.height / dpr * sc.k); fc.restore(); }
  fc.save(); fc.translate(cx, foot); fc.scale(1, .17);
  let g = fc.createRadialGradient(0, 0, 0, 0, 0, 190 * k); g.addColorStop(0, `rgba(170,215,255,${.55 + act * .2})`); g.addColorStop(.35, `rgba(${A},.28)`); g.addColorStop(1, `rgba(${A},0)`);
  fc.fillStyle = g; fc.fillRect(-200 * k, -200 * k, 400 * k, 400 * k); fc.restore();
  for (let i = 0; i < 8; i++) {
    const ph = ((now / (busy ? 2300 : 3900)) + i / 8) % 1, rx = (22 + ph * 310) * k, ry = rx * .078, a = Math.pow(1 - ph, 1.5) * (.55 + act * .4);
    const c = i % 3 === 2 ? V : '120,195,255';
    fc.beginPath(); fc.ellipse(cx, foot, rx, ry, 0, 0, TWO); fc.strokeStyle = `rgba(${c},${a})`; fc.lineWidth = 1.3; fc.shadowColor = `rgba(${c},.9)`; fc.shadowBlur = LOW ? 0 : (9); fc.stroke();
  }
  fc.shadowBlur = 0;
  [46, 92, 150, 214].forEach((r0, i) => { fc.beginPath(); fc.ellipse(cx, foot, r0 * k, r0 * k * .078, 0, 0, TWO); fc.strokeStyle = `rgba(${i % 2 ? V : '130,205,255'},${.34 - i * .06})`; fc.lineWidth = 1; fc.stroke(); });
  fc.beginPath(); fc.ellipse(cx, foot, 30 * k, 4.4 * k, 0, 0, TWO); fc.fillStyle = 'rgba(210,235,255,.9)'; fc.shadowColor = `rgba(${A},1)`; fc.shadowBlur = LOW ? 0 : (16); fc.fill(); fc.shadowBlur = 0;

  // — puls zakończenia Core (tylko po realnym task.*)
  const ft = wall - eg.flash.t;
  if (eg.flash.t && ft < 1500) {
    const q = ft / 1500, c = eg.flash.kind === 'ok' ? '57,229,154' : eg.flash.kind === 'err' ? '255,184,77' : '160,190,220';
    fc.lineWidth = 2.4 * (1 - q) + .6; fc.strokeStyle = `rgba(${ft < 180 ? '255,255,255' : c},${(1 - q) * .9})`;
    fc.beginPath(); fc.arc(cx, cy, R + 8 + easeOut(q) * 170 * k, 0, TWO); fc.stroke();
  }

  // — linie obwodów HUD: Core ↔ karty (świecą tylko przy realnej aktywności karty)
  lineA += ((J.hud.visible ? 1 : 0) - lineA) * .09; if (lineA < .01) return;
  const cards = J.hud.CARDS;
  cards.forEach((c, i) => {
    if (!c.pts) return;
    const s = c.st?.s || 'idle', tone = TONE[s === 'failed' ? 'amber' : c.tone];
    const a = (s === 'active' ? .9 : s === 'failed' ? .6 : s === 'done' ? .36 : .13) * lineA;
    fc.beginPath(); c.pts.forEach((p, j) => j ? fc.lineTo(p.x, p.y) : fc.moveTo(p.x, p.y));
    fc.lineJoin = 'round'; fc.lineWidth = s === 'active' ? 1.9 : 1.3; fc.strokeStyle = `rgba(${tone},${a})`;
    fc.shadowColor = `rgba(${tone},.9)`; fc.shadowBlur = LOW ? 0 : (s === 'active' ? 11 : s === 'done' ? 4 : 0); fc.stroke(); fc.shadowBlur = 0;
    [c.A, c.B].forEach(p => { fc.beginPath(); fc.arc(p.x, p.y, 2.6, 0, TWO); fc.fillStyle = `rgba(${tone},${Math.min(1, a + .15)})`; fc.shadowColor = `rgba(${tone},1)`; fc.shadowBlur = LOW ? 0 : (s === 'idle' ? 0 : 8); fc.fill(); fc.shadowBlur = 0; });
    if (s === 'active') for (let j = 0; j < 2; j++) {     // impulsy płyną tylko, gdy karta faktycznie pracuje
      const p = pointAt(c.pts, ((now / 1400) + j * .5 + i * .17) % 1);
      fc.beginPath(); fc.arc(p.x, p.y, 2.5, 0, TWO); fc.fillStyle = `rgba(255,255,255,${.9 * lineA})`; fc.shadowColor = `rgba(${tone},1)`; fc.shadowBlur = LOW ? 0 : (12); fc.fill(); fc.shadowBlur = 0;
    }
  });
  // pakiety zdarzeń: start (Core → karta) i wynik (karta → Core)
  eg.packets = eg.packets.filter(p => wall - p.t0 < 900);
  for (const p of eg.packets) {
    const q = easeOut((wall - p.t0) / 900);
    J.hud.cardsFor(p).forEach(id => {
      const c = cards.find(x => x.id === id); if (!c?.pts) return;
      const pt = pointAt(c.pts, p.dir === 'out' ? 1 - q : q);
      fc.beginPath(); fc.arc(pt.x, pt.y, p.dir === 'in' ? 3.4 : 2.6, 0, TWO); fc.fillStyle = `rgba(255,255,255,${(1 - q * .6) * lineA})`; fc.shadowColor = `rgba(${col},1)`; fc.shadowBlur = LOW ? 0 : (13); fc.fill(); fc.shadowBlur = 0;
    });
  }
}

/* =================== ZEGAR / POGODA / WĘZŁY =================== */
const clock = () => {
  const d = new Date();
  $('#clockBig').textContent = d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  $('#dateLine').textContent = d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
};
const sysWeather = d => {
  const [ico] = J.wxInfo(d.current.weather_code);
  $('#wxIco').textContent = ico; $('#wxTemp').textContent = Math.round(d.current.temperature_2m) + '°C'; $('#wxCity').textContent = d.city;
};
J.on('weather', sysWeather);
const loadWeather = () => J.weather.fetch().catch(() => { $('#wxTemp').textContent = 'offline'; });

/* =================== PULPIT: ikony i dok =================== */
const BUILTIN = [['chat', 'Czat', 'blue'], ['notes', 'Notatnik', 'dark'], ['market', 'Lista tokenów', 'blue'], ['schedule', 'Harmonogram', 'blue'], ['monitor', 'Wynik zadania', 'teal']];
const TONES = { chat: 'blue', notes: 'orange', market: 'teal', schedule: 'indigo', monitor: 'green', weather: 'sky', terminal: 'dark', settings: 'dark', calc: 'purple', timer: 'purple', library: 'dark' };
const tile = (name, tone) => `<span class="tile" data-tone="${tone}">${icon(name)}</span>`;
const renderIcons = () => {
  const rail = $('#iconRail'); rail.innerHTML = '';
  BUILTIN.forEach(([id, name, tone], i) => {
    const b = h('button', { class: 'desktop-icon', 'data-app': id, style: `animation-delay:${i * .06}s` }, `${tile(J.apps[id].icon, tone)}<span class="lbl">${esc(name)}</span>${id === 'chat' ? '<i class="ic-dot" id="railChatDot"></i>' : ''}`);
    b.onclick = () => id === 'chat' ? J.chatPanel.toggle() : J.wm.open(id); rail.appendChild(b);
  });
  J.state.shortcuts.forEach((s, i) => {
    const b = h('button', { class: 'desktop-icon', 'data-sc': s.id, style: `animation-delay:${(i + 5) * .06}s`, title: s.url || '' }, `${tile(s.icon || 'star', 'blue')}<span class="lbl"></span>`);
    b.querySelector('.lbl').textContent = s.name;
    b.onclick = () => J.shortcuts.run(s); rail.appendChild(b);
  });
  const add = h('button', { class: 'desktop-icon' }, `${tile('plus', 'dark')}<span class="lbl">Dodaj widget</span>`);
  add.onclick = () => { const r = add.getBoundingClientRect(); widgetMenu(r.right + 8, r.top); }; rail.appendChild(add);
  syncStatus();
};
J.on('shortcuts', renderIcons);

const PINNED = J.DOCK_DEFAULT = ['chat', 'notes', 'market', 'schedule', 'monitor'];
const LABEL = { chat: 'Czat', notes: 'Notatnik', market: 'Tokeny', schedule: 'Harmonogram', weather: 'Pogoda', terminal: 'Terminal', monitor: 'Wynik', calc: 'Kalkulator', timer: 'Minutnik', settings: 'Ustawienia', library: 'Menu' };
const renderDock = () => {
  const d = $('#dock'); d.innerHTML = '';
  const btn = id => {
    const isChat = id === 'chat';
    const b = h('button', { 'data-app': id, title: J.apps[id].title, 'aria-label': J.apps[id].title }, `${tile(J.apps[id].icon, TONES[id] || 'blue')}<span>${LABEL[id] || J.apps[id].title}</span>`);
    b.onclick = () => isChat ? J.chatPanel.toggle() : J.wm.toggle(id);
    const on = isChat ? !!J.chatPanel?.isOpen : J.wm.isOpen(id);
    b.classList.toggle('running', on); b.classList.toggle('focused', !isChat && J.wm.isFocused(id) && !J.wm.isMin(id));
    return b;
  };
  const lib = h('button', { class: 'plain', title: 'Wszystkie aplikacje' }, icon('grid')); lib.onclick = () => J.wm.toggle('library'); d.appendChild(lib);
  d.appendChild(h('span', { class: 'sep' }));
  const order = (J.state.settings.dockOrder || []).filter(id => J.apps[id] && !J.apps[id].widget), pinned = order.length ? order : PINNED;
  pinned.forEach(id => d.appendChild(btn(id)));
  const extra = J.wm.list().filter(id => !pinned.includes(id) && id !== 'library');
  extra.forEach(id => d.appendChild(btn(id)));
  d.appendChild(h('span', { class: 'sep' }));
  const w = h('button', { class: 'plain', title: 'Nowy widget na pulpicie' }, icon('plus')); w.onclick = () => { const r = w.getBoundingClientRect(); widgetMenu(r.left, r.top - 130); }; d.appendChild(w);
};
J.on('wm', renderDock);
/* dok klawiaturą: jedno miejsce w kolejności Tab, strzałki między ikonami (roving tabindex), Shift F10 = menu */
$('#dock').addEventListener('keydown', e => {
  const l = $$('#dock button'); const i = l.indexOf(document.activeElement); if (i < 0) return;
  const k = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'Home' ? -i : e.key === 'End' ? l.length - 1 - i : 0;
  if (k) { e.preventDefault(); const n = l[(i + k + l.length) % l.length]; l.forEach(b => b.tabIndex = -1); n.tabIndex = 0; n.focus(); }
});
J.on('wm', () => { const l = $$('#dock button'); l.forEach((b, i) => b.tabIndex = i === 0 ? 0 : -1); });

/* =================== WIDGETY: menu tworzenia =================== */
const widgetMenu = (x, y) => ctxMenu(x, y, [...Object.entries(J.widgets.TYPES).filter(([k]) => k !== 'spec').map(([k, t]) => ({ ic: t.icon, t: 'Nowy widget: ' + t.label, run: () => J.widgets.create(k, { title: t.label }) })),
  { ic: 'bolt', t: 'Widget z opisu…', run: async () => { const d = prompt('Opisz widget (np. „top 5 tokenów”, „mini wykres BTC”, „pogoda i zadania na dziś”, „odliczanie do urlopu 15 października”):'); if (!d || !d.trim()) return; const r = await J.uiRun('widget_build', { prompt: d.trim() }, { quiet: true }); if (!r.ok) { if (J.aiReady()) J.brain.handle('Zbuduj widget na pulpicie (widget_build): ' + d.trim()); else J.toast(r.text); } } },
  { ic: 'chart', t: 'Wykres…', run: () => ctxMenu(x, y, [['crypto', 'Kurs BTC'], ['weather_hours', 'Temperatura'], ['tasks_week', 'Zadania w tygodniu'], ['activity', 'Aktywność'], ['cost', 'Koszt Hermesa'], ['jev_confidence', 'Pewność Jeva']].map(([s, t]) => ({ ic: 'chart', t, run: () => J.uiRun('chart_show', { source: s }) }))) }]);

/* =================== MINIMAPA OKIEN (opcjonalna, Ustawienia → Interfejs) =================== */
J.minimap = (() => {
  let box = null;
  const draw = () => {
    if (!S.minimap) { box?.remove(); box = null; return; }
    const desk = $('#desktop') || $('.desktop'); if (!desk) return;
    if (!box) { box = h('div', { class: 'minimap', role: 'navigation', 'aria-label': 'Minimapa okien' }); document.body.appendChild(box); }
    const d = desk.getBoundingClientRect(), k = 150 / Math.max(1, d.width); box.style.height = Math.round(d.height * k) + 'px'; box.innerHTML = '';
    J.wm.info().filter(w => !w.min).forEach(w => { const r = h('button', { class: 'mm-w' + (w.focused ? ' on' : ''), title: w.title, 'aria-label': w.title }); Object.assign(r.style, { left: Math.round(w.x * k) + 'px', top: Math.round(w.y * k) + 'px', width: Math.max(6, Math.round(w.w * k)) + 'px', height: Math.max(5, Math.round(w.h * k)) + 'px' }); r.onclick = () => J.wm.open(w.id); box.appendChild(r); });
  };
  J.on('wm', draw); J.on('wm-resize', J.debounce(draw, 120)); J.on('settings', draw);
  return { draw };
})();

/* =================== PALETA POLECEŃ =================== */
const palette = (() => {
  const bg = $('#paletteBg'), inp = $('#paletteInput'), list = $('#paletteList');
  let items = [], sel = 0;
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
  /* dopasowanie rozmyte: podciąg z premią za początek słowa i ciągłość */
  const fz = (q, text) => { if (!q) return 1; const t = norm(text); if (t.includes(q)) return 100 - t.indexOf(q) * .5 + (t.startsWith(q) ? 20 : 0); let i = 0, score = 0, streak = 0; for (const ch of t) { if (ch === q[i]) { i++; streak++; score += 2 + streak + (i === 1 || t[t.indexOf(ch) - 1] === ' ' ? 3 : 0); if (i === q.length) return score; } else streak = 0; } return 0; };
  const remember = it => { const l = (J.state.ui.recent || []).filter(x => x !== it.t); l.unshift(it.t); J.state.ui.recent = l.slice(0, 6); J.save(); };
  const base = () => [
    ...Object.entries(J.apps).filter(([, a]) => !a.widget).map(([id, a]) => ({ g: 'Aplikacje', ic: a.icon, t: a.title, k: id + ' ' + (LABEL[id] || ''), run: () => J.wm.open(id) })),
    { g: 'Akcje', ic: 'mic', t: 'Mów do Jarvisa', s: 'Ctrl Spacja', run: () => J.ear.start() },
    ...Object.entries(J.widgets.TYPES).map(([k, t]) => ({ g: 'Widgety', ic: t.icon, t: 'Nowy widget: ' + t.label, run: () => J.widgets.create(k, { title: t.label }) })),
    { g: 'Akcje', ic: 'history', t: 'Pokaż / ukryj Process Log', s: 'Alt 2', run: () => J.proc.toggle() },
    { g: 'Akcje', ic: 'chat', t: 'Pokaż / ukryj czat', s: 'Alt 1', run: () => J.chatPanel.toggle() },
    { g: 'Akcje', ic: 'notes', t: 'Nowa notatka', run: () => { const n = J.notes.add('Nowa notatka', ''); J.wm.open('notes', n.id); } },
    { g: 'Akcje', ic: 'timer', t: 'Minutnik 5 minut', run: () => { J.timer.start(300, 'Minutnik 5 min'); J.wm.open('timer'); } },
    { g: 'Akcje', ic: 'timer', t: 'Pomodoro 25 minut', run: () => { J.timer.start(1500, 'Pomodoro'); J.wm.open('timer'); } },
    { g: 'Akcje', ic: 'image', t: 'Zmień tapetę', run: () => J.actions.set_wallpaper({}) },
    { g: 'Akcje', ic: 'sun', t: 'Następny motyw kolorystyczny', run: nextTheme },
    { g: 'Akcje', ic: 'focus', t: 'Tryb skupienia', run: () => J.setFocus(!$('#app').classList.contains('focus')) },
    { g: 'Akcje', ic: 'min', t: 'Pokaż pulpit (zminimalizuj okna)', run: () => J.wm.minimizeAll() },
    { g: 'Akcje', ic: 'close', t: 'Zamknij wszystkie okna', run: () => J.wm.closeAll() },
    { g: 'Akcje', ic: 'code', t: 'Matrix', run: () => J.matrix() },
    ...J.registry.list(c => c.palette !== false && !['open_app'].includes(c.id) && !(c.args.required || []).length).map(c => ({ g: c.group, ic: c.id.startsWith('notes') ? 'notes' : c.id.startsWith('tasks') || c.id === 'add_task' ? 'calendar' : c.id.startsWith('wm') || c.id.startsWith('layout') ? 'max' : c.id.startsWith('memory') ? 'star' : c.id.startsWith('files') ? 'folder' : c.id.includes('weather') ? 'weather' : c.id.includes('crypto') || c.id.includes('market') ? 'market' : 'bolt', t: c.label, k: c.examples.join(' '), run: () => J.registry.run(c.id, {}, { source: 'ui' }).then(r => J.toast(r.text)) })),
    ...J.state.shortcuts.map(s => ({ g: 'Skróty', ic: s.icon || 'star', t: s.name, s: s.url || '', run: () => J.shortcuts.run(s) })),
    ...J.notes.live().slice(0, 20).map(n => ({ g: 'Notatki', ic: 'notes', t: n.title || 'Bez tytułu', k: n.body.slice(0, 200), run: () => J.wm.open('notes', n.id) }))
  ];
  /* ~200 pozycji (polecenia, aplikacje, notatki) składanych przy KAŻDYM klawiszu — przy szybkim pisaniu jedna lista na 2 s */
  let baseCache = null, baseAt = 0;
  const getBase = () => { if (!baseCache || Date.now() - baseAt > 2000) { baseCache = base(); baseAt = Date.now(); } return baseCache; };
  const TYPE_G = { apps: ['Aplikacje', null], notes: ['Notatki', 'notes'], tasks: ['Zadania', 'calendar'], widgets: ['Widgety', 'list'], shortcuts: ['Skróty', 'link'], settings: ['Ustawienia', 'settings'], commands: ['Polecenia', 'bolt'], memory: ['Pamięć', 'brain'], chat: ['Rozmowy', 'chat'], files: ['Pliki', 'doc'] };
  const hitItem = hit => ({ g: TYPE_G[hit.type][0], ic: TYPE_G[hit.type][1] || J.apps[hit.id]?.icon || 'star', t: hit.title, s: hit.sub, key: hit.type + ':' + hit.id, open: hit.open, run: () => J.search.open(hit) });
  const pinned = () => (J.state.ui.pinned = J.state.ui.pinned || []);
  let seq = 0;
  const render = () => {
    const raw = inp.value.trim(), q0 = norm(raw), my = ++seq;
    const all = getBase();
    const prefix = /^[>#@?]/.test(raw) ? raw[0] : '', q = norm(prefix ? raw.slice(1).trim() : raw);
    if (prefix === '?') {
      items = (J.KEYS || []).map(([k, t]) => ({ g: 'Skróty klawiszowe', ic: 'bolt', t, s: k, run: () => { } }));
    } else if (!q0) {
      const rec = (J.state.ui.recentViews || []).slice(0, 8).map(r => ({ g: 'Ostatnie', ic: J.apps[r.app]?.icon || 'history', t: r.title, key: 'recent:' + r.app + ':' + (r.target || ''), run: () => J.registry.run(r.view ? 'app_view' : 'open_app', r.view ? { app: r.app, view: r.view, target: r.target || undefined } : { app: r.app }, { source: 'ui' }) }));
      const pins = pinned().map(p => { if (p.open) return { g: 'Przypięte', ic: p.ic, t: p.t, key: p.k, open: p.open, run: () => J.search.open({ open: p.open }) }; const b0 = all.find(it => it.t === p.t); return b0 ? { ...b0, g: 'Przypięte', key: p.k } : null; }).filter(Boolean);
      items = [...pins, ...rec, ...all];
    } else if (prefix) {
      const types = { '>': ['commands'], '#': ['notes'], '@': ['settings'] }[prefix];
      items = J.search.sync(q, types).sort((a, b) => b.score - a.score).slice(0, 40).map(hitItem);
      if (prefix === '>') { const m = J.registry.match(raw.slice(1))[0]; if (m) items.unshift({ g: 'Wykonaj', ic: 'bolt', t: m.cmd.label, s: 'Enter', run: () => J.brain.handle(raw.slice(1)) }); }
    } else {
      items = all.map(it => ({ it, sc: Math.max(fz(q, it.t), fz(q, it.k || '') * .6) })).filter(x => x.sc > 0).sort((a, b) => b.sc - a.sc).map(x => x.it);
      const m = J.registry.match(raw)[0];
      if (m) items.unshift({ g: 'Wykonaj', ic: 'bolt', t: m.cmd.label + (Object.keys(m.args).length ? ': ' + Object.values(m.args).map(v => Array.isArray(v) ? v.join(', ') : String(v)).join(' · ').slice(0, 60) : ''), s: 'Enter', run: () => J.registry.run(m.id, m.args, { source: 'ui' }).then(r => { J.toast(r.text); if (r.ui?.highlight) J.ui.highlight(r.ui.highlight); }) });
      /* wyniki z danych (notatki, zadania, widgety, skróty, ustawienia) zaraz po poleceniach; pamięć i rozmowy dochodzą asynchronicznie */
      const byType = {}; J.search.sync(q, ['notes', 'tasks', 'widgets', 'shortcuts', 'settings']).sort((a, b) => b.score - a.score).forEach(hh => { (byType[hh.type] = byType[hh.type] || []).push(hh); });
      const data = Object.values(byType).flatMap(l => l.slice(0, 8)).map(hitItem).filter(it => !items.some(x => x.t === it.t && x.g === it.g));
      items.splice(items[0]?.g === 'Wykonaj' ? 1 : 0, 0, ...data);
      J.search.query(raw, { types: ['memory', 'chat'], limit: 10 }).then(extra => { if (my !== seq || !extra.length || !bg.classList.contains('open')) return; const add = extra.map(hitItem); const at = items.findIndex(it => it.g === 'Jarvis'); items.splice(at < 0 ? items.length : at, 0, ...add); draw(); }).catch(() => { });
      items.push({ g: 'Jarvis', ic: 'chat', t: 'Zapytaj Jarvisa: „' + raw + '”', s: 'Enter', run: () => J.brain.handle(raw), jar: true });
      items.push({ g: 'Jarvis', ic: 'globe', t: 'Szukaj w Google: ' + raw, run: () => window.open('https://www.google.com/search?q=' + encodeURIComponent(raw), '_blank', 'noopener') });
    }
    draw();
  };
  const draw = () => {
    sel = J.clamp(sel, 0, items.length - 1);
    list.innerHTML = ''; let g = '';
    items.forEach((it, i) => {
      if (it.g !== g) { g = it.g; list.appendChild(h('div', { class: 'pgroup' }, esc(g))); }
      const pk = it.key || ('item:' + it.t), isPin = pinned().some(p => p.k === pk);
      const b = h('button', { class: 'pitem' + (i === sel ? ' sel' : '') }, `<span class="pi">${icon(it.ic)}</span><span></span>${it.s ? `<small></small>` : ''}<i class="pstar${isPin ? ' on' : ''}" title="${isPin ? 'Odepnij' : 'Przypnij w palecie'}">★</i>`);
      b.children[1].textContent = it.t; if (it.s) b.querySelector('small').textContent = it.s;
      b.querySelector('.pstar').onclick = ev => { ev.stopPropagation(); const l = pinned(), k = l.findIndex(p => p.k === pk); if (k >= 0) l.splice(k, 1); else if (l.length < 12) l.push({ k: pk, t: it.t, ic: it.ic, open: it.open || null }); else J.toast('Maksymalnie 12 przypiętych'); J.save(); draw(); };
      b.onclick = () => exec(i); b.onmousemove = () => { if (sel !== i) { sel = i; mark(); } };
      list.appendChild(b);
    });
  };
  const mark = () => $$('.pitem', list).forEach((b, i) => b.classList.toggle('sel', i === sel));
  const exec = i => { const it = items[i]; if (!it) return; close(); J.sfx.click(); if (!it.jar && it.g !== 'Jarvis' && it.g !== 'Wykonaj') remember(it); it.run(); };
  const open = (query) => { bg.classList.add('open'); inp.value = query || ''; sel = 0; render(); setTimeout(() => inp.focus(), 30); };
  const close = () => { bg.classList.remove('open'); inp.blur(); };
  inp.addEventListener('input', () => { sel = 0; render(); });
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { sel = (sel + 1) % items.length; mark(); list.children && $$('.pitem', list)[sel]?.scrollIntoView({ block: 'nearest' }); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = (sel - 1 + items.length) % items.length; mark(); $$('.pitem', list)[sel]?.scrollIntoView({ block: 'nearest' }); e.preventDefault(); }
    else if (e.key === 'Enter') { e.preventDefault(); exec(sel); }
    else if (e.key === 'Escape') { e.stopPropagation(); close(); }
  });
  bg.addEventListener('pointerdown', e => { if (e.target === bg) close(); });
  return { open, close, get isOpen() { return bg.classList.contains('open'); } };
})();
J.palette = palette;

function nextTheme() {
  const keys = Object.keys(J.THEMES), cur = keys.findIndex(k => J.THEMES[k][0] === S.accent);
  const k = keys[(cur + 1) % keys.length]; J.actions.set_theme({ color: k }); J.toast('Motyw: ' + k);
}

/* =================== MENU KONTEKSTOWE =================== */
let ctxEl = null;
const closeCtx = () => { ctxEl?.remove(); ctxEl = null; };
const ctxMenu = (x, y, entries) => {
  closeCtx();
  ctxEl = h('div', { class: 'ctx' });
  entries.forEach(e => {
    if (e === '-') return ctxEl.appendChild(h('hr'));
    const b = h('button', { class: e.danger ? 'danger' : '' }, `${icon(e.ic, 'width="14" height="14"')}<span></span>`);
    b.querySelector('span').textContent = e.t; b.onclick = () => { closeCtx(); e.run(); };
    ctxEl.appendChild(b);
  });
  $('#app').appendChild(ctxEl);
  const r = ctxEl.getBoundingClientRect();
  ctxEl.style.left = Math.min(x, innerWidth - r.width - 8) + 'px'; ctxEl.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
};
addEventListener('pointerdown', e => { if (ctxEl && !ctxEl.contains(e.target)) closeCtx(); });
/* menu okna: prawy przycisk na nagłówku albo Alt Spacja */
const winMenu = (id, x, y) => {
  if (!id) return; const pinned = J.wm.isPinned(id), isW = id.startsWith('w:');
  const size = s => ({ ic: 'max', t: s[1], run: () => J.uiRun('wm_move', { app: id, size: s[0] }) });
  ctxMenu(x, y, [
    { ic: 'pin', t: pinned ? 'Odepnij' : 'Przypnij na wierzchu', run: () => J.uiRun('wm_pin', { app: id, on: !pinned }) },
    ...[['S', 'Rozmiar: mały'], ['M', 'Rozmiar: średni'], ['L', 'Rozmiar: duży'], ['half', 'Pół ekranu']].map(size),
    ...[['left', 'Przyciągnij w lewo'], ['right', 'Przyciągnij w prawo'], ['center', 'Wyśrodkuj']].map(([m, t]) => ({ ic: 'grid', t, run: () => J.uiRun('wm_arrange', { mode: m, app: id }) })),
    ...(isW ? [] : [{ ic: 'link', t: 'Kopiuj link do tego widoku', run: () => { const st = J.apps[id]?.state?.(J.wm.ctx(id)); const url = location.origin + location.pathname + '#go=' + [id, st?.view, st?.target].filter(Boolean).map(encodeURIComponent).join('/'); navigator.clipboard?.writeText(url).then(() => J.toast('Skopiowano link'), () => J.toast(url)); } }]),
    ...(isW ? (() => { const w = J.widgets.list.find(x => 'w:' + x.id === id); return w ? [{ ic: 'min', t: w.collapsed ? 'Rozwiń widget' : 'Zwiń widget', run: () => J.uiRun('widget_collapse', { widget: w.id, on: !w.collapsed }) }, { ic: 'plus', t: 'Duplikuj widget', run: () => J.uiRun('widget_duplicate', { widget: w.id }) }] : []; })() : []),
    { ic: 'save', t: 'Zapisz układ…', run: () => { const n = prompt('Nazwa układu:'); if (n && n.trim()) J.uiRun('layout_save', { name: n.trim() }); } },
    '-',
    ...(isW ? [] : [{ ic: 'close', t: 'Zamknij pozostałe', run: () => J.uiRun('wm_close_others', { app: id }) }]),
    { ic: 'close', t: isW ? 'Usuń widget' : 'Zamknij', danger: isW, run: () => isW ? J.wm.close(id) : J.uiRun('close_app', { app: id }) }
  ]);
};
J.winMenu = winMenu; J.ctxMenu = ctxMenu;
$('#app').addEventListener('contextmenu', e => {
  if (e.target.closest('input,textarea,.window .win-body,.chat-panel,.log-panel')) return;
  e.preventDefault();
  const head = e.target.closest('.window .win-head');
  if (head) return winMenu(head.closest('.window').dataset.app, e.clientX, e.clientY);
  const sc = e.target.closest('[data-sc]');
  if (sc) {
    const s = J.state.shortcuts.find(x => x.id === sc.dataset.sc); if (!s) return;
    return ctxMenu(e.clientX, e.clientY, [
      { ic: 'link', t: 'Otwórz', run: () => J.shortcuts.run(s) },
      { ic: 'notes', t: 'Zmień nazwę', run: () => { const n = prompt('Nowa nazwa skrótu:', s.name); if (n && n.trim()) J.uiRun('shortcut_edit', { shortcut: s.id, name: n.trim() }); } },
      { ic: 'globe', t: 'Zmień adres', run: () => { const u = prompt('Adres URL:', s.url || 'https://'); if (u && u.trim()) J.uiRun('shortcut_edit', { shortcut: s.id, url: u.trim() }); } },
      '-', { ic: 'trash', t: 'Usuń z pulpitu', danger: true, run: () => J.uiRun('shortcut_remove', { name: s.id }) }
    ]);
  }
  ctxMenu(e.clientX, e.clientY, [
    { ic: 'notes', t: 'Nowa notatka', run: () => { const n = J.notes.add('Nowa notatka', ''); J.wm.open('notes', n.id); } },
    { ic: 'calendar', t: 'Nowe zadanie', run: () => J.wm.open('schedule') },
    { ic: 'plus', t: 'Nowy skrót na pulpicie', run: () => J.wm.open('library') },
    ...Object.entries(J.widgets.TYPES).map(([k, t]) => ({ ic: t.icon, t: 'Nowy widget: ' + t.label, run: () => J.widgets.create(k, { title: t.label }) })),
    '-',
    { ic: 'image', t: 'Zmień tapetę', run: () => J.actions.set_wallpaper({}) },
    { ic: 'sun', t: 'Następny motyw', run: nextTheme },
    { ic: 'min', t: 'Pokaż pulpit', run: () => J.wm.minimizeAll() },
    '-',
    { ic: 'terminal', t: 'Terminal', run: () => J.wm.open('terminal') },
    { ic: 'settings', t: 'Ustawienia', run: () => J.wm.open('settings') },
    { ic: 'refresh', t: 'Uruchom ponownie', run: () => location.reload() }
  ]);
});

/* =================== RDZEŃ =================== */
const wrap = $('#coreWrap');
$('#core').addEventListener('click', () => { if (J.ear.supported) J.ear.toggle(); else J.chatPanel.show(); });
J.on('ear', on => $('#btnVoice').classList.toggle('rec', on));
if (!J.ear.supported) $('#coreHint').textContent = 'kliknij, aby porozmawiać';
J.on('voice-command', t => J.voiceRoute ? J.voiceRoute(t) : J.brain.handle(t, { voice: true, source: 'voice' }));
J.on('ear-standby', on => { $('#app').classList.toggle('standby', on); $('#btnVoice').classList.toggle('standby', on); });

/* =================== PASEK GÓRNY =================== */
$('#btnVoice').innerHTML = icon('mic'); $('#btnFocus').innerHTML = icon('focus');
$('#btnLog').insertAdjacentHTML('afterbegin', icon('history'));
$('#btnNotif').insertAdjacentHTML('afterbegin', icon('bell'));
const soundIcon = () => { $('#btnSound').innerHTML = icon(S.sound ? 'sound' : 'mute'); $('#btnSound').classList.toggle('on', S.sound); };
/* ping Hermesa tylko wtedy, gdy zmieniła się jego konfiguracja (nie przy każdej zmianie koloru czy dźwięku) */
const hermesSig = () => [S.hermesOn, S.hermesProvider, S.hermesUrl, S.hermesKey, S.openrouterKey, S.hermesModel].join('|');
let pingSig = hermesSig();
soundIcon(); J.on('settings', () => { const sg = hermesSig(); if (sg !== pingSig) { pingSig = sg; J.hermesPing(); } soundIcon(); $('#btnAvatar').textContent = S.user; });
$('#btnNet').innerHTML = icon('wifi'); $('#btnFull').innerHTML = icon('screen');
const netInfo = () => !navigator.onLine ? 'Brak połączenia z internetem' : (J.aiReady() ? 'Hermes: ' + ({ up: 'połączony', down: 'offline', unknown: 'nie sprawdzono' }[J.hermes.status] || '—') : 'Internet: online · silnik lokalny');
$('#btnNet').onclick = () => { J.toast(netInfo()); J.hermesPing(); };
$('#btnFull').onclick = () => { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); } catch (e) { } };
$('#btnAvatar').textContent = S.user;
$('#searchPill').insertAdjacentHTML('afterbegin', '');
$('#btnVoice').onclick = () => J.ear.toggle();
$('#btnSound').onclick = () => { S.sound = !S.sound; J.save(); soundIcon(); J.sfx.click(); J.toast(S.sound ? 'Dźwięki włączone' : 'Dźwięki wyciszone'); };
$('#btnFocus').onclick = () => J.setFocus(!$('#app').classList.contains('focus'));
$('#btnAvatar').onclick = () => J.wm.open('settings');
$('#searchPill').onclick = () => palette.open();
$('#btnLog').onclick = () => J.proc.toggle();
$('#btnChat').innerHTML = icon('chat'); $('#btnChat').onclick = () => J.chatPanel.toggle();
$('#sysWeather').onclick = () => J.wm.open('weather');
$('#sysClock').onclick = () => J.wm.open('schedule');

J.setFocus = on => {
  $('#app').classList.toggle('focus', on); $('#btnFocus').classList.toggle('on', on);
  if (on) J.wm.minimizeAll();
  J.toast(on ? 'Tryb skupienia włączony — tło przygaszone, okna zminimalizowane' : 'Tryb skupienia wyłączony');
  J.log(on ? 'Tryb skupienia' : 'Tryb normalny', on ? 'Rozpraszacze wyciszone.' : 'Pełny interfejs przywrócony.', 'info');
};

/* =================== SKRÓTY KLAWISZOWE =================== */
/* akcje z domyślnymi skrótami; Ustawienia → Skróty (keys_set) mogą je przemapować (J.state.settings.keys) */
J.KEY_ACTIONS = {
  palette: { label: 'Paleta i wyszukiwanie', def: 'Ctrl+K', run: () => palette.isOpen ? palette.close() : palette.open() },
  voice: { label: 'Mów do Jarvisa', def: 'Ctrl+Space', run: () => J.ear.toggle() },
  standby: { label: 'Czuwanie („Jarvis…”)', def: 'Alt+J', run: () => J.ear.setStandby(!J.ear.standby) },
  chat: { label: 'Czat', def: 'Alt+1', run: () => J.chatPanel.toggle() },
  log: { label: 'Process Log', def: 'Alt+2', run: () => J.proc.toggle() },
  telemetry: { label: 'Telemetria', def: 'Alt+3', run: () => $('#deckHead')?.click() },
  notifications: { label: 'Powiadomienia', def: 'Alt+N', run: () => J.notifs.toggle() },
  nextWindow: { label: 'Następne okno', def: 'Alt+W', run: () => J.wm.cycle() },
  maximize: { label: 'Maksymalizuj okno', def: 'Alt+Enter', run: () => { const f = J.wm.focused(); if (f) J.wm.toggleMax(f); } },
  back: { label: 'Wróć', def: 'Ctrl+Alt+ArrowLeft', run: () => J.uiRun('nav_back', {}, { quiet: true }) },
  forward: { label: 'Dalej', def: 'Ctrl+Alt+ArrowRight', run: () => J.uiRun('nav_forward', {}, { quiet: true }) },
  desktop: { label: 'Pokaż pulpit / przywróć', def: 'Alt+D', run: () => J.wm.list().some(k => !J.wm.isMin(k)) ? J.uiRun('wm_minimize', { app: 'all' }) : J.uiRun('wm_restore', { app: 'all' }) },
  tile: { label: 'Ułóż w kafelki', def: 'Alt+T', run: () => J.uiRun('wm_arrange', { mode: 'tile' }) },
  present: { label: 'Tryb prezentacji', def: 'Alt+P', run: () => J.uiRun('ui_mode', { mode: J.uiMode.get() === 'present' ? 'work' : 'present' }, { offer: false }) },
  reopen: { label: 'Otwórz ponownie zamknięte', def: 'Ctrl+Shift+T', run: () => J.uiRun('wm_reopen', {}) },
  undo: { label: 'Cofnij', def: 'Ctrl+Z', run: () => J.uiRun('undo', {}).then(r => r.ok && J.toast(r.text)) },
  newNote: { label: 'Nowa notatka', def: 'Ctrl+Alt+N', run: () => { const n = J.notes.add('Nowa notatka', ''); J.wm.open('notes', n.id); } },
  search: { label: 'Szukaj wszędzie', def: 'Ctrl+Shift+F', run: () => palette.open('') },
  overlay: { label: 'Nakładka diagnostyczna', def: 'Alt+Shift+D', run: () => J.debugOverlay(!J.state.ui.debugOverlay) },
  help: { label: 'Ściąga skrótów', def: 'F1', run: () => J.keysHelp() },
  /* F2 / Delete działają na aktywnym oknie: notatka (tytuł / do kosza), widget (nazwa / usuń z „Cofnij”) */
  rename: { label: 'Zmień nazwę (notatka, widget)', def: 'F2', run: () => { const f = J.wm.focused(); if (f === 'notes') { const t = J.wm.ctx('notes')?.body.querySelector('#nTitle'); t?.focus(); t?.select(); return; } if (f?.startsWith('w:')) { const w = J.widgets.list.find(x => 'w:' + x.id === f); if (!w) return; const v = prompt('Nowa nazwa widgetu:', w.title); if (!v || !v.trim()) return; w.type === 'spec' ? J.uiRun('widget_edit', { widget: w.id, patch: { title: v.trim().slice(0, 60) } }) : J.uiRun('widgets_update', { widget: w.id, title: v.trim().slice(0, 60) }); } } },
  remove: { label: 'Usuń (notatka do kosza, widget)', def: 'Delete', run: () => { const f = J.wm.focused(); if (f === 'notes') { const st = J.apps.notes.state(J.wm.ctx('notes')); if (st?.noteId) J.uiRun('notes_delete', { note: st.noteId }); } else if (f?.startsWith('w:')) J.wm.close(f); } }
};
/* ---------- testy diagnostyczne (Ustawienia → O programie) ---------- */
J.diagnostics = async () => {
  const out = [], t = async (name, fn) => { try { const d = await fn(); out.push([true, name, d || '']); } catch (e) { out.push([false, name, String(e?.message || e).slice(0, 120)]); } };
  await t('Internet', async () => { if (!navigator.onLine) throw new Error('przeglądarka zgłasza brak sieci'); return 'online'; });
  await t('Zapis (localStorage)', async () => { localStorage.setItem('jarvis-os:probe', '1'); localStorage.removeItem('jarvis-os:probe'); return 'działa'; });
  await t('Zapis (IndexedDB)', async () => { await J.store.set('probe', 1); if ((await J.store.get('probe')) !== 1) throw new Error('odczyt się nie zgadza'); await J.store.del?.('probe'); return 'działa'; });
  await t('Hermes (mózg)', async () => { if (!J.aiReady()) return 'wyłączony — działa parser lokalny'; const l = await J.brain.models(); return 'odpowiada (' + (l?.length ?? 0) + ' modeli)'; });
  await t('Jev (sędzia)', async () => { if (!J.judge.enabled()) return 'wyłączony'; const st = J.judge.status; if (J.judge.breaker?.open) throw new Error('wstrzymany: ' + (J.judge.breaker.reason || 'błędy')); return st.state === 'up' ? 'ostatnio ' + st.latency + ' ms' : 'włączony (bez wywołań w tej sesji)'; });
  await t('Pogoda (Open-Meteo)', async () => { const d = await J.weather.get(); return d.city + ' ' + Math.round(d.current.temperature_2m) + '°'; });
  await t('Kursy (Binance/CoinGecko)', async () => { await J.market.ensure(); return J.market.source; });
  await t('Mowa (syntezator)', async () => { if (!J.voice.supported) throw new Error('brak w tej przeglądarce'); return (J.voice.list().length || 0) + ' głosów'; });
  await t('Mikrofon (rozpoznawanie)', async () => { if (!J.ear.supported) throw new Error('brak Web Speech — użyj Chrome/Edge'); try { const p = await navigator.permissions?.query({ name: 'microphone' }); return 'zgoda: ' + (p?.state || 'nieznana'); } catch (e) { return 'dostępny'; } });
  await t('Folder roboczy', async () => { if (!J.files?.supported) throw new Error('brak File System Access — użyj Chrome/Edge'); return J.files.handle ? 'wybrany: ' + J.files.handle.name : 'nie wybrano (Ustawienia → Pliki)'; });
  return out;
};
/* ---------- samouczek (5 kroków, każdy podświetla element) ---------- */
J.tour = async force => {
  if (!force && J.state.ui.tourDone) return;
  const steps = [['core', 'To rdzeń Jarvisa. Kliknij go albo naciśnij Ctrl Spacja, żeby mówić.'], ['chat', 'Czat: wpisz polecenie, np. „przypomnij mi o 18 trening”. Alt 1 pokazuje i chowa czat.'], ['dock', 'Dok z aplikacjami. Okna przeciągasz za nagłówek, Alt ←/→ przyciąga je do krawędzi, prawy przycisk na nagłówku to menu okna.'], ['palette', 'Ctrl K otwiera paletę: szukasz wszędzie i uruchamiasz polecenia.'], ['core', 'Pomyłka? Powiedz „cofnij” albo naciśnij Ctrl Z. „Wróć” wraca do poprzedniego okna. Naciśnij ?, żeby zobaczyć wszystkie skróty.']];
  for (let i = 0; i < steps.length; i++) { J.ui.highlight(steps[i][0], (i + 1) + '/' + steps.length); const a = await J.ask(steps[i][1], [{ label: i < steps.length - 1 ? 'Dalej' : 'Gotowe', value: 'next', primary: true }, { label: 'Pomiń', value: 'skip' }], { speak: false, timeout: 120000 }); if (a !== 'next') break; }
  J.state.ui.tourDone = true; J.save();
};
/* ---------- nakładka diagnostyczna ---------- */
J.debugOverlay = on => {
  J.state.ui.debugOverlay = !!on; J.save(); let el = $('#dbgOv'); clearInterval(J.__dbgT);
  if (!on) { el?.remove(); return; }
  if (!el) { el = h('pre', { id: 'dbgOv', class: 'dbg-ov' }); document.body.appendChild(el); }
  const tick = () => { const last = J.judge?.log?.all?.().slice(-1)[0], p = J.context.packet({ quiet: true }); el.textContent = 'FPS ' + (J.fps || 0) + ' · okna ' + J.wm.count() + ' · tryb ' + J.uiMode.get() + ' · wątek ' + J.threads.current() + '\nCofnij: ' + J.undo.stack.length + (J.undo.last() ? ' (ostatnie: ' + (J.undo.last().text || '').slice(0, 40) + ')' : '') + '\nJev: ' + (last ? last.intent + ' ' + Math.round((last.conf || 0) * 100) + '% → ' + (last.outcome || last.route || '?') + ' (' + (last.ms || 0) + ' ms)' : '—') + (J.judge?.breaker?.open ? ' · WSTRZYMANY' : '') + '\nKontekst: ' + JSON.stringify({ focused: p.desktop?.focused?.app, windows: p.desktop?.windows?.length, tasks: p.tasks?.today?.length, signals: p.signals?.length }); };
  tick(); J.__dbgT = setInterval(tick, 1000);
};
const comboOf = e => { const k = e.key === ' ' ? 'space' : e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase(); return J.normCombo([e.ctrlKey || e.metaKey ? 'ctrl' : '', e.altKey ? 'alt' : '', e.shiftKey && k.length > 1 || e.shiftKey && /[a-z]/.test(k) ? 'shift' : '', e.code === 'Space' ? 'space' : /^Digit\d$/.test(e.code) ? e.code.slice(5) : k].filter(Boolean).join('+')); };
const keyOf = id => J.state.settings.keys?.[id] || J.KEY_ACTIONS[id].def;
Object.defineProperty(J, 'KEYS', { get: () => [...Object.entries(J.KEY_ACTIONS).map(([id, a]) => [keyOf(id).replace(/Arrow(Left|Right|Up|Down)/, m => ({ ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' })[m]), a.label]), ['Alt ←→↑↓', 'przyciągnij okno do krawędzi'], ['Alt Shift ←→↑↓', 'przesuń okno'], ['Ctrl Alt Shift ←→↑↓', 'zmień rozmiar okna'], ['Alt Shift W', 'poprzednie okno'], ['Alt Spacja', 'menu okna'], ['Esc', 'zamknij / przerwij / wyjdź z pola'], ['?', 'ściąga skrótów']], configurable: true });
/* przemapowane skróty mają pierwszeństwo; domyślny skrót akcji przemapowanej przestaje działać */
addEventListener('keydown', e => {
  if (!$('#app').classList.contains('on') || e.repeat) return;
  const inField = !!e.target.closest?.('input,textarea,select,[contenteditable]'), c = comboOf(e), custom = J.state.settings.keys || {};
  for (const [id, a] of Object.entries(J.KEY_ACTIONS)) {
    if (J.normCombo(keyOf(id)) !== c) continue;
    if (inField && !/^(palette|voice|search)$/.test(id) && !/\+(ctrl|alt)|^(ctrl|alt)\+/.test(c)) return;
    if (inField && id === 'undo') return;   // Ctrl Z w polu tekstowym = cofanie pisania
    e.preventDefault(); e.stopImmediatePropagation(); a.run(); return;
  }
  if (Object.entries(custom).some(([id]) => J.KEY_ACTIONS[id] && J.normCombo(J.KEY_ACTIONS[id].def) === c)) { e.preventDefault(); e.stopImmediatePropagation(); }   // domyślny skrót akcji przemapowanej: nic
}, true);
addEventListener('keydown', e => {
  if (!$('#app').classList.contains('on')) return;
  const mod = e.ctrlKey || e.metaKey, inField = !!e.target.closest?.('input,textarea,select,[contenteditable]');
  const arrows = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  if (e.key === 'Escape' && inField && !J.ask.pending && !palette.isOpen) { e.target.blur(); return; }   // Esc w polu: najpierw wyjdź z pola
  if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z' && !inField) { e.preventDefault(); J.uiRun('undo', {}, { quiet: false }).then(r => r.ok && J.toast(r.text)); return; }
  if (mod && e.shiftKey && e.key.toLowerCase() === 't' && !inField) { e.preventDefault(); J.uiRun('wm_reopen', {}); return; }
  if (mod && e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !inField) { e.preventDefault(); J.uiRun(e.key === 'ArrowLeft' ? 'nav_back' : 'nav_forward', {}); return; }
  if (e.altKey && e.shiftKey && arrows[e.key] && !inField) { const f = J.wm.focused(); if (f) { e.preventDefault(); if (mod) { const k = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 40 : -40; const i = J.wm.info().find(w => w.id === f); J.uiRun('wm_move', { app: f, w: i.w + (e.key === 'ArrowRight' || e.key === 'ArrowLeft' ? k : 0), h: i.h + (e.key === 'ArrowUp' || e.key === 'ArrowDown' ? k : 0) }, { offer: false }); } else J.uiRun('wm_move', { app: f, direction: arrows[e.key], amount: 'small' }, { offer: false }); } return; }
  if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'w') { e.preventDefault(); const ids = J.wm.list(), cur = J.wm.focused(); if (ids.length) J.wm.open(ids[(ids.indexOf(cur) - 1 + ids.length) % ids.length]); return; }
  if (e.altKey && !e.shiftKey && e.key.toLowerCase() === 'd' && !inField) { e.preventDefault(); J.wm.list().some(k => !J.wm.isMin(k)) ? J.uiRun('wm_minimize', { app: 'all' }) : J.uiRun('wm_restore', { app: 'all' }); return; }
  if (e.altKey && !e.shiftKey && e.key.toLowerCase() === 't' && !inField) { e.preventDefault(); J.uiRun('wm_arrange', { mode: 'tile' }); return; }
  if (e.altKey && e.code === 'Space') { const f = J.wm.focused(); if (f) { e.preventDefault(); const r = J.$('.window[data-app="' + f + '"] .win-head')?.getBoundingClientRect(); winMenu(f, r ? r.left + 20 : 100, r ? r.bottom : 100); } return; }
  if (e.key === '?' && !inField && !mod) { e.preventDefault(); J.keysHelp?.(); return; }
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); palette.isOpen ? palette.close() : palette.open(); }
  else if (mod && e.code === 'Space') { e.preventDefault(); J.ear.toggle(); }
  else if (e.altKey && e.key === '1') { e.preventDefault(); J.chatPanel.toggle(); }
  else if (e.altKey && e.key === '2') { e.preventDefault(); J.proc.toggle(); }
  else if (e.altKey && e.key === '3') { e.preventDefault(); $('#deckHead')?.click(); }
  else if (e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); J.notifs.toggle(); }
  else if (e.altKey && e.key.toLowerCase() === 'w') { e.preventDefault(); J.wm.cycle(); }
  else if (e.altKey && e.key.toLowerCase() === 'j') { e.preventDefault(); J.ear.setStandby(!J.ear.standby); }
  else if (e.altKey && /^Arrow(Left|Right|Up|Down)$/.test(e.key)) { const f = J.wm.focused(); if (f) { e.preventDefault(); J.wm.snap(f, { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'top', ArrowDown: 'bottom' }[e.key]); } }
  else if (e.altKey && e.key === 'Enter') { const f = J.wm.focused(); if (f) { e.preventDefault(); J.wm.toggleMax(f); } }
  else if (e.key === 'Escape') {
    if (ctxEl) return closeCtx();
    if (palette.isOpen) return palette.close();
    if (J.proc.isOpen && !J.proc.active) return J.proc.close();
    if (J.notifs.isOpen) return J.notifs.close();
    if (J.ask.pending) return J.ask.cancel();
    if (J.dictation?.active) return J.dictation.stop();
    /* tryb skupienia: podwójny Esc wychodzi z trybu */
    if ($('#app').classList.contains('focus') && Date.now() - (J._lastEsc || 0) < 600) { J._lastEsc = 0; return J.uiRun('focus_mode', { on: false }, { quiet: true }); }
    J._lastEsc = Date.now();
    if (J.brain.abort()) return;
    if (J.voice.speaking) return J.voice.stop();
    if (J.ear.active) return J.ear.stop();
    J.wm.closeTop();
  }
  else if (e.key === '/' && !e.target.closest('input,textarea')) { e.preventDefault(); palette.open(); }
});
/* telefon: przesunięcie palcem od lewej krawędzi = „wróć” */
{ let sx = null, sy = 0; addEventListener('touchstart', e => { const t = e.touches[0]; sx = t.clientX < 24 && innerWidth <= 640 ? t.clientX : null; sy = t.clientY; }, { passive: true }); addEventListener('touchend', e => { if (sx == null) return; const t = e.changedTouches[0]; if (t.clientX - sx > 80 && Math.abs(t.clientY - sy) < 60) J.uiRun('nav_back', {}, { quiet: true }); sx = null; }, { passive: true }); }
/* przyciski myszy „wstecz / dalej” = historia okien Jarvisa (bez wychodzenia ze strony) */
addEventListener('mouseup', e => { if (e.button === 3 || e.button === 4) { e.preventDefault(); J.uiRun(e.button === 3 ? 'nav_back' : 'nav_forward', {}, { quiet: true }); } });
/* ściąga skrótów klawiszowych („?”) */
J.keysHelp = () => { J.ask('Skróty klawiszowe:\n' + J.KEYS.map(([k, t]) => k + ' — ' + t).join('\n'), [{ label: 'OK', value: 'ok', primary: true }], { speak: false, timeout: 120000 }); };

/* =================== POWIADOMIENIA SYSTEMOWE =================== */
J.notify = (title, body) => {
  try { if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification(title, { body, icon: 'assets/icon.svg' }); } catch (e) { }
};
J.on('tasks', () => { try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (e) { } });

/* =================== MATRIX (easter egg) =================== */
J.matrix = () => {
  if ($('#matrix')) return;
  const cv = h('canvas', { id: 'matrix' }); document.body.appendChild(cv);
  const c = cv.getContext('2d'); cv.width = innerWidth; cv.height = innerHeight;
  const cols = Math.floor(cv.width / 16), drops = Array(cols).fill(0).map(() => Math.random() * -50);
  const chars = 'アカサタナハマヤラワ0123456789JARVIS<>{}[]#$%'.split('');
  let run = true;
  const stop = () => { run = false; cv.remove(); removeEventListener('keydown', stop); };
  cv.onclick = stop; addEventListener('keydown', stop);
  const acc = S.accent;
  const f = () => {
    if (!run) return;
    c.fillStyle = 'rgba(0,0,0,.08)'; c.fillRect(0, 0, cv.width, cv.height);
    c.font = '15px JetBrains Mono, monospace';
    drops.forEach((y, i) => {
      c.fillStyle = Math.random() > .97 ? '#fff' : acc;
      c.fillText(chars[Math.floor(Math.random() * chars.length)], i * 16, y * 16);
      drops[i] = y * 16 > cv.height && Math.random() > .975 ? 0 : y + 1;
    });
    requestAnimationFrame(f);
  };
  f(); J.sfx.boot();
};

/* =================== PANEL CZATU (prawy dół; zwinięty = chip) =================== */
J.chatPanel = (() => {
  const panel = $('#chatPanel'), host = $('#chatHost'), narrow = matchMedia('(max-width:900px)');
  const ctx = { el: panel, body: host, onClose() { }, setTitle() { }, close() { } };
  J.apps.chat.mount(host, ctx);
  const set = on => {
    if (on && narrow.matches) J.proc.close();
    panel.classList.toggle('open', on); $('#workspace').classList.toggle('chat-closed', !on); $('#btnChat').classList.toggle('on', on);
    if (!narrow.matches) { J.state.ui.chatClosed = !on; J.save(); }
    J.emit('wm');
  };
  const focusInput = () => setTimeout(() => $('#chatInput', host)?.focus(), 30);
  const api = {
    show(arg) { set(true); focusInput(); if (arg) J.brain.handle(arg); },
    hide() { set(false); },
    toggle() { set(!api.isOpen); if (api.isOpen) focusInput(); },
    get isOpen() { return panel.classList.contains('open'); }
  };
  $('#chatChip').onclick = () => api.show();
  $('#chatChipIc').innerHTML = icon('chat');
  set(narrow.matches ? false : !J.state.ui.chatClosed);
  return api;
})();

/* chipy i ikony stanu: kropka = realny status Hermesa / trwającego zadania */
const syncStatus = () => {
  const st = !J.aiReady() ? 'local' : J.hermes.status, busy = !!J.engine.taskId;
  ['chatChipDot', 'railChatDot'].forEach(id => { const e = $('#' + id); if (e) { e.dataset.s = st; e.classList.toggle('run', busy); } });
  $('#chatChip')?.classList.toggle('run', busy);
  const net = $('#btnNet'); if (net) net.dataset.s = !navigator.onLine ? 'off' : (J.aiReady() && J.hermes.status === 'down') ? 'warn' : 'ok';
};
J.on('hermes', syncStatus); J.on('settings', syncStatus);
['task.created', 'task.completed', 'task.failed', 'task.cancelled'].forEach(t => J.ev.on(t, syncStatus));

/* =================== WYNIK ZADANIA (chip przy Core) + STOP =================== */
{
  const chip = $('#resultChip'), stop = $('#taskStop'); let chipT;
  const pl = J.pl;
  const fmtD = ms => ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(1) + ' s';
  const pauseB = $('#taskPause'), skipB = $('#taskSkip');
  stop.onclick = () => { if (J.plan && (J.plan.paused || J.userRoutines?.running)) J.plan.set('stop'); else J.brain.abort(); };
  pauseB.onclick = () => J.uiRun('plan_control', { op: J.plan.paused ? 'resume' : 'pause' }, { quiet: true });
  skipB.onclick = () => J.uiRun('plan_control', { op: 'skip' }, { quiet: true });
  const syncPlan = () => { const on = !stop.classList.contains('hidden'); pauseB.classList.toggle('hidden', !on); skipB.classList.toggle('hidden', !on); pauseB.textContent = J.plan?.paused ? '▶' : '‖'; pauseB.title = J.plan?.paused ? 'Wznów' : 'Wstrzymaj po bieżącym kroku'; };
  J.on('plan', syncPlan);
  J.on('routine-step', e => { stop.classList.remove('hidden'); syncPlan(); $('#taskText').textContent = e.name + ' · krok ' + (e.i + 1) + '/' + e.n + ': ' + e.text; $('#task').classList.add('show'); });
  J.ev.on('routine.completed', () => { if (!J.brain.busy) { stop.classList.add('hidden'); syncPlan(); $('#task').classList.remove('show'); } });
  J.ev.on('task.created', e => { if (e.payload.replay) return; stop.classList.remove('hidden'); syncPlan(); chip.classList.remove('show'); clearTimeout(chipT); });
  ['task.completed', 'task.failed', 'task.cancelled'].forEach(t => J.ev.on(t, e => {
    if (e.payload.replay) return;
    if (!J.userRoutines?.running) stop.classList.add('hidden'); syncPlan();
    const l = J.engine.last; if (!l || (l.status === 'completed' && l.tools < 2 && l.nodes < 2)) return;   // proste polecenia i zwykłe odpowiedzi nie tworzą karty wyniku
    const ok = l.status === 'completed';
    chip.dataset.s = l.status;
    chip.innerHTML = `<b>${ok ? 'Zadanie zakończone' : l.status === 'failed' ? 'Zadanie nie powiodło się' : 'Zadanie przerwane'}</b><span>${l.tools} ${pl(l.tools, 'wywołanie', 'wywołania', 'wywołań')} narzędzi · ${l.nodes} ${pl(l.nodes, 'źródło', 'źródła', 'źródeł')} · ${fmtD(l.dur)}</span><div class="rc-act"></div>`;
    const act = $('.rc-act', chip);
    if (ok && l.result) { const b = h('button', { class: 'btn sm primary' }, icon('pin', 'width="12" height="12"') + ' Przypnij wynik'); b.onclick = () => { J.widgets.create('result', { title: l.title.slice(0, 40), content: l.result, meta: 'Zadanie · ' + fmtD(l.dur) }); chip.classList.remove('show'); }; act.appendChild(b); }
    const lg = h('button', { class: 'btn sm ghost' }, 'Process Log'); lg.onclick = () => J.proc.open(); act.appendChild(lg);
    setTimeout(() => chip.classList.add('show'), 700);   // wynik „wyłania się” po pulsie Core
    clearTimeout(chipT); chipT = setTimeout(() => chip.classList.remove('show'), 12000);
  }));
}

/* =================== PYTANIA I POTWIERDZENIA (chip przy Core + szybkie odpowiedzi w czacie + głos) =================== */
const askChip = (() => {
  const el = $('#askChip'); let timer = null, prog = null;
  return {
    show(question, options, onPick, ms) {
      el.inert = false;   // przed treścią: czytnik ogłasza pytanie, a focus() na przycisku działa (w inert by nie zadziałał)
      el.innerHTML = '<div class="ac-q" id="askQ"></div><div class="ac-opts"></div><i class="ac-bar"></i>';
      $('.ac-q', el).textContent = question;
      options.forEach(op => { const b = h('button', { class: 'btn sm' + (op.primary ? ' primary' : op.danger ? ' ghost danger' : ' ghost') }); b.textContent = op.label; b.onclick = () => onPick(op.value); $('.ac-opts', el).appendChild(b); });
      el.classList.add('show'); const bar = $('.ac-bar', el); if (bar && ms) { bar.style.transition = 'none'; bar.style.width = '100%'; requestAnimationFrame(() => { bar.style.transition = 'width ' + ms + 'ms linear'; bar.style.width = '0%'; }); }
      $('.ac-opts button', el)?.focus();
    },
    hide() { el.classList.remove('show'); clearTimeout(timer); }
  };
})();
/* J.ask(question, options[], {timeout, speak}) → Promise<odpowiedź|null>; odpowiedź: klik, Enter w czacie, głos */
J.ask = (() => {
  let pend = null, timedOut = false;   // timedOut: ostatnie pytanie wygasło bez odpowiedzi (≠ „Nie”/„Anuluj”)
  const api = (question, options = [], o = {}) => new Promise(resolve => {
    api.cancel(); timedOut = false;
    const ms = o.timeout || 60000, opts = options.map((x, i) => typeof x === 'string' ? { label: x, value: x, primary: i === 0 } : x);
    const finish = v => { if (!pend) return; const p = pend; pend = null; clearTimeout(p.t); askChip.hide(); p.quick?.remove(); J.ear.expectAnswer(null); J.ev.emit('approval.resolved', { answer: v }); p.resolve(v); };
    pend = { question, opts, resolve, t: setTimeout(() => { timedOut = true; finish(null); }, ms), quick: null };
    J.ev.emit('approval.requested', { question }); J.sfx.ask();
    askChip.show(question, opts, finish, ms);
    pend.quick = J.chat.quick(question, opts, finish);
    if (o.speak !== false) J.voice.speak(question + (opts.length && opts.length <= 4 ? ' ' + opts.map(x => x.label).join(', ') + '?' : ''), { priority: 2 }).then(() => { if (!pend) return; const byVoice = J.ear.standby || J.brain.lastSource === 'voice'; if (!byVoice || !J.ear.supported) return; J.ear.expectAnswer(t => { if (!pend) return; const n = J.norm(t); const hit = opts.find(x => n.includes(J.norm(x.label))) || (/^(tak|zgoda|ok|okej|potwierdzam|jasne|dawaj)/.test(n) && opts[0]) || (/^(nie|anuluj|odmawiam|stop)/.test(n) && opts.find(x => x.danger || /nie|anuluj|zako/i.test(x.label))); finish(hit ? hit.value : t); }); if (!J.ear.standby) J.ear.start({ answer: true }); });
  });
  /* odpowiedź wpisana lub powiedziana: najpierw dokładne dopasowanie etykiety, potem Jev (D15: „no dobra” = tak), na końcu surowy tekst */
  api.answer = t => {
    if (!pend) return false;
    const p = pend, n = J.norm(t), hit = p.opts.find(x => J.norm(x.label) === n || n.includes(J.norm(x.label)));
    const done = v => { if (pend !== p) return; pend = null; clearTimeout(p.t); askChip.hide(); p.quick?.remove(); J.ear.expectAnswer(null); J.ev.emit('approval.resolved', { answer: t }); p.resolve(v); };
    if (hit) { done(hit.value); return true; }
    if (J.judge?.available() && J.judge.allowed('answer') && p.opts.length) {
      J.judge.answer(t, p.opts).then(r => {
        if (pend !== p) return;
        const th = J.judge.thresholds().yes;
        if (r && r.kind === 'option' && r.index != null && p.opts[r.index] && r.confidence >= th) return done(p.opts[r.index].value);
        if (r && r.kind === 'other' && r.confidence >= th) { api.cancel(); J.brain.handle(t, { source: J.brain.lastSource || 'typed' }); return; }   // to nie odpowiedź, tylko nowe polecenie
        done(t);
      });
      return true;
    }
    done(t); return true;
  };
  api.cancel = () => { if (!pend) return; const p = pend; pend = null; clearTimeout(p.t); askChip.hide(); p.quick?.remove(); J.ear.expectAnswer(null); J.ev.emit('approval.resolved', { answer: null }); p.resolve(null); };
  Object.defineProperty(api, 'pending', { get: () => !!pend });
  Object.defineProperty(api, 'timedOut', { get: () => timedOut });
  return api;
})();
/* potwierdzenie ryzykownego narzędzia: 'yes' | 'no' | 'always' | 'timeout' */
/* dziennik zgód (IndexedDB consent.log, 500 wpisów) — widoczny w Ustawieniach → Agent */
const logConsent = (req, answer) => { try { J.store.push('consent.log', { ts: Date.now(), id: req.id, label: req.label, args: JSON.stringify(req.args || {}).slice(0, 160), source: req.source || '', forced: !!req.forced, answer }, 500); } catch (e) { } };
J.confirm = async req => { const v = await confirm0(req); logConsent(req, v); return v; };
const confirm0 = async req => {
  J.sfx.confirm();
  const v = await J.ask(req.question, [{ label: 'Tak', value: 'yes', primary: true }, { label: 'Nie', value: 'no', danger: true }, ...(req.forced ? [] : [{ label: 'Zawsze', value: 'always' }])], { timeout: 60000 });
  if (v === null) return 'timeout';
  if (v === 'yes' || v === 'no' || v === 'always') return v;
  const n = J.norm(String(v)); return /^(tak|zgoda|ok|okej|potwierdzam|jasne|dawaj)/.test(n) ? 'yes' : (/zawsze/.test(n) && !req.forced) ? 'always' : 'no';
};

/* przycisk „Cofnij” po czynności wykonanej przez Jeva bez pytania (A2), znika po kilku sekundach */
{
  const chip = $('#undoChip'); let t = null, cur = null;
  const hide = () => { clearTimeout(t); cur = null; chip.classList.remove('show'); };
  J.on('undo-offer', ({ entry, ms }) => {
    clearTimeout(t); cur = entry; chip.inert = false;
    chip.innerHTML = '<span></span><button class="btn sm primary">Cofnij</button><i></i>';
    $('span', chip).textContent = entry.text || entry.label || 'Wykonano';
    const bar = $('i', chip); bar.style.transition = 'none'; bar.style.width = '100%';
    $('button', chip).onclick = async () => { if (cur !== entry) return; hide(); const u = await J.undo.run(60000); J.chat.add('jarvis', u.text); J.sfx[u.ok ? 'notify' : 'error'](); };
    chip.classList.add('show'); requestAnimationFrame(() => { bar.style.transition = 'width ' + ms + 'ms linear'; bar.style.width = '0%'; });
    t = setTimeout(hide, ms);
  });
  J.on('undo-done', hide);
}
/* schowane chipy (pytanie, „Cofnij”, wynik zadania) są tylko przezroczyste — bez inert ich przyciski zostawały w kolejności Tab
   i w drzewie czytnika ekranu; jeden obserwator klasy „show” zamiast pilnowania każdego miejsca, które je pokazuje */
if (typeof MutationObserver === 'function') ['#askChip', '#undoChip', '#resultChip'].forEach(s => {
  const el = $(s); if (el) new MutationObserver(() => { el.inert = !el.classList.contains('show'); }).observe(el, { attributes: true, attributeFilter: ['class'] });
});

/* =================== WSKAZYWANIE ELEMENTÓW (Jarvis „pokazuje palcem”) =================== */
J.ui = {
  /* wspólny wygląd stanów widoku (docs/spec/09-wyglad-stany.md §1): loading | empty | error | offline | denied | stale | mock */
  state(el, kind, o = {}) {
    if (!el) return null;
    const ICON = { loading: '', empty: 'list', error: 'close', offline: 'wifi', denied: 'key', stale: 'history', mock: 'bolt' };
    if (kind === 'stale' || kind === 'mock') { el.querySelector('.ui-badge')?.remove(); const b = h('span', { class: 'ui-badge ' + kind }); b.textContent = o.text || (kind === 'mock' ? 'symulacja' : 'nieaktualne'); el.prepend(b); return b; }
    const box = h('div', { class: 'ui-state ' + kind, role: kind === 'error' ? 'alert' : 'status' });
    box.innerHTML = kind === 'loading' ? '<i class="sk"></i><i class="sk"></i><i class="sk short"></i>' : '<div class="us-ic">' + icon(ICON[kind] || 'star', 'width="20" height="20"') + '</div><div class="us-t"></div>';
    if (kind !== 'loading') $('.us-t', box).textContent = o.text || { empty: 'Nic tu jeszcze nie ma.', error: 'Coś poszło nie tak.', offline: 'Brak internetu.', denied: 'Brak dostępu.' }[kind] || '';
    if (kind === 'loading' && o.text) { const t = h('div', { class: 'us-t' }); t.textContent = o.text; box.appendChild(t); }
    if (o.action) { const b = h('button', { class: 'btn sm ' + (kind === 'empty' ? 'primary' : 'ghost') }); b.textContent = o.action.label; b.onclick = o.action.run; box.appendChild(b); }
    el.innerHTML = ''; el.appendChild(box); return box;
  },
  resolve(target) {
    const t = String(target || '');
    const map = { dock: '#dock', rail: '#iconRail', deck: '#deck', core: '#core', chat: J.chatPanel?.isOpen ? '#chatPanel' : '#chatChip', log: $('#workspace').classList.contains('log-open') ? '#logPanel' : '#logChip', palette: '#searchPill', notifications: '#btnNotif', voice: '#btnVoice', settings: '#btnAvatar' };
    if (map[t]) return $(map[t]);
    if (t.startsWith('sc:')) return $('[data-sc="' + t.slice(3) + '"]');
    if (J.apps[t] || t.startsWith('w:')) return $('.window[data-app="' + t + '"]:not(.hidden)') || $('.dock [data-app="' + t + '"]') || $('.icon-rail [data-app="' + t + '"]');
    try { return $(t); } catch (e) { return null; }
  },
  highlight(target, text) {
    const el = J.ui.resolve(target); if (!el) return false;
    $$('.hl').forEach(x => x.classList.remove('hl')); $$('.hl-tag').forEach(x => x.remove());
    el.classList.add('hl'); void el.offsetWidth;
    if (text) { const tag = h('div', { class: 'hl-tag' }); tag.textContent = text; document.body.appendChild(tag); const r = el.getBoundingClientRect(); tag.style.left = Math.min(innerWidth - 220, Math.max(8, r.left)) + 'px'; tag.style.top = Math.max(8, r.top - 34) + 'px'; setTimeout(() => tag.remove(), 3200); }
    J.sfx.tick(); setTimeout(() => el.classList.remove('hl'), 2600); return true;
  }
};

/* =================== CENTRUM POWIADOMIEŃ =================== */
J.notifs = (() => {
  const panel = $('#notifPanel'), list = $('#notifList'), btn = $('#btnNotif'), badge = $('#notifBadge');
  const KIND_APP = { task: 'schedule', timer: 'timer', market: 'market', routine: 'chat', agent: 'chat', hermes: 'settings', network: 'monitor', files: 'settings' };
  const rel = ts => { const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? 'teraz' : m < 60 ? m + ' min' : m < 1440 ? Math.round(m / 60) + ' h' : new Date(ts).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }); };
  const render = () => {
    const l = J.state.notifs; list.innerHTML = l.length ? '' : '<div class="lp-empty">Brak powiadomień.</div>';
    const hi = n => (n.imp ?? 0) >= .66 && Date.now() - n.ts < 864e5;   // D14: ważne (wg Jeva) z ostatniej doby idą na górę
    [...l.filter(hi), ...l.filter(n => !hi(n))].slice(0, 60).forEach(n => {
      const el = h('button', { class: 'nt' + (n.read ? '' : ' unread') + (hi(n) ? ' imp' : ''), 'data-k': n.kind || 'info' }, '<i></i><div><b></b><span></span></div><small></small>');
      $('b', el).textContent = n.title; $('span', el).textContent = n.body || ''; $('small', el).textContent = rel(n.ts);
      if (n.actions?.length && !n.done) { const bar = h('div', { class: 'nt-act' }); n.actions.forEach(a => { const b = h('span', { class: 'btn sm ghost', role: 'button', tabindex: '0' }); b.textContent = a.label; b.onclick = async ev => { ev.stopPropagation(); const r = await J.uiRun(a.cmd, a.args || {}); if (r.ok) { n.done = true; J.save(); render(); J.toast(r.text); } }; bar.appendChild(b); }); $('div', el).appendChild(bar); }
      el.onclick = () => { n.read = true; J.save(); render(); const app = KIND_APP[n.kind]; if (app === 'chat') J.chatPanel.show(); else if (app) J.wm.open(app); };
      list.appendChild(el);
    });
    const u = api.unread(); badge.textContent = u; badge.classList.toggle('hidden', !u); btn.classList.toggle('on', api.isOpen);
  };
  const api = {
    get isOpen() { return panel.classList.contains('open'); },
    unread: () => J.state.notifs.filter(n => !n.read).length,
    open() {
      panel.classList.add('open'); const fresh = J.state.notifs.filter(n => !n.read); render(); J.state.notifs.forEach(n => n.read = true); J.save(); setTimeout(render, 600);
      if (fresh.length >= 2 && J.judge?.available() && J.judge.allowed('rank')) J.judge.rank(fresh).then(r => { if (!r) return; r.forEach((v, i) => { if (v != null && fresh[i]) fresh[i].imp = v; }); J.save(); render(); });
    },
    close() { panel.classList.remove('open'); render(); },
    toggle() { api.isOpen ? api.close() : api.open(); },
    clear() { J.state.notifs = []; J.save(); render(); },
    render
  };
  btn.onclick = () => api.toggle(); $('#notifClear').onclick = () => api.clear(); $('#notifClose').onclick = () => api.close();
  addEventListener('pointerdown', e => { if (api.isOpen && !panel.contains(e.target) && !btn.contains(e.target)) api.close(); });
  return api;
})();
/* J.notice: jedno wejście dla powiadomień (toast + centrum + opcjonalnie systemowe) */
/* kanały (Ustawienia → Powiadomienia): wyłączony kanał = tylko centrum bez dymka; limit dymków na godzinę; w trybie prezentacji bez treści */
const toastLog = {};
J.notice = ({ title, body, kind = 'info', toast = true, system = false, actions }) => {
  const n = { id: J.uid(), title: String(title), body: body ? String(body) : '', kind, ts: Date.now(), read: false, actions: (actions || []).slice(0, 3) };
  J.state.notifs.unshift(n); J.state.notifs.length = Math.min(J.state.notifs.length, 100); J.save();
  const ch = J.notifChannel ? J.notifChannel(kind) : { on: true, sound: true, perHour: 20 };
  const recent = (toastLog[kind] = (toastLog[kind] || []).filter(t => Date.now() - t < 3600e3));
  const show = toast && ch.on && recent.length < (ch.perHour ?? 20);
  if (show) J.sfx.forKind?.(kind);
  if (show) { recent.push(Date.now()); J.toast(J.uiMode?.get() === 'present' ? 'Nowe powiadomienie' : n.title + (n.body ? ' — ' + n.body : ''), 5000); }
  if (system && ch.on && J.uiMode?.get() !== 'present') J.notify?.(n.title, n.body);
  J.notifs.render(); return n;
};

/* =================== ONBOARDING (pierwsze uruchomienie) =================== */
const onboarding = () => {
  if (J.state.ui.onboarded) return;
  const el = $('#onboard'); el.classList.add('show');
  $('#obMic').onclick = () => { J.ear.start(); $('#obMic').textContent = 'Słucham…'; };
  $('#obHermes').onclick = () => { J.wm.open('settings'); };
  $('#obCity').value = S.city;
  $('#obGo').onclick = async () => {
    const c = $('#obCity').value.trim();
    if (c && c !== S.city) { try { const g = await J.weather.geocode(c); Object.assign(S, { city: g.city, lat: g.lat, lon: g.lon }); J.weather.ts = 0; loadWeather(); } catch (e) { J.toast(e.message); } }
    if ($('#obWake').checked && J.ear.supported) J.ear.setStandby(true);
    const k = $('#obKey').value.trim();
    if (k) { const p = J.HERMES_PRESETS.openrouter; Object.assign(S, { openrouterKey: k, jevOn: true, hermesOn: true, hermesProvider: 'openrouter', hermesUrl: p.url, hermesModel: p.model, hermesKey: '' }); J.save(); J.emit('settings'); setTimeout(() => { J.judge.test().then(t => J.notice({ title: 'Jev działa', body: t, kind: 'agent' })).catch(e => J.notice({ title: 'Jev: błąd', body: e.message, kind: 'hermes' })); J.hermesPing(); }, 800); }
    J.state.ui.onboarded = true; J.save(); el.classList.remove('show'); J.sfx.success();
    J.toast('Gotowe. Ctrl+K otwiera paletę, Ctrl+Spacja uruchamia mikrofon.', 6000);
  };
  $('#obSkip').onclick = () => { J.state.ui.onboarded = true; J.save(); el.classList.remove('show'); };
  if (!J.ear.supported) { $('#obWake').disabled = true; $('#obWake').closest('label').classList.add('dim'); }
};

/* =================== START =================== */
// kontenery z overflow:hidden potrafią się „przewinąć” przy fokusie — trzymamy je w miejscu
['#app', '#desktop'].forEach(sel => { const el = $(sel); el.addEventListener('scroll', () => { if (el.scrollTop || el.scrollLeft) el.scrollTop = el.scrollLeft = 0; }); });
J.proc.init(); J.hud.init(); renderIcons(); renderDock(); syncStatus();
clock(); setInterval(clock, 1000);
loadWeather(); setInterval(loadWeather, 15 * 60e3);
addEventListener('online', () => { J.toast('Połączenie przywrócone'); });
addEventListener('offline', () => { J.toast('Utracono połączenie z internetem'); J.log('Sieć', 'Tryb offline — działają funkcje lokalne.', 'warn'); });

if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').then(reg => {
  reg.addEventListener('updatefound', () => { const w = reg.installing; w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) J.notice({ title: 'Nowa wersja Jarvis OS', body: 'odśwież stronę, aby ją załadować', kind: 'agent' }); }); });
}).catch(() => { });
/* Wake Lock: ekran nie gaśnie, gdy trwa minutnik albo czuwanie głosowe */
let wakeLock = null;
const syncWake = async () => { const want = (J.timer.running || J.ear.standby) && !document.hidden; try { if (want && !wakeLock && navigator.wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } else if (!want && wakeLock) { await wakeLock.release(); wakeLock = null; } } catch (e) { wakeLock = null; } };
J.on('timer', syncWake); J.on('ear-standby', syncWake); document.addEventListener('visibilitychange', syncWake);

J.notifs.render();
if (J.state.alerts?.length) J.market.subscribeBackground();
J.files?.load?.();
/* okna otwarte przy zamykaniu strony (układ startowy „last”) */
addEventListener('pagehide', () => {
  try { localStorage.setItem('jarvis-os:openAtExit', JSON.stringify(J.wm.list().filter(k => !k.startsWith('w:') && !J.wm.isMin(k)))); } catch (e) { }
  J.saveNow();   // flush debounce (250–600 ms): zamknięcie karty tuż po edycji gubiło ostatnie zmiany; w karcie-podglądzie to no-op
});
/* link do miejsca w Jarvisie: index.html#go=app/widok/cel (docs/spec/03-nawigacja.md §5) */
J.openGo = () => {
  try {
    const hp = new URLSearchParams(String(location.hash || '').replace(/^#/, '')); const go = hp.get('go'); if (!go) return false;
    const [app, view, target] = go.split('/').map(decodeURIComponent);
    hp.delete('go'); history.replaceState(null, '', location.pathname + location.search + (String(hp) ? '#' + hp : ''));
    if (!J.apps[app]) { J.toast('Link prowadzi do nieznanej aplikacji „' + app + '”'); return false; }
    J.uiRun(view ? 'app_view' : 'open_app', view ? { app, view, target: target || undefined } : { app }, { offer: false }); return true;
  } catch (e) { return false; }
};
addEventListener('hashchange', () => J.openGo());
/* ochrona dwóch kart: jeden mechanizm — J.tabChannel na górze pliku (heartbeat + wyłączony zapis w karcie-podglądzie) */
boot().then(() => {
  if (J.__stateBroken) J.toast('⚠ Stan danych był uszkodzony — Jarvis uruchomił się z ustawieniami domyślnymi. Poprzednie dane są dostępne w Ustawieniach → Dane.', 10000);
  J.widgets.restore(); setTimeout(() => J.userRoutines?.fire('startup'), 4000); J.fx.apply(); J.on('agent-ui', id => J.fx.ghost(id));
  /* tryb przestrzeni i układ startowy */
  { const m = J.state.ui.mode === 'present' ? 'work' : (J.state.ui.mode || S.startMode || 'work'); if (m !== 'work') J.uiMode.set(m); else J.state.ui.mode = 'work'; }
  { const ls = S.layoutStartup || 'none'; if (ls === 'last') { let l = []; try { l = JSON.parse(localStorage.getItem('jarvis-os:openAtExit') || '[]'); } catch (e) { } l.forEach(id => J.apps[id] && J.wm.open(id)); } else if (ls !== 'none') J.layouts.apply(ls); }
  setTimeout(() => J.openGo(), 400);
  if (J.state.ui.debugOverlay) J.debugOverlay(true);
  if (J.state.ui.onboarded && !J.state.ui.tourDone) setTimeout(() => J.tour(), 2500);
  J.hermesPing();
  J.tasks.check();
  if (S.wakeWord && J.ear.supported) setTimeout(() => J.ear.setStandby(true), 1200);
  setTimeout(onboarding, 1500);

  /* ---- tooltips: pojawia się po 600ms najechania na element z [data-tip] lub [title] ---- */
  (() => {
    let tipEl = null, tipT = null;
    const tip = document.createElement('div'); tip.className = 'jtip'; document.body.appendChild(tip);
    const hide = () => { clearTimeout(tipT); tip.classList.remove('on'); tipEl = null; };
    document.addEventListener('mouseover', e => {
      const el = e.target.closest('[data-tip],[title]'); if (el === tipEl) return;
      hide(); if (!el) return;
      const txt = el.dataset.tip || el.title; if (!txt) return;
      if (el.title) el.dataset.tip = el.title, el.removeAttribute('title');
      tipEl = el;
      tipT = setTimeout(() => {
        const r = el.getBoundingClientRect();
        tip.textContent = txt; tip.classList.add('on');
        const tw = tip.offsetWidth, vw = window.innerWidth;
        let left = r.left + r.width / 2 - tw / 2;
        left = Math.max(6, Math.min(left, vw - tw - 6));
        tip.style.left = left + 'px'; tip.style.top = (r.bottom + 6) + 'px';
      }, 600);
    });
    document.addEventListener('mouseout', e => { if (e.target === tipEl || tipEl?.contains(e.target)) hide(); });
    document.addEventListener('mousedown', hide);
    document.addEventListener('scroll', hide, true);
    J.tip = { hide };
  })();

  const hr = new Date().getHours();
  const greet = (hr < 5 ? 'Dobranoc' : hr < 12 ? 'Dzień dobry' : hr < 18 ? 'Witaj' : 'Dobry wieczór');
  const pending = J.tasks.today().filter(t => !t.done && t.time >= J.hhmm());
  const msg = `${greet}. Wszystkie systemy online.` + (pending.length ? ` Następne zadanie: ${pending[0].text} o ${pending[0].time}.` : '');
  J.orb.set('idle', msg);
  setTimeout(() => J.voice.speak(msg), 700);
  if (J.configuredFrom) { const src = J.configuredFrom; J.configuredFrom = null; J.toast('Konfiguracja wczytana z ' + (src === 'url' ? 'adresu (usunięta z paska)' : 'config.local.js') + (S.jevKey ? ' · Jev włączony' : ''), 6000); if (S.jevOn && S.jevKey) setTimeout(() => J.judge.test().then(t => J.notice({ title: 'Jev działa', body: t, kind: 'agent' })).catch(e => J.notice({ title: 'Jev: błąd połączenia', body: e.message, kind: 'hermes' })), 1500); }
  if (J.configViaQuery) { J.configViaQuery = false; setTimeout(() => J.notice({ title: 'Klucz był w adresie strony', body: 'Adres z „?” trafia do serwera, na którym leży strona. Następnym razem użyj znaku # (index.html#jevKey=…) albo pliku config.local.js. Jeśli strona jest publiczna, rozważ wygenerowanie nowego klucza.', kind: 'hermes' }), 3000); }
  const un = J.notifs.unread(); if (un && Date.now() - (J.lastToastAt || 0) > 8000) setTimeout(() => J.toast('Masz ' + un + ' ' + J.pl(un, 'nieprzeczytane powiadomienie', 'nieprzeczytane powiadomienia', 'nieprzeczytanych powiadomień') + ' (Alt+N)', 5000), 2500);
});
})();
