/* player.js: the skier. The physics (P and stepPlayer) decides how you move, turn, jump, flip and crash.
   The rider model (makeRider and poseRider) draws a skier from that state; the same model is used for other players and ghosts.
   Also the walk-mode button. */
'use strict';
/* SKI holds the stats your gear changes (gear.js applyGear sets them): drag, turn rate, landing tolerance, trick score bonus, push on flat ground, hop power and armor */
const SKI={drag:1,turn:1,tol:0.6,style:1,push:1,hop:1,spin:1,wind:1,armor:0};
/* Hitting a tree or rock is a roll, not a certainty. base is the wipeout chance for a full-speed hit; SKI.armor (0 to 1, for future gear)
   reduces it. A hit that does not wipe you out just clips you: you bounce off and lose a little speed. */
const CRASH={base:0.30,grace:1.8};
/* the dice roll for crashes */
const RNG={f:Math.random};
/* the chance (0 to 1) that a hit of strength sev wipes you out */
const crashChance=sev=>clamp(CRASH.base*sev*(1-SKI.armor),0,0.95);
/* P is the player:
   x, y, z and vx, vy, vz   position and velocity; h is the heading (the way the skis point)
   grounded, airTime        on the snow or not, and how long you have been in the air
   steer, tuck, brake       how far the left stick is leaning, smoothed
   crash, crashT, grace     crash time left, time since the crash, and time you are safe from hitting things again
   load, flick, coyote      crouching to load a hop, the hop flick, and a short window to hop just after leaving an edge
   flip, spin, grab(s)      the trick in progress; visFlip and visSpin are what the model shows
   sw, walk                 riding backwards (switch), and on foot */
const P={x:0,z:START_Z,y:0,vx:0,vz:0,vy:0,h:0,grounded:true,steer:0,tuck:0,brake:0,crash:0,crashT:0,airTime:0,popCool:0,
  load:0,loadMem:0,sinceLoad:9,flick:false,coyote:0,flip:0,spin:0,fv:0,sv:0,visFlip:0,visSpin:0,grab:null,grabs:{up:0,down:0,left:0,right:0},grabT:0,armF:true,armS:true,grace:0,sw:false,swTake:false,walk:false,crashMin:0,crashSev:1};
/* ignore small stick movements so a light touch does not start a flip or spin */
const rotDz=v=>{const a=Math.abs(v);return a<0.35?0:Math.sign(v)*(a-0.35)/0.65;};
/* clear the trick in progress */
/* Mount Washington's wind: above treeline, gusts out of the northwest push you along and to the right.
   windNow is the current strength (also used for the wind sound and blowing snow). The Rime Parka blocks most of it. */
const WIND_DIR={x:-0.6,z:0.8};let windNow=0;
function windGust(t){return 1.2+3.6*Math.max(0,Math.sin(t*0.55)*Math.sin(t*0.21+1.3))+0.6*Math.sin(t*2.3)*Math.sin(t*0.9);}
function applyWind(dt){
  windNow=0;if(!WASH)return;
  const above=1-smooth(480,700,P.z);if(above<=0)return;
  windNow=Math.max(0,windGust(performance.now()/1000))*above;
  const f=windNow*SKI.wind*(P.grounded?1:1.4);
  P.vx+=WIND_DIR.x*f*dt;P.vz+=WIND_DIR.z*f*dt;
}
function resetTrick(){P.flip=P.spin=P.fv=P.sv=0;P.grab=null;P.grabs.up=P.grabs.down=P.grabs.left=P.grabs.right=0;P.grabT=0;}
/* put the skier at x,z facing h, standing still, with everything reset */
function placePlayer(x,z,h){
  P.x=x;P.z=z;P.y=H(x,z);P.vx=P.vz=P.vy=0;P.h=h;P.grounded=true;P.crash=0;P.crashT=0;P.steer=0;P.tuck=0;P.brake=0;P.airTime=0;
  P.load=P.loadMem=0;P.sinceLoad=9;P.flick=false;P.coyote=0;P.visFlip=P.visSpin=0;P.grace=0;P.sw=false;P.swTake=false;P.walk=false;resetTrick();
}
/* find a spot clear of every obstacle, searching outward from (cx,cz) in the direction (dx,dz) and then fanning to either side */
function clearSpot(cx,cz,dx,dz,r0){
  const fan=[0,0.6,-0.6,1.2,-1.2,1.9,-1.9,2.6,-2.6];
  for(let d=r0;d<r0+18;d+=1.4){
    for(let i=0;i<fan.length;i++){
      const c=Math.cos(fan[i]),s=Math.sin(fan[i]);
      const x=cx+(dx*c-dz*s)*d,z=cz+(dx*s+dz*c)*d;
      if(!hitObstacle(x,z,1.9))return [x,z];
    }
  }
  return [cx+dx*(r0+4),cz+dz*(r0+4)];
}
/* a wipeout knocks you clear of what you hit, slides you downhill, and gives you a grace period afterwards so you cannot be caught in a loop */
function doCrash(ev,o,sev){
  sev=(sev===undefined)?1:sev;   /* 1 = full wipeout, small values = a quick stumble */
  let ob=o||hitObstacle(P.x,P.z,2.2);
  let nx,nz;
  if(ob){
    nx=P.x-ob[0];nz=P.z-ob[1];const d=Math.hypot(nx,nz)||1;nx/=d;nz/=d;
    const sp=clearSpot(ob[0],ob[1],nx,nz,ob[2]+3.4);P.x=sp[0];P.z=sp[1];
  } else {const sp=Math.hypot(P.vx,P.vz)||1;nx=P.vx/sp;nz=P.vz/sp;}
  P.y=H(P.x,P.z);
  grad(P.x,P.z,_g);const L=Math.hypot(_g.x,_g.z)||1;
  const dur=0.4+1.1*sev;                         /* a stumble is about half a second, a wipeout 1.5 s */
  P.crash=dur;P.crashT=0;P.crashSev=sev;P.crashMin=0.25+0.5*sev;
  const sl=0.35+0.65*sev;
  P.vx=(nx*6-_g.x/L*5.5)*sl;P.vz=(nz*6-_g.z/L*5.5)*sl;   /* tumbling away from the obstacle and downhill */
  resetTrick();P.visFlip=P.visSpin=0;P.grace=dur+0.6+1.2*sev;P.sw=false;
  ev.push({t:'crash',obstacle:!!ob,sev:sev});
}
/* a glancing hit: you are pushed clear and deflected around the obstacle, keeping most of your speed,
   with brief protection from the same obstacle so a bump never turns into a pile-up */
