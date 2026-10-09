# 02 · Obiekty × działania

Dla każdego „rzeczownika” w Jarvisie: jak coś zrobić **myszką / dotykiem**, **klawiaturą**, **słowami** (tekst albo głos), które **polecenie** to wykonuje, jaki ma **poziom autonomii** (A3 sam po cichu · A2 sam z „Cofnij” · A1 pyta · A0 zgoda) i jak się **cofa**.

Status: ✅ działa · 🟡 częściowo · 🆕 do zrobienia (fala W1–W5 z [17-wdrozenie.md](17-wdrozenie.md)). Polecenia 🆕 są w [katalog-nowych-polecen.md](katalog-nowych-polecen.md).

**Zasady wspólne dla wszystkich obiektów**

1. **Jedna czynność = jedno polecenie rejestru.** Przycisk, menu, skrót, paleta, parser, Jev i Hermes wołają to samo polecenie (`J.registry.run`). Nie ma „drugiej drogi” w kodzie UI, która omija rejestr — dzięki temu wszystko ma cofanie, log i zgody. 🟡 dziś część przycisków (np. usuwanie zadania w Harmonogramie, edycja skrótu w menu) zmienia stan bezpośrednio → do przepięcia w W1.
2. **Wskazywanie celu** (który obiekt): po id, po fragmencie nazwy, „to/ten/tu” = aktywne okno lub zaznaczony obiekt, „ostatni” = ostatnio utworzony/zmieniony, liczebnik („drugie okno”, „trzecie zadanie”) = kolejność na ekranie. Gdy pasuje kilka — chipy z wyborem (✅ działa dla notatek i zadań; 🆕 dla okien, widgetów, skrótów, układów).
3. **Zbiorowo** („wszystkie”, „zrobione”, „z dziś”): działanie na > 3 obiektach ⇒ co najmniej A1 i jedno „Cofnij” dla całości; usuwanie zbiorowe ⇒ A0.
4. **Menu kontekstowe** (prawy przycisk / długie przytrzymanie palca 500 ms) jest dla każdego obiektu i zawiera te same czynności co tabela, w tej kolejności: Otwórz · Edytuj/Zmień nazwę · Duplikuj · Przypnij · Eksportuj · — · Usuń (na czerwono).
5. **Zaznaczanie wielu** (🆕 W3): `Ctrl`/`Shift`+klik w listach (notatki, zadania, widgety na pulpicie ramką), pasek akcji zbiorowych na dole listy.
6. **Przeciąganie między aplikacjami** (🆕 W3, myszą i palcem; każde upuszczenie = jedno polecenie z „Cofnij”):
   | co | dokąd | skutek | polecenie |
   |---|---|---|---|
   | notatka (z listy) | pasek dni Harmonogramu | zadanie z notatki na ten dzień | `notes_to_task` |
   | zadanie | inny dzień na pasku / w widoku tygodnia | zmiana daty | `tasks_update` |
   | wynik w czacie (dymek Jarvisa) | pulpit | widget „wynik” | `create_widget` |
   | zaznaczony tekst z dowolnego okna | Notatnik / widget-lista | dopisanie / nowa pozycja | `notes_append` / `widget_items` |
   | plik z komputera | okno Pliki / Harmonogram (.ics) / Notatnik (.txt, .md) | kopia do folderu / import / nowa notatka | `files_write` / (import) / `create_note` |
   | skrót | dok | przypięcie do doku | `dock_order` |
   Podczas przeciągania cele podświetlają się, niedozwolone mają kursor „zakaz”.
7. **Podpowiedzi po najechaniu** (🆕 W2, po 600 ms, znikają po wyjściu): przyciski — nazwa + skrót klawiszowy („Zamknij · Esc”); ikony w doku — nazwa + „otwarte / zminimalizowane”; kropki stanu — stan usług ([14](14-integracje.md) §3); obcięte tytuły — pełny tytuł; wykresy — wartość w punkcie. Na dotyku zamiast najechania — długie przytrzymanie.
8. **Po każdej zmianie**: krótki toast lub dymek w czacie, podświetlenie zmienionego obiektu (`ui_highlight`) i — dla A2 — chip „Cofnij” 8 s.

---

## 1. Okno aplikacji

