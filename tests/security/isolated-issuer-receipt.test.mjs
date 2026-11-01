import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {isolatedTarget} from '../../scripts/isolated-clinical-target.mjs';

const local=process.env.NEXA_LOCAL_ONLY==='1';
if(!local)throw new Error('Issuer integration fixture requires disposable local stack');
const target=isolatedTarget({ref:process.env.NEXA_ISOLATED_REF,
 ack:process.env.NEXA_ISOLATED_ACK,url:process.env.NEXA_ISOLATED_URL,
 dbURL:process.env.NEXA_ISOLATED_DB_URL,authURL:process.env.NEXA_ISOLATED_AUTH_URL,
 restURL:process.env.NEXA_ISOLATED_REST_URL,functionsURL:process.env.NEXA_ISOLATED_FUNCTIONS_URL,
 localOnly:true});
const fixture=JSON.parse(readFileSync(process.env.NEXA_ISOLATED_FIXTURE_FILE,'utf8'));
assert.equal(fixture.synthetic,true);assert.equal(fixture.seeded,true);
const privatePath=process.env.NEXA_SYNTHETIC_ISSUER_PRIVATE_FILE;
if(!privatePath?.startsWith('/tmp/nexa-pr92-stack-'))throw new Error('Synthetic key path required');
const privateJwks=JSON.parse(readFileSync(privatePath,'utf8'));
const signingKeys={};
for(const kid of Object.keys(privateJwks))signingKeys[kid]=await crypto.subtle.importKey(
 'jwk',privateJwks[kid],{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
const db=new URL(target.dbURL);
const pgEnv={...process.env,PGHOST:db.hostname,PGPORT:db.port,PGUSER:db.username,
 PGPASSWORD:decodeURIComponent(db.password),PGDATABASE:db.pathname.slice(1),PGSSLMODE:'disable'};
function sql(q){return execFileSync(process.env.NEXA_LOCAL_PSQL_BIN||'psql',
 ['-X','-v','ON_ERROR_STOP=1','--quiet','--no-align','--tuples-only','--command',q],
 {env:pgEnv,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim()}
const b64=x=>Buffer.from(typeof x==='string'?x:new Uint8Array(x)).toString('base64url');
async function signed(payload,kid='synthetic-key-1'){
 const input=b64(JSON.stringify({alg:'ES256',kid,typ:'NEXA-EXTERNAL-ISSUER-RECEIPT+JWT'}))+'.'+b64(JSON.stringify(payload));
 const sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},signingKeys[kid]||signingKeys['synthetic-key-1'],new TextEncoder().encode(input));
 return input+'.'+b64(sig);
}
const sha=s=>createHash('sha256').update(s).digest('hex');
const endpoint=target.api+'/functions/v1/nexa-issuer-receipt-ingest';
async function post(receipt,apiKey=process.env.NEXA_ISOLATED_SERVICE_ROLE_KEY){
 const response=await fetch(endpoint,{method:'POST',headers:{apikey:apiKey,'Content-Type':'application/json'},
  body:JSON.stringify({receipt}),signal:AbortSignal.timeout(20000)});
 return {status:response.status,body:await response.json()};
}

test('service-only ES256 intake persists a linear synthetic receipt lifecycle',async()=>{
 const evidenceId=randomUUID(),actor=fixture.actors.doctorB.id,org=fixture.organizations.B;
 sql(`INSERT INTO private.nexa_historical_evidence(
  id,organization_id,professional_user_id,entity_type,entity_id,document_type,issuer,
  external_reference,secure_document_reference,document_sha256,acquisition_method,
  collected_by,valid_from,valid_until)
 VALUES('${evidenceId}'::uuid,'${org}'::uuid,'${actor}'::uuid,'consultation_history',
  'synthetic-receipt-${fixture.runId}','synthetic-document','synthetic-document-issuer',
  'synthetic-reference','synthetic-protected-reference','${'1'.repeat(64)}',
  'synthetic-test','${actor}'::uuid,now()-interval '1 day',now()+interval '1 day')`);
 const now=Math.floor(Date.now()/1000);
 const root={iss:'https://synthetic-verifier.invalid',aud:'nexa-synthetic-receipt-test',
  iat:now-5,nbf:now-5,exp:now+120,jti:'synthetic-'+randomUUID(),
  evidence_id:evidenceId,event_kind:'verified',sequence_no:1,previous_receipt_sha256:null,
  issuer_identity:'synthetic-document-issuer',document_sha256:'1'.repeat(64),
  verification_method:'digital_signature',source_reference_sha256:'2'.repeat(64),
  proof_reference_sha256:'3'.repeat(64),externally_verified_at:now-10};
 const jws=await signed(root);
 assert.equal((await post(jws,'invalid')).status,401);
 assert.equal((await post(await signed(root,'unknown-key'))).status,422);
 assert.equal((await post(await signed(root,'synthetic-key-3'))).status,422);
 const parts=jws.split('.');
 assert.equal((await post(parts[0]+'.'+b64(JSON.stringify({...root,document_sha256:'9'.repeat(64)}))+'.'+parts[2])).status,422);
 assert.equal(sql(`SELECT count(*) FROM private.nexa_external_issuer_verified_receipts WHERE evidence_id='${evidenceId}'`),'0');
 const first=await post(jws);assert.equal(first.status,200);assert.equal(first.body.ok,true);
 const retry=await post(jws);assert.equal(retry.status,200);assert.equal(retry.body.receipt_id,first.body.receipt_id);
 const bad=await signed({...root,jti:'synthetic-'+randomUUID(),sequence_no:2,
  event_kind:'contested',previous_receipt_sha256:'4'.repeat(64)});
 assert.equal((await post(bad)).status,409);
 const revoked={...root,jti:'synthetic-'+randomUUID(),sequence_no:2,event_kind:'revoked',
  previous_receipt_sha256:sha(jws)};
 const revokeJws=await signed(revoked,'synthetic-key-2'),second=await post(revokeJws);
 assert.equal(second.status,200);
 const contested={...root,jti:'synthetic-'+randomUUID(),sequence_no:3,event_kind:'contested',
  previous_receipt_sha256:sha(revokeJws)};
 assert.equal((await post(await signed(contested,'synthetic-key-2'))).status,200);
 assert.equal(sql(`SELECT count(*) FROM private.nexa_external_issuer_verified_receipts WHERE evidence_id='${evidenceId}'`),'3');
 assert.equal(sql(`SELECT string_agg(event_kind,',' ORDER BY sequence_no) FROM private.nexa_external_issuer_verified_receipts WHERE evidence_id='${evidenceId}'`),'verified,revoked,contested');
 assert.equal(sql(`SELECT has_function_privilege('authenticated','public.nexa_ingest_verified_external_receipt(jsonb)','EXECUTE')`),'f');
});

test('concurrent revocation and contestation cannot fork one receipt version',async()=>{
 const evidenceId=randomUUID(),actor=fixture.actors.doctorB.id,org=fixture.organizations.B;
 sql(`INSERT INTO private.nexa_historical_evidence(
  id,organization_id,professional_user_id,entity_type,entity_id,document_type,issuer,
  external_reference,secure_document_reference,document_sha256,acquisition_method,
  collected_by,valid_from,valid_until)
 VALUES('${evidenceId}'::uuid,'${org}'::uuid,'${actor}'::uuid,'consultation_history',
  'synthetic-race-${fixture.runId}','synthetic-document','synthetic-document-issuer',
  'synthetic-reference','synthetic-protected-reference','${'1'.repeat(64)}',
  'synthetic-test','${actor}'::uuid,now()-interval '1 day',now()+interval '1 day')`);
 const now=Math.floor(Date.now()/1000);
 const base={iss:'https://synthetic-verifier.invalid',aud:'nexa-synthetic-receipt-test',
  iat:now-5,nbf:now-5,exp:now+120,evidence_id:evidenceId,
  issuer_identity:'synthetic-document-issuer',document_sha256:'1'.repeat(64),
  verification_method:'digital_signature',source_reference_sha256:'2'.repeat(64),
  proof_reference_sha256:'3'.repeat(64),externally_verified_at:now-10};
 const root=await signed({...base,jti:'synthetic-'+randomUUID(),event_kind:'verified',
  sequence_no:1,previous_receipt_sha256:null});
 assert.equal((await post(root)).status,200);
 const next={...base,sequence_no:2,previous_receipt_sha256:sha(root)};
 const revoke=await signed({...next,jti:'synthetic-'+randomUUID(),event_kind:'revoked'},'synthetic-key-2');
 const contest=await signed({...next,jti:'synthetic-'+randomUUID(),event_kind:'contested'},'synthetic-key-2');
 const results=await Promise.all([post(revoke),post(contest)]);
 assert.deepEqual(results.map(x=>x.status).sort((a,b)=>a-b),[200,409]);
 assert.equal(sql(`SELECT count(*) FROM private.nexa_external_issuer_verified_receipts WHERE evidence_id='${evidenceId}'`),'2');
 assert.equal(sql(`SELECT count(*) FROM private.nexa_external_issuer_verified_receipts WHERE evidence_id='${evidenceId}' AND sequence_no=2`),'1');
});
