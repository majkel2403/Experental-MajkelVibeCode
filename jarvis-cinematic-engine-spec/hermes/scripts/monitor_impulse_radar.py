#!/usr/bin/env python3
"""Cron wrapper: emit only actionable radar alerts; stay silent otherwise.

Cron Hermesa „Solana Impulse Radar Monitor” (co 5 min, no_agent). Źródło: repo Jarvis OS hermes/scripts/ (od 2026-10-05),
apply_profile.py kopiuje do profilu jarvis-desktop. Kopia w folderze projektu radaru NIE jest używana przez cron.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

PROJECT = Path(r"C:\Users\majke\Desktop\03_Projekty_Trading\solana_impulse_radar")
PYTHON = Path(r"C:\Program Files\Python312\python.exe")
if not PYTHON.exists():
    PYTHON = Path(sys.executable)
RADAR = PROJECT / "impulse_radar.py"
TRACKER = PROJECT / "alert_tracker.py"
OUTPUT = PROJECT / "impulse-radar-live.json"
HISTORY = PROJECT / "impulse-radar-history.jsonl"
STATE = PROJECT / "impulse-radar-alert-state.json"
RESEARCH_STATE = PROJECT / "impulse-radar-research-state.json"
COOLDOWN_MINUTES = 30


def parse_time(value: object) -> datetime | None:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None

try:
    proc = None
    for attempt in range(1, 4):
        proc = subprocess.run(
            [str(PYTHON), str(RADAR)],
            cwd=str(PROJECT),
            capture_output=True,
            text=True,
            timeout=150,
            check=False,
        )
        if proc.returncode == 0:
            break
        if attempt < 3:
            time.sleep(2 * attempt)
    if proc is None or proc.returncode != 0:
        detail = ((proc.stderr or proc.stdout or "").strip().replace("\n", " ") if proc else "no subprocess result")
        print(f"Impulse Radar error: exit {proc.returncode if proc else 'unknown'}; detail: {detail[:500]}")
        raise SystemExit(0)
    tracker = subprocess.run([str(PYTHON), str(TRACKER)], cwd=str(PROJECT), capture_output=True, text=True, timeout=180, check=False)
    if tracker.returncode != 0:
        detail = (tracker.stderr or tracker.stdout or "").strip().replace("\n", " ")
        print(f"Impulse Radar tracker error: exit {tracker.returncode}; detail: {detail[:500]}")
    data = json.loads(OUTPUT.read_text(encoding="utf-8"))
    diagnostics_path = PROJECT / "impulse-radar-diagnostics.json"
    diagnostics = json.loads(diagnostics_path.read_text(encoding="utf-8")) if diagnostics_path.exists() else {}
    alerts = data.get("alerts", [])
    try:
        research_state = json.loads(RESEARCH_STATE.read_text(encoding="utf-8")) if RESEARCH_STATE.exists() else {}
    except (OSError, ValueError):
        research_state = {}
    try:
        scan_time = datetime.fromisoformat(str(data.get("ts", "")).replace("Z", "+00:00"))
    except ValueError:
        scan_time = datetime.now(timezone.utc)
    for item in alerts:
        if item.get("research_profile") != "research_v1":
            continue
        mint = item.get("mint", "")
        previous = research_state.get(mint, {})
        previous_time = parse_time(previous.get("last_seen_at"))
        consecutive = int(previous.get("consecutive_scans", 0)) + 1 if previous_time and (scan_time - previous_time).total_seconds() <= 600 and previous.get("call") == item.get("call") else 1
        item["research_confirmation"] = "CONFIRMED_FLOW" if consecutive >= 2 else "EARLY_FLOW"
        research_state[mint] = {"call": item.get("call"), "last_seen_at": scan_time.isoformat().replace("+00:00", "Z"), "consecutive_scans": consecutive}
    RESEARCH_STATE.write_text(json.dumps(research_state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    OUTPUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    history = {
        "ts": data.get("ts"),
        "scanned": data.get("scanned", 0),
        "windowed": data.get("windowed", 0),
        "alerts": len(alerts),
        "symbols": [item.get("symbol") for item in alerts],
        "with_pair": diagnostics.get("with_pair", 0),
        "skip_reasons": diagnostics.get("skip_reasons", {}),
        "rugcheck_checked": diagnostics.get("rugcheck_checked", 0),
        "rugcheck_unverified": diagnostics.get("rugcheck_unverified", 0),
    }
    with HISTORY.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(history, ensure_ascii=False) + "\n")
    try:
        state = json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else {}
    except (OSError, ValueError):
        state = {}
    try:
        scan_time = datetime.fromisoformat(str(data.get("ts", "")).replace("Z", "+00:00"))
    except ValueError:
        scan_time = datetime.now(timezone.utc)
    notify = []
    for item in alerts:
        if item.get("research_confirmation") == "EARLY_FLOW":
            continue
        mint = item.get("mint", "")
        previous = state.get(mint, {})
        try:
            last = datetime.fromisoformat(str(previous.get("notified_at", "")).replace("Z", "+00:00"))
        except ValueError:
            last = None
        same_call = previous.get("call") == item.get("call")
        cooling = last is not None and scan_time - last < timedelta(minutes=COOLDOWN_MINUTES)
        if mint and not (same_call and cooling):
            notify.append(item)
        if mint:
            state[mint] = {"symbol": item.get("symbol"), "call": item.get("call"), "last_seen_at": scan_time.isoformat().replace("+00:00", "Z"), "notified_at": (previous.get("notified_at") if same_call and cooling else scan_time.isoformat().replace("+00:00", "Z"))}
    STATE.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if not notify:
        raise SystemExit(0)
    print(f"IMPULSE RADAR | scanned={data.get('scanned', 0)} | alerts={len(notify)}")
    for item in notify:
        print(
            f"{item.get('call', 'UNKNOWN')} | {item.get('symbol', 'UNKNOWN')} | "
            f"MC=${item.get('mc', 0):,.0f} | age={item.get('age_min', 0):.1f}m | "
            f"buys/sells={item.get('buys_m5', 0)}/{item.get('sells_m5', 0)} | "
            f"vol5m=${item.get('vol_m5', 0):,.0f}\n"
            f"mint: {item.get('mint', '')}\n"
            f"reason: {item.get('reason', '')}\n"
            f"url: {item.get('url', '')}"
        )
except Exception as exc:
    print(f"Impulse Radar monitor error: {type(exc).__name__}: {exc}")
