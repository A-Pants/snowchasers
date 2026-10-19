/* world.js: everything you see in 3D except the skiers. Sets up three.js (renderer, scene, camera, lights), then builds the snow surface,
   trees and rocks, the landmark buildings, jumps, fragment beacons, race gates, particles and falling snow. Ends with the follow camera. */
'use strict';
/* ================= renderer ================= */
/* the renderer draws into <canvas id="c">, which fills the page behind the HUD */
const canvas=$('c');
let renderer;
try{
  renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
}catch(e){$('err').style.display='flex';throw e;}
const dprCap=()=>phoneLayout()?1.6:2;
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,dprCap()));
renderer.setClearColor(0x000000,0);
/* the scene holds every 3D object; fog fades far-away things into the sky colour */
const scene=new THREE.Scene();
/* Tahoe sees much further, so the lake and the mountains around it show through the haze */
scene.fog=TUTORIAL?new THREE.Fog(0xcfe0ef,90,760):new THREE.Fog(0xcfe0ef,600,38000);
const camera=new THREE.PerspectiveCamera(62,1,TUTORIAL?0.5:1,TUTORIAL?1800:32000);
/* keep the 3D view the same size as the window */
function resize(){
  const w=window.innerWidth,h=window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,dprCap()));
  renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
  setupMini();
}
window.addEventListener('resize',resize);
/* rotating a phone, and iOS showing or hiding its toolbar, change the visible size without always firing a normal resize */
window.addEventListener('orientationchange',()=>{setTimeout(resize,250);setTimeout(resize,800);});
if(window.visualViewport)window.visualViewport.addEventListener('resize',resize);

/* soft light from the sky, plus a sun that follows the skier (see updateCamera) */
const hemi=new THREE.HemisphereLight(0xe3eeff,0x8396b6,0.72);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xfff1dc,1.1);sun.position.set(160,260,-110);scene.add(sun);scene.add(sun.target);

/* ================= terrain mesh ================= */
/* build the snow surface as one big mesh of triangles from H(x,z): small squares in the middle where you ski, bigger ones at the edges.
   Each corner gets a colour (bare rock on steep faces and cliff lips, blue shading in hollows), and a small shader adds contour lines. */
/* bare rock colour: blue-grey in the tutorial, pale Sierra granite at Tahoe */
const RK=TUTORIAL?[0.45,0.47,0.52]:[0.62,0.6,0.56];
(function buildTerrain(){
  const xs=[],zs=[];
  for(let x=-480;x<-240;x+=9)xs.push(x);
  for(let x=-240;x<240;x+=3)xs.push(x);
  for(let x=240;x<=480;x+=9)xs.push(x);
  for(let z=-320;z<=1760;z+=4)zs.push(z);
  const nx=xs.length,nz=zs.length;
  const pos=new Float32Array(nx*nz*3),col=new Float32Array(nx*nz*3);
  const g={x:0,z:0};
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
    const x=xs[i],z=zs[j],k=(j*nx+i)*3;
    const y=H(x,z);pos[k]=x;pos[k+1]=y;pos[k+2]=z;
    grad(x,z,g);const sl=Math.hypot(g.x,g.z);
    let rock=smooth(0.62,1.05,sl)*0.9+smooth(260,420,Math.abs(x))*0.25;
    /* cliff jumps: the drop face and lip are bare rock so the edge is visible from the approach */
    for(let q=0;q<JUMPS.length;q++){
      const j=JUMPS[q];if(j.type!=='cliff')continue;
      const dz=z-j.z;if(dz<-3||dz>j.drop+9)continue;
      const ax=Math.abs(x-j.x);if(ax>j.w*1.5)continue;
      const lat=1-smooth(j.w*0.6,j.w*1.5,ax);
      rock=Math.max(rock,lat*smooth(-3,0.5,dz)*(1-smooth(j.drop+3,j.drop+9,dz))*0.95);
    }
    /* curvature: hollows and drop-offs go blue-grey, crests stay bright, so a change of level is visible */
    const lap=(H(x+6,z)+H(x-6,z)+H(x,z+6)+H(x,z-6)-4*y)/36;
    const ao=clamp(lap*5,-0.5,0.5),k2=ao>0?ao:ao*0.35;
    const tone=0.965+0.035*Math.sin(x*0.31+z*0.17)*Math.sin(z*0.23-x*0.11);
    const shade=1-smooth(0.1,0.5,sl)*0.05;
    const sr=Math.min(1,0.93*tone*shade*(1-0.24*k2)),sg=Math.min(1,0.955*tone*shade*(1-0.17*k2)),sb=Math.min(1,0.985*tone*(1-0.06*k2));
    col[k]=lerp(sr,RK[0],rock);col[k+1]=lerp(sg,RK[1],rock);col[k+2]=lerp(sb,RK[2],rock);
    if(WATER_Y!==null&&y<WATER_Y+1.6){col[k]=0.5;col[k+1]=0.47;col[k+2]=0.41;}   /* wet sand at the lake's edge */
  }
  const idx=new Uint32Array((nx-1)*(nz-1)*6);let n=0;
  for(let j=0;j<nz-1;j++)for(let i=0;i<nx-1;i++){
    const a=j*nx+i,b=a+1,c=a+nx,d=c+1;
    idx[n++]=a;idx[n++]=c;idx[n++]=b;idx[n++]=b;idx[n++]=c;idx[n++]=d;
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  geo.setAttribute('color',new THREE.BufferAttribute(col,3));
  geo.setIndex(new THREE.BufferAttribute(idx,1));
  geo.computeVertexNormals();
  const tmat=new THREE.MeshLambertMaterial({vertexColors:true});
  tmat.onBeforeCompile=sh=>{
    sh.vertexShader=sh.vertexShader.replace('void main() {','varying vec3 vWP;\nvarying vec3 vWN;\nvoid main() {\n  vWP=position;vWN=normal;');
    sh.fragmentShader=sh.fragmentShader.replace('void main() {','varying vec3 vWP;\nvarying vec3 vWN;\nvoid main() {')
      .replace('#include <color_fragment>',`#include <color_fragment>
      float sl=1.0-clamp(normalize(vWN).y,0.0,1.0);
      float far=1.0-smoothstep(140.0,560.0,fogDepth);
      diffuseColor.rgb*=mix(vec3(1.0),vec3(0.78,0.85,0.96),smoothstep(0.02,0.30,sl));
      float band=sin(vWP.y*0.1047);
      diffuseColor.rgb*=vec3(1.0+0.05*band,1.0+0.018*band,1.0-0.06*band);
      float cy=vWP.y/4.0;
      float w=0.03+fogDepth*0.0011;
      float d1=min(fract(cy),1.0-fract(cy));
      float cm=vWP.y/20.0;
      float w2=0.012+fogDepth*0.00045;
      float d2=min(fract(cm),1.0-fract(cm));
      float l1=(1.0-smoothstep(0.0,w,d1))*0.20;
      float l2=(1.0-smoothstep(0.0,w2,d2))*0.50;
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.36,0.52,0.76),max(l1,l2)*far);
      `);
  };
  tmat.customProgramCacheKey=()=>'terrainContrast';
  const mesh=new THREE.Mesh(geo,tmat);
  mesh.frustumCulled=false;scene.add(mesh);
})();

/* ================= helpers ================= */
/* M(colour) makes a plain material. bx(w,h,d, material, x,y,z, parent) makes a box and adds it to parent (or the scene). */
const M=(c,e)=>new THREE.MeshLambertMaterial({color:c,emissive:e||0x000000});
function bx(w,h,d,mat,x,y,z,parent){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);(parent||scene).add(m);return m;}

