/* =========================================================
   JARVIS OS — polecenia (Command Registry): wszystko, co da się kliknąć,
   da się powiedzieć i zlecić Hermesowi. Jeden wpis = narzędzie modelu,
   wzorce silnika lokalnego, pozycja palety, opis możliwości.
   ========================================================= */
'use strict';
(() => {
const R = J.registry, { ok, fail } = R, norm = J.norm;
const APP_IDS = ['chat', 'notes', 'market', 'schedule', 'monitor', 'terminal', 'weather', 'calc', 'timer', 'settings', 'library', 'files'];
const APP_NAMES = { chat: 'Czat', notes: 'Notatnik', market: 'Monitor rynku', schedule: 'Harmonogram', monitor: 'Monitor systemu', terminal: 'Terminal', weather: 'Pogoda', calc: 'Kalkulator', timer: 'Minutnik', settings: 'Ustawienia', library: 'Biblioteka aplikacji', files: 'Pliki' };
[['chat', /\b(czat|chat|rozmow)/], ['notes', /\b(notatnik|notatk|notes)/], ['market', /\b(rynek|rynku|token|krypto|kurs|gield|market|monitor rynku)/],
  ['schedule', /\b(harmonogram|kalendarz|zadani|plan dnia|agend|przypomnien)/], ['monitor', /\b(monitor system|monitor|system|statystyk|wydajnos|telemetri)/],
  ['terminal', /\b(terminal|konsol|shell)/], ['weather', /\b(pogod)/], ['calc', /\b(kalkulator|liczydl)/], ['timer', /\b(minutnik|stoper|timer|odliczani)/],
  ['settings', /\b(ustawieni|opcje|konfiguracj|preferencj)/], ['library', /\b(bibliotek|aplikacj|menu|programy)/], ['files', /\b(eksplorator|menedzer plikow|przegladark\w* plikow|aplikacj\w* pliki|okno plikow)/]].forEach(([id, re]) => R.alias('app', id, re));
const SITES = { youtube: 'https://youtube.com', google: 'https://google.com', github: 'https://github.com', gmail: 'https://mail.google.com', spotify: 'https://open.spotify.com', netflix: 'https://netflix.com', facebook: 'https://facebook.com', twitter: 'https://x.com', wikipedia: 'https://pl.wikipedia.org', mapy: 'https://maps.google.com', linkedin: 'https://linkedin.com', reddit: 'https://reddit.com', allegro: 'https://allegro.pl', nous: 'https://nousresearch.com', hermes: 'https://hermes-agent.nousresearch.com', chatgpt: 'https://chatgpt.com', wp: 'https://wp.pl', onet: 'https://onet.pl' };
const TRUSTED = new Set(Object.values(SITES).map(u => new URL(u).hostname).concat(['www.google.com', 'duckduckgo.com', 'pl.wikipedia.org', 'en.wikipedia.org', 'github.com', 'open-meteo.com']));
[['cyjan', /cyjan|turkus/], ['niebieski', /niebiesk/], ['fiolet', /fiolet|purpur/], ['zielony', /zielon/], ['złoty', /zlot|pomarancz/], ['czerwony', /czerwon/], ['różowy', /rozow/], ['jarvis', /jarvis|domysl/]].forEach(([id, re]) => R.alias('color', id, re));
[['aurora', /aurora|zorz/], ['void', /pust|czarn|void|ciemn/], ['photo', /miast|zdjec|photo|jezior|gor/]].forEach(([id, re]) => R.alias('wallpaper', id, re));
const findApp = t => { const n = norm(t); for (const [id, re] of R.aliases.app) if (re.test(n)) return id; return null; };
/* rodzaj gramatyczny nazw aplikacji (komunikaty: „Notatnik nie jest otwarty”, „Pogoda nie jest otwarta”, „Ustawienia nie są otwarte”) */
const APP_GENDER = { chat: 'm', notes: 'm', market: 'm', schedule: 'm', monitor: 'm', terminal: 'm', weather: 'f', calc: 'm', timer: 'm', settings: 'pl', library: 'f', files: 'pl' };
const winName = id => APP_NAMES[id] || J.apps[id]?.title || id;
const notOpen = id => winName(id) + ({ f: ' nie jest otwarta', pl: ' nie są otwarte', n: ' nie jest otwarte' }[APP_GENDER[id]] || ' nie jest otwarty') + '.';
/* okno po nazwie: id aplikacji, „current”/„to”, „w:<id>”, tytuł widgetu albo nazwa potoczna */
const resolveWin = q => {
  const v = String(q || '').trim(); if (!v) return J.wm.focused();
  if (J.apps[v] && (APP_IDS.includes(v) || v.startsWith('w:'))) return v;
  const n = norm(v); if (/^(current|to|ten|te|ta|tego|biezace|aktualne|aktywne)( okno)?$/.test(n)) return J.wm.focused();
  const w = J.widgets?.list.find(x => x.id === v || norm(x.title) === n) || J.widgets?.list.find(x => norm(x.title).includes(n)); if (w && (/widget/.test(n) || !findApp(v))) return 'w:' + w.id;
  return findApp(v) || (w ? 'w:' + w.id : null);
};
/* „Cofnij” dla układania okien: migawka wszystkich pozycji sprzed zmiany */
const layoutUndo = () => { const snap = J.wm.snapshot(); return () => J.wm.applySnapshot(snap); };
const cut = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

/* ---------- wyszukiwanie obiektów po id / tytule (z wykrywaniem dwuznaczności) ---------- */
/* dwuznaczność: Jev (jeśli włączony) wybiera kandydata z wysoką pewnością; inaczej AMBIGUOUS → model/użytkownik pyta */
const disambiguate = async (question, cands, label) => {
  if (!J.judge?.enabled() || cands.length < 2) return null;
  const r = await J.judge.pick(question, cands.map(c => ({ id: c.id, label: label(c) })), J.brain?.currentText || '');
  return r && r.confidence >= J.judge.thresholds().execute ? cands.find(c => c.id === r.id) || null : null;
};
const findNote = async q => {
  if (!q || !norm(q)) return { err: fail('INVALID_ARGS', 'Podaj tytuł lub id notatki.') };   // same spacje/znaki: norm() = '' pasowało do każdej notatki
  const notes = J.notes.live(), n = norm(q);
  let hit = notes.find(x => x.id === q); if (hit) return { note: hit };
  const byTitle = notes.filter(x => norm(x.title) === n); if (byTitle.length === 1) return { note: byTitle[0] };
  const inc = notes.filter(x => norm(x.title).includes(n) || n.includes(norm(x.title)) && x.title);
  if (inc.length === 1) return { note: inc[0] };
  if (inc.length > 1) { const j = await disambiguate('Which note does the user mean?', inc.slice(0, 8), x => x.title); if (j) return { note: j }; return { err: fail('AMBIGUOUS', 'Kilka notatek pasuje: ' + inc.slice(0, 5).map(x => '„' + x.title + '” (' + x.id + ')').join(', ') + '. Podaj id.', { candidates: inc.slice(0, 5).map(x => ({ id: x.id, title: x.title })) }) }; }
  const body = notes.filter(x => norm(x.body).includes(n));
  if (body.length === 1) return { note: body[0] };
  const may = nearest(notes, q, x => x.title);
  return { err: fail('NOT_FOUND', 'Nie znalazłem notatki „' + q + '”.' + (may.length ? ' Może: ' + may.map(x => '„' + x.title + '”').join(', ') + '?' : ' Dostępne: ' + (notes.slice(0, 8).map(x => '„' + x.title + '”').join(', ') || 'brak') + '.')) };
};
/* podpowiedź najbliższych nazw przy NOT_FOUND (docs/spec/13-bledy.md §1): literówki i fragmenty słów */
const nearest = (list, q, label, k = 3) => { const sc = J.search?.score; if (!sc) return []; const n = norm(q); return list.map(x => [x, Math.max(sc(n, label(x)), ...n.split(' ').filter(w => w.length >= 4).map(w => sc(w, label(x)) * .8))]).filter(([, v]) => v >= 40).sort((a, b) => b[1] - a[1]).slice(0, k).map(([x]) => x); };
const findTask = async q => {
  if (!q || !norm(q)) return { err: fail('INVALID_ARGS', 'Podaj treść lub id zadania.') };
  const tasks = J.state.tasks, n = norm(q);
  let hit = tasks.find(x => x.id === q); if (hit) return { task: hit };
  const today = tasks.filter(t => t.date === J.today());
  const pool = [...today, ...tasks.filter(t => t.date !== J.today())];
  const inc = pool.filter(x => norm(x.text).includes(n) || n.includes(norm(x.text)));
  if (inc.length === 1) return { task: inc[0] };
  if (inc.length > 1) { const open = inc.filter(t => !t.done); if (open.length === 1) return { task: open[0] }; const j = await disambiguate('Which task does the user mean?', inc.slice(0, 8), t => (t.time || '--:--') + ' ' + t.text + ' (' + t.date + ')'); if (j) return { task: j }; return { err: fail('AMBIGUOUS', 'Kilka zadań pasuje: ' + inc.slice(0, 5).map(x => (x.time || '--:--') + ' ' + x.text + ' (' + x.id + ')').join('; ') + '. Podaj id.', { candidates: inc.slice(0, 5).map(x => ({ id: x.id, text: x.text, time: x.time, date: x.date })) }) }; }
  const may = nearest(tasks.filter(t => !t.done), q, t => t.text);
  return { err: fail('NOT_FOUND', 'Nie znalazłem zadania „' + q + '”.' + (may.length ? ' Może: ' + may.map(t => '„' + t.text + '”').join(', ') + '?' : '')) };
};
const taskRow = t => ({ id: t.id, date: t.date, time: t.time, text: t.text, done: t.done, ...(t.priority && t.priority !== 'normal' ? { priority: t.priority } : {}), ...(t.repeat ? { repeat: t.repeat.rule } : {}), ...(t.remind ? { remind: t.remind } : {}), ...(t.subtasks?.length ? { subtasks: t.subtasks.filter(s => s.done).length + '/' + t.subtasks.length } : {}) });
const noteRow = n => ({ id: n.id, title: n.title, updated: new Date(n.ts).toISOString(), words: n.body.trim().split(/\s+/).filter(Boolean).length, ...(n.tags?.length ? { tags: n.tags } : {}), ...(n.folder ? { folder: n.folder } : {}), ...(n.pinned ? { pinned: true } : {}) });
const showIf = (show, app, arg) => { if (show !== false) J.wm.open(app, arg); };

/* =================== APLIKACJE I OKNA =================== */
R.add({ id: 'open_app', group: 'Aplikacje i okna', label: 'Otwórz aplikację', description: 'Otwiera aplikację Jarvis OS: ' + APP_IDS.map(i => i + '=' + APP_NAMES[i]).join(', ') + '.',
  args: { type: 'object', properties: { app: { type: 'string', enum: APP_IDS } }, required: ['app'] }, idempotent: true, reads: [], writes: ['windows'],
  examples: ['otworz {app}', 'uruchom {app}', 'pokaz {app}', 'wlacz {app}', 'odpal {app}', 'przejdz do {app}'],
  parse(raw, n) { if (/^(otworz|uruchom|pokaz|wlacz|odpal|start|przejdz do|idz do)\s+/.test(n)) return null; const app = n.split(' ').length <= 2 ? findApp(n) : null; return app ? { args: { app }, score: -20 } : null; },
  run({ app }) { J.wm.open(app); return ok({ app, open: J.wm.list() }, 'Otwarto: ' + APP_NAMES[app] + '.', { highlight: app }); } });
R.add({ id: 'close_app', group: 'Aplikacje i okna', label: 'Zamknij okno', description: 'Zamyka okno aplikacji (da się cofnąć: wm_reopen). app="all" zamyka wszystkie okna (wymaga potwierdzenia).',
  args: { type: 'object', properties: { app: { type: 'string', enum: [...APP_IDS, 'all', 'current'] } }, required: ['app'] }, risk: 'confirm', confirmText: a => a.app === 'all' ? 'Zamknąć wszystkie okna?' : 'Zamknąć ' + (APP_NAMES[a.app] || 'bieżące okno') + '?', writes: ['windows'],
  examples: ['zamknij {app}', 'wylacz {app}', 'zamknij (wszystko|wszystkie okna|okna)', 'zamknij to'],
  parse(raw, n) { if (/^zamknij\s+(wszystko|wszystkie|okna)/.test(n)) return { args: { app: 'all' } }; if (/^zamknij\s+(to|biezace|aktualne)/.test(n)) return { args: { app: 'current' } }; return null; },
  run({ app }) {
    const reopen = ids => () => ids.slice().reverse().forEach(id => J.wm.reopen(id));
    if (app === 'all') { const ids = J.wm.list().filter(k => !k.startsWith('w:')), n = ids.length; J.wm.closeAll(); return ok({ closed: n }, n ? 'Zamknięto ' + n + ' ' + J.pl(n, 'okno', 'okna', 'okien') + '.' : 'Nie było otwartych okien.', null, n ? reopen(ids) : null); }
    if (app === 'current') { const f = J.wm.focused(); if (!f) return fail('NOT_FOUND', 'Żadne okno nie jest aktywne.'); if (f.startsWith('w:')) return fail('INVALID_ARGS', 'To jest widget — zamknięcie go usuwa. Powiedz „usuń widget”.'); J.wm.close(f); return ok({ app: f }, 'Zamknięto: ' + winName(f) + '.', null, reopen([f])); }
    if (!J.wm.isOpen(app)) return fail('NOT_FOUND', notOpen(app) + ' Otwarte: ' + (J.wm.list().map(winName).join(', ') || 'brak') + '.');
    J.wm.close(app); return ok({ app }, 'Zamknięto: ' + APP_NAMES[app] + '.', null, reopen([app]));
  } });
R.add({ id: 'wm_list', group: 'Aplikacje i okna', label: 'Lista okien', description: 'Zwraca otwarte okna z pozycją, rozmiarem, stanem i tym, które jest aktywne.', idempotent: true, reads: ['windows'], palette: false,
  examples: ['jakie okna sa otwarte', 'lista okien', 'co jest otwarte'],
  run() { const l = J.wm.info(); return ok({ windows: l, focused: J.wm.focused() }, l.length ? 'Otwarte: ' + l.map(w => w.title + (w.min ? ' (zminimalizowane)' : '') + (w.focused ? ' (aktywne)' : '')).join(', ') + '.' : 'Brak otwartych okien.'); } });
R.add({ id: 'wm_focus', group: 'Aplikacje i okna', label: 'Aktywuj okno', description: 'Przenosi okno na wierzch (przywraca, jeśli zminimalizowane). app="next" = następne okno.',
  args: { type: 'object', properties: { app: { type: 'string', enum: [...APP_IDS, 'next'] } }, required: ['app'] }, idempotent: true, writes: ['windows'],
  examples: ['przelacz na {app}', 'aktywuj {app}', 'nastepne okno', 'przelacz okno'],
  parse(raw, n) { return /^(nastepne okno|przelacz okno|kolejne okno)$/.test(n) ? { args: { app: 'next' } } : null; },
  run({ app }) { if (app === 'next') { const id = J.wm.cycle(); return id ? ok({ app: id }, 'Aktywne: ' + (J.apps[id]?.title || id) + '.') : fail('NOT_FOUND', 'Brak okien.'); } if (!J.wm.isOpen(app)) return fail('NOT_FOUND', notOpen(app)); J.wm.open(app); return ok({ app }, 'Aktywne: ' + APP_NAMES[app] + '.'); } });
R.add({ id: 'wm_minimize', group: 'Aplikacje i okna', label: 'Minimalizuj', description: 'Minimalizuje okno do doku. app="all" pokazuje pulpit.',
  args: { type: 'object', properties: { app: { type: 'string', enum: [...APP_IDS, 'all', 'current'] } }, required: ['app'] }, idempotent: true, writes: ['windows'],
  examples: ['zminimalizuj {app}', 'schowaj {app}', 'pokaz pulpit', 'zminimalizuj wszystko', 'schowaj okna'],
  parse(raw, n) { return /^(pokaz pulpit|zminimalizuj (wszystko|wszystkie okna)|schowaj (wszystko|okna))$/.test(n) ? { args: { app: 'all' } } : null; },
  run({ app }) { if (app === 'all') { J.wm.minimizeAll(); return ok(null, 'Pulpit jest czysty.'); } const id = app === 'current' ? J.wm.focused() : app; if (!id || !J.wm.isOpen(id)) return fail('NOT_FOUND', 'Okno nie jest otwarte.'); J.wm.minimize(id); return ok({ app: id }, 'Zminimalizowano ' + (J.apps[id]?.title || id) + '.'); } });
R.add({ id: 'wm_arrange', group: 'Aplikacje i okna', label: 'Ułóż okna', description: 'Układa okna: tile (kafelki z otwartych okien), left/right/top/bottom (przyciąga aktywne okno do krawędzi), max (maksymalizuje), center; layout=nazwa zapisanego układu lub presetu (praca, rynek, czysto).',
  args: { type: 'object', properties: { mode: { type: 'string', enum: ['tile', 'left', 'right', 'top', 'bottom', 'max', 'center', 'layout', 'split'] }, layout: { type: 'string', description: 'nazwa układu przy mode=layout' }, app: { type: 'string', description: 'okno do przyciągnięcia (id aplikacji albo w:<id> widgetu); domyślnie aktywne' }, apps: { type: 'array', items: { type: 'string' }, maxItems: 2, description: 'przy mode=split: [lewe, prawe]' } }, required: ['mode'] }, writes: ['windows'],
  examples: ['uloz okna', 'rozmiesc okna', 'kafelkuj okna', 'okno na lewo', 'okno na prawo', 'maksymalizuj [okno]', 'wysrodkuj okno', 'uklad {layout}', 'zastosuj uklad {layout}'],
  parse(raw, n) { let m; if ((m = /^(?:pol na pol|podziel ekran(?: na)?|obok siebie:?)?\s*(.+?)\s+(?:i|oraz)\s+(.+?)(?:\s+obok siebie|\s+pol na pol)?$/.exec(n)) && (/obok siebie|pol na pol|podziel ekran/.test(n))) { const a = findApp(m[1]), b = findApp(m[2]); if (a && b && a !== b) return { args: { mode: 'split', apps: [a, b] }, score: 30 }; } if (/^(uloz|kafelkuj|poukladaj|rozmiesc)\s+okna$/.test(n)) return { args: { mode: 'tile' } }; if ((m = /^(?:okno|przesun okno|przesun)\s+(?:na|w)\s+(lewo|prawo|gore|dol)$/.exec(n))) return { args: { mode: { lewo: 'left', prawo: 'right', gore: 'top', dol: 'bottom' }[m[1]] } }; if (/^maksymalizuj/.test(n)) return { args: { mode: 'max' } }; if (/^wysrodkuj/.test(n)) return { args: { mode: 'center' } }; if ((m = /^(?:zastosuj\s+)?uklad\s+(.+)$/.exec(n))) return { args: { mode: 'layout', layout: m[1] } }; return null; },
  run({ mode, layout, app, apps }) {
    const undo = layoutUndo();
    if (mode === 'tile') { const n = J.wm.tile(); return n ? ok({ tiled: n }, 'Ułożyłem ' + n + ' ' + J.pl(n, 'okno', 'okna', 'okien') + ' w kafelki.', null, undo) : fail('NOT_FOUND', 'Brak okien do ułożenia.'); }
    if (mode === 'layout') { const r = J.layouts.apply(layout); return r.ok ? ok(r, 'Układ „' + r.name + '”: ' + (r.apps.map(winName).join(', ') || 'czysty pulpit') + '.' + (r.skipped ? ' Pominąłem ' + r.skipped + ' ' + J.pl(r.skipped, 'okno', 'okna', 'okien') + ', których już nie ma.' : ''), null, undo) : fail('NOT_FOUND', 'Nie znam układu „' + layout + '”. Dostępne: ' + J.layouts.list().join(', ') + '.'); }
    if (mode === 'split') { const [a, b] = (apps || []).map(resolveWin); if (!a || !b || a === b) return fail('INVALID_ARGS', 'Podaj dwa różne okna, np. „notatnik i harmonogram obok siebie”.'); [a, b].forEach(k => J.wm.open(k)); J.wm.snap(a, 'left'); J.wm.snap(b, 'right'); return ok({ apps: [a, b] }, winName(a) + ' po lewej, ' + winName(b) + ' po prawej.', null, undo); }
    const id = resolveWin(app); if (!id || !J.wm.isOpen(id)) return fail('NOT_FOUND', app ? notOpen(id || app) : 'Brak aktywnego okna.');
    if (mode === 'max') { J.wm.setMax(id, true); return ok({ app: id }, 'Zmaksymalizowano ' + winName(id) + '.', null, undo); }
    J.wm.snap(id, mode); return ok({ app: id, mode }, 'Okno ' + winName(id) + ': ' + ({ left: 'lewa połowa', right: 'prawa połowa', top: 'górna połowa', bottom: 'dolna połowa', center: 'wyśrodkowane' })[mode] + '.', null, undo);
  } });
const DIRS = { lewo: 'left', prawo: 'right', gore: 'up', gory: 'up', dol: 'down', dolu: 'down' };
R.add({ id: 'wm_move', group: 'Aplikacje i okna', label: 'Przesuń / zmień rozmiar okna', description: 'Przesuwa okno lub widget (app: id aplikacji, w:<id> widgetu, "current"): x,y w pikselach albo direction (left/right/up/down) + amount (small/medium/large); zmienia rozmiar: w,h w pikselach albo size (S, M, L, XL, half, third, quarter, bigger, smaller).',
  args: { type: 'object', properties: { app: { type: 'string', description: 'id aplikacji, w:<id> widgetu albo "current"' }, x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number', minimum: 120 }, h: { type: 'number', minimum: 100 }, direction: { type: 'string', enum: ['left', 'right', 'up', 'down'] }, amount: { type: 'string', enum: ['small', 'medium', 'large'] }, size: { type: 'string', enum: ['S', 'M', 'L', 'XL', 'half', 'third', 'quarter', 'bigger', 'smaller'] } }, required: ['app'] }, writes: ['windows'],
  examples: ['przesun {app} (troche|bardziej|mocno)? w (lewo|prawo|gore|dol)', '(powieksz|zmniejsz) {app}', 'zrob {app} (maly|maly|sredni|duzy|wiekszy|mniejszy)', 'rozciagnij {app} na pol ekranu'],
  parse(raw, n) {
    let m;
    if ((m = /^przesun\s+(.+?)\s+(troche|lekko|bardziej|mocno|duzo)?\s*(?:w|na|do)\s+(lewo|prawo|gore|gory|dol|dolu)$/.exec(n)) && !/^okno$/.test(m[1])) { const app = resolveWin(raw.slice(n.indexOf(m[1]), n.indexOf(m[1]) + m[1].length)); if (app) return { args: { app, direction: DIRS[m[3]], amount: /troche|lekko/.test(m[2] || '') ? 'small' : /mocno|duzo/.test(m[2] || '') ? 'large' : 'medium' }, score: 25 }; }
    if ((m = /^(powieksz|zwieksz|zmniejsz|pomniejsz)\s+(.+)$/.exec(n))) { const app = resolveWin(raw.slice(n.indexOf(m[2]))); if (app) return { args: { app, size: /^(powieksz|zwieksz)/.test(m[1]) ? 'bigger' : 'smaller' }, score: 20 }; }
    if ((m = /^(?:zrob|ustaw)\s+(.+?)\s+(malym|maly|mala|male|srednim|sredni|srednia|duzym|duzy|duza|duze|ogromnym|ogromny|wiekszym|wiekszy|wieksze|mniejszym|mniejszy|mniejsze)$/.exec(n))) { const app = resolveWin(raw.slice(n.indexOf(m[1]), n.indexOf(m[1]) + m[1].length)); if (app) return { args: { app, size: /^mal/.test(m[2]) ? 'S' : /^sred/.test(m[2]) ? 'M' : /^duz/.test(m[2]) ? 'L' : /^ogrom/.test(m[2]) ? 'XL' : /^wiek/.test(m[2]) ? 'bigger' : 'smaller' }, score: 20 }; }
    if ((m = /^(?:rozciagnij|rozszerz|ustaw)\s+(.+?)\s+na\s+(pol|polowe|trzecia czesc|jedna trzecia|cwiartke) ekranu$/.exec(n))) { const app = resolveWin(raw.slice(n.indexOf(m[1]), n.indexOf(m[1]) + m[1].length)); if (app) return { args: { app, size: /^pol/.test(m[2]) ? 'half' : /trzec/.test(m[2]) ? 'third' : 'quarter' }, score: 20 }; }
    return null;
  },
  run({ app, x, y, w, h, direction, amount = 'medium', size }) {
    const id = resolveWin(app); if (!id || !J.wm.isOpen(id)) return fail('NOT_FOUND', id ? notOpen(id) : 'Nie ma okna „' + app + '”.');
    if (innerWidth <= 640) return fail('UNSUPPORTED', 'Na małym ekranie okna zajmują cały ekran — nie da się ich przesuwać.');
    if (J.wm.dragging() === id) return fail('CONFLICT', 'Okno jest właśnie przesuwane myszą.');
    const before = J.wm.info().find(k => k.id === id), d = J.$('#desktop')?.getBoundingClientRect() || { width: innerWidth, height: innerHeight };
    if (direction) { const step = { small: 40, medium: 120, large: Math.round((direction === 'left' || direction === 'right' ? d.width : d.height) / 4) }[amount] || 120; const dx = direction === 'left' ? -step : direction === 'right' ? step : 0, dy = direction === 'up' ? -step : direction === 'down' ? step : 0; J.wm.move(id, before.x + dx, before.y + dy); }
    if (x != null || y != null) J.wm.move(id, x, y);
    if (size) {
      const W = d.width, H = d.height - 84, P = { S: [260, 200], M: [420, 320], L: [620, 460], XL: [860, 600] };
      let nw, nh; if (P[size]) [nw, nh] = P[size]; else if (size === 'half') { nw = W / 2 - 12; nh = H - 16; } else if (size === 'third') { nw = W / 3 - 12; nh = H - 16; } else if (size === 'quarter') { nw = W / 2 - 12; nh = H / 2 - 12; } else { const k = size === 'bigger' ? 1.2 : 1 / 1.2; nw = before.w * k; nh = before.h * k; }
      const cx = before.x + before.w / 2, cy = before.y + before.h / 2; J.wm.resize(id, Math.round(nw), Math.round(nh)); const now = J.wm.info().find(k => k.id === id);
      if (size === 'half' || size === 'third' || size === 'quarter') J.wm.move(id, cx < W / 2 ? 8 : W - now.w - 8, 8); else J.wm.move(id, Math.round(cx - now.w / 2), Math.round(cy - now.h / 2));
    }
    if (w != null || h != null) J.wm.resize(id, w, h);
    const i = J.wm.info().find(k => k.id === id);
    return ok(i, 'Okno ' + winName(id) + ' ' + (size ? 'ma nowy rozmiar' : 'przesunięte') + '.', null, () => { if (before && J.wm.isOpen(id)) { J.wm.move(id, before.x, before.y); J.wm.resize(id, before.w, before.h); } });
  } });
R.add({ id: 'nav_back', group: 'Aplikacje i okna', label: 'Wróć do poprzedniego okna', description: 'Wraca do poprzednio aktywnego okna (historia nawigacji); otwiera je, jeśli zostało zamknięte.', idempotent: false, writes: ['windows'],
  examples: ['wroc', 'cofnij okno', 'wroc do poprzedniego okna', 'poprzednie okno', 'wroc do poprzedniej aplikacji', 'wroc tam gdzie bylem'],
  run() { const r = J.nav.back(); return r.ok ? ok({ app: r.app }, r.text, { highlight: r.app }) : fail('NOT_FOUND', r.text); } });
R.add({ id: 'schedule_day', group: 'Zadania i czas', label: 'Pokaż dzień w harmonogramie', description: 'Otwiera Harmonogram na wskazanym dniu (data YYYY-MM-DD, jutro, piątek…) — nawigacja, niczego nie zmienia.', idempotent: true, writes: ['windows'],
  args: { type: 'object', properties: { date: { type: 'string', format: 'date', description: 'YYYY-MM-DD, jutro, piątek' } }, required: ['date'] },
  parse(raw, n) { const m = /^(?:pokaz|otworz|przejdz do|idz do|wlacz)?\s*(?:dzien|dnia|harmonogram|kalendarz)\s+(?:na\s+|w\s+|we\s+)?(.+)$/.exec(n); if (!m) return null; const d = J.nlp.date(m[1]) || J.nlp.date('w ' + m[1]) || J.nlp.date('za ' + m[1]); return d ? { args: { date: d }, score: 40 } : null; },
  run({ date }) { J.wm.open('schedule', date); const n = J.state.tasks.filter(t => t.date === date).length; return ok({ date, tasks: n }, 'Harmonogram: ' + new Date(date + 'T12:00').toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }) + ' — ' + (n ? n + ' ' + J.pl(n, 'zadanie', 'zadania', 'zadań') : 'brak zadań') + '.', { highlight: 'schedule' }); } });
const SECTIONS = ['openrouter', 'akcent', 'tapeta', 'interfejs', 'glos', 'uzytkownik', 'hermes', 'agent', 'jev', 'powiadomienia', 'skroty', 'uklady', 'pamiec', 'pliki', 'dane', 'oprogramie'];
[['openrouter', /openrouter|klucz/], ['hermes', /hermes|mozg/], ['jev', /jev|sedzi/], ['agent', /agent|proaktyw|czuwan|briefing|rutyn/], ['glos', /glos|mow|syntezator/], ['pamiec', /pamiec|pamietasz|fakty/], ['pliki', /plik|folder/], ['dane', /dane|eksport|kopi|import|reset/], ['interfejs', /interfejs|dzwiek|czastecz/], ['uzytkownik', /uzytkownik|miasto|inicjal/], ['akcent', /kolor|akcent|motyw/], ['tapeta', /tapet|tlo/], ['powiadomienia', /powiadomien|kanal/], ['skroty', /skrot|klawisz/], ['uklady', /uklad/], ['oprogramie', /o programie|diagnost|wersj|eksperyment|samouczek/]].forEach(([id, re]) => R.alias('section', id, re));
R.add({ id: 'settings_open', group: 'Interfejs', label: 'Otwórz sekcję ustawień', description: 'Otwiera Ustawienia przewinięte do sekcji: ' + SECTIONS.join(', ') + ' (nawigacja, niczego nie zmienia).', idempotent: true, writes: ['windows'],
  args: { type: 'object', properties: { section: { type: 'string', enum: SECTIONS } }, required: ['section'] },
  examples: ['otworz ustawienia {section}', 'pokaz ustawienia {section}', 'przejdz do ustawien {section}', 'ustawienia {section}', 'otworz sekcje {section}'],
  run({ section }) { J.wm.open('settings', section); return ok({ section }, 'Ustawienia: sekcja „' + section + '”.', { highlight: 'settings' }); } });
R.add({ id: 'layout_save', group: 'Aplikacje i okna', label: 'Zapisz układ okien', description: 'Zapisuje bieżący układ otwartych okien pod nazwą (do wm_arrange mode=layout).',
  args: { type: 'object', properties: { name: { type: 'string', maxLength: 40 } }, required: ['name'] }, writes: ['layouts'],
  examples: ['zapisz uklad [jako] {name}', 'zapamietaj uklad [jako] {name}'],
  run({ name }) { const prev = J.state.layouts[name]; const r = J.layouts.save(name); return r.apps.length ? ok(r, 'Zapisałem układ „' + r.name + '” (' + r.apps.join(', ') + ').', null, () => { if (prev) J.state.layouts[name] = prev; else delete J.state.layouts[name]; J.save(); }) : fail('NOT_FOUND', 'Brak otwartych okien do zapisania.'); } });

/* =================== NOTATKI =================== */
R.add({ id: 'notes_list', group: 'Notatki', label: 'Lista notatek', description: 'Zwraca listę notatek (id, tytuł, data, liczba słów). Użyj przed edycją, jeśli nie znasz id.', idempotent: true, reads: ['notes'],
  args: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 100 } } },
  examples: ['[pokaz] (liste notatek|moje notatki|jakie mam notatki)', 'ile mam notatek', 'lista notatek', 'wypisz [moje] notatki'],
  run({ limit = 20 }) { const all = J.notes.live(), l = all.slice(0, limit).map(noteRow); return ok({ count: all.length, notes: l }, all.length ? 'Masz ' + all.length + ' ' + J.pl(all.length, 'notatkę', 'notatki', 'notatek') + ': ' + l.slice(0, 6).map(n => '„' + n.title + '”').join(', ') + (l.length > 6 ? '…' : '') + '.' : 'Nie masz jeszcze notatek.'); } });
