import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const loader = read('nexa-hotfix.js');
const ui = read('nexa-final-ui-v18.js');
const flow = read('nexa-layout-flow-v18.1.js');
const html = read('index.html');
const sw = read('sw.js');

const requiredLoaderModules = [
  'nexa-hotfix-v1.js',
  'nexa-ui-v3.js',
  'nexa-radar-v4.js',
  'nexa-final-ui-v18.js',
  'nexa-layout-flow-v18.1.js'
];
for (const mod of requiredLoaderModules) assert.ok(loader.includes(mod), `loader sem ${mod}`);
assert.ok(loader.includes('20260905-v184'), 'loader precisa forçar cache-bust v18.4');

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

for (const token of ['#nfSide','#nfTop','#nfRecMain','#nfRecActions','#nfSummary','#nfRadarTabs','cleanupDuplicates','__NEXA_V18_SMOKE__']) {
  assert.ok(ui.includes(token), `UI v18 sem contrato esperado: ${token}`);
}

for (const duplicate of ['nexaRadarPauseProxy','nexaRadarFinishProxy','nexaRadarProcessProxy','nexaRadarClearProxy']) {
  assert.ok(ui.includes(duplicate), `UI v18 não remove proxy legado ${duplicate}`);
}

// v18.4: geometria crítica não pode depender de body.nexa-v340.
for (const token of [
  '__NEXA_LAYOUT_FLOW_V18_4__',
  'ensureBodyContract',
  "document.body.classList.add('nexa-v340')",
  'html body #mainApp>main',
  "imp(main,'display','block')",
  "imp(main,'grid-template-columns','none')",
  "imp(main,'margin','0 0 0 var(--nf-side,214px)')",
  "qa('#mainApp>main .panel-left').forEach(left=>left.remove())",
  '__NEXA_V18_4_LAYOUT_DIAGNOSTIC__',
  'bodyHasContract',
  'panelGap',
  'recorderGap',
  'grid-area:record!important',
  'grid-area:summary!important',
  'grid-area:alerts!important'
]) {
  assert.ok(flow.includes(token), `layout-flow v18.4 sem proteção esperada: ${token}`);
}
assert.ok(flow.includes("if($('nfShell')&&$('nfRecMain'))"), 'panel-left só deve ser removido após a UI final recolher os controles nativos');
assert.ok(flow.includes('#realtimeRadarCard>#nexaDispositionCard'), 'Disposição do PS deve permanecer dentro do Radar');
assert.ok(!flow.includes('html body.nexa-v340 #mainApp>main{'), 'regra crítica do main não pode depender de body.nexa-v340');

assert.ok(sw.includes('nexa-v18-4-layout-20260905'), 'service worker não está na versão v18.4');
assert.ok(sw.includes('20260905-v184'), 'service worker precisa apontar para o hotfix v18.4');
assert.ok(sw.includes('cache:"no-store"'), 'service worker precisa buscar runtime sem cache obsoleto');

new Function(loader);
new Function(ui);
new Function(flow);
new Function(sw);

console.log('NEXA UI contract: PASS');
