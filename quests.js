/* quests.js: the four map fragments, the quest journal on the left of the screen, picking fragments up,
   and the animated map that reveals the Lost Line once all four are found. */
'use strict';
/* ================= map fragments (positions only; world.js draws them and keeps trees away from them) ================= */
/* each fragment: name and subtitle for the journal, where it floats, and rad, how close you must get to pick it up. got becomes true once found. */
const FR=[
  {name:'The Outpost',sub:'Abandoned weather station',x:PADS[0].x,z:PADS[0].z+9,y:PADS[0].h+2.5,rad:6},
  {name:'The Edge',sub:'Cliff jump, bring speed',x:JUMPS[0].x,z:JUMPS[0].z+10,y:H(JUMPS[0].x,JUMPS[0].z)+0.6,rad:7},
  {name:'The Shelter',sub:'Cabin hidden in the forest',x:PADS[1].x+7,z:PADS[1].z,y:PADS[1].h+2.5,rad:6},
  {name:'The Unknown',sub:'Frozen and hard to reach',x:PADS[2].x-1,z:PADS[2].z,y:PADS[2].h+2.2,rad:6}
];
FR.forEach(f=>{f.got=false;});

/* ================= quest journal ================= */
/* build the journal rows once at start-up; updateJournal keeps them current */
const jrows=$('jrows');
/* fragment numbers drawn on the reveal map */
const ROMAN=['I','II','III','IV'];
function jsec(t){const d=document.createElement('div');d.className='jsec';d.textContent=t;jrows.appendChild(d);}
jsec('Map fragments');
FR.forEach((f,i)=>{
  const r=document.createElement('div');r.className='jrow';r.id='jr'+i;
  r.innerHTML='<div class="gem"></div><div class="nm">'+f.name+'<span>'+f.sub+'</span></div><div class="dist"><span class="arr">&#9650;</span><span class="d">-</span></div>';
  jrows.appendChild(r);
});
/* gear quests: the rewards stay a surprise until you earn them */
const GQ=[
  {id:'q0',name:'Ski down to the base lodge',sub:'Something is waiting there.',done:()=>!!state.have.trail},
  {id:'q1',name:'Land tricks and build style',sub:'Keep the combos going.',done:()=>!!state.have.apex},
  {id:'q2',name:'Keep the style coming',sub:'There is more to earn.',done:()=>!!state.have.ridge},
  {id:'q3',name:'Race the Lost Line',sub:'Find all four map fragments first.',done:()=>!!state.have.lost}
];
jsec('Gear quests');
GQ.forEach(q=>{
  const r=document.createElement('div');r.className='jrow';r.id=q.id;
  r.innerHTML='<div class="box"></div><div class="nm">'+q.name+'<span>'+q.sub+'</span></div>';
  jrows.appendChild(r);
});
/* about 7 times a second (not every frame): tick off finished quests, update the count, and point an arrow and distance at each fragment */
let jAcc=0;
function updateJournal(dt){
  jAcc+=dt;if(jAcc<0.15)return;jAcc=0;
  let qd=0;GQ.forEach(q=>{const d=q.done();if(d)qd++;$(q.id).classList.toggle('done',d);});
  $('jcount').textContent=(state.count+qd)+'/'+(4+GQ.length);
  const left=4+GQ.length-state.count-qd;$('questBadge').textContent=left>0?String(left):'ok';
  FR.forEach((f,i)=>{
    const r=$('jr'+i);r.classList.toggle('done',f.got);
    const dEl=r.querySelector('.d'),aEl=r.querySelector('.arr');
    if(f.got){dEl.textContent='found';aEl.style.display='none';return;}
    const dx=f.x-P.x,dz=f.z-P.z,d=Math.hypot(dx,dz);
    dEl.textContent=Math.round(d)+' m';aEl.style.display='inline-block';
    const a=angdiff(Math.atan2(dx,dz),P.h);
    aEl.style.transform='rotate('+(-a*180/Math.PI)+'deg)';
  });
}

/* ================= collecting fragments ================= */
/* main.js calls this when you get close to fragment i: mark it found, play the sound and sparkles, and start the map reveal after the fourth */
function collect(i){
  const f=FR[i];if(f.got)return;
  sfx('collect');saveSoon();
  f.got=true;state.count++;fragObjs[i].g.visible=false;
  for(let n=0;n<40;n++){const a=Math.random()*6.28,s=3+Math.random()*7;burst.emit(f.x,f.y,f.z,Math.cos(a)*s,2+Math.random()*7,Math.sin(a)*s,1.1,0.7);}
  toast('Fragment '+state.count+' of 4',f.name,2600);
  if(state.count===4)setTimeout(()=>{if(state.mode==='explore')startReveal();},1700);
}

