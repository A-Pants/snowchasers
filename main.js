/* main.js: ties everything together. Saving and loading, the menu, the game flow (descents, races, results), input from keyboard,
   touch and gamepad, the helicopter lift, keyboard shortcuts, and the main loop that runs every frame. Loads last and starts the game. */
'use strict';
/* ================= saved progress, menu and reset ================= */
/* progress is saved in the browser's localStorage under this key */
const SAVE_KEY='snowchasers.save.v1';
const PAL_DEFAULT={jacket:0xe8553d,pants:0x25313f,boots:0x161d28,skis:0x2f8fe0};
const GH={ll:null,ds:null};   /* my best-run ghosts for this seed */
const numOrNull=v=>(v===null||v===undefined||!Number.isFinite(+v))?null:+v;
/* read the save, or null if there is none (or it is from an older format) */
function readSaveRaw(){try{const o=JSON.parse(store.get(SAVE_KEY)||'null');return(o&&o.v===1)?o:null;}catch(err){return null;}}
/* save unlocks, gear, colours, style, fragments, options, and the best times and ghosts for this seed */
function saveNow(){
  try{
    const old=readSaveRaw(),keepFrags=(old&&Array.isArray(old.frags))?old.frags:[],pbs=(old&&old.pbs&&typeof old.pbs==='object'&&!Array.isArray(old.pbs))?old.pbs:{};
    pbs[SEED_ID]={best:state.best,runBest:state.runBest,gl:GH.ll,gd:GH.ds};
    store.set(SAVE_KEY,JSON.stringify({v:1,have:state.have,gear:state.gear,
      pal:{jacket:PALETTE.jacket.cur,pants:PALETTE.pants.cur,boots:PALETTE.boots.cur,skis:PALETTE.skis.cur},
      style:Math.round(state.style),frags:TUTORIAL?FR.map(f=>!!f.got):keepFrags,   /* other mountains leave the tutorial's fragments as they were */
     
      clues:state.clues,opt:{music:opt.music,sfx:opt.sfx,muted:muted,ghosts:opt.ghosts,ghostSrc:opt.ghostSrc},pbs:pbs,at:Date.now()}));
  }catch(err){}
}
/* saveSoon waits 0.7 s so a burst of changes makes one save; leaving the page saves straight away */
let saveTimer=0;
function saveSoon(){clearTimeout(saveTimer);saveTimer=setTimeout(saveNow,700);}
window.addEventListener('pagehide',saveNow);
/* check a saved ghost looks sane before using it */
function validGhost(g){return(g&&typeof g.b==='string'&&g.b.length>8&&g.b.length<6000&&Number.isFinite(+g.t))?{t:+g.t,b:g.b,look:g.look||null}:null;}
/* load the save into state, checking every value */
function loadSave(){
  const o=readSaveRaw();if(!o)return false;
  try{
    const hv=(o.have&&typeof o.have==='object')?o.have:{};
    ['lost','apex','ridge','trail','board','rime'].forEach(k=>{state.have[k]=hv[k]===true;});
    state.unlocked=state.have.lost;
    SLOTS.forEach(sl=>{const id=o.gear&&o.gear[sl[0]];if(OK_ITEM[sl[0]].indexOf(id)>=0&&(id==='std'||state.have[id]))state.gear[sl[0]]=id;});
    ['jacket','pants','boots','skis'].forEach(k=>{const v=o.pal&&+o.pal[k];if(Number.isFinite(v)&&PALETTE[k].list.indexOf(v)>=0){PALETTE[k].cur=v;if(k==='skis')accent=v;}});
    state.style=Math.max(0,+o.style||0);
    if(Array.isArray(o.frags))FR.forEach((f,i)=>{f.got=o.frags[i]===true;if(f.got)fragObjs[i].g.visible=false;});
    state.count=FR.filter(f=>f.got).length;
    if(o.clues&&typeof o.clues==='object')state.clues={boardNote:o.clues.boardNote===true,parkaNote:o.clues.parkaNote===true};
    if(o.opt){
      if(Number.isFinite(+o.opt.music))opt.music=clamp(+o.opt.music,0,1);
      if(Number.isFinite(+o.opt.sfx))opt.sfx=clamp(+o.opt.sfx,0,1);
      muted=!!o.opt.muted;opt.ghosts=o.opt.ghosts!==false;
      opt.ghostSrc=(o.opt.ghostSrc==='rec'||o.opt.ghostSrc==='off')?o.opt.ghostSrc:'mine';
    }
    const pb=(o.pbs&&typeof o.pbs==='object')?o.pbs[SEED_ID]:null;
    if(pb&&typeof pb==='object'){state.best=numOrNull(pb.best);state.runBest=numOrNull(pb.runBest);GH.ll=validGhost(pb.gl);GH.ds=validGhost(pb.gd);}
  }catch(err){return false;}
  return true;
}
/* "Saved on this device: 2 of 4 map fragments, ..." for the title screen and the menu */
function saveSummary(){
  try{
    const o=readSaveRaw();if(!o)return '';
    const hv=(o.have&&typeof o.have==='object')?o.have:{};
    const have=['lost','apex','ridge','trail'].filter(k=>hv[k]===true).length;
    const fr=Array.isArray(o.frags)?o.frags.filter(v=>v===true).length:0;
    const pb=(o.pbs&&typeof o.pbs==='object')?o.pbs[SEED_ID]:null;
    const parts=[fr+' of 4 map fragments',have+' of 4 gear unlocks'];
    if(pb&&numOrNull(pb.best)!==null)parts.push('best Lost Line '+fmt(+pb.best));
    return 'Saved on this device: '+parts.join(', ')+'.';
  }catch(err){return '';}
}
/* the reset button needs two taps within 4 s, so it cannot be hit by accident */
let resetArmTimer=0;
function armReset(btn){
  if(btn.classList.contains('armed')){clearTimeout(resetArmTimer);btn.classList.remove('armed');btn.textContent='Reset demo';resetProgress();return;}
  btn.classList.add('armed');btn.textContent='Tap again to reset';
  clearTimeout(resetArmTimer);resetArmTimer=setTimeout(()=>{btn.classList.remove('armed');btn.textContent='Reset demo';},4000);
}
/* put everything back to a fresh start, in place, so the demo can be run again */
function resetProgress(){
  clearTimeout(saveTimer);store.del(SAVE_KEY);
  state.have={lost:false,apex:false,ridge:false,trail:false,board:false,rime:false};state.unlocked=false;
  if(legendCache)legendCache.visible=true;
  state.gear={skis:'std',jacket:'std',pants:'std',boots:'std'};
  ['jacket','pants','boots','skis'].forEach(k=>{PALETTE[k].cur=PAL_DEFAULT[k];});accent=PAL_DEFAULT.skis;
  state.style=0;state.mult=1;state.comboT=0;state.best=null;state.runBest=null;state.count=0;state.wipes=0;
  GH.ll=null;GH.ds=null;state.clues={};
  FR.forEach((f,i)=>{f.got=false;});
  for(const k in newItems)delete newItems[k];
  unlockQ.length=0;closeUnlock(false);
  $('gearBtn').classList.remove('new');
  styleShown=-1;
  if(state.mode!=='title'&&state.mode!=='reveal')toExplore();
  fragGroup.visible=true;fragObjs.forEach(o=>{o.g.visible=true;});
  gateGroup.visible=false;
  applyGear();
  saveInfoRefresh();refreshTitleSave();
  toast('Demo reset','Everything is back to the start.',2800);
}
/* show the save summary in the menu and on the title screen */
function saveInfoRefresh(){
  const t=saveSummary();
  $('saveInfo').textContent=t||'Nothing saved yet. Progress saves on this device as you play.';
}
function refreshTitleSave(){
  const t=saveSummary();
  $('saveNote').textContent=t;$('saveNote').classList.toggle('hidden',!t);$('titleReset').classList.toggle('hidden',!t);
}
$('titleReset').addEventListener('click',()=>armReset($('titleReset')));
$('resetBtn').addEventListener('click',()=>armReset($('resetBtn')));

