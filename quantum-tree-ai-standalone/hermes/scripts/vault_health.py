#!/usr/bin/env python3
"""Warstwowy audyt vaulta Obsidian.

Domyślnie ocenia warstwę core, a archiwum raportuje osobno. Dzięki temu
historyczne sesje Perplexity nie udają bieżących błędów operacyjnych.
"""
import argparse
import json
import re
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path
import sys

if hasattr(sys.stdout, "reconfigure"):   # konsola/cron na Windows = cp1250, a skrypt drukuje emoji
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


TODAY = date.today()
EXCLUDE_DIRS = {".obsidian", ".trash", "_trash", ".git", "__pycache__"}
ARCHIVE_DIRS = {"06-AI-Sessions", "05 - Archive"}
TEMPLATE_DIRS = {"Templates", "templates"}
FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---", re.DOTALL)
# `[[Nota\|alias]]` w tabelach (ukośnik chroni kolumnę) to poprawny link Obsidiana — ukośnika nie wliczamy do nazwy
LINK_RE = re.compile(r"\[\[([^\]|#\\]+)(?:\\?[|#][^\]]*)?\]\]")
DATE_RE = re.compile(r"due:\s*(\d{4}-\d{2}-\d{2})")
TEMPLATE_RE = re.compile(r"<%.*?%>|\{\{[^}]+\}\>")


def rel_parts(path, vault):
    return path.relative_to(vault).parts


def layer_of(path, vault):
    parts = rel_parts(path, vault)
    if parts and parts[0] in ARCHIVE_DIRS:
        return "archive"
    if parts and parts[0] in TEMPLATE_DIRS:
        return "template"
    return "core"


def parse_frontmatter(text):
    match = FRONTMATTER_RE.match(text)
    if not match:
        return {}
    result = {}
    for line in match.group(1).splitlines():
        line = line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, _, value = line.partition(":")
        result[key.strip()] = value.strip().strip('"').strip("'")
    return result


def load_vault(vault):
    notes = {}
    for path in vault.rglob("*.md"):
        if set(rel_parts(path, vault)) & EXCLUDE_DIRS:
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except Exception:
            continue
        rel = str(path.relative_to(vault))
        notes[rel] = {
            "path": path,
            "rel_path": rel,
            "content": content,
            "frontmatter": parse_frontmatter(content),
            "links": LINK_RE.findall(content),
            "layer": layer_of(path, vault),
        }
    return notes


def scope_notes(notes, scope):
    if scope == "all":
        return notes
    return {k: v for k, v in notes.items() if v["layer"] == scope}


def build_targets(notes):
    targets = set()
    for rel, note in notes.items():
        targets.add(Path(rel).stem)
        title = note["frontmatter"].get("title")
        if title:
            targets.add(title)
    return targets


def resolve_target(target, targets):
    target = target.strip().replace("\\", "/")
    if target in targets:
        return True
    base = target.rsplit("/", 1)[-1]
    return base in targets


def find_orphans(notes, exclude_templates=True):
    target_counts = defaultdict(int)
    for note in notes.values():
        for link in note["links"]:
            target_counts[link.strip().replace("\\", "/").rsplit("/", 1)[-1]] += 1
    result = []
    for rel, note in notes.items():
        if exclude_templates and note["layer"] == "template":
            continue
        title = note["frontmatter"].get("title") or Path(rel).stem
        filename = Path(rel).stem
        if filename not in target_counts and title not in target_counts:
            result.append(rel)
    return result


def find_broken_links(notes, targets):
    broken = []
    for rel, note in notes.items():
        if note["layer"] == "template":
            continue
        fenced = False
        for line in note["content"].splitlines():
            if re.match(r"^\s*```", line):
                fenced = not fenced
                continue
            if fenced:
                continue
            for link in LINK_RE.findall(line):
                if not resolve_target(link, targets):
                    broken.append({"source": rel, "broken_link": link})
    return broken


def find_stale_tasks(notes):
    stale = []
    for rel, note in notes.items():
        for match in DATE_RE.finditer(note["content"]):
            try:
                due = datetime.strptime(match.group(1), "%Y-%m-%d").date()
            except ValueError:
                continue
            if due < TODAY:
                stale.append({"note": rel, "due": match.group(1), "days_overdue": (TODAY - due).days})
    return stale


def find_empty_folders(vault):
    result = []
    for directory in vault.rglob("*"):
        if not directory.is_dir() or set(rel_parts(directory, vault)) & EXCLUDE_DIRS:
            continue
        if not any(directory.iterdir()):
            result.append(str(directory.relative_to(vault)))
    return result


