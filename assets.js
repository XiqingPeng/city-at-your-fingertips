import * as THREE from 'three';

// Original modular assets. Buildings use a unit-sized lot with the base at y=0.
const box = new THREE.BoxGeometry();
const cone = new THREE.ConeGeometry(1, 1, 4);
const octagon = new THREE.CylinderGeometry(1, 1, 1, 8);
const tapered = new THREE.CylinderGeometry(.2, 1, 1, 8);
const dome = new THREE.SphereGeometry(1, 8, 6);
const gableProfile = new THREE.Shape();
gableProfile.moveTo(-.5, 0);
gableProfile.lineTo(.5, 0);
gableProfile.lineTo(0, 1);
gableProfile.closePath();
const gable = new THREE.ExtrudeGeometry(gableProfile, { depth: 1, bevelEnabled: false }).translate(0, 0, -.5);

const solid = color => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
function swatch(color, role, index, tone = 0) {
  const material = solid(color);
  material.userData.citySwatch = { role, index, tone };
  return material;
}

export function paintCitySwatch(material, palette) {
  const { role, index, tone } = material.userData.citySwatch;
  const color = material.color.set(palette[role][index]);
  if (tone < 0) color.multiplyScalar(1 + tone);
  if (tone > 0) color.lerp(new THREE.Color('#ffeda9'), tone);
}

export const DEFAULT_CITY_COLORS = {
  building: ['#ffd0a1', '#e99775', '#f8e2b9', '#9cc7ae', '#efab94', '#95bec1', '#e2bd85'],
  roof: ['#d35338', '#ed9d35', '#c34a45', '#367d84', '#ec754c', '#b4414a', '#d79238'],
  green: ['#58a752', '#8bb94d', '#398b53', '#80b76e', '#b0b94f', '#48996b']
};
const walls = DEFAULT_CITY_COLORS.building.map((color, index) => swatch(color, 'building', index));
const roofs = DEFAULT_CITY_COLORS.roof.map((color, index) => swatch(color, 'roof', index));
const greens = DEFAULT_CITY_COLORS.green
  .map((color, index) => [swatch(color, 'green', index, -.43), swatch(color, 'green', index), swatch(color, 'green', index, .34)]);
const blossoms = [
  ['#ad536a', '#e98294', '#ffbcc0'],
  ['#b65f80', '#ec91ae', '#ffd0c8'],
  ['#b36769', '#eb9b88', '#ffcead']
].map(tints => tints.map(solid));
const glass = solid('#45868e');
const trim = solid('#ffe0ad');
const dark = solid('#6c4a54');
const trunk = solid('#89553f');
const roofShade = solid('#944355');
const door = solid('#855447');
const teal = solid('#367e81');
const towerRoof = solid('#566980');
const roofHighlight = solid('#d79c53');
const greenhouseGlass = solid('#77c0aa');
const greenhouseRoof = solid('#318780');
const warmWindow = solid('#ffe0a0');
warmWindow.userData.nightGlow = { color: '#ffac42', intensity: .90 };
const buildingCache = new Map(), treeCache = new Map();

function part(group, geometry, material, x, y, z, sx, sy, sz, shadow = true) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  group.add(mesh);
}

// A relief tile overlaps the wall so the same detail is present in the print.
function relief(group, material, x, y, z, width, height, sideways = false) {
  const depth = .027;
  part(group, box, material, x, y, z, sideways ? depth : width, height, sideways ? width : depth, false);
}

function shutters(group, wall, columns, floors, sides = true) {
  const { x = 0, z = 0, width, depth } = wall;
  for (const direction of [-1, 1]) {
    const face = z + direction * depth / 2;
    for (const offset of columns) {
      for (const y of floors) {
        relief(group, dark, x + offset, y, face + direction*.007, .17, .14);
        relief(group, warmWindow, x + offset, y, face + direction*.018, .087, .093);
      }
    }
    if (!sides) continue;
    for (const y of floors) {
      const face = x + direction * width / 2;
      relief(group, dark, face + direction*.007, y, z + .12, .18, .14, true);
      relief(group, warmWindow, face + direction*.018, y, z + .12, .097, .093, true);
    }
  }
}