R.add({ id: 'notes_read', group: 'Notatki', label: 'Przeczytaj notatkę', description: 'Zwraca pełną treść notatki (po id lub fragmencie tytułu). show=true otwiera ją w Notatniku.', idempotent: true, reads: ['notes'],
  args: { type: 'object', properties: { note: { type: 'string', description: 'id lub tytuł' }, show: { type: 'boolean' } }, required: ['note'] },
  examples: ['przeczytaj notatke {note}', 'odczytaj notatke {note}', 'pokaz notatke {note}', 'co jest w notatce {note}', 'otworz notatke {note}'],
  async run({ note, show }) { const f = await findNote(note); if (f.err) return f.err; const n = f.note; showIf(show, 'notes', n.id); return ok({ id: n.id, title: n.title, body: n.body, updated: new Date(n.ts).toISOString() }, '„' + n.title + '”: ' + cut(n.body.replace(/\s+/g, ' '), 400)); } });
R.add({ id: 'notes_search', group: 'Notatki', label: 'Szukaj w notatkach', description: 'Przeszukuje tytuły i treść notatek; zwraca dopasowania z fragmentem.', idempotent: true, reads: ['notes'],
  args: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  examples: ['szukaj w notatkach {query}', 'znajdz w notatkach {query}', 'wyszukaj notatke {query}', 'ktora notatka zawiera {query}'],
  run({ query }) { const q = norm(query); const hits = J.notes.live().filter(n => norm(n.title + ' ' + n.body).includes(q)).map(n => { const i = norm(n.body).indexOf(q); return { id: n.id, title: n.title, snippet: i >= 0 ? cut(n.body.slice(Math.max(0, i - 40), i + 80).replace(/\s+/g, ' '), 140) : '' }; }); return ok({ hits }, hits.length ? 'Znalazłem w ' + hits.length + ' ' + J.pl(hits.length, 'notatce', 'notatkach', 'notatkach') + ': ' + hits.slice(0, 5).map(h => '„' + h.title + '”').join(', ') + '.' : 'Nic nie pasuje do „' + query + '”.'); } });
