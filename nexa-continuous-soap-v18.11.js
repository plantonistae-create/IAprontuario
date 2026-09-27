/* NEXA v18.11 — Continuous + SOAP shared clinical flow */
(()=>{
'use strict';
if(window.__NEXA_CONTINUOUS_SOAP_V18_11__)return;
window.__NEXA_CONTINUOUS_SOAP_V18_11__=true;

const $=id=>document.getElementById(id);
const q=(sel,root=document)=>root.querySelector(sel);
const qa=(sel,root=document)=>[...root.querySelectorAll(sel)];
const text=v=>String(v??'').trim();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MODE_KEY='nexa_flow_mode_v18_11';
let mounted=false,mode='continuous',assessmentTimer=null,previewTimer=null,presetObserver=null,assessmentSyncing=false;

function field(key){return key==='conduta'?$('conductRecordText'):q(`.field[data-key="${key}"] textarea`)}
function emit(el){if(!el)return;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))}
function clinical(){try{return window.nexaClinicalBridge18101?.collect?.()||{}}catch{return{}}}
function assessment(){try{return window.nexaClinicalBridge18101?.assessment?.()||{text:text(field('hipotese_diagnostica')?.value)}}catch{return{text:text(field('hipotese_diagnostica')?.value)}}}
function setAssessment(){
  if(assessmentSyncing)return;
  const value=text(field('hipotese_diagnostica')?.value),cid=text($('physicianCid')?.value).toUpperCase();
  assessmentSyncing=true;try{window.nexaClinicalBridge18101?.setAssessment?.(value,cid)}catch{}finally{assessmentSyncing=false}
  updatePreview();
}
function persistSoon(){try{window.nexaEncounterAutosave18101?.preserve?.('continuous_soap_edit')}catch{}}

