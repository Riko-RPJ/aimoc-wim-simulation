import test from 'node:test';
import assert from 'node:assert/strict';
import {measuredNetCargoKg} from '../public/hybrid-simulation.js';
import {hybridConfig} from '../public/parallel-data.js';
import {ParallelSimulation} from '../public/parallel-simulation.js';
import {DoubleStaticSimulation} from '../public/double-static-simulation.js';
import {SharedStaticScaleResource,SingleStaticSimulation,singleStaticFlow} from '../public/single-static-simulation.js';

const input={truckProfile:'road',capacity:32,tare:23100,density:1.5,speed:10,dwell:10,limit:80000,manual:false,gross:90000,orderKg:48000,orderId:'NS-SO-UAT-001',comparison:'same',fault:'normal',autoQR:true};
const config=overrides=>hybridConfig({...input,...overrides});
const finish=sim=>{sim.start();sim.advance(10000);return sim.payload();};

test('measured pair rejects negative/nonfinite values, allows zero cargo without clamping',()=>{
 assert.equal(measuredNetCargoKg(8160,8150),null);
 assert.equal(measuredNetCargoKg(8160,8160),0);
 assert.equal(measuredNetCargoKg(8160,8170),10);
 for(const pair of [[NaN,10],[10,Infinity],[-1,10],[10,-1]])assert.equal(measuredNetCargoKg(...pair),null);
});

test('Phase 2 normal static tare plus WIM gross retains 48 t / 32 m3',()=>{
 const p=finish(new ParallelSimulation(config()));
 assert.equal(p.scenario,'parallel_static_inbound_wim_outbound');
 assert.equal(p.complete,true);assert.equal(p.weight_valid,true);
 assert.equal(p.measurement.tare_kg,23100);assert.equal(p.measurement.gross_kg,71100);
 assert.equal(p.measurement.net_cargo_kg,48000);assert.equal(p.measurement.volume_equivalent_m3,32);
});

test('Phase 2 quantization counterexample blocks final negative output',()=>{
 const sim=new ParallelSimulation(config({capacity:8,tare:8150,manual:true,gross:8150}));const p=finish(sim);
 assert.equal(p.measurement.tare_kg,8160);assert.equal(p.measurement.gross_kg,8150);
 assert.equal(p.measurement.net_cargo_kg,null);assert.equal(p.measurement.volume_equivalent_m3,null);
 assert.equal(sim.blocked,true);assert.equal(p.weight_valid,false);assert.equal(p.complete,false);
});

test('Phase 2 equal measured tare/gross produces valid zero load',()=>{
 const p=finish(new ParallelSimulation(config({capacity:8,tare:8150,manual:true,gross:8160})));
 assert.equal(p.weight_valid,true);assert.equal(p.measurement.net_cargo_kg,0);assert.equal(p.measurement.volume_equivalent_m3,0);
});

test('shared resource denies opposing and foreign admission until owner clears rear',()=>{
 const r=new SharedStaticScaleResource();
 assert.equal(r.tryAcquire('trip-A','inbound'),true);
 assert.equal(r.tryAcquire('trip-A','inbound'),true);
 assert.equal(r.tryAcquire('trip-A','outbound'),false);
 assert.equal(r.tryAcquire('trip-B','outbound'),false);
 assert.equal(r.markOccupied('trip-B'),false);assert.equal(r.markOccupied('trip-A'),true);
 assert.equal(r.tryRelease('trip-A',false),false);assert.equal(r.tryRelease('trip-B',true),false);
 assert.equal(r.snapshot().owner_trip_id,'trip-A');
 assert.equal(r.tryRelease('trip-A',true),true);assert.equal(r.tryAcquire('trip-B','outbound'),true);
});

test('Phase 1 uses one physical scale and one indicator for both 20 kg readings',()=>{
 const sim=new SingleStaticSimulation(config());const p=finish(sim);
 assert.equal(p.schema_version,'4.0');assert.equal(p.phase,'phase1');assert.equal(p.scenario,'single_static_inbound_outbound');
 assert.equal(p.complete,true);assert.equal(p.weight_valid,true);
 assert.equal(p.measurement.tare_kg,23100);assert.equal(p.measurement.gross_kg,71100);assert.equal(p.measurement.net_cargo_kg,48000);assert.equal(p.measurement.volume_equivalent_m3,32);
 assert.equal(p.static_construction.station_count,1);assert.equal(p.static_construction.load_cells,8);assert.equal(p.layout.wim_stations,0);
 assert.equal(p.scale_measurements.length,2);
 assert.deepEqual(p.scale_measurements.map(r=>r.resource_id),['STATIC-01','STATIC-01']);
 assert.deepEqual(p.scale_measurements.map(r=>r.indicator_id),['STATIC-IND-01','STATIC-IND-01']);
 assert.deepEqual(p.scale_measurements.map(r=>r.kind),['tare','gross']);
 assert.ok(p.scale_measurements.every(r=>r.weight_kg%20===0&&r.stable));
 assert.equal(p.shared_scale.state,'idle');assert.equal(p.shared_scale.owner_trip_id,null);
 assert.deepEqual(p.resource_history.map(r=>r.action),['acquire_inbound','occupied_tare','release_after_rear_clear','acquire_outbound','occupied_gross','release_after_rear_clear']);
 assert.equal(p.source.tare,p.source.gross);assert.equal(p.source.resource_id,'STATIC-01');
 assert.equal(p.sensor_readings.some(r=>/WIM|LIDAR|CONFLICT/.test(r.id)),false);
});