| działanie | mysz / dotyk | klawiatura | słowa (przykład) | polecenie | poziom | cofanie | status |
|---|---|---|---|---|---|---|---|
| otwórz | ikona w doku / pasku, paleta, menu pulpitu | `Ctrl K` → nazwa; `/` | „otwórz notatnik” | `open_app` | A3 | zamknij | ✅ |
| otwórz na widoku | — | paleta | „pokaż stoper”, „otwórz notatkę zakupy” | `app_view` | A3 | `nav_back` | ✅ |
| zamknij | ✕ w nagłówku | `Esc` (najwyższe okno) | „zamknij to” | `close_app` | A0 dziś (każde zamknięcie od agenta/głosu pyta); ⚑ W1: jedno okno → A3 z `wm_reopen`, „wszystkie” → A0 | `wm_reopen` | ✅ / ✅ |
| zamknij pozostałe | menu nagłówka | — | „zostaw tylko notatnik” | `wm_close_others` | A1 | `wm_reopen` | ✅ |
| otwórz ponownie zamknięte | menu pulpitu | `Ctrl Shift T` (poza polem tekstowym) | „przywróć zamknięte okno” | `wm_reopen` | A3 | zamknij | ✅ |
| aktywuj (fokus) | klik w okno | `Alt W` (kolejne) | „przełącz na pogodę” | `wm_focus` | A3 | `nav_back` | ✅ |
| wróć / dalej | — | ✅ `Ctrl Alt ←` / `Ctrl Alt →` | „wróć”, „dalej” | `nav_back` / `nav_forward` | A3 | odwrotne | ✅ / ✅ |
| minimalizuj | `–` w nagłówku | — | „zminimalizuj notatnik” | `wm_minimize` | A3 | `wm_restore` | ✅ / ✅ |
| pokaż pulpit / przywróć | menu pulpitu | ✅ `Alt D` | „pokaż pulpit”, „przywróć okna” | `wm_minimize all` / `wm_restore` | A3 | odwrotne | ✅ / ✅ |
| maksymalizuj | `□`, dwuklik nagłówka | `Alt Enter` | „na cały ekran” | `wm_arrange max` | A3 | ponownie | ✅ |
| przesuń | przeciągnij nagłówek | ✅ `Alt Shift ←→↑↓` (o 40 px) | „przesuń notatnik w prawo” | `wm_move` (rozszerzenie) | A2 | poprzednia pozycja | ✅ piksele / ✅ względnie W1 |
| zmień rozmiar | uchwyt w rogu; ✅ każda krawędź | ✅ `Alt Ctrl Shift ←→↑↓` | „powiększ to okno”, „zrób minutnik mały” | `wm_move` (size / w,h) | A2 | poprzedni rozmiar | 🟡 róg / ✅ krawędzie W1 |
| przyciągnij | przeciągnij do krawędzi (podgląd) | `Alt ←→↑↓` | „okno na lewo” | `wm_arrange left/right/top/bottom/center` | A3 | ponownie | ✅ |
| kafelki | menu pulpitu | 🆕 `Alt T` | „ułóż okna” | `wm_arrange tile` | A3 | 🆕 poprzedni układ | ✅ / 🆕 cofanie W1 |
| zawsze na wierzchu | ✅ pinezka w nagłówku | — | „przypnij minutnik na wierzchu” | `wm_pin` | A2 | odepnij | ✅ |
| zapisz układ | menu pulpitu | — | „zapisz układ jako biuro” | `layout_save` | A2 | usuń układ | ✅ |
| menu okna | 🆕 prawy przycisk na nagłówku | 🆕 `Alt Spacja` | — | — | — | — | 🆕 W1 |
| lista okien | — | — | „jakie okna są otwarte” | `wm_list` | A3 | — | ✅ |

## 2. Widget

