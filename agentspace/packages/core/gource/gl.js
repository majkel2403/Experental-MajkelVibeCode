// WebGL backend for a Gource frame: one textured-quad program (normal alpha blending, like Gource's
// GL_SRC_ALPHA / GL_ONE_MINUS_SRC_ALPHA) and one bloom program (additive GL_ONE / GL_ONE).
// Textures are generated here (a shaded sphere for files, an avatar for users, a beam profile).

// Sprite textures, generated (Gource ships file.png / user.png / beam.png; ours are drawn to look the same):
//   file: a shaded ball lit from the upper left; user: head and bell-shaped shoulders (the 384×512 sprite
//   stretched into a square texture); beam: alpha rising and falling across its width.
// Like Gource, file and user textures are mipmapped so that tiny files and avatars stay soft round dots.
export const TEX = { file: 256, user: 256, beam: 128 };
const lerpT = (tab, x) => {
  if (x <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) { const [x0, y0] = tab[i - 1]; const [x1, y1] = tab[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  return tab[tab.length - 1][1];
};
// half width of Gource's avatar body per height (fractions of the sprite width / height)
const BODY = [[0.48, 0.15], [0.5, 0.177], [0.531, 0.206], [0.563, 0.237], [0.594, 0.266], [0.625, 0.295], [0.656, 0.32], [0.688, 0.341], [0.719, 0.352], [0.781, 0.352], [0.813, 0.332], [0.844, 0.271], [0.865, 0.17], [0.875, 0]];

export function makeTextures() {
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const img = (w, h, fn) => {
    const px = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const [v, a] = fn((x + 0.5) / w, (y + 0.5) / h);
      const o = (y * w + x) * 4;
      px[o] = px[o + 1] = px[o + 2] = Math.round(clamp01(v) * 255); px[o + 3] = Math.round(clamp01(a) * 255);
    }
    return { w, h, px };
  };
  // ball in sprite pixels (cx, cy, r), shade falls off from the highlight up-left
  const ball = (x, y, cx, cy, r) => {
    const dx = (x - cx) / r; const dy = (y - cy) / r; const d = Math.hypot(dx, dy);
    return [Math.max(0.5, 0.9 - 0.19 * Math.hypot(dx + 0.25, dy + 0.3)), clamp01((1 - d) * r * 0.9)];
  };
  const file = img(TEX.file, TEX.file, (u, v) => ball(u * 256, v * 256, 128, 128, 256 * 0.47));
  const user = img(TEX.user, TEX.user, (u, v) => {
    const W = 384; const H = 512; const x = u * W; const y = v * H;
    let [hv, ha] = ball(x, y, 0.5 * W, 0.3 * H, 0.284 * W);
    hv = Math.min(hv, 0.89);
    const half = lerpT(BODY, v) * W;
    const ba = v < 0.48 || v > 0.875 ? 0 : clamp01(half - Math.abs(x - W / 2));
    const ty = clamp01((v - 0.48) / 0.395);
    const bv = (0.7 - 0.19 * ty) * (u < 0.6 ? 1 : 1 - 1.1 * (u - 0.6));
    const a = ha + ba * (1 - ha);
    return [a > 0 ? (hv * ha + bv * ba * (1 - ha)) / a : 0, a];
  });
  const beam = img(TEX.beam, 1, (u) => [1, 1 - Math.abs(u * 2 - 1)]);
  return { file, user, beam };
}

const VS = `attribute vec2 p; attribute vec2 uv; attribute vec4 c; uniform vec2 res; varying vec2 vuv; varying vec4 vc;
void main(){ vuv = uv; vc = c; gl_Position = vec4(p.x / res.x * 2.0 - 1.0, 1.0 - p.y / res.y * 2.0, 0.0, 1.0); }`;
const FS = `precision mediump float; uniform sampler2D tex; varying vec2 vuv; varying vec4 vc;
void main(){ vec4 t = texture2D(tex, vuv); gl_FragColor = vec4(vc.rgb * t.rgb, vc.a * t.a); }`;
// Gource's bloom: a dithered cosine falloff around each directory, added on top
const BVS = `attribute vec2 p; attribute vec3 l; attribute vec3 c; uniform vec2 res; varying vec3 vl; varying vec3 vc;
void main(){ vl = l; vc = c; gl_Position = vec4(p.x / res.x * 2.0 - 1.0, 1.0 - p.y / res.y * 2.0, 0.0, 1.0); }`;
const BFS = `precision highp float; varying vec3 vl; varying vec3 vc;
void main(){
  vec2 pos = vl.xy; float R = vl.z;
  float r = fract(sin(dot(pos, vec2(11.3713, 67.3219))) * 2351.3718);
  float offset = (0.5 - r) * R * 0.045;
  float intensity = min(1.0, cos((length(pos * 2.0) + offset) / R));
  float g = intensity * smoothstep(0.0, 2.0, intensity);
  g *= smoothstep(1.0, 0.67 + r * 0.33, 1.0 - intensity);
  gl_FragColor = vec4(vc * max(g, 0.0), 1.0);
}`;

export function createGL(canvas) {
  let gl = null;
  try { gl = canvas.getContext('webgl', { alpha: false, antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: true }); } catch (e) { gl = null; }
  if (!gl) return null;
  const prog = (vs, fs) => {
    const sh = (type, src) => { const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  };
  const T = makeTextures();
  let P1; let P2; let texs; let buf; let bbuf; let loc; let bloc;
  const upload = (t, mip) => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, t.w, t.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(t.px.buffer));
    if (mip) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  };
  // GPU resources; created again when the browser restores a lost context (tab in background, GPU reset)
  const init = () => {
    P1 = prog(VS, FS); P2 = prog(BVS, BFS);
    texs = { file: upload(T.file, true), user: upload(T.user, true), beam: upload(T.beam, false) };
    buf = gl.createBuffer();
    bbuf = gl.createBuffer();
    loc = { p: gl.getAttribLocation(P1, 'p'), uv: gl.getAttribLocation(P1, 'uv'), c: gl.getAttribLocation(P1, 'c'), res: gl.getUniformLocation(P1, 'res'), tex: gl.getUniformLocation(P1, 'tex') };
    bloc = { p: gl.getAttribLocation(P2, 'p'), l: gl.getAttribLocation(P2, 'l'), c: gl.getAttribLocation(P2, 'c'), res: gl.getUniformLocation(P2, 'res') };
  };
  try { init(); } catch (e) { return null; }
  let lost = false;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
  canvas.addEventListener('webglcontextrestored', () => { try { init(); lost = false; } catch (e) { lost = true; } });
  let V = new Float32Array(8 * 6 * 4096);
  let B = new Float32Array(8 * 6 * 512);
  let n = 0;
  const UV = { file: [0, 0, 1, 1], user: [0, 0, 1, 1], beam: [0, 0, 1, 1] };
  // draw ranges: [first vertex, texture]; consecutive quads with the same texture share one draw call
  let ranges = [];
  const useTex = (t) => { if (!ranges.length || ranges[ranges.length - 1][1] !== t) ranges.push([n, t]); };
  const vtx = (x, y, u, v, r, g, b, a) => {
    if (n * 8 + 8 > V.length) { const nv = new Float32Array(V.length * 2); nv.set(V); V = nv; }
    const o = n * 8; V[o] = x; V[o + 1] = y; V[o + 2] = u; V[o + 3] = v; V[o + 4] = r; V[o + 5] = g; V[o + 6] = b; V[o + 7] = a; n++;
  };
  // quad from 4 corners (a b c d in order) with per-corner uv and colour
  const quad = (q, uv, c) => {
    vtx(q[0], q[1], uv[0], uv[1], c[0], c[1], c[2], c[3]); vtx(q[2], q[3], uv[2], uv[3], c[4], c[5], c[6], c[7]); vtx(q[4], q[5], uv[4], uv[5], c[8], c[9], c[10], c[11]);
    vtx(q[0], q[1], uv[0], uv[1], c[0], c[1], c[2], c[3]); vtx(q[4], q[5], uv[4], uv[5], c[8], c[9], c[10], c[11]); vtx(q[6], q[7], uv[6], uv[7], c[12], c[13], c[14], c[15]);
  };
  const rect = (x, y, w, h, t, r, g, b, a) => {
    const u = UV[t];
    quad([x, y, x + w, y, x + w, y + h, x, y + h], [u[0], u[1], u[2], u[1], u[2], u[3], u[0], u[3]], [r, g, b, a, r, g, b, a, r, g, b, a, r, g, b, a]);
  };
  const bu = UV.beam; const bv = 0.5;

  function draw(F, W, H, dpr, bg) {
    if (lost || gl.isContextLost()) return;
    const cw = Math.round(W * dpr); const ch = Math.round(H * dpr);
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    gl.viewport(0, 0, cw, ch);
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    n = 0;
    ranges = [];
    useTex('beam');
    // edges: shadow pass (+2 px), then the lines, 2.5 px half width with the beam profile across
    for (let pass = 0; pass < 2; pass++) {
      for (const e of F.edges) {
        for (let i = 0; i + 6 < e.length; i += 6) {
          const x1 = e[i]; const y1 = e[i + 1]; const x2 = e[i + 6]; const y2 = e[i + 7];
          let px = -(y1 - y2); let py = x1 - x2; const l = Math.hypot(px, py) || 1;
          px = px / l * 2.5; py = py / l * 2.5;
          const o = pass === 0 ? 2 : 0;
          const c1 = pass === 0 ? [0, 0, 0, e[i + 5] * 0.5] : [e[i + 2], e[i + 3], e[i + 4], e[i + 5]];
          const c2 = pass === 0 ? [0, 0, 0, e[i + 11] * 0.5] : [e[i + 8], e[i + 9], e[i + 10], e[i + 11]];
          quad([x1 + px + o, y1 + py + o, x1 - px + o, y1 - py + o, x2 - px + o, y2 - py + o, x2 + px + o, y2 + py + o],
            [bu[2], bv, bu[0], bv, bu[0], bv, bu[2], bv], [...c1, ...c1, ...c2, ...c2]);
        }
      }
    }
    useTex('file');
    for (const f of F.files) rect(f.x - f.size / 2 + f.shadow, f.y - f.size / 2 + f.shadow, f.size, f.size, 'file', 0, 0, 0, f.a * 0.5);
    useTex('beam');
    for (const b of F.beams) {
      const [r, g, bb] = b.col; const a = b.a; const a2 = a * 0.1;
      quad(b.q, [bu[0], bv, bu[0], bv, bu[2], bv, bu[2], bv], [r, g, bb, a2, r, g, bb, a2, r, g, bb, a, r, g, bb, a]);
    }
    useTex('file');
    for (const f of F.files) rect(f.x - f.size / 2, f.y - f.size / 2, f.size, f.size, 'file', f.col[0], f.col[1], f.col[2], f.a);
    useTex('user');
    for (const u of F.users) rect(u.x - u.w / 2 + u.shadow, u.y - u.h / 2 + u.shadow, u.w, u.h, 'user', 0, 0, 0, u.a * 0.5);
    for (const u of F.users) rect(u.x - u.w / 2, u.y - u.h / 2, u.w, u.h, 'user', u.col[0], u.col[1], u.col[2], u.a);

    gl.enable(gl.BLEND);
    gl.useProgram(P1);
    gl.uniform2f(loc.res, W, H);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(loc.tex, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, V.subarray(0, n * 8), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(loc.p); gl.vertexAttribPointer(loc.p, 2, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(loc.uv); gl.vertexAttribPointer(loc.uv, 2, gl.FLOAT, false, 32, 8);
    gl.enableVertexAttribArray(loc.c); gl.vertexAttribPointer(loc.c, 4, gl.FLOAT, false, 32, 16);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (let r = 0; r < ranges.length; r++) {
      const first = ranges[r][0]; const end = r + 1 < ranges.length ? ranges[r + 1][0] : n;
      if (end <= first) continue;
      gl.bindTexture(gl.TEXTURE_2D, texs[ranges[r][1]]);
      gl.drawArrays(gl.TRIANGLES, first, end - first);
    }
    gl.disableVertexAttribArray(loc.uv);

    // bloom
    let m = 0;
    const need = F.blooms.length * 6 * 8;
    if (B.length < need) B = new Float32Array(need * 2);
    const bv8 = (x, y, lx, ly, R, c) => { const o = m * 8; B[o] = x; B[o + 1] = y; B[o + 2] = lx; B[o + 3] = ly; B[o + 4] = R; B[o + 5] = c[0]; B[o + 6] = c[1]; B[o + 7] = c[2]; m++; };
    for (const b of F.blooms) {
      const R = b.R; const Rw = b.Rw;
      const c = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
      for (const [i, j] of c) bv8(b.x + i * R, b.y + j * R, i * Rw, j * Rw, Rw, b.col);
    }
    if (m) {
      gl.useProgram(P2);
      gl.uniform2f(bloc.res, W, H);
      gl.bindBuffer(gl.ARRAY_BUFFER, bbuf);
      gl.bufferData(gl.ARRAY_BUFFER, B.subarray(0, m * 8), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(bloc.p); gl.vertexAttribPointer(bloc.p, 2, gl.FLOAT, false, 32, 0);
      gl.enableVertexAttribArray(bloc.l); gl.vertexAttribPointer(bloc.l, 3, gl.FLOAT, false, 32, 8);
      gl.enableVertexAttribArray(bloc.c); gl.vertexAttribPointer(bloc.c, 3, gl.FLOAT, false, 32, 20);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.drawArrays(gl.TRIANGLES, 0, m);
      gl.disableVertexAttribArray(bloc.l);
    }
  }
  return { kind: 'webgl', draw, isLost: () => lost };
}
