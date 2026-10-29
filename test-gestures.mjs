import assert from 'node:assert/strict';
import {createGestureMapper} from './gesture.js';
function hand(x,y,pinch=false){const a=Array.from({length:21},()=>({x,y}));a[0]={x,y:y+.15};a[4]={x:x-.08,y};a[8]={x:x+(pinch?-.075:.08),y};return a}
const values={height:.5,density:.5,forest:.5};
function warm(m,h){m.update(h,0,values); return m.update(h,200,values)}
function run(points,pinch=false){const m=createGestureMapper(), v={...values};warm(m,[hand(...points[0],pinch)]);for(let i=0;i<points.length;i++){const r=m.update([hand(...points[i],pinch)],250+i*50,v);for(const k of ['height','forest','density'])if(k in r)v[k]=r[k];}return v}
const up=Array.from({length:12},(_,i)=>[.5,.8-i*.015]); assert(run(up).height>.5);
const down=Array.from({length:12},(_,i)=>[.5,.3+i*.015]); assert.equal(run(down).height,.5);assert(run(down,true).height<.5);
const wave=Array.from({length:30},(_,i)=>[.5+.16*Math.sin(i*.35),.5]);assert(run(wave).forest>.5);
const hold=Array.from({length:30},()=>[.5,.5]);assert(run(hold,true).forest<.5);
const zoom=createGestureMapper();const pair=[hand(.3,.5),hand(.7,.5)];let r=warm(zoom,pair);assert.equal(r.zoomDelta,undefined);assert.equal(r.panDelta,undefined);
r=zoom.update([hand(.25,.5),hand(.75,.5)],250,values);assert(r.zoomDelta>0);assert.equal(r.panDelta,undefined);assert.equal(r.density,undefined);
r=zoom.update([hand(.3,.5),hand(.7,.5)],300,values);assert(r.zoomDelta<0);
const pan=createGestureMapper();warm(pan,pair);r=pan.update([hand(.35,.55),hand(.75,.55)],250,values);assert(r.panDelta.x>0&&r.panDelta.y>0);assert.equal(r.zoomDelta,undefined);assert.equal(r.height,undefined);
// A single dropped hand must not trigger single-hand actions or a camera jump.
r=pan.update([hand(.4,.55)],300,values);assert.equal(r.height,undefined);assert.equal(r.forest,undefined);r=pan.update([hand(.45,.55),hand(.85,.55)],350,values);assert.equal(r.panDelta,undefined);assert.equal(r.zoomDelta,undefined);
// A new mode needs a stable dwell before it can control anything.
r=pan.update([hand(.5,.5)],400,values);assert.equal(r.height,undefined);r=pan.update([hand(.5,.5)],590,values);assert.equal(r.height,undefined);assert.equal(r.zoomDelta,undefined);
console.log('gesture movement, tracking interruption and mode stability checks passed');