/* ================= trees and rocks ================= */
/* tree and rock positions come from the seeded rng, so a seed always gives the same forest. tgrid stops trees growing into each other. */
const trees=[],tgrid=new Map(),rocks=[];
function tCell(x,z){return Math.floor(x/6)+','+Math.floor(z/6);}
function treeFree(x,z,d){
  const cx=Math.floor(x/6),cz=Math.floor(z/6);
  for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){
    const a=tgrid.get((cx+i)+','+(cz+j));if(!a)continue;
    for(let n=0;n<a.length;n++){if(Math.hypot(x-a[n][0],z-a[n][1])<d)return false;}
  }
  return true;
}
/* add one tree with a random size, lean and turn, and make it an obstacle */
function addTree(x,z,s){
  const t={x:x,z:z,s:s,sx:s*(0.84+rng()*0.3),sy:s*(0.88+rng()*0.45),r:rng()*6.28,lx:(rng()-0.5)*0.07,lz:(rng()-0.5)*0.07,gy:H(x,z)};
  if(!TUTORIAL)t.sy*=1.3;   /* Tahoe's Jeffrey pines grow tall */
  trees.push(t);
  const k=tCell(x,z);let a=tgrid.get(k);if(!a){a=[];tgrid.set(k,a);}a.push([x,z]);
  addObstacle(x,z,0.78*t.sx);
}
/* SH is the shelter. inShelterGap leaves an opening in its ring of trees so you can ski in. */
const SH={x:PADS[1].x,z:PADS[1].z};
function inShelterGap(x,z){
  const dx=x-SH.x,dz=z-SH.z,d=Math.hypot(dx,dz);
  return d<48&&Math.abs(Math.atan2(dz,dx))<0.42;
}
/* places that must stay clear of trees: the Lost Line, the start, the finish, jumps and landmarks */
function blocked(x,z){
  if(Math.abs(x-lineX(z))<13)return true;
  if(z>-20&&z<110&&Math.abs(x)<22)return true;
  if(z>1560)return true;
  for(let i=0;i<JUMPS.length;i++){const k=JUMPS[i];if(Math.abs(x-k.x)<k.w+16&&z>k.z-k.len-8&&z<k.z+75)return true;}
  for(let i=0;i<PADS.length;i++){const p=PADS[i];if(Math.hypot(x-p.x,z-p.z)<(i===1?17:(i===3?9:p.r+9)))return true;}   /* pines grow close round the board cache */
  if(TUTORIAL&&inShelterGap(x,z))return true;
  return false;
}
/* a rough bell-curve random number, used to bunch trees toward the middle of a grove */
const gauss=()=>(rng()+rng()+rng()-1.5)*1.15;
(function placeVegetation(){
  /* 1. grove centers: blue-noise spaced, denser where the forest noise is high, none above the treeline */
  const seeds=[];let tries=0;
  while(seeds.length<250&&tries<40000){
    tries++;
    const x=(rng()*2-1)*(TUTORIAL?290:440),z=30+rng()*1540;
    const forest=0.5+0.5*Math.sin(x*0.017+z*0.011+2.1)*Math.sin(z*0.0085-x*0.013+0.5);
    const p=smooth(70,430,z)*(0.1+0.9*Math.pow(Math.max(0,forest),1.1));
    if(rng()>p*1.15)continue;
    if(blocked(x,z))continue;
    let ok=true;for(let i=0;i<seeds.length;i++){if(Math.hypot(x-seeds[i].x,z-seeds[i].z)<20){ok=false;break;}}
    if(!ok)continue;
    seeds.push({x:x,z:z,sz:0.5+rng()*0.5});
  }
  /* 2. each grove: tight clump with a few big old trees in the middle and smaller ones at the edge */
  seeds.forEach(sd=>{
    const n=6+Math.floor(rng()*11),spread=5+sd.sz*10;
    for(let i=0;i<n;i++){
      const a=rng()*6.283,d=Math.abs(gauss())*spread;
      const x=sd.x+Math.cos(a)*d,z=sd.z+Math.sin(a)*d;
      if(blocked(x,z))continue;
      grad(x,z,_g);if(Math.hypot(_g.x,_g.z)>0.75)continue;
      if(!treeFree(x,z,2.6))continue;
      const alt=0.62+0.38*smooth(110,520,z);
      const centre=1.15-0.4*Math.min(1,d/spread);
      addTree(x,z,(0.75+rng()*0.7)*alt*centre);
    }
  });
  /* 3. a thin scatter of lone trees between groves */
  for(let i=0;i<1300&&trees.length<3400;i++){
    const x=(rng()*2-1)*(TUTORIAL?295:450),z=60+rng()*1500;
    if(rng()>smooth(120,500,z)*0.45)continue;
    if(blocked(x,z))continue;
    grad(x,z,_g);if(Math.hypot(_g.x,_g.z)>0.7)continue;
    if(!treeFree(x,z,5))continue;
    addTree(x,z,(0.6+rng()*0.6)*(0.62+0.38*smooth(110,520,z)));
  }
  /* 4. dense ring of trees around the hidden shelter */
  for(let i=0;i<(TUTORIAL?230:0);i++){
    const a=rng()*6.283,d=19+rng()*28;
    const x=SH.x+Math.cos(a)*d,z=SH.z+Math.sin(a)*d;
    if(Math.abs(a>3.1416?a-6.283:a)<0.46)continue;
    if(Math.abs(x-lineX(z))<13)continue;
    if(!treeFree(x,z,2.4))continue;
    addTree(x,z,0.9+rng()*0.85);
  }
  /* rocks */
  let rt=0;
  while(rocks.length<(TUTORIAL?340:520)&&rt<6000){
    rt++;
    const x=(rng()*2-1)*300,z=-250+rng()*1800;
    if(Math.abs(x-lineX(z))<10)continue;
    if(z>-20&&z<110&&Math.abs(x)<22)continue;
    if(z>1560)continue;
    let bad=false;
    for(let i=0;i<JUMPS.length;i++){const k=JUMPS[i];if(Math.abs(x-k.x)<k.w+14&&z>k.z-k.len-6&&z<k.z+70)bad=true;}
    for(let i=0;i<PADS.length;i++){if(Math.hypot(x-PADS[i].x,z-PADS[i].z)<PADS[i].r+10)bad=true;}
    if(bad)continue;
    const s=(1+rng()*2.4)*(TUTORIAL?1:1.3);rocks.push({x:x,z:z,s:s,r:rng()*6.28});addObstacle(x,z,s*0.85);
  }
})();

