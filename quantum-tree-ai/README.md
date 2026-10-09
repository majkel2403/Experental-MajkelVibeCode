# Quantum Tree AI — samodzielne demo 3D

Aplikacja została dodana jako **osobny katalog** w repozytorium SpaWebBuilder. Nie modyfikuje żadnego istniejącego kodu repozytorium, a Jarvis pozostaje nietknięty.

## Pliki

- **index.html** — kompletny interfejs, style CSS i JavaScript w jednym pliku.
- **README.md** — instrukcja i opis.

## Uruchomienie

1. Pobierz plik `index.html`.
2. Otwórz go w nowoczesnej przeglądarce z WebGL i dostępem do internetu.

Three.js oraz font JetBrains Mono są pobierane z zewnętrznych CDN, więc dostęp do internetu jest wymagany. Nie potrzeba Node.js, npm, frameworków ani bundlera.

Możesz również uruchomić serwer lokalny w tym katalogu:

```bash
python -m http.server 8000
```

Następnie otwórz `http://localhost:8000`.

## Możliwości

- Interaktywny graf 3D oparty na Three.js.
- Od 3 do 7 warstw i 7–127 węzłów.
- Pakiety przepływające przez kolejne połączenia.
- Tryby Explore, Learn, Trade oraz start, pauza, reset.
- Liczniki FPS, draw calls, P&L, win rate i pakietów.
- Responsywny panel z mobilnym rozwijanym bottom sheetem.
- Bloom na desktopie i automatyczne ograniczenie efektów przy niskim FPS.

> **Uwaga:** Przedstawiane wyniki finansowe i uczenie to **fikcyjna symulacja wizualna**. Aplikacja nie korzysta z prawdziwych danych, nie wykonuje transakcji i nie trenuje modelu ML.

## Publikacja

Pliki można opublikować przez statyczny hosting wskazujący na ten katalog, bez dodatkowego procesu kompilacji. Sam zapis do GitHuba nie oznacza jeszcze wdrożenia strony na publicznym URL.