function style(){
 if($('nexaContinuousSoapStyle1811'))return;
 const s=document.createElement('style');s.id='nexaContinuousSoapStyle1811';s.textContent=`
 .nexa-v1811-hidden{display:none!important}
 #nexaFlowModeBar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 14px;padding:10px;border:1px solid var(--nexa-line);border-radius:16px;background:var(--nexa-surface);position:sticky;top:calc(var(--nexa-topbar-h,66px) + 10px);z-index:40}
 .nexa-flow-mode-group{display:flex;gap:6px;min-width:0}.nexa-flow-mode{border:1px solid var(--nexa-line);background:var(--nexa-surface-2);color:var(--nexa-muted);border-radius:11px;padding:10px 14px;font-weight:850;cursor:pointer}.nexa-flow-mode.active{background:color-mix(in srgb,var(--nexa-brand) 12%,var(--nexa-surface));border-color:color-mix(in srgb,var(--nexa-brand) 38%,var(--nexa-line));color:var(--nexa-brand)}
 .nexa-flow-mode-hint{font-size:11px;color:var(--nexa-muted);text-align:right}
 #nexaUnifiedFlow{display:grid;gap:14px}
 .nexa-flow-section{border:1px solid var(--nexa-line);background:var(--nexa-surface);border-radius:18px;padding:16px;scroll-margin-top:145px}
 .nexa-flow-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
 .nexa-flow-kicker{font-size:10px;font-weight:900;letter-spacing:.12em;color:var(--nexa-brand);text-transform:uppercase}
 .nexa-flow-section h2{font-size:21px;margin:3px 0;color:var(--nexa-text)}.nexa-flow-section-head p{margin:0;color:var(--nexa-muted);font-size:12px;line-height:1.4}
 .nexa-flow-copy{display:none;border:1px solid var(--nexa-line);background:var(--nexa-surface-2);color:var(--nexa-brand);border-radius:10px;padding:8px 11px;font-weight:850;cursor:pointer;white-space:nowrap}
 body[data-nexa-flow="soap"] .nexa-flow-copy{display:inline-flex}
 .nexa-flow-body{display:grid;gap:10px}.nexa-flow-body>.field,.nexa-flow-body>.card,.nexa-flow-body>.radar-card,.nexa-flow-body>.hyp-review,.nexa-flow-body>.clinical-plan,.nexa-flow-body>.final-record-actions{margin:0!important}
 #nexaFlowLive .nexa-live-summary{display:none!important}
 #nexaFlowLive #processBtn,#nexaFlowLive #resetBtn{width:auto!important;margin:0!important}
 .nexa-flow-process-row{display:flex;gap:8px;flex-wrap:wrap}
 .nexa-flow-process-row>button{flex:1 1 180px;min-height:42px}
 .nexa-quick-composer{border:1px solid var(--nexa-line);background:var(--nexa-bg);border-radius:14px;padding:12px;margin:9px 0}
 .nexa-quick-composer h4{margin:0 0 9px;font-size:13px;color:var(--nexa-text)}.nexa-quick-group{margin-top:10px}.nexa-quick-group:first-of-type{margin-top:0}.nexa-quick-group-label{font-size:10px;font-weight:900;letter-spacing:.06em;color:var(--nexa-muted);text-transform:uppercase;margin-bottom:6px}
 .nexa-chip-row{display:flex;gap:6px;flex-wrap:wrap}.nexa-chip{border:1px solid var(--nexa-line);background:var(--nexa-surface);color:var(--nexa-text);border-radius:999px;padding:7px 10px;font-size:11px;font-weight:750;cursor:pointer}.nexa-chip.active{background:#e7f8f4;border-color:#74cdbd;color:#087a68}.nexa-chip:focus-visible,.nexa-flow-mode:focus-visible,.nexa-flow-copy:focus-visible{outline:3px solid color-mix(in srgb,var(--nexa-brand) 28%,transparent);outline-offset:2px}
 .nexa-legacy-exam{margin:10px 0;border:1px dashed var(--nexa-line);border-radius:12px;background:var(--nexa-surface-2)}.nexa-legacy-exam summary{cursor:pointer;padding:10px 12px;font-size:11px;font-weight:800;color:var(--nexa-muted)}.nexa-legacy-exam-body{padding:0 10px 10px}
 .nexa-assessment-assist{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end;border-top:1px solid var(--nexa-line);margin-top:10px;padding-top:10px}.nexa-assessment-assist label{display:block;font-size:10px;font-weight:850;color:var(--nexa-muted);margin-bottom:4px}.nexa-assessment-assist input{width:100%;min-height:40px}.nexa-assessment-assist button{min-height:40px;border:1px solid var(--nexa-line);border-radius:10px;background:var(--nexa-surface);color:var(--nexa-brand);font-weight:850;padding:0 12px}
 .nexa-cid-state{font-size:10px;color:var(--nexa-muted);margin-top:6px}.nexa-cid-state strong{color:var(--nexa-text)}
 .nexa-plan-quick{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.nexa-plan-quick .nexa-chip{border-radius:11px;text-align:left;min-height:52px;white-space:normal}
 .nexa-plan-live-list{display:grid;gap:5px;margin-top:10px}.nexa-plan-line{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;border:1px solid var(--nexa-line);border-radius:10px;padding:8px 9px;background:var(--nexa-surface)}.nexa-plan-line span{font-size:11px;line-height:1.35}.nexa-plan-line-actions{display:flex;gap:3px}.nexa-plan-line button{border:0;background:transparent;color:var(--nexa-muted);cursor:pointer;padding:3px 5px}
 .nexa-preset-row{display:flex;gap:7px;overflow-x:auto;padding:2px 0 4px}.nexa-preset{flex:0 0 auto;border:1px solid var(--nexa-line);background:var(--nexa-surface);border-radius:11px;padding:9px 11px;max-width:240px;text-align:left;cursor:pointer}.nexa-preset b{display:block;font-size:11px}.nexa-preset small{display:block;color:var(--nexa-muted);font-size:9px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.nexa-preset-empty{font-size:11px;color:var(--nexa-muted)}
 #nexaFlowPreview{white-space:pre-wrap;margin:0;max-height:420px;overflow:auto;border:1px solid var(--nexa-line);background:var(--nexa-bg);border-radius:13px;padding:13px;font:500 12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--nexa-text)}
 .nexa-flow-final-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}.nexa-flow-final-actions button{border:0;border-radius:11px;padding:11px 15px;background:#0b4965;color:#fff;font-weight:900;cursor:pointer}
 body[data-nexa-flow="soap"] #finalRecordActions{display:none!important}
 body[data-nexa-flow="continuous"] .nexa-soap-only{display:none!important}
 #nexaUnifiedFlow .nexa-stage-head{display:none!important}
 #nexaUnifiedFlow #structuredRecordTitle{display:none!important}
 #nexaUnifiedFlow .nexa-summary-copybar{display:none!important}
 #nexaUnifiedFlow #hypothesisReviewBlock{border-style:dashed!important}
 #nexaUnifiedFlow .toggle-row{display:none!important}
 @media(max-width:820px){
  #nexaFlowModeBar{top:8px;border-radius:14px;padding:7px;position:sticky}.nexa-flow-mode-group{width:100%}.nexa-flow-mode{flex:1;padding:9px 8px;font-size:11px}.nexa-flow-mode-hint{display:none}
  .nexa-flow-section{padding:12px;border-radius:15px;scroll-margin-top:84px}.nexa-flow-section h2{font-size:18px}.nexa-flow-section-head{margin-bottom:9px}.nexa-flow-section-head p{font-size:11px}
  .nexa-plan-quick{grid-template-columns:1fr 1fr}.nexa-assessment-assist{grid-template-columns:1fr}.nexa-assessment-assist button{width:100%}
  .nexa-flow-final-actions{display:grid}.nexa-flow-final-actions button{width:100%;min-height:46px}
 }
 `;document.head.appendChild(s)
}

