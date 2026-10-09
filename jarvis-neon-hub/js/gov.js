'use strict';
/* Regulator czasu klatki (zastępuje dawne adapt() z main.js) — działa WEWNĄTRZ J.fx, nie zamiast.
   Pokrętła, w tej kolejności: (0) liczba cząstek GL (host.shed: 100 → 50 → 25 → 0 %; tania i mało widoczna strata, w górę dopiero po powrocie skali do pełnej),
   (1) skala rozdzielczości warstwy WebGL (J.bgGl.setScale, kroki GOV_STEPS × skala bazowa),
   (2) gdy skala jest na dnie (albo nie ma czego skalować) i klatki dalej za długie ≥ 5 s → J.fx.lower().
   Sygnał: czas GPU z J.bgGl.gpuMs() (EXT_disjoint_timer_query_webgl2) — koszt znany bez limitu vsync, więc zbieżność bez „próbowania”;
   bez timera: p85 dt z rAF względem ZMIERZONEGO okresu vsync (niski kwantyl dt z ~8 s, przyciągnięty do znanych odświeżeń 16,7/20/33,3 ms;
   stałe ≥ 25 ms uznajemy za ekran 30 Hz dopiero po 60 s bez szybkiej klatki (inaczej to ekran 60 Hz z ciężką sceną — slowOk);
   dt jest skwantowane do klatki, więc ekran 30/48 Hz albo pojedyncze szarpnięcia nie są „przeciążeniem” — liczy się tylko to, co wolniejsze od własnego vsync). Czyste jądro (Gov) testowane bez DOM na fałszywym zegarze. */