| działanie | mysz / dotyk | klawiatura | słowa | polecenie | poziom | cofanie | status |
|---|---|---|---|---|---|---|---|
| utwórz z szablonu | menu pulpitu „Nowy widget: …” | paleta | „stwórz listę zakupy: mleko, chleb” | `create_widget` | A2 | usuń | ✅ |
| utwórz z opisu | ✅ przycisk „✦ Zbuduj” w menu pulpitu | paleta | „zrób widget z top 5 tokenów” | `widget_build` | A2 | usuń | ✅ |
| przypnij wynik czatu | „Przypnij wynik” przy odpowiedzi | — | „przypnij to” | `create_widget result` | A2 | usuń | ✅ |
| edytuj treść | pisz w widgecie (notatka, lista) | — | „dopisz jajka do listy zakupy” | `widgets_update` / `widget_items` | A2 | poprzednia treść | ✅ / ✅ |
| zmień opis (widget z opisu) | ✅ „✎ Zmień” w nagłówku | — | „zmień ten widget na wykres” | `widget_edit` | A2 | poprzedni opis | ✅ |
| zmień nazwę | 🆕 dwuklik tytułu | `F2` gdy aktywny | „zmień tytuł widgetu na Krypto” | `widgets_update title` | A2 | poprzedni tytuł | ✅ polecenie / 🆕 UI W3 |
| przesuń / rozmiar | jak okno | jak okno | „przesuń widget krypto w lewo” | `wm_move app=w:<id>` | A2 | poprzednie | ✅ mysz / 🆕 słowa W1 |
| zwiń | ✅ `˄` w nagłówku | — | „zwiń widget krypto” | `widget_collapse` | A3 | rozwiń | ✅ |
| na wierzchu | ✅ pinezka | — | „przypnij widget” | `wm_pin` | A2 | odepnij | ✅ |
| odśwież | ✅ `⟳` (tylko widgety z danymi) | — | „odśwież widgety” | `widget_refresh` | A3 | — | ✅ |
| duplikuj | menu | — | „zduplikuj ten widget” | `widget_duplicate` | A2 | usuń kopię | ✅ |
| usuń | ✕ w nagłówku | — | „usuń widget zakupy” | `widgets_remove` | A0 (od agenta) / ✕ = UI | ✅ przywróć 10 min | ✅ / ✅ cofanie W1 |
| lista | — | — | „jakie mam widgety” | `widgets_list` | A3 | — | ✅ |

## 3. Notatka

| działanie | mysz / dotyk | klawiatura | słowa | polecenie | poziom | cofanie | status |
|---|---|---|---|---|---|---|---|
| utwórz | `+` w Notatniku, menu pulpitu | ✅ `Ctrl Alt N` | „zanotuj: kupić mleko” | `create_note` | A2 | usuń | ✅ |
| otwórz | klik na liście | strzałki + `Enter` ✅ | „otwórz notatkę zakupy” | `notes_read show` / `app_view` | A3 | `nav_back` | ✅ / ✅ |
| przeczytaj na głos | „Czytaj” | — | „przeczytaj notatkę zakupy” | `notes_read` + mowa | A3 | — | ✅ |
| edytuj | pisz (zapis automatyczny po 0,4 s) | — | „zmień notatkę zakupy na …” | `notes_update` | A2 | ✅ wersja | ✅ |
| dopisz | — | — | „dopisz do notatki zakupy: chleb” | `notes_append` | A2 | poprzednia treść | ✅ |
| zmień tytuł | pole tytułu | — | „zmień tytuł notatki na Plan” | `notes_update title` | A2 | poprzedni | ✅ |
| szukaj | pole „Szukaj…” | ✅ `Ctrl F` w Notatniku | „szukaj w notatkach mleko” | `notes_search` | A3 | — | ✅ |
| tagi | ✅ pole tagów pod tytułem | — | „dodaj tag dom” | `notes_tag` | A2 | poprzednie | ✅ |
| folder | ✅ przeciągnij na folder, menu | — | „przenieś do folderu praca” | `notes_folder` | A2 | poprzedni | ✅ |
| przypnij | ✅ pinezka na liście | — | „przypnij notatkę zakupy” | `notes_pin` | A2 | odepnij | ✅ |
| duplikuj | ✅ menu | — | „zduplikuj notatkę” | `notes_duplicate` | A2 | usuń kopię | ✅ |
| wersje | ✅ „Historia” w stopce | — | „pokaż wersje notatki” | `notes_versions` / `notes_revert` | A3 / A2 | wersja sprzed | ✅ |
| zadanie z notatki | ✅ menu linii | — | „zrób zadanie z tej linijki” | `notes_to_task` | A2 | usuń zadanie | ✅ |
| eksport | „.txt” | — | „eksportuj notatkę do pliku” | `files_export_note` / ✅ `.md` | A1 | — (zawsze nowy plik, nic nie nadpisuje) | ✅ |
| usuń | 🗑 | ✅ `Del` na liście | „usuń notatkę zakupy” | `notes_delete` | A0 (głos/agent) / A3 wpisane + parser | ✅ kosz 30 dni | ✅ / ✅ kosz W3 |
| kosz / przywróć / opróżnij | ✅ „Kosz” na dole listy | — | „przywróć notatkę zakupy” | `notes_trash` / `notes_restore` / `notes_empty_trash` | A3 / A2 / A0 | — | ✅ |

