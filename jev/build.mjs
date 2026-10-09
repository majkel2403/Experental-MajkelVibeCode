#!/usr/bin/env node
// Inlines src/ into ONE self-contained html file.  usage: node jev/build.mjs [--out path/to/file.html]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => path.join(root, 'src', ...p);
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('out', path.join(root, 'dist', 'jev.html')));
const ls = (dir, ext) => (fs.existsSync(src(dir)) ? fs.readdirSync(src(dir)).filter((f) => f.endsWith(ext)).sort() : []);
const read = (...p) => fs.readFileSync(src(...p), 'utf8');

const css = ['base.css', ...ls('css', '.css').filter((f) => f !== 'base.css')].map((f) => `/* ---- ${f} ---- */\n` + read('css', f)).join('\n');
const html = ls('html', '.html').map((f) => `<!-- ${f} -->\n` + read('html', f)).join('\n');
const jsOrder = ['engine.js', 'core.js', ...ls('js', '.js').filter((f) => !['engine.js', 'core.js', 'main.js'].includes(f)), 'main.js'];
const js = jsOrder.filter((f) => fs.existsSync(src('js', f)))
  .map((f) => `<script>/* ---- ${f} ---- */\n${read('js', f).replace(/<\/script/gi, '<\\/script')}\n</script>`).join('\n');

const page = read('shell.html').replace('/*@css*/', () => css).replace('<!--@html-->', () => html).replace('<!--@js-->', () => js);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, page);
console.log(`built ${path.relative(process.cwd(), out)}  ${(page.length / 1024).toFixed(1)} KB  (${ls('html', '.html').length} html · ${ls('css', '.css').length} css · ${jsOrder.length} js)`);
