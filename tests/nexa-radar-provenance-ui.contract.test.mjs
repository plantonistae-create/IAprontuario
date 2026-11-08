import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('provenance is explicit, text transcript remains hidden while recording',()=>{
 const s=read('nexa-radar-controller.js');for(const m of ['data-evidence-state','confidence:\'not_measured\'','ngTranscriptQuality','falante não confirmado','classifyEvidence(f,ledger[id]'])assert.ok(s.includes(m),m);
 assert.doesNotMatch(s,/id="transcriptLivePane"/);
});
test('color and cache rules align',()=>{
 const css=read('nexa-radar.css');
 assert.match(css,/\.ng-cyan/);assert.match(css,/data-evidence-state="confirmed_by_physician"/);assert.match(css,/data-quality="incomplete"/);
 assert.match(read('index.html'),/nexa-radar-controller\.js\?v=20261107-evidence-contract-p0/);
 assert.match(read('index.html'),/nexa-radar\.css\?v=20261107-evidence-contract-p0/);
 assert.match(read('sw.js'),/nexa-v18-15-0-20261107-evidence-contract-p0/);
});
