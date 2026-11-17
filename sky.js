import * as THREE from 'three';

// Original procedural pixel sky: no third-party image assets or captured frames.
function makeSky(night) {
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=Math.max(100,Math.min(1200,Math.round(320*innerHeight/innerWidth)));
  const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
  const bands=night?['#101d65','#1b318e','#334fac','#6955a4']:['#238fe2','#42b5f3','#82d8f4','#b9eafa'];
  bands.forEach((color,i)=>{ctx.fillStyle=color;ctx.fillRect(0,Math.floor(i*canvas.height/4),320,Math.ceil(canvas.height/4));});
  const block=(x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
  const sunY=Math.round(canvas.height*.09);
  if(night){
    let seed=834;for(let i=0;i<65;i++){seed=(seed*1664525+1013904223)>>>0;const x=seed%320;seed=(seed*1664525+1013904223)>>>0;const y=seed%Math.max(1,Math.floor(canvas.height*.64));block(x,y,2,2,i%4?'#d9efff':'#fff0b1');if(i%7===0){block(x-2,y,6,2,'#d9efff');block(x,y-2,2,6,'#d9efff');}}
    block(242,sunY,24,24,'#afc7f0');block(246,sunY-4,16,32,'#afc7f0');block(246,sunY+1,16,22,'#fff3c6');block(250,sunY-3,8,30,'#fff3c6');block(251,sunY+4,4,3,'#e4d7ae');block(256,sunY+14,3,3,'#e4d7ae');
  }else{
    block(243,sunY,26,26,'#ffa62c');block(247,sunY-4,18,34,'#ffa62c');block(247,sunY,18,26,'#ffe66a');block(243,sunY+4,26,18,'#ffe66a');
    for(const [x,originalY] of [[115,48],[195,82],[195,32]]){const y=Math.round(originalY*canvas.height/180);block(x,y+5,42,9,'#efffff');block(x+6,y,16,14,'#efffff');block(x+20,y-3,12,17,'#efffff');block(x+3,y+14,35,3,'#a8e9fb');}
  }
  const texture=new THREE.CanvasTexture(canvas);texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
export function makeDayNight({scene,hemisphere,sun,procedural}) {
  let skies={day:makeSky(false),night:makeSky(true)},active='day';
  const lit=new Set();procedural.traverse(o=>{if(o.material?.color?.getHexString()==='e6ca8e')lit.add(o.material);});
  function set(mode){active=mode;const night=mode==='night';scene.background=skies[mode];hemisphere.intensity=night?1.9:2.1;hemisphere.color.set(night?'#b3c4ff':'#f7fff5');hemisphere.groundColor.set(night?'#5e6598':'#728e79');sun.intensity=night?1.55:2.2;sun.color.set(night?'#b2c6ff':'#fff7dd');for(const material of lit){material.emissive.set(night?'#ffb52f':'#000000');material.emissiveIntensity=night?1.1:0;}}
  function resize(){const previous=skies;skies={day:makeSky(false),night:makeSky(true)};set(active);previous.day.dispose();previous.night.dispose();}
  set('day');return {set,resize};
}
