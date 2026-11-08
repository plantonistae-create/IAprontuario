import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRealtimeOfferForm} from '../supabase/functions/_shared/nexa-realtime-multipart.mjs';

test('Realtime SDP and session are literal multipart fields, without file classification',async()=>{
 const sdp='v=0\r\ns=synthetic-offer\r\n',session={type:'realtime',model:'synthetic-model'};
 const form=createRealtimeOfferForm(sdp,session);
 assert.equal(form.get('sdp'),sdp);
 assert.equal(form.get('session'),JSON.stringify(session));
 const wire=await new Request('https://example.invalid/fixture-only',{method:'POST',body:form}).text();
 for(const field of ['sdp','session']){
  const header=wire.match(new RegExp('Content-Disposition: form-data; name="'+field+'"[^\\r\\n]*'))?.[0];
  assert.ok(header,field+' multipart field is required');
  assert.doesNotMatch(header,/filename=/i,'the provider contract specifies a string field');
 }
 assert.ok(!wire.includes('offer.sdp')&&!wire.includes('session.json'));
});

test('Realtime function uses the tested builder; fallback and status-only metrics remain',()=>{
 const src=readFileSync(new URL('../supabase/functions/realtime-call/index.ts',import.meta.url),'utf8');
 assert.match(src,/createRealtimeOfferForm\(sdp, session\)/);
 assert.match(src,/emitRealtimeUpstreamStatus\("webrtc", upstream\.status\)/);
 assert.match(src,/async function transcribeFallback\(/);
 assert.match(src,/error:\s*"REALTIME_SESSION_FAILED"/);
});
