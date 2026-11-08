import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../nexa-radar-dynamic-focus-v18.16.js',import.meta.url),'utf8');
function focus(){
 const mark='})();',at=source.lastIndexOf(mark);assert.ok(at>0);
 const injected=source.slice(0,at)+"window.__synthetic={chosen,model};"+source.slice(at);
 const window={},document={readyState:'loading',addEventListener:()=>{}};
 vm.runInNewContext(injected,{window,document},{timeout:1000});
 return window.__synthetic;
}
const q=(id,priority='high',status='to_ask',category='exam')=>({id,concept:id,priority,status,category,question:id});
const st=items=>({items,alerts:[],facts:{},hasContext:true});
test('pinned next question stable as speech adds another item and while clinician awaits answer',()=>{
 const h=focus(),a=q('dyspnea'),b=q('fever');
 assert.equal(h.chosen(h.model(st([a])))[0].id,'dyspnea');
 assert.equal(h.chosen(h.model(st([b,a])))[0].id,'dyspnea');
 assert.equal(h.chosen(h.model(st([b,{...a,status:'asked'}])))[0].id,'dyspnea');
 assert.equal(h.chosen(h.model(st([b])))[0].id,'fever');
});
test('new urgent clinical issue or contradiction preempts nonurgent pin, without flicker',()=>{
 const h=focus(),a=q('dyspnea','moderate'),c=q('spo2','critical');
 h.chosen(h.model(st([a])));
 assert.equal(h.chosen(h.model(st([a,c])))[0].id,'spo2');
 assert.equal(h.chosen(h.model(st([q('focal','critical'),c,a])))[0].id,'spo2');
 assert.equal(h.chosen(h.model(st([a])))[0].id,'dyspnea');
 assert.equal(h.chosen(h.model(st([a,q('conflict:allergies','high','confirm','contradiction')])))[0].id,'conflict:allergies');
});
test('silence does not convert required history to negative or confirmed',()=>{
 const h=focus(),m=h.model(st([q('dyspnea')]));
 assert.deepEqual(Array.from(m.core.map(x=>x.status)),['pending','pending','pending']);
 assert.equal(h.chosen(m).length,1);
 assert.equal(h.chosen(h.model(st([]))).length,0);
});
test('existing display layer never writes patient evidence, calls remote models, or prints transcript',()=>{
 for(const p of [/\bfetch\s*\(/,/\bsetInterval\s*\(/,/localStorage\.setItem\s*\(/,/\.fields\s*=/,/api\.respond\s*\(/,/realtimeTranscript/])assert.doesNotMatch(source,p);
});
