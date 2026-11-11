# NEXA P0 — Gate C: preparação de laboratório PostgreSQL (histórico)

> **Atualização Gate C — 2026-11-10 (prevalece sobre as premissas datadas abaixo):**
> O produto usa **autoria individual do médico com acesso clínico ativo**, sem tenant institucional neste momento. A exportação schema-only **privada** foi concluída e revisada (não pedir/publicar dump bruto). O operador reportou PASS em testes PostgreSQL locais **parciais** de RLS/autoria, grants, versão, campo dinâmico, unicidade, rollback e revisão sequencial; esses resultados não equivalem a C01–C10 ponta a ponta, que seguem **PENDENTES**. O consentimento atual cobre IA externa e auditoria segundo confirmação do proprietário, mas falta **checkpoint servidor vinculante de finalidade + conteúdo + sync_version + autoria**, e sua **rechecagem atômica pós-IA**. As afirmações históricas de "tenant obrigatório", "Postgres local indisponível" e "DDL inicial pendente de exportação" **não representam o estado atual**; a cronologia de investigação anterior é mantida abaixo para rastreabilidade. A PR #165 atualiza o laboratório sem permitir escrita privilegiada/reset, SQL hospedado ou deploy.


**Issue:** #164. **PR de referência:** #165 Draft (antes deste documento: `229589465e5f79ed79226dd886b215453e8354b5`). **PR #166:** complementar, não mesclar. **main:** `064757d2a39ad4c04c60b0034a8b35756b8eb089`; **G55 local reportado:** árvore `01b41e78`.  
**Estado:** `BLOCKED_NO_POSTGRES_LOCAL`. No ambiente executor desta análise há Node 22, mas não há `postgres`, `initdb`, `pg_ctl`, `psql`, Docker ou Podman. Nenhum SQL, transação, teste PostgreSQL, rede, staging ou função hospedada foi executado. Não confundir com as CIs sintéticas 18/18 da #165 e 21/21 da #166, que **não foram repetidas**.

## Gate C.2 — descoberta estrutural *real* via conector de metadados Supabase (2026-11-09)

**Natureza da evidência:** funções read-only de *schema introspection* (`list_tables`, `list_migrations`, `generate_typescript_types`) sobre o projeto NEXA `fmkrcieubrlltiggyauc`. **Não** se usou `execute_sql`, editor SQL, DML, SQL hospedado, acesso a linhas clínico-pessoais, logs, chaves, funções hospedadas, CI, staging, nem testes transacionais. Foi inspecionado **somente** o subconjunto estrutural relacionado ao Gate C. Não publicar saídas brutas do catálogo nem contagens de registros.

**Dados estruturais comprovados no momento da consulta — não equivalem a DDL exportável completo:**

