'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../harness.js');
const J = load({ state: { settings: { hermesOn: false } } });
const base = new Date('2026-09-29T12:00:00');   // wtorek

test('nlp.time: formaty godzin', () => {
  assert.equal(J.nlp.time('o 18:30 trening'), '18:30');
  assert.equal(J.nlp.time('spotkanie o 9'), '09:00');
  assert.equal(J.nlp.time('o 7.45 pobudka'), '07:45');
  assert.equal(J.nlp.time('o osiemnastej trzydzieści'), '18:30');
  assert.equal(J.nlp.time('w południe lunch'), '12:00');
  assert.equal(J.nlp.time('minutnik na 5 minut'), null);
});
test('nlp.date: względne i absolutne', () => {
  assert.equal(J.nlp.date('jutro', base), '2026-09-30');
  assert.equal(J.nlp.date('pojutrze', base), '2026-10-01');
  assert.equal(J.nlp.date('w piątek', base), '2026-10-02');
  assert.equal(J.nlp.date('we wtorek', base), '2026-10-06');   // ten sam dzień tygodnia → za tydzień
  assert.equal(J.nlp.date('za 3 dni', base), '2026-10-02');
  assert.equal(J.nlp.date('1.10', base), '2026-10-01');
  assert.equal(J.nlp.date('2026-12-24', base), '2026-12-24');
  assert.equal(J.nlp.date('o 18:30', base), null);
});
test('nlp.relative i duration', () => {
  const r = J.nlp.relative('za 20 minut zadzwonić', base);
  assert.equal(r.time, '12:20'); assert.equal(r.seconds, 1200);
  assert.equal(J.nlp.relative('za godzinę', base).time, '13:00');
  assert.equal(J.nlp.relative('za półtorej godziny', base).time, '13:30');
  assert.equal(J.nlp.duration('5 minut'), 300);
  assert.equal(J.nlp.duration('minutnik 25 min'), 1500);
  assert.equal(J.nlp.duration('półtorej godziny'), 5400);
  assert.equal(J.nlp.duration('90 sekund'), 90);
  assert.equal(J.nlp.duration('pół godziny'), 1800);
});
test('nlp.strip usuwa wyrażenia czasu', () => {
  assert.equal(J.nlp.strip('trening o 18:00 jutro'), 'trening');
  assert.equal(J.nlp.strip('za 20 minut zadzwonić do mamy'), 'zadzwonić do mamy');
});
test('calc: parser wyrażeń', () => {
  assert.equal(J.calc('2+2*2'), 6);
  assert.equal(J.calc('15/100*2400'), 360);
  assert.equal(J.calc('sqrt(16)+2^3'), 12);
  assert.equal(J.calc('-2^2'), -4, 'minus słabszy niż potęga'); assert.equal(J.calc('(-2)^2'), 4); assert.equal(J.calc('2^-1'), 0.5); assert.equal(J.calc('2^3^2'), 512); assert.equal(J.calc('2*-3'), -6);
  assert.throws(() => J.calc('1000000!'), /za duża/, 'duża silnia nie wiesza karty'); assert.throws(() => J.calc('2.5!'), /całkowitej/);
  assert.equal(J.calc('10%'), 0.1);
  assert.throws(() => J.calc('2+'));
  assert.throws(() => J.calc('foo'));
});
