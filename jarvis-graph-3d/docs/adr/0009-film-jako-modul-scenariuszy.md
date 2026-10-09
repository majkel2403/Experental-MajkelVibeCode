# ADR 0009 — Film jako moduł scenariuszy

**Status:** przyjęta 2026-10-05 · **Kontekst:** film na cały ekran (`js/workflow-cinema.js`) umiał pokazać tylko przebieg workflow
z mostu i „Film dnia”. Michał chce, żeby takie wizualne filmy z pracy działały w różnych sytuacjach: zadania Hermesa zlecone z Telegrama,
zadania z harmonogramu, dłuższe polecenia z czatu, powtórka dowolnego zadania z historii — i żeby to był konfigurowalny moduł, a nie
zaszyta na stałe funkcja jednego typu pracy. Każda praca na pulpicie i tak przechodzi przez jedno miejsce: Process Log (`J.proc`) —
polecenia z czatu (ai.js), zadania Hermesa spoza karty (bridge.js, wtyczka `jarvis-events`, [ADR 0004](0004-zdarzenia-zadan-hermesa-na-pulpicie.md)),
workflow ([ADR 0007](0007-silnik-workflow-w-moscie.md)).

**Decyzja:**
- **Silnik** (`workflow-cinema.js`) przyjmuje dowolne źródło: `openSource(src, evs, o)` — przebieg-podobny obiekt z krokami plus albo zdarzenia
  (film z zapisu), albo `o.feed` (na żywo). Kroki mogą przybywać w trakcie (`dyn`: nowy węzeł, pozycja liczona od zera, żeby istniejące
  nie „skakały”), pojedyncze nieudane narzędzie jest „łagodne” (czerwony węzeł i pasek, bez planszy „Awaria”), wstęp krótszy (×0,55),
  inne napisy końcowe i podpisy („Krok N” zamiast „Akt N”). Workflow działa po staremu (domyślne źródło: zdarzenia z mostu).
- **Moduł** (`js/film-scenarios.js`) trzyma **rejestr scenariuszy** (`registerScenario`): `workflow`, `telegram` (Telegram, konsola i inne kanały
  Hermesa), `cron`, `chat`, `day`. Każdy ma tryb **wyłączony / zaproponuj w czacie / włącz sam**, własny próg „dłuższego” zadania
  i nazwę filmu. Wyłącznik całego modułu: `filmOn`. Ustawienia (`filmScen`, `wfFilm` dla workflow) i wiersze w Ustawieniach → Wygląd →
  „Film · moduł scenariuszy” powstają z rejestru — nowy scenariusz nie wymaga zmian w silniku ani w panelu.
- **Obserwator Process Logu** (`J.proc.observe`, zdarzenia start / krok / koniec kroku / koniec zadania) — jedyna zmiana w `process.js`.
  Dzięki niemu film widzi każde zadanie, skądkolwiek przyszło. Do sceny trafiają narzędzia (`tool`, `server`) i odpowiedź; rozumowanie
  modelu i wpisy systemowe nie. Tytuł kanału z `bridge.js` (`Telegram: …`, `Cron: …`) wskazuje scenariusz; reszta to `chat`.
- **Progi:** film po `steps` narzędziach (nie szybciej niż 2,5 s — łańcuch w ułamku sekundy nie jest „dłuższą pracą”) albo po `ms` pracy
  przy co najmniej 2 narzędziach; telegram/cron 3 i 8 s, czat 4 i 12 s. Po zadaniu, którego film nikt nie otworzył — propozycja powtórki.
- **Tryb „sam” ustępuje człowiekowi:** nie włącza się, gdy ktoś pisze w polu, trwa prośba o zgodę, tryb prezentacji/skupienia, cisza nocna,
  ruch ustawiony na „bez animacji”, karta w tle, trwa już inny film albo film zamknięto mniej niż 45 s temu — wtedy tylko karta
  z propozycją. Prośba o zgodę w trakcie filmu zamyka film (zasłaniałby okno zgody) i film nie wraca w tym zadaniu.
- **Powtórka:** polecenie `task_film` („pokaż film z zadania”) i przycisk 🎬 w Process Logu — zdarzenia odtwarzane z zapisu zadania
  (powtórzone narzędzia zwijane do „×N”, nadmiar do sceny zbiorczej, odpowiedź zawsze na końcu).

**Konsekwencje:** film jest dodatkiem, nie warunkiem — błąd modułu nigdy nie psuje zadania (obserwator w `try/catch`). Domyślnie nowe
scenariusze (Telegram, harmonogram, czat) są na „włącz sam” (decyzja Michała 2026-10-05), więc dłuższa praca Hermesa pojawia się jako film
bez pytania; przy złej pogodzie (np. zadania harmonogramu w nocy) odpowiada cisza nocna i próg czasu, a wyłączenie to jeden przełącznik
`filmOn`. Dźwięk i lektor filmu idą za ustawieniami „Dźwięki” i „Jarvis mówi na głos”. Do rozważenia później: scenariusz agenta WWW Jeva
(przeglądarka sterowana przez CDP) i handel (bot paper) — wystarczy `registerScenario` z własnym `match`.
Testy: `tests/unit/film-scenarios.test.js`, e2e (`tests/e2e/smoke.js`) i próba na żywo z prawdziwym Hermesem.