/* tytuł notatki z treści: „zakupy — mleko, chleb” → „zakupy”; „Uwaga: …” → „Uwaga”; inaczej pierwsza linia, a gdy za długa —
   ucięta na granicy słowa z „…”. „10:30 dentysta” zostaje w całości (dwukropek bez spacji to godzina, nie separator). */
const noteTitle = content => {
  const line = String(content || '').split('\n')[0].trim();
  const m = /^(.{2,60}?)(?:\s+[—–-]\s+|\s*[—–]\s*|:\s+)(?=\S)/.exec(line);
  if (m && /[a-ząćęłńóśźż]/i.test(m[1])) return m[1].trim();
  if (line.length <= 60) return line;
  const cut = line.slice(0, 60), sp = cut.lastIndexOf(' ');
  return (sp > 30 ? cut.slice(0, sp) : cut).replace(/[\s,;:—–-]+$/, '') + '…';
};
J.noteTitle = noteTitle;
R.add({ id: 'create_note', group: 'Notatki', label: 'Nowa notatka', description: 'Tworzy notatkę. show=false nie otwiera Notatnika.', writes: ['notes'],
  args: { type: 'object', properties: { title: { type: 'string', maxLength: 80 }, content: { type: 'string' }, show: { type: 'boolean' } }, required: ['content'] },
  examples: ['zanotuj {content}', 'zapisz notatke {content}', 'utworz notatke {content}', 'nowa notatka {content}', 'dodaj notatke {content}', 'notatka {content}', 'zapisz {content}'],
  run({ title, content, show }) { const n = J.notes.add(title ? String(title).split('\n')[0].slice(0, 80) : noteTitle(content), String(content)); showIf(show, 'notes', n.id); return ok(noteRow(n), 'Utworzyłem notatkę „' + n.title + '”.', { highlight: 'notes' }, () => { J.notes.remove(n.id); }); } });
R.add({ id: 'notes_append', group: 'Notatki', label: 'Dopisz do notatki', description: 'Dopisuje tekst na końcu istniejącej notatki (po id lub tytule).', writes: ['notes'],
  args: { type: 'object', properties: { note: { type: 'string' }, text: { type: 'string' }, show: { type: 'boolean' } }, required: ['note', 'text'] },
  examples: ['dopisz do notatki {note}: {text}', 'dodaj do notatki {note}: {text}', 'dopisz do {note}: {text}', 'dodaj do listy {note} {text}', 'dopisz do notatki {note} {text}', 'dodaj do notatki {note} {text}'],
  async run({ note, text, show }) { const f = await findNote(note); if (f.err) return f.err; const n = f.note, prevBody = n.body, prevTs = n.ts; await J.notes.version(n, 'jarvis'); n.body = (n.body ? n.body.replace(/\s+$/, '') + '\n' : '') + text; n.ts = Date.now(); const after = n.body; J.save(); J.emit('notes', n.id); showIf(show, 'notes', n.id); const u = () => { n.body = prevBody; n.ts = prevTs; J.save(); J.emit('notes', n.id); }; u.changed = () => n.body !== after; return ok(noteRow(n), 'Dopisałem do „' + n.title + '”.', { highlight: 'notes' }, u); } });
R.add({ id: 'notes_update', group: 'Notatki', label: 'Zmień notatkę', description: 'Zmienia tytuł i/lub zastępuje całą treść notatki.', writes: ['notes'],
  args: { type: 'object', properties: { note: { type: 'string' }, title: { type: 'string', maxLength: 80 }, content: { type: 'string' } }, required: ['note'] },
  examples: ['zmien tytul notatki {note} na {title}', 'przemianuj notatke {note} na {title}'],
  async run({ note, title, content }) { const f = await findNote(note); if (f.err) return f.err; const n = f.note, snap = { title: n.title, body: n.body, ts: n.ts }; await J.notes.version(n, 'jarvis'); if (title) n.title = title; if (content != null) n.body = content; n.ts = Date.now(); const after = n.title + '\u0000' + n.body; J.save(); J.emit('notes', n.id); const u = () => { Object.assign(n, snap); J.save(); J.emit('notes', n.id); }; u.changed = () => n.title + '\u0000' + n.body !== after; return ok(noteRow(n), 'Zmieniłem notatkę „' + n.title + '”.', null, u); } });
R.add({ id: 'notes_delete', group: 'Notatki', label: 'Usuń notatkę', description: 'Przenosi notatkę do kosza (30 dni, można przywrócić: notes_restore). Wymaga potwierdzenia.', risk: 'confirm', confirmText: a => 'Usunąć notatkę „' + (J.state.notes.find(x => x.id === a.note)?.title || a.note) + '”?', writes: ['notes'],
  args: { type: 'object', properties: { note: { type: 'string' } }, required: ['note'] },
  examples: ['usun notatke {note}', 'skasuj notatke {note}', 'wyrzuc notatke {note}'],
  async run({ note }) { const f = await findNote(note); if (f.err) return f.err; const n = f.note; J.notes.trash(n.id); return ok({ id: n.id }, 'Przeniosłem notatkę „' + n.title + '” do kosza.', null, () => { J.notes.restore(n.id); }); } });

/* =================== ZADANIA I CZAS =================== */
R.add({ id: 'tasks_list', group: 'Zadania i czas', label: 'Lista zadań', description: 'Zwraca zadania: range=today (domyślnie), tomorrow, week, all, overdue.', idempotent: true, reads: ['tasks'],
  args: { type: 'object', properties: { range: { type: 'string', enum: ['today', 'tomorrow', 'week', 'all', 'overdue'] } } },
  examples: ['[pokaz] (zadania|plan|harmonogram) na (dzis|dzisiaj)', 'co mam (dzis|dzisiaj) do zrobienia', 'jakie mam zadania', 'co mam jutro', 'co mam (dzis|dzisiaj)', 'lista zadan', 'co mam do zrobienia', 'plan na tydzien', 'co mam zalegle', 'co mam w planach'],
  parse(raw, n) { if (/\bjutro\b/.test(n) && /zadani|plan|co mam/.test(n)) return { args: { range: 'tomorrow' } }; if (/tydzien|tygodnia/.test(n) && /zadani|plan/.test(n)) return { args: { range: 'week' } }; if (/zalegl/.test(n)) return { args: { range: 'overdue' } }; return null; },
  run({ range = 'today' }) {
    const today = J.today(), now = J.hhmm(), all = J.state.tasks; let l;
    const plus = k => { const d = new Date(); d.setDate(d.getDate() + k); return d.getFullYear() + '-' + J.pad(d.getMonth() + 1) + '-' + J.pad(d.getDate()); };
    if (range === 'today') l = all.filter(t => t.date === today); else if (range === 'tomorrow') l = all.filter(t => t.date === plus(1)); else if (range === 'week') l = all.filter(t => t.date >= today && t.date <= plus(7)); else if (range === 'overdue') l = all.filter(t => !t.done && (t.date < today || (t.date === today && t.time && t.time < now))); else l = all;
    const rows = l.map(taskRow), lab = { today: 'dziś', tomorrow: 'jutro', week: 'w tym tygodniu', all: 'łącznie', overdue: 'zaległych' }[range];
    return ok({ range, tasks: rows, done: rows.filter(t => t.done).length, total: rows.length, ratio: rows.length ? +(rows.filter(t => t.done).length / rows.length).toFixed(3) : 0 }, rows.length ? 'Zadania ' + lab + ' (' + rows.filter(t => t.done).length + '/' + rows.length + ' ukończone): ' + rows.map(t => (t.time || '--:--') + ' ' + t.text + (t.done ? ' ✓' : '')).join('; ') + '.' : 'Brak zadań ' + lab + '.');
  } });
R.add({ id: 'add_task', group: 'Zadania i czas', label: 'Dodaj zadanie / przypomnienie', description: 'Dodaje zadanie do Harmonogramu; o podanej godzinie Jarvis przypomni głosem. Obsługuje czas względny przez pole "in" (np. "20 minut").', writes: ['tasks'],
  args: { type: 'object', properties: { text: { type: 'string' }, time: { type: 'string', format: 'time', description: 'HH:MM' }, date: { type: 'string', format: 'date', description: 'YYYY-MM-DD, jutro, piątek' }, in: { type: 'string', description: 'czas względny, np. "20 minut", "2 godziny"' }, priority: { type: 'string', enum: ['high', 'normal', 'low'] }, repeat: { type: 'object', description: '{ rule: daily|weekdays|weekly|monthly|every_n_days, days?: [pn..nd], n?, until? }' }, remind: { type: 'integer', minimum: 0, maximum: 1440, description: 'przypomnienie N minut przed' }, show: { type: 'boolean' } }, required: ['text'] },
  examples: ['przypomnij [mi] {text}', 'dodaj zadanie {text}', 'zaplanuj {text}', 'nowe zadanie {text}', 'dodaj do harmonogramu {text}'],
  parse(raw, n) {
    if (!/^(przypomnij|dodaj zadanie|zaplanuj|nowe zadanie|dodaj do harmonogramu|zapisz zadanie)/.test(n)) return null;
    const rel = J.nlp.relative(raw), time = rel ? rel.time : J.nlp.time(raw), date = rel ? rel.date : (J.nlp.date(raw) || J.today());
    const pr = /^(pilne|wazne)\b/.test(n.replace(/^(przypomnij( mi)?|dodaj zadanie)\s*:?\s*/, '')) ? 'high' : undefined; const rm = /(\d+|pol godziny|kwadrans)\s*(minut|min|godzin\w*)?\s+(przed|wczesniej)/.exec(n); const remind = rm ? (/pol godziny/.test(rm[1]) ? 30 : /kwadrans/.test(rm[1]) ? 15 : (+rm[1]) * (/godzin/.test(rm[2] || '') ? 60 : 1)) : undefined; const rep = J.nlp.repeat?.(n);
    let text = J.nlp.strip(raw.replace(/^(przypomnij( mi)?( o tym)?( ze| że|zeby| żeby)?|dodaj zadanie|zaplanuj|nowe zadanie|dodaj do harmonogramu|zapisz zadanie)\s*:?\s*/i, '')).replace(/^(pilne|ważne|wazne)\s*:?\s*/i, '').replace(/\s*(\d+|pół godziny|pol godziny|kwadrans)\s*(minut|min|godzin\w*)?\s+(przed|wcześniej|wczesniej)\b/i, '').replace(/\b(codziennie|w dni robocze|co tydzień|co tydzien|co miesiąc|co miesiac|co \d+ dni)\b/i, '').trim();
    text = text.replace(/^(o|na|ze|że|zeby|żeby|:)\s+/i, '').replace(/\s+(o|na)$/i, '').trim();
    text = J.unquote(text);
    return { args: { text: text || 'Przypomnienie', time: time || undefined, date, ...(pr ? { priority: pr } : {}), ...(remind ? { remind } : {}), ...(rep ? { repeat: rep } : {}) }, score: 10 };
  },
  run({ text, time, date, in: rel, priority, repeat, remind, show }) {
    if (rel) { const r = J.nlp.relative('za ' + rel); if (r) { time = r.time; date = r.date; } }
    const t = J.tasks.add(time || '', J.unquote(text), date || J.today(), { ...(priority ? { priority } : {}), ...(repeat && repeat.rule && repeat.rule !== 'none' ? { repeat } : {}), ...(remind ? { remind } : {}) }); if (t.repeat) t.seriesId = t.id; showIf(show === true, 'schedule');
    const when = (t.date !== J.today() ? new Date(t.date + 'T12:00').toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }) + ' ' : 'dziś ') + (t.time ? 'o ' + t.time : 'bez godziny');
    return ok(taskRow(t), 'Dodałem: „' + t.text + '” — ' + when + '.', { highlight: 'schedule' }, () => { J.state.tasks = J.state.tasks.filter(x => x !== t); J.save(); J.emit('tasks'); });
  } });
