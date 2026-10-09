/* Generator katalogów specyfikacji z kodu (jedno źródło prawdy):
     docs/spec/katalog-polecen.md + .json   — wszystkie polecenia rejestru: argumenty, ryzyko, poziom autonomii, cofanie, przykłady
     docs/spec/katalog-ustawien.md          — wszystkie klucze ustawień z wartościami domyślnymi
     docs/spec/katalog-zdarzen.md           — zdarzenia (J.emit / J.ev.emit) i miejsca, gdzie powstają
   Uruchomienie: node tools/gen-spec.js        (zapisuje pliki)
                 node tools/gen-spec.js --check (kod wyjścia 1, jeśli pliki są nieaktualne — używa test) */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'docs', 'spec');
const { load } = require(path.join(ROOT, 'tests', 'harness.js'));
const J = load({ state: { settings: { hermesOn: false } } });
const R = J.registry, P = J.policy;

const LEVEL_TXT = { A3: 'A3 sam, po cichu', A2: 'A2 sam + Cofnij', A1: 'A1 pyta „Chodzi o…?”', A0: 'A0 zawsze zgoda' };
const argTxt = a => {
  const props = a?.properties || {}, req = new Set(a?.required || []);
  const l = Object.entries(props).map(([k, v]) => {
    let t = v.type || 'any'; if (v.enum) t = v.enum.slice(0, 12).join('|') + (v.enum.length > 12 ? '|…' : ''); if (v.format) t += ' (' + v.format + ')';
    if (v.type === 'array') t = (v.items?.type || 'any') + '[]';
    return (req.has(k) ? '**' + k + '**' : k) + ': ' + t;
  });
  return l.length ? l.join('; ') : '—';
};
const esc = s => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

/* ---------- polecenia ---------- */
const cmds = R.list().map(c => ({
  id: c.id, group: c.group, label: c.label, description: c.description.replace(/\s+/g, ' '),
  args: c.args || { type: 'object', properties: {} }, required: c.args?.required || [],
  risk: c.risk, level: P.level(c), levelDependsOnArgs: ['settings_set', 'terminal_run', 'close_app'].includes(c.id),
  undoable: !!c.undoable, external: !!c.external, idempotent: !!c.idempotent, writes: c.writes || [],
  hermes: c.hermes !== false, examples: (c.examples || []).slice(0, 6), needsConfirmText: !!c.confirmText
}));
const groups = [...new Set(cmds.map(c => c.group))];
let md = '# Katalog poleceń (wygenerowany z kodu)\n\n> Plik generuje `node tools/gen-spec.js` z `js/commands.js` i `js/jev-policy.js`. **Nie edytuj ręcznie** — test `tests/unit/spec.test.js` sprawdza, czy jest aktualny.\n\n';
md += `Poleceń: **${cmds.length}** · odwracalnych: ${cmds.filter(c => c.undoable).length} · wymagających zgody (ryzyko ≠ safe): ${cmds.filter(c => c.risk !== 'safe').length} · treść z zewnątrz (sprawdzana pod kątem wstrzyknięć): ${cmds.filter(c => c.external).length}\n\n`;
md += 'Poziomy autonomii (plan Jeva): ' + Object.values(LEVEL_TXT).join(' · ') + '. Pogrubione argumenty są wymagane.\n\n';
md += '| poziom | liczba |\n|---|---|\n' + ['A3', 'A2', 'A1', 'A0'].map(l => `| ${LEVEL_TXT[l]} | ${cmds.filter(c => c.level === l).length} |`).join('\n') + '\n\n';
for (const g of groups) {
  md += `## ${g}\n\n| id | co robi | argumenty | ryzyko | poziom | cofanie | przykłady PL |\n|---|---|---|---|---|---|---|\n`;
  for (const c of cmds.filter(x => x.group === g)) md += `| \`${c.id}\` | ${esc(c.label)} — ${esc(c.description.slice(0, 160))} | ${esc(argTxt(c.args))} | ${c.risk}${c.external ? ' · zewn.' : ''} | ${c.level}${c.levelDependsOnArgs ? ' (zależy od arg.)' : ''} | ${c.undoable ? 'tak' : '—'} | ${esc(c.examples.slice(0, 3).map(e => '„' + e + '”').join(', ') || '—')} |\n`;
  md += '\n';
}

