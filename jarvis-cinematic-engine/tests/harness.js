/* Ładuje moduły Jarvis OS w Node (bez DOM) do testów czystej logiki:
   rejestr poleceń, silnik lokalny, NLP, kalkulator, parsery Hermesa, reduktor zdarzeń, Context Packet. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

const mkEl = (tag = 'div') => {
  const el = { tagName: tag.toUpperCase(), children: [], style: { setProperty(k, v) { this[k] = v; } }, dataset: {}, attributes: {}, textContent: '', innerHTML: '', value: '', hidden: false, offsetLeft: 0, offsetTop: 0, offsetWidth: 300, offsetHeight: 200, scrollTop: 0, scrollHeight: 0, clientWidth: 300, clientHeight: 200 };
  const cls = new Set();
  el.classList = { add: (...a) => a.forEach(c => cls.add(c)), remove: (...a) => a.forEach(c => cls.delete(c)), toggle: (c, f) => { (f === undefined ? !cls.has(c) : f) ? cls.add(c) : cls.delete(c); return cls.has(c); }, contains: c => cls.has(c) };
  Object.defineProperty(el, 'className', { get: () => [...cls].join(' '), set: v => { cls.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => cls.add(c)); } });
  el.setAttribute = (k, v) => { el.attributes[k] = v; }; el.getAttribute = k => el.attributes[k]; el.removeAttribute = k => { delete el.attributes[k]; };
  el.appendChild = c => { el.children.push(c); c.parentElement = el; return c; }; el.append = (...c) => c.forEach(el.appendChild); el.insertBefore = (c) => el.appendChild(c); el.remove = () => { }; el.prepend = el.appendChild;
  el.querySelector = () => null; el.querySelectorAll = () => []; el.closest = () => null; el.contains = () => false; el.focus = () => { }; el.blur = () => { }; el.click = () => { }; el.select = () => { };
  el.addEventListener = () => { }; el.removeEventListener = () => { }; el.dispatchEvent = () => { }; el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1400, height: 800, right: 1400, bottom: 800 });
  el.getContext = () => new Proxy({}, { get: (_, k) => k === 'canvas' ? el : (() => ({ addColorStop() { } })) });
  el.insertAdjacentHTML = () => { }; el.firstElementChild = null; el.lastElementChild = null;
  /* położenie i rozmiar wynikają ze stylu (jak w przeglądarce dla position:absolute) — testy okien sprawdzają piksele */
  const px = (k, d) => { const v = parseFloat(el.style[k]); return isNaN(v) ? d : v; };
  Object.defineProperty(el, 'offsetLeft', { get: () => px('left', 0), configurable: true }); Object.defineProperty(el, 'offsetTop', { get: () => px('top', 0), configurable: true });
  Object.defineProperty(el, 'offsetWidth', { get: () => px('width', 300), configurable: true }); Object.defineProperty(el, 'offsetHeight', { get: () => px('height', 200), configurable: true });
  el.querySelectorAll = () => [];
  return el;
};
const storage = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; }, clear: () => m.clear() }; };

