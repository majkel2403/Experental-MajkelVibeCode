/* =========================================================
   JARVIS OS — wyszukiwanie wszędzie (docs/spec/03-nawigacja.md §6)
   Jedno zapytanie → notatki, zadania, widgety, skróty, pamięć, rozmowy, ustawienia, polecenia, pliki.
   Dopasowanie bez polskich znaków i wielkości liter: dokładne > początek słowa > fragment > literówka (1 znak, słowa ≥ 5 liter).
   Lokalne — nic nie idzie do Jeva ani Hermesa.
   ========================================================= */
'use strict';
(() => {
const norm = s => J.norm(String(s || ''));
/* odległość edycyjna ograniczona do 1 (szybko) */
const within1 = (a, b) => {
  if (a === b) return true; const la = a.length, lb = b.length; if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while (i < la && j < lb) { if (a[i] === b[j]) { i++; j++; continue; } if (++diff > 1) return false; if (la > lb) i++; else if (lb > la) j++; else { i++; j++; } }
  return diff + (la - i) + (lb - j) <= 1;
};
/* wynik dopasowania 0–100 */
const score = (q, text) => {
  const t = norm(text); if (!q || !t) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 90;
  const words = t.split(/[\s.,;:!?()\-–/]+/).filter(Boolean);
  if (words.some(w => w.startsWith(q))) return 80;
  const i = t.indexOf(q); if (i >= 0) return 70 - Math.min(20, i / 10);
  const qw = q.split(' ').filter(Boolean);
  if (qw.length > 1 && qw.every(x => t.includes(x))) return 60;
  if (qw.every(x => x.length >= 5 ? words.some(w => within1(x, w) || (w.length > x.length && within1(x, w.slice(0, x.length)))) : t.includes(x))) return 45;
  return 0;
};

/* spis sekcji ustawień do wyszukiwania (etykiety i słowa kluczowe) */
const SETTINGS = [
  ['openrouter', 'Klucz OpenRouter', 'klucz api openrouter mozg sedzia'], ['akcent', 'Kolor akcentu', 'kolor motyw akcent'], ['tapeta', 'Tapeta', 'tapeta tlo wallpaper'],
  ['interfejs', 'Interfejs', 'dzwieki czasteczki animacje skala efekty'], ['glos', 'Głos', 'glos mowa syntezator mikrofon tempo'], ['uzytkownik', 'Użytkownik', 'inicjaly miasto lokalizacja jednostki'],
  ['hermes', 'Hermes (mózg)', 'hermes model adres serwer mozg'], ['agent', 'Agent i proaktywność', 'proaktywnosc briefing podsumowanie cisza nocna rutyny zawsze dozwolone'],
  ['jev', 'Sędzia Jev', 'jev sedzia prywatnosc autonomia progi budzet tryb cienia dziennik'], ['powiadomienia', 'Powiadomienia', 'powiadomienia kanaly dzwiek limit'],
  ['skroty', 'Skróty klawiszowe', 'skroty klawiszowe klawisze'], ['uklady', 'Układy okien', 'uklady okien uklad startowy'], ['pamiec', 'Pamięć Jarvisa', 'pamiec fakty co o mnie wiesz'],
  ['pliki', 'Folder roboczy', 'pliki folder dostep'], ['dane', 'Dane', 'eksport import kopia reset dane'], ['oprogramie', 'O programie', 'wersja diagnostyka testy samouczek eksperymenty flagi']
];

const TYPES = ['commands', 'apps', 'notes', 'tasks', 'widgets', 'shortcuts', 'memory', 'chat', 'settings', 'files'];
J.search = {
  TYPES, SETTINGS, score,
  /* synchroniczne źródła (lokalny stan) */
  sync(q, types) {
    const want = t => !types || types.includes(t), out = [];
    const push = (type, id, title, sub, s, open) => { if (s > 0) out.push({ type, id, title, sub: sub || '', score: s, open }); };
    if (want('apps')) Object.entries(J.apps).filter(([, a]) => !a.widget).forEach(([id, a]) => push('apps', id, a.title, 'aplikacja', Math.max(score(q, a.title), score(q, id) * .9), { cmd: 'open_app', args: { app: id } }));
    if (want('notes')) J.state.notes.filter(n => !n.deleted).forEach(n => { const st = score(q, n.title), sb = score(q, n.body) * .7, stag = (n.tags || []).some(t => norm(t) === q.replace(/^#/, '')) ? 85 : 0; push('notes', n.id, n.title || 'Bez tytułu', (n.folder ? '📁 ' + n.folder + ' · ' : '') + J.cmdKit.cut(n.body.replace(/\s+/g, ' '), 80), Math.max(st, sb, stag), { cmd: 'app_view', args: { app: 'notes', view: 'note', target: n.id } }); });
    if (want('tasks')) J.state.tasks.forEach(t => push('tasks', t.id, t.text, t.date + (t.time ? ' ' + t.time : '') + (t.done ? ' ✓' : ''), score(q, t.text), { cmd: 'app_view', args: { app: 'schedule', view: 'day', target: t.date } }));
    if (want('widgets')) J.widgets.list.forEach(w => push('widgets', w.id, w.title, 'widget', score(q, w.title), { cmd: 'wm_focus_widget', id: 'w:' + w.id }));
    if (want('shortcuts')) J.state.shortcuts.forEach(s => push('shortcuts', s.id, s.name, s.url || (s.app ? J.APP_NAMES[s.app] : ''), Math.max(score(q, s.name), score(q, s.url || '') * .6), { cmd: 'shortcut_run', id: s.id }));
    if (want('settings')) SETTINGS.forEach(([sec, label, kw]) => push('settings', sec, label, 'ustawienia', Math.max(score(q, label), score(q, kw) * .8), { cmd: 'app_view', args: { app: 'settings', view: 'section', target: sec } }));
    if (want('commands')) J.registry.list(c => c.palette !== false).forEach(c => push('commands', c.id, c.label, c.group, Math.max(score(q, c.label), score(q, c.description) * .5, ...(c.examples || []).slice(0, 3).map(e => score(q, e.replace(/[{}[\]()|]/g, ' ')) * .7)), { cmd: c.id, args: {} }));
    return out;
  },
  /* pełne wyszukiwanie (z pamięcią i historią rozmów — asynchronicznie) */
  async query(text, opts = {}) {
    const q = norm(text).trim(); if (!q) return [];
    const types = opts.types && opts.types.length ? opts.types : null, want = t => !types || types.includes(t);
    const out = J.search.sync(q, types);
    if (want('memory')) { try { (await J.memory.all()).forEach(f => { const s = score(q, f.fact); if (s) out.push({ type: 'memory', id: f.id, title: f.fact, sub: 'pamięć · ' + (f.scope || ''), score: s, open: { cmd: 'app_view', args: { app: 'settings', view: 'section', target: 'pamiec' } } }); }); } catch (e) { } }
    if (want('chat')) { try { const items = await J.chat.searchAll(q); items.forEach(it => out.push({ type: 'chat', id: it.id, title: J.cmdKit.cut(it.text, 90), sub: (it.role === 'user' ? 'Ty' : 'Jarvis') + ' · ' + it.thread, score: it.score, open: { cmd: 'chat_goto', thread: it.threadId, index: it.index } })); } catch (e) { } }
    if (want('files') && J.files?.handle) { try { (await J.files.list()).forEach(f => { const s = score(q, f.name); if (s) out.push({ type: 'files', id: f.name, title: f.name, sub: 'plik', score: s, open: { cmd: 'files_read', args: { name: f.name } } }); }); } catch (e) { } }
    /* ostatnio używane wyżej */
    const recent = (J.state.ui.recentViews || []).map(r => r.target || r.app);
    out.forEach(o => { if (recent.includes(o.id)) o.score += 5; });
    out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
    return out.slice(0, J.clamp(opts.limit || 50, 1, 50));
  },
  /* otwarcie wyniku (paleta, polecenie) */
  async open(hit) {
    const o = hit?.open; if (!o) return null;
    if (o.cmd === 'wm_focus_widget') { J.wm.open(o.id); return { ok: true }; }
    if (o.cmd === 'shortcut_run') { const s = J.state.shortcuts.find(x => x.id === o.id); if (s) J.shortcuts.run(s); return { ok: !!s }; }
    if (o.cmd === 'chat_goto') { J.chat.goto?.(o.thread, o.index); return { ok: true }; }
    return J.registry.run(o.cmd, o.args || {}, { source: 'ui' });
  }
};
})();
