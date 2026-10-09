# 04 · Okna — menedżer okien

Kod: `J.wm` w `js/core.js` (≈ 200 linii), układy `J.layouts`, polecenia w grupie „Aplikacje i okna” ([katalog](katalog-polecen.md)).

## 1. Model okna

Stan w pamięci (`open[id]`): element DOM, funkcje sprzątające, `minimized`, `ctx` aplikacji. Stan trwały: `J.state.winPos[id] = {x, y, w, h}` (bez maksymalizacji i bez telefonu).

🆕 W1 — rozszerzamy stan trwały do:

```js
winPos[id] = { x, y, w, h, max: false, pin: false, collapsed: false, view: {view, target} }
ui.closedStack = [{ id, pos, view, ts }]   // maks. 10, dla wm_reopen
ui.openAtExit = ['notes', 'w:abc', ...]      // sesja: co było otwarte (przywracane, jeśli layout_startup = 'last')
```

## 2. Cykl życia

| etap | co się dzieje | zdarzenie | stan |
|---|---|---|---|
| otwarcie | `J.wm.open(id, arg)`: jeśli otwarte → przywróć + fokus + `onArg(arg)`; jeśli nie → utwórz, `place()`, `mount()`, fokus, dźwięk | `wm` | ✅ |
| pozycja startowa | zapamiętana, inaczej środek z kaskadą (±34 px × 6 kroków); przycięta do pulpitu | — | ✅ |
| fokus | klik w okno / `wm_focus` / `Alt W`; z-index +1; klasa `focused` | `wm` | ✅ |
| minimalizacja | animacja 290 ms, klasa `hidden`; okno żyje dalej (np. minutnik liczy) | `wm` | ✅ |
| maksymalizacja | klasa `max` (pełny pulpit bez doku); dwuklik nagłówka przełącza | `wm-resize` | ✅ |
| zamknięcie | zapis pozycji, sprzątanie (`onClose`), animacja 220 ms, usunięcie | `wm` | ✅ |
| błąd aplikacji | `mount()` rzuca → w oknie komunikat „Błąd aplikacji: …” | — | ✅ |

🆕 W1:
- **Zamknięcie → stos „zamknięte”** (`ui.closedStack`) z pozycją i widokiem → `wm_reopen`, `Ctrl Shift T`.
- **Niezapisane zmiany**: aplikacja może zwrócić `ctx.dirty() === true` (Notatnik w trakcie debounce, Terminal z wpisanym poleceniem, formularz skrótu). Wtedy zamknięcie przez użytkownika pyta „Zamknąć bez zapisania?”; zamknięcie przez agenta najpierw zapisuje (Notatnik) albo pyta.
- **Zamknięcie przez agenta** jednego okna → A3 z „Cofnij” (= `wm_reopen`). Dziś `close_app` ma ryzyko `confirm` dla każdego okna — zmieniamy: `risk` zależny od argumentu (jak `settings_set`): `app='all'` → A0, reszta → A3. (D-03)

## 3. Przesuwanie

✅ Przeciągnięcie za nagłówek; okno może wyjść poza lewą/prawą krawędź, ale zostaje ≥ 120 px widoczne; góra ≥ 0, dół ≤ pulpit − 60 px. Przeciągnięcie zmaksymalizowanego okna je przywraca (proporcja pod kursorem zachowana).

🆕 W1 — ruch słowami i klawiaturą (`wm_move` rozszerzenie):

| argument | znaczenie |
|---|---|
| `x, y` | piksele względem pulpitu (✅) |
| `direction` + `amount` | `small` = 40 px, `medium` = 120 px, `large` = 1/4 szerokości/wysokości pulpitu |
| `position` (🆕 aliasy) | „na środek” = center, „w lewy górny róg” = tl, „na dół” = bottom… → mapowane na `snap` |

Zasady: ruch zawsze przycięty do pulpitu; ruch z telefonu — ignorowany z komunikatem („Na małym ekranie okna zajmują cały ekran”).

## 4. Zmiana rozmiaru

✅ Uchwyt w prawym dolnym rogu, minimum 280 × 180 (globalnie), maksimum = pulpit.

