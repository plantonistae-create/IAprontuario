/* NEXA v18.12 — automatic Radar + post-consultation review */
(()=>{
'use strict';
if(window.__NEXA_RADAR_AUTO_REVIEW_V18_12__)return;
window.__NEXA_RADAR_AUTO_REVIEW_V18_12__=true;

const $=id=>document.getElementById(id);
const q=(sel,root=document)=>root.querySelector(sel);
const qa=(sel,root=document)=>[...root.querySelectorAll(sel)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const uniq=a=>[...new Set(a.filter(Boolean))];
let mounted=false,lastState=null,vitalWriting=false,preProcessVitals='',statusObserver=null,phase='consult';
const vitalCache=new Map(),vitalAmbiguities=new Map();

const VITALS={
  bp:{label:'PA',name:'Pressão arterial',format:v=>`PA: ${v} mmHg`,plausible:v=>{const [s,d]=v.split('/').map(Number);return s>=40&&s<=300&&d>=20&&d<=200}},
  hr:{label:'FC',name:'Frequência cardíaca',format:v=>`FC: ${v} bpm`,plausible:v=>+v>=20&&+v<=250},
  spo2:{label:'SpO₂',name:'Saturação',format:v=>`SpO2: ${v}%`,plausible:v=>+v>=50&&+v<=100},
  rr:{label:'FR',name:'Frequência respiratória',format:v=>`FR: ${v} irpm`,plausible:v=>+v>=4&&+v<=80},
  temperature:{label:'T',name:'Temperatura',format:v=>`T: ${String(v).replace('.',',')} °C`,plausible:v=>+v>=25&&+v<=45}
};
const VITAL_ORDER=['bp','hr','spo2','temperature','rr'];
const ASK={
  dyspnea:'Teve falta de ar ou cansaço para respirar?',
  syncope:'Teve desmaio ou sensação de que iria desmaiar?',
  sweating:'Teve suor frio ou sudorese diferente do habitual?',
  fever:'Teve febre nas últimas horas ou dias?',
  onset:'Quando isso começou?',
  localization:'Onde exatamente é a dor?',
  intensity:'De zero a dez, qual a intensidade da dor?',
  radiation:'A dor se espalha para algum lugar?',
  aggravation:'O que piora a dor?',
  relief:'O que melhora ou alivia?',
  vomiting:'Teve vômitos persistentes?',
  bleeding:'Percebeu algum sangramento?',
  trauma:'Houve queda, trauma ou torção recente?',
  mechanism:'Como aconteceu o trauma?',
  anticoagulant:'Usa algum anticoagulante?',
  immuno:'Tem alguma condição ou tratamento que reduza a imunidade?',
  pregnancy:'Existe possibilidade de gestação ou puerpério?',
  allergies:'Tem alergia a algum medicamento?',
  medicines:'Usa algum medicamento regularmente?',
  bp:'Qual foi a pressão arterial aferida?',
  hr:'Qual foi a frequência cardíaca aferida?',
  rr:'Qual foi a frequência respiratória aferida?',
  spo2:'Qual foi a saturação de oxigênio aferida?',
  temperature:'Qual foi a temperatura aferida?',
  focal:'Houve fraqueza, alteração da fala ou assimetria?',
  consciousness:'Houve confusão, sonolência excessiva ou alteração de consciência?',
  sudden:'A dor começou de repente ou atingiu intensidade máxima logo no início?',
  meningism:'Há rigidez importante na nuca?',
  peritonism:'Há sinais de irritação peritoneal ao exame?',
  neurovascular:'Como está a avaliação neurovascular distal?'
};

function style(){
 if($('nexaRadarAutoReviewStyle1812'))return;
 const s=document.createElement('style');s.id='nexaRadarAutoReviewStyle1812';s.textContent=`
 body[data-nexa-clinical-phase="consult"] #nexaFlowModeBar,
 body[data-nexa-clinical-phase="consult"] #nexaFlowHistory,
 body[data-nexa-clinical-phase="consult"] #nexaFlowExam,
 body[data-nexa-clinical-phase="consult"] #nexaFlowAssessment,
 body[data-nexa-clinical-phase="consult"] #nexaFlowPlan,
 body[data-nexa-clinical-phase="consult"] #nexaFlowFinal,
 body[data-nexa-clinical-phase="consult"] #nexaReviewHeader{display:none!important}
 body[data-nexa-clinical-phase="review"] #nexaFlowModeBar{display:flex!important}
 body[data-nexa-clinical-phase="review"] #nexaReviewHeader{display:flex!important}
 body[data-nexa-clinical-phase="review"] #nexaFlowLive{display:none!important}
 body[data-nexa-clinical-phase="processing"] #nexaFlowHistory,
 body[data-nexa-clinical-phase="processing"] #nexaFlowExam,
 body[data-nexa-clinical-phase="processing"] #nexaFlowAssessment,
 body[data-nexa-clinical-phase="processing"] #nexaFlowPlan,
 body[data-nexa-clinical-phase="processing"] #nexaFlowFinal,
 body[data-nexa-clinical-phase="error"] #nexaFlowHistory,
 body[data-nexa-clinical-phase="error"] #nexaFlowExam,
 body[data-nexa-clinical-phase="error"] #nexaFlowAssessment,
 body[data-nexa-clinical-phase="error"] #nexaFlowPlan,
 body[data-nexa-clinical-phase="error"] #nexaFlowFinal{display:block!important}
 body[data-nexa-clinical-phase="processing"] #nexaReviewHeader,
 body[data-nexa-clinical-phase="error"] #nexaReviewHeader{display:flex!important}
 #nexaReviewHeader{display:none;align-items:flex-start;justify-content:space-between;gap:14px;border:1px solid var(--nexa-line);background:var(--nexa-surface);border-radius:18px;padding:15px 16px;margin:0 0 14px}
 #nexaReviewHeader strong{font-size:17px;color:var(--nexa-text)}#nexaReviewHeader p{margin:3px 0 0;font-size:11px;color:var(--nexa-muted);line-height:1.45}
 #nexaReviewHeader span{font-size:10px;font-weight:850;color:var(--nexa-brand);white-space:nowrap}
 #realtimeRadarCard{padding:16px!important}
 #realtimeRadarCard #nexaContextualStatus{display:none!important}
 #nexaAutoRadarWorkspace{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,360px);gap:12px;align-items:start;margin-top:10px}
 #nexaAutoRadarMain{display:grid;gap:10px;min-width:0}
 .nexa-auto-status{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}
 .nexa-auto-metric{border:1px solid var(--nexa-line);background:var(--nexa-bg);border-radius:11px;padding:9px 8px;min-width:0}
 .nexa-auto-metric strong{display:block;font-size:18px;line-height:1;color:var(--nexa-text)}.nexa-auto-metric span{display:block;margin-top:4px;font-size:9px;color:var(--nexa-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 .nexa-auto-metric.critical strong,.nexa-auto-metric.alert strong{color:var(--nexa-danger)}.nexa-auto-metric.confirm strong{color:var(--nexa-warn)}.nexa-auto-metric.ok strong{color:var(--nexa-ok)}
 #nexaNextBest{border:1px solid color-mix(in srgb,var(--nexa-brand) 34%,var(--nexa-line));background:color-mix(in srgb,var(--nexa-brand) 5%,var(--nexa-surface));border-radius:14px;padding:14px}
 .nexa-next-kicker{font-size:10px;font-weight:900;letter-spacing:.08em;color:var(--nexa-brand);text-transform:uppercase}
 #nexaNextBest h3{font-size:20px;line-height:1.25;margin:7px 0 5px;color:var(--nexa-text)}#nexaNextBest p{font-size:11px;line-height:1.45;color:var(--nexa-muted);margin:0}
 .nexa-next-how{margin-top:10px!important;padding-top:9px;border-top:1px solid color-mix(in srgb,var(--nexa-brand) 18%,var(--nexa-line));color:var(--nexa-text)!important}.nexa-next-how strong{color:var(--nexa-brand)}
 .nexa-auto-card{border:1px solid var(--nexa-line);background:var(--nexa-surface-2);border-radius:13px;padding:12px}
 .nexa-auto-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.nexa-auto-card-head strong{font-size:12px}.nexa-auto-card-head span{font-size:9px;color:var(--nexa-muted)}
 .nexa-priority-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.nexa-priority-item{border:1px solid var(--nexa-line);border-radius:10px;background:var(--nexa-surface);padding:9px}.nexa-priority-item b{display:block;font-size:10.5px;color:var(--nexa-text)}.nexa-priority-item small{display:block;font-size:9px;color:var(--nexa-muted);margin-top:4px}.nexa-priority-item[data-priority="critical"]{border-color:color-mix(in srgb,var(--nexa-danger) 35%,var(--nexa-line));background:color-mix(in srgb,var(--nexa-danger) 4%,var(--nexa-surface))}
 .nexa-vitals-row{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}.nexa-vital-pill{border:1px solid var(--nexa-line);border-radius:9px;padding:8px;background:var(--nexa-surface)}.nexa-vital-pill b{display:block;font-size:9px;color:var(--nexa-muted)}.nexa-vital-pill span{display:block;font-size:11px;font-weight:850;color:var(--nexa-text);margin-top:3px}.nexa-vital-pill.confirm{border-color:color-mix(in srgb,var(--nexa-warn) 40%,var(--nexa-line));background:color-mix(in srgb,var(--nexa-warn) 5%,var(--nexa-surface))}
 #nexaRadarFullDetails{border:1px solid var(--nexa-line);border-radius:12px;background:var(--nexa-surface);overflow:hidden}#nexaRadarFullDetails>summary{cursor:pointer;padding:10px 12px;font-size:10.5px;font-weight:850;color:var(--nexa-brand)}#nexaRadarFullDetails>.ng-main{padding:0 10px 10px}
 #nexaAutoRadarWorkspace>.ng-side{display:grid!important;gap:10px!important;min-width:0!important}
 #nexaAutoRadarWorkspace>.ng-side>.ng-panel{margin:0!important}
 #ngClarified .ng-evidence-row:nth-of-type(n+6){display:none}
 #ngConfirm .ng-confirm-row:nth-of-type(n+5){display:none}
 #nexaFlowExam #nexaExamOptional>summary{cursor:pointer;color:var(--nexa-brand);font-size:11px;font-weight:850;padding:9px 0}
 #nexaFinalPending{border:1px solid color-mix(in srgb,var(--nexa-warn) 34%,var(--nexa-line));background:color-mix(in srgb,var(--nexa-warn) 4%,var(--nexa-surface));border-radius:13px;padding:12px;margin-bottom:10px}
 #nexaFinalPending[data-empty="1"]{border-color:color-mix(in srgb,var(--nexa-ok) 28%,var(--nexa-line));background:color-mix(in srgb,var(--nexa-ok) 4%,var(--nexa-surface))}
 .nexa-final-pending-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.nexa-final-pending-head strong{font-size:13px}.nexa-final-pending-head span{font-size:9px;color:var(--nexa-muted)}
 .nexa-final-pending-list{display:grid;gap:6px;margin-top:9px}.nexa-final-pending-row{display:grid;grid-template-columns:1fr auto;gap:9px;align-items:center;border-top:1px solid var(--nexa-line);padding-top:7px}.nexa-final-pending-row:first-child{border-top:0;padding-top:0}.nexa-final-pending-row b{display:block;font-size:10.5px}.nexa-final-pending-row small{display:block;font-size:9px;color:var(--nexa-muted);margin-top:2px}.nexa-final-pending-row button,#nexaFinalContinue{border:1px solid var(--nexa-line);background:var(--nexa-surface);color:var(--nexa-brand);border-radius:9px;padding:7px 9px;font-size:9.5px;font-weight:850;cursor:pointer}
 .nexa-final-pending-actions{display:flex;justify-content:flex-end;margin-top:9px}
 @media(max-width:1050px){#nexaAutoRadarWorkspace{grid-template-columns:minmax(0,1fr) minmax(260px,320px)}.nexa-auto-status{grid-template-columns:repeat(3,minmax(0,1fr))}.nexa-vitals-row{grid-template-columns:repeat(3,minmax(0,1fr))}}
 @media(max-width:820px){#nexaAutoRadarWorkspace{grid-template-columns:1fr}.nexa-auto-status{grid-template-columns:repeat(3,minmax(0,1fr))}.nexa-priority-list{grid-template-columns:1fr}.nexa-vitals-row{grid-template-columns:repeat(2,minmax(0,1fr))}#nexaNextBest h3{font-size:18px}#nexaReviewHeader{flex-direction:column}}
 `;document.head.appendChild(s);
}
function vitalField(){return $('nexaVitalSigns')||q('.field[data-key="sinais_vitais"] textarea')}
function phaseFromUi(){
 const status=String($('status')?.textContent||'');
 let processed=false;try{processed=!!window.lastProcessedMeta}catch{}
 if(processed||/processamento conclu[ií]do|rascunho gerado/i.test(status))return'review';
 if(document.body.dataset.nexaProcessing==='1'||/transcrevendo|estruturando/i.test(status))return'processing';
 if(/falha ao transcrever|falha ao estruturar|sess[aã]o expirou/i.test(status))return'error';
 return'consult';
}
function setPhase(next,reason='manual'){
 phase=['review','processing','error'].includes(next)?next:'consult';document.body.dataset.nexaClinicalPhase=phase;
 if(phase==='review'||phase==='error')renderFinalPending(lastState);
 const header=$('nexaReviewHeader');if(header)header.dataset.reason=reason;
 window.dispatchEvent(new CustomEvent('nexa:clinical-phase',{detail:{phase,reason}}));return phase;
}
function syncPhase(reason='ui'){return setPhase(phaseFromUi(),reason)}
function conceptName(id){return window.NexaRadarEngine?.concepts?.[id]?.label||id}
function displayQuestion(item){
 if(!item)return null;
 const label=conceptName(item.concept),suggested=ASK[item.concept]||(`Pode me esclarecer ${String(label).toLowerCase()}?`);
 const title=item.status==='confirm'?`Confirmar agora: ${label}`:item.category==='vitals'?`Registrar agora: ${label}`:`Perguntar agora: ${suggested.replace(/[?.!]+$/,'') }?`;
 return{title,suggested,reason:item.reason||'Informação priorizada pelo Radar conforme o contexto atual.'};
}
function renderMetrics(state){
 const clarified=Array.isArray(state?.clarified)?state.clarified:[],items=Array.isArray(state?.items)?state.items:[],confirm=Array.isArray(state?.confirm)?state.confirm:[],alerts=Array.isArray(state?.alerts)?state.alerts:[];
 const pending=items.filter(i=>i.status!=='confirm').length,essential=items.filter(i=>i.priority==='critical').length;
 const host=$('nexaAutoStatus');if(!host)return;
 host.innerHTML=`
  <div class="nexa-auto-metric ok"><strong>${clarified.length}</strong><span>Esclarecidas</span></div>
  <div class="nexa-auto-metric"><strong>${pending}</strong><span>Pendentes</span></div>
  <div class="nexa-auto-metric confirm"><strong>${confirm.length}</strong><span>A confirmar</span></div>
  <div class="nexa-auto-metric alert"><strong>${alerts.length}</strong><span>Alertas</span></div>
  <div class="nexa-auto-metric critical"><strong>${essential}</strong><span>Essencial agora</span></div>`;
 const topPending=$('nfPending'),topAlerts=$('nfAlerts'),topScore=$('nfScore');
 if(topPending)topPending.textContent=`${pending} pendência${pending===1?'':'s'}`;
 if(topAlerts)topAlerts.textContent=`${alerts.length} alerta${alerts.length===1?'':'s'}`;
 if(topScore)topScore.textContent='Radar contextual';
}
function renderNext(state){
 const host=$('nexaNextBest');if(!host)return;
 const items=Array.isArray(state?.items)?state.items:[],item=items[0],copy=displayQuestion(item);
 if(!copy){host.innerHTML='<div class="nexa-next-kicker">Próxima pergunta</div><h3>Nenhuma pergunta prioritária no momento.</h3><p>Continue a consulta normalmente. O Radar volta a priorizar se surgir nova lacuna relevante.</p>';return}
 host.innerHTML=`<div class="nexa-next-kicker">${item.status==='confirm'?'A confirmar':'Próxima melhor pergunta'}</div><h3>${esc(copy.title)}</h3><p>${esc(copy.reason)}</p><p class="nexa-next-how"><strong>Forma sugerida:</strong> “${esc(copy.suggested)}”</p>`;
}
function renderPriorities(state){
 const host=$('nexaPriorityList');if(!host)return;const items=(state?.items||[]).slice(1,5);
 host.innerHTML=items.length?items.map(i=>`<div class="nexa-priority-item" data-priority="${esc(i.priority)}"><b>${esc(conceptName(i.concept))}</b><small>${i.status==='confirm'?'A confirmar':i.priority==='critical'?'Essencial agora':i.priority==='high'?'Importante':'Depois'}</small></div>`).join(''):'<div class="nexa-priority-item"><b>Sem outras pendências prioritárias</b><small>O Radar continua acompanhando a conversa.</small></div>';
}
function parseVital(id,quote){
 const t=String(quote||'');let m;
 if(id==='bp'&&(m=t.match(/\b(?:pa|press[aã]o(?: arterial)?)\s*[:=]?\s*(?:talvez|aproximadamente|aprox\.?|por volta(?: de)?|cerca de)?\s*(\d{2,3})\s*(?:x|\/|por)\s*(\d{2,3})/i)))return`${+m[1]}/${+m[2]}`;
 if(id==='hr'&&(m=t.match(/\b(?:fc|frequ[eê]ncia card[ií]aca)\s*[:=]?\s*(?:talvez|aproximadamente|aprox\.?|por volta(?: de)?|cerca de)?\s*(\d{2,3})/i)))return String(+m[1]);
 if(id==='rr'&&(m=t.match(/\b(?:fr|frequ[eê]ncia respirat[oó]ria)\s*[:=]?\s*(?:talvez|aproximadamente|aprox\.?|por volta(?: de)?|cerca de)?\s*(\d{1,3})/i)))return String(+m[1]);
 if(id==='spo2'&&(m=t.match(/\b(?:spo2|sato2|satura[cç][aã]o(?: de oxig[eê]nio)?)\s*[:=]?\s*(?:talvez|aproximadamente|aprox\.?|por volta(?: de)?|cerca de)?\s*(\d{2,3})/i)))return String(+m[1]);
 if(id==='temperature'&&(m=t.match(/\b(?:temperatura|temp\.?|febre|t)\s*(?:de|:|=)?\s*(3\d|4[0-3])(?:(?:[,.](\d))|(?:\s+e\s+meio))?/i))){const decimal=/\s+e\s+meio/i.test(m[0])?'5':(m[2]||'');return decimal?`${+m[1]}.${decimal}`:String(+m[1])}
 return'';
}
function fieldVitalValue(id,text){
 const t=String(text||'');let m;
 if(id==='bp'&&(m=t.match(/\bPA\s*:\s*(\d{2,3})\s*\/\s*(\d{2,3})/i)))return`${+m[1]}/${+m[2]}`;
 if(id==='hr'&&(m=t.match(/\bFC\s*:\s*(\d{2,3})/i)))return String(+m[1]);
 if(id==='rr'&&(m=t.match(/\bFR\s*:\s*(\d{1,3})/i)))return String(+m[1]);
 if(id==='spo2'&&(m=t.match(/\bSpO2\s*:\s*(\d{2,3})/i)))return String(+m[1]);
 if(id==='temperature'&&(m=t.match(/\bT\s*:\s*(\d{2})(?:[,.](\d))?/i)))return m[2]?`${+m[1]}.${m[2]}`:String(+m[1]);
 return'';
}
function evidenceVital(id,fact){
 let evidence=(fact?.evidence||[]).filter(e=>e?.section==='transcript'&&e?.quote).map(e=>({quote:String(e.quote),value:parseVital(id,e.quote)})).filter(e=>e.value);
 if(!evidence.length)return null;
 const correction=evidence.findLastIndex(e=>/corrigindo|corre[cç][aã]o|na verdade|retificando/i.test(e.quote));if(correction>=0)evidence=evidence.slice(correction);
 const values=uniq(evidence.map(e=>e.value)),last=evidence.at(-1),uncertain=/\b(?:talvez|acho|aproximad|por volta|ou)\b/i.test(last.quote)||values.length>1;
 const meta=VITALS[id];if(!meta||!meta.plausible(last.value))return{status:'confirm',value:last.value,quote:last.quote,reason:'Valor fora da faixa de validação de entrada; confirmar antes de registrar.'};
 if(uncertain)return{status:'confirm',value:last.value,quote:last.quote,reason:values.length>1?'Mais de um valor foi identificado na conversa.':'A fala contém marcador de incerteza.'};
 return{status:'clear',value:last.value,quote:last.quote};
}
function writeVital(id,value){
 const meta=VITALS[id],ta=vitalField();if(!meta||!ta||!value)return false;
 const existing=fieldVitalValue(id,ta.value);
 if(existing&&existing!==value){vitalAmbiguities.set(id,{value,quote:'',reason:`Valor falado (${value}) difere do valor já registrado (${existing}).`});return false}
 if(existing===value)return false;
 const line=meta.format(value),current=String(ta.value||'').trim();
 vitalWriting=true;ta.value=[current,line].filter(Boolean).join('\n');ta.dispatchEvent(new Event('input',{bubbles:true}));ta.dispatchEvent(new Event('change',{bubbles:true}));vitalWriting=false;
 vitalCache.set(id,value);try{window.nexaEncounterAutosave18101?.preserve?.('spoken_vitals')}catch{}return true;
}
function captureVitals(state){
 if(vitalWriting||!state?.facts)return{captured:[],confirm:[]};
 const captured=[],confirm=[];
 for(const id of VITAL_ORDER){
  const finding=evidenceVital(id,state.facts[id]);if(!finding)continue;
  if(finding.status==='confirm'){vitalAmbiguities.set(id,finding);confirm.push(id);continue}
  vitalAmbiguities.delete(id);vitalCache.set(id,finding.value);if(writeVital(id,finding.value))captured.push(id);
 }
 renderVitals();return{captured,confirm};
}
function renderVitals(){
 const host=$('nexaAutoVitals');if(!host)return;const field=String(vitalField()?.value||'');
 host.innerHTML=VITAL_ORDER.map(id=>{const meta=VITALS[id],amb=vitalAmbiguities.get(id),value=fieldVitalValue(id,field)||vitalCache.get(id)||'';return`<div class="nexa-vital-pill${amb?' confirm':''}"><b>${meta.label}</b><span>${esc(amb?'A confirmar':value||'—')}</span></div>`}).join('');
}
function ensureLayout(){
 const card=$('realtimeRadarCard');if(!card||$('nexaAutoRadarWorkspace'))return !!$('nexaAutoRadarWorkspace');
 const layout=q('.ng-layout',card),main=q('.ng-main',layout),side=q('.ng-side',layout);if(!layout||!main||!side)return false;
 const workspace=document.createElement('div');workspace.id='nexaAutoRadarWorkspace';
 const auto=document.createElement('div');auto.id='nexaAutoRadarMain';auto.innerHTML=`
   <div class="nexa-auto-status" id="nexaAutoStatus"></div>
   <section id="nexaNextBest"></section>
   <section class="nexa-auto-card"><div class="nexa-auto-card-head"><strong>Pendências relevantes</strong><span>somente prioridades atuais</span></div><div class="nexa-priority-list" id="nexaPriorityList"></div></section>
   <section class="nexa-auto-card"><div class="nexa-auto-card-head"><strong>Sinais vitais</strong><span>captura automática quando o valor é claro</span></div><div class="nexa-vitals-row" id="nexaAutoVitals"></div></section>`;
 const details=document.createElement('details');details.id='nexaRadarFullDetails';details.innerHTML='<summary>Ver Radar completo / registrar manualmente</summary>';details.appendChild(main);auto.appendChild(details);
 workspace.append(auto,side);layout.replaceWith(workspace);return true;
}
function ensureReview(){
 const root=$('nexaUnifiedFlow');if(!root)return false;
 if(!$('nexaReviewHeader')){const h=document.createElement('div');h.id='nexaReviewHeader';h.innerHTML='<div><strong>Revisão pós-consulta</strong><p>O NEXA estruturou o atendimento. Revise apenas o essencial antes de copiar o resultado.</p></div><span>CONTÍNUO / SOAP · MESMOS DADOS</span>';root.before(h)}
 const exam=$('nexaExamQuickComposer');if(exam&&!$('nexaExamOptional')){const d=document.createElement('details');d.id='nexaExamOptional';d.innerHTML='<summary>Complementar exame físico por clique (opcional)</summary>';exam.before(d);d.appendChild(exam)}
 const final=$('nexaFlowFinal'),body=q('.nexa-flow-body',final);if(body&&!$('nexaFinalPending')){const p=document.createElement('section');p.id='nexaFinalPending';body.prepend(p)}
 return true;
}
function pendingTarget(item){
 const id=item?.concept;
 if(['bp','hr','rr','spo2','temperature'].includes(id))return'#nexaVitalSigns';
 const section=item?.targetSection||window.NexaRadarEngine?.concepts?.[id]?.section;
 if(section)return `.field[data-key="${section}"] textarea`;
 return'';
}
function pendingItems(state){
 const out=[],seen=new Set(),push=(key,label,detail,target,optional=false)=>{if(seen.has(key))return;seen.add(key);out.push({key,label,detail,target,optional})};
 for(const [id,a] of vitalAmbiguities)push('amb:'+id,`${VITALS[id].name} a confirmar`,a.reason||'Valor falado ambíguo.', '#nexaVitalSigns');
 for(const i of (state?.items||[])){
  if(i.status==='confirm'||i.priority==='critical'||(i.category==='vitals'&&['critical','high'].includes(i.priority))||i.concept==='allergies')push('item:'+i.id,conceptName(i.concept),i.status==='confirm'?'Resposta ambígua ou conflitante; confirmar.':i.priority==='critical'?'Pendência essencial no contexto atual.':'Informação relevante ainda não registrada.',pendingTarget(i));
  if(out.length>=6)break;
 }
 let a={};try{a=window.nexaClinicalBridge18101?.assessment?.()||{}}catch{}
 if(String(a.text||'').trim()&&!String(a.confirmed_cid||'').trim())push('cid','CID não confirmado','Opcional: a avaliação clínica permanece válida sem CID.','#physicianCid',true);
 return out;
}
function renderFinalPending(state=lastState){
 const host=$('nexaFinalPending');if(!host)return;const items=pendingItems(state);
 host.dataset.empty=items.length?'0':'1';
 host.innerHTML=`<div class="nexa-final-pending-head"><div><strong>${items.length?'Pendências finais':'Revisão essencial concluída'}</strong><span>${items.length?'Itens que ainda merecem uma olhada antes da cópia.':'Nenhuma pendência prioritária identificada pelo Radar.'}</span></div></div>${items.length?`<div class="nexa-final-pending-list">${items.map(i=>`<div class="nexa-final-pending-row"><div><b>${esc(i.label)}${i.optional?' · opcional':''}</b><small>${esc(i.detail)}</small></div>${i.target?`<button type="button" data-final-target="${esc(i.target)}">Preencher agora</button>`:''}</div>`).join('')}</div><div class="nexa-final-pending-actions"><button type="button" id="nexaFinalContinue">Continuar mesmo assim</button></div>`:''}`;
 host.querySelectorAll('[data-final-target]').forEach(b=>b.onclick=()=>{const el=q(b.dataset.finalTarget);if(el){el.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>el.focus?.(),250)}});
 $('nexaFinalContinue')?.addEventListener('click',()=>{host.style.display='none';});
}
function render(state){
 lastState=state||lastState||window.nexaRadar?.state||{};
 ensureLayout();ensureReview();renderMetrics(lastState);renderNext(lastState);renderPriorities(lastState);captureVitals(lastState);renderVitals();if(phase==='review')renderFinalPending(lastState);
 const live=q('#nexaFlowLive .nexa-flow-section-head h2');if(live)live.textContent='Consulta em andamento · Radar automático';
 const desc=q('#nexaFlowLive .nexa-flow-section-head p');if(desc)desc.textContent='Atenda normalmente. O NEXA acompanha a conversa e mostra apenas o que merece atenção agora.';
}
function mergePreProcessVitals(){
 const ta=vitalField(),saved=String(preProcessVitals||'').trim();if(!ta||!saved)return;
 const lines=String(ta.value||'').split(/\n+/).map(x=>x.trim()).filter(Boolean),norms=new Set(lines.map(norm));let changed=false;
 for(const line of saved.split(/\n+/).map(x=>x.trim()).filter(Boolean)){if(!norms.has(norm(line))){lines.push(line);norms.add(norm(line));changed=true}}
 if(changed){vitalWriting=true;ta.value=lines.join('\n');ta.dispatchEvent(new Event('input',{bubbles:true}));vitalWriting=false}
}
function observeStatus(){
 const status=$('status');if(!status||statusObserver)return;
 statusObserver=new MutationObserver(()=>{const value=status.textContent||'';if(/processamento conclu[ií]do/i.test(value)){mergePreProcessVitals();setPhase('review','structured');renderFinalPending(lastState)}else if(/transcrevendo|estruturando/i.test(value))setPhase('processing','processing');else if(/falha ao transcrever|falha ao estruturar|sess[aã]o expirou/i.test(value))setPhase('error','processing-error');else syncPhase('status')});
 statusObserver.observe(status,{childList:true,subtree:true,characterData:true});
}
function bind(){
 if(mounted)return true;if(!window.nexaRadar||!$('realtimeRadarCard')||!$('nexaUnifiedFlow'))return false;
 style();if(!ensureLayout()||!ensureReview())return false;
 window.nexaRadar.subscribe(render);window.addEventListener('nexa:radar-state',e=>render(e.detail?.state||window.nexaRadar?.state));
 document.addEventListener('click',e=>{
  if(e.target?.closest?.('#processBtn,#nfProcess,#nexaRadarProcessProxy,#nexaTopProcess'))preProcessVitals=String(vitalField()?.value||'');
  if(e.target?.closest?.('#recBtn,#nfStart,#nexaLocalStartBtn,#nexaDesktopStart,#nexaRadarFinishProxy,#nfFinish,#nexaDesktopFinish'))setTimeout(()=>syncPhase('recording-control'),120);
 },true);
 window.addEventListener('nexa:consultation-reset',()=>{vitalCache.clear();vitalAmbiguities.clear();preProcessVitals='';const pending=$('nexaFinalPending');if(pending)pending.style.display='';setPhase('consult','reset');setTimeout(()=>render(window.nexaRadar?.state),30)});
 window.addEventListener('nexa:clinical-processing',e=>{const state=e.detail?.state;if(state==='processing')setPhase('processing','processing-event');else if(state==='structured'){mergePreProcessVitals();setPhase('review','structured-event');renderFinalPending(lastState)}else if(state==='error')setPhase('error','processing-error-event')});
 observeStatus();mounted=true;syncPhase('mount');render(window.nexaRadar.state);return true;
}
let tries=0;const timer=setInterval(()=>{if(bind()||++tries>120)clearInterval(timer)},100);
window.addEventListener('nexa:continuous-soap-mounted',()=>setTimeout(bind,0));
window.nexaRadarAutoReview1812={bind,render,captureVitals,renderFinalPending,setPhase,syncPhase,get phase(){return phase},vitals:()=>({captured:Object.fromEntries(vitalCache),confirm:Object.fromEntries(vitalAmbiguities)})};
})();
