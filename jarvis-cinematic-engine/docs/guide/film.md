# Film — moduł scenariuszy

Film to widok pracy jak scena z filmu na cały ekran: Orb Jarvisa, konstelacja kroków, hologram z wynikiem, lektor, napisy końcowe
(szczegóły wyglądu i sterowania: [workflow.md](workflow.md#film-tryb-kinowy-workflow-i-film-dnia)). Ten moduł decyduje, **kiedy** i **z czego**
film powstaje — nie tylko dla workflow.

## Scenariusze

| Scenariusz | Skąd | Domyślnie | Film od |
|---|---|---|---|
| **Workflow** | przebiegi z silnika workflow („zrób projekt z pomysłu …”) | zaproponuj w czacie | zawsze |
| **Zadania Hermesa** | Telegram, konsola i inne kanały Hermesa | **włącz sam** | 3 narzędzi albo 8 s |
| **Zadania z harmonogramu** | automatyczne zadania Hermesa o stałych porach (cron) | **włącz sam** | 3 narzędzi albo 8 s |
| **Dłuższe polecenia z czatu** | polecenia wpisane albo powiedziane na pulpicie | **włącz sam** | 4 narzędzi albo 12 s |
| **Film dnia** | wieczorne podsumowanie dnia (po 20:00, od 3 scen) | zaproponuj w czacie | — |

Każdy scenariusz ma trzy tryby: **wyłączone** · **zaproponuj w czacie** (karta „🎬 Oglądać na żywo?”) · **włącz sam na żywo**
(film Dnia: tylko pierwsze dwa). Ustawia się je w **Ustawienia → Wygląd → Film · moduł scenariuszy**; tam też jest wyłącznik całego modułu
(„Film włączony”). Ręczne „pokaż film” działa zawsze, także przy wyłączonym module.

„Dłuższe” znaczy: dość narzędzi (ale nie pędzących w ułamku sekundy) albo praca trwa dość długo (przy co najmniej 2 narzędziach).
Krótkie polecenia — „która godzina”, „otwórz notatnik” — nigdy nie dostają filmu.

## Kiedy „sam” jednak tylko proponuje

Film nie zasłoni ekranu, gdy: piszesz coś w polu czatu, czeka prośba o zgodę, jest tryb prezentacji albo skupienia, trwa cisza nocna
(Ustawienia → Agent), efekty ustawione są na „bez animacji”, karta jest w tle, trwa już inny film albo poprzedni zamknięto mniej niż
45 sekund temu. Wtedy pojawia się tylko karta z propozycją. Jeśli w trakcie filmu przyjdzie prośba o zgodę, film sam się zamyka (zasłaniałby
okno zgody) i nie wraca w tym zadaniu. Esc zamyka film zawsze.

## Jak wygląda film z zadania

Narzędzia to szybki montaż (pasek z podpisem), nieudane narzędzie — czerwony węzeł bez „Awarii” (Hermes zwykle próbuje dalej),
odpowiedź — scena z hologramem, na końcu „Misja zakończona” i krótkie napisy. Powtórzone narzędzia zwijają się do „×N”, a przy ponad
14 scenach nadmiar do jednej sceny zbiorczej. Na żywo kroki dochodzą w trakcie pracy.

## Powtórka

- „**pokaż film z zadania**” / „film z ostatniego zadania” (polecenie `task_film`) — zadanie oglądane w Process Logu albo najnowsze;
- przycisk **🎬** w nagłówku Process Logu — dla zadania w panelu; dla trwającego — film na żywo;
- po dłuższym zadaniu, którego film nie był oglądany, Jarvis proponuje „film gotowy”.

## Dla programisty: nowy scenariusz

```js
J.workflows.cinema.registerScenario({
  id: 'jev', label: 'Agent WWW Jeva', name: 'Zadanie Jeva',     // name = tytuł filmu
  fallback: 'auto', order: 12,                                   // tryb domyślny, miejsce na liście
  th: { steps: 2, ms: 4000 },                                    // próg „dłuższego” zadania
  hint: 'Przeglądarka sterowana przez Jeva.',
  match: title => /^Jev:\s/.test(title)                          // po tytule zadania w Process Logu
});
```

Wiersz w Ustawieniach, tryb (`C.mode(id)`), zapis (`filmScen`) i klasyfikacja zadań powstają same. Zadania trafiają do modułu
przez `J.proc.observe(fn)` (zdarzenia `start` · `step` · `stepEnd` · `end`). Decyzja i uzasadnienie: [ADR 0009](../adr/0009-film-jako-modul-scenariuszy.md).
Kod: `js/film-scenarios.js` (moduł), `js/workflow-cinema.js` (silnik, `openSource`), testy: `tests/unit/film-scenarios.test.js`.
