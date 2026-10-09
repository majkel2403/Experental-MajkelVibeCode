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
  await p.goto(URL + '/index.html?gov=0&' + Date.now());
  await p.evaluate(() => { if (window.J) { const noop = () => { }; Object.defineProperty(J, 'save', { get: () => noop, set: () => { } }); Object.defineProperty(J, 'saveNow', { get: () => noop, set: () => { } }); } localStorage.clear(); localStorage.setItem('jarvis-os:v2', JSON.stringify({ settings: { hermesOn: false, skipBoot: true, speech: false, sound: false }, ui: { onboarded: true, tourDone: true } })); });   // zapis umierającej strony wyłączony NIEODWRACALNIE (defineProperty): flush w pagehide ani tabChannel.claim nie nadpiszą podmienionego stanu
  await p.reload(); await p.waitForTimeout(1000);
  /* ekran startowy: czekamy na przycisk (animacja bywa dłuższa na wolnej maszynie), potem na aktywny pulpit */
  try { await p.waitForSelector('#bootEnter.show', { timeout: 15000 }); await p.click('#bootEnter', { timeout: 5000 }); } catch (e) { await p.keyboard.press('Enter'); }
  await p.waitForFunction(() => document.querySelector('#app')?.classList.contains('on') && !document.querySelector('#boot:not(.hidden):not(.gone)')?.offsetParent, null, { timeout: 15000 }).catch(() => { });
  await p.waitForTimeout(1500);
  // kontrakt bootu po wejściu: J.booted===true, J.bootEnter==null (wejście użytkownika)
  assert(await p.evaluate(() => J.booted === true && J.bootEnter == null && J.bootVia === 'user'), 'po wejściu: J.booted===true, J.bootEnter==null, bootVia=user');
  // wejście z mostu w trakcie animacji startowej (druga, czysta karta bez skipBoot): J.bootEnter() przed końcem animacji kończy się wejściem
  { const c2 = await b.newContext({ viewport: { width: 1280, height: 720 } }), p2 = await c2.newPage();
    await p2.goto(URL + '/index.html?gov=0&' + Date.now());
    await p2.evaluate(() => { localStorage.clear(); localStorage.setItem('jarvis-os:v2', JSON.stringify({ settings: { hermesOn: false, skipBoot: false, speech: false, sound: false }, ui: { onboarded: true, tourDone: true } })); });
    await p2.reload(); await p2.waitForFunction(() => typeof window.J?.bootEnter === 'function', null, { timeout: 15000 });
    assert(await p2.evaluate(() => !document.querySelector('#bootEnter.show') && J.booted !== true), 'animacja startowa jeszcze trwa');
    await p2.evaluate(() => J.bootEnter());
    await p2.waitForFunction(() => J.booted === true && document.querySelector('#app')?.classList.contains('on'), null, { timeout: 15000 });
    assert(await p2.evaluate(() => J.bootEnter == null && J.bootVia === 'bridge'), 'wejście z mostu przed końcem animacji: bootEnter zdjęty, bootVia=bridge');
    await c2.close(); }
  /* ekran startowy Fazy 6: realne etapy w logu (bez fikcji), chipy i pasek = zrealizowane etapy, przejście bez filter na pełnym ekranie, brak transformów kart po wjeździe; poziom off i „ogranicz ruch” */
  const bootCard = async (settings, ctxOpts = {}) => {
    const c = await b.newContext({ viewport: { width: 1280, height: 720 }, ...ctxOpts }), q = await c.newPage();
    await q.goto(URL + '/index.html?gov=0&' + Date.now());
    await q.evaluate(st => { if (window.J) { const n = () => { }; Object.defineProperty(J, 'save', { get: () => n, set: () => { } }); Object.defineProperty(J, 'saveNow', { get: () => n, set: () => { } }); } localStorage.clear(); localStorage.setItem('jarvis-os:v2', JSON.stringify({ settings: { hermesOn: false, skipBoot: false, speech: false, sound: false, ...st }, ui: { onboarded: true, tourDone: true } })); }, settings);
    await q.reload(); return { c, q };
  };
  { const { c, q } = await bootCard({});
    await q.waitForSelector('#bootEnter.show', { timeout: 15000 });
    const L = await q.evaluate(() => ({ log: [...document.querySelectorAll('#bootLog>div')].map(d => d.textContent), on: document.querySelectorAll('#bootChips i.on').length, bar: document.querySelector('#bootBar').style.transform, pct: document.querySelector('#bootPct').textContent, fx: document.querySelector('#boot').dataset.fx }));
    assert(L.log.length === 6 && /moduły: \d+ skrypt/.test(L.log[0]) && /stan: \d+ notat/.test(L.log[1]) && /service worker/.test(L.log[2]) && /Hermes/.test(L.log[3]) && /efekty: /.test(L.log[4]) && /pulpit gotowy/.test(L.log[5]), 'boot: 6 realnych etapów w logu: ' + L.log.join(' | '));
    assert(!/BIOS|reaktor|GJ\/s|kalibracj/i.test(L.log.join('\n')), 'boot: brak fikcyjnych linii');
    assert(L.on === 6 && L.bar === 'scaleX(1)' && L.pct === '100%', 'boot: chipy i pasek = wszystkie etapy zrealizowane ' + JSON.stringify(L));
    await q.click('#bootEnter');
    await q.waitForFunction(() => document.querySelector('#boot.out') || !document.querySelector('#boot'), null, { timeout: 5000 });
    assert(await q.evaluate(() => { const b = document.querySelector('#boot'); return !b || (getComputedStyle(b).filter === 'none' && getComputedStyle(b).backdropFilter === 'none'); }), 'przejście boot→pulpit bez filter/backdrop-filter na pełnym ekranie');
    await q.waitForFunction(() => !document.querySelector('#boot') && !document.querySelector('#app.enter'), null, { timeout: 8000 });
    assert(await q.evaluate(() => [...document.querySelectorAll('.topbar,.dock,.deck,#hud .hc')].every(e => getComputedStyle(e).animationName === 'none') && getComputedStyle(document.querySelector('.topbar')).transform === 'none'), 'po wjeździe: karty/topbar bez animacji, topbar transform:none');
    await c.close(); }
  { const { c, q } = await bootCard({ fxLevel: 'off' });
    await q.waitForSelector('#bootEnter.show', { timeout: 15000 });
    assert(await q.evaluate(() => document.querySelector('#boot').dataset.fx === 'off' && getComputedStyle(document.querySelector('#boot .boot-title span')).animationName === 'none' && getComputedStyle(document.querySelector('#boot .gv')).animationName === 'none'), 'fx off: ekran startowy bez animacji (statyczny stan końcowy)');
    await q.click('#bootEnter'); await q.waitForFunction(() => J.booted === true && !document.querySelector('#app.enter'), null, { timeout: 8000 }); await c.close(); }
  { const { c, q } = await bootCard({}, { reducedMotion: 'reduce' });
    await q.waitForSelector('#bootEnter.show', { timeout: 15000 });
    assert(await q.evaluate(() => ['.gv', '.boot-line', '.reactor .r1', '.reactor .rcore', '.boot-title span'].every(x => getComputedStyle(document.querySelector('#boot ' + x)).animationName === 'none')), 'prefers-reduced-motion: ekran startowy bez animacji');
    await q.keyboard.press('Enter'); await q.waitForFunction(() => J.booted === true && J.bootVia === 'user', null, { timeout: 8000 }); await c.close(); }
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
  await p.waitForTimeout(700);
  assert(await p.evaluate(() => ['#askChip', '#undoChip', '#resultChip', '#onboard'].every(s => getComputedStyle(document.querySelector(s)).display === 'none')), 'schowane chipy i zasłona onboardingu: display:none po zakończeniu przejścia');
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
  for (const [w, h] of [[1280, 720], [1366, 768], [1280, 800], [1440, 800], [1600, 900]]) {
    await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(400);
    await p.evaluate(() => { J.ev.emit('task.created', { title: 'Test układu', task_id: 'lay1' }); J.orb.set('thinking', 'analizuję'); });
    await p.waitForTimeout(1300);
    const bad = await p.evaluate(() => { const rc = s => document.querySelector(s)?.getBoundingClientRect(), banner = rc('#task'), dock = rc('#dock'), top = rc('.topbar'); const hit = (a, b) => b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; const cards = [...document.querySelectorAll('.hc')].map(e => ({ id: e.dataset.id, r: e.getBoundingClientRect() })); const out = []; cards.forEach(c => { if (hit(c.r, banner)) out.push(c.id + '×baner'); if (hit(c.r, dock)) out.push(c.id + '×dok'); if (c.r.top < top.bottom) out.push(c.id + '×pasek'); }); return out; });
    assert(bad.length === 0, 'kolizje HUD przy ' + w + 'x' + h + ': ' + bad.join(','));
    // chipy zgody / wyniku / cofania nie zasłaniają kart HUD (po ustaleniu się animacji wejścia) ani doku
    await p.evaluate(() => { J.ask('Zadanie trwa dłużej niż zwykle (6 tur, 12 narzędzi). Kontynuować? Zakończenie teraz zachowa dotychczasowe wyniki, a ponowne uruchomienie wznowi pracę od ostatniego kroku.', [{ label: 'Kontynuuj', value: 1, primary: true }, { label: 'Zakończ', value: 0 }], { speak: false }); });   // pytanie o realnej długości (2–3 wiersze), nie krótkie „Zamknąć…?”
    await p.waitForTimeout(1500);
    const chipHits = async name => p.evaluate(sel => { const R = e => e.getBoundingClientRect(), hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; const c = document.querySelector(sel); const r = R(c); if (!r.width) return ['brak chipa ' + sel]; const out = [...document.querySelectorAll('.hc')].filter(e => !e.inert && hit(r, R(e))).map(e => sel + ' × ' + e.dataset.id); const d = document.querySelector('#dock'); if (d && hit(r, R(d))) out.push(sel + ' × dock'); return out; }, name);
    let ch = await chipHits('#askChip'); await p.evaluate(() => J.ask.cancel()); await p.waitForTimeout(600);
    await p.evaluate(() => { const rc = document.querySelector('#resultChip'); rc.inert = false; rc.dataset.s = 'failed'; rc.innerHTML = '<b>Zadanie nie powiodło się</b><span>2 wywołania narzędzi · 3 źródła · 4,1 s</span><div class="rc-act"><button class="btn sm primary">Przypnij wynik</button><button class="btn sm ghost">Process Log</button></div>'; rc.classList.add('show'); });
    await p.waitForTimeout(1500); ch = ch.concat(await chipHits('#resultChip')); await p.evaluate(() => document.querySelector('#resultChip').classList.remove('show'));
    await p.evaluate(() => { const u = document.querySelector('#undoChip'); u.inert = false; u.innerHTML = '<span>Cofnięto zmianę ustawień tła</span><button class="btn sm">Cofnij</button><i></i>'; u.classList.add('show'); });
    await p.waitForTimeout(1200); ch = ch.concat(await chipHits('#undoChip')); await p.evaluate(() => { document.querySelector('#undoChip').classList.remove('show'); document.querySelector('#undoChip').inert = true; document.querySelector('#resultChip').inert = true; });
    assert(ch.length === 0, 'chipy zasłaniają HUD przy ' + w + 'x' + h + ': ' + ch.join(','));
    // otwarty czat (392 px) i Process Log nie zasłaniają kart HUD: karty pod panelem zwijają się do ikon (js/hud.js fitCard); dymki nie leżą na kartach
    await p.evaluate(() => { J.chatPanel.show(); if (!document.querySelector('#workspace').classList.contains('log-open')) J.proc.toggle(); J.toast('Test dymka', 9000, 'timer'); J.toast('Drugi dymek wg rodzaju', 9000, 'market'); });
    await p.waitForTimeout(1400);
    const pnl = await p.evaluate(() => { const R = e => e.getBoundingClientRect(), hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top, ws = document.querySelector('#workspace');
      const panels = [['czat', document.querySelector('#chatPanel'), !ws.classList.contains('chat-closed')], ['log', document.querySelector('#logPanel'), ws.classList.contains('log-open')]].filter(x => x[2]);
      const cards = [...document.querySelectorAll('#hud .hc')].filter(e => !e.inert), out = [];
      panels.forEach(([n, el]) => cards.forEach(c => { if (hit(R(c), R(el))) out.push(c.dataset.id + '×' + n); }));
      [...document.querySelectorAll('#toasts .toast')].forEach(t => cards.forEach(c => { if (hit(R(t), R(c))) out.push(c.dataset.id + '×dymek'); }));
      return { out, panels: panels.length, mini: cards.filter(c => c.classList.contains('mini')).map(c => c.dataset.id) }; });
    assert(pnl.panels === 2 && pnl.out.length === 0, 'karty HUD nachodzą na panele/dymki przy ' + w + 'x' + h + ': ' + JSON.stringify(pnl));
    await p.evaluate(() => { J.chatPanel.hide(); J.proc.toggle(); document.querySelectorAll('#toasts .toast').forEach(t => t.remove()); }); await p.waitForTimeout(500);
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
  // przeciąganie okna (1B): transform tylko w trakcie gestu, po puszczeniu pozycja zatwierdzona = wizualna
  await p.evaluate(() => { J.wm.closeAll(); J.wm.open('notes'); J.wm.move('notes', 420, 180); J.wm.resize('notes', 620, 420); }); await p.waitForTimeout(600);
  const wHd = () => p.evaluate(() => { const r = document.querySelector('.window[data-app="notes"] .win-head b').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const wVis = () => p.evaluate(() => { const r = document.querySelector('.window[data-app="notes"]').getBoundingClientRect(), d = document.querySelector('#desktop').getBoundingClientRect(), i = J.wm.info().find(w => w.id === 'notes'); return { dx: Math.round(r.left - d.left), dy: Math.round(r.top - d.top), i, tr: document.querySelector('.window[data-app="notes"]').style.transform, wc: document.querySelector('.window[data-app="notes"]').style.willChange }; });
  let wHp = await wHd(); await p.mouse.move(wHp.x, wHp.y); await p.mouse.down(); await p.mouse.move(wHp.x + 120, wHp.y + 60, { steps: 6 }); await p.waitForTimeout(80);
  let wv = await wVis(); assert(/translate3d/.test(wv.tr) && wv.wc === 'transform' && wv.i.x === 420 && wv.i.y === 180, 'w trakcie drag: transform + will-change, info() = pozycja zatwierdzona ' + JSON.stringify(wv));
  await p.mouse.up(); wv = await wVis();
  assert(wv.tr === '' && wv.wc === '' && wv.i.x === 540 && wv.i.y === 240 && wv.dx === wv.i.x && wv.dy === wv.i.y, 'po drag: transform zdjęty, info() zgodne z pozycją wizualną ' + JSON.stringify(wv));
  // gest osierocony: zamknięcie/minimalizacja okna w trakcie przeciągania nie może zablokować kolejnych przeciągnięć
  for (const how of ['close', 'minimize']) {
    await p.evaluate(() => { J.wm.closeAll(); J.wm.open('notes'); J.wm.open('calc'); J.wm.move('notes', 420, 180); J.wm.move('calc', 60, 200); }); await p.waitForTimeout(500);
    const hp = await wHd(); await p.mouse.move(hp.x, hp.y); await p.mouse.down(); await p.mouse.move(hp.x + 40, hp.y + 20, { steps: 3 }); await p.waitForTimeout(60);
    await p.evaluate(h => J.wm[h]('notes'), how); await p.waitForTimeout(450); await p.mouse.up(); await p.waitForTimeout(100);   // uchwyt już usunięty/ukryty
    assert(await p.evaluate(() => J.wm.dragging()) === null, 'po ' + how + ' w trakcie drag gest zdjęty');
    const cb = await p.evaluate(() => { const r = document.querySelector('.window[data-app="calc"] .win-head b').getBoundingClientRect(), i = J.wm.info().find(w => w.id === 'calc'); return { x: r.left + r.width / 2, y: r.top + r.height / 2, px: i.x, py: i.y }; });
    await p.mouse.move(cb.x, cb.y); await p.mouse.down(); await p.mouse.move(cb.x + 90, cb.y + 40, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(100);
    const ci = await p.evaluate(() => J.wm.info().find(w => w.id === 'calc'));
    assert(ci.x > cb.px + 50, 'po ' + how + ' w trakcie drag kolejne okno się przeciąga ' + JSON.stringify([cb.px, ci.x]));
  }
  await p.evaluate(() => { J.wm.closeAll(); J.wm.open('notes'); J.wm.move('notes', 540, 240); J.wm.resize('notes', 620, 420); }); await p.waitForTimeout(500);
  // przyciąganie krawędź do krawędzi sąsiada; Alt = bez przyciągania
  await p.evaluate(() => { J.wm.open('calc'); J.wm.move('calc', 20, 240); }); await p.waitForTimeout(500);
  const wcR = await p.evaluate(() => { const c = J.wm.info().find(w => w.id === 'calc'); return c.x + c.w; });
  await p.evaluate(() => J.wm.move('notes', 420, 240)); wHp = await wHd();
  const wDxs = wcR + 6 - 420;
  await p.mouse.move(wHp.x, wHp.y); await p.mouse.down(); await p.mouse.move(wHp.x + wDxs, wHp.y, { steps: 5 }); await p.mouse.up(); wv = await wVis();
  assert(wv.i.x === wcR && wv.dx === wv.i.x, 'drag blisko krawędzi sąsiada: doklejenie ' + JSON.stringify([wv.i.x, wcR, wv.dx]));
  await p.evaluate(() => J.wm.move('notes', 420, 240)); wHp = await wHd();
  await p.keyboard.down('Alt'); await p.mouse.move(wHp.x, wHp.y); await p.mouse.down(); await p.mouse.move(wHp.x + wDxs, wHp.y, { steps: 5 }); await p.mouse.up(); await p.keyboard.up('Alt'); wv = await wVis();
  assert(wv.i.x === wcR + 6 && wv.dx === wv.i.x, 'Alt = bez przyciągania ' + JSON.stringify([wv.i.x, wcR + 6, wv.dx]));
  // drag do lewej krawędzi pulpitu → snap bez skoku do starej pozycji
  await p.evaluate(() => { J.wm.closeOthers('notes'); J.wm.move('notes', 420, 240); }); wHp = await wHd();
  const wDl = await p.evaluate(() => document.querySelector('#desktop').getBoundingClientRect().left);
  await p.mouse.move(wHp.x, wHp.y); await p.mouse.down(); await p.mouse.move(wDl + 4, wHp.y, { steps: 6 }); await p.waitForTimeout(80);
  const wBef = (await wVis()).dx; const wBx = await p.evaluate(() => { const r = document.querySelector('.window[data-app="notes"]').getBoundingClientRect(); return r.left; });
  await p.mouse.up(); const wAft = await p.evaluate(() => document.querySelector('.window[data-app="notes"]').getBoundingClientRect().left);
  assert(Math.abs(wAft - wBx) < Math.abs(420 - wBx) / 2 + 30, 'snap bez skoku: ' + JSON.stringify([wBx, wAft]));
  await p.waitForTimeout(600); wv = await wVis(); assert(wv.i.x === 8 && wv.dx === 8 && wv.tr === '', 'snap do lewej krawędzi ' + JSON.stringify(wv));
  await p.evaluate(() => { J.wm.closeAll(); });
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
  assert(await p.evaluate(() => getComputedStyle(document.querySelector('#paletteBg')).display === 'none'), 'zamknięta paleta: display:none (bez własnej warstwy)');
  await p.keyboard.press('Control+k'); await p.waitForTimeout(60);
  assert(await p.evaluate(() => document.activeElement?.id === 'paletteInput' && getComputedStyle(document.querySelector('#paletteBg')).display !== 'none'), 'fokus w palecie po 60 ms od otwarcia (display:none→widoczna nie psuje focus())');
  await p.waitForTimeout(140); await p.keyboard.type('faktra'); await p.waitForTimeout(250);
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
  // ===== Faza 1C: jezioro w małej kanwie, strumień czatu 1×/klatkę, Process Log z leniwym ciałem kroków i bez przebudowy na końcu =====
  await p.waitForTimeout(1800);
  const lake = await p.evaluate(() => { const c = document.querySelector('#flowCanvas'), d = document.querySelector('#desktop'), r = c.getBoundingClientRect(), dr = d.getBoundingClientRect(); return { share: (r.width * r.height) / (dr.width * dr.height), w: r.width, hud: !!document.querySelector('#hudLines') && getComputedStyle(document.querySelector('#hudLines')).display !== 'none' }; });
  assert(lake.share < .45 && lake.w > 100, 'jezioro w małej kanwie: ' + JSON.stringify(lake));
  const sync = await p.evaluate(() => { J.chatPanel.show(); window.__b = J.chat.add('jarvis', ''); for (let i = 1; i <= 120; i++) __b.stream('słowo '.repeat(i)); return document.querySelector('#messages').lastElementChild.textContent.length; });
  await p.waitForTimeout(250);
  const strm = await p.evaluate(() => { const m = document.querySelector('#messages').lastElementChild; return { len: m.textContent.length, pin: m.querySelectorAll('.msg-pin').length }; });
  assert(sync < 50 && strm.len >= 120 * 6 - 1 && strm.pin === 0, 'strumień czatu: render 1×/klatkę, bez pina w trakcie ' + JSON.stringify({ sync, strm }));
  await p.evaluate(() => __b.set('Odpowiedź końcowa')); await p.waitForTimeout(100);
  assert(await p.evaluate(() => { const m = document.querySelector('#messages').lastElementChild; return /Odpowiedź końcowa/.test(m.textContent) && m.querySelectorAll('.msg-pin').length === 1; }), 'po zakończeniu: tekst i dokładnie jeden pin');
  await p.evaluate(() => __b.remove());
  await p.evaluate(() => { J.proc.start('Log 1C'); for (let i = 0; i < 6; i++) J.proc.step('tool', 'krok ' + i, [['Arg', 'wartość ' + i]]).done([['Wynik', 'ok ' + i]]); J.proc.open(); }); await p.waitForTimeout(400);
  const lg = await p.evaluate(() => { const d = document.querySelector('#lpSteps .pstep[data-kind="tool"]'); return { steps: document.querySelectorAll('#lpSteps .pstep').length, body: d.querySelector('.pbody').children.length }; });
  assert(lg.steps >= 7 && lg.body === 0, 'Process Log: zamknięty krok nie ma ciała ' + JSON.stringify(lg));
  await p.evaluate(() => { document.querySelector('#lpSteps .pstep[data-kind="tool"]').open = true; }); await p.waitForTimeout(200);
  assert(await p.evaluate(() => document.querySelectorAll('#lpSteps .pstep[data-kind="tool"] .pbody .pf').length >= 1 && !!document.querySelector('#lpSteps .pstep[data-kind="tool"] .pbody [data-a="json"]')), 'otwarcie kroku buduje ciało z polami i przyciskami');
  const keep = await p.evaluate(() => { const n = document.querySelectorAll('#lpSteps .pstep').length, first = document.querySelector('#lpSteps .pstep'); window.__first = first; J.proc.end('ok', 'koniec'); return n; }); await p.waitForTimeout(300);
  assert(await p.evaluate(n => document.querySelectorAll('#lpSteps .pstep').length === n && document.querySelector('#lpSteps .pstep') === window.__first, keep), 'koniec zadania nie przebudowuje logu');
  await p.evaluate(() => { J.proc.close(); J.wm.closeAll(); });
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
  // linie obwodów HUD pod zmaksymalizowanym oknem: rysowane w trakcie zadania (zamrożone tylko Core/jezioro/sieć), po zadaniu czyszczone
  const hudPx = () => p.evaluate(() => { const c = document.querySelector('#hudLines'); if (!c || getComputedStyle(c).display === 'none') return 0; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  await p.evaluate(() => { J.wm.closeAll(); J.engine.hudUntil = 0; });   // czysty start: poprzednie zadania zostawiły namalowane linie, które trzeba najpierw wygasić
  for (let i = 0; i < 40 && await hudPx() > 0; i++) await p.waitForTimeout(250);
  assert(await hudPx() === 0, 'linie obwodów gasną po zadaniu (bez okna na wierzchu)');
  await p.evaluate(() => { J.wm.open('notes'); J.wm.setMax('notes', true); }); await p.waitForTimeout(800);   // najpierw okno zasłania pulpit (isCovered odświeża się co 250 ms), dopiero potem zadanie
  await p.evaluate(() => { J.ev.emit('task.created', { title: 'linie pod oknem', task_id: 't-lines' }); J.ev.emit('tool.started', { tool: 'web_search', node: 'internet', task_id: 't-lines' }); });
  await p.waitForTimeout(1500);
  assert(await p.evaluate(() => !!document.querySelector('.window.max:not(.hidden)')), 'okno zmaksymalizowane');
  assert(await hudPx() > 200, 'HUD pod zmaksymalizowanym oknem: linie obwodów rysowane w trakcie zadania');
  await p.evaluate(() => { J.ev.emit('task.completed', { title: 'linie pod oknem', task_id: 't-lines' }); J.engine.hudUntil = 0; }); await p.waitForTimeout(2000);
  assert(await hudPx() === 0, 'po zadaniu linie obwodów wyczyszczone mimo zmaksymalizowanego okna');
  await p.evaluate(() => J.wm.closeAll());
  // ===== wygląd (poprawki po weryfikacji Fazy 2): LED rim, impulsy, maski pierścieni, diody, stany kart HUD =====
  await p.evaluate(() => { J.wm.closeAll(); J.setFocus?.(false); J.engine.hudUntil = 0; }); await p.waitForTimeout(300);
  const rimOf = () => p.evaluate(() => { const v = document.querySelector('.vignette'), a = getComputedStyle(v, '::before'), z = getComputedStyle(v, '::after'), app = document.querySelector('#app'); return { pe: a.pointerEvents, pe2: z.pointerEvents, op: +a.opacity, disp: a.display, disp2: z.display, tr: a.transitionDuration, rim: a.getPropertyValue('--rim').trim(), pulse: getComputedStyle(app, '::after').display }; });
  const lvl = async l => { await p.evaluate(l => J.uiRun('fx_level', { level: l }, { offer: false }), l); await p.waitForTimeout(600); };
  for (const l of ['off', 'tool']) { await lvl(l); const r = await rimOf(); assert(r.pe === 'none' && r.pe2 === 'none' && Math.abs(r.op - .7) < .01 && parseFloat(r.tr) <= (l === 'off' ? 0 : .15) && r.disp !== 'none', 'LED rim ' + l + ' (statyczny .7, przejście off 0 / tool ≤ .15 s, pointer-events:none): ' + JSON.stringify(r)); }
  await lvl('standard'); await p.waitForTimeout(800);
  const rimIdle = await rimOf(); assert(rimIdle.pe === 'none' && rimIdle.disp !== 'none' && rimIdle.op >= .59 && rimIdle.op < .75, 'LED rim standard w spoczynku: ' + JSON.stringify(rimIdle));
  await p.evaluate(() => { J.ev.emit('task.created', { title: 'rim', task_id: 't-rim' }); J.ev.emit('tool.started', { tool: 'web_search', node: 'internet', task_id: 't-rim' }); }); await p.waitForTimeout(1500);
  const rimBusy = await rimOf(); assert(rimBusy.op > rimIdle.op + .1, 'LED rim standard: jasność rośnie z aktywnością: ' + rimIdle.op + ' → ' + rimBusy.op);
  await p.evaluate(() => { J.ev.emit('tool.completed', { tool: 'web_search', node: 'internet', task_id: 't-rim' }); J.ev.emit('task.completed', { title: 'rim', task_id: 't-rim' }); }); await p.waitForTimeout(4200);
  await p.evaluate(() => J.setFocus(true)); await p.waitForTimeout(700);
  const rimFocus = await rimOf(); assert(Math.abs(rimFocus.op - .5) < .02 && rimFocus.rim === '236,246,255', 'LED rim w skupieniu: biały, .5: ' + JSON.stringify(rimFocus));
  await p.evaluate(() => J.setFocus(false));
  await p.evaluate(() => { J.ear.standby = true; J.emit('ear-standby', true); }); await p.waitForTimeout(700);
  const rimSb = await rimOf(); assert(Math.abs(rimSb.op - .35) < .02, 'STANDBY przygasza rim (.35): ' + JSON.stringify(rimSb));
  await p.evaluate(() => { J.ear.standby = false; J.emit('ear-standby', false); });
  const pulseBg = cls => p.evaluate(cls => { const app = document.querySelector('#app'); app.classList.add(cls); const z = getComputedStyle(app, '::after'); const r = { d: z.display, bg: z.backgroundImage }; app.classList.remove(cls); return r; }, cls);
  for (const [k, rgb] of [['ok', '61, 255, 160'], ['err', '255, 59, 92'], ['warn', '255, 176, 32']]) { const r = await pulseBg('fx-pulse-' + k); assert(r.d !== 'none' && r.bg.includes('rgba(' + rgb), 'impuls ' + k + ' w barwie tokenu planu: ' + JSON.stringify(r)); }
  await p.evaluate(() => J.uiRun('ui_mode', { mode: 'present' }, { offer: false })); await p.waitForTimeout(500);
  { const r = await rimOf(), pu = await pulseBg('fx-pulse-err'); assert(r.disp === 'none' && r.disp2 === 'none' && pu.d === 'none', 'prezentacja: rim i impulsy ukryte: ' + JSON.stringify({ r, pu })); }
  await p.evaluate(() => J.uiRun('ui_mode', { mode: 'work' }, { offer: false })); await p.waitForTimeout(500);
  for (const [name, opt] of [['forced-colors', { forcedColors: 'active' }], ['prefers-contrast', { contrast: 'more' }]]) {
    await p.emulateMedia(opt); await p.waitForTimeout(150);
    const r = await rimOf(), pu = await pulseBg('fx-pulse-err'); assert(r.disp === 'none' && r.disp2 === 'none' && pu.d === 'none', name + ': bez rim i impulsów: ' + JSON.stringify({ r, pu }));
    await p.emulateMedia({ forcedColors: null, contrast: null });
  }
  { const r = await rimOf(); assert(r.disp !== 'none', 'po wyłączeniu emulacji rim wraca'); }
  const rings = await p.evaluate(() => ['.cr1', '.cr3'].map(sel => { const e = document.querySelector(sel), c = e && getComputedStyle(e); return e ? (c.webkitMaskImage || c.maskImage || '') : null; }));
  assert(rings.every(m => m && /radial-gradient\(closest-side/.test(m)), 'maski pierścieni .cr1/.cr3 z closest-side (bez klina): ' + JSON.stringify(rings));
  // dioda Hermesa: rozbłysk tylko przy zmianie stanu i tylko na standard/cinema
  const fl = await p.evaluate(() => {
    const S = J.state.settings, ts = document.querySelector('#tsAi'), keep = { on: S.hermesOn, url: S.hermesUrl, st: J.hermes.status, lv: S.fxLevel }, out = {};
    S.hermesOn = true; S.hermesUrl = 'http://localhost:9/v1'; J.hermes.status = 'unknown'; S.fxLevel = 'standard'; J.fx.apply(); J.emit('hermes'); ts.classList.remove('flash');
    J.hermes.status = 'up'; J.emit('hermes'); out.change = ts.classList.contains('flash');
    ts.classList.remove('flash'); J.emit('hermes'); J.emit('settings'); out.same = ts.classList.contains('flash');
    S.fxLevel = 'tool'; J.fx.apply(); J.hermes.status = 'down'; J.emit('hermes'); out.lowfx = ts.classList.contains('flash'); out.s = ts.dataset.s;
    S.hermesOn = keep.on; S.hermesUrl = keep.url; J.hermes.status = keep.st; S.fxLevel = keep.lv; J.fx.apply(); J.emit('hermes'); ts.classList.remove('flash'); return out; });
  assert(fl.change === true && fl.same === false && fl.lowfx === false && fl.s === 'down', 'rozbłysk diody: tylko przy zmianie i tylko rank>=2: ' + JSON.stringify(fl));
  // karty HUD: zgoda (bursztyn, data-s=ask) różni się od błędu (czerwień, data-s=failed)
  const hudS = () => p.evaluate(() => { const c = document.querySelector('#hud .hc[data-id="done"]'); return { s: c.dataset.s, bc: getComputedStyle(c).borderTopColor }; });
  await p.evaluate(() => { J.ev.emit('task.created', { title: 'zgoda', task_id: 't-ask' }); J.ev.emit('approval.requested', { task_id: 't-ask' }); }); await p.waitForTimeout(900);
  const hAsk = await hudS();
  await p.evaluate(() => { J.ev.emit('approval.resolved', { task_id: 't-ask', answer: 'no' }); J.ev.emit('task.failed', { title: 'zgoda', task_id: 't-ask' }); }); await p.waitForTimeout(900);
  const hErr = await hudS();
  assert(hAsk.s === 'ask' && hErr.s === 'failed' && hAsk.bc !== hErr.bc, 'karta HUD: zgoda ≠ błąd (data-s i barwa obrysu): ' + JSON.stringify({ hAsk, hErr }));
  await p.waitForTimeout(3800); await p.evaluate(() => { J.engine.hudUntil = 0; });
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
