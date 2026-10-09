/* Szybka ścieżka (J.flow) i integracja z brain.handle na atrapie Jeva: parser → Jev → dopytanie → wykonanie → cofanie. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, refShort } = require('../harness.js');
const { makeJev } = require('../jevmock.js');
const wait = ms => new Promise(r => setTimeout(r, ms));

/* asks: kolejne odpowiedzi na pytania Jarvisa (J.ask); confirms: odpowiedzi na potwierdzenia (J.confirm) */
const setup = async (rules, settings = {}, mockOpts = {}) => {
  const mock = makeJev(rules, mockOpts);
  const J = load({ dom: true, fetch: mock.fetch, state: { settings: { hermesOn: false, jevOn: true, jevKey: 'k', sound: false, speech: false, ...settings } } });
  J.__ctx.setTimeout = refShort;   // zwykłe liczniki (harness robi je „nieblokującymi”, a kod czeka chwilę przed odpowiedzią lokalną)
  const st = { asks: [], asked: [], confirms: [], confirmed: [] };
  J.ask = Object.assign(async (q, items) => { st.asked.push({ q, items }); const a = st.asks.shift(); return typeof a === 'function' ? a(items) : a; }, { pending: false });
  J.confirm = async req => { st.confirmed.push(req.question); return st.confirms.shift() ?? 'no'; };
  const seen = []; const add = J.chat.add; J.chat.add = (role, text, silent) => { const h = add(role, text, silent); seen.push({ role, h }); return h; };
  const offers = []; J.on('undo-offer', o => offers.push(o));
  await wait(30);
  const say = async (t, o) => { await J.brain.handle(t, o); return seen.filter(x => x.role === 'jarvis').map(x => x.h.text).pop(); };
  return { J, mock, st, say, offers, logOf: () => J.judge.log.all().pop() };
};

