import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { startPostgresLab, q } from './helpers/s63-postgres-lab.mjs';
import { createLabTrustStore, ephemeralLabSigner, sha } from '../labs/nexa-s63/proof.LAB-ONLY.mjs';
import { createLabExporter } from '../labs/nexa-s63/export.LAB-ONLY.mjs';
import { postgresLabWorker } from '../labs/nexa-s63/postgres.LAB-ONLY.mjs';

let lab, signer, trust, make, sql;
let dataset = 0;
const owners = { s63_a: '11111111-1111-4111-8111-111111111111', s63_b: '22222222-2222-4222-8222-222222222222' };
const provenance = { origin:'synthetic',generator:'s63-fixture',version:'1' };
const kind = { asr:'transcript_final',documentation:'clinical_fields',radar:'radar' };
const derived = { asr:{text:'Enunciado fictício aprovado.'}, documentation:{fields:{hda:'Campo fictício.'}}, radar:{signals:['synthetic_review']} };

before(async () => {
  lab = await startPostgresLab();
  console.log('S63_POSTGRES_SOCKET_ONLY',lab.version,'PID',lab.pid,'zero_ipv4_ipv6');
  sql = lab.sql;
  signer = ephemeralLabSigner();
  trust = createLabTrustStore();
  const keyId = trust.pin(signer.publicKey);
  await sql('INSERT INTO s63.signing_keys(id) VALUES('+q(keyId)+');');
  const secret = randomBytes(32);
  make = (role = 's63_a', overrides = {}) => createLabExporter({
    database:postgresLabWorker(statement=>sql(statement,role)), signer, trust, pseudonymSecret:secret, ...overrides,
  });
});
after(async () => {
  if (lab) { await lab.dispose(); console.log('S63_CLUSTER_REMOVED'); }
});

function append(scope, name, payload) {
  return 'SELECT s63.append_fixture('+[scope.owner,scope.encounter,name].map(q).join(',')+','+q(payload)+'::jsonb);';
}
async function material({ worker='s63_a', group=randomUUID(), sourceProvenance=provenance }={}) {
  const scope = { worker, owner:owners[worker], encounter:randomUUID(), group };
  await sql('INSERT INTO s63.materials(owner_id,encounter_id,patient_group,worker) VALUES('+
    [scope.owner,scope.encounter,group,worker].map(q).join(',')+');');
  for (const name of Object.values(kind)) {
    // PostgreSQL preserves numeric scale, unlike a JSON round trip through JS.
    const payload = '{"notes":"RAW LAB ONLY","number":1.2300,"provenance":'+JSON.stringify(sourceProvenance)+'}';
    scope.head = await sql(append(scope,name,payload));
  }
  return scope;
}
async function request(scope, {task='asr',purpose='evaluation',modality=task==='asr'?'text':'structured',
  set='synthetic-test-'+(++dataset), allow=true, review=true, output=derived[task], ttl=300}={}) {
  const id = randomUUID();
  await sql('INSERT INTO s63.requests VALUES('+[id,scope.owner,scope.encounter,scope.head,task,purpose,modality,'s63-synthetic-v1',set].map(q).join(',')+');');
  const args = scopeBase(scope);
  let grant;
  if (allow) {
    await sql('SELECT s63.approve_right('+q(id)+", 'fixture:approved', clock_timestamp()-interval '1 minute',"+
      'clock_timestamp()+make_interval(secs=>'+ttl+'));','s63_reviewer');
    grant = await sql('SELECT s63.issue_right('+q(id)+');','s63_issuer');
  }
  if (review) {
    const record = await sql('SELECT record_digest FROM s63.records WHERE (owner_id,encounter_id)=('+args+') AND kind='+q(kind[task])+';');
    await sql('SELECT s63.review_derivative('+[id,record,JSON.stringify(output)].map(q).join(',')+');','s63_reviewer');
  }
  return { id,grant };
}
const scopeBase = scope => [q(scope.owner)+'::uuid',q(scope.encounter)+'::uuid'].join(',');

async function release(worker, id) { return worker.release(id,await worker.prepare(id)); }
async function waitForCommitLock() {
  for (let i=0;i<55;i++) {
    const waiting = await sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE query LIKE 'SELECT s63.commit_delivery(%' AND wait_event_type='Lock');");
    if (waiting==='t') return;
    await delay(40);
  }
  throw Error('S63_DB_LOCK_NOT_OBSERVED');
}

