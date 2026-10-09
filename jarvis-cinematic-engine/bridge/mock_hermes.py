"""Atrapa gatewaya Hermesa (OpenAI-compatible + SSE hermes.tool.progress) do testów klienta w trybie MCP.

Zachowuje się jak agent: gdy polecenie zawiera "listę zakupów", sama woła narzędzie przez most MCP,
strumieniuje zdarzenie postępu narzędzia i odpowiedź. GET /_last zwraca ostatnie odebrane żądanie.

  %USERPROFILE%\\.hermes\\hermes-agent\\venv\\Scripts\\python.exe bridge\\mock_hermes.py [port]
"""
import asyncio
import json
import sys
from pathlib import Path

import httpx2
from aiohttp import web
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 18644
BRIDGE = "http://127.0.0.1:8651"
TOKEN = (Path.home() / ".jarvis-os" / "bridge-token").read_text().strip()
LAST = {}
# tylko lokalne originy — atrapa woła prawdziwy most z tokenem, ACAO:* dawałby KAŻDEJ stronie wykonywanie narzędzi, gdyby została po teście
CORS = {"Access-Control-Allow-Origin": "http://localhost:4000", "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Hermes-Session-Id", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Expose-Headers": "X-Hermes-Session-Id"}


async def mcp_call(name, args):
    async with httpx2.AsyncClient(headers={"Authorization": f"Bearer {TOKEN}", "X-Jarvis-Profile": "jarvis-desktop"}, timeout=60) as hc:
        async with streamable_http_client(f"{BRIDGE}/mcp", http_client=hc) as st:
            async with ClientSession(st[0], st[1]) as s:
                await s.initialize()
                r = await s.call_tool(name, args)
                return r.is_error, (r.content[0].text if r.content else "")


async def options(_):
    return web.Response(status=204, headers=CORS)


async def models(_):
    return web.json_response({"data": [{"id": "jarvis-desktop"}]}, headers=CORS)


async def last(_):
    return web.json_response(LAST, headers=CORS)


async def chat(req):
    body = await req.json()
    LAST.clear()
    LAST.update({"n_messages": len(body["messages"]), "roles": [m["role"] for m in body["messages"]], "system": body["messages"][0]["content"],
                 "user": body["messages"][-1]["content"], "session": req.headers.get("X-Hermes-Session-Id"), "stream": body.get("stream"), "calls": LAST.get("calls", 0) + 1})
    resp = web.StreamResponse(headers={**CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache"})
    await resp.prepare(req)

    async def send(data, event=None):
        await resp.write(((f"event: {event}\n") if event else "").encode() + b"data: " + (data if isinstance(data, bytes) else json.dumps(data, ensure_ascii=False).encode()) + b"\n\n")

    text = body["messages"][-1]["content"]
    if "listę zakupów" in text:
        await send({"tool": "mcp__jarvis_desktop__create_widget", "label": "list Lista zakupów", "emoji": "🧩"}, "hermes.tool.progress")
        err, out = await mcp_call("create_widget", {"type": "list", "title": "Lista zakupów", "items": ["mleko", "chleb", "masło"]})
        LAST["tool_result"] = out
        answer = "Gotowe — lista zakupów leży na pulpicie." if not err else f"Nie udało się: {out}"
    else:
        answer = "Rozumiem."
    for chunk in [answer[:12], answer[12:]]:
        await send({"choices": [{"index": 0, "delta": {"content": chunk}}]})
        await asyncio.sleep(0.05)
    await send(b"[DONE]")
    return resp


app = web.Application()
app.add_routes([web.options("/v1/{tail:.*}", options), web.get("/v1/models", models), web.get("/_last", last), web.post("/v1/chat/completions", chat)])
web.run_app(app, host="127.0.0.1", port=PORT, print=lambda *_: None)
