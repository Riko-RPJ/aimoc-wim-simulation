export const UI_TEXT = {
  id: {
    app: 'AIMOC Weighbridge', ownerMode: 'Demo Owner', technical: 'Lihat rincian teknis', enter: 'Mode demo Owner',
    phase1: 'Tahap 1 · Satu statis untuk masuk dan keluar', phase2: 'Tahap 2 · Statis masuk dan WIM keluar',
    phase: 'Tahap implementasi', language: 'Bahasa', scenario: 'Kondisi perangkat', apply: 'Terapkan',
    play: 'Jalankan / lanjutkan', reset: 'Ulangi trip', playback: 'Kecepatan animasi',
    synthetic: 'SIMULASI · DATA SINTETIS', scope: 'Sensor dan Oracle NetSuite disimulasikan. API hanya validasi; NetSuite belum tersambung. Riwayat permanen belum tersedia.',
    tare: 'Tare masuk', gross: 'Gross keluar', net: 'Muatan bersih', volume: 'Volume ekuivalen',
    stage: 'Tahap proses', ticket: 'Pratinjau tiket demo', print: 'Cetak tiket demo', downloadPdf: 'Unduh tiket PDF',
    watermark: 'DEMO · BUKAN TIKET TIMBANG RESMI', trip: 'ID trip', order: 'Order NetSuite', plate: 'Nomor polisi',
    time: 'Waktu hasil', density: 'Berat jenis', phaseShort: 'Tahap', status: 'Status', pending: 'Menunggu', valid: 'Valid untuk demo',
    notComplete: 'Trip belum selesai; tiket belum dapat dicetak.', invalidConfig: 'Konfigurasi belum valid.',
    invalidWeight: 'Hasil timbang belum valid.', invalidData: 'Data hasil belum lengkap atau tidak konsisten.',
    noHistory: 'Pratinjau sesi ini; tidak tersimpan sebagai riwayat permanen.',
    api: 'Validasi API', validateApi: 'Validasi API demo', apiChecking: 'Sedang memvalidasi trip ini…', apiPending: 'Belum divalidasi untuk trip ini', apiStale: 'Validasi dari trip lain; validasi ulang diperlukan',
    apiValid: 'Validasi diterima · belum dikirim ke ERP', apiInvalid: 'Validasi belum berhasil',
    noErp: 'ERP belum tersambung', geometry: 'Drag untuk orbit · scroll untuk zoom',
    notLidar: 'Volume = muatan bersih ÷ berat jenis; bukan hasil ukur LiDAR.',
    bridgePending: 'Menyiapkan kontrol demo…', printing: 'Tiket demo siap dicetak',
    entry_qr: 'Scan QR masuk', static_tare: 'Timbang tare statis', tare_static: 'Timbang tare statis',
    loading: 'Pemuatan', exit_qr: 'Scan QR keluar', wim_gross: 'Timbang gross WIM',
    static_gross: 'Timbang gross statis', gross_static: 'Timbang gross statis', complete: 'Trip selesai',
    done: 'Trip selesai', blocked: 'Diblokir', error: 'Perlu pemeriksaan',
  },
  en: {
    app: 'AIMOC Weighbridge', ownerMode: 'Owner demo', technical: 'View technical details', enter: 'Owner demo mode',
    phase1: 'Phase 1 · One static scale for entry and exit', phase2: 'Phase 2 · Static inbound and WIM outbound',
    phase: 'Implementation phase', language: 'Language', scenario: 'Device condition', apply: 'Apply',
    play: 'Run / resume', reset: 'Reset trip', playback: 'Animation speed',
    synthetic: 'SIMULATION · SYNTHETIC DATA', scope: 'Sensors and Oracle NetSuite are simulated. API validation only; NetSuite is not connected. No permanent history is available.',
    tare: 'Inbound tare', gross: 'Outbound gross', net: 'Net cargo', volume: 'Equivalent volume',
    stage: 'Process stage', ticket: 'Demo ticket preview', print: 'Print demo ticket', downloadPdf: 'Download ticket PDF',
    watermark: 'DEMO · NOT AN OFFICIAL WEIGH TICKET', trip: 'Trip ID', order: 'NetSuite order', plate: 'Vehicle plate',
    time: 'Result time', density: 'Density', phaseShort: 'Phase', status: 'Status', pending: 'Pending', valid: 'Valid for demo',
    notComplete: 'The trip is not complete; the ticket cannot be printed yet.', invalidConfig: 'The configuration is not valid.',
    invalidWeight: 'The weight result is not valid yet.', invalidData: 'Result data is incomplete or inconsistent.',
    noHistory: 'Current-session preview; not saved as permanent history.',
    api: 'API validation', validateApi: 'Validate demo API', apiChecking: 'Validating this trip…', apiPending: 'Not validated for this trip', apiStale: 'Validation belongs to another trip; validate again',
    apiValid: 'Validation accepted · not sent to ERP', apiInvalid: 'Validation has not succeeded',
    noErp: 'ERP not connected', geometry: 'Drag to orbit · scroll to zoom',
    notLidar: 'Volume = net cargo ÷ density; it is not a LiDAR volume reading.',
    bridgePending: 'Preparing demo controls…', printing: 'Demo ticket ready to print',
    entry_qr: 'Entry QR scan', static_tare: 'Static tare weighing', tare_static: 'Static tare weighing',
    loading: 'Loading', exit_qr: 'Exit QR scan', wim_gross: 'WIM gross weighing',
    static_gross: 'Static gross weighing', gross_static: 'Static gross weighing', complete: 'Trip complete',
    done: 'Trip complete', blocked: 'Blocked', error: 'Review required',
  },
};

