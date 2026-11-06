import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
import {createTicketPDF,ticketPdfFilename} from '../public/modules/ticket-pdf.js';
import {hybridConfig} from '../public/parallel-data.js';
import {ParallelSimulation} from '../public/parallel-simulation.js';
import {SingleStaticSimulation} from '../public/single-static-simulation.js';

const vendor=await readFile(new URL('../public/vendor/jspdf.umd.min.js',import.meta.url),'utf8');
const commonjs={exports:{}};
vm.runInNewContext(vendor,{module:commonjs,exports:commonjs.exports,console,setTimeout,clearTimeout,atob,btoa,Date,TextEncoder,TextDecoder},{filename:'jspdf.umd.min.js'});
const JsPDF=commonjs.exports.jsPDF;
const input={capacity:32,tare:23107,density:1.5,speed:10,dwell:10,limit:80000,manual:false,gross:90000,orderKg:48000,orderId:'SO-PDF-DEMO-2026-003',comparison:'same',fault:'normal',autoQR:true};
function snapshot(phase='phase1_single_static',locale='id') {
 const sim=new (phase==='phase1_single_static'?SingleStaticSimulation:ParallelSimulation)(hybridConfig(input));sim.start();sim.advance(2000);
 return {...sim.payload(),deployment_phase:phase,locale,configuration_valid:true,trip_id:phase==='phase1_single_static'?'S1-DEMO-2026-003':'PAR-DEMO-2026-003',measured_at:'2026-11-01T09:45:00.000Z'};
}
function content(doc){return doc.internal.pages.slice(1).flat().join('\n');}

test('invalid or incomplete snapshots are rejected before constructing a PDF',()=>{
 for(const key of ['complete','weight_valid','configuration_valid']){
  const s=snapshot();s[key]=false;let constructed=false;
  assert.throws(()=>createTicketPDF(s,function(){constructed=true;}));assert.equal(constructed,false);
 }
 const s=snapshot();s.blocked=true;s.block_reason='Indicator held';assert.throws(()=>createTicketPDF(s,JsPDF),/Indicator held/);
 s.blocked=false;s.measurement.net_cargo_kg=123;assert.throws(()=>createTicketPDF(s,JsPDF),/konsisten/);
});

test('missing PDF runtime gives a useful localized error',()=>{
 assert.throws(()=>createTicketPDF(snapshot(),undefined),/Pustaka PDF/);
 assert.throws(()=>createTicketPDF(snapshot('phase2_static_wim','en'),null),/PDF library/);
});

for(const [phase,locale,name] of [['phase1_single_static','id','phase1-id'],['phase2_static_wim','en','phase2-en']]){
 test(`genuine jsPDF produces one A4 ${name} ticket from actual engine output`,async()=>{
  const s=snapshot(phase,locale),doc=createTicketPDF(s,JsPDF),pdf=doc.output('arraybuffer'),text=content(doc);
  assert.equal(doc.getNumberOfPages(),1);assert.ok(Math.abs(doc.internal.pageSize.getWidth()-210)<.1);assert.ok(Math.abs(doc.internal.pageSize.getHeight()-297)<.1);
  assert.equal(Buffer.from(pdf).subarray(0,8).toString(),'%PDF-1.3');assert.ok(pdf.byteLength>1800);
  for(const value of [s.trip_id,s.erp.order.order_id,s.vehicle.plate,'DEMO',locale==='id'?'Muatan bersih':'Net cargo',locale==='id'?'belum tersambung':'not connected'])assert.ok(text.includes(value),value);
  assert.match(text,phase==='phase1_single_static'?/Satu statis/:/WIM outbound/);
  if(process.env.AIMOC_TICKET_PDF_OUTPUT){await mkdir(process.env.AIMOC_TICKET_PDF_OUTPUT,{recursive:true});await writeFile(path.join(process.env.AIMOC_TICKET_PDF_OUTPUT,`ticket-${name}.pdf`),Buffer.from(pdf));}
 });
}

test('the same snapshot yields identical PDF bytes, including stable metadata',()=>{
 const s=snapshot();assert.deepEqual(Buffer.from(createTicketPDF(s,JsPDF).output('arraybuffer')),Buffer.from(createTicketPDF(s,JsPDF).output('arraybuffer')));
});

test('long identifiers wrap and paginate without truncation or unbounded row overlap',()=>{
 const s=snapshot('phase2_static_wim','en');s.trip_id='BEGIN-'+('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.repeat(95))+'-ENDMARKER';
 const doc=createTicketPDF(s,JsPDF),text=content(doc);assert.ok(doc.getNumberOfPages()>1);assert.ok(doc.getNumberOfPages()<6);
 assert.ok(text.includes('ENDMARKER'));assert.equal((text.match(/AIMOC Weighbridge/g)||[]).length,doc.getNumberOfPages());
});

test('download filenames cannot contain paths, control characters or unbounded trip IDs',()=>{
 assert.equal(ticketPdfFilename({deployment_phase:'phase1_single_static',trip_id:'../A/B\\C: .. hi\n'}),'AIMOC-Demo-Phase1-A-B-C-hi.pdf');
 assert.ok(ticketPdfFilename({trip_id:'a'.repeat(1000)}).length<130);assert.equal(ticketPdfFilename({trip_id:'../'}),'AIMOC-Demo-Phase2-trip.pdf');
});
