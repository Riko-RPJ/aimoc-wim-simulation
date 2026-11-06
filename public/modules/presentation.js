import {ticketModel, UI_TEXT, localeOf, stageLabel} from './ticket-model.js';
import {createTicketPDF, ticketPdfFilename} from './ticket-pdf.js';

const byId = id => document.getElementById(id);
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(id, className, action) {
  const node = element('button', className); node.id = id; node.type = 'button';
  node.addEventListener('click', action); return node;
}
function setText(node, text) { if (node && node.textContent !== String(text)) node.textContent = text; }
function syncSelect(source, target) {
  if (!source || !target) return;
  const items = Array.from(source.options).map(o => ({value: o.value, text: o.textContent}));
  const signature = JSON.stringify(items);
  if (target.dataset.optionSignature !== signature) {
    target.replaceChildren(...items.map(item => {const option = element('option', '', item.text); option.value = item.value; return option;}));
    target.dataset.optionSignature = signature;
  }
  target.value = source.value;
}
function changeControl(id, value) {
  const control = byId(id);
  if (!control) return;
  control.value = value;
  control.dispatchEvent(new Event('change', {bubbles: true}));
}
function clickControl(id) {
  const control = byId(id);
  if (control && !control.disabled) control.click();
}

export function mountPresentation() {
  if (byId('aimoc-owner-presentation')) return;
  const viewport = byId('hybridViewport') || byId('viewport');
  if (!viewport) return;
  viewport.classList.add('aimoc-owner-viewport');
  let current = {}, savedScroll = 0, active = false, lastRenderKey = '';
  let faultDraft = null, faultSourceValue = null;
  const labels = new Map(), values = new Map(), ticketValues = new Map();
  const label = key => {const node = element('span'); labels.set(node, key); return node;};
  const select = (id, labelKey, change) => {
    const wrapper = element('label', 'owner-control');
    const node = element('select'); node.id = id;
    wrapper.append(label(labelKey), node); node.addEventListener('change', () => change(node.value));
    return {wrapper, node};
  };
  const launcher = element('div', 'aimoc-demo-launcher'); launcher.id = 'aimoc-demo-launcher';
  const launch = button('aimoc-owner-launch', 'owner-primary', () => enter());
  launcher.append(launch); document.body.insertBefore(launcher, document.body.firstChild);

  const panel = element('section', 'owner-presentation'); panel.id = 'aimoc-owner-presentation';
  panel.setAttribute('aria-label', 'AIMOC Owner demonstration');
  const header = element('header', 'owner-header');
  const brand = element('div', 'owner-brand');
  const existingLogo = document.querySelector('header img');
  if (existingLogo) {const logo = existingLogo.cloneNode(true); logo.className = 'owner-brand-logo'; brand.append(logo);}
  const brandText = element('div');
  const title = element('strong', 'owner-title'); labels.set(title, 'app');
  const subtitle = element('span', 'owner-subtitle'); labels.set(subtitle, 'ownerMode');
  brandText.append(title, subtitle); brand.append(brandText);
  const synthetic = element('span', 'owner-synthetic'); labels.set(synthetic, 'synthetic');
  const technical = button('owner-technical-toggle', 'owner-secondary', () => exit()); labels.set(technical, 'technical');
  const language = select('owner-language', 'language', value => changeControl('hybridLanguage', value));
  for (const [value, text] of [['id', 'IND'], ['en', 'EN']]) {const o=element('option', '', text);o.value=value;language.node.append(o);}
  header.append(brand, synthetic, language.wrapper, technical);
  const toolbar = element('div', 'owner-toolbar');
  const phase = select('owner-phase', 'phase', value => changeControl('deploymentPhase', value));
  for (const value of ['phase1_single_static','phase2_static_wim']) {const o=element('option');o.value=value;phase.node.append(o);}
  const play = button('owner-play', 'owner-primary', () => clickControl('play'));
  const reset = button('owner-reset', 'owner-secondary', () => clickControl('reset'));labels.set(reset,'reset');
  const playback = select('owner-playback', 'playback', value => changeControl('playback', value));
  toolbar.append(phase.wrapper, play, reset, playback.wrapper);
  const stageFooter = element('div', 'owner-stage-footer');
  const stageTitle = element('span', 'owner-muted'); labels.set(stageTitle, 'stage');
  const stageValue = element('strong'); values.set('stage', stageValue);
  const orbitHelp = element('span', 'owner-muted'); labels.set(orbitHelp, 'geometry');
  stageFooter.append(stageTitle, stageValue, orbitHelp);

  const aside = element('aside', 'owner-aside'); aside.id = 'owner-aside';
  const condition = element('div', 'owner-scenario-row');
  const fault = select('owner-fault', 'scenario', value => {faultDraft=value;});
  const apply = button('owner-apply', 'owner-secondary', () => {const value=faultDraft ?? fault.node.value;faultDraft=null;changeControl('fault', value);});labels.set(apply,'apply');
  condition.append(fault.wrapper, apply);
  const kpis = element('div', 'owner-kpis');
  for (const key of ['tare','gross','net','volume']) {
    const card = element('div', 'owner-kpi'); const name=element('span');labels.set(name,key);
    const value=element('strong');values.set(key,value);card.append(name,value);kpis.append(card);
  }
  const ticket = element('section', 'owner-ticket'); ticket.id = 'owner-ticket-preview';
  const ticketHeader=element('div','owner-ticket-heading'); const ticketTitle=element('h2');labels.set(ticketTitle,'ticket');
  const print=button('owner-print-ticket','owner-secondary',()=>printTicket());labels.set(print,'print');
  const downloadPdf=button('owner-download-ticket-pdf','owner-secondary',()=>downloadTicketPDF());labels.set(downloadPdf,'downloadPdf');
  const ticketActions=element('div','owner-ticket-actions');ticketActions.append(print,downloadPdf);
  ticketHeader.append(ticketTitle,ticketActions);
  const watermark=element('div','owner-ticket-watermark');labels.set(watermark,'watermark');
  const ticketFields=element('dl','owner-ticket-fields');
  for(const key of ['trip','order','plate','time','phase','status']) {
    const row=element('div', key==='phase'||key==='status'?'owner-field-wide':'');
    const term=element('dt');labels.set(term,key==='phase'?'phaseShort':key);
    const value=element('dd');ticketValues.set(key,value);row.append(term,value);ticketFields.append(row);
  }
  const reason=element('p','owner-ticket-reason');reason.id='owner-ticket-reason';reason.setAttribute('role','status');
  print.setAttribute('aria-describedby','owner-ticket-reason');
  downloadPdf.setAttribute('aria-describedby','owner-ticket-reason');
  const history=element('p','owner-muted owner-history');labels.set(history,'noHistory');
  ticket.append(ticketHeader,watermark,ticketFields,reason,history);
  const integration=element('div','owner-integration');
  const apiLabel=element('span');labels.set(apiLabel,'api');const apiValue=element('strong');values.set('api',apiValue);
  const erp=element('span','owner-erp-status');labels.set(erp,'noErp');
  const validate=button('owner-validate-api','owner-secondary',()=>{const snapshot=getSnapshot();render(snapshot);if(ticketModel(snapshot).canPrint)clickControl('validateAPI');});labels.set(validate,'validateApi');
  integration.append(apiLabel,apiValue,erp,validate);
  const scope=element('p','owner-scope');labels.set(scope,'scope');
  const volumeHelp=element('p','owner-volume-help');labels.set(volumeHelp,'notLidar');
  aside.append(condition,kpis,ticket,integration,volumeHelp,scope);
  panel.append(header,toolbar,aside,stageFooter);document.body.append(panel);
  const printRoot=element('section','owner-print-root');printRoot.id='aimoc-demo-print-root';document.body.append(printRoot);

  function getSnapshot() {
    try {return window.AIMOC_DEMO?.getSnapshot?.() || current;} catch {return current;}
  }
  function render(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return;
    current=snapshot;
    const m=snapshot.measurement || {}, validation=snapshot.api_validation || {};
    const key=JSON.stringify([active,snapshot.locale,snapshot.deployment_phase,snapshot.trip_id,snapshot.stage,
      snapshot.complete,snapshot.weight_valid,snapshot.configuration_valid,snapshot.configuration_error,snapshot.blocked,snapshot.block_reason,snapshot.stage_label,
      m.tare_kg,m.gross_kg,m.net_cargo_kg,m.volume_equivalent_m3,m.density_t_per_m3,
      snapshot.erp?.order?.order_id,snapshot.vehicle?.plate,String(snapshot.measured_at || '').slice(0,16),
      validation.status,validation.trip_id,byId('play')?.textContent,byId('fault')?.value,byId('playback')?.value]);
    if(key===lastRenderKey)return;
    lastRenderKey=key;
    const model=ticketModel(snapshot), t=model.t;
    for(const [node,key] of labels)setText(node,t[key] || key);
    setText(launch,t.enter);launch.setAttribute('aria-pressed',String(active));
    language.node.value=model.locale;
    const phases=phase.node.options;
    setText(phases[0],t.phase1);setText(phases[1],t.phase2);
    phase.node.value=snapshot.deployment_phase || '';
    phase.node.disabled=!byId('deploymentPhase');
    setText(play,byId('play')?.textContent?.trim() || t.play);
    play.disabled=!!byId('play')?.disabled || !snapshot.deployment_phase;
    syncSelect(byId('playback'),playback.node);
    const sourceFault=byId('fault');
    if(sourceFault && sourceFault.value!==faultSourceValue){faultSourceValue=sourceFault.value;faultDraft=null;}
    syncSelect(sourceFault,fault.node);
    if(faultDraft!==null && Array.from(fault.node.options).some(option=>option.value===faultDraft))fault.node.value=faultDraft;
    for(const key of ['tare','gross','net','volume'])setText(values.get(key),model.values[key]);
    for(const [key,node] of ticketValues)setText(node,model.values[key]);
    setText(values.get('stage'),snapshot.complete || snapshot.blocked ? stageLabel(snapshot,model.locale) : snapshot.stage_label || byId('stageBadge')?.textContent?.trim() || stageLabel(snapshot,model.locale));
    setText(values.get('api'),model.api.label);integration.dataset.validation=model.api.kind;
    print.disabled=!model.canPrint;downloadPdf.disabled=!model.canPrint;validate.disabled=!model.canPrint||!!byId('validateAPI')?.disabled||snapshot.api_validation?.status==='pending';setText(reason,model.reason);
    reason.hidden=!model.reason;
    ticket.dataset.valid=String(model.canPrint);
  }
  function enter() {
    // Resume the operational scene after visiting Civil/Construction in engineering view.
    document.querySelector('[data-mode="operation"]')?.click();
    savedScroll=window.scrollY;active=true;
    document.body.classList.add('presentation');panel.setAttribute('aria-hidden','false');
    window.scrollTo(0,0);render(getSnapshot());
    requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
    technical.focus({preventScroll:true});
  }
  function exit() {
    active=false;document.body.classList.remove('presentation');panel.setAttribute('aria-hidden','true');
    window.scrollTo(0,savedScroll);render(getSnapshot());
    requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
    launch.focus({preventScroll:true});
  }
  function populatePrint(snapshot) {
    const model=ticketModel(snapshot); if(!model.canPrint)return false;
    const t=model.t;printRoot.replaceChildren();
    const heading=element('h1','',t.app), badge=element('p','owner-print-watermark',t.watermark);
    const table=element('table','owner-print-table');
    for(const key of ['trip','order','plate','time','phase','status','tare','gross','net','volume','density']) {
      const row=element('tr'), term=element('th','',t[key==='phase'?'phaseShort':key]), value=element('td','',model.values[key]);
      row.append(term,value);table.append(row);
    }
    printRoot.append(heading,badge,table,element('p','',t.scope),element('p','',t.notLidar));
    printRoot.lang=model.locale;return true;
  }
  function downloadTicketPDF() {
    const snapshot=getSnapshot();render(snapshot);
    if(!ticketModel(snapshot).canPrint)return;
    try {createTicketPDF(snapshot,window.jspdf?.jsPDF).save(ticketPdfFilename(snapshot));}
    catch(error){setText(reason,error.message);reason.hidden=false;}
  }
  function printTicket() {
    const snapshot=getSnapshot();render(snapshot);
    if(!populatePrint(snapshot))return;
    document.body.classList.add('owner-ticket-printing');
    try {window.print();} catch (error) {document.body.classList.remove('owner-ticket-printing');throw error;}
  }
  document.addEventListener('aimoc:demo-state',event=>render(event.detail || getSnapshot()));
  document.addEventListener('aimoc:demo-ready',()=>render(getSnapshot()));
  // Owner-mode print shortcuts share the fresh-state guard; engineering printing is preserved.
  window.addEventListener('beforeprint',()=>{
    if(!active&&!document.body.classList.contains('owner-ticket-printing'))return;
    document.body.classList.add('owner-ticket-printing');
    if(!populatePrint(getSnapshot()))printRoot.replaceChildren(element('p','',ticketModel(getSnapshot()).reason));
  });
  panel.setAttribute('aria-hidden','true');render(getSnapshot());
  // Owner mode is opt-in, preserving the existing engineering workflow and branding.
  window.AIMOC_PRESENTATION={enter,exit,refresh:()=>render(getSnapshot())};
  window.addEventListener('afterprint',()=>{document.body.classList.remove('owner-ticket-printing');requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));});
  if(new URLSearchParams(window.location.search).get('present')==='1')enter();
}

if(typeof document!=='undefined') {
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountPresentation,{once:true});
  else mountPresentation();
}
