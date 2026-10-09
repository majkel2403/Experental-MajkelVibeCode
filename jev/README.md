# JEV Desk — Hermes writes · Jev decides · code acts

A cinematic, single-page **trading console** (canvas + WebGL + CSS, zero dependencies). Hermes (the LLM agent) writes the strategy and the
risk rules, Dots feeds the data, **Jev** is the decision layer that answers *typed questions* (a choice, a size, a yes-or-no) with a confidence,
and plain code sends — or refuses to send — the order. Everything on the page is **simulated** (prices, P&L, backtests, latencies);
no orders are placed, nothing is financial advice. The decision head is a small hand-tuned heuristic (`src/js/engine.js`), not a trained model.

```
node jev/build.mjs                      # → jev/dist/jev.html  (one self-contained file, open it in a browser)
node jev/build.mjs --out /tmp/x.html    # build somewhere else (parallel workers: always use your own --out)
node jev/tools/shot.mjs --file jev/dist/jev.html --out /tmp/a.png --sel '#hero'            # desktop element shot
node jev/tools/shot.mjs --file jev/dist/jev.html --out /tmp/a.png --sel '#desk' --mobile    # 390×844 touch
```
`shot.mjs` flags: `--w --h --mobile --sel CSS --full --wait ms --after ms --eval 'js' --frames N --gap ms --viewport`; it prints console/page errors.

## Layout of `src/`
| path | what |
|---|---|
| `shell.html` | document shell (fonts, `<style>`, markers) |
| `css/base.css` | tokens + shared primitives (**owned by core**; modules never edit) |
| `css/<module>.css` | module styles, every class prefixed with the module prefix |
| `html/NN-name.html` | section fragments, concatenated in filename order |
| `js/engine.js` | pure decision engine (`window.JEVEngine`) |
| `js/core.js` | shared runtime (`window.JEV`) |
| `js/<module>.js` | module = one closure registered with `JEV.mod(name, init)` |
| `js/main.js` | boots modules (each in try/catch) |

Fragment order: `00-fx` · `05-hud` · `10-hero` · `20-code` · `30-builds` · `40-hour` · `50-desk-open` · `51-desk-top` · `52-desk-world` · `53-desk-bottom` · `59-desk-close` · `70-lab` · `99-footer`.
Section ids (HUD nav links to them): `#hero #builds #hour #desk #lab` (the code panes live in `#code`, right under the hero).

## Module rules
* **Own your files only.** If you need a change in `core.js`/`base.css`/`engine.js`, do not edit — describe it in your final report.
* JS: `JEV.mod('name', () => { … })` — everything inside the closure, **no globals**, no `window.x =` (except via `JEV.*` helpers already provided).
* Animation: **`JEV.task(el, (t, dt) => …)`** (frame loop gated by visibility of `el`). Never run an ungated `requestAnimationFrame` loop.
  Canvases: `JEV.fit(canvas)` (DPR-aware, returns `{g, W, H, dpr}` in CSS px) inside `JEV.watch(el, cb)` (resize). Cache layout rects on resize, never per frame.
  `fit` measures the *layout* box (`clientWidth/Height`), so a canvas inside a `.rv` reveal (mid `scale(.985)`) is still sized right; `watch` re-runs `cb` once when an enclosing `.rv` reveal finishes.
  Memory: glow-only canvases may cap their ratio with `data-dpr="1.5"` (or `JEV.fit(c, 1.5)` / `{dpr, maxPx}`); a capped canvas must draw through the returned `g` / `dpr`, never `JEV.DPR`.
* Hidden tab: the market tick and the decision stream stop while `document.hidden` (a hidden tab gets no frames, so WAAPI animations started by handlers could never finish and would pile up) and resume without catch-up.
  Fire-and-forget flashes: use `JEV.animate(el, keyframes, opts)` (no-op while hidden) instead of `el.animate(...)`.
* Off-screen CSS animations: core toggles `.is-off` on `body > section`, `body > footer`, `.card` and `[class*="-stage"]` when they are > 200px outside the viewport; `base.css` pauses every CSS animation inside.
  (Each running animation costs a style invalidation per frame.) Prefer compositor-only properties (`transform`, `opacity`) for infinite loops; `background-position` / `clip-path` / `box-shadow` loops run on the main thread.
* Perf budget ≈ 2 ms/frame per module on a laptop: pre-render static layers to a second/offscreen canvas, glow with pre-rendered sprites + `globalCompositeOperation='lighter'`
  (no `shadowBlur`/`filter: blur()` inside per-frame loops), cap particle counts, update DOM text at ≤ 4 Hz.
* Responsive: must look **intentional** at 390×844 (touch), 768×1024, 1440×900. No horizontal page overflow (`scrollWidth ≤ innerWidth`). Touch targets ≥ 40 px.
  Dense visuals may simplify on narrow screens (drop labels, fewer particles) but never just shrink to illegible.
* Reduced motion: `JEV.task` freezes after a few frames; CSS animations are tamed globally; don't rely on animation for essential content.
* CSS: prefix every class/id with your module prefix (`fx-` `hero-` `code-` `bld-` `hr-` `dk-` `lab-`), use tokens from `base.css` (`var(--pink)` …), never restyle `body`, `.card`, `.hud`.
* Copy: English, terse lowercase mono microcopy (see the reference screenshots). **Trading only** — strategy, books, spreads, edge, sizing, risk caps, kill switch, venues.
  Always read as simulation; never claim real performance. No real people / brands / handles. Nothing unrelated to trading (the repository around this folder is unrelated; never mention it).