/* tree geometry: five drooping tiers, snow on the upper surfaces, merged into one mesh */
function makeFoliageGeo(){
  const tiers=[[1.5,2.4,1.75],[2.7,2.2,1.5],[3.8,2.0,1.2],[4.75,1.7,0.92],[5.55,1.5,0.62]];
  const Pp=[],Nn=[],Cc=[],Ii=[];let off=0;
  tiers.forEach((t,ti)=>{
    const g=new THREE.ConeGeometry(t[2],t[1],10,1,true);g.translate(0,t[0]+t[1]/2,0);
    const p=g.attributes.position,n=g.attributes.normal,ix=g.index.array;
    for(let i=0;i<p.count;i++){
      let x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      const u=(y-t[0])/t[1],a=Math.atan2(x,z);
      const jit=1+(0.09*Math.sin(a*3+ti*1.7)+0.05*Math.sin(a*7+ti))*(1-u);
      x*=jit;z*=jit;y-=0.14*(1-u)*(0.5+0.5*Math.sin(a*5+ti));
      Pp.push(x,y,z);Nn.push(n.getX(i),n.getY(i),n.getZ(i));
      const sn=smooth(0.2,0.8,u);
      Cc.push(lerp(0.12+0.015*ti,0.95,sn),lerp(0.30+0.025*ti,0.97,sn),lerp(0.22,1.0,sn));
    }
    for(let i=0;i<ix.length;i++)Ii.push(ix[i]+off);
    off+=p.count;
  });
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(Pp,3));
  geo.setAttribute('normal',new THREE.Float32BufferAttribute(Nn,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(Cc,3));
  geo.setIndex(Ii);
  return geo;
}
/* screen-door transparency: each tree has a fade value, fragments are dithered away so no sorting is needed */
function applyFade(mat,key){
  mat.onBeforeCompile=sh=>{
    sh.vertexShader=sh.vertexShader.replace('void main() {','attribute float fade;\nvarying float vFade;\nvoid main() {\n  vFade=fade;');
    sh.fragmentShader=sh.fragmentShader.replace('void main() {','varying float vFade;\nvoid main() {\n  float ign=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(0.06711056,0.00583715))));\n  if(ign>vFade) discard;');
  };
  mat.customProgramCacheKey=()=>key;
}
/* draw all trunks, all crowns and all rocks as one instanced mesh each: thousands of copies in one draw call keeps the game fast */
let treeFadeAttr=null;const treeFade=new Float32Array(trees.length).fill(1);
(function buildInstances(){
  const dummy=new THREE.Object3D(),col=new THREE.Color();
  function inst(geo,mat,list,place){
    const m=new THREE.InstancedMesh(geo,mat,list.length);
    for(let i=0;i<list.length;i++){place(list[i],dummy,i,m);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);}
    m.instanceMatrix.needsUpdate=true;m.frustumCulled=false;scene.add(m);return m;
  }
  const trunkGeo=new THREE.CylinderGeometry(0.17,0.3,2.7,6).translate(0,1.35,0);
  const foliageGeo=makeFoliageGeo();
  treeFadeAttr=new THREE.InstancedBufferAttribute(treeFade,1);treeFadeAttr.setUsage(THREE.DynamicDrawUsage);
  trunkGeo.setAttribute('fade',treeFadeAttr);foliageGeo.setAttribute('fade',treeFadeAttr);
  const trunkMat=M(TUTORIAL?0x4d3626:0x7a4a30),foliageMat=new THREE.MeshLambertMaterial({vertexColors:true});
  applyFade(trunkMat,'treeTrunk');applyFade(foliageMat,'treeFoliage');
  const pl=(t,d)=>{d.position.set(t.x,t.gy-0.15,t.z);d.scale.set(t.sx,t.sy,t.sx);d.rotation.set(t.lx,t.r,t.lz);};
  inst(trunkGeo,trunkMat,trees,pl);
  inst(foliageGeo,foliageMat,trees,(t,d,i,m)=>{pl(t,d);col.setRGB(0.88+rng()*0.2,0.92+rng()*0.14,0.88+rng()*0.16);m.setColorAt(i,col);}).instanceColor.needsUpdate=true;
  const rg=new THREE.DodecahedronGeometry(1,0);
  inst(rg,M(TUTORIAL?0x7b8290:0xa29d93),rocks,(r,d)=>{d.position.set(r.x,H(r.x,r.z)+r.s*0.15,r.z);d.scale.set(r.s,r.s*0.72,r.s*0.9);d.rotation.set(0,r.r,0);});
})();
/* fade out any tree standing between the camera and the skier (and any tree the camera is inside of) */
function updateTreeFade(dt){
  if(!treeFadeAttr)return;
  const cx=camera.position.x,cy=camera.position.y,cz=camera.position.z;
  const ty=P.y+1.3,dx=P.x-cx,dz=P.z-cz,L2=dx*dx+dz*dz+1e-6;
  const k=Math.min(1,dt*11);let dirty=false;
  for(let i=0;i<trees.length;i++){
    const t=trees[i];let tgt=1;
    const rx=t.x-cx,rz=t.z-cz;
    if(rx*rx+rz*rz<2400){
      const u=clamp((rx*dx+rz*dz)/L2,0,1.04);
      const qx=cx+dx*u-t.x,qz=cz+dz*u-t.z,dh=Math.sqrt(qx*qx+qz*qz);
      const R=1.65*t.sx+0.35,segY=cy+(ty-cy)*u;
      if(segY<t.gy+7.3*t.sy){tgt=1-0.7*(1-smooth(R*0.5,R+2.3,dh));}
    }
    const cur=treeFade[i],nv=cur+(tgt-cur)*k;
    if(Math.abs(nv-cur)>0.003){treeFade[i]=nv;dirty=true;}
  }
  if(dirty)treeFadeAttr.needsUpdate=true;
}

/* ================= landmark buildings ================= */
/* the landmarks. Each builds a group of boxes and shapes on its pad and adds obstacles so you cannot ski through it.
   The Outpost (fragment I) is a weather station; outpostSpin is its wind gauge, which main.js spins. */