test('six synthetic manifests bind content and metadata, preserve canonical scale and hide source identifiers', async () => {
  const a = await material(), b = await material({worker:'s63_b'});
  const set = 'synthetic-six-artifacts';
  const workers = {evaluation:make(),training:make('s63_b')};
  for (const purpose of Object.keys(workers)) {
    const scope = purpose==='evaluation'?a:b;
    const worker = workers[purpose];
    for (const task of Object.keys(kind)) {
      const {id} = await request(scope,{task,purpose,set});
      const prepared = await worker.prepare(id);
      assert(prepared.snapshot.records.every(row=>row.payload_canonical.includes('1.2300')));
      const result = await worker.release(id,prepared);
      assert.deepEqual([result.manifest.task,result.manifest.purpose,result.manifest.records,
        result.manifest.synthetic_only,result.manifest.clinical_audio],[task,purpose,1,true,false]);
      assert.equal(result.manifest.content_sha256,sha(result.jsonl));
      const serialized = JSON.stringify(result);
      for (const internal of [id,scope.owner,scope.encounter,scope.group,scope.head,'RAW LAB ONLY',
        ...prepared.snapshot.records.map(row=>row.record_digest)]) assert(!serialized.includes(internal));
      assert.equal(await worker.approveIngestion(id,result),true);
      const relabeled = structuredClone(result);
      relabeled.manifest.purpose = purpose==='training'?'evaluation':'training';
      await assert.rejects(worker.approveIngestion(id,relabeled),/S63_ARTIFACT_INVALID/);
      await assert.rejects(worker.approveIngestion(id,{...result,jsonl:'Outro conteúdo fictício'}),/S63_ARTIFACT_INVALID/);
    }
  }
});

test('signed envelope refuses bad signature, wrong issuer/audience/nonce, expired claims and payload/head swaps', async () => {
  const scope = await material();
  const {id} = await request(scope);
  const worker = make(), good = await worker.prepare(id);
  const edit = mut => { const copy=structuredClone(good); mut(copy); return copy; };
  await assert.rejects(worker.release(id,edit(copy=>{
    const sig = copy.proof.signature;
    copy.proof.signature = (sig[0]==='A'?'B':'A')+sig.slice(1);
  })),/S63_BAD_SIGNATURE/);
  for (const field of ['issuer','audience','environment','nonce']) {
    await assert.rejects(worker.release(id,edit(x=>{ x.proof.claims[field]='wrong'; })),/S63_PROOF_SCOPE/);
  }
  for (const field of ['owner_id','encounter_id','head']) {
    await assert.rejects(worker.release(id,edit(x=>{ x.proof.claims[field]='wrong'; })),/S63_BAD_SIGNATURE/);
  }
  const expired = make('s63_a',{clock:()=>Date.parse(good.proof.claims.expires_at)});
  await assert.rejects(expired.release(id,good),/S63_PROOF_EXPIRED_OR_FUTURE/);
  await assert.rejects(worker.release(id,edit(x=>{x.snapshot.records[0].payload_canonical='{"notes":"changed"}';})),/S63_CHAIN_INVALID/);
  await assert.rejects(worker.release(id,edit(x=>{x.snapshot.derivatives[0].payload_canonical='{"text":"swapped"}';})),/S63_DERIVATIVE_INVALID/);
  await assert.rejects(worker.release(id,edit(x=>{x.snapshot.grant.revision+=1;})),/S63_PROOF_SNAPSHOT_MISMATCH/);
  await assert.rejects(worker.release(id,edit(x=>{x.snapshot.request.task='radar'; x.snapshot.request.modality='structured';})),/S63_PROOF_SNAPSHOT_MISMATCH/);
  await assert.rejects(worker.release(randomUUID(),good),/S63_PROOF_SCOPE/);
  assert.equal(await sql('SELECT count(*) FROM s63.deliveries WHERE request_id='+q(id)+';'),'0');
});

