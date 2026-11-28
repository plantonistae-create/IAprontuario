import { after,before,test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { startPostgresLab,q } from './helpers/s63-postgres-lab.mjs';
import { createLabTrustStore,ephemeralLabSigner,sha } from '../labs/nexa-s63/proof.LAB-ONLY.mjs';
import { createLabExporter } from '../labs/nexa-s63/export.LAB-ONLY.mjs';
import { postgresLabWorker } from '../labs/nexa-s63/postgres.LAB-ONLY.mjs';
let lab,sql,signer,trust,secret;
const scope=(a,e)=>q(a)+'::uuid,'+q(e)+'::uuid';
const roleMap={s63_a:'s64_va',s63_b:'s64_vb'};
const owners={s63_a:'11111111-1111-4111-8111-111111111111',s63_b:'22222222-2222-4222-8222-222222222222'};
before(async()=>{
 lab=await startPostgresLab({s64:true});sql=lab.sql;
 console.log('S64_POSTGRES_SOCKET_ONLY',lab.version,'PID',lab.pid,'zero_ipv4_ipv6');signer=ephemeralLabSigner();trust=createLabTrustStore();secret=randomBytes(32);
 await sql('INSERT INTO s63.signing_keys(id) VALUES('+q(trust.pin(signer.publicKey))+');');
 await sql("INSERT INTO s63.release_routes VALUES('s63_a','s64_va'),('s63_b','s64_vb');");
});
after(async()=>{if(lab){await lab.dispose();console.log('S64_CLUSTER_REMOVED')}});
async function fixture({role='s63_a',group=randomUUID(),family=randomUUID(),dataset='synthetic-'+randomUUID().slice(0,8),purpose='evaluation',register=true}={}){
 const o=owners[role],e=randomUUID(),id=randomUUID();
 if(register)await sql('INSERT INTO s63.dataset_registry VALUES('+[dataset,family].map(q).join(',')+');');
 await sql('INSERT INTO s63.materials(owner_id,encounter_id,patient_group,worker) VALUES('+[o,e,group,role].map(q).join(',')+');');
 const head=await sql('SELECT s63.append_fixture('+[o,e,'transcript_final',JSON.stringify({provenance:{origin:'synthetic',generator:'s63-fixture',version:'1'}})].map(q).join(',')+'::jsonb);');
 await sql('INSERT INTO s63.requests VALUES('+[id,o,e,head,'asr',purpose,'text','s63-synthetic-v1',dataset].map(q).join(',')+');');
 await sql('SELECT s63.approve_right('+q(id)+", 'fixture:approved', clock_timestamp()-interval '1 minute',clock_timestamp()+interval '10 minutes');",'s63_reviewer');
 const grant=await sql('SELECT s63.issue_right('+q(id)+');','s63_issuer');
 await sql('SELECT s63.review_derivative('+[id,head,JSON.stringify({text:'Material integralmente fictício.'})].map(q).join(',')+'::jsonb);','s63_reviewer');
 return {role,o,e,id,head,grant,group,family,dataset};
}
async function prepare(x){
 const db=postgresLabWorker(s=>sql(s,x.role));const snapshot=await db.acquire(x.id);
 assert(snapshot);return {snapshot,proof:signer.attest(snapshot)};
}
function verifier(role){
 const db=postgresLabWorker(s=>sql(s,role));
 return createLabExporter({database:db,signer:null,trust,pseudonymSecret:secret});
}
async function release(x,role=roleMap[x.role]){return verifier(role).release(x.id,await prepare(x))}
test('acquisition cannot commit or ingest; verifier cannot acquire',async()=>{
 const x=await fixture();
 assert.equal(await sql("SELECT has_function_privilege('s63_a','s63.commit_delivery(uuid,uuid,integer,s63.digest,s63.digest,s63.digest,s63.digest,s63.digest,integer,timestamptz)','EXECUTE');"),'f');
 assert.equal(await sql("SELECT has_function_privilege('s63_a','s63.approve_ingestion(uuid,s63.digest)','EXECUTE');"),'f');
 assert.equal(await sql("SELECT has_function_privilege('s64_va','s63.acquire(uuid)','EXECUTE');"),'f');
 await assert.rejects(release(x,'s63_a'),/permission denied/i);
 await assert.rejects(release(x,'s64_vb'),/S63_DELIVERY_DENIED/);
 const artifact=await release(x);assert.equal(await verifier('s64_va').approveIngestion(x.id,artifact),true);
});
test('same patient group cannot cross purpose across datasets and owners within a family',async()=>{
 const a=await fixture(),b=await fixture({role:'s63_b',group:a.group,family:a.family,purpose:'training'});
 await release(a);await assert.rejects(release(b),/S63_DELIVERY_DENIED/);
 const same=await fixture({role:'s63_b',group:a.group,family:a.family,purpose:'evaluation'});
 await release(same);
});
test('family lock serializes conflicting releases across different dataset names',async()=>{
 const a=await fixture(),b=await fixture({role:'s63_b',group:a.group,family:a.family,purpose:'training'});
 const [pa,pb]=await Promise.all([prepare(a),prepare(b)]);
 const results=await Promise.allSettled([verifier('s64_va').release(a.id,pa),verifier('s64_vb').release(b.id,pb)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.match(results.find(r=>r.status==='rejected').reason.message,/S63_DELIVERY_DENIED/);
 assert.equal(await sql('SELECT count(*) FROM s63.deliveries WHERE request_id IN ('+[a.id,b.id].map(q).join(',')+');'),'1');
});
test('unregistered dataset and registry reassignment fail closed',async()=>{
 const x=await fixture({register:false});await assert.rejects(release(x),/S63_DELIVERY_DENIED/);
 const a=await fixture();await assert.rejects(sql('UPDATE s63.dataset_registry SET family='+q(randomUUID())+' WHERE dataset='+q(a.dataset)+';'),/S64_REGISTRY_IMMUTABLE/);
});
test('independent verifier refuses altered proof before calling database',async()=>{
 const x=await fixture(),p=await prepare(x);
 p.proof={...p.proof,signature:(p.proof.signature[0]==='A'?'B':'A')+p.proof.signature.slice(1)};
 await assert.rejects(verifier('s64_va').release(x.id,p),/S63_BAD_SIGNATURE/);
 assert.equal(await sql('SELECT count(*) FROM s63.deliveries WHERE request_id='+q(x.id)+';'),'0');
});

function directCommit(x, p, expires, head=q(x.head)) {
 const derivatives=sha(p.snapshot.derivatives.map(row=>row.source_digest+':'+row.digest).join(','));
 const values=[q(x.id),q(x.grant),String(p.snapshot.grant.revision),head,q(p.proof.claims.snapshot_digest),
   q(p.proof.claims.key_id),q(derivatives),q(sha('synthetic test artifact')),String(p.snapshot.derivatives.length),expires];
 return 'SELECT s63.commit_delivery('+values.join(',')+');';
}
test('database refuses invalid proof deadlines through the mapped verifier',async()=>{
 const x=await fixture(), p=await prepare(x);
 for(const expires of ['NULL',q('infinity'),q('-infinity'),"clock_timestamp()-interval '1 second'","clock_timestamp()+interval '60 seconds'"]){
  assert.equal(await sql(directCommit(x,p,expires),'s64_va'),'f',expires);
 }
 assert.equal(await sql('SELECT count(*) FROM s63.deliveries WHERE request_id='+q(x.id)+';'),'0');
 assert.equal((await verifier('s64_va').release(x.id,p)).manifest.records,1);
});

test('database requires the expected chain head even for the mapped verifier',async()=>{
 const x=await fixture(), p=await prepare(x);
 assert.equal(await sql(directCommit(x,p,q(p.proof.claims.expires_at),'NULL'),'s64_va'),'f');
 assert.equal(await sql('SELECT count(*) FROM s63.deliveries WHERE request_id='+q(x.id)+';'),'0');
 assert.equal((await verifier('s64_va').release(x.id,p)).manifest.records,1);
});

test('separate registered families do not share a split assignment',async()=>{
 const a=await fixture(), b=await fixture({role:'s63_b',group:a.group,purpose:'training'});
 const first=await release(a), second=await release(b);
 assert.equal(first.manifest.purpose,'evaluation');
 assert.equal(second.manifest.purpose,'training');
 assert.equal(await sql('SELECT count(*) FROM s63.family_groups WHERE patient_group='+q(a.group)+';'),'2');
});

test('acquisition and verification run in different processes and reject each other’s SCRAM credential',async()=>{
 const x=await fixture();
 assert.equal(await sql("SELECT pg_has_role('s63_a','s64_verifiers','MEMBER') OR pg_has_role('s64_va','s63_workers','MEMBER');"),'f');
 const acquired=await lab.runS64Process('s63_a',{request:x.id});
 assert.equal(acquired.output.request.id,x.id);
 const prepared={snapshot:acquired.output,proof:signer.attest(acquired.output)};
 const released=await lab.runS64Process('s64_va',{request:x.id,prepared,
   publicKey:signer.publicKey.export({format:'der',type:'spki'}).toString('base64'),pseudonymSecret:secret.toString('hex')});
 assert.equal(released.output.manifest.records,1);
 const [a]=acquired.identity, [v]=released.identity;
 assert.deepEqual([a.login,a.acquire,a.commit],['s63_a',true,false]);
 assert.deepEqual([v.login,v.acquire,v.commit],['s64_va',false,true]);
 assert.equal(new Set([process.pid,acquired.pid,released.pid]).size,3);
 assert.notEqual(a.backend,v.backend);
 assert.equal(acquired.peerCredentialRejected,true);
 assert.equal(released.peerCredentialRejected,true);
 console.log('S64_PROCESS_AND_SCRAM_SEPARATION','acquisition',acquired.pid,a.backend,'verifier',released.pid,v.backend);
});
