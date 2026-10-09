/* =========================================================
   JARVIS OS — wykresy (docs/spec/09-wyglad-stany.md, 05-widgety.md §3.3)
   J.chart(canvas, points, opts): linia, obszar, słupki; osie z min/max i etykietami X.
   points: [liczba, …] albo [{x, y}, …]. Bez bibliotek; rysuje na <canvas> w rozdzielczości ekranu.
   Kolory z motywu (akcent); tekst osi w kolorze przygaszonym. Spark (mini wykres bez osi) = J.spark.
   ========================================================= */
'use strict';
(() => {
const norm = pts => (Array.isArray(pts) ? pts : []).map((p, i) => typeof p === 'number' ? { x: i, y: p } : p && typeof p === 'object' ? { x: p.x ?? i, y: +p.y } : null).filter(p => p && isFinite(p.y));
const fmtY = v => Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.abs(v) >= 1e4 ? Math.round(v / 1000) + 'k' : Math.abs(v) >= 100 ? Math.round(v).toString() : +v.toFixed(2) + '';
J.chart = (canvas, points, opts = {}) => {
  const pts = norm(points), kind = opts.kind || 'line';
  if (kind === 'spark') return J.spark?.(canvas, pts.map(p => p.y), opts.color || J.state.settings.accent || '#39e5ff');
  if (!canvas?.getContext) return false;
  const dpr = globalThis.devicePixelRatio || 1, w = canvas.clientWidth || canvas.width, hgt = canvas.clientHeight || canvas.height;
  if (!w || !hgt) return false;
  if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = hgt * dpr; }
  const c = canvas.getContext('2d'); if (!c) return false;
  c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, hgt);
  const color = opts.color || J.state.settings.accent || '#39e5ff', dim = 'rgba(200,220,240,.55)';
  c.font = '10px ui-monospace, monospace'; c.fillStyle = dim;
  if (!pts.length) { c.fillText('brak danych', 8, hgt / 2); return true; }
  let mn = Math.min(...pts.map(p => p.y)), mx = Math.max(...pts.map(p => p.y));
  if (kind === 'bar') mn = Math.min(0, mn);
  if (mx === mn) { mx += 1; mn -= kind === 'bar' ? 0 : 1; }
  const L = 34, R = 6, T = opts.label ? 16 : 6, B = 16, pw = w - L - R, ph = hgt - T - B;
  const X = i => L + (pts.length === 1 ? pw / 2 : i / (pts.length - 1) * pw), Y = v => T + ph - (v - mn) / (mx - mn) * ph;
  /* osie i siatka: 3 linie poziome */
  c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 1;
  [mn, (mn + mx) / 2, mx].forEach(v => { const y = Math.round(Y(v)) + .5; c.beginPath(); c.moveTo(L, y); c.lineTo(w - R, y); c.stroke(); c.fillText(fmtY(v), 2, y + 3); });
  if (opts.label) { c.fillStyle = '#cfe0f0'; c.fillText(String(opts.label).slice(0, 40), L, 11); c.fillStyle = dim; }
  /* etykiety X: pierwsza, środkowa, ostatnia (jeśli tekstowe) */
  const lab = p => typeof p.x === 'string' ? p.x.slice(0, 8) : '';
  [0, Math.floor((pts.length - 1) / 2), pts.length - 1].filter((v, i, a) => a.indexOf(v) === i).forEach(i => { const t = lab(pts[i]); if (t) { const tw = c.measureText(t).width; c.fillText(t, J.clamp(X(i) - tw / 2, L, w - R - tw), hgt - 3); } });
  if (kind === 'bar') {
    const bw = Math.max(2, pw / pts.length * .7), y0 = Y(Math.max(0, mn));
    c.fillStyle = color;
    pts.forEach((p, i) => { const cx = L + (i + .5) / pts.length * pw, y = Y(p.y); c.globalAlpha = .85; c.fillRect(cx - bw / 2, Math.min(y, y0), bw, Math.max(1, Math.abs(y0 - y))); });
    c.globalAlpha = 1; return true;
  }
  c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(X(i), Y(p.y)) : c.moveTo(X(i), Y(p.y)));
  c.strokeStyle = color; c.lineWidth = 1.8; c.shadowColor = color; c.shadowBlur = 6; c.stroke(); c.shadowBlur = 0;
  if (kind === 'area') { c.lineTo(X(pts.length - 1), T + ph); c.lineTo(X(0), T + ph); c.closePath(); const g = c.createLinearGradient(0, T, 0, T + ph); g.addColorStop(0, color + '55'); g.addColorStop(1, color + '00'); c.fillStyle = g; c.fill(); }
  const last = pts[pts.length - 1]; c.fillStyle = color; c.beginPath(); c.arc(X(pts.length - 1), Y(last.y), 2.5, 0, Math.PI * 2); c.fill();
  return true;
};
J.chart.points = norm;
})();
