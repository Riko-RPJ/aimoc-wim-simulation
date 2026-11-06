import test from 'node:test';import assert from 'node:assert/strict';
import {gateLampState,staticVehiclePose} from '../public/weighing-scene-state.js';
import {SingleStaticSimulation} from '../public/single-static-simulation.js';import {hybridConfig} from '../public/parallel-data.js';

test('Phase 1 colours follow shared admission state, ignoring sticky QR and legacy signal',()=>{
  const q={entryScanned:true,exitScanned:true};
  assert.deepEqual(gateLampState({qr:q,signal:'wim',gate_state:{inbound_admission:'green',outbound_admission:'red'}},true),{static:true,wim:false});
  assert.deepEqual(gateLampState({qr:q,signal:'static',gate_state:{inbound_admission:'red',outbound_admission:'green'}},true),{static:false,wim:true});
});
test('contradictory, blocked, completed or unknown Phase 1 admission stays all red',()=>{
  const gates={inbound_admission:'green',outbound_admission:'green'};
  assert.deepEqual(gateLampState({gate_state:gates},true),{static:false,wim:false});
  for(const state of [{},{blocked:true,gate_state:{inbound_admission:'green'}},{done:true,gate_state:{outbound_admission:'green'}},{complete:true,gate_state:{inbound_admission:'green'}}])assert.deepEqual(gateLampState(state,true),{static:false,wim:false});
});
test('Phase 2 colours follow active lane instead of already scanned QR flags',()=>{
  assert.deepEqual(gateLampState({qr:{entryScanned:true,exitScanned:true},signal:'wim'}),{static:false,wim:true});
  assert.deepEqual(gateLampState({signal:'static'}),{static:true,wim:false});
  assert.deepEqual(gateLampState({signal:'wim',blocked:true}),{static:false,wim:false});
});
test('same Phase 1 deck supports front-up ascent for both opposite headings',()=>{
  const inbound=staticVehiclePose({x:0,z:-20,heading:0},11.4,0,0);
  const outbound=staticVehiclePose({x:0,z:20,heading:Math.PI},11.4,0,0);
  assert.equal(inbound.isStatic,true);assert.equal(outbound.isStatic,true);
  assert.ok(inbound.pitch<0);assert.ok(outbound.pitch<0);
  assert.ok(Math.abs(inbound.pitch-outbound.pitch)<1e-10);assert.ok(Math.abs(inbound.surface-outbound.surface)<1e-10);
  assert.ok(staticVehiclePose({x:0,z:20,heading:0},11.4,0,0).pitch>0);
  assert.ok(staticVehiclePose({x:0,z:-20,heading:Math.PI},11.4,0,0).pitch>0);
});
test('Phase 2 WIM lane remains flat and optional second-static lane follows its ramp',()=>{
  assert.deepEqual(staticVehiclePose({x:6.25,z:20,heading:Math.PI},11.4,-6.25,6.25),{isStatic:false,surface:.9,pitch:0,heading:Math.PI});
  assert.equal(staticVehiclePose({x:6.25,z:20,heading:Math.PI},11.4,-6.25,6.25,true).isStatic,true);
});
test('render lamp states remain mutually exclusive across a complete shared-scale trip',()=>{
 const c=hybridConfig({truckProfile:'road',capacity:32,tare:23100,density:1.5,speed:10,dwell:10,limit:80000,manual:false,gross:90000,orderKg:48000,orderId:'SCENE-UAT-001',comparison:'same',fault:'normal',autoQR:true});
 const sim=new SingleStaticSimulation(c);sim.start();let n=0;
 while(!sim.done&&!sim.blocked&&n++<4000){sim.advance(.25);const lights=gateLampState(sim,true);assert.equal(lights.static&&lights.wim,false);}
 assert.equal(sim.done,true);assert.deepEqual(gateLampState(sim,true),{static:false,wim:false});
});
