import test from 'node:test';
import assert from 'node:assert/strict';
import {createRadarAdmissionGate} from '../supabase/functions/realtime-radar/admission-gate.mjs';
const a='a'.repeat(64),b='b'.repeat(64),c='c'.repeat(64),d='d'.repeat(64);
const keys=(userKey=a,tenantKey=b,encounterKey=c)=>({userKey,tenantKey,encounterKey});
test('visual and status changes never spend remote quota',()=>{
 const g=createRadarAdmissionGate({perUser:1,perTenant:1,perEncounter:1,now:()=>100});
 assert.equal(g.admit({kind:'visual'}).remoteCall,false);
 assert.equal(g.admit(keys()).allowed,true);
 assert.equal(g.admit({kind:'status'}).remoteCall,false);
 assert.equal(g.admit(keys()).allowed,false);
});
test('user, tenant, encounter caps are all enforced per isolate',()=>{
 const g=createRadarAdmissionGate({perUser:2,perTenant:3,perEncounter:1,now:()=>100});
 assert.equal(g.admit(keys()).allowed,true);
 assert.equal(g.admit(keys(a,b,d)).allowed,true);
 assert.equal(g.admit(keys(a,b,'e'.repeat(64))).allowed,false);
 assert.equal(g.admit(keys(d,b,'f'.repeat(64))).allowed,true);
 assert.equal(g.admit(keys(d,b,'0'.repeat(64))).allowed,false);
});
test('raw identifiable keys are rejected and full capacity fails closed',()=>{
 const g=createRadarAdmissionGate({maxSlots:3,now:()=>100});
 assert.throws(()=>g.admit(keys('doctor@example.com')),/BUDGET_INPUT_INVALID/);
 assert.throws(()=>g.admit({userKey:a,encounterKey:c}),/BUDGET_INPUT_INVALID/);
 assert.equal(g.admit(keys()).allowed,true);
 assert.equal(g.admit(keys(d,b,'f'.repeat(64))).reason,'BUDGET_CAPACITY');
});
test('rolling window refreshes without making any distributed persistence claim',()=>{
 let now=100;const g=createRadarAdmissionGate({windowMs:1000,perUser:1,now:()=>now});
 assert.equal(g.admit(keys()).allowed,true);assert.equal(g.admit(keys()).allowed,false);
 now=1100;assert.equal(g.admit(keys()).allowed,true);
});
