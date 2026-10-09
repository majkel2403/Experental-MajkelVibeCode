# Hermes — Zespół Agentów: wspólny język wizualny i reguły techniczne

Produkt: **Hermes** (orkiestrator) dostaje zadanie, sam składa zespół wyspecjalizowanych agentów,
agenci współpracują do wyniku. Wszystkie plansze są częścią jednego canvasu Design (pliki `.dc.html`).
Język UI: **polski** (`<html lang="pl">`). Ton: spokojny, precyzyjny, zero marketingowego lania wody.

## Kierunek: „nocna mapa dyspozytorska"
Agent = **stacja** na mapie metra. Zespół = **linie** (4 strumienie robocze). Wiadomość = **pakiet** jadący
po linii. Hermes = **węzeł-dyspozytornia** (złoty, podwójny pierścień). Estetyka: ciemny atrament,
hairline'owa siatka, ostre kolorowe linie, mono do metryk. Ma wyglądać jak plansza kontrolna w
nocnej dyspozytorni, nie jak „AI-dashboard".

## Tokeny (WARTOŚCI LITERALNE inline — bez zmiennych CSS)
Tło / powierzchnie:
- ground (tło strony): `#0B1020`
- panel: `#111831`   panel-2 (podniesiony): `#161F3D`   panel-3 (wciśnięty/pole): `#0E1530`
- hairline (obrys): `#232C4E`   hairline-strong: `#34406B`
Tekst (kontrast policzony względem #0B1020/#111831):
- text: `#E8ECF8`  muted: `#A3AED0`  dim: `#7F8BB3` (najciemniejszy dozwolony tekst; drobny tekst min. 12px)
Akcent Hermesa: gold `#F2C14E` (tekst na złotym tle: `#1A1300`)
Linie robocze (rozróżnialne też jasnością + zawsze oznaczone literą i nazwą, nigdy sam kolor):
- R „Badania"   `#4FA3FF`  (litera R)
- C „Tworzenie" `#FF9A3D`  (litera C)
- Q „Jakość"    `#34D3BE`  (litera Q)
- D „Dostawa"   `#C4A7FF`  (litera D)
Rodzaje wiadomości (kind):
- assign (Hermes przydziela)  `#F2C14E`
- brief / handoff / answer / result `#E8ECF8` (pakiet jasny)
- question `#7CC4FF`
- critique `#FF8FA3`   revision `#FFB48A`
- approve `#34D3BE`
Tier modelu (trzy poziomy, ikona = 3/2/1 wypełnione kreski): `deep` = „Głębokie rozumowanie",
`balanced` = „Zrównoważony", `fast` = „Szybki". Nie podawaj nazw konkretnych modeli.
Status agenta: `czeka` (dim, pierścień przerywany), `pracuje` (kolor linii, pulsuje), `recenzja`
(kolor linii, pierścień kropkowany), `gotowe` (kolor linii, znacznik ✓ narysowany SVG-iem).

## Typografia (jeden `<link>` w `<helmet>`)
```
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Instrument+Sans:wght@400..700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
```
- Nagłówki / wielkie liczby: `'Bricolage Grotesque', 'Segoe UI', system-ui, sans-serif` (600–800, ciasny tracking −0.01em)
- Tekst: `'Instrument Sans', 'Segoe UI', system-ui, sans-serif` (400–600, 14–15px, line-height 1.5)
- Metryki / znaczniki czasu / etykiety kategorii: `'IBM Plex Mono', ui-monospace, monospace` (12–13px, uppercase etykiety z letter-spacing .06em)
Zakazane: Inter, Roboto, Arial, Fraunces, Space Grotesk.

## Kształty i zasady wizualne
- Promienie: 6px (pola, chipy), 10px (panele), 999px (pigułki). Obrys 1px hairline, bez cieni dekoracyjnych.
- Siatka tła mapy: dwa warstwy `background-image: linear-gradient(...)` hairline 1px co 32px, kolor
  `#151D3A` na `#0B1020` (to jest tekstura siatki, nie „gradientowa poświata").
- ZAKAZ: emoji, gradientowych „poświat"/mesh, kart z kolorowym paskiem po lewej, lorem ipsum,
  wymyślonych statystyk rynkowych, ikon-emotek. Ikony = inline SVG ze `stroke` (stroke-width 1.75,
  linecap/linejoin round, 20×20 lub 24×24, `aria-hidden="true"`), a przycisk ikonowy ma `aria-label`.
- Logomark Hermesa (okrąg + skrzydła + laska), złoty:
  `<svg viewBox="0 0 32 32" width="28" height="28" fill="none" stroke="#F2C14E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="16" cy="16" r="5"/><path d="M11 15C8 14.5 5.5 12.8 3.5 9.5"/><path d="M11 18C8.5 18.2 6 17.5 4 15.5"/><path d="M21 15C24 14.5 26.5 12.8 28.5 9.5"/><path d="M21 18C23.5 18.2 26 17.5 28 15.5"/><path d="M16 21v7"/></svg>`
- Stacja: koło (r=24 pierścień, r=18 wypełnienie `#0B1020`), obrys w kolorze linii, w środku monogram
  (pierwsza litera nazwy skróconej, Bricolage 700 16px, kolor linii). Pod stacją nazwa (13px/600) i
  podpis roli (mono 11px uppercase, `#A3AED0`).
- Przyciski: wysokość ≥ 44px na mobile, ≥ 36px desktop; główny = złote tło `#F2C14E` + tekst `#1A1300`;
  drugorzędny = `#161F3D` + obrys `#34406B` + tekst `#E8ECF8`. Prawdziwe `<button>`/`<a href>`,
  nigdy div z role/onClick. Focus: reguła `:focus-visible{outline:2px solid #F2C14E;outline-offset:2px}`
  w `<helmet><style>` (jedyne miejsce na pseudoklasy).

## Reguły techniczne formatu `.dc.html` (pełna wersja: `format.md` obok)
- Plik = jedna plansza. Szkielet dokładnie jak w `format.md`; linia `<script src="./support.js"></script>`
  w `<head>` DOKŁADNIE taka; `<title>` 2–4 słowa po polsku.
- Cały UI to markup w `<x-dc>`; dynamikę wstrzykuj dziurkami `{{ścieżka.kropkowana}}` (NIGDY wyrażeń),
  logika w `class Component extends DCLogic { renderVals() { return {…} } }` (klasyczny JS, bez import/export).
- Pętle `<sc-for list="{{x}}" as="it" hint-placeholder-count="3">`, warunki
  `<sc-if value="{{x}}" hint-placeholder-val="{{ true }}">`. Zawsze ustaw atrybuty `hint-*`.
- Zdarzenia: `onClick="{{handler}}"` (handler zwracany z `renderVals`), stan przez `this.state`/`this.setState`.
- Zamykaj każdy niepusty element, cytuj każdy atrybut (`"…"`). Bez `<iframe>`, `<object>`, `<embed>`,
  bez globalnych handlerów klawiatury, bez sieci poza linkiem Google Fonts.
- Style statyczne = inline `style="…"` (WARTOŚCI LITERALNE). Dziurka w stylu wolno tylko dla wartości
  zależnych od stanu na żywo. `<helmet><style>` tylko: `body{margin:0}`, reguły `a`/`a:hover`,
  `:focus-visible`, `@keyframes`, klasy animacji, `prefers-reduced-motion`.
- Układ: flex/grid + `gap` (nie spacje/inline). PAGE (ekran aplikacji/strona) = korzeń FLUIDALNY: bez
  px-szerokości korzenia, kontener `max-width`, %/rem/fr, `grid-template-columns:
  repeat(auto-fit, minmax(min(<min>px,100%),1fr))`; przy ~390px menu/kolumny się układają w stos,
  szerokie tabele w boksie `overflow-x:auto`. Frame na canvasie ma `w`×`h` (wysokość strony przy `w`);
  lepiej za wysoko niż ucięte. Plansza urządzenia/plakat = korzeń o stałym `w`×`h`.
- `data-props` (tweaki) = dźwignie, nie treści: maks. 1–2 (np. kolor akcentu). Teksty piszesz literalnie.
- Dostępność: kontrast ≥ 4.5:1 (≥ 3:1 od 24px), kolory rozróżniane też jasnością, `aria-label` na
  ikonach, `<label>` do pól. `@media (prefers-reduced-motion: reduce)` wyłącza animacje.
- Wolno puścić checker (bez przeglądarki): `node artifact/check-board.mjs <plik.dc.html>`
  — łapie niezamknięte tagi, niecytowane atrybuty, dziurki-wyrażenia, emoji, zabronione tagi, błędne
  `data-props`, dziurki, które nie istnieją w `renderVals()`. Napraw wszystkie błędy zanim oddasz plik.
- NIE renderuj, nie rób zrzutów ekranu, nie instaluj niczego, nie publikuj artefaktu (publikuję ja).

## Plansze
1. `Main.dc.html` — Centrum dowodzenia (interaktywne, PAGE ~1440×960) — pisze główny autor.
2. `Roster.dc.html` — PAGE 1440×5510 „Katalog specjalistów" (statyczny).
3. `Mobile.dc.html` — 390×844, widok mobilny przebiegu (statyczna klatka z przebiegu, t≈36 s).

## Kontrakt danych scenariusza (używany przez Main; Mobile bierze z niego klatkę)
```
{ id, chip, task, keywords[], analysis{goal,constraints[3],success[3],risks[3]},
  agents[{id,name,short,line:'R'|'C'|'Q'|'D',col:1..5,tier,tools[],why,spawn}],
  links[{from,to}], tasks[{agent,from,to,label,review?}],
  events[{t,from,to,kind,text,attach?}], report{title,lead,sections[{h,p}],next[]} }
```
Fazy przebiegu (60 s): Analiza 0–6 · Skład zespołu 6–14 · Współpraca 14–50 · Dostawa 50–60.
Linie: R Badania · C Tworzenie · Q Jakość · D Dostawa.
