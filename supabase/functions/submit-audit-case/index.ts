import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { isPlainObject, normalizeSnapshotVersion, safeCoreContext, validateDeidentifiedEnvelope } from "./audit-contract.mjs";

const env=(name:string)=>Deno.env.get(name)||'';
const SUPABASE_URL=env('SUPABASE_URL');
const SUPABASE_ANON_KEY=env('SUPABASE_ANON_KEY');
const SERVICE_KEY=env('SUPABASE_SERVICE_ROLE_KEY');
const AI_KEY=env('OPENAI_API_KEY');
const MODEL=env('AUDIT_DEID_MODEL')||'gpt-5.6-luna';
const ORIGIN=env('ALLOWED_ORIGIN')||'https://plantonistae-create.github.io';
const cors={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8'}});
function outputText(payload:any){if(typeof payload?.output_text==='string')return payload.output_text;for(const item of payload?.output||[])for(const content of item?.content||[])if(content?.type==='output_text'&&typeof content?.text==='string')return content.text;return''}

function sourceCoreContext(body:any,source:any){
  const base=isPlainObject(body?.core_context)?body.core_context:{};
  const autosave=isPlainObject(source?.processing_meta?.encounter_autosave)?source.processing_meta.encounter_autosave:{};
  const merged={
    ...base,
    schema_version:'3',
    clinical_plan:isPlainObject(base.clinical_plan)?base.clinical_plan:(isPlainObject(autosave.clinicalPlan)?autosave.clinicalPlan:{}),
    destination:isPlainObject(base.destination)?base.destination:(isPlainObject(autosave.destination)?autosave.destination:{}),
    audit_submission_snapshot:{
      ...(isPlainObject(base.audit_submission_snapshot)?base.audit_submission_snapshot:{}),
      captured_at:new Date().toISOString(),
      source_consultation_id:String(source?.encounter_id||body?.source_consultation_id||''),
      immutable_submission:false,
      capture_reason:String(body?.core_context?.audit_submission_snapshot?.capture_reason||'automatic_handoff'),
      frontend_version:String(body?.core_context?.audit_submission_snapshot?.frontend_version||'18.10.1'),
    },
  };
  return safeCoreContext(merged);
}

serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
 try{
  const auth=req.headers.get('Authorization')||'';if(!auth.startsWith('Bearer '))return json({error:'UNAUTHORIZED'},401);
  const userClient=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{global:{headers:{Authorization:auth}}});
  const {data:{user},error:userError}=await userClient.auth.getUser();if(userError||!user)return json({error:'UNAUTHORIZED'},401);
  const {data:caps,error:capsError}=await userClient.rpc('get_my_capabilities');if(capsError)return json({error:'CAPABILITIES_UNAVAILABLE'},403);
  const cap=Array.isArray(caps)?caps[0]:caps;if(!cap||cap.access_status!=='active'||!cap.clinical_access)return json({error:'CLINICAL_ACCESS_REQUIRED'},403);

  const body=await req.json().catch(()=>({}));
  const sourceId=String(body?.source_consultation_id||'');
  const snapshotVersion=normalizeSnapshotVersion(body?.snapshot_version);
  if(!/^[0-9a-f-]{36}$/i.test(sourceId))return json({error:'INVALID_PAYLOAD'},400);

  const {data:source,error:sourceError}=await userClient
    .from('consultation_history')
    .select('id,encounter_id,user_id,fields,encounter_state,audit_priority,updated_at,sync_version,processing_meta')
    .eq('encounter_id',sourceId)
    .maybeSingle();
  if(sourceError)return json({error:'SOURCE_LOOKUP_FAILED'},500);

  if(source&&source.encounter_state!=='ready_for_audit'){
    return json({error:'SOURCE_NOT_READY'},409);
  }

  const fields=source?.fields??body?.fields;
  if(!isPlainObject(fields))return json({error:'INVALID_PAYLOAD'},400);

  const sourceSyncVersion=Math.max(0,Number(source?.sync_version||0));
  const sourcePriority=Math.max(0,Math.min(2,Number(source?.audit_priority||body?.audit_priority||0)));
  const sourceUpdatedAt=source?.updated_at||null;
  const coreContext=sourceCoreContext(body,source);
  const requireLearningLayers=isPlainObject(body?.core_context?.learning_layers);

  const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false}});
  const {data:existing,error:lookupError}=await admin.from('audit_cases')
    .select('id,status,source_sync_version,priority,submitted_at')
    .eq('source_consultation_id',sourceId)
    .eq('snapshot_version',snapshotVersion)
    .maybeSingle();
  if(lookupError)return json({error:'AUDIT_LOOKUP_FAILED'},500);

  if(existing&&existing.status!=='pending')return json({error:'ALREADY_REVIEWED',case_id:existing.id,status:existing.status},409);
  if(existing&&Number(existing.source_sync_version||0)>=sourceSyncVersion&&Number(existing.priority||0)>=sourcePriority){
    return json({error:'ALREADY_SUBMITTED',case_id:existing.id,status:existing.status},409);
  }

  const input={fields,core_context:coreContext};
  const prompt=`Retorne SOMENTE JSON com fields e core_context. Desidentifique completamente o caso, inclusive PII em texto livre. Preserve conteúdo clínico e preserve separadamente learning_layers.original_ai e learning_layers.physician_final; audit_corrected permanece null. Preserve destination, hypothesis_validation e audit_submission_snapshot. Não inclua identificadores do paciente ou médico. Não invente dados. Entrada: ${JSON.stringify(input).slice(0,48000)}`;
  const upstream=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${AI_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,store:false,reasoning:{effort:'low'},input:prompt,text:{format:{type:'json_object'}}})});
  const raw=await upstream.text();if(!upstream.ok)return json({error:'DEIDENTIFICATION_FAILED'},502);
  const parsed=JSON.parse(raw),text=outputText(parsed);if(!text)return json({error:'EMPTY_DEIDENTIFICATION'},502);
  let deid:any;try{deid=JSON.parse(text)}catch{return json({error:'INVALID_DEIDENTIFICATION_JSON'},502)}
  const validation=validateDeidentifiedEnvelope(deid,{requireLearningLayers});if(!validation.ok)return json({error:validation.error},502);
  const deidentifiedFields=deid.fields,deidentifiedCore=safeCoreContext(deid.core_context);

  if(existing){
    const {data,error}=await admin.from('audit_cases').update({
      deidentified_fields:deidentifiedFields,
      deidentified_core_context:deidentifiedCore,
      audit_schema_version:'3',
      priority:Math.max(Number(existing.priority||0),sourcePriority),
      source_sync_version:sourceSyncVersion,
      source_updated_at:sourceUpdatedAt,
      last_synced_at:new Date().toISOString(),
    }).eq('id',existing.id).eq('status','pending')
      .select('id,status,submitted_at,snapshot_version,priority,source_sync_version,last_synced_at').single();
    if(error)return json({error:'AUDIT_UPDATE_FAILED'},500);
    return json({ok:true,updated:true,case:data,audit_schema_version:'3',core_ready_after_review:true,radar_raw_transcript_saved:false});
  }

  const {data,error}=await admin.from('audit_cases').insert({
    source_consultation_id:sourceId,snapshot_version:snapshotVersion,submitted_by:user.id,
    deidentified_fields:deidentifiedFields,deidentified_core_context:deidentifiedCore,
    audit_schema_version:'3',status:'pending',priority:sourcePriority,
    source_sync_version:sourceSyncVersion,source_updated_at:sourceUpdatedAt,last_synced_at:new Date().toISOString(),
  }).select('id,status,submitted_at,snapshot_version,priority,source_sync_version,last_synced_at').single();
  if(error){if(String(error.code)==='23505')return json({error:'ALREADY_SUBMITTED'},409);return json({error:'AUDIT_INSERT_FAILED'},500)}
  return json({ok:true,updated:false,case:data,audit_schema_version:'3',core_ready_after_review:true,radar_raw_transcript_saved:false});
 }catch(error){
  console.error('submit-audit-case',error);
  return json({error:'INTERNAL_ERROR'},500);
 }
});
