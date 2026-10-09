/* js/bg-gl.js: wybór trybu (plan), skala, fallbacki (caveat → null, błąd shadera, utrata/przywrócenie kontekstu, forced-colors),
   rysowanie na atrapie WebGL2 (wypiek raz, uniformy z ustawień/impulsów, still/run/pauza/okno pod spodem), API dla regulatora */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../harness.js');
const fs = require('fs'), path = require('path');

/* atrapa WebGL2: zapisuje wywołania; nazwy uniformów bierze z kodu fragment shadera, więc test widzi, co faktycznie ustawiono */
const mockGl = (o = {}) => {
  const calls = [], draws = [], pdraws = [], U = {}; let cur = null;   // pdraws: osobny program cząstek (Faza 5B) — nie liczy się do przebiegów sceny
  const impl = {
    createShader: t => ({ t, src: '' }), shaderSource: (sh, s) => { sh.src = s; }, getShaderParameter: () => !o.badShader, getShaderInfoLog: () => 'zły shader',
    createProgram: () => ({ src: '', id: Math.random() }), attachShader: (p, sh) => { if (sh.t === 'VERTEX_SHADER') p.vsrc = sh.src; else p.src = sh.src; }, getProgramParameter: (p, k) => k === 'ACTIVE_UNIFORMS' ? uniNames(p).length : true,
    getActiveUniform: (p, i) => ({ name: uniNames(p)[i] }), getUniformLocation: (p, n) => n, useProgram: p => { cur = p; },
    getExtension: n => o.ext && o.ext[n] || null,
    drawArrays: (m, f, n) => (/in vec4 vc/.test(cur.src) ? pdraws : draws).push({ prog: cur, set: { ...U }, n }),
    getParameter: () => false, createQuery: () => ({}),
  };
  const uniNames = p => { const a = []; for (const m of ((p.vsrc || '') + p.src).matchAll(/uniform\s+\w+\s+([\w,\s]+);/g)) a.push(...m[1].split(',').map(x => x.trim())); return a; };
  const gl = new Proxy({}, { get: (_, k) => k in impl ? impl[k] : /^[A-Z_0-9]+$/.test(k) ? k : (...a) => { calls.push([k, ...a]); if (/^uniform/.test(k)) U[a[0]] = a.slice(1); } });
  return { gl, calls, draws, pdraws, U };
};

const setup = ({ rank = 2, gl = mockGl(), glNull = false, mq = false, wall = 'neon', accent } = {}) => {
  const mqo = { matches: mq, addEventListener() { } }, win = {};   // mqo: wspólny obiekt MediaQueryList (test przełącza matches po starcie); win: słuchacze okna (resize)
  const J = load({ dom: true, globals: { matchMedia: () => mqo, addEventListener: (n, f) => { win[n] = f; } }, state: accent ? { settings: { hermesOn: false, accent } } : undefined });
  const ctx = J.__ctx, doc = ctx.document, app = doc.querySelector('#app'); app.dataset.wall = wall;
  const listeners = {}, ctxArgs = [], cvs = [];
  const baseCreate = doc.createElement;
  doc.createElement = tag => {
    const e = baseCreate(tag);
    if (tag === 'canvas') { e.getContext = (k, a) => { ctxArgs.push([k, a]); return glNull ? null : gl.gl; }; e.addEventListener = (n, f) => { listeners[n] = f; }; e.remove = () => { e.removed = true; }; cvs.push(e); }
    return e;
  };
  let r = rank; J.fx = { rank: () => r };
  const B = J.bgGl; let now = 1000;
  const frame = (cov = false) => { now += 16; B.frame(now, cov); };
  return { J, B, app, gl, mqo, win, listeners, ctxArgs, cvs, frame, setRank: v => { r = v; }, ctx, now: () => now };
};

test('plan: tryby wg tapety, poziomu, skupienia, prezentacji, fallbacku i karty w tle', () => {
  const { B } = setup(), base = { wall: 'neon', rank: 2, focus: false, present: false, hold: false, fb: false, hidden: false };
  const p = o => B.plan({ ...base, ...o });
  assert.equal(p({}), 'run'); assert.equal(p({ rank: 3 }), 'run');
  assert.equal(p({ wall: 'photo' }), 'off'); assert.equal(p({ wall: 'void' }), 'off');
  assert.equal(p({ rank: 0 }), 'still'); assert.equal(p({ rank: 1 }), 'still');
  assert.equal(p({ focus: true }), 'still'); assert.equal(p({ present: true }), 'still'); assert.equal(p({ hold: true }), 'still');
  assert.equal(p({ fb: true }), 'fb'); assert.equal(p({ hidden: true }), 'pause'); assert.equal(p({ fb: true, rank: 0 }), 'fb');
});

