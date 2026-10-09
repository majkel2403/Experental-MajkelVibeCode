// Canvas 2D fallback for a Gource frame (same order as the WebGL backend; bloom with 'lighter').
import { makeTextures } from './gl.js';

export function createC2D(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  let tex = null;
  try {
    if (typeof OffscreenCanvas === 'function') {
      const T = makeTextures();
      tex = {};
      for (const k of ['file', 'user']) {
        const c = new OffscreenCanvas(T[k].w, T[k].h);
        c.getContext('2d').putImageData(new ImageData(T[k].px, T[k].w, T[k].h), 0, 0);
        tex[k] = c;
      }
    }
  } catch (e) { tex = null; }
  // tinted sprites are cached per colour (rounded) so files and users keep Gource's shading
  const tints = new Map();
  const tinted = (reg, r, g, b) => {
    const key = reg + ':' + Math.round(r * 20) + ',' + Math.round(g * 20) + ',' + Math.round(b * 20);
    let c = tints.get(key);
    if (c || !tex) return c || null;
    const src = tex[reg];
    c = new OffscreenCanvas(src.width, src.height);
    const t = c.getContext('2d');
    t.drawImage(src, 0, 0);
    t.globalCompositeOperation = 'multiply';
    t.fillStyle = 'rgb(' + Math.round(r * 255) + ',' + Math.round(g * 255) + ',' + Math.round(b * 255) + ')';
    t.fillRect(0, 0, src.width, src.height);
    t.globalCompositeOperation = 'destination-in';
    t.drawImage(src, 0, 0);
    if (tints.size > 400) tints.clear();
    tints.set(key, c);
    return c;
  };
  const rgba = (c, a) => 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
  const sprite = (reg, x, y, w, h, col, a) => {
    const img = tinted(reg, col[0], col[1], col[2]);
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    if (img) ctx.drawImage(img, x, y, w, h);
    else { ctx.fillStyle = rgba(col, 1); ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  };

  function draw(F, W, H, dpr, bg) {
    const cw = Math.round(W * dpr); const ch = Math.round(H * dpr);
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    try { ctx.imageSmoothingQuality = 'high'; } catch (e) { /* optional */ }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = rgba(bg, 1);
    ctx.fillRect(0, 0, W, H);
    ctx.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      for (const e of F.edges) {
        for (let i = 0; i + 6 < e.length; i += 6) {
          const o = pass === 0 ? 2 : 0;
          ctx.strokeStyle = pass === 0 ? rgba([0, 0, 0], e[i + 5] * 0.25) : rgba([e[i + 2], e[i + 3], e[i + 4]], e[i + 5] * 0.6);
          ctx.lineWidth = 2.6;
          ctx.beginPath(); ctx.moveTo(e[i] + o, e[i + 1] + o); ctx.lineTo(e[i + 6] + o, e[i + 7] + o); ctx.stroke();
        }
      }
    }
    for (const f of F.files) sprite('file', f.x - f.size / 2 + f.shadow, f.y - f.size / 2 + f.shadow, f.size, f.size, [0, 0, 0], f.a * 0.5);
    for (const b of F.beams) {
      const q = b.q;
      const g = ctx.createLinearGradient((q[0] + q[2]) / 2, (q[1] + q[3]) / 2, (q[4] + q[6]) / 2, (q[5] + q[7]) / 2);
      g.addColorStop(0, rgba(b.col, 0));
      g.addColorStop(0.5, rgba(b.col, b.a * 0.55));
      g.addColorStop(1, rgba(b.col, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(q[2], q[3]); ctx.lineTo(q[4], q[5]); ctx.lineTo(q[6], q[7]); ctx.closePath(); ctx.fill();
    }
    for (const f of F.files) sprite('file', f.x - f.size / 2, f.y - f.size / 2, f.size, f.size, f.col, f.a);
    for (const u of F.users) sprite('user', u.x - u.w / 2 + u.shadow, u.y - u.h / 2 + u.shadow, u.w, u.h, [0, 0, 0], u.a * 0.5);
    for (const u of F.users) sprite('user', u.x - u.w / 2, u.y - u.h / 2, u.w, u.h, u.col, u.a);
    ctx.globalCompositeOperation = 'lighter';
    for (const b of F.blooms) {
      const r = b.R * 0.785;
      if (!(r > 0.5)) continue;
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
      g.addColorStop(0, rgba(b.col, 0.5));
      g.addColorStop(0.55, rgba(b.col, 0.22));
      g.addColorStop(1, rgba(b.col, 0));
      ctx.fillStyle = g;
      ctx.fillRect(b.x - r, b.y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  return { kind: 'canvas2d', draw };
}
