# Hermes "galaxy" engine — module spec (for module authors)

$H = katalog roboczy sesji, w której powstała wersja 3D (dziś: artifact/legacy)

Product: a Polish-language demo of **Hermes**, an orchestrator that takes a task, assembles a team of specialised agents
and leads them to a report. The hero of the page is a Canvas-2D "3D" scene (custom projection, no WebGL, no libraries).
The user asked for maximum wow: **galaxy style, parallel orbits, 3D particles, flowing animation, glowing neural lines
on connections and conversations, a project graph (files, decisions) that builds up live.**

## Scene model (already implemented — read `prep3d`, `posAt`, `curves` in your copy)
* Hermes = the star at the origin (gold). Four working lines R/C/Q/D (colours `NEON`: R #6DB6FF, C #FFAE5C, Q #4FF0D8,
  D #D6BEFF) are **parallel orbit lanes**: rings of radius `laneR(li)` (62, 92, 122, 152), all in parallel planes (same tilt
  `LANE_TILT`), stacked `LANE_DY` apart (`laneY(li)`); inner lanes are faster (`laneW(li)` rad per scene-second).
  Agents ride their lane: `lanePt(li, theta, k, out)`; the current angle is stored on the node as `n.th` (agents only;
  valid after `posAt`).
* Files are moons orbiting their author (`n.of` = owner node index, radius `n.fr`), decisions float near the centroid of
  the agents that took them, the report node hovers above Hermes (y≈56) from `REPORT3D_AT` (50.5 s).
* `m.nodes[i]` = `{ i, id, kind: 'hermes'|'agent'|'file'|'decision'|'report', spawn, born?, r, color, light, label, ... }`
  agents also have `line`, `lane`, `a` (agent data), files `file` (name, kind, ver…), decisions `dec`.
* `m.P` (Float32Array, 3 per node) = world position of every node at this frame's scene time (`posAt` runs before any stage).
* `m.edges[i]` = `{ i, a, b, kind: 'spoke'|'link'|'chat'|'author'|'deliver'|'lineage'|'decision'|'report', appear, w, base,
  color, color2, n (=SAMPLES=22), pts (world samples, rewritten every frame by `curves`), sx, sy (screen samples, you fill) ... }`.
