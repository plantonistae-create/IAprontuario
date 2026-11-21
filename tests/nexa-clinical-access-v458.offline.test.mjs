import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requireOwnerClinicalAccess, ClinicalAccessGateError } from '../supabase/functions/_shared/nexa-clinical-access-gate.mjs';
import { listOwnedHistory } from '../supabase/functions/_shared/nexa-clinical-history-list.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const ENCOUNTER = '33333333-3333-4333-8333-333333333333';
const capability = { id: A, access_status: 'active', clinical_access: true };
function mockRpc(data, error = null) {
  if (arguments.length === 0) data = true;
  const called = [];
  return { called, client: { rpc: async name => { called.push(name); return { data, error }; } } };
}
async function rejectsWith(args, code, status) {
  await assert.rejects(requireOwnerClinicalAccess(args), e =>
    e instanceof ClinicalAccessGateError && e.code === code && e.status === status);
}

test('clinical slot exists: authenticated owner can pass strict boolean gate', async () => {
  const {client,called} = mockRpc(true);
  assert.equal(await requireOwnerClinicalAccess({client,actor:A,capability}), true);
  assert.deepEqual(called, ['has_active_clinical_access']);
});
test('active profile without clinical slot is denied (403)', async () => {
  const {client,called} = mockRpc(false);
  await rejectsWith({client,actor:A,capability}, 'CLINICAL_ACCESS_REQUIRED', 403);
  assert.deepEqual(called, ['has_active_clinical_access']);
});
test('RPC reports error: not misclassified as disabled user (503)', async () => {
  await rejectsWith({client:mockRpc(null, {message:'synthetic transport failure'}).client,actor:A,capability},'CLINICAL_ACCESS_UNAVAILABLE',503);
});
test('RPC throws: fails closed, no raw server error leaks', async () => {
  const client={rpc:async()=>{throw new Error('SYNTHETIC_PRIVATE_MESSAGE');}};
  await rejectsWith({client,actor:A,capability},'CLINICAL_ACCESS_UNAVAILABLE',503);
});
test('RPC returns ambiguous or invalid data: never authorize', async () => {
  for (const data of [null,undefined,1,0,'true','false',{},[],[true],{access:true}]) {
    await rejectsWith({client:mockRpc(data).client,actor:A,capability},'CLINICAL_ACCESS_UNAVAILABLE',503);
  }
});
test('missing RPC, actor or invalid actor does not authorize', async () => {
  await rejectsWith({client:{},actor:A,capability},'CLINICAL_ACCESS_UNAVAILABLE',503);
  for (const actor of [null,'','bad',undefined]) {
    await rejectsWith({client:mockRpc().client,actor,capability},'UNAUTHORIZED',401);
  }
});
test('different doctor / missing capability cannot call clinical-slot RPC', async () => {
  for (const cap of [null,{}, {...capability,id:B}, {...capability,clinical_access:false}, {...capability,access_status:'disabled'}, {...capability,access_status:'pending'}]) {
    const mock=mockRpc(true);
    await rejectsWith({client:mock.client,actor:A,capability:cap},'CLINICAL_ACCESS_REQUIRED',403);
    assert.deepEqual(mock.called,[]);
  }
});
test('owner-only list returns metadata but never clinical fields after gate', async () => {
  const client=mockRpc(true).client;
  await requireOwnerClinicalAccess({client,actor:A,capability});
  const stamp='2026-11-20T13:40:00.000+00:00';
  const result=await listOwnedHistory({actor:A,capability,request:{action:'list',limit:1},
    listRows:async()=>[{id:'legacy_A',encounter_id:ENCOUNTER,user_id:A,
      created_at:stamp,updated_at:stamp,sync_version:1,status:'draft',encounter_state:'draft',
      fields:{hda:'SYNTHETIC_PRIVATE_TEXT_MUST_NOT_LIST'}}]});
  assert.equal(result.items.length,1);
  assert.equal(result.scope,'authenticated_owner_only');
  assert.equal(result.content_included,false);
  assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_PRIVATE_TEXT_MUST_NOT_LIST/);
});
test('HTTP adapter is wired before list/readback and catches the guard error', () => {
  const code=readFileSync(new URL('../supabase/functions/nexa-clinical-text-readback/index.ts',import.meta.url),'utf8');
  const check=code.indexOf('await requireOwnerClinicalAccess({');
  const list=code.indexOf("if (body?.action === 'list')");
  const read=code.indexOf('await readVerifiedTextPackage({');
  assert.ok(check>0 && list>check && read>check);
  assert.match(code,/rpc\('get_my_capabilities'\)/);
  assert.match(code,/auth\.getUser\(\)/);
  assert.match(code,/instanceof ClinicalAccessGateError/);
  assert.match(code,/NEXA_TEXT_READBACK_ENABLED/);
  assert.match(code,/await readBoundedTextReadbackBody\(req\)/);
  assert.match(code,/\.eq\('encounter_id', encounter_id\)\.eq\('user_id', owner\)/);
  assert.doesNotMatch(code,/SUPABASE_SERVICE_ROLE_KEY|\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});

// Exercise the real candidate HTTP adapter in an isolated Node runtime. The
// Deno server registration and Supabase client are synthetic; no network I/O.
async function runSyntheticHttp({user=A,active=true,activeError=null,caps=capability}={}) {
  const source=readFileSync(new URL('../supabase/functions/nexa-clinical-text-readback/index.ts',import.meta.url),'utf8')
    .replace(/^import .*;\s*$/gm,'')
    .replace(/: Request\b/g,'')
    .replace(/status: number\b/g,'status')
    .replace(/body: unknown\b/g,'body')
    .replace(/canonical: string\b/g,'canonical');
  let handler;
  let reads=0;
  const calls=[];
  const origin='https://plantonistae-create.github.io';
  const Deno={env:{get:key=>({SUPABASE_URL:'https://synthetic.invalid',SUPABASE_ANON_KEY:'SYNTHETIC_PUBLIC_KEY',
    ALLOWED_ORIGIN:origin,NEXA_TEXT_READBACK_ENABLED:'synthetic-review-v1'})[key]??null},serve:cb=>{handler=cb}};
  const stamp='2026-11-20T13:40:00.000+00:00';
  const oneRow={id:'legacy_A',encounter_id:ENCOUNTER,user_id:A,created_at:stamp,updated_at:stamp,
    sync_version:1,status:'draft',encounter_state:'draft',fields:{hda:'SYNTHETIC_NEVER_LEAK'}};
  const createClient=(url,key,options)=>{
    assert.equal(url,'https://synthetic.invalid');
    assert.equal(key,'SYNTHETIC_PUBLIC_KEY');
    assert.match(options.global.headers.Authorization,/^Bearer /);
    return {auth:{getUser:async()=>({data:{user:user?{id:user}:null},error:user?null:{message:'SYNTHETIC_AUTH_DENIED'}})},
      rpc:async name=>{calls.push(name);if(name==='get_my_capabilities')return {data:[caps],error:null};
        if(name==='has_active_clinical_access')return {data:active,error:activeError};
        throw Error('UNEXPECTED_RPC');},
      from:table=>{reads++;assert.equal(table,'consultation_history');const query={
        select(){return query},eq(){return query},order(){return query},limit(){return query},
        gte(){return query},lt(){return query},or(){return query},
        then(onFulfilled,onRejected){return Promise.resolve({data:[oneRow],error:null}).then(onFulfilled,onRejected)}
      };return query;}
    };
  };
  const deps={Deno,createClient,
    readBoundedTextReadbackBody:async req=>req.json(),
    readVerifiedTextPackage:async()=>{throw Error('READBACK_NOT_REQUESTED')},
    TextReadbackError:class TextReadbackError extends Error{},
    listOwnedHistory,
    buildHistoryCursorFilter:()=>{throw Error('CURSOR_NOT_REQUESTED')},
    HistoryListError:class HistoryListError extends Error{},
    requireOwnerClinicalAccess,ClinicalAccessGateError,Response,TextEncoder,crypto:globalThis.crypto};
  new Function(...Object.keys(deps),source)(...Object.values(deps));
  assert.equal(typeof handler,'function');
  const req=new Request('https://synthetic.invalid/functions/v1/nexa-clinical-text-readback',{
    method:'POST',headers:{Origin:origin,Authorization:'Bearer SYNTHETIC_NOT_VALID_OUTSIDE_THIS_TEST',
      'Content-Type':'application/json'},body:JSON.stringify({action:'list',limit:1})});
  const result=await handler(req);
  return {status:result.status,body:await result.json(),calls,reads};
}

test('HTTP invalid JWT never invokes capability or database read',async()=>{
  const x=await runSyntheticHttp({user:null});
  assert.equal(x.status,401);assert.equal(x.body.error,'UNAUTHORIZED');
  assert.deepEqual(x.calls,[]);assert.equal(x.reads,0);
});
test('HTTP denies active profile without clinical slot before reading list',async()=>{
  const x=await runSyntheticHttp({active:false});
  assert.equal(x.status,403);assert.equal(x.body.error,'CLINICAL_ACCESS_REQUIRED');
  assert.deepEqual(x.calls,['get_my_capabilities','has_active_clinical_access']);
  assert.equal(x.reads,0);
});
test('HTTP approved owner lists only metadata after slot verification',async()=>{
  const x=await runSyntheticHttp();
  assert.equal(x.status,200);assert.equal(x.body.items.length,1);
  assert.equal(x.body.items[0].record_id,'legacy_A');
  assert.deepEqual(x.calls,['get_my_capabilities','has_active_clinical_access']);
  assert.equal(x.reads,1);
  assert.doesNotMatch(JSON.stringify(x.body),/SYNTHETIC_NEVER_LEAK|fields/);
});
