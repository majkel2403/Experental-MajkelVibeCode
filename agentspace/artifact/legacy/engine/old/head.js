// ====================================================================== 3D NEURAL SPACE: scene model
const NEON = { R: '#6DB6FF', C: '#FFAE5C', Q: '#4FF0D8', D: '#D6BEFF' };
const FILE_COL = { md: '#9FE3FF', py: '#FFD98A', json: '#CDBBFF', xlsx: '#8CFFD9', zip: '#FFC2D4', pdf: '#FFA6B8' };
const DEC_COL = '#FFE9A8';
const REPORT_COL = '#FFF1C2';
const REPORT3D_AT = 50.5;
const SAMPLES = 22;
const RGBC = {};
function rgbOf(hex) {
  let c = RGBC[hex];
  if (!c) { const n = parseInt(hex.slice(1), 16); c = RGBC[hex] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  return c;
}
function rgba(hex, a) {
  const c = rgbOf(hex);
  return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a < 0 ? 0 : a > 1 ? 1 : Math.round(a * 1000) / 1000) + ')';
}
function mixHex(a, b, k) {
  const x = rgbOf(a);
  const y = rgbOf(b);
  const h = (i) => ('0' + Math.round(x[i] + (y[i] - x[i]) * k).toString(16)).slice(-2);
  return '#' + h(0) + h(1) + h(2);
}
function mulberry(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function agentAt(list, t) {
  let total = 0;
  let doneT = 0;
  let cur = null;
  list.forEach((k) => {
    total += k.to - k.from;
    if (t >= k.to) doneT += k.to - k.from;
    else if (t >= k.from) { doneT += t - k.from; cur = k; }
  });
  const last = list[list.length - 1];
  let st = 'wait';
  if (list.length && t >= last.to) st = 'done';
  else if (cur) st = cur.review ? 'review' : 'work';
  return { st, prog: total ? clamp(doneT / total, 0, 1) : 0, cur };
}

// deterministic 3D force layout so that scrubbing and replay always show the same graph
