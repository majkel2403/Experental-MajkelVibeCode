/* Kontrakt selektorów (plan neonowy §4, CONSTRAINTS §B7): ID i klasy, na których opiera się tests/e2e/smoke.js, muszą nadal istnieć
   w index.html albo być tworzone w js/*.js. Statyczny grep po źródłach — łapie przypadkowe przemianowanie w trakcie przebudowy CSS/DOM. */
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SRC = [read('index.html'), ...fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => read('js/' + f))].join('\n');
const has = tok => new RegExp('(?<![\\w-])' + tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])').test(SRC);

/* ręcznie utrzymywana lista kontraktu (nazwy z asercji e2e i CONSTRAINTS §B7) */
const IDS = ['boot', 'bootEnter', 'app', 'askChip', 'undoChip', 'messages', 'chatPanel', 'chatThread', 'chatAtt', 'hud', 'toasts', 'task', 'dock', 'paletteList', 'setFind', 'ntList', 'kbList', 'rtList', 'jAct'];
const CLASSES = ['topbar', 'hc', 'window', 'win-head', 'win-body', 'pitem', 'set-hit', 'row', 'ctx', 'btn', 'primary', 'danger', 'show', 'on', 'hidden', 'gone', 'pinned', 'collapsed', 'present', 'chip', 'minimap', 'mm-w', 'ws-clock', 'ws-text', 'note-item', 'wall'];
const ATTRS = ['data-app', 'data-id'];

test('kontrakt: ID z listy istnieją w index.html lub js/*.js', () => {
  const miss = IDS.filter(id => !new RegExp(`id=["']?${id}\\b|id:\\s*['"]${id}['"]|getElementById\\(['"]${id}['"]\\)|\\bid=\\\\?["']${id}`).test(SRC) && !has(id));
  assert.deepEqual(miss, []);
  for (const id of ['boot', 'app', 'askChip', 'undoChip', 'chatPanel', 'hud', 'toasts', 'task', 'dock']) assert.ok(new RegExp(`id=["']${id}["']`).test(read('index.html')), `#${id} w index.html`);
});
test('kontrakt: klasy z listy występują w index.html lub js/*.js', () => {
  assert.deepEqual(CLASSES.filter(c => !has(c)), []);
});
test('kontrakt: atrybuty data-* używane przez testy i kod są obecne', () => {
  assert.deepEqual(ATTRS.filter(a => !SRC.includes(a)), []);
  assert.ok(/'data-app':\s*id/.test(read('js/core.js')), 'okno dostaje data-app w js/core.js');
  const core = read('js/core.js');
  assert.ok(/class="win-head"/.test(core), 'win-head tworzone w core.js');
  assert.ok(/class="rz rz-\$\{e\}"/.test(core) && /\['n', 's', 'e', 'w'[^\]]*\]/.test(core), 'uchwyty rz-n/s/e/w (w tym rz-w) składane w core.js z listy kierunków');
  assert.ok(/pitem/.test(read('js/search.js')) || /pitem/.test(SRC), 'pitem w palecie');
});
test('kontrakt: każdy selektor literalny z tests/e2e/smoke.js ma pokrycie w źródłach (wyciągnięty z pliku)', () => {
  const smoke = read('tests/e2e/smoke.js');
  const lits = [...smoke.matchAll(/'([#.][A-Za-z][^'\n]*)'|"([#.][A-Za-z][^"\n]*)"|`([#.][A-Za-z][^`\n]*)`/g)].map(m => m[1] || m[2] || m[3]);
  const toks = new Set();
  for (const s of lits) {
    if (/\s{2,}|^\.\s|:has-text/.test(s) && !/^[#.][\w-]+/.test(s)) continue;
    // ID i klasy w selektorze (bez fragmentów w [attr="…"] i pseudo-klas)
    const clean = s.replace(/\[[^\]]*\]/g, ' ').replace(/:[a-z-]+(\([^)]*\))?/g, ' ');
    for (const m of clean.matchAll(/([#.])([A-Za-z][\w-]*)/g)) toks.add(m[1] + m[2]);
  }
  assert.ok(toks.size >= 25, 'wyciągnięto sensowną liczbę selektorów: ' + toks.size);
  const miss = [...toks].filter(t => {
    const n = t.slice(1);
    // literały spoza kontraktu DOM (przykładowe teksty/markdown w asercjach)
    if (['md'].includes(n)) return false;
    if (/^rz-(?:n|s|e|w|ne|nw|sw)$/.test(n)) return false;   // uchwyty składane w core.js z listy kierunków (sprawdzone wyżej)
    return !has(n);
  });
  assert.deepEqual(miss, [], 'selektory z smoke.js bez pokrycia w index.html/js/*.js');
});
