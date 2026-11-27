import * as THREE from 'three';
import { building, tree, compactParts, lanternMaterial } from './assets.js';

export const TOUR_STOPS = [
  {
    id: 'canal-quarter',
    name: 'Canal Quarter',
    description: 'Gabled rowhouses and little bridges line a winding turquoise canal.'
  },
  {
    id: 'lantern-heights',
    name: 'Lantern Heights',
    description: 'Lit spires rise above stepped terraces and a broad stair.'
  },
  {
    id: 'orchard-commons',
    name: 'Orchard Commons',
    description: 'Pink blossom trees and a glasshouse sit inside an octagonal park walk.'
  }
];

const BASE_SIZE = 54;
const BASE_EDGE = BASE_SIZE / 2;
const INITIAL = { height: .45, density: .82, forest: .19 };
const box = new THREE.BoxGeometry(1, 1, 1);
const octagon = new THREE.CylinderGeometry(.5, .5, 1, 8);
const solid = color => new THREE.MeshStandardMaterial({ color, roughness: 1 });
const stone = solid('#edca9f');
const timber = solid('#aa654c');
const iron = solid('#6e505a');
const water = solid('#2b96b1');
const deepWater = solid('#257c9e');
const ripple = solid('#9adbd0');
const terrace = solid('#b87963');
const bench = solid('#926047');
const park = solid('#78a15c');
const orchard = solid('#9cbb75');
const soil = solid('#719958');
const parkPath = solid('#eacba4');
const flowers = solid('#e795a2');
const marigold = solid('#f1b550');
const earth = solid('#b78763');
const subsoil = solid('#946750');
const lantern = lanternMaterial();

function block(group, material, x, y, z, width, height, depth, { angle = 0, shadow = false, geometry = box } = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(width, height, depth);
  mesh.rotation.y = angle;
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  group.add(mesh);
}

function path(group, material, points, width, y = .05, height = .1) {
  for (let i = 1; i < points.length; i++) {
    const [[x0, z0], [x1, z1]] = [points[i-1], points[i]];
    const angle = -Math.atan2(z1 - z0, x1 - x0);
    block(group, material, (x0+x1)/2, y, (z0+z1)/2, Math.hypot(x1-x0, z1-z0), height, width, { angle });
    if (i < points.length - 1) block(group, material, x1, y, z1, width, height, width);
  }
}