/* ---- menu ---- */
/* is the Riders, Menu or Leaderboard panel open? */
function panelsOpen(){return ['riders','menu','board'].some(id=>!$(id).classList.contains('hidden'));}
/* make the menu controls match the current options */
function refreshMenu(){
  $('volMusic').value=String(Math.round(opt.music*100));$('volSfx').value=String(Math.round(opt.sfx*100));
  $('muteBtn').textContent=muted?'Sound off (M)':'Sound on (M)';
  $('ghostBtn').textContent=opt.ghosts?'Ghosts on':'Ghosts off';$('ghostBtn').classList.toggle('on',opt.ghosts);
  $('seedIn').value=String(GAME_SEED);saveInfoRefresh();
}
function toggleMenu(){
  if(state.mode==='title'||state.mode==='reveal')return;
  const was=$('menu').classList.contains('hidden');closeGear();closePanels();
  if(was){$('menu').classList.remove('hidden');refreshMenu();}
}
$('menuBtn').addEventListener('click',toggleMenu);
$('menuClose').addEventListener('click',()=>closePanels());
onDouble($('menu'),()=>closePanels());
/* menu controls: volumes, mute, ghosts and course seed (a new seed reloads the page) */
$('volMusic').addEventListener('input',()=>{opt.music=clamp((+$('volMusic').value||0)/100,0,1);applyVolumes();saveSoon();});
$('volSfx').addEventListener('input',()=>{opt.sfx=clamp((+$('volSfx').value||0)/100,0,1);applyVolumes();saveSoon();sfx('click');});
$('muteBtn').addEventListener('click',()=>{muted=!muted;applyVolumes();refreshMenu();saveSoon();});
$('ghostBtn').addEventListener('click',()=>{opt.ghosts=!opt.ghosts;refreshMenu();saveSoon();});
$('seedBtn').addEventListener('click',()=>{
  const v=parseInt($('seedIn').value,10);
  if(!(v>=1&&v<=999999)){toast('Pick a seed from 1 to 999999','',2200);return;}
  if(v===GAME_SEED){toast('Already on seed '+v,'',1600);return;}
  saveNow();store.set('snowchasers.seed',String(v));
  toast('Loading seed '+v,'One moment...',2200);
  setTimeout(()=>{try{window.location.reload();}catch(err){toast('Reload the page to load seed '+v,'',4000);}},350);
});