function bump(o,ev){
  let nx=P.x-o[0],nz=P.z-o[1];const d=Math.hypot(nx,nz)||1;nx/=d;nz/=d;
  const want=o[2]+1.5;P.x=o[0]+nx*want;P.z=o[1]+nz*want;
  const hs=Math.hypot(P.vx,P.vz);
  let tx=-nz,tz=nx,dot=P.vx*tx+P.vz*tz;
  if(Math.abs(dot)<0.25*hs){grad(P.x,P.z,_g);dot=(-_g.x*tx-_g.z*tz)>=0?1:-1;}   /* head-on: slide off toward the downhill side */
  if(dot<0){tx=-tx;tz=-tz;}
  const keep=hs*0.78;
  P.vx=tx*keep+nx*2.5;P.vz=tz*keep+nz*2.5;
  if(Math.hypot(P.vx,P.vz)>2)P.h=Math.atan2(P.vx,P.vz);
  P.grace=0.9;
  ev.push({t:'bump'});
}
const TWO_PI=Math.PI*2;
/* walk mode: skis off, on foot. W and S walk, A and D turn. You stick to the ground, cannot climb faces steeper than about 43 degrees,
   and trees and rocks are solid (you stop instead of wiping out). Hop with the right stick to get over small things. */
function setWalk(on){
  if(on===P.walk)return false;
  if(on&&(!P.grounded||P.crash>0))return false;
  P.walk=on;P.vx=P.vz=P.vy=0;P.steer=P.tuck=P.brake=P.load=0;P.sw=false;P.visFlip=P.visSpin=0;resetTrick();
  return true;
}
/* can you walk from one spot to the next? Not up faces steeper than about 43 degrees, and not into a tree or rock. */
function walkOK(x,z,fromX,fromZ,grounded){
  const d=Math.hypot(x-fromX,z-fromZ);
  if(d>1e-5&&grounded&&(H(x,z)-H(fromX,fromZ))/d>0.95)return false;
  if(!hitObstacle(fromX,fromZ,0.45)&&hitObstacle(x,z,0.45))return false;
  return true;
}
/* one physics step on foot: turn, walk, hop and follow the ground */
function walkStep(dt,inp,ev){
  P.steer+=(inp.lx-P.steer)*Math.min(1,dt*10);
  P.h-=inp.lx*2.3*dt;
  const target=inp.ly>0?inp.ly*5.2:inp.ly*2.6;
  const k=Math.min(1,dt*9),fx=Math.sin(P.h),fz=Math.cos(P.h);
  P.vx+=(fx*target-P.vx)*k;P.vz+=(fz*target-P.vz)*k;
  P.popCool-=dt;
  if(inp.ry<0.25)P.flick=false;
  if(inp.ry>0.55&&!P.flick){P.flick=true;if(P.grounded&&P.popCool<=0){P.vy=6.2;P.grounded=false;P.popCool=0.4;}}
  let nx=clamp(P.x+P.vx*dt,-XMAX,XMAX),nz=clamp(P.z+P.vz*dt,ZMIN,ZMAX);
  if(walkOK(nx,nz,P.x,P.z,P.grounded)){P.x=nx;P.z=nz;}
  else if(walkOK(nx,P.z,P.x,P.z,P.grounded)){P.x=nx;P.vz*=0.3;}        /* slide along a tree or a steep face */
  else if(walkOK(P.x,nz,P.x,P.z,P.grounded)){P.z=nz;P.vx*=0.3;}
  else{P.vx*=0.2;P.vz*=0.2;}
  const gy=H(P.x,P.z);
  if(P.grounded){
    if(P.y-gy>1.4){P.grounded=false;P.vy=0;}      /* stepped off a ledge: fall */
    else P.y=gy;
  } else {
    P.vy-=G*dt;P.y+=P.vy*dt;
    if(P.y<=gy){P.y=gy;P.grounded=true;P.vy=0;}
  }
  P.tuck=P.brake=P.load=0;P.visFlip=P.visSpin=0;P.grab=null;
}
/* stepPlayer is one physics step on skis (main.js runs it about 60 times a second). It reads the sticks, updates P,
   and adds events ('pop', 'air', 'land', 'bump', 'crash') to ev so main.js can play sounds and score tricks. */
/* inp: lx,ly = left stick (lean: ly up = go, down = brake, lx = carve; in the air ly = flips, lx = spins)
        rx,ry = right stick (ry down = load, flick up = hop; in the air = grabs) */
