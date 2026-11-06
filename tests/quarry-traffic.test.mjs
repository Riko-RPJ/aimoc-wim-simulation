import test from 'node:test';import assert from 'node:assert/strict';
import {defaultQuarryTrafficInput,normalizeTrafficInput,simulateQuarryTraffic,effectiveMeanServiceSeconds,quarrySystemSizing} from '../public/quarry-traffic.js';
const scenario=(r,id)=>r.scenarios.find(s=>s.id===id);

test('confirmed 250 loaded trips imply 250 empty returns and 500 crossings, not 500 unique trucks',()=>{
 const r=simulateQuarryTraffic({arrivalMode:'paced',serviceCv:0});
 assert.equal(r.demand.loadedTripsPerHour,250);assert.equal(r.demand.emptyCrossingsPerHour,250);assert.equal(r.demand.totalCrossingsPerHour,500);
 assert.equal(r.demand.realizedCrossingsInWindow,500);assert.equal(r.fleet.minimumActiveTrucks,250);
 assert.equal(r.fleet.uniqueTruckCountMeasured,false);assert.equal(r.demand.eventBasis,'gate_crossing_events_not_unique_trucks');
});
test('250 combined crossings instead means 125 loaded and 125 empty per hour',()=>{
 const r=simulateQuarryTraffic({countBasis:'combined_crossings',demandPerHour:250,arrivalMode:'paced',serviceCv:0});
 assert.equal(r.demand.loadedTripsPerHour,125);assert.equal(r.demand.emptyCrossingsPerHour,125);assert.equal(r.demand.realizedCrossingsInWindow,250);assert.equal(r.fleet.minimumActiveTrucks,125);
});
test('explicit directional 60/40 rates and peak factor remain unambiguous and normalization is idempotent',()=>{
 const input={emptyPerHour:150,loadedPerHour:100,peakMultiplier:1.25};const a=normalizeTrafficInput(input),b=normalizeTrafficInput(a);
 assert.deepEqual(a,b);const r=simulateQuarryTraffic(a);
 assert.equal(r.demand.emptyCrossingsPerHour,187.5);assert.equal(r.demand.loadedTripsPerHour,125);assert.equal(r.demand.countBasis,'explicit_directional_rates');
});
test('nominal 80 s static and 12 s WIM sizing gives 7+7, 7+2 and 2+2 at 250 loaded per hour',()=>{
 const r=simulateQuarryTraffic({arrivalMode:'paced',serviceCv:0});
 assert.deepEqual(r.recommendations.static_static.minimumLanes,{empty:7,loaded:7});
 assert.deepEqual(r.recommendations.static_wim.minimumLanes,{empty:7,loaded:2});
 assert.deepEqual(r.recommendations.wim_wim.minimumLanes,{empty:2,loaded:2});
 assert.deepEqual(r.recommendations.single_static.minimumLanes,{shared:14});
 assert.equal(r.recommendations.single_static.isSaturated,true);
 assert.equal(r.recommendations.static_wim.chosenLanes.empty,1);assert.equal(r.recommendations.wim_wim.chosenLanes.loaded,2);
});
test('90 s static, slower 18 s WIM and 25 percent peak sensitivity change workload-based lane sizing',()=>{
 const slow=simulateQuarryTraffic({serviceCv:0,serviceSeconds:{static:90,wim:18}});
 assert.deepEqual(slow.recommendations.static_static.minimumLanes,{empty:8,loaded:8});
 assert.deepEqual(slow.recommendations.wim_wim.minimumLanes,{empty:2,loaded:2});
 const peak=simulateQuarryTraffic({serviceCv:0,peakMultiplier:1.25});
 assert.deepEqual(peak.recommendations.static_wim.minimumLanes,{empty:9,loaded:2});
 assert.equal(peak.demand.loadedTripsPerHour,312.5);assert.equal(peak.fleet.minimumActiveTrucks,313);
});
test('physical clearance/headway floor governs both service and minimum lane sizing',()=>{
 const r=simulateQuarryTraffic({serviceCv:0,minimumHeadwaySeconds:30,serviceSeconds:{wim:1,gate:1},arrivalMode:'paced'});
 assert.equal(r.recommendations.wim_wim.meanServiceSeconds.empty,30);
 assert.equal(r.recommendations.wim_wim.physicalMaximumCrossingsPerLanePerHour,120);
 assert.deepEqual(r.recommendations.wim_wim.minimumLanes,{empty:3,loaded:3});
});
test('finite horizon reports unfinished service and right-censored queue without inventing eventual waits',()=>{
 const r=simulateQuarryTraffic({emptyPerHour:0,loadedPerHour:360,horizonHours:1/60,arrivalMode:'paced',serviceCv:0});
 const m=scenario(r,'single_static').metrics;
 assert.equal(m.offered,6);assert.equal(m.started,1);assert.equal(m.completed,0);assert.equal(m.pending,6);
 assert.equal(m.endQueue,5);assert.equal(m.inService,1);assert.equal(m.maxQueue,5);
 assert.equal(m.p95WaitSeconds,0);assert.equal(m.censoredWaitingCount,5);assert.equal(m.rightCensored,true);
 assert.ok(Math.abs(m.pendingWaitLowerBoundMeanSeconds-25)<1e-8);
 assert.equal(m.waitMetricScope,'started_within_finite_window');
});
test('shared single static has less capacity than separate directional banks for identical offered jobs',()=>{
 const r=simulateQuarryTraffic({arrivalMode:'paced',serviceCv:0});
 const shared=scenario(r,'single_static'),separate=scenario(r,'static_static');
 assert.equal(shared.metrics.offered,separate.metrics.offered);
 assert.ok(shared.metrics.completed<separate.metrics.completed);
 assert.ok(shared.metrics.endQueue>separate.metrics.endQueue);
 assert.ok(shared.sizing.offeredUtilization.shared>separate.sizing.offeredUtilization.empty);
});
test('seeded arrivals are common across scenarios and reproducible across reruns/lane changes',()=>{
 const a=simulateQuarryTraffic({seed:123,arrivalMode:'batched'}),b=simulateQuarryTraffic({seed:123,arrivalMode:'batched'});
 assert.deepEqual(a,b);assert.equal(new Set(a.scenarios.map(s=>s.arrivalFingerprint)).size,1);
 const c=simulateQuarryTraffic({seed:123,arrivalMode:'batched',lanes:{static_wim:{empty:7,loaded:2}}});
 assert.equal(a.arrivalFingerprint,c.arrivalFingerprint);assert.equal(scenario(a,'static_wim').metrics.offered,scenario(c,'static_wim').metrics.offered);
 assert.notEqual(a.arrivalFingerprint,simulateQuarryTraffic({seed:124,arrivalMode:'batched'}).arrivalFingerprint);
});
test('series end matches metrics and no conservation identity counts crossings as unique trucks',()=>{
 const r=simulateQuarryTraffic({horizonHours:2,seed:7});
 for(const s of r.scenarios){
  const m=s.metrics,end=s.series.at(-1);assert.equal(m.completed+m.pending,m.offered);assert.equal(m.endQueue+m.inService,m.pending);
  assert.equal(end.completed,m.completed);assert.equal(end.pending,m.pending);assert.equal(end.queue,m.endQueue);
  assert.equal(s.directions.empty.offered+s.directions.loaded.offered,m.offered);
  assert.equal(end.emptyCompleted+end.loadedCompleted,m.completed);
  assert.ok(m.observedBusyFraction>=0&&m.observedBusyFraction<=1+1e-8);
  assert.equal(s.uniqueTruckCountMeasured,false);assert.equal(s.materialOutputVerified,false);
 }
});
test('estimate-only baseline is still gate-capacity limited and never claims measured tonnage',()=>{
 const r=simulateQuarryTraffic({arrivalMode:'paced',serviceCv:0});const s=scenario(r,'estimate_only');
 assert.equal(s.quantityBasis,'estimate_only');assert.equal(s.sizing.meanServiceSeconds.empty,6);
 assert.equal(s.materialOutputVerified,false);assert.ok(s.warnings.some(x=>x.includes('not measured')));
});
test('lane recommendation rerun uses the same arrivals and reduces the configured bottleneck',()=>{
 const base=simulateQuarryTraffic({arrivalMode:'paced',serviceCv:0});
 const improved=simulateQuarryTraffic({arrivalMode:'paced',serviceCv:0,lanes:{static_wim:base.recommendations.static_wim.minimumLanes}});
 const b=scenario(base,'static_wim'),a=scenario(improved,'static_wim');
 assert.equal(a.arrivalFingerprint,b.arrivalFingerprint);assert.ok(a.metrics.completed>b.metrics.completed);assert.ok(a.metrics.endQueue<b.metrics.endQueue);assert.equal(a.sizing.withinTarget,true);
});
test('service variability mean respects the headway floor, including tiny CV',()=>{
 assert.equal(effectiveMeanServiceSeconds(12,0,6),12);assert.equal(effectiveMeanServiceSeconds(1,0,6),6);
 assert.ok(effectiveMeanServiceSeconds(80,.1,6)>80);
 assert.ok(Number.isFinite(effectiveMeanServiceSeconds(6,1e-10,6)));
});
test('empty demand produces zero events without NaN waits or imaginary fleet',()=>{
 const r=simulateQuarryTraffic({demandPerHour:0});assert.equal(r.fleet.minimumActiveTrucks,0);
 for(const s of r.scenarios){assert.equal(s.metrics.offered,0);assert.equal(s.metrics.p95WaitSeconds,null);assert.equal(s.metrics.endQueue,0);}
});
test('invalid/unbounded demand, horizon, lanes and modes reject before simulation',()=>{
 for(const input of [{demandPerHour:NaN},{demandPerHour:Infinity},{demandPerHour:1001},{horizonHours:9},{serviceCv:-1},{lanes:{single_static:{shared:0}}},{arrivalMode:'unknown'},{emptyPerHour:1},{demandPerHour:1000,peakMultiplier:3}])assert.throws(()=>simulateQuarryTraffic(input));
});