function stairRoof(group, roof, x, y, z, width, depth, rise, tiers) {
  part(group, box, roofShade, x, y+.015, z, width, .04, depth);
  for (let step = 0; step < tiers; step++) {
    const inset = step / tiers;
    part(group, box, roof, x, y+(step+.5)*rise, z, width*(1-.84*inset), rise+.006, depth*(1-.17*inset));
  }
}

function towerCap(group, y, width, roof, x = 0, z = 0) {
  part(group, box, roofHighlight, x, y, z, width, .047, width);
  part(group, box, roof, x, y+.039, z, width*.94, .039, width*.94);
}

function makeBuilding(type, color) {
  const group = new THREE.Group();
  const wall = walls[color % walls.length], roof = roofs[color % roofs.length];
  switch (type) {
    case 0: // Market stall with a striped canopy
      part(group, box, wall, 0, .35, 0, .92, .70, .77);
      stairRoof(group, roof, 0, .69, 0, 1.03, .88, .074, 4);
      shutters(group, { width: .92, depth: .77 }, [-.25, .25], [.53]);
      relief(group, door, -.24, .16, .389, .18, .32);
      relief(group, glass, .15, .22, .39, .40, .22);
      for (let i = 0; i < 5; i++) {
        part(group, box, i % 2 ? trim : roof, (i-2)*.15, .378, .441, .15, .049, .146, false);
      }
      break;
    case 1: // Stepped office, darkest shade under each cornice
      part(group, box, wall, 0, .29, 0, .94, .58, .86);
      part(group, box, roof, 0, .566, 0, .98, .055, .90);
      part(group, box, wall, -.08, .728, 0, .67, .28, .65);
      part(group, box, wall, -.12, .916, -.09, .45, .15, .45);
      part(group, box, roofHighlight, -.12, .988, -.09, .50, .06, .50);
      shutters(group, { width: .94, depth: .86 }, [-.28, 0, .28], [.20, .40]);
      shutters(group, { x: -.08, width: .67, depth: .65 }, [-.16, .16], [.75]);
      break;
    case 2: // Loft house with a coral chimney
      part(group, box, wall, 0, .347, 0, .80, .694, .85);
      stairRoof(group, roof, 0, .69, 0, .93, .94, .096, 4);
      part(group, box, roofShade, .23, .99, -.16, .105, .31, .13);
      part(group, box, trim, .23, 1.15, -.16, .15, .047, .16, false);
      shutters(group, { width: .8, depth: .85 }, [-.21, .21], [.28, .50]);
      relief(group, door, 0, .11, .429, .13, .22);
      break;
    case 3: // Offset towers with rooftop terraces
      part(group, box, wall, -.16, .49, 0, .65, .98, .73);
      part(group, box, wall, .29, .28, .06, .42, .56, .60);
      part(group, box, roof, -.16, .98, 0, .71, .075, .78);
      part(group, box, roofHighlight, .29, .56, .06, .47, .067, .64);
      part(group, box, teal, -.26, 1.07, -.08, .25, .15, .35);
      shutters(group, { x: -.16, width: .65, depth: .73 }, [-.17, .17], [.25, .49, .74], false);
      shutters(group, { x: .29, z: .06, width: .42, depth: .60 }, [0], [.25, .42], false);
      break;
    case 4: // Glass tower with a raised corner and gold ribs
      part(group, box, glass, 0, .36, 0, .84, .72, .78);
      part(group, box, glass, -.15, .85, -.06, .51, .26, .57);
      for (const y of [.13, .35, .56, .71]) part(group, box, trim, 0, y, 0, .87, .031, .81);
      for (const x of [-.28, 0, .28]) {
        for (const z of [-.391, .391]) relief(group, teal, x, .42, z, .047, .54);
      }
      towerCap(group, .984, .61, roof, -.15, -.06);
      shutters(group, { x: -.15, z: -.06, width: .51, depth: .57 }, [0], [.86]);
      break;
    case 5: // Shop court and raised central roof
      part(group, box, wall, 0, .255, 0, .94, .51, .88);
      part(group, box, trim, 0, .50, 0, .99, .064, .93);
      part(group, box, wall, 0, .655, -.06, .57, .27, .58);
      part(group, box, roof, 0, .788, -.06, .63, .045, .65);
      part(group, box, roof, 0, .835, -.06, .42, .045, .49);
      shutters(group, { width: .94, depth: .88 }, [-.28, .28], [.25]);
      relief(group, door, 0, .145, .444, .16, .29);
      break;
    case 6: // Corner apartment with a lookout
      part(group, box, wall, 0, .44, 0, .87, .88, .82);
      for (const y of [.33, .60, .88]) part(group, box, trim, 0, y, 0, .93, .049, .88);
      part(group, box, wall, .04, .935, -.14, .49, .14, .45);
      part(group, box, roof, .04, 1.005, -.14, .55, .075, .51);
      shutters(group, { width: .87, depth: .82 }, [-.25, 0, .25], [.21, .48, .73]);
      break;
    case 7: // Civic hall with a gold-capped roof lantern
      part(group, box, wall, 0, .32, 0, .89, .64, .84);
      stairRoof(group, roof, 0, .63, 0, 1.02, .94, .065, 4);
      part(group, box, trim, 0, .94, -.06, .26, .20, .26);
      part(group, cone, roof, 0, 1.09, -.06, .22, .16, .22);
      shutters(group, { width: .89, depth: .84 }, [-.24, .24], [.27, .49]);
      relief(group, door, 0, .16, .426, .20, .32);
      break;
    case 8: // Twin house with two different rooflines
      part(group, box, wall, -.12, .30, 0, .66, .60, .73);
      stairRoof(group, roof, -.12, .60, 0, .76, .85, .093, 4);
      part(group, box, wall, .32, .23, .11, .38, .46, .56);
      part(group, gable, roof, .32, .46, .11, .44, .21, .64);
      shutters(group, { x: -.12, width: .66, depth: .73 }, [-.15, .15], [.23, .41]);
      relief(group, door, .32, .139, .395, .14, .28);
      break;
    case 9: // Octagonal tower and stepped spire
      part(group, octagon, wall, 0, .39, 0, .40, .78, .40);
      part(group, octagon, trim, 0, .747, 0, .47, .09, .47);
      part(group, octagon, roof, 0, .827, 0, .40, .09, .40);
      part(group, octagon, roof, 0, .91, 0, .32, .08, .32);
      part(group, tapered, roof, 0, 1.073, 0, .245, .25, .245);
      part(group, octagon, warmWindow, 0, 1.21, 0, .058, .07, .058, false);
      shutters(group, { width: .79, depth: .79 }, [0], [.26, .51]);
      break;
    case 10: // Tiered neighborhood tower
      part(group, box, wall, 0, .26, 0, .91, .52, .86);
      towerCap(group, .50, .99, roof);
      part(group, box, wall, 0, .66, 0, .64, .25, .61);
      towerCap(group, .79, .74, roof);
      part(group, box, wall, 0, .92, 0, .38, .23, .38);
      part(group, cone, roof, 0, 1.12, 0, .32, .18, .32);
      shutters(group, { width: .91, depth: .86 }, [-.24, .24], [.23, .39]);
      shutters(group, { width: .64, depth: .61 }, [-.14, .14], [.68], false);
      break;
    case 12: { // Canal houses alternate pointed and stepped rooflines
      const facade = .39;
      part(group, box, wall, 0, .365, 0, .82, .73, facade*2);
      if (color % 3 === 0) {
        part(group, box, roofShade, 0, .73, 0, .97, .062, .92);
        part(group, gable, roof, 0, .741, 0, .94, .374, .91);
        for (const side of [-1, 1]) part(group, gable, wall, 0, .741, side*.456, .65, .258, .028, false);
      } else {
        stairRoof(group, roof, 0, .73, 0, .96, .91, color % 3 === 1 ? .096 : .077, 4);
      }
      part(group, box, trim, 0, .694, 0, .87, .038, .823);
      part(group, box, roofShade, color % 2 ? -.21 : .21, .95, -.15, .11, .31, .12);
      shutters(group, { width: .82, depth: facade*2 }, [-.23, .23], [.24, .45, .601]);
      for (const side of [-1, 1]) {
        relief(group, door, 0, .12, side*(facade+.005), .145, .24);
        relief(group, teal, 0, .237, side*(facade+.013), .215, .041);
        for (const x of [-.23, .23]) relief(group, trim, x, .379, side*(facade+.01), .20, .023);
      }
      break;
    }
    case 13: // Lantern Heights bell tower
      part(group, box, wall, 0, .30, 0, .90, .60, .84);
      part(group, box, dark, 0, .042, 0, .98, .084, .92);
      shutters(group, { width: .90, depth: .84 }, [-.25, 0, .25], [.16, .35, .50]);
      towerCap(group, .58, .99, roof);
      part(group, box, wall, 0, .771, 0, .68, .34, .65);
      shutters(group, { width: .68, depth: .65 }, [-.17, .17], [.73, .866]);
      towerCap(group, .93, .77, roof);
      part(group, octagon, dark, 0, 1.08, 0, .31, .26, .31);
      part(group, octagon, warmWindow, 0, 1.10, 0, .314, .13, .314, false);
      part(group, octagon, trim, 0, 1.212, 0, .33, .062, .33);
      part(group, tapered, towerRoof, 0, 1.398, 0, .36, .333, .36);
      part(group, box, warmWindow, 0, 1.576, 0, .088, .07, .088, false);
      break;
    case 14: // Three square pavilions and a contrasting spire
      part(group, box, wall, 0, .245, 0, .88, .49, .84);
      shutters(group, { width: .88, depth: .84 }, [-.23, 0, .23], [.18, .35]);
      towerCap(group, .47, 1.04, roof);
      part(group, box, wall, 0, .627, 0, .68, .265, .65);
      shutters(group, { width: .68, depth: .65 }, [-.16, .16], [.63]);
      towerCap(group, .741, .84, roof);
      part(group, box, wall, 0, .868, 0, .49, .213, .48);
      shutters(group, { width: .49, depth: .48 }, [0], [.88]);
      towerCap(group, .964, .64, roof);
      part(group, cone, towerRoof, 0, 1.10, 0, .42, .23, .42);
      part(group, box, warmWindow, 0, 1.226, 0, .10, .07, .10, false);
      break;
    case 15: // Glasshouse with faceted dome and low wings
      part(group, box, trim, 0, .045, 0, .98, .09, .82);
      part(group, box, greenhouseGlass, 0, .27, 0, .98, .38, .69);
      part(group, box, greenhouseRoof, 0, .47, 0, 1.02, .06, .77);
      part(group, gable, greenhouseGlass, -.32, .50, 0, .35, .19, .76);
      part(group, gable, greenhouseGlass, .32, .50, 0, .35, .19, .76);
      part(group, octagon, greenhouseRoof, 0, .54, 0, .255, .16, .43);
      part(group, dome, greenhouseGlass, 0, .605, 0, .25, .26, .40);
      part(group, box, trim, 0, .872, 0, .065, .064, .074, false);
      for (const side of [-1, 1]) {
        for (const x of [-.46, -.30, -.14, .14, .30, .46]) {
          relief(group, trim, x, .286, side*.348, .021, .353);
        }
        relief(group, dark, 0, .212, side*.35, .153, .24);
        relief(group, warmWindow, 0, .244, side*.361, .106, .118);
      }
      break;
    default: // Domed civic hall with two low wings
      part(group, box, wall, 0, .32, 0, .67, .64, .74);
      for (const x of [-.36, .36]) {
        part(group, box, wall, x, .205, 0, .31, .41, .65);
        part(group, box, roof, x, .42, 0, .33, .06, .69);
      }
      part(group, octagon, trim, 0, .65, 0, .42, .10, .42);
      part(group, dome, roof, 0, .70, 0, .41, .36, .41);
      shutters(group, { width: .67, depth: .74 }, [-.16, .16], [.24, .47], false);
      break;
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
  const key = `${type}:${color}`;
  if (!buildingCache.has(key)) buildingCache.set(key, compactParts(makeBuilding(type, color)));
  return buildingCache.get(key).clone();
}

// Clusters describe the low shadow, middle canopy and sun-facing pixels.
const crowns = [
  // Bunched roundleaf
  [[-.28,.93,.06,.58,.46,.58,0],[.27,.99,.02,.54,.50,.62,0],[-.11,1.17,.02,.72,.59,.76,1],[.30,1.28,-.12,.47,.33,.45,1],[-.24,1.44,.19,.45,.28,.39,2],[.07,1.55,-.11,.46,.22,.38,2]],
  // Low spreading tree
  [[-.32,.87,0,.63,.43,.70,0],[.35,.93,.06,.65,.41,.57,0],[.02,1.15,-.08,.90,.42,.79,1],[-.38,1.22,.12,.56,.40,.51,1],[.31,1.30,-.20,.53,.33,.51,2],[-.12,1.45,.14,.50,.19,.43,2]],
  // Layered fir
  [[0,.68,0,.90,.26,.85,0],[0,.89,0,.75,.24,.71,1],[0,1.09,0,.61,.21,.56,0],[0,1.28,0,.50,.24,.44,1],[0,1.49,0,.35,.22,.32,1],[-.02,1.68,0,.20,.23,.21,2]],
  // Two crowns sharing a trunk
  [[-.31,.86,.09,.58,.47,.54,0],[.28,1.10,-.07,.55,.62,.58,0],[-.29,1.14,.10,.66,.43,.63,1],[.26,1.43,-.07,.57,.50,.57,1],[-.43,1.39,.17,.40,.23,.39,2],[.18,1.67,-.14,.34,.25,.37,2]],
  // Tall squareleaf
  [[-.03,.79,.08,.67,.46,.57,0],[.17,1.06,-.05,.64,.57,.64,1],[-.22,1.24,.03,.55,.47,.54,1],[.08,1.50,-.06,.58,.32,.52,1],[-.17,1.60,.11,.44,.30,.42,2],[.13,1.75,-.11,.32,.19,.34,2]],
  // Blossoms with an open notch for sunlight
  [[-.27,.87,.05,.65,.46,.59,0],[.30,.94,-.10,.58,.51,.66,0],[-.16,1.24,-.02,.82,.42,.68,1],[.38,1.24,-.04,.49,.40,.52,1],[-.31,1.49,.15,.47,.30,.49,2],[.26,1.49,-.19,.40,.19,.43,2]],
  // Columnar cypress
  [[0,.77,0,.56,.52,.51,0],[-.05,1.10,.01,.57,.45,.53,1],[.04,1.41,0,.46,.39,.46,1],[-.02,1.68,0,.34,.36,.35,1],[-.035,1.93,.025,.20,.24,.21,2]],
  // Terraced shrub
  [[-.19,.173,.07,.44,.35,.48,0],[.22,.28,0,.48,.43,.50,1],[0,.41,-.02,.54,.43,.62,1],[-.16,.55,.08,.34,.18,.32,2],[.15,.60,-.12,.33,.18,.30,2]]
];

function makeTree(type, color) {
  const group = new THREE.Group();
  const palette = type === 5 ? blossoms[color % blossoms.length] : greens[color % greens.length];
  if (type !== 7) {
    part(group, box, trunk, 0, .38, 0, .17, .76, .17);
    part(group, box, trunk, -.085, .65, .02, .27, .15, .12);
  }
  for (const [x, y, z, width, height, depth, tone] of crowns[type] ?? crowns[0]) {
    part(group, box, palette[tone], x, y, z, width, height, depth);
  }
  return group;
}

export function tree(type, color) {
  const key = `${type}:${color}`;
  if (!treeCache.has(key)) treeCache.set(key, compactParts(makeTree(type, color)));
  return treeCache.get(key).clone();
}
