import {parallelElevation} from './parallel-data.js';
// Gate colours are a display of the simulated admission state, not a PLC control output.
export function gateLampState(state,singleStatic=false){
  const off={static:false,wim:false};
  if(state.blocked||state.done||state.complete)return off;
  if(!singleStatic)return {static:state.signal==='static',wim:state.signal==='wim'};
  const gates=typeof state.gateState==='function'?state.gateState():state.gate_state;
  const inbound=gates?.inbound_admission==='green',outbound=gates?.outbound_admission==='green';
  return inbound&&outbound?off:{static:inbound,wim:outbound};
}
export function staticVehiclePose(position,truckLength,staticX,outboundX,doubleStatic=false){
  const isStatic=(Math.abs(position.x-staticX)<2||doubleStatic&&Math.abs(position.x-outboundX)<2)&&Math.abs(position.z)<43;
  const surface=isStatic?parallelElevation(position.z):.9;
  const heading=Number.isFinite(position.heading)?position.heading:0,half=truckLength/2;
  const pitch=isStatic?Math.atan2(parallelElevation(position.z-half*Math.cos(heading))-parallelElevation(position.z+half*Math.cos(heading)),truckLength):0;
  return {isStatic,surface,pitch,heading};
}
