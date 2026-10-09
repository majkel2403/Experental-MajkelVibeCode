/* =========================================================
   JARVIS OS — polityka decyzji Jeva (czysta logika, bez sieci i bez interfejsu)
   Zawiera: poziomy autonomii poleceń A0–A3, funkcję routingu (drzewo decyzyjne z docs/JEV-PLAN.md, sekcja 7),
   adaptacyjne progi (uczenie się z odrzuceń), heurystykę wstrzykniętych instrukcji, regułę wyboru formy odpowiedzi.
   Dzięki temu całe drzewo da się przetestować tabelą przypadków, a Jev i UI zostają cienkimi warstwami.
   ========================================================= */
'use strict';
(() => {
const S = () => J.state.settings;

/* ---------- poziomy autonomii (sekcja 5 planu) ----------
   A3 po cichu (odczyty, nawigacja, wygląd) · A2 wykonaj z „Cofnij” (odwracalne zapisy)
   A1 zawsze z pytaniem „Chodzi o…?” · A0 tylko z jawnym potwierdzeniem (nieodwracalne, wrażliwe) */
const A3 = new Set(['open_app', 'wm_focus', 'wm_minimize', 'wm_arrange', 'wm_list', 'palette_open', 'notifications_open', 'notes_list', 'notes_read', 'notes_search', 'tasks_list', 'get_datetime', 'get_weather', 'get_crypto_prices', 'widgets_list', 'memory_recall', 'files_list', 'files_read', 'settings_get', 'get_status', 'help', 'calculate', 'set_theme', 'set_wallpaper', 'focus_mode', 'sound_toggle', 'speak', 'ui_highlight', 'ui_narrate', 'ui_toast', 'ui_ask', 'nav_back', 'schedule_day', 'settings_open', 'nav_forward', 'app_view', 'wm_reopen', 'wm_restore', 'undo', 'undo_list', 'close_app', 'search_all', 'recent_list', 'ui_mode', 'layout_list', 'chat_search', 'notes_trash', 'notes_versions', 'timer_list', 'files_open', 'widget_collapse', 'widget_refresh', 'routine_list', 'plan_control', 'stats_series']);
const A2 = new Set(['create_note', 'notes_append', 'notes_update', 'add_task', 'tasks_complete', 'tasks_update', 'start_timer', 'timer_control', 'create_widget', 'widgets_update', 'add_shortcut', 'layout_save', 'wm_move', 'memory_remember', 'wm_pin', 'shortcut_edit', 'ui_scale', 'layout_rename', 'layout_startup', 'notif_channel', 'keys_set', 'chat_thread', 'notes_tag', 'notes_pin', 'notes_duplicate', 'notes_restore', 'notes_revert', 'notes_to_task', 'notes_folder', 'tasks_repeat', 'tasks_priority', 'tasks_subtask', 'tasks_move_many', 'market_watchlist', 'market_alerts', 'memory_edit', 'dock_order', 'widget_duplicate', 'widget_items', 'widget_build', 'widget_edit', 'chart_show', 'fx_level', 'chat_attach']);
/* klucze ustawień, których zmiana ma skutki uboczne (proaktywność, nasłuch) — wymagają zgody */
const SENSITIVE_SETTINGS = ['proactive', 'wakeWord'];
/* podpolecenia Terminala, które niczego nie zmieniają (reszta wymaga zgody, gdy prosi o nie model) */
const TERMINAL_SAFE = /^(help|ls|apps|calc|weather|crypto|date|whoami|echo|neofetch|clear|open|say|theme)\b/i;

const P = J.policy = {
  A3, A2, SENSITIVE_SETTINGS, TERMINAL_SAFE,
  level(cmd, args) {
    const c = typeof cmd === 'string' ? J.registry.get(cmd) : cmd; if (!c) return 'A1';
    if (c.id === 'settings_set') return SENSITIVE_SETTINGS.includes(args?.key) ? 'A0' : 'A1';
    if (c.id === 'close_app') return args?.app === 'all' ? 'A0' : 'A3';   // jedno okno: zamknięcie odwracalne (wm_reopen)
    if (c.id === 'terminal_run') return TERMINAL_SAFE.test(String(args?.command || '').trim()) ? 'A1' : 'A0';
    if (c.risk !== 'safe') return 'A0';
    if (A3.has(c.id)) return 'A3';
    if (A2.has(c.id)) return 'A2';
    return 'A1';
  },
  /* tryb autonomii z Ustawień: auto = A3+A2, reads = tylko A3, ask = zawsze pytaj */
  mode: () => ['auto', 'reads', 'ask'].includes(S().jevAutonomy) ? S().jevAutonomy : 'auto',

  /* ---------- adaptacyjne progi: 2 odrzucenia w dobie podnoszą próg polecenia o 0,05 (maks. +0,10) ---------- */
  adapt: () => (J.state.ui.jevAdapt = J.state.ui.jevAdapt || {}),
  bump(id) { const l = (P.adapt()[id] || []).filter(t => Date.now() - t < 864e5); const n = Math.floor(l.length / 2); return Math.min(.1, n * .05); },
  reject(id) { if (!id) return; const a = P.adapt(); a[id] = (a[id] || []).filter(t => Date.now() - t < 864e5); a[id].push(Date.now()); if (a[id].length > 20) a[id].shift(); J.save(); },
  adaptInfo() { const a = P.adapt(); return Object.keys(a).map(id => ({ id, rejections24h: (a[id] || []).filter(t => Date.now() - t < 864e5).length, bump: P.bump(id) })).filter(x => x.rejections24h); },
  resetAdapt() { J.state.ui.jevAdapt = {}; J.save(); },
  thresholds(intentId) { const t = J.judge.thresholds(), b = P.bump(intentId); return { ...t, a3: Math.min(.99, t.a3 + b), a2: Math.min(.99, t.a2 + b), execute: Math.min(.99, t.execute + b) }; },

  /* ---------- routing (drzewo decyzyjne) ----------
     verdict: wynik J.judge.decide; ctx: { cmd, level, risk, undoable, source: 'typed'|'voice'|'signal', parserAgrees, slots: 'complete'|'enum'|'free', mode, th, hermes }
     ctx.hermes = Hermes jest osiągalny. Wtedy niepewność (R3, R6, R13, brakujące szczegóły bez zgody parsera) nie kończy się
     pytaniem „Chodzi o…?”, tylko przekazaniem Hermesowi (R16/R15) — test na żywo 2026-10-04: pytania bez pasującej opcji kończyły
     się „Anulowano”, a Hermes robił to samo zadanie za pierwszym razem w ~10 s. Tryb „zawsze pytaj” i brak Hermesa = pytania jak dotąd.
     wynik: { action, reason, trust?, silent?, undo?, gated?, alts?, then?, handoff? }
     handoff (przy fill_enum): gdyby trzeba było zapytać użytkownika o wartość z listy, oddaj sprawę Hermesowi
     action: hermes · ask_alternatives · ask_intent · fill_enum · ask_slots · exec
     trust:  local (polecenie wpisane ręcznie i zgodne z parserem) · voice · jev (sam Jev — rejestr NIE traktuje tego jako zaufanego) */
  route(v, ctx = {}) {
    const id = v.intent.id, p = v.intent.confidence, th = ctx.th || P.thresholds(id);
    const real = a => a.id !== id && !['conversation', 'multi_step', 'unclear'].includes(a.id);
    if (id === 'conversation') return { action: 'hermes', reason: 'R1' };
    if (id === 'multi_step') return { action: 'hermes', reason: 'R2', plan: true };
    const handoff = !!ctx.hermes && (ctx.mode || 'auto') !== 'ask';
    if (id === 'unclear') { const alts = (v.intent.alts || []).filter(real); return !handoff && alts.length && alts[0].p >= th.alt ? { action: 'ask_alternatives', reason: 'R3', alts: alts.slice(0, 2) } : { action: 'hermes', reason: 'R3' }; }
    if (!ctx.cmd) return { action: 'hermes', reason: 'R0' };
    if (p < th.ask) return { action: 'hermes', reason: 'R4' };
    const typed = ctx.source === 'typed', voice = ctx.source === 'voice', parser = !!ctx.parserAgrees;
    /* zgoda „drugiego klucza”: parser albo użytkownik, który odpowiedział „Tak” na „Chodzi o…?”. Dla nieodwracalnych liczy się
       tylko parser (użytkownik potwierdził rodzaj czynności, ale nie konkretny cel). */
    const agrees = parser || !!ctx.userConfirmed;
    let level = ctx.level || 'A1'; const mode = ctx.mode || 'auto';
    const trust = voice ? 'voice' : (typed && parser) ? 'local' : 'jev';
    const need = ctx.slots || 'complete';
    const solo = handoff && !agrees;   // sam Jev, bez potwierdzenia parsera ani użytkownika
    const finish = base => need === 'complete' ? { action: 'exec', ...base }
      : (solo && need === 'free') ? { action: 'hermes', reason: 'R15' }
      : { action: need === 'enum' ? 'fill_enum' : 'ask_slots', reason: base.reason, then: base, ...(solo ? { handoff: true } : {}) };
    const askIntent = reason => handoff ? { action: 'hermes', reason: 'R16' } : ({ action: 'ask_intent', reason, alts: (v.intent.alts || []).filter(real).filter(a => a.p >= th.alt).slice(0, 2) });
    // tryb „zawsze pytaj” i „tylko odczyty” obniżają polecenia do A1
    if (mode === 'ask' && level !== 'A0') level = 'A1';
    if (mode === 'reads' && level === 'A2') level = 'A1';
    const risky = ctx.risk !== 'safe' || level === 'A0';
    // nieodwracalne: rejestr zawsze pyta o zgodę, chyba że użytkownik wpisał to wprost, a parser się zgadza (jak dotąd)
    if (risky) {
      if (typed && parser) return finish({ reason: 'R12', trust: 'local', silent: false });
      return p >= th.a3 ? finish({ reason: 'R13', trust, gated: true, silent: false }) : askIntent('R13');
    }
    if (level === 'A3') {
      if (p >= th.a3) return finish({ reason: 'R7', trust, silent: true });
      return agrees ? finish({ reason: 'R5', trust, silent: false }) : askIntent('R6');
    }
    if (level === 'A2' && ctx.undoable) {
      if (p >= th.a2) {
        if (v.destructive >= th.destructive && !(typed && parser)) return finish({ reason: 'R14', trust, gated: true, silent: false, undo: true });
        return finish({ reason: agrees ? 'R8' : 'R9', trust, silent: false, undo: true });
      }
      return agrees && p >= th.ask ? finish({ reason: 'R5', trust, silent: false, undo: true }) : askIntent('R6');
    }
    // A1 (albo A2 bez możliwości cofnięcia): wykonaj tylko przy zgodności parsera, inaczej zapytaj
    return agrees ? finish({ reason: 'R5', trust, silent: false, undo: !!ctx.undoable }) : askIntent('R6');
  },

  /* ---------- heurystyka wstrzykniętych instrukcji (D10-lite, zawsze włączona, bez sieci) ---------- */
  injection(text) {
    const t = String(text || ''), hits = [];
    const RULES = [
      [/(zignoruj|ignoruj|pomi[ńn])\s+(wszystkie\s+)?(poprzednie|wcze[śs]niejsze|powy[żz]sze)\s+(polecenia|instrukcje|zasady|wytyczne)/i, 'ignoruj poprzednie polecenia'],
      [/ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions|rules|prompts|messages)/i, 'ignore previous instructions'],
      [/(system prompt|prompt systemowy|instrukcje systemowe|developer message)/i, 'odwołanie do promptu systemowego'],
      [/(jeste[śs] teraz|od teraz jeste[śs]|you are now|act as an?|udawaj,? [żz]e jeste[śs])/i, 'zmiana roli asystenta'],
      [/(usu[ńn]|skasuj|wyczy[śs][ćc]|delete|erase|wipe)\s+(wszystk|all\b|everything)/i, 'polecenie masowego usunięcia'],
      [/(wy[śs]lij|prze[śs]lij|send|post)\b[^.\n]{0,60}(has[łl]|klucz|token|password|api[ -]?key|secret)/i, 'prośba o wysłanie sekretów'],
      [/<\s*\/?\s*(tool_call|tool_response|system|plan|environment)\b/i, 'znaczniki protokołu w treści'],
      [/(nie\s+pytaj|bez\s+pytania|bez\s+potwierdzenia|nigdy\s+nie\s+pytaj)[^.\n]{0,30}(zgod|potwierdz|nic)|(do\s+not|don'?t|never)\s+(ask|confirm)[^.\n]{0,30}(confirm|permission|again)/i, 'wyłączenie pytania o zgodę'],
      [/(wy[łl][ąa]cz|disable|turn\s+off)\s+(wszystkie\s+)?(zabezpieczenia|potwierdzenia|safeguards|safety|security)/i, 'wyłączenie zabezpieczeń'],
      [/(nowe\s+zasady|new\s+rules|developer\s+mode|tryb\s+developera|jailbreak)/i, 'zmiana zasad działania'],
      [/(zapomnij|forget)\s+(o\s+)?(wszystkim|everything|all)[^.\n]{0,40}(kaza|instruct|told|rules|zasad)/i, 'kasowanie wcześniejszych instrukcji'],
      [/(nadpisz|zast[ąa]p|override|overwrite)\s+(swoje|twoje|your|the)?\s*(zasady|instrukcje|rules|instructions)/i, 'nadpisanie zasad'],
      [/(poka[żz]|wypisz|ujawnij|reveal|show|print)\s+(mi\s+)?(sw[óo]j\s+|tw[óo]j\s+|your\s+)?(klucz|has[łl]o|token|api[ -]?key|password|rules|zasady)/i, 'prośba o ujawnienie sekretów lub zasad'],
      [/(przeka[żz]|wy[śs]lij|prze[śs]lij|send|forward)\b[^.\n]{0,60}(schowk|clipboard|notatk|plik)[^.\n]{0,60}(na\s+adres|do\s+\S+@|https?:|\.(com|net|org|io|example))/i, 'wysyłka danych na zewnątrz'],
      [/(ukryj|hide|conceal)\s+(przed\s+u[żz]ytkownikiem|from\s+the\s+user)/i, 'ukrywanie działań przed użytkownikiem'],
      [/(zresetuj|reset)\s+(wszystkie\s+)?(dane|data|everything)[^.\n]{0,20}(nie\s+pytaj|without\s+ask)/i, 'reset danych bez pytania'],
      [/\bBEGIN\s+(SYSTEM|INSTRUCTIONS?|PROMPT)\b/i, 'blok instrukcji']
    ];
    for (const [re, why] of RULES) if (re.test(t)) hits.push(why);
    return { flagged: hits.length > 0, reasons: hits };
  },

  /* ---------- dane poufne w tekście (lokalnie, bez sieci): PESEL, numer karty, hasła i klucze ---------- */
  sensitive(text) {
    const t = String(text || ''), hits = [];
    if (/(^|\D)\d{11}(\D|$)/.test(t)) hits.push('numer podobny do PESEL');
    if (/(?:^|\D)(?:\d[ -]?){13,19}(?:\D|$)/.test(t)) hits.push('numer podobny do karty płatniczej');
    if (/(has[łl]o|password|passwd|\bpin\b|\bcvv\b|token|klucz api|api[ -]?key|sk-or-)/i.test(t)) hits.push('hasło lub klucz');
    return { flagged: hits.length > 0, reasons: hits };
  },

  /* ---------- forma odpowiedzi (D13): reguły zamiast Jeva — decyzja jest deterministyczna ---------- */
  output({ source = 'typed', reply = '', quiet = false, focus = false, speechOn = true } = {}) {
    const fromVoice = source === 'voice';
    let speak = (fromVoice || speechOn) && !!String(reply).trim();
    if (quiet && (source === 'signal' || source === 'routine')) speak = false;      // cisza nocna: sygnały nie mówią
    if (focus && !fromVoice) speak = false;                                         // tryb skupienia: mowa tylko na prośbę głosową
    let text = String(reply).split('\n\n⚠')[0];
    if (speak && text.length > 320) { const s = text.match(/[^.!?]+[.!?]+/g) || [text]; text = s.slice(0, 2).map(x => x.trim()).join(' ') || text.slice(0, 320); }   // długie odpowiedzi czytamy skrótem
    return { speak, text, show: !(focus && source !== 'typed') };
  }
};
})();
