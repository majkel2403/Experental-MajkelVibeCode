"""Agenci lokalni Jarvis OS, zarządzani przez most:

  · WWW      — integrations/web/agent.mjs (Node, Playwright + Jev; repo moritzkremb/jev-voice-browser).
               Uruchamiany leniwie przy pierwszym użyciu; polecenia idą do niego przez HTTP z tokenem.
  · Komputer — repo awlevin/typesafe-computer-use (Python, uv): czyta ekran (UI Automation + OCR), Jev wybiera
               akcję, klika i pisze na PRAWDZIWYM Windows. Jedno zadanie naraz, w osobnym procesie; przerwanie
               = ruch myszy do lewego górnego rogu ekranu albo POST /agents/computer/stop.

Klucz i adres API: %USERPROFILE%\\.jarvis-os\\jev.env (patrz integrations\\set-key.ps1).
"""
from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
import sys
import time
import uuid
from collections import deque
from pathlib import Path

import aiohttp

REPO = Path(__file__).resolve().parent.parent
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)
MAX_GOAL = 500


def home() -> Path:
    return Path(os.environ.get("JARVIS_HOME") or Path.home() / ".jarvis-os")


def load_env_file(path: Path) -> dict[str, str]:
    """KEY=VALUE (komentarze #), bez nadpisywania niczego w środowisku procesu — zwraca słownik."""
    out: dict[str, str] = {}
    try:
        for raw in path.read_text(encoding="utf-8-sig").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            v = v.strip().strip("'\"")
            if k.strip() and v:
                out[k.strip()] = v
    except OSError:
        pass
    return out


def jev_env() -> dict[str, str]:
    return load_env_file(home() / "jev.env")


def has_key() -> bool:
    e = jev_env()
    return bool(e.get("TYPESAFE_API_KEY") or e.get("JEV_API_KEY") or os.environ.get("TYPESAFE_API_KEY"))


def openrouter_key() -> str:
    """Klucz OpenRouter z jev.env (ten sam co dla Jeva), albo pusty."""
    e = jev_env()
    return e.get("TYPESAFE_API_KEY", "") if "openrouter" in e.get("TYPESAFE_BASE_URL", "") else ""


def writer_via_proxy() -> bool:
    """Model pomocniczy idzie przez pośrednika (bridge/writer_proxy.py): darmowe modele OpenRouter z łańcuchem awaryjnym, na końcu Hermes.
    JARVIS_WRITER=direct wraca do bezpośredniej konfiguracji CLICKER_WRITER_* z jev.env."""
    return os.environ.get("JARVIS_WRITER", "proxy") != "direct" and bool(openrouter_key())


def has_writer() -> bool:
    """Model pomocniczy sterowania komputerem (wpisywanie tekstu, odpowiedź końcowa): pośrednik, albo jawnie skonfigurowany w jev.env."""
    e = jev_env()
    return writer_via_proxy() or bool(e.get("CLICKER_WRITER_BASE_URL") or e.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_API_KEY"))


def default_browser() -> str | None:
    """Nazwa domyślnej przeglądarki z rejestru Windows w formie, jaką rozumie clicker: „Google Chrome”, „Microsoft Edge”…
    albo nazwa pliku bez .exe (np. „comet”). None poza Windows lub gdy nie da się ustalić."""
    if os.name != "nt":
        return None
    try:
        import re
        import winreg

        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice") as k:
            prog_id = winreg.QueryValueEx(k, "ProgId")[0]
        with winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, prog_id + r"\shell\open\command") as k:
            command = winreg.QueryValueEx(k, "")[0]
        m = re.search(r'([^\\/"]+)\.exe', command, re.I)
        exe = m.group(1).lower() if m else ""
        return {"chrome": "Google Chrome", "msedge": "Microsoft Edge", "firefox": "Firefox", "brave": "Brave Browser"}.get(exe, exe or None)
    except OSError:
        return None


def kill_tree(pid: int) -> None:
    """Windows: zabij proces z potomkami (uv → python), inaczej zostaje sierota sterująca myszą."""
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True, creationflags=NO_WINDOW)
    else:
        try:
            os.kill(pid, 15)
        except OSError:
            pass


_JOB = None


