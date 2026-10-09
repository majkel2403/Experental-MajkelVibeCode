# Decyzje architektoniczne (ADR)

Każda istotna decyzja to jeden krótki plik: kontekst, decyzja, konsekwencje. Nowa decyzja = nowy plik z kolejnym numerem;
zmiana decyzji = nowy ADR, który zastępuje stary (stary zostaje z dopiskiem „zastąpiony przez …”).

| # | Decyzja | Status |
|---|---|---|
| — | [TypeScript tylko jako sprawdzanie typów (JSDoc + `tsc --noEmit`, bez builda)](../TS-MIGRATION.md) — wcześniejsza decyzja, spisana przed wprowadzeniem ADR | przyjęta 2026-10-01 |
| [0001](0001-repo-zrodlem-konfiguracji-hermesa.md) | Repo jest jedynym źródłem konfiguracji Hermesa | przyjęta 2026-10-03 |
| [0002](0002-docelowa-konfiguracja-hermesa.md) | Docelowa konfiguracja Hermesa (kontekst, wtyczki, skille, bezpieczeństwo) | przyjęta 2026-10-04 |
| [0003](0003-klucz-hermesa-przez-most.md) | Klucz gatewaya Hermesa nie trafia do przeglądarki — czat przez most | przyjęta 2026-10-04 |
| [0004](0004-zdarzenia-zadan-hermesa-na-pulpicie.md) | Zadania Hermesa spoza karty widoczne na pulpicie (wtyczka jarvis-events) | przyjęta 2026-10-04 |
| [0005](0005-niepewny-jev-oddaje-hermesowi.md) | Niepewny Jev oddaje polecenie Hermesowi zamiast pytać | przyjęta 2026-10-04 |
| [0006](0006-narzedzia-pulpitu-wprost-i-straznik-czynnosci.md) | Narzędzia pulpitu widoczne dla Hermesa wprost + strażnik „zapowiedział, nie zrobił” | przyjęta 2026-10-04 |
| [0007](0007-silnik-workflow-w-moscie.md) | Silnik workflow w moście (kroki, sprawdzenia, budżety, wznawianie, przebieg na żywo) | przyjęta 2026-10-04 |
