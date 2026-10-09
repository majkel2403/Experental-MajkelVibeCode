#!/usr/bin/env node
// build-mobile.mjs — generate the mobile board: a live phone-sized cockpit that runs the SAME 3D engine as Main
// (scenario "medytacja"): scene canvas, last four messages, working player (play/pause, restart, speed, scrubber).
// The engine is copied from Main.dc.html (everything from `const DUR` to `class Component`), so rerun this after engine changes.
// usage: node tools/build-mobile.mjs [out.html]   (default project/Mobile.dc.html)
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'project/Mobile.dc.html');
const main = fs.readFileSync(path.join(ROOT, 'project/Main.dc.html'), 'utf8');
const code = /<script type="text\/x-dc" data-dc-script([^>]*)>([\s\S]*?)<\/script>/.exec(main)[2];
const SCEN = new Function(code.slice(0, code.indexOf('const DUR')) + '\nreturn SCEN;')();
const sc = SCEN.find((s) => s.id === 'medytacja');
const engine = code.slice(code.indexOf('const DUR'), code.indexOf('class Component extends DCLogic'));

const MONO = "font-family:'IBM Plex Mono',ui-monospace,monospace";
const BRIC = "font-family:'Bricolage Grotesque','Segoe UI',system-ui,sans-serif";
const logo = (w) => `<svg viewBox="0 0 32 32" width="${w}" height="${w}" fill="none" stroke="#F2C14E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="16" cy="16" r="5"/><path d="M11 15C8 14.5 5.5 12.8 3.5 9.5"/><path d="M11 18C8.5 18.2 6 17.5 4 15.5"/><path d="M21 15C24 14.5 26.5 12.8 28.5 9.5"/><path d="M21 18C23.5 18.2 26 17.5 28 15.5"/><path d="M16 21v7"/></svg>`;
const legendItem = (letter, name, color) => `      <li style="display:flex;align-items:center;gap:6px;height:16px"><span style="flex:none;width:16px;height:16px;border-radius:4px;background:${color};color:#0B1020;text-align:center;${MONO};font-weight:500;font-size:12px;line-height:16px">${letter}</span><span style="${MONO};font-size:12px;line-height:16px;color:#C5CEE8">${name}</span></li>`;

