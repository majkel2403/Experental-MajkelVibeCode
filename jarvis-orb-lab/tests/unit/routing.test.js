'use strict';
/* Zbiór typowych poleceń użytkownika → decyzja silnika lokalnego (J.brain.localPlan) i szybkiej ścieżki (J.flow.parserSure).
   Pilnuje, żeby nowa zmiana nie zepsuła starych zdań i żeby NIGDY nie było „pół zadania” (np. „otwórz youtube i puść X” →
   tylko strona główna). Nowe zdanie, które zadziałało źle (raport „co się nie udało”), dopisz tutaj z oczekiwanym wynikiem.
     'id'          jedno polecenie obejmujące całe zdanie
     'a+b'         łańcuch poleceń (każda część rozpoznana)
     'partial'     rozpoznana tylko część → odmowa, nic nie jest wykonywane
     'none'        nic lokalnie → rozmowa / Jev / Hermes */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, refShort } = require('../harness.js');

const CORPUS = {
  // okna, notatki, zadania, czas
  'otwórz notatnik': 'open_app',
  'otwórz ustawienia': 'open_app',
  'zamknij notatnik': 'close_app',
  'zamknij wszystkie okna': 'close_app',
  'zanotuj kupić mleko i chleb': 'create_note',
  'dodaj zadanie zadzwonić do mamy jutro': 'add_task',
  'dodaj zadanie zadzwonić do mamy i taty': 'add_task',
  'przypomnij mi o 18 żeby wyjść z psem': 'add_task',
  'ustaw minutnik 10 minut': 'start_timer',
  'ustaw minutnik na 5 minut i otwórz notatki': 'start_timer+open_app',
  'otwórz kalkulator i policz 2+2': 'open_app+calculate',
  'która godzina': 'get_datetime',
  'jaki dziś dzień': 'get_datetime',
  'cofnij': 'undo',
  // dane
  'jaka jest pogoda': 'get_weather',
  'pogoda w Krakowie': 'get_weather',
  'ile to 12*7': 'calculate',
  'oblicz 15% z 200': 'calculate',
  'kurs bitcoina': 'get_crypto_prices',
  'powiadom gdy btc przekroczy 100k': 'market_watch',
  'zapamiętaj że lubię kawę': 'memory_remember',
  // wygląd
  'zmień motyw na zielony': 'set_theme',
  'tryb skupienia': 'focus_mode',
  'włącz dźwięk': 'sound_toggle',
  // strony i wyszukiwanie w zwykłej przeglądarce
  'otwórz youtube': 'open_url',
  'wejdź na onet.pl': 'open_url',
  'wyszukaj przepis na pierogi': 'web_search',
  'otwórz google i wyszukaj pogodę w Gdańsku': 'open_url+web_search',
  // muzyka (agent WWW)
  'otwórz youtube i puść Małomiasteczkowy': 'media_play',
  'otwórz youtube i puść piosenkę Dawid Podsiadło Małomiasteczkowy': 'media_play',
  'puść Queen': 'media_play',
  'włącz piosenkę Szampan na youtube': 'media_play',
  'zatrzymaj muzykę': 'media_control',
  'następna piosenka': 'media_control',
  'co teraz gra': 'media_control',
  // agenci: jawne prefiksy
  'w przeglądarce kliknij pierwszy wynik': 'web_command',
  'w przeglądarce przeczytaj stronę': 'web_read',
  'w internecie znajdź najtańszy lot do Rzymu': 'web_task',
  'w internecie sprawdź godziny otwarcia Biedronki i podaj je': 'web_task',
  'znajdź w internecie godziny otwarcia Muzeum Narodowego w Krakowie w poniedziałek': 'web_task',
  'sprawdź w internecie, ile kosztuje bilet do kina': 'web_task',
  'wygoogluj przepis na pierogi': 'web_search',
  'otwórz notatnik i zanotuj że jutro dentysta o 10': 'open_app+create_note',
  'na komputerze otwórz kalkulator': 'computer_use',
  'zatrzymaj komputer': 'computer_stop',
  'status agentów': 'agents_status',
  // raporty
  'co się nie udało': 'task_report',
  'raport porażek': 'task_report',
  'pomoc': 'help',
  'status': 'get_status',
  // nigdy pół zadania
  'otwórz youtube i znajdź przepis na pierogi': 'none',
  'zanotuj coś i wyślij to szefowi mailem': 'partial',
  'ustaw minutnik 5 minut i zamów pizzę': 'partial',
  // Hermes / rozmowa
  'wyślij maila do szefa': 'none',
  'zamów pizzę': 'none',
  'napisz wiersz o jesieni': 'none',
  'kim jesteś': 'none'
};

