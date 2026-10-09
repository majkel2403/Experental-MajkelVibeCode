"""Ocena przypadków w hermes/evals/run_evals.py (bez sieci) + poprawność cases.yaml."""
from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest
import yaml

pytestmark = pytest.mark.unit
EVALS = Path(__file__).resolve().parent.parent / "evals"


def load():
    spec = importlib.util.spec_from_file_location("run_evals_under_test", EVALS / "run_evals.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_judge_rules():
    m = load()
    case = {"expect": ["391"], "forbid_text": ["codex"], "max_tools": 1, "tools_any": ["terminal"], "tools_none": ["write_file"], "max_seconds": 30}
    assert m.judge(case, "Wynik: 391", 5, ["terminal"]) == []
    errs = m.judge(case, "nie wiem, zapytaj codex", 45, ["write_file", "patch"])
    assert any("391" in e for e in errs) and any("codex" in e for e in errs)
    assert any("narzędzi 2 > 1" in e for e in errs) and any("zakazanych" in e for e in errs)
    assert any("terminal" in e for e in errs) and any("czas" in e for e in errs)


def test_cases_file_is_valid_and_side_effect_free():
    cases = yaml.safe_load((EVALS / "cases.yaml").read_text(encoding="utf-8"))
    ids = [c["id"] for c in cases]
    assert len(ids) == len(set(ids)) and len(cases) >= 6
    allowed = {"id", "prompt", "expect", "forbid_text", "max_tools", "tools_any", "tools_none", "max_seconds"}
    for c in cases:
        assert set(c) <= allowed, c["id"]
        assert c["prompt"] and isinstance(c.get("expect", []), list)
        assert "write_file" not in c.get("tools_any", []) and "patch" not in c.get("tools_any", []), "evale nie mogą wymagać zapisu"
