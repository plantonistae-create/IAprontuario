import { createClient } from '@supabase/supabase-js';

const STAGING_URL = process.env.NEXA_STAGING_URL || 'https://phaitiijsjwrggdnoxiz.supabase.co';
const PUBLISHABLE_KEY = process.env.NEXA_STAGING_PUBLISHABLE_KEY || 'sb_publishable_ycPBjNXEa9SKwi4NhIorEQ_Aa0baK_G';
const STAGING_ORIGIN = 'http://127.0.0.1:4173';
const EMAIL = process.env.NEXA_STAGING_EMAIL || '';
const PASSWORD = process.env.NEXA_STAGING_PASSWORD || '';

const endpoints = ['process-consultation','clinical-assistant','realtime-radar','realtime-call','clinical-plan','cid10-catalog','protocol-library','admin-protocols','audit-backfill'];
const authErrors = /UNAUTHORIZED|CLINICAL_ACCESS_REQUIRED|ACTIVE_CLINICAL_ACCESS_REQUIRED|ACCESS_REQUIRED|Sessão inválida|Acesso clínico/i;

function fail(message){ throw new Error(message); }
async function decode(res){
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { text, json };
}
function headers(token, json=true){
  return {
    apikey: PUBLISHABLE_KEY,
    ...(token ? {Authorization:`Bearer ${token}`} : {}),
    Origin: STAGING_ORIGIN,
    ...(json ? {'Content-Type':'application/json'} : {}),
  };
}
async function call(slug, token, body, {form=false}={}){
  const res = await fetch(`${STAGING_URL}/functions/v1/${slug}`, {
    method:'POST',
    headers: headers(token, !form),
    body: form ? body : JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(20000),
  });
  const parsed = await decode(res);
  return {res,...parsed};
}
async function anonymousRegression(){
  const cases = [
    ['process-consultation', new FormData(), {form:true}],
    ['clinical-assistant', {action:'catalog'}, {}],
    ['realtime-radar', {}, {}],
    ['realtime-call', {}, {}],
    ['clinical-plan', {}, {}],
    ['cid10-catalog', {action:'search',q:'R51',limit:3}, {}],
    ['protocol-library', {action:'search',q:'J45',limit:3}, {}],
    ['admin-protocols', {action:'list'}, {}],
    ['audit-backfill', {action:'report'}, {}],
  ];
  for(const [slug,body,opts] of cases){
    const {res,text}=await call(slug,'',body,opts);
    if(res.ok || ![401,403].includes(res.status)){
      fail(`Anonymous access regression at ${slug}: HTTP ${res.status} ${text.slice(0,160)}`);
    }
    console.log(`anon ${slug}: denied (${res.status})`);
  }
}
async function anonymousEncounterRegression(){
  const supabase=createClient(STAGING_URL,PUBLISHABLE_KEY,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  });
  const id=crypto.randomUUID();
  const {error}=await supabase.from('consultation_history').insert({
    id,encounter_id:id,user_id:id,fields:{queixa_principal:'QA anon must fail'},status:'draft',encounter_state:'draft',
  });
  if(!error) fail('Anonymous consultation_history INSERT unexpectedly succeeded.');
  console.log('anon consultation_history insert: denied');
}

async function encounterPersistenceSmoke(supabase,userId,token){
  const id=crypto.randomUUID(),now=new Date().toISOString();
  let inserted=false;
  try{
    const {data:create,error:createError}=await supabase.from('consultation_history').insert({
      id,encounter_id:id,user_id:userId,fields:{queixa_principal:'QA autosave encounter'},
      status:'draft',encounter_state:'draft',audit_priority:0,last_client_saved_at:now,
      processing_meta:{qa:true,source:'staging-auth-smoke'},created_at:now,updated_at:now,
    }).select('id,encounter_id,encounter_state,sync_version').single();
    if(createError) fail(`encounter create failed: ${createError.message}`);
    inserted=true;
    if(create.id!==id||create.encounter_id!==id||create.encounter_state!=='draft')fail('encounter create identity/state mismatch.');
    console.log('encounter create: PASS');

    const draftAudit=await call('submit-audit-case',token,{source_consultation_id:id,snapshot_version:'final-v1',fields:{queixa_principal:'QA'}});
    if(draftAudit.res.status!==409 || draftAudit.json?.error!=='SOURCE_NOT_READY') fail(`draft audit handoff must be rejected before deidentification: HTTP ${draftAudit.res.status}`);
    console.log('submit-audit-case draft guard: PASS');

    const {data:update,error:updateError}=await supabase.from('consultation_history').update({
      fields:{queixa_principal:'QA autosave encounter',hda:'Synthetic QA history long enough for audit readiness validation.'},
      encounter_state:'ready_for_audit',last_client_saved_at:new Date().toISOString(),
    }).eq('id',id).eq('user_id',userId).select('id,encounter_id,encounter_state,sync_version,audit_ready_at').single();
    if(updateError)fail(`encounter autosave update failed: ${updateError.message}`);
    if(update.id!==id||update.encounter_state!=='ready_for_audit'||Number(update.sync_version)<1||!update.audit_ready_at)fail('encounter autosave did not update same row/state/version.');
    console.log('encounter autosave same-row update: PASS');

    const {data:monotonic,error:monoError}=await supabase.from('consultation_history').update({
      encounter_state:'draft',last_client_saved_at:new Date().toISOString(),
    }).eq('id',id).eq('user_id',userId).select('encounter_state,sync_version').single();
    if(monoError)fail(`encounter monotonic state check failed: ${monoError.message}`);
    if(monotonic.encounter_state!=='ready_for_audit')fail('ready_for_audit regressed to draft.');
    console.log('encounter ready state monotonic: PASS');
  } finally {
    if(inserted){
      const {error}=await supabase.from('consultation_history').delete().eq('id',id).eq('user_id',userId);
      if(error)console.warn(`QA encounter cleanup failed: ${error.message}`);
      else console.log('encounter QA cleanup: PASS');
    }
  }
}

