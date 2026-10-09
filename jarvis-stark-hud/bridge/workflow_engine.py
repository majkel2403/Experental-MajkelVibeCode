"""Silnik workflow (ADR 0007): deterministyczna maszyna stanów nad krokami z definicji `workflows/*.yaml`.

Model myśli WEWNĄTRZ kroków (krok `hermes`), a kolejność, sprawdzenia, ponowienia, budżety i zatrzymanie są w kodzie.
Zależności są wstrzykiwane (Hermes, sędzia sprawdzeń, polecenia karty, zdarzenia), więc silnik da się testować bez sieci.

Kroki: hermes · check · write_files · tool · ask. Stan przebiegu zapisywany po każdym kroku do `<runs>/<id>.json`
(+ zdarzenia `<id>.events.jsonl`), więc po restarcie mostu przebieg wznawia się od ostatniego kroku.
Autonomia: L0 tylko propozycja (kroki ze skutkami pomijane) · L1 pyta przed każdą zmianą · L2/L3 same robią zmiany
odwracalne; nieodwracalne i wysyłki na zewnątrz zawsze z pytaniem.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import secrets
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any, Awaitable, Callable

import yaml

Hermes = Callable[[list, str, float], Awaitable[tuple]]      # (messages, session_id, timeout) -> (text, tokens)
Judge = Callable[[str, str], Awaitable[tuple]]               # (question, content) -> (score 0..1, why)
Relay = Callable[[str, dict], Awaitable[dict]]               # (tool, args) -> koperta {ok, code, data, text}
Emit = Callable[[dict], None]

ACTIVE = ("queued", "running", "waiting")
KEEP_RUNS, KEEP_DAYS = 200, 30
MAX_INPUT = 2000


# ---------------------------------------------------------------- walidacja (ten sam podzbiór co tools/schema-lite.js)

def _type_of(v: Any) -> str:
    if isinstance(v, bool):
        return "boolean"
    if isinstance(v, list):
        return "array"
    if v is None:
        return "null"
    if isinstance(v, dict):
        return "object"
    if isinstance(v, str):
        return "string"
    if isinstance(v, (int, float)):
        return "number"
    return type(v).__name__


def validate(schema: dict, value: Any, at: str = "$") -> list[str]:
    errs: list[str] = []
    err = lambda m: errs.append(f"{at}: {m}")  # noqa: E731
    if "const" in schema and value != schema["const"]:
        err("ma być " + json.dumps(schema["const"], ensure_ascii=False)); return errs
    if "enum" in schema and value not in schema["enum"]:
        err("wartość spoza listy: " + json.dumps(value, ensure_ascii=False)[:80]); return errs
    if "type" in schema:
        t, want = _type_of(value), schema["type"]
        ok = want == t or (want == "integer" and t == "number" and float(value).is_integer())
        if not ok:
            err(f"typ {t}, oczekiwano {want}"); return errs
    if isinstance(value, str):
        if "minLength" in schema and len(value) < schema["minLength"]:
            err("za krótki tekst")
        if "maxLength" in schema and len(value) > schema["maxLength"]:
            err(f"za długi tekst ({len(value)} > {schema['maxLength']})")
        if "pattern" in schema and not re.search(schema["pattern"], value):
            err("nie pasuje do wzorca " + schema["pattern"])
    if _type_of(value) == "number":
        if "minimum" in schema and value < schema["minimum"]:
            err(f"mniej niż {schema['minimum']}")
        if "maximum" in schema and value > schema["maximum"]:
            err(f"więcej niż {schema['maximum']}")
    if isinstance(value, list):
        if "minItems" in schema and len(value) < schema["minItems"]:
            err("za mało elementów")
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            err(f"za dużo elementów ({len(value)} > {schema['maxItems']})")
        if isinstance(schema.get("items"), dict):
            for i, v in enumerate(value):
                errs += validate(schema["items"], v, f"{at}[{i}]")
    if isinstance(value, dict):
        props = schema.get("properties") or {}
        for r in schema.get("required") or []:
            if r not in value:
                err(f"brak pola „{r}”")
        if "maxProperties" in schema and len(value) > schema["maxProperties"]:
            err("za dużo pól")
        for k, v in value.items():
            if "propertyNames" in schema:
                errs += validate({"type": "string", **schema["propertyNames"]}, k, f"{at}.{k}(nazwa)")
            if k in props:
                errs += validate(props[k], v, f"{at}.{k}")
            elif schema.get("additionalProperties") is False:
                err(f"niedozwolone pole „{k}”")
            elif isinstance(schema.get("additionalProperties"), dict):
                errs += validate(schema["additionalProperties"], v, f"{at}.{k}")
    return errs


# ---------------------------------------------------------------- pomocnicze

PL = str.maketrans("ąćęłńóśźżĄĆĘŁŃÓŚŹŻ", "acelnoszzACELNOSZZ")


def slugify(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", str(s or "").translate(PL).lower()).strip("-")
    return s[:40].strip("-") or "projekt"


def lookup(ctx: dict, dotted: str) -> Any:
    cur: Any = ctx
    for part in dotted.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return None
    return cur


def plural(n: int, one: str, few: str, many: str) -> str:
    """Polska odmiana po liczbie: 1 plik, 2–4 pliki (poza 12–14), 5 plików."""
    n = abs(int(n))
    return one if n == 1 else few if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14 else many


def _fmt(v: Any, flt: str | None) -> str:
    if flt and flt.startswith("n:"):   # {liczba|n:plik:pliki:plików} → „34 pliki”
        forms = flt[2:].split(":")
        try:
            return f"{int(v)} {plural(int(v), *forms)}"
        except (TypeError, ValueError):
            return str(v)
    if flt == "list":
        return "\n".join(f"- {x}" for x in (v or [])) if isinstance(v, list) else str(v or "")
    if flt == "inline":
        return "; ".join(str(x) for x in v) if isinstance(v, list) else str(v or "")
    if flt == "files":
        return "\n".join(f"- `{x.get('path')}` — {x.get('cel', '')}" for x in (v or []) if isinstance(x, dict)) if isinstance(v, list) else str(v or "")
    if isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False)[:30000]
    return "" if v is None else str(v)


PLACEHOLDER = re.compile(r"\{([a-z_][a-z0-9_.]*)(?:\|(list|inline|files|n:[^:{}|]+:[^:{}|]+:[^:{}|]+))?\}")


def render(tpl: str, ctx: dict) -> str:
    """{nazwa}, {wyjście.pole} i filtry |list |inline |files |n:jeden:kilka:wiele. Nieznana nazwa zostaje widoczna (błąd łatwo zauważyć)."""
    def sub(m: re.Match) -> str:
        v = lookup(ctx, m.group(1))
        return m.group(0) if v is None else _fmt(v, m.group(2))
    return PLACEHOLDER.sub(sub, str(tpl))


def render_deep(v: Any, ctx: dict) -> Any:
    if isinstance(v, str):
        return render(v, ctx)
    if isinstance(v, dict):
        return {k: render_deep(x, ctx) for k, x in v.items()}
    if isinstance(v, list):
        return [render_deep(x, ctx) for x in v]
    return v


def clean(v: Any) -> Any:
    """Usuwa samotne połówki par zastępczych (np. ucięte emoji z odpowiedzi modelu) — inaczej zapis UTF-8 stanu przebiegu
    się wywraca („surrogates not allowed”; test na żywo 2026-10-04, krok „Szkielety plików”)."""
    if isinstance(v, str):
        return v.encode("utf-16", "surrogatepass").decode("utf-16", "replace")
    if isinstance(v, list):
        return [clean(x) for x in v]
    if isinstance(v, dict):
        return {clean(k): clean(x) for k, x in v.items()}
    return v


def _bytes(text: str) -> bytes:
    """UTF-8, które nigdy nie rzuca — ostatnia linia obrony zapisu stanu i zdarzeń."""
    return text.encode("utf-8", "replace")


def parse_json_reply(text: str) -> Any:
    t = str(text or "").strip()
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t, flags=re.I).strip()
    try:
        return json.loads(t)
    except ValueError:
        pass
    for o, c in (("{", "}"), ("[", "]")):
        i, j = t.find(o), t.rfind(c)
        if 0 <= i < j:
            try:
                return json.loads(t[i:j + 1])
            except ValueError:
                continue
    raise ValueError("odpowiedź nie jest poprawnym JSON-em")


def unsafe_path(p: Any) -> str | None:
    """Powód odrzucenia ścieżki względnej albo None, gdy bezpieczna."""
    if not isinstance(p, str) or not p.strip():
        return "pusta ścieżka"
    s = p.replace("\\", "/")
    if s.startswith("/") or re.match(r"^[A-Za-z]:", s) or s.startswith("~"):
        return f"ścieżka bezwzględna: {p}"
    if any(part in ("..", "") for part in s.split("/")) and s != ".":
        return f"niedozwolony fragment ścieżki: {p}"
    if re.search(r'[<>:"|?*\x00-\x1f]', s):
        return f"niedozwolone znaki: {p}"
    if s.split("/")[0].lower() == ".git":
        return f"zapis do .git: {p}"
    return None


class StepSkip(Exception):
    """Krok pominięty zgodnie z definicją (np. karta niepołączona przy `optional: true`)."""


class StepDenied(Exception):
    """Użytkownik nie zgodził się na krok — bez ponowień (zgody się nie obchodzi)."""


# ---------------------------------------------------------------- silnik

class WorkflowEngine:
    def __init__(self, *, defs_dir: Path, runs_dir: Path, projects_root: Path, hermes: Hermes, judge: Judge,
                 relay: Relay, emit: Emit, max_parallel: int = 2, log: Callable[..., None] = lambda *a: None):
        self.defs_dir, self.runs_dir, self.projects_root = Path(defs_dir), Path(runs_dir), Path(projects_root)
        self.hermes, self.judge, self.relay, self.emit, self.log = hermes, judge, relay, emit, log
        self.max_parallel = max_parallel
        self.runs: dict[str, dict] = {}
        self.tasks: dict[str, asyncio.Task] = {}
        self.answers: dict[str, asyncio.Future] = {}
        self._defs: dict[str, dict] = {}
        self._def_errors: dict[str, list[str]] = {}
        self._defs_sig: tuple = ()
        self.runs_dir.mkdir(parents=True, exist_ok=True)
        self._prune()

    # ------------------------------------------------ definicje
    def schema(self) -> dict:
        return json.loads((self.defs_dir / "schema.json").read_text(encoding="utf-8"))

    def definitions(self) -> dict[str, dict]:
        files = sorted(self.defs_dir.glob("*.yaml"))
        sig = tuple((f.name, f.stat().st_mtime_ns) for f in files)
        if sig == self._defs_sig:
            return self._defs
        schema, defs, errors = self.schema(), {}, {}
        for f in files:
            try:
                d = yaml.safe_load(f.read_text(encoding="utf-8"))
            except yaml.YAMLError as e:
                errors[f.name] = [f"YAML: {e}"]; continue
            errs = validate(schema, d)
            if not errs and d["id"] != f.stem:
                errs.append(f"id „{d['id']}” różni się od nazwy pliku „{f.stem}”")
            ids = [s["id"] for s in d.get("steps", [])] if isinstance(d, dict) else []
            if len(ids) != len(set(ids)):
                errs.append("powtórzone id kroków")
            if errs:
                errors[f.name] = errs
            else:
                defs[d["id"]] = d
        self._defs, self._def_errors, self._defs_sig = defs, errors, sig
        for name, errs in errors.items():
            self.log(f"workflow {name}: odrzucony — " + "; ".join(errs[:3]))
        return defs

    def list(self) -> list[dict]:
        return [{"id": d["id"], "name": d["name"], "description": d.get("description", ""), "autonomy": d["autonomy"],
                 "inputs": d.get("inputs", {}), "steps": [s["title"] for s in d["steps"]], "examples": d.get("examples", [])}
                for d in self.definitions().values()]

    # ------------------------------------------------ zapis stanu
    def _path(self, rid: str) -> Path:
        return self.runs_dir / f"{rid}.json"

    def _save(self, run: dict) -> None:
        p = self._path(run["id"])
        tmp = p.with_suffix(".tmp")
        tmp.write_bytes(_bytes(json.dumps(run, ensure_ascii=False, indent=1)))
        os.replace(tmp, p)

    def _event(self, run: dict, type_: str, **extra: Any) -> None:
        evt = {"v": 1, "type": type_, "ts": time.time(), "run_id": run["id"], "workflow": run["workflow"], "name": run["name"],
               "state": run["state"], "total": len(run["steps"]), **extra}
        try:
            with (self.runs_dir / f"{run['id']}.events.jsonl").open("ab") as f:
                f.write(_bytes(json.dumps(evt, ensure_ascii=False) + "\n"))
        except Exception as e:  # noqa: BLE001 — zapis historii nie może zatrzymać przebiegu
            self.log("workflow zapis zdarzenia:", e)
        try:
            self.emit(evt)
        except Exception as e:  # noqa: BLE001 — zdarzenie dla karty nie może zatrzymać przebiegu
            self.log("workflow emit:", e)

    def _prune(self) -> None:
        now = time.time()
        files = sorted(self.runs_dir.glob("*.json"), key=lambda f: f.stat().st_mtime, reverse=True)
        for i, f in enumerate(files):
            try:
                run = json.loads(f.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            if run.get("state") in ACTIVE:
                continue
            if i >= KEEP_RUNS or now - f.stat().st_mtime > KEEP_DAYS * 86400:
                for p in (f, f.with_name(f.stem + ".events.jsonl")):
                    p.unlink(missing_ok=True)

    # ------------------------------------------------ API
    def snapshot(self, run: dict) -> dict:
        keys = ("id", "workflow", "name", "state", "autonomy", "source", "started", "ended", "cursor", "budget", "budget_used",
                "pending", "report", "reason", "inputs")
        out = {k: run.get(k) for k in keys}
        out["steps"] = [{k: s.get(k) for k in ("id", "title", "kind", "state", "attempts", "ms", "preview", "score", "artifact")} | {"errors": s.get("errors", [])[-2:]}
                        for s in run["steps"]]
        return out

    def active(self) -> list[dict]:
        return [r for r in self.runs.values() if r["state"] in ACTIVE]

    def status(self, run_id: str | None = None) -> dict:
        if run_id:
            run = self.runs.get(run_id) or self._load(run_id)
            if not run:
                raise KeyError(f"nie ma przebiegu {run_id}")
            return self.snapshot(run)
        act = self.active()
        if act:
            return self.snapshot(act[-1])
        recent = self.recent(1)
        return recent[0] if recent else {"state": "idle"}

    def recent(self, limit: int = 20) -> list[dict]:
        out = []
        for f in sorted(self.runs_dir.glob("*.json"), key=lambda f: f.stat().st_mtime, reverse=True)[:limit]:
            run = self.runs.get(f.stem) or self._load(f.stem)
            if run:
                out.append(self.snapshot(run))
        return out

    def events_of(self, run_id: str) -> list[dict]:
        p = self.runs_dir / f"{run_id}.events.jsonl"
        if not re.fullmatch(r"[0-9a-z-]{8,40}", run_id or "") or not p.exists():
            raise KeyError(f"nie ma przebiegu {run_id}")
        return [json.loads(line) for line in p.read_text(encoding="utf-8").splitlines() if line.strip()]

    def _load(self, rid: str) -> dict | None:
        if not re.fullmatch(r"[0-9a-z-]{8,40}", rid or ""):
            return None
        try:
            return json.loads(self._path(rid).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None

    async def start(self, workflow: str, inputs: dict | None = None, autonomy: str | None = None, source: str = "desktop") -> dict:
        d = self.definitions().get(workflow)
        if not d:
            raise ValueError(f"nie ma workflow „{workflow}” (dostępne: {', '.join(self.definitions()) or 'brak'})")
        inputs = {k: str(v)[:MAX_INPUT] for k, v in (inputs or {}).items() if k in (d.get("inputs") or {})}
        missing = [k for k, spec in (d.get("inputs") or {}).items() if spec.get("required") and not inputs.get(k, "").strip()]
        if missing:
            raise ValueError("brak danych wejściowych: " + ", ".join(missing))
        if autonomy is not None and autonomy not in ("L0", "L1", "L2", "L3"):
            raise ValueError("autonomia: L0–L3")
        if any(r["workflow"] == workflow for r in self.active()):
            raise RuntimeError(f"workflow „{d['name']}” już trwa — poczekaj albo go zatrzymaj")
        if len(self.active()) >= self.max_parallel:
            raise RuntimeError(f"trwają już {self.max_parallel} przebiegi — limit równoległych workflow")
        rid = time.strftime("%Y%m%d-%H%M%S") + "-" + secrets.token_hex(2)
        run = {"id": rid, "workflow": workflow, "name": d["name"], "version": d["version"], "inputs": inputs,
               "autonomy": autonomy or d["autonomy"], "source": source, "state": "running", "started": time.time(), "ended": None,
               "cursor": {"step": 0}, "outputs": {}, "budget": d["budget"], "budget_used": {"seconds": 0.0, "steps": 0, "tokens": 0},
               "steps": [{"id": s["id"], "title": s["title"], "kind": s["kind"], "state": "pending", "attempts": 0, "ms": None,
                          "preview": "", "score": None, "errors": []} for s in d["steps"]],
               "pending": None, "report": None, "reason": None}
        self.runs[rid] = run
        self._save(run)
        self._event(run, "run.started", steps=[{"id": s["id"], "title": s["title"], "kind": s["kind"]} for s in d["steps"]],
                    autonomy=run["autonomy"], source=source)
        self.tasks[rid] = asyncio.create_task(self._execute(run))
        return self.snapshot(run)

    def resume_pending(self) -> list[str]:
        """Po restarcie mostu: przebiegi w toku wracają od zapisanego kroku (krok w toku wykonuje się ponownie)."""
        resumed = []
        for f in self.runs_dir.glob("*.json"):
            run = self._load(f.stem)
            if not run or run.get("state") not in ACTIVE or f.stem in self.tasks:
                continue
            run["state"], run["pending"] = "running", None
            self.runs[run["id"]] = run
            self._save(run)
            self._event(run, "run.resumed", step=run["cursor"]["step"])
            self.tasks[run["id"]] = asyncio.create_task(self._execute(run))
            resumed.append(run["id"])
        return resumed

    async def stop(self, run_id: str = "all") -> dict:
        targets = self.active() if run_id == "all" else [r for r in [self.runs.get(run_id)] if r and r["state"] in ACTIVE]
        for r in targets:
            t = self.tasks.get(r["id"])
            if t and not t.done():
                t.cancel()
                try:
                    await t
                except (asyncio.CancelledError, Exception):  # noqa: BLE001
                    pass
            if r["state"] in ACTIVE:   # bez zadania (np. nie wznowione) — kończymy ręcznie
                self._finish(r, "stopped", "Zatrzymane na życzenie.")
        return {"ok": True, "stopped": [r["id"] for r in targets]}

    def answer(self, run_id: str, answer: str) -> dict:
        fut = self.answers.get(run_id)
        if not fut or fut.done():
            return {"ok": False, "error": "ten przebieg nie czeka na odpowiedź"}
        fut.set_result(str(answer)[:200])
        return {"ok": True}

    def replay(self) -> list[dict]:
        """Dla karty podłączonej w trakcie: pełny stan przebiegów w toku."""
        return [{"v": 1, "type": "run.snapshot", "ts": time.time(), "run_id": r["id"], "workflow": r["workflow"], "name": r["name"],
                 "state": r["state"], "total": len(r["steps"]), "snapshot": self.snapshot(r)} for r in self.active()]

    # ------------------------------------------------ wykonanie
    def _finish(self, run: dict, state: str, reason: str | None = None) -> None:
        run.update(state=state, ended=time.time(), pending=None)
        if reason:
            run["reason"] = reason
        if state == "done":
            d = self.definitions().get(run["workflow"]) or {}
            run["report"] = render(d.get("report") or "Workflow „{name}” zakończony.", self._ctx(run) | {"name": run["name"]}).strip()
        try:
            self._save(run)
        except Exception as e:  # noqa: BLE001 — koniec przebiegu MUSI dotrzeć do karty, nawet gdy zapis zawiedzie
            self.log("workflow zapis stanu:", e)
        self._event(run, "run." + {"done": "completed", "failed": "failed", "stopped": "stopped"}[state],
                    report=run.get("report"), reason=run.get("reason"), budget_used=run["budget_used"])
        self.tasks.pop(run["id"], None)

    def _ctx(self, run: dict) -> dict:
        return {**run["inputs"], **run["outputs"]}

    def _over_budget(self, run: dict) -> str | None:
        b, u = run["budget"], run["budget_used"]
        if u["seconds"] > b["minutes"] * 60:
            return f"przekroczono budżet czasu ({b['minutes']} min)"
        if u["steps"] >= b["steps"]:
            return f"przekroczono budżet kroków ({b['steps']})"
        if b.get("tokens") and u["tokens"] > b["tokens"]:
            return f"przekroczono budżet tokenów ({b['tokens']})"
        return None

    async def _execute(self, run: dict) -> None:
        try:
            d = self.definitions().get(run["workflow"])
            if not d:
                return self._finish(run, "failed", "definicja workflow zniknęła albo jest niepoprawna")
            steps = d["steps"]
            while run["cursor"]["step"] < len(steps):
                i = run["cursor"]["step"]
                ok = await self._step(run, d, steps[i], i)
                if not ok and steps[i].get("on_fail", "stop") != "continue":
                    st = run["steps"][i]
                    return self._finish(run, "failed", run.get("reason") or f"krok „{st['title']}” nie powiódł się: " + "; ".join(st["errors"][-1:]))
                run["cursor"] = {"step": i + 1}
                self._save(run)
            self._finish(run, "done")
        except asyncio.CancelledError:
            if run["state"] in ACTIVE:
                self._finish(run, "stopped", "Zatrzymane na życzenie.")
            raise
        except Exception as e:  # noqa: BLE001
            self.log("workflow", run["id"], "błąd:", repr(e))
            if run["state"] in ACTIVE:
                self._finish(run, "failed", f"błąd silnika: {e}")

    async def _step(self, run: dict, d: dict, step: dict, i: int) -> bool:
        st, eff, autonomy = run["steps"][i], step.get("effect", "read"), run["autonomy"]
        if autonomy == "L0" and eff != "read":
            st.update(state="skipped", preview="pominięte — L0: tylko propozycja")
            self._event(run, "step.skipped", step_id=step["id"], n=i + 1, title=step["title"], kind=step["kind"], preview=st["preview"])
            return True
        if eff in ("irreversible", "external") or (autonomy == "L1" and eff == "reversible"):
            ans = await self._ask(run, step, i, f"Wykonać krok „{step['title']}” workflow „{d['name']}”?", ["Tak", "Nie"], 600, "Nie")
            if ans != "Tak":
                st.update(state="denied", preview="odmowa — krok nie wykonany")
                st["errors"].append("DENIED: brak zgody")
                run["reason"] = f"brak zgody na krok „{step['title']}”"
                self._event(run, "step.failed", step_id=step["id"], n=i + 1, title=step["title"], kind=step["kind"], reason="DENIED")
                return False
        retry = step.get("retry") or {}
        attempts = 1 + int(retry.get("max", 2 if step["kind"] == "hermes" else 0))
        hint = ""
        for attempt in range(1, attempts + 1):
            if (why := self._over_budget(run)):
                run["reason"] = why
                st["errors"].append(why)
                return False
            st.update(state="running", attempts=attempt)
            run["budget_used"]["steps"] += 1
            self._save(run)
            self._event(run, "step.started", step_id=step["id"], n=i + 1, title=step["title"], kind=step["kind"], attempt=attempt)
            t0 = time.monotonic()
            try:
                out = await self._exec(run, step, i, hint, attempt)
                errs = await self._check(run, step, out, st)
            except StepSkip as e:
                st.update(state="skipped", preview=str(e)[:160], ms=int((time.monotonic() - t0) * 1000))
                run["budget_used"]["seconds"] += time.monotonic() - t0
                self._event(run, "step.skipped", step_id=step["id"], n=i + 1, title=step["title"], kind=step["kind"], preview=st["preview"])
                return True
            except StepDenied as e:
                errs, attempts = [f"DENIED: {e}"], attempt   # odmowa narzędzia: bez ponowień i bez szukania innej drogi
            except asyncio.CancelledError:
                raise
            except Exception as e:  # noqa: BLE001
                out, errs = None, [str(e)[:300] or type(e).__name__]
            dt = time.monotonic() - t0
            run["budget_used"]["seconds"] += dt
            st["ms"] = int(dt * 1000)
            if not errs:
                if step.get("output"):
                    run["outputs"][step["output"]] = out
                st.update(state="done", preview=self._preview(out), artifact=self._artifact(out))
                self._save(run)
                self._event(run, "step.completed", step_id=step["id"], n=i + 1, title=step["title"], kind=step["kind"],
                            attempt=attempt, ms=st["ms"], preview=st["preview"], score=st.get("score"), artifact=st.get("artifact"))
                return True
            reason = "; ".join(errs)[:400]
            st["errors"].append(reason)
            if attempt < attempts:
                hint = f"UWAGA: poprzednia próba nie przeszła sprawdzenia: {reason}. {retry.get('change', '')}".strip()
                self._save(run)
                self._event(run, "step.retry", step_id=step["id"], n=i + 1, title=step["title"], kind=step["kind"], attempt=attempt, reason=reason)
                continue
            st["state"] = "failed"
            self._save(run)
            self._event(run, "step.failed", step_id=step["id"], n=i + 1, title=step["title"], kind=step["kind"], attempt=attempt, reason=reason)
            return False
        return False

    @staticmethod
    def _artifact(out: Any) -> dict | None:
        """Zwięzły podgląd wyniku kroku dla wizualizacji („co powstaje”): pola briefu, nagłówki dokumentu, drzewo plików,
        zapisany folder. Ograniczony rozmiarem — idzie zdarzeniem do karty i do pliku zdarzeń (powtórka)."""
        if isinstance(out, dict) and "root" in out and isinstance(out.get("files"), list):
            return {"kind": "files_written", "root": str(out["root"])[:260], "count": int(out.get("count") or 0),
                    "files": [str(f)[:160] for f in out["files"][:60]], "commit": str(out.get("commit") or "")[:40]}
        if isinstance(out, dict) and isinstance(out.get("pliki"), list):
            items = [f for f in out["pliki"] if isinstance(f, dict)]
            return {"kind": "tree", "paths": [str(f.get("path", ""))[:160] for f in items[:60]],
                    "filled": bool(items) and all(str(f.get("content", "")).strip() for f in items),
                    "notes": {str(f.get("path", ""))[:160]: str(f.get("cel", ""))[:120] for f in items[:60] if f.get("cel")}}
        if isinstance(out, dict):
            fields: dict[str, Any] = {}
            for k, v in list(out.items())[:10]:
                if isinstance(v, str):
                    fields[str(k)[:40]] = v[:220]
                elif isinstance(v, list):
                    fields[str(k)[:40]] = [str(x)[:120] for x in v[:8]]
                elif isinstance(v, (int, float, bool)):
                    fields[str(k)[:40]] = v
            return {"kind": "fields", "fields": fields}
        if isinstance(out, str) and out.strip():
            heads = [ln.lstrip("#").strip()[:80] for ln in out.splitlines() if ln.startswith("#")][:14]
            return {"kind": "doc", "headings": heads, "chars": len(out), "excerpt": re.sub(r"\s+", " ", out.strip())[:300]}
        return None

    @staticmethod
    def _preview(out: Any) -> str:
        if isinstance(out, dict) and "root" in out:
            return f"{out.get('count')} plików → {out.get('root')}"
        if isinstance(out, dict) and isinstance(out.get("pliki"), list):
            return f"{len(out['pliki'])} plików"
        if isinstance(out, (dict, list)):
            return json.dumps(out, ensure_ascii=False)[:160]
        return re.sub(r"\s+", " ", str(out or ""))[:160]

    async def _ask(self, run: dict, step: dict, i: int, question: str, options: list, timeout: float, default: str) -> str:
        run.update(state="waiting", pending={"step": step["id"], "question": question, "options": options})
        self._save(run)
        self._event(run, "ask.waiting", step_id=step["id"], n=i + 1, title=step["title"], question=question, options=options)
        fut = asyncio.get_running_loop().create_future()
        self.answers[run["id"]] = fut
        try:
            ans = await asyncio.wait_for(fut, timeout)
        except asyncio.TimeoutError:
            ans = default
        finally:
            self.answers.pop(run["id"], None)
        run.update(state="running", pending=None)
        self._save(run)
        self._event(run, "ask.answered", step_id=step["id"], n=i + 1, answer=ans)
        return ans

    async def _exec(self, run: dict, step: dict, i: int, hint: str, attempt: int) -> Any:
        kind, ctx = step["kind"], self._ctx(run)
        if kind == "hermes":
            d = self.definitions()[run["workflow"]]
            sys_msg = (f"Wykonujesz JEDEN krok workflow „{d['name']}”: {step['title']}. Wykonaj wyłącznie ten krok i odpowiedz bez wstępów. "
                       "Nie wywołuj narzędzi workflow_* ani narzędzi pulpitu Jarvis OS — wynik oddajesz tekstem w odpowiedzi.")
            if step.get("skills"):
                sys_msg += " Najpierw wczytaj skill(e): " + ", ".join(step["skills"]) + " i zastosuj je."
            if step.get("format") == "json":
                sys_msg += " Odpowiedz WYŁĄCZNIE poprawnym JSON-em (bez bloku kodu i komentarzy)."
            user = render(step["prompt"], ctx) + (f"\n\n{hint}" if hint else "")
            text, tokens = await self.hermes([{"role": "system", "content": sys_msg}, {"role": "user", "content": user}],
                                             f"wf-{run['id']}-{step['id']}-{attempt}", float(step.get("timeout_s", 240)))
            run["budget_used"]["tokens"] += int(tokens or 0)
            if not str(text or "").strip():
                raise ValueError("pusta odpowiedź Hermesa")
            text = clean(str(text))
            return clean(parse_json_reply(text)) if step.get("format") == "json" else text.strip()
        if kind == "check":
            return None
        if kind == "write_files":
            return await self._write_files(run, step, ctx)
        if kind == "tool":
            res = await self.relay(step["tool"], render_deep(step.get("args") or {}, ctx))
            if res.get("ok"):
                return res.get("data") if res.get("data") is not None else res.get("text")
            if res.get("code") == "DENIED":
                raise StepDenied(res.get("text") or "odmowa")
            if step.get("optional") and res.get("code") in ("OFFLINE", "TIMEOUT", "THROTTLED"):
                raise StepSkip("pominięte: " + (res.get("text") or "karta Jarvis OS niepołączona"))
            raise RuntimeError(f"{step['tool']}: {res.get('code')} {res.get('text') or ''}".strip())
        if kind == "ask":
            return await self._ask(run, step, i, render(step.get("question", ""), ctx), step.get("options") or ["Tak", "Nie"],
                                   float(step.get("timeout_s", 600)), step.get("default", ""))
        raise ValueError(f"nieznany rodzaj kroku {kind}")

    async def _write_files(self, run: dict, step: dict, ctx: dict) -> dict:
        prev = run["outputs"].get(step.get("output") or "")
        if isinstance(prev, dict) and prev.get("root"):
            root = Path(prev["root"])   # wznowienie: ten sam folder
        else:
            base = slugify(lookup(ctx, step.get("slug_from", "")) or run["inputs"].get("pomysl") or run["name"])
            root, n = self.projects_root / base, 2
            while root.exists() and any(root.iterdir()):
                root, n = self.projects_root / f"{base}-{n}", n + 1
                if n > 50:
                    raise RuntimeError("nie znaleziono wolnej nazwy folderu projektu")
        files: dict[str, str] = {}
        for f in lookup(ctx, step.get("files_from", "")) or []:
            if isinstance(f, dict) and isinstance(f.get("path"), str):
                files[f["path"].replace("\\", "/")] = str(f.get("content", ""))
        for rel, tpl in (step.get("extra_files") or {}).items():
            files[rel] = render(tpl, ctx).rstrip() + "\n"
        if not files:
            raise ValueError("brak plików do zapisania")
        for rel in files:
            if (why := unsafe_path(rel)):
                raise ValueError(why)
        root.mkdir(parents=True, exist_ok=True)
        base_resolved = root.resolve()
        for rel, content in files.items():
            target = (root / rel).resolve()
            if base_resolved not in target.parents:
                raise ValueError(f"ścieżka poza folderem projektu: {rel}")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(_bytes(content if content.endswith("\n") else content + "\n"))
        commit = await asyncio.to_thread(self._git_commit, root, step.get("git_commit") or f"Workflow {run['name']}")
        return {"root": str(root), "count": len(files), "files": sorted(files), "commit": commit}

    @staticmethod
    def _git_commit(root: Path, message: str) -> str:
        git = shutil.which("git")
        if not git:
            return "brak gita"
        ident = ["-c", "user.name=Jarvis OS", "-c", "user.email=jarvis@localhost"]
        run = lambda *a: subprocess.run([git, *a], cwd=root, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)  # noqa: E731
        if not (root / ".git").exists():
            run("init", "-q")
        run("add", "-A")
        if run("status", "--porcelain").stdout.strip():
            r = run(*ident, "commit", "-q", "-m", message)
            if r.returncode != 0:
                return "commit nieudany"
        h = run("rev-parse", "--short", "HEAD")
        return h.stdout.strip() if h.returncode == 0 else "brak"

    async def _check(self, run: dict, step: dict, out: Any, st: dict) -> list[str]:
        c = step.get("check") or {}
        if not c:
            return []
        ctx = self._ctx(run) | ({step["output"]: out} if step.get("output") else {})
        errs: list[str] = []
        if "json_schema" in c:
            errs += validate(c["json_schema"], out)[:5]
        if "sections" in c:
            missing = [s for s in c["sections"] if s not in str(out or "")]
            if missing:
                errs.append("brak sekcji: " + ", ".join(missing))
        if "paths_safe" in c:
            for f in lookup(ctx, c["paths_safe"]) or []:
                if (why := unsafe_path(f.get("path") if isinstance(f, dict) else f)):
                    errs.append(why)
        if "covers" in c:
            want = {str(f.get("path", "")).replace("\\", "/") for f in lookup(ctx, c["covers"]["from"]) or [] if isinstance(f, dict)}
            have = {str(f.get("path", "")).replace("\\", "/") for f in lookup(ctx, c["covers"]["in"]) or [] if isinstance(f, dict) and str(f.get("content", "")).strip()}
            if want - have:
                errs.append("brak treści dla: " + ", ".join(sorted(want - have)[:8]))
        if c.get("files_exist") and isinstance(out, dict):
            root = Path(out.get("root", ""))
            gone = [f for f in out.get("files", []) if not (root / f).is_file()]
            if gone:
                errs.append("nie zapisano: " + ", ".join(gone[:8]))
        if "judge" in c and not errs:
            content = out if isinstance(out, str) else json.dumps(out, ensure_ascii=False)
            try:
                score, why = await self.judge(c["judge"]["question"], content[:12000])
                st["score"] = round(float(score), 2)
                if float(score) < c["judge"]["min"]:
                    errs.append(f"ocena {float(score):.2f} < {c['judge']['min']}: {why}")
            except Exception as e:  # noqa: BLE001 — sędzia niedostępny nie blokuje przebiegu (reguły już przeszły)
                st["score"] = None
                self.log("workflow judge niedostępny:", e)
        return errs
