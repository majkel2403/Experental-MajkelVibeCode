#!/usr/bin/env node
// build-app.mjs — the Hermes boards of the Design canvas (desktop Hermes.dc.html, phone HermesMobile.dc.html).
// The boards are the web app: the same template (packages/ui/hermes.markup.mjs), logic (hermes.logic.js) and style
// (hermes.css), plus the core bundle and the recorded runs. The layout picks itself from the board's width.
//   node artifact/build-app.mjs [repo root] [output dir]      (defaults: this repo, artifact/project)
import fs from 'node:fs';
import path from 'node:path';
import { coreBundle, runsScript } from './bundle-core.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = process.argv[2] || path.resolve(HERE, '..');
const { markup } = await import(path.join(REPO, 'packages/ui/hermes.markup.mjs'));
const CSS = fs.readFileSync(path.join(REPO, 'packages/ui/hermes.css'), 'utf8');
const LOGIC = fs.readFileSync(path.join(REPO, 'packages/ui/hermes.logic.js'), 'utf8');
const NW = coreBundle(REPO);
const RUNS_JS = runsScript(REPO, [
  ['repo-fix', 'Naprawa repo'],
  ['panel', 'Panel sprzedaży'],
  ['medytacja', 'Premiera aplikacji'],
  ['niemcy', 'Wejście do Niemiec'],
]);
const FONTS = '<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500..800&family=Rajdhani:wght@500;600;700&family=Inter:wght@400..700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">';

// the host of the boards: the recorded runs are inside the page
const HOST = `
const HX_HOST = {
  runs: () => NW_RUNS.map((r) => ({ id: r.id, name: r.name, meta: 'demo', live: false })),
  load: (id) => NW.parseJsonl((NW_RUNS.find((r) => r.id === id) || NW_RUNS[0]).jsonl).events,
};`;

function page(title, w, h) {
  return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<title>${title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
${FONTS}
<style>body{margin:0;background:#03050E}
${CSS}</style>
</helmet>
${markup('height:100vh')}
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":${w},"height":${h}}}'>
${NW}
${RUNS_JS}
${HOST}
${LOGIC}
</script>
</body>
</html>
`;
}

const out = process.argv[3] || path.join(HERE, 'project');
fs.writeFileSync(path.join(out, 'Hermes.dc.html'), page('Hermes', 1440, 900));
fs.writeFileSync(path.join(out, 'HermesMobile.dc.html'), page('Hermes na telefonie', 390, 844));
console.log('built Hermes.dc.html', fs.statSync(path.join(out, 'Hermes.dc.html')).size, 'HermesMobile.dc.html', fs.statSync(path.join(out, 'HermesMobile.dc.html')).size);
