"""Jarvis OS: rozszerzenia sterowania prawdziwym komputerem (awlevin/typesafe-computer-use) dla Windows — bez zmian w kodzie autora.

Uruchomienie (robi to most; argumenty jak w `clicker`):
  uv run --project <vendor>/typesafe-computer-use python integrations/computer/jarvis_clicker.py "open Notepad" --act --steps 25

Co dokłada (wynik badań na Windows 11, polski system, 125% skalowania):
  1. AKCJA `open_app` — uruchom program z KATALOGU (Notatnik, Kalkulator, Eksplorator, Paint, Ustawienia) i wysuń go na pierwszy plan.
     Program autora widzi tylko okno na pierwszym planie (bez paska zadań i menu Start) i nie ma akcji „uruchom program”, więc z ekranu
     przeglądarki nie mógł otworzyć niczego. Jev wybiera z katalogu (pytanie `app`), nigdy dowolne polecenie: żadnych terminali ani skryptów.
  2. SZYBKI odczyt adresu przeglądarki: natywne wyszukiwanie UI Automation zamiast przeszukiwania drzewa w Pythonie (2,9 s → 20–110 ms
     na każdy krok) + pamięć podręczna, a nazwa paska adresu rozpoznawana także po polsku („Pasek adresu i wyszukiwania”) — dotąd na polskim
     Chrome/Comet adres NIGDY nie był odczytywany (szukano słowa „address”).
  3. Domyślna przeglądarka użytkownika zamiast „Google Chrome” na sztywno (CLICKER_BROWSER ustawia most).
  4. POLE TEKSTOWE: Notatnik i inne edytory to „Document”, którego program autora nie znał (rola pusta) — więc `type_text` odmawiał
     („no text field is focused”) mimo kursora w polu. Edytowalny Document/Custom z zapisywalną wartością liczymy jako pole tekstowe.
  5. OCHRONA PRZED NADPISANIEM: `type_text` autora ZASTĘPUJE całą zawartość pola; w edytorze z odtworzoną sesją (Notatnik Windows 11
     przywraca niezapisane karty) skasowałoby to dokument użytkownika. Niepustego pola wieloliniowego nie nadpisujemy
     (JARVIS_CLICKER_OVERWRITE=1 znosi zabezpieczenie); po uruchomieniu Notatnika z tekstem otwieramy pustą kartę (Ctrl+N).
  6. SZYBKIE „done”: gdy Jev jest pewny (>= JARVIS_CLICKER_QUICK_DONE, domyślnie 0,90; 0 = wyłączone), że cel do WYKONANIA jest osiągnięty,
     pomijamy końcową weryfikację modelem pomocniczym (u nas ~9 s przez Hermesa). Cele „o informację” (co/ile/znajdź/sprawdź…) dalej ją mają,
     bo odpowiedź jest wtedy wynikiem zadania.
"""
from __future__ import annotations

import os
import re
import sys
import time
from dataclasses import dataclass, fields

WINDOWS = sys.platform == "win32"


# ------------------------------------------------------------------ katalog programów

@dataclass(frozen=True)
class App:
    description: str          # dwujęzycznie: Jev rozumie „Notatnik” i „Notepad”
    launch: str               # nazwa pliku albo schemat (ms-settings:) — uruchamiane przez ShellExecute
    titles: tuple[str, ...]   # fragmenty tytułu okna (małe litery), po których poznajemy, że program się pojawił
    exes: tuple[str, ...] = ()  # nazwy procesów okna głównego, gdy tytuł nie wystarcza


CATALOG: dict[str, App] = {
    "notepad": App("Notepad (Notatnik): a plain text editor. For writing or editing a text note.", "notepad.exe", ("notepad", "notatnik"), ("notepad.exe",)),
    "calculator": App("Calculator (Kalkulator): for arithmetic.", "calc.exe", ("calculator", "kalkulator")),
    "file_explorer": App("File Explorer (Eksplorator plików): to browse folders and files.", "explorer.exe", ("eksplorator", "explorer", "ten komputer", "this pc", "strona główna", "home"), ("explorer.exe",)),
    "paint": App("Paint: a simple drawing program.", "mspaint.exe", ("paint",), ("mspaint.exe",)),
    "settings": App("Windows Settings (Ustawienia): system and device settings.", "ms-settings:", ("ustawienia", "settings")),
}

