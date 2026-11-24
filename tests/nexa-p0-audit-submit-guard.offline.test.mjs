/* P0 Draft — offline browser contract only. No hosted calls or clinical data. */
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('async function submitCurrentForAudit(){');
const end=html.indexOf("$('submitAuditBtn').onclick=submitCurrentForAudit;",start);
assert.ok(start>0&&end>start,'expected single audit handler');
const handler=html.slice(start,end);
assert.equal(html.indexOf('async function submitCurrentForAudit(){',start+1),-1);

function setup({access=true,content=true,adapter=true,saveOk=true,ownerMatches=true}={}){
 const calls=[];
 const currentProf={id:'synthetic-physician',clinical_access:access};
 const context={
  currentProf,
  collect:()=>content?{hda:'Consulta sintética sem dados reais'}:{hda:''},
  show:(msg,error)=>calls.push({type:'show',msg,error}),
  fetch:()=>{throw Error('UNAUTHORIZED_EXTERNAL_FETCH')},
  confirm:()=>{throw Error('UNAUTHORIZED_CLIENT_ATTESTATION')},
  window:{nexaEncounterAutosave18101: adapter?{
   preserve:async(reason,options)=>{
    calls.push({type:'preserve',reason,options});
    if(!saveOk)throw Error('SYNTHETIC_IDB_FAILURE');
    return {encounter_id:'synthetic-encounter',
      owner_user_id:ownerMatches?currentProf.id:'another-owner'};
   }
  }:null}
 };
 vm.runInNewContext(handler+'\nthis.runAudit=submitCurrentForAudit;',context,{timeout:1000});
 return {run:()=>context.runAudit(),calls};
}

test('no client-owned clinical fields or pretend final acknowledgement',()=>{
 assert.doesNotMatch(handler,/fetch\s*\(|APP_CONFIG\.submitAuditPath/);
 assert.doesNotMatch(handler,/reviewed_documentation\s*:\s*true/);
 assert.doesNotMatch(handler,/core_context\s*:/);
 assert.doesNotMatch(handler,/confirm\s*\(/);
 assert.match(handler,/audit_gate_blocked/);
});
test('preserves draft locally without syncing or submitting audit',async()=>{
 const f=setup();await f.run();
 assert.equal(f.calls.filter(x=>x.type==='preserve').length,1);
 assert.equal(f.calls[0].reason,'audit_gate_blocked');
 assert.equal(f.calls[0].options.sync,false);
 assert.match(f.calls.at(-1).msg,/nenhum caso foi enviado/);
});
test('rejects actor without clinical access before any write',async()=>{
 const f=setup({access:false});await f.run();
 assert.equal(f.calls.filter(x=>x.type==='preserve').length,0);
});
test('rejects empty consultation before any write',async()=>{
 const f=setup({content:false});await f.run();
 assert.equal(f.calls.filter(x=>x.type==='preserve').length,0);
});
test('fail closed when local checkpoint adapter absent',async()=>{
 const f=setup({adapter:false});await f.run();
 assert.equal(f.calls.filter(x=>x.type==='preserve').length,0);
 assert.match(f.calls.at(-1).msg,/preservação local indisponível/);
});
test('fail closed when local checkpoint throws',async()=>{
 const f=setup({saveOk:false});await f.run();
 assert.match(f.calls.at(-1).msg,/não foi possível confirmar o salvamento local/);
});
test('fail closed when saved local record belongs to another physician',async()=>{
 const f=setup({ownerMatches:false});await f.run();
 assert.match(f.calls.at(-1).msg,/salvamento local não comprovado/);
});
test('existing NEXA inline scripts still parse',()=>{
 const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(([,attrs,body])=>!attrs.includes('src=')&&body.trim());
 assert.ok(scripts.length>=3);
 for(let i=0;i<scripts.length;i++)
  new vm.Script(scripts[i][2],{filename:'index.html:inline-'+i});
});
