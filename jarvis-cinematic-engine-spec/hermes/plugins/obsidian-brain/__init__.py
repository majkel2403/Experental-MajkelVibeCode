"""obsidian-brain — sejf Obsidian Michała w kontekście Jarvisa od pierwszej wiadomości rozmowy.

Wcześniej Hermes miał tylko prośbę w skillu „obsidian” (czytaj na start SOUL/CRITICAL_FACTS/hot/log) — model
często tego nie robił. Hak `pre_llm_call` w pierwszej turze sesji dokleja do wiadomości użytkownika skrót
plików sterujących sejfu (+ lista notatek czekających w 00 - Inbox/ForAI), więc kontekst jest zawsze, bez wywołań narzędzi. Hermes zapisuje tę wstawkę przy
wiadomości (sidecar), więc zostaje w kolejnych turach tej samej rozmowy.

Zasady:
- wstawka tylko wtedy, gdy rozmowa jej jeszcze nie ma: Telegram / sesje z bazy — raz na rozmowę (zostaje w historii,
  wraca po kompresji, która ją wytnie); karta Jarvis OS przysyła historię bez wstawek — dostaje ją w każdej turze;
- crony i procesy pomocnicze pomijane (Solana Radar co 5 min = koszt bez pożytku);
- łącznie < MAX_TOTAL znaków — powyżej 10 000 Hermes przenosi wstawkę do pliku (hooks.output_spill);
- tylko odczyt; brak sejfu / błąd = None (rozmowa idzie dalej bez kontekstu).
"""
from __future__ import annotations

import os
import re
from datetime import date
from pathlib import Path
from typing import Any

DEFAULT_VAULT = Path.home() / "Documents" / "hermes"
SKIP_PLATFORMS = {"cron", "subagent", "curator", "background_review"}
MAX_TOTAL = 9500          # zapas pod próg hooks.output_spill.max_chars (10 000)
BUDGET = {"CRITICAL_FACTS.md": 3800, "hot.md": 3200}
LOG_LINES = 8
LOG_LINE_MAX = 200
FORAI_MAX = 10
# Sekcje pomijane (fragment tytułu, małe litery): preambuła = opis pliku; „co wiemy o michale” powtarza
# CRITICAL_FACTS/SOUL; nawigacja to same wikilinki.
SKIP_SECTIONS = ("dla przyszłego jarvisa", "for future jarvis", "co wiemy o michale", "quick nav")

MARKER = "[Drugi mózg — sejf Obsidian Michała"
HEADER = MARKER + """, wczytany automatycznie na start rozmowy]
Sejf: {vault}  (wspólny z Claude Code; reguły zapisu: `_CLAUDE.md`, skill `obsidian`).
- Poniższe to migawka plików sterujących — porty, modele, stany usług weryfikuj na żywo, zanim na nich oprzesz decyzję.
- Więcej kontekstu na żądanie: `SOUL.md` (preferencje), `index.md` (katalog), `01 - Daily/{today}.md`, `02 - Projects/`, `wiki/`.
- Po istotnej pracy: wiersz na końcu `log.md` (`| RRRR-MM-DD GG:MM | TYP | [Jarvis] opis |`), punkt w `hot.md`, sesja w dzienniku dnia.
- Wpisy oznaczone [Claude Code] pochodzą od drugiego agenta (projekty kodu: `wiki/entities/Claude Code.md`)."""


def vault_path() -> Path:
    return Path(os.environ.get("OBSIDIAN_VAULT_PATH") or DEFAULT_VAULT)


TABLE_SEP = re.compile(r"^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$")


def _strip(text: str) -> str:
    """Sama treść, gęsto: bez frontmattera, preambuły „Dla przyszłego Jarvisa”, cytatów-opisów, linii poziomych,
    stopek *…*, sekcji z SKIP_SECTIONS; tabele jako „a · b · c” bez wiersza nagłówka."""
    text = text.replace("\r\n", "\n")
    if text.startswith("---\n"):
        end = text.find("\n---", 4)
        if end != -1:
            text = text[end + 4:]
    lines = text.split("\n")
    keep: list[str] = []
    skip_level = 0                       # >0 = pomijamy sekcję tego poziomu nagłówka
    for i, line in enumerate(lines):
        s = line.strip()
        head = re.match(r"^(#{1,6})\s+(.*)$", s)
        if head:
            level = len(head.group(1))
            if skip_level and level > skip_level:
                continue
            skip_level = 0
            title = head.group(2).lower()
            if any(k in title for k in SKIP_SECTIONS):
                skip_level = level
                continue
            if level == 1:               # tytuł pliku jest już w nagłówku „=== plik ===”
                continue
        elif skip_level:
            continue
        if s in ("---", "***") or s.startswith(">") or TABLE_SEP.match(s):
            continue
        if s.startswith("*") and s.endswith("*") and not s.startswith("**"):
            continue
        if s.startswith("|"):
            nxt = lines[i + 1].strip() if i + 1 < len(lines) else ""
            if TABLE_SEP.match(nxt):     # wiersz nagłówka tabeli — w gęstym zapisie zbędny
                continue
            cells = [c.strip() for c in s.strip("|").split("|")]
            line = " · ".join(c for c in cells if c)
        keep.append(line.rstrip())
    return re.sub(r"\n{3,}", "\n\n", "\n".join(keep)).strip()


