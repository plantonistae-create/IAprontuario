import fs from 'node:fs';
import assert from 'node:assert/strict';

const code=fs.readFileSync(new URL('../nexa-radar-auto-review-v18.12.js',import.meta.url),'utf8');
const engine=fs.readFileSync(new URL('../nexa-radar-engine.js',import.meta.url),'utf8');
const loader=fs.readFileSync(new URL('../nexa-hotfix.js',import.meta.url),'utf8');

for(const token of [
  'nexaAutoRadarWorkspace','nexaAutoStatus','nexaNextBest','nexaPriorityList',
  'captureVitals','nexaAutoVitals','nexaFinalPending','nexaClinicalPhase',
  'nexaExamOptional','nexa:radar-state','nexaEncounterAutosave18101',
  'spoken_vitals','review','consult'
]) assert.ok(code.includes(token),`missing ${token}`);

assert.ok(loader.includes('nexa-radar-auto-review-v18.12.js?v=20260927-v18120'),'v18.12 module must be loaded with cache bust');
assert.match(engine,/pressao\)\\s\*\[:=\]\?\\s\*\\d\{2,3\}.*por/,'engine must accept spoken blood pressure using "por"');
assert.ok(engine.includes('\\s+e\\s+meio'),'engine must recognize spoken half-degree temperature');
assert.ok(code.includes("item.status==='confirm'"),'ambiguous Radar state must remain visible for confirmation');
assert.ok(code.includes("existing&&existing!==value"),'spoken vitals must never silently overwrite a different recorded value');
assert.ok(code.includes("phase==='review'"),'post-consult review must be phase-gated');
assert.ok(code.includes("Continuar mesmo assim"),'final pending review must not block physician output');
assert.ok(!code.includes('submit-audit-case'),'v18.12 flow module must not reopen the Audit pipeline');

new Function(code);
console.log('NEXA v18.12 automatic Radar/review contract: PASS');
