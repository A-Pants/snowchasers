/* audio.js: all sound and music. makeAudio builds a small synthesizer with the browser's Web Audio API.
   The bottom part starts it when the game starts and feeds it the skier's speed every frame. */
'use strict';
/* ================= audio: everything is synthesized here, so there are no sound files and nothing to license ================= */
/* returns an object A with one function per sound effect (A.pop, A.land, A.trick, ...) plus A.update, A.setVolumes and the music controls */
function makeAudio(ctx){
  const A={ctx:ctx,musicOn:false};
  const SR=ctx.sampleRate;
  /* signal path: effects (sfx) and music (mus) have their own volumes, then a master volume and a compressor that stops loud moments clipping */
  const master=ctx.createGain();master.gain.value=0.9;
  const comp=ctx.createDynamicsCompressor();
  comp.threshold.value=-16;comp.knee.value=20;comp.ratio.value=6;comp.attack.value=0.003;comp.release.value=0.22;
  master.connect(comp);comp.connect(ctx.destination);
  const sfx=ctx.createGain(),mus=ctx.createGain();sfx.connect(master);mus.connect(master);
  /* noise: white for hiss and crunch, pink for wind and thumps */
  const nlen=SR*3,white=ctx.createBuffer(1,nlen,SR),pink=ctx.createBuffer(1,nlen,SR);
  const wd=white.getChannelData(0),pd=pink.getChannelData(0);
  let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
  for(let i=0;i<nlen;i++){
    const w=Math.random()*2-1;wd[i]=w*0.6;
    b0=0.99886*b0+w*0.0555179;b1=0.99332*b1+w*0.0750759;b2=0.969*b2+w*0.153852;b3=0.8665*b3+w*0.3104856;b4=0.55*b4+w*0.5329522;b5=-0.7616*b5-w*0.016898;
    pd[i]=(b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.11;b6=w*0.115926;
  }
  /* a soft echo that sweetens chimes and plucks */
  const echoIn=ctx.createGain(),dl=ctx.createDelay(1),fb=ctx.createGain(),damp=ctx.createBiquadFilter(),wet=ctx.createGain();
  dl.delayTime.value=0.21;fb.gain.value=0.36;damp.type='lowpass';damp.frequency.value=2600;wet.gain.value=0.3;
  echoIn.connect(dl);dl.connect(damp);damp.connect(fb);fb.connect(dl);damp.connect(wet);wet.connect(sfx);
  const echoMus=ctx.createGain();echoMus.connect(echoIn);   /* music plucks reuse the echo but are mixed on the music bus below */

  /* ---- continuous layers ---- */
  const loop=(buf,type,freq,q)=>{const s=ctx.createBufferSource();s.buffer=buf;s.loop=true;const f=ctx.createBiquadFilter();f.type=type;f.frequency.value=freq;f.Q.value=q;const g=ctx.createGain();g.gain.value=0;s.connect(f);f.connect(g);s.start();return {f:f,g:g};};
  const wind=loop(pink,'lowpass',300,0.7),gustN=ctx.createGain();gustN.gain.value=0.8;wind.g.connect(gustN);gustN.connect(sfx);
  const gust=ctx.createOscillator(),gustD=ctx.createGain();gust.frequency.value=0.11;gustD.gain.value=0.2;gust.connect(gustD);gustD.connect(gustN.gain);gust.start();
  const carve=loop(white,'bandpass',2400,0.8);carve.g.connect(sfx);
  const rotor=loop(pink,'bandpass',260,1.2),rotAM=ctx.createGain(),rotOut=ctx.createGain();rotAM.gain.value=0.5;rotOut.gain.value=0;
  rotor.g.gain.value=1;rotor.g.connect(rotAM);rotAM.connect(rotOut);rotOut.connect(sfx);
  const lfo=ctx.createOscillator(),lfoD=ctx.createGain();lfo.type='square';lfo.frequency.value=11;lfoD.gain.value=0.5;lfo.connect(lfoD);lfoD.connect(rotAM.gain);lfo.start();

  /* ---- helpers: times are absolute (seconds on ctx.currentTime) ---- */
  const now=()=>ctx.currentTime;
  function toneAt(t,o){
    const os=ctx.createOscillator();os.type=o.type||'sine';os.frequency.setValueAtTime(o.f,t);
    if(o.slide)os.frequency.exponentialRampToValueAtTime(o.slide,t+o.dur);
    const g=ctx.createGain(),a=o.attack||0.006;
    g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(0.0002,o.peak),t+a);g.gain.exponentialRampToValueAtTime(0.0001,t+a+o.dur);
    os.connect(g);g.connect(o.dest||sfx);if(o.echo)g.connect(echoIn);
    os.start(t);os.stop(t+a+o.dur+0.05);
  }
  function burstAt(t,o){
    const s=ctx.createBufferSource();s.buffer=o.white?white:pink;
    const f=ctx.createBiquadFilter();f.type=o.type||'lowpass';f.frequency.setValueAtTime(o.f,t);
    if(o.f2)f.frequency.exponentialRampToValueAtTime(o.f2,t+o.dur);f.Q.value=o.q||0.7;
    const g=ctx.createGain(),a=o.attack||0.004;
    g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(0.0002,o.peak),t+a);g.gain.exponentialRampToValueAtTime(0.0001,t+a+o.dur);
    s.connect(f);f.connect(g);g.connect(o.dest||sfx);s.start(t,Math.random()*2);s.stop(t+a+o.dur+0.05);
  }
  const tone=(o)=>toneAt(now()+(o.at||0),o);
  const burst=(o)=>burstAt(now()+(o.at||0),o);

  /* ---- sound effects ---- */
  A.pop=function(power){power=power||0.5;burst({dur:0.14,type:'bandpass',f:800,f2:2400,q:0.9,peak:0.12+0.12*power,white:true});tone({f:230,dur:0.15,type:'triangle',peak:0.1+0.06*power,slide:560});};
  A.land=function(impact){const k=Math.max(0.12,Math.min(1.2,(impact||10)/28));tone({f:95,dur:0.24,type:'sine',peak:0.55*k,slide:38});burst({dur:0.22,type:'lowpass',f:1500,f2:300,q:0.7,peak:0.3*k});burst({dur:0.08,type:'bandpass',f:2600,q:1,peak:0.12*k,white:true});};
  A.trick=function(mult){mult=mult||1;const b=523.25*(1+0.06*(mult-1));tone({f:b,dur:0.28,type:'triangle',peak:0.17,echo:true});tone({f:b*1.26,dur:0.28,type:'triangle',peak:0.15,at:0.07,echo:true});tone({f:b*1.5,dur:0.4,type:'triangle',peak:0.15,at:0.14,echo:true});};
  A.stumble=function(){tone({f:190,dur:0.26,type:'sine',peak:0.28,slide:95});burst({dur:0.24,type:'lowpass',f:1000,f2:260,q:0.7,peak:0.2});};
  A.wipeout=function(){tone({f:115,dur:0.55,type:'sine',peak:0.6,slide:42});burst({dur:0.5,type:'lowpass',f:1100,f2:200,q:0.7,peak:0.5});burst({dur:0.32,type:'bandpass',f:520,q:0.9,peak:0.26,at:0.05});};
  A.bump=function(){tone({f:150,dur:0.15,type:'sine',peak:0.34,slide:72});burst({dur:0.13,type:'lowpass',f:1600,f2:500,q:0.7,peak:0.2});};
  A.collect=function(){[880,1108.7,1318.5,1760].forEach((f,i)=>tone({f:f,dur:0.34,type:'triangle',peak:0.14,at:i*0.075,echo:true}));burst({dur:0.4,type:'highpass',f:5000,q:0.7,peak:0.05,white:true,at:0.05});};
  A.gate=function(ok){if(ok){tone({f:988,dur:0.32,type:'sine',peak:0.2,echo:true});tone({f:1318.5,dur:0.32,type:'sine',peak:0.14,at:0.06,echo:true});}else tone({f:170,dur:0.16,type:'square',peak:0.06});};
  A.count=function(n){if(n>0)tone({f:440,dur:0.13,type:'square',peak:0.1});else tone({f:880,dur:0.45,type:'square',peak:0.12});};
  A.finish=function(){[523.25,659.25,783.99,1046.5].forEach((f,i)=>tone({f:f,dur:1.0,type:'triangle',peak:0.14,at:i*0.1,echo:true}));};
  A.unlock=function(){[523.25,659.25,783.99,987.77,1318.5,1567.98].forEach((f,i)=>tone({f:f,dur:0.5,type:'triangle',peak:0.13,at:i*0.09,echo:true}));[392,493.88,587.33].forEach(f=>tone({f:f,dur:1.7,type:'sine',peak:0.07,at:0.5,attack:0.3,echo:true}));burst({dur:0.9,type:'highpass',f:6000,q:0.7,peak:0.022,white:true,at:0.4,attack:0.3});};
  A.click=function(){tone({f:1500,dur:0.035,type:'sine',peak:0.07,attack:0.002});};
  A.tick=function(){tone({f:900,dur:0.06,type:'sine',peak:0.08,slide:520,attack:0.002});};
  A.step=function(){burst({dur:0.08,type:'bandpass',f:1100*(0.85+0.3*Math.random()),q:1.2,peak:1.1*(0.8+0.4*Math.random()),white:true});burst({dur:0.11,type:'lowpass',f:280,q:0.7,peak:0.6});};
  A.sense=function(level){const f=[1318.5,1760,2093][(level||1)-1]||1318.5;tone({f:f,dur:0.7,type:'sine',peak:0.05+0.02*level,echo:true});tone({f:f*1.5,dur:0.6,type:'sine',peak:0.03+0.01*level,at:0.12,echo:true});};   /* you are getting close to something hidden */
  A.whoosh=function(){burst({dur:0.34,type:'bandpass',f:600,f2:2600,q:1.1,peak:1.0,white:true,attack:0.07});};

  /* per-frame state: speed, air, carve (0-1), rotor (0-1) */
  A.update=function(s){
    const t=now(),sp=s.speed||0;
    const lvl=Math.min(1,sp/48)*0.5+(s.air?0.12:0)+0.035;
    wind.g.gain.setTargetAtTime(lvl*0.9,t,0.12);
    wind.f.frequency.setTargetAtTime(220+sp*30+(s.air?250:0),t,0.12);
    carve.g.gain.setTargetAtTime(sp>3?(s.carve||0)*0.11:0,t,0.08);
    carve.f.frequency.setTargetAtTime(1800+sp*40,t,0.1);
    rotOut.gain.setTargetAtTime((s.rotor||0)*0.4,t,0.08);
  };
  A.setVolumes=function(music,effects,muted){
    const t=now();
    mus.gain.setTargetAtTime(muted?0:music,t,0.05);sfx.gain.setTargetAtTime(muted?0:effects,t,0.05);
  };

  /* ---- music: a slow generative score (pads on a four-chord loop with sparse plucks), original and made here ---- */
  const mtof=m=>440*Math.pow(2,(m-69)/12);
  const CHORDS=[[45,57,60,64,67,71],[41,53,57,60,64,67],[36,48,52,55,59,62],[43,55,59,62,66,69]];
  const PENT=[69,72,74,76,79,81,84],BAR=8;
  function padChord(t,notes){
    notes.forEach(m=>{
      [['sine',-5,0.034],['triangle',6,0.017]].forEach(v=>{
        const o=ctx.createOscillator();o.type=v[0];o.frequency.value=mtof(m);o.detune.value=v[1];
        const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=900;lp.Q.value=0.4;
        const g=ctx.createGain();g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(v[2],t+2.4);g.gain.setValueAtTime(v[2],t+BAR-0.2);g.gain.linearRampToValueAtTime(0.0001,t+BAR+2.6);
        o.connect(lp);lp.connect(g);g.connect(mus);o.start(t);o.stop(t+BAR+2.8);
      });
    });
  }
  function pluckAt(t,m){
    const o=ctx.createOscillator();o.type='triangle';o.frequency.value=mtof(m);
    const g=ctx.createGain();g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(0.06,t+0.01);g.gain.exponentialRampToValueAtTime(0.0001,t+1.5);
    o.connect(g);g.connect(mus);g.connect(echoMus);o.start(t);o.stop(t+1.6);
  }
  A.scheduleBar=function(t,bar){
    padChord(t,CHORDS[bar%CHORDS.length]);
    for(let k=0;k<8;k++){if(Math.random()<0.42)pluckAt(t+k*BAR/8+Math.random()*0.06,PENT[(Math.random()*PENT.length)|0]);}
  };
  A.startMusic=function(){
    if(A.musicOn)return;A.musicOn=true;let bar=0,next=now()+0.15;
    const sched=()=>{
      if(!A.musicOn)return;
      while(next<now()+BAR*0.6){A.scheduleBar(next,bar);next+=BAR;bar++;}
      A._mt=setTimeout(sched,400);
    };
    sched();
  };
  A.stopMusic=function(){A.musicOn=false;clearTimeout(A._mt);};
  return A;
}

