import fs from 'node:fs';
import assert from 'node:assert/strict';

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const loader=fs.readFileSync(new URL('../nexa-hotfix.js',import.meta.url),'utf8');

// Contratos funcionais já existentes da aba Hipótese/CID.
for(const contract of [
  "$('confirmHypothesisBtn').onclick",
  "$('editHypothesisBtn').onclick",
  "$('applyEditedHypothesisBtn').onclick",
  "$('undefinedHypothesisBtn').onclick",
  "hypTa.addEventListener('input',invalidateHypothesisReview)",
  "bindCidSearch('physicianCid','physicianCidOptions','physicianCidHint')",
  'persistHypothesisReview()',
  'restoreHypothesisReview(saved,current=',
]) assert.ok(index.includes(contract),`contrato ausente: ${contract}`);
assert.ok(loader.includes('nexa-hypothesis-cid-guard-v18.9.11.js'),'guard CID não carregado');

class El{
  constructor(value=''){
    this.value=value;this.textContent='';this.label='';this.dataset={};this.children=[];this.listeners={};this.onclick=null;this.focused=false;
  }
  addEventListener(type,cb,capture=false){(this.listeners[type]??=[]).push({cb,capture})}
  querySelectorAll(sel){return sel==='option'?this.children:[]}
  focus(){this.focused=true}
  dispatchEvent(event){
    event.currentTarget=this;event.target=this;
    for(const l of (this.listeners[event.type]||[]).filter(x=>x.capture)){
      l.cb(event);if(event.immediateStopped)return !event.defaultPrevented;
    }
    if(typeof this.onclick==='function'&&!event.immediateStopped)this.onclick(event);
    for(const l of (this.listeners[event.type]||[]).filter(x=>!x.capture)){
      if(event.immediateStopped)break;l.cb(event);
    }
    return !event.defaultPrevented;
  }
}
class Ev{
  constructor(type){this.type=type;this.defaultPrevented=false;this.immediateStopped=false}
  preventDefault(){this.defaultPrevented=true}
  stopImmediatePropagation(){this.immediateStopped=true}
}
class CE extends Ev{constructor(type,init={}){super(type);this.detail=init.detail}}

const cidInput=new El();
const cidList=new El();
const cidHint=new El();
const applyBtn=new El();
const events=[];
let underlyingApplyCount=0;
applyBtn.onclick=()=>{underlyingApplyCount++};
const byId={physicianCid:cidInput,physicianCidOptions:cidList,physicianCidHint:cidHint,applyEditedHypothesisBtn:applyBtn};

globalThis.window={dispatchEvent:e=>events.push(e)};
globalThis.document={getElementById:id=>byId[id]||null};
globalThis.CustomEvent=CE;

const code=fs.readFileSync(new URL('../nexa-hypothesis-cid-guard-v18.9.11.js',import.meta.url),'utf8');
new Function(code)();
const guard=window.nexaHypothesisCidGuard1911;
assert.ok(guard,'guard de hipótese/CID não inicializado');

function option(value,label){const o=new El();o.value=value;o.label=label;return o}
function click(){const e=new Ev('click');applyBtn.dispatchEvent(e);return e}

// 1) CID vazio continua permitido: hipótese textual pode ser validada sem CID.
cidInput.value='';
let e=click();
assert.equal(e.defaultPrevented,false);
assert.equal(underlyingApplyCount,1);

// 2) CID digitado mas ausente do catálogo carregado é bloqueado.
cidInput.value='ZZZ9';
e=click();
assert.equal(e.defaultPrevented,true);
assert.equal(underlyingApplyCount,1,'handler clínico não pode rodar com CID inválido');
assert.equal(cidInput.focused,true);
assert.equal(cidHint.dataset.cidValidation,'invalid');
assert.match(cidHint.textContent,/não validado/i);

// 3) CID presente no catálogo é normalizado e liberado.
cidList.children=[option('J18.9','J18.9 — Pneumonia não especificada')];
cidInput.focused=false;
cidInput.value='j18.9';
e=click();
assert.equal(e.defaultPrevented,false);
assert.equal(underlyingApplyCount,2);
assert.equal(cidInput.value,'J18.9');
assert.equal(cidHint.dataset.cidValidation,'valid');
assert.match(cidHint.textContent,/Pneumonia não especificada/);

// 4) Atualização do catálogo remove falso negativo sem manter estado residual.
cidInput.value='R51.9';
e=click();
assert.equal(e.defaultPrevented,true);
cidList.children.push(option('R51.9','R51.9 — Cefaleia'));
e=click();
assert.equal(e.defaultPrevented,false);
assert.equal(underlyingApplyCount,3);
assert.equal(cidInput.value,'R51.9');

// 5) Validação também responde fora do clique e publica evento observável.
cidInput.value='INVALIDO';
cidInput.dispatchEvent(new Ev('blur'));
assert.equal(cidHint.dataset.cidValidation,'invalid');
assert.ok(events.some(x=>x.type==='nexa:cid-validation'&&x.detail?.valid===false));
assert.ok(events.some(x=>x.type==='nexa:cid-validation'&&x.detail?.valid===true));

console.log('NEXA hypothesis/CID functional audit: PASS');
