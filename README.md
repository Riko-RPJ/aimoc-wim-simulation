# AIMOC WIM Simulation

Source repository: https://github.com/Riko-RPJ/aimoc-wim-simulation

Current public source includes the bilingual weighing demo, Phase 1 shared static scale, Phase 2 Static + WIM, quarry traffic/logistics planning, ticket/PDF outputs and synthetic ERP API validation. Use Node.js 22; no external npm dependencies are required. Run `npm start`, `npm test`, or `npm run build`. Server configuration is documented in [CONFIGURATION.md](CONFIGURATION.md). All `.env*` files and private/local runtime configuration are excluded from this repository.

## Oracle NetSuite alignment — 4 November 2026

Production release `netsuite-alignment-2026-11-04-r3` consistently names Oracle NetSuite across QR/order UI, all weighing options, bilingual process/status copy, API documentation, JSON exports, tickets and engineering PDFs. New payloads use `erp`, `erp_qr`, `erp_order` and `erp_system: "oracle_netsuite"`. Legacy order/QR input aliases remain accepted server-side with conflict rejection; responses use canonical ERP fields. Demo orders use `NS-SO-DEMO...`. The demo still does not connect to NetSuite or persist records.

Validation: 174 tests, 15 live HTTP checks and 62 public asset checks passed. Two older Hybrid R02 download PDFs were regenerated and visually checked. Deployment `dpl_H5Sq4CPSGEBsEEpDfMvWjMFsi5tN`; evidence in the chat workspace at `work/netsuite-alignment-2026-11-04`.

## Quarry capacity comparison fix — 4 November 2026

Production release `quarry-capacity-2026-11-04-r2` fixes first-entry Recommended → Custom lane copying. Edited custom drafts remain within the page session; **Copy model sizing** explicitly recalculates and replaces the draft from current assumptions. Custom inputs now have visible directional/device labels, actual form association, Enter submission and an adjacent calculate button. The table shows offered utilization and observed P95 by direction, limiting direction, started sample and excluded waiting counts. Core traffic math is unchanged: the headline utilization is the largest directional workload, and the pooled finite-window P95 can legitimately remain unchanged or increase when the started cohort changes. Median service-time assumptions and formulas are explained in both languages.

Validation: 163 Node regression tests passed; local and production browser verification; 11 public asset hashes matched; legacy frontend assets unchanged. Deployment `dpl_7cwqPSQY5vViwM1T3PKQPUSFxm1r`, evidence in `work/quarry-capacity-fix-2026-11-04` under the chat workspace. This remains a synthetic planning demo.

Production: https://aimoc-wim-simulation.vercel.app
Vercel team/project: decom/aimoc-wim-simulation

Bilingual IND/EN interface; 8–32 m³ beds; 2 opposing lanes; sensor telemetry and ERP API.
Construction dimensions are conceptual and do not verify load capacity, coastal flood level or structural safety. Full details are in the UI design notes and dimension table. Largest example vehicle: 32 m³, 23.1 t tare, 48 t cargo at 1.5 t/m³, 71.1 t gross, 5 axles. Legal truck loads and OEM wheel paths must be verified independently.

Pad: 100 × 11.5 m, lanes 4.5 m, median 0.5 m, shoulders 1 m each. Approach/sensor/exit: 35/30/35 m. External ramps: 18 m each at 5%, total 136 m. Nominal pad elevation +0.90 m; subbase/base/concrete/asphalt 150/300/400/50 mm; sensor zone concrete 450 mm, flush without asphalt. Canopy 40 × 15 m; clearance 7 m, eave 7.5 m, ridge 8.25 m; columns X ±6.8 m at 10 m spacing. Gantry minimum-device clearance 6.5 m. Sensor block/cavity dimensions remain illustrative/OEM-dependent.

`npm run start` local server on 8766. `npm test` validates weights/API adapter. `npm run build` copies frontend to dist. Vercel Node functions are in api/. Configure Vercel project Environment Variables and redeploy for ERP forwarding.

