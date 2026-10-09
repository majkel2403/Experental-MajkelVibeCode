/* Kontrakt wejścia z mostu (J.bootEnter / J.booted) wykonany naprawdę: fragment BOOT z js/main.js uruchamiany w vm z atrapami DOM i zegara
   (zamiast regexów po źródle). Pilnuje semantyki: prośba przed gotowością jest kolejkowana, wejście ustawia booted/bootVia i zdejmuje bootEnter, drugie wywołanie nic nie robi. */
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'main.js'), 'utf8');
const a = src.indexOf('let bootReq = false;'), b = src.indexOf('/* =================== TŁO'), bootSrc = src.slice(a, b);

/* obietnica bootu, która się nie spełnia = błąd testu (a nie wiszący test) */
const settled = async p => { let ok = false; await Promise.race([p.then(() => { ok = true; }), new Promise(r => setImmediate(r))]); assert.ok(ok, 'boot() się nie zakończył'); };

/* wirtualny zegar: setTimeout wykonuje się w kolejności terminów, performance.now() = czas wirtualny; mikrozadania (await etapów) opróżnia run() */
const mk = (settings = {}, over = {}) => {
  const timers = []; const els = {}; let clock = 0, seq = 0;
  const el = id => els[id] || (els[id] = { id, cls: new Set(), style: {}, dataset: {}, textContent: '', removed: false, listeners: {}, children: [],
    classList: { add: c => els[id].cls.add(c), remove: c => els[id].cls.delete(c), contains: c => els[id].cls.has(c) },
    addEventListener(t, f) { (els[id].listeners[t] = els[id].listeners[t] || []).push(f); }, removeEventListener(t, f) { els[id].listeners[t] = (els[id].listeners[t] || []).filter(x => x !== f); },
    appendChild(c) { els[id].children.push(c); }, remove() { els[id].removed = true; } });
  const win = {}, J = { notes: { live: () => [1, 2] }, state: { tasks: [1] }, sfx: { unlock() { }, boot() { } }, pl: (n, a, b, c) => n === 1 ? a : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? b : c,
    fx: { rank: () => 3, level: () => 'cinema' }, aiReady: () => false, bootT0: 410, ...over.J };
  const ctx = { J, S: settings, $: s => el(s.replace('#', '')), h: (t, a, html) => ({ t, html }), esc: x => String(x), setTimeout: (f, ms = 0) => { timers.push({ f, at: clock + ms, n: seq++ }); return seq; }, Math, Date,
    performance: { now: () => clock }, document: { scripts: [{ src: 'a.js' }, { src: 'b.js' }, { src: '' }] }, navigator: {}, location: { protocol: 'http:' }, ...over.ctx,
    addEventListener: (t, f) => { (win[t] = win[t] || []).push(f); }, removeEventListener: (t, f) => { win[t] = (win[t] || []).filter(x => x !== f); } };
  vm.createContext(ctx);
  vm.runInContext(bootSrc.replace('const boot = () =>', 'ctx_boot = () =>'), ctx);   // `const` nie wycieka z vm — przypisujemy do zmiennej globalnej kontekstu
  const tick = () => new Promise(r => setImmediate(r));
  /* run(ms): przesuwa zegar o ms, wykonując po drodze terminy; zatrzymuje się, gdy nic nie czeka */
  const run = async (ms = 1e5) => { const end = clock + ms; for (;;) { await tick(); timers.sort((x, y) => x.at - y.at || x.n - y.n); const t = timers[0]; if (!t || t.at > end) { clock = end; return; } timers.shift(); clock = Math.max(clock, t.at); t.f(); } };
  const lines = () => el('bootLog').children.map(c => c.html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
  return { ctx, J, el, els, win, timers, run, tick, lines, now: () => clock };
};

test('boot: J.bootEnter istnieje od razu po załadowaniu skryptu (przed boot()), a samo wywołanie nie wchodzi do systemu', () => {
  const t = mk(); assert.equal(typeof t.J.bootEnter, 'function');
  t.J.bootEnter(); assert.ok(!t.J.booted, 'prośba tylko zapamiętana — „booted” nie wynika z samego istnienia bootEnter');
});
test('boot: prośba z mostu przed startem ekranu jest spełniona od razu po boot(), booted===true i bootEnter==null', async () => {
  const t = mk({ skipBoot: false }); t.J.bootEnter();
  await settled(t.ctx.ctx_boot());
  assert.equal(t.J.booted, true); assert.equal(t.J.bootEnter, null); assert.equal(t.J.bootVia, 'bridge');
  assert.ok(t.el('app').cls.has('on') && t.el('boot').cls.has('out'), 'pulpit włączony, zasłona schodzi');
});
test('boot: wywołanie J.bootEnter() w trakcie animacji startowej kończy się wejściem (przed „[Enter]”)', async () => {
  const t = mk({ skipBoot: false }); const p = t.ctx.ctx_boot();
  await t.run(500);   // część linii logu — animacja trwa
  assert.ok(!t.J.booted && typeof t.J.bootEnter === 'function');
  t.J.bootEnter(); await settled(p);
  assert.equal(t.J.booted, true); assert.equal(t.J.bootEnter, null); assert.equal(t.J.bootVia, 'bridge');
  const before = t.J.bootAt; t.J.bootEnter?.(); assert.equal(t.J.bootAt, before, 'drugie wejście niczego nie zmienia');
});
test('boot: wejście użytkownika (klik po animacji) ustawia bootVia=user; klik przed końcem animacji wpuszcza dopiero po przycisku', async () => {
  const t = mk({ skipBoot: false }); const p = t.ctx.ctx_boot();
  await t.run(5000);   // cała animacja: pojawia się #bootEnter.show i nasłuch kliknięcia
  assert.ok(t.el('bootEnter').cls.has('show'), 'przycisk wejścia pokazany po animacji');
  assert.ok(!t.J.booted, 'bez kliknięcia nie wchodzi');
  t.el('boot').listeners.click[0]({ type: 'click' }); await settled(p);
  assert.equal(t.J.booted, true); assert.equal(t.J.bootVia, 'user'); assert.equal(t.J.bootEnter, null);
});
test('boot: skipBoot pokazuje przycisk od razu, a mostowe wejście też działa', async () => {
  const t = mk({ skipBoot: true }); const p = t.ctx.ctx_boot();
  assert.ok(t.el('bootEnter').cls.has('show')); t.J.bootEnter(); await settled(p);
  assert.equal(t.J.booted, true); assert.equal(t.J.bootVia, 'bridge');
});

/* ---- realne etapy: żadnej fikcji, minimum czasu, limit pingu ---- */
test('boot: log składa się z realnych etapów (moduły, stan, service worker, Hermes, efekty, pulpit) i nie zawiera fikcyjnych komunikatów', async () => {
  const t = mk({ skipBoot: false }); t.ctx.ctx_boot(); await t.run(5000);
  const L = t.lines(); assert.equal(L.length, 6, L.join('|'));
  assert.match(L[0], /moduły: 2 skrypty · 410 ms/); assert.match(L[1], /stan: 2 notatki · 1 zadanie/); assert.match(L[2], /service worker: niedostępny/);
  assert.match(L[3], /Hermes: wyłączony/); assert.match(L[4], /efekty: kinowy · canvas 2D/); assert.match(L[5], /pulpit gotowy · \d+ ms/);
  assert.ok(!/BIOS|reaktor|GJ\/s|kalibracj|jądra neuronowego/i.test(L.join('\n') + src.slice(a, b).split('\n').filter(l => /^\s*'/.test(l)).join('')), 'brak fikcyjnych linii');
  assert.equal(t.el('bootEnter').cls.has('show'), true);
});
test('boot: renderer z rzeczywistego stanu — WebGL2 gdy scena GL działa, ostrzeżenie gdy WebGL2 padł', async () => {
  const a1 = mk({ skipBoot: false, wall: 'neon' }, { J: { bgGl: { active: true } } }); a1.ctx.ctx_boot(); await a1.run(5000); assert.match(a1.lines()[4], /· WebGL2 ✓$/);
  const a2 = mk({ skipBoot: false, wall: 'neon' }, { J: { bgGl: { active: false, failed: true } } }); a2.ctx.ctx_boot(); await a2.run(5000); assert.match(a2.lines()[4], /WebGL2 niedostępny/); assert.match(a2.els.bootLog.children[4].html, /class="warn"/);
});
test('boot: minimalny czas power-up — szybki realny start nie pokazuje przycisku przed ~1,5 s (cinema/standard), ale off/tool krócej', async () => {
  const t = mk({ skipBoot: false }); t.ctx.ctx_boot(); await t.run(1400); assert.ok(!t.el('bootEnter').cls.has('show'), 'przed minimum jeszcze trwa');
  await t.run(300); assert.ok(t.el('bootEnter').cls.has('show'), 'po minimum przycisk jest');
  const o = mk({ skipBoot: false }, { J: { fx: { rank: () => 0, level: () => 'off' } } }); o.ctx.ctx_boot(); await o.run(700); assert.ok(o.el('bootEnter').cls.has('show'), 'off: krótka wersja');
});
test('boot: ping Hermesa ma limit 800 ms i nie blokuje przycisku wejścia (zawieszony ping → linia „odpowiada wolno”)', async () => {
  let pinged = 0; const hang = new Promise(() => { });
  const t = mk({ skipBoot: false }, { J: { aiReady: () => true, hermesPing: () => { pinged++; return hang; } } }); t.ctx.ctx_boot();
  await t.run(1900); assert.equal(pinged, 1); assert.ok(t.el('bootEnter').cls.has('show'), 'przycisk jest mimo zawieszonego pinga');
  assert.match(t.lines()[3], /Hermes: odpowiada wolno \(> 800 ms\)/); assert.equal(t.J.bootPinged, true);
});
test('boot: Hermes odpowiada — linia z opóźnieniem; odrzucony ping nie przerywa startu', async () => {
  const up = mk({ skipBoot: false }, { J: { aiReady: () => true, hermes: { status: 'up' }, hermesPing: async () => { } } }); up.ctx.ctx_boot(); await up.run(3000);
  assert.match(up.lines()[3], /Hermes: połączony · \d+ ms/);
  const bad = mk({ skipBoot: false }, { J: { aiReady: () => true, hermes: { status: 'down' }, hermesPing: async () => { throw new Error('x'); } } }); bad.ctx.ctx_boot(); await bad.run(3000);
  assert.match(bad.lines()[3], /Hermes: brak odpowiedzi/); assert.ok(bad.el('bootEnter').cls.has('show'));
});
test('boot: ping Hermesa nie rzuca, ale ustawia status „down” — ostrzeżenie zamiast „✓ połączony”, przycisk wejścia nie jest blokowany', async () => {
  for (const status of ['down', 'unknown']) {
    const t = mk({ skipBoot: false }, { J: { aiReady: () => true, hermes: { status: 'up' }, hermesPing: async function () { t.J.hermes.status = status; } } });   // ping „udany” technicznie (bez wyjątku), ale wynik = brak Hermesa
    const p = t.ctx.ctx_boot(); await t.run(3000);
    const L = t.lines(); assert.match(L[3], /Hermes: brak odpowiedzi · tryb lokalny/, status); assert.ok(!/połączony/.test(L[3]), 'żadnego „✓ połączony” przy statusie ' + status);
    assert.match(t.els.bootLog.children[3].html, /class="warn"/, 'linia jako ostrzeżenie'); assert.ok(!/class="ok"/.test(t.els.bootLog.children[3].html));
    assert.ok(t.el('bootEnter').cls.has('show'), 'przycisk wejścia widoczny'); assert.ok(!t.J.booted, 'brak automatycznego wejścia');
    t.el('boot').listeners.click[0]({ type: 'click' }); await settled(p); assert.equal(t.J.booted, true, 'wejście działa mimo awarii Hermesa');
  }
});
test('boot: service worker — aktywny pokazuje wersję cache, zawieszone caches.keys() ma limit 600 ms', async () => {
  const on = mk({ skipBoot: false }, { ctx: { navigator: { serviceWorker: { controller: {} } }, caches: { keys: async () => ['x', 'jarvis-os-v84'] } } }); on.ctx.ctx_boot(); await on.run(3000);
  assert.match(on.lines()[2], /service worker: aktywny · jarvis-os-v84 · offline gotowy/);
  const hang = mk({ skipBoot: false }, { ctx: { navigator: { serviceWorker: { controller: {} } }, caches: { keys: () => new Promise(() => { }) } } }); hang.ctx.ctx_boot(); await hang.run(3000);
  assert.match(hang.lines()[2], /service worker: brak odpowiedzi/); assert.ok(hang.el('bootEnter').cls.has('show'));
});
test('boot: pasek postępu = zrealizowane etapy (scaleX), a pulpit jest rozgrzany tuż przed końcem i pętla wraca po wejściu', async () => {
  const t = mk({ skipBoot: false }); t.J.bootHold = true; const p = t.ctx.ctx_boot(); await t.run(5000);
  assert.equal(t.el('bootBar').style.transform, 'scaleX(1)'); assert.equal(t.el('bootPct').textContent, '100%');
  assert.ok(t.el('app').cls.has('warm') && t.J.bootWarm === 2, 'dwie klatki rozgrzewki pulpitu pod zasłoną');
  t.el('boot').listeners.click[0]({ type: 'click' }); await settled(p);
  assert.equal(t.J.bootHold, false); assert.ok(!t.el('app').cls.has('warm') && t.el('app').cls.has('on') && t.el('app').cls.has('enter'), 'wjazd z staggerem tylko w efektach standard+');
});
test('boot: przy efektach off/tool wejście bez klasy .enter (brak staggeru), a skipBoot też zwalnia pętlę rysującą', async () => {
  const t = mk({ skipBoot: true }, { J: { fx: { rank: () => 1, level: () => 'tool' } } }); t.J.bootHold = true; const p = t.ctx.ctx_boot(); t.el('boot').listeners.click[0]({ type: 'click' }); await settled(p);
  assert.ok(!t.el('app').cls.has('enter') && t.el('app').cls.has('on')); assert.equal(t.J.bootHold, false);
});
test('boot CSS: tekst ekranu startowego widoczny od pierwszego malowania (FCP), wyjście bez filter, power-up tylko transform/opacity', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', '..', 'css', 'neon.css'), 'utf8') + fs.readFileSync(path.join(__dirname, '..', '..', 'css', 'jarvis.css'), 'utf8');
  assert.ok(!/#boot[^{]*:is\([^)]*\.boot-(sub|meta|chips)[^)]*\)[^{]*\{[^}]*animation/.test(css), 'podpis/chipy/„Inicjalizacja” bez animacji z opacity:0 — opóźniały FCP o ~1 s');
  const m = css.match(/#boot\.out\{[^}]*\}/); assert.ok(m && !/filter/.test(m[0]) && /opacity:0/.test(m[0]), '#boot.out: opacity bez filter');
  for (const k of ['puGridV', 'puGridH', 'puCorner', 'puLine', 'puReactor', 'puCore', 'puFade', 'chipOn', 'enTop', 'enDock', 'enCard']) { const b = css.match(new RegExp('@keyframes ' + k + '\\{[^]*?\\}\\}?\\n')); assert.ok(b && !/(box-shadow|filter|width|height|top|left|background)/.test(b[0]), k + ': tylko transform/opacity'); }
});
