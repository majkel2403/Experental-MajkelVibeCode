/* js/perf.js: bez ?perf=1 moduł jest całkowicie bierny; z parametrem tworzy jeden element i udostępnia statystyki. */
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'perf.js'), 'utf8');
const run = search => {
  const made = []; let raf = 0;
  const el = { style: {}, setAttribute() { }, set textContent(v) { this._t = v; } };
  const win = { location: { search }, document: { body: { appendChild: e => made.push(e) }, createElement: () => el, addEventListener() { } }, requestAnimationFrame: () => { raf++; }, setInterval: () => 1, PerformanceObserver: undefined };
  win.window = win; vm.runInNewContext(SRC, win);
  return { win, made, raf };
};
test('perf.js: bez parametru nic nie robi (brak DOM, rAF, __perf)', () => {
  for (const s of ['', '?x=1', '?perf=0', '?perf=10']) { const r = run(s); assert.equal(r.made.length, 0); assert.equal(r.raf, 0); assert.equal(r.win.__perf, undefined); }
});
test('perf.js: z ?perf=1 dodaje jeden element i uruchamia pętlę pomiarową', () => {
  for (const s of ['?perf=1', '?a=2&perf=1', '?perf=1&a=2']) { const r = run(s); assert.equal(r.made.length, 1); assert.equal(r.raf, 1); assert.equal(typeof r.win.__perf.stats, 'function'); assert.equal(r.win.__perf.stats().frames, 0); }
});
test('perf.js: jest w powłoce SW i w index.html przed main.js', () => {
  const root = path.join(__dirname, '..', '..'), idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8'), sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.ok(sw.includes("'js/perf.js'")); assert.ok(idx.indexOf('js/perf.js') > 0 && idx.indexOf('js/perf.js') < idx.indexOf('js/main.js'));
});
