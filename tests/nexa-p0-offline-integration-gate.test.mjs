import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file = name => readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('integration is synthetic-only: main realtime transport stays unchanged',()=>{
 const main=file('supabase/functions/realtime-call/index.ts');
 const hosted=file('labs/nexa-realtime-v6/reference/index.ts.txt');
 const candidate=file('labs/nexa-realtime-v6/candidate/index.ts.txt');
 assert.match(main,/form\.append\(\s*"sdp"/);
 assert.match(hosted,/form\.append\(\s*"sdp"/);
 assert.match(candidate,/form\.set\("sdp", sdp\)/);
 assert.doesNotMatch(main,/createRealtimeOfferForm/);
 assert.match(main,/emitUsage\("realtime\.transcription"/);
 assert.doesNotMatch(hosted,/emitUsage\("realtime\.transcription"/);
 for(const src of [main,hosted,candidate])assert.match(src,/getAuthenticatedUser\(/);
});
test('integrated CI retains existing Radar and clinical guards',()=>{
 const pkg=JSON.parse(file('package.json'));
 assert.match(pkg.scripts.test,/nexa-radar-request-count\.test\.cjs/);
 assert.match(pkg.scripts.test,/nexa-realtime-v6-runtime-mocked\.test\.mjs/);
 assert.match(pkg.scripts.test,/nexa-webrtc-fallback-mocked-runtime\.test\.mjs/);
 assert.match(pkg.scripts.test,/nexa-cost-observed-delta\.test\.mjs/);
});
test('accounting tool does not make causal or verified-charge claims',()=>{
 const compare=file('scripts/nexa-cost-observed-delta.mjs');
 assert.match(compare,/savings_attributable_to_nexa_change_usd:null/);
 assert.match(compare,/provider_billing_verified_by_connector:false/);
});
