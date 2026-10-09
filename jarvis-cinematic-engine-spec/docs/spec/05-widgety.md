# 05 · Widgety

Widget = małe okno na pulpicie z własną treścią. Technicznie to okno `w:<id>` w menedżerze okien (`js/widgets.js`), więc działa na nim wszystko z [04-okna.md](04-okna.md): przesuwanie, rozmiar, przyciąganie, przypinanie. Zamknięcie widgetu = usunięcie (✅ tak jest dziś; 🆕 z „Cofnij” 10 min).

## 1. Dwa rodzaje

| rodzaj | skąd | przykłady | stan |
|---|---|---|---|
| **z szablonu** | `create_widget type=note|list|result` | notatka na pulpicie, lista zakupów, przypięty wynik zadania | ✅ |
| **z opisu** | `widget_build spec={…}` — opis JSON wg [widget.schema.json](widget.schema.json) | „Top 5 krypto”, „checklista na dziś”, „mini wykres BTC”, „mój dzień” | 🆕 W4 |

Szablony zostają jako szybki skrót (parser rozpozna „lista zakupy: mleko, chleb” bez modelu) i **wyjście awaryjne**: jeśli opis jest błędny, powstaje widget `result` z komunikatem, co poszło nie tak (nigdy pusty ekran).

## 2. Widgety z szablonu — szczegóły (✅)

| typ | zawartość (`data`) | edycja w widgecie | przez polecenie |
|---|---|---|---|
| `note` | `{text}` | pole tekstowe, zapis przy każdej zmianie | `widgets_update content` |
| `list` | `{items:[{text,done}]}` | pole „Nowa pozycja…”, zaznaczanie, ✕ usuń | `widgets_update add_items/check_item/uncheck_item/…`; ✅ `widget_items` |
| `result` | `{text, meta}` | tylko odczyt; „Kopiuj”, „Log” | `widgets_update content` |

Rozmiary startowe: note 300×260, list 290×300, result 340×260. Tytuł ≤ 60 znaków.

## 3. Widgety z opisu (🆕 W4)

### 3.1 Przebieg

```
„zrób widget z top 5 tokenów i zmianą 24h”
  → Jev: intencja widget_build (A2) albo parser nie trafia → Hermes
  → Hermes wybiera źródła danych z listy dozwolonych (§3.4) i składa opis JSON
  → walidacja: schemat (tools/schema-lite.js) + reguły (§3.6)
      błąd → jedna poprawka: Hermes dostaje listę błędów i poprawia (maks. 1 raz)
      dalej błąd → widget awaryjny `result` z błędami
  → budowa: pobranie danych (polecenia A3), render bloków, położenie na pulpicie
  → zapis opisu w J.state.widgets (nie wyniku!) → przeżywa odświeżenie
  → chip „Cofnij” (usuwa widget)
```

Czas docelowy: widoczny szkielet (tytuł + „budowanie…”) ≤ 300 ms od decyzji; dane ≤ 2 s.

### 3.2 Opis widgetu — pola

| pole | wymagane | wartości | znaczenie |
|---|---|---|---|
| `v` | tak | `1` | wersja formatu |
| `title` | tak | 1–60 znaków | tytuł (może zawierać wstawki `{{…}}`) |
| `icon` | nie | lista ikon | ikona w nagłówku |
| `size` | nie | S / M / L / XL | rozmiar startowy (patrz [04-okna.md](04-okna.md) §4) |
| `layout` | nie | stack / grid2 / grid3 | bloki jeden pod drugim albo w kolumnach |
| `tone` | nie | accent, blue, purple, teal, green, warn | kolor ramki |
| `sources` | nie | do 4 źródeł | skąd dane (§3.4) |
| `blocks` | tak | 1–12 bloków | co pokazać (§3.3) |

### 3.3 Bloki (tylko te)