function randomSource(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function plot(district, lot) {
  const {
    x, z, y = .01, type = 2, width = 2.4, depth = 2.4, minHeight = 1.4, heightRange = 3,
    angle = 0, anchor = false, color = Math.floor(district.random()*7),
    treeType = Math.floor(district.random()*8)
  } = lot;
  const house = building(type, color);
  house.position.set(x, y, z);
  house.rotation.y = angle;
  district.group.add(house);
  const plant = anchor ? null : plantTree(district, x, y, z, treeType);
  district.plots.push({
    house, plant, width, depth, minHeight, heightRange,
    rank: district.random(), forestRank: district.random(), treeSize: .92 + district.random()*.55,
    houseAmount: 0, treeAmount: 0
  });
}

function plantTree(district, x, y, z, type, scale = 1, fixed = false) {
  const plant = tree(type, Math.floor(district.random()*6));
  plant.position.set(x, y, z);
  plant.scale.setScalar(scale);
  plant.rotation.y = Math.floor(district.random()*4) * Math.PI/2;
  (fixed ? district.detail : district.group).add(plant);
  return plant;
}

function plantedBed(district, x, y, z, width, depth, trees) {
  const { detail } = district;
  block(detail, stone, x, y+.04, z, width, .10, depth);
  block(detail, soil, x, y+.093, z, width-.20, .04, depth-.20);
  for (const [dx, dz, type, size] of trees) {
    plantTree(district, x+dx, y+.11, z+dz, type, size, true);
  }
}

function streetlight(group, x, y, z) {
  block(group, iron, x, y+.41, z, .10, .82, .10);
  block(group, lantern, x, y+.89, z, .26, .21, .26);
  block(group, iron, x, y+1.02, z, .32, .08, .32);
}

function bridge(group, x, z) {
  block(group, timber, x, .59, z, 8.88, .29, 1.78, { shadow: true });
  block(group, stone, x, .75, z, 8.9, .10, 1.83);
  for (const side of [-1, 1]) {
    // The stone shoulders step inward as they approach the deck.
    for (const [offset, height, bottom] of [[3.58,.66,0], [2.86,.51,.17], [2.15,.30,.36], [1.42,.12,.55]]) {
      block(group, terrace, x+side*offset, bottom+height/2, z, .77, height, 1.55, { shadow: true });
    }
    for (let step = 0; step < 3; step++) {
      const height = .68 - step*.185;
      block(group, stone, x+side*(4.48+step*.38), height/2, z, .47, height, 1.78, { shadow: true });
    }
    for (const along of [-4.0, -2.05, 0, 2.05, 4.0]) {
      block(group, timber, x+along, 1.0, z+side*.79, .19, .49, .19, { shadow: true });
    }
    block(group, stone, x, 1.26, z+side*.79, 8.45, .14, .18, { shadow: true });
  }
}

function buildCanal(district, roadMat) {
  const { detail, random } = district;
  // Each bend shifts the full channel, towpath and quay together.
  const reaches = [
    { x: -4, from: BASE_EDGE, to: 5 },
    { x: -1, from: 5, to: -3 },
    { x: 2.5, from: -3, to: -9 },
    { x: 6, from: -9, to: -BASE_EDGE }
  ];
  const canalCenter = z => reaches.find(reach => z <= reach.from && z >= reach.to).x;
  for (const {x, from, to} of reaches) {
    block(detail, water, x, .04, (from+to)/2, 8, .08, from-to);
    block(detail, deepWater, x+1.4, .086, (from+to)/2, .94, .016, from-to);
    for (let z = to+.55; z < from-.45; z += .66 + random()*1.13) {
      const width = .4 + random()*2.0;
      const offset = (random()-.5)*5.6;
      block(detail, ripple, x+offset, .10, z, width, .015, .08 + random()*.11);
    }
  }
  for (const side of [-1, 1]) {
    const bank = reaches.flatMap(({x,from,to}) => [[x+side*4,from],[x+side*4,to]]);
    path(detail, stone, bank, .38, .113, .20);
    path(detail, roadMat, bank.map(([x,z]) => [x+side*.81,z]), 1.28, .056, .114);

    const nearRow = [18.4, 15.2, 7.3, 2.45, -.4, -5.6, -7.6, -11.0, -16.4, -19.25];
    nearRow.forEach((z, i) => {
      const x = canalCenter(z) + side*6.42;
      plot(district, {
        x, z, type: 12, width: 2.6, depth: 2.45, angle: -side*Math.PI/2, anchor: i % 4 === 0,
        color: side > 0 ? (i+2)%7 : i%7,
        minHeight: 2.10 + random()*.75, heightRange: 2.3
      });
    });
    const backRow = [17.7, 13.9, 10.2, 6.9, 3.35, -.15, -4.35, -7.65, -11.3, -15.65, -18.9];
    for (const z of backRow) {
      const x = canalCenter(z) + side*(10.0+random()*.9);
      plot(district, { x, z, angle: -side*Math.PI/2, type: random()<.7?12:8, width: 2.8, depth: 2.8, minHeight: 1.65, heightRange: 2.15 });
    }
    for (const z of [19.2, 11.55, 3.25, -1.55, -7.1, -13.4, -18.1]) {
      streetlight(detail, canalCenter(z)+side*4.55, .13, z);
    }
  }

  for (const z of [11.55, -13.4]) {
    const x = canalCenter(z);
    bridge(detail, x, z);
    path(detail, roadMat, [[-BASE_EDGE,z],[x-5.25,z]], 1.72);
    path(detail, roadMat, [[x+5.25,z],[BASE_EDGE,z]], 1.72);
  }
  for (const [x,z,color] of [[-5.8,16.8,timber], [-.4,1.8,iron], [4.1,-17.3,timber]]) {
    block(detail, color, x, .22, z, .82, .26, 2.0, { shadow: true });
    block(detail, stone, x, .46, z-.16, .56, .27, .75, { shadow: true });
    block(detail, color, x, .62, z-.16, .66, .10, .88);
  }
  // Secondary streets and planted courts sit back from the towpath.
  path(detail, roadMat, [[-18.5,11.55],[-18.5,6.1],[-16.45,6.1]], 1.01);
  path(detail, roadMat, [[-14.25,-13.4],[-14.25,-5.75]], 1.12);
  path(detail, roadMat, [[12.5,11.55],[12.5,4.1],[17.3,4.1]], 1.22);
  path(detail, roadMat, [[15.8,11.55],[15.8,19.45]], 1.04);

  block(detail, parkPath, 12.5, .058, 7.05, 5.1, .12, 5.3);
  plot(district, {
    x: 12.5, y: .119, z: 7.05, type: 13, width: 4.2, depth: 3.9, minHeight: 3.95, heightRange: 3.7, color: 4, anchor: true
  });
  for (const [x,z,type,angle] of [[17.9,19.1,0,-Math.PI/2],[12.25,17.35,8,Math.PI/2],[17.9,14.8,6,-Math.PI/2],
    [11.1,1.2,0,Math.PI],[13.4,-3.25,5,-Math.PI/2],[-16.5,-5.7,2,Math.PI/2],[-16.55,-9.4,0,Math.PI/2],
    [-11.8,-10.1,8,-Math.PI/2],[-11.8,-6.5,2,-Math.PI/2],[-17.6,-19.1,0,0]]) {
    plot(district, { x, z, type, angle, width: 2.6, depth: 2.6, minHeight: 1.65, heightRange: 2.15 });
  }
  plantedBed(district, -18.5, 0, 4.1, 4.3, 2.45, [[-1.15,-.33,1,1.34],[.59,.23,0,1.09],[1.34,-.40,7,.85]]);
  plantedBed(district, 17.55, 0, 1.05, 4.8, 4.2, [[-1.07,-.75,3,1.45],[1.07,.49,4,1.52],[-.55,1.12,1,1.05]]);
  plantedBed(district, -14.25, 0, -16.8, 4.9, 3.3, [[-1.45,.43,3,1.20],[.22,-.46,1,1.38],[1.42,.56,0,1.1]]);
  plantedBed(district, -17.9, 0, 17.3, 4.65, 4.8, [[-1.22,.8,1,1.55],[.83,-.85,4,1.44],[1.33,1.28,7,1.06],[-.71,-1.2,2,1.09]]);
  plantedBed(district, 18.5, 0, -8.2, 3.35, 2.6, [[.55,-.45,2,1.29],[-.65,.38,7,1.05]]);
  for (const [x,z] of [[-18.5,6.1],[12.5,5.15],[-14.25,-8.1],[15.8,14.1],[17.3,4.1]]) streetlight(detail, x, .075, z);
}

function buildHeights(district, roadMat) {
  const { detail, random } = district;
  // The terraces narrow as they climb, leaving an open arrival plaza.
  for (const [x,z,width,depth,rise] of [[-4,-2.5,23,19,.54],[-5,-4.6,18,14,1.02],[-6.1,-6.9,9.3,8.7,1.55]]) {
    block(detail, terrace, x, rise/2, z, width, rise, depth, { shadow: true });
    block(detail, stone, x, rise+.025, z, width+.22, .14, depth+.22);
  }
  path(detail, roadMat, [[-1.65,BASE_EDGE],[-1.65,11.7],[10.9,11.7],[BASE_EDGE,11.7]], 2.12);
  path(detail, roadMat, [[-BASE_EDGE,11.7],[-1.65,11.7],[-1.65,8]], 2.12);
  path(detail, roadMat, [[12.45,11.7],[12.45,-1.8],[9,-5.25],[9,-BASE_EDGE]], 1.25);
  block(detail, roadMat, -2.4, .055, 10.3, 10.2, .11, 6.15);
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 3; j++) {
      block(detail, stone, -6.2+i*1.9, .119, 8.2+j*1.9, .91, .025, .91);
    }
  }
  for (let i = 0; i < 8; i++) {
    const rise = (i+1)*.133;
    block(detail, stone, -2.4, rise/2, 7.55-i*.51, 4.4, rise, .58, { shadow: true });
  }

  const towers = [
    { x: -6.1, z: -6.7, y: 1.645, type: 13, width: 5.5, depth: 5.1, minHeight: 5.5, heightRange: 8.5, color: 2 },
    { x: -11.1, z: -2.6, y: 1.115, type: 14, width: 4.2, depth: 4.05, minHeight: 4.05, heightRange: 7.0, color: 1 },
    { x: 1.85, z: -5.9, y: 1.115, type: 14, width: 4.2, depth: 4.1, minHeight: 4.55, heightRange: 7.25, color: 4 },
    { x: 4.8, z: 1.5, y: .635, type: 9, width: 2.65, depth: 2.65, minHeight: 3.7, heightRange: 7.4, color: 0 },
    { x: -9.6, z: 3.4, y: .635, type: 14, width: 3.25, depth: 3.15, minHeight: 2.8, heightRange: 5.5, color: 5 }
  ];
  for (const t of towers) plot(district, { ...t, anchor: true, angle: Math.PI/8 });
  for (const [x,z,y] of [[-5.2,7,0],[.35,7,0],[-5.2,3.45,.63],[.35,3.45,.63],[-4.8,-2.6,1.12],[.45,-2.6,1.12],[-9.5,12.8,0],[5.25,12.8,0]]) {
    streetlight(detail, x, y, z);
  }
  for (const x of [-17.6,-13.85,-9.9,5.4,9.3,13.3,17.0]) {
    for (const z of [15.65, 18.9, -16.4, -19.0]) {
      plot(district, {
        x, z, type: random()<.55?10:7, width: 2.9, minHeight: 1.5 + random()*.65, heightRange: 3.25,
        angle: z > 0 ? Math.PI : 0, treeType: 2
      });
    }
  }
  for (const [x,z] of [[-18.15,-12.7],[-18.05,-7.9],[-18.1,-3.45],[-18.0,1.75],[-18.05,6.8],[16.6,-12.1],[16.35,-7.5],[16.0,-3.05],[16.15,1.7],[16.15,6.6],[9.1,5.9]]) {
    plot(district, { x, z, type: random()<.6?14:9, width: 2.6, minHeight: 2.55, heightRange: 4.45, treeType: 2 });
  }
  plantedBed(district, -13.45, .635, 5.5, 3.2, 2.5, [[-.97,.42,2,1.38],[.44,-.38,6,1.27],[.98,.40,7,.77]]);
  plantedBed(district, 5.95, .635, -2.64, 2.78, 3.32, [[-.45,-.78,6,1.29],[.52,.4,2,1.33],[-.42,1.02,7,.78]]);
  plantedBed(district, -11.8, 0, 9.8, 4.1, 1.66, [[-1.08,.14,6,1.28],[.45,-.19,4,1.28],[1.35,.20,7,.75]]);
  plantedBed(district, 7.85, 0, 13.7, 1.64, 1.84, [[-.16,0,2,1.28]]);
  for (const x of [-8.05, 3.24]) {
    block(detail, terrace, x, .19, 10.05, .84, .29, 3.0);
    for (const z of [9,9.55,10.1,10.65,11.2]) {
      block(detail, marigold, x, .34, z, .40, .13, .30);
    }
  }
}

