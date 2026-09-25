import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const loader=read('nexa-hotfix.js');
const guard=read('nexa-audit-functional-guard-v18.9.16.js');
const compat=read('nexa-audit-supabase-compat-v18.9.16.js');
const uiIntegrity=read('nexa-audit-ui-integrity-v18.9.16.js');
const exact=read('nexa-auditor-exact-v18.9.js');
const panel=read('nexa-auditor-panel-queue-v18.9.2.js');

assert.ok(loader.includes('nexa-audit-functional-guard-v18.9.16.js'));
assert.ok(loader.includes('nexa-audit-supabase-compat-v18.9.16.js'));
assert.ok(loader.includes('nexa-audit-ui-integrity-v18.9.16.js'));
assert.ok(loader.includes('20260911-v18916'));
assert.ok(loader.lastIndexOf('nexa-audit-functional-guard-v18.9.16.js')>loader.lastIndexOf('nexa-destination-flow-v18.9.15.js'));
assert.ok(loader.lastIndexOf('nexa-audit-functional-guard-v18.9.16.js')>loader.lastIndexOf('nexa-auditor-exact-v18.9.js'));
assert.ok(loader.lastIndexOf('nexa-audit-functional-guard-v18.9.16.js')>loader.lastIndexOf('nexa-auditor-panel-queue-v18.9.2.js'));
assert.ok(loader.lastIndexOf('nexa-audit-supabase-compat-v18.9.16.js')>loader.lastIndexOf('nexa-audit-functional-guard-v18.9.16.js'));
assert.ok(loader.lastIndexOf('nexa-audit-ui-integrity-v18.9.16.js')>loader.lastIndexOf('nexa-audit-supabase-compat-v18.9.16.js'));

for(const token of ['get_my_capabilities','get_audit_queue','submit_audit_review','/functions/v1/submit-audit-case','audit_submission_snapshot','immutable_submission','sanitizeAuditCase','destinationFromHistory','reviewShellMarkup','repairReviewShell'])assert.ok(guard.includes(token),`guard de Auditoria sem ${token}`);
assert.ok(guard.includes("is_admin:false,is_reviewer:false"),'permissão inicial deve ser fail-closed');
assert.ok(guard.includes("out.core_context.destination"),'Destino precisa integrar o payload da Auditoria');
assert.ok(guard.includes("auditSubmitInflight"),'envio concorrente precisa ser deduplicado');
assert.ok(guard.includes("epoch!==queueEpoch"),'fila precisa proteger resposta stale');
assert.ok(guard.includes("reviewInflight"),'revisão concorrente precisa ser deduplicada');
assert.ok(guard.includes("[CPF REMOVIDO]")&&guard.includes("[E-MAIL REMOVIDO]")&&guard.includes("[TELEFONE REMOVIDO]"),'defesa de desidentificação ausente');
for(const token of ['createClient','persistSession:false','autoRefreshToken:false','bridgeFetch','client.rpc','window.sb=client'])assert.ok(compat.includes(token),`compatibilidade Supabase sem ${token}`);
for(const token of ['Em revisão','Principais campos com correções','/^\\+\\d/'])assert.ok(uiIntegrity.includes(token),`integridade visual sem ${token}`);
assert.ok(exact.includes("submit_audit_review"),'workspace deve continuar usando o backend de revisão existente');
assert.ok(panel.includes("get_audit_queue"),'painel deve continuar usando a fila existente');

new Function(guard);new Function(compat);new Function(uiIntegrity);
console.log('NEXA audit loader/contract v18.9.16: PASS');
