"""Wrapper: Obsidian Brain Briefing - monthly"""
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
result = subprocess.run(
    [sys.executable, str(SCRIPT_DIR / "obsidian-context.py"), "full"],
    capture_output=True, text=True, timeout=60
)
print(result.stdout.strip()[:3000])  # Telegram limit
if result.returncode != 0:
    print(f"ERROR: {result.stderr.strip()}", file=sys.stderr)
    sys.exit(result.returncode)