test('system feasibility screen keeps bay, fleet and tonnage assumptions separate from weighing capacity',()=>{
 const r=quarrySystemSizing();
 assert.equal(r.minimumLoadingBays,11);assert.equal(r.minimumUnloadingBays,8);
 assert.equal(r.averagePayloadTonnes,45);assert.equal(r.demandTonnesPerHour,11250);
 assert.equal(r.illustrativeTonnesPerDay,180000);assert.equal(r.minimumFleetTrucks,250);
 assert.equal(r.productionCapacityVerified,false);assert.equal(r.fleetInventoryVerified,false);
 assert.equal(r.quantityBasis,'illustrative_volume_times_assumed_density_not_weighed_tonnage');
});
test('system sizing uses modeled peak rate once and exposes sensitivity of cycle and productive hours',()=>{
 const traffic=simulateQuarryTraffic({peakMultiplier:1.25});
 const r=quarrySystemSizing({loadedTripsPerHour:traffic.demand.loadedTripsPerHour,cycleMinutes:90,operatingHours:8});
 assert.equal(r.minimumLoadingBays,14);assert.equal(r.minimumUnloadingBays,10);
 assert.equal(r.minimumFleetTrucks,469);assert.equal(r.demandTonnesPerHour,14062.5);
 assert.equal(r.illustrativeTonnesPerDay,112500);
});
test('system sizing returns zero resources at zero demand and rejects nonfinite or unbounded assumptions',()=>{
 const r=quarrySystemSizing({loadedTripsPerHour:0});
 assert.equal(r.minimumLoadingBays,0);assert.equal(r.minimumUnloadingBays,0);assert.equal(r.minimumFleetTrucks,0);
 assert.equal(r.illustrativeTonnesPerDay,0);
 for(const input of [{loadedTripsPerHour:1001},{loadingServiceSeconds:0},{densityTonnesPerM3:NaN},{targetUtilization:1},{operatingHours:25},{cycleMinutes:0}]) assert.throws(()=>quarrySystemSizing(input));
});

