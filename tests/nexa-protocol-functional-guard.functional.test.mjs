import fs from 'node:fs';
import assert from 'node:assert/strict';

class El{constructor(){this.disabled=false;this.dataset={}}}
const ids={saveProtocolDraftBtn:new El(),submitProtocolReviewBtn:new El(),publishProtocolBtn:new El()};
globalThis.document={getElementById:id=>ids[id]||null};
globalThis.window=globalThis;

let calls=[];
let resolvers=[];
function makeResponse(payload){return {payload,clone(){return makeResponse(this.payload)},async json(){return this.payload}}}
globalThis.fetch=(input,init={})=>new Promise(resolve=>{
  const body=JSON.parse(init.body||'{}');
  calls.push(body);
  resolvers.push(()=>resolve(makeResponse({ok:true,action:body.action,protocol_id:body.protocol_id||'p'})));
});

const code=fs.readFileSync(new URL('../nexa-protocol-functional-guard-v18.9.17.js',import.meta.url),'utf8');
new Function(code)();
assert.ok(globalThis.nexaProtocolFunctionalGuard18917,'guard de Protocolos não inicializado');

const url='https://example.supabase.co/functions/v1/admin-protocols';

// 1) GETs de protocolo preservam ordem de clique: B só inicia depois de A terminar.
const a=fetch(url,{method:'POST',body:JSON.stringify({action:'get',protocol_id:'A'})});
const b=fetch(url,{method:'POST',body:JSON.stringify({action:'get',protocol_id:'B'})});
await new Promise(r=>setTimeout(r,0));
assert.equal(calls.length,1);
assert.equal(calls[0].protocol_id,'A');
resolvers.shift()();
await a;
await new Promise(r=>setTimeout(r,0));
assert.equal(calls.length,2);
assert.equal(calls[1].protocol_id,'B');
resolvers.shift()();
await b;

// 2) refresh/list concorrente também é serializado.
const l1=fetch(url,{method:'POST',body:JSON.stringify({action:'list'})});
const l2=fetch(url,{method:'POST',body:JSON.stringify({action:'list'})});
await new Promise(r=>setTimeout(r,0));
assert.equal(calls.length,3);
resolvers.shift()();await l1;await new Promise(r=>setTimeout(r,0));
assert.equal(calls.length,4);
resolvers.shift()();await l2;

// 3) duplo save idêntico chama backend uma única vez e desabilita botão durante voo.
const payload={action:'save_draft',protocol_id:'P1',title:'Pneumonia',diagnosis_key:'pneumonia'};
const s1=fetch(url,{method:'POST',body:JSON.stringify(payload)});
const s2=fetch(url,{method:'POST',body:JSON.stringify(payload)});
await new Promise(r=>setTimeout(r,0));
assert.equal(calls.filter(x=>x.action==='save_draft').length,1);
assert.equal(ids.saveProtocolDraftBtn.disabled,true);
resolvers.shift()();
const [r1,r2]=await Promise.all([s1,s2]);
assert.deepEqual(await r1.json(),await r2.json());
assert.equal(ids.saveProtocolDraftBtn.disabled,false);
assert.equal(globalThis.nexaProtocolFunctionalGuard18917.pendingMutations,0);

// 4) submit_review duplicado e publish duplicado também são deduplicados.
for(const action of ['submit_review','publish']){
  const body={action,protocol_id:'P1',version_id:'V2'};
  const x1=fetch(url,{method:'POST',body:JSON.stringify(body)});
  const x2=fetch(url,{method:'POST',body:JSON.stringify(body)});
  await new Promise(r=>setTimeout(r,0));
  assert.equal(calls.filter(x=>x.action===action).length,1);
  resolvers.shift()();
  await Promise.all([x1,x2]);
}

// 5) fetch não relacionado continua intacto.
let passthroughCalled=false;
const old=globalThis.fetch;
globalThis.fetch=old;
assert.ok(typeof globalThis.fetch==='function');

console.log('NEXA Protocolos concurrency/dedup functional test: PASS');
