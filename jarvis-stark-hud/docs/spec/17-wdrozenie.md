# 17 · Wdrożenie — fale W1–W5

Każda fala to osobny PR (albo kilka mniejszych), z testami i definicją „gotowe” z [16-testy.md](16-testy.md) §2. Liczba nowych poleceń na falę: [katalog-nowych-polecen.md](katalog-nowych-polecen.md). Kolejność wynika z D-02.

Szacunki czasu to dni pracy jednej osoby (orientacyjnie, do weryfikacji po W1).

---

## W1 — Fundament: jedna droga przez rejestr, okna, nawigacja (≈ 5–7 dni)

Dlaczego pierwsza: bez tego nowe funkcje nie będą miały cofania, logu i zgód; nawigacja i okna to najczęstsze polecenia.

| # | zadanie | pliki | dotyczy |
|---|---|---|---|
| W1.1 | Przepięcie UI na rejestr: odhacz/usuń w Harmonogramie, formularz zadania, edycja/usuwanie skrótu w menu, 🗑 w Notatniku (bez `confirm()`), ✕ widgetu → polecenia ze źródłem `ui` | `js/apps.js`, `js/main.js`, `js/widgets.js` | [02](02-obiekty-akcje.md) zasada 1 |
| W1.2 | `undo`, `undo_list`, `Ctrl Z`, cofanie wielu, wykrywanie kolizji (`CONFLICT`) | `js/undo.js`, `js/commands.js`, `js/main.js` | [11](11-agent.md) §2, D-19 |
| W1.3 | Historia widoków + `nav_forward`, `Ctrl Alt ←/→`, przyciski myszy wstecz/dalej | `js/undo.js` (`J.nav`), `js/main.js` | [03](03-nawigacja.md) §4 |
| W1.4 | `app_view` + `onArg/state` dla: timer, market, weather, terminal, calc, library, monitor | `js/apps.js`, `js/commands.js` | [03](03-nawigacja.md) §3 |
| W1.5 | Okna: `wm_move` rozszerzenie (kierunek, ilość, rozmiar, widgety), 8 uchwytów, min/max per aplikacja, `wm_pin`, `wm_reopen` + stos zamkniętych, `wm_restore`, `wm_close_others`, menu okna, skróty klawiszowe okien | `js/core.js` (`J.wm`), `js/commands.js`, `css/jarvis.css`, `js/main.js` | [04](04-okna.md) §2–7, §9 |
| W1.6 | `close_app`: poziom wg argumentu (jedno okno A3 + „Cofnij”, wszystkie A0); cofanie kafelków/przyciągania | `js/commands.js`, `js/jev-policy.js` | D-03, [04](04-okna.md) §2 |
| W1.7 | Odmiana nazw aplikacji w komunikatach (`APP_GENDER`), przycięcie zdania do 500 znaków dla parsera i Jeva, `Esc` w polu tekstowym | `js/commands.js`, `js/judge.js`, `js/main.js` | [13](13-bledy.md) |
| W1.8 | Zdania z `corpus-nowe.js` dla W1 → `corpus.js`, testy jednostkowe i e2e z [16](16-testy.md) §3 | `tests/` | [16](16-testy.md) |

**Gotowe, gdy:** wszystkie polecenia W1 w rejestrze, każdy przycisk w Harmonogramie/Notatniku/menu skrótu zostawia wpis w Process Log i daje się cofnąć, testy zielone.

## W2 — Znajdowanie i ustawienia (≈ 6–8 dni)

