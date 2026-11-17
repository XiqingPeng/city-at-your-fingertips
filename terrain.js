import * as THREE from 'three';
const ZOOM=13, GRID=24, TILE=256;
function worldPixel(lat,lon){const n=2**ZOOM*TILE;const clipped=Math.max(-85,Math.min(85,lat))*Math.PI/180;return [(lon+180)/360*n,(1-Math.log(Math.tan(clipped)+1/Math.cos(clipped))/Math.PI)/2*n];}
export async function getElevation(place,km,signal){
  const halfLat=km/2/111.32,halfLon=halfLat/Math.max(.1,Math.cos(place.latitude*Math.PI/180));
  const samples=[],tileKeys=new Set();
  for(let y=0;y<=GRID;y++)for(let x=0;x<=GRID;x++){
    const lat=place.latitude+halfLat*(1-2*y/GRID),lon=place.longitude+halfLon*(2*x/GRID-1);const [px,py]=worldPixel(lat,lon);const tx=Math.floor(px/TILE),ty=Math.floor(py/TILE);tileKeys.add(`${tx},${ty}`);samples.push({tx,ty,x:Math.floor(px%TILE),y:Math.floor(py%TILE)});
  }
  const tiles=new Map();
  await Promise.all([...tileKeys].map(async key=>{const [x,y]=key.split(',');const response=await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ZOOM}/${x}/${y}.png`,{signal});if(!response.ok)throw new Error(`Terrain tile ${response.status}`);const bitmap=await createImageBitmap(await response.blob());const canvas=document.createElement('canvas');canvas.width=TILE;canvas.height=TILE;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);bitmap.close();tiles.set(key,ctx.getImageData(0,0,TILE,TILE).data);}));
  const elevations=samples.map(p=>{const data=tiles.get(`${p.tx},${p.ty}`),i=(p.y*TILE+p.x)*4;return data[i]*256+data[i+1]+data[i+2]/256-32768;});
  const min=Math.min(...elevations),max=Math.max(...elevations);const heights=elevations.map(h=>Math.max(0,(h-min)*40/(km*1000)));
  function sample(x,z){const gx=THREE.MathUtils.clamp((x/42+.5)*GRID,0,GRID),gy=THREE.MathUtils.clamp((z/42+.5)*GRID,0,GRID),x0=Math.floor(gx),y0=Math.floor(gy),x1=Math.min(GRID,x0+1),y1=Math.min(GRID,y0+1),dx=gx-x0,dy=gy-y0;const at=(a,b)=>heights[b*(GRID+1)+a];return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(x0,y0),at(x1,y0),dx),THREE.MathUtils.lerp(at(x0,y1),at(x1,y1),dx),dy);}
  return {heights,sample,min,max};
}
export function terrainMesh(data,color){
  const vertices=[],indices=[],N=GRID+1;
  for(let y=0;y<N;y++)for(let x=0;x<N;x++)vertices.push((x/GRID-.5)*42,data.heights[y*N+x],(y/GRID-.5)*42);
  for(let y=0;y<GRID;y++)for(let x=0;x<GRID;x++){const a=y*N+x,b=a+1,c=a+N,d=c+1;indices.push(a,c,b,b,c,d);}
  const border=[];for(let x=0;x<N;x++)border.push(x);for(let y=1;y<N;y++)border.push(y*N+GRID);for(let x=GRID-1;x>=0;x--)border.push(GRID*N+x);for(let y=GRID-1;y>0;y--)border.push(y*N);
  for(const i of border)vertices.push(vertices[i*3],-.6,vertices[i*3+2]);
  const offset=N*N;for(let i=0;i<border.length;i++){const j=(i+1)%border.length;indices.push(border[i],border[j],offset+i,border[j],offset+j,offset+i);}
  const center=vertices.length/3;vertices.push(0,-.6,0);for(let i=0;i<border.length;i++)indices.push(center,offset+i,offset+(i+1)%border.length);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:1,flatShading:true,side:THREE.DoubleSide}));mesh.userData.colorRole='ground';mesh.userData.isTerrain=true;mesh.receiveShadow=true;return mesh;
}
