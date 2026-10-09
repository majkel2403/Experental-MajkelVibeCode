"""Testy silnika workflow (bridge/workflow_engine.py) z atrapą Hermesa, sędziego i karty — bez sieci:
  python bridge\\test_workflows.py   (wystarczy pyyaml; w CI razem z testami jednostkowymi)
"""
import asyncio
import json
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import workflow_engine as wf  # noqa: E402

REPO_WORKFLOWS = Path(__file__).resolve().parent.parent / "workflows"
fails = []


def check(name, cond, extra=""):
    print(("  ok   " if cond else "  FAIL ") + name + (f"  [{extra}]" if extra and not cond else ""))
    if not cond:
        fails.append(name)


BRIEF = {"nazwa": "Nawyki", "cel": "Pomaga codziennie odhaczać nawyki i widzieć serie.", "odbiorcy": "Osoba budująca nawyki na telefonie",
         "mvp": ["dodaj nawyk", "odhacz dzień", "zobacz serię"], "poza_zakresem": ["konta"], "ograniczenia": ["offline"],
         "ryzyka": ["porzucenie"], "stos_sugestia": "PWA w czystym JS — działa offline bez instalacji."}
ARCH = "\n".join(f"{h}\ntreść" for h in ["## Komponenty", "## Przepływ danych", "## Diagram", "## Stos", "## Kompromisy", "## Ryzyka i do rewizji"])
STRUKTURA = {"pliki": [{"path": "index.html", "cel": "strona"}, {"path": "src/app.js", "cel": "logika"}]}
TRESC = {"pliki": [{"path": "index.html", "content": "<!-- strona -->"}, {"path": "src/app.js", "content": "// logika\n// TODO"}]}


class FakeHermes:
    """Odpowiedzi według tytułu kroku w prompcie systemowym; `script` nadpisuje kolejne odpowiedzi danego kroku."""
    def __init__(self, script=None, delay=0.0):
        self.calls, self.script, self.delay = [], {k: list(v) for k, v in (script or {}).items()}, delay

    async def __call__(self, messages, session_id, timeout):
        self.calls.append((session_id, messages))
        if self.delay:
            await asyncio.sleep(self.delay)
        title = messages[0]["content"].split(": ", 1)[1].split(".")[0]
        if self.script.get(title):
            return self.script[title].pop(0), 1000
        return {"Brief projektu": json.dumps(BRIEF, ensure_ascii=False), "Architektura": ARCH,
                "Struktura plików": json.dumps(STRUKTURA), "Szkielety plików": "```json\n" + json.dumps(TRESC) + "\n```"}[title], 1000


async def judge_ok(question, content):
    return 0.9, "w porządku"


class FakeRelay:
    def __init__(self, reply=None):
        self.calls, self.reply = [], reply or {"ok": True, "code": "OK", "data": {"id": "n1"}, "text": "Utworzyłem notatkę."}

    async def __call__(self, tool, args):
        self.calls.append((tool, args))
        return self.reply


def engine(tmp, hermes=None, judge=judge_ok, relay=None, defs=REPO_WORKFLOWS, **kw):
    events = []
    e = wf.WorkflowEngine(defs_dir=defs, runs_dir=tmp / "runs", projects_root=tmp / "projects", hermes=hermes or FakeHermes(),
                          judge=judge, relay=relay or FakeRelay(), emit=events.append, **kw)
    return e, events


async def finish(e, rid, timeout=10):
    t = e.tasks.get(rid)
    if t:
        await asyncio.wait_for(t, timeout)


