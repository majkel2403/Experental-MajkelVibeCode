# 10 — Scenariusze odbioru i dowody wykonania (PLAN)

**Data:** 2026-10-09. **Status:** plan/test design only. **Nie uruchomiono testów.**  
**Scope:** Jarvis Graph v2.0, Gate 0/A/B/C/D. **Branch:** `feat/jarvis-graph-3d`. **Main, runtime i deployment:** bez zmian.

## Cel

Każde „działa” musi mieć: obserwowalny scenariusz, jednoznaczną oczekiwaną reakcję, kryterium PASS/FAIL, dokładny SHA, źródło dowodu (fixture albo rzeczywisty autoryzowany runtime) oraz brak nieuprawnionych wycieków. Same ekrany, status Vercel READY, tekst modelu „zrobione” albo zielony build nie potwierdzają realnych akcji narzędzi.

## Terminologia i reguły odbioru

- **PLAN** — plan testu, nigdy nie sugeruje, że został uruchomiony.
- **DEMO** — syntetyczne deterministyczne zdarzenia/encje; pozwala zaakceptować UI i reducer, nie prawdziwe dane Hermesa.
- **SOURCE VERIFIED** — zdarzenie ma pochodzenie z rzeczywistego autoryzowanego producenta oraz potwierdzenie skutku tam, gdzie jest to wymagane.
- **BROWSER VERIFIED** — udokumentowana interakcja z prawdziwym działającym renderem w przeglądarce.
- **BLOCKED** — brak wymaganej zgody/źródła/urządzenia, bez zastępowania testu symulacją.
- **PASS** — oczekiwany wynik udokumentowany przy *tym samym SHA* co badany build.
- **FAIL** — scenariusz nie spełnił kryteriów, z zapisanym artefaktem błędu.

Każdy rekord odbioru powinien zawierać:
```text
case_id:
gate:
github_branch:
git_sha:
deployment_id_or_local_build:
environment: [OS, browser, version, GPU, viewport, DPR]
source: DEMO | SOURCE VERIFIED | BROWSER VERIFIED
fixture_or_source_ref:
preconditions:
actions:
expected:
observed:
result: PASS | FAIL | BLOCKED | NOT RUN
evidence: [redacted log, test result, screenshot, video, metrics]
reviewed_by:
notes:
```

## Scenariusze kontraktu i Graph Store — Gate A

| ID | Given — When | Then (konkretne kryterium) | Dowód |
|---|---|---|---|
| G-A01 | poprawny snapshot `GraphEntity` i `GraphRelation` → walidacja | zaakceptowane dokładnie te IDs/edges, poprawne schemaVersion | unit test i fixture |
| G-A02 | dwa węzły z tym samym ID | cała migawka odrzucona, stary graf bez zmian | unit test |
| G-A03 | krawędź wskazuje usuniętego/nieistniejącego noda | brak dangling edge w zatwierdzonym stanie; jasna polityka cascade/reject | unit test |
| G-A04 | patch `baseVersion != graphVersion` | brak częściowej mutacji; stan RESYNC_REQUIRED | unit test |
| G-A05 | encja ma starą `revision` | nie nadpisuje świeższego statusu/metadanych | unit test |
| G-A06 | usunięcie encji z połączeniami | związane krawędzie usunięte, selekcja UI nie wskazuje ghost-node | unit + integration |
| G-A07 | ten sam snapshot 3D/G6 | jednakowe canonical entity IDs i liczba dozwolonych relacji | adapter tests |
| G-A08 | sztuczne `traffic/core/hub` z DEMO | nie stają się typami domenowymi w kanonicznym store | migration fixture |
| G-A09 | prywatna encja pod restrykcją dostępu | brak encji, krawędzi i pośrednio ujawniających liczników w viewer snapshot | security fixture |
| G-A10 | nieznane `kind`, nieprawidłowe ISO time, nietypowe atrybuty | jawna walidacja/reject; bez naiwnej interpretacji | contract tests |

## Scenariusze przeglądarki i kamer — Gate A/B