/* ================= map reveal ================= */
/* the reveal: four torn pieces fly together, contour lines draw in, then the Lost Line traces from summit to base. It is drawn on its own canvas above the game. */
const mapCanvas=$('mapCanvas'),mx2=mapCanvas.getContext('2d');
const MW=440,MH=600,CXm=220,CYm=300;
let mdpr2=1;
function setupMapCanvas(){mdpr2=Math.min(window.devicePixelRatio||1,2);mapCanvas.width=MW*mdpr2;mapCanvas.height=MH*mdpr2;}
/* the tears: a wobbly vertical line (Vj) and a wobbly horizontal line (Hj) cut the map into the four pieces in POLYS */
const Vj=y=>CXm+Math.sin(y*0.09)*9+Math.sin(y*0.31)*3.5;
const Hj=x=>CYm+Math.sin(x*0.08+1)*9+Math.sin(x*0.27)*3.5;
function seq(f,a,b,step){const out=[];const n=Math.max(1,Math.ceil(Math.abs(b-a)/step));for(let i=0;i<=n;i++)out.push(f(a+(b-a)*i/n));return out;}
const POLYS=[
  [[0,0],[Vj(0),0]].concat(seq(y=>[Vj(y),y],0,CYm,8),seq(x=>[x,Hj(x)],CXm,0,8)),
  [[Vj(0),0],[MW,0],[MW,Hj(MW)]].concat(seq(x=>[x,Hj(x)],MW,CXm,8),seq(y=>[Vj(y),y],CYm,0,8)),
  seq(x=>[x,Hj(x)],0,CXm,8).concat(seq(y=>[Vj(y),y],CYm,MH,8),[[0,MH]]),
  seq(x=>[x,Hj(x)],CXm,MW,8).concat([[MW,MH],[Vj(MH),MH]],seq(y=>[Vj(y),y],MH,CYm,8))
];
/* where each piece starts (offset and tilt) before it flies into place */
const STARTS=[[-300,-260,-0.5],[300,-260,0.5],[-300,300,0.45],[300,300,-0.45]];
const cent=POLYS.map(p=>{let sx=0,sy=0;p.forEach(q=>{sx+=q[0];sy+=q[1];});return [sx/p.length,sy/p.length];});
const ease=t=>1-Math.pow(1-clamp(t,0,1),3);
/* turn a world position into a point on the reveal map */
const mapPt=(x,z)=>[CXm+x*1.7,60+(z-SUMMIT_Z)/(FINISH_Z-SUMMIT_Z)*480];
let revealT0=0,revealDone=false;
function drawPoly(c,poly){c.beginPath();poly.forEach((q,i)=>{if(i)c.lineTo(q[0],q[1]);else c.moveTo(q[0],q[1]);});c.closePath();}
/* draws one frame of the reveal. t is seconds since it started, and each part begins at a set time. */
function drawReveal(now){
  if(state.mode!=='reveal')return;
  const t=(now-revealT0)/1000,c=mx2;
  c.setTransform(mdpr2,0,0,mdpr2,0,0);c.clearRect(0,0,MW,MH);
  const asm=ease(t/1.7);
  const summit=mapPt(lineX(SUMMIT_Z),SUMMIT_Z);
  for(let i=0;i<4;i++){
    const s=STARTS[i],ox=(1-asm)*s[0],oy=(1-asm)*s[1],rot=(1-asm)*s[2];
    c.save();c.translate(cent[i][0]+ox,cent[i][1]+oy);c.rotate(rot);c.translate(-cent[i][0],-cent[i][1]);
    drawPoly(c,POLYS[i]);c.fillStyle='#10263d';c.fill();c.lineWidth=2;c.strokeStyle='rgba(127,216,255,0.55)';c.stroke();
    c.restore();
  }
  if(t>1.5){
    const seam=clamp((t-1.5)/0.9,0,1);
    c.save();c.globalAlpha=(1-seam)*0.95;c.strokeStyle='#ffd27a';c.lineWidth=3;
    POLYS.forEach(p=>{drawPoly(c,p);c.stroke();});c.restore();
    c.strokeStyle='rgba(127,216,255,0.07)';c.lineWidth=1;
    for(let gx=0;gx<=MW;gx+=40){c.beginPath();c.moveTo(gx,0);c.lineTo(gx,MH);c.stroke();}
    for(let gy=0;gy<=MH;gy+=40){c.beginPath();c.moveTo(0,gy);c.lineTo(MW,gy);c.stroke();}
  }
  if(t>2.2){
    c.save();c.beginPath();c.rect(0,0,MW,MH);c.clip();
    for(let k=1;k<=15;k++){
      const vis=clamp((t-2.2-k*0.07)/0.4,0,1);if(vis<=0)continue;
      c.globalAlpha=vis*(0.25+0.4*(1-k/15));c.strokeStyle='#7fd8ff';c.lineWidth=1.3;c.beginPath();
      for(let a=0;a<=6.3;a+=0.1){
        const r=k*17*(1+Math.sin(a*3+k*0.7)*0.09+Math.sin(a*5+k*1.9)*0.05);
        const px=summit[0]+Math.cos(a)*r*1.0,py=summit[1]+Math.sin(a)*r*1.7;
        if(a===0)c.moveTo(px,py);else c.lineTo(px,py);
      }
      c.closePath();c.stroke();
    }
    c.restore();
  }
  if(t>3.4){
    const f=clamp((t-3.4)/2.4,0,1);
    const pts=[];for(let z=SUMMIT_Z;z<=FINISH_Z;z+=20)pts.push(mapPt(lineX(z),z));
    const n=Math.max(2,Math.floor(pts.length*f));
    c.save();c.strokeStyle='#ffffff';c.lineWidth=3;c.setLineDash([9,6]);c.shadowColor='#7fd8ff';c.shadowBlur=8;c.beginPath();
    for(let i=0;i<n;i++){if(i)c.lineTo(pts[i][0],pts[i][1]);else c.moveTo(pts[i][0],pts[i][1]);}
    c.stroke();c.restore();
    GATES.forEach((g,i)=>{const p=mapPt(g.x,g.z);const idx=Math.floor((g.z-SUMMIT_Z)/20);if(idx<=n){c.fillStyle='#7fd8ff';c.beginPath();c.arc(p[0],p[1],3.2,0,6.3);c.fill();}});
    FR.forEach((fr,i)=>{
      const p=mapPt(fr.x,fr.z);
      c.strokeStyle='#ffd27a';c.lineWidth=2.5;c.beginPath();c.moveTo(p[0]-6,p[1]-6);c.lineTo(p[0]+6,p[1]+6);c.moveTo(p[0]+6,p[1]-6);c.lineTo(p[0]-6,p[1]+6);c.stroke();
      c.fillStyle='#ffd27a';c.font='700 15px "Barlow Condensed",Arial';c.fillText(ROMAN[i],p[0]+9,p[1]-5);
    });
    const pulse=0.5+0.5*Math.sin(t*4);
    c.strokeStyle='rgba(255,107,87,'+(0.6+0.4*pulse)+')';c.lineWidth=2;c.beginPath();c.arc(summit[0],summit[1],9+pulse*6,0,6.3);c.stroke();
    c.fillStyle='#ff6b57';c.beginPath();c.arc(summit[0],summit[1],4,0,6.3);c.fill();
    c.fillStyle='#ffffff';c.font='600 15px "DM Sans",Arial';c.fillText('Summit',summit[0]+16,summit[1]+5);
    const fin=mapPt(0,FINISH_Z);c.fillText('Base',fin[0]+14,fin[1]+4);
  }
  if(t>6.2&&!revealDone){revealDone=true;$('mapText').classList.add('show');$('mapBtn').classList.remove('hidden');$('mapBtn').focus();}
  requestAnimationFrame(drawReveal);
}
/* switch to the reveal screen and start the animation */
function startReveal(){
  state.mode='reveal';closeGear();revealDone=false;
  $('mapText').classList.remove('show');$('mapBtn').classList.add('hidden');
  $('mapOverlay').classList.add('show');setupMapCanvas();revealT0=performance.now();requestAnimationFrame(drawReveal);
}
/* "Ride to the summit" closes the map and starts the race countdown */
$('mapBtn').addEventListener('click',()=>{$('mapOverlay').classList.remove('show');beginCountdown();});
