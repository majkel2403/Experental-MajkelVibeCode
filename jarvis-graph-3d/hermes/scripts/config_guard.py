"""Strażnik konfiguracji Hermesa (profil jarvis-desktop) — ustalenia z 2026-10-03.

Uruchamiany przez cron Hermesa (no-agent): pusty stdout = wszystko zgodne, inaczej lista odstępstw
(trafia na Telegram). Za każdym uruchomieniem robi też kopię kluczowych plików do
~/.hermes/backups/config-snapshots/<data>/ (zostaje 14 ostatnich).

Ręcznie:  python config_guard.py --verbose   (wypisuje też to, co jest OK)
Gdy zmiana jest zamierzona — zaktualizuj regułę tutaj (i opis w WHERE-IS-THE-CONFIG.md).
"""
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

import yaml

HOME = Path.home()
ROOT = HOME / ".hermes"
PROFILE = ROOT / "profiles" / "jarvis-desktop"
REPO_SOUL = HOME / "Desktop" / "jarvis-" / "hermes" / "SOUL.md"
SNAP_DIR = ROOT / "backups" / "config-snapshots"
WORKSPACE = HOME / "JarvisWorkspace"   # terminal.cwd profilu: tu leży HERMES.md (własne .git — izolacja od C:\.git)
KEEP_SNAPSHOTS = 14
VERBOSE = "--verbose" in sys.argv

problems: list[str] = []
oks: list[str] = []


def check(ok: bool, good: str, bad: str) -> None:
    (oks.append(good) if ok else problems.append(bad))


def load_yaml(p: Path) -> dict:
    return yaml.safe_load(p.read_text(encoding="utf-8")) or {}


def env_keys(p: Path) -> dict:
    out = {}
    if p.exists():
        for ln in p.read_text(encoding="utf-8", errors="replace").splitlines():
            m = re.match(r"^\s*([A-Z0-9_]+)\s*=\s*(.*)$", ln)
            if m:
                out[m.group(1)] = m.group(2).strip()
    return out


# ---------------------------------------------------------------- config.yaml
try:
    cfg = load_yaml(PROFILE / "config.yaml")
except Exception as e:  # noqa: BLE001
    cfg = {}
    problems.append(f"config.yaml nie parsuje się: {e}")