R.add({ id: 'tasks_complete', group: 'Zadania i czas', label: 'Odhacz zadanie', description: 'Oznacza zadanie jako wykonane (done=false cofa).', writes: ['tasks'],
  args: { type: 'object', properties: { task: { type: 'string', description: 'id lub treść' }, done: { type: 'boolean' } }, required: ['task'] },
  examples: ['odhacz {task}', 'zrobione {task}', 'oznacz {task} jako (zrobione|wykonane|ukonczone)', 'oznacz jako (zrobione|wykonane) {task}', 'zakoncz zadanie {task}', 'ukonczylem {task}', 'zaliczone {task}'],
  async run({ task, done = true }) { const f = await findTask(task); if (f.err) return f.err; const t = f.task, was = t.done, wasAt = t.doneAt; t.done = done; t.doneAt = done ? Date.now() : null; const next = done && !was && t.repeat ? J.tasks.spawnNext(t) : null; J.save(); J.emit('tasks'); if (done) J.sfx.success(); return ok({ ...taskRow(t), next: next ? taskRow(next) : null }, (done ? 'Odhaczyłem: ' : 'Przywróciłem: ') + t.text + '.' + (next ? ' Następne: ' + next.date + (next.time ? ' ' + next.time : '') + '.' : ''), null, () => { t.done = was; t.doneAt = wasAt; if (next) J.state.tasks = J.state.tasks.filter(x => x !== next); J.save(); J.emit('tasks'); }); } });
R.add({ id: 'tasks_update', group: 'Zadania i czas', label: 'Zmień zadanie', description: 'Zmienia treść, godzinę lub datę zadania. Do przesunięcia o czas użyj snooze_minutes.', writes: ['tasks'],
  args: { type: 'object', properties: { task: { type: 'string' }, text: { type: 'string' }, time: { type: 'string', format: 'time' }, date: { type: 'string', format: 'date' }, snooze_minutes: { type: 'integer', minimum: 1 }, remind: { type: 'integer', minimum: 0, maximum: 1440 }, scope: { type: 'string', enum: ['this', 'series'] } }, required: ['task'] },
  examples: ['przesun {task} na {time}', 'przeloz {task} na {date}', 'odloz {task} o {snooze_minutes} minut'],
  parse(raw, n) { let m; if ((m = /^(?:przesun|przeloz|odloz)\s+(.+?)\s+(?:o|na)\s+(.+)$/.exec(n))) { const rest = raw.slice(n.indexOf(m[2])), rn = m[2]; const args = { task: raw.slice(n.indexOf(m[1]), n.indexOf(m[1]) + m[1].length) }; const dur = /^(\d+(?:[.,]\d+)?|pol|poltorej|kwadrans)\s*(minut|min|godzin|godzine|h|kwadrans)?$/.test(rn) && !/^\d{1,2}[:.]\d{2}$/.test(rn) ? J.nlp.duration(rest) : null; if (dur) args.snooze_minutes = Math.max(1, Math.round(dur / 60)); else { const time = J.nlp.time(rest) || J.nlp.time('o ' + rest); const date = J.nlp.date(rest); if (time) args.time = time; if (date) args.date = date; } return (args.snooze_minutes || args.time || args.date) ? { args, score: 5 } : null; } return null; },
  async run({ task, text, time, date, snooze_minutes, remind, scope }) { const f = await findTask(task); if (f.err) return f.err; const t = f.task, snap = { ...t }; const series = scope === 'series' && t.seriesId ? J.state.tasks.filter(x => x.seriesId === t.seriesId && x !== t && !x.done) : []; const sSnap = series.map(x => ({ x, s: { ...x } })); if (text) { t.text = text; series.forEach(x => x.text = text); } if (time) { t.time = time; series.forEach(x => x.time = time); } if (remind != null) { t.remind = remind; series.forEach(x => x.remind = remind); } if (date) t.date = date; if (snooze_minutes) { const base = new Date((t.date || J.today()) + 'T' + (t.time || J.hhmm()) + ':00'); base.setMinutes(base.getMinutes() + snooze_minutes); t.time = J.pad(base.getHours()) + ':' + J.pad(base.getMinutes()); t.date = base.getFullYear() + '-' + J.pad(base.getMonth() + 1) + '-' + J.pad(base.getDate()); } t.fired = false; t.done = false; J.tasks.sort(); J.save(); J.emit('tasks'); return ok(taskRow(t), 'Zadanie „' + t.text + '”: ' + t.date + ' ' + (t.time || 'bez godziny') + (t.remind ? ', przypomnę ' + t.remind + ' min wcześniej' : '') + (series.length ? ' (i ' + series.length + ' w serii)' : '') + '.', null, () => { Object.assign(t, snap); sSnap.forEach(({ x, s }) => Object.assign(x, s)); J.tasks.sort(); J.save(); J.emit('tasks'); }); } });
R.add({ id: 'tasks_remove', group: 'Zadania i czas', label: 'Usuń zadanie', description: 'Usuwa zadanie z Harmonogramu (wymaga potwierdzenia).', risk: 'confirm', confirmText: a => 'Usunąć zadanie „' + (J.state.tasks.find(x => x.id === a.task)?.text || a.task) + '”?', writes: ['tasks'],
  args: { type: 'object', properties: { task: { type: 'string' } }, required: ['task'] },
  examples: ['usun zadanie {task}', 'skasuj zadanie {task}', 'usun przypomnienie {task}'],
  async run({ task }) { const f = await findTask(task); if (f.err) return f.err; const t = f.task; J.state.tasks = J.state.tasks.filter(x => x !== t); J.save(); J.emit('tasks'); return ok({ id: t.id }, 'Usunąłem zadanie „' + t.text + '”.', null, () => { if (!J.state.tasks.includes(t)) { J.state.tasks.push(t); J.state.tasks.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)); J.save(); J.emit('tasks'); } }); } });
R.add({ id: 'start_timer', group: 'Zadania i czas', label: 'Minutnik', description: 'Uruchamia minutnik na podaną liczbę sekund. Kilka naraz (maks. 5) — rozróżnia je label; ta sama etykieta restartuje minutnik. preset=pomodoro: 25 min pracy / 5 przerwy ×4, potem 15.', writes: ['timer'],
  args: { type: 'object', properties: { seconds: { type: 'number', minimum: 1, maximum: 86400 }, label: { type: 'string', maxLength: 40 }, preset: { type: 'string', enum: ['pomodoro'] }, show: { type: 'boolean' } } },
  examples: ['minutnik {seconds}', 'ustaw minutnik na {seconds}', 'odliczaj {seconds}', 'odmierz {seconds}', 'pomodoro', 'budzik za {seconds}', 'drugi minutnik {seconds}'],
  parse(raw, n) { if (/^(pomodoro|zacznij pomodoro|zacznijmy pomodoro|zacznij sesje pomodoro|sesja pomodoro)$/.test(n)) return { args: { preset: 'pomodoro' }, score: 30 }; if (!/^(minutnik|timer|odlicz|budzik|stoper|pomodoro|ustaw|nastaw|wlacz|uruchom|zacznij|odliczaj|drugi|trzeci|kolejny|nowy|\d)/.test(n)) return null; if (!/(minutnik|timer|odlicz|budzik|stoper|pomodoro)/.test(n) && !/^ustaw .*na \d/.test(n)) return null; const s = J.nlp.duration(raw); if (!s) return n.split(' ').length <= 3 ? { args: { seconds: 0 } } : null; const lab = /(?:minut|min|sekund|godzin\w*|h)\s+(?:na\s+)?([a-ząćęłńóśźż][\wąćęłńóśźż ]{1,30})$/i.exec(raw)?.[1]?.trim(); return { args: { seconds: s, label: lab ? lab[0].toUpperCase() + lab.slice(1) : 'Minutnik ' + J.timer.fmt(s * 1000) }, score: 10 }; },
  run({ seconds, label, preset, show }) {
    if (preset === 'pomodoro') { const t = J.timers.pomodoro(); showIf(show, 'timer'); return ok({ label: t.label, seconds: 1500 }, 'Pomodoro: 25 minut pracy, potem 5 minut przerwy (4 rundy).', { highlight: 'timer' }, () => t.stop()); }
    if (!(seconds > 0)) { J.wm.open('timer'); return fail('INVALID_ARGS', 'Na ile ustawić minutnik? Otworzyłem Minutnik.'); }
    const lab = label || 'Minutnik', same = J.timers.find(lab) && J.norm(J.timers.find(lab).label) === J.norm(lab) ? J.timers.find(lab) : null, prev = same ? { left: same.left(), label: same.label } : null;
    const t = J.timers.start(Math.round(seconds), lab); showIf(show, 'timer');
    const others = J.timers.all().length - 1;
    return ok({ seconds: Math.round(seconds), label: t.label, ends: new Date(t.end).toISOString(), running: J.timers.all().length }, 'Minutnik' + (lab !== 'Minutnik' && !/^Minutnik /.test(lab) ? ' „' + lab + '”' : '') + ' ustawiony na ' + J.timer.fmt(seconds * 1000) + '.' + (others ? ' Działa już ' + (others + 1) + ' minutników.' : ''), { highlight: 'timer' }, () => { t.stop(); if (prev) t.start(Math.max(1, Math.round(prev.left / 1000)), prev.label); });
  } });
R.add({ id: 'timer_control', group: 'Zadania i czas', label: 'Sterowanie minutnikiem', description: 'stop zatrzymuje minutnik, pause/resume wstrzymuje i wznawia, extend dodaje sekundy, status zwraca pozostały czas. label wybiera minutnik (domyślnie najbliższy końca).',
  args: { type: 'object', properties: { action: { type: 'string', enum: ['stop', 'pause', 'resume', 'extend', 'status'] }, seconds: { type: 'number', minimum: 1 }, label: { type: 'string' } }, required: ['action'] }, writes: ['timer'],
  examples: ['(zatrzymaj|wylacz|stop) minutnik', 'ile zostalo [minutnika|czasu]', 'przedluz minutnik o {seconds}', 'dodaj do minutnika {seconds}', 'wstrzymaj minutnik', 'wznow minutnik'],
  parse(raw, n) { let m; if ((m = /^(zatrzymaj|wylacz|stop|anuluj|przerwij)\s+(minutnik|odliczanie|timer)(?:\s+(.+))?$/.exec(n))) return { args: { action: 'stop', ...(m[3] ? { label: raw.slice(n.indexOf(m[3])) } : {}) }, score: 10 }; if (/^(wstrzymaj|pauza) (minutnik|odliczanie)/.test(n)) return { args: { action: 'pause' }, score: 12 }; if (/^(wznow|kontynuuj) (minutnik|odliczanie)/.test(n)) return { args: { action: 'resume' }, score: 12 }; if (/^ile (zostalo|czasu)/.test(n)) return { args: { action: 'status' }, score: 10 }; if (/^(przedluz|dodaj do) minutnik/.test(n)) { const s = J.nlp.duration(raw); return s ? { args: { action: 'extend', seconds: s }, score: 10 } : null; } return null; },
  run({ action, seconds, label }) {
    const all = J.timers.all(), t = label ? J.timers.find(label) : all.slice().sort((a, b) => a.left() - b.left())[0];
    if (action === 'status') return all.length ? ok({ timers: all.map(x => ({ label: x.label, left_s: Math.round(x.left() / 1000), paused: x.paused })) }, all.map(x => x.label + ': zostało ' + x.fmt(x.left()) + (x.paused ? ' (wstrzymany)' : '')).join('; ') + '.') : ok({ timers: [] }, 'Minutnik nie działa.');
    if (!t) return fail('NOT_FOUND', label ? 'Nie ma minutnika „' + label + '”.' : 'Minutnik nie jest uruchomiony.');
    if (action === 'stop') { const l = t.label, left = t.left(), pomo = t.pomo; t.stop(); return ok({ label: l }, 'Zatrzymałem minutnik ' + l + '.', null, () => { t.start(Math.max(1, Math.round(left / 1000)), l, { pomo }); }); }
    if (action === 'pause') { t.pause(); return ok({ label: t.label }, 'Wstrzymałem: ' + t.label + ' (zostało ' + t.fmt(t.left()) + ').', null, () => t.resume()); }
    if (action === 'resume') { t.resume(); return ok({ label: t.label }, 'Wznowiłem: ' + t.label + '.', null, () => t.pause()); }
    const add = seconds || 60; t.extend(add); return ok({ left_s: Math.round(t.left() / 1000) }, 'Przedłużyłem o ' + t.fmt(add * 1000) + ', zostało ' + t.fmt(t.left()) + '.', null, () => { if (t.running) { t.end -= add * 1000; t.total -= add * 1000; J.emit('timer'); } });
  } });
