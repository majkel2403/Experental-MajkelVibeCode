/* =========================================================
   JARVIS OS — polecenia rozszerzone (specyfikacja docs/spec, fale W1–W5).
   Te same zasady co w commands.js: jeden wpis = narzędzie modelu + wzorce parsera + pozycja palety;
   każda zmiana danych zwraca funkcję cofającą (undo), a poziom autonomii wynika z js/jev-policy.js.
   ========================================================= */
'use strict';
(() => {
const R = J.registry, { ok, fail } = R, norm = J.norm;
const K = J.cmdKit, APP_IDS = J.APP_IDS, APP_NAMES = J.APP_NAMES;
const { findNote, resolveWin, winName, notOpen, cut } = K;

/* =================== W1 · NAWIGACJA =================== */
/* widoki w aplikacjach (docs/spec/03-nawigacja.md §3) */
const VIEWS = {
  notes: { note: 'notatka (tytuł albo id)', search: 'wyszukiwanie w notatkach', trash: 'kosz', tag: 'notatki z tagiem', folder: 'notatki z folderu' },
  schedule: { day: 'dzień (data, jutro, piątek)', week: 'tydzień', overdue: 'zaległe' },
  files: { path: 'plik albo folder (ścieżka)' },
  timer: { timer: 'minutnik', stopwatch: 'stoper' },
  market: { coin: 'waluta (BTC, ETH, SOL, BNB)' },
  weather: { city: 'miasto' },
  settings: { section: 'sekcja ustawień' },
  terminal: { run: 'wpisz polecenie (bez wykonania)' },
  calc: { expr: 'wpisz wyrażenie' },
  library: { apps: 'aplikacje', shortcuts: 'nowy skrót' },
  monitor: { section: 'fps, pamięć, sieć, dane, bateria, okna' },
  chat: {}
};
const COIN = { bitcoin: 'BTC', btc: 'BTC', ethereum: 'ETH', eth: 'ETH', eter: 'ETH', solana: 'SOL', solane: 'SOL', solany: 'SOL', sol: 'SOL', bnb: 'BNB', binance: 'BNB' };
const coinOf = t => { const n = norm(t); return COIN[n] || Object.entries(COIN).find(([k]) => new RegExp('\\b' + k).test(n))?.[1] || (/^[a-z]{2,6}$/.test(n) ? n.toUpperCase() : null); };
const DEFAULT_VIEW = { files: 'path', notes: 'note', schedule: 'day', timer: 'timer', market: 'coin', weather: 'city', settings: 'section', terminal: 'run', calc: 'expr', library: 'apps', monitor: 'section' };
R.add({ id: 'app_view', group: 'Nawigacja', label: 'Przejdź do widoku w aplikacji', description: 'Otwiera aplikację na konkretnym widoku: notes note|search|trash|tag|folder, schedule day|week|overdue, files path, timer timer|stopwatch, market coin, weather city, settings section, terminal run (tylko wpisuje), calc expr, library apps|shortcuts, monitor section. Nawigacja — niczego nie zmienia.', idempotent: true, writes: ['windows'],
  args: { type: 'object', properties: { app: { type: 'string', enum: APP_IDS }, view: { type: 'string' }, target: { type: 'string' } }, required: ['app'] },
  examples: ['pokaz stoper', 'pokaz zakladke stoper [w minutniku]', 'otworz minutnik na stoperze', 'pokaz {target} w rynku', 'otworz terminal z {target}', 'otworz kalkulator z {target}', 'pokaz skroty w bibliotece'],
  parse(raw, n) {
    let m;
    if (/^(pokaz|otworz|wlacz|przejdz do)\s+(zakladke\s+)?stoper(a)?(\s+w\s+minutniku)?$/.test(n) || /^otworz minutnik na stoperze$/.test(n)) return { args: { app: 'timer', view: 'stopwatch' }, score: 40 };
    if ((m = /^(?:pokaz|przejdz do|otworz)\s+(.+?)\s+w\s+(?:monitorze rynku|rynku|monitorze)$/.exec(n)) && coinOf(m[1])) return { args: { app: 'market', view: 'coin', target: coinOf(m[1]) }, score: 40 };
    if ((m = /^(?:otworz|pokaz|przejdz do)\s+ustawienia\s+(?:na\s+sekcji|w\s+sekcji|sekcja|na\s+sekcje)\s+(.+)$/.exec(n))) { const sec = R.aliases.section?.find(([, re]) => re.test(m[1]))?.[0]; if (sec) return { args: { app: 'settings', view: 'section', target: sec }, score: 35 }; }
    if ((m = /^otworz terminal z\s+(.+)$/.exec(n))) return { args: { app: 'terminal', view: 'run', target: raw.slice(n.indexOf(m[1])) }, score: 40 };
    if ((m = /^otworz kalkulator z\s+(.+)$/.exec(n))) return { args: { app: 'calc', view: 'expr', target: raw.slice(n.indexOf(m[1])) }, score: 40 };
    if (/^pokaz skroty( w bibliotece)?$/.test(n)) return { args: { app: 'library', view: 'shortcuts' }, score: 30 };
    if (/^pokaz (caly )?tydzien( w harmonogramie)?$|^harmonogram na (ten )?tydzien$/.test(n)) return { args: { app: 'schedule', view: 'week' }, score: 35 };
    if (/^pokaz (zalegle|zaległe)( zadania)?$|^co mam zalegle$/.test(n)) return { args: { app: 'schedule', view: 'overdue' }, score: 35 };
    if ((m = /^pokaz notatki z tagiem\s+#?(\S+)$/.exec(n))) return { args: { app: 'notes', view: 'tag', target: m[1] }, score: 35 };
    if ((m = /^pokaz notatki z folderu\s+(.+)$/.exec(n))) return { args: { app: 'notes', view: 'folder', target: raw.slice(n.lastIndexOf(m[1])) }, score: 35 };
    return null;
  },
  async run({ app, view, target }) {
    const views = VIEWS[app] || {}; view = view || DEFAULT_VIEW[app];
    if (view && !views[view]) return fail('INVALID_ARGS', winName(app) + ' nie ma widoku „' + view + '”.' + (Object.keys(views).length ? ' Są: ' + Object.entries(views).map(([k, v]) => k + ' (' + v + ')').join(', ') + '.' : ''));
    let t = target, label = target;
    if (app === 'notes' && view === 'note' && target) { const f = await findNote(target); if (f.err) return f.err; t = f.note.id; label = f.note.title; }
    if (app === 'schedule' && target && view === 'day') { t = J.nlp.date(target) || J.nlp.date('w ' + target) || J.nlp.date('za ' + target); if (!t) return fail('INVALID_ARGS', 'Nie rozumiem dnia „' + target + '”.'); label = new Date(t + 'T12:00').toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }); }
    if (app === 'market' && target) { t = coinOf(target); if (!t || !J.market.COINS.some(c => c.sym === t)) return fail('NOT_FOUND', 'Monitor rynku nie ma waluty „' + target + '”. Są: ' + J.market.COINS.map(c => c.sym).join(', ') + '.'); }
    if (app === 'settings' && target) { const sec = R.aliases.section?.find(([id, re]) => id === norm(target) || re.test(norm(target)))?.[0]; if (!sec) return fail('NOT_FOUND', 'Nie ma sekcji ustawień „' + target + '”.'); t = sec; }
    J.wm.open(app, view ? { view, target: t } : undefined); J.emit('app-view');
    return ok({ app, view, target: t }, winName(app) + (view && view !== DEFAULT_VIEW[app] || t ? ': ' + (views[view] ? (label || views[view]) : view) : '') + '.', { highlight: app });
  } });
R.get('app_view').slotOptions = { view: a => Object.keys(VIEWS[a?.app] || {}) };

R.add({ id: 'nav_forward', group: 'Nawigacja', label: 'Dalej (po „wróć”)', description: 'Idzie do przodu w historii okien i widoków — odwrotność nav_back.', idempotent: false, writes: ['windows'],
  examples: ['dalej', 'naprzod', 'idz dalej', 'wroc do przodu', 'do przodu'],
  parse(raw, n) { return /^(dalej|naprzod|idz dalej|wroc do przodu|do przodu|nastepny widok)$/.test(n) ? { args: {}, score: 30 } : null; },
  run() { const r = J.nav.forward(); return r.ok ? ok({ app: r.app, view: r.view }, r.text, { highlight: r.app }) : fail('NOT_FOUND', r.text); } });

/* =================== W1 · OKNA =================== */
R.add({ id: 'wm_pin', group: 'Aplikacje i okna', label: 'Zawsze na wierzchu', description: 'Przypina okno lub widget nad innymi (on=false odpina). Maks. 3 przypięte.', writes: ['windows'],
  args: { type: 'object', properties: { app: { type: 'string', description: 'id aplikacji, w:<id> widgetu albo "current"' }, on: { type: 'boolean' } }, required: ['app'] },
  examples: ['przypnij {app} [na wierzchu]', 'odepnij {app}', '{app} zawsze na wierzchu'],
  parse(raw, n) { let m; if ((m = /^(przypnij|odepnij)\s+(.+?)(\s+na wierzchu)?$/.exec(n)) && !/notatk/.test(m[2])) { const app = resolveWin(raw.slice(n.indexOf(m[2]), n.indexOf(m[2]) + m[2].length)); if (app) return { args: { app, on: m[1] === 'przypnij' }, score: 25 }; } if ((m = /^(.+?)\s+(ma byc\s+)?zawsze (na wierzchu|widoczny|widoczna)$/.exec(n))) { const app = resolveWin(raw.slice(0, m[1].length)); if (app) return { args: { app, on: true }, score: 25 }; } return null; },
  run({ app, on = true }) { const id = resolveWin(app); if (!id || !J.wm.isOpen(id)) return fail('NOT_FOUND', id ? notOpen(id) : 'Nie ma okna „' + app + '”.'); const was = J.wm.isPinned(id); J.wm.pin(id, on); return ok({ app: id, pinned: on }, winName(id) + (on ? ' zawsze na wierzchu.' : ' odpięte.'), { highlight: id }, () => { if (J.wm.isOpen(id)) J.wm.pin(id, was, true); }); } });
R.add({ id: 'wm_reopen', group: 'Aplikacje i okna', label: 'Otwórz ponownie zamknięte', description: 'Otwiera ostatnio zamknięte okno (albo wskazane) w tej samej pozycji i widoku. Pamięta 10 ostatnich.', writes: ['windows'],
  args: { type: 'object', properties: { app: { type: 'string', enum: APP_IDS } } },
  examples: ['otworz ponownie zamkniete [okno]', 'przywroc zamkniete okno', 'przywroc ostatnio zamkniete okno', 'otworz to co zamknalem'],
  parse(raw, n) { return /^(otworz ponownie|przywroc)( ostatnio)? zamkniet\w*( okno)?$|^otworz (to|z powrotem) co (zamknalem|zamknelam|zamknales)$/.test(n) ? { args: {}, score: 35 } : null; },
  run({ app }) { const id = J.wm.reopen(app); if (!id) return fail('NOT_FOUND', app ? 'Nie zamykałeś ostatnio: ' + winName(app) + '.' : 'Nie ma ostatnio zamkniętych okien.'); return ok({ app: id }, 'Otworzyłem ponownie: ' + winName(id) + '.', { highlight: id }, () => J.wm.close(id)); } });
R.add({ id: 'wm_restore', group: 'Aplikacje i okna', label: 'Przywróć okna', description: 'Przywraca zminimalizowane okno albo wszystkie (app="all") — odwrotność „pokaż pulpit”.', writes: ['windows'],
  args: { type: 'object', properties: { app: { type: 'string', description: 'id aplikacji, w:<id> albo "all"' } }, required: ['app'] },
  examples: ['przywroc okna', 'przywroc wszystkie okna', 'pokaz z powrotem [wszystkie] okna', 'przywroc {app}'],
  parse(raw, n) { if (/^(przywroc|pokaz z powrotem|pokaz znowu)( wszystkie| moje)? okna$/.test(n)) return { args: { app: 'all' }, score: 30 }; const m = /^przywroc\s+(.+)$/.exec(n); if (m && !/zamkniet|notatk|wersj|ustawien|z kosza/.test(m[1])) { const app = resolveWin(raw.slice(n.indexOf(m[1]))); if (app) return { args: { app }, score: 15 }; } return null; },
  run({ app }) { const target = app === 'all' ? 'all' : resolveWin(app); if (!target) return fail('NOT_FOUND', 'Nie ma okna „' + app + '”.'); const mins = (target === 'all' ? J.wm.list() : [target]).filter(k => J.wm.isMin(k)); const n = J.wm.restore(target); return n ? ok({ restored: n }, 'Przywróciłem ' + n + ' ' + J.pl(n, 'okno', 'okna', 'okien') + '.', null, () => mins.forEach(k => J.wm.minimize(k))) : ok({ restored: 0 }, 'Żadne okno nie było zminimalizowane.'); } });
R.add({ id: 'wm_close_others', group: 'Aplikacje i okna', label: 'Zamknij pozostałe', description: 'Zamyka wszystkie okna poza wskazanym (widgety zostają). Da się cofnąć.', writes: ['windows'],
  args: { type: 'object', properties: { app: { type: 'string', description: 'okno, które zostaje (domyślnie aktywne)' } }, required: ['app'] },
  examples: ['zostaw tylko {app}', 'zamknij pozostale [okna]', 'zamknij wszystko (poza|oprocz) {app}'],
  parse(raw, n) { let m; if ((m = /^(?:zostaw tylko|zamknij wszystko (?:poza|oprocz)|zamknij wszystkie okna (?:poza|oprocz))\s+(.+)$/.exec(n))) { const app = resolveWin(raw.slice(n.indexOf(m[1]))); if (app) return { args: { app }, score: 40 }; } if (/^zamknij pozostale( okna)?$/.test(n)) return { args: { app: 'current' }, score: 40 }; return null; },
  run({ app }) { const keep = resolveWin(app); if (!keep) return fail('NOT_FOUND', 'Nie ma okna „' + app + '”.'); if (!J.wm.isOpen(keep)) J.wm.open(keep); const closed = J.wm.closeOthers(keep); return ok({ kept: keep, closed }, closed.length ? 'Zostawiłem ' + winName(keep) + ', zamknąłem ' + closed.length + ' ' + J.pl(closed.length, 'okno', 'okna', 'okien') + '.' : 'Nie było innych okien.', null, closed.length ? () => closed.slice().reverse().forEach(id => J.wm.reopen(id)) : null); } });

/* =================== W1 · COFANIE =================== */
const NUM = { jedna: 1, jeden: 1, dwie: 2, dwa: 2, trzy: 3, cztery: 4, piec: 5, szesc: 6, siedem: 7, osiem: 8, dziewiec: 9, dziesiec: 10 };
R.add({ id: 'undo', group: 'Agent', label: 'Cofnij', description: 'Cofa ostatnią akcję (count = ile ostatnich, minutes = wszystko z ostatnich N minut). force=true cofa mimo późniejszej zmiany obiektu.', idempotent: false,
  args: { type: 'object', properties: { count: { type: 'integer', minimum: 1, maximum: 10 }, minutes: { type: 'integer', minimum: 1, maximum: 10 }, force: { type: 'boolean' } } },
  examples: ['cofnij', 'cofnij (dwie|trzy) ostatnie [rzeczy]', 'cofnij wszystko z ostatnich {minutes} minut', 'cofnij mimo to', 'odkrec to'],
  parse(raw, n) {
    let m;
    if (/^(cofnij|wycofaj)( to)? mimo( to| wszystko)?$/.test(n)) return { args: { force: true }, score: 40 };
    if ((m = /^cofnij\s+(?:(\d+|jedna|jeden|dwie|dwa|trzy|cztery|piec|szesc|siedem|osiem|dziewiec|dziesiec)\s+)?ostatni\w*(?:\s+(\d+|dwie|dwa|trzy|cztery|piec))?(?:\s+(?:rzeczy|akcje|zmiany|kroki))?$/.exec(n))) { const k = m[1] || m[2]; const c = k ? (+k || NUM[k]) : 1; return { args: { count: c }, score: 40 }; }
    if ((m = /^cofnij wszystko z ostatnich (\d+|dwoch|trzech|pieciu|dziesieciu) minut$/.exec(n))) return { args: { minutes: +m[1] || { dwoch: 2, trzech: 3, pieciu: 5, dziesieciu: 10 }[m[1]] }, score: 40 };
    if (/^(odkrec|odwroc) to( co zrobiles)?$/.test(n)) return { args: {}, score: 30 };
    return null;
  },
  async run({ count, minutes, force }) { const r = (count > 1 || minutes) ? await J.undo.runMany({ count, minutes, force }) : await J.undo.run(undefined, { force }); return r.ok ? ok({ done: r.done || 1 }, r.text) : fail(r.conflict ? 'CONFLICT' : 'NOT_FOUND', r.text); } });
R.add({ id: 'undo_list', group: 'Agent', label: 'Historia do cofnięcia', description: 'Lista ostatnich akcji, które da się cofnąć (10 minut).', idempotent: true,
  examples: ['co moge cofnac', 'historia do cofniecia', 'historia zmian', 'co ostatnio (zrobiles|zmieniles|pozmieniales)'],
  run() { const l = J.undo.list(); return ok({ items: l }, l.length ? 'Mogę cofnąć: ' + l.map(e => e.text.replace(/\.$/, '') + ' (' + (e.ago_s < 60 ? e.ago_s + ' s' : Math.round(e.ago_s / 60) + ' min') + ' temu)').join('; ') + '.' : 'Nie ma nic do cofnięcia.'); } });

/* =================== W1/W3 · SKRÓTY (UI przez rejestr) =================== */
const findShortcut = q => { const n = norm(q); return J.state.shortcuts.find(x => x.id === q) || J.state.shortcuts.find(x => norm(x.name) === n) || J.state.shortcuts.find(x => norm(x.name).includes(n)); };
R.add({ id: 'shortcut_edit', group: 'Pulpit i widgety', label: 'Edytuj skrót', description: 'Zmienia nazwę, adres (url), aplikację albo ikonę skrótu na pulpicie.', writes: ['shortcuts'],
  args: { type: 'object', properties: { shortcut: { type: 'string', description: 'id albo nazwa skrótu' }, name: { type: 'string', maxLength: 40 }, url: { type: 'string' }, app: { type: 'string', enum: APP_IDS }, icon: { type: 'string' } }, required: ['shortcut'] },
  examples: ['zmien nazwe skrotu {shortcut} na {name}', 'skrot {shortcut} ma sie nazywac {name}', 'zmien adres skrotu {shortcut} na {url}'],
  parse(raw, n) { let m; if ((m = /^(?:zmien nazwe skrotu|przemianuj skrot)\s+(.+?)\s+na\s+(.+)$/.exec(n)) || (m = /^skrot\s+(.+?)\s+ma sie nazywac\s+(.+)$/.exec(n))) return { args: { shortcut: raw.slice(n.indexOf(m[1]), n.indexOf(m[1]) + m[1].length), name: raw.slice(n.lastIndexOf(m[2])) }, score: 30 }; if ((m = /^(?:zmien adres skrotu|skrot)\s+(.+?)\s+(?:na|niech otwiera)\s+([a-z0-9.-]+\.[a-z]{2,}\S*)$/.exec(n))) return { args: { shortcut: raw.slice(n.indexOf(m[1]), n.indexOf(m[1]) + m[1].length), url: m[2] }, score: 30 }; if ((m = /^zmien adres skrotu\s+(\S+)$/.exec(n))) return { args: { shortcut: raw.slice(n.indexOf(m[1])) }, score: 25 }; return null; },
  run({ shortcut, name, url, app, icon }) {
    const s = findShortcut(shortcut); if (!s) return fail('NOT_FOUND', 'Nie ma skrótu „' + shortcut + '”.' + (J.state.shortcuts.length ? ' Są: ' + J.state.shortcuts.map(x => '„' + x.name + '”').join(', ') + '.' : ''));
    const prev = { ...s };
    if (name) s.name = String(name).trim().slice(0, 40);
    if (url) { s.url = /^https?:\/\//i.test(url) ? url : 'https://' + url; s.app = null; s.icon = icon || 'link'; }
    if (app) { s.app = app; s.url = null; s.icon = icon || J.apps[app]?.icon || 'star'; }
    if (icon && !url && !app) s.icon = icon;
    J.save(); J.emit('shortcuts');
    return ok({ id: s.id, name: s.name, url: s.url, app: s.app }, 'Skrót „' + s.name + '” zmieniony.', { highlight: 'sc:' + s.id }, () => { Object.assign(s, prev); J.save(); J.emit('shortcuts'); });
  } });
R.get('shortcut_edit').undoable = true;
['wm_pin', 'wm_reopen', 'wm_restore', 'wm_close_others'].forEach(id => { R.get(id).undoable = true; });

J.cmdKit.VIEWS = VIEWS; J.cmdKit.coinOf = coinOf; J.cmdKit.findShortcut = findShortcut;
})();

/* =================== W2 · ZNAJDOWANIE, TRYBY, WYGLĄD, USTAWIENIA =================== */
(() => {
const R = J.registry, { ok, fail } = R, norm = J.norm, K = J.cmdKit;
const TYPES_PL = { notes: 'notatka', tasks: 'zadanie', widgets: 'widget', shortcuts: 'skrót', memory: 'pamięć', chat: 'rozmowa', settings: 'ustawienia', commands: 'polecenie', apps: 'aplikacja', files: 'plik' };
R.add({ id: 'search_all', group: 'Nawigacja', label: 'Szukaj wszędzie', description: 'Jedno wyszukiwanie po notatkach, zadaniach, widgetach, skrótach, pamięci, rozmowach, ustawieniach, poleceniach i plikach. Zwraca wyniki z typem; show=true otwiera najlepszy.', idempotent: true, reads: ['all'],
  args: { type: 'object', properties: { query: { type: 'string', maxLength: 120 }, types: { type: 'array', items: { type: 'string', enum: J.search.TYPES } }, limit: { type: 'integer', minimum: 1, maximum: 50 }, show: { type: 'boolean' } }, required: ['query'] },
  examples: ['szukaj wszedzie {query}', 'znajdz wszystko o {query}', 'gdzie mam cos o {query}', 'przeszukaj wszystko pod katem {query}'],
  parse(raw, n) { const m = /^(?:szukaj wszedzie|znajdz wszystko o|gdzie mam cos o|przeszukaj wszystko(?: pod katem)?|wyszukaj wszedzie)\s+(.+)$/.exec(n); return m ? { args: { query: raw.slice(n.indexOf(m[1])) }, score: 40 } : null; },
  async run({ query, types, limit = 20, show }) { const hits = await J.search.query(query, { types, limit }); if (show && hits[0]) await J.search.open(hits[0]); return ok({ hits: hits.map(({ open, ...h }) => h) }, hits.length ? 'Znalazłem ' + hits.length + ': ' + hits.slice(0, 6).map(h => h.title + ' (' + TYPES_PL[h.type] + ')').join('; ') + (hits.length > 6 ? '…' : '') + '.' : 'Nic nie pasuje do „' + query + '”.'); } });
R.add({ id: 'recent_list', group: 'Nawigacja', label: 'Ostatnio otwierane', description: 'Lista ostatnio otwieranych okien i widoków (do szybkiego powrotu przez app_view).', idempotent: true,
  args: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 20 } } },
  examples: ['ostatnio otwierane', 'co ostatnio otwieralem', 'ostatnie okna', 'pokaz ostatnie'],
  run({ limit = 8 }) { const l = (J.state.ui.recentViews || []).slice(0, limit); return ok({ items: l }, l.length ? 'Ostatnio: ' + l.map(r => r.title).join('; ') + '.' : 'Nic jeszcze nie otwierałeś.'); } });

