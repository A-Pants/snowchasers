/* multiplayer.js: playing with friends. It only connects when the game runs as a claude.ai artifact with the room capability;
   opened as a local file it stays solo. Covers rooms, other players' skiers, group races and the shared leaderboard. */
'use strict';
/* ================= multiplayer ================= */
/* Everything rides on the artifact's `room` capability. Each rider publishes their own state as presence (position, pose, gear, score,
   race status); everyone else renders that state, so late joiners are caught up automatically and nothing depends on dropped messages.
   Presence is untrusted input: every field is range-checked before it touches the scene, and names come from the user profile API. */
/* at most 10 other riders are drawn */
const MAX_REMOTE=10;
/* net: the connection (cap, room), other riders (remotes, by peer id) and their names, what we last sent, race invites, and timers */
const net={mem:{},recGhost:null,myLabel:'',state:'none',isOwner:false,error:'',ready:false,cap:null,userCap:null,room:null,code:'snowchasers',joining:false,connected:false,myId:null,
  remotes:new Map(),names:{},last:{},sendT:0,seen:new Set(),invite:null,myCall:null,lane:0,unsubs:[],resolving:false,uiT:0,boardT:0};
/* helpers for checking incoming data: round numbers, allow only known gear ids, keep numbers in range, and clean up room codes */
const r2=v=>Math.round(v*100)/100,r1=v=>Math.round(v*10)/10;
const OK_ITEM={skis:['std','lost','board'],jacket:['std','apex'],pants:['std','ridge'],boots:['std','trail']};
const okItem=(slot,v)=>OK_ITEM[slot].indexOf(v)>=0?v:'std';
const fin=(v,lo,hi,d)=>{v=+v;return Number.isFinite(v)?clamp(v,lo,hi):d;};
const sanitizeRoom=t=>{t=String(t||'').toLowerCase().replace(/[^a-z0-9_.-]+/g,'-').replace(/-{2,}/g,'-').replace(/^[^a-z0-9]+|[^a-z0-9]+$/g,'').slice(0,48).replace(/[^a-z0-9]+$/,'');return t||'snowchasers';};
const MODE_NAME={x:'Exploring',c:'Waiting at the summit',r:'Racing',f:'Finished a race',t:'On the title screen'};
const GRAB_CODE={up:1,down:2,left:3,right:4};
const peerLabel=e=>net.names[e.by]||('Rider '+String(e.peer).slice(-3).toUpperCase());
const hexStr=h=>'#'+(h>>>0).toString(16).padStart(6,'0');

/* everything another player sends is checked before it is used: wrong types are dropped and numbers are kept in range */
function parseRelay(lb){
  if(!lb||typeof lb!=='object')return null;
  const out={l:[],d:[]};
  [['l'],['d']].forEach(a=>{const arr=lb[a[0]];if(!Array.isArray(arr))return;arr.slice(0,8).forEach(en=>{if(Array.isArray(en)&&typeof en[0]==='string'&&en[0].length<=64&&Number.isFinite(+en[1]))out[a[0]].push([en[0],+en[1]]);});});
  return out;
}
function parseGhostField(g){
  if(!g||typeof g!=='object'||typeof g.o!=='string'||g.o.length>64||typeof g.b!=='string'||g.b.length>2600||!(+g.t>=20&&+g.t<=900))return null;
  const k=Array.isArray(g.k)&&g.k.length>=4?[okItem('skis',g.k[0]),okItem('jacket',g.k[1]),okItem('pants',g.k[2]),okItem('boots',g.k[3])]:null;
  const c=Array.isArray(g.c)&&g.c.length>=4?[0,1,2,3].map(i=>(fin(g.c[i],0,0xffffff,0)|0)):null;
  return {o:g.o,t:+g.t,b:g.b,k:k,c:c};
}
/* turn another rider's presence (the state they publish) into a safe object. The short field names are explained at buildPresence. */
function parsePresence(p){
  if(!p||!Array.isArray(p.s)||p.s.length<7)return null;
  const s=p.s,k=Array.isArray(p.k)?p.k:[],f=Array.isArray(p.f)?p.f:[],lk=Array.isArray(p.lk)?p.lk:[],cl=Array.isArray(p.cl)?p.cl:[];
  const fl=fin(p.fl,0,255,1)|0,dflt=[0xe8553d,0x25313f,0x161d28,0x2f8fe0];
  const r=p.rr,c=p.rc;
  return {
    x:fin(s[0],-420,420,0),y:fin(s[1],-700,300,0),z:fin(s[2],-330,1760,0),h:fin(s[3],-60,60,0),
    vx:fin(s[4],-90,90,0),vy:fin(s[5],-90,90,0),vz:fin(s[6],-90,90,0),
    steer:fin(k[0],-1,1,0),tuck:fin(k[1],0,1,0),brake:fin(k[2],0,1,0),load:fin(k[3],0,1,0),
    visFlip:fin(f[0],-90,90,0),visSpin:fin(f[1],-90,90,0),
    grounded:!!(fl&1),crash:!!(fl&2),grab:[null,'up','down','left','right'][(fl>>2)&7]||null,sw:!!(fl&32),walk:!!(fl&64),
    mode:'xcrft'.indexOf(String(p.m||'x').charAt(0))>=0?String(p.m||'x').charAt(0):'x',
    look:{skis:okItem('skis',lk[0]),jacket:okItem('jacket',lk[1]),pants:okItem('pants',lk[2]),boots:okItem('boots',lk[3]),
          c:[0,1,2,3].map(i=>(fin(cl[i],0,0xffffff,dflt[i])|0))},
    sc:fin(p.sc,0,1e9,0),bt:(p.bt===null||p.bt===undefined)?null:fin(p.bt,0,9999,null),db:(p.db===null||p.db===undefined)?null:fin(p.db,0,9999,null),sd:(typeof p.sd==='string'&&p.sd.length<=16)?p.sd:'',
    lb:parseRelay(p.lb),gh:parseGhostField(p.gh),
    rc:(c&&typeof c.t==='string'&&c.t.length<=16)?{t:c.t,d:fin(c.d,3,30,12)}:null,
    rr:(r&&typeof r.t==='string'&&r.t.length<=16)?{t:r.t,st:String(r.st||'').slice(0,3),tm:(r.tm===null||r.tm===undefined)?null:fin(r.tm,0,9999,null),g:fin(r.g,0,14,0)}:null
  };
}

