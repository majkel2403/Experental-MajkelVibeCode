/* Faza 5A: efekty kinowe napędzane realnymi zdarzeniami — każdy test: emit → klasa/efekt (bez DOM, z atrapą #app jak w fx-director.test.js) */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { load } = require('../harness.js');
const ROOT = path.join(__dirname, '..', '..');

test('komety: pakiety narzędzi i modelu niosą znacznik porażki (tool.failed / model.failed → czerwona kometa)', () => {
  const J = load({ state: { settings: { hermesOn: false } } });
  J.ev.emit('task.created', { task_id: 'a', title: 't' });
  J.ev.emit('tool.started', { tool: 'get_weather', task_id: 'a' }); J.ev.emit('tool.completed', { tool: 'get_weather', task_id: 'a' });
  J.ev.emit('tool.started', { tool: 'x', task_id: 'a' }); J.ev.emit('tool.failed', { tool: 'x', task_id: 'a' });
  J.ev.emit('model.started', { task_id: 'a' }); J.ev.emit('model.failed', { task_id: 'a' });
  const by = (d, bad) => J.engine.packets.filter(p => p.dir === d && p.bad === bad).map(p => p.node);
  assert.equal(J.engine.packets.filter(p => p.dir === 'out').map(p => p.bad).join(), 'false,false,false', 'start nie jest porażką');
  assert.equal(J.engine.packets.filter(p => p.dir === 'in' && p.bad).length, 2, 'dwa wyniki nieudane: narzędzie i model');
  assert.equal(by('in', false).length, 1, 'tool.completed → zwykły pakiet');
});

test('komety: rysowanie w main.js — ogon COMET_N=6, tylko cinema (rank ≥ 3), rozbłysk po 700 ms', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  assert.match(src, /const COMET_N = 6;/);
  assert.match(src, /const cin = J\.fx\.rank\(\) >= 3 && !J\.fxd\?\.calm\?\.\(\);/);   // + wspólna bramka calm (prezentacja/skupienie)
  assert.match(src, /age >= 700 && \(out \|\| p\.bad\)/);
});

/* świeża instancja z atrapą #app, fałszywymi timerami (jak w fx-director.test.js) */
const setup = (rank = 3) => {
  const J = load({ state: { settings: { hermesOn: false } } }), ctx = J.__ctx;
  let now = 1e6, tid = 0; const timers = new Map();
  ctx.Date = { now: () => now }; ctx.performance = { now: () => now };
  ctx.setTimeout = (fn, ms) => { timers.set(++tid, { fn, at: now + ms }); return tid; }; ctx.clearTimeout = id => timers.delete(id);
  const el = ctx.document.createElement('div'); el.dataset = {}; el.style = { setProperty() { }, removeProperty() { } };
  J.fxd.el = el; J.fx = { rank: () => rank }; J.fxd.apply();
  const advance = ms => { now += ms; for (const [id, t] of [...timers]) if (t.at <= now) { timers.delete(id); t.fn(); } };
  return { J, el, advance, setRank: r => { rank = r; }, has: c => el.classList.contains(c) };
};

