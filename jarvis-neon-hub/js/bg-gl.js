/* =========================================================
   JARVIS OS — tło WebGL2 „nocna scena” (Neon Holo-Glass, Faza 3A)

   Aktywne tylko przy #app[data-wall=neon]. Scena w jednym fragment shaderze: niebo, gwiazdy, sylwetka miasta ze świecącymi oknami,
   perspektywiczna siatka-podłoga, mgła (tekstura szumu 256², nie fbm), ziarno i winieta. Kolory z ustawień (accent/accent2), kolor
   siatki i poświaty horyzontu z --glow-state (J.fxd.glow); prędkość siatki z aktywności agenta (J.fxd.actOut), fala po realnym impulsie
   fx-director (J.fxd.pulseAt). Statyczne warstwy (niebo, gwiazdy, miasto) wypiekamy raz do tekstury przy zmianie rozmiaru/kolorów/horyzontu —
   w klatce liczymy tylko siatkę, mgłę, migotanie i post. Chromatic aberration: osobny przebieg z FBO, wyłącznie w cinema i tylko przez ~0,9 s
   przez ~200 ms po realnej porażce (fx-director: task.failed bez degradacji, tool/model.failed, security.injection; nigdy przez ponowne liczenie sceny).
   Pętli rAF nie ma: J.bgGl.frame(now, covered) woła istniejąca pętla main.js (po jej dławieniu w bezczynności i pauzie w tle).
   Fallbacki: brak WebGL2 / błąd shadera / renderer programowy (failIfMajorPerformanceCaveat → null) / utrata kontekstu / forced-colors /
   prefers-contrast → klasa .bg-fb na #app (statyczny gradient CSS, zero pętli). Parametr ?glcaveat=0 (tylko testy e2e) omija caveat.
   ========================================================= */