test('balanced two-pass gate ceiling prevents independent loaded completions overstating sustainable hybrid trips',()=>{
 const r=simulateQuarryTraffic({arrivalMode:'paced',serviceCv:0});
 const shared=scenario(r,'single_static'),hybrid=scenario(r,'static_wim'),wim=scenario(r,'wim_wim');
 assert.equal(shared.sustainableGateOnlyTripsPerHour,22.5);assert.equal(shared.targetUtilizationGateOnlyTripsPerHour,18);
 assert.equal(hybrid.sustainableGateOnlyTripsPerHour,45);assert.equal(hybrid.targetUtilizationGateOnlyTripsPerHour,36);
 assert.equal(wim.sustainableGateOnlyTripsPerHour,600);assert.equal(wim.targetUtilizationGateOnlyTripsPerHour,480);
 assert.ok(hybrid.loadedCrossingsCompletedPerHour>hybrid.sustainableGateOnlyTripsPerHour);
 assert.equal(hybrid.materialOutputVerified,false);
 assert.equal(hybrid.sizing.directionalPassCapacityPerHour.empty,45);assert.equal(hybrid.sizing.directionalPassCapacityPerHour.loaded,300);
 assert.equal(shared.sizing.directionalPassCapacityPerHour,null);
});
test('gate-only paired capacity scales with chosen banks rather than independently completed loaded jobs',()=>{
 const r=simulateQuarryTraffic({serviceCv:0,lanes:{single_static:{shared:2},static_wim:{empty:7,loaded:2}}});
 assert.equal(scenario(r,'single_static').sustainableGateOnlyTripsPerHour,45);
 assert.equal(scenario(r,'static_wim').sustainableGateOnlyTripsPerHour,315);
 assert.equal(scenario(r,'static_wim').targetUtilizationGateOnlyTripsPerHour,252);
});