def bind_to_bridge(pid: int) -> None:
    """Windows: dołącz proces do zadania „zabij wszystko po zamknięciu” — gdy most zginie (także „na twardo”, bez atexit),
    system zabija agenta WWW z Chromium i zadanie sterujące myszą. Bez tego zostawałyby osierocone."""
    global _JOB
    if os.name != "nt":
        return
    import ctypes
    from ctypes import wintypes

    k = ctypes.WinDLL("kernel32", use_last_error=True)
    k.CreateJobObjectW.restype = wintypes.HANDLE
    k.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
    k.OpenProcess.restype = wintypes.HANDLE
    k.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    k.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
    k.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
    k.CloseHandle.argtypes = [wintypes.HANDLE]
    if _JOB is None:
        class Basic(ctypes.Structure):
            _fields_ = [("PerProcessUserTimeLimit", ctypes.c_int64), ("PerJobUserTimeLimit", ctypes.c_int64), ("LimitFlags", wintypes.DWORD),
                        ("MinimumWorkingSetSize", ctypes.c_size_t), ("MaximumWorkingSetSize", ctypes.c_size_t), ("ActiveProcessLimit", wintypes.DWORD),
                        ("Affinity", ctypes.c_size_t), ("PriorityClass", wintypes.DWORD), ("SchedulingClass", wintypes.DWORD)]

        class Io(ctypes.Structure):
            _fields_ = [(n, ctypes.c_uint64) for n in ("ReadOps", "WriteOps", "OtherOps", "ReadBytes", "WriteBytes", "OtherBytes")]

        class Ext(ctypes.Structure):
            _fields_ = [("Basic", Basic), ("Io", Io), ("ProcessMemoryLimit", ctypes.c_size_t), ("JobMemoryLimit", ctypes.c_size_t),
                        ("PeakProcessMemoryUsed", ctypes.c_size_t), ("PeakJobMemoryUsed", ctypes.c_size_t)]

        job = k.CreateJobObjectW(None, None)
        info = Ext()
        info.Basic.LimitFlags = 0x2000   # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if not job or not k.SetInformationJobObject(job, 9, ctypes.byref(info), ctypes.sizeof(info)):   # 9 = JobObjectExtendedLimitInformation
            return
        _JOB = job
    handle = k.OpenProcess(0x0001 | 0x0100, False, pid)   # PROCESS_TERMINATE | PROCESS_SET_QUOTA
    if handle:
        k.AssignProcessToJobObject(_JOB, handle)
        k.CloseHandle(handle)


class AgentError(Exception):
    def __init__(self, message: str, status: int = 500):
        super().__init__(message)
        self.status = status


# ----------------------------------------------------------------------------- agent WWW

