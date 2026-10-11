# 08 — Decyzje architektoniczne do zatwierdzenia (ADR)

**Data:** 2026-10-09. **Status:** PROPOZYCJA DO PRZEGLĄDU — nie stanowi zgody na implementację. **Obecna lokalizacja:** `majkel2403/Experental-MajkelVibeCode/jarvis-graph-3d` na gałęzi `docs/jarvis-graph-v2-mission-brain-motion`, bez zmian w `main`.

> **2026-10-11 — kwestie do dopięcia:** [Doc 16](16-final-architecture-review.md) dodaje F1 (wersja i cursor zakresu uprawnień), F2 (jednoznaczna pauza efektów przy trwającej synchronizacji) i F3 (stan połączenia kontra zdarzenie producenta). Żadna z tych propozycji nie jest jeszcze zatwierdzonym kontraktem.

## Dlaczego ten dokument istnieje?

Dokument `docs/superpowers/specs/2026-10-08-jarvis-graph-v2-master-design.md` opisuje `GraphNode` i `GraphEdge`, używa wizualnego typu `core` oraz prostego `GraphEventEnvelope`. Nowszy Blueprint 02/03 proponuje `GraphEntity`, `GraphRelation`, `GraphSnapshot`, `GraphPatch` i CloudEvents-like `JarvisEventV1`. Te schematy nie są zamienne. Przed kodowaniem trzeba zatwierdzić **jeden** kontrakt, nie dwa.

### ADR-101 — Jeden model domenowy

**Rekomendacja:** kanoniczne nazwy to `GraphEntity`, `GraphRelation`, `GraphSnapshot`, `GraphPatch`, `GraphStore` zgodnie z [Blueprint 02](02-graph-ontology-contracts.md).

- Encje: `system`, `component`, `agent`, `team`, `person`, `project`, `task`, `workflow`, `run`, `decision`, `memory`, `file`, `artifact`, `skill`, `tool`, `event`, `evidence`.
- Relacje: `contains`, `owns`, `member_of`, `assigned_to`, `delegated_to`, `depends_on`, `uses`, `produced`, `references`, `derived_from`, `decided_by`, `triggered`, `communicates_with`, `related_to`.
- `core`, `hub`, `satellite` to tylko sposób rysowania; `traffic` to krótkotrwały sygnał animacyjny, **nie** zapisywana relacja.
- Pozycje `x,y,z,fx,fy,fz` są stanem layoutu, a nie wiedzą o agencie. Nie pozwalać fizyce D3 mutować kanonicznych rekordów.
- Typy `event` i `evidence` mogą być materializowane jako węzły tylko przy odpowiednim poziomie szczegółowości. Wysokoczęstotliwościowe eventy nadal mają swój log.

**Test akceptacji na papierze:** zadanie `task:42` ma identyczny ID w 3D, G6, inspektorze, wyszukiwaniu i historii. Zwinięcie klastra nie zmienia ID.

### ADR-102 — Migawki, poprawki i wersje

**Rekomendacja:** GraphSnapshot ma `schemaVersion='2.0'`, `graphVersion`, `cursor`, `generatedAt`, `nodes` i `edges`. GraphPatch deklaruje `baseVersion`, `graphVersion`, zmiany oraz nowy cursor. Rozdzielić:

- wersję **formatu** danych (`schemaVersion`),
- wersję **stanu grafu** (`graphVersion`),
- pozycję w **trwałym logu** (`cursor`),
- rewizję pojedynczej encji (`revision`).

Każda poprawka jest atomowa. Niezgodny `baseVersion` → replay lub świeża migawka. Starsza `revision` nie nadpisuje nowszej. Usunięcie węzła porządkuje jego krawędzie. Zmiana uprawnień użytkownika unieważnia stary zakres snapshotu/cursora; klient otrzymuje nową migawkę.

**Do ustalenia:** czy `graphVersion` zwiększamy o 1 na każdą zatwierdzoną transakcję czy na batch (wybrać jedną regułę i testować).

### ADR-103 — Jeden kontrakt zdarzeń

**Rekomendacja:** `JarvisEventV1` z [Blueprint 03](03-event-bus-protocol.md), z polami CloudEvents `specversion,id,source,type,time,data`, rozszerzeniami `sequence,correlationid,causationid,dataclassification` oraz oddzielnym `dataschema`.

- Tożsamość retry: `(source,id)`; identyczne przy ponownym wysłaniu, nawet po restarcie.
- `sequence` jest porównywalne **w zakresie jednego source**, nie globalnie. Sam `partitionkey` nie daje kolejności per task.
- Serwerowy `cursor` wyznacza miejsce w logu. `graphVersion` dotyczy projekcji. Nie mieszać tych liczb.
- `task.completed` z wygenerowanej wypowiedzi modelu **nie jest automatycznie dowodem** zapisania pliku lub wykonania kliknięcia; potrzebny potwierdzony wynik narzędzia.
- Stare zdarzenia `js/events.js` przechodzą przez adapter; nie wymieniać od razu wszystkich istniejących producentów.