/* ---- name tags ---- */
/* a floating name label above another rider, drawn on a small canvas */
function makeTag(){
  const c=document.createElement('canvas');c.width=256;c.height=64;
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthTest:false,depthWrite:false,fog:false}));
  sp.renderOrder=20;sp.userData={cv:c,text:'',color:''};return sp;
}
function drawTag(sp,text,color){
  if(sp.userData.text===text&&sp.userData.color===color)return;
  sp.userData.text=text;sp.userData.color=color;
  const c=sp.userData.cv,x=c.getContext('2d');if(!x)return;
  x.clearRect(0,0,256,64);
  x.fillStyle='rgba(8,20,34,0.74)';x.beginPath();if(x.roundRect)x.roundRect(4,8,248,48,14);else x.rect(4,8,248,48);x.fill();
  x.fillStyle=color;x.beginPath();x.arc(26,32,8,0,6.3);x.fill();
  x.font='700 25px "DM Sans",Arial,sans-serif';x.textAlign='left';x.textBaseline='middle';x.fillStyle='#ffffff';x.fillText(text,42,33,200);
  sp.material.map.needsUpdate=true;
}
function refreshTags(){net.remotes.forEach(e=>{if(e.tag&&e.pr)drawTag(e.tag,peerLabel(e),hexStr(e.pr.look.c[0]));});}

