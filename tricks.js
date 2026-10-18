/* tricks.js: naming and scoring tricks. player.js does the flipping and spinning and reports each landing;
   this file names the trick, scores it and shows it on screen. */
'use strict';
/* ================= tricks: naming, scoring, live readout ================= */
/* grab names by right-stick direction */
const GRAB_NAMES={up:'Nose grab',down:'Tail grab',left:'Indy',right:'Melon'};
/* 2 forward flips -> "Double frontflip" */
function flipName(n,dir){
  const base=dir>0?'frontflip':'backflip';
  if(n===1)return dir>0?'Frontflip':'Backflip';
  return (['','','Double ','Triple ','Quad '][n]||(n+'x '))+base;
}
/* the grab held longest, if it was held for more than a quarter of a second */
function dominantGrab(g){let k=null,t=0;for(const n in g){if(g[n]>t){t=g[n];k=n;}}return t>0.25?k:null;}
/* riding switch (backwards) mirrors the grabs */
const SWAP_GRAB={up:'down',down:'up',left:'right',right:'left'};
/* the full name of a landed trick, for example "Switch Backflip Left 360 Indy" */
function trickLabel(e){
  const p=[];
  if(e.swTake)p.push('Switch');
  if(e.flipN>0)p.push(flipName(e.flipN,e.swTake?-e.flipDir:e.flipDir));
  if(e.spinN>0)p.push((e.spinDir>0?'Right ':'Left ')+(e.spinN*180));
  const g=dominantGrab(e.grabs);if(g)p.push(GRAB_NAMES[e.swTake?SWAP_GRAB[g]:g]);
  let t=p.join(' ');
  if(e.swLand&&!e.swTake)t+=' (lands switch)';
  else if(!e.swLand&&e.swTake)t+=' (back to regular)';
  return t;
}
/* trickLive is the name shown while you are in the air; styleShown is the style number on screen (main.js updates it) */
let trickTimer=0,trickLive='',styleShown=-1;
/* show a trick name and points in the middle of the screen; bail=true shows it as a fall */
function showTrick(name,pts,bail,ms){
  const el=$('trick');el.querySelector('.tn').textContent=name;el.querySelector('.tp').textContent=pts||'';
  el.classList.toggle('bail',!!bail);el.classList.add('show');
  clearTimeout(trickTimer);trickTimer=setTimeout(()=>el.classList.remove('show'),ms||1900);
}
/* the trick name so far, while still in the air */
function liveTrick(){
  const p=[],fh=Math.round(Math.abs(P.flip)/Math.PI),sh=Math.round(Math.abs(P.spin)/Math.PI);
  if(P.swTake&&(fh>=1||sh>=1||P.grab))p.unshift('Switch');
  if(fh>=1)p.push((((P.flip>0)!==!!P.swTake)?'Frontflip ':'Backflip ')+(fh*180));
  if(sh>=1)p.push((P.spin>0?'Right ':'Left ')+(sh*180));
  if(P.grab&&P.grabs[P.grab]>0.12)p.push(GRAB_NAMES[P.swTake?SWAP_GRAB[P.grab]:P.grab]);
  return p.join(' ');
}
/* score a clean landing: 300 per flip, 120 per half-spin, plus grab time and air time. A flip with a spin is x1.5, switch is x1.2,
   then the combo multiplier (up to x8 for tricks landed within 4 s of each other) and your gear's trick bonus. Returns false if there was nothing to score. */
function awardTrick(e){
  const base=e.flipN*300+e.spinN*120+(e.grabT>0.25?e.grabT*90:0)+Math.max(0,e.air-0.8)*50;
  if(base<=0)return false;
  state.mult=state.comboT>0?Math.min(8,state.mult+1):1;
  const pts=Math.round(base*((e.flipN>0&&e.spinN>0)?1.5:1)*((e.swTake||e.swLand)?1.2:1)*state.mult*SKI.style);
  state.style+=pts;state.comboT=4;sfx('trick',state.mult);checkStyleUnlocks();saveSoon();
  showTrick(trickLabel(e),'+'+pts+(state.mult>1?'  x'+state.mult:''),false,1900);
  return true;
}
