# NEXA P0 — fronteira entre ação médica, autosave e evento autenticado (CANDIDATO OFFLINE, NÃO APLICADO)

Data da inspeção: 13/11/2026 · Issue #164 · PR #167 Draft, base privada `feat/nexa-p0-audit-source-authority-offline-20261109`.

**Status:** CONTRATO DOCUMENTAL APENAS. Não é migração, endpoint, política de segurança implantada, autorização de IA externa, escrita de auditoria ou teste de banco. Gate C **NO-GO**; C01–C10 **NOT_RUN**. Não há prova de que qualquer writer de evento confiável esteja hospedado. Não usar dados reais neste laboratório.

## 1. Achado novo: há duas fronteiras de IA/consentimento, não uma

**A. Antes de processar áudio/gerar nota:** `index.html:processAudio` cria `consentRecordedAt=new Date().toISOString()` **no cliente** (aprox. linha 4022), imediatamente antes das invocações de processamento (4041–4048), e salva em `lastProcessedMeta` (4053). Isto é um timestamp de frontend, não evento autenticado, nem comprova as finalidades ou validade do consentimento do paciente/médico. **Não é permitido retrovalidar processamento já ocorrido** com um evento criado só depois da chamada externa. Qualquer requisito de consentimento pré-IA para esse fluxo exige gate autoritativo antes da invocação correspondente, sob avaliação de produto/privacidade separada.

**B. Antes de enviar auditoria à IA:** `index.html:submitCurrentForAudit` exige um `confirm()` visual (2862), cria `provenance.reviewed_documentation:true` (2884) e POSTa `fields`/`core_context` do navegador (2886). O `nexa-audit-autosave-v18.5.js` também atribui `reviewed_documentation:true` automaticamente (89) e envia payload cliente (145). Um confirm, timestamp, booleano, `ready_for_audit` ou conteúdo já salvo **não atesta** revisão médica do snapshot exato. O consentimento específico para submissão de auditoria precisa existir **antes** de `submit-audit-case` chamar o provedor de IA, mesmo que um processamento anterior tenha ocorrido.

Essas fronteiras não são intercambiáveis: eventos de finalidade audit e external_ai não autorizam retroativamente o processamento de áudio nem podem ser inferidos do tempo de gravação no navegador.

### 1.1. Caminhos externos anteriores à transcrição final — lacuna adicional comprovada no código

A seção A acima **não pode ser implementada com um gate exclusivo em `processAudio()`**: quando esse método roda, alguns caminhos externos já podem ter sido utilizados durante a gravação. O checkbox `consent` é uma condição de UI; a leitura estática das Edge Functions abaixo não encontrou verificação de **evento servidor durável, por finalidade**, anterior à requisição ao provedor. Isso não demonstra que o usuário/paciente não tenha consentido; demonstra ausência de prova técnica nesse fluxo versionado. Não inferir equivalência jurídica entre consentimento do paciente, declaração do médico e autorização do controlador.

