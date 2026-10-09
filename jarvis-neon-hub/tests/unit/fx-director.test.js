/* js/fx-director.js + zdarzenie 'mode' z events.js: sekwencje zdarzeń → data-mode/--glow-state/--activity/impulsy */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../harness.js');

/* świeża instancja z atrapą #app, fałszywymi timerami i zegarem; zlicza zapisy stylu */
const setup = (rank = 2) => {
  const J = load({ state: { settings: { hermesOn: false } } }), ctx = J.__ctx;
  const writes = []; let now = 1e6, tid = 0; const timers = new Map();
  ctx.Date = { now: () => now };
  ctx.setTimeout = (fn, ms) => { timers.set(++tid, { fn, at: now + ms }); return tid; }; ctx.clearTimeout = id => timers.delete(id);
  const el = J.__ctx.document.createElement('div'); el.dataset = {};
  const props = {};
  el.style = { setProperty: (k, v) => { props[k] = v; writes.push([k, v]); }, removeProperty: k => { delete props[k]; writes.push([k, null]); } };
  J.fxd.el = el; J.fx = { rank: () => rank }; J.fxd.apply();
  const advance = ms => { now += ms; for (const [id, t] of [...timers]) if (t.at <= now) { timers.delete(id); t.fn(); } };
  const modes = []; J.on('mode', m => modes.push(m.mode));
  return { J, el, props, writes, advance, modes, setRank: r => { rank = r; }, timers };
};

test('mode: emit raz na zmianę, z payloadem {mode, since}', () => {
  const { J, modes } = setup();
  J.ev.emit('task.created', { title: 't', task_id: 'a' });
  J.ev.emit('model.started', { task_id: 'a' }); J.ev.emit('model.started', { task_id: 'a' });   // THINKING → THINKING: bez emisji
  J.ev.emit('tool.started', { tool: 'get_weather', task_id: 'a' });
  J.ev.emit('approval.requested', { task_id: 'a' });
  J.ev.emit('tool.completed', { tool: 'get_weather', task_id: 'a' });   // hold blokuje recompute: tryb bez zmiany
  assert.deepEqual(modes, ['THINKING', 'EXECUTING', 'APPROVAL_REQUIRED']);
  let got; J.on('mode', m => { got = m; }); J.ev.emit('task.completed', { task_id: 'a' });
  assert.equal(got.mode, 'COMPLETED'); assert.equal(typeof got.since, 'number');
});

test('sekwencja zdarzeń → data-mode, data-working i --glow-state', () => {
  const { J, el, props } = setup();
  assert.equal(el.dataset.mode, 'IDLE'); assert.equal(props['--glow-state'], undefined, 'IDLE: barwa motywu (brak nadpisania)');
  J.ev.emit('task.created', { task_id: 'a', title: 't' });
  assert.equal(el.dataset.mode, 'THINKING'); assert.ok(props['--glow-state']); assert.ok('data-working' in el.attributes);
  J.ev.emit('tool.started', { tool: 'x', task_id: 'a' });
  assert.equal(el.dataset.mode, 'EXECUTING'); assert.equal(props['--glow-state'], undefined); assert.ok('data-working' in el.attributes);
  J.ev.emit('approval.requested', { task_id: 'a' });
  assert.equal(el.dataset.mode, 'APPROVAL_REQUIRED'); assert.equal(props['--glow-state'], '255,176,32'); assert.ok(!('data-working' in el.attributes));
  J.ev.emit('approval.resolved', { task_id: 'a' });
  J.ev.emit('task.paused', { task_id: 'a' }); assert.equal(props['--glow-state'], '176,128,40');
  J.ev.emit('task.recovering', { task_id: 'a' }); assert.equal(props['--glow-state'], '255,122,41');
  J.ev.emit('task.verifying', { task_id: 'a' }); assert.equal(el.dataset.mode, 'VERIFYING'); assert.equal(props['--glow-state'], '196,160,255');
  J.ev.emit('task.failed', { task_id: 'a' });
  assert.equal(el.dataset.mode, 'ERROR'); assert.equal(props['--glow-state'], '255,59,92');
});

