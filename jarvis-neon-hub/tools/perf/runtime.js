/* Scenariusze runtime JS (czat ze strumieniem, Process Log, Monitor rynku) → JSON; działa na starych i nowych wersjach aplikacji (A/B).
   node tools/perf/runtime.js --scene chat|log|market [--url http://…] [--n 400]
   chat   — 1 dymek, --n kawałków strumienia (~24 znaków) co ~10 ms, Process Log otwarty z krokami i dopisywanym polem „Treść”
   log    — zadanie z --n krokami (z polami) przy otwartym panelu, potem J.proc.end (czas end() i liczba elementów w DOM)
   market — okno Monitora rynku i salwy zdarzeń 'market' (12 symboli × 10 razy) w 4 s
   Metryki: wymuszone layouty (instrumentacja odczytów), czas skryptu i layoutu (CDP), liczba layoutów, węzły DOM, czasy własne scenariusza. */
'use strict';
const L = require('./lib.js');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const metric = (arr, n) => (arr.find(m => m.name === n) || { value: 0 }).value;
(async () => {
  const scene = arg('scene', 'chat'), n = +arg('n', 400), url = arg('url', undefined);
  const { b, p, cdp } = await L.open({ width: 1600, height: 900, url, instr: true, settleMs: 1500 });
  try {
    await L.forceFx(p, 'standard');
    await p.evaluate(() => { J.chatPanel?.show?.(); J.proc.open?.(); }); await p.waitForTimeout(800);
    if (scene === 'market') { await p.evaluate(() => J.wm.open('market')); await p.waitForTimeout(1500); }
    const a = (await cdp.send('Performance.getMetrics')).metrics;
    await p.evaluate(() => { const S = window.__lr; if (S) { S.reads = S.inRaf = S.forced = S.forcedInRaf = 0; S.byApi = {}; } });
    const own = await p.evaluate(async ({ scene, n }) => {
      const out = {}, sleep = ms => new Promise(r => setTimeout(r, ms));
      if (scene === 'chat') {
        J.proc.start('Scenariusz czatu'); const bub = J.chat.add('jarvis', ''), st = J.proc.step('model', 'Strumień', [], { running: true });
        let acc = '', tmax = 0, tsum = 0;
        for (let i = 0; i < n; i++) {
          acc += 'Zdanie numer ' + i + ' ma kilka słów. '; if (i % 7 === 6) acc += '\n';
          const t0 = performance.now(); (bub.stream || bub.set).call(bub, acc); st.append('słowo ' + i + ' ', 'Treść'); J.engine.feed(24); const d = performance.now() - t0; tmax = Math.max(tmax, d); tsum += d;
          await sleep(10);
        }
        bub.set(acc); st.done(); J.proc.end('ok', 'koniec'); out.chunkMsAvg = +(tsum / n).toFixed(3); out.chunkMsMax = +tmax.toFixed(2);
      } else if (scene === 'log') {
        J.proc.start('Scenariusz logu'); const t0 = performance.now();
        for (let i = 0; i < n; i++) { J.proc.step('tool', 'krok ' + i, [['Argumenty', 'a'.repeat(200)], ['Wynik', 'b'.repeat(400)]]).done(); if (i % 20 === 0) await sleep(10); }
        out.addMs = +(performance.now() - t0).toFixed(1); await sleep(300);
        const t1 = performance.now(); J.proc.end('ok', 'koniec'); out.endMs = +(performance.now() - t1).toFixed(1); await sleep(200);
        out.pstepsInDom = document.querySelectorAll('#lpSteps .pstep').length; out.pbodyNodes = document.querySelectorAll('#lpSteps .pbody *').length;
      } else {
        const syms = J.market.COINS.map(c => c.sym); const t0 = performance.now();
        for (let k = 0; k < 40; k++) { syms.forEach(s => { const d = J.market.data[s]; d.price *= 1 + (Math.random() - .5) * .002; d.spark.push(d.price); d.spark.shift(); d.dir = Math.random() > .5 ? 1 : -1; J.emit('market', s); }); await sleep(100); }
        out.emitMs = +(performance.now() - t0).toFixed(1);
      }
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return out;
    }, { scene, n });
    const z = (await cdp.send('Performance.getMetrics')).metrics, wall = metric(z, 'Timestamp') - metric(a, 'Timestamp');
    const lr = await p.evaluate(() => window.__lr ? { reads: __lr.reads, forced: __lr.forced, forcedInRaf: __lr.forcedInRaf, byApi: __lr.byApi } : null);
    process.stdout.write('@@JSON@@' + JSON.stringify({ scene, wallS: +wall.toFixed(1), scriptMs: Math.round(1000 * (metric(z, 'ScriptDuration') - metric(a, 'ScriptDuration'))), layoutMs: Math.round(1000 * (metric(z, 'LayoutDuration') - metric(a, 'LayoutDuration'))), styleMs: Math.round(1000 * (metric(z, 'RecalcStyleDuration') - metric(a, 'RecalcStyleDuration'))), layouts: Math.round(metric(z, 'LayoutCount') - metric(a, 'LayoutCount')), forced: lr?.forced, forcedInRaf: lr?.forcedInRaf, reads: lr?.reads, byApi: lr?.byApi, domNodes: await p.evaluate(() => document.getElementsByTagName('*').length), ...own, errors: p.errs }) + '\n');
  } finally { await b.close().catch(() => { }); }
})().catch(e => { console.error(e); process.exit(1); });
