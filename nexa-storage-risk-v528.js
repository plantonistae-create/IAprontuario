/* NEXA V5.28 — local-storage risk notice. INFORMATIONAL ONLY: it never deletes, purges, blocks or changes anything.
 * While remote preservation is OFF the encrypted local vault is the ONLY copy of a consultation's audio. Browsers may evict site storage (low disk space, or — Safari, non-installed sites — days without use).
 * This module reads vault.usage() / vault.listOwned() and shows ONE dismissible notice when the physician holds local audio AND (the browser has not granted persistent storage OR space is getting low).
 * Text is set with textContent only. No network. No retention policy lives here (retention stays in nexa-audio-storage-v524.js, OFF by default). */
(()=>{
'use strict';
if(window.nexaStorageRiskV528)return;
const MB=1048576;
const isIOS=ua=>/iPad|iPhone|iPod/.test(ua||'')||(/Macintosh/.test(ua||'')&&typeof document!=='undefined'&&'ontouchend' in document);
/** pure: u = vault.usage() result, sessions = vault.listOwned() rows, env = {standalone, ua, remoteBackup} -> {show, level, lines[], summary} */
function assess(u,sessions,env={}){
  const n=Array.isArray(sessions)?sessions.length:0,quota=Number.isFinite(u?.quota)?u.quota:null,used=Number.isFinite(u?.usage)?u.usage:null;
  const ratio=quota&&used!==null?used/quota:null,free=quota!==null&&used!==null?Math.max(0,quota-used):null;
  const persisted=typeof u?.persisted==='boolean'?u.persisted:null,reasons=[];
  if(persisted!==true)reasons.push('persist');
  if(ratio!==null&&(ratio>=0.8||free<256*MB))reasons.push('space');
  const ios=isIOS(env.ua),standalone=env.standalone===true;
  const show=n>0&&reasons.length>0&&env.remoteBackup!==true;
  const lines=[];
  if(show){
    lines.push(`Há ${n} gravação(ões) protegida(s) só neste aparelho${used!==null?` (o NEXA ocupa ≈ ${Math.round(used/MB)} MB aqui)`:''}. Ainda não existe cópia no servidor.`);
    if(reasons.includes('space'))lines.push(`Espaço do navegador em ${Math.round(ratio*100)}%${free!==null?` (livre ≈ ${Math.round(free/MB)} MB)`:''}: libere espaço no aparelho para não perder áudio.`);
    if(reasons.includes('persist'))lines.push('O navegador não garantiu armazenamento permanente: pode apagar estes dados se faltar espaço'+(ios&&!standalone?' ou se o NEXA ficar dias sem ser aberto. No iPhone, adicione o NEXA à Tela de Início e abra por ele.':'.'));
    lines.push('Não limpe os dados do site nem desinstale o NEXA enquanto houver gravações a recuperar.');
  }
  return{show,level:reasons.includes('space')?'warn':show?'notice':'ok',lines,summary:{sessions:n,quota,usage:used,ratio,free,persisted,standalone,ios,reasons}};
}
const standaloneNow=()=>{try{return window.matchMedia?.('(display-mode: standalone)')?.matches===true||navigator.standalone===true}catch{return false}};
async function evaluate({vault,ownerId,remoteBackup=false}){
  if(!vault||!ownerId)return assess(null,[],{});
  let u=null,s=[];try{u=await vault.usage()}catch{}try{s=await vault.listOwned(ownerId)}catch{}
  return assess(u,s,{standalone:standaloneNow(),ua:navigator.userAgent,remoteBackup});
}
function render(res){
  const id='nexaStorageRiskNotice';document.getElementById(id)?.remove();
  try{if(sessionStorage.getItem('nexa.storageRisk.dismissed')===JSON.stringify(res.lines))return null}catch{}
  if(!res.show)return null;
  const box=document.createElement('div');box.id=id;box.setAttribute('role','status');box.style.cssText='margin:8px 0;padding:10px 12px;border:1px solid #b45309;border-radius:10px;background:rgba(180,83,9,.10);font-size:13px;line-height:1.4';
  res.lines.forEach((t,i)=>{const p=document.createElement('div');p.textContent=t;if(i===0)p.style.fontWeight='600';box.append(p)});
  const b=document.createElement('button');b.type='button';b.className='btn ghost';b.style.marginTop='6px';b.textContent='Entendi';
  b.onclick=()=>{try{sessionStorage.setItem('nexa.storageRisk.dismissed',JSON.stringify(res.lines))}catch{}box.remove()};box.append(b);return box;
}
window.nexaStorageRiskV528=Object.freeze({assess,evaluate,render,mode:'informational_only'});
})();
