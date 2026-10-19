/* terrain.js: the map. Where the Lost Line runs, where jumps go, how high the snow is at any point, and where trees and rocks block you.
   Pure maths with no drawing: world.js turns it into 3D meshes and player.js uses it for physics. */
'use strict';
/* ================= maths helpers and course constants ================= */
/* gravity in metres per second squared (real gravity is 9.8; stronger feels snappier in the air) */
const G=22;
/* clamp keeps v between a and b, lerp blends from a to b, smooth is an S-shaped ramp from 0 to 1, angdiff is the shortest turn between two angles */
const clamp=(v,a,b)=>v<a?a:(v>b?b:v);
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const angdiff=(a,b)=>{let d=a-b;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;return d;};
/* the Lost Line: for a distance z down the mountain, the x position of the racing line. Gates and line jumps follow it.
   On other mountains the same curve is the main groomed run, which stays clear of trees. */
const lineX=z=>38*Math.sin(z*0.0105)+16*Math.sin(z*0.027+1.0);
/* z runs downhill: the summit is at -270, the normal start at 10 and the finish line at 1590. x runs across the slope.
   At Lake Tahoe you start by the summit station and the finish is the base lodge, just above the lake shore. */
const FINISH_Z=TUTORIAL?1590:1520, START_Z=TUTORIAL?10:-185, SUMMIT_Z=-270;
/* how far you can go: x from -XMAX to XMAX, z from ZMIN to ZMAX (at Tahoe ZMAX stops you at the water's edge) */
const XMAX=410, ZMIN=-312, ZMAX=TUTORIAL?1745:1605;

/* three jump types: small wood, big wood and cliff (rock). All share one profile: a rising ramp, a lip, then a drop. */
const JT={
  ws:{type:'wood',size:'small',w:3.2,len:10,h:2.3,drop:3.5,pow:1.6,soft:0.12},
  wb:{type:'wood',size:'big',w:5,len:22,h:7.5,drop:4,pow:1.7,soft:0.12},
  cl:{type:'cliff',size:'big',w:11,len:34,h:16,drop:4,pow:1.4,soft:0.4}
};
/* every jump on the course, filled in below */
const JUMPS=[];
/* the 14 race gates, one every 128 m down the Lost Line */
const GATE_ZS=[];for(let i=0;i<14;i++)GATE_ZS.push(-200+i*128);
const SITES=[[68,240,26],[-92,960,30],[98,1350,24],[0,10,28]];   /* outpost, shelter, cave, start: keep jumps clear */
/* add a jump of type 'ws', 'wb' or 'cl' (see JT) at x,z. line=true when it sits on the Lost Line. */
function addJump(kind,z,x,line){const j=Object.assign({kind:kind,x:x,z:z,line:!!line},JT[kind]);JUMPS.push(j);return j;}
/* true if a jump here would not overlap a landmark, a race gate or another jump */
function jumpFits(kind,z,x,line){
  const t=JT[kind],z0=z-t.len-5,z1=z+t.drop+48;
  for(let i=0;i<SITES.length;i++){const s=SITES[i];if(Math.abs(s[0]-x)<t.w+s[2]&&s[1]>z0-s[2]&&s[1]<z1+s[2])return false;}
  for(let i=0;i<GATE_ZS.length;i++){const g=GATE_ZS[i];if(g>=z0&&g<=z+t.drop+(line?34:14)&&Math.abs(lineX(g)-x)<t.w+9)return false;}
  for(let i=0;i<JUMPS.length;i++){const k=JUMPS[i];if(Math.abs(k.x-x)<k.w+t.w+10&&!(k.z-k.len-8>z1||z0-8>k.z+k.drop+48))return false;}
  return true;
}
/* line jumps: you cannot steer in the air, so pick the spot where the Lost Line stays closest to a straight run
   through the ramp, the flight and the landing, and the jump can be taken head on */
