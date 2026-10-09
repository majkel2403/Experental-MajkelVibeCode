# Quantum Tree AI — Neural Flow Lab

Interaktywna wizualizacja **3D drzewa decyzji** z neonowym interfejsem i responsywnym panelem mobilnym.

> **Ważne:** Tryby EXPLORE / LEARN / TRADE oraz P&L i win rate to wyłącznie **losowa symulacja demonstracyjna**, a nie rzeczywista analiza rynku, sieć ML czy handel.

## Co działa

- 3D w Three.js r128, InstancedMesh węzłów i pakietów, połączenia w jednym BufferGeometry.
- Od 3 do 7 warstw (7–127 węzłów), obrót i zoom kamery, poświata bloom na desktopie.
- Tryby Explore / Learn / Trade (symulowane), START / PAUZA / RESET i suwaki prędkości i złożoności.
- Licznik FPS, pakietów, draw calls, symulowane P&L i win rate.
- Panel boczny na komputerze i rozwijany dolny panel na telefonie.
- Statyczne HTML, CSS, JS bez bundlera, serwera API i kluczy.

## Uruchamianie

Otwórz `index.html` w przeglądarce obsługującej WebGL. Wymagany jest dostęp do internetu, ponieważ Three.js oraz Google Fonts są pobierane z CDN.

Możesz też uruchomić lokalny serwer w katalogu projektu:

```bash
python -m http.server 8000
```

Następnie wejdź na `http://localhost:8000`.

## Publikacja jako niezależne repozytorium

Ta wersja została przygotowana w katalogu `quantum-tree-ai/` na osobnej gałęzi eksperymentalnej projektu Jarvis. Nie zmienia istniejącej wersji `main`.

Aby przenieść ją do **oddzielnego repozytorium**, utwórz `quantum-tree-ai` na GitHubie, skopiuj te cztery pliki do katalogu głównego i w **Settings → Pages → Build and deployment** wybierz `Deploy from a branch`, `main`, `/ (root)`.

## Pliki

- `index.html`: szkielet aplikacji, panel sterowania i skrypty.
- `styles.css`: wizualny styl neon/glass oraz układ mobilny.
- `app.js`: graf 3D, symulacja pakietów, zdarzenia i wydajność.

## Ważne ograniczenia

Brak integracji z Jev / Hermes, prawdziwymi danymi rynkowymi i brokerami. Tryb „LEARN” aktualizuje tylko liczniki i kolorowanie krawędzi, nie trenuje sieci neuronowej.

Do użycia produkcyjnego należy usunąć zależność od niezapinned CDN i przetestować WebGL na urządzeniach docelowych.
