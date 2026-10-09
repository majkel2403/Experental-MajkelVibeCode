// one-off: apply the consolidated findings of the three adversarial reviews to Main.dc.html (kept for the record)
import fs from 'node:fs';
const F = 'project/Main.dc.html';
let s = fs.readFileSync(F, 'utf8');
const rep = (a, b, all) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 90)); s = all ? s.split(a).join(b) : s.replace(a, b); };

// ---------------- CSS ----------------
rep('.hm-mid{position:relative;z-index:1;min-height:980px}', '.hm-mid{position:relative;z-index:1;min-height:980px;pointer-events:none}\n.hm-mid>*{pointer-events:auto}\n.hm-hero,.hm-hud,.hm-hud-top>*,.hm-hud-bot>*{min-width:0}');
rep('.hm-cockpit{display:flex;flex-direction:column;gap:12px;padding:12px}', '.hm-cockpit{display:flex;flex-direction:column;align-items:stretch;gap:12px;padding:12px}');
rep('.hm-sheet{position:relative;top:auto;bottom:auto}\n}', '.hm-sheet{position:relative;top:auto;bottom:auto}\n.hm-t44{min-height:44px !important;min-width:44px}\n}');
rep('@media (prefers-reduced-motion: reduce){.hm-msg', '.hm-lane{scrollbar-width:thin;scrollbar-color:#34406B transparent}\n@media (prefers-reduced-motion: reduce){.hm-msg');

// ---------------- header: stable height, no wrapped stepper labels ----------------
rep('gap: 16px 40px; padding: 14px 24px; border-bottom: 1px solid #1B2554">', 'gap: 16px 40px; padding: 14px 24px; min-height: 78px; box-sizing: border-box; border-bottom: 1px solid #1B2554">');
rep('<span style="font-weight: 600; font-size: 14px; color: {{ph.color}}">{{ph.label}}</span>', '<span style="font-weight: 600; font-size: 14px; white-space: nowrap; color: {{ph.color}}">{{ph.label}}</span>');
rep('color: #7F8BB3; margin-left: auto">{{ph.range}}</span>', 'color: #7F8BB3; margin-left: auto; white-space: nowrap">{{ph.range}}</span>');

// view toggle: selected state visible without relying on fill alone
rep('aria-pressed="{{v3on}}" style="min-height: 34px;', 'aria-pressed="{{v3on}}" class="hm-t44" style="box-shadow: inset 0 -2px 0 {{v3line}}; min-height: 34px;');
rep('aria-pressed="{{vfon}}" style="min-height: 34px;', 'aria-pressed="{{vfon}}" class="hm-t44" style="box-shadow: inset 0 -2px 0 {{vfline}}; min-height: 34px;');

// ---------------- HUD ----------------
rep('<div class="hm-glass" style="padding: 10px 14px; min-width: 0; align-self: flex-start; max-width: 100%; box-sizing: border-box">', '<div class="hm-glass" style="padding: 10px 14px; min-width: 0; align-self: flex-start; max-width: 100%; box-sizing: border-box; overflow: hidden">');
rep('<canvas id="hm-cv" aria-hidden="true" onPointerDown="{{cvDown}}" onPointerMove="{{cvMove}}" onPointerUp="{{cvUp}}" onPointerCancel="{{cvUp}}" onPointerLeave="{{cvLeave}}" style="position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: block; touch-action: none; cursor: grab">',
    '<canvas id="hm-cv" aria-hidden="true" onPointerDown="{{cvDown}}" onPointerMove="{{cvMove}}" onPointerUp="{{cvUp}}" onPointerCancel="{{cvCancel}}" onLostPointerCapture="{{cvCancel}}" onPointerLeave="{{cvLeave}}" style="position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: block; touch-action: pan-y; cursor: grab">');
// camera buttons: 44px on touch layouts, real visible label for reset
s = s.replace(/<button type="button" class="hm-pill" onClick="\{\{(zoomOut|zoomIn)\}\}"/g, '<button type="button" class="hm-pill hm-t44" onClick="{{$1}}"');
rep('<button type="button" class="hm-pill" onClick="{{toggleOrbit}}" aria-pressed="{{orbitOn}}" aria-label="Automatyczny obrót kamery" style="display: flex;', '<button type="button" class="hm-pill hm-t44" onClick="{{toggleOrbit}}" aria-pressed="{{orbitOn}}" aria-label="Automatyczny obrót kamery" style="box-shadow: inset 0 0 0 1px {{orbitRing}}; display: flex;');
rep('<button type="button" class="hm-pill" onClick="{{resetCam}}" aria-label="Wyzeruj kamerę i wybór"', '<button type="button" class="hm-pill hm-t44" onClick="{{resetCam}}" aria-label="Wyzeruj kamerę i wybór"');
rep('color: #E8ECF8">reset</button>', 'color: #E8ECF8">Wyzeruj</button>');
rep('<div role="group" aria-label="Wybór węzła w przestrzeni" style="display: flex; flex-wrap: wrap; gap: 6px">', '<div role="group" aria-label="Wybór węzła w przestrzeni" style="display: flex; flex-wrap: wrap; align-content: flex-end; gap: 6px; min-height: 78px">');
rep('class="hm-pill hm-chip" onClick="{{ac.pick}}"', 'class="hm-pill hm-chip hm-t44" onClick="{{ac.pick}}"');
rep('background: {{ac.color}}; color: #0B1020; font-family: \'IBM Plex Mono\', ui-monospace, monospace; font-size: 12px; font-weight: 500">{{ac.letter}}</span>', 'background: {{ac.color}}; color: #0B1020; font-family: \'IBM Plex Mono\', ui-monospace, monospace; font-size: 12px; font-weight: 500" aria-hidden="true">{{ac.letter}}</span>');

