# Jarvis OS — plan rozwoju, poprawek i ulepszeń

> **Dokument historyczny** (plan z 2026-09-29, gałąź `claude/neon-dashboard`, scalona do main). Liczby, nazwy gałęzi i stany
> poniżej są nieaktualne — aktualny stan: [README](../../README.md), [specyfikacja](../spec/README.md), [decyzje (ADR)](../adr/README.md).

Dokument opisuje stan projektu po przebudowie wyglądu (gałąź `claude/neon-dashboard`), diagnozę braków na podstawie kodu oraz plan zmian w kolejności, która buduje fundament pod resztę. Odniesienia do plików wskazują, gdzie dana rzecz dziś jest (lub jej nie ma).

## Stan realizacji (gałąź `claude/neon-dashboard`)

Zrealizowane w kodzie i pokryte testami (`tests/unit`, `tests/e2e`):

- **Faza 0** — poprawki 7.1–7.15 (zaległe przypomnienia zbierane po powrocie, link w czacie gdy przeglądarka blokuje kartę, koercja typów, historia zachowana po błędzie, jawne `show` w narzędziach, kolejka mowy, streszczenie kroczące, cichy tryb głosowy, IndexedDB, Wake Lock, powiadomienie o nowej wersji SW, `aria-label` w doku, widgety odporne na Esc/„zamknij wszystko”), testy jednostkowe i dymny w Chromium, CI (stan liczby testów: patrz sekcja „Audyt i naprawy” niżej).
- **Faza 1** — Command Registry (`js/registry.js`, `js/commands.js`), narzędzia/paleta/menu/„co potrafisz” z jednego rejestru, koperta wyniku z kodami, Context Packet z diffem (`js/context.js`), reguły groundingu w prompcie.
- **Faza 2** — 58 narzędzi (CRUD notatek, zadań, okien, widgetów, minutnika, ustawień, terminala, rynku, pogody, schowka, plików, pamięci, UI), uprawnienia z potwierdzeniem Tak/Nie/Zawsze (chip przy Core, czat, głos), `ui_highlight / ui_narrate / ui_ask / ui_toast`.
- **Faza 3** — historia i czat w IndexedDB, streszczenie kroczące, profil (`memory_*`), budżety tury → `PAUSED` z pytaniem, `AbortSignal` do narzędzi.
- **Faza 4** — kolejka sygnałów, tryb cichy/aktywny z limitem i ciszą nocną, rutyny (briefing, podsumowanie dnia) z planistą uwzględniającym widoczność karty, `<plan>` w Process Log i karcie „Logika”, nowe stany maszyny.
- **Faza 5** — czuwanie ze słowem „Jarvis”, kolejka mowy z priorytetami, barge-in, odpowiedzi głosem na pytania, cichy tryb głosowy.
- **Faza 6** — File System Access (lista/odczyt/zapis/eksport notatek), import `.ics`, natywne `tool_calls` (Ollama/vLLM) z autodetekcją, lista narzędzi gatewaya w pakiecie, alerty kursów.
- **Faza 7 (część)** — pauza rysowania w tle, adaptacyjna jakość, backoff pingu, pauza WebSocketu, centrum powiadomień, onboarding, paleta z dopasowaniem rozmytym i „Ostatnie”, przyciąganie i kafelkowanie okien, układy, klikalne karty HUD.

- **Sędzia Jev** (`js/judge.js`) — model decyzyjny TypeSafe przez OpenRouter jako trzecia warstwa obok rejestru i Hermesa: fan-out intencja/ryzyko/dwuznaczność/deixis w jednym wywołaniu, trasy wykonaj/zapytaj/Hermes według progów, dynamiczne potwierdzenia, rozstrzyganie kandydatów w `findNote/findTask`, weryfikacja odpowiedzi (stan `VERIFYING`), pilność sygnałów w trybie aktywnym, test w Ustawieniach, sonda `tests/jev-probe.js` na polskich wypowiedziach, testy z zamockowanym API.

**Audyt i naprawy (29.09.2026)** — zrealizowane i pokryte testami (124 testy jednostkowe + dymny w Chromium):

- `settings_get` nie zwraca modelowi żadnych kluczy API (wcześniej wyciekały `jevKey` i `openrouterKey`).
- Polecenia **głosowe** dostają pytanie Tak/Nie przy działaniach ryzykownych (usuwanie, zamykanie); polecenia wpisane ręcznie działają jak dotąd bez pytania.
- Zapis danych: historia Process Log przeniesiona do IndexedDB (główny klucz localStorage jest lekki), przepełnienie pamięci nie jest ciche (odzysk miejsca + ostrzeżenie), stare dane są migrowane bez utraty.
- Konfiguracja z adresu: zalecany fragment `#` (nie trafia do serwera); `?` nadal działa, ale pokazuje ostrzeżenie.
- Historia rozmowy jest przycinana tylko na granicy wymiany (koniec z błędem 400 od „osieroconej” odpowiedzi narzędzia); streszczenie nie wraca po „nowej rozmowie”.
- Prompt systemowy jest stały (godzina i streszczenie jadą w wiadomości użytkownika) — serwer może go zapamiętać między turami.
- Tryb prywatny sędziego Jev domyślnie włączony dla nowych użytkowników.
- **Jev v2 (wdrożone, branch `claude/jev-wdrozenie`)** — bezpiecznik i budżet, poziomy prywatności P0–P2, router R1–R14, szybka ścieżka parsera, wartości z listy, dopytywanie brakujących argumentów, stos „Cofnij”, historia „wróć”, nawigacja (`schedule_day`, `settings_open`), strażnik wywołań Hermesa, wykrywanie wstrzykniętych instrukcji, ocena poufności pamięci, odpowiedzi „no dobra”, ranking powiadomień, adaptacyjne progi, panel i dziennik, zbiór 447 zdań, sonda z raportem i test kontraktowy. **Niezmierzone:** trafność prawdziwego Jeva i progi (0,80 / 0,92) — hipotezy do potwierdzenia sondą z kluczem (faza F1).
- Wdrożenie na Pages czeka na testy jednostkowe i publikuje tylko pliki aplikacji; service worker podmienia na `index.html` wyłącznie nawigację; ping Hermesa tylko po zmianie jego konfiguracji; usunięty martwy kod.
- Wygląd: koniec z białymi kafelkami dni w Harmonogramie (i ciemny schemat kolorów dla natywnych kontrolek), kontrast przygaszonych napisów z 3,8:1 do 5,8:1, żaden napis poniżej 10 px (poza wąską kolumną telemetrii), karta HUD nie skacze po najechaniu, scena HUD skaluje się tak, żeby karty nie chowały się pod paskiem zadania i dokiem (sprawdzone od 1024×600 do 2560×1300), najwyżej dwa powiadomienia naraz (na telefonie nad dokiem), chipy Process Log i Czat na telefonie to same ikony, systemowe „ogranicz ruch” zatrzymuje też Core, jezioro i cząsteczki, brak przykładowych zadań o stałych godzinach (uruchomiona wieczorem aplikacja od razu ogłaszała „zaległe”), widoczny fokus w polu Terminala.
- Nowe testy: pętla rozmowy z Hermesem na atrapie serwera (oba formaty narzędzi, awaria sieci, zły JSON), migracja historii, przepełnienie zapisu.

