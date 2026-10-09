  // ---------- synapses ----------
  const list = [];
  let edgeCount = 0;
  for (let ei = 0; ei < edges.length; ei++) {
    const e = edges[ei];
    const g = e.kind === 'author' ? ease(clamp((t - e.appear) / 1.1, 0, 1)) : clamp((t - e.appear) / 0.9, 0, 1);
    if (g <= 0) continue;
    edgeCount++;
    const upto = Math.max(2, Math.ceil(g * (e.n - 1)) + 1);
    const mid = Math.min(e.n - 1, e.n >> 1);
    for (let s = 0; s < e.n; s++) {
      const p = proj(e.pts[s * 3], e.pts[s * 3 + 1], e.pts[s * 3 + 2]);
      e.sx[s] = p[0]; e.sy[s] = p[1];
      if (s === mid) { e.zc = p[3]; e.km = p[2]; }
    }
    e.up = upto; e.g = g;
    list.push(e);
  }
  m.stats = { edges: edgeCount, nodes: 0 };
  list.sort((a, b) => b.zc - a.zc);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const at2 = [0, 0];
  for (let li = 0; li < list.length; li++) {
    const e = list[li];
    const evs = m.edgeEv[e.i];
    let gl = 0;
    let uses = 0;
    for (let k = 0; k < evs.length; k++) {
      if (evs[k].t > t) break;
      uses++;
      const age = t - evs[k].t;
      if (age < 3) gl = Math.max(gl, Math.exp(-age / 1.15));
    }
    const fogE = clamp(1.1 - ((e.zc - (dist - 120)) / 260) * 0.55, 0.4, 1);
    const a = Math.min(1, e.base * 1.5 * (0.62 + 0.38 * (1 - Math.exp(-uses * 0.55))) + gl * 0.8) * fogE;
    const ks = clamp(e.km / kref, 0.5, 2);
    ctx.beginPath();
    ctx.moveTo(e.sx[0], e.sy[0]);
    for (let s = 1; s < e.up; s++) ctx.lineTo(e.sx[s], e.sy[s]);
    if (q >= 2) { ctx.lineWidth = e.w * ks * 9; ctx.strokeStyle = rgba(e.color, a * 0.12); ctx.stroke(); }
    if (q >= 1) { ctx.lineWidth = e.w * ks * 3.6; ctx.strokeStyle = rgba(e.color, a * 0.3); ctx.stroke(); }
    const grd = ctx.createLinearGradient(e.sx[0], e.sy[0], e.sx[e.up - 1], e.sy[e.up - 1]);
    grd.addColorStop(0, rgba(e.color, a));
    grd.addColorStop(1, rgba(e.color2, a));
    ctx.lineWidth = Math.max(1, e.w * ks * 1.6);
    ctx.strokeStyle = grd;
    ctx.stroke();
    if (gl > 0.2) { ctx.lineWidth = Math.max(0.8, ks * 0.9); ctx.strokeStyle = rgba('#FFFFFF', gl * 0.6 * fogE); ctx.stroke(); }
    // twisted fibres around the trunk: a neural bundle rather than a plain wire
    if (q >= 2 && e.up > 4) {
      for (let side = -1; side <= 1; side += 2) {
        ctx.beginPath();
        for (let s = 0; s < e.up; s++) {
          const s0 = s > 0 ? s - 1 : 0;
          const s1 = s < e.up - 1 ? s + 1 : e.up - 1;
          let nx = -(e.sy[s1] - e.sy[s0]);
          let ny = e.sx[s1] - e.sx[s0];
          const nl = Math.hypot(nx, ny) || 1;
          const u = s / (e.n - 1);
          const off = side * ks * 3.4 * Math.sin(u * 3.1416) * (0.55 + 0.45 * Math.sin(u * 10 + e.i * 1.3 + (rm ? 0 : fx * 0.9)));
          const px = e.sx[s] + (nx / nl) * off;
          const py = e.sy[s] + (ny / nl) * off;
          if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.lineWidth = Math.max(0.6, ks * 0.75);
        ctx.strokeStyle = rgba(side < 0 ? e.color : e.color2, a * 0.5);
        ctx.stroke();
      }
    }
    // synaptic boutons at both ends + slow ambient impulses so the network never looks dead
    if (e.g >= 1) {
      glow(ctx, e.sx[0], e.sy[0], 5.5 * ks, e.color, 0.55 * fogE);
      glow(ctx, e.sx[e.n - 1], e.sy[e.n - 1], 5.5 * ks, e.color2, 0.55 * fogE);
    } else glow(ctx, e.sx[e.up - 1], e.sy[e.up - 1], 8 * ks, e.color2, 0.8 * fogE);
    if (q >= 1 && e.g >= 1) {
      const nm = e.kind === 'spoke' || e.kind === 'link' || e.kind === 'chat' ? 2 : 1;
      for (let k = 0; k < nm; k++) {
        const u = ((rm ? 0.37 : fx * (0.07 + (e.i % 5) * 0.012)) + e.i * 0.173 + k * 0.5) % 1;
        const ff = u * (e.n - 1);
        const i0 = Math.min(e.n - 2, Math.floor(ff));
        const kk = ff - i0;
        const mx = e.sx[i0] + (e.sx[i0 + 1] - e.sx[i0]) * kk;
        const my = e.sy[i0] + (e.sy[i0 + 1] - e.sy[i0]) * kk;
        ctx.fillStyle = rgba(e.color2, 0.2 * fogE);
        ctx.beginPath(); ctx.arc(mx, my, 4.2 * ks, 0, 6.2832); ctx.fill();
        ctx.fillStyle = rgba('#FFFFFF', 0.75 * fogE);
        ctx.beginPath(); ctx.arc(mx, my, 1.5 * ks, 0, 6.2832); ctx.fill();
      }
    }

    // action potentials travelling along the synapse
    for (let k = 0; k < evs.length; k++) {
      const ev = evs[k];
      const age = t - ev.t;
      if (age < 0 || age > FLIGHT) continue;
      const u0 = ease(clamp(age / FLIGHT, 0, 1));
      const u = Math.min(ev.dir > 0 ? u0 : 1 - u0, ev.dir > 0 ? e.g : 1);
      const td = ev.dir > 0 ? -1 : 1;
      const col = pulseColor(ev, nodes);
      let prx = 0;
      let pry = 0;
      for (let j = 0; j < 8; j++) {
        const uj = clamp(u + td * j * 0.03, 0, 1);
        const ff = uj * (e.n - 1);
        const i0 = Math.min(e.n - 2, Math.floor(ff));
        const kk = ff - i0;
        const px = e.sx[i0] + (e.sx[i0 + 1] - e.sx[i0]) * kk;
        const py = e.sy[i0] + (e.sy[i0 + 1] - e.sy[i0]) * kk;
        if (j > 0) {
          ctx.lineWidth = Math.max(0.8, (6.2 - j * 0.7) * ks);
          ctx.strokeStyle = rgba(col, (0.9 - j * 0.11) * fogE);
          ctx.beginPath(); ctx.moveTo(prx, pry); ctx.lineTo(px, py); ctx.stroke();
        } else at2[0] = px, at2[1] = py;
        prx = px; pry = py;
      }
      glow(ctx, at2[0], at2[1], 15 * ks, col, 0.85 * fogE);
      glow(ctx, at2[0], at2[1], 5 * ks, '#FFFFFF', 0.95 * fogE);
      if (ev.carry >= 0) diamond(ctx, at2[0], at2[1], Math.max(3.4, 4.6 * ks), nodes[ev.carry].color, nodes[ev.carry].light, fx * 3, fogE);
      ctx.globalCompositeOperation = 'lighter';
    }
  }