test('skala: domyślnie 0,65; ≤ 640 px nie większa niż 0,5; granice 0,3–1; setScale zaokrągla i ignoruje śmieci', () => {
  const { B } = setup();
  assert.equal(B.scale, .65); assert.equal(B.scaleFor(.65, false), .65); assert.equal(B.scaleFor(.65, true), .5); assert.equal(B.scaleFor(.4, true), .4);
  assert.equal(B.scaleFor(5, false), 1); assert.equal(B.scaleFor(0.01, false), .3);
  assert.equal(B.setScale(.7149), .71); assert.equal(B.setScale('x'), .71); assert.equal(B.setScale(-1), .71); assert.equal(B.setScale(9), 1);
});

test('szum mgły: 256², deterministyczny, pełny zakres, kafelkowy (szew nie skacze)', () => {
  const { B } = setup(), a = B.noise(), b = B.noise();
  assert.equal(a.length, 256 * 256 * 4); assert.deepEqual(a, b);
  let lo = 255, hi = 0, seam = 0, inner = 0;
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const v = a[(y * 256 + x) * 4]; lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (let y = 0; y < 256; y++) { seam += Math.abs(a[(y * 256 + 255) * 4] - a[(y * 256) * 4]); inner += Math.abs(a[(y * 256 + 100) * 4] - a[(y * 256 + 101) * 4]); }
  assert.ok(lo <= 2 && hi >= 253); assert.ok(seam < inner * 2 + 256, `szew ${seam} vs wnętrze ${inner}`);
});

test('caveat → null: ścieżka .bg-fb bez pętli; atrybuty kontekstu zgodne z planem (low-power, bez AA, caveat)', () => {
  const t = setup({ glNull: true }); t.frame(); t.frame(); t.frame();
  assert.equal(t.B.failed, true); assert.equal(t.B.mode, 'fb'); assert.ok(t.app.classList.contains('bg-fb')); assert.equal(t.B.active, false);
  assert.equal(t.ctxArgs.length, 1, 'jedna próba, bez ponawiania');
  const [k, a] = t.ctxArgs[0]; assert.equal(k, 'webgl2');
  assert.deepEqual([a.antialias, a.alpha, a.powerPreference, a.failIfMajorPerformanceCaveat, a.preserveDrawingBuffer], [false, false, 'low-power', true, false]);
});

test('błąd kompilacji shadera → .bg-fb; tapeta inna niż neon: GL w ogóle się nie tworzy', () => {
  const t = setup({ gl: mockGl({ badShader: true }) }); t.frame();
  assert.equal(t.B.failed, true); assert.match(t.B.err, /zły shader/); assert.ok(t.app.classList.contains('bg-fb'));
  const u = setup({ wall: 'photo' }); u.frame(); u.frame();
  assert.equal(u.ctxArgs.length, 0); assert.equal(u.B.mode, 'off'); assert.ok(!u.app.classList.contains('bg-fb'));
});

test('forced-colors / prefers-contrast → .bg-fb bez tworzenia kontekstu', () => {
  const t = setup({ mq: true }); t.frame();
  assert.equal(t.ctxArgs.length, 0); assert.equal(t.B.mode, 'fb'); assert.ok(t.app.classList.contains('bg-fb'));
});

