// one-off: splice the mission-control template and add its renderVals data (kept for the record)
import fs from 'node:fs';
const F = 'project/Main.dc.html';
let s = fs.readFileSync(F, 'utf8');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 90)); s = s.replace(a, b); };
let tpl = fs.readFileSync('tools/template-mc.html', 'utf8').replace(/\n+$/, '');
tpl = tpl.replace('<div class="mc-hudT">', '<div id="hm-hud-top" class="mc-hudT">').replace('<div class="mc-hudL" aria-label="Odczyty sceny">', '<div id="hm-hudL" class="mc-hudL" aria-label="Odczyty sceny">').replace('<div class="mc-hudR">', '<div id="hm-hudR" class="mc-hudR">').replace('<div class="mc-hudB">', '<div id="hm-hud-bot" class="mc-hudB">');
const a = s.indexOf('<x-dc>') + '<x-dc>'.length;
const b = s.indexOf('</x-dc>');
s = s.slice(0, a) + '\n' + tpl + '\n' + s.slice(b);
s = s.replace('"$preview":{"width":1440,"height":1520}', '"$preview":{"width":1440,"height":1640}');

// safe area: HUD columns instead of side panels
rep(`      ['hm-sideL', 'hm-sideR'].forEach((id) => {
        const a = document.getElementById(id) && document.getElementById(id).getBoundingClientRect();
        if (!ov(a)) return;
        if (a.left + a.width / 2 < hr.left + W / 2) tgt.l = Math.max(tgt.l, a.right - hr.left + 10);
        else tgt.r = Math.min(tgt.r, a.left - hr.left - 10);
      });`, `      ['hm-hudL', 'hm-hudR'].forEach((id) => {
        const el = document.getElementById(id);
        const a = el && el.getBoundingClientRect();
        if (!ov(a) || (el.children && el.children.length === 0)) return;
        if (a.left + a.width / 2 < hr.left + W / 2) tgt.l = Math.max(tgt.l, a.right - hr.left + 6);
        else tgt.r = Math.min(tgt.r, a.left - hr.left - 6);
      });`);
rep("view: '3d', tab: 'feed', anTab: -1, orbit: true };", "view: '3d', tab: 'files', anTab: -1, orbit: true };");
rep("      tabFeed: S.tab === 'feed',\n      tabFiles: S.tab === 'files',", "      tabFeed: false,\n      tabFiles: S.tab !== 'decs',");

