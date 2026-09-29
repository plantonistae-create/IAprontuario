import fs from 'node:fs';
import assert from 'node:assert/strict';

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const finalUi=fs.readFileSync(new URL('../nexa-final-ui-v18.js',import.meta.url),'utf8');
const mobileShell=fs.readFileSync(new URL('../nexa-mobile-shell-v18.6.7.js',import.meta.url),'utf8');
const draftHistory=fs.readFileSync(new URL('../nexa-record-draft-history-v18.6.6.js',import.meta.url),'utf8');
const review=fs.readFileSync(new URL('../nexa-radar-auto-review-v18.12.js',import.meta.url),'utf8');
const autosave=fs.readFileSync(new URL('../nexa-encounter-autosave-v18.10.1.js',import.meta.url),'utf8');
const history=fs.readFileSync(new URL('../nexa-history-style-audit-v18.9.7.js',import.meta.url),'utf8');
const outbox=fs.readFileSync(new URL('../nexa-audit-outbox-v18.9.19.js',import.meta.url),'utf8');

for(const token of [
 'window.nexaClinicalRuntime18121',
 'requireClinicalSession',
 'sb.auth.getUser',
 'sb.auth.refreshSession',
 "window.dispatchEvent(new CustomEvent('nexa:clinical-processing'",
 "preserve?.('structured')",
 "flush?.('structured')",
 "window.dispatchEvent(new CustomEvent('nexa:clinical-structured'",
 'Falha ao transcrever/estruturar'
]) assert.ok(index.includes(token),`index missing hotfix contract: ${token}`);

assert.ok(index.includes("const valid=['radar','summary','hypothesis','plan','history'];"),'History must remain a first-class clinical stage');
assert.ok(index.includes("['history','HISTÓRICO','Consultas salvas'"),'buildClinicalStages must create a native History host');
assert.ok(index.includes("if(recording){pauseSession();return}"),'circular recorder must pause/resume through the shared pauseSession function');
assert.ok(draftHistory.includes("rec.dataset.nexaCircularToggle='1'"),'recorder/history bridge must preserve circular pause/resume semantics');
assert.ok(!draftHistory.includes("status.textContent='Gravação em andamento · use Pausar ou Finalizar'"),'legacy start-only recorder interception must be removed');
assert.ok(!draftHistory.includes("rec.addEventListener('click',e=>{\n      if(!recordingActive())return;"),'bridge must not capture active circular clicks');
assert.ok(!index.includes("recording?stopRec():startRec()"),'circular recorder must never finalize an active recording');
assert.ok(index.includes("window.dispatchEvent(new CustomEvent('nexa:recording-finalized'"),'finalization must publish the finalized recorder lifecycle event');
assert.ok(index.includes('nexaScrollToProcessCta();'),'finalization must scroll to the structure CTA');
assert.ok(index.includes("setStage('radar')"),'finish must keep the recorder stage available for the structure CTA');
assert.ok(index.includes("behavior:'smooth'"),'reset/clear must provide smooth top scrolling');
assert.ok(index.includes("document.querySelectorAll('.exam-sys-check').forEach(input=>input.addEventListener('change',()=>insertExam({allowEmpty:true})))"),'physical exam system clicks must immediately update the exam text');
assert.ok(index.includes("$('insertExamBtn').style.display='none'"),'legacy physical exam insert button must be hidden after enabling one-click insertion');
assert.ok(index.includes('id="conductSearchInput"'),'conduct picker must expose a search field');
assert.ok(index.includes('id="conductManualInput"'),'conduct picker must expose manual entry');
assert.ok(index.includes('id="conductManualAddBtn"'),'conduct picker must expose manual add action');
assert.ok(index.includes("appendConductToRecord(c.content,{source:'library'})"),'clicking a saved conduct must add it directly to the record');
assert.ok(index.includes("normalizedConductContent(c.content).includes(query)"),'conduct search must filter saved phrases by contained words');
assert.ok(index.includes("if(e.key==='Enter'&&!e.shiftKey)"),'manual conduct entry must support Enter to add');
assert.ok(index.includes('function openHistoryStage()'),'History must have one canonical navigation function');
assert.ok(index.includes('window.nexaOpenHistoryStage18122=openHistoryStage'),'canonical History navigation must be exposed to the Final UI');
assert.ok(index.includes("else if(a==='history'){openHistoryStage()}"),'quick History must route to the canonical native stage');
assert.ok(index.includes("addEventListener('click',openHistoryStage)"),'legacy desktop History must route to the canonical native stage');

const openHistory=finalUi.match(/function openHistory\(\)\{[\s\S]*?\n\}/)?.[0]||'';
assert.match(openHistory,/data-stage="history"/,'History navigation must activate the native history stage');
assert.doesNotMatch(openHistory,/data-stage="summary"/,'History navigation must not route through Summary');
assert.ok(openHistory.includes('nexaOpenHistoryStage18122'),'Final UI History must use the canonical native History path');
assert.ok(openHistory.includes('nexaRefreshHistory197')||openHistory.includes('nexaOpenHistoryStage18122'),'History navigation must refresh durable History');

assert.ok(review.includes("return'processing'"),'review phase machine must expose processing');
assert.ok(review.includes("return'error'"),'review phase machine must expose processing errors');
assert.ok(review.includes('body[data-nexa-clinical-phase="processing"] #nexaFlowHistory'),'structured sections must remain mounted during processing');
assert.ok(review.includes("nexa:clinical-processing"),'review flow must listen to processing lifecycle events');

assert.ok(autosave.includes("window.nexaClinicalRuntime18121?.getProfile?.()"),'autosave must bind to the clinical runtime profile');
assert.ok(history.includes("window.nexaClinicalRuntime18121?.getProfile?.()"),'History must bind to the clinical runtime profile');
assert.ok(history.includes('function auditEndpoint()'),'legacy History/Audit fallback must derive a real endpoint');
assert.ok(history.includes('runtime.supabaseUrl'),'legacy History/Audit fallback must use runtime Supabase config');
assert.ok(outbox.includes('c?.supabaseUrl||runtime.supabaseUrl'),'Audit outbox must use the active Supabase project URL');
assert.ok(outbox.includes('c?.supabaseKey||runtime.publishableKey'),'Audit outbox must use the active Supabase publishable key');
assert.ok(mobileShell.includes("nav.id='nexaMobileBottomNav'"),'canonical mobile shell must expose its bottom navigation');
assert.ok(mobileShell.includes('data-mobile-stage="${stage}"'),'canonical mobile shell must render stable stage-addressable tabs');
assert.ok(mobileShell.includes("const stages=['radar','summary','hypothesis','plan','history']"),'canonical mobile shell must include History');
assert.ok(!finalUi.includes('nfMobileNav'),'Final UI must not create a duplicate mobile navigation');
assert.ok(finalUi.includes("state==='stopped'"),'Final UI must distinguish finalized recording from idle');
assert.ok(finalUi.includes("recording.paused"),'Final UI must expose a paused visual state');

new Function(review);
new Function(autosave);
new Function(history);
new Function(outbox);
console.log('NEXA v18.12.2 recording/history hotfix contract: PASS');