## 4. Zadanie

| działanie | mysz / dotyk | klawiatura | słowa | polecenie | poziom | cofanie | status |
|---|---|---|---|---|---|---|---|
| dodaj | formularz w Harmonogramie | `Enter` w polu | „przypomnij mi o 18 trening” | `add_task` | A2 | usuń | ✅ (formularz 🟡 omija rejestr) |
| lista | Harmonogram | — | „co mam dziś” | `tasks_list` | A3 | — | ✅ |
| pokaż dzień | pasek dni | ✅ `←/→` na pasku | „pokaż piątek” | `schedule_day` | A3 | `nav_back` | ✅ |
| odhacz | pole wyboru | `Spacja` ✅ | „odhacz trening” | `tasks_complete` | A2 | odznacz | ✅ (pole 🟡 omija rejestr) |
| zmień treść/godzinę/dzień | ✅ dwuklik zadania | — | „przesuń trening na 19:30” | `tasks_update` | A2 | poprzednie | ✅ polecenie / ✅ UI W3 |
| odłóż (drzemka) | 🆕 w powiadomieniu „+15 min” | — | „odłóż trening o 15 minut” | `tasks_update snooze_minutes` | A2 | poprzednie | ✅ |
| przeciągnij na inny dzień | 🆕 przeciągnij na pasek dni | — | „przełóż na jutro” | `tasks_update date` | A2 | poprzednie | 🆕 W3 |
| powtarzanie | ✅ menu „Powtarzaj…” | — | „powtarzaj w poniedziałki” | `tasks_repeat` | A2 | poprzednia reguła | ✅ |
| priorytet | ✅ kropka koloru | — | „dentysta jest pilny” | `tasks_priority` | A2 | poprzedni | ✅ |
| podzadania | ✅ rozwiń zadanie | — | „dodaj podzadanie pakowanie” | `tasks_subtask` | A2 | poprzednie | ✅ |
| przenieś wiele | ✅ zaznacz → pasek | — | „przenieś dzisiejsze na jutro” | `tasks_move_many` | A1 | wszystkie naraz | ✅ |
| usuń | ✕ | `Del` ✅ | „usuń zadanie trening” | `tasks_remove` | A0 | ✅ przywróć 10 min | ✅ (✕ 🟡 omija rejestr) |
| usuń zrobione | ✅ „Wyczyść zrobione” | — | „usuń zrobione zadania” | `tasks_clear_done` | A0 | przywróć 10 min | ✅ |
| import / eksport ICS | „.ics” / ✅ „Eksport” | — | „eksportuj zadania do kalendarza” | (UI) / `tasks_export_ics` | A1 | — | ✅ import / ✅ eksport W3 |

## 5. Minutnik i stoper

| działanie | mysz | słowa | polecenie | poziom | cofanie | status |
|---|---|---|---|---|---|---|
| start | chipy 1–60 min, pole minut, Start | „minutnik 5 minut”, „pomodoro” | `start_timer` | A2 | zatrzymaj | ✅ jeden / ✅ kilka W3 |
| pauza / wznów / stop / dodaj czas | przyciski | „zatrzymaj minutnik”, „dodaj 5 minut” | `timer_control` | A2 | odwrotne | ✅ |
| lista | ✅ lista w oknie | „ile zostało” | `timer_list` | A3 | — | ✅ |
| stoper, okrążenia | zakładka „Stoper” | „pokaż stoper” | `app_view timer stopwatch` | A3 | — | ✅ UI / 🆕 słowa W1 |
| na wierzchu | ✅ pinezka | „minutnik na wierzchu” | `wm_pin` | A2 | odepnij | ✅ |

## 6. Skrót na pulpicie i dok