const EXAM_GROUPS=[
 {id:'general',label:'Estado geral',prefix:'GERAL',items:[
  ['beg','BEG','BEG','state'],['reg','REG','REG','state'],['meg','MEG','MEG','state'],
  ['hydrated','Hidratado','hidratado','hydration'],['dehydrated','Desidratado','desidratado','hydration'],
  ['colored','Corado','corado','color'],['pale','Hipocorado','hipocorado','color'],
  ['afebrile','Afebril','afebril','temperature'],['febrile','Febril','febril','temperature']
 ]},
 {id:'resp',label:'Respiratório',prefix:'AR',items:[
  ['mv','MV+ bilateral','MV+ bilateral','air'],['no-ra','Sem ruídos adventícios','sem ruídos adventícios','noise'],
  ['wheeze','Sibilos','sibilos','noise'],['crackles','Crepitações','crepitações','noise']
 ]},
 {id:'cardio',label:'Cardiovascular',prefix:'ACV',items:[
  ['rcr','RCR 2T','RCR 2T','rhythm'],['no-murmur','Sem sopros','sem sopros','murmur'],['tec','TEC < 2s','TEC < 2s','perfusion']
 ]},
 {id:'abd',label:'Abdome',prefix:'ABD',items:[
  ['flat','Plano','plano','shape'],['rha','RHA+','RHA+','sounds'],['painless','Indolor','indolor à palpação','pain'],['painful','Doloroso','doloroso à palpação','pain'],['no-mass','Sem massas/visceromegalias','sem massas ou visceromegalias palpáveis','mass']
 ]},
 {id:'neuro',label:'Neurológico',prefix:'NEURO',items:[
  ['g15','Glasgow 15','Glasgow 15/15','gcs'],['no-meningeal','Sem sinais de meningismo','sem sinais de meningismo','meningism'],['no-focal','Sem déficits focais','sem déficits neurológicos focais','focal']
 ]},
 {id:'ext',label:'Extremidades',prefix:'EXT',items:[
  ['no-edema','Sem edema','sem edema','edema'],['pulses','Pulsos presentes','pulsos presentes bilateralmente','pulse'],['no-dvt','Sem sinais de TVP','sem sinais de TVP','dvt']
 ]}
];
const selectedExam=new Map();

function parseExamSelection(){
 const value=text(field('exame_fisico')?.value).toLowerCase();
 for(const group of EXAM_GROUPS){
  const set=new Set();
  for(const [id,,snippet] of group.items)if(value.includes(String(snippet).toLowerCase()))set.add(id);
  selectedExam.set(group.id,set);
 }
}
function examLine(group){
 const set=selectedExam.get(group.id)||new Set();
 const values=group.items.filter(([id])=>set.has(id)).map(([, ,snippet])=>snippet);
 return values.length?`${group.prefix}: ${values.join(', ')}.`:'';
}
function writeExam(){
 const ta=field('exame_fisico');if(!ta)return;
 const prefixes=new Set(EXAM_GROUPS.map(g=>g.prefix+':'));
 const manual=text(ta.value).split(/\n+/).filter(line=>!prefixes.has(line.trim().split(/\s+/)[0])).filter(Boolean);
 const generated=EXAM_GROUPS.map(examLine).filter(Boolean);
 ta.value=[...generated,...manual].join('\n');emit(ta);persistSoon();renderExamChips();updatePreview();
}
function toggleExam(group,id,exclusive){
 const set=selectedExam.get(group.id)||new Set();
 if(set.has(id))set.delete(id);
 else{
  if(exclusive)for(const [other,,,ex] of group.items)if(ex===exclusive)set.delete(other);
  set.add(id);
 }
 selectedExam.set(group.id,set);writeExam();
}
function renderExamChips(){
 const host=$('nexaExamQuickComposer');if(!host)return;
 host.innerHTML='<h4>Compositor rápido · clique para adicionar ou remover</h4>';
 for(const group of EXAM_GROUPS){
  const wrap=document.createElement('div');wrap.className='nexa-quick-group';
  wrap.innerHTML=`<div class="nexa-quick-group-label">${esc(group.label)}</div><div class="nexa-chip-row"></div>`;
  const row=q('.nexa-chip-row',wrap),set=selectedExam.get(group.id)||new Set();
  for(const [id,label,,exclusive] of group.items){
    const b=document.createElement('button');b.type='button';b.className='nexa-chip'+(set.has(id)?' active':'');b.textContent=label;b.dataset.examChip=id;
    b.onclick=()=>toggleExam(group,id,exclusive);row.appendChild(b);
  }
  host.appendChild(wrap);
 }
}