**Źródło pierwotne:** [CloudEvents Sequence Extension](https://github.com/cloudevents/spec/blob/main/cloudevents/extensions/sequence.md).

### ADR-104 — Niezawodność i offline

**Rekomendacja:** istniejący kanał Hermes → Bridge jest punktem wyjścia; nie dodawać Kafka/NATS bez dowodu potrzeby.

1. Producent zapisuje krytyczne P0/P1 do trwałego outboxa przed wysyłką.
2. Ingest uwierzytelnia źródło, sprawdza format i limity, deduplikuje, zapisuje do trwałego logu, dopiero wtedy wysyła ACK.
3. Projector przetwarza log w wersjonowane GraphPatch i zapisuje checkpoint.
4. Odczyt przez uwierzytelniony snapshot/SSE otrzymuje odpowiedni, już zredagowany zakres grafu.
5. Brak sieci → pozostaw ostatni snapshot, pokaż STALE. Ponowne połączenie → replay po cursorze albo resync.
6. P2 typu dekoracyjne pulsy mogą być pomijane/łączone; P0 zatwierdzenia, błędy bezpieczeństwa, wyniki narzędzi i zakończenia zadań nigdy nie są świadomie zrzucane.

**Niezweryfikowane:** dokładne Bridge auth/Origin/SSE replay, baza i retencja. Nie rozstrzygać implementacji bez odczytania rzeczywistej usługi.

### ADR-105 — Dwa widoki, jedna prawda

**Rekomendacja:** `react-force-graph-3d` + Three.js pozostaje galaktyką; G6 to osobne, leniwie ładowane płótno 2D do DAG, hierarchii i analizy. Oba czytają ten sam GraphSnapshot i używają tych samych canonical IDs i wyboru aktualnej encji. G6 nie jest drugim magazynem danych. Animacje `emitParticle` wynikają ze zdarzeń lub są jawnie oznaczone DEMO.

### ADR-106 — Prywatność i dostęp

**Rekomendacja:** autorytatywny log i graf pozostają lokalne/prywatne, a frontend otrzymuje wyłącznie dozwolone metadane.

- Filtruj na serwerze przed wysyłką: węzły, krawędzie, etykiety, identyfikatory i agregaty/liczniki — wszystkie mogą wyciekać.
- Pliki, pamięć i osoby domyślnie ograniczone do jawnie zatwierdzonego zakresu.
- Vercel Preview pozostaje DEMO. Bez tokenu Bridge w JS, query-string, logach lub publicznym grafie.
- Odczyt grafu to inne uprawnienie niż wykonywanie polecenia. Kliknięcie węzła nie uruchamia narzędzia.
- Wbudowany przeglądarkowy EventSource nie daje swobodnego dodawania custom headers; trzeba świadomie wybrać bezpieczne uwierzytelnianie odczytu.

### ADR-107 — Co uznajemy za zatwierdzony kontrakt?

Zanim prace przejdą do kodu, osoba zatwierdzająca musi ocenić:
1. Jeden zestaw nazw/typów domenowych i migrację starych eventów.
2. Różnicę między `source+sequence`, serwerowym `cursor` i `graphVersion`.
3. Zdarzenia zamiaru kontra potwierdzenia wykonania; brak fałszywego DONE.
4. Sposób wyboru bezpiecznej lokalnej bazy/logu bez naruszania istniejącego Bridge.
5. Reguły izolacji uprawnień i odsiewania prywatnych agregatów.
6. Testowe scenariusze: duplikat, luka, offline, restart, błędny token, usunięty node, wycofanie zgody, brak WebGL.
7. Spójność nowego Blueprint z wcześniejszym master design i planami Superpowers.

## Decyzje jeszcze otwarte

| Pytanie | Wstępna rekomendacja | Jak rozstrzygnąć bez implementacji |
|---|---|---|
| Kto przechowuje log? | istniejący lokalny magazyn, jeśli nadaje się do trwałego logu | audyt read-only Bridge i źródeł danych |
| Jaki rzeczywisty format eventów Jev? | odrębny, uwierzytelniony adapter | przejrzeć aktualny emitter/schema |
| Gdzie jest prawda o pamięci? | zatwierdzony indeks memory z trwałym ID | przegląd danych Hermesa i Obsidian |
| Czy `task.completed` oznacza sukces narzędzia? | nie, osobny status wykonania | przejrzeć prawdziwe tool results |
| Czy hosted Graph ma odczytywać live? | nie domyślnie | osobny plan zgody + auth |
| Zaznaczony node ukryty filtrem? | zachować z wyraźnym alertem i nie latać kamerą | sprawdzić scenariusz UX na makiecie |
| Czy event/evidence to węzeł? | opcjonalnie przy L3, nie zawsze | scenariusze UX + oszacowanie wolumenu |

## Zasady bezpiecznego dalszego planowania

- Wszystkie ADR mają status **proposed**; nie zatwierdzono ich w imieniu użytkownika.
- Można edytować wyłącznie dokumentację feature branch. Bez zmian w `main`, kodzie, runtime Hermes/Bridge, CI czy wdrożeniu.
- Po akceptacji ADR ujednolicić wcześniejszą Master Spec i cztery plany, **zanim** implementator zacznie kodowanie.

**Źródła:** [Blueprint 02](02-graph-ontology-contracts.md), [Blueprint 03](03-event-bus-protocol.md), [Master Spec](../../superpowers/specs/2026-10-08-jarvis-graph-v2-master-design.md), [React Force Graph](https://github.com/vasturiano/react-force-graph).
