import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const loader = read('nexa-hotfix.js');
const ui = read('nexa-final-ui-v18.js');
const flow = read('nexa-layout-flow-v18.6.js');
const stableFlow = read('nexa-layout-flow-v18.5.js');
const gap = read('nexa-gap-selfheal-v18.6.2.js');
const audit = read('nexa-audit-autosave-v18.5.js');
const html = read('index.html');
const sw = read('sw.js');

const requiredLoaderModules = [
  'nexa-hotfix-v1.js',
  'nexa-ui-v3.js',
  'nexa-radar-v4.js',
  'nexa-final-ui-v18.js',
  'nexa-layout-flow-v18.6.js',
  'nexa-audit-autosave-v18.5.js',
  'nexa-gap-selfheal-v18.6.2.js'
];
for (const mod of requiredLoaderModules) assert.ok(loader.includes(mod), `loader sem ${mod}`);
assert.ok(loader.includes('20260905-v1862'), 'loader precisa forçar cache-bust v18.6.2');
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

// Radar continua no fluxo estável: não destacar nem ocultar o main clínico.
for (const token of [
  '__NEXA_LAYOUT_FLOW_V18_6_1__',
  'restoreNativeClinicalRoot',
  "if(main&&host&&host.parentElement!==main)main.prepend(host)",
  "main.style.removeProperty('display')",
  "radar.hidden=false",
  "radar.classList.add('active')"
]) {
  assert.ok(flow.includes(token), `restauração do Radar sem proteção esperada: ${token}`);
}
assert.ok(!flow.includes('document.body.appendChild(host)'), 'Radar não pode voltar a ser destacado para body');
assert.ok(!flow.includes("imp(main,'display','none')"), 'main clínico não pode ser ocultado');
assert.ok(stableFlow.includes("if(host.parentElement!==main)main.prepend(host)"), 'layout estável precisa manter o stage host dentro do main');
assert.ok(stableFlow.includes('#realtimeRadarCard>#nexaDispositionCard'), 'Disposição do PS deve permanecer dentro do Radar');

// v18.6.2: a faixa é corrigida pela geometria renderizada, sem reparent/hide.
for (const token of [
  '__NEXA_GAP_SELFHEAL_V18_6_2__',
  "imp(main,'grid-template-columns','minmax(0,1fr)')",
  "imp(main,'gap','0')",
  "imp(host,'grid-column','1 / -1')",
  'const expected=sr.right+16',
  'const residual=actual-expected',
  'host.dataset.nexaGapCorrection',
  "imp(host,'left',`${-correction}px`)",
  '__NEXA_V18_6_2_GAP_DIAGNOSTIC__',
  'radarVisible:',
  'hostInMain:'
]) {
  assert.ok(gap.includes(token), `gap self-heal sem proteção esperada: ${token}`);
}
assert.ok(!gap.includes('document.body.appendChild(host)'), 'gap self-heal não pode destacar o Radar para body');
assert.ok(!gap.includes("imp(main,'display','none')"), 'gap self-heal não pode ocultar o main');
assert.ok(gap.includes("stage.hidden=false"), 'gap self-heal deve preservar a view Radar visível');

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

assert.ok(sw.includes('nexa-v18-6-2-gap-selfheal-20260905'), 'service worker não está na versão gap self-heal');
assert.ok(sw.includes('20260905-v1862'), 'service worker precisa apontar para o hotfix v18.6.2');
assert.ok(sw.includes('text.replace(pattern,tag)'), 'service worker deve substituir o loader antigo no HTML navegado');
assert.ok(sw.includes('injectHotfix(await fetch'), 'navegação precisa executar a injeção do loader fresco');
assert.ok(sw.includes('cache:"no-store"'), 'service worker precisa buscar runtime sem cache obsoleto');

new Function(loader);
new Function(ui);
new Function(flow);
new Function(stableFlow);
new Function(gap);
new Function(audit);
new Function(sw);

console.log('NEXA UI + Radar + gap self-heal + audit contract: PASS');
