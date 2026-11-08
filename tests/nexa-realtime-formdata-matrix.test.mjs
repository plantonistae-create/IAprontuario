// Compare multipart wire shapes in memory ONLY. Request is constructed, NEVER sent.
// The source is the frozen hosted v6 vs. the byte-reconciled candidate in the PR.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../labs/nexa-realtime-v6/',import.meta.url);
const src={hosted:readFileSync(new URL('reference/index.ts.txt',root),'utf8'),
           candidate:readFileSync(new URL('candidate/index.ts.txt',root),'utf8')};
const OFFER='v=0\r\ns=synthetic-offer\r\n';
const SESSION={type:'realtime',model:'synthetic-only',audio:{input:{transcription:{language:'pt'}}}};
function mockForm(kind){
  const form=new FormData();
  if(kind==='hosted'){
    form.append('sdp',new Blob([OFFER],{type:'application/sdp'}),'offer.sdp');
    form.append('session',new Blob([JSON.stringify(SESSION)],{type:'application/json'}),'session.json');
  }else if(kind==='candidate'){
    form.set('sdp',OFFER);
    form.set('session',JSON.stringify(SESSION));
  }else throw Error('UNKNOWN_MOCK');
  return form;
}
async function inspect(kind){
  const form=mockForm(kind);
  const request=new Request('https://example.invalid/NO_REQUEST_SENT',{
    method:'POST',body:form
  });
  const wire=await request.text();
  const dispositions=wire.split('\r\n').filter(s=>s.startsWith('Content-Disposition: form-data;'));
  const parts=Object.fromEntries(dispositions.map(s=>{
    const name=s.match(/name="([^"]+)"/)?.[1];
    if(!name)throw Error('MISSING_NAME');
    return [name,{has_filename:/;\s*filename=/.test(s),
      filename:s.match(/filename="([^"]+)"/)?.[1]??null}];
  }));
  assert.equal(Object.keys(parts).length,2);
  assert.deepEqual(Object.keys(parts).sort(),['sdp','session']);
  assert.match(request.headers.get('Content-Type'),/^multipart\/form-data;\s*boundary=/);
  assert.ok(wire.includes(OFFER));
  assert.ok(wire.includes(JSON.stringify(SESSION)));
  return {parts,wire,form};
}
test('frozen hosted source uses TWO file parts; synthetic on-wire form has filenames',async()=>{
  assert.match(src.hosted,/form\.append\(\s*"sdp"/);
  assert.match(src.hosted,/form\.append\(\s*"session"/);
  const a=await inspect('hosted');
  assert.equal(a.parts.sdp.filename,'offer.sdp');
  assert.equal(a.parts.session.filename,'session.json');
  assert.equal(a.parts.sdp.has_filename,true);
  assert.equal(a.parts.session.has_filename,true);
  assert.match(a.wire,/Content-Type: application\/sdp/);
  assert.match(a.wire,/Content-Type: application\/json/);
  assert.equal(typeof a.form.get('sdp'),'object');
});
test('candidate source uses TWO text fields; synthetic on-wire form omits filenames',async()=>{
  assert.match(src.candidate,/form\.set\("sdp", sdp\)/);
  assert.match(src.candidate,/form\.set\("session", JSON\.stringify\(session\)\)/);
  const a=await inspect('candidate');
  assert.equal(a.parts.sdp.filename,null);
  assert.equal(a.parts.session.filename,null);
  assert.equal(a.parts.sdp.has_filename,false);
  assert.equal(a.parts.session.has_filename,false);
  assert.equal(a.form.get('sdp'),OFFER);
  assert.equal(typeof a.form.get('session'),'string');
  assert.deepEqual(JSON.parse(a.form.get('session')),SESSION);
});
test('candidate/hosted body differs in field encoding, not clinical session text',async()=>{
  const hosted=await inspect('hosted'),candidate=await inspect('candidate');
  assert.equal(await hosted.form.get('sdp').text(),candidate.form.get('sdp'));
  assert.equal(await hosted.form.get('session').text(),candidate.form.get('session'));
  assert.equal(src.hosted.includes('CLINICAL_ACCESS_REQUIRED'),true);
  assert.equal(src.candidate.includes('CLINICAL_ACCESS_REQUIRED'),true);
  assert.equal(src.hosted.includes('emitRealtimeUpstreamStatus("webrtc", upstream.status)'),true);
  assert.equal(src.candidate.includes('emitRealtimeUpstreamStatus("webrtc", upstream.status)'),true);
});
test('reference curl-style multipart is also a possible text field with SDP MIME; not a causal proof',()=>{
  // Pure wire fixture, not curl execution: "sdp=<offer.sdp;type=application/sdp".
  const fake='Content-Disposition: form-data; name="sdp"\r\nContent-Type: application/sdp\r\n\r\n'+OFFER;
  assert.match(fake,/name="sdp"\r\nContent-Type: application\/sdp/);
  assert.doesNotMatch(fake,/filename=/);
  assert.equal(src.candidate.includes('new Blob('),src.hosted.includes('new Blob('),
    'fallback audio Blob is preserved; this is not a runtime comparison');
});
test('no real request, secret, invoice or patient payload is required by fixture',async()=>{
  const a=await inspect('candidate');
  for(const forbidden of ['sk-proj-','patient_id','encounter_id','Bearer ','https://api.openai.com']){
    assert.equal(a.wire.includes(forbidden),false);
  }
  assert.equal(typeof globalThis.fetch,'function','fetch exists but is never called');
});
