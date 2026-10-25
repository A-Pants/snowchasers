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
/* z runs downhill and x runs across the slope. Each mountain sets where you start, where the finish line is and how far down you can go.
   Tutorial: start at 10, finish at 1590. Lake Tahoe: start by the summit station, finish at the base lodge just above the lake shore
   (ZMAX stops you at the water). Mount Washington: start below the summit buildings, finish at the Pinkham Notch lodge.
   Yellowstone: start below Mount Washburn's lookout, finish in the hot-spring basin. */
const COURSE=TUTORIAL?{start:10,finish:1590,zmax:1745}:TAHOE?{start:-185,finish:1520,zmax:1605}:WASH?{start:-245,finish:1560,zmax:1700}:{start:-240,finish:1520,zmax:1640};
const FINISH_Z=COURSE.finish, START_Z=COURSE.start, SUMMIT_Z=-270;
const XMAX=410, ZMIN=-312, ZMAX=COURSE.zmax;

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
} else if(YELL){
  /* Mount Washburn: a few volcanic rock bands to drop off on the open upper slopes */
  [[150,140],[320,-150],[600,170],[880,-160],[460,-60]].forEach(a=>addJump('cl',a[0],a[1],false));
} else if(WASH){
  /* Mount Washington has no built jumps either: just a few rock bands to drop off, away from the main line */
  [[140,120],[230,-140],[1050,-115],[1250,125],[960,150]].forEach(a=>addJump('cl',a[0],a[1],false));
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
  if(TAHOE)return tahoeH(x,z);
  if(WASH)return washH(x,z);
  if(YELL)return yellH(x,z);
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
/* Mount Washington: the rocky summit cone, the gentle Alpine Garden, the steep headwall of Tuckerman Ravine, the bowl floor
   between cliff walls (Lion Head on the left, Boott Spur on the right), then the long forested valley down to Pinkham Notch.
   WASH_LINE is the height down the middle of the run at each z, smoothed into a curve. */
const WASH_LINE=[[-340,282],[-280,305],[-150,240],[0,172],[180,146],[340,122],[390,104],[450,50],[520,-12],[580,-44],[700,-78],[820,-112],[1000,-196],[1300,-330],[1560,-452],[1700,-490],[1900,-512]];
function washLine(z){return profileLine(WASH_LINE,z);}
/* a smooth curve through a table of [z, height] points; beyond the ends it carries on in a straight line */
function profileLine(T,z){
  const n=T.length;
  if(z<=T[0][0])return T[0][1]-(T[0][0]-z)*0.6;
  if(z>=T[n-1][0])return T[n-1][1]-(z-T[n-1][0])*0.05;
  let i=0;while(z>T[i+1][0])i++;
  const p0=T[Math.max(0,i-1)],p1=T[i],p2=T[i+1],p3=T[Math.min(n-1,i+2)],dz=p2[0]-p1[0],t=(z-p1[0])/dz;
  const m1=(p2[1]-p0[1])/(p2[0]-p0[0])*dz,m2=(p3[1]-p1[1])/(p3[0]-p1[0])*dz,t2=t*t,t3=t2*t;   /* a smooth curve through the points */
  return (2*t3-3*t2+1)*p1[1]+(t3-2*t2+t)*m1+(-2*t3+3*t2)*p2[1]+(t3-t2)*m2;
}
function washH(x,z){
  const ax=Math.abs(x);
  /* the headwall curves round like an amphitheatre: toward the sides the drop starts higher up, joining the cliff walls */
  let h=washLine(z+0.0035*x*x*smooth(300,420,z)*(1-smooth(900,1100,z)));
  h-=0.35*ax*(1-smooth(-140,40,z));                                          /* the summit cone falls away to the sides */
  h+=10*Math.exp(-((x-10)*(x-10)+(z+282)*(z+282))/2500);                     /* the summit itself, the highest point */
  /* Tuckerman Ravine: below the lip the floor drops away while the rims stay high, leaving cliff walls either side of the bowl */
  const walls=smooth(350,430,z)*(1-smooth(900,1120,z));
  if(walls>0){
    const rim=washLine(Math.min(z,360))-0.32*Math.max(0,z-360)+(x<0?25:0); /* the walls drop toward the mouth of the bowl; Boott Spur (right) stands a little higher than Lion Head */
    const wf=lerp(60,130,smooth(380,760,z));                                 /* the bowl widens below the headwall */
    h+=Math.max(0,rim-h)*walls*smooth(wf,wf+70,ax);
  }
  h+=ax*ax/57600*40+40*smooth(250,480,ax);                                   /* the valley sides */
  const top=1-smooth(500,800,z),fade=smooth(1750,1500,z)*(0.25+0.75*smooth(-250,-120,z));   /* calmer right at the summit so the buildings are not hidden */
  h+=(Math.sin(x*0.05+z*0.023)*4+Math.sin(x*0.13-z*0.06)*1.6+Math.sin(z*0.04+0.7)*3+Math.sin(x*0.024+z*0.014)*6)*(0.5+0.5*top)*fade;   /* bumps, rockier above treeline */
  h+=(Math.sin(x*0.21+z*0.17)*Math.sin(z*0.19-x*0.13))*1.2*top;              /* boulder-field lumps */
  for(let i=0;i<JUMPS.length;i++) h+=kick(JUMPS[i],x,z);
  return h;
}
/* Yellowstone: Mount Washburn, a broad old volcano on the rim of the caldera. Open snowfields up top, lodgepole forest lower down,
   and a flat hot-spring basin at the bottom with steaming pools and a small geyser. */
const YELL_LINE=[[-340,280],[-280,300],[-150,262],[0,215],[200,150],[400,80],[600,10],[800,-70],[1000,-160],[1200,-280],[1300,-330],[1400,-350],[1550,-366],[1700,-376],[1900,-392]];
/* the hot springs: [x, z, radius]. The geyser is a low mound of grey sinter that erupts every so often (see main.js). */
const POOLS=YELL?[[-95,1320,9],[-40,1440,12],[120,1300,7],[150,1450,10],[-140,1420,6],[95,1395,5],[-75,1490,7]]:[];
const GEYSER=YELL?{x:-10,z:1360}:null;
/* how far into the hot-spring basin a point is: 1 in the middle, 0 outside. No snow and no trees in here. */
function thermalIn(x,z){if(!YELL)return 0;return 1-smooth(0.85,1.15,Math.pow((x+5)/200,2)+Math.pow((z-1400)/140,2));}
function yellH(x,z){
  const ax=Math.abs(x);
  let h=profileLine(YELL_LINE,z);
  h-=0.3*ax*(1-smooth(-140,60,z));                                           /* the summit dome falls away to the sides */
  h+=10*Math.exp(-((x-12)*(x-12)+(z+276)*(z+276))/2500);                     /* the summit itself */
  h+=(ax*ax/57600*40+40*smooth(250,480,ax))*(1-0.85*smooth(1200,1600,z));   /* the valley sides, opening out round the basin */
  const tb=thermalIn(x,z),fade=smooth(1750,1500,z)*(0.25+0.75*smooth(-250,-120,z))*(1-0.8*tb);
  h+=(Math.sin(x*0.05+z*0.023)*4+Math.sin(x*0.13-z*0.06)*1.6+Math.sin(z*0.04+0.7)*3+Math.sin(x*0.024+z*0.014)*6)*0.7*fade;
  for(let i=0;i<POOLS.length;i++){const p=POOLS[i],d=Math.hypot(x-p[0],z-p[1]);if(d<p[2]+3)h-=1.4*(1-smooth(p[2]-1,p[2]+3,d));}   /* each pool sits in a shallow bowl */
  if(GEYSER)h+=2.6*(1-smooth(0,10,Math.hypot(x-GEYSER.x,z-GEYSER.z)));       /* the geyser's sinter mound */
  for(let i=0;i<JUMPS.length;i++) h+=kick(JUMPS[i],x,z);
  return h;
}
/* the lake's surface height (only used at Tahoe) */
const WATER_Y=TAHOE?tahoeH(0,1628):null;
/* flat pads so buildings sit level. Tutorial: the outpost, the shelter and the cave. Tahoe: the summit station, a mid-mountain hut, the base lodge and the hidden board cache. */
/* Mount Washington: the summit buildings, the Hermit Lake shelters, the Pinkham Notch lodge, the hidden parka and frozen Hermit Lake. */
const PADS=TUTORIAL?[{x:68,z:240,r:11},{x:-92,z:960,r:15},{x:98,z:1350,r:9}]
  :TAHOE?[{x:42,z:-222,r:10},{x:-140,z:760,r:9},{x:70,z:1548,r:14},{x:-258,z:1010,r:6}]
  :WASH?[{x:10,z:-282,r:16},{x:-70,z:860,r:10},{x:60,z:1500,r:14},{x:225,z:290,r:6},{x:40,z:820,r:24}]
  /* Yellowstone: the summit lookout, a warming hut, the snowcoach shelter at the bottom and the hidden glider */
  :[{x:12,z:-276,r:12},{x:-120,z:780,r:9},{x:-215,z:1500,r:12},{x:235,z:120,r:6}];
PADS.forEach(p=>{p.h=rawH(p.x,p.z);});
/* H(x,z) is the height of the snow at any point. Almost everything uses it: physics, trees, the camera, the minimap. */
function H(x,z){
  let h=rawH(x,z);
  for(let i=0;i<PADS.length;i++){
    const p=PADS[i],d=Math.hypot(x-p.x,z-p.z);
    if(d<p.r+12){ h+=(p.h-h)*smooth(p.r+12,p.r,d); }
  }
  if(WASH){const d=Math.hypot(x-40,z-820);if(d<20)h-=4*(1-smooth(12,20,d));}   /* the hollow of Hermit Lake */
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