🆕 W1:
- **Uchwyty na wszystkich krawędziach i rogach** (8 stref, 6 px, kursor `ns/ew/nwse/nesw-resize`). Lewa i górna krawędź przesuwają też pozycję.
- **Minimum i maksimum na aplikację** (pole `minW/minH/maxW/maxH` w `J.apps[id]`):

| aplikacja | min | domyślnie | uwagi |
|---|---|---|---|
| notes | 420 × 280 | 620 × 420 | lista + edytor |
| schedule | 340 × 360 | 420 × 480 | |
| market | 320 × 300 | 440 × 400 | |
| monitor | 340 × 320 | 440 × 470 | |
| weather | 320 × 300 | 440 × 400 | |
| terminal | 380 × 220 | 560 × 380 | |
| calc | 260 × 380 | 300 × 440 | ⚑ proporcje zablokowane (`aspect: 0.68`) |
| timer | 280 × 360 | 340 × 470 | |
| settings | 380 × 420 | 460 × 560 | |
| library | 380 × 320 | 470 × 440 | |
| widget note/list | 200 × 140 | 300 × 260 / 290 × 300 | |
| widget result | 240 × 160 | 340 × 260 | |
| widget z opisu | wg `size`: S 220 × 160, M 300 × 240, L 420 × 320, XL 560 × 420 | | wykres ma stałą wysokość bloku |

- **Presety słowne** (`size`): S/M/L/XL jak wyżej; `half` = pół pulpitu (lewa/prawa zależnie od położenia), `third` = 1/3 szerokości, `quarter` = ćwiartka.
- **„powiększ/zmniejsz”** bez liczby = ±20 % z zachowaniem środka.

## 5. Przyciąganie (snap) i kafelki

✅ Przeciągnięcie do krawędzi (margines 14 px) pokazuje podgląd: `left`, `right`, `top`, `tl`, `tr`, `bl`, `br`; puszczenie przyciąga. `wm_arrange` i `Alt+strzałki`: `left/right/top/bottom/center/max`. Kafelki: 1 okno = pełny, 2–4 = 2 kolumny, 5+ = 3 kolumny, odstęp 8 px, dół pulpitu − 84 px na dok.

🆕 W1:
- **Cofanie kafelków i przyciągania**: przed zmianą zapisujemy pozycje wszystkich dotkniętych okien → wpis na stos „Cofnij”.
- **„Pół na pół”**: `wm_arrange mode=split apps=[a,b]` → a lewo, b prawo.
- **Przyciąganie do innych okon** (krawędź do krawędzi, próg 10 px) — ⚑ W5 (miłe, nie konieczne).
- **Animacja** 320 ms (`snapping`), przy `fx_level=off` — natychmiast.

## 6. Warstwy (z-order) i przypinanie

✅ Fokus podnosi okno (`z` rośnie od 30). Widgety i okna są w tej samej warstwie.

🆕 W1 (`wm_pin`):
- Okno przypięte ma z-index z osobnego zakresu (10 000+), zawsze nad zwykłymi oknami, pod chipami pytań (99 990+), toastami i menu.
- Pinezka w nagłówku (wypełniona = przypięte). Maks. 3 przypięte naraz (czwarte odpina najstarsze z komunikatem).
- „Na spód” (menu okna) = z-index najniższy wśród zwykłych.

## 7. Kolizje i porządek na pulpicie

🆕 W1:
1. **Nowe okno nie zasłania czatu**: jeśli panel czatu jest otwarty, pozycja startowa zaczyna się od jego prawej krawędzi.
2. **Nowy widget** szuka wolnego miejsca w siatce 24 px od prawego górnego rogu; gdy brak — kaskada.
3. **Za dużo okien**: > 6 otwartych nieminimalizowanych → Jarvis proponuje chipem „Ułożyć w kafelki?” (raz na sesję, nie przy każdym otwarciu).
4. **Karty HUD**: okna mają wyższy z-index niż karty; karty chowają się, gdy okno je zasłania w > 50 %.
5. **Zmiana rozmiaru pulpitu** (otwarcie czatu/logu, zmiana okna przeglądarki) → `reflow()` przycina okna ✅.

## 8. Układy (layouts)

