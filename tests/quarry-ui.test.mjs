// Binding regression with a minimal DOM, real page module and real domain reducers.
// This does not claim browser, rendering or layout coverage.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/quarry.html',import.meta.url),'utf8'),nodes=[],byId=new Map();
function attrs(raw){return Object.fromEntries([...raw.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));}
class Element{
 set value(value){this._value=String(value);}get value(){return this._value;}
 constructor(tag='div',a={}){this.tagName=tag.toUpperCase();this.id=a.id||'';this.attributes={...a};this.dataset={};for(const[k,v]of Object.entries(a))if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v;this.value=a.value||'';this.min=a.min||'';this.max=a.max||'';this.style={};this.children=[];this.options=[];this.events={};this.textContent='';this.hidden=false;this.disabled=false;this.classList={toggle(){},add(){},remove(){}};}
 addEventListener(name,fn){this.events[name]=fn;}setAttribute(name,value){this.attributes[name]=String(value);}getAttribute(name){return this.attributes[name]??null;}closest(){return {querySelector:()=>({textContent:this.id})};}reportValidity(){return true;}
 replaceChildren(...items){this.children=items;this.parsed=[];if(this.tagName==='SELECT'){this.options=items;if(!items.some(i=>i.value===this.value))this.value=items[0]?.value||'';}}
 append(...items){this.children.push(...items);}set innerHTML(value){this._html=value;this.parsed=[...value.matchAll(/<(tr|input|button)\b([^>]*)>/g)].map(m=>new Element(m[1],attrs(m[2])));}get innerHTML(){return this._html||'';}
 querySelectorAll(selector){if(this.id==='sizing-controls'&&selector==='button')return nodes.filter(n=>n.dataset.sizing);return (this.parsed||[]).filter(n=>selector==='input'?n.tagName==='INPUT':selector==='tr'?n.tagName==='TR':selector==='button'?n.tagName==='BUTTON':false);}
}
for(const m of html.matchAll(/<([\w-]+)\b([^>]*)>/g)){const a=attrs(m[2]),e=new Element(m[1],a);if(a.id)byId.set(a.id,e);if(a.id||Object.keys(e.dataset).length)nodes.push(e);}
for(const m of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)){const e=byId.get(attrs(m[1]).id);e.options=[...m[2].matchAll(/<option\b([^>]*)>([^<]*)/g)].map(o=>Object.assign(new Element('option',attrs(o[1])),{textContent:o[2]}));e.value=e.options.find(o=>m[2].includes(`value="${o.value}" selected`))?.value||e.options[0]?.value||'';}
globalThis.localStorage={getItem:()=>null,setItem(){}};globalThis.window={};globalThis.document={documentElement:{},getElementById:id=>byId.get(id),createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text}),querySelectorAll(selector){if(selector==='[data-i18n]')return nodes.filter(n=>n.dataset.i18n);if(selector==='[data-tab]')return nodes.filter(n=>n.dataset.tab);if(selector==='.tab-panel')return ['traffic-panel','logistics-panel','integration-panel'].map(id=>byId.get(id));return [];},querySelector(selector){const key=/\[data-i18n="([^"]+)"\]/.exec(selector)?.[1];return nodes.find(n=>n.dataset.i18n===key);}};
await import('../public/quarry.js');
const snapshot=()=>window.AIMOC_QUARRY.getSnapshot();
const submit=()=>byId.get('traffic-form').events.submit({preventDefault(){}});
const language=value=>{byId.get('language').value=value;byId.get('language').events.change();};
const mode=value=>nodes.find(n=>n.dataset.sizing===value).onclick();
const scenario=id=>snapshot().traffic.scenarios.find(s=>s.id===id);
const laneInput=(id,direction)=>byId.get('scenario-rows').querySelectorAll('input').find(n=>n.dataset.laneScenario===id&&n.dataset.laneDirection===direction);
function editLane(id,direction,value){const input=laneInput(id,direction);assert.ok(input,`Missing ${id}.${direction} lane input (${snapshot().sizingMode}; ${byId.get('traffic-error').textContent})`);input.value=String(value);input.events.input();}
function rowMarkup(id){const row=byId.get('scenario-rows').innerHTML.match(new RegExp(`<tr\\b[^>]*data-scenario="${id}"[^>]*>([\\s\\S]*?)<\\/tr>`));assert.ok(row,`Missing rendered row ${id}`);return row[1];}
function renderedField(id,attribute,value){
 const marker=value===undefined?`${attribute}(?:="[^"]*")?`:`${attribute}="${value}"`;
 const match=rowMarkup(id).match(new RegExp(`<([a-z][\\w-]*)\\b[^>]*${marker}[^>]*>([\\s\\S]*?)<\\/\\1>`));
 assert.ok(match,`Missing rendered ${attribute} in ${id}`);
 return match[2].replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
}

