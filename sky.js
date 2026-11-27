import * as THREE from 'three';

// A low-resolution sky shared by every camera view. The scene keeps nearest-neighbor pixels at any size.
function makeSky(night, height) {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const block = (x, y, w, h, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  };
  const colors = night
    ? ['#202252', '#262b63', '#303c79', '#3e4c8a', '#545b98', '#696ba4', '#8580ac', '#9a91b6']
    : ['#348fcd', '#449fd6', '#59afdf', '#70bee5', '#88cbe8', '#a0d8ec', '#b2e2ed', '#c4e8e8'];
  colors.forEach((color, row) => {
    const y = Math.floor(row * height / colors.length);
    block(0, y, canvas.width, Math.ceil(height / colors.length) + 1, color);
  });

  const cx = 255, cy = Math.max(15, Math.round(height * .15));
  if (night) {
    let seed = 834;
    const next = max => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return Math.floor(seed / 4294967296 * max);
    };
    for (let i = 0; i < 63; i++) {
      const x = next(320), y = next(Math.round(height * .72));
      if (Math.hypot(cx-x, cy-y) < 18) continue;
      if (i % 11 === 0) {
        block(x-2,y,5,1,'#c6d7ee'); block(x,y-2,1,5,'#c6d7ee');
        block(x,y,1,1,'#fff1c9');
      } else {
        block(x,y,1+(i%7===0 ? 1 : 0),1,i%3 ? '#acbce1' : '#f0dfc1');
      }
    }
  }

  // Small integer scanlines keep the sun and moon round at sprite resolution.
  const halfWidths = [4,7,9,10,11,12,12,13,13,13,13,13,13];
  const rim = night ? '#98a5d3' : '#efb065';
  const core = night ? '#ffedc3' : '#ffe58b';
  for (let y = -12; y <= 12; y++) {
    const width = halfWidths[12-Math.abs(y)];
    block(cx-width, cy+y, width*2, 1, rim);
    block(cx-width+2, cy+y, Math.max(1, width*2-4), 1, core);
  }
  if (night) {
    block(cx-6, cy-5, 4, 2, '#dbcfb2'); block(cx-4, cy-3, 3, 2, '#e6daba');
    block(cx+4, cy+4, 3, 3, '#ddcfb1'); block(cx+2, cy+6, 3, 1, '#ddcfb1');
  } else {
    block(cx-5, cy-8, 7, 2, '#fff3b3');
    block(cx-8, cy-6, 4, 2, '#fff3b3');
  }
  function cloud(x, y, scale) {
    const top = night ? '#686d9e' : '#f0f8ee';
    const face = night ? '#5b6196' : '#d7edf0';
    const shade = night ? '#505b8f' : '#acd8e6';
    const bar = (dx, dy, w, h, c) => block(x+dx*scale, y+dy*scale, w*scale, h*scale, c);
    bar(0,6,39,3,shade); bar(3,4,34,4,face);
    bar(7,2,9,4,top); bar(12,0,7,5,top); bar(18,2,5,4,top);
    bar(23,3,7,3,face); bar(28,5,6,2,face); bar(4,6,23,1,top);
    bar(6,9,28,1,shade);
  }
  cloud(14,Math.round(height*(night ? .38 : .22)),1);
  cloud(174,Math.round(height*(night ? .31 : .12)),1);
  cloud(280,Math.round(height*.55),1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}


export function makeDayNight({scene,hemisphere,sun,procedural,stage}) {
  let skies, skyHeight=0, active='day';
  const lit = new Set();
  procedural.traverse(({ material }) => {
    if (material?.userData.nightGlow) lit.add(material);
  });
  function set(mode) {
    active = mode;
    const night = mode === 'night';
    scene.background = skies[mode];
    hemisphere.intensity = night ? 2.10 : 2.06;
    hemisphere.color.set(night ? '#c4d5ff' : '#f7fff5');
    hemisphere.groundColor.set(night ? '#75779e' : '#829c79');
    sun.intensity = night ? 1.58 : 1.96;
    sun.color.set(night ? '#b5c8ff' : '#fff0d5');
    for (const material of lit) {
      const { color, intensity } = material.userData.nightGlow;
      material.emissive.set(color);
      material.emissiveIntensity = night ? intensity : 0;
    }
  }
  function resize(){
    const height=Math.max(100,Math.min(1200,Math.round(320*stage.clientHeight/Math.max(1,stage.clientWidth))));
    if(height===skyHeight)return;
    skyHeight=height;
    const previous=skies;
    skies={day:makeSky(false,height),night:makeSky(true,height)};
    set(active);
    if(previous){previous.day.dispose();previous.night.dispose();}
  }
  resize();return {set,resize};
}