OPEN_APP_DESCRIPTION = (
    "Launch a program from the app list (the app question says which) and bring it to the front. Works from any app, including "
    "this one and the desktop. Use it when the goal needs a program that is not open or not visible on screen. Never look for "
    "the taskbar or the Start menu to launch a program. A website is not a program: use use_browser for websites."
)


def open_app_min_confidence() -> float:
    try:
        return float(os.environ.get("JARVIS_CLICKER_OPEN_APP_MIN", "0.7"))
    except ValueError:
        return 0.7


def app_criteria() -> dict[str, str]:
    return {**{key: app.description for key, app in CATALOG.items()},
            "none": "No program needs to be launched: the program the goal needs is already on screen, or none is needed."}


# ------------------------------------------------------------------ Windows (te funkcje są podmieniane w testach)

def _win32():
    import win32api, win32con, win32gui, win32process  # noqa: E401 — tylko Windows
    return win32api, win32con, win32gui, win32process


def visible_windows() -> dict[int, tuple[str, int]]:
    """hwnd -> (tytuł, pid) widocznych okien najwyższego poziomu z tytułem."""
    _, _, gui, proc = _win32()
    out: dict[int, tuple[str, int]] = {}

    def visit(hwnd, _):
        if gui.IsWindowVisible(hwnd):
            title = gui.GetWindowText(hwnd)
            if title:
                out[hwnd] = (title, proc.GetWindowThreadProcessId(hwnd)[1])

    gui.EnumWindows(visit, None)
    return out


def launch(command: str) -> None:
    os.startfile(command)  # ShellExecute: działa i dla notepad.exe, i dla ms-settings: — bez okna konsoli, bez powłoki


def bring_to_front(hwnd: int, timeout: float = 3.0) -> bool:
    """Wysuń okno na pierwszy plan. Windows odmawia „kradzieży” fokusu procesowi w tle, więc na chwilę
    dołączamy się do wątku okna, które ma fokus (standardowy sposób)."""
    api, con, gui, proc = _win32()
    import ctypes

    gui.ShowWindow(hwnd, con.SW_RESTORE)
    fg = gui.GetForegroundWindow()
    cur_thread = api.GetCurrentThreadId()
    fg_thread = proc.GetWindowThreadProcessId(fg)[0] if fg else 0
    attached = bool(fg_thread and fg_thread != cur_thread and ctypes.windll.user32.AttachThreadInput(cur_thread, fg_thread, True))
    try:
        try:
            gui.SetForegroundWindow(hwnd)
        except Exception:  # noqa: BLE001 — sprawdzamy wynik niżej
            pass
    finally:
        if attached:
            ctypes.windll.user32.AttachThreadInput(cur_thread, fg_thread, False)
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if gui.GetForegroundWindow() == hwnd:
            return True
        time.sleep(0.1)
    return gui.GetForegroundWindow() == hwnd


def _ctrl_n() -> None:
    api, con, _, _ = _win32()
    api.keybd_event(0x11, 0, 0, 0)
    api.keybd_event(0x4E, 0, 0, 0)
    api.keybd_event(0x4E, 0, con.KEYEVENTF_KEYUP, 0)
    api.keybd_event(0x11, 0, con.KEYEVENTF_KEYUP, 0)


def focused_text_value() -> str | None:
    """Zawartość fokusowanego pola (ValuePattern), albo None, gdy nie da się jej odczytać."""
    try:
        import uiautomation as auto
        pattern = auto.GetFocusedControl().GetPattern(auto.PatternId.ValuePattern)
        return pattern.Value or "" if pattern is not None else None
    except Exception:  # noqa: BLE001
        return None


