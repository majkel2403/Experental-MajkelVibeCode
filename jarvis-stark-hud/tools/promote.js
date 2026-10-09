/* Przenosi polecenia, które są już w rejestrze, z planu (docs/spec/nowe-polecenia.js) do zbioru testowego:
   usuwa ich wpisy z planu, a zdania z tests/fixtures/corpus-nowe.js dopisuje do tests/fixtures/corpus.js.
   Uruchomienie: node tools/promote.js id1 id2 …   (albo bez argumentów: wszystkie, które już istnieją w rejestrze, i rozszerzenia z listy --ext=id,id) */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const { load } = require(path.join(ROOT, 'tests', 'harness.js'));
const J = load({ state: { settings: { hermesOn: false } } });
const planFile = path.join(ROOT, 'docs', 'spec', 'nowe-polecenia.js'), cnFile = path.join(ROOT, 'tests', 'fixtures', 'corpus-nowe.js'), cFile = path.join(ROOT, 'tests', 'fixtures', 'corpus.js');
const PLAN = require(planFile), CN = require(cnFile);
const ext = (process.argv.find(a => a.startsWith('--ext=')) || '').slice(6).split(',').filter(Boolean);
let ids = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!ids.length) ids = PLAN.filter(c => (!c.extends && J.registry.get(c.id)) || (c.extends && ext.includes(c.id))).map(c => c.id);
if (!ids.length) { console.log('Nic do przeniesienia.'); process.exit(0); }
/* plan: wycinamy obiekty { id: 'x', … } — każdy wpis zaczyna się od „  { id: '<id>',” i kończy przed następnym „  { id:” albo komentarzem sekcji / końcem tablicy */
let src = fs.readFileSync(planFile, 'utf8');
for (const id of ids) {
  const start = src.indexOf("  { id: '" + id + "',"); if (start < 0) { console.error('brak w planie: ' + id); continue; }
  const rest = src.slice(start + 5); const m = /\n  \{ id: '|\n\n  \/\*|\n\];/.exec(rest); const end = start + 5 + m.index + 1;
  src = src.slice(0, start) + src.slice(end);
}
src = src.replace(/,(\s*\n\];)/, '$1');
fs.writeFileSync(planFile, src);
/* zdania */
const moved = CN.filter(x => ids.includes(x[1]));
let cn = fs.readFileSync(cnFile, 'utf8');
for (const [t, id, cat] of moved) { const lit = JSON.stringify([t, id, cat]).replace(/"/g, "'").replace(/','/g, "', '").replace(/^\['/, "['"); const re = new RegExp("\\s*\\['" + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "', '" + id + "', '" + cat + "'\\],?"); cn = cn.replace(re, ''); }
fs.writeFileSync(cnFile, cn);
let c = fs.readFileSync(cFile, 'utf8');
const add = moved.map(([t, id, cat]) => "C.push(['" + t.replace(/'/g, "\\'") + "', '" + id + "', '" + (cat === 'local' ? 'local' : 'para') + "']);").join('\n');
c = c.replace("/* powtórzenia (np. z generatora)", '/* ---- przeniesione z planu (' + ids.join(', ') + ') ---- */\n' + add + '\n\n/* powtórzenia (np. z generatora)');
fs.writeFileSync(cFile, c);
console.log('Przeniesiono: ' + ids.join(', ') + ' · zdań: ' + moved.length);
