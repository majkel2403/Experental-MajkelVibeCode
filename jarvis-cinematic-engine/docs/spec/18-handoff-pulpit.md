# 18 · Handoff: pulpit Jarvis OS (ekran główny)

> Specyfikacja dla programisty, spisana z kodu (`css/jarvis.css`, `js/hud.js`, `js/main.js`, `js/core.js`, `js/undo.js`,
> `index.html`) — stan z 2026-10-04. **Uzupełnia** [09 · Wygląd, stany](09-wyglad-stany.md) (znaczenie stanów, kontrakt kart
> HUD, poziomy efektów) dokładnymi wymiarami, czasami i zachowaniem. Gdzie 09 mówi „co”, tu jest „ile i jak”.
> Źródło prawdy to kod — przy rozbieżności popraw ten plik albo kod, nie zgaduj.

## Overview

Pulpit to jedyny ekran Jarvis OS: „żywa” scena z rdzeniem (Core) w środku, 10 kartami HUD pokazującymi przebieg bieżącego
zadania, pulpitem z oknami aplikacji i widgetami, dokiem na dole oraz panelami Czat i Process Log po prawej. Użytkownik mówi
albo pisze; agent (Jev lokalnie albo Hermes) wykonuje polecenia, a scena pokazuje **tylko prawdziwe zdarzenia** (zasada
„nic na niby” — każda karta i liczba pochodzi z szyny `J.ev`). Kontekst użycia: laptop/monitor (≥ 1280 px) jako główne
stanowisko, telefon jako podgląd i sterowanie głosem.

## Layout

Warstwy od dołu (tokeny `--z-*` w `:root`):

| warstwa | element | z-index |
|---|---|---|
| tapeta, siatka, cząsteczki | `#flowCanvas`, tło | `--z-desk` 1 |
| pasek ikon pulpitu | `.icon-rail` | 15 |
| telemetria | `.deck` | 18 |
| karty HUD, rdzeń | `.hc`, `.core-wrap` | `--z-hud` 20 |
| okna | `.window` | 22+ (rośnie przy fokusie; przypięte `--z-pin` 10 000) |
| dok, pasek górny | `.dock` 38, `.topbar` 40 | — |
| paleta, onboarding | `.palette-bg` 90, `.onboard` 97 | — |
| toasty | `.toasts` | 99 (wewnątrz warstwy pulpitu) |
| przyciski paneli, panele | `.panel-chip` 100 002, `.chat-panel`/`.log-panel` 100 003 | ponad `--z-panel` |
| „Cofnij”, pytanie | `.undo-chip` 99 992, `.ask-chip` 99 993 | `--z-ask` |

Siatka (przy ≥ 1280 px):

```
┌ topbar 52 px: marka · tryb agenta (5 segmentów) · tagline · status Hermes/Jev · TOOLS · FPS · zegar · ikony ┐
│ icon-rail   │                 task-banner (top 14 px, środek)                    │ log-chip (top 14, right 16) │
│ 104 px      │                     karty HUD (10)                                 │ Process Log 392 px          │
│ ikony 80 px │                    ╭── Core 112 px ──╮                             │                              │
│             │                     karty HUD                                      │ Czat 392 px (bottom 62)     │
│ deck 304 px (left 16, bottom 16) │  ask/undo chip (bottom 104, środek)            │ chat-chip (bottom 62)       │
└──────────────────────── dok (bottom 14 px, środek; przyciski 68×58) ──────────────────────────────────────────┘
```

**Scena (rdzeń + karty)** liczona w `js/hud.js` (`layout()`), jedno źródło prawdy:
- skala `k = clamp(min(W/1240, H/690), 0.5, 1.12)`; przy `W ≥ 760` dodatkowo `k ≤ (H − 156)/589` — karty sięgają 300·k nad i 289·k pod rdzeń
  i nie mogą wejść pod pasek zadania (56 px) ani dok (100 px);