def focus_text_area(hwnd: int) -> bool:
    """Najlepsza próba: fokus na głównym polu tekstowym okna (Edit/Document), żeby `type_text` miał gdzie pisać."""
    try:
        uia, UIA = _uia()
        root = uia.ElementFromHandle(hwnd)
        for control_type in (50004, 50030):  # Edit, Document
            found = root.FindFirst(4, uia.CreatePropertyCondition(30003, control_type))
            if found is not None:
                found.SetFocus()
                return True
    except Exception:  # noqa: BLE001
        pass
    return False


def _uia():
    import uiautomation.uiautomation as UIA
    return UIA._AutomationClient.instance().IUIAutomation, UIA


# ------------------------------------------------------------------ akcja open_app

def open_app(app_key: str, *, wait: float = 8.0, sleep=time.sleep) -> str:
    """Uruchom program z katalogu i wysuń jego okno. Zwraca jedną linię do historii kroków."""
    app = CATALOG.get(app_key)
    if app is None:
        return f"open_app refused: {app_key!r} is not in the app list"
    before = visible_windows()
    fg_before = _foreground()
    try:
        launch(app.launch)
    except OSError as e:
        return f"open_app failed: {app.launch} could not be started ({e})"
    end = time.monotonic() + wait
    hwnd = None
    while time.monotonic() < end and hwnd is None:
        sleep(0.25)
        hwnd = _find_app_window(app, before)
    if hwnd is None:
        return f"open_app failed: no {app_key} window appeared within {wait:.0f} s"
    front = bring_to_front(hwnd)
    sleep(0.4)
    focused = focus_text_area(hwnd) if app_key in ("notepad",) else False
    fresh_tab = False
    if focused and (focused_text_value() or "").strip():   # aktywna karta ma czyjś tekst (sesja Notatnika bywa odtwarzana) — piszemy w nowej, pustej
        _ctrl_n()
        sleep(0.5)
        fresh_tab = not (focused_text_value() or "").strip()
    return (f"opened {app_key}" + ("" if front else " (window is not in front yet)") + (", text area focused" if focused else "")
            + (", new empty tab" if fresh_tab else "") + (f"; was in {fg_before}" if fg_before else ""))


def _foreground() -> str:
    try:
        _, _, gui, proc = _win32()
        import psutil
        fg = gui.GetForegroundWindow()
        return psutil.Process(proc.GetWindowThreadProcessId(fg)[1]).name() if fg else ""
    except Exception:  # noqa: BLE001
        return ""


BROWSER_EXES = {"chrome.exe", "msedge.exe", "comet.exe", "firefox.exe", "brave.exe", "opera.exe", "vivaldi.exe", "arc.exe", "chromium.exe"}


def _proc_name(pid: int) -> str:
    try:
        import psutil
        return psutil.Process(pid).name().lower()
    except Exception:  # noqa: BLE001 — proces zniknął albo brak uprawnień
        return ""


def _find_app_window(app: App, before: dict[int, tuple[str, int]]) -> int | None:
    """Nowe okno o pasującym tytule; w drugiej kolejności okno tego programu, które już było (program miał jedną instancję).
    Okna przeglądarek nigdy nie pasują (karta „Settings”/„Kalkulator – Google” to nie program), a stare okna programów
    o znanej nazwie procesu muszą się zgadzać także procesem — inaczej klikaliśmy w cudze okno o podobnym tytule."""
    now = visible_windows()
    fresh = [h for h in now if h not in before]
    for pool, strict in ((fresh, False), (list(now), True)):
        for hwnd in pool:
            title = now[hwnd][0].lower()
            if not any(t in title for t in app.titles):
                continue
            exe = _proc_name(now[hwnd][1])
            if exe in BROWSER_EXES:
                continue
            if strict and app.exes and exe and exe not in app.exes:
                continue
            return hwnd
    if app.exes:
        try:
            import psutil
            for hwnd in fresh:
                if psutil.Process(now[hwnd][1]).name().lower() in app.exes:
                    return hwnd
        except Exception:  # noqa: BLE001
            pass
    return None


# ------------------------------------------------------------------ szybki adres przeglądarki

ADDRESS_NAME = re.compile(r"(?i)adres|address|omnibox|location|lokalizac")
_URL_TTL = 5.0
_url_cache: dict[int, tuple[str, str, float]] = {}   # hwnd -> (tytuł okna, adres, kiedy)


