import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const loader = read('nexa-hotfix.js');
const ui = read('nexa-final-ui-v18.js');
const layout = read('nexa-layout-static-v18.6.5.js');
const audit = read('nexa-audit-autosave-v18.5.js');
const draft = read('nexa-record-draft-history-v18.6.6.js');
const mobile = read('nexa-mobile-shell-v18.6.7.js');
const safeArea = read('nexa-mobile-safe-area-v18.6.8.js');
const historyLifecycle = read('nexa-history-lifecycle-v18.6.9.js');
const html = read('index.html');
const sw = read('sw.js');

const requiredLoaderModules = [
  'nexa-hotfix-v1.js','nexa-ui-v3.js','nexa-radar-v4.js','nexa-final-ui-v18.js',
  'nexa-layout-static-v18.6.5.js','nexa-audit-autosave-v18.5.js','nexa-record-draft-history-v18.6.6.js',
  'nexa-mobile-shell-v18.6.7.js','nexa-mobile-safe-area-v18.6.8.js','nexa-history-lifecycle-v18.6.9.js'
];
for (const mod of requiredLoaderModules) assert.ok(loader.includes(mod), `loader sem ${mod}`);
assert.ok(loader.includes('20260905-v1872'), 'loader precisa forçar cache-bust v18.7.2');
assert.ok(loader.lastIndexOf('nexa-history-lifecycle-v18.6.9.js')>loader.lastIndexOf('nexa-mobile-safe-area-v18.6.8.js'),'history lifecycle precisa carregar por último');

for (const forbidden of ['nexa-auditor-workspace-v18.7.js','nexa-auditor-mobile-fix-v18.7.1.js','nexa-layout-static-v18.6.3.js','nexa-layout-static-v18.6.4.js','nexa-layout-flow-v18.6.js','nexa-gap-selfheal-v18.6.2.js','nexa-layout-flow-v18.5.js','nexa-layout-flow-v18.1.js','nexa-runtime-consolidated-v14.js','nexa-approved-ui-v15.js','nexa-parity-v17.js','nexa-parity-v17-hotfix.js']) assert.ok(!loader.includes(forbidden), `loader não pode carregar camada conflitante/instável: ${forbidden}`);

for (const id of ['recBtn','consent','timer','status','wave','processBtn','resetBtn','realtimeRadarCard','nexaPauseBtn','nexaFinishBtn','workspaceHistoryPane','historyList','refreshHistoryBtn','submitAuditBtn']) assert.ok(html.includes(`id="${id}"`), `controle nativo ausente no index.html: ${id}`);
assert.ok(html.includes("$('submitAuditBtn').onclick=submitCurrentForAudit"), 'envio manual à auditoria deve continuar disponível');
assert.ok(html.includes('async function loadHistory()'), 'histórico nativo precisa continuar disponível');
assert.ok(html.includes("Date.now()-7*24*60*60*1000"), 'histórico nativo precisa manter janela de 7 dias');
assert.ok(html.includes('async function syncReviewToStyleExample'), 'salvamento precisa continuar sincronizando exemplos de escrita');
assert.ok(html.includes('await syncReviewToStyleExample(activeHistoryId,fields,now)'), 'saveHistory precisa enviar revisão salva ao banco de exemplos');

for (const token of ['#nfSide','#nfTop','#nfRecMain','#nfRecActions','#nfSummary','#nfRadarTabs','cleanupDuplicates','__NEXA_V18_SMOKE__','rec.append(main,quick)']) assert.ok(ui.includes(token), `UI v18 sem contrato esperado: ${token}`);
for (const token of ['__NEXA_FIXED_CANVAS_V18_6_5__','nf1865FixedCanvasStyle','position:fixed!important','left:var(--nf-side,214px)!important','#nexaStageHost>.nexa-stage-view.active','function normalizeRecorderGrid()','__NEXA_V18_6_5_LAYOUT_DIAGNOSTIC__']) assert.ok(layout.includes(token), `fixed canvas v18.6.5 sem proteção esperada: ${token}`);
assert.ok(!layout.includes('MutationObserver'), 'v18.6.5 não pode gerar loop visual');
assert.ok(!layout.includes('setInterval'), 'v18.6.5 não pode manter loop visual');

