# 01 · Decyzje produktowe

Każda decyzja ma: pytanie, **decyzję domyślną (⚑)**, powód i co się zmieni, jeśli właściciel wybierze inaczej. Decyzje oznaczone „✔ zatwierdzone” zostały już podjęte w rozmowie (29.09.2026).

| # | pytanie | decyzja | status |
|---|---|---|---|
| D-01 | Makiety „Desktop” (tryby idle / thinking / work / clean) a obecny Jarvis OS — jeden produkt czy dwa? | **Jeden produkt.** Tryby to warstwa nad obecnym menedżerem okien (polecenie `ui_mode`), a nie osobna aplikacja. Stan `idle`/`thinking` ustawia agent, `work`/`clean`/`focus`/`present` użytkownik. | ⚑ domyślnie |
| D-02 | Co najpierw: porządek w UI czy agent? | **Najpierw nawigacja i okna (W1), potem wyszukiwanie i ustawienia (W2), dane (W3), widgety z opisu i rutyny (W4), efekty (W5).** Agent (Jev) jest już wdrożony — nowe polecenia automatycznie z niego korzystają. | ⚑ domyślnie |
| D-03 | Czy agent może sam przesuwać i zmieniać rozmiar okien? | **Tak, jako A2** (od pewności 0,92 wykonuje sam i pokazuje „Cofnij”). Zamykanie wielu okien — A1. | ✔ zatwierdzone (plan Jeva) |
| D-04 | Samodzielność Jeva na start | **„auto z Cofnij”** (A3 + A2), próg A2 = 0,92. | ✔ zatwierdzone |
| D-05 | Kosz czy tylko zgoda? | **Kosz dla notatek (30 dni)**; dla zadań, widgetów, skrótów, układów, rutyn — zgoda + „Cofnij” przez 10 minut (dane trzymane w stosie cofania). Opróżnienie kosza — zawsze zgoda. | ⚑ domyślnie |
| D-06 | Wyszukiwanie globalne i paleta — priorytet? | **Tak, W2.** Paleta (`Ctrl+K`) staje się też wyszukiwarką (`search_all`). | ⚑ domyślnie |
| D-07 | Handel, SMS, płatności, e-mail | **Nie robimy.** Rynek jest tylko do podglądu. Każda taka integracja wymaga osobnego dokumentu i zgody. | ⚑ domyślnie |
| D-08 | Poziom efektów | **Suwak `fx_level`: off / tool / standard / cinema, domyślnie standard.** `prefers-reduced-motion` wymusza `off` dla animacji ruchu. | ⚑ domyślnie |
| D-09 | Kilka okien tej samej aplikacji? | **Nie** (poza widgetami, których może być wiele). Prostsze polecenia („zamknij notatnik”) i pamięć pozycji. Wyjątek do rozważenia później: Notatnik z dwiema notatkami obok siebie → zamiast drugiego okna tryb „podział” w samym Notatniku. | ⚑ domyślnie |
| D-10 | Domyślny mózg | Lokalny Hermes, profil `jarvis-desktop` przez most (`/bridge/v1` → gateway `:8643`, ADR 0003); bez mostu — zwykły Hermes Agent (`http://localhost:8642/v1`) albo OpenRouter z kluczem. Bez żadnego — parser lokalny. | ⚑ domyślnie |
| D-11 | Widgety z opisu — kto składa opis? | **Hermes** (narzędzie `widget_build` z opisem JSON). Jev tylko rozpoznaje intencję „zbuduj widget”. Proste prośby („lista zakupy: mleko, chleb”) dalej obsługuje parser → `create_widget`. | ⚑ domyślnie |
| D-12 | Czy widget może mieć własny kod (HTML/JS)? | **Nigdy.** Tylko bloki z listy w [widget.schema.json](widget.schema.json). | ⚑ domyślnie |
| D-13 | Gdzie trzymać dane rosnące (wersje notatek, kosz, wątki czatu)? | **IndexedDB** (`J.store`), nie `localStorage` (limit ~5 MB). W `localStorage` zostaje tylko lekki stan. | ⚑ domyślnie |
| D-14 | Wiele kart przeglądarki z Jarvisem naraz | **Jedna karta „główna”.** Druga karta pokazuje komunikat „Jarvis działa w innej karcie — przejmij tutaj” (BroadcastChannel). Bez tego dwie karty nadpisują sobie dane. | ⚑ domyślnie |
| D-15 | Telefon i tablet | **Obsługiwane w trybie uproszczonym:** poniżej 640 px okna otwierają się na cały ekran jedno na raz, dok jest paskiem na dole, bez przeciągania okien. | ⚑ domyślnie |
| D-16 | Język | **Polski** w interfejsie i poleceniach; rozumienie angielskich zdań przez Jeva/Hermesa bez tłumaczenia interfejsu. | ⚑ domyślnie |
| D-17 | Konta, logowanie, synchronizacja między urządzeniami | **Nie teraz.** Przenoszenie danych przez eksport/import pliku. | ⚑ domyślnie |
| D-18 | PIN przy starcie | **Nie w W1–W5** (dane są w przeglądarce użytkownika; PIN w przeglądarce daje złudne bezpieczeństwo). Zamiast tego tryb `present` ukrywa prywatne treści. | ⚑ domyślnie |
| D-19 | Undo globalne | **Tak:** każde odwracalne polecenie (z UI też) trafia na jeden stos; „cofnij” i `Ctrl+Z` poza polem tekstowym cofa ostatnią akcję. | ⚑ domyślnie |
| D-20 | Następny dokument po tej specyfikacji | Specyfikacja jest kompletna; kolejny krok to wdrożenie **W1** wg [17-wdrozenie.md](17-wdrozenie.md). | ⚑ domyślnie |

## Czego świadomie nie robimy (lista „nie”)

- Handel i składanie zleceń, płatności, SMS, e-mail, komunikatory, dostęp do kamery i nagrywanie ekranu.
- Dowolny kod w widgetach, wtyczki od osób trzecich.
- Konta użytkowników i serwer z danymi.
- Wielu użytkowników na jednym Jarvisie.
- Aplikacja natywna (Electron) — PWA wystarcza.
- Wysyłanie do Jeva treści notatek i plików (tylko tytuły na poziomie P2).

## Jak zmienić decyzję

Zmień wiersz w tabeli, a potem sprawdź dokumenty z kolumny „dotyczy” w [17-wdrozenie.md](17-wdrozenie.md) (każde zadanie wdrożenia ma odnośnik do decyzji, z której wynika).