test('adding only outbound WIM lanes improves that direction even when maximum utilization and pooled P95 stay unchanged',()=>{
 // Fixed seed is a comparative fixture, not a claim that pooled P95 never changes.
 for(const id of ['static_wim','wim_wim']){
  const beforeResult=simulateQuarryTraffic({seed:42,lanes:{[id]:{empty:1,loaded:1}}});
  const afterResult=simulateQuarryTraffic({seed:42,lanes:{[id]:{empty:1,loaded:2}}});
  const before=scenario(beforeResult,id),after=scenario(afterResult,id);
  assert.equal(afterResult.arrivalFingerprint,beforeResult.arrivalFingerprint);
  assert.equal(after.metrics.offered,before.metrics.offered);
  assert.equal(after.sizing.offeredUtilization.loaded,before.sizing.offeredUtilization.loaded/2);
  assert.ok(after.directions.loaded.p95WaitSeconds<before.directions.loaded.p95WaitSeconds);
  assert.deepEqual(after.directions.empty,before.directions.empty);
  assert.equal(Math.max(...Object.values(after.sizing.offeredUtilization)),Math.max(...Object.values(before.sizing.offeredUtilization)));
  assert.equal(after.metrics.p95WaitSeconds,before.metrics.p95WaitSeconds);
 }
});