test('Phase 1 whole trip never admits both directions and releases only beyond ramp zone',()=>{
 const sim=new SingleStaticSimulation(config());sim.start();let samples=0;
 while(!sim.done&&!sim.blocked&&samples++<4000){
  sim.advance(.25);const p=sim.payload();
  assert.equal(p.gate_state.inbound_admission==='green'&&p.gate_state.outbound_admission==='green',false);
  if(['static_approach','static_settle','static_record','entry_depart'].includes(sim.stage.id))assert.equal(p.shared_scale.direction,'inbound');
  if(['wim_approach','wim_measure','exit_record','exit_depart'].includes(sim.stage.id))assert.equal(p.shared_scale.direction,'outbound');
 }
 assert.equal(sim.done,true);assert.ok(samples<4000);
});

test('Phase 1 both readings quantized consistently allow reference zero-load case',()=>{
 const p=finish(new SingleStaticSimulation(config({capacity:8,tare:8150,manual:true,gross:8150})));
 assert.equal(p.measurement.tare_kg,8160);assert.equal(p.measurement.gross_kg,8160);
 assert.equal(p.weight_valid,true);assert.equal(p.measurement.net_cargo_kg,0);assert.equal(p.measurement.volume_equivalent_m3,0);
});

test('Phase 1 accepts exact 80 t but rejects raw overrange before publishing final gross',()=>{
 const good=finish(new SingleStaticSimulation(config({manual:true,gross:80000})));
 assert.equal(good.weight_valid,true);assert.equal(good.measurement.gross_kg,80000);
 const sim=new SingleStaticSimulation(config({manual:true,gross:80001}));const bad=finish(sim);
 assert.equal(sim.blocked,true);assert.equal(bad.weight_valid,false);assert.equal(bad.measurement.net_cargo_kg,null);assert.equal(bad.measurement.gross_kg,null);
 assert.equal(bad.invalid_reading.reason,'invalid_or_overrange');assert.equal(bad.shared_scale.direction,'outbound');assert.equal(bad.shared_scale.occupied,true);
 assert.deepEqual(bad.gate_state,{inbound_admission:'red',outbound_admission:'red',demonstration_only:true});
});

test('Phase 1 unstable inbound or outbound indicator holds resource and emits no valid net',()=>{
 for(const fault of ['static','wim']){
  const sim=new SingleStaticSimulation(config({fault}));const p=finish(sim);
  assert.equal(sim.blocked,true);assert.equal(p.weight_valid,false);assert.equal(p.measurement.net_cargo_kg,null);assert.equal(p.shared_scale.occupied,true);
  assert.equal(p.gate_state.inbound_admission,'red');assert.equal(p.gate_state.outbound_admission,'red');
 }
});

test('Phase 1 mining profile is held before reserving or entering the single scale',()=>{
 const sim=new SingleStaticSimulation(config({truckProfile:'mining'}));const p=finish(sim);
 assert.equal(sim.blocked,true);assert.equal(p.measurement.tare_kg,null);assert.equal(p.measurement.gross_kg,null);
 assert.equal(p.shared_scale.state,'idle');assert.equal(p.scale_measurements.length,0);
});

test('Phase 1 manual QR requires correct gate ordering and same trip token',()=>{
 const sim=new SingleStaticSimulation(config({autoQR:false}));sim.start();sim.advance(10000);
 assert.equal(sim.stage.id,'entry_qr');assert.equal(sim.scan('exit'),false);assert.equal(sim.scan('entry',true),false);
 assert.equal(sim.scan('entry'),true);assert.equal(sim.scan('entry'),false);
 sim.start();sim.advance(10000);assert.equal(sim.stage.id,'exit_qr');assert.equal(sim.scan('exit'),true);
 const p=finish(sim);assert.equal(p.complete,true);assert.equal(p.erp.entry_scanned,true);assert.equal(p.erp.exit_scanned,true);assert.equal(p.erp.history[0].trip_id,p.erp.history[1].trip_id);
});

test('Phase 1 offline status explicitly remains an illustration without durable persistence',()=>{
 const p=finish(new SingleStaticSimulation(config({fault:'offline'})));
 assert.equal(p.complete,true);assert.equal(p.delivery.persistence,false);assert.equal(p.delivery.offline_buffer_illustrative,true);assert.equal(p.delivery.mode,'illustrative_local_record_not_durable');
});

test('single-scale traffic capacity accounts for both passes and makes no queue-delay promise',()=>{
 const low=singleStaticFlow(240,10,10);const high=singleStaticFlow(120,10,10);
 assert.equal(low.physical_stations,1);assert.equal(low.passes_per_trip,2);assert.equal(low.static_service_s,110);assert.equal(low.shared_service_per_trip_s,220);
 assert.ok(Math.abs(low.ideal_capacity_per_hour-3600/220)<1e-10);assert.ok(Math.abs(low.utilization-11/12)<1e-10);
 assert.equal(low.requires_slotting,false);assert.equal(high.requires_slotting,true);assert.equal(low.queue_wait_estimated,false);assert.equal(low.queue_wait_s,null);
 for(const args of [[0,10,10],[240,4,10],[240,10,0],[NaN,10,10]])assert.throws(()=>singleStaticFlow(...args));
});

test('existing separate two-static scenario still represents two stations and valid normal cargo',()=>{
 const p=finish(new DoubleStaticSimulation(config()));
 assert.equal(p.scenario,'static_inbound_static_outbound');assert.equal(p.static_construction.station_count,2);
 assert.equal(p.measurement.net_cargo_kg,48000);assert.equal(p.weight_valid,true);
});
