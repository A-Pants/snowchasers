/* core.js: shared basics that every other file uses. Loads first.
   index.html loads the game as plain <script> files in this order:
     core, terrain, quests, audio, world, player, ui, gear, multiplayer, ghosts, tricks, main
   Top-level names (const, let, function) are shared by all of them. Code that runs straight away can only use names from this file
   or an earlier one; code inside a function runs later, after every file has loaded, so it can use anything. */
'use strict';
/* stop right away if three.js (the 3D library, loaded from the internet) is missing, and show the error message instead */
if(typeof THREE==='undefined'){document.getElementById('err').style.display='flex';throw new Error('three.js did not load');}
/* $('id') is short for document.getElementById('id') */
const $=id=>document.getElementById(id);
/* browser storage can be missing or blocked (private mode, embedded frames), so every access is guarded */
const store={
  get(k){try{return localStorage.getItem(k);}catch(err){return null;}},
  set(k,v){try{localStorage.setItem(k,v);return true;}catch(err){return false;}},
  del(k){try{localStorage.removeItem(k);}catch(err){}}
};
/* the course seed shapes the forest and rocks; every seed keeps its own best times, ghosts and leaderboard */
let GAME_SEED=1337;{const sv=parseInt(store.get('snowchasers.seed'),10);if(sv>=1&&sv<=999999)GAME_SEED=sv;}
/* Raise COURSE_VER if a course layout changes, so old times are not compared with new ones. SEED_ID is built from it in mountains.js. */
const COURSE_VER=1;

/* ================= game state ================= */
/* state is what the game is doing right now:
   mode              which screen is active: 'title', 'explore' (free skiing), 'reveal' (map animation), 'countdown', 'race' or 'results'
   count             map fragments found (0 to 4)
   cd, raceT         race countdown and race clock, in seconds
   gates, wipes      gates passed and wipeouts in the current race
   unlocked          true once the Lost Line can be raced any time
   best, runBest     best Lost Line race time and best descent time (null until you have one)
   style, mult       style points and the combo multiplier; comboT is how long the combo stays alive
   gear, have, skis  what is equipped in each slot, which items are unlocked, and the equipped skis
   runOn, runArmed   the descent timer is running / ready to start on your next push; runT is its time
   raceTok, raceMP   the id of a group race, and whether this race is a group race
   hintT             how long the controls hint has been on screen
   clues             clues you have found for hidden items, like clues.boardNote */
const state={mode:'title',count:0,cd:0,raceT:0,gates:0,wipes:0,unlocked:false,skis:'std',best:null,hintT:0,style:0,mult:1,comboT:0,gear:{skis:'std',jacket:'std',pants:'std',boots:'std'},have:{lost:false,apex:false,ridge:false,trail:false,board:false},clues:{},runOn:false,runArmed:true,runT:0,runBest:null,raceTok:null,raceMP:false};
/* the ski accent colour, also used for the glowing Lost Line ski trail */
let accent=0x2f8fe0;

/* ================= phone layout ================= */
/* phone layouts are picked by the same media queries the CSS uses, so JS and CSS always agree */
const PHONE_MQ='(max-width:560px) and (orientation:portrait), (orientation:landscape) and (max-height:480px)';
function phoneLayout(){try{return !!(window.matchMedia&&window.matchMedia(PHONE_MQ).matches);}catch(err){return false;}}
