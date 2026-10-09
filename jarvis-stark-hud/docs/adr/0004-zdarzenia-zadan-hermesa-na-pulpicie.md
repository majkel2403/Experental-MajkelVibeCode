# ADR 0004 — Zadania Hermesa spoza karty widoczne na pulpicie

**Status:** przyjęta 2026-10-04 · **Kontekst:** Orb i Process Log pokazywały wyłącznie zadania z czatu karty — karta zgadywała stan
agenta z własnego strumienia. Polecenia z Telegrama i crona (większość ruchu) były dla pulpitu niewidoczne.

**Decyzja:** wtyczka Hermesa `hermes/plugins/jarvis-events` (tylko obserwacja: haki zwracają `None`, nic nie trafia do kontekstu
modelu) wysyła start zadania, narzędzia i wynik do mostu (`POST /bridge/agent-event`, wątek w tle, kolejka, sekrety maskowane).
Most waliduje zdarzenia i rozsyła je kartom (SSE `event: agent`), a karcie podłączonej w trakcie zadania odtwarza jego przebieg.
Karta zasila nimi tę samą magistralę `J.ev` (Orb, HUD) i Process Log; narzędzia pulpitu nie są dublowane; zadanie z czatu karty
ma pierwszeństwo.

**Konsekwencje:** pulpit pokazuje prawdziwą pracę agenta niezależnie od kanału. Kolejny krok (docelowa architektura): stan agenta
liczony po stronie serwera jako projekcja zdarzeń, wspólna dla wielu urządzeń.