def _cut(text: str, limit: int, name: str) -> str:
    if len(text) <= limit:
        return text
    cut = text.rfind("\n", 0, limit)
    return text[: cut if cut > 0 else limit].rstrip() + f"\n… (skrócone — pełny plik: {name})"


def _read(vault: Path, name: str) -> str:
    try:
        return (vault / name).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def _log_tail(raw: str, n: int = LOG_LINES) -> str:
    """Ostatnie wpisy log.md — linie zaczynające się datą (tabela lub format z myślnikami), od najnowszych."""
    rows = []
    for line in raw.replace("\r\n", "\n").split("\n"):
        s = line.strip().strip("|").strip()
        m = re.match(r"(\d{4}-\d{2}-\d{2}(?: [~\d:]+)?)", s)
        if m:
            rows.append((m.group(1), s))
    rows.sort(key=lambda r: r[0])           # stabilnie: wpisy bez godziny przed tymi z godziną tego dnia
    out = []
    for _, s in rows[-n:][::-1]:
        s = re.sub(r"\s*\|\s*", " | ", s)
        out.append("- " + (s if len(s) <= LOG_LINE_MAX else s[:LOG_LINE_MAX].rstrip() + "…"))
    return "\n".join(out)


def _forai(vault: Path, limit: int = FORAI_MAX) -> str:
    """Notatki od Michała czekające w 00 - Inbox/ForAI — Jarvis ma je zobaczyć od pierwszej wiadomości."""
    try:
        notes = sorted(p for p in (vault / "00 - Inbox" / "ForAI").glob("*.md") if p.is_file())
    except OSError:
        return ""
    if not notes:
        return ""
    lines = [f"=== 📥 Skrzynka ForAI: {len(notes)} notatek od Michała czeka (00 - Inbox/ForAI) ==="]
    lines += [f"- {p.stem}" for p in notes[:limit]]
    if len(notes) > limit:
        lines.append(f"- … i {len(notes) - limit} więcej")
    lines.append("Przeczytaj je, gdy pasują do rozmowy albo Michał o nie zapyta; po obsłużeniu przenieś notatkę z ForAI.")
    return "\n".join(lines)


def build_context(vault: Path | None = None, today: str | None = None) -> str | None:
    vault = vault or vault_path()
    if not (vault / "CRITICAL_FACTS.md").is_file() and not (vault / "hot.md").is_file():
        return None
    parts = [HEADER.format(vault=vault, today=today or date.today().isoformat())]
    for name, limit in BUDGET.items():
        body = _strip(_read(vault, name))
        if body:
            parts.append(f"=== {name} ===\n" + _cut(body, limit, name))
    log = _log_tail(_read(vault, "log.md"))
    if log:
        parts.append(f"=== log.md — ostatnie {LOG_LINES} wpisów (najnowsze u góry) ===\n" + log)
    inbox = _forai(vault)
    if inbox:
        parts.append(inbox)
    text = "\n\n".join(parts) + "\n[koniec kontekstu sejfu]"
    return _cut(text, MAX_TOTAL, "sejf")


def _already_injected(history: Any) -> bool:
    """Czy któraś wcześniejsza wiadomość tej rozmowy niesie już wstawkę sejfu.
    Historia z bazy Hermesa (Telegram, X-Hermes-Session-Id) ma `api_content` z wstawką; historia przysłana
    przez klienta w treści zapytania (karta Jarvis OS) — nie, więc tam sejf idzie w każdej turze."""
    for m in history or []:
        if not isinstance(m, dict):
            continue
        for key in ("api_content", "content"):
            v = m.get(key)
            if isinstance(v, str) and MARKER in v:
                return True
    return False


def register(ctx) -> None:
    def pre_llm_call(is_first_turn=False, platform=None, conversation_history=None, **_kw: Any):
        if (platform or "").strip().lower() in SKIP_PLATFORMS:
            return None
        if not is_first_turn and _already_injected(conversation_history):
            return None   # sejf już jest w tej rozmowie (np. po kompresji zniknie — wtedy wróci)
        try:
            text = build_context()
        except Exception:   # noqa: BLE001 — sejf niedostępny nie może zatrzymać rozmowy
            return None
        return {"context": text} if text else None

    ctx.register_hook("pre_llm_call", pre_llm_call)
