"""Test integracyjny mostu: symulowana przeglądarka (SSE) + prawdziwy klient MCP.

  %USERPROFILE%\\.hermes\\hermes-agent\\venv\\Scripts\\python.exe bridge\\test_bridge.py
"""
import asyncio
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import aiohttp
from aiohttp import web
import httpx2
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

HERE = Path(__file__).parent
PORT = int(os.environ.get("TEST_PORT", "18651"))
TOKEN = "test-token-123"
BASE = f"http://127.0.0.1:{PORT}"
fails = []


def check(name, cond, extra=""):
    print(("  ok   " if cond else "  FAIL ") + name + (f"  [{extra}]" if extra and not cond else ""))
    if not cond:
        fails.append(name)


async def fake_browser(seen, stop):
    """Udaje kartę Jarvis OS: odbiera polecenia i odsyła wyniki."""
    async with aiohttp.ClientSession() as s:
        async with s.get(f"{BASE}/bridge/events?token={TOKEN}", headers={"Origin": "http://localhost:4000"}) as r:
            seen["cors"] = r.headers.get("Access-Control-Allow-Origin")
            event = None
            async for raw in r.content:
                line = raw.decode().rstrip("\n")
                if line.startswith("event:"):
                    event = line[6:].strip()
                elif line.startswith("data:") and event == "agent":
                    seen.setdefault("agent", []).append(json.loads(line[5:]))
                elif line.startswith("data:") and event == "cmd":
                    cmd = json.loads(line[5:])
                    seen.setdefault("cmds", []).append(cmd)
                    if cmd["name"] == "boom" or (cmd.get("args") or {}).get("title") == "__fail__":
                        res = {"id": cmd["id"], "ok": False, "text": "Nie ma takiego okna"}
                    elif cmd["name"] == "slow":
                        continue
                    else:
                        res = {"id": cmd["id"], "ok": True, "text": f"wykonano {cmd['name']} {json.dumps(cmd['args'], ensure_ascii=False)}"}
                    await s.post(f"{BASE}/bridge/result", json=res, headers={"X-Bridge-Token": TOKEN})
                elif line.startswith("event: hello") or (event == "hello" and line.startswith("data:")):
                    seen["hello"] = json.loads(line[5:]) if line.startswith("data:") else None
                    seen["ready"] = True
                if stop.is_set():
                    return


async def sse_client(respond, info):
    """Druga/trzecia „karta”: zapisuje swoje id z hello; opcjonalnie odpowiada na polecenia."""
    async with aiohttp.ClientSession() as s:
        async with s.get(f"{BASE}/bridge/events?token={TOKEN}", headers={"Origin": "http://localhost:4000"}) as r:
            event = None
            async for raw in r.content:
                line = raw.decode().strip()
                if line.startswith("event:"):
                    event = line[6:].strip()
                elif line.startswith("data:"):
                    data = json.loads(line[5:])
                    if event == "hello":
                        info["id"] = data["client"]
                    elif event == "agent":
                        info.setdefault("agent", []).append(data)
                    elif event == "cmd":
                        info["got"] = info.get("got", 0) + 1
                        if respond:
                            await s.post(f"{BASE}/bridge/result", json={"id": data["id"], "ok": True, "text": "odp z widocznej"}, headers={"X-Bridge-Token": TOKEN})


async def fake_gateway(seen_gw):
    """Udaje gateway Hermesa: zapamiętuje nagłówek Authorization, odpowiada strumieniem SSE."""
    async def chat(request):
        seen_gw["auth"] = request.headers.get("Authorization")
        seen_gw["body"] = await request.json()
        resp = web.StreamResponse(headers={"Content-Type": "text/event-stream"})
        await resp.prepare(request)
        await resp.write(b'data: {"choices":[{"delta":{"content":"cze"}}]}\n\n')
        await resp.write(b"data: [DONE]\n\n")
        return resp
    async def models(request):
        seen_gw["auth_models"] = request.headers.get("Authorization")
        return web.json_response({"data": [{"id": "jarvis-desktop"}]})
    app = web.Application()
    app.router.add_post("/v1/chat/completions", chat)
    app.router.add_get("/v1/models", models)
    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, "127.0.0.1", PORT + 1).start()
    return runner


