/* Macierz zrzutów stanów aplikacji do katalogu (nazwy stabilne — kolejne etapy robią te same zrzuty do porównania przez vdiff.js).
   Użycie: node tools/perf/shots.js --out katalog [--url http://localhost:4000] [--sizes 1600x900,1280x720] [--only idle,accent-złoty] [--freeze]
   Nazwy: <WxH>-<grupa>-<nazwa>.png, np. 1600x900-state-approval.png, 1600x900-wall-aurora.png, 1600x900-fx-tool.png, 1600x900-accent-złoty.png.
   Grupy: state (idle, listening, thinking, executing, approval, error, completed, windows, chat, log, palette, focus; poziom efektów cinema),
          accent (jarvis, złoty, zielony, neon — stan idle), stheme (error/approval/completed × czerwony, złoty, zielony, neon), wall (photo, aurora, void — idle), nwall (tapeta neon × stany × motywy), fx (off, tool, standard, cinema — stan executing).
   --freeze wyłącza animacje CSS i ukrywa canvas tła (zrzuty deterministyczne do twardych różnic); bez niego zrzut jest „naturalny”. */
'use strict';
const fs = require('fs'), path = require('path');
const L = require('./lib.js');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const out = arg('out', path.join(process.cwd(), 'perf-shots')), sizes = String(arg('sizes', '1600x900,1280x720')).split(','), only = arg('only', null) ? String(arg('only')).split(',') : null, freeze = !!arg('freeze', false), url = arg('url', undefined);
const FREEZE = '*,*::before,*::after{animation:none!important;transition:none!important}#fx{visibility:hidden!important}';
const jobs = [];
for (const s of ['idle', 'listening', 'thinking', 'executing', 'approval', 'error', 'completed', 'windows', 'chat', 'log', 'palette', 'focus']) jobs.push({ name: 'state-' + s, state: s, fx: 'cinema' });
for (const t of ['jarvis', 'złoty', 'zielony', 'neon']) jobs.push({ name: 'accent-' + t, state: 'idle', fx: 'cinema', variant: { theme: t } });
/* stany przejściowe i zgoda w motywach, w których kolor stanu kolidował z akcentem (paleta rozsunięta: events.js statePalette) */
for (const t of ['czerwony', 'złoty', 'zielony', 'neon']) for (const st of ['error', 'approval', 'completed']) jobs.push({ name: 'stheme-' + st + '-' + t, state: st, fx: 'cinema', variant: { theme: t } });
for (const w of ['photo', 'aurora', 'void']) jobs.push({ name: 'wall-' + w, state: 'idle', fx: 'cinema', variant: { wall: w } });
/* tapeta neon (tło WebGL; ?glcaveat=0 omija próg renderera programowego): stany × motywy */
for (const t of ['neon', 'jarvis', 'złoty', 'zielony']) for (const st of (t === 'neon' ? ['idle', 'thinking', 'executing', 'approval', 'error', 'completed', 'windows'] : ['idle', 'executing', 'windows'])) jobs.push({ name: 'nwall-' + st + '-' + t, state: st, fx: 'cinema', variant: { wall: 'neon', theme: t } });
for (const f of ['off', 'tool', 'standard', 'cinema']) jobs.push({ name: 'fx-' + f, state: 'executing', fx: f });
(async () => {
  fs.mkdirSync(out, { recursive: true });
  for (const size of sizes) {
    const [width, height] = size.split('x').map(Number);
    const sel = jobs.filter(j => !only || only.some(o => j.name === o || j.name.startsWith(o)));
    if (!sel.length) continue;
    for (const j of sel) {
      /* świeża sesja na każdy zrzut: stany nie zanieczyszczają się (okna, czat, zadania) */
      const { b, p } = await L.open({ width, height, url, settleMs: 1500, query: 'glcaveat=0' });
      try {
        await L.forceFx(p, j.fx);
        if (j.variant) await L.applyVariant(p, j.variant);
        if (j.variant?.wall === 'neon') await p.waitForFunction(() => J.bgGl.draws >= 1, null, { timeout: 20000 }).catch(() => { });
        await p.addStyleTag({ content: L.STABILIZE + (freeze ? FREEZE : '') });
        await L.STATES[j.state](p);
        await p.mouse.move(width - 5, height - 5);   // kursor poza treścią
        await L.settle(p);
        const file = path.join(out, `${size}-${j.name}.png`);
        await p.screenshot({ path: file });
        console.log('zapisano', path.basename(file), p.errs.length ? 'BŁĘDY: ' + p.errs.join(' | ').slice(0, 200) : '');
      } catch (e) { console.error('BŁĄD', size, j.name, e.message); } finally { await b.close().catch(() => { }); }
    }
  }
})();