/* ---- remote riders ---- */
/* a rider joined: give them their own skier model */
function addRemote(peer){
  const R=makeRider();scene.add(R.group);scene.add(R.shadowWrap);R.group.visible=false;R.shadowWrap.visible=false;
  const e={peer:peer.peer,by:peer.by,guest:peer.guest,rider:R,pr:null,lastPresence:null,tgt:null,tAt:0,tag:null,lookKey:'',
    s:{x:0,y:0,z:0,h:0,vx:0,vy:0,vz:0,grounded:true,steer:0,tuck:0,brake:0,load:0,crash:0,crashT:0,visFlip:0,visSpin:0,grab:null,sw:false,walk:false},init:false};
  net.remotes.set(peer.peer,e);return e;
}
/* a rider left: remember their times for the board, then remove their model */
function removeRemote(e){
  rememberLeaver(e);
  scene.remove(e.rider.group);scene.remove(e.rider.shadowWrap);disposeRider(e.rider);
  if(e.tag){scene.remove(e.tag);if(e.tag.material.map)e.tag.material.map.dispose();e.tag.material.dispose();}
  net.remotes.delete(e.peer);
}
/* store a rider's latest state as the target their model glides toward */
function applyPresence(e,peer){
  if(e.lastPresence===peer.presence)return;
  e.lastPresence=peer.presence;
  const pr=parsePresence(peer.presence);if(!pr)return;
  if(!e.pr&&pr.rc)net.seen.add(pr.rc.t);   /* a race called before we saw this rider is old news */
  e.pr=pr;
  e.tgt={x:pr.x,y:pr.y,z:pr.z,h:pr.h,vx:pr.vx,vy:pr.vy,vz:pr.vz};e.tAt=performance.now();
  if(!e.init){Object.assign(e.s,e.tgt);e.init=true;}
  const lk=JSON.stringify(pr.look);
  if(lk!==e.lookKey){e.lookKey=lk;setRiderLook(e.rider,pr.look);if(e.tag)drawTag(e.tag,peerLabel(e),hexStr(pr.look.c[0]));}
}
/* every frame: glide each rider's model toward where they should be by now, pose it, and place their name tag */
function updateRemotes(dt){
  const now=performance.now(),cp=camera.position;
  net.remotes.forEach(e=>{
    const pr=e.pr,t=e.tgt,R=e.rider;
    if(!pr||!t){R.group.visible=false;R.shadowWrap.visible=false;if(e.tag)e.tag.visible=false;return;}
    const s=e.s,age=Math.min(0.3,(now-e.tAt)/1000);
    const px=t.x+t.vx*age,pz=t.z+t.vz*age,k=1-Math.exp(-dt*12),k2=1-Math.exp(-dt*10);
    if(Math.hypot(px-s.x,pz-s.z)>40){s.x=px;s.z=pz;s.y=t.y;}
    else{s.x+=(px-s.x)*k;s.z+=(pz-s.z)*k;}
    s.grounded=pr.grounded;
    s.y=pr.grounded?H(s.x,s.z):s.y+((t.y+t.vy*age)-s.y)*k;
    s.h+=angdiff(t.h,s.h)*k;s.vx+=(t.vx-s.vx)*k2;s.vz+=(t.vz-s.vz)*k2;s.vy+=(t.vy-s.vy)*k2;
    s.steer+=(pr.steer-s.steer)*k2;s.tuck+=(pr.tuck-s.tuck)*k2;s.brake+=(pr.brake-s.brake)*k2;s.load+=(pr.load-s.load)*k2;
    s.visFlip+=(pr.visFlip-s.visFlip)*k;s.visSpin+=(pr.visSpin-s.visSpin)*k;
    s.crash=pr.crash?1:0;s.crashT=pr.crash?s.crashT+dt:0;s.grab=pr.grab;s.sw=pr.sw;s.walk=pr.walk;
    const dist=Math.hypot(s.x-cp.x,s.y-cp.y,s.z-cp.z);
    const vis=pr.mode!=='t'&&dist<300&&mountainOfSeed(pr.sd)===MOUNTAIN;   /* riders on another mountain are not drawn here */
    R.group.visible=vis;R.shadowWrap.visible=vis;
    if(!vis){if(e.tag)e.tag.visible=false;return;}
    const sp=poseRider(R,s,dt);
    if(pr.look.skis==='lost'&&sp>3&&!s.crash&&!s.walk){
      const ac=hexRGB(pr.look.c[3]);
      for(const sd of [-1,1])trail.emit(s.x-_f.x*1.0+_x.x*0.23*sd,s.y+0.14,s.z-_f.z*1.0+_x.z*0.23*sd,(Math.random()-0.5)*0.3,0.2+Math.random()*0.4,(Math.random()-0.5)*0.3,1.15,0.55,ac[0],ac[1],ac[2]);
    }
    if(!e.tag){e.tag=makeTag();scene.add(e.tag);drawTag(e.tag,peerLabel(e),hexStr(pr.look.c[0]));}
    e.tag.visible=dist<260;
    const h=clamp(dist*0.04,0.5,3.4);e.tag.scale.set(h*4,h,1);e.tag.position.set(s.x,s.y+3.0+h*0.2,s.z);
  });
}
/* look up display names for riders we do not have names for yet */
function resolveNames(){
  if(!net.userCap||net.resolving)return;
  const ids=[];net.remotes.forEach(e=>{if(e.by&&!(e.by in net.names)&&ids.indexOf(e.by)<0)ids.push(e.by);});
  Object.keys(net.mem).forEach(k=>{if(k.slice(0,2)!=='p:'&&!(k in net.names)&&ids.indexOf(k)<0)ids.push(k);});
  if(!ids.length)return;
  net.resolving=true;
  net.userCap.profiles(ids).then(ps=>{
    ids.forEach(id=>{const q=ps&&ps[id];net.names[id]=(q&&q.name)?String(q.name).slice(0,24):'';});
    net.resolving=false;refreshTags();updateMpUI();
  }).catch(()=>{net.resolving=false;ids.forEach(id=>{net.names[id]='';});});
}

/* ---- what we publish about ourselves ---- */
/* one letter for what we are doing, shown in other players' Riders panel */
const modeCode=()=>({title:'t',explore:'x',countdown:'c',race:'r',results:'f',reveal:'x'}[state.mode]||'x');
/* our part in a group race, if any */
function raceInfo(){
  if(state.raceTok){
    const st=state.mode==='countdown'?'cd':state.mode==='race'?'run':state.mode==='results'?'fin':'out';
    return {t:state.raceTok,st:st,tm:state.mode==='results'?r2(state.raceT):null,g:state.gates};
  }
  /* a finished time stays on everyone's standings for a couple of minutes, even after you ski away */
  const lf=state.lastFin;
  if(lf&&performance.now()-lf.at<120000)return {t:lf.t,st:'fin',tm:r2(lf.tm),g:14};
  return null;
}
/* everything others need to draw us, with short names to keep messages small:
   s position and velocity, k lean, f flip and spin, fl flags (grounded, crashed, grab, switch, walking), m mode,
   lk and cl gear and colours, sc style, bt and db best times, sd course seed, lb leaderboard relay, gh ghost, rr and rc race */