for (const token of ['__NEXA_AUDIT_AUTOSAVE_V18_5__','archiveCurrentCase',"typeof saveHistory==='function'",'source_consultation_id','APP_CONFIG.submitAuditPath','automatic_audit_handoff:true','queuePayload','retryQueue',"RESET_IDS=new Set(['resetBtn','nexaRadarResetBtn','nfClear','nfTopClear'])",'nexaAutoArchiveForAudit']) assert.ok(audit.includes(token), `audit autosave sem proteção esperada: ${token}`);
assert.ok(audit.includes("d.error!=='ALREADY_SUBMITTED'"), 'autosave deve tratar reenvio idempotente como sucesso');
assert.ok(audit.includes('await archiveCurrentCase()'), 'limpar/novo atendimento precisa arquivar antes de resetar');

for (const token of ['__NEXA_RECORD_DRAFT_HISTORY_V18_6_6__','function recordingActive()',"rec.dataset.nexaStartOnly='1'",'function mountHistoryStage()','function refreshNativeHistory()','window.nexaRefreshDraftHistory=refreshNativeHistory']) assert.ok(draft.includes(token), `draft history/recording v18.6.6 sem contrato esperado: ${token}`);
for (const token of ['__NEXA_MOBILE_SHELL_V18_6_7__',"const MOBILE='(max-width:900px)'","nav.id='nexaMobileBottomNav'","header.id='nexaMobileHeader'",'safe-area-inset-bottom','safe-area-inset-top','__NEXA_V18_6_7_MOBILE_DIAGNOSTIC__']) assert.ok(mobile.includes(token), `mobile shell v18.6.7 sem contrato esperado: ${token}`);
assert.ok(!mobile.includes('MutationObserver'), 'mobile shell não deve usar observador contínuo de DOM');
for (const token of ['__NEXA_MOBILE_SAFE_AREA_V18_6_8__','--nm-header-live','--nm-bottom-live','function measureOffsets()',"history.scrollRestoration='manual'",'visualViewport?.addEventListener','__NEXA_V18_6_8_SAFE_AREA_DIAGNOSTIC__']) assert.ok(safeArea.includes(token), `safe-area v18.6.8 sem contrato esperado: ${token}`);
assert.ok(!safeArea.includes('MutationObserver'), 'safe-area não deve usar observador contínuo de DOM');

for (const token of ['__NEXA_HISTORY_LIFECYCLE_V18_6_9__',"const cutoff=new Date(Date.now()-7*24*60*60*1000).toISOString()",".from('consultation_history')",".gte('created_at',cutoff)","root.id='nexaSevenDayHistory'",'Consultas dos últimos 7 dias','data-audit','Enviar p/ auditoria','source_consultation_id:String(row.id)','APP_CONFIG.submitAuditPath',"d.error!=='ALREADY_SUBMITTED'",'syncReviewToStyleExample(row.id,row.fields||{}','styleExampleBackfill:true','automaticClearAuditPreserved','window.nexaRefreshSevenDayHistory']) assert.ok(historyLifecycle.includes(token), `history lifecycle v18.6.9 sem contrato esperado: ${token}`);
assert.ok(!historyLifecycle.includes('MutationObserver'), 'history lifecycle não deve adicionar observador visual contínuo');

assert.ok(sw.includes('nexa-v18-7-2-stability-20260905'), 'service worker não está na versão de estabilidade v18.7.2');
assert.ok(sw.includes('20260905-v1872'), 'service worker precisa apontar para o hotfix v18.7.2');
assert.ok(sw.includes('cache:"no-store"'), 'service worker precisa buscar runtime sem cache obsoleto');

new Function(loader);new Function(ui);new Function(layout);new Function(audit);new Function(draft);new Function(mobile);new Function(safeArea);new Function(historyLifecycle);new Function(sw);
console.log('NEXA stability v18.7.2 + clinical/audit lifecycle + mobile shell contract: PASS');
