/* NEXA v18.9.18 — Admin / usuários / slots functional guard · 2026-09-11 */
(()=>{
'use strict';
if(window.__NEXA_ADMIN_USERS_SLOTS_GUARD_V18_9_18__)return;
window.__NEXA_ADMIN_USERS_SLOTS_GUARD_V18_9_18__=true;

const ADMIN_USERS_PATH='/functions/v1/admin-users';
const SLOT_RPC_PATH='/rest/v1/rpc/get_admin_slot_summary';
const $=id=>document.getElementById(id);
const originalFetch=window.fetch.bind(window);
const originalRpc=window.sb?.rpc?.bind(window.sb)||null;
let listTail=Promise.resolve();
let slotReadTail=Promise.resolve();
let latestUsers=[];
const usersById=new Map();
const mutationInflight=new Map();

function parsePayload(init){try{return typeof init?.body==='string'?JSON.parse(init.body):null}catch{return null}}
function capabilitiesReady(){return !!window.nexaAuditFunctionalGuard18916?.capabilitiesReady}
function verifiedProfile(){
  const p=window.currentProf;
  if(!capabilitiesReady()||!p||p.access_status!=='active')return null;
  return p;
}
function isVerifiedAdmin(){return !!verifiedProfile()?.is_admin}
function errorMessage(error){return String(error?.message||error?.error_description||error||'Falha administrativa.')}
function friendlyError(error){
  const msg=errorMessage(error);
  if(msg.includes('CLINICAL_SLOT_LIMIT_REACHED'))return 'As 5 vagas clínicas estão ocupadas.';
  if(msg.includes('ADMIN_PERMISSION_UNVERIFIED'))return 'Permissão administrativa não confirmada. Atualize a sessão e tente novamente.';
  if(msg.includes('ADMIN_SELF_DISABLE_BLOCKED'))return 'Sua própria conta de administrador não pode ser desativada por esta tela.';
  if(msg.includes('ADMIN_SELF_DEMOTION_BLOCKED'))return 'A remoção do seu próprio perfil de administrador foi bloqueada nesta tela.';
  return msg;
}
function responseClone(resp){return typeof resp?.clone==='function'?resp.clone():resp}
function actionKey(args={}){return `${args.target_user||''}:${args.new_access_status||''}:${!!args.new_clinical_access}:${!!args.new_is_admin}:${!!args.new_is_reviewer}`}
function setAdminBusy(busy){
  document.querySelectorAll?.('#coreUsersBody button').forEach(btn=>{
    if(busy){if(!('nexaAdminPrevDisabled' in btn.dataset))btn.dataset.nexaAdminPrevDisabled=btn.disabled?'1':'0';btn.disabled=true;btn.dataset.nexaAdminBusy='1';}
    else if(btn.dataset.nexaAdminBusy==='1'){const prev=btn.dataset.nexaAdminPrevDisabled;delete btn.dataset.nexaAdminPrevDisabled;delete btn.dataset.nexaAdminBusy;if(prev==='0')btn.disabled=false;}
  });
}
function cacheUsers(payload){
  const users=Array.isArray(payload?.users)?payload.users:[];
  latestUsers=users.map(x=>({...x}));usersById.clear();
  for(const user of latestUsers){if(user?.id)usersById.set(String(user.id),user)}
  queueMicrotask(annotateRows);
}
function annotateRows(){
  const rows=[...(document.querySelectorAll?.('#coreUsersBody .core-user')||[])];
  rows.forEach((row,i)=>{const user=latestUsers[i];if(user?.id)row.dataset.nexaUserId=String(user.id)});
}
async function cacheUsersFromResponse(response){
  try{const data=await responseClone(response)?.json?.();cacheUsers(data)}catch{}
}
function syncAccessUi(){
  const p=verifiedProfile();
  const admin=!!p?.is_admin;
  const navAdmin=$('navAdminBtn');if(navAdmin)navAdmin.style.display=admin?'flex':'none';
  const main=document.querySelector?.('main');
  const mainApp=$('mainApp');
  if(main&&mainApp&&mainApp.style.display!=='none')main.style.display=p?.clinical_access?'grid':'none';
  if(!admin){
    const pane=$('coreUsersPane');
    if(pane?.classList?.contains('active'))$('coreAdminModal')?.classList?.remove('open');
  }
}
async function refreshVerifiedAccess(){
  try{await window.nexaAuditFunctionalGuard18916?.refreshCapabilities?.()}catch{}
  syncAccessUi();return isVerifiedAdmin();
}

function adminAwareFetch(input,init={}){
  const url=typeof input==='string'?input:(input?.url||'');
  if(url.includes(ADMIN_USERS_PATH)){
    const payload=parsePayload(init);
    if(payload?.action==='list'){
      const run=()=>Promise.resolve(originalFetch(input,init)).then(async response=>{await cacheUsersFromResponse(response);return response});
      const request=listTail.then(run,run);listTail=request.then(()=>undefined,()=>undefined);return request;
    }
  }
  if(url.includes(SLOT_RPC_PATH)){
    const run=()=>originalFetch(input,init);
    const request=slotReadTail.then(run,run);slotReadTail=request.then(()=>undefined,()=>undefined);return request;
  }
  return originalFetch(input,init);
}
window.fetch=adminAwareFetch;

async function guardedAdminMutation(args={}){
  if(!isVerifiedAdmin())throw new Error('ADMIN_PERMISSION_UNVERIFIED');
  const self=String(window.currentProf?.id||'');
  const target=String(args?.target_user||'');
  if(self&&target===self&&args?.new_access_status==='disabled')throw new Error('ADMIN_SELF_DISABLE_BLOCKED');
  if(self&&target===self&&window.currentProf?.is_admin===true&&args?.new_is_admin===false)throw new Error('ADMIN_SELF_DEMOTION_BLOCKED');
  if(!originalRpc)throw new Error('RPC administrativo indisponível.');
  const key=actionKey(args);
  if(mutationInflight.has(key))return mutationInflight.get(key);
  setAdminBusy(true);
  const request=(async()=>{
    const result=await originalRpc('admin_manage_profile',args);
    if(result?.error)throw result.error;
    return result;
  })();
  mutationInflight.set(key,request);
  try{return await request}finally{
    if(mutationInflight.get(key)===request)mutationInflight.delete(key);
    if(mutationInflight.size===0)setAdminBusy(false);
  }
}
if(window.sb&&originalRpc){
  window.sb.rpc=function(name,args={}){
    if(name==='admin_manage_profile')return guardedAdminMutation(args);
    return originalRpc(name,args);
  };
}

function deriveMutation(user,buttonText){
  const u=user||{};const text=String(buttonText||'').trim();
  const active=u.access_status==='active',clinical=!!u.clinical_access,reviewer=!!u.is_reviewer,admin=!!u.is_admin;
  if(text==='Desativar'||text==='Ativar')return{kind:'status',args:{target_user:u.id,new_access_status:active?'disabled':'active',new_clinical_access:active?false:clinical,new_is_admin:admin,new_is_reviewer:reviewer},needsConfirm:true};
  if(text==='Retirar clínica'||text==='Dar clínica')return{kind:'clinical',args:{target_user:u.id,new_access_status:'active',new_clinical_access:!clinical,new_is_admin:admin,new_is_reviewer:reviewer}};
  if(text==='Retirar revisor'||text==='Tornar revisor')return{kind:'reviewer',args:{target_user:u.id,new_access_status:'active',new_clinical_access:clinical,new_is_admin:admin,new_is_reviewer:!reviewer}};
  return null;
}
async function runUserMutation(row,button){
  if(!isVerifiedAdmin()){alert(friendlyError(new Error('ADMIN_PERMISSION_UNVERIFIED')));return}
  const user=usersById.get(String(row?.dataset?.nexaUserId||''));
  const mutation=deriveMutation(user,button?.textContent);
  if(!user||!mutation){alert('Não foi possível validar o usuário selecionado. Atualize a lista.');return}
  if(mutation.needsConfirm&&!confirm(`${user.access_status==='active'?'Desativar':'Ativar'} o acesso de ${user.display_name||user.email||'usuário'}?`))return;
  try{
    await guardedAdminMutation(mutation.args);
    $('navAdminBtn')?.click();
  }catch(error){alert(friendlyError(error))}
}

function onCaptureClick(event){
  const adminNav=event.target?.closest?.('#navAdminBtn');
  if(adminNav&&!isVerifiedAdmin()){event.preventDefault();event.stopImmediatePropagation();alert(friendlyError(new Error('ADMIN_PERMISSION_UNVERIFIED')));return}
  const button=event.target?.closest?.('#coreUsersBody .core-user button');
  if(button){
    event.preventDefault();event.stopImmediatePropagation();
    const row=button.closest('.core-user');runUserMutation(row,button);return;
  }
  if(event.target?.closest?.('#authSubmitBtn'))setTimeout(refreshVerifiedAccess,500);
}
function bind(){
  document.addEventListener('click',onCaptureClick,true);
  const observer=new MutationObserver(()=>{annotateRows();syncAccessUi()});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('nexa:audit-capabilities',syncAccessUi);
  window.addEventListener('focus',()=>{refreshVerifiedAccess()});
  refreshVerifiedAccess();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();

window.nexaAdminUsersSlotsGuard18918={
  parsePayload,actionKey,deriveMutation,friendlyError,isVerifiedAdmin,refreshVerifiedAccess,annotateRows,guardedAdminMutation,
  get pendingMutations(){return mutationInflight.size},get cachedUsers(){return latestUsers.map(x=>({...x}))}
};
})();
