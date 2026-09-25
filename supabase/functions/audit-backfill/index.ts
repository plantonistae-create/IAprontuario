import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { safeCoreContext, validateDeidentifiedEnvelope } from "./audit-contract.mjs";

const env=(n:string)=>Deno.env.get(n)||'';
const URL=env('SUPABASE_URL'),ANON=env('SUPABASE_ANON_KEY'),SERVICE=env('SUPABASE_SERVICE_ROLE_KEY');
const AI_KEY=env('OPENAI_API_KEY'),MODEL=env('AUDIT_DEID_MODEL')||'gpt-5.6-luna';
const ORIGIN=env('ALLOWED_ORIGIN')||'https://plantonistae-create.github.io';
const cors={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8'}});
function outputText(p:any){if(typeof p?.output_text==='string')return p.output_text;for(const i of p?.output||[])for(const c of i?.content||[])if(c?.type==='output_text'&&typeof c?.text==='string')return c.text;return''}
function eligible(f:any={}){const vals=['queixa_principal','hda','exame_fisico','hipotese_diagnostica','conduta'].map(k=>String(f?.[k]||'').trim());const n=vals.filter(v=>v.length>=5).length;return vals[1].length>=20||(vals[0].length>=5&&n>=2)||n>=3}
async function requireStaff(req:Request){
 const auth=req.headers.get('Authorization')||'';if(!auth.startsWith('Bearer '))throw new Error('UNAUTHORIZED');
 const client=createClient(URL,ANON,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
 const {data:{user},error}=await client.auth.getUser();if(error||!user)throw new Error('UNAUTHORIZED');
 const {data:p,error:pe}=await client.from('profiles').select('is_admin,is_reviewer,access_status').eq('id',user.id).single();
 if(pe||p?.access_status!=='active'||(!p?.is_admin&&!p?.is_reviewer))throw new Error('AUDIT_STAFF_REQUIRED');
 return{user,client};
}
async function deidentify(fields:any,core:any){
 const input={fields,core_context:core};
 const prompt=`Retorne SOMENTE JSON com fields e core_context. Desidentifique completamente o caso, inclusive PII em texto livre. Preserve apenas conteúdo clínico. Não inclua identificadores do paciente ou médico. Não invente dados. Entrada: ${JSON.stringify(input).slice(0,48000)}`;
 const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${AI_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,store:false,reasoning:{effort:'low'},input:prompt,text:{format:{type:'json_object'}}})});
 const raw=await r.text();if(!r.ok)throw new Error('DEIDENTIFICATION_FAILED');
 const parsed=JSON.parse(raw),text=outputText(parsed);if(!text)throw new Error('EMPTY_DEIDENTIFICATION');
 const out=JSON.parse(text),validation=validateDeidentifiedEnvelope(out,{requireLearningLayers:true});
 if(!validation.ok)throw new Error(validation.error);
 return{fields:out.fields,core:safeCoreContext(out.core_context)};
}
async function inventory(admin:any){
 const [{data:history,error:he},{data:audit,error:ae}]=await Promise.all([
  admin.from('consultation_history').select('id,encounter_id,user_id,fields,encounter_state,audit_priority,audit_ready_at,created_at,updated_at,sync_version,processing_meta').order('created_at',{ascending:true}).limit(5000),
  admin.from('audit_cases').select('source_consultation_id,snapshot_version,status').limit(5000)
 ]);
 if(he)throw he;if(ae)throw ae;
 const present=new Set((audit||[]).map((x:any)=>String(x.source_consultation_id)));
 const seen=new Map<string,string>(),duplicates=new Set<string>();
 for(const h of history||[]){const key=`${h.user_id}:${JSON.stringify(h.fields||{})}`;if(seen.has(key))duplicates.add(String(h.encounter_id));else seen.set(key,String(h.encounter_id))}
 const recoverable=(history||[]).filter((h:any)=>eligible(h.fields)&&!present.has(String(h.encounter_id))&&!duplicates.has(String(h.encounter_id)));
 const incomplete=(history||[]).filter((h:any)=>!eligible(h.fields)&&!present.has(String(h.encounter_id)));
 return{history:history||[],present,recoverable,incomplete,duplicates};
}
function coreFor(row:any){
 const a=row?.processing_meta?.encounter_autosave||{},hyp=a?.hypothesisReview||{};
 return safeCoreContext({
  schema_version:'3',
  case_mode:'',
  hypothesis_validation:{status:hyp.status||'',ai:hyp.ai||'',final:hyp.final||String(row?.fields?.hipotese_diagnostica||''),cid:hyp.cid||'',source:hyp.source||'historical_backfill'},
  clinical_plan:a?.clinicalPlan||{},
  radar_learning:{chief_complaint:String(row?.fields?.queixa_principal||''),covered:[],missing:[],questions:[],alerts:[]},
  destination:a?.destination||{},
  learning_layers:{original_ai:{hypothesis:hyp.ai||''},physician_final:{fields:row?.fields||{}},audit_corrected:null},
  audit_submission_snapshot:{captured_at:new Date().toISOString(),source_consultation_id:String(row.encounter_id),immutable_submission:true,capture_reason:'historical_backfill',frontend_version:'18.10.1'},
  provenance:{app_version:'18.10.1'}
 });
}
serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
 try{
  await requireStaff(req);const body=await req.json().catch(()=>({})),action=String(body?.action||'report');
  const admin=createClient(URL,SERVICE,{auth:{persistSession:false}}),inv=await inventory(admin);
  const report={total_history:inv.history.length,already_present:inv.present.size,recoverable:inv.recoverable.length,incomplete:inv.incomplete.length,duplicate_exact:inv.duplicates.size,legacy_mapped:inv.history.filter((h:any)=>String(h.id)!==String(h.encounter_id)).length};
  if(action==='report')return json({ok:true,report});
  if(action!=='run')return json({error:'INVALID_ACTION'},400);
  if(body?.confirmed!==true)return json({error:'EXPLICIT_CONFIRMATION_REQUIRED',report},400);
  const limit=Math.max(1,Math.min(25,Number(body?.limit||5))),rows=inv.recoverable.slice(0,limit);
  let recovered=0,skipped=0;const failed:any[]=[];
  for(const row of rows){
   try{
    const core=coreFor(row),deid=await deidentify(row.fields||{},core);
    const {error}=await admin.from('audit_cases').insert({
      source_consultation_id:row.encounter_id,snapshot_version:'final-v1',submitted_by:row.user_id,
      deidentified_fields:deid.fields,deidentified_core_context:deid.core,audit_schema_version:'3',
      status:'pending',priority:Number(row.audit_priority||0),source_sync_version:Number(row.sync_version||0),
      source_updated_at:row.updated_at||row.created_at,last_synced_at:new Date().toISOString()
    });
    if(error&&String(error.code)!=='23505')throw error;
    if(error)skipped++;else recovered++;
   }catch(e){failed.push({encounter_id:String(row.encounter_id),error:e instanceof Error?e.message:String(e)})}
  }
  const after=await inventory(admin);
  return json({ok:true,report_before:report,batch:{requested:rows.length,recovered,skipped,failed},remaining_recoverable:after.recoverable.length});
 }catch(e){
  const m=e instanceof Error?e.message:String(e);
  if(m==='UNAUTHORIZED')return json({error:m},401);
  if(m==='AUDIT_STAFF_REQUIRED')return json({error:m},403);
  console.error('audit-backfill',e);return json({error:'INTERNAL_ERROR'},500);
 }
});
