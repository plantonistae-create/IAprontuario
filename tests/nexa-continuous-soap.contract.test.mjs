import fs from 'node:fs';
import assert from 'node:assert/strict';

const code=fs.readFileSync(new URL('../nexa-continuous-soap-v18.11.js',import.meta.url),'utf8');
const loader=fs.readFileSync(new URL('../nexa-hotfix.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const finalUi=fs.readFileSync(new URL('../nexa-final-ui-v18.js',import.meta.url),'utf8');

for(const token of [
  'nexaUnifiedFlow','nexaFlowModeBar','continuous','soap',
  'nexaPlanQuickComposer','nexaPlanPresets',
  'composeS','composeO','composeA','composeP','composeSoap','composeContinuous',
  'nexaAssociateCid','physicianCid','nexaClinicalBridge18101',
  'nexaEncounterAutosave18101','continuous_soap_edit',
  'nexaFlowCopyAll','nexaFlowPreview','nexaSoapSideNav'
]) assert.ok(code.includes(token),`missing ${token}`);

assert.ok(loader.includes('nexa-continuous-soap-v18.11.js?v=20260929-v18128'),'workflow module must be loaded with the current cache bust');
assert.ok(code.includes("['ANTECEDENTES',c.antecedentes]"),'SOAP S must expose ANTECEDENTES in uppercase');
assert.ok(code.includes("['ALERGIAS',c.alergias]"),'SOAP S must expose ALERGIAS in uppercase');
assert.ok(code.includes("join('\\n\\n')"),'SOAP S blocks must preserve a blank line between sections');
assert.ok(code.includes("['SINAIS VITAIS',c.sinais_vitais]"),'SOAP O must use a stable uppercase vital-signs block');
assert.ok(code.includes("['EXAME FÍSICO',c.exame_fisico]"),'SOAP O must use a stable uppercase physical-exam block');
assert.ok(!code.includes('nexaExamQuickComposer'),'duplicate physical-exam quick composer must be removed');
assert.ok(!code.includes('Compositor rápido · clique para adicionar ou remover'),'duplicate physical-exam chip composer must not render');
assert.ok(index.includes('Modelos por perfil · selecione o perfil e clique nos sistemas'),'canonical profile-based physical exam must remain visible');
assert.ok(code.includes("['CONDUTAS',c.conduta]"),'SOAP P must expose conduct in a stable uppercase block');
assert.ok(code.includes("el.textContent='✓ '+label+' copiado'"),'copy feedback must be non-blocking and standardized');
assert.ok(code.includes("conduct.classList.remove('nexa-plan-v3-detail','active')"),'unified plan must neutralize the legacy Plan V3 visibility gate for Condutas');
assert.ok(code.includes("guidance.classList.remove('nexa-plan-v3-detail','active')"),'unified plan must neutralize the legacy Plan V3 visibility gate for Orientações');
assert.ok(code.includes("if(text(a.confirmed_cid))parts.push"),'SOAP A must include only a confirmed CID');
assert.ok(code.includes('position:fixed;top:calc(var(--nexa-topbar-h,64px) + 8px)'),'flow selector must stay fixed below the desktop session bar');
assert.ok(code.includes('html.nexa-mobile-v1867 #nexaFlowModeBar'),'mobile flow selector must be positioned below the dedicated mobile header');
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
