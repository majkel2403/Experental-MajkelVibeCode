# 11 · Agent — przebieg polecenia, plany, rutyny, cofanie, pamięć, proaktywność

Decyzje sędziego Jev (router R1–R16, progi, prywatność) są opisane w [JEV-PLAN.md](../JEV-PLAN.md) — tu tylko to, co go otacza.
Niepewne polecenia przy osiągalnym Hermesie trafiają do niego zamiast pytania „Chodzi o…?” ([ADR 0005](../adr/0005-niepewny-jev-oddaje-hermesowi.md)).

## 1. Przebieg jednego polecenia (stan obecny, ✅)

```
wejście (tekst / głos / sygnał / rutyna)
 │
 ├─ trwa pytanie Jarvisa? → to jest odpowiedź (J.ask.answer, D15 „no dobra” przez Jeva)
 ├─ „cofnij” / akt „cancel” (D16) → J.undo.run()
 │
 ├─ J.flow.fast:
 │    parser pewny + A3 → wykonaj od razu (bez Jeva)                         [outcome: fast]
 │    inaczej Jev decide (intencja, ryzyko, dwuznaczność, „to/tu”, akt dialogowy)
 │      → J.policy.route (R1–R16) → exec / ask_intent / ask_alternatives / fill_enum / ask_slots / hermes
 │
 ├─ Hermes (pętla narzędzi, plan, budżety 10 tur / 25 narzędzi / 90 s, streszczenia; odpowiedź bez narzędzia na prośbę o czynność → jedno przypomnienie, ADR 0006)
 │    każde wywołanie: strażnik D9, wstrzyknięcia D10, pamięć D12 → rejestr (zgody)
 │    po odpowiedzi: weryfikacja D6 (P2)
 │
 └─ brak Hermesa → parser lokalny (jak dotąd) → „Nie rozumiem” z podpowiedziami
```

Wyjście: odpowiedź w czacie (+ mowa wg D13), zmiany widoczne na pulpicie, wpis w Process Log i dzienniku Jeva, chip „Cofnij” dla A2.

## 2. Formalne polecenie „cofnij” (🆕 W1)

Dziś „cofnij” działa jako zdanie specjalne w `J.brain.handle` (✅) i przez przycisk. 🆕:
- polecenie `undo {count?, minutes?}` w rejestrze (dostępne dla palety, Hermesa i rutyn);
- `undo_list` — lista ostatnich akcji do cofnięcia (opis, czas, kto: ja / Jev / Hermes / rutyna);
- `Ctrl Z` poza polami tekstowymi = `undo`;
- **cofanie wielu**: od najnowszej do najstarszej, zatrzymuje się na pierwszym błędzie z komunikatem „Cofnięto 2 z 3 — „X” nie dało się cofnąć, bo …”;
- **kolizje**: jeśli obiekt zmieniono później ręcznie (np. notatka edytowana po dopisaniu przez Jarvisa), cofnięcie pyta „Notatka zmieniła się po tej akcji. Cofnąć mimo to?” (porównanie `ts`).
- Wpisy z UI (kliknięcia) też trafiają na stos, gdy UI przejdzie przez rejestr (W1, zasada 1 z [02](02-obiekty-akcje.md)).

## 3. Plany wieloetapowe

✅ Hermes może zwrócić `<plan>` → kroki w Process Log i karcie „Wykonywanie”, zdarzenia `plan.created/step`, pauza przy przekroczeniu budżetu z pytaniem „Kontynuować?”.

🆕 W4 (`plan_control`):
| czynność | jak | skutek |
|---|---|---|
| pauza | „wstrzymaj”, przycisk ‖ przy pasku zadania | Hermes kończy bieżące narzędzie, nie zaczyna kolejnego; stan PAUSED |
| wznów | „dokończ”, ▶ | pętla rusza od następnego kroku |
| pomiń krok | „pomiń ten krok” | do modelu idzie informacja „użytkownik pominął krok N” |
| stop | „stop”, `Esc`, ■ | przerwanie (✅ `J.brain.abort`); zrobione kroki zostają, lista odwracalnych w chipie „Cofnij wszystko z tego zadania” |

Szablony planów (🆕 W4) — gotowe rutyny z §4: poranek, porządek na pulpicie, przegląd tygodnia.

## 4. Rutyny (🆕 W4)

Dziś: wbudowane briefing poranny i podsumowanie dnia (godziny w Ustawieniach, `context.js`).

Model:
```js
routine = {
  id, name,                                  // 1–40 znaków, unikalna
  trigger: { kind: 'time', at: '07:30', days: ['pn','wt','sr','cz','pt'] }   // albo:
         | { kind: 'event', event: 'task-overdue'|'market-alert'|'timer-ended'|'startup'|'online' }
         | { kind: 'phrase', phrase: 'start pracy' }                          // zdanie uruchamiające
         | { kind: 'manual' },
  steps: [ { command: 'get_weather', args: {} } | { say: 'podsumuj moje zadania na dziś' } ],   // maks. 12
  enabled: true, lastRun: null, runs: 0, created
}
```