class WebAgent:
    def __init__(self, token: str):
        self.token = token
        self.url = os.environ.get("JARVIS_WEB_AGENT_URL", "http://127.0.0.1:8788").rstrip("/")
        self.autostart = os.environ.get("JARVIS_WEB_AUTOSTART", "1") != "0"
        self.proc: subprocess.Popen | None = None
        self._lock = asyncio.Lock()

    async def _http(self, method: str, path: str, body: dict | None = None, timeout: float = 30) -> tuple[int, dict]:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=timeout)) as s:
            async with s.request(method, self.url + path, json=body, headers={"X-Bridge-Token": self.token}) as r:
                try:
                    return r.status, await r.json(content_type=None)
                except Exception:
                    return r.status, {}

    async def up(self) -> bool:
        # Windows ponawia SYN ~2 s zanim zgłosi „odmowa” — szybki probe portu, żeby /bridge/status nie mulił, gdy agent śpi
        from urllib.parse import urlsplit
        u = urlsplit(self.url)
        try:
            _, w = await asyncio.wait_for(asyncio.open_connection(u.hostname or "127.0.0.1", u.port or 80), 0.4)
            w.close()
        except Exception:
            return False
        try:
            st, _ = await self._http("GET", "/agent/health", timeout=2)
            return st == 200
        except Exception:
            return False

    def _spawn(self) -> None:
        node = shutil.which("node")
        if not node:
            raise AgentError("Brak Node.js w PATH — agent WWW go potrzebuje (nodejs.org).", 503)
        if not has_key() and os.environ.get("JARVIS_FAKE_JEV") != "1":
            raise AgentError("Brak klucza Jeva — uruchom integrations\\set-key.ps1 (zapisze %USERPROFILE%\\.jarvis-os\\jev.env).", 503)
        script = REPO / "integrations" / "web" / "agent.mjs"
        vendor = os.environ.get("JARVIS_JEV_BROWSER") or str(home() / "vendor" / "jev-voice-browser")
        if not (Path(vendor) / "node_modules").exists():
            raise AgentError("jev-voice-browser nie jest zainstalowany — uruchom integrations\\setup.ps1.", 503)
        logs = home() / "logs"
        logs.mkdir(parents=True, exist_ok=True)
        port = self.url.rsplit(":", 1)[-1]
        env = dict(os.environ, JARVIS_BRIDGE_TOKEN=self.token, JARVIS_WEB_PORT=port)
        if getattr(self, "_log_f", None):   # crash-loop agenta otwierał nowy uchwyt przy każdym respawnie i nigdy nie zamykał starego
            try:
                self._log_f.close()
            except OSError:
                pass
        self._log_f = open(logs / "web-agent.log", "ab")
        self.proc = subprocess.Popen([node, str(script)], cwd=str(REPO), env=env, stdout=self._log_f, stderr=self._log_f, creationflags=NO_WINDOW)
        bind_to_bridge(self.proc.pid)

    async def ensure(self) -> None:
        """Agent WWW działa? Jeśli nie — uruchom i poczekaj na gotowość (start Chromium ~3–10 s)."""
        async with self._lock:
            if await self.up():
                return
            if not self.autostart:
                raise AgentError("Agent WWW nie działa (JARVIS_WEB_AUTOSTART=0).", 503)
            if self.proc is None or self.proc.poll() is not None:
                self._spawn()
            for _ in range(120):
                await asyncio.sleep(0.25)
                if await self.up():
                    return
                if self.proc and self.proc.poll() is not None:
                    tail = ""
                    try:
                        tail = (home() / "logs" / "web-agent.log").read_text(encoding="utf-8", errors="replace")[-400:]
                    except OSError:
                        pass
                    raise AgentError("Agent WWW zakończył się przy starcie: " + tail.strip().splitlines()[-1] if tail.strip() else "Agent WWW zakończył się przy starcie.", 503)
            raise AgentError("Agent WWW nie wystartował w 30 s.", 503)

    async def call(self, method: str, path: str, body: dict | None = None, timeout: float = 70) -> dict:
        await self.ensure()
        try:
            st, data = await self._http(method, path, body, timeout)
        except asyncio.TimeoutError:
            raise AgentError("Agent WWW nie odpowiedział w porę.", 504)
        except aiohttp.ClientError as e:
            raise AgentError(f"Agent WWW niedostępny: {e}", 503)
        if st >= 400:
            raise AgentError(str(data.get("error") or f"agent WWW: HTTP {st}"), st if st in (400, 401, 403, 404, 409) else 502)
        return data

    def stop(self) -> None:
        if self.proc and self.proc.poll() is None:
            kill_tree(self.proc.pid)

    def status(self) -> dict:
        return {"autostart": self.autostart, "spawned": bool(self.proc and self.proc.poll() is None)}


# ----------------------------------------------------------------------------- sterowanie komputerem