const PLAN_ACTIONS=[
 ['exams','Solicito exames','Solicito exames.'],
 ['med-now','Medicação agora','Medicação agora.'],
 ['rx','Prescrição','Prescrição.'],
 ['guidance','Orientações','Orientações.'],
 ['return','Retorno / sinais de alarme','Retorno / sinais de alarme.'],
 ['referral','Encaminhamento','Encaminhamento.'],
 ['observe','Observação / reavaliação','Observação / reavaliação.'],
 ['certificate','Atestado / declaração','Atestado / declaração.']
];
function planLines(){return text(field('conduta')?.value).split(/\n+/).map(x=>x.trim()).filter(Boolean)}
function setPlanLines(lines){const ta=field('conduta');if(!ta)return;ta.value=lines.join('\n');emit(ta);persistSoon();renderPlanQuick();renderPlanLines();updatePreview()}
function togglePlanAction(snippet){
 const lines=planLines(),idx=lines.findIndex(x=>x.toLowerCase()===snippet.toLowerCase());
 if(idx>=0)lines.splice(idx,1);else lines.push(snippet);setPlanLines(lines);
}
function renderPlanQuick(){
 const host=$('nexaPlanQuickComposer');if(!host)return;const lines=planLines().map(x=>x.toLowerCase());
 host.innerHTML='';
 for(const [,label,snippet] of PLAN_ACTIONS){
  const b=document.createElement('button');b.type='button';b.className='nexa-chip'+(lines.includes(snippet.toLowerCase())?' active':'');b.textContent=label;b.onclick=()=>togglePlanAction(snippet);host.appendChild(b);
 }
}
function renderPlanLines(){
 const host=$('nexaPlanLiveList');if(!host)return;const lines=planLines();host.innerHTML='';
 lines.forEach((line,i)=>{
  const row=document.createElement('div');row.className='nexa-plan-line';row.innerHTML=`<span>${esc(line)}</span><div class="nexa-plan-line-actions"><button type="button" aria-label="Mover para cima">↑</button><button type="button" aria-label="Mover para baixo">↓</button></div>`;
  const [up,down]=qa('button',row);up.disabled=i===0;down.disabled=i===lines.length-1;
  up.onclick=()=>{if(i<1)return;[lines[i-1],lines[i]]=[lines[i],lines[i-1]];setPlanLines(lines)};
  down.onclick=()=>{if(i>=lines.length-1)return;[lines[i+1],lines[i]]=[lines[i],lines[i+1]];setPlanLines(lines)};
  host.appendChild(row);
 });
}
function applyPreset(value){
 const ta=field('conduta'),v=text(value);if(!ta||!v)return;
 const current=text(ta.value);
 if(current.includes(v))ta.value=current.replace(v,'').replace(/\n{3,}/g,'\n\n').trim();
 else ta.value=[current,v].filter(Boolean).join('\n');
 emit(ta);persistSoon();renderPlanLines();updatePreview();
}
function syncPresets(){
 const host=$('nexaPlanPresets');if(!host)return;host.innerHTML='';
 const rows=qa('#conductList .conduct-item').slice(0,6);
 if(!rows.length){host.innerHTML='<div class="nexa-preset-empty">Nenhum preset validado cadastrado. Use sua biblioteca de condutas ou Protocolos.</div>';return}
 for(const row of rows){
  const value=text(q('.conduct-item-preview',row)?.textContent);if(!value)continue;
  const b=document.createElement('button');b.type='button';b.className='nexa-preset';b.innerHTML=`<b>Modelo salvo</b><small>${esc(value)}</small>`;b.onclick=()=>applyPreset(value);host.appendChild(b);
 }
}