def edit_controls(hwnd: int) -> list[tuple[str, object]]:
    """Wszystkie pola tekstowe okna jednym natywnym wywołaniem (nie przechodzeniem drzewa w Pythonie)."""
    uia, UIA = _uia()
    arr = uia.ElementFromHandle(hwnd).FindAll(4, uia.CreatePropertyCondition(30003, 50004))  # TreeScope_Descendants, ControlType=Edit
    out = []
    for i in range(arr.Length):
        el = arr.GetElement(i)
        out.append((el.CurrentName or "", el))
    return out


def element_value(el) -> str:
    _, UIA = _uia()
    from typesafe_computer_use import windows as W
    return W._ui_value(UIA.CreateControlFromElement(el)) or ""


def fast_browser_url(browser: str, *, now=time.monotonic) -> str | None:
    """Adres aktywnej karty przeglądarki `browser`: okno na pierwszym planie, jeśli to ta przeglądarka, inaczej najwyższe jej okno."""
    from typesafe_computer_use import windows as W
    _, _, gui, proc = _win32()
    hwnd = gui.GetForegroundWindow()
    if not hwnd or not W.app_matches(browser, W._process_name(W._window_pid(hwnd))):
        hwnd = W._find_window(browser)
    if not hwnd:
        return None
    return url_of_window(hwnd, now=now)


def url_of_window(hwnd: int, *, now=time.monotonic, title=None) -> str | None:
    _, _, gui, _ = _win32()
    t = gui.GetWindowText(hwnd) if title is None else title
    hit = _url_cache.get(hwnd)
    if hit and hit[0] == t and now() - hit[2] < _URL_TTL:   # ten sam tytuł = ta sama strona; unika odczytu przy każdym kroku
        return hit[1] or None
    url = ""
    try:
        for name, el in edit_controls(hwnd):
            if ADDRESS_NAME.search(name):
                url = element_value(el)
                break
    except Exception:  # noqa: BLE001 — okno zniknęło albo odmawia UI Automation
        return None
    _url_cache[hwnd] = (t, url, now())
    if len(_url_cache) > 64:   # okna przychodzą i odchodzą — bez limitu słownik rósł przez całe zadanie
        for k in sorted(_url_cache, key=lambda h: _url_cache[h][2])[:len(_url_cache) - 64]:
            _url_cache.pop(k, None)
    return url or None


# ------------------------------------------------------------------ pole tekstowe i ochrona przed nadpisaniem

def overwrite_allowed() -> bool:
    return os.environ.get("JARVIS_CLICKER_OVERWRITE") == "1"


def writable_text_role(control_type: str, has_writable_value: bool) -> str:
    """Rola AX dla fokusowanej kontrolki, której program autora nie zna: edytowalny Document → pole wieloliniowe, Custom/Pane
    z zapisywalną wartością → pole jednoliniowe. Strony WWW (Document bez zapisywalnej wartości) zostają bez roli."""
    if not has_writable_value:
        return ""
    return {"DocumentControl": "AXTextArea", "CustomControl": "AXTextField", "PaneControl": "AXTextField"}.get(control_type, "")


MULTILINE_MIN_HEIGHT = 70   # px fizyczne: pasek wyszukiwania ma ~30, edytor dokumentu — znacznie więcej
LONG_VALUE = 200            # tyle znaków to już „dokument”, nie hasło wyszukiwania


def looks_multiline(field) -> bool:
    """Czy pole wygląda na edytor dokumentu, a nie jednoliniowe pole. Sama rola nie wystarcza: RichEdit i pole wieloliniowe Win32
    UI Automation raportuje jako zwykłe pole tekstowe."""
    value = getattr(field, "value", "") or ""
    return (field.role == "AXTextArea" or chr(10) in value.strip() or len(value) >= LONG_VALUE
            or float(getattr(field, "h", 0) or 0) >= MULTILINE_MIN_HEIGHT)