R.add({ id: 'get_datetime', group: 'Zadania i czas', label: 'Data i godzina', description: 'Zwraca aktualną datę, godzinę, dzień tygodnia i strefę czasową.', idempotent: true,
  examples: ['ktora [jest] godzina', 'jaki [jest] (dzis|dzisiaj) dzien', 'jaka [jest] [dzis] data', 'podaj godzine', 'jaki mamy dzien', 'jaki [jest] (dzis|dzisiaj) dzien tygodnia'],
  run() { const d = new Date(); return ok({ iso: d.toISOString(), local: d.toLocaleString('pl-PL'), weekday: d.toLocaleDateString('pl-PL', { weekday: 'long' }), tz: Intl.DateTimeFormat().resolvedOptions().timeZone }, 'Jest ' + d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) + ', ' + d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + '.'); } });

/* =================== PULPIT, WIDGETY, WYGLĄD =================== */
R.add({ id: 'create_widget', group: 'Pulpit i widgety', label: 'Nowy widget', description: 'Tworzy widget na pulpicie: note (tekst), list (pozycje do odhaczania), result (wynik zadania).', writes: ['widgets'],
  args: { type: 'object', properties: { type: { type: 'string', enum: ['note', 'list', 'result'] }, title: { type: 'string', maxLength: 60 }, content: { type: 'string' }, items: { type: 'array', items: { type: 'string' } } }, required: ['type', 'title'] },
  examples: ['dodaj widget {title}', 'nowy widget (notatka|lista|wynik) {title}', 'stworz liste {title}', 'nowa lista {title}', 'utworz widget {title}'],
  parse(raw, n) { let m; if ((m = /^(?:stworz|utworz|nowa|zrob)\s+liste\s+(.+)$/.exec(n))) { const t = raw.slice(n.indexOf(m[1])); const [title, rest] = t.split(/:\s*/); return { args: { type: 'list', title: title.trim(), items: rest ? rest.split(/,|;/).map(s => s.trim()).filter(Boolean) : [] }, score: 15 }; } if ((m = /^(?:dodaj|nowy|utworz|stworz|zrob)\s+widget\s+(?:z\s+(?=notatk|list|wynik))?(?:(notatk\w*|list\w*|wynik\w*)(?=[\s:]|$)\s*:?\s*)?(.*)$/.exec(n))) {
      /* „dodaj widget z listą: mleko, chleb” → lista z pozycjami; „… lista Zakupy: a, b” → tytuł + pozycje; „… notatka Tytuł: treść” */
      const type = !m[1] ? 'note' : m[1].startsWith('notatk') ? 'note' : m[1].startsWith('list') ? 'list' : 'result';
      const rest = m[2] ? raw.replace(/[?!.]+$/, '').slice(n.indexOf(m[2])).trim() : '', c = rest.indexOf(':');
      if (type === 'list') { const [t, its] = c >= 0 ? [rest.slice(0, c), rest.slice(c + 1)] : /,|;/.test(rest) ? ['', rest] : [rest, '']; return { args: { type, title: t.trim() || 'Lista', items: its.split(/,|;|\s+i\s+/).map(x => x.trim()).filter(Boolean) }, score: 12 }; }
      if (c > 0 && type === 'note') return { args: { type, title: rest.slice(0, c).trim(), content: rest.slice(c + 1).trim() }, score: 12 };
      return { args: { type, title: rest || 'Widget' }, score: 12 };
    } return null; },
  run({ type, title, content, items }) { const w = J.widgets.create(type, { title, content, items }); return ok({ id: w.id, type, title: w.title }, 'Utworzyłem widget „' + w.title + '”.', { highlight: 'w:' + w.id }, () => { J.widgets.remove(w.id); }); } });
R.add({ id: 'widgets_list', group: 'Pulpit i widgety', label: 'Lista widgetów', description: 'Zwraca widgety na pulpicie z id, typem, tytułem i skrótem treści.', idempotent: true, reads: ['widgets'], palette: false,
  examples: ['jakie mam widgety', 'lista widgetow'],
  run() { const l = J.widgets.list.map(w => ({ id: w.id, type: w.type, title: w.title, preview: w.type === 'list' ? w.data.items.length + ' pozycji, ' + w.data.items.filter(i => i.done).length + ' odhaczonych' : cut(w.data.text || '', 80) })); return ok({ widgets: l }, l.length ? 'Widgety: ' + l.map(w => '„' + w.title + '” (' + w.type + ')').join(', ') + '.' : 'Brak widgetów na pulpicie.'); } });
R.add({ id: 'widgets_update', group: 'Pulpit i widgety', label: 'Zmień widget', description: 'Zmienia tytuł, treść (note/result) lub dodaje/odhacza pozycje listy (add_items, check_item).', writes: ['widgets'],
  args: { type: 'object', properties: { widget: { type: 'string', description: 'id lub tytuł' }, title: { type: 'string' }, content: { type: 'string' }, add_items: { type: 'array', items: { type: 'string' } }, check_item: { type: 'string' }, uncheck_item: { type: 'string' } }, required: ['widget'] },
  examples: ['dodaj do listy {widget} {add_items}', 'odhacz na liscie {widget} {check_item}'],
  run({ widget, title, content, add_items, check_item, uncheck_item }) {
    const q = norm(widget), w = J.widgets.list.find(x => x.id === widget) || J.widgets.list.find(x => norm(x.title).includes(q)); if (!w) return fail('NOT_FOUND', 'Nie ma widgetu „' + widget + '”. ' + (J.widgets.list.length ? 'Dostępne: ' + J.widgets.list.map(x => '„' + x.title + '”').join(', ') : ''));
    const snap = JSON.parse(JSON.stringify({ title: w.title, data: w.data })); if (title) w.title = title; if (content != null && w.type !== 'list') w.data.text = content;
    if (w.type === 'list') { (add_items || []).forEach(t => w.data.items.push({ text: String(t), done: false })); [[check_item, true], [uncheck_item, false]].forEach(([q2, v]) => { if (!q2) return; const it = w.data.items.find(i => norm(i.text).includes(norm(q2))); if (it) it.done = v; }); }
    J.save(); J.widgets.refresh(w.id); return ok({ id: w.id, title: w.title }, 'Zaktualizowałem widget „' + w.title + '”.', { highlight: 'w:' + w.id }, () => { w.title = snap.title; w.data = snap.data; J.save(); J.widgets.refresh(w.id); });
  } });
R.add({ id: 'widgets_remove', group: 'Pulpit i widgety', label: 'Usuń widget', description: 'Usuwa (zamyka ✕) widget z pulpitu — „zamknij widget” to właśnie to polecenie (zwijanie do paska to widget_collapse). widget="all" — wszystkie widgety naraz, jedno potwierdzenie. Można cofnąć („Cofnij”).', risk: 'confirm', confirmText: a => a.widget === 'all' ? 'Usunąć wszystkie widgety z pulpitu (' + J.widgets.list.length + ')?' : 'Usunąć widget „' + (J.widgets.list.find(x => x.id === a.widget)?.title || a.widget) + '”?', writes: ['widgets'],
  args: { type: 'object', properties: { widget: { type: 'string', description: 'id albo tytuł; "all" = wszystkie' } }, required: ['widget'] },
  examples: ['usun widget {widget}', 'zamknij widget {widget}'],
  parse(raw, n) { return /^(zamknij|usun|skasuj|wyczysc|posprzataj)\s+(wszystkie\s+widgety|widgety)(\s+(na|z)\s+pulpi\w*)?$/.test(n) ? { args: { widget: 'all' }, score: 40 } : null; },
  run({ widget }) {
    if (widget === 'all') {
      const all = J.widgets.list.map(w => ({ w, copy: JSON.parse(JSON.stringify(w)), pos: J.state.winPos['w:' + w.id] ? { ...J.state.winPos['w:' + w.id] } : null }));
      if (!all.length) return fail('NOT_FOUND', 'Na pulpicie nie ma widgetów.');
      all.forEach(x => J.widgets.remove(x.w.id, { silent: true }));
      return ok({ ids: all.map(x => x.w.id) }, 'Usunąłem wszystkie widgety (' + all.length + '): ' + all.map(x => '„' + x.w.title + '”').join(', ') + '.', null, () => all.forEach(x => J.widgets.restoreOne(x.copy, x.pos)));
    } const q = norm(widget), w = J.widgets.list.find(x => x.id === widget) || J.widgets.list.find(x => norm(x.title).includes(q)); if (!w) return fail('NOT_FOUND', 'Nie ma widgetu „' + widget + '”.'); const copy = JSON.parse(JSON.stringify(w)), pos = J.state.winPos['w:' + w.id] ? { ...J.state.winPos['w:' + w.id] } : null; J.widgets.remove(w.id, { silent: true }); return ok({ id: w.id }, 'Usunąłem widget „' + w.title + '”.', null, () => J.widgets.restoreOne(copy, pos)); } });
/* Artefakty testów E2E mostu (bridge/tests) mają zastrzeżone nazwy. Testy działają na żywej karcie i nie mogą kliknąć „Tak”,
   więc bez tego polecenia zostawiały na pulpicie użytkownika widgety i notatki „__E2E_LEFTOVER_*”. Usuwa WYŁĄCZNIE takie nazwy. */
const E2E_ARTIFACT = /^(__E2E_LEFTOVER_|E2E drill widget \d{10,}$|E2E test note \d{10,}$)/;
R.add({ id: 'e2e_cleanup', group: 'Pulpit i widgety', label: 'Sprzątanie po testach', description: 'Usuwa wyłącznie artefakty automatycznych testów mostu (widgety i notatki o nazwach „__E2E_LEFTOVER_…”, „E2E drill widget <liczba>”, „E2E test note <liczba>”). Niczego innego nie dotyka, dlatego nie pyta o zgodę.', idempotent: true, writes: ['widgets', 'notes'], voice: false, palette: false,
  args: { type: 'object', properties: {} },
  run() {
    const ws = J.widgets.list.filter(w => E2E_ARTIFACT.test(String(w.title || '')));
    ws.forEach(w => J.widgets.remove(w.id, { silent: true }));
    const ns = J.state.notes.filter(n => E2E_ARTIFACT.test(String(n.title || '')));
    ns.forEach(n => J.notes.remove(n.id));
    return ok({ widgets: ws.length, notes: ns.length }, ws.length + ns.length ? 'Usunąłem artefakty testów: ' + ws.length + ' widgetów, ' + ns.length + ' notatek.' : 'Brak artefaktów testów.');
  } });
R.add({ id: 'add_shortcut', group: 'Pulpit i widgety', label: 'Skrót na pulpicie', description: 'Dodaje ikonę skrótu do aplikacji (app) lub strony WWW (url).', writes: ['shortcuts'],
  args: { type: 'object', properties: { name: { type: 'string', maxLength: 40 }, app: { type: 'string', enum: APP_IDS }, url: { type: 'string' } }, required: ['name'] },
  examples: ['dodaj skrot {name}', 'utworz skrot do {name}', 'nowa ikona {name}'],
  parse(raw, n) { const m = /^(?:dodaj|utworz|stworz|nowy|nowa)\s+(?:skrot|ikone|ikona)\s*(?:do)?\s*(.*)$/.exec(n); if (!m) return null; const rest = raw.slice(n.indexOf(m[1] || '') || raw.length).trim(); const url = /([a-z0-9-]+\.[a-z]{2,}(?:\/\S*)?)/i.exec(rest)?.[1]; const app = findApp(rest); const name = rest.replace(url || '', '').trim() || (app ? APP_NAMES[app] : url) || 'Nowy skrót'; return { args: { name, app: app || undefined, url: url || undefined }, score: 12 }; },
  run({ name, app, url }) { if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url; const s = J.shortcuts.add(name, app ? { app } : url ? { url } : {}); return ok({ id: s.id, name: s.name, app: s.app, url: s.url }, 'Skrót „' + s.name + '” jest na pulpicie.', { highlight: 'sc:' + s.id }, () => { J.shortcuts.remove(s.id); }); } });
R.add({ id: 'shortcut_remove', group: 'Pulpit i widgety', label: 'Usuń skrót', description: 'Usuwa skrót z pulpitu (wymaga potwierdzenia).', risk: 'confirm', writes: ['shortcuts'],
  args: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }, examples: ['usun skrot {name}', 'usun ikone {name}'],
  run({ name }) { const q = norm(name), s = J.state.shortcuts.find(x => x.id === name || norm(x.name).includes(q)); if (!s) return fail('NOT_FOUND', 'Nie ma skrótu „' + name + '”.'); const idx = J.state.shortcuts.indexOf(s); J.shortcuts.remove(s.id); return ok({ id: s.id }, 'Usunąłem skrót „' + s.name + '”.', null, () => { if (!J.state.shortcuts.some(x => x.id === s.id)) { J.state.shortcuts.splice(idx, 0, s); J.save(); J.emit('shortcuts'); } }); } });
/* precheck (registry.run): sprawdź, czy obiekt istnieje i jest jednoznaczny, ZANIM padnie pytanie o zgodę */
const findW = q => { const n = norm(q); return n ? (J.widgets.list.find(x => x.id === q) || J.widgets.list.find(x => norm(x.title).includes(n))) : null; };
R.get('notes_delete').precheck = async a => (await findNote(a.note)).err || null;
R.get('tasks_remove').precheck = async a => (await findTask(a.task)).err || null;
R.get('widgets_remove').precheck = a => a.widget === 'all' ? (J.widgets.list.length ? null : fail('NOT_FOUND', 'Na pulpicie nie ma widgetów.')) : findW(a.widget) ? null : fail('NOT_FOUND', 'Nie ma widgetu „' + a.widget + '”.' + (J.widgets.list.length ? ' Są: ' + J.widgets.list.slice(0, 8).map(w => '„' + w.title + '”').join(', ') + '.' : ' Na pulpicie nie ma widgetów.'));
R.get('shortcut_remove').precheck = a => { const n = norm(a.name); return n && J.state.shortcuts.some(x => x.id === a.name || norm(x.name).includes(n)) ? null : fail('NOT_FOUND', 'Nie ma skrótu „' + a.name + '”.'); };
R.add({ id: 'set_theme', group: 'Pulpit i widgety', label: 'Motyw kolorystyczny', description: 'Zmienia kolor akcentu interfejsu.', idempotent: true, writes: ['settings'],
  args: { type: 'object', properties: { color: { type: 'string', enum: Object.keys(J.THEMES) } }, required: ['color'] },
  examples: ['motyw {color}', 'ustaw motyw {color}', 'zmien motyw na {color}', 'kolor {color}', 'ustaw akcent {color}', 'zmien kolor na {color}', 'nastepny motyw'],
  parse(raw, n) { if (/^(nastepny|kolejny|inny) (motyw|kolor)$/.test(n)) { const keys = Object.keys(J.THEMES), cur = keys.findIndex(k => J.THEMES[k][0] === J.state.settings.accent); return { args: { color: keys[(cur + 1) % keys.length] } }; } return null; },
  run({ color }) { const t = J.THEMES[color], prev = { accent: J.state.settings.accent, accent2: J.state.settings.accent2 }; Object.assign(J.state.settings, { accent: t[0], accent2: t[1] }); J.applyTheme(); J.save(); J.emit('settings'); return ok({ color }, 'Motyw: ' + color + '.', null, () => { Object.assign(J.state.settings, prev); J.applyTheme(); J.save(); J.emit('settings'); }); } });