function buildPresence(){
  const g=state.gear,L=currentLook();
  return {
    s:[r2(P.x),r2(P.y),r2(P.z),r2(P.h),r1(P.vx),r1(P.vy),r1(P.vz)],
    k:[r2(P.steer),r2(P.tuck),r2(P.brake),r2(P.load)],
    f:[r2(P.visFlip),r2(P.visSpin)],
    fl:(P.grounded?1:0)|(P.crash>0?2:0)|((GRAB_CODE[P.grab]||0)<<2)|(P.sw?32:0)|(P.walk?64:0),
    m:modeCode(),
    lk:[g.skis,g.jacket,g.pants,g.boots],cl:L.c,
    sc:Math.round(state.style),bt:state.best===null?null:r2(state.best),db:state.runBest===null?null:r2(state.runBest),sd:SEED_ID,
    lb:relayBoard(),gh:ghostForPresence(),
    rr:raceInfo(),rc:net.myCall
  };
}
/* send only the fields that changed since last time (or all of them when force is true) */
function netSend(force){
  if(!net.room)return;
  const cur=buildPresence(),patch={};let any=false;
  if(JSON.stringify(cur).length>3600)cur.gh=null;   /* presence is limited to 4 KiB: drop the shared ghost before anything else */
  for(const key in cur){
    const v=cur[key]===undefined?null:cur[key],j=JSON.stringify(v);
    if(force||net.last[key]!==j){net.last[key]=j;patch[key]=v;any=true;}
  }
  if(!any)return;
  try{const pr=net.room.presence(patch);if(pr&&pr.catch)pr.catch(()=>{});}catch(err){}
}

/* ---- joining and leaving a room ---- */
/* leave the current room and remove everyone else's skiers */
function leaveRoom(){
  net.unsubs.forEach(f=>{try{f();}catch(err){}});net.unsubs=[];
  if(net.room&&net.room!==net.cap){try{const r=net.room.leave();if(r&&r.catch)r.catch(()=>{});}catch(err){}}
  net.room=null;net.connected=false;net.last={};net.myCall=null;net.mem={};net.recGhost=null;
  net.remotes.forEach(e=>removeRemote(e));closeInvite();
}
/* join a room by code (or fall back to the lobby). Also picks our starting lane for group races from our peer id. */
async function joinRoom(code){
  if(!net.cap||net.joining)return;
  code=sanitizeRoom(code);
  if(net.room&&net.code===code)return;
  net.joining=true;updateMpUI();
  leaveRoom();
  let r=null;
  try{r=await net.cap.join(code);}catch(err){r=null;}
  if(r){net.code=code;}else{r=net.cap;net.code='the lobby';}
  net.room=r;
  net.error='';
  net.unsubs.push(r.onPeers(()=>onPeers(),e=>{net.error=(e&&e.code)||'error';net.connected=false;updateMpUI();}));
  if(r.onConnection)net.unsubs.push(r.onConnection(c=>{net.connected=!!c;if(c)netSend(true);updateMpUI();},()=>{net.connected=false;updateMpUI();}));
  net.connected=r.connected?r.connected():true;
  net.lane=0;
  try{const me=r.peers().find(p=>p.sameTab);if(me){net.myLabel=me.peer;let h=0;for(let i=0;i<me.peer.length;i++)h=(h*31+me.peer.charCodeAt(i))|0;net.lane=((Math.abs(h)%9)-4)*2.2;}}catch(err){}
  $('roomCode').value=net.code==='the lobby'?'snowchasers':net.code;$('roomCode2').value=$('roomCode').value;
  net.joining=false;
  netSend(true);onPeers();updateMpUI();
}
/* someone joined, left or updated: add, update and remove riders, then refresh the boards and invites */
function onPeers(){
  const room=net.room;if(!room)return;
  const list=room.peers(),have=new Set();
  for(let i=0;i<list.length;i++){
    const p=list[i];if(p.sameTab||p.kind!=='viewer')continue;
    have.add(p.peer);
    let e=net.remotes.get(p.peer);
    if(!e){if(net.remotes.size>=MAX_REMOTE)continue;e=addRemote(p);}
    e.by=p.by;e.guest=p.guest;
    applyPresence(e,p);
  }
  net.remotes.forEach(e=>{if(!have.has(e.peer))removeRemote(e);});
  net.remotes.forEach(e=>{if(e.pr&&e.pr.sd===SEED_ID&&e.pr.lb)mergeRelay(e.pr.lb);});
  adoptRecordGhost();
  resolveNames();checkInvites();updateMpUI();if(!$('board').classList.contains('hidden'))renderBoard();
}
/* at start-up: ask for the user and room capabilities. If they are missing (for example when opened as a local file), stay solo. */
async function initNet(){
  const cl=window.claude;if(!cl||typeof cl.use!=='function')return;
  net.state='checking';updateMpUI();
  try{net.userCap=await cl.use('user');}catch(err){net.userCap=null;}
  try{net.cap=await cl.use('room');}catch(err){net.cap=null;}
  try{net.isOwner=!!(net.userCap&&await net.userCap.isOwner());}catch(err){}
  if(!net.cap){net.state='off';updateMpUI();return;}
  try{const me=net.userCap?await net.userCap.me():null;net.myId=(me&&me.id)||null;}catch(err){}
  net.state='ready';net.ready=true;updateMpUI();
  await joinRoom(sanitizeRoom($('roomCode').value));
}