/* ---------- ustawienia ---------- */
const coreSrc = fs.readFileSync(path.join(ROOT, 'js', 'core.js'), 'utf8');
const defaults = (() => { const j = load({ state: {} }); return j.state.settings; })();
const ALLOW = (/const ALLOW = \[([^\]]*)\]/.exec(coreSrc)?.[1] || '').match(/'([^']+)'/g)?.map(s => s.slice(1, -1)) || [];
const SECTION = k => /^jev/.test(k) ? 'Sędzia Jev' : /^hermes|toolFormat/.test(k) ? 'Hermes (mózg)' : /openrouter/.test(k) ? 'OpenRouter' : /accent|look|wall|particles/.test(k) ? 'Wygląd' : /sound|speech|voice|silentVoice|wakeWord/.test(k) ? 'Głos i dźwięk' : /proactive|quiet|briefing|summary/.test(k) ? 'Agent i proaktywność' : /city|lat|lon|user|skipBoot/.test(k) ? 'Użytkownik i start' : 'Inne';
const SECRET = k => /key/i.test(k);
let ms = '# Katalog ustawień (wygenerowany z kodu)\n\n> Generuje `node tools/gen-spec.js` z `js/core.js`. Nie edytuj ręcznie.\n\nKolumna „w adresie” = klucz można podać w `index.html#klucz=wartość` (lista `ALLOW`). Klucze tajne nigdy nie trafiają do modelu (`settings_get`) ani do eksportu.\n\n| sekcja | klucz | domyślnie | typ | w adresie | tajny |\n|---|---|---|---|---|---|\n';
for (const [k, v] of Object.entries(defaults).sort((a, b) => SECTION(a[0]).localeCompare(SECTION(b[0])) || a[0].localeCompare(b[0]))) ms += `| ${SECTION(k)} | \`${k}\` | ${SECRET(k) ? '—' : '`' + esc(JSON.stringify(v)) + '`'} | ${typeof v} | ${ALLOW.includes(k) ? 'tak' : '—'} | ${SECRET(k) ? 'tak' : '—'} |\n`;

/* ---------- zdarzenia ---------- */
const ev = {};
for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
  for (const m of src.matchAll(/J\.(ev\.)?emit\('([a-z0-9._-]+)'/gi)) { const k = (m[1] ? 'bus: ' : 'ui: ') + m[2]; (ev[k] = ev[k] || new Set()).add(f); }
}
let me = '# Katalog zdarzeń (wygenerowany z kodu)\n\n> Generuje `node tools/gen-spec.js`. Dwa kanały: **bus** (`J.ev.emit` — zdarzenia agenta, zasilają rdzeń, karty HUD i Process Log; mają `task_id`) i **ui** (`J.emit` — odświeżanie widoków).\n\n| kanał | zdarzenie | gdzie powstaje |\n|---|---|---|\n';
for (const k of Object.keys(ev).sort()) { const [ch, name] = k.split(': '); me += `| ${ch} | \`${name}\` | ${[...ev[k]].sort().join(', ')} |\n`; }

