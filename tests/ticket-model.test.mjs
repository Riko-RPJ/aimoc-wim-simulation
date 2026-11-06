import test from 'node:test';
import assert from 'node:assert/strict';
import {ticketModel, apiValidationState, formatNumber, resultTime} from '../public/modules/ticket-model.js';
const valid = () => ({deployment_phase:'phase2_static_wim',locale:'id',configuration_valid:true,
 complete:true,weight_valid:true,stage:'complete',trip_id:'PAR-TEST',measured_at:'2026-11-01T07:00:00.000Z',
 vehicle:{plate:'B DEMO'},erp:{order:{order_id:'SO-DEMO'}},
 measurement:{tare_kg:23100,gross_kg:71100,net_cargo_kg:48000,density_t_per_m3:1.5,volume_equivalent_m3:32}});

test('ticket copy identifies Oracle NetSuite in both languages and reads older saved order references',()=>{
 for(const locale of ['id','en']){
  const current={...valid(),locale};const model=ticketModel(current);
  assert.match(model.t.order,/NetSuite/);assert.match(model.t.scope,/Oracle NetSuite/);
  assert.doesNotMatch(model.t.order+' '+model.t.scope,/\bSAP\b/);
  const older={...current,sap:current.erp};delete older.erp;
  assert.equal(ticketModel(older).values.order,model.values.order);
 }
});
test('valid canonical result formats kg, tonnes and cubic metres',()=>{
 const model=ticketModel(valid());assert.equal(model.canPrint,true);assert.equal(model.values.tare,'23.100 kg');
 assert.equal(model.values.net,'48 t');assert.equal(model.values.volume,'32 m³');assert.match(model.values.time,/WIB$/);
});
test('phase one is one shared static station and remains printable',()=>{
 const s=valid();s.deployment_phase='phase1_single_static';const model=ticketModel(s);
 assert.equal(model.canPrint,true);assert.match(model.values.phase,/Satu statis/);
});
test('all three explicit acceptance flags are required for printing',()=>{
 for(const key of ['complete','weight_valid','configuration_valid']){
  for(const value of [false,undefined]){const s=valid();s[key]=value;const m=ticketModel(s);assert.equal(m.canPrint,false,key);assert.ok(m.reason);}
 }
});
test('invalid configuration reports its actual reason without changing measurements',()=>{
 const s=valid();s.configuration_valid=false;s.configuration_error='Deck clearance review required';
 assert.equal(ticketModel(s).reason,'Deck clearance review required');assert.equal(s.measurement.net_cargo_kg,48000);
});
test('missing and nonfinite numbers do not print or become invented zeroes',()=>{
 for(const value of [null,undefined,NaN,Infinity,'48000']){const s=valid();s.measurement.net_cargo_kg=value;assert.equal(ticketModel(s).canPrint,false);}
 assert.equal(formatNumber(null),'—');assert.equal(formatNumber(NaN),'—');
});
test('gross below tare, zero density and inconsistent net or volume are rejected',()=>{
 for(const [key,value] of [['gross_kg',20000],['density_t_per_m3',0],['net_cargo_kg',47980],['volume_equivalent_m3',33]]){
 const s=valid();s.measurement[key]=value;assert.equal(ticketModel(s).canPrint,false,key);}
});
test('unknown phase is not printed as a made-up deployment',()=>{
 const s=valid();s.deployment_phase='unknown';assert.equal(ticketModel(s).canPrint,false);assert.equal(ticketModel(s).values.phase,'—');
});
test('API validation is tied to the exact current trip',()=>{
 const s=valid();s.api_validation={status:'accepted',trip_id:'PREVIOUS'};assert.equal(apiValidationState(s).kind,'pending');
 s.api_validation.trip_id=s.trip_id;assert.equal(apiValidationState(s).kind,'valid');
 s.api_validation.status='error';assert.equal(apiValidationState(s).kind,'invalid');
});
test('English formats decimal units and dates without Indonesian numeric notation',()=>{
 const s=valid();s.locale='en';s.measurement={tare_kg:23100,gross_kg:71300,net_cargo_kg:48200,density_t_per_m3:1.5,volume_equivalent_m3:48200/1000/1.5};
 const m=ticketModel(s);assert.equal(m.canPrint,true);assert.equal(m.values.tare,'23,100 kg');assert.equal(m.values.net,'48.2 t');assert.equal(m.values.volume,'32.133 m³');
 assert.match(m.values.phase,/Phase 2/);assert.equal(resultTime(null,'en'),'—');assert.equal(resultTime('invalid','en'),'—');
});