class ComputerAgent:
    def __init__(self, token: str = ""):
        self.token = token
        self.run: dict | None = None
        self._proc: asyncio.subprocess.Process | None = None
        self._log: deque[str] = deque(maxlen=300)
        self._task: asyncio.Task | None = None

    @staticmethod
    def project() -> Path:
        return Path(os.environ.get("JARVIS_COMPUTER_PROJECT") or home() / "vendor" / "typesafe-computer-use")

    def installed(self) -> bool:
        return bool(os.environ.get("JARVIS_COMPUTER_CMD")) or (self.project() / "pyproject.toml").exists() and (self.project() / ".venv").exists()

    def _command(self, goal: str, steps: int, delay: float, out: Path) -> list[str]:
        override = os.environ.get("JARVIS_COMPUTER_CMD")   # testy: własny program zamiast clickera
        if override:
            return [c.format(goal=goal, steps=steps, delay=delay, out=out) for c in json.loads(override)]
        uv = shutil.which("uv") or str(Path.home() / ".hermes" / "bin" / "uv.exe")
        # nasze rozszerzenia (uruchamianie programów, szybki adres przeglądarki) nakładane w locie; JARVIS_COMPUTER_STOCK=1 = czysty program autora
        entry = ["-m", "typesafe_computer_use"] if os.environ.get("JARVIS_COMPUTER_STOCK") == "1" else [str(REPO / "integrations" / "computer" / "jarvis_clicker.py")]
        return [uv, "run", "--project", str(self.project()), "python", *entry, goal, "--act",
                "--steps", str(steps), "--delay", str(delay), "--out", str(out)]

    def running(self) -> bool:
        return bool(self.run and self.run["state"] == "running")

    def prune(self, keep: int = 5) -> None:
        """Zrzuty ekranu z zadań mogą zawierać prywatne dane — zostaw tylko kilka ostatnich uruchomień."""
        d = home() / "runs"
        if not d.is_dir():
            return
        for old in sorted((p for p in d.iterdir() if p.is_dir()), key=lambda p: p.stat().st_mtime)[:-keep]:
            shutil.rmtree(old, ignore_errors=True)

    async def start(self, goal: str, steps: int = 25, delay: float = 1.5) -> dict:
        goal = " ".join(str(goal or "").split())[:MAX_GOAL]
        if not goal:
            raise AgentError("Brak celu (goal).", 400)
        if self.running():
            raise AgentError("Poprzednie zadanie jeszcze trwa — zatrzymaj je albo poczekaj.", 409)
        if not self.installed():
            raise AgentError("typesafe-computer-use nie jest zainstalowany — uruchom integrations\\setup.ps1.", 503)
        if not has_key() and not os.environ.get("JARVIS_COMPUTER_CMD"):
            raise AgentError("Brak klucza Jeva — uruchom integrations\\set-key.ps1.", 503)
        steps = max(1, min(int(steps), 60))
        delay = max(0.3, min(float(delay), 10.0))
        rid = time.strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:4]
        out = home() / "runs" / rid
        self.prune()
        env = dict(os.environ)
        env.update(jev_env())
        env.setdefault("CLICKER_OCR_LANGUAGE", "pl")
        if writer_via_proxy() and self.token:   # model pomocniczy: pośrednik na moście (darmowe modele → Hermes), bez zrzutów ekranu
            port = os.environ.get("JARVIS_BRIDGE_PORT", "8651")
            env.update(CLICKER_WRITER_API="openai", CLICKER_WRITER_BASE_URL=f"http://127.0.0.1:{port}/writer/v1", CLICKER_WRITER_API_KEY=self.token,
                       CLICKER_WRITER_MODEL="writer", CLICKER_ANSWER_MODEL="writer", CLICKER_WRITER_VISION="false")
        browser = default_browser()
        if browser:
            env.setdefault("CLICKER_BROWSER", browser)   # domyślnie program zakłada „Google Chrome”, a użytkownik może mieć np. Comet
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUNBUFFERED"] = "1"
        self._log.clear()
        self.run = {"id": rid, "goal": goal, "steps": steps, "state": "running", "startedAt": time.time(), "endedAt": None, "exitCode": None, "outcome": None, "answer": None, "achieved": None, "stepsTaken": None}
        try:
            self._proc = await asyncio.create_subprocess_exec(*self._command(goal, steps, delay, out), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
                                                            env=env, cwd=str(self.project()) if self.project().exists() else None, creationflags=NO_WINDOW)
        except OSError as e:
            self.run.update(state="failed", endedAt=time.time(), outcome=f"nie udało się uruchomić: {e}")
            raise AgentError(f"Nie udało się uruchomić sterowania komputerem: {e}", 500)
        bind_to_bridge(self._proc.pid)
        self._task = asyncio.create_task(self._watch(self.run, out, steps, delay))
        return self.snapshot()

    async def _watch(self, r: dict, out: Path, steps: int, delay: float) -> None:
        proc = self._proc
        assert proc and proc.stdout
        limit = steps * (delay + 25) + 60   # twardy limit czasu: kroki × (opóźnienie + czas modeli) + zapas
        async def read() -> None:
            async for raw in proc.stdout:  # type: ignore[union-attr]
                self._log.append(raw.decode("utf-8", errors="replace").rstrip())
        try:
            try:
                await asyncio.wait_for(read(), limit)
                await proc.wait()
            except asyncio.TimeoutError:
                kill_tree(proc.pid)
                self._log.append(f"[jarvis] przekroczono limit czasu {int(limit)} s — zatrzymano")
                r["state"] = "stopped"
                try:
                    await asyncio.wait_for(proc.wait(), 5)   # dożnij proces po kill_tree (bez tego zombie na POSIX)
                except asyncio.TimeoutError:
                    pass
            rc = proc.returncode
            r["exitCode"], r["endedAt"] = rc, time.time()
            summary = out / "run.json"
            if summary.exists():
                try:
                    j = json.loads(summary.read_text(encoding="utf-8"))
                    r.update(outcome=j.get("outcome"), answer=j.get("answer"), achieved=j.get("goal_achieved"), stepsTaken=j.get("steps_taken"))
                except (OSError, ValueError):
                    pass
            if r["state"] == "running":   # „stopped” (limit czasu, stop) zostaje; reszta wynika z kodu wyjścia
                if rc == 130 or str(r.get("outcome") or "").startswith("aborted"):
                    r["state"] = "aborted"
                elif rc == 0:
                    r["state"] = "done"
                else:
                    r["state"] = "failed"
        except Exception as e:  # noqa: BLE001 — watcher nie może umrzeć po cichu: stan „running” dawał 409 każdemu kolejnemu zadaniu aż do restartu mostu
            try:
                kill_tree(proc.pid)
            except Exception:  # noqa: BLE001
                pass
            self._log.append(f"[jarvis] watcher zadania padł: {e!r} — zadanie oznaczone jako failed")
            r.update(state="failed", endedAt=r.get("endedAt") or time.time(),
                     outcome=r.get("outcome") or f"watcher: {e!r}")

    def snapshot(self, tail: int = 25) -> dict:
        if not self.run:
            return {"state": "idle"}
        r = dict(self.run)
        r["seconds"] = round((r["endedAt"] or time.time()) - r["startedAt"], 1)
        r["log"] = list(self._log)[-tail:]
        return r

    async def stop(self) -> dict:
        if self._proc and self._proc.returncode is None:
            kill_tree(self._proc.pid)
            if self.run:
                self.run["state"] = "stopped"
            try:
                await asyncio.wait_for(self._proc.wait(), 5)
            except asyncio.TimeoutError:
                pass
        return self.snapshot()


