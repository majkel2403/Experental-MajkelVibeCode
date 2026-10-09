# 06 · Notatki

Kod: `J.notes` (`js/apps.js`), aplikacja `J.apps.notes`, polecenia z grupy „Notatki”. Dane: `J.state.notes` (localStorage).

## 1. Model danych

✅ Dziś: `{ id, title, body, ts }` (ts = ostatnia zmiana), lista posortowana od najnowszej (nowe na górze).

🆕 W3 (migracja automatyczna przy starcie, stare pola zostają):

```js
{
  id, title, body, ts,            // jak dziś
  created,                        // = ts dla starych notatek
  tags: [],                       // małe litery, [a-z0-9ąćęłńóśźż_-]{1,24}, maks. 10
  folder: '',                     // jeden poziom, 0–40 znaków; '' = bez folderu
  pinned: false,
  deleted: null,                  // ts usunięcia → kosz; null = aktywna
  source: 'user'|'jarvis'|'import'  // kto utworzył (do filtrów i wersji)
}
```

Wersje trzymamy osobno w IndexedDB (D-13): klucz `notes.versions.<id>` = `[{vid, ts, title, body, by:'user'|'jarvis'|'restore'}]`.

## 2. Limity

| rzecz | limit | co się dzieje po przekroczeniu |
|---|---|---|
| tytuł | 80 znaków (✅ w `notes_update`) | przycięcie z „…” |
| treść | 100 000 znaków | ostrzeżenie w stopce, zapis dalej działa |
| liczba notatek | 2 000 aktywnych | ostrzeżenie w Ustawieniach → Dane; ⚑ bez twardej blokady |
| wersje | 20 na notatkę, zapis co ≥ 5 min pisania albo przed każdą zmianą przez Jarvisa | najstarsza wypada |
| kosz | 30 dni | automatyczne trwałe usunięcie przy starcie (log w Process Log) |

## 3. Aplikacja Notatnik — układ

```
┌──────────── lista ────────────┬──────────────── edytor ────────────────┐
│ [Szukaj…]              [+]    │ Tytuł                                   │
│ 🆕 Filtry: Wszystkie ▾ Tagi ▾ │ 🆕 #dom #zakupy   📁 Dom                 │
│ 📌 Przypięte                  │                                         │
│   Plan dnia     12:04         │ treść (zapis automatyczny po 0,4 s)     │
│ Notatki                       │                                         │
│   Zakupy        wczoraj       │                                         │
│ 🆕 Foldery ›                  │                                         │
│ 🆕 🗑 Kosz (3)                 │ 26 słów · Zapisano   🆕 Historia  Czytaj  .txt 🆕 .md  🗑 │
└───────────────────────────────┴─────────────────────────────────────────┘
```

- ✅ Lista, szukanie (tytuł + treść), nowa notatka, edycja z zapisem automatycznym, licznik słów, czytanie na głos, eksport .txt, usuwanie (dziś `confirm()` przeglądarki).
- 🆕 W3: przypięte na górze, filtry (folder, tag, „utworzone przez Jarvisa”), kosz, historia wersji, eksport .md, podgląd Markdown (przełącznik „Pisz / Podgląd”), zaznaczanie wielu (`Ctrl`/`Shift`+klik) z paskiem: Tag · Folder · Przypnij · Eksportuj · Usuń.
- 🆕 Zamiana `confirm()` na chip pytania Jarvisa (spójny wygląd, głos, klawiatura) i przepięcie przycisku 🗑 na polecenie `notes_delete` ze źródłem `ui` (kosz + „Cofnij”).

## 4. Czynności

Pełna tabela z poziomami i cofaniem: [02-obiekty-akcje.md](02-obiekty-akcje.md) §3. Szczegóły zachowania:

| czynność | szczegóły |
|---|---|
| tworzenie | tytuł z pierwszej linii, jeśli brak (✅ `create_note` tak robi); „zanotuj …” bez tytułu → pierwsze 5 słów |
| dopisywanie | nowa linia na końcu; jeśli notatka to lista (`•`, `-`) — dopisek też jako punkt |
| zmiana przez Jarvisa | przed zmianą: wersja `by:'jarvis'`; po — chip „Cofnij” + w stopce „Zmienione przez Jarvisa · Historia” |
| usuwanie | → kosz (`deleted = ts`); w liście znika; „Cofnij” 8 s, potem przywracanie z kosza |
| przywracanie | z kosza wraca na swoje miejsce (po `ts`), bez zmiany treści |
| opróżnianie kosza | A0; „Opróżnić kosz (3 notatki)? Tego nie da się cofnąć.” |
| duplikat | tytuł + „ (kopia)”, te same tagi i folder, nowa data |
| tagi | wpisywanie `#tag` w treści **nie** tworzy tagu automatycznie (⚑ — unikamy niespodzianek); tagi tylko przez pole tagów i polecenie |
| foldery | tworzone przy pierwszym użyciu, znikają, gdy puste; zmiana nazwy folderu = zmiana w wszystkich notatkach (A1, jedno „Cofnij”) |
| wersje | lista z datą i autorem, podgląd różnic (dodane na zielono, usunięte przekreślone — porównanie linii), „Przywróć” |
| notatka → zadanie | z całej notatki (treść = tytuł) albo z zaznaczonej linii; zadanie ma pole `note: <id>` i w Harmonogramie ikonę „📝” otwierającą notatkę |
| eksport | .txt (✅), .md (✅: `# tytuł`, tagi jako `tags:` w nagłówku), do folderu roboczego `files_export_note` (✅, nigdy nie nadpisuje) |

## 5. Wskazywanie notatki (dla poleceń)

Kolejność (✅ `findNote` w `js/commands.js`, rozszerzyć o nowe pola):
1. dokładne `id`,
2. `"current"` / „ta”, „tu” = notatka otwarta w aktywnym Notatniku,
3. dokładny tytuł (bez polskich znaków i wielkości liter),
4. tytuł zawiera fragment,
5. 🆕 tag (`#dom`) — wtedy zwraca listę,
6. treść zawiera fragment,
7. kilka pasuje → `AMBIGUOUS` → chipy (✅) albo `judge.pick` na poziomie P2 (✅).

Notatki w koszu są pomijane, chyba że polecenie to `notes_restore`.

## 6. Prywatność

Treść notatek **nigdy** nie idzie do Jeva (tylko tytuły na P2). Do Hermesa idzie tylko wtedy, gdy model sam wywoła `notes_read`/`notes_search` — i wtedy z ostrzeżeniem „treść z zewnątrz” + heurystyką wstrzyknięć (✅ D10). Tryb `present` ukrywa listę notatek (pokazuje „Notatki ukryte w trybie prezentacji”).

## 7. Zdarzenia

`J.emit('notes', id?)` po każdej zmianie (✅). 🆕 `notes.trashed`, `notes.restored`, `notes.version` — na szynie `J.ev` (do Process Log i kart HUD).

## 8. Kryteria akceptacji (W3)

- Migracja: stare notatki bez nowych pól działają; eksport/import zachowuje nowe pola.
- Usunięcie → kosz → przywrócenie → identyczna treść i miejsce.
- Zmiana przez Jarvisa zawsze tworzy wersję; „Przywróć” wraca do niej, a bieżąca staje się kolejną wersją.
- 2 000 notatek: lista i szukanie płynne (render wirtualny listy powyżej 300 pozycji).
- `confirm()` przeglądarki nie występuje nigdzie w aplikacji.

<!-- polecenia:start (generuje tools/gen-spec.js) -->

## Planowane polecenia tej części

Wszystkie zaplanowane polecenia tej części są już w rejestrze — zobacz [katalog-polecen.md](katalog-polecen.md).

<!-- polecenia:end -->
