/* ui.js: screen pieces shared by the rest of the game: icons, collapsible side panels, toast messages, callouts, time formatting and the minimap. */
'use strict';
/* ================= icons and collapsible panels ================= */
/* SVG drawings for the buttons. ico('map') returns the <svg> markup for one. */
const ICON={"backpack": "<path d=\"M9 5.5V5a3 3 0 0 1 6 0v.5\"/><path d=\"M6.5 8c0-1.4 1-2.5 2.4-2.5h6.2c1.4 0 2.4 1.1 2.4 2.5v11a2 2 0 0 1-2 2H8.5a2 2 0 0 1-2-2z\"/><rect x=\"8.6\" y=\"12.2\" width=\"6.8\" height=\"5\" rx=\"1.4\"/><path d=\"M10.6 14.7h2.8\"/><path d=\"M6.5 11H5M17.5 11H19\"/>", "boot": "<path d=\"M7 3h7v7l5 2.5a1.6 1.6 0 0 1 1 1.5V18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a2 2 0 0 1 2-2z\"/><path d=\"M5 16h15\"/><path d=\"M8.5 6.5H14M8.5 9.5H14\"/>", "skis": "<path d=\"M5 21.5L19.5 3.8\"/><path d=\"M19.5 3.8c1.2-.3 2.2.3 2.6 1.3\"/><path d=\"M19 21.5L4.5 3.8\"/><path d=\"M4.5 3.8C3.3 3.5 2.3 4.1 1.9 5.1\"/><path d=\"M9 15.2l1.8 1.5M15 15.2l-1.8 1.5\"/>", "people": "<circle cx=\"9\" cy=\"8\" r=\"3.2\"/><path d=\"M3 20c.4-3.6 2.8-5.6 6-5.6s5.6 2 6 5.6\"/><circle cx=\"17.2\" cy=\"9\" r=\"2.6\"/><path d=\"M16 14.3c.4-.1.8-.2 1.2-.2 2.4 0 4.2 1.6 4.6 4.6\"/>", "heli": "<path d=\"M2.5 4.5h16\"/><path d=\"M10.5 4.5V8\"/><path d=\"M3.2 13.3A5.3 5.3 0 0 1 8.5 8h5.2a3.8 3.8 0 0 1 3.8 3.8V15H6a2.8 2.8 0 0 1-2.8-1.7z\"/><path d=\"M17.5 11.5H22\"/><path d=\"M21.4 8.8v5.4\"/><path d=\"M5 18.5h12.5\"/><path d=\"M8.5 15v3.5M14.5 15v3.5\"/><path d=\"M7.4 10.3h4v2.6h-5\"/>", "check": "<rect x=\"5\" y=\"3\" width=\"14\" height=\"18\" rx=\"2\"/><path d=\"M8.6 3v18\"/><path d=\"M11.6 9.6l2 2 3.6-4\"/><path d=\"M11.6 15.6h5\"/>", "map": "<path d=\"M3 6.5l6-2.5 6 2.5 6-2.5v13l-6 2.5-6-2.5-6 2.5z\"/><path d=\"M9 4v13.5M15 6.5V20\"/>", "star": "<path d=\"M12 3.2l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 17.1 6.6 20l1.1-6.1L3.2 9.6l6.1-.8z\"/>", "flag": "<path d=\"M6 21V4\"/><path d=\"M6 5h12l-2.5 4 2.5 4H6\"/>", "jacket": "<path d=\"M9 3.5L4 6.5l1.8 4.2 2.4-1v10.8h7.6V9.7l2.4 1L20 6.5l-5-3-1.6 2h-2.8z\"/><path d=\"M12 5.5V20.5\"/>", "pants": "<path d=\"M7 3h10l1.2 18h-4.3L12 11.5 10.1 21H5.8z\"/><path d=\"M7 7h10\"/>", "peak": "<path d=\"M3 20l6.5-11 4 6.5 2.5-3.5L21 20z\"/><path d=\"M9.5 9V4.5l4 1.6-4 1.4\"/>"};
const ico=n=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+(ICON[n]||'')+'</svg>';
ICON.trophy='<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5.5a2 2 0 0 0 0 4H8M16 6h2.5a2 2 0 0 1 0 4H16"/><path d="M12 13v4M9.5 20h5M10 17h4v3h-4z"/>';
ICON.board='<g transform="rotate(35 12 12)"><rect x="9" y="2.5" width="6" height="19" rx="3"/><path d="M9.8 9h4.4M9.8 15h4.4"/></g>';
ICON.sliders='<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>';
/* put an icon into each button's <span> */
[['icTrophy','trophy'],['icMenu','sliders'],['icQuest','check'],['icRace','flag'],['icStyle','star'],['icMap','map'],['icGear','backpack'],['icBoot','boot'],['icSkis','skis'],['icBoard','board'],['icPeople','people'],['icHeli','heli'],['icPeak','peak']].forEach(a=>{$(a[0]).innerHTML=ico(a[1]);});
/* double-click (or double-tap on a phone) any panel to collapse it into an icon; tap the icon to bring it back */
const UI={collapsed:{}};
try{UI.collapsed=JSON.parse(localStorage.getItem('snowchasers.ui')||'{}')||{};}catch(err){UI.collapsed={};}
function saveUI(){try{localStorage.setItem('snowchasers.ui',JSON.stringify(UI.collapsed));}catch(err){}}
/* shrink a side panel into its icon (on=true) or open it again, and remember the choice */
function setCollapsed(id,on){
  sfx('tick');
  UI.collapsed[id]=!!on;$(id).classList.toggle('collapsed',!!on);saveUI();
  if(id==='wrapMini'&&!on)setTimeout(()=>setupMini(),0);
}
/* call fn when el is double-clicked or double-tapped (ignoring buttons and inputs inside it) */
function onDouble(el,fn){
  let lt=0,lx=0,ly=0;
  el.addEventListener('pointerdown',e=>{
    const tg=e.target;if(tg&&tg.closest&&tg.closest('button,input,a,[data-nodbl]'))return;
    const now=performance.now();
    if(now-lt<340&&Math.hypot((e.clientX||0)-lx,(e.clientY||0)-ly)<32){lt=0;fn(e);}else{lt=now;lx=e.clientX||0;ly=e.clientY||0;}
  });
}
/* wire up each side panel: [wrapper, panel, icon button] */
[['wrapJournal','journal','icoJournal'],['wrapRace','raceBoard','icoRace'],['wrapStyle','styleBox','icoStyle'],['wrapMini','mini','icoMini']].forEach(a=>{
  onDouble($(a[1]),()=>setCollapsed(a[0],true));
  $(a[2]).addEventListener('click',()=>setCollapsed(a[0],false));
  if(UI.collapsed[a[0]])$(a[0]).classList.add('collapsed');
  else if(UI.collapsed[a[0]]===undefined&&a[0]!=='wrapMini'&&phoneLayout())$(a[0]).classList.add('collapsed');   /* phones start with the side panels as icons; your own choice is remembered */
});

