# ADR 0006 — Narzędzia pulpitu widoczne dla Hermesa wprost + strażnik „zapowiedział, nie zrobił”

**Status:** przyjęta 2026-10-04 · **Kontekst:** przy `tools.tool_search.enabled: auto` Hermes chował wszystkie narzędzia MCP
(138 narzędzi pulpitu, ~17 tys. tokenów) za trzema narzędziami pośrednimi: `tool_search` / `tool_describe` / `tool_call`.
Test na żywo pokazał, że MiniMax-M3 źle sobie z tym radzi. Na „zamknij wszystkie widgety” odpowiadał „zamykam”, nie wywołując
niczego. Przez `tool_call` podawał zagnieżdżone argumenty (4 nieudane próby `create_widget`, potem `execute_code` i `terminal`;
lista z notatki powstawała po 46 s). Ten sam problem był już znany dla `todo_list` / `session_search` / `cronjob_manage` —
dlatego wcześniej trafiły na listę `defer` jako zawsze widoczne. Hermes nie ma ustawienia „nie chowaj narzędzi MCP”:
zostaje tylko włączenie lub wyłączenie mechanizmu.

**Decyzja:**
1. `tools.tool_search.enabled: off` w `hermes/apply_profile.py` (TARGET), pilnowane przez `config_guard.py`. Wszystkie
   narzędzia, także pulpitu, są w zwykłej liście narzędzi modelu.
2. Strażnik w karcie (`js/ai.js`). Gdy prośba była czynnością (polecenie z rejestru poza odczytami, pewność Jeva ≥ 0,7 albo
   pewny parser), a Hermes odpowiedział bez wywołania żadnego narzędzia pulpitu, karta raz prosi go o wykonanie polecenia
   narzędziami. Jeśli to nie pomoże, odpowiedź dostaje uczciwe ostrzeżenie „⚠ Hermes nie wykonał tej czynności”. Pytania
   doprecyzowujące (znak zapytania + `clarify` ≥ 0,5) nie wywołują przypomnienia.
3. `widgets_remove` przyjmuje `widget="all"`: jedno potwierdzenie, jedno „Cofnij”. Opis wyjaśnia, że „zamknij widget” to
   usunięcie, a nie zwijanie (`widget_collapse`).

**Konsekwencje:** wyniki na żywo — lista z notatki 26 s zamiast 46 s, bez błędnych wywołań; „zamknij wszystkie widgety”
działa lokalnie w <1 s. Prompt jest większy o ~17 tys. tokenów (≈63 tys. zamiast ≈46 tys.), ale prawie cały trafia
w pamięć podręczną dostawcy (99% przy kolejnych turach). Docelowo i tak lepiej mieć mniej, a większych narzędzi pulpitu
(R3 z planu CTO: ~8 makro-narzędzi zamiast 138). Wtedy da się wrócić do `auto`.
