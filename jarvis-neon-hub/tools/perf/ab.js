/* A/B dwóch adresów (baza vs obecny): te same sceny i poziomy efektów, kolejność przeplatana A,B,A,B…, mediana z N powtórzeń.
   Użycie:
     node tools/perf/ab.js --a http://localhost:4090 --b http://localhost:4000 [--scenes idle,hud,work,drag] [--fx cinema,standard]
          [--reps 3] [--ms 5000] [--size 1600x900] [--out katalog] [--instr] [--only-a]
   --only-a  mierzy tylko A (np. baseline); --instr dodaje po jednym przebiegu z instrumentacją odczytów layoutu (forced layouts).
   Zmienna PERF_LOCK=/ścieżka/lock: każdy przebieg odbywa się pod `flock` (jedno uruchomienie naraz na maszynie).
   Wynik: <out>/metrics.json i <out>/metrics.md. Bezwzględne FPS bez GPU nic nie znaczą — liczą się proporcje A/B w tej samej sesji. */
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const A = arg('a', process.env.JARVIS_URL || 'http://localhost:8080'), B = arg('b', null), onlyA = !!arg('only-a', false) || !B;
const scenes = String(arg('scenes', 'idle,hud,work,drag')).split(','), fxs = String(arg('fx', 'cinema,standard')).split(',');
const reps = +arg('reps', 3), ms = +arg('ms', 5000), size = arg('size', '1600x900'), out = arg('out', path.join(process.cwd(), 'perf-out')), instr = !!arg('instr', false);
const median = a => { const s = a.filter(x => typeof x === 'number' && isFinite(x)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const FIELDS = ['fps', 'p50', 'p95', 'worst', 'busyPct', 'scriptPct', 'layoutPct', 'stylePct', 'layoutsPerFrame', 'styleRecalcs', 'longTasks', 'longTaskMs', 'cpuCores', 'cpuMsPerFrame', 'domNodes', 'jsHeapMB'];
const run = (url, scene, fx, withInstr) => {
  const cmd = [process.execPath, path.join(__dirname, 'measure.js'), '--scene', scene, '--fx', fx, '--ms', String(ms), '--size', size, '--url', url, ...(withInstr ? ['--instr'] : [])];
  const full = process.env.PERF_LOCK ? ['flock', '-x', process.env.PERF_LOCK, ...cmd] : cmd;
  const r = spawnSync(full[0], full.slice(1), { encoding: 'utf8', maxBuffer: 64e6, timeout: 240000 });
  const m = /@@JSON@@(.*)/.exec(r.stdout || '');
  if (!m) { console.error(`  ! brak wyniku (${url} ${scene}/${fx}): ${(r.stderr || '').slice(-300)}`); return null; }
  return JSON.parse(m[1]);
};
const agg = rs => {
  rs = rs.filter(Boolean); if (!rs.length) return null;
  const o = { runs: rs.length };
  for (const f of FIELDS) o[f] = median(rs.map(r => r[f]));
  o.layers = { count: median(rs.map(r => r.layers.count)), fullscreen: median(rs.map(r => r.layers.fullscreen)), areaViewports: median(rs.map(r => r.layers.areaViewports)) };
  o.animations = { running: median(rs.map(r => r.animations.running)), infinite: median(rs.map(r => r.animations.infinite)), compositorOnly: median(rs.map(r => r.animations.compositorOnly)), nonCompositor: median(rs.map(r => r.animations.nonCompositor)) };
  o.nonCompositorList = [...new Set(rs[rs.length - 1].animations.list.filter(a => !a.compositorOnly).map(a => `${a.target}${a.pseudo} ${a.name || a.kind} [${a.props.join(',')}]`))];
  const lr = rs.map(r => r.layoutReads).filter(Boolean); if (lr.length) o.layoutReads = { reads: median(lr.map(x => x.reads)), inRaf: median(lr.map(x => x.inRaf)), forced: median(lr.map(x => x.forced)), forcedInRaf: median(lr.map(x => x.forcedInRaf)), byApi: lr[lr.length - 1].byApi };
  o.errors = [...new Set(rs.flatMap(r => r.errors || []))];
  return o;
};
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const res = { when: new Date().toISOString(), a: A, b: onlyA ? null : B, size, ms, reps, cells: {} };
  for (const scene of scenes) for (const fx of fxs) {
    const ra = [], rb = [];
    for (let i = 0; i < reps; i++) { console.log(`[${scene}/${fx}] powtórzenie ${i + 1}/${reps}`); ra.push(run(A, scene, fx, false)); if (!onlyA) rb.push(run(B, scene, fx, false)); }
    if (instr) { ra.push(Object.assign(run(A, scene, fx, true) || {}, { _instr: 1 })); if (!onlyA) rb.push(Object.assign(run(B, scene, fx, true) || {}, { _instr: 1 })); }
    const timing = rs => rs.filter(r => r && !r._instr), instrOnly = rs => rs.filter(r => r && r._instr && r.layoutReads);
    const cell = { a: agg(timing(ra)), b: onlyA ? null : agg(timing(rb)) };
    if (instr) { const ia = instrOnly(ra)[0], ib = instrOnly(rb)[0]; if (ia && cell.a) cell.a.layoutReads = ia.layoutReads; if (ib && cell.b) cell.b.layoutReads = ib.layoutReads; }
    res.cells[`${scene}/${fx}`] = cell;
    fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify(res, null, 1));
  }
  fs.writeFileSync(path.join(out, 'metrics.md'), toMd(res));
  console.log('Zapisano', path.join(out, 'metrics.json'), 'oraz metrics.md');
})();

