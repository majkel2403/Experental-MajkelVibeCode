/* Pikselowy kontrast WCAG tekstu pulpitu na prawdziwym tle (po kompozycji szkła/tapety/HUD). Dla każdej próbki:
   1) zbiera kolor tekstu (computed, razem z alfą i opacity przodków) i prostokąt elementu,
   2) robi zrzut z przezroczystym tekstem (samo tło pod tekstem), 3) liczy współczynnik kontrastu dla każdego piksela prostokąta.
   Raport: p5 (najgorsze 5% pikseli), mediana, wynik względem progu AA (4,5; dla ≥18 px / ≥14 px bold: 3).
   Użycie: node tools/perf/contrast.js [--url http://…] [--walls photo,aurora,void] [--size 1600x900] [--fx cinema] [--states idle,executing] [--out raport.json] [--min 4.5] [--theme neon]
   Kody wyjścia: 0 zawsze, chyba że podano --min (wtedy 1, gdy jakakolwiek próbka ma p5 poniżej progu). Tapeta neon: --walls …,neon (po jej wprowadzeniu). */
'use strict';
const fs = require('fs'), path = require('path');
const L = require('./lib.js');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const walls = String(arg('walls', 'photo,aurora,void')).split(','), [W, H] = String(arg('size', '1600x900')).split('x').map(Number), fx = arg('fx', 'cinema'), states = String(arg('states', 'idle,executing')).split(','), url = arg('url', undefined), outFile = arg('out', null), minRatio = arg('min', null);
/* próbki: token (z którego bierze kolor) → selektor elementu reprezentatywnego */
const SAMPLES = [
  ['--text', '.hc-t b'], ['--text', '.brand .name'], ['--text', '.deck .dk-v'],
  ['--muted', '.dk-title'], ['--muted', '.search-pill .txt'], ['--muted', '.hc-t small:not(.hc-sub)'],
  ['--dim', '.mh-seg:not(.on)'], ['--dim', '.dk-cap'], ['--dim', '.ts b'], ['--dim', '.dk span'],
  ['.hc-sub', '.hc-sub'], ['.deck', '.deck .dk-title'],
  /* okna, czat i Process Log (stany windows/chat/log; w pozostałych stanach selektory nic nie znajdą i próbki się pomijają) */
  ['--text', '.window .win-head b'], ['--text', '.window .win-body'], ['--text', '.msg.jarvis'], ['--text', '.msg.user'], ['--dim', '.msg.sys'], ['--text', '.lp-plan-h'], ['--text', '.pt'], ['--muted', '.pd']
];
const CSS_FREEZE = '*,*::before,*::after{animation:none!important;transition:none!important}#fx{visibility:hidden!important}.ts.clock em,#tsFps em{visibility:hidden!important}';
(async () => {
  const res = [];
  for (const wall of walls) {
    const { b, p } = await L.open({ width: W, height: H, url, settleMs: 1500, query: 'glcaveat=0' });
    try {
      await L.forceFx(p, fx);
      await L.applyVariant(p, { wall, theme: arg('theme', '') || undefined });
      if (wall === 'neon') await p.waitForFunction(() => J.bgGl.draws >= 1, null, { timeout: 20000 }).catch(() => { });   // tło WebGL ma mieć pierwszą klatkę przed próbkowaniem
      await p.addStyleTag({ content: CSS_FREEZE });
      for (const state of states) {
      await L.STATES[state](p);
      await p.mouse.move(W - 3, H - 3);
      /* deskryptory: kolor końcowy = kolor tekstu z alfą × opacity przodków */
      const desc = await p.evaluate(samples => {
        const eff = el => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= +getComputedStyle(e).opacity; return o; };
        const out = [];
        for (const [tok, sel] of samples) {
          const els = [...document.querySelectorAll(sel)].filter(e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return eff(e) > .3 && r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && e.textContent.trim() && r.bottom > 0 && r.right > 0 && r.left < innerWidth && r.top < innerHeight; }).slice(0, 4);
          els.forEach((e, i) => {
            const cs = getComputedStyle(e), m = cs.color.match(/rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[, /]+([\d.]+))?/); if (!m) return;
            const r = e.getBoundingClientRect();
            /* tylko obszar zajęty przez tekst (zakres tekstu), nie cały blok */
            const rg = document.createRange(); rg.selectNodeContents(e); const tr = rg.getBoundingClientRect();
            const x = Math.max(0, Math.floor(Math.max(r.left, tr.left))), y = Math.max(0, Math.floor(Math.max(r.top, tr.top))), x2 = Math.min(innerWidth, Math.ceil(Math.min(r.right, tr.right))), y2 = Math.min(innerHeight, Math.ceil(Math.min(r.bottom, tr.bottom)));
            out.push({ tok, sel, i, text: e.textContent.trim().slice(0, 24), rgb: [+m[1], +m[2], +m[3]], alpha: (m[4] === undefined ? 1 : +m[4]) * eff(e), x, y, w: x2 - x, h: y2 - y, fs: parseFloat(cs.fontSize), fw: +cs.fontWeight });
          });
        }
        return out;
      }, SAMPLES);
      /* zrzut bez tekstu */
      const hide = await p.addStyleTag({ content: '*,*::before,*::after{color:transparent!important;text-shadow:none!important;-webkit-text-fill-color:transparent!important;caret-color:transparent!important}' });
      await L.settle(p);
      const png = (await p.screenshot()).toString('base64');
      const stats = await p.evaluate(async ([png, desc]) => {
        const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + png; });
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
        const lin = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
        const Y = (r, g2, b) => .2126 * lin(r) + .7152 * lin(g2) + .0722 * lin(b);
        return desc.map(d => {
          if (d.w < 2 || d.h < 2) return { ...d, skipped: true };
          const px = g.getImageData(d.x, d.y, d.w, d.h).data, rs = [];
          for (let i = 0; i < px.length; i += 4) {
            const a = d.alpha, r = d.rgb[0] * a + px[i] * (1 - a), gg = d.rgb[1] * a + px[i + 1] * (1 - a), bb = d.rgb[2] * a + px[i + 2] * (1 - a);
            const l1 = Y(r, gg, bb), l2 = Y(px[i], px[i + 1], px[i + 2]); rs.push((Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05));
          }
          rs.sort((x, y) => x - y);
          return { ...d, p5: +rs[Math.floor(rs.length * .05)].toFixed(2), median: +rs[Math.floor(rs.length / 2)].toFixed(2), min: +rs[0].toFixed(2) };
        });
      }, [png, desc]);
      await hide.evaluate(e => e.remove());
      for (const s of stats) res.push({ wall, state, ...s });
      }
    } finally { await b.close().catch(() => { }); }
  }
  /* podsumowanie: najgorszy element na (tapeta, token) */
  const key = r => r.wall + '/' + r.state + '|' + r.tok;
  const worst = new Map(); for (const r of res) if (!r.skipped) { const w = worst.get(key(r)); if (!w || r.p5 < w.p5) worst.set(key(r), r); }
  console.log('tapeta/stan         próbka     p5     mediana  próg  element');
  let fail = 0;
  for (const r of [...worst.values()].sort((a, b) => (a.wall + a.state).localeCompare(b.wall + b.state) || a.tok.localeCompare(b.tok))) {
    const large = r.fs >= 18 || (r.fs >= 14 && r.fw >= 700), thr = minRatio ? +minRatio : (large ? 3 : 4.5), ok = r.p5 >= thr; if (!ok) fail++;
    console.log(`${(r.wall + '/' + r.state).padEnd(17)} ${r.tok.padEnd(10)} ${String(r.p5).padStart(5)}  ${String(r.median).padStart(6)}   ${thr}  ${ok ? 'OK  ' : 'SŁABO'} ${r.sel} „${r.text}” ${r.fs}px`);
  }
  console.log(`\nPróbek poniżej progu: ${fail}`);
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ when: new Date().toISOString(), size: `${W}x${H}`, fx, samples: res }, null, 1));
  if (minRatio && fail) process.exitCode = 1;
})().catch(e => { console.error(e); process.exit(1); });
