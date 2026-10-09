# ADR 0008 — Sejf Obsidian w kontekście Hermesa od pierwszej wiadomości

**Status:** przyjęta 2026-10-05 · **Kontekst:** drugi mózg Michała (sejf Obsidian `Documents\hermes`) ma pliki sterujące
`CRITICAL_FACTS.md`, `hot.md`, `log.md`. Skill `obsidian` tylko prosił Hermesa, żeby je czytał na start — model zwykle tego nie robił,
więc rozmowy zaczynały się bez wiedzy o bieżącym stanie. `HERMES.md` nie mieści więcej treści (limit strażnika 9 KB), a SOUL to tylko
tożsamość ([ADR 0002](0002-docelowa-konfiguracja-hermesa.md)). Sejf współdzieli też Claude Code (wpisy `[Claude Code]`).

**Decyzja:** wtyczka `hermes/plugins/obsidian-brain` (hak `pre_llm_call`, tylko odczyt) dokleja do wiadomości użytkownika gęsty
skrót trzech plików (bez frontmattera, preambuł i nagłówków tabel; < 9 500 znaków, poniżej progu `hooks.output_spill` 10 000),
gdy rozmowa jeszcze go nie ma:
- Telegram i sesje z `X-Hermes-Session-Id` — raz na rozmowę; Hermes trzyma wstawkę w `api_content` i odtwarza ją w kolejnych turach,
  a po kompresji, która ją wytnie, wtyczka wstawia ją ponownie;
- karta Jarvis OS przysyła historię w treści zapytania (bez wstawek) — dostaje skrót w każdej turze (~2,5 tys. tokenów);
- crony, subagenci i procesy w tle są pomijane (Solana Radar co 5 min = koszt bez pożytku).
Brak sejfu lub błąd = rozmowa bez wstawki (nigdy wyjątek). Strażnik pilnuje: wtyczka włączona, kopia = repo, pliki sejfu istnieją.
Uzupełnienie (2026-10-05, wieczór): gdy w `00 - Inbox/ForAI` czekają notatki od Michała, wstawka kończy się ich listą (do 10 nazw)
— Jarvis wie o nich od pierwszej wiadomości, a nie dopiero po cronie skrzynki.
Uzupełnienie 2: skrypty sejfu (`obsidian-*.py`, wrappery cronów 7:30 / co 2 h / pon 8:00, `vault_health/stats.py`,
`sync-memory-to-obsidian.py`) oraz `backup_state_db.py` żyją w `hermes/scripts/` (wcześniej tylko na dysku, bez wersji);
`apply_profile.py` kopiuje je do profilu i `~/.hermes/scripts`, strażnik pilnuje zgodności i włączenia cronów,
testy: `hermes/tests/test_obsidian_scripts.py`.

**Konsekwencje:** kontekst sejfu jest deterministyczny (kod, nie prośba w prompcie) — test na żywo 2026-10-05: odpowiedzi z sejfu
bez ani jednego wywołania narzędzia, brak dublowania w rozmowie ciągłej. Koszt: ~2,5 tys. tokenów na rozmowę (na karcie — na turę).
Treść wstawki jest tak aktualna jak pliki sterujące — utrzymanie `hot.md`/`log.md` jest teraz ważniejsze.
