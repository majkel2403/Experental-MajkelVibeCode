// The Hermes "command deck" logic, shared by the web app and the canvas boards (classic script, no modules: the board
// pastes it after the core bundle `NW`). The host supplies the data through the global HX_HOST:
//   HX_HOST.runs()                      -> [{ id, name, meta, live }]   the run list (may change between calls)
//   HX_HOST.load(id)                    -> events[] | Promise<events[]> the recorded events of a run
//   HX_HOST.live(id, onEvent)           -> stop()                        optional: follow a running task
//   HX_HOST.onRuns(cb)                  optional: cb() when the list changed
//   HX_HOST.initial()                   optional: { id, intro } the run to open first, and whether to greet with the order card
// Everything the panels show comes from NW.app (the event log), so the scene and the interface stay in step.
const HX_SPEEDS = [0.25, 1, 4, 10];
const { runFacts, appState, matchTask, mmss, studioState, legendOf, narrate, lanesOf, runSummary } = NW.app;
const HX_TABS = {
  code: ['Kod', 'M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14'],
  talk: ['Rozmowy', 'M4 5h16v11H9l-5 4z'],
  files: ['Pliki', 'M3.5 7a1.5 1.5 0 0 1 1.5-1.5h4l2 2.5h8A1.5 1.5 0 0 1 20.5 9.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z'],
  log: ['Dziennik', 'M5 6h14M5 12h14M5 18h9'],
  ins: ['Inspektor', 'M12 3v4M12 17v4M3 12h4M17 12h4M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
};
const HX_LANE_W = 96; const HX_LANE_H = 16; const HX_LANE_HEAD = 18;
const HX_MARK = { good: '#8CFFB4', bad: '#FF5A6A', talk: '#D6BEFF', file: '#9FE3FF', tool: 'rgba(201,210,236,0.55)', x: 'rgba(201,210,236,0.3)' };
const hxBp = (w) => (w >= 1180 ? 'xl' : w >= 720 ? 'm' : 's');
const hxReduce = () => { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };

class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { run: null, tick: 0, idx: -1, playing: true, speed: 1, sel: null, hl: null, focus: 'auto', follow: true, task: '', note: '', bp: 'xl', sheet: false, intro: true, report: false, boot: false };
    this._v = null; this._T = null; this._F = null; this._lanes = []; this._sum = {}; this._custom = null; this._stopLive = null; this._lastPush = 0; this._auto = 'code';
  }

  // opts: idle = show the run paused mid-way (behind the order card), keepIntro = leave the card open
  open(run, task, opts) {
    opts = opts || {};
    if (this._stopLive) { this._stopLive(); this._stopLive = null; }
    Promise.resolve(run === 'custom' ? this._custom : HX_HOST.load(run)).then((ev) => {
      if (!ev || !ev.length || !this._v) return;
      const T = NW.createTimeline(ev);
      this._sum[run] = runSummary(T);
      this._T = T; this._F = runFacts(T);
      const v = this._v;
      v.setTimeline(T);
      const live = !!(HX_HOST.runs().find((r) => r.id === run) || {}).live;
      v.setLive(live);
      if (opts.idle) { v.setTime(T.duration * 0.55); v.pause(); } else { v.setTime(0); v.play(); }
      if (live && HX_HOST.live) {
        this._stopLive = HX_HOST.live(run, (e) => {
          const atEnd = v.t >= T.duration - 50;
          T.append(e); this._F = runFacts(T);
          if (atEnd) v.setTime(T.duration);
          this.drawLanes();
        });
      }
      this.drawLanes();
      this.setState({ run, idx: -1, sel: null, report: false, focus: 'auto', playing: !opts.idle, intro: !!opts.keepIntro, task: task != null ? task : this._F.title, note: run === 'custom' ? this.state.note : '' });
    });
  }

  match(text) { return matchTask(text, HX_HOST.runs().map((r) => r.id)); }

  // lanes: one row per agent over the whole run, phase bands behind, events as ticks
  drawLanes() {
    const T = this._T;
    if (T && this._v) this._lanes = lanesOf(T, (id) => this._v.player.label(id));
    const c = typeof document !== 'undefined' && typeof document.getElementById === 'function' ? document.getElementById('hx-lanes') : null;
    if (!c || !c.getContext || !T) return;
    const W = c.clientWidth; const H = c.clientHeight;
    if (W < 10 || H < 10) return;
    c.width = W * 2; c.height = H * 2;
    const g = c.getContext('2d');
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.clearRect(0, 0, W, H);
    if (!T.duration) return;
    const X = (ms) => 6 + (ms / T.duration) * (W - 12);
    (this._F ? this._F.phases : []).forEach((p, k) => {
      g.fillStyle = k % 2 ? 'rgba(60,78,150,0.16)' : 'rgba(60,78,150,0.06)';
      g.fillRect(X(p.start), 0, Math.max(1, X(p.end) - X(p.start)), H);
      if (k) { g.fillStyle = 'rgba(242,193,78,0.35)'; g.fillRect(X(p.start), 0, 1, H); }
      g.fillStyle = k % 2 ? 'rgba(169,180,214,0.8)' : 'rgba(127,139,179,0.8)';
      g.font = '500 12px "IBM Plex Mono", monospace';
      g.fillText(String(k + 1).padStart(2, '0'), X(p.start) + 4, 12);
    });
    this._lanes.forEach((l, i) => {
      const y = HX_LANE_HEAD + i * HX_LANE_H;
      g.fillStyle = l.colour; g.globalAlpha = 0.2;
      const x0 = X(l.from); const x1 = Math.max(x0 + 3, X(l.to));
      g.beginPath(); g.roundRect ? g.roundRect(x0, y + 3, x1 - x0, 10, 5) : g.rect(x0, y + 3, x1 - x0, 10); g.fill();
      g.globalAlpha = 1;
      for (const m of l.marks) { g.fillStyle = HX_MARK[m.k] || HX_MARK.x; g.fillRect(X(m.t), y + (m.k === 'x' ? 5 : 3), 1.5, m.k === 'x' ? 6 : 10); }
    });
  }

  measure() {
    const root = typeof document !== 'undefined' ? document.getElementById('hx-root') : null;
    if (!root) return;
    const bp = hxBp(root.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1440));
    if (bp !== this.state.bp) this.setState({ bp, sheet: bp === 's' ? false : this.state.sheet });
    // the camera frames the tree in the free middle cell: nothing floats over the work
    const free = document.getElementById('hx-free');
    if (free && this._v) {
      const r = root.getBoundingClientRect(); const f = free.getBoundingClientRect();
      if (f.width > 40 && f.height > 40) this._v.setInsets({ insetLeft: Math.max(0, f.left - r.left), insetRight: Math.max(0, r.right - f.right), insetTop: Math.max(0, f.top - r.top), insetBottom: Math.max(0, r.bottom - f.bottom) });
    }
    this.drawLanes();
  }

  componentDidMount() {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
    const gl = document.getElementById('hx-gl');
    const ov = document.getElementById('hx-ov');
    if (!gl || !ov) return;
    this._v = NW.createViewer({ gl, overlay: ov, autoRotate: false, hud: false, focus: true, bg: [0.008, 0.014, 0.045], font: "'Rajdhani', 'Inter', sans-serif", fontScale: 1.12 });
    if (typeof window !== 'undefined') { window.__NW = this._v; window.__HXAPP = this; if (window.__HM_TEST) window.__HM_TEST.logic = this; }
    this._v.onSelect = (id) => { this.setState({ sel: id || null, focus: id ? 'ins' : this.state.focus === 'ins' ? 'auto' : this.state.focus, sheet: id && this.state.bp === 's' ? true : this.state.sheet }); };
    this._v.onHover = (id) => { this.setState({ hl: id }); };
    this._v.onTick = (v) => {
      const T = this._T;
      if (!T) return;
      const idx = T.indexAt(v.t);
      const now = Date.now();
      const st = v.story;
      const typing = !!(st && ((st.lastCode && st.lastCode.typing) || (st.lastTerm && st.lastTerm.typing)));
      if (idx !== this.state.idx || v.playing !== this.state.playing || now - this._lastPush > (typing && !hxReduce() ? 90 : 250)) {
        this._lastPush = now;
        this.setState({ idx, playing: v.playing, tick: Math.round(v.t / 100) });
      }
    };
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this.measure());
      this._ro.observe(document.getElementById('hx-root'));
      this._ro.observe(document.getElementById('hx-free'));
    } else if (typeof window !== 'undefined') { this._onResize = () => this.measure(); window.addEventListener('resize', this._onResize); }
    if (HX_HOST.onRuns) HX_HOST.onRuns(() => this.setState({ tick: this.state.tick + 1 }));
    this.measure();
    // run cards show length, team and files: read each run once
    HX_HOST.runs().forEach((r) => Promise.resolve(HX_HOST.load(r.id)).then((ev) => { if (ev && ev.length && !this._sum[r.id]) { this._sum[r.id] = runSummary(NW.createTimeline(ev)); this.setState({ tick: this.state.tick + 1 }); } }));
    const init = HX_HOST.initial ? HX_HOST.initial() : { id: (HX_HOST.runs()[0] || {}).id, intro: true };
    if (init && init.intro !== false && !hxReduce()) { this.setState({ boot: true }); this._bootT = setTimeout(() => this.setState({ boot: false }), 3300); }
    if (init && init.id) this.open(init.id, null, init.intro === false ? {} : { idle: true, keepIntro: true });
  }

  componentWillUnmount() {
    if (this._stopLive) this._stopLive();
    if (this._bootT) clearTimeout(this._bootT);
    if (this._ro) this._ro.disconnect();
    if (this._v) this._v.destroy();
    if (typeof window !== 'undefined' && this._onResize) window.removeEventListener('resize', this._onResize);
  }

  renderVals() {
    const S = this.state; const v = this._v; const T = this._T; const bp = S.bp;
    const F = this._F || { phases: [], title: '', by: '' };
    const dur = T ? T.duration : 0;
    const t = v ? Math.min(v.t, dur) : 0; const ts = t / 1000;
    const label = (id) => (v ? v.player.label(id) : id);
    const runs = HX_HOST.runs();
    const runInfo = runs.find((r) => r.id === S.run) || { name: S.run === 'custom' ? 'Własny log' : '', live: false };
    const A = T ? appState(T, F, t, label, v ? v.player.actions() : []) : { idx: -1, done: false, failed: false, phases: [], kpis: [], log: [], talk: [], files: [], report: { kpis: [], results: [], status: '', title: '', summary: '', doc: '', docPath: '' } };
    const St = T ? studioState(v ? v.story : null, { reduce: hxReduce(), maxLines: bp === 's' ? 9 : 26 }) : { brief: null, team: [], plan: null, code: null, term: null };
    const done = A.done; const playing = v ? v.playing : false;
    const fresh = (ms) => ts - ms / 1000 < 1.5 && ts >= ms / 1000;
    const relOf = (i) => (T ? T.rel[i] : 0);

    // the last thing each agent did, in words
    const doing = {};
    if (T) for (let i = A.idx; i >= 0 && i > A.idx - 400; i--) { const e = T.events[i]; const id = e.agent || 'hermes'; if (!doing[id] && e.type !== 'agent.spawned') { const n = narrate(e, label); doing[id] = n.verb + (n.obj ? ' ' + n.obj : n.extra ? ' · ' + n.extra : ''); } }
    const team = St.team.map((a) => ({
      name: a.name, role: a.role, doing: doing[a.id] || '', status: a.status, working: a.working, state: a.state, fresh: a.fresh,
      hl: S.hl === 'user:' + a.id, style: '--depth:' + a.depth + ';--c:' + a.colour + ';--sc:' + a.statusColour,
      pick: () => { if (v) v.select('user:' + a.id); },
      enter: () => { if (v) v.highlight('user:' + a.id); }, leave: () => { if (v) v.highlight(null); },
    }));
    const plan = St.plan ? St.plan.steps.map((p) => ({ text: p.text, state: p.state, mark: p.state === 'done' ? '✓' : p.state === 'cur' ? '▸' : p.n })) : [];
    const phases = A.phases.map((p) => ({ num: p.num, name: p.name, title: p.num + ' ' + p.name, fill: p.fill, state: p.cur ? 'cur' : p.fill >= 100 ? 'done' : 'todo' }));
    const log = A.log.map((l) => ({ time: l.time, type: l.type, who: l.who, text: l.text, color: l.colour, fresh: fresh(relOf(l.i)) }));
    const talk = A.talk.map((m) => ({ time: m.time, from: m.from, to: m.to, tone: m.tone, color: m.colour, text: m.text, fresh: fresh(relOf(m.i)) }));
    const files = A.files.map((f) => ({
      time: f.time, name: f.name, dir: f.dir, who: f.who, kind: f.kind, color: f.colour, diff: f.diff, fresh: fresh(relOf(f.i)),
      pick: () => { if (v && f.id) v.select(f.id); }, enter: () => { if (v && f.id) v.highlight(f.id); }, leave: () => { if (v) v.highlight(null); },
    }));

    // the narrator: the newest event as one sentence
    let nar = { who: 'Hermes', verb: 'czeka na zlecenie', obj: '', extra: '', colour: '#F2C14E', fresh: false, working: false };
    if (T && A.log.length) { const n = narrate(T.events[A.log[0].i], label); nar = { who: n.who, verb: n.verb, obj: n.obj, extra: n.extra, colour: n.colour, fresh: fresh(relOf(A.log[0].i)), working: playing && !done }; }

    // the director: the drawer follows the action — code being written or a command running, a conversation, else the log
    const lc = v && v.story ? v.story.lastCode : null; const lt = v && v.story ? v.story.lastTerm : null;
    const age = { code: lc ? (lc.typing ? 0 : ts - lc.end) : 1e9, term: lt ? (lt.end == null ? 0 : ts - lt.end) : 1e9, talk: A.talk.length ? ts - relOf(A.talk[0].i) / 1000 : 1e9 };
    const cand = age.code <= age.term ? ['code', age.code] : ['code', age.term];
    if (Math.min(cand[1], age.talk) < 5) this._auto = age.talk < cand[1] ? 'talk' : 'code'; else if (!T || A.idx < 0) this._auto = 'log';
    const auto = S.focus === 'auto';
    const active = auto ? this._auto : S.focus;

    const counts = { code: St.code || St.term ? '●' : '', talk: String(talk.length), files: String(files.length), log: String(log.length), ins: '' };
    const tabs = Object.keys(HX_TABS).map((id) => ({ name: HX_TABS[id][0], d: HX_TABS[id][1].slice(1), on: active === id, count: counts[id], pick: () => this.setState({ focus: id, sheet: bp === 's' ? true : S.sheet }) }));

    let code = { file: '', badge: '', badgeColor: '#7F8BB3', who: '', diff: '', lines: [] };
    if (St.code) { const c = St.code; code = { file: c.file, badge: c.created ? 'NOWY' : c.typing ? 'PISZE' : 'ZMIANA', badgeColor: c.created ? '#8CFFB4' : '#FFB48A', who: c.who, diff: '+' + c.add + (c.del ? ' −' + c.del : ''), lines: c.lines }; }
    let term = { who: '', state: '', stateColor: '#7F8BB3', command: '', typing: false, lines: [] };
    if (St.term) { const m = St.term; term = { who: m.who, state: m.running ? 'działa' : m.fail ? 'błąd' : 'koniec', stateColor: m.running ? '#FFC979' : m.fail ? '#FF8F9A' : '#8CFFB4', command: m.command, typing: m.typing, lines: m.lines.map((l) => ({ s: l.s, cls: l.bad ? 'bad' : '' })) }; }
    let ins = { kind: '', status: '', label: '', sub: '', hasSub: false, stats: [], events: [] };
    const info = S.sel && v ? v.inspect(S.sel) : null;
    if (info) ins = { kind: info.kind === 'file' ? 'plik' : info.sub, status: info.status, label: info.label, sub: info.kind === 'file' ? info.sub : '', hasSub: info.kind === 'file', stats: info.stats.map(([k, val]) => ({ k, v: val })), events: info.events.map((e) => ({ time: mmss(e.rel), type: e.type + (e.who ? ' · ' + e.who : ''), text: e.text, color: e.type.indexOf('fail') >= 0 || e.type === 'error' ? '#FF8F9A' : e.type.indexOf('passed') >= 0 || e.type.indexOf('completed') >= 0 ? '#8CFFB4' : '#7F8BB3' })) };
    const R = A.report;
    const report = { run: runInfo.name, status: R.status, statusColor: A.failed ? '#FF8F9A' : '#8CFFB4', title: R.title, summary: R.summary, kpis: R.kpis, hasDoc: !!R.doc, doc: R.doc, docPath: R.docPath, results: R.results };

    const matched = S.task && S.task !== F.title ? this.match(S.task) : null;
    const mname = matched ? (runs.find((r) => r.id === matched) || {}).name : '';
    const statusText = runInfo.live ? 'LIVE' : done ? 'zakończony' : A.failed ? 'błąd' : t > 0 ? (playing ? 'w toku' : 'pauza') : 'gotowy';
    const statusColor = runInfo.live ? '#FF6B7A' : done ? '#8CFFB4' : A.failed ? '#FF8F9A' : playing && t > 0 ? '#F2C14E' : '#A9B4D6';
    const sumLine = (id) => { const s = this._sum[id]; return s ? mmss(s.dur) + ' · ' + s.agents + ' agentów · ' + s.files + ' plików' : ''; };
    const runRows = runs.map((r) => ({ name: r.name, active: S.run === r.id, meta: r.live ? 'LIVE · ' + sumLine(r.id) : sumLine(r.id) || r.meta || '', pick: () => this.open(r.id) }));
    if (this._custom) runRows.push({ name: 'Własny log', active: S.run === 'custom', meta: sumLine('custom') || 'plik', pick: () => this.open('custom') });

    const chips = legendOf(v ? v.frame() : null, bp === 'xl' ? 6 : 4).map((c) => ({ colour: c.colour, text: c.ext, n: c.n }));
    if (bp !== 'xl') for (const k of A.kpis.slice(0, 2)) chips.push({ colour: k.colour, text: k.label, n: k.value });
    const lanes = this._lanes;
    const lanesH = HX_LANE_HEAD + Math.max(1, Math.min(lanes.length, 6)) * HX_LANE_H + 6;
    const pct = dur ? Math.round((t / dur) * 10000) / 100 : 0;
    const introOpen = S.intro; const reportOpen = S.report && done && !S.intro;

    return {
      bp, sheet: bp === 's' && S.sheet,
      sceneAria: 'Przestrzeń robocza przebiegu: ' + F.title + '. Przeciągnij, aby przesunąć; kliknij plik lub agenta, aby zobaczyć, co robił.',
      runLine: runInfo.name || 'Nowe zlecenie', phases, statusText, statusColor, isLive: !!runInfo.live,
      clockNow: mmss(t), clockDur: mmss(dur),
      newOrder: () => this.setState({ intro: true, report: false }),
      openReport: () => { if (done) this.setState({ report: true }); },
      reportReady: done, reportPending: !done,
      hasBrief: !!St.brief, briefText: St.brief ? St.brief.text : '', briefBy: St.brief ? St.brief.by : '',
      team, teamMeta: team.length + (team.length === 1 ? ' agent' : ' agentów'), hasPlan: plan.length > 0, plan, planMeta: St.plan ? St.plan.done + ' / ' + St.plan.total : '',
      chips, follow: S.follow,
      toggleFollow: () => { if (!v) return; const on = !S.follow; v.setFocus(on); this.setState({ follow: on }); },
      zoomIn: () => v && v.zoom(1.2), zoomOut: () => v && v.zoom(1 / 1.2), resetCam: () => { if (v) v.reset(); },
      tabs, auto, toggleAuto: () => this.setState({ focus: auto ? active : 'auto' }),
      paneCode: active === 'code', paneTalk: active === 'talk', paneFiles: active === 'files', paneLog: active === 'log', paneIns: active === 'ins',
      hasCode: !!St.code, code, hasTerm: !!St.term, term, noCode: !St.code && !St.term, codeMeta: St.code ? St.code.who : '',
      talk, talkMeta: talk.length + ' wiad.', noTalk: !talk.length, files, filesMeta: files.length + ' plików', noFiles: !files.length,
      log, logMeta: (A.idx + 1) + ' / ' + (T ? T.events.length : 0), logEmpty: !log.length,
      hasSel: !!info, noSel: !info, ins, closeSel: () => { if (v) v.select(null); },
      nar, toggleSheet: () => this.setState({ sheet: !S.sheet }),
      isPlaying: playing, notPlaying: !playing, playAria: playing ? 'Wstrzymaj' : 'Odtwórz',
      togglePlay: () => { if (!v) return; if (v.playing) v.pause(); else v.play(); this.setState({ playing: v.playing }); },
      restart: () => { if (!v) return; v.setTime(0); v.play(); this.setState({ playing: true, idx: -1, report: false }); },
      speeds: HX_SPEEDS.map((s) => ({ label: (s === 0.25 ? '0.25' : String(s)) + '×', active: S.speed === s, pick: () => { if (v) v.setSpeed(s); this.setState({ speed: s }); } })),
      laneNames: lanes.slice(0, 6).map((l) => ({ name: l.name, colour: l.colour })), lanesH, pct,
      scrub: String(dur ? Math.round((t / dur) * 1000) : 0),
      onScrub: (e) => { if (!v || !T) return; v.setLive(false); v.pause(); v.setTime((Number(e.target.value) / 1000) * dur); this.setState({ playing: false, tick: Math.round(v.t / 100) }); },
      bootOpen: S.boot, skipBoot: () => this.setState({ boot: false }),
      bootLog: [
        ['Event Store', runs.length + ' przebiegów', 0.5], ['Renderer sceny', v ? (v.backend === 'webgl' ? 'WebGL' : 'Canvas 2D') : '—', 0.9],
        ['Model zdarzeń', Object.keys(this._sum).length ? 'zdarzenia → akcje' : 'gotowy', 1.3], ['Przestrzeń robocza', Object.keys(this._sum).reduce((n, k) => n + this._sum[k].files, 0) + ' plików', 1.7], ['Zespół agentów', 'gotowy do pracy', 2.1],
      ].map((x) => ({ text: x[0] + ' · ' + x[1], ok: 'OK', d: x[2] + 's' })),
      introOpen, introClosable: !!T, closeIntro: () => this.setState({ intro: false }),
      taskText: S.task, onTask: (e) => this.setState({ task: e && e.target ? e.target.value : '' }),
      matchNote: !S.task.trim() ? 'Wpisz zadanie albo wybierz zapisany przebieg.' : S.task === F.title ? 'Odtwarzam zapisany przebieg tego zadania.' : matched ? 'Najbliższy zapisany przebieg: ' + mname + '.' : S.note || 'Brak podobnego przebiegu — wybierz jeden z kart poniżej.',
      launch: () => { const m = S.task === F.title ? S.run : this.match(S.task); if (m) this.open(m, S.task); else this.setState({ note: 'Brak podobnego przebiegu' }); },
      runs: runRows,
      onFile: (e) => {
        const f = e && e.target && e.target.files && e.target.files[0];
        if (!f) return;
        const rd = new FileReader();
        rd.onload = () => {
          const res = NW.parseJsonl(String(rd.result || ''));
          if (!res.events.length) { this.setState({ note: 'Brak poprawnych zdarzeń w pliku' }); return; }
          this._custom = res.events;
          this.setState({ note: res.events.length + ' zdarzeń' + (res.errors.length ? ', odrzucono ' + res.errors.length : '') });
          this.open('custom');
        };
        rd.readAsText(f);
      },
      reportOpen, report, closeReport: () => this.setState({ report: false }),
      replay: () => { if (!v) return; v.setTime(0); v.play(); this.setState({ report: false, playing: true, idx: -1 }); },
    };
  }
}