| ID | Given — When | Then | Dowód |
|---|---|---|---|
| G-B01 | odpalony Graph DEMO na desktopie | prawdziwy canvas WebGL albo czytelny fallback, bez błędów JS | Playwright screenshot 1440×900, console |
| G-B02 | WebGL zablokowany / utrata kontekstu | kontrolowany fallback z wyszukiwaniem i szczegółami, bez białej strony | browser fixture |
| G-B03 | klik Hermes z L0 | L1 pokazuje jego rzeczywistą strukturę w fixture, a nie samo zbliżenie kamery | przed/po + visible nodes |
| G-B04 | klik agent na L1 | L2 pokazuje 1-hop/2-hop sąsiadów, inspektor i ścieżki | E2E |
| G-B05 | otwórz dowód wykonania | L3 pokazuje status, correlation ID i źródło potwierdzenia (lub jasno „brak”) | E2E fixture |
| G-B06 | szybkie kliknięcia A→B→C | ostatnie kliknięcie C decyduje o kamerze/inspektorze; brak snap-back | E2E |
| G-B07 | szukaj i filtruj, aż zaznaczony node zniknie | widoczny komunikat/bezpieczne wyczyszczenie; żadnego lotu do brakującej pozycji | E2E |
| G-B08 | Reset na pustym / 1-node / 300-node grafie | brak NaN, kamera obejmuje wszystkie widoczne obiekty | pure math + E2E |
| G-B09 | hover sąsiedztwa, a następnie pointer leave | relacje 1-hop są czytelne, wszystkie elementy wracają do normalnego stylu | E2E |
| G-B10 | Expand/Collapse tego samego klastra 20 razy | stabilne IDs, brak duplikatów i niekończącego się wzrostu zasobów | E2E + renderer.info |
| G-B11 | Pause Events w czasie aktywnego cząstkowania | nowe cząstki demonstrujące eventy nie powstają; kamera i wybór nadal działają | E2E |
| G-B12 | użytkownik obraca kamerą w trakcie cinematic focus | automat zostaje anulowany natychmiast | E2E |
| G-B13 | prefers-reduced-motion włączony | brak przymusowej orbity, automatycznych fly-through, informacji dostępnych nadal | E2E |
| G-B14 | mobile 390×844 + 320px | touch zoom/rotation, wygodny inspektor, brak zakrycia kluczowych akcji | Playwright + real device spot check |
| G-B15 | tooltip node z napisami `<img onerror...>` | żaden HTML/JS nie wykonuje się, tekst pozostaje bezpieczny | security E2E |

## Scenariusze autentycznych zdarzeń — Gate C

**Uwaga:** C wymaga źródła rzeczywiście autoryzowanego; symulacja może przejść test kontraktu, lecz nie daje PASS w teście **REAL-LIVE**.

| ID | Given — When | Then | Dowód |
|---|---|---|---|
| G-C01 | Hermes emituje `task.created` z verified source | nowy task jest widoczny jako ten sam canonical ID w timeline i grafie | producer ID + redacted event + snapshot |
| G-C02 | narzędzie zaczyna działanie, potem Bridge potwierdza sukces | task/tool uzyskuje poprawny status, dowód i jednorazowy event particle | Bridge receipt + screenshot |
| G-C03 | model generuje „zrobiłem” bez tool receipt | UI nie pokazuje wykonanej operacji jako VERIFIED SUCCEEDED | negative fixture |
| G-C04 | retry dokładnie tego samego `(source,id)` 100× | jeden wpis logu i jeden efekt projekcji, ACK powtórzony | integration |
| G-C05 | trwałe P0 czeka, Bridge jest offline, producent restartuje się | event nadal jest w outbox i wysyła się po wznowieniu | controlled restart |
| G-C06 | ingest zapisał event, a ACK zaginął | retry nie tworzy duplikatu; zwraca pierwotny cursor | fault injection |
| G-C07 | w źródle przychodzi sekwencja 1,3,2 | zidentyfikowana luka i replay/bezpieczny resync | ordering test |
| G-C08 | dwa różne sources mają sequence 42 | żadnego fałszywego globalnego porządku | two-producer fixture |
| G-C09 | klient odłączył SSE | stary graf widoczny, status STALE + ostatni sync | browser integration |
| G-C10 | klient wraca po zbyt starej pozycji kursora | nowy dozwolony snapshot zamiast częściowego odtworzenia | integration |
| G-C11 | pamięć naprawdę została zapisana | nowy memory node tylko po potwierdzonym persisted write | source evidence |
| G-C12 | zmieniają się uprawnienia w trakcie streamingu | stare IDs/cursor odrzucone, nowy viewer-scoped snapshot | security integration |
| G-C13 | błędny X-Bridge-Token, spoofed source | odrzucona produkcja bez modyfikacji grafu | auth test |
| G-C14 | 1000+ niekrytycznych update podczas P0 approval | approval nigdy celowo nie ginie; zatwierdzenia widoczne | load test |
| G-C15 | nieudana akcja, timeout, denied, cancelled | wszystkie stany są rozróżnione, żadnego pozornego SUCCESS | receipt matrix |

## Scenariusze G6, wydajności i wdrożenia — Gate D / Release

