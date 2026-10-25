import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const script=read('nexa-radar-dynamic-focus-v18.16.js');
const style=read('nexa-radar-dynamic-focus-v18.16.css');
const loader=read('nexa-hotfix.js');
const index=read('index.html');
const worker=read('sw.js');
const psSource=read('nexa-radar-ps-mode-v18.14.js');
const packageJson=JSON.parse(read('package.json'));
assert.match(script,/window\.__NEXA_RADAR_DYNAMIC_FOCUS_V18_16__/);
assert.match(script,/window\.nexaRadar\?\.state\|\|window\.radarState/);
assert.match(script,/nexa:radar-state/);
assert.match(script,/nexa:consultation-reset/);
assert.match(script,/nexa:continuous-soap-mounted/);
assert.match(script,/window\.nexaRadarPsMode18131\?\.setMode/);
assert.match(script,/ngRisksTab/);
assert.match(script,/radarQuestions \[data-item\]/);
assert.match(script,/data-focus-filter/);
assert.match(script,/comorbidities/);
assert.match(script,/allergies/);
assert.match(script,/medicines/);
assert.match(script,/known_present/);
assert.match(script,/known_absent/);
assert.match(script,/A prioridade auxilia a anamnese/);
assert.match(style,/html\[data-theme="dark"\]/);
assert.match(style,/@media\(max-width:390px\)/);
assert.match(style,/prefers-reduced-motion/);
assert.match(style,/:focus-visible/);
assert.match(style,/body\[data-contextual-radar\] #realtimeRadarCard/);
assert.match(loader,/nexa-radar-ps-mode-v18\.14\.js[\s\S]*nexa-radar-dynamic-focus-v18\.16\.js/);
assert.equal((loader.match(/nexa-radar-dynamic-focus-v18\.16\.js/g)||[]).length,1);
assert.match(index,/nexa-radar-dynamic-focus-v18\.16\.css\?v=20261025-ui1/);
assert.match(index,/nexa-hotfix\.js\?v=20261025-radar-dynamic-ui/);
assert.match(worker,/nexa-v18-15-0-conflict-safe-reset-20261025/);
assert.match(worker,/nexa-hotfix\.js\?v=20261025-radar-dynamic-ui/);
assert.equal(packageJson.version,'18.15.0','Radar UI update does not fork the app release');
assert.match(psSource,/Falta para decidir/,'PS workflow preserved');
for(const forbidden of [
 /\bfetch\s*\(/,
 /\bsetInterval\s*\(/,
 /\bnew\s+Audio\s*\(/,
 /\bMutationObserver\s*\(/,
 /api\.respond\s*\(/,
 /\.fields\s*=/,
 /document\.querySelector\('\.field\[/,
 /localStorage\.setItem\s*\(/
])assert.doesNotMatch(script,forbidden,'dynamic presentation must not perform clinical, network or persistent mutations');
for(const x of ['Riscos e alertas','Comorbidades','Alergias','Medicamentos contínuos']){
 assert.ok(script.includes(x),'important view label missing: '+x);
}
console.log('Radar Dynamic Focus: scoped UI, state-only interactions, accessibility, cache and required history: PASS');