test('blocked instrument state has a failure reason rather than an indefinite pending label',()=>{
 const s=valid();s.complete=false;s.weight_valid=false;s.blocked=true;s.block_reason='Indikator tidak stabil';
 const m=ticketModel(s);assert.equal(m.canPrint,false);assert.equal(m.reason,'Indikator tidak stabil');assert.equal(m.stage,'Diblokir');
});
test('complete stage label wins over the last movement stage',()=>{
 const s=valid();s.stage='exit_depart';assert.equal(ticketModel(s).stage,'Trip selesai');
});

test('API pending on the current trip is checking, idle is not yet validated',()=>{
 const s=valid();s.api_validation={status:'pending',trip_id:s.trip_id};const pending=apiValidationState(s);
 assert.equal(pending.kind,'pending');assert.match(pending.label,/Sedang/);
 s.api_validation.status='idle';assert.doesNotMatch(apiValidationState(s).label,/Sedang/);
});
test('localized controller stage label takes precedence over generic stage name',()=>{
 const s=valid();s.stage_label='Timbang selesai pada statis yang sama';assert.equal(ticketModel(s).stage,s.stage_label);
});


import {hybridConfig} from '../public/parallel-data.js';
import {ParallelSimulation} from '../public/parallel-simulation.js';
import {SingleStaticSimulation} from '../public/single-static-simulation.js';
const engineInput={capacity:32,tare:23107,density:1.5,speed:10,dwell:10,limit:80000,manual:false,gross:90000,orderKg:48000,orderId:'SO-TICKET-ENGINE',comparison:'same',fault:'normal',autoQR:true};
function engineSnapshot(Engine,phase,override={}) {
 const sim=new Engine(hybridConfig({...engineInput,...override}));sim.start();sim.advance(2000);
 return {...sim.payload(),deployment_phase:phase,locale:'id',configuration_valid:true,blocked:sim.blocked,block_reason:sim.blocked?sim.events.at(-1).message:''};
}
test('ticket accepts actual Phase 1 shared-scale payload after both 20 kg readings',()=>{
 const snapshot=engineSnapshot(SingleStaticSimulation,'phase1_single_static');const model=ticketModel(snapshot);
 assert.equal(snapshot.complete,true);assert.equal(snapshot.measurement.tare_kg,23100);
 assert.equal(snapshot.measurement.gross_kg,71100);assert.equal(snapshot.measurement.net_cargo_kg,48000);
 assert.equal(model.canPrint,true);assert.equal(model.values.net,'48 t');assert.equal(model.values.volume,'32 m³');
});
test('ticket preserves actual Phase 2 dynamic gross minus rounded static tare',()=>{
 const snapshot=engineSnapshot(ParallelSimulation,'phase2_static_wim');const model=ticketModel(snapshot);
 assert.equal(snapshot.complete,true);assert.equal(snapshot.measurement.tare_kg,23100);
 assert.equal(snapshot.measurement.gross_kg,71107);assert.equal(snapshot.measurement.net_cargo_kg,48007);
 assert.equal(model.canPrint,true);assert.equal(model.values.net,'48,007 t');
});
test('actual unstable-indicator and WIM-fault payloads never make printable tickets',()=>{
 for(const [Engine,phase] of [[SingleStaticSimulation,'phase1_single_static'],[ParallelSimulation,'phase2_static_wim']]){
  for(const fault of ['static','wim']){
   const snapshot=engineSnapshot(Engine,phase,{fault});const model=ticketModel(snapshot);
   assert.equal(snapshot.blocked,true);assert.equal(model.canPrint,false);assert.ok(model.reason);
   assert.equal(model.reason,snapshot.block_reason);
  }
 }
});
