/* Test dymny w prawdziwej przeglądarce (Chromium przez Playwright):
   boot → polecenia lokalne → okna, notatki, zadania, widgety → potwierdzenie → pakiet kontekstu → paleta.
   Uruchomienie: node tests/e2e/smoke.js [url]   (domyślnie http://localhost:8090) */
'use strict';
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  if (!process.env.PLAYWRIGHT_MODULE) { console.error('Brak Playwrighta: npm i --no-save playwright (albo ustaw PLAYWRIGHT_MODULE na ścieżkę modułu).'); process.exit(2); }
  ({ chromium } = require(process.env.PLAYWRIGHT_MODULE));
}
const URL = process.argv[2] || process.env.JARVIS_URL || 'http://localhost:8090';
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); };

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGE: ' + String(e))); p.on('console', m => { if (m.type() === 'error' && !/net::ERR|Failed to load resource|blocked by CORS policy/.test(m.text())) errs.push('console: ' + m.text()); });   // CORS: strona testowa (:8090) to obcy origin dla żywego mostu/gatewaya — odmowa jest poprawna, nie jest błędem aplikacji
  await p.goto(URL + '/index.html?' + Date.now());
  await p.evaluate(() => { if (window.J) { const noop = () => { }; Object.defineProperty(J, 'save', { get: () => noop, set: () => { } }); Object.defineProperty(J, 'saveNow', { get: () => noop, set: () => { } }); } localStorage.clear(); localStorage.setItem('jarvis-os:v2', JSON.stringify({ settings: { hermesOn: false, skipBoot: true, speech: false, sound: false }, ui: { onboarded: true, tourDone: true } })); });   // zapis umierającej strony wyłączony NIEODWRACALNIE (defineProperty): flush w pagehide ani tabChannel.claim nie nadpiszą podmienionego stanu
  await p.reload(); await p.waitForTimeout(1000);
  /* ekran startowy: czekamy na przycisk (animacja bywa dłuższa na wolnej maszynie), potem na aktywny pulpit */
  try { await p.waitForSelector('#bootEnter.show', { timeout: 15000 }); await p.click('#bootEnter', { timeout: 5000 }); } catch (e) { await p.keyboard.press('Enter'); }
  await p.waitForFunction(() => document.querySelector('#app')?.classList.contains('on') && !document.querySelector('#boot:not(.hidden):not(.gone)')?.offsetParent, null, { timeout: 15000 }).catch(() => { });
  await p.waitForTimeout(1500);
  const say = async t => { const r = await p.evaluate(async t => { await J.brain.handle(t); return document.querySelector('#messages')?.lastElementChild?.textContent || ''; }, t); await p.waitForTimeout(250); return r; };
  const expect = async (t, re) => { const r = await say(t); assert(re.test(r), `„${t}” → ${r}`); return r; };
  await expect('otwórz notatnik', /Otwarto: Notatnik/);
  await expect('zanotuj: kupić mleko', /Utworzyłem notatkę/);
  await expect('dopisz do notatki kupić mleko: chleb i masło', /Dopisałem/);
  await expect('przypomnij mi o 18:00 trening', /Dodałem: „trening” — dziś o 18:00/);
  await expect('minutnik 5 minut', /Minutnik ustawiony na 05:00/);
  await expect('ile to 15% z 2400', /360/);
  await expect('jakie mam zadania', /trening/);
  await expect('otwórz harmonogram i ułóż okna', /Otwarto: Harmonogram\. Ułożyłem/);
  await expect('zapamiętaj, że pracuję zdalnie', /Zapamiętałem/);
  await expect('co o mnie wiesz', /pracuję zdalnie/);
  await expect('stwórz listę zakupy: mleko, chleb, jajka', /Utworzyłem widget „zakupy”/);
  await expect('odhacz trening', /Odhaczyłem: trening/);
  await expect('okno na lewo', /lewa połowa/);
  await expect('zatrzymaj minutnik', /Zatrzymałem minutnik/);
  await expect('tapeta aurora', /Tapeta: aurora/);
  await expect('pomoc', /Potrafię/);
  // potwierdzenie narzędzia ryzykownego (źródło: model) → chip przy Core → „Tak”
  const conf = p.evaluate(() => J.registry.run('close_app', { app: 'all' }, { source: 'hermes' }));
  await p.waitForTimeout(600);
  assert(await p.evaluate(() => document.querySelector('#askChip').classList.contains('show')), 'chip potwierdzenia widoczny');
  assert(await p.evaluate(() => J.engine.mode === 'APPROVAL_REQUIRED'), 'tryb APPROVAL_REQUIRED');
  // dostępność pytania: widoczne = nie inert, fokus na pierwszym przycisku, etykieta = treść pytania
  const a11y = await p.evaluate(() => { const c = document.querySelector('#askChip'); return { inert: c.inert, focusIn: c.contains(document.activeElement), label: document.getElementById(c.getAttribute('aria-labelledby'))?.textContent || '' }; });
  assert(!a11y.inert && a11y.focusIn && a11y.label.length > 3, 'pytanie dostępne z klawiatury i czytnika: ' + JSON.stringify(a11y));
  await p.click('#askChip .btn.primary');
  const cr = await conf; assert(cr.ok && cr.data.closed >= 2, 'zamknięto okna: ' + JSON.stringify(cr));
  await p.waitForTimeout(100);
  assert(await p.evaluate(() => document.querySelector('#askChip').inert), 'schowane pytanie poza kolejnością Tab (inert)');
  assert(await p.evaluate(() => J.widgets.list.length === 1), 'widget przetrwał zamknięcie okien');
  // odmowa → DENIED
  const den = p.evaluate(() => J.registry.run('notes_delete', { note: 'kupić mleko' }, { source: 'hermes' }));
  await p.waitForTimeout(500); await p.click('#askChip .btn.danger');
  assert((await den).code === 'DENIED', 'odmowa daje DENIED');
  // ui_ask z odpowiedzią przez czat
  const ask = p.evaluate(() => J.registry.run('ui_ask', { question: 'Która notatka?', options: ['Zakupy', 'Projekty'] }, { source: 'hermes' }));
  await p.waitForTimeout(500);
  await p.evaluate(() => J.brain.handle('Projekty'));
  const ar = await ask; assert(ar.ok && ar.data.answer === 'Projekty', 'odpowiedź z czatu trafia do ui_ask: ' + JSON.stringify(ar));
  // pakiet kontekstu, narzędzia, powiadomienia, podświetlanie
  const misc = await p.evaluate(() => { const pk = J.context.packet({ full: true }); J.notice({ title: 'Test', body: 'x', kind: 'agent' }); return { tools: J.registry.tools().length, keys: Object.keys(pk).length, note: J.state.notes[0].body, unread: J.notifs.unread(), hl: J.ui.highlight('dock', 'Dok') }; });
  assert(misc.tools >= 50 && misc.keys >= 10 && /chleb i masło/.test(misc.note) && misc.unread >= 1 && misc.hl, 'misc ' + JSON.stringify(misc));
  // paleta: dopasowanie lokalne wykonuje polecenie
  await p.keyboard.press('Escape'); await p.keyboard.press('Control+K'); await p.waitForTimeout(300);
  await p.keyboard.type('minutnik 25 min'); await p.waitForTimeout(300); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
  assert(await p.evaluate(() => J.timer.running && J.timer.total === 1500000), 'paleta uruchomiła minutnik 25 min');
  await p.evaluate(() => J.timer.stop());
  // trwałość: historia czatu i pamięć po przeładowaniu
  await p.waitForTimeout(800); await p.reload(); await p.waitForTimeout(1200);
  try { await p.click('#bootEnter', { timeout: 3000 }); } catch (e) { await p.keyboard.press('Enter'); }
  await p.waitForTimeout(1200);
  const persisted = await p.evaluate(async () => ({ hist: (await J.store.get('chat.history', [])).length, facts: (await J.memory.all()).length, notes: J.state.notes.length, widgets: J.widgets.list.length }));
  assert(persisted.hist >= 10 && persisted.facts === 1 && persisted.notes === 2 && persisted.widgets === 1, 'trwałość ' + JSON.stringify(persisted));
  // historia zadań mieszka w IndexedDB, a główny klucz localStorage jest lekki (bez historii)
  const store = await p.evaluate(async () => ({ idb: (await J.store.get('proc.history', [])).length, blob: JSON.parse(localStorage.getItem('jarvis-os:v2')).history.length, migrated: J.historyMigrated === true, ready: J.store.ready }));
  assert(store.idb >= 1 && store.blob === 0 && store.migrated && store.ready, 'historia w IndexedDB ' + JSON.stringify(store));
  // model nigdy nie dostaje kluczy API (settings_get)
  const leak = await p.evaluate(async () => { J.state.settings.jevKey = 'sk-or-SEKRET'; J.state.settings.openrouterKey = 'sk-or-SEKRET2'; const r = await J.registry.run('settings_get', {}, { source: 'hermes' }); J.state.settings.jevKey = ''; J.state.settings.openrouterKey = ''; return JSON.stringify(r); });
  assert(!/SEKRET/.test(leak), 'wyciek kluczy w settings_get');
  // wygląd: brak jasnych „białych” przycisków w oknach, karty HUD nie nachodzą na pasek zadania ani dok (też na niskim ekranie)
  const white = await p.evaluate(async () => { for (const a of ['schedule', 'settings', 'terminal']) { J.wm.open(a); await new Promise(r => setTimeout(r, 200)); } const light = c => { const m = c.match(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/); if (!m) return false; const al = m[4] === undefined ? 1 : +m[4]; return al > .6 && (+m[1] + +m[2] + +m[3]) / 3 > 200; }; const bad = [...document.querySelectorAll('.window button')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && !e.classList.contains('wall') && light(getComputedStyle(e).backgroundColor); }).map(e => e.className); J.wm.closeAll(); return bad; });
  assert(white.length === 0, 'jasne przyciski w oknach: ' + white.join(','));
  for (const [w, h] of [[1280, 720], [1440, 800], [1600, 900]]) {
    await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(400);
    await p.evaluate(() => { J.ev.emit('task.created', { title: 'Test układu', task_id: 'lay1' }); J.orb.set('thinking', 'analizuję'); });
    await p.waitForTimeout(1300);
    const bad = await p.evaluate(() => { const rc = s => document.querySelector(s)?.getBoundingClientRect(), banner = rc('#task'), dock = rc('#dock'), top = rc('.topbar'); const hit = (a, b) => b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; const cards = [...document.querySelectorAll('.hc')].map(e => ({ id: e.dataset.id, r: e.getBoundingClientRect() })); const out = []; cards.forEach(c => { if (hit(c.r, banner)) out.push(c.id + '×baner'); if (hit(c.r, dock)) out.push(c.id + '×dok'); if (c.r.top < top.bottom) out.push(c.id + '×pasek'); }); return out; });
    assert(bad.length === 0, 'kolizje HUD przy ' + w + 'x' + h + ': ' + bad.join(','));
    await p.evaluate(() => { J.ev.emit('task.completed', { title: 'x', task_id: 'lay1' }); }); await p.waitForTimeout(300);
  }
  // ===== W1: okna, widoki, cofanie, UI przez rejestr =====
  await p.evaluate(() => { J.state.settings.jevOn = false; J.emit('settings'); J.wm.closeAll(); });
  await expect('pokaż stoper', /Minutnik/);
  assert(await p.evaluate(() => J.apps.timer.state(J.wm.ctx('timer')).view) === 'stopwatch', 'widok stopera');
  await expect('przypnij minutnik', /na wierzchu/);
  assert(await p.evaluate(() => document.querySelector('.window[data-app="timer"]').classList.contains('pinned')), 'klasa pinned');
  await expect('zamknij minutnik', /Zamknięto/);
  await p.keyboard.press('Control+Shift+T'); await p.waitForTimeout(300);
  assert(await p.evaluate(() => J.wm.isOpen('timer')), 'Ctrl Shift T otwiera ponownie');
  // zmiana rozmiaru lewą krawędzią
  await p.evaluate(() => { J.wm.open('notes'); J.wm.move('notes', 300, 120); J.wm.resize('notes', 620, 420); }); await p.waitForTimeout(600);   // koniec animacji otwierania
  const box = await p.evaluate(() => { const r = document.querySelector('.window[data-app="notes"] .rz-w').getBoundingClientRect(); return { x: r.left + 2, y: r.top + r.height / 2 }; });
  await p.mouse.move(box.x, box.y); await p.mouse.down(); await p.mouse.move(box.x - 80, box.y, { steps: 5 }); await p.mouse.up();
  const nw = await p.evaluate(() => J.wm.info().find(w => w.id === 'notes'));
  assert(nw.w >= 690 && nw.x <= 225, 'lewa krawędź: ' + JSON.stringify(nw));
  // Harmonogram: kliknięcia przez rejestr (Process Log / cofanie)
  await p.evaluate(() => J.wm.open('schedule')); await p.waitForTimeout(300);
  await p.fill('.window[data-app="schedule"] #tx', 'test W1'); await p.press('.window[data-app="schedule"] #tx', 'Enter'); await p.waitForTimeout(300);
  assert(await p.evaluate(() => J.state.tasks.some(t => t.text === 'test W1')), 'zadanie z formularza');
  await p.click('.window[data-app="schedule"] .task:has-text("test W1") .del'); await p.waitForTimeout(300);
  assert(await p.evaluate(() => !J.state.tasks.some(t => t.text === 'test W1')), 'usunięte przyciskiem');
  await p.waitForSelector('#undoChip.show', { timeout: 2000 });
  await p.click('body', { position: { x: 5, y: 400 } }); await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
  assert(await p.evaluate(() => J.state.tasks.some(t => t.text === 'test W1')), 'Ctrl Z przywraca usunięte zadanie');
  // menu okna prawym przyciskiem na nagłówku
  const hb = await p.evaluate(() => { const r = document.querySelector('.window[data-app="schedule"] .win-head b').getBoundingClientRect(); return { x: r.left + 5, y: r.top + 5 }; });
  await p.mouse.click(hb.x, hb.y, { button: 'right' }); await p.waitForTimeout(200);
  assert(await p.evaluate(() => /Przypnij na wierzchu/.test(document.querySelector('.ctx')?.textContent || '')), 'menu okna');
  await p.keyboard.press('Escape');
  // ===== W2: paleta z wyszukiwaniem, link #go, tryb prezentacji, ustawienia, wątki =====
  await p.evaluate(() => { J.notes.add('Faktura za prąd', 'zapłacić do 10'); J.wm.closeAll(); });
  await p.keyboard.press('Control+k'); await p.waitForTimeout(200); await p.keyboard.type('faktra'); await p.waitForTimeout(250);
  const palTxt = await p.evaluate(() => document.querySelector('#paletteList').textContent);
  assert(/Notatki/.test(palTxt) && /Faktura za prąd/.test(palTxt), 'paleta: notatka z literówką ' + palTxt.slice(0, 200));
  await p.evaluate(() => { const b = [...document.querySelectorAll('#paletteList .pitem')].find(x => /Faktura za prąd/.test(x.textContent)); b.click(); }); await p.waitForTimeout(400);
  assert(await p.evaluate(() => J.wm.isOpen('notes') && J.apps.notes.state(J.wm.ctx('notes')).title === 'Faktura za prąd'), 'paleta otwiera notatkę');
  await p.evaluate(() => { location.hash = 'go=schedule/day/2026-10-02'; }); await p.waitForTimeout(600);
  assert(await p.evaluate(() => J.wm.isOpen('schedule') && J.apps.schedule.state(J.wm.ctx('schedule')).day === '2026-10-02' && !/go=/.test(location.hash)), 'link #go');
  await expect('tryb prezentacji', /prezentacji/);
  assert(await p.evaluate(() => getComputedStyle(document.querySelector('#chatPanel')).display === 'none'), 'prezentacja chowa czat');
  await expect('tryb pracy', /pracy/);
  await p.evaluate(() => J.wm.open('settings')); await p.waitForTimeout(500);
  await p.fill('.window[data-app="settings"] #setFind', 'powiadomienia'); await p.waitForTimeout(300);
  const st = await p.evaluate(() => ({ hit: !!document.querySelector('.window[data-app="settings"] .set-hit'), nt: document.querySelectorAll('#ntList .row').length, kb: document.querySelectorAll('#kbList .row').length, chips: document.querySelectorAll('.set-chips .chip').length }));
  assert(st.hit && st.nt >= 8 && st.kb >= 10 && st.chips >= 16, 'ustawienia W2 ' + JSON.stringify(st));
  const diag = await p.evaluate(async () => (await J.diagnostics()).length); assert(diag >= 9, 'testy diagnostyczne');
  await p.evaluate(async () => { J.chatPanel.show(); await J.uiRun('chat_thread', { op: 'new', name: 'Test W2' }, { offer: false }); }); await p.waitForTimeout(300);
  assert(await p.evaluate(() => document.querySelector('#chatThread')?.selectedOptions[0]?.textContent === 'Test W2'), 'wątek w nagłówku czatu');
  await p.evaluate(async () => { await J.uiRun('chat_thread', { op: 'switch', name: 'Ogólny' }, { offer: false }); J.wm.closeAll(); });
  // ===== W3: Notatnik (tagi, kosz, podgląd Markdown), Harmonogram (podzadania, zaległe), Minutnik (lista), Pliki, widget zwinięty =====
  await p.evaluate(() => { J.chatPanel.hide?.(); const n = J.notes.add('Test W3', '# Nagłówek\n- punkt **mocny**'); J.wm.open('notes', { view: 'note', target: n.id }); }); await p.waitForTimeout(400);
  await p.fill('.window[data-app="notes"] #nTags', 'praca, dom'); await p.dispatchEvent('.window[data-app="notes"] #nTags', 'change'); await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector('.window[data-app="notes"] #nPrevB').click()); await p.waitForTimeout(200);
  const w3n = await p.evaluate(() => ({ tags: J.state.notes.find(n => n.title === 'Test W3').tags.join(','), h: document.querySelector('.window[data-app="notes"] #nPrev h3')?.textContent, strong: !!document.querySelector('.window[data-app="notes"] #nPrev strong'), chips: [...document.querySelectorAll('.window[data-app="notes"] .nt-filters .chip')].map(c => c.textContent).join('|') }));
  assert(w3n.tags === 'praca,dom' && w3n.h === 'Nagłówek' && w3n.strong && /#praca/.test(w3n.chips), 'Notatnik W3 ' + JSON.stringify(w3n));
  await p.evaluate(() => document.querySelector('.window[data-app="notes"] #nDel').click()); await p.waitForTimeout(300);
  await p.evaluate(() => J.uiRun('app_view', { app: 'notes', view: 'trash' })); await p.waitForTimeout(300);
  assert(await p.evaluate(() => /Test W3/.test(document.querySelector('.window[data-app="notes"] #nList').textContent) && !document.querySelector('.window[data-app="notes"] #nTrashFoot').hidden), 'kosz w Notatniku');
  await p.evaluate(() => document.querySelector('.window[data-app="notes"] #nRestore').click()); await p.waitForTimeout(300);
  assert(await p.evaluate(() => !J.state.notes.find(n => n.title === 'Test W3').deleted), 'przywrócenie z kosza');
  await p.evaluate(() => { const t = J.tasks.add('10:00', 'Zadanie W3', J.today()); J.wm.open('schedule', { view: 'day', target: J.today() }); window.__t3 = t.id; }); await p.waitForTimeout(400);
  await p.evaluate(() => document.querySelector('.window[data-app="schedule"] .task[data-id="' + window.__t3 + '"] .n').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))); await p.waitForTimeout(200);
  await p.fill('.window[data-app="schedule"] .subtasks input.input', 'krok A'); await p.press('.window[data-app="schedule"] .subtasks input.input', 'Enter'); await p.waitForTimeout(300);
  assert(await p.evaluate(() => J.state.tasks.find(t => t.id === window.__t3).subtasks.length === 1), 'podzadanie z Harmonogramu');
  await p.evaluate(() => document.querySelector('.window[data-app="schedule"] .task[data-id="' + window.__t3 + '"] .pdot').click()); await p.waitForTimeout(200);
  assert(await p.evaluate(() => J.state.tasks.find(t => t.id === window.__t3).priority === 'high'), 'kropka priorytetu');
  await p.evaluate(() => document.querySelector('.window[data-app="schedule"] #sv button[data-v="week"]').click()); await p.waitForTimeout(200);
  assert(await p.evaluate(() => J.apps.schedule.state(J.wm.ctx('schedule')).view === 'week' && /Zadanie W3/.test(document.querySelector('.window[data-app="schedule"] #tl').textContent)), 'widok tygodnia');
  await p.evaluate(async () => { await J.uiRun('start_timer', { seconds: 300, label: 'Herbata' }, { offer: false }); await J.uiRun('start_timer', { seconds: 600, label: 'Pranie' }, { offer: false }); J.wm.open('timer'); }); await p.waitForTimeout(700);
  assert(await p.evaluate(() => document.querySelectorAll('.window[data-app="timer"] .tm-row').length === 1 && /Pranie/.test(document.querySelector('.window[data-app="timer"] #tml').textContent)), 'lista minutników');
  await p.evaluate(() => document.querySelector('.window[data-app="timer"] .tm-row [data-a="s"]').click()); await p.waitForTimeout(300);
  assert(await p.evaluate(() => J.timers.all().length === 1), 'zatrzymanie drugiego minutnika');
  await p.evaluate(() => { J.timers.all().forEach(t => t.stop()); J.wm.open('files'); }); await p.waitForTimeout(400);
  assert(await p.evaluate(() => /Chrome|Edge|folder/i.test(document.querySelector('.window[data-app="files"] #flList').textContent)), 'Pliki: stan bez folderu');
  await p.evaluate(async () => { const w = J.widgets.create('list', { title: 'Lista W3', items: ['a'] }); await new Promise(r => setTimeout(r, 100)); await J.uiRun('widget_collapse', { widget: w.id, on: true }); window.__w3 = w.id; }); await p.waitForTimeout(200);
  assert(await p.evaluate(() => document.querySelector('.window[data-app="w:' + window.__w3 + '"]').classList.contains('collapsed') && getComputedStyle(document.querySelector('.window[data-app="w:' + window.__w3 + '"] .win-body')).display === 'none'), 'zwinięty widget');
  await p.evaluate(() => { J.widgets.remove(window.__w3, { silent: true }); J.wm.closeAll(); });
  // ===== W4: widget z opisu (bez HTML z opisu), wykres, rutyna z paskiem kroków =====
  await p.evaluate(async () => { await J.uiRun('widget_build', { spec: { v: 1, title: 'Test W4', tone: 'purple', blocks: [{ kind: 'text', text: '<img src=x onerror=window.__pwned=1>' }, { kind: 'markdown', text: '**gruby** i [link](https://example.com)' }, { kind: 'countdown', until: '2099-01-01T00:00', label: 'do końca' }, { kind: 'buttons', buttons: [{ label: 'Otwórz notatnik', command: 'open_app', args: { app: 'notes' } }] }] } }, { offer: false }); });
  await p.waitForTimeout(500);
  const w4 = await p.evaluate(() => { const w = J.widgets.list.find(x => x.title === 'Test W4'), el = document.querySelector('.window[data-app="w:' + w.id + '"]'); return { img: !!el.querySelector('img'), pwned: !!window.__pwned, txt: el.querySelector('.ws-text').textContent, strong: el.querySelector('.md strong')?.textContent, clock: el.querySelector('.ws-clock').textContent, id: w.id }; });
  assert(!w4.img && !w4.pwned && /onerror/.test(w4.txt) && w4.strong === 'gruby' && /\d+ d \d\d:\d\d:\d\d/.test(w4.clock), 'widget z opisu ' + JSON.stringify(w4));
  await p.evaluate(id => [...document.querySelectorAll('.window[data-app="w:' + id + '"] .ws-btns button')].find(b => /notatnik/.test(b.textContent)).click(), w4.id); await p.waitForTimeout(300);
  assert(await p.evaluate(() => J.wm.isOpen('notes')), 'przycisk w widgecie uruchamia polecenie');
  await p.evaluate(async () => { J.tasks.add('09:00', 'W4 a', J.today()); await J.uiRun('chart_show', { source: 'tasks_week' }, { offer: false }); }); await p.waitForTimeout(600);
  const cw = await p.evaluate(() => { const w = J.widgets.list.filter(x => x.type === 'spec').pop(); const c = document.querySelector('.window[data-app="w:' + w.id + '"] canvas.ws-chart'); return c ? c.width : -1; });
  assert(cw > 0, 'wykres narysowany na canvas: ' + cw);
  const rt = await p.evaluate(async () => { const r = await J.uiRun('routine_create', J.cmdKit.parseRoutine('zrób rutynę test w4: otwórz kalkulator i otwórz minutnik'), { offer: false }); if (!r.ok) return r.text; const r2 = await J.uiRun('routine_run', { name: 'test w4' }, { offer: false }); return r2.text + '|' + J.wm.isOpen('calc') + J.wm.isOpen('timer'); });
  assert(/truetrue$/.test(rt), 'rutyna w przeglądarce: ' + rt);
  await p.evaluate(() => J.wm.open('settings', { view: 'section', target: 'agent' })); await p.waitForTimeout(400);
  assert(await p.evaluate(() => /test w4/.test(document.querySelector('#rtList').textContent)), 'rutyna w Ustawieniach');
  await p.evaluate(() => { J.widgets.list.filter(x => x.type === 'spec').forEach(w => J.widgets.remove(w.id, { silent: true })); J.state.routines = []; J.wm.closeAll(); });
  // ===== W5: poziom efektów (computed style), minimapa, załącznik w czacie, porównanie w Process Log =====
  await p.evaluate(() => J.uiRun('fx_level', { level: 'off' }, { offer: false })); await p.waitForTimeout(200);
  const fxs = await p.evaluate(() => { J.wm.open('notes'); const el = document.querySelector('.window[data-app="notes"]'); return { attr: document.querySelector('#app').dataset.fx, tr: getComputedStyle(el).transitionDuration, an: getComputedStyle(el).animationName }; });
  assert(fxs.attr === 'off' && /^0s/.test(fxs.tr) && fxs.an === 'none', 'fx off: ' + JSON.stringify(fxs));
  await p.evaluate(() => J.uiRun('fx_level', { level: 'standard' }, { offer: false }));
  await p.evaluate(() => { J.state.settings.minimap = true; J.emit('settings'); J.wm.open('calc'); }); await p.waitForTimeout(300);
  assert(await p.evaluate(() => document.querySelectorAll('.minimap .mm-w').length >= 2), 'minimapa pokazuje okna');
  await p.evaluate(() => { J.state.settings.minimap = false; J.emit('settings'); });
  await p.evaluate(async () => { J.chatPanel.show(); J.notes.add('Załącznik W5', 'treść załącznika'); await J.uiRun('chat_attach', { note: 'Załącznik W5' }, { offer: false }); }); await p.waitForTimeout(200);
  assert(await p.evaluate(() => /Załącznik W5/.test(document.querySelector('#chatAtt')?.textContent || '')), 'chip załącznika w czacie');
  await p.evaluate(() => { J.attach.clear(); J.wm.closeAll(); });
  // ===== Dodatki: zaznaczanie wielu notatek + akcja zbiorowa z „Cofnij”, notatka przeciągnięta do Harmonogramu, historia kalkulatora, sekcja Jarvis =====
  await p.evaluate(() => { ['Bulk 1', 'Bulk 2', 'Bulk 3'].forEach(t => J.notes.add(t, 'x')); J.wm.open('notes'); }); await p.waitForTimeout(300);
  await p.evaluate(() => { const b = t => [...document.querySelectorAll('.window[data-app="notes"] .note-item')].find(x => x.textContent.includes(t)); b('Bulk 1').click(); b('Bulk 3').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })); });
  await p.waitForTimeout(200);
  assert(await p.evaluate(() => /Zaznaczono: 3/.test(document.querySelector('.window[data-app="notes"] .nt-bulk')?.textContent || '')), 'zaznaczanie wielu (Shift)');
  await p.evaluate(() => document.querySelector('.window[data-app="notes"] .nt-bulk [data-a="trash"]').click()); await p.waitForTimeout(200);
  assert(await p.evaluate(() => J.notes.trashed().filter(n => /^Bulk/.test(n.title)).length === 3), 'akcja zbiorowa: do kosza');
  await p.evaluate(() => J.undo.run()); await p.waitForTimeout(200);
  assert(await p.evaluate(() => J.notes.live().filter(n => /^Bulk/.test(n.title)).length === 3), 'jedno Cofnij przywraca wszystkie');
  await p.evaluate(() => J.wm.open('schedule', { view: 'day', target: J.today() })); await p.waitForTimeout(300);
  await p.evaluate(() => { const dt = new DataTransfer(), src = [...document.querySelectorAll('.window[data-app="notes"] .note-item')].find(x => x.textContent.includes('Bulk 2')); src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt })); const tl = document.querySelector('.window[data-app="schedule"] #tl'); tl.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })); tl.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })); });
  await p.waitForTimeout(300);
  assert(await p.evaluate(() => J.state.tasks.some(t => t.text === 'Bulk 2' && t.note)), 'notatka przeciągnięta do Harmonogramu = zadanie');
  await p.evaluate(() => J.wm.open('calc', { view: 'expr', target: '6*7' })); await p.waitForTimeout(300);
  await p.evaluate(() => { document.querySelector('.window[data-app="calc"] .calc-keys .eq').click(); document.querySelector('.window[data-app="calc"] #chB').click(); });
  assert(await p.evaluate(() => /6\*7 =\s*42/.test(document.querySelector('.window[data-app="calc"] #chL').textContent)), 'historia kalkulatora');
  await p.evaluate(() => J.wm.open('monitor')); await p.waitForTimeout(1300);
  assert(await p.evaluate(() => /^\d+$/.test(document.querySelector('#jAct')?.textContent || '')), 'Monitor: sekcja Jarvis');
  await p.evaluate(() => J.wm.closeAll());
  // ===== Jev (atrapa usługi przez przechwycenie żądań): szybka ścieżka, wartość z listy, „Cofnij”, odpowiedzi tak/nie, panel ustawień =====
  const jevCalls = [];
  await p.route('**/api/v1/systemone', async route => {
    const body = JSON.parse(route.request().postData() || '{}'); jevCalls.push(Object.keys(body.questions));
    const u = String(body.state?.utterance || '').toLowerCase().replace(/[ąćęłńóśźż]/g, c => ({ ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' })[c]), answers = {};
    for (const [id, q] of Object.entries(body.questions)) {
      const keys = q.type === 'choice' ? Object.keys(q.criteria) : [];
      if (id === 'intent') { const want = /zapiski/.test(u) ? 'open_app' : /kupic mleko/.test(u) ? 'add_task' : 'unclear'; answers[id] = { type: 'choice', choice: keys.includes(want) ? want : 'unclear', confidence: .96, probabilities: {} }; }
      else if (id.startsWith('slot_')) answers[id] = { type: 'choice', choice: keys.includes('notes') ? 'notes' : 'none', confidence: .95, probabilities: {} };
      else if (id === 'ans') answers[id] = { type: 'choice', choice: 'opt0', confidence: .97, probabilities: {} };
      else if (q.type === 'noul') answers[id] = { type: 'noul', noul: .05 };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ model: 'jev-mock', answers, usage: { input_tokens: 3000, output_tokens: 20, cost: 0.000126 } }) });
  });
  await p.evaluate(() => { J.state.settings.jevOn = true; J.state.settings.jevKey = 'sk-or-test'; J.state.settings.jevFast = true; J.emit('settings'); });
  await p.evaluate(() => { J.wm.close('notes'); });
  const before = jevCalls.length; await expect('otwórz notatnik', /Otwarto: Notatnik/); assert(jevCalls.length === before, 'szybka ścieżka nie powinna wołać Jeva');
  await p.evaluate(() => { J.wm.close('notes'); });
  await expect('pokaż mi te zapiski', /Otwarto: Notatnik/); assert(jevCalls.length > before, 'Jev powinien zdecydować o „pokaż mi te zapiski”');
  const tasksBefore = await p.evaluate(() => J.state.tasks.length);
  await say('przypomnij mi kupić mleko o 19:00');
  assert(await p.evaluate(() => J.state.tasks.length) === tasksBefore + 1, 'zadanie dodane przez Jeva');
  await p.waitForSelector('#undoChip.show', { timeout: 3000 });
  await p.click('#undoChip button'); await p.waitForTimeout(400);
  assert(await p.evaluate(() => J.state.tasks.length) === tasksBefore, 'przycisk Cofnij usunął zadanie');
  // odpowiedź „no dobra” na pytanie tak/nie rozumie Jev, a nie słowo „no”
  const ans = await p.evaluate(async () => { const pr = J.ask('Czy kontynuować?', [{ label: 'Tak', value: 'yes', primary: true }, { label: 'Nie', value: 'no' }], { speak: false, timeout: 8000 }); await new Promise(r => setTimeout(r, 200)); J.ask.answer('no dobra'); return await pr; });
  assert(ans === 'yes', 'D15: „no dobra” → ' + ans);
  // dostępność pulpitu: toasty ogłaszane, karty HUD to przyciski obsługiwane klawiaturą, schowany HUD poza kolejnością Tab
  const hudA = await p.evaluate(() => { const hud = document.querySelector('#hud'), cards = [...document.querySelectorAll('#hud .hc')], t = document.querySelector('#toasts');
    const st = cards.find(c => c.dataset.id === 'status'); st.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return { live: t.getAttribute('aria-live'), n: cards.length, buttons: cards.every(c => c.getAttribute('role') === 'button' && c.tabIndex === 0), inertOk: hud.inert === !hud.classList.contains('show'), monitor: J.wm.isOpen('monitor') }; });
  assert(hudA.live === 'polite' && hudA.n === 10 && hudA.buttons && hudA.inertOk && hudA.monitor, 'dostępność pulpitu: ' + JSON.stringify(hudA));
  // ustawienia: panel Jeva ma nowe kontrolki i zapisuje wartości
  await p.evaluate(() => J.wm.open('settings', 'jev')); await p.waitForTimeout(500);
  const ui = await p.evaluate(() => { const g = id => document.querySelector('#' + id); const need = ['jvPrivacy', 'jvAuto', 'jvA3', 'jvA2', 'jvBudget', 'jvFast', 'jvShadow', 'jvLogText', 'jvExport', 'jvResetAdapt', 'jvStats']; const miss = need.filter(i => !g(i)); if (miss.length) return 'brak: ' + miss.join(','); g('jvPrivacy').value = 'P0'; g('jvPrivacy').dispatchEvent(new Event('change')); return J.state.settings.jevPrivacy + '|' + g('jvStats').textContent.slice(0, 30); });
  assert(/^P0\|/.test(ui), 'panel Jeva: ' + ui);
  await p.evaluate(() => { J.state.settings.jevPrivacy = 'P1'; J.state.settings.jevOn = false; J.emit('settings'); });
  await p.setViewportSize({ width: 1600, height: 900 });
  if (process.env.SHOT) await p.screenshot({ path: path.join(process.env.SHOT, 'smoke.png') });
  await b.close();
  if (errs.length) { console.error('Błędy w konsoli:', errs); process.exit(1); }
  console.log('OK: smoke test przeszedł');
})().catch(e => { console.error(e); process.exit(1); });
