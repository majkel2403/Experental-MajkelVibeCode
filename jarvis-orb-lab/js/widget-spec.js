/* =========================================================
   JARVIS OS — widgety z opisu (docs/spec/05-widgety.md §3, schemat: docs/spec/widget.schema.json)
   Opis (JSON) → sprawdzenie schematu i zasad → render WYŁĄCZNIE przez createElement/textContent (bez innerHTML z opisu).
   Dane: tylko polecenia rejestru poziomu A3 (odczyt), wspólna pamięć podręczna, odświeżanie co ≥ 15 s,
   wstrzymane przy ukrytej karcie, zminimalizowanym albo zwiniętym widgecie. Przyciski = polecenia rejestru z normalnymi zgodami;
   polecenie A0 z widgetu zawsze pyta (także po kliknięciu, bo opis mógł napisać model).
   ========================================================= */
'use strict';
(() => {
/* ---------- schemat (kopia docs/spec/widget.schema.json bez $comment; zgodność sprawdza test) ---------- */
const SCHEMA = /*SCHEMA:start*/{"type":"object","additionalProperties":false,"required":["v","title","blocks"],"properties":{"v":{"const":1},"title":{"type":"string","minLength":1,"maxLength":60},"icon":{"type":"string","enum":["star","notes","list","bolt","market","weather","calendar","timer","chart","globe","brain","db","doc","flag","shield"]},"size":{"type":"string","enum":["S","M","L","XL"]},"layout":{"type":"string","enum":["stack","grid2","grid3"]},"tone":{"type":"string","enum":["accent","blue","purple","teal","green","warn"]},"sources":{"type":"object","maxProperties":4,"propertyNames":{"pattern":"^[a-z][a-z0-9_]{0,19}$"},"additionalProperties":{"type":"object","additionalProperties":false,"required":["command"],"properties":{"command":{"type":"string","pattern":"^[a-z][a-z0-9_]{1,40}$"},"args":{"type":"object"},"refresh":{"type":"number","minimum":0,"maximum":86400},"event":{"type":"string","enum":["tasks","notes","market","weather","timer","memory","wm","settings"]}}}},"blocks":{"type":"array","minItems":1,"maxItems":12,"items":{"type":"object","required":["kind"],"oneOf":[{"additionalProperties":false,"required":["kind","text"],"properties":{"kind":{"const":"text"},"text":{"type":"string","maxLength":2000},"size":{"type":"string","enum":["sm","md","lg"]},"dim":{"type":"boolean"}}},{"additionalProperties":false,"required":["kind","text"],"properties":{"kind":{"const":"markdown"},"text":{"type":"string","maxLength":4000}}},{"additionalProperties":false,"required":["kind","label","value"],"properties":{"kind":{"const":"kpi"},"label":{"type":"string","maxLength":40},"value":{"type":"string","maxLength":80},"delta":{"type":"string","maxLength":80},"format":{"type":"string","enum":["number","money","percent","time","text"]},"good":{"type":"string","enum":["up","down"]}}},{"additionalProperties":false,"required":["kind","columns","rows"],"properties":{"kind":{"const":"table"},"columns":{"type":"array","minItems":1,"maxItems":6,"items":{"type":"object","additionalProperties":false,"required":["label","field"],"properties":{"label":{"type":"string","maxLength":24},"field":{"type":"string","maxLength":40},"format":{"type":"string","enum":["number","money","percent","time","text","delta"]},"align":{"type":"string","enum":["left","right"]}}}},"rows":{"type":"string","maxLength":80},"limit":{"type":"number","minimum":1,"maximum":50},"sort":{"type":"string","maxLength":40},"desc":{"type":"boolean"}}},{"additionalProperties":false,"required":["kind","items"],"properties":{"kind":{"const":"list"},"items":{"type":"string","maxLength":80},"field":{"type":"string","maxLength":40},"meta":{"type":"string","maxLength":40},"limit":{"type":"number","minimum":1,"maximum":50},"empty":{"type":"string","maxLength":80}}},{"additionalProperties":false,"required":["kind"],"properties":{"kind":{"const":"checklist"},"items":{"type":"string","maxLength":80},"static":{"type":"array","maxItems":50,"items":{"type":"string","maxLength":120}},"field":{"type":"string","maxLength":40},"done":{"type":"string","maxLength":40},"on_check":{"type":"string","pattern":"^[a-z][a-z0-9_]{1,40}$"}}},{"additionalProperties":false,"required":["kind","series"],"properties":{"kind":{"const":"chart"},"chart":{"type":"string","enum":["line","area","bar","spark"]},"series":{"type":"string","maxLength":80},"x":{"type":"string","maxLength":40},"y":{"type":"string","maxLength":40},"label":{"type":"string","maxLength":40},"height":{"type":"number","minimum":40,"maximum":240}}},{"additionalProperties":false,"required":["kind","text"],"properties":{"kind":{"const":"badge"},"text":{"type":"string","maxLength":40},"tone":{"type":"string","enum":["ok","warn","err","info"]}}},{"additionalProperties":false,"required":["kind","value"],"properties":{"kind":{"const":"progress"},"label":{"type":"string","maxLength":40},"value":{"type":"string","maxLength":80},"max":{"type":"number","minimum":1}}},{"additionalProperties":false,"required":["kind"],"properties":{"kind":{"const":"clock"},"format":{"type":"string","enum":["time","date","both"]}}},{"additionalProperties":false,"required":["kind","until"],"properties":{"kind":{"const":"countdown"},"until":{"type":"string","maxLength":80},"label":{"type":"string","maxLength":40}}},{"additionalProperties":false,"required":["kind"],"properties":{"kind":{"const":"divider"}}},{"additionalProperties":false,"required":["kind","buttons"],"properties":{"kind":{"const":"buttons"},"buttons":{"type":"array","minItems":1,"maxItems":4,"items":{"type":"object","additionalProperties":false,"required":["label","command"],"properties":{"label":{"type":"string","maxLength":24},"command":{"type":"string","pattern":"^[a-z][a-z0-9_]{1,40}$"},"args":{"type":"object"},"style":{"type":"string","enum":["primary","ghost","danger"]}}}}}}]}}}}/*SCHEMA:end*/;

/* ---------- walidator (ten sam podzbiór co tools/schema-lite.js) ---------- */
const typeOf = v => Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
function validate(schema, value, at = '$') {
  const errs = [], err = m => errs.push(at + ': ' + m);
  if (schema.const !== undefined && value !== schema.const) { err('ma być ' + JSON.stringify(schema.const)); return errs; }
  if (schema.enum && !schema.enum.includes(value)) { err('wartość spoza listy: ' + JSON.stringify(value)); return errs; }
  if (schema.type) {
    const t = typeOf(value), okT = schema.type === t || (schema.type === 'number' && t === 'number' && isFinite(value)) || (schema.type === 'integer' && Number.isInteger(value));
    if (!okT) { err('typ ' + t + ', oczekiwano ' + schema.type); return errs; }
  }
  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) err('za krótki tekst');
    if (schema.maxLength != null && value.length > schema.maxLength) err('za długi tekst (' + value.length + ' > ' + schema.maxLength + ')');
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) err('nie pasuje do wzorca ' + schema.pattern);
  }
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) err('mniej niż ' + schema.minimum);
    if (schema.maximum != null && value > schema.maximum) err('więcej niż ' + schema.maximum);
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) err('za mało elementów');
    if (schema.maxItems != null && value.length > schema.maxItems) err('za dużo elementów (' + value.length + ' > ' + schema.maxItems + ')');
    if (schema.items) value.forEach((v, i) => errs.push(...validate(schema.items, v, at + '[' + i + ']')));
  }
  if (typeOf(value) === 'object') {
    const keys = Object.keys(value), props = schema.properties || {};
    for (const r of schema.required || []) if (!(r in value)) err('brak pola „' + r + '”');
    if (schema.maxProperties != null && keys.length > schema.maxProperties) err('za dużo pól');
    for (const k of keys) {
      if (schema.propertyNames) errs.push(...validate({ type: 'string', ...schema.propertyNames }, k, at + '.' + k + '(nazwa)'));
      if (props[k]) errs.push(...validate(props[k], value[k], at + '.' + k));
      else if (schema.additionalProperties === false && !schema.oneOf) err('niedozwolone pole „' + k + '”');
      else if (typeOf(schema.additionalProperties) === 'object') errs.push(...validate(schema.additionalProperties, value[k], at + '.' + k));
    }
  }
  if (schema.oneOf) {
    const results = schema.oneOf.map(s => validate({ ...s, oneOf: undefined }, value, at));
    const okN = results.filter(r => !r.length).length;
    if (okN !== 1) {
      const i = schema.oneOf.findIndex(s => s.properties?.kind?.const !== undefined && s.properties.kind.const === value?.kind);
      if (okN === 0) errs.push(...(i >= 0 ? results[i] : [at + ': nie pasuje do żadnego wariantu' + (value?.kind ? ' (kind=' + value.kind + ')' : '')]));
      else err('pasuje do kilku wariantów');
    }
  }
  return errs;
}

