/* Sonda Jeva (OpenRouter /systemone): mierzy trafność intencji na zbiorze ≥ 400 polskich zdań, krzywą zaufania i koszt; pisze raport.
   Użycie:
     OPENROUTER_API_KEY=sk-or-... node tests/jev-probe.js [liczba_zdań]     pomiar (raport w tests/reports/)
     ... node tests/jev-probe.js --e1        eksperyment E1: dwa etapy (grupa → polecenie) zamiast płaskiego wyboru
     ... node tests/jev-probe.js --e3        eksperyment E3: bez stanu pulpitu (P0) zamiast z kontekstem (P1)
     ... node tests/jev-probe.js --contract  test kontraktowy: jedno wywołanie, sprawdza kształt odpowiedzi (kod wyjścia ≠ 0 przy zmianie formatu)
     JEV_MOCK=1 node tests/jev-probe.js      tryb bez sieci (atrapa) — sprawdza sam skrypt; wyniki NIE mówią nic o prawdziwym Jevie
   E2 (opisy po angielsku vs po polsku) wymaga angielskich opisów poleceń — jeszcze ich nie mamy.
   Klucza nie zapisujemy nigdzie. Koszt całego zbioru: ok. 0,05 USD (tokeny wyjściowe Jeva są darmowe). */
'use strict';
const fs = require('fs'), path = require('path');
const MOCK = !!process.env.JEV_MOCK;
const KEY = process.env.OPENROUTER_API_KEY || process.env.JEV_KEY || (MOCK ? 'mock' : '');
if (!KEY) { console.error('Brak klucza: ustaw OPENROUTER_API_KEY=sk-or-... (albo JEV_MOCK=1 do próby bez sieci)'); process.exit(2); }
const MODEL = process.env.JEV_MODEL || 'typesafe/jev-1.13';
const URL_ = process.env.JEV_URL || 'https://openrouter.ai/api/v1/systemone';
const args = process.argv.slice(2), flag = f => args.includes(f), num = args.find(a => /^\d+$/.test(a));
const { load } = require('./harness.js');
const J = load({ state: { settings: { hermesOn: false } } });
const CORPUS = require('./fixtures/corpus.js'), OLD = require('./fixtures/utterances.js');
const ALL = [...CORPUS, ...OLD.map(([t, id]) => [t, id, 'stary'])].filter((x, i, a) => a.findIndex(y => y[0] === x[0]) === i);