test('UI bindings complete the actual cargo workflow and keep rejection tests immutable',()=>{
 assert.equal(snapshot().traffic.demand.totalCrossingsPerHour,500);assert.equal(snapshot().logistics.totals.mass_balance_ok,true);
 nodes.find(n=>n.dataset.sizing==='recommended').onclick();assert.equal(snapshot().traffic.scenarios.find(s=>s.id==='static_wim').lanes.empty,7);assert.equal(snapshot().traffic.scenarios.find(s=>s.id==='static_wim').lanes.loaded,2);
 for(let i=0;i<8;i++)byId.get('next-trip-step').onclick();assert.equal(snapshot().tripStep,8);assert.equal(snapshot().logistics.voyages[0].loaded_t,45);assert.equal(snapshot().logistics.voyages[0].reconciliation,'reconciled_demo');assert.equal(snapshot().logistics.totals.mass_balance_ok,true);
 byId.get('test-wrong-vessel').onclick();assert.match(byId.get('logistics-feedback').textContent,/ROUTE_MISMATCH/);byId.get('test-over-capacity').onclick();assert.match(byId.get('logistics-feedback').textContent,/VESSEL_CAPACITY_EXCEEDED/);assert.equal(snapshot().logistics.voyages[0].loaded_t,45);
 language('en');assert.equal(snapshot().locale,'en');assert.match(byId.get('next-trip-step').textContent,/Start next trip/);
 byId.get('vessel-catalog').value='hs-corvus';byId.get('vessel-catalog').events.change();assert.equal(snapshot().logistics,null);assert.equal(byId.get('next-trip-step').disabled,true);
 byId.get('approved-cargo-limit').value='2000';byId.get('approved-cargo-limit').events.change();assert.equal(snapshot().logistics.voyages[0].approved_cargo_limit_t,2000);assert.equal(byId.get('next-trip-step').disabled,false);
});

test('first custom entry starts from the visible recommendation and preserves edited drafts across modes',()=>{
 // The previous test leaves the visible model at its default recommendation.
 assert.deepEqual(scenario('static_wim').lanes,{empty:7,loaded:2});
 assert.deepEqual(scenario('wim_wim').lanes,{empty:2,loaded:2});
 mode('custom');
 assert.deepEqual(scenario('static_wim').lanes,{empty:7,loaded:2});
 assert.deepEqual(scenario('wim_wim').lanes,{empty:2,loaded:2});
 editLane('static_wim','empty',8);submit();
 mode('single');assert.deepEqual(scenario('static_wim').lanes,{empty:1,loaded:1});
 mode('recommended');assert.deepEqual(scenario('static_wim').lanes,{empty:7,loaded:2});
 mode('custom');assert.deepEqual(scenario('static_wim').lanes,{empty:8,loaded:2});
 language('id');assert.equal(Number(laneInput('static_wim','empty').value),8);
 language('en');assert.equal(Number(laneInput('static_wim','empty').value),8);
});

test('edited or invalid assumptions clear prior results, survive locale changes, and recover only after valid calculation',()=>{
 byId.get('density').value='0';byId.get('traffic-form').events.input();assert.equal(snapshot().traffic,null);assert.equal(snapshot().logistics,null);
 assert.equal(byId.get('metric-payload').textContent,'—');assert.equal(byId.get('metric-mass').textContent,'—');assert.equal(byId.get('next-trip-step').disabled,true);assert.equal(byId.get('test-wrong-vessel').disabled,true);
 submit();assert.equal(snapshot().traffic,null);assert.equal(snapshot().logistics,null);assert.equal(byId.get('scenario-rows').children.length,0);assert.equal(byId.get('stock-rows').children.length,0);
 language('id');assert.match(byId.get('traffic-error').textContent,/Konfigurasi tidak valid/);language('en');assert.match(byId.get('traffic-error').textContent,/Invalid configuration/);assert.doesNotMatch(byId.get('queue-chart').textContent,/NaN|Infinity/);assert.equal(snapshot().traffic,null);
 byId.get('reset-ledger').onclick();assert.equal(snapshot().logistics,null);assert.equal(byId.get('next-trip-step').disabled,true);
 byId.get('density').value='1.5';byId.get('traffic-form').events.input();assert.equal(snapshot().traffic,null);submit();assert.equal(snapshot().traffic.demand.totalCrossingsPerHour,500);assert.equal(snapshot().logistics.totals.mass_balance_ok,true);assert.equal(byId.get('next-trip-step').disabled,false);assert.equal(byId.get('traffic-error').hidden,true);
});