/* tryby przestrzeni: work (domyślny), clean (sam rdzeń), focus (jedno okno + cisza), present (bez prywatnych treści) */
const MODES = { work: 'tryb pracy', clean: 'czysty pulpit', focus: 'tryb skupienia', present: 'tryb prezentacji' };
J.uiMode = {
  get: () => MODES[J.state.ui.mode] ? J.state.ui.mode : 'work',
  set(m) {
    const prev = J.uiMode.get(), app = J.$('#app');
    if (prev === 'clean' && m !== 'clean') (J.state.ui.cleanHidden || []).forEach(id => J.wm.isOpen(id) && J.wm.restore(id));
    if (prev === 'focus' && m !== 'focus') J.setFocus?.(false);
    if (m === 'clean') { J.state.ui.cleanHidden = J.wm.list().filter(k => !J.wm.isMin(k)); J.wm.minimizeAll(); }
    if (m === 'focus') J.setFocus?.(true);
    J.state.ui.mode = m; J.save();
    if (app) { Object.keys(MODES).forEach(k => app.classList.toggle('mode-' + k, k === m)); app.classList.toggle('present', m === 'present'); }
    J.emit('ui-mode', m); return prev;
  }
};
R.add({ id: 'ui_mode', group: 'Nawigacja', label: 'Tryb przestrzeni', description: 'Przełącza tryb pulpitu: work (okna), clean (pusty pulpit, okna zminimalizowane), focus (skupienie), present (prezentacja: bez czatu, logu, powiadomień i prywatnych tytułów).', writes: ['ui', 'windows'],
  args: { type: 'object', properties: { mode: { type: 'string', enum: Object.keys(MODES) } }, required: ['mode'] },
  examples: ['tryb prezentacji', 'posprzataj pulpit', 'czysty pulpit', 'tryb pracy', 'koniec prezentacji', 'wlacz tryb prezentacji'],
  parse(raw, n) { if (/^(wlacz )?tryb prezentacji$|bede (pokazywal|prezentowal) ekran|schowaj (wszystko )?prywatne/.test(n)) return { args: { mode: 'present' }, score: 30 }; if (/^(posprzataj pulpit|czysty pulpit|pusty pulpit|tryb czysty)$/.test(n)) return { args: { mode: 'clean' }, score: 30 }; if (/^(tryb pracy|koniec prezentacji|wylacz tryb prezentacji|wroc do pracy|normalny tryb)$/.test(n)) return { args: { mode: 'work' }, score: 30 }; return null; },
  run({ mode }) { const prev = J.uiMode.set(mode); return ok({ mode, prev }, 'Włączony ' + MODES[mode] + '.', null, () => J.uiMode.set(prev)); } });