let outpostSpin=null;
(function buildOutpost(){
  if(!TUTORIAL)return;
  const p=PADS[0],g=new THREE.Group();g.position.set(p.x,p.h,p.z);scene.add(g);
  bx(8,4.2,6,M(0xc9573f),0,2.1,0,g);
  bx(8.8,0.5,6.8,M(0xf4f8fb),0,4.45,0,g);
  bx(1.4,2.4,0.2,M(0x2a2018),-1.6,1.2,3.05,g);
  bx(1.8,1.2,0.2,M(0xffe3a0,0xffc866),2.2,2.4,3.05,g);
  bx(3,0.2,2,M(0xdfe6ec),-1.6,0.1,4.2,g);
  const mast=new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.2,15,8),M(0xe9eef2));mast.position.set(2.8,7.5,-1.2);g.add(mast);
  for(let i=0;i<3;i++){const b=bx(0.4,0.4,0.4,M(0xc9573f),2.8,2.5+i*4.6,-1.2,g);b.scale.set(1.5,1.2,1.5);}
  const an=new THREE.Group();an.position.set(2.8,15.3,-1.2);g.add(an);
  for(let i=0;i<3;i++){
    const arm=bx(1.5,0.07,0.07,M(0xdde5ec),0,0,0,an);arm.rotation.y=i*Math.PI*2/3;arm.position.set(Math.cos(i*Math.PI*2/3)*0.75,0,-Math.sin(i*Math.PI*2/3)*0.75);
    const cup=new THREE.Mesh(new THREE.SphereGeometry(0.22,8,6),M(0xff7a59));cup.position.set(Math.cos(i*Math.PI*2/3)*1.5,0,-Math.sin(i*Math.PI*2/3)*1.5);an.add(cup);
  }
  outpostSpin=an;
  const dish=new THREE.Mesh(new THREE.SphereGeometry(1.3,14,8,0,Math.PI*2,0,Math.PI/2),M(0xf0f4f7));dish.position.set(-3,5.4,1);dish.rotation.x=-1.0;dish.scale.set(1,0.6,1);g.add(dish);
  bx(0.2,2,0.2,M(0x9aa5b0),-3,4.6,1,g);
  for(let i=0;i<3;i++){const br=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,1.1,10),M(i===1?0x3d6fb3:0xb5482f));br.position.set(-4.4+i*0.9,0.55,-2.6);g.add(br);}
  addObstacle(p.x,p.z,5.2);
})();
/* The Shelter (fragment III): a cabin with a warm lamp, hidden in a ring of trees */
(function buildShelter(){
  if(!TUTORIAL)return;
  const g=new THREE.Group();g.position.set(SH.x,PADS[1].h,SH.z);g.rotation.y=Math.PI/2;scene.add(g);
  bx(6,3,5,M(0x7b5234),0,1.5,0,g);
  const roof=new THREE.Mesh(new THREE.ConeGeometry(4.9,2.2,4),M(0xf1f6fa));roof.rotation.y=Math.PI/4;roof.scale.set(1.12,1,0.98);roof.position.set(0,4.1,0);g.add(roof);
  bx(1.1,2.1,0.2,M(0x2b1c12),0,1.05,2.55,g);
  bx(1.1,0.9,0.2,M(0xffe3a0,0xffc866),-1.9,1.8,2.55,g);
  bx(0.8,2.2,0.8,M(0x5d625f),1.8,4.6,-1,g);
  for(let i=0;i<4;i++)bx(0.35,0.35,1.8,M(0x5f3f28),-2.3+i*0.1,0.3+i*0.35,-3.1,g);
  const lamp=new THREE.PointLight(0xffc77a,1.2,26);lamp.position.set(0,2.6,3.6);g.add(lamp);
  addObstacle(SH.x,SH.z,4.2);
})();
/* The Unknown (fragment IV): a dark cave with glowing ice */
(function buildCave(){
  if(!TUTORIAL)return;
  const p=PADS[2],g=new THREE.Group();g.position.set(p.x,p.h,p.z);scene.add(g);
  const rock=M(0x636b78),dark=M(0x161f2b);
  bx(3,6,5,rock,0,3,-3.9,g);bx(3,6,5,rock,0,3,3.9,g);
  bx(3.6,2.4,12,rock,0,6.9,0,g);
  bx(6,9,13,dark,4.6,4.5,0,g);
  const ice=new THREE.MeshLambertMaterial({color:0x9fe3ff,emissive:0x3fb4ff,emissiveIntensity:0.9});
  for(let i=0;i<9;i++){
    const up=i%2===0;
    const c=new THREE.Mesh(new THREE.ConeGeometry(0.35+rng()*0.3,1.4+rng()*1.8,5),ice);
    c.position.set(-0.8+rng()*2.2,up?0.8:5.6,-3.4+rng()*6.8);if(!up)c.rotation.z=Math.PI;g.add(c);
  }
  for(let i=0;i<5;i++){const r=new THREE.Mesh(new THREE.DodecahedronGeometry(1.4+rng(),0),rock);r.position.set(-1+rng()*3,0.4,(i-2)*5.5);g.add(r);}
  const glow=new THREE.PointLight(0x62c8ff,1.6,34);glow.position.set(-1.5,3,0);g.add(glow);
  addObstacle(p.x,p.z-3.9,2.3);addObstacle(p.x,p.z+3.9,2.3);
})();
/* the lift station at the start, the base lodge and the finish arch */
(function buildStartAndLodge(){
  if(!TUTORIAL)return;
  /* lift top station near the start */
  const g=new THREE.Group();g.position.set(-26,H(-26,-8),-8);scene.add(g);
  bx(7,4,5,M(0x56606b),0,2,0,g);bx(7.8,0.5,5.8,M(0xf4f8fb),0,4.25,0,g);
  bx(0.4,9,0.4,M(0x3b434c),-3.3,4.5,2.8,g);bx(0.4,9,0.4,M(0x3b434c),3.3,4.5,2.8,g);bx(7.4,0.35,0.35,M(0x3b434c),0,8.6,2.8,g);
  addObstacle(-26,-8,4.2);
  /* base lodge */
  const lx=74,lz=1655,L=new THREE.Group();L.position.set(lx,H(lx,lz),lz);scene.add(L);
  bx(15,5.5,9,M(0x6e4a31),0,2.75,0,L);bx(16.4,0.7,10.4,M(0xf4f8fb),0,6,0,L);
  bx(2,3,0.2,M(0x2b1c12),0,1.5,4.55,L);
  for(let i=0;i<3;i++)bx(2,1.4,0.2,M(0xffe3a0,0xffc866),-4.5+i*4.5,3.2,4.55,L);
  bx(1.2,3,1.2,M(0x5d625f),4,7.2,-2,L);
  addObstacle(lx,lz,8.4);
  /* finish arch */
  const fz=FINISH_Z,fx=0,fa=new THREE.Group();scene.add(fa);
  [-13,13].forEach(x=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.4,10,8),M(0xe24a3b));m.position.set(fx+x,H(fx+x,fz)+5,fz);fa.add(m);});
  const cv=document.createElement('canvas');cv.width=512;cv.height=128;const cx=cv.getContext('2d');
  cx.fillStyle='#0d2238';cx.fillRect(0,0,512,128);cx.strokeStyle='#ff6b57';cx.lineWidth=8;cx.strokeRect(6,6,500,116);
  cx.fillStyle='#ffffff';cx.font='700 76px "Barlow Condensed",Arial Narrow,Arial';cx.textAlign='center';cx.textBaseline='middle';cx.fillText('FINISH',256,68);
  const tex=new THREE.CanvasTexture(cv);
  const ban=new THREE.Mesh(new THREE.PlaneGeometry(26,6.5),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide,fog:false}));
  ban.position.set(fx,H(fx,fz)+10.5,fz);fa.add(ban);
  addObstacle(fx-13,fz,0.7);addObstacle(fx+13,fz,0.7);
})();

/* ================= Lake Tahoe scenery ================= */
/* a sign drawn on a canvas: white text on dark blue with a coloured border */
function signTex(text,edge){
  const cv=document.createElement('canvas');cv.width=512;cv.height=128;const cx=cv.getContext('2d');
  cx.fillStyle='#0d2238';cx.fillRect(0,0,512,128);cx.strokeStyle=edge;cx.lineWidth=8;cx.strokeRect(6,6,500,116);
  cx.fillStyle='#ffffff';cx.font='700 64px "Barlow Condensed",Arial Narrow,Arial';cx.textAlign='center';cx.textBaseline='middle';cx.fillText(text,256,68);
  return new THREE.CanvasTexture(cv);
}
/* a sheet of triangles over the grid xs by zs; f(x,z,o) sets the height o.y and the colour o.r,o.g,o.b at each corner */
function gridMesh(xs,zs,f,mat){
  const nx=xs.length,nz=zs.length,pos=new Float32Array(nx*nz*3),col=new Float32Array(nx*nz*3),o={y:0,r:1,g:1,b:1};
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
    const k=(j*nx+i)*3;f(xs[i],zs[j],o);
    pos[k]=xs[i];pos[k+1]=o.y;pos[k+2]=zs[j];col[k]=o.r;col[k+1]=o.g;col[k+2]=o.b;
  }
  const idx=[];for(let j=0;j<nz-1;j++)for(let i=0;i<nx-1;i++){const a=j*nx+i,b=a+1,c=a+nx,d=c+1;idx.push(a,c,b,b,c,d);}
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('color',new THREE.BufferAttribute(col,3));
  geo.setIndex(idx);geo.computeVertexNormals();
  const m=new THREE.Mesh(geo,mat);m.frustumCulled=false;scene.add(m);return m;
}
const steps=(a,b,s)=>{const out=[];for(let v=a;v<b;v+=s)out.push(v);return out;};
/* the hidden board cache at Tahoe. main.js checks how close you are to BOARD_SPOT, and hides boardCache once the board is found. */
let boardCache=null,boardRag=null,boardGlint=null;
const BOARD_SPOT=TUTORIAL?null:{x:PADS[3].x,z:PADS[3].z};
/* the notice board by the summit station, where the first clue is pinned */
const NOTICE_SPOT=TUTORIAL?null:{x:7,z:-172};
/* a soft round glow drawn on a canvas, used for the glint above the cache */
function glowTex(){
  const cv=document.createElement('canvas');cv.width=cv.height=64;const c=cv.getContext('2d');
  const g=c.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,240,200,1)');g.addColorStop(0.25,'rgba(255,200,90,.8)');g.addColorStop(1,'rgba(255,170,60,0)');
  c.fillStyle=g;c.fillRect(0,0,64,64);return new THREE.CanvasTexture(cv);
}
/* ================= the Lake Tahoe basin =================
   You ski down the east shore (like at Heavenly) looking west across the water. The lake runs far off to the right (north),
   the south shore is nearer on the left, and across the water are the granite peaks of Desolation Wilderness, Mount Tallac,
   and Emerald Bay with Fannette Island. Distances are squeezed to about half of the real ones, so it all fits in view. */
