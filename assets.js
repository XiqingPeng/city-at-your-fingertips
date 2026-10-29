import * as THREE from 'three';

// Reusable procedural assets: all parts share geometry and materials, and each
// building is one unit tall with its base at y=0, so it can grow continuously.
const box = new THREE.BoxGeometry(1, 1, 1);
const cone = new THREE.ConeGeometry(1, 1, 7);
const sphere = new THREE.IcosahedronGeometry(1, 1);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
const walls = ['#d6d3c4','#b9cbbf','#e5cdb5','#bdc6bd','#e3dccd'].map(color => new THREE.MeshStandardMaterial({color}));
const greens = ['#6b9c78','#83a985','#548467','#a1b989'].map(color => new THREE.MeshStandardMaterial({color}));
const trunk = new THREE.MeshStandardMaterial({color:0x82745c});
const roof = new THREE.MeshStandardMaterial({color:0x879e8e});
function part(group, geometry, material, x, y, z, sx, sy, sz) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz); mesh.castShadow=true; mesh.receiveShadow=true; group.add(mesh);
}
export function building(type, color) {
  const group = new THREE.Group(), mat = walls[color % walls.length];
  if(type === 0) part(group,box,mat,0,.5,0,1,1,1);
  if(type === 1) { part(group,box,mat,0,.36,0,1,.72,1); part(group,box,mat,0,.86,0,.68,.28,.68); }
  if(type === 2) { part(group,box,mat,0,.42,0,1,.84,1); part(group,cone,roof,0,.92,0,.73,.16,.73); }
  if(type === 3) { part(group,box,mat,-.15,.5,0,.7,1,.85); part(group,box,mat,.3,.3,.1,.4,.6,.65); }
  return group;
}
export function tree(type, color) {
  const group = new THREE.Group(), mat=greens[color % greens.length];
  part(group,cylinder,trunk,0,.3,0,.10,.6,.10);
  if(type===0) part(group,cone,mat,0,1.1,0,.60,1.55,.60);
  if(type===1) part(group,sphere,mat,0,1.1,0,.63,.72,.63);
  if(type===2) { part(group,cone,mat,0,.95,0,.68,1.1,.68);part(group,cone,mat,0,1.48,0,.47,1.0,.47); }
  if(type===3) { part(group,sphere,mat,-.25,1.06,0,.46,.50,.46);part(group,sphere,mat,.25,1.06,0,.46,.50,.46);part(group,sphere,mat,0,1.42,0,.48,.52,.48); }
  return group;
}