if cfg:
    model = cfg.get("model") or {}
    check(model.get("default") == "MiniMax-M3" and model.get("provider") == "minimax",
          "model MiniMax-M3 / minimax", f"model główny zmieniony: {model.get('default')} / {model.get('provider')}")

    fb = json.dumps(cfg.get("fallback_providers") or [], ensure_ascii=False).lower()
    paid = [p for p in ("zai", "openai-api", "xai", "nous", "anthropic") if f'"provider": "{p}"' in fb]
    check(not paid, "fallbacki bez płatnych dostawców", f"fallback na płatnym/niedostępnym dostawcy: {paid}")

    ts = ((cfg.get("tools") or {}).get("tool_search") or {})
    defer = set(ts.get("defer") or [])
    check(isinstance(ts.get("defer"), list) and not defer & {"todo_list", "session_search", "cronjob_manage"},
          "tool_search.defer bez todo/session_search/cron",
          "tools.tool_search.defer: brak listy albo zawiera todo_list/session_search/cronjob_manage (MiniMax psuje je przez tool_call)")

    eng = (cfg.get("browser") or {}).get("engine")
    check(eng in ("auto", "chrome", "lightpanda"), f"browser.engine={eng}", f"browser.engine={eng!r} — nieprawidłowe (auto/chrome/lightpanda)")

    mem = cfg.get("memory") or {}
    check(mem.get("memory_char_limit") == 4400 and mem.get("user_char_limit") == 2200,
          "limity pamięci 4400/2200", f"limity pamięci zmienione: {mem.get('memory_char_limit')}/{mem.get('user_char_limit')}")

    pt = cfg.get("platform_toolsets") or {}
    for plat in ("telegram", "cli"):
        check("kanban" not in (pt.get(plat) or []), f"{plat}: bez kanban", f"platform_toolsets.{plat} znów ma kanban (+~6 tys. tokenów/turę)")
    for need in ("terminal", "file", "skills", "todo", "session_search", "cronjob", "delegation"):
        check(need in (pt.get("telegram") or []), f"telegram ma {need}", f"platform_toolsets.telegram nie ma '{need}'")
    # Decyzja z 2026-10-03: api_server ma pełny zestaw jak Telegram (SOUL §2.9), bez stt/tts, plus jarvis_desktop.
    API_SERVER_TARGET = {"browser", "clarify", "code_execution", "computer_use", "connections", "cronjob", "delegation",
                         "file", "memory", "session_search", "skills", "terminal", "todo", "vision", "web", "jarvis_desktop"}
    check(set(pt.get("api_server") or []) == API_SERVER_TARGET,
          "api_server: pełny zestaw (ustalenie 2026-10-03)", f"platform_toolsets.api_server zmieniony: {pt.get('api_server')}")

    agent = cfg.get("agent") or {}
    check(not agent.get("disabled_toolsets"), "brak globalnie wyłączonych toolsetów",
          f"agent.disabled_toolsets = {agent.get('disabled_toolsets')} (wyłącza narzędzia także na Telegramie — stary apply_profile?)")

    enabled = set(((cfg.get("plugins") or {}).get("enabled")) or [])
    for plug in ("rtk-rewrite", "security-guidance", "jarvis-events", "obsidian-brain"):
        check(plug in enabled, f"plugin {plug} włączony", f"plugin {plug} wyłączony")
    # audyt 2026-10-04: te wtyczki doklejały do KAŻDEJ rozmowy sprzeczne instrukcje (superpowers), pusty plan albo losowe skille
    for plug in ("superpowers", "planning-with-files", "skill-retrieval", "ui-review-loop"):
        check(plug not in enabled, f"plugin {plug} wyłączony", f"plugin {plug} znów włączony (zaśmieca kontekst każdej tury)")

    def at(path: str):
        node = cfg
        for part in path.split("."):
            node = node.get(part) if isinstance(node, dict) else None
        return node
    TARGET = {"compression.threshold_tokens": 120000, "session_reset.idle_minutes": 120, "memory.nudge_interval": 0,
              "kanban.dispatch_in_gateway": False, "delegation.max_concurrent_children": 3,
              "auxiliary.vision.provider": "minimax", "tools.tool_search.enabled": "off"}
    for path, want in TARGET.items():
        check(at(path) == want, f"{path}={want}", f"{path}={at(path)!r} (docelowo {want!r} — hermes/apply_profile.py TARGET)")
    check(str(at("terminal.cwd")) == str(WORKSPACE), "terminal.cwd = JarvisWorkspace", f"terminal.cwd={at('terminal.cwd')!r} (docelowo {WORKSPACE})")
    risky = {"force kill processes (Stop-Process -Force)", "force kill processes (taskkill /F)", "recursive delete"} \
        & set(cfg.get("command_allowlist") or [])
    check(not risky, "command_allowlist bez niebezpiecznych „zawsze”", f"command_allowlist ma stałe zgody: {sorted(risky)}")

    check(cfg.get("timezone") == "Europe/Warsaw", "timezone ok", f"timezone = {cfg.get('timezone')!r}")
    check("jarvis_desktop" in (cfg.get("mcp_servers") or {}), "MCP jarvis_desktop skonfigurowany", "brak mcp_servers.jarvis_desktop")

# ---------------------------------------------------------------- .env / Telegram
penv = env_keys(PROFILE / ".env")
check(bool(penv.get("TELEGRAM_BOT_TOKEN")), "token Telegrama w jarvis-desktop", "BRAK TELEGRAM_BOT_TOKEN w profiles/jarvis-desktop/.env")
check(bool(penv.get("TELEGRAM_ALLOWED_USERS")), "Telegram: lista dozwolonych ID", "BRAK TELEGRAM_ALLOWED_USERS — bot przyjąłby każdego")
for flag in ("TELEGRAM_ALLOW_ALL_USERS", "GATEWAY_ALLOW_ALL_USERS"):
    check(flag not in penv, f"brak {flag}", f"{flag} w .env — ta flaga wygrywa z listą ID: bot z terminalem otwarty dla każdego")
for other in [ROOT / ".env", *[(p / ".env") for p in (ROOT / "profiles").iterdir() if p.is_dir() and p.name != "jarvis-desktop"]]:
    if env_keys(other).get("TELEGRAM_BOT_TOKEN"):
        problems.append(f"token Telegrama także w {other} — dwa gatewaye będą walczyć o polling")