R.add({ id: 'ui_scale', group: 'Interfejs', label: 'Skala interfejsu', description: 'Powiększa albo zmniejsza treść interfejsu (80–130%). step=up|down|reset albo percent.', writes: ['settings'],
  args: { type: 'object', properties: { percent: { type: 'number', minimum: 80, maximum: 130 }, step: { type: 'string', enum: ['up', 'down', 'reset'] } } },
  examples: ['powieksz interfejs', 'zmniejsz interfejs', 'powieksz wszystko', 'zmniejsz wszystko', 'skala {percent} procent', 'litery sa za male'],
  parse(raw, n) { let m; if (/^(powieksz|zwieksz) (interfejs|wszystko|czcionke|litery)$|za male (litery|czcionka)|litery sa za male/.test(n)) return { args: { step: 'up' }, score: 30 }; if (/^(zmniejsz|pomniejsz) (interfejs|wszystko|czcionke|litery)$/.test(n)) return { args: { step: 'down' }, score: 30 }; if ((m = /^skala (\d{2,3})( procent|%)?$/.exec(n))) return { args: { percent: +m[1] }, score: 30 }; if (/^(domyslna|normalna) skala$/.test(n)) return { args: { step: 'reset' }, score: 30 }; return null; },
  run({ percent, step }) { const s = J.state.settings, prev = s.uiScale || 100; let v = percent ?? (step === 'up' ? prev + 10 : step === 'down' ? prev - 10 : step === 'reset' ? 100 : prev); v = J.clamp(Math.round(v / 5) * 5, 80, 130); s.uiScale = v; J.applyScale?.(); J.save(); J.emit('settings'); return ok({ percent: v }, 'Skala interfejsu: ' + v + '%.', null, () => { s.uiScale = prev; J.applyScale?.(); J.save(); J.emit('settings'); }); } });