(() => {
const STEPS = [1, .85, .7, .6, .5, .42];
const OPT = { budget: 14, period: 16.7, win: 800, upWait: 8000, lockMs: 60000, capMs: 60000, lowerMs: 5000, probeMs: 2500, warm: 3000, cool: 1200, vsWin: 8000, vsEvery: 500, slowMs: 60000, slowFrom: 25, fastN: 30 };
const VSYNC = [1000 / 60, 20, 1000 / 30];   // znane okresy odświeżania (60/50/30 Hz); 120/144 Hz liczymy jak 60 (cel to 60 FPS)

function Gov(host, o) {
  o = this.o = Object.assign({}, OPT, o); this.h = host; this.steps = o.steps || STEPS; this.i = 0;
  this.dtW = []; this.gW = []; this.warmUntil = null; this.coolUntil = 0; this.lockUntil = 0; this.last = 0;
  this.lowSince = 0; this.stableSince = 0; this.probe = null; this.fails = 0; this.changes = 0; this.trace = [];
  this.vW = []; this.vsAt = 0; this.per = o.period; this.vsOk = false;
  this.t0 = null; this.fastAt = 0; this.fastN = 0; this.hint = host.hint?.() || null;   // dowody „ekran wolny / szybki”: patrz slowOk
}
const q = (a, p) => { if (!a.length) return 0; const v = a.map(x => x[1]).sort((x, y) => x - y); return v[Math.min(v.length - 1, Math.floor(v.length * p))]; };
const prune = (a, now, ms) => { while (a.length > 5 && now - a[0][0] > ms) a.shift(); };   // przy bardzo wolnych klatkach zostaje ≥ 5 próbek
const ready = (a, now) => a.length >= 20 || (a.length >= 5 && now - a[0][0] >= 500);
/* czy stałe ≥ 25 ms (30 Hz) wolno uznać za vsync ekranu, a nie za scenę, która na ekranie 60 Hz mieści się tylko w co drugiej klatce (dt skwantowane do 33,3 ms — wyglądają tak samo).
   Rozstrzyga dopiero długa obserwacja: przez ≥ 60 s (od startu albo od ostatniej szybkiej klatki, rozruch też się liczy) nie było ani jednej klatki < 25 ms. Zapamiętany w sessionStorage
   dowód „wolny” (po przeładowaniu) skraca to do braku szybkiej klatki w tej sesji; dowód „szybki” (≥ 30 szybkich klatek) zakazuje uznania ekranu za wolny. W razie wątpliwości = 60 Hz, regulator reaguje */
Gov.prototype.slowOk = function (now) {
  if (this.hint === 'fast' || this.t0 == null) return false;
  if (this.hint === 'slow' && !this.fastAt) return true;
  return now - Math.max(this.t0, this.fastAt) >= this.o.slowMs;
};
/* zmierzony okres vsync: niski kwantyl dt z dłuższego okna, tylko gdy rozkład jest wąski (p50 ≈ p10) i pasuje do znanego odświeżania;
   wolny, ale niestały render (albo nietypowy dt) nie podnosi celu — wtedy zostaje 16,7 ms i regulator działa jak dotąd */
Gov.prototype.vsync = function (now) {
  const o = this.o; this.vW.push([now, this.dtW.length ? this.dtW[this.dtW.length - 1][1] : 0]); prune(this.vW, now, o.vsWin);
  if (now - this.vsAt < o.vsEvery) return; this.vsAt = now;
  const a = this.vW; if (a.length < 30 || now - a[0][0] < 2000) return; this.vsOk = true;
  const p10 = q(a, .1), p50 = q(a, .5); let per = o.period;
  if (p50 <= p10 * 1.1) { const k = VSYNC.find(v => Math.abs(p10 - v) / v < .08); if (k && (k < o.slowFrom || this.slowOk(now))) per = Math.max(o.period, k); }
  if (per >= o.slowFrom && this.hint !== 'slow') { this.hint = 'slow'; this.h.saveHint?.('slow'); }
  this.per = per;
};
Gov.prototype.scale = function () { return this.steps[this.i]; };
Gov.prototype.floor = function () { return this.i >= this.steps.length - 1; };
Gov.prototype.reset = function (now, ms) { this.dtW.length = 0; this.gW.length = 0; this.coolUntil = now + (ms == null ? this.o.cool : ms); this.lowSince = 0; this.stableSince = 0; };
Gov.prototype.set = function (i, now, why) { if (i === this.i) return false; this.i = i; this.changes++; this.trace.push([Math.round(now), this.steps[i], why]); if (this.trace.length > 24) this.trace.shift(); this.h.setStep?.(i, this.steps[i], why); this.reset(now); return true; };
/* czas wstrzymania podnoszenia: 8 s po sukcesie, po 2 nieudanych próbach wykładniczo (16, 32, 60 s…) */
Gov.prototype.upWait = function () { const o = this.o; return Math.min(o.capMs, o.upWait * (this.fails >= 2 ? Math.pow(2, this.fails - 1) : 1)); };
Gov.prototype.fail = function () { this.fails++; this.probe = null; this.stableSince = 0; };
Gov.prototype.doLower = function (now, why) {
  const was = this.probe; this.probe = null; const ok = this.h.lower?.(why); this.lowSince = 0;
  if (ok) { this.lockUntil = now + this.o.lockMs; if (was || (this.lastRaise && now - this.lastRaise < 20000)) this.fails++; this.reset(now, 2000); }
  return ok;
};
/* now = ms (performance.now), dt = czas klatki (ms), gpu = czas GPU warstwy (ms) albo null. Zwraca true, gdy zmieniła się skala. */
Gov.prototype.update = function (now, dt, gpu) {
  const o = this.o;
  if (this.warmUntil == null) this.warmUntil = now + o.warm;                       // start strony: rozruch i dekodowanie nie liczą się
  if (this.last && now - this.last > 1000) { this.reset(now, 1500); this.probe = null; }   // okres vsync zostaje (ten sam ekran), pomiar reakcji liczymy od nowa   // karta w tle / zawieszenie: zaczynamy pomiar od nowa
  this.last = now; if (dt > 1000) return false;
  if (this.t0 == null) this.t0 = now;
  if (dt < this.o.slowFrom) { this.fastAt = now; if (++this.fastN === this.o.fastN && this.hint !== 'fast') { this.hint = 'fast'; this.h.saveHint?.('fast'); } else if (this.hint === 'slow') { this.hint = null; this.h.saveHint?.(''); } }   // szybka klatka: to nie jest ekran 30 Hz
  this.dtW.push([now, Math.min(dt, 250)]); prune(this.dtW, now, o.win); this.vsync(now);
  if (gpu != null && gpu > 0) { this.gW.push([now, gpu]); prune(this.gW, now, o.win); } else this.gW.length = 0;
  if (now < this.warmUntil || now < this.coolUntil || !this.vsOk || !ready(this.dtW, now)) return false;   // bez znanego vsync nie oceniamy (30 Hz wyglądałoby na przeciążenie)
  const h = this.h, scalable = !!h.scalable?.(), useG = scalable && ready(this.gW, now);
  const P = this.per, B = o.budget * P / o.period;   // okres vsync i budżet GPU względem niego
  const pDt = q(this.dtW, .85), pG = useG ? q(this.gW, .9) : 0;
  const dtOver = pDt > B * 1.5, cpuBound = useG && pG < B * .5, atFloor = !scalable || this.floor();
  /* (2) dno skali, a klatki dalej > 1,5× budżetu przez 5 s → niższy poziom efektów */
  if (dtOver && (atFloor || cpuBound)) { this.lowSince = this.lowSince || now; if (now - this.lowSince > o.lowerMs) { this.doLower(now, 'p90 ' + pDt.toFixed(1) + ' ms'); return false; } } else this.lowSince = 0;
  /* trwa próba wzrostu: po probeMs bez przekroczenia = sukces; przekroczenie = cofnięcie i licznik porażek */
  const over = useG ? pG > B * .85 : pDt > P * 1.15;
  if (this.probe) {
    const pr = this.probe, el = now - pr.at;
    if (over && el > 1000) { if (pr.kind === 'part') { h.shed?.(); this.fail(); this.reset(now); return true; } if (pr.kind === 'cap') { this.doLower(now, 'próba nieudana'); return false; } const back = pr.from; this.fail(); return this.set(back, now, 'cofnięcie próby'); }
    if (el > o.probeMs) { this.probe = null; this.fails = 0; }
    return false;
  }
  /* (0) za wolno przy działającej warstwie GL → najpierw mniej cząstek (jeden krok na decyzję, potem 1,2 s na ocenę efektu) */
  if (scalable && over && h.shed?.()) { this.stableSince = 0; this.changes++; this.trace.push([Math.round(now), 'cząstki', (useG ? 'gpu ' : 'dt ') + (useG ? pG : pDt).toFixed(1) + ' ms']); if (this.trace.length > 24) this.trace.shift(); this.reset(now); return true; }
  /* (1) za wolno → w dół od razu (bez czekania na histerezę); model kosztu ~ liczba pikseli ~ skala² */
  if (scalable && over && !this.floor()) {
    const p = useG ? pG : pDt, t = this.steps[this.i] * Math.sqrt((useG ? B * .8 : P * .9) / p); let ni = this.i + 1;
    while (ni < this.steps.length - 1 && this.steps[ni] > t) ni++;
    this.stableSince = 0; return this.set(ni, now, (useG ? 'gpu ' : 'dt ') + p.toFixed(1) + ' ms');
  }
  /* podnoszenie z histerezą: stabilnie ≥ upWait; najpierw skala, dopiero potem poziom efektów (po ≥ 60 s od ostatniego obniżenia) */
  const climb = scalable && this.i > 0;   // skala rośnie tylko gdy warstwa naprawdę rysuje (w trybie still nie ma dowodu, że się zmieści)
  const nextOk = climb ? (useG ? pG * Math.pow(this.steps[this.i - 1] / this.steps[this.i], 2) < B * .7 : pDt <= P * 1.06) : pDt <= P * 1.06;
  const canPart = scalable && this.i === 0 && !!h.canGrow?.();   // cząstki wracają ostatnie: dopiero gdy skala jest już pełna
  const canCap = (this.i === 0 || !scalable) && h.capped?.() && now >= this.lockUntil;   // próba wyższego poziomu efektów zostawia skalę na ostatniej bezpiecznej (nie wraca do pełnej)
  if (nextOk && (climb || canPart || canCap) && !over && pDt <= P * 1.1) {
    this.stableSince = this.stableSince || now;
    if (now - this.stableSince > this.upWait()) {
      this.stableSince = 0;
      if (climb) { const from = this.i, ch = this.set(this.i - 1, now, 'próba w górę'); this.probe = { kind: 'scale', from, at: now }; return ch; }
      if (canPart) { if (h.grow?.()) { this.probe = { kind: 'part', at: now }; this.changes++; this.trace.push([Math.round(now), 'cząstki+', 'próba w górę']); this.reset(now); return true; } }
      else if (h.raise?.()) { this.probe = { kind: 'cap', at: now }; this.lastRaise = now; this.reset(now); }
    }
  } else this.stableSince = 0;
  return false;
};

J.Gov = Gov;
/* podłączenie do aplikacji: host czyta J.fx / J.bgGl leniwie (main.js powstaje później) */
let base = 0;
const VSK = 'jarvis-vs';   // dowód o ekranie na czas sesji karty (sessionStorage; bez niego pomiar zaczyna się od zera)
const host = {
  hint: () => { try { const v = sessionStorage.getItem(VSK); return v === 'slow' || v === 'fast' ? v : null; } catch (e) { return null; } },
  saveHint: v => { try { sessionStorage.setItem(VSK, v); } catch (e) { } },
  scalable: () => !!J.bgGl?.active && J.bgGl.mode === 'run',
  setStep(i, s, why) { const B = J.bgGl; if (!B) return; if (!base) base = B.scale; B.setScale(i === 0 ? base : base * s); J.log?.('Efekty', 'Regulator: skala tła ' + (i === 0 ? base : Math.round(base * s * 100) / 100) + ' (' + why + ', FPS ' + J.fps + ')'); },
  lower: why => J.fx?.lower?.(why) || false,
  raise: () => J.fx?.raise?.() || false,
  capped: () => (J.fx?.cap ?? 3) < 3,
  shed: () => J.bgGl?.partShed?.() || false, canGrow: () => J.bgGl?.partCanGrow?.() || false, grow: () => J.bgGl?.partGrow?.() || false
};
const G = J.gov = new Gov(host);
/* wołane co klatkę z pętli rAF (main.js); sygnał GPU tylko gdy warstwa naprawdę rysuje */
const OFF = (() => { try { return /[?&]gov=0(?:&|$)/.test(location.search); } catch (e) { return false; } })();   // ?gov=0: bez regulatora (e2e na SwiftShaderze i diagnostyka — inaczej wolny render programowy obniżałby efekty w trakcie testu)
G.frame = (now, dt) => { if (OFF) return false; const B = J.bgGl; const gpu = B && B.active && B.mode === 'run' ? B.gpuMs() : null; return G.update(now, dt, gpu); };
/* użytkownik sam zmienił poziom efektów: zaczynamy od czystego konta (inne zapisy ustawień nie zdejmują blokady) */
let lv = J.state?.settings?.fxLevel;
J.on?.('settings', () => { const n = J.state?.settings?.fxLevel; if (n !== lv) { lv = n; G.fails = 0; G.probe = null; G.lockUntil = 0; J.bgGl?.partReset?.(); } });
})();
