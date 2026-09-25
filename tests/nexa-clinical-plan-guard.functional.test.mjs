import fs from 'node:fs';
import assert from 'node:assert/strict';

class ClassList{constructor(){this.s=new Set()}contains(x){return this.s.has(x)}add(x){this.s.add(x)}remove(x){this.s.delete(x)}}
class El{
  constructor(id=''){this.id=id;this.disabled=false;this.readOnly=false;this.value='';this.classList=new ClassList();this.attrs={}}
  closest(sel){return sel==='button'&&this.id?this:null}
  setAttribute(k,v){this.attrs[k]=v}
  removeAttribute(k){delete this.attrs[k]}
  addEventListener(){}
}
const ids=['generateExamsBtn','generatePrescriptionBtn','generateBothPlanBtn','applyRxMissingDataBtn','confirmHypothesisBtn','editHypothesisBtn','undefinedHypothesisBtn','applyEditedHypothesisBtn','resetBtn'];
const els=Object.fromEntries(ids.map(id=>[id,new El(id)]));
const hyp=new El('hyp');
const body=new El('body');
const listeners={};
globalThis.document={
  body,
  getElementById:id=>els[id]||null,
  querySelector:sel=>sel.includes('hipotese_diagnostica')?hyp:null,
  addEventListener:(type,cb)=>{(listeners[type]||(listeners[type]=[])).push(cb)}
};
globalThis.queueMicrotask=queueMicrotask;

const pending=[];
function abortError(){const e=new Error('aborted');e.name='AbortError';return e}
async function nativeFetch(input,init={}){
  if(!String(input).includes('/functions/v1/clinical-plan'))return {ok:true,passthrough:true,json:async()=>({ok:true})};
  return await new Promise((resolve,reject)=>{
    const rec={input,init,resolve,reject};pending.push(rec);
    init.signal?.addEventListener('abort',()=>reject(abortError()),{once:true});
  });
}
globalThis.window={fetch:nativeFetch};

const code=fs.readFileSync(new URL('../nexa-clinical-plan-guard-v18.9.12.js',import.meta.url),'utf8');
new Function(code)();
const guard=window.nexaClinicalPlanGuard18912;
assert.ok(guard,'guard não inicializado');
assert.equal(guard.busy,false);

// Non-plan traffic must remain untouched.
const passthrough=await window.fetch('/functions/v1/other');
assert.equal(passthrough.passthrough,true);

// First plan request becomes active and locks the clinical controls.
const first=window.fetch('/functions/v1/clinical-plan',{method:'POST'});
await Promise.resolve();
assert.equal(guard.busy,true);
assert.equal(els.generateExamsBtn.disabled,true);
assert.equal(els.generatePrescriptionBtn.disabled,true);
assert.equal(els.generateBothPlanBtn.disabled,true);
assert.equal(els.applyRxMissingDataBtn.disabled,true);
assert.equal(hyp.readOnly,true);

// A newer programmatic request supersedes the older one instead of allowing stale overwrite.
const second=window.fetch('/functions/v1/clinical-plan',{method:'POST'});
await assert.rejects(first,/substituída por uma solicitação mais recente/);
assert.equal(pending.length,2);
pending[1].resolve({ok:true,status:200,json:async()=>({exames:['RX'],prescricao:[{principio_ativo:'A'}]})});
const response=await second;
assert.deepEqual(await response.json(),{exames:['RX'],prescricao:[{principio_ativo:'A'}]});
await new Promise(r=>setTimeout(r,5));
assert.equal(guard.busy,false);
assert.equal(hyp.readOnly,false);

// Context invalidation cancels an in-flight plan with a comprehensible error.
const third=window.fetch('/functions/v1/clinical-plan',{method:'POST'});
await Promise.resolve();
guard.cancel('hypothesis-changed');
await assert.rejects(third,/hipótese clínica foi alterada/);
await new Promise(r=>setTimeout(r,5));
assert.equal(guard.busy,false);

console.log('Clinical plan concurrency/context guard: PASS');