function stepPlayer(dt,inp,ev){
  if(P.grace>0)P.grace-=dt;
  if(P.crash>0){
    P.crash-=dt;P.crashT+=dt;
    const k=Math.exp(-1.2*dt);P.vx*=k;P.vz*=k;
    P.x=clamp(P.x+P.vx*dt,-XMAX,XMAX);P.z=clamp(P.z+P.vz*dt,ZMIN,ZMAX);
    P.y=H(P.x,P.z);P.vy=0;P.grounded=true;
    /* get up early: once the worst of the fall is over, any firm stick input stands you back up */
    if(P.crash>0&&P.crashT>P.crashMin&&(Math.abs(inp.lx)>0.5||Math.abs(inp.ly)>0.5||inp.ry>0.55))P.crash=0;
    if(P.crash<=0){P.crash=0;grad(P.x,P.z,_g);const L=Math.hypot(_g.x,_g.z)||1;P.h=Math.atan2(-_g.x,-_g.z);P.vx=-_g.x/L*6;P.vz=-_g.z/L*6;P.grace=Math.max(P.grace,0.6+1.2*P.crashSev);}
    return;
  }
  applyWind(dt);
  if(P.walk){walkStep(dt,inp,ev);return;}
  const lx=inp.lx,ly=inp.ly,rx=inp.rx,ry=inp.ry;
  P.steer+=(lx-P.steer)*Math.min(1,dt*10);
  P.tuck+=(Math.max(0,ly)-P.tuck)*Math.min(1,dt*6);
  P.brake+=(Math.max(0,-ly)-P.brake)*Math.min(1,dt*8);
  P.popCool-=dt;
  /* right stick: pull back loads, flick up hops */
  const pull=Math.max(0,-ry);
  if(P.grounded&&pull>0.35){P.load=Math.min(1,P.load+dt*1.9);P.sinceLoad=0;P.loadMem=Math.max(P.loadMem,P.load);}
  else{P.load=Math.max(0,P.load-dt*(P.grounded?3.5:5));P.sinceLoad+=dt;}
  if(P.sinceLoad>0.3)P.loadMem=Math.max(0,P.loadMem-dt*4);
  P.coyote=P.grounded?0.12:P.coyote-dt;
  if(ry<0.25)P.flick=false;
  let popJ=0;
  if(ry>0.55&&!P.flick){
    P.flick=true;
    if((P.grounded||P.coyote>0)&&P.popCool<=0){
      const pw=0.3+0.7*P.loadMem;
      popJ=(5+6.5*pw)*SKI.hop;P.popCool=0.35;P.loadMem=0;P.load=0;
      ev.push({t:'pop',power:pw});
    }
  }
  const sp=Math.hypot(P.vx,P.vz);
  if(P.grounded){
    /* steering: you turn slower at high speed, and with the stick centred the skis slowly line up with the way you are moving */
    let rate=(2.4-clamp(sp/40,0,1)*1.65)*(1-0.3*P.tuck)*SKI.turn;
    P.h-=P.steer*rate*dt;
    if(Math.abs(lx)<0.1&&P.brake<0.3&&sp>3){
      P.h+=angdiff(Math.atan2(P.vx,P.vz),P.h)*Math.min(1,dt*0.35);
    }
    P.visFlip*=Math.exp(-12*dt);P.visSpin*=Math.exp(-12*dt);P.grab=null;
  }
  const fx=Math.sin(P.h),fz=Math.cos(P.h);
  if(P.grounded){
    /* on the snow: gravity pulls you down the slope, the edges grip sideways, leaning forward pushes you along, and drag and braking slow you down */
    grad(P.x,P.z,_g);
    const L2=1+_g.x*_g.x+_g.z*_g.z;
    P.vx+=-G*_g.x/L2*dt;P.vz+=-G*_g.z/L2*dt;
    let fwd=P.vx*fx+P.vz*fz,lat=P.vx*fz-P.vz*fx;
    const grip=lerp(8.5,2.0,P.brake)*(1-0.2*P.tuck);
    lat*=Math.exp(-grip*dt);
    const a=Math.abs(fwd);
    /* pushing: leaning forward skates you along, so flat ground works too */
    fwd+=P.tuck*5.5*SKI.push*Math.max(0,1-a/13)*dt;
    const dec=0.55+(0.0050*SKI.drag-0.0014*P.tuck)*a*a+P.brake*11+Math.max(0,P.z-1600)*0.22;
    fwd-=Math.sign(fwd)*Math.min(a,dec*dt);
    P.vx=fwd*fx+lat*fz;P.vz=fwd*fz-lat*fx;
    if(popJ>0){
      const L=Math.sqrt(L2);
      P.vx+=-_g.x/L*popJ;P.vy+=popJ/L;P.vz+=-_g.z/L*popJ;
      P.grounded=false;P.coyote=0;P.airTime=0;resetTrick();P.swTake=P.sw;P.armF=true;P.armS=true;   /* a bunny hop arms flips and spins straight away, even with the stick held */
    }
  } else {
    /* in the air: a little air drag, then flips and spins from the left stick and grabs from the right stick */
    if(popJ>0)P.vy+=popJ;
    const k=Math.exp(-0.05*dt);P.vx*=k;P.vz*=k;
    /* trick control in the air: left stick flips and spins, right stick grabs */
    /* after a hop rotation is live at once; off a bump or ramp it only arms once the stick has been let go, so holding forward over a bump never flips you */
    if(Math.abs(ly)<0.3)P.armF=true;if(Math.abs(lx)<0.3)P.armS=true;
    const canRot=P.airTime>0.06;
    let fIn=(P.armF&&canRot)?rotDz(ly):0,sIn=(P.armS&&canRot)?rotDz(lx):0;
    /* landing assist: in the last quarter-second before touchdown (not before: a short hop must not take your rotation away),
       rotation input hands over to a snap toward the nearest full flip or spin half-turn */
    const hAbove=Math.max(0,P.y-H(P.x,P.z));
    const tLand=(P.vy+Math.sqrt(P.vy*P.vy+2*G*hAbove))/G;
    if(tLand<0.28){
      const ka=Math.min(1,dt*9);
      const tf=Math.round(P.flip/TWO_PI)*TWO_PI;if(Math.abs(P.flip-tf)<1.9){fIn=0;P.flip+=(tf-P.flip)*ka;}
      /* spins are forgiving so you can reliably land backwards: still holding the stick completes the next half-turn,
         and letting go after about 50 degrees rounds up to a full half-turn instead of snapping back */
      const sa=Math.abs(P.spin)/Math.PI,sfl=Math.floor(sa),sg=Math.sign(P.spin)||1;
      let ts;
      if(sIn!==0&&Math.sign(sIn)===sg&&Math.abs(P.spin)>0.3)ts=sg*(sfl+1)*Math.PI;
      else ts=sg*(sfl+((sa-sfl)>0.28?1:0))*Math.PI;
      if(Math.abs(P.spin-ts)<2.4){sIn=0;P.spin+=(ts-P.spin)*ka;}
    }
    P.fv+=(fIn*9.2-P.fv)*Math.min(1,dt*10);P.sv+=(sIn*10.5*SKI.spin-P.sv)*Math.min(1,dt*10);
    P.flip+=P.fv*dt;P.spin+=P.sv*dt;
    let g=null;
    if(Math.hypot(rx,ry)>0.55&&!P.flick){g=Math.abs(rx)>Math.abs(ry)?(rx<0?'left':'right'):(ry>0?'up':'down');}
    P.grab=g;if(g){P.grabs[g]+=dt;P.grabT+=dt;}
    P.visFlip=P.flip;P.visSpin=P.spin;
  }
  /* move, stay inside the map, and check for trees and rocks: a hit either clips you (bump) or wipes you out (doCrash) */
  const ox=P.x,oz=P.z;
  P.x+=P.vx*dt;P.z+=P.vz*dt;
  if(P.x<-XMAX||P.x>XMAX){P.x=clamp(P.x,-XMAX,XMAX);P.vx=0;}
  if(P.z<ZMIN||P.z>ZMAX){P.z=clamp(P.z,ZMIN,ZMAX);P.vz=0;}
  const gy=H(P.x,P.z);
  if(P.grace<=0&&P.y-gy<2.4){
    const o=hitObstacle(P.x,P.z,0.5);
    const hs=Math.hypot(P.vx,P.vz);
    if(o&&hs>2){
      P.x=ox;P.z=oz;
      if(RNG.f()<crashChance(clamp(hs/28,0.35,1.3))){doCrash(ev,o,clamp(hs/26,0.4,1));return;}
      bump(o,ev);
    }
  }
  if(P.grounded){
    /* leaving the ground: if the snow drops away faster than you would fall, you take off */
    const yb=P.y+P.vy*dt-0.5*G*dt*dt;
    if(yb>gy+0.1&&sp>2){P.grounded=false;P.y=yb;P.vy-=G*dt;P.airTime=0;resetTrick();P.swTake=P.sw;P.armF=Math.abs(ly)<0.3;P.armS=Math.abs(lx)<0.3;ev.push({t:'air'});}
    else{const nvy=(gy-P.y)/dt;P.vy=clamp(nvy,-35,35);P.y=gy;}
  } else {
    /* falling. On touchdown the landing is graded: a flip or spin must end close to a whole turn, and the skis must point roughly where you are going. */
    P.vy-=G*dt;P.y+=P.vy*dt;P.airTime+=dt;
    if(P.y<=gy){
      grad(P.x,P.z,_g);
      const L=Math.sqrt(1+_g.x*_g.x+_g.z*_g.z);
      const nx=-_g.x/L,ny=1/L,nz=-_g.z/L;
      const vn=P.vx*nx+P.vy*ny+P.vz*nz;
      const impact=Math.max(0,-vn);
      if(vn<0){P.vx-=vn*nx;P.vy-=vn*ny;P.vz-=vn*nz;}
      P.y=gy;P.grounded=true;
      const tf=SKI.tol/0.6;
      const flipN=Math.round(P.flip/TWO_PI),spinN=Math.round(P.spin/Math.PI);
      const flipErr=Math.abs(P.flip-flipN*TWO_PI),spinErr=Math.abs(P.spin-spinN*Math.PI);
      const fLim=0.95*tf+0.1,sLim=0.85*tf+0.1;
      const trickOK=flipErr<fLim&&spinErr<sLim;
      const mis=Math.abs(angdiff(Math.atan2(P.vx,P.vz),P.h));
      const clean=mis<SKI.tol;
      const info={t:'land',impact:impact,clean:clean&&trickOK,air:P.airTime,ok:trickOK,
        flipN:Math.abs(flipN),flipDir:Math.sign(P.flip),spinN:Math.abs(spinN),spinDir:Math.sign(P.spin),
        grabs:Object.assign({},P.grabs),grabT:P.grabT,crashed:false,swTake:P.swTake,swLand:(Math.abs(spinN)%2===1)?!P.sw:P.sw};
      P.visFlip=P.flip-flipN*TWO_PI;P.visSpin=P.spin-spinN*Math.PI;
      resetTrick();
      const crooked=impact>8&&!clean&&Math.hypot(P.vx,P.vz)>6;
      /* a landing is graded: a near miss is a quick stumble you get up from fast, only a really bad one is a full wipeout */
      let outcome='ok';
      if(!trickOK)outcome=(flipErr>2.5)?'wipe':'stumble';
      else if(crooked){const r=RNG.f(),pc=crashChance(1.5);outcome=r<pc*0.5?'wipe':(r<pc?'stumble':'scuff');}
      if(outcome==='wipe'){doCrash(ev,null,1);info.crashed=true;info.sev=1;}
      else if(outcome==='stumble'){doCrash(ev,null,0.15);info.crashed=true;info.stumble=true;info.sev=0.15;}
      else if(outcome==='scuff'){P.vx*=0.78;P.vz*=0.78;}
      else if(impact>18){P.vx*=0.88;P.vz*=0.88;}
      if(!info.crashed)P.sw=info.swLand;   /* land backwards and you stay backwards (switch) until you turn around again */
      ev.push(info);
    }
  }
}