R.add({ id: 'set_wallpaper', group: 'Pulpit i widgety', label: 'Tapeta', description: 'Zmienia tapetę: photo (jezioro w górach), aurora, void (pustka). Bez argumentu — następna.', idempotent: true, writes: ['settings'],
  args: { type: 'object', properties: { wallpaper: { type: 'string', enum: ['photo', 'aurora', 'void'] } } },
  examples: ['tapeta {wallpaper}', 'zmien tapete [na] {wallpaper}', 'zmien tapete', 'nastepna tapeta', 'ustaw tapete {wallpaper}'],
  run({ wallpaper }) { const order = ['photo', 'aurora', 'void'], s = J.state.settings, prev = s.wall; s.wall = wallpaper || order[(order.indexOf(s.wall) + 1) % order.length]; J.applyTheme(); J.save(); return ok({ wallpaper: s.wall }, 'Tapeta: ' + ({ photo: 'jezioro w górach', aurora: 'aurora', void: 'pustka' })[s.wall] + '.', null, () => { s.wall = prev; J.applyTheme(); J.save(); }); } });
R.add({ id: 'focus_mode', group: 'Pulpit i widgety', label: 'Tryb skupienia', description: 'Włącza/wyłącza tryb skupienia (minimalizuje okna, wycisza tło).', idempotent: true, writes: ['ui'],
  args: { type: 'object', properties: { on: { type: 'boolean' } }, required: ['on'] },
  examples: ['tryb skupienia', 'wlacz (tryb skupienia|skupienie|focus)', 'wylacz (tryb skupienia|skupienie|focus)', 'skup sie'],
  parse(raw, n) { return /(skupieni|focus|skup sie)/.test(n) ? { args: { on: !/wylacz|wyłącz|koniec/.test(n) } } : null; },
  run({ on }) { J.setFocus(on); return ok({ on }, on ? 'Tryb skupienia włączony.' : 'Tryb skupienia wyłączony.'); } });

/* =================== DANE =================== */
R.add({ id: 'get_weather', group: 'Dane', label: 'Pogoda', description: 'Aktualna pogoda i prognoza (Open-Meteo). Bez miasta — lokalizacja użytkownika. show=false nie otwiera okna.', idempotent: true, reads: ['internet'],
  args: { type: 'object', properties: { city: { type: 'string' }, days: { type: 'integer', minimum: 1, maximum: 6 }, show: { type: 'boolean' } } },
  examples: ['[jaka jest] pogoda', 'pogoda w {city}', 'jaka [jest] pogoda w {city}', 'czy bedzie padac', 'czy pada', 'jaka [jest] temperatura', 'prognoza [pogody]', 'prognoza na {city}', 'jak jest na dworze'],
  parse(raw, n) { if (!/(pogod|temperatur|na dworze|padac|pada\b|prognoz|cieplo|zimno)/.test(n)) return null; if (/(wieksz|mniejsz|na ekranie|okno|okien|zamknij|potrzebuj|przesun|przypnij|obok siebie)/.test(n)) return null; /* zdanie o oknie Pogody, nie o pogodzie */ const c = /\b(?:w|we|dla|na)\s+([a-z\- ]{3,})$/.exec(n); const cn = c ? c[1].replace(/\s+(?:i|oraz|a|czy|bo|ze|zeby|potem|teraz|dzis|dzisiaj|jutro|rano|wieczorem|w nocy|w weekend)\b.*$/, '').trim() : ''; const city = cn.length >= 3 ? raw.slice(n.lastIndexOf(cn), n.lastIndexOf(cn) + cn.length).trim() : undefined; return { args: { city }, score: 5 }; },
  async run({ city, days = 2, show }, { ctx }) { const d = await J.weather.get(city || undefined); showIf(show, 'weather', city || undefined); const dl = d.daily, fc = dl.time.slice(1, 1 + days).map((t, i) => ({ date: t, code: dl.weather_code[i + 1], desc: J.wxInfo(dl.weather_code[i + 1])[1], min: Math.round(dl.temperature_2m_min[i + 1]), max: Math.round(dl.temperature_2m_max[i + 1]), rain: dl.precipitation_probability_max[i + 1] })); const hours = d.hourly?.time ? d.hourly.time.map((t, i) => ({ time: t.slice(11, 16), temp: Math.round(d.hourly.temperature_2m[i]), desc: J.wxInfo(d.hourly.weather_code?.[i])[1] })) : []; return ok({ city: d.city, now: { temp: Math.round(d.current.temperature_2m), feels: Math.round(d.current.apparent_temperature), desc: J.wxInfo(d.current.weather_code)[1], wind: Math.round(d.current.wind_speed_10m), humidity: d.current.relative_humidity_2m, is_day: d.current.is_day }, forecast: fc, hours, units: d.units || { temp: '°C', wind: 'km/h' }, ...(d.stale ? { stale: true, fetched: new Date(d.fetched).toISOString() } : {}) }, (d.stale ? '(dane z ' + new Date(d.fetched).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) + ', brak sieci) ' : '') + J.weather.describe(d)); } });
R.add({ id: 'get_crypto_prices', group: 'Dane', label: 'Kursy krypto', description: 'Aktualne kursy walut z listy obserwowanych (domyślnie BTC, ETH, SOL, BNB) w USD ze zmianą 24h i krótkim wykresem (spark, 24 punkty) — CoinGecko / Binance.', idempotent: true, reads: ['internet'],
  args: { type: 'object', properties: { symbol: { type: 'string', description: 'symbol z listy obserwowanych, np. BTC, ETH' }, show: { type: 'boolean' } } },
  examples: ['kurs (bitcoina|btc|ethereum|eth|solany|sol|bnb)', 'ile kosztuje (bitcoin|ethereum|solana|bnb)', 'kursy krypto', 'krypto', 'rynek krypto', 'jak stoi bitcoin'],
  parse(raw, n) { if (!/(bitcoin|btc|ethereum|\beth\b|solan|\bsol\b|\bbnb\b|krypto|kurs)/.test(n) || /widge|kafel|karte|wykres|obserwowan/.test(n)) return null; const symbol = /bitcoin|btc/.test(n) ? 'BTC' : /ethereum|\beth\b/.test(n) ? 'ETH' : /solan|\bsol\b/.test(n) ? 'SOL' : /\bbnb\b/.test(n) ? 'BNB' : undefined; return { args: { symbol }, score: 5 }; },
  async run({ symbol, show }) { await J.market.ensure(); showIf(show, 'market'); const rows = J.market.COINS.map(c => { const d = J.market.data[c.sym]; return { symbol: c.sym, name: c.name, usd: d.price, change_24h: +d.chg.toFixed(2), live: !!d.live, stale: !!d.stale, spark: (d.spark || []).filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 24)) === 0).slice(-24).map(v => +(+v).toPrecision(6)) }; }); const one = symbol && rows.find(r => r.symbol === String(symbol).toUpperCase()); if (symbol && !one) return fail('NOT_FOUND', 'Nie obserwuję „' + symbol + '”. Obserwowane: ' + rows.map(r => r.symbol).join(', ') + '. Dodaj: „dodaj ' + symbol + ' do obserwowanych”.'); const isStale = rows.some(r => r.stale); return ok({ source: J.market.source, prices: one ? [one] : rows }, (isStale ? '(ostatnie dane, brak sieci) ' : '') + (one ? one.name + ': ' + J.fmtMoney(one.usd) + ' (' + (one.change_24h >= 0 ? '+' : '') + one.change_24h + '% 24h).' : 'Kursy (USD, 24h): ' + J.market.summary() + '.')); } });
R.add({ id: 'market_watch', group: 'Dane', label: 'Alert kursu', description: 'Ustawia alert: gdy kurs symbolu przekroczy (above) lub spadnie poniżej (below) progu USD, Jarvis powiadomi. Bez progu — lista alertów.', writes: ['alerts'], risk: 'confirm',
  confirmText: a => 'Ustawić alert ' + (a.symbol || 'kursu') + ' gdy ' + (a.direction === 'below' ? 'spadnie poniżej ' : 'przekroczy ') + J.fmtMoney(a.price || 0) + '? (powiadomienie push / dźwięk)',
  args: { type: 'object', properties: { symbol: { type: 'string', description: 'symbol, np. BTC' }, direction: { type: 'string', enum: ['above', 'below'] }, price: { type: 'number', minimum: 0 }, remove: { type: 'boolean' }, silent: { type: 'boolean', description: 'true = bez pytania (cron, drill, signal triggers); wymaga explicit zgody w kodzie' } } },
  prepare(args) { return { trusted: args && args.silent === true }; },
  examples: ['powiadom gdy (bitcoin|btc|eth|ethereum|sol|solana|bnb) (przekroczy|spadnie ponizej) {price}', 'alert (bitcoin|btc|eth|sol|bnb) {price}', 'jakie mam alerty'],
  parse(raw, n) { if (/^jakie mam alerty/.test(n)) return { args: {} }; const m = /(bitcoin|btc|ethereum|eth|solana|sol|bnb).*?(przekroczy|powyzej|wzrosnie|spadnie|ponizej).*?(\d[\d\s.,]*)\s*(k|tys)?/.exec(n); if (!m || !/alert|powiadom|daj znac|ostrzez/.test(n)) return null; const symbol = /bitcoin|btc/.test(m[1]) ? 'BTC' : /eth/.test(m[1]) ? 'ETH' : /sol/.test(m[1]) ? 'SOL' : 'BNB'; let price = parseFloat(m[3].replace(/\s/g, '').replace(',', '.')); if (m[4]) price *= 1000; return { args: { symbol, direction: /spadnie|ponizej/.test(m[2]) ? 'below' : 'above', price }, score: 10 }; },
  run({ symbol, direction, price, remove }) { const al = J.state.alerts = J.state.alerts || []; if (!symbol || price == null) { return ok({ alerts: al }, al.length ? 'Alerty: ' + al.map(a => a.symbol + ' ' + (a.direction === 'above' ? '>' : '<') + ' ' + J.fmtMoney(a.price)).join(', ') + '.' : 'Brak alertów kursów.'); } if (remove) { J.state.alerts = al.filter(a => !(a.symbol === symbol && a.price === price)); J.save(); return ok(null, 'Usunąłem alert.'); } const alert = { id: J.uid(), symbol, direction: direction || 'above', price, ts: Date.now() }; al.push(alert); J.save(); J.market.subscribeBackground?.(); return ok({ symbol, direction, price }, 'Dam znać, gdy ' + symbol + ' ' + (direction === 'below' ? 'spadnie poniżej ' : 'przekroczy ') + J.fmtMoney(price) + '.', null, () => { J.state.alerts = (J.state.alerts || []).filter(a => a !== alert); J.save(); }); } });
R.add({ id: 'calculate', group: 'Dane', label: 'Oblicz', description: 'Dokładnie liczy wyrażenie (+ - * / ^ % nawiasy sqrt sin cos log ln pi) i procenty.', idempotent: true,
  args: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'] },
  examples: ['oblicz {expression}', 'policz {expression}', 'ile to {expression}', 'ile jest {expression}', 'ile wynosi {expression}'],
  sure: a => /^[\d\s+\-*/().,%^x×÷]+$/.test(String(a.expression).replace(/razy|podzielone przez|przez|plus|minus|do potegi|\bz\b|\bod\b/g, '')),   // „ile to jest sto tysięcy dolarów…” to rozmowa, nie rachunek
  parse(raw, n) { let m; if ((m = /(\d+(?:[.,]\d+)?)\s*%\s*(?:z|od)\s*(\d+(?:[.,]\d+)?)/.exec(n))) return { args: { expression: m[1] + '/100*' + m[2] }, score: 10 }; if (/[\d)]\s*[-+*/^x×÷]\s*[\d(]/.test(n) && /^[\d\s+\-*/().,%^x×÷]+$/.test(n)) return { args: { expression: n }, score: 8 }; return null; },
  run({ expression }) { const expr = expression.replace(/\s*razy\s*/g, '*').replace(/\s*(przez|podzielone przez)\s*/g, '/').replace(/\s*plus\s*/g, '+').replace(/\s*minus\s*/g, '-').replace(/\s*do potegi\s*/g, '^').replace(/(\d+(?:[.,]\d+)?)\s*%\s*(?:z|od)\s*(\d+(?:[.,]\d+)?)/, '$1/100*$2'); try { const r = J.calc(expr); return ok({ expression: expr, result: r }, expr + ' = ' + r); } catch (e) { return fail('INVALID_ARGS', 'Nie umiem policzyć „' + expression + '”: ' + e.message); } } });