| Fase e gatilho no browser | Edge/function versionada | Primeira saída externa possível | Prova de consentimento servidor presente nesse caminho? |
| --- | --- | --- | --- |
| Início de gravação, `startRec()` (`index.html` 3881–3911), após checkbox | `startRealtimeRadar()` (3768–3783) → `realtime-call` | `realtime-call/index.ts` 166–301 abre `POST /v1/realtime/calls` para OpenAI; mídia WebRTC pode começar **antes** de `processAudio()` | **NÃO COMPROVADA**. A Edge autentica usuário/estado clínico (aprox. 53–164), sem consultar evento durável de finalidade antes do upstream |
| Falha ou timeout do WebRTC, durante gravação | `startRadarChunkFallback` (3806–3825) → `drainRadarChunks` (3785–3803) → `realtime-call` multipart | `realtime-call/index.ts` 349–427 faz `POST /v1/audio/transcriptions` para OpenAI em trechos temporários | **NÃO COMPROVADA**. Não reutilizar consentimento inferido de WebRTC ou data do browser |
| Transcrição temporária atualiza Radar | `handleRealtimeEvent` (3760–3766), `window.NexaRadarController.mount().analyze` (5383–5389) → `realtime-radar` | `realtime-radar/index.ts` 15–80 pode enviar contexto e buffer de transcrição a `/v1/responses` da OpenAI ou a provedor NEXA Core, conforme configuração | **NÃO COMPROVADA**. Autenticação e acesso clínico não são prova de consentimento específico nem do conteúdo aprovado |
| Processamento final após gravação, com diarização opcional | `processAudio()` (4014–4048) → `nexaDiarizeAudio` (3958–3974) → `consultation-speakers` | `consultation-speakers/index.ts` 26–59 envia arquivo a `/v1/audio/transcriptions` da OpenAI | **NÃO COMPROVADA**. Exige `auth.getUser()` e capacidade clínica; não há evento durável de consentimento consultado antes do fetch |
| Estruturação final normal, fallback de diarização ou segmentos retornados | `invoke` (3941–3957) ou `nexaInvokeAutomaticSpeakerSegments` (3976–3991) → `process-consultation` | `process-consultation/index.ts` 1720–1830, 1940–1984 e 1163–1358: OpenAI (áudio, estruturação e assistência), ou Gemini (1402–1430, 1598–1685) conforme provider; segmentos verificados podem evitar segunda transcrição do áudio mas não processamento externo de texto | **NÃO COMPROVADA**. Há `requireUser()` no servidor, porém não um checkpoint de consentimento por finalidade |
| Submissão à auditoria, depois de salvar | `submitCurrentForAudit` (2858–2887) → `submit-audit-case` | `submit-audit-case/index.ts` 49–110 envia `fields/core_context` à OpenAI antes da escrita `audit_cases` com service role | **NÃO COMPROVADA**. `confirm()` e `reviewed_documentation:true` não substituem consentimento durável nem ACK médico final |

**Consequência para o desenho futuro, NÃO IMPLANTADO:** deve haver um gate de finalidade autenticado **antes de iniciar qualquer caminho de áudio/Radar que alcance o provedor** (incluindo primeira tentativa WebRTC e fallback). Separadamente, os pontos de entrada de diarização, processamento final, Radar remoto e auditoria devem verificar a autorização ainda válida no próprio backend antes de cada saída correspondente. A confirmação local do checkbox pode gerar *intenção* de consentimento, mas o servidor deve registrar/validar a ação explícita, sua finalidade, política, titularidade/escopo e eventual revogação. O desenho precisa decidir e documentar a semântica de um consentimento que cubra várias operações; não fabricar múltiplas permissões nem retroautorizar uma chamada prévia a partir de `consentRecordedAt` posterior. Um gate pré-IA do áudio não representa automaticamente ACK final de auditoria.

**Compatibilidade de UX:** os eventos de transporte/transcrição temporária só devem alimentar internamente o Radar. A **transcrição textual visível** continua exclusivamente ao final da consulta, conforme requisito do NEXA. Nenhuma mudança visual é proposta.

**Critérios de teste de integração adicionais — NÃO EXECUTADOS:**
- **A13** checkbox marcado mas sem evento servidor antes de `startRec`: STOP, sem WebRTC ou chunks enviados a provedor.
- **A14** WebRTC falha e fallback tenta reenviar áudio sem validação da mesma finalidade ainda vigente: STOP, sem fallback upstream.
- **A15** transcript transitório chega ao Radar remoto com consentimento ausente, revogado ou de finalidade insuficiente: STOP, sem chamada OpenAI/NEXA Core.
- **A16** diarização opcional com usuário autenticado mas sem consentimento válido para provedor externo: STOP antes do fetch; autenticação isolada não basta.
- **A17** `process-consultation` por FormData ou JSON/segmentos sem gate verificado: STOP antes de OpenAI/Gemini; evitar reprocessamento pago automático.
- **A18** timestamp `consentRecordedAt` só gerado por `processAudio`, depois de transmissão WebRTC/chunk: **não usar** como prova retroativa.
- **A19** mesmo médico autoriza áudio mas não auditoria ou não revisa snapshot exato: no máximo processamento dentro da finalidade concedida; STOP antes da IA de auditoria.
- **A20** troca de conta/sessão entre concessão, conexão de streaming, diarização e processamento final: revalidar no servidor finalidade/owner/sessão antes de cada requisição, sem reciclar recibo de outra sessão.