/* how far a point is from the middle of the lake: under 1 is water, 1 is the shore, above 1 is land */
function lakeS(x,z){
  const dx=(x+3000)/10000,dz=(z-5050)/3400;
  return Math.pow(Math.abs(dx),3)+Math.pow(Math.abs(dz),2.4)+0.05*Math.sin(x*0.0011+1)*Math.sin(z*0.0013)+0.03*Math.sin(x*0.0031+z*0.0023);   /* the sines wiggle the shore into coves and points */
}
/* Emerald Bay: a long narrow inlet off the far-left shore with a tight mouth. 1 inside the bay, 0 outside. */
function bayIn(x,z){
  const ax=5600,az=7000,vx=2400,vz=350,t=clamp(((x-ax)*vx+(z-az)*vz)/(vx*vx+vz*vz),0,1);
  const d=Math.hypot(ax+vx*t-x,az+vz*t-z),r=lerp(170,420,smooth(0,0.35,t))*(1-0.3*smooth(0.85,1,t));
  return 1-smooth(r*0.75,r,d);
}
/* ridged noise from 0 to 1: sharp crests where the sine waves cross zero, like eroded granite ridges */
const RIDGE_DIR=[[1,0],[0.8,0.6],[-0.6,0.8],[0.28,-0.96],[-0.96,-0.28]];
function ridged(x,z){
  let v=0,a=0.5,f=0.0009,amp=0;
  for(let i=0;i<5;i++){
    const r=RIDGE_DIR[i],u=(x*r[0]+z*r[1])*f,w=(z*r[0]-x*r[1])*f;
    v+=a*(1-Math.abs(Math.sin(u+i*1.7)*Math.sin(w*1.3+i*2.3)));amp+=a;a*=0.5;f*=2.03;
  }
  v/=amp;return v*v;
}
/* the height of the land and lake bed anywhere outside the ski area */
function farH(x,z){
  const ax=Math.abs(x);
  if(ax<480&&z<1760)return WATER_Y-300;   /* tucked under the ski area, which draws itself */
  const s=lakeS(x,z),r=ridged(x,z);
  let h;
  if(s<1)h=WATER_Y-8-300*smooth(1,0.8,s);   /* the lake bed: shallow by the shore, then deep */
  else{
    const rise=smooth(1,1.9,s);
    let A=420+620*smooth(8800,10500,z)*smooth(-4000,1000,x)   /* the Desolation crest across the water, highest on the left */
      -180*smooth(-5000,-11000,x)                              /* lower, rounder hills far off to the north */
      +250*smooth(-400,-2500,z);                               /* the range behind our summit */
    h=WATER_Y+4+rise*A*(0.45+0.75*r);
    h+=rise*900*(0.65+0.35*r)*Math.exp(-(Math.pow(x-7600,2)+Math.pow(z-8700,2))/562500);   /* Mount Tallac, standing above Emerald Bay, with rough ridges */
  }
  const bay=bayIn(x,z);if(bay>0)h=lerp(h,WATER_Y-40,bay);
  /* next to the ski area, carry on its slopes so there is no seam, then blend into the wider basin */
  const dx=Math.max(0,ax-480),dz=Math.max(0,-320-z,z-1760),dp=Math.hypot(dx,dz);
  if(dp<2600){
    const hw=tahoeH(clamp(x,-480,480),z)+0.25*dx;
    const w=Math.max(smooth(500,2600,dp),(1-smooth(1,1.25,s))*smooth(40,400,dp));
    h=lerp(hw,h,w);
  }
  return h;
}
/* a tiny seeded random just for the scenery, so it never changes the course */
const srng=(function(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};})(20240917);
function buildBasin(){
  /* the land: one big sheet, finer near the ski area and coarser far away */
  const xs=[].concat(steps(-16000,-4000,400),steps(-4000,-480,80),steps(-480,480,80),steps(480,4000,80),steps(4000,10000,150),steps(10000,14001,400));
  const zs=[].concat(steps(-6000,-1500,400),steps(-1500,1760,80),steps(1760,4000,80),steps(4000,9000,120),steps(9000,16001,300));
  const nx=xs.length,nz=zs.length,pos=new Float32Array(nx*nz*3);
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const k=(j*nx+i)*3;pos[k]=xs[i];pos[k+1]=farH(xs[i],zs[j]);pos[k+2]=zs[j];}
  const idx=[];for(let j=0;j<nz-1;j++)for(let i=0;i<nx-1;i++){const a=j*nx+i,b=a+1,c=a+nx,d=c+1;idx.push(a,c,b,b,c,d);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setIndex(idx);geo.computeVertexNormals();
  /* colour each corner: sand at the waterline, dark winter forest on the lower slopes, granite on steep faces, snow up high */
  const nrm=geo.attributes.normal,col=new Float32Array(nx*nz*3);
  for(let n=0;n<nx*nz;n++){
    const x=pos[n*3],y=pos[n*3+1],z=pos[n*3+2],a=y-WATER_Y,sl=1-nrm.getY(n);
    const fn=clamp(0.55+0.45*Math.sin(x*0.004+z*0.003)*Math.sin(z*0.0051-x*0.0027)+0.25*Math.sin(x*0.013-z*0.011),0,1);
    const forest=Math.min(1,0.4+fn)*(1-smooth(620,900,a))*(1-smooth(0.5,0.8,sl))*smooth(3,14,a);   /* pines grow up to about 800 m above the lake */
    const rock=smooth(0.5,0.8,sl);
    let r=0.93,g=0.95,b=0.98;                                   /* snow */
    const fr=0.07+0.03*fn,fg=0.13+0.04*fn,fb=0.11;              /* pines, dusted with snow */
    r=lerp(r,fr,forest*0.9);g=lerp(g,fg,forest*0.9);b=lerp(b,fb,forest*0.9);
    r=lerp(r,0.58,rock*0.85);g=lerp(g,0.57,rock*0.85);b=lerp(b,0.55,rock*0.85);   /* granite */
    if(a<5&&a>-3){r=0.8;g=0.75;b=0.62;}                         /* sandy beach */
    col[n*3]=r;col[n*3+1]=g;col[n*3+2]=b;
  }
  geo.setAttribute('color',new THREE.BufferAttribute(col,3));
  /* polygonOffset nudges the land slightly back, so the water wins where they nearly touch far away (no flickering shoreline) */
  const land=new THREE.Mesh(geo,new THREE.MeshLambertMaterial({vertexColors:true,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:2}));
  land.frustumCulled=false;scene.add(land);
  /* the lake: turquoise over the sandy shallows all round the shore, deep blue further out, with a glint where the sun hits it */
  const wx=steps(-16000,-480,160).concat(steps(-480,480,6),steps(480,14001,160));
  const wz=steps(1450,1800,5).concat(steps(1800,14001,120));
  const shal=[0.25,0.66,0.7],mid=[0.1,0.42,0.6],deep=[0.05,0.22,0.42];
  gridMesh(wx,wz,(x,z,o)=>{
    o.y=WATER_Y;
    const d=WATER_Y-((Math.abs(x)<480&&z<1760)?tahoeH(x,z):farH(x,z));   /* water depth */
    const a=smooth(1,9,d),b=smooth(9,40,d);
    o.r=lerp(lerp(shal[0],mid[0],a),deep[0],b);o.g=lerp(lerp(shal[1],mid[1],a),deep[1],b);o.b=lerp(lerp(shal[2],mid[2],a),deep[2],b);
  },new THREE.MeshPhongMaterial({vertexColors:true,emissive:0x061a2c,specular:0x6f8fb0,shininess:60}));
  /* pine forest on the nearer shores: thousands of simple cones, all in one draw call */
  const spots=[];
  for(let i=0;i<40000&&spots.length<9000;i++){
    const x=-9000+srng()*18000,z=-2500+srng()*14000;
    const dp=Math.hypot(Math.max(0,Math.abs(x)-480),Math.max(0,-320-z,z-1760));
    if(dp<40||dp>9000)continue;
    const y=farH(x,z),a=y-WATER_Y;if(a<6||a>700)continue;
    const sl=Math.hypot(farH(x+20,z)-y,farH(x,z+20)-y)/20;if(sl>0.55)continue;
    const fn=0.55+0.45*Math.sin(x*0.004+z*0.003)*Math.sin(z*0.0051-x*0.0027)+0.25*Math.sin(x*0.013-z*0.011);
    if(srng()>fn-0.15)continue;
    spots.push([x,y,z,0.75+srng()*0.6]);
  }
  const cone=new THREE.ConeGeometry(1,1,6).translate(0,0.5,0);
  const forest=new THREE.InstancedMesh(cone,new THREE.MeshLambertMaterial({color:0xffffff}),spots.length);
  const dm=new THREE.Object3D(),cc=new THREE.Color();
  spots.forEach((p,i)=>{
    dm.position.set(p[0],p[1]-1,p[2]);dm.scale.set(3.4*p[3],16*p[3],3.4*p[3]);dm.rotation.y=srng()*6;dm.updateMatrix();forest.setMatrixAt(i,dm.matrix);
    cc.setRGB(0.12+srng()*0.05,0.22+srng()*0.06,0.17+srng()*0.03);forest.setColorAt(i,cc);
  });
  forest.instanceMatrix.needsUpdate=true;forest.instanceColor.needsUpdate=true;forest.frustumCulled=false;scene.add(forest);
  /* Fannette Island in Emerald Bay: a rocky knob with pines and the little stone tea house on top */
  const isl=new THREE.Group();isl.position.set(7250,WATER_Y,7330);scene.add(isl);
  const knob=new THREE.Mesh(new THREE.ConeGeometry(55,40,10),M(0x8f8a80));knob.position.y=12;knob.scale.set(1,1,0.7);isl.add(knob);
  for(let i=0;i<10;i++){const a=i*0.7,r=12+(i%3)*10;const tr=new THREE.Mesh(new THREE.ConeGeometry(4,16,7),M(0x1f3b2c));tr.position.set(Math.cos(a)*r,38-0.75*r,Math.sin(a)*r*0.7);isl.add(tr);}
  bx(6,4,6,M(0x9a9184),0,31,0,isl);
  const tea=new THREE.Mesh(new THREE.ConeGeometry(5,3.5,4),M(0x6b4a35));tea.rotation.y=Math.PI/4;tea.position.y=34.7;isl.add(tea);
}
(function buildTahoe(){
  if(TUTORIAL)return;
  buildBasin();
  /* a wooden dock by the base lodge */
  bx(3.4,0.35,46,M(0x8a6a48),118,WATER_Y+0.9,1620);
  for(let z=1600;z<=1642;z+=7){bx(0.35,4,0.35,M(0x5d4630),116.6,WATER_Y-1,z);bx(0.35,4,0.35,M(0x5d4630),119.4,WATER_Y-1,z);}
  /* the summit station at the top of the gondola, with a sign facing down the mountain */
  const s=PADS[0],st=new THREE.Group();st.position.set(s.x,s.h,s.z);scene.add(st);
  bx(12,5.5,8,M(0x8b939c),0,2.75,0,st);bx(13,0.6,9,M(0xf4f8fb),0,5.8,0,st);
  bx(12.2,1.6,0.2,M(0x9fd4ff,0x3a6c96),0,3.4,4.05,st);
  const wheel=new THREE.Mesh(new THREE.TorusGeometry(3,0.3,8,24),M(0x3b434c));wheel.rotation.x=Math.PI/2;wheel.position.set(0,6.4,-5.5);st.add(wheel);
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(12,3),new THREE.MeshBasicMaterial({map:signTex('LAKE TAHOE','#7fd8ff'),side:THREE.DoubleSide}));sign.position.set(0,8.4,4.6);st.add(sign);
  addObstacle(s.x,s.z,7);
  /* a small warming hut halfway down, with a lamp in the window */
  const hp=PADS[1],hut=new THREE.Group();hut.position.set(hp.x,hp.h,hp.z);scene.add(hut);
  bx(5,2.6,4,M(0x6e4a31),0,1.3,0,hut);
  const rf=new THREE.Mesh(new THREE.ConeGeometry(4.3,2.4,4),M(0xf1f6fa));rf.rotation.y=Math.PI/4;rf.position.y=3.8;hut.add(rf);
  bx(1,1.9,0.2,M(0x2b1c12),0,0.95,2.05,hut);bx(1,0.8,0.2,M(0xffe3a0,0xffc866),-1.5,1.6,2.05,hut);
  const lamp=new THREE.PointLight(0xffc77a,1,20);lamp.position.set(0,2.4,3);hut.add(lamp);
  addObstacle(hp.x,hp.z,3.6);
  /* the board cache: a ring of granite boulders open toward the run, with the Tahoe Legend stuck upright in the snow.
     No beam marks it like the tutorial fragments; only a faint golden glow among the pines. */
  const cp=PADS[3],cg=new THREE.Group();cg.position.set(cp.x,cp.h,cp.z);scene.add(cg);
  const gm=M(0xa29d93);
  for(let i=0;i<7;i++){
    const a=Math.PI*0.25+i*(Math.PI*1.5/6),s=2.2+((i*37)%10)/10*1.4,rx=Math.cos(a)*5.2,rz=Math.sin(a)*5.2;   /* the gap faces +x, toward the middle of the slope */
    const r=new THREE.Mesh(new THREE.DodecahedronGeometry(1,0),gm);r.position.set(rx,s*0.35,rz);r.scale.set(s,s*0.9,s);r.rotation.y=i;cg.add(r);
    addObstacle(cp.x+rx,cp.z+rz,s*0.8);
  }
  const lb=new THREE.Group();lb.rotation.set(0.15,0.6,0.1);cg.add(lb);
  bx(0.36,1.5,0.05,M(0x14233d,0x0a1830),0,0.85,0,lb);                 /* deep blue topsheet */
  bx(0.12,1.3,0.012,M(0xffd27a,0x6a4a00),0,0.85,0.03,lb);             /* gold stripe */
  for(const e of [-1,1])bx(0.02,1.52,0.07,M(0xffc04d,0xa06000),0.18*e,0.85,0,lb);   /* glowing gold edges */
  const glow=new THREE.PointLight(0xffb347,0.9,16);glow.position.set(0,1.4,0.6);cg.add(glow);
  cg.userData.glow=glow;boardCache=cg;
  /* a glint high above the cache, so you can spot it from the run. main.js makes it twinkle and fades it out up close. */
  boardGlint=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex(),color:0xffc870,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));
  boardGlint.position.set(0,16,0);boardGlint.scale.set(4,4,1);cg.add(boardGlint);
  /* the landmark from the clue: a tall dead pine with a red rag tied near the top, taller than the forest round it. It stays after the board is found. */
  const sx=cp.x+8,sz=cp.z-6,sy=H(sx,sz),snag=new THREE.Group();snag.position.set(sx,sy,sz);scene.add(snag);
  const bark=M(0x6b625a);
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.6,22,7),bark);trunk.position.y=11;snag.add(trunk);
  [[5,0.4,4.5],[8,2.5,3.6],[11,4.2,4],[14,1.2,3],[16.5,3.3,2.6],[19,5.5,2]].forEach(b=>{   /* bare branches: height, direction, length */
    const br=bx(b[2],0.16,0.16,bark,Math.cos(b[1])*b[2]/2,b[0],Math.sin(b[1])*b[2]/2,snag);br.rotation.y=-b[1];br.rotation.z=0.35;
  });
  boardRag=new THREE.Mesh(new THREE.PlaneGeometry(1.8,0.9),new THREE.MeshLambertMaterial({color:0xe23b2e,emissive:0x5a0c06,side:THREE.DoubleSide}));
  boardRag.position.set(1.1,18.2,0);boardRag.rotation.y=Math.PI/2;snag.add(boardRag);
  addObstacle(sx,sz,0.9);
  /* the notice board just below the start, where a note gives the first clue */
  const ns=new THREE.Group();ns.position.set(NOTICE_SPOT.x,H(NOTICE_SPOT.x,NOTICE_SPOT.z),NOTICE_SPOT.z);ns.rotation.y=-0.4;scene.add(ns);
  for(const e of [-1,1])bx(0.15,2.2,0.15,M(0x5d4630),e*1,1.1,0,ns);
  bx(2.4,1.4,0.12,M(0x8a6a48),0,1.6,0,ns);
  bx(0.7,0.9,0.02,M(0xf3e9d2),-0.4,1.6,-0.08,ns);bx(0.5,0.6,0.02,M(0xf3e2b0),0.55,1.7,-0.08,ns);   /* papers pinned on the uphill side */
  addObstacle(NOTICE_SPOT.x,NOTICE_SPOT.z,1.3);
  /* the base lodge by the shore, and a banner over the bottom of the run */
  const bp=PADS[2],L=new THREE.Group();L.position.set(bp.x,bp.h,bp.z);scene.add(L);
  bx(15,5.5,9,M(0x6e4a31),0,2.75,0,L);bx(16.4,0.7,10.4,M(0xf4f8fb),0,6,0,L);
  bx(2,3,0.2,M(0x2b1c12),0,1.5,-4.55,L);
  for(let i=0;i<3;i++)bx(2,1.4,0.2,M(0xffe3a0,0xffc866),-4.5+i*4.5,3.2,-4.55,L);
  bx(1.2,3,1.2,M(0x5d625f),4,7.2,2,L);
  addObstacle(bp.x,bp.z,8.4);
  const fz=FINISH_Z;
  [-13,13].forEach(x=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.4,10,8),M(0xe24a3b));m.position.set(x,H(x,fz)+5,fz);scene.add(m);addObstacle(x,fz,0.7);});
  const ban=new THREE.Mesh(new THREE.PlaneGeometry(26,6.5),new THREE.MeshBasicMaterial({map:signTex('BASE LODGE','#ff6b57'),side:THREE.DoubleSide,fog:false}));
  ban.position.set(0,H(0,fz)+10.5,fz);scene.add(ban);
})();

