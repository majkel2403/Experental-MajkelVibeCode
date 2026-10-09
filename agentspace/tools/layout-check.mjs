#!/usr/bin/env node
// Layout check: opens the app in six window sizes and several states and fails when panels overlap, anything leaves
// the screen, text is smaller than 12 px, or the page errors. Needs `npm start` (default http://127.0.0.1:4777) and
// Playwright (PLAYWRIGHT_MODULE=<dir containing playwright>, or installed locally).
//   node tools/layout-check.mjs [outDir]      writes screenshots when outDir is given
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(process.env.PLAYWRIGHT_MODULE ? process.env.PLAYWRIGHT_MODULE.replace(/\/?$/, '/') : import.meta.url);
const { chromium } = require('playwright');
const base = process.env.URL || 'http://127.0.0.1:4777';
const out = process.argv[2];
if (out) fs.mkdirSync(out, { recursive: true });
const SIZES = [[390, 844], [768, 1024], [1024, 768], [1280, 800], [1440, 900], [1920, 1080]];
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
let bad = 0;
const fail = (m) => { bad++; console.log('  FAIL ' + m); };

// rectangles of the regions that must never intersect
const REGIONS = '.hx-top,.hx-rail,.hx-drawer,.hx-dock,.hx-free';
for (const [w, h] of SIZES) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(base + '/?run=repo-fix', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__NW && window.__NW.T && document.querySelector('.hx-step'), null, { timeout: 20000 }).catch(() => errs.push('app not ready'));
  await page.evaluate(() => { window.__NW.pause(); window.__NW.setTime(100000); });
  { const x = await page.$('.hx-card [aria-label="Zamknij"]'); if (x) await x.click(); }
  await page.waitForTimeout(500);
  const states = [['code', null], ['talk', null], ['files', null], ['log', null], ['report', 'end']];
  console.log(`${w}x${h}`);
  for (const [tab, mode] of states) {
    if (mode === 'end') { await page.evaluate(() => window.__NW.setTime(window.__NW.T.duration)); await page.waitForTimeout(400); }
    if (tab === 'report') { await page.click('.hx-top [aria-label="Raport"]').catch(() => fail('report button not clickable')); }
    else {
      if (await page.$('.hx[data-bp="s"][data-sheet="false"]')) await page.click('.hx-sheetbar');
      await page.click(`.hx-tab[aria-label="${{ code: 'Kod', talk: 'Rozmowy', files: 'Pliki', log: 'Dziennik' }[tab]}"]`).catch(() => fail(`tab ${tab} not clickable`));
    }
    await page.waitForTimeout(350);
    const r = await page.evaluate((REGIONS) => {
      const rects = [...document.querySelectorAll(REGIONS)].filter((e) => e.offsetParent !== null && e.getBoundingClientRect().width > 0).map((e) => ({ n: e.className.split(' ').slice(0, 2).join('.'), ...e.getBoundingClientRect().toJSON() }));
      const o = [];
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]; const b = rects[j];
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) o.push(a.n + ' x ' + b.n);
      }
      const W = window.innerWidth; const H = window.innerHeight;
      const off = rects.filter((r) => r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1).map((r) => r.n);
      // text smaller than 12 px, and horizontal page overflow
      const small = new Set();
      for (const el of document.querySelectorAll('.hx *')) {
        if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim())) continue;
        if (el.offsetParent === null) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 11.99) small.add(el.className + ':' + fs);
      }
      const hs = document.documentElement.scrollWidth > W + 1;
      const stage = document.querySelector('.hx-free').getBoundingClientRect();
      return { o, off, small: [...small], hs, stage: [Math.round(stage.width), Math.round(stage.height)] };
    }, REGIONS);
    if (r.o.length) fail(`${tab}: overlap ${r.o.join(', ')}`);
    if (r.off.length) fail(`${tab}: outside the screen ${r.off.join(', ')}`);
    if (r.small.length) fail(`${tab}: text under 12px ${r.small.join(', ')}`);
    if (r.hs) fail(`${tab}: horizontal page scroll`);
    if (r.stage[0] < 160 || r.stage[1] < 120) fail(`${tab}: scene too small ${r.stage}`);
    if (out) await page.screenshot({ path: `${out}/${w}x${h}-${tab}.png` });
  }
  if (errs.length) fail('page errors: ' + errs.join(' | '));
  await page.close();
}
await browser.close();
console.log(bad ? `\n${bad} problems` : '\nlayout ok');
process.exit(bad ? 1 : 0);