test('peak multiplier is applied once and its invalid value clears state until corrected',()=>{
 byId.get('peak-multiplier').value='1.25';byId.get('traffic-form').events.input();assert.equal(snapshot().traffic,null);submit();
 assert.equal(snapshot().traffic.input.peakMultiplier,1.25);assert.equal(snapshot().traffic.demand.loadedTripsPerHour,312.5);assert.equal(snapshot().traffic.demand.totalCrossingsPerHour,625);
 assert.equal(snapshot().logistics.planned_flow.loaded_trips_per_hour,312.5);assert.equal(snapshot().logistics.planned_flow.total_crossings_per_hour,625);
 assert.match(byId.get('traffic-insight').textContent,/14 loading bays.*10 unloading bays/);assert.equal(byId.get('metric-mass').children[0].textContent,'14,062.5');
 byId.get('peak-multiplier').value='0';byId.get('traffic-form').events.input();submit();assert.equal(snapshot().traffic,null);assert.equal(snapshot().logistics,null);assert.equal(byId.get('next-trip-step').disabled,true);
 language('id');assert.match(byId.get('traffic-error').textContent,/Konfigurasi tidak valid/);
 byId.get('peak-multiplier').value='1.25';byId.get('traffic-form').events.input();submit();assert.equal(snapshot().traffic.demand.loadedTripsPerHour,312.5);assert.equal(snapshot().traffic.demand.totalCrossingsPerHour,625);assert.equal(byId.get('next-trip-step').disabled,false);
});


test('custom lane input survives draft edits, blur-only submission, rerenders and invalid correction',()=>{
 language('en');nodes.find(n=>n.dataset.sizing==='custom').onclick();
 const lane=()=>byId.get('scenario-rows').querySelectorAll('input').find(n=>n.dataset.laneScenario==='wim_wim'&&n.dataset.laneDirection==='empty');
 lane().value='2';lane().events.input();assert.equal(snapshot().traffic,null);assert.equal(snapshot().logistics,null);assert.equal(byId.get('metric-loaded').textContent,'—');
 submit();assert.equal(snapshot().traffic.scenarios.find(s=>s.id==='wim_wim').lanes.empty,2);assert.equal(Number(lane().value),2);
 lane().value='3';submit();assert.equal(snapshot().traffic.scenarios.find(s=>s.id==='wim_wim').lanes.empty,3);assert.equal(Number(lane().value),3);
 language('id');assert.equal(Number(lane().value),3);assert.match(document.querySelector('[data-i18n="confirmedDemand"]').textContent,/Basis permintaan/);
 lane().value='0';lane().events.input();submit();assert.equal(snapshot().traffic,null);assert.equal(snapshot().logistics,null);
 assert.ok(lane());lane().value='2';lane().events.input();submit();assert.equal(snapshot().traffic.scenarios.find(s=>s.id==='wim_wim').lanes.empty,2);
});

test('custom direction details expose improvements even when the other direction keeps summary utilization and P95 unchanged',()=>{
 byId.get('reset-inputs').onclick();language('en');mode('custom');
 editLane('static_wim','empty',1);editLane('static_wim','loaded',1);submit();
 const before=scenario('static_wim');
 const beforeDisplay={util:renderedField('static_wim','data-util-overall'),p95:renderedField('static_wim','data-p95-overall'),
  outboundUtil:renderedField('static_wim','data-util-direction','loaded'),outboundP95:renderedField('static_wim','data-p95-direction','loaded')};
 editLane('static_wim','loaded',2);assert.equal(snapshot().traffic,null);submit();
 const after=scenario('static_wim');
 assert.equal(after.arrivalFingerprint,before.arrivalFingerprint);
 assert.equal(after.sizing.offeredUtilization.empty,before.sizing.offeredUtilization.empty);
 assert.equal(after.metrics.p95WaitSeconds,before.metrics.p95WaitSeconds);
 assert.equal(after.sizing.offeredUtilization.loaded,before.sizing.offeredUtilization.loaded/2);
 assert.ok(before.directions.loaded.p95WaitSeconds>50&&before.directions.loaded.p95WaitSeconds<60);
 assert.ok(after.directions.loaded.p95WaitSeconds>0&&after.directions.loaded.p95WaitSeconds<10);
 assert.equal(renderedField('static_wim','data-util-overall'),beforeDisplay.util);
 assert.equal(renderedField('static_wim','data-p95-overall'),beforeDisplay.p95);
 assert.notEqual(renderedField('static_wim','data-util-direction','loaded'),beforeDisplay.outboundUtil);
 assert.notEqual(renderedField('static_wim','data-p95-direction','loaded'),beforeDisplay.outboundP95);
 assert.match(rowMarkup('static_wim'),/Inbound|inbound/);
 assert.match(rowMarkup('static_wim'),/Outbound|outbound/);
 editLane('static_wim','empty',7);submit();
 const balanced=scenario('static_wim');
 assert.equal(balanced.sizing.withinTarget,true);
 assert.ok(balanced.metrics.p95WaitSeconds<after.metrics.p95WaitSeconds);
 assert.notEqual(renderedField('static_wim','data-util-overall'),beforeDisplay.util);
 assert.notEqual(renderedField('static_wim','data-p95-overall'),beforeDisplay.p95);
});

