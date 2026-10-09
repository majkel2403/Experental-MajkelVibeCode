/* Skopiuj do config.local.js (plik jest ignorowany przez git) i uzupełnij. Działa tylko lokalnie — na GitHub Pages plik jest pusty.
   Alternatywa bez pliku: jednorazowy adres index.html#jevKey=sk-or-…&jevOn=1
   (po znaku # — przeglądarka nie wysyła tej części do serwera; dane są zapisywane w przeglądarce i usuwane z paska adresu).
   Nie używaj „?” zamiast „#”: taki adres trafia do serwera, na którym leży strona. */
window.JARVIS_CONFIG = {
  jevKey: 'sk-or-v1-…',        // klucz OpenRouter (openrouter.ai/keys) — sędzia Jev
  jevOn: true,
  // Hermes Desktop konfiguruje się sam przez most (bridgeOn: true) — klucza gatewaya NIE wpisuj tutaj ani w przeglądarce.
  // Własny serwer bez mostu: hermesUrl: 'http://localhost:8642/v1', hermesModel: 'hermes-agent', hermesKey: '…',
  // city: 'Wrocław', user: 'JD'
};