/* ================= jump structures ================= */
/* build every jump in JUMPS. Wooden ramps get a plank surface that follows the snow shape; cliffs get boulders. Flags mark every lip. */
(function buildJumps(){
  const woodA=[0xbf8e58,0xad7c4c],beam=0x6e4c2e,skirt=0x7b5735;
  const flagW=new THREE.MeshLambertMaterial({color:0xffc83d,emissive:0x6a4a00,side:THREE.DoubleSide});
  const flagC=new THREE.MeshLambertMaterial({color:0xff5a2d,emissive:0x701c00,side:THREE.DoubleSide});
  const pole=M(0x3c4652),rockM=M(0x59606c);
  const c=new THREE.Color();
  JUMPS.forEach(j=>{
    const lipY=H(j.x,j.z);
    /* lip flags: yellow on wood, orange on cliffs, so every drop-off is marked from far away */
    const ph=j.type==='cliff'?6:(j.size==='big'?4.6:3);
    [-1,1].forEach(sd=>{
      const fx=j.x+sd*j.w*(j.type==='cliff'?0.95:0.88),fy=H(fx,j.z-0.5);
      const pm=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.09,ph,6),pole);pm.position.set(fx,fy+ph/2,j.z-0.5);scene.add(pm);
      const fl=new THREE.Mesh(new THREE.PlaneGeometry(j.type==='cliff'?2.4:1.5,j.type==='cliff'?1.5:0.95),j.type==='cliff'?flagC:flagW);
      fl.position.set(fx-sd*(j.type==='cliff'?1.2:0.75),fy+ph-0.6,j.z-0.5);fl.rotation.y=Math.PI/2;scene.add(fl);
    });
    if(j.type==='wood'){
      /* plank surface that follows the exact terrain profile, plus side skirts down to the ground */
      const z0=j.z-j.len,z1=j.z+j.drop,step=0.7,xl=j.x-j.w*0.88,xr=j.x+j.w*0.88;
      const P=[],C=[];const n=Math.ceil((z1-z0)/step);
      const push=(a,col)=>{P.push(a[0],a[1],a[2]);C.push(col.r,col.g,col.b);};
      const quad=(a,b,cc,d,col)=>{push(a,col);push(b,col);push(cc,col);push(a,col);push(cc,col);push(d,col);};
      const top=(x,z)=>[x,H(x,z)+0.07,z];
      const bot=(x,z)=>[x,H(x,z)-kick(j,x,z)-0.45,z];
      for(let i=0;i<n;i++){
        const za=z0+i*step,zb=Math.min(z1,za+step);
        c.setHex(i%8===7?beam:woodA[i%2]);
        quad(top(xl,za),top(xr,za),top(xr,zb),top(xl,zb),c);
        c.setHex(skirt);
        quad(top(xl,za),top(xl,zb),bot(xl,zb),bot(xl,za),c);
        quad(top(xr,za),bot(xr,za),bot(xr,zb),top(xr,zb),c);
      }
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));
      g.setAttribute('color',new THREE.Float32BufferAttribute(C,3));
      g.computeVertexNormals();
      scene.add(new THREE.Mesh(g,new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide})));
    } else {
      /* cliff: boulders crown both ends of the lip and line the face, leaving the middle clear for take-off */
      for(let sd=-1;sd<=1;sd+=2){
        for(let i=0;i<5;i++){
          const off=j.w*(0.8+0.1*i)+rng()*0.8,x=j.x+sd*off,z=j.z+0.4-i*1.4+rng()*1.6,sz=1.3+rng()*1.4;
          const r=new THREE.Mesh(new THREE.DodecahedronGeometry(1,0),rockM);
          r.position.set(x,H(x,z)+sz*0.25,z);r.scale.set(sz,sz*0.8,sz*0.9);r.rotation.y=rng()*6;scene.add(r);
          addObstacle(x,z,sz*0.85);
        }
        for(let i=0;i<4;i++){
          const x=j.x+sd*j.w*(0.82+rng()*0.5),z=j.z+1+i*2.4,sz=1+rng()*1.3;
          const r=new THREE.Mesh(new THREE.DodecahedronGeometry(1,0),rockM);
          r.position.set(x,H(x,z)+sz*0.2,z);r.scale.set(sz,sz*0.8,sz);r.rotation.y=rng()*6;scene.add(r);
          addObstacle(x,z,sz*0.8);
        }
      }
    }
  });
})();

