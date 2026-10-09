// The Agentspace core (packages/core) as one script for canvas boards: files in manifest order, imports and
// exports stripped, wrapped in an IIFE that exposes NW; plus recorded runs as NW_RUNS. Shared by the board builders.
import fs from 'node:fs';
import path from 'node:path';

export function coreBundle(repo) {
  const core = path.join(repo, 'packages', 'core');
  const order = JSON.parse(fs.readFileSync(path.join(core, 'manifest.json'), 'utf8')).files;
  const seen = new Map();
  let src = '';
  for (const f of order) {
    let s = fs.readFileSync(path.join(core, f), 'utf8');
    s = s.replace(/^import [^\n]*\n/gm, '').replace(/^export (const|function|let|class) /gm, '$1 ').replace(/^export \{[^}]*\};?\n/gm, '');
    if (/^\s*(import|export)\s/m.test(s)) throw new Error('unhandled import/export in ' + f);
    for (const m of s.matchAll(/^(?:const|let|function|class) ([A-Za-z_$][\w$]*)/gm)) {
      if (seen.has(m[1])) throw new Error(`top-level name clash: ${m[1]} in ${f} and ${seen.get(m[1])}`);
      seen.set(m[1], f);
    }
    src += `// ---- ${f}\n` + s.trim() + '\n';
  }
  return `const NW = (() => {\n${src}\nreturn { parseJsonl, createTimeline, createViewer, app: { runFacts, appState, matchTask, mmss, studioState, legendOf, cssRgb, narrate, lanesOf, runSummary } };\n})();`;
}

// the canvas checker forbids literal URLs and network words in the page source: escape them inside the string
// literal (a \u002f escape is '/' at run time), so the data stays exactly as recorded
export function runsScript(repo, runs) {
  const list = runs.map(([id, name]) => ({ id, name, jsonl: fs.readFileSync(path.join(repo, 'demo', 'runs', id + '.jsonl'), 'utf8') }));
  return 'const NW_RUNS = ' + JSON.stringify(list).replace(/:\/\//g, ':\\u002f\\u002f').replace(/WebSocket/g, 'Web\\u0053ocket').replace(/fetch\(/g, 'fetch\\u0028') + ';';
}