- środek rdzenia: `cx = W/2`, `cy` na linii horyzontu tapety (jezioro) minus `1.03·R`, w granicach `[max(0.3·H, 56 + 300·k), 0.5·H]`; `R = 108·k`;
- karty: środek w `(cx + dx·k, cy + dy·k)`, szerokość `w`, wysokość 74 px, `transform: translate(-50%,-50%) scale(k)`; linie łączą kartę z
  pierścieniem rdzenia (`R + 7·k`) łamaną przez punkt 52% drogi.

| karta (`id`) | ton | dx | dy | w |
|---|---|---|---|---|
| Model AI (`model`) | blue | 6 | −240 | 226 |
| Analiza polecenia (`intent`) | blue | −274 | −186 | 240 |
| Tool Calls (`tools`) | purple | 306 | −200 | 200 |
| Internet (`internet`) | teal | −358 | −52 | 208 |
| Dane zewnętrzne (`external`) | teal | 366 | −78 | 226 |
| Pliki i dokumenty (`files`) | blue | −364 | 66 | 220 |
| Status systemu (`status`) | green | 360 | 52 | 214 |
| Wykonywanie zadania (`exec`) | purple | −262 | 174 | 238 |
| Logika i decyzje (`logic`) | blue | 268 | 174 | 206 |
| Zakończenie (`done`) | purple | 182 | 252 | 196 |

## Design Tokens Used

Tokeny są w `:root` (`css/jarvis.css`). **Uwaga:** skala odstępów i promieni (`--s*`, `--r-*`) istnieje, ale większość
komponentów ma jeszcze wartości wpisane ręcznie — nowy kod pisz na tokenach; w tabelach komponentów podaję wartość z kodu.

| Token | Wartość | Użycie |
|---|---|---|
| `--accent` / `--accent-rgb` | `#33d6ff` / `51,214,255` | ramki, poświata, aktywne elementy, linie HUD (zmienia się z motywem `J.THEMES`) |
| `--accent2` / `--accent2-rgb` | `#a25cff` / `162,92,255` | drugi kolor gradientów (przycisk „wyślij”, pasek startu, stan THINKING) |
| `--bg` / `--bg2` | `#03060f` / `#071022` | tło strony |
| `--text` | `#eaf6ff` | tekst podstawowy |
| `--muted` | `#8ea6c4` | etykiety drugorzędne |
| `--dim` | `#7a90b0` | etykiety HUD; kontrast ≥ 5:1 na szkle |
| `--ok` / `--warn` / `--err` | `#3ef0a3` / `#ffb84d` / `#ff5d7a` (+ `-rgb`) | sukces / pytanie, ostrzeżenie / błąd, nagrywanie |
| `--glass` / `--glass-strong` | `rgba(6,14,32,.72)` / `rgba(4,10,26,.9)` | tła szklanych paneli |
| `--line` / `--line-soft` | akcent 28% / `rgba(160,200,255,.09)` | ramki / separatory |
| `--shadow` / `--glow` | `0 24px 70px rgba(0,0,0,.55)` / `0 0 26px` akcent 22% | cienie paneli / poświata |
| `--radius` | 16 px | okna |
| `--s1…--s6` | 4 · 8 · 12 · 16 · 24 · 32 px | skala odstępów |
| `--r-sm` / `--r-md` / `--r-lg` | 8 / 12 / 16 px | promienie |
| `--font` | Inter, system-ui | tekst |
| `--hud` | Rajdhani (600, wersaliki, `letter-spacing` 1,6 px) | etykiety HUD (klasy `.hud-label`, `.dk span`, `.ts b`…) |
| `--display` | Orbitron | marka, napis w rdzeniu, ekran startu |
| `--mono` | JetBrains Mono | liczby, czasy, wartości w telemetrii |

## Components