| Objeto | Campos/tipos e relações observadas | Limite da introspecção |
|---|---|---|
| `public.consultation_history` | PK `id text`; `encounter_id uuid NOT NULL DEFAULT gen_random_uuid()`; `user_id uuid NULL` com FK para `auth.users.id`; `professional_id text NULL` com FK para `public.professionals.id`; `fields jsonb NOT NULL`; `processing_meta jsonb NOT NULL DEFAULT '{}'`; `protocol_usage jsonb NOT NULL DEFAULT '[]'`; `consent_recorded_at timestamptz NULL`; `sync_version bigint NOT NULL DEFAULT 0`; `encounter_state`, `audit_ready_at`, `last_client_saved_at` presentes; RLS ligada | Relação `professional_id` é **legada**, não comprova membership ou autorização; `user_id` é *nullable* para casos legados; o endpoint não forneceu todas as policies, índices únicos, triggers e semântica de consentimento |
| `public.profiles` | PK `id uuid`, FK para `auth.users.id`; `access_status`, `clinical_access`, `is_admin`, `is_reviewer`, `access_assigned_at/by`; RLS ligada | Nenhum campo de tenant institucional listado; não comprova ACL/funções efetivas |
| `private.clinical_slots` | PK `slot_no smallint`; `profile_id uuid` e `assigned_by uuid` com FK para `public.profiles.id`; tabela existente no schema privado | Não confundir com tabela **distinta** `public.clinical_slots` (legada) também encontrada; a definição da guarda publicada no Git refere `private.clinical_slots`. Metadados não provam quais `GRANT/EXECUTE` estão ativos |
| `public.audit_cases` | PK `id uuid`; `source_consultation_id uuid NOT NULL`; `submitted_by uuid NOT NULL` FK `auth.users.id`; `reviewer_id uuid NULL` FK `auth.users.id`; `snapshot_version text DEFAULT 'final-v1'`; `source_sync_version bigint`; `deidentified_fields jsonb`, `deidentified_core_context jsonb`; estados `pending/approved/corrected/discarded`; RLS ligada | Metadados **não listam FK entre `source_consultation_id` e `consultation_history.encounter_id`**; não demonstram triggers, `UNIQUE(source_consultation_id,snapshot_version)` aplicados, ACL ou políticas. A constraint UNIQUE consta das migrations Git, mas não pode ser dada como validada apenas por este endpoint |
| `get_my_capabilities()` | Introspecção de tipos registra RPC **sem argumentos** que retorna `id`, `display_name`, `access_status`, `clinical_access`, `is_admin`, `is_reviewer` | **Não retorna tenant, organization nem `auditSubmit`**. Assinatura não revela corpo/owner/`SECURITY DEFINER`/ACL/guardas; não assumir que a autorização institucional foi resolvida |

`list_migrations` apresentou **13 entradas registradas**, começando por `access_slots_prereq_v18101` (2026-09-25), sem uma entrada com nome de schema original de `profiles`, `consultation_history` e `audit_cases`. O fato de a migração do Git de 2026-09-13 não aparecer nesse registro **não comprova que a lógica correspondente esteja ausente**; deploys legados podem ter sido aplicados fora do histórico. Nenhum dado clínico foi consultado.

**Comparação necessária com o contrato sintético #165:** `source-authority.P0-LAB-ONLY.mjs` exige `actor.tenantId`, `source.tenant_id`, `capabilities.tenantId` e `capabilities.auditSubmit`, que **não constam desse esquema/RPC**. Não fabricar essas propriedades, não transportar `professional_id` para `tenant_id`, e não rebaixar o gate silenciosamente. É decisão de arquitetura ainda pendente se o NEXA autoriza submissão apenas pelo usuário proprietário, ou se realmente requer vínculo institucional externo. Até a prova de acesso/escopo, o contrato segue `PROVISIONAL_SOURCE_MATCH` ou `STOP`, sempre com `privilegedWriteAuthorized:false`, `resetAuthorized:false`.

**Delta mínimo potencial, ainda NÃO aplicado:** o trecho de código `if (!source) STOP` + `source.user_id === user.id` + `fields=source.fields` é compatível *em princípio* com as colunas efetivas. Contudo, uma substituição da função real não está liberada: falta confirmar policies/ACL/trigger/RPC atuais e contrato de versão/consentimento/digest completo, a semântica de `body.core_context` e a rechecagem transacional pós-IA. `user_id NULL` exige STOP explícito, não vincular por `professional_id`. Sem prova adicional, **não montar patch funcional nem executar C01–C10**.

**Material para a futura exportação privada `schema-only`:** schema DDL de `public.profiles`, `public.consultation_history`, `public.audit_cases`, `private.clinical_slots` e relações necessárias; `CREATE INDEX`, constraints/FKs e triggers; definições/owner/`EXECUTE` da `get_my_capabilities`, `has_active_clinical_access`, `submit_audit_review`; políticas RLS/GRANT; regra de consentimento e vínculo institucional se existir. **Não requer nem autoriza dados de linhas.** A obtenção de definições completas que não são oferecidas pelas ferramentas seguras depende de autorização separada; **nenhum SQL hospedado foi executado neste lote**.