/* układy okien */
const findLayout = q => { const n = norm(q); return Object.keys(J.state.layouts || {}).find(k => norm(k) === n) || Object.keys(J.state.layouts || {}).find(k => norm(k).includes(n)); };
R.add({ id: 'layout_list', group: 'Aplikacje i okna', label: 'Lista układów', description: 'Presety i zapisane układy okien z listą aplikacji oraz układ startowy.', idempotent: true,
  examples: ['jakie mam uklady', 'lista ukladow', 'pokaz [moje] zapisane uklady', 'pokaz moje uklady okien'],
  run() { const saved = Object.entries(J.state.layouts || {}).map(([name, l]) => ({ name, apps: l.apps.map(a => a.id), preset: false })), pre = J.layouts.presets().map(name => ({ name, preset: true })); return ok({ layouts: [...pre, ...saved], startup: J.state.settings.layoutStartup || 'none' }, 'Presety: ' + pre.map(x => x.name).join(', ') + '. ' + (saved.length ? 'Zapisane: ' + saved.map(x => x.name + ' (' + x.apps.map(K.winName).join(', ') + ')').join('; ') + '.' : 'Brak zapisanych układów.') + ' Układ startowy: ' + (J.state.settings.layoutStartup || 'none') + '.'); } });
R.add({ id: 'layout_remove', group: 'Aplikacje i okna', label: 'Usuń układ', description: 'Usuwa zapisany układ okien (presetów nie można usunąć). Wymaga potwierdzenia.', risk: 'confirm', writes: ['layouts'], confirmText: a => 'Usunąć układ „' + a.name + '”?',
  args: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  examples: ['usun uklad {name}', 'skasuj uklad {name}', 'wywal uklad {name}', 'usun zapisany uklad {name}'],
  run({ name }) { if (J.layouts.isPreset(name)) return fail('DENIED', '„' + name + '” to preset — nie da się go usunąć.'); const k = findLayout(name); if (!k) return fail('NOT_FOUND', 'Nie ma układu „' + name + '”.'); const l = J.state.layouts[k]; delete J.state.layouts[k]; if (J.state.settings.layoutStartup === k) J.state.settings.layoutStartup = 'none'; J.save(); return ok({ name: k }, 'Usunąłem układ „' + k + '”.', null, () => { J.state.layouts[k] = l; J.save(); }); } });
