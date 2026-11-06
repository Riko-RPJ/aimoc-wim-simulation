export const comparisonCases=Object.freeze({same:0,slight:.01,large:.15});
export function orderComparison(orderedKg,measuredKg,density=1.5){
 if(!Number.isFinite(orderedKg)||orderedKg<=0||!Number.isFinite(density)||density<=0)throw Error('Invalid order');
 const valid=Number.isFinite(measuredKg)&&measuredKg>=0;
 return {decision_mode:'display_only_no_match_verdict',ordered_kg:orderedKg,measured_net_kg:valid?measuredKg:null,difference_kg:valid?measuredKg-orderedKg:null,difference_pct:valid?(measuredKg-orderedKg)/orderedKg*100:null,ordered_volume_equivalent_m3:orderedKg/density/1000,measured_volume_equivalent_m3:valid?measuredKg/density/1000:null};
}
export class QRTrip{
 constructor(){this.order={order_id:'NS-SO-DEMO-2026-001',customer:'Stockpile Customer',material:'Bahan tambang / Mining material',plate:'B 9123 XYZ',ordered_kg:48000};this.auto=true;this.case='same';this.reset('DEMO');}
 reset(tripId){this.tripId=tripId;this.token='AIMOC:DEMO:'+tripId;this.entryScanned=false;this.exitScanned=false;this.closed=false;this.history=[];this.error=null;}
 scan(token,direction){
  this.error=null;
  if(this.closed)this.error='QR trip sudah selesai / QR trip already closed';
  else if(token!==this.token)this.error='QR tidak dikenal / Unknown QR';
  else if(direction==='entry'&&this.entryScanned)this.error='QR masuk sudah digunakan / Entry QR already used';
  else if(direction==='exit'&&!this.entryScanned)this.error='Belum ada scan masuk / Entry scan required';
  else if(direction==='exit'&&this.exitScanned)this.error='QR keluar sudah digunakan / Exit QR already used';
  else if(!['entry','exit'].includes(direction))this.error='Invalid direction';
  if(this.error)return false;
  if(direction==='entry')this.entryScanned=true;else this.exitScanned=true;
  this.history.push({direction,trip_id:this.tripId,order_id:this.order.order_id,at:new Date().toISOString()});return true;
 }
 snapshot(net,density){return {simulated_erp:true,erp_system:'oracle_netsuite',token:this.token,trip_id:this.tripId,order:{...this.order},entry_scanned:this.entryScanned,exit_scanned:this.exitScanned,closed:this.closed,error:this.error,history:[...this.history],comparison:orderComparison(this.order.ordered_kg,net,density)};}
}
export const qrSession=new QRTrip();
