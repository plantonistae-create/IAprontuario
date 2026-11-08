import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('two main tabs and accessible contradictions, audit, undo and evidence provenance',()=>{
 const s=file('nexa-radar-controller.js');
 for(const marker of ['>Perguntas</button>','>Alertas</button>','id="ngUndoLast"','id="ngReviewAlerts"','Evidências e origem','falante não confirmado','confiança não aferida','clinicalAudit'])assert.ok(s.includes(marker),marker);
 assert.doesNotMatch(s,/id="transcriptLivePane"/);
});
test('risk colors are reserved for active danger, amber for uncertain prior alert',()=>{
 assert.match(file('nexa-radar.css'),/\.ng-alert-banner\{background:#fff0f2/);
 assert.match(file('nexa-radar.css'),/\.ng-review-banner\{background:#fff5e6/);
});
test('controller, CSS and service worker share release token',()=>{
 assert.match(file('index.html'),/nexa-radar-controller\.js\?v=20261107-clinical-ledger-p0/);
 assert.match(file('index.html'),/nexa-radar\.css\?v=20261107-clinical-ledger-p0/);
 assert.match(file('sw.js'),/nexa-v18-15-0-20261107-clinical-ledger-p0/);
});
