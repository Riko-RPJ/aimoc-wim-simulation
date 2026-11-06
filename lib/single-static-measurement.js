import {assertErpSystem,readErpAlias} from './erp-contract.js';
import {normalize} from './measurement.js';

const RESOURCE='STATIC-01', INDICATOR='STATIC-IND-01';
const SOURCE='shared_static_indicator_via_iot_gateway';
const ACTIONS=['acquire_inbound','occupied_tare','release_after_rear_clear','acquire_outbound','occupied_gross','release_after_rear_clear'];

// Contract validation of a SYNTHETIC shared-station sequence, not a certified safety interlock.
export function normalizeSingleStatic(p){
  if(!p||p.schema_version!=='4.0'||p.phase!=='phase1'||p.scenario!=='single_static_inbound_outbound'||p.synthetic!==true||p.complete!==true||p.weight_valid!==true){
    throw Error('A complete valid synthetic Phase 1 single-static trip is required.');
  }
  assertErpSystem(p);const m=p.measurement,q=readErpAlias(p,'erp','sap'),s=p.source,c=p.static_construction,l=p.layout;
  if(!s||s.tare!==SOURCE||s.gross!==SOURCE||s.resource_id!==RESOURCE||s.indicator_id!==INDICATOR||!l||l.physical_static_stations!==1||l.wim_stations!==0||l.shared_entry_exit!==true||l.independent_parallel_capacity!==false||!c||c.station_count!==1||c.indicators!==1||c.capacity_kg!==80000||c.division_kg!==20){
    throw Error('Phase 1 requires one shared STATIC-01 station and STATIC-IND-01 indicator for both directions.');
  }
  if(!m||![m.tare_kg,m.gross_kg,m.density_t_per_m3].every(Number.isFinite)||m.tare_kg%20!==0||m.gross_kg%20!==0||m.tare_kg>80000||m.gross_kg>80000||p.static_compatibility?.status==='engineering_hold'||p.invalid_reading!=null){
    throw Error('Static readings must be valid in-range 80 t weights on 20 kg divisions.');
  }
  if(!q||q.trip_id!==p.trip_id||q.entry_scanned!==true||q.exit_scanned!==true||q.closed!==true||!q.order){
    throw Error('Entry and exit QR scans must be closed on the same trip and order.');
  }
  const history=q.history;
  if(!Array.isArray(history)||history.length!==2||history[0].direction!=='entry'||history[1].direction!=='exit'||history.some(h=>h.trip_id!==p.trip_id||h.order_id!==q.order.order_id||!Number.isFinite(Date.parse(h.at)))||Date.parse(history[1].at)<Date.parse(history[0].at)){
    throw Error('Invalid entry/exit QR history for the shared-station trip.');
  }
  const readings=p.scale_measurements;
  if(!Array.isArray(readings)||readings.length!==2||readings.some((r,i)=>r.trip_id!==p.trip_id||r.resource_id!==RESOURCE||r.indicator_id!==INDICATOR||r.stable!==true||r.division_kg!==20||r.kind!==['tare','gross'][i]||r.direction!==['inbound','outbound'][i]||r.weight_kg!==[m.tare_kg,m.gross_kg][i])){
    throw Error('Two stable readings from the same indicator and trip are required.');
  }
  const resource=p.shared_scale;
  if(!resource||resource.resource_id!==RESOURCE||resource.physical_station_count!==1||resource.shared_by_directions!==true||resource.state!=='idle'||resource.owner_trip_id!==null||resource.direction!==null||resource.occupied!==false){
    throw Error('The shared station must be released and clear after the completed trip.');
  }
  const events=p.resource_history;
  if(!Array.isArray(events)||events.length!==ACTIONS.length||events.some((e,i)=>{
    if(e.action!==ACTIONS[i]||e.resource_id!==RESOURCE||e.physical_station_count!==1||e.shared_by_directions!==true||!Number.isFinite(e.time_s)||e.time_s<0||(i>0&&e.time_s<events[i-1].time_s))return true;
    const expectedDirection=['inbound','inbound',null,'outbound','outbound',null][i];
    const expectedState=['reserved','occupied','idle','reserved','occupied','idle'][i];
    const expectedOccupied=i===1||i===4;
    if(e.direction!==expectedDirection||e.state!==expectedState||e.occupied!==expectedOccupied)return true;
    return e.action==='release_after_rear_clear'?e.owner_trip_id!==null:e.owner_trip_id!==p.trip_id;
  })){
    throw Error('The synthetic reservation sequence must release inbound before outbound admission.');
  }
  if(!p.gate_state||p.gate_state.demonstration_only!==true||p.gate_state.inbound_admission!=='red'||p.gate_state.outbound_admission!=='red'){
    throw Error('Both demonstration admission gates must be red after the shared resource is released.');
  }
  // Recompute all commercial numbers from canonical weights; never trust derived client totals.
  const base=normalize({schema_version:'1.0',synthetic:true,trip_id:p.trip_id,measured_at:p.measured_at,vehicle:{...p.vehicle,rfid:''},tare_kg:m.tare_kg,gross_kg:m.gross_kg,density_t_per_m3:m.density_t_per_m3,decision:'Green',identity_valid:true,identity_method:'QR',erp_order:q.order,qr_trip:{trip_id:p.trip_id,entry_scanned:true,exit_scanned:true}});
  return {...base,schema_version:'4.0',phase:'phase1',scenario:'single_static_inbound_outbound',identity:{...base.identity,trip_id:p.trip_id},source:{tare:SOURCE,gross:SOURCE,resource_id:RESOURCE,indicator_id:INDICATOR},layout:{physical_static_stations:1,wim_stations:0,shared_entry_exit:true,independent_parallel_capacity:false},static_construction:{station_count:1,indicators:1,capacity_kg:80000,division_kg:20},scale_measurements:readings.map(r=>({...r})),shared_scale:{...resource},resource_history:events.map(e=>({...e})),resource_validation:'synthetic_sequence_only_not_physical_safety_proof',volume_assessment:{capacity_m3:p.vehicle.capacity_m3,volume_equivalent_m3:base.measurement.volume_m3,excess_m3:Math.max(0,base.measurement.volume_m3-p.vehicle.capacity_m3)},commercial_match_decision:null};
}