/* ================= riders: the local skier and every remote rider share one model ================= */
/* body sizes, in model units (the whole model is scaled by RIDER_SCALE). Real proportions: about 1.8 tall, legs about half of that. */
const RIDER_SCALE=1.05,THIGH=0.43,SHIN=0.43,SOLE=0.09,UPPER_ARM=0.31,FOREARM=0.27,STAND_HIP=THIGH+SHIN+SOLE;
/* a capsule (a cylinder with rounded ends) of radius r whose straight part is len long, centred on its parent and lying along y */
function capsule(r,len,mat,parent,x,y,z){
  const pts=[];
  for(let i=0;i<=6;i++){const a=-Math.PI/2+i/6*Math.PI/2;pts.push(new THREE.Vector2(Math.max(0.0001,Math.cos(a)*r),-len/2+Math.sin(a)*r));}
  for(let i=0;i<=6;i++){const a=i/6*Math.PI/2;pts.push(new THREE.Vector2(Math.max(0.0001,Math.cos(a)*r),len/2+Math.sin(a)*r));}
  const m=new THREE.Mesh(new THREE.LatheGeometry(pts,12),mat);m.position.set(x||0,y||0,z||0);parent.add(m);return m;
}
function joint(parent,x,y,z){const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);return g;}
/* makeRider builds one skier and returns its parts so they can be posed and recoloured. The joints are nested groups:
   pelvis -> hips -> knees -> ankles for the legs, and pelvis -> upper body -> shoulders -> elbows -> hands for the arms.
   The Apex Shell, Ridge pants and Trailblazer boots are extra pieces that stay hidden until that gear is worn. */
