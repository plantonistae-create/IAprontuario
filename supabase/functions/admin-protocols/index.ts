import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const env=(n:string)=>Deno.env.get(n)||'';
const URL=env('SUPABASE_URL'),ANON=env('SUPABASE_ANON_KEY'),SERVICE=env('SUPABASE_SERVICE_ROLE_KEY');
const ORIGIN=env('ALLOWED_ORIGIN')||'https://plantonistae-create.github.io';
const cors={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,'Content-Type':'application/json; charset=utf-8'}});
const text=(v:any,max=12000)=>String(v??'').trim().slice(0,max);
const arr=(v:any,max=40)=>Array.isArray(v)?[...new Set(v.map(x=>text(x,160)).filter(Boolean))].slice(0,max):[];
function rxItems(v:any){if(!Array.isArray(v))return[];return v.slice(0,100).filter(x=>x&&typeof x==='object'&&!Array.isArray(x)).map((x:any)=>({principio_ativo:text(x.principio_ativo,300),apresentacao:text(x.apresentacao,300),quantidade_total:text(x.quantidade_total,200),via:text(x.via,80)||'oral',categoria:text(x.categoria,160)||'Tratamento',grupo_selecao:text(x.grupo_selecao,160),modo_selecao:text(x.modo_selecao,40)||'multi',manual_text:text(x.manual_text||x.posologia,1200),posologia:text(x.posologia||x.manual_text,1200),sugerido:x.sugerido!==false})).filter((x:any)=>x.principio_ativo&&x.manual_text)}
async function staff(req:Request){const auth=req.headers.get('Authorization')||'';if(!auth.startsWith('Bearer '))throw new Error('UNAUTHORIZED');const c=createClient(URL,ANON,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});const {data:{user},error}=await c.auth.getUser();if(error||!user)throw new Error('UNAUTHORIZED');const {data:p,error:pe}=await c.from('profiles').select('is_admin,is_reviewer,access_status').eq('id',user.id).single();if(pe||p?.access_status!=='active'||(!p?.is_admin&&!p?.is_reviewer))throw new Error('PROTOCOL_STAFF_REQUIRED');return{user,profile:p}}
async function log(admin:any,protocol_id:string|null,version_id:string|null,actor_id:string,action:string,details:any={}){await admin.from('nexa_protocol_audit_log').insert({protocol_id,version_id,actor_id,action,details}).then(()=>{},()=>{})}
async function list(admin:any){const {data:protocols,error}=await admin.from('nexa_clinical_protocols').select('*').order('title',{ascending:true});if(error)throw error;const ids=(protocols||[]).map((p:any)=>p.id);let versions:any[]=[];if(ids.length){const r=await admin.from('nexa_protocol_versions').select('id,protocol_id,version_no,status,created_at,published_at').in('protocol_id',ids).order('version_no',{ascending:false});if(r.error)throw r.error;versions=r.data||[]}const by=new Map<string,any[]>();for(const v of versions){const a=by.get(v.protocol_id)||[];a.push(v);by.set(v.protocol_id,a)}return{protocols:(protocols||[]).map((p:any)=>{const vv=by.get(p.id)||[],active=vv.find(v=>v.id===p.active_version_id),latest=[...vv].sort((a,b)=>b.version_no-a.version_no)[0];return{id:p.id,title:p.title,diagnosis_key:p.diagnosis_key,cid10:p.cid10||[],match_terms:p.match_terms||[],active_version_id:p.active_version_id,active_version_no:active?.version_no||null,latest_status:latest?.status||null,updated_at:p.updated_at}})}}
async function get(admin:any,id:string){const {data:p,error}=await admin.from('nexa_clinical_protocols').select('*').eq('id',id).single();if(error)throw error;const {data:versions,error:ve}=await admin.from('nexa_protocol_versions').select('*').eq('protocol_id',id).order('version_no',{ascending:false});if(ve)throw ve;const vv=versions||[],active=vv.find((v:any)=>v.id===p.active_version_id)||null,editable=vv.find((v:any)=>['draft','review'].includes(v.status))||null;return{protocol:p,versions:vv,active_version:active,editable_version:editable}}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});if(req.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
 try{const {user}=await staff(req),admin=createClient(URL,SERVICE,{auth:{persistSession:false}}),b=await req.json().catch(()=>({})),action=text(b.action,40)||'list';
  if(action==='list')return json(await list(admin));
  if(action==='get'){const id=text(b.protocol_id,80);if(!id)return json({error:'PROTOCOL_ID_REQUIRED'},400);return json(await get(admin,id))}
  if(action==='save_draft'){
   const title=text(b.title,300),diagnosis=text(b.diagnosis_key,200);if(title.length<2||!diagnosis)return json({error:'TITLE_AND_DIAGNOSIS_REQUIRED'},400);
   const metadata={title,diagnosis_key:diagnosis,cid10:arr(b.cid10).map(x=>x.toUpperCase()),match_terms:arr(b.match_terms)};
   let protocolId=text(b.protocol_id,80),protocol:any;
   if(protocolId){const r=await admin.from('nexa_clinical_protocols').update(metadata).eq('id',protocolId).select('*').single();if(r.error)throw r.error;protocol=r.data}
   else{const r=await admin.from('nexa_clinical_protocols').insert({...metadata,created_by:user.id}).select('*').single();if(r.error)throw r.error;protocol=r.data;protocolId=protocol.id}
   const {data:versions,error:ve}=await admin.from('nexa_protocol_versions').select('id,version_no,status').eq('protocol_id',protocolId).order('version_no',{ascending:false});if(ve)throw ve;
   const draft=(versions||[]).find((v:any)=>v.status==='draft'),payload={clinical_scope:text(b.clinical_scope),source_label:text(b.source_label,800),source_page:text(b.source_page,200),change_note:text(b.change_note,1200),prescription_text:text(b.prescription_text,20000),prescription_items:rxItems(b.prescription_items),guidance_text:text(b.guidance_text,20000),criteria_text:text(b.criteria_text,20000),contraindications_text:text(b.contraindications_text,20000),required_data_text:text(b.required_data_text,20000)};
   if(!payload.change_note)return json({error:'CHANGE_NOTE_REQUIRED'},400);
   let version:any;
   if(draft){const r=await admin.from('nexa_protocol_versions').update(payload).eq('id',draft.id).select('*').single();if(r.error)throw r.error;version=r.data}
   else{const next=Math.max(0,...(versions||[]).map((v:any)=>Number(v.version_no)||0))+1;const r=await admin.from('nexa_protocol_versions').insert({...payload,protocol_id:protocolId,version_no:next,status:'draft',created_by:user.id}).select('*').single();if(r.error)throw r.error;version=r.data}
   await log(admin,protocolId,version.id,user.id,'save_draft',{version_no:version.version_no});return json({ok:true,protocol_id:protocolId,version_id:version.id,version_no:version.version_no});
  }
  if(action==='submit_review'){
   const pid=text(b.protocol_id,80),vid=text(b.version_id,80);const {data:v,error}=await admin.from('nexa_protocol_versions').select('id,status,protocol_id,version_no').eq('id',vid).eq('protocol_id',pid).single();if(error)throw error;if(v.status!=='draft')return json({error:'VERSION_NOT_DRAFT'},409);
   const r=await admin.from('nexa_protocol_versions').update({status:'review',reviewed_at:new Date().toISOString()}).eq('id',vid).select('id').single();if(r.error)throw r.error;await log(admin,pid,vid,user.id,'submit_review',{version_no:v.version_no});return json({ok:true});
  }
  if(action==='publish'){
   const pid=text(b.protocol_id,80),vid=text(b.version_id,80);const {data:v,error}=await admin.from('nexa_protocol_versions').select('*').eq('id',vid).eq('protocol_id',pid).single();if(error)throw error;if(!['draft','review'].includes(v.status))return json({error:'VERSION_NOT_PUBLISHABLE'},409);
   const {data:p,error:pe}=await admin.from('nexa_clinical_protocols').select('active_version_id').eq('id',pid).single();if(pe)throw pe;
   if(p.active_version_id&&p.active_version_id!==vid){const ar=await admin.from('nexa_protocol_versions').update({status:'archived'}).eq('id',p.active_version_id).eq('status','approved');if(ar.error)throw ar.error}
   const stamp=new Date().toISOString();const vr=await admin.from('nexa_protocol_versions').update({status:'approved',published_by:user.id,published_at:stamp}).eq('id',vid);if(vr.error)throw vr.error;const pr=await admin.from('nexa_clinical_protocols').update({active_version_id:vid}).eq('id',pid);if(pr.error)throw pr.error;await log(admin,pid,vid,user.id,'publish',{version_no:v.version_no});return json({ok:true,protocol_id:pid,version_id:vid,version_no:v.version_no});
  }
  return json({error:'INVALID_ACTION'},400);
 }catch(e){const m=e instanceof Error?e.message:String(e);if(m==='UNAUTHORIZED')return json({error:m},401);if(m==='PROTOCOL_STAFF_REQUIRED')return json({error:m},403);console.error('admin-protocols',e);return json({error:m||'INTERNAL_ERROR'},500)}
});