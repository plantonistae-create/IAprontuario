import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assessSourceOrigin,syntheticDigest,SYNTHETIC_CLINICAL_FIELD_NAMES} from './source-contract.P0-LAB-ONLY.mjs';

const A='11111111-1111-4111-8111-111111111111';
const E='22222222-2222-4222-8222-222222222222';
const T='33333333-3333-4333-8333-333333333333';
const B='44444444-4444-4444-8444-444444444444';
const BASELINE='064757d2a39ad4c04c60b0034a8b35756b8eb089';
const clone=x=>structuredClone(x);
function fixture(){
  const fields=Object.fromEntries(SYNTHETIC_CLINICAL_FIELD_NAMES.map(k=>[k,'']));
  fields.hda='História inteiramente fictícia, sem paciente identificável.';
  fields.conduta='Observação fictícia sem prescrição de doses.';
  const source={encounter_id:E,user_id:A,encounter_state:'ready_for_audit',
    sync_version:6,updated_at:'2026-11-09T15:00:00Z',fields};
  return {
    actor:{authenticated:true,userId:A},
    caps:{access_status:'active',clinical_access:true},
    source,
    request:{sourceConsultationId:E,snapshotVersion:'final-v1',expectedSourceVersion:6},
    tenantBinding:{resolvedByTrustedServer:true,userId:A,sourceEncounterId:E,
      tenantId:T,sourceTenantId:T},
    atomicallyObserved:{serverResolved:true,conditionalWriteSucceeded:true,
      userId:A,encounterId:E,tenantId:T,sourceVersion:6,
      state:'ready_for_audit',reviewStatus:'pending',clinicalDigest:syntheticDigest(fields)}
  };
}
function stop(x,code){
  assert.equal(x.status,'STOP',code);
  assert.equal(x.code,code);
  assert.equal(x.privilegedWriteAuthorized,false);
  assert.equal(x.resetAuthorized,false);
}
test('P0 isolated baseline: complete synthetic proof is provisional and never authorizes privileged write',()=>{
  const x=assessSourceOrigin(fixture());
  assert.equal(x.status,'PROVISIONAL_SOURCE_CHECKED');
  assert.equal(x.code,'HOSTED_TENANT_AND_TRANSACTION_UNPROVEN');
  assert.equal(x.privilegedWriteAuthorized,false);
  assert.equal(x.resetAuthorized,false);
});
test('missing consultation source must STOP even if client supplies plausible fields',()=>{
  const f=fixture();f.source=null;
  f.request.fields={hda:'Texto inventado pelo cliente'};
  stop(assessSourceOrigin(f),'SOURCE_NOT_ACCESSIBLE');
});
test('missing/invalid authentication and clinical access fail closed',()=>{
  for(const actor of [null,{authenticated:false,userId:A},{authenticated:true,userId:'not-a-uuid'}]){
    const f=fixture();f.actor=actor;
    stop(assessSourceOrigin(f),'UNAUTHENTICATED');
  }
  for(const caps of [null,{access_status:'blocked',clinical_access:true},
    {access_status:'active',clinical_access:false}]){
    const f=fixture();f.caps=caps;
    stop(assessSourceOrigin(f),'CLINICAL_ACCESS_REQUIRED');
  }
});
test('source ownership is checked separately from user-scoped RLS',()=>{
  const f=fixture();f.source.user_id=B;
  stop(assessSourceOrigin(f),'SOURCE_OWNER_MISMATCH');
});
test('missing source owner never silently falls through to client fields',()=>{
  const f=fixture();delete f.source.user_id;
  stop(assessSourceOrigin(f),'SOURCE_OWNER_MISMATCH');
});
test('source consultation ID must match requested ID',()=>{
  const f=fixture();f.source.encounter_id=B;
  stop(assessSourceOrigin(f),'SOURCE_IDENTITY_MISMATCH');
});
test('client must request a valid case and supported snapshot version',()=>{
  for(const request of [null,{sourceConsultationId:'fake',snapshotVersion:'final-v1'},
    {sourceConsultationId:E,snapshotVersion:'legacy-v0'}]){
    const f=fixture();f.request=request;
    stop(assessSourceOrigin(f),'REQUEST_IDENTITY_INVALID');
  }
});
test('source must be ready, never audited/draft/discarded/sending',()=>{
  for(const encounter_state of ['draft','audited','discarded','sending']){
    const f=fixture();f.source.encounter_state=encounter_state;
    stop(assessSourceOrigin(f),'SOURCE_NOT_READY');
  }
});
test('source sync version must exist, be positive, integral and not coerced',()=>{
  for(const sync_version of [undefined,null,0,-1,6.5,'6',Number.NaN]){
    const f=fixture();f.source.sync_version=sync_version;
    stop(assessSourceOrigin(f),'SOURCE_VERSION_UNVERIFIED');
  }
});
test('client-expected source version must be a precise match',()=>{
  for(const expectedSourceVersion of [undefined,null,5,7,'6',0]){
    const f=fixture();f.request.expectedSourceVersion=expectedSourceVersion;
    stop(assessSourceOrigin(f),'STALE_CLIENT_SOURCE_VERSION');
  }
});
test('source timestamp must come from a durable source row',()=>{
  const f=fixture();f.source.updated_at='';
  stop(assessSourceOrigin(f),'SOURCE_TIMESTAMP_UNVERIFIED');
});
test('incomplete source content and unknown future clinical fields STOP',()=>{
  for(const edit of [
    x=>{delete x.source.fields.hda},
    x=>{x.source.fields.new_medication='Sinal fictício'},
    x=>{x.source.fields.hda=17},
    x=>{for(const k of Object.keys(x.source.fields))x.source.fields[k]=''}
  ]){
    const f=fixture();edit(f);
    stop(assessSourceOrigin(f),'SOURCE_FIELDS_NOT_VERIFIED');
  }
});
test('a forged client payload does not replace server-confirmed source',()=>{
  const f=fixture(),digest=syntheticDigest(f.source.fields);
  f.request.fields={hda:'CLIENTE ALTERADO'};f.request.tenant_id=B;
  const r=assessSourceOrigin(f);
  assert.equal(r.status,'PROVISIONAL_SOURCE_CHECKED');
  assert.equal(r.syntheticSourceDigest,digest);
  assert.equal(r.privilegedWriteAuthorized,false);
});
test('authoritative tenant proof missing is STOP (cannot infer from client claims)',()=>{
  const f=fixture();f.tenantBinding=null;
  f.request.tenant_id=T;
  stop(assessSourceOrigin(f),'AUTHORITATIVE_TENANT_BINDING_MISSING');
});
test('tenant proof must be resolved server-side, never claimed by browser',()=>{
  const f=fixture();f.tenantBinding.resolvedByTrustedServer=false;
  stop(assessSourceOrigin(f),'AUTHORITATIVE_TENANT_BINDING_MISSING');
});
test('cross-tenant and owner/session-source mismatch STOP independently',()=>{
  for(const edit of [
    x=>{x.tenantBinding.tenantId=B},
    x=>{x.tenantBinding.userId=B},
    x=>{x.tenantBinding.sourceEncounterId=B},
    x=>{x.tenantBinding.sourceTenantId=B}
  ]){
    const f=fixture();edit(f);
    stop(assessSourceOrigin(f),'AUTHORITATIVE_TENANT_MISMATCH');
  }
});
test('no transactional server proof is STOP after preflight (race safety)',()=>{
  for(const x of [null,{serverResolved:true,conditionalWriteSucceeded:false}]){
    const f=fixture();f.atomicallyObserved=x;
    stop(assessSourceOrigin(f),'ATOMIC_SERVER_RECHECK_MISSING');
  }
});
test('version, owner, tenant, audit status and digest changed before write STOP',()=>{
  const edits=[
    f=>{f.atomicallyObserved.sourceVersion=7},
    f=>{f.atomicallyObserved.userId=B},
    f=>{f.atomicallyObserved.encounterId=B},
    f=>{f.atomicallyObserved.tenantId=B},
    f=>{f.atomicallyObserved.state='draft'},
    f=>{f.atomicallyObserved.reviewStatus='reviewed'},
    f=>{f.atomicallyObserved.clinicalDigest='sha256:'+'a'.repeat(64)}
  ];
  for(const edit of edits){
    const f=fixture();edit(f);
    stop(assessSourceOrigin(f),'SOURCE_CHANGED_BEFORE_PRIVILEGED_WRITE');
  }
});
test('post-review change to a server field fails the recheck',()=>{
  const f=fixture();f.source.fields.hda+=' ADENDO fictício.';
  stop(assessSourceOrigin(f),'SOURCE_CHANGED_BEFORE_PRIVILEGED_WRITE');
});
test('canonical digest changes on any exact clinical text edit',()=>{
  const f=fixture(),a=syntheticDigest(f.source.fields);
  f.source.fields.hda+=' ';
  assert.notEqual(syntheticDigest(f.source.fields),a);
});
test('P0 code anchor: GitHub baseline still contains the source-missing fallback',()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
  const filename=path.join(root,'supabase/functions/submit-audit-case/index.ts');
  const src=fs.readFileSync(filename,'utf8');
  assert.ok(src.includes("if(source&&source.encounter_state!=='ready_for_audit')"),BASELINE);
  assert.ok(src.includes("const fields=source?.fields??body?.fields;"),BASELINE);
  assert.ok(src.includes("const admin=createClient(SUPABASE_URL,SERVICE_KEY"),BASELINE);
  assert.equal(src.includes("if(!source)return json({error:'SOURCE_NOT_ACCESSIBLE'}"),false);
});
