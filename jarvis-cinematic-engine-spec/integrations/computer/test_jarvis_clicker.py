"""Testy rozszerzeń clickera (jarvis_clicker.py) — bez klucza, bez ruszania myszy i bez uruchamiania programów.
  uv run --project %USERPROFILE%\\.jarvis-os\\vendor\\typesafe-computer-use python -m pytest integrations/computer -q -p no:cacheprovider
"""
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

pytestmark = pytest.mark.skipif(sys.platform != "win32", reason="rozszerzenia dotyczą Windows")
sys.path.insert(0, str(Path(__file__).parent))
import jarvis_clicker as J  # noqa: E402

J.apply()
from typesafe_computer_use import actions, decide as D, runner  # noqa: E402


def ans(choice, conf=0.9, **probs):
    return SimpleNamespace(choice=choice, confidence=conf, probabilities={choice: conf, **probs})


def test_katalog_ma_tylko_bezpieczne_programy_i_dwujezyczne_opisy():
    assert {"notepad", "calculator", "file_explorer", "paint", "settings"} <= set(J.CATALOG)
    for forbidden in ("cmd", "powershell", "terminal", "regedit", "taskmgr", "wsl"):
        assert forbidden not in J.CATALOG and all(forbidden not in a.launch.lower() for a in J.CATALOG.values()), forbidden
    assert "Notatnik" in J.CATALOG["notepad"].description and "Kalkulator" in J.CATALOG["calculator"].description
    crit = J.app_criteria()
    assert crit["none"] and set(crit) == set(J.CATALOG) | {"none"}


def test_apply_jest_idempotentne_i_podpina_wszystko():
    assert J.apply() == {"open_app": True, "fast_url": True}
    assert "open_app" in D.kind_criteria("Google Chrome", None)
    keys = list(D.kind_criteria("Google Chrome", None))
    assert keys.index("open_app") == keys.index("use_browser") + 1, "tuż za use_browser"
    assert runner.decide is D.decide
    assert "open_app" in actions._HANDLERS
    from typesafe_computer_use import windows as W
    assert W.browser_url is J.fast_browser_url


class FakeClient:
    """Jev: pierwsze zapytanie zwraca wybór akcji, zapytanie o program (`app`) — wybór programu."""

    def __init__(self, kind, app="notepad", app_conf=0.9, kind_conf=0.9):
        self.kind, self.app, self.app_conf, self.kind_conf = kind, app, app_conf, kind_conf
        self.calls = []

    def system_one(self, state, questions):
        self.calls.append(sorted(questions))
        a = {}
        if "kind" in questions:
            a = {"kind": ans(self.kind, self.kind_conf), "site": ans("none")}
            if "item" in questions:
                a["item"] = ans("0", 0.8)
        if "app" in questions:
            a = {"app": ans(self.app, self.app_conf)}
        return SimpleNamespace(answers=a)


SCREEN = SimpleNamespace(app="comet.exe", url=None, field=None, offscreen=[], covered={}, region=lambda it: "middle", ax_refs={})


def run_decide(client):
    return D.decide(client, "otwórz Notatnik", SCREEN, [], [], "comet", None)


def test_wybor_programu_robi_drugie_zapytanie_tylko_gdy_trzeba():
    c = FakeClient("open_app", "notepad")
    d = run_decide(c)
    assert d.kind.choice == "open_app" and d.app.choice == "notepad" and d.chosen == "open_app"
    assert [q for q in c.calls if "app" in q] == [["app"]], "dokładnie jedno małe zapytanie o program"
    c2 = FakeClient("scroll_down")
    d2 = run_decide(c2)
    assert d2.kind.choice == "scroll_down" and all("app" not in q for q in c2.calls), "zwykły krok nie płaci za pytanie o program"


