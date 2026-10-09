# ADR 0001 — Repo jest jedynym źródłem konfiguracji Hermesa

**Status:** przyjęta 2026-10-03 · **Kontekst:** konfiguracja profilu `jarvis-desktop` była zmieniana ręcznie w kilku miejscach
(profil, pamięć Hermesa, przewodniki w `~/.hermes`), co dawało dryf: po ponownym uruchomieniu skryptu wracały stare ustawienia,
a instrukcje w różnych plikach sobie przeczyły.

**Decyzja:** wszystko, co kształtuje zachowanie Hermesa, leży w repo w `hermes/` (`SOUL.md`, `HERMES.md`, `apply_profile.py`,
`scripts/`, `plugins/`) i trafia do profilu wyłącznie przez `hermes/apply_profile.py` (idempotentny, z kopiami zapasowymi).
Strażnik `scripts/config_guard.py` (cron 7:50, bez modelu) porównuje profil z ustaleniami i zgłasza odstępstwa na Telegram.

**Konsekwencje:** zmiana = commit + `apply_profile.py`; ręczne edycje profilu są nadpisywane przy następnym uruchomieniu
(wyjątki świadome: decyzje użytkownika podjęte w rozmowie z Hermesem, np. `skills.auto_load`, `command_allowlist`
dla kategorii zatwierdzonych przyciskiem „zawsze” — skrypt ich nie nadpisuje).
