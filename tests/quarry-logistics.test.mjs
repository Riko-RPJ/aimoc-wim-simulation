import test from 'node:test';
import assert from 'node:assert/strict';
import {
 createLogisticsState,recordProduction,adjustStockpile,createTruckTrip,recordTruckWeighing,
 dispatchTrip,recordJettyArrival,confirmJettyUnload,reserveVesselLoad,confirmVesselLoad,
 cancelVesselReservation,reconcileVoyage,classifyERPReceipt,logisticsSummary,buildLogisticsDemo
} from '../public/quarry-logistics.js';
const route={product_sku:'AGG-20',order_id:'SO-DEMO-001',destination_id:'BUYER-PORT-DEMO',vessel_id:'BARGE-DEMO-001',voyage_id:'VOY-DEMO-001'};
let sequence=0;
const event=fields=>({event_id:'EV-TEST-'+(++sequence),evidence_id:'EVID-TEST-'+sequence,occurred_at:new Date(Date.UTC(2026,10,2,0,sequence)).toISOString(),...fields});
function env(config={}){let state=createLogisticsState(config);return {get state(){return state;},run(fn,fields){const r=fn(state,event(fields));state=r.state;return r;}};}
function measured(e,trip='T1',truck='TRUCK1',fields={}){
 e.run(createTruckTrip,{...route,trip_id:trip,truck_id:truck,planned_volume_m3:30,density_t_per_m3:1.5,...fields});
 e.run(recordTruckWeighing,{trip_id:trip,mode:'scale',tare_t:15,gross_t:60,instrument_id:'WB-1',stable:true,calibrated:true});return e;
}
function arrived(e,trip='T1',truck='TRUCK1',fields={}){measured(e,trip,truck,fields);e.run(reserveVesselLoad,{...route,...fields,trip_id:trip,reservation_id:trip==='T1'?'R1':'R-'+trip,planned_net_t:45});e.run(dispatchTrip,{trip_id:trip});e.run(recordJettyArrival,{trip_id:trip});return e;}
function unloaded(e,trip='T1',truck='TRUCK1',fields={}){arrived(e,trip,truck,fields);e.run(confirmJettyUnload,{trip_id:trip,received_t:45,confirmed:true});return e;}
const reserve=(trip='T1',reservation='R1',fields={})=>({...route,trip_id:trip,reservation_id:reservation,planned_net_t:45,...fields});
const expectCode=(fn,code)=>assert.throws(fn,error=>error.code===code);
const sku=e=>logisticsSummary(e.state).by_sku.find(r=>r.product_sku==='AGG-20');