/* ---- group races: one rider calls it, everyone who joins counts down together ---- */
/* how many riders are in the room, counting you */
function riderCount(){
  if(!net.room)return 1;
  try{let n=0;const l=net.room.peers();for(let i=0;i<l.length;i++){if(!l[i].sameTab&&l[i].kind==='viewer')n++;}return n+1;}catch(err){return net.remotes.size+1;}
}
/* "Call a race": tell everyone and start a 12 second countdown at the summit */
function callRace(){
  if(!net.room||(state.mode!=='explore'&&state.mode!=='results'))return;
  if(net.remotes.size===0){toast('No one else is here yet','Share the link and the room code with friends first.',2800);return;}
  const tok=Math.random().toString(36).slice(2,8),d=12;
  net.myCall={t:tok,d:d};net.seen.add(tok);
  netSend(false);
  joinRace(tok,d);
  toast('Race called','Waiting at the summit while the others join.',2800);
}
/* take part in a group race: go to the summit for the shared countdown */
function joinRace(tok,left){
  closeInvite();closePanels();closeGear();
  state.raceTok=tok;state.raceMP=true;
  beginCountdown(Math.max(1.5,left),true);
}
function closeInvite(){net.invite=null;$('invite').classList.add('hidden');}
/* show "X called a race" with a Join button */
function showInvite(e,rc){
  if(state.mode!=='explore'&&state.mode!=='results')return;
  net.invite={tok:rc.t,left:rc.d,name:peerLabel(e)};
  $('invite').classList.remove('hidden');
}
/* look for race calls we have not seen yet */
function checkInvites(){
  net.remotes.forEach(e=>{
    const rc=e.pr&&e.pr.rc;if(!rc||net.seen.has(rc.t))return;
    net.seen.add(rc.t);showInvite(e,rc);
  });
}
function joinInvite(){if(net.invite&&net.invite.left>1)joinRace(net.invite.tok,net.invite.left);}
$('inviteJoin').addEventListener('click',joinInvite);
$('inviteSkip').addEventListener('click',closeInvite);

/* ---- standings ---- */
/* group race order: finished riders by time, then everyone else by how far down they are */
function standings(){
  if(!state.raceTok)return [];
  const rows=[{name:'You',me:true,fin:state.mode==='results',tm:state.mode==='results'?state.raceT:null,z:P.z}];
  net.remotes.forEach(e=>{const rr=e.pr&&e.pr.rr;if(rr&&rr.t===state.raceTok)rows.push({name:peerLabel(e),me:false,fin:rr.st==='fin'&&rr.tm!==null,tm:rr.tm,z:e.pr.z});});
  rows.sort((a,b)=>{if(a.fin&&b.fin)return a.tm-b.tm;if(a.fin)return -1;if(b.fin)return 1;return b.z-a.z;});
  return rows;
}
/* write the standings into a panel */
function fillBoard(el,title){
  el.innerHTML='';
  const h=document.createElement('div');h.className='bh';h.textContent=title;el.appendChild(h);
  standings().forEach((r,i)=>{
    const row=document.createElement('div');row.className='brow'+(r.me?' me':'');
    const a=document.createElement('span'),b=document.createElement('span');
    a.textContent=(i+1)+'. '+r.name;
    b.textContent=r.fin?fmt(r.tm):(state.mode==='countdown'?'at the summit':Math.round(clamp((r.z-SUMMIT_Z)/(FINISH_Z-SUMMIT_Z),0,1)*100)+'%');
    row.appendChild(a);row.appendChild(b);el.appendChild(row);
  });
}
/* show or hide the live race standings and the group results */
function renderBoards(){
  const racing=state.raceMP&&state.raceTok&&(state.mode==='countdown'||state.mode==='race');
  $('wrapRace').classList.toggle('hidden',!racing);
  if(racing)fillBoard($('raceBoard'),'Group race');
  const res=state.raceMP&&state.raceTok&&state.mode==='results';
  $('rBoard').classList.toggle('hidden',!res);
  if(res)fillBoard($('rBoard'),'Group race results');
  $('rTogether').classList.toggle('hidden',!(net.room&&net.remotes.size>0&&state.mode==='results'));
}