// analysis tabs
rep('aria-pressed="{{at.active}}" style="flex: 1; min-height: 36px;', 'aria-pressed="{{at.active}}" class="hm-t44" style="box-shadow: inset 0 -2px 0 {{at.line}}; flex: 1; min-height: 36px;');

// ---------------- middle column landmark, report keyboard ----------------
rep('<section class="hm-mid" aria-label="Raport i widok płaski">', '<section class="hm-mid">');
rep('<section aria-labelledby="hm-rep-h" class="hm-sheet hm-glass hm-rise"', '<section aria-labelledby="hm-rep-h" onKeyDown="{{reportKey}}" class="hm-sheet hm-glass hm-rise"');

// ---------------- right panel: toggle buttons instead of half-implemented tabs ----------------
rep('<div role="tablist" aria-label="Widok panelu"', '<div role="group" aria-label="Widok panelu"');
rep('<button type="button" role="tab" aria-selected="{{tb.active}}" onClick="{{tb.pick}}"', '<button type="button" aria-pressed="{{tb.active}}" onClick="{{tb.pick}}"');
rep('<ul class="hm-feed" aria-label="Pliki projektu" style="flex: 1 1 0;', '<ul id="hm-files" class="hm-feed" aria-label="Pliki projektu, od najstarszego" onScroll="{{onFilesScroll}}" style="flex: 1 1 0;');
rep('<ul class="hm-feed" aria-label="Rejestr decyzji" style="flex: 1 1 0;', '<ul id="hm-decs" class="hm-feed" aria-label="Rejestr decyzji, od najstarszej" onScroll="{{onDecsScroll}}" style="flex: 1 1 0;');
// inspector: bounded so selection changes do not resize the hero
rep('gap: 12px; min-height: 300px; box-sizing: border-box">', 'gap: 12px; min-height: 300px; max-height: 440px; overflow-y: auto; box-sizing: border-box" class="hm-glass hm-lane">');
rep('<div class="hm-glass" style="padding: 16px; display: flex; flex-direction: column; gap: 12px; min-height: 300px; max-height: 440px;', '<div style="padding: 16px; display: flex; flex-direction: column; gap: 12px; min-height: 300px; max-height: 440px;');
fs.writeFileSync(F, s);

// ---------------- script ----------------
s = fs.readFileSync(F, 'utf8');
// stick(): feed + lists, only when something is below the fold
rep(`  stick() {
    if (this._feedHold || typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
    const el = document.getElementById('hm-feed');
    if (el && el.scrollTop !== el.scrollHeight) el.scrollTop = el.scrollHeight;
  }`, `  stick() {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
    [['hm-feed', '_feedHold'], ['hm-files', '_filesHold'], ['hm-decs', '_decsHold']].forEach((p) => {
      if (this[p[1]]) return;
      const el = document.getElementById(p[0]);
      if (el && el.scrollTop < el.scrollHeight - el.clientHeight - 1) el.scrollTop = el.scrollHeight;
    });
  }`);
rep("    this._feedHold = false;\n    this._rm = false;", "    this._feedHold = false;\n    this._filesHold = false;\n    this._decsHold = false;\n    this._qLock = 0;\n    this._rm = false;");
rep("try { this._rm = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { this._rm = false; }\n  }\n\n  // keep", "try { this._rm = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { this._rm = false; }\n    this._orbit = !this._rm;\n  }\n\n  // keep");
// orbit: an explicit press wins over reduced motion
rep("if (this._orbit && !this._drag && !rm) this._orbitAngle", "if (this._orbit && !this._drag) this._orbitAngle");
rep("orbitOn: !!this._orbit && !this._rm,\n      orbitBg: this._orbit && !this._rm ? 'rgba(242,193,78,0.24)' : 'transparent',", "orbitOn: !!this._orbit,\n      orbitBg: this._orbit ? 'rgba(242,193,78,0.24)' : 'transparent',\n      orbitRing: this._orbit ? '#F2C14E' : 'rgba(0,0,0,0)',");
// picking by depth
rep(`    let best = null;
    let bd = 1e9;
    (this._picks || []).forEach((p) => {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < p.r && d - p.r * 0.2 < bd) { bd = d - p.r * 0.2; best = p.id; }
    });
    return best;`, `    let best = null;
    let bz = 1e9;
    (this._picks || []).forEach((p) => {
      if (Math.hypot(p.x - x, p.y - y) < p.r && p.z < bz) { bz = p.z; best = p.id; }
    });
    return best;`);