test('rysowanie: wypiek raz, potem jeden przebieg na klatkę; uniformy z ustawień, stanu i aktywności', () => {
  const t = setup({ accent: '#ff0000' }); t.J.fxd.glow = '0,255,0'; t.J.fxd.actOut = .5;
  t.frame(); const g = t.gl;
  assert.equal(t.B.mode, 'run'); assert.ok(t.B.active); assert.equal(t.B.W, Math.floor(1400 * .65)); assert.equal(t.B.H, Math.floor(800 * .65));
  assert.equal(g.draws.length, 2, 'wypiek + klatka'); assert.equal(t.B.bakes, 1);
  const bake = g.draws[0].set, fr = g.draws[1].set;
  assert.deepEqual(bake.uAcc.map(x => +x.toFixed(2)), [1, 0, 0]); assert.ok('uAcc2' in bake && 'uHz' in bake && 'uRes' in bake);
  for (const k of ['uRes', 'uAcc', 'uAcc2', 'uSt', 'uHz', 'uT', 'uGrid', 'uPulse', 'uMk', 'uM']) assert.ok(k in fr, 'brak uniformu ' + k);
  assert.deepEqual(fr.uRes, [t.B.W, t.B.H]); assert.equal(fr.uPulse[0], 99); assert.equal(fr.uMk[0], 0, 'kursor tylko w cinema');
  t.frame(); t.frame(); assert.equal(g.draws.length, 4); assert.equal(t.B.bakes, 1, 'brak ponownego wypieku');
  assert.ok(g.draws[3].set.uGrid[0] > g.draws[1].set.uGrid[0], 'siatka płynie (aktywność > 0)');
  assert.ok(g.draws[3].set.uSt[1] > 0, 'kolor stanu dąży do zielonego');
});

test('zmiana akcentu (settings) → ponowny wypiek; zmiana skali → nowy rozmiar i wypiek', () => {
  const t = setup({ accent: '#ff0000' }); t.frame(); t.frame(); assert.equal(t.B.bakes, 1);
  t.J.state.settings.accent = '#00ff00'; t.J.emit('settings', {}); t.frame(); assert.equal(t.B.bakes, 2);
  assert.deepEqual(t.gl.draws[t.gl.draws.length - 2].set.uAcc.map(x => +x.toFixed(2)), [0, 1, 0]);
  t.B.setScale(.5); t.frame(); assert.equal(t.B.W, 700); assert.equal(t.B.bakes, 3);
});

test('impuls fx-director → uPulse i uMk w cinema; aberracja (3. przebieg) tylko po błędzie w cinema', () => {
  const t = setup({ rank: 3 }); t.frame(); t.gl.draws.length = 0;
  t.J.fxd.pulseAt = t.now() - 400; t.J.fxd.pulseKind = 'ok'; t.frame();
  assert.equal(t.gl.draws.length, 1); assert.ok(Math.abs(t.gl.draws[0].set.uPulse[0] - .416) < .05); assert.equal(t.gl.draws[0].set.uMk[0], 1);
  t.gl.draws.length = 0; t.J.fxd.caAt = t.now() - 100; t.frame();   // aberracja liczy się od caAt (200 ms, realna porażka), nie od pulseKind
  assert.equal(t.gl.draws.length, 2, 'scena do FBO + kompozycja z aberracją'); assert.ok(t.gl.draws[1].set.uK[0] > 0);
  const s = setup({ rank: 2 }); s.frame(); s.gl.draws.length = 0; s.J.fxd.caAt = s.now() - 100; s.frame();
  assert.equal(s.gl.draws.length, 1, 'bez aberracji poniżej cinema');
});

test('still: poziom off/tool, skupienie i prezentacja rysują jedną klatkę; zmiana stanu odświeża; resume przywraca ruch', () => {
  const t = setup({ rank: 1 }); for (let i = 0; i < 5; i++) t.frame();
  assert.equal(t.B.mode, 'still'); assert.equal(t.gl.draws.length, 2, 'wypiek + jedna klatka');
  t.J.fxd.glow = '255,0,0'; t.frame(); assert.equal(t.gl.draws.length, 3, 'zmiana koloru stanu → jedno odświeżenie');
  t.setRank(2); t.frame(); assert.equal(t.B.mode, 'run'); const n = t.gl.draws.length; t.frame(); t.frame(); assert.equal(t.gl.draws.length, n + 2);
  t.app.classList.add('focus'); t.frame(); assert.equal(t.B.mode, 'still'); const m = t.gl.draws.length; t.frame(); t.frame(); assert.equal(t.gl.draws.length, m, 'skupienie: zero rysowania');
  t.app.classList.remove('focus'); t.app.classList.add('present'); t.frame(); assert.equal(t.B.mode, 'still');
  t.app.classList.remove('present'); t.frame(); assert.equal(t.B.mode, 'run');
  t.B.still(); t.frame(); assert.equal(t.B.mode, 'still'); t.B.resume(); t.frame(); assert.equal(t.B.mode, 'run');
});

