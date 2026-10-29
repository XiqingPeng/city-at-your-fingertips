import assert from 'node:assert/strict';
import {createGestureMapper} from './gesture.js';
function hand(x,y,pinch=false){const a=Array.from({length:21},()=>({x,y}));a[0]={x,y:y+.15};a[4]={x:x-.08,y};a[8]={x:x+(pinch?-.075:.08),y};return a}
function run(points, pinch=false){const m=createGestureMapper(), v={height:.5,density:.5,forest:.5}; for(let i=0;i<points.length;i++){const [x,y]=points[i]; const r=m.update([hand(x,y,pinch)],i*50,v); for(const k of ['height','forest','density']) if(k in r)v[k]=r[k];} return v}
const up=Array.from({length:12},(_,i)=>[.5,.8-i*.015]); assert(run(up).height>.5);
const down=Array.from({length:12},(_,i)=>[.5,.3+i*.015]); assert.equal(run(down).height,.5); assert(run(down,true).height<.5);
const wave=Array.from({length:30},(_,i)=>[.5+.16*Math.sin(i*.35),.5]); assert(run(wave).forest>.5);
const hold=Array.from({length:30},()=>[.5,.5]); assert(run(hold,true).forest<.5);
console.log('gesture sequence checks passed');

const zoom = createGestureMapper(); const values={height:.5,density:.5,forest:.5};
let r=zoom.update([hand(.3,.5,true),hand(.7,.5,true)],0,values); assert.equal(r.zoomDelta,undefined); assert.equal(r.density,undefined);
r=zoom.update([hand(.25,.5,true),hand(.75,.5,true)],50,values); assert(r.zoomDelta>0); assert.equal(r.density,undefined);
r=zoom.update([hand(.3,.5,true),hand(.7,.5,true)],100,values); assert(r.zoomDelta<0);
r=zoom.update([hand(.3,.5,false),hand(.7,.5,false)],150,values); assert.equal(r.zoomDelta,undefined); assert('density' in r);
console.log('zoom and density separation checks passed');