test('ear: LISTENING biało-cyjan, STANDBY wywodzony z J.ear.standby', () => {
  const { J, el, props } = setup();
  J.emit('ear', true); assert.equal(el.dataset.mode, 'LISTENING'); assert.equal(props['--glow-state'], '190,245,255');
  J.emit('ear', false); assert.equal(el.dataset.mode, 'IDLE');
  J.ear.standby = true; J.emit('ear-standby', true); assert.equal(el.dataset.mode, 'STANDBY');
  J.ear.standby = false; J.emit('ear-standby', false); assert.equal(el.dataset.mode, 'IDLE');
});

test('wygasanie: COMPLETED gaśnie po 2600 ms (kolor), po 3600 ms wraca IDLE; ERROR po 3500 ms', () => {
  const { J, el, props, advance, modes } = setup();
  J.ev.emit('task.created', { task_id: 'a' }); J.ev.emit('task.completed', { task_id: 'a' });
  assert.equal(props['--glow-state'], '61,255,160');
  advance(2500); assert.equal(props['--glow-state'], '61,255,160');
  advance(200); assert.equal(props['--glow-state'], undefined, 'kolor wygasł, tryb jeszcze COMPLETED'); assert.equal(el.dataset.mode, 'COMPLETED');
  advance(1000); assert.equal(el.dataset.mode, 'IDLE'); assert.deepEqual(modes.slice(-2), ['COMPLETED', 'IDLE']);
  J.ev.emit('task.created', { task_id: 'b' }); J.ev.emit('task.failed', { task_id: 'b' });
  advance(3400); assert.equal(props['--glow-state'], '255,59,92'); advance(200); assert.equal(props['--glow-state'], undefined);
  advance(1000); assert.equal(el.dataset.mode, 'IDLE');
});

test('wygasanie z mikrofonem: po COMPLETED wraca LISTENING (efektywny tryb)', () => {
  const { J, el, advance } = setup();
  J.emit('ear', true); J.ev.emit('task.created', { task_id: 'a' }); J.ev.emit('task.completed', { task_id: 'a' });
  advance(3700); assert.equal(el.dataset.mode, 'LISTENING');
});

test('bramkowanie rank(): off/tool bez impulsów i --activity, standard/cinema pełne', () => {
  for (const r of [0, 1]) {
    const { J, el, props, writes } = setup(r);
    J.ev.emit('task.created', { task_id: 'a' }); J.ev.emit('tool.failed', { tool: 'x', task_id: 'a' }); J.ev.emit('task.completed', { task_id: 'a' });
    J.engine.activity = .9; J.fxd.tick();
    assert.ok(!el.classList.contains('fx-pulse-ok') && !el.classList.contains('fx-pulse-err'), 'rank ' + r);
    assert.equal(el.dataset.mode, 'COMPLETED'); assert.equal(props['--glow-state'], '61,255,160', 'kolor stanu działa także na off/tool');
    assert.ok(writes.every(w => w[0] !== '--activity' || w[1] === '0'));
  }
  for (const r of [2, 3]) {
    const { J, el } = setup(r);
    J.ev.emit('task.created', { task_id: 'a' }); J.ev.emit('task.completed', { task_id: 'a' });
    assert.ok(el.classList.contains('fx-pulse-ok'), 'rank ' + r);
  }
});

test('rank czytany leniwie: zmiana poziomu w trakcie działa od razu, J.emit(fx) czyści impulsy', () => {
  const { J, el, setRank } = setup(3);
  J.ev.emit('task.created', { task_id: 'a' }); J.ev.emit('task.failed', { task_id: 'a' }); assert.ok(el.classList.contains('fx-pulse-err'));
  setRank(0); J.emit('fx', 'off'); assert.ok(!el.classList.contains('fx-pulse-err'));
  J.ev.emit('approval.requested', { task_id: 'a' }); assert.ok(!el.classList.contains('fx-pulse-warn'));
});