function buildOrchard(district, roadMat) {
  const { detail, random } = district;
  block(detail, park, 0, .06, 0, 26, .12, 26);
  const walk = [[-7,-11],[7,-11],[11,-7],[11,7],[7,11],[-7,11],[-11,7],[-11,-7],[-7,-11]];
  path(detail, parkPath, walk, 1.62, .149, .09);
  for (const points of [[[0,11],[0,BASE_EDGE]], [[0,-11],[0,-BASE_EDGE]], [[-11,0],[-BASE_EDGE,0]], [[11,0],[BASE_EDGE,0]]]) {
    path(detail, roadMat, points, 1.5, .15, .096);
  }
  path(detail, parkPath, [[-10.25,0],[10.25,0]], 1.12, .166, .095);
  path(detail, parkPath, [[0,10.9],[0,.7]], 1.24, .166, .095);
  block(detail, parkPath, 0, .19, -2.55, 10.1, .16, 5.55);
  plot(district, { x: 0, y: .26, z: -2.7, type: 15, width: 8.8, depth: 5.1, minHeight: 2.7, heightRange: 2.65, anchor: true });

  // Square beds and intermittent blossom rows remain visible at any density.
  for (const x of [-6.35,6.35]) {
    for (const z of [-5.2,5.45]) {
      block(detail, orchard, x, .122, z, 5.1, .07, 6.45);
      for (const dx of [-1.57,1.57]) {
        for (const dz of [-1.85,.98]) {
          plantTree(district, x+dx, .156, z+dz, 5, 1.38 + random()*.38, true);
        }
      }
      for (const dx of [-1,0,1]) {
        block(detail, dx ? marigold : flowers, x+dx*.72, .198, z+2.54, .54, .12, .53);
      }
    }
  }
  block(detail, stone, 0, .26, 6.15, 3.5, .23, 3.5, { geometry: octagon });
  block(detail, water, 0, .39, 6.15, 2.85, .075, 2.85, { geometry: octagon });
  block(detail, ripple, 0, .51, 6.15, .69, .195, .69, { geometry: octagon });
  for (const [x,z] of [[-2.65,9.2],[2.65,9.2],[-10.6,-2.15],[10.6,2.15]]) {
    streetlight(detail, x, .125, z);
    block(detail, bench, x-.62, .27, z+.42, 1.22, .3, .45);
  }
  for (const [x,z] of [[-3.1,-8.65],[2.8,-8.65],[-10.6,9.15],[10.75,9.15],[-10.45,-9.4],[10.65,-9.35]]) {
    plantTree(district, x, .125, z, z<0?4:1, 1.56, true);
  }
  for (const side of [-1, 1]) {
    plantedBed(district, side*9.66, .12, 4.22, 1.12, 3.7, [[.04,-.94,7,.79],[-.02,.03,7,.84],[.03,1.05,7,.83]]);
    plantedBed(district, side*2.3, .12, -8.1, 1.0, 2.8, [[.09,-.76,7,.84],[-.09,.64,7,.73]]);
  }

  for (const side of [-1, 1]) {
    for (const x of [-18.0,-13.7,-9.8,-5.7,5.7,9.8,13.7,18.0]) {
      plot(district, {
        x, z: side*(16.1 + random()*2.1), type: random()<.65?8:0, color: random()<.5?2:3,
        width: 2.55, depth: 2.6, minHeight: .95, heightRange: 2.4, angle: side>0?Math.PI:0, treeType: 5
      });
    }
    for (const z of [-10.7,-6.35,-2.9,2.9,6.2,10.8]) {
      for (const offset of [0,3.55]) {
        plot(district, {
          x: side*(15.15+offset), z, type: random()<.7?8:7,
          width: 2.4, depth: 2.65, minHeight: 1.05, heightRange: 2.4, angle: -side*Math.PI/2, treeType: 5
        });
      }
    }
  }
}

