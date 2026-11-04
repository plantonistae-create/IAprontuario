/** Authenticated synthetic medication gate. Explicitly restricted to staging. */
import {createClient} from '@supabase/supabase-js';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';

const url='https://phaitiijsjwrggdnoxiz.supabase.co';
const email=process.env.NEXA_STAGING_EMAIL,password=process.env.NEXA_STAGING_PASSWORD;
const key=process.env.NEXA_STAGING_PUBLISHABLE_KEY||'sb_publishable_ycPBjNXEa9SKwi4NhIorEQ_Aa0baK_G';
if(process.env.NEXA_SYNTHETIC_ACCOUNT!=='1'||!email||!password)
 throw new Error('MEDICATION_STAGING_GATE_BLOCKED: synthetic staging credentials are not configured');
if(process.env.NEXA_STAGING_URL&&process.env.NEXA_STAGING_URL!==url)
 throw new Error('MEDICATION_STAGING_GATE_BLOCKED: staging URL mismatch');
if(process.env.SUPABASE_ACCESS_TOKEN||process.env.NEXA_STAGING_SERVICE_ROLE_KEY)
 throw new Error('MEDICATION_STAGING_GATE_BLOCKED: administrative credentials are forbidden');
const audioPath=path.join(process.env.NEXA_AUDIO_FIXTURE_DIR||'/private/tmp/nexa-medication-audio','omeprazol-volume.wav');
const bytes=await readFile(audioPath);
if(bytes.length<5000||bytes.toString('ascii',0,4)!=='RIFF')throw new Error('Synthetic WAV missing or invalid');
const client=()=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const a=client(),b=client();
let id=null,owner=null,inserted=false;
try{
 const {data:login,error:loginError}=await a.auth.signInWithPassword({email,password});
 if(loginError||!login.session?.access_token)throw new Error('Synthetic staging sign-in failed');
 owner=login.user.id;
 const {data:caps,error:capsError}=await a.rpc('get_my_capabilities');
 const cap=Array.isArray(caps)?caps[0]:caps;
 if(capsError||cap?.access_status!=='active'||cap?.clinical_access!==true)
  throw new Error('Synthetic staging account lacks active clinical access');
 const form=new FormData();
 form.append('audio',new Blob([bytes],{type:'audio/wav'}),'omeprazol-volume.wav');
 form.append('case_mode','normal');form.append('style_examples','[]');
 const response=await fetch(`${url}/functions/v1/process-consultation`,{
  method:'POST',headers:{Authorization:`Bearer ${login.session.access_token}`,apikey:key,
   Origin:'http://127.0.0.1:4173'},body:form,signal:AbortSignal.timeout(180000)
 });
 if(!response.ok)throw new Error(`Synthetic processing failed: HTTP ${response.status}`);
 const result=await response.json();
 if(!result?.fields||typeof result.fields!=='object'||result.medication_review?.version!=='medication-review-v2')
  throw new Error('Candidate medication review contract absent from staging');
 const field=String(result.fields.medicacoes||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/\bcinco\b/g,'5');
 const alerts=Array.isArray(result.medication_review.alerts)?result.medication_review.alerts:[];
 const namePreserved=/omeprazol/.test(field)||alerts.some(x=>x.medicine==='omeprazol');
 const dosePreserved=/\b5\s*(?:ml|mililitros?)\b/.test(field)||alerts.some(x=>x.code==='volume_missing'&&x.amount==='5'&&x.unit==='mL');
 if(!namePreserved||!dosePreserved)throw new Error('Reported medicine or 5 mL disappeared without review warning');
 if(/\b\d+\s*mg\s*(?:\/|por)\s*ml\b/.test(field))
  throw new Error('Unreported concentration appeared in the structured medication field');
 const now=new Date().toISOString();id=randomUUID();
 const {error:insertError}=await a.from('consultation_history').insert({
  id,encounter_id:id,user_id:owner,fields:result.fields,status:'draft',encounter_state:'draft',
  audit_priority:0,last_client_saved_at:now,created_at:now,updated_at:now,
  processing_meta:{qa:true,source:'synthetic-medication-gate',medication_review:result.medication_review}
 });
 if(insertError)throw new Error(`Synthetic encounter insert failed: ${insertError.message}`);
 inserted=true;
 const {data:second,error:secondError}=await b.auth.signInWithPassword({email,password});
 if(secondError||second.user?.id!==owner)throw new Error('Independent synthetic session failed');
 const {data:reopened,error:readError}=await b.from('consultation_history')
  .select('id,encounter_id,user_id,fields,processing_meta').eq('id',id).maybeSingle();
 if(readError||!reopened||reopened.encounter_id!==id||reopened.user_id!==owner||
    reopened.processing_meta?.medication_review?.version!=='medication-review-v2')
  throw new Error('Synthetic encounter/review recovery failed in second session');
 console.log('MEDICATION_STAGING_GATE_PASS: authenticated synthetic audio, warning contract, second-session recovery');
}finally{
 if(inserted&&id&&owner){
  const {error}=await a.from('consultation_history').delete().eq('id',id).eq('user_id',owner);
  if(error)throw new Error(`Synthetic fixture cleanup failed: ${error.message}`);
  const {data,error:verifyError}=await a.from('consultation_history').select('id').eq('id',id);
  if(verifyError||data?.length)throw new Error('Synthetic fixture remains or cleanup could not be verified');
 }
 await a.auth.signOut({scope:'local'}).catch(()=>{});
 await b.auth.signOut({scope:'local'}).catch(()=>{});
}