const template = `<helmet>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Instrument+Sans:wght@400..700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
body{margin:0;background:#05070F}
button{font-family:inherit;color:inherit}
:focus-visible{outline:2px solid #F2C14E;outline-offset:2px}
a:focus-visible{outline-offset:-2px}
.mb-range{-webkit-appearance:none;appearance:none;width:100%;height:44px;margin:0;background:transparent;cursor:pointer}
.mb-range::-webkit-slider-runnable-track{height:4px;background:#5F6D9F;border-radius:2px}
.mb-range::-moz-range-track{height:4px;background:#5F6D9F;border-radius:2px}
.mb-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:12px;height:24px;margin-top:-10px;border-radius:3px;background:#F2C14E;border:0}
.mb-range::-moz-range-thumb{width:12px;height:24px;border-radius:3px;background:#F2C14E;border:0}
@keyframes mb-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.mb-msg{animation:mb-in .35s ease-out both}
@media (prefers-reduced-motion: reduce){.mb-msg{animation:none}}
</style>
</helmet>

<div style="position:relative;width:390px;height:844px;overflow:hidden;box-sizing:border-box;display:flex;flex-direction:column;background:#070B1C;color:#E8ECF8;font-family:'Instrument Sans','Segoe UI',system-ui,sans-serif;font-size:14px;line-height:1.5">

  <header style="flex:none;height:46px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;padding:0 16px;border-bottom:1px solid #1B2554">
    <a href="Main.dc.html" aria-label="Hermes, wróć do centrum dowodzenia" style="align-self:stretch;display:flex;align-items:center;gap:8px;margin:0;text-decoration:none;color:#E8ECF8">
      ${logo(28)}
      <span style="${BRIC};font-weight:800;font-size:19px;line-height:24px;letter-spacing:-0.01em;color:#E8ECF8">Hermes</span>
    </a>
    <div style="display:flex;align-items:center;gap:7px;height:28px;box-sizing:border-box;padding:0 12px 0 10px;border-radius:999px;border:1px solid #34406B;background:#161F3D;white-space:nowrap">
      <span style="flex:none;width:6px;height:6px;border-radius:50%;background:{{statusDot}}"></span>
      <span style="font-size:12.5px;line-height:16px;font-weight:600;color:#E8ECF8"><span>{{phaseLabel}}</span> · <span style="${MONO};font-weight:500;font-size:12px;color:#A3AED0">{{timeNow}} / 1:00</span></span>
    </div>
  </header>

  <section aria-label="Zadanie" style="flex:none;height:54px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;padding:0 16px">
    <h1 style="margin:0;${BRIC};font-weight:800;font-size:20px;line-height:24px;letter-spacing:-0.01em;color:#E8ECF8;white-space:nowrap">Premiera aplikacji do medytacji</h1>
    <p style="margin:0;font-size:13px;line-height:18px;color:#A3AED0;white-space:nowrap"><span style="color:#F2C14E;font-weight:600">Hermes</span> złożył zespół: <span style="${MONO};font-weight:500;color:#E8ECF8">{{agentCount}}</span> z 7 agentów</p>
  </section>

  <section aria-label="Neuronowa przestrzeń zespołu" style="flex:none;position:relative;width:390px;height:288px;box-sizing:border-box;overflow:hidden;border-top:1px solid #1B2554;border-bottom:1px solid #1B2554;background:#04060F">
    <canvas id="hm-cv" role="img" aria-label="{{sceneAria}}" onPointerDown="{{cvDown}}" onPointerMove="{{cvMove}}" onPointerUp="{{cvUp}}" onPointerCancel="{{cvCancel}}" onLostPointerCapture="{{cvCancel}}" style="position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab"></canvas>
    <ul aria-label="Linie robocze" style="position:absolute;left:8px;top:8px;margin:0;padding:6px 8px;list-style:none;display:flex;flex-direction:column;gap:3px;background:rgba(8,13,30,0.8);border:1px solid rgba(132,152,255,0.22);border-radius:10px">
${legendItem('R', 'Badania', '#6DB6FF')}
${legendItem('C', 'Tworzenie', '#FFAE5C')}
${legendItem('Q', 'Jakość', '#4FF0D8')}
${legendItem('D', 'Dostawa', '#D6BEFF')}
    </ul>
    <div aria-hidden="true" style="position:absolute;right:10px;top:10px;${MONO};font-size:12px;line-height:16px;color:#A3AED0;text-shadow:0 0 6px #04060F">przeciągnij, aby obrócić</div>
  </section>

  <section aria-label="Strumień wiadomości" style="flex:1 1 0;min-height:0;display:flex;flex-direction:column;padding:6px 16px 0">
    <div style="flex:none;display:flex;align-items:center;justify-content:space-between;height:20px">
      <h2 style="margin:0;${MONO};font-weight:500;font-size:12px;line-height:16px;letter-spacing:.06em;text-transform:uppercase;color:#A3AED0">Strumień · demo</h2>
      <span style="${MONO};font-size:12px;line-height:16px;color:#A3AED0">{{feedCount}}</span>
    </div>
    <ol style="list-style:none;margin:0;padding:0;flex:1 1 auto;min-height:0;display:flex;flex-direction:column;justify-content:flex-end">
      <sc-for list="{{feed}}" as="m" hint-placeholder-count="4">
      <li class="mb-msg" style="flex:1 0 auto;display:flex;flex-direction:column;justify-content:center;padding:6px 0;border-top:1px solid #1B2554">
        <div style="display:flex;align-items:center;gap:7px;height:16px;white-space:nowrap">
          <span style="${MONO};font-weight:500;font-size:12px;line-height:16px;color:#A3AED0">{{m.time}}</span>
          <span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;line-height:16px;font-weight:600;color:#E8ECF8"><span style="flex:none;width:6px;height:6px;border-radius:50%;background:{{m.fromColor}}"></span>{{m.fromName}}</span>
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#7F8BB3" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h16M14 6l6 6-6 6"/></svg>
          <span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;line-height:16px;font-weight:600;color:#E8ECF8"><span style="flex:none;width:6px;height:6px;border-radius:50%;background:{{m.toColor}}"></span>{{m.toName}}</span>
          <span style="margin-left:auto;${MONO};font-weight:500;font-size:12px;line-height:16px;letter-spacing:.06em;text-transform:uppercase;color:{{m.kindColor}}">{{m.kindLabel}}</span>
        </div>
        <p style="margin:3px 0 0;font-size:13px;line-height:18px;color:#B5BFDC">{{m.text}}<sc-if value="{{m.hasAttach}}" hint-placeholder-val="{{ false }}"><span style="display:inline-flex;align-items:center;gap:5px;height:20px;box-sizing:border-box;margin-left:6px;padding:0 7px;vertical-align:middle;border:1px solid #34406B;border-radius:6px;background:#161F3D;${MONO};font-size:12px;line-height:16px;color:#E8ECF8;white-space:nowrap"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#A3AED0" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7z"/><path d="M14 3v4h4"/></svg>{{m.attach}}</span></sc-if></p>
      </li>
      </sc-for>
    </ol>
  </section>

  <footer style="flex:none;height:72px;box-sizing:border-box;display:flex;align-items:center;gap:8px;padding:0 16px;background:#0C1228;border-top:1px solid #1B2554">
    <button type="button" onClick="{{togglePlay}}" aria-label="{{playAria}}" style="flex:none;width:44px;height:44px;box-sizing:border-box;margin:0;padding:0;display:flex;align-items:center;justify-content:center;border:0;border-radius:50%;background:#F2C14E;cursor:pointer">
      <sc-if value="{{isPlaying}}" hint-placeholder-val="{{ false }}"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#1A1300" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/></svg></sc-if>
      <sc-if value="{{notPlaying}}" hint-placeholder-val="{{ true }}"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#1A1300" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg></sc-if>
    </button>
    <button type="button" onClick="{{restart}}" aria-label="Odtwórz od początku" style="flex:none;width:44px;height:44px;box-sizing:border-box;margin:0;padding:0;display:flex;align-items:center;justify-content:center;border:1px solid #34406B;border-radius:50%;background:#161F3D;cursor:pointer">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#E8ECF8" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.7 9.7 0 0 0-6.7 2.8L3 8"/><path d="M3 3v5h5"/></svg>
    </button>
    <div style="flex:1 1 0;min-width:0">
      <input type="range" class="mb-range" min="0" max="600" step="1" value="{{scrubValue}}" onChange="{{onScrub}}" aria-label="Oś czasu przebiegu" aria-valuetext="{{timeNow}} z 1:00"/>
    </div>
    <div role="group" aria-label="Prędkość odtwarzania" style="flex:none;display:flex;gap:4px">
      <sc-for list="{{speeds}}" as="sp" hint-placeholder-count="3">
      <button type="button" onClick="{{sp.pick}}" aria-pressed="{{sp.active}}" aria-label="{{sp.aria}}" style="width:44px;height:44px;box-sizing:border-box;margin:0;padding:0;border:1px solid {{sp.border}};border-radius:10px;background:{{sp.bg}};cursor:pointer;${MONO};font-weight:500;font-size:13px;color:#E8ECF8">{{sp.label}}</button>
      </sc-for>
    </div>
  </footer>

</div>
`;