R.add({ id: 'layout_rename', group: 'Aplikacje i okna', label: 'Zmień nazwę układu', description: 'Zmienia nazwę zapisanego układu okien.', writes: ['layouts'],
  args: { type: 'object', properties: { name: { type: 'string' }, to: { type: 'string', maxLength: 40 } }, required: ['name', 'to'] },
  examples: ['zmien nazwe ukladu {name} na {to}', 'uklad {name} niech sie nazywa {to}', 'przemianuj uklad {name} na {to}'],
  run({ name, to }) { const k = findLayout(name); if (!k) return fail('NOT_FOUND', 'Nie ma układu „' + name + '”.'); if (J.layouts.isPreset(to) || (findLayout(to) && norm(findLayout(to)) === norm(to))) return fail('INVALID_ARGS', 'Nazwa „' + to + '” jest zajęta.'); const l = J.state.layouts[k]; delete J.state.layouts[k]; J.state.layouts[to] = l; if (J.state.settings.layoutStartup === k) J.state.settings.layoutStartup = to; J.save(); return ok({ name: to }, 'Układ „' + k + '” nazywa się teraz „' + to + '”.', null, () => { delete J.state.layouts[to]; J.state.layouts[k] = l; if (J.state.settings.layoutStartup === to) J.state.settings.layoutStartup = k; J.save(); }); } });
R.add({ id: 'layout_startup', group: 'Aplikacje i okna', label: 'Układ startowy', description: 'Układ stosowany przy uruchomieniu: nazwa układu, "last" (okna z poprzedniej sesji) albo "none".', writes: ['settings'],
  args: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  examples: ['na starcie wlaczaj uklad {name}', 'ustaw uklad startowy {name}', 'uklad startowy {name}', 'wylacz uklad startowy', 'przy starcie otwieraj ostatnie okna'],
  parse(raw, n) { if (/^wylacz uklad startowy$/.test(n)) return { args: { name: 'none' }, score: 30 }; if (/^przy starcie otwieraj (ostatnie|te same) okna$/.test(n)) return { args: { name: 'last' }, score: 30 }; const m = /^(?:ustaw\s+)?uklad startowy\s+(.+)$|^(?:na starcie|przy starcie) (?:wlaczaj|otwieraj) uklad\s+(.+)$/.exec(n); return m ? { args: { name: raw.slice(n.indexOf(m[1] || m[2])) }, score: 30 } : null; },
  run({ name }) { const s = J.state.settings, prev = s.layoutStartup || 'none'; let v = norm(name); if (/^(none|brak|zaden|wylacz)$/.test(v)) v = 'none'; else if (/^(last|ostatni|ostatnie)$/.test(v)) v = 'last'; else { v = findLayout(name) || J.layouts.presets().find(p => norm(p) === norm(name)); if (!v) return fail('NOT_FOUND', 'Nie ma układu „' + name + '”. Dostępne: ' + J.layouts.list().join(', ') + '.'); } s.layoutStartup = v; J.save(); return ok({ startup: v }, v === 'none' ? 'Bez układu startowego.' : v === 'last' ? 'Przy starcie otworzę okna z poprzedniej sesji.' : 'Układ startowy: „' + v + '”.', null, () => { s.layoutStartup = prev; J.save(); }); } });