/* ================= fragment objects ================= */
/* a floating paper, a halo and a tall light beam for each map fragment. main.js animates them and hides each one once collected. */
const fragGroup=new THREE.Group();scene.add(fragGroup);
const fragObjs=FR.map((f,i)=>{
  const g=new THREE.Group();g.position.set(f.x,f.y,f.z);
  const paper=new THREE.Mesh(new THREE.PlaneGeometry(1.5,2.0),new THREE.MeshBasicMaterial({color:0xf3e2b0,side:THREE.DoubleSide,fog:false}));
  const edge=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.5,2.0)),new THREE.LineBasicMaterial({color:0xffb347}));
  paper.add(edge);g.add(paper);
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,90,12,1,true),new THREE.MeshBasicMaterial({color:0xffd27a,transparent:true,opacity:0.3,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false}));
  beam.position.y=44;g.add(beam);
  const halo=new THREE.Mesh(new THREE.TorusGeometry(1.6,0.05,6,28),new THREE.MeshBasicMaterial({color:0xffd27a,transparent:true,opacity:0.8,fog:false}));
  halo.rotation.x=Math.PI/2;g.add(halo);
  fragGroup.add(g);
  return {g:g,paper:paper,halo:halo,beam:beam};
});

/* ================= race gates ================= */
/* the 14 race gates on the Lost Line, only shown during a race. main.js turns them green when you pass through and orange when you miss. */
const gateGroup=new THREE.Group();gateGroup.visible=false;scene.add(gateGroup);
const GATES=[];
(function(){
  for(let i=0;i<(TUTORIAL?14:0);i++){
    const gz=-200+i*128,gx=lineX(gz);
    const m=new THREE.Mesh(new THREE.TorusGeometry(5.2,0.26,8,36,Math.PI),new THREE.MeshBasicMaterial({color:0x7fe8ff,fog:false}));
    const dx=lineX(gz+2)-lineX(gz-2);
    m.position.set(gx,H(gx,gz)-0.2,gz);m.rotation.y=Math.atan2(dx/4,1);
    gateGroup.add(m);GATES.push({x:gx,z:gz,mesh:m,hit:false,missed:false});
  }
})();