| Komponent | Wariant / stan | Wymiary i wygląd (z kodu) | Uwagi |
|---|---|---|---|
| Pasek górny `.topbar` | — | wys. 52 px, padding 0 18 px, gap 14 px, gradient + `blur(16px)`, linia akcentu 1 px na dole | segmenty trybu `.mode-hud` (GOTOWY · SŁUCHAM · ANALIZA · DZIAŁANIE/ZGODA? · GOTOWE) wprost z maszyny stanów `J.engine` |
| Status w pasku `.ts` | `busy`, `clock` | padding 5×10, promień 9, etykieta 10 px `--dim`, wartość mono 11 px, max 130 px z wielokropkiem | kropka 7 px: szara / ok / err |
| Rdzeń `.core` | `data-state`: idle, listening, thinking, speaking, alert | przycisk 112×112 px w `.core-wrap` 560×560 (skalowane `k`); napis Orbitron 14,5 px, odstęp 4 px; podpis stanu pod spodem 10 px, max 280 px | hover `scale(1.05)`, active `scale(.96)`; speaking: pulsowanie 0,35 s |
| Karta HUD `.hc` | `data-s`: idle · active · done · failed; `data-tone`: blue · purple · teal · green | siatka `34px | 1fr | auto`, gap 10, padding 10/12/11, promień 12, ramka 1 px ton 50%, narożniki 10 px; ikona 34 px (glif 17); tytuł Rajdhani 13 px; podpis 10,5 px; wartość mono 11 px albo „pigułka” 10 px; pasek 4 px | bez danych: przygaszona (nie pusta); `failed` = ton `--warn`; pasek nieokreślony `.hc-bar.ind` (36% szer., przesuw 1,35 s) |
| Pasek zadania `.task-banner` | `.show` | top 14 px, środek, padding 7/16/7/12, etykieta Rajdhani 10,5 px akcent | tekst z wielokropkiem |
| Pasek ikon `.icon-rail` | — | szer. 104 px, padding 14/0/100/14, gap 14×6, ikony 80 px, podpis 10,5 px | w trybie skupienia `opacity .35` (hover 1) |
| Telemetria `.deck` | zwinięta / rozwinięta (`Alt+3`) | szer. 304 px, left 16, bottom 16, promień 16; komórki `.dk`: etykieta 9,5 px, wartość mono 11,5 px; wykres aktywności 44 px | przy aktywnym HUD `opacity .55` |
| Dok `.dock` | przycisk: zwykły · `running` · `focused` · `plain` | bottom 14 px, środek, padding 8×12, gap 6; przycisk 68×58, kafelek 34 px (glif 18), podpis 10 px max 64 px; `plain` 42×42; separator 1×40 | `running`: kropka 5 px; `focused`: kreska 18×3 px |
| Przyciski paneli `.panel-chip` | `.log-chip`, `.chat-chip` | padding 8/14/8/8, promień 14; log: top 14, right 16, min 236 px; czat: bottom 62, right 16, min 214 px | licznik kroków, kropka stanu |
| Panel Czat `.chat-panel` | zamknięty / `.open` | right 16, bottom 62, szer. `min(392px, 100% − 32px)`, wys. `min(540px, 100% − 90px)`, promień 18 | wiadomość `.msg`: max 88% szer., padding 9×12, promień 13, 12 px / 1,55 |
| Pole wpisywania `.composer` | mic: zwykły / `.rec` | padding 10, gap 7; textarea 36–136 px wys. (rośnie z treścią); przyciski 40 px | Enter wysyła, Shift+Enter nowa linia; `.rec` = czerwona ramka + pulsowanie |
| Panel Process Log `.log-panel` | zamknięty / otwarty | top 14, right 16, szer. jak czat, wys. `min(560px, 100% − 28px)` | zakładki Zadanie · Historia; kroki z czasem i podglądem |
| Okno `.window` | `focused` · `max` · `closing` · `minimizing` | min 280×180, promień 16, `blur(24px)`; nagłówek 42 px (ikona 16, tytuł Rajdhani 12,5 px); przyciski 28×28 (glif 13); treść padding 14 | `max`: 8 px od brzegów, wys. `100% − 100px`; zamknij: hover tło `--err` 22% |
| Pytanie `.ask-chip` | ukryte (`inert`) / `.show` | bottom 104, środek, min 280 px, max `min(460px, 92%)`, padding 13/16/10, promień 16, ramka i poświata `--warn`; pytanie 12,5 px, max 50vh (przewijane); pasek czasu 2 px | to samo pytanie jest też w czacie jako szybkie odpowiedzi — oba zamykają się razem |
| Wynik zadania `.result-chip` | ukryte / `.show` | bottom 104, środek, min 250 px, max `min(360px, 90%)`, padding 12×16 | pojawia się 700 ms po zakończeniu (po pulsie rdzenia), znika po 12 s |
| „Cofnij” `.undo-chip` | ukryte / `.show` | bottom 104, środek, max `min(460px, 92%)`, padding 8/8/8/14; tekst z wielokropkiem; pasek czasu 2 px akcent | znika po 8 s (`OFFER_MS`) |
| Toast `.toast` | wejście / `.out` | kontener top 108 px, środek, gap 8; toast padding 10×16, promień 12, 12 px; kropka 7 px | domyślnie 2,6 s (`J.toast(text, ms = 2600)`) |
| Paleta `.palette` | `.open` | `min(620px, 92vw)`, max 60vh, 14vh od góry, promień 18; pole 16 px | `Ctrl+K` / `/` |

