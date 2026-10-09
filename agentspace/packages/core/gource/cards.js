// The studio layer in the scene: what belongs to a place in the world is drawn here, over the tree — the moment an
// agent creates another one (a golden thread and a ring), messages travelling between agents, new folders and
// speech / thought bubbles above the avatars. The team, the plan, the editor and the terminal are app panels (HTML,
// packages/ui), fed by app.js from the same story. Canvas 2D, screen space; positions come from the frame.
import { STORY } from './story.js';
import { TONE_COLOUR } from './actions.js';

const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const SANS = "'Inter', FreeSans, 'Helvetica Neue', Arial, sans-serif";
// the Hermes palette (night dispatch room): ink panels, hairlines, gold for Hermes and the current step
const C = { text: '#E8ECF8', mut: '#A3AED0', gold: '#F2C14E' };
const crgb = (c, a) => 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ',' + (a == null ? 1 : Math.max(0, Math.min(1, a))).toFixed(3) + ')';
const ease = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
function wrap(ctx, text, maxW, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const out = []; let cur = '';
  for (const w of words) {
    const tryS = cur ? cur + ' ' + w : w;
    if (ctx.measureText(tryS).width <= maxW || !cur) cur = tryS;
    else { out.push(cur); cur = w; if (out.length === maxLines) break; }
  }
  if (out.length < maxLines && cur) out.push(cur);
  else if (cur && out.length === maxLines) {
    let last = out[maxLines - 1];
    while (last.length > 1 && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
    out[maxLines - 1] = last + '…';
  }
  return out;
}
function fit(ctx, s, maxW) {
  s = String(s);
  if (ctx.measureText(s).width <= maxW) return s;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}

export function drawStory(ctx, S, F, W, H, o) {
  o = o || {};
  const compact = !!o.compact;
  const fs = o.fontScale || 1;
  const ins = o.inset || { l: 0, r: 0, t: 0, b: 0 };
  const users = new Map(); for (const u of F.users) users.set(u.id, u);
  const files = new Map(); for (const f of F.files) files.set(f.path, f);
  const head = (id) => { const u = users.get(id); return u ? { x: u.x, y: u.y - u.h * 0.5, u } : null; };
  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // ---- an agent creating another: a golden thread from creator to the new agent, a ring, and its role
  for (const sp of S.spawns) {
    const a = head(sp.parent); const b = head(sp.child);
    if (!a || !b) continue;
    const p = ease(sp.age / 0.9); const fade = 1 - ease((sp.age - STORY.SPAWN + 0.6) / 0.6);
    ctx.globalAlpha = fade;
    const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.25; const my = (a.y + b.y) / 2 - (b.x - a.x) * 0.25;
    ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.setLineDash([]);
    ctx.beginPath();
    for (let k = 0; k <= 24; k++) {
      const s = (k / 24) * p; const q = 1 - s;
      const x = q * q * a.x + 2 * q * s * mx + s * s * b.x; const y = q * q * a.y + 2 * q * s * my + s * s * b.y;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    if (sp.age > 0.6) {
      const r = 10 + (sp.age - 0.6) * 26;
      ctx.globalAlpha = fade * Math.max(0, 1 - (sp.age - 0.6) / 1.6);
      ctx.beginPath(); ctx.arc(b.x, b.u.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = fade;
      ctx.font = '600 ' + 12 * fs + 'px ' + MONO; ctx.fillStyle = C.gold; ctx.textAlign = 'center';
      ctx.fillText('NOWY AGENT', b.x, b.u.y + b.u.h * 0.5 + 16 * fs);
      ctx.font = 12 * fs + 'px ' + SANS; ctx.fillStyle = C.text;
      if (sp.role && !compact) ctx.fillText(fit(ctx, sp.role, 220), b.x, b.u.y + b.u.h * 0.5 + 31 * fs);
    }
  }
  ctx.globalAlpha = 1; ctx.textAlign = 'left';

  // ---- messages in flight
  for (const m of S.packets) {
    const a = head(m.from); const b = head(m.to);
    if (!a || !b) continue;
    const col = TONE_COLOUR[m.tone] || [0.9, 0.92, 1];
    const p = ease(m.age / STORY.PACKET);
    const mx = (a.x + b.x) / 2 - (b.y - a.y) * 0.18; const my = (a.y + b.y) / 2 + (b.x - a.x) * 0.18 - 18;
    const at = (s) => { const q = 1 - s; return [q * q * a.x + 2 * q * s * mx + s * s * b.x, q * q * a.y + 2 * q * s * my + s * s * b.y]; };
    ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]);
    ctx.strokeStyle = crgb(col, 0.35);
    ctx.beginPath(); for (let k = 0; k <= 20; k++) { const [x, y] = at(k / 20); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke();
    ctx.setLineDash([]);
    const [x, y] = at(p);
    ctx.fillStyle = crgb(col, 1);
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = crgb(col, 0.25);
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
    if (m.task) {
      ctx.font = '600 ' + 12 * fs + 'px ' + MONO;
      const label = 'ZADANIE'; const w = ctx.measureText(label).width + 12;
      ctx.fillStyle = C.gold; rrect(ctx, x + 8, y - 22, w, 18, 4); ctx.fill();
      ctx.fillStyle = '#1A1300'; ctx.fillText(label, x + 14, y - 9);
    }
  }

  // ---- new folders
  for (const g of S.tags) {
    const f = files.get(g.path);
    if (!f) continue;
    ctx.globalAlpha = 1 - ease((g.age - STORY.TAG + 0.7) / 0.7);
    ctx.font = '600 ' + 12 * fs + 'px ' + MONO;
    const w = ctx.measureText(g.text).width + 12;
    ctx.fillStyle = 'rgba(80,220,140,0.9)'; rrect(ctx, f.x + 10, f.y + 8, w, 19, 5); ctx.fill();
    ctx.fillStyle = '#062012'; ctx.fillText(g.text, f.x + 16, f.y + 22);
    ctx.globalAlpha = 1;
  }

  // ---- bubbles last, above everything in the scene
  bubbles(ctx, S, users, ins, W, H, fs, compact);
  ctx.restore();
}

// speech (solid) and thought (dashed) bubbles above avatars; text appears as it is "said"
function bubbles(ctx, S, users, ins, W, H, fs, compact) {
  const placed = [];
  const maxW = (compact ? 170 : 240) * fs;
  const L = ins.l + 8; const R = W - ins.r - 8; const Tp = ins.t + 8;
  const list = S.bubbles.slice().sort((a, b) => a.age - b.age).slice(0, compact ? 2 : 4);
  for (const b of list) {
    const u = users.get(b.who);
    if (!u) continue;
    ctx.font = (b.kind === 'think' ? 'italic ' : '') + 13 * fs + 'px ' + SANS;
    const lines = wrap(ctx, b.text.slice(0, b.shown) || ' ', maxW - 20, compact ? 3 : 4);
    const to = b.kind === 'say' && b.to && users.get(b.to) ? users.get(b.to).label : b.to === 'user' ? 'Użytkownik' : '';
    const headTxt = b.kind === 'think' ? 'myśli' : b.tone === 'assign' ? 'zleca → ' + to : to ? '→ ' + to : '';
    const tw = Math.max(...lines.map((l) => ctx.measureText(l).width), 60);
    const w = Math.min(maxW, tw + 20); const h = 14 * fs + lines.length * 17 * fs + (headTxt ? 15 * fs : 0);
    let x = Math.max(L, Math.min(R - w, u.x - w / 2));
    let y = u.y - u.h * 0.5 - 30 * fs - h;
    for (const p of placed) if (x < p.x + p.w && x + w > p.x && y < p.y + p.h + 6 && y + h > p.y) y = p.y - h - 8;
    y = Math.max(Tp, y);
    placed.push({ x, y, w, h });
    const c = u.ucol || [1, 1, 1];
    ctx.globalAlpha = b.a;
    rrect(ctx, x, y, w, h, 8);
    ctx.fillStyle = b.kind === 'think' ? 'rgba(14,16,28,0.82)' : 'rgba(16,20,34,0.94)'; ctx.fill();
    ctx.strokeStyle = b.tone === 'assign' ? C.gold : crgb(c, 0.8); ctx.lineWidth = 1.2;
    if (b.kind === 'think') ctx.setLineDash([3, 3]);
    ctx.stroke(); ctx.setLineDash([]);
    // tail
    const tx = Math.max(x + 10, Math.min(x + w - 10, u.x));
    ctx.fillStyle = b.kind === 'think' ? 'rgba(14,16,28,0.82)' : 'rgba(16,20,34,0.94)';
    ctx.beginPath(); ctx.moveTo(tx - 6, y + h - 1); ctx.lineTo(tx, y + h + 8); ctx.lineTo(tx + 6, y + h - 1); ctx.fill();
    let ty = y + 15 * fs;
    if (headTxt) { ctx.font = '600 ' + 12 * fs + 'px ' + MONO; ctx.fillStyle = b.tone === 'assign' ? C.gold : C.mut; ctx.fillText(fit(ctx, headTxt.toUpperCase(), w - 20), x + 10, ty - 2); ty += 15 * fs; }
    ctx.font = (b.kind === 'think' ? 'italic ' : '') + 13 * fs + 'px ' + SANS;
    ctx.fillStyle = b.kind === 'think' ? '#B9C2DE' : C.text;
    lines.forEach((l, i) => ctx.fillText(l, x + 10, ty + i * 17 * fs));
    ctx.globalAlpha = 1;
  }
}
