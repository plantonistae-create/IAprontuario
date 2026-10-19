import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const html=read('index.html');
const soap=read('nexa-continuous-soap-v18.11.js');
const shell=read('nexa-final-ui-v18.js');
const login=read('nexa-auth-session-v1.css');
const loader=read('nexa-hotfix.js');
const inline=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
test('all inline scripts parse (no broken login or clinical runtime)',()=>{
 inline.forEach((m,i)=>assert.doesNotThrow(()=>new vm.Script(m[1],{filename:'inline-'+i})));
 for(const s of [soap,shell])assert.doesNotThrow(()=>new vm.Script(s));
});
test('light theme is initial default while explicit clinician preference persists',()=>{
 assert.match(html,/localStorage\.getItem\('nexa-theme-v340'\)\|\|localStorage\.getItem\('nexa-theme'\)\|\|'light'/);
 assert.doesNotMatch(html,/systemDark\?'dark':'light'/);
 assert.match(shell,/localStorage\.setItem\('nexa-theme-v340',t\)/);
});
test('dark theme must keep remember-login label visible on the light login panel',()=>{
 assert.match(login,/#loginGate \.login-box \.nexa-remember-option span/);
 assert.match(login,/color:inherit!important/);
 assert.match(login,/color:#203846!important/);
});
test('single manual opt-in for detailed speaker diarization is beside transcription',()=>{
 assert.match(soap,/\$\('identifySpeakersLegacy'\)\?\.closest\('\.nexa-speaker-optin'\)/);
 assert.match(soap,/processRow\.appendChild\(voiceOption\)/);
 assert.match(soap,/checkbox\.checked=false/);
 assert.match(html,/identifySpeakersLegacy/);
 assert.match(html,/nexaDiarizeAudio\(audioBlob\)/);
});
test('SOAP exam editor visible, redundant vitals hidden, one copy O',()=>{
 assert.match(soap,/vital\.classList\.add\('nexa-v1811-hidden'\)/);
 assert.match(soap,/duplicateCopy\.classList\.add\('nexa-v1811-hidden'\)/);
 assert.match(soap,/#nexaFlowExam #examSystems\{display:grid!important;grid-template-columns:repeat\(3/);
 assert.match(soap,/#nexaFlowExam \.nexa-flow-copy\{display:inline-flex\}/);
 assert.match(soap,/composeO\(c=clinical\(\)\)/);
});
test('CID physician confirmation validates catalog and preserves audit metadata',()=>{
 assert.match(soap,/nexaHypothesisCidGuard1911\?\.validate/);
 assert.match(soap,/nexaClinicalBridge18101\?\.reviewAssessment/);
 assert.match(html,/reviewAssessment:async\(text,cid=' '\)|reviewAssessment:async\(text,cid=''\)/);
 for(const field of ["assessment_reviews","actor_user_id","previous_cid","resulting_cid","resulting_status","assessment_review"])
  assert.ok(html.includes(field),'Missing assessment audit attribute: '+field);
 assert.match(html,/if\(!stored\?\.encounter_id\|\|stored\.owner_user_id!==currentProf\.id\)/);
});
test('conduct additions preserve click ordering; library sorting is a separate edit mode',()=>{
 assert.match(soap,/if\(idx>=0\)return;lines\.push\(snippet\)/);
 assert.match(soap,/planLines\(\).*?setPlanLines/);
 assert.match(soap,/nexa-library-order-mode/);
 assert.match(soap,/Reordenar biblioteca/);
 assert.match(soap,/nexa-plan-line\{grid-template-columns:1fr\}/);
 assert.match(soap,/#nexaFlowPlan #conductList\{display:grid!important;grid-template-columns:1fr/);
 assert.match(html,/appendConductToRecord\(c\.content,\{source:'library'\}\)/);
});
test('discharge directions remain in prescription, not full note or duplicate plan card',()=>{
 assert.doesNotMatch(soap,/\['ORIENTAÇÕES',c\.orientacoes_alta\]/);
 assert.match(soap,/nexa-plan-action-card\[data-plan-jump="rxGuidancePreview"\]/);
 assert.match(soap,/nexa-plan-action-card\[data-plan-jump="conductBlock"\]/);
 assert.match(soap,/originalFinal\.classList\.add\('nexa-v1811-hidden'\)/);
 assert.match(soap,/nexaFlowCopyAll/);
});
test('runtime loader still mounts the canonical SOAP flow',()=>{
 assert.match(loader,/nexa-continuous-soap-v18\.11\.js/);
});
