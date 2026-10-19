/* gear.js: the four gear slots (skis, jacket, pants, boots), their colours and stat effects, how gear is earned,
   the unlock pop-up and the Gear panel. */
'use strict';
/* ================= gear ================= */
/* style points needed to earn the Apex Shell and the Ridge pants */
const GEAR_AT={apex:10000,ridge:25000};
/* every item in each slot. 'std' is what you start with; lock says how to earn the others. */
const ITEMS={
  skis:[{id:'std',name:'Standard skis',stat:'Balanced.'},
        {id:'lost',name:'Lost Line skis',stat:'More speed, tighter turns and +35% trick score, but landings are unforgiving.',lock:'Finish the Lost Line race.'},
        {id:'board',name:'The Tahoe Legend',rarity:'legendary',hidden:true,stat:'Legendary snowboard. Spins 20% faster and +25% trick score, steadier landings, but slow to push on flat ground.'}],
  jacket:[{id:'std',name:'Trail jacket',stat:'Balanced.'},
        {id:'apex',name:'Apex Shell',stat:'+15% trick score, a little more drag from the hood.',lock:'Land tricks and build up your style.'},
        {id:'rime',name:'The Rime Parka',rarity:'legendary',hidden:true,stat:'Legendary parka. Blocks 70% of the wind on Mount Washington and softens landings. It will keep you warm when the cold comes.'}],
  pants:[{id:'std',name:'Trail pants',stat:'Balanced.'},
        {id:'ridge',name:'Ridge pants',stat:'Tighter carving, a little more drag from the baggy legs.',lock:'Keep building your style.'}],
  boots:[{id:'std',name:'Trail boots',stat:'Balanced.'},
        {id:'trail',name:'Trailblazer boots',stat:'Stronger push on flat ground and softer landings, slightly slower to turn.',lock:'Ski down to the base lodge.'}]
};
/* the slots in the order the Gear panel shows them: [id, label] */
const SLOTS=[['skis','Skis / board'],['jacket','Jacket'],['pants','Pants'],['boots','Boots']];
/* the colour choices for each slot, the material the colour paints, and the current colour */
const PALETTE={
  skis:{list:[0x2f8fe0,0xff5a7a,0xffd27a,0x7dff9a,0xf2f7fb,0xb07bff],cur:0x2f8fe0},
  jacket:{mat:jacketMat,list:[0xe8553d,0xf2b134,0x3fa56b,0x3b82d6,0x8a5bd1,0x1b2330,0x19b4c9],cur:0xe8553d},
  pants:{mat:pantsMat,list:[0x25313f,0x3a4a2f,0x6b3b2a,0x2b3f6b,0xcfd6de,0x14181f],cur:0x25313f},
  boots:{mat:bootMat,list:[0x161d28,0xff9f1c,0xe8553d,0x3fa56b,0xf2f7fb,0x7a5a3a],cur:0x161d28}
};
/* haveItem(id) is true if unlocked. newItems marks items to flag as new. gearUI holds the panel's buttons. fmtN(12345) gives "12,345". */
const haveItem=id=>id==='std'||!!state.have[id];
const newItems={};
const gearUI={};
const fmtN=n=>Math.round(n).toLocaleString('en-US');
/* pick a colour for a slot and repaint the skier */
function setSlotColor(slot,hex){
  const pl=PALETTE[slot];pl.cur=hex;
  if(slot==='skis'){accent=hex;} else {pl.mat.color.setHex(hex);}
  applyGear();
}
/* what you are wearing right now, in the format other players and ghosts use */
function currentLook(){const g=state.gear;return {skis:g.skis,jacket:g.jacket,pants:g.pants,boots:g.boots,c:[PALETTE.jacket.cur,PALETTE.pants.cur,PALETTE.boots.cur,PALETTE.skis.cur]};}
/* apply the equipped gear: repaint the skier and work out the SKI stats that player.js uses */
function applyGear(){
  const g=state.gear;state.skis=g.skis;
  setRiderLook(RIDER,currentLook());
  const rid=g.pants==='ridge',tb=g.boots==='trail',lost=g.skis==='lost',board=g.skis==='board';
  /* each item trades something for something, and appearance never changes performance */
  let drag=1,turn=1,tolM=1,style=1,push=1,spin=1,wind=1;
  if(lost){drag*=0.9;turn*=1.12;tolM*=0.7;style*=1.35;}
  if(board){turn*=1.06;tolM*=1.15;style*=1.25;push*=0.6;spin*=1.2;}
  if(g.jacket==='apex'){style*=1.15;drag*=1.03;}
  if(g.jacket==='rime'){wind*=0.3;tolM*=1.08;drag*=1.03;}
  if(rid){turn*=1.08;drag*=1.03;}
  if(tb){push*=1.35;tolM*=1.1;turn*=0.97;}
  SKI.drag=drag;SKI.turn=turn;SKI.tol=0.6*tolM;SKI.style=style;SKI.push=push;SKI.hop=1;SKI.spin=spin;SKI.wind=wind;
  SKI.armor=0;   /* future armor items raise this (0 to 1) to cut the chance that a hit wipes you out */
  refreshGear();saveSoon();
}
/* build the Gear panel once: colour swatches, item buttons and a stats line for each slot */
function buildGearPanel(){
  const root=$('gearRows');
  SLOTS.forEach(sl=>{
    const slot=sl[0],row=document.createElement('div');row.className='slot';
    row.innerHTML='<div class="top"><label>'+sl[1]+'</label><div class="sw"></div></div><div class="items"></div><div class="stat"></div>';
    root.appendChild(row);
    const sw=row.querySelector('.sw'),itemsEl=row.querySelector('.items'),statEl=row.querySelector('.stat');
    const ui=gearUI[slot]={chips:{},sw:[],stat:statEl};
    PALETTE[slot].list.forEach(c=>{
      const b=document.createElement('button');b.style.background='#'+c.toString(16).padStart(6,'0');
      b.setAttribute('aria-label',sl[1]+' color');
      b.addEventListener('click',()=>setSlotColor(slot,c));sw.appendChild(b);ui.sw.push([b,c]);
    });
    ITEMS[slot].forEach(it=>{
      const b=document.createElement('button');b.className='chip';
      b.addEventListener('click',()=>{ if(haveItem(it.id)){state.gear[slot]=it.id;applyGear();} else {showLockHint(slot,it);} });
      itemsEl.appendChild(b);ui.chips[it.id]=b;
    });
  });
}
/* clicking a locked item shows how to unlock it */
let lockHint=null;
function showLockHint(slot,it){lockHint={slot:slot,id:it.id};refreshGear();}
/* update the Gear panel: item names, which one is worn, locked and new markers, and the stats text */
function refreshGear(){
  $('gearArmor').innerHTML='Impact protection: <b>'+Math.round(SKI.armor*100)+'%</b>. A full-speed hit on a tree or rock wipes you out about <b>'+Math.round(crashChance(1)*100)+'%</b> of the time; otherwise you just get clipped.';
  SLOTS.forEach(sl=>{
    const slot=sl[0],ui=gearUI[slot];if(!ui)return;
    ITEMS[slot].forEach(it=>{
      const b=ui.chips[it.id],have=haveItem(it.id);
      b.textContent=have?it.name:'??? (locked)';
      b.classList.toggle('on',state.gear[slot]===it.id);
      b.classList.toggle('locked',!have);
      b.classList.toggle('new',!!newItems[it.id]);
      b.classList.toggle('hidden',!!it.hidden&&!have);   /* hidden items stay secret until found */
    });
    ui.sw.forEach(x=>x[0].classList.toggle('on',x[1]===PALETTE[slot].cur));
    const eq=ITEMS[slot].find(i=>i.id===state.gear[slot]);
    let html=eq.stat;
    const locked=ITEMS[slot].find(i=>!haveItem(i.id)&&!i.hidden);
    if(locked){
      html+='<br><b>Locked:</b> '+locked.lock;
    }
    ui.stat.innerHTML=html;
  });
}
/* give an item, equip it with its own default colour, and flag it as new */
function grantItem(slot,id,defColor){
  if(state.have[id])return false;
  state.have[id]=true;state.gear[slot]=id;newItems[id]=true;
  if(id==='lost')state.unlocked=true;
  if(defColor!==undefined){PALETTE[slot].cur=defColor;if(slot!=='skis')PALETTE[slot].mat.color.setHex(defColor);}
  $('gearBtn').classList.add('new');
  applyGear();
  for(let n=0;n<36;n++){const a=Math.random()*6.28,sp=2+Math.random()*5;burst.emit(P.x,P.y+1.2,P.z,Math.cos(a)*sp,2+Math.random()*5,Math.sin(a)*sp,1.1,0.6);}
  return true;
}
/* after every trick: hand out the style rewards once the totals are reached */
/* walking or riding into this mountain's hidden legendary item (see LEGEND in world.js) */
function findLegend(){
  if(!LEGEND||!grantItem(LEGEND.slot,LEGEND.id,LEGEND.color))return;
  if(legendCache)legendCache.visible=false;
  sfx('collect');saveSoon();
  const it=ITEMS[LEGEND.slot].find(i=>i.id===LEGEND.id);
  queueUnlock(Object.assign({legend:true,kick:'Legendary find',stat:it.stat},LEGEND.unlock));
}
function checkStyleUnlocks(){
  if(!TUTORIAL)return;   /* these style rewards belong to the tutorial */
  if(state.style>=GEAR_AT.apex&&grantItem('jacket','apex',0x19b4c9))queueUnlock({kick:'You hit '+fmtN(GEAR_AT.apex)+' style',slot:'New jacket',icon:'jacket',title:'Apex Shell',body:'Hood up, yoke on. It is already equipped.',stat:ITEMS.jacket[1].stat});
  if(state.style>=GEAR_AT.ridge&&grantItem('pants','ridge',0x3a4a2f))queueUnlock({kick:'You hit '+fmtN(GEAR_AT.ridge)+' style',slot:'New pants',icon:'pants',title:'Ridge pants',body:'Baggy, loud and ready to carve. They are already on.',stat:ITEMS.pants[1].stat});
}
/* a big reveal when gear is earned. It waits for a calm moment on the mountain, and the game pauses while it is up. */
const unlockQ=[];
const unlockOpen=()=>!$('unlock').classList.contains('hidden');
function queueUnlock(u){unlockQ.push(u);if(state.mode!=='explore')callout('New gear unlocked',1500);pumpUnlock();}
function pumpUnlock(){if(unlockOpen()||gearOpen()||!unlockQ.length||state.mode!=='explore')return;showUnlock(unlockQ.shift());}
function showUnlock(u){
  sfx('unlock');
  $('uKick').textContent=u.kick;$('uIcon').innerHTML=ico(u.icon);$('uSlot').textContent=u.slot;
  $('uTitle').textContent=u.title;$('uBody').textContent=u.body;$('uStat').textContent=u.stat;
  $('unlock').classList.toggle('legend',!!u.legend);
  $('unlock').classList.remove('hidden');
  try{$('uOk').focus();}catch(err){}
}
function closeUnlock(openGearAfter){
  $('unlock').classList.add('hidden');
  if(openGearAfter&&state.mode==='explore')toggleGear();
}
$('uOk').addEventListener('click',()=>closeUnlock(false));
$('uGear').addEventListener('click',()=>closeUnlock(true));
$('gearClose').addEventListener('click',()=>closeGear());
$('gearBtn').addEventListener('click',()=>toggleGear());
/* G or the backpack button opens and closes the Gear panel (not on the title, map or results screens) */
function toggleGear(){
  if(state.mode==='title'||state.mode==='reveal'||state.mode==='results')return;
  closePanels();
  const el=$('gear');el.classList.toggle('hidden');
  if(!el.classList.contains('hidden')){$('gearBtn').classList.remove('new');for(const k in newItems)delete newItems[k];lockHint=null;refreshGear();}
}
function closeGear(){$('gear').classList.add('hidden');}
const gearOpen=()=>!$('gear').classList.contains('hidden');
/* build the panel now, at start-up */
buildGearPanel();
onDouble($('gear'),()=>closeGear());
