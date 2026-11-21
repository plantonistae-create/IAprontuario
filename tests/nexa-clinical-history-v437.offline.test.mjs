import test from 'node:test';
import assert from 'node:assert/strict';
import {listOwnedHistory,parseHistoryListRequest,buildHistoryCursorFilter,HistoryListError} from '../supabase/functions/_shared/nexa-clinical-history-list.mjs';
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222';
const en=['33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555'];
const timestamp='2026-11-20T13:40:00.000+00:00';
const make=(id,i=0)=>({id,encounter_id:en[i%3],user_id:A,created_at:timestamp,updated_at:timestamp,sync_version:1,status:'draft',encounter_state:'draft',fields:{hda:'PRIVATE_NEVER_LIST'}});
const cap={id:A,access_status:'active',clinical_access:true};
const run=(rows,request={action:'list',limit:2})=>listOwnedHistory({actor:A,capability:cap,request,listRows:async()=>rows});
const rejectCode=async(promise,code)=>assert.rejects(promise,e=>e instanceof HistoryListError&&e.code===code);

test('V4.37 accepts legacy text ID and preserves case without leaking clinical content', async()=>{
 const r=await run([make('legacy-Case_A'),make('550e8400-e29b-41d4-a716-446655440000'),make('old_20261120')]);
 assert.equal(r.items[0].record_id,'legacy-Case_A');
 assert.deepEqual(r.next_cursor,{created_at:timestamp,id:'550e8400-e29b-41d4-a716-446655440000'});
 assert.equal(r.content_included,false);assert.equal(r.audio_included,false);assert.equal(r.training_approved,false);
 assert.doesNotMatch(JSON.stringify(r),/PRIVATE_NEVER_LIST/);
});

test('V4.37 keyset tie does not duplicate or skip mixed text IDs',async()=>{
 const data=[make('old_Z',0),make('old_Y',1),make('old_X',2)];
 let cursor=null;const seen=[];
 do{
   const page=await listOwnedHistory({actor:A,capability:cap,request:{action:'list',limit:1,...(cursor?{cursor}:{})},listRows:async({cursor,limit})=>{
     const arr=data.filter(x=>!cursor||x.created_at<cursor.created_at||(x.created_at===cursor.created_at&&x.id<cursor.id));
     return arr.slice(0,limit+1);
   }});
   seen.push(...page.items.map(x=>x.record_id));cursor=page.next_cursor;
 }while(cursor);
 assert.deepEqual(seen,data.map(x=>x.id));
});

test('V4.37 rejects special grammar chars and never changes cursor case',()=>{
 const valid={created_at:timestamp,id:'Legacy-Case_X'};
 assert.equal(parseHistoryListRequest({action:'list',cursor:valid}).cursor.id,valid.id);
 assert.equal(buildHistoryCursorFilter(valid),'created_at.lt.'+timestamp+',and(created_at.eq.'+timestamp+',id.lt.Legacy-Case_X)');
 for(const id of ['legacy,another','legacy)or(id.eq.1','a.b','a:b','a b','é','', 'a'.repeat(257)]){
   assert.throws(()=>parseHistoryListRequest({action:'list',cursor:{created_at:timestamp,id}}),e=>e.code==='INVALID_HISTORY_CURSOR');
 }
});

test('V4.37 fails explicitly on unsupported persisted ID including lookahead',async()=>{
 await rejectCode(run([make('safe_A'),make('safe_B'),make('unsafe.dot')]),'HISTORY_ROW_ID_UNSUPPORTED');
 await rejectCode(run([make('invalid,id')]),'HISTORY_ROW_ID_UNSUPPORTED');
});

test('V4.37 rejects missing or invalid encounter identity',async()=>{
 await rejectCode(run([make('legacy_valid',0),{...make('legacy_null',1),encounter_id:null}]),'HISTORY_ROW_NOT_VERIFIED');
 await rejectCode(run([{...make('legacy_x'),encounter_id:'invalid'}]),'HISTORY_ROW_NOT_VERIFIED');
});

test('V4.37 retains owner-only capability boundary and checks lookahead owner',async()=>{
 await rejectCode(run([make('legacy_A'),make('legacy_B'),{...make('legacy_C'),user_id:B}]),'HISTORY_ROW_NOT_VERIFIED');
 await rejectCode(listOwnedHistory({actor:B,capability:cap,request:{action:'list'},listRows:async()=>[]}), 'CLINICAL_ACCESS_REQUIRED');
});