// The outer streets meet the existing crossings, stairs and garden gates.
function extendCanal(district, roadMat) {
  for (const side of [-1, 1]) {
    const wharfZ = side * 23;
    const channelX = side > 0 ? -4 : 6;
    // The waterfront street ends at each quay, leaving the canal mouth open.
    for (const bank of [-1, 1]) {
      path(district.detail, roadMat, [[bank * 21.8, wharfZ], [channelX + bank * 4.85, wharfZ]], 1.25);
      plot(district, {
        x: channelX + bank * 7.1, z: side * 25, angle: side > 0 ? Math.PI : 0,
        type: bank === 1 && side === -1 ? 13 : 8,
        color: bank > 0 ? 2 : 4, anchor: true, width: 2.5, depth: 2.7,
        minHeight: bank === 1 && side === -1 ? 3.7 : 1.4, heightRange: 2.8
      });
    }
    const x = side * 21.8;
    path(district.detail, roadMat, [[x, -23], [x, 23]], 1.15);
    for (const [i, z] of [-19, -8, -2, 5, 17, 23].entries()) {
      plot(district, { x: side * 24.4, z, angle: -side * Math.PI / 2, type: i % 3 === 0 ? 7 : 12,
        width: 2.8, depth: 2.7, color: (i + 3) % 7, anchor: i % 3 === 0, minHeight: 1.8, heightRange: 2.5 });
    }
    streetlight(district.detail, x - side * .82, .03, -13.4);
    streetlight(district.detail, x - side * .82, .03, 11.55);
  }
}