/* kanały powiadomień */
const CHANNELS = { task: 'zadania', timer: 'minutnik', market: 'rynek', network: 'sieć', agent: 'agent', files: 'pliki', hermes: 'Hermes', routine: 'rutyny' };
const CH_RE = [['task', /zadani|przypomnien/], ['timer', /minutnik|odliczani/], ['market', /rynk|kurs|krypto|gield/], ['network', /siec|internet|polaczeni/], ['agent', /agent|jarvis/], ['files', /plik/], ['hermes', /hermes|model/], ['routine', /rutyn/]];
J.notifChannel = kind => ({ on: true, sound: true, perHour: 20, ...((J.state.settings.notif || {})[kind] || {}) });
R.add({ id: 'notif_channel', group: 'Interfejs', label: 'Kanał powiadomień', description: 'Włącza/wyłącza rodzaj powiadomień (' + Object.entries(CHANNELS).map(([k, v]) => k + '=' + v).join(', ') + '), dźwięk albo limit na godzinę. Wyłączony kanał trafia tylko do centrum powiadomień, bez dymka.', writes: ['settings'],
  args: { type: 'object', properties: { kind: { type: 'string', enum: Object.keys(CHANNELS) }, on: { type: 'boolean' }, sound: { type: 'boolean' }, per_hour: { type: 'integer', minimum: 0, maximum: 60 } }, required: ['kind'] },
  examples: ['wylacz powiadomienia (z rynku|o sieci|z zadan)', 'wlacz powiadomienia z rynku', 'bez dzwieku przy zadaniach', 'maksymalnie {per_hour} powiadomienia na godzine'],
  parse(raw, n) { let m; const kindOf = t => CH_RE.find(([, re]) => re.test(t))?.[0]; if ((m = /^(wylacz|wlacz) powiadomienia\s+(.+)$/.exec(n)) && kindOf(m[2])) return { args: { kind: kindOf(m[2]), on: m[1] === 'wlacz' }, score: 30 }; if ((m = /^bez dzwieku (?:przy|dla|z)\s+(.+)$/.exec(n)) && kindOf(m[1])) return { args: { kind: kindOf(m[1]), sound: false }, score: 30 }; if ((m = /(\w+) niech mnie nie zaczepia/.exec(n)) && kindOf(m[1])) return { args: { kind: kindOf(m[1]), on: false }, score: 20 }; return null; },
  run({ kind, on, sound, per_hour }) { const s = J.state.settings; s.notif = s.notif || {}; const prev = s.notif[kind] ? { ...s.notif[kind] } : null; const c = s.notif[kind] = { ...J.notifChannel(kind) }; if (on != null) c.on = on; if (sound != null) c.sound = sound; if (per_hour != null) c.perHour = per_hour; J.save(); J.emit('settings'); return ok({ kind, ...c }, 'Powiadomienia „' + CHANNELS[kind] + '”: ' + (c.on ? 'włączone' : 'wyłączone') + ', dźwięk ' + (c.sound ? 'tak' : 'nie') + ', limit ' + c.perHour + '/h.', null, () => { if (prev) s.notif[kind] = prev; else delete s.notif[kind]; J.save(); J.emit('settings'); }); } });

/* skróty klawiszowe (mapa w main.js: J.KEY_ACTIONS) */
const RESERVED = ['ctrl+t', 'ctrl+w', 'ctrl+n', 'ctrl+l', 'ctrl+r', 'ctrl+tab', 'ctrl+shift+tab', 'f5', 'f11', 'alt+f4', 'ctrl+shift+n', 'ctrl+shift+i', 'f12'];
const normCombo = c => String(c || '').toLowerCase().replace(/\s+/g, '').replace(/control/g, 'ctrl').replace(/option/g, 'alt').replace(/spacja|space/g, 'space').split('+').filter(Boolean).sort((a, b) => ['ctrl', 'alt', 'shift', 'meta'].indexOf(a) === -1 ? 1 : ['ctrl', 'alt', 'shift', 'meta'].indexOf(b) === -1 ? -1 : ['ctrl', 'alt', 'shift', 'meta'].indexOf(a) - ['ctrl', 'alt', 'shift', 'meta'].indexOf(b)).join('+');
J.normCombo = normCombo;
R.add({ id: 'keys_set', group: 'Interfejs', label: 'Zmień skrót klawiszowy', description: 'Przypisuje skrót do akcji (np. palette, chat, log, notifications, voice, undo, reopen, desktop, tile, present, back, forward). keys="reset" przywraca domyślny; action="all" + keys="reset" — wszystkie.', writes: ['settings'],
  args: { type: 'object', properties: { action: { type: 'string' }, keys: { type: 'string', description: 'np. Alt+K albo reset' } }, required: ['action', 'keys'] },
  examples: ['(paleta|czat|log|powiadomienia) pod {keys}', 'zmien skrot (palety|czatu) na {keys}', 'przywroc domyslne skroty'],
  parse(raw, n) { if (/^przywroc domyslne skroty( klawiszowe)?$/.test(n)) return { args: { action: 'all', keys: 'reset' }, score: 30 }; const m = /^(?:zmien skrot\s+)?(paleta|palety|palete|czat|czatu|log|logu|powiadomienia|powiadomien|glos|mowienie|cofnij|cofania)\s+(?:pod|na)\s+((?:ctrl|alt|shift|f\d+|[a-z0-9])(?:\s*\+\s*[a-z0-9]+)*)$/.exec(n); if (!m) return null; const act = { paleta: 'palette', palety: 'palette', palete: 'palette', czat: 'chat', czatu: 'chat', log: 'log', logu: 'log', powiadomienia: 'notifications', powiadomien: 'notifications', glos: 'voice', mowienie: 'voice', cofnij: 'undo', cofania: 'undo' }[m[1]]; return { args: { action: act, keys: m[2].replace(/\s+/g, '') }, score: 30 }; },
  run({ action, keys }) {
    const s = J.state.settings, map = s.keys = s.keys || {}, prev = { ...map }, A = J.KEY_ACTIONS || {};
    const restore = () => { s.keys = prev; J.save(); J.emit('settings'); };
    if (action === 'all' && /^reset$/i.test(keys)) { s.keys = {}; J.save(); J.emit('settings'); return ok(null, 'Przywróciłem domyślne skróty.', null, restore); }
    if (!A[action]) return fail('INVALID_ARGS', 'Nieznana akcja „' + action + '”. Dostępne: ' + Object.keys(A).join(', ') + '.');
    if (/^reset$/i.test(keys)) { delete map[action]; J.save(); J.emit('settings'); return ok({ action, keys: A[action].def }, 'Skrót „' + A[action].label + '”: domyślny (' + A[action].def + ').', null, restore); }
    const c = normCombo(keys);
    if (!/^(ctrl|alt|meta)\+|^f\d{1,2}$/.test(c)) return fail('INVALID_ARGS', 'Skrót musi zawierać Ctrl albo Alt (albo być klawiszem F1–F12).');
    if (RESERVED.includes(c)) return fail('INVALID_ARGS', 'Skrót ' + keys + ' należy do przeglądarki — wybierz inny.');
    const clash = Object.entries(A).find(([id, a]) => id !== action && normCombo(map[id] || a.def) === c);
    if (clash) return fail('INVALID_ARGS', 'Skrót ' + keys + ' jest już przypisany do „' + clash[1].label + '”.');
    map[action] = keys; J.save(); J.emit('settings');
    return ok({ action, keys }, 'Skrót „' + A[action].label + '”: ' + keys + '.', null, restore);
  } });

