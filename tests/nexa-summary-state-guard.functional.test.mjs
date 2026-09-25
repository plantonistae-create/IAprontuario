import fs from 'node:fs';
import assert from 'node:assert/strict';

class ClassList{
  constructor(){this.s=new Set()}
  contains(v){return this.s.has(v)}
  add(v){this.s.add(v)}
  remove(v){this.s.delete(v)}
}
class El{
  constructor(value=''){
    this.value=value;this.textContent='';this.disabled=false;this.className='';this.classList=new ClassList();this.listeners={};this.error=false;
  }
  addEventListener(type,cb){(this.listeners[type]??=[]).push(cb)}
  dispatchEvent(e){for(const cb of this.listeners[e.type]||[])cb(e);return true}
  querySelector(sel){return sel==='.banner.error'&&this.error?{}:null}
}

const keys=['queixa_principal','hda','comorbidades','antecedentes','medicacoes','alergias','exame_fisico'];
const fields=Object.fromEntries(keys.map(k=>[k,new El()]));
const processBtn=new El(),resetBtn=new El(),banner=new El(),saveState=new El();
saveState.className='save-state saved';saveState.textContent='salvo';
const observers=[];const events=[];

function querySelector(sel){
  const m=sel.match(/^\.field\[data-key="([^"]+)"\] textarea$/);
  if(m)return fields[m[1]]||null;
  return null;
}
function getElementById(id){return ({processBtn,resetBtn,bannerArea:banner,saveState})[id]||null}

globalThis.window={dispatchEvent:e=>events.push(e)};
globalThis.document={querySelector,getElementById};
globalThis.Event=class{constructor(type,init={}){this.type=type;this.bubbles=!!init.bubbles}};
globalThis.CustomEvent=class extends Event{constructor(type,init={}){super(type);this.detail=init.detail}};
globalThis.queueMicrotask=fn=>Promise.resolve().then(fn);
globalThis.MutationObserver=class{
  constructor(cb){this.cb=cb;observers.push(this)}
  observe(){}
};

const code=fs.readFileSync(new URL('../nexa-summary-state-guard-v18.9.10.js',import.meta.url),'utf8');
new Function(code)();
const guard=window.nexaSummaryStateGuard1910;
assert.ok(guard,'guard não inicializado');
assert.deepEqual(guard.keys,keys);

function fireClick(el){el.dispatchEvent(new Event('click'))}
async function flush(){await Promise.resolve();await Promise.resolve()}
function mutate(){for(const o of observers)o.cb([])}

// 1) erro de processamento não pode apagar resumo já existente
fields.queixa_principal.value='Dor abdominal';
fields.hda.value='Dor há dois dias';
fields.comorbidades.value='HAS';
fireClick(processBtn);
processBtn.disabled=true;
for(const el of Object.values(fields))el.value=''; // simula clearFields() do núcleo
banner.error=true;
processBtn.disabled=false;
mutate();await flush();
assert.equal(fields.queixa_principal.value,'Dor abdominal');
assert.equal(fields.hda.value,'Dor há dois dias');
assert.equal(fields.comorbidades.value,'HAS');
assert.ok(events.some(e=>e.type==='nexa:summary-restored-after-error'));
assert.equal(guard.hasSnapshot,false);

// 2) sucesso mantém o novo resumo e descarta snapshot antigo
banner.error=false;
fields.hda.value='Resumo antigo';
fireClick(processBtn);
processBtn.disabled=true;
fields.hda.value='Resumo novo estruturado';
processBtn.disabled=false;
mutate();await flush();
assert.equal(fields.hda.value,'Resumo novo estruturado');
assert.equal(guard.hasSnapshot,false);

// 3) reset durante ciclo invalida snapshot para impedir ressuscitar dados antigos
fields.hda.value='Consulta que será limpa';
fireClick(processBtn);
processBtn.disabled=true;
fireClick(resetBtn);
fields.hda.value='';banner.error=true;processBtn.disabled=false;
mutate();await flush();
assert.equal(fields.hda.value,'');
assert.equal(guard.hasSnapshot,false);

console.log('Resumo clinical state guard: PASS');
