# 12 · Głos

Kod: `J.voice` (mowa, `js/core.js`), `J.ear` (rozpoznawanie, `js/core.js`), forma odpowiedzi `J.policy.output` (D13, `js/jev-policy.js`).

## 1. Mówienie do Jarvisa

| sposób | jak | stan |
|---|---|---|
| przycisk | mikrofon w czacie / topbarze, klik w rdzeń | ✅ |
| skrót | `Ctrl Spacja` | ✅ |
| czuwanie | `Alt J` albo ustawienie „słowo Jarvis” — nasłuch ciągły, reaguje na „Jarvis…”, „hej Jarvis”, „ok Jarvis” (i warianty wymowy: dżarwis, jarwis…) | ✅ |
| odpowiedź na pytanie | po pytaniu Jarvisa (gdy pytanie padło głosem) mikrofon włącza się sam na odpowiedź | ✅ |

Zasady:
- Rozpoznawanie przez przeglądarkę (Web Speech API: Chrome, Edge); brak → komunikat „Użyj Chrome lub Edge” ✅.
- W czuwaniu zdania **bez** słowa „Jarvis” nie są nigdzie wysyłane (ani do Jeva, ani do Hermesa) — plan Jeva §9 ✅.
- Zdanie z głosu ma źródło `voice` — polecenia nieodwracalne zawsze pytają o zgodę (L1 ✅).
- 🆕 W2: język rozpoznawania (`sttLang`), czułość czuwania ⚑ nie (przeglądarka nie daje takiej kontroli — zamiast tego lista wariantów słowa).
- 🆕 W2: podgląd rozpoznawanego tekstu na żywo nad rdzeniem (wyniki częściowe), anulowanie „nieważne” / „anuluj”.

## 2. Mowa Jarvisa

✅ Kolejka z priorytetami (0 czeka, 1 normalnie, 2 przerywa bieżącą), wybór głosu (polski „Google/Natural” jeśli jest), czyszczenie tekstu (bez znaczników, linków, ikon; do 900 znaków), `rate` 1,04, `pitch` 0,92, rdzeń w stanie `speaking`.

Kiedy Jarvis mówi (D13 ✅ `J.policy.output`):
| sytuacja | mówi? |
|---|---|
| pytanie zadane głosem | tak (nawet przy wyłączonej mowie) |
| pytanie wpisane, mowa włączona | tak, poza trybem skupienia |
| sygnał (minutnik, zadanie) w ciszy nocnej | nie (tylko powiadomienie) |
| długa odpowiedź | czyta 2 pierwsze zdania, reszta na ekranie |
| ostrzeżenia (`⚠ …`) | nie czyta |

🆕 W2/W5:
- **Przerywanie Jarvisa** (barge-in): gdy mówi, a użytkownik zaczyna mówić (w czuwaniu: słowo „Jarvis”; przy przycisku: naciśnięcie) — mowa staje od razu ✅ (`J.voice.stop` przy starcie nasłuchu), 🆕 „stop” / „cicho” / „dość” w czuwaniu zatrzymuje mowę bez polecenia.
- Tempo mowy (`speechRate`), głośność (`volume`) — W2/W5.
- Tryb `present` — mowa wyłączona.

## 3. Potwierdzenia głosem

✅ Pytanie czytane z opcjami („… Tak, Nie, Zawsze?”), odpowiedź rozpoznawana: nazwa opcji, „tak/zgoda/ok/jasne/dawaj” = pierwsza opcja, „nie/anuluj/stop” = opcja odmowy; niejasne → Jev D15 („no dobra” = tak).
Zasada bezpieczeństwa: przy zgodzie **wymuszonej** (strażnik, wstrzyknięcie) nie ma opcji „Zawsze” ani jej rozpoznawania ✅.

## 4. Dyktowanie a polecenie (🆕 W3)

Problem: „zanotuj …” vs chęć dyktowania długiego tekstu do otwartej notatki.
- **Tryb dyktowania**: „dyktuj do notatki zakupy” / przycisk 🎙 w Notatniku → każda kolejna wypowiedź jest dopisywana jako tekst (bez interpretacji), aż do „koniec dyktowania” / 10 s ciszy / `Esc`.
- Interpunkcja słowami: „kropka”, „przecinek”, „nowa linia”, „znak zapytania”.
- W trybie dyktowania rdzeń ma stan „słucham — dyktowanie” i czerwoną kropkę w Notatniku.
- Poza trybem dyktowania każda wypowiedź to polecenie (jak dziś).

## 5. Czego nie robimy

- Nagrywania i zapisywania dźwięku (tylko tekst z rozpoznawania).
- Rozpoznawania osób po głosie.
- Rozpoznawania w tle przy ukrytej karcie (przeglądarka i tak zatrzymuje; komunikat „Czuwanie wstrzymane — wróć do karty”).
- Własnego modelu mowy (poza przeglądarką) — ⚑ do rozważenia po W5.

## 6. Kryteria akceptacji

- W czuwaniu 20 zdań bez „Jarvis” → 0 wywołań sieci (test z atrapą rozpoznawania).
- „stop” podczas mowy zatrzymuje ją w ≤ 200 ms.
- Dyktowanie 5 wypowiedzi → 5 linii w notatce, bez wykonania żadnego polecenia (nawet gdy zdanie brzmi jak polecenie).