function composeS(c=clinical()){
 return [['QP',c.queixa_principal],['HDA',c.hda],['Antecedentes',c.antecedentes],['Comorbidades',c.comorbidades],['Medicações',c.medicacoes],['Alergias',c.alergias]].filter(([,v])=>text(v)).map(([k,v])=>`${k}: ${text(v)}`).join('\n');
}
function composeO(c=clinical()){return [['Sinais vitais',c.sinais_vitais],['Exame físico',c.exame_fisico]].filter(([,v])=>text(v)).map(([k,v])=>`${k}: ${text(v)}`).join('\n')}
function composeA(c=clinical()){
 const a=assessment(),parts=[text(c.hipotese_diagnostica||a.text)];if(text(a.confirmed_cid))parts.push(`CID: ${text(a.confirmed_cid)}`);return parts.filter(Boolean).join('\n');
}
function valueOf(id){const el=$(id);return text(el?.value||el?.textContent)}
function composeP(c=clinical()){
 return [['Conduta',c.conduta],['Exames',valueOf('suggestedExams')],['Prescrição',valueOf('suggestedPrescription')],['Orientações',c.orientacoes_alta||valueOf('rxGuidancePreview')]].filter(([,v])=>text(v)).map(([k,v])=>`${k}: ${text(v)}`).join('\n');
}
function composeContinuous(c=clinical()){
 return [['QUEIXA PRINCIPAL',c.queixa_principal],['HISTÓRIA DA DOENÇA ATUAL',c.hda],['ALERGIAS',c.alergias],['COMORBIDADES',c.comorbidades],['MEDICAÇÕES EM USO',c.medicacoes],['ANTECEDENTES',c.antecedentes],['SINAIS VITAIS',c.sinais_vitais],['EXAME FÍSICO',c.exame_fisico],['AVALIAÇÃO / HIPÓTESE',c.hipotese_diagnostica],['CID CONFIRMADO',assessment().confirmed_cid],['CONDUTAS',c.conduta],['ORIENTAÇÕES',c.orientacoes_alta]].filter(([,v])=>text(v)).map(([k,v])=>`${k}:\n${text(v)}`).join('\n\n');
}
function composeSoap(){return [['S',composeS()],['O',composeO()],['A',composeA()],['P',composeP()]].filter(([,v])=>text(v)).map(([k,v])=>`${k} — ${k==='S'?'SUBJETIVO':k==='O'?'OBJETIVO':k==='A'?'AVALIAÇÃO':'PLANO'}\n${v}`).join('\n\n')}
async function copyText(value,label){
 const v=text(value);if(!v)return;
 try{await navigator.clipboard.writeText(v)}catch{const ta=document.createElement('textarea');ta.value=v;document.body.appendChild(ta);ta.select();document.execCommand?.('copy');ta.remove()}
 const el=$('nexaFlowCopyFeedback');if(el){el.textContent=label+' copiado ✓';clearTimeout(el.__t);el.__t=setTimeout(()=>el.textContent='',1600)}
}
function updatePreview(){clearTimeout(previewTimer);previewTimer=setTimeout(()=>{const p=$('nexaFlowPreview');if(p)p.textContent=mode==='soap'?composeSoap():composeContinuous();const state=$('nexaCidState'),a=assessment();if(state)state.innerHTML=a.confirmed_cid?`CID confirmado: <strong>${esc(a.confirmed_cid)}</strong>`:(a.suggested_cid?`Sugestão disponível: <strong>${esc(a.suggested_cid)}</strong> · opcional`:'CID opcional · nenhum CID confirmado')},50)}

