// Illustrative longitudinal ridge: triangular cross-section over the entire bed.
export function loadModel({capacity,fill,density,tare,manualGross=null,truck}){
 if(![capacity,fill,density,tare].every(Number.isFinite)||capacity<=0||fill<0||fill>200||density<=0||tare<=0)throw Error('Invalid load inputs');
 const gross=manualGross===null?tare+capacity*fill/100*density*1000:manualGross;
 if(!Number.isFinite(gross)||gross<tare||gross>250000)throw Error('Gross must be between tare and 250,000 kg');
 const volume=(gross-tare)/(density*1000),effectiveFill=volume/capacity*100;
 if(effectiveFill>200+1e-8)throw Error('Illustrative load is limited to 200% of bed capacity');
 const excess=Math.max(0,volume-capacity),pileHeight=2*excess/(truck.bedWidth*truck.bedLength);
 return {gross,volume,payloadRef:gross-tare,fill:effectiveFill,pileHeight,bedTop:1.5+truck.bedHeight,loadedHeight:Math.max(truck.height,1.5+truck.bedHeight+pileHeight),inputMode:manualGross===null?'fill':'manual_gross'};
}
export function volumeAssessment(volume,capacity){return {volume_equivalent_m3:volume,capacity_m3:capacity,excess_m3:Number.isFinite(volume)?Math.max(0,volume-capacity):null,utilization_pct:Number.isFinite(volume)?volume/capacity*100:null,over_capacity:Number.isFinite(volume)?volume>capacity+1e-8:null};}