PLANNER_MODELS = ["thinkingmachines/inkling:free", "nvidia/nemotron-3-super-120b-a12b:free", "dots-studio/dots-3-note-preview:free", "qwen/qwen3.8-27b:free"]


def planner_models() -> list[str]:
    env = os.environ.get("JARVIS_PLANNER_MODELS", "")
    return [m.strip() for m in env.split(",") if m.strip()] or list(PLANNER_MODELS)


async def plan_step(messages: list[dict]) -> tuple[str, str]:
    """Model planujący zadania w internecie: darmowe modele OpenRouter (mocniejsze najpierw — planowanie jest trudniejsze niż
    wpisywanie tekstu), na końcu Hermes. Lista: JARVIS_PLANNER_MODELS."""
    import writer_proxy  # noqa: PLC0415 — moduł z katalogu bridge/
    reply, used = await writer_proxy.complete({"model": "planner", "messages": messages, "max_tokens": 600}, openrouter_key(),
                                              log=lambda *a: print("[jarvis-bridge]", *a, file=sys.stderr), models=planner_models(), timeout=20)
    return str(((reply.get("choices") or [{}])[0].get("message") or {}).get("content") or ""), used


class Agents:
    def __init__(self, token: str):
        from web_task import WebTask  # noqa: PLC0415
        self.web = WebAgent(token)
        self.computer = ComputerAgent(token)
        self.webtask = WebTask(lambda m, p, b, t: self.web.call(m, p, b, t), plan_step, log=lambda *a: print("[jarvis-bridge]", *a, file=sys.stderr))

    def shutdown(self) -> None:
        # wołane z atexit: pętla zdarzeń już nie żyje — każdy krok osobno, żeby jeden wyjątek nie zostawił sieroty ruszającej myszą
        try:
            if self.webtask._task and not self.webtask._task.done():
                self.webtask._task.cancel()
        except Exception:  # noqa: BLE001
            pass
        try:
            self.web.stop()
        except Exception:  # noqa: BLE001
            pass
        try:
            if self.computer._proc and self.computer._proc.returncode is None:
                kill_tree(self.computer._proc.pid)
        except Exception:  # noqa: BLE001
            pass

    async def status(self) -> dict:
        web = self.web.status()
        web["up"] = await self.web.up()
        return {"key": has_key(), "web": web, "computer": {"installed": self.computer.installed(), "running": self.computer.running(), "writer": has_writer()},
                "webtask": {"running": self.webtask.running(), "planner": has_writer()}}