/* ---------- zasady ponad schemat: rozmiar, źródła A3, istniejące polecenia, odnośniki do znanych źródeł ---------- */
const MAX_BYTES = 16 * 1024, MAX_SPEC_WIDGETS = 30, MIN_REFRESH = 15, MAX_LIVE_SOURCES = 20;
const refsIn = v => { const out = []; const walk = x => { if (typeof x === 'string') { if (/^\$[a-z]/.test(x)) out.push(x); (x.match(/\{\{\s*\$[^}]+\}\}/g) || []).forEach(m => out.push(m.replace(/^\{\{\s*|\s*\}\}$/g, ''))); } else if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') Object.values(x).forEach(walk); }; walk(v); return out; };
const check = spec => {
  let size = 0; try { size = JSON.stringify(spec).length; } catch (e) { return ['$: opis nie jest poprawnym JSON-em']; }
  if (size > MAX_BYTES) return ['$: opis za duży (' + size + ' > ' + MAX_BYTES + ' bajtów)'];
  const errs = validate(SCHEMA, spec); if (errs.length) return errs.slice(0, 8);
  const R = J.registry;
  for (const [name, s] of Object.entries(spec.sources || {})) {
    const c = R.get(s.command); if (!c) { errs.push('$.sources.' + name + ': nie ma polecenia „' + s.command + '”'); continue; }
    const lvl = J.policy.level(c, s.args || {});
    if (lvl !== 'A3' || c.writes.some(x => x !== 'windows') || c.risk !== 'safe') errs.push('$.sources.' + name + ': „' + s.command + '” nie jest poleceniem odczytu (A3) — źródłem danych może być tylko odczyt');
    else { const v = R.coerce(s.command, s.args || {}); if (!v.ok) errs.push('$.sources.' + name + '.args: ' + v.text); }
    if (s.refresh && s.refresh < MIN_REFRESH) errs.push('$.sources.' + name + '.refresh: minimum ' + MIN_REFRESH + ' s (albo 0 = bez odświeżania)');
  }
  spec.blocks.forEach((b, i) => {
    (b.kind === 'buttons' ? b.buttons.map(x => x.command) : b.on_check ? [b.on_check] : []).forEach(cmd => { if (!R.get(cmd)) errs.push('$.blocks[' + i + ']: nie ma polecenia „' + cmd + '”'); });
    if (b.kind === 'checklist' && !b.items && !b.static) errs.push('$.blocks[' + i + ']: lista wymaga „items” (dane) albo „static”');
  });
  refsIn(spec.blocks).concat(refsIn(spec.title)).forEach(r => { const src = /^\$([a-z][a-z0-9_]*)/.exec(r)?.[1]; if (!spec.sources?.[src]) errs.push('odnośnik ' + r + ': nie ma źródła „' + src + '”'); });
  return errs;
};

/* ---------- odnośniki i formaty ---------- */
const get = (data, ref) => {
  const m = /^\$([a-z][a-z0-9_]*)(.*)$/.exec(String(ref || '')); if (!m) return undefined;
  let v = data?.[m[1]]; const path = m[2].match(/\.[^.[\]]+|\[\d+\]/g) || [];
  for (const p of path) { if (v == null) return undefined; v = p[0] === '[' ? v[+p.slice(1, -1)] : v[p.slice(1)]; }
  return v;
};
const pick = (row, field) => field ? String(field).split('.').reduce((a, k) => a == null ? a : a[k], row) : row;
const fmt = (v, f) => {
  if (v == null || v === '' || (typeof v === 'number' && !isFinite(v))) return '—';
  const n = typeof v === 'number' ? v : parseFloat(v);
  switch (f) {
    case 'number': return isFinite(n) ? n.toLocaleString('pl-PL') : String(v);
    case 'money': return isFinite(n) ? J.fmtMoney(n) : String(v);
    case 'percent': return isFinite(n) ? (Math.abs(n) <= 1 && String(v).indexOf('.') >= 0 ? Math.round(n * 100) : +n.toFixed(2)) + '%' : String(v);
    case 'delta': return isFinite(n) ? (n >= 0 ? '▲ +' : '▼ ') + (+n.toFixed(2)) + '%' : String(v);
    case 'time': { const d = /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v) : null; return d && !isNaN(d) ? J.pad(d.getHours()) + ':' + J.pad(d.getMinutes()) : String(v); }
    default: return typeof v === 'object' ? JSON.stringify(v).slice(0, 80) : String(v);
  }
};
const value = (data, v, f) => typeof v !== 'string' ? fmt(v, f) : /^\$[a-z]/.test(v) ? fmt(get(data, v), f) : v.replace(/\{\{\s*(\$[^}]+?)\s*\}\}/g, (_, r) => fmt(get(data, r), 'text'));
const raw = (data, v) => typeof v === 'string' && /^\$[a-z]/.test(v) ? get(data, v) : v;

