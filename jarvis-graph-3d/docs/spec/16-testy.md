# 16 · Testy i kryteria akceptacji

## 1. Co już jest (✅)

| rodzaj | gdzie | co sprawdza | uruchomienie |
|---|---|---|---|
| jednostkowe | `tests/unit/*.test.js` (23 pliki, ~330 przypadków — aktualną liczbę podaje `node --test`) | rejestr, parser PL, NLP czasu, pętla Hermesa na atrapie SSE, Jev (atrapa), router R1–R16, szybka ścieżka, cofanie, nawigacja, ochrona D9–D15, zbiór 447 zdań | `node --test "tests/unit/*.test.js"` |
| przeglądarka | `tests/e2e/smoke.js` (Playwright, Chromium) | start, 16 poleceń lokalnych, zgoda, trwałość w IndexedDB, brak wycieku kluczy, wygląd (białe przyciski, kolizje HUD przy 3 rozdzielczościach), Jev na atrapie (szybka ścieżka, wybór z listy, „Cofnij”, „no dobra”, panel ustawień) | `python3 -m http.server 8090 & node tests/e2e/smoke.js` |
| sonda Jeva | `tests/jev-probe.js` | trafność prawdziwego Jeva, krzywa zaufania, E1/E3, test kontraktowy | `OPENROUTER_API_KEY=… node tests/jev-probe.js` |
| CI | `.github/workflows/ci.yml`, `pages.yml`, `jev-contract.yml` | składnia, jednostkowe, e2e; publikacja tylko po testach; nocny kontrakt Jeva | automatycznie |
| specyfikacja | `tests/unit/spec.test.js` (8 przypadków) | katalogi aktualne, planowane polecenia spójne, przykłady widgetów zgodne ze schematem, zdania dla nowych poleceń, odnośniki w dokumentach | razem z jednostkowymi |

## 2. Zasady dla każdej nowej funkcji (definicja „gotowe”)

Funkcja jest gotowa, gdy:
1. **Polecenie** w rejestrze ma: schemat argumentów, ryzyko, poziom (test poziomów przechodzi), ≥ 3 przykłady PL, opis dla modelu, cofanie (jeśli A2).
2. **Test jednostkowy**: sukces, zły argument (`INVALID_ARGS`), brak obiektu (`NOT_FOUND`), niejednoznaczność (jeśli dotyczy), cofanie przywraca dokładnie stan sprzed.
3. **Zdania**: wpis w `tests/fixtures/corpus.js` (przeniesione z `corpus-nowe.js`) — parser trafia w zdania „local”, żadne zdanie z rozmowy/wstrzyknięć nie trafia na szybką ścieżkę (test ✅ `corpus.test.js`).
4. **UI**: przycisk/menu przechodzi przez rejestr (źródło `ui`), stan pusty/błąd/ładowanie wg [09](09-wyglad-stany.md) §1.
5. **Przeglądarka**: krok w `smoke.js` (albo osobny scenariusz) — bez błędów w konsoli.
6. **Dokumentacja**: status w [02](02-obiekty-akcje.md) zmieniony na ✅, katalog wygenerowany (`node tools/gen-spec.js`), wpis w README (jeśli widoczne dla użytkownika).
7. **Bezpieczeństwo**: lista z [15](15-bezpieczenstwo.md) §7.

## 3. Scenariusze przeglądarkowe do dopisania (per fala)

| fala | scenariusz |
|---|---|
| W1 | `app_view` dla każdej aplikacji → `state()`; „wróć/dalej” po zmianie widoku; `wm_reopen` po zamknięciu 3 okien; przesuwanie słowami i klawiaturą; zmiana rozmiaru z lewej krawędzi; przypięcie nad nowym oknem; „Cofnij” po kafelkach; UI Harmonogramu (odhacz/usuń) przez rejestr — wpis w Process Log |
| W2 | paleta `search_all` z 1 000 notatek (czas); adres `#go=…`; tryby `clean`/`present` (co ukryte); wątki czatu (przełączenie zachowuje historię); ustawienia: skala 120 % bez poziomego przewijania; skróty — zmiana i konflikt; druga karta przeglądarki → tryb podglądu |
| W3 | kosz notatek (usuń → przywróć); wersje (zmiana przez Jarvisa → przywróć); powtarzanie zadań (odhacz → następne); eksport → import ICS bez duplikatów; kilka minutników; lista obserwowanych; okno Pliki na atrapie FSA |
| W4 | 5 widgetów z [widget-przyklady.json](widget-przyklady.json) na atrapie Hermesa; odrzucenie złego opisu; widget po odświeżeniu strony; odświeżanie zatrzymane przy ukrytej karcie; rutyna czasowa pominięta → pytanie po otwarciu; pauza planu |
| W5 | `fx_level` off → brak animacji (computed style); dźwięk wg kanałów |

## 4. Testy ręczne (10 minut, przed każdym wydaniem)

1. Otwórz stronę na czysto (tryb incognito) — start, onboarding, brak błędów.
2. „otwórz notatnik”, „zanotuj: test”, „dopisz do notatki test: dwa”, „cofnij” — notatka wraca do „test”.
3. „przypomnij mi za 1 minutę test” — powiadomienie po minucie (z dźwiękiem).
4. Przeciągnij okno do lewej krawędzi — przyciąga; `Alt W` przełącza.
5. `Ctrl K` → „pogoda” → Enter.
6. Mikrofon: „Jarvis, która godzina” (Chrome).
7. Ustawienia → Jev → zmień prywatność na P0 → odśwież stronę → wartość zostaje.
8. Eksport danych → Reset → Import → dane wracają.
9. Wyłącz internet → „pogoda” → czytelny komunikat; włącz → działa.
10. Telefon (albo 390 × 844 w narzędziach) — okno na cały ekran, „Wróć”.

## 5. Miary jakości (cele)

| miara | cel | gdzie mierzymy |
|---|---|---|
| trafność parsera na zdaniach „local” | ≥ 97 % ✅ | `corpus.test.js` |
| zdania z rozmowy/wstrzyknięć na szybkiej ścieżce | 0 ✅ | `corpus.test.js` |
| trafność Jeva (prawdziwy) | ≥ 92 % | sonda (wymaga klucza) |
| czas polecenia na szybkiej ścieżce | < 50 ms | e2e (pomiar) 🆕 |
| czas decyzji Jeva (p95) | < 800 ms | dziennik Jeva |
| wyniki palety dla 1 000 notatek | < 50 ms | e2e 🆕 |
| FPS przy 10 oknach i kartach HUD | ≥ 50 (standard) | monitor + e2e 🆕 |
| błędy w konsoli w e2e | 0 ✅ | smoke |
