import test from 'node:test';
import assert from 'node:assert/strict';
import {SingleStaticSimulation} from '../public/single-static-simulation.js';
import {hybridConfig} from '../public/parallel-data.js';
import {normalizeSingleStatic} from '../lib/single-static-measurement.js';
import handler from '../api/single-static-measurements.js';
import {ParallelSimulation} from '../public/parallel-simulation.js';
import {normalizeHybrid} from '../lib/hybrid-measurement.js';

const input={capacity:32,tare:23100,density:1.5,speed:10,dwell:10,limit:80000,manual:false,gross:90000,orderKg:48000,orderId:'NS-PHASE1-1',comparison:'same',fault:'normal',autoQR:true};
function payload(over={}){const sim=new SingleStaticSimulation(hybridConfig({...input,...over}));sim.start();sim.advance(2000);return sim.payload();}
function call(method,body){let response;const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(value){response=value;}};handler({method,body,headers:{}},res);return {status:res.statusCode,headers:res.headers,body:response?JSON.parse(response):null};}

test('Phase 1 engine payload normalizes one shared scale and recomputes 48 t / 32 m3',()=>{const p=payload(),r=normalizeSingleStatic(p);assert.equal(r.schema_version,'4.0');assert.equal(r.phase,'phase1');assert.equal(r.source.tare,r.source.gross);assert.equal(r.source.resource_id,'STATIC-01');assert.equal(r.measurement.net_cargo_kg,48000);assert.equal(r.measurement.volume_m3,32);assert.equal(r.layout.physical_static_stations,1);assert.equal(r.commercial_match_decision,null);});

test('Derived client totals are ignored in favor of canonical weights',()=>{const p=payload();p.measurement.net_cargo_kg=999999;p.measurement.volume_equivalent_m3=999;p.comparison.difference_kg=-999;const r=normalizeSingleStatic(p);assert.equal(r.measurement.net_cargo_kg,48000);assert.equal(r.measurement.volume_m3,32);assert.equal(r.comparison.difference_kg,0);});

test('Same indicator rounding allows a zero-load trip without negative net',()=>{const p=payload({capacity:8,tare:8150,manual:true,gross:8150,orderKg:1000});const r=normalizeSingleStatic(p);assert.equal(r.measurement.tare_kg,8160);assert.equal(r.measurement.gross_kg,8160);assert.equal(r.measurement.net_cargo_kg,0);assert.equal(r.measurement.volume_m3,0);});

test('In-range but mixed stations, WIM or two-scale records cannot masquerade as Phase 1',()=>{for(const change of [p=>p.source.gross='outbound_wim_controller',p=>p.source.resource_id='STATIC-02',p=>p.layout.physical_static_stations=2,p=>p.layout.wim_stations=1,p=>p.static_construction.indicators=2,p=>p.phase='phase2',p=>p.schema_version='3.0']){const p=payload();change(p);assert.throws(()=>normalizeSingleStatic(p));}});

test('Missing, unstable or mismatched shared indicator readings are rejected',()=>{for(const change of [p=>p.scale_measurements.pop(),p=>p.scale_measurements[1].stable=false,p=>p.scale_measurements[1].indicator_id='OTHER',p=>p.scale_measurements[1].weight_kg+=20,p=>p.scale_measurements[1].trip_id='OTHER']){const p=payload();change(p);assert.throws(()=>normalizeSingleStatic(p));}});

test('Negative net, non-20 kg and overrange weights are rejected',()=>{for(const gross of [23080,71101,80020,Infinity]){const p=payload();p.measurement.gross_kg=gross;p.scale_measurements[1].weight_kg=gross;assert.throws(()=>normalizeSingleStatic(p));}for(const density of [0,NaN,Infinity]){const p=payload();p.measurement.density_t_per_m3=density;assert.throws(()=>normalizeSingleStatic(p));}});

test('QR histories must be ordered, closed and belong to the same trip/order',()=>{for(const change of [p=>p.erp.closed=false,p=>p.erp.exit_scanned=false,p=>p.erp.history[1].order_id='OTHER',p=>p.erp.history[1].trip_id='OTHER',p=>p.erp.history.reverse()]){const p=payload();change(p);assert.throws(()=>normalizeSingleStatic(p));}});

test('Shared scale must be released and reservation order must be sequential',()=>{for(const change of [p=>p.shared_scale.occupied=true,p=>p.shared_scale.owner_trip_id=p.trip_id,p=>p.resource_history[2].action='acquire_outbound',p=>p.resource_history[3].owner_trip_id='OTHER',p=>p.resource_history[1].time_s=-1]){const p=payload();change(p);assert.throws(()=>normalizeSingleStatic(p));}});

test('Incomplete and indicator-fault trips are rejected',()=>{for(const fault of ['static','wim'])assert.throws(()=>normalizeSingleStatic(payload({fault})));const p=payload();p.complete=false;assert.throws(()=>normalizeSingleStatic(p));});

test('API GET and POST clearly report validation only with no ERP forwarding or persistence',()=>{const get=call('GET');assert.equal(get.status,200);assert.equal(get.body.physical_static_stations,1);assert.equal(get.body.persistence,false);const old=process.env.ERP_FORWARDING_ENABLED;process.env.ERP_FORWARDING_ENABLED='true';try{const post=call('POST',JSON.stringify(payload()));assert.equal(post.status,200);assert.equal(post.body.accepted,true);assert.equal(post.body.persisted,false);assert.equal(post.body.forwarded_to_erp,false);assert.equal(post.body.delivery.status,'not_configured');assert.equal(post.body.idempotency_scope,'reference_only_no_durable_deduplication');}finally{if(old===undefined)delete process.env.ERP_FORWARDING_ENABLED;else process.env.ERP_FORWARDING_ENABLED=old;}});

test('API rejects invalid JSON, weights and unsupported methods',()=>{assert.equal(call('POST','{bad').status,400);const p=payload();p.measurement.gross_kg=0;assert.equal(call('POST',p).status,400);assert.equal(call('DELETE').status,405);assert.equal(call('OPTIONS').status,204);});


test('Shared resource actions cannot contradict direction, occupancy or final admission signals',()=>{for(const change of [p=>p.resource_history[0].direction='outbound',p=>p.resource_history[1].occupied=false,p=>p.resource_history[4].state='reserved',p=>p.gate_state.inbound_admission='green']){const p=payload();change(p);assert.throws(()=>normalizeSingleStatic(p));}});

test('Phase 2 rejects measured negative net after static tare quantization and still accepts exact zero',()=>{for(const gross of [8150,8160]){const sim=new ParallelSimulation(hybridConfig({...input,capacity:8,tare:8150,manual:true,gross,orderKg:1000}));sim.start();sim.advance(2000);const p=sim.payload();assert.equal(p.measurement.tare_kg,8160);if(gross<8160){assert.equal(p.weight_valid,false);assert.equal(p.measurement.net_cargo_kg,null);assert.throws(()=>normalizeHybrid(p));}else{assert.equal(p.weight_valid,true);assert.equal(normalizeHybrid(p).measurement.net_cargo_kg,0);assert.equal(normalizeHybrid(p).measurement.volume_m3,0);}}});