test('aberracja: realny task.failed, tool.failed, model.failed, security.injection → fx-ca (cinema), znika po 200 ms', () => {
  for (const [type, payload] of [['task.failed', { result: 'Błąd sieci' }], ['tool.failed', { tool: 'x' }], ['model.failed', {}], ['security.injection', { tool: 'x' }]]) {
    const t = setup(3); t.J.ev.emit(type, payload);
    assert.ok(t.has('fx-ca'), type + ' → klasa fx-ca'); assert.ok(t.J.fxd.caAt > 0, 'caAt dla shadera');
    t.advance(199); assert.ok(t.has('fx-ca')); t.advance(2); assert.ok(!t.has('fx-ca'), 'po ~200 ms klasa zdjęta');
  }
});
test('aberracja: NIE przy degradacji do trybu lokalnego, powtórce ani poniżej cinema; drugi błysk w trakcie jest pomijany', () => {
  let t = setup(3);
  t.J.ev.emit('task.failed', { result: 'Nie udało się. ⚠ Hermes jest offline — użyłem silnika lokalnego' }); assert.ok(!t.has('fx-ca'), 'komunikat o degradacji');
  t.J.ev.emit('task.failed', { degraded: true }); assert.ok(!t.has('fx-ca'), 'flaga degraded');
  t.J.ev.emit('task.failed', { replay: true, task_id: 'replay' }); t.J.ev.emit('tool.failed', { replay: true }); assert.ok(!t.has('fx-ca'), 'powtórka');
  t = setup(2); t.J.ev.emit('task.failed', {}); t.J.ev.emit('tool.failed', {}); assert.ok(!t.has('fx-ca') && !t.J.fxd.caAt, 'standard: bez aberracji');
  t = setup(3); t.J.ev.emit('tool.failed', {}); const at = t.J.fxd.caAt; t.advance(50); t.J.ev.emit('model.failed', {}); assert.equal(t.J.fxd.caAt, at, 'burst = jeden błysk');
  t = setup(3); t.J.ev.emit('model.failed', { net: true }); t.J.ev.emit('model.failed', { aborted: true }); assert.ok(!t.has('fx-ca') && !t.J.fxd.caAt, 'model.failed po błędzie sieci / Stop: bez aberracji');
  t = setup(3); t.J.ev.emit('model.failed', { net: false, aborted: false }); assert.ok(t.has('fx-ca'), 'realny błąd modelu (np. HTTP 500): aberracja');
  t = setup(3); t.J.ev.emit('tool.failed', {}); t.setRank(1); t.J.emit('fx', 'tool'); assert.ok(!t.has('fx-ca'), 'spadek poziomu kasuje efekt');
});
test('ai.js: degradacja do silnika lokalnego emituje task.completed z flagą degraded (nie task.failed)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'ai.js'), 'utf8');
  assert.match(src, /route === 'local-offline' \? \{ degraded: true \}/);
  assert.match(src, /status === 'ok' \? 'task\.completed'/, 'task.failed tylko dla status !== ok (prawdziwy błąd)');
});

test('skan sukcesu: task.completed → błysk topbara (standard+), zielona linia skanu tylko w cinema i po zadaniu z narzędziem; powtórka milczy', () => {
  let t = setup(3);
  t.J.ev.emit('task.created', { task_id: 'a', title: 'x' }); t.J.ev.emit('tool.started', { tool: 'get_weather', task_id: 'a' }); t.J.ev.emit('tool.completed', { tool: 'get_weather', task_id: 'a' });
  t.J.ev.emit('task.completed', { task_id: 'a', title: 'x' });
  assert.ok(t.has('fx-tb') && t.has('fx-scan'));
  t.advance(601); assert.ok(!t.has('fx-scan') && t.has('fx-tb'), 'skan znika po 600 ms, błysk paska trwa 700');
  t.advance(100); assert.ok(!t.has('fx-tb'));
  t = setup(2); t.J.ev.emit('task.created', { task_id: 'a' }); t.J.ev.emit('tool.started', { tool: 'x', task_id: 'a' }); t.J.ev.emit('task.completed', { task_id: 'a' });
  assert.ok(t.has('fx-tb') && !t.has('fx-scan'), 'standard: sam błysk linii');
  t = setup(3); t.J.ev.emit('task.created', { task_id: 'a' }); t.J.ev.emit('task.completed', { task_id: 'a' });
  assert.ok(t.has('fx-tb') && !t.has('fx-scan'), 'zadanie bez narzędzi: bez skanu');
  t = setup(1); t.J.ev.emit('task.created', { task_id: 'a' }); t.J.ev.emit('task.completed', { task_id: 'a' }); assert.ok(!t.has('fx-tb'), 'tool/off: bez błysku');
  t = setup(3); t.J.ev.emit('task.completed', { task_id: 'replay', replay: true }); assert.ok(!t.has('fx-tb') && !t.has('fx-scan'), 'powtórka');
  t = setup(3); t.el.classList.add('present'); t.J.ev.emit('task.created', { task_id: 'a' }); t.J.ev.emit('task.completed', { task_id: 'a' }); assert.ok(!t.has('fx-tb'), 'tryb prezentacji');
});