/* ---- riders panel and room UI ---- */
/* close the Riders, Menu and Leaderboard panels */
function closePanels(){['riders','menu','board'].forEach(id=>$(id).classList.add('hidden'));}
/* R or the people button opens the Riders panel */
function toggleRiders(){
  if(!net.ready||state.mode==='title'||state.mode==='reveal'||state.mode==='results')return;
  const el=$('riders');closeGear();el.classList.toggle('hidden');
  if(!el.classList.contains('hidden'))updateMpUI();
}
/* "Go to": jump to just behind another rider */
function meetUp(e){
  if(state.mode!=='explore'||!e||!e.pr)return;
  const s=e.s;placePlayer(s.x-Math.sin(s.h)*7,s.z-Math.cos(s.h)*7,s.h);P.grace=2;snapCamera();closePanels();
  toast('Meeting up','You are right behind '+peerLabel(e)+'.',1800);
}
/* the status text for the multiplayer box: mpMessage returns [short status, longer note] */
const MP_SHARE='To play with a friend: open Share on this artifact, invite them by email, and have them sign in to claude.ai. Then you both open the page and enter the same room code.';
function mpMessage(){
  if(net.state==='checking')return ['Checking...','Looking for the multiplayer room.'];
  if(net.state==='off')return net.isOwner
    ?['Solo only','This view could not reach the multiplayer room. Open the page from claude.ai while signed in. '+MP_SHARE]
    :['Solo only','Multiplayer is off for you on this page. It needs a signed-in claude.ai account that the owner invited (Share menu) or that belongs to the owner\'s organization. You can still play solo.'];
  if(net.error==='not_granted'||net.error==='revoked')return ['Not admitted','You are not allowed in this room. Ask the owner to invite you from the Share menu, then reload.'];
  if(net.error)return ['Connection problem','The room connection failed ('+net.error+'). Reload the page to try again.'];
  return [null,net.isOwner?'Everyone who enters the same code rides the same mountain. '+MP_SHARE:'Everyone who enters the same code rides the same mountain. Pick your own code for a private group.'];
}
/* refresh the multiplayer box, the riders button and its count */
function updateMpUI(){
  $('mpBox').classList.toggle('hidden',net.state==='none');
  const mm=mpMessage();$('mpNote').textContent=mm[1];
  $('mpRow').classList.toggle('hidden',net.state!=='ready'||!!net.error);
  const show=net.ready&&state.mode!=='title'&&state.mode!=='reveal'&&state.mode!=='results';
  $('ridersBtn').classList.toggle('hidden',!show);
  const count=net.room?riderCount():0;
  let st=!net.room?(net.joining?'Joining...':''):(net.connected?(count<=1?'Connected. Waiting for friends in "'+net.code+'".':count+' riders in "'+net.code+'"'):'Connecting...');
  if(mm[0])st=mm[0];
  $('mpStatus').textContent=st;
  $('ridersBadge').textContent=String(Math.max(1,count));
  if(!$('riders').classList.contains('hidden'))renderRiders(st);
}
/* fill the Riders panel: you first, then everyone else with a Go to button */
function renderRiders(st){
  $('ridersStatus').textContent=st;
  const list=$('ridersList');list.innerHTML='';
  const rows=[{me:true,name:'You',sc:state.style,bt:state.best,mode:state.mode==='race'?'r':state.mode==='countdown'?'c':'x'}];
  net.remotes.forEach(e=>{if(e.pr)rows.push({me:false,e:e,name:peerLabel(e)+(e.guest?' (guest)':''),sc:e.pr.sc,bt:e.pr.bt,mode:e.pr.mode});});
  rows.forEach(r=>{
    const row=document.createElement('div');row.className='rrow'+(r.me?' me':'');
    const nm=document.createElement('div');nm.className='rn';nm.textContent=r.name;
    const info=document.createElement('div');info.className='ri';
    info.textContent=(MODE_NAME[r.mode]||'Exploring')+'. '+fmtN(r.sc)+' style'+(r.bt!==null&&r.bt!==undefined?', best race '+fmt(r.bt):'');
    row.appendChild(nm);row.appendChild(info);
    if(!r.me){const b=document.createElement('button');b.className='chip';b.textContent='Go to';b.addEventListener('click',()=>meetUp(r.e));row.appendChild(b);}
    list.appendChild(row);
  });
  $('roomCode2').placeholder=net.code;
}
/* room code box and Riders panel buttons */
function switchRoom(v){joinRoom(sanitizeRoom(v));}
$('roomJoin').addEventListener('click',()=>switchRoom($('roomCode').value));
$('roomSwitch').addEventListener('click',()=>switchRoom($('roomCode2').value||$('roomCode').value));
$('roomCode').addEventListener('keydown',e=>{if(e.code==='Enter'||e.key==='Enter'){e.stopPropagation&&e.stopPropagation();switchRoom($('roomCode').value);}});
$('roomCode2').addEventListener('keydown',e=>{if(e.code==='Enter'||e.key==='Enter'){e.stopPropagation&&e.stopPropagation();switchRoom($('roomCode2').value);}});
$('ridersBtn').addEventListener('click',toggleRiders);
onDouble($('riders'),()=>closePanels());
$('ridersClose').addEventListener('click',closePanels);
$('callRace').addEventListener('click',callRace);
$('rTogether').addEventListener('click',callRace);
/* every frame: send our state about 12 times a second, count down an invite, refresh the boards and status */
function netTick(dt){
  if(net.room){
    net.sendT+=dt;
    if(net.sendT>=(state.mode==='title'?0.5:1/12)){net.sendT=0;netSend(false);}
  }
  if(net.invite){
    net.invite.left-=dt;
    if(net.invite.left<=1)closeInvite();else $('inviteTxt').textContent=net.invite.name+' called a race on the Lost Line. Starting in '+Math.ceil(net.invite.left)+' s.';
  }
  net.boardT+=dt;if(net.boardT>0.25){net.boardT=0;renderBoards();}
  net.uiT+=dt;if(net.uiT>1){net.uiT=0;updateMpUI();}
}

