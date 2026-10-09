"""Test mostu: agent WWW (pośrednik) i sterowanie komputerem — bez klucza, bez ruszania Twojej myszy.

  %USERPROFILE%\\.hermes\\hermes-agent\\venv\\Scripts\\python.exe bridge\\test_agents.py

Komputer: atrapa programu (bridge/fake_computer.py) zamiast clickera. WWW: atrapa serwera HTTP; na końcu — jeśli jest
zainstalowany jev-voice-browser — prawdziwy agent Node (headless Chromium + atrapa Jeva) uruchomiony przez most.
"""
import asyncio
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import aiohttp
from aiohttp import web

HERE = Path(__file__).parent
PORT, STUB_PORT, REAL_PORT = 18661, 18662, 18663
TOKEN = "test-token-agents"
BASE = f"http://127.0.0.1:{PORT}"
H = {"X-Bridge-Token": TOKEN}
fails: list[str] = []


def check(name, cond, extra=""):
    print(("  ok   " if cond else "  FAIL ") + name + (f"  [{extra}]" if extra and not cond else ""))
    if not cond:
        fails.append(name)


async def j(s, method, path, body=None, headers=H):
    async with s.request(method, BASE + path, json=body, headers=headers) as r:
        try:
            return r.status, await r.json(content_type=None)
        except Exception:
            return r.status, None


async def wait_state(s, want, timeout=15):
    t0 = time.time()
    while time.time() - t0 < timeout:
        st, d = await j(s, "GET", "/agents/computer/status")
        if d and d.get("state") in want:
            return d
        await asyncio.sleep(0.2)
    return d


