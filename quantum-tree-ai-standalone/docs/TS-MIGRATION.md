# TypeScript w Jarvis OS — decyzja i plan migracji

**Data:** 2026-10-01
**Status:** akceptowany, w trakcie wdrożenia (item 4 planu stabilizacji)
**Dotyczy:** `C:\Users\majke\Desktop\jarvis-` (czysty HTML/CSS/JS, bez builda)

---

## TL;DR

Nie przepisujemy istniejących plików na TypeScript. Dodajemy **`tsconfig.json` + `tsc --noEmit` (lint)** i **JSDoc `@typedef`/`@type` w nowych plikach**. Pierwszy plik z typami to **`js/mcp-tool-schema.js`** — mały util budujący JSON Schema dla narzędzi MCP. Plik jest ładowany jak każdy inny `.js` z `index.html`.

Dzięki temu:
- IDE (VS Code) widzi typy dla wszystkich nowych plików (autocomplete, type errors)
- CI/pre-commit może uruchomić `npx tsc --noEmit` i wyłapać regresje typów
- Zero zmian w runtime (przeglądarka dalej dostaje czysty `.js`)
- Zero bundlerów (webpack/vite/esbuild) — zostajemy vanilla
- Service Worker `sw.js` i cache list nie muszą nic zmieniać poza dodaniem nowego pliku

---

## Dlaczego nie pełna migracja na `.ts`

Rozważaliśmy trzy ścieżki. Tabela:

| Ścieżka | Type safety | Zmiana w runtime | Build step | CI-friendly | Koszt utrzymania |
|---|---|---|---|---|---|
| **A. Wszystko na `.ts` + bundler (webpack/vite/esbuild)** | pełna | tak — bundluje i minifikuje | tak, wymagany | tak, po buildzie | wysoki (nowe narzędzia, watch mode, debug mapy) |
| **B. Wybrane pliki jako `.ts` + transpilacja (tsc → js)** | pełna | tak — wyjściowy `.js` obok `.ts` | tak, dla plików `.ts` | tak | średni (dwa pliki: `.ts` + `.js` per moduł, watch) |
| **C. Vanilla JS + JSDoc `@type` + `tsc --noEmit` (lint)** | dobra (IDE + lint) | brak | brak | tak, `tsc --noEmit` w CI | niski (zero nowego runtime) |

**Wybrana: C.** Realia projektu:

1. **Service Worker `sw.js` z hardcoded listą plików** (`SHELL`). Każdy nowy skrypt musi tam trafić ręcznie — pełna migracja na `.ts` wymagałaby albo zmiany architektury SW, albo podwójnych wpisów (`.ts` + `.js`).
2. **Zero builda, zero bundlera od początku.** Projekt z definicji jest vanilla JS PWA (`<script src="...">` w `index.html`, klasyczne IIFE, globalny `J`). Wdrożenie webpacka zmieniłoby kontrakt PWA (musi działać z GitHub Pages bez Node).
3. **Testy Node ładują pliki przez `vm.runInContext`** — `tests/harness.js` używa `fs.readFileSync` na konkretne nazwy. Migracja wymagałaby aktualizacji harness i każdego testu.
4. **Hermes/most MCP czyta `registry.tools()` i publikuje schema** — ten pipeline już działa. Type safety można dorzucić tam, gdzie ryzyko jest największe (nowe narzędzia, walidacja), nie wszędzie.
5. **CI istnieje** (`.github/workflows/ci.yml`: składnia, testy jednostkowe, test dymny). `tsc --noEmit` jest dostępne jako `npm run typecheck` (lokalnie; można dodać do CI osobnym krokiem).

---

## Co już wdrożono (item 4)

### Pliki

| Plik | Rola |
|---|---|
| `tsconfig.json` | Konfiguracja TS: `allowJs:true`, `checkJs:false`, `noEmit:true`, `target:ES2022`. Zero wpływu na runtime. |
| `package.json` (+ `package-lock.json`) | Dodane `typescript` jako `devDependency`. Służy tylko do `tsc`. `node_modules/` już był w `.gitignore`. |
| `js/global.d.ts` | Wspólne typy JSDoc: `Result`, `ResultCode`, `ArgSchema`, `ArgProp`, `CommandSpec`, `ToolFunction`, `ToolSchema`, `RunContext`, `JNamespace`. Plik NIE jest ładowany przez `index.html` — służy tylko IDE i `tsc`. |
| `js/mcp-tool-schema.js` | Pierwszy nowy plik z typami. Mały util budujący JSON Schema dla narzędzi MCP: `J.mcpSchema.{prop, schema, validate, build}`. Eksportowany jako `J.mcpSchema`, dostępny globalnie. |
| `index.html` | Dodany `<script src="js/mcp-tool-schema.js">` po `js/registry.js` (zależy od globalnego `J`). |
| `sw.js` | Bump CACHE: `v17 → v18`. Dodany `js/mcp-tool-schema.js` do `SHELL`. |
| `tests/unit/mcp-schema.test.js` | 13 testów dla nowego utilu. |

