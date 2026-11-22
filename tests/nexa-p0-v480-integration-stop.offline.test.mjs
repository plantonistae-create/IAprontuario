import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// V4.80 integration contract: read-only synthetic checks; NOT a Gate C test.
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('audit ingress and browser dispatch stay fail-closed',()=>{
 const edge=read('supabase/functions/submit-audit-case/index.ts');
 assert.match(edge,/auditSubmissionBlockedPendingGateC\s*=\s*true/);
 assert.match(edge,/AUDIT_GATE_C_NO_GO/);
 const html=read('index.html');
 const start=html.indexOf('async function submitCurrentForAudit(){');
 const end=html.indexOf("$('submitAuditBtn').onclick=submitCurrentForAudit;",start);
 assert.ok(start>=0&&end>start);
 const handler=html.slice(start,end);
 assert.match(handler,/audit_gate_blocked/);
 assert.doesNotMatch(handler,/\bfetch\s*\(|\bconfirm\s*\(/);
 assert.match(html,/nexaP0PreparePersistedSourceBeforeAudio\(startEpoch\)/);
});

test('all four external AI adapters preserve pre-egress STOP',()=>{
 for(const name of ['process-consultation','realtime-call','realtime-radar','consultation-speakers']){
   assert.match(read('supabase/functions/'+name+'/index.ts'),/P0_PRE_EGRESS_GATE_C_NO_GO/,name);
 }
 const writer=read('supabase/functions/nexa-source-actions/index.ts');
 assert.match(writer,/DEPLOYED_SOURCE_ACTION_WRITER_AUTHORIZED\s*=\s*false/);
 assert.match(writer,/FINAL_REVIEW_ACK_READBACK_NOT_VERIFIED/);
});

test('outbox and historic replay cannot be silently reactivated',()=>{
 const outbox=read('nexa-audit-outbox-v18.9.19.js');
 assert.match(outbox,/AUDIT_GATE_C_LOCAL_STOP=true/);
 assert.match(outbox,/state:'blocked_gate_c'/);
 assert.match(outbox,/AUDIT_REAUTHORIZATION_REQUIRED/);
 const history=read('nexa-history-style-audit-v18.9.7.js');
 assert.match(history,/sendAudit\(_row\)\{throw new Error\('AUDIT_REAUTHORIZATION_REQUIRED'\)\}/);
});

test('ACK candidate and source metadata remain unverified',()=>{
 const sql=read('supabase/migrations/20261114190000_nexa_p0_source_action_writer_REVIEW_ONLY.sql');
 assert.match(sql,/STOP_WRITER176_ROLE_RLS_REVIEW_ONLY_NOT_AUTHORIZED/);
 assert.match(sql,/FINAL_REVIEW_SERVER_COMPLETENESS_NOT_PROVEN/);
 const ack=read('labs/nexa-audit-attestation/nexa-p0-ack-atomic-v2.REVIEW_ONLY.NOT_APPLIED.sql');
 assert.match(ack,/STOP_ACK_V2_REVIEW_ONLY_DB_AUTHORITY_NOT_PROVEN/);
 const c=read('supabase/functions/submit-audit-case/audit-contract.mjs');
 for(const phrase of ['immutable_submission:false','reviewed_documentation:false',
   "official_source:'unverified_client_snapshot'",'confirmed_by_physician:false'])assert.ok(c.includes(phrase),phrase);
});