---

## 1. Reconstrução verificável a partir do Git — sem fingir schema completo

| Objeto | Confirmado nos arquivos versionados | NÃO demonstrado |
|---|---|---|
| `public.consultation_history` | migração `20260925172000_encounter_autosave_v18101.sql`: `encounter_id uuid` obrigatório com índice único; `encounter_state` (draft/ready_for_audit/audited/discarded); `audit_priority` 0–2; `sync_version bigint` inicial 0; trigger BEFORE UPDATE incrementa versão; índice por `user_id,encounter_state,updated_at`; políticas RLS explícitas own para SELECT, INSERT, UPDATE, DELETE + `has_active_clinical_access()` | DDL inicial de `id,user_id,fields,processing_meta,protocol_usage,consent_recorded_at` e tipo/constraints efetivos; políticas antigas adicionais; estado de RLS do banco hospedado; completude de campos dinâmicos |
| `public.profiles` / `private.clinical_slots` | migração `20260925170000_access_slots_prereq_v18101.sql`: capacidade clínica por `profiles.id=auth.uid()`, perfil ativo, vínculo único em slot privado 1–5; `get_my_account_context`; funções de gestão protegidas | DDL original de profiles, associação institucional real; contrato da RPC `get_my_capabilities` e `auditSubmit` hipotético exigido pelo laboratório #165 |
| `public.audit_cases` | migrações `20260913034000_audit_pipeline_core_dataset_v18919.sql`, `20260925174000_audit_snapshot_prereq_v18101.sql`, `20260925174500_audit_auto_queue_v18101.sql`: chave única `source_consultation_id,snapshot_version`, versão padrão `final-v1`, `source_sync_version`, prioridade, índices de fila; revisão bloqueia linha via `FOR UPDATE` e permite apenas `pending` | DDL original, FK consulta-fonte, constraints/status efetivos, grants/policies, integridade entre versão revisada e conteúdo enviado; estado hospedado |
| Tenant institucional | 14 migrações e 10 `index.ts` de Edge Functions do Git examinados sem contrato de tenancy/membership demonstrado | Se o banco legado dispõe de vínculo autoritativo fora desse conjunto. **Nunca inventar `tenant_id`.** |

**Cuidado:** o laboratório sintético da #165 usa `actor.tenantId`, `source.tenant_id` e `capabilities.auditSubmit` *hipotéticos*. Eles não são evidência dessas colunas/capacidades no banco. O desenho atualmente rastreável é **autoria individual** por `user_id`, NÃO prova de multi-tenant institucional. É proibido usar user_metadata/JWT ou HTTP body como prova de tenant.

## 2. Falha funcional localizada e contrato de correção

Na função `supabase/functions/submit-audit-case/index.ts` (Git blob `7ae2e5f62e6015847db48f39afb8df91f8667725`):
- `maybeSingle()` pode retornar `source=null` e o código não interrompe; `const fields=source?.fields??body?.fields` aceita fallback do corpo antes de usar `SERVICE_KEY`.
- `sourceCoreContext(body,source)` também começa de `body.core_context` e mistura hipóteses, plano, radar, camadas e snapshot sem atestação server-side; remover apenas `body.fields` é **necessário, mas insuficiente**.
- O `SELECT` inclui `user_id`, mas não o valida explicitamente contra `user.id`; lê `sync_version` mas não exige versão positiva/esperada. `normalizeSnapshotVersion` escolhe `final-v1` para ausência/entrada inválida; isso é rótulo lógico, não digest da revisão.
- Há chamada de desidentificação externa **entre** leitura do prontuário e escrita administrativa: janela TOCTOU. A atualização condiciona `status='pending'`, porém não revalida fonte, digest ou versão no mesmo commit.

