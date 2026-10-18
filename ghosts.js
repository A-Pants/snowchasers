/* ghosts.js: ghost replays. Your best run is recorded, packed into a short text code, saved, and replayed as a see-through skier you can race.
   The top half packs and unpacks recordings; the bottom half records new runs and plays ghosts back. */
'use strict';
/* ================= ghosts: record a run, replay it as a see-through rider. No collisions: a ghost is only drawn. ================= */
/* base64 turns bytes into plain text, so a recording fits in saved data and in multiplayer messages */
const B64='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64enc(bytes){
  let o='';
  for(let i=0;i<bytes.length;i+=3){
    const a=bytes[i],b=bytes[i+1],c=bytes[i+2];
    o+=B64[a>>2]+B64[((a&3)<<4)|((b||0)>>4)]+(i+1<bytes.length?B64[((b&15)<<2)|((c||0)>>6)]:'=')+(i+2<bytes.length?B64[c&63]:'=');
  }
  return o;
}
function b64dec(str){
  const lut={};for(let i=0;i<64;i++)lut[B64[i]]=i;
  const out=[];let buf=0,bits=0;
  for(let i=0;i<str.length;i++){
    const ch=str[i];if(ch==='=')break;
    const v=lut[ch];if(v===undefined)return null;
    buf=(buf<<6)|v;bits+=6;
    if(bits>=8){bits-=8;out.push((buf>>bits)&255);buf&=(1<<bits)-1;}
  }
  return out;
}
/* a run is sampled every 0.25 s as [z, x, height above the snow]: 5 bytes each, so a minute is about 1.6 KB of text */
function encodeGhost(samples,time){
  const bytes=[];
  samples.forEach(s=>{
    const z=Math.max(0,Math.min(65535,Math.round((s[0]+400)*16))),x=Math.max(0,Math.min(65535,Math.round(s[1]*16)+32768)),u=Math.max(0,Math.min(255,Math.round(s[2]*10)));
    bytes.push(z>>8,z&255,x>>8,x&255,u);
  });
  return {t:Math.round(time*100)/100,b:b64enc(bytes)};
}
function decodeGhost(g){
  if(!g||typeof g.b!=='string'||!(g.t>0))return null;
  const raw=b64dec(g.b);if(!raw)return null;
  const n=Math.floor(raw.length/5);if(n<2||n>1200)return null;
  const z=new Float32Array(n),x=new Float32Array(n),u=new Float32Array(n);
  for(let i=0;i<n;i++){const o=i*5;z[i]=((raw[o]<<8)|raw[o+1])/16-400;x[i]=(((raw[o+2]<<8)|raw[o+3])-32768)/16;u[i]=raw[o+4]/10;}
  return {n:n,z:z,x:x,u:u,t:+g.t,dt:+g.t/(n-1)};
}
/* position, heading and speed of a ghost at run-time tau */
function ghostAt(G,tau,out){
  const f=Math.max(0,Math.min(G.n-1,tau/G.dt)),i=Math.min(G.n-2,Math.floor(f)),a=f-i;
  out.x=G.x[i]+(G.x[i+1]-G.x[i])*a;out.z=G.z[i]+(G.z[i+1]-G.z[i])*a;out.up=G.u[i]+(G.u[i+1]-G.u[i])*a;
  const j0=Math.max(0,i-1),j1=Math.min(G.n-1,i+2),dx=G.x[j1]-G.x[j0],dz=G.z[j1]-G.z[j0];
  if(Math.hypot(dx,dz)>0.01)out.h=Math.atan2(dx,dz);
  out.sp=Math.hypot(G.x[i+1]-G.x[i],G.z[i+1]-G.z[i])/G.dt;
  return out;
}
/* when did the ghost reach down-course position z? (used for the live time difference) */
function ghostTimeAtZ(G,z,from){
  let i=Math.max(0,Math.min(G.n-2,from||0));
  while(i<G.n-2&&G.z[i+1]<z)i++;
  while(i>0&&G.z[i]>z)i--;
  const z0=G.z[i],z1=G.z[i+1],a=z1>z0?Math.max(0,Math.min(1,(z-z0)/(z1-z0))):0;
  return {t:(i+a)*G.dt,i:i,beyond:z>G.z[G.n-1]+2};
}

/* ================= ghost recording and playback ================= */
/* recording. REC.kind is 'l' (Lost Line race) or 'd' (descent). recTick takes a sample 4 times a second; recFinish returns the packed run. */
const REC={on:false,kind:'',acc:0,buf:[]};
function recSample(){REC.buf.push([P.z,P.x,Math.max(0,P.y-H(P.x,P.z))]);}
function recStart(kind){REC.on=true;REC.kind=kind;REC.acc=0;REC.buf=[];recSample();}
function recAbort(){REC.on=false;REC.buf=[];}
function recTick(dt){if(!REC.on)return;REC.acc+=dt;while(REC.acc>=0.25){REC.acc-=0.25;recSample();}}
function recFinish(time){if(!REC.on)return null;recSample();REC.on=false;const g=REC.buf.length>8?encodeGhost(REC.buf,time):null;REC.buf=[];return g;}