# ---------------------------------------------------------------- SOUL / pamięć / skille
soul = PROFILE / "SOUL.md"
if soul.exists():
    s = soul.read_text(encoding="utf-8")
    # ustalenie 2026-10-04: SOUL = tożsamość, głos, wartości; zasady pracy w HERMES.md, procedury w skillach, blokady w hakach
    check(len(s.encode("utf-8")) <= 4000, "SOUL.md ≤ 4 KB (tylko tożsamość)", f"SOUL.md urósł do {len(s.encode('utf-8'))} B — zasady pracy przenoś do HERMES.md, procedury do skilli")
    check("jarvis-operations" in s, "SOUL wskazuje jarvis-operations", "SOUL.md nie odsyła do skilla jarvis-operations")
    if REPO_SOUL.exists():
        same = REPO_SOUL.read_text(encoding="utf-8").replace("\r\n", "\n") == s.replace("\r\n", "\n")
        check(same, "SOUL profilu = SOUL w repo", f"SOUL.md profilu różni się od {REPO_SOUL} (apply_profile.py nadpisze profil wersją z repo)")
else:
    problems.append("brak SOUL.md w profilu")

# HERMES.md = instrukcja pracy (kontekst projektu w katalogu startowym gatewaya); źródło w repo
REPO_HMD = REPO_SOUL.parent / "HERMES.md"
hmd = WORKSPACE / "HERMES.md"
check((WORKSPACE / ".git").exists(), "JarvisWorkspace ma własne .git", f"{WORKSPACE} bez .git — Hermes szuka plików projektu aż do C:\\.git")
check(not (HOME / "HERMES.md").exists(), "brak starej kopii HERMES.md w katalogu domowym", f"{HOME / 'HERMES.md'} — martwa kopia (aktualna jest w {WORKSPACE})")
if hmd.exists():
    h = hmd.read_text(encoding="utf-8")
    check(len(h.encode("utf-8")) <= 9000, "HERMES.md ≤ 9 KB", f"HERMES.md urósł do {len(h.encode('utf-8'))} B — szczegóły przenoś do skilli")
    check("jarvis-operations" in h and "jarvis-os-management" in h, "HERMES.md wskazuje skille", "HERMES.md nie odsyła do skilli jarvis-operations / jarvis-os-management")
    if REPO_HMD.exists():
        check(REPO_HMD.read_text(encoding="utf-8").replace("\r\n", "\n") == h.replace("\r\n", "\n"), "HERMES.md = wersja z repo", f"{hmd} różni się od {REPO_HMD} (apply_profile.py nadpisze)")
    for shadow in ("AGENTS.md", "CLAUDE.md", ".hermes.md"):
        check(not (WORKSPACE / shadow).exists(), f"brak konkurencyjnego {shadow}", f"{WORKSPACE / shadow} istnieje — Hermes czyta tylko jeden plik projektu (.hermes.md > HERMES.md > AGENTS.md > CLAUDE.md)")
else:
    problems.append(f"brak {hmd} — Hermes nie dostaje zasad pracy (uruchom hermes/apply_profile.py)")

# wtyczki z repo (hermes/plugins/*) — kopia w profilu musi być identyczna (inaczej apply_profile.py nie był uruchomiony po zmianie)
for repo_plug in sorted((REPO_SOUL.parent / "plugins").glob("*/plugin.yaml")):
    name = repo_plug.parent.name
    prof = PROFILE / "plugins" / name
    same = prof.is_dir() and all((prof / f.relative_to(repo_plug.parent)).exists()
                                 and (prof / f.relative_to(repo_plug.parent)).read_bytes().replace(b"\r\n", b"\n") == f.read_bytes().replace(b"\r\n", b"\n")
                                 for f in repo_plug.parent.rglob("*") if f.is_file() and "__pycache__" not in f.parts)
    check(same, f"wtyczka {name} = wersja z repo", f"wtyczka {name} w profilu różni się od repo (uruchom hermes/apply_profile.py)")

# obsidian-brain czyta pliki sterujące sejfu — bez nich Jarvis zaczyna rozmowę bez kontekstu (wtyczka milczy)
VAULT = Path(os.environ.get("OBSIDIAN_VAULT_PATH") or HOME / "Documents" / "hermes")
missing = [n for n in ("CRITICAL_FACTS.md", "hot.md", "log.md") if not (VAULT / n).is_file()]
check(not missing, f"sejf Obsidian: pliki sterujące w {VAULT}", f"sejf Obsidian: brak {', '.join(missing)} w {VAULT} — Jarvis nie dostanie kontekstu na start")

# skrypty z repo (hermes/scripts/*.py: crony no-agent, haki, sejf Obsidian) — kopia w profilu musi być identyczna.
# Zastępuje regułę Jarvisa z 2026-10-05 „skrypty pipeline Obsidian istnieją” (skrypty sejfu są w repo od 2026-10-05).
_stale = [f.name for f in sorted((REPO_SOUL.parent / "scripts").glob("*.py"))
          if not (PROFILE / "scripts" / f.name).exists()
          or (PROFILE / "scripts" / f.name).read_bytes().replace(b"\r\n", b"\n") != f.read_bytes().replace(b"\r\n", b"\n")]