function lineDev(q,t){
  const xc=lineX(q-t.len*0.5),sl=(lineX(q)-lineX(q-t.len))/t.len;let m=0;
  for(let z=q-t.len;z<=q+t.drop+55;z+=4){m=Math.max(m,Math.abs(lineX(z)-(xc+sl*(z-(q-t.len*0.5)))));}
  return m;
}
function placeLineJump(kind,z){
  const t=JT[kind];let best=null,bs=1e9;
  for(let q=z-90;q<=z+90;q+=2){
    const x=lineX(q-t.len*0.5),dev=lineDev(q,t);
    if(dev<bs&&dev<4&&jumpFits(kind,q,x,true)){bs=dev;best=q;}
  }
  if(best!==null){const j=addJump(kind,best,lineX(best-t.len*0.5),true);j.dev=bs;}
}
/* other jumps: nudge along z until the spot is clear */
function placeFree(kind,z,x){
  const offs=[0,18,-18,36,-36,54,-54,72,-72];
  for(let i=0;i<offs.length;i++){if(jumpFits(kind,z+offs[i],x,false)){addJump(kind,z+offs[i],x,false);return;}}
}
if(TUTORIAL){
/* place every jump. The Edge must be first: quests.js puts map fragment II at JUMPS[0]. */
addJump('cl',610,-62,false);                       /* The Edge (map fragment II) */
[['ws',-128],['wb',128],['ws',384],['wb',632],['ws',768],['wb',1020],['ws',1150],['wb',1404]].forEach(a=>placeLineJump(a[0],a[1]));   /* on the Lost Line */
[[255,-30],[500,30],[890,-30],[1270,30]].forEach(a=>placeFree('cl',a[0],lineX(a[0]-15)+a[1]));   /* risky cliffs beside the line */
[['ws',30,40],['wb',200,-52],['ws',330,-26],['ws',460,58],['wb',700,52],['ws',830,-40],['wb',1090,-58],['ws',1220,44],['wb',1330,-46],['ws',1480,-30],['ws',560,40],['wb',1190,-20],
  ['wb',300,105],['ws',560,-105],['wb',860,125],['cl',1000,125],['ws',1160,-115],['wb',1400,105],['cl',1440,-130],['ws',150,-115],['ws',640,120],['wb',1010,-130],['cl',350,-135],['ws',930,135]].forEach(a=>placeFree(a[0],a[1],a[2]));   /* free ride */
} else {
  /* Lake Tahoe has no built jumps, only natural granite drops away from the groomed run */
  [[120,-125],[300,140],[545,-75],[820,170],[1050,-150],[1250,95],[690,-210],[400,230]].forEach(a=>addJump('cl',a[0],a[1],false));
}

/* how much jump k raises the snow at x,z (0 when you are not on it). This is what shapes a ramp into the ground. */
function kick(k,x,z){
  const dz=z-k.z;if(dz<-k.len||dz>k.drop)return 0;
  const ax=Math.abs(x-k.x);if(ax>k.w*1.5)return 0;
  const lat=1-smooth(k.w*(1-k.soft),k.w*(1+k.soft),ax);
  if(lat<=0)return 0;
  const t=dz<=0?Math.pow(1+dz/k.len,k.pow):1-smooth(0,k.drop,dz);
  return k.h*t*lat;
}
/* the snow height at x,z before the landmark pads are levelled: one long slope, a valley shape, gentle bumps and the jumps */
function rawH(x,z){
  if(!TUTORIAL)return tahoeH(x,z);
  const a=-0.31*z,b=-500;
  const base=0.5*(a+b+Math.sqrt((a-b)*(a-b)+2500));
  const ax=Math.abs(x);
  const wall=ax*ax/57600*40+Math.pow(Math.max(0,ax-250)/170,2)*180;   /* a valley about 1.6 times wider, with steep rock walls at the far edges */
  const fade=smooth(1650,1450,z);
  const n=(Math.sin(x*0.045+z*0.021)*3.2+Math.sin(x*0.11-z*0.05)*1.2+Math.sin(z*0.036+1.3)*2.8+Math.sin(x*0.021+z*0.012)*5)*0.6*fade;
  let h=base+wall+n;
  for(let i=0;i<JUMPS.length;i++) h+=kick(JUMPS[i],x,z);
  h+=smooth(1690,1760,z)*120+smooth(-285,-312,z)*90;
  return h;
}
/* Lake Tahoe: a steep granite bowl under a summit peak, framed by two ridges, then long forested runs that end at the lake.
   The shore drops away below the water, and the slope keeps going down out of sight under the lake. */
