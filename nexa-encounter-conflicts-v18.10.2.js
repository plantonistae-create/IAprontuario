/* NEXA conflict review v18.10.2 — manual review; no automatic merging. */
(()=>{
'use strict';
if(window.__NEXA_CONFLICT_REVIEW_18102__)return;
window.__NEXA_CONFLICT_REVIEW_18102__=true;
const api=window.nexaEncounterAutosave18101;if(!api)return;
const labels={queixa_principal:'Queixa principal',hda:'HDA',exame_fisico:'Exame físico',hipotese_diagnostica:'Hipótese diagnóstica',conduta:'Conduta',prescricao:'Prescrição',exames_sugeridos:'Exames sugeridos'};
const st={id:'',review:null,decisions:{},busy:false,requestEpoch:0};
const SNOOZE_MS=24*60*60*1000;
const snoozeKey=()=> 'nexa:conflict-notice-snooze-v1:'+owner();
function snoozed(){try{return Number(localStorage.getItem(snoozeKey())||0)>Date.now()}catch{return false}}
function postpone(){try{localStorage.setItem(snoozeKey(),String(Date.now()+SNOOZE_MS))}catch{}}
function restoreNotice(){try{localStorage.removeItem(snoozeKey())}catch{}}

const el=(tag,text='',cls='')=>{const x=document.createElement(tag);x.textContent=text;x.className=cls;return x};
const button=(text,fn,primary=false)=>{const b=el('button',text,'nexa-c-btn'+(primary?' nexa-c-primary':''));b.type='button';b.addEventListener('click',fn);return b};
const owner=()=>{try{return String(window.nexaClinicalRuntime18121?.getProfile?.()?.id||window.currentProf?.id||'')}catch{return ''}};
const errors={LOCAL_CHANGED_REVIEW_AGAIN:'O rascunho local mudou. Reabra a revisão.',REMOTE_CHANGED_REVIEW_AGAIN:'O servidor foi atualizado novamente. Reabra a revisão.',OFFLINE_REVIEW_UNAVAILABLE:'Conecte-se para consultar a versão remota.',OFFLINE_RESOLUTION_UNAVAILABLE:'Sem conexão: ambas as versões continuam preservadas.',CONFLICT_REMOTE_NOT_FOUND:'Versão remota indisponível. Nenhum rascunho foi descartado.',CONFLICT_REMOTE_READ_FAILED:'Não foi possível consultar o servidor.',FIELD_DECISION_REQUIRED:'Escolha a origem de todos os campos diferentes.',SERVER_RECORD_LOCKED:'O atendimento já está bloqueado para edição.',LOCAL_CHANGED_REVIEW_AGAIN:'O rascunho foi alterado. Reabra a revisão.',CONFLICT_ARCHIVE_WRITE_FAILED:'Falha ao criar cópia de segurança. Nenhuma versão foi substituída.'};
const message=e=>errors[String(e?.message||'')]||'Não foi possível confirmar o salvamento. As versões foram preservadas.';
let overlay,panel,body,actions,banner,status,title;
function init(){
 if(overlay||!document.body)return !!overlay;
 const style=el('style');
 style.textContent='#nexa-c-banner,#nexa-c-status{position:fixed;bottom:12px;z-index:10030;border:1px solid #496389;border-radius:12px;padding:11px 14px;background:#101b2df5;color:#f0f7ff;box-shadow:0 9px 30px #0008;font:13px system-ui;max-width:320px}#nexa-c-banner{left:12px;border-color:#a778ff}#nexa-c-status{right:12px}#nexa-c-banner[hidden],#nexa-c-status[hidden],#nexa-c-overlay[hidden]{display:none!important}#nexa-c-overlay{position:fixed;inset:0;background:#030710e8;z-index:10100;display:flex;align-items:center;justify-content:center;padding:10px}.nexa-c-panel{background:#0d192b;color:#eaf4ff;max-height:95vh;overflow:hidden;width:min(980px,98vw);border:1px solid #416585;border-radius:17px;box-shadow:0 22px 65px #000b;display:flex;flex-direction:column;font:13px system-ui}.nexa-c-head,.nexa-c-actions{padding:14px;display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;border-bottom:1px solid #294260}.nexa-c-actions{border-bottom:0;border-top:1px solid #294260}.nexa-c-body{overflow:auto;padding:14px}.nexa-c-card{background:#14253b;border:1px solid #2e4965;border-radius:11px;margin:9px 0;padding:12px}.nexa-c-pair{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0}.nexa-c-field{min-width:0}.nexa-c-field textarea,.nexa-c-edit{width:100%;box-sizing:border-box;min-height:90px;resize:vertical;color:#eaf4ff;background:#091321;border:1px solid #3b5672;border-radius:8px;padding:9px;font:12px/1.5 ui-monospace,monospace}.nexa-c-field label{display:block;margin-bottom:4px;color:#a8bfdb}.nexa-c-btn{background:#192f48;color:#ecf5ff;border:1px solid #58799a;padding:9px 12px;border-radius:9px;cursor:pointer;font:600 13px system-ui}.nexa-c-primary{background:#235b87;border-color:#68c5ee}.nexa-c-btn:disabled{opacity:.45;cursor:default}.nexa-c-note{color:#b1c6df;font-size:12px;margin:8px 0 12px;line-height:1.5}.nexa-c-choice{display:inline-flex;align-items:center;gap:4px;margin:7px 12px 5px 0}.nexa-c-message{padding:12px;border:1px solid #ae745b;border-radius:8px;margin:9px 0;background:#37232b}@media(max-width:650px){.nexa-c-pair{grid-template-columns:1fr}#nexa-c-status{bottom:3px;right:3px}#nexa-c-banner{bottom:48px;left:3px}}';
 // Notifications belong to the regular page flow, never fixed over clinical inputs.
 style.textContent+='#nexa-c-banner,#nexa-c-status{position:static!important;z-index:auto!important;display:inline-flex;align-items:center;gap:8px;max-width:100%;width:auto;box-shadow:none!important;font:12px system-ui;padding:5px 9px;margin:6px 8px 0 0;border-radius:9px}#nexa-c-banner.nexa-c-postponed{background:transparent!important;border-color:#49638966!important;color:inherit!important}#nexa-c-banner .nexa-c-btn{padding:5px 8px;font-size:12px}#nexa-c-status{border-color:transparent!important;background:transparent!important;color:inherit!important}#nexa-c-banner[hidden],#nexa-c-status[hidden]{display:none!important}#nexa-c-overlay .nexa-c-panel{max-height:94dvh}@media(max-width:650px){#nexa-c-banner,#nexa-c-status{margin:5px 0;max-width:100%;padding:5px 8px}#nexa-c-banner .nexa-c-btn{font-size:11px}}';
 (document.head||document.documentElement).appendChild(style);
 banner=el('div');banner.id='nexa-c-banner';banner.hidden=true;
 status=el('div');status.id='nexa-c-status';status.hidden=true;
 overlay=el('div');overlay.id='nexa-c-overlay';overlay.hidden=true;
 panel=el('div','','nexa-c-panel');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Resolução manual de conflito');
 const head=el('div','','nexa-c-head');title=el('strong','Prontuários conflitantes');head.append(title,button('Fechar',close));
 body=el('div','','nexa-c-body');actions=el('div','','nexa-c-actions');
 panel.append(head,body,actions);overlay.appendChild(panel);
 const header=document.querySelector('#mainApp header')||document.querySelector('header');
 const subtitle=header?.querySelector('.sub');
 if(subtitle){subtitle.insertAdjacentElement('afterend',banner);banner.insertAdjacentElement('afterend',status)}
 else if(header){header.append(banner,status)}
 else{document.body.prepend(banner,status)}
 document.body.append(overlay);
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!overlay.hidden)close()});
 return true;
}
function close(){
 // "Adiar" and "Fechar" dismiss the alert for 24h, not the clinical conflict.
 st.requestEpoch++;postpone();
 if(banner&&!banner.hidden){
   banner.classList.add('nexa-c-postponed');
   const action=banner.querySelector('button');
   if(action)action.textContent=action.textContent.replace(/^Revisar sincronização/,'Pendências de sincronização');
 }
 if(overlay)overlay.hidden=true;
 st.review=null;st.decisions={};st.id='';
 void refresh();
}
function setActions(...xs){actions.replaceChildren(...xs)}
function problem(error){body.prepend(el('div',message(error),'nexa-c-message'))}
function rows(){
 const lf=st.review.local.fields||{},rf=st.review.remote.fields||{};
 return [...new Set([...Object.keys(lf),...Object.keys(rf)])].sort().map(key=>({key,
  local:typeof lf[key]==='string'?lf[key]:'',server:typeof rf[key]==='string'?rf[key]:'',name:labels[key]||key}));
}
function field(label,value){
 const wrap=el('div','','nexa-c-field'),text=el('textarea'),caption=el('label',label);
 text.readOnly=true;text.value=value;wrap.append(caption,text);return wrap;
}
function pair(row){
 const card=el('section','','nexa-c-card');card.append(el('strong',row.name));
 const two=el('div','','nexa-c-pair');two.append(field('Neste computador',row.local),field('No servidor',row.server));
 card.append(two);return card;
}
async function open(id){
 if(!init())return;
 const request=++st.requestEpoch;
 overlay.hidden=false;st.id=id;st.decisions={};st.review=null;
 body.replaceChildren(el('div','Consultando as duas versões…'));
 setActions(button('Adiar aviso (24h)',close));
 try{
   const review=await api.reviewConflict(id);
   if(request!==st.requestEpoch||overlay.hidden||st.id!==id)return;
   st.review=review;
   title.textContent='Revisar sincronização — atendimento '+String(id).slice(0,8).toUpperCase();
   comparison();
 }catch(error){
   if(request!==st.requestEpoch||overlay.hidden)return;
   body.replaceChildren();problem(error);
 }
}
function openList(items){
 if(!init())return;
 st.requestEpoch++;st.id='';st.review=null;st.decisions={};
 overlay.hidden=false;title.textContent='Pendências de sincronização';
 body.replaceChildren(el('div','Há versões diferentes do mesmo atendimento neste computador e no servidor. Isso não significa perda do prontuário. O NEXA preserva ambas até você escolher qual manter. Você pode adiar sem apagar nenhuma versão.','nexa-c-note'));
 for(const rec of items){
   const row=el('div','','nexa-c-card');
   row.append(el('strong','Atendimento '+String(rec.encounter_id).slice(0,8).toUpperCase()),
     el('div','Rascunho local: '+String(rec.last_client_saved_at||'horário indisponível'),'nexa-c-note'),
     button('Comparar versões',()=>void open(rec.encounter_id),true));
   body.append(row);
 }
 setActions(button('Adiar aviso (24h)',close));
}
function comparison(){
 if(!st.review)return;body.replaceChildren(el('div','Há alterações diferentes do mesmo atendimento neste computador e no servidor. Nenhum prontuário foi apagado. Para impedir que uma versão sobrescreva a outra, o NEXA aguarda sua revisão. Adiar mantém as duas cópias e não impede o atendimento.','nexa-c-note'));
 const {local,remote}=st.review;
 body.append(el('div','Salvo localmente: '+String(local.last_client_saved_at||'sem horário')+' • Servidor: '+String(remote.updated_at||'sem horário')+' • Versão: '+String(remote.sync_version||0),'nexa-c-note'));
 const changed=rows().filter(x=>x.local!==x.server);
 for(const row of changed)body.append(pair(row));
 if(!changed.length)body.append(el('div','Não há diferenças nos campos clínicos; revise os metadados antes de confirmar.','nexa-c-note'));
 setActions(button('Adiar aviso (24h)',close),button('Manter servidor',()=>preview('server')),button('Usar local',()=>preview('local')),button('Mesclar manualmente',merge,true));
}
function merge(){
 if(!st.review)return;
 st.decisions={};body.replaceChildren(el('div','Escolha explicitamente a origem de cada campo diferente. Não há mesclagem automática.','nexa-c-note'));
 const diff=rows().filter(x=>x.local!==x.server);
 if(!diff.length){preview('server');return}
 for(const row of diff){
   const card=pair(row),edit=el('textarea','','nexa-c-edit');edit.hidden=true;edit.setAttribute('aria-label','Conteúdo final para '+row.name);
   for(const [key,text] of [['local','Usar local'],['server','Usar servidor'],['manual','Editar']]){
     const label=el('label','','nexa-c-choice'),radio=document.createElement('input');radio.type='radio';radio.name='nexa-choice-'+row.key;radio.value=key;
     radio.addEventListener('change',()=>{st.decisions[row.key]={source:key,...(key==='manual'?{value:edit.value}:{})};edit.hidden=key!=='manual'});
     label.append(radio,el('span',text));card.append(label);
   }
   edit.addEventListener('input',()=>{if(st.decisions[row.key]?.source==='manual')st.decisions[row.key].value=edit.value});
   card.append(edit);body.append(card);
 }
 setActions(button('Voltar',comparison),button('Adiar aviso (24h)',close),button('Revisar resultado',()=>preview('merge'),true));
}
function preview(mode){
 if(!st.review)return;let selected;
 try{selected=api.reconcileFields(st.review.local.fields||{},st.review.remote.fields||{},mode,st.decisions)}
 catch(error){problem(error);return}
 body.replaceChildren(el('div','Confira o conteúdo clínico que ficará no servidor. Ainda não foi gravado.','nexa-c-note'));
 for(const [key,value] of Object.entries(selected)){
   const card=el('section','','nexa-c-card');card.append(el('strong',labels[key]||key),field('Versão final',String(value)));body.append(card);
 }
 if(!Object.keys(selected).length)body.append(el('div','Nenhum campo clínico preenchido.','nexa-c-note'));
 const confirmation=el('label','','nexa-c-choice'),check=document.createElement('input');check.type='checkbox';
 confirmation.append(check,el('span','Revisei os dados clínicos e confirmo esta resolução.'));body.append(confirmation);
 const save=button('Confirmar e salvar',()=>void commit(mode),true);save.disabled=true;
 check.addEventListener('change',()=>{save.disabled=!check.checked});
 setActions(button('Voltar',mode==='merge'?merge:comparison),button('Adiar aviso (24h)',close),save);
}
async function commit(mode){
 if(st.busy||!st.review)return;st.busy=true;
 const review=st.review,id=st.id;
 for(const btn of actions.querySelectorAll('button'))btn.disabled=true;
 try{
   const result=await api.resolveConflict({id,expectedVersion:Number(review.remote.sync_version||0),
     localRevision:Number(review.local.local_revision||0),localSavedAt:review.local.last_client_saved_at,
     mode,decisions:st.decisions});
   if(!result?.resolved)throw new Error('NOT_SAVED');
   body.replaceChildren(el('div','Resolução confirmada: cópias preservadas e resultado persistido.','nexa-c-note'));
   setActions(button('Concluir',close,true));await refresh();
 }catch(error){
   problem(error);setActions(button('Reabrir revisão',()=>void open(id),true),button('Adiar aviso (24h)',close));
 }finally{st.busy=false}
}
async function refreshStatus(){
 if(!init())return;
 const userId=owner(),id=api.currentEncounterId();
 if(!userId||!id){status.hidden=true;return}
 try{
   const current=await api.get(id);
   if(!current||current.owner_user_id!==owner()){status.hidden=true;return}
   status.hidden=(current.sync_state==='synced'||current.sync_state==='conflict')&&!current.requires_form_refresh;
   status.textContent=current.requires_form_refresh?'Versão reconciliada: reabra o atendimento antes de editar':
     current.sync_state==='synced'?'Prontuário sincronizado no servidor':
     current.sync_state==='conflict'?'Conflito: cópia local preservada':
     current.sync_state==='locked'?'Prontuário bloqueado para edição':'Rascunho salvo localmente — aguardando sincronização';
 }catch{status.hidden=true}
}
async function refresh(){
 if(!init())return;
 try{
   const userId=owner();if(!userId){banner.hidden=true;status.hidden=true;return}
   if(st.review&&st.review.local.owner_user_id!==userId){
     st.requestEpoch++;overlay.hidden=true;st.review=null;st.id='';
   }
   const all=await api.all(),conflicts=all.filter(x=>x.owner_user_id===userId&&x.sync_state==='conflict');
   banner.replaceChildren();banner.hidden=!conflicts.length;
   const quiet=snoozed();
   banner.classList.toggle('nexa-c-postponed',quiet);
   if(conflicts.length){
     const count=conflicts.length;
     // Always leave a small, accessible way back in the header. No floating warning.
     banner.append(button(quiet?'Pendências de sincronização ('+count+')':'Revisar sincronização ('+count+')',
       ()=>count===1?void open(conflicts[0].encounter_id):openList(conflicts),!quiet));
   }
   await refreshStatus();
 }catch{banner.hidden=true;status.hidden=true}
}
window.nexaEncounterConflictReview18102={open,refresh,close,openList,postpone,isPostponed:snoozed,restoreNotice};
for(const event of ['nexa:encounter-sync-conflict','nexa:encounter-conflict-resolved','nexa:encounter-locked']){
 window.addEventListener(event,()=>void refresh());
}
for(const event of ['nexa:encounter-local-saved','nexa:encounter-synced','nexa:encounter-sync-failed','nexa:encounter-started']){
 window.addEventListener(event,()=>void refreshStatus());
}
window.addEventListener('online',()=>void refresh());window.addEventListener('focus',()=>void refresh());
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void refresh(),{once:true});
else void refresh();
setTimeout(()=>void refresh(),1500);setTimeout(()=>void refresh(),4500);
})();