function section(id,kicker,title,desc,copyLabel){
 const s=document.createElement('section');s.className='nexa-flow-section';s.id=id;s.innerHTML=`<div class="nexa-flow-section-head"><div><div class="nexa-flow-kicker">${kicker}</div><h2>${title}</h2><p>${desc}</p></div>${copyLabel?`<button type="button" class="nexa-flow-copy" data-copy="${copyLabel}">Copiar ${copyLabel}</button>`:''}</div><div class="nexa-flow-body"></div>`;return s
}
function titles(){
 const soap=mode==='soap',map=soap?{
  history:['S — SUBJETIVO','Subjetivo','História, antecedentes, medicações e alergias.'],
  exam:['O — OBJETIVO','Objetivo','Sinais vitais e exame físico com composição rápida.'],
  assessment:['A — AVALIAÇÃO','Avaliação','Texto livre primeiro. CID é assistência opcional.'],
  plan:['P — PLANO','Plano','Condutas, exames, prescrição e orientações.']
 }:{
  history:['HISTÓRIA','História / HDA','Revise a história clínica sem sair do atendimento.'],
  exam:['EXAME FÍSICO','Exame físico','Clique para compor e complemente livremente.'],
  assessment:['AVALIAÇÃO','Avaliação / hipótese','Escreva livremente; associe CID somente se desejar.'],
  plan:['PLANO','Plano / condutas','Componha por clique, modelos salvos ou texto livre.']
 };
 for(const [key,[kick,title,desc]] of Object.entries(map)){
  const sec=$('nexaFlow'+key[0].toUpperCase()+key.slice(1));if(!sec)continue;q('.nexa-flow-kicker',sec).textContent=kick;q('h2',sec).textContent=title;q('.nexa-flow-section-head p',sec).textContent=desc;
 }
 const finalTitle=q('#nexaFlowFinal h2');if(finalTitle)finalTitle.textContent=soap?'Resumo SOAP':'Prontuário final';
 const finalDesc=q('#nexaFlowFinal .nexa-flow-section-head p');if(finalDesc)finalDesc.textContent=soap?'Copie cada bloco ou o SOAP completo.':'Revise e copie o prontuário completo.';
 const finalBtn=$('nexaFlowCopyAll');if(finalBtn)finalBtn.textContent=soap?'Copiar SOAP completo':'Copiar prontuário completo';
}
function setMode(next){
 mode=next==='soap'?'soap':'continuous';document.body.dataset.nexaFlow=mode;try{sessionStorage.setItem(MODE_KEY,mode)}catch{}
 qa('.nexa-flow-mode').forEach(b=>b.classList.toggle('active',b.dataset.flowMode===mode));titles();syncNavigation();updatePreview();window.dispatchEvent(new CustomEvent('nexa:flow-mode',{detail:{mode}}));
}
function syncNavigation(){
 const soap=mode==='soap';
 const radar=q('.nexa-side-item[data-desk-stage="radar"]');if(radar){radar.innerHTML='↕ <span>Contínuo</span>';radar.classList.toggle('active',!soap)}
 const soapSide=$('nexaSoapSideNav');if(soapSide)soapSide.classList.toggle('active',soap);
 qa('.nexa-desktop-tab[data-desk-stage]').forEach((b,i)=>{if(i===0){b.textContent='Contínuo';b.classList.toggle('active',!soap);b.style.display=''}else if(i===1){b.textContent='SOAP rápido';b.classList.toggle('active',soap);b.style.display=''}else b.style.display='none'});
 const mobile=qa('#nexaDoctorBottom .nexa-docnav[data-stage]');mobile.forEach((b,i)=>{if(i===0){b.innerHTML='<span class="ico">↕</span>Contínuo';b.classList.toggle('active',!soap);b.style.display=''}else if(i===1){b.innerHTML='<span class="ico">S/O</span>SOAP';b.classList.toggle('active',soap);b.style.display=''}else b.style.display='none'});
}