const describe = p => p.kind === 'exec' ? p.m.id : p.kind === 'chain' ? p.chain.map(c => c.id).join('+') : p.kind;

test('korpus zdań: decyzja silnika lokalnego dla każdego typowego polecenia', () => {
  const J = load({ state: { settings: { hermesOn: false } } });
  const bad = [];
  for (const [s, want] of Object.entries(CORPUS)) { const got = describe(J.brain.localPlan(s)); if (got !== want) bad.push(`„${s}”: oczekiwano ${want}, jest ${got}`); }
  assert.deepEqual(bad, [], '\n' + bad.join('\n'));
});

const withChat = () => {
  const J = load({ dom: true, state: { settings: { hermesOn: false, jevOn: false, sound: false, speech: false } } });
  J.__ctx.setTimeout = refShort;
  return J;
};

test('pół zadania: odmowa nic nie wykonuje i mówi, czego brakuje', async () => {
  const J = withChat();
  const runs = [];
  const orig = J.registry.run;
  J.registry.run = async (id, a, c) => { runs.push(id); return orig(id, a, c); };
  await J.brain.handle('ustaw minutnik 5 minut i zamów pizzę');
  assert.deepEqual(runs, [], 'żadne polecenie nie zostało wykonane');
  const e = J.tasklog.list().at(-1);
  assert.equal(e.partial, true); assert.equal(e.fail, 'pół zadania (odmowa)'); assert.match(e.reply, /Nie robię połowy zadania/); assert.match(e.reply, /zamow pizze|zamów pizzę/);
});

test('szybka ścieżka (bez Jeva) tylko dla zdań objętych w całości', () => {
  const J = load({ state: { settings: { hermesOn: false } } });
  const sure = s => J.flow.parserSure(s, J.registry.match(s)[0]);
  assert.equal(sure('otwórz youtube i puść Małomiasteczkowy'), true);
  assert.equal(sure('otwórz notatnik'), true);
  assert.equal(sure('ustaw minutnik na 5 minut i otwórz notatki'), false, 'łańcuch → Jev/silnik lokalny, nie pół zadania');
});

test('dziennik zadań: droga, wynik i porażki trafiają do raportu', async () => {
  const J = withChat();
  await J.brain.handle('która godzina');
  await J.brain.handle('napisz wiersz o jesieni');
  const l = J.tasklog.list();
  assert.equal(l.length, 2);
  assert.equal(l[0].fail, null); assert.ok(['fast', 'local'].includes(l[0].route), l[0].route);
  assert.equal(l[1].fail, 'nierozpoznane');
  const r = await J.registry.run('task_report', {}, { source: 'local' });
  assert.equal(r.ok, true); assert.match(r.text, /1 z 2 zadań się nie udało/); assert.match(r.text, /nierozpoznane: 1/);
});

test('łańcuch znanych poleceń przy włączonym Hermesie: wykonany lokalnie, bez zapytania do modelu', async () => {
  const hits = [];
  const fetch = async (url) => { hits.push(url); return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message: { content: 'x' } }], data: [] }) }; };
  const J = load({ dom: true, fetch, state: { settings: { hermesOn: true, hermesProvider: 'desktop', hermesUrl: 'http://localhost:8643/v1', hermesKey: 'k', hermesModel: 'jarvis-desktop', jevOn: false, sound: false, speech: false } } });
  J.__ctx.setTimeout = refShort;
  await J.brain.handle('otwórz notatnik i zanotuj że jutro dentysta o 10');
  const e = J.tasklog.list().at(-1);
  assert.equal(e.route, 'chain', JSON.stringify(e));
  assert.deepEqual(e.tools.map(t => t.name), ['open_app', 'create_note']);
  assert.ok(!hits.some(u => /chat\/completions/.test(u)), 'bez zapytania do Hermesa');
  assert.ok(J.state.notes.some(n => /dentysta o 10/.test(n.content || n.text || n.title || '')), 'notatka zapisana');
});