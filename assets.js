import * as THREE from 'three';

// Original modular assets. Geometry and materials are shared between copies.
// Buildings occupy a roughly unit-sized lot with the base at y=0.
const box = new THREE.BoxGeometry(1, 1, 1);
const cone = new THREE.ConeGeometry(1, 1, 4);
const sphere = new THREE.BoxGeometry(1.4, 1.4, 1.4);
const cylinder = new THREE.BoxGeometry(1, 1, 1);
const roofShape = new THREE.BoxGeometry(1, 1, 1);
const octagon = new THREE.CylinderGeometry(1, 1, 1, 8);
const tapered = new THREE.CylinderGeometry(.2, 1, 1, 8);
const dome = new THREE.SphereGeometry(1, 8, 6);
const gableProfile = new THREE.Shape();gableProfile.moveTo(-.5,0);gableProfile.lineTo(.5,0);gableProfile.lineTo(0,1);gableProfile.closePath();
const gable = new THREE.ExtrudeGeometry(gableProfile,{depth:1,bevelEnabled:false});gable.translate(0,0,-.5);
const walls = ['#e6c9a7','#c7b7a1','#e2d5bf','#b2c2af','#dba995','#aebec0','#d9c3a3'].map(color => new THREE.MeshStandardMaterial({color}));
const greens = ['#6b9c78','#83a985','#548467','#a1b989','#b0a76a','#779b6d'].map(color => new THREE.MeshStandardMaterial({color}));
const roofs = ['#a84924','#745025','#c56c24','#3c6341'].map(color => new THREE.MeshStandardMaterial({color}));
const glass = new THREE.MeshStandardMaterial({color:'#315b54', roughness:1});
const trim = new THREE.MeshStandardMaterial({color:'#e8dfc9'});
const dark = new THREE.MeshStandardMaterial({color:'#7d7163'});
const trunk = new THREE.MeshStandardMaterial({color:'#82705a'});
const blossom = new THREE.MeshStandardMaterial({color:'#dca6a4'});
const leafLight = new THREE.MeshStandardMaterial({color:'#b0c68a'});
const warmWindow = new THREE.MeshStandardMaterial({color:'#e6ca8e'});
const door = new THREE.MeshStandardMaterial({color:'#805b4b'});
const canalRoofs = ['#b64c34','#276970','#30496c','#8b5839'].map(color => new THREE.MeshStandardMaterial({color}));
const towerRoof = new THREE.MeshStandardMaterial({color:'#463f63'});
const roofHighlight = new THREE.MeshStandardMaterial({color:'#6e6887'});
const greenhouseGlass = new THREE.MeshStandardMaterial({color:'#58adab', roughness:1});
const greenhouseRoof = new THREE.MeshStandardMaterial({color:'#297c7c', roughness:1});
const buildingCache = new Map(), treeCache = new Map();
function part(group, geometry, material, x, y, z, sx, sy, sz, shadow=true) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz); mesh.castShadow=shadow; mesh.receiveShadow=true; group.add(mesh);
}
function windows(group, width, z, count=3) {
  for(let i=0;i<count;i++) part(group,box,glass,0,.25+i*.19,z,width,.065,.018,false);
}
function faceWindows(group, xs, ys, front, width, height) {
  for (const y of ys) {
    for (const x of xs) {
      for (const side of [-1, 1]) {
        part(group,box,dark,x,y,front*side,width+.035,height+.035,.024,false);
        part(group,box,warmWindow,x,y,(front+.013)*side,width,height,.016,false);
      }
    }
  }
}
function towerCap(group, y, width) {
  part(group,box,roofHighlight,0,y,0,width,.045,width);
  part(group,box,towerRoof,0,y+.033,0,width*.94,.04,width*.94);
}
function makeBuilding(type, color) {
  const group=new THREE.Group(), mat=walls[color % walls.length], roof=roofs[color % roofs.length];
  switch(type) {
    case 0: // shopfront with a pitched roof
      part(group,box,mat,0,.37,0,.92,.74,.82); part(group,roofShape,roof,0,.79,0,1,.13,.90); part(group,roofShape,roof,0,.88,0,.78,.10,.70); part(group,roofShape,roof,0,.96,0,.52,.08,.48);
      part(group,box,glass,0,.32,.418,.55,.19,.02,false); part(group,box,trim,0,.52,.43,.68,.055,.07,false); break;
    case 1: // stepped office
      part(group,box,mat,0,.35,0,.94,.70,.90); part(group,box,mat,0,.83,0,.64,.26,.64);
      windows(group,.65,.459,3); part(group,box,roof,0,.97,0,.68,.035,.68); break;
    case 2: // townhouse with chimney
      part(group,box,mat,0,.38,0,.78,.76,.86); part(group,roofShape,roof,0,.80,0,.90,.13,.96); part(group,roofShape,roof,0,.89,0,.68,.10,.72); part(group,roofShape,roof,0,.97,0,.42,.08,.48);
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
    case 7: // civic building with roof lantern
      part(group,box,mat,0,.34,0,.96,.68,.88); part(group,roofShape,roof,0,.72,0,1,.10,.94); part(group,roofShape,roof,0,.80,0,.72,.10,.70);
      part(group,box,trim,0,.89,0,.26,.18,.26); part(group,cone,roof,0,1.02,0,.24,.16,.24); windows(group,.70,.449,2); break;
    case 8: // gabled house with an offset wing
      part(group,box,mat,-.10,.32,0,.72,.64,.76); part(group,gable,roof,-.10,.64,0,.84,.36,.88);
      part(group,box,mat,.37,.23,.08,.32,.46,.56);part(group,gable,roof,.37,.46,.08,.40,.22,.64);break;
    case 9: // eight-sided tower with a tapered spire
      part(group,octagon,mat,0,.42,0,.42,.84,.42);part(group,octagon,trim,0,.82,0,.47,.08,.47);
      part(group,tapered,roof,0,1.04,0,.43,.40,.43);part(group,box,warmWindow,0,.50,.43,.12,.18,.025,false);break;
    case 10: // tiered skyline tower
      part(group,box,mat,0,.26,0,.96,.52,.86);part(group,box,roof,0,.53,0,1.02,.08,.92);
      part(group,box,mat,0,.68,0,.66,.26,.62);part(group,box,roof,0,.82,0,.73,.08,.68);
      part(group,box,mat,0,.93,0,.36,.18,.36);part(group,cone,roof,0,1.10,0,.34,.22,.34);break;
    case 12: { // narrow gabled house with windows on both banks
      const canalRoof = canalRoofs[color % canalRoofs.length];
      part(group,box,mat,0,.38,0,.82,.76,.87);
      part(group,box,trim,0,.75,0,.91,.034,.96);
      part(group,gable,canalRoof,0,.765,0,.96,.39,1);
      part(group,gable,mat,0,.769,.501,.65,.25,.042);
      part(group,box,dark,.23,1,-.22,.11,.22,.13);
      part(group,box,door,0,.135,.444,.14,.27,.029,false);
      faceWindows(group,[-.21,.21],[.24,.47,.63],.445,.095,.082);
      part(group,box,warmWindow,0,.865,.526,.09,.082,.027,false);
      break;
    }
    case 13: // Lantern Heights bell tower
      part(group,box,mat,0,.30,0,.90,.60,.84);
      part(group,box,dark,0,.042,0,.98,.084,.92);
      faceWindows(group,[-.26,0,.26],[.16,.30,.45],.429,.14,.064);
      for (const side of [-1,1]) {
        for (const z of [-.23,.23]) {
          part(group,box,dark,side*.455,.33,z,.024,.19,.16,false);
          part(group,box,warmWindow,side*.469,.34,z,.018,.116,.095,false);
        }
      }
      towerCap(group,.58,.99);
      part(group,box,mat,0,.76,0,.68,.31,.65);
      faceWindows(group,[-.18,.18],[.70,.84],.334,.106,.09);
      towerCap(group,.91,.77);
      part(group,octagon,dark,0,1.07,0,.31,.26,.31);
      part(group,octagon,warmWindow,0,1.09,0,.312,.11,.312,false);
      part(group,octagon,trim,0,1.205,0,.33,.052,.33);
      part(group,tapered,towerRoof,0,1.38,0,.36,.333,.36);
      part(group,box,warmWindow,0,1.58,0,.09,.073,.09,false);
      break;
    case 14: // tiered spire with projecting eaves
      part(group,box,mat,0,.245,0,.88,.49,.84);
      faceWindows(group,[-.23,0,.23],[.18,.35],.429,.13,.078);
      towerCap(group,.47,1.04);
      part(group,box,mat,0,.615,0,.68,.243,.65);
      faceWindows(group,[-.17,.17],[.62],.334,.14,.112);
      towerCap(group,.733,.84);
      part(group,box,mat,0,.862,0,.49,.203,.48);
      faceWindows(group,[0],[.862],.249,.15,.115);
      towerCap(group,.958,.64);
      part(group,cone,towerRoof,0,1.09,0,.42,.23,.42);
      part(group,box,warmWindow,0,1.24,0,.10,.067,.10,false);
      break;
    case 15: // glasshouse with a faceted dome and low wings
      part(group,box,trim,0,.045,0,.98,.09,.82);
      part(group,box,greenhouseGlass,0,.27,0,.98,.38,.69);
      part(group,box,greenhouseRoof,0,.47,0,1.02,.06,.77);
      part(group,gable,greenhouseGlass,-.32,.50,0,.35,.19,.76);
      part(group,gable,greenhouseGlass,.32,.50,0,.35,.19,.76);
      part(group,octagon,greenhouseRoof,0,.52,0,.255,.16,.43);
      part(group,dome,greenhouseGlass,0,.605,0,.25,.26,.40);
      part(group,box,trim,0,.875,0,.055,.056,.064,false);
      for (const x of [-.46,-.30,-.14,.14,.30,.46]) {
        for (const side of [-1,1]) {
          part(group,box,trim,x,.286,side*.351,.021,.338,.021,false);
          part(group,box,warmWindow,x+.046,.256,side*.354,.043,.104,.018,false);
        }
      }
      part(group,box,dark,0,.219,.349,.15,.25,.025,false);
      part(group,box,warmWindow,0,.258,.364,.12,.143,.018,false);
      break;
    default: // domed civic hall with two low wings
      part(group,box,mat,0,.32,0,.66,.64,.70);part(group,box,mat,-.40,.20,0,.30,.40,.64);part(group,box,mat,.40,.20,0,.30,.40,.64);
      part(group,octagon,trim,0,.65,0,.40,.10,.40);part(group,dome,roof,0,.70,0,.39,.36,.39);part(group,box,warmWindow,0,.39,.36,.13,.16,.02,false);break;
  }
  // A small entrance and window highlights make the town readable at a distance.
  // Keep the tower unobstructed and use shared low-poly meshes for every copy.
  if (type === 0 || type === 2 || type === 5 || type === 7) {
    const front = type === 0 ? .42 : type === 2 ? .44 : .46;
    part(group,box,door,-.22,.12,front,.13,.24,.025,false);
    part(group,box,warmWindow,.23,.38,front,.12,.13,.025,false);
    part(group,box,trim,.23,.38,front+.014,.025,.13,.012,false);
  }
  if (type === 0 || type === 2) {
    part(group,box,trim,0,.73,0,.98,.035,.94,false);
    part(group,box,roof,0,.91,0,.38,.045,.38,false);
  }
  // Small square window tiles and a blocky sill read like pixel art at city scale.
  if (type < 11 && type !== 4 && type !== 9) {
    const front = type === 0 ? .425 : type === 2 ? .445 : type === 3 ? .401 : type === 6 ? .435 : type === 8 ? .39 : .455;
    for (const x of [-.23, 0, .23]) {
      for (const y of [.28, .48, .68]) {
        part(group,box,dark,x,y,front,.15,.13,.025,false);
        part(group,box,warmWindow,x,y,front+.016,.085,.075,.01,false);
      }
    }
  }
  return group;
}
// Bake the parts of a model into one mesh per material and shadow flag. Each
// solid's vertex boundary remains available to the 3MF exporter.
export function compactParts(source) {
  source.updateMatrixWorld(true);
  const batches = new Map();
  source.traverse(object => {
    if (!object.isMesh) return;
    if (!batches.has(object.material)) batches.set(object.material, [[], []]);
    batches.get(object.material)[Number(object.castShadow)].push(object);
  });

  const compact = new THREE.Group();
  const normalMatrix = new THREE.Matrix3();
  const v = new THREE.Vector3();
  for (const [material, shadowBatches] of batches) {
    for (const [shadow, meshes] of shadowBatches.entries()) {
      if (!meshes.length) continue;

      const vertexCount = meshes.reduce((sum, mesh) => sum + mesh.geometry.attributes.position.count, 0);
      const indexCount = meshes.reduce((sum, mesh) => {
        return sum + (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count);
      }, 0);
      const positions = new Float32Array(3 * vertexCount);
      const normals = new Float32Array(3 * vertexCount);
      const indices = vertexCount > 65536 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
      const solidVertexEnds = [];
      let vertexOffset = 0;
      let indexOffset = 0;
      for (const mesh of meshes) {
        const {position, normal} = mesh.geometry.attributes;
        const index = mesh.geometry.index;
        normalMatrix.getNormalMatrix(mesh.matrixWorld);
        for (let i = 0; i < position.count; i++) {
          v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).toArray(positions, 3 * (vertexOffset + i));
          v.fromBufferAttribute(normal, i).applyNormalMatrix(normalMatrix).toArray(normals, 3 * (vertexOffset + i));
        }
        const count = index?.count ?? position.count;
        for (let i = 0; i < count; i++) {
          indices[indexOffset++] = vertexOffset + (index ? index.getX(i) : i);
        }
        const sourceEnds = mesh.geometry.userData.solidVertexEnds ?? [position.count];
        for (const end of sourceEnds) solidVertexEnds.push(vertexOffset + end);
        vertexOffset += position.count;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      geometry.userData.solidVertexEnds = solidVertexEnds;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = Boolean(shadow);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      compact.add(mesh);
    }
  }
  return compact;
}

export function lanternMaterial() {
  return warmWindow;
}

export function building(type, color) {
  const key=`${type}:${color}`; if(!buildingCache.has(key)) buildingCache.set(key,compactParts(makeBuilding(type,color)));
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
  // Blocky leaf clusters give trees a layered silhouette and color variation.
  if (type !== 6) {
    const accent = type === 5 ? blossom : leafLight;
    part(group,box,accent,-.30,1.24,.24,.27,.24,.27,false);
    part(group,box,accent,.26,1.42,-.12,.25,.22,.24,false);
  }
  return group;
}
export function tree(type, color) {
  const key=`${type}:${color}`; if(!treeCache.has(key)) treeCache.set(key,compactParts(makeTree(type,color)));
  return treeCache.get(key).clone();
}
