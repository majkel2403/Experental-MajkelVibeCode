# Internet i prawdziwy komputer przez Jeva

> Przeniesione z README.md (2026-10-04). Krótki opis i szybki start: [README](../../README.md).

Jarvis potrafi, przez model decyzyjny **Jev** (TypeSafe „System One”, decyzja w ok. 300 ms), sterować dwiema rzeczami poza swoim pulpitem. Oba źródła to cudze repozytoria, wdrożone bez zmian w kodzie (dwie drobne poprawki: `integrations/patches`):

| | Repozytorium | Co robi | Jak mówisz |
|---|---|---|---|
| **Internet** | [moritzkremb/jev-voice-browser](https://github.com/moritzkremb/jev-voice-browser) | prawdziwy **Google Chrome** (osobna instancja z własnym profilem `%USERPROFILE%\.jarvis-os\chrome-profile`, podpięta przez CDP — Twoje zwykłe okna i logowania nietknięte; bez Chrome'a Chromium z Playwrighta; `JARVIS_WEB_BROWSER=chrome\|chromium\|auto`): zdanie → Jev wybiera intencję i element strony → klik / wpisanie / przewinięcie / nawigacja | „**w przeglądarce** wejdź na wikipedię”, „w przeglądarce wyszukaj zielone jabłka”, „w przeglądarce kliknij pierwszy wynik”, „w przeglądarce przeczytaj stronę” |
| **Prawdziwy komputer** | [awlevin/typesafe-computer-use](https://github.com/awlevin/typesafe-computer-use) | czyta ekran Windows (UI Automation + OCR), Jev wybiera akcję, program klika i pisze na PRAWDZIWYM pulpicie, aż cel zostanie osiągnięty | „**na komputerze** otwórz notatnik”, „w Windows uruchom kalkulator”; stop: „zatrzymaj komputer” |
| **Wewnątrz** (okna, notatki, widgety Jarvis OS) | — | jak dotąd, zwykłe polecenia rejestru (sędzia Jev routuje je bez czekania na Hermesa) | „otwórz notatnik”, „ułóż okna” |

**Przykład dla laika:** „Jarvis, w przeglądarce wyszukaj pogodę w Krakowie i kliknij pierwszy wynik” → Jarvis otwiera osobne okno przeglądarki (Chrome z własnym profilem), Jev dopasowuje polecenie do elementów strony, kilka sekund i gotowe. „Jarvis, na komputerze otwórz Notatnik i wpisz cześć” → Jarvis **najpierw pyta o zgodę**, potem sam przejmuje mysz i klawiaturę.

**Jak to działa:** polecenia to zwykłe wpisy Command Registry (`js/agents.js`: `web_command`, `web_read`, `computer_use`, `computer_status`, `computer_stop`, `agents_status`), więc mają tę samą walidację, zgody i Process Log co reszta, a Hermes (przez most MCP) widzi je jako narzędzia. Zdania po polsku są tłumaczone deterministycznie na angielskie komendy Jeva (treść zapytania i etykiety zostają dosłownie); domena albo adres otwiera się od razu, bez pytania Jeva. Most (`bridge/agents.py`) uruchamia agenta WWW przy pierwszym użyciu i pilnuje procesów: po zamknięciu mostu (także „na twardo”) system zabija agenta, Chromium i ewentualne zadanie sterujące myszą.

```
„w przeglądarce…” ─► registry (PL→EN) ─► most :8651 ─► agent WWW :8788 ─► Jev ─► Chrome (CDP) / Chromium (Playwright)
„na komputerze…”  ─► registry + ZGODA ─► most ─► clicker (uv) ─► UI Automation + OCR ─► Jev ─► mysz/klawiatura
```

## Instalacja (Windows, bez WSL)
1. `powershell -ExecutionPolicy Bypass -File integrations\setup.ps1` — pobiera oba repozytoria na przypięte, przetestowane wersje do `%USERPROFILE%\.jarvis-os\vendor`, nakłada poprawki, instaluje zależności (Node 20+, `uv` i Chromium już masz z Hermesem/Playwrightem).
2. `powershell -ExecutionPolicy Bypass -File integrations\set-key.ps1` — wpisujesz klucz w ukrytym polu; trafia tylko do `%USERPROFILE%\.jarvis-os\jev.env` (dostęp tylko dla Twojego konta). **Jeden klucz OpenRouter** ([openrouter.ai/keys](https://openrouter.ai/keys)) obsługuje Jeva wszędzie: agenta WWW, sterowanie komputerem i sędziego Jev w samym Jarvisie. Hermes ma własnego dostawcę (MiniMax-M3 z darmowymi modelami zapasowymi — [ADR 0002](../adr/0002-docelowa-konfiguracja-hermesa.md)). Można też użyć klucza TypeSafe (`-Provider typesafe`). Model pomocniczy do **wpisywania tekstu** przy sterowaniu komputerem (writer) nie zależy od limitów Hermesa: most kieruje go przez pośrednika `bridge/writer_proxy.py` — łańcuch szybkich **darmowych** modeli OpenRouter (ten sam klucz; lista w `JARVIS_WRITER_MODELS`), a gdy żaden nie odpowie poprawnym JSON-em w 9 s (limity 429 na darmowych modelach zdarzają się), awaryjnie odpowiada **Twój Hermes**. Zawodzący model jest pomijany przez 90 s. Do writera nie są wysyłane zrzuty ekranu, tylko tekst ekranu. Bez mostu: `set-key.ps1 -Writer hermes` (domyślnie), `-Writer anthropic` albo `-Writer none` (komputer tylko klika).
3. `bridge\start-bridge.bat` (most) i `hermes\start-desktop-gateway.bat` — po zmianie liczby narzędzi zrestartuj gateway, żeby Hermes je zobaczył.
4. `powershell -ExecutionPolicy Bypass -File integrations\doctor.ps1 -Live` — pokazuje, co działa, a co nie, i robi jedno prawdziwe zapytanie do Jeva (ułamek grosza), mierząc opóźnienie.

## Bezpieczeństwo agentów
- **Prawdziwy komputer: każde zadanie wymaga Twojej zgody** (także polecenie wpisane ręcznie; „Zawsze zezwalaj” jest tu wyłączone). Przerwanie w każdej chwili: klawisz **Esc**, „zatrzymaj komputer” albo **mysz w lewy górny róg ekranu**. Limit kroków (domyślnie 25, maks. 60) i twardy limit czasu. Podczas zadania nie dotykaj myszy — program o nią walczy.
- **Internet:** działania nieodwracalne (kup, wyślij, usuń, opublikuj) Jev oznacza jako ryzykowne, a Jarvis pyta o zgodę; niejednoznaczny element → pytanie „który?” z numerami. Osobny profil przeglądarki (`%USERPROFILE%\.jarvis-os\chrome-profile` dla Chrome, `web-profile` dla Chromium) — bez Twoich sesji i haseł; nie loguj się tam na konta, którymi nie chcesz sterować.
- **Treść stron to dane niezaufane:** `web_read` oznacza ją tak dla Hermesa, a jego zasady pracy (`hermes/HERMES.md`) zabraniają wykonywania poleceń zaszytych w stronach.
- Agent WWW nasłuchuje tylko na `127.0.0.1`, wymaga tokenu mostu i **odrzuca żądania pochodzące ze stron** (nagłówki `Origin`/`Host`). Celowo nie uruchamiamy panelu z mikrofonem ani gniazda WebSocket z repozytorium autora — gniazdo na `127.0.0.1` jest dostępne z dowolnej strony otwartej w Twojej przeglądarce.
- Zrzuty ekranu z zadań (`%USERPROFILE%\.jarvis-os\runs`) mogą zawierać prywatne dane — most zostawia tylko 5 ostatnich uruchomień.
- Znane ograniczenia: autor określa wsparcie Windows jako eksperymentalne; OCR czyta jeden język (u Ciebie polski, ustawiany w `jev.env`); tylko główny monitor; program widzi tylko okno na pierwszym planie (bez paska zadań i menu Start) i ma tylko akcje: klik, wpisanie, przewinięcie, Esc, Enter, wstecz, czekaj, oraz nasze „uruchom program z listy” — bez skrótów klawiszowych; Comet/Chrome nie publikują drzewa UI Automation, więc w przeglądarce działa OCR.

## Poprawki agenta przeglądarki (`integrations/web/agent.mjs`)
Badanie na prawdziwej Wikipedii (ten sam scenariusz: otwórz → szukaj → kliknij → przewiń → wstecz, z prawdziwym Jevem):

| Problem | Poprawka | Efekt |
|---|---|---|
| Elementy są znakowane atrybutem w chwili zrzutu, a nowoczesne strony (Vue/React) odtwarzają węzły — Playwright czekał 6–30 s na nieistniejący element | samoleczenie: sprawdzenie przed akcją, odświeżenie zrzutu, znalezienie tego samego elementu pod nowym id; gdy pola wyszukiwania brak — wyszukiwarka, jak u autora | scenariusz **40 s → 7 s**, bez wiszących poleceń |
| Domyślny limit czasu Playwrighta 30 s | limit akcji 6 s (`JARVIS_WEB_ACTION_TIMEOUT`) | szybka, czytelna porażka |
| Wolniejszy start Chromium z Playwrighta | prawdziwy Google Chrome przez CDP, własny profil | start 3,9 s → 1,1 s |
| Chrome ma pamięć podręczną „wstecz/dalej”, na którą `goBack` czekał 15 s | `--disable-features=BackForwardCache` (Playwright robi tak w swoim Chromium) | „wstecz” 18 s → 1 s |
| Wynik i następne polecenie widziały stronę sprzed wysłania formularza | czekanie na nawigację po Enter | poprawny adres i treść |

## Niezawodność: żeby nowe zadania nie kończyły się „średnio”
| Mechanizm | Co robi |
|---|---|
| **Karta łączy się z Hermesem sama** (`/bridge/hermes`, `ensureHermes` w `js/bridge.js`) | domyślne ustawienie i niedziałający Hermes są podmieniane na profil `jarvis-desktop` przez pośrednika mostu `/bridge/v1` (klucz zostaje w moście, [ADR 0003](../adr/0003-klucz-hermesa-przez-most.md)); własnego wyboru (chmura, własny serwer) nie rusza |
| **Nigdy pół zadania** (`registry.uncovered`, `localPlan` w `js/ai.js`) | gdy silnik lokalny rozpoznaje tylko część zdania, nic nie wykonuje i mówi, czego brakuje; gdy Jev wybrał jedno polecenie, a zdanie ma dalsze części — zadanie idzie do Hermesa; łańcuch znanych bezpiecznych poleceń wykonuje się lokalnie od razu |
| **`web_task` — zadanie w internecie na cel** (`bridge/web_task.py`) | planista (darmowe modele OpenRouter → Hermes) wybiera krok, Jev z jev-voice-browser go wykonuje, aż cel osiągnięty; limity kroków i czasu, blokada pętli, zgoda przy działaniach nieodwracalnych, banery cookies zamykane automatycznie. „w internecie …”, „znajdź / sprawdź w internecie …” |
| **Korpus zdań** (`tests/unit/routing.test.js`) | ok. 60 typowych poleceń z oczekiwaną drogą; zdanie, które zadziałało źle, dopisz tam z poprawnym wynikiem |
| **Dziennik i raport porażek** (`J.tasklog`, `%USERPROFILE%\.jarvis-os\logs\tasks.jsonl`) | każde zadanie z czatu: droga, narzędzia, wynik; polecenie „co się nie udało”, sekcja w `doctor.ps1` |
| **Modele zapasowe Hermesa** | MiniMax-M2.5 → inkling → nemotron-3-super → nemotron-3.5-lightning (trzy ostatnie `:free` z OpenRouter); `tool_search` wyłączony w profilu — narzędzia MCP zawsze widoczne ([ADR 0006](../adr/0006-narzedzia-pulpitu-wprost-i-straznik-czynnosci.md)) |
| **Autostart** (`bridge\install-autostart.ps1`) | strona :4000, most i Hermes po zalogowaniu, ukryte okna, logi w `%USERPROFILE%\.jarvis-os\logs` |

## Muzyka i filmy: „puść …” (`media_play`, `media_control`)
„Otwórz youtube i puść piosenkę X” działało słabo: Jev uznawał zdanie za wieloetapowe, a bez Hermesa silnik lokalny ciął je na „i” i otwierał tylko stronę główną YouTube. Teraz jedno polecenie obejmuje całe zdanie („puść X”, „włącz piosenkę X na youtube”, „otwórz youtube i puść X”) i wykonuje się od razu, bez Jeva i Hermesa. Agent WWW sam wyszukuje, klika pierwszy film i sprawdza, że **czas filmu naprawdę płynie**. Dalej: „pauza”, „wznów”, „następna piosenka”, „co teraz gra”, „zatrzymaj muzykę”. Gołe „pauza/następna” znaczą muzykę tylko wtedy, gdy coś gra, a „stop” zawsze zatrzymuje plan Jarvisa. Hermes ma te same narzędzia (`media_play`, `media_control`).

| Problem (sprawdzony na prawdziwym YouTube) | Poprawka |
|---|---|
| Okno „Zanim przejdziesz do YouTube” na stronie zasłania odtwarzacz i przechwytuje kliknięcia; przyciski mają nazwę dostępności inną niż napis | przycisk „Odrzuć wszystko” wyszukiwany po widocznym tekście, na wynikach i na stronie filmu |
| `video.play()` YouTube od razu cofa do pauzy (szczególnie reklamę) | sterowanie API odtwarzacza: `playVideo` / `pauseVideo` / `nextVideo` |
| Brak pauzy nie znaczy, że gra (reklama potrafi stanąć) | „gra” = czas filmu rośnie; zawieszony odtwarzacz: prawdziwe kliknięcie, potem jedno przeładowanie |
| Stara karta Jarvisa po restarcie mostu wypierała nowe narzędzia (Hermes ich nie widział) i nadpisywała `tools.json` | most odrzuca listę bez narzędzi z aktualnego kodu, a karta sama się odświeża |

Pomiar: 10/10 piosenek gra, ~7 s na polecenie (pierwsze z uruchomieniem Chrome ~10–15 s), pauza/wznów/następna 0,4–2,5 s.

## Rozszerzenia dla Windows (`integrations/computer/jarvis_clicker.py`)
Wynik badań programu autora na Windows 11 (polski system, 125% skalowania). Dodatek nakłada poprawki w locie, bez zmian w kodzie autora (43 testy: `uv run --project %USERPROFILE%\.jarvis-os\vendor\typesafe-computer-use python -m pytest integrations/computer`):

| Problem znaleziony w programie | Poprawka | Efekt (zmierzony) |
|---|---|---|
| Brak akcji „uruchom program”; widoczne jest tylko okno na pierwszym planie, więc z przeglądarki Jarvisa nie dało się otworzyć niczego | akcja `open_app` z **katalogiem** (Notatnik, Kalkulator, Eksplorator plików, Paint, Ustawienia; bez terminali i skryptów), wybór przez Jeva, pewne wysunięcie okna na pierwszy plan | „otwórz Notatnik” po polsku: Jev 0,84, krok 2,9 s (wcześniej: nie do wykonania) |
| Odczyt adresu przeglądarki przeszukiwał drzewo UI w Pythonie na **każdym kroku, także przy Notatniku** (2,9–3,2 s) i szukał tylko angielskiego „address” — na polskim Chrome/Comet nigdy nic nie zwracał | natywne wyszukiwanie UI Automation + pamięć podręczna 5 s, nazwa paska także po polsku | odczyt 0,04 s zamiast 2,9 s; krok 4,4 s → 1–3 s |
| Edytory (Notatnik i inne „Document”) miały pustą rolę, więc `type_text` odmawiał mimo kursora w polu | edytowalny Document/Custom z zapisywalną wartością = pole tekstowe | pisanie w polu działa (Jev 0,99) |
| `type_text` **zastępuje całą zawartość pola** — w Notatniku z odtworzoną sesją skasowałby Twój niezapisany dokument | odmowa dla niepustych pól wieloliniowych (po roli, znaku nowej linii, długości, wysokości); nowa pusta karta po uruchomieniu Notatnika z tekstem; `JARVIS_CLICKER_OVERWRITE=1` znosi ochronę | sprawdzone na żywo: edytor z tekstem nietknięty |
| Wpisywanie po jednym zdarzeniu z przerwą 40 ms (80 ms na znak, 200 znaków = 16 s) | porcje po 32 znaki jednym `SendInput`, przerwanie (mysz w rogu) sprawdzane między porcjami | kilkadziesiąt razy szybciej |
| Końcowa weryfikacja modelem pomocniczym (u nas ~9 s przez Hermesa) także dla prostych zadań | „szybkie done”: gdy Jev ≥ 90% pewny, a cel jest do WYKONANIA (nie „ile/znajdź/sprawdź”), pomijamy weryfikację (`JARVIS_CLICKER_QUICK_DONE=0` włącza ją zawsze) | „otwórz Notatnik” 19 s → ~10 s |
| Uruchomienie programu „na próbę” przy niskiej pewności (zaobserwowane po odmowie pisania) | `open_app` wymaga pewności ≥ 0,7 (`JARVIS_CLICKER_OPEN_APP_MIN`) | brak niechcianych programów |
| Przeglądarka zakładana na sztywno jako „Google Chrome”, a zwykły `chrome.exe` może być Twoim prywatnym oknem | most wykrywa domyślną przeglądarkę z rejestru (u Ciebie Comet) | — |
