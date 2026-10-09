"""Testy modułu stanu komputera (bridge/system_info.py) — bez sieci i bez psutil. Uruchom: python bridge/test_system_info.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import system_info as si  # noqa: E402

fails = []


def check(name, cond, extra=""):
    print(("  ok   " if cond else "  BŁĄD ") + name + ("" if cond else f"  [{extra}]"))
    if not cond:
        fails.append(name)


def run(label):
    print(label)
    d = si.snapshot()
    check("dyski: co najmniej jeden, z polami", bool(d["disks"]) and {"drive", "total_gb", "free_gb", "used_pct"} <= set(d["disks"][0]), str(d["disks"]))
    check("dysk: wolne ≤ całość, procent 0–100", all(0 <= k["free_gb"] <= k["total_gb"] and 0 <= k["used_pct"] <= 100 for k in d["disks"]))
    check("pamięć: wolne ≤ całość", bool(d["memory"]) and 0 < d["memory"]["free_gb"] <= d["memory"]["total_gb"], str(d["memory"]))
    check("czas działania odczytany i nieujemny (świeży serwer CI może mieć < 3 min)", d["uptime_h"] is not None and d["uptime_h"] >= 0, str(d["uptime_h"]))
    txt = si.describe(d)
    check("opis po polsku z przecinkiem dziesiętnym", "wolne" in txt and "GB" in txt and "," in txt, txt[:200])
    return d


with_psutil = run("Z psutil" if si.psutil else "Bez psutil (środowisko go nie ma)")
if si.psutil:
    check("procesy: nazwa i MB, bez ścieżek i użytkowników", bool(with_psutil["top_processes"]) and all(set(p) == {"name", "mb"} for p in with_psutil["top_processes"]))
    check("procesor: procent 0–100", 0 <= with_psutil["cpu"].get("percent", -1) <= 100)
    saved, si.psutil = si.psutil, None
    try:
        run("Bez psutil (tylko biblioteka standardowa)")
        if sys.platform == "win32":   # ścieżka ctypes ma dawać to samo co psutil (łapie przekręcanie 32-bitowe po 24,8 dnia działania)
            check("czas działania: ctypes ≈ psutil (różnica < 0,2 godz.)", abs((si.uptime_hours() or -99) - (with_psutil["uptime_h"] or 99)) < 0.2, f'{si.uptime_hours()} vs {with_psutil["uptime_h"]}')
        check("bez psutil: brak procesów, ale bez wyjątku", si.snapshot()["top_processes"] == [])
    finally:
        si.psutil = saved

d = si.snapshot("C" if sys.platform == "win32" else None)
check("filtr dysku: tylko wskazany", len(d["disks"]) == 1, str(d["disks"]))
if sys.platform == "win32":
    check("filtr dysku: zapis „c:\\” i „C:” działa tak samo", si.snapshot("c:\\")["disks"] == d["disks"] or [x["drive"] for x in si.snapshot("c:\\")["disks"]] == ["C"])
    nd = si.snapshot("Q")
    check("nieistniejący dysk: pusta lista i czytelny komunikat", nd["disks"] == [] and "Nie widzę dysku Q" in si.describe(nd, "Q"), si.describe(nd, "Q")[:120])
fake = {"disks": [{"drive": "C", "total_gb": 475.7, "free_gb": 34.3, "used_gb": 441.4, "used_pct": 92.8}], "memory": {"total_gb": 15.8, "free_gb": 1.2, "used_pct": 92.3},
        "cpu": {"logical": 12, "percent": 40.8}, "uptime_h": 281.4, "top_processes": [{"name": "a.exe", "mb": 2619}]}
check("opis: dokładne zdania", si.describe(fake, "C") == "Dysk C: wolne 34,3 GB z 475,7 GB (zajęte 92,8%). Pamięć RAM: wolne 1,2 GB z 15,8 GB (zajęte 92,3%). Procesor: obciążenie 40,8% (12 wątków). Komputer działa od 281,4 godz. Największe programy w pamięci: a.exe (2619 MB).", si.describe(fake, "C"))
check("opis: pusty wynik nie wywraca", si.describe({}) == "Nie udało się odczytać stanu komputera.")

print("\n" + ("WSZYSTKO OK" if not fails else f"BŁĘDY ({len(fails)}): " + ", ".join(fails)))
sys.exit(1 if fails else 0)
