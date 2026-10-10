# 13 — Cinematic Event Director: reżyseria prawdziwych zdarzeń

**Status:** DRAFT / specyfikacja animacji, nie implementacja. **Data:** 2026-10-10.  
**Cel:** Jeden przewidywalny język ruchu i światła, który pokazuje prawdziwe zmiany Jarvisa i nie wprowadza użytkownika w błąd. Wyróżniamy animację atmosferyczną, DEMO oraz ruch będący reakcją na zweryfikowane zdarzenie.

## 1. Czego NIE robi Cinematic Director

- Nie uruchamia agenta, nie wykonuje narzędzia i nie zapisuje pamięci.
- Nie wymyśla historii, nie zgaduje postępu i nie traktuje odpowiedzi LLM jako dowodu powodzenia.
- Nie przesuwa użytkownikowi kamery po każdej akcji w tle.
- Nie odtwarza setek identycznych pulsów podczas lawiny eventów.
- Nie trzyma własnej kopii „prawdy” o statusach. Źródłem jest już zatwierdzony \`GraphStore\` i historia \`JarvisEventV1\`.

## 2. Trzy strumienie sterowania sceną

\`\`\`mermaid
flowchart LR
  E["Zweryfikowany Event Bus"] --> P["Graph Projector + Store"]
  P --> D["Director: semantic visual cues"]
  U["User controls / camera intent"] --> D
  Q["Quality / reduced-motion policy"] --> D
  D --> A["Camera Director"]
  D --> G["Galaxy Visual Adapter"]
  D --> T["Timeline / Inspector"]
\`\`\`

**Priorytet sterowania:** użytkownik > krytyczne ostrzeżenia na interfejsie > animacje wydarzeń > tło atmosferyczne. Alert krytyczny może zmienić oznaczenie w UI, lecz nie powinien bez pytania przejąć kamery.

## 3. Klasy sygnałów

| Klasa | Źródło | Dopuszczalna wizualizacja | Warunek |
|---|---|---|---|
| Atmospheric | zegar sceny, kontrola jakości | gwiazdy, bardzo powolny ruch | nigdy nie podpisywać jako LIVE |
| DemoEvent | syntetyczne fixture'y Playground | połączenia, puls, replay | wyraźne DEMO / SIMULATED |
| VerifiedEvent | zaakceptowane zdarzenie i poprawna projekcja | jednorazowy particle/flash, status i ślad | pokazuje provenance; bez fałszywej pewności |
| DerivedInsight | projektor lub uprawniona analiza | wyróżnienie potencjalnych zależności | etykieta „sugestia”, nigdy „fakt” |
| SystemAlert | transport/bezpieczeństwo/awaria | stały znacznik + panel incydentu | źródło potwierdzone lub połączenie rzeczywiście STALE |

## 4. Słownik wizualny (status ≠ grupa)

Kolor bazowy klastra:
- Hermes: \`#B386FF\`
- Jev: \`#FF6CB8\`
- Projects: \`#628BFF\`
- Memory: \`#55EBBB\`
- Tools: \`#FFD075\`
- Events: \`#61E7FF\`

Status pokazujemy **oddzielnie** od koloru grupy:
- **IDLE:** spokojny materiał i brak ruchu sygnalizującego aktywność;
- **QUEUED:** cienki pierścień oczekiwania, nie symulować postępu;
- **RUNNING:** dyskretny puls i aktywny obrys po prawdziwym \`started\`;
- **BLOCKED:** bursztynowy ring i przyczyna w inspektorze;
- **FAILED:** krótki czerwony sygnał, potem stabilny komunikat tekstowy;
- **SUCCEEDED:** jednorazowa fala ukończenia dopiero po autorytatywnym dowodzie;
- **STALE:** neutralny symbol połączenia i timestamp, NIE kolor „wszystko działa”;
- **SELECTED:** wyraźna biała obwódka niezależna od wyniku działania.

Każdy status musi być czytelny także bez rozróżniania barw i bez animacji.

## 5. Katalog: Event → Visual Cue

| Zdarzenie / sytuacja | Zmiana danych (poza Directorem) | Animacja | Kamera | Dowód |
|---|---|---|---|---|
| \`task.created\` | nowy task, właściciel/projekt | krótki „node appear” | nie rusza | event ID, task ID |
| \`task.assigned/delegated\` | relacja \`assigned_to\` / \`delegated_to\` | jednorazowy sygnał po relacji | nie rusza | source/correlation |
| \`model.started\` | status modelu/run | przygaszony puls wokół agenta | nie rusza | event ze źródła |
| \`judge.decision\` | decyzja Jev, jeśli Jev jest podłączony | krótki akcent różowy | nie rusza | decyzja / provenance |
| \`tool.started\` | nowa próba tool call | \`emitParticle\` po istniejącym skierowanym połączeniu | nie rusza | callId + source |
| \`tool.completed\` | dowód i nowy status narzędzia | arrival + success flash *jeśli outcome potwierdzony* | nie rusza | Bridge receipt |
| \`tool.failed\` | failed/denied/timeout | krótki warning na narzędziu i zadaniu | nie rusza | error category (bez sekretów) |
| \`approval.requested\` | task blocked/pending approval | bursztynowa latarnia | brak przejęcia | ID wniosku i uprawnienie |
| \`memory.written\` | zatwierdzony \`memory\` node | 1× mint „birth pulse” | nie rusza | persistence proof |
| \`task.completed\` | zamknięcie zadania wg odpowiedniego źródła | pojedyncza spokojna fala | tylko FOLLOW LIVE | status + provenance |
| stream disconnected | connection status=STALE | wyłączenie fałszywych sygnałów live | nie rusza | last received time |
| duplicate event | brak nowej zmiany domenowej | **brak animacji** | nie rusza | dedupe \`(source,id)\` |
| event gap / resync | tylko stan synchronizacji | subtelny wskaźnik „resync” | nie rusza | cursor / graphVersion |

**Nazwa eventu nie przesądza o sukcesie:** \`task.completed\` i \`tool.completed\` muszą mieć ustalone znaczenie po inspekcji źródła. Nie rysować sukcesu, jeśli potwierdzono wyłącznie zakończenie generacji tekstu.

## 6. Model Cue, a nie „animacja zaszyta w App.tsx”

Przyszły \`VisualCue\` (propozycja kontraktu, nie kod):
- \`cueId\` — deterministycznie pochodny od \`source+event.id+cueType\`;
- \`entityIds\` i opcjonalny \`edgeId\` ze wspólnej ontologii;
- \`kind\`: \`node-appear | pulse | edge-travel | warning | success | stale | no-op\`;
- \`priority\`: \`critical | meaningful | ambient\`;
- \`sourceMode\`: \`DEMO | LIVE | REPLAY\`;
- \`occurredAt\`, \`durationMs\` i \`proofRef\` (jeśli istnieje);
- \`expiresAt\`, żeby spóźniony event nie przestawiał starej sceny.

Director emituje tylko cue **po zatwierdzonym GraphPatch**. Jeśli węzeł/krawędź nie jest widoczna przez LOD, cue może pojawić się w dozwolonym rodzicu/inspektorze; nie tworzyć „widmowych” obiektów wyłącznie dla efektu.

## 7. Cykl życia efektu

\`\`\`text
event arrived
  → source validated and authorized
  → event deduplicated / replay sequence checked
  → GraphPatch committed
  → target visible and allowed?
      yes → queue bounded VisualCue
      no  → update timeline/aggregate without ghost node
  → playback respects pause / reduced motion / frame budget
  → cue ends and transient GPU objects are released
\`\`\`

Animacje transient nie mogą same zmieniać \`GraphStore\` ani numeru wersji.

## 8. Sterowanie kamerą

| Tryb | Automatyczna kamera? | Zasada |
|---|---|---|
| MANUAL / zwykły podgląd | nie | user orbit, zoom, pan wygrywa |
| FOCUS | tak, tylko po jawnym kliknięciu | najnowsze polecenie wygrywa |
| FOLLOW LIVE | tak, jawny opt-in | tylko skorelowane zdarzenia wybranej misji |
| CINEMATIC SHOWCASE | tak, jawny DEMO lub prezentacja | ścieżka kamery jest deterministyczna |
| REPLAY | opcjonalnie, świadomy wybór | nigdy nie uruchamia akcji runtime |
| REDUCED MOTION | bez płynnych przelotów | natychmiastowy focus / statyczny highlight |

**Manual override:** dotknięcie/pan/wheel/Esc przerywa choreografię. Nie wolno wznowić starego tweeningu po opóźnionym callbacku. \`FOLLOW LIVE\` wymaga osobnego wznowienia.

## 9. Zasady przejść i czasu (propozycja do testowania)

| Cue | Zakres czasu | Priorytet | Limit |
|---|---|---|---|
| Node appear | 350–650 ms | meaningful | pojedynczy na nowy zweryfikowany node |
| Edge travel | 300–900 ms | meaningful | twardy globalny budget particle |
| Decision flash | 300–550 ms | meaningful | jedna zmiana na zatwierdzoną decyzję |
| Warning | 350–850 ms | critical | sygnał krótki; stan pozostaje jako label |
| Success wave | 350–750 ms | meaningful | jeden na outcome |
| Enter cluster camera | 450–1100 ms | user | można przerwać |
| Overview reveal | 900–1600 ms | ambient / DEMO | opcjonalny; reduced motion = 0 |

To są **wartości startowe**, nie zmierzone optimum. Parametry będą sprawdzane w Graph Playground na tych samych fixture'ach.

## 10. Backpressure, gęstość i wpływ na wydajność

- Maksymalna liczba aktywnych cues/particles zależy od QualityTier (np. high 128, medium 64, low 16–32, do walidacji).
- Burst 1000 tool events: priorytetowy status i historia pozostają pełne, ale animacje mogą zostać zagregowane jako jedna fala/stan z liczbą aktualizacji.
- Ukryte karty i utrata WebGL: zatrzymaj kosztowne ambient FX, zachowaj stan i historię, nie raportuj wykonania „animacji” jako sukcesu eventu.
- Niedopuszczalne jest przegrzewanie D3 force przy samym pulsie, zmianie koloru czy hover.
- Reuse geometrii/tekstur; Bloom i postprocessing mają jawnego właściciela zasobów z cleanup.

## 11. Oddzielne PAUSE, FREEZE i REPLAY

- **PAUSE EVENTS:** zatrzymuje odtwarzanie cue/strumienia wizualnego zgodnie z jawnie opisanym cursor policy. Nie wyłącza interakcji z grafem, nie usuwa ostatniego snapshotu.
- **FREEZE SCENE:** zatrzymuje fizykę/render motion; komunikat wyjaśnia ewentualną utratę możliwości interakcji wynikającą z biblioteki. To nie jest odłączenie producenta.
- **REPLAY:** deterministycznie odtwarza zapisany log z tego samego zakresu autoryzacji i wersji kontraktu; może sterować kamerą tylko po opt-in.
- **RESET:** usuwa wyłącznie efekty transient i opcjonalnie wraca do wyliczonego \`fit\`; nie kasuje eventów domenowych.

## 12. Scenariusz filmowy: „Budowa aplikacji przez zespół”

\`\`\`text
ACT I — Arrival: Universe pokazuje główne klastry
ACT II — Mission started: zadanie pojawia się przy Hermesie
ACT III — Delegation: pojawiają się skierowane relacje do agentów
ACT IV — Execution: prawdziwy Bridge receipt aktualizuje narzędzie/zadanie
ACT V — Verification: test ma osobny status i dowód
ACT VI — Memory: dopiero potwierdzony zapis powoduje memory birth
ACT VII — Resolution: zadanie kończy się, kamera zostaje w rękach użytkownika
\`\`\`

Wariant DEMO może odtworzyć tę samą scenę na syntetycznych eventach, ale nazwa „LIVE” jest zarezerwowana dla zweryfikowanego połączenia i aktualnego snapshotu.

## 13. Planowane testy odbiorcze — nieuruchomione

1. Dwa identyczne eventy \`(source,id)\` → jeden cue.
2. Event znany, ale 3D edge ukryta przez filtr → żadnego nieautoryzowanego obiektu, wpis timeline pozostaje.
3. Hermes generuje „zrobione”, Bridge nie potwierdza → brak zielonego success wave.
4. Event \`approval.requested\` wśród 1000 P2 → ostrzeżenie nadal czytelne.
5. Manual pan podczas FOLLOW LIVE → natychmiastowy STOP auto-camera.
6. PAUSE EVENTS podczas aktywnego link particle → kolejne event cues nie startują, kamera działa.
7. Reduced motion → wszystkie statusy odczytywalne statycznie i bez latania.
8. Różne QualityTier i DPR → liczba particle i koszt efektywny ograniczone.
9. Mount/unmount 20× → brak monotonicznego wycieku Three.js zasobów.
10. Replay ma identyczną sekwencję cues na tym samym synthetic log i seed; brak realnych komend.
11. Stream STALE → brak świeżych sygnałów live, jest timestamp ostatniego eventu.
12. Alert bezpieczeństwa → nie wyświetla surowego, potencjalnie poufnego payloadu.

## 14. Pytania do zatwierdzenia

- Czy w trybie normalnym jakikolwiek event może przejąć kamerę? Rekomendacja: **nie**.
- Czy L3 Event Evidence otwiera osobną scenę 3D, czy panel z trace? Rekomendacja: panel i lokalny highlight.
- Czy ambient gwiazdy mogą ruszać się w LIVE? Tak, ale są „ambient”, nie sygnałem aktywności.
- Jak długo trzymać cues dla eventu przychodzącego z opóźnieniem? Ustalić z UX i replay, po przetestowaniu.
- Jak odróżnić błąd narzędzia od awarii transportu? Oddzielne statusy i ikony.

**Powiązania:** [Interaction & Semantic Zoom](04-interaction-semantic-zoom.md), [Visual Bible](05-visual-performance-bible.md), [Event Bus](03-event-bus-protocol.md), [Mission Control](11-mission-control-design.md), [Second Brain](12-second-brain-graph-design.md), [Acceptance](10-acceptance-scenarios-and-evidence.md).

**Granica:** To projekt choreografii, nie faktyczna implementacja. Żaden system ani \`main\` nie został zmodyfikowany.
