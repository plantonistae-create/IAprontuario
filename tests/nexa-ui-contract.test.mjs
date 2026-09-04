import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const loader = read('nexa-hotfix.js');
const ui = read('nexa-final-ui-v18.js');
const html = read('index.html');
const sw = read('sw.js');

const requiredLoaderModules = [
  'nexa-hotfix-v1.js',
  'nexa-ui-v3.js',
  'nexa-radar-v4.js',
  'nexa-final-ui-v18.js'
];
for (const mod of requiredLoaderModules) assert.ok(loader.includes(mod), `loader sem ${mod}`);

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

assert.ok(sw.includes('nexa-v18-final-20260904'), 'service worker não está na versão v18');
assert.ok(sw.includes('cache:"no-store"'), 'service worker precisa buscar runtime sem cache obsoleto');

// Syntax validation in addition to `node --check`.
new Function(loader);
new Function(ui);
new Function(sw);

console.log('NEXA UI contract: PASS');
