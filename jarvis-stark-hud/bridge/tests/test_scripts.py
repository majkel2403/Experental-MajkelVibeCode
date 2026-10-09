"""Testy Pythona mostu jako pytest: każdy samodzielny skrypt testowy uruchamiany w osobnym procesie.

Skrypty (bridge/test_*.py) zostają samodzielne (`python bridge/test_web_task.py` działa jak dawniej) — ten plik
pozwala odpalić je wszystkie jedną komendą i w CI:
    python -m pytest bridge/tests/test_scripts.py            # wszystko, co da się uruchomić w tym środowisku
    python -m pytest bridge/tests/test_scripts.py -m unit    # tylko testy bez sieci i bez venv Hermesa (CI)
Testy integracyjne startują WŁASNY, odizolowany most (osobny port i token) — nie dotykają działającego pulpitu.
Testy na żywym moście i karcie: python bridge/tests/run_e2e.py (osobno, wymagają otwartej karty).
"""
from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
from pathlib import Path

import pytest

BRIDGE = Path(__file__).resolve().parent.parent
ROOT = BRIDGE.parent

# (plik, wymagane moduły, znacznik)
SCRIPTS = [
    (BRIDGE / "test_agents_unit.py", ["aiohttp"], "unit"),
    (BRIDGE / "test_web_task.py", ["aiohttp"], "unit"),
    (BRIDGE / "test_writer_proxy.py", ["aiohttp"], "unit"),
    (BRIDGE / "test_workflows.py", ["yaml"], "unit"),
    (BRIDGE / "test_system_info.py", [], "unit"),
    (BRIDGE / "test_agents.py", ["aiohttp", "mcp", "uvicorn"], "integration"),
    (BRIDGE / "test_bridge.py", ["aiohttp", "mcp", "httpx2", "uvicorn"], "integration"),
]


def _missing(mods: list[str]) -> list[str]:
    return [m for m in mods if importlib.util.find_spec(m) is None]


@pytest.mark.parametrize("script,mods,kind", [pytest.param(*s, marks=getattr(pytest.mark, s[2]), id=s[0].name) for s in SCRIPTS])
def test_script(script: Path, mods: list[str], kind: str) -> None:
    miss = _missing(mods)
    if miss:
        pytest.skip(f"brak modułów {miss} (uruchom Pythonem z venv Hermesa)")
    env = dict(os.environ, PYTHONUTF8="1", PYTHONIOENCODING="utf-8")
    p = subprocess.run([sys.executable, str(script)], cwd=ROOT, env=env, capture_output=True, text=True,
                       encoding="utf-8", errors="replace", timeout=600)
    tail = "\n".join((p.stdout + p.stderr).splitlines()[-25:])
    assert p.returncode == 0, f"{script.name} zakończył się kodem {p.returncode}:\n{tail}"


@pytest.mark.integration
def test_clicker_suite() -> None:
    """Testy clickera computer-use (integrations/computer) w środowisku uv projektu vendor (typesafe-computer-use)."""
    import shutil
    vendor = Path(os.environ.get("JARVIS_HOME") or Path.home() / ".jarvis-os") / "vendor" / "typesafe-computer-use"
    uv = shutil.which("uv")
    if not uv or not (vendor / "pyproject.toml").exists():
        pytest.skip("brak uv albo ~/.jarvis-os/vendor/typesafe-computer-use (integrations/setup.ps1)")
    env = dict(os.environ, PYTHONUTF8="1", PYTHONIOENCODING="utf-8")
    p = subprocess.run([uv, "run", "--project", str(vendor), "python", "-m", "pytest", "-q", "-p", "no:cacheprovider",
                        str(ROOT / "integrations" / "computer")], cwd=ROOT, env=env, capture_output=True, text=True,
                       encoding="utf-8", errors="replace", timeout=900)
    tail = "\n".join((p.stdout + p.stderr).splitlines()[-25:])
    assert p.returncode == 0, f"testy clickera: kod {p.returncode}:\n{tail}"
