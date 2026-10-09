# Jev — sędzia decyzji (OpenRouter)

> Przeniesione z README.md (2026-10-04). Krótki opis i szybki start: [README](../../README.md).

## OpenRouter — jeden klucz dla mózgu i sędziego

W **Ustawienia → OpenRouter** (także w onboardingu) wklej klucz z [openrouter.ai/keys](https://openrouter.ai/keys) i zaznacz, do czego go użyć:

- **Mózg: Hermes 4 przez OpenRouter** — model `nousresearch/hermes-4-70b` w chmurze (natywne `tool_calls`), bez lokalnego gatewaya;
- **Sędzia: Jev** — model decyzyjny TypeSafe.

„Zapisz i testuj” wykonuje prawdziwe wywołania obu usług i pokazuje wynik. Klucz zostaje wyłącznie w tej przeglądarce (eksport kopii go pomija).

## Jev (OpenRouter)

Jev to szybki „sędzia”: przy każdym zdaniu w ~200 ms decyduje, co zrobić. Pełny opis i decyzje: [docs/JEV-PLAN.md](../JEV-PLAN.md).

1. Klucz z [openrouter.ai/keys](https://openrouter.ai/keys) wklej w **Ustawienia → Sędzia Jev**, kliknij **Połącz i testuj**.
2. **Jak działa (zasady w skrócie):**
   - Odczyty i nawigacja (otwórz, pokaż, wróć) — pewne zdania wykonuje parser od razu; niepewne rozstrzyga Jev.
   - Zapisy, które da się cofnąć (dodaj zadanie, notatka, minutnik…) — Jev wykonuje sam od pewności 0,92 i pokazuje przycisk **Cofnij** (8 s; „cofnij” działa też głosem i z klawiatury).
   - Niepewne — gdy Hermes jest dostępny, polecenie trafia do niego (bez pytań bez wyjścia); bez Hermesa albo w trybie „zawsze pytaj” — pytanie „Chodzi o…?” ([ADR 0005](../adr/0005-niepewny-jev-oddaje-hermesowi.md)). Pytanie bez odpowiedzi wygasa z wyjaśnieniem. Nieodwracalne (usuwanie, terminal, schowek) — zawsze zgoda, jeśli polecenie pochodzi od modelu lub głosu.
   - Jev sprawdza też, czy to, co robi Hermes, jest zgodne z Twoją prośbą (strażnik), czy treść z notatek nie zawiera podszytych instrukcji, czy fakt do zapamiętania nie jest poufny i jak rozumieć odpowiedź „no dobra”.
3. **Ustawienia:** poziom prywatności (P0 tylko zdanie · P1 + okna i dzisiejsze zadania · P2 + tytuły i profil), samodzielność (odczyty i zapisy / tylko odczyty / zawsze pytaj), progi, budżet miesięczny (domyślnie 5 USD), tryb cienia (Jev tylko liczy i zapisuje), dziennik decyzji (eksport, lokalnie), reset uczenia się (dwa odrzucenia w dobie podnoszą próg polecenia o 0,05), lżejszy model do zwykłej rozmowy.
4. **Awarie:** trzy błędy z rzędu wstrzymują Jeva (bezpiecznik), polecenia działają dalej przez parser i Hermesa. Zły klucz — długa pauza z powodem.
5. **Pomiar (do zrobienia z kluczem):** sonda mierzy trafność na 447 zdaniach, krzywą zaufania i koszt, i pisze raport do `tests/reports/`:
   ```bash
   OPENROUTER_API_KEY=sk-or-... node tests/jev-probe.js            # pomiar
   OPENROUTER_API_KEY=sk-or-... node tests/jev-probe.js --e1       # dwa etapy zamiast płaskiego wyboru
   OPENROUTER_API_KEY=sk-or-... node tests/jev-probe.js --e3       # bez kontekstu pulpitu
   OPENROUTER_API_KEY=sk-or-... node tests/jev-probe.js --contract # czy format odpowiedzi się nie zmienił
   ```
   To samo robi workflow **Jev — test kontraktowy i sonda** (nocny test kontraktowy, ręcznie pełna sonda) — wymaga sekretu `OPENROUTER_API_KEY` w repozytorium. Progi w Ustawieniach są na razie ostrożnymi hipotezami, dopóki sonda nie zostanie uruchomiona z prawdziwym kluczem.
6. Endpoint: `POST https://openrouter.ai/api/v1/systemone`, model `typesafe/jev-1.13`; pytania `choice` / `noul` / `score`. Koszt: tokeny wyjściowe darmowe, wejściowe ok. 0,04 $ za milion (jedna decyzja ≈ 0,0001 $).
