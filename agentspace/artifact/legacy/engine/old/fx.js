  // ---------- arrival bursts, speech rings ----------
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < m.ev.length; i++) {
    const ev = m.ev[i];
    if (ev.t > t) break;
    const age = t - ev.t;
    if (age > FLIGHT + 1.2) continue;
    const col = pulseColor(ev, nodes);
    const sv = PV[ev.from];
    if (sv && age < 0.9) {
      const rr = sv.n.r * sv.k * sv.s * (1.7 + 2.4 * (age / 0.9));
      ctx.strokeStyle = rgba(col, (1 - age / 0.9) * 0.5);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(sv.x, sv.y, rr, 0, 6.2832); ctx.stroke();
    }
    const aa = age - FLIGHT;
    const tv = ev.to >= 0 ? PV[ev.to] : null;
    if (tv && aa >= 0 && aa < 1.1 && !rm) {
      const rr = tv.n.r * tv.k * tv.s * (1.5 + 3.4 * (aa / 1.1));
      ctx.strokeStyle = rgba(col, (1 - aa / 1.1) * 0.7);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(tv.x, tv.y, rr, 0, 6.2832); ctx.stroke();
      if (q >= 1) {
        for (let b = 0; b < (q >= 2 ? 10 : 5); b++) {
          const sp = aa * 46 + 3;
          const p = proj(tv.wx + ev.burst[b * 3] * sp, tv.wy + ev.burst[b * 3 + 1] * sp, tv.wz + ev.burst[b * 3 + 2] * sp);
          glow(ctx, p[0], p[1], 3.2 * p[2] / kref, col, (1 - aa / 1.1) * 0.85);
        }
      }
    }
  }
  if (t > 56 && t < 59.5 && PV[0]) {
    const wv = (t - 56) / 3.5;
    ctx.strokeStyle = rgba(GOLD, (1 - wv) * 0.6);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(PV[0].x, PV[0].y, wv * Math.max(W, H) * 0.7, 0, 6.2832); ctx.stroke();
  }

