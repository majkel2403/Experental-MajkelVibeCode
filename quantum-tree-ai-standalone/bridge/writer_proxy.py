"""Pośrednik „modelu pomocniczego” (writer) dla sterowania komputerem: OpenAI-compatible /writer/v1/chat/completions.

Program typesafe-computer-use używa modelu pomocniczego do wpisywania tekstu i końcowej odpowiedzi. Darmowe modele OpenRouter są szybkie,
ale zawodne (429 od współdzielonych dostawców, puste odpowiedzi „myślących” modeli, uszkodzony JSON), więc pośrednik próbuje ŁAŃCUCHA:
kolejne darmowe modele (krótki limit czasu, walidacja, że odpowiedź to poprawny JSON) i dopiero na końcu Hermes (profil jarvis-desktop, MiniMax-M3).
Model, który zawiódł, jest pomijany przez COOLDOWN sekund, więc kolejne wywołania nie tracą czasu na ten sam błąd.
"""
from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path

import aiohttp

OPENROUTER_URL = os.environ.get("JARVIS_WRITER_OPENROUTER_URL", "https://openrouter.ai/api/v1/chat/completions")
DEFAULT_CHAIN = [
    "dots-studio/dots-3-note-preview:free",
    "qwen/qwen3.8-27b:free",
    "google/gemma-4-26b-a4b-it:free",
    "google/gemma-4-31b-it:free",
    "poolside/laguna-xs-2.1:free",
]
PER_MODEL_TIMEOUT = float(os.environ.get("JARVIS_WRITER_TIMEOUT", "9"))
TOTAL_TIMEOUT = float(os.environ.get("JARVIS_WRITER_TOTAL_TIMEOUT", "35"))   # budżet łączny: pełen łańcuch potrafił zjeść ~140 s na jeden krok przy budżecie zadania 150 s
COOLDOWN = float(os.environ.get("JARVIS_WRITER_COOLDOWN", "90"))
_failed: dict[str, float] = {}   # model -> do kiedy pomijany


def chain() -> list[str]:
    env = os.environ.get("JARVIS_WRITER_MODELS", "")
    return [m.strip() for m in env.split(",") if m.strip()] or list(DEFAULT_CHAIN)


def valid_json_reply(reply: dict) -> bool:
    """Odpowiedź ma treść, w której da się znaleźć obiekt JSON (program autora tego wymaga)."""
    try:
        text = reply["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError, TypeError):
        return False
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return False
    try:
        json.loads(m.group(0))
        return True
    except ValueError:
        return False


def prepare(body: dict, model: str) -> dict:
    """Ciało zapytania dla darmowego modelu: bez response_format (schemat jest w prompcie, a część dostawców odpowiada 400),
    z większym limitem tokenów (modele „myślące” zużywają go na rozumowanie i oddają pustą treść) i minimalnym rozumowaniem."""
    out = {k: v for k, v in body.items() if k not in ("response_format", "reasoning_effort", "stream", "model")}
    out["model"] = model
    out["max_tokens"] = max(int(out.pop("max_completion_tokens", 0) or 0), int(out.get("max_tokens") or 0), 1024)
    out["reasoning"] = {"effort": "low"}
    return out


async def ask(session: aiohttp.ClientSession, url: str, key: str, body: dict, timeout: float) -> tuple[int, dict]:
    async with session.post(url, json=body, headers={"Authorization": f"Bearer {key}"}, timeout=aiohttp.ClientTimeout(total=timeout)) as r:
        try:
            return r.status, await r.json(content_type=None)
        except Exception:  # noqa: BLE001
            return r.status, {}


def hermes_target() -> tuple[str, str, str] | None:
    """(url, klucz, model) gatewaya Hermesa jako ostatnia deska ratunku; z profilu jarvis-desktop."""
    penv = Path(os.environ.get("JARVIS_HERMES_ENV") or Path.home() / ".hermes" / "profiles" / "jarvis-desktop" / ".env")
    try:
        m = re.search(r"^\s*API_SERVER_KEY\s*=\s*(\S+)", penv.read_text(encoding="utf-8-sig"), re.M)
    except OSError:
        return None
    if not m:
        return None
    return os.environ.get("JARVIS_HERMES_URL", "http://127.0.0.1:8643/v1") + "/chat/completions", m.group(1), "jarvis-desktop"


async def complete(body: dict, openrouter_key: str, *, log=lambda *a: None, models: list[str] | None = None, timeout: float | None = None) -> tuple[dict, str]:
    """Pierwsza poprawna odpowiedź z łańcucha (domyślnie chain(); planista zadań w internecie podaje własny, mocniejszy).
    Zwraca (odpowiedź, użyty model); rzuca RuntimeError, gdy wszystko zawiodło."""
    errors: list[str] = []
    deadline = time.monotonic() + TOTAL_TIMEOUT
    async with aiohttp.ClientSession() as s:
        now = time.monotonic()
        if openrouter_key:
            for model in (models or chain()):
                if _failed.get(model, 0) > now:
                    continue
                left = deadline - time.monotonic()
                if left < 2:   # budżet łączny wyczerpany — od razu do Hermesa, zamiast ciągnąć łańcuch
                    errors.append("budżet łączny wyczerpany")
                    break
                try:
                    status, reply = await ask(s, OPENROUTER_URL, openrouter_key, prepare(body, model), min(timeout or PER_MODEL_TIMEOUT, left))
                except Exception as e:  # noqa: BLE001 — limit czasu, brak sieci
                    status, reply = 0, {"error": type(e).__name__}
                if status == 200 and valid_json_reply(reply):
                    return reply, model
                _failed[model] = time.monotonic() + COOLDOWN
                errors.append(f"{model}: {status or 'timeout'}")
                log("writer: pomijam", model, status)
        target = hermes_target()
        if target:
            url, key, model = target
            hbody = {k: v for k, v in body.items() if k not in ("response_format", "stream")} | {"model": model}
            try:
                # ostatnia deska ratunku: dostaje resztę budżetu, ale minimum 15 s (Hermes odpowiada 4–11 s)
                status, reply = await ask(s, url, key, hbody, max(15.0, min(60.0, deadline - time.monotonic())))
                if status == 200 and valid_json_reply(reply):
                    return reply, "hermes"
                errors.append(f"hermes: {status}")
            except Exception as e:  # noqa: BLE001
                errors.append(f"hermes: {type(e).__name__}")
    raise RuntimeError("wszystkie modele pomocnicze zawiodły (" + "; ".join(errors) + ")")


def reset() -> None:
    _failed.clear()
