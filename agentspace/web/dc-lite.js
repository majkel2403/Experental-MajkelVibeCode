// dc-lite: renders a Design Component template ({{holes}}, sc-if, sc-for, onClick…) in a plain page, so the web app
// shows exactly the markup of the canvas boards. The output DOM is morphed into place: elements keep focus, scroll
// position and hover while values change.
const SVG = 'http://www.w3.org/2000/svg';
// HTML parsing lowercases attribute names, so the camelCase JSX names are matched in lower case
const EVENTS = { onclick: 'click', onchange: 'input', onmouseenter: 'mouseenter', onmouseleave: 'mouseleave', onkeydown: 'keydown' };
const HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
const look = (path, scope) => {
  const p = path.trim();
  if (p === 'true') return true; if (p === 'false') return false; if (p === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(p)) return Number(p);
  let v = scope;
  for (const k of p.split('.')) { if (v == null) return undefined; v = v[k]; }
  return v;
};
const whole = (s) => { const m = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/.exec(s); return m ? m[1] : null; };
const interp = (s, scope) => s.replace(HOLE, (_, p) => { const v = look(p, scope); return v == null ? '' : String(v); });

function build(node, scope, out) {
  if (node.nodeType === 3) { const t = node.nodeValue; if (t.trim() === '' && !t.includes(' ')) return; out.push({ text: interp(t, scope) }); return; }
  if (node.nodeType !== 1) return;
  const tag = node.localName;
  if (tag === 'sc-if') { if (look(whole(node.getAttribute('value')) || 'false', scope)) for (const c of node.childNodes) build(c, scope, out); return; }
  if (tag === 'sc-for') {
    const list = look(whole(node.getAttribute('list')) || '', scope) || [];
    const as = node.getAttribute('as') || 'item';
    list.forEach((item, i) => { const sc = Object.create(scope); sc[as] = item; sc.$index = i; for (const c of node.childNodes) build(c, sc, out); });
    return;
  }
  const el = { tag, ns: node.namespaceURI, attrs: {}, events: {}, children: [] };
  for (const a of node.attributes) {
    const n = a.name; const w = whole(a.value);
    if (EVENTS[n]) { el.events[EVENTS[n]] = w ? look(w, scope) : null; continue; }
    if (w) {
      const v = look(w, scope);
      if (n === 'value') el.value = v == null ? '' : String(v);
      else if (n === 'disabled' || n === 'hidden') { if (v) el.attrs[n] = ''; }
      else if (typeof v === 'boolean') el.attrs[n === 'class' ? 'class' : n] = String(v);
      else if (v != null) el.attrs[n] = String(v);
    } else el.attrs[n] = a.value.indexOf('{{') >= 0 ? interp(a.value, scope) : a.value;
  }
  if (tag === 'svg' || el.ns === SVG) el.ns = SVG;
  for (const c of node.childNodes) build(c, scope, el.children);
  out.push(el);
}

const make = (d) => {
  if (d.text != null) return document.createTextNode(d.text);
  const el = d.ns === SVG ? document.createElementNS(SVG, d.tag) : document.createElement(d.tag);
  patchEl(el, d);
  d.children.forEach((c) => el.appendChild(make(c)));
  return el;
};
function patchEl(el, d) {
  const had = el._attrs || {};
  for (const k in d.attrs) if (had[k] !== d.attrs[k]) { el.setAttribute(k, d.attrs[k]); }
  for (const k in had) if (!(k in d.attrs)) el.removeAttribute(k);
  el._attrs = d.attrs;
  if (d.value !== undefined && el.value !== d.value && document.activeElement !== el) el.value = d.value;
  else if (d.value !== undefined && el.tagName === 'INPUT' && el.type === 'range') el.value = d.value;
  const h = el._h || (el._h = {});
  for (const type in d.events) {
    if (!(type in h)) el.addEventListener(type, (e) => { const f = el._h[type]; if (f) f(e); });
    h[type] = d.events[type];
  }
  for (const type in h) if (!(type in d.events)) h[type] = null;
}
function morph(parent, list) {
  const kids = parent.childNodes;
  list.forEach((d, i) => {
    const cur = kids[i];
    if (cur && ((d.text != null && cur.nodeType === 3) || (d.text == null && cur.nodeType === 1 && cur.localName === d.tag))) {
      if (d.text != null) { if (cur.nodeValue !== d.text) cur.nodeValue = d.text; } else { patchEl(cur, d); morph(cur, d.children); }
    } else if (cur) parent.replaceChild(make(d), cur);
    else parent.appendChild(make(d));
  });
  while (parent.childNodes.length > list.length) parent.removeChild(parent.lastChild);
}

export function mount(container, markup, Logic) {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup;
  let raf = 0;
  const render = () => {
    raf = 0;
    const out = [];
    const scope = inst.renderVals();
    for (const n of tpl.content.childNodes) build(n, scope, out);
    morph(container, out);
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(render); };
  class Base {
    constructor(props) { this.props = props || {}; this.state = {}; }
    setState(p) { Object.assign(this.state, typeof p === 'function' ? p(this.state) : p); schedule(); }
    forceUpdate() { schedule(); }
  }
  const inst = new (Logic(Base))({});
  render();
  if (inst.componentDidMount) inst.componentDidMount();
  return inst;
}