/* przywracanie domyślnych ustawień sekcji (klucze API zostają) */
const SECTION_KEYS = { wyglad: ['accent', 'accent2', 'wall', 'particles', 'uiScale', 'fxLevel', 'startMode', 'wfFilm', 'filmOn', 'filmScen'], glos: ['speech', 'voiceName', 'silentVoice', 'wakeWord', 'sound', 'volume', 'speechRate', 'sttLang'], agent: ['proactive', 'proactiveMax', 'quietFrom', 'quietTo', 'briefingTime', 'summaryTime'], jev: ['jevExecute', 'jevAsk', 'jevDestructive', 'jevInterrupt', 'jevVerify', 'jevPrivacy', 'jevA3', 'jevA2', 'jevBudget', 'jevAutonomy', 'jevFast', 'jevShadow', 'jevLogText', 'jevModel'], hermes: ['hermesModelLite', 'toolFormat', 'hermesPreset', 'hermesDailyBudget'], skroty: ['keys'], powiadomienia: ['notif'] };
R.add({ id: 'settings_reset', group: 'Interfejs', label: 'Przywróć ustawienia sekcji', description: 'Przywraca domyślne wartości jednej sekcji ustawień: ' + Object.keys(SECTION_KEYS).join(', ') + '. Klucze API zostają. Wymaga potwierdzenia.', risk: 'confirm', writes: ['settings'], confirmText: a => 'Przywrócić domyślne ustawienia sekcji „' + a.section + '”?',
  args: { type: 'object', properties: { section: { type: 'string', enum: Object.keys(SECTION_KEYS) } }, required: ['section'] },
  examples: ['przywroc domyslny wyglad', 'zresetuj ustawienia (glosu|jeva|agenta)', 'domyslne ustawienia (jeva|glosu)'],
  parse(raw, n) { const m = /^(?:przywroc domysln\w*|zresetuj|domyslne) (?:ustawienia\s+)?(wyglad|wygladu|glos|glosu|agent|agenta|jev|jeva|hermes|hermesa|skroty|skrotow|powiadomienia|powiadomien)$/.exec(n); if (!m) return null; const sec = { wyglad: 'wyglad', wygladu: 'wyglad', glos: 'glos', glosu: 'glos', agent: 'agent', agenta: 'agent', jev: 'jev', jeva: 'jev', hermes: 'hermes', hermesa: 'hermes', skroty: 'skroty', skrotow: 'skroty', powiadomienia: 'powiadomienia', powiadomien: 'powiadomienia' }[m[1]]; return { args: { section: sec }, score: 30 }; },
  run({ section }) { const s = J.state.settings, d = J.DEFAULTS().settings, keys = SECTION_KEYS[section], prev = {}; keys.forEach(k => { prev[k] = s[k]; s[k] = JSON.parse(JSON.stringify(d[k])); }); J.applyTheme?.(); J.applyScale?.(); J.save(); J.emit('settings'); return ok({ section, keys }, 'Przywróciłem domyślne ustawienia: ' + section + '.', null, () => { Object.assign(s, prev); J.applyTheme?.(); J.applyScale?.(); J.save(); J.emit('settings'); }); } });

/* =================== W2 · CZAT =================== */
R.add({ id: 'chat_search', group: 'Czat', label: 'Szukaj w rozmowach', description: 'Szuka w historii rozmów wszystkich wątków; show=true przewija czat do najlepszego wyniku.', idempotent: true, reads: ['chat'],
  args: { type: 'object', properties: { query: { type: 'string', maxLength: 120 }, show: { type: 'boolean' } }, required: ['query'] },
  examples: ['szukaj w czacie {query}', 'szukaj w rozmowach {query}', 'co mowiles o {query}', 'o czym rozmawialismy o {query}'],
  parse(raw, n) { const m = /^(?:szukaj w (?:czacie|rozmowach|rozmowie)|co mi mowiles o|co mowiles o|o czym rozmawialismy(?: wczoraj)? o)\s+(.+)$/.exec(n); return m ? { args: { query: raw.slice(n.indexOf(m[1])) }, score: 30 } : null; },
  async run({ query, show }) { const hits = await J.chat.searchAll(J.norm(query)); if (show !== false && hits[0]) await J.chat.goto(hits[0].threadId, hits[0].index); return ok({ hits: hits.slice(0, 10) }, hits.length ? 'W rozmowach (' + hits.length + '): ' + hits.slice(0, 3).map(h => '„' + K.cut(h.text.replace(/\s+/g, ' '), 70) + '” (' + h.thread + ')').join('; ') + '.' : 'Nie rozmawialiśmy o „' + query + '”.'); } });
R.add({ id: 'chat_export', group: 'Czat', label: 'Eksport rozmowy', description: 'Zapisuje rozmowę jako plik Markdown (pobranie): range=session (ten wątek) albo all (wszystkie wątki).', idempotent: true, reads: ['chat'],
  args: { type: 'object', properties: { range: { type: 'string', enum: ['session', 'all'] } } },
  examples: ['eksportuj (czat|rozmowe)', 'zapisz (te|nasza) rozmowe [do pliku]', 'pobierz historie rozmowy'],
  async run({ range = 'session' }) { const md = await J.chat.markdown(range); try { const a = J.h('a', { href: URL.createObjectURL(new Blob([md], { type: 'text/markdown' })), download: 'jarvis-rozmowa-' + J.today() + '.md' }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500); } catch (e) { } return ok({ markdown: md, chars: md.length }, 'Zapisałem rozmowę (' + md.length + ' znaków) do pobrania.'); } });
R.add({ id: 'chat_clear', group: 'Czat', label: 'Wyczyść rozmowę', description: 'Usuwa historię bieżącego wątku (i streszczenie). Wymaga potwierdzenia; „Cofnij” działa przez 10 minut.', risk: 'confirm', writes: ['chat'], confirmText: () => 'Wyczyścić rozmowę w tym wątku?',
  examples: ['wyczysc (czat|rozmowe|historie czatu)', 'usun historie rozmowy', 'zacznijmy od czystej karty', 'nowa rozmowa'],
  parse(raw, n) { return /^(wyczysc (czat|rozmowe|historie( czatu| rozmowy)?)|usun historie (rozmowy|czatu)|zacznijmy od czystej karty|zapomnij (cala )?(nasza )?rozmowe)$/.test(n) ? { args: {}, score: 30 } : null; },
  async run() { const items = J.chat.snapshot(), brain = J.brain.snapshot(); J.brain.reset(); J.chat.reset(); await J.chat.reload(); return ok(null, 'Wyczyściłem rozmowę.', null, async () => { J.brain.restoreSnapshot(brain); await J.chat.restoreSnapshot(items); }); } });
