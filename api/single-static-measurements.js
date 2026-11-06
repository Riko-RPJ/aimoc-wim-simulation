import {normalizeSingleStatic} from '../lib/single-static-measurement.js';
import {cors} from '../lib/measurement.js';

export default function(req,res){
  if(cors(req,res))return;
  res.setHeader('Content-Type','application/json');
  if(req.method==='GET')return res.end(JSON.stringify({schema_version:'4.0',phase:'phase1',scenario:'single_static_inbound_outbound',endpoint:'POST /api/single-static-measurements',mode:'validate_only',synthetic_only:true,physical_static_stations:1,shared_indicator:true,forwarded_to_erp:false,erp_system:'oracle_netsuite',persistence:false,comparison:'numerical_display_only',resource_validation:'synthetic_sequence_only_not_physical_safety_proof'}));
  if(req.method!=='POST'){
    res.setHeader('Allow','GET, POST, OPTIONS');res.statusCode=405;
    return res.end(JSON.stringify({error:'Use GET, POST or OPTIONS.'}));
  }
  try{
    const input=typeof req.body==='string'?JSON.parse(req.body):req.body;
    const record=normalizeSingleStatic(input);
    // Intentionally does not call deliver(): this demo endpoint never forwards or persists.
    res.end(JSON.stringify({accepted:true,persisted:false,forwarded_to_erp:false,erp_system:'oracle_netsuite',mode:'validate_only',record,idempotency_key:record.trip_id,idempotency_scope:'reference_only_no_durable_deduplication',delivery:{status:'not_configured',message:'Synthetic Phase 1 record validated only. Not sent to Oracle NetSuite and not permanently stored.'}}));
  }catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message}));}
}
