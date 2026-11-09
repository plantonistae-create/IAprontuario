# NEXA P0 — Fonte/autoria/tenant antes de auditoria privilegiada

**Status: PROVA OFFLINE; NÃO PRONTO PARA MERGE/DEPLOY.** Referência central: issue #164; reset `locked` bloqueado na #162. Este laboratório **não importa** a função `submit-audit-case` real, não cria banco, não executa SQL, não acessa dados de pacientes ou Supabase e não concede permissões.

## Evidência verificada (baseline `main 064757d2`)

O arquivo `supabase/functions/submit-audit-case/index.ts` — idêntico ao código da Edge Function hospedada v9 na inspeção anterior — possui:
1. `userClient.auth.getUser()` e `get_my_capabilities()`: autenticação/autorização clínica existentes.
2. Busca da consulta `consultation_history` com `userClient` e `.eq('encounter_id',sourceId).maybeSingle()`, portanto **RLS é uma defesa relevante**.
3. Falta de um `STOP` explícito quando `source` é nulo: `if(source&&source.encounter_state!=='ready_for_audit')...`.
4. Fallback `const fields=source?.fields??body?.fields;`, que permite continuar a preparação de um payload baseado no cliente sem confirmação explícita da origem.
5. Após isso, uso de `SERVICE_KEY` para consulta/inserção/atualização de `audit_cases`. Constrangimentos, RLS e FKs reais **não foram testados**. Não afirmamos gravação indevida demonstrada.
6. `ALREADY_REVIEWED` retorna `case_id/status`, não atestado de igualdade com a versão clínica revisada.

A migração versionada `20260925172000_encounter_autosave_v18101.sql` define `consultations_select_own` com `auth.uid()=user_id` e `has_active_clinical_access()`. **O código versionado não comprova que todas as políticas e constraints continuam idênticas no banco hospedado**. O `SELECT` atual não inclui `tenant_id`; um vínculo institucional não pode ser inventado a partir de `user_metadata` ou do corpo HTTP.

## Contrato de prova sintética

`source-contract.P0-LAB-ONLY.mjs` exige:
- Auth e capacidade clínica ativas; identificadores e consulta-fonte válidos.
- Consulta acessível, identidade da consulta e `source.user_id=actor.userId`, estado `ready_for_audit`.
- `sync_version` inteiro positivo, versão esperada conferida, data de atualização comprovável e campos clínicos de um catálogo fictício de 14 nomes sem extras omitidos.
- Identidade do tenant **derivada por código de confiança no servidor**, validando médico, instituição e origem; nunca inferida do cliente. A fonte atual NÃO fornece esse comprovante.
- Verificação adicional da versão/conteúdo, estado da auditoria e tenant **na mesma transação que condicionaria a gravação privilegiada**. O contrato simula essa observação, mas não a implementa.
- Mesmo com todos os argumentos sintéticos coincidentes, retorna `PROVISIONAL_SOURCE_CHECKED`, `privilegedWriteAuthorized:false` e `resetAuthorized:false`.

Os testes são específicos do defeito: origem ausente, proprietário incorreto, identidade de consulta, tenant não comprovado, versão stale, payload clínico dinâmico desconhecido, alteração entre pré-verificação e gravação, auditoria já encerrada e fallback `body.fields`.

## Delta mínimo CANDIDATO — **não aplicado à função**

O bloqueio mais localizado é remover a possibilidade de seguir sem fonte e sem dono verificados, antes de chegar ao cliente administrativo:

```diff
@@ após .maybeSingle() @@
   if(sourceError)return json({error:'SOURCE_LOOKUP_FAILED'},500);
+  if(!source)return json({error:'SOURCE_NOT_ACCESSIBLE'},404);
+  if(source.user_id!==user.id)return json({error:'SOURCE_OWNER_MISMATCH'},403);

-  if(source&&source.encounter_state!=='ready_for_audit'){
+  if(source.encounter_state!=='ready_for_audit'){
     return json({error:'SOURCE_NOT_READY'},409);
   }

-  const fields=source?.fields??body?.fields;
+  const fields=source.fields;
```

**Atenção:** esse delta fecha apenas o caminho da origem nula e reforça a titularidade. **Não basta para liberar produção.** Antes de uma PR de função real, faltam: fonte autoritativa de tenant/membership, propagação segura da versão esperada pelo cliente, transação/CAS persistente no instante da gravação, consentimento e conformidade do conteúdo dinâmico; confirmar efeitos sobre clientes existentes, constraints e RLS em banco isolado. Não executar substituição textual no servidor hospedado sem autorização separada.

## Critérios finais

| Contrato | Decisão |
|---|---|
| Modelo puro: sem fonte, dono, versão, tenant ou CAS verificáveis | STOP |
| Campo clínico desconhecido na fixture | STOP |
| Fonte válida e versão coincidente em fixture | PROVISIONAL, sem autorização de escrita |
| Garantia de autorização/tenant em banco real | BLOCKED |
| Preflight seguido de deidentificação e gravação transacional | BLOCKED |
| Reset pós-`locked` | STOP |
| Merge, deploy, SQL hospedado e chamadas pagas | NO-GO |

**Rollback:** não há deploy nem alteração clínica; descarte esta branch/PR Draft. O laboratório só usa bibliotecas internas do Node e arquivos versionados.

**CI isolada:** `node --check` e `node --test` em `p0-origin`, sem staging ou dependências externas.
