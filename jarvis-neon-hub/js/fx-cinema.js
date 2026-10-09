/* =========================================================
   JARVIS OS — efekty kinowe od kursora i mikrofonu (Neon Holo-Glass, Faza 5B; tylko poziom cinema)

   Trzy małe mechanizmy, wszystkie w jednej aktualizacji na klatkę (J.cin.frame woła pętla rAF z main.js — własnej pętli nie ma):
   • equalizer mikrofonu — jeden canvas nad dokiem, tylko w stanie LISTENING i tylko gdy istnieje J.ear.analyser (realne FFT); 24 Hz,
     słupki gasną po 1 s ciszy, element znika z DOM po zakończeniu nasłuchu (bez analysera nie powstaje wcale);
   • paralaksa — kursor przesuwa istniejące warstwy właściwością `translate` (osobna od `transform`, więc nie psuje skali Orba ani układu kart HUD):
     Orb i (bez WebGL) sieć cząstek #fx; tło WebGL dostaje J.bgGl.par i przesuwa niebo/miasto/mgłę w shaderze. Ruch tylko podczas ruchu kursora,
     po ~0,4 s bezruchu wraca do zera i zdejmuje styl; karty HUD nie jadą (koszt rastra, patrz C.AMP), więc ich rekty nigdy nie zależą od paralaksy;
   • tilt kart HUD (≤ 3°) — tylko karta pod kursorem, właściwością `rotate` (3D wokół osi w płaszczyźnie karty) + perspektywa na #hud na czas ruchu; spoczynek: rotate none.
   Wyłączone: poniżej cinema (off/tool/standard i ogranicz ruch), skupienie, prezentacja, ekrany dotykowe, karta w tle. Zero odczytów layoutu w klatce
   (jedyny odczyt: rekt karty przy wejściu kursora, w obsłudze zdarzenia).
   ========================================================= */