test('zgoda: approval.requested niesie timeout_ms (realny limit J.ask) i z niego liczy się pierścień odliczania', () => {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  assert.match(main, /J\.ev\.emit\('approval\.requested', \{ question, timeout_ms: ms(, risk: !!o\.risk)? \}\)/);
  assert.match(main, /const ms = o\.timeout \|\| 60000/, 'ms to ten sam limit, który uruchamia timer J.ask');
  const t = setup(2), ctx = t.J.__ctx; let n = 0;
  ctx.document.createElement = () => { const e = require('../harness.js').mkEl('i'); e.children = []; e.id = ++n; return e; };
  const chip = require('../harness.js').mkEl('div');
  t.J.ev.emit('approval.requested', { question: 'q', timeout_ms: 24000 });
  assert.equal(t.J.fxd.ask.ms, 24000);
  t.J.fxd.ringMount(chip); const box = chip.children[0];
  assert.equal(box.children.length, 24, '24 segmenty');
  assert.equal(box.children.filter(s => !s.classList.contains('off')).length, 24, 'na starcie wszystkie świecą');
  assert.equal(t.J.fxd.ringLit(24000, 24000), 24); assert.equal(t.J.fxd.ringLit(24000, 12000), 12); assert.equal(t.J.fxd.ringLit(24000, 0), 0); assert.equal(t.J.fxd.ringLit(24000, 1500), 2);
  t.J.ev.emit('approval.resolved', { answer: 'yes' }); assert.equal(t.J.fxd.ask, null); assert.equal(t.J.fxd.ringBox, null, 'koniec zgody zatrzymuje odliczanie');
  t.J.ev.emit('approval.requested', { question: 'bez limitu' }); const c2 = require('../harness.js').mkEl('div'); t.J.fxd.ringMount(c2); assert.equal(c2.children.length, 0, 'bez timeout_ms brak pierścienia');
});
test('zgoda: chip ma pasy ostrzegawcze i rim (css/neon.css), animacja pasów tylko w cinema, tylko transform', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css', 'neon.css'), 'utf8');
  assert.match(css, /#app\[data-fx=cinema\] \.ac-haz b\{animation:acHaz/); assert.match(css, /@keyframes acHaz\{to\{transform:translateX/);
  assert.match(fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8'), /ac-haz t.*ac-haz b.*ac-rim/s);
});

test('NO LINK: tylko realna awaria — Hermes „down” przy skonfigurowanym Hermesie albo navigator.onLine === false; nie dla unknown/local/offlineMode', () => {
  const W = require('../harness.js'); const j = W.load({ state: { settings: { hermesOn: false } } }), w = j.fxd.noLinkWanted;
  assert.equal(w({ status: 'down', aiReady: true }), true); assert.equal(w({ onLine: false }), true);
  assert.equal(w({ status: 'unknown', aiReady: true }), false, 'unknown to jeszcze nie awaria'); assert.equal(w({ status: 'up', aiReady: true, onLine: true }), false);
  assert.equal(w({ status: 'down', aiReady: false }), false, 'Hermes wyłączony (tryb lokalny): stary status nic nie znaczy');
  assert.equal(w({ status: 'down', aiReady: true, offlineMode: true }), false, 'offlineMode to wybór użytkownika'); assert.equal(w({ onLine: false, offlineMode: true }), false);
});
test('NO LINK: trwały down Hermesa (po zwłoce) lub brak sieci (od razu) → #fxNoLink + data-nolink, płynne wyjście; nie poniżej standard i nie w prezentacji', () => {
  const t = setup(2), ctx = t.J.__ctx; ctx.requestAnimationFrame = fn => { fn(); return 1; };
  let added = null; const mk = ctx.document.createElement; ctx.document.createElement = tag => { const e = mk(tag); e.remove = () => { e.removed = true; }; return e; };
  t.el.appendChild = c => { added = c; return c; };
  t.J.state.settings.hermesOn = true; t.J.state.settings.hermesUrl = 'http://x'; t.J.state.settings.hermesProvider = 'custom';
  t.J.hermes.status = 'unknown'; t.J.emit('hermes'); assert.ok(!('data-nolink' in t.el.attributes), 'unknown: bez efektu');
  t.J.aiReady = () => true; t.J.hermes.status = 'down'; t.J.emit('hermes');
  assert.ok(!('data-nolink' in t.el.attributes) && !added, 'pojedynczy „down” (nieudane zapytanie, restart gatewaya) nie zmienia wyglądu od razu');
  t.advance(t.J.fxd.NL_DELAY - 1000); assert.ok(!('data-nolink' in t.el.attributes), 'przed upływem zwłoki nadal bez efektu');
  t.advance(1010); assert.ok('data-nolink' in t.el.attributes && added && added.id === 'fxNoLink' && added.classList.contains('on'), 'trwały down → linia i etykieta');
  t.J.hermes.status = 'up'; t.J.emit('hermes'); assert.ok(!('data-nolink' in t.el.attributes) && !added.classList.contains('on') && !added.removed, 'wyjście: najpierw zanik (opacity)');
  t.advance(701); assert.ok(added.removed, 'po przejściu element znika z układu');
  ctx.navigator.onLine = false; t.J.fxd.nlSync(); assert.ok('data-nolink' in t.el.attributes, 'navigator.onLine === false');
  t.J.state.settings.offlineMode = true; t.J.emit('settings'); assert.ok(!('data-nolink' in t.el.attributes), 'offlineMode → bez NO LINK');
  t.J.state.settings.offlineMode = false; t.J.emit('settings'); assert.ok('data-nolink' in t.el.attributes);
  t.setRank(1); t.J.emit('fx', 'tool'); assert.ok(!('data-nolink' in t.el.attributes), 'tool/off: bez nakładki');
  t.setRank(2); t.el.classList.add('present'); t.J.emit('fx', 'standard'); assert.ok(!('data-nolink' in t.el.attributes), 'prezentacja');
});

test('pierścień planu: N segmentów = kroki planu z plan.created; bez planu brak pierścienia; ukończone rosną z plan.step', () => {
  const J = load({ state: { settings: { hermesOn: false } } });
  J.ev.emit('task.created', { task_id: 'a', title: 'x' });
  assert.equal(J.planSegs(J.engine.plan), null, 'bez plan.created (ścieżka lokalna) pierścienia nie ma');
  J.ev.emit('plan.created', { steps: ['a', 'b', 'c', 'd'] }, 'hermes');
  assert.equal(JSON.stringify(J.planSegs(J.engine.plan)), '{"n":4,"done":0}');
  J.ev.emit('plan.step', { index: 0 }, 'hermes'); J.ev.emit('plan.step', { index: 1 }, 'hermes');
  assert.equal(J.planSegs(J.engine.plan).done, 2);
  J.ev.emit('plan.step', { index: 3 }, 'hermes'); assert.equal(J.planSegs(J.engine.plan).done, 4, 'wszystkie ukończone');
  assert.equal(J.planSegs({ steps: Array(40).fill('k'), done: 20 }).n, 16, 'limit 16 segmentów'); assert.equal(J.planSegs({ steps: Array(40).fill('k'), done: 20 }).done, 8, 'proporcjonalnie przy > 16 krokach');
  J.ev.emit('task.created', { task_id: 'b', title: 'y' }); assert.equal(J.planSegs(J.engine.plan), null, 'nowe zadanie czyści plan');
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8'); assert.match(main, /J\.fx\.rank\(\) >= 3 && !J\.fxd\?\.calm\?\.\(\) && busy \? J\.planSegs\(eg\.plan\)/, 'tylko cinema, poza calm i tylko w trakcie zadania');
});

test('siatka: w spoczynku prawie stoi, rośnie z aktywnością agenta (bg-gl gridSpeed)', () => {
  const J = load({ state: { settings: { hermesOn: false } }, files: ['core.js', 'events.js', 'fx-director.js', 'bg-gl.js'] }), g = J.bgGl.gridSpeed;
  assert.equal(g(0, 3), .04); assert.equal(g(.06, 3), .04, 'spoczynek silnika (.06): tylko dryf'); assert.equal(g(.1, 3), .04);
  assert.ok(g(.95, 3) > 1.2 && g(.95, 3) > g(.95, 2) && g(.95, 2) > g(.4, 2) && g(.4, 2) > .04, 'monotonicznie z aktywnością, cinema szybciej');
  assert.ok(g(.06, 3) * 30 < g(.95, 3), 'proporcja spoczynek/praca > 30×');
});
test('deszcz danych: poziom z realnych znaków strumienia (engine.feed); bez strumienia 0 i wiązka pusta', () => {
  const J = load({ state: { settings: { hermesOn: false } } }), eg = J.engine;
  eg.sample(); assert.equal(eg.rain, 0, 'bez strumienia: pusto');
  for (let i = 0; i < 5; i++) { eg.feed(26); eg.sample(); } assert.ok(eg.rain > .6, 'strumień znaków podnosi poziom, jest ' + eg.rain);
  const hi = eg.rain; eg.feed(5); eg.sample(); assert.ok(eg.rain < hi, 'mały dopływ → spadek');
  for (let i = 0; i < 30; i++) eg.sample(); assert.equal(eg.rain, 0, 'po ustaniu strumienia deszcz wygasa do zera');
  assert.match(fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8'), /n = eg\.rain > 0 \? Math\.ceil\(RAIN\.length \* eg\.rain\) : 0/, 'orbDraw: liczba kropli z eg.rain');
});

test('spec 09 §7 „zdarzenie → efekt”: każdy wiersz ma emiter i odbiornik w kodzie (plik:linia=fragment, ±40 linii)', () => {
  const sp = fs.readFileSync(path.join(ROOT, 'docs', 'spec', '09-wyglad-stany.md'), 'utf8');
  const a = sp.indexOf('### Zdarzenie → efekt'), b = sp.indexOf('## 8. Dźwięki'); assert.ok(a > 0 && b > a);
  const rows = sp.slice(a, b).split('\n').filter(l => /^\| /.test(l) && !/^\| zdarzenie /.test(l));
  assert.ok(rows.length >= 27, 'tabela obejmuje efekty faz 2–5B, wierszy: ' + rows.length);
  for (const row of rows) {
    const cites = [...row.matchAll(/`(js\/[\w.-]+\.js):(\d+)=([^`]+)`/g)];
    assert.ok(cites.length >= 1, 'wiersz bez emitera/odbiornika: ' + row.slice(0, 80));
    for (const [, f, n, tok] of cites) {
      const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n'), at = lines.map((l, i) => l.includes(tok) ? i + 1 : 0).filter(Boolean);
      assert.ok(at.length, f + ' nie zawiera „' + tok + '”');
      assert.ok(at.some(i => Math.abs(i - +n) <= 40), f + ': „' + tok + '” jest w liniach ' + at.join(',') + ', a tabela wskazuje ' + n);
    }
  }
  /* efekty faz 5A są w tabeli */
  for (const k of ['kometa', 'aberracja', 'skan', 'pasy ostrzegawcze', 'NO LINK', 'segmentowy pierścień', 'deszcz danych']) assert.ok(sp.slice(a, b).includes(k), 'brak wiersza: ' + k);
});

test('fx-director: każdy efekt kinowy ma limit życia < 1 s, bramkę poziomu (cinema) i nie działa w prezentacji', () => {
  const t = setup(3), life = t.J.fxd.life;
  for (const k of ['ca', 'scan', 'tb', 'ok', 'err', 'warn']) assert.ok(life[k] > 0 && life[k] < 1000, k + ' < 1 s');
  assert.ok(life.ca >= 150 && life.ca <= 220, 'aberracja 150–220 ms');
  t.J.ev.emit('tool.failed', { tool: 'x' }); t.J.ev.emit('task.completed', { task_id: 'a' });
  const live = ['fx-ca', 'fx-tb'].filter(c => t.has(c)); assert.equal(live.length, 2);
  t.advance(999); assert.ok(!t.has('fx-ca') && !t.has('fx-tb') && !t.has('fx-scan'), 'po < 1 s wszystko zdjęte');
  const css = fs.readFileSync(path.join(ROOT, 'css', 'neon.css'), 'utf8'); assert.match(css, /\.fx-tb \.topbar:before/); assert.match(css, /forced-colors:active\)[^}]*\{#app:before/);
});
test('ai.js: model.failed niesie aborted/net, a fx-director pomija je przy aberracji', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'ai.js'), 'utf8');
  assert.match(src, /'model\.failed', \{ model: c\.model, error: e\.message, aborted: e\.name === 'AbortError', net: !!e\.net \}/);
});

test('calm (prezentacja | skupienie): zdarzenia nie odpalają aberracji, skanu, błysku paska ani iskier; poza calm te same zdarzenia działają', () => {
  for (const mode of ['present', 'focus']) {
    const t = setup(3); t.el.classList.add(mode); assert.ok(t.J.fxd.calm(), mode + ' → calm');
    t.J.ev.emit('task.failed', {}); t.J.ev.emit('tool.failed', {}); t.J.ev.emit('security.injection', {}); t.J.ev.emit('tool.started', {}); t.J.ev.emit('task.created', { task_id: 'q', title: 't' });
    t.J.ev.emit('task.completed', { task_id: 'q' });
    assert.ok(!t.has('fx-ca') && !t.has('fx-scan') && !t.has('fx-tb'), mode + ': bez klas kinowych'); assert.ok(!t.J.fxd.caAt && !t.J.fxd.sparkAt, mode + ': bez caAt/sparkAt');
    assert.equal(t.J.fxd.burst?.('ca', 3) ?? false, false);
  }
  const t = setup(3); assert.ok(!t.J.fxd.calm()); t.J.ev.emit('tool.failed', {}); t.J.ev.emit('tool.started', {}); assert.ok(t.has('fx-ca') && t.J.fxd.caAt > 0 && t.J.fxd.sparkAt > 0, 'poza calm działa');
});
test('calm: jedna bramka w core.js (klasa holo, duch), main.js (komety, pierścień planu) i CSS (zamknięcie okna, dioda zadania w prezentacji)', () => {
  const core = fs.readFileSync(path.join(ROOT, 'js', 'core.js'), 'utf8'), main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8'), css = fs.readFileSync(path.join(ROOT, 'css', 'neon.css'), 'utf8');
  assert.match(core, />= 3 && !J\.fxd\?\.calm\?\.\(\) \? 'window holo'/); assert.match(main, /!J\.booted \|\| J\.fxd\?\.calm\?\.\(\)\) return; const el = J\.wm\.ctx/);
  assert.match(main, /const ps = J\.fx\.rank\(\) >= 3 && !J\.fxd\?\.calm\?\.\(\) && busy/);
  assert.match(css, /#app\[data-fx=cinema\]:not\(\.present\):not\(\.focus\) \.window\.closing\{animation:winHoloOut/);
  assert.match(css, /#app\.present \.dock\[data-task\] button\[data-app=schedule\]:before\{opacity:0;animation:none\}/);
  assert.match(main, /J\.uiMode\?\.get\(\) === 'present' \? undefined : kind/, 'toast w prezentacji bez data-k');
});