/* ================= audio ================= */
/* sound and options. Volumes and the ghost setting are saved with the progress. */
let audio=null,muted=false;
const opt={music:0.5,sfx:0.85,ghosts:true,ghostSrc:'mine'};
function applyVolumes(){if(audio)audio.setVolumes(opt.music,opt.sfx,muted);}
/* browsers only allow sound after the player clicks or presses something, so this runs when the game starts */
function initAudio(){
  if(audio)return;
  try{
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    audio=makeAudio(new AC());applyVolumes();audio.startMusic();
  }catch(err){audio=null;}
}
/* sfx('land', 12) plays a sound by name; it quietly does nothing if sound is not ready */
function sfx(name,a,b){if(audio&&audio[name]){try{audio[name](a,b);}catch(err){}}}
/* every frame: set the wind, carve and helicopter sounds from what the skier is doing, and play footsteps in walk mode */
let stepPh=0;
function audioTick(dt){
  if(!audio)return;
  const live=state.mode==='explore'||state.mode==='race'||state.mode==='countdown';
  const sp=Math.hypot(P.vx,P.vz);
  audio.update({speed:live?Math.max(sp,windNow*7):0,   /* Mount Washington's gusts roar even when you stand still */
   air:live&&!P.grounded&&!P.walk,
    carve:(live&&P.grounded&&P.crash<=0&&!P.walk)?Math.min(1,Math.abs(P.steer)*sp/28+P.brake*0.8):0,
    rotor:liftHold>0?Math.min(1,liftHold/0.7):0});
  if(P.walk&&P.grounded&&sp>0.8){const ph=Math.floor(RIDER.ph/Math.PI);if(ph!==stepPh){stepPh=ph;sfx('step');}}
}
/* every button click makes a small click sound */
document.addEventListener('click',e=>{const t=e.target;if(t&&t.closest&&t.closest('button'))sfx('click');});
