// Finite-window planning simulation. All arrival/service/clearance values are assumptions,
// not OEM ratings, traffic observations, metrology certification or an SLA.
const DIRECTIONS=['empty','loaded'];
const MAX_JOBS=50000;
const EPS=1e-9;
export const QUARRY_TRAFFIC_SCENARIOS=Object.freeze([
  {id:'estimate_only',label:'No weighing / estimate only',layout:'directional',emptyService:'gate',loadedService:'gate',quantityBasis:'estimate_only'},
  {id:'single_static',label:'One shared static scale',layout:'shared',emptyService:'static',loadedService:'static',quantityBasis:'synthetic_weighing'},
  {id:'static_static',label:'Dedicated static banks',layout:'directional',emptyService:'static',loadedService:'static',quantityBasis:'synthetic_weighing',optional:true},
  {id:'static_wim',label:'Static inbound / WIM outbound',layout:'directional',emptyService:'static',loadedService:'wim',quantityBasis:'synthetic_weighing'},
  {id:'wim_wim',label:'WIM inbound / WIM outbound',layout:'directional',emptyService:'wim',loadedService:'wim',quantityBasis:'synthetic_weighing'},
]);
export function defaultQuarryTrafficInput(){return {
  countBasis:'loaded_trips',demandPerHour:250,emptyShare:.5,peakMultiplier:1,
  horizonHours:1,seed:42,arrivalMode:'poisson',batchSize:5,serviceCv:.10,
  serviceSeconds:{static:80,wim:12,gate:6},minimumHeadwaySeconds:6,
  targetUtilization:.8,cycleMinutes:60,chartPoints:120,
  lanes:{estimate_only:{empty:1,loaded:1},single_static:{shared:1},static_static:{empty:1,loaded:1},static_wim:{empty:1,loaded:1},wim_wim:{empty:2,loaded:2}},
};}
function number(value,name,min,max){
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw Error(`Invalid ${name}: expected ${min}..${max}`);
  return value;
}
function integer(value,name,min,max){number(value,name,min,max);if(!Number.isInteger(value))throw Error(`Invalid ${name}: expected an integer`);return value;}
export function normalizeTrafficInput(input={}){
  const d=defaultQuarryTrafficInput();
  const n={...d,...input,serviceSeconds:{...d.serviceSeconds,...input.serviceSeconds},lanes:{}};
  if(!['combined_crossings','loaded_trips'].includes(n.countBasis))throw Error('Unknown countBasis');
  if(!['poisson','paced','batched'].includes(n.arrivalMode))throw Error('Unknown arrivalMode');
  number(n.demandPerHour,'demandPerHour',0,1000);number(n.emptyShare,'emptyShare',0,1);
  number(n.peakMultiplier,'peakMultiplier',.1,3);number(n.horizonHours,'horizonHours',1/60,8);
  integer(n.seed,'seed',0,4294967295);integer(n.batchSize,'batchSize',1,100);
  number(n.serviceCv,'serviceCv',0,1);number(n.minimumHeadwaySeconds,'minimumHeadwaySeconds',.1,300);
  number(n.targetUtilization,'targetUtilization',.1,.95);number(n.cycleMinutes,'cycleMinutes',1,480);
  integer(n.chartPoints,'chartPoints',10,240);
  for(const key of ['static','wim','gate'])number(n.serviceSeconds[key],`serviceSeconds.${key}`,.1,600);
  const explicit=input.emptyPerHour!==undefined||input.loadedPerHour!==undefined;
  if(explicit){
    n.emptyPerHour=number(input.emptyPerHour,'emptyPerHour',0,1000);
    n.loadedPerHour=number(input.loadedPerHour,'loadedPerHour',0,1000);
  }
  for(const s of QUARRY_TRAFFIC_SCENARIOS){
    const source={...d.lanes[s.id],...input.lanes?.[s.id]};
    if(s.layout==='shared')n.lanes[s.id]={shared:integer(source.shared,`${s.id}.shared`,1,64)};
    else n.lanes[s.id]={empty:integer(source.empty,`${s.id}.empty`,1,64),loaded:integer(source.loaded,`${s.id}.loaded`,1,64)};
  }
  let baseEmpty,baseLoaded;
  if(explicit){baseEmpty=n.emptyPerHour;baseLoaded=n.loadedPerHour;}
  else if(n.countBasis==='loaded_trips'){baseEmpty=n.demandPerHour;baseLoaded=n.demandPerHour;}
  else {baseEmpty=n.demandPerHour*n.emptyShare;baseLoaded=n.demandPerHour*(1-n.emptyShare);}
  n.modeledEmptyPerHour=number(baseEmpty*n.peakMultiplier,'modeledEmptyPerHour',0,1000);
  n.modeledLoadedPerHour=number(baseLoaded*n.peakMultiplier,'modeledLoadedPerHour',0,1000);
  n.explicitDirectionalRates=explicit;
  return n;
}
function hashString(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function rng(seed){let a=seed>>>0;return ()=>{a=(a+0x6D2B79F5)|0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
function normal(random){return Math.sqrt(-2*Math.log(Math.max(1e-12,random())))*Math.cos(2*Math.PI*random());}
function normalCdf(x){
  const ax=Math.abs(x),t=1/(1+.2316419*ax),density=Math.exp(-ax*ax/2)/Math.sqrt(2*Math.PI);
  const tail=density*t*(.319381530+t*(-.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));
  return x>=0?1-tail:tail;
}
// Mean of max(lognormal(median, CV), minimumHeadway), used for lane sizing.
export function effectiveMeanServiceSeconds(median,cv,minimumHeadway){
  number(median,'median service',.1,600);number(cv,'service CV',0,1);number(minimumHeadway,'minimum headway',.1,300);
  if(cv===0)return Math.max(median,minimumHeadway);
  const sigma=Math.sqrt(Math.log1p(cv*cv)),mu=Math.log(median),cut=(Math.log(minimumHeadway)-mu)/sigma;
  return minimumHeadway*normalCdf(cut)+Math.exp(mu+sigma*sigma/2)*(1-normalCdf(cut-sigma));
}
function arrivalStream(direction,rate,n){
  if(rate===0)return [];
  const horizon=n.horizonHours*3600,random=rng(hashString(`${n.seed}|arrival|${direction}`)),serviceRandom=rng(hashString(`${n.seed}|service|${direction}`));
  const jobs=[];let t=0,index=0;
  const add=at=>{if(jobs.length>=MAX_JOBS)throw Error('Arrival window exceeds event safety limit');jobs.push({id:`${direction==='empty'?'E':'L'}-${String(index++).padStart(6,'0')}`,direction,arrival:at,z:normal(serviceRandom)});};
  if(n.arrivalMode==='paced'){
    const spacing=3600/rate;for(t=spacing/2;t<horizon;t+=spacing)add(t);
  } else {
    const batch=n.arrivalMode==='batched'?n.batchSize:1,batchRate=rate/batch/3600;
    while(true){t+=-Math.log(Math.max(1e-12,random()))/batchRate;if(t>=horizon)break;for(let b=0;b<batch;b++)add(t);}
  }
  return jobs;
}
function generateArrivals(n){
  const arrivals=[...arrivalStream('empty',n.modeledEmptyPerHour,n),...arrivalStream('loaded',n.modeledLoadedPerHour,n)].sort((a,b)=>a.arrival-b.arrival||a.id.localeCompare(b.id));
  if(arrivals.length>MAX_JOBS)throw Error('Arrival window exceeds event safety limit');
  const fingerprint=hashString(arrivals.map(j=>`${j.id}@${j.arrival.toFixed(9)}`).join('|')).toString(16).padStart(8,'0');
  return {arrivals,fingerprint};
}
function serviceValue(median,z,n){
  const sigma=Math.sqrt(Math.log1p(n.serviceCv*n.serviceCv));
  return Math.max(n.minimumHeadwaySeconds,median*Math.exp(sigma*z));
}
function percentile(sorted,p){return sorted.length?sorted[Math.max(0,Math.ceil(p*sorted.length)-1)]:null;}
function mean(values){return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;}
function maxQueue(jobs,horizon){
  const events=[];for(const j of jobs){events.push([j.arrival,1]);if(j.start<horizon)events.push([j.start,-1]);}
  events.sort((a,b)=>a[0]-b[0]);let q=0,max=0;
  for(let i=0;i<events.length;){const t=events[i][0];let delta=0;while(i<events.length&&Math.abs(events[i][0]-t)<EPS)delta+=events[i++][1];q+=delta;max=Math.max(max,q);}
  return max;
}
function metrics(jobs,horizon,laneCount){
  const started=jobs.filter(j=>j.start<horizon),completed=jobs.filter(j=>j.finish<=horizon),waiting=jobs.filter(j=>j.start>=horizon);
  const waits=started.map(j=>j.start-j.arrival).sort((a,b)=>a-b);
  const lower=waiting.map(j=>horizon-j.arrival);
  const busy=jobs.reduce((sum,j)=>sum+Math.max(0,Math.min(horizon,j.finish)-j.start),0);
  return {offered:jobs.length,started:started.length,completed:completed.length,pending:jobs.length-completed.length,
    endQueue:waiting.length,inService:started.length-completed.length,meanWaitSeconds:mean(waits),p95WaitSeconds:percentile(waits,.95),
    maxWaitSeconds:waits.length?waits.at(-1):null,maxQueue:maxQueue(jobs,horizon),
    censoredWaitingCount:waiting.length,pendingWaitLowerBoundMeanSeconds:mean(lower),pendingWaitLowerBoundP95Seconds:percentile([...lower].sort((a,b)=>a-b),.95),
    observedBusyFraction:laneCount?busy/(horizon*laneCount):0,observedWaitSampleCount:waits.length,
    waitMetricScope:'started_within_finite_window',p95Method:'nearest_rank_observed_starts_only',rightCensored:waiting.length>0};
}
function scenarioSizing(s,n){
  const rates={empty:n.modeledEmptyPerHour,loaded:n.modeledLoadedPerHour};
  const nominal={empty:n.serviceSeconds[s.emptyService],loaded:n.serviceSeconds[s.loadedService]};
  const meanSeconds={empty:effectiveMeanServiceSeconds(nominal.empty,n.serviceCv,n.minimumHeadwaySeconds),loaded:effectiveMeanServiceSeconds(nominal.loaded,n.serviceCv,n.minimumHeadwaySeconds)};
  const chosen={...n.lanes[s.id]};let minLanes,util;
  if(s.layout==='shared'){
    const work=rates.empty*meanSeconds.empty+rates.loaded*meanSeconds.loaded;
    minLanes={shared:Math.ceil(Math.max(0,work/(3600*n.targetUtilization)-1e-12))};util={shared:work/(3600*chosen.shared)};
  } else {
    minLanes=Object.fromEntries(DIRECTIONS.map(d=>[d,Math.ceil(Math.max(0,rates[d]*meanSeconds[d]/(3600*n.targetUtilization)-1e-12))]));
    util=Object.fromEntries(DIRECTIONS.map(d=>[d,rates[d]*meanSeconds[d]/(3600*chosen[d])]));
  }
  const largest=Math.max(...Object.values(util));
  const totalRate=rates.empty+rates.loaded;
  // Balanced two-pass gate ceiling: one empty entry plus one loaded exit per trip.
  // This is arithmetic only; independent simulated streams are not a closed fleet.
  const directionalPassCapacityPerHour=s.layout==='shared'?null:{empty:chosen.empty*3600/meanSeconds.empty,loaded:chosen.loaded*3600/meanSeconds.loaded};
  const sustainableGateOnlyTripsPerHour=s.layout==='shared'?chosen.shared*3600/(meanSeconds.empty+meanSeconds.loaded):Math.min(directionalPassCapacityPerHour.empty,directionalPassCapacityPerHour.loaded);
  return {minimumLanes:minLanes,chosenLanes:chosen,offeredUtilization:util,withinTarget:largest<=n.targetUtilization+EPS,isSaturated:largest>=1-EPS,
    meanServiceSeconds:meanSeconds,nominalServiceSeconds:nominal,physicalHeadwaySeconds:n.minimumHeadwaySeconds,
    physicalMaximumCrossingsPerLanePerHour:3600/n.minimumHeadwaySeconds,targetUtilization:n.targetUtilization,
    theoreticalCrossingsPerHourAtCurrentMix:largest>0?totalRate/largest:null,
    directionalPassCapacityPerHour,sustainableGateOnlyTripsPerHour,
    targetUtilizationGateOnlyTripsPerHour:sustainableGateOnlyTripsPerHour*n.targetUtilization,
    gateOnlyTripCapacityQualification:'Balanced one-empty-plus-one-loaded-pass arithmetic ceiling, ignoring loading, travel, fleet coupling, transient queues and marine constraints; not end-to-end delivered trips.',
    formula:s.layout==='shared'?'ceil((empty_rate*mean_empty_service + loaded_rate*mean_loaded_service)/(3600*target_utilization))':'ceil(direction_rate*mean_service/(3600*target_utilization))',
    qualification:'Planning minimum from offered mean workload; not a guarantee against bursts, queueing, failure or site bottlenecks.'};
}
function assignJobs(s,n,arrivals){
  const counts=n.lanes[s.id],banks=s.layout==='shared'?{shared:Array(counts.shared).fill(0)}:{empty:Array(counts.empty).fill(0),loaded:Array(counts.loaded).fill(0)};
  const jobs=[];
  for(const a of arrivals){
    const bankKey=s.layout==='shared'?'shared':a.direction,bank=banks[bankKey];let lane=0;
    for(let i=1;i<bank.length;i++)if(bank[i]<bank[lane])lane=i;
    const service=serviceValue(n.serviceSeconds[a.direction==='empty'?s.emptyService:s.loadedService],a.z,n),start=Math.max(a.arrival,bank[lane]),finish=start+service;
    bank[lane]=finish;jobs.push({...a,start,finish,service,lane:`${bankKey}-${lane+1}`});
  }
  return jobs;
}
function series(jobs,horizon,points){
  const groups=Object.fromEntries(['all',...DIRECTIONS].map(d=>{
    const a=d==='all'?jobs:jobs.filter(j=>j.direction===d);
    return [d,{arrivals:a.map(j=>j.arrival).sort((x,y)=>x-y),starts:a.map(j=>j.start).sort((x,y)=>x-y),finishes:a.map(j=>j.finish).sort((x,y)=>x-y),a:0,s:0,f:0}];
  }));
  const output=[];
  for(let i=0;i<=points;i++){
    const t=horizon*i/points,counts={};
    for(const [d,g] of Object.entries(groups)){
      while(g.a<g.arrivals.length&&g.arrivals[g.a]<=t)g.a++;
      while(g.s<g.starts.length&&(i===points?g.starts[g.s]<horizon:g.starts[g.s]<=t))g.s++;
      while(g.f<g.finishes.length&&g.finishes[g.f]<=t)g.f++;
      counts[d]={queue:g.a-g.s,pending:g.a-g.f,completed:g.f};
    }
    output.push({timeSeconds:t,queue:counts.all.queue,pending:counts.all.pending,completed:counts.all.completed,
      emptyQueue:counts.empty.queue,loadedQueue:counts.loaded.queue,emptyCompleted:counts.empty.completed,loadedCompleted:counts.loaded.completed});
  }
  return output;
}
function runScenario(s,n,arrivals,fingerprint){
  const horizon=n.horizonHours*3600,jobs=assignJobs(s,n,arrivals),counts=n.lanes[s.id];
  const laneCount=s.layout==='shared'?counts.shared:counts.empty+counts.loaded;
  const all=metrics(jobs,horizon,laneCount);
  const directions=Object.fromEntries(DIRECTIONS.map(d=>[d,metrics(jobs.filter(j=>j.direction===d),horizon,s.layout==='shared'?counts.shared:counts[d])]));
  const sizing=scenarioSizing(s,n),warnings=[];
  if(sizing.isSaturated)warnings.push('Offered workload reaches/exceeds chosen lane capacity; finite-window results do not establish a stable queue.');
  if(!sizing.withinTarget)warnings.push('Chosen lanes exceed the target utilization; compare with the planning minimum and burst sensitivity.');
  if(all.censoredWaitingCount)warnings.push(`${all.censoredWaitingCount} waiting crossing events remain right-censored at the window end; observed p95 excludes their unknown eventual wait.`);
  if(s.quantityBasis==='estimate_only')warnings.push('No weighing is performed. Crossing counts are not measured or commercially qualified tonnage.');
  return {...s,lanes:{...counts},metrics:all,directions,sizing,series:series(jobs,horizon,n.chartPoints),arrivalFingerprint:fingerprint,
    completedLoadedCrossings:directions.loaded.completed,loadedCrossingsCompletedPerHour:directions.loaded.completed/n.horizonHours,
    sustainableGateOnlyTripsPerHour:sizing.sustainableGateOnlyTripsPerHour,
    targetUtilizationGateOnlyTripsPerHour:sizing.targetUtilizationGateOnlyTripsPerHour,
    gateOnlyTripCapacityQualification:sizing.gateOnlyTripCapacityQualification,
    materialOutputVerified:false,uniqueTruckCountMeasured:false,warnings};
}
export function simulateQuarryTraffic(input={}){
  const n=normalizeTrafficInput(input),{arrivals,fingerprint}=generateArrivals(n),scenarios=QUARRY_TRAFFIC_SCENARIOS.map(s=>runScenario(s,n,arrivals,fingerprint));
  const loaded=n.modeledLoadedPerHour,empty=n.modeledEmptyPerHour;
  return {schemaVersion:'1.0',input:n,demand:{countBasis:n.explicitDirectionalRates?'explicit_directional_rates':n.countBasis,baseCountPerHour:n.demandPerHour,peakMultiplier:n.peakMultiplier,
      loadedTripsPerHour:loaded,emptyCrossingsPerHour:empty,totalCrossingsPerHour:loaded+empty,expectedCrossingsInWindow:(loaded+empty)*n.horizonHours,
      realizedCrossingsInWindow:arrivals.length,realizedEmptyCrossings:arrivals.filter(j=>j.direction==='empty').length,realizedLoadedCrossings:arrivals.filter(j=>j.direction==='loaded').length,
      eventBasis:'gate_crossing_events_not_unique_trucks',arrivalPairing:'independent_direction_streams_not_trip_identity_pairing'},
    fleet:{minimumActiveTrucks:Math.ceil(loaded*n.cycleMinutes/60),cycleMinutes:n.cycleMinutes,loadedTripsPerHour:loaded,
      formula:'ceil(loaded_trips_per_hour * cycle_minutes / 60)',uniqueTruckCountMeasured:false,crossingsNotUniqueTrucks:true,
      qualification:'Steady-cycle Little law planning lower bound; assumed cycle time must include queue/loading/travel/jetty time. No dynamic fleet feedback is simulated.'},
    arrivalFingerprint:fingerprint,scenarios,recommendations:Object.fromEntries(scenarios.map(s=>[s.id,s.sizing])),
    limitations:[
      'All services, clearance/headway, arrival patterns and cycle time are editable planning assumptions, not OEM throughput ratings or measured site data.',
      'Static/WIM service assumptions are full per-pass lane occupancy; the gate-only service is the no-weighing baseline, not an extra time added again to every pass.',
      'Each crossing occupies the greater of sampled service time and minimum physical headway. Lane sizing uses the corresponding offered mean workload and target utilization.',
      'The simulation starts with empty queues, has no warm-up, and ends at a fixed horizon. Observed p95 is for starts within that window, not a steady-state p95 or promise.',
      'Jobs waiting at the horizon are right-censored; their eventual wait is unknown. Pending includes both queued and in-service crossings.',
      'Direction streams are independent synthetic crossing events. Loaded and empty events are not unique trucks or linked weighbridge tickets.',
      'Completed loaded crossings are not sustainable paired ritase or delivery to a vessel. Gate-only paired-trip ceilings are arithmetic bottleneck screens, not an end-to-end fleet simulation.',
      'Dispatch assumes a centrally managed FCFS queue to the next available lane; actual lane choice, merging, crossing conflicts and approach storage are not modelled.',
      'Road geometry, safe stopping, sensor validity, operator exceptions, breakdowns, crusher/loading, jetty, vessel and marine bottlenecks require separate validation.',
      'No-weighing quantity is estimate-only; this module does not establish commercially qualified net tonnage for any scenario.',
    ]};
}

// Separate arithmetic feasibility screen. It does not simulate loading, unloading,
// vessel windows or production and must not be presented as end-to-end capacity.
export function quarrySystemSizing(input={}){
  const n={loadedTripsPerHour:250,loadingServiceSeconds:120,unloadingServiceSeconds:90,
    targetUtilization:.8,averageVolumeM3:30,densityTonnesPerM3:1.5,operatingHours:16,cycleMinutes:60,...input};
  number(n.loadedTripsPerHour,'loadedTripsPerHour',0,1000);
  number(n.loadingServiceSeconds,'loadingServiceSeconds',.1,3600);
  number(n.unloadingServiceSeconds,'unloadingServiceSeconds',.1,3600);
  number(n.targetUtilization,'targetUtilization',.1,.95);
  number(n.averageVolumeM3,'averageVolumeM3',.1,100);
  number(n.densityTonnesPerM3,'densityTonnesPerM3',.01,5);
  number(n.operatingHours,'operatingHours',.1,24);
  number(n.cycleMinutes,'cycleMinutes',1,480);
  const bays=service=>Math.ceil(Math.max(0,n.loadedTripsPerHour*service/(3600*n.targetUtilization)-1e-12));
  const averagePayloadTonnes=n.averageVolumeM3*n.densityTonnesPerM3;
  const demandTonnesPerHour=n.loadedTripsPerHour*averagePayloadTonnes;
  return {
    input:n,
    minimumLoadingBays:bays(n.loadingServiceSeconds),
    minimumUnloadingBays:bays(n.unloadingServiceSeconds),
    averagePayloadTonnes,
    demandTonnesPerHour,
    illustrativeTonnesPerDay:demandTonnesPerHour*n.operatingHours,
    minimumFleetTrucks:Math.ceil(n.loadedTripsPerHour*n.cycleMinutes/60),
    bayFormula:'ceil(loaded_trips_per_hour * full_bay_service_seconds / (3600 * target_utilization))',
    fleetFormula:'ceil(loaded_trips_per_hour * full_cycle_minutes / 60)',
    quantityBasis:'illustrative_volume_times_assumed_density_not_weighed_tonnage',
    productionCapacityVerified:false,
    fleetInventoryVerified:false,
    qualification:'Arithmetic planning requirement from assumed inputs; not measured production, rated crusher/jetty/vessel capacity or an end-to-end throughput guarantee.',
    limitations:[
      'Pass the already modeled loaded rate, including any peak multiplier exactly once.',
      'Service time must include full bay occupancy and clearance; identical independent bays and available staffing/equipment are assumed.',
      'Cycle time must cover loading, travel, unloading, return and waiting; the fleet figure is a lower bound, not an observed inventory or dispatch simulation.',
      'Daily tonnage assumes the stated productive hours continuously meet this rate; downtime, stockpiles, vessel windows and marine constraints are not modeled.',
      'Crusher supply, loader duty cycle, roads, merges, queue storage, barge/jetty and vessel capacity require separate site validation.',
      'The utilization allowance does not guarantee a queue or percentile waiting time.'
    ]
  };
}
