/* Mały walidator JSON Schema (podzbiór) — bez zależności. Używany przez testy specyfikacji i (docelowo) przez widget_build.
   Obsługuje: type, const, enum, minLength/maxLength, pattern, minimum/maximum, properties, required, additionalProperties (false | schemat),
   propertyNames, maxProperties, items, minItems/maxItems, oneOf. Zwraca listę błędów (pusta = poprawne). */
'use strict';
const typeOf = v => Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
function validate(schema, value, at = '$') {
  const errs = [], err = m => errs.push(at + ': ' + m);
  if (schema.const !== undefined && value !== schema.const) { err('ma być ' + JSON.stringify(schema.const)); return errs; }
  if (schema.enum && !schema.enum.includes(value)) { err('wartość spoza listy: ' + JSON.stringify(value)); return errs; }
  if (schema.type) {
    const t = typeOf(value), ok = schema.type === t || (schema.type === 'number' && t === 'number' && isFinite(value)) || (schema.type === 'integer' && Number.isInteger(value));
    if (!ok) { err('typ ' + t + ', oczekiwano ' + schema.type); return errs; }
  }
  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) err('za krótki tekst');
    if (schema.maxLength != null && value.length > schema.maxLength) err('za długi tekst (' + value.length + ' > ' + schema.maxLength + ')');
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) err('nie pasuje do wzorca ' + schema.pattern);
  }
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) err('mniej niż ' + schema.minimum);
    if (schema.maximum != null && value > schema.maximum) err('więcej niż ' + schema.maximum);
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) err('za mało elementów');
    if (schema.maxItems != null && value.length > schema.maxItems) err('za dużo elementów (' + value.length + ' > ' + schema.maxItems + ')');
    if (schema.items) value.forEach((v, i) => errs.push(...validate(schema.items, v, at + '[' + i + ']')));
  }
  if (typeOf(value) === 'object') {
    const keys = Object.keys(value), props = schema.properties || {};
    for (const r of schema.required || []) if (!(r in value)) err('brak pola „' + r + '”');
    if (schema.maxProperties != null && keys.length > schema.maxProperties) err('za dużo pól');
    for (const k of keys) {
      if (schema.propertyNames) errs.push(...validate({ type: 'string', ...schema.propertyNames }, k, at + '.' + k + '(nazwa)'));
      if (props[k]) errs.push(...validate(props[k], value[k], at + '.' + k));
      else if (schema.additionalProperties === false && !schema.oneOf) err('niedozwolone pole „' + k + '”');
      else if (typeOf(schema.additionalProperties) === 'object') errs.push(...validate(schema.additionalProperties, value[k], at + '.' + k));
    }
  }
  if (schema.oneOf) {
    const results = schema.oneOf.map(s => validate({ ...s, oneOf: undefined }, value, at));
    const okN = results.filter(r => !r.length).length;
    if (okN !== 1) {
      // najlepsza podpowiedź: wariant z pasującym „kind”, jeśli jest
      const i = schema.oneOf.findIndex(s => s.properties?.kind?.const !== undefined && s.properties.kind.const === value?.kind);
      if (okN === 0) errs.push(...(i >= 0 ? results[i] : [at + ': nie pasuje do żadnego wariantu' + (value?.kind ? ' (kind=' + value.kind + ')' : '')]));
      else err('pasuje do kilku wariantów');
    }
  }
  return errs;
}
module.exports = { validate };
