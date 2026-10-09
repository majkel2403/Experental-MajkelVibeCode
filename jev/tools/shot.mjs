#!/usr/bin/env node
// Screenshot helper (headless Chromium via the globally installed Playwright, WebGL through SwiftShader).
// usage: node jev/tools/shot.mjs --file jev/dist/jev.html --out /tmp/x.png [--w 1440] [--h 900] [--mobile]
//          [--sel '#hero']      screenshot only this element (scrolled into view first)
//          [--full]             full page (scrolls through first so reveals fire)
//          [--wait 3500]        ms to wait after load before shooting     [--after 1200] extra ms after scrolling to --sel
//          [--eval 'js']        run JS in the page before shooting (e.g. click things)    [--frames 3 --gap 700] burst of frames: out-1.png …
// prints console errors / page errors; exit code 0 always.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
const A = process.argv.slice(2);
const get = (n, d) => { const i = A.indexOf('--' + n); return i >= 0 ? A[i + 1] : d; };
const has = (n) => A.includes('--' + n);
const file = path.resolve(get('file')), out = path.resolve(get('out', '/tmp/shot.png'));
const mobile = has('mobile');
const W = +get('w', mobile ? 390 : 1440), H = +get('h', mobile ? 844 : 900);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/fonts\.g|ERR_|favicon|net::/.test(m.text())) logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message + ' @ ' + ((e.stack || '').split('\n')[1] || '').trim()));
await page.goto('file://' + file, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(+get('wait', 3500));
const sel = get('sel');
if (has('full')) {
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < total; y += Math.round(H * 0.6)) { await page.evaluate((y) => window.scrollTo(0, y), y); await page.waitForTimeout(160); }
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(700);
}
if (sel) { await page.evaluate((s) => { const el = document.querySelector(s); if (el) el.scrollIntoView({ block: 'start', behavior: 'instant' }); }, sel); await page.waitForTimeout(+get('after', 1500)); }
const ev = get('eval'); if (ev) { await page.evaluate(ev); await page.waitForTimeout(+get('after', 1200)); }
const frames = +get('frames', 1), gap = +get('gap', 700);
for (let i = 0; i < frames; i++) {
  const o = frames > 1 ? out.replace(/\.png$/, `-${i + 1}.png`) : out;
  if (sel && !has('viewport')) { const el = await page.$(sel); if (el) await el.screenshot({ path: o }); else await page.screenshot({ path: o }); }
  else await page.screenshot({ path: o, fullPage: has('full') });
  if (i < frames - 1) await page.waitForTimeout(gap);
}
const info = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, w: document.documentElement.scrollWidth, boot: (window.JEV && window.JEV.bootLog) || [] }));
console.log(`shot ${out}  page ${info.w}x${info.h}  modules: ${info.boot.join(', ') || '(none)'}`);
console.log(logs.length ? logs.join('\n') : 'no console errors');
await browser.close();
