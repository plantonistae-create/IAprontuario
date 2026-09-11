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
  constructor(value=''){this.value=value;this.textContent='';this.innerHTML='';this.disabled=false;this.style={};this.dataset={};this.className='';this.listeners={};this.checked=false}
  addEventListener(t,cb){(this.listeners[t]??=[]).push(cb)}
  dispatchEvent(e){for(const cb of this.listeners[e.type]||[])cb(e);return true}
  setAttribute(k,v){this[k]=v}
  querySelectorAll(){return []}
  insertAdjacentElement(){}
}

const ids={};
for(const id of ['nexaDestinationMedicalCard','nexaDestinationStatus','nexaDestinationRecommendation','nexaDestinationReason','nexaDestinationFinal','nexaDestinationConfirmBtn','nexaDestinationChangeBtn','nexaDestinationRefreshBtn','nexaDestinationChangePanel','nexaDestinationCancelChangeBtn','resetBtn','nexaRestoreSessionBtn','copyBtn','updateHistoryBtn','historyList','includeDiagnosis','generateExamsBtn','generatePrescriptionBtn','generateBothPlanBtn','applyRxMissingDataBtn','suggestedExams','suggestedPrescription'])ids[id]=new El();
const fields={};
for(const key of ['queixa_principal','hda','alergias','comorbidades','medicacoes','antecedentes','exame_fisico','hipotese_diagnostica','conduta'])fields[key]=new El();
ids.includeDiagnosis.checked=true;
fields.queixa_principal.value='Dor abdominal';fields.hda.value='Dor há 6 horas';fields.hipotese_diagnostica.value='Apendicite';fields.conduta.value='Avaliação cirúrgica';

const body=new El();
body.setAttribute=(k,v)=>{body[k]=v};
const documentMock={
  readyState:'complete',body,documentElement:{},
  getElementById:id=>ids[id]||null,
  querySelector:sel=>{const m=sel.match(/\.field\[data-key="([^"]+)"\] textarea/);return m?fields[m[1]]||null:null},
  addEventListener(){},createElement(){return new El()}
};

globalThis.Storage=StorageMock;
globalThis.localStorage=new StorageMock();
globalThis.window=globalThis;
globalThis.document=documentMock;
globalThis.CustomEvent=class{constructor(type,init={}){this.type=type;this.detail=init.detail}};
globalThis.Event=class{constructor(type){this.type=type}preventDefault(){}stopImmediatePropagation(){}};
globalThis.navigator={clipboard:{writeText:async()=>{}}};
globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({answer:'{"destination":"alta","reason":"estável"}'}),clone(){return this}});

const code=fs.readFileSync(new URL('../nexa-destination-flow-v18.9.15.js',import.meta.url),'utf8');
new Function(code)();
const api=globalThis.nexaDestinationFlow18915;
assert.ok(api,'fluxo médico de destino não inicializado');

// 1) recomendação de IA -> confirmação médica
assert.equal(api.setRecommendation('ALTA','test-ai','quadro estável'),true);
assert.equal(api.state.recommended,'alta');
assert.equal(api.state.status,'recommended');
assert.equal(api.confirmRecommendation(),true);
assert.equal(api.state.final,'alta');
assert.equal(api.state.status,'confirmed');
assert.equal(api.state.source,'physician_confirmed');

// 2) médico altera recomendação e decisão final prevalece
assert.equal(api.setPhysicianFinal('INTERNAÇÃO'),true);
assert.equal(api.state.final,'internacao');
assert.equal(api.state.status,'altered');
api.setRecommendation('REAVALIAÇÃO','late-ai','nova sugestão');
assert.equal(api.state.recommended,'reavaliacao');
assert.equal(api.state.final,'internacao','resposta posterior da IA não pode sobrescrever decisão médica');
assert.equal(api.state.status,'altered');

// 3) mudança de contexto não apaga silenciosamente decisão já confirmada
api.markContextChanged('hypothesis');
assert.equal(api.state.final,'internacao');
assert.equal(api.state.status,'altered');
assert.equal(api.state.recommendation_stale,true);

// 4) prontuário final usa a decisão médica, não a recomendação
const note=api.noteTextWithDestination();
assert.match(note,/DESTINO:\nINTERNAÇÃO/);
assert.doesNotMatch(note,/DESTINO:\nREAVALIAÇÃO/);

// 5) autosave da sessão incorpora destinationState
localStorage.setItem('nexa-active-clinical-session-v370',JSON.stringify({saved_at:new Date().toISOString(),fields:{hda:'x'}}));
const snap=JSON.parse(localStorage.getItem('nexa-active-clinical-session-v370'));
assert.equal(snap.destinationState.final,'internacao');
assert.equal(snap.destinationState.status,'altered');

// 6) restore preserva recomendação, final, status e origem
api.restore({recommended:'alta',final:'reavaliacao',status:'altered',source:'physician',updated_at:new Date().toISOString(),reason:'reavaliar após analgesia'});
assert.equal(api.state.recommended,'alta');
assert.equal(api.state.final,'reavaliacao');
assert.equal(api.state.status,'altered');
assert.equal(api.state.source,'physician');

// 7) reset impede herança para nova consulta
api.reset('new-consultation');
assert.equal(api.state.recommended,'');
assert.equal(api.state.final,'');
assert.equal(api.state.status,'pending');

// 8) normalização aceita as três decisões médicas esperadas
assert.equal(api.normalizeDestination('Alta'),'alta');
assert.equal(api.normalizeDestination('Reavaliação'),'reavaliacao');
assert.equal(api.normalizeDestination('Internação'),'internacao');

console.log('NEXA destination medical flow functional test: PASS');