/* ================= leaderboard =================
   There is no server. Every rider publishes their own best times, and whoever is in the room remembers the times of riders who have
   left and passes them on to people who join. So the board lasts while anyone is in the room and is gone when the room empties. */
let boardTab='ll';
const memKey=e=>e.by||('p:'+e.peer);
const plausible=t=>t>=20&&t<=900;
function memName(k){return (k.charAt(0)!=='p'||k.charAt(1)!==':')?(net.names[k]||'Rider'):('Rider '+k.slice(-3).toUpperCase());}
/* leaderboard rows for 'll' (Lost Line) or 'ds' (descent): you, riders here on the same seed, and remembered riders who left */
function boardEntries(kind){
  const rows=[],present=new Set(),me=net.myId||'me';
  const mine=kind==='ll'?state.best:state.runBest;
  if(mine!==null)rows.push({id:me,name:'You',t:mine,me:true,present:true});
  net.remotes.forEach(e=>{
    const pr=e.pr;if(!pr)return;const k=memKey(e);present.add(k);
    if(pr.sd!==SEED_ID)return;
    const t=kind==='ll'?pr.bt:pr.db;if(t!==null&&t!==undefined&&plausible(t))rows.push({id:k,name:peerLabel(e),t:t,present:true});
  });
  Object.keys(net.mem).forEach(k=>{
    if(k===me||present.has(k))return;
    const m=net.mem[k],t=kind==='ll'?m.ll:m.ds;if(t!==null&&t!==undefined&&plausible(t))rows.push({id:k,name:memName(k),t:t,present:false});
  });
  rows.sort((a,b)=>a.t-b.t);
  return rows;
}
/* what we pass on for riders who have left, so people who join later still see them */
function relayBoard(){
  const out={l:[],d:[]},me=net.myId||'me',present=new Set();
  net.remotes.forEach(e=>{present.add(memKey(e));});
  [['l','ll'],['d','ds']].forEach(a=>{
    const arr=[];Object.keys(net.mem).forEach(k=>{if(k===me||present.has(k))return;const t=net.mem[k][a[1]];if(t!==null&&t!==undefined)arr.push([k,r2(t)]);});
    arr.sort((x,y)=>x[1]-y[1]);out[a[0]]=arr.slice(0,8);
  });
  return (out.l.length||out.d.length)?out:null;
}
/* take in the remembered times other riders pass on, keeping the best for each rider */
function mergeRelay(lb){
  if(!lb)return;
  const me=net.myId||'me',present=new Set();net.remotes.forEach(e=>{present.add(memKey(e));});
  [['l','ll'],['d','ds']].forEach(a=>{
    (lb[a[0]]||[]).forEach(en=>{
      const k=en[0],t=en[1];
      if(typeof k!=='string'||k.length>64||k===me||present.has(k))return;
      if(!plausible(t))return;
      const m=net.mem[k]||(net.mem[k]={ll:null,ds:null});
      if(m[a[1]]===null||t<m[a[1]])m[a[1]]=t;
    });
  });
}
/* keep a leaving rider's best times */
function rememberLeaver(e){
  const pr=e.pr;if(!pr||pr.sd!==SEED_ID)return;
  const k=memKey(e);
  if((pr.bt!==null&&pr.bt!==undefined)||(pr.db!==null&&pr.db!==undefined))net.mem[k]={ll:(pr.bt===undefined?null:pr.bt),ds:(pr.db===undefined?null:pr.db)};
}
/* the room's record ghost: the fastest Lost Line ghost anyone in the room is holding */
function recordHolderIsMe(){
  if(!GH.ll)return false;
  const rows=boardEntries('ll');return rows.length>0&&rows[0].me===true;
}
function ghostForPresence(){
  const me=net.myId||'me';
  if(opt.ghosts&&recordHolderIsMe())return {o:me,t:GH.ll.t,b:GH.ll.b,k:[GH.ll.look?GH.ll.look.skis:'std',GH.ll.look?GH.ll.look.jacket:'std',GH.ll.look?GH.ll.look.pants:'std',GH.ll.look?GH.ll.look.boots:'std'],c:GH.ll.look?GH.ll.look.c:null};
  const rg=net.recGhost;
  if(rg&&rg.o!==me){
    let present=false;net.remotes.forEach(e=>{if(memKey(e)===rg.o)present=true;});
    if(!present&&isElector())return {o:rg.o,t:rg.g.t,b:rg.g.b,k:rg.k||null,c:rg.c||null};
  }
  return null;
}
/* when the record holder has left, one rider (the one with the smallest id) keeps sharing their ghost */
function isElector(){
  if(!net.myLabel)return false;
  let smallest=net.myLabel;net.remotes.forEach(e=>{if(e.peer<smallest)smallest=e.peer;});
  return smallest===net.myLabel;
}
/* use the fastest ghost anyone in the room is sharing as the room record ghost */
function adoptRecordGhost(){
  let best=null;
  net.remotes.forEach(e=>{
    const gh=e.pr&&e.pr.gh;if(!gh||e.pr.sd!==SEED_ID)return;
    if(!best||gh.t<best.t)best=gh;
  });
  const cur=net.recGhost;
  if(best&&(!cur||best.t<cur.g.t-0.001||(best.o===cur.o&&best.t!==cur.g.t))){
    if(!decodeGhost(best))return;
    const look=best.k?{skis:best.k[0],jacket:best.k[1],pants:best.k[2],boots:best.k[3],c:best.c||currentLook().c}:null;
    net.recGhost={o:best.o,g:{t:best.t,b:best.b,look:look},k:best.k,c:best.c};
  }
  /* my own record counts too */
  if(GH.ll&&recordHolderIsMe()&&(!net.recGhost||GH.ll.t<net.recGhost.g.t||net.recGhost.o===(net.myId||'me'))){
    net.recGhost={o:net.myId||'me',g:GH.ll,k:null,c:null};
  }
}

