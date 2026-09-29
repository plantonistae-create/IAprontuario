import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

const moduleSource=read('nexa-radar-visual-flow-v18.13.js');
const loader=read('nexa-hotfix.js');
const index=read('index.html');
const sw=read('sw.js');
const pkg=JSON.parse(read('package.json'));

assert.equal(pkg.version,'18.13.0','package version must identify the Radar visual-flow release');
assert.match(moduleSource,/NEXA v18\.13\.0 · Radar visual flow/);
assert.match(moduleSource,/window\.__NEXA_RADAR_VISUAL_FLOW_V18_13__/);
assert.match(moduleSource,/nexa:recording-finalized/,'must react to the real recorder finalization event');
assert.match(moduleSource,/nexa:clinical-processing/,'must react to the real processing lifecycle');
assert.match(moduleSource,/window\.nexaRadar\?\.state/,'must derive the presentation from the existing Radar state');
assert.match(moduleSource,/window\.nexaRecordingTimerState198/,'must mirror the existing recorder state when available');
assert.match(moduleSource,/document\.getElementById\('timer'\)|\$\('timer'\)/,'must use the existing timer as source');
assert.doesNotMatch(moduleSource,/setInterval\s*\(/,'visual flow must not add a polling timer');
assert.doesNotMatch(moduleSource,/new\s+Audio\s*\(/,'question updates must stay silent');
assert.doesNotMatch(moduleSource,/MutationObserver[\s\S]*document\.documentElement/,'must not install a global subtree observer');
assert.match(moduleSource,/clickExisting\(\['nexaLocalPauseBtn','nfPause','nexaPauseBtn','nexaDesktopPause','recBtn'\]\)/,'Radar pause must proxy existing recorder controls');
assert.match(moduleSource,/clickExisting\(\['nexaLocalFinishBtn','nfFinish','nexaFinishBtn','nexaDesktopFinish'\]\)/,'Radar finish must proxy existing recorder controls');
assert.match(moduleSource,/sourceProcessButton\(\)/,'post-recording CTA must proxy the existing process action');
assert.match(moduleSource,/Cobertura da consulta/);
assert.match(moduleSource,/não é score de qualidade médica/);
assert.match(moduleSource,/Próximas perguntas sugeridas/);
assert.match(moduleSource,/Perguntas prioritárias/);
assert.match(moduleSource,/Perguntas complementares/);
assert.match(moduleSource,/data-priority/,'priority styling must consume existing priority state');
assert.match(moduleSource,/aria-valuemin="0"/);
assert.match(moduleSource,/:focus-visible/);
assert.match(moduleSource,/min-height:42px/);

for(const invented of [
  'Dor torácica com início súbito',
  'Dispneia aos esforços',
  'Quando começou a dor?',
  'A dor irradia para algum lugar?',
  'Teve febre?'
]){
  assert.equal(moduleSource.includes(invented),false,'reference-only clinical example leaked into product code: '+invented);
}

const moduleRefs=[...loader.matchAll(/nexa-radar-visual-flow-v18\.13\.js/g)];
assert.equal(moduleRefs.length,1,'visual-flow module must be loaded exactly once');
assert.match(loader,/NEXA loader v18\.13\.0/);
assert.match(loader,/nexa-radar-visual-flow-v18\.13\.js\?v=20260929-v18130/);
assert.match(index,/nexa-hotfix\.js\?v=20260929-v18130/);
assert.match(sw,/CACHE_NAME="nexa-v18-13-0-radar-flow-20260929"/);
assert.match(sw,/HOTFIX_URL="\.\/nexa-hotfix\.js\?v=20260929-v18130"/);

console.log('NEXA v18.13.0 Radar visual flow contract: PASS');