test('impulsy: czas życia < 1 s, usuwane po timeoucie lub animationend, burst = jeden błysk', () => {
  const { J, el, advance, timers } = setup();
  J.ev.emit('task.created', { task_id: 'a' }); J.ev.emit('tool.failed', { tool: 'x', task_id: 'a' }); J.ev.emit('tool.failed', { tool: 'x', task_id: 'a' });
  assert.ok(el.classList.contains('fx-pulse-err'));
  const pend = [...timers.values()].filter(t => t.at - 1e6 < 1000 && t.at - 1e6 >= 800); assert.equal(pend.length, 1, 'jeden timer sprzątający na burst');
  advance(950); assert.ok(!el.classList.contains('fx-pulse-err'));
  J.ev.emit('approval.requested', { task_id: 'a' }); assert.ok(el.classList.contains('fx-pulse-warn'));
  advance(1000); assert.ok(!el.classList.contains('fx-pulse-warn'));
});

test('impulsy: stary timer sprzątający nie obcina nowego impulsu tego samego rodzaju; ptimers nie rośnie', () => {
  const { J, el, advance } = setup();
  J.ev.emit('task.created', { task_id: 'a' });
  for (let i = 0; i < 30; i++) { J.ev.emit('tool.failed', { tool: 'x', task_id: 'a' }); advance(850); J.fxd.clearPulses(); assert.ok(Object.keys(J.fxd.ptimers).length <= 3); }
  J.ev.emit('tool.failed', { tool: 'x', task_id: 'a' }); advance(850); J.fxd.clearPulses();   // animationend tuż przed końcem timera zapasowego
  J.ev.emit('tool.failed', { tool: 'x', task_id: 'a' }); assert.ok(el.classList.contains('fx-pulse-err'));
  advance(100); assert.ok(el.classList.contains('fx-pulse-err'), 'timer poprzedniego impulsu (t+900) nie może skrócić nowego');
  advance(850); assert.ok(!el.classList.contains('fx-pulse-err')); assert.deepEqual(Object.keys(J.fxd.ptimers), [], 'po zakończeniu brak osieroconych timerów');
  assert.equal(J.fxd.pulses, undefined, 'dawny zbiór D.pulses (rósł bez końca) usunięty');
});

test('impulsy: brak w trybie prezentacji', () => {
  const { J, el } = setup(); el.classList.add('present');
  J.ev.emit('task.created', { task_id: 'a' }); J.ev.emit('tool.failed', { tool: 'x', task_id: 'a' }); J.ev.emit('approval.requested', { task_id: 'a' }); J.ev.emit('task.completed', { task_id: 'a' });
  assert.ok(!['ok', 'err', 'warn'].some(k => el.classList.contains('fx-pulse-' + k)));
  el.classList.remove('present'); J.ev.emit('task.failed', { task_id: 'a' }); assert.ok(el.classList.contains('fx-pulse-err'), 'po wyjściu z prezentacji impulsy wracają');
});

test('animationend: czyści impuls tylko dla własnej animacji fxPulse* na #app', () => {
  const { J, el } = setup();
  J.ev.emit('task.created', { task_id: 'a' }); J.ev.emit('task.failed', { task_id: 'a' });
  J.fxd.animEnd({ target: {}, animationName: 'fxPulse' }); assert.ok(el.classList.contains('fx-pulse-err'), 'cudzy element');
  J.fxd.animEnd({ target: el, animationName: 'breathe' }); assert.ok(el.classList.contains('fx-pulse-err'), 'cudza animacja');
  J.fxd.animEnd({ target: el, animationName: 'fxPulse' }); assert.ok(!el.classList.contains('fx-pulse-err'));
});

test('liczba zapisów --glow-state: wiele ear / ear-standby pod rząd nie dotyka stylu', () => {
  const { J, writes } = setup(); const n = () => writes.filter(w => w[0] === '--glow-state').length;
  J.emit('ear', true); const g1 = n(); for (let i = 0; i < 6; i++) J.emit('ear', true); assert.equal(n(), g1, 'ear×N');
  J.emit('ear', false); const g2 = n(); for (let i = 0; i < 6; i++) J.emit('ear', false); assert.equal(n(), g2);
  J.ear.standby = true; for (let i = 0; i < 6; i++) J.emit('ear-standby', true); assert.equal(n(), g2, 'STANDBY nie zmienia koloru rim (tylko data-mode)');
  J.ear.standby = false; for (let i = 0; i < 6; i++) J.emit('ear-standby', false); assert.equal(n(), g2);
});