export function localeOf(snapshot = {}) {
  return snapshot.locale === 'en' ? 'en' : 'id';
}
export function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
export function formatNumber(value, locale = 'id', digits = 2) {
  const n = finiteNumber(value);
  return n === null ? '—' : new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'id-ID', {
    maximumFractionDigits: digits, minimumFractionDigits: 0,
  }).format(n);
}
function printableValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '—';
}
export function resultTime(value, locale = 'id') {
  if (typeof value !== 'string' || !value.trim()) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return '—';
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'id-ID', {
    timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short',
  }).format(date) + ' WIB';
}
export function stageLabel(snapshot = {}, locale = localeOf(snapshot)) {
  if(typeof snapshot.stage_label === 'string' && snapshot.stage_label.trim())return snapshot.stage_label.trim();
  if(snapshot.blocked === true)return UI_TEXT[locale].blocked;
  if(snapshot.complete === true)return UI_TEXT[locale].complete;
  const key = String(snapshot.stage || (snapshot.complete ? 'complete' : 'pending'));
  return UI_TEXT[locale][key] || key.replaceAll('_', ' ');
}
export function apiValidationState(snapshot = {}, locale = localeOf(snapshot)) {
  const t = UI_TEXT[locale], v = snapshot.api_validation;
  if (!v || !v.status || ['idle', 'not_validated'].includes(v.status)) return {kind: 'pending', label: t.apiPending};
  if (v.trip_id !== snapshot.trip_id) return {kind: 'pending', label: t.apiStale};
  if(['pending','validating','loading'].includes(v.status))return {kind:'pending',label:t.apiChecking};
  const accepted = ['accepted', 'valid', 'success', 'validated'].includes(v.status);
  return {kind: accepted ? 'valid' : 'invalid', label: accepted ? t.apiValid : t.apiInvalid};
}
export function ticketModel(snapshot = {}) {
  const locale = localeOf(snapshot), t = UI_TEXT[locale], m = snapshot.measurement || {};
  const tare = finiteNumber(m.tare_kg), gross = finiteNumber(m.gross_kg);
  const net = finiteNumber(m.net_cargo_kg), density = finiteNumber(m.density_t_per_m3);
  const volume = finiteNumber(m.volume_equivalent_m3);
  const phase = snapshot.deployment_phase === 'phase1_single_static' ? t.phase1 :
    snapshot.deployment_phase === 'phase2_static_wim' ? t.phase2 : '—';
  const configurationOk = snapshot.configuration_valid === true;
  const numericalOk = tare !== null && tare >= 0 && gross !== null && gross >= tare && net !== null && net >= 0 &&
    density !== null && density > 0 && volume !== null && volume >= 0 &&
    Math.abs(gross - tare - net) < 0.000001 && Math.abs(net / 1000 / density - volume) < 0.000001;
  const complete = snapshot.complete === true, weightOk = snapshot.weight_valid === true;
  const canPrint = complete && weightOk && configurationOk && numericalOk && phase !== '—' && snapshot.blocked !== true;
  let reason = '';
  if (!configurationOk) reason = printableValue(snapshot.configuration_error) !== '—' ? snapshot.configuration_error : t.invalidConfig;
  else if (snapshot.blocked === true) reason = printableValue(snapshot.block_reason) !== '—' ? snapshot.block_reason : t.invalidWeight;
  else if (!complete) reason = t.notComplete;
  else if (!weightOk) reason = t.invalidWeight;
  else if (!numericalOk || phase === '—') reason = t.invalidData;
  // Older saved demo snapshots remain readable; newly generated snapshots use ERP keys.
  const reference = Object.hasOwn(snapshot, 'erp') ? snapshot.erp : snapshot.sap;
  const orderReference = Object.hasOwn(snapshot, 'erp_order') ? snapshot.erp_order : snapshot.sap_order;
  const order = reference?.order?.order_id || orderReference?.order_id;
  const values = {
    trip: printableValue(snapshot.trip_id), order: printableValue(order),
    plate: printableValue(snapshot.vehicle?.plate || reference?.order?.plate),
    time: resultTime(snapshot.measured_at, locale), phase, status: canPrint ? t.valid : reason || t.pending,
    tare: tare === null ? '—' : formatNumber(tare, locale, 2) + ' kg',
    gross: gross === null ? '—' : formatNumber(gross, locale, 2) + ' kg',
    net: net === null ? '—' : formatNumber(net / 1000, locale, 3) + ' t',
    volume: volume === null ? '—' : formatNumber(volume, locale, 3) + ' m³',
    density: density === null ? '—' : formatNumber(density, locale, 3) + ' t/m³',
  };
  return {locale, t, values, canPrint, reason, stage: stageLabel(snapshot, locale),
    api: apiValidationState(snapshot, locale), synthetic: true};
}