| `kind` | pokazuje | najważniejsze pola | uwagi |
|---|---|---|---|
| `text` | zwykły tekst | `text`, `size`, `dim` | tekst zawsze jako tekst (`textContent`) |
| `markdown` | tekst z **pogrubieniem**, *kursywą*, `kodem`, listami, linkami | `text` | własny, mały konwerter; linki tylko `https:`, otwierane przez `open_url` (zgoda dla obcych adresów) |
| `kpi` | duża liczba + opis + zmiana | `label`, `value`, `delta`, `format`, `good` | `good=up` → wzrost na zielono |
| `table` | tabela | `rows` (lista z danych), `columns[{label, field, format, align}]`, `limit`, `sort`, `desc` | maks. 6 kolumn, 50 wierszy |
| `list` | lista | `items`, `field`, `meta`, `limit`, `empty` | |
| `checklist` | lista z polami wyboru | `items` albo `static`, `field`, `done`, `on_check` | zaznaczenie woła `on_check` (np. `tasks_complete`) albo zapisuje stan w widgecie (`static`) |
| `chart` | wykres | `chart` (line/area/bar/spark), `series`, `x`, `y`, `label`, `height` | rysuje `J.spark` (✅) / 🆕 `J.chart` dla słupków i osi |
| `badge` | plakietka | `text`, `tone` | |
| `progress` | pasek postępu | `label`, `value`, `max` | |
| `clock` | zegar | `format` | aktualizacja co 1 s tylko gdy widoczny |
| `countdown` | odliczanie | `until`, `label` | po czasie: „Już!” + opcjonalnie powiadomienie |
| `divider` | linia | — | |
| `buttons` | 1–4 przyciski | `label`, `command`, `args`, `style` | kliknięcie = polecenie rejestru ze źródłem `ui` (§3.6) |

### 3.4 Dane — źródła

- Źródło to **wywołanie polecenia z rejestru** o poziomie **A3** (odczyt): np. `get_crypto_prices`, `tasks_list`, `get_weather`, `notes_list`, `widgets_list`, `memory_recall`, `get_datetime`, `get_status`, `timer_list` (🆕), `layout_list` (🆕), `routine_list` (🆕). Pełna lista A3 — [katalog-polecen.md](katalog-polecen.md).
- **Nigdy** dowolny adres URL ani `fetch` z opisu. Nowe dane = nowe polecenie w rejestrze (z testami).
- Argumenty źródła przechodzą przez `J.registry.coerce` (te same zasady co dla modelu).
- **Odświeżanie**: `refresh` w sekundach (0 = tylko przy budowie; minimum 15 s, domyślnie 0), `event` — przelicz, gdy przyjdzie zdarzenie UI (`tasks`, `market`, …). Odświeżanie wstrzymane, gdy widget jest zminimalizowany, zwinięty albo karta przeglądarki jest ukryta.
- **Limity**: łącznie maks. 20 źródeł z `refresh > 0` na pulpicie; ten sam `command+args` w kilku widgetach = jedno wywołanie (wspólna pamięć podręczna na czas `refresh`).
- 🆕 Wymagane zmiany w poleceniach, żeby przykłady miały dane: `get_crypto_prices` zwraca też `spark` (ostatnie 24 punkty) dla każdej waluty; `tasks_list` zwraca `done` jako liczbę i `total`; `get_weather` — godzinowo `hours[]` (temperatura na 12 h).

### 3.5 Wiązanie danych

- Wartość zaczynająca się od `$` to **odnośnik**: `$<źródło>.<ścieżka>`, np. `$ceny.prices`, `$ceny.prices[0].usd`, `$zad.tasks`.
- W tekstach wstawki `{{$pog.city}}` (tylko odnośniki, bez wyrażeń i funkcji).
- Ścieżka: kropki i `[liczba]`. Brak wartości → `—`.
- Formaty (`format`): `number` (separator tysięcy PL), `money` (USD jak `J.fmtMoney`), `percent`, `delta` (▲/▼ z kolorem), `time` (HH:MM), `text`.

### 3.6 Bezpieczeństwo (twarde zasady)