'use strict';
(() => {
const B = J.bgGl = { scale: .65, held: false, failed: false, lost: false, err: '', jsMs: 0, mode: 'off', W: 0, H: 0, hz: .36, draws: 0, bakes: 0, par: [0, 0] };   // par: paralaksa kursora −1…1 (J.cin), tylko cinema
const A = () => J.$?.('#app') || document.querySelector('#app');
const rank = () => J.fx?.rank?.() ?? 2;   // przed main.js (testy) zachowuj się jak „standard”
const MQ = (() => { try { return matchMedia('(forced-colors: active), (prefers-contrast: more)'); } catch (e) { return { matches: false }; } })();
const CAVEAT = (() => { try { return !/[?&]glcaveat=0(?:&|$)/.test(location.search); } catch (e) { return true; } })();   // tylko e2e z SwiftShaderem

/* czysta logika wyboru trybu (testowana bez GL): off = nie dotyczy tapety, fb = gradient CSS, pause = karta w tle, still = jedna klatka, run = animacja */
B.plan = i => i.wall !== 'neon' ? 'off' : i.fb ? 'fb' : i.hidden ? 'pause' : (i.rank < 2 || i.focus || i.present || i.hold) ? 'still' : 'run';
B.scaleFor = (s, narrow) => Math.min(1, Math.max(.3, narrow ? Math.min(s, .5) : s));   // ≤ 640 px: skala ≤ 0,5
B.setScale = s => { s = +s; if (!(s > 0)) return B.scale; const v = Math.round(Math.min(1, Math.max(.3, s)) * 100) / 100; if (v !== B.scale) { B.scale = v; sizeDirty = true; } return B.scale; };
/* prędkość przesuwu siatki: w spoczynku (aktywność ≤ 0,1) prawie stoi (dryf .04), rośnie z realną aktywnością agenta (cinema szybciej) */
B.gridSpeed = (act, rk) => .04 + Math.max(0, act - .1) * (rk >= 3 ? 1.6 : .5);
B.still = () => { B.held = true; };      // dla regulatora (3C): zatrzymaj animację, zostaw ostatnią klatkę
B.resume = () => { B.held = false; };
Object.defineProperty(B, 'active', { get: () => !!gl && !B.lost && (B.mode === 'run' || B.mode === 'still') });
B.gpuMs = () => { timing = true; return gpuMs; };   // pierwsze wywołanie włącza pomiar (EXT_disjoint_timer_query_webgl2); null, gdy rozszerzenia brak albo brak wyniku

const VS = '#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0,1);}';
const HEAD = '#version 300 es\nprecision highp float;\nuniform vec2 uRes; uniform vec3 uAcc,uAcc2; uniform float uHz,uZone;\nout vec4 o;\nfloat h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}\n';
/* wypiek: niebo + gwiazdy + miasto + poświata podłogi; rgb = kolor/2 (zapas na HDR), a = faza migotania gwiazdy/okna (0 = nie migocze).
   Strefa Orba (środek ekranu): budynki niższe i okna przygaszone, żeby skyline nie konkurował z rdzeniem. */
const BAKE = HEAD + `void main(){
  vec2 q=gl_FragCoord.xy/uRes; float asp=uRes.x/uRes.y; vec2 p=(q-vec2(.5,uHz))*vec2(asp,1.); vec3 col=vec3(0.); float ph=0.;
  if(p.y>=0.){
    float s=clamp(p.y/(1.-uHz),0.,1.);
    col=mix(mix(uAcc*.30,uAcc2*.35,.55),vec3(.004,.006,.03),pow(s,.45))+uAcc*exp(-p.y*9.)*.28;
    vec2 sp=q*vec2(asp,1.)*70.; vec2 id=floor(sp); float r=h21(id); vec2 c=fract(sp)-.5+vec2(h21(id+3.1)-.5,h21(id+7.7)-.5)*.5;
    float st=step(.965,r)*(1.-smoothstep(0.,.12,length(c)))*smoothstep(0.,.25,p.y);
    if(st>0.){col+=vec3(.7,.85,1.)*st; ph=.2+.8*h21(id+9.1);}
    float cx=p.x*26.,ic=floor(cx),u=abs(q.x-.5),mid=mix(.28,1.,smoothstep(uZone*.3,uZone*1.7,u));
    float bh=(.018+.085*h21(vec2(ic,3.)))*mid;
    if(p.y<bh){
      vec2 w=floor(vec2(p.x*160.,p.y*220.)); float lit=step(.88,h21(w+ic))*step(.35,fract(cx)*(1.-fract(cx))*4.)*mix(.3,1.,smoothstep(uZone*.3,uZone*1.7,u));
      col=vec3(.004,.006,.02)+mix(uAcc,uAcc2,h21(w))*lit*.55; col+=uAcc*smoothstep(bh-.004,bh,p.y)*.5*mid;
      ph=lit>0.?.2+.8*h21(w+5.5):0.;
    }
  } else col=mix(uAcc*.12,uAcc2*.10,.5)*exp(p.y*7.);
  o=vec4(col*.5,ph);
}`;
/* klatka: wypiek + migotanie + mgła + siatka (tylko pod horyzontem) + linia horyzontu + kursor + winieta/ziarno + tone-mapping */
const FRAME = HEAD + `uniform sampler2D uBake,uFog; uniform vec3 uSt; uniform float uT,uGrid,uPulse,uMk,uAct,uFoot,uOrbR,uPt; uniform vec2 uM,uPar;
void main(){
  vec4 b=texelFetch(uBake,clamp(ivec2(gl_FragCoord.xy-uPar*uRes.y*.006),ivec2(0),ivec2(uRes)-1),0);   // paralaksa: niebo i miasto (daleko) przesuwają się najmniej, mgła bardziej
   vec3 col=b.rgb*2.;
  vec2 q=gl_FragCoord.xy/uRes; float asp=uRes.x/uRes.y; vec2 p=(q-vec2(.5,uHz))*vec2(asp,1.); float ay=abs(p.y);
  if(b.a>0.) col*=.62+.38*sin(uT*1.7+b.a*60.);
  if(ay<.45){ float fg=texture(uFog,vec2(p.x*.55+uT*.006+uPar.x*.02,p.y*1.6-uT*.002-uPar.y*.02)).r; col+=mix(uAcc*.5,uAcc2*.4,fg)*fg*exp(-ay*6.)*.55; }
  if(p.y<0.){
    float z=.30/ay, x=p.x*z; vec2 g=vec2(x*2.2,z*2.2+uGrid); vec2 fw=max(fwidth(g),vec2(1e-4)); vec2 d=abs(fract(g-.5)-.5)/fw;
    float dd=min(d.x,d.y), l=1.-min(dd,1.), halo=exp(-dd*.22)*.30, fade=smoothstep(0.,.20,ay)*exp(-z*.05);
    float wave=exp(-abs(z-uPulse*14.)*1.6)*step(uPulse,2.5);
    col+=uSt*(l*1.5+halo)*fade*(1.+wave*3.)+uAcc2*halo*.25*fade*smoothstep(.3,0.,ay);
    /* odbicie Orba w podłodze (zamiast kanwy reflect()): pionowy pas z falowaniem i prążkami, siła z aktywności agenta; podstawa wiązki = gorąca plama na siatce;
       pierścienie na płaszczyźnie podłogi (perspektywa jak siatka) rozchodzą się od stopy wiązki, po realnym impulsie dochodzi jeden większy */
    float aF=max(uHz-uFoot,.004), px=p.x+sin(ay*95.-uT*1.8)*.0045*(1.+uAct), w=uOrbR*.8;
    float rf=exp(-px*px/(w*w))*smoothstep(0.,.012,ay)*exp(-ay/(uOrbR*1.7))*(.7+.3*sin(ay*230.-uT*2.6))*(.28+uAct*.55);
    vec2 dd2=vec2(p.x/(uOrbR*.62),(ay-aF)/(uOrbR*.13)); float spot=exp(-dot(dd2,dd2));
    float z0=.30/aF, rr=length(vec2(x,z-z0)); float ring=0.;
    for(int i=0;i<3;i++){ float ph=fract(uT*(.1+uAct*.12)+float(i)/3.); float t=(rr-ph*5.5)*3.2; ring+=exp(-t*t)*(1.-ph)*(1.-ph); }
    float tp=(rr-uPulse*9.)*2.4; ring+=exp(-tp*tp)*step(uPulse,1.6)*(1.-uPulse/1.6)*2.;
    col+=mix(uSt,vec3(.75,.9,1.),.35)*rf*.9+mix(uSt,vec3(.85,.95,1.),.6)*spot*(.9+uAct*.5)+uSt*ring*fade*(.35+uAct*.9)*1.4;
  }
  if(uPt>0.){   // pył/cząstki w powietrzu (ustawienie „Cząsteczki”): komórki z hashem, dryf w górę, bez pętli
    vec2 sp=vec2(q.x*asp,q.y)*16.+vec2(0.,-uT*.35); vec2 id=floor(sp); float r=h21(id+1.7); vec2 c=fract(sp)-.5+(vec2(h21(id+4.3),h21(id+8.1))-.5)*.5;
    col+=mix(uAcc,uAcc2,r)*step(.9,r)*exp(-dot(c,c)*70.)*(.55+.45*sin(uT*1.3+r*50.))*.55*uPt;
  }
  col+=uSt*exp(-ay*220.)*1.3;
  vec2 dm=(q-uM)*vec2(asp,1.); col+=uAcc*exp(-dot(dm,dm)*14.)*.12*uMk;
  vec2 v=q-.5; col*=1.-.6*pow(dot(v,v)*2.2,1.3);
  col+=(h21(gl_FragCoord.xy+fract(uT*7.)*91.)-.5)*.04;
  o=vec4(1.-exp(-col*1.35),1);
}`;
/* aberracja chromatyczna z gotowego obrazu (3 próbki), bez ponownego liczenia sceny */
const COMP = '#version 300 es\nprecision highp float;\nuniform vec2 uRes; uniform sampler2D uS; uniform float uK; out vec4 o;\nvoid main(){vec2 q=gl_FragCoord.xy/uRes,off=(q-.5)*uK;o=vec4(texture(uS,q+off).r,texture(uS,q).g,texture(uS,q-off).b,1);}';

/* cząstki (cinema): bezstanowe gl.POINTS — pozycja liczona w vertex shaderze z uT i hasha gl_VertexID, zero buforów i zero JS na cząstkę.
   Trzy rodzaje (podział wg hasha): deszcz danych (kolumny spadają, widoczne tylko część ∝ uRain = realny strumień znaków engine.rain),
   pył atmosferyczny (dryf w górę, liczba ∝ uDust: w spoczynku mało, więcej z aktywnością), iskry (wybuch z Orba po realnym zdarzeniu: uAge/uK od fx-director.sparkAt/K, życie < 0,9 s).
   Blend addytywny, rysowane do tego samego bufora co scena (przed aberracją). Martwe cząstki lądują poza ekranem (obcinane przed rasteryzacją) */
const PVS = `#version 300 es
precision highp float;
uniform vec3 uAcc,uAcc2,uSt; uniform float uT,uRain,uDust,uAge,uK,uAsp,uPs; uniform vec2 uOrb; out vec4 vc;
float h(float n){return fract(sin(n*91.3458)*47453.5453);}
void main(){
  float id=float(gl_VertexID); float a=h(id*1.13+.1),b=h(id*2.17+.7),c=h(id*3.31+1.3),d=h(id*5.07+2.9),e=h(id*7.71+4.1);
  vec2 p=vec2(3.); float sz=1.,al=0.; vec3 col=vec3(1.);
  if(a<.5){
    float y=1.1-fract(d+uT*(.18+c*.35)*(.5+uRain*1.5))*2.2; p=vec2(b*2.-1.,y); sz=2.+c*1.5; al=step(e,uRain)*(.3+.4*c); col=mix(uSt,vec3(.7,.95,1.),.4);
  } else if(a<.85){
    vec2 q=vec2(b,fract(c+uT*.012*(.4+d)))*2.-1.; q.x+=sin(uT*.2+c*20.)*.03; p=q; sz=1.5+d*1.2; al=step(e,uDust)*(.16+.14*sin(uT*1.1+e*40.)); col=mix(uAcc,uAcc2,d);
  } else {
    float ang=b*6.2832, spd=(.12+c*.55)*uK; p=uOrb*2.-1.+vec2(cos(ang)/uAsp,sin(ang))*spd*uAge*2.; p.y-=uAge*uAge*.18; sz=2.+d*2.;
    float lf=clamp(1.-uAge/.9,0.,1.); al=step(e,uK)*lf*lf; col=mix(vec3(1.,.9,.6),uSt,.5);
  }
  if(al<=0.) p=vec2(3.);
  gl_Position=vec4(p,0.,1.); gl_PointSize=max(1.,sz*uPs); vc=vec4(col*al,al);
}`;
const PFS = '#version 300 es\nprecision mediump float;\nin vec4 vc; out vec4 o;\nvoid main(){float f=smoothstep(.5,.05,length(gl_PointCoord-.5));o=vec4(vc.rgb*f,1.);}';

/* budżet cząstek: tylko cinema, nigdy na ≤ 640 px (plan §3: telefon bez cząstek) i tylko przy włączonym ustawieniu „Cząsteczki”; regulator (gov.js) zmniejsza kroki PT_STEPS przed obniżeniem skali rozdzielczości */
const PT_MAX = 6000, PT_STEPS = [1, .5, .25, 0];
B.partIdx = 0; B.partN = 0;
B.partCount = (rk, on, idx, nar) => rk >= 3 && on && !nar ? Math.round(PT_MAX * (PT_STEPS[idx] ?? 0)) : 0;
B.partOn = () => rank() >= 3 && !narrow && J.state?.settings?.particles !== false;
B.partShed = () => { if (!B.partOn() || B.partIdx >= PT_STEPS.length - 1 || !B.partN) return false; B.partIdx++; return true; };
B.partCanGrow = () => B.partOn() && B.partIdx > 0;
B.partGrow = () => { if (!B.partCanGrow()) return false; B.partIdx--; return true; };
B.partReset = () => { B.partIdx = 0; };

/* szum kafelkowy 256² (fbm 4 oktawy z wartościowego szumu na zapętlonej siatce), liczony raz */
const noise = (N = 256) => {
  let s = 1234567; const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const acc = new Float32Array(N * N); let amp = .5;
  for (const f of [4, 8, 16, 32]) {
    const lat = new Float32Array(f * f); for (let i = 0; i < lat.length; i++) lat[i] = rnd();
    for (let y = 0; y < N; y++) {
      const fy = y * f / N, y0 = fy | 0, ty = fy - y0, sy = ty * ty * (3 - 2 * ty), r0 = (y0 % f) * f, r1 = ((y0 + 1) % f) * f;
      for (let x = 0; x < N; x++) {
        const fx = x * f / N, x0 = fx | 0, tx = fx - x0, sx = tx * tx * (3 - 2 * tx), c0 = x0 % f, c1 = (x0 + 1) % f;
        const a = lat[r0 + c0] + (lat[r0 + c1] - lat[r0 + c0]) * sx, b = lat[r1 + c0] + (lat[r1 + c1] - lat[r1 + c0]) * sx;
        acc[y * N + x] += amp * (a + (b - a) * sy);
      }
    }
    amp *= .5;
  }
  let lo = 1e9, hi = -1e9; for (let i = 0; i < acc.length; i++) { if (acc[i] < lo) lo = acc[i]; if (acc[i] > hi) hi = acc[i]; }
  const out = new Uint8Array(N * N * 4), k = 255 / (hi - lo || 1);
  for (let i = 0; i < acc.length; i++) { const v = (acc[i] - lo) * k; out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v; out[i * 4 + 3] = 255; }
  return out;
};
B.noise = noise;

let gl = null, cv = null, P = {}, TX = {}, ext = null, timing = false, gpuMs = null, qPending = null;
let vw = 0, vh = 0, sizeDirty = true, bakeDirty = true, dirty = true, lastKey = -1, lastVer = -1, lastGlow, lastNow = 0, T = 4, grid = 0, tmpAcc = '';
let narrow = false, orbR = .1, footN = .3, zone = .12, orbX = .5, orbY = .55;
const acc = [0, 0, 0], acc2 = [0, 0, 0], st = [0, 0, 0], stT = [0, 0, 0], mouse = [.5, .5];
const parse = (rgbStr, out) => { const a = String(rgbStr).split(','); out[0] = (+a[0] || 0) / 255; out[1] = (+a[1] || 0) / 255; out[2] = (+a[2] || 0) / 255; };

const mk = (fs, vs = VS) => {
  const prog = gl.createProgram();
  for (const [t, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const sh = gl.createShader(t); gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader');
    gl.attachShader(prog, sh);
  }
  gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
  const u = {}, n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) | 0;
  for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(prog, i); u[a.name] = gl.getUniformLocation(prog, a.name); }
  return { prog, u };
};
const mkTex = (w, h, filter, wrap, data) => {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data || null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  return t;
};
const mkFbo = t => { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return f; };
const bindTex = (u, unit, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(u, unit); };

/* programy i tekstury (także po przywróceniu kontekstu) */
const build = () => {
  P = { bake: mk(BAKE), frame: mk(FRAME), comp: mk(COMP), part: mk(PFS, PVS) }; TX = {};
  TX.fog = mkTex(256, 256, gl.LINEAR, gl.REPEAT, noise());
  ext = gl.getExtension?.('EXT_disjoint_timer_query_webgl2') || null; qPending = null; gpuMs = null;
  gl.bindTexture(gl.TEXTURE_2D, null); B.W = B.H = 0; colors(); sizeDirty = true;
};
const ensureGL = () => {
  if (gl || B.failed) return;
  try {
    const app = A(), wp = app?.querySelector('#wallpaper') || app; if (!wp) return;
    cv = document.createElement('canvas'); cv.id = 'bgGl'; cv.setAttribute('aria-hidden', 'true');
    gl = cv.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: CAVEAT });
    if (!gl) throw new Error('webgl2 niedostępne albo renderer programowy');
    cv.addEventListener('webglcontextlost', e => { e.preventDefault(); B.lost = true; lastKey = -1; });
    cv.addEventListener('webglcontextrestored', () => { try { build(); B.lost = false; lastKey = -1; } catch (e) { fail(e); } });
    addEventListener('pointermove', e => { if (vw && rank() >= 3) { mouse[0] = e.clientX / vw; mouse[1] = 1 - e.clientY / vh; } }, { passive: true });
    wp.appendChild(cv); build();
  } catch (e) { fail(e); }
};
const fail = e => { B.failed = true; B.err = String(e && e.message || e); gl = null; try { cv?.remove?.(); } catch (x) { } lastKey = -1; };

