import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize} from '../lib/measurement.js';
import {normalizeHybrid} from '../lib/hybrid-measurement.js';
import {normalizeSingleStatic} from '../lib/single-static-measurement.js';
import {SingleStaticSimulation} from '../public/single-static-simulation.js';
import {ParallelSimulation} from '../public/parallel-simulation.js';
import {hybridConfig} from '../public/parallel-data.js';
import phase1Api from '../api/single-static-measurements.js';
import phase2Api from '../api/parallel-measurements.js';
import schemaApi from '../api/schema.js';
import healthApi from '../api/health.js';

const base={synthetic:true,trip_id:'NS-QR-TRIP-001',measured_at:'2026-11-04T05:00:00Z',
  erp_system:'oracle_netsuite',vehicle:{plate:'B 1234 XYZ',rfid:'',capacity_m3:32},
  tare_kg:23100,gross_kg:71100,density_t_per_m3:1.5,decision:'Green',identity_valid:true,
  identity_method:'QR',qr_trip:{trip_id:'NS-QR-TRIP-001',entry_scanned:true,exit_scanned:true}};
const order={order_id:'NS-SO-UAT-001',ordered_kg:48000};
const engineInput={capacity:32,tare:23100,density:1.5,speed:10,dwell:10,limit:80000,
  manual:false,gross:90000,orderKg:48000,orderId:order.order_id,comparison:'same',fault:'normal',autoQR:true};

function enginePayload(Simulation){
  const sim=new Simulation(hybridConfig(engineInput));sim.start();sim.advance(2000);
  const p=sim.payload();
  // Engines emit the canonical contract after the NetSuite naming migration.
  assert.ok(p.erp);assert.equal(p.sap,undefined);
  return p;
}
function legacyCopy(p){const old=structuredClone(p);old.sap=old.erp;delete old.erp;delete old.erp_system;return old;}
function noLegacyOutput(value){assert.doesNotMatch(JSON.stringify(value),/"(?:sap|sap_order|sap_qr|simulated_sap|sent_to_sap|forwarded_to_sap)"\s*:/);}
function call(handler,method,body){
  let data;const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(value){data=value;}};
  handler({method,body,headers:{}},res);return {status:res.statusCode,body:data?JSON.parse(data):null};
}

test('NetSuite QR order accepts canonical and legacy input but emits one canonical order',()=>{
  const current=normalize({...base,erp_order:order});
  const legacyInput={...base,sap_order:order};delete legacyInput.erp_system;
  const old=normalize(legacyInput);
  assert.equal(current.erp_system,'oracle_netsuite');
  assert.deepEqual(current.erp_order,order);
  assert.deepEqual(old,current);
  assert.equal(current.measurement.net_cargo_tonnes,48);
  assert.equal(current.measurement.volume_m3,32);
  noLegacyOutput(current);
});

test('duplicate QR-order aliases are key-order insensitive and reject contradictory or null canonical values',()=>{
  const accepted=normalize({...base,erp_order:order,sap_order:{ordered_kg:48000,order_id:order.order_id}});
  assert.deepEqual(accepted.erp_order,order);
  for(const legacy of [{...order,ordered_kg:47000},{...order,order_id:'NS-SO-OTHER'}]){
    assert.throws(()=>normalize({...base,erp_order:order,sap_order:legacy}),/Conflicting ERP/);
  }
  assert.throws(()=>normalize({...base,erp_order:null,sap_order:order}),/Conflicting ERP/);
});

test('a declared non-NetSuite ERP provider is rejected instead of relabelled',()=>{
  for(const provider of ['other_erp','Oracle NetSuite',null,undefined]){
    assert.throws(()=>normalize({...base,erp_system:provider,erp_order:order}),/oracle_netsuite/);
  }
  const absent={...base,erp_order:order};delete absent.erp_system;
  assert.equal(normalize(absent).erp_system,'oracle_netsuite');
});

for(const [phase,Simulation,normalizer,handler] of [
  ['Phase 1',SingleStaticSimulation,normalizeSingleStatic,phase1Api],
  ['Phase 2',ParallelSimulation,normalizeHybrid,phase2Api],
]){
  test(`${phase} canonical and legacy QR snapshots produce the same NetSuite record`,()=>{
    const p=enginePayload(Simulation),canonical=normalizer(p),legacy=normalizer(legacyCopy(p));
    assert.deepEqual(legacy,canonical);
    assert.equal(canonical.erp_system,'oracle_netsuite');assert.equal(canonical.erp_order.order_id,order.order_id);
    assert.equal(canonical.measurement.net_cargo_kg,48000);assert.equal(canonical.measurement.volume_m3,32);
    noLegacyOutput(canonical);
  });
  test(`${phase} rejects conflicting dual snapshot aliases and provider declarations`,()=>{
    const p=enginePayload(Simulation),equal=structuredClone(p);equal.sap=structuredClone(equal.erp);
    assert.equal(normalizer(equal).erp_order.order_id,order.order_id);
    for(const mutate of [q=>{q.order.order_id='NS-SO-OTHER';},q=>{q.order.ordered_kg=47000;},q=>{q.history[1].trip_id='OTHER';}]){
      const conflict=structuredClone(equal);mutate(conflict.sap);
      assert.throws(()=>normalizer(conflict),/Conflicting ERP/);
    }
    const nullCanonical=legacyCopy(p);nullCanonical.erp=null;
    assert.throws(()=>normalizer(nullCanonical),/Conflicting ERP/);
    assert.throws(()=>normalizer({...p,erp_system:'other_erp'}),/oracle_netsuite/);
  });
  test(`${phase} API reports NetSuite validation without claiming forwarding or persistence`,()=>{
    const p=enginePayload(Simulation),get=call(handler,'GET'),post=call(handler,'POST',JSON.stringify(p));
    for(const result of [get,post]){
      assert.equal(result.status,200);assert.equal(result.body.erp_system,'oracle_netsuite');
      assert.equal(result.body.forwarded_to_erp,false);noLegacyOutput(result.body);
    }
    assert.equal(get.body.persistence,false);assert.equal(post.body.persisted,false);
    assert.equal(post.body.delivery.status,'not_configured');
    assert.equal(call(handler,'POST',JSON.stringify(legacyCopy(p))).status,200);
    const conflicting=structuredClone(p);conflicting.sap={...structuredClone(p.erp),closed:false};
    assert.equal(call(handler,'POST',JSON.stringify(conflicting)).status,400);
  });
}

test('public schema and health identify Oracle NetSuite without stale SAP contract fields',()=>{
  const schema=call(schemaApi,'GET'),health=call(healthApi,'GET');
  assert.equal(schema.body.erp_system,'oracle_netsuite');
  assert.equal(schema.body.qr_order_support.erp_order.order_id,'NS-SO-DEMO-001');
  assert.equal(health.body.erp_system,'oracle_netsuite');
  noLegacyOutput(schema.body);noLegacyOutput(health.body);
  assert.doesNotMatch(JSON.stringify(schema.body),/SAP/);
});
