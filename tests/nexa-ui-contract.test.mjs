import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const loader = read('nexa-hotfix.js');
const ui = read('nexa-final-ui-v18.js');
const layout = read('nexa-layout-static-v18.6.5.js');
const audit = read('nexa-audit-autosave-v18.5.js');
const draft = read('nexa-record-draft-history-v18.6.6.js');
const html = read('index.html');
const sw = read('sw.js');

const requiredLoaderModules = [
  'nexa-hotfix-v1.js',
  'nexa-ui-v3.js',
  'nexa-radar-v4.js',
  'nexa-final-ui-v18.js',
  'nexa-layout-static-v18.6.5.js',
  'nexa-audit-autosave-v18.5.js',
  'nexa-record-draft-history-v18.6.6.js'
];
for (const mod of requiredLoaderModules) assert.ok(loader.includes(mod), `loader sem ${mod}`);
assert.ok(loader.includes('20260905-v1866'), 'loader precisa forçar cache-bust v18.6.6');

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
  'e.stopImmediatePropagation()',
  "show('A gravação já está em andamento. Use o botão Pausar para pausar ou retomar.')",
  'function mountHistoryStage()',
  "q('.nexa-stage-view[data-stage=\"history\"]')",
  "const pane=$('workspaceHistoryPane')",
  'stage.appendChild(pane)',
  'function persistDraft()',
  ".eq('status','draft')",
  ".gte('updated_at',cutoff)",
  ".order('updated_at',{ascending:false})",
  'function loadDraftHistory()',
  "refresh.dataset.nexaDraftRefresh='1'",
  'Promise.resolve(result).finally(()=>schedulePersist(0))',
  'window.nexaPersistDraftNow=persistDraft',
  'window.nexaRefreshDraftHistory=loadDraftHistory',
  '__NEXA_V18_6_6_DRAFT_DIAGNOSTIC__'
]) assert.ok(draft.includes(token), `draft history/recording v18.6.6 sem contrato esperado: ${token}`);
assert.ok(!draft.includes('MutationObserver'), 'v18.6.6 não deve adicionar observador visual contínuo');
assert.ok(!draft.includes('requestAnimationFrame'), 'v18.6.6 não deve adicionar loop visual por frame');

assert.ok(sw.includes('nexa-v18-6-6-record-draft-history-20260905'), 'service worker não está na versão v18.6.6');
assert.ok(sw.includes('20260905-v1866'), 'service worker precisa apontar para o hotfix v18.6.6');
assert.ok(sw.includes('cache:"no-store"'), 'service worker precisa buscar runtime sem cache obsoleto');

new Function(loader);
new Function(ui);
new Function(layout);
new Function(audit);
new Function(draft);
new Function(sw);

console.log('NEXA UI + start-only recording + live draft history + fixed canvas + audit contract: PASS');