test('pauza w tle i pod zmaksymalizowanym oknem: brak rysowania; wznowienie po powrocie', () => {
  const t = setup(); t.frame(); const n = t.gl.draws.length;
  t.frame(true); t.frame(true); assert.equal(t.gl.draws.length, n, 'okno przykrywa tło');
  t.ctx.document.hidden = true; t.frame(); t.frame(); assert.equal(t.B.mode, 'pause'); assert.equal(t.gl.draws.length, n);
  t.ctx.document.hidden = false; t.frame(); assert.equal(t.B.mode, 'run'); assert.equal(t.gl.draws.length, n + 1);
});

test('utrata kontekstu → preventDefault, .bg-fb i pauza; przywrócenie → odbudowa i wznowienie', () => {
  const t = setup(); t.frame(); const n = t.gl.draws.length;
  let prevented = false; t.listeners.webglcontextlost({ preventDefault: () => { prevented = true; } });
  assert.ok(prevented); t.frame(); t.frame(); assert.equal(t.B.mode, 'fb'); assert.ok(t.app.classList.contains('bg-fb')); assert.equal(t.B.active, false); assert.equal(t.gl.draws.length, n);
  t.listeners.webglcontextrestored(); t.frame();
  assert.equal(t.B.lost, false); assert.ok(!t.app.classList.contains('bg-fb')); assert.equal(t.B.mode, 'run'); assert.equal(t.B.active, true);
  assert.equal(t.B.bakes, 2, 'tekstury odbudowane'); assert.ok(t.gl.draws.length > n);
});

test('API dla regulatora: gpuMs null bez rozszerzenia, a z rozszerzeniem odczyt zapytania czasowego', () => {
  const t = setup(); t.frame(); assert.equal(t.B.gpuMs(), null); assert.equal(typeof t.B.setScale, 'function'); assert.equal(typeof t.B.still, 'function'); assert.equal(typeof t.B.resume, 'function');
  const ext = { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 }, g = mockGl({ ext: { EXT_disjoint_timer_query_webgl2: ext } });
  const ov = new Proxy(g.gl, { get: (tg, k) => k === 'getQueryParameter' ? (q, p) => p === 'QUERY_RESULT_AVAILABLE' ? true : 4e6 : tg[k] });
  const u = setup({ gl: { ...g, gl: ov } }); u.frame(); u.B.gpuMs(); u.frame(); u.frame();
  assert.equal(u.B.gpuMs(), 4);
});

test('tapeta neon: enum obok void, aliasy (miasto/neon/cyberpunk → neon, jezioro → photo), polecenie z cofnięciem i kolejność', async () => {
  const J = load({ state: { settings: { hermesOn: false, wall: 'photo' } } });
  assert.deepEqual(Array.from(J.registry.get('set_wallpaper').args.properties.wallpaper.enum), ['neon', 'photo', 'aurora', 'void']);
  const al = J.registry.aliases.wallpaper, who = w => Array.from(al.filter(([, re]) => re.test(w)).map(([v]) => v));
  for (const w of ['neon', 'cyberpunk', 'miasto', 'noc']) assert.deepEqual(who(w), ['neon'], w);
  assert.deepEqual(who('jezioro'), ['photo']); assert.deepEqual(who('aurora'), ['aurora']); assert.deepEqual(who('pustka'), ['void']);
  const r = await J.registry.run('set_wallpaper', { wallpaper: 'neon' }, { source: 'local' });
  assert.equal(r.ok, true, r.text); assert.equal(J.state.settings.wall, 'neon');
  const n = await J.registry.run('set_wallpaper', {}, { source: 'local' }); assert.equal(J.state.settings.wall, 'photo', 'następna po neon');
  assert.equal(n.ok, true);
});

test('jedna pętla rAF: bg-gl nie ma własnego rAF, a main.js woła J.bgGl.frame po dławieniu bezczynności i pauzie w tle', () => {
  const fs = require('fs'), path = require('path'), R = f => fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8');
  assert.ok(!/requestAnimationFrame/.test(R('js/bg-gl.js')), 'bg-gl.js: brak własnego rAF');
  const m = R('js/main.js'), loop = m.indexOf('const loop = now =>'), call = m.indexOf('J.bgGl?.frame(now, cov)'), rest = m.indexOf('resting()) { requestAnimationFrame(loop); return; }'), hid = m.indexOf('if (document.hidden)', loop);
  assert.ok(loop > 0 && hid > loop && rest > hid && call > rest, 'kolejność: pauza w tle → dławienie → rysowanie tła');
  const idx = R('index.html'); assert.ok(idx.indexOf('js/fx-director.js') < idx.indexOf('js/bg-gl.js') && idx.indexOf('js/bg-gl.js') < idx.indexOf('js/main.js'), 'kolejność skryptów: fx-director → bg-gl → main');
});

