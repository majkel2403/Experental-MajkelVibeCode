# Experental-MajkelVibeCode

Centralne repozytorium **niezależnych eksperymentów i prototypów**. Każdy projekt ma własny podfolder i nie jest zależny od innych projektów w tym repozytorium.

## Projekty

| Projekt | Opis | Uruchamianie |
|---|---|---|
| [quantum-tree-ai](./quantum-tree-ai/) | Interaktywna wizualizacja drzewa decyzji 3D | Otwórz [index.html](./quantum-tree-ai/index.html) w przeglądarce |

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
├── kolejny-projekt/
│   ├── README.md
│   └── ...
└── inny-projekt/
    ├── README.md
    └── ...
```

> Uwaga: prototypy mogą korzystać z publicznych CDN lub wymagać lokalnych zależności, ale nie powinny importować kodu z folderów pozostałych eksperymentów.
