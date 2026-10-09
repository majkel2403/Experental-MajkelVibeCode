/* Lint „zakazanych animacji” CSS (plan neonowy §4, zasada 1): ruszać wolno tylko transform/opacity na własnej warstwie.
   Parser jest prosty (bez zależności), ale odporny na komentarze, ciągi znaków, url(…) i zagnieżdżone @media/@supports.
   Wykrywa:
     • @keyframes animujące box-shadow, filter, backdrop-filter, background-position, top/left/right/bottom/inset, width/height (min-/max-), margin*;
     • transition / transition-property z takimi właściwościami albo bez nazwy właściwości (skrót `transition:.2s` = `all`);
     • @property (animowane zmienne);
   Użycie jako moduł: lint(css, plik) → [{ file, kind, where, prop, count }]; jako CLI: node tools/css-lint.js [--json] [plik.css …] */
'use strict';
const fs = require('fs'), path = require('path');

const BANNED_RE = /^(?:box-shadow|(?:-webkit-)?(?:backdrop-)?filter|background-position(?:-[xy])?|top|left|right|bottom|inset|(?:min-|max-)?(?:width|height)|margin(?:-[a-z]+)*)$/;
const isBanned = p => BANNED_RE.test(String(p).trim().toLowerCase());
const EASING = /^(?:ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end|(?:cubic-bezier|steps|linear)\(.*\))$/i;
const TIME = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:ms|s)$/i;

/* usuwa komentarze, zostawiając ciągi znaków nietknięte (w „content:"/*"” nie ma komentarza) */
const stripComments = css => {
  let out = '', i = 0, q = '';
  while (i < css.length) {
    const c = css[i];
    if (q) { out += c; if (c === '\\') { out += css[i + 1] || ''; i += 2; continue; } if (c === q) q = ''; i++; continue; }
    if (c === '"' || c === "'") { q = c; out += c; i++; continue; }
    if (c === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e < 0 ? css.length : e + 2; out += ' '; continue; }
    out += c; i++;
  }
  return out;
};

/* dzieli po separatorze na poziomie 0 (poza nawiasami i ciągami znaków) */
const splitTop = (s, sep) => {
  const r = []; let d = 0, q = '', cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === '\\') { cur += s[++i] || ''; } else if (c === q) q = ''; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '(' || c === '[') d++; else if (c === ')' || c === ']') d = Math.max(0, d - 1);
    if (d === 0 && sep.test(c)) { r.push(cur); cur = ''; continue; }
    cur += c;
  }
  r.push(cur); return r;
};

