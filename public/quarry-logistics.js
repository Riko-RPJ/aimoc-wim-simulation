// Pure, synthetic material ledger. No network, persistence, ERP writes, or vessel safety certification.
export const NETSUITE_CANDIDATES = Object.freeze([
  {stage:'crusher_good_output',candidate:'Work Order Completion / Assembly Build, after item/BOM/WIP design',requires:'Manufacturing features, cost/issue/yield policy and account-specific validation',url:'https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/chapter_N2335392.html'},
  {stage:'own_stockpile_transfer',candidate:'Transfer Order -> Item Fulfillment -> Item Receipt',requires:'Multi-Location Inventory and approved location/subsidiary/UOM mapping; keeps in-transit stage',url:'https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N2308766.html'},
  {stage:'immediate_own_transfer',candidate:'Inventory Transfer, only for approved immediate movement',requires:'No independent in-transit stage; never post this as well as the Transfer Order for the same movement',url:'https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_0817112542.html'},
  {stage:'buyer_shipment',candidate:'Sales Order -> Item Fulfillment, at approved shipping/ownership milestone',requires:'Customer/order line/location/UOM mapping, Advanced Shipping/billing policy; not a second stock transfer',url:'https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_161425629582.html'}
]);
export const DEFAULT_QUARRY_CONFIG = Object.freeze({
  average_volume_m3:30,density_t_per_m3:1.5,loaded_trips_per_hour:250,empty_returns_per_hour:250,
  approved_cargo_limit_t:5000,unload_tolerance_t:0.25,survey_tolerance_t:1,
  opening_quarry_t:500,opening_jetty_t:100,production_t:200
});
const EPS=1e-7;
const clone=x=>structuredClone(x);
const stable=x=>x&&typeof x==='object'?(Array.isArray(x)?'['+x.map(v=>stable(v)??'null').join(',')+']':'{'+Object.keys(x).filter(k=>x[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}'):JSON.stringify(x);
function fail(code,message){const error=new Error(message);error.code=code;throw error;}
function requireThat(condition,code,message){if(!condition)fail(code,message);}
function id(value,label='id'){requireThat(typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/.test(value)&&!['constructor','prototype','__proto__'].includes(value),'INVALID_ID',label+' is required and must be a safe unique ID.');return value;}
function number(value,label,positive=false){requireThat(typeof value==='number'&&Number.isFinite(value)&&(positive?value>0:value>=0),'INVALID_QUANTITY',label+' must be a finite '+(positive?'positive':'non-negative')+' number.');return value;}
function known(dict,key,label){id(key,label);requireThat(Object.hasOwn(dict,key),'UNKNOWN_'+label.toUpperCase(),'Unknown '+label+': '+key);return dict[key];}
function product(state,sku){return known(state.products,sku,'product');}
function quantity(trip){requireThat(trip.measurement,'MISSING_MEASUREMENT','A measured or explicitly estimated quantity is required.');return trip.measurement.net_t;}
function candidate(state,event,stage,eligible,reason){
 const row={outbox_id:'OUT:'+event.event_id,event_id:event.event_id,evidence_id:event.evidence_id,idempotency_key:'AIMOC:'+event.event_id,
  stage,trip_id:event.trip_id||null,vessel_id:event.vessel_id||null,voyage_id:event.voyage_id||null,product_sku:event.product_sku||null,quantity_t:event.quantity_t??null,
  status:eligible?'candidate_for_review':'hold',hold_reason:eligible?null:reason,
  transport_status:'not_sent_demo',http_ack:false,erp_business_ack:false,erp_record_id:null,persisted:false,live_erp_commit:false,
  semantics:'HTTP receipt or queue acceptance does not mean ERP business posting. Durable outbox and server-side deduplication are not implemented in this browser demo.'};
 state.outbox.push(row);return row;
}
function transact(state,kind,event,apply){
 requireThat(state?.schema_version==='1.0'&&state.synthetic_only===true,'INVALID_STATE','Expected synthetic logistics state.');
 id(event?.event_id,'event_id');id(event?.evidence_id,'evidence_id');
 requireThat(typeof event.occurred_at==='string'&&Number.isFinite(Date.parse(event.occurred_at)),'INVALID_TIMESTAMP','occurred_at must be an explicit valid timestamp.');
 const fingerprint=stable({kind,event});const previous=state.events[event.event_id];
 if(previous){requireThat(previous.fingerprint===fingerprint,'IDEMPOTENCY_CONFLICT','An event_id cannot be reused with different data.');return {state,accepted:true,duplicate:true,result:clone(previous.result)};}
 requireThat(!state.evidence_index[event.evidence_id],'EVIDENCE_ALREADY_USED','This evidence_id has already been used by another event.');
 const next=clone(state);const result=apply(next)||{};
 next.events[event.event_id]={kind,event_id:event.event_id,evidence_id:event.evidence_id,occurred_at:event.occurred_at,fingerprint,result:clone(result)};
 next.evidence_index[event.evidence_id]=event.event_id;
 return {state:next,accepted:true,duplicate:false,result};
}
function changeStock(state,location,sku,delta){
 product(state,sku);const next=state.stockpiles[location][sku]+delta;
 requireThat(Number.isFinite(next)&&next>=-EPS,'INSUFFICIENT_STOCK','Insufficient '+location+' stock for '+sku+'.');
 state.stockpiles[location][sku]=Math.abs(next)<EPS?0:next;
}
function route(state,trip,event){
 const order=known(state.orders,trip.order_id,'order');const vessel=known(state.vessels,trip.vessel_id,'vessel');
 for(const key of ['vessel_id','voyage_id','order_id','product_sku','destination_id'])requireThat(event[key]===trip[key],'ROUTE_MISMATCH','Allocation '+key+' differs from the truck trip.');
 requireThat(vessel.voyage_id===trip.voyage_id&&order.destination_id===trip.destination_id&&order.product_sku===trip.product_sku,'ROUTE_MISMATCH','Voyage, product, order and destination must agree.');
 requireThat(vessel.allowed_products.includes(trip.product_sku)&&vessel.destination_id===trip.destination_id,'ROUTE_MISMATCH','Vessel product or destination is incompatible.');
 return {order,vessel};
}
function voyageTotals(state,vesselId,voyageId,omitReservation){
 const rows=Object.values(state.reservations).filter(r=>r.vessel_id===vesselId&&r.voyage_id===voyageId&&r.reservation_id!==omitReservation);
 return {reserved_t:rows.filter(r=>r.status==='reserved').reduce((s,r)=>s+r.planned_net_t,0),loaded_t:rows.filter(r=>r.status==='loaded').reduce((s,r)=>s+r.loaded_t,0)};
}
export function createLogisticsState(config={}){
 const c={...DEFAULT_QUARRY_CONFIG,...config};for(const key of ['average_volume_m3','density_t_per_m3','approved_cargo_limit_t'])number(c[key],key,true);
 for(const key of ['opening_quarry_t','opening_jetty_t','production_t','loaded_trips_per_hour','empty_returns_per_hour','unload_tolerance_t','survey_tolerance_t'])number(c[key],key);
 number(c.average_volume_m3*c.density_t_per_m3,'expected planning payload',true);number(c.loaded_trips_per_hour+c.empty_returns_per_hour,'planned crossings per hour');
 const products=config.products||[{product_sku:'AGG-20',name:'Aggregate 20 mm',good_product:true},{product_sku:'AGG-10',name:'Aggregate 10 mm',good_product:true},{product_sku:'DUST',name:'Stone dust',good_product:true}];
 const productMap={};for(const p of products){id(p.product_sku,'product_sku');requireThat(!productMap[p.product_sku],'DUPLICATE_PRODUCT','Duplicate SKU.');productMap[p.product_sku]={...p};}
 requireThat(products.length>0,'MISSING_PRODUCT','At least one product SKU is required.');const first=products[0].product_sku;
 const vessels=config.vessels||[{vessel_id:'BARGE-DEMO-001',name:'Synthetic planning barge',voyage_id:'VOY-DEMO-001',destination_id:'BUYER-PORT-DEMO',allowed_products:[first],catalog_dwt_t:config.catalog_dwt_t??null,operator_approved_cargo_limit_t:c.approved_cargo_limit_t,approval_reference:'SYNTHETIC-DEMO-LIMIT',approval_synthetic:true}];
 const vesselMap={};for(const v of vessels){
  id(v.vessel_id,'vessel_id');id(v.voyage_id,'voyage_id');id(v.destination_id,'destination_id');
  requireThat(!vesselMap[v.vessel_id],'DUPLICATE_VESSEL','Duplicate vessel ID.');number(v.operator_approved_cargo_limit_t,'operator_approved_cargo_limit_t',true);
  requireThat(typeof v.approval_reference==='string'&&v.approval_reference.trim(),'MISSING_CARGO_APPROVAL','An explicit cargo-limit approval reference is required; DWT is not usable cargo.');
  requireThat(Array.isArray(v.allowed_products)&&v.allowed_products.length>0&&v.allowed_products.every(sku=>Object.hasOwn(productMap,sku)),'INVALID_PRODUCT','Vessel allowed_products must reference configured good SKUs.');
  if(v.catalog_dwt_t!=null){number(v.catalog_dwt_t,'catalog_dwt_t',true);requireThat(v.operator_approved_cargo_limit_t<=v.catalog_dwt_t,'CARGO_LIMIT_EXCEEDS_DWT','Cargo alone cannot exceed catalog DWT; usable cargo still needs a separate approved limit.');}
  requireThat(!Object.values(vesselMap).some(x=>x.voyage_id===v.voyage_id),'DUPLICATE_VOYAGE','A voyage_id must uniquely identify one vessel voyage.');
  vesselMap[v.vessel_id]={...v,approval_synthetic:true,safety_certified:false};
 }
 const defaultVessel=vessels[0];requireThat(defaultVessel,'MISSING_VESSEL','A planning vessel is required.');
 const orders=config.orders||[
  {order_id:'SO-DEMO-001',type:'sales_order',product_sku:first,destination_id:defaultVessel.destination_id,quantity_t:c.approved_cargo_limit_t},
  {order_id:'TO-DEMO-001',type:'own_transfer',product_sku:first,destination_id:defaultVessel.destination_id,quantity_t:c.approved_cargo_limit_t}
 ];
 const orderMap={};for(const o of orders){id(o.order_id,'order_id');id(o.destination_id,'destination_id');requireThat(!orderMap[o.order_id]&&Object.hasOwn(productMap,o.product_sku)&&['sales_order','own_transfer'].includes(o.type),'INVALID_ORDER','Order must have a unique ID, known product and sales_order/own_transfer type.');number(o.quantity_t,'order quantity_t',true);orderMap[o.order_id]={...o};}
 const opening={quarry:{},jetty:{}};for(const p of products){const sku=p.product_sku;opening.quarry[sku]=config.opening?.quarry?.[sku]??(sku===first?c.opening_quarry_t:0);opening.jetty[sku]=config.opening?.jetty?.[sku]??(sku===first?c.opening_jetty_t:0);number(opening.quarry[sku],'opening quarry');number(opening.jetty[sku],'opening jetty');}
 return {schema_version:'1.0',synthetic_only:true,persisted:false,erp_connected:false,config:c,products:productMap,vessels:vesselMap,orders:orderMap,
  opening,stockpiles:clone(opening),production:[],adjustments:[],trips:{},reservations:{},manifests:[],surveys:{},events:{},evidence_index:{},outbox:[],
  limits:{vessel_stability_verified:false,loading_plan_certified:false,actual_throughput_benchmarked:false,durable_outbox:false}};
}
export function recordProduction(state,event){return transact(state,'crusher_good_output',event,s=>{
 const p=product(s,event.product_sku);requireThat(p.good_product===true,'NOT_GOOD_PRODUCT','Only classified good output belongs in finished stock.');
 number(event.good_output_t,'good_output_t',true);
 requireThat(['calibrated_belt_scale','calibrated_mass_flow'].includes(event.sensor_source)&&event.calibrated===true,'UNCALIBRATED_PRODUCTION','Production requires calibrated belt/mass-flow output, not truck nominal capacity.');
 id(event.instrument_id,'instrument_id');changeStock(s,'quarry',event.product_sku,event.good_output_t);
 const row={...event,quantity_basis:'calibrated_good_output',quantity_t:event.good_output_t};s.production.push(row);
 candidate(s,{...event,quantity_t:event.good_output_t},'crusher_good_output',true,null);return row;
});}
export function adjustStockpile(state,event){return transact(state,'stock_adjustment',event,s=>{
 requireThat(['quarry','jetty'].includes(event.location),'INVALID_LOCATION','Stock adjustment location must be quarry or jetty.');
 requireThat(typeof event.delta_t==='number'&&Number.isFinite(event.delta_t)&&event.delta_t!==0,'INVALID_QUANTITY','delta_t must be finite and nonzero.');
 requireThat(event.approved===true&&typeof event.approved_by==='string'&&event.approved_by.trim()&&typeof event.reason==='string'&&event.reason.trim(),'ADJUSTMENT_APPROVAL_REQUIRED','Stock corrections require an approver, reason and evidence.');
 changeStock(s,event.location,event.product_sku,event.delta_t);s.adjustments.push({...event,kind:'approved_adjustment'});
 candidate(s,{...event,quantity_t:event.delta_t},'inventory_adjustment_review',true,null);return {delta_t:event.delta_t};
});}
export function createTruckTrip(state,event){return transact(state,'trip_created',event,s=>{
 id(event.trip_id,'trip_id');id(event.truck_id,'truck_id');requireThat(!s.trips[event.trip_id],'DUPLICATE_TRIP','This trip_id already exists.');
 const p=product(s,event.product_sku);requireThat(p.good_product===true,'NOT_GOOD_PRODUCT','Truck routing requires a good product SKU.');
 requireThat(!Object.values(s.trips).some(t=>t.truck_id===event.truck_id&&!['jetty_unloaded','vessel_loaded'].includes(t.status)),'TRUCK_ALREADY_ACTIVE','Truck has an active trip; use a new trip ID after its prior unload.');
 number(event.planned_volume_m3,'planned_volume_m3',true);number(event.density_t_per_m3,'density_t_per_m3',true);
 const plannedNet=event.planned_volume_m3*event.density_t_per_m3;number(plannedNet,'planned_net_t',true);
 const trip={...event,status:'planned',planned_net_t:plannedNet,planning_quantity_basis:'estimated_volume_x_density_not_measured',measurement:null,unload:null,reservation_id:null};
 route(s,trip,event);s.trips[event.trip_id]=trip;return trip;
});}
export function recordTruckWeighing(state,event){return transact(state,'truck_quantity_recorded',event,s=>{
 const t=known(s.trips,event.trip_id,'trip');requireThat(t.status==='planned'&&!t.measurement,'TRIP_STATE','Truck quantity can only be captured once before dispatch.');
 let measurement;
 if(event.mode==='scale'){
  number(event.tare_t,'tare_t');number(event.gross_t,'gross_t',true);requireThat(event.gross_t>event.tare_t,'INVALID_NET','Loaded truck gross must exceed tare.');id(event.instrument_id,'instrument_id');
  requireThat(event.stable===true&&event.calibrated===true,'UNSTABLE_WEIGHT','Both stable readings and calibration status must be confirmed.');
  measurement={...event,net_t:event.gross_t-event.tare_t,quantity_basis:'measured_tare_gross',estimated:false,erp_quantity_reviewable:true};
 }else{
  requireThat(event.mode==='no_scale_estimate','INVALID_MEASUREMENT_MODE','Use scale or explicit no_scale_estimate mode.');
  number(event.volume_m3,'volume_m3',true);number(event.density_t_per_m3,'density_t_per_m3',true);
  number(event.volume_m3*event.density_t_per_m3,'estimated net_t',true);
  measurement={...event,net_t:event.volume_m3*event.density_t_per_m3,quantity_basis:'estimate_not_weighed',estimated:true,erp_quantity_reviewable:false,warning:'Volume x density estimate; not an actual weighed cargo or certified transaction quantity.'};
 }
 t.measurement=measurement;t.status='quantity_recorded';return measurement;
});}
export function dispatchTrip(state,event){return transact(state,'quarry_dispatch',event,s=>{
 const t=known(s.trips,event.trip_id,'trip');requireThat(t.status==='quantity_recorded','TRIP_STATE','Dispatch requires a captured quantity and cannot happen twice.');
 requireThat(t.reservation_id&&s.reservations[t.reservation_id]?.status==='reserved','VESSEL_RESERVATION_REQUIRED','Reserve a matching vessel cargo slot before quarry dispatch.');
 route(s,t,s.reservations[t.reservation_id]);
 const q=quantity(t);changeStock(s,'quarry',t.product_sku,-q);t.status='in_transit';t.dispatched_t=q;t.dispatch_event_id=event.event_id;
 candidate(s,{...event,product_sku:t.product_sku,quantity_t:q},'quarry_to_jetty_transfer_fulfillment',!t.measurement.estimated,'Estimated quantity: await calibrated measurement and approved reconciliation.');
 return {trip_id:t.trip_id,in_transit_t:q,quantity_basis:t.measurement.quantity_basis};
});}
export function recordJettyArrival(state,event){return transact(state,'jetty_arrival',event,s=>{
 const t=known(s.trips,event.trip_id,'trip');requireThat(t.status==='in_transit','TRIP_STATE','Jetty arrival requires an in-transit trip.');
 t.status='jetty_arrived';t.arrival_event_id=event.event_id;return {trip_id:t.trip_id,inventory_moved:false,in_transit_t:t.dispatched_t};
});}
export function confirmJettyUnload(state,event){return transact(state,'jetty_unload',event,s=>{
 const t=known(s.trips,event.trip_id,'trip');requireThat(['jetty_arrived','unload_hold'].includes(t.status),'TRIP_STATE','Unload requires a unique arrived trip that has not been received.');
 number(event.received_t,'received_t');const delta=event.received_t-t.dispatched_t;
 const approvedDifference=Math.abs(delta)<=s.config.unload_tolerance_t||(event.difference_approved===true&&typeof event.approved_by==='string'&&event.approved_by.trim()&&typeof event.approval_evidence_id==='string'&&event.approval_evidence_id.trim());
 if(event.confirmed!==true||!approvedDifference){t.status='unload_hold';t.unload_pending={received_t:event.received_t,difference_t:delta,event_id:event.event_id};candidate(s,{...event,product_sku:t.product_sku,quantity_t:event.received_t},'jetty_receipt',false,'Unload/difference unconfirmed: no inventory receipt or ERP commit.');return {trip_id:t.trip_id,status:'hold',difference_t:delta,inventory_moved:false,erp_commit:false};}
 changeStock(s,'jetty',t.product_sku,event.received_t);
 if(Math.abs(delta)>EPS)s.adjustments.push({event_id:event.event_id,evidence_id:event.evidence_id,location:'jetty',product_sku:t.product_sku,delta_t:delta,kind:'confirmed_transport_variance',approved_difference:Math.abs(delta)<=s.config.unload_tolerance_t?'within_configured_demo_tolerance':event.approved_by});
 t.status='jetty_unloaded';t.unload={received_t:event.received_t,dispatched_t:t.dispatched_t,difference_t:delta,event_id:event.event_id};t.unload_pending=null;
 candidate(s,{...event,product_sku:t.product_sku,quantity_t:event.received_t},'jetty_transfer_item_receipt',!t.measurement.estimated,'Original no-scale quantity remains provisional pending approved independent measurement/reconciliation.');
 return {trip_id:t.trip_id,status:'received',difference_t:delta,received_t:event.received_t,inventory_moved:true,quarry_debited_again:false};
});}

export function reserveVesselLoad(state,event){return transact(state,'vessel_reservation',event,s=>{
 id(event.reservation_id,'reservation_id');requireThat(!s.reservations[event.reservation_id],'DUPLICATE_RESERVATION','Reservation ID already exists.');
 const t=known(s.trips,event.trip_id,'trip');requireThat(t.measurement&&!t.reservation_id&&t.status==='quantity_recorded','TRIP_ALREADY_RESERVED','Capture quantity first and reserve once before quarry dispatch.');
 const {order,vessel}=route(s,t,event);number(event.planned_net_t,'planned_net_t',true);
 requireThat(Math.abs(event.planned_net_t-quantity(t))<=EPS,'RESERVATION_QUANTITY_MISMATCH','Reserve the full captured measured/explicit-estimated quantity; nominal capacity and under/over-reservations are not accepted.');
 const totals=voyageTotals(s,t.vessel_id,t.voyage_id);
 requireThat(totals.loaded_t+totals.reserved_t+event.planned_net_t<=vessel.operator_approved_cargo_limit_t+EPS,'VESSEL_CAPACITY_EXCEEDED','Loaded plus reserved cargo exceeds the explicit operator-approved demo cargo limit; catalog DWT is not this limit.');
 const orderUsed=Object.values(s.reservations).filter(r=>r.order_id===t.order_id&&['reserved','loaded'].includes(r.status)).reduce((sum,r)=>sum+(r.status==='loaded'?r.loaded_t:r.planned_net_t),0);
 requireThat(orderUsed+event.planned_net_t<=order.quantity_t+EPS,'ORDER_QUANTITY_EXCEEDED','Allocation exceeds the configured order quantity.');
 const row={...event,status:'reserved',quantity_basis:'planned_not_loaded',loaded_t:0};s.reservations[event.reservation_id]=row;t.reservation_id=event.reservation_id;
 if(s.surveys[t.voyage_id]?.status==='reconciled_demo'){
  s.surveys[t.voyage_id].status='reopened_loading';
  for(const m of s.manifests.filter(m=>m.vessel_id===t.vessel_id&&m.voyage_id===t.voyage_id))m.independent_reconciliation='pending';
  for(const o of s.outbox.filter(o=>o.stage==='voyage_manifest_reconciliation'&&o.vessel_id===t.vessel_id&&o.voyage_id===t.voyage_id)){o.status='hold';o.hold_reason='Voyage loading reopened: a new final independent reconciliation is required.';}
 }
 return {...row,voyage_reserved_t:totals.reserved_t+event.planned_net_t,voyage_loaded_t:totals.loaded_t,cargo_limit_t:vessel.operator_approved_cargo_limit_t};
});}
export function confirmVesselLoad(state,event){return transact(state,'vessel_load_confirmed',event,s=>{
 const r=known(s.reservations,event.reservation_id,'reservation');requireThat(r.status==='reserved','ALREADY_LOADED','This reservation has already been loaded.');
 const t=known(s.trips,r.trip_id,'trip');requireThat(t.status==='jetty_unloaded'&&t.unload,'UNLOAD_NOT_CONFIRMED','Jetty unload/difference must be confirmed before vessel load.');
 route(s,t,r);number(event.loaded_t,'loaded_t',true);requireThat(Math.abs(event.loaded_t-t.unload.received_t)<=EPS,'LOAD_QUANTITY_MISMATCH','A trip must be loaded once for its confirmed received quantity, not nominal truck capacity.');
 requireThat(event.operator_confirmed===true,'LOAD_NOT_CONFIRMED','Operator load confirmation is required; this is not vessel stability certification.');
 const v=s.vessels[r.vessel_id];const totals=voyageTotals(s,r.vessel_id,r.voyage_id,r.reservation_id);
 requireThat(totals.loaded_t+totals.reserved_t+event.loaded_t<=v.operator_approved_cargo_limit_t+EPS,'VESSEL_CAPACITY_EXCEEDED','Actual loading plus other reservations exceeds the cargo limit.');
 const order=s.orders[t.order_id];const otherOrder=Object.values(s.reservations).filter(x=>x.order_id===t.order_id&&x.reservation_id!==r.reservation_id&&['reserved','loaded'].includes(x.status)).reduce((sum,x)=>sum+(x.status==='loaded'?x.loaded_t:x.planned_net_t),0);
 requireThat(otherOrder+event.loaded_t<=order.quantity_t+EPS,'ORDER_QUANTITY_EXCEEDED','Actual load exceeds the order.');
 changeStock(s,'jetty',t.product_sku,-event.loaded_t);r.status='loaded';r.loaded_t=event.loaded_t;r.load_event_id=event.event_id;t.status='vessel_loaded';
 const manifest={manifest_line_id:'MAN:'+r.reservation_id,reservation_id:r.reservation_id,trip_id:t.trip_id,truck_id:t.truck_id,vessel_id:t.vessel_id,voyage_id:t.voyage_id,order_id:t.order_id,order_type:order.type,destination_id:t.destination_id,product_sku:t.product_sku,loaded_t:event.loaded_t,quantity_basis:t.measurement.quantity_basis,evidence_id:event.evidence_id,occurred_at:event.occurred_at,independent_reconciliation:'pending',marine_safety_certified:false};
 s.manifests.push(manifest);
 candidate(s,{...event,trip_id:t.trip_id,product_sku:t.product_sku,quantity_t:event.loaded_t},order.type==='sales_order'?'buyer_sales_order_item_fulfillment_review':'own_transfer_manifest_reference_no_second_debit',false,'Await independent marine reconciliation and approved shipping/ownership mapping; no automatic ERP commitment.');
 return manifest;
});}
export function cancelVesselReservation(state,event){return transact(state,'vessel_reservation_cancelled',event,s=>{
 const r=known(s.reservations,event.reservation_id,'reservation');requireThat(r.status==='reserved','ALREADY_LOADED','Only an unfilled reservation can be cancelled.');
 const t=s.trips[r.trip_id];requireThat(t.status==='quantity_recorded'&&!t.dispatched_t,'RESERVATION_IN_TRANSIT','A dispatched allocation cannot be cancelled in this demo; hold and obtain an approved reroute/return workflow.');
 requireThat(typeof event.reason==='string'&&event.reason.trim(),'CANCELLATION_REASON_REQUIRED','Cancellation requires a reason.');
 r.status='cancelled';r.cancel_event_id=event.event_id;t.reservation_id=null;
 return {reservation_id:r.reservation_id,released_t:r.planned_net_t,inventory_moved:false};
});}
export function reconcileVoyage(state,event){return transact(state,'voyage_reconciliation',event,s=>{
 const vessel=known(s.vessels,event.vessel_id,'vessel');requireThat(vessel.voyage_id===event.voyage_id,'ROUTE_MISMATCH','Survey voyage differs from the configured vessel voyage.');
 requireThat(['independent_marine_survey','draft_survey','calibrated_shore_belt'].includes(event.method),'INVALID_SURVEY','Use an independent marine/draft survey or calibrated shore belt.');
 number(event.independent_total_t,'independent_total_t');
 const rows=s.manifests.filter(m=>m.vessel_id===event.vessel_id&&m.voyage_id===event.voyage_id);
 requireThat(rows.length>0,'EMPTY_MANIFEST','No loaded cargo to reconcile.');requireThat(voyageTotals(s,event.vessel_id,event.voyage_id).reserved_t<=EPS,'OPEN_RESERVATIONS','Complete or cancel outstanding loading reservations before final reconciliation.');
 const truckSum=rows.reduce((sum,r)=>sum+r.loaded_t,0);const difference=event.independent_total_t-truckSum;
 const estimated=rows.some(r=>r.quantity_basis==='estimate_not_weighed');
 const withinTolerance=Math.abs(difference)<=s.config.survey_tolerance_t;
 const approved=event.operator_confirmed===true&&withinTolerance&&!estimated;
 const row={...event,truck_sum_t:truckSum,difference_t:difference,status:approved?'reconciled_demo':'hold',quantity_qualification:estimated?'contains_unweighed_estimates':'truck_measurements_subject_to_survey',marine_safety_certified:false,erp_committed:false,
  hold_reason:approved?null:(estimated?'Estimated truck quantities need an approved measured reconciliation workflow.':!withinTolerance?'Independent survey difference requires an approved variance resolution.':'Operator reconciliation is not confirmed.')};
 s.surveys[event.voyage_id]=row;for(const manifest of rows)manifest.independent_reconciliation=row.status;
 candidate(s,{...event,quantity_t:event.independent_total_t},'voyage_manifest_reconciliation',approved,row.hold_reason);return row;
});}
export function classifyERPReceipt(receipt={},expectedIdempotencyKey){
 const httpAck=Number.isInteger(receipt.http_status)&&receipt.http_status>=200&&receipt.http_status<300;
 const matching=typeof expectedIdempotencyKey==='string'&&expectedIdempotencyKey.length>0&&receipt.idempotency_key===expectedIdempotencyKey;
 const businessAck=httpAck&&receipt.business_status==='posted'&&typeof receipt.record_id==='string'&&receipt.record_id.trim().length>0&&matching;
 return {http_ack:httpAck,erp_business_ack:businessAck,sync_complete:businessAck,record_id:businessAck?receipt.record_id:null,
  state:businessAck?'business_posting_evidence_received':httpAck?'transport_received_business_pending':'transport_not_acknowledged',
  qualification:'Pure acknowledgement classifier; this demo has no ERP connection or durable transaction.'};
}
export function logisticsSummary(state){
 const by_sku=Object.keys(state.products).map(sku=>{
  const trips=Object.values(state.trips).filter(t=>t.product_sku===sku);
  const produced=state.production.filter(p=>p.product_sku===sku).reduce((s,p)=>s+p.good_output_t,0);
  const dispatched=trips.reduce((s,t)=>s+(t.dispatched_t||0),0);
  const received=trips.reduce((s,t)=>s+(t.unload?.received_t||0),0);
  const inTransit=trips.filter(t=>t.dispatched_t!=null&&!t.unload).reduce((s,t)=>s+t.dispatched_t,0);
  const loaded=state.manifests.filter(m=>m.product_sku===sku).reduce((s,m)=>s+m.loaded_t,0);
  const adjustments=state.adjustments.filter(a=>a.product_sku===sku).reduce((s,a)=>s+a.delta_t,0);
  const quarryAdjustment=state.adjustments.filter(a=>a.product_sku===sku&&a.location==='quarry').reduce((s,a)=>s+a.delta_t,0);
  const jettyManualAdjustment=state.adjustments.filter(a=>a.product_sku===sku&&a.location==='jetty'&&a.kind==='approved_adjustment').reduce((s,a)=>s+a.delta_t,0);
  const inputs=state.opening.quarry[sku]+state.opening.jetty[sku]+produced+adjustments;
  const outputs=state.stockpiles.quarry[sku]+state.stockpiles.jetty[sku]+inTransit+loaded;
  const balanceError=inputs-outputs;
  return {product_sku:sku,name:state.products[sku].name,opening_quarry_t:state.opening.quarry[sku],opening_jetty_t:state.opening.jetty[sku],production_t:produced,dispatched_t:dispatched,received_t:received,adjustments_t:adjustments,
   quarry_t:state.stockpiles.quarry[sku],jetty_t:state.stockpiles.jetty[sku],in_transit_t:inTransit,vessel_loaded_t:loaded,
   balance_error_t:Math.abs(balanceError)<EPS?0:balanceError,mass_balance_ok:Math.abs(balanceError)<EPS,
   quarry_balance_error_t:state.stockpiles.quarry[sku]-(state.opening.quarry[sku]+produced+quarryAdjustment-dispatched),
   jetty_balance_error_t:state.stockpiles.jetty[sku]-(state.opening.jetty[sku]+jettyManualAdjustment+received-loaded),
   contains_unweighed_estimates:trips.some(t=>t.measurement?.estimated===true)};
 });
 const trips=Object.values(state.trips);
 const voyages=Object.values(state.vessels).map(v=>{const totals=voyageTotals(state,v.vessel_id,v.voyage_id);return {vessel_id:v.vessel_id,name:v.name,voyage_id:v.voyage_id,destination_id:v.destination_id,catalog_dwt_t:v.catalog_dwt_t??null,approved_cargo_limit_t:v.operator_approved_cargo_limit_t,cargo_limit_qualification:'Explicit synthetic demo limit; DWT is not usable cargo and no stability/loading approval is implied.',...totals,remaining_t:v.operator_approved_cargo_limit_t-totals.loaded_t-totals.reserved_t,reconciliation:state.surveys[v.voyage_id]?.status||'pending',safety_certified:false};});
 const total=key=>by_sku.reduce((s,r)=>s+r[key],0);
 return {synthetic_only:true,persisted:false,erp_connected:false,by_sku,voyages,
  totals:{quarry_t:total('quarry_t'),jetty_t:total('jetty_t'),in_transit_t:total('in_transit_t'),vessel_loaded_t:total('vessel_loaded_t'),production_t:total('production_t'),mass_balance_ok:by_sku.every(r=>r.mass_balance_ok)},
  trip_counts:{unique_trips:trips.length,unique_trucks:new Set(trips.map(t=>t.truck_id)).size,dispatched_trips:trips.filter(t=>t.dispatched_t!=null).length,jetty_unloaded_trips:trips.filter(t=>t.unload).length,held_trips:trips.filter(t=>t.status==='unload_hold').length,vessel_loaded_trips:trips.filter(t=>t.status==='vessel_loaded').length},
  planned_flow:{loaded_trips_per_hour:state.config.loaded_trips_per_hour,empty_returns_per_hour:state.config.empty_returns_per_hour,total_crossings_per_hour:state.config.loaded_trips_per_hour+state.config.empty_returns_per_hour,expected_payload_t:state.config.average_volume_m3*state.config.density_t_per_m3,qualification:'Planning inputs only, not measured loads or a demonstrated scale/road/jetty service capacity.'},
  outbox:{candidate_count:state.outbox.filter(o=>o.status==='candidate_for_review').length,hold_count:state.outbox.filter(o=>o.status==='hold').length,durable:false,any_erp_committed:false},
  limits:clone(state.limits)};
}
export function buildLogisticsDemo(overrides={}){
 let state=createLogisticsState(overrides);let n=0;
 const base=label=>({event_id:'EV-DEMO-'+(++n)+'-'+label,evidence_id:'EVID-DEMO-'+n+'-'+label,occurred_at:new Date(Date.UTC(2026,10,2,0,n)).toISOString()});
 const sku=Object.keys(state.products)[0];const vessel=Object.values(state.vessels)[0];const order=Object.values(state.orders).find(o=>o.product_sku===sku&&o.destination_id===vessel.destination_id)||Object.values(state.orders)[0];
 const tripFields={product_sku:sku,order_id:order.order_id,destination_id:order.destination_id,vessel_id:vessel.vessel_id,voyage_id:vessel.voyage_id,planned_volume_m3:state.config.average_volume_m3,density_t_per_m3:state.config.density_t_per_m3};
 const payload=state.config.average_volume_m3*state.config.density_t_per_m3;const steps=[];const run=(fn,event)=>{const r=fn(state,event);state=r.state;steps.push({operation:fn.name,event,result:r.result,duplicate:r.duplicate});return r;};
 run(recordProduction,{...base('production'),product_sku:sku,good_output_t:state.config.production_t,sensor_source:'calibrated_belt_scale',instrument_id:'BELT-DEMO-01',calibrated:true});
 run(createTruckTrip,{...base('trip1'),...tripFields,trip_id:'TRIP-DEMO-001',truck_id:'TRUCK-DEMO-001'});
 const measure=overrides.measurement_mode==='no_scale_estimate'?{mode:'no_scale_estimate',volume_m3:state.config.average_volume_m3,density_t_per_m3:state.config.density_t_per_m3}:{mode:'scale',tare_t:15,gross_t:15+payload,instrument_id:'WB-DEMO-01',stable:true,calibrated:true};
 run(recordTruckWeighing,{...base('weigh1'),trip_id:'TRIP-DEMO-001',...measure});
 run(reserveVesselLoad,{...base('reserve1'),reservation_id:'RES-DEMO-001',trip_id:'TRIP-DEMO-001',vessel_id:vessel.vessel_id,voyage_id:vessel.voyage_id,order_id:order.order_id,product_sku:sku,destination_id:order.destination_id,planned_net_t:payload});
 const dispatch={...base('dispatch1'),trip_id:'TRIP-DEMO-001'};run(dispatchTrip,dispatch);const replay=run(dispatchTrip,dispatch);
 run(recordJettyArrival,{...base('arrival1'),trip_id:'TRIP-DEMO-001'});
 run(confirmJettyUnload,{...base('unload1'),trip_id:'TRIP-DEMO-001',received_t:payload,confirmed:true});
 run(confirmVesselLoad,{...base('load1'),reservation_id:'RES-DEMO-001',loaded_t:payload,operator_confirmed:true});
 run(reconcileVoyage,{...base('survey1'),vessel_id:vessel.vessel_id,voyage_id:vessel.voyage_id,method:'draft_survey',independent_total_t:payload,operator_confirmed:true});
 run(createTruckTrip,{...base('trip2'),...tripFields,trip_id:'TRIP-DEMO-002',truck_id:'TRUCK-DEMO-002'});
 run(recordTruckWeighing,{...base('weigh2'),trip_id:'TRIP-DEMO-002',...measure});
 run(reserveVesselLoad,{...base('reserve2'),reservation_id:'RES-DEMO-002',trip_id:'TRIP-DEMO-002',vessel_id:vessel.vessel_id,voyage_id:vessel.voyage_id,order_id:order.order_id,product_sku:sku,destination_id:order.destination_id,planned_net_t:payload});
 run(dispatchTrip,{...base('dispatch2'),trip_id:'TRIP-DEMO-002'});
 run(recordJettyArrival,{...base('arrival2'),trip_id:'TRIP-DEMO-002'});
 const held=run(confirmJettyUnload,{...base('unload2'),trip_id:'TRIP-DEMO-002',received_t:Math.max(0,payload-2),confirmed:true});
 return {state,summary:logisticsSummary(state),assumptions:{average_volume_m3:state.config.average_volume_m3,density_t_per_m3:state.config.density_t_per_m3,expected_payload_t:payload,volume_range_m3:[28,32],planning_payload_range_t:[28*state.config.density_t_per_m3,32*state.config.density_t_per_m3],cargo_limit_t:vessel.operator_approved_cargo_limit_t,synthetic_only:true,production_basis:'Calibrated classified good output by SKU; not truck-count x nominal capacity.',truck_quantity_basis:measure.mode==='scale'?'Synthetic stable tare/gross readings':'Explicit volume x density estimate, not weighed',crossing_capacity_benchmarked:false},
  netsuite_candidates:NETSUITE_CANDIDATES.map(x=>({...x})),scenario_results:{idempotent_dispatch_replay:replay.duplicate,unload_difference_hold:held.result.status==='hold',erp_committed:false,all_mass_balances_ok:logisticsSummary(state).totals.mass_balance_ok},steps};
}
