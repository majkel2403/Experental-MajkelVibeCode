function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function wrapText(ctx, text, maxW, maxLines) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  let cut = false;
  for (let i = 0; i < words.length; i++) {
    const test = cur ? cur + ' ' + words[i] : words[i];
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = words[i];
      if (lines.length === maxLines) { cut = true; break; }
    } else cur = test;
  }
  if (!cut && cur) lines.push(cur);
  if (cut) lines[maxLines - 1] = lines[maxLines - 1].replace(/[ ,.;:]*$/, '') + '…';
  return lines;
}
function diamond(ctx, x, y, rr, col, light, spin, fog) {
  const wv = Math.max(0.3, Math.abs(Math.cos(spin)));
  const top = y - rr;
  const bot = y + rr * 1.15;
  const lx = x - rr * 0.78 * wv;
  const rx = x + rr * 0.78 * wv;
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = fog;
  ctx.fillStyle = rgba(light, 0.96);
  ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(rx, y); ctx.lineTo(x, bot); ctx.closePath(); ctx.fill();
  ctx.fillStyle = rgba(col, 0.8);
  ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(lx, y); ctx.lineTo(x, bot); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba('#FFFFFF', 0.55 * fog);
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(rx, y); ctx.lineTo(x, bot); ctx.lineTo(lx, y); ctx.closePath(); ctx.stroke();
}