/* ---------- Markdown → elementy (bez innerHTML) ---------- */
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const inline = (parent, text, onLink) => {
  const re = /(\*\*([^*]+)\*\*)|(\*([^*\s][^*]*)\*)|(`([^`]+)`)|(\[([^\]]+)\]\((https:\/\/[^\s)]+)\))/g; let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
    if (m[1]) parent.appendChild(el('strong', null, m[2])); else if (m[3]) parent.appendChild(el('em', null, m[4])); else if (m[5]) parent.appendChild(el('code', null, m[6]));
    else { const a = el('a', null, m[8]); a.href = m[9]; a.rel = 'noopener noreferrer'; a.onclick = e => { e.preventDefault(); onLink?.(m[9]); }; parent.appendChild(a); }
    last = re.lastIndex;
  }
  if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
};
const mdNodes = (text, onLink) => {
  const box = el('div', 'md'); let list = null;
  String(text || '').split('\n').forEach(l => {
    let m;
    if ((m = /^(#{1,3})\s+(.*)$/.exec(l))) { list = null; const hd = el('h' + (m[1].length + 2)); inline(hd, m[2], onLink); box.appendChild(hd); }
    else if ((m = /^\s*[-*•]\s+(.*)$/.exec(l))) { if (!list) { list = el('ul'); box.appendChild(list); } const li = el('li'); inline(li, m[1], onLink); list.appendChild(li); }
    else if (!l.trim()) list = null;
    else { list = null; const p = el('p'); inline(p, l, onLink); box.appendChild(p); }
  });
  return box;
};

/* ---------- dane: wspólna pamięć podręczna wywołań ---------- */
const cache = new Map();   // klucz command+args → { ts, p (Promise wyniku) }
const stats = { calls: 0 };
const fetchSource = (s, force) => {
  const key = s.command + JSON.stringify(s.args || {}), hit = cache.get(key), ttl = Math.max(5, s.refresh || 0) * 1000 - 500;
  if (!force && hit && Date.now() - hit.ts < ttl) return hit.p;
  stats.calls++;
  const p = J.registry.run(s.command, s.args || {}, { source: 'widget' }); cache.set(key, { ts: Date.now(), p });
  p.then(r => { if (!r.ok) cache.delete(key); }, () => cache.delete(key));
  return p;
};
const saveCache = J.debounce(() => { const o = {}; live.forEach((v, id) => { if (v.data) o[id] = { data: v.data, ts: v.ts }; }); J.store?.set?.('widgets.cache', o).catch?.(() => { }); }, 1500);
let stored = null; const loadStored = async () => { if (!stored) { try { stored = (await J.store.get('widgets.cache', {})) || {}; } catch (e) { stored = {}; } } return stored; };
const live = new Map();   // id widgetu → { data, ts, state, render(), refresh() }

/* ---------- render bloków ---------- */
const TONE = { accent: 'var(--accent)', blue: '#4d8dff', purple: '#a06bff', teal: '#26d0c2', green: '#39e59a', warn: '#ffb547' };
const SIZE = { S: [260, 210], M: [340, 300], L: [460, 380], XL: [600, 460] };
const renderBlock = (b, data, w, ctx) => {
  const box = el('div', 'ws-b ws-' + b.kind);
  const run = (cmd, args, label) => {
    const c = J.registry.get(cmd); if (!c) return;
    const lvl = J.policy.level(c, args || {});
    /* przycisk z polecenia A0 pyta zawsze; w widgecie zbudowanym (albo zmienionym) przez model pyta też każdy zapis spoza A3 —
       podpis przycisku pisał model i mógł nie odpowiadać temu, co przycisk naprawdę robi, więc w pytaniu pokazujemy prawdziwe polecenie */
    const fromModel = w.author === 'model' && (c.writes || []).length && lvl !== 'A3';
    const real = c.label + (Object.keys(args || {}).length ? ' (' + Object.entries(args).filter(([, v]) => typeof v !== 'object').map(([k, v]) => k + ': ' + String(v).slice(0, 40)).join(', ') + ')' : '');
    const ask = lvl === 'A0' || fromModel;
    return J.registry.run(cmd, args || {}, ask ? { source: 'widget', forceConfirm: 'Widget „' + w.title + '”' + (fromModel ? ' (zbudowany przez model)' : '') + ': przycisk „' + (label || c.label) + '” wykona: ' + real + '. Wykonać?' } : { source: 'ui' }).then(r => { if (r.ok && r.undoEntry) J.undo.offer(r.undoEntry); if (!r.ok) J.toast?.(r.text); J.wspec.refresh(w.id); return r; });
  };
  switch (b.kind) {
    case 'text': box.appendChild(el('div', 'ws-text' + (b.size ? ' ' + b.size : '') + (b.dim ? ' dim' : ''), value(data, b.text))); break;
    case 'markdown': box.appendChild(mdNodes(value(data, b.text), url => run('open_url', { url }))); break;
    case 'kpi': {
      box.appendChild(el('div', 'ws-kl', value(data, b.label)));
      box.appendChild(el('div', 'ws-kv', value(data, b.value, b.format)));
      if (b.delta != null) { const dv = raw(data, b.delta), num = typeof dv === 'number' ? dv : NaN; const d = el('div', 'ws-kd', isFinite(num) ? fmt(num, 'delta') : value(data, b.delta)); if (isFinite(num)) d.classList.add((num >= 0) === (b.good !== 'down') ? 'up' : 'down'); box.appendChild(d); }
      break;
    }
    case 'table': {
      let rows = raw(data, b.rows); rows = Array.isArray(rows) ? rows.slice() : [];
      if (b.sort) rows.sort((x, y) => { const a = pick(x, b.sort), c = pick(y, b.sort); return (a > c ? 1 : a < c ? -1 : 0) * (b.desc ? -1 : 1); });
      rows = rows.slice(0, b.limit || 50);
      const t = el('table', 'ws-table'), hr = el('tr'); b.columns.forEach(c => { const th = el('th', c.align === 'right' ? 'r' : null, c.label); hr.appendChild(th); }); t.appendChild(hr);
      rows.forEach(r => { const tr = el('tr'); b.columns.forEach(c => { const v = pick(r, c.field), td = el('td', c.align === 'right' ? 'r' : null, fmt(v, c.format)); if (c.format === 'delta' && isFinite(+v)) td.classList.add(+v >= 0 ? 'up' : 'down'); tr.appendChild(td); }); t.appendChild(tr); });
      if (!rows.length) box.appendChild(el('div', 'empty', 'Brak danych')); else box.appendChild(t);
      break;
    }
    case 'list': {
      const items = (Array.isArray(raw(data, b.items)) ? raw(data, b.items) : []).slice(0, b.limit || 50);
      if (!items.length) { box.appendChild(el('div', 'empty', b.empty || 'Pusto')); break; }
      const ul = el('ul', 'ws-list'); items.forEach(it => { const li = el('li'); li.appendChild(el('span', null, fmt(pick(it, b.field), 'text'))); if (b.meta) li.appendChild(el('small', null, fmt(pick(it, b.meta), 'text'))); ul.appendChild(li); }); box.appendChild(ul);
      break;
    }
    case 'checklist': {
      const dataItems = b.items ? raw(data, b.items) : null, items = Array.isArray(dataItems) ? dataItems : (b.static || []).map((text, i) => ({ text, done: !!w.data.checked?.[i], _i: i }));
      if (!items.length) { box.appendChild(el('div', 'empty', 'Pusto')); break; }
      items.slice(0, 50).forEach(it => {
        const lab = el('label', 'w-item' + (pick(it, b.done || 'done') ? ' done' : '')), cb = el('input'); cb.type = 'checkbox'; cb.checked = !!pick(it, b.done || 'done');
        lab.appendChild(cb); lab.appendChild(el('span', null, fmt(pick(it, b.field || 'text'), 'text')));
        cb.onchange = () => {
          if (it._i != null) { w.data.checked = { ...(w.data.checked || {}), [it._i]: cb.checked }; J.save(); lab.classList.toggle('done', cb.checked); return; }
          if (!b.on_check) return;
          const c = J.registry.get(b.on_check), props = c?.args?.properties || {}, key = (c?.args?.required || []).find(k => k !== 'done') || Object.keys(props)[0];
          run(b.on_check, { [key]: it.id ?? pick(it, b.field || 'text'), ...(props.done ? { done: cb.checked } : {}) });
        };
        box.appendChild(lab);
      });
      break;
    }
    case 'chart': {
      if (b.label) box.appendChild(el('div', 'ws-kl', value(data, b.label)));
      const cv = el('canvas', 'ws-chart'); cv.style.height = (b.height || 120) + 'px'; box.appendChild(cv);
      let s = raw(data, b.series); s = Array.isArray(s) ? s.map(p => typeof p === 'number' ? p : { x: b.x ? pick(p, b.x) : undefined, y: +pick(p, b.y || 'y') }) : [];
      const draw = () => J.chart?.(cv, s, { kind: b.chart || 'line', color: TONE[w.spec.tone] && w.spec.tone !== 'accent' ? TONE[w.spec.tone] : undefined });
      requestAnimationFrame?.(draw); ctx._draws.push(draw);
      break;
    }
    case 'badge': box.appendChild(el('span', 'ws-badge ' + (b.tone || 'info'), value(data, b.text))); break;
    case 'progress': {
      const v = +raw(data, b.value), max = b.max || 100, pct = isFinite(v) ? J.clamp(v / max, 0, 1) : 0;
      if (b.label) box.appendChild(el('div', 'ws-kl', value(data, b.label) + ' · ' + Math.round(pct * 100) + '%'));
      const bar = el('div', 'ws-prog'), fill = el('i'); fill.style.width = (pct * 100) + '%'; bar.appendChild(fill); box.appendChild(bar);
      break;
    }
    case 'clock': { const c = el('div', 'ws-clock'); const tick = () => { const d = new Date(); c.textContent = (b.format === 'date' ? '' : J.pad(d.getHours()) + ':' + J.pad(d.getMinutes()) + ':' + J.pad(d.getSeconds())) + (b.format === 'date' || b.format === 'both' ? (b.format === 'both' ? ' · ' : '') + d.toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' }) : ''); }; tick(); ctx._ticks.push(tick); box.appendChild(c); break; }
    case 'countdown': {
      const c = el('div', 'ws-clock'), until = new Date(value(data, b.until)); if (b.label) box.appendChild(el('div', 'ws-kl', b.label));
      const tick = () => { const ms = until - Date.now(); if (isNaN(ms)) { c.textContent = '—'; return; } if (ms <= 0) { c.textContent = 'Już!'; if (!w._cdDone) { w._cdDone = true; J.notice?.({ title: w.title, body: (b.label || 'odliczanie') + ' — już!', kind: 'timer' }); } return; } const s = Math.floor(ms / 1000), dd = Math.floor(s / 86400); c.textContent = (dd ? dd + ' d ' : '') + J.pad(Math.floor(s % 86400 / 3600)) + ':' + J.pad(Math.floor(s % 3600 / 60)) + ':' + J.pad(s % 60); };
      tick(); ctx._ticks.push(tick); box.appendChild(c); break;
    }
    case 'divider': box.appendChild(el('hr', 'ws-hr')); break;
    case 'buttons': { const row = el('div', 'ws-btns'); b.buttons.forEach(x => { const bt = el('button', 'btn sm' + (x.style === 'primary' ? ' primary' : x.style === 'danger' ? ' ghost danger' : x.style === 'ghost' ? ' ghost' : ''), x.label); bt.type = 'button'; bt.onclick = () => run(x.command, x.args, x.label); row.appendChild(bt); }); box.appendChild(row); break; }
  }
  return box;
};

/* ---------- montaż widgetu z opisu ---------- */
const hhmm = ts => { const d = new Date(ts); return J.pad(d.getHours()) + ':' + J.pad(d.getMinutes()); };
const mount = (body, w, wctx) => {
  const key = 'w:' + w.id, st = { data: null, ts: 0, state: 'building', err: '', flagged: false };
  const root = el('div', 'ws' + (w.spec.layout && w.spec.layout !== 'stack' ? ' ' + w.spec.layout : '')); if (TONE[w.spec.tone]) root.style.setProperty('--ws-tone', TONE[w.spec.tone]);
  const blocks = el('div', 'ws-blocks'), foot = el('div', 'ws-foot'); root.appendChild(blocks); root.appendChild(foot); body.innerHTML = ''; body.appendChild(root);
  const rctx = { _ticks: [], _draws: [] };
  const render = () => {
    rctx._ticks = []; rctx._draws = []; blocks.textContent = '';
    root.dataset.state = st.state;
    if (st.state === 'building' && !st.data && Object.keys(w.spec.sources || {}).length) { for (let i = 0; i < Math.min(3, w.spec.blocks.length); i++) blocks.appendChild(el('div', 'ws-skel')); foot.textContent = 'Buduję…'; return; }
    if (st.state === 'error' && !st.data) { blocks.appendChild(el('div', 'empty', st.err || 'Nie udało się pobrać danych.')); const b = el('button', 'btn sm', 'Spróbuj ponownie'); b.onclick = () => refresh(true); blocks.appendChild(b); foot.textContent = ''; return; }
    if (st.flagged) blocks.appendChild(el('span', 'ws-badge warn', '⚠ podejrzana treść'));
    w.spec.blocks.forEach(b => { try { blocks.appendChild(renderBlock(b, st.data || {}, w, rctx)); } catch (e) { blocks.appendChild(el('div', 'empty', 'Błąd bloku ' + b.kind + ': ' + e.message)); } });
    foot.textContent = !Object.keys(w.spec.sources || {}).length ? '' : st.state === 'stale' || st.state === 'offline' ? (st.state === 'offline' ? '☁ ' : '') + 'nieaktualne' + (st.ts ? ' (z ' + hhmm(st.ts) + ')' : '') + (st.err ? ' — ' + st.err : '') : 'odświeżono ' + hhmm(st.ts);
    const t = value(st.data || {}, w.spec.title); if (t !== w.title) wctx.setTitle?.(t);
  };
  const paused = () => (typeof document !== 'undefined' && document.hidden) || J.wm.isMin?.(key) || !!w.collapsed;
  const refresh = async (force, only) => {
    const srcs = Object.entries(w.spec.sources || {}).filter(([n]) => !only || only.includes(n)); if (!srcs.length) { st.state = 'live'; render(); return; }
    const out = { ...(st.data || {}) }; let failed = null;
    await Promise.all(srcs.map(async ([n, s]) => { const r = await fetchSource(s, force); if (r.ok) { out[n] = r.data; if (J.registry.get(s.command)?.external && J.policy.injection?.(JSON.stringify(r.data)).flagged) st.flagged = true; } else failed = r; }));
    if (failed && !st.data) { st.state = 'error'; st.err = failed.text; }
    else if (failed) { st.state = failed.code === 'OFFLINE' ? 'offline' : 'stale'; st.err = failed.text; st.data = out; }
    else { st.state = 'live'; st.err = ''; st.data = out; st.ts = Date.now(); saveCache(); }
    render();
  };
  /* start: dane z poprzedniej sesji (stale), potem świeże */
  loadStored().then(o => { if (!st.data && o[w.id]) { st.data = o[w.id].data; st.ts = o[w.id].ts; st.state = 'stale'; render(); } });
  render(); refresh(false);
  /* odświeżanie: co min(refresh) s; zdarzenia przeliczają swoje źródła; wstrzymane przy ukrytej/zminimalizowanej/zwiniętej */
  const every = Math.min(...Object.values(w.spec.sources || {}).map(s => s.refresh || Infinity));
  let lastAuto = Date.now();
  const tick = () => { if (!paused()) rctx._ticks.forEach(f => f()); if (isFinite(every) && !paused() && Date.now() - lastAuto >= every * 1000) { lastAuto = Date.now(); refresh(false); } };
  const iv = J.wspec.ticker.add(tick);
  const offs = [];
  Object.entries(w.spec.sources || {}).forEach(([n, s]) => { if (s.event) offs.push(J.on(s.event, J.debounce(() => { if (!paused()) refresh(true, [n]); }, 400))); });
  offs.push(J.on('wm-resize', id => { if (id === key) rctx._draws.forEach(f => f()); }));
  live.set(w.id, { get data() { return st.data; }, get ts() { return st.ts; }, get state() { return st.state; }, render, refresh });
  wctx.onClose(() => { J.wspec.ticker.remove(iv); offs.forEach(f => f?.()); live.delete(w.id); });
};

/* ---------- przepisy lokalne: zdanie → opis bez modelu (najczęstsze prośby z 05-widgety.md §3.9) ---------- */
const PL_MONTH = { stycznia: 1, lutego: 2, marca: 3, kwietnia: 4, maja: 5, czerwca: 6, lipca: 7, sierpnia: 8, wrzesnia: 9, pazdziernika: 10, listopada: 11, grudnia: 12 };
const fromPrompt = text => {
  const n = J.norm(String(text || '')); let m;
  const coin = J.cmdKit.coinOf?.(n.replace(/^.*?(wykres\w*|kurs\w*|cen\w*)\s+/, '').split(' ')[0]);
  if ((m = /top\s*(\d+)\s*(tokenow|kryptowalut|krypto|walut)/.exec(n)) || /(tabel\w*|widget) (z )?(kursami|krypto|kryptowalut)/.test(n)) {
    const k = m ? J.clamp(+m[1], 1, 12) : 5;
    return { v: 1, title: 'Top ' + k + ' krypto', icon: 'market', size: 'M', tone: 'teal', sources: { ceny: { command: 'get_crypto_prices', args: {}, refresh: 60, event: 'market' } }, blocks: [{ kind: 'table', rows: '$ceny.prices', limit: k, sort: 'usd', desc: true, columns: [{ label: 'Symbol', field: 'symbol' }, { label: 'Cena', field: 'usd', format: 'money', align: 'right' }, { label: '24h', field: 'change_24h', format: 'delta', align: 'right' }] }, { kind: 'text', text: 'Źródło: {{$ceny.source}}', size: 'sm', dim: true }] };
  }
  if (/(wykres|kurs\w*|cen\w)/.test(n) && coin && J.market?.COINS?.some(c => c.sym === coin)) return { v: 1, title: coin, icon: 'chart', size: 'S', tone: 'accent', sources: { ceny: { command: 'get_crypto_prices', args: { symbol: coin }, refresh: 30, event: 'market' } }, blocks: [{ kind: 'kpi', label: coin, value: '$ceny.prices[0].usd', delta: '$ceny.prices[0].change_24h', format: 'money', good: 'up' }, { kind: 'chart', chart: /spark|mini/.test(n) ? 'spark' : 'area', series: '$ceny.prices[0].spark', height: 70 }] };
  if (/pogod/.test(n) && /zadani/.test(n)) return { v: 1, title: 'Mój dzień', icon: 'weather', size: 'L', layout: 'grid2', sources: { pog: { command: 'get_weather', args: {}, refresh: 900, event: 'weather' }, zad: { command: 'tasks_list', args: { range: 'today' }, event: 'tasks' } }, blocks: [{ kind: 'kpi', label: '{{$pog.city}}', value: '{{$pog.now.temp}}°C', delta: '$pog.now.desc', format: 'text' }, { kind: 'list', items: '$zad.tasks', field: 'text', meta: 'time', limit: 6, empty: 'Brak zadań na dziś' }, { kind: 'clock', format: 'both' }] };
  if (/checklist|lista zadan|zadania na dzis|na dzis/.test(n) && /(karte|widget|checklist)/.test(n)) return { v: 1, title: 'Na dziś', icon: 'calendar', size: 'M', sources: { zad: { command: 'tasks_list', args: { range: 'today' }, event: 'tasks' } }, blocks: [{ kind: 'progress', label: 'Zrobione', value: '$zad.ratio', max: 1 }, { kind: 'checklist', items: '$zad.tasks', field: 'text', done: 'done', on_check: 'tasks_complete' }, { kind: 'buttons', buttons: [{ label: 'Otwórz harmonogram', command: 'open_app', args: { app: 'schedule' }, style: 'ghost' }] }] };
  if ((m = /odliczani\w* do (.+?)\s+(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?$/.exec(n)) && PL_MONTH[m[3]]) {
    const now = new Date(), mon = PL_MONTH[m[3]]; let y = +(m[4] || now.getFullYear()); const d = new Date(y, mon - 1, +m[2], 8); if (!m[4] && d < now) y++;
    const label = m[1].replace(/^(mojego |moich )/, '');
    return { v: 1, title: label[0].toUpperCase() + label.slice(1), icon: 'flag', size: 'S', tone: 'purple', blocks: [{ kind: 'countdown', until: y + '-' + J.pad(mon) + '-' + J.pad(+m[2]) + 'T08:00', label: 'do: ' + label }] };
  }
  if (/pogod/.test(n)) return { v: 1, title: 'Pogoda — {{$pog.city}}', icon: 'weather', size: 'M', sources: { pog: { command: 'get_weather', args: {}, refresh: 900, event: 'weather' } }, blocks: [{ kind: 'kpi', label: 'teraz', value: '{{$pog.now.temp}}°C', delta: '$pog.now.desc', format: 'text' }, { kind: 'chart', chart: 'line', series: '$pog.hours', x: 'time', y: 'temp', label: 'najbliższe godziny', height: 90 }] };
  if (/zegar/.test(n)) return { v: 1, title: 'Zegar', icon: 'timer', size: 'S', blocks: [{ kind: 'clock', format: 'both' }] };
  return null;
};

/* jeden wspólny zegar 1 s dla wszystkich widgetów z opisu (wcześniej każdy miał własny setInterval); błąd w jednym nie zatrzymuje innych */
const ticker = (() => { const fns = new Set(); let iv = null; return {
  add(f) { fns.add(f); if (!iv) iv = setInterval(() => fns.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }), 1000); return f; },
  remove(f) { fns.delete(f); if (!fns.size && iv) { clearInterval(iv); iv = null; } },
  get size() { return fns.size; } }; })();
J.wspec = { SCHEMA, ticker, validate, check, get, fmt, value, mdNodes, mount, fromPrompt, stats, cache, live, SIZE, MAX_SPEC_WIDGETS, MAX_LIVE_SOURCES,
  sizeOf: spec => SIZE[spec?.size] || SIZE.M,
  refresh(id) { const ids = id ? [id] : [...live.keys()]; return Promise.all(ids.map(i => live.get(i)?.refresh(true))); },
  /* JSON Merge Patch (RFC 7386) */
  merge(target, patch) { if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch; const out = target && typeof target === 'object' && !Array.isArray(target) ? { ...target } : {}; for (const [k, v] of Object.entries(patch)) { if (v === null) delete out[k]; else out[k] = J.wspec.merge(out[k], v); } return out; }
};
})();
