import fs from 'node:fs';
import assert from 'node:assert/strict';
const code=fs.readFileSync(new URL('../nexa-audit-outbox-v18.9.19.js',import.meta.url),'utf8');
for(const token of ['indexedDB.open','reset_safety_net','manual_early_submit','idempotency_key','owner_user_id','snapshot_version','audit_submission_snapshot','learning_layers','audit_corrected','nexa:audit-outbox-queued','nexa:audit-submission-deduplicated'])assert.ok(code.includes(token),`missing ${token}`);
for(const sel of ['#resetBtn','#nexaRadarResetBtn','#nfClear','#nfTopClear','#nexaNewCaseBtn','#submitAuditBtn'])assert.ok(code.includes(sel),`missing ${sel}`);
new Function(code);
console.log('NEXA Audit outbox contract: PASS');
