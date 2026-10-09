/* Wspólne typy JSDoc dla całego projektu Jarvis OS (vanilla JS).
   Służą tylko IDE i `tsc --noEmit` (typecheck = lint, bez wpływu na runtime).
   Zero importów, zero wpływu na produkcję - plik nie jest ładowany przez index.html. */

/**
 * Koperta wyniku każdego polecenia z Command Registry.
 * @typedef {Object} Result
 * @property {boolean} ok      - czy operacja się udała
 * @property {ResultCode} code - maszyna stanu: OK | NOT_FOUND | INVALID_ARGS | ...
 * @property {*} [data]        - dane specyficzne dla polecenia (albo null)
 * @property {string} text     - komunikat po polsku dla użytkownika
 * @property {*} [ui]          - opcjonalny marker dla UI (np. propozycja)
 */

/**
 * @typedef {('OK'|'NOT_FOUND'|'INVALID_ARGS'|'NEEDS_CONFIRMATION'|'DENIED'|'DUPLICATE'|'OFFLINE'|'RATE_LIMITED'|'TIMEOUT'|'UNSUPPORTED'|'INTERNAL')} ResultCode
 */

/**
 * Skrócony kształt envelope dla helperów.
 * @typedef {Object} EnvelopeOk
 * @property {true} ok
 * @property {'OK'} code
 * @property {*} data
 * @property {string} text
 */

/**
 * @typedef {Object} EnvelopeFail
 * @property {false} ok
 * @property {ResultCode} code
 * @property {string} text
 * @property {*} data
 */

/**
 * Property schematu argumentów (subset JSON Schema używany w registry).
 * @typedef {Object} ArgProp
 * @property {string} [type]       - 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'
 * @property {string} [format]     - 'time' | 'date'
 * @property {string[]} [enum]     - lista dozwolonych wartości
 * @property {number} [minimum]
 * @property {number} [maximum]
 * @property {number} [maxLength]
 * @property {string} [description]
 * @property {*} [default]
 */

/**
 * @typedef {Object} ArgSchema
 * @property {'object'} type
 * @property {Object<string, ArgProp>} properties
 * @property {string[]} [required]
 */

/**
 * Definicja polecenia w rejestrze.
 * @typedef {Object} CommandSpec
 * @property {string} id
 * @property {string} label
 * @property {string} description
 * @property {ArgSchema} args
 * @property {string[]} examples
 * @property {string} group
 * @property {'safe'|'confirm'|'blocked'} risk
 * @property {boolean} [undoable]
 * @property {boolean} [hermes]    - false = polecenie nie jest eksportowane do Hermesa
 * @property {boolean} [voice]     - false = nie pojawia się w helpie głosowym
 * @property {boolean} [palette]   - false = nie pojawia się w palecie
 * @property {string[]} reads
 * @property {string[]} writes
 */

/**
 * Schemat narzędzia dla modelu (OpenAI/Hermes format).
 * @typedef {Object} ToolFunction
 * @property {string} name
 * @property {string} description
 * @property {ArgSchema} parameters
 */

/**
 * @typedef {Object} ToolSchema
 * @property {'function'} type
 * @property {ToolFunction} function
 */

/**
 * Kontekst wywołania polecenia.
 * @typedef {Object} RunContext
 * @property {string} [source]     - 'ui' | 'local' | 'voice' | 'hermes' | 'signal' | 'routine' | 'jev'
 * @property {boolean} [confirmed]
 * @property {boolean} [forceConfirm]
 * @property {Object} [judge]      - decyzja Jeva (intencja, ryzyko)
 * @property {AbortSignal} [signal]
 */

/**
 * @typedef {Object} JNamespace
 * @property {Object} state
 * @property {Object} nlp
 * @property {Function} norm
 * @property {Function} pad
 * @property {Object} registry
 * @property {Function} save
 * @property {Function} emit
 * @property {Function} on
 * @property {Function} log
 * @property {Function} confirm
 */

/**
 * Pomocnik: weź z obiektu klucze walidowane schematem.
 * @template T
 * @typedef {T extends string ? never : T} _Phantom
 */

export {};