**Menor delta de defesa independente (NÃO aplicado):** imediatamente após `maybeSingle()`, `if(!source) STOP`, `if(source.user_id!==user.id) STOP`, `if(source.encounter_id!==sourceId) STOP`, `fields=source.fields`, `ready_for_audit`, versão inteira positiva; recusar `body.fields` como substituto e qualquer conteúdo clínico de `body.core_context` não reconciliado. Isso só elimina o bypass de origem, **não autoriza escrita, merge nem deploy**, e exige estudo de clientes antes de implementar. Se não houver tenant autoritativo, preservar `STOP` de autorização institucional, sem acrescentar coluna falsa.

## 3. Pré-condições obrigatórias para o único teste PostgreSQL (futuro)

1. Instância Postgres **fisicamente isolada**, descartável e com saída externa negada; conexões apenas localhost. Nenhuma variável apontando para Supabase/produção, nenhum dump/dado real e nenhum segredo real. Uma mera simulação em JS, ou teste que apenas faz timeout, não prova isolamento Postgres.
2. Obter *DDL inicial confiável* das tabelas `profiles`, `consultation_history`, `audit_cases` e das funções/RLS/ACL pré-migração, além de versão Postgres/extensões, índice de identidade lógica, migrations aplicadas e fontes de consentimento. Se indisponível, **STOP antes de criar schema substituto**: um banco inventado não prova compatibilidade real.
3. Montar migrations históricas sobre o DDL inicial em cópia fictícia. Identificar função `get_my_capabilities`, proveniência de `consent_recorded_at` e semântica (áudio ≠ auditoria/treinamento), adendos e integridade de `processing_meta`, `protocol_usage`, `fields`.
4. Criar apenas UUIDs, médicos, consultas, campos de exame, revisão e permissões **fictícios**. Nunca substituir o contrato de tenant por `tenant-fake-1` como se existisse em produção.

## 4. Matriz de testes de banco — `NOT_RUN`, não resultados

| Caso | Concorrência/condição | Aceite |
|---|---|---|
| C01 | `source=null` + `body.fields` aparentemente válido | 4xx `SOURCE_NOT_ACCESSIBLE`, **zero chamadas pagas/insert/update** |
| C02 | fonte de outro médico, acesso clínico suspenso, sem slot | STOP, RLS/capacidades comprovadas por sessão fictícia; zero escrita |
| C03 | tenant ausente ou vínculo institucional não demonstrado | STOP; sem campo/claim/metadata inventados |
| C04 | fonte `draft`, `audited`, versão 0/fracionária/stale | STOP; nenhum fallback clínico |
| C05 | checkpoint local sem ACK de servidor, digest diferente, consentimento sem prova/finalidade, conflito ou áudio pendente | STOP, rascunho recuperável |
| C06 | campos dinâmicos, `exames_sugeridos`, `prescricao`, Radar, plano, CID, `processing_meta`, `protocol_usage`, adendo posterior | sem perda silenciosa nem substituição de contexto clínico pelo cliente; desconhecidos bloqueiam, não truncar e declarar igualdade |
| C07 | 2 envios concorrentes para `(encounter_id, final-v1)` | 1 resultado idempotente autoritativo, sem lost update/duplicação/reescrita stale |
| C08 | revisor altera `pending -> approved/corrected/discarded` durante desidentificação e envio | revisão terminal nunca regravada; snapshot revisado só reconhecido após verificação de versão/digest |
| C09 | erro/transação revertida, sessão expirada e retry | rollback integral; checkpoint/rascunho mantidos; erros permanentes não geram loop infinito de API |
| C10 | `ALREADY_SUBMITTED` e `ALREADY_REVIEWED` de conteúdo/versão desiguais | nunca tratar código 409 como prova de igualdade; não fazer reset automático |

