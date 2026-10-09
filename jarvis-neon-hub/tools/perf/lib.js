/* Wspólna biblioteka narzędzi pomiarowych Jarvis OS (tools/perf). Bez zależności npm: Playwright bierzemy z PLAYWRIGHT_MODULE
   (ścieżka do katalogu modułu) albo z require('playwright'), jeśli jest zainstalowany.
   Zmienne środowiskowe:
     JARVIS_URL         adres działającej aplikacji (domyślnie http://localhost:8080); bez końcowego /index.html
     PLAYWRIGHT_MODULE  np. /opt/node-tools/node_modules/playwright
     CHROMIUM_PATH      ścieżka do chrome/chromium (domyślnie przeglądarka Playwrighta)
     FONTS_DIR          opcjonalnie: katalog z local.css + plikami woff2 podstawianymi za Google Fonts (pomiar offline)
     PERF_SOFTWARE_GL=0 wyłącza wymuszenie programowego GL (SwiftShader) — na laptopie z GPU ustaw 0 */
'use strict';
const fs = require('fs'), path = require('path');
const requirePw = () => { try { return require(process.env.PLAYWRIGHT_MODULE || 'playwright'); } catch (e) { throw new Error('Brak Playwrighta: ustaw PLAYWRIGHT_MODULE=/ścieżka/do/playwright albo npm i -D playwright (' + e.message + ')'); } };
const URL = () => (process.env.JARVIS_URL || 'http://localhost:8080').replace(/\/(index\.html)?$/, '');
const FPS_VIEW = { w: 1600, h: 900 };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const median = a => { const s = a.filter(x => x != null && !Number.isNaN(x)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

/* instrumentacja odczytów layoutu: liczy odczyty (getBoundingClientRect, offset*, client*, scroll*, getComputedStyle),
   odczyty w callbackach rAF oraz „wymuszone” = odczyt po zapisie do DOM w tym samym zadaniu (przybliżenie: flaga zerowana mikrozadaniem) */
const INSTR = () => {
  const S = window.__lr = { reads: 0, inRaf: 0, forced: 0, forcedInRaf: 0, byApi: {} };
  let dirty = false, inRaf = false;
  const mark = () => { if (!dirty) { dirty = true; queueMicrotask(() => { dirty = false; }); } };
  const hit = name => { S.reads++; if (inRaf) S.inRaf++; if (dirty) { S.forced++; if (inRaf) S.forcedInRaf++; S.byApi[name] = (S.byApi[name] || 0) + 1; } };
  const wrapM = (proto, name) => { const o = proto[name]; if (!o) return; proto[name] = function (...a) { hit(name); return o.apply(this, a); }; };
  const wrapG = (proto, name) => { const d = Object.getOwnPropertyDescriptor(proto, name); if (!d || !d.get) return; Object.defineProperty(proto, name, { ...d, get() { hit(name); return d.get.call(this); } }); };
  ['getBoundingClientRect', 'getClientRects'].forEach(n => wrapM(Element.prototype, n));
  ['offsetWidth', 'offsetHeight', 'offsetTop', 'offsetLeft', 'clientWidth', 'clientHeight', 'clientTop', 'clientLeft', 'scrollWidth', 'scrollHeight', 'scrollTop', 'scrollLeft'].forEach(n => wrapG(HTMLElement.prototype, n));
  wrapG(Element.prototype, 'scrollTop'); wrapG(Element.prototype, 'scrollHeight'); wrapG(Element.prototype, 'clientWidth'); wrapG(Element.prototype, 'clientHeight');
  { const o = window.getComputedStyle; window.getComputedStyle = function (...a) { const cs = o.apply(this, a); return new Proxy(cs, { get(t, k) { if (k === 'getPropertyValue' || (typeof k === 'string' && !(k in Object.prototype))) hit('getComputedStyle'); const v = Reflect.get(t, k, t); return typeof v === 'function' ? v.bind(t) : v; } }); }; }
  ['setAttribute', 'removeAttribute', 'appendChild', 'insertBefore', 'removeChild', 'replaceChildren', 'append', 'prepend', 'remove', 'insertAdjacentHTML'].forEach(n => wrapW(Element.prototype, n));
  function wrapW(proto, name) { const o = proto[name]; if (!o) return; proto[name] = function (...a) { mark(); return o.apply(this, a); }; }
  ['add', 'remove', 'toggle'].forEach(n => { const o = DOMTokenList.prototype[n]; DOMTokenList.prototype[n] = function (...a) { mark(); return o.apply(this, a); }; });
  { const o = CSSStyleDeclaration.prototype.setProperty; CSSStyleDeclaration.prototype.setProperty = function (...a) { mark(); return o.apply(this, a); }; }
  { const d = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'cssText'); Object.defineProperty(CSSStyleDeclaration.prototype, 'cssText', { ...d, set(v) { mark(); d.set.call(this, v); } }); }
  { const d = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML'); Object.defineProperty(Element.prototype, 'innerHTML', { ...d, set(v) { mark(); d.set.call(this, v); } }); }
  { const d = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent'); Object.defineProperty(Node.prototype, 'textContent', { ...d, set(v) { mark(); d.set.call(this, v); } }); }
  { const o = window.requestAnimationFrame; window.requestAnimationFrame = function (cb) { return o.call(this, t => { inRaf = true; try { return cb(t); } finally { inRaf = false; } }); }; }
};

/* open: uruchamia przeglądarkę, omija boot/onboarding (ziarno localStorage), czeka na #app.on.
   Opcje: width,height,dsf,webgl(true),reducedMotion,seed,stopAtBoot,settleMs,url,instr(false),launchArgs[] */
async function open(o = {}) {
  const { chromium } = requirePw();
  const args = ['--no-sandbox', '--enable-precise-memory-info', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', ...(o.launchArgs || [])];
  if (o.webgl !== false && process.env.PERF_SOFTWARE_GL !== '0') args.push('--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist');
  const b = await chromium.launch({ args, executablePath: process.env.CHROMIUM_PATH || undefined });
  const ctx = await b.newContext({ viewport: { width: o.width || FPS_VIEW.w, height: o.height || FPS_VIEW.h }, deviceScaleFactor: o.dsf || 1, reducedMotion: o.reducedMotion || 'no-preference', colorScheme: 'dark' });
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', e => p.errs.push('PAGE: ' + e));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource|CORS/.test(m.text())) p.errs.push('console: ' + m.text().slice(0, 300)); });
  const FD = process.env.FONTS_DIR;
  if (FD && fs.existsSync(path.join(FD, 'local.css'))) {
    await p.route(/^https:\/\/fonts\.googleapis\.com\//, r => r.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync(path.join(FD, 'local.css'), 'utf8').replace(/url\(([^)]+\.woff2)\)/g, 'url(https://fonts.gstatic.com/s/local/$1)') }));
    await p.route(/^https:\/\/fonts\.gstatic\.com\/s\/local\//, r => r.fulfill({ status: 200, contentType: 'font/woff2', body: fs.readFileSync(path.join(FD, r.request().url().split('/').pop())) }));
  }
  /* sieć zewnętrzna zablokowana: pomiar ma być powtarzalny i bez czekania na timeouty */
  await p.route(/^(?!http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/|https:\/\/fonts\.g).*$/, r => r.abort());
  await p.route(/^https:\/\/fonts\.g/, r => (FD ? r.fallback() : r.abort()));
  await p.addInitScript(() => {
    window.__lt = [];
    try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ entryTypes: ['longtask'] }); } catch (e) { }
  });
  const base = (o.url || URL()) + '/index.html';
  await p.goto(base + '?' + Date.now(), { waitUntil: 'domcontentloaded' });
  /* ziarno jak w tests/e2e/smoke.js; zapis umierającej strony wyłączony, żeby nie nadpisał ziarna */
  await p.evaluate(seed => {
    if (window.J) { const noop = () => { }; Object.defineProperty(J, 'save', { get: () => noop, set: () => { } }); Object.defineProperty(J, 'saveNow', { get: () => noop, set: () => { } }); }
    localStorage.clear();
    localStorage.setItem('jarvis-os:v2', JSON.stringify(seed));
  }, o.seed || { settings: { hermesOn: false, speech: false, sound: false }, ui: { onboarded: true, tourDone: true } });
  if (o.instr) await p.addInitScript(INSTR);
  await p.goto(base + '?' + (o.query ? o.query + '&' : '') + Date.now(), { waitUntil: 'domcontentloaded' });
  const cdp = await ctx.newCDPSession(p);
  if (o.stopAtBoot) return { b, ctx, p, cdp };
  try { await p.waitForSelector('#bootEnter.show', { timeout: 30000 }); await p.click('#bootEnter', { timeout: 5000 }); } catch (e) { await p.keyboard.press('Enter'); }
  await p.waitForFunction(() => document.querySelector('#app')?.classList.contains('on') && !document.querySelector('#boot:not(.hidden):not(.gone)')?.offsetParent, null, { timeout: 30000 }).catch(() => { });
  await p.waitForTimeout(o.settleMs ?? 3000);
  await cdp.send('Performance.enable');
  return { b, ctx, p, cdp };
}

/* wymuś poziom efektów (regulator jakości wyłączony): 'off'|'tool'|'standard'|'cinema' */
const forceFx = (p, level = 'cinema') => p.evaluate(lv => { const S = J.settings || J.state?.settings; S.fxLevel = lv; J.fx.cap = 3; J.fx.lower = () => false; J.fx.apply(); return { level: J.fx.level(), quality: J.quality }; }, level);

/* ---------- sceny ---------- */
const emitTask = (p, tools = ['get_weather', 'read_file']) => p.evaluate(tools => { const T = { task_id: 't1' }; J.ev.emit('task.created', { title: 'Sprawdź pogodę i zapisz notatkę', ...T }); J.ev.emit('model.started', T); tools.forEach(t => J.ev.emit('tool.started', { tool: t, ...T })); }, tools);
const SCENES = {
  idle: async () => { },
  hud: async p => { await emitTask(p); await p.waitForTimeout(1500); },
  work: async p => { await emitTask(p); await p.evaluate(() => { J.wm.open('notes'); J.wm.open('monitor'); J.wm.open('schedule'); J.chatPanel?.show?.(); }); await p.waitForTimeout(1500); },
  drag: async p => { await p.evaluate(() => { J.wm.open('notes'); J.wm.open('monitor'); J.wm.open('schedule'); }); await p.waitForTimeout(1200); }
};
/* ruch w trakcie pomiaru: dla sceny drag przeciąga okno za nagłówek po elipsie, w pozostałych porusza myszą (wpływa na tło) */
async function driveMotion(p, scene, stopRef) {
  if (scene === 'drag') {
    const r = await p.evaluate(() => { const h = document.querySelector('.window[data-app="notes"] .win-head b').getBoundingClientRect(); return { x: h.left + 20, y: h.top + h.height / 2 }; });
    await p.mouse.move(r.x, r.y); await p.mouse.down();
    let i = 0; while (!stopRef.stop) { i++; await p.mouse.move(r.x + 140 * Math.sin(i / 8), r.y + 90 * Math.cos(i / 11)).catch(() => { }); await sleep(16); }
    await p.mouse.up().catch(() => { });
  } else if (scene === 'hud' || scene === 'work' || scene === 'idle') {
    let i = 0; while (!stopRef.stop) { i++; await p.mouse.move(300 + 600 * (.5 + .5 * Math.sin(i / 7)), 200 + 400 * (.5 + .5 * Math.cos(i / 9))).catch(() => { }); await sleep(40); }
  }
}

/* ---------- metryki ---------- */
const metric = (arr, n) => (arr.find(m => m.name === n) || { value: 0 }).value;
async function procInfo(b) { const s = await b.newBrowserCDPSession(); const r = await s.send('SystemInfo.getProcessInfo').catch(() => ({ processInfo: [] })); await s.detach().catch(() => { }); const o = {}; for (const x of r.processInfo) o[x.type] = (o[x.type] || 0) + x.cpuTime; return o; }

/* lista animacji (document.getAnimations): cel, nazwa, właściwości, czy tylko kompozytor (transform/opacity/translate/scale/rotate) */
const animations = p => p.evaluate(() => {
  const COMP = new Set(['transform', 'opacity', 'translate', 'scale', 'rotate', 'offset', 'offsetDistance']);
  const sel = el => { if (!el) return '?'; let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; else if (typeof el.className === 'string' && el.className.trim()) s += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.'); return s; };
  return document.getAnimations().filter(a => a.playState === 'running' || a.playState === 'pending').map(a => {
    let props = []; try { props = [...new Set(a.effect.getKeyframes().flatMap(k => Object.keys(k)).filter(k => !['offset', 'easing', 'composite', , 'computedOffset'].includes(k)))]; } catch (e) { }
    const t = a.effect?.getTiming?.() || {};
    return { target: sel(a.effect?.target), pseudo: a.effect?.pseudoElement || '', kind: a.constructor.name, name: a.animationName || a.transitionProperty || '', props, compositorOnly: props.length > 0 && props.every(x => COMP.has(x)), infinite: t.iterations === Infinity };
  });
});

/* warstwy kompozytora (CDP LayerTree): liczba, pełnoekranowe, pamięć szacunkowa */
async function layers(cdp, vw, vh) {
  let tree = null; const h = e => { tree = e.layers; };
  cdp.on('LayerTree.layerTreeDidChange', h);
  await cdp.send('LayerTree.enable');
  const t0 = Date.now(); while (!tree && Date.now() - t0 < 4000) await sleep(100);
  await cdp.send('LayerTree.disable').catch(() => { }); cdp.off('LayerTree.layerTreeDidChange', h);
  if (!tree) return { count: null, fullscreen: null, areaPx: null };
  const L = tree.filter(l => l.drawsContent || l.width * l.height > 0);
  const full = L.filter(l => l.width >= vw * .9 && l.height >= vh * .9);
  return { count: tree.length, drawing: tree.filter(l => l.drawsContent).length, fullscreen: full.length, areaPx: tree.reduce((s, l) => s + l.width * l.height, 0), areaViewports: +(tree.reduce((s, l) => s + l.width * l.height, 0) / (vw * vh)).toFixed(2) };
}

/* metrics: pomiar okna czasowego — klatki z pętli rAF (p50/p95/worst), udział CPU wątku głównego z CDP Performance, CPU procesów */
async function metrics(p, cdp, b, ms = 5000, scene = 'idle') {
  const a = (await cdp.send('Performance.getMetrics')).metrics;
  const lt0 = await p.evaluate(() => window.__lt.length);
  await p.evaluate(() => { if (window.__lr) { window.__lr.reads = window.__lr.inRaf = window.__lr.forced = window.__lr.forcedInRaf = 0; window.__lr.byApi = {}; } });
  const c0 = b ? await procInfo(b) : {}, t0 = Date.now(), stop = { stop: false };
  const mot = driveMotion(p, scene, stop);
  const fr = await p.evaluate(ms => new Promise(res => { const d = []; let t = performance.now(), last = t; const f = now => { d.push(now - last); last = now; if (now - t < ms) requestAnimationFrame(f); else { d.shift(); d.sort((x, y) => x - y); const q = x => d[Math.min(d.length - 1, Math.floor(x * d.length))]; res({ frames: d.length, fps: +(1000 * d.length / d.reduce((s, x) => s + x, 0)).toFixed(1), p50: +q(.5).toFixed(1), p95: +q(.95).toFixed(1), worst: Math.round(d[d.length - 1]) }); } }; requestAnimationFrame(f); }), ms);
  stop.stop = true; await mot.catch(() => { });
  const dt = (Date.now() - t0) / 1000, z = (await cdp.send('Performance.getMetrics')).metrics, c1 = b ? await procInfo(b) : {};
  const wall = metric(z, 'Timestamp') - metric(a, 'Timestamp'), pct = n => +(100 * (metric(z, n) - metric(a, n)) / wall).toFixed(1);
  const lts = await p.evaluate(i => window.__lt.slice(i), lt0);
  const cpu = {}; let tot = 0; for (const k in c1) { const v = (c1[k] - (c0[k] || 0)) / dt; cpu[k] = +v.toFixed(2); tot += v; }
  const lr = await p.evaluate(() => window.__lr ? { reads: __lr.reads, inRaf: __lr.inRaf, forced: __lr.forced, forcedInRaf: __lr.forcedInRaf, byApi: __lr.byApi } : null);
  const frames = metric(z, 'LayoutCount') - metric(a, 'LayoutCount');
  return { ...fr, busyPct: pct('TaskDuration'), scriptPct: pct('ScriptDuration'), layoutPct: pct('LayoutDuration'), stylePct: pct('RecalcStyleDuration'),
    layoutCount: Math.round(frames), layoutsPerFrame: +(frames / Math.max(1, fr.frames)).toFixed(2), styleRecalcs: Math.round(metric(z, 'RecalcStyleCount') - metric(a, 'RecalcStyleCount')),
    longTasks: lts.length, longTaskMs: lts.reduce((s, x) => s + x[1], 0), cpuCores: +tot.toFixed(2), cpu, cpuMsPerFrame: +(tot * 1000 / Math.max(.1, fr.fps)).toFixed(1),
    domNodes: await p.evaluate(() => document.getElementsByTagName('*').length), jsHeapMB: Math.round(metric(z, 'JSHeapUsedSize') / 1048576), layoutReads: lr };
}

/* pełny pomiar sceny na świeżej sesji: { metrics, animations (podsumowanie + lista), layers } */
async function measureScene({ scene = 'idle', fx = 'cinema', width = 1600, height = 900, ms = 5000, instr = false, url } = {}) {
  const { b, p, cdp } = await open({ width, height, url, instr, settleMs: 1500 });
  try {
    await forceFx(p, fx);
    await SCENES[scene](p); await p.waitForTimeout(1500);
    const m = await metrics(p, cdp, b, ms, scene);
    const an = await animations(p);
    const ly = await layers(cdp, width, height);
    return { scene, fx, width, height, ...m, animations: { running: an.length, infinite: an.filter(x => x.infinite).length, compositorOnly: an.filter(x => x.compositorOnly).length, nonCompositor: an.filter(x => !x.compositorOnly).length, list: an }, layers: ly, errors: p.errs.slice(0, 5) };
  } finally { await b.close().catch(() => { }); }
}

/* ---------- zrzuty: stany aplikacji ---------- */
/* ERROR/COMPLETED to stany przejściowe (kolor gaśnie po 3,5 / 2,6 s, Orb pulsuje 1,2 s): zegar silnika zamrożony tuż po emisji, żeby zrzut
   pokazywał stan „zaraz po zdarzeniu” niezależnie od tego, jak wolno działa maszyna (Date.now stały = 150 ms po zdarzeniu; timery CSS/rAF bez zmian) */
const freezeEngine = async p => { await p.evaluate(() => { const t = Date.now() + 150; Date.now = () => t; }); await p.waitForTimeout(400); };
const STATES = {
  idle: async () => { },
  listening: async p => { await p.evaluate(() => { J.orb.set('listening', 'słucham…'); J.emit('ear', true); }); await p.waitForTimeout(900); },
  thinking: async p => { await p.evaluate(() => { const T = { task_id: 't1' }; J.ev.emit('task.created', { title: 'Sprawdź pogodę i zapisz notatkę', ...T }); J.ev.emit('model.started', T); }); await p.waitForTimeout(1200); },
  executing: async p => { await emitTask(p); await p.waitForTimeout(1500); },
  approval: async p => { await emitTask(p); await p.evaluate(() => { window.__ask = J.ask('Zamknąć wszystkie okna?', [{ label: 'Tak', value: 'yes', primary: true }, { label: 'Nie', value: 'no', danger: true }], { speak: false, timeout: 60000 }); }); await p.waitForTimeout(1200); },
  error: async p => { await emitTask(p); await p.evaluate(() => { const T = { task_id: 't1' }; J.ev.emit('tool.failed', { tool: 'read_file', ...T, code: 'ERROR' }); J.ev.emit('task.failed', { ...T, result: 'Nie udało się odczytać pliku' }); }); await freezeEngine(p); },
  completed: async p => { await emitTask(p); await p.evaluate(() => { const T = { task_id: 't1' }; J.ev.emit('tool.completed', { tool: 'get_weather', ...T }); J.ev.emit('tool.completed', { tool: 'read_file', ...T }); J.ev.emit('model.completed', T); J.ev.emit('task.completed', { ...T, result: 'Gotowe' }); }); await freezeEngine(p); },
  windows: async p => { await p.evaluate(() => { ['notes', 'schedule', 'monitor', 'terminal'].forEach(a => J.wm.open(a)); }); await p.waitForTimeout(1200); },
  chat: async p => { await p.evaluate(() => { J.chatPanel?.show?.(); }); await p.waitForTimeout(900); },
  log: async p => { await emitTask(p); await p.evaluate(() => J.proc.toggle()); await p.waitForTimeout(1000); },
  palette: async p => { await p.keyboard.press('Control+k'); await p.waitForTimeout(900); },
  focus: async p => { await p.evaluate(() => J.setFocus(true)); await p.waitForTimeout(900); }
};
/* wariant: ustawienia przed stanem (akcent, tapeta, poziom efektów) */
const applyVariant = (p, v) => p.evaluate(v => { const S = J.state.settings; if (v.theme) { const t = J.THEMES[v.theme]; Object.assign(S, { accent: t[0], accent2: t[1] }); } if (v.wall) S.wall = v.wall; J.applyTheme(); J.emit('settings'); }, v);
/* wyłącza zmienność (kursor, zegar, licznik FPS, szum) — zrzuty różnią się tylko tym, co zmienił kod */
const STABILIZE = '.ts.clock em,#tsFps em{visibility:hidden!important}';
const settle = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

module.exports = { open, forceFx, SCENES, STATES, metrics, animations, layers, measureScene, applyVariant, STABILIZE, settle, URL, sleep, median, requirePw, emitTask };