## States and Interactions

| Element | Stan / zdarzenie | Zachowanie |
|---|---|---|
| Rdzeń | klik | mów (nasłuch); bez mikrofonu — otwiera czat; Shift+klik — panel węzłów |
| Rdzeń | tryb silnika | kolory i ruch wg [09 §3](09-wyglad-stany.md); COMPLETED zostaje zielony 2,6 s |
| Karta HUD | klik | skok do powiązanego miejsca (Model AI → Ustawienia → Hermes; inne — wg [09 §4](09-wyglad-stany.md)) |
| Karta HUD | pojawienie się | `opacity 0→1`, `blur 6px→0`, 0,55 s |
| Przycisk doku | hover | podniesienie 5 px, tło akcent 12%, poświata kafelka |
| Przycisk doku | klik | przełącza okno aplikacji (`J.wm.toggle`), „Czat” przełącza panel czatu; z lewej „Wszystkie aplikacje” (Biblioteka), z prawej „+” — menu nowego widgetu |
| Okno | przeciąganie nagłówka | kursor `grab/grabbing`, przyciąganie do krawędzi z podglądem; `Alt+strzałki` |
| Okno | fokus | ramka akcent 60%, linia u góry świeci, wyższa warstwa |
| Pytanie (`J.ask`) | pokazane | dźwięk `sfx.ask`, tryb ZGODA?, odpowiedź: klik, wpisanie albo głos |
| Pytanie | brak odpowiedzi | wygasa: wybór z listy 30 s, pytanie otwarte 45 s, zgoda na ryzykowne działanie 60 s → komunikat „Nie dostałem odpowiedzi, więc nic nie zrobiłem…” (nie „Anulowano.”) |
| „Cofnij” | po czynności A2 | 8 s z kurczącym się paskiem; klik = cofnięcie i wpis w czacie |
| Czat | wysłanie | wiadomość wjeżdża 0,3 s; w trakcie pracy „kropki pisania”; odpowiedź strumieniem |
| Process Log | zadanie trwa | chip pokazuje „WYKONUJĘ…” i licznik kroków; krok „Jev: decyzja” mówi, czy wykonuję lokalnie, pytam, czy oddaję Hermesowi |
| Zadanie z Telegrama/crona | `task.created` z mostu | tytuł „Telegram: …” / „Konsola: …” w Process Logu i na Orbie — tylko gdy nie trwa zadanie z czatu tej karty |

## Responsive Behavior

