import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const html=read('index.html');
const flow=read('nexa-continuous-soap-v18.11.js');
const migration=read('supabase/migrations/20261003033000_conduct_library_defaults_order.sql');

for(const token of [
  "sb.rpc('ensure_default_conduct_templates')",
  "sb.rpc('reorder_conduct_templates',{p_ids:ids})",
  ".select('id,content,sort_order,created_at,updated_at')",
  ".order('sort_order',{ascending:true})",
  "sort_order:nextOrder",
  "moveConductTemplate(c.id,-1)",
  "moveConductTemplate(c.id,1)",
  "main.onclick=add",
  "edit.textContent='editar'",
  "del.textContent='remover'",
  "conduct-picker-body open",
  "a ordem fica salva na sua conta"
]) assert.ok(html.includes(token),`conduct library missing ${token}`);

for(const token of [
  'conduct_defaults_seeded_at',
  'sort_order integer not null default 0',
  'ensure_default_conduct_templates',
  'reorder_conduct_templates',
  "p.is_admin is true",
  "p.is_reviewer is true",
  "p.clinical_access is true",
  "p.access_status='active'",
  'CONDUCT_ORDER_MUST_INCLUDE_ALL',
  'grant execute on function public.ensure_default_conduct_templates() to authenticated',
  'grant execute on function public.reorder_conduct_templates(uuid[]) to authenticated'
]) assert.ok(migration.includes(token),`conduct migration missing ${token}`);

assert.ok(!flow.includes('nexaExamQuickComposer'),'physical exam quick composer must be absent');
assert.ok(!flow.includes('Compositor rápido · clique para adicionar ou remover'),'physical exam quick chips must be absent');
assert.ok(html.includes('Modelos por perfil · selecione o perfil e clique nos sistemas'),'profile model physical exam must remain canonical');

console.log('NEXA v18.15 conduct defaults/order + physical exam simplification contract: PASS');