test('podłoga neonu: uniformy odbicia/pierścieni/cząstek/strefy Orba, klasa gl-on tylko przy aktywnej scenie GL', () => {
  const t = setup(); t.J.fxd.actOut = .6; t.frame();
  const fr = t.gl.draws[1].set, bk = t.gl.draws[0].set;
  for (const k of ['uAct', 'uFoot', 'uOrbR', 'uPt']) assert.ok(k in fr, 'brak uniformu ' + k);
  assert.ok('uZone' in bk, 'strefa Orba w wypieku'); assert.equal(fr.uAct[0], .6); assert.equal(fr.uPt[0], 1, 'cząstki: ustawienie particles domyślnie włączone');
  assert.ok(t.app.classList.contains('gl-on'), 'kanwa #fx znika z układu');
  t.J.state.settings.particles = false; t.frame(); assert.equal(t.gl.draws.at(-1).set.uPt[0], 0, 'ustawienie „Cząsteczki” wyłącza pył w shaderze');
  const f = setup({ glNull: true }); f.frame(); assert.ok(f.app.classList.contains('bg-fb')); assert.ok(!f.app.classList.contains('gl-on'), 'fallback: sieć #fx i jezioro działają po staremu');
  const p = setup({ wall: 'photo' }); p.frame(); assert.ok(!p.app.classList.contains('gl-on'));
});

/* faza 3D: luki wykryte mutacjami kontrolnymi */
test('przełączenie forced-colors / prefers-contrast PO starcie → .bg-fb, a po powrocie scena wraca', () => {
  const t = setup(); t.frame(); t.frame(); assert.equal(t.B.mode, 'run'); assert.ok(!t.app.classList.contains('bg-fb'));
  t.mqo.matches = true; t.frame(); assert.equal(t.B.mode, 'fb'); assert.ok(t.app.classList.contains('bg-fb')); const n = t.gl.draws.length; t.frame(); assert.equal(t.gl.draws.length, n, 'w fb nie rysuje');
  t.mqo.matches = false; t.frame(); assert.equal(t.B.mode, 'run'); assert.ok(!t.app.classList.contains('bg-fb'));
});
test('fail(): canvas usunięty z DOM, żadnych dalszych prób rysowania', () => {
  const t = setup({ gl: mockGl({ badShader: true }) }); t.frame();
  assert.ok(t.B.failed); assert.ok(t.cvs.length >= 1 && t.cvs.every(c => c.removed), 'canvas.remove() wywołane'); const n = t.cvs.length; t.frame(); t.frame(); assert.equal(t.cvs.length, n, 'brak ponownego tworzenia');
});
test('horyzont: clamp .35–.78 (szeroki) i .5–.66 (wąski ≤ 640 px) liczony od wysokości ekranu', () => {
  const run = (vw, horizon) => { const t = setup(); t.ctx.innerWidth = vw; t.ctx.innerHeight = 800; t.J.hud = { ver: 1, scene: { H: 800, horizon, top: 0, R: 100, foot: 700 } }; t.frame(); return t.B.hz; };
  assert.equal(run(1400, 5000), .22, 'za nisko → y .78'); assert.equal(run(1400, -500), .65, 'za wysoko → y .35');
  assert.equal(run(1400, 400), .5, 'w zakresie bez zmian'); assert.equal(run(500, 5000), .34); assert.equal(run(500, -500), .5);
});
test('resize → ponowne policzenie geometrii (rozmiar bufora i wypiek)', () => {
  const t = setup(); t.frame(); t.frame(); const W = t.B.W, bk = t.B.bakes; assert.equal(W, 910);
  t.ctx.innerWidth = 1000; t.win.resize(); t.frame(); assert.equal(t.B.W, 650, 'nowa szerokość × skala'); assert.ok(t.B.bakes > bk, 'ponowny wypiek');
});