const component = `
const T0 = 36;
class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { t: T0, playing: false, speed: 1 };
    this._raf = 0;
    this._last = null;
    this._clock = 0;
    this._sceneT = T0;
    this._uiT = T0;
    this._uiPush = 0;
    this._orbitAngle = 0;
    this._cv = null;
    this._q = 2;
    this._qLock = 0;
    this._ft = 6;
    this._fi = 0.016;
    this._ftN = 0;
    this._vis = true;
    this._drag = null;
    this._rm = false;
    this._cam = { yaw: 0.55, pitch: 0.72, dyaw: 0, dpitch: 0, dist: 380, zoom: 1, zoomT: 1, tx: 0, ty: 0, tz: 0 };
    try { this._rm = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { this._rm = false; }
  }

  componentDidUpdate() {
    if (this.state.t !== this._uiT) { this._sceneT = this.state.t; this._uiT = this.state.t; }
  }

  draw(dt) {
    if (typeof document !== 'undefined' && document.hidden) return;
    const cv = this._cv && this._cv.isConnected ? this._cv : (this._cv = typeof document !== 'undefined' && typeof document.getElementById === 'function' ? document.getElementById('hm-cv') : null);
    if (!cv || !cv.getContext) return;
    if (this._ftN % 20 === 0) {
      try { const br = cv.getBoundingClientRect(); this._vis = br.bottom > -80 && br.top < (window.innerHeight || 1e5) + 80; } catch (e) { this._vis = true; }
    }
    if (!this._vis) { this._ftN++; return; }
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
    const W = cv.clientWidth;
    const H = cv.clientHeight;
    if (W < 40 || H < 40) return;
    const pw = Math.round(W * dpr);
    const ph = Math.round(H * dpr);
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    const cam = this._cam;
    if (!this._drag && !this._rm) this._orbitAngle += (dt || 0.016) * 0.07;
    const ci = this._rm ? { zoom: 1, pitch: 0, yaw: 0 } : camIntro(this._sceneT);
    cam.dist = 380 / ci.zoom;
    cam.pitch = 0.72 + cam.dpitch + ci.pitch;
    cam.yaw = 0.55 + this._orbitAngle + cam.dyaw + ci.yaw;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    draw3d(ctx, W, H, { m: prep3d(SCEN[0]), t: this._sceneT, fx: this._clock, q: this._q, rm: this._rm, cam, dpr, sel: null, hover: null, safe: null, cards: false, k: 0.82 });
    if (t0) {
      this._ft = this._ft * 0.92 + (performance.now() - t0) * 0.08;
      this._ftN++;
      if (this._ftN % 60 === 0 && (this._ft > 16 || this._fi > 0.036) && this._q > 0) { this._q--; this._qLock = this._ftN + 900; }
      else if (this._ftN % 60 === 0 && this._ft < 7 && this._fi < 0.02 && this._q < 2 && this._ftN > this._qLock) this._q++;
    }
  }

  componentDidMount() {
    if (typeof window !== 'undefined' && window.__HM_TEST) window.__HM_TEST.logic = this;
    const loop = (now) => {
      this._raf = requestAnimationFrame(loop);
      if (this._last == null) this._last = now;
      const dt = Math.min(0.1, (now - this._last) / 1000);
      this._last = now;
      this._clock += dt;
      this._fi = this._fi * 0.95 + dt * 0.05;
      if (this.state.playing) {
        this._sceneT = Math.min(DUR, this._sceneT + dt * this.state.speed);
        if (now - this._uiPush >= 100 || this._sceneT >= DUR) {
          this._uiPush = now;
          this._uiT = this._sceneT;
          if (this._sceneT >= DUR) this.setState({ t: DUR, playing: false });
          else this.setState({ t: this._sceneT });
        }
      }
      this.draw(dt);
    };
    this._raf = requestAnimationFrame(loop);
  }

  componentWillUnmount() {
    cancelAnimationFrame(this._raf);
  }

  renderVals() {
    const S = this.state;
    const t = clamp(S.t, 0, DUR);
    const P = prep(SCEN[0]);
    const phase = t < PH[1] ? 0 : t < PH[2] ? 1 : t < PH[3] ? 2 : t < DUR ? 3 : 4;
    const seen = P.ev.filter((e) => e.t <= t);
    const who = (id) => {
      if (id === 'hermes') return { name: 'Hermes', color: GOLD };
      if (id === 'user') return { name: 'Ty', color: '#E8ECF8' };
      const a = P.byId[id];
      return { name: a.short, color: NEON[a.line] };
    };
    const feed = seen.slice(-4).map((e) => {
      const f = who(e.from);
      const to = who(e.to);
      return { time: mmss(e.t), fromName: f.name, fromColor: f.color, toName: to.name, toColor: to.color, kindLabel: KIND[e.kind].label, kindColor: KIND[e.kind].color, text: e.text, hasAttach: !!e.attach, attach: e.attach || '' };
    });
    const agentCount = P.agents.filter((a) => t >= a.spawn).length;
    return {
      statusDot: S.playing ? GOLD : '#7F8BB3',
      phaseLabel: t >= DUR ? 'Zakończono' : PH_LABELS[Math.min(phase, 3)],
      timeNow: mmss(t),
      agentCount,
      sceneAria: 'Przestrzeń neuronowa zespołu w chwili ' + mmss(t) + ': powołanych agentów ' + agentCount + ' z 7. Przeciągnij, aby obrócić widok.',
      feed,
      feedCount: 'ostatnie ' + feed.length + ' z ' + seen.length,
      isPlaying: !!S.playing,
      notPlaying: !S.playing,
      playAria: S.playing ? 'Wstrzymaj przebieg' : 'Odtwórz przebieg',
      togglePlay: () => {
        const s = this.state;
        if (s.playing) { this._uiT = this._sceneT; this.setState({ playing: false, t: this._sceneT }); return; }
        this.setState({ t: s.t >= DUR ? 0 : s.t, playing: true });
      },
      restart: () => { this.setState({ t: 0, playing: true }); },
      scrubValue: Math.round(t * 10),
      onScrub: (e) => { this.setState({ t: clamp(Number(e.target.value) / 10, 0, DUR), playing: false }); },
      speeds: [1, 2, 4].map((v) => ({ label: v + '×', aria: 'Prędkość ' + v + '×', active: S.speed === v, bg: S.speed === v ? '#232C4E' : '#0E1530', border: S.speed === v ? GOLD : '#34406B', pick: () => this.setState({ speed: v }) })),
      cvDown: (e) => {
        if (e.button !== 0 || e.isPrimary === false) return;
        const cv = e.currentTarget;
        try { cv.setPointerCapture(e.pointerId); } catch (x) { /* optional */ }
        this._drag = { x: e.clientX, y: e.clientY };
        cv.style.cursor = 'grabbing';
      },
      cvMove: (e) => {
        const d = this._drag;
        if (!d) return;
        this._cam.dyaw -= (e.clientX - d.x) * 0.006;
        this._cam.dpitch = clamp(this._cam.dpitch + (e.clientY - d.y) * 0.004, -0.5, 0.6);
        d.x = e.clientX; d.y = e.clientY;
      },
      cvUp: (e) => {
        this._drag = null;
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (x) { /* ignore */ }
        e.currentTarget.style.cursor = 'grab';
      },
      cvCancel: (e) => {
        this._drag = null;
        try { e.currentTarget.style.cursor = 'grab'; } catch (x) { /* ignore */ }
      },
    };
  }
}
`;

const html = `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<title>Widok mobilny</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
${template}</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":390,"height":844}}'>
const SCEN = [${JSON.stringify(sc)}];
${engine}${component}</script>
</body>
</html>
`;
fs.writeFileSync(out, html);
console.log('Mobile board written:', out, html.length, 'bytes');
