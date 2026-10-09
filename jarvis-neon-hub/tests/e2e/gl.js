/* E2E tła WebGL (tapeta neon) w dwóch trybach przeglądarki:
   (a) domyślne flagi CI (--no-sandbox): getContext('webgl2',{failIfMajorPerformanceCaveat:true}) zwykle zwraca null (renderer programowy) → ścieżka .bg-fb,
       a aplikacja działa; jeśli maszyna ma prawdziwe GPU, oczekujemy ścieżki GL — decyduje niezależna próbka getContext w stronie;
   (b) flagi SwiftShader + ?glcaveat=0 (parametr testowy czytany tylko w js/bg-gl.js): canvas rysuje (niezerowe próbki pikseli), utrata i odtworzenie kontekstu,
       skupienie / „ogranicz ruch” → jedna klatka, tapeta inna niż neon → bez canvasu.
   Uruchomienie: node tests/e2e/gl.js [url]   (domyślnie http://localhost:8090). Wymaga PLAYWRIGHT_MODULE albo zainstalowanego playwright. */
'use strict';
const L = require('../../tools/perf/lib.js');
const URL = process.argv[2] || process.env.JARVIS_URL || 'http://localhost:8090';
process.env.JARVIS_URL = URL;
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); };
const seed = { settings: { hermesOn: false, speech: false, sound: false, wall: 'neon' }, ui: { onboarded: true, tourDone: true } };
const st = p => p.evaluate(() => ({ mode: J.bgGl.mode, failed: J.bgGl.failed, lost: J.bgGl.lost, active: J.bgGl.active, draws: J.bgGl.draws, bakes: J.bgGl.bakes, js: J.bgGl.jsMs, W: J.bgGl.W, err: J.bgGl.err, fb: document.querySelector('#app').classList.contains('bg-fb'), cv: !!document.querySelector('#bgGl'), cvShown: !!document.querySelector('#bgGl') && getComputedStyle(document.querySelector('#bgGl')).display !== 'none' }));
const cinema = p => L.forceFx(p, 'cinema');
const lit = px => px && px.length && px.some(([r, g, b]) => r + g + b > 30) && new Set(px.map(a => a.join())).size > 2;