| Warunek | Zmiany |
|---|---|
| > 1380 px | pełny układ (tagline w pasku) |
| ≤ 1380 px | znika tagline |
| ≤ 1180 px | znikają FPS i TOOLS w pasku, separatory |
| ≤ 1000 px | znika pasek trybu agenta i numer wersji |
| ≤ 900 px | panele Czat/Log na całą szerokość (8 px od brzegów, wys. `100% − 100px`); znikają telemetria, ikony systemowe, ramka HUD; pasek ikon 76 px, przyciski doku 58 px |
| < 760 px szer. sceny | `scene.narrow` — karty HUD nie trzymają się ograniczenia wysokości |
| ≤ 640 px (telefon) | pasek ikon poziomo u góry (88 px, przewijany); okna na cały ekran (6 px marginesu, wys. `100% − 94px`) z przyciskiem „Wróć” zamiast minimalizuj/maksymalizuj; bez uchwytów zmiany rozmiaru; przyciski paneli same ikony; toasty nad dokiem (bottom 150); dok 50 px na przycisk |
| wysokość ≤ 820 px | pasek ikon zostawia 236 px na telemetrię |
| `pointer: coarse` | przyciski okna, doku, pasek ikon i `.btn.sm` min. 40×40 px |
| `prefers-reduced-motion` | animacje i przejścia skrócone do 0,01 ms |

## Edge Cases

- **Brak danych w karcie HUD:** karta przygaszona ze stanem `idle` (szara pigułka/kropka), nie pusta i nie ukryta.
- **Długi tekst:** tytuły i podpisy kart, pasek zadania, wartości w pasku (max 130 px), podpis rdzenia (max 280 px), podpisy doku
  (max 64 px), tekst „Cofnij” — jedna linia z wielokropkiem; pytanie — wiele linii, przewijane od 50vh; wiadomość w czacie —
  zawijana (`pre-wrap`, `break-word`). Polskie słowa są długie: projektuj z zapasem ~30% szerokości względem angielskiego.
- **Ładowanie:** karta — pasek nieokreślony; widoki aplikacji — szkielet wg [09 §1](09-wyglad-stany.md); czat — kropki pisania.
- **Błąd:** karta `failed` w tonie `--warn` (nie czerwona — błąd zadania to nie awaria systemu); w czacie zdanie po ludzku, szczegóły
  tylko w Process Logu; Hermes niedostępny — jedno ponowienie po 2 s, potem silnik lokalny z ostrzeżeniem.
- **Wolne połączenie:** czat pokazuje kropki do pierwszego tokenu; pierwsza wiadomość świeżej karty czeka maks. 1,5 s na stan mostu.
- **Słaba wydajność:** FPS < 30 przez 5 s → poziom efektów o stopień niżej (wpis w Process Logu, bez powiadomienia); FPS ≥ 55 przez
  8 s → z powrotem w górę.
- **Druga karta tej samej strony:** działa jako podgląd i nie wykonuje poleceń (jedna karta jest „główna”).

## Animation / Motion

| Element | Wyzwalacz | Animacja | Czas | Krzywa |
|---|---|---|---|---|
| Okno | otwarcie | `winIn`: 0,92 → 1, 14 px w górę, blur 6 → 0 | 380 ms | `cubic-bezier(.2,.9,.3,1.15)` |
| Okno | zamknięcie / minimalizacja | `winOut` / `winMin` | 220 / 300 ms | `ease` |
| Panel Czat / Log | otwarcie | z `translateY(±18px) scale(.97)` | 300 ms (krycie) / 340 ms (ruch) | `cubic-bezier(.2,.9,.3,1.1)` |
| Pytanie | pokazanie | `askIn`: z 16 px niżej, lekkie przestrzelenie −4 px | 500 ms | `cubic-bezier(.2,.9,.3,1.2)` |
| Wiadomość | dodanie | `msgIn`: 8 px w górę + krycie | 300 ms | `cubic-bezier(.2,.9,.3,1.2)` |
| Toast | wejście / wyjście | `toastIn` (−14 px, 0,95) / `toastOut` | — / 300 ms | `ease` |
| Karta HUD | pojawienie | krycie + blur | 550 ms | domyślna |
| Pasek karty | postęp | szerokość | 600 ms | domyślna |
| Rdzeń | hover / klik | skala 1,05 / 0,96 | 300 ms | domyślna |
| Rdzeń | mówienie | `speak` | 350 ms, w kółko | `ease-in-out` |
| Pierścienie | thinking / listening | szybszy obrót | 3,2 s (cr3), 16 s (cr1) na obrót | liniowa |
| „Cofnij” | pokazanie | pasek kurczy się do 0 | 8000 ms | liniowa |
| Mikrofon / kropka aktywnej karty | nagrywanie / praca | `breathe` (krycie 0,55) | 1 s, w kółko | domyślna |