| # | zadanie | pliki | dotyczy |
|---|---|---|---|
| W2.1 | `search_all` + nowa paleta (grupy, prefiksy, ostatnie, przypięte), indeks w pamięci | `js/main.js` (paleta), nowy `js/search.js`, `js/commands.js` | [03](03-nawigacja.md) §6–7 |
| W2.2 | Adresy `#go=…`, „Kopiuj link do widoku” | `js/core.js` (hash), `js/main.js` | [03](03-nawigacja.md) §5 |
| W2.3 | Tryby `ui_mode` (work/clean/focus/present) | `js/main.js`, `css/jarvis.css`, `js/commands.js` | D-01, [03](03-nawigacja.md) §8, [09](09-wyglad-stany.md) §11 |
| W2.4 | Okno Ustawień z menu sekcji i wyszukiwaniem; nowe sekcje: Powiadomienia (`notif_channel`), Skróty (`keys_set`), Układy (edytor, `layout_*`), O programie (testy diagnostyczne); `settings_reset`; cofanie zmian ustawień | `js/apps.js`, `js/commands.js`, `js/core.js` | [10](10-ustawienia.md) |
| W2.5 | Czat: wątki, szukanie, eksport, wyczyść z „Cofnij”, pole wielowierszowe, edycja/ponowienie | `js/ai.js`, `js/apps.js` (czat), `js/store.js` | [08](08-aplikacje.md) §1 |
| W2.6 | Powiadomienia z przyciskami akcji, grupowanie | `js/main.js` (`J.notifs`), `js/context.js` | [08](08-aplikacje.md) §12 |
| W2.7 | Wspólne stany `J.ui.state`, tokeny odstępów/z-index, skala `ui_scale`, obsługa klawiaturą (dok, pasek, pułapka fokusa), cele dotyku ≥ 40 px, tryb telefonu | `css/jarvis.css`, `js/main.js`, `js/core.js` | [09](09-wyglad-stany.md), D-15 |
| W2.8 | Druga karta przeglądarki (BroadcastChannel), kody `OFFLINE`/`RATE_LIMITED`, jedno ponowienie Hermesa | `js/core.js`, `js/ai.js` | D-14, [13](13-bledy.md) |
| W2.9 | Eksport/import v2 (IndexedDB, podgląd, scalanie), „Co jest zapisane” | `js/apps.js`, `js/store.js` | [10](10-ustawienia.md) §5 |

## W3 — Dane: notatki, zadania, aplikacje (≈ 8–10 dni)

| # | zadanie | pliki | dotyczy |
|---|---|---|---|
| W3.1 | Notatki: migracja modelu, tagi, foldery, przypinanie, kosz, wersje (IndexedDB), duplikat, notatka → zadanie, eksport .md, podgląd Markdown, zaznaczanie wielu, render wirtualny | `js/apps.js`, `js/commands.js`, `js/store.js` | [06](06-notatki.md), D-05, D-13 |
| W3.2 | Zadania: migracja, powtarzanie, priorytety, podzadania, `remind`, przenoszenie wielu, usuwanie zrobionych, widok tygodnia i zaległych, przeciąganie, eksport ICS, import RRULE | `js/apps.js`, `js/context.js`, `js/commands.js`, `js/registry.js` (NLP powtarzania) | [07](07-zadania.md) |
| W3.3 | Minutniki: kilka naraz, pomodoro, `timer_list` | `js/apps.js`, `js/commands.js` | [08](08-aplikacje.md) §7 |
| W3.4 | Rynek: lista obserwowanych, alerty, widok waluty, flaga źródła, `spark` w danych | `js/apps.js` (`J.market`), `js/commands.js` | [08](08-aplikacje.md) §2 |
| W3.5 | Pogoda: godzinowo, jednostki, ulubione, ostatnie dane offline | `js/apps.js` (`J.weather`) | [08](08-aplikacje.md) §3 |
| W3.6 | Aplikacja Pliki (+ tryb bez FSA), `files_open` | nowy `J.apps.files` w `js/apps.js`, `js/commands.js` | [08](08-aplikacje.md) §10 |
| W3.7 | Pamięć: `memory_edit`, zakresy, TTL, karta „Co o mnie wiesz” | `js/context.js`, `js/apps.js` | [08](08-aplikacje.md) §11 |
| W3.8 | Biblioteka: edycja skrótów w oknie, `dock_order`, ikony | `js/apps.js`, `js/main.js` | [08](08-aplikacje.md) §8 |
| W3.9 | Widgety z szablonu: `widget_items`, `widget_duplicate`, `widget_collapse`, nazwa przez `F2` | `js/widgets.js`, `js/commands.js` | [05](05-widgety.md) §2 |
| W3.10 | Monitor: sekcja Jarvis i koszt; Kalkulator: historia; Terminal: podpowiedzi | `js/apps.js` | [08](08-aplikacje.md) §4–6 |

## W4 — Widgety z opisu, wykresy, rutyny, plany (≈ 8–10 dni)