async def start_bridge(env_extra, port=PORT):
    home = tempfile.mkdtemp(prefix="jarvis-home-")
    env = dict(os.environ, JARVIS_BRIDGE_TOKEN=TOKEN, JARVIS_BRIDGE_PORT=str(port), JARVIS_HOME=home, **env_extra)
    proc = subprocess.Popen([sys.executable, str(HERE / "jarvis_bridge.py")], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    async with aiohttp.ClientSession() as s:
        for _ in range(360):   # import mcp bywa wolny (antywirus): do 90 s
            try:
                async with s.get(f"http://127.0.0.1:{port}/bridge/status") as r:
                    if r.status in (200, 401):
                        return proc, home
            except Exception:
                await asyncio.sleep(0.25)
    proc.kill()
    raise RuntimeError("most nie wystartował: " + proc.stderr.read().decode()[:400])


def stop_bridge(proc):
    proc.terminate()
    try:
        proc.wait(8)
    except subprocess.TimeoutExpired:
        proc.kill()


async def main():
    cmd = json.dumps([sys.executable, str(HERE / "fake_computer.py"), "{goal}", "{out}"])
    seen = {"calls": []}

    async def stub(request: web.Request):   # atrapa agenta WWW
        seen["calls"].append((request.method, request.path_qs, request.headers.get("X-Bridge-Token"), await request.text()))
        if request.path == "/agent/health":
            return web.json_response({"ok": True})
        if request.path == "/agent/goto":
            return web.json_response({"error": "dozwolone tylko http/https"}, status=400)
        if request.path == "/agent/pick":
            return web.json_response({"error": "konflikt"}, status=409)
        return web.json_response({"status": "done", "summary": "open example.com", "page": {"url": "https://example.com/", "title": "Example"}})

    app = web.Application()
    app.router.add_route("*", "/{tail:.*}", stub)
    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, "127.0.0.1", STUB_PORT).start()

    proc, home = await start_bridge({"JARVIS_COMPUTER_CMD": cmd, "JARVIS_WEB_AGENT_URL": f"http://127.0.0.1:{STUB_PORT}", "JARVIS_WEB_AUTOSTART": "0"})
    try:
        async with aiohttp.ClientSession() as s:
            print("Autoryzacja")
            check("status agentów bez tokenu = 401", (await j(s, "GET", "/agents/status", headers={}))[0] == 401)
            check("komputer/run bez tokenu = 401", (await j(s, "POST", "/agents/computer/run", {"goal": "x"}, headers={}))[0] == 401)
            check("web/command bez tokenu = 401", (await j(s, "POST", "/agents/web/command", {"text": "x"}, headers={}))[0] == 401)
            async with s.options(BASE + "/agents/web/command", headers={"Origin": "http://localhost:4000", "Access-Control-Request-Private-Network": "true"}) as r:
                check("preflight + PNA dla dozwolonego Origin", r.headers.get("access-control-allow-origin") == "http://localhost:4000" and r.headers.get("access-control-allow-private-network") == "true")
            async with s.options(BASE + "/agents/web/command", headers={"Origin": "http://evil.example"}) as r:
                check("obcy Origin bez CORS", "access-control-allow-origin" not in r.headers)
            st, d = await j(s, "GET", "/agents/status")
            check("status: klucz/komputer/web", st == 200 and set(d) >= {"key", "web", "computer"} and d["computer"]["installed"] is True and d["web"]["up"] is True, json.dumps(d))
            st, d = await j(s, "GET", "/bridge/status")
            check("/bridge/status niesie sekcję agents", st == 200 and d.get("agents", {}).get("web", {}).get("up") is True, json.dumps(d)[:200])

            print("\nSterowanie komputerem (atrapa)")
            check("pusty cel = 400", (await j(s, "POST", "/agents/computer/run", {"goal": "  "}))[0] == 400)
            st, d = await j(s, "POST", "/agents/computer/run", {"goal": "open Notepad", "steps": 999})
            check("start zwraca running", st == 200 and d["state"] == "running" and d["steps"] == 60, json.dumps(d))
            st, d2 = await j(s, "POST", "/agents/computer/run", {"goal": "drugie"})
            check("drugie zadanie w trakcie = 409", st == 409, json.dumps(d2))
            d = await wait_state(s, {"done", "failed", "aborted", "stopped"})
            check("kończy się done, kod 0", d["state"] == "done" and d["exitCode"] == 0, json.dumps(d)[:300])
            check("wynik z run.json (outcome, answer, kroki)", d["outcome"] == "done" and "Gotowe" in d["answer"] and d["stepsTaken"] == 2 and d["achieved"] is True, json.dumps(d)[:300])
            check("log zawiera kroki programu", any("step 2" in x for x in d["log"]), str(d["log"]))

            st, _ = await j(s, "POST", "/agents/computer/run", {"goal": "abort test"})
            d = await wait_state(s, {"done", "failed", "aborted", "stopped"})
            check("przerwanie myszą (kod 130) = aborted", d["state"] == "aborted", json.dumps(d)[:200])
            await j(s, "POST", "/agents/computer/run", {"goal": "fail test"})
            d = await wait_state(s, {"done", "failed", "aborted", "stopped"})
            check("kod 1 = failed", d["state"] == "failed", json.dumps(d)[:200])

            await j(s, "POST", "/agents/computer/run", {"goal": "hang forever"})
            await asyncio.sleep(1.0)
            t0 = time.time()
            st, d = await j(s, "POST", "/agents/computer/stop")
            d = await wait_state(s, {"done", "failed", "aborted", "stopped"}, 10)
            check("stop zatrzymuje wiszące zadanie < 6 s", d["state"] == "stopped" and time.time() - t0 < 6, json.dumps(d)[:200])
            st, d = await j(s, "POST", "/agents/computer/run", {"goal": "po zatrzymaniu"})
            check("po stopie można zacząć nowe", st == 200)
            await wait_state(s, {"done", "failed", "aborted", "stopped"})
            check("nieznana akcja = 404", (await j(s, "POST", "/agents/computer/nope"))[0] == 404)
            runs = list((Path(home) / "runs").glob("*"))
            check("foldery uruchomień powstają i są przycinane (≤ 5)", 1 <= len(runs) <= 5, str(len(runs)))

            print("\nAgent WWW: pośrednik")
            st, d = await j(s, "POST", "/agents/web/command", {"text": "go to example.com"})
            check("command przechodzi do agenta", st == 200 and d["status"] == "done", json.dumps(d))
            call = [c for c in seen["calls"] if c[1] == "/agent/command"][-1]
            check("token mostu przekazany agentowi, treść nienaruszona", call[2] == TOKEN and json.loads(call[3]) == {"text": "go to example.com"}, str(call))
            st, d = await j(s, "GET", "/agents/web/read?max=500")
            check("GET read z parametrem max", st == 200 and any(c[1] == "/agent/read?max=500" for c in seen["calls"]), str(seen["calls"][-2:]))
            check("błąd 400 agenta wraca jako 400", (await j(s, "POST", "/agents/web/goto", {"url": "javascript:x"}))[0] == 400)
            check("błąd 409 agenta wraca jako 409", (await j(s, "POST", "/agents/web/pick", {"n": 1}))[0] == 409)
            check("zła metoda = 404", (await j(s, "GET", "/agents/web/command"))[0] == 404)
            check("nieznana akcja = 404", (await j(s, "POST", "/agents/web/rm-rf", {}))[0] == 404)
    finally:
        stop_bridge(proc)
        await runner.cleanup()

    print("\nAgent WWW niedostępny (autostart wyłączony)")
    proc, _ = await start_bridge({"JARVIS_COMPUTER_CMD": cmd, "JARVIS_WEB_AGENT_URL": "http://127.0.0.1:18669", "JARVIS_WEB_AUTOSTART": "0"})
    try:
        async with aiohttp.ClientSession() as s:
            st, d = await j(s, "POST", "/agents/web/command", {"text": "go back"})
            check("brak agenta = 503 z czytelnym błędem", st == 503 and "nie działa" in d["error"], json.dumps(d))
            st, d = await j(s, "GET", "/agents/status")
            check("status pokazuje web.up=false", st == 200 and d["web"]["up"] is False)
    finally:
        stop_bridge(proc)

    vendor = Path(os.environ.get("JARVIS_JEV_BROWSER") or Path.home() / ".jarvis-os" / "vendor" / "jev-voice-browser")
    if (vendor / "node_modules").exists():
        print("\nPełny łańcuch: most → autostart prawdziwego agenta Node (headless Chromium + atrapa Jeva)")
        site_app = web.Application()
        site_app.router.add_get("/", lambda r: web.Response(text="<title>Strona testowa</title><h1>Witaj</h1><a href='/x'>First result</a>", content_type="text/html"))
        site_app.router.add_get("/x", lambda r: web.Response(text="<title>Wynik X</title><p>Treść X</p>", content_type="text/html"))
        sr = web.AppRunner(site_app)
        await sr.setup()
        await web.TCPSite(sr, "127.0.0.1", 18664).start()
        proc, home = await start_bridge({"JARVIS_WEB_AGENT_URL": f"http://127.0.0.1:{REAL_PORT}", "JARVIS_FAKE_JEV": "1", "JARVIS_WEB_HEADLESS": "1", "JARVIS_JEV_BROWSER": str(vendor)})
        try:
            async with aiohttp.ClientSession() as s:
                t0 = time.time()
                st, d = await j(s, "POST", "/agents/web/goto", {"url": "http://127.0.0.1:18664/"})
                check("pierwsze użycie samo uruchamia agenta i otwiera stronę", st == 200 and d["status"] == "done" and d["page"]["title"] == "Strona testowa", f"{st} {json.dumps(d)}")
                print(f"       (start agenta + Chromium: {time.time() - t0:.1f} s)")
                t0 = time.time()
                st, d = await j(s, "POST", "/agents/web/command", {"text": "click the first result"})
                check("polecenie „click the first result” klika link", st == 200 and d["status"] == "done" and d["page"]["url"].endswith("/x"), json.dumps(d))
                print(f"       (polecenie: {int((time.time() - t0) * 1000)} ms, decyzja atrapy {d.get('decision', {}).get('jevMs')} ms)")
                st, d = await j(s, "GET", "/agents/web/read")
                check("read zwraca tekst strony", st == 200 and "Treść X" in d["text"], json.dumps(d))
                st, d = await j(s, "GET", "/agents/status")
                check("status: agent uruchomiony przez most", d["web"]["up"] is True and d["web"]["spawned"] is True, json.dumps(d))
        finally:
            stop_bridge(proc)
            await sr.cleanup()
        await asyncio.sleep(1.5)
        try:
            async with aiohttp.ClientSession() as s2, s2.get(f"http://127.0.0.1:{REAL_PORT}/agent/health", headers=H, timeout=aiohttp.ClientTimeout(total=2)):
                alive = True
        except Exception:
            alive = False
        check("po zamknięciu mostu agent WWW też się kończy", not alive)
    else:
        print("\n(pominięto pełny łańcuch: jev-voice-browser nie jest zainstalowany)")

    print("\n" + ("WSZYSTKO OK" if not fails else f"BŁĘDY ({len(fails)}): " + ", ".join(fails)))
    sys.exit(1 if fails else 0)


asyncio.run(main())
