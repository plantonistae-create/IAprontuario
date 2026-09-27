import fs from 'node:fs';
import assert from 'node:assert/strict';

const code=fs.readFileSync(new URL('../nexa-continuous-soap-v18.11.js',import.meta.url),'utf8');
const loader=fs.readFileSync(new URL('../nexa-hotfix.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const finalUi=fs.readFileSync(new URL('../nexa-final-ui-v18.js',import.meta.url),'utf8');

for(const token of [
  'nexaUnifiedFlow','nexaFlowModeBar','continuous','soap',
  'nexaExamQuickComposer','nexaPlanQuickComposer','nexaPlanPresets',
  'composeS','composeO','composeA','composeP','composeSoap','composeContinuous',
  'nexaAssociateCid','physicianCid','nexaClinicalBridge18101',
  'nexaEncounterAutosave18101','continuous_soap_edit',
  'nexaFlowCopyAll','nexaFlowPreview','nexaSoapSideNav'
]) assert.ok(code.includes(token),`missing ${token}`);

assert.ok(loader.includes('nexa-continuous-soap-v18.11.js?v=20260927-v18111'),'workflow module must be loaded with cache bust');
assert.ok(index.includes('setAssessment:(text,cid=\'\')'),'clinical bridge must expose free assessment setter');
assert.ok(index.includes("source:code?'physician_free_text_cid':'physician_free_text'"),'manual assessment must preserve explicit provenance');
assert.ok(index.includes("status:'altered',final:value,cid:code"),'free physician text must become usable without requiring CID');
assert.ok(!index.includes("if(!hypothesisReview.ai)hypothesisReview.ai=value"),'physician free text must never be relabeled as AI output');
assert.ok(index.includes("if(!document.body.dataset.nexaFlow&&!hypothesisReview.ai&&current)"),'legacy invalidation must not relabel physician text while Continuous/SOAP is active');
assert.ok(!code.includes('CID →'),'workflow must not imply automatic CID prescription mapping');
assert.ok(finalUi.includes("const STAGES=['radar','summary','history'];"),'desktop shell must expose only Continuous, SOAP and History');
assert.ok(finalUi.includes("radar:'Contínuo',summary:'SOAP rápido'"),'desktop shell labels must reflect the new flow');
assert.ok(finalUi.includes("flow&&b.dataset.go==='summary'"),'SOAP sidebar action must swap mode instead of opening the legacy Summary page');
new Function(code);
console.log('NEXA Continuous + SOAP contract: PASS');