Nie zrealizowane (świadomie odłożone): i18n PL/EN, motyw jasny i wysokiego kontrastu, wirtualne pulpity, RSS i kursy walut, pełny tryb mobilny z dolnym paskiem, audyt a11y (pułapka fokusu w palecie). Wymagają decyzji z sekcji 11 albo osobnej iteracji.

---

Spis treści

1. [Stan obecny — diagnoza](#1-stan-obecny--diagnoza)
2. [Wizja: Jarvis = powłoka, Hermes = mózg](#2-wizja-jarvis--powłoka-hermes--mózg)
3. [Czego brakuje, a jest istotne](#3-czego-brakuje-a-jest-istotne)
4. [Protokół Jarvis ↔ Hermes — wzajemne zrozumienie](#4-protokół-jarvis--hermes--wzajemne-zrozumienie)
5. [Zakres sterowania i nawigacji po całym systemie](#5-zakres-sterowania-i-nawigacji-po-całym-systemie)
6. [Częstotliwości, budżety i pętle](#6-częstotliwości-budżety-i-pętle)
7. [Poprawki błędów i długu technicznego](#7-poprawki-błędów-i-długu-technicznego)
8. [UI/UX — kolejne kroki po redesignie](#8-uiux--kolejne-kroki-po-redesignie)
9. [Harmonogram — fazy, priorytety, kryteria odbioru](#9-harmonogram--fazy-priorytety-kryteria-odbioru)
10. [Metryki sukcesu](#10-metryki-sukcesu)
11. [Decyzje do podjęcia](#11-decyzje-do-podjęcia)
12. [Załącznik: proponowane schematy](#12-załącznik-proponowane-schematy)

---

## 1. Stan obecny — diagnoza

### 1.1 Architektura (jak jest)

```
użytkownik ──głos/tekst──▶ J.brain.handle (js/ai.js)
                              │
                ┌─────────────┴─────────────┐
                ▼                           ▼
        silnik lokalny (regexy)      Hermes (SSE /chat/completions)
                │                           │  <tool_call>{name,arguments}</tool_call>
                └────────────┬──────────────┘
                             ▼
                 J.actions (15 akcji) ──▶ J.wm / J.notes / J.tasks / J.timer / …
                             │
                             ▼
              J.ev (Event Bus) ──▶ J.engine (maszyna stanów) ──▶ Core / HUD / dashboard
                             │
                             ▼
                 J.proc (Process Log) ──▶ historia (localStorage)
```

Mocne strony, na których warto budować:

- **Event Bus + maszyna stanów** (`js/events.js`) — animacja wynika wyłącznie ze zdarzeń. To jest właściwy fundament pod obserwowalność i pod „rozumienie” stanu przez model.
- **Process Log** (`js/process.js`) — każde zapytanie, myśl, narzędzie i wynik są rejestrowane; historia z replayem.
- **Jedna warstwa akcji** (`J.actions` w `js/ai.js`) używana i przez silnik lokalny, i przez Hermesa — dobry zalążek „jednego źródła prawdy”.
- **Fallback** Hermes → lokalny, realny ping statusu, obsługa CORS/401/404/429.
- Zero zależności, zero builda, PWA, GitHub Pages.

### 1.2 Kluczowe ograniczenia widoczne w kodzie

| Obszar | Dziś | Skutek |
|---|---|---|
| Kontekst dla modelu | `SYSTEM()` w `ai.js` daje tylko datę, inicjały, miasto i listę narzędzi. Stan środowiska model pozna wyłącznie wołając `get_status`. | Hermes „nie widzi” pulpitu: nie wie, co jest otwarte, jakie są notatki, co się wydarzyło. Odpowiada w ciemno albo marnuje turę. |
| Powierzchnia narzędzi | 15 akcji, prawie wyłącznie **zapisujące** (open, create, add, set). Brak odczytu i modyfikacji: listy notatek, treści notatki, edycji, usuwania, oznaczania zadań, listy okien, sterowania oknami, widgetami, terminalem, ustawieniami. | Model nie potrafi wykonać poleceń „dopisz do notatki o zakupach”, „odhacz spotkanie”, „przenieś okno na lewo”, „usuń ten widget”. |
| Pamięć | `history` (RAM, max 30 wiadomości, kasowana po odświeżeniu). Brak pamięci długoterminowej po stronie Jarvisa; pamięć Hermes Agent istnieje, ale Jarvis o niej nic nie wie. | Każde odświeżenie strony to amnezja. Brak profilu użytkownika, brak „wczoraj prosiłeś o…”. |
| Rozumienie wielokrokowe | Silnik lokalny to jedna reguła = jedna akcja. Hermes wykonuje narzędzia sekwencyjnie po zakończeniu strumienia; `MAX_TURNS = 6` ucina bez informowania modelu. | Polecenia złożone offline nie działają („otwórz notatnik i ustaw minutnik”); długie zadania online urywają się w połowie. |
| Proaktywność | Jarvis wyłącznie reaguje. Przypomnienia, minutnik i rynek nie mają drogi do modelu. | Brak briefingów, alertów, „skończył się minutnik, wracamy do zadania?”. |
| Uprawnienia | Każde narzędzie wykonuje się natychmiast, także `close_app('all')`, `open_url` na dowolny adres, `add_shortcut`. | Model może zamknąć wszystko albo otworzyć dowolną stronę bez pytania. |
| Walidacja | `exec()` sprawdza tylko `required` i `enum`. Brak typów i koercji (`seconds: "300"`). | Cichy błąd `Nieprawidłowy czas` zamiast naprawy. |
| Głos | Jednorazowe rozpoznanie (`continuous=false`), brak słowa wybudzającego, brak kolejki mowy (`synth.cancel()` przy każdym `speak`). | Rozmowa głosowa wymaga kliknięcia za każdym razem; komunikaty nadpisują się. |
| Pętle czasowe | Stałe interwały niezależne od widoczności karty (`hud.frame`, `orbDraw`, `flowDraw` co klatkę; ping 45 s; zadania 15 s). Przypomnienie zaległe > 2 min jest **pomijane** (`tasks.check`). | Zbędne obciążenie w tle; zgubione przypomnienia po powrocie do karty. |
| Persystencja | Jeden klucz localStorage (`jarvis-os:v2`), limit ~5 MB, migracja tylko pola `look`. Czat nie jest zapisywany. | Historia Process Log i widgety rosną w jednym blobie; brak wersjonowania danych. |
| Testy | Brak. CI = `node --check`. | Regresje w parserach (`local`, `parseCalls`, `J.calc`) niewykrywalne. |
| Język | Wszystko po polsku na sztywno (regexy, etykiety, prompt). | Brak ścieżki do EN. |

---

## 2. Wizja: Jarvis = powłoka, Hermes = mózg

**Jarvis OS** jest środowiskiem (okna, dane, zdarzenia, głos, wizualizacja) i **gwarantem prawdy o stanie**. **Hermes** jest rozumowaniem, wiedzą, narzędziami serwerowymi (sieć, pliki, terminal, pamięć). „Wzajemne zrozumienie” oznacza cztery rzeczy, które dziś istnieją tylko częściowo:

1. **Wspólny model stanu** — model dostaje przy każdej turze zwięzły, ustrukturyzowany obraz środowiska (Context Packet), a nie tylko datę.
2. **Wspólny słownik możliwości** — jeden rejestr poleceń (Command Registry), z którego generowane są: narzędzia dla Hermesa, reguły silnika lokalnego, paleta `Ctrl+K`, menu kontekstowe i skróty. Jeśli coś da się kliknąć, da się to też powiedzieć i zlecić modelowi.
3. **Ustrukturyzowane wyniki** — każde narzędzie zwraca kopertę `{ok, code, data, text, ui}`; `data` dla modelu, `text` do mowy, `ui` dla HUD.
4. **Dwukierunkowość** — Jarvis również *mówi* do Hermesa: sygnały środowiska (minutnik, przypomnienie, alert rynkowy, błąd), na które model może zareagować.

Zasada projektu pozostaje: **nic „na niby”**. Każdy element HUD, karty, plan i podsumowanie wynika z realnego zdarzenia.

---

## 3. Czego brakuje, a jest istotne

Poniżej rzeczy, których dziś nie ma, uszeregowane od najbardziej fundamentalnych.

### 3.1 Context Packet (obraz środowiska w każdej turze) — **krytyczne**

Bez tego model zgaduje. Do systemowego promptu (albo jako pierwsza wiadomość `user` z etykietą) dołączany jest zwięzły JSON (cel: < 600 tokenów):

- okna: otwarte, sfokusowane, zminimalizowane; aktywna aplikacja i jej stan (np. wybrana notatka, dzień w harmonogramie);
- widgety na pulpicie (id, typ, tytuł, skrót treści);
- notatki: liczba + tytuły ostatnich 10;
- zadania: dzisiejsze z godziną i statusem, najbliższe jutro;
- minutnik, tryb skupienia, motyw, tapeta, głośność, mowa;
- połączenie: online/offline, status Hermesa, narzędzia serwerowe (jeśli gateway je zgłasza);
- ostatnie zadanie (tytuł, status, 1 zdanie wyniku) i **ostatnie 5 zdarzeń** z Event Busa;
- czas, lokalizacja, język.

Pakiet wysyłany jako **diff** względem poprzedniej tury (sekcje niezmienione pomijane), pełny co N tur lub po resecie. Schemat w [załączniku](#121-context-packet).

### 3.2 Command Registry (jedno źródło prawdy o możliwościach) — **krytyczne**

Każda aplikacja rejestruje swoje polecenia (`J.apps.notes.commands = [...]`) z: identyfikatorem (`notes.search`), etykietą PL/EN, schematem argumentów, poziomem ryzyka, flagą `idempotent`, `reads/writes`, przykładami wypowiedzi. Z rejestru automatycznie powstają:

- `TOOLS` dla Hermesa (dziś ręczna lista w `ai.js`),
- reguły silnika lokalnego (dopasowanie po przykładach i synonimach, nie po ręcznych regexach),
- pozycje palety, menu kontekstowego i skrótów klawiszowych,
- dokumentacja „co potrafisz” generowana z rejestru.

Skutek: dodanie polecenia w jednym miejscu udostępnia je wszędzie; model i człowiek widzą ten sam zbiór.

### 3.3 Narzędzia odczytu i modyfikacji (CRUD) — **krytyczne**

Minimalny zestaw brakujących narzędzi:

| Domena | Narzędzia |
|---|---|
| Notatki | `notes.list`, `notes.read`, `notes.search`, `notes.append`, `notes.update`, `notes.delete` |
| Zadania | `tasks.list(range)`, `tasks.complete`, `tasks.update`, `tasks.remove`, `tasks.snooze`, `tasks.add` z czasem względnym („za 20 min”, „w piątek”) |
| Okna | `wm.list`, `wm.focus`, `wm.minimize/restore`, `wm.move/resize`, `wm.tile(layout)`, `wm.arrange(preset)` |
| Widgety | `widgets.list`, `widgets.read`, `widgets.update`, `widgets.remove`, `widgets.move` |
| Minutnik | `timer.stop`, `timer.extend`, `timer.status`, stoper |
| Ustawienia | `settings.get`, `settings.set(key, value)` z listą dozwolonych kluczy |
| Terminal | `terminal.run(cmd)` — wbudowane komendy Jarvisa (nie shell), z wynikiem tekstowym |
| Rynek | `market.watch(sym, threshold)`, `market.get(sym)` |
| Pogoda | `weather.forecast(days, city)` osobno od `get_weather` |
| Schowek | `clipboard.write`, `clipboard.read` (za zgodą) |
| Interfejs | `ui.highlight(target)`, `ui.narrate(text)`, `ui.toast`, `ui.open_palette(query)` |
| Pamięć | `memory.remember(fact, scope)`, `memory.recall(query)`, `memory.forget` |

Każde narzędzie zapisujące ma parametr `show: boolean` zamiast ubocznego otwierania okna (dziś `get_crypto_prices` i `create_note` same otwierają okna — to powinno być jawne).

### 3.4 Model uprawnień i potwierdzeń — **wysokie**

Trzy poziomy ryzyka w rejestrze: `safe` (odczyt, otwarcie okna), `confirm` (usuwanie, zamknięcie wszystkiego, zmiana ustawień Hermesa, otwarcie URL spoza listy), `blocked` (reset danych, usunięcie klucza). Poziom `confirm` = chip w czacie i na Core z „Tak / Nie” (klik lub głos), z opcją „zawsze pozwalaj dla tego narzędzia”. Model dostaje `tool_response` z `code: "NEEDS_CONFIRMATION"` i czeka; timeout 60 s = odmowa.

### 3.5 Pamięć i ciągłość — **wysokie**

- Zapis rozmowy (ostatnie 50 wiadomości) i historii tury w IndexedDB; po odświeżeniu czat wraca.
- **Rolling summary**: gdy historia przekracza budżet, Jarvis prosi Hermesa o 5-zdaniowe streszczenie i zastępuje nim starsze wiadomości.
- Profil użytkownika (fakty jawnie zapamiętane: imię, miasto, preferencje, stałe rutyny) wstrzykiwany do Context Packet. Źródło prawdy dla środowiska = Jarvis; pamięć epizodyczna = Hermes Agent (nagłówek `X-Hermes-Session-Key` już jest). Narzędzia `memory.*` zapisują po obu stronach, gdy dostępne.

### 3.6 Sygnały środowiska → model (proaktywność) — **wysokie**

Zdarzenia, które dziś kończą się toastem, trafiają do **kolejki sygnałów**: `timer.ended`, `task.due`, `task.overdue`, `market.threshold`, `network.changed`, `hermes.status`, `task.failed`. Polityka:

- **cicha** (domyślna): sygnały dopisywane do Context Packet następnej tury („od ostatniej rozmowy: minutnik Pomodoro się skończył, przypomnienie 14:00 minęło”);
- **aktywna** (opt-in w Ustawieniach, z limitem N/godz.): Jarvis sam uruchamia turę z sygnałem jako wejściem („Skończył się Pomodoro. Zrobić przerwę 5 min czy kolejny blok?”) — z kartą HUD „Inicjatywa” i możliwością wyciszenia.
- **rutyny**: poranny briefing (pogoda, zadania, rynek, zaległości) o zadanej godzinie; podsumowanie dnia; cotygodniowy przegląd notatek. Definiowane w rejestrze jak polecenia, uruchamiane przez planista z uwzględnieniem widoczności karty i zgody użytkownika.

### 3.7 Planowanie zadań przez model (widoczne w HUD) — **średnie**

Dla zadań > 1 narzędzia model najpierw deklaruje plan (`<plan>` z krokami). Jarvis pokazuje go jako listę w Process Log i w karcie „Logika i decyzje”; kroki odhaczają się wraz z `tool.completed`. Odchylenie od planu (dodatkowe narzędzie) jest rejestrowane. To realizuje zarezerwowane stany `VERIFYING / APPROVAL_REQUIRED` z `events.js`.

### 3.8 Głos ciągły — **średnie**

- Tryb „nasłuchuj” (`continuous=true`) ze słowem wybudzającym („Jarvis”) rozpoznawanym lokalnie po transkrypcji; wskaźnik na Core i w pasku trybu.
- Kolejka mowy (`J.voice.queue`) zamiast `cancel()`; priorytety (alarm > odpowiedź > toast); *barge-in*: wypowiedź użytkownika przerywa mowę.
- Krótkie potwierdzenia dźwiękowe zamiast pełnych zdań przy prostych akcjach.

### 3.9 Pliki i dane zewnętrzne — **średnie**

- File System Access API (Chrome/Edge): folder roboczy Jarvisa (notatki jako `.md`, eksporty, wyniki zadań). Narzędzia `files.list/read/write` po stronie przeglądarki; w Firefox fallback na import/eksport.
- Import kalendarza `.ics` do Harmonogramu; subskrypcja RSS jako widget; kursy walut obok krypto.

### 3.10 Testy, jakość, bezpieczeństwo — **wysokie**

- Testy jednostkowe czystej logiki bez DOM: `J.calc`, `local()` (tabela: wypowiedź → oczekiwane narzędzie + argumenty), `parseCalls`, `visible`, reduktor `events.js`, koercja schematów. Node + `node:test`, bez frameworków; w CI obok `node --check`.
- Testy dymne w Playwright: boot → polecenie lokalne → okno otwarte → HUD pokazał karty (skrypt już powstał przy redesignie w scratchpadzie; wystarczy przenieść do `tests/`).
- ESLint (globalny jest w środowisku) z minimalną konfiguracją.
- `Content-Security-Policy` w meta (self + Google Fonts + wymienione API), sanityzacja jest (`esc`), ale warto dodać allow-listę domen dla `open_url` z pytaniem o inne.

---

## 4. Protokół Jarvis ↔ Hermes — wzajemne zrozumienie

### 4.1 Warstwy protokołu

```
 warstwa 4  INTENCJE:   plan · ask_user · confirm · narrate · highlight · remember
 warstwa 3  NARZĘDZIA:  manifest z rejestru (nazwa, schemat, ryzyko, idempotencja, przykłady)
 warstwa 2  STAN:       Context Packet (diff) + sygnały środowiska od ostatniej tury
 warstwa 1  TRANSPORT:  OpenAI-compatible SSE; <tool_call> (Hermes) LUB natywne tool_calls (Ollama/vLLM)
```

### 4.2 Transport — dwa formaty wywołań

Dziś obsługiwany jest tylko tekstowy `<tool_call>`. Ollama, LM Studio i vLLM z modelami Hermes 3/4 obsługują też natywne `tools` + `delta.tool_calls`. Plan:

- w presecie dostawcy pole `toolFormat: 'hermes-xml' | 'openai'`; autodetekcja przy „Połącz i testuj” (wysłać jedno narzędzie testowe i sprawdzić, w jakiej formie wróciło);
- parser strumienia rozpoznający **oba** formaty; `<tool_call>` parsowany **w trakcie** strumienia (gdy zamknie się znacznik), żeby narzędzia bezpieczne (odczyt) ruszały równolegle z generowaniem tekstu.

### 4.3 Stan — Context Packet

Patrz [12.1](#121-context-packet). Reguły:

- pakiet jest **danymi**, nie instrukcją — w prompcie: „To jest aktualny stan środowiska; nie powtarzaj go użytkownikowi, używaj do decyzji”;
- diff między turami; pełny pakiet po `reset()`, po zmianie dostawcy i co 8 tur;
- sekcja `signals` zawiera zdarzenia od ostatniej tury (z kolejki sygnałów) i jest czyszczona po wysłaniu;
- limit rozmiaru; przy przekroczeniu skracane są najpierw notatki, potem zdarzenia.

### 4.4 Narzędzia — manifest i koperta wyniku

- Manifest generowany z Command Registry ([12.2](#122-wpis-command-registry)); każde narzędzie ma `examples` (po polsku), z których model uczy się intencji, a silnik lokalny — dopasowania.
- Wynik zawsze w kopercie ([12.3](#123-koperta-wyniku-narzędzia)); `data` maszynowe (np. lista notatek jako tablica), `text` krótkie do mowy.
- Kody błędów stałe: `NOT_FOUND`, `INVALID_ARGS`, `NEEDS_CONFIRMATION`, `DENIED`, `OFFLINE`, `RATE_LIMITED`, `TIMEOUT`, `INTERNAL`. Model dostaje w prompcie instrukcję, jak reagować na każdy (np. `NOT_FOUND` → wywołaj `*.list` i zaproponuj najbliższą nazwę).
- Koercja typów przed walidacją (`"300"` → `300`, `"tak"` → `true`, `"18"` → `"18:00"`).
- Idempotencja: powtórzone w jednej turze identyczne wywołanie zapisujące jest wykonywane raz, drugie dostaje `DUPLICATE` z wynikiem pierwszego.

### 4.5 Intencje wyższego rzędu

| Intencja | Zapis | Efekt w Jarvisie |
|---|---|---|
| `plan` | `<plan>["krok 1", "krok 2"]</plan>` przed pierwszym narzędziem | lista w Process Log i karcie „Logika”; odhaczanie po zdarzeniach |
| `ask_user` | narzędzie `ui.ask({question, options[]})` | szybkie odpowiedzi w czacie + głosowo; tura wstrzymana do odpowiedzi |
| `confirm` | odpowiedź `NEEDS_CONFIRMATION` z narzędzia ryzykownego | chip Tak/Nie; wynik po decyzji |
| `narrate` | `ui.narrate(text)` | krótki komunikat na Core bez wpisu w czacie (np. „szukam w sieci…”) |
| `highlight` | `ui.highlight(selector\|app\|widget)` | pulsująca ramka na elemencie — Jarvis „pokazuje palcem” |
| `remember` | `memory.remember(fact)` | zapis w profilu + Hermes Agent |

### 4.6 Zasady w prompcie systemowym (grounding)

Do `SYSTEM()` dochodzą jawne reguły:

1. Nigdy nie twierdź, że coś zrobiłeś, bez `tool_response` z `ok: true`.
2. Zanim zmienisz lub usuniesz, odczytaj (`*.list` / `*.read`), jeśli nie znasz identyfikatora.
3. Przy dwuznaczności użyj `ui.ask`, nie zgaduj (np. dwie notatki o podobnym tytule).
4. Odpowiadaj tekstem przeznaczonym do mowy; szczegóły techniczne zostaw w `data`.
5. Jeżeli `signals` zawiera zdarzenia istotne dla polecenia, odnieś się do nich.
6. Przy `MAX_TURNS - 1` otrzymasz komunikat „ostatnia tura” — zakończ podsumowaniem i listą kroków do dokończenia.

### 4.7 Ciągłość sesji i budżety

- Historia w IndexedDB; rolling summary po przekroczeniu ~6 k tokenów (szacunek: znaki/4).
- `MAX_TURNS` 6 → 10, plus budżet czasu 90 s i budżet narzędzi 25 na zadanie; przekroczenie = `task.paused` z pytaniem „kontynuować?” (nowy stan `PAUSED` z `events.js`).
- Przerwanie (`Esc`) propaguje `AbortSignal` do narzędzi asynchronicznych (pogoda, rynek), nie tylko do strumienia.

### 4.8 Współpraca z narzędziami serwerowymi Hermes Agent

- `hermes.tool.progress` dziś daje tylko „start”; koniec jest przybliżany końcem strumienia. Do sprawdzenia w gatewayu, czy zdarzenie ma pole statusu/`done` — jeśli tak, mapować na `tool.completed/failed` z czasem trwania.
- Jeśli gateway udostępnia listę narzędzi (`/tools` lub w `/models`), pokazywać ją w karcie „Dane zewnętrzne” i w Context Packet (`agent.tools`), żeby Jarvis mógł mówić „Hermes ma dostęp do terminala i wyszukiwarki”.
- Podział odpowiedzialności w prompcie: **środowisko i dane użytkownika = narzędzia Jarvisa; świat zewnętrzny = narzędzia Hermesa**. Model nie powinien szukać pogody przez wyszukiwarkę, skoro ma `get_weather`.

---

## 5. Zakres sterowania i nawigacji po całym systemie

Cel: **wszystko, co da się zrobić myszą, da się zrobić głosem lub zlecić modelowi**, a model wie, gdzie użytkownik „jest”.

### 5.1 Okna i układ

- API menedżera okien dla agenta: lista, fokus, przenieś, zmień rozmiar, przypnij do krawędzi, kafelkuj (2/3/4), minimalizuj/przywróć, „schowaj resztę”.
- Presety układów zapisywane pod nazwą („praca”: notatnik + harmonogram; „rynek”: tokeny + terminal) — jako polecenia rejestru, więc dostępne głosowo („układ praca”).
- Wirtualne pulpity (2–4) z przełączaniem `Alt+←/→` i poleceniem.
- Nawigacja względna: „następne okno”, „zamknij to”, „przewiń w dół” — wymaga w Context Packet pola `focused` i w rejestrze poleceń działających na „bieżącym” obiekcie.

### 5.2 Nawigacja wewnątrz aplikacji

Każda aplikacja eksponuje polecenia i **stan nawigacyjny**: Notatnik (wybrana notatka, pozycja kursora), Harmonogram (dzień), Rynek (obserwowane symbole), Terminal (historia), Ustawienia (sekcja). Polecenia typu „otwórz sekcję Hermes w ustawieniach”, „pokaż piątek”, „wyszukaj w notatkach zakupy”.

### 5.3 Widgety i pulpit

- Odczyt/zmiana/usunięcie/przeniesienie widgetu przez model; „przypnij wynik obok notatnika” = `widgets.move(near: 'notes')`.
- Skróty i ikony: zmiana nazwy/ikony/kolejności przez polecenia; grupowanie w foldery na pasku.
- Wskazywanie: `ui.highlight` + `ui.narrate` do prowadzenia użytkownika („tu jest przycisk eksportu”).

### 5.4 Przeglądarka i system

- `open_url` z allow-listą i potwierdzeniem; podgląd tytułu strony (przez Hermesa) zamiast ślepego otwierania.
- Schowek, powiadomienia systemowe (są), pełny ekran (jest), Wake Lock przy minutniku/nasłuchu, Web Share Target (PWA) do „wyślij do Jarvisa”.
- Skróty globalne: paleta, głos, tryb skupienia — do rozszerzenia o nawigację między oknami i pulpitami.

### 5.5 Silnik lokalny 2.0 (offline)

Zamiast ręcznych regexów: dopasowanie do `examples` z rejestru (normalizacja + tokeny + odległość edycyjna), wyciąganie argumentów (czas, liczby, nazwy aplikacji, cytaty), **łańcuchy** rozdzielane spójnikami („i”, „potem”, „a następnie”), progi pewności z pytaniem zwrotnym („chodziło o Notatnik czy Notatkę?”). Ten sam mechanizm zasila podpowiedzi w palecie.

---

## 6. Częstotliwości, budżety i pętle

Zasady: każda pętla zna widoczność karty (`document.hidden`), ma backoff po błędach i nie działa „na wszelki wypadek”.

| Pętla | Dziś | Propozycja |
|---|---|---|
| Rysowanie Core/HUD/jeziora (`main.js` rAF) | co klatkę, zawsze | pauza gdy karta ukryta; **adaptacyjna jakość**: gdy FPS < 40 przez 3 s → odbicie co 2. klatkę, mniej cząstek, bez `shadowBlur`; w spoczynku 30 FPS |
| Cząsteczki tła (`fx`) | co klatkę | jak wyżej; wyłączone w trybie skupienia (jest) i przy `prefers-reduced-motion` |
| Ping Hermesa | 45 s stałe | 20 s po błędzie z backoffem do 3 min; 90 s gdy stabilnie; natychmiast po `online` i po powrocie do karty |
| Sprawdzanie zadań (`tasks.check`) | co 15 s; zaległe > 2 min pomijane | `setTimeout` dokładnie na najbliższy termin + kontrola przy `visibilitychange`; zaległe zbierane do jednego komunikatu „w międzyczasie minęły: …” i do `signals` |
| Pogoda | 15 min | 15 min widoczna / 60 min ukryta; natychmiast po zmianie miasta (jest) |
| Rynek | WS + 90 s CoinGecko + tick 30 s | bez zmian, ale WS zamykany po 60 s ukrycia karty i wznawiany po powrocie; CoinGecko z backoffem przy 429 |
| Zegar | 1 s | bez zmian; telemetria 1 s → 2 s gdy zwinięta |
| Aktywność agenta (spark) | 250 ms | bez zmian; pauza gdy ukryta (jest) |
| Autozapis stanu | debounce 250 ms | bez zmian + `beforeunload` flush |
| Tura modelu | `MAX_TURNS` 6, bez limitu czasu | 10 tur / 90 s / 25 narzędzi → `PAUSED` z pytaniem |
| Sygnały aktywne (proaktywność) | brak | max 4/godz., tylko gdy karta widoczna i użytkownik nie pisze; cisza nocna konfigurowalna |
| Rutyny (briefing) | brak | planista sprawdza co 60 s; wykonuje z tolerancją 10 min po terminie; brak karty = powiadomienie systemowe |
| Streszczanie historii | brak | po przekroczeniu budżetu tokenów lub co 40 wiadomości |

---

## 7. Poprawki błędów i długu technicznego

Konkretne pozycje znalezione w kodzie, do zrobienia niezależnie od dużych funkcji:

1. **Zgubione przypomnienia** — `J.tasks.check` pomija zaległe > 2 min (`late`), a `setInterval` w ukrytej karcie bywa spowalniany do minut. Zastąpić „pomiń” przez „zbierz i zgłoś raz”.
2. **`open_url` po asynchronicznej turze** — `window.open` bez gestu użytkownika bywa blokowane; komunikat jest, ale brak akcji: dodać w czacie chip-link do kliknięcia.
3. **Walidacja argumentów** — tylko `required` i `enum`; dodać typy i koercję, komunikat błędu z oczekiwanym formatem (model potrafi się poprawić).
4. **Utrata historii przy błędzie** — `history.length = startLen` po wyjątku kasuje także udane tury tego zadania; zachować tury z wynikami narzędzi, usunąć tylko niedokończoną.
5. **Skutki uboczne narzędzi** — `get_crypto_prices`, `get_weather`, `create_note` otwierają okna; parametr `show`.
6. **Kolejka mowy** — `synth.cancel()` przy każdym `speak`; alarm minutnika potrafi uciąć odpowiedź. Kolejka z priorytetami.
7. **Nieskończone `history.slice(-30)`** bez kontroli tokenów — rolling summary (3.5).
8. **Bezpieczne `fmt` w czacie** — jest `esc` przed markdownem; dopisać test, żeby to nie zniknęło.
9. **`J.wm.open('chat')` w `brain.handle`** wymusza pokazanie panelu przy każdym poleceniu głosowym — opcja „cichy tryb głosowy” (tylko Core + głos).
10. **Zakończenie narzędzi serwerowych** przybliżane końcem strumienia — sprawdzić pola zdarzenia `hermes.tool.progress`, mapować faktyczny koniec (4.8).
11. **Jeden klucz localStorage** — migracja do IndexedDB (stan, historia Process Log, czat, widgety) z wersjonowaniem i migracjami; eksport/import bez zmian dla użytkownika.
12. **Skróty klawiszowe w polach tekstowych** — `/` jest chroniony, `Alt+1/2` nie; ujednolicić.
13. **Reflow okien na wąskich ekranach** i widgety na pulpicie mobilnym — dziś okno = pełny ekran, widgety również; potrzebny tryb listy.
14. **Service Worker** — `network-first` dla własnych plików jest ok; dodać wersjonowanie przez hash w nazwie cache w CI i komunikat „dostępna nowa wersja — odśwież”.
15. **Dostępność** — `aria-live` na wskaźniku trybu jest; brakuje pułapki fokusu w oknach modalnych (paleta), `role="log"` na wiadomościach czatu, etykiet na przyciskach ikonowych w doku (mają `title`, brak `aria-label`).

---

## 8. UI/UX — kolejne kroki po redesignie

- **Onboarding**: trzy kroki przy pierwszym uruchomieniu (mikrofon, Hermes, miasto) zamiast jednego toastu.
- **Centrum powiadomień** (ikona w pasku): historia toastów, sygnały, przypomnienia zaległe; klik = akcja.
- **Karty HUD klikalne**: karta „Tool Calls” otwiera Process Log na kroku; „Model AI” pokazuje model/latencję/tokeny.
- **Paleta**: fuzzy search, ostatnio używane, podgląd argumentów („minutnik 25 min” z natychmiastowym wykonaniem), sekcja „Zapytaj Hermesa” z podpowiedziami z rejestru.
- **Okna**: przyciąganie do krawędzi z podglądem, kafelkowanie skrótami, pamięć układu na pulpit, animacja minimalizacji do konkretnej ikony w doku.
- **Czat**: szybkie odpowiedzi (`ui.ask`), chipy narzędzi z rozwijanym `data`, „przypnij odpowiedź jako widget” przy każdej wiadomości, tryb kompaktowy.
- **Core**: wizualizacja głosu użytkownika podczas nasłuchu (są dane z analizera) i sylwetka wykresu mowy Jarvisa; kliknięcie w pierścień = szybkie menu (mów / paleta / skupienie).
- **Motywy**: tryb jasny „szkło dzienne” i motyw wysokiego kontrastu; edytor akcentu (dowolny kolor, nie tylko 8).
- **Telemetria**: tryb „mini” tylko z zegarem i statusem; klik w metrykę otwiera Monitor systemu na odpowiedniej karcie.
- **Mobile**: dolny pasek nawigacji zamiast doku, czat pełnoekranowy, Core mniejszy, HUD jako lista kroków.
- **i18n**: słownik `pl/en` dla etykiet UI i przykładów rejestru; język rozpoznawania i syntezy z ustawień.

---

## 9. Harmonogram — fazy, priorytety, kryteria odbioru

Kolejność jest ważna: fazy 1–2 tworzą fundament, bez którego reszta byłaby doklejana.

| Faza | Zakres | Kryterium odbioru | Szacunek |
|---|---|---|---|
| **0. Stabilizacja** | poprawki 7.1–7.9, testy jednostkowe parserów i reduktora, smoke test Playwright w CI, ESLint | CI zielone z testami; zero regresji w `local()` na tabeli 60 wypowiedzi | 3–5 dni |
| **1. Fundament zrozumienia** | Command Registry, generowanie `TOOLS`/palety/menu z rejestru, koperta wyniku, koercja i kody błędów, Context Packet (diff) w prompcie, reguły groundingu | model wykonuje „dopisz do notatki o zakupach mleko” bez `get_status`; paleta i narzędzia pochodzą z jednego rejestru | 1–2 tyg. |
| **2. Pełne sterowanie** | narzędzia CRUD (3.3) dla notatek, zadań, okien, widgetów, minutnika, ustawień, terminala; model uprawnień z potwierdzeniami; `ui.highlight/narrate/ask` | 90 % poleceń z listy testowej (100 wypowiedzi PL) kończy się poprawnym stanem środowiska; ryzykowne wymagają zgody | 2 tyg. |
| **3. Pamięć i ciągłość** | IndexedDB + migracje, zapis czatu, rolling summary, profil użytkownika, `memory.*`, budżety tury (`PAUSED`) | po odświeżeniu rozmowa i kontekst wracają; zadanie 15-krokowe nie urywa się bez pytania | 1–2 tyg. |
| **4. Proaktywność** | kolejka sygnałów, tryb cichy/aktywny, rutyny (briefing, podsumowanie dnia), planista z widocznością karty, plan `<plan>` w HUD | briefing o 8:00 z pogodą, zadaniami i rynkiem; minutnik kończy się pytaniem, jeśli tryb aktywny | 1–2 tyg. |
| **5. Głos 2.0** | nasłuch ciągły ze słowem wybudzającym, kolejka mowy, barge-in, cichy tryb głosowy | rozmowa bez dotykania myszy przez 5 poleceń z rzędu; alarm nie ucina odpowiedzi | 1 tydz. |
| **6. Dane i integracje** | File System Access, `.ics`, RSS, kursy walut, natywne `tool_calls` (Ollama/vLLM), lista narzędzi gatewaya | notatki w folderze na dysku; Hermes przez Ollamę steruje pulpitem bez `<tool_call>` | 2 tyg. |
| **7. Jakość i zasięg** | wydajność adaptacyjna, i18n PL/EN, a11y, mobile, centrum powiadomień, onboarding | FPS ≥ 45 na laptopie bez GPU; audyt a11y bez błędów krytycznych; EN kompletny | 2 tyg. |

Każda faza kończy się wpisem w README i podbiciem cache SW.

---

## 10. Metryki sukcesu

Zbierane lokalnie (Monitor systemu, eksport JSON), bez wysyłania na zewnątrz:

- **Skuteczność narzędzi**: udział `tool.completed` w `tool.started` (cel > 95 %).
- **Tury na zadanie**: mediana (cel ≤ 2 dla poleceń prostych, ≤ 4 dla złożonych).
- **Czas do pierwszego tokenu** i **czas zadania** (Process Log już mierzy).
- **Błędne akcje**: liczba cofnięć/anulowań przez użytkownika w ciągu 60 s po akcji (cel < 3 %).
- **Zgubione przypomnienia**: liczba zaległych bez zgłoszenia (cel 0).
- **Rozpoznanie offline**: udział `null` z `local()` (cel < 15 % na korpusie testowym).
- **FPS w spoczynku i pod obciążeniem** (cel ≥ 45 / ≥ 30).

---

## 11. Decyzje do podjęcia

1. **Format kontekstu**: JSON w prompcie systemowym vs. osobna wiadomość `user` z etykietą — zależy od tego, jak Hermes Agent cachuje prompt systemowy (JSON w systemie psuje cache przy każdej zmianie stanu). Rekomendacja: stały system prompt + Context Packet jako pierwsza wiadomość użytkownika w turze.
2. **Proaktywność domyślnie**: cicha (rekomendacja) czy aktywna.
3. **Magazyn danych**: IndexedDB własny vs. gotowa biblioteka — projekt jest „zero zależności”; rekomendacja: własny cienki wrapper (ok. 120 linii).
4. **Pliki**: File System Access tylko w Chromium — czy to akceptowalne ograniczenie (reszta ma import/eksport).
5. **Język promptu**: pozostawić polski czy przejść na angielski z polskimi odpowiedziami (modele Hermes zwykle lepiej wykonują instrukcje po angielsku; wymaga testu A/B na 30 poleceniach).

---

## 12. Załącznik: proponowane schematy

### 12.1 Context Packet

```json
{
  "v": 1,
  "time": { "iso": "2026-09-29T12:15:00+02:00", "weekday": "poniedziałek", "tz": "Europe/Warsaw" },
  "user": { "initials": "JD", "city": "Wrocław", "lang": "pl", "profile": ["pracuje zdalnie", "pomodoro 25/5"] },
  "conn": { "online": true, "hermes": "up", "model": "hermes-agent", "agent_tools": ["web_search", "terminal", "memory"] },
  "desktop": {
    "focused": { "app": "notes", "state": { "noteId": "k3f9a", "title": "Zakupy" } },
    "windows": [ { "app": "notes", "min": false }, { "app": "schedule", "min": true } ],
    "widgets": [ { "id": "w1", "type": "list", "title": "Do zrobienia", "preview": "3 pozycje, 1 odhaczona" } ],
    "focus_mode": false, "theme": "jarvis", "wallpaper": "photo", "timer": { "label": "Pomodoro", "left_s": 812 }
  },
  "notes": { "count": 12, "recent": [ { "id": "k3f9a", "title": "Zakupy" }, { "id": "p01xz", "title": "Projekty Jarvis OS" } ] },
  "tasks": { "today": [ { "id": "t1", "time": "14:00", "text": "Budowa Jarvis OS", "done": false } ], "overdue": 1, "tomorrow": 2 },
  "last_task": { "title": "Sprawdź pogodę", "status": "completed", "summary": "Wrocław 12°C, pochmurno" },
  "signals": [ { "t": "-4m", "type": "timer.ended", "label": "Pomodoro" }, { "t": "-1m", "type": "task.due", "text": "Analiza rynku 11:30" } ]
}
```

Diff między turami: tylko zmienione klucze najwyższego poziomu + `"_full": false`.

### 12.2 Wpis Command Registry

```js
J.registry.add({
  id: 'notes.append',
  app: 'notes',
  label: { pl: 'Dopisz do notatki', en: 'Append to note' },
  description: { pl: 'Dopisuje tekst na końcu istniejącej notatki (po id lub tytule).' },
  args: {
    type: 'object',
    properties: { note: { type: 'string', description: 'id lub fragment tytułu' }, text: { type: 'string' } },
    required: ['note', 'text']
  },
  risk: 'safe',           // safe | confirm | blocked
  idempotent: false,
  reads: ['notes'], writes: ['notes'],
  examples: { pl: ['dopisz do notatki zakupy: mleko', 'dodaj do listy zakupów chleb'] },
  palette: true, voice: true, hermes: true,
  run: async ({ note, text }, ctx) => { /* … */ return ctx.ok({ id, title }, `Dopisałem do „${title}”.`); }
});
```

Z jednego wpisu powstają: definicja funkcji dla Hermesa, wzorce dla silnika lokalnego, pozycja palety i menu, wiersz w „co potrafisz”.

### 12.3 Koperta wyniku narzędzia

```json
{ "ok": true, "code": "OK", "data": { "id": "k3f9a", "title": "Zakupy", "length": 214 }, "text": "Dopisałem do „Zakupy”.", "ui": { "highlight": "notes", "open": false } }
```

```json
{ "ok": false, "code": "NEEDS_CONFIRMATION", "data": { "tool": "close_app", "args": { "app": "all" }, "ttl_s": 60 }, "text": "Zamknąć wszystkie okna?" }
```

### 12.4 Sygnał środowiska

```json
{ "type": "timer.ended", "ts": 1790000000000, "payload": { "label": "Pomodoro", "total_s": 1500 }, "delivered": false, "policy": "quiet" }
```

### 12.5 Stany maszyny (rozszerzenie `events.js`)

`IDLE · LISTENING · THINKING · EXECUTING · VERIFYING · APPROVAL_REQUIRED · PAUSED · COMPLETED · ERROR · RECOVERING`

Przejścia nowe: `EXECUTING → APPROVAL_REQUIRED` (narzędzie `confirm`), `APPROVAL_REQUIRED → EXECUTING | IDLE`, `THINKING/EXECUTING → PAUSED` (budżet), `PAUSED → EXECUTING` (zgoda), `ERROR → RECOVERING` (fallback lokalny) → `COMPLETED | ERROR`.
