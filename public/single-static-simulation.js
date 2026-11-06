import {HybridSimulation,measuredNetCargoKg} from './hybrid-simulation.js';
import {staticScale as H,staticCivil as C,staticCompatibility} from './staticScale-data.js';

// Demonstration resource semantics only; this is not a certified PLC/safety controller.
export class SharedStaticScaleResource {
  constructor(){this.id='STATIC-01';this.ownerTripId=null;this.direction=null;this.occupied=false;}
  tryAcquire(tripId,direction){
    if(typeof tripId!=='string'||!tripId||!['inbound','outbound'].includes(direction))return false;
    if(this.ownerTripId!==null)return this.ownerTripId===tripId&&this.direction===direction;
    this.ownerTripId=tripId;this.direction=direction;return true;
  }
  markOccupied(tripId){if(this.ownerTripId!==tripId)return false;this.occupied=true;return true;}
  tryRelease(tripId,rearClear){
    if(this.ownerTripId!==tripId||rearClear!==true)return false;
    this.ownerTripId=null;this.direction=null;this.occupied=false;return true;
  }
  snapshot(){return {resource_id:this.id,physical_station_count:1,shared_by_directions:true,owner_trip_id:this.ownerTripId,direction:this.direction,occupied:this.occupied,state:this.ownerTripId===null?'idle':this.occupied?'occupied':'reserved',safety_status:'demonstration_not_certified_interlock'};}
}

// One station performs two sequential passes per trip. No independent outbound scale.
export function singleStaticFlow(headway=180,dwell=10,speed=10){
  if(![headway,dwell,speed].every(Number.isFinite)||headway<=0||dwell<5||dwell>30||speed<1||speed>15)throw Error('Invalid single-scale traffic inputs');
  const service=dwell+24+Math.ceil(105/(Math.min(speed,5)/3.6));
  const servicePerTrip=2*service,arrival=3600/headway,capacity=3600/servicePerTrip;
  return {physical_stations:1,passes_per_trip:2,arrival_per_hour:arrival,arrival_passes_per_hour:2*arrival,static_service_s:service,outbound_static_service_s:service,shared_service_per_trip_s:servicePerTrip,ideal_capacity_per_hour:capacity,utilization:arrival/capacity,requires_slotting:arrival>=capacity,queue_wait_s:null,queue_wait_estimated:false,intersection_delay_s:null,assumptions:'planning_upper_bound_one_shared_station_two_passes_no_correlated_return_queue_estimate'};
}

