# ADR 0005 — Niepewny Jev oddaje polecenie Hermesowi zamiast pytać

**Status:** przyjęta 2026-10-04 · **Kontekst:** test na żywo (prawdziwa przeglądarka + Hermes `jarvis-desktop`) pokazał, że przy
średniej pewności szybka ścieżka zadawała pytania („Chodzi o: Nowy widget?” → „Jaki rodzaj widgetu?”), na które nie było
pasującej odpowiedzi (np. „widget z zegarem”). Po 30–45 s bez odpowiedzi kończyło się to komunikatem „Anulowano.”. To samo
polecenie skierowane do Hermesa było wykonywane poprawnie za pierwszym razem w ~10 s. Decyzja Jeva bywała też niestabilna:
„Zamknij wszystkie widgety” raz trafiało do pytań, raz do Hermesa.

**Decyzja:** czysta funkcja `J.policy.route` dostaje `ctx.hermes` (Hermes skonfigurowany i niezgłoszony jako niedostępny).
Gdy Hermes jest osiągalny, a tryb samodzielności to nie „zawsze pytaj”:
- R16 — tam, gdzie dotąd padało „Chodzi o…?” (R3 z alternatywami, R6, R13 przy niskiej pewności), polecenie idzie do Hermesa;
- R15 — brak wymaganego tekstu/liczby, a parser nie potwierdza Jeva → Hermes; brak wartości z listy → Jev próbuje wybrać sam
  (D8), a jeśli nie umie, oddaje Hermesowi zamiast pytać.

Pewne polecenia (parser zgodny albo pewność ≥ progu) dalej wykonuje się lokalnie w <1 s. Bezpieczeństwo bez zmian: działania
nieodwracalne wywołane przez Hermesa i tak przechodzą przez potwierdzenie w rejestrze. Bez Hermesa (offline, brak konfiguracji)
pytania działają jak dotąd. Pytanie, które wygasło bez odpowiedzi, kończy się wyjaśnieniem („Nie dostałem odpowiedzi…”), a nie
samym „Anulowano.”. Process Log pokazuje osobny krok „Jev: decyzja” (wykonuję / oddaję Hermesowi / dopytuję + powód).

**Konsekwencje:** mniej pytań bez wyjścia i mniej porzuconych zadań, kosztem ~10 s zamiast natychmiastowej (ale często błędnej)
reakcji w niepewnych przypadkach. Miara z JEV-PLAN (odsetek pytań „Chodzi o…?” < 15%) powinna spaść bliżej zera przy włączonym
Hermesie.
