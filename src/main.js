import './style.css';
import * as THREE from 'three';

const $ = (s) => document.querySelector(s);
const root = $('#root');
root.innerHTML = `
  <canvas id="game" aria-label="Mundo 3D de PIQUERASS"></canvas>
  <div class="vignette"></div>
  <section id="title-screen" class="title-screen">
    <div class="title-content"><div class="eyebrow">UNA AVENTURA EN LA ESPAÑA RURAL</div><h1>PIQUER<span>ASS</span></h1><p>El camino es tuyo.</p>
      <button id="start" class="gold-button">EMPEZAR A EXPLORAR <span>→</span></button>
      <button id="settings-open" class="text-button">AJUSTES</button>
      <div class="title-foot">UN MUNDO ABIERTO · UNA VIDA POR DESCUBRIR</div>
    </div>
  </section>
  <section id="settings" class="modal hidden"><div class="panel"><button class="close" data-close="settings">×</button><div class="eyebrow">PREFERENCIAS</div><h2>Ajustes</h2>
    <label class="setting-row">Volumen <input id="volume" type="range" min="0" max="100" value="55"></label>
    <label class="setting-row">Calidad gráfica <select id="quality"><option value="high">Alta</option><option value="balanced" selected>Equilibrada</option><option value="low">Ahorro de batería</option></select></label>
    <p class="muted">El volumen controla las señales de interfaz. No se envían datos fuera de este dispositivo.</p>
  </div></section>
  <main id="hud" class="hud hidden">
    <header class="topbar"><div class="brand-small">PIQUER<span>ASS</span><small>SIERRA SUR</small></div><div class="wallet">◈ <span id="money">1.250</span> €</div><div class="weather-pill"><span id="weather-icon">☀</span><span id="weather-label">SOLEADO</span><span class="divider"></span><span id="clock">08:30</span></div><button id="pause" class="icon-button" aria-label="Ajustes">Ⅱ</button></header>
    <div class="map-wrap"><canvas id="map" width="180" height="180"></canvas><div class="map-caption">VALLE DE PIQUERAS</div></div>
    <div class="mission-card"><div class="mission-label"><i></i> CUADERNO DE VIAJE</div><b id="mission-title">Un lugar por descubrir</b><span id="mission-description">Acércate a la plaza del pueblo.</span><div class="mission-progress"><i id="progress"></i></div></div>
    <div id="prompt" class="prompt hidden"><kbd>E</kbd><span>Interactuar</span></div>
    <div class="controls-hint"><kbd>WASD</kbd> MOVER <kbd>SHIFT</kbd> CORRER <kbd>C</kbd> CÁMARA <kbd>R</kbd> CLIMA</div>
    <div id="toast" class="toast"></div>
  </main>
  <div id="touch-controls" class="touch-controls hidden"><div id="stick" class="stick"><div id="knob" class="knob"></div></div><div class="touch-actions"><button id="touch-run">CORRER</button><button id="touch-interact" class="touch-round">E</button><button id="touch-jump" class="touch-round jump">↑</button></div></div>
`;

const saved = (() => { try { return JSON.parse(localStorage.getItem('piquerass-save') || '{}'); } catch { return {}; } })();
const state = { started:false, money:saved.money ?? 1250, found:new Set(saved.found || []), weather:saved.weather || 0, night:saved.night || false, firstPerson:false, inCar:false, running:false, jump:0, speed:0, carSpeed:0, yaw:0, pitch:0.22, cameraDrag:false, touchX:0, touchY:0, touchRun:false, lastToast:0, time:8.5, quality:localStorage.getItem('piquerass-quality') || 'balanced', volume:Number(localStorage.getItem('piquerass-volume') || 55) };
const save = () => localStorage.setItem('piquerass-save', JSON.stringify({ money:state.money, found:[...state.found], weather:state.weather, night:state.night }));
const fmtMoney = (n) => Math.round(n).toLocaleString('es-ES');