/* ================= particles ================= */
/* a simple particle system: a fixed pool of soft dots that move, fall and fade. emit() starts one, update() moves them all each frame. */
class Parts{
  constructor(n,additive,color,grav){
    this.n=n;this.i=0;this.grav=grav||0;
    this.pos=new Float32Array(n*3);this.vel=new Float32Array(n*3);
    this.size=new Float32Array(n);this.alpha=new Float32Array(n);this.life=new Float32Array(n);this.max=new Float32Array(n);this.s0=new Float32Array(n);
    this.col=new Float32Array(n*3).fill(1);
    const geo=new THREE.BufferGeometry();
    this.aPos=new THREE.BufferAttribute(this.pos,3);this.aSize=new THREE.BufferAttribute(this.size,1);this.aAlpha=new THREE.BufferAttribute(this.alpha,1);
    this.aCol=new THREE.BufferAttribute(this.col,3);
    geo.setAttribute('position',this.aPos);geo.setAttribute('size',this.aSize);geo.setAttribute('alpha',this.aAlpha);geo.setAttribute('pc',this.aCol);
    this.mat=new THREE.ShaderMaterial({
      uniforms:{color:{value:new THREE.Color(color)}},
      vertexShader:'attribute float size;attribute float alpha;attribute vec3 pc;varying float vA;varying vec3 vC;void main(){vA=alpha;vC=pc;vec4 mv=modelViewMatrix*vec4(position,1.0);gl_PointSize=size*(320.0/-mv.z);gl_Position=projectionMatrix*mv;}',
      fragmentShader:'uniform vec3 color;varying float vA;varying vec3 vC;void main(){float d=length(gl_PointCoord-0.5);if(d>0.5)discard;float a=smoothstep(0.5,0.0,d)*vA;gl_FragColor=vec4(color*vC,a);}',
      transparent:true,depthWrite:false,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending
    });
    this.points=new THREE.Points(geo,this.mat);this.points.frustumCulled=false;scene.add(this.points);
  }
  emit(x,y,z,vx,vy,vz,life,size,cr,cg,cb){
    const i=this.i;this.i=(i+1)%this.n;const k=i*3;
    this.col[k]=cr===undefined?1:cr;this.col[k+1]=cg===undefined?1:cg;this.col[k+2]=cb===undefined?1:cb;
    this.pos[k]=x;this.pos[k+1]=y;this.pos[k+2]=z;this.vel[k]=vx;this.vel[k+1]=vy;this.vel[k+2]=vz;
    this.life[i]=life;this.max[i]=life;this.s0[i]=size;
  }
  update(dt){
    for(let i=0;i<this.n;i++){
      if(this.life[i]>0){
        this.life[i]-=dt;const k=i*3;
        this.vel[k+1]-=this.grav*dt;
        this.pos[k]+=this.vel[k]*dt;this.pos[k+1]+=this.vel[k+1]*dt;this.pos[k+2]+=this.vel[k+2]*dt;
        const f=Math.max(0,this.life[i]/this.max[i]);
        this.alpha[i]=f*0.9;this.size[i]=this.s0[i]*(1+(1-f)*1.1);
      } else {this.alpha[i]=0;}
    }
    this.aPos.needsUpdate=true;this.aAlpha.needsUpdate=true;this.aSize.needsUpdate=true;this.aCol.needsUpdate=true;
  }
}
/* spray: snow kicked up by carving and landings. trail: the glowing Lost Line ski trail. burst: golden sparkles for pickups and unlocks. */
const spray=new Parts(500,false,0xffffff,9);
const trail=new Parts(520,true,0xffffff,0);
const burst=new Parts(160,true,0xffd27a,6);

/* falling snow */
const SNOW_N=650;
const snowPos=new Float32Array(SNOW_N*3);
for(let i=0;i<SNOW_N;i++){snowPos[i*3]=(Math.random()-0.5)*80;snowPos[i*3+1]=Math.random()*36;snowPos[i*3+2]=(Math.random()-0.5)*80;}
const snowGeo=new THREE.BufferGeometry();snowGeo.setAttribute('position',new THREE.BufferAttribute(snowPos,3));
const snow=new THREE.Points(snowGeo,new THREE.PointsMaterial({color:0xffffff,size:0.22,transparent:true,opacity:0.85,depthWrite:false}));
snow.frustumCulled=false;scene.add(snow);

/* ================= camera ================= */
/* the follow camera sits behind and above the skier, swings round smoothly as you turn, pulls back and widens with speed, and never dips below the snow */
let camYaw=0,camDip=0,shake=0;
const camPos=new THREE.Vector3(),look=new THREE.Vector3();
/* put the camera straight behind the skier at once (after a teleport, so it does not swoop across the map) */
function snapCamera(){
  camYaw=P.h;
  const d=8.5,h=3.4;
  camPos.set(P.x-Math.sin(camYaw)*d,P.y+h,P.z-Math.cos(camYaw)*d);
}
/* every frame: ease the camera toward where it should be, shake it a little at high speed, and darken the screen edges */
function updateCamera(dt){
  const sp=Math.hypot(P.vx,P.vz);
  const vd=(sp>4&&!P.walk)?Math.atan2(P.vx,P.vz):P.h;
  const tgt=P.h+angdiff(vd,P.h)*0.5;
  camYaw+=angdiff(tgt,camYaw)*(1-Math.exp(-dt*3.2));
  const dist=P.walk?6.4:8.6+sp*0.07,hgt=P.walk?2.7:3.4+sp*0.025;
  const cx=P.x-Math.sin(camYaw)*dist,cz=P.z-Math.cos(camYaw)*dist;
  let cy=P.y+hgt-camDip;
  const gyc=H(cx,cz)+1.7;if(cy<gyc)cy=gyc;
  const kx=1-Math.exp(-dt*16),ky=1-Math.exp(-dt*8);
  camPos.x+=(cx-camPos.x)*kx;camPos.z+=(cz-camPos.z)*kx;camPos.y+=(cy-camPos.y)*ky;
  camDip*=Math.exp(-dt*5);
  shake=Math.max(0,(sp-30)/20);
  camera.position.set(camPos.x+(Math.random()-0.5)*0.05*shake,camPos.y+(Math.random()-0.5)*0.05*shake,camPos.z);
  look.set(P.x+Math.sin(camYaw)*7,P.y+1.8,P.z+Math.cos(camYaw)*7);
  camera.lookAt(look);
  const fov=P.walk?60:62+Math.min(sp,46)*0.5;
  if(Math.abs(camera.fov-fov)>0.05){camera.fov=fov;camera.updateProjectionMatrix();}
  $('vignette').style.opacity=clamp((sp-26)/22,0,0.9).toFixed(2);
  sun.position.set(P.x+160,P.y+260,P.z-110);sun.target.position.set(P.x,P.y,P.z);
}