test('default planning converts 30 cubic metres at density 1.5 to 45 tonnes and separates 500 crossings',()=>{
 const state=createLogisticsState();const summary=logisticsSummary(state);
 assert.equal(summary.planned_flow.expected_payload_t,45);assert.equal(summary.planned_flow.total_crossings_per_hour,500);
 assert.equal(summary.planned_flow.loaded_trips_per_hour,250);assert.equal(summary.planned_flow.empty_returns_per_hour,250);
 assert.equal(summary.voyages[0].approved_cargo_limit_t,5000);assert.equal(summary.voyages[0].catalog_dwt_t,null);
 assert.equal(summary.limits.actual_throughput_benchmarked,false);assert.equal(state.erp_connected,false);
});
test('default demo conserves material with one loaded trip and one arrival on unload-difference hold',()=>{
 const d=buildLogisticsDemo();const s=d.summary;assert.deepEqual(d.scenario_results,{idempotent_dispatch_replay:true,unload_difference_hold:true,erp_committed:false,all_mass_balances_ok:true});
 assert.deepEqual(s.totals,{quarry_t:610,jetty_t:100,in_transit_t:45,vessel_loaded_t:45,production_t:200,mass_balance_ok:true});
 assert.equal(s.trip_counts.dispatched_trips,2);assert.equal(s.trip_counts.vessel_loaded_trips,1);assert.equal(s.trip_counts.held_trips,1);
 assert.ok(s.by_sku.every(r=>r.mass_balance_ok&&Math.abs(r.quarry_balance_error_t)<1e-8&&Math.abs(r.jetty_balance_error_t)<1e-8));
});
test('volume and density remain editable planning inputs rather than fixed truck tonnage',()=>{
 const d=buildLogisticsDemo({average_volume_m3:28,density_t_per_m3:1.6});assert.ok(Math.abs(d.assumptions.expected_payload_t-44.8)<1e-8);
 assert.ok(Math.abs(d.summary.totals.vessel_loaded_t-44.8)<1e-8);assert.ok(d.summary.totals.mass_balance_ok);
 assert.deepEqual(d.assumptions.planning_payload_range_t,[44.800000000000004,51.2]);
});
test('production adds calibrated classified good output by SKU without inventing output from truck counts',()=>{
 const e=env();const before=structuredClone(e.state);
 const r=e.run(recordProduction,{product_sku:'AGG-10',good_output_t:100,sensor_source:'calibrated_mass_flow',instrument_id:'FLOW-2',calibrated:true});
 assert.equal(r.state.stockpiles.quarry['AGG-10'],100);assert.deepEqual(before.stockpiles,createLogisticsState().stockpiles);
 assert.equal(before.production.length,0);assert.equal(r.state.production[0].quantity_basis,'calibrated_good_output');
 expectCode(()=>e.run(recordProduction,{product_sku:'AGG-20',good_output_t:10,sensor_source:'truck_nominal_capacity',instrument_id:'TRUCK1',calibrated:true}),'UNCALIBRATED_PRODUCTION');
 expectCode(()=>e.run(recordProduction,{product_sku:'UNKNOWN',good_output_t:10,sensor_source:'calibrated_belt_scale',instrument_id:'BELT',calibrated:true}),'UNKNOWN_PRODUCT');
});
test('event replay is exactly once within the state and payload/evidence reuse conflicts are rejected',()=>{
 const state=createLogisticsState();const ev=event({product_sku:'AGG-20',good_output_t:25,sensor_source:'calibrated_belt_scale',instrument_id:'BELT',calibrated:true});
 const first=recordProduction(state,ev),again=recordProduction(first.state,{...ev});assert.equal(again.duplicate,true);assert.equal(again.state,first.state);
 assert.equal(again.state.stockpiles.quarry['AGG-20'],525);assert.equal(state.stockpiles.quarry['AGG-20'],500);
 expectCode(()=>recordProduction(first.state,{...ev,good_output_t:26}),'IDEMPOTENCY_CONFLICT');
 expectCode(()=>recordProduction(first.state,{...ev,event_id:'OTHER-EVENT'}),'EVIDENCE_ALREADY_USED');
});
test('unsafe IDs, missing event identity and invalid timestamps never create ledger events',()=>{
 const state=createLogisticsState();expectCode(()=>dispatchTrip(state,{}),'INVALID_ID');
 expectCode(()=>dispatchTrip(state,event({event_id:'__proto__',trip_id:'T'})),'INVALID_ID');
 expectCode(()=>dispatchTrip(state,event({occurred_at:'not-a-date',trip_id:'T'})),'INVALID_TIMESTAMP');assert.equal(Object.keys(state.events).length,0);
});
test('measured gross minus tare controls dispatch even when nominal planning payload differs',()=>{
 const e=env();e.run(createTruckTrip,{...route,trip_id:'T1',truck_id:'TRUCK1',planned_volume_m3:30,density_t_per_m3:1.5});
 e.run(recordTruckWeighing,{trip_id:'T1',mode:'scale',tare_t:14.5,gross_t:61.2,instrument_id:'WB',stable:true,calibrated:true});
 e.run(reserveVesselLoad,reserve('T1','R1',{planned_net_t:61.2-14.5}));
 e.run(dispatchTrip,{trip_id:'T1'});assert.equal(e.state.trips.T1.planned_net_t,45);assert.ok(Math.abs(e.state.trips.T1.dispatched_t-46.7)<1e-8);
 assert.ok(Math.abs(sku(e).quarry_t-453.3)<1e-8);assert.equal(sku(e).mass_balance_ok,true);
});
test('invalid weights, unstable scales and infinite computed estimates are rejected before dispatch',()=>{
 for(const fields of [{tare_t:60,gross_t:59},{gross_t:Infinity},{stable:false},{calibrated:false}]){
  const e=env();e.run(createTruckTrip,{...route,trip_id:'T1',truck_id:'TRUCK1',planned_volume_m3:30,density_t_per_m3:1.5});
  assert.throws(()=>e.run(recordTruckWeighing,{trip_id:'T1',mode:'scale',tare_t:15,gross_t:60,instrument_id:'WB',stable:true,calibrated:true,...fields}));assert.equal(e.state.trips.T1.measurement,null);
 }
 const e=env();expectCode(()=>e.run(createTruckTrip,{...route,trip_id:'T1',truck_id:'TRUCK1',planned_volume_m3:1e308,density_t_per_m3:1e308}),'INVALID_QUANTITY');
});
test('truck IDs and trip IDs are distinct: one truck can make a later unique trip after confirmed unload',()=>{
 const e=env();measured(e);
 expectCode(()=>e.run(createTruckTrip,{...route,trip_id:'T2',truck_id:'TRUCK1',planned_volume_m3:30,density_t_per_m3:1.5}),'TRUCK_ALREADY_ACTIVE');
 e.run(reserveVesselLoad,reserve());e.run(dispatchTrip,{trip_id:'T1'});e.run(recordJettyArrival,{trip_id:'T1'});e.run(confirmJettyUnload,{trip_id:'T1',received_t:45,confirmed:true});
 e.run(createTruckTrip,{...route,trip_id:'T2',truck_id:'TRUCK1',planned_volume_m3:30,density_t_per_m3:1.5});
 assert.equal(logisticsSummary(e.state).trip_counts.unique_trucks,1);assert.equal(logisticsSummary(e.state).trip_counts.unique_trips,2);
 expectCode(()=>e.run(createTruckTrip,{...route,trip_id:'T2',truck_id:'TRUCK2',planned_volume_m3:30,density_t_per_m3:1.5}),'DUPLICATE_TRIP');
});
test('trip creation validates product, order, destination, vessel and voyage routing',()=>{
 for(const fields of [{product_sku:'DUST'},{order_id:'UNKNOWN'},{destination_id:'OTHER'},{vessel_id:'OTHER'},{voyage_id:'OTHER'}]){
  const e=env();assert.throws(()=>e.run(createTruckTrip,{...route,trip_id:'T1',truck_id:'TRUCK1',planned_volume_m3:30,density_t_per_m3:1.5,...fields}));assert.equal(Object.keys(e.state.trips).length,0);
 }
});
test('insufficient quarry stock rolls back dispatch and does not create an outbox or transit debit',()=>{
 const e=env({opening_quarry_t:10});measured(e);e.run(reserveVesselLoad,reserve());const before=structuredClone(e.state);
 expectCode(()=>e.run(dispatchTrip,{trip_id:'T1'}),'INSUFFICIENT_STOCK');assert.deepEqual(e.state,before);
});
test('jetty arrival changes status only and unload credits once without debiting quarry twice',()=>{
 const e=env();measured(e);e.run(reserveVesselLoad,reserve());e.run(dispatchTrip,{trip_id:'T1'});const dispatched=sku(e);
 const arrival=e.run(recordJettyArrival,{trip_id:'T1'});assert.equal(arrival.result.inventory_moved,false);assert.equal(sku(e).jetty_t,100);assert.equal(sku(e).in_transit_t,45);
 const ev=event({trip_id:'T1',received_t:45,confirmed:true});const received=confirmJettyUnload(e.state,ev);const repeated=confirmJettyUnload(received.state,ev);
 assert.equal(repeated.duplicate,true);const row=logisticsSummary(received.state).by_sku[0];assert.equal(row.quarry_t,dispatched.quarry_t);assert.equal(row.jetty_t,145);assert.equal(row.in_transit_t,0);assert.ok(row.mass_balance_ok);
 expectCode(()=>confirmJettyUnload(received.state,event({trip_id:'T1',received_t:45,confirmed:true})),'TRIP_STATE');
});
test('unconfirmed receipt and material unload difference retain transit stock and block vessel load',()=>{
 const e=env();arrived(e);const before=sku(e);const hold=e.run(confirmJettyUnload,{trip_id:'T1',received_t:43,confirmed:true});
 assert.equal(hold.result.status,'hold');assert.equal(e.state.trips.T1.status,'unload_hold');assert.equal(sku(e).in_transit_t,45);assert.equal(sku(e).jetty_t,before.jetty_t);
 expectCode(()=>e.run(confirmVesselLoad,{reservation_id:'R1',loaded_t:43,operator_confirmed:true}),'UNLOAD_NOT_CONFIRMED');
 assert.equal(e.state.outbox.at(-1).live_erp_commit,false);assert.equal(sku(e).mass_balance_ok,true);
 const e2=env();arrived(e2);assert.equal(e2.run(confirmJettyUnload,{trip_id:'T1',received_t:45,confirmed:false}).result.status,'hold');
});
test('explicit variance approval releases hold and records its mass-balance adjustment separately',()=>{
 const e=env();arrived(e);e.run(confirmJettyUnload,{trip_id:'T1',received_t:43,confirmed:true});
 e.run(confirmJettyUnload,{trip_id:'T1',received_t:43,confirmed:true,difference_approved:true,approved_by:'DEMO-OPERATOR',approval_evidence_id:'VARIANCE-APPROVAL-1'});
 const row=sku(e);assert.equal(row.in_transit_t,0);assert.equal(row.jetty_t,143);assert.equal(row.adjustments_t,-2);assert.ok(row.mass_balance_ok);assert.equal(row.jetty_balance_error_t,0);
});
test('reservations reject route mismatch before consuming capacity',()=>{
 const e=env();measured(e);for(const fields of [{vessel_id:'WRONG'},{voyage_id:'WRONG'},{order_id:'TO-DEMO-001'},{product_sku:'AGG-10'},{destination_id:'WRONG'}]){
  expectCode(()=>e.run(reserveVesselLoad,reserve('T1','R1',fields)),'ROUTE_MISMATCH');
 }
 assert.equal(Object.keys(e.state.reservations).length,0);
});
test('reservation capacity includes loaded cargo and every open reservation',()=>{
 const e=env({approved_cargo_limit_t:80});unloaded(e);e.run(confirmVesselLoad,{reservation_id:'R1',loaded_t:45,operator_confirmed:true});
 measured(e,'T2','TRUCK2');expectCode(()=>e.run(reserveVesselLoad,reserve('T2','R2')),'VESSEL_CAPACITY_EXCEEDED');
 assert.equal(logisticsSummary(e.state).voyages[0].loaded_t,45);assert.equal(logisticsSummary(e.state).voyages[0].reserved_t,0);
 const e2=env({approved_cargo_limit_t:80});measured(e2);measured(e2,'T2','TRUCK2');e2.run(reserveVesselLoad,reserve());expectCode(()=>e2.run(reserveVesselLoad,reserve('T2','R2')),'VESSEL_CAPACITY_EXCEEDED');
});
test('reservations equal captured cargo and actual receipt/load recheck still prevents excess capacity',()=>{
 const e=env({approved_cargo_limit_t:45});measured(e);
 for(const planned_net_t of [1,30,46,5000])expectCode(()=>e.run(reserveVesselLoad,reserve('T1','R1',{planned_net_t})),'RESERVATION_QUANTITY_MISMATCH');
 e.run(reserveVesselLoad,reserve());e.run(dispatchTrip,{trip_id:'T1'});e.run(recordJettyArrival,{trip_id:'T1'});e.run(confirmJettyUnload,{trip_id:'T1',received_t:45.2,confirmed:true});
 expectCode(()=>e.run(confirmVesselLoad,{reservation_id:'R1',loaded_t:45.2,operator_confirmed:true}),'VESSEL_CAPACITY_EXCEEDED');assert.equal(sku(e).jetty_t,145.2);
 const e2=env({orders:[{...route,order_id:route.order_id,type:'sales_order',quantity_t:40}]});measured(e2);expectCode(()=>e2.run(reserveVesselLoad,reserve()),'ORDER_QUANTITY_EXCEEDED');
});
test('vessel load requires confirmation, exact received cargo and a unique manifest/evidence',()=>{
 const e=env();unloaded(e);
 expectCode(()=>e.run(confirmVesselLoad,{reservation_id:'R1',loaded_t:44,operator_confirmed:true}),'LOAD_QUANTITY_MISMATCH');
 expectCode(()=>e.run(confirmVesselLoad,{reservation_id:'R1',loaded_t:45,operator_confirmed:false}),'LOAD_NOT_CONFIRMED');
 const ev=event({reservation_id:'R1',loaded_t:45,operator_confirmed:true});const a=confirmVesselLoad(e.state,ev);const b=confirmVesselLoad(a.state,ev);
 assert.equal(b.duplicate,true);assert.equal(a.state.manifests.length,1);assert.equal(a.state.stockpiles.jetty['AGG-20'],100);
 expectCode(()=>confirmVesselLoad(a.state,event({reservation_id:'R1',loaded_t:45,operator_confirmed:true})),'ALREADY_LOADED');
});
test('cancelled reservations release capacity without moving stock or double-counting order commitments',()=>{
 const e=env({approved_cargo_limit_t:50});measured(e);e.run(reserveVesselLoad,reserve());const before=structuredClone(e.state.stockpiles);
 e.run(cancelVesselReservation,{reservation_id:'R1',reason:'Demo allocation changed'});assert.equal(logisticsSummary(e.state).voyages[0].reserved_t,0);assert.deepEqual(e.state.stockpiles,before);
 e.run(reserveVesselLoad,reserve('T1','R2'));assert.equal(logisticsSummary(e.state).voyages[0].reserved_t,45);
});
test('dispatch requires an active matching cargo slot and an in-transit slot cannot silently be cancelled',()=>{
 const e=env();measured(e);expectCode(()=>e.run(dispatchTrip,{trip_id:'T1'}),'VESSEL_RESERVATION_REQUIRED');
 e.run(reserveVesselLoad,reserve());e.run(dispatchTrip,{trip_id:'T1'});
 expectCode(()=>e.run(cancelVesselReservation,{reservation_id:'R1',reason:'Unapproved reroute'}),'RESERVATION_IN_TRANSIT');
 assert.equal(logisticsSummary(e.state).voyages[0].reserved_t,45);assert.equal(sku(e).in_transit_t,45);assert.ok(sku(e).mass_balance_ok);
});
test('independent survey reconciliation uses cargo sum but never certifies stability or posts ERP',()=>{
 const e=env();unloaded(e);e.run(confirmVesselLoad,{reservation_id:'R1',loaded_t:45,operator_confirmed:true});
 expectCode(()=>e.run(reconcileVoyage,{vessel_id:route.vessel_id,voyage_id:route.voyage_id,method:'truck_count',independent_total_t:45,operator_confirmed:true}),'INVALID_SURVEY');
 const hold=e.run(reconcileVoyage,{vessel_id:route.vessel_id,voyage_id:route.voyage_id,method:'draft_survey',independent_total_t:48,operator_confirmed:true});assert.equal(hold.result.status,'hold');
 const ok=e.run(reconcileVoyage,{vessel_id:route.vessel_id,voyage_id:route.voyage_id,method:'independent_marine_survey',independent_total_t:45.2,operator_confirmed:true});
 assert.equal(ok.result.status,'reconciled_demo');assert.equal(ok.result.marine_safety_certified,false);assert.equal(ok.result.erp_committed,false);assert.ok(sku(e).mass_balance_ok);
});
test('a voyage with open reservations cannot be labelled finally reconciled',()=>{
 const e=env();unloaded(e);e.run(confirmVesselLoad,{reservation_id:'R1',loaded_t:45,operator_confirmed:true});
 measured(e,'T2','TRUCK2');e.run(reserveVesselLoad,reserve('T2','R2'));
 expectCode(()=>e.run(reconcileVoyage,{vessel_id:route.vessel_id,voyage_id:route.voyage_id,method:'draft_survey',independent_total_t:45,operator_confirmed:true}),'OPEN_RESERVATIONS');
});
test('a new reservation reopens a previously reconciled voyage and invalidates its former ERP review candidate',()=>{
 const e=env();unloaded(e);e.run(confirmVesselLoad,{reservation_id:'R1',loaded_t:45,operator_confirmed:true});
 e.run(reconcileVoyage,{vessel_id:route.vessel_id,voyage_id:route.voyage_id,method:'draft_survey',independent_total_t:45,operator_confirmed:true});
 assert.equal(e.state.outbox.at(-1).status,'candidate_for_review');measured(e,'T2','TRUCK2');e.run(reserveVesselLoad,reserve('T2','R2'));
 assert.equal(logisticsSummary(e.state).voyages[0].reconciliation,'reopened_loading');
 assert.equal(e.state.outbox.find(o=>o.stage==='voyage_manifest_reconciliation').status,'hold');
 assert.equal(e.state.manifests[0].independent_reconciliation,'pending');
});
test('no-scale mode stays visibly estimated and cannot produce an ERP review-ready marine reconciliation',()=>{
 const d=buildLogisticsDemo({measurement_mode:'no_scale_estimate'});assert.equal(d.state.trips['TRIP-DEMO-001'].measurement.net_t,45);
 assert.equal(d.state.trips['TRIP-DEMO-001'].measurement.quantity_basis,'estimate_not_weighed');assert.ok(d.summary.by_sku[0].contains_unweighed_estimates);
 assert.equal(d.summary.voyages[0].reconciliation,'hold');assert.ok(d.state.outbox.filter(r=>r.trip_id==='TRIP-DEMO-001').every(r=>r.status==='hold'));
 assert.ok(d.state.outbox.every(r=>r.persisted===false&&r.live_erp_commit===false&&r.erp_business_ack===false));
});
test('own-stock transfer and buyer fulfillment remain distinct ERP candidates without duplicate ledger debit',()=>{
 const e=env();unloaded(e,'T1','TRUCK1',{order_id:'TO-DEMO-001'});e.run(confirmVesselLoad,{reservation_id:'R1',loaded_t:45,operator_confirmed:true});
 assert.equal(e.state.manifests[0].order_type,'own_transfer');assert.equal(e.state.outbox.at(-1).stage,'own_transfer_manifest_reference_no_second_debit');assert.equal(sku(e).quarry_t,455);assert.ok(sku(e).mass_balance_ok);
 const d=buildLogisticsDemo();assert.ok(d.state.outbox.some(r=>r.stage==='buyer_sales_order_item_fulfillment_review'));
});
test('approved stock adjustments balance by SKU and never silently permit negative inventory',()=>{
 const e=env();expectCode(()=>e.run(adjustStockpile,{location:'quarry',product_sku:'AGG-20',delta_t:-2,approved:false,reason:'survey',approved_by:'OP'}),'ADJUSTMENT_APPROVAL_REQUIRED');
 e.run(adjustStockpile,{location:'quarry',product_sku:'AGG-20',delta_t:-2,approved:true,reason:'survey',approved_by:'OP'});assert.equal(sku(e).quarry_t,498);assert.ok(sku(e).mass_balance_ok);
 expectCode(()=>e.run(adjustStockpile,{location:'quarry',product_sku:'AGG-20',delta_t:-600,approved:true,reason:'survey',approved_by:'OP'}),'INSUFFICIENT_STOCK');
});
test('DWT is optional catalog metadata and cannot substitute for an explicit synthetic cargo limit',()=>{
 const vessel={vessel_id:'V1',voyage_id:'VOY1',destination_id:'D1',allowed_products:['AGG-20'],catalog_dwt_t:6000};
 expectCode(()=>createLogisticsState({vessels:[vessel]}),'INVALID_QUANTITY');
 expectCode(()=>createLogisticsState({vessels:[{...vessel,operator_approved_cargo_limit_t:5000}]}),'MISSING_CARGO_APPROVAL');
 expectCode(()=>createLogisticsState({vessels:[{...vessel,operator_approved_cargo_limit_t:7000,approval_reference:'DEMO'}]}),'CARGO_LIMIT_EXCEEDS_DWT');
 const s=createLogisticsState({vessels:[{...vessel,operator_approved_cargo_limit_t:4500,approval_reference:'DEMO'}]});assert.equal(logisticsSummary(s).voyages[0].remaining_t,4500);assert.equal(s.vessels.V1.safety_certified,false);
});
test('HTTP accepted responses are not ERP business acknowledgements or record persistence',()=>{
 for(const r of [{http_status:202},{http_status:200,business_status:'accepted'},{http_status:200,business_status:'posted',record_id:'123',idempotency_key:'WRONG'}]){
  const a=classifyERPReceipt(r,'AIMOC:EV-1');assert.equal(a.http_ack,true);assert.equal(a.sync_complete,false);assert.equal(a.record_id,null);
 }
 const ack=classifyERPReceipt({http_status:201,business_status:'posted',record_id:'ERP-DEMO-123',idempotency_key:'AIMOC:EV-1'},'AIMOC:EV-1');assert.equal(ack.erp_business_ack,true);assert.equal(ack.sync_complete,true);
 assert.match(ack.qualification,/no ERP connection/);assert.equal(classifyERPReceipt({http_status:500},'AIMOC:EV-1').http_ack,false);
});
