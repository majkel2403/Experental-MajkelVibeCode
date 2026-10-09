/* =========================================================
   JARVIS OS — Command Registry: jedno źródło prawdy o możliwościach
   Z jednego wpisu powstają: narzędzie dla Hermesa (JSON Schema), wzorce silnika
   lokalnego (przykłady PL), pozycja palety i menu, opis „co potrafisz”.
   Każde wykonanie zwraca kopertę: { ok, code, data, text, ui }.
   Kody: OK · NOT_FOUND · INVALID_ARGS · NEEDS_CONFIRMATION · DENIED · DUPLICATE ·
         OFFLINE · RATE_LIMITED · TIMEOUT · UNSUPPORTED · INTERNAL
   ========================================================= */
'use strict';
(() => {
const DIA = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };
const norm = s => String(s || '').toLowerCase().replace(/[ąćęłńóśźż]/g, c => DIA[c]).replace(/[„”"']/g, '').replace(/\s+/g, ' ').trim();
J.norm = norm;
/* prośba o raport na końcu zdania („potem powiedz krótko, co zrobiłeś”, „podsumuj”) to nie osobne polecenie: odpowiedź Jarvisa
   i tak wylicza, co zrobił. Bez tego łańcuch czytał na głos dosłownie „krótko, co zrobiłeś” (test na żywo 2026-10-04). */
const REPORT = /^(?:(?:potem|a potem|i potem|nastepnie|na koniec|i|to)\s+)?(?:(?:powiedz|napisz|przekaz|zamelduj|daj znac)(?:\s+mi)?\s+(?:(?:krotko|w skrocie|na koniec|potem)\s+)?(?:co|jak)\s+(?:zrobil\w*|poszlo|wyszlo|sie udalo)|(?:(?:krotko|w skrocie)\s+)?co\s+zrobil(?:es|as))(?:\s+(?:dokladnie|po kolei|wszystko))?$|^(?:(?:potem|a potem|i potem|nastepnie|na koniec|i)\s+)?(?:podsumuj(?:\s+(?:to|krotko|wszystko))?|zrob podsumowanie|potwierdz(?:\s+mi)?)$/;
const isReport = p => REPORT.test(norm(p).replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim());
/* usuwa części-raporty; sprawdza też dwie sąsiednie części razem, bo przecinek dzieli „powiedz krótko, co zrobiłeś” na dwie */
const dropReports = parts => { const out = []; for (let i = 0; i < parts.length; i++) { if (isReport(parts[i])) continue; if (i + 1 < parts.length && isReport(parts[i] + ' ' + parts[i + 1])) { i++; continue; } out.push(parts[i]); } return out; };
J.isReport = isReport;
const IMPERATIVE = /^(?:otworz|zamknij|wyslij|zamow|kup|napisz|znajdz|wyszukaj|pusc|wlacz|wylacz|ustaw|dodaj|zadzwon|sprawdz|pokaz|przeczytaj|usun|zapisz|zrob|idz|wejdz|uruchom|odpal|zagraj|policz|oblicz|zanotuj|przypomnij|skopiuj|wklej|posprzataj|przenies|zmien|zarezerwuj|zaplac|przelej|odpowiedz|przeslij|udostepnij|pobierz|zainstaluj)\b/;

/* ---------- koperta wyniku ---------- */
/* undo (opcjonalne): funkcja cofająca skutek; nie jest polem wyliczalnym, więc nie trafia do JSON-a dla modelu ani do logów */
const ok = (data, text, ui, undo) => { const r = { ok: true, code: 'OK', data: data ?? null, text: text || 'Gotowe.', ui: ui || null }; if (typeof undo === 'function') Object.defineProperty(r, 'undo', { value: undo, enumerable: false }); return r; };
const fail = (code, text, data) => ({ ok: false, code: code || 'INTERNAL', text: text || 'Nie udało się.', data: data ?? null, ui: null });

/* ---------- język: czas, daty, liczby (PL) ---------- */
const WORDNUM = { zero: 0, jeden: 1, jedna: 1, jedno: 1, dwa: 2, dwie: 2, trzy: 3, cztery: 4, piec: 5, szesc: 6, siedem: 7, osiem: 8, dziewiec: 9, dziesiec: 10, jedenascie: 11, dwanascie: 12, pietnascie: 15, dwadziescia: 20, trzydziesci: 30, czterdziesci: 40, piecdziesiat: 50, szescdziesiat: 60, pol: .5, polowa: .5, kwadrans: 15, godzine: 60, godzina: 60 };
const numIn = s => { const m = /(\d+(?:[.,]\d+)?)/.exec(s); if (m) return parseFloat(m[1].replace(',', '.')); const w = Object.keys(WORDNUM).find(k => new RegExp('\\b' + k + '\\b').test(s)); return w != null ? WORDNUM[w] : null; };
J.nlp = {
  norm, numIn,
  /* „codziennie”, „w dni robocze”, „w poniedziałki i czwartki”, „co tydzień”, „co miesiąc”, „co 3 dni” → reguła powtarzania albo null */
  repeat(text) {
    const n = norm(text), D = { poniedzialki: 'pn', poniedzialek: 'pn', wtorki: 'wt', wtorek: 'wt', srody: 'sr', sroda: 'sr', czwartki: 'cz', czwartek: 'cz', piatki: 'pt', piatek: 'pt', soboty: 'so', sobota: 'so', niedziele: 'nd', niedziela: 'nd' };
    if (/\b(codziennie|kazdego dnia|co dzien)\b/.test(n)) return { rule: 'daily' };
    if (/\b(w dni robocze|w dni powszednie|od poniedzialku do piatku)\b/.test(n)) return { rule: 'weekdays' };
    let m = /\bco (\d+|dwa|trzy|cztery|piec|szesc|siedem|osiem|dziewiec|dziesiec) dni\b/.exec(n); if (m) return { rule: 'every_n_days', n: +m[1] || numIn(m[1]) };
    if (/\b(co miesiac|kazdego miesiaca|raz w miesiacu)\b/.test(n)) return { rule: 'monthly' };
    const days = [...n.matchAll(/\b(poniedzialki|wtorki|srody|czwartki|piatki|soboty|niedziele)\b/g)].map(x => D[x[1]]);
    if (days.length) return { rule: 'weekly', days: [...new Set(days)] };
    if (/\b(co tydzien|kazdego tygodnia|raz w tygodniu)\b/.test(n)) return { rule: 'weekly' };
    return null;
  },
  /* „18:30”, „18.30”, „o 18”, „o osiemnastej” → HH:MM albo null */
  time(text) {
    const n = norm(text);
    let m = /\b(\d{1,2})[:.](\d{2})\b/.exec(n); if (m && +m[1] < 24 && +m[2] < 60) return J.pad(+m[1]) + ':' + m[2];
    m = /\b(?:o|na|do)\s+(\d{1,2})(?::(\d{2}))?\b(?!\s*(?:min|sek|godz|h\b|m\b|s\b))/.exec(n); if (m && +m[1] < 24) return J.pad(+m[1]) + ':' + (m[2] || '00');
    m = /\b(\d{1,2})\s*(?:rano|wieczorem|po poludniu)\b/.exec(n); if (m) { let hh = +m[1]; if (/wieczorem|po poludniu/.test(m[0]) && hh < 12) hh += 12; return J.pad(hh) + ':00'; }
    const H = { pierwszej: 1, drugiej: 2, trzeciej: 3, czwartej: 4, piatej: 5, szostej: 6, siodmej: 7, osmej: 8, dziewiatej: 9, dziesiatej: 10, jedenastej: 11, dwunastej: 12, trzynastej: 13, czternastej: 14, pietnastej: 15, szesnastej: 16, siedemnastej: 17, osiemnastej: 18, dziewietnastej: 19, dwudziestej: 20 };
    m = /\bo\s+(?:godzinie\s+)?([a-z]+)(?:\s+(trzydziesci|pietnascie|czterdziesci piec))?/.exec(n);
    if (m && H[m[1]] != null) return J.pad(H[m[1]]) + ':' + (m[2] === 'trzydziesci' ? '30' : m[2] === 'pietnascie' ? '15' : m[2] ? '45' : '00');
    if (/\bw poludnie\b/.test(n)) return '12:00'; if (/\bo polnocy\b/.test(n)) return '00:00';
    return null;
  },
  /* „jutro”, „pojutrze”, „w piątek”, „za 3 dni”, „2026-10-01”, „1.10” → YYYY-MM-DD */
  date(text, base = new Date()) {
    const n = norm(text), d = new Date(base); d.setHours(12, 0, 0, 0);
    const fmt = x => x.getFullYear() + '-' + J.pad(x.getMonth() + 1) + '-' + J.pad(x.getDate());
    let m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(n); if (m) return m[0];
    m = /\b(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{4}))?\b(?!\s*[:.]?\d{2})/.exec(n); if (m && +m[2] <= 12 && +m[1] <= 31) { const y = m[3] ? +m[3] : d.getFullYear(); return y + '-' + J.pad(+m[2]) + '-' + J.pad(+m[1]); }
    if (/\bpojutrze\b/.test(n)) { d.setDate(d.getDate() + 2); return fmt(d); }
    if (/\bjutro\b/.test(n)) { d.setDate(d.getDate() + 1); return fmt(d); }
    if (/\b(dzis|dzisiaj)\b/.test(n)) return fmt(d);
    m = /\bza\s+(\d+|[a-z]+)\s+(dni|dzien|tydzien|tygodnie|tygodni)\b/.exec(n);
    if (m) { const k = numIn(m[1]) ?? 1; d.setDate(d.getDate() + k * (/tyd/.test(m[2]) ? 7 : 1)); return fmt(d); }
    const DAYS = { poniedzialek: 1, wtorek: 2, srode: 3, sroda: 3, czwartek: 4, piatek: 5, sobote: 6, sobota: 6, niedziele: 0, niedziela: 0 };
    m = /\b(?:w|we)\s+(poniedzialek|wtorek|srode|sroda|czwartek|piatek|sobote|sobota|niedziele|niedziela)\b/.exec(n);
    if (m) { const want = DAYS[m[1]]; let add = (want - d.getDay() + 7) % 7; if (!add) add = 7; d.setDate(d.getDate() + add); return fmt(d); }
    return null;
  },
  /* „za 20 minut”, „za godzinę”, „za półtorej godziny” → {time, date} (względnie od teraz) albo null */
  relative(text, base = new Date()) {
    const n = norm(text);
    const m = /\bza\s+(poltorej|pol|kwadrans|\d+(?:[.,]\d+)?|[a-z]+)\s*(minut|minuty|minute|min|godzin|godziny|godzine|h|sekund|sekundy|sek)?\b/.exec(n);
    if (!m) return null;
    let v = m[1] === 'poltorej' ? 1.5 : m[1] === 'kwadrans' ? 15 : numIn(m[1]); if (v == null) return null;
    const u = m[2] || (m[1] === 'kwadrans' ? 'min' : m[1] === 'poltorej' || m[1] === 'pol' ? 'godzin' : 'min');
    const ms = /^godz|^h/.test(u) ? v * 3600e3 : /^sek/.test(u) ? v * 1000 : v * 60e3;
    const d = new Date(base.getTime() + ms);
    return { time: J.pad(d.getHours()) + ':' + J.pad(d.getMinutes()), date: d.getFullYear() + '-' + J.pad(d.getMonth() + 1) + '-' + J.pad(d.getDate()), seconds: Math.round(ms / 1000) };
  },
  /* „5 minut”, „półtorej godziny”, „90 sekund”, „25 min” → sekundy albo null */
  duration(text) {
    const n = norm(text);
    for (const m of n.matchAll(/(poltorej|pol|kwadrans|\d+(?:[.,]\d+)?|[a-z]+)\s*(minut|minuty|minute|min\b|m\b|godzin|godziny|godzine|godz|h\b|sekund|sekundy|sek|s\b)/g)) {
      const v = m[1] === 'poltorej' ? 1.5 : m[1] === 'kwadrans' ? 15 : m[1] === 'pol' ? .5 : numIn(m[1]); if (v == null) continue;
      const u = m[2];
      const s = /^(godz|h)/.test(u) ? v * 3600 : /^(sek|s)/.test(u) ? v : v * 60;
      return Math.round(m[1] === 'pol' && /^godz|^h/.test(u) ? 1800 : s);
    }
    const k = numIn(n); return k != null && /\bminutnik|timer|odlicz/.test(n) ? k * 60 : null;
  },
  /* usuwa z tekstu znalezione wyrażenia czasu/daty, zostawia treść */
  strip(text) {
    return String(text)
      .replace(/\b(?:(?:o|na)\s+)?(\d{1,2})[:.](\d{2})\b/gi, ' ').replace(/\b(?:o|na)\s+(\d{1,2})\b(?!\s*(?:min|sek|godz))/gi, ' ')
      .replace(/\bo\s+(?:godzinie\s+)?(pierwszej|drugiej|trzeciej|czwartej|piątej|szóstej|siódmej|ósmej|dziewiątej|dziesiątej|jedenastej|dwunastej|trzynastej|czternastej|piętnastej|szesnastej|siedemnastej|osiemnastej|dziewiętnastej|dwudziestej)(\s+(trzydzieści|piętnaście))?/gi, ' ')
      .replace(/\b(jutro|pojutrze|dziś|dzisiaj|w południe|o północy)\b/gi, ' ').replace(/\b(?:w|we)\s+(poniedziałek|wtorek|środę|czwartek|piątek|sobotę|niedzielę)\b/gi, ' ')
      .replace(/\bza\s+(półtorej|pół|kwadrans|\d+(?:[.,]\d+)?|[a-ząęółśżźćń]+)\s*(minut|minuty|minutę|min|godzin|godziny|godzinę|h|sekund|sekundy|sek|dni|dzień|tydzień|tygodnie)?\b/gi, ' ')
      .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s,:;.\-–]+|[\s,:;.\-–]+$/g, '').trim();
  }
};

