/* Offline / powłoka aplikacji, self-hosting czcionek i CSP po weryfikacji Fazy 1:
   (a) każdy zasób wskazany przez CSS i index.html istnieje i jest w SHELL; (b) zmiana pliku powłoki wymusza bump CACHE (hash w fixture);
   (c) brak powrotu Google Fonts i luźnych hostów w style-src / font-src. */
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { readSw, shellHash, FIX } = require('../../tools/shell-hash.js');
const { stripComments } = require('../../tools/css-lint.js');
const ROOT = path.join(__dirname, '..', '..');
const { cache, shell } = readSw();
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const cssFiles = fs.readdirSync(path.join(ROOT, 'css')).filter(f => f.endsWith('.css')).sort();
const rel = (base, u) => path.posix.normalize(path.posix.join(path.posix.dirname(base), u.split(/[?#]/)[0]));

/* url(…) i image-set("…") z CSS (bez data:, #fragmentów i adresów zewnętrznych); ścieżki względem pliku CSS */
const cssRefs = () => { const out = []; for (const f of cssFiles) { const css = stripComments(fs.readFileSync(path.join(ROOT, 'css', f), 'utf8'));
  for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) out.push([f, m[2].trim()]);
  for (const m of css.matchAll(/image-set\(([^;{}]*)\)/g)) for (const s of m[1].matchAll(/(?:^|,)\s*(['"])([^'"]+)\1/g)) out.push([f, s[2].trim()]);   // wariant ze ścieżką jako ciąg znaków
} return out.map(([f, u]) => [f, u, /^(?:data:|https?:|#|about:)/i.test(u) ? null : rel('css/' + f, u)]); };

test('offline: każdy url() z css/*.css (także image-set) istnieje na dysku i jest w SHELL', () => {
  const refs = cssRefs(); assert.ok(refs.length >= 10, 'oczekiwano wielu odwołań (czcionki, tapeta): ' + refs.length);
  const miss = [], notShell = [];
  for (const [f, u, p] of refs) { if (!p) continue; if (!fs.existsSync(path.join(ROOT, p))) miss.push(`${f}: ${u}`); if (!shell.includes(p)) notShell.push(`${f}: ${p}`); }
  assert.deepEqual(miss, [], 'CSS wskazuje nieistniejące pliki'); assert.deepEqual(notShell, [], 'zasób z CSS bez wersji offline w SHELL (sw.js)');
  assert.ok(refs.some(([, , p]) => p === 'assets/wallpaper.avif') && refs.some(([, , p]) => p === 'assets/wallpaper.webp'), 'tapeta (image-set) jest wykrywana');
});
test('offline: każdy href/src z index.html (poza config.local.js) istnieje i jest w SHELL', () => {
  const urls = [...html.matchAll(/\s(?:href|src)="([^"]+)"/g)].map(m => m[1]).filter(u => !/^(?:https?:|data:|#|mailto:)/i.test(u) && u !== 'config.local.js');
  assert.ok(urls.length >= 30, 'oczekiwano skryptów, stylu, ikony, manifestu: ' + urls.length);
  const miss = urls.filter(u => !fs.existsSync(path.join(ROOT, u.split(/[?#]/)[0]))), notShell = urls.filter(u => !shell.includes(u.split(/[?#]/)[0]));
  assert.deepEqual(miss, [], 'index.html wskazuje nieistniejące pliki'); assert.deepEqual(notShell, [], 'zasób z index.html bez wersji offline w SHELL');
});
test('offline: wszystkie pliki z assets/fonts/ są w SHELL, a każdy wpis SHELL istnieje', () => {
  const fonts = fs.readdirSync(path.join(ROOT, 'assets', 'fonts')).map(f => 'assets/fonts/' + f);
  assert.ok(fonts.length >= 10); assert.deepEqual(fonts.filter(f => !shell.includes(f)), [], 'czcionki bez wersji offline');
  assert.deepEqual(shell.filter(f => f !== './' && !fs.existsSync(path.join(ROOT, f))), [], 'SHELL wskazuje nieistniejące pliki');
  assert.equal(new Set(shell).size, shell.length, 'duplikaty w SHELL');
});

test('SW: zmiana zawartości pliku powłoki wymusza podbicie CACHE (fixture tests/fixtures/shell-hash.json)', () => {
  const fx = JSON.parse(fs.readFileSync(FIX, 'utf8')), hash = shellHash(), how = '\n  Podbij numer CACHE w sw.js (jarvis-os-vNN → NN+1), potem: node tools/shell-hash.js --update  (zapisuje fixture; bez bumpa odmawia)';
  if (fx.hash !== hash) assert.notEqual(fx.cache, cache, 'plik z SHELL zmienił się, a CACHE nadal ' + cache + ' — przeglądarki użytkowników zostałyby ze starą powłoką.' + how);
  assert.equal(fx.cache, cache, 'fixture zna CACHE ' + fx.cache + ', a sw.js ma ' + cache + '.' + how);
  assert.equal(fx.hash, hash, 'hash powłoki w fixture jest nieaktualny (podbito CACHE, ale nie zapisano hasha).' + how);
});
test('SW: hash powłoki reaguje na treść pliku i jego nazwę (kontrola samego mechanizmu)', () => {
  const os = require('os'), d = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-')); try {
    fs.writeFileSync(path.join(d, 'a.js'), 'x'); fs.writeFileSync(path.join(d, 'b.js'), 'y');
    const h0 = shellHash(d, ['a.js', 'b.js']); assert.equal(shellHash(d, ['b.js', 'a.js']), h0, 'kolejność w SHELL nie zmienia hasha');
    fs.writeFileSync(path.join(d, 'b.js'), 'z'); assert.notEqual(shellHash(d, ['a.js', 'b.js']), h0);
    assert.notEqual(shellHash(d, ['a.js']), h0);
    /* sw.js: logika wlicza się do hasha, same linie CACHE/SHELL nie */
    fs.writeFileSync(path.join(d, 'b.js'), 'y'); const sw = c => "const CACHE = '" + c + "';\nconst SHELL = ['a.js'];\nself.x = 1;\n";
    fs.writeFileSync(path.join(d, 'sw.js'), sw('v1')); const hs = shellHash(d, ['a.js', 'b.js']); assert.notEqual(hs, h0, 'sw.js wchodzi do hasha');
    fs.writeFileSync(path.join(d, 'sw.js'), sw('v2')); assert.equal(shellHash(d, ['a.js', 'b.js']), hs, 'zmiana linii CACHE nie zmienia hasha');
    fs.writeFileSync(path.join(d, 'sw.js'), sw('v2').replace('self.x = 1', 'self.x = 2')); assert.notEqual(shellHash(d, ['a.js', 'b.js']), hs, 'zmiana logiki sw.js zmienia hash');
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('self-hosting: index.html i css/*.css bez Google Fonts (fonts.googleapis.com / fonts.gstatic.com)', () => {
  const bad = [['index.html', html], ...cssFiles.map(f => ['css/' + f, fs.readFileSync(path.join(ROOT, 'css', f), 'utf8')])].filter(([, t]) => /fonts\.(?:googleapis|gstatic)\.com/i.test(t)).map(([n]) => n);
  assert.deepEqual(bad, [], 'powrót Google Fonts (czcionki są własne: assets/fonts/, @font-face w css)');
  assert.ok(/@font-face/.test(fs.readFileSync(path.join(ROOT, 'css', 'jarvis.css'), 'utf8')), 'czcionki własne przez @font-face');
});
test('CSP: style-src bez zewnętrznych hostów, font-src dokładnie \'self\' data:', () => {
  const csp = /Content-Security-Policy"\s+content="([^"]+)"/.exec(html)[1], dir = n => csp.split(';').map(s => s.trim()).find(s => s.startsWith(n + ' ')).split(/\s+/).slice(1);
  const style = dir('style-src'); assert.ok(style.includes("'self'"));
  assert.deepEqual(style.filter(s => !/^'(?:self|unsafe-inline)'$/.test(s)), [], 'style-src ma zewnętrzne źródła: ' + style.join(' '));
  assert.deepEqual(dir('font-src'), ["'self'", 'data:'], 'font-src: ' + dir('font-src').join(' '));
});