const renderer = new THREE.WebGLRenderer({ canvas:$('#game'), antialias:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, state.quality === 'low' ? 1 : 1.5));
renderer.shadowMap.enabled = state.quality !== 'low'; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#a9c5c6'); scene.fog = new THREE.Fog('#a9c5c6',80,240);
const camera = new THREE.PerspectiveCamera(62,1,.1,500);
const hemi = new THREE.HemisphereLight(0xd9eeff,0x645b3d,1.8); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe6b2,3.2); sun.position.set(-45,65,20); sun.castShadow=true; sun.shadow.mapSize.set(1024,1024); sun.shadow.camera.left=-80; sun.shadow.camera.right=80; sun.shadow.camera.top=80; sun.shadow.camera.bottom=-80; scene.add(sun);
const mats = {};
function mat(color, roughness=.85, extra={}) { const key=color+roughness; return mats[key] ||= new THREE.MeshStandardMaterial({color,roughness,...extra}); }
function box(parent,x,y,z,sx,sy,sz,material,cast=true){const m=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),material);m.position.set(x,y,z);m.castShadow=cast;m.receiveShadow=true;parent.add(m);return m;}

// A gently varied terrain, built procedurally and kept within a compact draw-call budget.
const terrainGeo = new THREE.PlaneGeometry(300,300,90,90); terrainGeo.rotateX(-Math.PI/2);
const p=terrainGeo.attributes.position;
for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i);let y=Math.sin(x*.035)*1.6+Math.cos(z*.028)*1.8+Math.sin((x+z)*.018)*2.1; if(Math.abs(x)<10||Math.abs(z)<8)y*=.25;p.setY(i,y);}
terrainGeo.computeVertexNormals(); const terrain=new THREE.Mesh(terrainGeo,mat('#64764b',1)); terrain.receiveShadow=true;scene.add(terrain);
// distant layered hills
for(let i=0;i<16;i++){const a=i/16*Math.PI*2,r=118+(i%3)*12, h=20+(i%5)*5;const hill=new THREE.Mesh(new THREE.ConeGeometry(24,h,7),mat(i%2?'#65715c':'#768069',1));hill.position.set(Math.cos(a)*r,h/2-2,Math.sin(a)*r);hill.scale.set(1.7,1,1.1);hill.rotation.y=a;scene.add(hill);}
function road(x,z,w,d,rotation=0){const r=new THREE.Mesh(new THREE.PlaneGeometry(w,d),mat('#494844',1));r.rotation.x=-Math.PI/2;r.rotation.z=rotation;r.position.set(x,.12,z);r.receiveShadow=true;scene.add(r);const edge=new THREE.Mesh(new THREE.PlaneGeometry(w,d*.025),mat('#b4a57e',1));edge.rotation.x=-Math.PI/2;edge.rotation.z=rotation;edge.position.set(x,.14,z);scene.add(edge);}
road(0,0,13,300);road(0,0,300,10);road(52,38,100,7,-.32);road(-63,-45,90,7,.45);
// dry stone walls along the lanes
for(let i=-135;i<140;i+=7){if(Math.abs(i)<18)continue;for(const side of [-1,1]){const wall=box(scene,side*8.6,.55,i,1.05,1.1,5.8,mat('#9a8b70'));wall.rotation.y=.015;}}
function makeHouse(x,z,wallColor='#c7b99b',scale=1){const g=new THREE.Group();box(g,0,3*scale,0,10*scale,6*scale,8*scale,mat(wallColor));const roof=new THREE.Mesh(new THREE.ConeGeometry(7.7*scale,4*scale,4),mat('#754438'));roof.position.y=8*scale;roof.rotation.y=Math.PI/4;roof.castShadow=true;g.add(roof);box(g,0,1.65*scale,4.02*scale,1.7*scale,3.3*scale,.14,mat('#523827'));for(const wx of [-3,3]){box(g,wx,3.6*scale,4.08*scale,1.3*scale,1.45*scale,.12,mat('#63808a'));box(g,wx,3.6*scale,4.17*scale,1.45*scale,.12,.15,mat('#e2d4b8'));}g.position.set(x,0,z);scene.add(g);return g;}
makeHouse(-22,-20);makeHouse(24,-22,'#d7c7a6');makeHouse(-26,24,'#c7a98f');makeHouse(27,30,'#aab49b');makeHouse(42,-3,'#d0bea1',.8);makeHouse(-42,4,'#c7b99b',.9);makeHouse(62,48,'#d5c6a9',1.25);
function tree(x,z,s=1){const g=new THREE.Group();const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.22*s,.42*s,3.2*s,7),mat('#65472d'));trunk.position.y=1.6*s;trunk.castShadow=true;g.add(trunk);for(let n=0;n<3;n++){const crown=new THREE.Mesh(new THREE.IcosahedronGeometry((2.3-n*.22)*s,1),mat(n===1?'#536f43':'#49633d'));crown.position.set((n-1)*.5*s,(3.5+n*.78)*s,0);crown.castShadow=true;g.add(crown);}g.position.set(x,0,z);scene.add(g);}
let seed=741;function rand(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
for(let i=0;i<115;i++){const x=(rand()-.5)*270,z=(rand()-.5)*270;if(Math.abs(x)<13||Math.abs(z)<11)continue;tree(x,z,.65+rand()*.65);}
// an orchard and golden field give the landscape a distinct rural silhouette
for(let row=0;row<5;row++)for(let col=0;col<7;col++){const g=new THREE.Group();const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.16,.23,1.6,7),mat('#67472b'));trunk.position.y=.8;g.add(trunk);const crown=new THREE.Mesh(new THREE.SphereGeometry(1.2,9,7),mat('#78864a'));crown.position.y=2;g.add(crown);g.position.set(45+col*4,0,-52+row*5);scene.add(g);}
const field=new THREE.Mesh(new THREE.PlaneGeometry(28,38),mat('#a18a4c',1));field.rotation.x=-Math.PI/2;field.position.set(-55,.08,44);scene.add(field);
// plaza, fountain, benches and discoverable locations
const plaza=new THREE.Mesh(new THREE.CircleGeometry(12,32),mat('#b1a58d',1));plaza.rotation.x=-Math.PI/2;plaza.position.set(0,.17,0);scene.add(plaza);
const fountain=new THREE.Group();const basin=new THREE.Mesh(new THREE.CylinderGeometry(3.2,3.6,.7,16),mat('#8b9993'));basin.position.y=.5;fountain.add(basin);const water=new THREE.Mesh(new THREE.CylinderGeometry(2.8,2.8,.12,16),new THREE.MeshStandardMaterial({color:'#6aa6a5',roughness:.2,metalness:.1}));water.position.y=.9;fountain.add(water);const column=new THREE.Mesh(new THREE.CylinderGeometry(.28,.4,2,8),mat('#d6d0bc'));column.position.y=1.8;fountain.add(column);fountain.position.set(0,0,0);scene.add(fountain);
for(const x of [-7,7]){const b=new THREE.Group();box(b,0,.65,0,3,.18,.7,mat('#76533b'));box(b,-1.2,.35,0,.16,.7,.16,mat('#58412f'));box(b,1.2,.35,0,.16,.7,.16,mat('#58412f'));b.position.set(x,0,5);scene.add(b);}
const landmarks=[{id:'plaza',name:'Plaza de la Fuente',x:0,z:0},{id:'mirador',name:'Mirador de la Sierra',x:73,z:-71},{id:'olivar',name:'El viejo olivar',x:55,z:-48},{id:'ermita',name:'Ermita del camino',x:-74,z:65}];
// small roadside chapel
const chapel=makeHouse(-74,65,'#d9d0b8',.72);const cross=box(scene,-74,9,65,.35,3,.35,mat('#e5deca'));box(scene,-74,9.7,65,1.7,.32,.35,mat('#e5deca'));
// vintage compact car with visible wheels and glass
const car=new THREE.Group();box(car,0,.85,0,4.2,1.15,7,mat('#a94f37'));box(car,0,1.85,-.35,3.55,1.25,3.65,mat('#9d4933'));const glass=mat('#a8c6c8',.3,{metalness:.15});box(car,0,1.95,1.5,3.2,.82,.08,glass,false);box(car,0,1.95,-2.16,3.2,.82,.08,glass,false);const wheels=[];for(const x of [-2.05,2.05])for(const z of [-2.25,2.25]){const w=new THREE.Mesh(new THREE.CylinderGeometry(.72,.72,.42,14),mat('#252421'));w.rotation.z=Math.PI/2;w.position.set(x,.68,z);w.castShadow=true;car.add(w);wheels.push(w);}car.position.set(4,0,13);car.rotation.y=Math.PI;scene.add(car);
// player: original low-poly adventure character
const player=new THREE.Group();const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.48,.78,5,10),mat('#314e52'));torso.position.y=1.25;torso.castShadow=true;player.add(torso);const head=new THREE.Mesh(new THREE.SphereGeometry(.39,12,10),mat('#bd8d6a'));head.position.y=2.27;head.castShadow=true;player.add(head);const hair=new THREE.Mesh(new THREE.SphereGeometry(.4,12,7,0,Math.PI*2,0,Math.PI*.52),mat('#42352d'));hair.position.y=2.36;player.add(hair);const legs=[];for(const x of [-.2,.2]){const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.15,.55,4,8),mat('#343c3c'));leg.position.set(x,.42,0);leg.castShadow=true;player.add(leg);legs.push(leg);}player.position.set(0,0,13);scene.add(player);
const keys={};window.addEventListener('keydown',e=>{keys[e.code]=true;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.repeat)return;if(e.code==='KeyE')interact();if(e.code==='KeyC')toggleCamera();if(e.code==='KeyR')cycleWeather();if(e.code==='KeyT')toggleNight();});window.addEventListener('keyup',e=>keys[e.code]=false);
const title=$('#title-screen'),hud=$('#hud'),touchControls=$('#touch-controls');
function startGame(){state.started=true;title.classList.add('hidden');hud.classList.remove('hidden');if(matchMedia('(pointer:coarse)').matches)touchControls.classList.remove('hidden');toast('Bienvenido al valle. La carretera te espera.');}
$('#start').addEventListener('click',startGame);$('#settings-open').onclick=()=>$('#settings').classList.remove('hidden');$('#pause').onclick=()=>$('#settings').classList.remove('hidden');document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$('#settings').classList.add('hidden'));
$('#volume').value=state.volume;$('#volume').oninput=e=>{state.volume=+e.target.value;localStorage.setItem('piquerass-volume',state.volume);};$('#quality').value=state.quality;$('#quality').onchange=e=>{state.quality=e.target.value;localStorage.setItem('piquerass-quality',state.quality);renderer.setPixelRatio(Math.min(devicePixelRatio,state.quality==='low'?1:1.5));renderer.shadowMap.enabled=state.quality!=='low';};
function toast(text){const el=$('#toast');el.textContent=text;el.classList.add('show');state.lastToast=performance.now();setTimeout(()=>el.classList.remove('show'),2600);}
function toggleCamera(){state.firstPerson=!state.firstPerson;toast(state.firstPerson?'Vista en primera persona':'Vista en tercera persona');}
function cycleWeather(){state.weather=(state.weather+1)%3;const configs=[['☀','SOLEADO','#a9c5c6','#a9c5c6'],['☂','LLUVIA','#697b82','#697b82'],['〰','NIEBLA','#aab4b1','#aab4b1']];const c=configs[state.weather];$('#weather-icon').textContent=c[0];$('#weather-label').textContent=c[1];scene.background.set(c[2]);scene.fog.color.set(c[3]);scene.fog.near=state.weather===2?18:80;scene.fog.far=state.weather===2?100:240;sun.intensity=state.weather===1?.7:state.night?.35:3.2;toast(`Tiempo: ${c[1].toLowerCase()}`);save();}
function toggleNight(){state.night=!state.night;sun.intensity=state.night?.3:state.weather===1?.7:3.2;hemi.intensity=state.night?.55:1.8;scene.background.set(state.night?'#192a3c':state.weather===1?'#697b82':'#a9c5c6');scene.fog.color.set(state.night?'#192a3c':state.weather===1?'#697b82':'#a9c5c6');$('#clock').textContent=state.night?'22:15':'08:30';toast(state.night?'Ha caído la noche':'Amanece en el valle');save();}
function interact(){if(!state.started)return;if(state.inCar){state.inCar=false;player.visible=true;player.position.copy(car.position).add(new THREE.Vector3(3,0,0));toast('Has bajado del coche');return;}const nearCar=player.position.distanceTo(car.position)<5;if(nearCar){state.inCar=true;player.visible=false;state.carSpeed=0;toast('Al volante. ¡Buen viaje!');return;}const landmark=landmarks.find(l=>Math.hypot(player.position.x-l.x,player.position.z-l.z)<8);if(landmark){discover(landmark);return;}toast('No hay nada con lo que interactuar aquí.');}
function discover(l){if(state.found.has(l.id)){toast(`${l.name} — ya lo has descubierto`);return;}state.found.add(l.id);state.money+=250;$('#money').textContent=fmtMoney(state.money);$('#mission-title').textContent=state.found.size<landmarks.length?'Nuevo destino: '+landmarks.find(x=>!state.found.has(x.id)).name:'Valle completado';$('#mission-description').textContent=state.found.size<landmarks.length?'Sigue explorando y encuentra los rincones secretos.':'Has descubierto todos los rincones. ¡Enhorabuena!';$('#progress').style.width=`${state.found.size/landmarks.length*100}%`;toast(`${l.name} descubierto · +250 €`);save();}
// Camera drag rotates around the explorer; pointer controls work on touch and desktop.
const gameCanvas=$('#game');gameCanvas.addEventListener('pointerdown',e=>{if(!state.started)return;state.cameraDrag=true;gameCanvas.setPointerCapture(e.pointerId);});gameCanvas.addEventListener('pointermove',e=>{if(!state.cameraDrag)return;state.yaw-=e.movementX*.004;state.pitch=THREE.MathUtils.clamp(state.pitch+e.movementY*.003,-.05,.75);});for(const ev of ['pointerup','pointercancel'])gameCanvas.addEventListener(ev,()=>state.cameraDrag=false);
const stick=$('#stick'),knob=$('#knob');let stickPointer=null;stick.addEventListener('pointerdown',e=>{e.preventDefault();stickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);updateStick(e);});function updateStick(e){const r=stick.getBoundingClientRect(),dx=(e.clientX-r.left-r.width/2)/(r.width*.34),dy=(e.clientY-r.top-r.height/2)/(r.height*.34);state.touchX=THREE.MathUtils.clamp(dx,-1,1);state.touchY=THREE.MathUtils.clamp(dy,-1,1);knob.style.transform=`translate(${state.touchX*33}px,${state.touchY*33}px)`;}stick.addEventListener('pointermove',e=>{if(e.pointerId===stickPointer)updateStick(e);});function releaseStick(){stickPointer=null;state.touchX=state.touchY=0;knob.style.transform='';}stick.addEventListener('pointerup',releaseStick);stick.addEventListener('pointercancel',releaseStick);
$('#touch-run').onpointerdown=()=>state.touchRun=true;$('#touch-run').onpointerup=$('#touch-run').onpointercancel=()=>state.touchRun=false;$('#touch-jump').onclick=()=>{if(!state.inCar&&player.position.y<.03)state.jump=5.8;};$('#touch-interact').onclick=interact;

