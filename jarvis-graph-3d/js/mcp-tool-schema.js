/* =========================================================
   JARVIS OS — budowanie i walidacja JSON Schema narzędzi MCP

   Dlaczego osobny moduł:
   - Command Registry w registry.js eksportuje schema w formacie
     {type:'object', properties:{...}}. Most MCP w bridge.js czyta je
     przez `J.registry.tools()` i wysyła do mostu (bridge/tools.json),
     a stamtąd trafiają do Hermesa jako narzędzia OpenAI/Hermes.
   - Każde nowe narzędzie musi mieć poprawne schema; ręczne pisanie
     JSON Schema jest podatne na literówki i niespójne typy.
   - Ten helper buduje schema z małego DSL (string/typed/enum/required)
     i waliduje wynik przed publikacją - łapie brakujące properties,
     nieznane typy, puste enum i sprzeczne required.

   Kontrakt (niezmiennik):
   - Wynik `build()` jest zawsze poprawnym JSON Schema dla modelu
     (type:'object', properties ma conajmniej 0 kluczy).
   - Wynik `validate()` zwraca kopertę {ok, code, text, data} jak reszta
     rejestru - wywołujący może ją zwrócić bezpośrednio do UI.

   Pierwszy plik w projekcie z JSDoc types - manifestuje decyzję z
   docs/TS-MIGRATION.md: vanilla JS + JSDoc + tsc --noEmit (zero build step).
   ========================================================= */
'use strict';

(() => {

/** @typedef {import('./global.d.ts').ArgProp} ArgProp */
/** @typedef {import('./global.d.ts').ArgSchema} ArgSchema */
/** @typedef {import('./global.d.ts').Result} Result */

/** Dozwolone typy w schema argumentów (reszta rejestru). */
const PRIMITIVES = new Set(['string', 'number', 'integer', 'boolean', 'array', 'object']);

/** Zwraca polską nazwę typu dla komunikatu błędu. */
const typeLabel = (t) => ({ string: 'tekst', number: 'liczba', integer: 'liczba całkowita', boolean: 'tak/nie', array: 'lista', object: 'obiekt' }[t] || t);

/**
 * Zbuduj schema jednego pola (ArgProp) z minimalnego opisu.
 * @param {string} type  - 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'
 * @param {Partial<ArgProp>} [opts]
 * @returns {ArgProp}
 */
function prop(type, opts = {}) {
  if (!PRIMITIVES.has(type)) throw new Error(`mcpSchema.prop: nieznany typ "${type}" (dozwolone: ${[...PRIMITIVES].join(', ')})`);
  const p = { type, ...opts };
  if (p.enum && (!Array.isArray(p.enum) || p.enum.length === 0)) throw new Error('mcpSchema.prop: enum musi być niepustą listą');
  if (p.minimum != null && !['number', 'integer'].includes(type)) throw new Error('mcpSchema.prop: minimum tylko dla number/integer');
  if (p.maximum != null && !['number', 'integer'].includes(type)) throw new Error('mcpSchema.prop: maximum tylko dla number/integer');
  if (p.maxLength != null && type !== 'string') throw new Error('mcpSchema.prop: maxLength tylko dla string');
  return p;
}

/**
 * Zbuduj pełne ArgSchema z opisu pól i listy wymaganych.
 * @param {Object<string, ArgProp>} properties
 * @param {string[]} [required]
 * @returns {ArgSchema}
 */
function schema(properties, required = []) {
  const props = properties || {};
  if (typeof props !== 'object' || Array.isArray(props)) throw new Error('mcpSchema.schema: properties musi być obiektem {nazwa: pole}');
  for (const [k, p] of Object.entries(props)) {
    if (!p || !PRIMITIVES.has(p.type)) throw new Error(`mcpSchema.schema: pole "${k}" ma niepoprawny type (${p && p.type})`);
  }
  const req = (required || []).filter(r => props[r] != null);
  const out = { type: 'object', properties: props };
  out.required = req;   // zawsze tablica (pusta gdy brak) - konsumenci mogą sprawdzić .length
  return out;
}

/**
 * Sprawdź, czy schema jest poprawna przed wysłaniem do modelu.
 * Zwraca kopertę Result - wywołujący nie musi łapać wyjątków.
 * @param {*} s - cokolwiek (najczęściej wynik build())
 * @returns {Result}
 */
function validate(s) {
  const fail = (text) => ({ ok: false, code: 'INVALID_ARGS', text, data: null });
  if (!s || typeof s !== 'object') return fail('Schema nie jest obiektem.');
  if (s.type !== 'object') return fail('Schema.type musi być "object".');
  const props = s.properties;
  if (!props || typeof props !== 'object' || Array.isArray(props)) return fail('Schema.properties musi być obiektem.');
  for (const [k, p] of Object.entries(props)) {
    if (!p || !PRIMITIVES.has(p.type)) return fail(`Pole "${k}": brak poprawnego type (string|number|integer|boolean|array|object).`);
    if (p.format && !['time', 'date'].includes(p.format)) return fail(`Pole "${k}": nieznany format "${p.format}" (dozwolone: time, date).`);
    if (p.enum && (!Array.isArray(p.enum) || !p.enum.length)) return fail(`Pole "${k}": enum musi być niepustą listą.`);
  }
  for (const r of s.required || []) {
    if (!props[r]) return fail(`required="${r}", ale properties.${r} nie istnieje.`);
  }
  return { ok: true, code: 'OK', text: 'Schema poprawne.', data: null };
}

/**
 * Skrót: zbuduj schema i od razu zwaliduj. Wyrzuca wyjątek tylko dla
 * oczywistych błędów budowania; walidacja → kopertę.
 * @param {Object<string, ArgProp>} properties
 * @param {string[]} [required]
 * @returns {ArgSchema}
 */
function build(properties, required) {
  const s = schema(properties, required);
  const v = validate(s);
  if (!v.ok) throw new Error('mcpSchema.build: ' + v.text);
  return s;
}

J.mcpSchema = { prop, schema, validate, build, PRIMITIVES: Array.from(PRIMITIVES), typeLabel };
})();