def find_duplicates(notes):
    grouped = defaultdict(list)
    for rel, note in notes.items():
        title = (note["frontmatter"].get("title") or Path(rel).stem).lower().strip()
        grouped[title].append(rel)
    return [{"title": title, "files": files} for title, files in grouped.items() if len(files) > 1]


def run_health_check(vault_path, scope="core"):
    vault = Path(vault_path)
    if not vault.exists():
        return {"error": f"Vault not found: {vault_path}"}
    notes = load_vault(vault)
    selected = scope_notes(notes, scope)
    targets = build_targets(notes)
    orphans = find_orphans(selected)
    broken = find_broken_links(selected, targets)
    stale = [x for x in find_stale_tasks(selected) if selected[x["note"]]["layer"] == "core"]
    missing_fm = [rel for rel, n in selected.items() if not n["frontmatter"] and n["layer"] != "template"]
    placeholders = []
    for rel, note in selected.items():
        if note["layer"] != "core":
            continue
        content = re.sub(r"<!-- BEGIN STATS - generated by vault_stats.py -->.*?<!-- END STATS -->", "", note["content"], flags=re.S)
        if re.search(r"\{\{[^}]+\}\}|<%.*?%>", content, re.S):
            placeholders.append(rel)
    duplicates = find_duplicates(selected)
    archive_count = sum(1 for n in notes.values() if n["layer"] == "archive")
    template_count = sum(1 for n in notes.values() if n["layer"] == "template")

    critical, warnings, info = [], [], []
    if stale:
        critical.append({"type": "stale_tasks", "count": len(stale), "items": stale[:10], "message": f"{len(stale)} overdue tasks"})
    if broken:
        warnings.append({"type": "broken_links", "count": len(broken), "items": broken[:10], "message": f"{len(broken)} unresolved core links"})
    if orphans:
        orphan_item = {"type": "orphans", "count": len(orphans), "items": orphans[:10], "message": f"{len(orphans)} archive notes without incoming links"}
        (info if scope == "archive" else warnings).append(orphan_item)
    if missing_fm:
        warnings.append({"type": "missing_frontmatter", "count": len(missing_fm), "items": missing_fm[:10], "message": f"{len(missing_fm)} core notes missing frontmatter"})
    if placeholders:
        warnings.append({"type": "placeholders", "count": len(placeholders), "items": placeholders[:10], "message": f"{len(placeholders)} core notes contain template placeholders"})
    if duplicates:
        warnings.append({"type": "duplicates", "count": len(duplicates), "items": duplicates[:10], "message": f"{len(duplicates)} duplicate title groups"})
    empty = find_empty_folders(vault)
    if empty:
        info.append({"type": "empty_folders", "count": len(empty), "items": empty[:10], "message": f"{len(empty)} empty folders"})
    info.append({"type": "layers", "count": 3, "items": [f"core: {sum(1 for n in notes.values() if n['layer']=='core')}", f"templates: {template_count}", f"archive: {archive_count}"], "message": "Layered scan completed; archive warnings are reported separately"})
    return {
        "vault_path": str(vault), "scan_date": TODAY.isoformat(), "scope": scope,
        "total_notes": len(notes), "selected_notes": len(selected),
        "critical": critical, "warnings": warnings, "info": info,
        "archive_summary": {"notes": archive_count, "orphans_expected": True, "broken_links_checked_separately": True},
        "summary": {"critical": sum(x["count"] for x in critical), "warnings": sum(x["count"] for x in warnings), "info": sum(x["count"] for x in info)},
    }


def main():
    parser = argparse.ArgumentParser(description="Layered Obsidian vault health check")
    parser.add_argument("--path", required=True)
    parser.add_argument("--scope", choices=("core", "archive", "all"), default="core")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    result = run_health_check(args.path, args.scope)
    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return
    print("=" * 60)
    print("VAULT HEALTH REPORT")
    print("=" * 60)
    print(f"Vault: {result['vault_path']}")
    print(f"Date: {result['scan_date']} | Scope: {result['scope']}")
    print(f"Notes: {result['selected_notes']} selected / {result['total_notes']} total")
    for heading, key in (("CRITICAL", "critical"), ("WARNINGS", "warnings"), ("INFO", "info")):
        items = result[key]
        if items:
            print(f"\n{heading}:")
            for item in items:
                print(f"- {item['message']}")
                for entry in item["items"]:
                    print(f"  - {entry}")
    summary = result["summary"]
    print(f"\nSummary: {summary['critical']} critical, {summary['warnings']} warnings, {summary['info']} info")


if __name__ == "__main__":
    main()