function makeRider(){
  const mats={jacket:M(0xe8553d),accent:new THREE.MeshLambertMaterial({color:0x2f8fe0}),pants:M(0x25313f),boot:M(0x161d28),
    trim:new THREE.MeshLambertMaterial({color:0xf2f7fb,emissive:0x1d2630}),skiBase:M(0x2c3440),stripe:new THREE.MeshBasicMaterial({color:0x39d0ff}),
    glove:M(0x1b222c),pole:M(0x8d97a3)};
  const parts={},gp={shell:new THREE.Group(),ridge:new THREE.Group(),ridgeSides:[],trailSides:[]},legs=[],boots=[],legG={},skiG={},poles=[],arms={};
  const group=new THREE.Group();
  const pelvis=joint(group,0,STAND_HIP,0);pelvis.rotation.order='YXZ';
  /* hips and seat */
  const hips=capsule(0.13,0.16,mats.pants,pelvis,0,0.03,0);hips.rotation.z=Math.PI/2;hips.scale.set(1,1,0.85);
  const ridge=gp.ridge;pelvis.add(ridge);ridge.visible=false;
  bx(0.3,0.14,0.03,mats.trim,0,0.03,-0.12,ridge);                 /* Ridge pants seat patch */
  /* legs: thigh, knee, shin, ankle and boot. The boot stays level whatever the knee is doing. */
  for(const sd of [-1,1]){
    const hip=joint(pelvis,0.11*sd,0,0);legG[sd]=hip;
    legs.push(capsule(0.085,THIGH-0.12,mats.pants,hip,0,-THIGH/2,0));
    const knee=joint(hip,0,-THIGH,0);
    legs.push(capsule(0.068,SHIN-0.1,mats.pants,knee,0,-SHIN/2,0));
    const ankle=joint(knee,0,-SHIN,0);
    const boot=bx(0.14,0.16,0.32,mats.boot,0,-0.01,0.04,ankle);boots.push(boot);
    hip.userData={knee:knee,ankle:ankle};
    const rs=new THREE.Group();hip.add(rs);rs.visible=false;gp.ridgeSides.push(rs);   /* Ridge pants: outer stripe down the leg */
    bx(0.025,THIGH-0.08,0.07,mats.trim,0.1*sd,-THIGH/2,0,rs);
    const rc=new THREE.Group();knee.add(rc);rc.visible=false;gp.ridgeSides.push(rc);  /* and a bright cuff over the boot */
    bx(0.2,0.05,0.2,mats.trim,0,-SHIN+0.1,0,rc);
    const ts=new THREE.Group();ankle.add(ts);ts.visible=false;gp.trailSides.push(ts);   /* Trailblazer boots: buckle straps */
    bx(0.16,0.025,0.34,mats.trim,0,-0.02,0.04,ts);bx(0.16,0.025,0.34,mats.trim,0,0.05,0.04,ts);bx(0.16,0.035,0.2,mats.accent,0,0.12,0,ts);
    /* skis hang off the group, not the leg, so they stay flat; poseRider moves them under each boot every frame */
    const sg=new THREE.Group();group.add(sg);skiG[sd]=sg;
    const ski=bx(0.11,0.035,1.85,mats.skiBase,0,0.018,0.15,sg);
    const str=bx(0.04,0.01,1.5,mats.stripe,0,0.04,0.15,sg);
    const tip=bx(0.11,0.035,0.3,mats.accent,0,0.06,1.18,sg);tip.rotation.x=-0.4;
    const tail=bx(0.11,0.035,0.18,mats.skiBase,0,0.035,-0.83,sg);tail.rotation.x=0.25;
    bx(0.12,0.05,0.34,M(0x2b333d),0,0.055,0.03,sg);                 /* binding */
    parts['ski'+sd]=ski;parts['str'+sd]=str;
  }
  /* upper body: jacket, backpack, neck gaiter, helmet and goggles */
  const upper=joint(pelvis,0,0.08,0);upper.rotation.order='YXZ';   /* turn first, then lean */
  const torso=capsule(0.16,0.24,mats.jacket,upper,0,0.26,0);torso.scale.set(1.3,1,0.82);
  bx(0.025,0.4,0.02,mats.trim,0,0.25,0.135,upper);                 /* zip */
  bx(0.27,0.34,0.12,M(0x33404f),0,0.27,-0.18,upper);               /* backpack */
  capsule(0.072,0.04,mats.accent,upper,0,0.52,0);                  /* neck gaiter */
  const head=joint(upper,0,0.65,0.01);
  const helm=new THREE.Mesh(new THREE.SphereGeometry(0.135,16,12),M(0x161d28));helm.scale.set(1,1.02,1.12);head.add(helm);
  const lens=new THREE.Mesh(new THREE.CylinderGeometry(0.142,0.142,0.07,16,1,true,-1.15,2.3),M(0x0d1117,0x2a5d8c));lens.position.y=-0.01;lens.scale.z=1.1;head.add(lens);
  const strap=new THREE.Mesh(new THREE.CylinderGeometry(0.138,0.138,0.04,16,1,true,1.15,Math.PI*2-2.3),mats.accent);strap.position.y=-0.01;strap.scale.z=1.1;head.add(strap);
  capsule(0.06,0.02,M(0x1b222c),head,0,-0.1,0.05).scale.set(1,0.7,1);   /* chin, covered by the gaiter */
  /* Apex Shell: hood, contrast yoke across the shoulders, longer hem and a stripe over the pack */
  const shell=gp.shell;upper.add(shell);shell.visible=false;
  const hood=new THREE.Mesh(new THREE.SphereGeometry(0.16,12,10),mats.jacket);hood.position.set(0,0.56,-0.12);hood.scale.set(1.2,0.8,0.9);shell.add(hood);
  const yoke=capsule(0.17,0.12,mats.trim,shell,0,0.41,0);yoke.scale.set(1.32,0.35,0.86);
  const hem=capsule(0.165,0.06,mats.jacket,shell,0,0.04,0);hem.scale.set(1.34,0.6,0.86);
  bx(0.24,0.03,0.13,mats.trim,0,0.36,-0.19,shell);
  /* the Rime Parka: a puffy quilted parka with a hood and a fur ruff round the face */
  const parka=new THREE.Group();upper.add(parka);parka.visible=false;gp.parka=parka;
  const puff=capsule(0.19,0.22,mats.jacket,parka,0,0.26,0);puff.scale.set(1.32,1,0.98);
  for(const y of [0.14,0.26,0.38]){const q=new THREE.Mesh(new THREE.TorusGeometry(0.2,0.012,6,20),mats.trim);q.rotation.x=Math.PI/2;q.scale.set(1.3,0.98,1);q.position.y=y;parka.add(q);}   /* quilting */
  const phood=new THREE.Mesh(new THREE.SphereGeometry(0.17,12,10),mats.jacket);phood.position.set(0,0.62,-0.06);phood.scale.set(1.15,1.05,1.1);parka.add(phood);
  const ruff=new THREE.Mesh(new THREE.TorusGeometry(0.15,0.045,8,20),M(0xe9e1d0));ruff.position.set(0,0.65,0.07);parka.add(ruff);
  /* arms: shoulder, upper arm, elbow, forearm, glove. Each hand holds a pole. */
  for(const sd of [-1,1]){
    const pv=new THREE.Vector3(0.3*sd,0.15,-0.94).normalize();   /* pole direction in the hand's frame: down, a little back and out to the side */
    const sh=joint(upper,0.22*sd,0.45,0);arms[sd]=sh;
    const ball=new THREE.Mesh(new THREE.SphereGeometry(0.078,10,8),mats.jacket);sh.add(ball);
    capsule(0.058,UPPER_ARM-0.1,mats.jacket,sh,0,-UPPER_ARM/2,0);
    const elbow=joint(sh,0,-UPPER_ARM,0);
    capsule(0.05,FOREARM-0.12,mats.jacket,elbow,0,-FOREARM/2+0.02,0);
    const hand=joint(elbow,0,-FOREARM,0);
    const glove=new THREE.Mesh(new THREE.SphereGeometry(0.055,10,8),mats.glove);glove.scale.set(0.9,1.25,1);hand.add(glove);
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.014,0.014,1.2,5),mats.pole);
    pole.position.copy(pv).multiplyScalar(0.52);pole.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),pv);hand.add(pole);
    const basket=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,0.012,8),mats.pole);
    basket.position.copy(pv).multiplyScalar(1.0);basket.quaternion.copy(pole.quaternion);hand.add(basket);
    poles.push(pole,basket);sh.userData={elbow:elbow,hand:hand,pole:[pole,basket]};
    parts['arm'+sd]=sh;
  }
  /* the Tahoe Legend snowboard: hidden until worn. The board points down the hill and the rider stands across it. */
  const board=new THREE.Group();group.add(board);board.visible=false;gp.board=board;
  const gold=M(0xffc04d,0x7a4a00);
  bx(0.32,0.035,1.3,mats.skiBase,0,0.018,0,board);
  for(const e of [-1,1]){const tip=bx(0.32,0.035,0.26,mats.skiBase,0,0.05,0.75*e,board);tip.rotation.x=-0.38*e;}   /* upturned nose and tail */
  bx(0.1,0.01,1.2,mats.accent,0,0.04,0,board);                                                              /* topsheet stripe */
  for(const e of [-1,1]){bx(0.02,0.045,1.32,gold,0.16*e,0.02,0,board);bx(0.26,0.07,0.16,M(0x1b222c),0,0.07,0.3*e,board);}   /* gold edges and bindings */
  group.scale.setScalar(RIDER_SCALE);
  const shadow=new THREE.Mesh(new THREE.CircleGeometry(1,18),new THREE.MeshBasicMaterial({color:0x13243a,transparent:true,opacity:0.28,depthWrite:false,fog:false}));
  shadow.rotation.x=-Math.PI/2;
  const shadowWrap=new THREE.Group();shadowWrap.add(shadow);
  return {group:group,pelvis:pelvis,upper:upper,mats:mats,parts:parts,gp:gp,legs:legs,boots:boots,legG:legG,skiG:skiG,poles:poles,arms:arms,
    shadow:shadow,shadowWrap:shadowWrap,up:new THREE.Vector3(0,1,0),ph:0,
    pose:{f:[-0.3,-0.3],b:[0.6,0.6],lean:0.2,twist:0,yaw:0,airK:0,pitch:0}};   /* the smoothed pose, eased toward its target each frame */
}
/* free a rider's memory when another player leaves */
function disposeRider(R){
  [R.group,R.shadowWrap].forEach(g=>g.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material&&o.material.dispose)o.material.dispose();}));
}
/* the local rider; the older names stay as aliases so the rest of the game reads the same */
const RIDER=makeRider();scene.add(RIDER.group);scene.add(RIDER.shadowWrap);
const skier=RIDER.group,upper=RIDER.upper,parts=RIDER.parts,legMeshes=RIDER.legs,bootMeshes=RIDER.boots;
const jacketMat=RIDER.mats.jacket,accentMat=RIDER.mats.accent,pantsMat=RIDER.mats.pants,bootMat=RIDER.mats.boot,trimMat=RIDER.mats.trim,skiBaseMat=RIDER.mats.skiBase,stripeMat=RIDER.mats.stripe;
const shadow=RIDER.shadow,shadowWrap=RIDER.shadowWrap;
/* 0xff8800 -> [1, 0.53, 0]: red, green and blue from 0 to 1, for particle colours */
const hexRGB=h=>[((h>>16)&255)/255,((h>>8)&255)/255,(h&255)/255];
/* a look is what a rider is wearing: item ids plus [jacket,pants,boots,ski accent] colours. Sent to other players and applied to their model. */
function setRiderLook(R,look){
  const lost=look.skis==='lost';
  R.board=look.skis==='board';   /* poseRider swaps skis for the board */
  R.mats.skiBase.color.setHex(lost?0x12171f:(R.board?0x14233d:look.c[3]));
  R.mats.stripe.color.setHex(look.c[3]);R.mats.accent.color.setHex(look.c[3]);
  R.parts.str1.visible=R.parts['str-1'].visible=lost;
  R.mats.jacket.color.setHex(look.c[0]);R.mats.pants.color.setHex(look.c[1]);R.mats.boot.color.setHex(look.c[2]);
  R.gp.shell.visible=look.jacket==='apex';R.gp.parka.visible=look.jacket==='rime';
  const rid=look.pants==='ridge';R.gp.ridge.visible=rid;R.gp.ridgeSides.forEach(g=>{g.visible=rid;});R.legs.forEach(l=>l.scale.set(rid?1.3:1,1,rid?1.2:1));
  const tb=look.boots==='trail';R.gp.trailSides.forEach(g=>{g.visible=tb;});R.boots.forEach(b=>{b.scale.set(tb?1.08:1,tb?1.4:1,tb?1.1:1);b.position.y=tb?0.02:-0.01;});
}

