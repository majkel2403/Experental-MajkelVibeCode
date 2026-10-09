/* =========================================================
   JARVIS OS — układ „Stark”: filmowe tło w shaderze WebGL
   Jedno przejście fragment shadera w obniżonej rozdzielczości:
   mgławica, siatka heksów, podłoga w perspektywie z falami od Core,
   wolumetryczne promienie, flara anamorficzna, skan radaru, strumienie
   danych, fale uderzeniowe, winieta, ziarno i linie skanowania.
   Tło jest dekoracją, ale reaguje WYŁĄCZNIE na realne sygnały:
   J.engine (tryb, kolor, aktywność), mikrofon (J.ear.analyser),
   kliknięcia i zdarzenia agenta. Bez WebGL zostaje tapeta CSS.
   Poziomy efektów (J.fx): off = jedna nieruchoma klatka, tool = niska
   rozdzielczość, standard, cinema = pełna jakość.
   ========================================================= */
'use strict';
(() => {
const { $, h } = J;
const S = () => J.state.settings;
const eg = J.engine;
const app = $('#app');

const cv = h('canvas', { id: 'skGL', 'aria-hidden': 'true' });
app.insertBefore(cv, $('#fx'));
const opt = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
let gl = null, v2 = false;
try { gl = cv.getContext('webgl2', opt); v2 = !!gl; if (!gl) gl = cv.getContext('webgl', opt); } catch (e) { gl = null; }

/* ---------- shadery ---------- */
const VS = v2 ? `#version 300 es
in vec2 aP; void main(){ gl_Position = vec4(aP, 0., 1.); }`
  : `attribute vec2 aP; void main(){ gl_Position = vec4(aP, 0., 1.); }`;
const FS_HEAD = v2 ? `#version 300 es
precision highp float; out vec4 fragColor;
#define FRAG fragColor
` : `#extension GL_OES_standard_derivatives : enable
precision highp float;
#define FRAG gl_FragColor
`;
const FS = FS_HEAD + `
uniform vec2 uRes; uniform float uT; uniform vec2 uC; uniform float uR; uniform float uHor;
uniform vec3 uCol; uniform vec3 uCol2; uniform float uAct; uniform float uAud; uniform vec2 uM;
uniform float uQ; uniform float uBoot; uniform vec4 uP0; uniform vec4 uP1; uniform vec4 uP2;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y); }
float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 5; i++) { if (float(i) >= uQ + 2.) break; v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= .5; } return v; }
float hexd(vec2 p){ p = abs(p); return max(dot(p, vec2(.8660254, .5)), p.y); }
vec4 hexcell(vec2 p){ vec2 r = vec2(1., 1.7320508), hh = r * .5; vec2 a = mod(p, r) - hh, b = mod(p - hh, r) - hh;
  vec2 g = dot(a, a) < dot(b, b) ? a : b; return vec4(g, p - g); }
float pulse(vec4 P, vec2 p, float s){ float t = uT - P.z; if (t < 0. || t > 2.4 || P.w <= 0.) return 0.;
  float d = length((p - P.xy) / s), rr = t * .62; return exp(-pow((d - rr) * 26., 2.)) * (1. - t / 2.4) * P.w + exp(-d * 9.) * max(0., .35 - t) * P.w; }

void main(){
  vec2 p = gl_FragCoord.xy, uv = p / uRes; float s = uRes.y;
  vec2 d = (p - uC) / s; float r = length(d), a = atan(d.y, d.x), R = uR / s;
  vec2 dir = vec2(cos(a), sin(a));
  float boot = uBoot, act = uAct, aud = uAud;

  /* tło: głęboki granat + mgławica */
  vec3 col = mix(vec3(.003, .012, .035), vec3(.012, .05, .11), exp(-r * 1.6));
  float n1 = fbm(uv * vec2(2.6, 1.6) + vec2(uT * .008, -uT * .004));
  float n2 = fbm(uv * vec2(5.5, 3.5) - vec2(uT * .015, uT * .006) + n1);
  col += uCol * .13 * pow(n1, 2.6) * 2.2 + uCol2 * .07 * pow(n2, 3.2) * 2.6;

  /* siatka heksów nad horyzontem: krawędzie + losowo zapalane komórki „danych” */
  if (p.y > uHor - 2.) {
    vec4 hc = hexcell(d * 26.);
    float e = .5 - hexd(hc.xy);
    float lw = fwidth(e) * 1.2 + .005;
    float edge = 1. - smoothstep(0., lw, e);
    float ring = smoothstep(.08, .32, r) * smoothstep(1.25, .35, r);
    float tw = step(.992, hash(hc.zw + floor(uT * .5 + hash(hc.zw) * 7.)));
    float wave = .5 + .5 * sin(r * 22. - uT * 1.8);
    col += uCol * (edge * .07 * (.6 + .6 * wave) + tw * .1 * (1. - smoothstep(0., lw * 1.5, e))) * ring * boot;
  }

  /* podłoga w perspektywie z falami od podstawy Core */
  float hy = uHor - p.y;
  if (hy > 0.) {
    float z = (s * .42) / hy;
    vec2 g = vec2((p.x - uC.x) / hy * .42, z - uT * (.22 + act * .5));
    vec2 gw = fwidth(g) * 1.3 + 1e-4;
    vec2 gl2 = abs(fract(g - .5) - .5) / gw;
    float ln = 1. - min(min(gl2.x, gl2.y), 1.);
    float far = exp(-z * .12);
    float fr = length(vec2((p.x - uC.x) / s, hy / s * 2.4));
    col += uCol * ln * far * (.10 + .55 * exp(-fr * 2.6)) * boot;
    float wr = fract(fr * 2.2 - uT * (.18 + act * .9));
    col += uCol * smoothstep(.96, 1., wr) * exp(-fr * 1.8) * (.18 + act * .5) * boot;
    col += uCol * exp(-abs(p.x - uC.x) / s * 5.) * exp(-hy / s * 2.4) * (.16 + act * .3);   // odbicie Core w podłodze
    col *= 1. - .35 * smoothstep(0., s * .5, hy) * (1. - far);
  }
  col += uCol * exp(-abs(p.y - uHor) / s * 90.) * exp(-abs(p.x - uC.x) / s * 1.1) * .32 * boot;   // linia horyzontu

  /* wolumetryczne promienie z Core (ciągłe po kącie: szum na okręgu) */
  float ry = noise(dir * 3.2 + vec2(uT * .11, -uT * .07)) * noise(dir * 7.5 - vec2(uT * .05, uT * .13) + 4.);
  ry = pow(ry, 1.6) * smoothstep(R * .7, R * 1.25, r);
  col += mix(uCol, vec3(.7, .95, 1.), .25) * ry * exp(-(r - R) * 2.4) * (.32 + .9 * act + 1.4 * aud) * boot;

  /* poświata Core */
  col += uCol * exp(-max(r - R, 0.) * 7.) * (.18 + .5 * act + .8 * aud);

  /* skan radaru wokół reaktora */
  float sw = fract(a / 6.2831853 + uT * (.07 + act * .25));
  col += uCol * pow(sw, 14.) * smoothstep(R * 3.1, R * 1.4, r) * step(R * 1.1, r) * (.16 + act * .3) * boot;

  /* flara anamorficzna przez Core */
  float fl = exp(-abs(d.y) * 160.) * exp(-abs(d.x) * 1.3);
  col += mix(uCol, vec3(.85, .97, 1.), .45) * fl * (.22 + .5 * act + .6 * aud) * boot;
  col += uCol2 * exp(-abs(d.y) * 40.) * exp(-abs(d.x) * 3.) * .05;

  /* strumienie danych po bokach ekranu */
  if (uQ > .5) {
    float cw = s * .011, cx = floor(p.x / cw), sp = hash(vec2(cx, 3.1));
    float yy = fract(p.y / uRes.y * (1. + sp) + uT * (.04 + sp * .12) + sp * 17.);
    float side = smoothstep(.22, .38, abs(uv.x - .5));
    col += uCol * pow(yy, 40.) * step(.9, sp) * .28 * side * boot;
  }

  /* fale uderzeniowe: zdarzenia agenta i kliknięcia */
  col += mix(uCol, vec3(1.), .3) * (pulse(uP0, p, s) + pulse(uP1, p, s) + pulse(uP2, p, s)) * .55;

  /* światło kursora */
  col += uCol * .05 * exp(-length((p - uM) / s) * 6.);

  /* rozruch: energia rozchodzi się od Core */
  float br = boot * 1.9;
  col *= smoothstep(br, br - .25, r) * .85 + .15;
  col += uCol * exp(-pow((r - br) * 18., 2.)) * (1. - boot) * 1.6;

  /* postprodukcja: tone mapping, winieta, linie, ziarno */
  col = 1. - exp(-col * 1.35);
  col *= 1. - .62 * pow(length((uv - .5) * vec2(1.05, 1.25)), 2.3);
  col *= .965 + .035 * sin(p.y * 2.1 + uT * 3.);
  col += (hash(p + fract(uT * 7.3) * 91.) - .5) * .028;
  col = pow(max(col, 0.), vec3(.94));
  FRAG = vec4(col, 1.);
}`;

let prog = null, U = {}, buf = null;
const build = () => {
  const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader'); return s; };
  if (!v2 && !gl.getExtension('OES_standard_derivatives')) throw new Error('brak OES_standard_derivatives');
  prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
  gl.useProgram(prog);
  buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'aP'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  ['uRes', 'uT', 'uC', 'uR', 'uHor', 'uCol', 'uCol2', 'uAct', 'uAud', 'uM', 'uQ', 'uBoot', 'uP0', 'uP1', 'uP2'].forEach(n => { U[n] = gl.getUniformLocation(prog, n); });
};
let ok = false;
if (gl) { try { build(); ok = true; } catch (e) { console.warn('[stark-fx] WebGL niedostępny:', e.message); ok = false; } }

/* ---------- stan i sygnały ---------- */
const t0 = performance.now();
let bootAt = performance.now(), W = 0, H = 0, scale = .55, lastDraw = 0, mx = -1e4, my = -1e4, movedAt = 0, staticDone = false, lost = false;
const pulses = [[0, 0, -99, 0], [0, 0, -99, 0], [0, 0, -99, 0]]; let pi = 0;
const now = () => (performance.now() - t0) / 1000;
/* fala uderzeniowa w punkcie ekranu (px względem #app) */
const pulse = (x, y, strength = 1) => { pulses[pi] = [x, y, now(), strength]; pi = (pi + 1) % 3; };
const col = [.2, .84, 1], col2 = [.64, .36, 1];
const rgbOf = s => String(s || '').split(',').map(v => (+v || 0) / 255);
let audio = 0; const freq = new Uint8Array(128);
const QS = { off: [.35, 0], tool: [.35, 0], standard: [.55, 1], cinema: [.8, 3] };
const active = () => ok && !lost && app.dataset.layout === 'stark' && S().wall === 'photo';

const resize = () => {
  const lv = J.fx?.level?.() || 'standard', [sc] = QS[lv] || QS.standard;
  scale = sc; const dpr = Math.min(devicePixelRatio || 1, 2);
  W = Math.max(2, Math.round(innerWidth * dpr * sc)); H = Math.max(2, Math.round(innerHeight * dpr * sc));
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  staticDone = false;
};
addEventListener('resize', resize);
J.on('fx', resize);

/* geometria Core z hud.js (piksele #desktop) → piksele płótna, oś Y od dołu */
const coreGeo = () => {
  const sc = J.hud?.scene, dsk = $('#desktop'); if (!sc || !dsk) return null;
  const top = dsk.getBoundingClientRect().top, k = W / innerWidth;
  return { x: sc.cx * k, y: H - (sc.cy + top) * k, R: sc.R * k, hor: H - (sc.foot + top + 4) * k };
};

/* mikrofon: realna głośność z analizatora (gdy Jarvis słucha) */
const readAudio = () => {
  const an = J.ear?.analyser; if (!an) { audio *= .9; J.starkFx.freq = null; return; }
  an.getByteFrequencyData(freq); let sum = 0; for (let i = 2; i < 64; i++) sum += freq[i];
  const lv = J.clamp(sum / 62 / 160, 0, 1); audio += (lv - audio) * .35; J.starkFx.freq = freq;
};

/* zdarzenia agenta → fale od Core */
let lastMode = eg.mode;
const watchMode = g => {
  if (eg.mode === lastMode) return; const m = eg.mode; lastMode = m;
  if (!g) return; const k = innerWidth / W, x = g.x * k, y = (H - g.y) * k;
  if (m === 'EXECUTING') pulse(x, y, .7); else if (m === 'COMPLETED') pulse(x, y, 1.2); else if (m === 'ERROR') pulse(x, y, 1); else if (m === 'LISTENING') pulse(x, y, .6);
};

const frame = ts => {
  requestAnimationFrame(frame);
  const on = active();
  app.classList.toggle('sk-gl', on);
  if (!on || document.hidden) return;
  const lv = J.fx?.level?.() || 'standard', [, q] = QS[lv] || QS.standard;
  readAudio();
  const busy = !!eg.taskId || audio > .02 || performance.now() - movedAt < 4000 || performance.now() - bootAt < 4000 || pulses.some(p => now() - p[2] < 2.4);
  if (lv === 'off') { if (staticDone) return; }
  else if (ts - lastDraw < (busy ? 15 : lv === 'tool' ? 66 : 33)) return;   // spoczynek: ~30 kl./s (oszczędne ~15), w ruchu 60
  lastDraw = ts;
  const g = coreGeo(); if (!g) return;
  watchMode(g);
  const target = rgbOf(eg.rgb() || J.rgb(S().accent)), t2 = rgbOf(J.rgb(S().accent2));
  for (let i = 0; i < 3; i++) { col[i] += (target[i] - col[i]) * .08; col2[i] += (t2[i] - col2[i]) * .08; }
  const k = W / innerWidth, t = lv === 'off' ? 12 : now();
  gl.viewport(0, 0, W, H);
  gl.uniform2f(U.uRes, W, H); gl.uniform1f(U.uT, t); gl.uniform2f(U.uC, g.x, g.y); gl.uniform1f(U.uR, g.R); gl.uniform1f(U.uHor, g.hor);
  gl.uniform3f(U.uCol, col[0], col[1], col[2]); gl.uniform3f(U.uCol2, col2[0], col2[1], col2[2]);
  gl.uniform1f(U.uAct, J.clamp(eg.activity, 0, 1)); gl.uniform1f(U.uAud, audio);
  gl.uniform2f(U.uM, mx * k, H - my * k); gl.uniform1f(U.uQ, q);
  gl.uniform1f(U.uBoot, lv === 'off' ? 1 : J.clamp((performance.now() - bootAt) / 2600, 0, 1));
  [U.uP0, U.uP1, U.uP2].forEach((u, i) => { const p = pulses[i]; gl.uniform4f(u, p[0] * k, H - p[1] * k, p[2], p[3]); });
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  staticDone = true;
};

cv.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; app.classList.remove('sk-gl'); });
cv.addEventListener('webglcontextrestored', () => { try { build(); lost = false; staticDone = false; } catch (e) { lost = true; } });
addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; movedAt = performance.now(); }, { passive: true });
/* kliknięcie w element HUD (panele Starka, dok, reaktor) → fala w miejscu kliknięcia */
addEventListener('pointerdown', e => { if (active() && e.target.closest?.('.stark button, .sk-reactor button, .dock button, .core')) pulse(e.clientX, e.clientY, .8); }, { passive: true });

J.starkFx = { ok, pulse, freq: null, get audio() { return audio; }, replayBoot() { bootAt = performance.now(); staticDone = false; } };
resize();
requestAnimationFrame(frame);
})();
