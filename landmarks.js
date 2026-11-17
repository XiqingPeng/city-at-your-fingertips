import * as THREE from 'three';

// Small original, deliberately stylized interpretations, not survey models.
export function landmarkKind(tags){
  if(tags.man_made!=='tower')return '';
  const name=[tags['name:en'],tags.name].filter(Boolean).join(' ');
  if(/oriental pearl|东方明珠|東方明珠/i.test(name))return 'pearl';
  if(/eiffel tower|tour eiffel|埃菲尔/i.test(name))return 'eiffel';
  if(/tokyo tower|東京タワー|东京塔/i.test(name))return 'tokyo';
  if(/cn tower|tour cn/i.test(name))return 'cn';
  return '';
}
export function makeLandmark(tags,km){
  const kind=landmarkKind(tags),pearl=kind==='pearl',eiffel=kind==='eiffel',tokyo=kind==='tokyo',cn=kind==='cn';
  if(!pearl&&!eiffel&&!tokyo&&!cn)return null;
  const actual=pearl?468:eiffel?330:tokyo?333:553,h=Math.min(18,Math.max(3,actual*40/(km*1000))),g=new THREE.Group();
  const primary=new THREE.MeshStandardMaterial({color:pearl?'#e8b8ca':tokyo?'#e55e3e':'#f3d18b',roughness:1,emissive:'#000000'});
  const accent=new THREE.MeshStandardMaterial({color:pearl?'#cf5383':tokyo?'#fff2b8':'#d78c3c',roughness:1});
  function block(x,y,z,w,he,d,mat=primary){const m=new THREE.Mesh(new THREE.BoxGeometry(w,he,d),mat);m.position.set(x,y,z);g.add(m);return m;}
  function rod(a,b,width,mat=primary){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),mid=start.clone().add(end).multiplyScalar(.5);const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,start.distanceTo(end),width),mat);mesh.position.copy(mid);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(start).normalize());g.add(mesh);}
  if(eiffel||tokyo){const foot=h*.14,top=h*.018;for(const x of [-1,1])for(const z of [-1,1])rod([x*foot,0,z*foot],[x*top,h*.82,z*top],h*.018);for(const y of [.25,.48,.68]){const span=foot*(1-y/.9)*2;block(0,h*y,0,span,h*.035,span,accent);}block(0,h*.88,0,h*.035,h*.24,h*.035,primary);}
  else if(pearl){block(0,h*.46,0,h*.045,h*.92,h*.045);for(const [y,r] of [[.3,.13],[.6,.10],[.8,.045]]){const sphere=new THREE.Mesh(new THREE.SphereGeometry(h*r,8,6),accent);sphere.position.y=h*y;g.add(sphere);}for(const x of [-1,1])rod([x*h*.12,0,0],[0,h*.3,0],h*.025);}
  else {block(0,h*.48,0,h*.055,h*.96,h*.055);const disk=new THREE.Mesh(new THREE.CylinderGeometry(h*.12,h*.10,h*.07,8),accent);disk.position.y=h*.68;g.add(disk);block(0,h*.93,0,h*.018,h*.14,h*.018);}
  g.userData.highlightMaterial=primary;g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});return g;
}
