/* Statyczne kontrole CSS po weryfikacji Fazy 1: ramka ekranu (.vignette) i liczba gradientów w trybach lekkich. */
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { stripComments } = require('../../tools/css-lint.js');
const css = stripComments(fs.readFileSync(path.join(__dirname, '..', '..', 'css', 'jarvis.css'), 'utf8'));
const vg = n => { const m = new RegExp('--' + n + ':(.*?);--vg-').exec(css) || new RegExp('--' + n + ':(.*?);background').exec(css); assert.ok(m, 'brak --' + n); return m[1]; };
const count = s => (s.match(/-gradient\(/g) || []).length;

test('.vignette: górne narożniki ramki leżą na y=60px (pod paskiem), dolne na 10px', () => {
  const c = vg('vg-c'), tops = c.match(/(?:left|right) \d+px top (\d+)px/g) || [], bots = c.match(/(?:left|right) \d+px bottom (\d+)px/g) || [];
  assert.ok(tops.length >= 8 && bots.length >= 8, 'oba rzędy narożników obecne');
  for (const t of tops) assert.ok(/top (60|57)px/.test(t), 'górny narożnik pod paskiem (60px, poświata 57px): ' + t);
  for (const t of bots) assert.ok(/bottom (10|7)px/.test(t), t);
  assert.ok(!/top 10px/.test(c), 'żaden element ramki nie ląduje na y=10px pod paskiem');
});
test('.vignette: lowfx używa samych linii narożników (8 gradientów) — łącznie ≤12; ≤900 px bez ramki (≤5)', () => {
  assert.equal(count(vg('vg-cl')), 8);
  assert.equal(count(vg('vg-c')), 16);
  const rules = [...css.matchAll(/\.app\.lowfx \.vignette\{background:([^}]*)\}/g)].map(m => m[1]);
  assert.ok(rules.length >= 1 && rules.some(r => /var\(--vg-cl\)/.test(r)), 'lowfx używa --vg-cl');
  for (const lowfx of rules) {
    assert.ok(!/var\(--vg-c\)/.test(lowfx), 'lowfx: nie pełna ramka z poświatą: ' + lowfx);
    const total = [...lowfx.matchAll(/var\(--(vg-[a-z]+)\)/g)].reduce((s, m) => s + count(vg(m[1])), 0);
    assert.ok(total <= 12, 'lowfx: ' + total + ' gradientów');
  }
  const narrow = /@media[^{]*max-width:\s*900px[^{]*\{[\s\S]*?\.vignette\{background:([^}]*)\}/.exec(css);
  assert.ok(narrow && !/--vg-c\b/.test(narrow[1]), '≤900 px: bez narożników ramki');
});

/* ---------- kontrast: przygaszanie tłem/ikoną, nie opacity na tekście ---------- */
const rule = sel => { const m = new RegExp('(?:^|})\\s*' + sel.replace(/[.[\]()*+?^$|\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}').exec(css); return m ? m[1] : null; };
test('kontrast: .deck przy hud-on i karty .hc[data-s=idle] nie używają opacity (tekst ≥4,5:1), przygaszają tło/ikonę', () => {
  const deck = rule('.workspace.hud-on .deck'), idle = rule('.hud.show .hc[data-s=idle]'), ic = rule('.hc[data-s=idle] .hc-ic');
  assert.ok(deck && idle && ic, 'reguły istnieją');
  assert.ok(!/opacity/.test(deck), '.deck przy HUD: bez opacity — ' + deck); assert.ok(/background/.test(deck));
  assert.ok(!/opacity/.test(idle), 'karta idle: bez opacity na całej karcie — ' + idle); assert.ok(/background/.test(idle));
  assert.ok(/opacity:\s*\.?\d/.test(ic), 'ikona idle przygaszona');
  const d = rule('.deck'); assert.ok(/--muted:#[0-9a-f]{6}/i.test(d) && /--dim:#[0-9a-f]{6}/i.test(d), '.deck ma własne, jaśniejsze --muted/--dim');
  assert.ok(/background:rgba\(/.test(rule('.dk-cap')), 'podpis wykresu ma własne tło');
});
test('kontrast: --muted/--dim na .deck są jaśniejsze niż globalne (tło szkła ciemne)', () => {
  const lum = h => { const n = parseInt(h.slice(1), 16), f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(n >> 16 & 255) + .7152 * f(n >> 8 & 255) + .0722 * f(n & 255); };
  const g = /--muted:(#[0-9a-f]{6}); --dim:(#[0-9a-f]{6})/i.exec(css), d = rule('.deck');
  assert.ok(lum(/--muted:(#[0-9a-f]{6})/i.exec(d)[1]) > lum(g[1]) && lum(/--dim:(#[0-9a-f]{6})/i.exec(d)[1]) > lum(g[2]));
});

/* poprawki po weryfikacji Fazy 2: tła okien i paneli prawie nieprzezroczyste (bez blura nic nie może prześwitywać), rim i impulsy gasną w trybach */
const R = sel => { const r = rule(sel); assert.ok(r, 'brak reguły ' + sel); return r; };
const alphas = decl => [...(/background:([^;]*)/.exec(decl)?.[1] || '').matchAll(/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*([.\d]+)\)/g)].map(m => +m[1]);
test('tła .window / .chat-panel / .log-panel: wszystkie przystanki gradientu o alfa >= .96', () => {
  const w = alphas(R('.window')), p = alphas(R('.chat-panel,.log-panel'));
  assert.ok(w.length >= 2 && p.length >= 2, 'gradienty odczytane');
  for (const a of [...w, ...p]) assert.ok(a >= .96, 'przezroczystość tła ' + a);
  assert.ok(!/backdrop-filter/.test(R('.window') + R('.chat-panel,.log-panel')), 'bez blura');
});
test('LED rim: górna linia i poświata pod topbarem (y=52), rail bez gradientu, tryby gaszą rim/impulsy', () => {
  const rim = R('.vignette:before');
  assert.ok(/top 52px\/100% 2px/.test(rim) && /top 54px\/100% 130px/.test(rim), 'góra pod paskiem');
  assert.ok(!/ top\/100% (2px|130px)/.test(rim), 'brak linii na y=0 (ukryta pod topbarem)');
  assert.ok(!/gradient/.test(R('.icon-rail')), '.icon-rail bez gradientu (przyciemniał lewą krawędź rim)');
  assert.ok(/\.app\.present \.vignette:before,\.app\.present \.vignette:after\{display:none\}/.test(css), 'prezentacja: rim ukryty');
  assert.ok(/#app\.present:after\{display:none!important\}/.test(css), 'prezentacja: bez impulsów');
  assert.ok(/#app\[data-mode=STANDBY\] \.vignette:before\{opacity:\.35\}/.test(css), 'STANDBY przygasza rim');
  const fc = /@media \(forced-colors:active\),\(prefers-contrast:more\)\{([^}]*)\}/.exec(css); assert.ok(fc, 'forced-colors + prefers-contrast');
  assert.ok(/\.vignette:before/.test(fc[1]) && /#app:after/.test(fc[1]) && /display:none/.test(fc[1]));
  assert.ok(/pointer-events:none/.test(R('.vignette:before,.vignette:after')), 'rim nie łapie myszy');
});
test('pierścienie .cr1/.cr3: maska radialna z closest-side (bez niego klin/sunburst zamiast cienkiego pierścienia)', () => {
  for (const sel of ['.cr1', '.cr3']) { const r = R(sel); assert.ok(/mask:radial-gradient\(closest-side/.test(r) && /-webkit-mask:radial-gradient\(closest-side/.test(r), sel + ': maska z closest-side (z prefiksem i bez)'); }
});

test('forced-colors: okna, panele, karty HC, chipy i toasty mają nieprzezroczyste tło Canvas i obrys CanvasText', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', '..', 'css', 'neon.css'), 'utf8');
  const m = /@media \(forced-colors:active\)\{\s*([^{}]+)\{([^}]*)\}\s*\}/.exec(css.slice(css.indexOf('forced-colors: okna i panele')));
  assert.ok(m, 'blok forced-colors z jedną regułą okien i paneli');
  for (const sel of ['.window', '.chat-panel', '.log-panel', '.hc', '.chip', '.toast']) assert.ok(m[1].split(',').includes(sel), sel + ' w selektorze');
  assert.match(m[2], /background:Canvas!important/, 'tło nieprzezroczyste (Canvas), nie gradient');
  assert.match(m[2], /border:1px solid CanvasText!important/, 'obrys CanvasText');
  assert.match(m[2], /color:CanvasText!important/); assert.match(m[2], /box-shadow:none!important/);
  assert.ok(!/rgba?\(|gradient/.test(m[2]), 'w forced-colors żadnych kolorów własnych ani gradientów');
});
