import fs from 'node:fs';
import assert from 'node:assert/strict';

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const finalUi=fs.readFileSync(new URL('../nexa-final-ui-v18.js',import.meta.url),'utf8');
const review=fs.readFileSync(new URL('../nexa-radar-auto-review-v18.12.js',import.meta.url),'utf8');
const autosave=fs.readFileSync(new URL('../nexa-encounter-autosave-v18.10.1.js',import.meta.url),'utf8');
const history=fs.readFileSync(new URL('../nexa-history-style-audit-v18.9.7.js',import.meta.url),'utf8');
const outbox=fs.readFileSync(new URL('../nexa-audit-outbox-v18.9.19.js',import.meta.url),'utf8');

for(const token of [
 'window.nexaClinicalRuntime18121',
 'window.currentProf=currentProf',
 'requireClinicalSession',
 'sb.auth.getUser',
 'sb.auth.refreshSession',
 "window.dispatchEvent(new CustomEvent('nexa:clinical-processing'",
 "preserve?.('structured')",
 "flush?.('structured')",
 "window.dispatchEvent(new CustomEvent('nexa:clinical-structured'",
 'Falha ao transcrever/estruturar'
]) assert.ok(index.includes(token),`index missing hotfix contract: ${token}`);

const openHistory=finalUi.match(/function openHistory\(\)\{[\s\S]*?\n\}/)?.[0]||'';
assert.match(openHistory,/data-stage="history"/,'History navigation must activate the native history stage');
assert.doesNotMatch(openHistory,/data-stage="summary"/,'History navigation must not route through Summary');
assert.ok(openHistory.includes('nexaRefreshHistory197'),'History navigation must refresh durable History');

assert.ok(review.includes("return'processing'"),'review phase machine must expose processing');
assert.ok(review.includes("return'error'"),'review phase machine must expose processing errors');
assert.ok(review.includes('body[data-nexa-clinical-phase="processing"] #nexaFlowHistory'),'structured sections must remain mounted during processing');
assert.ok(review.includes("nexa:clinical-processing"),'review flow must listen to processing lifecycle events');

assert.ok(autosave.includes("window.currentProf||(typeof currentProf!=='undefined'?currentProf:null)"),'autosave must bind to exposed active profile');
assert.ok(history.includes("window.currentProf||(typeof currentProf!=='undefined'?currentProf:null)"),'History must bind to exposed active profile');
assert.ok(history.includes('function auditEndpoint()'),'legacy History/Audit fallback must derive a real endpoint');
assert.ok(history.includes('runtime.supabaseUrl'),'legacy History/Audit fallback must use runtime Supabase config');
assert.ok(outbox.includes('c?.supabaseUrl||runtime.supabaseUrl'),'Audit outbox must use the active Supabase project URL');
assert.ok(outbox.includes('c?.supabaseKey||runtime.publishableKey'),'Audit outbox must use the active Supabase publishable key');

new Function(review);
new Function(autosave);
new Function(history);
new Function(outbox);
console.log('NEXA v18.12.1 clinical regression hotfix contract: PASS');