✅ Presety: `praca` (notatki + harmonogram, kafelki), `rynek` (rynek + terminal), `skupienie` (notatki na środku), `czysto` (wszystko zminimalizowane). Zapisane: `J.state.layouts[nazwa] = {apps:[{id,x,y,w,h,max}], ts}`. Zastosowanie: minimalizuje wszystko, otwiera okna z listy w pozycjach.

🆕 W2:
- **Zapis rozszerzony**: widoki (`view`), przypięcie, widgety (`w:<id>` — tylko jeśli widget istnieje).
- **Edytor układów** (Ustawienia → Układy): lista, podgląd miniatury (prostokąty w skali), zmień nazwę, usuń, „zastosuj”, „ustaw jako startowy”, eksport/import JSON.
- **Układ startowy** (`layout_startup`): `none` (⚑ domyślnie) / `last` (przywróć okna z poprzedniej sesji) / nazwa układu.
- **Cofanie zastosowania układu**: wpis na stos „Cofnij” z poprzednimi pozycjami i stanami okien.
- **Nazwy**: 1–40 znaków, bez rozróżniania wielkości liter i polskich znaków przy wyszukiwaniu; nazwa presetu zajęta (zapis pod nią → pytanie o inną nazwę).

## 9. Menu okna

🆕 W1, prawy przycisk na nagłówku albo `Alt Spacja`:
Przypnij na wierzchu · Na spód · Rozmiar › (S, M, L, pół, cały) · Przyciągnij › (lewo, prawo, góra, dół, środek) · Kopiuj link do tego widoku · Zapisz układ… · — · Zamknij pozostałe · Zamknij.

## 10. Agent a okna — zasady

| sytuacja | zasada |
|---|---|
| Jev wykonał otwarcie/przesunięcie sam | podświetlenie okna, chip „Cofnij” dla A2 |
| użytkownik przeciąga okno, a agent w tej chwili je przesuwa | wygrywa użytkownik: `wm_move` od agenta w trakcie przeciągania (pointer capture aktywny) zwraca `CONFLICT` „Okno jest właśnie przesuwane” — ✅ kod w [13-bledy.md](13-bledy.md) |
| polecenie na zamkniętym oknie (`wm_move notes`, notatnik zamknięty) | ✅ `NOT_FOUND` „Notatnik nie jest otwarte.” → 🆕 poprawić odmianę: „Notatnik nie jest otwarty.” (rodzaj z `APP_GENDER`) |
| wiele okien pasuje („zamknij to” bez fokusu) | chipy z oknami |
| układ z oknem, którego już nie ma (usunięty widget) | pomijamy okno, komunikat „Pominąłem 1 okno, którego już nie ma.” |

## 11. Telefon (≤ 640 px)

D-15: okna na cały ekran, bez przeciągania i zmiany rozmiaru; `wm_move`/`wm_arrange` zwracają `UNSUPPORTED` z wyjaśnieniem; `J.wm.focused()` = ostatnio otwarte; przełączanie przez dolny pasek i „Wróć”.

## 12. Wiele monitorów i okien przeglądarki

⚑ Nie: Jarvis działa w jednym oknie przeglądarki; okna aplikacji nie wychodzą poza nie. Przeniesienie okna przeglądarki na inny monitor działa normalnie (`reflow` dopasowuje okna do nowego rozmiaru ✅). Druga karta — D-14.

## 13. Kryteria akceptacji

- Każde okno ma min/max; zmiana rozmiaru z 8 stref działa myszą i dotykiem.
- `wm_reopen` przywraca okno w tej samej pozycji i widoku; 10 zamknięć → 10 przywróceń.
- Kafelki, przyciąganie i układ mają „Cofnij” przywracające dokładne pozycje (±1 px).
- Przypięte okno zostaje nad innymi po `Alt W` i po otwarciu nowego okna.
- Test w przeglądarce: 1280×720, 1600×900, 390×844 — brak okien poza pulpitem po `reflow`.

<!-- polecenia:start (generuje tools/gen-spec.js) -->

## Planowane polecenia tej części

Wszystkie zaplanowane polecenia tej części są już w rejestrze — zobacz [katalog-polecen.md](katalog-polecen.md).

<!-- polecenia:end -->