**STOP:** todos os A13–A20 são requisitos candidatos, não testes passados. Nenhum gate de áudio, WebRTC, Radar, diarização ou auditoria foi ativado, testado em produção, ou validado em PostgreSQL. O produtor `gate-c-event-producer.P0-CANDIDATE.mjs` é apenas intenção de registro de eventos de consentimento e revisão final; não resolve os gates de processamento externo instalados. Gate C permanece NO-GO, C01–C10 NOT_RUN.



## 2. Fontes verificadas: conteúdo persistido pode ter sido editado no cliente

| Campo/estado | Writer encontrado no repositório | Autoridade que NÃO constitui |
|---|---|---|
| `fields` | `nexa-encounter-autosave-v18.10.1.js:collectFields` (97–111), `remotePayload` (217–224), `syncOne` (239–252), `index.html:saveHistory` fallback (2844–2848) | Prova de que médico confirmou versão/digest |
| `processing_meta` | `processingMeta` (120–130) usa `lastProcessedMeta`, hypothesis, radar, destination do browser; `remotePayload` grava | Prova durável de origem, consentimento ou ACK |
| `consent_recorded_at` | `buildLocal` (208) usa valor anterior ou `lastProcessedMeta.consentRecordedAt`; `remotePayload` (222) e fallback `index.html` (2848) persistem | Consentimento por finalidade servidor autenticado |
| `protocol_usage` | `index.html` muta `window.__NEXA_PROTOCOL_USAGE__` (4324/4339); `buildLocal` (205) e `remotePayload` (220) gravam | Assinatura/autorização clínica |
| `ready_for_audit` | `eligible(fields)` (114–117) e `buildLocal` (197–203) promovem automaticamente com base em texto | Consentimento nem ACK |
| `sync_version` | trigger `touch_consultation_history_encounter()` em `20260925172000_encounter_autosave_v18101.sql` (76–100); autosave usa CAS por owner + versão (243–252) | Vínculo imutável de revisão médica |
| ACK de sincronização | `carryForwardOwnAck` (30–42), `nexa:encounter-synced` (281), `index.html:saveHistory` (2826–2833) | ACK médico final explícito |
| `reviewed_documentation:true` | `index.html` (2884), `nexa-audit-autosave-v18.5.js` (89), `audit-contract.mjs:safeCoreContext` (38) | Evidência de ação humana verificável |

O schema versionado implementa `consultation_history.user_id`, políticas owner-only e validação de acesso clínico via `has_active_clinical_access()` (migration `20260925172000_encounter_autosave_v18101.sql`). Isso limita acesso às linhas; não transforma valores escritos pelo cliente em eventos de autorização. **Tenant institucional não é gate atual** (ver `README.P0_SOURCE_AUTHORITY.md`). Não inventar `tenant_id`.

## 3. Interfaces candidatas — separação explícita e FAIL-CLOSED (NÃO IMPLEMENTADAS)

Os nomes abaixo descrevem portas/adaptadores futuros, **não** APIs já disponíveis, colunas existentes ou funções executáveis. Todo adaptador externo requer implementação e revisão de identidade/grants/schema antes do uso real.

**Entrada de consentimento — intenção restrita do cliente:**

```text
Request: {
  kind: "PHYSICIAN_PATIENT_CONSENT_ATTESTATION",
  encounterId: UUID,
  confirmation: {
    patientScopeAttested: true,
    externalAiAllowed: true,
    auditAllowed: true,
    policyVersion: string
  }
}
```