/* ================= toasts and callouts ================= */
/* toast: a two-line message at the top of the screen that hides itself after ms milliseconds */
let toastTimer=0;
function toast(t1,t2,ms){
  const el=$('toast');el.querySelector('.t1').textContent=t1;el.querySelector('.t2').textContent=t2||'';
  el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),ms||2800);
}
/* callout: a short word or phrase in the middle of the screen, like "Go" or "Wipeout" */
let calloutTimer=0;
function callout(t,ms){const el=$('callout');el.textContent=t;el.classList.add('show');clearTimeout(calloutTimer);calloutTimer=setTimeout(()=>el.classList.remove('show'),ms||1100);}
/* 75.3 seconds -> "1:15.30" */
function fmt(t){const m=Math.floor(t/60),s=t-m*60;return m+':'+(s<10?'0':'')+s.toFixed(2);}
/* minimap: heads-up, downhill is up, +x is left (matches what you see) */
const mini=$('mini'),mctx=mini.getContext('2d');let mdpr=1;
/* size the minimap canvas so it stays sharp on high-resolution screens */
function setupMini(){mdpr=Math.min(window.devicePixelRatio||1,2);const r=mini.getBoundingClientRect();mini.width=Math.max(1,Math.round(r.width*mdpr));mini.height=Math.max(1,Math.round(r.height*mdpr));}
let mAcc=0;
/* about 12 times a second: the Lost Line (once known), jumps, the finish, fragments, other players and you */
function drawMini(dt){
  mAcc+=dt;if(mAcc<0.08)return;mAcc=0;
  const w=mini.width/mdpr,h=mini.height/mdpr;
  mctx.setTransform(mdpr,0,0,mdpr,0,0);mctx.clearRect(0,0,w,h);
  mctx.fillStyle='rgba(9,21,36,0.62)';mctx.fillRect(0,0,w,h);
  const mx=x=>(300-clamp(x,-300,300))/600*w,my=z=>(1-(z+320)/2080)*h;
  mctx.fillStyle='rgba(255,255,255,0.08)';mctx.fillRect(mx(240),0,mx(-240)-mx(240),h);
  if(WATER_Y!==null){mctx.fillStyle='rgba(70,160,215,0.6)';mctx.fillRect(0,0,w,my(1628));}   /* the lake */
  if(TUTORIAL&&(state.count>=4||state.mode==='race'||state.mode==='countdown'||state.unlocked)){
    mctx.strokeStyle='rgba(127,216,255,0.9)';mctx.lineWidth=2;mctx.beginPath();
    for(let z=SUMMIT_Z;z<=FINISH_Z;z+=40){const px=mx(lineX(z)),py=my(z);if(z===SUMMIT_Z)mctx.moveTo(px,py);else mctx.lineTo(px,py);}
    mctx.stroke();
  }
  JUMPS.forEach(j=>{mctx.fillStyle=j.type==='cliff'?'#ff7a3d':'#e8c27a';const px=mx(j.x),py=my(j.z);mctx.fillRect(px-(j.size==='big'||j.type==='cliff'?3:2),py-1,(j.size==='big'||j.type==='cliff'?6:4),2);});
  mctx.strokeStyle='#ff6b57';mctx.lineWidth=2;mctx.beginPath();mctx.moveTo(mx(15),my(FINISH_Z));mctx.lineTo(mx(-15),my(FINISH_Z));mctx.stroke();
  FR.forEach(f=>{
    if(state.mode==='race'||state.mode==='countdown')return;
    const px=mx(f.x),py=my(f.z);mctx.save();mctx.translate(px,py);mctx.rotate(Math.PI/4);
    mctx.fillStyle=f.got?'rgba(255,210,122,0.25)':'#ffd27a';mctx.fillRect(-3.5,-3.5,7,7);mctx.restore();
  });
  net.remotes.forEach(e=>{if(!e.pr||e.pr.mode==='t'||mountainOfSeed(e.pr.sd)!==MOUNTAIN)return;mctx.fillStyle=hexStr(e.pr.look.c[0]);mctx.beginPath();mctx.arc(mx(e.s.x),my(e.s.z),3,0,6.3);mctx.fill();mctx.strokeStyle='rgba(255,255,255,0.85)';mctx.lineWidth=1;mctx.stroke();});
  /* after reading the note: a dashed search circle round the hidden item. It is off-centre on purpose, so you still have to look. */
  if(legendCache&&legendCache.visible&&state.clues[LEGEND.clue]){
    mctx.save();mctx.strokeStyle='rgba(255,190,90,0.95)';mctx.fillStyle='rgba(255,190,90,0.14)';mctx.lineWidth=1.5;mctx.setLineDash([3,3]);
    mctx.beginPath();mctx.ellipse(mx(LEGEND_SPOT.x+18),my(LEGEND_SPOT.z-22),65*w/600,65*h/2080,0,0,6.3);mctx.fill();mctx.stroke();mctx.restore();
  }
  mctx.save();mctx.translate(mx(P.x),my(P.z));mctx.rotate(-P.h);
  mctx.fillStyle='#fff';mctx.beginPath();mctx.moveTo(0,-7);mctx.lineTo(5,5);mctx.lineTo(0,2);mctx.lineTo(-5,5);mctx.closePath();mctx.fill();mctx.restore();
}
