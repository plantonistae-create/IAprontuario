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
 const html=file('index.html'),worker=file('sw.js');
 const version=html.match(/nexa-radar-controller\.js\?v=(20261107-[a-z0-9-]+)/)?.[1];
 assert.ok(version,'current controller must be versioned');
 assert.ok(html.includes('nexa-radar.css?v='+version),'CSS and controller must be released together');
 assert.ok(worker.includes('nexa-v18-15-0-'+version),'Service Worker must use the same release token');
});