def guard_overwrite(field) -> str | None:
    """Komunikat odmowy, gdy `type_text` nadpisałby niepuste pole wieloliniowe; None = wolno."""
    if overwrite_allowed() or field is None or not looks_multiline(field):
        return None
    if (field.value or "").strip():
        return ("type_text refused: this text field already holds the user's text and typing would replace all of it, so it was "
                "left untouched. Do not type into this field again and do not launch programs to work around it: the goal cannot be "
                "completed here, so stop")
    return None


# ------------------------------------------------------------------ szybkie wpisywanie

TYPE_CHUNK = 64   # zdarzeń klawiatury w jednym SendInput (32 znaki); między porcjami sprawdzamy „mysz w rogu”


def fast_type_text(text: str, *, sender=None, check_abort=None, sleep=time.sleep) -> None:
    """Wpisz tekst hurtem: program autora wysyła każde zdarzenie osobno z przerwą 40 ms (2 zdarzenia na znak = 80 ms/znak,
    200 znaków = 16 s). Tu porcje po 64 zdarzenia jednym SendInput; przerwanie (mysz w rogu) sprawdzane między porcjami."""
    from typesafe_computer_use import windows as W
    events = W.unicode_events(text)
    send = sender or send_batch
    check = check_abort or W.check_abort
    for i in range(0, len(events), TYPE_CHUNK):
        check()
        send([W._key(scan=unit, flags=flags) for unit, flags in events[i:i + TYPE_CHUNK]])
        sleep(0.01)


def send_batch(inputs) -> None:
    """Jedno wywołanie SendInput dla wielu zdarzeń; zablokowane wejście (UAC, ekran blokady) zgłasza błąd zamiast cicho zniknąć."""
    import ctypes
    from typesafe_computer_use import windows as W
    n = len(inputs)
    array = (W._Input * n)(*inputs)
    if W._user32().SendInput(n, array, ctypes.sizeof(W._Input)) != n:
        raise ctypes.WinError(ctypes.get_last_error())


# ------------------------------------------------------------------ szybkie „done”

INFO_GOAL = re.compile(r"(?i)\?|^\s*(what|which|who|whom|how|when|where|why|read|find|tell|show me|check|list|look up|compare|summari[sz]e|"
                       r"co|jaki|jaka|jakie|ile|kiedy|gdzie|kto|jak|dlaczego|przeczytaj|znajd\w*|sprawd\w*|powiedz|podaj|pokaż|wypisz|porównaj|streść)\b")


def quick_done_threshold() -> float:
    try:
        return float(os.environ.get("JARVIS_CLICKER_QUICK_DONE", "0.9"))
    except ValueError:
        return 0.9


def wants_information(goal: str) -> bool:
    return bool(INFO_GOAL.search(goal or ""))


def quick_answer(goal: str, kind_choice: str, confidence: float, outcome: str, app: str = ""):
    """Gotowa odpowiedź zamiast weryfikacji modelem pomocniczym, albo None, gdy weryfikacja jest potrzebna."""
    threshold = quick_done_threshold()
    if threshold <= 0 or outcome != "done" or kind_choice != "done" or confidence < threshold or wants_information(goal):
        return None
    from typesafe_computer_use.writer import Answer
    where = f" (na ekranie: {app})" if app else ""
    return Answer(text=f"Cel osiągnięty{where}: Jev jest tego pewny w {confidence:.0%} — bez dodatkowej weryfikacji.", achieved=True)


# ------------------------------------------------------------------ podpięcie w program autora