/* playback: one ghost at a time, with its own see-through skier and name tag */
const GP={rider:null,tag:null,S:null,G:null,kind:'',active:false,idx:0,hold:0,delta:null,prevH:0,pose:{x:0,z:0,up:0,h:0,sp:0}};
/* make a rider see-through */
function ghostify(R){[R.group,R.shadowWrap].forEach(g=>g.traverse(o=>{if(o.material){o.material.transparent=true;o.material.opacity=0.4;o.material.depthWrite=false;}}));}
/* which ghost to race: the room record (if chosen and there is one), your own best, or none */
function ghostSource(kind){
  if(!opt.ghosts||opt.ghostSrc==='off')return null;
  if(opt.ghostSrc==='rec'&&kind==='l'&&net.recGhost)return {g:net.recGhost.g,name:'Record: '+recGhostName()+' '+fmt(net.recGhost.g.t)};
  const g=kind==='l'?GH.ll:GH.ds;
  return g?{g:g,name:'Your best '+fmt(g.t)}:null;
}
const recGhostName=()=>net.recGhost?(net.recGhost.o===(net.myId||'me')?'You':memName(net.recGhost.o)):'';
/* start a ghost for a race ('l') or a descent ('d') */
function ghostStart(kind){
  ghostStop();
  const src=ghostSource(kind);if(!src)return;
  const G=decodeGhost(src.g);if(!G)return;
  GP.G=G;GP.kind=kind;GP.active=true;GP.idx=0;GP.hold=0;GP.delta=null;
  if(!GP.rider){
    GP.rider=makeRider();ghostify(GP.rider);scene.add(GP.rider.group);scene.add(GP.rider.shadowWrap);
    GP.S={x:0,y:0,z:0,h:0,vx:0,vy:0,vz:0,grounded:true,steer:0,tuck:0.5,brake:0,load:0,crash:0,crashT:0,visFlip:0,visSpin:0,grab:null,sw:false,walk:false};
    GP.tag=makeTag();scene.add(GP.tag);
  }
  setRiderLook(GP.rider,src.g.look||currentLook());
  drawTag(GP.tag,'Ghost: '+src.name,'#7fd8ff');
  const o=GP.pose;ghostAt(G,0,o);GP.S.x=o.x;GP.S.z=o.z;GP.S.h=o.h;GP.prevH=o.h;
  GP.rider.group.visible=true;GP.rider.shadowWrap.visible=true;GP.tag.visible=true;
}
function ghostStop(){
  GP.active=false;GP.G=null;GP.delta=null;
  if(GP.rider){GP.rider.group.visible=false;GP.rider.shadowWrap.visible=false;GP.tag.visible=false;}
}
/* " | Ghost -1.25 s" for the timer. Minus means you are ahead of the ghost. */
const ghostSuffix=()=>(GP.active&&GP.delta!==null)?' | Ghost '+(GP.delta<=0?'-':'+')+Math.abs(GP.delta).toFixed(2)+' s':'';
/* every frame: move the ghost to where it was at this time in its run, and work out how far ahead or behind you are */
function updateGhost(dt){
  if(!GP.active||!GP.G)return;
  const G=GP.G,o=GP.pose,S=GP.S;
  let clock;
  if(GP.kind==='l'){
    if(state.mode!=='countdown'&&state.mode!=='race'&&state.mode!=='results'){ghostStop();return;}
    clock=(state.mode==='countdown')?0:state.raceT;
  } else if(state.runOn){clock=state.runT;}
  else if(GP.hold>0){GP.hold-=dt;clock=G.t;if(GP.hold<=0){ghostStop();return;}}
  else{ghostStop();return;}
  ghostAt(G,clock,o);
  S.h+=angdiff(o.h,S.h)*Math.min(1,dt*8);
  S.steer=clamp(-angdiff(o.h,GP.prevH)/Math.max(dt,1e-3)*0.3,-1,1)*0.7+S.steer*0.3;GP.prevH=o.h;
  S.x=o.x;S.z=o.z;S.y=H(S.x,S.z)+o.up;S.grounded=o.up<0.35;S.vx=Math.sin(S.h)*o.sp;S.vz=Math.cos(S.h)*o.sp;S.vy=0;
  poseRider(GP.rider,S,dt);
  const cp=camera.position,dist=Math.hypot(S.x-cp.x,S.y-cp.y,S.z-cp.z),h=clamp(dist*0.04,0.45,3.2);
  GP.tag.position.set(S.x,S.y+3.1,S.z);GP.tag.scale.set(h*4,h,1);GP.tag.visible=dist<300;
  /* how far ahead or behind the ghost you are, at your current place on the course */
  if(clock>0&&(state.mode==='race'||state.runOn)){const r=ghostTimeAtZ(G,P.z,GP.idx);GP.idx=r.i;GP.delta=r.beyond?null:(clock-r.t);}
}