/* ---------- rejestr ---------- */
const cmds = new Map(), aliases = {};   // aliases[prop] = [[value, regex], …]
const TYPES = { string: v => String(v), number: v => { const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.')); return isNaN(n) ? undefined : n; }, integer: v => { const n = parseInt(v, 10); return isNaN(n) ? undefined : n; }, boolean: v => typeof v === 'boolean' ? v : /^(true|tak|1|on|wlacz|włącz|yes)$/i.test(String(v).trim()) ? true : /^(false|nie|0|off|wylacz|wyłącz|no)$/i.test(String(v).trim()) ? false : undefined, array: v => Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\n|;|,(?!\d)/).map(s => s.replace(/^[-•*\s]+/, '').trim()).filter(Boolean) : undefined, object: v => (v && typeof v === 'object') ? v : undefined };

const resolveEnum = (prop, key, val) => {
  if (prop.enum.includes(val)) return val;
  const n = norm(val);
  const exact = prop.enum.find(e => norm(e) === n); if (exact) return exact;
  for (const [value, re] of aliases[key] || []) if (re.test(n) && prop.enum.includes(value)) return value;
  const pre = prop.enum.filter(e => norm(e).startsWith(n) || n.startsWith(norm(e))); if (pre.length === 1) return pre[0];
  return undefined;
};
/* Typowe pomyłki modeli w nazwach pól (z prawdziwych rozmów: id→widget, theme→color, selector→target).
   Alias wypełnia pole TYLKO gdy brakuje prawdziwego, a sam alias nie jest polem tego polecenia. */
const SYN = { color: ['theme', 'colour', 'kolor', 'motyw', 'accent'], target: ['selector', 'element', 'el', 'id'], text: ['message', 'msg', 'body', 'content'], content: ['text', 'body', 'note_content'],
  query: ['q', 'search', 'term', 'phrase'], url: ['link', 'href', 'address', 'adres'], title: ['name', 'heading'], app: ['application', 'name', 'id', 'window'], expression: ['expr', 'formula', 'equation'],
  seconds: ['duration', 'secs', 'time_seconds'], fact: ['memory', 'text', 'content'], wallpaper: ['background', 'tapeta', 'name'], mode: ['layout_mode', 'arrangement'] };
const ENTITY_KEYS = ['id', 'name', 'title', 'target', 'value', 'item'];
const nk = k => String(k).toLowerCase().replace(/[_\-\s]/g, '');
const alias = (props, required, input) => {
  const keys = Object.keys(input), out = { ...input };
  for (const k of Object.keys(props)) {
    if (out[k] !== undefined) continue;
    const exact = keys.find(x => !(x in props) && [nk(k), nk(k) + 'id', nk(k) + 'name', nk(k) + 'title'].includes(nk(x)));   // Widget / widget_id / widgetId / noteTitle → widget, note
    const syn = exact || (SYN[k] || []).find(x => !(x in props) && out[x] !== undefined);
    if (syn !== undefined) out[k] = out[syn];
  }
  /* jedno brakujące wymagane pole „obiektu” (widget, note, task…) + jeden nieznany klucz typu id/name → to ten obiekt */
  const missing = required.filter(r => out[r] === undefined && props[r]?.type !== 'boolean');
  const strays = keys.filter(x => !(x in props) && ENTITY_KEYS.includes(x));
  if (missing.length === 1 && strays.length === 1) out[missing[0]] = out[strays[0]];
  return out;
};
const coerce = (cmd, input) => {
  const schema = cmd.args || { type: 'object', properties: {} }, props = schema.properties || {}, out = {};
  if (input == null) input = {};
  if (typeof input !== 'object') return fail('INVALID_ARGS', 'Argumenty muszą być obiektem JSON.');
  if (!Array.isArray(input)) input = alias(props, schema.required || [], input);
  for (const [k, p] of Object.entries(props)) {
    let v = input[k];
    if (v === undefined || v === null || v === '') continue;
    if (p.format === 'time') { const t = /^\d{1,2}:\d{2}$/.test(String(v)) ? J.pad(+String(v).split(':')[0]) + ':' + String(v).split(':')[1] : J.nlp.time(String(v)) || J.nlp.time('o ' + v); if (!t) return fail('INVALID_ARGS', `Pole „${k}”: oczekiwana godzina HH:MM, otrzymano „${v}”.`); out[k] = t; continue; }
    if (p.format === 'date') { const d = J.nlp.date(String(v)); if (!d) return fail('INVALID_ARGS', `Pole „${k}”: oczekiwana data YYYY-MM-DD albo „jutro”, otrzymano „${v}”.`); out[k] = d; continue; }
    const conv = TYPES[p.type || 'string']; const c = conv ? conv(v) : v;
    if (c === undefined) return fail('INVALID_ARGS', `Pole „${k}”: oczekiwany typ ${p.type}, otrzymano „${typeof v === 'object' ? JSON.stringify(v) : v}”.`);
    if (p.enum) { const e = resolveEnum(p, k, String(c)); if (e === undefined) return fail('INVALID_ARGS', `Pole „${k}”: dozwolone wartości: ${p.enum.join(', ')}.`); out[k] = e; continue; }
    if (p.type === 'number' || p.type === 'integer') { if (p.minimum != null && c < p.minimum) return fail('INVALID_ARGS', `Pole „${k}” ≥ ${p.minimum}.`); if (p.maximum != null && c > p.maximum) return fail('INVALID_ARGS', `Pole „${k}” ≤ ${p.maximum}.`); }
    if (p.maxLength && typeof c === 'string' && c.length > p.maxLength) { out[k] = c.slice(0, p.maxLength); continue; }
    out[k] = c;
  }
  for (const r of schema.required || []) if (out[r] === undefined) return fail('INVALID_ARGS', `Brak wymaganego pola „${r}”${props[r]?.description ? ' (' + props[r].description + ')' : ''}.`);
  return { ok: true, args: out };
};

/* szablon przykładu → wyrażenie regularne. „{x}” = argument, „[słowo słowo]” = opcjonalne, „(a|b)” = alternatywa */
const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const tokenize = tpl => { const out = []; let i = 0; const t = norm(tpl); while (i < t.length) { const c = t[i]; if (c === ' ') { i++; continue; } if (c === '[' || c === '(') { const close = c === '[' ? ']' : ')'; const j = t.indexOf(close, i); if (j < 0) { out.push({ k: 'lit', v: t.slice(i) }); break; } out.push({ k: c === '[' ? 'opt' : 'alt', v: t.slice(i + 1, j) }); i = j + 1; continue; } if (c === '{') { const j = t.indexOf('}', i); out.push({ k: 'arg', v: t.slice(i + 1, j) }); i = j + 1; continue; } let j = i; while (j < t.length && !' [({'.includes(t[j])) j++; out.push({ k: 'lit', v: t.slice(i, j) }); i = j; } return out; };
const compile = (tpl) => {
  const names = [], toks = tokenize(tpl);
  const argIdx = toks.map((x, i) => x.k === 'arg' ? i : -1).filter(i => i >= 0), lastArg = argIdx[argIdx.length - 1] === toks.length - 1 ? toks.length - 1 : -1;
  const lead = toks[0]?.k === 'lit' ? toks[0].v : toks[0]?.k === 'alt' ? toks[0].v.split('|')[0].trim() : '';
  let re = '', weight = 0, first = true;
  toks.forEach((tk, i) => {
    const sep = first ? '' : '\\s+';
    if (tk.k === 'arg') { names.push(tk.v); re += sep + (i === lastArg ? '(.+)' : '(.+?)'); first = false; }
    else if (tk.k === 'alt') { const alts = tk.v.split('|').map(a => esc(a.trim()).replace(/\s+/g, '\\s+')); re += sep + '(?:' + alts.join('|') + ')'; weight += Math.min(...alts.map(a => a.length)); first = false; }
    else if (tk.k === 'opt') { const w = esc(tk.v.trim()).replace(/\s+/g, '\\s+'); re += first ? '(?:' + w + '\\s+)?' : '(?:\\s+' + w + ')?'; }
    else if (/^[:;,]$/.test(tk.v)) { re += '\\s*' + esc(tk.v) + '\\s*'; first = true; }   // interpunkcja: bez wymaganych spacji wokół
    else { re += sep + esc(tk.v).replace(/\s+/g, '\\s+') + '[:,]?'; weight += tk.v.length; first = false; }
  });
  return { re: new RegExp('^' + re + '$'), names, weight, lead };
};

const CHAT_FLAG = 'user_confirmed_in_chat';
const CHAT_NEVER = new Set(['settings_reset', 'chat_clear']);   // cofalne, ale zbyt rozległe, by zatwierdzać je jednym „tak” z telefonu
/* użytkownik faktycznie przy karcie: widoczna, z fokusem I niedawna aktywność (mysz/klawisz) — sam fokus kłamie,
   np. okno przeglądarki zostaje na pierwszym planie, gdy użytkownik pisze z telefonu */
const userAtScreen = () => typeof document === 'undefined' || (document.visibilityState !== 'hidden' && (typeof document.hasFocus !== 'function' || document.hasFocus()) && (!J.userActive || J.userActive()));

const api = J.registry = {
  ok, fail, norm,
  alias(prop, value, re) { (aliases[prop] = aliases[prop] || []).push([value, re]); },
  aliases,
  add(cmd) {
    if (!cmd || !cmd.id || typeof cmd.run !== 'function') throw new Error('registry.add: wymagane id i run');
    const c = Object.assign({ group: 'Inne', risk: 'safe', idempotent: false, reads: [], writes: [], examples: [], hermes: true, palette: true, voice: true, args: { type: 'object', properties: {} } }, cmd);
    c.args.type = 'object'; c.args.properties = c.args.properties || {};
    c.compiled = (c.examples || []).map(compile);
    cmds.set(c.id, c);
    return c;
  },
  get: id => cmds.get(id),
  has: id => cmds.has(id),
  list: (f) => [...cmds.values()].filter(c => !f || f(c)),
  groups() { const g = {}; cmds.forEach(c => { (g[c.group] = g[c.group] || []).push(c); }); return g; },
  /* definicje funkcji dla modelu (format OpenAI / Hermes) */
  tools(opts = {}) {
    return api.list(c => c.hermes !== false && (!opts.filter || opts.filter(c))).map(c => {
      const chat = api.chatConfirmable(c);
      const parameters = chat ? { ...c.args, properties: { ...(c.args.properties || {}), [CHAT_FLAG]: { type: 'boolean', description: 'true WYŁĄCZNIE gdy użytkownik w tej rozmowie wyraźnie zgodził się na dokładnie to działanie (np. odpowiedź „tak” na clarify). Użyj po kodzie NEEDS_CONFIRMATION.' } } } : c.args;
      return { type: 'function', function: { name: c.id, description: c.description + (c.risk === 'confirm' ? (chat ? ' Wymaga potwierdzenia użytkownika — na pulpicie albo w rozmowie (' + CHAT_FLAG + ').' : ' Wymaga potwierdzenia użytkownika na pulpicie.') : '') + (c.examples.length ? ' Np.: „' + c.examples[0].replace(/[{}[\]]/g, '') + '”.' : ''), parameters } };
    });
  },
  /* zgoda z rozmowy (Telegram/API przez Hermesa): tylko działania z „Cofnij” — nieodwracalne i wrażliwe (computer_use, files_write,
     clipboard_read, open_url, terminal_run, notes_empty_trash…) zostają przy jawnej zgodzie na ekranie */
  chatConfirmable: c => !!c && c.risk === 'confirm' && c.undoable === true && !CHAT_NEVER.has(c.id),
  coerce: (id, input) => { const c = cmds.get(id); return c ? coerce(c, input) : fail('NOT_FOUND', 'Nieznane narzędzie: ' + id); },
  /* opis możliwości z rejestru (do „co potrafisz” i README) */
  describe(lang = 'pl') {
    const g = api.groups();
    return Object.entries(g).map(([name, list]) => '**' + name + '**: ' + list.filter(c => c.voice !== false).map(c => c.label).join(', ')).join('\n');
  },
  /* zawsze zezwalaj (zapisane) */
  allowed(id) { return (J.state.ui.allowAlways || []).includes(id); },
  allowAlways(id, on = true) { const l = new Set(J.state.ui.allowAlways || []); on ? l.add(id) : l.delete(id); J.state.ui.allowAlways = [...l]; J.save(); },

  /* ---------- wykonanie z walidacją, koercją i uprawnieniami ---------- */
  async run(id, input, ctx = {}) {
    const c = cmds.get(id); if (!c) return fail('NOT_FOUND', 'Nieznane narzędzie: ' + id + '. Dostępne: ' + [...cmds.keys()].slice(0, 12).join(', ') + '…');
    let chatOk = false;
    if (input && typeof input === 'object' && CHAT_FLAG in input) { chatOk = input[CHAT_FLAG] === true; input = { ...input }; delete input[CHAT_FLAG]; }   // flaga nie należy do argumentów polecenia
    const v = coerce(c, input); if (!v.ok) return v;
    const args = v.args;
    if (c.risk === 'blocked' && ctx.source !== 'ui') return fail('DENIED', 'To działanie jest dostępne tylko ręcznie w interfejsie.');
    /* zaufane: klik w interfejsie, polecenie wpisane ręcznie i zgodne z parserem ('local') albo już potwierdzone.
       'voice' (mowę łatwo źle usłyszeć), 'jev' (decyzja samego Jeva), 'hermes' i sygnały NIE są zaufane. */
    const trusted = ctx.source === 'ui' || ctx.source === 'local' || ctx.confirmed === true;
    const pre = typeof c.prepare === 'function' ? (c.prepare(args) || {}) : {};
    const dynRisk = c.risk === 'safe' && c.writes.length && !trusted && ctx.judge && ctx.judge.destructive >= (J.judge?.thresholds().destructive ?? .8);   // Jev ocenił wypowiedź jako destrukcyjną
    /* forceConfirm (strażnik D9, wykryta wstrzyknięta treść): pytamy zawsze, także gdy narzędzie ma „Zawsze zezwalaj” */
    const forced = !!ctx.forceConfirm && ctx.source !== 'ui' && ctx.confirmed !== true;
    /* precheck: obiekt istnieje i jest jednoznaczny ZANIM zapytamy o zgodę — wcześniej padało pytanie
       „Usunąć widget «coś, czego nie ma»?”, a NOT_FOUND przychodził dopiero po kliknięciu */
    if (typeof c.precheck === 'function' && c.risk === 'confirm' && !trusted) { const e = await c.precheck(args); if (e && e.ok === false) return e; }
    if (forced || ((c.risk === 'confirm' || dynRisk) && !trusted && (ctx.source === 'routine' || !api.allowed(id)) && !pre.trusted)) {   // rutyna: „zawsze zezwalaj” z czatu nie obowiązuje (11-agent.md §4)
      /* Zgoda z rozmowy (Hermes z Telegrama): tylko działania z „Cofnij”, nigdy przy wykrytej manipulacji (forced).
         Użytkownik nie przy ekranie → od razu NEEDS_CONFIRMATION (zamiast 60 s czekania na okno, którego nikt nie widzi). */
      const viaChat = ctx.source === 'hermes' && !forced && !dynRisk && api.chatConfirmable(c);
      const askInChat = () => fail('NEEDS_CONFIRMATION', 'Użytkownika nie ma przy pulpicie, więc okno zgody nic nie da. Zapytaj go w rozmowie (np. clarify) o dokładnie to działanie: „' + (typeof c.confirmText === 'function' ? c.confirmText(args) : c.label) + '”. Po wyraźnym „tak” wywołaj ' + id + ' ponownie z tymi samymi argumentami i ' + CHAT_FLAG + '=true. Działanie da się cofnąć.');
      if (viaChat && chatOk) {
        J.notice?.({ title: 'Wykonano na podstawie zgody z rozmowy', body: c.label + (Object.keys(args).length ? ': ' + Object.values(args).filter(x => typeof x !== 'object').join(', ').slice(0, 80) : '') + ' — można cofnąć („cofnij”).', kind: 'agent' });
        J.ev?.emit('approval.resolved', { answer: 'chat', tool: id });
      } else if (viaChat && ctx.bridge && !userAtScreen()) {
        return askInChat();
      } else {
      if (!J.confirm) return fail('DENIED', 'Brak możliwości potwierdzenia.');
      const q = forced ? String(ctx.forceConfirm) : typeof c.confirmText === 'function' ? c.confirmText(args) : (c.confirmText || ('Wykonać: ' + c.label + '?')) + (dynRisk ? ' (Jev: działanie może być nieodwracalne)' : '');
      const dec = await J.confirm({ id, label: c.label, args, question: q, source: ctx.source, forced });
      if (dec === 'always' && !forced) api.allowAlways(id);
      else if (dec === 'timeout' && viaChat && ctx.bridge) return askInChat();   // okno było, nikt nie kliknął — użytkownik odszedł; zapytaj w rozmowie zamiast odmawiać
      else if (dec !== 'yes' && dec !== 'always') return fail('DENIED', dec === 'timeout' ? 'Brak odpowiedzi użytkownika — nie wykonano.' + (viaChat ? ' Jeśli rozmawiasz z nim zdalnie: zapytaj w rozmowie i wywołaj ponownie z ' + CHAT_FLAG + '=true.' : '') : 'Użytkownik odmówił.');
      ctx = { ...ctx, approved: true };   // użytkownik zatwierdził w oknie zgody (osobny znacznik: „confirmed” znaczy „zatwierdzone ZANIM rejestr zapytał” — agents.js na tym polega)
      }
    }
    /* proaktywność (docs/spec/11-agent.md §6): Jarvis sam z siebie (źródło „signal”) niczego nie zmienia ani nie przełącza okien —
       tylko proponuje; kliknięcie propozycji = polecenie użytkownika (źródło „ui”) */
    if (ctx.source === 'signal' && c.writes.length) {
      J.notice?.({ title: 'Propozycja Jarvisa', body: c.label + (Object.keys(args).length ? ': ' + Object.values(args).filter(v => typeof v !== 'object').join(', ').slice(0, 80) : ''), kind: 'agent', actions: [{ label: 'Zrób to', cmd: id, args }] });
      return ok({ proposed: true, id, args }, 'Zaproponowałem użytkownikowi: ' + c.label + ' (sam z siebie nie zmieniam niczego).');
    }
    if (ctx.signal?.aborted) return fail('TIMEOUT', 'Przerwano.');
    if (J.state.settings.offlineMode && (c.reads || []).includes('internet')) return fail('OFFLINE', 'Tryb bez sieci jest włączony — „' + c.label + '” potrzebuje internetu.');
    try {
      const r = await c.run(args, { ok, fail, ctx, cmd: c });
      J.action(id);
      const env = r == null ? ok(null, 'Gotowe.') : typeof r === 'string' ? ok(null, r) : typeof r.ok !== 'boolean' ? ok(r, 'Gotowe.') : r;
      if (env.ok && typeof env.undo === 'function') env.undoEntry = J.undo?.push({ id, label: c.label, text: env.text, undo: env.undo, changed: typeof env.undo.changed === 'function' ? env.undo.changed : undefined, source: ctx.source }) || null;
      if (env.undoEntry) Object.defineProperty(env, 'undoEntry', { enumerable: false });
      if (env.ok && env.ui?.highlight && ctx.source !== 'ui' && ctx.source !== 'local') J.emit('agent-ui', env.ui.highlight);   // efekt „ducha” okna (fx cinema)
      return env;
    } catch (e) {
      if (e?.name === 'AbortError') return fail('TIMEOUT', 'Przerwano.');
      if (J.state.settings.offlineMode && e instanceof TypeError) return fail('OFFLINE', 'Tryb bez sieci jest włączony — ta czynność potrzebuje internetu.');
      if (typeof navigator !== 'undefined' && navigator.onLine === false && (e instanceof TypeError || /fetch|network|sieć|połącz/i.test(e?.message || ''))) return fail('OFFLINE', 'Brak internetu — spróbuj, gdy połączenie wróci.');
      if (e?.status === 429) return fail('RATE_LIMITED', 'Usługa jest przeciążona — spróbuj za chwilę.');
      if (e?.code) return fail(e.code, e.message);
      return fail('INTERNAL', 'Błąd: ' + (e?.message || e));
    }
  },

  /* ---------- silnik lokalny: dopasowanie wypowiedzi do poleceń ---------- */
  match(text, opts = {}) {
    const raw = String(text || '').trim(), n = norm(raw).replace(/[?!.]+$/, '');
    const out = [];
    for (const c of cmds.values()) {
      if (c.voice === false) continue;
      if (typeof c.parse === 'function') { try { const a = c.parse(raw, n); if (a) out.push({ id: c.id, args: a.args || a, score: 100 + (a.score || 0), cmd: c }); } catch (e) { } }
      for (const p of c.compiled) {
        const m = p.re.exec(n); if (!m) continue;
        if (c.accept && !c.accept(m.slice(1), n)) continue;   // polecenie samo odrzuca dopasowanie (np. speak: „powiedz, co zrobiłeś” to prośba o raport)
        const args = {}; let bad = false;
        const rawCut = raw.replace(/[?!.]+$/, '');   // n powstało z norm(raw) bez końcowej interpunkcji
        p.names.forEach((nm, i) => { const g = m[i + 1]; if (g == null) return; const idx = n.indexOf(g); args[nm] = (idx >= 0 && rawCut.length === n.length) ? rawCut.slice(idx, idx + g.length).trim() : g;   // offsety raw↔norm tylko przy równej długości (wzorzec z agents.js) — normalizacja usuwa np. cudzysłowy i przesuwała wycinek
          const prop = c.args.properties[nm]; if (prop?.enum && (g.split(' ').length > 3 || /\s(i|potem|oraz|nastepnie)\s/.test(' ' + g + ' ') || resolveEnum(prop, nm, g) === undefined)) bad = true; });
        if (bad) continue;   // wartość z listy dozwolonych nie może być zdaniem — to raczej łańcuch poleceń
        const leadHit = p.lead && p.names.length && new RegExp('^' + p.lead.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(n);   // zdanie zaczyna się od czasownika szablonu → to on decyduje (np. „zanotuj: sprawdź pogodę”)
        out.push({ id: c.id, args, score: 50 + p.weight + (p.names.length ? 0 : 20) + (leadHit ? 60 : 0), cmd: c, tpl: true });
      }
    }
    out.sort((a, b) => b.score - a.score);
    // to samo polecenie z parse() i z szablonu: parse zna argumenty lepiej, ale wynik dziedziczy wyższy score
    const byId = new Map();
    for (const o of out) { const prev = byId.get(o.id); if (!prev) { byId.set(o.id, o); continue; } if (prev.tpl && !o.tpl) { o.score = Math.max(o.score, prev.score); byId.set(o.id, o); } else prev.score = Math.max(prev.score, o.score); }
    const uniq = [...byId.values()].sort((a, b) => b.score - a.score);
    return opts.all ? uniq : uniq.slice(0, 5);
  },
  /* czy dopasowanie obejmuje CAŁE zdanie? Zdanie z „i / potem / oraz / przecinkiem”, którego dalsze części nie siedzą w argumentach
     polecenia (np. „otwórz youtube i puść X” → open_url bez „puść X”), jest częściowe: wykonanie go zrobiłoby pół zadania.
     „zanotuj mleko i chleb” jest pełne — „chleb” jest w treści notatki. Polecenia spansConj obejmują zdanie z definicji. */
  uncovered(text, m) {
    if (!m || m.cmd?.spansConj) return [];
    const parts = String(text).split(/\s+(?:i potem|a potem|a nastepnie|a następnie|nastepnie|następnie|potem|oraz|i|a)\s+|\s*[;,]\s*/i).map(s => norm(s).replace(/[?!.]+$/, '').trim()).filter(Boolean);
    if (parts.length < 2) return [];
    const kept = [parts[0], ...dropReports(parts.slice(1))];
    if (kept.length < 2) return [];
    const inArgs = norm(Object.values(m.args || {}).flatMap(v => Array.isArray(v) ? v : [v]).filter(v => typeof v === 'string' || typeof v === 'number').join(' '));   // argumenty-listy (items) też się liczą — „chleb, jajka” z listy zakupów nie są „niepokrytą” częścią zdania
    const words = p => p.split(/\s+/).filter(w => w.length > 2);
    /* część zaczynająca się od czasownika w trybie rozkazującym to OSOBNA czynność, nawet gdy trafiła do tekstu notatki czy etykiety
       („zanotuj coś i wyślij to szefowi” — „wyślij” to drugie polecenie, nie treść notatki) */
    return kept.slice(1).filter(p => { const w = words(p); return IMPERATIVE.test(p) || (w.length && w.some(x => !inArgs.includes(x))); });
  },
  /* łańcuch: „otwórz notatnik i ustaw minutnik 5 minut” → [dopasowania] albo null */
  chain(text) {
    const all = String(text).split(/\s+(?:i potem|a potem|a nastepnie|a następnie|nastepnie|następnie|potem|oraz|i)\s+|\s*;\s*/i).map(s => s.trim().replace(/[,;]+$/, '').trim()).filter(Boolean);
    if (all.length < 2) return null;
    const parts = dropReports(all);
    if (!parts.length || (parts.length < 2 && parts.length === all.length)) return null;   // jedna czynność + prośba o raport = też łańcuch (jednoelementowy)
    const res = parts.map(p => api.match(p)[0]);
    return res.every(Boolean) ? res : null;
  }
};
})();