test('real SCRAM roles cannot access another owner, read raw tables, or issue and review their own rights', async () => {
  const b = await material({worker:'s63_b'});
  const {id} = await request(b);
  assert.equal(await sql('SELECT session_user;', 's63_a'),'s63_a');
  assert.equal(await sql('SELECT session_user;', 's63_b'),'s63_b');
  assert.equal(await sql("SELECT NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls FROM pg_roles WHERE rolname='s63_owner';"),'t');
  assert.equal(await sql("SELECT count(*)=11 AND bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class WHERE relnamespace='s63'::regnamespace AND relkind='r';"),'t');
  for (const role of ['anon','authenticated','service_role','s63_a','s63_b']) {
    await assert.rejects(sql('SELECT payload FROM s63.records;',role),/permission denied/);
  }
  for (const role of ['anon','authenticated','service_role']) {
    await assert.rejects(sql('SELECT s63.acquire('+q(id)+');',role),/permission denied/);
  }
  await assert.rejects(sql('SELECT s63.issue_right('+q(id)+');','s63_b'),/permission denied/);
  await assert.rejects(sql('SELECT s63.review_derivative('+[id,'0'.repeat(64),'{}'].map(q).join(',')+');','s63_b'),/permission denied/);
  await assert.rejects(make().prepare(id),/S63_ACQUISITION_DENIED/);
  const good = await make('s63_b').prepare(id);
  await assert.rejects(make().release(id,good),/S63_DELIVERY_DENIED/);
  assert.equal((await make('s63_b').release(id,good)).manifest.records,1);
  const missing = await request(b,{task:'radar',allow:false});
  await assert.rejects(sql('SELECT s63.issue_right('+q(missing.id)+');','s63_issuer'),/S63_RIGHT_REVIEW_REQUIRED/);
});

test('rights do not cross task, purpose, modality or material head; patient split spans encounters', async () => {
  const a = await material();
  const allowed = await request(a,{set:'synthetic-split'});
  assert.equal((await release(make(),allowed.id)).manifest.purpose,'evaluation');
  for (const options of [{task:'radar'},{purpose:'training'},{modality:'audio',review:false}]) {
    const denied=await request(a,{...options,allow:false});
    await assert.rejects(make().prepare(denied.id),/S63_ACQUISITION_DENIED/);
  }
  const audio = await request(a,{modality:'audio',review:false});
  await assert.rejects(make().prepare(audio.id),/S63_ACQUISITION_DENIED/);
  const otherEncounter = await material({group:a.group});
  const train = await request(otherEncounter,{purpose:'training',set:'synthetic-split'});
  await assert.rejects(release(make(),train.id),/S63_DELIVERY_DENIED/);
});

test('validation refuses unreviewed or unsafe derivatives and unauthorized provenance', async () => {
  const a = await material();
  const noReview=await request(a,{review:false});
  await assert.rejects(release(make(),noReview.id),/S63_DERIVATIVE_COVERAGE/);
  const unsafe=await request(a,{purpose:'training',output:{text:'Contato ficticio@example.invalid'}});
  await assert.rejects(release(make(),unsafe.id),/S63_DERIVATIVE_UNSAFE/);
  const wrong = await material({sourceProvenance:{origin:'third_party',generator:'unknown',version:'1'}});
  const notLicensed=await request(wrong,{purpose:'training'});
  await assert.rejects(release(make(),notLicensed.id),/S63_PROVENANCE_NOT_AUTHORIZED/);
  const wrongSchema=await request(a,{task:'documentation',output:{fields:{hda:'Texto',owner_id:a.owner}}});
  await assert.rejects(release(make(),wrongSchema.id),/S63_DERIVATIVE_UNSAFE/);
});

test('MVCC snapshot stays atomic while concurrent head advances and then rejects its stale delivery', async () => {
  const a=await material(), {id}=await request(a), worker=make();
  const finish=await lab.holdTransaction(append(a,'transcript_final',JSON.stringify({provenance})));
  try {
    const old=await worker.prepare(id);
    assert.deepEqual([old.snapshot.head,old.snapshot.records.length],[a.head,3]);
    const denied=assert.rejects(worker.release(id,old),/S63_DELIVERY_DENIED/);
    try { await waitForCommitLock(); } finally { await finish(); }
    await denied;
    await assert.rejects(worker.prepare(id),/S63_ACQUISITION_DENIED/);
  } catch (error) {
    await finish(false).catch(()=>{});
    throw error;
  }
});

test('concurrent revocation wins the decision lock and records monotonic grant events', async () => {
  const a=await material(), {id,grant}=await request(a), worker=make();
  const prepared=await worker.prepare(id);
  const finish=await lab.holdTransaction('SELECT s63.revoke_right('+q(grant)+');','s63_issuer');
  const denied=assert.rejects(worker.release(id,prepared),/S63_DELIVERY_DENIED/);
  try { await waitForCommitLock(); } finally { await finish(); }
  await denied;
  assert.equal(await sql("SELECT string_agg(action||':'||revision,',' ORDER BY revision) FROM s63.grant_events WHERE grant_id="+q(grant)+';'),
    'granted:1,revoked:2');
});

