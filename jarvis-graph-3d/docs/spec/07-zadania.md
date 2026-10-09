# 07 · Zadania i Harmonogram

Kod: `J.tasks` (`js/apps.js`), sprawdzanie terminów `J.tasks.check` (`js/context.js`), aplikacja `J.apps.schedule`, import `J.ics`. Dane: `J.state.tasks`.

## 1. Model danych

✅ Dziś: `{ id, date:'YYYY-MM-DD', time:'HH:MM'|'', text, done, fired }`, lista posortowana po `date+time`.

🆕 W3:

```js
{
  id, date, time, text, done, fired,          // jak dziś
  created, doneAt,                            // znaczniki czasu
  priority: 'normal',                         // high | normal | low
  repeat: null,                               // { rule:'daily'|'weekdays'|'weekly'|'monthly'|'every_n_days', days:['pn',…], n, until }
  seriesId: null,                             // wspólny dla wystąpień zadania powtarzanego
  subtasks: [],                               // [{ id, text, done }] maks. 20, jeden poziom
  note: null,                                 // id notatki, z której powstało
  remind: 0,                                  // minuty przed terminem (0 = o czasie); ⚑ domyślnie 0
  source: 'user'|'jarvis'|'ics'
}
```

## 2. Terminy i przypomnienia

✅ Dokładny licznik do najbliższego terminu + sprawdzanie po powrocie do karty; zadanie z godziną wywołuje powiadomienie, mowę i sygnał; zaległe po powrocie → „Masz zaległe: …”.

🆕 W3:
- `remind` — przypomnienie N minut przed (5, 10, 15, 30, 60); słowa: „przypomnij mi 15 minut przed”.
- Powiadomienie ma przyciski: **Zrobione** · **+15 min** · **Jutro** (`tasks_complete` / `tasks_update snooze_minutes` / `tasks_update date`).
- Zadanie bez godziny: przypomnienie w briefingu porannym (jeśli ustawiony), inaczej bez przypomnienia.
- Cisza nocna (`quietFrom`–`quietTo`): powiadomienia z tej pory idą do centrum bez dźwięku i mowy; pilne (priorytet `high`) — z dźwiękiem.

## 3. Powtarzanie (🆕 W3)

| reguła | przykład | następne wystąpienie |
|---|---|---|
| `daily` | „codziennie o 7 witaminy” | +1 dzień |
| `weekdays` | „w dni robocze o 9 poczta” | następny pn–pt |
| `weekly` + `days` | „w poniedziałki i czwartki trening” | najbliższy z listy dni |
| `monthly` | „co miesiąc 10-go czynsz” | ten sam dzień miesiąca (31 → ostatni dzień krótszego miesiąca) |
| `every_n_days` | „co 3 dni kwiaty” | +n dni |
| `until` | „…do końca roku” | brak wystąpień po dacie |

Zasada: istnieje **jedno** aktywne wystąpienie serii. Po odhaczeniu tworzy się następne (z tym samym `seriesId`). Usunięcie pyta: „Tylko to wystąpienie czy całą serię?” (chipy). Zmiana godziny pyta tak samo.

## 4. Priorytety i podzadania (🆕 W3)

- Priorytet: kropka koloru przy zadaniu (high = czerwona, low = szara); w liście dnia `high` na górze wśród zadań bez godziny; zadania z godziną zawsze po godzinie.
- Podzadania: rozwinięcie zadania (strzałka), pasek postępu `2/5`; odhaczenie wszystkich podzadań **nie** odhacza zadania automatycznie (⚑), Jarvis pyta „Odhaczyć też „Przeprowadzka”?”.

## 5. Harmonogram — widoki

| widok | co pokazuje | stan |
|---|---|---|
| Dzień | pasek 6 dni (wczoraj … +4), lista zadań dnia, formularz dodawania, import .ics | ✅ |
| 🆕 Tydzień | 7 kolumn pn–nd, zadania jako karty, przeciąganie między dniami | W3 |
| 🆕 Zaległe | niezrobione z przeszłości, pasek „Przenieś wszystkie na dziś” | W3 |
| 🆕 Bez daty | ⚑ nie wprowadzamy — każde zadanie ma datę (domyślnie dziś), prostsze przypomnienia |

Przewijanie pasków dni: 🆕 strzałki ‹ › i `←/→`, „Dziś” wraca do dzisiaj.

## 6. Czynności

Pełna tabela: [02-obiekty-akcje.md](02-obiekty-akcje.md) §4. Uwaga 🟡: dziś pole wyboru i ✕ w Harmonogramie zmieniają `J.state.tasks` bezpośrednio (bez rejestru, bez cofania i bez logu) — W1 przepina je na `tasks_complete` / `tasks_remove` ze źródłem `ui` (dla ✕: kliknięcie człowieka = zgoda, ale z „Cofnij” 10 min).

## 7. Wskazywanie zadania

✅ `findTask`: id → dokładna treść → fragment treści → kilka = `AMBIGUOUS` (chipy / `judge.pick`). 🆕 Dodatkowo: „to zadanie” = zaznaczone w Harmonogramie; „następne” = najbliższe niezrobione z godziną; „ostatnie” = ostatnio dodane; liczebnik („trzecie”) = pozycja w liście dnia.

## 8. Import i eksport kalendarza

- ✅ Import .ics: `VEVENT` z `DTSTART` i `SUMMARY`; pomija duplikaty (ta sama data i treść).
- 🆕 Import: `RRULE` (FREQ=DAILY/WEEKLY/MONTHLY, BYDAY, UNTIL, INTERVAL) → `repeat`; `DESCRIPTION` → podzadania nie (⚑), do notatki — nie; strefy czasowe `TZID` → czas lokalny.
- 🆕 Eksport (`tasks_export_ics`): zakres dziś/tydzień/miesiąc/wszystko; `UID` = `<id>@jarvis-os`; zadania bez godziny jako całodniowe (`DTSTART;VALUE=DATE`); powtarzanie → `RRULE`.
- Synchronizacja z kalendarzem Google/Outlook — **nie** (D-07/D-17); tylko plik.

## 9. Kryteria akceptacji (W3)

- Powtarzanie: 20 przypadków reguł (w tym 31 stycznia → luty, zmiana czasu letniego) w testach jednostkowych `J.nlp` / `J.tasks.next`.
- Odhaczenie zadania z serii tworzy dokładnie jedno następne wystąpienie.
- Eksport → import tego samego pliku nie tworzy duplikatów.
- Przyciski w powiadomieniu działają także wtedy, gdy okno Harmonogramu jest zamknięte.

<!-- polecenia:start (generuje tools/gen-spec.js) -->

## Planowane polecenia tej części

Wszystkie zaplanowane polecenia tej części są już w rejestrze — zobacz [katalog-polecen.md](katalog-polecen.md).

<!-- polecenia:end -->