R.add({ id: 'open_url', group: 'Dane', label: 'Otwórz stronę', description: 'Otwiera stronę WWW w nowej karcie. Znane serwisy: ' + Object.keys(SITES).join(', ') + '. Adresy spoza listy zaufanych wymagają potwierdzenia.', writes: ['browser'], risk: 'confirm', confirmText: a => 'Otworzyć ' + a.url + '?',
  args: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
  examples: ['otworz strone {url}', 'wejdz na {url}', 'otworz (youtube|google|github|gmail|spotify|netflix|wikipedia|mapy|reddit|allegro|linkedin)'],
  parse(raw, n) { const v = /^(otworz|uruchom|wejdz na|pokaz|odpal|idz do)\s+(.+)$/.exec(n); if (!v) return null; const t = v[2].trim(); if (findApp(t) && t.split(' ').length <= 2) return null; const site = Object.keys(SITES).find(k => new RegExp('^(?:strone\\s+|serwis\\s+)?' + k + '(?:\\.com|\\.pl)?$').test(t)); if (site) return { args: { url: SITES[site] }, score: 8 }; const dom = /^(?:strone\s+)?([a-z0-9-]+\.[a-z]{2,}\S*)$/.exec(t); return dom ? { args: { url: dom[1] }, score: 8 } : null; },
  run({ url }, { ctx }) { if (!/^https?:\/\//i.test(url)) url = 'https://' + url; let host; try { host = new URL(url).hostname; } catch (e) { return fail('INVALID_ARGS', 'Nieprawidłowy adres: ' + url); } const w = window.open(url, '_blank', 'noopener'); if (w === null) { J.chat?.add('action', '🔗 Kliknij, aby otworzyć: ' + url); J.chat?.link?.(url); return ok({ url, opened: false }, 'Przeglądarka zablokowała nową kartę — w czacie jest link do kliknięcia.'); } return ok({ url, opened: true }, 'Otworzyłem ' + host + '.'); } });
// zaufane domeny nie wymagają potwierdzenia (registry.run sprawdza prepare().trusted)
R.get('open_url').prepare = args => { try { const host = new URL(/^https?:\/\//i.test(args.url) ? args.url : 'https://' + args.url).hostname.replace(/^www\./, ''); return { trusted: TRUSTED.has(host) || TRUSTED.has('www.' + host) }; } catch (e) { return { trusted: false }; } };
R.add({ id: 'web_search', group: 'Dane', label: 'Szukaj w Google', description: 'Otwiera wyszukiwanie Google z zapytaniem w nowej karcie.', writes: ['browser'],
  args: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  examples: ['wyszukaj {query}', 'szukaj {query}', 'wygoogluj {query}', 'google {query}', 'znajdz w internecie {query}'],
  run({ query }) { const url = 'https://www.google.com/search?q=' + encodeURIComponent(query); const w = window.open(url, '_blank', 'noopener'); if (w === null) { J.chat?.link?.(url); return ok({ url, opened: false }, 'Link do wyszukiwania jest w czacie.'); } return ok({ url }, 'Szukam: ' + query + '.'); } });
R.add({ id: 'clipboard_write', group: 'Dane', label: 'Skopiuj do schowka', description: 'Kopiuje tekst do schowka systemowego.', idempotent: true,
  args: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }, examples: ['skopiuj {text}', 'skopiuj do schowka {text}'],
  async run({ text }) { try { await navigator.clipboard.writeText(text); return ok({ length: text.length }, 'Skopiowałem do schowka.'); } catch (e) { return fail('DENIED', 'Brak dostępu do schowka — przeglądarka wymaga zgody.'); } } });
R.add({ id: 'clipboard_read', group: 'Dane', label: 'Odczytaj schowek', description: 'Zwraca tekst ze schowka (wymaga zgody przeglądarki).', idempotent: true, reads: ['clipboard'], risk: 'confirm', confirmText: () => 'Pozwolić Jarvisowi odczytać schowek?',
  examples: ['co mam w schowku', 'odczytaj schowek', 'wklej ze schowka'],
  async run() { try { const t = await navigator.clipboard.readText(); return ok({ text: t }, t ? 'W schowku: ' + cut(t.replace(/\s+/g, ' '), 200) : 'Schowek jest pusty.'); } catch (e) { return fail('DENIED', 'Brak dostępu do schowka.'); } } });

/* =================== INTERFEJS =================== */
R.add({ id: 'get_status', group: 'Interfejs', label: 'Raport stanu', description: 'Pełny stan środowiska: okna, widgety, notatki, zadania, minutnik, skróty, połączenie, tryb agenta.', idempotent: true, reads: ['all'],
  examples: ['status', 'raport', 'stan systemu', 'jak sie masz', 'podsumuj dzien', 'co sie dzieje'],
  run() { const p = J.context.packet({ full: true, quiet: true }); const today = p.tasks.today; return ok(p, `Otwarte okna: ${J.wm.list().map(i => J.apps[i]?.title).filter(Boolean).join(', ') || 'brak'}. Widgety: ${J.widgets.list.length}. Notatki: ${J.state.notes.length}. Zadania dziś: ${today.filter(t => t.done).length}/${today.length}${p.tasks.overdue ? ', zaległe: ' + p.tasks.overdue : ''}. Minutnik: ${J.timer.running ? J.timer.label + ', zostało ' + J.timer.fmt(J.timer.left()) : 'nieaktywny'}. Hermes: ${p.conn.hermes}. Tryb: ${J.engine.mode}.`); } });
/* „odpal Jarvis OS”: przez most to narzędzie obsługuje najpierw sam most (otwiera kartę, gdy jej nie ma; wyciąga okno na wierzch),
   a karta tylko wchodzi do systemu (bridge.js → J.bootEnter) i raportuje stan */
R.add({ id: 'desktop_open', group: 'Interfejs', label: 'Uruchom Jarvis OS', description: 'Uruchamia Jarvis OS i wchodzi do systemu bez klikania: gdy żadna karta nie jest otwarta, otwiera ją w domyślnej przeglądarce; gdy jest — zdejmuje ekran „Kliknij, aby wejść” i wyciąga okno przeglądarki na wierzch. Używaj ZAWSZE na prośbę „odpal / otwórz / uruchom Jarvis OS” i zanim poprosisz użytkownika o kliknięcie. Zwraca: opened (nowa karta), booted, entered_now, focused (okno na wierzchu), windows.', idempotent: true, palette: false, voice: false,
  args: { type: 'object', properties: { focus: { type: 'boolean', description: 'wyciągnij okno przeglądarki na wierzch (domyślnie true)' } } },
  run() {
    J.bootEnter?.();
    const entered = J.bootVia === 'bridge' && Date.now() - (J.bootAt || 0) < 10000;
    const wins = J.wm.list().filter(k => !J.wm.isMin(k));
    return ok({ booted: !!J.booted || !J.bootEnter, entered_now: entered, visible: typeof document === 'undefined' || document.visibilityState !== 'hidden', windows: wins.length, chat_panel: !!J.chatPanel?.visible?.() },
      (entered ? 'Wszedłem do systemu (ekran startowy zdjęty). ' : 'Jarvis OS działa. ') + (wins.length ? 'Otwarte okna: ' + wins.length + '.' : 'Pulpit bez otwartych okien (czat to panel boczny, nie okno).'));
  } });
/* zrzut ekranu Jarvisa robi most (Windows: okno przeglądarki); strona sama siebie nie sfotografuje */
R.add({ id: 'desktop_screenshot', group: 'Interfejs', label: 'Zrzut ekranu Jarvis OS', description: 'Robi zrzut ekranu okna przeglądarki z Jarvis OS (scope=window, domyślnie) albo całego monitora, na którym stoi (scope=monitor), i zwraca ścieżkę PNG. Żeby wysłać obraz użytkownikowi (np. na Telegram), odpowiedz linią MEDIA:<ścieżka>. Używaj na prośby „pokaż / daj screena / załącz obraz z Jarvisa”.', idempotent: true, palette: false, voice: false,
  args: { type: 'object', properties: { scope: { type: 'string', enum: ['window', 'monitor'] } } },
  run() { return fail('UNSUPPORTED', 'Zrzut ekranu robi most Jarvisa (Hermes) — w samej przeglądarce użyj klawisza Print Screen.'); } });
R.add({ id: 'ui_highlight', group: 'Interfejs', label: 'Wskaż element', description: 'Podświetla element interfejsu, żeby pokazać go użytkownikowi: aplikację (np. notes), dock, rail, deck, chat, log, core, widget (w:id) lub skrót (sc:id).', idempotent: true, hermes: true, voice: false, palette: false,
  args: { type: 'object', properties: { target: { type: 'string' }, text: { type: 'string', description: 'krótki podpis' } }, required: ['target'] },
  run({ target, text }) { const r = J.ui.highlight(target, text); return r ? ok({ target }, 'Wskazałem ' + target + '.') : fail('NOT_FOUND', 'Nie ma elementu „' + target + '”.'); } });
R.add({ id: 'ui_narrate', group: 'Interfejs', label: 'Komunikat na Core', description: 'Krótki komunikat statusu na Core (np. "szukam w sieci…") bez wpisu w czacie; speak=true wypowiada go.', idempotent: true, voice: false, palette: false,
  args: { type: 'object', properties: { text: { type: 'string', maxLength: 120 }, speak: { type: 'boolean' } }, required: ['text'] },
  run({ text, speak }) { J.orb.banner(text); if (speak) J.voice.speak(text, { priority: 1 }); return ok(null, 'OK'); } });
R.add({ id: 'ui_toast', group: 'Interfejs', label: 'Powiadomienie', description: 'Pokazuje powiadomienie w interfejsie i zapisuje je w centrum powiadomień.', idempotent: true, voice: false, palette: false,
  args: { type: 'object', properties: { title: { type: 'string', maxLength: 60 }, body: { type: 'string', maxLength: 200 } }, required: ['title'] },
  run({ title, body }) { J.notice({ title, body, kind: 'agent' }); return ok(null, 'Pokazałem powiadomienie.'); } });
R.add({ id: 'ui_ask', group: 'Interfejs', label: 'Zapytaj użytkownika', description: 'Zadaje użytkownikowi pytanie z opcjami (szybkie odpowiedzi w czacie i głosem) i zwraca wybraną odpowiedź. Używaj przy dwuznaczności zamiast zgadywać.', hermes: true, voice: false, palette: false,
  args: { type: 'object', properties: { question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } } }, required: ['question'] },
  async run({ question, options }) { const a = await J.ask(question, options || [], { timeout: 90000, speak: true }); if (a == null) return fail('TIMEOUT', 'Użytkownik nie odpowiedział.'); return ok({ answer: a }, 'Użytkownik odpowiedział: ' + a); } });
R.add({ id: 'speak', group: 'Interfejs', label: 'Powiedz na głos', description: 'Wypowiada tekst syntezatorem mowy.', idempotent: true,
  args: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }, examples: ['powiedz {text}', 'przeczytaj {text}', 'wypowiedz {text}'],
  accept: (groups, n) => !J.isReport(n),
  run({ text }) { J.voice.speak(text, { force: true, priority: 1 }); return ok(null, '🔊 ' + text); } });
R.add({ id: 'sound_toggle', group: 'Interfejs', label: 'Dźwięki', description: 'Włącza/wyłącza dźwięki interfejsu i/lub mowę Jarvisa.', idempotent: true, writes: ['settings'],
  args: { type: 'object', properties: { sound: { type: 'boolean' }, speech: { type: 'boolean' } } },
  examples: ['(wylacz|wycisz) dzwieki', 'wlacz dzwieki', '(nie mow|badz cicho|wylacz mowe|przestan mowic)', '(mow|wlacz mowe|mozesz mowic)'],
  parse(raw, n) { if (/^(wylacz|wycisz)\s+dzwiek/.test(n)) return { args: { sound: false } }; if (/^wlacz\s+dzwiek/.test(n)) return { args: { sound: true } }; if (/^(nie mow|badz cicho|wylacz mowe|przestan mowic|cisza)/.test(n)) return { args: { speech: false } }; if (/^(mow|wlacz mowe|mozesz mowic|odezwij sie)/.test(n)) return { args: { speech: true } }; return null; },
  run({ sound, speech }) { const s = J.state.settings, prev = { sound: s.sound, speech: s.speech }; if (sound != null) s.sound = sound; if (speech != null) { s.speech = speech; if (!speech) J.voice.stop(); } J.save(); J.emit('settings'); return ok({ sound: s.sound, speech: s.speech }, 'Dźwięki: ' + (s.sound ? 'włączone' : 'wyciszone') + ', mowa: ' + (s.speech ? 'włączona' : 'wyłączona') + '.', null, () => { Object.assign(s, prev); J.save(); J.emit('settings'); }); } });
R.add({ id: 'settings_get', group: 'Interfejs', label: 'Ustawienia', description: 'Zwraca bieżące ustawienia (bez kluczy API, tokenów i sekretów).', idempotent: true, reads: ['settings'], palette: false,
  examples: ['jakie mam ustawienia', 'pokaz ustawienia'],
  run() { const s = {}; for (const [k, v] of Object.entries(J.state.settings)) if (!/(key|token|secret)$/i.test(k)) s[k] = v;   // żadne pole „…Key/…Token/…Secret” nie trafia do modelu
    return ok(s, 'Miasto: ' + s.city + ', motyw: ' + (Object.keys(J.THEMES).find(k => J.THEMES[k][0] === s.accent) || s.accent) + ', tapeta: ' + s.wall + ', dźwięki: ' + (s.sound ? 'tak' : 'nie') + ', mowa: ' + (s.speech ? 'tak' : 'nie') + ', proaktywność: ' + (s.proactive || 'quiet') + ', słowo wybudzające: ' + (s.wakeWord ? 'tak' : 'nie') + '.'); } });
R.add({ id: 'settings_set', group: 'Interfejs', risk: 'confirm', confirmText: a => 'Zmienić ustawienie „' + a.key + '” na „' + String(a.value).slice(0, 40) + '”?', label: 'Zmień ustawienie', description: 'Zmienia jedno ustawienie. Klucze: city, user, particles, sound, speech, skipBoot, proactive (quiet|active), wakeWord, quietFrom/quietTo (HH:MM), briefingTime (HH:MM lub ""), summaryTime, silentVoice.', writes: ['settings'],
  args: { type: 'object', properties: { key: { type: 'string', enum: ['city', 'user', 'particles', 'sound', 'speech', 'skipBoot', 'proactive', 'wakeWord', 'quietFrom', 'quietTo', 'briefingTime', 'summaryTime', 'silentVoice'] }, value: { type: 'string' } }, required: ['key', 'value'] },
  examples: ['ustaw miasto [na] {value}', 'zmien miasto na {value}', 'wlacz slowo wybudzajace', 'wylacz slowo wybudzajace', 'briefing o {value}', 'tryb proaktywny (aktywny|cichy)'],
  parse(raw, n) { let m; if ((m = /^(?:ustaw|zmien)\s+miasto\s+(?:na\s+)?(.+)$/.exec(n))) return { args: { key: 'city', value: raw.slice(n.indexOf(m[1])) } }; if ((m = /^(wlacz|wylacz)\s+slowo wybudzajace/.exec(n))) return { args: { key: 'wakeWord', value: m[1] === 'wlacz' ? 'true' : 'false' } }; if ((m = /^briefing o (.+)$/.exec(n))) return { args: { key: 'briefingTime', value: m[1] } }; if ((m = /^tryb proaktywny (aktywny|cichy)$/.exec(n))) return { args: { key: 'proactive', value: m[1] === 'aktywny' ? 'active' : 'quiet' } }; return null; },
  async run({ key, value }) {
    const s = J.state.settings, BOOL = ['particles', 'sound', 'speech', 'skipBoot', 'wakeWord', 'silentVoice'];
    if (key === 'city') { const g = await J.weather.geocode(value); Object.assign(s, { city: g.city, lat: g.lat, lon: g.lon }); J.weather.ts = 0; J.weather.fetch().catch(() => { }); J.save(); J.emit('settings'); return ok({ city: g.city }, 'Miasto: ' + g.city + '.'); }
    if (BOOL.includes(key)) { const b = /^(true|tak|1|on|wlacz)$/i.test(value); s[key] = b; J.save(); J.emit('settings'); return ok({ [key]: b }, key + ': ' + (b ? 'włączone' : 'wyłączone') + '.'); }
    if (key === 'proactive') { if (!/^(quiet|active|cichy|aktywny)$/.test(value)) return fail('INVALID_ARGS', 'proactive: quiet albo active'); s.proactive = /active|aktywny/.test(value) ? 'active' : 'quiet'; J.save(); J.emit('settings'); return ok({ proactive: s.proactive }, 'Proaktywność: ' + (s.proactive === 'active' ? 'aktywna' : 'cicha') + '.'); }
    if (/Time$|^quiet/.test(key)) { const t = value === '' ? '' : (J.nlp.time(value) || J.nlp.time('o ' + value)); if (t == null) return fail('INVALID_ARGS', key + ': podaj godzinę HH:MM albo pusty tekst.'); s[key] = t; J.save(); J.emit('settings'); J.routines?.reschedule(); return ok({ [key]: t }, key + ': ' + (t || 'wyłączone') + '.'); }
    if (key === 'user') { s.user = value.toUpperCase().slice(0, 3) || 'JD'; J.save(); J.emit('settings'); return ok({ user: s.user }, 'Inicjały: ' + s.user + '.'); }
    return fail('INVALID_ARGS', 'Nieznany klucz.');
  } });
R.add({ id: 'terminal_run', group: 'Interfejs', label: 'Polecenie terminala', description: 'Wykonuje wbudowane polecenie Terminala Jarvis OS i zwraca tekstowy wynik. Bez pytania działają tylko polecenia niezmieniające danych (help, ls, apps, calc, weather, crypto, date, whoami, echo, neofetch, open, say, theme); pozostałe (close, note, task, timer, ask, matrix, reboot) wymagają potwierdzenia użytkownika — do tego używaj dedykowanych narzędzi.', idempotent: false, risk: 'confirm', confirmText: a => 'Wykonać w terminalu: „' + String(a.command).slice(0, 60) + '”?',
  args: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] }, examples: ['wykonaj w terminalu {command}', 'terminal {command}'],
  async run({ command }) { const out = await J.terminalRun(command); return ok({ command, output: out }, cut(out.replace(/\s+/g, ' '), 300) || 'OK'); } });
R.add({ id: 'palette_open', group: 'Interfejs', label: 'Paleta poleceń', description: 'Otwiera paletę poleceń, opcjonalnie z wpisanym zapytaniem.', idempotent: true, hermes: false,
  args: { type: 'object', properties: { query: { type: 'string' } } }, examples: ['[otworz] palete [polecen]', 'szukaj polecen'],
  run({ query }) { J.palette.open(query); return ok(null, 'Paleta otwarta.'); } });
R.add({ id: 'notifications_open', group: 'Interfejs', label: 'Centrum powiadomień', description: 'Pokazuje centrum powiadomień (przypomnienia, sygnały, komunikaty).', idempotent: true,
  examples: ['[pokaz] powiadomienia', 'co mnie ominelo', 'centrum powiadomien'],
  run() { J.notifs.open(); const u = J.notifs.unread(); return ok({ unread: u, items: J.state.notifs.slice(0, 10) }, u ? 'Masz ' + u + ' ' + J.pl(u, 'nowe powiadomienie', 'nowe powiadomienia', 'nowych powiadomień') + '.' : 'Brak nowych powiadomień.'); } });
R.add({ id: 'help', group: 'Interfejs', label: 'Co potrafisz', description: 'Lista możliwości Jarvisa pogrupowana według dziedzin.', idempotent: true, hermes: false,
  examples: ['pomoc', 'help', 'co potrafisz', 'co umiesz', 'jakie masz (komendy|polecenia|mozliwosci)', 'komendy', 'jak ci pomoc'],
  run() { return ok({ groups: Object.fromEntries(Object.entries(R.groups()).map(([g, l]) => [g, l.map(c => c.label)])) }, 'Potrafię: ' + R.describe() + '.\n\nPodłącz Hermesa w Ustawieniach, a zrozumiem dowolne polecenie i połączę kilka kroków.'); } });

/* =================== PAMIĘĆ =================== */
R.add({ id: 'memory_remember', group: 'Pamięć', label: 'Zapamiętaj', description: 'Zapisuje trwały fakt o użytkowniku lub preferencję (np. "pracuję zdalnie", "lubię kawę o 9"). Fakty trafiają do kontekstu każdej rozmowy.', writes: ['memory'],
  args: { type: 'object', properties: { fact: { type: 'string', maxLength: 200 }, scope: { type: 'string', enum: ['profile', 'preference', 'project', 'other'] } }, required: ['fact'] },
  examples: ['zapamietaj [ze] {fact}', 'zapamietaj sobie {fact}', 'pamietaj [ze] {fact}'],
  async run({ fact, scope = 'other' }, { ctx }) {
    const trusted = ctx?.source === 'ui' || ctx?.source === 'local' || ctx?.confirmed === true || ctx?.approved === true;
    /* poufne dane z niezaufanego źródła (model, głos, Jev, most): pamięć trafia do KAŻDEJ rozmowy z modelem — nie zapisujemy.
       Wcześniej ta kontrola żyła tylko w pętli Hermesa w karcie (ai.js guardCall), a ścieżki Jev/most ją omijały. */
    if (!trusted && J.policy?.sensitive?.(fact)?.flagged) return fail('DENIED', 'Nie zapisuję poufnych danych (hasła, klucze, numery kart, PESEL) w pamięci, która trafia do każdej rozmowy z modelem. Jeśli naprawdę chcesz, wpisz to sam w Jarvisie: „zapamiętaj …”.');
    const had = (await J.memory.all()).some(x => J.norm(x.fact) === J.norm(fact)); const f = await J.memory.remember(fact, scope); return ok(f, 'Zapamiętałem: ' + fact + '.', null, had ? null : () => J.memory.forget(f.id)); } });
R.add({ id: 'memory_recall', group: 'Pamięć', label: 'Przypomnij fakty', description: 'Zwraca zapamiętane fakty pasujące do zapytania (bez zapytania — wszystkie).', idempotent: true, reads: ['memory'],
  args: { type: 'object', properties: { query: { type: 'string' } } }, examples: ['co o mnie wiesz', 'co pamietasz', 'co pamietasz o {query}'],
  async run({ query }) { const l = await J.memory.recall(query); return ok({ facts: l }, l.length ? 'Pamiętam: ' + l.map(f => f.fact).join('; ') + '.' : 'Nie mam jeszcze zapamiętanych faktów' + (query ? ' o „' + query + '”' : '') + '.'); } });
R.add({ id: 'memory_forget', group: 'Pamięć', label: 'Zapomnij', description: 'Usuwa zapamiętany fakt (po id lub fragmencie). Wymaga potwierdzenia.', risk: 'confirm', writes: ['memory'],
  args: { type: 'object', properties: { fact: { type: 'string' } }, required: ['fact'] }, examples: ['zapomnij [ze] {fact}', 'zapomnij o {fact}'],
  async run({ fact }) { const before = await J.memory.all(); const n = await J.memory.forget(fact); if (!n) return fail('NOT_FOUND', 'Nie znalazłem takiego faktu.'); const after = new Set((await J.memory.all()).map(f => f.id)), gone = before.filter(f => !after.has(f.id)); return ok({ removed: n }, 'Zapomniałem: ' + gone.map(f => f.fact).join('; ') + '.', null, async () => { for (const f of gone) await J.memory.remember(f.fact, f.scope); }); } });

/* =================== PLIKI (File System Access — Chromium) =================== */
const FS = J.files = {
  handle: null, supported: 'showDirectoryPicker' in window,
  async load() { if (!FS.supported) return null; try { FS.handle = await J.store.get('files.dir'); } catch (e) { } return FS.handle; },
  async ensure(prompt) { if (!FS.supported) throw Object.assign(new Error('Ta przeglądarka nie obsługuje dostępu do folderów (użyj Chrome/Edge).'), { code: 'UNSUPPORTED' }); if (!FS.handle) await FS.load(); if (!FS.handle) throw Object.assign(new Error('Nie wybrano folderu roboczego — kliknij „Wybierz folder” w Ustawieniach lub w czacie.'), { code: 'DENIED' }); const p = await FS.handle.queryPermission({ mode: 'readwrite' }); if (p !== 'granted') { if (!prompt) throw Object.assign(new Error('Brak uprawnień do folderu — kliknij „Odśwież dostęp” w Ustawieniach.'), { code: 'DENIED' }); const r = await FS.handle.requestPermission({ mode: 'readwrite' }); if (r !== 'granted') throw Object.assign(new Error('Odmówiono dostępu do folderu.'), { code: 'DENIED' }); } return FS.handle; },
  async pick() { const h = await window.showDirectoryPicker({ mode: 'readwrite' }); FS.handle = h; await J.store.set('files.dir', h); J.emit('files'); return h; },
  /* ścieżki względne w folderze roboczym („notatki/todo.md”); „..” i ścieżki bezwzględne są odrzucane */
  split(path) { const parts = String(path || '').replace(/\\/g, '/').split('/').filter(p => p && p !== '.'); if (parts.some(p => p === '..')) throw Object.assign(new Error('Ścieżka nie może wychodzić poza folder roboczy.'), { code: 'DENIED' }); return parts; },
  async dir(path) { let d = await FS.ensure(); for (const p of FS.split(path)) d = await d.getDirectoryHandle(p); return d; },
  async list(path) { const h = path ? await FS.dir(path) : await FS.ensure(); const out = []; for await (const [name, e] of h.entries()) out.push({ name, kind: e.kind }); return out.sort((a, b) => b.kind.localeCompare(a.kind) || a.name.localeCompare(b.name)); },
  async file(path) { const parts = FS.split(path), name = parts.pop(); const d = parts.length ? await FS.dir(parts.join('/')) : await FS.ensure(); return (await d.getFileHandle(name)).getFile(); },
  async read(name) { const f = await FS.file(name); if (f.size > 512 * 1024) throw new Error('Plik jest za duży (limit 512 KB).'); return await f.text(); },
  async write(name, text, append) { const parts = FS.split(name), fname = parts.pop(); const h = parts.length ? await FS.dir(parts.join('/')) : await FS.ensure(); const fh = await h.getFileHandle(fname, { create: true }); let prev = ''; if (append) { try { prev = await (await fh.getFile()).text(); } catch (e) { } } const w = await fh.createWritable(); await w.write((prev ? prev.replace(/\s+$/, '') + '\n' : '') + text); await w.close(); return name; }
};
R.add({ id: 'files_list', group: 'Pliki', label: 'Pliki w folderze', description: 'Lista plików w folderze roboczym Jarvisa (File System Access, Chrome/Edge).', idempotent: true, reads: ['files'],
  examples: ['[pokaz] [moje] pliki', 'co jest w folderze', 'lista plikow'],
  async run() { const l = await FS.list(); return ok({ folder: FS.handle?.name, files: l }, l.length ? 'Folder „' + FS.handle.name + '”: ' + l.slice(0, 12).map(f => f.name + (f.kind === 'directory' ? '/' : '')).join(', ') + (l.length > 12 ? '…' : '') + '.' : 'Folder jest pusty.'); } });
R.add({ id: 'files_read', group: 'Pliki', label: 'Przeczytaj plik', description: 'Zwraca treść pliku tekstowego z folderu roboczego.', idempotent: true, reads: ['files'],
  args: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }, examples: ['przeczytaj plik {name}', 'co jest w pliku {name}'],
  async run({ name }) { const t = await FS.read(name); return ok({ name, text: t }, name + ': ' + cut(t.replace(/\s+/g, ' '), 300)); } });