function mount(){
 if(mounted)return true;
 const host=$('nexaStageHost'),radar=q('.nexa-stage-view[data-stage="radar"]',host),summary=q('.nexa-stage-view[data-stage="summary"]',host),hyp=q('.nexa-stage-view[data-stage="hypothesis"]',host),plan=q('.nexa-stage-view[data-stage="plan"]',host);
 if(!host||!radar||!summary||!hyp||!plan||!$('examPhysicalBlock')||!field('hipotese_diagnostica')||!$('conductBlock'))return false;
 style();
 const sideRadar=q('.nexa-side-item[data-desk-stage="radar"]');
 if(sideRadar&&!$('nexaSoapSideNav')){const soapNav=document.createElement('button');soapNav.type='button';soapNav.id='nexaSoapSideNav';soapNav.className='nexa-side-item';soapNav.innerHTML='S/O <span>SOAP rápido</span>';soapNav.onclick=()=>{sideRadar.click();setTimeout(()=>setMode('soap'),0)};sideRadar.after(soapNav)}
 const bar=document.createElement('div');bar.id='nexaFlowModeBar';bar.innerHTML='<div class="nexa-flow-mode-group"><button type="button" class="nexa-flow-mode" data-flow-mode="continuous">Contínuo</button><button type="button" class="nexa-flow-mode" data-flow-mode="soap">SOAP rápido</button></div><div class="nexa-flow-mode-hint">Mesmo atendimento · mesma persistência</div>';
 const root=document.createElement('div');root.id='nexaUnifiedFlow';
 const live=section('nexaFlowLive','ATENDIMENTO','Consulta em andamento','Gravação, transcrição e Radar acompanham o caso em tempo real.','');
 const history=section('nexaFlowHistory','HISTÓRIA','História / HDA','Revise a história clínica sem sair do atendimento.','S');
 const exam=section('nexaFlowExam','EXAME FÍSICO','Exame físico','Clique para compor e complemente livremente.','O');
 const assess=section('nexaFlowAssessment','AVALIAÇÃO','Avaliação / hipótese','Escreva livremente; associe CID somente se desejar.','A');
 const planSec=section('nexaFlowPlan','PLANO','Plano / condutas','Componha por clique, modelos salvos ou texto livre.','P');
 const finalSec=section('nexaFlowFinal','SAÍDA','Prontuário final','Revise e copie o prontuário completo.','');
 root.append(live,history,exam,assess,planSec,finalSec);host.prepend(bar,root);

 const liveBody=q('.nexa-flow-body',live);
 for(const el of [...radar.children])if(!el.classList.contains('nexa-stage-head')&&!el.classList.contains('nexa-live-summary'))liveBody.appendChild(el);
 const processRow=document.createElement('div');processRow.className='nexa-flow-process-row';
 for(const id of ['processBtn','resetBtn'])if($(id))processRow.appendChild($(id));liveBody.appendChild(processRow);

 const histBody=q('.nexa-flow-body',history);
 const grid=q('.nexa-stage-summary-fields',summary);
 if(grid){
  for(const el of [...grid.children])if(el.id!=='examPhysicalBlock'&&el.dataset.key!=='sinais_vitais')histBody.appendChild(el);
 }
 const toolbar=q('.toolbar',summary);if(toolbar)histBody.appendChild(toolbar);
 const banner=$('bannerArea');if(banner)histBody.appendChild(banner);

 const examBody=q('.nexa-flow-body',exam);
 const quickExam=document.createElement('div');quickExam.id='nexaExamQuickComposer';quickExam.className='nexa-quick-composer';examBody.appendChild(quickExam);
 const vital=q('.field[data-key="sinais_vitais"]');if(vital)examBody.appendChild(vital);
 const examBlock=$('examPhysicalBlock');examBody.appendChild(examBlock);
 const legacy=document.createElement('details');legacy.className='nexa-legacy-exam';legacy.innerHTML='<summary>Modelos por perfil já existentes</summary><div class="nexa-legacy-exam-body"></div>';
 const legacyBody=q('.nexa-legacy-exam-body',legacy);
 for(const sel of ['.exam-type-tabs','#examSystems','#insertExamBtn']){const el=q(sel,examBlock);if(el)legacyBody.appendChild(el)}
 const examTa=field('exame_fisico');if(examTa)examBlock.insertBefore(legacy,examTa);

 const assessBody=q('.nexa-flow-body',assess),hypField=q('.field[data-key="hipotese_diagnostica"]');
 assessBody.appendChild(hypField);
 const assist=document.createElement('div');assist.className='nexa-assessment-assist';assist.innerHTML='<div id="nexaCidInputSlot"><label>CID-10 opcional</label></div><button type="button" id="nexaAssociateCid">Associar CID</button><div class="nexa-cid-state" id="nexaCidState"></div>';
 const slot=q('#nexaCidInputSlot',assist),cid=$('physicianCid'),hint=$('physicianCidHint');if(cid)slot.appendChild(cid);if(hint)slot.appendChild(hint);assessBody.appendChild(assist);
 const review=$('hypothesisReviewBlock');if(review){const d=document.createElement('details');d.className='nexa-legacy-exam';d.innerHTML='<summary>Assistência diagnóstica avançada</summary><div class="nexa-legacy-exam-body"></div>';q('.nexa-legacy-exam-body',d).appendChild(review);assessBody.appendChild(d)}

 const planBody=q('.nexa-flow-body',planSec);
 const quickPlan=document.createElement('div');quickPlan.className='nexa-quick-composer';quickPlan.innerHTML='<h4>Plano rápido · clique para adicionar ou remover</h4><div class="nexa-plan-quick" id="nexaPlanQuickComposer"></div><div class="nexa-quick-group"><div class="nexa-quick-group-label">Presets validados / modelos salvos</div><div class="nexa-preset-row" id="nexaPlanPresets"></div></div>';planBody.appendChild(quickPlan);
 const conduct=$('conductBlock');planBody.appendChild(conduct);
 const liveList=document.createElement('div');liveList.id='nexaPlanLiveList';liveList.className='nexa-plan-live-list';conduct.insertBefore(liveList,field('conduta'));
 const clinicalPlan=$('clinicalPlanBlock');if(clinicalPlan)planBody.appendChild(clinicalPlan);
 const guidance=q('.field[data-key="orientacoes_alta"]');if(guidance)planBody.appendChild(guidance);

 const finalBody=q('.nexa-flow-body',finalSec),preview=document.createElement('pre');preview.id='nexaFlowPreview';finalBody.appendChild(preview);
 const feedback=document.createElement('div');feedback.id='nexaFlowCopyFeedback';feedback.className='nexa-cid-state';finalBody.appendChild(feedback);
 const actions=document.createElement('div');actions.className='nexa-flow-final-actions';actions.innerHTML='<button type="button" id="nexaFlowCopyAll">Copiar prontuário completo</button>';finalBody.appendChild(actions);
 const originalFinal=$('finalRecordActions');if(originalFinal)finalBody.appendChild(originalFinal);

 for(const view of [radar,summary,hyp,plan])view.classList.add('nexa-v1811-hidden');
 qa('.nexa-flow-mode',bar).forEach(b=>b.onclick=()=>setMode(b.dataset.flowMode));
 qa('.nexa-flow-copy',root).forEach(b=>b.onclick=()=>{const key=b.dataset.copy;copyText(key==='S'?composeS():key==='O'?composeO():key==='A'?composeA():composeP(),key)});
 $('nexaFlowCopyAll').onclick=()=>copyText(mode==='soap'?composeSoap():composeContinuous(),mode==='soap'?'SOAP completo':'Prontuário completo');
 $('nexaAssociateCid').onclick=()=>setAssessment();
 field('hipotese_diagnostica')?.addEventListener('input',()=>{if(assessmentSyncing)return;clearTimeout(assessmentTimer);assessmentTimer=setTimeout(setAssessment,260)});
 field('exame_fisico')?.addEventListener('input',()=>{parseExamSelection();renderExamChips();updatePreview()});
 field('conduta')?.addEventListener('input',()=>{renderPlanQuick();renderPlanLines();updatePreview()});
 document.addEventListener('input',e=>{if(e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLInputElement)updatePreview()},true);

 parseExamSelection();renderExamChips();renderPlanQuick();renderPlanLines();syncPresets();
 const list=$('conductList');if(list&&window.MutationObserver){presetObserver=new MutationObserver(syncPresets);presetObserver.observe(list,{childList:true,subtree:true,characterData:true})}
 try{mode=sessionStorage.getItem(MODE_KEY)==='soap'?'soap':'continuous'}catch{mode='continuous'}
 setMode(mode);mounted=true;window.dispatchEvent(new CustomEvent('nexa:continuous-soap-mounted'));return true;
}