/* ================= game flow ================= */
/* the helicopter: back to the start */
function liftToTop(){
  placePlayer(0,START_Z,0);snapCamera();
  state.runOn=false;state.runArmed=true;state.runT=0;$('timer').innerHTML='';
  toast('Back at the top','Pick a different line this time.',1800);
}
/* crossing the finish on a normal descent: show the time taken, and the first crossing earns boots */
function onBaseReached(){
  sfx('finish');
  const had=state.runOn;let t=state.runT,nb=false;
  if(had){
    state.runOn=false;state.runArmed=false;
    nb=state.runBest!==null&&t<state.runBest;
    const gd=recFinish(t);
    if(state.runBest===null||t<state.runBest){state.runBest=t;if(gd)GH.ds={t:gd.t,b:gd.b,look:currentLook()};}
    if(GP.active&&GP.kind==='d')GP.hold=3;
    saveSoon();
    $('timer').innerHTML=fmt(t)+'<small>'+(nb?'New best descent':'Run complete')+'</small>';
  }
  const gotBoots=TUTORIAL&&grantItem('boots','trail',0xff9f1c);   /* the Trailblazer boots are a tutorial reward */
  if(gotBoots){
    toast(had?'Down in '+fmt(t):'Base lodge reached','',2400);
    queueUnlock({kick:had?'You made it down in '+fmt(t):'You made it to the base lodge',slot:'New boots',icon:'boot',title:'Trailblazer boots',body:'Laced up and already on your feet.',stat:ITEMS.boots[1].stat});
  } else if(had){
    toast('Down in '+fmt(t),'Best '+fmt(state.runBest)+'. Hold the lift button to go again.',3400);
  } else {
    toast('Base lodge reached','Hold the lift button to ride back up.',2600);
  }
}
/* start a Lost Line race: go to the summit, show the gates, start a ghost and count down. secs and mp are for group races. */
function beginCountdown(secs,mp){
  if(!mp){state.raceTok=null;state.raceMP=false;}
  state.mode='countdown';state.cd=(typeof secs==='number')?secs:3.4;state.raceT=0;state.gates=0;state.wipes=0;
  GATES.forEach(g=>{g.hit=false;g.missed=false;g.mesh.material.color.setHex(0x7fe8ff);});
  gateGroup.visible=true;fragGroup.visible=false;
  const dx=lineX(SUMMIT_Z+3)-lineX(SUMMIT_Z);
  placePlayer(lineX(SUMMIT_Z)+(state.raceMP?net.lane:0),SUMMIT_Z,Math.atan2(dx,3));   /* riders in a group race start in their own lane */
  snapCamera();
  recAbort();ghostStart('l');
  $('results').classList.remove('show');closeGear();closePanels();
  $('timer').innerHTML='0:00.00<small>The Lost Line</small>';
}
/* crossed the finish in a race: record the time, keep a new best ghost, grant the Lost Line skis and show the results */
function finishRace(){
  sfx('finish');
  state.mode='results';
  if(state.raceMP&&state.raceTok)state.lastFin={t:state.raceTok,tm:state.raceT,at:performance.now()};
  const t=state.raceT;const nb=state.best===null||t<state.best;if(nb)state.best=t;
  { const g=recFinish(t);if(nb&&g)GH.ll={t:g.t,b:g.b,look:currentLook()};saveSoon(); }
  $('rTime').textContent=fmt(t);$('rGates').textContent=state.gates+'/14';$('rBest').textContent=fmt(state.best);$('rWipe').textContent=state.wipes;
  const rw=[];
  if(grantItem('skis','lost'))rw.push('<div class="rw"><b>Lost Line skis unlocked</b>Precise and unforgiving. They reward clean landings. Open Gear to recolor them.</div>');
  if(grantItem('boots','trail',0xff9f1c))rw.push('<div class="rw"><b>Trailblazer boots unlocked</b>Stronger push on flat ground and softer landings.</div>');
  $('rReward').innerHTML=rw.join('');
  $('rReward').style.display=rw.length?'block':'none';
  $('results').classList.add('show');
}
/* back to free skiing at the start (from results, a reset, or leaving a group race) */
function toExplore(){
  recAbort();ghostStop();
  state.mode='explore';gateGroup.visible=false;fragGroup.visible=true;FR.forEach((f,i)=>{fragObjs[i].g.visible=false;});
  $('results').classList.remove('show');$('timer').innerHTML='';
  placePlayer(0,START_Z,0);snapCamera();
  state.runOn=false;state.runArmed=true;state.runT=0;state.raceTok=null;state.raceMP=false;
}
/* results screen buttons */
$('rAgain').addEventListener('click',()=>beginCountdown());
$('rFree').addEventListener('click',toExplore);