// cockpit data for the mission-control chrome
rep(`    return {
      agentChips,`, `    // ---------- mission-control chrome ----------
    const bucketN = 20;
    const hist = new Array(bucketN).fill(0);
    const kindAt = new Array(bucketN).fill('');
    P.ev.forEach((e) => { const bi = Math.min(bucketN - 1, Math.floor(e.t / (DUR / bucketN))); hist[bi]++; if (e.t <= t) kindAt[bi] = e.kind; });
    const peak = Math.max(1, Math.max.apply(null, hist));
    const histBars = hist.map((n, i) => {
      const past = (i + 1) * (DUR / bucketN) <= t;
      const cur = !past && i * (DUR / bucketN) <= t;
      const col = kindAt[i] ? KIND[kindAt[i]].color : '#7CC4FF';
      return { h: f1((n / peak) * 100), color: past || cur ? col : '#2A3560', op: past ? 0.85 : cur ? 1 : 0.5 };
    });
    const seenByLine = {};
    seen.forEach((e) => { const ag = P.byId[e.from]; const k = ag ? ag.line : 'H'; seenByLine[k] = (seenByLine[k] || 0) + 1; });
    const perLine = P.order.map((l) => { const n = seenByLine[l] || 0; const pct = msgCount ? Math.round((n / msgCount) * 100) : 0; return { letter: l, name: LINE[l].name, color: NEON[l], pct, pctLabel: pct + '%' }; });
    const inFlight = seen.filter((e) => t - e.t < FLIGHT).length;
    const tickerSrc = seen.slice(-8);
    const tickerItems = (tickerSrc.length ? tickerSrc : P.ev.slice(0, 6)).map((e) => { const f = who(e.from); const to = who(e.to); return { time: mmss(e.t), from: f.name, fromColor: f.color, to: to.name, toColor: to.color, kind: KIND[e.kind].label, kindColor: KIND[e.kind].color, text: e.text.length > 110 ? e.text.slice(0, 109) + '…' : e.text }; });
    const progressPct = Math.round((t / DUR) * 100) + '%';
    const hudRows = [
      { label: 'Hermes', value: HUB_STATUS[phase], color: GOLD },
      { label: 'agenci w orbicie', value: vis.length + ' / ' + P.agents.length, color: '#7CC4FF' },
      { label: 'pracuje teraz', value: String(working), color: '#5CFFB1' },
      { label: 'impulsy w locie', value: String(inFlight), color: '#FFB48A' },
      { label: 'synapsy', value: String(synapses), color: '#D6BEFF' },
      { label: 'pliki · decyzje', value: visFiles.length + ' · ' + visDecs.length, color: '#9FE3FF' },
    ];
    const roleOf = (a) => (a.name && a.name !== a.short ? a.name : LINE[a.line].name);
    const agentTabs = [{ id: 'hermes', name: 'Hermes', mono: 'H', role: 'dyspozytor · orkiestrator', color: GOLD, status: HUB_STATUS[phase], stColor: GOLD }].concat(
      A.map((x) => ({ id: x.a.id, name: x.a.short, mono: x.a.mono, role: x.visible ? roleOf(x.a) : 'oczekuje na powołanie', color: x.visible ? NEON[x.a.line] : '#2A3560', status: x.visible ? STATUS[x.st].label : 'w kolejce', stColor: !x.visible ? '#6F7BA6' : x.st === 'wait' ? STATUS.wait.color : NEON[x.a.line], visible: x.visible }))
    ).map((c) => ({
      pick: c.visible === false ? () => {} : pickNode(c.id),
      hov: () => { this._hover = c.id; },
      unhov: () => { this._hover = null; },
      sel: selId === c.id,
      bg: selId === c.id ? 'rgba(242,193,78,0.1)' : '#070B18',
      border: selId === c.id ? GOLD : '#1A2340',
      line: selId === c.id ? GOLD : 'rgba(0,0,0,0)',
      color: c.color,
      glow: hexA(c.color === '#2A3560' ? '#070B18' : c.color, 0.5),
      mono: c.mono,
      name: c.name,
      role: c.role,
      status: c.status,
      stColor: c.stColor,
    }));
    const gtabs = [['files', 'Pliki', visFiles.length], ['decs', 'Decyzje', visDecs.length]].map((d) => {
      const on = (S.tab === 'decs') === (d[0] === 'decs');
      return { label: d[1], count: d[2], active: on, border: on ? GOLD : '#2A3560', color: on ? '#E8ECF8' : '#8E9ABF', bg: on ? 'rgba(242,193,78,0.12)' : 'transparent', pick: () => this.setState({ tab: d[0] }) };
    });
    const selKindLabel = selKind === 'hermes' ? 'rdzeń' : selKind === 'agent' ? 'agent' : selKind === 'file' ? 'plik' : selKind === 'decision' ? 'decyzja' : 'raport';

    return {
      tickerItems,
      progressPct,
      phaseName: PH_SHORT[Math.min(phase, 3)].toLowerCase(),
      workingNow: working + ' / ' + vis.length,
      speedLabel: S.speed + '×',
      msgCount: String(msgCount),
      peakRate: String(peak),
      inFlight: String(inFlight),
      histBars,
      histHead: f1((t / DUR) * 100),
      perLine,
      kindLegend: ['assign', 'question', 'critique', 'revision', 'approve'].map((k) => ({ label: KIND[k].label, color: KIND[k].color })),
      hudRows,
      selKindLabel,
      hermesStatus: HUB_STATUS[phase],
      agentTabs,
      gtabs,
      filesCount: String(visFiles.length),
      decsCount: String(visDecs.length),
      synCount: String(synapses),
      qualityLabel: this._q >= 2 ? 'pełna' : this._q === 1 ? 'średnia' : 'oszczędna',
      statusBorder: S.playing ? GOLD : '#2A3560',
      statusColor: S.playing ? GOLD : '#A3AED0',
      liveClass: S.playing ? 'mc-live' : '',
      agentChips,`);
rep("      statusDot: S.playing ? GOLD : '#7F8BB3',", "      statusDot: S.playing ? GOLD : '#5F6D9F',");
// inspector extras
rep("        hasLast: !!lastMsg,\n        lastTime: lastMsg ? mmss(lastMsg.t) : '',\n        lastText: lastMsg ? lastMsg.text : '',\n      };", "        hasLast: !!lastMsg,\n        lastTime: lastMsg ? mmss(lastMsg.t) : '',\n        lastText: lastMsg ? lastMsg.text : '',\n        glow: hexA(a.color, 0.45),\n        prog: f1(selAgent.prog * 100),\n      };");
rep("let ins = { color: GOLD, mono: '', name: '', line: '', tier: '', status: '', statusColor: GOLD, why: '', tools: [], bar1: '#34406B', bar2: '#34406B', bar3: '#34406B', hasLast: false, lastTime: '', lastText: '' };", "let ins = { color: GOLD, mono: '', name: '', line: '', tier: '', status: '', statusColor: GOLD, why: '', tools: [], bar1: '#34406B', bar2: '#34406B', bar3: '#34406B', hasLast: false, lastTime: '', lastText: '', glow: 'rgba(0,0,0,0)', prog: 0 };");
rep("let fi = { color: '#9FE3FF', kind: '', name: '', summary: '', ownerColor: GOLD, owner: '', time: '', hasVer: false, ver: '', preview: [], hasFrom: false, from: [] };", "let fi = { color: '#9FE3FF', kind: '', name: '', summary: '', ownerColor: GOLD, owner: '', time: '', hasVer: false, ver: '', preview: [], hasFrom: false, from: [], glow: 'rgba(0,0,0,0)' };");
rep("fi = { color: selNode.color, kind: d.kind,", "fi = { glow: hexA(selNode.color, 0.4), color: selNode.color, kind: d.kind,");
// feed log colours: agents in NEON palette for consistency with the scene
rep("      const a = P.byId[id];\n      return { name: a.short, color: a.color };\n    };\n    const feed", "      const a = P.byId[id];\n      return { name: a.short, color: NEON[a.line] };\n    };\n    const feed");
fs.writeFileSync(F, s);
console.log('mc template spliced');
