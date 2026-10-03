import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const html=read('index.html');
const auditor=read('nexa-auditor-exact-v18.9.js');
const adminUsers=read('supabase/functions/admin-users/index.ts');
const processConsultation=read('supabase/functions/process-consultation/index.ts');

for(const token of [
  'id="saveStyleFromCurrentBtn"',
  'Salvar no meu estilo',
  'explicit-save-required',
  "source_type:'manual'",
  "style_quality:'approved'",
  'Só entram no seu estilo os exemplos que você salvar explicitamente'
]) assert.ok(html.includes(token),`estilo explícito sem ${token}`);

assert.ok(!html.includes('Revisão salva. A versão final também foi adicionada/atualizada nos exemplos de escrita.'),
  'Salvar revisão não pode alimentar estilo automaticamente');

for(const token of [
  'axBackMedicalTop192',
  '← Modo médico',
  "#axBackMedical192,#axBackMedicalTop192"
]) assert.ok(auditor.includes(token),`retorno da Auditoria sem ${token}`);

for(const token of [
  'action==="invite"',
  'inviteUserByEmail',
  'SUPABASE_SECRET_KEYS',
  'SUPABASE_SERVICE_ROLE_KEY',
  'admin_set_profile_access',
  'deleteUser(invited.id)',
  'CLINICAL_SLOT_LIMIT_REACHED'
]) assert.ok(adminUsers.includes(token),`cadastro médico sem ${token}`);

for(const token of [
  'loadDefaultStyleExamples',
  'SUPABASE_SECRET_KEYS',
  'SUPABASE_SERVICE_ROLE_KEY',
  'default_admin_style',
  'physician_saved',
  'style_source',
  'style_example_count'
]) assert.ok(processConsultation.includes(token),`fallback de estilo sem ${token}`);

new Function(auditor);
console.log('NEXA v18.14.1 style/admin/auditor contract: PASS');
