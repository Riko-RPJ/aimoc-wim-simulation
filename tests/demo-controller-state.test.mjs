import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoControllerState} from '../public/demo-controller-state.js';

function acceptedState(id='TRIP-A') {
  const state=new DemoControllerState();state.accept(id);return state;
}
function deferred() {
  let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};
}

test('initial state does not authorize validation or show a previous API outcome',()=>{
 const state=new DemoControllerState();
 assert.equal(state.valid,false);assert.equal(state.tripId,null);
 assert.deepEqual(state.api,{status:'idle',trip_id:null,message:''});
 assert.throws(()=>state.begin('TRIP-A'),/no longer valid/);
 assert.equal(state.request,null);
});

test('input invalidation aborts pending validation and clears its visible status',()=>{
 const state=acceptedState();const request=state.begin('TRIP-A');
 assert.equal(state.api.status,'pending');assert.equal(state.api.trip_id,'TRIP-A');
 state.invalidate('Density is invalid');
 assert.equal(request.controller.signal.aborted,true);
 assert.equal(state.valid,false);assert.equal(state.error,'Density is invalid');
 assert.equal(state.request,null);assert.deepEqual(state.api,{status:'idle',trip_id:null,message:''});
 assert.equal(state.finish(request,'accepted','late success'),false);
 assert.equal(state.api.status,'idle');
 assert.throws(()=>state.begin('TRIP-A'),/no longer valid/);
});

test('a valid reset after an input error clears the error and starts with an unvalidated trip',()=>{
 const state=acceptedState();state.invalidate('Invalid gross');state.accept('TRIP-B');
 assert.equal(state.valid,true);assert.equal(state.tripId,'TRIP-B');assert.equal(state.error,'');
 assert.deepEqual(state.api,{status:'idle',trip_id:null,message:''});
 const request=state.begin('TRIP-B');assert.equal(request.tripId,'TRIP-B');assert.equal(state.api.status,'pending');
});

test('reset to a new trip aborts the old request and its late error cannot replace the new pending state',async()=>{
 const state=acceptedState(),old=state.begin('TRIP-A'),response=deferred();
 const completion=response.promise.then(()=>state.finish(old,'error','late old failure'));
 state.accept('TRIP-B');const current=state.begin('TRIP-B');
 response.resolve();assert.equal(await completion,false);
 assert.equal(old.controller.signal.aborted,true);assert.equal(state.request,current);
 assert.deepEqual(state.api,{status:'pending',trip_id:'TRIP-B',message:''});
});

test('a delayed accepted response from a previous trip cannot overwrite the accepted current trip',async()=>{
 const state=acceptedState(),old=state.begin('TRIP-A'),response=deferred();
 const completion=response.promise.then(()=>state.finish(old,'accepted','old accepted'));
 state.accept('TRIP-B');const current=state.begin('TRIP-B');
 assert.equal(state.finish(current,'accepted','current accepted'),true);
 response.resolve();assert.equal(await completion,false);
 assert.deepEqual(state.api,{status:'accepted',trip_id:'TRIP-B',message:'current accepted'});
});

test('reset remains safe even if a caller reuses a trip identifier',()=>{
 const state=acceptedState(),old=state.begin('TRIP-A'),oldEpoch=old.epoch;
 state.accept('TRIP-A');const current=state.begin('TRIP-A');
 assert.ok(current.epoch>oldEpoch);assert.equal(old.controller.signal.aborted,true);
 assert.equal(state.finish(old,'accepted','stale same-id success'),false);
 assert.equal(state.api.status,'pending');assert.equal(state.request,current);
 assert.equal(state.finish(current,'accepted','fresh same-id success'),true);
 assert.equal(state.api.message,'fresh same-id success');
});

test('repeated validation on the same active trip cancels the first request and only the latest can finish',()=>{
 const state=acceptedState(),first=state.begin('TRIP-A'),latest=state.begin('TRIP-A');
 assert.equal(first.controller.signal.aborted,true);assert.equal(latest.controller.signal.aborted,false);
 assert.equal(state.finish(first,'accepted','out of order'),false);
 assert.equal(state.finish(latest,'error','current server rejection'),true);
 assert.deepEqual(state.api,{status:'error',trip_id:'TRIP-A',message:'current server rejection'});
});

test('a timeout error for the still-current request is recorded, while a duplicate callback is ignored',()=>{
 const state=acceptedState(),request=state.begin('TRIP-A');request.controller.abort();
 assert.equal(state.finish(request,'error','Timed out'),true);
 assert.deepEqual(state.api,{status:'error',trip_id:'TRIP-A',message:'Timed out'});
 assert.equal(state.finish(request,'accepted','duplicate late callback'),false);
 assert.equal(state.api.status,'error');assert.equal(state.request,null);
});

test('starting validation for a stale trip does not cancel the current pending validation',()=>{
 const state=acceptedState('TRIP-B'),current=state.begin('TRIP-B');
 assert.throws(()=>state.begin('TRIP-A'),/no longer valid/);
 assert.equal(current.controller.signal.aborted,false);assert.equal(state.request,current);
 assert.deepEqual(state.api,{status:'pending',trip_id:'TRIP-B',message:''});
});

test('request identity prevents a copied callback token from claiming the current response',()=>{
 const state=acceptedState(),request=state.begin('TRIP-A');
 assert.equal(state.finish({...request},'accepted','copied token'),false);
 assert.equal(state.api.status,'pending');assert.equal(state.request,request);
 assert.equal(state.finish(request,'accepted','actual response'),true);
});

test('explicit request clearing removes accepted status without fabricating a new measured trip',()=>{
 const state=acceptedState(),request=state.begin('TRIP-A');state.finish(request,'accepted','valid');
 state.clearRequest();assert.equal(state.valid,true);assert.equal(state.tripId,'TRIP-A');
 assert.equal(state.request,null);assert.deepEqual(state.api,{status:'idle',trip_id:null,message:''});
});