/* rozmiar płótna i horyzont — tylko przy zmianie okna / geometrii HUD (nigdy odczyt layoutu w klatce) */
const geometry = () => {
  narrow = vw <= 640;
  const s = B.scaleFor(B.scale, narrow), dpr = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 1) * s;
  const W = Math.max(2, Math.floor(vw * dpr)), H = Math.max(2, Math.floor(vh * dpr));
  if (W !== B.W || H !== B.H) { B.W = W; B.H = H; cv.width = W; cv.height = H; gl.deleteTexture?.(TX.bake); gl.deleteFramebuffer?.(TX.bakeF); gl.deleteTexture?.(TX.cvT); gl.deleteFramebuffer?.(TX.cvF); TX.bake = TX.cvT = TX.cvF = null; TX.bake = mkTex(W, H, gl.NEAREST, gl.CLAMP_TO_EDGE); TX.bakeF = mkFbo(TX.bake); bakeDirty = dirty = true; }
  sizeDirty = false; hzCalc();
};
const hzCalc = () => {
  const sc = J.hud?.scene; let y = sc && sc.H ? (sc.horizon + (sc.top || 0)) / (vh || 1) : .64;
  y = Math.min(narrow ? .66 : .78, Math.max(narrow ? .5 : .35, y)); const hz = Math.round((1 - y) * 1000) / 1000;
  if (hz !== B.hz) { B.hz = hz; bakeDirty = dirty = true; }
  if (sc && sc.H) {   // geometria Orba w jednostkach wysokości ekranu: promień, stopa wiązki (od dołu, zawsze pod horyzontem) i szerokość strefy przygaszenia miasta
    orbX = Math.min(1, Math.max(0, sc.cx / (vw || 1))); orbY = Math.min(1, Math.max(0, 1 - (sc.cy + (sc.top || 0)) / (vh || 1)));   // środek Orba (źródło iskier)
    orbR = Math.max(.02, sc.R / (vh || 1)); footN = Math.min(hz - .02, Math.max(.02, 1 - (sc.foot + (sc.top || 0)) / (vh || 1)));
    const z = Math.round(Math.min(.22, Math.max(.06, sc.R * 1.5 / (vw || 1))) * 200) / 200; if (z !== zone) { zone = z; bakeDirty = dirty = true; }
  }
  lastVer = J.hud?.ver;
};
const colors = () => {
  const s = J.state?.settings || {}; parse(J.rgb(s.accent || '#4df3ff'), acc); parse(J.rgb(s.accent2 || '#ff2bd6'), acc2); bakeDirty = dirty = true;
};
B.refresh = () => { colors(); };
J.on?.('settings', () => { if (gl) colors(); });
addEventListener('resize', () => { vw = innerWidth; vh = innerHeight; sizeDirty = true; });