export class SingleStaticSimulation extends HybridSimulation {
  reset(config){
    const c={...config,lidarEnabled:false,staticCompatibility:config.staticCompatibility||staticCompatibility(config.truck,config.tare)};
    super.reset(c);this.id=this.id.replace(/^HYB-/,'P1S-');this.qr.reset(this.id);
    this.sharedScale=new SharedStaticScaleResource();this.resourceHistory=[];this.scaleMeasurements=[];this.invalidReading=null;
    const speed=c.speed/3.6,slow=Math.min(c.speed,5)/3.6;
    this.position={x:0,z:-56,heading:0};
    // Legacy wim_* stage IDs are controller compatibility aliases for OUTBOUND STATIC.
    this.stages=[
      {id:'entry_qr',duration:12},
      {id:'static_approach',duration:56/slow,from:[0,-56],to:[0,0],signal:'static'},
      {id:'static_settle',duration:c.dwell},{id:'static_record',duration:5},
      {id:'entry_depart',duration:43/slow,from:[0,0],to:[0,43],signal:'static'},
      {id:'entry_release',duration:7},
      {id:'to_loading',duration:130/speed,points:[[0,43],[0,75],[-30,95],[-30,130],[-5,145]]},
      {id:'loading',duration:12},
      {id:'to_exit',duration:130/speed,points:[[-5,145],[25,130],[30,95],[0,75],[0,56]]},
      {id:'exit_qr',duration:12},
      {id:'wim_approach',duration:56/slow,from:[0,56],to:[0,0],signal:'wim'},
      {id:'wim_measure',duration:c.dwell},{id:'exit_record',duration:5},
      {id:'exit_depart',duration:43/slow,from:[0,0],to:[0,-43],signal:'wim'},
      {id:'exit_release',duration:7},
      {id:'to_road',duration:42/slow,from:[0,-43],to:[0,-85]}
    ];
  }
  hold(source,message){this.blocked=true;this.running=false;this.net=null;this.event(source,message);}
  resourceEvent(action){this.resourceHistory.push({time_s:+this.time.toFixed(1),action,...this.sharedScale.snapshot()});}
  acquire(direction){
    if(!this.sharedScale.tryAcquire(this.id,direction)){this.hold('INTERLOCK','Timbangan bersama belum bebas / Shared scale not clear: opposite admission held');return false;}
    this.resourceEvent('acquire_'+direction);this.event('INTERLOCK','STATIC-01 reserved '+direction+' / opposite admission red');return true;
  }
  release(){
    const rearClear=Math.abs(this.position.z)-this.config.truck.length/2>C.toeZ;
    if(!this.sharedScale.tryRelease(this.id,rearClear)){this.hold('INTERLOCK','Bagian belakang belum keluar zona terlindung / Rear not clear of protected zone');return false;}
    this.resourceEvent('release_after_rear_clear');this.event('INTERLOCK','STATIC-01 released only after rear clears approach/ramp zone');return true;
  }
  recordStatic(kind,raw){
    if(!this.sharedScale.markOccupied(this.id)){this.hold('INTERLOCK','Tidak ada reservasi timbangan / No shared-scale reservation');return;}
    this.resourceEvent('occupied_'+kind);
    const fault=kind==='tare'?this.config.fault==='static'||this.config.fault==='static_in':this.config.fault==='wim'||this.config.fault==='static_out';
    if(fault||!Number.isFinite(raw)||raw<0||raw>H.capacityKg){
      this.invalidReading={kind,reference_kg:raw,reason:fault?'unstable_indicator':'invalid_or_overrange',capacity_kg:H.capacityKg};
      this.hold('STATIC-01',fault?'Indikator statis tidak stabil / Static indicator unstable: no final transaction':'Kapasitas statis 80 t / overrange: no valid final weight');return;
    }
    const kg=Math.round(raw/H.divisionKg)*H.divisionKg;
    if(kind==='tare')this.tare=kg;
    else {this.gross=kg;this.net=measuredNetCargoKg(this.tare,this.gross);if(this.net===null){this.hold('STATIC-01','Gross terukur di bawah tare / Measured gross below tare: no final transaction');return;}}
    this.scaleMeasurements.push({trip_id:this.id,resource_id:'STATIC-01',indicator_id:'STATIC-IND-01',kind,direction:kind==='tare'?'inbound':'outbound',weight_kg:kg,division_kg:H.divisionKg,stable:true});
    this.event('STATIC-01 / IoT','Stable '+kind+' '+kg+' kg / same indicator / 20 kg division');
  }
  completeStage(stage){
    if(stage.id==='entry_qr'){
      if(this.config.staticCompatibility.status==='engineering_hold'){this.hold('STATIC-01','Engineering hold: verify truck wheel/guard-rail envelope before entry');return;}
      this.acquire('inbound');return;
    }
    if(stage.id==='exit_qr'){this.acquire('outbound');return;}
    if(stage.id==='static_settle'){this.recordStatic('tare',this.config.tare);return;}
    if(stage.id==='wim_measure'){this.recordStatic('gross',this.config.gross);return;}
    if(stage.id==='entry_release'||stage.id==='exit_release'){this.release();return;}
    super.completeStage(stage);
  }
  gateState(){
    const inbound=!this.blocked&&this.stage.id==='static_approach'&&this.sharedScale.direction==='inbound';
    const outbound=!this.blocked&&this.stage.id==='wim_approach'&&this.sharedScale.direction==='outbound';
    return {inbound_admission:inbound?'green':'red',outbound_admission:outbound?'green':'red',demonstration_only:true};
  }
  readings(){
    const measured=this.gross!==null?this.gross:this.tare;
    return [
      {id:'QR-IN',source:'QR',value:this.qr.entryScanned?this.qr.order.order_id:null},
      {id:'STATIC-IND-01',source:'shared_static_indicator',value:measured,stable:measured!==null&&!this.blocked,resource_id:'STATIC-01',division_kg:H.divisionKg},
      {id:'IOT-STATIC-01',source:'shared_edge_gateway',value:measured===null?'WAITING':this.config.fault==='offline'?'ILLUSTRATIVE_LOCAL_RECORD':'LOCAL_RECORD_READY',resource_id:'STATIC-01'},
      {id:'POSITION-STATIC-01',source:'simulated_position_not_certified_safety',value:this.sharedScale.occupied?'OCCUPIED':'CLEAR_OR_RESERVED'},
      {id:'QR-OUT',source:'QR',value:this.qr.exitScanned?this.qr.order.order_id:null},
      {id:'CCTV-IN',source:'fixed_camera',value:this.qr.entryScanned?'FRAME-IN-'+this.id:null},
      {id:'CCTV-OUT',source:'fixed_camera',value:this.qr.exitScanned?'FRAME-OUT-'+this.id:null},
      {id:'CLOUD',source:'connectivity',value:this.config.fault==='offline'?'OFFLINE_ILLUSTRATION':'ONLINE'}
    ];
  }
  payload(limits){
    const p=super.payload(limits),r=this.sharedScale.snapshot();
    return {...p,schema_version:'4.0',phase:'phase1',scenario:'single_static_inbound_outbound',
      source:{tare:'shared_static_indicator_via_iot_gateway',gross:'shared_static_indicator_via_iot_gateway',resource_id:'STATIC-01',indicator_id:'STATIC-IND-01'},
      layout:{revision:'P1S-R01',physical_static_stations:1,wim_stations:0,shared_entry_exit:true,scale_x_m:0,scale_z_m:0,inbound_direction:'+Z',outbound_direction:'-Z',independent_parallel_capacity:false},
      static_construction:{type:'single_modular_pitless_static',station_count:1,model:H.model,capacity_kg:H.capacityKg,division_kg:H.divisionKg,deck_length_m:H.length,deck_width_m:H.width,drawing_outer_width_m:H.drawingOuterWidth,module_count:H.moduleCount,load_cells:H.loadCellCount,indicators:1,deck_top_m:C.deckTop,deck_rise_m:C.rise,ramp_length_m:C.rampLength,ramp_grade:C.rampGrade,geotechnical_approval:'pending_site_data',civil_dimensions_status:'coordination_assumptions_not_OEM_foundation_drawing'},
      static_compatibility:this.config.staticCompatibility,shared_scale:r,gate_state:this.gateState(),scale_measurements:[...this.scaleMeasurements],resource_history:[...this.resourceHistory],invalid_reading:this.invalidReading,
      odol:{...p.odol,weight_source:'shared_static_indicator',dimensions_available:false},
      delivery:{...p.delivery,commercial_match_decision:null,persistence:false,offline_buffer_illustrative:true,mode:this.config.fault==='offline'?'illustrative_local_record_not_durable':'external_erp_not_configured'}};
  }
}
