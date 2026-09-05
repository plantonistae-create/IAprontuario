import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const loader=read('nexa-hotfix.js');
const ui=read('nexa-final-ui-v18.js');
const layout=read('nexa-layout-static-v18.6.5.js');
const audit=read('nexa-audit-autosave-v18.5.js');
const draft=read('nexa-record-draft-history-v18.6.6.js');
const mobile=read('nexa-mobile-shell-v18.6.7.js');
const historyLifecycle=read('nexa-history-lifecycle-v18.6.9.js');
const auditor=read('nexa-auditor-native-v18.8.js');
const mobileFlow=read('nexa-mobile-flow-v18.8.1.js');
const html=read('index.html');
const sw=read('sw.js');

const required=['nexa-hotfix-v1.js','nexa-ui-v3.js','nexa-radar-v4.js','nexa-final-ui-v18.js','nexa-layout-static-v18.6.5.js','nexa-audit-autosave-v18.5.js','nexa-record-draft-history-v18.6.6.js','nexa-mobile-shell-v18.6.7.js','nexa-history-lifecycle-v18.6.9.js','nexa-auditor-native-v18.8.js','nexa-mobile-flow-v18.8.1.js'];
for(const mod of required)assert.ok(loader.includes(mod),`loader sem ${mod}`);
for(const forbidden of ['nexa-mobile-safe-area-v18.6.8.js','nexa-mobile-top-safe-v18.8.js','nexa-auditor-workspace-v18.7.js','nexa-auditor-mobile-fix-v18.7.1.js','nexa-gap-selfheal-v18.6.2.js'])assert.ok(!loader.includes(forbidden),`loader não pode carregar camada conflitante: ${forbidden}`);
assert.ok(loader.includes('20260905-v1881'),'cache-bust v18.8.1 ausente');
assert.ok(loader.lastIndexOf('nexa-mobile-flow-v18.8.1.js')>loader.lastIndexOf('nexa-auditor-native-v18.8.js'),'mobile flow deve carregar por último');

for(const id of ['recBtn','consent','timer','processBtn','resetBtn','realtimeRadarCard','workspaceHistoryPane','submitAuditBtn'])assert.ok(html.includes(`id="${id}"`),`controle nativo ausente: ${id}`);
assert.ok(html.includes("$('submitAuditBtn').onclick=submitCurrentForAudit"));
assert.ok(html.includes("Date.now()-7*24*60*60*1000"));
assert.ok(html.includes('await syncReviewToStyleExample(activeHistoryId,fields,now)'));
assert.ok(html.includes("sb.rpc('get_audit_queue'"));
assert.ok(html.includes("sb.rpc('submit_audit_review'"));

for(const token of ['__NEXA_FIXED_CANVAS_V18_6_5__','function normalizeRecorderGrid()'])assert.ok(layout.includes(token));
assert.ok(!layout.includes('MutationObserver')&&!layout.includes('setInterval'));
for(const token of ['__NEXA_AUDIT_AUTOSAVE_V18_5__','archiveCurrentCase','automatic_audit_handoff:true','retryQueue'])assert.ok(audit.includes(token));
for(const token of ['__NEXA_RECORD_DRAFT_HISTORY_V18_6_6__',"rec.dataset.nexaStartOnly='1'",'window.nexaRefreshDraftHistory'])assert.ok(draft.includes(token));
for(const token of ['__NEXA_MOBILE_SHELL_V18_6_7__','nexaMobileBottomNav','nexaMobileHeader'])assert.ok(mobile.includes(token));
for(const token of ['__NEXA_HISTORY_LIFECYCLE_V18_6_9__','Consultas dos últimos 7 dias','Enviar p/ auditoria'])assert.ok(historyLifecycle.includes(token));
for(const token of ['__NEXA_AUDITOR_NATIVE_V18_8__','Painel de Auditoria','Fila de casos','Aprovar sem alteração','Aprovar com correções','submit_audit_review'])assert.ok(auditor.includes(token));
assert.ok(!auditor.includes('new MutationObserver')&&!auditor.includes('setInterval'));
for(const token of ['__NEXA_MOBILE_FLOW_V18_8_1__','position:sticky!important','document.body.insertBefore(header,app)','padding:12px 12px','__NEXA_V18_8_1_MOBILE_FLOW_DIAGNOSTIC__'])assert.ok(mobileFlow.includes(token),`mobile flow sem ${token}`);
assert.ok(!mobileFlow.includes('MutationObserver')&&!mobileFlow.includes('setInterval'),'mobile flow deve ser estático');
assert.ok(sw.includes('nexa-v18-8-1-mobile-flow-20260905'));
assert.ok(sw.includes('20260905-v1881'));
assert.ok(sw.includes('cache:"no-store"'));

new Function(loader);new Function(ui);new Function(layout);new Function(audit);new Function(draft);new Function(mobile);new Function(historyLifecycle);new Function(auditor);new Function(mobileFlow);new Function(sw);
console.log('NEXA v18.8.1 native auditor + single mobile document flow: PASS');
