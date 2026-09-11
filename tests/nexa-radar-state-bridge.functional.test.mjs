import fs from 'node:fs';
import assert from 'node:assert/strict';

class El{constructor(text=''){this.textContent=text;this.style={};this.classList={contains:()=>false,remove(){},add(){}}}}
let store={};
const q=s=>store[s]?.[0]||null;
const qa=s=>store[s]||[];
const events=[];
let clickHandler=null;

globalThis.window={radarState:null,dispatchEvent:e=>events.push(e),nexaRadarStableRefresh194(){window.refreshes=(window.refreshes||0)+1}};
globalThis.CustomEvent=class{constructor(type,init={}){this.type=type;this.detail=init.detail}};
globalThis.MutationObserver=class{constructor(cb){this.cb=cb}observe(){}disconnect(){}};
globalThis.document={readyState:'complete',hidden:false,querySelector:q,querySelectorAll:qa,addEventListener(type,cb){if(type==='click')clickHandler=cb}};

globalThis.queueMicrotask=fn=>Promise.resolve().then(fn);

function setDom({covered=[],missing=[],questions=[],alerts=[],card=true}={}){
  store={};
  if(card)store['#realtimeRadarCard']=[new El('Radar')];
  store['#radarCovered .radar-row']=covered.map(x=>new El(x));
  store['#radarMissing .radar-row']=missing.map(x=>new El(x));
  store['#radarQuestions .radar-question:not(.nexa-question-done)']=questions.map(x=>new El(x));
  store['#radarAlerts .nexa-radar-alert-row,#nexaRadarAlertsDock .nexa-alert-row']=alerts.map(x=>new El(x));
  store['#realtimeRadarCard [data-radar-chief],#nexaRadarChiefComplaint']=[];
}

setDom();
const code=fs.readFileSync(new URL('../nexa-radar-state-bridge-v18.9.9.js',import.meta.url),'utf8');
new Function(code)();
const bridge=window.nexaRadarStateBridge199;
assert.ok(bridge,'bridge não inicializado');

assert.deepEqual(window.radarState,{covered:[],missing:[],questions:[],alerts:[],chief_complaint:''});

setDom({covered:['Dor caracterizada'],missing:['Alergias'],questions:['Possui alergias?'],alerts:['⚠ Hipotensão']});
bridge.publish('data');
assert.deepEqual(window.radarState.covered,['Dor caracterizada']);
assert.deepEqual(window.radarState.questions,['Possui alergias?']);
assert.deepEqual(window.radarState.alerts,['Hipotensão']);

setDom({covered:['Dor caracterizada','Alergias negadas'],missing:['Medicações'],questions:['Usa medicações?'],alerts:['Hipotensão']});
bridge.publish('changed');
assert.deepEqual(window.radarState.questions,['Usa medicações?']);
assert.ok(!window.radarState.questions.includes('Possui alergias?'));

setDom({covered:['Dor caracterizada','Alergias negadas'],missing:[],questions:[],alerts:[]});
bridge.publish('answered');
assert.deepEqual(window.radarState.questions,[]);
assert.deepEqual(window.radarState.alerts,[]);

setDom({covered:['Dor caracterizada','Alergias negadas','Febre negada'],missing:['Trauma'],questions:['Houve trauma?','Houve trauma?'],alerts:[]});
bridge.publish('new-transcript');
assert.deepEqual(window.radarState.questions,['Houve trauma?']);

setDom();
bridge.reset('reset');
await new Promise(r=>setTimeout(r,160));
assert.deepEqual(window.radarState,{covered:[],missing:[],questions:[],alerts:[],chief_complaint:''});
assert.ok(events.some(e=>e.type==='nexa:radar-state'));
assert.ok((window.refreshes||0)>=5);
console.log('Radar functional state cycle: PASS');