test('cząstki GL (Faza 5B): tylko cinema i tylko przy ustawieniu „Cząsteczki”; jeden draw gl.POINTS do tego samego bufora; budżet 6 tys. w kroku 100 %', () => {
  const c = setup({ rank: 3 }); for (let i = 0; i < 3; i++) c.frame();
  assert.ok(c.gl.pdraws.length >= 1, 'cinema rysuje cząstki'); assert.equal(c.gl.pdraws.at(-1).n, 6000); assert.equal(c.B.partN, 6000);
  assert.ok(c.gl.calls.some(k => k[0] === 'blendFunc' && k[1] === 'ONE' && k[2] === 'ONE'), 'blend addytywny'); assert.ok(c.gl.calls.some(k => k[0] === 'disable' && k[1] === 'BLEND'), 'blend zdjęty po cząstkach');
  const s = setup({ rank: 2 }); for (let i = 0; i < 3; i++) s.frame(); assert.equal(s.gl.pdraws.length, 0, 'standard: zero cząstek'); assert.equal(s.B.partN, 0);
  const o = setup({ rank: 3 }); o.J.state.settings.particles = false; for (let i = 0; i < 3; i++) o.frame(); assert.equal(o.gl.pdraws.length, 0, 'ustawienie „Cząsteczki” wyłączone');
  assert.equal(c.B.partCount(3, true, 0), 6000); assert.equal(c.B.partCount(3, true, 1), 3000); assert.equal(c.B.partCount(3, true, 3), 0); assert.equal(c.B.partCount(2, true, 0), 0); assert.equal(c.B.partCount(3, false, 0), 0);
});

test('cząstki GL: ≤ 640 px (telefon) bez cząstek niezależnie od poziomu; 641 px i szerzej — pełny budżet', () => {
  for (const [w, n] of [[390, 0], [600, 0], [640, 0], [641, 6000], [1600, 6000]]) {
    const t = setup({ rank: 3 }); t.ctx.innerWidth = w; t.ctx.innerHeight = 800; for (let i = 0; i < 3; i++) t.frame();
    assert.equal(t.B.partN, n, 'partN przy ' + w); assert.equal(t.gl.pdraws.length > 0, n > 0, 'draw cząstek przy ' + w); assert.equal(t.B.partOn(), n > 0, 'partOn przy ' + w);
  }
  assert.equal(setup({ rank: 3 }).B.partCount(3, true, 0, true), 0);
});

test('cząstki GL: deszcz ∝ engine.rain (realny strumień znaków), iskry tylko od realnego zdarzenia (uAge/uK z fx-director), bez zdarzenia uAge=99', () => {
  const t = setup({ rank: 3 }); t.frame(); t.frame(); let u = t.gl.pdraws.at(-1).set;
  assert.equal(u.uRain[0], 0, 'bez strumienia znaków deszczu nie ma'); assert.equal(u.uAge[0], 99, 'bez zdarzenia nie ma iskier'); assert.ok(u.uDust[0] <= .16, 'w spoczynku minimalny pył: ' + u.uDust[0]);
  t.J.engine.rain = .6; t.J.fxd.sparkAt = t.now() - 250; t.J.fxd.sparkK = .5; t.frame(); u = t.gl.pdraws.at(-1).set;
  assert.ok(Math.abs(u.uRain[0] - .6) < 1e-9); assert.ok(u.uAge[0] > .2 && u.uAge[0] < .3, 'wiek iskier od sparkAt: ' + u.uAge[0]); assert.equal(u.uK[0], .5);
  assert.match(fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'bg-gl.js'), 'utf8'), /al=step\(e,uK\)\*lf\*lf/, 'życie iskier kończy się razem z uAge .9 s (lf)');
});

test('cząstki GL: regulator zmniejsza liczbę punktów (kroki 100/50/25/0 %), nie ma czego zmniejszać poniżej cinema, reset przy zmianie poziomu efektów', () => {
  const t = setup({ rank: 3 }); t.frame(); t.frame();
  assert.equal(t.B.partShed(), true); t.frame(); assert.equal(t.gl.pdraws.at(-1).n, 3000);
  assert.equal(t.B.partShed(), true); t.frame(); assert.equal(t.gl.pdraws.at(-1).n, 1500);
  assert.equal(t.B.partShed(), true); t.frame(); assert.equal(t.B.partN, 0); assert.equal(t.B.partShed(), false, 'dno: nic więcej do zdjęcia');
  assert.equal(t.B.partCanGrow(), true); assert.equal(t.B.partGrow(), true); t.frame(); assert.equal(t.B.partN, 1500);
  t.B.partReset(); t.frame(); assert.equal(t.B.partN, 6000);
  t.setRank(2); assert.equal(t.B.partShed(), false); assert.equal(t.B.partCanGrow(), false);
});