// quality governor: no thrash
rep(`        if ((this._ft > 16 || this._fi > 0.036) && this._q > 0) this._q--;
        else if (this._ft < 7 && this._fi < 0.02 && this._q < 2 && this._ftN > 240) this._q++;`, `        if ((this._ft > 16 || this._fi > 0.036) && this._q > 0) { this._q--; this._qLock = this._ftN + 900; }
        else if (this._ft < 7 && this._fi < 0.02 && this._q < 2 && this._ftN > this._qLock) this._q++;`);
// no-canvas fallback: 3D button inert
rep("setView3d: () => this.setState({ view: '3d' }),", "setView3d: () => { if (!this._noCanvas) this.setState({ view: '3d' }); },");
// pause: push the scene clock so tabs and canvas agree
rep("if (s.playing) { this.setState({ playing: false }); return; }", "if (s.playing) { this._uiT = this._sceneT; this.setState({ playing: false, t: this._sceneT }); return; }");
// report next steps never unreachable
rep("reportNextShown: t >= 52 + r.sections.length * 1.6,", "reportNextShown: t >= Math.min(58.5, 52 + r.sections.length * 1.6),");
// pointer handlers: primary button only, cancel never picks
rep(`      cvDown: (e) => {
        const cv = e.currentTarget;`, `      cvDown: (e) => {
        if (e.button !== 0 || e.isPrimary === false) return;
        const cv = e.currentTarget;`);
rep(`      cvLeave: () => { if (!this._drag) this._hover = null; },`, `      cvCancel: (e) => {
        this._drag = null;
        try { e.currentTarget.style.cursor = 'grab'; } catch (x) { /* ignore */ }
      },
      cvLeave: () => { if (!this._drag) this._hover = null; },
      reportKey: (e) => { if (e.key === 'Escape') this.setState({ reportClosed: true }); },
      onFilesScroll: (e) => { const el = e.target; this._filesHold = el.scrollHeight - el.scrollTop - el.clientHeight > 24; },
      onDecsScroll: (e) => { const el = e.target; this._decsHold = el.scrollHeight - el.scrollTop - el.clientHeight > 24; },`);
// lists chronological (stable keys, no focus jumps)
rep("time: mmss(d.t) };\n    }).reverse();", "time: mmss(d.t) };\n    });");
rep("files: d.files.map((name) => ({ name })) };\n    }).reverse();", "files: d.files.map((name) => ({ name })) };\n    });");
// selected-state lines
rep("      v3bg: S.view === '3d' ? '#232C4E' : 'transparent',\n      vfbg: S.view !== '3d' ? '#232C4E' : 'transparent',", "      v3bg: S.view === '3d' ? '#232C4E' : 'transparent',\n      vfbg: S.view !== '3d' ? '#232C4E' : 'transparent',\n      v3line: S.view === '3d' ? '#F2C14E' : 'rgba(0,0,0,0)',\n      vfline: S.view !== '3d' ? '#F2C14E' : 'rgba(0,0,0,0)',");
rep("      bg: i === anIdx ? '#1D2850' : 'transparent',\n      pick: () => this.setState({ anTab: i }),", "      bg: i === anIdx ? '#1D2850' : 'transparent',\n      line: i === anIdx ? '#F2C14E' : 'rgba(0,0,0,0)',\n      pick: () => this.setState({ anTab: i }),");
// engine guards
rep(`function pulseColor(ev, nodes) {
  if (`, `function pulseColor(ev, nodes) {
  if (!nodes[ev.from]) return GOLD;
  if (`);
rep("  const unit = (S.k || 1) * Math.min(", "  const unit = (S.k || 1) * Math.max(0.3, Math.min(");
rep("(sf.b - sf.t - (S.cards === false ? 0 : 70)) * 0.62) / 118;", "(sf.b - sf.t - (S.cards === false ? 0 : 70)) * 0.62)) / 118;");
rep("      ctx.beginPath(); ctx.arc(x, y, Math.max(r * (n.kind === 'agent' ? 2.5 : 2.4), 12), 0, 6.2832); ctx.stroke();\n      ctx.setLineDash([]);", "      ctx.beginPath(); ctx.arc(x, y, Math.max(r * (n.kind === 'agent' ? 2.5 : 2.4), 12), 0, 6.2832); ctx.stroke();\n      ctx.setLineDash([]);\n      ctx.lineDashOffset = 0;");
fs.writeFileSync(F, s);
console.log('review patch applied');