function extendHeights(district, roadMat) {
  for (const side of [-1, 1]) {
    const avenueX = side * 21.5;
    path(district.detail, roadMat, [[avenueX, -22], [avenueX, 22]], 1.3);
    const endZ = side * 22;
    path(district.detail, roadMat, [[-21.5, endZ], [21.5, endZ]], 1.45);
    for (const [i, z] of [-17, -7, 2, 15].entries()) {
      plot(district, { x: side * 24.4, z, type: i % 2 === 0 ? 9 : 10, treeType: 2,
        width: 2.6, depth: 2.8, minHeight: 1.6, heightRange: 2.9, anchor: i === 1 });
    }
    for (const x of [-16, -7, 5, 15]) {
      plot(district, { x, z: side * 24.6, type: 7, treeType: 2, width: 3, minHeight: 1.3, heightRange: 1.9 });
      streetlight(district.detail, x + 1.8, .03, endZ + side * .83);
    }
  }
}

function extendOrchard(district) {
  const walk = [[-17,-22],[17,-22],[22,-17],[22,17],[17,22],[-17,22],[-22,17],[-22,-17],[-17,-22]];
  path(district.detail, parkPath, walk, 1.05, .055, .11);
  // Garden allotments and a line of cottages back onto the perimeter walk.
  for (const side of [-1, 1]) {
    for (const [i, x] of [-16, -10, -4, 4, 10, 16].entries()) {
      const z = side * 24.6;
      block(district.detail, orchard, x, .025, z, 4.65, .05, 3.25);
      plantTree(district, x - 1.05, .05, z, i % 2 ? 5 : 4, 1.35, true);
      plantTree(district, x + 1.05, .05, z + side * .25, 5, 1.1, true);
    }
    for (const [i, z] of [-15, -7, 7, 15].entries()) {
      plot(district, { x: side * 24.4, z, type: i % 2 ? 0 : 8, treeType: 5,
        angle: -side * Math.PI / 2, width: 2.5, depth: 2.5, minHeight: 1.1, heightRange: 1.9, anchor: i === 0 });
    }
  }
}