/* właściwości z wartości `transition` (lista po przecinkach; element bez nazwy właściwości = all; none = brak przejścia) */
const transitionProps = value => {
  const v = value.replace(/!important/i, '').trim();
  if (!v || /^(?:none|initial|inherit|unset|revert)$/i.test(v)) return [];
  const props = [];
  for (const item of splitTop(v, /,/)) {
    const toks = splitTop(item.trim(), /\s/).filter(Boolean);
    const named = toks.filter(t => !TIME.test(t) && !EASING.test(t) && !/^(?:normal|allow-discrete)$/i.test(t) && !/^var\(/i.test(t));
    if (!named.length) { if (!toks.some(t => /^var\(/i.test(t))) props.push('all'); continue; }
    props.push(named[0].toLowerCase());
  }
  return props;
};

/* drzewo: pojedynczy przebieg po tekście bez komentarzy; element kończy się na ; { albo } na poziomie 0 */
const parse = text => {
  let i = 0;
  const readItem = () => {
    let d = 0, q = '', s = i;
    for (; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = ''; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === '(' || c === '[') { d++; continue; }
      if (c === ')' || c === ']') { d = Math.max(0, d - 1); continue; }
      if (d === 0 && (c === ';' || c === '{' || c === '}')) return { text: text.slice(s, i).trim(), end: c };
    }
    return { text: text.slice(s).trim(), end: '' };
  };
  const block = () => {
    const nodes = [];
    while (i < text.length) {
      const it = readItem();
      if (it.end === '{') { i++; nodes.push({ prelude: it.text, children: block() }); }
      else {
        if (it.text) { const k = it.text.indexOf(':'); if (k > 0) nodes.push({ decl: [it.text.slice(0, k).trim().toLowerCase(), it.text.slice(k + 1).trim()] }); else if (it.text.startsWith('@')) nodes.push({ at: it.text }); }
        if (it.end === '}') { i++; return nodes; }
        if (it.end === ';') i++;
        if (!it.end) return nodes;
      }
    }
    return nodes;
  };
  return block();
};

const norm = s => s.replace(/\s+/g, ' ').replace(/\s*([,>+~])\s*/g, '$1').trim();

function lint(css, file = '') {
  const found = new Map();
  const add = (kind, where, prop) => { const k = kind + '|' + where + '|' + prop; const e = found.get(k); if (e) e.count++; else found.set(k, { file, kind, where, prop, count: 1 }); };
  const walk = (nodes, ctx) => {
    for (const n of nodes) {
      if (!n.children) continue;
      const pre = n.prelude;
      if (/^@(?:-[a-z]+-)?keyframes\b/i.test(pre)) {
        const name = pre.replace(/^@(?:-[a-z]+-)?keyframes\s+/i, '').trim();
        const seen = new Set();
        for (const f of n.children) for (const c of (f.children || [])) if (c.decl && isBanned(c.decl[0]) && !seen.has(c.decl[0])) { seen.add(c.decl[0]); add('keyframes', name, c.decl[0]); }
      } else if (/^@property\b/i.test(pre)) add('property', pre.replace(/^@property\s+/i, '').trim(), '@property');
      else if (pre.startsWith('@')) { if (/^@(?:media|supports|layer|container|document)\b/i.test(pre)) walk(n.children, (ctx ? ctx + ' ' : '') + norm(pre)); }
      else {
        const where = (ctx ? ctx + ' ' : '') + norm(pre);
        for (const c of n.children) {
          if (!c.decl) continue;
          const [p, v] = c.decl;
          if (p === 'transition' || p === 'transition-property') {
            const props = p === 'transition' ? transitionProps(v) : (/^(?:none)$/i.test(v.replace(/!important/i, '').trim()) ? [] : splitTop(v.replace(/!important/i, ''), /,/).map(x => x.trim().toLowerCase()).filter(Boolean));
            for (const pr of new Set(props)) if (pr === 'all' || isBanned(pr)) add('transition', where, pr);
          }
        }
        if (n.children.some(c => c.children)) walk(n.children.filter(c => c.children), where);   // zagnieżdżone reguły (CSS nesting)
      }
    }
  };
  walk(parse(stripComments(css)), '');
  return [...found.values()].sort((a, b) => (a.kind + a.where + a.prop).localeCompare(b.kind + b.where + b.prop));
}

/* statyczne zasady §4.2–4.3: backdrop-filter, filter:drop-shadow i will-change w CSS. Wykrywa deklaracje (z kontekstem @media) i zwraca [{ file, kind, where, prop, count }],
   kind = 'backdrop-filter' | 'drop-shadow' | 'will-change'; `none`/`auto`/`initial` nie są naruszeniem. Polityka (kto może): tests/fixtures/css-static-allowlist.json */
function lintStatic(css, file = '') {
  const found = new Map();
  const add = (kind, where) => { const k = kind + '|' + where; const e = found.get(k); if (e) e.count++; else found.set(k, { file, kind, where, prop: kind, count: 1 }); };
  const off = v => /^(?:none|auto|initial|unset|inherit|revert)$/i.test(v.replace(/!important/i, '').trim());
  const walk = (nodes, ctx) => {
    for (const n of nodes) {
      if (!n.children) continue;
      const pre = n.prelude;
      if (pre.startsWith('@')) { if (/^@(?:media|supports|layer|container|document)\b/i.test(pre)) walk(n.children, (ctx ? ctx + ' ' : '') + norm(pre)); continue; }
      const where = (ctx ? ctx + ' ' : '') + norm(pre);
      for (const c of n.children) {
        if (!c.decl) continue; const [p, v] = c.decl; if (off(v)) continue;
        if (/^(?:-webkit-)?backdrop-filter$/.test(p)) add('backdrop-filter', where);
        else if (/^(?:-webkit-)?filter$/.test(p) && /drop-shadow\(/i.test(v)) add('drop-shadow', where);
        else if (p === 'will-change') add('will-change', where);
      }
      if (n.children.some(c => c.children)) walk(n.children.filter(c => c.children), where);
    }
  };
  walk(parse(stripComments(css)), '');
  return [...found.values()].sort((a, b) => (a.kind + a.where).localeCompare(b.kind + b.where));
}
const lintStaticRepo = (root = path.join(__dirname, '..')) => cssFiles(root).flatMap(f => lintStatic(fs.readFileSync(path.join(root, f), 'utf8'), f));

const cssFiles = root => { const d = path.join(root, 'css'); return fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.endsWith('.css')).sort().map(f => 'css/' + f) : []; };
const lintRepo = (root = path.join(__dirname, '..')) => cssFiles(root).flatMap(f => lint(fs.readFileSync(path.join(root, f), 'utf8'), f));

module.exports = { lint, lintRepo, lintStatic, lintStaticRepo, stripComments, transitionProps, isBanned, parse };

if (require.main === module) {
  const args = process.argv.slice(2), json = args.includes('--json'), files = args.filter(a => !a.startsWith('--'));
  const res = files.length ? files.flatMap(f => lint(fs.readFileSync(f, 'utf8'), f)) : lintRepo();
  if (json) console.log(JSON.stringify(res, null, 1));
  else { for (const v of res) console.log(`${v.file}  ${v.kind.padEnd(10)} ${v.prop.padEnd(20)} ×${v.count}  ${v.where}`); console.log(`\nNaruszeń: ${res.length} (wystąpień: ${res.reduce((s, v) => s + v.count, 0)})`); }
}
