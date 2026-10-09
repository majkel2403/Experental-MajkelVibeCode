  // ---------- neurons ----------
  const vn = [];
  const PV = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (t < n.spawn) continue;
    nodePos(m, n, t, TMP3);
    const p = proj(TMP3[0], TMP3[1], TMP3[2]);
    const v = { n, x: p[0], y: p[1], k: p[2], z: p[3], s: Math.max(0.01, easeOutBack(clamp((t - n.spawn) / 0.8, 0, 1))), wx: TMP3[0], wy: TMP3[1], wz: TMP3[2] };
    PV[n.i] = v;
    vn.push(v);
  }
  m.stats.nodes = vn.length;
  vn.sort((a, b) => b.z - a.z);
  const labels = [];
  for (let vi = 0; vi < vn.length; vi++) {
    const v = vn[vi];
    const n = v.n;
    const x = v.x;
    const y = v.y;
    const r = n.r * v.k * v.s;
    const fog = clamp(1.05 - ((v.z - (dist - 120)) / 240) * 0.6, 0.4, 1);
    const col = n.color;
    const sel = S.sel === n.id;
    const hov = S.hover === n.id;
    picks.push({ id: n.id, x: x, y: y, r: Math.max(r * 1.8, 12), z: v.z });
    // dendrites
    if (q >= 1 && n.dend.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (let d = 0; d < n.dend.length; d++) {
        const dd = n.dend[d];
        ctx.strokeStyle = rgba(col, 0.32 * fog * v.s);
        ctx.lineWidth = Math.max(0.8, v.k * 0.55);
        ctx.beginPath();
        for (let s = 0; s < 4; s++) {
          const p = proj(v.wx + dd.pts[s * 3], v.wy + dd.pts[s * 3 + 1], v.wz + dd.pts[s * 3 + 2]);
          if (s === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
          if (s === 3) glow(ctx, p[0], p[1], 3.4 + 2.2 * (rm ? 0.5 : 0.5 + 0.5 * Math.sin(fx * 2.6 + dd.ph)), col, 0.75 * fog * v.s);
        }
        ctx.stroke();
      }
    }
    if (n.kind === 'agent') {
      const as = agentAt(m.base.tasks[n.id] || [], t);
      const act = as.st === 'work' || as.st === 'review';
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, x, y, r * 3.5, col, (as.st === 'wait' ? 0.14 : 0.3 + (act ? 0.16 * (rm ? 0.5 : 0.5 + 0.5 * Math.sin(fx * 3 + n.i)) : 0)) * fog);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = fog * (as.st === 'wait' ? 0.72 : 1);
      const gb = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.08, x, y, r * 1.03);
      gb.addColorStop(0, rgba(n.light, 1));
      gb.addColorStop(0.5, rgba(col, 0.96));
      gb.addColorStop(1, 'rgba(10,16,48,1)');
      ctx.fillStyle = gb;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(col, 0.85 * fog);
      ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(x, y, r * 1.02, 0, 6.2832); ctx.stroke();
      glow(ctx, x - r * 0.34, y - r * 0.4, r * 0.55, '#FFFFFF', 0.6 * fog);
      // progress ring
      const rr = r * 1.58;
      const lw = Math.max(1.5, r * 0.15);
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      if (as.st === 'wait') ctx.setLineDash([r * 0.4, r * 0.32]);
      ctx.strokeStyle = rgba('#8FA0D6', (as.st === 'wait' ? 0.4 : 0.2) * fog);
      ctx.beginPath(); ctx.arc(x, y, rr, 0, 6.2832); ctx.stroke();
      ctx.setLineDash([]);
      if (as.prog > 0.004) {
        if (as.st === 'review') ctx.setLineDash([0.1, r * 0.42]);
        ctx.strokeStyle = rgba(col, 0.95 * fog);
        ctx.beginPath(); ctx.arc(x, y, rr, -1.5708, -1.5708 + as.prog * 6.2832); ctx.stroke();
        ctx.setLineDash([]);
      }
      if (act && !rm) {
        const ph = (fx * 0.9 + n.i * 0.37) % 1;
        ctx.strokeStyle = rgba(col, (1 - ph) * 0.4 * fog);
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, r * (1.6 + ph * 1.0), 0, 6.2832); ctx.stroke();
      }
      if (as.st === 'done') {
        ctx.fillStyle = rgba(col, 0.95 * fog);
        ctx.beginPath(); ctx.arc(x + r * 1.18, y - r * 1.18, r * 0.5, 0, 6.2832); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = '#0B1020'; ctx.lineWidth = Math.max(1.2, r * 0.13);
        ctx.beginPath(); ctx.moveTo(x + r * 0.95, y - r * 1.18); ctx.lineTo(x + r * 1.13, y - r * 1.0); ctx.lineTo(x + r * 1.42, y - r * 1.38); ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
      }
    } else if (n.kind === 'hermes') {
      ctx.globalCompositeOperation = 'lighter';
      const br = rm ? 0.5 : 0.5 + 0.5 * Math.sin(fx * 1.4);
      glow(ctx, x, y, r * 6.5, GOLD, 0.3 + 0.1 * br);
      glow(ctx, x, y, r * 3.2, '#FFF3C4', 0.34);
      ctx.globalCompositeOperation = 'source-over';
      const gb = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.05, x, y, r * 1.05);
      gb.addColorStop(0, '#FFFFFF'); gb.addColorStop(0.35, '#FFE6A0'); gb.addColorStop(0.8, '#E0A82E'); gb.addColorStop(1, '#6B4A0C');
      ctx.fillStyle = gb;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      if (q >= 1) {
        for (let k = 0; k < 3; k++) {
          const R0 = n.r * (2.1 + k * 0.62);
          const tilt = [0.55, 1.25, -0.85][k];
          const spin = (rm ? 0 : fx) * (0.34 + k * 0.16) + k * 2;
          const ct = Math.cos(tilt);
          const st = Math.sin(tilt);
          ctx.strokeStyle = rgba(GOLD, 0.5);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          let bx = 0;
          let by = 0;
          for (let s = 0; s <= 72; s++) {
            const an = (s / 72) * 6.2832;
            const ox = Math.cos(an) * R0;
            const oz = Math.sin(an) * R0;
            const oy = oz * st;
            const oz2 = oz * ct;
            const xs = ox * Math.cos(spin) - oz2 * Math.sin(spin);
            const zs = ox * Math.sin(spin) + oz2 * Math.cos(spin);
            const p = proj(v.wx + xs, v.wy + oy, v.wz + zs);
            if (s === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
            if (s === 12) { bx = p[0]; by = p[1]; }
          }
          ctx.stroke();
          glow(ctx, bx, by, 5, '#FFF3C4', 0.8);
        }
      }
      const rays = q >= 1 ? 14 : 8;
      for (let k = 0; k < rays; k++) {
        const an = (k / rays) * 6.2832 + (rm ? 0 : fx * 0.12);
        const l1 = r * 1.5;
        const l2 = r * (2.4 + 0.9 * (rm ? 0.5 : 0.5 + 0.5 * Math.sin(fx * 2 + k * 1.3)));
        ctx.strokeStyle = rgba(GOLD, 0.24);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + Math.cos(an) * l1, y + Math.sin(an) * l1); ctx.lineTo(x + Math.cos(an) * l2, y + Math.sin(an) * l2); ctx.stroke();
      }
    } else if (n.kind === 'file') {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, x, y, r * 3.4, col, 0.3 * fog);
      diamond(ctx, x, y, Math.max(3.2, r * 1.15), col, n.light, (rm ? 0 : fx * 1.2) + n.i, fog);
      if (n.file.ver === 'final') {
        ctx.strokeStyle = rgba(col, 0.6 * fog); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, 6.2832); ctx.stroke();
      }
    } else if (n.kind === 'decision') {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, x, y, r * 4, col, 0.38 * fog);
      glow(ctx, x, y, r * 1.5, '#FFFFFF', 0.85 * fog);
      const L = r * 1.9;
      ctx.strokeStyle = rgba(col, 0.75 * fog);
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x - L, y); ctx.lineTo(x + L, y); ctx.moveTo(x, y - L); ctx.lineTo(x, y + L); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, r * 1.5, 0, 6.2832); ctx.stroke();
    } else if (n.kind === 'report') {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, x, y, r * 6, GOLD, 0.36 * v.s);
      glow(ctx, x, y, r * 3, '#FFFFFF', 0.3 * v.s);
      const spin = rm ? 0 : fx * 0.5;
      for (let k = 0; k < 6; k++) {
        const a0 = spin + (k / 6) * 6.2832;
        const a1 = spin + ((k + 1) / 6) * 6.2832;
        ctx.fillStyle = rgba(k % 2 ? '#FFF1C2' : '#FFD27A', 0.55 + 0.25 * Math.sin(a0 * 2 + 1));
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a0) * r * 1.5, y + Math.sin(a0) * r * 1.5 * 0.8); ctx.lineTo(x + Math.cos(a1) * r * 1.5, y + Math.sin(a1) * r * 1.5 * 0.8); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = rgba('#FFFFFF', 0.7); ctx.lineWidth = 1.2;
      ctx.beginPath(); for (let k = 0; k <= 6; k++) { const a0 = spin + (k / 6) * 6.2832; const px = x + Math.cos(a0) * r * 1.5; const py = y + Math.sin(a0) * r * 1.5 * 0.8; if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.stroke();
    }
    // selection / hover marks
    if (sel || hov) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = rgba('#FFFFFF', sel ? 0.85 : 0.5);
      ctx.setLineDash([5, 5]);
      ctx.lineDashOffset = rm ? 0 : -fx * 14;
      ctx.beginPath(); ctx.arc(x, y, Math.max(r * (n.kind === 'agent' ? 2.5 : 2.4), 12), 0, 6.2832); ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }
    // label candidates
    const recent = (n.kind === 'file' && t - n.spawn < 7) || (n.kind === 'decision' && t - n.spawn < 4.5);
    if (n.kind === 'agent' || n.kind === 'hermes' || n.kind === 'report' || sel || hov || recent) {
      labels.push({ v, pr: sel ? 9 : hov ? 8 : n.kind === 'hermes' ? 7 : n.kind === 'agent' ? 6 : n.kind === 'report' ? 6 : 3, text: n.label, dy: Math.max(r * (n.kind === 'agent' ? 1.58 : n.kind === 'hermes' ? 2.1 : 1.8), 8) + 14 });
    }
  }