let doFetch = fetch;
if (MOCK) {   // atrapa: powtarza dokładnie oczekiwaną intencję z pewnością 0,9 — tylko do sprawdzenia skryptu
  const { makeJev } = require('./jevmock.js');
  const rules = ALL.map(([t, id]) => ({ re: new RegExp('^' + t.toLowerCase().replace(/[ąćęłńóśźż]/g, c => ({ ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' })[c]).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'), intent: id, conf: .9 }));
  doFetch = makeJev(rules).fetch;
}

const intent = J.judge.intentQuestion();
const STATE = { time: '2026-05-04 10:00', weekday: 'Monday', focused_app: { app: 'notes', title: 'Notatnik' }, open_windows: ['notes', 'schedule'], tasks_today: ['09:00 Spotkanie zespołu', '18:00 trening'], timer: null };
const ask = async (utterance, questions = { intent }, state = STATE) => {
  const t0 = Date.now();
  const r = await doFetch(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY, 'HTTP-Referer': 'https://github.com/majkel2403/Jarvis-', 'X-Title': 'Jarvis OS probe' }, body: JSON.stringify({ model: MODEL, questions, state: { ...state, utterance } }) });
  let j; try { j = await r.json(); } catch (e) { j = { raw: 'nieczytelna odpowiedź' }; }
  return { ok: r.ok, status: r.status, ms: Date.now() - t0, body: j };
};

/* ---------- test kontraktowy ---------- */
const contract = async () => {
  const r = await ask('otwórz notatnik i ustaw minutnik na 5 minut', { intent, destructive: { type: 'noul', instructions: 'Would the utterance delete user data?', criteria: { true: 'yes', false: 'no' } } });
  const problems = [], a = r.body?.answers || {};
  if (!r.ok) problems.push('HTTP ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 200));
  else {
    const i = a.intent; if (!i || i.type !== 'choice' || typeof i.choice !== 'string') problems.push('intent: brak pola choice');
    else { if (!Object.keys(intent.criteria).includes(i.choice)) problems.push('intent: wybór spoza listy: ' + i.choice); if (typeof i.confidence !== 'number' || i.confidence < 0 || i.confidence > 1) problems.push('intent: confidence poza 0–1'); if (i.probabilities && typeof i.probabilities !== 'object') problems.push('intent: probabilities nie jest obiektem'); }
    const d = a.destructive; if (!d || d.type !== 'noul' || typeof d.noul !== 'number' || d.noul < 0 || d.noul > 1) problems.push('noul: brak liczby 0–1');
    if (!r.body.usage || typeof r.body.usage !== 'object') problems.push('brak pola usage');
  }
  console.log(problems.length ? 'KONTRAKT ZŁAMANY:\n  ' + problems.join('\n  ') : 'Kontrakt zgodny (' + r.ms + ' ms, model ' + (r.body.model || '?') + ').');
  process.exit(problems.length ? 1 : 0);
};

/* ---------- E1: dwa etapy ---------- */
const GROUPS = { windows: ['open_app', 'close_app', 'wm_list', 'wm_focus', 'wm_minimize', 'wm_arrange', 'wm_move', 'nav_back', 'layout_save', 'settings_open'], notes: ['notes_list', 'notes_read', 'notes_search', 'create_note', 'notes_append', 'notes_update', 'notes_delete'], tasks: ['tasks_list', 'add_task', 'tasks_complete', 'tasks_update', 'tasks_remove', 'schedule_day', 'start_timer', 'timer_control', 'get_datetime'], desktop: ['create_widget', 'widgets_list', 'widgets_update', 'widgets_remove', 'add_shortcut', 'shortcut_remove', 'focus_mode', 'ui_highlight', 'ui_narrate', 'ui_toast', 'ui_ask', 'notifications_open'], data: ['get_weather', 'get_crypto_prices', 'market_watch', 'calculate', 'open_url', 'web_search', 'clipboard_write', 'clipboard_read', 'get_status'], interface: ['set_theme', 'set_wallpaper', 'sound_toggle', 'settings_get', 'settings_set', 'speak'], memory: ['memory_remember', 'memory_recall', 'memory_forget'], files: ['files_list', 'files_read', 'files_write', 'files_export_note', 'terminal_run'], talk: ['conversation', 'multi_step', 'unclear'] };
const groupOf = id => Object.keys(GROUPS).find(g => GROUPS[g].includes(id));
const twoStage = async text => {
  const gq = { type: 'choice', instructions: intent.instructions.replace('which single command', 'which group of commands'), criteria: Object.fromEntries(Object.keys(GROUPS).map(g => [g, g + ': ' + GROUPS[g].slice(0, 5).join(', ')])) };
  const g = await ask(text, { intent: gq }); const gc = g.body?.answers?.intent; if (!gc) return { ok: false, ms: g.ms };
  const sub = { ...intent, criteria: Object.fromEntries(Object.entries(intent.criteria).filter(([k]) => GROUPS[gc.choice]?.includes(k))) };
  if (!Object.keys(sub.criteria).length) return { ok: false, ms: g.ms };
  const r = await ask(text, { intent: sub }); const a = r.body?.answers?.intent; return { ok: !!a, choice: a?.choice, confidence: (a?.confidence || 0) * (gc.confidence || 0), ms: g.ms + r.ms, cost: +(g.body?.usage?.cost || 0) + +(r.body?.usage?.cost || 0) };
};

const bins = [[0, .5], [.5, .6], [.6, .7], [.7, .8], [.8, .9], [.9, .95], [.95, 1.01]];
(async () => {
  if (flag('--contract')) return contract();
  const mode = flag('--e1') ? 'E1 (dwa etapy)' : flag('--e3') ? 'E3 (bez stanu pulpitu)' : 'E0 (płaski wybór, z kontekstem P1)';
  console.log('Model:', MODEL, '· tryb:', mode, '· zbiór:', ALL.length, 'zdań', MOCK ? '· ATRAPA (bez sieci)' : '');
  const first = await ask('otwórz notatnik i ustaw minutnik na 5 minut');
  if (!first.ok) { console.error('Jev NIE działa: HTTP', first.status, JSON.stringify(first.body).slice(0, 600)); process.exit(1); }
  console.log('Jev działa ·', first.ms, 'ms · model:', first.body.model, '· usage:', JSON.stringify(first.body.usage));
  const n = Math.min(+num || ALL.length, ALL.length), rows = []; let cost = 0, msSum = 0;
  for (const [text, expected, cat] of ALL.slice(0, n)) {
    let choice, conf, ms, c = 0;
    if (flag('--e1')) { const r = await twoStage(text); if (!r.ok) { rows.push({ text, expected, cat, err: true }); continue; } ({ choice, confidence: conf, ms, cost: c } = r); }
    else { const r = await ask(text, { intent }, flag('--e3') ? { utterance: undefined } : STATE); if (!r.ok) { rows.push({ text, expected, cat, err: true }); continue; } const a = r.body.answers?.intent || {}; choice = a.choice; conf = a.confidence || 0; ms = r.ms; c = +(r.body.usage?.cost || 0); }
    cost += c; msSum += ms; rows.push({ text, expected, cat, choice, conf, ok: choice === expected });
    process.stdout.write(choice === expected ? '.' : 'x');
  }
  const good = rows.filter(r => !r.err), acc = good.filter(r => r.ok).length / good.length;
  /* trafność na kategorię */
  const cats = {}; good.forEach(r => { const c = cats[r.cat] = cats[r.cat] || { n: 0, ok: 0 }; c.n++; if (r.ok) c.ok++; });
  /* krzywa zaufania */
  const curve = bins.map(([a, b]) => { const l = good.filter(r => r.conf >= a && r.conf < b); return { range: a.toFixed(2) + '–' + Math.min(b, 1).toFixed(2), n: l.length, acc: l.length ? l.filter(r => r.ok).length / l.length : null }; });
  /* najniższy próg, od którego trafność wyborów ≥ 99% (dla A3) i ≥ 99,5% (dla A2), tylko dla poleceń (bez rozmowy) */
  const cmdRows = good.filter(r => !['conversation', 'multi_step', 'unclear'].includes(r.choice));
  const thresholdFor = target => { for (let t = .5; t <= 1.0001; t += .01) { const l = cmdRows.filter(r => r.conf >= t); if (l.length >= 10 && l.filter(r => r.ok).length / l.length >= target) return +t.toFixed(2); } return null; };
  const t99 = thresholdFor(.99), t995 = thresholdFor(.995);
  const wrongSure = cmdRows.filter(r => !r.ok && r.conf >= .85);
  const lines = [];
  lines.push(`# Raport sondy Jeva — ${new Date().toISOString().slice(0, 10)}`, '', MOCK ? '> **To jest próba na atrapie — liczby nic nie mówią o prawdziwym Jevie.**\n' : '', `- Model: \`${MODEL}\`, tryb: **${mode}**, zdań: ${good.length}/${n} (błędy zapytań: ${rows.length - good.length})`, `- Trafność intencji: **${Math.round(acc * 1000) / 10}%** (cel planu: ≥ 92%)`, `- Średni czas: ${Math.round(msSum / (good.length || 1))} ms · koszt: $${cost.toFixed(5)}`, `- Najniższy próg z trafnością ≥ 99% (A3): **${t99 ?? 'brak (za mało danych albo za niska trafność)'}** · ≥ 99,5% (A2): **${t995 ?? 'brak'}**`, `- Pomyłki przy pewności ≥ 0,85: **${wrongSure.length}**`, '', '## Trafność wg kategorii', '', '| kategoria | zdań | trafnych | % |', '|---|---|---|---|', ...Object.entries(cats).map(([k, v]) => `| ${k} | ${v.n} | ${v.ok} | ${Math.round(v.ok / v.n * 100)}% |`), '', '## Krzywa zaufania', '', '| pewność | zdań | trafność |', '|---|---|---|', ...curve.map(c => `| ${c.range} | ${c.n} | ${c.acc == null ? '—' : Math.round(c.acc * 1000) / 10 + '%'} |`), '', '## Pomyłki', '', ...good.filter(r => !r.ok).slice(0, 80).map(r => `- „${r.text}” → ${r.choice} ${Math.round(r.conf * 100)}% (oczekiwano ${r.expected}, ${r.cat})`));
  const dir = path.join(__dirname, 'reports'); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'jev-probe-' + (MOCK ? 'mock' : flag('--e1') ? 'e1' : flag('--e3') ? 'e3' : 'e0') + '.md'); fs.writeFileSync(file, lines.join('\n') + '\n');
  console.log('\n' + lines.slice(2, 9).join('\n') + '\nRaport: ' + path.relative(process.cwd(), file));
  console.log(wrongSure.length ? 'UWAGA: przy pewności ≥ 0,85 zdarzają się pomyłki — nie wykonuj tych poleceń bez pytania (patrz raport).' : 'Przy pewności ≥ 0,85 brak pomyłek na tym zbiorze.');
})().catch(e => { console.error('Błąd sondy:', e.message); process.exit(1); });