/* ---- leaderboard panel ---- */
/* fill the Leaderboard panel with the top 10 for the chosen tab */
function renderBoard(){
  const list=$('boardList');list.innerHTML='';
  const rows=boardEntries(boardTab);
  $('boardNote').textContent=(net.room?'Course seed '+GAME_SEED+' in room "'+net.code+'". Shared with everyone here, kept while anyone is in the room and cleared when it empties. ':'Course seed '+GAME_SEED+'. Join a room to compare with friends. ')+'Your own best times stay saved on this device.';
  $('tabLL').classList.toggle('on',boardTab==='ll');$('tabDS').classList.toggle('on',boardTab==='ds');
  if(!rows.length){const d=document.createElement('div');d.className='note';d.textContent=boardTab==='ll'?'No Lost Line times yet. Race it to get on the board.':'No descent times yet. Ski down to the base lodge.';list.appendChild(d);}
  rows.slice(0,10).forEach((r,i)=>{
    const row=document.createElement('div');row.className='lrow'+(r.me?' me':'')+(r.present?'':' away');
    const rk=document.createElement('div');rk.className='rk';rk.textContent=String(i+1);
    const nm=document.createElement('div');nm.className='nm';nm.textContent=r.name+(r.present?'':' (away)');
    const tm=document.createElement('div');tm.className='tm';tm.textContent=fmt(r.t);
    const dl=document.createElement('div');dl.className='dl';dl.textContent=i===0?'':'+'+(r.t-rows[0].t).toFixed(2);
    row.appendChild(rk);row.appendChild(nm);row.appendChild(tm);row.appendChild(dl);list.appendChild(row);
  });
  ['Off','Mine','Rec'].forEach(k=>{const id='gs'+k;const v=k==='Off'?'off':(k==='Mine'?'mine':'rec');$(id).classList.toggle('on',opt.ghostSrc===v);});
  $('gsRec').classList.toggle('locked',!net.recGhost);
}
/* B or the trophy button */
function toggleBoard(){
  if(state.mode==='title'||state.mode==='reveal')return;
  const was=$('board').classList.contains('hidden');closeGear();closePanels();
  if(was){$('board').classList.remove('hidden');renderBoard();}
}
$('boardBtn').addEventListener('click',toggleBoard);
$('boardClose').addEventListener('click',()=>closePanels());
onDouble($('board'),()=>closePanels());
$('tabLL').addEventListener('click',()=>{boardTab='ll';renderBoard();});
$('tabDS').addEventListener('click',()=>{boardTab='ds';renderBoard();});
[['gsOff','off'],['gsMine','mine'],['gsRec','rec']].forEach(a=>$(a[0]).addEventListener('click',()=>{
  if(a[1]==='rec'&&!net.recGhost){toast('No record ghost yet','The record holder has to be in the room.',2200);return;}
  opt.ghostSrc=a[1];opt.ghosts=a[1]!=='off';renderBoard();saveSoon();
}));