/* ================= skier model update ================= */
/* scratch vectors reused every frame so posing riders does not create garbage */
const _n=new THREE.Vector3(0,1,0),_up=new THREE.Vector3(0,1,0),_Y=new THREE.Vector3(0,1,0),_Z=new THREE.Vector3(0,0,1),_Xv=new THREE.Vector3(1,0,0);
const _f=new THREE.Vector3(),_x=new THREE.Vector3(),_y=new THREE.Vector3(),_m=new THREE.Matrix4(),_q=new THREE.Quaternion(),_e=new THREE.Euler();
const _qb=new THREE.Quaternion(),_v1=new THREE.Vector3(),_v2=new THREE.Vector3(),_c=new THREE.Vector3(0,1.0,0);
const _ikT=new THREE.Vector3(),_ikD=new THREE.Vector3(),_ikP=new THREE.Vector3(),_ikE=new THREE.Vector3(),_ikH=new THREE.Vector3(),_ikQ=new THREE.Quaternion(),_ikQ2=new THREE.Quaternion(),_ikQi=new THREE.Quaternion();
const _ft=[new THREE.Vector3(),new THREE.Vector3()],_DOWN=new THREE.Vector3(0,-1,0),_eul=new THREE.Euler();
/* where a foot's sole is, in the rider group's own frame */
function soleLocal(R,sd,out){
  out.setFromMatrixPosition(R.legG[sd].userData.ankle.matrixWorld);R.group.worldToLocal(out);out.y-=SOLE;return out;
}
/* two-bone arm IK: bend the shoulder and elbow so the hand reaches target (a point in the rider group's frame).
   The elbow points out to the side and back, like a real arm reaching down. */
function reachTo(R,sd,target,k){
  const sh=R.arms[sd],el=sh.userData.elbow;
  _ikT.copy(target);R.group.localToWorld(_ikT);sh.parent.worldToLocal(_ikT);   /* the target in the upper body's frame */
  _ikD.subVectors(_ikT,sh.position);
  const dist=clamp(_ikD.length(),0.05,(UPPER_ARM+FOREARM)*0.999);_ikD.normalize();
  const ca=clamp((UPPER_ARM*UPPER_ARM+dist*dist-FOREARM*FOREARM)/(2*UPPER_ARM*dist),-1,1),sa=Math.sqrt(1-ca*ca);   /* law of cosines */
  _ikP.set(sd,-0.3,-0.6);_ikP.addScaledVector(_ikD,-_ikP.dot(_ikD)).normalize();   /* the way the elbow bends */
  _ikE.copy(_ikD).multiplyScalar(ca).addScaledVector(_ikP,sa);                       /* shoulder -> elbow direction */
  _ikQ.setFromUnitVectors(_DOWN,_ikE);
  _ikH.copy(_ikD).multiplyScalar(dist).addScaledVector(_ikE,-UPPER_ARM).normalize(); /* elbow -> hand direction */
  _ikQi.copy(_ikQ).invert();_ikH.applyQuaternion(_ikQi);
  _ikQ2.setFromUnitVectors(_DOWN,_ikH);
  sh.quaternion.slerp(_ikQ,k);el.quaternion.slerp(_ikQ2,k);
}
/* a relaxed arm pose: shoulder swing forward (x) and out (z), elbow bend (e, negative bends the forearm forward) */
function armPose(R,sd,x,z,e,k){
  const sh=R.arms[sd];
  _ikQ.setFromEuler(_eul.set(x,0,z*sd));sh.quaternion.slerp(_ikQ,k);
  _ikQ.setFromEuler(_eul.set(e,0,0));sh.userData.elbow.quaternion.slerp(_ikQ,k);
}
/* where each grab puts a hand: [arm, point on the ski or board]. Arm 1 is the rider's left, -1 the right.
   On a snowboard the rider faces the toe edge (+x) with the right hand toward the nose. */
const GRAB_SKI={up:[1,1,[0,0.04,0.75]],down:[-1,-1,[0,0.04,-0.45]],left:[1,1,[0.06,0.03,0.12]],right:[-1,-1,[-0.06,0.03,0.12]]};   /* [arm, which ski, point on it] */
const GRAB_BOARD={up:[-1,[0,0.04,0.74]],down:[1,[0,0.04,-0.74]],left:[1,[0.17,0.03,0.02]],right:[-1,[-0.17,0.03,0.15]]};         /* [arm, point on the board] */
/* how the body folds for each grab: hip swing f and knee bend b (knees to the chest), torso lean, how far the skis or board tip up
   (negative lifts the nose), and a twist of the shoulders. Tuned so the reaching hand really arrives at the grab point. */