| ID | Given — When | Then | Dowód |
|---|---|---|---|
| G-D01 | ten sam node wybierany w 3D i G6 | identyczne ID, relacje i inspektor | cross-view E2E |
| G-D02 | `depends_on` zawiera cykl A→B→A | ostrzeżenie i uczciwy fallback; brak zepsutego DAG | layout test |
| G-D03 | 500 węzłów / 1500 krawędzi | zmierzone p50 FPS, p95 frame time, input latency; wynik kontra próg, bez zgadywania | browser benchmark |
| G-D04 | 2000/4000 | LOD/instancing/agregacja bez wielosekundowego lockup | browser benchmark |
| G-D05 | 50 zmian widoku, 20 mount/unmount | Three.js memory counters stabilizują się po cleanup | perf/leak |
| G-D06 | G6 dopiero na kliknięcie Workspace | G6 ładowany osobnym chunkiem, nie obciąża startu galaktyki | network waterfall |
| G-D07 | Preview Vercel ma READY i protection | aplikacja faktycznie renderuje się po autoryzowanym logowaniu | deployment/browser |
| G-D08 | błąd wykryty na Preview | brak skutków w main/produkcji, możliwy powrót do ostatniego known-good | release drill |
| G-D09 | logi, screenshot i telemetry | brak prywatnych ścieżek, promptów, tokenów i surowych payloadów | security evidence review |
| G-D10 | wybrano low quality i reduced motion | scene nadal funkcjonalna, semantyka identyczna | E2E |

## Evidence trace for critical end-to-end behavior

### Workflow: udokumentowany sukces narzędzia

```text
Hermes task.created (source ID verified)
  → Bridge ingest persisted (cursor assigned)
  → Projector task assigned / running
  → Hermes tool.started (correlation ID)
  → Bridge actual outcome succeeded (proof reference)
  → Projector updates canonical GraphEntity revision
  → Graph Client applies compatible GraphPatch
  → same task ID shown in 3D, G6 and Inspector
  → only corresponding edge emits one visible event particle
  → timeline displays source / time / evidence reference
```

Any missing step makes outcome **BLOCKED** for REAL-LIVE acceptance, even if the DEMO looks correct.

### Workflow: odmowa lub awaria

```text
Denied auth / invalid schema / Bridge down / event gap
  → no unauthenticated state changes
  → preserve last valid graph and provenance
  → show UNAUTHORIZED / STALE / RESYNC_REQUIRED with timestamp
  → never claim SUCCESS on LLM-generated text alone
```

## Proposed report template

```text
# Gate [0/A/B/C/D] Verification Report
- Branch:
- Tested commit SHA:
- Compared against main SHA:
- Device / OS / Browser / GPU:
- Dataset and fixture seed:
- Allowed source mode:
- Commands / test IDs executed:
- Passed:
- Failed:
- Blocked:
- Browser screenshots/videos:
- Security findings:
- Performance measured:
- Unresolved P0/P1:
- Release action taken: NONE / PREVIEW (if explicitly approved)
- Independent reviewer:
- Signed-off gate: YES / NO
```

## STOP conditions

- Any unauthenticated Bridge exposure, token in browser, private data in synthetic fixture, unverified success presented as completed, lost P0 event, or silent patch-version mismatch blocks Gate C.
- Graph blank canvas, broken fallback or incorrect inspector selection blocks Gate A/B.
- Heavy FPS regression may block high-density features, but can be mitigated by shipping conservative quality-tier defaults once documented and measured.
- Missing authorized real source marks a LIVE scenario BLOCKED, not PASS via DEMO.
- No merge to main or production deployment without separate explicit permission.

## Coverage mapping

- [01 Architecture](01-system-architecture.md): E2E G-C01..G-C15, G-D01.
- [02 Ontology](02-graph-ontology-contracts.md): G-A01..G-A10.
- [03 Event Bus](03-event-bus-protocol.md): G-C03..G-C15.
- [04 Interactions](04-interaction-semantic-zoom.md): G-B03..G-B14.
- [05 Visual/performance](05-visual-performance-bible.md): G-B01..G-B15, G-D03..G-D06.
- [06 Security](06-security-quality-deployment.md): G-A09, G-B15, G-C12..G-C15, G-D07..G-D10.
- [07 Playground](07-graph-playground-spec.md): deterministic 289/500/2000 synthetic fixture and A/B visual benchmark before v2 release.
- [08 Proposed ADR](08-architecture-decisions-candidate.md): contract consistency at Gate 0.
- [09 Read-only source verification](09-read-only-source-verification-plan.md): blocks claims of real source integration until verified.

**Reminder:** These are future acceptance cases. None is reported as executed or passed by this document.
