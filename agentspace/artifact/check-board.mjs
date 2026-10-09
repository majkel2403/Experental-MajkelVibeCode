#!/usr/bin/env node
// check-board.mjs — static + dry-run checker for Design-canvas `.dc.html` boards. No browser, no deps.
// usage: node check-board.mjs <file.dc.html> [--states=states.json] [--quiet]
//   --states: JSON array of partial `state` objects; renderVals() is run once per entry and every
//             {{hole}} in the template is resolved against the result (sc-for iterates ALL items,
//             sc-if descends only when truthy, so probe states that open every branch).
import fs from 'node:fs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const statesPath = (args.find((a) => a.startsWith('--states=')) || '').slice(9);
const quiet = args.includes('--quiet');
if (!file) { console.error('usage: check-board.mjs <file.dc.html> [--states=states.json]'); process.exit(2); }

const text = fs.readFileSync(file, 'utf8');
const issues = new Map(); // key -> {level,msg,count,where}
function add(level, msg, where) {
  const key = level + '|' + msg;
  const cur = issues.get(key);
  if (cur) { cur.count++; return; }
  issues.set(key, { level, msg, count: 1, where });
}
const err = (m, w) => add('ERROR', m, w);
const warn = (m, w) => add('WARN', m, w);
const info = (m, w) => add('INFO', m, w);
const lineAt = (src, idx, base = 0) => base + src.slice(0, idx).split('\n').length;

// ---------- 1. whole-file static checks ----------
const headEnd = text.indexOf('<body');
const head = headEnd >= 0 ? text.slice(0, headEnd) : text;
if (!/<!doctype html>/i.test(text)) err('missing <!doctype html>');
if (!/<html lang="[a-z-]+">/i.test(text)) warn('missing <html lang="…">');
if (!head.includes('<script src="./support.js"></script>')) err('head must contain EXACTLY <script src="./support.js"></script>');
if (!/<title>[^<]{2,60}<\/title>/.test(head)) err('missing/empty <title> in head');
if (!/<meta charset="utf-8">/i.test(head)) warn('missing <meta charset="utf-8">');

const xdcOpen = text.indexOf('<x-dc>');
const xdcClose = text.lastIndexOf('</x-dc>');
if (xdcOpen < 0 || xdcClose < 0) { err('missing <x-dc> … </x-dc>'); report(); }
const tplSrc = text.slice(xdcOpen + 6, xdcClose);
const tplBaseLine = lineAt(text, xdcOpen + 6) - 1;

const scriptRe = /<script type="text\/x-dc" data-dc-script([^>]*)>([\s\S]*?)<\/script>/;
const sm = scriptRe.exec(text);
if (!sm) { err('missing <script type="text/x-dc" data-dc-script …> block'); report(); }
const scriptAttrs = sm[1];
const scriptCode = sm[2];

