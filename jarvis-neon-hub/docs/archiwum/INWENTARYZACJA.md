# Jarvis OS — inwentaryzacja: co rozpisać, uwzględnić i przemyśleć

> **Dokument historyczny** (inwentaryzacja z 2026-09-29/30, punkt wyjścia specyfikacji). Liczby poleceń i stany poniżej są
> nieaktualne — aktualny stan: [specyfikacja](../spec/README.md), [katalog poleceń](../spec/katalog-polecen.md), [decyzje (ADR)](../adr/README.md).

Data: 29.09.2026. Stan sprawdzony w kodzie (branch `claude/jev-wdrozenie`, PR #2). Dokument służy do planowania; kodu jeszcze nie piszemy.

> **Pełna specyfikacja** (każdy obszar do najmniejszego szczegółu, decyzje, katalogi z kodu, plan wdrożenia W1–W5): [docs/spec/README.md](../spec/README.md).

Legenda: `[jest]` działa · `[część]` działa częściowo · `[brak]` do zaprojektowania · `[decyzja]` wymaga decyzji właściciela.

> **Uwaga o źródłach.** Pierwsza wersja tej listy powstała poza repozytorium (pliki `/workspace/jarvis-*.md`, których tu nie ma). Poniżej jej treść, **z poprawionymi statusami** tam, gdzie kod mówi co innego. Poprawki oznaczone jako _(poprawione)_.

---

## 0. Warstwy

1. Powłoka UI: topbar, pasek ikon, dok, rdzeń (orb), 10 kart HUD, okna, panele.
2. Menedżer okien (WM): otwórz, zamknij, fokus, przesuń, rozmiar, przyciągnij, kafelki, układy.
3. Aplikacje (11): czat, notatnik, rynek, harmonogram, monitor, pogoda, terminal, kalkulator, minutnik, ustawienia, biblioteka.
4. Widgety: `note`, `list`, `result`. Technicznie to mini-okna `w:id` w tym samym WM _(poprawione: ta decyzja jest już podjęta w kodzie)_.
5. Dane: notatki, zadania, pamięć, układy, skróty, ustawienia, historia czatu (IndexedDB).
6. Agent: parser lokalny, Hermes, Jev, rejestr (**63 polecenia**, a nie 58 _(poprawione)_), weryfikacja, plan.
7. Wejście: klawiatura, mysz, głos, pliki, adres z `#`.
8. Wyjście: toast, mowa, powiadomienia, Process Log, HUD, przycisk „Cofnij”.
9. Integracje: pogoda, krypto, OpenRouter, File System Access, ICS, WWW.
10. Cykl życia: onboarding, PWA, kopia danych, offline, uprawnienia.

---

## A. Nawigacja

- [jest] Otwórz / zamknij / przełącz aplikację, fokus, `Alt+W`, `Alt+strzałki`, paleta `Ctrl+K`, głos `Ctrl+Spacja`.
- [jest] **„Wróć”** do poprzedniego okna (`nav_back`, także zamkniętego) _(poprawione: było „brak”)_.
- [jest] Skok do dnia w harmonogramie (`schedule_day`) i do sekcji ustawień (`settings_open`) _(nowe)_.
- [brak] „Dalej” (odwrotność „wróć”), historia trybów.
- [brak] Nawigacja **wewnątrz** aplikacji: zakładka monitora, para w rynku, miasto w pogodzie, konkretna notatka po nazwie (poza `notes_read show`).
- [brak] Wyszukiwanie globalne (notatki + zadania + czat + ustawienia + pliki naraz).
- [brak] Adres z `#` do okna lub notatki (`#app=notes&note=…`). Dziś `#` służy tylko do konfiguracji.
- [brak] „Ostatnio otwarte” / „przypięte”, okruszki w ustawieniach.
- [brak] Pełna mapa skrótów (do wydruku i do zmiany), obsługa doku i paska samą klawiaturą.
- [decyzja] Tryby przestrzeni `idle / thinking / work / clean` z makiet — łączyć z obecnym WM czy nie (patrz N1).

## B. Okna

- [jest] Otwórz, zamknij, minimalizuj, maksymalizuj, przesuń, zmień rozmiar, przyciągnij do krawędzi, kafelki, układy (`layout_save`, presety praca / rynek / czysto), zapamiętywanie pozycji.
- [jest] Cofanie przesunięcia okna przez Jarvisa (`wm_move` ma cofanie) _(nowe)_.
- [część] Rozmiar tylko z jednego uchwytu; minimum globalne 280×180.
- [brak] Zmiana rozmiaru z każdej krawędzi, minimum/maksimum na aplikację.
- [brak] „Otwórz ponownie ostatnio zamknięte”, pytanie o niezapisane zmiany przy zamykaniu.
- [brak] Zawsze na wierzchu (minutnik, alert kursu), „na spód”.
- [brak] Edytor układów, eksport układu, układ startowy.
- [brak] Reguły kolizji: nowy widget nie zasłania czatu; za dużo okien → kafelki albo pytanie.
- [decyzja] Kilka okien tej samej aplikacji (2× notatnik)?
- [decyzja] Czy agent może sam przesuwać i zmieniać rozmiar okien. **Dziś:** może, jako zapis A2 z „Cofnij” (plan Jeva).

## C. HUD, panele, wygląd

- [jest] Rdzeń ze stanami, 10 kart zasilanych zdarzeniami, Process Log (plan, kroki, historia, eksport, powtórka), czat ze strumieniem i przypinaniem wyniku, telemetria.
- [jest] `prefers-reduced-motion` w CSS _(poprawione: było „brak”)_.
- [brak] Kontrakt „zdarzenie → co pokazuje karta”, klik w kartę → skok do szczegółów.
- [brak] Filtry Process Loga (tylko błędy / narzędzia / ta tura).
- [brak] Czat: wątki, edycja ostatniej wiadomości, załączniki, wyszukiwanie w historii.
- [brak] Koszt sesji (tokeny Hermesa). Koszt Jeva **jest** w ustawieniach _(poprawione)_.
- [brak] Wspólny wygląd stanów: ładowanie, pusto, błąd, offline, odmowa, częściowo, dane nieaktualne.
- [brak] Skala interfejsu, gęstość, pełne `aria` w oknach, wąski ekran.
- [decyzja] Poziom efektów: „narzędzie” czy „film” (suwak?).

## D. Aplikacje (co trzeba rozpisać w każdej)

| Aplikacja | Jest | Brak / do decyzji |
|---|---|---|
| Czat | wysyłanie, przerwanie, przypięcie wyniku, historia w IndexedDB | wątki, szukanie, eksport, retencja [decyzja] |
| Notatnik | tworzenie, odczyt, szukanie, dopisanie, zmiana, usuwanie, eksport, cofanie | tagi, foldery, kosz, wersje, podgląd Markdown |
| Zadania / harmonogram | dodaj, lista, odhacz, przesuń, odłóż, usuń, import ICS, cofanie | powtarzanie, priorytety, przeciąganie między dniami, eksport ICS |
| Rynek | ceny, obserwowanie z progiem | własna lista, historia alertów, flaga „na żywo / atrapa”; **zero handlu** |
| Pogoda | odczyt | wybór miasta w aplikacji, jednostki, ostatnie znane dane offline |
| Terminal | polecenia Jarvisa, mutujące wymagają zgody | podpowiedzi, historia |
| Kalkulator | liczy | historia wyników |
| Minutnik | start/stop/pauza/przedłużenie, cofanie | kilka naraz, preset pomodoro, zawsze na wierzchu |
| Ustawienia | wszystkie sekcje + panel Jeva (prywatność, autonomia, progi, budżet, dziennik) | zmiana skrótów, tryb bez sieci, PIN [decyzja] |
| Biblioteka / skróty | dodaj, usuń | edycja, kolejność w doku, foldery |
| Pliki | wybór folderu, lista, odczyt, zapis (ze zgodą), eksport | drzewo folderów, podgląd, działanie bez File System Access |

## E. Widgety

- [jest] Typy `note`, `list`, `result`; tworzenie, zmiana, usuwanie (ze zgodą), przesuwanie jak okno, cofanie tworzenia i zmiany.
- [brak] Zwijanie, przezroczystość, przypięcie, odświeżanie danych na żywo, znacznik „nieaktualne”.

### E+. Widgety budowane z opisu (nowy pomysł)

Mówisz: „zrób widget z Top 5 tokenów i zmianą 24h”, „kartę z checklistą na dziś”, „mini wykres BTC”. Jarvis nie szuka szablonu, tylko składa **opis widgetu (spec JSON)** i buduje z niego kartę. Szablony `note` / `list` / `result` zostają jako skrót i wyjście awaryjne.

Opis widgetu zawiera:
- tytuł, rozmiar, układ;
- **bloki tylko z dozwolonej listy**: tekst, markdown, liczba (KPI), tabela, lista, lista zadań, wykres, plakietka, przycisk;
- **źródła danych tylko z rejestru** (np. `get_crypto_prices`, `tasks_list`, `get_weather`) — nigdy dowolny adres;
- odświeżanie (co ile, tylko gdy widoczny);
- przyciski wywołujące polecenia rejestru (z normalnym poziomem ryzyka i zgodą).

Zasady bezpieczeństwa:
- **Żadnego dowolnego HTML ani JavaScriptu.** Rysuje tylko nasz kod z bloków; tekst zawsze jako tekst.
- Walidacja opisu tym samym mechanizmem co argumenty poleceń (schemat + koercja); błędny opis → widget awaryjny z komunikatem.
- Przyciski w widgecie to źródło `ui` (kliknięcie użytkownika); dane z zewnątrz w widgecie są „obce” (heurystyka wstrzyknięć).

Do dopięcia:
- kto składa opis: Hermes (narzędzie `widget_build`), Jev tylko wybiera szablon lub źródło, gdy zdanie jest proste;
- zmiany: „zmień ten widget na wykres”, „dodaj kolumnę 7d” → aktualizacja opisu z „Cofnij”;
- stany: budowanie / działa / nieaktualne / błąd;
- zapis opisu (nie wyrenderowanego wyniku), żeby przeżył odświeżenie strony;
- limity: liczba bloków, częstotliwość odświeżania, liczba widgetów na żywo.

Fazy: **W0** spec i walidator (bez UI) → **W1** bloki tekst / lista / KPI / tabela → **W2** wykres i odświeżanie → **W3** edycja zdaniem. Akceptacja: 5 przykładowych zdań daje poprawne widgety, żaden opis nie wykona obcego kodu, widget przeżywa odświeżenie.

## F. Działania na każdym obiekcie

Dla okna, widgetu, notatki, zadania, skrótu, ustawienia, alertu rozpisać: utwórz, odczytaj, edytuj, usuń (kosz czy od razu), duplikuj, przenieś, zmień rozmiar, konfiguruj, eksportuj, szukaj/filtruj, zaznacz wiele, menu pod prawym przyciskiem, podpowiedź po najechaniu, skrót klawiszowy, **poziom ryzyka dla agenta** (A0–A3 z planu Jeva) i **cofanie**.

- [jest] Pytania (`ui_ask`), zgody Tak/Nie/Zawsze (bez „Zawsze”, gdy zgoda wymuszona), podświetlanie, narracja, przycisk „Cofnij” _(poprawione)_.
- [brak] Przeciąganie między aplikacjami (notatka → zadanie, wynik → widget), zaznaczanie wielu, wspólne okno modalne.

## G. Ustawienia

- [jest] Wygląd (kolor, tapeta, dźwięk), Hermes, OpenRouter, głos, agent, pamięć, pliki, dane.
- [jest] Jev: prywatność P0–P2, samodzielność (auto / tylko odczyty / zawsze pytaj), progi, budżet, lżejszy model do rozmowy, tryb cienia, dziennik, reset uczenia _(poprawione: było „brak”)_.
- [brak] Presety modeli (tani / zrównoważony / najlepszy), dzienny limit kosztu Hermesa, wybór głosu i tempa, godziny ciszy per kanał, zmiana skrótów, tryb „bez sieci”, czytelny spis danych w przeglądarce.
- [decyzja] Domyślny mózg: lokalny Hermes czy OpenRouter.

## H. Agent

- [jest] Parser → Jev → dopytanie → wykonanie → Hermes; router R1–R14; zgody; strażnik wywołań; wykrywanie wstrzyknięć; weryfikacja; pamięć z oceną poufności; cofanie (plan Jeva, PR #2).
- [brak] Dla każdego z 63 poleceń tabela: argumenty, ryzyko, przykłady PL, efekt w UI, cofanie, błędy. Większość danych jest w `js/commands.js` i `js/jev-policy.js`, więc tabelę można wygenerować skryptem.
- [brak] Szablony planów (poranek, porządek na pulpicie), pauza / pominięcie kroku, edytor rutyn, przegląd faktów w pamięci z edycją, dziennik zgód.

## I. Integracje

Pogoda, krypto, OpenRouter, pliki, ICS, WWW, powiadomienia systemowe, mowa — działają (szczegóły w README). SMS, poczta, Slack, Dysk, **handel** — **nie robimy** bez osobnej decyzji.

## J. Błędy i przypadki brzegowe

- [jest] Kody błędów rejestru, bezpiecznik Jeva, praca offline przez parser.
- [brak] Tabela „kod błędu → co widzi użytkownik”, częściowa porażka planu, jednoczesne przeciąganie okna przez użytkownika i agenta, podwójne polecenie (głos + tekst), naprawa uszkodzonych danych, niezgodność wersji PWA, kolejność działania `Esc`.

## K. Cykl życia i narzędzia

- [jest] PWA, offline, eksport/import, reset, testy (188 + przeglądarka), sonda Jeva.
- [brak] Samouczek pierwszego uruchomienia, flagi funkcji, nakładka diagnostyczna, 10-minutowa lista ręcznych testów.

## L. Wizualizacja danych

Do rozpisania każdego: cel, źródło (na żywo / atrapa), odświeżanie, interakcja, eksport.
Rdzeń i stany · karty HUD · oś czasu Process Loga · aktywność agenta · kursy krypto · kalendarz · postęp planu · telemetria · minimapa okien [decyzja] · koszt · pewność Jeva · różnice (układ, notatka) · **wykresy w widgetach z opisu (E+)**.

## M. Głos

- [jest] Mówienie na przycisk, słowo „Jarvis”, kolejka mowy, zgody głosem, odpowiedzi „no dobra” (Jev).
- [brak] Przerywanie Jarvisa w trakcie mowy, dyktowanie do notatki a polecenie, obrazy [decyzja].

## N. Decyzje o kształcie produktu

1. Makiety „Desktop” (4 tryby) i obecny Jarvis OS — jeden produkt czy dwa wyglądy na tych samych zdarzeniach?
2. Najpierw porządek w UI czy dalszy rozwój agenta?
3. Co świadomie **nie** robimy: handel, SMS, płatności, wielu użytkowników, aplikacja natywna.

## O. Kolejność rozpisywania

1. **Fala 1:** decyzje z N; tabela obiekt × działanie (F) dla okna, widgetu, notatki, zadania, ustawienia; tabela 63 poleceń (H); wspólne stany (C); kolejność `Esc`, fokus i zgody (J).
2. **Fala 2:** tryby przestrzeni, WM (krawędzie, edytor układów, zawsze na wierzchu), czat i filtry logu, wyszukiwanie globalne i paleta.
3. **Fala 3:** notatki (tagi, kosz, wersje), zadania (powtarzanie), ustawienia modeli i koszt.
4. **Fala 4:** szablony planów, rutyny, **widgety z opisu (E+)**.
5. **Fala 5:** efekty i dźwięki, nowe integracje po osobnej zgodzie.

## P. Otwarte pytania

1. Łączymy makiety z repozytorium czy najpierw dopracowujemy obecny interfejs?
2. Agent sam przesuwa okna (dziś tak, z „Cofnij”) — zostawić?
3. Autonomia Jeva na start — zostaje „auto z Cofnij” (decyzja z 29.09)?
4. Kosz dla usuwanych rzeczy czy wystarczy zgoda + „Cofnij”?
5. Wyszukiwanie globalne i paleta — priorytet?
6. Handel i SMS — na stałe na liście „nie”?
7. Poziom efektów: narzędzie / film / suwak?
8. Kilka okien tej samej aplikacji?
9. Domyślny mózg: lokalnie czy OpenRouter?
10. Następny dokument: spec WM, spec notatek, układ ustawień czy **spec widgetów z opisu**?
