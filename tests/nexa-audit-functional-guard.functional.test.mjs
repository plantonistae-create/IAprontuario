import fs from 'node:fs';
import assert from 'node:assert/strict';

class StorageMock{
  constructor(){this.map=new Map()}
  get length(){return this.map.size}
  key(i){return [...this.map.keys()][i]??null}
  getItem(k){return this.map.has(k)?this.map.get(k):null}
  setItem(k,v){this.map.set(String(k),String(v))}
  removeItem(k){this.map.delete(String(k))}
}
class El{
  constructor(id=''){this.id=id;this.innerHTML='';this.textContent='';this.dataset={};this.style={};this.className='';this.children=[]}
  addEventListener(){}
  querySelector(){return null}
  querySelectorAll(){return[]}
  prepend(el){this.children.unshift(el)}
  closest(){return null}
}

const localStorage=new StorageMock();
localStorage.setItem('sb-auth-token',JSON.stringify({access_token:'token-123',user:{id:'user-1'}}));
localStorage.setItem('nexa-destination-state-v18915',JSON.stringify({recommended:'reavaliacao',final:'reavaliacao',status:'confirmed',source:'physician_confirmed',updated_at:'2026-09-11T20:00:00Z'}));
Object.defineProperty(globalThis,'localStorage',{value:localStorage,configurable:true});

const elements=new Map();
const documentElement=new El('html');
const document={
  readyState:'complete',documentElement,
  getElementById:id=>elements.get(id)||null,
  querySelector:()=>null,
  querySelectorAll:()=>[],
  createElement:tag=>new El(tag),
  addEventListener(){}
};
globalThis.document=document;
globalThis.MutationObserver=class{constructor(cb){this.cb=cb}observe(){}};
globalThis.CustomEvent=class{constructor(type,init={}){this.type=type;this.detail=init.detail}};
globalThis.setInterval=()=>1;globalThis.clearInterval=()=>{};

let capabilityMode='reviewer';
let submitCount=0,reviewCount=0,queueCount=0;
let capturedSubmit=null;
let submitResolve,reviewResolve,queue1Resolve,queue2Resolve;
const events=[];

function jsonResponse(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}})}
async function originalFetch(url,init={}){
  const u=String(url);
  if(u.includes('/rest/v1/rpc/get_my_capabilities')){
    if(capabilityMode==='reviewer')return jsonResponse([{clinical_access:true,is_admin:false,is_reviewer:true,access_status:'active'}]);
    if(capabilityMode==='admin')return jsonResponse([{clinical_access:true,is_admin:true,is_reviewer:true,access_status:'active'}]);
    return jsonResponse([{clinical_access:true,is_admin:false,is_reviewer:false,access_status:'active'}]);
  }
  if(u.includes('/rest/v1/consultation_history?')){
    return jsonResponse([{processing_meta:{destinationState:{recommended:'alta',final:'internacao',status:'altered',source:'physician',updated_at:'2026-09-11T20:10:00Z',recommendation_stale:false}}}]);
  }
  if(u.includes('/functions/v1/submit-audit-case')){
    submitCount++;capturedSubmit=JSON.parse(init.body||'{}');
    return await new Promise(resolve=>{submitResolve=()=>resolve(jsonResponse({ok:true}))});
  }
  if(u.includes('/rest/v1/rpc/get_audit_queue')){
    queueCount++;
    if(queueCount===1)return await new Promise(resolve=>{queue1Resolve=data=>resolve(jsonResponse(data))});
    if(queueCount===2)return await new Promise(resolve=>{queue2Resolve=data=>resolve(jsonResponse(data))});
    return jsonResponse([]);
  }
  if(u.includes('/rest/v1/rpc/submit_audit_review')){
    reviewCount++;
    return await new Promise(resolve=>{reviewResolve=()=>resolve(jsonResponse({ok:true}))});
  }
  return jsonResponse({});
}

globalThis.window={
  fetch:originalFetch,
  addEventListener(){},
  dispatchEvent:e=>events.push(e),
  nexaDestinationFlow18915:{state:{recommended:'reavaliacao',final:'reavaliacao',status:'confirmed',source:'physician_confirmed',updated_at:'2026-09-11T20:00:00Z'}}
};

const code=fs.readFileSync(new URL('../nexa-audit-functional-guard-v18.9.16.js',import.meta.url),'utf8');
new Function(code)();
const guard=window.nexaAuditFunctionalGuard18916;
assert.ok(guard,'guard de Auditoria não inicializado');

// 1) Permissões começam fail-closed e são elevadas somente após capabilities reais.
assert.equal(!!window.currentProf.is_admin,false);
await guard.refreshCapabilities();
assert.equal(window.currentProf.is_reviewer,true);
assert.equal(guard.capabilitiesReady,true);
capabilityMode='doctor';
assert.equal(await guard.refreshCapabilities(),false);
assert.equal(window.currentProf.is_reviewer,false);
assert.equal(window.currentProf.is_admin,false);
capabilityMode='reviewer';
await guard.refreshCapabilities();

