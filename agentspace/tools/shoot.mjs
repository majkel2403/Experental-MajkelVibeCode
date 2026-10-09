#!/usr/bin/env node
// Local visual check of the viewer in headless Chromium (needs the server running and Playwright on the machine).
//   node tools/shoot.mjs '<json jobs>'   jobs: [{ name, url, w, h, wait, eval }]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = createRequire('/opt/node-tools/node_modules/')('playwright')); }
const jobs = JSON.parse(process.argv[2]);
const out = process.argv[3] || '/tmp/nw-shots';
const fs = await import('node:fs');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
for (const j of jobs) {
  const ctx = await browser.newContext({ viewport: { width: j.w || 1440, height: j.h || 900 }, deviceScaleFactor: j.dpr || 1 });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
  await page.goto(j.url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__NW && window.__NW.T, null, { timeout: 15000 }).catch(() => logs.push('viewer not ready'));
  if (j.eval) await page.evaluate(j.eval);
  await page.waitForTimeout(j.wait || 1500);
  const info = await page.evaluate(() => ({ backend: window.__NW.backend, t: Math.round(window.__NW.t), ft: window.__NW.ft && window.__NW.ft.toFixed(1) }));
  await page.screenshot({ path: out + '/' + j.name + '.png' });
  console.log(j.name, JSON.stringify(info), logs.slice(0, 5).join(' | '));
  await ctx.close();
}
await browser.close();
