/* Różnica obrazu dwóch katalogów PNG (liczona w przeglądarce na canvasie — bez zależności npm).
   Użycie: node tools/perf/vdiff.js katalogA katalogB [--out raport.json] [--diff-dir katalog-na-mapy-różnic] [--fail-pct 1.5]
   Dla każdego pliku o tej samej nazwie: średnia różnica kanałów (0–255), % pikseli z różnicą > 8 i > 32, maksimum, rozmiary.
   Mapa różnic: piksele z różnicą > 8 na czerwono na przyciemnionym obrazie A. Pliki tylko w jednym katalogu są raportowane osobno.
   --fail-pct: kod wyjścia 1, jeśli któryś plik ma więcej niż tyle % pikseli z różnicą > 8 (domyślnie brak progu).
   Uwaga: zrzuty „naturalne” (z animacjami) mają szum własny; oceń go, porównując dwa powtórzenia tej samej wersji. */
'use strict';
const fs = require('fs'), path = require('path');
const L = require('./lib.js');
const pos = process.argv.slice(2).filter((a, i, v) => !a.startsWith('--') && !(i > 0 && v[i - 1].startsWith('--') && !['--freeze'].includes(v[i - 1])));
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const [A, B] = pos; if (!A || !B) { console.error('Użycie: node tools/perf/vdiff.js katalogA katalogB [--out raport.json] [--diff-dir d] [--fail-pct N]'); process.exit(2); }
const ls = d => fs.readdirSync(d).filter(f => f.endsWith('.png')).sort();
const fa = ls(A), fb = ls(B), both = fa.filter(f => fb.includes(f));
const outFile = arg('out', null), diffDir = arg('diff-dir', null), failPct = arg('fail-pct', null);
(async () => {
  const { chromium } = L.requirePw();
  const br = await chromium.launch({ args: ['--no-sandbox'], executablePath: process.env.CHROMIUM_PATH || undefined });
  const p = await br.newPage(); await p.setContent('<canvas id=c></canvas>');
  if (diffDir) fs.mkdirSync(diffDir, { recursive: true });
  const rows = [];
  for (const f of both) {
    const a = fs.readFileSync(path.join(A, f)).toString('base64'), bb = fs.readFileSync(path.join(B, f)).toString('base64');
    const r = await p.evaluate(async ([a, b, wantDiff]) => {
      const load = s => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/png;base64,' + s; });
      const [IA, IB] = await Promise.all([load(a), load(b)]);
      if (IA.width !== IB.width || IA.height !== IB.height) return { sizeA: [IA.width, IA.height], sizeB: [IB.width, IB.height], mismatch: true };
      const c = document.getElementById('c'); c.width = IA.width; c.height = IA.height; const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(IA, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data; g.drawImage(IB, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data;
      const N = c.width * c.height; let sum = 0, n8 = 0, n32 = 0, mx = 0; const out = wantDiff ? g.createImageData(c.width, c.height) : null;
      for (let i = 0; i < da.length; i += 4) {
        const d = (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])) / 3; sum += d; if (d > 8) n8++; if (d > 32) n32++; if (d > mx) mx = d;
        if (out) { if (d > 8) { out.data[i] = 255; out.data[i + 1] = 40; out.data[i + 2] = 80; } else { out.data[i] = da[i] * .35; out.data[i + 1] = da[i + 1] * .35; out.data[i + 2] = da[i + 2] * .35; } out.data[i + 3] = 255; }
      }
      let png = null; if (out) { g.putImageData(out, 0, 0); png = c.toDataURL('image/png').split(',')[1]; }
      return { w: c.width, h: c.height, mean: +(sum / N).toFixed(3), pct8: +(100 * n8 / N).toFixed(2), pct32: +(100 * n32 / N).toFixed(2), max: Math.round(mx), png };
    }, [a, bb, !!diffDir]);
    if (r.png) { fs.writeFileSync(path.join(diffDir, f.replace(/\.png$/, '.diff.png')), Buffer.from(r.png, 'base64')); delete r.png; }
    rows.push({ file: f, ...r });
  }
  await br.close();
  console.log('plik'.padEnd(46), 'średnia', ' >8 [%]', '>32 [%]', ' max');
  for (const r of rows) console.log(r.file.padEnd(46), r.mismatch ? `INNY ROZMIAR ${r.sizeA} vs ${r.sizeB}` : `${String(r.mean).padStart(7)} ${String(r.pct8).padStart(7)} ${String(r.pct32).padStart(7)} ${String(r.max).padStart(4)}`);
  const onlyA = fa.filter(f => !fb.includes(f)), onlyB = fb.filter(f => !fa.includes(f));
  if (onlyA.length) console.log('\nTylko w A:', onlyA.join(', ')); if (onlyB.length) console.log('Tylko w B:', onlyB.join(', '));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ A, B, rows, onlyA, onlyB }, null, 1));
  if (failPct && rows.some(r => r.mismatch || r.pct8 > +failPct)) process.exitCode = 1;
})().catch(e => { console.error(e); process.exit(1); });
