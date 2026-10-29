import * as THREE from 'three';

// Original modular assets. Geometry and materials are shared between copies.
// Buildings occupy a roughly unit-sized lot with the base at y=0.
const box = new THREE.BoxGeometry(1, 1, 1);
const cone = new THREE.ConeGeometry(1, 1, 7);
const sphere = new THREE.IcosahedronGeometry(1, 1);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
const roofShape = new THREE.ConeGeometry(1, 1, 4);
roofShape.rotateY(Math.PI / 4);
const walls = ['#e6c9a7','#c7b7a1','#e2d5bf','#b2c2af','#dba995','#aebec0','#d9c3a3'].map(color => new THREE.MeshStandardMaterial({color}));
const greens = ['#6b9c78','#83a985','#548467','#a1b989','#b0a76a','#779b6d'].map(color => new THREE.MeshStandardMaterial({color}));
const roofs = ['#ad7461','#718679','#a18869','#647e82'].map(color => new THREE.MeshStandardMaterial({color}));
const glass = new THREE.MeshStandardMaterial({color:'#719598', roughness:.55});
const trim = new THREE.MeshStandardMaterial({color:'#e8dfc9'});
const dark = new THREE.MeshStandardMaterial({color:'#7d7163'});
const trunk = new THREE.MeshStandardMaterial({color:'#82705a'});
const blossom = new THREE.MeshStandardMaterial({color:'#dca6a4'});
const buildingCache = new Map(), treeCache = new Map();
function part(group, geometry, material, x, y, z, sx, sy, sz, shadow=true) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz); mesh.castShadow=shadow; mesh.receiveShadow=true; group.add(mesh);
}
function windows(group, width, z, count=3) {
  for(let i=0;i<count;i++) part(group,box,glass,0,.25+i*.19,z,width,.065,.018,false);
}
function makeBuilding(type, color) {
  const group=new THREE.Group(), mat=walls[color % walls.length], roof=roofs[color % roofs.length];
  switch(type) {
    case 0: // shopfront with a pitched roof
      part(group,box,mat,0,.37,0,.92,.74,.82); part(group,roofShape,roof,0,.86,0,.72,.28,.64);
      part(group,box,glass,0,.32,.418,.55,.19,.02,false); part(group,box,trim,0,.52,.43,.68,.055,.07,false); break;
    case 1: // stepped office
      part(group,box,mat,0,.35,0,.94,.70,.90); part(group,box,mat,0,.83,0,.64,.26,.64);
      windows(group,.65,.459,3); part(group,box,roof,0,.97,0,.68,.035,.68); break;
    case 2: // townhouse with chimney
      part(group,box,mat,0,.38,0,.78,.76,.86); part(group,roofShape,roof,0,.87,0,.63,.26,.68);
      part(group,box,dark,.23,.94,-.18,.10,.22,.10); part(group,box,glass,0,.42,.438,.43,.18,.02,false); break;
    case 3: // offset towers
      part(group,box,mat,-.17,.49,0,.62,.98,.78); part(group,box,mat,.30,.28,.06,.38,.56,.64);
      windows(group,.40,.405,3); part(group,box,roof,-.17,.99,0,.65,.04,.80); break;
    case 4: // slim glass tower
      part(group,box,glass,0,.49,0,.68,.98,.70); part(group,box,trim,0,.14,0,.72,.055,.74);
      part(group,box,trim,0,.51,0,.72,.035,.74); part(group,box,roof,0,.99,0,.72,.04,.74); break;
    case 5: // low terrace and raised middle
      part(group,box,mat,0,.27,0,.98,.54,.90); part(group,box,mat,0,.68,0,.55,.28,.64);
      part(group,box,roof,0,.83,0,.59,.04,.68); windows(group,.75,.459,2); break;
    case 6: // corner apartment with contrasting bands
      part(group,box,mat,0,.48,0,.88,.96,.86); part(group,box,trim,0,.28,0,.92,.035,.90);
      part(group,box,trim,0,.62,0,.92,.035,.90); part(group,box,glass,0,.43,.438,.54,.16,.02,false); part(group,box,roof,0,.97,0,.92,.04,.90); break;
    default: // civic building with roof lantern
      part(group,box,mat,0,.34,0,.96,.68,.88); part(group,roofShape,roof,0,.76,0,.74,.18,.68);
      part(group,box,trim,0,.89,0,.26,.18,.26); part(group,cone,roof,0,1.02,0,.24,.16,.24); windows(group,.70,.449,2);
  }
  return group;
}
export function building(type, color) {
  const key=`${type}:${color}`; if(!buildingCache.has(key)) buildingCache.set(key,makeBuilding(type,color));
  return buildingCache.get(key).clone();
}
function makeTree(type, color) {
  const group=new THREE.Group(), mat=greens[color % greens.length];
  part(group,cylinder,trunk,0,.30,0,.10,.60,.10);
  switch(type) {
    case 0: part(group,cone,mat,0,1.12,0,.60,1.60,.60); break;
    case 1: part(group,sphere,mat,0,1.12,0,.64,.70,.60); break;
    case 2: part(group,cone,mat,0,.94,0,.68,1.05,.68); part(group,cone,mat,0,1.48,0,.47,1.0,.47); break;
    case 3: part(group,sphere,mat,-.24,1.06,0,.46,.50,.46); part(group,sphere,mat,.24,1.06,0,.46,.50,.46); part(group,sphere,mat,0,1.43,0,.47,.50,.47); break;
    case 4: part(group,box,mat,0,1.12,0,.88,.75,.82); part(group,box,mat,.12,1.55,-.04,.56,.30,.56); break;
    case 5: part(group,sphere,blossom,0,1.12,0,.69,.60,.62); part(group,sphere,mat,-.25,.91,.10,.32,.32,.32); break;
    case 6: part(group,cone,mat,0,1.30,0,.38,1.95,.38); break;
    default: part(group,sphere,mat,0,1.16,0,.52,.93,.50); part(group,sphere,mat,.22,.92,0,.40,.44,.42);
  }
  return group;
}
export function tree(type, color) {
  const key=`${type}:${color}`; if(!treeCache.has(key)) treeCache.set(key,makeTree(type,color));
  return treeCache.get(key).clone();
}