R.add({ id: 'files_write', group: 'Pliki', label: 'Zapisz plik', description: 'Zapisuje (lub dopisuje, append=true) tekst do pliku w folderze roboczym. Nadpisanie istniejącego pliku wymaga potwierdzenia.', writes: ['files'], risk: 'confirm', confirmText: a => (a.append ? 'Dopisać do pliku ' : 'Zapisać plik ') + a.name + '?',
  args: { type: 'object', properties: { name: { type: 'string' }, text: { type: 'string', maxLength: 500000 }, append: { type: 'boolean' } }, required: ['name', 'text'] }, examples: ['zapisz plik {name}: {text}', 'zapisz do pliku {name} {text}'],
  async run({ name, text, append }) { await FS.write(name, text, append); return ok({ name, bytes: text.length }, (append ? 'Dopisałem do ' : 'Zapisałem ') + name + '.'); } });
R.add({ id: 'files_export_note', group: 'Pliki', label: 'Eksportuj notatkę do pliku', description: 'Zapisuje notatkę jako plik .md w folderze roboczym.', writes: ['files'],
  args: { type: 'object', properties: { note: { type: 'string' } }, required: ['note'] }, examples: ['eksportuj notatke {note} [do pliku]', 'zapisz notatke {note} jako plik'],
  async run({ note }) { const f = await findNote(note); if (f.err) return f.err; const base = (f.note.title || 'notatka').replace(/[^\w\-ąćęłńóśźż ]/gi, '').trim() || 'notatka'; const taken = new Set((await FS.list()).map(x => x.name)); let name = base + '.md', k = 2; while (taken.has(name)) name = base + ' (' + (k++) + ').md'; await FS.write(name, '# ' + f.note.title + '\n\n' + f.note.body); return ok({ name }, 'Zapisałem „' + f.note.title + '” jako ' + name + '.'); } });

/* polecenia odwracalne (zwracają undo() w kopercie): tylko one mogą działać w autonomii A2 */
['create_note', 'notes_append', 'notes_update', 'add_task', 'tasks_complete', 'tasks_update', 'start_timer', 'timer_control', 'create_widget', 'widgets_update', 'add_shortcut', 'market_watch', 'layout_save', 'wm_move', 'memory_remember', 'set_theme', 'set_wallpaper', 'sound_toggle', 'close_app', 'wm_arrange', 'notes_delete', 'tasks_remove', 'shortcut_remove', 'memory_forget', 'widgets_remove'].forEach(id => { R.get(id).undoable = true; });
/* zamknięcie jednego okna jest odwracalne (wm_reopen) — pytamy tylko o „wszystkie” */
R.get('close_app').prepare = a => ({ trusted: a.app !== 'all' });
/* układy okien: zapisane nazwy i presety są dynamiczną listą wartości (Jev wybiera z niej „układ …”); przy mode=layout pole layout jest wymagane */
R.get('wm_arrange').slotOptions = { layout: () => J.layouts.list() };
R.get('wm_arrange').needs = a => a.mode === 'layout' ? ['layout'] : [];
/* narzędzia zwracające treść spoza użytkownika (może zawierać podszyte instrukcje — sprawdza je ai.js, D10) */
['notes_read', 'notes_search', 'files_read', 'clipboard_read'].forEach(id => { R.get(id).external = true; });
/* terminal_run: bez pytania tylko polecenia niezmieniające danych */
R.get('terminal_run').prepare = a => ({ trusted: J.policy.TERMINAL_SAFE.test(String(a.command || '').trim()) });
/* settings_set: bez pytania klucze bez skutków ubocznych */
R.get('settings_set').prepare = a => ({ trusted: !J.policy.SENSITIVE_SETTINGS.includes(a.key) });

/* =================== ZGODNOŚĆ: J.actions (stare wywołania) =================== */
J.actions = new Proxy({}, { get: (_, name) => typeof name === 'string' && R.has(name) ? (args) => R.run(name, args, { source: 'ui' }) : undefined });
J.APP_NAMES = APP_NAMES; J.APP_IDS = APP_IDS; J.SITES = SITES; J.findApp = findApp;
J.cmdKit = { findNote, findTask, resolveWin, winName, notOpen, layoutUndo, noteRow, taskRow, cut, showIf, APP_GENDER };
})();