1. Żadnego HTML ani JavaScriptu z opisu. Render tylko przez `document.createElement` + `textContent`. Markdown przez własny konwerter na elementy (bez `innerHTML`).
2. Pola spoza schematu → błąd (nie „ignorujemy po cichu”).
3. Źródło musi być poleceniem A3; przycisk i `on_check` — dowolnym poleceniem rejestru, ale **wykonanie idzie przez rejestr z normalnymi zgodami** (źródło `ui`, bo kliknął człowiek). Przycisk z poleceniem A0 zawsze pokazuje pytanie o zgodę — także przy kliknięciu, bo opis mógł przyjść od modelu (⚑ `forceConfirm` dla przycisków z widgetów z opisu, których autorem był model).
4. Dane z poleceń oznaczonych `external` (notatki, pliki, schowek) w widgecie są traktowane jako obce: przed pokazaniem przechodzą heurystykę wstrzyknięć ([15-bezpieczenstwo.md](15-bezpieczenstwo.md)); wynik z flagą → plakietka „⚠ podejrzana treść”.
5. Rozmiar opisu ≤ 16 KB; ≤ 12 bloków; ≤ 30 widgetów z opisu na pulpicie.
6. Opis zapisany lokalnie; eksport danych zawiera opisy (bez wyników).

### 3.7 Zmiana widgetu zdaniem (`widget_edit`)

- „zmień ten widget na wykres” → Hermes dostaje obecny opis + zdanie → zwraca **łatkę** (JSON Merge Patch) albo nowy opis → walidacja → zastosowanie → „Cofnij” przywraca poprzedni opis.
- Proste zmiany bez modelu (parser): tytuł („zmień tytuł na …”), odświeżanie („odświeżaj co minutę”), rozmiar („zrób go większym” → `wm_move size`).
- Wskazanie widgetu: „ten” = aktywny, tytuł, „ostatni”.

### 3.8 Stany widgetu z opisu

| stan | wygląd | kiedy |
|---|---|---|
| `building` | szkielet (szare paski) + „Buduję…” | od decyzji do pierwszych danych |
| `live` | dane; w stopce „odświeżono 12:04” | po udanym pobraniu |
| `stale` | dane przygaszone + „nieaktualne (brak sieci)” | odświeżenie nie udało się; stare dane zostają |
| `error` | komunikat + „Spróbuj ponownie” | pierwsze pobranie nie udało się albo błąd opisu |
| `offline` | jak `stale` + ikona chmury | przeglądarka offline |

### 3.9 Przykłady

Pięć pełnych przykładów (zdanie → opis) w [widget-przyklady.json](widget-przyklady.json); każdy jest sprawdzany testem (zgodność ze schematem, poprawne źródła i argumenty).

## 4. Działania na widgetach

Pełna tabela: [02-obiekty-akcje.md](02-obiekty-akcje.md) §2. Nowe polecenia: `widget_build`, `widget_edit`, `widget_refresh`, `widget_duplicate`, `widget_collapse`, `widget_items` ([katalog](katalog-nowych-polecen.md)); rozszerzenia `wm_move` i `wm_pin` o identyfikatory `w:<id>`.

## 5. Zapis i odtwarzanie

✅ `J.state.widgets = [{id, type, title, data}]`, pozycje w `winPos['w:<id>']`, `J.widgets.restore()` po starcie.
🆕 dla widgetów z opisu: `{id, type:'spec', title, spec, prompt, created, updated, collapsed}`; dane z ostatniego pobrania w pamięci podręcznej IndexedDB `widgets.cache` (żeby po odświeżeniu strony od razu coś było widać, ze znacznikiem „stale” do pierwszego odświeżenia).

## 6. Kryteria akceptacji (W4)

1. 5 zdań z [widget-przyklady.json](widget-przyklady.json) daje poprawne widgety (na atrapie Hermesa zwracającej te opisy + test w przeglądarce).
2. Opis z blokiem spoza listy albo polem `onclick`/`html` jest odrzucany; nic nie trafia do DOM jako HTML (test: `<img onerror>` w tekście pokazuje się jako tekst).
3. Widget przeżywa odświeżenie strony (opis + pozycja + zwinięcie).
4. Odświeżanie zatrzymuje się dla ukrytej karty i zminimalizowanego widgetu (licznik wywołań w teście).
5. Przycisk z poleceniem A0 zawsze pyta o zgodę.
6. „Cofnij” po `widget_build` i `widget_edit` przywraca stan sprzed.

<!-- polecenia:start (generuje tools/gen-spec.js) -->

## Planowane polecenia tej części

Wszystkie zaplanowane polecenia tej części są już w rejestrze — zobacz [katalog-polecen.md](katalog-polecen.md).

<!-- polecenia:end -->