const map=$('#map'),ctx=map.getContext('2d');function drawMap(){ctx.clearRect(0,0,180,180);ctx.fillStyle='#667b54';ctx.fillRect(0,0,180,180);ctx.save();ctx.translate(90,90);ctx.scale(.54,.54);ctx.fillStyle='#4b4a45';ctx.fillRect(-6,-150,12,300);ctx.fillRect(-150,-5,300,10);ctx.fillStyle='#b4a57e';ctx.fillRect(-8,-150,1,300);ctx.fillRect(7,-150,1,300);for(const l of landmarks){ctx.fillStyle=state.found.has(l.id)?'#e6d39a':'#d3a84f';ctx.beginPath();ctx.arc(l.x,l.z,2.7,0,Math.PI*2);ctx.fill();}const pos=state.inCar?car.position:player.position;ctx.translate(pos.x,pos.z);ctx.rotate(state.yaw);ctx.fillStyle='#fff4c4';ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(-4,4);ctx.lineTo(4,4);ctx.closePath();ctx.fill();ctx.restore();}
const clock=new THREE.Clock();const camTarget=new THREE.Vector3(),camPos=new THREE.Vector3(),forward=new THREE.Vector3(),right=new THREE.Vector3();
function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.04),t=clock.elapsedTime;if(!state.started){renderer.render(scene,camera);return;}
const kx=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0)+state.touchX;const kz=(keys.KeyS||keys.ArrowDown?1:0)-(keys.KeyW||keys.ArrowUp?1:0)+state.touchY;const moving=Math.abs(kx)+Math.abs(kz)>.08;const fast=keys.ShiftLeft||keys.ShiftRight||state.touchRun;
forward.set(-Math.sin(state.yaw),0,-Math.cos(state.yaw));right.set(Math.cos(state.yaw),0,-Math.sin(state.yaw));
if(state.inCar){const throttle=-kz;state.carSpeed=THREE.MathUtils.damp(state.carSpeed,throttle*17,throttle?2.2:1.2,dt);car.rotation.y+=kx*dt*(.8+Math.abs(state.carSpeed)*.055)*Math.sign(state.carSpeed||1);car.position.add(new THREE.Vector3(-Math.sin(car.rotation.y),0,-Math.cos(car.rotation.y)).multiplyScalar(state.carSpeed*dt));for(const w of wheels)w.rotation.x+=state.carSpeed*dt/.7;player.position.copy(car.position);player.rotation.y=car.rotation.y;state.yaw=car.rotation.y+Math.PI;}
else if(moving){const speed=fast?8.2:4.7;const direction=forward.clone().multiplyScalar(-kz).addScaledVector(right,kx).normalize();player.position.addScaledVector(direction,speed*dt);player.rotation.y=Math.atan2(direction.x,direction.z);state.speed=THREE.MathUtils.damp(state.speed,speed,8,dt);}
else state.speed=THREE.MathUtils.damp(state.speed,0,8,dt);
if(!state.inCar){if(state.jump>0){player.position.y+=state.jump*dt;state.jump-=15*dt;}else if(player.position.y>0){player.position.y=Math.max(0,player.position.y-12*dt);}if(moving){const swing=Math.sin(t*(fast?15:10))*.55;legs[0].rotation.x=swing;legs[1].rotation.x=-swing;torso.position.y=1.25+Math.abs(Math.sin(t*10))*.04;}else{legs.forEach(l=>l.rotation.x=0);torso.position.y=1.25;}}
// Keep the playable area open but bounded.
const actor=state.inCar?car:player;actor.position.x=THREE.MathUtils.clamp(actor.position.x,-140,140);actor.position.z=THREE.MathUtils.clamp(actor.position.z,-140,140);
const target=state.inCar?car.position:player.position;const distance=state.firstPerson?-.15:state.inCar?11:8;const height=state.firstPerson?2.1:state.inCar?5:5.2;camPos.set(target.x+Math.sin(state.yaw)*distance,target.y+height+Math.sin(state.pitch)*4,target.z+Math.cos(state.yaw)*distance);camera.position.lerp(camPos,1-Math.pow(.002,dt));camTarget.set(target.x,target.y+(state.firstPerson?1.7:1.5),target.z);camera.lookAt(camTarget);
// gentle ambient wind and changing sun angle
sun.position.x=-45+Math.sin(t*.035)*18;if(state.weather===1){scene.fog.near=60;scene.fog.far=180;}
const near=landmarks.find(l=>Math.hypot(target.x-l.x,target.z-l.z)<9);const nearCar=!state.inCar&&target.distanceTo(car.position)<5;$('#prompt').classList.toggle('hidden',!near&&!nearCar);if(near||nearCar)$('#prompt span').textContent=nearCar?'Subir al coche':`Descubrir ${near.name}`;
$('#clock').textContent=state.night?'22:15':`${String(Math.floor(8+(t/150)%11)).padStart(2,'0')}:${String(Math.floor(t*0.4%60)).padStart(2,'0')}`;drawMap();renderer.render(scene,camera);}
function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}addEventListener('resize',resize);resize();
$('#money').textContent=fmtMoney(state.money);$('#progress').style.width=`${state.found.size/landmarks.length*100}%`;if(state.found.size){$('#mission-title').textContent=state.found.size===landmarks.length?'Valle completado':'Sigue explorando';$('#mission-description').textContent=`Has descubierto ${state.found.size} de ${landmarks.length} lugares.`;}
if(state.weather!==0){const initial=state.weather;state.weather=0;for(let i=0;i<initial;i++)cycleWeather();}if(state.night){state.night=false;toggleNight();}
animate();