function load(opts = {}) {
  const ctx = {};
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  ctx.console = console; ctx.Math = Math; ctx.Date = Date; ctx.JSON = JSON; ctx.Object = Object; ctx.Array = Array; ctx.String = String; ctx.Number = Number; ctx.Boolean = Boolean; ctx.RegExp = RegExp; ctx.Error = Error; ctx.Map = Map; ctx.Set = Set; ctx.Promise = Promise; ctx.Symbol = Symbol; ctx.Intl = Intl; ctx.parseInt = parseInt; ctx.parseFloat = parseFloat; ctx.isNaN = isNaN; ctx.isFinite = isFinite; ctx.encodeURIComponent = encodeURIComponent; ctx.decodeURIComponent = decodeURIComponent; ctx.URL = URL; ctx.URLSearchParams = URLSearchParams; ctx.Blob = Blob; ctx.TextDecoder = TextDecoder; ctx.TextEncoder = TextEncoder; ctx.AbortController = AbortController; ctx.AbortSignal = AbortSignal; ctx.Proxy = Proxy; ctx.Reflect = Reflect; ctx.Uint8Array = Uint8Array; ctx.Float32Array = Float32Array; ctx.performance = performance; ctx.structuredClone = structuredClone; ctx.queueMicrotask = queueMicrotask; ctx.WeakMap = WeakMap;
  ctx.setTimeout = (fn, ms, ...a) => { const t = setTimeout(fn, ms, ...a); t.unref?.(); return t; }; ctx.clearTimeout = clearTimeout;
  ctx.setInterval = (fn, ms, ...a) => { const t = setInterval(fn, ms, ...a); t.unref?.(); return t; }; ctx.clearInterval = clearInterval;
  ctx.requestAnimationFrame = () => 0; ctx.cancelAnimationFrame = () => { };
  ctx.fetch = opts.fetch || (async () => { throw new TypeError('fetch disabled in tests'); });
  ctx.localStorage = storage(); ctx.sessionStorage = storage();
  if (opts.state) ctx.localStorage.setItem('jarvis-os:v2', JSON.stringify(opts.state));
  ctx.navigator = { onLine: true, userAgent: 'node', language: 'pl-PL', hardwareConcurrency: 4, clipboard: { writeText: async () => { }, readText: async () => 'schowek' }, mediaDevices: null };
  ctx.location = Object.assign({ origin: 'http://localhost', protocol: 'http:', href: 'http://localhost/', pathname: '/', search: '', hash: '' }, opts.location || {});
  ctx.history = { replaceState: (a, b, url) => { ctx.location.href = 'http://localhost' + url; ctx.location.search = ''; } };
  if (opts.config) ctx.JARVIS_CONFIG = opts.config;
  ctx.matchMedia = () => ({ matches: false, addEventListener() { } });
  ctx.innerWidth = 1400; ctx.innerHeight = 800; ctx.devicePixelRatio = 1;
  ctx.addEventListener = () => { }; ctx.removeEventListener = () => { }; ctx.open = () => ({});
  ctx.document = Object.assign(mkEl('html'), { hidden: false, activeElement: null, documentElement: mkEl('html'), body: mkEl('body'), createElement: mkEl, createTextNode: t => ({ textContent: t }), fullscreenElement: null });
  /* opts.dom: każdy selektor (#id, .klasa) zwraca stały element-atrapę — pozwala uruchomić brain.handle i Process Log bez prawdziwego DOM */
  if (opts.dom) {
    const withQuery = tag => { const e = mkEl(tag), c = {}; e.querySelector = sel => (c[sel] = c[sel] || withQuery()); return e; };   // elementy potomne też odpowiadają na querySelector
    const cache = {}, created = []; ctx.document.querySelector = sel => (cache[sel] = cache[sel] || withQuery()); ctx.document.createElement = tag => { const e = withQuery(tag); created.push(e); return e; };
    /* okna: wm.open zdejmuje klasę „focused” z pozostałych przez querySelectorAll('.window.focused') */
    ctx.document.querySelectorAll = sel => sel === '.window.focused' ? created.filter(e => e.classList.contains('window') && e.classList.contains('focused')) : [];
  }
  ctx.Event = class { constructor(t) { this.type = t; } };
  ctx.alert = () => { }; ctx.confirm = () => true; ctx.prompt = () => '';
  vm.createContext(ctx);
  const files = opts.files || ['core.js', 'events.js', 'store.js', 'registry.js', 'undo.js', 'jev-policy.js', 'process.js', 'apps.js', 'apps-settings.js', 'widgets.js', 'chart.js', 'widget-spec.js', 'commands.js', 'search.js', 'commands-ext.js', 'commands-data.js', 'commands-w4.js', 'context.js', 'judge.js', 'jev-flow.js', 'agents.js', 'workflows.js', 'workflow-cinema.js', 'film-scenarios.js', 'ai.js'];
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), ctx, { filename: f });
  ctx.J.__ctx = ctx;
  return ctx.J;
}
/* Zegar dla testów, które potrzebują „blokujących” liczników (kod czeka chwilę przed odpowiedzią): krótkie zostają
   blokujące, długie (przypomnienia zadań za wiele godzin) nie — inaczej wynik zależał od pory dnia: „zadanie na 18:00”
   uruchomione w nocy trzymało proces testu przy życiu do wieczora. */
const refShort = (fn, ms, ...a) => { const t = setTimeout(fn, ms, ...a); if (+ms > 10000) t.unref?.(); return t; };
module.exports = { load, mkEl, refShort };
