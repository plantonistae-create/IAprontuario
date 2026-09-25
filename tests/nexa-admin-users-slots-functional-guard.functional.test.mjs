import fs from 'node:fs';
import assert from 'node:assert/strict';

class El{
  constructor(id=''){this.id=id;this.style={};this.dataset={};this.disabled=false;this.textContent='';this.classList={contains:()=>false,remove:()=>{},add:()=>{}}}
  closest(){return null}
  click(){this.clicked=(this.clicked||0)+1}
}
const ids={navAdminBtn:new El('navAdminBtn'),mainApp:new El('mainApp'),coreUsersPane:new El('coreUsersPane'),coreAdminModal:new El('coreAdminModal')};
ids.mainApp.style.display='flex';
const main=new El('main');
const listeners={};
globalThis.document={
  readyState:'complete',documentElement:new El('html'),
  getElementById:id=>ids[id]||null,
  querySelector:sel=>sel==='main'?main:null,
  querySelectorAll:()=>[],
  addEventListener:(name,fn)=>{listeners[name]=fn}
};
globalThis.MutationObserver=class{constructor(fn){this.fn=fn}observe(){}};
globalThis.window=globalThis;
globalThis.window.addEventListener=()=>{};
globalThis.alert=()=>{};
globalThis.confirm=()=>true;

function makeResponse(payload){return {clone(){return makeResponse(payload)},async json(){return payload}}}
let fetchCalls=[];let fetchResolvers=[];
globalThis.fetch=(input,init={})=>new Promise(resolve=>{
  fetchCalls.push({input,body:JSON.parse(init.body||'{}')});
  fetchResolvers.push(payload=>resolve(makeResponse(payload||{})));
});

let rpcCalls=[];let rpcResolver=null;let rpcMode='pending';
globalThis.sb={rpc:(name,args)=>{
  rpcCalls.push({name,args});
  if(name!=='admin_manage_profile')return Promise.resolve({data:[],error:null});
  if(rpcMode==='error')return Promise.resolve({data:null,error:new Error('CLINICAL_SLOT_LIMIT_REACHED')});
  if(rpcMode==='immediate')return Promise.resolve({data:{ok:true},error:null});
  return new Promise(resolve=>{rpcResolver=resolve});
}};
globalThis.currentProf={id:'admin-1',access_status:'active',is_admin:true,is_reviewer:false,clinical_access:true};
globalThis.nexaAuditFunctionalGuard18916={capabilitiesReady:true,async refreshCapabilities(){return true}};

const code=fs.readFileSync(new URL('../nexa-admin-users-slots-functional-guard-v18.9.18.js',import.meta.url),'utf8');
new Function(code)();
const guard=globalThis.nexaAdminUsersSlotsGuard18918;
assert.ok(guard,'guard Admin/Usuários/Slots não inicializado');
assert.equal(guard.isVerifiedAdmin(),true);

// 1) Modelo real das mutações: pending/disabled/active permanecem explícitos e desativar libera clinical_access.
let m=guard.deriveMutation({id:'u1',access_status:'pending',clinical_access:false,is_admin:false,is_reviewer:false},'Ativar');
assert.equal(m.args.new_access_status,'active');
assert.equal(m.args.new_clinical_access,false);
m=guard.deriveMutation({id:'u1',access_status:'active',clinical_access:true,is_admin:false,is_reviewer:false},'Desativar');
assert.equal(m.args.new_access_status,'disabled');
assert.equal(m.args.new_clinical_access,false);
m=guard.deriveMutation({id:'u1',access_status:'disabled',clinical_access:false,is_admin:false,is_reviewer:false},'Dar clínica');
assert.equal(m.args.new_access_status,'active');
assert.equal(m.args.new_clinical_access,true);

// 2) Fail-closed: capability não confirmada revoga Admin imediatamente.
globalThis.nexaAuditFunctionalGuard18916.capabilitiesReady=false;
assert.equal(guard.isVerifiedAdmin(),false);
globalThis.nexaAuditFunctionalGuard18916.capabilitiesReady=true;

// 3) Duplo clique / mutação idêntica em voo usa um único RPC.
rpcMode='pending';
const args={target_user:'u2',new_access_status:'active',new_clinical_access:true,new_is_admin:false,new_is_reviewer:false};
const p1=guard.guardedAdminMutation(args);
const p2=guard.guardedAdminMutation(args);
await new Promise(r=>setTimeout(r,0));
assert.equal(rpcCalls.filter(x=>x.name==='admin_manage_profile').length,1);
rpcResolver({data:{ok:true},error:null});
await Promise.all([p1,p2]);
assert.equal(guard.pendingMutations,0);

// 4) Erro Supabase retornado em {error} vira falha real e preserva CLINICAL_SLOT_LIMIT_REACHED.
rpcMode='error';
await assert.rejects(()=>guard.guardedAdminMutation({...args,target_user:'u3'}),/CLINICAL_SLOT_LIMIT_REACHED/);
assert.equal(guard.friendlyError(new Error('CLINICAL_SLOT_LIMIT_REACHED')),'As 5 vagas clínicas estão ocupadas.');

// 5) Auto-desativação e auto-remoção de admin são bloqueadas na camada cliente.
rpcMode='immediate';
await assert.rejects(()=>guard.guardedAdminMutation({target_user:'admin-1',new_access_status:'disabled',new_clinical_access:false,new_is_admin:true,new_is_reviewer:false}),/ADMIN_SELF_DISABLE_BLOCKED/);
await assert.rejects(()=>guard.guardedAdminMutation({target_user:'admin-1',new_access_status:'active',new_clinical_access:true,new_is_admin:false,new_is_reviewer:false}),/ADMIN_SELF_DEMOTION_BLOCKED/);

// 6) Listagens administrativas concorrentes são serializadas para preservar a ordem de refresh.
fetchCalls=[];fetchResolvers=[];
const url='https://example.supabase.co/functions/v1/admin-users';
const l1=fetch(url,{method:'POST',body:JSON.stringify({action:'list'})});
const l2=fetch(url,{method:'POST',body:JSON.stringify({action:'list'})});
await new Promise(r=>setTimeout(r,0));
assert.equal(fetchCalls.length,1);
fetchResolvers.shift()({users:[{id:'old',display_name:'Old'}]});await l1;
await new Promise(r=>setTimeout(r,0));
assert.equal(fetchCalls.length,2);
fetchResolvers.shift()({users:[{id:'new',display_name:'New'}]});await l2;
assert.equal(guard.cachedUsers[0].id,'new');

// 7) Médico/reviewer sem is_admin permanece fail-closed mesmo com capability carregada.
globalThis.currentProf={id:'reviewer-1',access_status:'active',is_admin:false,is_reviewer:true,clinical_access:false};
assert.equal(guard.isVerifiedAdmin(),false);
await assert.rejects(()=>guard.guardedAdminMutation({target_user:'u4',new_access_status:'active',new_clinical_access:true,new_is_admin:false,new_is_reviewer:false}),/ADMIN_PERMISSION_UNVERIFIED/);

console.log('NEXA Admin / usuários / slots functional guard test: PASS');