async function authenticatedSmoke(){
  if(!EMAIL || !PASSWORD){
    console.log('authenticated staging smoke: SKIPPED (NEXA_STAGING_EMAIL/PASSWORD not configured)');
    return {skipped:true};
  }
  const supabase=createClient(STAGING_URL,PUBLISHABLE_KEY,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  });
  const {data:login,error:loginError}=await supabase.auth.signInWithPassword({email:EMAIL,password:PASSWORD});
  if(loginError || !login?.session?.access_token) fail('Staging clinical sign-in failed.');
  const token=login.session.access_token;

  const {data:caps,error:capsError}=await supabase.rpc('get_my_capabilities');
  if(capsError) fail(`get_my_capabilities failed: ${capsError.message}`);
  const cap=Array.isArray(caps)?caps[0]:caps;
  if(!cap || cap.access_status!=='active' || cap.clinical_access!==true){
    fail('Configured staging account is not an active clinical account.');
  }
  console.log('authenticated capabilities: active clinical access');

  await encounterPersistenceSmoke(supabase,login.user.id,token);

  const cidStatus=await call('cid10-catalog',token,{action:'status'});
  if(!cidStatus.res.ok) fail(`cid10 status failed: HTTP ${cidStatus.res.status}`);
  const count=Number(cidStatus.json?.count||0);
  if(count<12451) fail(`CID catalog unexpectedly small: ${count}`);
  console.log(`cid10 status: ${count} codes`);

  const cidSearch=await call('cid10-catalog',token,{action:'search',q:'R51',limit:5});
  if(!cidSearch.res.ok) fail(`cid10 search failed: HTTP ${cidSearch.res.status}`);
  const cidItems=Array.isArray(cidSearch.json?.items)?cidSearch.json.items:[];
  if(!cidItems.some(item=>String(item?.code||'').toUpperCase().startsWith('R51'))) fail('CID R51 not returned by staging catalog.');
  console.log('cid10 search R51: PASS');

  const protocolSearch=await call('protocol-library',token,{action:'search',q:'J45',limit:5});
  if(!protocolSearch.res.ok || !Array.isArray(protocolSearch.json?.items)) fail(`protocol-library search failed: HTTP ${protocolSearch.res.status}`);
  console.log(`protocol-library: authenticated search PASS (${protocolSearch.json.items.length} published match(es))`);

  if(cap?.is_admin===true || cap?.is_reviewer===true){
    const adminProtocols=await call('admin-protocols',token,{action:'list'});
    if(!adminProtocols.res.ok || !Array.isArray(adminProtocols.json?.protocols)) fail(`admin-protocols list failed: HTTP ${adminProtocols.res.status}`);
    console.log('admin-protocols: staff list PASS');

    const backfill=await call('audit-backfill',token,{action:'report'});
    if(!backfill.res.ok || !backfill.json?.report) fail(`audit-backfill report failed: HTTP ${backfill.res.status}`);
    console.log('audit-backfill: staff read-only report PASS');
  }

  const assistant=await call('clinical-assistant',token,{action:'catalog'});
  if(!assistant.res.ok || !assistant.json?.version) fail(`clinical-assistant catalog smoke failed: HTTP ${assistant.res.status}`);
  console.log('clinical-assistant: authenticated route PASS');

  const radar=await call('realtime-radar',token,{transcript:'',clinical_context:{},previous_state:{}});
  if(!radar.res.ok || !Array.isArray(radar.json?.items)) fail(`realtime-radar empty-context smoke failed: HTTP ${radar.res.status}`);
  console.log('realtime-radar: authenticated route PASS');

  const realtime=await call('realtime-call',token,{});
  if(realtime.res.status!==400 || realtime.json?.error!=='INVALID_SDP') fail(`realtime-call contract smoke failed: HTTP ${realtime.res.status}`);
  console.log('realtime-call: authenticated route PASS');

  const plan=await call('clinical-plan',token,{});
  if(plan.res.status!==400 || plan.json?.error!=='HYPOTHESIS_VALIDATION_REQUIRED') fail(`clinical-plan contract smoke failed: HTTP ${plan.res.status}`);
  console.log('clinical-plan: authenticated route PASS');

  const processForm=new FormData();
  const process=await call('process-consultation',token,processForm,{form:true});
  if(process.res.status!==400 || authErrors.test(process.text)) fail(`process-consultation auth/validation smoke failed: HTTP ${process.res.status}`);
  console.log('process-consultation: authenticated route PASS');

  await supabase.auth.signOut();
  console.log('authenticated staging smoke: PASS');
  return {skipped:false};
}

await anonymousRegression();
await anonymousEncounterRegression();
console.log('anonymous staging regression: PASS');
await authenticatedSmoke();
