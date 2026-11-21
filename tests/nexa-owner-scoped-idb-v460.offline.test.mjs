import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const v2=readFileSync(new URL('../nexa-owner-scoped-idb-v460.js',import.meta.url),'utf8');
// The GitHub test file resides in tests/, hence ../ for the three imports.
const A='11111111-1111-4111-8111-111111111111';
const E='33333333-3333-4333-8333-333333333333';
function isolated(open){const window={};vm.runInNewContext(v2,{window,indexedDB:{open},structuredClone,JSON,Error,Promise,Object,Array});return window.nexaOwnerScopedIDB460;}

test('V4.60 names owner-scoped store and retains legacy store',()=>{
 assert.match(v2,/const LEGACY='encounters',STORE='encounters_owner_v2'/);
 assert.match(v2,/VERSION=2/);
 assert.match(v2,/keyPath:\['owner_user_id','encounter_id'\]/);
});
test('V1 migration uses one versionchange transaction and never deletes old drafts',()=>{
 assert.match(v2,/req\.onupgradeneeded=/);
 assert.match(v2,/const src=tx\.objectStore\(LEGACY\),dest=tx\.objectStore\(STORE\)/);
 assert.match(v2,/dest\.add\(item\)/);
 assert.doesNotMatch(v2,/deleteObjectStore|\.clear\(|\.delete\(/);
});
test('invalid legacy owner aborts entire upgrade',()=>{
 assert.match(v2,/!valid\(item\.owner_user_id\)/);
 assert.match(v2,/c\.primaryKey!==item\.encounter_id/);
 assert.match(v2,/\{tx\.abort\(\);return;\}/);
});
test('blocked DB upgrade terminates in explicit error',async()=>{
 let request;
 const db=isolated(()=>{request={};queueMicrotask(()=>request.onblocked());return request});
 await assert.rejects(db.get(E,A),/OWNER_SCOPED_UPGRADE_BLOCKED/);
});
test('transport failure cannot be mistaken for a successful checkpoint',async()=>{
 let request;
 const db=isolated(()=>{request={};queueMicrotask(()=>request.onerror());return request});
 await assert.rejects(db.get(E,A),/OWNER_SCOPED_OPEN_FAILED/);
});
test('owner and encounter UUID are both mandatory for every lookup',async()=>{
 const db=isolated(()=>{throw Error('SHOULD_NOT_OPEN')});
 await assert.rejects(db.get(E,''),/OWNER_SCOPED_KEY_INVALID/);
 await assert.rejects(db.get('legacy-ID',A),/OWNER_SCOPED_KEY_INVALID/);
});
test('transactional CAS requires same owner and encounter',()=>{
 assert.match(v2,/verify\(expected,owner\);verify\(item,owner\)/);
 assert.match(v2,/expected\.encounter_id!==item\.encounter_id/);
 assert.match(v2,/match\(req\.result,expected\)/);
 assert.match(v2,/tx\.oncomplete=.*resolve\(accepted\)/);
});
test('list reads use owner index rather than all owner records',()=>{
 assert.match(v2,/\.index\('owner_user_id'\)\.getAll\(owner\)/);
 assert.match(v2,/rows\.forEach\(r=>verify\(r,owner\)\)/);
});
test('legacy upgrade can only add records, never silently overwrite',()=>{
 assert.match(v2,/dest\.add\(item\)/);
 assert.doesNotMatch(v2,/dest\.put\(item\)/);
});
test('provider has no network, SQL or server-data path',()=>{
 assert.doesNotMatch(v2,/fetch\(|XMLHttpRequest|service_role|supabase\.co|\.from\('consultation_history'\)/i);
});