/* ================= input: two sticks ================= */
/* keys: which keyboard keys are held, by code ('KeyW', 'ArrowUp', ...).
   On touch screens a stick appears wherever a thumb goes down: left half is the left stick, right half the right stick. SR is how far a stick reaches, in pixels. */
const keys={};
const pad=$('pad'),SR=62;
const sticks={
  L:{id:null,ox:0,oy:0,x:0,y:0,el:$('stickL'),knob:$('stickL').querySelector('.knob'),ghost:$('ghostL')},
  R:{id:null,ox:0,oy:0,x:0,y:0,el:$('stickR'),knob:$('stickR').querySelector('.knob'),ghost:$('ghostR')}
};
/* move a touch stick to follow the finger, up to SR away */
function stickMove(s,e){
  let dx=e.clientX-s.ox,dy=e.clientY-s.oy;const d=Math.hypot(dx,dy);
  if(d>SR){dx*=SR/d;dy*=SR/d;}
  s.x=dx/SR;s.y=-dy/SR;s.knob.style.transform='translate('+dx+'px,'+dy+'px)';
}
function stickEnd(s){s.id=null;s.x=0;s.y=0;s.el.classList.remove('on');s.knob.style.transform='translate(0px,0px)';}
/* on a computer the game is keyboard only (WASD and the arrow keys): a mouse or trackpad never drives the sticks.
   Touch and pen drive the floating sticks, and touch mode switches on the first time the screen is touched. */
pad.addEventListener('pointerdown',e=>{
  if(e.pointerType==='mouse')return;
  if(e.preventDefault)e.preventDefault();
  const s=sticks[e.clientX<window.innerWidth/2?'L':'R'];
  if(s.id!==null)return;
  s.id=e.pointerId;s.ox=e.clientX;s.oy=e.clientY;s.x=0;s.y=0;
  s.el.style.left=s.ox+'px';s.el.style.top=s.oy+'px';s.knob.style.transform='translate(0px,0px)';
  s.el.classList.add('on');s.ghost.classList.add('hide');
  try{pad.setPointerCapture(e.pointerId);}catch(_){}
});
pad.addEventListener('pointermove',e=>{for(const k in sticks){if(sticks[k].id===e.pointerId)stickMove(sticks[k],e);}});
['pointerup','pointercancel'].forEach(t=>pad.addEventListener(t,e=>{for(const k in sticks){if(sticks[k].id===e.pointerId)stickEnd(sticks[k]);}}));
pad.addEventListener('contextmenu',e=>{if(e.preventDefault)e.preventDefault();});
window.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'||e.pointerType==='pen')document.body.classList.add('touch');},true);

/* dzone ignores tiny stick movements; kb turns a pair of keys into -1, 0 or 1 */
const dzone=v=>{const a=Math.abs(v);return a<0.16?0:Math.sign(v)*(a-0.16)/0.84;};
const kb=(neg,pos)=>(keys[pos]?1:0)-(keys[neg]?1:0);
let gpSel=false,gpA=false;
/* read the first connected gamepad: both sticks, Select (lift) and A (start) */
function readGamepad(){
  const o={lx:0,ly:0,rx:0,ry:0,sel:false,a:false};
  try{
    const list=navigator.getGamepads?navigator.getGamepads():[];
    for(let i=0;i<list.length;i++){const g=list[i];
      if(g&&g.connected){
        o.lx=dzone(g.axes[0]||0);o.ly=-dzone(g.axes[1]||0);o.rx=dzone(g.axes[2]||0);o.ry=-dzone(g.axes[3]||0);
        o.sel=!!(g.buttons[8]&&g.buttons[8].pressed);o.a=!!(g.buttons[0]&&g.buttons[0].pressed);break;
      }
    }
  }catch(_){}
  return o;
}
/* shorten a stick vector to length 1, so pressing two keys at once is not stronger */
function unit(x,y){const m=Math.hypot(x,y);return m>1?[x/m,y/m]:[x,y];}
/* combine keyboard, touch sticks and gamepad into one input: lx,ly (left stick) and rx,ry (right stick), each from -1 to 1 */
function readInput(){
  const gp=readGamepad();gpSel=gp.sel;gpA=gp.a;
  const l=unit(kb('KeyA','KeyD')+dzone(sticks.L.x)+gp.lx,kb('KeyS','KeyW')+dzone(sticks.L.y)+gp.ly);
  /* keyboard: Up beats Down, so tapping Up while still holding Down (loaded) fires the hop instead of cancelling out */
  const kry=keys.ArrowUp?1:(keys.ArrowDown?-1:0);
  const r=unit(kb('ArrowLeft','ArrowRight')+dzone(sticks.R.x)+gp.rx,kry+dzone(sticks.R.y)+gp.ry);
  return{lx:l[0],ly:l[1],rx:r[0],ry:r[1]};
}