const bake = () => {
  gl.bindFramebuffer(gl.FRAMEBUFFER, TX.bakeF); gl.viewport(0, 0, B.W, B.H); gl.useProgram(P.bake.prog); const u = P.bake.u;
  gl.uniform2f(u.uRes, B.W, B.H); gl.uniform3f(u.uAcc, acc[0], acc[1], acc[2]); gl.uniform3f(u.uAcc2, acc2[0], acc2[1], acc2[2]); gl.uniform1f(u.uHz, B.hz); gl.uniform1f(u.uZone, zone);
  gl.drawArrays(gl.TRIANGLES, 0, 3); bakeDirty = false; B.bakes++;
};
const draw = (now, run) => {
  if (bakeDirty) bake();
  const dt = lastNow ? Math.min(now - lastNow, 100) / 1000 : 0; lastNow = now;
  const fx = J.fxd, rk = rank(), act = run && fx && fx.actOut > 0 ? fx.actOut : 0;
  if (run) { T += dt; grid += dt * B.gridSpeed(act, rk); }
  const g = fx ? fx.glow : null; if (g !== lastGlow) { lastGlow = g; parse(g || J.rgb(J.state?.settings?.accent || '#4df3ff'), stT); if (!run) { st[0] = stT[0]; st[1] = stT[1]; st[2] = stT[2]; } }
  if (run) { const k = 1 - Math.exp(-dt * 4); for (let i = 0; i < 3; i++) st[i] += (stT[i] - st[i]) * k; } else { st[0] = stT[0]; st[1] = stT[1]; st[2] = stT[2]; }
  const pe = run && fx && fx.pulseAt ? (now - fx.pulseAt) / 1000 : 99, ce = run && fx && fx.caAt ? now - fx.caAt : 999, ca = rk >= 3 && run && ce < 200;   // aberracja: 200 ms od fx-director.ca() (realna porażka)
  if (ca) { if (!TX.cvT) { TX.cvT = mkTex(B.W, B.H, gl.LINEAR, gl.CLAMP_TO_EDGE); TX.cvF = mkFbo(TX.cvT); } gl.bindFramebuffer(gl.FRAMEBUFFER, TX.cvF); } else gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  let q = null; if (timing && ext && !qPending) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); }
  gl.viewport(0, 0, B.W, B.H); gl.useProgram(P.frame.prog); const u = P.frame.u;
  gl.uniform2f(u.uRes, B.W, B.H); gl.uniform3f(u.uAcc, acc[0], acc[1], acc[2]); gl.uniform3f(u.uAcc2, acc2[0], acc2[1], acc2[2]); gl.uniform3f(u.uSt, st[0], st[1], st[2]);
  gl.uniform1f(u.uHz, B.hz); gl.uniform1f(u.uT, T); gl.uniform1f(u.uGrid, grid); gl.uniform1f(u.uPulse, pe); gl.uniform1f(u.uMk, run && rk >= 3 ? 1 : 0); gl.uniform2f(u.uM, mouse[0], mouse[1]); gl.uniform2f(u.uPar, run && rk >= 3 ? B.par[0] : 0, run && rk >= 3 ? -B.par[1] : 0);
  gl.uniform1f(u.uAct, act); gl.uniform1f(u.uFoot, footN); gl.uniform1f(u.uOrbR, orbR); gl.uniform1f(u.uPt, run && rk >= 2 && J.state?.settings?.particles !== false ? 1 : 0);
  bindTex(u.uBake, 0, TX.bake); bindTex(u.uFog, 1, TX.fog); gl.drawArrays(gl.TRIANGLES, 0, 3);
  B.partN = run ? B.partCount(rk, J.state?.settings?.particles !== false, B.partIdx, narrow) : 0;
  if (B.partN) {   // cząstki: jeden draw gl.POINTS, wszystko w vertex shaderze; intensywność deszczu z realnego strumienia znaków, iskry z realnych zdarzeń (fx-director)
    const pp = P.part, pu = pp.u, sa = fx && fx.sparkAt ? (now - fx.sparkAt) / 1000 : 99;
    gl.useProgram(pp.prog); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.uniform3f(pu.uAcc, acc[0], acc[1], acc[2]); gl.uniform3f(pu.uAcc2, acc2[0], acc2[1], acc2[2]); gl.uniform3f(pu.uSt, st[0], st[1], st[2]);
    gl.uniform1f(pu.uT, T); gl.uniform1f(pu.uRain, J.engine?.rain || 0); gl.uniform1f(pu.uDust, Math.min(1, .15 + act * .85)); gl.uniform1f(pu.uAge, sa); gl.uniform1f(pu.uK, fx?.sparkK || 0);
    gl.uniform1f(pu.uAsp, B.W / B.H); gl.uniform1f(pu.uPs, Math.max(.8, Math.min(2, B.H / 540))); gl.uniform2f(pu.uOrb, orbX, orbY);
    gl.drawArrays(gl.POINTS, 0, B.partN); gl.disable(gl.BLEND); B.pdraws = (B.pdraws || 0) + 1;
  }
  if (ca) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.useProgram(P.comp.prog); gl.uniform2f(P.comp.u.uRes, B.W, B.H); gl.uniform1f(P.comp.u.uK, .014 * (1 - ce / 200)); bindTex(P.comp.u.uS, 0, TX.cvT); gl.drawArrays(gl.TRIANGLES, 0, 3); }
  if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); qPending = q; }
  else if (qPending && gl.getQueryParameter(qPending, gl.QUERY_RESULT_AVAILABLE)) { if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) gpuMs = gl.getQueryParameter(qPending, gl.QUERY_RESULT) / 1e6; gl.deleteQuery(qPending); qPending = null; }
  B.draws++;
};

