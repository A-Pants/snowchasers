/* globe.js: the world map and the place card.
   The world map is a globe of Earth drawn on a 2D canvas. Drag it to spin it; tap a pin to see the place, and travel there if it is open.
   The place card replaces the tutorial's how-to-play text on the title screen: it is the loading screen that teaches you about where you are. */
'use strict';

/* ================= place card on the title screen ================= */
let factI=0,factTimer=0;
function showFact(i){
  const f=MTN.facts;factI=(i+f.length)%f.length;
  $('factNum').textContent=(factI+1)+' of '+f.length;$('factText').textContent=f[factI];
  clearInterval(factTimer);factTimer=setInterval(()=>showFact(factI+1),8000);   /* move on by itself every 8 s */
}
if(!TUTORIAL){
  $('howPanel').classList.add('hidden');$('titleTag').classList.add('hidden');$('skipBtn').classList.add('hidden');
  $('place').classList.remove('hidden');
  $('placeKick').textContent=MTN.region;$('placeName').textContent=MTN.name;$('placeBlurb').textContent=MTN.blurb;
  $('placeStats').innerHTML='';
  MTN.stats.forEach(s=>{const d=document.createElement('div');d.innerHTML='<b></b><span></span>';d.querySelector('b').textContent=s[1];d.querySelector('span').textContent=s[0];$('placeStats').appendChild(d);});
  showFact(0);
  $('factPrev').addEventListener('click',()=>showFact(factI-1));
  $('factNext').addEventListener('click',()=>showFact(factI+1));
  $('startBtn').addEventListener('click',()=>clearInterval(factTimer));
}

/* ================= the globe ================= */
/* rough outlines of the land, as [longitude, latitude] points. Simple shapes: good enough to recognise the continents. */
const LAND=[
  [[-168,66],[-162,70],[-156,71],[-140,70],[-128,70],[-115,68],[-95,72],[-85,70],[-80,63],[-90,57],[-78,52],[-65,60],[-60,55],[-56,52],[-66,45],[-70,42],[-74,40],[-76,35],[-81,31],[-80,25],[-83,29],[-90,30],[-97,27],[-97,22],[-92,18],[-87,21],[-88,16],[-84,11],[-79,9],[-82,8],[-86,12],[-92,15],[-96,16],[-105,20],[-110,23],[-112,28],[-115,31],[-117,32],[-121,35],[-124,40],[-124,46],[-125,50],[-132,55],[-140,60],[-150,61],[-158,58],[-165,60]],
  [[-73,78],[-60,82],[-30,83],[-20,80],[-20,72],[-30,68],[-42,60],[-50,64],[-55,70],[-60,76]],
  [[-80,9],[-75,11],[-62,11],[-52,5],[-50,0],[-35,-5],[-39,-15],[-48,-26],[-58,-34],[-62,-40],[-65,-45],[-68,-52],[-70,-55],[-74,-50],[-73,-40],[-71,-30],[-70,-18],[-76,-14],[-81,-5],[-80,0],[-78,4]],
  [[-10,36],[-9,43],[-2,44],[-5,48],[2,51],[8,54],[10,58],[5,62],[15,69],[28,71],[40,67],[45,68],[60,69],[70,73],[80,73],[100,77],[115,74],[130,71],[150,72],[170,70],[180,67],[178,64],[163,60],[157,51],[142,59],[135,54],[141,48],[133,43],[129,35],[127,39],[122,40],[121,32],[118,24],[109,21],[106,10],[100,13],[100,3],[104,1],[98,8],[97,17],[92,22],[88,22],[80,15],[77,8],[73,18],[67,25],[57,25],[56,27],[50,30],[48,29],[52,24],[56,26],[59,22],[52,16],[43,13],[39,21],[35,28],[33,31],[35,36],[27,37],[26,40],[23,36],[20,40],[15,38],[18,40],[12,44],[13,46],[8,44],[3,43],[0,39],[-5,36]],
  [[-17,21],[-13,28],[-6,36],[10,37],[11,33],[20,31],[32,31],[34,28],[39,20],[43,12],[51,12],[48,4],[40,-3],[40,-15],[35,-24],[32,-29],[20,-35],[18,-30],[12,-17],[13,-6],[9,-1],[9,4],[4,6],[-8,4],[-13,8],[-17,14]],
  [[44,-16],[50,-15],[49,-25],[44,-24]],
  [[114,-22],[122,-18],[130,-12],[137,-12],[136,-15],[141,-11],[146,-19],[153,-26],[150,-37],[141,-38],[135,-35],[129,-32],[115,-34]],
  [[130,31],[135,34],[140,35],[142,40],[141,45],[145,44],[141,41],[140,38],[136,36],[132,34]],
  [[-5,50],[1,51],[2,53],[-2,56],[-3,58],[-6,58],[-5,54]],
  [[172,-34],[178,-38],[175,-41],[168,-46],[166,-45],[172,-40]],
  [[109,1],[117,7],[119,1],[116,-4],[110,-3]],
  [[95,5],[104,-6],[106,-5],[98,2]],
  [[-24,64],[-14,64],[-14,66],[-22,66]],
  (function(){const a=[];for(let lo=-180;lo<180;lo+=10)a.push([lo,-70+3*Math.sin(lo*0.05)]);for(let lo=170;lo>=-180;lo-=10)a.push([lo,-89]);return a;})()   /* Antarctica */
];
/* every pin: playable mountains, ones coming soon, and famous peaks that are locked for now */
const PINS=Object.keys(MOUNTAINS).filter(k=>MOUNTAINS[k].world===1).map(k=>{const m=MOUNTAINS[k];return {id:k,name:m.name,region:m.region,lat:m.lat,lon:m.lon,kind:m.playable?'open':'soon'};})
  .concat(GLOBE_LOCKED.map(a=>({id:null,name:a[0],region:'',lat:a[1],lon:a[2],kind:'locked'})));
