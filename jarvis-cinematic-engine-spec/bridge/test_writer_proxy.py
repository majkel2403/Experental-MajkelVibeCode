"""Testy pośrednika modelu pomocniczego (bridge/writer_proxy.py) z atrapami OpenRouter i Hermesa:
  %USERPROFILE%\\.hermes\\hermes-agent\\venv\\Scripts\\python.exe bridge\\test_writer_proxy.py
"""
import asyncio
import json
import os
import sys
import tempfile
from pathlib import Path

from aiohttp import web

OR_PORT, HERMES_PORT = 18681, 18682
hermes_env = Path(tempfile.mkdtemp()) / ".env"
hermes_env.write_text("API_SERVER_KEY=hermes-test-key\n", encoding="utf-8")
os.environ.update(JARVIS_WRITER_OPENROUTER_URL=f"http://127.0.0.1:{OR_PORT}/chat/completions", JARVIS_HERMES_URL=f"http://127.0.0.1:{HERMES_PORT}/v1",
                  JARVIS_HERMES_ENV=str(hermes_env), JARVIS_WRITER_MODELS="m/429:free,m/empty:free,m/badjson:free,m/good:free,m/late:free", JARVIS_WRITER_TIMEOUT="1.5")
sys.path.insert(0, str(Path(__file__).parent))
import writer_proxy as P  # noqa: E402

fails = []
seen = {"or": [], "hermes": [], "or_body": None}
MODE = {"good_ok": True}


def check(name, cond, extra=""):
    print(("  ok   " if cond else "  FAIL ") + name + (f"  [{extra}]" if extra and not cond else ""))
    if not cond:
        fails.append(name)


def reply(text):
    return {"choices": [{"message": {"role": "assistant", "content": text}}], "usage": {"prompt_tokens": 5, "completion_tokens": 5}}


async def openrouter(request):
    body = await request.json()
    seen["or_body"] = body
    m = body["model"]
    seen["or"].append(m)
    if m == "m/429:free":
        return web.json_response({"error": {"message": "Provider returned error"}}, status=429)
    if m == "m/empty:free":
        return web.json_response(reply(""))
    if m == "m/badjson:free":
        return web.json_response(reply("Here's a thinking process: 1. analyse"))
    if m == "m/good:free" and MODE["good_ok"]:
        return web.json_response(reply('Oto wynik: {"fill": true, "text": "zielone jabłka", "reason": "ok", "submit": true}'))
    if m == "m/late:free":
        await asyncio.sleep(3)
    return web.json_response({"error": {}}, status=500)


async def hermes(request):
    seen["hermes"].append(request.headers.get("Authorization"))
    return web.json_response(reply('{"fill": true, "text": "z hermesa", "reason": "r", "submit": false}'))


BODY = {"model": "writer", "messages": [{"role": "system", "content": "s"}, {"role": "user", "content": "u"}], "max_tokens": 256,
        "response_format": {"type": "json_schema", "json_schema": {}}, "reasoning_effort": "low", "stream": True}


async def main():
    ra = web.Application(); ra.router.add_post("/chat/completions", openrouter)
    ha = web.Application(); ha.router.add_post("/v1/chat/completions", hermes)
    r1, r2 = web.AppRunner(ra), web.AppRunner(ha)
    await r1.setup(); await r2.setup()
    await web.TCPSite(r1, "127.0.0.1", OR_PORT).start(); await web.TCPSite(r2, "127.0.0.1", HERMES_PORT).start()
    try:
        print("Walidacja i przygotowanie zapytania")
        check("poprawny JSON w tekście = ważna odpowiedź", P.valid_json_reply(reply('tekst {"a": 1} koniec')))
        for bad in ("", "brak json", '{"a": ', None):
            check(f"niepoprawna odpowiedź odrzucona: {bad!r}", not P.valid_json_reply(reply(bad)))
        check("brak choices = odrzucona", not P.valid_json_reply({}))
        pb = P.prepare(BODY, "x/y:free")
        check("zapytanie: bez response_format, reasoning_effort i stream", not ({"response_format", "reasoning_effort", "stream"} & set(pb)))
        check("zapytanie: model podmieniony, limit tokenów ≥ 1024, minimalne rozumowanie", pb["model"] == "x/y:free" and pb["max_tokens"] >= 1024 and pb["reasoning"] == {"effort": "low"}, str(pb))

        print("\nŁańcuch modeli")
        P.reset()
        out, used = await P.complete(BODY, "or-key")
        check("pierwszy działający model wygrywa (po 429, pustej i złej odpowiedzi)", used == "m/good:free" and json.loads(out["choices"][0]["message"]["content"][10:])["text"] == "zielone jabłka", used)
        check("próbowano po kolei", seen["or"] == ["m/429:free", "m/empty:free", "m/badjson:free", "m/good:free"], str(seen["or"]))
        seen["or"].clear()
        out, used = await P.complete(BODY, "or-key")
        check("zawodzące modele są pomijane (cooldown) — od razu dobry model", seen["or"] == ["m/good:free"], str(seen["or"]))

        print("\nAwaria darmowych modeli → Hermes")
        P.reset(); MODE["good_ok"] = False; seen["or"].clear()
        out, used = await P.complete(BODY, "or-key")
        check("gdy żaden darmowy nie działa (w tym wolny: limit czasu), odpowiada Hermes", used == "hermes" and seen["hermes"] == ["Bearer hermes-test-key"], f"{used} {seen}")
        check("wolny model odcięty limitem czasu, nie blokuje w nieskończoność", "m/late:free" in seen["or"])
        P.reset(); seen["hermes"].clear()
        out, used = await P.complete(BODY, "")
        check("bez klucza OpenRouter od razu Hermes", used == "hermes")

        print("\nCałkowita porażka")
        hermes_env.unlink()
        P.reset()
        try:
            await P.complete(BODY, "or-key"); ok = False
        except RuntimeError as e:
            ok = "zawiodły" in str(e) and "m/429:free: 429" in str(e)
        check("wszystko zawiodło → czytelny błąd z listą przyczyn", ok)
    finally:
        await r1.cleanup(); await r2.cleanup()
    print("\n" + ("WSZYSTKO OK" if not fails else f"BŁĘDY ({len(fails)}): " + ", ".join(fails)))
    sys.exit(1 if fails else 0)


asyncio.run(main())