* Content is **live**: subscribe to `JEV.bus` events instead of faking independent random numbers where a shared signal exists.
* Quality bar: the four reference screenshots (`/tmp/claude-0/-home-user-SpaWebBuilder/ba73986e-a64d-5500-a526-4ec04555eb61/images/{1,2,3,4}.jpg`) — dark glass panels, hot-pink Jev accent with green/blue/amber/violet/orange agent colours,
  dense but legible data-viz, additive glow, particle streams, serif display numerals, tiny letter-spaced mono labels. Go for *maximum* graphic ambition **and** legibility.

## `window.JEV` API (core.js)
```
JEV.$ / $$(sel, root)          JEV.TAU  clamp  lerp  rnd(a,b)  ri(a,b)  pick(arr)  gauss()  rng(seed)→()=>0..1
JEV.fmt(n,d) (cached Intl.NumberFormat)  usd(n,d)  sgn(n,d)  rgba('#rrggbb', a)   JEV.C = palette {pink,pink2,green,blue,amber,violet,orange,cyan,red,ink,mut,dim,bg}
JEV.DPR (≤ 2; lowered, never below 1, only when a viewport-sized canvas would exceed ~8.4 MP of backing store)  reduce(bool)  narrow()(<700px)  hidden()  animate(el,kf,opts)
JEV.bus.on(name, fn) → off()   .off  .emit      events: 'decision'(d) · 'tick'({price,dp}, 4 Hz) · 'kill'(bool) · 'floor'(number)
JEV.task(el, fn(t,dt))         JEV.fit(canvas[,dpr|{dpr,maxPx}])→{g,W,H,dpr}    JEV.watch(el, cb(rect))    JEV.onView(el, cb, {once,threshold,rootMargin})
JEV.rel(el)→{x,y,w,h}          JEV.pointer {x,y,nx,ny,down}   (viewport px / -1..1)
JEV.countTo(el, to, {from,dur,fmt})    JEV.scramble(el, text, ms)
JEV.S      live state {killed, floor, count, cost, ms[], counts{choice,flag,score}, dest{execute,review,skip}}
JEV.RULES {floor:.85, lossCap:2000, maxPos:4}    JEV.setFloor(v)   JEV.setKilled(bool)   (both broadcast on the bus; HUD updates itself)
JEV.market {price, open, hist[]}   simulated BTC price (4 Hz random walk)    JEV.recent[]  last 40 decisions (newest first)
JEV.decide(state, {floor?, killed?})  run the engine on a hand-built state       JEV.makeDecision() sample+decide      JEV.fire() emit a decision now
JEV.BUILDS[10]  JEV.AGENTS[6]  JEV.TRIO[3]  JEV.STATE_KEYS[15]  JEV.ACTIONS  JEV.SIZES [0.5,1,2,4]
```
Facilities provided by the **fx** module (may not exist yet when your module's init runs — call lazily/guarded): `JEV.pulse(strength 0..1)`, `JEV.toast(msg, kind)`.

### Decision record `d` (bus `'decision'`)
```
d.id  d.line (human summary)  d.symbol 'BTC-PERP'|'ETH-PERP'|'SOL-PERP'  d.venue  d.arch (scenario archetype)  d.build (key of JEV.BUILDS)
d.state {symbol, price, vwap_dist_bps, spread_bps, imbalance, funding_bps, vol_1h, edge_bps, position_pct, daily_pnl, drawdown_pct, latency_ms, signal_age_s, venue, regime}
d.action 'buy'|'sell'|'hold'|'close'|'flatten'   d.p {buy,sell,hold,close,flatten} (probabilities)   d.conf (0..1, confidence of the action)
d.size 0.5|1|2|4 (% of capital)  d.sizeIdx  d.sizes[4] (probabilities)           d.riskOk bool  d.pRisk (P(risk_ok))
d.dest 'execute'|'review'|'skip'   d.reason ('ok'|'hold'|'kill switch'|'risk flag'|'conf 0.71 < 0.85')   d.ms (typed-question latency)   d.floor  d.killed  d.net (edge net of costs, bps)
```
Gate semantics (same everywhere): hold → `skip`; kill switch → `review`; failed risk flag → `review` (except close/flatten, which reduce risk); `conf < floor` → `review`; else `execute`.

## Section kit (base.css)
`.sec` (tight vertical rhythm), `.sec-head` > `.eb` + `.h2` + `.lede`. From 1100px a plain `.sec-head` is a grid: headline left, lede right (bottom-aligned, pink hairline) — wrap the lede in `.sec-aside`
to add a live slot under it (`.sec-live`, see the `#desk` head: gate tally from `JEV.S.dest`, ids `secExec/secRev/secSkip`, updated by the HUD). Module heads that bring their own layout (`.bld-head`, `.code-head`) are left alone;
the kit uses `:where()` so any module rule overrides it. HUD: the section nav shows from 1000px (numerals dropped below 1240px), `--dim` is ≥ 4.5:1 on `--bg` and on the card panels.

## The three primitives ("typed questions")
`choice` — *which one?* (buy · sell · hold · close · flatten) · `score` — *how much?* (0.5% · 1% · 2% · 4% of capital) · `flag` — *yes or no?* (`risk_ok`).
Hard rules held by code, not by the model: **floor 0.85** (below → human review), **daily loss cap $2,000**, **max position 4%**, **kill switch**.