test('J.on(settings) odświeża --glow-state po zmianie motywu (kolor stanu zależy od palety)', () => {
  const { J, props } = setup();
  J.ev.emit('task.created', { task_id: 'a' }); J.ev.emit('task.completed', { task_id: 'a' });
  assert.equal(props['--glow-state'], '61,255,160');
  J.state.settings.accent = '#39e59a'; J.state.settings.accent2 = '#21d9ff'; J.emit('settings');   // motyw „zielony”: COMPLETED musi odjechać od akcentu
  assert.notEqual(props['--glow-state'], '61,255,160'); assert.match(props['--glow-state'], /^\d+,\d+,\d+$/);
});

test('--activity: wygładzone, kwantyzowane, zapis tylko przy zmianie (nie na klatkę)', () => {
  const { J, writes } = setup();
  const n0 = writes.filter(w => w[0] === '--activity').length;
  J.engine.activity = .06; for (let i = 0; i < 100; i++) J.fxd.tick();
  const stable = writes.filter(w => w[0] === '--activity').length - n0;
  assert.ok(stable <= 2, 'w spoczynku brak zapisów w kółko: ' + stable);
  J.engine.activity = .9; for (let i = 0; i < 100; i++) J.fxd.tick();
  const act = writes.filter(w => w[0] === '--activity'), vals = act.map(w => +w[1]);
  assert.ok(vals.at(-1) > .85 && vals.at(-1) <= .9, 'dochodzi do wartości docelowej: ' + vals.at(-1));
  assert.ok(act.length - n0 <= 25, 'kwantyzacja 0,05 ogranicza liczbę zapisów: ' + (act.length - n0));
  const before = writes.length; for (let i = 0; i < 100; i++) J.fxd.tick(); assert.equal(writes.length, before, 'ustalona wartość = zero zapisów');
});

test('--glow-state: jeden zapis na zmianę koloru, nie na zdarzenie', () => {
  const { J, writes } = setup();
  J.ev.emit('task.created', { task_id: 'a' });
  const g0 = writes.filter(w => w[0] === '--glow-state').length;
  for (let i = 0; i < 20; i++) { J.ev.emit('model.started', { task_id: 'a' }); J.ev.emit('model.completed', { task_id: 'a' }); J.ev.emit('plan.created', { steps: ['a'], task_id: 'a' }); }
  assert.equal(writes.filter(w => w[0] === '--glow-state').length, g0, 'THINKING↔THINKING nie dotyka stylu');
});

test('fx-director jest w index.html przed main.js i w powłoce SW', () => {
  const fs = require('fs'), path = require('path'), root = path.join(__dirname, '..', '..');
  const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8'), sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.ok(sw.includes("'js/fx-director.js'")); assert.ok(idx.indexOf('js/fx-director.js') > 0 && idx.indexOf('js/fx-director.js') < idx.indexOf('js/main.js'));
});

test('impuls: nowy impuls po zewnętrznym zdjęciu klasy zastępuje stary timer (clearTimeout), a nie dokłada drugiego', () => {
  const { J, el, advance, timers } = setup();
  J.ev.emit('task.created', { task_id: 'a' }); J.ev.emit('tool.failed', { tool: 'x', task_id: 'a' }); advance(500);
  el.classList.remove('fx-pulse-err');   // np. przebudowa klas #app poza dyrektorem
  J.ev.emit('tool.failed', { tool: 'x', task_id: 'a' }); assert.ok(el.classList.contains('fx-pulse-err'));
  assert.equal([...timers.values()].filter(t => t.at - 1e6 >= 800 && t.at - 1e6 < 1500).length, 1, 'jeden timer na rodzaj');
  advance(450); assert.ok(el.classList.contains('fx-pulse-err'), 'stary timer (t+900) nie skraca nowego impulsu');
});
