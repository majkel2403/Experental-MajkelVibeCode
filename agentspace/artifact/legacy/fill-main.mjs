#!/usr/bin/env node
// fill-main.mjs <Main.dc.html> <scenarios-dir> <out-dir>
// Replaces /*@@SCENARIOS@@*/[] with the JSON scenarios found in <scenarios-dir>/*.json (ordered by order.json if present),
// writes <out-dir>/Main.filled.dc.html and <out-dir>/states.json (probe states that open every sc-if branch).
import fs from 'node:fs';
import path from 'node:path';

const [mainPath, dir, out] = process.argv.slice(2);
if (!mainPath || !dir || !out) { console.error('usage: fill-main.mjs <Main.dc.html> <scenarios-dir> <out-dir>'); process.exit(2); }
let text = fs.readFileSync(mainPath, 'utf8');
let files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'order.json');
if (fs.existsSync(path.join(dir, 'order.json'))) {
  const order = JSON.parse(fs.readFileSync(path.join(dir, 'order.json'), 'utf8'));
  files = order.map((id) => id + '.json').filter((f) => files.includes(f));
}
const scen = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
if (text.includes('/*@@SCENARIOS@@*/[]')) text = text.replace('/*@@SCENARIOS@@*/[]', () => JSON.stringify(scen));
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'Main.filled.dc.html'), text);

const times = [0, 0.5, 1, 2, 3.5, 5, 6.2, 7, 8, 10, 12.5, 14, 15, 18, 24, 30, 36, 42, 48, 50.5, 51.4, 52.5, 54, 56, 58.5, 60];
const probes = [];
for (const sc of scen) {
  for (const t of times) probes.push({ sid: sc.id, t, sel: 'hermes', playing: t > 0 && t < 60, started: true, reportClosed: false, note: t === 0 ? 'Dopasowano najbliższy scenariusz wzorcowy: test.' : '', toast: t === 58.5 ? 'Raport zapisany' : '' });
  for (const a of sc.agents) for (const t of [3, 9, 20, 36, 44, 49, 55]) probes.push({ sid: sc.id, t, sel: a.id, playing: false, started: false, reportClosed: t === 55 });
  probes.push({ sid: sc.id, t: 56, sel: 'hermes', playing: false, started: true, reportClosed: true });
}
fs.writeFileSync(path.join(out, 'states.json'), JSON.stringify(probes));
console.log('filled ' + scen.length + ' scenarios, ' + probes.length + ' probe states -> ' + out);