Zasady:
1. Kroki to polecenia rejestru (z argumentami sprawdzanymi przy zapisie) albo zdanie do Hermesa (`say`).
2. **Źródło `routine` jest niezaufane**: kroki A0 w chwili wykonania zawsze pytają (✅ strażnik dla `fullContext`); kroki A1/A2 wykonują się, bo użytkownik zatwierdził rutynę przy tworzeniu — ale każdy ma „Cofnij”.
3. Wyzwalacz czasowy w ciszy nocnej lub przy ukrytej karcie → wykonanie przy następnym otwarciu z pytaniem „Rutyna „Poranek” miała się wykonać o 7:30. Uruchomić teraz?” (tak jak dziś briefing ✅ `routinesRun`).
4. Wyzwalacz zdaniowy: zdanie dokładne lub bardzo bliskie (parser) → uruchomienie; Jev nie wymyśla rutyn.
5. Tworzenie zdaniem: Hermes zamienia opis na model rutyny → podgląd („Rutyna „Poranek”: o 7:30 w dni robocze: 1. pogoda, 2. zadania na dziś, 3. układ praca. Zapisać?”) → A1.
6. Edytor w Ustawieniach → Agent → Rutyny: lista, włącz/wyłącz, edycja kroków (przeciąganie kolejności), „Uruchom teraz”, historia 10 uruchomień.
7. Limity: 30 rutyn, 12 kroków, rutyna nie może uruchomić rutyny (brak pętli).

## 5. Pamięć

✅ `memory_remember/recall/forget`, fakty w kontekście każdej rozmowy, ocena poufności (lokalna heurystyka + Jev D12), trwałości.
🆕 W3: `memory_edit`, zakresy, TTL, karta „Co o mnie wiesz” ([08](08-aplikacje.md) §11). Zasada: Jarvis **nie zapamiętuje sam** faktów bez polecenia — tylko proponuje: „Zapamiętać, że wstajesz o 6?” (chip Tak/Nie), maks. 1 propozycja na rozmowę.

## 6. Proaktywność

✅ Tryb `quiet` (tylko powiadomienia) / `active` (Hermes może sam zareagować na sygnał: zaległe zadanie, alert kursu, koniec minutnika), limit `proactiveMax` na godzinę, cisza nocna, pilność sygnału przez Jeva (D7), ranking powiadomień (D14).

🆕 W4 — co Jarvis może powiedzieć/zrobić **bez pytania** w trybie aktywnym:
| rodzaj | przykład | wolno? |
|---|---|---|
| informacja | „Za 10 minut spotkanie.” | tak (w limicie) |
| propozycja | „Przełożyć zaległy trening na jutro?” (chip) | tak |
| odczyt/nawigacja (A3) | otwarcie Harmonogramu przy zaległym zadaniu | ⚑ nie — tylko propozycja (użytkownik mógł pracować w innym oknie) |
| zapis (A2+) | przesunięcie zadania | nigdy bez zgody |

## 7. Weryfikacja i ponawianie

✅ D6: po odpowiedzi Hermesa Jev ocenia zgodność z wynikami narzędzi (P2); niska → ostrzeżenie „⚠ Odpowiedź może nie zgadzać się z wynikami”.
🆕 W4: przy ostrzeżeniu — jedna automatyczna prośba do Hermesa „Sprawdź odpowiedź z wynikami narzędzi” (bez ponownego wykonywania narzędzi zapisujących); drugi raz → tylko ostrzeżenie. Ponowienie po błędzie sieci Hermesa: 1× po 2 s, potem silnik lokalny (✅ częściowo `RECOVERING`).

## 8. Kontekst dla modelu (Context Packet)

✅ `J.context.packet()`: czas, użytkownik, połączenia, pulpit (okna, aktywne, widgety, minutnik, skupienie), zadania dziś, notatki (tytuły), sygnały, ostatnie zdarzenia, pamięć. 🆕 do dodania wraz z funkcjami: tryb przestrzeni, przypięte okna, widoki (`state()` aktywnego okna), rutyny (nazwy), wątek czatu, liczba elementów na stosie „Cofnij”.

## 9. Kryteria akceptacji

- `undo count=3` cofa 3 ostatnie akcje w odwrotnej kolejności; kolizja z późniejszą edycją pyta.
- Rutyna czasowa pominięta przy zamkniętej karcie pyta po otwarciu (raz).
- Krok A0 w rutynie zawsze pyta, także jeśli użytkownik dał „Zawsze” dla tego polecenia w czacie (źródło `routine` ≠ zaufane).
- Pauza planu zatrzymuje przed następnym narzędziem (test na atrapie SSE z 3 wywołaniami).

<!-- polecenia:start (generuje tools/gen-spec.js) -->

## Planowane polecenia tej części

Wszystkie zaplanowane polecenia tej części są już w rejestrze — zobacz [katalog-polecen.md](katalog-polecen.md).

<!-- polecenia:end -->
