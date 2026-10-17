import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import { createAuditedCase, createDatasetItem } from "../_shared/nexa-core-foundations.mjs";
import { findDirectPii } from "../submit-audit-case/audit-contract.mjs";

// ADMIN-ONLY batch JSONL export. Requires explicit rights and deidentification approvals.
// No source consultation ID, doctor/patient ID, audio, transcript or voiceprint is exported.
const endpoint = Deno.env.get("SUPABASE_URL") || "";
const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const origin = Deno.env.get("ALLOWED_ORIGIN") || "https://plantonistae-create.github.io";
const hmacSecret = Deno.env.get("NEXA_DATASET_HMAC_SECRET") || "";
function serviceKey(){
  try {const keys=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");if(keys?.default)return String(keys.default);}catch{}
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}
const CLINICAL_FIELDS = [
  "queixa_principal","hda","alergias","comorbidades","medicacoes","antecedentes",
  "sinais_vitais","exame_fisico","hipotese_diagnostica","conduta",
  "sugestoes_perguntas","orientacoes","exames_sugeridos","prescricao_sugerida"
];
function pickFields(value: unknown) {
  if(!value || typeof value !== "object" || Array.isArray(value))return {};
  const raw=value as Record<string, unknown>;
  const result: Record<string, string> = {};
  for(const k of CLINICAL_FIELDS) if(typeof raw[k]==="string" && String(raw[k]).trim())
    result[k]=String(raw[k]).slice(0,20000);
  return result;
}
function layer(value: unknown) {
  const obj=value && typeof value==="object" && !Array.isArray(value) ? value as Record<string,unknown> : {};
  return {fields:pickFields(obj.fields || obj)};
}
function res(req:Request,body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{
    "Access-Control-Allow-Origin":req.headers.get("Origin")===origin?origin:"",
    "Access-Control-Allow-Headers":"authorization,apikey,content-type",
    "Access-Control-Allow-Methods":"POST,OPTIONS",
    "Cache-Control":"no-store",Vary:"Origin","Content-Type":"application/json"
  }});
}
async function pseudonym(id:string){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(hmacSecret),
    {name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const bytes=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(id));
  return Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,"0")).join("");
}
Deno.serve(async req=>{
  if(req.method==="OPTIONS")return res(req,{ok:true});
  if(req.method!=="POST")return res(req,{error:"METHOD_NOT_ALLOWED"},405);
  if(req.headers.get("Origin")!==origin)return res(req,{error:"ORIGIN_FORBIDDEN"},403);
  const bearer=req.headers.get("Authorization")||"";
  if(!bearer.startsWith("Bearer "))return res(req,{error:"UNAUTHORIZED"},401);
  const userClient=createClient(endpoint,publishableKey,{global:{headers:{Authorization:bearer}}});
  const {data:{user},error:userError}=await userClient.auth.getUser();
  if(userError||!user)return res(req,{error:"UNAUTHORIZED"},401);
  const {data:profile,error:profileError}=await userClient.from("profiles")
    .select("is_admin,access_status").eq("id",user.id).maybeSingle();
  if(profileError||!profile?.is_admin||profile.access_status!=="active")
    return res(req,{error:"DATASET_ADMIN_REQUIRED"},403);
  if(!serviceKey()||hmacSecret.length<32)return res(req,{error:"DATASET_EXPORT_NOT_CONFIGURED"},503);
  const body=await req.json().catch(()=>({}));
  const version=String(body?.dataset_version||"");
  const offset=Number(body?.offset??0);
  const limit=Number(body?.limit??100);
  if(!/^[a-zA-Z0-9_.-]{3,80}$/.test(version)||
    !Number.isInteger(offset)||offset<0||
    !Number.isInteger(limit)||limit<1||limit>100)
      return res(req,{error:"INVALID_EXPORT_PARAMETERS"},400);
  const admin=createClient(endpoint,serviceKey(),{auth:{persistSession:false,autoRefreshToken:false}});
  try{
    const {data:approved,error:aerr}=await admin.from("nexa_core_dataset_approvals")
      .select("audit_case_id,policy_version").eq("approved",true)
      .eq("deidentification_reviewed",true).is("revoked_at",null)
      .order("audit_case_id",{ascending:true}).range(offset,offset+limit-1);
    if(aerr)throw Error("APPROVAL_QUERY_FAILED");
    const ids=(approved||[]).map(x=>x.audit_case_id);
    if(!ids.length)return res(req,{error:"NO_APPROVED_CASES",offset,limit},404);
    const [{data:cases,error:cerror},{data:audits,error:derror}]=await Promise.all([
      admin.from("nexa_core_cases")
        .select("audit_case_id,quality_status,case_data,learning_profile,core_schema_version,audit_reviewed_at")
        .in("audit_case_id",ids),
      admin.from("audit_cases")
        .select("id,status,reviewed_fields,deidentified_core_context")
        .in("id",ids)
    ]);
    if(cerror||derror)throw Error("DATASET_QUERY_FAILED");
    const casesById=new Map((cases||[]).map(c=>[c.audit_case_id,c]));
    const auditsById=new Map((audits||[]).map(a=>[a.id,a]));
    const lines:string[]=[];
    for(const approvedRow of approved||[]){
      const c=casesById.get(approvedRow.audit_case_id),a=auditsById.get(approvedRow.audit_case_id);
      if(!c||!a||!["approved","corrected"].includes(c.quality_status)||
        !["approved","corrected"].includes(a.status))throw Error("AUDIT_STATUS_INVALID");
      const pseudonymousId=await pseudonym(c.audit_case_id);
      const fields=pickFields(a.reviewed_fields || c.case_data);
      if(!Object.keys(fields).length)throw Error("EMPTY_AUDITED_CASE");
      const lp=c.learning_profile||{};
      const speaker=a.deidentified_core_context?.speaker_attribution||{};
      const speakerMeta={
        schema_version:String(speaker.schema_version||"speaker-attribution-v1"),
        confirmed_by_physician:speaker.confirmed_by_physician===true,
        speaker_count:Math.max(0,Math.min(10,Number(speaker.speaker_count)||0)),
        role_segment_counts:{
          physician:Math.max(0,Number(speaker.role_segment_counts?.physician)||0),
          patient:Math.max(0,Number(speaker.role_segment_counts?.patient)||0),
          companion:Math.max(0,Number(speaker.role_segment_counts?.companion)||0),
          other:Math.max(0,Number(speaker.role_segment_counts?.other)||0)
        }
      };
      const audited=createAuditedCase({
        id:pseudonymousId,
        quality_status:c.quality_status,
        case_data:fields,
        learning_profile:{
          original_ai:layer(lp.original_ai),
          physician_final:layer(lp.physician_final),
          target:{fields},
          destination:{}, hypothesis_validation:{},
        },
        core_schema_version:String(c.core_schema_version||"3"),
        audit_reviewed_at:String(c.audit_reviewed_at||"")
      });
      const item=createDatasetItem(audited,{datasetVersion:version});
      const safe={
        ...item,
        source:{...item.source,policyVersion:approvedRow.policy_version},
        input:{...item.input,speakerAttribution:speakerMeta},
      };
      // Machine checks supplement, never replace, the mandatory human review.
      if(findDirectPii(safe).length)throw Error("POTENTIAL_IDENTIFIER_DETECTED");
      lines.push(JSON.stringify(safe));
    }
    const output=lines.join("\n")+"\n";
    const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(output));
    const digest=Array.from(new Uint8Array(hash)).map(n=>n.toString(16).padStart(2,"0")).join("");
    const {error:logError}=await admin.from("nexa_core_dataset_export_events")
      .insert({requested_by:user.id,dataset_version:version,case_count:lines.length,
        exporter_version:"nexa-jsonl-v1"});
    if(logError)throw Error("EXPORT_AUDIT_LOG_FAILED");
    return new Response(output,{status:200,headers:{
      "Content-Type":"application/x-ndjson; charset=utf-8",
      "Content-Disposition":'attachment; filename="nexa-core-'+version+'-'+offset+'.jsonl"',
      "Cache-Control":"no-store",
      "Access-Control-Allow-Origin":origin,
      "Access-Control-Expose-Headers":"X-NEXA-SHA256,X-NEXA-Count",
      "X-NEXA-SHA256":digest,
      "X-NEXA-Count":String(lines.length),
    }});
  }catch(e){
    // Error class only; never log or return case content.
    return res(req,{error:e instanceof Error?e.message:"DATASET_EXPORT_FAILED"},500);
  }
});