O backend precisa recuperar a identidade a partir de `auth.getUser()`, comprovar profissional owner-only + slot ativo + origem existente, versão da política e que a finalidade ainda é válida **antes do início da chamada externa pertinente**. Os booleans são *pedido de ação positiva*, nunca prova de consentimento. Não criar evento a partir de timestamp legado nem fazer backfill para cobertura de IA prévia.

**Entrada de ACK médico final — intenção restrita do cliente, APÓS sincronização:**

```text
Request: {
  kind: "PHYSICIAN_FINAL_REVIEW_ACK",
  encounterId: UUID,
  confirmation: { physicianReviewedExactVersion: true },
  expectedVersion: positive integer,
  displayedDigest: "sha256:" + 64 lowercase hex characters
}
```

A interface do médico precisa apresentar a **versão exata e o documento efetivamente revisado**. O digest é calculado de maneira canônica por backend sobre dados persistidos (campos dinâmicos, `processing_meta`, `protocol_usage`, etc.), e o servidor compara o digest exibido àquele que rederiva da mesma versão; `displayedDigest` vindo do cliente **não é autoridade**. Requer sync ACK do servidor, ausência de edição posterior, áudio pendente ou conflito. Snapshot revisado e event ID devem ser amarrados ao mesmo owner e source row.

**Portas confiáveis que ainda NÃO existem no produto instalado:**

```text
auth.getUser() -> {id}                   // identidade validada no servidor
source.readVerifiedForActor({actorId, encounterId, kind})
  -> owner, sourceRowId, effectivePolicyVersion, syncVersion,
     serverCanonicalDigest, syncAck, state, activeClinicalSlot
events.commitVerifiedActionAtomic(intent)
  -> durable, immutable, idempotent event ID scoped to actor+source+purpose
```

`gate-c-event-producer.P0-CANDIDATE.mjs` já define `produceExplicitGateCEvent()` e `commitVerifiedActionAtomic()` como *portas candidatas*. Não criar outro writer paralelo; mapear esta especificação para ele somente após validação real de schema, produtor de ação médica e privilégios restritos. Seus recibos, mesmo com mocks aceitos, retornam `ADAPTER_RECEIPT_LAB_ONLY`/`eventRecorded:false`.

`audit-dispatch-preflight.P0-NOT-DEPLOYED.mjs` e `audit-context-quarantine.P0-NOT-DEPLOYED.mjs` continuam NEGANDO `externalAiAuthorized`, `auditSubmitAuthorized` e `adminWriteAuthorized` em todos os cenários de laboratório. O backend hospedado `submit-audit-case/index.ts` NÃO foi modificado.

## 4. Ciclo de vida e restrições transacionais (CONTRATO, NÃO SQL)

1. **Consentimento específico antes da IA correspondente.** Confirmar ação positiva, identidade, finalidade, política, fonte, owner e estado. Persistência durável no servidor com clock próprio e event ID. A origem da ação e eventual revogação devem ser verificadas por servidor; não confiar no JSON do cliente como atestação.
2. **Consulta e sincronização.** `sync_version bigint` avança via trigger; autosave/CAS não é revisão. Não elevar `ready_for_audit` a sinal médico.
3. **Revisão médica final.** Exibir documento/snapshot efetivamente sincronizado, exigir ação explícita, verificar fonte, owner, sync version, digest canônico `pg-jsonb-v1`, ausência de alterações/conflitos, política/consentimento aplicáveis. Persistir evento imutável do ACK de mesma versão/digest. `snapshot_version` da auditoria é TEXT `final-v1` (rótulo de backend), distinto do `sync_version` numérico.
4. **Antes da desidentificação por IA para auditoria.** Revalidar evidência autêntica de consentimento (inclusive não revogado), ACK final e documento exato; registrar/admitir claim idempotente servidor com chave vinculada a owner/source row/snapshot version/sync version/digest/event IDs. Sem prova, STOP. **Nenhuma chamada externa paga** ou claim do navegador. Evitar repetição paga por retries e concorrência.
5. **Após IA.** Transação curta valida novamente identidade/owner/slot, eventos, versão, digest, state e event IDs. Usar ordem de locks compatível com `submit_audit_review`: advisory lock de chave lógica em ausência de case, depois `audit_cases` existente, depois `consultation_history`; constraints e política de conflito avaliadas. Sem transação aberta durante a IA.
6. **Idempotência:** mesmo owner/source/snapshot/digest/versão/event IDs deve resultar no mesmo estado sem cobrar novamente; qualquer divergência, revogação, novo edit, case locked/terminal ou versão ultrapassada: STOP/rollback. `ALREADY_SUBMITTED` não prova identidade da evidência.
7. **Reset e dados:** nunca vincular este contrato à permissão de limpar consulta ou histórico. Não modificar outbox, `locked`, RLS/ACL nem habilitar o endpoint por testes sintéticos.

