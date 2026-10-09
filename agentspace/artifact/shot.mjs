#!/usr/bin/env node
// shot.mjs — local visual check of a Design-canvas board in headless Chromium (own copy only; never touches the published artifact).
// usage: node tools/render/shot.mjs <jobs.json>
//   jobs.json: { "page": "Main.dc.html", "w":1440, "h":1000, "jobs":[ {"name":"x","w":..,"h":..,"eval":"js run in page after boot","wait":800,"full":false,"clip":{x,y,width,height}} ] }
// Output PNGs: tmp/shots/<name>.png ; console errors/warnings are printed. Fonts + React are served from local vendor copies.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';

const HERE = path.dirname(new URL(import.meta.url).pathname);
let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch (e) { ({ chromium } = createRequire('/opt/node-tools/node_modules/')('playwright')); }
const jobsFile = process.argv[2];
if (!jobsFile) { console.error('usage: shot.mjs <jobs.json>'); process.exit(2); }
const cfg = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
const PROJECT = path.join(HERE, 'project');
// not in the repo: local copies of the fonts / React the canvas uses, and the Design type's runtime
// (read it from the published canvas: Artifact read, path artifact-type/dc-runtime.js)
const VENDOR = process.env.DC_VENDOR || path.join(HERE, '.vendor');
const RUNTIME = process.env.DC_RUNTIME || path.join(VENDOR, 'dc-runtime.js');
if (!fs.existsSync(RUNTIME)) { console.error('missing Design runtime: set DC_RUNTIME (see artifact/README.md)'); process.exit(2); }
const OUT = process.env.SHOT_OUT || path.join(HERE, '.shots');
fs.mkdirSync(OUT, { recursive: true });

// ---- fonts (fontsource static woff2 → @font-face with unicode-range) ----
function fontsCss(port) {
  const fam = [
    ['Bricolage Grotesque', 'fontsource-bricolage-grotesque-5.3.0', 'bricolage-grotesque', [500, 600, 700, 800]],
    ['Instrument Sans', 'fontsource-instrument-sans-5.3.0', 'instrument-sans', [400, 500, 600, 700]],
    ['IBM Plex Mono', 'fontsource-ibm-plex-mono-5.3.0', 'ibm-plex-mono', [400, 500]],
  ];
  const ranges = {
    latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
    'latin-ext': 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  };
  let css = '';
  for (const [name, dir, slug, weights] of fam) {
    for (const w of weights) for (const sub of ['latin-ext', 'latin']) {
      const f = `${slug}-${sub}-${w}-normal.woff2`;
      if (!fs.existsSync(path.join(VENDOR, dir, 'package', 'files', f))) continue;
      css += `@font-face{font-family:'${name}';font-style:normal;font-weight:${w};font-display:block;src:url(http://localhost:${port}/__fonts/${dir}/${f}) format('woff2');unicode-range:${ranges[sub]}}\n`;
    }
  }
  return css;
}

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const send = (file, type) => { try { const b = fs.readFileSync(file); res.writeHead(200, { 'content-type': type, 'access-control-allow-origin': '*' }); res.end(b); } catch (e) { res.writeHead(404); res.end('nf ' + u); } };
  if (u === '/support.js') return send(RUNTIME, 'text/javascript');
  if (u === '/__react.js') return send(path.join(VENDOR, 'react.js'), 'text/javascript');
  if (u === '/__react-dom.js') return send(path.join(VENDOR, 'react-dom.js'), 'text/javascript');
  if (u === '/__fonts.css') { res.writeHead(200, { 'content-type': 'text/css' }); return res.end(fontsCss(server.address().port)); }
  if (u.startsWith('/__fonts/')) return send(path.join(VENDOR, u.slice(9).replace(/^([^/]+)\//, '$1/package/files/')), 'font/woff2');
  if (u.endsWith('.dc.html')) return send(path.join(cfg.dir ? path.resolve(cfg.dir) : PROJECT, path.basename(u)), 'text/html; charset=utf-8');
  res.writeHead(404); res.end('nf');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({ args: cfg.webgl ? ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--hide-scrollbars'] : ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1'] });
const logs = [];
for (const job of cfg.jobs) {
  const ctx = await browser.newContext({ viewport: { width: job.w || cfg.w || 1440, height: job.h || cfg.h || 1000 }, deviceScaleFactor: job.dpr || 1, reducedMotion: job.reducedMotion ? 'reduce' : 'no-preference' });
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('http://127.0.0.1:' + port) || url.startsWith('http://localhost:' + port) || url.startsWith('data:')) return route.continue();
    if (/react\.production\.min\.js/.test(url)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(VENDOR, 'react.js')) });
    if (/react-dom\.production\.min\.js/.test(url)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(VENDOR, 'react-dom.js')) });
    if (/fonts\.googleapis\.com/.test(url)) return route.fulfill({ status: 200, contentType: 'text/css', body: fontsCss(port) });
    return route.abort();
  });
  const page = await ctx.newPage();
  const tag = job.name;
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Download the React DevTools/.test(m.text())) logs.push(`[${tag}] console.${m.type()}: ${m.text().slice(0, 300)}`); else if (m.type() === 'log' && /^HM:/.test(m.text())) logs.push(`[${tag}] ${m.text().slice(0, 600)}`); });
  page.on('pageerror', (e) => logs.push(`[${tag}] PAGEERROR: ${String(e.stack || e).slice(0, 500)}`));
  await page.addInitScript(() => { window.__HM_TEST = {}; });
  await page.goto(`http://127.0.0.1:${port}/${job.page || cfg.page || 'Main.dc.html'}`, { waitUntil: 'load' });
  try { await page.waitForFunction(() => window.__HM_TEST && window.__HM_TEST.logic, null, { timeout: 15000 }); } catch (e) { logs.push(`[${tag}] logic hook not found (runtime did not boot or no hook)`); }
  if (job.eval) { try { await page.evaluate(job.eval); } catch (e) { logs.push(`[${tag}] eval error: ${String(e).slice(0, 300)}`); } }
  await page.waitForTimeout(job.wait ?? 800);
  if (job.after) { try { const r = await page.evaluate(job.after); if (r !== undefined) logs.push(`[${tag}] after => ${JSON.stringify(r).slice(0, 800)}`); } catch (e) { logs.push(`[${tag}] after error: ${String(e).slice(0, 300)}`); } }
  const file = path.join(OUT, `${job.name}.png`);
  await page.screenshot({ path: file, fullPage: !!job.full, clip: job.clip });
  console.log('shot', file);
  await ctx.close();
}
await browser.close();
server.close();
logs.forEach((l) => console.log(l));