test('parser pewny + odczyt/nawigacja → bez Jeva i bez Hermesa (szybka ścieżka)', async () => {
  const { J, mock, say, logOf } = await setup([]);
  const r = await say('otwórz notatnik');
  assert.match(r, /Otwarto: Notatnik/); assert.equal(mock.calls.length, 0, 'Jev nie był wołany');
  assert.equal(logOf().outcome, 'fast');
});
test('parser pewny, ale ZAPIS → nie omija Jeva (pułapka: „przypomnij mi jak się nazywa stolica Francji”)', async () => {
  const { J, mock, say } = await setup([{ re: /stolica/, intent: 'conversation', conf: .9 }]);
  const r = await say('przypomnij mi jak się nazywa stolica Francji');
  assert.equal(mock.calls.length, 1, 'Jev oceniał zdanie');
  assert.equal(J.state.tasks.length, 0, 'zadanie NIE zostało utworzone'); assert.match(r, /pytanie do rozmowy/);
});
test('Jev-only, wartość z listy (D8): „pokaż mi te zapiski” → Notatnik bez Hermesa', async () => {
  const { J, mock, say } = await setup([{ re: /zapiski/, intent: 'open_app', conf: .95, slots: { app: 'notes' } }]);
  const r = await say('pokaż mi te zapiski');
  assert.match(r, /Otwarto: Notatnik/); assert.equal(mock.calls.length, 2, 'decyzja + wartość z listy'); assert.ok(Object.keys(mock.calls[1].body.questions).includes('slot_app'));
  assert.deepEqual(Object.keys(mock.calls[1].body.state), ['utterance'], 'wartości z listy widzą tylko zdanie (poziom P0)');
});
test('średnia pewność → „Chodzi o…?”; Tak → wybór wartości z chipów → wykonanie', async () => {
  const { J, st, say, logOf } = await setup([{ re: /cos w wygladzie/, intent: 'set_theme', conf: .6, alts: { set_wallpaper: .3 } }]);
  st.asks.push('yes', 'fiolet');
  const r2 = await say('zrób coś w wyglądzie');
  assert.match(st.asked[0].q, /Chodzi o: Motyw kolorystyczny\?/); assert.ok(st.asked[0].items.some(i => i.value === 'alt:set_wallpaper'));
  assert.match(st.asked[1].q, /Jaki kolor/); assert.match(r2, /Motyw: fiolet/);
  assert.equal(logOf().outcome, 'asked_yes');
});
test('„Nie” → odrzucenie zapamiętane; dwa odrzucenia podnoszą próg polecenia (uczenie się)', async () => {
  const { J, st, say } = await setup([{ re: /cos ladnego/, intent: 'set_theme', conf: .6 }]);
  const base = J.policy.thresholds('set_theme').a3;
  st.asks.push('no', 'no');
  await say('zrób cos ladnego'); await say('zrób cos ladnego jeszcze raz cos ladnego');
  assert.equal(J.policy.adaptInfo()[0].rejections24h, 2); assert.ok(J.policy.thresholds('set_theme').a3 > base, 'próg wzrósł: ' + base + ' → ' + J.policy.thresholds('set_theme').a3);
  J.policy.resetAdapt(); assert.equal(J.policy.thresholds('set_theme').a3, base);
});
test('zapis odwracalny (A2): wykonanie + „Cofnij”; polecenie „cofnij” cofa', async () => {
  const { J, say, offers } = await setup([{ re: /mleko/, intent: 'add_task', conf: .97 }]);
  const r = await say('przypomnij mi kupić mleko o 18:00');
  assert.match(r, /Dodałem/); assert.equal(J.state.tasks.length, 1); assert.equal(offers.length, 1, 'pokazano przycisk Cofnij');
  const u = await say('cofnij'); assert.match(u, /Cofnięto/); assert.equal(J.state.tasks.length, 0);
  assert.match(await say('cofnij'), /nic do cofnięcia|Nie mam/i);
});
test('zapis Jev-only z brakującym tekstem → Jarvis dopytuje (slot-ask), potem wykonuje z „Cofnij”', async () => {
  const { J, st, say, offers } = await setup([{ re: /cos na jutro/, intent: 'add_task', conf: .97 }]);
  st.asks.push('kupić chleb');
  const r = await say('dodaj cos na jutro');
  assert.match(st.asked[0].q, /Co mam zapisać/); assert.match(r, /kupić chleb/); assert.equal(J.state.tasks[0].text, 'kupić chleb'); assert.equal(offers.length, 1);
});
test('brak odpowiedzi/anulowanie przy dopytaniu → nic nie zapisano', async () => {
  const { J, st, say } = await setup([{ re: /cos na jutro/, intent: 'add_task', conf: .97 }]);
  st.asks.push('anuluj'); const r = await say('dodaj cos na jutro');
  assert.match(r, /Anulowano/); assert.equal(J.state.tasks.length, 0);
});
test('L1: odczyt schowka wybrany TYLKO przez Jeva wymaga zgody (i bez zgody nie czyta)', async () => {
  const { J, st, say } = await setup([{ re: /wklej to/, intent: 'clipboard_read', conf: .96 }]);
  let read = 0; J.__ctx.navigator.clipboard.readText = async () => { read++; return 'hasło do banku'; };
  st.confirms.push('no'); const r1 = await say('wklej to');
  assert.equal(read, 0, 'schowek nie został odczytany'); assert.match(r1, /odmówił/); assert.equal(st.confirmed.length, 1);
  st.confirms.push('yes'); await say('wklej to'); assert.equal(read, 1);
});
test('nieodwracalne: wpisane ręcznie + zgodny parser → jak dotąd bez pytania; głosem → pytanie', async () => {
  const { J, st, say } = await setup([{ re: /usun notatke/, intent: 'notes_delete', conf: .95 }]);
  J.notes.add('Alfa', 'x'); J.notes.add('Beta', 'y');
  await say('usuń notatkę Alfa'); assert.equal(st.confirmed.length, 0); assert.ok(!J.notes.live().some(n => n.title === 'Alfa'));
  st.confirms.push('no'); const r = await say('usuń notatkę Beta', { voice: true, source: 'voice' });
  assert.equal(st.confirmed.length, 1); assert.match(r, /odmówił/); assert.ok(J.state.notes.some(n => n.title === 'Beta'));
});
test('D4 „to/tu”: „usuń tę notatkę” podstawia aktywną notatkę i pyta o zgodę z tytułem', async () => {
  const { J, st, say } = await setup([{ re: /te notatke/, intent: 'notes_delete', conf: .95, current: .92 }]);
  const n = J.notes.add('Zakupy', 'mleko'); J.wm.open('notes', n.id);
  st.confirms.push('yes'); await say('usuń tę notatkę');
  assert.match(st.confirmed[0], /Zakupy/, 'pytanie pokazuje tytuł, nie id'); assert.ok(!J.notes.live().some(x => x.id === n.id));
});
test('niejednoznaczny cel → chipy z kandydatami zamiast błędu AMBIGUOUS', async () => {
  const { J, st, say } = await setup([{ re: /dopisz/, intent: 'notes_append', conf: .95 }]);
  J.notes.add('Zakupy spożywcze', ''); J.notes.add('Zakupy weekend', '');
  const before = J.state.notes.map(n => n.body).join('|');
  st.asks.push(items => items.find(i => /weekend/.test(i.label)).value);
  const r = await say('dopisz do notatki zaku: chleb');
  assert.match(st.asked[0].q, /Które z nich/); assert.equal(J.state.notes.find(n => n.title === 'Zakupy weekend').body, 'chleb');
});
test('niejasne zdanie z alternatywami → pytanie o dwie najlepsze opcje', async () => {
  const { st, say } = await setup([{ re: /cos z oknami/, intent: 'unclear', conf: .5, alts: { wm_arrange: .35, wm_minimize: .3 } }]);
  st.asks.push('no'); await say('cos z oknami');
  assert.match(st.asked[0].q, /Nie jestem pewien/); assert.equal(st.asked[0].items.filter(i => i.value.startsWith('alt:')).length, 2);
});
test('cofnięcie rozpoznane jako akt dialogowy „cancel” (D16)', async () => {
  const { J, say } = await setup([{ re: /mleko/, intent: 'add_task', conf: .97 }, { re: /jednak nie/, intent: 'conversation', conf: .9, act: 'cancel', actConf: .9 }]);
  await say('przypomnij mi kupić mleko o 18:00'); assert.equal(J.state.tasks.length, 1);
  const r = await say('jednak nie'); assert.match(r, /Cofnięto/); assert.equal(J.state.tasks.length, 0);
});
test('tryb cienia: Jev tylko liczy i zapisuje; działa parser/Hermes jak dotąd', async () => {
  const { J, mock, say, logOf } = await setup([{ re: /otworz notatnik/, intent: 'open_app', conf: .95, slots: { app: 'notes' } }], { jevShadow: true });
  const r = await say('otwórz notatnik');
  assert.match(r, /Otwarto: Notatnik/); assert.equal(mock.calls.length, 1, 'szybka ścieżka wyłączona, Jev policzył raz');
  assert.equal(logOf().actual.local, 'open_app'); assert.equal(logOf().outcome, 'local');
});
test('tryb „zawsze pytaj”: Jev nie wykonuje niczego sam', async () => {
  const { st, say } = await setup([{ re: /te zapiski/, intent: 'open_app', conf: .97, slots: { app: 'notes' } }], { jevAutonomy: 'ask' });
  st.asks.push('no'); await say('pokaż te zapiski');
  assert.match(st.asked[0].q, /Chodzi o: Otwórz aplikację\?/);
});
test('Jev niedostępny → polecenia działają jak dotąd (parser), bez czekania', async () => {
  const { J, mock, say } = await setup([], {}, { fail: 'network' });
  const t0 = Date.now(); const r = await say('minutnik 2 minuty');
  /* błąd sieci jest natychmiastowy; próg 1,2 s ODRÓŻNIA brak czekania od odczekania limitu Jeva (1,5 s) —
     poprzedni próg 1,5 s nie odróżniał niczego */
  assert.match(r, /Minutnik ustawiony/); assert.ok(Date.now() - t0 < 1200, 'bez czekania na limit Jeva: ' + (Date.now() - t0) + ' ms'); J.timer.stop();
});