def test_pewnosc_uwzglednia_wybor_programu_i_nie_zatrzymuje_sie_na_starych_akcjach():
    assert run_decide(FakeClient("open_app", "notepad", app_conf=0.2)).confidence == 0.0, "niepewny wybór programu = stop, nie uruchamianie „na próbę”"
    assert run_decide(FakeClient("open_app", "notepad", app_conf=0.95, kind_conf=0.55)).confidence == 0.0, "pewność akcji poniżej 0,7 też"
    assert run_decide(FakeClient("open_app", "notepad", app_conf=0.95, kind_conf=0.8)).confidence == pytest.approx(0.8)
    assert run_decide(FakeClient("open_app", "notepad", app_conf=0.7, kind_conf=0.7)).confidence == pytest.approx(0.7), "próg włącznie"
    assert run_decide(FakeClient("scroll_down", kind_conf=0.7)).confidence == pytest.approx(0.7)


@pytest.fixture
def windows(monkeypatch):
    """Symulowany pulpit: lista okien zmienia się po „uruchomieniu” programu."""
    state = {"wins": {1: ("Jarvis OS – Comet", 10)}, "front": 1, "launched": [], "appear": None, "focus_calls": []}
    monkeypatch.setattr(J, "visible_windows", lambda: dict(state["wins"]))
    monkeypatch.setattr(J, "_foreground", lambda: "comet.exe")

    def launch(cmd):
        state["launched"].append(cmd)
        if state["appear"]:
            state["wins"][99] = state["appear"]

    monkeypatch.setattr(J, "launch", launch)
    monkeypatch.setattr(J, "bring_to_front", lambda h, timeout=3.0: state.update(front=h) or True)
    monkeypatch.setattr(J, "focus_text_area", lambda h: state["focus_calls"].append(h) or True)
    return state


def test_open_app_uruchamia_z_katalogu_wysuwa_okno_i_ustawia_fokus(windows):
    windows["appear"] = ("Bez tytułu – Notatnik", 200)
    text = J.open_app("notepad", sleep=lambda s: None)
    assert windows["launched"] == ["notepad.exe"] and windows["front"] == 99 and windows["focus_calls"] == [99]
    assert text.startswith("opened notepad") and "text area focused" in text and "comet.exe" in text


def test_open_app_polskie_i_angielskie_tytuly_ustawienia_kalkulator(windows):
    windows["appear"] = ("Kalkulator", 1)
    assert J.open_app("calculator", sleep=lambda s: None).startswith("opened calculator")
    windows["wins"].pop(99, None); windows["appear"] = ("Ustawienia", 2); windows["launched"].clear()
    assert J.open_app("settings", sleep=lambda s: None).startswith("opened settings") and windows["launched"] == ["ms-settings:"]


def test_open_app_istniejaca_instancja_jest_wysuwana_zamiast_nowej(windows):
    windows["wins"][50] = ("Kalkulator", 7)   # już otwarty
    windows["appear"] = None                    # ponowne uruchomienie nie tworzy nowego okna
    assert J.open_app("calculator", sleep=lambda s: None).startswith("opened calculator") and windows["front"] == 50


def test_open_app_nie_bierze_karty_przegladarki_ani_cudzego_procesu(windows, monkeypatch):
    names = {10: "comet.exe", 30: "chrome.exe", 31: "notepad++.exe", 99: "systemsettings.exe", 200: "notepad.exe"}
    monkeypatch.setattr(J, "_proc_name", lambda pid: names.get(pid, ""))
    windows["wins"][40] = ("Ustawienia – Google Chrome", 30)    # karta przeglądarki o tytule „Ustawienia”
    windows["appear"] = ("Ustawienia", 99)                      # prawdziwe okno pojawia się dopiero po uruchomieniu
    assert J.open_app("settings", sleep=lambda s: None).startswith("opened settings")
    assert windows["launched"] == ["ms-settings:"] and windows["front"] == 99, "nie kliknął w kartę Chrome"
    # stare okno o pasującym tytule, ale z innego programu (Notepad++ ≠ notepad.exe) nie jest „istniejącą instancją”
    windows["launched"].clear(); windows["wins"].pop(99, None)
    windows["wins"][41] = ("notatnik.txt - Notepad++", 31)
    windows["appear"] = ("Bez tytułu – Notatnik", 200)
    assert J.open_app("notepad", sleep=lambda s: None).startswith("opened notepad")
    assert windows["launched"] == ["notepad.exe"] and windows["front"] == 99