async def main():
    seen_gw: dict = {}
    gw_runner = await fake_gateway(seen_gw)
    tools_copy = Path(tempfile.mkdtemp()) / "tools.json"
    tools_copy.write_text((HERE / "tools.json").read_text(encoding="utf-8"), encoding="utf-8")
    expected = json.loads(tools_copy.read_text(encoding="utf-8"))
    tmp = Path(tempfile.mkdtemp())
    (tmp / "hermes.env").write_text("API_SERVER_KEY=hermes-test-key\n", encoding="utf-8")
    env = dict(os.environ, JARVIS_BRIDGE_TOKEN=TOKEN, JARVIS_BRIDGE_PORT=str(PORT), JARVIS_BRIDGE_CALL_TIMEOUT="3", JARVIS_BRIDGE_TOOLS_FILE=str(tools_copy),
               JARVIS_HERMES_ENV=str(tmp / "hermes.env"), JARVIS_TASKLOG=str(tmp / "tasks.jsonl"),
               JARVIS_HERMES_URL=f"http://127.0.0.1:{PORT + 1}/v1",
               JARVIS_WORKFLOW_RUNS=str(tmp / "wf-runs"), JARVIS_PROJECTS_ROOT=str(tmp / "projects"))
    proc = subprocess.Popen([sys.executable, str(HERE / "jarvis_bridge.py")], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        async with httpx2.AsyncClient() as hc:
            for _ in range(360):   # import mcp bywa wolny (antywirus): do 90 s
                try:
                    if (await hc.get(f"{BASE}/bridge/status")).status_code in (200, 401):
                        break
                except Exception:
                    await asyncio.sleep(0.25)
            else:
                proc.kill(); raise RuntimeError("most nie wystartował: " + proc.stderr.read().decode()[:400])

            print("Hermes dla karty i dziennik zadań")
            H = {"Origin": "http://localhost:4000", "X-Bridge-Token": TOKEN}
            check("/bridge/hermes bez tokenu = 401", (await hc.get(f"{BASE}/bridge/hermes", headers={"Origin": "http://localhost:4000"})).status_code == 401)
            check("/bridge/hermes z obcej strony = 401", (await hc.get(f"{BASE}/bridge/hermes", headers={"Origin": "https://zla.example", "X-Bridge-Token": TOKEN})).status_code == 401)
            hj = (await hc.get(f"{BASE}/bridge/hermes", headers=H)).json()
            check("/bridge/hermes: adres pośrednika i model, BEZ klucza gatewaya", hj.get("key") == "" and hj.get("proxy") is True and hj.get("model") == "jarvis-desktop" and hj.get("url", "").endswith("/bridge/v1"), str(hj))
            print("Pośrednik Hermesa (/bridge/v1)")
            check("/bridge/v1 bez tokenu = 401", (await hc.post(f"{BASE}/bridge/v1/chat/completions", json={}, headers={"Origin": "http://localhost:4000"})).status_code == 401)
            check("/bridge/v1 z obcej strony = 401", (await hc.post(f"{BASE}/bridge/v1/chat/completions", json={}, headers={"Origin": "https://zla.example", "X-Bridge-Token": TOKEN})).status_code == 401)
            pr = await hc.post(f"{BASE}/bridge/v1/chat/completions", json={"model": "jarvis-desktop", "stream": True, "messages": [{"role": "user", "content": "hej"}]}, headers=H)
            check("/bridge/v1/chat/completions: strumień z gatewaya", pr.status_code == 200 and "[DONE]" in pr.text and "cze" in pr.text, pr.text[:200])
            check("klucz gatewaya dokłada most (nie przeglądarka)", seen_gw.get("auth") == "Bearer hermes-test-key" and seen_gw.get("body", {}).get("messages", [{}])[0].get("content") == "hej", str(seen_gw.get("auth")))
            check("CORS dla karty na odpowiedzi pośrednika", pr.headers.get("access-control-allow-origin") == "http://localhost:4000")
            pm = await hc.get(f"{BASE}/bridge/v1/models", headers=H)
            check("/bridge/v1/models", pm.status_code == 200 and seen_gw.get("auth_models") == "Bearer hermes-test-key", pm.text[:120])
            check("/bridge/tasklog bez tokenu = 401", (await hc.post(f"{BASE}/bridge/tasklog", json={"text": "x"})).status_code == 401)
            await hc.post(f"{BASE}/bridge/tasklog", json={"ts": 1, "text": "otwórz youtube i puść", "route": "local", "fail": "pół zadania (odmowa)", "evil": "x"}, headers={"X-Bridge-Token": TOKEN})
            rec = json.loads((tmp / "tasks.jsonl").read_text(encoding="utf-8").splitlines()[-1])
            check("dziennik zapisany na dysk (tylko znane pola, polskie znaki)", rec.get("text") == "otwórz youtube i puść" and rec.get("fail") and "evil" not in rec, str(rec))
            wt = await hc.get(f"{BASE}/agents/webtask/status", headers={"X-Bridge-Token": TOKEN})
            check("/agents/webtask/status: bezczynne", wt.status_code == 200 and wt.json().get("state") == "idle", wt.text[:200])
            check("/agents/webtask/run bez celu = 400", (await hc.post(f"{BASE}/agents/webtask/run", json={}, headers={"X-Bridge-Token": TOKEN})).status_code == 400)
            check("/agents/webtask/confirm bez zadania = nic", (await hc.post(f"{BASE}/agents/webtask/confirm", json={"accept": True}, headers={"X-Bridge-Token": TOKEN})).json().get("ok") is False)
            print("Stan komputera (system_info, tylko odczyt)")
            check("/bridge/system bez tokenu = 401", (await hc.get(f"{BASE}/bridge/system")).status_code == 401)
            sy = await hc.get(f"{BASE}/bridge/system?drive=C&processes=2", headers={"X-Bridge-Token": TOKEN})
            sj = sy.json() if sy.status_code == 200 else {}
            check("/bridge/system: dysk, pamięć i tekst po polsku", sy.status_code == 200 and sj.get("ok") and isinstance(sj["data"].get("disks"), list) and sj["data"].get("memory") and "wolne" in sj.get("text", ""), sy.text[:300])
            check("/bridge/system: zły dysk = 400", (await hc.get(f"{BASE}/bridge/system?drive=C:%5Cwindows", headers={"X-Bridge-Token": TOKEN})).status_code == 400)
            check("/bridge/system: odpowiedź bez ścieżek i użytkowników", all(set(p) <= {"name", "mb"} for p in sj.get("data", {}).get("top_processes", [])))
            print("Workflow (ADR 0007)")
            T = {"X-Bridge-Token": TOKEN}
            check("/workflows bez tokenu = 401", (await hc.get(f"{BASE}/workflows")).status_code == 401)
            wl = (await hc.get(f"{BASE}/workflows", headers=T)).json()
            check("/workflows: definicje z repo, bez błędów", any(w["id"] == "od-pomyslu-do-projektu" for w in wl.get("workflows", [])) and not wl.get("errors"), str(wl)[:300])
            check("/workflows/run: nieznany workflow = 400", (await hc.post(f"{BASE}/workflows/run", json={"workflow": "nie-ma"}, headers=T)).status_code == 400)
            check("/workflows/run: brak wejścia = 400", (await hc.post(f"{BASE}/workflows/run", json={"workflow": "od-pomyslu-do-projektu", "inputs": {}}, headers=T)).status_code == 400)
            check("/workflows/runs: pusto", (await hc.get(f"{BASE}/workflows/runs", headers=T)).json().get("runs") == [])
            check("/workflows/runs/<zły id> = 404", (await hc.get(f"{BASE}/workflows/runs/nie-ma-takiego", headers=T)).status_code == 404)
            print("Autoryzacja i CORS")
            check("status bez tokenu = 401", (await hc.get(f"{BASE}/bridge/status")).status_code == 401)
            check("status z tokenem = 200", (await hc.get(f"{BASE}/bridge/status", headers={"X-Bridge-Token": TOKEN})).status_code == 200)
            check("/mcp bez Bearer = 401", (await hc.post(f"{BASE}/mcp", json={})).status_code == 401)
            pre = await hc.options(f"{BASE}/bridge/result", headers={"Origin": "http://localhost:4000", "Access-Control-Request-Private-Network": "true"})
            check("preflight + PNA", pre.headers.get("access-control-allow-origin") == "http://localhost:4000" and pre.headers.get("access-control-allow-private-network") == "true", str(dict(pre.headers)))
            pair_ok = await hc.get(f"{BASE}/bridge/pair", headers={"Origin": "http://localhost:4000"})
            check("pair: dozwolony Origin dostaje token", pair_ok.status_code == 200 and pair_ok.json().get("token") == TOKEN)
            check("pair: brak Origin = 403", (await hc.get(f"{BASE}/bridge/pair")).status_code == 403)
            check("pair: obcy Origin = 403", (await hc.get(f"{BASE}/bridge/pair", headers={"Origin": "http://evil.example"})).status_code == 403)
            evil = await hc.options(f"{BASE}/bridge/result", headers={"Origin": "http://evil.example"})
            check("obcy Origin bez CORS", "access-control-allow-origin" not in evil.headers)

        headers = {"Authorization": f"Bearer {TOKEN}", "X-Jarvis-Profile": "jarvis-desktop"}
        async with httpx2.AsyncClient(headers=headers) as http_client:
            async with streamable_http_client(f"{BASE}/mcp", http_client=http_client) as streams:
                async with ClientSession(streams[0], streams[1]) as session:
                    await session.initialize()
                    tools = await session.list_tools()
                    names = sorted(t.name for t in tools.tools)
                    print("\nMCP: narzędzia")
                    check(f"narzędzia z rejestru ({len(expected)})", names == sorted(t["name"] for t in expected), str(len(names)) + " " + str(names))
                    oa = next(t for t in tools.tools if t.name == "open_app")
                    check("schema open_app: enum aplikacji z rejestru", "notes" in oa.input_schema["properties"]["app"].get("enum", []), json.dumps(oa.input_schema)[:300])
                    r = await session.call_tool("system_info", {"drive": "C", "processes": 1})
                    check("system_info przez MCP bez karty (most sam)", not r.is_error and "wolne" in r.content[0].text and "Dysk C" in r.content[0].text, str(r)[:300])
                    r = await session.call_tool("system_info", {"drive": "../../etc"})
                    check("system_info: zły dysk = INVALID_ARGS", r.is_error and "INVALID_ARGS" in r.content[0].text, str(r)[:300])
                    r = await session.call_tool("workflow_list", {})
                    check("workflow_list przez MCP bez karty (most sam)", not r.is_error and "Od pomysłu do projektu" in r.content[0].text, str(r)[:300])
                    r = await session.call_tool("workflow_status", {})
                    check("workflow_status: nic nie trwa", not r.is_error and "Żaden workflow nie trwa" in r.content[0].text, str(r)[:300])
                    r = await session.call_tool("workflow_run", {"workflow": "od-pomyslu-do-projektu", "inputs": {}})
                    check("workflow_run bez wejścia = INVALID_ARGS", r.is_error and "INVALID_ARGS" in r.content[0].text, str(r)[:300])

                    print("\nBrak przeglądarki")
                    r = await session.call_tool("wm_list", {})
                    check("błąd gdy karta niepodłączona", r.is_error and "nie jest połączony" in r.content[0].text, str(r))

                    seen, stop = {}, asyncio.Event()
                    task = asyncio.create_task(fake_browser(seen, stop))
                    for _ in range(40):
                        if seen.get("ready"):
                            break
                        await asyncio.sleep(0.1)
                    check("przeglądarka podłączona (hello)", bool(seen.get("ready")))
                    check("CORS dla SSE", seen.get("cors") == "http://localhost:4000", str(seen.get("cors")))

                    print("\nPrzekazywanie poleceń")
                    r = await session.call_tool("create_widget", {"type": "list", "title": "Zakupy", "items": ["mleko", "chleb"]})
                    txt = r.content[0].text
                    check("create_widget dotarł do przeglądarki", not r.is_error and "create_widget" in txt and "mleko" in txt, txt)
                    cmd = seen["cmds"][-1]
                    check("argumenty nienull (content pominięty)", cmd["args"] == {"type": "list", "title": "Zakupy", "items": ["mleko", "chleb"]}, json.dumps(cmd))
                    env_ = json.loads(txt)
                    check("koperta wyniku {ok, code, data, text}", env_.get("ok") is True and env_.get("code") == "OK" and "text" in env_, txt)
                    r = await session.call_tool("wm_minimize", {"app": "notes"})
                    check("wm_minimize", not r.is_error and "wm_minimize" in r.content[0].text, str(r))
                    r = await session.call_tool("focus_mode", {"on": False})
                    check("bool false nie jest gubiony", seen["cmds"][-1]["args"] == {"on": False}, json.dumps(seen["cmds"][-1]))

                    print("\nZdarzenia zadań Hermesa (wtyczka jarvis-events)")
                    async with httpx2.AsyncClient() as hc5:
                        HT = {"X-Bridge-Token": TOKEN}
                        check("/bridge/agent-event bez tokenu = 401", (await hc5.post(f"{BASE}/bridge/agent-event", json={"type": "task.created", "task_id": "t1"})).status_code == 401)
                        check("/bridge/agent-event: uszkodzony JSON = 400 (nie 500)", (await hc5.post(f"{BASE}/bridge/agent-event", content=b"{zly json", headers=HT)).status_code == 400)
                        check("/bridge/agent-event: nieznany typ = 400", (await hc5.post(f"{BASE}/bridge/agent-event", json={"type": "rm -rf", "task_id": "t1"}, headers=HT)).status_code == 400)
                        r5 = await hc5.post(f"{BASE}/bridge/agent-event", headers=HT, json={"v": 1, "type": "task.created", "task_id": "h-s-1", "platform": "telegram",
                                                                                              "title": "x" * 900, "extra": "nie przechodzi"})
                        check("/bridge/agent-event: przyjęte", r5.status_code == 200 and r5.json().get("ok") is True, r5.text[:120])
                        await hc5.post(f"{BASE}/bridge/agent-event", headers=HT, json={"v": 1, "type": "tool.started", "task_id": "h-s-1", "tool": "web_search", "label": "pogoda"})
                    for _ in range(40):
                        if len(seen.get("agent", [])) >= 2:
                            break
                        await asyncio.sleep(0.05)
                    got = seen.get("agent", [])
                    check("karta dostaje zdarzenia agenta (SSE event: agent)", [e.get("type") for e in got[:2]] == ["task.created", "tool.started"], json.dumps(got)[:200])
                    check("zdarzenie oczyszczone (tylko znane pola, długość ≤ 400)", got and "extra" not in got[0] and len(got[0].get("title", "")) == 400)
                    late: dict = {}
                    tl = asyncio.create_task(sse_client(False, late))
                    for _ in range(60):
                        if len(late.get("agent", [])) >= 2:
                            break
                        await asyncio.sleep(0.05)
                    check("karta podłączona w trakcie zadania dostaje jego przebieg", [e.get("type") for e in late.get("agent", [])] == ["task.created", "tool.started"], json.dumps(late)[:200])
                    tl.cancel()

                    print("\nBłędy")
                    r = await session.call_tool("boom", {})
                    check("nieznane narzędzie = błąd", r.is_error and "Nieznane" in r.content[0].text, str(r))

                    print("\nRejestr z przeglądarki")
                    async with httpx2.AsyncClient() as hc4:
                        fresh = [dict(t, description=t["description"] + " (nowy opis z karty)") if i == 0 else t for i, t in enumerate(expected)]
                        extra = fresh + [{"name": "boom", "description": "test", "parameters": {"type": "object", "properties": {}}}]
                        rr = (await hc4.post(f"{BASE}/bridge/tools", json={"tools": extra}, headers={"X-Bridge-Token": TOKEN})).json()
                        check("POST /bridge/tools aktualizuje opisy narzędzi z migawki", rr.get("changed") is True and rr.get("tools") == len(expected), json.dumps(rr))
                        check("karta NIE dopisze nowego narzędzia (kanał prompt-injection)", "boom" not in [t.name for t in (await session.list_tools()).tools])
                        check("POST /bridge/tools bez tokenu = 401", (await hc4.post(f"{BASE}/bridge/tools", json={"tools": extra})).status_code == 401)
                        old_tab = [t for t in fresh if t["name"] != expected[0]["name"]]   # karta ze starym kodem: brakuje narzędzia z aktualnej migawki
                        rs = (await hc4.post(f"{BASE}/bridge/tools", json={"tools": old_tab}, headers={"X-Bridge-Token": TOKEN})).json()
                        check("stara karta nie wypiera nowych narzędzi (stale, lista bez zmian)", rs.get("stale") is True and rs.get("changed") is False and rs.get("tools") == len(expected) and expected[0]["name"] in rs.get("missing", []), json.dumps(rs)[:200])
                    runtime = tools_copy.with_name(tools_copy.stem + ".runtime.json")
                    check("schematy z karty w pliku roboczym", runtime.exists() and "(nowy opis z karty)" in runtime.read_text(encoding="utf-8"))
                    check("migawka w repo nietknięta", json.loads(tools_copy.read_text(encoding="utf-8")) == expected)
                    r = await session.call_tool("create_widget", {"type": "note", "title": "__fail__"})
                    check("błąd z pulpitu -> is_error z kodem", r.is_error and json.loads(r.content[0].text).get("ok") is False, str(r))

                    print("\nWykrywanie profilu Hermesa")
                    async with httpx2.AsyncClient() as hc2:
                        st = (await hc2.get(f"{BASE}/bridge/status", headers={"X-Bridge-Token": TOKEN})).json()
                    check("most widzi profil z nagłówka X-Jarvis-Profile", "jarvis-desktop" in st.get("hermes", {}) and st["hermes"]["jarvis-desktop"] < 30, json.dumps(st.get("hermes")))

                    stop.set()
                    task.cancel()
                    await asyncio.sleep(0.3)
                    r = await session.call_tool("wm_list", {})
                    check("po rozłączeniu karty znów błąd", r.is_error and "nie jest połączony" in r.content[0].text, str(r))
                    print("\nRouting do aktywnej karty")
                    a, b = {}, {}
                    ta = asyncio.create_task(sse_client(True, a)); await asyncio.sleep(0.4)
                    tb = asyncio.create_task(sse_client(False, b)); await asyncio.sleep(0.6)   # b jest NOWSZA
                    async with httpx2.AsyncClient() as hc3:
                        hd = {"X-Bridge-Token": TOKEN}
                        await hc3.post(f"{BASE}/bridge/focus", json={"client": a["id"], "visible": True}, headers=hd)
                        await hc3.post(f"{BASE}/bridge/focus", json={"client": b["id"], "visible": False}, headers=hd)
                        st = (await hc3.get(f"{BASE}/bridge/status", headers=hd)).json()
                    check("status wskazuje kartę docelową", any(x["target"] and x["id"] == a["id"] for x in st["browsers"]), json.dumps(st.get("browsers")))
                    r = await session.call_tool("wm_list", {})
                    check("polecenie trafia do widocznej (starszej) karty", not r.is_error and "widocznej" in r.content[0].text and not b.get("got"), str(r)[:200])
                    async with httpx2.AsyncClient() as hc3:
                        await hc3.post(f"{BASE}/bridge/focus", json={"client": a["id"], "visible": False}, headers=hd)
                        await hc3.post(f"{BASE}/bridge/focus", json={"client": b["id"], "visible": True}, headers=hd)
                    r = await session.call_tool("wm_list", {})
                    check("po zmianie aktywnej karty polecenie idzie do niej (b głucha -> timeout)", r.is_error and b.get("got") == 1, str(r)[:200])
                    ta.cancel(); tb.cancel()

    finally:
        proc.terminate()
        try:
            proc.wait(5)
        except subprocess.TimeoutExpired:
            proc.kill()
        await gw_runner.cleanup()
    print("\n" + ("WSZYSTKO OK" if not fails else f"BŁĘDY ({len(fails)}): " + ", ".join(fails)))
    sys.exit(1 if fails else 0)


asyncio.run(main())
