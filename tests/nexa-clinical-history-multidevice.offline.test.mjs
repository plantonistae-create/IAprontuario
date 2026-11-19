import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { listOwnedHistory, parseHistoryListRequest, HistoryListError } from '../supabase/functions/_shared/nexa-clinical-history-list.mjs';

const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const encounters=[
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555'
];
const rows=encounters.map((encounter_id,i)=>({
  id:encounter_id,encounter_id,user_id:A,
  created_at:`2026-11-${String(19-i).padStart(2,'0')}T13:40:00.000+00:00`,
  updated_at:`2026-11-${String(19-i).padStart(2,'0')}T14:41:00.000+00:00`,
  sync_version:2+i,status:'draft',encounter_state:'draft',
  fields:{hda:'SENSITIVE_SIMULATED_NEVER_LIST'},
  processing_meta:{transcript:'PRIVATE_SIMULATED'}
}));
const cap={id:A,access_status:'active',clinical_access:true};
const req={action:'list',limit:2};
const run=(overrides={})=>listOwnedHistory({
  actor:A,capability:cap,request:req,listRows:async()=>structuredClone(rows),...overrides
});
async function denied(promise,code){
  await assert.rejects(promise,e=>e instanceof HistoryListError&&e.code===code);
}

test('owner sees a bounded page with no sensitive fields or content',async()=>{
  const r=await run();
  assert.equal(r.items.length,2);
  assert.equal(r.has_more,true);
  assert.deepEqual(r.next_cursor,{created_at:rows[1].created_at,id:rows[1].id});
  assert.equal(r.training_approved,false);
  assert.equal(r.content_included,false);
  assert.ok(!JSON.stringify(r).includes('SENSITIVE_SIMULATED_NEVER_LIST'));
  assert.ok(!JSON.stringify(r).includes('PRIVATE_SIMULATED'));
});

test('all consultations can be paged without a 7-day restriction',async()=>{
  let page=0;
  const result=[];
  let cursor=null;
  do{
    const r=await run({
      request:{action:'list',limit:1,...(cursor?{cursor}:{})},
      listRows:async({cursor,limit})=>{
        const index=cursor?rows.findIndex(x=>x.id===cursor.id)+1:0;
        return rows.slice(index,index+limit+1);
      }
    });
    result.push(...r.items);
    cursor=r.next_cursor;
    if(++page>10)throw Error('PAGINATION_LOOP');
  }while(cursor);
  assert.deepEqual(result.map(x=>x.encounter_id),encounters);
});

test('separate browser session for same owner is scoped by authenticated identity',async()=>{
  const browserA=await run({listRows:async()=>structuredClone(rows)});
  const browserB=await run({listRows:async()=>structuredClone(rows)});
  assert.deepEqual(browserA.items,browserB.items);
  assert.equal(browserB.scope,'authenticated_owner_only');
});

test('a different owner never reads doctor A entries',async()=>{
  await denied(run({actor:B,capability:{...cap,id:B}}),'HISTORY_ROW_NOT_VERIFIED');
  await denied(run({capability:{...cap,id:B}}),'CLINICAL_ACCESS_REQUIRED');
  await denied(run({capability:{...cap,access_status:'disabled'}}),'CLINICAL_ACCESS_REQUIRED');
});

test('ambiguous or compromised database listing fails closed',async()=>{
  await denied(run({listRows:async()=>null}),'HISTORY_LIST_INVALID');
  await denied(run({listRows:async()=>rows.concat(rows)}),'HISTORY_LIST_INVALID');
  await denied(run({listRows:async()=>[{...rows[0],sync_version:'2'}]}),'HISTORY_ROW_NOT_VERIFIED');
  await denied(run({listRows:async()=>[{...rows[0],user_id:B}]}),'HISTORY_ROW_NOT_VERIFIED');
  await denied(run({listRows:async()=>[rows[0],rows[1],{...rows[2],user_id:B}]}),'HISTORY_ROW_NOT_VERIFIED');
});

test('filters and cursor accept only strict, bounded, non-injectable shapes',()=>{
  assert.equal(parseHistoryListRequest({action:'list'}).limit,25);
  assert.equal(parseHistoryListRequest({action:'list',limit:50}).limit,50);
  for(const input of [
    {action:'list',limit:51},
    {action:'list',limit:'20'},
    {action:'list',user_id:B},
    {action:'list',from_utc:'2026-11-19'},
    {action:'list',from_utc:'2026-11-20T00:00:00Z',until_utc:'2026-11-19T00:00:00Z'},
    {action:'list',cursor:{id:rows[0].id,created_at:'2026-11-19);DROP TABLE x;--'}},
    {action:'list',cursor:{id:rows[0].id,created_at:rows[0].created_at,owner_user_id:B}},
  ]) assert.throws(()=>parseHistoryListRequest(input),HistoryListError);
});

test('list metadata is incapable of silently claiming durable archive or AI consent',async()=>{
  const r=await run();
  assert.equal(r.audio_included,false);
  assert.equal(r.training_approved,false);
  assert.ok(r.note.includes('immutable archive not proven'));
  assert.ok(!('server_confirmed' in r));
});

test('HTTP adapter uses JWT + capabilities + RLS, no admin key, no writes',()=>{
  const adapter=readFileSync(new URL('../supabase/functions/nexa-clinical-text-readback/index.ts',import.meta.url),'utf8');
  assert.match(adapter,/auth\.getUser\(\)/);
  assert.match(adapter,/rpc\('get_my_capabilities'\)/);
  assert.match(adapter,/listOwnedHistory\(/);
  assert.match(adapter,/\.eq\('user_id', owner\)/);
  assert.match(adapter,/\.order\('created_at', \{ ascending: false \}\)/);
  assert.match(adapter,/\.order\('id', \{ ascending: false \}\)/);
  assert.match(adapter,/\.limit\(limit \+ 1\)/);
  assert.match(adapter,/\.or\(/);
  assert.match(adapter,/readBoundedTextReadbackBody\(req\)/);
  assert.match(adapter,/NEXA_TEXT_READBACK_ENABLED/);
  assert.doesNotMatch(adapter,/SUPABASE_SERVICE_ROLE_KEY|\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});

test('existing readback endpoint remains available and cannot be replaced with client-provided fields',()=>{
  const adapter=readFileSync(new URL('../supabase/functions/nexa-clinical-text-readback/index.ts',import.meta.url),'utf8');
  assert.match(adapter,/readVerifiedTextPackage\(\{/);
  assert.match(adapter,/\.eq\('encounter_id', encounter_id\)\.eq\('user_id', owner\)/);
  assert.match(adapter,/if \(body\?\.action === 'list'\)/);
});