def test_open_app_odmowy_i_bledy(windows, monkeypatch):
    assert "not in the app list" in J.open_app("powershell")
    assert "not in the app list" in J.open_app("rm -rf /")
    assert windows["launched"] == [], "nic spoza katalogu nie jest uruchamiane"
    monkeypatch.setattr(J.time, "monotonic", iter(range(0, 1000)).__next__)   # czas biegnie, okno nie pojawia się
    assert "no notepad window appeared" in J.open_app("notepad", wait=3, sleep=lambda s: None)
    monkeypatch.setattr(J, "launch", lambda c: (_ for _ in ()).throw(OSError("brak pliku")))
    assert "could not be started" in J.open_app("paint", sleep=lambda s: None)


def test_uchwyt_akcji_odmawia_bez_wyboru_programu():
    h = actions._HANDLERS["open_app"]
    assert "no program was chosen" in h(SimpleNamespace(app=None), SCREEN, [], None)
    assert "no program was chosen" in h(SimpleNamespace(app=ans("none")), SCREEN, [], None)


def test_nazwa_paska_adresu_takze_po_polsku():
    for name in ("Pasek adresu i wyszukiwania", "Address and search bar", "Adres URL", "Location", "Omnibox"):
        assert J.ADDRESS_NAME.search(name), name
    for name in ("Przeszukaj Wikipedię", "Miasto", "Powiedz Jarvisowi, co ma zrobić"):
        assert not J.ADDRESS_NAME.search(name), name


def test_adres_jest_czytany_natywnie_z_pamiecia_podreczna(monkeypatch):
    J._url_cache.clear()
    reads = {"n": 0}
    edits = [("Przeszukaj Wikipedię", "field-a"), ("Pasek adresu i wyszukiwania", "omnibox")]
    monkeypatch.setattr(J, "edit_controls", lambda hwnd: reads.__setitem__("n", reads["n"] + 1) or edits)
    monkeypatch.setattr(J, "element_value", lambda el: "pl.wikipedia.org/wiki/Kraków" if el == "omnibox" else "zły")
    t = [100.0]
    now = lambda: t[0]  # noqa: E731
    assert J.url_of_window(7, now=now, title="Kraków – Wikipedia") == "pl.wikipedia.org/wiki/Kraków"
    assert J.url_of_window(7, now=now, title="Kraków – Wikipedia") == "pl.wikipedia.org/wiki/Kraków" and reads["n"] == 1, "ten sam tytuł: bez ponownego odczytu"
    assert J.url_of_window(7, now=now, title="Inna strona") and reads["n"] == 2, "zmiana tytułu = nowy odczyt"
    t[0] += 6
    J.url_of_window(7, now=now, title="Inna strona")
    assert reads["n"] == 3, "po 5 s odczyt odświeżany"


def test_brak_paska_adresu_lub_wyjatek_to_none_bez_awarii(monkeypatch):
    J._url_cache.clear()
    monkeypatch.setattr(J, "edit_controls", lambda hwnd: [("Miasto", "x")])
    assert J.url_of_window(8, title="Notatnik") is None
    monkeypatch.setattr(J, "edit_controls", lambda hwnd: (_ for _ in ()).throw(RuntimeError("okno zniknęło")))
    J._url_cache.clear()
    assert J.url_of_window(9, title="x") is None


