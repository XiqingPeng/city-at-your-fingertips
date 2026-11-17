import * as THREE from 'three';

// 3MF Core package: one mesh object per material color, in millimeters.
export async function make3MF(root){
  const {zipSync,strToU8}=await import('https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js');
  root.updateWorldMatrix(true,true);const groups=new Map(),point=new THREE.Vector3(),factor=160/42;let lowest=Infinity,total=0;
  root.traverseVisible(mesh=>{
    if(!mesh.isMesh||!mesh.geometry?.attributes.position)return;
    const position=mesh.geometry.attributes.position,index=mesh.geometry.index,material=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
    if(!material?.color)return;const color=material.color.getHexString().toUpperCase();
    if(!groups.has(color))groups.set(color,{vertices:[],triangles:[]});const group=groups.get(color);
    if(total+position.count>1000000)throw new Error('Model exceeds the export vertex limit. Choose a smaller area.');
    // Three.js commonly duplicates vertices at face boundaries for normals/UVs.
    // Weld within each solid (not between independent touching solids) for 3MF topology.
    const welded=new Map(),remap=new Uint32Array(position.count);
    for(let i=0;i<position.count;i++){
      point.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
      const key=[point.x,-point.z,point.y].map(v=>Math.round(v*factor*10000)).join(',');
      let v=welded.get(key);if(v===undefined){v=group.vertices.length/3;welded.set(key,v);group.vertices.push(point.x,-point.z,point.y);lowest=Math.min(lowest,point.y);}remap[i]=v;
    }
    const count=index?index.count:position.count;for(let i=0;i+2<count;i+=3){const a=remap[index?index.getX(i):i],b=remap[index?index.getX(i+1):i+1],c=remap[index?index.getX(i+2):i+2];if(a!==b&&b!==c&&a!==c)group.triangles.push(a,b,c);}total+=position.count;
  });
  if(!groups.size)throw new Error('The visible city has no geometry to export.');
  const materials=[...groups.keys()],parts=['<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Title">Pixel City</metadata><resources><basematerials id="1">'];
  for(const [i,color] of materials.entries())parts.push(`<base name="Color ${i+1}" displaycolor="#${color}FF"/>`);parts.push('</basematerials>');
  let id=2;const objectIds=[];
  for(const [color,group] of groups){objectIds.push(id);parts.push(`<object id="${id++}" type="model" pid="1" pindex="${materials.indexOf(color)}"><mesh><vertices>`);
    for(let i=0;i<group.vertices.length;i+=3){const x=(group.vertices[i]*factor).toFixed(4),y=(group.vertices[i+1]*factor).toFixed(4),z=((group.vertices[i+2]-lowest)*factor).toFixed(4);parts.push(`<vertex x="${x}" y="${y}" z="${z}"/>`);}
    parts.push('</vertices><triangles>');for(let i=0;i<group.triangles.length;i+=3)parts.push(`<triangle v1="${group.triangles[i]}" v2="${group.triangles[i+1]}" v3="${group.triangles[i+2]}"/>`);parts.push('</triangles></mesh></object>');
  }
  parts.push('</resources><build>');for(const objectId of objectIds)parts.push(`<item objectid="${objectId}"/>`);parts.push('</build></model>');
  const content='<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>';
  const rels='<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>';
  const zip=zipSync({'[Content_Types].xml':strToU8(content),'_rels/.rels':strToU8(rels),'3D/3dmodel.model':strToU8(parts.join(''))},{level:3});
  return {blob:new Blob([zip],{type:'model/3mf'}),colors:materials.length,vertices:total};
}