check(not _stale, "skrypty w profilu = wersja z repo", f"skrypty brakujące lub różne od repo: {', '.join(_stale)} (uruchom hermes/apply_profile.py; zmiany rób w repo)")

# crony, od których zależą backupy i sejf (reguły Jarvisa z 2026-10-05, uogólnione) — muszą istnieć i być włączone
try:
    _jobs = json.loads((PROFILE / "cron" / "jobs.json").read_text(encoding="utf-8"))
    _jobs = _jobs.get("jobs", []) if isinstance(_jobs, dict) else _jobs
    for _name in ("Backup state.db", "Obsidian Daily Context", "Obsidian ForAI Inbox Sync"):
        _job = next((j for j in _jobs if j.get("name") == _name), None)
        check(bool(_job and _job.get("enabled") and not _job.get("paused_at")), f"cron '{_name}' włączony",
              f"brak włączonego crona '{_name}' w jobs.json")
except Exception as e:  # noqa: BLE001
    problems.append(f"cron/jobs.json: {e}")

# reguła Jarvisa z 2026-10-05: state.db musi mieć świeży backup (cron „Backup state.db” 4:30)
_state_db, _bdir = PROFILE / "state.db", PROFILE / "backups" / "state-db"
if _state_db.exists():
    _recent = sorted(_bdir.glob("state-*.db"), key=lambda p: p.stat().st_mtime, reverse=True) if _bdir.exists() else []
    check(bool(_recent) and (time.time() - _recent[0].stat().st_mtime) < 2 * 86400 and _recent[0].stat().st_size > 0,
          "state.db: backup z ostatnich 2 dni", f"brak backupu state.db z ostatnich 2 dni w {_bdir} — cron 'Backup state.db' nie działa albo skrypt padł")
else:
    problems.append(f"brak {_state_db} — strażnik nie ma co chronić")

# reguła Jarvisa z 2026-10-05: SOUL.md musi mieć kopię z ostatnich 7 dni (apply_profile.py trzyma 3 ostatnie SOUL.md.bak-*)
_soul_bak = [p for p in PROFILE.glob("SOUL.md.bak-*") if time.time() - p.stat().st_mtime < 7 * 86400]
check(bool(_soul_bak), f"SOUL.md: {len(_soul_bak)} kopii z ostatnich 7 dni", f"brak kopii SOUL.md z ostatnich 7 dni w {PROFILE}")

# twarde blokady: hak pre_tool_call z guard_tools.py (zabijanie przeglądarki, restart gatewaya z własnego terminala)
pre = ((cfg.get("hooks") or {}).get("pre_tool_call") or [])
check(any("guard_tools.py" in str(x.get("command", "")) for x in pre if isinstance(x, dict)), "hak blokad guard_tools.py", "brak haka guard_tools.py w hooks.pre_tool_call (twarde blokady wyłączone)")

lim = {"MEMORY.md": ((cfg.get("memory") or {}).get("memory_char_limit") or 4400),
       "USER.md": ((cfg.get("memory") or {}).get("user_char_limit") or 2200)}
for name, limit in lim.items():
    p = PROFILE / "memories" / name
    n = len(p.read_text(encoding="utf-8")) if p.exists() else 0
    check(n <= limit, f"{name} {n}/{limit}", f"{name} ma {n} znaków > limit {limit} — poproś Jarvisa o konsolidację pamięci")

skills_dir = PROFILE / "skills"
names: dict[str, list[str]] = {}
for f in skills_dir.rglob("SKILL.md"):
    rel = f.relative_to(skills_dir).parts
    if rel[0].startswith("."):
        continue
    m = re.search(r"^name:\s*['\"]?([^'\"\n]+)", f.read_text(encoding="utf-8", errors="replace")[:600], re.M)
    if m:
        names.setdefault(m.group(1).strip(), []).append("/".join(rel[:-1]))
dups = {k: v for k, v in names.items() if len(v) > 1}
check(not dups, "brak zdublowanych nazw skilli", f"zdublowane skille: {dups}")
check("jarvis-operations" in names, "skill jarvis-operations jest", "brak skilla jarvis-operations")
check(len(names) <= 100, f"skille: {len(names)} (≤ 100)", f"skille: {len(names)} — po audycie 2026-10-04 było 81; nowe przeglądaj, nieużywane do ~/.hermes/skills-archive")
auto_load = ((cfg.get("skills") or {}).get("auto_load")) or []
missing_auto = [n for n in auto_load if n not in names]
check(not missing_auto, f"skills.auto_load: {len(auto_load)} przypiętych, wszystkie istnieją",
      f"skills.auto_load wskazuje brakujące skille: {missing_auto} (przywróć z ~/.hermes/skills-archive albo usuń z listy)")
