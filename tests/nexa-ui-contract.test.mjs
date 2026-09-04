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
assert.ok(loader.includes('20260904-v182'), 'loader precisa forçar cache-bust v18.2');

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

// v18.2: guardas contra coluna fantasma + sobreposição do Radar.
for (const token of [
  'grid-template-columns:minmax(0,1fr)!important',
  'grid-column:1/-1!important',
  'position:static!important',
  'forceSingleContentColumn',
  "setProperty(prop,val,'important')",
  'legacyLeftHidden',
  'panelStartsInFirstColumn',
  'dispositionInsideRadar',
  '__NEXA_V18_2_LAYOUT_SMOKE__'
]) {
  assert.ok(flow.includes(token), `layout-flow v18.2 sem proteção esperada: ${token}`);
}
assert.ok(flow.includes('#mainApp>main .panel-left'), 'layout-flow precisa ocultar qualquer coluna esquerda legada, mesmo aninhada');
assert.ok(flow.includes("imp(main,'display','grid')"), 'main precisa receber display:grid inline !important');
assert.ok(flow.includes("imp(main,'grid-template-columns','minmax(0,1fr)')"), 'main precisa receber uma única coluna inline !important');
assert.ok(flow.includes("imp(panel,'grid-column','1 / -1')"), 'panel-right precisa começar na primeira coluna real');
assert.ok(flow.includes('#realtimeRadarCard>#nexaDispositionCard'), 'Disposição do PS deve permanecer dentro do Radar');
assert.ok(flow.includes('grid-area:record!important'), 'gravação deve ocupar a faixa superior do Radar');
assert.ok(flow.includes('grid-area:summary!important'), 'Resumo rápido deve ocupar a coluna direita');
assert.ok(flow.includes('grid-area:alerts!important'), 'Alertas devem ocupar a coluna direita abaixo do resumo');

assert.ok(sw.includes('nexa-v18-2-layout-20260904'), 'service worker não está na versão v18.2');
assert.ok(sw.includes('cache:"no-store"'), 'service worker precisa buscar runtime sem cache obsoleto');

new Function(loader);
new Function(ui);
new Function(flow);
new Function(sw);

console.log('NEXA UI contract: PASS');