test('WIM banks changing from 1/1 to 2/2 reduce both directional workload and wait for the same arrivals',()=>{
 const beforeResult=simulateQuarryTraffic({seed:42,lanes:{wim_wim:{empty:1,loaded:1}}});
 const afterResult=simulateQuarryTraffic({seed:42,lanes:{wim_wim:{empty:2,loaded:2}}});
 const before=scenario(beforeResult,'wim_wim'),after=scenario(afterResult,'wim_wim');
 assert.equal(afterResult.arrivalFingerprint,beforeResult.arrivalFingerprint);
 for(const direction of ['empty','loaded']){
  assert.equal(after.sizing.offeredUtilization[direction],before.sizing.offeredUtilization[direction]/2);
  assert.ok(after.directions[direction].p95WaitSeconds<before.directions[direction].p95WaitSeconds);
 }
 assert.ok(after.metrics.p95WaitSeconds<before.metrics.p95WaitSeconds);
 assert.ok(after.metrics.completed>before.metrics.completed);
 assert.ok(after.metrics.censoredWaitingCount<before.metrics.censoredWaitingCount);
 assert.equal(before.sizing.withinTarget,false);assert.equal(after.sizing.withinTarget,true);
});

test('target utilization changes planning minimums but not fixed-lane workload, arrivals or queue waits',()=>{
 const fixedLanes={wim_wim:{empty:1,loaded:1}};
 const before=simulateQuarryTraffic({seed:42,targetUtilization:.8,lanes:fixedLanes});
 const after=simulateQuarryTraffic({seed:42,targetUtilization:.95,lanes:fixedLanes});
 assert.equal(after.arrivalFingerprint,before.arrivalFingerprint);
 assert.deepEqual(scenario(before,'wim_wim').sizing.minimumLanes,{empty:2,loaded:2});
 assert.deepEqual(scenario(after,'wim_wim').sizing.minimumLanes,{empty:1,loaded:1});
 for(const original of before.scenarios){
  const changed=scenario(after,original.id);
  assert.deepEqual(changed.lanes,original.lanes);
  assert.deepEqual(changed.sizing.offeredUtilization,original.sizing.offeredUtilization);
  assert.deepEqual(changed.metrics,original.metrics);
  assert.deepEqual(changed.directions,original.directions);
  assert.deepEqual(changed.series,original.series);
 }
 assert.equal(scenario(before,'wim_wim').sizing.withinTarget,false);
 assert.equal(scenario(after,'wim_wim').sizing.withinTarget,true);
});

test('a changed started cohort can raise pooled observed P95 while a bottleneck queue improves',()=>{
 // The finite window excludes jobs not yet started; the two pooled samples differ.
 const before=scenario(simulateQuarryTraffic({seed:42,lanes:{static_wim:{empty:1,loaded:1}}}),'static_wim');
 const after=scenario(simulateQuarryTraffic({seed:42,lanes:{static_wim:{empty:2,loaded:1}}}),'static_wim');
 assert.equal(after.arrivalFingerprint,before.arrivalFingerprint);
 assert.ok(after.metrics.completed>before.metrics.completed);
 assert.ok(after.metrics.endQueue<before.metrics.endQueue);
 assert.ok(after.directions.empty.p95WaitSeconds<before.directions.empty.p95WaitSeconds);
 assert.ok(after.metrics.observedWaitSampleCount>before.metrics.observedWaitSampleCount);
 assert.ok(after.metrics.censoredWaitingCount<before.metrics.censoredWaitingCount);
 assert.ok(after.metrics.p95WaitSeconds>before.metrics.p95WaitSeconds);
 for(const result of [before,after]){
  assert.equal(result.metrics.waitMetricScope,'started_within_finite_window');
  assert.equal(result.metrics.p95Method,'nearest_rank_observed_starts_only');
  assert.equal(result.metrics.rightCensored,true);
  assert.equal(result.metrics.observedWaitSampleCount+result.metrics.censoredWaitingCount,result.metrics.offered);
 }
});