## 5. Critérios de aceitação futura — TODOS NÃO EXECUTADOS NESTE LOTE

| Caso | Expectativa verificável em implementação FUTURA |
|---|---|
| A01 consentimento por data de frontend sem evento | STOP antes de IA |
| A02 consentimento posterior à chamada de IA que pretende autorizar | STOP; nunca backfill |
| A03 consentimento para finalidade diferente, revogado ou policy version trocada | STOP |
| A04 source null / owner ou slot inválido / `user_id` null | STOP |
| A05 `ready_for_audit` automático + `reviewed_documentation:true` sem evento final | STOP |
| A06 ACK médico antes de sync ACK, após conflito ou com áudio pendente | STOP |
| A07 ACK para `sync_version`/digest distinto do snapshot mostrado ao médico | STOP |
| A08 novo edit entre revisão, IA e commit / digest dinâmico divergente | STOP e nenhuma escrita |
| A09 duas chamadas paralelas com mesma chave sem recibo servidor | no máximo uma admissão/custo/case, sujeito a prova real |
| A10 evento de outra consulta, médico ou policy version usado como recibo | STOP |
| A11 decisão de revisor `submit_audit_review` usada como ACK do médico autor | STOP |
| A12 mocks/claims de `serverCommittedVerified` ou `committedByTrustedBackend` | SEM autorização real; PASS sintético é insuficiente |

**Os critérios A01–A12 são especificação, NÃO foram executados.** Não incrementar C01–C10 nem checklist por criar este documento.

## 6. Dependências antes de qualquer implantação

- Proveniência real do schema privado e baseline RLS/ACL; a exportação schema-only local não é prova de hospedado e seu conteúdo bruto não deve ser publicado.
- Writer de evento autenticado e persistência/revogação por finalidade com event IDs, locks, privilégios mínimos e política de privacidade.
- Pré-condição de IA antes do primeiro provedor externo pertinente; consentimento para auditoria não retroautoriza outro tratamento.
- Rastreabilidade da versão do documento que a UI mostrou ao médico sem mudar a estética atual do NEXA nem mostrar a transcrição no meio da consulta.
- Provas C01–C10 de concorrência no PostgreSQL local descartável somente após autorização própria e isolamento físico; nenhuma sessão iniciada.
- PR #168 é um bloqueio temporal de frontend; não cobre o backend hospedado nem clientes antigos. PR #169 preserva snapshots locais de forma candidata, sem prova física WebKit.
- Prescrição `plantonistae-create/prescricao` e BIC são escopo separado; NÃO importar funcionalidades.

**STOP explícito:** Gate C=NO-GO; C01–C10=NOT_RUN. Não executar SQL, criar tabela, conceder grants, modificar Edge hospedada, alterar JWT/RLS/ACL, consumir IA paga, usar pacientes reais, reset locked, staging, merge ou deploy. Não tocar checkout Codex nem seus outputs.
