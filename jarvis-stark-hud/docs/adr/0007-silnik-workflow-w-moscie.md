# ADR 0007 — Silnik workflow w moście

**Status:** przyjęta 2026-10-04 · **Kontekst:** Hermes przy każdym zadaniu sam wymyśla drogę do celu. Bywa przez to
nieprzewidywalny: test na żywo pokazał zapowiadanie czynności bez jej wykonania i obejście zgody przez zapis skryptu do pliku.
Użytkownik chce powtarzalnych procesów pracy z wizualizacją na żywo i pętlami autonomii. Pierwszy z nich:
„pomysł → projekt → pliki → struktura i architektura”, domyślnie na poziomie autonomii L3.

**Decyzja:**
- Definicje workflow to pliki `workflows/*.yaml` w repo, walidowane schematem `workflows/schema.json` (ten sam podzbiór
  JSON Schema co `tools/schema-lite.js`). Kroki: `hermes` (jedna tura Hermesa, osobna sesja `wf-<przebieg>-<krok>-<próba>`),
  `check` (reguły i/lub ocena niezależnego modelu), `write_files` (tylko `JarvisWorkspace\projects\<slug>`, bez `..`, z commitem
  git), `tool` (polecenie rejestru przez kartę; `optional` = pominięcie, gdy karty nie ma), `ask` (pytanie do użytkownika).
- Silnik działa w moście (`bridge/workflow_engine.py`), a nie w Hermesie ani w karcie. Most działa zawsze (autostart, watchdog).
  Kolejność, sprawdzenia, ponowienia ze zmianą (powód porażki trafia do kolejnej próby), budżety (czas, kroki, tokeny) i
  zatrzymanie są w kodzie. Model myśli tylko wewnątrz kroków. Stan zapisywany jest po każdym kroku
  (`~/.jarvis-os/workflows/runs/<id>.json` + `.events.jsonl`); po restarcie mostu przebieg wznawia się od zapisanego kroku.
- Autonomia: L0 tylko propozycja (kroki ze skutkami pomijane) · L1 pyta przed każdą zmianą · L2/L3 same robią zmiany
  odwracalne. Kroki `irreversible`/`external` zawsze pytają. Odmowa kończy krok bez ponowień i bez szukania innej drogi.
- Narzędzia `workflow_list/run/status/stop/answer` są w rejestrze (karta, paleta, głos), a gdy woła je Hermes, obsługuje je
  most sam (jak `media_play`), więc workflow można uruchomić z Telegrama bez otwartej karty.
- Zdarzenia `event: workflow` (SSE) zasilają kartę przebiegu w czacie (chat-first), Orb, karty HUD
  i Process Log. Zadanie z czatu karty ma pierwszeństwo, tak jak przy zadaniach z Telegrama (ADR 0004). Karta podłączona
  w trakcie przebiegu dostaje jego migawkę.
- Limity: maks. 2 równoległe przebiegi, jeden przebieg danego workflow naraz. Krok `tool` nie uruchamia `workflow_*`, a krok
  `hermes` dostaje zakaz wołania narzędzi workflow i pulpitu (brak zagnieżdżeń).

**Konsekwencje:** powtarzalne procesy są przewidywalne, sprawdzane i widoczne. Koszt to nowy moduł w moście i format
definicji do utrzymania. Odstępstwo od propozycji: budżet liczony w tokenach zamiast USD, bo MiniMax nie podaje kosztu wywołania.

**Do rewizji:** wyzwalacze (czas, zdarzenie, obserwacja) i zgody przez Telegram (F3), pętla ulepszania (F4), kroki
równoległe i `delegate` (Claude), SQLite zamiast plików, gdy przebiegów będzie dużo, makro-narzędzia pulpitu (R3).