test('concurrent delivery consumes one nonce; revocation closes later ingestion and records the impacted artifact', async () => {
  const a=await material(), {id,grant}=await request(a), worker=make();
  const prepared=await worker.prepare(id);
  const results=await Promise.allSettled(Array.from({length:4},()=>worker.release(id,prepared)));
  assert.equal(results.filter(row=>row.status==='fulfilled').length,1);
  assert(results.filter(row=>row.status==='rejected').every(row=>row.reason.message==='S63_DELIVERY_DENIED'));
  const artifact=results.find(row=>row.status==='fulfilled').value;
  assert.equal(await worker.approveIngestion(id,artifact),true);
  assert.equal(await sql('SELECT s63.revoke_right('+q(grant)+');','s63_issuer'),'2');
  await assert.rejects(worker.approveIngestion(id,artifact),/S63_INGESTION_DENIED/);
  assert.equal(await sql("SELECT string_agg(action,',' ORDER BY event_id) FROM s63.delivery_events WHERE request_id="+q(id)+';'),
    'delivered,ingestion_approved,blocked');
});

test('expired rights are denied by the database clock even if the signature is still valid', async () => {
  const a=await material(), {id,grant}=await request(a,{ttl:1.5}), worker=make();
  const prepared=await worker.prepare(id);
  for (let i=0;i<50;i++) {
    const expired=await sql('SELECT expires_at<=clock_timestamp() FROM s63.grants WHERE id='+q(grant)+';');
    if (expired==='t') break;
    await delay(50);
  }
  await assert.rejects(worker.release(id,prepared),/S63_DELIVERY_DENIED/);
  await assert.rejects(worker.prepare(id),/S63_ACQUISITION_DENIED/);
});

test('key rotation rejects unpinned and revoked proof keys and blocks ingestion of affected artifacts', async () => {
  const a=await material(), revokedSigner=ephemeralLabSigner(), newSigner=ephemeralLabSigner(), ring=createLabTrustStore();
  await sql('INSERT INTO s63.signing_keys(id) VALUES('+q(revokedSigner.keyId)+'),('+q(newSigner.keyId)+');');
  ring.pin(revokedSigner.publicKey);
  const first=make('s63_a',{signer:revokedSigner,trust:ring});
  const {id}=await request(a);
  const delivered=await release(first,id);
  const pending=await request(a,{task:'documentation'});
  const old=await first.prepare(pending.id);
  const next=make('s63_a',{signer:newSigner,trust:ring});
  await assert.rejects(release(next,pending.id),/S63_UNTRUSTED_KEY/);
  await sql('UPDATE s63.signing_keys SET revoked_at=clock_timestamp() WHERE id='+q(revokedSigner.keyId)+';');
  await assert.rejects(first.release(pending.id,old),/S63_DELIVERY_DENIED/);
  await assert.rejects(first.approveIngestion(id,delivered),/S63_INGESTION_DENIED/);
  ring.revoke(revokedSigner.keyId);
  await assert.rejects(first.release(pending.id,old),/S63_UNTRUSTED_KEY/);
  assert.throws(()=>ring.pin(revokedSigner.publicKey),/S63_KEY_REVOKED/);
  ring.pin(newSigner.publicKey);
  assert.equal((await release(next,pending.id)).manifest.task,'documentation');
});

test('rights require a finite approval window', async () => {
  const a=await material(), {id}=await request(a,{allow:false,review:false});
  await assert.rejects(sql('SELECT s63.approve_right('+q(id)+
    ", 'fixture:invalid', clock_timestamp(), 'infinity');",'s63_reviewer'),/check constraint/);
  await assert.rejects(sql('SELECT s63.issue_right('+q(id)+');','s63_issuer'),/S63_RIGHT_REVIEW_REQUIRED/);
});

test('the Radar derivative accepts only scalar synthetic signals', async () => {
  const a=await material(), {id}=await request(a,{task:'radar',output:{signals:[['synthetic_review']]}});
  await assert.rejects(release(make(),id),/S63_DERIVATIVE_UNSAFE/);
});