const GL={lon:-100,lat:30,vlon:0,drag:null,sel:null,spinTo:null,raf:0,size:0,dpr:1,idle:0};
const globe=$('globe'),gctx=globe.getContext('2d');
const RAD=Math.PI/180;
/* orthographic projection: where a point on the globe lands on the canvas, and whether it faces us (front > 0) */
function proj(lon,lat){
  const l=lon*RAD,p=lat*RAD,l0=GL.lon*RAD,p0=GL.lat*RAD;
  const x=Math.cos(p)*Math.sin(l-l0),y=Math.cos(p0)*Math.sin(p)-Math.sin(p0)*Math.cos(p)*Math.cos(l-l0);
  const front=Math.sin(p0)*Math.sin(p)+Math.cos(p0)*Math.cos(p)*Math.cos(l-l0);
  return {x:x,y:y,front:front};
}
function setupGlobe(){
  GL.dpr=Math.min(window.devicePixelRatio||1,2);
  const r=$('gwrap').getBoundingClientRect();GL.size=Math.max(10,Math.min(r.width,r.height));
  globe.width=Math.round(r.width*GL.dpr);globe.height=Math.round(r.height*GL.dpr);
}
function drawGlobe(){
  if(globe.width!==Math.round(globe.clientWidth*GL.dpr)||globe.height!==Math.round(globe.clientHeight*GL.dpr))setupGlobe();   /* the space changed (the pin card opened, or the window resized) */
  const w=globe.width/GL.dpr,h=globe.height/GL.dpr,R=GL.size*0.44,cx=w/2,cy=h/2,c=gctx;
  c.setTransform(GL.dpr,0,0,GL.dpr,0,0);c.clearRect(0,0,w,h);
  /* ocean with a soft glow round the edge */
  const og=c.createRadialGradient(cx-R*0.3,cy-R*0.35,R*0.1,cx,cy,R);og.addColorStop(0,'#2f7fc4');og.addColorStop(1,'#0d3a6b');
  c.fillStyle=og;c.beginPath();c.arc(cx,cy,R,0,6.3);c.fill();
  c.strokeStyle='rgba(127,216,255,.35)';c.lineWidth=2;c.beginPath();c.arc(cx,cy,R+3,0,6.3);c.stroke();
  /* lines of latitude and longitude */
  c.strokeStyle='rgba(255,255,255,.08)';c.lineWidth=1;
  for(let lo=-180;lo<180;lo+=30){c.beginPath();let on=false;for(let la=-90;la<=90;la+=5){const p=proj(lo,la);if(p.front>0){if(on)c.lineTo(cx+p.x*R,cy-p.y*R);else c.moveTo(cx+p.x*R,cy-p.y*R);on=true;}else on=false;}c.stroke();}
  for(let la=-60;la<=60;la+=30){c.beginPath();let on=false;for(let lo=-180;lo<=180;lo+=5){const p=proj(lo,la);if(p.front>0){if(on)c.lineTo(cx+p.x*R,cy-p.y*R);else c.moveTo(cx+p.x*R,cy-p.y*R);on=true;}else on=false;}c.stroke();}
  /* land: points on the far side are pulled to the edge of the disc, which keeps each shape closed */
  c.fillStyle='#e6eef5';c.strokeStyle='rgba(13,34,56,.35)';c.lineWidth=1;
  LAND.forEach(poly=>{
    let any=false;c.beginPath();
    poly.forEach((q,i)=>{let p=proj(q[0],q[1]);let x=p.x,y=p.y;if(p.front<=0){const m=Math.hypot(x,y)||1;x/=m;y/=m;}else any=true;if(i)c.lineTo(cx+x*R,cy-y*R);else c.moveTo(cx+x*R,cy-y*R);});
    c.closePath();if(any){c.fill();c.stroke();}
  });
  /* pins */
  const t=performance.now()/1000,labels=[];
  PINS.forEach(pin=>{
    const p=proj(pin.lon,pin.lat);pin.sx=null;if(p.front<=0.05)return;
    const x=cx+p.x*R,y=cy-p.y*R;pin.sx=x;pin.sy=y;
    const here=pin.id===MOUNTAIN,sel=GL.sel===pin;
    if(pin.kind==='open'){
      c.fillStyle='rgba(255,210,122,'+(0.25+0.2*Math.sin(t*3))+')';c.beginPath();c.arc(x,y,11+2*Math.sin(t*3),0,6.3);c.fill();
      c.fillStyle='#ffd27a';c.beginPath();c.arc(x,y,6,0,6.3);c.fill();
    } else if(pin.kind==='soon'){
      c.strokeStyle='#ffffff';c.lineWidth=2;c.beginPath();c.arc(x,y,5,0,6.3);c.stroke();
    } else {
      c.fillStyle='rgba(255,255,255,.55)';c.beginPath();c.arc(x,y,3,0,6.3);c.fill();
    }
    if(here||sel){c.strokeStyle=sel?'#7fd8ff':'#ffffff';c.lineWidth=2;c.beginPath();c.arc(x,y,13,0,6.3);c.stroke();}
    if(pin.kind!=='locked'||sel){
      /* labels go on the right, or the left near the right edge, and step down when they would land on another label */
      const left=x>w-130;let ly=y+4;
      while(labels.some(l=>Math.abs(l[0]-x)<120&&Math.abs(l[1]-ly)<15))ly+=15;
      labels.push([x,ly]);
      c.font='600 13px "DM Sans",Arial';c.fillStyle='#ffffff';c.shadowColor='rgba(0,0,0,.6)';c.shadowBlur=4;
      c.textAlign=left?'right':'left';c.fillText(pin.name,left?x-14:x+14,ly);c.textAlign='left';c.shadowBlur=0;
    }
  });
}
/* the card under the globe for the chosen pin */
function showPin(pin){
  GL.sel=pin;GL.spinTo={lon:pin.lon,lat:clamp(pin.lat,-60,60)};
  $('pinName').textContent=pin.name;$('pinRegion').textContent=pin.region||'';
  const go=$('pinGo');
  const need=pin.kind==='open'&&pin.id!==MOUNTAIN&&MOUNTAINS[pin.id].needs&&!state.have[MOUNTAINS[pin.id].needs];
  if(need){   /* open, but you need some gear before you can go */
    go.disabled=true;go.classList.add('locked');go.textContent='Too cold without a warm parka';
    $('pinNote').textContent=MOUNTAINS[pin.id].needText;
  } else if(pin.kind==='open'){
    go.disabled=false;go.classList.remove('locked');
    go.textContent=pin.id===MOUNTAIN?'You are here: drop back in':'Travel here';
    $('pinNote').textContent=MOUNTAINS[pin.id].blurb||'';
  } else {
    go.disabled=true;go.classList.add('locked');go.textContent=pin.kind==='soon'?'Coming next':'Locked';
    $('pinNote').textContent=pin.kind==='soon'?'This mountain is being built.':'More mountains are on the way.';
  }
  $('pinCard').classList.remove('hidden');
}
$('pinGo').addEventListener('click',()=>{
  const pin=GL.sel;if(!pin||pin.kind!=='open'||$('pinGo').disabled)return;
  if(pin.id===MOUNTAIN){closeWorlds();if(state.mode==='title')startGame();return;}
  travelTo(pin.id);
});
$('goTutorial').addEventListener('click',()=>{if(MOUNTAIN==='lostline')closeWorlds();else travelTo('lostline');});
/* dragging spins the globe; a tap without dragging picks the nearest pin */
globe.addEventListener('pointerdown',e=>{GL.drag={x:e.clientX,y:e.clientY,lon:GL.lon,lat:GL.lat,moved:0,t:performance.now()};GL.spinTo=null;try{globe.setPointerCapture(e.pointerId);}catch(_){}});
globe.addEventListener('pointermove',e=>{
  const d=GL.drag;if(!d)return;
  const dx=e.clientX-d.x,dy=e.clientY-d.y;d.moved=Math.max(d.moved,Math.hypot(dx,dy));
  const k=180/(GL.size*0.44*Math.PI);
  const nl=d.lon-dx*k;GL.vlon=(nl-GL.lon);GL.lon=nl;GL.lat=clamp(d.lat+dy*k,-70,70);
});
globe.addEventListener('pointerup',e=>{
  const d=GL.drag;GL.drag=null;GL.idle=0;if(!d||d.moved>6){return;}
  GL.vlon=0;
  const r=globe.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
  let best=null,bd=22;PINS.forEach(p=>{if(p.sx===null||p.sx===undefined)return;const dd=Math.hypot(p.sx-x,p.sy-y);if(dd<bd){bd=dd;best=p;}});
  if(best)showPin(best);
});
globe.addEventListener('pointercancel',()=>{GL.drag=null;});
function globeLoop(){
  if(!worldsOpen())return;
  GL.raf=requestAnimationFrame(globeLoop);
  if(!GL.drag){
    if(GL.spinTo){   /* glide so the chosen pin comes to the middle */
      GL.lon+=angdiff(GL.spinTo.lon*RAD,GL.lon*RAD)/RAD*0.12;GL.lat+=(GL.spinTo.lat-GL.lat)*0.12;
    } else {GL.vlon*=0.92;GL.lon+=GL.vlon;GL.idle++;if(GL.idle>120)GL.lon+=0.06;}   /* coast after a drag, then turn slowly */
  }
  drawGlobe();
}
const worldsOpen=()=>!$('worlds').classList.contains('hidden');
function openWorlds(){
  closePanels();closeGear();
  $('worlds').classList.remove('hidden');setupGlobe();
  const here=PINS.find(p=>p.id===MOUNTAIN)||PINS.find(p=>p.kind==='open');showPin(here);
  cancelAnimationFrame(GL.raf);globeLoop();
}
function closeWorlds(){$('worlds').classList.add('hidden');cancelAnimationFrame(GL.raf);}
$('worldsClose').addEventListener('click',closeWorlds);
$('worldBtn').addEventListener('click',openWorlds);
$('menuWorld').addEventListener('click',openWorlds);
$('wtMoon').addEventListener('click',()=>toast('The Moon','World 2 is coming later. You will need rocket skis.',2400));
window.addEventListener('resize',()=>{if(worldsOpen())setupGlobe();});
