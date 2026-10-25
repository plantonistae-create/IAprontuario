/* NEXA Radar Dynamic Focus v18.16 — presentation only.
   Clinical facts, question ranking, risk decisions and recorder are owned by existing modules. */
(()=>{
'use strict';
if(window.__NEXA_RADAR_DYNAMIC_FOCUS_V18_16__)return;
window.__NEXA_RADAR_DYNAMIC_FOCUS_V18_16__=true;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CORE=Object.freeze([
 {id:'comorbidities',label:'Comorbidades'},
 {id:'allergies',label:'Alergias'},
 {id:'medicines',label:'Medicamentos contínuos'}
]);
const PRIORITY={critical:'Crítica',high:'Importante',moderate:'Complementar',low:'Complementar'};
let filter='now',signature='',encounter='';
function state(){const s=window.nexaRadar?.state||window.radarState;return s&&Array.isArray(s.items)?s:null;}
function domain(i){return i.status==='confirm'||i.priority==='critical'||i.redFlag?'safety':CORE.some(c=>c.id===i.concept)?'history':'context';}
function model(s){
 const items=s?.items||[],alerts=s?.alerts||[];
 const safety=items.filter(i=>domain(i)==='safety'),context=items.filter(i=>domain(i)==='context');
 const core=CORE.map(c=>{
  const i=items.find(x=>x.concept===c.id);
  const known=['known_present','known_absent'].includes(s?.facts?.[c.id]?.state);
  return {...c,item:i,status:known?'documented':i?.status==='confirm'?'confirm':'pending'};
 });
 const unavailable=!!s?.error||!!s?.transcriptIncomplete||['unavailable','stale'].includes(s?.transcriptStatus);
 return {s,items,alerts,safety,context,core,unavailable};
}
function status(m){
 if(m.unavailable)return 'Análise incompleta — confira a transcrição';
 if(m.s?.busy)return 'Interpretando informações registradas';
 if(m.alerts.length||m.safety.length)return 'Há pontos de segurança para revisar';
 if(!m.s?.hasContext)return 'Aguardando contexto clínico';
 return m.items.length?'Investigação em andamento':'Sem novas lacunas identificadas no momento';
}
function mount(){
 const card=$('realtimeRadarCard'),head=$('nexaRadarOpsHeader18130');
 if(!card||!head||!$('nexaRadarPsView18131'))return false;
 let root=$('nexaRadarDynamic18160');
 if(!root||root.parentNode!==card){root=document.createElement('div');root.id='nexaRadarDynamic18160';head.after(root);signature='';}
 card.dataset.nexaRadarFocus='1';return true;
}
function shell(){
 return '<section class="nexa-focus-shell18160" aria-label="Investigação dinâmica do Radar">'+
 '<header class="nexa-focus-header18160"><div class="nexa-focus-identity18160"><span>RADAR / FOCO CLÍNICO</span><h3>Investigação em tempo real <i aria-hidden="true"></i></h3><p id="nexaRadarFocusStatus18160" role="status"></p></div>'+
 '<button type="button" class="nexa-focus-alert18160" data-focus-alert="1" aria-label="Abrir riscos e alertas">Riscos e alertas <b id="nexaFocusAlertCount18160">0</b></button></header>'+
 '<div class="nexa-focus-grid18160"><section class="nexa-focus-questions18160" aria-label="Trilha de investigação">'+
 '<div class="nexa-focus-title18160"><div><strong>Próximas perguntas</strong><small>Ordenadas pelo Radar conforme o contexto</small></div><span id="nexaFocusPending18160" class="nexa-focus-counter18160"></span></div>'+
 '<div class="nexa-focus-filters18160" role="group" aria-label="Exibir perguntas por categoria">'+
 '<button type="button" data-focus-filter="now">Agora</button><button type="button" data-focus-filter="context">Contexto</button>'+
 '<button type="button" data-focus-filter="safety">Segurança</button></div>'+
 '<div id="nexaFocusQuestions18160" class="nexa-focus-list18160"></div>'+
 '<p class="nexa-focus-caution18160">A prioridade auxilia a anamnese; não substitui avaliação ou decisão médica.</p></section>'+
 '<section class="nexa-focus-history18160" aria-label="Histórico clínico essencial"><div class="nexa-focus-title18160"><div><strong>Histórico essencial</strong>'+
 '<small>Três verificações em toda consulta</small></div><span id="nexaFocusHistoryCount18160" class="nexa-focus-counter18160"></span></div>'+
 '<div id="nexaFocusHistory18160" class="nexa-focus-history-list18160"></div></section></div></section>';
}
function chosen(m){
 if(filter==='safety')return m.safety.slice(0,4);
 if(filter==='context')return m.context.slice(0,4);
 const sorted=[...m.safety,...m.context,...m.items.filter(i=>domain(i)==='history')];
 return sorted.filter((x,n)=>sorted.findIndex(i=>i.id===x.id)===n).slice(0,3);
}
function questionsMarkup(m){
 const list=chosen(m);
 if(!list.length)return '<p class="nexa-focus-empty18160">'+esc(
  filter==='safety'?'Nenhuma pendência crítica ou contraditória identificada neste momento.':
  filter==='context'?'Nenhuma pergunta contextual em aberto no momento.':
  !m.s?.hasContext?'As perguntas aparecerão conforme o registro clínico evoluir.':
  'Nenhuma pergunta adicional sugerida nesta etapa.')+'</p>';
 return list.map((i,n)=>{
  const label=i.status==='confirm'?'Confirmar resposta':(PRIORITY[i.priority]||'Revisar');
  return '<button type="button" class="nexa-focus-question18160" data-focus-item="'+esc(i.id)+'" data-priority="'+esc(i.priority)+'" data-status="'+esc(i.status)+'">'+
   '<span class="nexa-focus-index18160">'+String(n+1).padStart(2,'0')+'</span>'+
   '<span class="nexa-focus-copy18160"><strong>'+esc(i.question)+'</strong>'+
   (i.reason?'<small>'+esc(i.reason)+'</small>':'')+'</span><span class="nexa-focus-flag18160">'+esc(label)+' <i aria-hidden="true">↗</i></span></button>';
 }).join('');
}
function historyMarkup(m){
 return m.core.map(c=>{
  const known=c.status==='documented',label=known?'Registrado':c.status==='confirm'?'Confirmar':'Pendente';
  const statusEl=known?'<span class="nexa-focus-history-done18160">✓ Registrado</span>':
    '<button type="button" data-focus-item="'+esc(c.item?.id||'')+'" class="nexa-focus-history-action18160"'+
    (c.item?'':' disabled')+'>'+esc(label)+' <span aria-hidden="true">↗</span></button>';
  return '<div class="nexa-focus-history-row18160" data-concept="'+c.id+'" data-state="'+c.status+'">'+
   '<span class="nexa-focus-dot18160" aria-hidden="true"></span><span>'+esc(c.label)+'</span>'+statusEl+'</div>';
 }).join('');
}
function render(){
 if(!mount())return false;
 const s=state()||{},m=model(s),root=$('nexaRadarDynamic18160'),current=String(s.encounter||'');
 if(current!==encounter){encounter=current;filter='now';signature='';}
 const next=JSON.stringify([encounter,filter,m.items.map(i=>[i.id,i.question,i.reason,i.priority,i.status]),
  m.core.map(c=>c.status),m.alerts.length,s.busy,s.error,s.transcriptStatus,s.transcriptIncomplete,s.hasContext]);
 if(next===signature)return true;
 if(!root.querySelector('.nexa-focus-shell18160'))root.innerHTML=shell();
 root.querySelector('#nexaRadarFocusStatus18160').textContent=status(m);
 root.querySelector('#nexaFocusAlertCount18160').textContent=String(m.alerts.length);
 root.querySelector('#nexaFocusPending18160').textContent=m.items.length+' em aberto';
 root.querySelector('#nexaFocusHistoryCount18160').textContent=m.core.filter(c=>c.status==='documented').length+'/3';
 root.querySelector('#nexaFocusQuestions18160').innerHTML=questionsMarkup(m);
 root.querySelector('#nexaFocusHistory18160').innerHTML=historyMarkup(m);
 for(const b of root.querySelectorAll('[data-focus-filter]'))b.setAttribute('aria-pressed',String(b.dataset.focusFilter===filter));
 root.dataset.unavailable=m.unavailable?'1':'0';
 root.dataset.alerts=m.alerts.length?'1':'0';
 signature=next;return true;
}
function goToQuestion(id){
 const api=window.nexaRadar,item=api?.state?.items?.find(i=>i.id===id);
 if(!item)return false;
 window.nexaRadarPsMode18131?.setMode?.('complete');
 const details=$('nexaRadarFullDetails');if(details)details.open=true;
 const tab=$('ngQuestionsTab');if(tab?.getAttribute('aria-selected')!=='true')tab?.click();
 if(!api.expanded&&api.state.items.findIndex(i=>i.id===id)>=5)api.toggle?.();
 requestAnimationFrame(()=>{
  const row=[...document.querySelectorAll('#radarQuestions [data-item]')].find(x=>x.dataset.item===id);
  if(!row)return;
  row.tabIndex=-1;row.focus({preventScroll:true});
  const details=row.querySelector('details.ng-manual');if(details)details.open=true;
  row.scrollIntoView({behavior:'auto',block:'nearest'});
 });return true;
}
function click(event){
 if(!event.target.closest?.('#nexaRadarDynamic18160'))return;
 const btn=event.target.closest?.('button');if(!btn||btn.disabled)return;
 if(btn.dataset.focusFilter){filter=btn.dataset.focusFilter;signature='';render();return;}
 if(btn.dataset.focusAlert){
  window.nexaRadarPsMode18131?.setMode?.('complete');
  const details=$('nexaRadarFullDetails');if(details)details.open=true;
  $('ngRisksTab')?.click();
  requestAnimationFrame(()=>$('ngRisksPanel')?.scrollIntoView({behavior:'auto',block:'nearest'}));
  return;
 }
 if(btn.dataset.focusItem)goToQuestion(btn.dataset.focusItem);
}
function boot(){
 document.addEventListener('click',click);
 for(const name of ['nexa:radar-state','nexa:consultation-reset','nexa:continuous-soap-mounted','pageshow'])
  window.addEventListener(name,()=>requestAnimationFrame(render));
 render();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.nexaRadarDynamicFocus18160={mount,render,goToQuestion,getFilter:()=>filter};
})();
