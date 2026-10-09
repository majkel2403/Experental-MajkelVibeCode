// one-off: adapt Component + cockpit data to the orbital engine (kept for the record)
import fs from 'node:fs';
const F = 'project/Main.dc.html';
let s = fs.readFileSync(F, 'utf8');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 90)); s = s.replace(a, b); };

rep(`    if (sn && this._sceneT >= sn.spawn) {
      nodePos(m, sn, this._sceneT, TMP3);
      gx = TMP3[0] * 0.8; gy = TMP3[1] * 0.8; gz = TMP3[2] * 0.8;
      zt = cam.zoomT * 1.3;
    }`, `    posAt(m, this._sceneT, this._clock);
    if (sn && this._sceneT >= sn.spawn) {
      gx = m.P[sn.i * 3] * 0.7; gy = m.P[sn.i * 3 + 1] * 0.7; gz = m.P[sn.i * 3 + 2] * 0.7;
      zt = Math.min(cam.zoomT * 1.2, 1.9);
    }`);
rep(`    cam.dist = 380 / cam.zoom;
    cam.pitch = 0.42 + cam.dpitch;
    cam.yaw = 0.55 + this._orbitAngle + cam.dyaw;`, `    const ci = rm ? { zoom: 1, pitch: 0, yaw: 0 } : camIntro(this._sceneT);
    cam.dist = 380 / (cam.zoom * ci.zoom);
    cam.pitch = 0.42 + cam.dpitch + ci.pitch;
    cam.yaw = 0.55 + this._orbitAngle + cam.dyaw + ci.yaw;`);
rep("zoomIn: () => { this._cam.zoomT = clamp(this._cam.zoomT * 1.2, 0.6, 2.6); },", "zoomIn: () => { this._cam.zoomT = clamp(this._cam.zoomT * 1.2, 0.6, 1.8); },");
rep("zoomOut: () => { this._cam.zoomT = clamp(this._cam.zoomT / 1.2, 0.6, 2.6); },", "zoomOut: () => { this._cam.zoomT = clamp(this._cam.zoomT / 1.2, 0.6, 1.8); },");
// cockpit: files count from their first attachment, decision chips only for files that exist
rep("const selKind = selAgent ? 'agent' : selNode && t >= selNode.spawn ? selNode.kind : 'hermes';", "const selKind = selAgent ? 'agent' : selNode && t >= bornAt(selNode) ? selNode.kind : 'hermes';");
rep("const visFiles = m3.nodes.filter((n) => n.kind === 'file' && t >= n.spawn);", "const fileBorn = {};\n    m3.nodes.forEach((n) => { if (n.kind === 'file') fileBorn[n.file.name] = n.born; });\n    const bornFiles = (names) => names.filter((nm) => fileBorn[nm] == null || t >= fileBorn[nm]);\n    const visFiles = m3.nodes.filter((n) => n.kind === 'file' && t >= bornAt(n));");
rep("const visDecs = m3.nodes.filter((n) => n.kind === 'decision' && t >= n.spawn);", "const visDecs = m3.nodes.filter((n) => n.kind === 'decision' && t >= bornAt(n));");
rep("title: d.title, why: d.why, files: d.files.map((name) => ({ name })) };\n    });", "title: d.title, why: d.why, files: bornFiles(d.files).map((name) => ({ name })) };\n    });");
rep("di = { time: mmss(d.t), title: d.title, why: d.why, files: d.files.map((name) => ({ name })), agents:", "di = { time: mmss(d.t), title: d.title, why: d.why, files: bornFiles(d.files).map((name) => ({ name })), agents:");
// warm every scenario's model off the critical path
rep("    if (typeof window !== 'undefined' && window.__HM_TEST) window.__HM_TEST.logic = this;\n    this.stick();", "    if (typeof window !== 'undefined' && window.__HM_TEST) window.__HM_TEST.logic = this;\n    this.stick();\n    this._warm = setTimeout(() => { SCEN.forEach((sc, i) => setTimeout(() => prep3d(sc), 120 * i)); }, 500);");
rep("    cancelAnimationFrame(this._raf);\n    clearTimeout(this._toast);", "    cancelAnimationFrame(this._raf);\n    clearTimeout(this._toast);\n    clearTimeout(this._warm);");
fs.writeFileSync(F, s);
console.log('component patched');
