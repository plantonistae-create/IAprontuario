import fs from 'node:fs';
import assert from 'node:assert/strict';

class Card{
  constructor(text='',hasDisposition=false){
    this.textContent=text;this.hidden=false;this.dataset={};this.attrs={};
    this.style={setProperty:(k,v)=>{this.style[k]=v}};
    this.hasDisposition=hasDisposition;
  }
  querySelector(sel){return sel==='.nrs-disp-main'&&this.hasDisposition?{}:null}
  setAttribute(k,v){this.attrs[k]=v}
}
class Dock{
  constructor(cards=[]){this.cards=cards}
  querySelectorAll(sel){return sel==='.nrs-card'?this.cards:[]}
}

const primary=new Card('Alta possível');
primary.dataset={};
let legacy=new Card('Disposição do PS · tendência estável em tempo real',true);
const questions=new Card('Perguntas da sessão');
const dock=new Dock([questions,legacy]);
const observers=[];

globalThis.window={};
globalThis.document={
  readyState:'complete',
  documentElement:{},
  body:{},
  getElementById(id){
    if(id==='nexaDispositionCard')return primary;
    if(id==='nexaRadarStableDock')return dock;
    return null;
  },
  addEventListener(){}
};
globalThis.MutationObserver=class{
  constructor(cb){this.cb=cb;observers.push(this)}
  observe(){}
  disconnect(){}
};

const code=fs.readFileSync(new URL('../nexa-destination-advisory-guard-v18.9.14.js',import.meta.url),'utf8');
new Function(code)();
const guard=window.nexaDestinationAdvisoryGuard18914;
assert.ok(guard,'guard de destino não inicializado');

// 1) o indicador principal permanece, mas é explicitamente classificado como tendência do Radar
assert.equal(primary.hidden,false);
assert.equal(primary.dataset.destinationRole,'radar-advisory');
assert.match(primary.attrs['aria-label']||'',/não representa desfecho clínico final/i);

// 2) o segundo indicador heurístico legado deve ser suprimido sem esconder o card de perguntas
assert.equal(questions.hidden,false);
assert.equal(legacy.hidden,true);
assert.equal(legacy.dataset.destinationDuplicate,'suppressed');
assert.equal(legacy.style.display,'none');

// 3) se o módulo legado rerenderizar o dock, o duplicado novo também precisa ser suprimido
legacy=new Card('DISPOSIÇÃO DO PS',true);
dock.cards=[questions,legacy];
for(const o of observers)o.cb([]);
assert.equal(legacy.hidden,true);

// 4) esta auditoria não deve fingir que existe fluxo médico final onde ele não existe
assert.equal(guard.hasMedicalDispositionFlow,false);

console.log('NEXA destination advisory guard functional test: PASS');