async def main():
    tmp = Path(tempfile.mkdtemp(prefix="wf-test-"))
    try:
        # --- definicje z repo przechodzą schemat
        e, _ = engine(tmp)
        defs = e.definitions()
        check("definicje z repo poprawne (od-pomyslu-do-projektu)", "od-pomyslu-do-projektu" in defs, str(e._def_errors))
        check("schemat odrzuca zły plik", wf.validate(e.schema(), {"id": "X!", "name": "a", "version": 0, "autonomy": "L9", "budget": {}, "steps": []}) != [])

        # --- pełny przebieg: brief → architektura → struktura → treść → zapis (git) → notatka
        relay = FakeRelay()
        e, events = engine(tmp / "a", relay=relay)
        snap = await e.start("od-pomyslu-do-projektu", {"pomysl": "aplikacja do nawyków"})
        await finish(e, snap["id"])
        run = e.status(snap["id"])
        check("przebieg zakończony", run["state"] == "done", run.get("reason"))
        root = Path(e.runs[snap["id"]]["outputs"]["zapis"]["root"])
        check("folder projektu w projects/<slug>", root.parent == tmp / "a" / "projects" and root.name == "nawyki", str(root))
        for f in ("README.md", "docs/ARCHITEKTURA.md", "docs/adr/0001-stos-i-architektura.md", "STRUKTURA.md", "src/app.js", "index.html"):
            check(f"plik {f}", (root / f).is_file())
        readme = (root / "README.md").read_text(encoding="utf-8")
        check("README z briefu (lista MVP, bez niewypełnionych {…})", "- odhacz dzień" in readme and "{brief" not in readme)
        check("git: commit", (root / ".git").exists() and run["steps"][4]["state"] == "done")
        check("notatka przez kartę z treścią z briefu", relay.calls and relay.calls[0][0] == "create_note" and "Nawyki" in relay.calls[0][1]["title"])
        check("raport końcowy", "Nawyki" in (run["report"] or "") and str(root) in run["report"], run.get("report"))
        types = [ev["type"] for ev in events]
        check("zdarzenia: start → kroki → koniec", types[0] == "run.started" and types[-1] == "run.completed" and types.count("step.completed") == 6, str(types))
        check("JSON w bloku kodu rozpoznany", e.runs[snap["id"]]["outputs"]["tresc"]["pliki"][1]["path"] == "src/app.js")
        check("zdarzenia zapisane do pliku (powtórka)", len(e.events_of(snap["id"])) == len(events))
        arts = {ev["step_id"]: ev.get("artifact") for ev in events if ev["type"] == "step.completed"}
        check("artefakt briefu: pola", arts["brief"]["kind"] == "fields" and arts["brief"]["fields"]["nazwa"] == "Nawyki" and len(arts["brief"]["fields"]["mvp"]) == 3)
        check("artefakt architektury: nagłówki", arts["architektura"]["kind"] == "doc" and "Komponenty" in arts["architektura"]["headings"])
        check("artefakt struktury: drzewo z celami", arts["struktura"]["kind"] == "tree" and arts["struktura"]["paths"] == ["index.html", "src/app.js"] and arts["struktura"]["notes"]["src/app.js"] == "logika")
        check("artefakt treści: drzewo wypełnione", arts["tresc"]["filled"] is True)
        check("artefakt zapisu: folder, liczba, commit", arts["zapis"]["kind"] == "files_written" and arts["zapis"]["count"] == 6 and arts["zapis"]["commit"])
        check("artefakt w migawce (wznowienie / karta podłączona później)", run["steps"][0]["artifact"]["kind"] == "fields")
        check("artefakty mieszczą się w limicie", all(len(json.dumps(a, ensure_ascii=False)) < 12000 for a in arts.values() if a))

        # --- drugi przebieg z tą samą nazwą → nowy folder, nie nadpisuje
        snap2 = await e.start("od-pomyslu-do-projektu", {"pomysl": "aplikacja do nawyków"})
        await finish(e, snap2["id"])
        check("druga nazwa: nawyki-2", Path(e.runs[snap2["id"]]["outputs"]["zapis"]["root"]).name == "nawyki-2")

        # --- ponowienie ze ZMIANĄ po nieudanym sprawdzeniu (brak sekcji), potem sukces
        h = FakeHermes(script={"Architektura": ["## Komponenty\ntylko to"]})
        e, events = engine(tmp / "b", hermes=h)
        snap = await e.start("od-pomyslu-do-projektu", {"pomysl": "bot"})
        await finish(e, snap["id"])
        st = e.status(snap["id"])["steps"][1]
        retry_prompt = [m for sid, m in h.calls if "-architektura-2" in sid][0][1]["content"]
        check("architektura: 2 próby, sukces", st["state"] == "done" and st["attempts"] == 2, str(st))
        check("druga próba dostaje powód porażki i zmianę", "brak sekcji" in retry_prompt and "nagłówki" in retry_prompt)
        check("zdarzenie step.retry", any(ev["type"] == "step.retry" for ev in events))
        check("osobna sesja Hermesa na krok i próbę", len({sid for sid, _ in h.calls}) == len(h.calls))

        # --- ucięte emoji (samotna połówka pary zastępczej) w odpowiedzi modelu nie wywraca zapisu stanu
        broken = '{"pliki": [{"path": "index.html", "content": "<!-- strona \\ud83d -->"}, {"path": "src/app.js", "content": "// logika \\ud83d\\ude00"}]}'
        e, events = engine(tmp / "u", hermes=FakeHermes(script={"Szkielety plików": [broken]}))
        snap = await e.start("od-pomyslu-do-projektu", {"pomysl": "x"})
        await finish(e, snap["id"])
        r = e.status(snap["id"])
        root = Path(e.runs[snap["id"]]["outputs"]["zapis"]["root"])
        check("samotna połówka emoji: przebieg done, stan zapisany", r["state"] == "done" and json.loads((tmp / "u" / "runs" / f"{snap['id']}.json").read_text(encoding="utf-8"))["state"] == "done", r.get("reason"))
        check("pełne emoji zostaje, połówka zamieniona", chr(0x1F600) in (root / "src/app.js").read_text(encoding="utf-8") and chr(0xFFFD) in (root / "index.html").read_text(encoding="utf-8"))
        check("wf.clean: tylko tekst, struktura bez zmian", wf.clean({"a": ["x" + chr(0xD83D)], "b": 1}) == {"a": ["x" + chr(0xFFFD)], "b": 1})

        # --- niebezpieczna ścieżka → odrzucona (po wyczerpaniu prób przebieg failed, nic poza folderem)
        bad = {"pliki": [{"path": "../../evil.txt", "cel": "x"}]}
        h = FakeHermes(script={"Struktura plików": [json.dumps(bad)] * 3})
        e, _ = engine(tmp / "c", hermes=h)
        snap = await e.start("od-pomyslu-do-projektu", {"pomysl": "x"})
        await finish(e, snap["id"])
        r = e.status(snap["id"])
        check("ścieżka z .. odrzucona → failed", r["state"] == "failed" and "niedozwolony" in (r["reason"] or ""), r.get("reason"))
        check("nic nie zapisano poza katalogiem testu", not (tmp / "evil.txt").exists() and not (tmp.parent / "evil.txt").exists())

        # --- sędzia nisko ocenia → ponowienie; sędzia niedostępny → reguły wystarczą
        scores = [0.3, 0.95]
        async def judge_seq(q, c):
            return (scores.pop(0) if scores else 0.9), "za ogólnie"
        e, _ = engine(tmp / "d", judge=judge_seq)
        snap = await e.start("od-pomyslu-do-projektu", {"pomysl": "x"})
        await finish(e, snap["id"])
        b = e.status(snap["id"])["steps"][0]
        check("niska ocena sędziego → ponowienie z sukcesem", b["attempts"] == 2 and b["state"] == "done" and b["score"] == 0.95, str(b))
        async def judge_down(q, c):
            raise RuntimeError("wszystkie modele zawiodły")
        e, _ = engine(tmp / "e", judge=judge_down)
        snap = await e.start("od-pomyslu-do-projektu", {"pomysl": "x"})
        await finish(e, snap["id"])
        check("sędzia niedostępny nie blokuje przebiegu", e.status(snap["id"])["state"] == "done")

        # --- karta niepołączona: krok optional pominięty, przebieg udany
        e, events = engine(tmp / "f", relay=FakeRelay({"ok": False, "code": "OFFLINE", "text": "Jarvis OS nie jest połączony"}))
        snap = await e.start("od-pomyslu-do-projektu", {"pomysl": "x"})
        await finish(e, snap["id"])
        s = e.status(snap["id"])
        check("karta offline: notatka pominięta, przebieg done", s["state"] == "done" and s["steps"][5]["state"] == "skipped")

        # --- budżet kroków
        e, _ = engine(tmp / "g", hermes=FakeHermes(script={"Brief projektu": ["nie json"] * 3}))
        d = e.definitions()["od-pomyslu-do-projektu"]
        snap = await e.start("od-pomyslu-do-projektu", {"pomysl": "x"})
        e.runs[snap["id"]]["budget"] = dict(d["budget"], steps=2)
        await finish(e, snap["id"])
        r = e.status(snap["id"])
        check("budżet kroków przerywa przebieg", r["state"] == "failed" and "budżet kroków" in (r["reason"] or ""), r.get("reason"))

        # --- L0: tylko propozycja — bez zapisu plików i bez notatki
        relay = FakeRelay()
        e, _ = engine(tmp / "h", relay=relay)
        snap = await e.start("od-pomyslu-do-projektu", {"pomysl": "x"}, autonomy="L0")
        await finish(e, snap["id"])
        s = e.status(snap["id"])
        check("L0: zapis i notatka pominięte", s["state"] == "done" and s["steps"][4]["state"] == "skipped" and not relay.calls and not (tmp / "h" / "projects").exists())

        # --- L1: pytanie przed zmianą; odmowa = koniec bez ponowień i bez szukania innej drogi
        e, events = engine(tmp / "i")
        snap = await e.start("od-pomyslu-do-projektu", {"pomysl": "x"}, autonomy="L1")
        for _ in range(200):
            await asyncio.sleep(0.01)
            if e.runs[snap["id"]]["state"] == "waiting":
                break
        check("L1: czeka na zgodę przed zapisem", e.runs[snap["id"]]["state"] == "waiting" and e.status(snap["id"])["pending"]["options"] == ["Tak", "Nie"])
        check("odpowiedź przyjęta", e.answer(snap["id"], "Nie")["ok"])
        await finish(e, snap["id"])
        r = e.status(snap["id"])
        check("odmowa → failed, bez zapisu", r["state"] == "failed" and "brak zgody" in (r["reason"] or "") and not (tmp / "i" / "projects").exists())

        # --- zatrzymanie i wznowienie po „restarcie mostu”
        e, _ = engine(tmp / "j", hermes=FakeHermes(delay=0.3))
        snap = await e.start("od-pomyslu-do-projektu", {"pomysl": "aplikacja do nawyków"})
        await asyncio.sleep(0.05)
        e.tasks[snap["id"]].cancel()   # symulacja zabicia procesu: stan na dysku zostaje „running”
        try:
            await e.tasks[snap["id"]]
        except asyncio.CancelledError:
            pass
        disk = json.loads((tmp / "j" / "runs" / f"{snap['id']}.json").read_text(encoding="utf-8"))
        disk["state"], disk["ended"] = "running", None
        (tmp / "j" / "runs" / f"{snap['id']}.json").write_text(json.dumps(disk), encoding="utf-8")
        e2, events2 = engine(tmp / "j", hermes=FakeHermes())
        resumed = e2.resume_pending()
        check("po restarcie przebieg wznowiony", resumed == [snap["id"]])
        await finish(e2, snap["id"])
        check("wznowiony przebieg kończy się", e2.status(snap["id"])["state"] == "done" and events2[0]["type"] == "run.resumed")

        e, _ = engine(tmp / "k", hermes=FakeHermes(delay=5))
        snap = await e.start("od-pomyslu-do-projektu", {"pomysl": "x"})
        await asyncio.sleep(0.05)
        r = await e.stop("all")
        check("stop all", r["stopped"] == [snap["id"]] and e.status(snap["id"])["state"] == "stopped")

        # --- limity równoległości i dane wejściowe
        e, _ = engine(tmp / "l", hermes=FakeHermes(delay=5))
        await e.start("od-pomyslu-do-projektu", {"pomysl": "x"})
        try:
            await e.start("od-pomyslu-do-projektu", {"pomysl": "y"})
            check("ten sam workflow dwa razy naraz → odmowa", False)
        except RuntimeError:
            check("ten sam workflow dwa razy naraz → odmowa", True)
        try:
            await e.start("od-pomyslu-do-projektu", {})
            check("brak wymaganego wejścia → błąd", False)
        except ValueError:
            check("brak wymaganego wejścia → błąd", True)
        await e.stop("all")

        check("filtr odmiany", [wf.render("{n|n:plik:pliki:plików}", {"n": k}) for k in (1, 3, 12, 22, 25)] == ["1 plik", "3 pliki", "12 plików", "22 pliki", "25 plików"])

        # --- pomocnicze
        check("slugify polskich znaków", wf.slugify("Żółta Łódź — plan!") == "zolta-lodz-plan")
        check("render z filtrami", wf.render("{a|list}/{b.c}/{x}", {"a": ["1", "2"], "b": {"c": "z"}}) == "- 1\n- 2/z/{x}")
        check("unsafe_path", all(wf.unsafe_path(p) for p in ["/etc", "C:/x", "a/../b", "a//b", ".git/config", "a<b"]) and wf.unsafe_path("src/a.js") is None)
        check("events_of odrzuca dziwny identyfikator", _raises(lambda: e.events_of("../../x")))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print("\n" + ("WSZYSTKO OK" if not fails else f"BŁĘDY ({len(fails)}): " + ", ".join(fails)))
    sys.exit(1 if fails else 0)


def _raises(fn):
    try:
        fn()
    except KeyError:
        return True
    return False


asyncio.run(main())
