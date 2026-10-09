// Text over the scene, as Gource draws it: directory, file and user names with a drop shadow, the date at the
// top centre (16 px), the file extension key on the left (gradient bars), plus our caption at the bottom.
export const FONT_FACE = "FreeSans, 'Liberation Sans', 'Helvetica Neue', Helvetica, sans-serif";

export const FONT = FONT_FACE;

const DAYS = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const p2 = (n) => String(n).padStart(2, '0');
// Gource's "%A, %d %B, %Y %X" in Polish
export function formatDate(ms) {
  const d = new Date(ms);
  return DAYS[d.getDay()] + ', ' + p2(d.getDate()) + ' ' + MONTHS[d.getMonth()] + ', ' + d.getFullYear() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds());
}

const rgb = (c, a) => 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ',' + a.toFixed(3) + ')';

export function drawText(ctx, F, W, H, dpr, o) {
  o = o || {};
  const FONT = o.font || FONT_FACE;
  const fs = o.fontScale || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const shadowText = (text, x, y, a, col) => {
    ctx.fillStyle = 'rgba(0,0,0,' + (0.7 * a).toFixed(3) + ')';
    ctx.fillText(text, x + 1, y + 1);
    ctx.fillStyle = rgb(col || [1, 1, 1], a);
    ctx.fillText(text, x, y);
  };
  ctx.textBaseline = 'top';
  // names (directory names, then users, then files; selections on top)
  const order = { dir: 0, file: 1, tool: 2, 'tool-fail': 2, user: 3, 'file-sel': 4, 'user-sel': 4 };
  const labels = F.labels.slice().sort((a, b) => order[a.kind] - order[b.kind]);
  // Gource's fonts put the baseline ceil(ascender + descender) below the drawing point (10 px at 14 px, 13 at 18)
  const base = (px) => Math.ceil(px * 0.7);
  ctx.textBaseline = 'alphabetic';
  for (const l of labels) {
    const a = Math.max(0, Math.min(1, l.a));
    if (a < 0.01) continue;
    if (l.kind === 'dir') { ctx.font = 14 * fs + 'px ' + FONT; ctx.textAlign = 'left'; shadowText(l.text, l.x, l.y + base(14 * fs), a); }
    else if (l.kind === 'file' || l.kind === 'file-sel') {
      const sel = l.kind === 'file-sel'; const px = (sel ? 18 : 14) * fs;
      ctx.font = px + 'px ' + FONT; ctx.textAlign = 'left';
      shadowText(l.text, l.x, l.y + base(px), a, sel ? [1, 1, 0.3] : null);
    } else if (l.kind === 'user' || l.kind === 'user-sel') {
      // users: baseline one line height above the top of the avatar
      const sel = l.kind === 'user-sel'; const px = (sel ? 18 : 14) * fs;
      ctx.font = px + 'px ' + FONT; ctx.textAlign = 'center';
      shadowText(l.text, l.x, l.y - Math.ceil(px * 1.05), a, sel ? [1, 1, 0.3] : null);
    } else {
      ctx.font = 12 * fs + 'px ' + FONT; ctx.textAlign = 'center';
      shadowText(l.text, l.x, l.y + base(12 * fs), a * 0.9, l.kind === 'tool-fail' ? [1, 0.45, 0.45] : [0.78, 0.86, 1]);
    }
  }
  ctx.textAlign = 'left';
  // date
  if (o.date) {
    ctx.font = 16 * fs + 'px ' + FONT;
    ctx.textAlign = 'center';
    shadowText(o.date, W / 2, (o.dateY != null ? o.dateY : 20) + base(16 * fs) - 8 * fs, 1);
    ctx.textAlign = 'left';
  }
  // file extension key: Gource's FileKeyEntry (shadow, gradient bar colour·0.5 → colour, extension, count)
  if (o.key !== false && F.key.length) {
    const rowH = 16 * fs + 6; const w = 90 * fs; const h = 16 * fs + 4; const margin = 16 * fs + 4;
    const kx = o.keyX != null ? o.keyX : 0; const ky = o.keyY != null ? o.keyY : 0;
    let maxRow = Math.max(1, Math.min(Math.floor((H - 150) / 20), Math.floor(((o.keyBottom != null ? o.keyBottom : H) - ky) / rowH) - 1));
    if (o.keyMax) maxRow = Math.min(maxRow, o.keyMax);
    ctx.font = 16 * fs + 'px ' + FONT;
    ctx.textAlign = 'left';
    for (const k of F.key) {
      if (k.row > maxRow + 0.5) continue;
      const a = k.alpha;
      const x0 = kx + a * margin; const y = ky + k.row * rowH;
      ctx.fillStyle = 'rgba(0,0,0,' + (0.333 * a).toFixed(3) + ')';
      ctx.fillRect(x0 + 3, y + 3, w, h);
      const g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
      g.addColorStop(0, rgb([k.col[0] * 0.5, k.col[1] * 0.5, k.col[2] * 0.5], a));
      g.addColorStop(1, rgb(k.col, a));
      ctx.fillStyle = g;
      ctx.fillRect(x0, y, w, h);
      let label = k.ext;
      while (label.length > 1 && ctx.measureText(label).width > w - 15 * fs) label = label.slice(0, -1);
      if (label !== k.ext) label += '...';
      ctx.fillStyle = rgb([1, 1, 1], a);
      ctx.fillText(label, x0 + 2, y + 3 + base(16 * fs));
      shadowText(String(k.n), x0 + w + 4, y + 3 + base(16 * fs), a);
    }
  }
  // caption: what the latest event says (our addition, bottom centre like Gource's captions)
  if (o.caption) {
    ctx.font = 14 * fs + 'px ' + FONT;
    ctx.textAlign = 'center';
    let text = o.caption;
    const maxW = W - 40;
    while (ctx.measureText(text).width > maxW && text.length > 4) text = text.slice(0, -2);
    if (text !== o.caption) text = text.slice(0, -1) + '…';
    shadowText(text, W / 2, H - (o.captionBottom || 34) + base(14 * fs), 0.95, o.captionColor || [1, 1, 1]);
    ctx.textAlign = 'left';
  }
}
