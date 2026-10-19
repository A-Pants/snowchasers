/* mountains.js: every place you can ski, and which one is loaded right now. Loads second, right after core.js.
   Switching mountains saves the choice and reloads the page (the same way changing the course seed works), so each file below
   only ever has to build one mountain. To add a mountain: give it an entry in MOUNTAINS with playable:true, then add its terrain
   to terrain.js and its scenery to world.js (search for TUTORIAL and MOUNTAIN to see where each mountain differs). */
'use strict';
/* world: which globe the place is on (1 = Earth). lat and lon place the pin on the globe.
   facts are shown on the loading screen, one at a time. stats are the numbers shown above them. */
const MOUNTAINS={
  lostline:{id:'lostline',name:'The Lost Line',region:'Tutorial mountain',world:0,playable:true,tutorial:true},
  tahoe:{id:'tahoe',name:'Lake Tahoe',region:'Sierra Nevada, California and Nevada, USA',world:1,lat:39.09,lon:-120.03,playable:true,
    blurb:'Ski the granite bowls above the largest alpine lake in North America.',
    stats:[['Highest peak','Freel Peak, 3,317 m (10,881 ft)'],['Lake surface','1,897 m (6,225 ft)'],['Deepest point','501 m (1,645 ft)']],
    facts:[
      'Lake Tahoe is the largest alpine lake in North America.',
      'At 501 m (1,645 ft) deep, it is the second-deepest lake in the United States, after Crater Lake in Oregon.',
      'The border between California and Nevada runs through the lake. About two-thirds of it is in California.',
      'The lake holds enough water to cover the whole of California about 36 cm (14 in) deep.',
      '63 streams flow into the lake, but only one river flows out: the Truckee River.',
      'The main lake is so deep that it never freezes over, even in the coldest winters.',
      'Fannette Island, in Emerald Bay, is the only island in the lake.',
      'The 1960 Winter Olympics were held at Squaw Valley, now called Palisades Tahoe, just northwest of the lake.',
      'The mountains around the lake are mostly granite: rock that cooled slowly from magma deep underground, then was pushed up and carved by glaciers.',
      'Mark Twain camped on the shore in 1861 and later called the lake "the fairest picture the whole earth affords."'
    ]},
  washington:{id:'washington',name:'Mount Washington',region:'White Mountains, New Hampshire, USA',world:1,lat:44.27,lon:-71.30,playable:false,soon:true},
  yellowstone:{id:'yellowstone',name:'Yellowstone',region:'Rocky Mountains, Wyoming, Montana and Idaho, USA',world:1,lat:44.43,lon:-110.59,playable:false,soon:true}
};
/* famous peaks shown on the globe as locked pins, ready to become playable mountains later */
const GLOBE_LOCKED=[
  ['Mount Everest',27.99,86.93],['Matterhorn',45.98,7.66],['Mont Blanc',45.83,6.86],['Kilimanjaro',-3.07,37.35],
  ['Denali',63.07,-151.0],['Mount Fuji',35.36,138.73],['Aconcagua',-32.65,-70.01],['Whistler',50.06,-122.96],
  ['Aoraki / Mount Cook',-43.59,170.14],['Mount Elbrus',43.35,42.44]
];
/* the mountain loaded on this page. Anything unknown or not playable yet falls back to the tutorial. */
const MOUNTAIN=(function(){const id=store.get('snowchasers.mountain');return(MOUNTAINS[id]&&MOUNTAINS[id].playable)?id:'lostline';})();
const MTN=MOUNTAINS[MOUNTAIN];
const TUTORIAL=MOUNTAIN==='lostline';
/* SEED_ID tags saved times, ghosts and leaderboards. The tutorial keeps its original ids so old saves still match;
   other mountains are prefixed with their id, like "tahoe:1337.1". */
const SEED_ID=(TUTORIAL?'':MOUNTAIN+':')+GAME_SEED+'.'+COURSE_VER;
/* the mountain part of a SEED_ID, so other riders on a different mountain are not drawn on this one */
const mountainOfSeed=sd=>{const i=String(sd||'').indexOf(':');return i>0?sd.slice(0,i):'lostline';};
/* switch mountains: remember the choice and reload. The title screen then shows the new place's card while you get ready. */
function travelTo(id){
  if(!MOUNTAINS[id]||!MOUNTAINS[id].playable)return;
  store.set('snowchasers.mountain',id);
  try{window.location.reload();}catch(err){}
}