def apply() -> dict[str, bool]:
    """Nakłada rozszerzenia. Idempotentne; poza Windows nic nie robi. Musi zajść PRZED importem typesafe_computer_use.cli/runner."""
    done = {"open_app": False, "fast_url": False}
    if not WINDOWS:
        return done
    from typesafe_sdk import Choice
    from typesafe_computer_use import actions, decide as D, windows as W

    if getattr(D, "_jarvis_patched", False):
        return {"open_app": True, "fast_url": True}

    orig_fixed, orig_decide = D.fixed_actions, D.decide
    last: dict = {"decision": None, "app": ""}   # ostatnia decyzja Jeva — do szybkiego „done”

    def fixed_actions(browser, email):
        out = {}
        for key, text in orig_fixed(browser, email).items():
            out[key] = text
            if key == "use_browser":   # tuż za use_browser: „program” i „strona” wykluczają się
                out["open_app"] = OPEN_APP_DESCRIPTION
        return out

    @dataclass(frozen=True)
    class AppDecision(D.Decision):
        app: object = None

        @property
        def confidence(self) -> float:
            if self.kind.choice == "open_app" and self.app is not None:
                sure = min(self.kind.confidence, self.app.confidence)
                # uruchomienie programu ma skutki uboczne (Notatnik odtwarza sesję z cudzymi kartami), więc wymaga wyższej pewności niż klik:
                # poniżej progu zwracamy 0, a runner kończy krokiem „low confidence” zamiast uruchamiać program „na próbę”
                return sure if sure >= open_app_min_confidence() else 0.0
            return super().confidence

    def decide(client, goal, screen, items, history, browser, email, tried=None, guidance=None):
        d = orig_decide(client, goal, screen, items, history, browser, email, tried, guidance)
        last["decision"], last["app"] = d, getattr(screen, "app", "")
        if d.kind.choice != "open_app":
            return d
        # drugie, małe zapytanie tylko wtedy, gdy Jev wybrał uruchomienie programu (zwykłe kroki nie płacą za nie ani milisekundy)
        state = D.base_state(goal, screen, items, history, tried, guidance)
        app = client.system_one(state=state, questions={"app": Choice(
            instructions="Which program from the list should be launched to make progress toward the goal? Pick 'none' if no program needs launching.",
            criteria=app_criteria())}).answers["app"]
        return AppDecision(**{f.name: getattr(d, f.name) for f in fields(D.Decision)}, app=app)

    def handler(decision, screen, items, ctx) -> str:
        app = getattr(decision, "app", None)
        if app is None or app.choice == "none":
            return "open_app refused: no program was chosen"
        return open_app(app.choice)

    def hand_off(cfg, ctx, state, step, log):
        d = last["decision"]
        answer = quick_answer(cfg.goal, d.kind.choice, d.confidence, state.outcome, last["app"]) if d is not None else None
        if answer is None:
            return orig_hand_off(cfg, ctx, state, step, log)
        state.answer = answer
        log(f"{chr(10)}answer (goal achieved, quick: no review — {answer.text}):")
        return False

    orig_focused_field, orig_type_text = W.focused_field, actions._HANDLERS["type_text"]

    def focused_field():
        field = orig_focused_field()
        if field is None or field.role or field.ref is None:
            return field
        try:
            import uiautomation as auto
            pattern = field.ref.GetPattern(auto.PatternId.ValuePattern)
            writable = pattern is not None and not pattern.IsReadOnly
            role = writable_text_role(getattr(field.ref, "ControlTypeName", ""), writable)
        except Exception:  # noqa: BLE001
            role = ""
        from dataclasses import replace as dc_replace
        return dc_replace(field, role=role) if role else field

    def type_text(decision, screen, items, ctx):
        return guard_overwrite(screen.field) or orig_type_text(decision, screen, items, ctx)

    W.type_text = fast_type_text
    W.focused_field = focused_field
    actions._HANDLERS["type_text"] = type_text
    D.fixed_actions = fixed_actions
    D.decide = decide
    actions._HANDLERS["open_app"] = handler
    W.browser_url = fast_browser_url
    D._jarvis_patched = True
    import importlib
    runner = importlib.import_module("typesafe_computer_use.runner")   # ma własne wiązanie nazwy decide (from .decide import decide)
    runner.decide = decide
    orig_hand_off = runner.hand_off
    runner.hand_off = hand_off
    return {"open_app": True, "fast_url": True}


def main(argv: list[str] | None = None) -> None:
    status = apply()
    from typesafe_computer_use.cli import main as clicker_main
    if os.environ.get("JARVIS_CLICKER_VERBOSE"):
        print(f"[jarvis-clicker] rozszerzenia: {status}", file=sys.stderr)
    clicker_main(argv)


if __name__ == "__main__":
    main()
