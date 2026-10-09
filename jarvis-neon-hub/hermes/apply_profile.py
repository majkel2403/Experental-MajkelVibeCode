"""Konfiguruje profil Hermesa dla Jarvis OS: most MCP pulpitu + ograniczony kanał API pulpitu.

Od 2026-10-03 jarvis-desktop to JEDYNY profil (Telegram z pełnym zestawem narzędzi + API pulpitu).
Skrypt NIE wyłącza narzędzi globalnie, NIE usuwa sekretów Telegrama i NIE nadpisuje reasoning_effort —
ogranicza tylko kanał api_server (platform_toolsets.api_server).

Uruchamiaj Pythonem z venv Hermesa (ma PyYAML):
  %USERPROFILE%\\.hermes\\hermes-agent\\venv\\Scripts\\python.exe hermes\\apply_profile.py --home %USERPROFILE%\\.hermes --name jarvis-desktop

Zmienia WYŁĄCZNIE profil docelowy: config.yaml (z kopią zapasową; docelowe ustawienia z TARGET), .env, SOUL.md, scripts/,
bloki generowane w skillu jarvis-os-management oraz HERMES.md w katalogu roboczym (JarvisWorkspace, tworzony z własnym .git).
Skrypt jest idempotentny: ponowne uruchomienie daje ten sam stan, a strażnik (scripts/config_guard.py) sprawdza go codziennie.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import shutil
import sys
import time
from pathlib import Path

import yaml

for _s in (sys.stdout, sys.stderr):   # konsola Windows bywa w cp1250 — bez tego polskie znaki to krzaczki
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).resolve().parent
# Pełny zestaw jak na Telegramie (SOUL §2.9 obiecuje terminal/pliki/kod/skille także z pulpitu — decyzja z 2026-10-03),
# bez stt/tts (kanały głosowe; pulpit ma własną mowę). jarvis_desktop = nazwa serwera MCP (allowlista).
ENABLED = ["browser", "clarify", "code_execution", "computer_use", "connections", "cronjob", "delegation",
           "file", "memory", "session_search", "skills", "terminal", "todo", "vision", "web", "jarvis_desktop"]
ORIGINS = "http://localhost:4000,http://127.0.0.1:4000"   # bez github.io: gateway ma pełne narzędzia (terminal, pliki) — tylko strona z tego komputera

# Katalog roboczy Hermesa: własne repo git (izolacja od C:\.git — inaczej cały dysk jest „projektem”), tu leży HERMES.md.
WORKSPACE = Path.home() / "JarvisWorkspace"

# Docelowa konfiguracja (audyt 2026-10-04, docs/adr/0002). Klucze kropkowane = ścieżka w config.yaml. Strażnik (scripts/config_guard.py) sprawdza to samo.
TARGET = {
    "compression.threshold_tokens": 120000,      # streszczanie przy ~120 tys. tokenów (bez tego: ~500 tys. przy oknie 1 mln; fallback M2.5 ma 205 tys.)
    "session_reset.idle_minutes": 120,           # świeża sesja po 2 h ciszy (długie wątki = wolniej i więcej pomyłek)
    "memory.nudge_interval": 0,                  # bez zapisów pamięci „w tle” (wpisywały rozkazy zamiast faktów)
    "kanban.dispatch_in_gateway": False,         # kanban nieużywany
    "kanban.auto_decompose": False,
    "delegation.max_concurrent_children": 3,     # limit tokenów MiniMax (429) — 10 równoległych dzieci to za dużo
    "auxiliary.vision.provider": "minimax",      # „auto” mogło wybrać płatnego dostawcę
    "auxiliary.vision.model": "MiniMax-M3",
    "tools.tool_search.enabled": "off",          # narzędzia pulpitu widoczne wprost: MiniMax psuje wywołania przez tool_search/tool_call
                                                 # (test na żywo 2026-10-04: „zamykam widgety” bez wywołania, złe argumenty przez tool_call)
    "approvals.unattended_mode": "deny",         # = domyślne wg dokumentacji Hermesa (security.md), zapisane wprost: sesje bez człowieka (api_server — karta Jarvisa,
                                                 # evale; webhook) natychmiast odrzucają niebezpieczne polecenia zamiast czekać na zgodę; drogą do stanu
                                                 # komputera jest narzędzie `system_info` w moście, nie `powershell -c` (audyt 2026-10-05)
}
PLUGINS_ENABLED = ["disk-cleanup", "hermes-memory-ui", "jarvis-events", "rtk-rewrite", "security-guidance", "web/ddgs"]
# Wtyczki z repo (hermes/plugins/<nazwa>) kopiowane do profilu przy każdym uruchomieniu; jarvis-events = zadania Hermesa na pulpicie
REPO_PLUGINS = ["jarvis-events"]
# superpowers: co sesję doklejał ~9 KB „1% szans → MUSISZ użyć skilla”; planning-with-files: pusty plan w każdej turze;
# skill-retrieval: 6 losowo dobranych skilli w każdej turze; ui-review-loop: zależny od kanbanu.
PLUGINS_DISABLED = ["browser/browser_use", "planning-with-files", "skill-retrieval", "superpowers", "ui-review-loop"]
REMOVE_KEYS = ["moa", "agent.personalities", "plugins.hermes-memory-store"]
# Bez stałej zgody na operacje niszczące — te zawsze ocenia tryb smart albo pyta użytkownika.
# (Stałą zgodę „script execution via heredoc” użytkownik dał „zawsze” na Telegramie 2026-10-04 07:31 — jego decyzja, nie ruszamy.
#  „script execution via -e/-c flag” NIE jest na liście: `powershell -c …` wymaga zgody i w sesjach bez człowieka jest odrzucane.)
DANGEROUS_ALLOW = {"force kill processes (Stop-Process -Force)", "force kill processes (taskkill /F)", "recursive delete"}
ENV_DROP = ("TELEGRAM_ALLOW_ALL_USERS", "GATEWAY_ALLOW_ALL_USERS")   # tylko lista TELEGRAM_ALLOWED_USERS


def set_path(cfg: dict, dotted: str, value) -> None:
    *parents, leaf = dotted.split(".")
    node = cfg
    for p in parents:
        if not isinstance(node.get(p), dict):
            node[p] = {}
        node = node[p]
    node[leaf] = value


def drop_path(cfg: dict, dotted: str) -> bool:
    *parents, leaf = dotted.split(".")
    node = cfg
    for p in parents:
        node = node.get(p) if isinstance(node, dict) else None
        if not isinstance(node, dict):
            return False
    return node.pop(leaf, None) is not None


def apply_target(cfg: dict) -> list[str]:
    """Docelowe ustawienia profilu (idempotentnie). Zwraca listę zmian do wypisania."""
    changes = []
    for dotted, value in TARGET.items():
        cur = cfg
        for p in dotted.split("."):
            cur = cur.get(p) if isinstance(cur, dict) else None
        if cur != value:
            set_path(cfg, dotted, value)
            changes.append(f"{dotted}={value}")
    terminal = cfg.setdefault("terminal", {})
    if terminal.get("cwd") != str(WORKSPACE):
        terminal["cwd"] = str(WORKSPACE)
        changes.append(f"terminal.cwd={WORKSPACE}")
    plugins = cfg.setdefault("plugins", {})
    if plugins.get("enabled") != PLUGINS_ENABLED or plugins.get("disabled") != PLUGINS_DISABLED:
        plugins["enabled"], plugins["disabled"] = list(PLUGINS_ENABLED), list(PLUGINS_DISABLED)
        changes.append("plugins.enabled/disabled")
    entries = plugins.get("entries") or {}
    for name in PLUGINS_DISABLED:
        if entries.pop(name, None) is not None:
            changes.append(f"plugins.entries.{name} usunięty")
    for dotted in REMOVE_KEYS:
        if drop_path(cfg, dotted):
            changes.append(f"{dotted} usunięty")
    allow = cfg.get("command_allowlist") or []
    kept = [x for x in allow if x not in DANGEROUS_ALLOW]
    if kept != allow:
        cfg["command_allowlist"] = kept
        changes.append(f"command_allowlist: −{len(allow) - len(kept)} niebezpiecznych")
    return changes


def ensure_workspace() -> None:
    """Katalog roboczy z własnym .git (granica wyszukiwania HERMES.md/AGENTS.md przez Hermesa)."""
    import subprocess
    WORKSPACE.mkdir(exist_ok=True)
    if not (WORKSPACE / ".git").exists():
        subprocess.run(["git", "init", "-q", str(WORKSPACE)], check=True)
    gi = WORKSPACE / ".gitignore"
    if not gi.exists():
        gi.write_text("# Katalog roboczy Hermesa — wersjonowane są tylko pliki dodane świadomie\n.out/\n.bak/\n*.tmp\n", encoding="utf-8")
    readme = WORKSPACE / "README.md"
    if not readme.exists():
        readme.write_text("# JarvisWorkspace\n\nKatalog roboczy Hermesa (profil jarvis-desktop, `terminal.cwd`). "
                          "`HERMES.md` jest kopiowany z repozytorium Jarvis OS (`hermes/HERMES.md`) przez `hermes/apply_profile.py` — nie edytuj kopii.\n",
                          encoding="utf-8")


CHEAT_TOOLS = ["desktop_open", "desktop_screenshot", "get_status", "open_app", "close_app", "wm_list", "wm_focus", "wm_arrange", "wm_minimize",
               "create_widget", "widgets_list", "widgets_update", "widgets_remove", "create_note", "notes_list", "notes_read", "notes_append",
               "notes_delete", "add_task", "tasks_list", "tasks_complete", "tasks_remove", "start_timer", "timer_control", "set_theme",
               "set_wallpaper", "ui_mode", "ui_toast", "ui_ask", "ui_highlight", "speak", "e2e_cleanup", "media_play", "web_task", "computer_use",
               "workflow_list", "workflow_run", "workflow_status", "workflow_stop", "workflow_answer"]
CHEAT_BEGIN, CHEAT_END = "<!-- JARVIS-TOOLS:BEGIN (generowane przez hermes/apply_profile.py z bridge/tools.json — nie edytuj ręcznie) -->", "<!-- JARVIS-TOOLS:END -->"


def cheatsheet() -> str:
    """Najczęstsze narzędzia z DOKŁADNYMI nazwami pól — modele myliły id/widget, theme/color, selector/target."""
    tools = {t["name"]: t for t in json.loads((HERE.parent / "bridge" / "tools.json").read_text(encoding="utf-8"))}
    lines = [CHEAT_BEGIN, "## Najczęstsze narzędzia — dokładne pola (`*` = wymagane)", "",
             "Wołaj wprost (`mcp__jarvis_desktop__<nazwa>`), **jedno narzędzie pulpitu na wywołanie**; sukces potwierdzaj dopiero po `ok=true`.", ""]
    for n in CHEAT_TOOLS:
        t = tools.get(n)
        if not t:
            continue
        p = t.get("parameters") or {}
        req = set(p.get("required") or [])
        args = []
        for k, v in (p.get("properties") or {}).items():
            if k == "user_confirmed_in_chat":
                continue
            a = k + ("*" if k in req else "")
            if v.get("enum"):
                a += "=" + "|".join(map(str, v["enum"][:8])) + ("|…" if len(v["enum"]) > 8 else "")
            args.append(a)
        conf = " · zgoda: pulpit albo rozmowa (`user_confirmed_in_chat`)" if "user_confirmed_in_chat" in (p.get("properties") or {}) else (" · zgoda tylko na pulpicie" if "Wymaga potwierdzenia" in t.get("description", "") else "")
        lines.append(f"- `mcp__jarvis_desktop__{n}`({', '.join(args)}){conf}")
    lines += ["", CHEAT_END]
    return "\n".join(lines)


def inject_block(skill: Path, begin: str, end: str, block: str) -> bool:
    """Podmienia blok między znacznikami (begin bez dopisku w nawiasie identyfikuje blok), a gdy go nie ma — dokleja na końcu."""
    if not skill.exists():
        return False
    s = skill.read_text(encoding="utf-8")
    key = begin.split(" (")[0]
    if key in s:
        s = re.sub(re.escape(key) + r".*?" + re.escape(end), lambda _m: block, s, flags=re.S)
    else:
        s = s.rstrip() + "\n\n" + block + "\n"
    skill.write_text(s, encoding="utf-8")
    return True


def inject_cheatsheet(skill: Path) -> bool:
    return inject_block(skill, CHEAT_BEGIN, CHEAT_END, cheatsheet())


CAT_BEGIN, CAT_END = "<!-- JARVIS-CATALOG:BEGIN (z hermes/skills/jarvis-os-catalog.md — nie edytuj ręcznie) -->", "<!-- JARVIS-CATALOG:END -->"


def inject_catalog(skill: Path) -> bool:
    """Katalog możliwości pulpitu (dawny SOUL §4) — wiedza na żądanie w skillu, nie w tożsamości."""
    src = HERE / "skills" / "jarvis-os-catalog.md"
    return src.exists() and inject_block(skill, CAT_BEGIN, CAT_END, CAT_BEGIN + "\n" + src.read_text(encoding="utf-8").strip() + "\n" + CAT_END)


GUARD_HOOK_MATCHER = "terminal|execute_code"


def guard_hook_command(pdir: Path) -> str:
    return f"{sys.executable} {pdir / 'scripts' / 'guard_tools.py'}"


def set_guard_hook(cfg: dict, cmd: str) -> None:
    """Twarde blokady (hak pre_tool_call) zamiast próśb w SOUL: wpis tylko dla guard_tools.py, inne haki zostają."""
    hooks = cfg.get("hooks") or {}
    cfg["hooks"] = hooks
    lst = [h for h in (hooks.get("pre_tool_call") or []) if not (isinstance(h, dict) and "guard_tools.py" in str(h.get("command", "")))]
    lst.append({"matcher": GUARD_HOOK_MATCHER, "command": cmd, "timeout": 10})
    hooks["pre_tool_call"] = lst


def approve_guard_hook(pdir: Path, cmd: str) -> bool:
    """Zgoda pierwszego użycia TYLKO dla naszego haka (to samo co --accept-hooks, ale bez akceptowania obcych haków).
    Gateway działa bez terminala — bez wpisu w shell-hooks-allowlist.json hak po cichu by się nie zarejestrował."""
    import subprocess
    env = dict(os.environ, HERMES_HOME=str(pdir))
    code = "import sys; from agent.shell_hooks import _record_approval; _record_approval('pre_tool_call', sys.argv[1])"
    return subprocess.run([sys.executable, "-c", code, cmd], env=env, capture_output=True).returncode == 0


def context_dir(cfg: dict) -> Path:
    """Katalog, z którego Hermes czyta pliki projektu (HERMES.md): terminal.cwd; „.” = katalog startowy gatewaya
    (run-service.ps1 uruchamia go w %USERPROFILE%)."""
    raw = str(((cfg.get("terminal") or {}).get("cwd")) or ".").strip()
    p = Path(raw).expanduser()
    return p if p.is_absolute() and p.is_dir() else Path.home()


def read_env(p: Path) -> list[str]:
    return p.read_text(encoding="utf-8").splitlines() if p.exists() else []


def set_env(lines: list[str], key: str, value: str, keep_existing: bool = False) -> list[str]:
    pat = re.compile(rf"^\s*{re.escape(key)}\s*=")
    for i, ln in enumerate(lines):
        if pat.match(ln):
            if not keep_existing:
                lines[i] = f"{key}={value}"
            return lines
    lines.append(f"{key}={value}")
    return lines


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--home", required=True, help="HERMES_HOME (katalog z profiles/)")
    ap.add_argument("--name", default="jarvis-desktop")
    ap.add_argument("--port", type=int, default=8643)
    ap.add_argument("--bridge-url", default="http://127.0.0.1:8651")
    ap.add_argument("--bridge-token", default=os.environ.get("JARVIS_BRIDGE_TOKEN", ""), help="token mostu (domyślnie ze zmiennej JARVIS_BRIDGE_TOKEN — argumentów procesu nie widać wtedy na liście procesów)")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    pdir = Path(a.home) / "profiles" / a.name
    if not pdir.is_dir():
        print(f"BŁĄD: brak profilu {pdir} (najpierw: hermes profile create {a.name} --clone-from <profil>)", file=sys.stderr)
        return 2
    cfg_path, env_path, soul_path = pdir / "config.yaml", pdir / ".env", pdir / "SOUL.md"
    cfg = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) if cfg_path.exists() else {}
    cfg = cfg or {}

    cfg.setdefault("mcp_servers", {})["jarvis_desktop"] = {
            "url": a.bridge_url.rstrip("/") + "/mcp",
            "headers": {"Authorization": "Bearer ${JARVIS_BRIDGE_TOKEN}", "X-Jarvis-Profile": a.name},
            "enabled": True,
            "timeout": 120,   # most czeka do 90 s na zgodę użytkownika (Tak / Nie)
            "connect_timeout": 20,
            "keepalive_interval": 60,
            "trust": "full",
            "tools": {"resources": False, "prompts": False},
    }
    pt = cfg.setdefault("platform_toolsets", {})
    pt["api_server"] = list(ENABLED)
    set_guard_hook(cfg, guard_hook_command(pdir))
    changes = apply_target(cfg)

    env = read_env(env_path)
    env = [ln for ln in env if not any(re.match(rf"^\s*{k}\s*=", ln) for k in ENV_DROP)]
    # Najmniejsze uprawnienia: usuń sekrety kanałów, których ten profil nie obsługuje (Telegram ZOSTAJE — to kanał tego profilu).
    drop = re.compile(r"^\s*(WHATSAPP|DISCORD|SLACK|MATRIX|MATTERMOST|SIGNAL|EMAIL|NOTION|HERMES_DASHBOARD|BROWSERBASE|OBSIDIAN|TERMINAL_MODAL)_\w*\s*=")
    scrubbed = sorted({ln.split("=")[0].strip() for ln in env if drop.match(ln)})
    env = [ln for ln in env if not drop.match(ln)]
    have_key = any(re.match(r"^\s*API_SERVER_KEY\s*=\s*\S", ln) for ln in env)
    key = None if have_key else secrets.token_urlsafe(32)
    for k, v, keep in [("API_SERVER_ENABLED", "true", False), ("API_SERVER_HOST", "127.0.0.1", False), ("API_SERVER_PORT", str(a.port), False),
                       ("API_SERVER_CORS_ORIGINS", ORIGINS, False), ("API_SERVER_MODEL_NAME", a.name, False)]:
        env = set_env(env, k, v, keep)
    if key:
        env = set_env(env, "API_SERVER_KEY", key)
    if a.bridge_token:
        env = set_env(env, "JARVIS_BRIDGE_TOKEN", a.bridge_token)

    print(f"Profil: {pdir}")
    print(f"  mcp_servers -> jarvis_desktop ({a.bridge_url.rstrip('/')}/mcp)")
    print(f"  platform_toolsets.api_server -> {ENABLED}")
    print(f"  API: http://127.0.0.1:{a.port}/v1  (model: {a.name})")
    print(f"  .env: usunięto zbędne sekrety ({len(scrubbed)}): {', '.join(scrubbed) or '—'}")
    print(f"  konfiguracja docelowa: {', '.join(changes) or 'bez zmian'}")
    if a.dry_run:
        print("(dry-run: nic nie zapisano)")
        return 0

    if cfg_path.exists():
        bak = cfg_path.with_name(f"config.yaml.bak-jarvis-desktop-{time.strftime('%Y%m%d-%H%M%S')}")
        shutil.copy2(cfg_path, bak)
        print(f"  kopia zapasowa: {bak.name}")
    for old in sorted(pdir.glob("config.yaml.bak-jarvis-desktop-*"))[:-3]:   # zostaw 3 ostatnie kopie
        old.unlink(missing_ok=True)
    cfg_path.write_text(yaml.safe_dump(cfg, allow_unicode=True, sort_keys=False), encoding="utf-8")
    env_path.write_text("\n".join(env) + "\n", encoding="utf-8")
    if soul_path.exists():
        soul_bak = soul_path.with_name(f"SOUL.md.bak-jarvis-desktop-{time.strftime('%Y%m%d-%H%M%S')}")
        shutil.copy2(soul_path, soul_bak)
        print(f"  kopia zapasowa SOUL: {soul_bak.name}")
    for old_soul in sorted(pdir.glob("SOUL.md.bak-jarvis-desktop-*"))[:-3]:
        old_soul.unlink(missing_ok=True)
    shutil.copy2(HERE / "SOUL.md", soul_path)
    for name in REPO_PLUGINS:   # wtyczki z repo: pełna podmiana katalogu (bez __pycache__), żeby nie zostawały stare pliki
        src, dst = HERE / "plugins" / name, pdir / "plugins" / name
        if src.is_dir():
            if dst.exists():
                shutil.rmtree(dst)
            shutil.copytree(src, dst, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
            print(f"  wtyczka -> {dst.relative_to(pdir)}")
    sdir = pdir / "scripts"   # skrypty cronów no-agent i haków (raport poranny, guard_tools) — źródło w repo: hermes/scripts/
    for src in sorted((HERE / "scripts").glob("*.py")):
        sdir.mkdir(exist_ok=True)
        shutil.copy2(src, sdir / src.name)
        print(f"  skrypt -> scripts\\{src.name}")
    skill = pdir / "skills" / "jarvis-os-management" / "SKILL.md"
    if inject_cheatsheet(skill):
        print(f"  ściąga narzędzi -> {skill.relative_to(pdir)} ({len(CHEAT_TOOLS)} narzędzi z bridge/tools.json)")
    if inject_catalog(skill):
        print(f"  katalog możliwości -> {skill.relative_to(pdir)}")
    ensure_workspace()
    hmd = context_dir(cfg) / "HERMES.md"
    shutil.copy2(HERE / "HERMES.md", hmd)   # kontekst projektu (instrukcja pracy); pierwszeństwo przed AGENTS.md/CLAUDE.md
    print(f"  instrukcja pracy -> {hmd}")
    stale = Path.home() / "HERMES.md"   # stara lokalizacja (katalog domowy) — po przeniesieniu cwd do JarvisWorkspace to martwa kopia
    if hmd.parent != stale.parent and stale.exists():
        bak = Path(a.home) / "backups" / f"HERMES.md.home-{time.strftime('%Y%m%d-%H%M%S')}"
        bak.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(stale), str(bak))
        print(f"  stara kopia HERMES.md z katalogu domowego -> {bak}")
    ok_hook = approve_guard_hook(pdir, guard_hook_command(pdir))
    print(f"  hak blokad (pre_tool_call: {GUARD_HOOK_MATCHER}) -> " + ("zatwierdzony" if ok_hook else "NIE zatwierdzony: uruchom raz `hermes -p " + a.name + " --accept-hooks hooks list`"))
    if key:
        print(f"\nAPI_SERVER_KEY (wpisz w Jarvis OS → Ustawienia → klucz API): {key}")
    else:
        print("\nAPI_SERVER_KEY: zachowano istniejący z .env profilu")
    return 0


if __name__ == "__main__":
    sys.exit(main())
