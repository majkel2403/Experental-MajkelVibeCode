# ADR 0003 — Klucz gatewaya Hermesa nie trafia do przeglądarki

**Status:** przyjęta 2026-10-04 · **Kontekst:** most wydawał karcie `API_SERVER_KEY` (`/bridge/hermes`), karta trzymała go
w `localStorage`, a `config.local.js` (ładowany jako skrypt) też go zawierał. Od 2026-10-03 profil ma pełne narzędzia
(terminal, pliki, kod), więc każdy XSS w karcie oznaczał dostęp do komputera; strona nie miała CSP.

**Decyzja:** karta rozmawia z Hermesem przez most — `/bridge/v1/chat/completions` i `/bridge/v1/models` (tylko lokalne Origin
+ token mostu); most dokłada klucz po swojej stronie i przekazuje strumień SSE bez buforowania. `/bridge/hermes` zwraca adres
pośrednika bez klucza; karta sama przechodzi na pośrednika i kasuje zapisany klucz. `index.html` ma Content-Security-Policy
(skrypty wyłącznie z plików strony).

**Konsekwencje:** XSS w karcie nie daje klucza do agenta; jedna droga uwierzytelniania karty (token mostu). Własne serwery bez
mostu (Ollama, Nous Portal, OpenRouter) dalej działają z kluczem w przeglądarce — to świadomy wybór użytkownika.