| # | zadanie | pliki | dotyczy |
|---|---|---|---|
| W4.1 | Walidator (`tools/schema-lite.js` → walidacja w `js/widget-spec.js`), render bloków bez `innerHTML`, wiązanie `$src.path`, formaty | nowy `js/widget-spec.js`, `js/widgets.js` | [05](05-widgety.md) §3 |
| W4.2 | Źródła danych: tylko A3, wspólna pamięć podręczna, odświeżanie z pauzą, stany building/live/stale/error | `js/widget-spec.js` | [05](05-widgety.md) §3.4, §3.8 |
| W4.3 | `widget_build` / `widget_edit` / `widget_refresh` dla Hermesa (+ jedna poprawka po błędzie walidacji), opis narzędzia z listą bloków | `js/commands.js`, `js/ai.js` (prompt) | D-11, D-12 |
| W4.4 | `J.chart` (line/area/bar), `chart_show` | nowy `js/chart.js` | [09](09-wyglad-stany.md) §6 |
| W4.5 | Rutyny: model, wyzwalacze, edytor, `routine_*`, bezpieczeństwo kroków | `js/context.js` (rutyny), `js/apps.js`, `js/commands.js` | [11](11-agent.md) §4 |
| W4.6 | Sterowanie planem (`plan_control`), cofanie wszystkiego z zadania, weryfikacja z jedną poprawką | `js/ai.js`, `js/process.js` | [11](11-agent.md) §3, §7 |
| W4.7 | Proaktywność: propozycje zamiast działań (tabela [11](11-agent.md) §6) | `js/context.js` | [11](11-agent.md) §6 |

## W5 — Wykończenie (≈ 3–5 dni)

| # | zadanie | pliki | dotyczy |
|---|---|---|---|
| W5.1 | `fx_level`, samoczynne obniżanie przy niskim FPS, tryb `cinema` (duch okna, pakiety) | `css/jarvis.css`, `js/hud.js`, `js/main.js` | D-08, [09](09-wyglad-stany.md) §7 |
| W5.2 | Dźwięki: głośność, kanały, cisza nocna | `js/core.js` (`J.sfx`) | [09](09-wyglad-stany.md) §8 |
| W5.3 | Przyciąganie okna do okna, minimapa (opcjonalnie), porównanie zadań w Process Log | `js/core.js`, `js/process.js` | [04](04-okna.md) §5 |
| W5.4 | Załączniki tekstowe w czacie (notatka, plik) | `js/ai.js` | [08](08-aplikacje.md) §1 |

---

## Flagi funkcji

Nowe funkcje każdej fali są za flagą `J.state.settings.flags.<nazwa>` (domyślnie **włączone po scaleniu fali**, wyłączalne w Ustawieniach → O programie → Eksperymenty). Pozwala to szybko wyłączyć funkcję, która psuje się u użytkownika, bez cofania wersji. Flaga znika w następnej fali (kod bez rozgałęzień). Nazwy: `w1_ui_registry`, `w1_windows`, `w2_search`, `w2_modes`, `w2_threads`, `w3_notes`, `w3_tasks`, `w3_files`, `w4_widget_spec`, `w4_routines`, `w5_fx`.

## Zależności między falami

```
W1 (rejestr dla UI, cofanie, okna, widoki)
 ├─→ W2 (paleta korzysta z app_view; ustawienia z cofaniem; tryby z wm_restore)
 │    └─→ W3 (kosz i wersje używają stanów z W2.7; eksport v2 obejmuje nowe dane)
 │         └─→ W4 (widgety z opisu czytają dane z W3: spark, hours, timer_list)
 └─────────────→ W5 (efekty na końcu, niczego nie blokują)
```

Równolegle, poza falami: **pomiar Jeva sondą** (wymaga klucza OpenRouter — [JEV-PLAN.md](../JEV-PLAN.md) F1) i włączenie GitHub Pages (Settings → Pages → Source: GitHub Actions).

## Po każdej fali

1. `node --test "tests/unit/*.test.js"` + `node tests/e2e/smoke.js` — zielone.
2. `node tools/gen-spec.js` — katalogi aktualne (test pilnuje).
3. Przeniesienie zdań fali z `tests/fixtures/corpus-nowe.js` do `corpus.js`; wpisy fali usunięte z `docs/spec/nowe-polecenia.js` (polecenia są już w rejestrze — pojawią się w [katalog-polecen.md](katalog-polecen.md)).
4. Statusy 🆕 → ✅ w [02](02-obiekty-akcje.md) i dokumentach obszarów.
5. Lista bezpieczeństwa z [15](15-bezpieczenstwo.md) §7 w opisie PR.
