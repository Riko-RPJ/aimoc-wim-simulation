import {ticketModel} from './ticket-model.js';

// All values and acceptance rules come from the same model as the on-screen ticket.
// jsPDF is supplied by the existing bundled UMD script; this module adds no dependency.
const cleanText=value=>String(value).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/[\u2010-\u2015\u2212]/g,'-').replace(/\u00a0|\u202f/g,' ');
export function ticketPdfFilename(snapshot={}) {
  const trip=String(snapshot.trip_id || 'trip').replace(/[^A-Za-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,96) || 'trip';
  return `AIMOC-Demo-${snapshot.deployment_phase==='phase1_single_static'?'Phase1':'Phase2'}-${trip}.pdf`;
}
function fileId(text) {
  return [0x811c9dc5,0x5bd1e995,0x27d4eb2f,0x165667b1].map(seed=>{
    let hash=seed;for(const character of text){hash^=character.charCodeAt(0);hash=Math.imul(hash,0x01000193);}
    return (hash>>>0).toString(16).padStart(8,'0');
  }).join('');
}
export function createTicketPDF(snapshot, JsPDFConstructor) {
  const model=ticketModel(snapshot);
  if(!model.canPrint)throw new Error(model.reason || 'Ticket is not valid for export');
  if(typeof JsPDFConstructor!=='function')throw new Error(model.locale==='en'?'The PDF library is unavailable.':'Pustaka PDF belum tersedia.');
  const doc=new JsPDFConstructor({orientation:'portrait',unit:'mm',format:'a4',compress:true});
  const {t,values,locale}=model;
  doc.setProperties({title:`${t.app} - ${locale==='en'?'Demo weigh ticket':'Tiket timbang demo'}`,subject:t.watermark,author:'AIMOC',creator:'AIMOC demo'});
  // Stable metadata makes repeated exports of the same result reproducible.
  const measuredDate=new Date(snapshot.measured_at);
  doc.setCreationDate(Number.isFinite(measuredDate.valueOf())?measuredDate:new Date('2000-01-01T00:00:00.000Z'));
  doc.setFileId(fileId(JSON.stringify({locale,values})));
  const pageWidth=doc.internal.pageSize.getWidth(),pageHeight=doc.internal.pageSize.getHeight();
  const left=18,width=pageWidth-36,labelWidth=52,padding=3,lineHeight=4.8,bottom=pageHeight-25;
  let y;
  function text(lines,x,baseline,size=10.5,weight='normal') {
    doc.setFont('helvetica',weight);doc.setFontSize(size);doc.setTextColor(0,0,0);
    doc.text(lines,x,baseline,{lineHeightFactor:1.28});
  }
  function wrapped(value,maxWidth,size=10.5,weight='normal') {
    doc.setFont('helvetica',weight);doc.setFontSize(size);
    return doc.splitTextToSize(cleanText(value),maxWidth);
  }
  function pageHeader(addPage=false) {
    if(addPage)doc.addPage('a4','portrait');
    doc.setFillColor(255,255,255);doc.rect(0,0,pageWidth,pageHeight,'F');
    text(t.app,left,25,20,'bold');
    text(locale==='en'?'DEMO WEIGH TICKET':'TIKET TIMBANG DEMO',left,32,10,'bold');
    const badgeLines=wrapped(t.watermark,width-8,12,'bold');
    const badgeHeight=Math.max(13,badgeLines.length*5.5+6);
    doc.setDrawColor(0,0,0);doc.setLineWidth(.5);doc.rect(left,37,width,badgeHeight);
    text(badgeLines,left+4,43,12,'bold');
    y=37+badgeHeight+7;
  }
  function row(label,value) {
    const labelLines=wrapped(label,labelWidth-padding*2,10,'bold');
    const valueLines=wrapped(value,width-labelWidth-padding*2);
    const lineCount=Math.max(labelLines.length,valueLines.length);
    let offset=0;
    while(offset<lineCount) {
      let capacity=Math.floor((bottom-y-padding*2)/lineHeight);
      if(capacity<1){pageHeader(true);capacity=Math.floor((bottom-y-padding*2)/lineHeight);}
      const count=Math.min(capacity,lineCount-offset),height=padding*2+count*lineHeight;
      doc.setDrawColor(95,95,95);doc.setLineWidth(.2);
      doc.rect(left,y,labelWidth,height);doc.rect(left+labelWidth,y,width-labelWidth,height);
      const labelChunk=labelLines.slice(offset,offset+count),valueChunk=valueLines.slice(offset,offset+count);
      if(labelChunk.length)text(labelChunk,left+padding,y+padding+3.2,10,'bold');
      if(valueChunk.length)text(valueChunk,left+labelWidth+padding,y+padding+3.2);
      y+=height;offset+=count;
      if(offset<lineCount)pageHeader(true);
    }
  }
  function paragraph(value) {
    const lines=wrapped(value,width,9);
    for(const line of lines){if(y+5>bottom)pageHeader(true);text(line,left,y+3.2,9);y+=4.5;}
    y+=2;
  }
  pageHeader();
  for(const key of ['trip','order','plate','time','phase','status','tare','gross','net','volume','density'])row(t[key==='phase'?'phaseShort':key],values[key]);
  y+=7;paragraph(t.scope);paragraph(t.notLidar);
  const pages=doc.getNumberOfPages();
  for(let page=1;page<=pages;page++){doc.setPage(page);text(`${page} / ${pages}`,pageWidth/2-4,pageHeight-12,9);}
  doc.setPage(1);
  return doc;
}
