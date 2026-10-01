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

assert.equal(pkg.version,'18.14.0','package version must identify the Radar PS release');
assert.match(moduleSource,/NEXA v18\.13\.1 · Radar visual flow hotfix/);
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
assert.match(moduleSource,/postRecordingTarget\(\)/,'recording completion must route to the canonical post-recording action row');
assert.doesNotMatch(moduleSource,/nexaRadarPost18130|nexaRadarPostAction18130/,'floating post-recording CTA must not exist');
assert.match(index,/setStage\('radar','realtimeRadarCard'\)/,'recording start must explicitly route to Radar after recording becomes active');
assert.match(index,/window\.nexaNavigateClinicalStage18131/,'visual flow must reuse the existing clinical-stage navigator');
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
assert.match(loader,/NEXA loader v18\.14\.0/);
assert.match(loader,/nexa-radar-visual-flow-v18\.13\.js\?v=20260929-v18131/);
assert.match(index,/nexa-hotfix\.js\?v=20261001-v18140/);
assert.match(sw,/CACHE_NAME="nexa-v18-14-0-radar-ps-20261001"/);
assert.match(sw,/HOTFIX_URL="\.\/nexa-hotfix\.js\?v=20261001-v18140"/);


const psSource=read('nexa-radar-ps-mode-v18.14.js');
assert.match(psSource,/Radar Modo PS/);
assert.match(psSource,/radar_view_mode/,'view mode must be a visual preference only');
assert.match(psSource,/Modo PS/);
assert.match(psSource,/Modo completo/);
assert.match(psSource,/Falta para decidir/);
assert.match(psSource,/PRONTO PARA CONDUTA/);
assert.match(psSource,/aria-pressed/,'mode selector must expose pressed state');
assert.match(psSource,/max-width:430px/,'390–430px mobile layout must be explicitly supported');
assert.match(psSource,/window\.nexaRadarVisualFlow18130\?\.derive/,'PS mode must reuse the existing Radar derivation/state');
assert.match(psSource,/nexa:radar-state/,'PS mode must render from the existing Radar lifecycle event');
assert.match(psSource,/localStorage\.setItem\(KEY/,'visual mode preference must persist locally');
assert.match(psSource,/data-nexa-radar-view-mode/,'same Radar DOM must be presented through two view modes');
assert.match(psSource,/nexaRadarOverview18130/,'complete Radar must be preserved rather than rebuilt');
assert.match(psSource,/nexaAutoVitals/,'PS vitals must mirror the existing vital-sign presentation');
assert.doesNotMatch(psSource,/setInterval\s*\(/,'PS mode must not add polling');
assert.doesNotMatch(psSource,/new\s+Audio\s*\(/,'PS mode must stay silent');
assert.doesNotMatch(psSource,/\bfetch\s*\(/,'switching or rendering PS mode must not add backend requests');
assert.doesNotMatch(psSource,/MutationObserver/,'PS mode must not add DOM observers');
assert.doesNotMatch(psSource,/radar\.subscribe/,'PS mode must not duplicate the existing Radar subscription');
assert.equal((loader.match(/nexa-radar-ps-mode-v18\.14\.js/g)||[]).length,1,'PS module must be loaded exactly once');
assert.match(loader,/nexa-radar-ps-mode-v18\.14\.js\?v=20261001-v18140/);
assert.equal(pkg.version,'18.14.0','release branch must carry the production version');
assert.match(sw,/CACHE_NAME="nexa-v18-14-0-radar-ps-20261001"/,'release cache must match the production version');

console.log('NEXA v18.14.0 Radar PS release contract: PASS');