ERP URL, credentials, field mapping and CORS remain configurable, see [CONFIGURATION.md](CONFIGURATION.md) and /api-docs.html. API data is synthetic only, public and not intended as a production authenticated telemetry ingestion service. No permanent database, retry queue or history endpoint. Idempotency key is forwarded; ERP receiver must deduplicate. HTTP 2xx is not business ACK. Volume is tonnes / assumed density, not LiDAR measurement.

Production validation: browser trips 8,12,20,24,32 m³; API outputs 12,18,30,36,48 t and matching m³; language switching preserves trip IDs; fault scenarios do not finalize cargo; model controls and mobile layout pass. Native Vercel deployment READY; unauthenticated /api/health HTTP 200.

## Revision R05 — 2026-10-12
2 × 2 m quartz strips per row, two rows per lane, 8 strips total. Gap 50 mm; sensor body 52 × 58 mm; end-to-lane-edge 225 mm; shoulder 1 m; end-to-pad-edge 1.225 m; clearance between lane sensor ends 0.950 m. Coverage assumes 3.20 m envelope, ±0.25 m offset and 50 mm end allowance (not OEM active-end data). Actual tyre patches and OEM approval remain required. Shared groove example per row 4,150 × 80 × 100 mm is conceptual. R05 changes the illustrative 32 m³ truck to a 3-axle Mining King profile; tare remains synthetic.

PDF export: 6 A3 landscape sheets, IND/EN/simplified Chinese. Official Decom logo from company website. Local CJK font subset (Noto Sans CJK) and pinned jsPDF 3.0.4; no external font/CDN required at runtime. PDFs are raster drawing sheets (~1.8 MB), not CAD files. Confidential marking is not access control; the simulation website remains public.

Product references and precise geometry live in public/design-data.js. Noto fonts licensed under SIL OFL; jsPDF is MIT. Export design files do not include Vercel credentials.

R06 layout correction: separate notes from side/front drawings; rotated vertical dimension labels; masked dimension text and extension-line ordering; dedicated preview close-button toolbar. Geometry and sensor dimensions remain unchanged. All six sheets checked in IND/EN/Chinese.

R08: low-speed configuration, one controller/cabinet per lane (2 total); 4 quartz channels each; one infrared Tx/Rx separator pair per lane (4 posts), at distance -8 m along travel direction. No inductive loops. Separate controller buffer counts and acquisition events are exposed in simulator JSON. Epoxy resin shown around sensor grooves and listed as an installation material, quantity/cure per OEM. Simulated speed 1–15 km/h, default 6 km/h; commissioning range needs OEM confirmation. Browser verified 8/16/24/32 m3, both controller streams, IR separation, coverage block, offline buffer isolation/recovery, three PDF languages and mobile layout.

Implementation viewers (v5.1): two separate interactive Three.js models for civil/utilities and 11-stage construction. Shared footprint: pad 100 × 11.5 m, total with ramps 136 m, lanes 4.5 m, top +0.90 m. Additional excavation, foundations, rod and duct dimensions are conceptual assumptions, not engineered specifications. Power/cable sizing, reinforcement, grounding acceptance and RF coverage require engineer/OEM/site approval. Utility route tubes are visually enlarged. Existing R08 sensor PDF remains the sensor-layout document; new viewers export their selected annotated camera view as PNG. Lazy initialization and offscreen rendering pause preserve browser resources.


## v5.2 — LiDAR / ODOL screening
Animated LiDAR fans in the operating model; independent bilingual per-pass ODOL table, front/side contour diagrams and utilization bars. Editable example dimension limits; gross limit follows the main simulation. OD derives from LiDAR dimensions and OL from WIM gross, never net cargo. Missing/current-lane readings and faulted weight remain unknown. Supplemental `odol_screening` is included in simulator JSON; it does not replace the existing ERP decision or constitute legal compliance. Synthetic contour points are illustrative. Validated with 8 Node tests and desktop/mobile browser scenarios (normal, OD, ODOL, fault, reset and EN).


