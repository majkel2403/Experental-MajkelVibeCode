/* Quantum Tree AI — fully local visual simulation; no market or trading APIs. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const App = { playing:false, phase:'explore', speed:1, layers:6, packetsMax:matchMedia('(pointer: coarse)').matches ? 65 : 150, pixelRatio:Math.min(devicePixelRatio || 1,matchMedia('(pointer: coarse)').matches ? 1 : 1.7), frame:0, fps:0, lowFpsSeconds:0 };
  const metrics={pnl:0,wins:0,total:0,completed:0};
  const palette=[0xffffff,0x00daff,0x2695ff,0x7466ff,0xbc55ff,0xff4dbf,0xff557b];
  const names=['ROOT','TREND','INDICATOR','RISK','DECISION','EXECUTE','MICRO'];
  const descriptions={explore:'Eksploruj losowe ścieżki przez sieć.',learn:'Symulowane wzmocnienie odwiedzanych połączeń.',trade:'Pokazuj dodatnie i ujemne wyniki symulacji.'};
  let scene,camera,renderer,composer,controls,raycaster,mouse,edges,particles;
  let levels=[],nodes=[],active=[],available=[],lastFrame=performance.now(),spawnTimer=0,statsTimer=0,completedLast=0,fpsFrames=0,fpsTime=0;
  const dummy = typeof THREE === 'undefined' ? null : new THREE.Object3D();
  const color = typeof THREE === 'undefined' ? null : new THREE.Color();
  const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));

  function updateControls(){
    ['explore','learn','trade'].forEach(phase=>{const button=$('btn-'+phase);const selected=phase===App.phase;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));});
    $('phase-description').textContent=descriptions[App.phase];
    $('btn-play').disabled=App.playing;
    $('btn-pause').disabled=!App.playing;
    $('scene-status').textContent=App.playing?App.phase.toUpperCase()+' / SYMULACJA AKTYWNA':'GOTOWY DO SYMULACJI';
    $('live-dot').classList.toggle('running',App.playing);
  }
  function displayStats(){
    const pnl=$('header-pnl');pnl.textContent=(metrics.pnl>=0?'+':'−')+'$'+Math.abs(metrics.pnl).toFixed(2);pnl.className=metrics.pnl>=0?'profit':'loss';
    $('header-winrate').textContent=(metrics.total?Math.round(metrics.wins/metrics.total*100):0)+'%';
    $('header-packets').textContent=active.length;
    $('stat-efficiency').textContent=(metrics.total?Math.round(metrics.wins/metrics.total*100):0)+'%';
  }
  function disposeObject(mesh){if(!mesh)return;scene.remove(mesh);mesh.geometry?.dispose();const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];mats.forEach(m=>m?.dispose());}
  function layoutTree(count){
    const gap=97,spread=355;
    for(let level=0;level<count;level++){
      const number=2**level;const geo=new THREE.SphereGeometry(Math.max(3,8-level*.85),12,10);
      const mat=new THREE.MeshBasicMaterial({color:palette[level],transparent:true,opacity:.96});
      const instances=new THREE.InstancedMesh(geo,mat,number);instances.userData.level=level;
      const scale=level===0?1:1;
      for(let i=0;i<number;i++){
        const x=(level-(count-1)/2)*gap;
        const y=number===1?0:((i/(number-1))-.5)*spread;
        const z=Math.sin(i*1.73+level*.91)*24 + Math.cos(i*.55+level)*12;
        const id=(2**level-1)+i;
        dummy.position.set(x,y,z);dummy.scale.setScalar(scale);dummy.updateMatrix();instances.setMatrixAt(i,dummy.matrix);
        nodes[id]={id,level,index:i,position:new THREE.Vector3(x,y,z),parent:level?Math.floor((id-1)/2):null,visits:0,profit:0};
      }
      instances.instanceMatrix.needsUpdate=true;scene.add(instances);levels.push(instances);
    }
    const positions=[],colors=[];
    nodes.forEach(n=>{if(n.parent===null)return;const p=nodes[n.parent];positions.push(p.position.x,p.position.y,p.position.z,n.position.x,n.position.y,n.position.z);for(let j=0;j<2;j++)colors.push(.04,.66,.91);});
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    edges=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.25}));scene.add(edges);
    const particleGeo=new THREE.SphereGeometry(2.65,7,6);const particleMat=new THREE.MeshBasicMaterial({color:0xffffff});
    particles=new THREE.InstancedMesh(particleGeo,particleMat,App.packetsMax);particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);particles.count=0;scene.add(particles);
  }
  function renderLayers(){
    $('layers-viz').replaceChildren(...Array.from({length:App.layers},(_,i)=>{
      const d=document.createElement('div');d.className='layer-item';
      const dot=document.createElement('span');dot.className='layer-dot';dot.style.color='#'+palette[i].toString(16).padStart(6,'0');dot.style.background='currentColor';
      const index=document.createElement('span');index.className='layer-index';index.textContent='L'+i;
      const amount=document.createElement('strong');amount.className='layer-nodes';amount.textContent=String(2**i);
      const name=document.createElement('span');name.className='layer-name';name.textContent=names[i];
      d.append(dot,index,amount,name);return d;
    }));
    $('node-count').textContent=nodes.length;$('total-connections').textContent=(nodes.length-1)+' LINKS';
    $('complexity-val').textContent=App.layers+' WARSTW';
  }
  function rebuildTree(count){
    levels.forEach(disposeObject);disposeObject(edges);disposeObject(particles);levels=[];nodes=[];active=[];available=[];spawnTimer=0;
    App.layers=count;layoutTree(count);renderLayers();resetStats();
  }
  function resetStats(){
    metrics.pnl=0;metrics.wins=0;metrics.total=0;metrics.completed=0;completedLast=0;
    active.length=0;available.length=0;spawnTimer=0;
    nodes.forEach(n=>{n.profit=0;n.visits=0});
    if(particles)particles.count=0;
    updateEdgeColors();$('stat-throughput').textContent='0 /s';displayStats();
  }
  function updateEdgeColors(){
    if(!edges)return;
    const a=edges.geometry.attributes.color;let k=0;
    nodes.forEach(n=>{if(n.parent===null)return;const avg=n.visits?n.profit/n.visits:0;
      const rgb=avg>.2?[.07,.96,.62]:avg<-.2?[1,.18,.39]:[.04,.66,.91];
      for(let i=0;i<2;i++){a.array[k++]=rgb[0];a.array[k++]=rgb[1];a.array[k++]=rgb[2];}
    });a.needsUpdate=true;
  }
  function spawn(){
    if(active.length>=App.packetsMax)return;
    const p=available.pop()||{path:[]};p.path.length=0;p.path.push(0);p.segment=0;p.t=0;p.velocity=.44+Math.random()*.40;p.profit=(Math.random()-.48)*105;
    let cursor=0;
    for(let level=1;level<App.layers;level++){cursor=cursor*2+1+(Math.random()<.5?0:1);if(cursor>=nodes.length)break;p.path.push(cursor);}
    active.push(p);
  }
  function finish(p){
    metrics.total++;metrics.completed++;metrics.pnl+=p.profit;if(p.profit>0)metrics.wins++;
    if(App.phase==='learn'||App.phase==='trade')p.path.forEach(i=>{nodes[i].visits++;nodes[i].profit+=p.profit;});
  }
  function movePackets(dt){
    const step=dt*App.speed;
    for(let i=active.length-1;i>=0;i--){
      const p=active[i];p.t+=p.velocity*step;
      while(p.t>=1){p.t-=1;p.segment++;if(p.segment>=p.path.length-1){finish(p);available.push(active.splice(i,1)[0]);break;}}
    }
    for(let i=0;i<active.length;i++){
      const p=active[i],a=nodes[p.path[p.segment]],b=nodes[p.path[p.segment+1]];
      if(!a||!b)continue;
      dummy.position.lerpVectors(a.position,b.position,p.t);dummy.position.z+=Math.sin(p.t*Math.PI)*13;
      dummy.scale.setScalar(.75+.3*Math.sin(p.t*Math.PI));dummy.updateMatrix();particles.setMatrixAt(i,dummy.matrix);
      color.setHex(p.profit>=0?0x4cffa8:0xff417d);particles.setColorAt(i,color);
    }
    particles.count=active.length;
    if(particles.count){particles.instanceMatrix.needsUpdate=true;if(particles.instanceColor)particles.instanceColor.needsUpdate=true;}
    spawnTimer+=step*4.2;
    while(spawnTimer>=1){spawn();spawnTimer-=1;}
  }
  function resetCamera(){
    const mobile=innerWidth<=768;camera.position.set(mobile?-38:-70,35,mobile?clamp(1500*390/Math.max(320,innerWidth),890,1700):690);
    camera.lookAt(0,0,0);controls.target.set(0,0,0);controls.update();
  }
  function resize(){
    if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
    renderer.setSize(innerWidth,innerHeight);composer?.setSize(innerWidth,innerHeight);
  }
  function setPhase(phase){App.phase=phase;updateControls();updateEdgeColors();}
  function hookUI(){
    document.querySelectorAll('[data-phase]').forEach(b=>b.addEventListener('click',()=>setPhase(b.dataset.phase)));
    $('btn-play').addEventListener('click',()=>{App.playing=true;updateControls();});
    $('btn-pause').addEventListener('click',()=>{App.playing=false;updateControls();});
    $('btn-reset').addEventListener('click',resetStats);
    $('btn-camera').addEventListener('click',resetCamera);
    $('speed-slider').addEventListener('input',e=>{App.speed=Number(e.target.value);$('speed-val').textContent=App.speed.toFixed(1)+'×';});
    $('complexity-slider').addEventListener('change',e=>rebuildTree(Number(e.target.value)));
    const sheet=$('main-panel'),toggle=$('sheet-toggle');
    toggle.addEventListener('click',()=>{const expanded=sheet.classList.toggle('expanded');toggle.setAttribute('aria-expanded',String(expanded));toggle.setAttribute('aria-label',expanded?'Zwiń panel sterowania':'Rozwiń panel sterowania');});
    window.addEventListener('keydown',e=>{if(e.key==='Escape'&&sheet.classList.contains('expanded')){sheet.classList.remove('expanded');toggle.setAttribute('aria-expanded','false');}});
    let resizer;window.addEventListener('resize',()=>{clearTimeout(resizer);resizer=setTimeout(resize,90);},{passive:true});
    $('canvas-container').addEventListener('pointermove',onPointer,{passive:true});
    $('canvas-container').addEventListener('pointerleave',()=>$('node-tooltip').hidden=true);
  }
  function onPointer(event){
    if(event.pointerType==='touch'||App.frame%3!==0)return;
    const rect=renderer.domElement.getBoundingClientRect();mouse.x=((event.clientX-rect.left)/rect.width)*2-1;mouse.y=-((event.clientY-rect.top)/rect.height)*2+1;
    raycaster.setFromCamera(mouse,camera);const hits=raycaster.intersectObjects(levels,false);
    const tip=$('node-tooltip');if(!hits.length){tip.hidden=true;return;}
    const hit=hits[0],node=nodes[(2**hit.object.userData.level-1)+hit.instanceId];if(!node)return;
    tip.textContent='L'+node.level+' / '+names[node.level]+' · WĘZEŁ '+node.index+' · PRZEJŚCIA '+node.visits;
    tip.style.left=Math.min(event.clientX+14,innerWidth-220)+'px';tip.style.top=Math.max(8,event.clientY-48)+'px';tip.hidden=false;
  }
  function animate(time){
    requestAnimationFrame(animate);
    const dt=clamp((time-lastFrame)/1000,0,.06);lastFrame=time;
    if(document.hidden)return;
    App.frame++;
    if(App.playing){movePackets(dt);edges.material.opacity=.20+.06*Math.sin(time*.001);}
    if(App.phase==='trade'&&App.playing&&App.frame%40===0)updateEdgeColors();
    controls.update();
    if(composer)composer.render();else renderer.render(scene,camera);
    fpsFrames++;fpsTime+=dt;statsTimer+=dt;
    if(fpsTime>=.75){App.fps=Math.round(fpsFrames/fpsTime);$('fps-counter').textContent=App.fps;fpsFrames=0;fpsTime=0;
      if(App.fps<25&&App.playing)App.lowFpsSeconds+=.75;else App.lowFpsSeconds=Math.max(0,App.lowFpsSeconds-1);
      if(App.lowFpsSeconds>4){App.lowFpsSeconds=0;composer=null;App.pixelRatio=Math.min(App.pixelRatio,1);renderer.setPixelRatio(App.pixelRatio);resize();}
    }
    if(statsTimer>=1){$('draw-calls').textContent=renderer.info.render.calls;$('stat-throughput').textContent=(metrics.completed-completedLast)+' /s';completedLast=metrics.completed;statsTimer=0;displayStats();}
  }
  function init(){
    hookUI();updateControls();
    try{
      if(typeof THREE==='undefined'||!THREE.OrbitControls)throw new Error('Three.js failed to load');
      scene=new THREE.Scene();scene.background=new THREE.Color(0x040817);scene.fog=new THREE.FogExp2(0x040817,.00065);
      camera=new THREE.PerspectiveCamera(53,innerWidth/innerHeight,2,4000);
      renderer=new THREE.WebGLRenderer({antialias:App.pixelRatio<=1,powerPreference:'high-performance',alpha:false});
      renderer.setPixelRatio(App.pixelRatio);renderer.setSize(innerWidth,innerHeight);$('canvas-container').appendChild(renderer.domElement);
      controls=new THREE.OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.055;controls.minDistance=130;controls.maxDistance=2600;controls.autoRotate=true;controls.autoRotateSpeed=.42;
      raycaster=new THREE.Raycaster();mouse=new THREE.Vector2();
      if(innerWidth>768&&THREE.EffectComposer&&THREE.UnrealBloomPass){
        composer=new THREE.EffectComposer(renderer);composer.addPass(new THREE.RenderPass(scene,camera));
        composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),1.25,.45,.18));
      }
      resetCamera();rebuildTree(App.layers);requestAnimationFrame(t=>{lastFrame=t;animate(t);});
    }catch(error){console.error('WebGL setup failed',error);$('webgl-error').hidden=false;$('scene-status').textContent='WEBGL NIEDOSTĘPNY';}
  }
  init();
})();