* `m.edgeEv[e.i]` = messages that travel on that edge `{ t, from, to, kind, dir, carry, burst, ... }`; `m.ev` all messages.
* `m.lanes[li]` = `{ letter, li, color, r, w, y, first }` (`first` = spawn time of the lane's first agent).
* `m.base.tasks[agentId]` = task list `{from,to,review,label}`; `agentAt(list, t)` -> `{ st:'wait'|'work'|'review'|'done', prog, cur }`.
* Global helpers you can use: `clamp, ease, easeOutBack, rgba(hex,a), rgbOf, mixHex(a,b,k), mulberry(seed), hashStr, glow(ctx,x,y,rad,hex,a)`
  (sprite-based soft light: ONE drawImage — use it freely, it is cheap), `sprite(hex)`, `rrect, wrapText, diamond`, `KIND[kind].color`,
  `FLIGHT` (=1.5 s message flight time), `GOLD`, `NEON`, `FILE_COL`, `DEC_COL`, `REPORT_COL`, `NEAR` (=60: skip anything with depth < NEAR),
  `SCENE_R`, `DUR` (=60), `REPORT3D_AT`.

## Frame contract
`draw3d(ctx, W, H, S)` calls, back to front: `drawGalaxy(G)`, `drawOrbits(G)`, `list = drawSynapses(G)`, `drawFlows(G, list)`,
`N = drawNeurons(G)`, `drawFx(G, N)`, `drawLabels(G, N)`, `drawCards(G, N)`, then a vignette. `ctx` already has the dpr transform;
draw in CSS pixels. `G = { ctx, W, H, S, m, t, fx, q, rm, cam, proj, unit, kref, f, dist, cx, cy, sf, cyw, syw, cpt, spt }`:
* `t` scene time (0..60, scrubbable: **anything that encodes the story — what exists, what is lit — must be a pure function of t**).
* `fx` wall-clock seconds: use it only for ambient motion (twinkle, drift, swirl, flow), never for story state.
* `q` quality 0|1|2 chosen adaptively at runtime (2 = full). Scale particle counts/layers with it (q2 full, q1 ≈ 55 %, q0 ≈ 25 %).
* `rm` = prefers-reduced-motion: freeze ambient motion (use a constant instead of `fx`), no flashing, keep it calm.
* `proj(x,y,z)` -> shared array `[screenX, screenY, perspectiveScale, cameraDepth]`. **Copy values out immediately** (the array is reused).
  Skip points with depth `< NEAR`. `kref` = scale of a point at the focus depth (use `k/kref` for size ratios).
* `cx, cy` = screen centre of the scene; `sf = {l,r,t,b}` = free rectangle (the scene must live inside it; glass panels cover the rest).
* `N = { PV, vn, labels, picks }` from `drawNeurons`: `PV[node.i] = { n, x, y, k, z, s, wx, wy, wz }` screen/world data of every visible node
  (`s` = spawn scale 0..~1.1), `vn` the same sorted far→near, `labels` candidates `{ v, pr, text, dy }`, `picks` hit areas `{ id, x, y, r, z }`.
* Stages may rely on `ctx.globalCompositeOperation` being 'source-over' on entry and must leave it 'source-over' and `globalAlpha` 1 on exit.

## Hard rules
1. **Edit only inside your own `// @@MODULE:<NAME>-BEGIN … // @@MODULE:<NAME>-END` block(s)** in your copy `$H/tmp/gx/<you>/project/Main.dc.html`.
   You may add module-private constants/functions/caches inside the block (prefix them with your module name to avoid clashes).
   If you need data that the model does not provide, compute it inside your block. If you believe something OUTSIDE your block is wrong,
   do not touch it — describe it in your final report.
2. Keep the signatures of your stage functions. Never throw: guard every divisor, radius (`arc`/`createRadialGradient` throw on negative radius),
   NaN. No `document`/DOM access, no `createElement`, no `innerHTML`, no network, no new libraries. `OffscreenCanvas` is allowed (guard with `typeof`).
3. **No per-frame garbage in hot loops** (no new arrays/objects/closures per particle); precompute typed arrays once (module-level, seeded
   with `mulberry`), batch draw calls (sort/bucket by colour, set `fillStyle` once per bucket, use `fillRect` for dots, `drawImage` sprites for glows).
4. Budgets at q2 (canvas calls per frame, whole scene ≤ ~9000, JS time of `draw3d` ≤ ~8 ms on this machine): GALAXY ≤ 2500, ORBITS ≤ 1200,
   SYNAPSES ≤ 3000, FLOWS ≤ 1800, NEURONS ≤ 1600, FX ≤ 700. Check with `node $H/tools/probe3d.mjs <your copy>` (prints `maxCanvasCalls/frame`).
5. Visual hierarchy (legibility is a requirement, not a nicety): background and galaxy < orbits < idle synapses < active synapses/pulses <
   neurons < labels/cards. Text sits on top of glow, so keep the luminance behind labels low; never let additive layers saturate to white blobs.
   Colour is meaning: lane colour = line colour; gold = Hermes/report; pale yellow = decisions; file colour by type (`FILE_COL`).
6. Polish only for any text you draw. No emoji. Min font size 12 px.
7. Everything must work for all three scenarios (`medytacja`, `panel`, `niemcy`), all t in 0..60, scrubbing backwards, q 0/1/2, rm on/off,
   canvas sizes from 360×420 up to 1400×1000 (`S.safe` may be null in the mobile board = whole canvas), and with the camera zoomed/rotated by the user.

## How to look at your work (you MUST iterate visually — render, look, critique, improve; at least 4 rounds)
`node $H/tools/render/shot.mjs <jobs.json>` runs the real Design runtime in headless Chromium on the page in `dir` and writes
`$H/tmp/shots/<job name>.png`; view PNGs with the Read tool. Read the header of `$H/tools/render/shot.mjs` for the job format
(`dir`, `page`, `jobs[]` with `name,w,h,dpr,eval,wait,clip,full,after,reducedMotion`). Create your jobs under `$H/tmp/gx/<you>/jobs-*.json` with
`"dir": "tmp/gx/<you>/project"` (path relative to $H; run commands with `cd $H`), and **prefix every job name with `<you>-`** (shots dir is shared).
Drive the scene from `eval`, e.g.
`var L=window.__HM_TEST.logic;L._sceneT=44;L._uiT=44;L.setState({t:44,started:true,playing:false,sid:'medytacja'})` (`sid` ∈ medytacja|panel|niemcy;
`L._q=1` forces quality; `L._orbit=false` freezes the auto-orbit; add `,sel:'hermes'` etc. for selection; `view:'flat'` is the 2D fallback — ignore it).
The scene is the big canvas in the middle of a 1440 px wide page: full-page job `w:1440,h:1520` and `clip:{x:330,y:100,width:700,height:1030}`
frames it; use `dpr:2` plus a tighter clip to inspect detail. Useful moments: t=0 (empty start), 3, 8 (team assembly), 20, 36, 44, 53 (report forming), 58 (finale).
Note: headless software rendering is slow (≈10 fps) and the quality governor may lower `q` after a few seconds; force `L._q=2` in `eval` when judging q2.
Measure cost in a job `after`: `window.__HM_TEST.logic._ft` = smoothed JS ms spent in `draw3d` (keep it small), and run
`node $H/tools/probe3d.mjs <copy>` (canvas-call budget, NaN/negative-radius stub checks, determinism) and
`node $H/tools/check-board.mjs <copy>` — both must end with OK.
Do NOT publish or touch anything outside `$H/tmp/gx/<you>/` and `$H/tmp/shots/<you>-*`.

## Deliverable
Your final message (it is returned to the orchestrator as data): which blocks you changed, what each now does (5–10 lines), budgets measured
(`maxCanvasCalls/frame`, `_ft`), the screenshot file names that best show it, known limitations, and any defects you saw OUTSIDE your block.

## Addendum (style pass): the reference look
The user sent two reference dashboards (view them with the Read tool: `$H/tmp/ref-1.jpg`, `$H/tmp/ref-2.jpg`) and said the hero
must look "like this, more or less": a **black-hole singularity** at the centre (dark core, thin white-hot photon ring, a bright
gold-orange ACCRETION DISK of streaming particles seen at a shallow tilt, matter spiralling in, thin bipolar jets), agents as
coloured glossy orbs with a role glyph orbiting around it, fibre bundles of thin coloured lines converging on foci, a dark
star field. The page chrome around the hero is already a dense "mission control" grid (do not touch it).
Current model: `LANE_TILT = 0.5` (lane planes), base camera pitch 0.42 + intro; `posAt`/`curves` unchanged. Everything you draw
must still obey the module contract, the budgets and the legibility rule. Measure JS cost with `L._ft` in a job `after`
(headless software rendering; the whole `draw3d` must stay ≤ ~9 ms there at q2, lower is better) and `maxCanvasCalls/frame`
from `probe3d.mjs` (≤ ~9000 for the whole scene; the probe counts each glow() as 4 calls because it has no OffscreenCanvas).
Module copies for this pass live in `$H/tmp/gx2/<you>/project/Main.dc.html`; jobs go to `$H/tmp/gx2/<you>/` with
`"dir": "tmp/gx2/<you>/project"`; job names prefixed `<you>2-`. The hero is now the full page width: use
`clip:{x:14,y:630,width:1412,height:640}` on a `w:1440,h:1760` page to frame it (HUD panels sit at the left/right edges inside it).