## v5.3 — Manual gross / over-capacity loads
Manual gross mode and 0–200% fill, illustrative triangular ridge pile in Three.js and LiDAR front/side views. Equivalent volume, bed capacity and excess are shown separately from OD/OL. Demo uses 32 m3 bed, 23.1 t tare, 90 t gross, 80 t gross limit and density 1.5 t/m3: 44.6 m3, 12.6 m3 excess, synthetic loaded height 4.7175 m vs 4.2 m limit. Unknown/faulted measurements do not produce valid equivalent volume. Inputs and formulas are synthetic; assumed shape is not inferred from real LiDAR. API read payload includes load_simulation and volume_assessment.


## v6.0 — NetSuite / QR flow and hybrid scenario
- Main page: QR entry/exit gates replace RFID readers in the operating model. Both scans use the same synthetic order/trip token. Automatic scan demo or manual scan holds are available. Same / +1% / +15% examples drive a synthetic load only when explicitly applied. Comparisons remain numerical; no commercial match decision is assigned. Default demo truck is 32 m3 with 23.1 t tare.
- `/hybrid.html`: static inbound (+X to -X at Z=-65 m) and WIM outbound (+Z to -Z at X=0). Static deck 20 x 4.5 m and example 120 t capacity; stable digital indicator -> IoT gateway -> AIMOC. One outbound WIM controller, four 2 m quartz rods, one IR Tx/Rx pair, one LiDAR, two fixed CCTV and two QR readers. No outbound ANPR/PTZ/RFID.
- Intersection: 46 x 46 m conceptual apron, alternating traffic signals and conceptual vehicle-zone detection. Single-truck animation is not a queue model. Arrival/service estimates expose assumptions and do not guarantee queue-free operation. OEM swept-path and traffic study are required.
- Includes separate operating / civil-utility / 11-stage construction views; view controls; coordinate/dimension tables; hardware comparison and BOM; QR order lifecycle; gross/net/volume, excess volume and LiDAR/ODOL profiles; event log; JSON export; confidential three-page PDF with DECOM logo.
- `POST /api/measurements` retains QR order metadata when identity_method=QR, erp_order and qr_trip are supplied. Legacy RFID contract remains compatible. The server recomputes numerical differences.
- `GET/POST /api/hybrid-measurements`: validate-only synthetic contract v2. Rejects incomplete or invalid weights and mismatched order/trip scans; recomputes measurements, order differences and volume. Does not forward to NetSuite or store records. Real NetSuite order issuance, authenticated QR redemption, persistent single-use enforcement, device protocols, durable queues/idempotency and business ACKs require production middleware.
- Static/WIM fault scenarios do not fabricate transaction weights. Cloud-offline hybrid mode keeps a synthetic local record; actual persistent edge storage is not implemented in the browser demo.
- QR does not replace vehicle separation. IR remains on WIM; traffic conflict detection is separately required. Cost savings depend on full static/WIM quotations; trade use requires applicable metrology approvals.
- Validation: 17 Node tests; browser checks for both page flows, same-trip scans, wrong QR, order comparison, manual weight/ODOL, sensor fault, bilingual/mobile layout, views, API validation and PDF export. Existing first-page reports remain WIM-only; the hybrid page has its own report.


## v6.1 — R02 raised pitless on reclaimed ground
Hybrid static scale is raised 1.20 m above yard +0.90 m: deck top +2.10 m, deck depth 0.45 m, raft top +1.10 m / bottom +0.75 m, 0.35 m raft, nominal 0.15 m below-yard preparation. Support stack is 0.25 m pedestal/grout + 0.30 m illustrative mount. Eight support points are visual assumptions, not selected cell ratings. Both ramps are 24 m at 5%, with 3 m level landings; footprint 74 m. Center moves to X=80 m; entry QR X=136 m, ramps X=43..117 m; intersection remains X=0 / Z=-65 m, with stop line X=28 m. Static-only local surface elevation and truck pitch follow the ramp; WIM datum/measurement stays unchanged. Traffic service estimate includes pitless traverse time at <=5 km/h.
Adds static close-up camera, dimensioned longitudinal/support drawings, shallow/raised MEP routes without assumed deep earth rods, geotechnical decision/hold points, flood/settlement/corrosion notes and six technical references. OEM source is cited as technical literature, not a product catalogue. SNI identity/scope from official catalogue; licensed text not reviewed in full. Shallow foundations are conditional on site bearing/settlement acceptance; a pitless deck does not solve reclamation consolidation. Datum/levels are not proven flood-safe elevations.
PDF R02 is eight A3 pages in IND/EN with logo, confidentiality label, updated site plan, detailed support/ramp dimensions, construction/QA, responsibilities and clickable official references. Twenty Node tests and desktop/mobile browser regression cover geometry, ramp continuity, stable tare, original QR/API flow and both PDF languages.


