#!/usr/bin/env node
// merge-modules.mjs — copy the @@MODULE blocks produced by the module agents (tmp/gx/<key>/project/Main.dc.html)
// into tools/engine/render.js (source of truth), then rebuild with build-engine.mjs.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIR = process.env.GX || 'tmp/gx';
const MAP = process.env.GX === 'tmp/gx2' ? { core: ['GALAXY', 'NEURONS', 'FX'], net: ['ORBITS', 'SYNAPSES', 'FLOWS', 'LABELS'] } : { env: ['GALAXY', 'ORBITS'], net: ['SYNAPSES', 'FLOWS'], nodes: ['NEURONS'], fx: ['FX'] };
const only = process.argv.slice(2);
let render = fs.readFileSync(path.join(ROOT, 'tools/engine/render.js'), 'utf8');
const block = (src, name) => {
  const a = src.indexOf('// @@MODULE:' + name + '-BEGIN');
  const b = src.indexOf('// @@MODULE:' + name + '-END');
  if (a < 0 || b < 0) throw new Error('block ' + name + ' missing');
  return [a, b + ('// @@MODULE:' + name + '-END').length];
};
for (const [key, names] of Object.entries(MAP)) {
  if (only.length && !only.includes(key)) continue;
  const src = fs.readFileSync(path.join(ROOT, DIR, key, 'project/Main.dc.html'), 'utf8');
  for (const name of names) {
    const [sa, sb] = block(src, name);
    const [ra, rb] = block(render, name);
    render = render.slice(0, ra) + src.slice(sa, sb) + render.slice(rb);
    console.log('merged', key, name, sb - sa, 'bytes');
  }
}
fs.writeFileSync(path.join(ROOT, 'tools/engine/render.js'), render);