const GRAB_POSE={
  ski:{up:{f:-1.9,b:2.7,lean:0.9,pitch:-0.4,twist:0},down:{f:-1.3,b:3.0,lean:0.2,pitch:0.7,twist:-0.4},left:{f:-1.9,b:2.7,lean:1.2,pitch:-0.1,twist:0},right:{f:-1.9,b:2.7,lean:1.2,pitch:-0.1,twist:0}},
  board:{up:{f:-1.9,b:2.7,lean:1.0,pitch:-0.35,twist:-0.2},down:{f:-1.9,b:2.7,lean:0.9,pitch:0.6,twist:0.2},left:{f:-1.9,b:2.7,lean:1.15,pitch:-0.05,twist:0},right:{f:-1.9,b:2.7,lean:1.2,pitch:-0.05,twist:-0.6}}
};
/* bend the body for this frame: knees and hips, torso lean, arms, and the skis or board under the feet */
function poseBody(R,S,dt,sp){
  const walking=!!S.walk,brd=!!R.board&&!walking,crash=S.crash>0,air=!S.grounded&&!walking&&!crash;
  const grab=(air&&S.grab)?(S.sw?SWAP_GRAB[S.grab]:S.grab):null;   /* the model is turned around in switch, so the grab sides swap */
  const k=Math.min(1,dt*12),Q=R.pose;
  R.ph+=(walking?Math.min(sp,6.5)*3.3:(S.grounded&&!crash?clamp(sp*0.2,0,5.2):0))*dt;   /* stride phase */
  /* legs: hip swing f (negative brings the knee forward) and knee bend b (positive folds the shin back) */
  const crouch=crash?0.6:clamp(0.32+S.load*0.55+S.tuck*0.4+S.brake*0.25,0,1.2),GP_=grab?GRAB_POSE[brd?'board':'ski'][grab]:null;
  for(const sd of [-1,1]){
    const i=sd===1?1:0,ph=R.ph+(sd===1?0:Math.PI);let f,b;
    if(walking){const s=Math.sin(ph),amp=0.55*clamp(sp/2.5,0,1);f=-0.05-amp*s;b=0.12+amp*1.3*Math.max(0,s);}
    else if(GP_){f=GP_.f;b=GP_.b;}                                  /* grabbing: knees up so the ski or board comes to the hand */
    else if(air){f=-0.75;b=1.2;}
    else{f=-crouch;b=2*crouch;if(!brd)f+=0.1*clamp((sp-2)/9,0,1)*Math.sin(ph);}   /* knees bent, feet under the hips */
    Q.f[i]+=(f-Q.f[i])*k;Q.b[i]+=(b-Q.b[i])*k;
    const hip=R.legG[sd];hip.rotation.set(Q.f[i],0,(brd?0.2:0.03)*sd);
    hip.userData.knee.rotation.x=Q.b[i];hip.userData.ankle.rotation.x=-(Q.f[i]+Q.b[i]);   /* keep the boot level */
  }
  /* hips: on the snow they drop as the knees bend, so the feet stay on the ground; in the air the feet come up to the body instead */
  const drop=i=>(THIGH*Math.cos(Q.f[i])+SHIN*Math.cos(Q.f[i]+Q.b[i]))*Math.cos(brd?0.2:0.03);
  Q.airK+=((air?1:0)-Q.airK)*Math.min(1,dt*8);
  R.pelvis.position.y=lerp(Math.max(drop(0),drop(1))+SOLE,STAND_HIP-0.06,Q.airK);
  Q.yaw+=((brd?1.45:0)-Q.yaw)*k;R.pelvis.rotation.y=Q.yaw;           /* on a board the hips turn sideways */
  /* torso: lean forward to tuck or reach, back to brake; on a board the shoulders open a little toward the nose */
  let lean,twist=brd?-0.3:0;
  if(walking)lean=0.06;else if(crash)lean=0.5;
  else if(GP_){lean=GP_.lean;twist+=GP_.twist;}
  else if(air)lean=0.3;
  else lean=(S.sw&&!brd?0.1-0.3*S.tuck:0.15+0.45*S.tuck)+0.35*S.load-0.2*S.brake;
  Q.lean+=(lean-Q.lean)*k;Q.twist+=(twist-Q.twist)*k;
  R.upper.rotation.set(Q.lean,Q.twist,0);
  R.upper.position.y=0.08+(walking?0.02*Math.abs(Math.sin(R.ph)):0);
  /* put the skis (or the board) under the feet; they tip up into the hand for nose and tail grabs */
  R.group.updateMatrixWorld(true);
  soleLocal(R,-1,_ft[0]);soleLocal(R,1,_ft[1]);
  const pitch=GP_?GP_.pitch:(air?-0.1:0);
  Q.pitch+=(pitch-Q.pitch)*k;
  for(const sd of [-1,1]){const sg=R.skiG[sd];sg.position.copy(_ft[sd===1?1:0]);sg.rotation.set(Q.pitch,0,0);sg.visible=!walking&&!brd;}
  const bd=R.gp.board;bd.position.addVectors(_ft[0],_ft[1]).multiplyScalar(0.5);bd.rotation.set(Q.pitch,0,0);bd.visible=brd;
  /* arms: the grabbing hand reaches the ski or board, the other arm goes out for balance */
  const ka=Math.min(1,dt*16);let gArm=0;
  if(grab){
    if(brd){const g=GRAB_BOARD[grab];gArm=g[0];bd.updateMatrix();_v1.fromArray(g[1]).applyMatrix4(bd.matrix);}
    else{const g=GRAB_SKI[grab];gArm=g[0];const sg=R.skiG[g[1]];sg.updateMatrix();_v1.fromArray(g[2]).applyMatrix4(sg.matrix);}
    reachTo(R,gArm,_v1,ka);
  }
  for(const sd of [-1,1]){
    if(sd===gArm)continue;
    if(walking){const s=Math.sin(R.ph+(sd===1?Math.PI:0))*clamp(sp/2.5,0,1);armPose(R,sd,0.5*s,0.1,-0.25,ka);}
    else if(crash)armPose(R,sd,-1.3+Math.sin(S.crashT*9+sd)*0.6,0.9,-0.3,ka);
    else if(grab)armPose(R,sd,-0.5,1.0,-0.2,ka);
    else if(air)armPose(R,sd,-0.35,0.75,-0.4,ka);
    else if(brd)armPose(R,sd,0.05,0.45,-0.45,ka);
    else armPose(R,sd,-0.45,0.18,-0.85,ka);                         /* skiing: hands forward, poles ready */
  }
  R.poles.forEach(m=>{m.visible=!walking&&!brd;});
  if(gArm&&!brd)R.arms[gArm].userData.pole.forEach(m=>{m.visible=false;});   /* the grabbing hand lets its pole trail */
}
/* poses one rider model from a state object (the local P, or a remote rider's smoothed state). Returns ground speed. */
function poseRider(R,S,dt){
  const sp=Math.hypot(S.vx,S.vz);
  grad(S.x,S.z,_g);const L=Math.sqrt(1+_g.x*_g.x+_g.z*_g.z);
  _n.set(-_g.x/L,1/L,-_g.z/L);
  R.up.lerp(S.grounded?_n:_Y,1-Math.exp(-dt*(S.grounded?14:3))).normalize();
  _f.set(Math.sin(S.h),0,Math.cos(S.h));
  if(!S.grounded)_f.y=clamp(S.vy*0.03,-0.6,0.6);
  _f.addScaledVector(R.up,-_f.dot(R.up)).normalize();
  _x.crossVectors(R.up,_f).normalize();_y.crossVectors(_f,_x);
  _m.makeBasis(_x,_y,_f);_qb.setFromRotationMatrix(_m);
  const G=R.group,fs=S.sw?-1:1;
  G.quaternion.copy(_qb);
  /* switch stance: the rider faces backwards while still travelling the same way. Flips and lean are mirrored so they stay true to the screen. */
  if(S.sw){_q.setFromAxisAngle(_Y,Math.PI);G.quaternion.multiply(_q);}
  if(S.visSpin!==0){_q.setFromAxisAngle(_Y,-S.visSpin);G.quaternion.multiply(_q);}
  if(S.visFlip!==0){_q.setFromAxisAngle(_Xv,S.visFlip*fs);G.quaternion.multiply(_q);}
  _q.setFromAxisAngle(_Z,S.steer*clamp(sp/25,0.15,1)*0.5*fs*(S.walk?0.15:1));G.quaternion.multiply(_q);
  if(S.crash>0){_q.setFromEuler(_e.set(S.crashT*8,0,S.crashT*3));G.quaternion.multiply(_q);}
  /* rotate about the body's middle rather than the feet so flips look right */
  G.position.set(S.x,S.y,S.z);
  _v1.copy(_c).applyQuaternion(_qb);_v2.copy(_c).applyQuaternion(G.quaternion);
  G.position.add(_v1).sub(_v2);
  poseBody(R,S,dt,sp);
  /* shadow */
  const gy=H(S.x,S.z);R.shadowWrap.position.set(S.x,gy+0.1,S.z);
  _q.setFromUnitVectors(_Y,_n);R.shadowWrap.quaternion.copy(_q);
  const hh=Math.max(0,S.y-gy);R.shadow.scale.setScalar(1.1+hh*0.12);R.shadow.material.opacity=clamp(0.3-hh*0.02,0.06,0.3);
  return sp;
}
/* every frame: pose your own skier from P, and kick up snow spray (and the Lost Line ski trail) */
function updateSkier(dt){
  const sp=poseRider(RIDER,P,dt);
  /* effects (poseRider leaves this rider's forward and side axes in _f and _x) */
  const lost=state.skis==='lost';
  if(P.crash<=0){
    if(!P.walk&&P.grounded&&sp>9){
      const amt=Math.abs(P.steer)*sp/30+P.brake*0.9;
      const n=Math.min(3,Math.floor(amt*3+Math.random()*1.6));
      for(let i=0;i<n;i++){
        const s=Math.random()<0.5?-1:1;
        spray.emit(P.x-_f.x*0.9+_x.x*0.4*s,P.y+0.2,P.z-_f.z*0.9+_x.z*0.4*s,
          _x.x*s*(1.5+Math.random()*2.5)+(Math.random()-0.5)*1.5,1.5+Math.random()*2.5,_x.z*s*(1.5+Math.random()*2.5)+(Math.random()-0.5)*1.5,0.7,0.5);
      }
    }
    /* blowing snow in the wind */
    if(WASH&&windNow>1.5&&Math.random()<windNow*0.3)spray.emit(P.x+(Math.random()-0.5)*18,P.y+Math.random()*3,P.z+(Math.random()-0.5)*18,WIND_DIR.x*windNow*3,0.3,WIND_DIR.z*windNow*3,1.2,0.45);
    if(!P.walk&&lost&&sp>3){
      const ac=hexRGB(accent);
      for(const s of [-1,1]){
        trail.emit(P.x-_f.x*1.0+_x.x*0.23*s,P.y+0.14,P.z-_f.z*1.0+_x.z*0.23*s,(Math.random()-0.5)*0.3,0.2+Math.random()*0.4,(Math.random()-0.5)*0.3,1.15,0.55,ac[0],ac[1],ac[2]);
      }
    }
  }
}