| działanie | mysz | słowa | polecenie | poziom | cofanie | status |
|---|---|---|---|---|---|---|
| dodaj | Biblioteka → formularz | „dodaj skrót do github.com” | `add_shortcut` | A2 | usuń | ✅ |
| otwórz | klik | „otwórz skrót github” | (UI) / ✅ `open_app`/`open_url` | A3 / A0 obcy adres | — | ✅ |
| zmień nazwę / adres / ikonę | menu (dziś okienko `prompt`) | „zmień nazwę skrótu github na kod” | `shortcut_edit` | A2 | poprzednie | 🟡 / ✅ |
| przesuń | ✅ przeciągnij na pulpicie i w doku | „notatnik na początek doku” | `dock_order` | A2 | poprzednia kolejność | ✅ |
| usuń | menu „Usuń z pulpitu” | „usuń skrót github” | `shortcut_remove` | A0 | ✅ przywróć 10 min | ✅ |

## 7. Układ okien

| działanie | mysz | słowa | polecenie | poziom | cofanie | status |
|---|---|---|---|---|---|---|
| zastosuj | 🆕 menu pulpitu „Układy ›” | „układ praca” | `wm_arrange layout` | A3 | 🆕 poprzedni układ | ✅ |
| zapisz | ✅ menu | „zapisz układ jako biuro” | `layout_save` | A2 | usuń | ✅ |
| lista / nazwa / usuń / startowy | ✅ edytor układów w Ustawieniach | „jakie mam układy”, „usuń układ biuro” | `layout_list` / `layout_rename` / `layout_remove` / `layout_startup` | A3 / A2 / A0 / A2 | tak | ✅ |

## 8. Fakt w pamięci

| działanie | mysz | słowa | polecenie | poziom | cofanie | status |
|---|---|---|---|---|---|---|
| zapamiętaj | — | „zapamiętaj, że pracuję zdalnie” | `memory_remember` (+ ocena poufności D12) | A2 | zapomnij | ✅ |
| przypomnij | Ustawienia → Pamięć | „co o mnie wiesz” | `memory_recall` | A3 | — | ✅ |
| popraw | ✅ edycja w liście | „popraw: pracuję hybrydowo” | `memory_edit` | A2 | poprzednia treść | ✅ |
| zapomnij | × w liście | „zapomnij, że mam psa” | `memory_forget` | A0 | ✅ przywróć 10 min | ✅ |

## 9. Plik (folder roboczy)

| działanie | mysz | słowa | polecenie | poziom | cofanie | status |
|---|---|---|---|---|---|---|
| wybierz folder | Ustawienia → Pliki | „wybierz folder roboczy” | (UI — wymaga kliknięcia, zasada przeglądarki) | — | — | ✅ |
| lista / odczyt | ✅ okno „Pliki” | „jakie mam pliki”, „przeczytaj plik todo.md” | `files_list` / `files_read` | A3 (treść = obca) | — | ✅ |
| podgląd | ✅ okno „Pliki” | „pokaż plik raport.md” | `files_open` | A3 | — | ✅ |
| zapisz | — | „zapisz plik plan.md: …” | `files_write` | A0 | — (nadpisanie!) | ✅ |
| eksport notatki | Notatnik | „eksportuj notatkę zakupy” | `files_export_note` | A1 | — (zawsze nowy plik) | ✅ |

## 10. Alert kursu i lista obserwowanych

| działanie | słowa | polecenie | poziom | status |
|---|---|---|---|---|
| ustaw alert | „powiadom mnie, gdy BTC spadnie o 3%” | `market_watch` | A2 | ✅ |
| lista / usuń / wyczyść | „jakie mam alerty”, „usuń alert na BTC” | `market_alerts` | A3 / A2 | ✅ |
| obserwowane (dodaj/usuń) | „dodaj dogecoina do obserwowanych” | `market_watchlist` | A2 | ✅ |

## 11. Powiadomienie

| działanie | mysz | klawiatura | słowa | polecenie | status |
|---|---|---|---|---|---|
| otwórz centrum | dzwonek | `Alt N` | „pokaż powiadomienia” | `notifications_open` | ✅ |
| przejdź do źródła | klik w powiadomienie | `Enter` 🆕 | — | (UI) → okno aplikacji | ✅ |
| odłóż (zadanie) | ✅ „+15 min” | — | „odłóż o kwadrans” | `tasks_update` | ✅ |
| wyczyść | „Wyczyść” | — | 🆕 „wyczyść powiadomienia” | (UI) | ✅ |
| kanały i limity | ✅ Ustawienia → Powiadomienia | — | „wyłącz powiadomienia z rynku” | `notif_channel` | ✅ |