// 2) Defesa adicional de desidentificação no lado do revisor.
const safe=guard.sanitizeAuditCase({
  id:'case-1',user_id:'secret-user',doctor_id:'secret-doctor',
  deidentified_fields:{nome_paciente:'João da Silva',cpf:'123.456.789-01',email:'joao@example.com',telefone:'(67) 99999-1234',hda:'Contato joao@example.com, CPF 123.456.789-01 e telefone (67) 99999-1234. Dor torácica.'}
});
assert.equal('user_id' in safe,false);
assert.equal('doctor_id' in safe,false);
assert.equal('nome_paciente' in safe.deidentified_fields,false);
assert.equal('cpf' in safe.deidentified_fields,false);
assert.match(safe.deidentified_fields.hda,/E-MAIL REMOVIDO/);
assert.match(safe.deidentified_fields.hda,/CPF REMOVIDO/);
assert.match(safe.deidentified_fields.hda,/TELEFONE REMOVIDO/);
assert.match(safe.deidentified_fields.hda,/Dor torácica/);

// 3) Envio inclui snapshot do Destino persistido no consultation_history e deduplica clique/request concorrente.
const submitUrl='https://fmkrcieubrlltiggyauc.supabase.co/functions/v1/submit-audit-case';
const init={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source_consultation_id:'history-1',fields:{hda:'Caso A'},core_context:{schema_version:'2'}})};
const s1=window.fetch(submitUrl,init);
const s2=window.fetch(submitUrl,init);
await new Promise(r=>setTimeout(r,0));
assert.equal(submitCount,1,'duplo envio concorrente deve compartilhar uma única chamada real');
submitResolve();
const [sr1,sr2]=await Promise.all([s1,s2]);
assert.equal(sr1.ok,true);assert.equal(sr2.ok,true);
assert.equal(capturedSubmit.core_context.destination.recommended,'alta');
assert.equal(capturedSubmit.core_context.destination.final,'internacao');
assert.equal(capturedSubmit.core_context.destination.status,'altered');
assert.equal(capturedSubmit.core_context.destination.source,'physician');
assert.equal(capturedSubmit.core_context.audit_submission_snapshot.immutable_submission,true);
assert.equal(capturedSubmit.core_context.audit_submission_snapshot.source_consultation_id,'history-1');
assert.ok(events.some(e=>e.type==='nexa:audit-submit-deduplicated'));

// 4) Fila: resposta antiga não pode prevalecer sobre refresh mais novo.
const q1=window.sb.rpc('get_audit_queue',{queue_status:null});
const q2=window.sb.rpc('get_audit_queue',{queue_status:null});
queue2Resolve([{id:'new-case',status:'pending',user_id:'hidden',deidentified_fields:{hda:'Novo caso',email:'novo@example.com'}}]);
await new Promise(r=>setTimeout(r,0));
queue1Resolve([{id:'old-case',status:'pending',deidentified_fields:{hda:'Caso antigo'}}]);
const [qr1,qr2]=await Promise.all([q1,q2]);
assert.equal(qr1.error,null);assert.equal(qr2.error,null);
assert.equal(qr1.data[0].id,'new-case');
assert.equal(qr2.data[0].id,'new-case');
assert.equal('user_id' in qr1.data[0],false);
assert.equal('email' in qr1.data[0].deidentified_fields,false);

// 5) Dupla submissão da mesma revisão é serializada por case_id.
const r1=window.sb.rpc('submit_audit_review',{case_id:'case-55',decision:'approved',corrected_fields:null,note:null});
const r2=window.sb.rpc('submit_audit_review',{case_id:'case-55',decision:'approved',corrected_fields:null,note:null});
await new Promise(r=>setTimeout(r,0));
assert.equal(reviewCount,1);
reviewResolve();
const [rr1,rr2]=await Promise.all([r1,r2]);
assert.equal(rr1.error,null);assert.equal(rr2.error,null);

// 6) Shell de revisão pode ser reconstruído depois da tela de sucesso destrutiva do legado.
const reviewRoot=new El('axReview');elements.set('axReview',reviewRoot);
assert.equal(guard.repairReviewShell(),true);
assert.match(reviewRoot.innerHTML,/id="axRTitle"/);
assert.match(reviewRoot.innerHTML,/id="axRBody"/);
assert.match(reviewRoot.innerHTML,/data-ax-decision="approved"/);
assert.match(reviewRoot.innerHTML,/data-ax-decision="corrected"/);
assert.match(reviewRoot.innerHTML,/data-ax-decision="discarded"/);

console.log('NEXA audit functional guard v18.9.16: PASS');
