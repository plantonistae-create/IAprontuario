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
assert.ok(loader.includes('20260904-v183'), 'loader precisa forçar cache-bust v18.3');

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

// v18.3: a antiga coluna esquerda deve ser removida do DOM, não apenas escondida.
for (const token of [
  '__NEXA_LAYOUT_FLOW_V18_3__',
  'preserveFinalContent',
  "qa('#mainApp>main .panel-left').forEach(left=>left.remove())",
  "imp(main,'display','block')",
  "imp(main,'margin','0 0 0 var(--nf-side)')",
  "imp(panel,'width','100%')",
  'legacyPanelLeftCount',
  '__NEXA_V18_3_LAYOUT_DIAGNOSTIC__',
  'position:static!important',
  'grid-area:record!important',
  'grid-area:summary!important',
  'grid-area:alerts!important'
]) {
  assert.ok(flow.includes(token), `layout-flow v18.3 sem proteção esperada: ${token}`);
}
assert.ok(flow.includes('panel.appendChild(directHost)'), 'host de estágios precisa ser preservado antes de remover wrappers legados');
assert.ok(flow.includes('#realtimeRadarCard>#nexaDispositionCard'), 'Disposição do PS deve permanecer dentro do Radar');

assert.ok(sw.includes('nexa-v18-3-layout-20260904'), 'service worker não está na versão v18.3');
assert.ok(sw.includes('cache:"no-store"'), 'service worker precisa buscar runtime sem cache obsoleto');

new Function(loader);
new Function(ui);
new Function(flow);
new Function(sw);

console.log('NEXA UI contract: PASS');
