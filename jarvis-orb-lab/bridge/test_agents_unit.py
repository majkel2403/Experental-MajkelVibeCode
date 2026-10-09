"""Testy jednostkowe modułu agents.py (bez uruchamiania mostu):
  %USERPROFILE%\\.hermes\\hermes-agent\\venv\\Scripts\\python.exe bridge\\test_agents_unit.py
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import agents  # noqa: E402

fails = []


def check(name, cond, extra=""):
    print(("  ok   " if cond else "  FAIL ") + name + (f"  [{extra}]" if extra and not cond else ""))
    if not cond:
        fails.append(name)


os.environ.pop("JARVIS_COMPUTER_CMD", None)
os.environ.pop("JARVIS_COMPUTER_STOCK", None)
c = agents.ComputerAgent()
cmd = c._command("otwórz Notatnik", 25, 1.0, Path("out"))
check("domyślne polecenie uruchamia nasz jarvis_clicker.py (rozszerzenia dla Windows)", any(p.endswith("jarvis_clicker.py") for p in cmd), str(cmd))
check("cel jest osobnym argumentem (bez powłoki — brak wstrzykiwania)", "otwórz Notatnik" in cmd and "--act" in cmd)
check("limity kroków i opóźnienie przekazane", cmd[cmd.index("--steps") + 1] == "25" and cmd[cmd.index("--delay") + 1] == "1.0")
check("clicker uruchamiany w środowisku uv projektu", cmd[1:3] == ["run", "--project"])
os.environ["JARVIS_COMPUTER_STOCK"] = "1"
check("JARVIS_COMPUTER_STOCK=1 wraca do czystego programu autora", "typesafe_computer_use" in c._command("x", 5, 1.0, Path("o")))
del os.environ["JARVIS_COMPUTER_STOCK"]

hostile = 'x" & calc.exe & "'
check("cel z cudzysłowami i metaznakami nie zmienia struktury polecenia", c._command(hostile, 5, 1.0, Path("o")).count(hostile) == 1)

b = agents.default_browser()
check("domyślna przeglądarka wykryta w formie nazwy (albo None poza Windows)", b is None or (isinstance(b, str) and b and not b.endswith(".exe")), str(b))

print("\n" + ("WSZYSTKO OK" if not fails else f"BŁĘDY ({len(fails)}): " + ", ".join(fails)))
sys.exit(1 if fails else 0)
