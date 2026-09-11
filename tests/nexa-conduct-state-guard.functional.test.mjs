import fs from 'node:fs';
import assert from 'node:assert/strict';

class El{
  constructor(value=''){
    this.value=value;this.textContent='';this.disabled=false;this.className='';this.listeners={};this.error=false;
  }
  addEventListener(type,cb){(this.listeners[type]??=[]).push(cb)}
  dispatchEvent(e){for(const cb of this.listeners[e.type]||[])cb(e);return true}
  querySelector(sel){return sel==='.banner.error'&&this.error?{}:null}
}

const conduct=new El();
const processBtn=new El();
const resetBtn=new El();
const copyBtn=new El();
const banner=new El();
const saveState=new El();
const observers=[];
const events=[];
let copied='';

function querySelector(sel){
  if(sel==='.field[data-key="conduta"] textarea')return conduct;
  return null;
}
function getElementById(id){return ({processBtn,resetBtn,copyConductBtn:copyBtn,bannerArea:banner,saveState})[id]||null}

globalThis.window={dispatchEvent:e=>events.push(e)};
globalThis.document={querySelector,getElementById};
Object.defineProperty(globalThis,'navigator',{value:{clipboard:{writeText:async text=>{copied=text}}},configurable:true});
globalThis.setTimeout=fn=>{fn();return 1};
globalThis.Event=class{
  constructor(type,init={}){this.type=type;this.bubbles=!!init.bubbles;this.defaultPrevented=false;this.immediateStopped=false}
  preventDefault(){this.defaultPrevented=true}
  stopImmediatePropagation(){this.immediateStopped=true}
};
globalThis.CustomEvent=class extends Event{constructor(type,init={}){super(type);this.detail=init.detail}};
globalThis.queueMicrotask=fn=>Promise.resolve().then(fn);
globalThis.MutationObserver=class{
  constructor(cb){this.cb=cb;observers.push(this)}
  observe(){}
};

const code=fs.readFileSync(new URL('../nexa-conduct-state-guard-v18.9.13.js',import.meta.url),'utf8');
new Function(code)();
const guard=window.nexaConductStateGuard18913;
assert.ok(guard,'guard de conduta não inicializado');

function click(el){el.dispatchEvent(new Event('click'))}
function mutate(){for(const o of observers)o.cb([])}
async function flush(){await Promise.resolve();await Promise.resolve()}

// 1) conduta revisada não pode desaparecer se nova transcrição/processamento falhar
conduct.value='Hidratação venosa e reavaliação em 30 minutos.';
click(processBtn);
processBtn.disabled=true;
conduct.value=''; // simula clearFields() do núcleo antes do backend responder
banner.error=true;
processBtn.disabled=false;
mutate();await flush();
assert.equal(conduct.value,'Hidratação venosa e reavaliação em 30 minutos.');
assert.ok(events.some(e=>e.type==='nexa:conduct-restored-after-error'));
assert.equal(saveState.textContent,'conduta restaurada · revisar salvamento');
assert.equal(guard.hasSnapshot,false);

// 2) processamento bem-sucedido deve manter a nova conduta e descartar o snapshot antigo
banner.error=false;
conduct.value='Conduta anterior';
click(processBtn);
processBtn.disabled=true;
conduct.value='Nova conduta estruturada';
processBtn.disabled=false;
mutate();await flush();
assert.equal(conduct.value,'Nova conduta estruturada');
assert.equal(guard.hasSnapshot,false);

// 3) reset invalida snapshot; dados de atendimento anterior não podem reaparecer
conduct.value='Conduta do atendimento anterior';
click(processBtn);
assert.equal(guard.hasSnapshot,true);
click(resetBtn);
conduct.value='';
banner.error=true;
processBtn.disabled=false;
mutate();await flush();
assert.equal(conduct.value,'');
assert.equal(guard.active,false);
assert.equal(guard.hasSnapshot,false);

// 4) cópia deve usar a conduta final revisada do textarea, não seleção antiga da biblioteca
conduct.value='Conduta revisada manualmente após inserir o template.';
copied='';
const copiedOk=await guard.copyReviewedConduct();
assert.equal(copiedOk,true);
assert.equal(copied,'Conduta revisada manualmente após inserir o template.');
assert.ok(events.some(e=>e.type==='nexa:conduct-copied'&&e.detail?.source==='reviewed-textarea'));

console.log('NEXA conduct state guard functional test: PASS');
