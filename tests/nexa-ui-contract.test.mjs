import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const loader = read('nexa-hotfix.js');
const ui = read('nexa-final-ui-v18.js');
const layout = read('nexa-layout-static-v18.6.5.js');
const audit = read('nexa-audit-autosave-v18.5.js');
const html = read('index.html');
const sw = read('sw.js');

const requiredLoaderModules = [
  'nexa-hotfix-v1.js',
  'nexa-ui-v3.js',
  'nexa-radar-v4.js',
  'nexa-final-ui-v18.js',
  'nexa-layout-static-v18.6.5.js',
  'nexa-audit-autosave-v18.5.js'
];
for (const mod of requiredLoaderModules) assert.ok(loader.includes(mod), `loader sem ${mod}`);
assert.ok(loader.includes('20260905-v1865'), 'loader precisa forçar cache-bust v18.6.5');

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

for (const id of ['recBtn','consent','timer','status','wave','processBtn','resetBtn','realtimeRadarCard','nexaPauseBtn','nexaFinishBtn']) {
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
  'top:var(--nf-top,72px)!important',
  'inset:var(--nf-top,72px) 0 0 var(--nf-side,214px)!important',
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
  'if(el===recMain||el===quick)return',
  "el.style.setProperty('display','none','important')",
  '__NEXA_V18_6_5_LAYOUT_DIAGNOSTIC__',
  "mode:'fixed-canvas+recorder-normalized'",
  'recorderNormalized:',
  'recorderChildren:'
]) assert.ok(layout.includes(token), `layout v18.6.5 sem proteção esperada: ${token}`);

assert.ok(!layout.includes('MutationObserver'), 'layout v18.6.5 não pode usar MutationObserver e gerar loop visual');
assert.ok(!layout.includes('requestAnimationFrame'), 'layout v18.6.5 não pode recalcular deslocamento a cada frame');
assert.ok(!layout.includes('getBoundingClientRect'), 'layout v18.6.5 não deve depender de correção geométrica medida');
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

assert.ok(sw.includes('nexa-v18-6-5-recorder-root-fix-20260905'), 'service worker não está na versão v18.6.5');
assert.ok(sw.includes('20260905-v1865'), 'service worker precisa apontar para o hotfix v18.6.5');
assert.ok(sw.includes('cache:"no-store"'), 'service worker precisa buscar runtime sem cache obsoleto');

new Function(loader);
new Function(ui);
new Function(layout);
new Function(audit);
new Function(sw);

console.log('NEXA UI + fixed canvas + recorder root-cause fix + all-stage layout + audit contract: PASS');
