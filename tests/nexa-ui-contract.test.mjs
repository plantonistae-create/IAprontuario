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
const html = read('index.html');
const sw = read('sw.js');

const requiredLoaderModules = [
  'nexa-hotfix-v1.js',
  'nexa-ui-v3.js',
  'nexa-radar-v4.js',
  'nexa-final-ui-v18.js',
  'nexa-layout-static-v18.6.5.js',
  'nexa-audit-autosave-v18.5.js',
  'nexa-record-draft-history-v18.6.6.js',
  'nexa-mobile-shell-v18.6.7.js',
  'nexa-mobile-safe-area-v18.6.8.js'
];
for (const mod of requiredLoaderModules) assert.ok(loader.includes(mod), `loader sem ${mod}`);
assert.ok(loader.includes('20260905-v1868'), 'loader precisa forçar cache-bust v18.6.8');
assert.ok(loader.lastIndexOf('nexa-mobile-safe-area-v18.6.8.js')>loader.lastIndexOf('nexa-mobile-shell-v18.6.7.js'),'safe-area precisa carregar depois do shell mobile');

for (const forbidden of [
  'nexa-layout-static-v18.6.3.js',
  'nexa-layout-static-v18.6.4.js',
  'nexa-layout-flow-v18.6.js',
  'nexa-gap-selfheal-v18.6.2.js',
  'nexa-layout-flow-v18.5.js',
  'nexa-layout-flow-v18.1.js',
  'nexa-runtime-consolidated-v14.js',
  'nexa-approved-ui-v15.js',
  'nexa-parity-v17.js',
  'nexa-parity-v17-hotfix.js'
]) assert.ok(!loader.includes(forbidden), `loader não pode carregar camada conflitante: ${forbidden}`);

for (const id of ['recBtn','consent','timer','status','wave','processBtn','resetBtn','realtimeRadarCard','nexaPauseBtn','nexaFinishBtn','workspaceHistoryPane','historyList','refreshHistoryBtn']) {
  assert.ok(html.includes(`id="${id}"`), `controle nativo ausente no index.html: ${id}`);
}
assert.ok(html.includes('id="nexaRecordingKicker"'), 'fixture precisa expor o kicker legado que causava auto-placement no grid');
assert.ok(html.includes("host.id='nexaStageHost'"), 'index precisa continuar criando o stage host clínico');
assert.ok(html.includes("$('submitAuditBtn').onclick=submitCurrentForAudit"), 'envio manual à auditoria deve continuar disponível como fallback');
assert.ok(html.includes('id="workspaceHistoryPane"'), 'histórico nativo de rascunhos precisa continuar disponível');
assert.ok(html.includes('Histórico de rascunhos'), 'histórico deve continuar identificado como rascunhos');

for (const token of ['#nfSide','#nfTop','#nfRecMain','#nfRecActions','#nfSummary','#nfRadarTabs','cleanupDuplicates','__NEXA_V18_SMOKE__','rec.append(main,quick)']) {
  assert.ok(ui.includes(token), `UI v18 sem contrato esperado: ${token}`);
}

for (const token of [
  '__NEXA_FIXED_CANVAS_V18_6_5__',
  'nf1865FixedCanvasStyle',
  'position:fixed!important',
  'left:var(--nf-side,214px)!important',
  'right:0!important',
  'top:var(--nf-top,72px)!important',
  'bottom:0!important',
  'inset:var(--nf-top,72px) 0 0 var(--nf-side,214px)!important',
  'overflow-y:auto!important',
  'background:var(--nf-bg)!important',
  '#mainApp>main>.panel-left',
  '#mainApp>main>.panel-right',
  '#nexaStageHost>.nexa-stage-view.active',
  '#nexaStageHost>.nexa-stage-view[data-stage="radar"].active',
  '#nexaStageHost>.nexa-stage-view[data-stage="summary"].active',
  '#nexaStageHost>.nexa-stage-view[data-stage="hypothesis"].active',
  '#nexaStageHost>.nexa-stage-view[data-stage="plan"].active',
  '#nexaStageHost>.nexa-stage-view[data-stage="history"].active',
  'grid-template-areas:"recmain quick"!important',
  '>.card.rec-zone>#nfRecMain',
  '>.card.rec-zone>#nfQuick',
  '.card.rec-zone.nf-rec-normalized>:not(#nfRecMain):not(#nfQuick)',
  'function normalizeRecorderGrid()',
  "rec.classList.add('nf-rec-normalized')",
  '__NEXA_V18_6_5_LAYOUT_DIAGNOSTIC__'
]) assert.ok(layout.includes(token), `fixed canvas/recorder v18.6.5 sem proteção esperada: ${token}`);

assert.ok(!layout.includes('MutationObserver'), 'v18.6.5 não pode usar MutationObserver e gerar loop visual');
assert.ok(!layout.includes('requestAnimationFrame'), 'v18.6.5 não pode recalcular deslocamento a cada frame');
assert.ok(!layout.includes('setInterval'), 'v18.6.5 não pode manter loop de correção visual');
assert.ok(!layout.includes('getBoundingClientRect'), 'v18.6.5 não pode depender de medição dinâmica de posição');
assert.ok(!layout.includes('document.body.appendChild(host)'), 'Radar não pode ser destacado para o body');