(async () => {
  const log = (...a) => console.log('[gl]', ...a);
  /* (a) domyślne flagi: ścieżka zależna od tego, czy renderer przejdzie próg caveat */
  { const { b, p } = await L.open({ webgl: false, seed, settleMs: 1500 });
    const can = await p.evaluate(() => { try { return !!document.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat: true }); } catch (e) { return false; } });
    await p.waitForTimeout(800); const s = await st(p); log('(a) caveat-ok=' + can, JSON.stringify(s));
    if (!can) { assert(s.failed && s.fb && s.mode === 'fb', '(a) caveat→null: .bg-fb i tryb fb'); assert(!s.cvShown && s.draws === 0, '(a) brak rysowania i widocznego canvasu'); }
    else assert(!s.failed && s.cv, '(a) GPU dostępne: ścieżka GL');
    const r = await p.evaluate(async () => { await J.brain.handle('otwórz notatnik'); return document.querySelector('#messages')?.lastElementChild?.textContent || ''; });
    assert(/Otwarto: Notatnik/.test(r), '(a) aplikacja działa w fallbacku: ' + r);
    assert(await p.evaluate(() => getComputedStyle(document.querySelector('#wallpaper')).backgroundImage.includes('gradient')), '(a) tło CSS (gradient) pod spodem');
    assert(!p.errs.length, '(a) błędy strony: ' + p.errs.join(' | '));
    await b.close(); }

  /* (b) SwiftShader z ominięciem caveat */
  { const { b, p } = await L.open({ query: 'glcaveat=0&gov=0', seed, settleMs: 1500 });
    await cinema(p); await p.waitForFunction(() => J.bgGl.mode === 'run' && J.bgGl.draws > 5, null, { timeout: 30000 });
    let s = await st(p); log('(b) run', JSON.stringify(s));
    assert(!s.failed && s.active && s.cvShown && !s.fb, '(b) GL działa, canvas widoczny'); assert(s.W === Math.floor(1600 * .65), '(b) skala 0,65: ' + s.W);
    assert(s.js < 1, '(b) budżet JS/klatkę: ' + s.js);
    assert(lit(await p.evaluate(() => J.bgGl.probe(5))), '(b) piksele sceny niezerowe i zróżnicowane');
    const d0 = s.draws; await p.waitForTimeout(1500); assert((await st(p)).draws > d0, '(b) rysuje się dalej (jedna pętla main.js)');
    /* Faza 3B: scena GL przejmuje jezioro i sieć — #fx poza układem, kanwa jeziora ukryta (poza pulsem), horyzont jedno źródło prawdy */
    { const g = await p.evaluate(() => ({ on: document.querySelector('#app').classList.contains('gl-on'), fx: getComputedStyle(document.querySelector('#fx')).display, flow: document.querySelector('#flowCanvas').style.display, hz: J.hud.scene.horizon, cy: J.hud.scene.cy, R: J.hud.scene.R, foot: J.hud.scene.foot, bg: J.bgGl.hz, top: J.hud.scene.top, vh: innerHeight }));
      assert(g.on && g.fx === 'none' && g.flow === 'none', '(b) gl-on: #fx i #flowCanvas poza układem ' + JSON.stringify(g));
      assert(g.hz > g.cy && g.hz < g.foot && Math.abs(g.bg - (1 - (g.hz + g.top) / g.vh)) < .002, '(b) horyzont neonu między środkiem Orba a stopą wiązki i zgodny z shaderem ' + JSON.stringify(g)); }
    /* impuls błędu zadania w cinema → aberracja (osobny przebieg), potem powrót */
    await p.evaluate(() => J.ev.emit('task.failed', { task_id: 'x' })); await p.waitForTimeout(300);
    assert(await p.evaluate(() => J.fxd.pulseKind === 'err' && performance.now() - J.fxd.pulseAt < 1500), '(b) impuls err zarejestrowany dla shadera');
    assert(lit(await p.evaluate(() => J.bgGl.probe(3))), '(b) klatka z aberracją niezerowa');
    /* utrata i odtworzenie kontekstu */
    await p.evaluate(() => { window.__ext = J.bgGl.canvas().getContext('webgl2').getExtension('WEBGL_lose_context'); window.__ext.loseContext(); });
    await p.waitForFunction(() => J.bgGl.lost && document.querySelector('#app').classList.contains('bg-fb') && !J.bgGl.active, null, { timeout: 10000, polling: 100 }).catch(() => { });   // oczekiwanie na warunek (SwiftShader bywa wolny), nie stały czas; asercja poniżej zostaje bez zmian
    s = await st(p); log('(b) po utracie', JSON.stringify(s)); assert(s.lost && s.fb && !s.cvShown && !s.active, '(b) utrata: .bg-fb i pauza');
    const d1 = s.draws; await p.waitForTimeout(500); assert((await st(p)).draws === d1, '(b) w utracie brak rysowania');
    await p.evaluate(() => window.__ext.restoreContext()); await p.waitForFunction(() => !J.bgGl.lost && J.bgGl.mode === 'run', null, { timeout: 10000 }); await p.waitForTimeout(600);
    s = await st(p); log('(b) po odtworzeniu', JSON.stringify(s)); assert(!s.fb && s.cvShown && s.draws > d1, '(b) odtworzenie: wznowione rysowanie, brak .bg-fb');
    assert(lit(await p.evaluate(() => J.bgGl.probe(3))), '(b) po odtworzeniu sceny niezerowe');
    /* skupienie → jedna klatka; wyjście → ruch */
    await p.evaluate(() => document.querySelector('#app').classList.add('focus')); await p.waitForFunction(() => J.bgGl.mode === 'still', null, { timeout: 10000, polling: 100 }).catch(() => { }); await p.waitForTimeout(100);
    s = await st(p); assert(s.mode === 'still', '(b) skupienie: still'); const d2 = s.draws; await p.waitForTimeout(800); assert((await st(p)).draws === d2, '(b) skupienie: zero rysowania');
    await p.evaluate(() => document.querySelector('#app').classList.remove('focus')); await p.waitForFunction(() => J.bgGl.mode === 'run', null, { timeout: 10000, polling: 100 }).catch(() => { }); assert((await st(p)).mode === 'run', '(b) po skupieniu: run');
    /* zmiana tapety na jezioro → canvas ukryty, rysowanie stoi; powrót na neon → rysuje */
    await p.evaluate(async () => { await J.brain.handle('tapeta photo'); }); await p.waitForTimeout(500);
    s = await st(p); assert(s.mode === 'off' && !s.cvShown, '(b) photo: tło GL wyłączone'); const d3 = s.draws; await p.waitForTimeout(600); assert((await st(p)).draws === d3, '(b) photo: zero rysowania');
    await p.evaluate(async () => { await J.brain.handle('tapeta neon'); }); await p.waitForTimeout(800);
    s = await st(p); assert(s.mode === 'run' && s.cvShown && s.draws > d3, '(b) powrót na neon: rysuje');
    assert(!p.errs.length, '(b) błędy strony: ' + p.errs.join(' | '));
    await b.close(); }

  /* (b2) „ogranicz ruch” → rank 0 → jedna klatka */
  { const { b, p } = await L.open({ query: 'glcaveat=0&gov=0', seed, reducedMotion: 'reduce', settleMs: 1500 });
    await p.waitForFunction(() => J.bgGl.draws >= 1, null, { timeout: 30000 }); await p.waitForTimeout(600);
    const s = await st(p), d = s.draws; log('(b2) reduced-motion', JSON.stringify(s)); assert(s.mode === 'still' && s.active, '(b2) still przy prefers-reduced-motion');
    await p.waitForTimeout(1000); assert((await st(p)).draws === d, '(b2) brak pętli rysowania'); assert(!p.errs.length, '(b2) błędy: ' + p.errs.join(' | '));
    await b.close(); }
  /* (c) Faza 5B — efekty kinowe cz. 2 na scenie GL: cząstki, hologramowe okna, paralaksa/tilt (spoczynek bez zmian rektów kart), equalizer tylko z analyserem */
  { const { b, p } = await L.open({ query: 'glcaveat=0&gov=0', seed, settleMs: 1500, width: 1440, height: 800 });
    const rects = () => p.evaluate(() => [...document.querySelectorAll('#hud .hc')].map(e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(v => Math.round(v * 10) / 10).join(','); }).join('|'));
    await cinema(p); await p.waitForFunction(() => J.bgGl.mode === 'run' && J.bgGl.draws > 5, null, { timeout: 30000 }); await p.waitForTimeout(600);
    let g = await p.evaluate(() => ({ n: J.bgGl.partN, pd: J.bgGl.pdraws || 0, err: J.bgGl.err, failed: J.bgGl.failed }));
    log('(c) cząstki', JSON.stringify(g)); assert(!g.failed && g.n === 6000 && g.pd > 0, '(c) cinema: 6 tys. punktów rysowanych'); assert(lit(await p.evaluate(() => J.bgGl.probe(5))), '(c) scena z cząstkami niezerowa');
    await L.forceFx(p, 'standard'); await p.waitForTimeout(500); assert((await p.evaluate(() => J.bgGl.partN)) === 0, '(c) standard: zero cząstek'); await cinema(p); await p.waitForTimeout(500);
    await p.evaluate(() => { J.ev.emit('tool.started', { tool: 'x' }); }); assert(await p.evaluate(() => J.fxd.sparkK === .5 && performance.now() - J.fxd.sparkAt < 500), '(c) iskry od realnego zdarzenia');
    /* regulator: shed zmniejsza liczbę punktów */
    assert(await p.evaluate(() => J.bgGl.partShed()), '(c) shed'); await p.waitForTimeout(500); assert((await p.evaluate(() => J.bgGl.partN)) === 3000, '(c) po shed 3000'); await p.evaluate(() => J.bgGl.partReset());
    /* hologramowe okno: klasa .holo i animacja winHolo; zamknięcie zwija do linii */
    const h = await p.evaluate(() => { J.wm.open('notes'); const el = document.querySelector('.window[data-app=notes]'); return { cls: el.className, an: el.getAnimations().map(a => a.animationName).filter(Boolean), ghost: !!document.querySelector('.win-ghost') }; });
    assert(/holo/.test(h.cls) && h.an.includes('winHolo') && h.ghost, '(c) hologram + duch w cinema: ' + JSON.stringify(h));
    await p.waitForTimeout(900); await p.evaluate(() => J.wm.close('notes')); await p.waitForTimeout(80);
    assert(await p.evaluate(() => document.querySelector('.window[data-app=notes]')?.getAnimations().some(a => a.animationName === 'winHoloOut')), '(c) zamknięcie: winHoloOut'); await p.waitForTimeout(600);
    assert(await p.evaluate(() => !document.querySelector('.window[data-app=notes]')), '(c) okno usunięte po zwinięciu');
    /* pierścień energii okna (.win-en, warstwa 145cqmax ≈ 940 px): działa na oknie w oknie, a przy zmaksymalizowanym i na ≤ 900 px go nie ma (liczba animacji enSpin i warstw) */
    { const en = () => p.evaluate(() => document.getAnimations().filter(a => a.animationName === 'enSpin' && a.effect?.target?.closest?.('.window')).length);
      await p.evaluate(() => { J.wm.open('notes'); }); await p.waitForTimeout(900);
      assert((await en()) >= 1, '(c) okno z fokusem: pierścień energii jedzie'); await p.evaluate(() => J.wm.toggleMax('notes')); await p.waitForTimeout(500);
      assert((await en()) === 0, '(c) okno zmaksymalizowane: bez pierścienia energii'); await p.evaluate(() => J.wm.toggleMax('notes'));
      await p.setViewportSize({ width: 390, height: 800 }); await p.waitForTimeout(700);
      assert((await en()) === 0, '(c) ≤ 900 px: bez pierścienia energii okna'); assert(await p.evaluate(() => [...document.querySelectorAll('.hc-en')].every(e => getComputedStyle(e).display === 'none' || e.closest('.hc')?.dataset.s === 'ask')), '(c) ≤ 900 px: bez pierścieni kart HUD');
      assert((await p.evaluate(() => J.bgGl.partN)) === 0, '(c) ≤ 640 px: bez cząstek GL');
      await p.setViewportSize({ width: 1440, height: 800 }); await p.waitForTimeout(700); await p.evaluate(() => J.wm.close('notes')); await p.waitForTimeout(900); }
    /* gest okna: na czas przeciągania #app.wdrag zatrzymuje dekoracyjne animacje (dwukropek LED, pierścienie), po puszczeniu wracają */
    { await p.evaluate(() => { J.wm.open('notes'); }); await p.waitForTimeout(900);
      const hd = await p.evaluate(() => { const h = document.querySelector('.window[data-app=notes] .win-head b').getBoundingClientRect(); return { x: h.left + 20, y: h.top + h.height / 2 }; });
      const colon = () => p.evaluate(() => getComputedStyle(document.querySelector('#tsClock .c, #clockBig .c')).animationName);
      assert(await colon() !== 'none', '(c) przed gestem dwukropek LED miga');
      await p.mouse.move(hd.x, hd.y); await p.mouse.down(); await p.mouse.move(hd.x + 60, hd.y + 30, { steps: 5 }); await p.waitForTimeout(300);
      assert(await p.evaluate(() => document.querySelector('#app').classList.contains('wdrag')), '(c) w trakcie gestu #app.wdrag'); assert(await colon() === 'none', '(c) w trakcie gestu dwukropek stoi');
      await p.mouse.up(); await p.waitForTimeout(300);
      assert(await p.evaluate(() => !document.querySelector('#app').classList.contains('wdrag')), '(c) po gestu bez #app.wdrag'); assert(await colon() !== 'none', '(c) po gestie dwukropek miga');
      await p.evaluate(() => J.wm.close('notes')); await p.waitForTimeout(900); }
    /* ghost segments cyfr LED (content: attr(data-g) / "") nie trafiają do drzewa dostępności */
    { const snap = await p.locator('body').ariaSnapshot(); assert(!/88:88|8:88/.test(snap), '(c) drzewo dostępności bez „88:88” z ghost segments'); assert(await p.evaluate(() => !!document.querySelector('.led[data-g]')), '(c) są cyfry LED z ghost segments (test nie jest pusty)'); }
    /* paralaksa i tilt: ruch tylko podczas ruchu kursora, spoczynek = rekty kart bez zmian */
    await L.emitTask(p); await p.waitForTimeout(2200); await p.mouse.move(1430, 400); await p.waitForTimeout(1500); const r0 = await rects();
    for (let i = 0; i < 16; i++) { await p.mouse.move(300 + i * 40, 200 + i * 15); await p.waitForTimeout(40); }
    const mv = await p.evaluate(() => ({ core: document.querySelector('#coreWrap').style.translate, hud: document.querySelector('#hud .hc').style.translate || '', par: J.bgGl.par[0] }));
    assert(mv.core && !mv.hud && mv.par !== 0, '(c) paralaksa podczas ruchu: ' + JSON.stringify(mv));
    await p.mouse.move(1430, 400); await p.waitForTimeout(1500);
    const rest = await p.evaluate(() => ({ core: document.querySelector('#coreWrap').style.translate, hud: [...document.querySelectorAll('#hud .hc')].map(e => e.style.translate).join(''), par: J.bgGl.par.join() }));
    assert(!rest.core && !rest.hud && rest.par === '0,0', '(c) paralaksa wraca do zera: ' + JSON.stringify(rest)); assert((await rects()) === r0, '(c) rekty kart HUD w spoczynku bez zmian po paralaksie');
    const c = await p.evaluate(() => { const r = document.querySelector('#hud .hc').getBoundingClientRect(); return { x: r.left + r.width * .85, y: r.top + r.height * .25 }; });
    await p.mouse.move(c.x - 40, c.y - 40); await p.mouse.move(c.x, c.y, { steps: 4 }); await p.waitForTimeout(600);
    const tl = await p.evaluate(() => ({ rot: document.querySelector('#hud .hc').style.rotate, cls: document.querySelector('#hud').className })); assert(/deg$/.test(tl.rot) && parseFloat(tl.rot.split(' ')[3]) <= 3 && /tilt/.test(tl.cls), '(c) tilt ≤ 3° pod kursorem: ' + JSON.stringify(tl));
    await p.mouse.move(1430, 400); await p.waitForTimeout(1500); assert(!(await p.evaluate(() => [...document.querySelectorAll('#hud .hc')].some(e => e.style.rotate))), '(c) tilt zdjęty po wyjściu kursora'); assert((await rects()) === r0, '(c) rekty kart bez zmian po tilcie');
    /* equalizer: bez analysera brak elementu; z analyserem w LISTENING jest, po nasłuchu znika */
    await p.evaluate(() => J.orb.set('listening', 'słucham')); await p.waitForTimeout(500); assert(await p.evaluate(() => !document.querySelector('#eqBars')), '(c) bez analysera brak equalizera');
    await p.evaluate(() => { J.ear.analyser = { frequencyBinCount: 128, getByteFrequencyData(a) { a.fill(140); } }; }); await p.waitForTimeout(700); assert(await p.evaluate(() => !!document.querySelector('#eqBars')), '(c) z analyserem equalizer jest');
    await p.evaluate(() => { J.orb.set('idle'); J.ear.analyser = null; }); await p.waitForTimeout(900); assert(await p.evaluate(() => !document.querySelector('#eqBars')), '(c) po nasłuchu equalizer usunięty');
    /* niższy poziom: paralaksa, tilt i equalizer wyłączone */
    await L.forceFx(p, 'standard'); await p.mouse.move(500, 300); await p.mouse.move(540, 330); await p.waitForTimeout(300); assert(await p.evaluate(() => !document.querySelector('#coreWrap').style.translate && ![...document.querySelectorAll('#hud .hc')].some(e => e.style.translate)), '(c) standard: bez paralaksy');
    assert(!p.errs.length, '(c) błędy strony: ' + p.errs.join(' | '));
    await b.close(); }

  log('OK');
})().catch(e => { console.error('E2E GL FAIL:', e.message); process.exit(1); });