/* wejście wejściowe planu z #app (bez odczytu layoutu): zmiana → klasa .bg-fb, widoczność, ponowne narysowanie */
const sync = () => {
  const app = A(); if (!app) return;
  const cl = app.classList, hidden = !!document.hidden, neon = app.dataset.wall === 'neon', rk = rank(), focus = cl.contains('focus'), present = cl.contains('present');
  const fb = B.failed || B.lost || MQ.matches;
  const key = (neon ? 1 : 0) | rk << 1 | (focus ? 8 : 0) | (present ? 16 : 0) | (B.held ? 32 : 0) | (fb ? 64 : 0) | (hidden ? 128 : 0);
  if (key === lastKey) return; lastKey = key;
  if (neon && !B.failed && !B.lost && !MQ.matches) ensureGL();
  const m = B.plan({ wall: app.dataset.wall, rank: rk, focus, present, hold: B.held, fb: B.failed || B.lost || MQ.matches, hidden });
  B.mode = m; cl.toggle('bg-fb', neon && (m === 'fb'));
  cl.toggle('gl-on', neon && (m === 'run' || m === 'still' || m === 'pause'));   // scena rysowana przez GL: #fx (sieć cząstek) znika z układu, a odbicie/fale podłogi liczy shader
  if (m === 'still' || m === 'run') { vw = vw || innerWidth; vh = vh || innerHeight; dirty = true; }
};