for (const token of [
  '__NEXA_AUDIT_AUTOSAVE_V18_5__',
  'archiveCurrentCase',
  "typeof saveHistory==='function'",
  'source_consultation_id',
  'APP_CONFIG.submitAuditPath',
  'automatic_audit_handoff:true',
  'queuePayload',
  'retryQueue',
  "RESET_IDS=new Set(['resetBtn','nexaRadarResetBtn','nfClear','nfTopClear'])",
  'nexaAutoArchiveForAudit'
]) assert.ok(audit.includes(token), `audit autosave sem proteção esperada: ${token}`);
assert.ok(audit.includes("d.error!=='ALREADY_SUBMITTED'"), 'autosave deve tratar reenvio idempotente como sucesso');

for (const token of [
  '__NEXA_RECORD_DRAFT_HISTORY_V18_6_6__',
  'function recordingActive()',
  "rec.dataset.nexaStartOnly='1'",
  "rec.setAttribute('aria-label','Iniciar gravação')",
  'e.stopImmediatePropagation()',
  "status.textContent='Gravação em andamento · use Pausar ou Finalizar'",
  'function mountHistoryStage()',
  "q('.nexa-stage-view[data-stage=\"history\"]')",
  "const pane=$('workspaceHistoryPane')",
  'stage.appendChild(pane)',
  "body.classList.add('open')",
  'function refreshNativeHistory()',
  "const refresh=$('refreshHistoryBtn')",
  'refresh.click()',
  '[data-go="history"],#nfQuickHistory,.nexa-session-tab[data-stage="history"]',
  'function renderCurrentDraft(stage)',
  "card.id='nexaCurrentDraftCard'",
  'Consulta ainda aberta · o histórico salvo aparece abaixo',
  'window.nexaRefreshDraftHistory=refreshNativeHistory',
  '__NEXA_V18_6_6_DRAFT_DIAGNOSTIC__',
  'nativeDraftStore:true'
]) assert.ok(draft.includes(token), `draft history/recording v18.6.6 sem contrato esperado: ${token}`);
assert.ok(!draft.includes("typeof currentProf"), 'v18.6.6 deve usar o store nativo autenticado em vez de acessar escopo privado do index');
assert.ok(!draft.includes("sb.from('consultation_history')"), 'v18.6.6 não deve criar uma segunda rota de persistência clínica');
assert.ok(!draft.includes('MutationObserver'), 'v18.6.6 não deve adicionar observador visual contínuo');
assert.ok(!draft.includes('requestAnimationFrame'), 'v18.6.6 não deve adicionar loop visual por frame');

for (const token of [
  '__NEXA_MOBILE_SHELL_V18_6_7__',
  "const MOBILE='(max-width:900px)'",
  "const stages=['radar','summary','hypothesis','plan','history']",
  "nav.id='nexaMobileBottomNav'",
  "header.id='nexaMobileHeader'",
  "drawer.id='nexaMobileDrawer'",
  'data-mobile-stage',
  'safe-area-inset-bottom',
  'safe-area-inset-top',
  'body.nexa-v340 #nfSide,body.nexa-v340 #nfTop',
  '#nexaStageHost>.nexa-stage-view[data-stage="radar"].active{display:block!important}',
  '#nfQuick{display:none!important}',
  '#nexaMobileBottomNav{display:grid!important;position:fixed!important',
  'grid-template-columns:repeat(5,minmax(0,1fr))',
  "if(stage==='history')setTimeout(()=>window.nexaRefreshDraftHistory?.(),60)",
  '__NEXA_V18_6_7_MOBILE_DIAGNOSTIC__',
  'desktopCanvasIsolated:true'
]) assert.ok(mobile.includes(token), `mobile shell v18.6.7 sem contrato esperado: ${token}`);
assert.ok(!mobile.includes('MutationObserver'), 'mobile shell não deve usar observador contínuo de DOM');
assert.ok(!mobile.includes('getBoundingClientRect'), 'mobile shell não deve corrigir geometria por medição dinâmica');

for (const token of [
  '__NEXA_MOBILE_SAFE_AREA_V18_6_8__',
  '--nm-header-live',
  '--nm-bottom-live',
  'function measureOffsets()',
  'header?.offsetHeight',
  'bottom?.offsetHeight',
  'function resetScrollOrigin()',
  "history.scrollRestoration='manual'",
  "q('#mainApp>main')",
  "q('#nexaStageHost>.nexa-stage-view.active')",
  "window.scrollTo({top:0,left:0,behavior:'auto'})",
  'visualViewport?.addEventListener',
  '__NEXA_V18_6_8_SAFE_AREA_DIAGNOSTIC__'
]) assert.ok(safeArea.includes(token), `safe-area v18.6.8 sem contrato esperado: ${token}`);
assert.ok(!safeArea.includes('MutationObserver'), 'safe-area não deve usar observador contínuo de DOM');

assert.ok(sw.includes('nexa-v18-6-8-mobile-safe-area-20260905'), 'service worker não está na versão v18.6.8');
assert.ok(sw.includes('20260905-v1868'), 'service worker precisa apontar para o hotfix v18.6.8');
assert.ok(sw.includes('cache:"no-store"'), 'service worker precisa buscar runtime sem cache obsoleto');

new Function(loader);
new Function(ui);
new Function(layout);
new Function(audit);
new Function(draft);
new Function(mobile);
new Function(safeArea);
new Function(sw);

console.log('NEXA UI + mobile safe-area + bottom nav + start-only recording + draft history + fixed canvas + audit contract: PASS');
