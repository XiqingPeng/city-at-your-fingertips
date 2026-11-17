import * as THREE from 'three';
import { getElevation, terrainMesh } from './terrain.js';
import { makeLandmark, landmarkKind } from './landmarks.js';

const palettes = {
  harvest: { bg:'#b95805', ground:'#d5ad38', road:'#f4d46e', building:['#eec052','#d88132','#f3d988','#b95b29','#efad42','#d7a648','#f1c668'], green:['#526f25','#779329','#315d34','#a1aa32','#8f9826','#537b39'] },
  garden: { bg:'#748c52', ground:'#b0bd70', road:'#e2cf94', building:['#e9c48f','#cf9470','#f0dda9','#bba47c','#ddad83','#c4b98b','#ebce9b'], green:['#4e764c','#779d61','#345e47','#9db76b','#739457','#547e5b'] },
  twilight: { bg:'#795363', ground:'#918778', road:'#dfb58d', building:['#d99576','#b36e65','#e6bc91','#967487','#d58d80','#a599a2','#e5b590'], green:['#52677a','#78838a','#405a69','#9ba29b','#7b8d82','#5d7880'] }
};
const $ = s => document.querySelector(s);
function download(blob, name) { const url=URL.createObjectURL(blob), a=document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
function clipPolygon(points, half) {
  let result=points;
  for(const [axis,sign] of [[0,1],[0,-1],[1,1],[1,-1]]) {
    const input=result; result=[]; if(!input.length) break;
    const inside=p=>sign*p[axis]<=half;
    const cross=(a,b)=>{const t=(sign*half-a[axis])/(b[axis]-a[axis]); return [a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];};
    let prev=input[input.length-1];
    for(const p of input){if(inside(p)){if(!inside(prev)) result.push(cross(prev,p));result.push(p);}else if(inside(prev))result.push(cross(prev,p));prev=p;}
  }
  // Remove repeated and collinear vertices so triangulation and wall edges match.
  result=result.filter((p,i,a)=>{const prev=a[(i+a.length-1)%a.length];return Math.hypot(p[0]-prev[0],p[1]-prev[1])>1e-7;});
  let changed=true;while(changed&&result.length>3){changed=false;for(let i=0;i<result.length;i++){const a=result[(i+result.length-1)%result.length],b=result[i],c=result[(i+1)%result.length];const ab=[b[0]-a[0],b[1]-a[1]],bc=[c[0]-b[0],c[1]-b[1]];if(Math.abs(ab[0]*bc[1]-ab[1]*bc[0])<1e-8&&ab[0]*bc[0]+ab[1]*bc[1]>=0){result.splice(i,1);changed=true;break;}}}
  return result;
}
function dispose(group) { group.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){for(const m of (Array.isArray(o.material)?o.material:[o.material]))m.dispose();}});group.clear(); }
function heightOf(tags) {
  const raw=tags.height || ''; let n=parseFloat(raw);
  if(Number.isFinite(n) && /ft|feet|'/i.test(raw)) n*=0.3048;
  if(!Number.isFinite(n)) n=(parseFloat(tags['building:levels'])||2)*3.2;
  return Math.max(3,Math.min(n,300));
}
function sampleBuildings(elements,project,limit){
  if(elements.length<=limit)return elements;
  const bins=Array.from({length:256},()=>[]);
  for(const element of elements){const p=project(element.geometry[0]);const x=Math.max(0,Math.min(15,Math.floor((p[0]+20)/40*16))),y=Math.max(0,Math.min(15,Math.floor((p[1]+20)/40*16)));bins[y*16+x].push(element);}
  const result=[];let depth=0,found=true;while(result.length<limit&&found){found=false;for(const bin of bins){if(bin[depth]){found=true;result.push(bin[depth]);if(result.length===limit)break;}}depth++;}return result;
}
async function fetchOverpass(query, signal, bounds, onProgress) {
  let lastError;const [south,west,north,east]=bounds;
  const endpoints=[];
  if(south>24&&north<73&&west>-26&&east<46)endpoints.push('https://ovp.dresel.systems/api/interpreter');
  if(south>10&&north<75&&west>-170&&east<-45)endpoints.push('https://ovp.dresel.systems/api-na/interpreter');
  endpoints.push('https://overpass.private.coffee/api/interpreter','https://maps.mail.ru/osm/tools/overpass/api/interpreter','https://overpass-api.de/api/interpreter');
  for (const [endpointIndex,endpoint] of endpoints.entries()) {
    onProgress(endpointIndex+1,endpoints.length);
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const attempt = new AbortController();
    const cancel = () => attempt.abort();
    signal.addEventListener('abort', cancel, {once:true});
    const timer = setTimeout(cancel, 30000);
    try {
      const response = await fetch(endpoint, {method:'POST', body:new URLSearchParams({data:query}), signal:attempt.signal});
      if (!response.ok) throw new Error(`Map service returned ${response.status}`);
      return await response.json();
    } catch (error) {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      lastError = error;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
    }
  }
  throw lastError || new Error('Map services unavailable');
}
export function setupStudio({scene, renderer, camera, controls, procedural, realRoot, boxes, ground, roadMat, target, current, dayNight}) {
  let palette='harvest', selected=null, requestId=0, controller=null, realBuildings=[];
  let map=null, marker=null, rectangle=null, loadedPlace=null, terrainData=null, terrainController=null, terrainGeneration=0, landmarks=[];
  const osmCache=new Map();
  const originals=new Map();
  procedural.traverse(o=>{if(o.material && !originals.has(o.material)) originals.set(o.material,o.material.color.getHexString());});
  const initial={position:camera.position.clone(),target:controls.target.clone()};
  const status=$('#map-status');
  function applyPalette(name) {
    palette=name; const p=palettes[name];
    ground.material.color.set(p.ground); roadMat.color.set(p.road);
    const wallColors=['e6c9a7','c7b7a1','e2d5bf','b2c2af','dba995','aebec0','d9c3a3'];
    const treeColors=['6b9c78','83a985','548467','a1b989','b0a76a','779b6d'];
    for(const [mat,original] of originals){let i=wallColors.indexOf(original);if(i>=0)mat.color.set(p.building[i]);i=treeColors.indexOf(original);if(i>=0)mat.color.set(p.green[i]);}
    realRoot.traverse(o=>{if(o.userData.colorRole==='ground')o.material.color.set(p.ground);if(o.userData.colorRole==='road')o.material.color.set(p.road);if(o.userData.colorRole==='building')o.material.color.set(p.building[o.userData.colorIndex]);});
    document.querySelectorAll('[data-palette]').forEach(button=>{const active=button.dataset.palette===name;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  }
  document.querySelectorAll('[data-palette]').forEach(button=>button.addEventListener('click',()=>applyPalette(button.dataset.palette)));
  document.querySelectorAll('[data-time]').forEach(button=>button.addEventListener('click',()=>{dayNight.set(button.dataset.time);document.body.dataset.time=button.dataset.time;document.querySelectorAll('[data-time]').forEach(b=>{const on=b===button;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});}));
  function setMode(isReal) {
    procedural.visible=!isReal;realRoot.visible=isReal;$('#terrain').disabled=!isReal;
    for(const id of ['density','forest']){$('#'+id).disabled=isReal;$('#'+id).parentElement.style.opacity=isReal?'.45':'1';}
    $('#mode-hint').textContent=isReal?'Building footprints are from OpenStreetMap. Density and forest controls apply to the imaginary city.':'Use sliders or gestures to grow your imaginary city.';
    $('#scene-kind').textContent=isReal?'OPENSTREETMAP':'GENERATED';
  }
  async function applyTerrain(){
    const generation=++terrainGeneration;if(terrainController)terrainController.abort();terrainController=new AbortController();
    if(!loadedPlace || !realRoot.visible)return;
    const group=realRoot.children[0],flat=group.children.find(o=>o.userData.isFlatBase),old=group.children.find(o=>o.userData.isTerrain);
    if(old){group.remove(old);old.geometry.dispose();old.material.dispose();}
    if($('#terrain').value==='flat'){
      flat.visible=true;for(const object of group.children)if(object.userData.terrainAnchor)object.position.y=object.userData.baseY||0;
      status.textContent='Flat base selected.';return;
    }
    status.textContent='Loading relative elevation…';
    try {
      if(!terrainData)terrainData=await getElevation(loadedPlace,loadedPlace.km,terrainController.signal);
      if(generation!==terrainGeneration)return;
      const mesh=terrainMesh(terrainData,palettes[palette].ground);flat.visible=false;group.add(mesh);
      for(const object of group.children){const a=object.userData.terrainAnchor;if(a)object.position.y=(object.userData.baseY||0)+terrainData.sample(a.x,a.z);}
      status.textContent=`Relative elevation loaded: ${(terrainData.max-terrainData.min).toFixed(0)} m range. Terrain data: AWS Terrain Tiles / Mapzen.`;
    }catch(error){if(generation!==terrainGeneration)return;$('#terrain').value='flat';flat.visible=true;status.textContent='Terrain could not be loaded; using the flat base. Check your connection.';console.error(error);}
  }
  $('#terrain').addEventListener('change',applyTerrain);
  $('#landmark').addEventListener('change',()=>{const selectedId=$('#landmark').value;for(const item of landmarks){const active=item.id===selectedId,material=item.mesh.userData.highlightMaterial||item.mesh.material;material?.emissive?.set(active?'#ff8a00':'#000000');if(material?.emissive)material.emissiveIntensity=active?.7:0;}});
  function resetView(){topView=false;$('#toggle-view span').textContent='Top view';controls.target.copy(initial.target);camera.position.copy(initial.position);camera.up.set(0,1,0);controls.update();}
  $('#reset-view').addEventListener('click',resetView);
  let topView=false;$('#toggle-view').addEventListener('click',()=>{topView=!topView;controls.target.set(0,0,0);camera.position.set(topView?.01:37,topView?72:37,topView?.01:51);controls.update();$('#toggle-view span').textContent=topView?'3D view':'Top view';});
  $('#help-toggle').addEventListener('click',()=>{const help=$('#help');help.hidden=!help.hidden;$('#help-toggle').setAttribute('aria-expanded',String(!help.hidden));});
  $('#close-help').addEventListener('click',()=>{$('#help').hidden=true;$('#help-toggle').setAttribute('aria-expanded','false');});
  function cancel(){requestId++;if(controller)controller.abort();controller=null;$('#cancel-load').hidden=true;$('#map-progress').hidden=true;terrainGeneration++;if(terrainController)terrainController.abort();}
  function boundsFor(place,km){const h=km/2/111.32,l=h/Math.max(.1,Math.cos(place.latitude*Math.PI/180));return [place.latitude-h,place.longitude-l,place.latitude+h,place.longitude+l];}
  function updateMap(){
    if(!selected)return;const [south,west,north,east]=boundsFor(selected,Number($('#area').value));
    $('#latitude').value=selected.latitude.toFixed(5);$('#longitude').value=selected.longitude.toFixed(5);
    if(!window.L){status.textContent='Map tiles unavailable. Enter coordinates and load the selected area.';return;}
    if(!map){map=L.map('selection-map',{scrollWheelZoom:false}).setView([selected.latitude,selected.longitude],15);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
      marker=L.marker([selected.latitude,selected.longitude],{draggable:true,icon:L.divIcon({className:'pixel-pin',iconSize:[18,18],iconAnchor:[9,9]})}).addTo(map);
      const setPoint=point=>{selected={...selected,latitude:point.lat,longitude:point.lng};updateMap();};
      marker.on('dragend',()=>setPoint(marker.getLatLng()));map.on('click',e=>setPoint(e.latlng));
      rectangle=L.rectangle([[south,west],[north,east]],{color:'#dd7324',weight:3,fillOpacity:.08,interactive:false}).addTo(map);
    }else{marker.setLatLng([selected.latitude,selected.longitude]);rectangle.setBounds([[south,west],[north,east]]);}
    map.invalidateSize();
  }
  function coordinatesChanged(){const lat=Number($('#latitude').value),lon=Number($('#longitude').value);if(!$('#latitude').value||!$('#longitude').value||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>85||Math.abs(lon)>180){status.textContent='Enter latitude from -85 to 85 and longitude from -180 to 180.';return false;}selected={...selected,latitude:lat,longitude:lon};updateMap();if(map&&rectangle)map.fitBounds(rectangle.getBounds(),{padding:[12,12],maxZoom:16});return true;}
  for(const id of ['latitude','longitude'])$('#'+id).addEventListener('change',coordinatesChanged);
  $('#load-area').addEventListener('click',()=>{if(selected&&coordinatesChanged())load();});
  $('#cancel-load').addEventListener('click',()=>{cancel();$('#cancel-load').hidden=true;status.textContent='Map loading cancelled.';});

  $('#imaginary').addEventListener('click',()=>{cancel();selected=null;setMode(false);$('#cancel-load').hidden=true;$('#area-editor').hidden=true;$('#landmark-row').hidden=true;$('#scene-name').textContent='Imaginary neighborhood';status.textContent='Currently showing an imaginary city.';$('#search-results').replaceChildren();resetView();});
  async function search(query) {
    if(!query.trim()) {status.textContent='Enter a city or place name.';return;}
    cancel();const id=requestId;controller=new AbortController();status.textContent='Searching for places…';$('#search-results').replaceChildren();
    try {
      const response=await fetch('https://geocoding-api.open-meteo.com/v1/search?'+new URLSearchParams({name:query.trim(),count:'6',language:'en',format:'json'}),{signal:controller.signal});
      if(!response.ok)throw new Error('Geocoding service unavailable');const data=await response.json();if(id!==requestId)return;
      if(!data.results?.length){status.textContent='No places found. Try another name.';return;}
      status.textContent='Choose a result to load its surrounding neighborhood.';
      for(const place of data.results){const button=document.createElement('button');button.type='button';button.textContent=[place.name,place.admin1,place.country].filter(Boolean).join(' · ');button.addEventListener('click',()=>{selected=place;$('#search-results').replaceChildren();$('#area-editor').hidden=false;updateMap();if(map&&rectangle)map.fitBounds(rectangle.getBounds(),{padding:[12,12],maxZoom:16});status.textContent='Move the pin, then load the selected area.';});$('#search-results').append(button);}
    } catch(error){if(error.name!=='AbortError'&&id===requestId)status.textContent='Search failed. Check your connection and try again.';}
  }
  $('#search-form').addEventListener('submit',event=>{event.preventDefault();search($('#city-search').value);});
  document.querySelectorAll('[data-city]').forEach(button=>button.addEventListener('click',()=>{$('#city-search').value=button.dataset.city;search(button.dataset.city);}));
  $('#area').addEventListener('change',()=>{if(selected){updateMap();if(map&&rectangle)map.fitBounds(rectangle.getBounds(),{padding:[12,12],maxZoom:16});}});
  async function load() {
    if(!selected)return;cancel();const id=requestId;controller=new AbortController(); const place=selected, km=Number($('#area').value), halfLat=km/2/111.32, halfLon=halfLat/Math.max(.1,Math.cos(place.latitude*Math.PI/180));
    const bounds=boundsFor(place,km), bbox=bounds.join(',');
    status.textContent='Loading the OpenStreetMap neighborhood. This may take a moment…';$('#map-progress').hidden=false;$('#cancel-load').hidden=false;
    try {
      const query=`[out:json][timeout:25];(way["building"](${bbox});way["highway"~"^(primary|secondary|tertiary|residential|unclassified|pedestrian|living_street)$"](${bbox});node["name"]["tourism"](${bbox});node["name"]["historic"](${bbox});nwr["man_made"="tower"]["name"](${bbox}););out tags geom;`;
      const key=bounds.map(n=>n.toFixed(6)).join(','),cached=osmCache.get(key);let raw;
      if(cached&&Date.now()-cached.time<300000){raw=cached.data;status.textContent='Using recently loaded map data…';}
      else{raw=await fetchOverpass(query,controller.signal,bounds,(i,total)=>{status.textContent=`Requesting map data from read-only server ${i} of ${total}…`;});if(id!==requestId)return;osmCache.set(key,{time:Date.now(),data:raw});if(osmCache.size>2)osmCache.delete(osmCache.keys().next().value);}
      const data={...raw,elements:[...(raw.elements||[])]};
      const landmarksFromGeometry=[];
      for(const e of data.elements||[]){if(e.type==='node'||e.tags?.man_made!=='tower'||!(e.tags?.name||e.tags?.['name:en']))continue;const points=e.type==='way'?(e.geometry||[]):(e.members||[]).flatMap(m=>m.geometry||[]);if(points.length){const center=points.reduce((a,p)=>({lat:a.lat+p.lat/points.length,lon:a.lon+p.lon/points.length}),{lat:0,lon:0});landmarksFromGeometry.push({type:'node',id:`${e.type}-${e.id}`,...center,tags:e.tags});}}
      data.elements.push(...landmarksFromGeometry);
      const next=new THREE.Group(), p=palettes[palette], buildings=[];
      const base=new THREE.Mesh(new THREE.BoxGeometry(42,.6,42),new THREE.MeshStandardMaterial({color:p.ground,roughness:1}));base.position.y=-.3;base.userData.colorRole='ground';base.userData.isFlatBase=true;next.add(base);const nextLandmarks=[];
      const project=point=>[(point.lon-place.longitude)/halfLon*20,(point.lat-place.latitude)/halfLat*20];
      const allBuildings=(data.elements||[]).filter(e=>e.tags?.building&&e.geometry?.length>=4&&!landmarkKind(e.tags)),buildingElements=sampleBuildings(allBuildings,project,1800);
      for(const e of buildingElements){
        const pts=clipPolygon(e.geometry.map(project),20);if(pts.length<3)continue;
        const shape=new THREE.Shape();shape.moveTo(...pts[0]);for(const point of pts.slice(1))shape.lineTo(...point);shape.closePath();
        const height=heightOf(e.tags)*40/(km*1000);if(!Number.isFinite(height))continue;
        const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,steps:1}),new THREE.MeshStandardMaterial({color:p.building[e.id%p.building.length],roughness:1,flatShading:true}));
        mesh.rotation.x=-Math.PI/2;mesh.userData.colorRole='building';mesh.userData.colorIndex=e.id%p.building.length;mesh.castShadow=true;mesh.receiveShadow=true;mesh.geometry.computeBoundingBox();const center=mesh.geometry.boundingBox.getCenter(new THREE.Vector3());mesh.userData.terrainAnchor={x:center.x,z:-center.y};next.add(mesh);buildings.push(mesh);if(e.tags.name)nextLandmarks.push({id:'way-'+e.id,name:e.tags.name,mesh});
      }
      const roadMaterial=new THREE.MeshStandardMaterial({color:p.road,roughness:1});let roadCount=0;
      for(const e of (data.elements||[])){if(!e.tags?.highway||!e.geometry)continue;for(let i=1;i<e.geometry.length&&roadCount<5000;i++){
        const a=project(e.geometry[i-1]),b=project(e.geometry[i]);if([...a,...b].some(v=>Math.abs(v)>20))continue;const dx=b[0]-a[0],dz=-(b[1]-a[1]),length=Math.hypot(dx,dz);if(length<.01)continue;
        const road=new THREE.Mesh(new THREE.BoxGeometry(length,.035,.17),roadMaterial);road.position.set((a[0]+b[0])/2,.02,-(a[1]+b[1])/2);road.rotation.y=-Math.atan2(dz,dx);road.userData.colorRole='road';road.userData.baseY=.02;road.userData.terrainAnchor={x:road.position.x,z:road.position.z};next.add(road);roadCount++;
      }}
      const points=(data.elements||[]).filter(e=>e.type==='node'&&(e.tags?.name||e.tags?.['name:en']));points.sort((a,b)=>Number(Boolean(landmarkKind(b.tags)))-Number(Boolean(landmarkKind(a.tags))) || Number(String(b.id).startsWith('relation-'))-Number(String(a.id).startsWith('relation-')));
      const renderedLandmarks=new Set();
      for(const point of points.slice(0,80)){
        const [x,y]=project(point);if(Math.abs(x)>20||Math.abs(y)>20)continue;
        const kind=landmarkKind(point.tags);if(kind&&renderedLandmarks.has(kind))continue;if(kind)renderedLandmarks.add(kind);
        const model=makeLandmark(point.tags,km);const landmark=model||new THREE.Mesh(new THREE.BoxGeometry(.25,.7,.25),new THREE.MeshStandardMaterial({color:'#f4a933',emissive:'#000000'}));
        const baseY=model?0:.35;landmark.position.set(x,baseY,-y);landmark.userData.baseY=baseY;landmark.userData.terrainAnchor={x,z:-y};next.add(landmark);
        nextLandmarks.push({id:'node-'+point.id,name:(point.tags['name:en']||point.tags.name)+(model?' (stylized model)':' (map marker)'),mesh:landmark});
      }
      if(!buildings.length){dispose(next);status.textContent='No building footprints found. Try another place or area size.';return;}
      dispose(realRoot);realRoot.add(next);realBuildings=buildings;loadedPlace={...place,km};terrainData=null;landmarks=nextLandmarks.sort((a,b)=>Number(b.name.includes('(stylized model)'))-Number(a.name.includes('(stylized model)'))).slice(0,100);const select=$('#landmark');select.replaceChildren(new Option('None',''));for(const item of landmarks)select.add(new Option(item.name,item.id));$('#landmark-row').hidden=!landmarks.length;setMode(true);$('#scene-name').textContent=place.name+' · '+km+' km';status.textContent=`Loaded ${buildings.length} of ${allBuildings.length} buildings. Data © OpenStreetMap contributors. Missing heights are estimated.`;resetView();if($('#terrain').value==='terrain')applyTerrain();
    }catch(error){if(id===requestId)status.textContent=error.name==='AbortError'?'Map request timed out or was cancelled. Retry or choose a smaller area.':'Map loading failed. Check your connection or try again later.';}finally{if(id===requestId){$('#map-progress').hidden=true;$('#cancel-load').hidden=true;}}
  }
  $('#snapshot').addEventListener('click',()=>{renderer.render(scene,camera);renderer.domElement.toBlob(blob=>{if(blob)download(blob,'pixel-city.png');else status.textContent='Could not save the image. Please try again.';},'image/png');});
  $('#export').addEventListener('click',async()=>{try{status.textContent='Preparing STL…';const {STLExporter}=await import('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/exporters/STLExporter.js');const source=realRoot.visible?realRoot:procedural;const copy=source.clone(true);copy.traverse(o=>{for(const child of [...o.children])if(!child.visible)o.remove(child);});copy.rotation.x=Math.PI/2;copy.updateMatrixWorld(true);const data=new STLExporter().parse(copy,{binary:true});download(new Blob([data],{type:'model/stl'}),'pixel-city.stl');status.textContent='STL exported: about 42 units wide. Check and repair overlapping geometry in your slicer.';}catch(error){console.error(error);status.textContent='STL export failed. Check your connection and try again.';}});
  $('#export-3mf').addEventListener('click',async()=>{const button=$('#export-3mf');button.disabled=true;status.textContent='Preparing color 3MF…';
    try{await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));const {make3MF}=await import('./export-3mf.js');const result=await make3MF(realRoot.visible?realRoot:procedural);download(result.blob,'pixel-city-color.3mf');status.textContent=`3MF exported with ${result.colors} colors at 160 mm. Assign filaments and inspect overlaps in your slicer.`;}
    catch(error){console.error(error);status.textContent=`3MF export failed: ${error.message}`;}finally{button.disabled=false;}
  });
  applyPalette('harvest');setMode(false);
  return { update(){if(realRoot.visible){const scale=.25+current.height*1.7;for(const mesh of realBuildings)mesh.scale.z=scale;}}, isReal:()=>realRoot.visible };
}