/* ================= lift: hold a button that sits away from the sticks ================= */
/* hold for 0.7 s to ride up: while exploring you go back to the start, in a race the race restarts, in a group race you leave it */
const liftBtn=$('liftBtn');let liftHold=0,liftLock=false,liftBtnDown=false;
liftBtn.addEventListener('pointerdown',e=>{if(e.preventDefault)e.preventDefault();liftBtnDown=true;});
['pointerup','pointerleave','pointercancel'].forEach(t=>liftBtn.addEventListener(t,()=>{liftBtnDown=false;}));
$('lostBtn').addEventListener('click',()=>{if(TUTORIAL&&state.mode==='explore'&&(state.unlocked||state.count>=4))beginCountdown();});
/* every frame: show the right buttons for the current screen, and fill the lift button while it is held */
function updateLift(dt){
  const active=state.mode==='explore'||state.mode==='race'||state.mode==='countdown';
  liftBtn.classList.toggle('hidden',!active);
  $('boardBtn').classList.toggle('hidden',state.mode==='title'||state.mode==='reveal'||state.mode==='results'||state.mode==='countdown');
  $('lostBtn').classList.toggle('hidden',!(TUTORIAL&&state.mode==='explore'&&(state.unlocked||state.count>=4)));
  const holding=active&&(liftBtnDown||!!keys.Backspace||gpSel);
  if(holding&&!liftLock){
    liftHold+=dt;
    if(liftHold>=0.7){liftHold=0;liftLock=true;sfx('whoosh');if(state.mode==='explore')liftToTop();else if(state.raceMP){toExplore();toast('You left the race','Hold the lift button to ride back up any time.',2200);}else beginCountdown();}
  } else if(!holding){liftHold=0;liftLock=false;}
  $('liftFill').style.height=Math.min(100,liftHold/0.7*100)+'%';
}

/* ================= keyboard shortcuts ================= */
/* F or "Skip to the finale": mark all four fragments found and start the map reveal */
function skipToFinale(){
  if(!TUTORIAL||state.mode!=='explore'||state.count>=4)return;
  FR.forEach((f,i)=>{if(!f.got){f.got=true;state.count++;fragObjs[i].g.visible=false;}});
  toast('All four fragments','Skipping ahead to the finale',1800);
  setTimeout(()=>{if(state.mode==='explore')startReveal();},1000);
}
/* every key press. Shortcuts: G gear, R riders, B leaderboard, E walk, J join a race, Esc menu, M mute, L race, F skip to the finale,
   K +5,000 style (a demo shortcut). keys[] remembers what is held so readInput can use it. */