'use strict';
(() => {
const C = J.cin = { eq: null, px: 0, py: 0, moveAt: 0, cx: 0, cy: 0, tilt: null, parOn: false, ticks: 0 };
const rank = () => J.fx?.rank?.() ?? 0;
const memo = {};
const $ = s => { let e = memo[s]; if (!e || e.isConnected === false) e = memo[s] = document.querySelector(s); return e; };   // elementy trwałe w układzie: jedno zapytanie DOM, nie pięć na klatkę
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const app = () => C.app || (C.app = $('#app'));
const calm = () => { const cl = app()?.classList; return !cl || cl.contains('focus') || cl.contains('present'); };
/* amplitudy paralaksy (px przy skrajnym położeniu kursora): bliżej widza = większe. Karty HUD NIE jadą z paralaksą: pomiar A/B (SwiftShader, scena hud) pokazał −45 % FPS za przesunięcie kontenera #hud
   albo każdej z 9 kart (przemalowanie ich rastra), a Orb i tło kosztują ≈ 0–10 %; karty mają za to tilt (rotate) i zostają w spoczynku nieruchome względem paska, zadania i doku */
C.AMP = { orb: 5, fx: -7 };
C.TILT_MAX = 3;   // stopnie
C.EQ = { bars: 32, w: 640, h: 24, hz: 24, quiet: 1000 };

/* czysta logika bramek (testowana bez DOM) */
C.eqWanted = i => !!i.analyser && i.state === 'listening' && i.rank >= 3 && !i.calm && !i.hidden;
C.parWanted = i => i.rank >= 3 && !i.calm && !i.touch && !i.hidden;
/* słupki z widma: pasma ~równej szerokości w zakresie mowy (bin 1…n·.55), wartość 0–1; zwraca też poziom całkowity */
C.eqBars = (bins, out, decay = .6) => {
  const n = out.length, top = Math.max(n, Math.floor(bins.length * .55)); let sum = 0;
  for (let i = 0; i < n; i++) {
    const a = 1 + Math.floor(i * (top - 1) / n), b = Math.max(a + 1, 1 + Math.floor((i + 1) * (top - 1) / n)); let m = 0;
    for (let k = a; k < b; k++) if (bins[k] > m) m = bins[k];
    const v = m / 255; out[i] = v > out[i] ? v : out[i] * decay + v * (1 - decay); sum += out[i];
  }
  return sum / n;
};
/* wygładzanie paralaksy niezależne od liczby klatek: 1 − e^(−dt/τ) */
C.ease = (cur, tgt, dt, tau = 140) => cur + (tgt - cur) * (1 - Math.exp(-dt / tau));
/* oś i kąt tilt-u z położenia kursora względem karty (nx, ny ∈ [−1, 1]): odchylenie do ≤ max stopni, oś w płaszczyźnie karty */
C.tiltOf = (nx, ny, max = C.TILT_MAX) => { const m = Math.min(1, Math.hypot(nx, ny)); return m < .01 ? null : { ax: +(ny / Math.hypot(nx, ny)).toFixed(3), ay: +(-nx / Math.hypot(nx, ny)).toFixed(3), deg: +(max * m).toFixed(2) }; };

/* ---------- wspólny odczyt kursora ---------- */
const touchy = (() => { try { return matchMedia('(pointer: coarse)'); } catch (e) { return { matches: false }; } })();
let vw = typeof innerWidth === 'number' ? innerWidth : 1280, vh = typeof innerHeight === 'number' ? innerHeight : 720;
addEventListener('resize', () => { vw = innerWidth; vh = innerHeight; });
addEventListener('pointermove', e => {
  if (e.pointerType === 'touch') return;
  C.mx = e.clientX; C.my = e.clientY;
  if (e.buttons) { C.moveAt = 0; return; }   // przeciąganie okna / zaznaczanie: paralaksa wraca do zera i nie dokłada pracy w trakcie gestu
  C.px = clamp(e.clientX / vw * 2 - 1, -1, 1); C.py = clamp(e.clientY / vh * 2 - 1, -1, 1); C.moveAt = performance.now();
}, { passive: true });

/* ---------- tilt kart HUD ---------- */
const hudOn = () => !!$('#hud')?.classList.contains('show');
addEventListener('pointerover', e => {
  if (e.pointerType === 'touch' || rank() < 3 || !(C.TILT_MAX > 0) || !e.target.closest) return;
  const hc = e.target.closest('#hud .hc'); if (!hc || !hudOn()) return;
  C.mx = e.clientX; C.my = e.clientY;
  const t = C.tilt; if (t && t.el === hc) { t.leave = false; return; }
  if (t) tiltDone(t);
  C.tilt = { el: hc, r: hc.getBoundingClientRect(), nx: 0, ny: 0, leave: false };   // jedyny odczyt layoutu: raz przy wejściu kursora
}, { passive: true });
addEventListener('pointerout', e => { const t = C.tilt; if (t && !(e.relatedTarget?.closest?.('#hud .hc') === t.el)) t.leave = true; }, { passive: true });
const tiltDone = t => { t.el.style.rotate = ''; $('#hud')?.classList.remove('tilt'); if (C.tilt === t) C.tilt = null; };
const tiltStep = (dt, on) => {
  const t = C.tilt; if (!t) return;
  if (!on) return tiltDone(t);   // utrata poziomu / skupienie / karta HUD zgasła: natychmiast spoczynek
  const r = t.r, k = t.leave ? 0 : 1, tx = k * clamp((C.mx - (r.left + r.width / 2)) / (r.width / 2), -1, 1), ty = k * clamp((C.my - (r.top + r.height / 2)) / (r.height / 2), -1, 1);
  t.nx = C.ease(t.nx, tx, dt, 90); t.ny = C.ease(t.ny, ty, dt, 90);
  const v = C.tiltOf(t.nx, t.ny);
  if (!v) { if (t.leave) return tiltDone(t); t.el.style.rotate = ''; return; }
  if (!t.set) { $('#hud')?.classList.add('tilt'); t.set = true; }
  t.el.style.rotate = v.ax + ' ' + v.ay + ' 0 ' + v.deg + 'deg';
};

/* ---------- paralaksa ---------- */
const parSet = (el, x, y) => { if (!el) return; const v = x || y ? x.toFixed(1) + 'px ' + y.toFixed(1) + 'px' : ''; if (el._pv !== v) { el._pv = v; el.style.translate = v; } };   // zapis tylko przy zmianie (0,1 px)
const parStep = (now, dt, on) => {
  const still = !on || now - C.moveAt > 400 || !C.moveAt, tx = still ? 0 : C.px, ty = still ? 0 : C.py;
  C.cx = C.ease(C.cx, tx, dt); C.cy = C.ease(C.cy, ty, dt);
  if (still && now - C.moveAt > 700) C.cx = C.cy = 0;   // przy wolnych klatkach wygładzanie nie dobiegłoby do zera na czas: po 0,7 s bezruchu wracamy do spoczynku
  const rest = still && Math.abs(C.cx) < .004 && Math.abs(C.cy) < .004;
  if (rest || !on) { if (C.parOn) { C.parOn = false; C.cx = C.cy = 0; parSet($('#coreWrap'), 0, 0); parSet($('#fx'), 0, 0); if (J.bgGl) J.bgGl.par[0] = J.bgGl.par[1] = 0; } return; }
  C.parOn = true; const A = C.AMP, x = C.cx, y = C.cy;
  parSet($('#coreWrap'), x * A.orb, y * A.orb);
  if (!app()?.classList.contains('gl-on')) parSet($('#fx'), x * A.fx, y * A.fx);
  if (J.bgGl) { J.bgGl.par[0] = x; J.bgGl.par[1] = y; }
};

/* ---------- equalizer mikrofonu ---------- */
const eqMount = () => {
  const host = $('#desktop'); if (!host) return null;
  const cv = document.createElement('canvas'); cv.id = 'eqBars'; cv.width = C.EQ.w; cv.height = C.EQ.h; cv.setAttribute('aria-hidden', 'true'); host.appendChild(cv);
  return C.eq = { cv, g: cv.getContext('2d'), lv: new Float32Array(C.EQ.bars), sc: new Float32Array(C.EQ.bars), bins: null, t: 0, loudAt: performance.now(), blank: false, rgb: '' };
};
const eqUnmount = () => { const e = C.eq; if (!e) return; C.eq = null; try { e.cv.remove(); } catch (x) { } };
const eqStep = (now, want) => {
  let e = C.eq;
  if (!want) return eqUnmount();   // koniec nasłuchu / utrata analysera / niższy poziom: element znika od razu (nic nie zostaje w układzie)
  if (!e) { e = eqMount(); if (!e) return; }
  if (now - e.t < 1000 / C.EQ.hz) return; e.t = now;
  const an = J.ear?.analyser, N = C.EQ.bars;
  if (an) {
    if (!e.bins || e.bins.length !== an.frequencyBinCount) e.bins = new Uint8Array(an.frequencyBinCount);
    an.getByteFrequencyData(e.bins);
    const lvl = C.eqBars(e.bins, e.sc); if (lvl > .06) e.loudAt = now;   // sc: wygładzone widmo „na surowo”, lv: to, co rysujemy
    if (now - e.loudAt > C.EQ.quiet) for (let i = 0; i < N; i++) e.lv[i] *= .7;   // cisza (szum poniżej progu) dłuższa niż 1 s: słupki gasną, mimo że mikrofon coś jeszcze szumi
    else e.lv.set(e.sc);
  }
  let mx = 0; for (let i = 0; i < N; i++) if (e.lv[i] > mx) mx = e.lv[i];
  if (mx < .02) { if (!e.blank) { e.blank = true; e.g.clearRect(0, 0, C.EQ.w, C.EQ.h); } return; }
  e.blank = false;
  const g = e.g, W = C.EQ.w, H = C.EQ.h, bw = W / N, rgb = e.rgb || (e.rgb = J.rgb(J.state?.settings?.accent || '#4df3ff'));
  g.clearRect(0, 0, W, H); g.fillStyle = 'rgb(' + rgb + ')';
  for (let i = 0; i < N; i++) {   // lustrzanie od środka: niskie tony w środku, wysokie na brzegach
    const v = e.lv[i], h = Math.max(1, v * (H - 2)); g.globalAlpha = .25 + v * .7;
    g.fillRect(W / 2 + i * bw / 2 + 1, H - h, Math.max(1, bw / 2 - 2), h); g.fillRect(W / 2 - (i + 1) * bw / 2 + 1, H - h, Math.max(1, bw / 2 - 2), h);
  }
  g.globalAlpha = 1;
};
C.eqOff = () => eqUnmount();

/* wołane raz na klatkę z pętli rAF (main.js) */
let last = 0;
C.frame = now => {
  const dt = last ? Math.min(now - last, 250) : 16; last = now;
  const rk = rank(), cm = calm(), hid = document.hidden, tc = !!touchy.matches;
  const par = C.parWanted({ rank: rk, calm: cm, touch: tc, hidden: hid });
  if (par || C.parOn) parStep(now, dt, par);
  if (C.tilt) tiltStep(dt, rk >= 3 && !cm && hudOn());
  const eq = C.eqWanted({ analyser: J.ear?.analyser, state: J.orb?.state, rank: rk, calm: cm, hidden: hid });
  if (eq || C.eq) eqStep(now, eq);
};
J.on?.('fx', () => { if (rank() < 3) { C.frame(performance.now()); C.eqOff(); } });
})();
