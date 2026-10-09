/* Pojedynczy pomiar sceny na świeżej przeglądarce → JSON na stdout (używane przez ab.js, można też ręcznie).
   node tools/perf/measure.js --scene idle|hud|work|drag --fx off|tool|standard|cinema --ms 5000 --size 1600x900 [--instr] [--url http://…] */
'use strict';
const L = require('./lib.js');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
(async () => {
  const [width, height] = String(arg('size', '1600x900')).split('x').map(Number);
  const r = await L.measureScene({ scene: arg('scene', 'idle'), fx: arg('fx', 'cinema'), ms: +arg('ms', 5000), width, height, instr: !!arg('instr', false), url: arg('url', undefined) });
  process.stdout.write('@@JSON@@' + JSON.stringify(r) + '\n');
})().catch(e => { console.error(e); process.exit(1); });
