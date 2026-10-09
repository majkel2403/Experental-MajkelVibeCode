  // ---------- labels ----------
  ctx.globalCompositeOperation = 'source-over';
  labels.sort((a, b) => b.pr - a.pr);
  const placed = [];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let li = 0; li < labels.length; li++) {
    const lb = labels[li];
    const v = lb.v;
    const fs = clamp(12.5 * clamp(v.k / kref, 0.8, 1.25), 11, 15);
    ctx.font = "600 " + fs + "px 'Instrument Sans', 'Segoe UI', system-ui, sans-serif";
    const isAgent = v.n.kind === 'agent';
    const tw = ctx.measureText(lb.text).width + (isAgent ? 20 : 0);
    const lx = v.x;
    const ly = v.y + lb.dy;
    const box = { x1: lx - tw / 2 - 3, x2: lx + tw / 2 + 3, y1: ly - fs * 0.7, y2: ly + fs * 0.7 };
    let hit = false;
    for (let k = 0; k < placed.length; k++) { const b = placed[k]; if (box.x1 < b.x2 && b.x1 < box.x2 && box.y1 < b.y2 && b.y1 < box.y2) { hit = true; break; } }
    if (hit && lb.pr < 8) continue;
    placed.push(box);
    ctx.shadowColor = 'rgba(2,4,14,0.95)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = v.n.kind === 'file' ? v.n.color : v.n.kind === 'decision' ? DEC_COL : '#EAF0FF';
    if (isAgent) {
      const tx0 = lx - tw / 2 + 20;
      ctx.textAlign = 'left';
      ctx.fillText(lb.text, tx0, ly);
      ctx.fillText(lb.text, tx0, ly);
      ctx.shadowBlur = 0;
      ctx.fillStyle = v.n.color;
      ctx.beginPath(); ctx.arc(lx - tw / 2 + 7, ly, 7, 0, 6.2832); ctx.fill();
      ctx.fillStyle = '#0B1020';
      ctx.font = "500 9.5px 'IBM Plex Mono', ui-monospace, monospace";
      ctx.textAlign = 'center';
      ctx.fillText(v.n.line, lx - tw / 2 + 7, ly + 0.5);
    } else {
      ctx.textAlign = 'center';
      ctx.fillText(lb.text, lx, ly);
      ctx.fillText(lb.text, lx, ly);
    }
    ctx.shadowBlur = 0;
  }
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.textAlign = 'left';

