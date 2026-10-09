/* Hash zawartości plików powłoki offline (SHELL w sw.js) — wymusza podbicie CACHE przy zmianie jakiegokolwiek pliku powłoki.
   Fixture tests/fixtures/shell-hash.json trzyma parę {cache, hash}; test tests/unit/shell-offline.test.js pada, gdy plik z SHELL zmieni się bez bumpa CACHE.
   Użycie: node tools/shell-hash.js           — pokaż bieżący hash i stan względem fixture'a
           node tools/shell-hash.js --update  — zapisz fixture (najpierw podbij CACHE w sw.js; bez bumpa przy zmienionym hashu odmawia) */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..'), FIX = path.join(ROOT, 'tests', 'fixtures', 'shell-hash.json');
const readSw = () => { const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'); return { cache: /const CACHE = '([^']+)'/.exec(sw)[1], shell: JSON.parse(sw.match(/const SHELL = (\[[^\]]*\])/)[1].replace(/'/g, '"')) }; };
const shellHash = (root = ROOT, shell = readSw().shell) => {
  const h = crypto.createHash('sha256');
  for (const f of shell.filter(x => x !== './').slice().sort()) { h.update(f + '\0'); h.update(fs.readFileSync(path.join(root, f))); h.update('\0'); }
  /* sam sw.js (logika cache) też jest częścią powłoki; pomijamy tylko linie CACHE/SHELL — ich zmiana to właśnie bump, nie zmiana logiki */
  const sw = path.join(root, 'sw.js');
  if (fs.existsSync(sw)) h.update('sw.js\0' + fs.readFileSync(sw, 'utf8').split('\n').filter(l => !/^const (CACHE|SHELL) =/.test(l)).join('\n') + '\0');
  return h.digest('hex');
};
module.exports = { readSw, shellHash, FIX };
if (require.main === module) {
  const { cache } = readSw(), hash = shellHash(), old = fs.existsSync(FIX) ? JSON.parse(fs.readFileSync(FIX, 'utf8')) : null;
  if (!process.argv.includes('--update')) { console.log(JSON.stringify({ cache, hash, fixture: old, zgodne: !!old && old.cache === cache && old.hash === hash }, null, 1)); process.exit(0); }
  if (old && old.hash !== hash && old.cache === cache) { console.error(`Pliki powłoki się zmieniły, a CACHE nadal ${cache}. Podbij numer w sw.js (jarvis-os-vNN → NN+1) i uruchom ponownie.`); process.exit(1); }
  fs.writeFileSync(FIX, JSON.stringify({ _opis: 'Hash zawartości plików SHELL z sw.js zapisany razem z nazwą CACHE. Aktualizacja: podbij CACHE w sw.js, potem node tools/shell-hash.js --update.', cache, hash }, null, 1) + '\n');
  console.log('Zapisano', cache, hash);
}