for (const [re, why] of [
  [/<iframe\b/i, '<iframe> is forbidden'],
  [/<object\b/i, '<object> is forbidden'],
  [/<embed\b/i, '<embed> is forbidden'],
  [/innerHTML|outerHTML|insertAdjacentHTML/, 'script-built DOM (innerHTML) is forbidden — all UI is <x-dc> markup'],
  [/\.appendChild\(|\.insertBefore\(|document\.createElement/, 'script-built DOM (appendChild/createElement) is forbidden'],
  [/addEventListener\(\s*['"]key(down|up|press)/, 'global key handlers are forbidden'],
  [/^\s*(import|export)\s/m, 'import/export not allowed in the logic class'],
  [/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon/, 'network calls are forbidden'],
]) { if (re.test(text)) err(why); }
if (/\p{Extended_Pictographic}/u.test(text)) err('emoji found — use inline SVG icons instead');
for (const line of text.split('\n')) {
  if (/font-family/i.test(line) && /\b(Inter|Roboto|Arial|Fraunces|Space Grotesk)\b/.test(line)) err('forbidden font family: ' + line.trim().slice(0, 90));
}
for (const m of text.matchAll(/https?:\/\/[^\s"'<>)]+/g)) {
  const u = m[0];
  if (/^https?:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|www\.w3\.org)\//.test(u)) continue;
  err('external URL not allowed: ' + u.slice(0, 80));
}
if (/\blorem ipsum\b/i.test(text)) err('lorem ipsum found');

// data-props
let props = {};
const pm = /data-props='([\s\S]*?)'/.exec(scriptAttrs);
if (!pm) warn('no data-props (need at least $preview)');
else {
  const dec = pm[1].replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  try {
    props = JSON.parse(dec);
    if (!props.$preview || !props.$preview.width || !props.$preview.height) warn('data-props lacks $preview {width,height}');
    const tweaks = Object.keys(props).filter((k) => k !== '$preview' && props[k] && props[k].editor);
    if (tweaks.length > 3) warn('too many tweaks (' + tweaks.length + ') — tweaks are levers, not copy');
  } catch (e) { err('data-props is not valid JSON after entity-decoding: ' + e.message); }
}
if (!/class\s+Component\s+extends\s+DCLogic/.test(scriptCode)) err('logic must be `class Component extends DCLogic`');
if (!/renderVals\s*\(/.test(scriptCode)) err('logic lacks renderVals()');

// ---------- 2. template parser ----------
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
function parseTemplate(src) {
  const root = { type: 'root', children: [] };
  const stack = [root];
  let i = 0;
  let svgDepth = 0;
  const top = () => stack[stack.length - 1];
  while (i < src.length) {
    const ch = src[i];
    if (src.startsWith('<!--', i)) { const j = src.indexOf('-->', i); i = j < 0 ? src.length : j + 3; continue; }
    if (ch === '<' && src[i + 1] === '/' && /[A-Za-z]/.test(src[i + 2] || '')) {
      const m = /^<\/([A-Za-z][\w:-]*)\s*>/.exec(src.slice(i, i + 80));
      if (!m) { err('malformed closing tag near line ' + lineAt(src, i, tplBaseLine)); i++; continue; }
      const name = m[1];
      const lname = name.toLowerCase();
      if (VOID.has(lname)) { i += m[0].length; continue; }
      const cur = top();
      if (cur.type === 'root' || cur.tag.toLowerCase() !== lname) {
        err('unexpected </' + name + '> (open: ' + (cur.tag || 'none') + ') near line ' + lineAt(src, i, tplBaseLine));
        // try to recover: pop to matching if present
        const idx = stack.map((n) => n.tag && n.tag.toLowerCase()).lastIndexOf(lname);
        if (idx > 0) { while (stack.length > idx) { const n = stack.pop(); if (n.tag && n.tag.toLowerCase() === 'svg') svgDepth--; } }
      } else { const n = stack.pop(); if (lname === 'svg') svgDepth--; }
      i += m[0].length;
      continue;
    }
    if (ch === '<' && /[A-Za-z]/.test(src[i + 1] || '')) {
      // open tag
      const startLine = lineAt(src, i, tplBaseLine);
      let j = i + 1;
      while (j < src.length && /[\w:-]/.test(src[j])) j++;
      const tag = src.slice(i + 1, j);
      const attrs = [];
      let selfClose = false;
      let ended = false;
      while (j < src.length) {
        while (j < src.length && /\s/.test(src[j])) j++;
        if (src[j] === '>') { j++; ended = true; break; }
        if (src[j] === '/' && src[j + 1] === '>') { selfClose = true; j += 2; ended = true; break; }
        if (src[j] === '/') { j++; continue; }
        let k = j;
        while (k < src.length && !/[\s=>\/]/.test(src[k])) k++;
        const name = src.slice(j, k);
        if (!name) { j++; continue; }
        j = k;
        while (j < src.length && /\s/.test(src[j])) j++;
        let value = null;
        let quoted = true;
        if (src[j] === '=') {
          j++;
          while (j < src.length && /\s/.test(src[j])) j++;
          if (src[j] === '"' || src[j] === "'") {
            const q = src[j];
            const e = src.indexOf(q, j + 1);
            if (e < 0) { err('unterminated attribute value for ' + name + ' in <' + tag + '> line ' + startLine); j = src.length; break; }
            value = src.slice(j + 1, e);
            j = e + 1;
          } else {
            quoted = false;
            let e = j;
            while (e < src.length && !/[\s>]/.test(src[e])) e++;
            value = src.slice(j, e);
            j = e;
          }
        }
        if (!quoted) err('unquoted attribute ' + name + '=' + value + ' in <' + tag + '> line ' + startLine);
        attrs.push({ name, value });
      }
      if (!ended) { err('unterminated <' + tag + '> tag line ' + startLine); break; }
      const lname = tag.toLowerCase();
      const node = { type: 'el', tag, lname, attrs, children: [], line: startLine, inSvg: svgDepth > 0 || lname === 'svg' };
      top().children.push(node);
      i = j;
      if (VOID.has(lname)) continue;
      if (selfClose) {
        if (!node.inSvg) err('self-closing <' + tag + '/> outside <svg> is not valid HTML (line ' + startLine + ')');
        continue;
      }
      if (lname === 'style' || lname === 'script') {
        const closeRe = new RegExp('</' + lname + '\\s*>', 'i');
        const rest = src.slice(i);
        const cm = closeRe.exec(rest);
        if (!cm) { err('unterminated <' + tag + '> near line ' + startLine); break; }
        node.raw = rest.slice(0, cm.index);
        node.children.push({ type: 'text', value: '', raw: true });
        i += cm.index + cm[0].length;
        continue;
      }
      stack.push(node);
      if (lname === 'svg') svgDepth++;
      continue;
    }
    // text
    let e = i + 1;
    while (e < src.length && !(src[e] === '<' && (/[A-Za-z\/!]/.test(src[e + 1] || '')))) e++;
    top().children.push({ type: 'text', value: src.slice(i, e), line: lineAt(src, i, tplBaseLine) });
    i = e;
  }
  while (stack.length > 1) { const n = stack.pop(); err('unclosed <' + n.tag + '> opened line ' + n.line); }
  return root;
}
const tree = parseTemplate(tplSrc);

// ---------- 3. hole grammar + static per-element rules ----------
const HOLE_RE = /\{\{([\s\S]*?)\}\}/g;
const PATH_RE = /^\s*(?:true|false|null|undefined|-?\d+(?:\.\d+)?|'[^']*'|"[^"]*"|\$?[A-Za-z_][\w$]*(?:\.[A-Za-z_$][\w$]*|\[\d+\])*)\s*$/;
const holeCount = { n: 0 };
function checkHoleSyntax(str, where) {
  for (const m of str.matchAll(HOLE_RE)) {
    holeCount.n++;
    if (!PATH_RE.test(m[1])) err('hole is an expression, not a dotted lookup: {{' + m[1].trim().slice(0, 60) + '}}', where);
  }
  const stripped = str.replace(HOLE_RE, '');
  if (/\{\{|\}\}/.test(stripped)) err('unbalanced {{ }} in: ' + str.slice(0, 70), where);
}
function walkStatic(node, ctx) {
  if (node.type === 'text') { if (node.value) checkHoleSyntax(node.value, 'line ' + node.line); return; }
  if (node.type === 'root') { node.children.forEach((c) => walkStatic(c, ctx)); return; }
  const where = 'line ' + node.line + ' <' + node.tag + '>';
  const a = Object.fromEntries(node.attrs.map((x) => [x.name, x.value]));
  for (const at of node.attrs) {
    if (at.value != null) checkHoleSyntax(at.value, where);
    if (/^on[A-Z]/.test(at.name)) {
      if (!/^\s*\{\{[^{}]+\}\}\s*$/.test(at.value || '')) err('event ' + at.name + ' must be a whole-value hole', where);
    }
    if (/^on[a-z]/.test(at.name)) err('use camelCase event attribute (onClick), got ' + at.name, where);
    if (at.name === 'role' && ['div', 'span'].includes(node.lname) && Object.keys(a).some((n) => /^on(Click|DoubleClick|Key|Mouse|Pointer|Touch)/.test(n))) err('role + click/key handler on a div/span — use a real <button>/<a>', where);
  }
  if (node.lname === 'div' || node.lname === 'span') {
    for (const at of node.attrs) if (/^on[A-Z]/.test(at.name) && ['onClick', 'onKeyDown'].includes(at.name)) err('onClick on <' + node.lname + '> — use a real <button>/<a href>', where);
  }
  // runtime wraps every text hole in <span class="sc-interp">; inside SVG text that span is an unknown SVG element
  // and the browser does not render it — draw such labels as HTML overlays instead
  if (node.inSvg && ['text', 'tspan', 'title', 'desc'].includes(node.lname)) {
    for (const c of node.children) if (c.type === 'text' && c.value && c.value.includes('{{')) err('text hole inside SVG <' + node.lname + '> renders as an HTML <span> in the SVG namespace and disappears — use a static label or an HTML overlay', where);
  }
  if (node.lname === 'sc-for') {
    if (!a.list) err('<sc-for> without list', where);
    if (!a.as) err('<sc-for> without as', where);
    if (a['hint-placeholder-count'] == null) warn('<sc-for> without hint-placeholder-count', where);
    if (a.list && !/^\s*\{\{[^{}]+\}\}\s*$/.test(a.list)) err('<sc-for list> must be one hole', where);
  }
  if (node.lname === 'sc-if') {
    if (a.value == null) err('<sc-if> without value', where);
    if (a['hint-placeholder-val'] == null) warn('<sc-if> without hint-placeholder-val', where);
  }
  if (node.lname === 'img' && a.alt == null) warn('<img> without alt', where);
  if (node.lname === 'button') {
    const hasText = JSON.stringify(node.children).replace(/"type":"[a-z]+"|"tag":|"lname":|"attrs":|"children":|"line":\d+|"inSvg":(true|false)|[{}\[\],"]/g, '').replace(/\s+/g, '').length > 0;
    if (!hasText && !a['aria-label']) warn('icon-only <button> without aria-label', where);
    if (a.type == null) info('<button> without type (defaults to submit)', where);
  }
  if (node.lname === 'input' || node.lname === 'textarea') {
    if (!a['aria-label'] && !a.id) warn('<' + node.lname + '> has neither id (for <label for>) nor aria-label', where);
  }
  if (['sc-for', 'sc-if', 'dc-import', 'x-import'].includes(node.lname) === false && /[A-Z]/.test(node.tag) && !node.inSvg) err('capitalised tag <' + node.tag + '> (only svg camelCase allowed)', where);
  if (node.lname === 'helmet') ctx.helmet = true;
  node.children.forEach((c) => walkStatic(c, ctx));
}
walkStatic(tree, {});

// ---------- 4. dry run: evaluate the logic and resolve every hole ----------
class DCLogic {
  constructor(p) { this.props = p || {}; this.state = {}; this.__host = null; }
  setState(p, cb) { const n = typeof p === 'function' ? p(this.state) : p; this.state = { ...this.state, ...n }; if (cb) cb(); }
  forceUpdate() {}
  componentDidMount() {}
  componentDidUpdate() {}
  componentWillUnmount() {}
  renderVals() { return {}; }
}
const rafQueue = [];
globalThis.window = globalThis;
globalThis.document = globalThis.document || { createElement: () => ({ getContext: () => null, style: {} }), addEventListener() {}, removeEventListener() {}, body: {} };
globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
globalThis.cancelAnimationFrame = () => {};

let Component = null;
try {
  Component = new Function('DCLogic', 'StreamableLogic', 'React', scriptCode + '\n;return (typeof Component!=="undefined")?Component:null;')(DCLogic, class {}, {});
} catch (e) { err('logic script failed to evaluate: ' + e.message); report(); }
if (!Component) { err('logic did not define Component'); report(); }

const defaults = {};
for (const [k, v] of Object.entries(props)) if (k !== '$preview' && v && 'default' in v) defaults[k] = v.default;
let logic;
try { logic = new Component({ ...defaults }); logic.__host = {}; }
catch (e) { err('Component constructor threw: ' + e.message); report(); }
try { logic.componentDidMount(); } catch (e) { err('componentDidMount threw: ' + e.message); }

let probes = [{}];
if (statesPath) {
  try { probes = JSON.parse(fs.readFileSync(statesPath, 'utf8')); } catch (e) { err('cannot read --states: ' + e.message); }
}

const BAD_STR = /\b(undefined|NaN|Infinity|null)\b|\[object Object\]/;
function lookup(expr, scopes) {
  const e = expr.trim();
  if (/^(true|false|null|undefined)$/.test(e)) return { found: true, value: e === 'true' ? true : e === 'false' ? false : e === 'null' ? null : undefined };
  if (/^-?\d+(\.\d+)?$/.test(e)) return { found: true, value: Number(e) };
  const lit = /^(['"])(.*)\1$/.exec(e);
  if (lit) return { found: true, value: lit[2] };
  const first = /^\$?[A-Za-z_][\w$]*/.exec(e)[0];
  let obj;
  let found = false;
  for (let s = scopes.length - 1; s >= 0; s--) { if (Object.prototype.hasOwnProperty.call(scopes[s], first)) { obj = scopes[s][first]; found = true; break; } }
  if (!found) return { found: false };
  const rest = e.slice(first.length);
  const parts = [...rest.matchAll(/\.([A-Za-z_$][\w$]*)|\[(\d+)\]/g)];
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return { found: true, value: undefined, brokenAt: p[0] };
    cur = cur[p[1] !== undefined ? p[1] : Number(p[2])];
  }
  return { found: true, value: cur };
}
function resolveString(str, scopes, where, ctxName) {
  // returns the interpolated string, reporting missing/bad holes
  let out = '';
  let last = 0;
  for (const m of str.matchAll(HOLE_RE)) {
    out += str.slice(last, m.index);
    last = m.index + m[0].length;
    const r = lookup(m[1], scopes);
    if (!r.found) { err('hole {{' + m[1].trim() + '}} not provided by renderVals()/loop scope', where); continue; }
    if (r.value === undefined) { err('hole {{' + m[1].trim() + '}} is undefined (' + ctxName + ')', where); continue; }
    if (typeof r.value === 'number' && !Number.isFinite(r.value)) { err('hole {{' + m[1].trim() + '}} is ' + r.value, where); continue; }
    if (typeof r.value === 'function' || (typeof r.value === 'object' && r.value !== null)) { err('hole {{' + m[1].trim() + '}} is ' + typeof r.value + ' but used as text', where); continue; }
    out += String(r.value);
  }
  return out + str.slice(last);
}
const taken = new Map(); // sc-if node -> times truthy
const seenIf = new Set();
function render(node, scopes) {
  if (node.type === 'text') { if (node.value && !node.raw) resolveString(node.value, scopes, 'line ' + node.line, 'text'); return; }
  if (node.type === 'root') { node.children.forEach((c) => render(c, scopes)); return; }
  const where = 'line ' + node.line + ' <' + node.tag + '>';
  if (node.lname === 'sc-for') {
    const a = Object.fromEntries(node.attrs.map((x) => [x.name, x.value]));
    const m = /\{\{([\s\S]+?)\}\}/.exec(a.list || '');
    const r = m ? lookup(m[1], scopes) : { found: false };
    if (!r.found) { err('sc-for list ' + a.list + ' not provided', where); return; }
    if (!Array.isArray(r.value)) { err('sc-for list ' + a.list + ' is not an array (' + typeof r.value + ')', where); return; }
    r.value.forEach((item, idx) => {
      const sc = { [a.as]: item, $index: idx };
      node.children.forEach((c) => render(c, [...scopes, sc]));
    });
    return;
  }
  if (node.lname === 'sc-if') {
    const a = Object.fromEntries(node.attrs.map((x) => [x.name, x.value]));
    const m = /\{\{([\s\S]+?)\}\}/.exec(a.value || '');
    const r = m ? lookup(m[1], scopes) : { found: false };
    seenIf.add(node);
    if (!r.found) { err('sc-if value ' + a.value + ' not provided', where); return; }
    if (r.value) { taken.set(node, (taken.get(node) || 0) + 1); node.children.forEach((c) => render(c, scopes)); }
    return;
  }
  // regular element / dc-import
  for (const at of node.attrs) {
    if (at.value == null || !at.value.includes('{{')) continue;
    const whole = /^\s*\{\{([^{}]+)\}\}\s*$/.exec(at.value);
    if (whole) {
      const r = lookup(whole[1], scopes);
      if (!r.found) { err('attr ' + at.name + ' hole {{' + whole[1].trim() + '}} not provided', where); continue; }
      if (/^on[A-Z]/.test(at.name)) { if (typeof r.value !== 'function') err('event ' + at.name + ' hole {{' + whole[1].trim() + '}} is not a function (' + typeof r.value + ')', where); continue; }
      if (r.value === undefined && !['value', 'checked', 'class', 'hint-size'].includes(at.name)) warn('attr ' + at.name + ' hole {{' + whole[1].trim() + '}} is undefined (attribute is dropped)', where);
      if (typeof r.value === 'number' && !Number.isFinite(r.value)) err('attr ' + at.name + ' hole {{' + whole[1].trim() + '}} is ' + r.value, where);
      if (at.name === 'style' && typeof r.value === 'string') checkStyle(r.value, where);
      if (typeof r.value === 'string' && /^(d|points|transform|viewBox|viewbox)$/.test(at.name) && BAD_STR.test(r.value)) err('attr ' + at.name + ' value contains undefined/NaN: ' + r.value.slice(0, 80), where);
    } else {
      const s = resolveString(at.value, scopes, where, 'attr ' + at.name);
      if (at.name === 'style') checkStyle(s, where);
      else if (/^(d|points|transform|viewBox|viewbox|x|y|cx|cy|r|width|height|x1|x2|y1|y2|stroke-dasharray|stroke-dashoffset)$/.test(at.name) && BAD_STR.test(s)) err('attr ' + at.name + ' resolves to a value with undefined/NaN: ' + s.slice(0, 80), where);
    }
  }
  node.children.forEach((c) => render(c, scopes));
}
function checkStyle(s, where) {
  if (BAD_STR.test(s)) err('style resolves to a value with undefined/NaN/Infinity: ' + s.slice(0, 120), where);
  for (const d of s.split(';')) {
    const t = d.trim();
    if (!t) continue;
    if (!t.includes(':')) err('style declaration without colon: "' + t.slice(0, 50) + '"', where);
  }
}

let probeIdx = 0;
for (const probe of probes) {
  probeIdx++;
  try {
    logic.state = { ...logic.state, ...probe };
    const vals = logic.renderVals();
    if (!vals || typeof vals !== 'object') { err('renderVals() must return an object'); continue; }
    render(tree, [vals]);
  } catch (e) { err('renderVals() threw on probe #' + probeIdx + ' ' + JSON.stringify(probe).slice(0, 80) + ': ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); }
}
try { logic.componentWillUnmount(); } catch (e) { err('componentWillUnmount threw: ' + e.message); }

// run a few fake animation frames so componentDidMount timers are exercised
try {
  if (rafQueue.length) {
    let now = 1000;
    const realNow = performance.now.bind(performance);
    performance.now = () => now;
    for (let k = 0; k < 40 && rafQueue.length; k++) { now += 33; const cb = rafQueue.shift(); cb(now); }
    performance.now = realNow;
    info('raf loop exercised (queue ' + rafQueue.length + ')');
  }
} catch (e) { err('animation frame callback threw: ' + e.message); }

let neverTaken = 0;
for (const n of seenIf) if (!taken.has(n)) neverTaken++;
if (neverTaken) info(neverTaken + ' of ' + seenIf.size + ' <sc-if> branches were never truthy across ' + probes.length + ' probe(s) (their holes are unchecked — add probe states)');
info('holes parsed: ' + holeCount.n + ' · probes: ' + probes.length);

report();

function report() {
  const list = [...issues.values()];
  const order = { ERROR: 0, WARN: 1, INFO: 2 };
  list.sort((a, b) => order[a.level] - order[b.level]);
  const errors = list.filter((x) => x.level === 'ERROR').length;
  if (!quiet || errors) {
    for (const x of list) {
      if (quiet && x.level === 'INFO') continue;
      console.log(x.level.padEnd(5) + ' ' + x.msg + (x.count > 1 ? '  (×' + x.count + ')' : '') + (x.where ? '  @ ' + x.where : ''));
    }
  }
  console.log(errors ? '\nFAIL: ' + errors + ' error(s) in ' + file : '\nOK: no errors in ' + file);
  process.exit(errors ? 1 : 0);
}