Executar com **duas conexões Postgres distintas e um revisor concorrente**, não apenas sequência em Node. Registrar DDL/índices/ACL efetivos, transações, ordem de locks, queries/saídas sanitizadas, número de linhas antes/depois e resultado de rollback. Se um teste exigir alteração de guard #162 ou dado real, parar.

## 5. Esboço da operação atômica (NÃO é SQL autorizado)

- Etapa A, antes de IA: autenticação real, `userClient` submetido à RLS, leitura de fonte existente e autoria; conferência do ACK de sync, versão, conteúdo clínico integral, consentimento adequado e checkpoint **persistido pelo servidor**. Criar entrada de desidentificação de snapshot estável sem aceitar campos do body como autoridade.
- Etapa B, **após** desidentificação e antes de qualquer write: uma única transação no banco, com identidade do ator revalidada, verifica digest e `sync_version` atuais da fonte, status, autoria/capacidade/vínculo institucional verdadeiro, checkpoint/consentimento, identidade da versão e estado terminal da auditoria; só permite INSERT/UPDATE se tudo coincidir.
- **Ordem de bloqueios:** a RPC `submit_audit_review` da migração `20260925174500` bloqueia `audit_cases` (`FOR UPDATE`) **antes** de atualizar `consultation_history`. Uma submissão que bloqueasse a consulta antes do audit case poderia criar deadlock com o revisor. Projetar ordem coerente, tratamento explícito de deadlock/serialization failure com retry limitado e chave única observada; testar realmente C07/C08 em Postgres antes de aceitar uma RPC.
- Uma RPC administrativa só pode ser desenhada após verificar assinatura, `EXECUTE` grants, ownership, `search_path`, RLS e identidade da sessão. `SECURITY DEFINER` exposta a `authenticated` poderia permitir contornar desidentificação; **não publicar RPC** até comprovar como atestar a saída desidentificada e o ator.
- **Nunca conceder** `privilegedWriteAuthorized:true` ou `resetAuthorized:true` com base no contrato #165. `locked` é terminal (issue #162).

## 6. Compatibilidade e decisão

- [`nexa-encounter-autosave-v18.10.1.js`](../nexa-encounter-autosave-v18.10.1.js) já faz CAS local e remoto por `id,user_id,sync_version`; `local_revision` não substitui `sync_version` de servidor. `remotePayload` envia consentimento/planos mas o ACK atual não comprova versão revisada na auditoria.
- [`nexa-audit-outbox-v18.9.19.js`](../nexa-audit-outbox-v18.9.19.js) envia `snapshot_version='final-v1'`, payload de contexto local e 12 campos estáticos enquanto o autosave admite 14+ dinâmicos. No erro `ALREADY_SUBMITTED`, marca `sent`; no `ALREADY_REVIEWED`, marca `locked` **sem prova de igualdade da versão**. Erros 4xx novos entram na fila com backoff, sem classificação permanente. Resolver UX sem perda do rascunho e sem alterar o guard sem autorização.
- O código `source-authority.P0-LAB-ONLY.mjs` da #165 pressupõe campos de tenant não comprovados e catálogo fixo de 14. Não reescrever para fazer passar; preservar saída **provisional** e registrar a lacuna.
- **Sem PostgreSQL isolado nem DDL inicial:** **BLOCKED** para execução, teste transacional e patch funcional. Esta entrega é só procedimento documental; **sem CI nova** (alteração exclusiva em `docs/`, fora do gatilho `labs/nexa-audit-attestation/**` do workflow offline). CIs anteriores inalteradas. Preservados main, #158–#161, #163, #166, guard, G55, Supabase hospedado, WebKit, reset `locked` e produção.

**Próximo passo mínimo:** disponibilizar *uma* instância Postgres local realmente isolada com DDL inicial legítimo/sintético estruturalmente fiel, sem creds de produção, e então executar C01–C10 em um lote; retornar resultados + SHA de artefatos. Até lá: **NO-GO**.