## Accessibility Notes

- **Kolejność fokusu (kolejność w DOM):** pasek górny → pasek ikon → rdzeń → telemetria → okna (dokładane na końcu pulpitu) → dok
  (jedno miejsce w kolejności Tab; strzałki / Home / End między ikonami — „roving tabindex”) → przyciski paneli
  (Process Log, Czat) → otwarte panele. Pytanie
  i „Cofnij” przejmują uwagę czytnika przez regiony na żywo, nie przez przeniesienie fokusu.
- **Role i etykiety (są):** `#boot` dialog „Uruchamianie Jarvis OS”; `#modeHud` `aria-live=polite` „Stan agenta”; `#core` „Jarvis — kliknij,
  aby mówić”; `#hud` „Przepływ zadania”; `#askChip` `role=dialog` + `aria-live=assertive`; `#undoChip` `role=status` + `aria-live=polite`;
  `#deck` „Telemetria”; `#dock` „Dok”; panele „Czat z Jarvisem”, „Process Log”, „Powiadomienia”; `#onboard` dialog „Pierwsze uruchomienie”;
  kanwa przepływu `aria-hidden`.
- **Klawiatura:** `Ctrl+K` / `/` paleta · `Ctrl+Spacja` mów · `Alt+J` czuwanie · `Alt+1/2/3` czat / Process Log / telemetria · `Alt+N`
  powiadomienia · `Alt+W` następne okno · `Alt+strzałki` przyciągnij · `Alt+Enter` maksymalizuj · `Esc` zamknij / anuluj pytanie /
  przerwij mowę · fokus widoczny: obrys 2 px akcent + poświata 4 px.
- **Uzupełnione 2026-10-04 (sprawdzane w `tests/e2e/smoke.js`):**
  - `#toasts` ma `role="status"` + `aria-live="polite"` — czytnik ogłasza toasty;
  - `#askChip` ma `aria-labelledby="askQ"` (treść pytania). `aria-modal` celowo **nie**: na pytanie można odpowiedzieć
    także w czacie i głosem, więc reszta strony musi zostać dostępna;
  - schowane chipy (`#askChip`, `#undoChip`, `#resultChip`) są `inert` — ich przyciski nie zostają w kolejności Tab
    ani w drzewie czytnika; pokazanie zdejmuje `inert` przed wstawieniem treści (fokus i ogłoszenie działają);
  - karty HUD mają `role="button"`, `tabindex="0"`, Enter/Spacja = klik; schowany HUD jest `inert`;
  - przyciski okna 28×28 px przy myszy spełniają WCAG 2.2 AA (2.5.8, min. 24 px); przy dotyku (`pointer: coarse`) 40×40 px.

## Implementacja — wskazówki

- Nowe komponenty: kolory i odstępy wyłącznie z tokenów; warstwa z tabeli Layout; tekst stanu po polsku, bez kodów.
- Ruch zawsze przez poziom efektów (`J.fx`) i z poszanowaniem `prefers-reduced-motion`.
- Każda nowa karta / wskaźnik musi mieć źródło w szynie `J.ev` (zasada „nic na niby”) — zob. [09 §4](09-wyglad-stany.md).
- Po zmianie plików strony podbij `CACHE` w `sw.js`, inaczej użytkownicy dostaną starą wersję.
