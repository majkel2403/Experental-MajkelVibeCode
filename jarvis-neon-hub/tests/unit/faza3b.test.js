/* Faza 3B: domyślny wygląd nowych użytkowników (neon) z migracją, która nie rusza istniejących ustawień, horyzont zależny od tapety,
   uniformy podłogi neonu (odbicie/pierścienie/cząstki) i klasa gl-on (kanwa #fx znika z układu) */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../harness.js');

test('nowy użytkownik: tapeta neon i motyw neon (cyjan + magenta)', () => {
  const J = load();
  assert.equal(J.state.settings.wall, 'neon'); assert.equal(J.state.settings.accent, '#4df3ff'); assert.equal(J.state.settings.accent2, '#ff2bd6');
  assert.deepEqual(Array.from(J.THEMES.neon), [J.state.settings.accent, J.state.settings.accent2], 'domyślny motyw = motyw „neon”');
});

test('migracja v3→v4: istniejące ustawienia nietknięte, brakujące dostają dotychczasowe wartości (jezioro, niebieski motyw)', () => {
  const a = load({ state: { _v: 3, settings: { hermesOn: false } } });
  assert.equal(a.state._v, 4); assert.equal(a.state.settings.wall, 'photo'); assert.equal(a.state.settings.accent, '#33d6ff'); assert.equal(a.state.settings.accent2, '#a25cff');
  const b = load({ state: { _v: 3, settings: { hermesOn: false, wall: 'void', accent: '#ff0000', accent2: '#00ff00' } } });
  assert.equal(b.state.settings.wall, 'void'); assert.equal(b.state.settings.accent, '#ff0000'); assert.equal(b.state.settings.accent2, '#00ff00');
  const c = load({ state: { settings: { hermesOn: false } } });   // bardzo stary zapis bez wersji
  assert.equal(c.state.settings.wall, 'photo');
  const d = load({ state: { _v: 4, settings: { hermesOn: false, wall: 'neon' } } });   // już zmigrowany zapis z neonem zostaje
  assert.equal(d.state.settings.wall, 'neon');
});

test('horizonFor: neon = tuż pod środkiem Orba, pozostałe tapety = horyzont zdjęcia', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '../../js/hud.js'), 'utf8'), f = new Function(src.match(/const horizonFor = [^\n]+;/)[0] + ' return horizonFor;')();   // hud.js nie ładuje się w harnessie (DOM), więc czysta funkcja z kodu źródłowego
  assert.equal(f('neon', 400, 100, 555), 430); assert.equal(f('photo', 400, 100, 555), 555); assert.equal(f('aurora', 400, 100, 555), 555); assert.equal(f('void', 400, 100, 555), 555);
  assert.ok(f('neon', 400, 100, 555) < 400 + 1.37 * 100, 'stopa wiązki (cy + 1,37 R) leży pod horyzontem, czyli na podłodze');
});