function down(e){
  if(e.target&&e.target.tagName==='INPUT')return;   /* typing a room code is not game input */
  if(['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Backspace'].indexOf(e.code)>=0&&e.preventDefault)e.preventDefault();
  if(['KeyW','KeyA','KeyS','KeyD','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].indexOf(e.code)>=0)document.body.classList.remove('touch');
  keys[e.code]=true;
  if(e.repeat)return;
  if(worldsOpen()){if(e.code==='Escape')closeWorlds();return;}   /* the world map takes over the keyboard while it is open */
  if(unlockOpen()){if(e.code==='Enter'||e.code==='Space'||e.code==='Escape')closeUnlock(false);else if(e.code==='KeyG')closeUnlock(true);return;}
  if(state.mode==='title'&&(e.code==='Enter'||e.code==='Space')){startGame();return;}
  if(state.mode==='reveal'&&revealDone&&(e.code==='Enter'||e.code==='Space')){$('mapBtn').click();return;}
  if(state.mode==='results'){if(e.code==='Enter')beginCountdown();if(e.code==='Escape')toExplore();return;}
  if(e.code==='KeyG'){closePanels();toggleGear();}
  if(e.code==='KeyR')toggleRiders();
  if(e.code==='KeyB')toggleBoard();
  if(e.code==='KeyE')toggleWalk();
  if(e.code==='KeyJ')joinInvite();
  if(e.code==='Escape'){if(gearOpen()||panelsOpen()){closeGear();closePanels();}else toggleMenu();}
  if(e.code==='KeyM'){muted=!muted;applyVolumes();callout(muted?'Sound off':'Sound on',900);}
  if(e.code==='KeyL'&&TUTORIAL&&state.mode==='explore'&&(state.unlocked||state.count>=4))beginCountdown();
  if(e.code==='KeyF')skipToFinale();
  if(e.code==='KeyK'&&(state.mode==='explore'||state.mode==='race')){state.style+=5000;callout('+5,000 style (demo shortcut)',900);checkStyleUnlocks();}
}
window.addEventListener('keydown',down);
window.addEventListener('keyup',e=>{keys[e.code]=false;});
window.addEventListener('blur',()=>{for(const k in keys)keys[k]=false;});

/* ================= main loop ================= */
/* "Drop in": hide the title, start sound and multiplayer, and show the first goal */
function startGame(){
  $('title').classList.add('hidden');state.mode='explore';initAudio();
  if(net.ready)joinRoom(sanitizeRoom($('roomCode').value));
  if(audio&&audio.ctx.state==='suspended')audio.ctx.resume();
  fragGroup.visible=true;snapCamera();state.hintT=0;
  if(TUTORIAL)toast('Find the four map fragments','Look for the golden beams. Double-tap any panel to shrink it to an icon.',4600);
  else toast(MTN.name,MTN.welcome,4600);
}
$('startBtn').addEventListener('click',startGame);
$('skipBtn').addEventListener('click',()=>{startGame();skipToFinale();});

/* last: when the previous frame ran. tAnim: a clock for idle animations. lastCountN: the last countdown number that beeped. */
let last=performance.now(),tAnim=0,lastCountN=99,windHint=false,hutNoteShown=false,noticeSeen=false,senseBand=0,senseOp=0;
/* read the note about this mountain's hidden item: show it, remember it, and mark the search area on the minimap */
function readLegendNote(where){
  toast(where,LEGEND.note,9000);
  if(!state.clues[LEGEND.clue]){state.clues[LEGEND.clue]=true;saveSoon();setTimeout(()=>callout('Search area marked on your map',1800),2200);}
}
/* react to what the physics reported this frame: sounds, snow spray, a camera dip, trick names and scores */
function processEvents(ev){
  for(const e of ev){
    if(e.t==='pop'){sfx('pop',e.power);}
    else if(e.t==='land'){
      camDip=Math.min(1.2,e.impact*0.06);
      if(e.impact>3&&!e.crashed)sfx('land',e.impact);
      if(e.swLand!==e.swTake&&!e.crashed)sfx('whoosh');
      for(let i=0;i<Math.min(26,6+e.impact);i++){const a=Math.random()*6.28,s=2+Math.random()*5;spray.emit(P.x,P.y+0.2,P.z,Math.cos(a)*s,2+Math.random()*4,Math.sin(a)*s,0.9,0.7);}
      trickLive='';
      if(e.crashed){showTrick(e.stumble?'Stumbled':'Bailed','',!e.stumble,e.stumble?900:1200);}
      else if((e.flipN>0||e.spinN>0||e.grabT>0.25)&&e.ok){ if(!awardTrick(e))$('trick').classList.remove('show'); }
      else{
        $('trick').classList.remove('show');
        if(e.air>0.9)callout(e.air.toFixed(1)+' s air',1000);
      }
    } else if(e.t==='bump'){
      sfx('bump');
      camDip=0.5;
      for(let i=0;i<14;i++){const a=Math.random()*6.28,s=2+Math.random()*4;spray.emit(P.x,P.y+0.8,P.z,Math.cos(a)*s,1+Math.random()*3,Math.sin(a)*s,0.7,0.6);}
      callout(['Clipped it','Shrugged it off','Glancing hit'][Math.floor(Math.random()*3)],800);
    } else if(e.t==='crash'){
      sfx((e.sev===undefined?1:e.sev)>=0.5?'wipeout':'stumble');
      if((e.sev===undefined?1:e.sev)>=0.5)state.wipes++;
      if(e.obstacle)callout((e.sev===undefined?1:e.sev)>=0.5?'Wipeout':'Stumbled',1100);
      for(let i=0;i<40;i++){const a=Math.random()*6.28,s=2+Math.random()*6;spray.emit(P.x,P.y+0.5,P.z,Math.cos(a)*s,2+Math.random()*5,Math.sin(a)*s,1.2,0.8);}
    }
  }
}
/* the game logic for one frame. dt is the seconds since the last frame. */
function update(dt){
  tAnim+=dt;senseOp=0;
  if(outpostSpin)outpostSpin.rotation.y+=dt*2.2;
  fragObjs.forEach((o,i)=>{if(!FR[i].got){o.paper.rotation.y+=dt*1.6;o.paper.position.y=Math.sin(tAnim*2+i)*0.25;o.halo.rotation.z+=dt;o.beam.material.opacity=0.24+0.1*Math.sin(tAnim*2.4+i);}});
  const mode=state.mode;
  let inp=readInput();
  if(mode==='explore')pumpUnlock();
  const live=(mode==='explore'||mode==='race')&&!gearOpen()&&!unlockOpen()&&!worldsOpen();
  if(!live)inp={lx:0,ly:0,rx:0,ry:0};
  updateLift(dt);netTick(dt);updateWalkUI();
  if(live){
    /* run the physics in steps of at most 1/60 s so it behaves the same at any frame rate */
    const steps=Math.max(1,Math.ceil(dt/(1/60)));const sdt=dt/steps;
    const ev=[];const pz=P.z;
    for(let s=0;s<steps;s++)stepPlayer(sdt,inp,ev);
    recTick(dt);
    processEvents(ev);
    if(mode==='explore'){
      /* exploring: pick up nearby fragments, start the descent timer once you move, and check the finish line */
      for(let i=0;i<FR.length;i++){const f=FR[i];if(f.got)continue;
        const d=Math.hypot(P.x-f.x,P.y+1-f.y,P.z-f.z);if(d<f.rad+(P.walk?5:0)){collect(i);}}
      if(state.runArmed&&!P.walk&&Math.hypot(P.vx,P.vz)>2){state.runOn=true;state.runArmed=false;state.runT=0;recStart('d');ghostStart('d');}
      if(REC.on&&REC.kind==='d'&&!state.runOn)recAbort();
      if(state.runOn){state.runT+=dt;$('timer').innerHTML=fmt(state.runT)+'<small>Descent time'+ghostSuffix()+'</small>';}
      if(pz<FINISH_Z&&P.z>=FINISH_Z){if(P.walk)toast('Base lodge reached','Press E to put your skis back on.',2000);else onBaseReached();}
      state.hintT+=dt;if(state.hintT>16)$('hints').classList.add('fade');
      if(WASH&&!windHint&&windNow>3.6&&SKI.wind>0.5){windHint=true;toast('Fierce wind','Mount Washington has some of the strongest winds on Earth. Gusts above treeline push you around.',4200);}
      if(legendRag)legendRag.rotation.x=0.25*Math.sin(tAnim*3.1)+0.1*Math.sin(tAnim*7.3);   /* the rag flaps in the wind */
      if(legendCache&&legendCache.visible){
        legendCache.userData.glow.intensity=0.7+0.4*Math.sin(tAnim*2);   /* the glow breathes slowly */
        const d=Math.hypot(P.x-LEGEND_SPOT.x,P.z-LEGEND_SPOT.z);
        if(Math.hypot(P.x-NOTICE_SPOT.x,P.z-NOTICE_SPOT.z)<18)noticeSeen=true;   /* you passed the notice board */
        /* the glint twinkles and grows with distance so it shows from the run, and fades out once you are close */
        legendGlint.material.opacity=(0.55+0.45*Math.sin(tAnim*5)*Math.sin(tAnim*1.7))*smooth(18,45,d);
        const gs=clamp(3+d*0.035,3,9);legendGlint.scale.set(gs,gs,1);
        /* getting warmer: a chime each time you get closer (60 m, 35 m, 15 m) and a golden shimmer round the screen */
        const band=d<15?3:(d<35?2:(d<60?1:0));
        if(band>senseBand)sfx('sense',band);
        senseBand=band;senseOp=(1-smooth(12,60,d))*(0.42+0.13*Math.sin(tAnim*3));
        if(d<(P.walk?4.5:3.2))findLegend();
        /* the clue: a note on the notice board at the top, and the same note on the warming hut door for anyone who skied past it */
        else if(!hutNoteShown&&noticeSeen&&state.hintT>4.8){hutNoteShown=true;readLegendNote('A note on the notice board');}   /* shown once the welcome message has gone */
        else if(!hutNoteShown&&Math.hypot(P.x-PADS[1].x,P.z-PADS[1].z)<10){hutNoteShown=true;readLegendNote(LEGEND.hut);}
      }
    } else {
      /* racing: run the clock, check each gate as you pass it, and finish at the line */
      state.raceT+=dt;
      GATES.forEach(g=>{
        if(g.hit||g.missed)return;
        if(pz<g.z&&P.z>=g.z){
          if(Math.abs(P.x-g.x)<6.4){g.hit=true;state.gates++;sfx('gate',true);g.mesh.material.color.setHex(0x7dff9a);callout(state.gates+' of 14',500);}
          else{g.missed=true;sfx('gate',false);g.mesh.material.color.setHex(0xff9a5a);}
        }
      });
      if(pz<FINISH_Z&&P.z>=FINISH_Z)finishRace();
    }
    /* live trick readout while airborne */
    if(!P.grounded&&P.crash<=0){
      const t=liveTrick();
      if(t!==trickLive){
        trickLive=t;
        if(t){const el=$('trick');el.querySelector('.tn').textContent=t;el.querySelector('.tp').textContent='';el.classList.remove('bail');el.classList.add('show');clearTimeout(trickTimer);}
        else $('trick').classList.remove('show');
      }
    }
  } else if(mode==='countdown'){
    /* countdown: beep on 3, 2 and 1, then go */
    state.cd-=dt;
    { const cn=Math.ceil(state.cd);if(cn!==lastCountN){lastCountN=cn;if(cn>=1&&cn<=3)sfx('count',cn);} }
    if(state.cd<=0){state.mode='race';state.raceT=0;$('count').textContent='';callout('Go',700);sfx('count',0);recStart('l');}
  }
  $('sense').style.opacity=senseOp.toFixed(2);
  /* combo */
  if(state.comboT>0){state.comboT-=dt;if(state.comboT<=0)state.mult=1;}
  if(Math.round(state.style)!==styleShown){
    styleShown=Math.round(state.style);$('styleVal').textContent=fmtN(styleShown);
    $('styleMini').textContent=styleShown>=1000?(styleShown/1000).toFixed(styleShown>=10000?0:1)+'k':String(styleShown);
    /* the meter shows how close the next reward is, but not what it is or the exact target: that is the surprise */
    const nx=$('styleNext');
    if(!TUTORIAL)nx.style.display='none';
    else if(!state.have.apex){nx.style.display='block';$('styleBar').style.width=Math.min(100,styleShown/GEAR_AT.apex*100)+'%';$('styleNextTxt').textContent='Next gear unlock: ???';}
    else if(!state.have.ridge){nx.style.display='block';$('styleBar').style.width=Math.min(100,(styleShown-GEAR_AT.apex)/(GEAR_AT.ridge-GEAR_AT.apex)*100)+'%';$('styleNextTxt').textContent='Next gear unlock: ???';}
    else nx.style.display='none';
  }
  $('combo').textContent=(state.comboT>0&&state.mult>1)?('x'+state.mult):'';
  /* hud */
  const sp3=Math.hypot(P.vx,P.vy,P.vz);
  $('spd').textContent=Math.round(sp3*3.6);
  if(state.mode==='race')$('timer').innerHTML=fmt(state.raceT)+'<small>Gates '+state.gates+' of 14'+ghostSuffix()+'</small>';
  if(state.mode==='countdown'){const n=Math.ceil(state.cd-0.4);$('count').textContent=n>0?n:'';}
  else if(state.mode==='explore')$('count').textContent='';
  updateJournal(dt);drawMini(dt);audioTick(dt);
}
/* move everything that is only for show: skiers, the ghost, particles, and the snowfall (which wraps around the camera) */
function updateWorld(dt){
  updateSkier(dt);updateRemotes(dt);updateGhost(dt);
  spray.update(dt);trail.update(dt);burst.update(dt);
  const wind=Math.sin(tAnim*0.3)*0.6;
  for(let i=0;i<SNOW_N;i++){
    const k=i*3;
    snowPos[k]+=wind*dt;snowPos[k+1]-=(2.2+(i%5)*0.4)*dt;
    if(snowPos[k+1]<camera.position.y-12)snowPos[k+1]+=36;
    if(snowPos[k+1]>camera.position.y+24)snowPos[k+1]-=36;
    if(snowPos[k]<camera.position.x-40)snowPos[k]+=80;if(snowPos[k]>camera.position.x+40)snowPos[k]-=80;
    if(snowPos[k+2]<camera.position.z-40)snowPos[k+2]+=80;if(snowPos[k+2]>camera.position.z+40)snowPos[k+2]-=80;
  }
  snowGeo.attributes.position.needsUpdate=true;
}
/* the main loop. The browser calls frame before each screen refresh (usually 60 times a second). dt is capped at 0.05 s so a pause does not fling you across the map. */
function frame(now){
  requestAnimationFrame(frame);
  let dt=Math.min(0.05,(now-last)/1000);last=now;if(dt<=0)dt=1/60;
  if(state.mode==='reveal'){netTick(dt);renderer.render(scene,camera);return;}
  if(state.mode==='title'){tAnim+=dt;netTick(dt);if(readGamepad().a)startGame();updateSkier(dt);updateTreeFade(dt);renderer.render(scene,camera);return;}
  update(dt);updateCamera(dt);updateTreeFade(dt);updateWorld(dt);
  renderer.render(scene,camera);
}

/* ================= init ================= */
/* start-up: size the view, place the skier, load the save, put on your gear, start the loop and connect to multiplayer */
resize();setupMini();
placePlayer(0,START_Z,0);snapCamera();
fragObjs.forEach(o=>{o.g.visible=true;});
loadSave();
if(legendCache&&state.have[LEGEND.id])legendCache.visible=false;
applyGear();refreshTitleSave();saveInfoRefresh();
camera.position.copy(camPos);camera.lookAt(P.x,P.y+1.8,P.z+7);
requestAnimationFrame(frame);
/* handy for debugging: type __snowchasers.P in the browser console to see the player */
window.__snowchasers={P:P,state:state,net:net};
initNet();