R.add({ id: 'chat_thread', group: 'Czat', label: 'Wątki rozmów', description: 'Wątki rozmów: op=new (nowy, name), switch (przełącz, name), list, rename (bieżący na name). Każdy wątek ma własną historię.', writes: ['chat'],
  args: { type: 'object', properties: { op: { type: 'string', enum: ['new', 'switch', 'list', 'rename'] }, name: { type: 'string', maxLength: 40 } }, required: ['op'] },
  examples: ['nowy watek [o {name}]', 'przelacz na watek {name}', 'jakie mam watki', 'zmien nazwe watku na {name}'],
  parse(raw, n) { let m; if ((m = /^(?:nowy watek|zacznij nowy watek|zacznijmy (?:osobna|nowa) rozmowe)(?: o\s+(.+))?$/.exec(n))) return { args: { op: 'new', name: m[1] ? raw.slice(n.indexOf(m[1])) : undefined }, score: 30 }; if ((m = /^(?:przelacz (?:sie )?na watek|wroc do watku|otworz watek)\s+(.+)$/.exec(n))) return { args: { op: 'switch', name: raw.slice(n.indexOf(m[1])) }, score: 30 }; if (/^(jakie mam watki|lista watkow|pokaz watki)$/.test(n)) return { args: { op: 'list' }, score: 30 }; if ((m = /^zmien nazwe watku na\s+(.+)$/.exec(n))) return { args: { op: 'rename', name: raw.slice(n.indexOf(m[1])) }, score: 30 }; return null; },
  async run({ op, name }) {
    const T = J.threads, cur = T.current(), curName = T.list().find(t => t.id === cur)?.name;
    if (op === 'list') return ok({ threads: T.list(), current: cur }, 'Wątki: ' + T.list().map(t => t.name + (t.id === cur ? ' (bieżący)' : '')).join(', ') + '.');
    if (op === 'new') { const t = T.create(name || 'Wątek ' + (T.list().length)); await T.switch(t.id); return ok({ thread: t }, 'Nowy wątek „' + t.name + '”.', null, async () => { await T.switch(cur); J.state.ui.threads = T.list().filter(x => x.id !== t.id); J.save(); }); }
    if (op === 'switch') { const t = T.byName(name || ''); if (!t) return fail('NOT_FOUND', 'Nie ma wątku „' + name + '”. Są: ' + T.list().map(x => x.name).join(', ') + '.'); await T.switch(t.id); return ok({ thread: t }, 'Wątek „' + t.name + '”.', null, () => T.switch(cur)); }
    if (op === 'rename') { if (!name) return fail('INVALID_ARGS', 'Podaj nową nazwę wątku.'); const t = T.list().find(x => x.id === cur); t.name = name.slice(0, 40); J.save(); J.emit('thread'); return ok({ thread: t }, 'Wątek nazywa się teraz „' + t.name + '”.', null, () => { t.name = curName; J.save(); J.emit('thread'); }); }
  } });
['ui_mode', 'ui_scale', 'layout_remove', 'layout_rename', 'layout_startup', 'notif_channel', 'keys_set', 'settings_reset', 'chat_clear', 'chat_thread'].forEach(id => { R.get(id).undoable = true; });
})();

/* =================== W2 · KOPIA DANYCH v2 (docs/spec/10-ustawienia.md §5) =================== */
(() => {
const SECRET = /(key|token|secret)$/i;
const IDB_KEYS = ['chat.history', 'chat.items', 'chat.summary', 'memory.facts', 'proc.history', 'jev.log', 'consent.log', 'signals.log', 'widgets.cache'];
const ID_ARRAYS = ['notes', 'tasks', 'widgets', 'shortcuts', 'alerts', 'notifs'];
J.backup = {
  IDB_KEYS,
  async export(opts = {}) {
    const st = JSON.parse(JSON.stringify(J.state)); for (const k of Object.keys(st.settings || {})) if (SECRET.test(k)) st.settings[k] = '';
    const idb = {}; const keys = [...IDB_KEYS, ...(J.threads?.list() || []).filter(t => t.id !== 'main').flatMap(t => ['history', 'items', 'summary'].map(x => J.threads.key(x, t.id)))];
    for (const k of keys) { if (opts.skip?.includes(k)) continue; try { const v = await J.store.get(k, null); if (v != null) idb[k] = v; } catch (e) { } }
    return { app: 'jarvis-os', exportVersion: 2, exported: new Date().toISOString(), state: st, idb };
  },
  /* co jest w pliku (do pytania „scalić czy zastąpić?”) */
  preview(d) {
    const st = d?.exportVersion === 2 ? d.state : d; if (!st || typeof st !== 'object' || !st.settings) throw new Error('To nie jest kopia danych Jarvis OS.');
    const n = k => Array.isArray(st[k]) ? st[k].length : 0;
    return { version: d.exportVersion || 1, notes: n('notes'), tasks: n('tasks'), widgets: n('widgets'), shortcuts: n('shortcuts'), layouts: Object.keys(st.layouts || {}).length, idb: Object.keys(d.idb || {}).length, text: n('notes') + ' notatek, ' + n('tasks') + ' zadań, ' + n('widgets') + ' widgetów, ' + n('shortcuts') + ' skrótów, ' + Object.keys(st.layouts || {}).length + ' układów' + (d.idb ? ', ' + Object.keys(d.idb).length + ' magazynów (rozmowy, pamięć, dziennik)' : '') };
  },
  /* mode: 'merge' (po id; istniejące zostają, dochodzą nowe) albo 'replace' (zastąp wszystko poza kluczami API) */
  async import(d, mode = 'merge') {
    J.backup.preview(d);
    const st = d.exportVersion === 2 ? d.state : d, cur = J.state, keep = {}; for (const k of Object.keys(cur.settings)) if (SECRET.test(k)) keep[k] = cur.settings[k];
    if (mode === 'replace') { Object.keys(st).forEach(k => { cur[k] = st[k]; }); cur.settings = { ...J.DEFAULTS().settings, ...st.settings, ...keep }; }
    else {
      for (const k of ID_ARRAYS) { const have = new Set((cur[k] || []).map(x => x.id)); cur[k] = [...(cur[k] || []), ...(st[k] || []).filter(x => x && !have.has(x.id))]; }
      cur.layouts = { ...(st.layouts || {}), ...(cur.layouts || {}) };
      cur.settings = { ...st.settings, ...cur.settings, ...keep };
      cur.tasks.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    }
    for (const [k, v] of Object.entries(d.idb || {})) {
      if (mode === 'merge' && k === 'memory.facts') { const have = await J.store.get(k, []); const ids = new Set(have.map(f => f.id)); await J.store.set(k, [...have, ...v.filter(f => !ids.has(f.id))]); continue; }
      if (mode === 'merge' && (await J.store.get(k, null)) != null && /^chat\./.test(k)) continue;   // przy scalaniu nie nadpisujemy bieżących rozmów
      await J.store.set(k, v);
    }
    J.memory?.reload?.(); J.saveNow(); return J.backup.preview(d);
  },
  /* czyszczenie wybranych danych: all | chat | jevlog | windows */
  async clear(what) {
    if (what === 'chat') { for (const t of J.threads.list()) for (const x of ['history', 'items', 'summary']) await J.store.del(J.threads.key(x, t.id)); J.brain?.reset(); J.chat?.reset(); return 'Wyczyściłem rozmowy.'; }
    if (what === 'jevlog') { J.judge?.log.clear(); return 'Wyczyściłem dziennik Jeva.'; }
    if (what === 'windows') { J.state.winPos = {}; J.state.ui.closedStack = []; J.save(); return 'Wyczyściłem zapamiętane pozycje okien.'; }
    return null;
  }
};
})();