/* wołane z pętli main.js co klatkę (po jej dławieniu w bezczynności): rysuje tylko w trybie run albo raz w still po zmianie */
B.frame = (now, covered) => {
  sync();
  if (!gl || B.lost || (B.mode !== 'run' && B.mode !== 'still') || covered) return;
  const run = B.mode === 'run';
  if (sizeDirty || J.hud?.ver !== lastVer) { if (!vw) { vw = innerWidth; vh = innerHeight; } geometry(); }
  if (!run && !dirty && J.fxd?.glow === lastGlow) return;
  const t0 = performance.now(); draw(now, run); dirty = false;
  B.jsMs += (performance.now() - t0 - B.jsMs) * .05;
};
/* tylko e2e/diagnostyka: narysuj klatkę i odczytaj próbki pikseli w tym samym zadaniu (bufor bez preserveDrawingBuffer znika po kompozycji) */
B.probe = (n = 5) => {
  if (!gl || B.lost) return null; if (!vw) { vw = innerWidth; vh = innerHeight; } if (sizeDirty) geometry();
  draw(performance.now(), B.mode === 'run'); const px = new Uint8Array(4), out = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { gl.readPixels(Math.floor((i + .5) * B.W / n), Math.floor((j + .5) * B.H / n), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); out.push([px[0], px[1], px[2]]); }
  return out;
};
B.canvas = () => cv;
})();