function tahoeH(x,z){
  const ax=Math.abs(x);
  let h=-0.30*z+80*(1-smooth(-250,450,z));                                  /* the long run down, steeper up in the bowl */
  h-=70*smooth(1480,1700,z);                                               /* the shore falls away under the water */
  h+=(ax*ax/57600*40+40*smooth(250,480,ax))*(1-0.85*smooth(1350,1650,z));   /* gentle forested valley sides, opening out into a wide beach at the shore */
  h+=55*(1-smooth(150,900,z))*Math.exp(-Math.pow((ax-175)/70,2));         /* two ridges framing the summit bowl */
  h+=45*Math.exp(-(x*x+(z+290)*(z+290))/8100);                             /* the summit peak */
  const fade=smooth(1600,1400,z);
  h+=(Math.sin(x*0.05+z*0.023)*4+Math.sin(x*0.13-z*0.06)*1.6+Math.sin(z*0.04+0.7)*3+Math.sin(x*0.024+z*0.014)*6)*0.7*fade;
  for(let i=0;i<JUMPS.length;i++) h+=kick(JUMPS[i],x,z);
  h+=smooth(-285,-312,z)*90;                                               /* the ridge behind the summit */
  return h;
}
/* the lake's surface height (only used at Tahoe) */
const WATER_Y=TUTORIAL?null:tahoeH(0,1628);
/* flat pads so buildings sit level. Tutorial: the outpost, the shelter and the cave. Tahoe: the summit station, a mid-mountain hut, the base lodge and the hidden board cache. */
const PADS=TUTORIAL?[{x:68,z:240,r:11},{x:-92,z:960,r:15},{x:98,z:1350,r:9}]:[{x:42,z:-222,r:10},{x:-140,z:760,r:9},{x:70,z:1548,r:14},{x:-258,z:1010,r:6}];
PADS.forEach(p=>{p.h=rawH(p.x,p.z);});
/* H(x,z) is the height of the snow at any point. Almost everything uses it: physics, trees, the camera, the minimap. */
function H(x,z){
  let h=rawH(x,z);
  for(let i=0;i<PADS.length;i++){
    const p=PADS[i],d=Math.hypot(x-p.x,z-p.z);
    if(d<p.r+12){ h+=(p.h-h)*smooth(p.r+12,p.r,d); }
  }
  return h;
}
/* grad(x,z,o) writes the slope at x,z into o.x and o.z (how fast the snow rises in each direction). _g is a shared scratch object for it. */
const _g={x:0,z:0};
function grad(x,z,o){const e=1.2;o.x=(H(x+e,z)-H(x-e,z))/(2*e);o.z=(H(x,z+e)-H(x,z-e))/(2*e);}

/* obstacle hash (trees, rocks, buildings) */
/* the map is split into 12 m squares so a collision check only looks at nearby obstacles. Each obstacle is [x, z, radius]. */
const OBS=new Map();
function addObstacle(x,z,r){const k=Math.floor(x/12)+','+Math.floor(z/12);let a=OBS.get(k);if(!a){a=[];OBS.set(k,a);}a.push([x,z,r]);}
/* returns the obstacle that a circle of radius pr at x,z overlaps, or null if there is none */
function hitObstacle(x,z,pr){
  const cx=Math.floor(x/12),cz=Math.floor(z/12);
  for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){
    const a=OBS.get((cx+i)+','+(cz+j)); if(!a) continue;
    for(let n=0;n<a.length;n++){const o=a[n];if(Math.hypot(x-o[0],z-o[1])<o[2]+pr)return o;}
  }
  return null;
}

/* ================= seeded random ================= */
/* rng() gives a random number from 0 to 1. The sequence is the same every time for the same seed, so a seed always grows the same forest. */
const rng=(function(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};})(GAME_SEED);