banned = sorted(k for k in names if re.search(r"(^|-)(wsl|codex|opencode|godmode)(-|$)|^(kanban|operator)-|^apple-|^macos-|^imessage$|^findmy$", k))
check(not banned, "brak skilli sprzecznych z zasadami (WSL, Codex/OpenCode, kanban, operator, macOS)", f"skille sprzeczne z zasadami: {banned}")
deleg = sorted(k for k in names if k.endswith("-delegate"))
check(deleg == ["claude-delegate"], "delegowanie tylko claude-delegate", f"skille delegowania inne niż Claude: {deleg}")

# ---------------------------------------------------------------- środowisko
check(shutil.which("rtk") is not None, "rtk w PATH", "rtk.exe nie jest w PATH — plugin rtk-rewrite sam się wyłączy")
for marker in ("AGENTS.md", "AGENTS.override.md", "CLAUDE.md", ".hermes.md", "HERMES.md"):
    check(not (Path("C:/") / marker).exists(), f"C:\\{marker} brak", f"C:\\{marker} istnieje — przy repo git w C:\\ trafi do kontekstu KAŻDEJ sesji")

try:
    st = json.loads((PROFILE / "gateway_state.json").read_text(encoding="utf-8"))
    tg = ((st.get("platforms") or {}).get("telegram") or {}).get("state")
    check(st.get("gateway_state") == "running" and tg == "connected", "gateway + Telegram działają",
          f"gateway={st.get('gateway_state')} telegram={tg}")
except Exception as e:  # noqa: BLE001
    problems.append(f"gateway_state.json: {e}")

if os.name == "nt":
    for task, need_timer in (("JarvisOS-DesktopGateway", True), ("JarvisOS-Bridge", True), ("JarvisOS-Site", True), ("JarvisOS-GatewayRestart", False)):
        try:
            xml = subprocess.run(["schtasks", "/Query", "/TN", task, "/XML"], capture_output=True, text=True,
                                 errors="replace", timeout=20).stdout or ""
        except Exception:  # noqa: BLE001
            xml = ""
        if not xml:
            problems.append(f"brak zadania Harmonogramu {task}")
        elif need_timer:
            check("<TimeTrigger>" in xml and "PT5M" in xml, f"{task}: watchdog co 5 min",
                  f"{task}: brak wyzwalacza czasowego co 5 min (watchdog)")

try:
    tok = (HOME / ".jarvis-os" / "bridge-token").read_text(encoding="utf-8").strip()
    import urllib.request
    req = urllib.request.Request("http://127.0.0.1:8651/bridge/status", headers={"X-Bridge-Token": tok})
    with urllib.request.urlopen(req, timeout=10) as r:
        clients = json.loads(r.read().decode("utf-8")).get("clients", 0)
    check(clients <= 10, f"most: {clients} klient(ów)", f"most zgłasza {clients} klientów — możliwy wyciek połączeń (zombie)")
except Exception as e:  # noqa: BLE001
    problems.append(f"most :8651 nie odpowiada: {e}")

# ---------------------------------------------------------------- kopia zapasowa
try:
    day = SNAP_DIR / time.strftime("%Y-%m-%d")
    day.mkdir(parents=True, exist_ok=True)
    for src in (PROFILE / "config.yaml", PROFILE / "SOUL.md", PROFILE / "memories" / "MEMORY.md",
                PROFILE / "memories" / "USER.md", PROFILE / "cron" / "jobs.json", PROFILE / ".env",
                PROFILE / "skills" / "jarvis-operations" / "SKILL.md"):
        if src.exists():
            shutil.copy2(src, day / src.name)
    (day / "skills.txt").write_text("\n".join(f"{k}\t{', '.join(v)}" for k, v in sorted(names.items())), encoding="utf-8")
    for old in sorted(p for p in SNAP_DIR.iterdir() if p.is_dir())[:-KEEP_SNAPSHOTS]:
        shutil.rmtree(old, ignore_errors=True)
    oks.append(f"kopia: {day}")
except Exception as e:  # noqa: BLE001
    problems.append(f"kopia zapasowa nieudana: {e}")

if VERBOSE:
    for o in oks:
        print("OK  ", o)
if problems:
    print("STRAŻNIK KONFIGURACJI Hermes — odstępstwa od ustaleń:\n- " + "\n- ".join(problems))