## 12. Rozmowa (czat)

| działanie | mysz | klawiatura | słowa | polecenie | status |
|---|---|---|---|---|---|
| wyślij | pole + ➤, podpowiedzi pod polem | `Enter`; 🆕 `Shift Enter` = nowa linia (pole wielowierszowe, W2) | — | `J.brain.handle` | ✅ |
| przerwij | ■ Stop | `Esc` | „stop” | `plan_control stop` 🆕 / `J.brain.abort` | ✅ |
| pokaż/ukryj panel | ikona czatu | `Alt 1` | „pokaż czat” | `open_app chat` | ✅ |
| przypnij odpowiedź | „Przypnij wynik” | — | „przypnij to” | `create_widget result` | ✅ |
| szukaj | ✅ lupa w panelu | ✅ `Ctrl F` w panelu | „co mówiłeś o banku” | `chat_search` | ✅ |
| wątki | ✅ lista wątków w nagłówku | — | „nowy wątek o wakacjach” | `chat_thread` | ✅ |
| edytuj ostatnią wiadomość / ponów | 🆕 „✎” i „↻” przy mojej ostatniej wiadomości | ✅ `↑` w pustym polu wstawia ostatnią wiadomość | „powtórz odpowiedź” | (UI) | 🟡 / 🆕 W2 |
| eksport / wyczyść | ✅ „Nowa rozmowa” (⟳) w nagłówku panelu; ✅ menu panelu z eksportem | — | „eksportuj czat”, „wyczyść czat” | `chat_export` / `chat_clear` | 🟡 / ✅ |

## 13. Ustawienie

| działanie | mysz | słowa | polecenie | poziom | status |
|---|---|---|---|---|---|
| otwórz sekcję | Ustawienia | „otwórz ustawienia głosu” | `settings_open` | A3 | ✅ |
| odczytaj | — | „jakie mam miasto w ustawieniach” | `settings_get` (bez kluczy) | A3 | ✅ |
| zmień | pola w Ustawieniach | „ustaw miasto na Kraków” | `settings_set` | A1 zwykłe / A0 ze skutkami (proaktywność, nasłuch) | ✅ |
| przywróć sekcję | ✅ „Przywróć domyślne” przy sekcji | „przywróć domyślny wygląd” | `settings_reset` | A0 | ✅ |
| skróty klawiszowe | ✅ Ustawienia → Skróty | „paleta pod Alt P” | `keys_set` | A2 | ✅ |

## 14. Rutyna

| działanie | mysz | słowa | polecenie | poziom | status |
|---|---|---|---|---|---|
| utwórz | ✅ Ustawienia → Agent → Rutyny → „Nowa” | „zrób rutynę poranek: pogoda, zadania, układ praca” | `routine_create` | A1 | ✅ |
| uruchom | ✅ ▶ przy rutynie | „uruchom poranek” | `routine_run` | A1 | ✅ |
| lista / usuń | ✅ lista | „jakie mam rutyny”, „usuń rutynę poranek” | `routine_list` / `routine_remove` | A3 / A0 | ✅ |
| wbudowane (briefing, podsumowanie dnia) | Ustawienia → Agent (godzina) | — | (context.js) | — | ✅ |

## 15. Wygląd pulpitu

| działanie | mysz | słowa | polecenie | poziom | status |
|---|---|---|---|---|---|
| kolor | kafelki kolorów | „motyw fioletowy” | `set_theme` | A3 (ma cofanie) | ✅ |
| tapeta | kafelki tapet, menu pulpitu | „tapeta aurora” | `set_wallpaper` | A3 (cofanie) | ✅ |
| dźwięki | przełącznik | „wycisz dźwięki” | `sound_toggle` | A3 (cofanie) | ✅ |
| tryb skupienia | przełącznik | „tryb skupienia” | `focus_mode` | A3 | ✅ |
| skala | ✅ suwak | „powiększ interfejs” | `ui_scale` | A2 | ✅ |
| efekty | ✅ suwak | „mniej efektów” | `fx_level` | A2 | ✅ |
| tryb przestrzeni | ✅ przełącznik w topbarze | „tryb prezentacji” | `ui_mode` | A3 | ✅ |