## v6.2 — Option 03: parallel static inbound / WIM outbound
New /parallel.html with independent bilingual 3D operating, civil/utilities and construction views. Static lane X=-6.25 m travels +Z; WIM X=+6.25 m travels -Z. Lane centres 12.5 m, live-edge gap 8 m, static-raft to WIM-pad separation 5.5 m. Working corridor 22 x 170 m excludes loading loop/setbacks. Middle allocation: 1.5 m static service + 0.5 m independent barrier + 1 m utilities + 1.5 m WIM service + 1 m canopy-support band. These are coordination assumptions, not verified soil-stress isolation or swept-path dimensions.
Pitless static: 20 x 4.5 m at +2.1 m, rise 1.2 m above +0.9 m yard; two 24 m / 5% ramps and 3 m landings, 74 m footprint. Raft 28 x 7.5 m, eight illustrative mounts and shallow preparation remain conditional on site/OEM design. Independent physical structures; no common concrete raft. WIM core 100 x 6.5 m, four 2 m quartz strips, one controller, one IR pair, one LiDAR, two fixed CCTV and two QR readers across both lanes.
Retains same-order QR entry/exit, stable static tare via IoT, outbound WIM gross, net/volume/excess volume, synthetic LiDAR ODOL and numeric-only order comparison. Static/WIM faults cannot produce final cargo; cloud-offline demo retains a synthetic local record. /api/parallel-measurements validates v2.1 only; no live Oracle NetSuite ERP forwarding. Existing hybrid API remains backward compatible.
No crossing inside the weighing corridor; loading loop is schematic and needs traffic/swept-path review. Static/gate/loading queues remain. Planning service model at defaults is static 110 s and WIM 60 s with a 12 m envelope; capacity about 32.7 completed trips/h. Random-arrival waiting estimates are illustrative, not animation durations or OEM ratings.
Includes full dimension/specification tables, cross-section/plan diagrams, technical references and five-page confidential PAR-R01 PDFs in IND/EN. Validation: 25 Node tests; browser checks for separated-lane geometry, QR lifecycle, order comparison, ODOL, API, faults/offline, all views/modes, language, PDFs and mobile.

### Option02 Hercules technical basis (v6.3)
`hercules-data.js` separates customer PDF specs (80 t ×20kg,18×3m nominal/3.2m overall drawing,6steel modules,.308m module depth,8analog30tcells,FineFS8000) from coordination civil assumptions. The OEM foundation drawing is not supplied. The 28×7.5×.35m raft, deck+1.608m,0.708m rise,14.16m ramps at5%,52.32m footprint are conceptual. Interface ports/protocol,30t cell IP/material,type approval variant and site verification need confirmation. Wide3.2m mining profile is held before entering the scale; road2.55m profile only passes a conservative envelope screen, not engineering approval. Customer prices/contacts are not published. StaticPDFs: `/downloads/AIMOC_WIM_Static_Hercules_HER_R02_IND.pdf` and EN.

### Three options (v7.0)
Option03 `/static.html` uses shared UI/scene with doubleStatic flag, `double-static-data.js`, `double-static-simulation.js`, and `double-static-panel.js`. Two80t/20kg modular18x3m instruments;gross source is static. Above80t/invalid/unstable records never yield final net; conservative width screen holds3.2m profile. Capacity guard is synthetic, not pre-entry mass detection. Two independent110s static stations maintain32.7trips/h theoretical bottleneck, with queues on BOTH sides. Three-way comparisons and neutral PDF filenames;clean build removes retired branded assets.
