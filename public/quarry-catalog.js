// Public fleet examples, not a charter availability or approved loading database.
const tcp='https://www.transcoalpacific.com/id/fleet/fleet-detail/mother_vessel';
const harbor='https://www.harborstar.com.ph/fleet-list/barges/';
export const bargeCatalog=[
 {id:'tcp-eti-3003',name:'BG. ETI 3003',operator:'Transcoal Pacific',length_ft:300,length_m:null,deadweight_t:7500,source_url:tcp,source_label:'Transcoal Pacific - daftar armada',verified_on:'2026-11-02',approved_cargo_limit_t:null},
 {id:'tcp-lancar-1',name:'BG. LANCAR 1',operator:'Transcoal Pacific',length_ft:300,length_m:null,deadweight_t:8250,source_url:tcp,source_label:'Transcoal Pacific - daftar armada',verified_on:'2026-11-02',approved_cargo_limit_t:null},
 {id:'tcp-eti-3301',name:'BG. ETI 3301',operator:'Transcoal Pacific',length_ft:330,length_m:null,deadweight_t:10000,source_url:tcp,source_label:'Transcoal Pacific - daftar armada',verified_on:'2026-11-02',approved_cargo_limit_t:null},
 {id:'tcp-eti-3601',name:'BG. ETI 3601',operator:'Transcoal Pacific',length_ft:365,length_m:null,deadweight_t:13000,source_url:tcp,source_label:'Transcoal Pacific - daftar armada',verified_on:'2026-11-02',approved_cargo_limit_t:null},
 {id:'hs-corvus',name:'BARGE CORVUS',operator:'Harbor Star (contoh regional)',length_ft:null,length_m:64,deadweight_t:2500,source_url:harbor,source_label:'Harbor Star - published fleet',verified_on:'2026-11-02',approved_cargo_limit_t:null},
 {id:'hs-centaurus',name:'BARGE CENTAURUS',operator:'Harbor Star (contoh regional)',length_ft:null,length_m:67.36,deadweight_t:3500,source_url:harbor,source_label:'Harbor Star - published fleet',verified_on:'2026-11-02',approved_cargo_limit_t:null},
 {id:'hs-auriga',name:'BARGE AURIGA',operator:'Harbor Star (contoh regional)',length_ft:null,length_m:85.34,deadweight_t:6000,source_url:harbor,source_label:'Harbor Star - published fleet',verified_on:'2026-11-02',approved_cargo_limit_t:null},
];
export const catalogNotice={
 id:'Contoh armada publik per 2 November 2026, bukan konfirmasi ketersediaan charter atau kesesuaian batu split. DWT/ukuran tidak sama dengan batas kargo yang disetujui. Isi batas muatan, draft, trim, stabilitas, rencana distribusi, pasang-surut dan persetujuan operator/nakhoda untuk setiap voyage. Angka batas muatan dalam demo adalah asumsi sintetis.',
 en:'Public fleet examples checked on 2 November 2026, not confirmation of charter availability or aggregate suitability. DWT/size is not the approved cargo limit. Confirm voyage cargo limits, draft, trim, stability, distribution, tide and master/operator approval. Demo cargo limits are synthetic planning assumptions.',
};
export const quarrySources=[
 {id:'tcp',title:'Transcoal Pacific - fleet list',url:tcp,scope:'Published vessel names, nominal feet size and DWT; no voyage cargo approval.'},
 {id:'harbor',title:'Harbor Star - barges',url:harbor,scope:'Regional examples of published length and DWT; no confirmed aggregate charter suitability.'},
 {id:'oiml',title:'OIML R 134 - weighing road vehicles in motion',url:'https://www.oiml.org/en/publications/recommendations/134/',scope:'Metrological scope and test framework; this demo does not certify a WIM installation.'},
 {id:'belt',title:'Siemens - belt weighing',url:'https://www.siemens.com/en-us/products/sitrans/belt-weighing/',scope:'Continuous bulk flow/production totalizing; calibration and appropriate installation required.'},
 {id:'belt-test',title:'Siemens SIWAREX WP341 - material-test calibration',url:'https://cache.industry.siemens.com/dl/files/625/109824625/att_1155315/v2/FAQS_WP341_WebServer_Calibration_En.pdf',scope:'Material tests compare belt totals with a known pre/post-weighed material quantity.'},
 {id:'stock',title:'Virtual Surveyor - stockpile measurement',url:'https://support.virtual-surveyor.com/support/solutions/articles/1000271748-stockpile',scope:'Survey volume depends on reference surface; tonnage requires assigned material density.'},
 {id:'marine',title:'IMO - BLU Code and BLU Manual',url:'https://www.imo.org/en/ourwork/safety/pages/blu-code-and-blu-manual.aspx',scope:'Ship/terminal loading guidance for applicable bulk carriers; vessel/port-specific approval is separate from the truck manifest.'},
 {id:'netsuite-transfer',title:'Oracle NetSuite - inventory transfer orders',url:'https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N2308766.html',scope:'Candidate own-stockpile workflow with in-transit fulfillment and receipt; account features and mappings require UAT.'},
 {id:'netsuite-fulfillment',title:'Oracle NetSuite - item fulfillment',url:'https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_161425629582.html',scope:'Candidate customer shipment workflow; invoicing depends on Advanced Shipping/account configuration.'},
 {id:'netsuite-wip',title:'Oracle NetSuite - manufacturing WIP',url:'https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/chapter_N2335392.html',scope:'Candidate finished-product completion workflow when the relevant manufacturing features/items are configured; not an automatic receipt from truck dispatch.'},
];
