import assert from 'node:assert/strict';
import {createGestureMapper} from './gesture.js';
function hand(x,y,pinch=false){const a=Array.from({length:21},()=>({x,y}));a[0]={x,y:y+.15};a[4]={x:x-.08,y};a[8]={x:x+(pinch?-.075:.08),y};return a}
function run(points, pinch=false){const m=createGestureMapper(), v={height:.5,density:.5,forest:.5}; for(let i=0;i<points.length;i++){const [x,y]=points[i]; const r=m.update([hand(x,y,pinch)],i*50,v); for(const k of ['height','forest','density']) if(k in r)v[k]=r[k];} return v}
const up=Array.from({length:12},(_,i)=>[.5,.8-i*.015]); assert(run(up).height>.5);
const down=Array.from({length:12},(_,i)=>[.5,.3+i*.015]); assert.equal(run(down).height,.5); assert(run(down,true).height<.5);
const wave=Array.from({length:30},(_,i)=>[.5+.16*Math.sin(i*.35),.5]); assert(run(wave).forest>.5);
const hold=Array.from({length:30},()=>[.5,.5]); assert(run(hold,true).forest<.5);
console.log('gesture sequence checks passed');

const values={height:.5,density:.5,forest:.5};
const zoom=createGestureMapper();
let r=zoom.update([hand(.3,.5),hand(.7,.5)],0,values); assert.equal(r.zoomDelta,undefined); assert.equal(r.panDelta,undefined);
r=zoom.update([hand(.25,.5),hand(.75,.5)],50,values); assert(r.zoomDelta>0); assert.equal(r.panDelta,undefined); assert.equal(r.density,undefined);
r=zoom.update([hand(.3,.5),hand(.7,.5)],100,values); assert(r.zoomDelta<0);
const pan=createGestureMapper(); pan.update([hand(.3,.5),hand(.7,.5)],0,values);
r=pan.update([hand(.35,.55),hand(.75,.55)],50,values); assert(r.panDelta.x>0 && r.panDelta.y>0); assert.equal(r.zoomDelta,undefined); assert.equal(r.height,undefined); assert.equal(r.forest,undefined);
r=pan.update([],100,values); assert.equal(r.panDelta,undefined);
r=pan.update([hand(.3,.5),hand(.7,.5)],150,values); assert.equal(r.panDelta,undefined); assert.equal(r.zoomDelta,undefined);
r=pan.update([hand(.3,.5)],200,values); assert.equal(r.panDelta,undefined); assert.equal(r.zoomDelta,undefined);
console.log('two-hand zoom, pan and mode transition checks passed');
