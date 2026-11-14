# NEXA Gate C — matriz de autoridade e aderência ao schema (LAB, NÃO APLICADO)

Estado: contrato documental **somente offline**. Nenhuma chamada à função hospedada, SQL, GRANT, RLS/ACL, merge, deploy ou autorização de audit case. Gate C **NO-GO**, C01–C10 **NOT_RUN**. Atualizado em 13/11/2026.

## Evidência do repositório versus exigência candidata

| Domínio | Evidência versionada | Conclusão segura |
| --- | --- | --- |
| Autoria | `public.consultation_history.user_id`; policies `consultations_*_own` usam `auth.uid() = user_id`; migration `20260925172000_encounter_autosave_v18101.sql` | Prova o **modelo esperado de autoria individual**, não que cada fonte esteja atualmente atestada ou que service-role aplique RLS |
| Acesso clínico | `public.profiles` e `private.clinical_slots` (1–5); `has_active_clinical_access()` junta perfil ativo e slot, migration `20260925170000_access_slots_prereq_v18101.sql` | Autoridade precisa rechecagem no banco, não apenas campo `clinicalAccessVerified` de mock |
| Tenant institucional | README `labs/nexa-audit-attestation/README.P0_SOURCE_AUTHORITY.md` declara expressamente **owner-only** e que tenant institucional **não é requisito atual do produto** | Não inventar `tenant_id`/membership, nem exigir no pré-voo como se schema contivesse prova; implantação multiusuário institucional futura requer decisão de escopo e novos gates |
| Consulta/estado | `encounter_id uuid` e `encounter_state` (draft/ready_for_audit/audited/discarded) na migration de autosave | `ready_for_audit` não representa ACK médico assinado nem libera IA |
| Versão da fonte | `consultation_history.sync_version bigint`, incrementada por trigger em UPDATE | Usar `expectedSyncVersion` **numérico** como roteamento/check; não afirmar ACK server somente pelo número |
| Identidade de snapshot de auditoria | `audit_cases.snapshot_version TEXT`, contrato de candidato `final-v1`; `audit_cases.source_sync_version bigint` | Não confundir `snapshot_version` texto com `sync_version` bigint; `final-v1` é rótulo de política do backend, não campo da consulta |
| Digest | `pg-jsonb-v1` aparece nos SQL LAB `gate-c-checkpoint-atomic.P0-CANDIDATE-NOT-APPLIED.sql`; `nexa-json-v1` é um digest Node distinto | Não declarar equivalência criptográfica nem digest imutável já implantado |
| Consentimento | `consent_recorded_at` nullable na fonte histórica; checkbox/timestamp são feitos no cliente; proposta `gate-c-evidence-materializer.P0-NOT-APPLIED.sql` | Não comprova finalidade `external_ai` e `audit`, registro anterior à chamada ou evento confiável |
| Revisão final | `submit_audit_review` é decisão **posterior de revisor do audit case** (migration `20260925174500_audit_auto_queue_v18101.sql`) | Não confundir com ACK **anterior à IA** do médico autor do prontuário |
| Evento durável | `nexa_gate_c_verified_source_events_lab` e seus materializadores existem apenas em arquivo LAB **NOT APPLIED** e não criam eventos de origem | Sem writer autenticado e origem assinada, evidência = ausente, STOP |
| Submissão | `submit-audit-case/index.ts` contém `source?.fields ?? body?.fields` e operações privilegiadas via service role | Função atual não pode ser considerada corrigida por guard de UI em Draft |

## Correção de coerência na PR #167

O preflight offline passou a usar `request = {encounterId, expectedSyncVersion}`, verificado contra `row.syncVersion`; `row.snapshotVersion` exige texto `final-v1` derivado da política do **adaptador candidato** (não uma coluna existente na consulta). Exige owner, acesso ativo, slot e evidência candidata por fonte; rejeita afirmações de tenant não previstas no escopo owner-only.

**Este alinhamento não torna nenhum adapter confiável**. `row.serverDigest`, `row.serverSyncAck`, `row.snapshotVersion`, `row.effectivePolicyVersion`, os eventos e seus booleanos continuam campos **sintéticos** até haver um writer transacional e proveniência real. Mesmo com cenário positivo, retorna `PREFLIGHT_CANDIDATE_ONLY`, `auditSubmitAuthorized=false`, `externalAiAuthorized=false`, `adminWriteAuthorized=false`, `gateCVerified=false`, `resetAuthorized=false`.

## Sequência transacional futura — proposta, NÃO executada

1. **Antes de qualquer chamada de IA**: autenticar ator no servidor; consultar origem por `encounter_id`, `user_id`, perfil ativo e slot; exigir sync ACK da versão completa, digest canônico calculado no servidor e evento durável específico de consentimento para IA externa/auditoria **anterior ao processamento** e ACK de revisão médica final vinculado à mesma versão/digest. Falha fechada se qualquer fonte não existir.
2. Gerar recibo não-forjável e vincular chamada externa somente a esse snapshot, preservando comprovação de consentimento. **Nenhuma transação aberta durante IA**; sem retry pago automático depois de erro.
3. Após IA, em transação curta, **revalidar ator, versão, owner, acesso/slot, recibo, consentimento/revogação, ACK final, ausência de edições e digest**. Manter ordem de locks compatível com `submit_audit_review`: audit case existente **antes** de `consultation_history`; proteger ausência de case com advisory lock por `encounter_id + snapshot_version` mais constraint `UNIQUE`, conforme SQL candidato.
4. Caso terminal: STOP sem alteração. Caso pending idêntico: idempotência somente depois da igualdade de `owner, source_row_id, sync_version, snapshot_version, digest` e event IDs, sem criar prova de reset. Caso divergente: STOP/rollback. Novo case: inserir somente dados desidentificados validados, preservando binding imutável.
5. **Nenhum passo acima está autorizado ou implantado**. Adaptador de Node e candidate SQL não equivalem à função hospedada, ACL ou catálogo atual.

## Critérios de teste futuro, não execução

- Fonte inexistente, `user_id NULL`, owner incorreto, slot esgotado/revogado, `auth.uid()` não resolvido sob service role: **STOP**.
- Versão divergente, digest de campos dinâmicos alterado, timestamp de consentimento sem evento, consentimento revogado, ACK antes de sync, edição após revisão e atualização concorrente entre IA e commit: **STOP** sem audit case.
- Duas sessões simultâneas para mesma chave: no máximo um case pending, idempotência comprovada; identidade/escopo diferente não recebe o mesmo recibo.
- Review de pending em paralelo: ordem de locks sem deadlock; terminal nunca modificado; nenhuma chamada paga repetida por conflito.
- RLS/ACL, source ownership, grants, search_path, integração end-to-end e reset locked: gates separados ainda **NOT_RUN/NO-GO**.
- O LAB PostgreSQL do Codex permanece bloqueado: checagem sanitizada de limpeza **não executada**, base possivelmente suja, autorização específica de reconexão ainda ausente.

**Repositório independente:** `plantonistae-create/prescricao` não recebe alterações deste trabalho. Transcrição no NEXA continua final-only.
