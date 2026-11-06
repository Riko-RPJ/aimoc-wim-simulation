import {staticScale as H,staticCivil as C} from './staticScale-data.js';
import {renderParallelPanel} from './parallel-panel.js';
import {parallelGeometry as G,parallelBOM,hybridConfig,parallelFlowEstimate,constructionPhases,parallelDimensionRows} from './parallel-data.js';
import {ParallelSimulation} from './parallel-simulation.js';
import {SingleStaticSimulation,singleStaticFlow} from './single-static-simulation.js';
import {createParallelScene} from './parallel-scene.js';
import {createSingleStaticScene} from './single-static-scene.js';
import {exportParallelPDF} from './parallel-report.js';
import {DemoControllerState} from './demo-controller-state.js';

const $ = id => document.getElementById(id);
let language = localStorage.getItem('aimoc-language') === 'en' ? 'en' : 'id';
const t = (id,en) => language === 'en' ? en : id;
const fmt = (n,d=2) => Number.isFinite(n) ? n.toLocaleString(language === 'en'?'en-GB':'id-ID',{maximumFractionDigits:d}) : '—';
const phase1 = () => $('deploymentPhase').value === 'phase1_single_static';
const control = new DemoControllerState();
let sim,viewer,viewerPhase,mode='operation',dirty=true,last=0,lastRender=0;
const stageNames = {
  entry_qr:['Scan QR masuk · referensi order NetSuite','Entry QR · NetSuite order reference'],
  static_approach:['Masuk ke timbangan statis','Approach inbound static scale'],
  static_settle:['Berhenti · tunggu tare stabil','Stop · wait for stable tare'],
  static_record:['Rekam tare melalui IoT','Record tare through IoT'],
  entry_depart:['Kosongkan dek menuju area muat','Clear scale toward loading area'],
  entry_release:['Lepaskan akses masuk setelah truk keluar','Release inbound access after rear clearance'],
  to_loading:['Menuju area muat','Travel to loading area'],loading:['Pemuatan','Loading'],
  to_exit:['Kembali untuk timbang keluar','Return for outbound weighing'],
  exit_qr:['Scan QR trip yang sama','Scan the same trip QR'],
  exit_record:['Rekam gross statis stabil','Record stable static gross'],
  exit_release:['Lepaskan akses keluar setelah truk keluar','Release outbound access after rear clearance'],
  to_road:['Keluar area timbang','Leave weighing area'],
};
function phaseStageNames() {
  return {...stageNames,
    wim_approach:phase1()?['Kembali ke timbangan statis yang sama','Return to the SAME static scale']:['Menuju WIM keluar','Approach outbound WIM'],
    wim_measure:phase1()?['Berhenti · tunggu gross statis stabil','Stop · wait for stable static gross']:['Pembacaan gross WIM','Read WIM gross'],
    exit_depart:phase1()?['Kosongkan timbangan statis · arah keluar','Clear shared static scale · outbound']:['Keluar dari WIM','Depart from WIM'],
  };
}
function stageLabel() {
  if (!control.valid) return t('KONFIGURASI TIDAK VALID','INVALID CONFIGURATION');
  if (sim?.blocked) return t('DITAHAN · hasil belum valid','HELD · result is not valid');
  if (sim?.done) return t('Trip selesai','Trip complete');
  const stages=phaseStageNames();
  return sim ? t(...(stages[sim.stage.id] || [sim.stage.id,sim.stage.id])) : t('Menyiapkan trip','Preparing trip');
}
function blockReason() { return sim?.blocked ? (sim.events.at(-1)?.message || t('Hasil timbang ditahan.','Weight result held.')) : ''; }
function getSnapshot() {
  const base = sim?.payload(limits()) || {synthetic:true,complete:false,weight_valid:false,measurement:{}};
  const p = {...base, deployment_phase:phase1()?'phase1_single_static':'phase2_static_wim',locale:language,
    configuration_valid:control.valid,configuration_error:control.error,running:!!sim?.running,
    blocked:!!sim?.blocked,block_reason:blockReason(),stage_label:stageLabel(),api_validation:{...control.api}};
  if (!control.valid) {
    p.complete=false; p.weight_valid=false;
    p.trip_id=null;p.idempotency_key=null;p.measured_at=null;p.stage='configuration_invalid';
    p.schema_version=phase1()?'4.0':'2.1';p.scenario=phase1()?'single_static_inbound_outbound':'parallel_static_inbound_wim_outbound';
    p.source=null;p.shared_scale=null;p.invalid_reading=null;
    p.gate_state={inbound_admission:'red',outbound_admission:'red',demonstration_only:true};
    p.measurement={tare_kg:null,gross_kg:null,net_cargo_kg:null,net_cargo_tonnes:null,volume_equivalent_m3:null,density_t_per_m3:null};
    p.comparison={ordered_kg:null,measured_net_kg:null,difference_kg:null,difference_pct:null};
    p.volume_assessment=null;p.odol=null;p.sensor_readings=[];
    p.erp=null;p.scale_measurements=[];p.resource_history=[];
    p.delivery={mode:'configuration_invalid',sent_to_erp:false,persistence:'none'};
    p.configuration_note=t('Hasil sebelumnya tidak berlaku untuk konfigurasi ini.','Previous results do not apply to this configuration.');
  }
  return p;
}
function table(headers,rows) { return '<table><thead><tr>'+headers.map(h=>`<th>${h}</th>`).join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(v=>`<td>${v}</td>`).join('')+'</tr>').join('')+'</tbody></table>'; }
function limits() { return {length_m:12,width_m:3.2,height_m:4.2}; }
function numeric(id) {
  const raw=$(id).value.trim(),n=Number(raw);
  if (!raw || !Number.isFinite(n)) throw Error(t('Isi angka yang valid: ','Enter a valid number: ')+id);
  return n;
}
function getConfig() {
  const orderId=$('orderId').value.trim();
  if (!/^[\w .\/-]{1,60}$/.test(orderId)) throw Error(t('Nomor order tidak valid.','Invalid order ID.'));
  const c=hybridConfig({truckProfile:$('truckProfile').value,capacity:numeric('capacity'),tare:numeric('tare'),density:numeric('density'),speed:numeric('speed'),dwell:numeric('dwell'),limit:numeric('limit'),manual:$('manual').checked,gross:$('manual').checked?numeric('gross'):90000,orderKg:numeric('orderTonnes')*1000,orderId,comparison:$('comparison').value,fault:$('fault').value,autoQR:$('autoQR').value==='auto'});
  if (c.orderKg>200000 || c.limit>200000) throw Error(t('Pesanan atau batas berat melampaui rentang demo.','Order or weight threshold exceeds the demo range.'));
  return c;
}
function setConfigError(message) {
  if (sim) sim.running=false;
  control.invalidate(message); $('configError').textContent=message; dirty=true; render();
}
function ensureViewer() {
  const wanted=phase1()?'phase1':'phase2'; if(viewerPhase===wanted && viewer)return;
  viewer?.dispose?.(); viewer=null; viewerPhase=wanted;
  $('sceneLabels').replaceChildren(); $('hybridViewport').querySelectorAll('canvas,.navigation-3d').forEach(n=>n.remove());
  try {viewer=(phase1()?createSingleStaticScene:createParallelScene)($('hybridViewport'),()=>language);$('webglError').hidden=true;}
  catch(error){$('webglError').hidden=false; console.warn('3D unavailable',error);}
}
function reset() {
  // Always allow correction of a manual value, even when configuration validation fails.
  $('gross').disabled=!$('manual').checked;
  control.clearRequest();
  ensureViewer();
  try {
    const config=getConfig(); sim=new (phase1()?SingleStaticSimulation:ParallelSimulation)(config);
    control.accept(sim.id); $('configError').textContent='';
    ensureViewer(); viewer?.setTruck(config); viewer?.setMode(mode,+$('constructionPhase').value);
    drawQR(); dirty=true; render();
  } catch(error) {
    const messages={
      'Invalid load inputs':t('Muatan tidak valid: berat jenis dan tare harus positif.','Invalid load: density and tare must be positive.'),
      'Gross must be between tare and 250,000 kg':t('Gross harus minimal sebesar tare dan maksimal 250.000 kg.','Gross must be at least tare and at most 250,000 kg.'),
      'Illustrative load is limited to 200% of bed capacity':t('Muatan ilustrasi dibatasi 200% kapasitas bak. Kurangi gross atau ubah kapasitas.','Illustrative load is limited to 200% of bed capacity. Reduce gross or change capacity.'),
      'Periksa rentang input / Check input ranges':t('Periksa rentang tare, berat jenis, kecepatan, stabilisasi dan pesanan.','Check tare, density, speed, settling and order ranges.'),
    };
    setConfigError(messages[error.message]||error.message);
  }
}
function drawQR() {
  if (!sim || !control.valid) return;
  const code=window.qrcode(0,'M'); code.addData(sim.qr.token); code.make();
  $('qrImage').innerHTML=code.createSvgTag({cellSize:3,margin:4,scalable:true});$('qrToken').textContent=sim.qr.token;
}
function currentBOM() {
  if(!phase1())return parallelBOM;
  return [
    ['Statis pitless modular','Modular pitless static',1,'80 t × 20 kg · 18 × 3 m · 6 modules · 8 load cells'],
    ['Indikator bersama','Shared indicator',1,'STATIC-IND-01 · stable tare and gross · OEM protocol pending'],
    ['Gateway IoT / UPS / jaringan','IoT gateway / UPS / network',1,'One shared weighing node; demonstration only'],
    ['Scanner QR','QR scanners',2,'Inbound and outbound reference · same order/trip'],
    ['CCTV tetap','Fixed CCTV',2,'Evidence illustration · no ANPR/PTZ'],
    ['Interlock arah / deteksi posisi','Direction interlock / position detection',1,'One shared resource; rear-clear release; not certified PLC logic'],
    ['WIM / quartz / IR WIM','WIM / quartz / WIM infrared',0,'Not installed in Phase 1 · future Phase 2'],
  ];
}
function phaseLabels() {
  const p1=phase1(); document.body.dataset.phase=p1?'phase1':'phase2';
  $('phaseSummary').textContent=p1?t('Satu statis 80 t dipakai bergantian untuk tare masuk dan gross keluar. Arah berlawanan ditahan hingga bagian belakang truk keluar zona timbangan. WIM belum dipasang.','One 80 t static scale is shared by inbound tare and outbound gross. Opposite admission is held until the rear clears the protected scale zone. WIM is not installed.'):
    t('Statis yang sama tetap untuk tare masuk. WIM baru menangani gross keluar pada lajur terpisah. QR dan ID trip tetap menghubungkan kedua pembacaan.','The static scale remains for inbound tare. New WIM measures outbound gross on a separate lane. QR and trip ID keep both readings linked.');
  const hero=document.querySelector('.hero h1'),desc=document.querySelector('.hero p');
  hero.textContent=p1?t('Phase 1 · Satu statis, dua arah.','Phase 1 · One static scale, two directions.'):t('Phase 2 · Masuk statis, keluar WIM.','Phase 2 · Static inbound, WIM outbound.');
  desc.textContent=p1?t('Order demo → QR masuk → tare statis → loading → QR keluar → gross pada statis yang sama → AIMOC','Demo order → entry QR → static tare → loading → exit QR → gross on the SAME scale → AIMOC'):
    t('Order demo → QR masuk → tare statis → loading → QR keluar → gross WIM → AIMOC','Demo order → entry QR → static tare → loading → exit QR → WIM gross → AIMOC');
  const speedLabel=$('speed').closest('label').querySelector('span');speedLabel.textContent=p1?t('Kecepatan pendekat (km/jam)','Approach reference speed (km/h)'):t('Kecepatan WIM (km/jam)','WIM speed (km/h)');
  $('fault').querySelector('[value="static"]').textContent=p1?t('Indikator tare statis tidak stabil','Inbound static indicator unstable'):t('Indikator statis tidak stabil','Static indicator unstable');
  $('fault').querySelector('[value="wim"]').textContent=p1?t('Indikator gross statis tidak stabil','Outbound static indicator unstable'):t('Sensor WIM gagal','WIM sensor fault');
  $('fault').querySelector('[value="offline"]').textContent=t('Cloud offline · ilustrasi lokal','Cloud offline · local illustration');
  const legend=document.querySelector('.legend:not(#utilityLegend)');
  legend.textContent=p1?t('1 statis / 1 indikator bersama · QR × 2 · CCTV × 2 · WIM belum terpasang','1 shared scale / 1 indicator · QR × 2 · CCTV × 2 · WIM not installed'):'1 Static / IoT · QR × 2 · Quartz × 4 · IR × 1 set · CCTV × 2';
  $('showCanopy').closest('label').hidden=p1;
  const wimScope=$('dimensionScope').querySelector('[value="wim"]');wimScope.hidden=p1;wimScope.disabled=p1;
  if(p1&&$('dimensionScope').value==='wim')$('dimensionScope').value='overview';
  $('limit').closest('label').querySelector('span').textContent=p1?t('Batas contoh gross statis (maks. alat 80.000 kg)','Example static gross limit (instrument max. 80,000 kg)'):t('Batas gross WIM (kg)','WIM gross limit (kg)');
  $('exportPDF').textContent=t('PDF desain Phase 2','Phase 2 design PDF');
  $('phasePDFNote').textContent=t('PDF engineering yang tersedia adalah referensi Phase 2. Phase 1 ditampilkan pada model satu statis dan tiket demo.','The engineering PDF is the Phase 2 reference. Phase 1 is shown in the single-scale model and demo ticket.');
  $('scopeNote').textContent=t('SIMULASI SENSOR DAN NetSuite · API hanya validasi · ERP belum tersambung · Tidak ada riwayat permanen.','SIMULATED SENSORS AND NetSuite · API validation only · ERP not connected · No permanent history.');
  const explanation=$('trafficInfo').nextElementSibling;
  explanation.textContent=p1?t('Dua lintasan pada satu resource per trip. Kapasitas adalah batas ideal model, bukan jaminan throughput atau waktu tunggu; korelasi truk kembali dari loading belum dimodelkan. Kontrol arah/posisi adalah ilustrasi, bukan PLC keselamatan tersertifikasi.','Two passes use one shared resource per trip. Capacity is a planning upper bound, not guaranteed throughput or waiting time; correlated returns from loading are not modelled. Direction/position controls are illustrative, not certified safety PLC logic.'):
    t('Antrean statis, gate dan loading tetap mungkin. Angka layanan adalah model perencanaan dengan asumsi truk 12 m dan proses gate, bukan rating OEM atau waktu animasi.','Static, gate and loading queues remain possible. Service figures are a planning model with a 12 m truck and gate assumptions, not OEM ratings or animation time.');
}
function translate() {
  document.documentElement.lang=language;$('hybridLanguage').value=language;
  document.querySelectorAll('[data-id][data-en]').forEach(el=>el.textContent=el.dataset[language]);
  $('deploymentPhase').options[0].textContent=t('Phase 1 · Satu statis masuk + keluar','Phase 1 · One static scale for entry + exit');
  $('deploymentPhase').options[1].textContent=t('Phase 2 · Statis masuk + WIM keluar','Phase 2 · Static entry + WIM exit');
  renderParallelPanel(language);$('focusStatic').onclick=()=>{viewer?.setView('static');$('hybridViewport').scrollIntoView({behavior:'smooth',block:'center'});};
  const heading=$('parallelDesign').querySelector('h2');if(heading)heading.textContent=t('Referensi alat statis yang dipakai pada kedua fase','Static equipment reference used in both phases');
  phaseLabels();renderDimensionSummary();
  const rows=parallelDimensionRows(language);
  $('dimensionTable').innerHTML=table([t('Bagian','Element'),t('Dimensi / posisi','Dimension / position'),t('Catatan','Notes')],phase1()?rows.filter((r,i)=>![3,4,8,9,10,11].includes(i)):rows);
  $('scenarioComparison').innerHTML=table([t('Fase / resource','Phase / resource'),t('Phase 1','Phase 1'),t('Phase 2','Phase 2')],[[t('Timbangan statis','Static scales'),1,1],['WIM / quartz','0 / 0','1 / 4'],['QR / CCTV','2 / 2','2 / 2'],[t('Tare / gross','Tare / gross'),t('Statis yang sama / statis yang sama','Same static / same static'),t('Statis / WIM','Static / WIM')],[t('Pemakaian resource','Resource use'),t('Dua lintasan bergantian pada satu dek','Two sequential passes on one deck'),t('Dua lajur berbeda','Two separate lanes')]]);
  $('bomTable').innerHTML=table([t('Komponen','Component'),t('Jumlah','Qty'),t('Keterangan','Description')],currentBOM().map(([id,en,n,desc])=>[t(id,en),n,desc]));
  dirty=true;render();
}
function renderDimensionSummary() {
  if(!$('dimensionSummary'))return;
  const rows=phase1()?[[t('Resource fisik','Physical resource'),'1 × STATIC-01'],[t('Dek / kapasitas','Deck / capacity'),'18 × 3 m / 80 t × 20 kg'],[t('Ramp / footprint konsep','Concept ramps / footprint'),'2 × 14.16 m / 52.32 m'],[t('Pembacaan / indikator','Readings / indicator'),t('Tare + gross / indikator yang sama','Tare + gross / same indicator')],[t('WIM','WIM'),t('Belum terpasang · Phase 2','Not installed · Phase 2')]]:
    [[t('Koridor konsep','Concept corridor'),'170 × 22 m'],[t('Statis / WIM','Static / WIM'),'18 × 3 m / 100 × 6.5 m'],[t('Jarak sumbu / raft','Centres / raft gap'),'12.5 / 5.5 m'],[t('Asumsi sipil','Civil assumptions'),t('Perlu kajian OEM/geoteknik','OEM/geotechnical review required')]];
  $('dimensionSummary').innerHTML=rows.map(([name,value])=>`<div><span>${name}</span><strong>${value}</strong></div>`).join('');
}
function render() {
  if(!sim)return;
  const p=getSnapshot(),m=p.measurement,c=sim.config,valid=control.valid,ready=valid&&p.complete&&p.weight_valid;
  document.body.classList.toggle('configuration-invalid',!valid);
  $('hybridViewport').dataset.configurationError=t('KONFIGURASI TIDAK VALID · terapkan ulang','INVALID CONFIGURATION · apply again');
  $('stageBadge').textContent=stageLabel();
  const direction=phase1()?sim.sharedScale?.direction:sim.signal==='static'?'inbound':sim.signal==='wim'?'outbound':null;
  $('stageDescription').textContent=`${fmt(sim.time,1)} s · ${phase1()?t('Timbangan bersama','Shared scale'):t('Lajur aktif','Active lane')}: ${direction||t('Semua merah','All red')} · ${sim.running?t('Berjalan','Running'):sim.done?t('Selesai','Complete'):t('Jeda / ditahan','Paused / held')}`;
  $('play').textContent=sim.running?t('Ⅱ Jeda','Ⅱ Pause'):t('▶ Jalankan / lanjutkan','▶ Run / resume');
  $('play').disabled=!valid||sim.blocked||sim.done;
  $('progress').style.width=(valid?(sim.done?100:(sim.index+sim.stageT/sim.stage.duration)/sim.stages.length*100):0)+'%';
  $('configError').textContent=control.error;
  $('staticFit').textContent=c.staticCompatibility.status==='engineering_hold'?t('ENGINEERING HOLD: verifikasi ban dan clearance deck sebelum operasi.','ENGINEERING HOLD: verify wheel tracks and deck clearance before operation.'):
    t('Pemeriksaan envelope awal sesuai; verifikasi OEM, ban/pagar dan metrologi tetap diperlukan. Divisi 20 kg bukan akurasi ±20 kg.','Initial envelope screen passes; OEM, wheel/guard clearance and metrology checks remain required. A 20 kg division is not ±20 kg accuracy.');
  $('loadPreview').textContent=valid?`${t('Acuan simulasi','Simulation reference')}: tare ${fmt(c.tare/1000)} t · gross ${fmt(c.gross/1000)} t · ${fmt(c.volume)} m³ / ${c.capacity} m³`:t('Perbaiki konfigurasi; hasil sebelumnya tidak berlaku.','Correct the configuration; previous results are not applicable.');
  const status=!valid?t('Konfigurasi tidak valid','Invalid configuration'):sim.blocked?t('Ditahan','Held'):p.weight_valid?t('Valid simulasi','Simulation valid'):t('Menunggu','Pending');
  $('metrics').innerHTML=[[t('Tare statis masuk','Inbound static tare'),m.tare_kg===null?'—':fmt(m.tare_kg/1000)+' t'],[phase1()?t('Gross pada statis yang sama','Gross on SAME static scale'):t('Gross WIM keluar','Outbound WIM gross'),m.gross_kg===null?'—':fmt(m.gross_kg/1000)+' t'],[t('Muatan bersih','Net cargo'),fmt(m.net_cargo_tonnes)+' t'],[t('Volume ekuivalen','Equivalent volume'),fmt(m.volume_equivalent_m3)+' m³'],[t('Kapasitas bak','Bed capacity'),c.capacity+' m³'],[t('Status alat timbang','Weighing validity'),status],[t('Pengiriman ERP','ERP delivery'),c.fault==='offline'?t('Ilustrasi lokal · belum dikirim','Local illustration · not sent'):t('Belum tersambung','Not connected')]].map(([key,value])=>`<div class="metric">${key}<strong>${value}</strong></div>`).join('');
  const v=p.comparison;
  $('comparisonRows').innerHTML=valid?`<tr><td>${fmt(v.ordered_kg/1000)} t</td><td>${fmt(v.measured_net_kg===null?null:v.measured_net_kg/1000)} t</td><td>${fmt(v.difference_kg===null?null:v.difference_kg/1000)} t</td><td>${fmt(v.difference_pct)}%</td><td>${t('Angka saja','Display only')}</td></tr>`:'<tr><td colspan="5">—</td></tr>';
  $('qrStatus').textContent=!valid?control.error:sim.qr.error||`${c.orderId} · ${t('Masuk','Entry')}: ${sim.qr.entryScanned?'✓':'—'} · ${t('Keluar','Exit')}: ${sim.qr.exitScanned?'✓':'—'} · ${sim.qr.closed?t('Trip ditutup','Trip closed'):t('Token aktif','Token active')}`;
  const gross=m.gross_kg,cap=phase1()?Math.min(H.capacityKg,c.limit):c.limit;
  $('odolTable').innerHTML=table([t('Parameter','Parameter'),t('Sumber','Source'),t('Terukur','Measured'),t('Batas contoh','Example limit'),t('Kelebihan','Excess')],[[t('Gross','Gross'),phase1()?'STATIC-01':'WIM',fmt(gross===null?null:gross/1000)+' t',fmt(cap/1000)+' t',fmt(gross===null?null:Math.max(0,gross-cap)/1000)+' t']]);
  $('sensorTable').innerHTML=table([t('Perangkat','Device'),t('Sumber','Source'),t('Output simulasi','Simulation output')],valid?p.sensor_readings.map(r=>[r.id,r.source,r.value===null?'—':typeof r.value==='object'?JSON.stringify(r.value):String(r.value)]):[[t('Konfigurasi tidak valid','Invalid configuration'),'—','—']]);
  const flow=phase1()?singleStaticFlow(Math.max(15,+$('headway').value||180),c.dwell,c.speed):parallelFlowEstimate(Math.max(15,+$('headway').value||180),c.dwell,c.speed);
  $('trafficInfo').textContent=phase1()?`${t('Satu resource / dua lintasan per trip','One resource / two passes per trip')} · ${t('Kedatangan','Arrivals')}: ${fmt(flow.arrival_per_hour)} trip/h · ${t('Batas ideal model','Planning upper bound')}: ${fmt(flow.ideal_capacity_per_hour)} trip/h · ${t('Utilisasi','Utilization')}: ${fmt(flow.utilization*100)}% · ${t('Layanan bersama per trip','Shared service per trip')}: ${fmt(flow.shared_service_per_trip_s)} s · ${t('Waktu tunggu belum dimodelkan','Waiting time not modelled')}`:
    `${t('Kedatangan','Arrivals')}: ${fmt(flow.arrival_per_hour)} /h · ${t('Kapasitas teoritis','Theoretical capacity')}: ${fmt(flow.ideal_capacity_per_hour)} /h · ${t('Layanan statis / WIM','Static / WIM service')}: ${fmt(flow.static_service_s)} / ${fmt(flow.wim_service_s)} s · ${t('Bukan jaminan bebas antrean','Not a zero-queue guarantee')}`;
  if(flow.requires_slotting)$('trafficInfo').textContent+=' · '+t('KEDATANGAN MELAMPAUI KAPASITAS MODEL: atur slot/antrean.','ARRIVALS EXCEED MODEL CAPACITY: schedule slots/queues.');
  $('trafficInfo').classList.toggle('capacity-warning',flow.requires_slotting);
  const labels=phaseStageNames();
  $('events').replaceChildren(...sim.events.map(e=>{const div=document.createElement('div');div.textContent=e.time_s+' s · '+e.source+' · '+(e.source==='PROCESS'?(labels[e.message]?t(...labels[e.message]):e.message):e.message);return div;}));
  $('apiPayload').textContent=JSON.stringify(p,null,2);
  $('validateAPI').disabled=!ready||control.api.status==='pending';$('downloadJSON').disabled=!ready;$('copyJSON').disabled=!ready;
  const api=control.api;
  $('apiMessage').textContent=api.status==='pending'?t('Validasi API berlangsung untuk trip ini…','Validating this trip…'):api.status==='accepted'?t('API menerima data trip ini. Belum dikirim ke ERP; tidak disimpan permanen.','API accepted this trip. Not sent to ERP; not permanently stored.'):api.status==='error'?api.message:'';
  const construction=+$('constructionPhase').value;$('constructionDescription').textContent=`${construction+1}/11 · ${t(...constructionPhases[construction])}`;
  dirty=false;document.dispatchEvent(new CustomEvent('aimoc:demo-state',{detail:p}));
}
function setMode(next) {mode=next;document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('selected',b.dataset.mode===next));$('constructionControls').hidden=next!=='construction';$('utilityLegend').hidden=next!=='civil';viewer?.setMode(next,+$('constructionPhase').value);dirty=true;}
function updatePhase() {const url=new URL(location.href);url.searchParams.set('phase',phase1()?'1':'2');history.replaceState(null,'',url);setMode('operation');reset();translate();}
function download(blob,name) {const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

for(let i=8;i<=32;i++){const o=document.createElement('option');o.value=i;o.textContent=i+' m³';$('capacity').append(o);}$('capacity').value='32';
$('deploymentPhase').value=new URLSearchParams(location.search).get('phase')==='1'?'phase1_single_static':'phase2_static_wim';
$('deploymentPhase').onchange=updatePhase;
$('hybridLanguage').onchange=e=>{language=e.target.value;localStorage.setItem('aimoc-language',language);translate();};
$('truckProfile').onchange=reset;$('capacity').onchange=()=>{$('tare').value=7500+(+$('capacity').value-8)*650;reset();};
for(const id of ['manual','comparison','fault','autoQR'])$(id).onchange=reset;
for(const id of ['tare','density','speed','dwell','limit','gross','orderTonnes','orderId']){
  $(id).oninput=()=>setConfigError(t('Nilai diubah; terapkan konfigurasi yang valid.','Values changed; apply a valid configuration.'));
  $(id).onchange=reset;
}
$('headway').onchange=()=>{dirty=true;};$('apply').onclick=reset;$('reset').onclick=reset;
$('play').onclick=()=>{if(!control.valid||sim.done||sim.blocked)return;sim.running?sim.running=false:sim.start();dirty=true;render();};
for(const[id,direction]of[['scanIn','entry'],['scanOut','exit']])$(id).onclick=()=>{if(control.valid){sim.scan(direction);dirty=true;render();}};
$('wrongQR').onclick=()=>{if(control.valid){sim.scan(sim.stage.id==='exit_qr'?'exit':'entry',true);dirty=true;render();}};
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>viewer?.setView(b.dataset.view));
$('constructionPhase').oninput=()=>{viewer?.setMode(mode,+$('constructionPhase').value);dirty=true;};$('showCanopy').onchange=()=>viewer?.setMode(mode,+$('constructionPhase').value);
$('dimensionScope').onchange=()=>{renderDimensionSummary();viewer?.setView('top');};
$('snapshot').onclick=()=>{if(viewer){const a=document.createElement('a');a.download=phase1()?'AIMOC-Phase1-Single-Static.png':'AIMOC-Phase2-Static-WIM.png';a.href=viewer.snapshot();a.click();}};
$('downloadJSON').onclick=()=>{const p=getSnapshot();if(p.configuration_valid&&p.complete&&p.weight_valid)download(new Blob([JSON.stringify(p,null,2)],{type:'application/json'}),phase1()?'AIMOC-Phase1-Demo.json':'AIMOC-Phase2-Demo.json');};
$('copyJSON').onclick=async()=>{const p=getSnapshot();if(p.configuration_valid&&p.complete&&p.weight_valid)await navigator.clipboard.writeText(JSON.stringify(p,null,2));};
$('validateAPI').onclick=async()=>{
  const p=getSnapshot();if(!p.configuration_valid||!p.complete||!p.weight_valid)return;
  const request=control.begin(p.trip_id);render();
  const timeout=setTimeout(()=>request.controller.abort(),12000);
  try {
    const response=await fetch(phase1()?'/api/single-static-measurements':'/api/parallel-measurements',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p),signal:request.controller.signal});
    const result=await response.json();if(!response.ok)throw Error(result.error||'API error');
    control.finish(request,'accepted',t('Validasi diterima','Validation accepted'));
  }catch(error){control.finish(request,'error',error.name==='AbortError'?t('Validasi dibatalkan atau melewati batas waktu.','Validation cancelled or timed out.'):error.message);}
  finally{clearTimeout(timeout);dirty=true;render();}
};
$('exportPDF').onclick=async()=>{if(!control.valid)return;try{await exportParallelPDF({language,viewer:phase1()?null:viewer,doubleStatic:false,geometry:G,bom:parallelBOM,payload:phase1()?null:sim.payload(limits())});}catch(error){$('phasePDFNote').textContent='PDF: '+error.message;}};

window.AIMOC_DEMO={getSnapshot};
reset();translate();document.dispatchEvent(new Event('aimoc:demo-ready'));
function frame(now) {const dt=last?Math.min(.1,(now-last)/1000):0;last=now;if(sim?.running&&control.valid&&mode==='operation'){sim.advance(dt*+$('playback').value);dirty=true;}if(dirty&&now-lastRender>120){render();lastRender=now;}if(sim)viewer?.render(control.valid?sim:{...sim,blocked:true,signal:'none',gate_state:{inbound_admission:'red',outbound_admission:'red'}},now);requestAnimationFrame(frame);}requestAnimationFrame(frame);
