#!/usr/bin/env node
// Side-by-side check against the real Gource (reference only, nothing of it is shipped):
//   node tools/compare-gource.mjs <run> <t1,t2,...seconds> [outDir] [WxH]
// 1) writes the run's Gource log from the same action stream our viewer uses (adapters/gource.js),
// 2) renders it with `gource` under Xvfb (time ×100, --seconds-per-day 864 => 1 s of the run = 1 s),
// 3) renders our viewer at the same moments (?compat=1&chrome=0, needs `npm start` on :4777),
// 4) writes pair_<t>.png (Gource left, ours right) and prints a blurred-SSIM score per moment.
// Needs: gource, xvfb-run, ffmpeg, Playwright with Chromium.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { parseJsonl, toGourceLines } from '../packages/core/index.js';

const [run, times, outArg, sizeArg] = process.argv.slice(2);
if (!run || !times) { console.error('usage: compare-gource.mjs <run> <t1,t2,...> [outDir] [WxH]'); process.exit(2); }
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.resolve(outArg || '/tmp/nw-compare');
const [W, H] = (sizeArg || '1280x720').split('x').map(Number);
const T = times.split(',').map(Number);
fs.mkdirSync(out, { recursive: true });
const src = [path.join(ROOT, 'data', 'runs', run + '.jsonl'), path.join(ROOT, 'demo', 'runs', run + '.jsonl')].find((p) => fs.existsSync(p));
const { events } = parseJsonl(fs.readFileSync(src, 'utf8'));
const log = path.join(out, run + '.gource.log');
fs.writeFileSync(log, toGourceLines(events, 100).join('\n') + '\n');

// ---- real Gource: frames at 60 fps, pick the ones at the requested times
const FPS = 60;
const last = Math.max(...T);
await new Promise((resolve, reject) => {
  const g = spawn('xvfb-run', ['-a', '-s', `-screen 0 ${W}x${H}x24`, 'gource', log, '--log-format', 'custom', `-${W}x${H}`,
    '--seconds-per-day', '864', '--auto-skip-seconds', '100000', '--key', '--hide', 'mouse,progress,date',
    '--stop-position', '1.0', '--disable-input', '--output-framerate', String(FPS), '--output-ppm-stream', '-'], { stdio: ['ignore', 'pipe', 'inherit'] });
  const sel = T.map((t) => `eq(n\\,${Math.round(t * FPS)})`).join('+');
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-vcodec', 'ppm', '-i', '-', '-vf', `select='${sel}'`, '-vsync', '0', '-frames:v', String(T.length), path.join(out, 'ref_%02d.png')], { stdio: ['pipe', 'inherit', 'inherit'] });
  ff.stdin.on('error', () => {});
  g.stdout.on('error', () => {});
  g.stdout.pipe(ff.stdin);
  let frames = 0;
  g.stdout.on('data', () => { frames++; });
  ff.on('close', () => { try { g.kill('SIGTERM'); } catch (e) { /* done */ } resolve(); });
  g.on('error', reject);
  setTimeout(() => { try { g.kill('SIGTERM'); } catch (e) { /* done */ } }, (last + 20) * 4000);
});

// ---- ours
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = createRequire('/opt/node-tools/node_modules/')('playwright')); }
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
await page.goto(`http://127.0.0.1:4777/?run=${encodeURIComponent(run)}&compat=1&chrome=0`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__NW && window.__NW.T && window.__NW.T.events.length, null, { timeout: 15000 });
await page.evaluate(() => document.fonts && document.fonts.load('14px FreeSans'));
for (let i = 0; i < T.length; i++) {
  await page.evaluate((ms) => window.__NW.renderAt(ms), T[i] * 1000);
  await page.screenshot({ path: path.join(out, `ours_${String(i + 1).padStart(2, '0')}.png`) });
}
await browser.close();

// ---- pairs + score (SSIM of heavily blurred grey images: compares where the light is, not exact pixels)
for (let i = 0; i < T.length; i++) {
  const n = String(i + 1).padStart(2, '0');
  const ref = path.join(out, `ref_${n}.png`); const ours = path.join(out, `ours_${n}.png`);
  if (!fs.existsSync(ref)) { console.log(`t=${T[i]}s: no Gource frame`); continue; }
  const name = `pair_${run}_${String(T[i]).replace('.', '_')}s.png`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', ref, '-i', ours, '-filter_complex', '[0][1]hstack', path.join(out, name)]);
  const r = spawnSync('ffmpeg', ['-i', ref, '-i', ours, '-filter_complex', '[0]format=gray,gblur=sigma=8[a];[1]format=gray,gblur=sigma=8[b];[a][b]ssim', '-f', 'null', '-'], { encoding: 'utf8' });
  const ssim = String(r.stderr || '');
  const m = /All:([0-9.]+)/.exec(ssim);
  console.log(`t=${T[i]}s  ${name}  ssim(blur8)=${m ? m[1] : '?'}`);
}
