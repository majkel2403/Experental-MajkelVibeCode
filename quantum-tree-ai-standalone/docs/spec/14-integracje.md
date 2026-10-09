# 14 · Integracje (usługi zewnętrzne)

Każda usługa ma opisane: **po co**, **adres**, **podłączenie**, **test**, **stan** (gdzie widać), **awaria**, **offline**, **dane, które wychodzą**, **stan wdrożenia**.

## 1. Lista

| usługa | po co | adres | klucz | dane wychodzące | awaria / offline | stan |
|---|---|---|---|---|---|---|
| **Hermes Desktop** (profil `jarvis-desktop`, domyślnie) | mózg: rozmowa, plan, narzędzia MCP pulpitu | przez most: `http://127.0.0.1:8651/bridge/v1` → gateway `:8643` | token mostu (klucz gatewaya zostaje w moście, ADR 0003) | historia rozmowy, kontekst pulpitu, wyniki narzędzi | ✅ parser lokalny; 🆕 1 ponowienie | ✅ |
| **Hermes Agent** (bez mostu) | mózg: rozmowa, plan, narzędzia | `http://localhost:8642/v1` (OpenAI-compat, SSE) | opcjonalny (`hermesKey`) | historia rozmowy, kontekst pulpitu, wyniki narzędzi | ✅ parser lokalny; 🆕 1 ponowienie | ✅ |
| **Nous Portal** | Hermes w chmurze | `inference-api.nousresearch.com` | `hermesKey` | jw. | jw. | ✅ |
| **OpenRouter — Hermes** | Hermes 4 w chmurze | `openrouter.ai/api/v1` | `openrouterKey` | jw. | jw. | ✅ |
| **OpenRouter — Jev** | sędzia decyzji | `openrouter.ai/api/v1/systemone` | `jevKey` / `openrouterKey` | zdanie + stan wg poziomu P0–P2 | ✅ bezpiecznik, budżet | ✅ |
| **Open-Meteo** | pogoda, geokodowanie miast | `api.open-meteo.com`, `geocoding-api.open-meteo.com` | — | nazwa miasta / współrzędne | ✅ komunikat; 🆕 ostatnie dane | ✅ |
| **Nominatim (OSM)** | nazwa miejsca z geolokalizacji | `nominatim.openstreetmap.org` | — | współrzędne (tylko po kliknięciu „Moja lokalizacja”) | nazwa „Moja lokalizacja” | ✅ |
| **Binance** | kursy na żywo (WebSocket) | `wss://stream.binance.com:9443` | — | lista par | ✅ przejście na CoinGecko | ✅ |
| **CoinGecko** | kursy co 60 s, 🆕 wyszukiwanie walut | `api.coingecko.com` | — | lista walut | ✅ symulacja z oznaczeniem | ✅ |
| **Strony WWW** (`open_url`, `web_search`) | otwieranie stron i wyszukiwania w nowej karcie | lista zaufanych (`SITES` + `TRUSTED` w `commands.js`) | — | adres (przeglądarka otwiera kartę) | — | ✅ obce adresy wymagają zgody |
| **File System Access** | folder roboczy | API przeglądarki | zgoda przeglądarki | nic nie wychodzi | ✅ „Odśwież dostęp”; 🆕 tryb bez FSA | ✅ Chrome/Edge |
| **Web Speech** | mowa i rozpoznawanie | API przeglądarki (Chrome wysyła dźwięk do Google) | — | ⚠ dźwięk do usługi przeglądarki | ✅ komunikat | ✅ |
| **Powiadomienia systemowe** | powiadomienia poza kartą | Notification API | zgoda | treść powiadomienia do systemu | ✅ tylko w centrum | ✅ (🆕 prośba o zgodę z wyjaśnieniem, nie przy pierwszym zadaniu) |
| **Wake Lock** | ekran nie gaśnie przy minutniku/czuwaniu | API przeglądarki | — | — | — | ✅ |
| **ICS** | import/eksport kalendarza | plik | — | — | — | ✅ import / 🆕 eksport |

## 2. Podłączanie i testy

✅ Ustawienia → OpenRouter / Hermes / Jev: „Zapisz i testuj” / „Połącz i testuj” wykonują **prawdziwe** wywołanie i pokazują wynik (model, czas, koszt).

🆕 W2 — Ustawienia → O programie → **Testy diagnostyczne** (jednym przyciskiem): internet, Hermes, Jev, Open-Meteo, CoinGecko, Binance, mikrofon, mowa, zapis localStorage i IndexedDB, folder roboczy. Wynik jako lista ✓/✗ z jednozdaniowym wyjaśnieniem i „Kopiuj raport” (bez kluczy).

## 3. Stan usług — gdzie widać

- Topbar: kropka sieci (✅ ok / ostrzeżenie / offline), kropka mózgu przy czacie (✅ lokalny / Hermes up/down).
- Karta HUD „Status systemu” (✅).
- 🆕 W2: najechanie na kropkę = dymek z listą usług i ich stanem (Hermes: działa 240 ms · Jev: wstrzymany do 12:40 (3 błędy) · Pogoda: dane z 8:40).

## 4. Zasady dla nowych integracji

1. Nowa usługa = nowe polecenie(-a) w rejestrze (schemat, ryzyko, przykłady, testy z atrapą), nigdy wywołanie „z boku”.
2. Klucz tylko w Ustawieniach (lokalnie), nigdy w eksporcie, nigdy do modelu (`settings_get` ukrywa ✅).
3. Treść z usługi = dane obce (`external: true` → heurystyka wstrzyknięć + ostrzeżenie dla modelu).
4. Stan i awaria widoczne w §3, test w §2.
5. Wpis w tej tabeli i w [15-bezpieczenstwo.md](15-bezpieczenstwo.md) §5 (co wychodzi).

## 5. Czego nie integrujemy (D-07)

Giełdy z handlem, bankowość, płatności, SMS, e-mail (wysyłanie), komunikatory, Dysk Google / OneDrive (synchronizacja), kalendarze online (synchronizacja), kamery, sterowanie komputerem poza przeglądarką. Każda zmiana tej listy wymaga osobnego dokumentu z oceną ryzyka i zgody właściciela.
