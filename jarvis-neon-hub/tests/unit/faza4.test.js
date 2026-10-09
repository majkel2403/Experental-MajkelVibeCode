/* Faza 4 (język neonu w interfejsie): pasek LED pod dokiem, toasty wg rodzaju, ikony, układ HUD przy otwartych panelach, cyfry LED, sfx */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { load } = require('../harness.js');
const ROOT = path.join(__dirname, '..', '..'), read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* ---------- pasek LED pod dokiem ---------- */
const ledSetup = () => {
  const J = load({ state: { settings: { hermesOn: false } } }), ctx = J.__ctx;
  const mk = ctx.document.createElement, box = mk('div'); box.appendChild = c => { box.children.push(c); return c; };
  J.fxd.led = box; J.fx = { rank: () => 2 };
  const segs = () => box.children.map(c => c.dataset.s || '.').join('');
  return { J, box, segs };
};
test('LED dok: ledSegs liczy segmenty z liczników narzędzi (zakończone, nieudane, w toku, reszta przygaszona)', () => {
  const { J } = ledSetup(), f = J.fxd.ledSegs;
  assert.equal(f({ started: 0, finished: 0, failed: 0 }, true), '............');
  assert.equal(f({ started: 3, finished: 1, failed: 0 }, true), 'drr.........');
  assert.equal(f({ started: 4, finished: 3, failed: 1 }, true), 'ddfr........');
  assert.equal(f({ started: 40, finished: 0, failed: 0 }, true), 'rrrrrrrrrrrr', 'więcej niż 12 narzędzi: pasek pełny');
  assert.equal(f({ started: 5, finished: 5, failed: 5 }, true), 'fffff.......');
  assert.equal(f({ started: 5, finished: 2, failed: 0 }, false), '............', 'po zadaniu i oknie HUD: wszystko gaśnie');
});
test('LED dok: segmenty odzwierciedlają realne tool.started/completed/failed i gasną po oknie HUD', () => {
  const { J, box, segs } = ledSetup();
  J.ev.emit('task.created', { task_id: 'a', title: 't' });
  assert.equal(box.children.length, 12); assert.equal(segs(), '............');
  J.ev.emit('tool.started', { tool: 'x', task_id: 'a' }); J.ev.emit('tool.started', { tool: 'y', task_id: 'a' });
  assert.equal(segs(), 'rr..........');
  J.ev.emit('tool.completed', { tool: 'x', task_id: 'a' }); assert.equal(segs(), 'dr..........');
  J.ev.emit('tool.failed', { tool: 'y', task_id: 'a' }); assert.equal(segs(), 'df..........');
  J.ev.emit('task.completed', { task_id: 'a' }); assert.equal(segs(), 'df..........', 'po zakończeniu zostaje, dopóki trwa okno HUD');
  J.engine.hudUntil = 0; J.fxd.ledSync(); assert.equal(segs(), '............');
  const w = box.children.length; J.fxd.ledSync(); assert.equal(box.children.length, w, 'segmenty tworzone raz');
});
test('LED dok: zapis do DOM tylko przy zmianie stanu segmentu', () => {
  const { J, box } = ledSetup(); J.ev.emit('task.created', { task_id: 'a' }); J.ev.emit('tool.started', { tool: 'x', task_id: 'a' });
  let writes = 0; for (const c of box.children) { let v = c.dataset.s; Object.defineProperty(c.dataset, 's', { get: () => v, set: x => { writes++; v = x; }, configurable: true }); }
  J.fxd.ledSync(); J.fxd.ledSync(); assert.equal(writes, 0);
  J.ev.emit('tool.completed', { tool: 'x', task_id: 'a' }); assert.equal(writes, 1);
});
test('LED dok: CSS — ukryty poza tapetą neon, w prezentacji i skupieniu; ruch tylko opacity; HTML ma kontener', () => {
  const css = read('css/neon.css'), html = read('index.html');
  assert.ok(/id="dockLed"[^>]*aria-hidden="true"/.test(html));
  assert.ok(/\.dock-led\{display:none\}/.test(css) && /#app\.present \.dock-led/.test(css) && /#app\.focus \.dock-led/.test(css));
  assert.ok(/@keyframes ledRun\{50%\{opacity:/.test(css));
});

/* ---------- obramowania energii ---------- */
test('energia: karta HUD i okno mają element .hc-en/.win-en, a CSS rusza je wyłącznie transformem (bez @property, bez will-change)', () => {
  assert.ok(/<i class="hc-en" aria-hidden="true"><\/i>/.test(read('js/hud.js')) && /<i class="win-en" aria-hidden="true"><\/i>/.test(read('js/core.js')));
  const css = read('css/neon.css');
  assert.ok(!/@property|will-change/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'bez @property i will-change');
  assert.ok(/@keyframes enSpin\{to\{transform:translate\(-50%,-50%\) rotate\(360deg\)\}\}/.test(css));
  assert.ok(/-webkit-mask-composite:xor/.test(css) && /content-box exclude/.test(css) && /container-type:size/.test(css), 'maska pierścienia 2 px');
  const on = /#app\[data-wall=neon\]:not\(\.lowfx\):not\(\.present\):not\(\.focus\) :is\([^)]*\.hc\.lead\[data-s=active\] \.hc-en[^)]*\.window\.focused \.win-en\)\{display:block\}/.test(css);
  assert.ok(on, 'włączone tylko: neon, standard+, nie prezentacja/skupienie, tylko aktywna karta i fokusowane okno');
  assert.ok(/\.hc-en,\.win-en\{display:none/.test(css) && /forced-colors/.test(css), 'domyślnie ukryte; forced-colors wyłącza');
  assert.ok(/@media \(max-width:900px\)\{\.hc:not\(\[data-s=ask\]\) \.hc-en,\.win-en\{display:none!important\}\}/.test(css), 'telefon/tablet (≤ 900 px): bez pierścieni energii (okno 940 px = 2 warstwy pełnoekranowe)'); assert.ok(/\.window\.max \.win-en\{display:none!important\}/.test(css), 'okno zmaksymalizowane: bez pierścienia');
});
test('energia: jasność z --activity, prędkość z trybu; HUD w spoczynku bez dodatkowego transform na karcie', () => {
  const css = read('css/neon.css');
  assert.ok(/opacity:calc\(\.55 \+ var\(--activity\) \* \.45\)/.test(css));
  assert.ok(/\[data-mode=EXECUTING\]\{--en-t:3\.2s\}/.test(css) && /\[data-mode=THINKING\]\{--en-t:5s\}/.test(css));
  const jar = read('css/jarvis.css'); assert.ok(!/\.hc\[data-s=active\][^{]*\{[^}]*transform/.test(jar + css), 'efekt karty nie dodaje transform na .hc');
});
test('energia: pickLead wskazuje jedną aktywną kartę — tę z ostatniego pakietu, inaczej pierwszą aktywną; „Zakończenie” nigdy', () => {
  const J = load({ state: { settings: { hermesOn: false } } }); require('vm').runInContext(read('js/hud.js'), J.__ctx, { filename: 'hud.js' });
  const C = J.hud.CARDS, set = (...ids) => C.forEach(c => { c.st = { s: ids.includes(c.id) ? 'active' : 'idle' }; });
  J.engine.packets = []; set(); assert.equal(J.hud.pickLead(), null);
  set('tools', 'exec', 'done'); assert.equal(J.hud.pickLead(), 'tools', 'bez pakietów: pierwsza aktywna (poza done)');
  J.engine.packets = [{ node: 'internet', dir: 'out' }]; assert.equal(J.hud.pickLead(), 'tools', 'karta pakietu nieaktywna → pierwsza aktywna');
  set('internet', 'tools', 'exec'); assert.equal(J.hud.pickLead(), 'internet', 'ostatni pakiet → jego główna karta');
  J.engine.packets.push({ node: 'model', dir: 'out' }); assert.equal(J.hud.pickLead(), 'tools', 'model nieaktywny');
  set('model', 'logic', 'tools'); assert.equal(J.hud.pickLead(), 'model');
  set('done'); assert.equal(J.hud.pickLead(), null);
});

/* ---------- dymki wg rodzaju, dioda zadania, puls monety ---------- */
const domJ = () => load({ dom: true, state: { settings: { hermesOn: false } } });
test('toast: rodzaj → data-k i ikona SVG; bez rodzaju kropka bez atrybutu; „⚠” zamienia się w rodzaj error', () => {
  const J = domJ(), box = J.$('#toasts'); J.__ctx.innerHeight = 900; box.children = []; Object.defineProperty(box, 'firstElementChild', { get: () => ({ remove: () => box.children.shift() }) });
  J.toast('Minutnik gotowy', 100, 'timer'); const t = box.children[0], all = [];
  assert.equal(t.attributes['data-k'], 'timer'); assert.ok(/<i class="ti"><svg/.test(t.innerHTML));
  J.toast('Zwykły dymek'); const p = box.children[1]; all.push(t, p); assert.equal(p.attributes['data-k'], undefined); assert.ok(/<i><\/i>/.test(p.innerHTML));
  J.toast('⚠ Brak miejsca', 100); const w = box.children[1];   // limit 2 dymków: najstarszy znika assert.equal(w.attributes['data-k'], 'error'); assert.ok(/warn|<path/.test(w.innerHTML));
  assert.deepEqual(J.toastKinds.sort(), ['agent', 'error', 'files', 'hermes', 'market', 'network', 'routine', 'task', 'timer']);
});
test('toast: J.notice i alerty przekazują rodzaj; centrum i dymek mają wspólną paletę --kc', () => {
  assert.ok(/J\.toast\(J\.uiMode\?\.get\(\) === 'present' \? 'Nowe powiadomienie' : n\.title \+ \(n\.body \? ' — ' \+ n\.body : ''\), 5000, J\.uiMode\?\.get\(\) === 'present' \? undefined : kind\)/.test(read('js/main.js')));
  const ctx = read('js/context.js'); assert.ok(/, 6000, 'task'\)/.test(ctx) && /, 8000, 'market'\)/.test(ctx));
  const css = read('css/neon.css'); for (const k of ['task', 'timer', 'market']) assert.ok(new RegExp(`\\[data-k=${k}\\]\\{--kc:`).test(css), k);
  assert.ok(/\.nt\[data-k\] i\{background:rgb\(var\(--kc\)\)/.test(css) && /inset 3px 0 0 rgb\(var\(--kc\)\)/.test(css));
});
test('dioda zadania w doku: task.due/task.overdue zapalają #dock[data-task], fokus Harmonogramu gasi', () => {
  const J = domJ(), dock = J.$('#dock'); dock.dataset = {};
  J.emit('signal', { type: 'timer.ended' }); assert.equal(dock.dataset.task, undefined, 'inne sygnały nie zapalają');
  J.emit('signal', { type: 'task.due' }); assert.equal(dock.dataset.task, 'due');
  J.emit('signal', { type: 'task.overdue' }); assert.equal(dock.dataset.task, 'overdue');
  J.emit('signal', { type: 'task.due' }); assert.equal(dock.dataset.task, 'overdue', 'przypomnienie nie obniża zaległości');
  J.wm.isFocused = () => false; J.emit('wm'); assert.equal(dock.dataset.task, 'overdue');
  J.wm.isFocused = id => id === 'schedule'; J.wm.isMin = () => false; J.emit('wm'); assert.equal(dock.dataset.task, undefined);
});
test('dioda zadania i puls monety: tylko opacity pseudo-elementu (CSS), puls karty z market-alert w aplikacji', () => {
  const css = read('css/neon.css');
  assert.ok(/\.dock\[data-task\] button\[data-app=schedule\]:before\{opacity:1\}/.test(css) && /@keyframes coinAlert\{0%,100%\{opacity:0\}35%\{opacity:1\}\}/.test(css));
  assert.ok(/sub\(ctx, 'market-alert'/.test(read('js/apps.js')));
});

/* ---------- cyfry LED (DSEG7) ---------- */
test('LED: J.led — cyfry + dwukropek w <b.c> + ghost (data-g); inne znaki zwykłym tekstem bez ghost; zapis tylko przy zmianie', () => {
  const J = domJ(), el = J.$('#led1'); el.dataset = {}; let w = 0; let html = ''; Object.defineProperty(el, 'innerHTML', { get: () => html, set: v => { w++; html = v; } });
  J.led(el, '12:34:56'); assert.equal(html, '12<b class="c">:</b>34<b class="c">:</b>56'); assert.equal(el.dataset.g, '88:88:88');
  J.led(el, '12:34:56'); assert.equal(w, 1, 'bez zmiany tekstu brak zapisu');
  J.led(el, '0/2'); assert.equal(el.dataset.g, '8/8'); J.led(el, '--'); assert.equal(el.dataset.g, '--');
  J.led(el, 'n/d'); assert.equal(el.dataset.g, undefined); assert.equal(el.textContent, 'n/d');
  J.led(el, '7:03.45'); assert.equal(el.dataset.g, '8:88.88');
});
test('LED: font DSEG7 w assets (podzbiór ≤ 2 KB), licencja OFL obok, w SHELL i README; unicode-range = podzbiór; CSP bez zmian', () => {
  const f = path.join(ROOT, 'assets', 'fonts'), woff = fs.readFileSync(path.join(f, 'dseg7-classic.woff2'));
  assert.equal(woff.slice(0, 4).toString(), 'wOF2'); assert.ok(woff.length < 2048, 'podzbiór: ' + woff.length + ' B');
  const lic = fs.readFileSync(path.join(f, 'DSEG-LICENSE.txt'), 'utf8'); assert.ok(/SIL OPEN FONT LICENSE Version 1\.1/.test(lic) && /keshikan/.test(lic));
  assert.ok(/'assets\/fonts\/dseg7-classic\.woff2'/.test(read('sw.js')));
  assert.ok(/DSEG7/.test(read('README.md')) && /DSEG-LICENSE\.txt/.test(read('README.md')));
  const css = read('css/neon.css'); assert.ok(/font-family:'DSEG7'[^}]*unicode-range:U\+0020,U\+002D-002E,U\+0030-003A/.test(css));
  assert.ok(/font-src 'self' data:/.test(read('index.html')), 'CSP font-src bez zmian');
});
test('LED: elementy zegara/liczników/minutnika mają klasę .led i piszą przez J.led; dwukropek miga tylko w standard+', () => {
  const lines = read('index.html').split('\n'); for (const id of ['tsTools', 'tsFps', 'tsClock', 'clockBig', 'dkFps', 'dkTools', 'dkUp']) assert.ok(/class="led"/.test(lines.find(l => l.includes('id="' + id + '"')) || ''), id);
  assert.ok(/J\.led\(/.test(read('js/dash.js')) && /J\.led\(\$\('#clockBig'\)/.test(read('js/main.js')) && /J\.led\(td,/.test(read('js/apps.js')) && /J\.led\(sd,/.test(read('js/apps.js')));
  const css = read('css/neon.css'); assert.ok(/#app:not\(\.lowfx\) :is\(#tsClock,#clockBig\) \.c\{animation:ledBlink 1s steps\(1,end\) infinite\}/.test(css) && /@keyframes ledBlink\{50%\{opacity:\.12\}\}/.test(css));
  assert.ok(/\.led\[data-g\]:before\{content:attr\(data-g\)[^}]*opacity:\.09/.test(css), 'ghost segments w niskim α');
});

/* ---------- układ HUD przy otwartych panelach ---------- */
const hudJ = () => { const J = load({ state: { settings: { hermesOn: false } } }); require('vm').runInContext(read('js/hud.js'), J.__ctx, { filename: 'hud.js' }); return J; };
const place = (J, W, H, chat, log) => {   // odtwarza geometrię layout(): k jak w kodzie, cy z dolnego limitu, zwraca prostokąty kart po dopasowaniu
  const k = Math.max(.5, Math.min(Math.min(W / 1240, H / 690), (H - 156) / 589, 1.12)), cx = W / 2, cy = Math.max(H * .3, 56 + 300 * k), boxes = J.hud.panelBoxes(W, H, chat, log, 1);
  return { k, cx, cy, boxes, cards: J.hud.CARDS.map(c => { const f = J.hud.fitCard(c, cx, cy, k, boxes), px = cx + f.dx * k, py = cy + c.dy * k, hh = (c.id === 'model' ? 150 : 84) * k; return { id: c.id, mini: f.mini, l: px - f.w * k / 2, r: px + f.w * k / 2, t: py - hh / 2, b: py + hh / 2 }; }) };
};
const hit = (a, b) => a.l < b.x1 && a.r > b.x0 && a.t < b.y1 && a.b > b.y0;
test('układ HUD: bez paneli nic się nie zwija i geometria jest jak dotąd', () => {
  const J = hudJ(); for (const [W, H] of [[1280, 668], [1440, 748], [1600, 848]]) { const r = place(J, W, H, false, false); assert.equal(r.boxes.length, 0); assert.ok(r.cards.every(c => !c.mini)); }
  const c = J.hud.CARDS[2], f = J.hud.fitCard(c, 800, 330, 1, []); assert.equal(JSON.stringify(f), JSON.stringify({ mini: false, dx: c.dx, w: c.w }));
});
test('układ HUD: żadna karta nie nachodzi na otwarty czat ani Process Log (1280×720, 1440×800, 1600×900, także obie szuflady naraz)', () => {
  const J = hudJ();
  for (const [W, H] of [[1280, 668], [1440, 748], [1600, 848]]) for (const [chat, log] of [[true, false], [false, true], [true, true]]) {
    const r = place(J, W, H, chat, log); assert.ok(r.boxes.length === (chat && log ? 2 : 1));
    for (const c of r.cards) for (const b of r.boxes) assert.ok(!hit(c, b), `${W}×${H} czat=${chat} log=${log}: karta ${c.id} nachodzi na panel`);
  }
});
test('układ HUD: zwija się tylko to, co koliduje; zwinięta karta zachowuje lewą krawędź (lub odsuwa się od panelu) i ma szerokość ikony', () => {
  const J = hudJ(), r = place(J, 1600, 848, true, false), by = Object.fromEntries(r.cards.map(c => [c.id, c]));
  assert.ok(by.external.mini && by.status.mini && by.logic.mini, 'karty prawej strony pod czatem zwinięte'); assert.ok(!by.tools.mini, 'Tool Calls leży nad czatem — zostaje pełna'); assert.ok(!by.model.mini && !by.intent.mini && !by.internet.mini && !by.done.mini, 'reszta zostaje pełna');
  assert.ok(place(J, 1600, 848, false, true).cards.find(c => c.id === 'tools').mini, 'z otwartym logiem (prawy górny róg) zwija się Tool Calls');
  const base = J.hud.CARDS.find(c => c.id === 'external'), left0 = r.cx + (base.dx - base.w / 2) * r.k; assert.ok(Math.abs(by.external.l - left0) < 1, 'lewa krawędź karty side=l bez zmian'); assert.ok(Math.abs(by.external.r - by.external.l - 56 * r.k) < 1);
  const n = place(J, 1280, 668, true, false); const t = n.cards.find(c => c.id === 'logic'); assert.ok(t.mini && t.r <= n.boxes[0].x0 - 11.9, 'wąski ekran: odsunięcie od panelu o ≥ 12 px');
  assert.equal(J.hud.panelBoxes(800, 600, true, true, 1).length, 0, '≤ 900 px panele są nakładkami — bez zwijania');
});
test('układ HUD: zdarzenie panels przelicza układ; szuflady je emitują; CSS zwija do ikony z zachowaniem treści dla czytników', () => {
  assert.ok(/J\.on\('panels', layout\)/.test(read('js/hud.js')) && /J\.emit\('wm'\); J\.emit\('panels'\)/.test(read('js/main.js')) && /J\.emit\('panels'\)/.test(read('js/process.js')));
  const css = read('css/neon.css'); assert.ok(/\.hc\.mini \.hc-t\{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset\(50%\)/.test(css) && /\.hc\.mini :is\(\.hc-r,\.hc-bar,\.hc-wave\)\{display:none\}/.test(css));
  assert.ok(/\.toasts\{top:104px;left:128px;transform:none/.test(css) && /@media \(max-width:640px\)\{\.toasts\{top:auto;bottom:150px\}\}/.test(css), 'dymki w lewym górnym obszarze, na telefonie nadal na dole');
  assert.ok(/@media \(max-height:820px\)\{\.toasts\{left:196px/.test(css), 'niski ekran: dymki za drugą kolumną paska ikon');
});

/* ---------- dźwięk zsynchronizowany ze stanem ---------- */
const sfxSetup = () => { const J = domJ(), calls = []; for (const n of ['tick', 'success', 'error', 'ask']) J.sfx[n] = () => calls.push(n); let t = 1e6; J.__ctx.Date = { now: () => t }; return { J, calls, adv: ms => { t += ms; } }; };
test('sfx: COMPLETED = „gotowe”, ERROR = „błąd”, narzędzie = cichy tik z limitem 150 ms; powtórka (replay) i anulowanie milczą', () => {
  const { J, calls, adv } = sfxSetup();
  J.ev.emit('task.created', { task_id: 'a', title: 't' });
  J.ev.emit('tool.started', { tool: 'x', task_id: 'a' }); J.ev.emit('tool.started', { tool: 'y', task_id: 'a' }); assert.deepEqual([...calls], ['tick'], 'dwa narzędzia w jednej chwili = jeden tik');
  adv(200); J.ev.emit('tool.started', { tool: 'z', task_id: 'a' }); assert.deepEqual([...calls], ['tick', 'tick']);
  J.ev.emit('task.completed', { task_id: 'a' }); J.ev.emit('task.failed', { task_id: 'b' }); J.ev.emit('task.cancelled', { task_id: 'c' });
  assert.deepEqual([...calls], ['tick', 'tick', 'success', 'error']);
  J.ev.emit('tool.started', { tool: 'x', replay: true, task_id: 'replay' }); adv(500); J.ev.emit('tool.started', { tool: 'x', replay: true, task_id: 'replay' }); J.ev.emit('task.completed', { replay: true, task_id: 'replay' });
  assert.equal(calls.length, 4, 'replay nie gra');
});
test('sfx: dźwięk pytania gra raz, z J.ask (nie z approval.requested), a ai.js nie dubluje success/error', () => {
  const { J, calls } = sfxSetup(); J.ev.emit('approval.requested', { question: 'q' }); assert.equal(calls.length, 0, 'zdarzenie nie dubluje dźwięku J.ask');
  assert.ok(/J\.ev\.emit\('approval\.requested', \{ question, timeout_ms: ms(, risk: !!o\.risk)? \}\); J\.sfx\.ask\(\)/.test(read('js/main.js')));
  const ai = read('js/ai.js'); assert.ok(!/J\.sfx\.success\(\)/.test(ai) && !/bubble\.set\('⚠ ' \+ e\.message\); J\.sfx\.error\(\)/.test(ai), 'jedno miejsce odtwarzania: fx-director');
});
test('sfx: wyciszenie (przełącznik, cisza nocna, prezentacja) siedzi w J.sfx — fx-director nie omija go', () => {
  const J = domJ(); J.state.settings.sound = false; let played = 0; J.__ctx.AudioContext = class { constructor() { played++; } get state() { return 'running'; } createOscillator() { played++; return { frequency: { setValueAtTime() { }, exponentialRampToValueAtTime() { } }, connect: () => ({ connect() { } }), start() { }, stop() { } }; } };
  J.ev.emit('task.completed', { task_id: 'a' }); J.ev.emit('task.failed', { task_id: 'a' }); J.ev.emit('tool.started', { tool: 'x', task_id: 'a' }); assert.equal(played, 0, 'sound=false: cisza');
});
test('sfx: spec 09 §8 zawiera tabelę „dźwięk ↔ odpowiednik wizualny”', () => {
  const sp = read('docs/spec/09-wyglad-stany.md'); assert.ok(/odpowiednik wizualny/.test(sp) && /fx-director/.test(sp.slice(sp.indexOf('## 8. Dźwięki'))));
});

/* ---------- APPROVAL ---------- */
test('APPROVAL: oddychający bursztyn na rimie, karcie ask i chipie — tylko opacity, bez ruchu w off/tool', () => {
  const css = read('css/neon.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/@keyframes askRim\{50%\{opacity:\.45\}\}/.test(css) && /@keyframes askRing\{50%\{opacity:\.4\}\}/.test(css));
  assert.ok(/#app\[data-mode=APPROVAL_REQUIRED\]:not\(\.lowfx\) \.vignette:before\{animation:askRim/.test(css), 'rim oddycha tylko w standard+');
  assert.ok(/\.hc\[data-s=ask\] \.hc-en\{display:block;--ec:var\(--warn-rgb\)\}/.test(css) && /\.ask-chip\.show\{box-shadow:[^}]*--warn-rgb/.test(css));
  const kf = css.match(/@keyframes ask(?:Rim|Ring)\{[^}]*\}\}?/g).join(''); assert.ok(!/transform|box-shadow|filter/.test(kf));
  const J = load({ state: { settings: { hermesOn: false } } }); const pal = J.statePalette('#4df3ff', '#ff2bd6'); assert.equal(pal.APPROVAL_REQUIRED, '255,176,32', 'bursztyn w motywie neon');
});

test('dostępność LED: ghost segments („88:88:88”) mają pusty tekst alternatywny (content: attr(data-g) / "")', () => {
  const css = read('css/neon.css');
  assert.ok(/\.led\[data-g\]:before\{content:attr\(data-g\);content:attr\(data-g\) \/ ""/.test(css), 'czytnik ekranu nie dostaje cyfr 8');
  assert.ok(!/\.led\[data-g\]:before\{content:attr\(data-g\);position/.test(css), 'sama deklaracja bez alternatywy już nie istnieje');
});
