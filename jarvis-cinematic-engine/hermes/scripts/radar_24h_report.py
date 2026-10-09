#!/usr/bin/env python3
"""Cron Hermesa „Solana Impulse Radar 24h Report” (00:00, no_agent): uruchamia raport dobowy z folderu projektu radaru.
Źródło: repo Jarvis OS hermes/scripts/ (od 2026-10-05), kopiowane do profilu przez apply_profile.py."""
from __future__ import annotations
import subprocess
import sys
from pathlib import Path
PROJECT = Path(r"C:\Users\majke\Desktop\03_Projekty_Trading\solana_impulse_radar")
REPORT = PROJECT / "radar_24h_report.py"
proc = subprocess.run([sys.executable, str(REPORT)], cwd=str(PROJECT), capture_output=True, text=True, timeout=60, check=False)
if proc.returncode != 0:
    print(f"Impulse Radar 24h report error: exit {proc.returncode}")
else:
    print("Impulse Radar 24h report updated")