def test_szybkie_done_tylko_dla_celow_wykonawczych_i_pewnego_jeva(monkeypatch):
    monkeypatch.delenv("JARVIS_CLICKER_QUICK_DONE", raising=False)
    a = J.quick_answer("otwórz Notatnik", "done", 0.98, "done", "Notepad.exe")
    assert a is not None and a.achieved and "98%" in a.text and "Notepad.exe" in a.text
    assert J.quick_answer("open Notepad and type hello", "done", 0.91, "done") is not None
    assert J.quick_answer("otwórz Notatnik", "done", 0.85, "done") is None, "za mała pewność: pełna weryfikacja"
    assert J.quick_answer("otwórz Notatnik", "none", 0.99, "nothing helps") is None, "to nie jest „done”"
    assert J.quick_answer("otwórz Notatnik", "done", 0.99, "step limit") is None


@pytest.mark.parametrize("goal", ["what is the price of the ticket", "ile kosztuje bilet", "Find the cheapest flight", "znajdź najtańszy lot",
                                  "sprawdź pogodę w Krakowie", "is it raining?", "Przeczytaj pierwszy mail", "read the title of the page"])
def test_cele_o_informacje_zachowuja_weryfikacje(goal, monkeypatch):
    monkeypatch.delenv("JARVIS_CLICKER_QUICK_DONE", raising=False)
    assert J.wants_information(goal) and J.quick_answer(goal, "done", 0.99, "done") is None


@pytest.mark.parametrize("goal", ["otwórz Notatnik", "open Notepad and type hello", "kliknij Zapisz", "click the Save button", "uruchom kalkulator", "wpisz cześć w pole"])
def test_cele_wykonawcze_nie_sa_informacyjne(goal):
    assert not J.wants_information(goal)


def test_quick_done_mozna_wylaczyc(monkeypatch):
    monkeypatch.setenv("JARVIS_CLICKER_QUICK_DONE", "0")
    assert J.quick_answer("otwórz Notatnik", "done", 0.99, "done") is None
    monkeypatch.setenv("JARVIS_CLICKER_QUICK_DONE", "nie-liczba")
    assert J.quick_done_threshold() == 0.9


@pytest.mark.parametrize("ctype,writable,role", [
    ("DocumentControl", True, "AXTextArea"),     # Notatnik, edytory
    ("DocumentControl", False, ""),              # strona WWW / dokument tylko do odczytu
    ("CustomControl", True, "AXTextField"),
    ("PaneControl", True, "AXTextField"),
    ("PaneControl", False, ""),
    ("ButtonControl", True, ""),                 # nie zgadujemy dla innych typów
    ("", True, ""),
])
def test_rola_pola_tekstowego_dla_nieznanych_typow(ctype, writable, role):
    assert J.writable_text_role(ctype, writable) == role


def field(role="AXTextArea", value=""):
    return SimpleNamespace(role=role, value=value, label="Edytor tekstów")


def test_ochrona_przed_nadpisaniem_niepustego_pola_wieloliniowego(monkeypatch):
    monkeypatch.delenv("JARVIS_CLICKER_OVERWRITE", raising=False)
    assert J.guard_overwrite(field(value="Mój niezapisany dokument")) and "left untouched" in J.guard_overwrite(field(value="x"))
    assert J.guard_overwrite(field(value="")) is None and J.guard_overwrite(field(value="   \n")) is None, "puste pole: wolno"
    assert J.guard_overwrite(field(role="AXTextField", value="stare hasło szukania")) is None, "jednoliniowe pola (szukajki) są zastępowane jak u autora"
    assert J.guard_overwrite(None) is None
    monkeypatch.setenv("JARVIS_CLICKER_OVERWRITE", "1")
    assert J.guard_overwrite(field(value="x")) is None, "jawne przyzwolenie znosi ochronę"


