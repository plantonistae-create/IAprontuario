import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const loader = read('nexa-hotfix.js');
const ui = read('nexa-final-ui-v18.js');
const flow = read('nexa-layout-flow-v18.6.js');
const audit = read('nexa-audit-autosave-v18.5.js');
const html = read('index.html');
const sw = read('sw.js');

const requiredLoaderModules = [
  'nexa-hotfix-v1.js',
  'nexa-ui-v3.js',
  'nexa-radar-v4.js',
  'nexa-final-ui-v18.js',
  'nexa-layout-flow-v18.6.js',
  'nexa-audit-autosave-v18.5.js'
];
for (const mod of requiredLoaderModules) assert.ok(loader.includes(mod), `loader sem ${mod}`);
assert.ok(loader.includes('20260905-v186'), 'loader precisa forçar cache-bust v18.6');
assert.ok(!loader.includes('nexa-layout-flow-v18.5.js'), 'loader não pode reativar o layout-flow v18.5');
assert.ok(!loader.includes('nexa-layout-flow-v18.1.js'), 'loader não pode reativar o layout-flow legado');

const forbiddenLoaderModules = [
  'nexa-runtime-consolidated-v14.js',
  'nexa-approved-ui-v15.js',
  'nexa-parity-v17.js',
  'nexa-parity-v17-hotfix.js'
];
for (const mod of forbiddenLoaderModules) assert.ok(!loader.includes(mod), `loader ainda carrega camada visual antiga: ${mod}`);

for (const id of ['recBtn','consent','timer','status','wave','processBtn','resetBtn','realtimeRadarCard','nexaPauseBtn','nexaFinishBtn']) {
  assert.ok(html.includes(`id="${id}"`), `controle nativo ausente no index.html: ${id}`);
}
assert.ok(html.includes("host.id='nexaStageHost'"), 'index precisa continuar criando o stage host clínico');
assert.ok(html.includes("$('submitAuditBtn').onclick=submitCurrentForAudit"), 'envio manual à auditoria deve continuar disponível como fallback');

for (const token of ['#nfSide','#nfTop','#nfRecMain','#nfRecActions','#nfSummary','#nfRadarTabs','cleanupDuplicates','__NEXA_V18_SMOKE__']) {
  assert.ok(ui.includes(token), `UI v18 sem contrato esperado: ${token}`);
}
for (const duplicate of ['nexaRadarPauseProxy','nexaRadarFinishProxy','nexaRadarProcessProxy','nexaRadarClearProxy']) {
  assert.ok(ui.includes(duplicate), `UI v18 não remove proxy legado ${duplicate}`);
}

// v18.6: o atendimento ativo é destacado fisicamente do main legado.
for (const token of [
  '__NEXA_LAYOUT_FLOW_V18_6__',
  'detachStageHost',
  'document.body.appendChild(host)',
  "#mainApp>main{\n    display:none!important",
  'body.nexa-v340.nexa-doctor-view:not(.doctor-home-open)>#nexaStageHost',
  'width:calc(100vw - var(--nf-side,214px) - 32px)!important',
  'margin:0 16px 20px calc(var(--nf-side,214px) + 16px)!important',
  'hostAtBody',
  'mainHidden',
  '__NEXA_V18_6_LAYOUT_DIAGNOSTIC__',
  'grid-area:record!important',
  'grid-area:summary!important',
  'grid-area:alerts!important'
]) {
  assert.ok(flow.includes(token), `layout-flow v18.6 sem proteção esperada: ${token}`);
}
assert.ok(flow.includes("host.querySelector('#recBtn')&&host.querySelector('#realtimeRadarCard')"), 'stage host só pode ser destacado após possuir os controles clínicos reais');
assert.ok(flow.includes('#realtimeRadarCard>#nexaDispositionCard'), 'Disposição do PS deve permanecer dentro do Radar');
assert.ok(!flow.includes('main.prepend(host)'), 'v18.6 não pode recolocar o host dentro do main legado');

// Auditoria automática permanece ativa.
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
  'stopImmediatePropagation',
  'nexaAutoArchiveForAudit'
]) {
  assert.ok(audit.includes(token), `audit autosave sem proteção esperada: ${token}`);
}
assert.ok(audit.includes("d.error!=='ALREADY_SUBMITTED'"), 'autosave deve tratar reenvio idempotente como sucesso');
assert.ok(audit.includes('Consulta salva. Auditoria ficou em fila'), 'falha transitória deve preservar o caso e entrar em retry');

assert.ok(sw.includes('nexa-v18-6-detached-stage-20260905'), 'service worker não está na versão v18.6');
assert.ok(sw.includes('20260905-v186'), 'service worker precisa apontar para o hotfix v18.6');
assert.ok(sw.includes('text.replace(pattern,tag)'), 'service worker deve substituir o loader antigo no HTML navegado');
assert.ok(sw.includes('injectHotfix(await fetch'), 'navegação precisa executar a injeção do loader fresco');
assert.ok(sw.includes('cache:"no-store"'), 'service worker precisa buscar runtime sem cache obsoleto');

new Function(loader);
new Function(ui);
new Function(flow);
new Function(audit);
new Function(sw);

console.log('NEXA UI + audit contract: PASS');