### Weryfikacja

- `npx tsc --noEmit` → 0 errors.
- `node --test tests/unit/mcp-schema.test.js` → 13/13 ✓.
- `node --test tests/unit/registry.test.js` → brak regresji (testy nadal działają, ich `FILES` nie zawiera `mcp-tool-schema.js`, więc nowy plik ich nie dotyka).
- `node --test tests/unit/bridge.test.js` → 4/5 ✓; 1 fail to pre-existujący problem `bridge/tools.json` jest nieaktualny względem registry (potwierdzone `git stash` baseline). Nie jest regresją z tej zmiany.
- `node --test tests/unit/spec.test.js` → ma fail `gen-spec.js --check` (docs/spec nieaktualne). Pre-existujący.

---

## Konwencje (do stosowania od teraz)

### 1. Każdy nowy `.js` w `js/` MUSI mieć JSDoc typy

Nie „może" — **musi** dla plików z nową logiką (nie dla 1-liniowych zmian). Wzorzec:

```js
'use strict';
(() => {

/** @typedef {import('./global.d.ts').Result} Result */

/**
 * Krótki opis.
 * @param {string} name
 * @returns {Result}
 */
function doSomething(name) { ... }

J.foo = { doSomething };
})();
```

### 2. Nowe typy trafiają do `js/global.d.ts`

Dodaj `@typedef` tam, a nie powtarzaj w każdym pliku. Dla typów specyficznych dla modułu — użyj `@typedef` na górze pliku.

### 3. Ścieżka do nowego pliku: `.js` + JSDoc, NIE `.ts`

Powody:
- Przeglądarka nie rozumie `.ts` bez transpilacji.
- `index.html` ładuje `<script src="js/X.js">` — bez zmiany konwencji.
- `sw.js` ma hardcoded listę — plik `.ts` musiałby być tam wpisany jako `.js`, a `.ts` nie byłby cache'owany.
- Testy Node ładują pliki po nazwie przez `vm` — `.js` jest OK.

### 4. Wewnętrzne helpery testuj, ale nie publikuj

Pierwszy plik (`mcp-tool-schema.js`) jest `J.mcpSchema` — globalnie dostępny jak inne moduły. Przyszłe utility też powinny być eksponowane przez `J.<namespace>` (np. `J.coach`, `J.notesValidator`).

### 5. Migracja istniejących plików: NIE TERAZ

Plan zakładał migrację istniejących plików na TS. **Odradzamy.** Powody:

- 8260 linii kodu w `js/*.js`. Migracja jednego pliku (`apps.js` — 1516 linii) to oddzielny, większy projekt.
- Nowe pliki z typami mają największy zwrot z type safety (najwięcej błędów na początku).
- Migracja istniejących plików może bezpiecznie poczekać, aż typecheck w CI wykaże, że to się opłaca.

---

## Kiedy rozważyć pełną migrację (ścieżka A albo B)

- Gdy pojawi się CI/CD z automatycznym buildem (np. GitHub Actions).
- Gdy będzie potrzeba SSR albo Node-runtime tego samego kodu (np. testy integracyjne z Playwright).
- Gdy liczba narzędzi MCP przekroczy 50 i ręczne pisanie JSON Schema stanie się błędomocne.
- Gdy nowi kontrybutorzy (nie-Michał) zaczną pisać kod — wtedy type safety jest barierą przed regresjami.

---

## Plan na następne kroki (NIE w tym zadaniu)

1. `npx tsc --noEmit` jako `npm run typecheck` — szybka walidacja lokalna.
2. Hook pre-commit (opcjonalnie): `tsc --noEmit` przed commitem w `js/`.
3. Drugi plik z typami — kandydat: `js/widget-spec.js` (walidator opisu widgetu) lub nowy util do walidacji `notes`.
4. `bridge/export-tools.js` (ten, który generuje `bridge/tools.json`) powinien czytać typy z `js/global.d.ts` zamiast pisać schema ręcznie — ale to wymaga, żeby więcej rejestru było otagowane.
5. Dzień później: rozważyć `checkJs:true` w jednym, wybranym module (np. `js/mcp-tool-schema.js` najpierw — sprawdzić, czy narzędzie daje wartościowe ostrzeżenia).

---

## Decyzja

**Ścieżka C: vanilla JS + JSDoc + `tsc --noEmit`.** Wdrożona w `tsconfig.json`, `js/global.d.ts`, `js/mcp-tool-schema.js`, `tests/unit/mcp-schema.test.js`. Load order w `index.html` i cache w `sw.js` zaktualizowane. `npm install typescript` dodało devDependency. Zero regresji w istniejących testach. Item 4 planu stabilizacji zamknięty.
