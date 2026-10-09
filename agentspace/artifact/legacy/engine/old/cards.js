  // ---------- conversation cards (docked at the bottom of the free area, wired to the speaker) ----------
  const cardList = [];
  for (let i = m.ev.length - 1; S.cards !== false && i >= 0 && cardList.length < 2; i--) {
    const ev = m.ev[i];
    if (ev.t > t) continue;
    if (t - ev.t > 4.6) break;
    if (PV[ev.from]) cardList.push(ev);
  }
  cardList.reverse();
  const cw2 = Math.min(262, Math.max(180, (sf.r - sf.l - 24) / (cardList.length > 1 ? 2 : 1) - 6));
  for (let ci = 0; ci < cardList.length; ci++) {
    const ev = cardList[ci];
    const sv = PV[ev.from];
    const age = t - ev.t;
    const al = clamp(age / 0.3, 0, 1) * clamp((4.6 - age) / 0.9, 0, 1);
    const col = pulseColor(ev, nodes);
    ctx.font = "500 12.5px 'Instrument Sans', 'Segoe UI', system-ui, sans-serif";
    const lines = wrapText(ctx, ev.text, cw2 - 26, 3);
    const h = lines.length * 16 + 32;
    const total = cardList.length * cw2 + (cardList.length - 1) * 8;
    const bx = (sf.l + sf.r) / 2 - total / 2 + ci * (cw2 + 8);
    const by = sf.b - h - 4;
    ctx.globalAlpha = al * 0.8;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(col, 0.8);
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(bx + cw2 / 2, by); ctx.lineTo(sv.x, sv.y + Math.max(8, sv.n.r * sv.k * 1.5)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = al;
    rrect(ctx, bx, by, cw2, h, 10);
    ctx.fillStyle = 'rgba(7,11,28,0.88)';
    ctx.fill();
    ctx.strokeStyle = rgba(col, 0.7);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = "500 10.5px 'IBM Plex Mono', ui-monospace, monospace";
    ctx.fillStyle = col;
    const tag = (KIND[ev.kind] ? KIND[ev.kind].label : ev.kind).toUpperCase() + '  ' + nodes[ev.from].label + ' > ' + (ev.to >= 0 ? nodes[ev.to].label : 'Ty');
    ctx.fillText(tag, bx + 12, by + 15);
    ctx.font = "500 12.5px 'Instrument Sans', 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = '#E8ECF8';
    for (let l = 0; l < lines.length; l++) ctx.fillText(lines[l], bx + 12, by + 33 + l * 16);
    ctx.globalAlpha = 1;
  }

