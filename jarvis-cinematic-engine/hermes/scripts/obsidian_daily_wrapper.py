"""Cron „Obsidian Daily Context” (7:30, no_agent): dzienny kontekst z prawdziwych danych sejfu.

Przepisany 2026-10-05 (Claude Code). Poprzednia wersja wołała `obsidian-capture.py daily`, które co rano
tworzyło pusty szkielet AI Context, fałszywy dziennik z 14-sekcyjnego szablonu i wpis log.md nad tytułem,
a potem kopiowało plik z korzenia sejfu, którego cron nie tworzy.

Teraz, bez modelu i bez kosztów:
- `01 - Daily/AI Context/AI-Context-RRRR-MM-DD.md` (czyta go `obsidian-context.py daily` i poniedziałkowy briefing):
  najnowsze z hot.md, ostatnie wpisy log.md, projekty ze statusem, skrzynka ForAI, zdrowie sejfu;
- jeden wiersz na końcu log.md (raz dziennie);
- kopia pamięci Jarvisa → `04 - Resources/Hermes Memory.md` (`sync-memory-to-obsidian.py`);
- nie tworzy dziennika i nie rusza hot.md.
Źródło: repo Jarvis OS `hermes/scripts/` (kopiowane do profilu i `~/.hermes/scripts` przez `apply_profile.py`).
"""
import json
import os
import re
import subprocess
import sys
from datetime import date, datetime
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):   # konsola/cron na Windows = cp1250, a wypisujemy emoji
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

VAULT = Path(os.environ.get("OBSIDIAN_VAULT_PATH") or r"C:\Users\majke\Documents\hermes")
SCRIPT_DIR = Path(__file__).resolve().parent
HEALTH = SCRIPT_DIR / "vault_health.py"
MEMORY_SYNC = SCRIPT_DIR / "sync-memory-to-obsidian.py"
TODAY = date.today().isoformat()


def read(rel: str) -> str:
    try:
        return (VAULT / rel).read_text(encoding="utf-8", errors="replace").replace("\r\n", "\n")
    except OSError:
        return ""


def frontmatter(text: str) -> dict:
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    out = {}
    for line in (m.group(1).splitlines() if m else []):
        k, _, v = line.partition(":")
        out[k.strip()] = v.strip().strip('"')
    return out


def hot_latest(limit: int = 1400) -> str:
    hot = read("hot.md")
    m = re.search(r"^## 🕐 Ostatnia aktualizacja\s*\n(.*?)(?=^## )", hot, re.S | re.M)
    body = (m.group(1) if m else "").strip()
    body = re.sub(r"\n-{3,}\s*$", "", body).strip()   # separator przed następną sekcją
    return body[:limit].rsplit("\n", 1)[0] + "\n…" if len(body) > limit else body or "- (brak sekcji „Ostatnia aktualizacja” w hot.md)"


def log_tail(n: int = 8) -> str:
    rows = []
    for line in read("log.md").split("\n"):
        s = line.strip().strip("|").strip()
        if re.match(r"\d{4}-\d{2}-\d{2}", s):
            rows.append(re.sub(r"\s*\|\s*", " | ", s))
    rows.sort(key=lambda r: r[:16])
    return "\n".join(f"- {r[:220]}" for r in rows[-n:][::-1]) or "- (pusty log)"


def projects() -> str:
    out = []
    for p in sorted((VAULT / "02 - Projects").glob("*.md")):
        if p.stem.endswith("Hub"):
            continue
        fm = frontmatter(read(f"02 - Projects/{p.name}"))
        status = fm.get("status", "?")
        upd = fm.get("updated") or fm.get("date") or "?"
        out.append(f"- [[{p.stem}]] — {status} (aktualizacja {upd})")
    return "\n".join(out) or "- (brak notatek projektów)"


def forai() -> str:
    notes = sorted((VAULT / "00 - Inbox" / "ForAI").glob("*.md"))
    if not notes:
        return "- pusta"
    return f"- **{len(notes)} notatek czeka** na przetworzenie:\n" + "\n".join(f"  - [[{p.stem}]]" for p in notes[:15])


def health() -> str:
    if not HEALTH.exists():
        return "- vault_health.py niedostępny"
    try:
        r = subprocess.run([sys.executable, str(HEALTH), "--path", str(VAULT), "--json"], capture_output=True,
                           text=True, encoding="utf-8", timeout=120)
        d = json.loads(r.stdout)
        warn = d.get("warnings") or []
        lines = [f"- krytyczne: {len(d.get('critical') or [])}, ostrzeżenia: {len(warn)} (zakres: {d.get('scope', '?')}, notatek: {d.get('total_notes', '?')})"]
        for w in warn[:5]:
            lines.append(f"  - {w.get('type', '?')}: {w.get('count', '?')}")
        return "\n".join(lines)
    except Exception as e:  # noqa: BLE001
        return f"- nie udało się uruchomić vault_health.py: {e}"


def append_log(entry: str) -> None:
    log = VAULT / "log.md"
    raw = log.read_bytes().decode("utf-8", errors="replace") if log.exists() else "# log.md\n"
    if f"| {TODAY}" in raw and "DAILY-CONTEXT" in raw.split(f"| {TODAY}", 1)[1]:
        return   # dziś już zalogowane
    nl = "\r\n" if "\r\n" in raw else "\n"
    with open(log, "w", encoding="utf-8", newline="") as f:
        f.write(raw.rstrip("\r\n") + nl + entry + nl)


def main() -> None:
    ctx = f"""---
date: {TODAY}
type: ai-context
tags: [ai-context, daily, hermes]
ai-first: true
source: hermes-cron
---

# 🤖 AI Context — {TODAY}

## Dla przyszłego Jarvisa

Dzienny kontekst złożony automatycznie o {datetime.now():%H:%M} z plików sejfu (bez modelu). Szczegóły: [[hot]], [[log]], [[index]]. Fakty o usługach i portach weryfikuj na żywo.

## 🕐 Najnowsze (z hot.md)

{hot_latest()}

## 📋 Ostatnie wpisy log.md

{log_tail()}

## 🚀 Projekty

{projects()}

## 📥 Skrzynka ForAI

{forai()}

## 🩺 Zdrowie sejfu (vault_health.py, warstwa core)

{health()}
"""
    out = VAULT / "01 - Daily" / "AI Context" / f"AI-Context-{TODAY}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(ctx, encoding="utf-8")
    append_log(f"| {datetime.now():%Y-%m-%d %H:%M} | DAILY-CONTEXT | [Jarvis] dzienny kontekst → [[AI-Context-{TODAY}]] |")
    print(f"OK: {out.relative_to(VAULT)}")
    if MEMORY_SYNC.exists():   # kopia pamięci Jarvisa do sejfu — błąd nie psuje dziennego kontekstu
        r = subprocess.run([sys.executable, str(MEMORY_SYNC)], capture_output=True, text=True, encoding="utf-8",
                           timeout=60, env={**os.environ, "PYTHONIOENCODING": "utf-8"})
        tail = (r.stdout or r.stderr or "").strip().splitlines()
        print(tail[-1] if tail else "pamięć: brak wyjścia")


if __name__ == "__main__":
    main()