test('adding WIM lanes in both directions changes the actual calculation and its visible summary',()=>{
 editLane('wim_wim','empty',1);editLane('wim_wim','loaded',1);submit();
 const before=scenario('wim_wim');
 const beforeDisplay={util:renderedField('wim_wim','data-util-overall'),p95:renderedField('wim_wim','data-p95-overall')};
 editLane('wim_wim','empty',2);editLane('wim_wim','loaded',2);submit();
 const after=scenario('wim_wim');
 assert.equal(after.arrivalFingerprint,before.arrivalFingerprint);
 assert.equal(after.sizing.offeredUtilization.empty,before.sizing.offeredUtilization.empty/2);
 assert.equal(after.sizing.offeredUtilization.loaded,before.sizing.offeredUtilization.loaded/2);
 assert.ok(after.metrics.p95WaitSeconds<before.metrics.p95WaitSeconds);
 assert.ok(after.metrics.endQueue<before.metrics.endQueue);
 assert.notEqual(renderedField('wim_wim','data-util-overall'),beforeDisplay.util);
 assert.notEqual(renderedField('wim_wim','data-p95-overall'),beforeDisplay.p95);
});

test('copy-model action uses current assumptions, whereas a target change alone does not change fixed custom capacity',()=>{
 language('en');editLane('static_wim','empty',7);editLane('static_wim','loaded',2);submit();
 const before=scenario('static_wim');
 byId.get('target-utilization').value='50';byId.get('traffic-form').events.input();submit();
 const fixed=scenario('static_wim');
 assert.deepEqual(fixed.lanes,before.lanes);
 assert.deepEqual(fixed.sizing.offeredUtilization,before.sizing.offeredUtilization);
 assert.equal(fixed.metrics.p95WaitSeconds,before.metrics.p95WaitSeconds);
 assert.deepEqual(fixed.sizing.minimumLanes,{empty:12,loaded:2});
 assert.equal(fixed.sizing.withinTarget,false);
 assert.ok(byId.get('copy-model-lanes'));
 byId.get('copy-model-lanes').onclick();
 assert.equal(snapshot().sizingMode,'custom');
 assert.deepEqual(scenario('static_wim').lanes,{empty:12,loaded:2});
 assert.equal(scenario('static_wim').sizing.withinTarget,true);
 // Unlike a draft reset, this explicit action replaces the user's saved custom choice.
 mode('single');mode('custom');assert.deepEqual(scenario('static_wim').lanes,{empty:12,loaded:2});
});

test('external lane inputs and adjacent calculate button are associated with the actual form, and invalid drafts recover',()=>{
 const input=laneInput('static_wim','empty');
 assert.equal(input.getAttribute('form'),'traffic-form');assert.equal(input.getAttribute('step'),'1');
 const calculateButton=byId.get('calculate-lanes');assert.ok(calculateButton);
 assert.equal(calculateButton.getAttribute('type'),'submit');assert.equal(calculateButton.getAttribute('form'),'traffic-form');
 for(const invalid of ['',0,1.5,65]){
  editLane('static_wim','empty',invalid);submit();
  assert.equal(snapshot().traffic,null);assert.equal(snapshot().logistics,null);
  assert.equal(byId.get('next-trip-step').disabled,true);
  assert.doesNotMatch(byId.get('traffic-error').textContent,/NaN|Infinity/);
  editLane('static_wim','empty',12);submit();assert.equal(scenario('static_wim').lanes.empty,12);
 }
});
