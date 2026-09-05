/* NEXA v18.7 · professional auditor workspace · 2026-09-05
   Rebuilds the privileged audit experience around the existing, authenticated
   NEXA Core queue/review functions. The native RPC-backed controls remain the
   source of truth; this module provides the dashboard, queue, section review,
   comparison and responsive auditor workflow approved in the visual mockup. */
(()=>{
'use strict';
if(window.__NEXA_AUDITOR_WORKSPACE_V18_7__)return;
window.__NEXA_AUDITOR_WORKSPACE_V18_7__=true;

const $=id=>document.getElementById(id);
const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const REVIEWING_KEY='nexa-auditor-reviewing-v18-7';
const fieldLabels={
  queixa_principal:'Queixa principal',hda:'História da doença atual',comorbidades:'Comorbidades',
  antecedentes:'Antecedentes',medicacoes:'Medicações em uso',alergias:'Alergias',
  exame_fisico:'Exame físico',hipotese_diagnostica:'Hipótese diagnóstica',conduta:'Conduta e plano',
  orientacoes_alta:'Orientações',sugestoes_perguntas:'Sugestões / perguntas',
  hipotese_ia_original:'Hipótese original da IA',hipotese_medico_final:'Hipótese final do médico',
  cid_medico_final:'CID final',status_validacao_hipotese:'Validação da hipótese'
};
const mainFields=['queixa_principal','hda','comorbidades','antecedentes','medicacoes','alergias','exame_fisico','hipotese_diagnostica','conduta','orientacoes_alta'];
let nativeRows=new Map();
let queue=[];
let current=null;
let currentSection='hda';
let currentTab='documentacao';
let filter='all';
let search='';
let harvesting=false;
let observer=null;
let bodyObserver=null;
let mounted=false;

function privileged(){
  return document.body.classList.contains('nexa-privileged')||document.body.classList.contains('nexa-auditor-view')||!!q('[data-quick="auditor"].admin-visible')||!!q('#nexaRoleSwitchBtn.admin-visible');
}
function inAuditor(){return document.body.classList.contains('nexa-auditor-view')||document.body.classList.contains('nexa-auditor-mode')}
function loadReviewing(){try{return new Set(JSON.parse(sessionStorage.getItem(REVIEWING_KEY)||'[]'))}catch{return new Set()}}
function saveReviewing(set){try{sessionStorage.setItem(REVIEWING_KEY,JSON.stringify([...set]))}catch{}}
function markReviewing(key,on=true){const s=loadReviewing();on?s.add(key):s.delete(key);saveReviewing(s)}
function statusCode(label=''){
  const s=label.toLowerCase();
  if(s.includes('corrig'))return'corrected';
  if(s.includes('descart'))return'discarded';
  if(s.includes('correta')||s.includes('aprov'))return'approved';
  return'pending';
}
function statusText(code){return({pending:'Pendente',approved:'Aprovado',corrected:'Corrigido',discarded:'Descartado'})[code]||'Pendente'}
function parseCaseRow(row,index){
  const strong=q('.core-audit-head strong',row)?.textContent?.trim()||`Caso ${index+1}`;
  const key=strong.replace(/^Caso\s*/i,'').trim()||String(index+1);
  const meta=q('.core-meta',row)?.textContent?.trim()||'';
  const pill=q('.core-pill',row)?.textContent?.trim()||'pendente';
  const status=statusCode(pill);
  const original=q('.core-audit-fields',row)?.textContent?.trim()||'';
  const editor=q('.core-audit-edit',row);
  let fields={};
  if(editor){try{fields=JSON.parse(editor.value||'{}')||{}}catch{}}
  if(!Object.keys(fields).length)fields=parsePrettyFields(original);
  const note=qa('textarea',row).find(x=>x!==editor)||null;
  const buttons=qa('button',row);
  const native={
    approve:buttons.find(b=>/correta|aprovar sem/i.test(b.textContent||''))||null,
    corrected:buttons.find(b=>/salvar corrigida|corrigid/i.test(b.textContent||''))||null,
    discard:buttons.find(b=>/descartar/i.test(b.textContent||''))||null,
    editToggle:buttons.find(b=>/corrigir campos/i.test(b.textContent||''))||null,
    editor,note,row
  };
  const mode=/\bPS\b/i.test(original)||/\bPS\b/i.test(meta)?'PS':(/amb/i.test(original)||/amb/i.test(meta)?'Amb.':'—');
  const hypothesis=String(fields.hipotese_diagnostica||fields.hipotese_medico_final||'—').trim();
  const chief=String(fields.queixa_principal||'Consulta').trim();
  return{key,title:strong,meta,status,original,fields,native,mode,hypothesis,chief,index};
}
function parsePrettyFields(text){
  const out={};
  const aliases={
    'QUEIXA PRINCIPAL':'queixa_principal','HISTÓRIA DA DOENÇA ATUAL':'hda','HISTORIA DA DOENCA ATUAL':'hda',
    'COMORBIDADES':'comorbidades','ANTECEDENTES':'antecedentes','MEDICAÇÕES EM USO':'medicacoes','MEDICACOES EM USO':'medicacoes',
    'ALERGIAS':'alergias','EXAME FÍSICO':'exame_fisico','EXAME FISICO':'exame_fisico','HIPÓTESE DIAGNÓSTICA':'hipotese_diagnostica',
    'HIPOTESE DIAGNOSTICA':'hipotese_diagnostica','CONDUTAS':'conduta','CONDUTA':'conduta','ORIENTAÇÕES':'orientacoes_alta','ORIENTACOES':'orientacoes_alta'
  };
  let currentKey='';
  String(text||'').split(/\n+/).forEach(line=>{
    const raw=line.trim();if(!raw)return;
    const p=raw.indexOf(':');
    if(p>0){
      const label=raw.slice(0,p).trim().toUpperCase();
      const key=aliases[label]||'';
      if(key){currentKey=key;out[key]=raw.slice(p+1).trim();return}
    }
    if(currentKey)out[currentKey]=`${out[currentKey]||''}${out[currentKey]?'\n':''}${raw}`;
  });
  return out;
}
function syncNativeEditor(c){
  if(!c?.native?.editor)return;
  try{c.native.editor.value=JSON.stringify(c.fields,null,2);c.native.editor.dispatchEvent(new Event('input',{bubbles:true}))}catch{}
}
function clickNative(btn){if(!btn)return false;try{btn.click();return true}catch{return false}}

function installStyles(){
  if($('na17Style'))return;
  const s=document.createElement('style');s.id='na17Style';s.textContent=`
:root{--na-bg:#061521;--na-side:#061a29;--na-card:#0a2031;--na-card2:#0d2639;--na-line:#183c50;--na-text:#edf7fb;--na-muted:#8fa9b9;--na-teal:#18d8bf;--na-cyan:#20b9d7;--na-blue:#3478f6;--na-green:#22c995;--na-red:#ff5368;--na-orange:#ffad3d;--na-shadow:0 16px 40px rgba(0,0,0,.18)}
html[data-theme="light"],html[data-nexa-theme="light"]{--na-bg:#eef4f7;--na-side:#071d2d;--na-card:#fff;--na-card2:#f7fafc;--na-line:#d8e4eb;--na-text:#0b2034;--na-muted:#687e8f;--na-shadow:0 10px 30px rgba(12,41,58,.08)}
#nexaAuditorLaunch.na17-mounted{max-width:none!important;padding:0!important;background:var(--na-bg)!important;min-height:100vh!important;color:var(--na-text)!important}
#na17NativeBridge{display:none!important}
#na17App{min-height:100vh;background:var(--na-bg);color:var(--na-text);font:13px/1.45 Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.na17-wrap{max-width:1380px;margin:0 auto;padding:22px 24px 48px}.na17-top{display:flex;align-items:center;gap:14px;margin-bottom:18px}.na17-title{min-width:0}.na17-title h1{font-size:25px;line-height:1.1;margin:0 0 5px}.na17-title p{margin:0;color:var(--na-muted);font-size:11px}.na17-search{margin-left:auto;width:min(380px,36vw);position:relative}.na17-search input{height:40px;border:1px solid var(--na-line);background:var(--na-card);color:var(--na-text);border-radius:9px;padding:0 12px 0 36px;box-shadow:none}.na17-search:before{content:'⌕';position:absolute;left:12px;top:7px;font-size:18px;color:var(--na-muted)}.na17-period{height:40px;border:1px solid var(--na-line);background:var(--na-card);color:var(--na-text);border-radius:9px;padding:0 12px;font-weight:800}
.na17-tabs{display:flex;gap:6px;margin-bottom:14px;overflow-x:auto;scrollbar-width:none}.na17-tabs button{height:38px;border:1px solid var(--na-line);background:var(--na-card);color:var(--na-muted);border-radius:9px;padding:0 13px;font-weight:850;white-space:nowrap}.na17-tabs button.active{color:var(--na-teal);border-color:color-mix(in srgb,var(--na-teal) 45%,var(--na-line));background:color-mix(in srgb,var(--na-teal) 9%,var(--na-card))}
.na17-view{display:none}.na17-view.active{display:block}.na17-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.na17-kpi{border:1px solid var(--na-line);background:var(--na-card);border-radius:11px;padding:14px;min-height:96px}.na17-kpi-head{display:flex;align-items:center;justify-content:space-between;color:var(--na-muted);font-weight:800;font-size:11px}.na17-kpi i{width:30px;height:30px;border-radius:9px;background:var(--na-card2);display:grid;place-items:center;font-style:normal}.na17-kpi strong{display:block;font-size:28px;line-height:1;margin:8px 0 4px}.na17-kpi small{color:var(--na-muted)}
.na17-analytics{display:grid;grid-template-columns:1.05fr .8fr 1fr;gap:10px;margin-top:10px}.na17-panel{border:1px solid var(--na-line);background:var(--na-card);border-radius:11px;padding:15px}.na17-panel h3{margin:0 0 12px;font-size:13px}.na17-ring{width:118px;height:118px;border-radius:50%;display:grid;place-items:center;margin:8px auto;background:conic-gradient(var(--na-teal) var(--pct,0%),var(--na-card2) 0)}.na17-ring:after{content:attr(data-value);width:88px;height:88px;border-radius:50%;display:grid;place-items:center;background:var(--na-card);font-size:24px;font-weight:900}.na17-bars{display:grid;gap:10px}.na17-bar{display:grid;grid-template-columns:minmax(90px,1fr) 2fr 34px;gap:8px;align-items:center;font-size:11px}.na17-track{height:8px;background:var(--na-card2);border-radius:99px;overflow:hidden}.na17-fill{height:100%;background:linear-gradient(90deg,var(--na-cyan),var(--na-teal));border-radius:99px}.na17-quick-queue{margin-top:10px}.na17-mini-case{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--na-line);cursor:pointer}.na17-mini-case:last-child{border-bottom:0}.na17-mini-case>div{min-width:0;flex:1}.na17-mini-case strong{display:block}.na17-mini-case small{display:block;color:var(--na-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.na17-review-btn{height:32px;border:1px solid #377a99;background:#10354a;color:#dff7ff;border-radius:7px;padding:0 11px;font-weight:850}
.na17-queue-head{display:flex;align-items:center;gap:10px;margin-bottom:11px}.na17-queue-head h2{margin:0;font-size:20px}.na17-count{color:var(--na-muted)}.na17-filters{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}.na17-filter{height:34px;border:1px solid var(--na-line);background:var(--na-card);color:var(--na-muted);border-radius:999px;padding:0 12px;font-weight:800}.na17-filter.active{background:color-mix(in srgb,var(--na-cyan) 15%,var(--na-card));border-color:var(--na-cyan);color:var(--na-text)}.na17-table{border:1px solid var(--na-line);border-radius:11px;overflow:hidden;background:var(--na-card)}.na17-tr{display:grid;grid-template-columns:90px 135px 70px minmax(140px,1.2fr) minmax(130px,1fr) 90px 105px 90px;gap:9px;align-items:center;min-height:48px;padding:8px 12px;border-bottom:1px solid var(--na-line)}.na17-tr:last-child{border-bottom:0}.na17-tr.head{min-height:39px;background:var(--na-card2);font-size:10px;color:var(--na-muted);font-weight:900;text-transform:uppercase}.na17-tr:not(.head):hover{background:color-mix(in srgb,var(--na-cyan) 4%,var(--na-card))}.na17-cell{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.na17-badge{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:850;border:1px solid var(--na-line)}.na17-badge.pending{color:#ffc36b;background:rgba(255,173,61,.08)}.na17-badge.approved{color:#55dfb2;background:rgba(34,201,149,.08)}.na17-badge.corrected{color:#69b5ff;background:rgba(52,120,246,.08)}.na17-badge.discarded{color:#ff7e8e;background:rgba(255,83,104,.08)}.na17-empty{padding:30px;text-align:center;color:var(--na-muted)}
#na17Review{display:none;position:fixed;z-index:40000;inset:0;background:var(--na-bg);color:var(--na-text);overflow:auto}#na17Review.open{display:block}.na17-review-shell{min-height:100vh;display:flex;flex-direction:column}.na17-review-top{position:sticky;top:0;z-index:3;background:color-mix(in srgb,var(--na-bg) 96%,transparent);backdrop-filter:blur(16px);border-bottom:1px solid var(--na-line);padding:12px 18px}.na17-review-topline{display:flex;align-items:center;gap:10px}.na17-review-topline h2{margin:0;font-size:20px}.na17-back{height:36px;border:1px solid var(--na-line);border-radius:8px;background:var(--na-card);color:var(--na-text);padding:0 11px;font-weight:850}.na17-review-meta{font-size:10px;color:var(--na-muted);margin-top:5px}.na17-case-tabs{display:flex;gap:4px;margin-top:11px;overflow-x:auto}.na17-case-tabs button{border:0;border-bottom:2px solid transparent;background:transparent;color:var(--na-muted);padding:8px 11px;font-weight:850;white-space:nowrap}.na17-case-tabs button.active{color:var(--na-teal);border-bottom-color:var(--na-teal)}.na17-review-body{width:min(1450px,100%);margin:0 auto;padding:14px 18px 96px;flex:1}.na17-review-pane{display:none}.na17-review-pane.active{display:block}.na17-doc-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.na17-column{border:1px solid var(--na-line);background:var(--na-card);border-radius:10px;overflow:hidden}.na17-col-title{padding:10px 12px;background:var(--na-card2);border-bottom:1px solid var(--na-line);font-size:12px;font-weight:900}.na17-sections{padding:8px}.na17-section{border:1px solid var(--na-line);border-radius:8px;margin-bottom:7px;overflow:hidden;background:var(--na-card2)}.na17-section button{width:100%;min-height:42px;border:0;background:transparent;color:var(--na-text);display:flex;align-items:center;justify-content:space-between;text-align:left;padding:9px 11px;font-weight:850}.na17-section.active{border-color:var(--na-teal);box-shadow:0 0 0 1px color-mix(in srgb,var(--na-teal) 35%,transparent)}.na17-section-preview{display:none;padding:0 11px 11px;color:var(--na-muted);font-size:11px;white-space:pre-wrap}.na17-section.active .na17-section-preview{display:block}.na17-editor{padding:12px}.na17-decision-row{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px}.na17-decision-row button{height:36px;border:1px solid var(--na-line);border-radius:8px;background:var(--na-card2);color:var(--na-text);font-weight:850;font-size:10px}.na17-decision-row .ok.active{border-color:var(--na-green);color:var(--na-green);background:rgba(34,201,149,.08)}.na17-decision-row .fix.active{border-color:var(--na-blue);color:#75a8ff;background:rgba(52,120,246,.09)}.na17-decision-row .risk.active{border-color:var(--na-red);color:#ff8996;background:rgba(255,83,104,.09)}.na17-editor label{font-size:10px;color:var(--na-muted);font-weight:850;margin:8px 0 5px;display:block}.na17-editor textarea{width:100%;min-height:148px;border:1px solid var(--na-line);background:var(--na-card2);color:var(--na-text);border-radius:8px;padding:10px;resize:vertical}.na17-diff{margin-top:10px;border:1px solid var(--na-line);border-radius:8px;padding:10px;background:var(--na-card2);font-size:11px}.na17-diff strong{display:block;margin-bottom:5px}.na17-old{color:#ff8c99;text-decoration:line-through}.na17-new{color:#5ee3b8}.na17-note{min-height:72px!important}.na17-generic{border:1px solid var(--na-line);background:var(--na-card);border-radius:10px;padding:15px;white-space:pre-wrap}.na17-generic h3{margin:0 0 10px}.na17-review-actions{position:fixed;z-index:5;left:0;right:0;bottom:0;display:flex;justify-content:flex-end;gap:8px;padding:10px 18px calc(10px + env(safe-area-inset-bottom,0px));background:color-mix(in srgb,var(--na-bg) 96%,transparent);backdrop-filter:blur(16px);border-top:1px solid var(--na-line)}.na17-review-actions button{height:42px;border-radius:8px;padding:0 14px;font-weight:900;border:1px solid var(--na-line);background:var(--na-card);color:var(--na-text)}.na17-review-actions .discard{color:#ff8996}.na17-review-actions .corrected{background:#1f6cf0;border-color:#1f6cf0;color:#fff}.na17-review-actions .approve{background:#109e75;border-color:#109e75;color:#fff}.na17-success{display:grid;place-items:center;text-align:center;min-height:55vh}.na17-success i{width:84px;height:84px;border-radius:50%;display:grid;place-items:center;border:4px solid var(--na-teal);color:var(--na-teal);font-style:normal;font-size:38px;margin-bottom:18px}.na17-mobile-nav{display:none}
#coreAdminModal.na17-bridge-open{display:none!important}body.na17-native-bridge-open{overflow:auto!important}.na17-hidden-native{display:none!important}
@media(max-width:1100px){.na17-kpis{grid-template-columns:repeat(3,1fr)}.na17-analytics{grid-template-columns:1fr 1fr}.na17-analytics>.na17-panel:last-child{grid-column:1/-1}.na17-tr{grid-template-columns:80px 125px 64px minmax(130px,1fr) minmax(120px,.8fr) 90px 90px}.na17-tr>.na17-cell:nth-child(6){display:none}}
@media(max-width:820px){
 #nexaAuditorLaunch.na17-mounted{margin:0!important;width:100%!important}.na17-wrap{padding:calc(10px + env(safe-area-inset-top,0px)) 10px calc(85px + env(safe-area-inset-bottom,0px))}.na17-top{gap:8px;flex-wrap:wrap}.na17-title{width:100%}.na17-title h1{font-size:21px}.na17-search{order:3;width:100%;margin:0}.na17-period{margin-left:auto}.na17-kpis{grid-template-columns:repeat(2,1fr)}.na17-kpi{min-height:84px;padding:11px}.na17-kpi strong{font-size:23px}.na17-analytics{grid-template-columns:1fr}.na17-analytics>.na17-panel:last-child{grid-column:auto}.na17-table{border:0;background:transparent;display:grid;gap:8px}.na17-tr.head{display:none}.na17-tr{display:grid;grid-template-columns:1fr auto!important;gap:5px;border:1px solid var(--na-line);border-radius:10px;padding:11px;background:var(--na-card);min-height:0}.na17-tr .na17-cell{display:block!important}.na17-tr .na17-cell:nth-child(1){font-weight:900;font-size:13px}.na17-tr .na17-cell:nth-child(2){grid-column:1/2;color:var(--na-muted);font-size:10px}.na17-tr .na17-cell:nth-child(3){grid-column:2/3;grid-row:1/2;text-align:right}.na17-tr .na17-cell:nth-child(4),.na17-tr .na17-cell:nth-child(5){grid-column:1/-1}.na17-tr .na17-cell:nth-child(6){display:none!important}.na17-tr .na17-cell:nth-child(7){grid-column:1/2}.na17-tr .na17-cell:nth-child(8){grid-column:2/3;align-self:end}.na17-doc-grid{grid-template-columns:1fr}.na17-review-top{padding:calc(8px + env(safe-area-inset-top,0px)) 10px 8px}.na17-review-topline h2{font-size:17px}.na17-review-body{padding:10px 10px calc(150px + env(safe-area-inset-bottom,0px))}.na17-column.right{display:none}.na17-review-shell.mobile-edit .na17-column.left{display:none}.na17-review-shell.mobile-edit .na17-column.right{display:block}.na17-review-actions{display:none}.na17-mobile-nav{display:grid;position:fixed;z-index:6;left:0;right:0;bottom:0;grid-template-columns:repeat(4,1fr);gap:2px;padding:6px 7px calc(6px + env(safe-area-inset-bottom,0px));background:#061a29;border-top:1px solid #17394c}.na17-mobile-nav button{border:0;background:transparent;color:#9eb2c2;border-radius:8px;padding:7px 2px;font-size:10px;font-weight:850}.na17-mobile-nav button.active{color:var(--na-teal);background:rgba(24,216,191,.08)}.na17-case-tabs{display:none}.na17-decision-row{grid-template-columns:1fr}.na17-success{min-height:60vh}.na17-tabs{margin-bottom:10px}
}
`;
  document.head.appendChild(s);
}

function bridgeNativeLaunch(launch){
  if($('na17NativeBridge'))return;
  const bridge=document.createElement('div');bridge.id='na17NativeBridge';
  while(launch.firstChild)bridge.appendChild(launch.firstChild);
  launch.appendChild(bridge);
}
function buildApp(launch){
  if($('na17App'))return;
  const app=document.createElement('div');app.id='na17App';app.innerHTML=`
    <div class="na17-wrap">
      <div class="na17-top">
        <div class="na17-title"><h1>Painel de Auditoria</h1><p>Visão geral da qualidade, pendências e desempenho do NEXA.</p></div>
        <div class="na17-search"><input id="na17Search" placeholder="Buscar casos, hipótese, queixa..."></div>
        <button class="na17-period" type="button">▣ Últimos 7 dias</button>
      </div>
      <div class="na17-tabs">
        <button class="active" data-na-view="dashboard">Painel</button>
        <button data-na-view="queue">Fila de casos</button>
        <button data-na-view="audited">Auditados</button>
        <button data-na-view="stats">Estatísticas</button>
        <button data-na-view="learning">Aprendizado</button>
      </div>
      <section class="na17-view active" data-na-panel="dashboard" id="na17Dashboard"></section>
      <section class="na17-view" data-na-panel="queue" id="na17Queue"></section>
      <section class="na17-view" data-na-panel="audited" id="na17Audited"></section>
      <section class="na17-view" data-na-panel="stats" id="na17Stats"></section>
      <section class="na17-view" data-na-panel="learning" id="na17Learning"></section>
    </div>`;
  launch.appendChild(app);launch.classList.add('na17-mounted');
  app.addEventListener('click',handleAppClick);
  $('na17Search').addEventListener('input',e=>{search=e.target.value.trim().toLowerCase();renderAll()});
}
function buildReviewOverlay(){
  if($('na17Review'))return;
  const el=document.createElement('div');el.id='na17Review';el.innerHTML=`<div class="na17-review-shell" id="na17ReviewShell">
    <div class="na17-review-top"><div class="na17-review-topline"><button class="na17-back" data-na-close>← Voltar para a lista</button><h2 id="na17ReviewTitle">Revisão de caso</h2><span id="na17ReviewStatus" class="na17-badge pending">Pendente</span></div><div class="na17-review-meta" id="na17ReviewMeta"></div><div class="na17-case-tabs">
      <button class="active" data-case-tab="documentacao">Documentação</button><button data-case-tab="hipotese">Hipótese</button><button data-case-tab="conduta">Conduta</button><button data-case-tab="radar">Radar</button><button data-case-tab="comparacao">Comparação</button><button data-case-tab="historico">Histórico</button>
    </div></div>
    <div class="na17-review-body" id="na17ReviewBody"></div>
    <div class="na17-review-actions"><button data-na-later>Revisar depois</button><button class="discard" data-na-discard>Descartar do aprendizado</button><button class="corrected" data-na-corrected>✓ Aprovar com correções</button><button class="approve" data-na-approve>✓ Aprovar sem alteração</button></div>
    <nav class="na17-mobile-nav"><button class="active" data-mobile-review="case">Caso</button><button data-mobile-review="compare">Comparar</button><button data-mobile-review="radar">Radar</button><button data-mobile-review="decision">Decisão</button></nav>
  </div>`;
  document.body.appendChild(el);el.addEventListener('click',handleReviewClick);el.addEventListener('input',handleReviewInput);
}

function triggerNativeQueue(){
  if(harvesting)return;harvesting=true;
  const modal=$('coreAdminModal');if(modal)modal.classList.add('na17-bridge-open');
  document.body.classList.add('na17-native-bridge-open');
  const button=q('#na17NativeBridge [data-audit-pane="coreAuditPane"]')||q('[data-audit-pane="coreAuditPane"]')||$('navAuditBtn');
  try{button?.click()}catch{}
  let tries=0;
  const timer=setInterval(()=>{
    const body=$('coreAuditBody');
    if(body&&(!/Carregando/i.test(body.textContent||'')||tries>12)){
      clearInterval(timer);harvesting=false;attachQueueObserver();harvest();
      setTimeout(()=>{modal?.classList.add('na17-bridge-open');document.body.classList.remove('modal-open')},20);
    }
    if(++tries>25){clearInterval(timer);harvesting=false;harvest()}
  },120);
}
function attachQueueObserver(){
  const body=$('coreAuditBody');if(!body||observer)return;
  observer=new MutationObserver(()=>setTimeout(harvest,80));observer.observe(body,{childList:true,subtree:true});
}
function harvest(){
  const body=$('coreAuditBody');if(!body)return;
  nativeRows.clear();
  queue=qa('.core-audit-case',body).map((row,i)=>parseCaseRow(row,i));
  queue.forEach(c=>nativeRows.set(c.key,c));
  renderAll();
  if(current){const fresh=nativeRows.get(current.key);if(!fresh||fresh.status!=='pending'){showSuccess(current);current=null}}
}
function visibleCases(mode='all'){
  return queue.filter(c=>{
    if(mode==='audited'&&!['approved','corrected','discarded'].includes(c.status))return false;
    if(mode==='queue'&&filter!=='all'&&c.status!==filter)return false;
    if(mode==='queue'&&filter==='reviewing'&&!loadReviewing().has(c.key))return false;
    if(search){const hay=[c.key,c.meta,c.chief,c.hypothesis,c.status,c.mode].join(' ').toLowerCase();if(!hay.includes(search))return false}
    return true;
  });
}
function metrics(){
  const m={pending:0,approved:0,corrected:0,discarded:0,reviewing:0};
  queue.forEach(c=>{m[c.status]=(m[c.status]||0)+1});m.reviewing=loadReviewing().size;
  const reviewed=m.approved+m.corrected;const agreement=reviewed?Math.round(m.approved/reviewed*100):0;
  return{...m,total:queue.length,agreement};
}
function renderAll(){renderDashboard();renderQueue();renderAudited();renderStats();renderLearning()}
function renderDashboard(){
  const host=$('na17Dashboard');if(!host)return;const m=metrics();
  const bars=[['Pendentes',m.pending,'var(--na-orange)'],['Aprovados',m.approved,'var(--na-green)'],['Corrigidos',m.corrected,'var(--na-blue)'],['Descartados',m.discarded,'var(--na-red)']];
  const max=Math.max(1,...bars.map(x=>x[1]));
  host.innerHTML=`<div class="na17-kpis">
    ${kpi('Pendentes',m.pending,'⌁','Na fila para revisão')}${kpi('Em revisão',m.reviewing,'◉','Abertos nesta sessão')}${kpi('Aprovados',m.approved,'✓','Sem alteração')}${kpi('Corrigidos',m.corrected,'✎','Aprovados com ajuste')}${kpi('Descartados',m.discarded,'⌫','Fora do aprendizado')}
  </div><div class="na17-analytics">
    <div class="na17-panel"><h3>Taxa de concordância</h3><div class="na17-ring" style="--pct:${m.agreement}%" data-value="${m.agreement}%"></div><div style="text-align:center;color:var(--na-muted);font-size:10px">IA × auditor · casos concluídos</div></div>
    <div class="na17-panel"><h3>Status dos casos</h3><div class="na17-bars">${bars.map(x=>`<div class="na17-bar"><span>${x[0]}</span><div class="na17-track"><div class="na17-fill" style="width:${Math.round(x[1]/max*100)}%;background:${x[2]}"></div></div><strong>${x[1]}</strong></div>`).join('')}</div></div>
    <div class="na17-panel"><h3>Próximos casos</h3><div class="na17-quick-queue">${queue.filter(x=>x.status==='pending').slice(0,5).map(c=>miniCase(c)).join('')||'<div class="na17-empty">Nenhum caso pendente.</div>'}</div></div>
  </div>`;
}
function kpi(label,value,icon,sub){return`<div class="na17-kpi"><div class="na17-kpi-head"><span>${label}</span><i>${icon}</i></div><strong>${value}</strong><small>${sub}</small></div>`}
function miniCase(c){return`<div class="na17-mini-case" data-na-open="${esc(c.key)}"><div><strong>#${esc(c.key)}</strong><small>${esc(c.chief)} · ${esc(c.hypothesis)}</small></div><span class="na17-badge ${c.status}">${statusText(c.status)}</span><button class="na17-review-btn">Revisar</button></div>`}
function renderQueue(){
  const host=$('na17Queue');if(!host)return;const m=metrics(),rows=visibleCases('queue');
  host.innerHTML=`<div class="na17-queue-head"><h2>Fila de casos</h2><span class="na17-count">${rows.length} exibidos</span><button class="na17-review-btn" data-na-refresh style="margin-left:auto">↻ Atualizar</button></div>
    <div class="na17-filters">${[['all',`Todos (${m.total})`],['pending',`Pendentes (${m.pending})`],['reviewing',`Em revisão (${m.reviewing})`],['approved',`Aprovados (${m.approved})`],['corrected',`Corrigidos (${m.corrected})`],['discarded',`Descartados (${m.discarded})`]].map(([v,l])=>`<button class="na17-filter ${filter===v?'active':''}" data-na-filter="${v}">${l}</button>`).join('')}</div>${caseTable(rows)}`;
}
function caseTable(rows){
  return`<div class="na17-table"><div class="na17-tr head"><div>ID</div><div>Data/Hora</div><div>Modo</div><div>Queixa principal</div><div>Hipótese</div><div>Radar</div><div>Status</div><div>Ação</div></div>${rows.map(c=>`<div class="na17-tr" data-na-open="${esc(c.key)}"><div class="na17-cell">#${esc(c.key)}</div><div class="na17-cell">${esc(c.meta.replace(/^Recebido\s*/i,'').split('·')[0].trim()||'—')}</div><div class="na17-cell">${esc(c.mode)}</div><div class="na17-cell">${esc(c.chief)}</div><div class="na17-cell">${esc(c.hypothesis)}</div><div class="na17-cell">—</div><div class="na17-cell"><span class="na17-badge ${c.status}">${statusText(c.status)}</span></div><div class="na17-cell"><button class="na17-review-btn">${c.status==='pending'?'Revisar':'Abrir'}</button></div></div>`).join('')||'<div class="na17-empty">Nenhum caso neste filtro.</div>'}</div>`;
}
function renderAudited(){const h=$('na17Audited');if(h)h.innerHTML=`<div class="na17-queue-head"><h2>Casos auditados</h2><span class="na17-count">Aprovados, corrigidos e descartados</span></div>${caseTable(visibleCases('audited'))}`}
function renderStats(){
  const h=$('na17Stats');if(!h)return;const m=metrics();const done=m.approved+m.corrected+m.discarded;
  h.innerHTML=`<div class="na17-analytics" style="margin-top:0"><div class="na17-panel"><h3>Resumo da auditoria</h3><div class="na17-bars">${[['Total recebidos',m.total],['Concluídos',done],['Pendentes',m.pending],['Em revisão',m.reviewing]].map(([a,b])=>`<div class="na17-bar"><span>${a}</span><div class="na17-track"><div class="na17-fill" style="width:${m.total?Math.round(b/m.total*100):0}%"></div></div><strong>${b}</strong></div>`).join('')}</div></div><div class="na17-panel"><h3>Concordância global</h3><div class="na17-ring" style="--pct:${m.agreement}%" data-value="${m.agreement}%"></div></div><div class="na17-panel"><h3>Interpretação</h3><p style="color:var(--na-muted);margin:0">A concordância considera aprovações sem alteração entre os casos concluídos. Correções e descartes continuam preservados para governança do NEXA Core.</p></div></div>`;
}
function renderLearning(){
  const h=$('na17Learning');if(!h)return;const m=metrics();
  h.innerHTML=`<div class="na17-panel"><h3>Aprendizado controlado</h3><p style="color:var(--na-muted)">O conjunto clínico de alta confiança é alimentado apenas por casos aprovados ou corrigidos. Casos descartados permanecem rastreáveis, mas não devem ensinar conduta ao NEXA.</p><div class="na17-kpis" style="margin-top:14px;grid-template-columns:repeat(3,1fr)">${kpi('Prontos para o Core',m.approved+m.corrected,'✓','Aprovados + corrigidos')}${kpi('Correções úteis',m.corrected,'✎','Padrões de melhoria')}${kpi('Fora do aprendizado',m.discarded,'⌫','Descartados')}</div></div>`;
}

function handleAppClick(e){
  const view=e.target.closest?.('[data-na-view]');if(view){setView(view.dataset.naView);return}
  const f=e.target.closest?.('[data-na-filter]');if(f){filter=f.dataset.naFilter;setView('queue');renderQueue();return}
  if(e.target.closest?.('[data-na-refresh]')){triggerNativeQueue();return}
  const open=e.target.closest?.('[data-na-open]');if(open){openCase(open.dataset.naOpen);return}
}
function setView(view){
  qa('#na17App [data-na-view]').forEach(b=>b.classList.toggle('active',b.dataset.naView===view));
  qa('#na17App [data-na-panel]').forEach(p=>p.classList.toggle('active',p.dataset.naPanel===view));
  if(view==='queue'||view==='audited')triggerNativeQueue();
}
function fieldValue(c,key){return String(c?.fields?.[key]??'').trim()}
function sectionKeys(c){const present=mainFields.filter(k=>fieldValue(c,k));return present.length?present:['hda']}
function openCase(key){
  const c=nativeRows.get(key)||queue.find(x=>x.key===key);if(!c)return;
  current=c;currentSection=sectionKeys(c)[0];currentTab='documentacao';markReviewing(c.key,c.status==='pending');
  buildReviewOverlay();$('na17Review').classList.add('open');document.documentElement.style.overflow='hidden';renderReview();
}
function closeCase(){if(current)markReviewing(current.key,false);current=null;$('na17Review')?.classList.remove('open');document.documentElement.style.removeProperty('overflow');renderAll()}
function renderReview(){
  if(!current)return;const c=current;
  $('na17ReviewTitle').textContent=`Revisão de caso #${c.key}`;$('na17ReviewMeta').textContent=`${c.meta||'Caso desidentificado'} · Modo ${c.mode}`;
  const st=$('na17ReviewStatus');st.textContent=statusText(c.status);st.className=`na17-badge ${c.status}`;
  qa('#na17Review [data-case-tab]').forEach(b=>b.classList.toggle('active',b.dataset.caseTab===currentTab));
  const body=$('na17ReviewBody');body.innerHTML='';
  const pane=document.createElement('section');pane.className='na17-review-pane active';
  if(currentTab==='documentacao')pane.innerHTML=documentationHtml(c);
  else if(currentTab==='hipotese')pane.innerHTML=genericTab('Hipótese diagnóstica',fieldValue(c,'hipotese_diagnostica')||fieldValue(c,'hipotese_medico_final')||'Não informada.',fieldValue(c,'cid_medico_final')?`CID: ${fieldValue(c,'cid_medico_final')}`:'');
  else if(currentTab==='conduta')pane.innerHTML=genericTab('Conduta e plano',[fieldValue(c,'conduta'),fieldValue(c,'orientacoes_alta')].filter(Boolean).join('\n\n')||'Não informado.','Use a aba Documentação para editar estes campos antes de aprovar com correções.');
  else if(currentTab==='radar')pane.innerHTML=genericTab('Radar clínico','O contexto do Radar permanece associado ao caso no NEXA Core. Esta versão da fila nativa não expõe o snapshot completo no DOM do auditor.','A decisão final continua usando o caso desidentificado e o contexto armazenado no backend.');
  else if(currentTab==='comparacao')pane.innerHTML=comparisonHtml(c);
  else pane.innerHTML=genericTab('Histórico do caso',`${c.meta}\nStatus atual: ${statusText(c.status)}\nIdentificador: ${c.key}`,'As revisões concluídas permanecem no NEXA Core mesmo após o histórico clínico de 7 dias.');
  body.appendChild(pane);syncMobileReviewNav();
}
function documentationHtml(c){
  const keys=sectionKeys(c);const val=fieldValue(c,currentSection);const note=c.native.note?.value||'';
  return`<div class="na17-doc-grid"><div class="na17-column left"><div class="na17-col-title">Versão do NEXA (IA)</div><div class="na17-sections">${keys.map(k=>`<div class="na17-section ${k===currentSection?'active':''}"><button data-na-section="${k}"><span>${esc(fieldLabels[k]||k)}</span><span>${k===currentSection?'×':'⌄'}</span></button><div class="na17-section-preview">${esc(fieldValue(c,k)||'Sem conteúdo.')}</div></div>`).join('')}</div></div><div class="na17-column right"><div class="na17-col-title">Revisão do auditor</div><div class="na17-editor"><div class="na17-decision-row"><button class="ok" data-na-mark="ok">○ Correto</button><button class="fix active" data-na-mark="fix">◉ Corrigir</button><button class="risk" data-na-mark="risk">● Problema relevante</button></div><label>Texto corrigido pelo auditor</label><textarea id="na17Correction" data-field="${currentSection}">${esc(val)}</textarea><div class="na17-diff"><strong>Comparação de texto</strong><div><span class="na17-old">Original:</span> ${esc(val||'—')}</div><div style="margin-top:4px"><span class="na17-new">Revisado:</span> <span id="na17DiffNew">${esc(val||'—')}</span></div></div><label>Justificativa da correção (opcional)</label><textarea class="na17-note" id="na17AuditNote">${esc(note)}</textarea></div></div></div>`;
}
function genericTab(title,body,sub=''){return`<div class="na17-generic"><h3>${esc(title)}</h3><div>${esc(body)}</div>${sub?`<p style="color:var(--na-muted);margin:12px 0 0">${esc(sub)}</p>`:''}</div>`}
function comparisonHtml(c){
  const keys=sectionKeys(c);return`<div class="na17-generic"><h3>Comparação consolidada</h3>${keys.map(k=>`<div style="padding:10px 0;border-bottom:1px solid var(--na-line)"><strong>${esc(fieldLabels[k]||k)}</strong><div style="color:var(--na-muted);margin-top:5px">${esc(fieldValue(c,k)||'—')}</div></div>`).join('')}</div>`;
}
function handleReviewInput(e){
  if(!current)return;
  if(e.target.id==='na17Correction'){
    const key=e.target.dataset.field;current.fields[key]=e.target.value;syncNativeEditor(current);const d=$('na17DiffNew');if(d)d.textContent=e.target.value||'—';
  }
  if(e.target.id==='na17AuditNote'&&current.native.note){current.native.note.value=e.target.value;current.native.note.dispatchEvent(new Event('input',{bubbles:true}))}
}
function handleReviewClick(e){
  if(e.target.closest?.('[data-na-close]')||e.target.closest?.('[data-na-later]')){closeCase();return}
  const tab=e.target.closest?.('[data-case-tab]');if(tab){currentTab=tab.dataset.caseTab;renderReview();return}
  const sec=e.target.closest?.('[data-na-section]');if(sec){currentSection=sec.dataset.naSection;renderReview();return}
  const mark=e.target.closest?.('[data-na-mark]');if(mark){qa('.na17-decision-row button').forEach(b=>b.classList.remove('active'));mark.classList.add('active');return}
  if(e.target.closest?.('[data-na-approve]')){submitNative('approve');return}
  if(e.target.closest?.('[data-na-corrected]')){submitNative('corrected');return}
  if(e.target.closest?.('[data-na-discard]')){submitNative('discard');return}
  const mob=e.target.closest?.('[data-mobile-review]');if(mob){mobileReview(mob.dataset.mobileReview);return}
}
function submitNative(type){
  if(!current)return;const btn=type==='approve'?current.native.approve:type==='corrected'?current.native.corrected:current.native.discard;
  if(!btn){alert('Esta ação não está disponível para este caso no backend atual.');return}
  if(type==='corrected')syncNativeEditor(current);
  if(clickNative(btn)){markReviewing(current.key,false);setTimeout(()=>triggerNativeQueue(),250)}
}
function mobileReview(which){
  qa('.na17-mobile-nav button').forEach(b=>b.classList.toggle('active',b.dataset.mobileReview===which));const shell=$('na17ReviewShell');shell.classList.toggle('mobile-edit',which==='compare'||which==='decision');
  if(which==='case'){currentTab='documentacao';renderReview()}
  else if(which==='compare'){currentTab='documentacao';renderReview();shell.classList.add('mobile-edit')}
  else if(which==='radar'){currentTab='radar';renderReview()}
  else if(which==='decision'){currentTab='documentacao';renderReview();shell.classList.add('mobile-edit')}
}
function syncMobileReviewNav(){const map=currentTab==='radar'?'radar':($('na17ReviewShell')?.classList.contains('mobile-edit')?'compare':'case');qa('.na17-mobile-nav button').forEach(b=>b.classList.toggle('active',b.dataset.mobileReview===map))}
function showSuccess(c){
  buildReviewOverlay();$('na17Review').classList.add('open');document.documentElement.style.overflow='hidden';$('na17ReviewTitle').textContent=`Caso #${c.key}`;$('na17ReviewStatus').textContent='Concluído';$('na17ReviewMeta').textContent='Auditoria finalizada';$('na17ReviewBody').innerHTML='<div class="na17-success"><div><i>✓</i><h2>Caso auditado com sucesso!</h2><p style="color:var(--na-muted)">A decisão foi salva e o caso seguirá as regras de aprendizado do NEXA.</p><button class="na17-review-btn" data-na-close style="height:42px;margin-top:12px">Voltar para a fila</button></div></div>';
}

function mount(){
  const launch=$('nexaAuditorLaunch');if(!launch||mounted)return false;
  installStyles();bridgeNativeLaunch(launch);buildApp(launch);buildReviewOverlay();mounted=true;renderAll();triggerNativeQueue();return true;
}
function sync(){if(privileged()&&inAuditor()){mount();setTimeout(triggerNativeQueue,80)}}
function bind(){
  document.addEventListener('click',e=>{if(e.target?.closest?.('#nexaRoleSwitchBtn,[data-quick="auditor"],#n15Auditor,#n9AuditorDrawer,#navAuditBtn'))setTimeout(sync,80)},true);
  bodyObserver=new MutationObserver(()=>{if(inAuditor())sync()});bodyObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
  addEventListener('pageshow',()=>setTimeout(sync,100));
}
function init(){installStyles();bind();sync();[300,900,1800].forEach(ms=>setTimeout(sync,ms))}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.__NEXA_V18_7_AUDITOR_DIAGNOSTIC__={nativeRpcBridge:true,dashboard:true,queue:true,sectionReview:true,responsive:true};
})();
