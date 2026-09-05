import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const loader = read('nexa-hotfix.js');
const ui = read('nexa-final-ui-v18.js');
const flow = read('nexa-layout-flow-v18.6.js');
const stableFlow = read('nexa-layout-flow-v18.5.js');
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
assert.ok(loader.includes('20260905-v1861'), 'loader precisa forçar cache-bust v18.6.1');
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

// v18.6.1: nunca esconder o Radar nem manter o stage host destacado do app.
for (const token of [
  '__NEXA_LAYOUT_FLOW_V18_6_1__',
  'restoreNativeClinicalRoot',
  "if(main&&host&&host.parentElement!==main)main.prepend(host)",
  "main.style.removeProperty('display')",
  "radar.hidden=false",
  "radar.classList.add('active')",
  'nexa-layout-flow-v18.5.js?v=20260905-v1861'
]) {
  assert.ok(flow.includes(token), `hotfix v18.6.1 sem proteção esperada: ${token}`);
}
assert.ok(!flow.includes('document.body.appendChild(host)'), 'hotfix não pode destacar novamente o stage host para o body');
assert.ok(!flow.includes("imp(main,'display','none')"), 'hotfix não pode ocultar o main clínico');
assert.ok(stableFlow.includes("if(host.parentElement!==main)main.prepend(host)"), 'layout estável precisa manter o stage host dentro do main');
assert.ok(stableFlow.includes('#realtimeRadarCard>#nexaDispositionCard'), 'Disposição do PS deve permanecer dentro do Radar');

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

assert.ok(sw.includes('nexa-v18-6-1-radar-restore-20260905'), 'service worker não está na versão de restauração do Radar');
assert.ok(sw.includes('20260905-v1861'), 'service worker precisa apontar para o hotfix v18.6.1');
assert.ok(sw.includes('text.replace(pattern,tag)'), 'service worker deve substituir o loader antigo no HTML navegado');
assert.ok(sw.includes('injectHotfix(await fetch'), 'navegação precisa executar a injeção do loader fresco');
assert.ok(sw.includes('cache:"no-store"'), 'service worker precisa buscar runtime sem cache obsoleto');

new Function(loader);
new Function(ui);
new Function(flow);
new Function(stableFlow);
new Function(audit);
new Function(sw);

console.log('NEXA UI + radar restore + audit contract: PASS');