function updateDistrict(district, state, amount) {
  const coverage = .1 + .9*state.density;
  for (const lot of district.plots) {
    const present = lot.rank < coverage;
    const forest = lot.forestRank < state.forest;
    const showHouse = Number(lot.plant === null || (present && !forest));
    const showTree = Number(lot.plant !== null && present && forest);
    const houseAmount = THREE.MathUtils.lerp(lot.houseAmount, showHouse, amount);
    const treeAmount = THREE.MathUtils.lerp(lot.treeAmount, showTree, amount);
    lot.houseAmount = Math.abs(showHouse-houseAmount) < .002 ? showHouse : houseAmount;
    lot.treeAmount = Math.abs(showTree-treeAmount) < .002 ? showTree : treeAmount;

    lot.house.visible = lot.houseAmount > 0;
    if (lot.house.visible) {
      const height = lot.minHeight + state.height*lot.heightRange;
      lot.house.scale.set(lot.width, height*lot.houseAmount, lot.depth);
    }
    if (lot.plant) {
      lot.plant.visible = lot.treeAmount > 0;
      if (lot.plant.visible) lot.plant.scale.setScalar(lot.treeSize*lot.treeAmount);
    }
  }
}

export function createTourScenes() {
  const root = new THREE.Group();
  const foundation = new THREE.Group();
  block(foundation, subsoil, 0, -.86, 0, BASE_SIZE-.65, .41, BASE_SIZE-.65);
  block(foundation, earth, 0, -.50, 0, BASE_SIZE-.24, .46, BASE_SIZE-.24);
  root.add(compactParts(foundation));
  const ground = new THREE.Mesh(new THREE.BoxGeometry(BASE_SIZE, .31, BASE_SIZE), solid('#92b174'));
  ground.position.y = -.155;
  ground.receiveShadow = true;
  ground.updateMatrix();
  ground.matrixAutoUpdate = false;
  root.add(ground);
  const roadMat = solid('#e4c29a');
  const state = { ...INITIAL };
  const layouts = [[buildCanal, extendCanal], [buildHeights, extendHeights], [buildOrchard, extendOrchard]];
  const districts = layouts.map(([layout, extend], index) => {
    const group = new THREE.Group();
    group.name = TOUR_STOPS[index].id;
    const district = { group, detail: new THREE.Group(), plots: [], random: randomSource(7895+index*103) };
    layout(district, roadMat);
    extend(district, roadMat);
    group.add(compactParts(district.detail));
    group.visible = index === 0;
    root.add(group);
    updateDistrict(district, state, 1);
    return { group, plots: district.plots };
  });

  let active = 0;
  return {
    root, ground, roadMat,
    select(index) {
      const next = districts[index];
      if (!next || index === active) return;
      districts[active].group.visible = false;
      updateDistrict(next, state, 1);
      next.group.visible = true;
      active = index;
    },
    update(current, dt) {
      state.height = current.height;
      state.density = current.density;
      state.forest = current.forest;
      updateDistrict(districts[active], state, 1-Math.exp(-2.9*dt));
    }
  };
}
