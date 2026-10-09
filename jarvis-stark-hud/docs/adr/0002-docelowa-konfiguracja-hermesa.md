# ADR 0002 — Docelowa konfiguracja Hermesa

**Status:** przyjęta 2026-10-04 · **Kontekst:** audyt i śledztwo kontekstu (2026-10-04) pokazały: prompt 52–57 KB w 60% złożony
z katalogu 243 skilli; wtyczki doklejające sprzeczne instrukcje do każdej rozmowy (superpowers: „1% szans → MUSISZ użyć skilla”,
planning-with-files: pusty plan, skill-retrieval: losowe skille — wszystko odtwarzane w każdej kolejnej turze); kompresja dopiero
przy ~500 tys. tokenów (fallback ma okno 205 tys.); katalog roboczy w katalogu domowym przy `C:\.git` (cały dysk jako „projekt”);
Telegram otwarty dla każdego (`TELEGRAM_ALLOW_ALL_USERS=true`) przy stałych zgodach na rekursywne usuwanie i zabijanie procesów.

**Decyzja (egzekwowana przez `apply_profile.py` — `TARGET` — i strażnika):**
- kompresja przy 120 tys. tokenów (`compression.threshold_tokens`), sesja wygasa po 2 h ciszy;
- bez zapisów pamięci w tle (`memory.nudge_interval: 0`; zapisywały rozkazy zamiast faktów); tworzenie skilli przez agenta zostaje
  (decyzja użytkownika);
- wtyczki: `jarvis-events`, `rtk-rewrite`, `security-guidance`, `disk-cleanup`, `hermes-memory-ui`, `web/ddgs`; wyłączone
  `superpowers`, `planning-with-files`, `skill-retrieval`, `ui-review-loop`;
- katalog roboczy `%USERPROFILE%\JarvisWorkspace` z własnym `.git`, tam `HERMES.md`;
- skille: używane i potrzebne (~80) w profilu, reszta w `~/.hermes/skills-archive/<data>` (odwracalne); strażnik pilnuje, by
  przypięte (`skills.auto_load`) istniały i by nie wróciły skille sprzeczne z zasadami (WSL, Codex/OpenCode, kanban, operator);
- Telegram tylko z listy `TELEGRAM_ALLOWED_USERS`; bez stałych zgód na force-kill i recursive delete;
- kanban wyłączony, maks. 3 subagentów, vision na MiniMax (bez „auto” wybierającego płatnych dostawców).

**Konsekwencje:** mniejszy i spójny kontekst, krótsze sesje, jedno źródło instrukcji projektu; zmiany mierzone
`hermes/scripts/metrics_report.py` i `hermes/evals/run_evals.py` (punkt wyjścia 2026-10-04).