document.addEventListener('click',e=>{
 const side=e.target.closest?.('.nexa-side-item[data-desk-stage="radar"]');if(side)setTimeout(()=>setMode('continuous'),0);
 const desk=e.target.closest?.('.nexa-desktop-tab[data-desk-stage]');if(desk){
  const tabs=qa('.nexa-desktop-tab[data-desk-stage]'),idx=tabs.indexOf(desk);if(idx===0)setTimeout(()=>setMode('continuous'),0);if(idx===1)setTimeout(()=>setMode('soap'),0);
 }
 const mob=e.target.closest?.('#nexaDoctorBottom .nexa-docnav[data-stage]');if(mob){
  const arr=qa('#nexaDoctorBottom .nexa-docnav[data-stage]'),idx=arr.indexOf(mob);if(idx===0)setTimeout(()=>setMode('continuous'),0);if(idx===1)setTimeout(()=>setMode('soap'),0);
 }
},true);

let tries=0;const timer=setInterval(()=>{if(mount()||++tries>80)clearInterval(timer)},125);
window.addEventListener('nexa:consultation-reset',()=>setTimeout(()=>{parseExamSelection();renderExamChips();renderPlanQuick();renderPlanLines();updatePreview()},50));
window.nexaContinuousSoap1811={mount,setMode,get mode(){return mode},composeS,composeO,composeA,composeP,composeSoap,composeContinuous,togglePlanAction,parseExamSelection};
})();