# Jarvis OS MVP — komplet dokumentów do pracy

**Aktualizacja:** 2026-10-11 · **Status:** dokumenty i audyt częściowy gotowe; MVP **NIEWDROŻONE**, testy E2E **NIEURUCHOMIONE**.
**Zakres:** istniejący `majkel2403/Jarvis-` z lokalnego laptopa, Hermes + Bridge, bez przebudowy i dublowania.
**Gałąź dokumentów:** `docs/jarvis-graph-v2-mission-brain-motion` repo `majkel2403/Experental-MajkelVibeCode`; `main` nietknięty.

## Kolejność czytania

| Nr | Dokument | Rola | Stan |
|---:|---|---|---|
| 01 | [Zakres i cel MVP](01-MVP-ZAKRES-I-CEL.md) | Definicja sukcesu i minimalne funkcje | SZABLON + przykłady |
| 02 | [Szablon audytu](02-AUDYT-STANU-FAKTYCZNEGO.md) | Jak sprawdzać system bez zgadywania | SZABLON |
| 02a | [**Wyniki audytu laptopa 11.10.2026**](02-AUDYT-WYNIKI-2026-10-11.md) | Porty, PID, gałąź, istniejące bazy, luki eventów | **WYKONANY CZĘŚCIOWO — TYLKO ODCZYT** |
| 03 | [Architektura modułowa](03-ARCHITEKTURA-MODULOWA.md) | Kto jest właścicielem zadań, pamięci i narzędzi | KANDYDAT DO AKCEPTACJI |
| 04 | [Kontrakty i zdarzenia](04-KONTRAKTY-ZDARZENIA-DANE.md) | Task/Run/Tool/Event ID i dowód wykonania | PROPOSED; wybranie storage brak |
| 05 | [Ogólny plan Superpowers](05-PLAN-WDROZENIA-SUPERPOWERS.md) | Wzór RED/GREEN i niezależne zadania | SZABLON |
| 07 | [**Plan po prawdziwym audycie**](07-PLAN-MVP-PO-AUDYCIE-2026-10-11.md) | Co konkretnie sprawdzić i potem budować | **GOTOWY DO PRZEGLĄDU; NIEURUCHOMIONY** |
| 06 | [Testy, odbiór i rollback](06-TESTY-ODBIOR-WDROZENIE.md) | 12 scenariuszy wymagających realnych dowodów | WSZYSTKIE NOT RUN |

## Co rzeczywiście potwierdzono na komputerze

- Serwer `jarvis-\bridge\serve_site.py` nasłuchiwał lokalnie na `4000`.
- Bridge `jarvis-\bridge\jarvis_bridge.py` nasłuchiwał na `8651`.
- Proces `hermes.exe gateway` nasłuchiwał na `8642`; aktywny profil wymaga odrębnego sprawdzenia.
- Repo `%USERPROFILE%\Desktop\jarvis-` było na gałęzi `auto/nowa-petla-2026-10-09`, SHA `3d7328f40f42acb6d23762e5adaa6d28eb4a47ff`, z czterema zmodyfikowanymi śledzonymi plikami — **żadnego nie ruszono**.
- Zastane mechanizmy: Hermes DB, `agent-history.jsonl`, Bridge `AGENT_LOG`. Lokalne źródła potwierdzają, że `task.completed` może oznaczać tylko ukończenie odpowiedzi, a kolejka Hermesa może gubić eventy.
- Nie wykazano jeszcze, że cała ścieżka zadania działa bez otwartej karty lub potrafi wznowić historyczny wynik po restarcie.

## Następna bramka (R0)

**Ustalić aktywny profil gatewaya 8642, jeden narzędziowy executor działający w tle oraz właściciela trwałego stanu zadań**. Dopiero wtedy uzupełnić szczegółowe ścieżki plików w Task 2–5 i uruchamiać testy w odizolowanej gałęzi po zgodzie użytkownika.

**Ważne:** Samo przejście audytu nie daje zgody na uruchamianie poleceń przez Hermesa, zmianę jego konfiguracji, przełączanie brudnej gałęzi, czyszczenie baz lub publiczne wdrożenie. Wszelkie kolejne wyniki oznaczać `VERIFIED`, `NOT VERIFIED` albo `NOT RUN`.
