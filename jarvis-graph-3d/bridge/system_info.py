"""Stan komputera tylko do odczytu: miejsce na dyskach, pamięć RAM, procesor, czas działania, największe procesy.

Po co: pytanie „ile mam wolnego miejsca na dysku” wymagało od Hermesa polecenia `powershell -c …`, a zgody Hermesa odrzucają je
natychmiast (`approvals.unattended_mode: deny` dla api_server); model próbował wtedy obejść blokadę zapisem skryptu do pliku
(audyt 2026-10-05). To narzędzie odpowiada na takie pytania bez powłoki, bez zapisu i bez uruchamiania czegokolwiek.

Działa z `psutil` (jest w venv Hermesa), a bez niego — z samej biblioteki standardowej (Windows: ctypes). Zwraca tylko liczby
i nazwy programów (bez ścieżek, argumentów i użytkowników procesów).
"""
from __future__ import annotations

import os
import shutil
import sys
import time
from typing import Any

GB = 1024 ** 3
MB = 1024 ** 2

try:  # opcjonalne — pełniejszy odczyt (procesor, procesy, czas startu)
    import psutil  # type: ignore
except Exception:  # noqa: BLE001 — brak psutil nie jest błędem
    psutil = None


def _gb(n: float) -> float:
    return round(n / GB, 1)


def _drives() -> list[str]:
    """Litery dysków stałych (Windows) albo „/” gdzie indziej."""
    if os.name != "nt":
        return ["/"]
    try:
        import ctypes
        mask = ctypes.windll.kernel32.GetLogicalDrives()  # type: ignore[attr-defined]
        out = []
        for i in range(26):
            if mask & (1 << i):
                letter = chr(65 + i)
                # 3 = DRIVE_FIXED (pomijamy płyty, pendrive'y i dyski sieciowe)
                if ctypes.windll.kernel32.GetDriveTypeW(f"{letter}:\\") == 3:  # type: ignore[attr-defined]
                    out.append(letter)
        return out or ["C"]
    except Exception:  # noqa: BLE001
        return ["C"]


def disks(only: str | None = None) -> list[dict[str, Any]]:
    letters = _drives()
    if only:
        only = only.strip().rstrip(":\\/").upper()[:1]
        letters = [x for x in letters if x.upper() == only] if os.name == "nt" else letters
    out = []
    for d in letters:
        path = f"{d}:\\" if os.name == "nt" else d
        try:
            u = shutil.disk_usage(path)
        except OSError:
            continue
        out.append({"drive": d, "total_gb": _gb(u.total), "free_gb": _gb(u.free), "used_gb": _gb(u.used),
                    "used_pct": round(u.used / u.total * 100, 1) if u.total else 0.0})
    return out


def memory() -> dict[str, Any] | None:
    if psutil:
        m = psutil.virtual_memory()
        return {"total_gb": _gb(m.total), "free_gb": _gb(m.available), "used_pct": round(m.percent, 1)}
    if os.name == "nt":
        try:
            import ctypes

            class MEMSTATUS(ctypes.Structure):
                _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong), ("ullTotalPhys", ctypes.c_ulonglong),
                            ("ullAvailPhys", ctypes.c_ulonglong), ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                            ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong), ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]
            st = MEMSTATUS()
            st.dwLength = ctypes.sizeof(MEMSTATUS)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(st))  # type: ignore[attr-defined]
            return {"total_gb": _gb(st.ullTotalPhys), "free_gb": _gb(st.ullAvailPhys), "used_pct": float(st.dwMemoryLoad)}
        except Exception:  # noqa: BLE001
            return None
    return None


def uptime_hours() -> float | None:
    try:
        if psutil:
            return round((time.time() - psutil.boot_time()) / 3600, 1)
        if os.name == "nt":
            import ctypes
            k = ctypes.windll.kernel32  # type: ignore[attr-defined]
            k.GetTickCount64.restype = ctypes.c_ulonglong   # domyślny typ (32-bit int) przekręcałby się po 24,8 dnia działania komputera
            return round(k.GetTickCount64() / 3_600_000, 1)
    except Exception:  # noqa: BLE001
        pass
    return None


def cpu() -> dict[str, Any]:
    out: dict[str, Any] = {"logical": os.cpu_count() or 0}
    if psutil:
        try:
            out["percent"] = round(psutil.cpu_percent(interval=0.25), 1)
        except Exception:  # noqa: BLE001
            pass
    return out


def top_processes(n: int = 5) -> list[dict[str, Any]]:
    """Największe procesy wg pamięci — tylko nazwa programu i MB (bez ścieżek, argumentów i właściciela)."""
    if not psutil:
        return []
    agg: dict[str, float] = {}
    for p in psutil.process_iter(["name", "memory_info"]):
        try:
            mi = p.info.get("memory_info")
            if mi:
                nm = str(p.info.get("name") or "?")[:40]
                agg[nm] = agg.get(nm, 0) + mi.rss
        except Exception:  # noqa: BLE001 — proces mógł zniknąć albo być niedostępny
            continue
    return [{"name": k, "mb": round(v / MB)} for k, v in sorted(agg.items(), key=lambda kv: -kv[1])[:n]]


def snapshot(drive: str | None = None, processes: int = 5) -> dict[str, Any]:
    out: dict[str, Any] = {"disks": disks(drive), "memory": memory(), "cpu": cpu(), "uptime_h": uptime_hours(),
                           "top_processes": top_processes(processes), "platform": sys.platform, "ts": time.time()}
    return out


def _num(x: float) -> str:
    return f"{x:.1f}".replace(".", ",")


def describe(d: dict[str, Any], drive: str | None = None) -> str:
    """Odpowiedź po polsku, jedna–trzy krótkie linie."""
    lines = []
    for k in d.get("disks") or []:
        lines.append(f"Dysk {k['drive']}: wolne {_num(k['free_gb'])} GB z {_num(k['total_gb'])} GB (zajęte {_num(k['used_pct'])}%).")
    if drive and not d.get("disks"):
        lines.append(f"Nie widzę dysku {str(drive).strip().rstrip(':').upper()[:1]}: wśród dysków stałych.")
    m = d.get("memory")
    if m:
        lines.append(f"Pamięć RAM: wolne {_num(m['free_gb'])} GB z {_num(m['total_gb'])} GB (zajęte {_num(m['used_pct'])}%).")
    c = d.get("cpu") or {}
    if "percent" in c:
        lines.append(f"Procesor: obciążenie {_num(c['percent'])}% ({c.get('logical')} wątków).")
    if d.get("uptime_h") is not None:
        lines.append(f"Komputer działa od {_num(d['uptime_h'])} godz.")
    tp = d.get("top_processes") or []
    if tp:
        lines.append("Największe programy w pamięci: " + ", ".join(f"{p['name']} ({p['mb']} MB)" for p in tp) + ".")
    return " ".join(lines) or "Nie udało się odczytać stanu komputera."
