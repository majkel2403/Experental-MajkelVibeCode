/* Planowane polecenia (jeszcze nie ma ich w rejestrze). Jedno źródło prawdy dla specyfikacji:
   z tego pliku `node tools/gen-spec.js` robi tabelę docs/spec/katalog-nowych-polecen.md, a test tests/unit/spec.test.js sprawdza spójność
   (brak kolizji z rejestrem, poprawne schematy, zasady poziomów, przykłady, pokrycie zbiorem zdań).

   Pola:
     id, group, label, description — jak w js/commands.js
     args      — JSON Schema argumentów (ten sam podzbiór co rejestr)
     level     — A3 odczyt/nawigacja po cichu · A2 odwracalny zapis z „Cofnij” · A1 pyta „Chodzi o…?” · A0 zawsze zgoda
     risk      — 'safe' | 'confirm'  (A0 ⇒ confirm)
     undo      — jak cofnąć (A2 musi mieć); null = nie dotyczy
     writes    — co zmienia (windows, ui, notes, tasks, widgets, settings, memory, files, layouts, shortcuts, alerts, chat, routines, timers)
     phase     — fala wdrożenia z docs/spec/17-wdrozenie.md (W1…W5)
     doc       — dokument, który opisuje szczegóły
     extends   — jeśli to rozszerzenie istniejącego polecenia (wtedy id istnieje w rejestrze i zmieniamy tylko argumenty)
     examples  — co najmniej 3 zdania po polsku
*/
'use strict';
const APPS = ['chat', 'notes', 'market', 'schedule', 'monitor', 'terminal', 'weather', 'calc', 'timer', 'settings', 'library', 'files'];
const S = (props, required = []) => ({ type: 'object', properties: props, required });
const str = (o = {}) => ({ type: 'string', ...o }), num = (o = {}) => ({ type: 'number', ...o }), bool = { type: 'boolean' };
const NOTE = str({ description: 'id albo fragment tytułu notatki; "current" = otwarta' });
const TASK = str({ description: 'id albo fragment treści zadania' });
const WIDGET = str({ description: 'id albo tytuł widgetu; "current" = aktywny' });
const WIN = str({ description: 'id aplikacji, "w:<id>" widgetu, "current" = aktywne okno' });

module.exports = [
  /* ================= NAWIGACJA (03-nawigacja.md) ================= */

  /* ================= OKNA (04-okna.md) ================= */

  /* ================= WIDGETY (05-widgety.md) ================= */

  /* ================= NOTATKI (06-notatki.md) ================= */

  /* ================= ZADANIA (07-zadania.md) ================= */

  /* ================= APLIKACJE (08-aplikacje.md) ================= */

  /* ================= WYGLĄD (09-wyglad-stany.md) ================= */

  /* ================= USTAWIENIA (10-ustawienia.md) ================= */

  /* ================= AGENT (11-agent.md) ================= */
];