/* ---------- planowane polecenia ---------- */
const NEW = require(path.join(OUT, 'nowe-polecenia.js'));
let mn = '# Katalog planowanych poleceń (wygenerowany z docs/spec/nowe-polecenia.js)\n\n> Generuje `node tools/gen-spec.js`. Źródło: `docs/spec/nowe-polecenia.js`. Szczegóły w dokumencie z kolumny „opis w”. „rozszerzenie” = polecenie już istnieje, zmieniają się argumenty.\n\n';
mn += `Planowanych: **${NEW.length}** (nowych ${NEW.filter(c => !c.extends).length}, rozszerzeń ${NEW.filter(c => c.extends).length}). Po wdrożeniu rejestr będzie miał ok. ${cmds.length + NEW.filter(c => !c.extends).length} poleceń.\n\n`;
mn += '| fala | liczba |\n|---|---|\n' + ['W1', 'W2', 'W3', 'W4', 'W5'].map(w => `| ${w} | ${NEW.filter(c => c.phase === w).length} |`).join('\n') + '\n\n';
for (const g of [...new Set(NEW.map(c => c.group))]) {
  mn += `## ${g}\n\n| id | co robi | argumenty | poziom | cofanie | fala | opis w | przykłady PL |\n|---|---|---|---|---|---|---|---|\n`;
  for (const c of NEW.filter(x => x.group === g)) mn += `| \`${c.id}\`${c.extends ? ' (rozszerzenie)' : ''} | ${esc(c.label)} — ${esc(c.description)} | ${esc(argTxt(c.args))} | ${c.level} | ${esc(c.undo || '—')} | ${c.phase} | [${c.doc}](${c.doc}) | ${esc(c.examples.slice(0, 3).map(e => '„' + e + '”').join(', '))} |\n`;
  mn += '\n';
}

/* ---------- tabela planowanych poleceń wstawiana do dokumentów obszarów (między znacznikami) ---------- */
const START = '<!-- polecenia:start (generuje tools/gen-spec.js) -->', END = '<!-- polecenia:end -->';
const docBlocks = {};
const areaDocs = fs.readdirSync(OUT).filter(f => /^\d\d-.*\.md$/.test(f) && (NEW.some(c => c.doc === f) || fs.readFileSync(path.join(OUT, f), 'utf8').includes(START)));
for (const doc of areaDocs) {
  const l = NEW.filter(c => c.doc === doc);
  if (!l.length) { const f = path.join(OUT, doc), src = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'), i = src.indexOf(START), j = src.indexOf(END); const b = START + '\n\n## Planowane polecenia tej części\n\nWszystkie zaplanowane polecenia tej części są już w rejestrze — zobacz [katalog-polecen.md](katalog-polecen.md).\n\n' + END; docBlocks[doc] = i >= 0 && j > i ? src.slice(0, i) + b + src.slice(j + END.length) : src; continue; }
  let b = START + '\n\n## Planowane polecenia tej części\n\n| polecenie | co robi | poziom | cofanie | fala |\n|---|---|---|---|---|\n';
  for (const c of l) b += `| \`${c.id}\`${c.extends ? ' (rozszerzenie)' : ''} | ${esc(c.label)} | ${c.level} | ${esc(c.undo || '—')} | ${c.phase} |\n`;
  b += '\nPełne argumenty i przykłady: [katalog-nowych-polecen.md](katalog-nowych-polecen.md).\n\n' + END;
  const f = path.join(OUT, doc), src = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  const i = src.indexOf(START), j = src.indexOf(END);
  docBlocks[doc] = i >= 0 && j > i ? src.slice(0, i) + b + src.slice(j + END.length) : src.replace(/\s*$/, '') + '\n\n' + b + '\n';
}

const files = { 'katalog-polecen.md': md, 'katalog-polecen.json': JSON.stringify(cmds, null, 1) + '\n', 'katalog-ustawien.md': ms, 'katalog-zdarzen.md': me, 'katalog-nowych-polecen.md': mn, ...docBlocks };
if (process.argv.includes('--check')) {
  const stale = Object.entries(files).filter(([f, c]) => { try { return fs.readFileSync(path.join(OUT, f), 'utf8').replace(/\r\n/g, '\n') !== c; } catch (e) { return true; } }).map(([f]) => f);
  if (stale.length) { console.error('Nieaktualne: ' + stale.join(', ') + ' — uruchom: node tools/gen-spec.js'); process.exit(1); }
  console.log('Katalogi aktualne.'); process.exit(0);
}
fs.mkdirSync(OUT, { recursive: true });
for (const [f, c] of Object.entries(files)) fs.writeFileSync(path.join(OUT, f), c);
console.log('Zapisano: ' + Object.keys(files).join(', ') + ' · poleceń ' + cmds.length);
