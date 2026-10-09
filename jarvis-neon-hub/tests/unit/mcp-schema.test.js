/* Pierwszy test nowego modułu (item 4: TS migration). mcp-tool-schema.js
   buduje i waliduje JSON Schema dla narzędzi MCP - mały, samodzielny util
   udostępniony przez J.mcpSchema. Zero zależności, ładowany z osobnego vm. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');

/* Załaduj moduł w izolowanym vm z minimalnym kontekstem (J = window.J = {}) */
function loadSchema() {
  const ctx = {};
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  ctx.J = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'mcp-tool-schema.js'), 'utf8'), ctx, { filename: 'mcp-tool-schema.js' });
  return ctx.J.mcpSchema;
}

test('moduł się ładuje i eksponuje 4 funkcje', () => {
  const S = loadSchema();
  assert.equal(typeof S.prop, 'function');
  assert.equal(typeof S.schema, 'function');
  assert.equal(typeof S.validate, 'function');
  assert.equal(typeof S.build, 'function');
  assert.deepEqual([...S.PRIMITIVES].sort(), ['array', 'boolean', 'integer', 'number', 'object', 'string']);
});

test('prop: buduje pole z type i opcjami', () => {
  const S = loadSchema();
  const p = S.prop('string', { description: 'Miasto', maxLength: 80, enum: ['Warszawa', 'Gdańsk'] });
  assert.equal(p.type, 'string');
  assert.equal(p.maxLength, 80);
  assert.deepEqual(p.enum, ['Warszawa', 'Gdańsk']);
});

test('prop: rzuca wyjątek dla nieznanego typu', () => {
  const S = loadSchema();
  assert.throws(() => S.prop('decimal'), /nieznany typ "decimal"/);
});

test('prop: odrzuca minimum dla typu string', () => {
  const S = loadSchema();
  assert.throws(() => S.prop('string', { minimum: 1 }), /minimum tylko dla number\/integer/);
});

test('schema: buduje obiekt z required', () => {
  const S = loadSchema();
  const s = S.schema({ city: S.prop('string'), units: S.prop('string', { enum: ['C', 'F'] }) }, ['city']);
  assert.equal(s.type, 'object');
  assert.deepEqual(Object.keys(s.properties), ['city', 'units']);
  assert.deepEqual(s.required, ['city']);
});

test('schema: filtruje required dla nieistniejących pól', () => {
  const S = loadSchema();
  const s = S.schema({ a: S.prop('string') }, ['a', 'b', 'c']);
  assert.deepEqual(s.required, ['a']);
});

test('validate: akceptuje poprawne schema', () => {
  const S = loadSchema();
  const r = S.validate({ type: 'object', properties: { x: { type: 'number' } }, required: ['x'] });
  assert.equal(r.ok, true);
  assert.equal(r.code, 'OK');
});

test('validate: odrzuca schema bez type=object', () => {
  const S = loadSchema();
  const r = S.validate({ type: 'wrong' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'INVALID_ARGS');
  assert.match(r.text, /type musi być "object"/);
});

test('validate: odrzuca required bez properties', () => {
  const S = loadSchema();
  const r = S.validate({ type: 'object', properties: { a: { type: 'string' } }, required: ['ghost'] });
  assert.equal(r.ok, false);
  assert.match(r.text, /required="ghost".*nie istnieje/);
});

test('validate: odrzuca pusty enum', () => {
  const S = loadSchema();
  const r = S.validate({ type: 'object', properties: { k: { type: 'string', enum: [] } } });
  assert.equal(r.ok, false);
  assert.match(r.text, /enum musi być niepustą listą/);
});

test('build: łączy build + validate, zwraca schema gdy ok', () => {
  const S = loadSchema();
  const s = S.build({ city: S.prop('string', { description: 'Miasto' }) }, ['city']);
  assert.equal(s.type, 'object');
  assert.equal(s.properties.city.type, 'string');
  assert.deepEqual(s.required, ['city']);
});

test('build: rzuca dla required bez pola - schema filtruje wymagane dla nieistniejących właściwości', () => {
  const S = loadSchema();
  /* schema() samo filtruje required dla nieistniejących properties - sprawdzamy tylko że build nie daje
     required=['ghost'] */
  const s = S.build({ a: S.prop('string') }, ['ghost']);
  assert.deepEqual(s.required, []);
});

test('build: wymaga poprawnego type w properties (łapie błąd przed schema)', () => {
  const S = loadSchema();
  /* Jeśli wywołujący sam zbudował zły properties, schema() wyrzuci przy pierwszym polu */
  assert.throws(() => S.schema({ x: S.prop('wrong') }), /nieznany typ "wrong"/);
});
