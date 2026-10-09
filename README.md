# Experental-MajkelVibeCode

Centralne repozytorium **niezależnych eksperymentów i prototypów**. Każdy projekt ma własny podfolder i nie jest zależny od innych projektów w tym repozytorium.

## Projekty

| Projekt | Opis | Uruchamianie |
|---|---|---|
| [quantum-tree-ai](./quantum-tree-ai/) | Interaktywna wizualizacja drzewa decyzji 3D | Otwórz [index.html](./quantum-tree-ai/index.html) w przeglądarce |
| [jev](./jev/) | JEV Desk — interaktywny demonstracyjny panel tradingowy | Otwórz [gotowy HTML](./jev/dist/jev.html) lub uruchom `node jev/build.mjs` |
| [agentspace](./agentspace/) | Hermes/Jarvis Neural Workflow — interaktywna wizualizacja pracy agentów | [README](./agentspace/README.md) |

| [jarvis-stark-hud](./jarvis-stark-hud/) | Pełna migawka gałęzi `claude/stark-hud` — interfejs Stark HUD | [README](./jarvis-stark-hud/README.md) |
| [jarvis-neon-hub](./jarvis-neon-hub/) | Pełna migawka gałęzi `claude/neon-hub` — Neon HUD | [README](./jarvis-neon-hub/README.md) |
| [jarvis-orb-lab](./jarvis-orb-lab/) | Pełna migawka `experiment/orb-lab` — laboratorium Orb | [README](./jarvis-orb-lab/experiments/orb-lab/classic-colors/README.md) |
| [jarvis-cinematic-engine-spec](./jarvis-cinematic-engine-spec/) | Pełna migawka `docs/cinematic-engine-spec` — specyfikacja Cinematic Engine | [Specyfikacja](./jarvis-cinematic-engine-spec/docs/superpowers/specs/2026-10-08-cinematic-engine-design.md) |
| [jarvis-graph-3d](./jarvis-graph-3d/) | Pełna migawka `feat/jarvis-graph-3d` — graf 3D | [README](./jarvis-graph-3d/graph-3d/README.md) |
| [quantum-tree-ai-standalone](./quantum-tree-ai-standalone/) | Oryginalna wersja źródłowa z gałęzi `experiment/quantum-tree-ai-standalone` | [README](./quantum-tree-ai-standalone/quantum-tree-ai/README.md) |

**O migawkach Jarvisa:** foldery wyżej są pełnymi, niezmienionymi kopiami wskazanych gałęzi. Zawierają także pliki wspólne z dawnym `Jarvis-/main` — to świadomy wybór zapewniający zachowanie wszystkich oryginalnych plików, a nie wyodrębnienie minimalnego modułu. Każda migawka jest odrębna od sąsiednich folderów.

| [jarvis-cinematic-engine](./jarvis-cinematic-engine/) | Pełna migawka `experiment/cinematic-engine` — szkic aplikacji Cinematic Engine | [Plan](./jarvis-cinematic-engine/docs/superpowers/plans/2026-10-08-cinematic-engine.md) |

## Zasady dodawania nowych projektów

1. **Osobny podfolder** dla każdego projektu, np. `nazwa-projektu/`.
2. **Własny `README.md`** z opisem, wymaganiami, sposobem uruchomienia i ograniczeniami.
3. **Komplet własnych plików:** kod, style, skrypty, konfiguracja, zasoby i testy — tyle, ile potrzeba, aby projekt mógł działać samodzielnie.
4. **Brak zależności między projektami.** Każdy folder można pobrać lub opublikować osobno.
5. **Nie modyfikujemy innych projektów**, dodając nowy. Wspólne repo służy tylko do przechowywania i odkrywania eksperymentów.
6. Każdy nowy projekt dopisujemy do powyższego indeksu.

Przykładowy układ:

```text
Experental-MajkelVibeCode/
├── README.md                 # Indeks projektów
├── quantum-tree-ai/
│   ├── README.md
│   └── index.html
├── jev/
│   ├── README.md
│   ├── build.mjs
│   ├── src/
│   └── dist/
├── agentspace/
│   ├── README.md
│   ├── packages/
│   ├── server/
│   └── web/
├── jarvis-stark-hud/               # Migawka Stark HUD
├── jarvis-neon-hub/                # Migawka Neon HUD
├── jarvis-orb-lab/                 # Laboratorium Orb
├── jarvis-cinematic-engine-spec/   # Dokumentacja Cinematic Engine
├── jarvis-graph-3d/                # Graf 3D
├── quantum-tree-ai-standalone/     # Wersja źródłowa Quantum Tree
├── jarvis-cinematic-engine/        # Migawka gałęzi Cinematic Engine
├── kolejny-projekt/
│   ├── README.md
│   └── ...
└── inny-projekt/
    ├── README.md
    └── ...
```

> Uwaga: prototypy mogą korzystać z publicznych CDN lub wymagać lokalnych zależności, ale nie powinny importować kodu z folderów pozostałych eksperymentów.