function toMd(res) {
  const f = (v, d = 1) => v == null ? '—' : (typeof v === 'number' ? +v.toFixed(d) : v);
  const ratio = (a, b) => (a && b ? (b / a).toFixed(2) + '×' : '—');
  let s = `# Pomiar ${res.b ? 'A/B' : '(baseline)'} — ${res.when}\n\nA = ${res.a}${res.b ? `\nB = ${res.b}` : ''}\n\nRozdzielczość ${res.size}, okno pomiaru ${res.ms} ms, ${res.reps} powtórzeń, mediana. Środowisko bez GPU (SwiftShader) — bezwzględne FPS są zaniżone; porównuj proporcje, liczby warstw/animacji, layouty i czasy CPU.\n\n`;
  const rows = [['fps', 'fps'], ['p50 klatki [ms]', 'p50'], ['p95 klatki [ms]', 'p95'], ['wątek główny zajęty [%]', 'busyPct'], ['skrypt [%]', 'scriptPct'], ['layout [%]', 'layoutPct'], ['style [%]', 'stylePct'], ['layouty / klatkę', 'layoutsPerFrame', 2], ['przeliczenia stylów', 'styleRecalcs', 0], ['long tasks', 'longTasks', 0], ['CPU wszystkie procesy [rdzenie]', 'cpuCores', 2], ['CPU ms / klatkę', 'cpuMsPerFrame'], ['węzły DOM', 'domNodes', 0], ['sterta JS [MB]', 'jsHeapMB', 0]];
  for (const [k, c] of Object.entries(res.cells)) {
    s += `## ${k}\n\n| metryka | A |${res.b ? ' B | B/A |' : ''}\n|---|---|${res.b ? '---|---|' : ''}\n`;
    for (const [lab, key, d] of rows) s += `| ${lab} | ${f(c.a?.[key], d ?? 1)} |${res.b ? ` ${f(c.b?.[key], d ?? 1)} | ${ratio(c.a?.[key], c.b?.[key])} |` : ''}\n`;
    const one = (lab, get, d = 0) => { s += `| ${lab} | ${f(get(c.a), d)} |${res.b ? ` ${f(get(c.b), d)} | ${ratio(get(c.a), get(c.b))} |` : ''}\n`; };
    one('warstwy kompozytora', x => x?.layers.count); one('warstwy pełnoekranowe', x => x?.layers.fullscreen); one('pow. warstw [viewporty]', x => x?.layers.areaViewports, 2);
    one('animacje działające', x => x?.animations.running); one('animacje nie-kompozytorowe', x => x?.animations.nonCompositor);
    if (c.a?.layoutReads) { one('odczyty layoutu (forced)', x => x?.layoutReads?.forced); one('odczyty layoutu w rAF', x => x?.layoutReads?.inRaf); }
    if (c.a?.nonCompositorList?.length) s += `\nNie-kompozytorowe animacje (A): ${c.a.nonCompositorList.map(x => '`' + x + '`').join(', ')}\n`;
    s += '\n';
  }
  return s;
}
