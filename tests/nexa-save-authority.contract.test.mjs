import assert from 'node:assert/strict';
import fs from 'node:fs';
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const history=fs.readFileSync(new URL('../nexa-history-style-audit-v18.9.7.js',import.meta.url),'utf8');
const nativeStart=index.indexOf('async function saveHistory(){');
const nativeEnd=index.indexOf("$('updateHistoryBtn').onclick=saveHistory;",nativeStart);
assert.ok(nativeStart>=0&&nativeEnd>nativeStart,'native saveHistory must exist');
const save=index.slice(nativeStart,nativeEnd);
assert.match(save,/const autosave=window\.nexaEncounterAutosave18101/);
assert.match(save,/autosave\.preserve\('manual_history_save',\{sync:false\}\)/);
assert.match(save,/await autosave\.flush\('manual_history_save'\)/);
assert.match(save,/latest\.sync_state==='synced'/);
assert.match(save,/CONFLICT_REQUIRES_REVIEW/);
assert.ok(save.indexOf('if(autosave?.preserve&&autosave?.flush&&autosave?.get)')>=0
 &&save.indexOf('if(autosave?.preserve&&autosave?.flush&&autosave?.get)')<save.indexOf("sb.from('consultation_history').update"),
 'legacy direct writes must be bypassed by canonical autosave when available');
const start=history.indexOf('async function syncLocalPending(){');
const end=history.indexOf('async function backfillStyle(',start);
assert.ok(start>=0&&end>start,'legacy pending mirror sync must exist');
const recover=history.slice(start,end);
assert.doesNotMatch(recover,/\.upsert\s*\(/,'legacy pending rows must not overwrite newer server data');
assert.doesNotMatch(recover,/\.update\s*\(/,'legacy pending rows must not update existing server data');
assert.match(recover,/\.select\('id,fields'\)/,'check server record before attempting insert');
assert.match(recover,/if\(existing\)/,'keep server version when server record exists');
assert.match(recover,/\.insert\(payload\)/,'an independent first-time legacy case may still be inserted');
console.log('NEXA canonical clinical save and legacy mirror non-overwrite contract: PASS');