def test_uchwyt_type_text_odmawia_zanim_zapyta_model_pomocniczy(monkeypatch):
    monkeypatch.delenv("JARVIS_CLICKER_OVERWRITE", raising=False)
    h = actions._HANDLERS["type_text"]
    screen = SimpleNamespace(field=field(value="cudzy tekst"))
    msg = h(SimpleNamespace(), screen, [], SimpleNamespace(writer=None))
    assert "already holds the user's text" in msg and "do not launch programs" in msg.lower().replace("do not launch", "do not launch"), msg


def test_notatnik_z_tekstem_dostaje_nowa_pusta_karte(windows, monkeypatch):
    windows["appear"] = ("Notatnik", 5)
    values = iter(["czyjś tekst z odtworzonej sesji", ""])   # przed Ctrl+N tekst, po nim pusto
    keys = []
    monkeypatch.setattr(J, "focused_text_value", lambda: next(values))
    monkeypatch.setattr(J, "_ctrl_n", lambda: keys.append("ctrl+n"))
    text = J.open_app("notepad", sleep=lambda s: None)
    assert keys == ["ctrl+n"] and "new empty tab" in text


def test_notatnik_pusty_nie_dostaje_dodatkowej_karty(windows, monkeypatch):
    windows["appear"] = ("Notatnik", 5)
    keys = []
    monkeypatch.setattr(J, "focused_text_value", lambda: "")
    monkeypatch.setattr(J, "_ctrl_n", lambda: keys.append("ctrl+n"))
    assert "new empty tab" not in J.open_app("notepad", sleep=lambda s: None) and keys == []


def rich(value, role="AXTextField", h=0):
    return SimpleNamespace(role=role, value=value, label="Edytor", h=h)


def test_pole_wieloliniowe_rozpoznawane_po_zawartosci_i_wysokosci_nie_tylko_po_roli(monkeypatch):
    monkeypatch.delenv("JARVIS_CLICKER_OVERWRITE", raising=False)
    assert J.looks_multiline(rich("a\nb")), "znak nowej linii w wartości"
    assert J.looks_multiline(rich("x" * 200)), "długa treść to dokument"
    assert J.looks_multiline(rich("x", h=220)), "wysokie pole (RichEdit raportowany jako zwykłe pole tekstowe)"
    assert not J.looks_multiline(rich("szukana fraza", h=32)), "pasek wyszukiwania"
    assert J.guard_overwrite(rich("Mój ważny dokument", h=240)), "RichEdit z tekstem jest chroniony mimo roli „pole tekstowe”"
    assert J.guard_overwrite(rich("", h=240)) is None, "puste — wolno"
    assert J.guard_overwrite(rich("stara fraza", h=32)) is None, "pole wyszukiwania zastępujemy jak u autora"


def test_szybkie_wpisywanie_porcjami_z_kontrola_przerwania():
    sent, checks = [], []
    text = "Cześć świecie! " * 10   # 150 znaków = 300 zdarzeń
    J.fast_type_text(text, sender=lambda batch: sent.append(len(batch)), check_abort=lambda: checks.append(1), sleep=lambda s: None)
    assert sum(sent) == 300 and max(sent) <= J.TYPE_CHUNK and len(sent) == 5, sent
    assert len(checks) == len(sent), "przerwanie (mysz w rogu) sprawdzane przed każdą porcją"


def test_szybkie_wpisywanie_zatrzymuje_sie_po_przerwaniu():
    sent = []

    class Stop(Exception):
        pass

    def check():
        if len(sent) >= 2:
            raise Stop()

    with pytest.raises(Stop):
        J.fast_type_text("x" * 500, sender=lambda b: sent.append(len(b)), check_abort=check, sleep=lambda s: None)
    assert len(sent) == 2, "po sygnale przerwania nic więcej nie jest wysyłane"


def test_wpisywanie_unicode_zachowuje_polskie_znaki_i_emoji():
    from typesafe_computer_use import windows as W
    units = [u for u, f in W.unicode_events("ąęłóżź😀") if f == W.KEYEVENTF_UNICODE]
    assert len(units) == 6 + 2, "6 liter + para zastępcza emoji"
