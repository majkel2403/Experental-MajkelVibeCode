/* JEV trading decision engine — pure JS, no DOM. Loaded before core.js.
 * A small hand-tuned scoring head: numeric market/risk state in, typed answers out.
 * It is a DEMO heuristic (not a trained model, not financial advice); all values are simulated. */
(function (root) {
  'use strict';
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sig = (x) => 1 / (1 + Math.exp(-x));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[(Math.random() * a.length) | 0];

  const RULES = { floor: 0.85, lossCap: 2000, maxPos: 4 }; // gate floor · daily loss cap (USD) · max position (% of capital)
  const ACTIONS = ['buy', 'sell', 'hold', 'close', 'flatten'];
  const SIZES = [0.5, 1, 2, 4]; // % of capital, "how much?" buckets
  const STATE_KEYS = ['symbol', 'price', 'vwap_dist_bps', 'spread_bps', 'imbalance', 'funding_bps', 'vol_1h',
    'edge_bps', 'position_pct', 'daily_pnl', 'drawdown_pct', 'latency_ms', 'signal_age_s', 'venue', 'regime'];

  function softmax(lg, T) {
    const ks = Object.keys(lg), mx = Math.max.apply(null, ks.map((k) => lg[k]));
    const ex = ks.map((k) => Math.exp((lg[k] - mx) / T)), z = ex.reduce((a, b) => a + b, 0), p = {};
    ks.forEach((k, i) => (p[k] = ex[i] / z));
    return p;
  }
  const argmax = (p) => Object.keys(p).reduce((a, b) => (p[a] >= p[b] ? a : b));

  /* state: edge_bps, imbalance(-1..1), spread_bps, vol(annualised %), position_pct(signed), daily_pnl(USD),
   *        drawdown_pct, latency_ms, signal_age_s    opt: {floor, killed}                                      */
  function decide(s, opt) {
    opt = opt || {};
    const floor = Number.isFinite(+opt.floor) && opt.floor != null ? +opt.floor : RULES.floor, killed = !!opt.killed;
    const edge = s.edge_bps, imb = s.imbalance, spr = s.spread_bps, vol = s.vol != null ? s.vol : s.vol_1h;
    const pos = s.position_pct, dd = s.drawdown_pct, pnl = s.daily_pnl, lat = s.latency_ms, age = s.signal_age_s;
    const stale = clamp((age - 20) / 50, 0, 1);
    const room = clamp((RULES.maxPos - Math.abs(pos)) / RULES.maxPos, 0, 1);
    const cost = spr * 0.6 + 2; // fees + slippage, bps
    const net = Math.sign(edge) * Math.max(0, Math.abs(edge) - cost); // edge net of costs, sign kept
    const lossUse = clamp(-pnl / RULES.lossCap, 0, 1.5);
    const stress = Math.max(0, dd - 5) * 0.45 + Math.max(0, vol - 115) * 0.035 + Math.max(0, lossUse - 0.7) * 5;
    const opp = Math.abs(pos) > 0.2 ? 2.2 : 0; // trading against an open position is "close", not buy/sell
    const lg = {
      buy: 0.14 * net + 1.3 * imb - 1.8 * stale + 0.9 * (room - 0.4) - 0.5 * stress - (pos < -0.2 ? opp : 0),
      sell: -0.14 * net - 1.3 * imb - 1.8 * stale + 0.9 * (room - 0.4) - 0.5 * stress - (pos > 0.2 ? opp : 0),
      hold: 0.7 + 0.05 * spr + 1.7 * stale - 0.1 * Math.abs(net) - 0.9 * Math.abs(imb) - 0.4 * stress,
      close: Math.abs(pos) > 0.2 ? 0.2 * (-Math.sign(pos) * net) + 1.2 * (-Math.sign(pos) * imb) - 0.4 + 0.5 * (1 - room) - 0.2 * stress : -4,
      flatten: -2.6 + 1.0 * stress + (Math.abs(pos) > 0.2 ? 0.4 : -2),
    };
    const p = softmax(lg, 0.55), action = argmax(p), conf = p[action];

    // how much? — score bucket, never beyond the room left under the position cap
    const raw = clamp(Math.abs(net) / 32, 0, 1) * (1 - clamp(vol - 40, 0, 140) / 220) * (1 - clamp(dd / 12, 0, 0.9));
    const maxSize = Math.max(0.5, RULES.maxPos - Math.abs(pos));
    let sizeIdx = raw < 0.14 ? 0 : raw < 0.34 ? 1 : raw < 0.62 ? 2 : 3;
    while (sizeIdx > 0 && SIZES[sizeIdx] > maxSize) sizeIdx--;
    const sizeP = softmax({ s0: -Math.abs(raw - 0.07) * 9, s1: -Math.abs(raw - 0.24) * 9, s2: -Math.abs(raw - 0.48) * 9, s3: -Math.abs(raw - 0.8) * 9 }, 0.6);
    const sizes = [sizeP.s0, sizeP.s1, sizeP.s2, sizeP.s3];
    // keep the p(size) bars consistent with the answer: nothing above the chosen (room-capped) bucket, and it is the argmax
    for (let i = sizeIdx + 1; i < 4; i++) sizes[i] = 0;
    sizes[sizeIdx] = Math.max.apply(null, sizes);
    const sz = sizes.reduce((a, b) => a + b, 0); for (let i = 0; i < 4; i++) sizes[i] /= sz;

    // yes or no? — is it safe to send
    const riskOk = spr <= 8 && lat <= 300 && age <= 45 && lossUse < 0.8 && dd < 8 && vol < 160 && !killed;
    const pRisk = sig(2.4 - 0.22 * spr - 0.006 * lat - 0.04 * age - 3 * lossUse - 0.3 * dd - 0.015 * Math.max(0, vol - 90) - (killed ? 8 : 0));

    let dest, reason;
    if (action === 'hold') { dest = 'skip'; reason = 'hold'; }
    else if (killed) { dest = 'review'; reason = 'kill switch'; }
    else if (!riskOk && action !== 'flatten' && action !== 'close') { dest = 'review'; reason = 'risk flag'; }
    else if ((action === 'buy' && pos > 0 || action === 'sell' && pos < 0) && Math.abs(pos) + SIZES[sizeIdx] > RULES.maxPos + 1e-9) { dest = 'review'; reason = 'position cap'; } // adding to a book already at the cap; opposite-side orders reduce exposure
    else if (!Number.isFinite(conf) || !Number.isFinite(net)) { dest = 'review'; reason = 'bad input'; } // fail closed on NaN / Infinity
    else if (!(conf >= floor)) { dest = 'review'; reason = 'conf ' + conf.toFixed(2) + ' < ' + floor.toFixed(2); }
    else { dest = 'execute'; reason = 'ok'; }

    return { action, p, conf, sizeIdx, size: SIZES[sizeIdx], sizes, sizeRaw: raw, riskOk, pRisk, dest, reason,
      net, floor, killed, ms: +(2 + Math.random() * 3).toFixed(1) };
  }

  const ARCH = [
    { w: 3.2, name: 'trend-up', regime: 'trend', f: () => ({ edge_bps: rnd(14, 36), imbalance: rnd(0.28, 0.72), spread_bps: rnd(0.5, 3), vol: rnd(32, 80), position_pct: pick([0, 0, 0, 0.5, 1]), drawdown_pct: rnd(0, 3), daily_pnl: rnd(-300, 900), latency_ms: rnd(10, 90), signal_age_s: rnd(1, 14) }) },
    { w: 3.2, name: 'trend-dn', regime: 'trend', f: () => ({ edge_bps: -rnd(14, 36), imbalance: -rnd(0.28, 0.72), spread_bps: rnd(0.5, 3), vol: rnd(32, 80), position_pct: pick([0, 0, 0, -0.5, -1]), drawdown_pct: rnd(0, 3), daily_pnl: rnd(-300, 900), latency_ms: rnd(10, 90), signal_age_s: rnd(1, 14) }) },
    { w: 2, name: 'flat', regime: 'range', f: () => ({ edge_bps: rnd(-4, 4), imbalance: rnd(-0.15, 0.15), spread_bps: rnd(0.6, 3), vol: rnd(20, 50), position_pct: pick([0, 0, 0.5, -0.5]), drawdown_pct: rnd(0, 2), daily_pnl: rnd(-200, 400), latency_ms: rnd(10, 90), signal_age_s: rnd(1, 20) }) },
    { w: 1.3, name: 'wide', regime: 'thin book', f: () => ({ edge_bps: pick([-1, 1]) * rnd(18, 32), imbalance: pick([-1, 1]) * rnd(0.3, 0.6), spread_bps: rnd(9, 18), vol: rnd(50, 110), position_pct: 0, drawdown_pct: rnd(0, 3), daily_pnl: rnd(-300, 500), latency_ms: rnd(40, 200), signal_age_s: rnd(2, 20) }) },
    { w: 1, name: 'stale', regime: 'stale feed', f: () => ({ edge_bps: pick([-1, 1]) * rnd(10, 28), imbalance: rnd(-0.3, 0.3), spread_bps: rnd(1, 4), vol: rnd(30, 70), position_pct: 0, drawdown_pct: rnd(0, 3), daily_pnl: rnd(-200, 500), latency_ms: rnd(200, 520), signal_age_s: rnd(55, 110) }) },
    { w: 1.5, name: 'exit', regime: 'reversal', f: () => { const sgn = pick([-1, 1]); return { edge_bps: -sgn * rnd(14, 30), imbalance: -sgn * rnd(0.2, 0.55), spread_bps: rnd(0.6, 3), vol: rnd(35, 85), position_pct: sgn * rnd(1.5, 3.5), drawdown_pct: rnd(1, 4), daily_pnl: rnd(-500, 700), latency_ms: rnd(10, 90), signal_age_s: rnd(1, 14) }; } },
    { w: 0.8, name: 'stress', regime: 'stress', f: () => ({ edge_bps: rnd(-8, 8), imbalance: rnd(-0.4, 0.4), spread_bps: rnd(3, 9), vol: rnd(125, 190), position_pct: pick([-1, 1]) * rnd(1.5, 3.8), drawdown_pct: rnd(7, 12), daily_pnl: -rnd(1500, 2300), latency_ms: rnd(40, 250), signal_age_s: rnd(2, 20) }) },
    { w: 1.1, name: 'mixed', regime: 'conflict', f: () => { const sgn = pick([-1, 1]); return { edge_bps: sgn * rnd(7, 15), imbalance: -sgn * rnd(0.2, 0.5), spread_bps: rnd(1.5, 5), vol: rnd(40, 90), position_pct: 0, drawdown_pct: rnd(0, 4), daily_pnl: rnd(-300, 400), latency_ms: rnd(20, 120), signal_age_s: rnd(2, 25) }; } },
  ];
  function sampleState(priceOf) {
    const tw = ARCH.reduce((a, b) => a + b.w, 0);
    let r = Math.random() * tw, a = ARCH[0];
    for (const x of ARCH) { r -= x.w; if (r <= 0) { a = x; break; } }
    const s = a.f();
    s.vwap_dist_bps = s.edge_bps * 0.35 + rnd(-6, 6);
    s.funding_bps = rnd(-2.5, 4.5);
    s.regime = a.regime;
    s.symbol = pick(['BTC-PERP', 'BTC-PERP', 'ETH-PERP', 'SOL-PERP']);
    const base = { 'BTC-PERP': 1, 'ETH-PERP': 1 / 24.6, 'SOL-PERP': 1 / 560 };
    s.price = +(priceOf() * base[s.symbol]).toFixed(s.symbol === 'SOL-PERP' ? 2 : 1);
    s.venue = pick(['binance', 'okx', 'bybit', 'hyperliquid', 'coinbase', 'kraken']);
    s.vol_1h = s.vol;
    return { state: s, arch: a.name };
  }

  root.JEVEngine = { RULES, ACTIONS, SIZES, STATE_KEYS, decide, sampleState, clamp, sig };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.JEVEngine;
})(typeof window !== 'undefined' ? window : globalThis);
