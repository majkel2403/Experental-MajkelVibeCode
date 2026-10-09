# Workflow — powtarzalne procesy pracy

Workflow to proces z góry rozpisany na kroki. Hermes myśli wewnątrz kroków, a silnik w moście pilnuje kolejności, sprawdza
każdy krok, ponawia go ze zmianą podejścia, liczy budżet i zapisuje stan (szczegóły: [ADR 0007](../adr/0007-silnik-workflow-w-moscie.md)).

## Jak uruchomić

- **Pulpit / głos:** „zrób projekt z pomysłu aplikacja do nawyków”, „od pomysłu do projektu: bot do przypomnień”,
  „uruchom workflow …”, „status workflow”, „stop wszystko”, „pokaż film”.
- **Telegram:** to samo zdanie do Hermesa — uruchamia `workflow_run` (działa także bez otwartej karty).

Postęp widać na żywo: karta przebiegu w czacie (✓ zrobione · ⟳ trwa · ⏸ czeka na Ciebie · ✗ błąd · ⤼ pominięte), film na cały ekran,
Orb i Process Log.

## Film (tryb kinowy workflow) i Film dnia

> Film działa nie tylko dla workflow — także dla zadań Hermesa (Telegram, harmonogram) i poleceń z czatu: [film.md](film.md) (moduł scenariuszy, ustawienia).

Przycisk w karcie czatu albo zdanie „pokaż film”, „pokaż film z workflow”, „workflow jak film”
(polecenie `workflow_film`; samo „tryb kinowy” dalej ustawia poziom efektów). **Film dnia**: „film dnia”, „pokaż film dnia”,
„podsumuj dzień jako film” (`day_film`) — montaż tego, co Jarvis i Hermes zrobili dziś. Po 20:00, gdy dzień miał co najmniej
3 sceny, Jarvis sam proponuje go w czacie.

- **Na żywo**, gdy przebieg trwa (● REC): krótkie „poprzednio”, potem kamera śledzi bieżący krok, a hologram pokazuje tekst,
  który Hermes właśnie pisze (i po jakie narzędzie sięga, np. 📚 skill). Pytania przebiegu mają przyciski na dolnym pasku.
- **Z zapisu**, gdy przebieg się skończył (▶ Zapis): cały przebieg w ok. 1,5 min (minuta pracy Hermesa ≈ 3 s ekranu);
  w czasie „myślenia” hologram wpisuje wynik kroku.
- **Ustawienia → Wygląd → Film · moduł scenariuszy:** wiersz „Workflow”: „wyłączone” / „zaproponuj w czacie” (domyślnie: karta przy starcie
  przebiegu i „film gotowy” na końcu) / „włącz sam na żywo”; plus osobne wiersze dla zadań Hermesa, harmonogramu i czatu ([film.md](film.md)).

Sceny: przesłona otwiera się z Orba na pulpicie, kamera wchodzi w Orba i wylatuje w kosmos; „Jarvis OS przedstawia”, tytuł
i pomysł; wiązki z Orba zapalają konstelację kroków; plansza aktu (krótkie kroki — polecenia pulpitu, sprawdzenia — jako
szybki montaż z paskiem podpisu); uderzenie przy ukończeniu i hologram z wynikiem (długi wynik przewija się jak prompter);
„Korekta kursu” przy poprawce, „Awaria” przy porażce; finał — energia kroków wraca do Orba; napisy końcowe i „Koniec”
z dalszymi działaniami: 📄 README projektu (czytnik w filmie), ➕ Nowy projekt, ↻ Jeszcze raz.

Lektorem jest Jarvis — mówi o swojej pracy w pierwszej osobie, głosem z ustawień (🎙 albo klawisz L; domyślnie jak „Mowa”).
Muzyka jest syntezowana na żywo i rozwija motyw dźwięku startu Jarvisa; przycicha, gdy lektor mówi (🔊/🔇 albo M;
startuje wyciszona, gdy dźwięki pulpitu są wyłączone). Sterowanie: spacja — pauza, ←/→ — poprzedni/następny rozdział
(paski rozdziałów na dole), ⏭ — do finału / koniec napisów, Esc — zamknij (przesłona wraca do Orba). Jakość obrazu sama
spada przy słabej płynności i wraca, gdy jest lepiej; pulpit pod filmem nie jest rysowany. Poziom efektów „wyłączone” albo
systemowe „ogranicz ruch”: cięcia zamiast lotów kamery, bez wstrząsów i błysków, napisy końcowe do przewinięcia.

Skąd dane: przebiegi i ich zapis zdarzeń (most, `/workflows/runs`), podgląd pisania (`step.progress`, tylko na żywo —
nie trafia do zapisu), README z folderu projektu (`/workflows/runs/{id}/file`, tylko wewnątrz tego folderu), Film dnia —
przebiegi workflow, dziennik zadań Hermesa z Telegrama i harmonogramu (`~/.jarvis-os/agent-history.jsonl`, 8 dni,
`/bridge/agent-history`), Process Log i notatki z danego dnia.
Kod: `js/workflow-cinema.js` (scena, reżyser zdarzeń, dźwięk, Film dnia), style `.cin-*` w `css/jarvis.css`,
`bridge/day_history.py`.

## Dostępne workflow

| Workflow | Wejście | Co powstaje | Autonomia |
|---|---|---|---|
| `od-pomyslu-do-projektu` | `pomysl` | `%USERPROFILE%\JarvisWorkspace\projects\<nazwa>\`: README (brief), `docs/ARCHITEKTURA.md`, `docs/adr/0001-*.md`, `STRUKTURA.md`, szkielety plików, commit git; notatka na pulpicie | L3 |

## Jak dodać workflow

1. Nowy plik `workflows/<id>.yaml` (wzór: `od-pomyslu-do-projektu.yaml`), zgodny z `workflows/schema.json`.
2. Kroki: `hermes` (prompt z `{wejściem}` i `{wynikiem.pola}`, `format: json|text`, `check`), `check`, `write_files`, `tool`, `ask`.
   Każdy krok ze skutkami ma `effect` (`reversible` / `irreversible` / `external`) — od tego zależą pytania o zgodę.
3. `python bridge/test_workflows.py` sprawdza definicje z repo; most wczytuje zmienione pliki bez restartu.