/* ================= walk mode button ================= */
/* E or the boot button: take your skis off or put them back on (only while exploring, and only on the ground) */
/* E or the mount button cycles walk -> skis -> snowboard -> walk (the snowboard step only once you own one) */
let lastSkis='std';   /* the skis to put back on after walking or boarding */
function rideMode(){return P.walk?'walk':(state.gear.skis==='board'?'board':'ski');}
function nextRide(){const m=rideMode();return m==='walk'?'ski':(m==='ski'&&state.have.board?'board':'walk');}
function toggleWalk(){
  if(state.mode!=='explore'||gearOpen())return;
  const next=nextRide();
  if(!P.walk&&(!P.grounded||P.crash>0)){toast('Land first','You can switch once you are on the ground.',1600);return;}
  if(next==='walk'){
    setWalk(true);
    state.runOn=false;state.runArmed=true;state.runT=0;$('timer').innerHTML='';
    toast('Walk mode','W and S walk, A and D turn, arrow up hops. Press E to ride again.',3200);
  } else if(next==='ski'){
    if(state.gear.skis!=='board')lastSkis=state.gear.skis;
    state.gear.skis=lastSkis;applyGear();setWalk(false);
    toast('Skis on','Back to skiing.'+(state.have.board?' Press E again for the snowboard.':''),1400);
  } else {
    lastSkis=state.gear.skis;state.gear.skis='board';applyGear();
    toast('Snowboard on','Strapped in. Press E to walk.',1400);
  }
}
$('walkBtn').addEventListener('click',toggleWalk);
/* keep the walk button's icon and the "Walking" / "Switch" label in step with P */
let walkShown=null;
function updateWalkUI(){
  const show=state.mode==='explore';
  $('walkBtn').classList.toggle('hidden',!show);
  const next=nextRide();
  if(next!==walkShown){
    walkShown=next;   /* the icon shows what the button will do next */
    $('icBoot').classList.toggle('hidden',next!=='walk');$('icSkis').classList.toggle('hidden',next!=='ski');$('icBoard').classList.toggle('hidden',next!=='board');
    const t=next==='walk'?'Walk (E)':(next==='ski'?'Put your skis on (E)':'Switch to the snowboard (E)');$('walkBtn').title=t;$('walkBtn').setAttribute('aria-label',t);
  }
  const st=P.walk?'Walking':(P.sw?'Switch':'');
  $('stance').classList.toggle('hidden',!st||state.mode==='title'||state.mode==='reveal'||state.mode==='results');
  if($('stance').textContent!==st)$('stance').textContent=st;
}
