# NEXA G10 — Antirreplay durável, credenciais e recuperação sem reenvio (LAB-ONLY)

**Base:** G9 PR #144, main `ef3dc585778c0e2feb5addb4e52edadf9fe56e28`.

## 1. Antirreplay e revogação em PostgreSQL 16 descartável

`labs/nexa-quota/durable-nonce.G10-LAB-ONLY.sql` é carregado APENAS
no contêiner efêmero da CI após G4–G9, nunca no Supabase hospedado.

- `consumed_nonces_g10` tem PK `(tenant_id, nonce)`, sem dados de paciente.
  Um nonce, uma vez consumido, não pode ser reutilizado nem após outra conexão
  ou uma nova época de credencial. A tabela não é automaticamente esvaziada
  por TTL: apagar antirreplay sem política segura permitiria reutilizações.
- `operator_credential_epochs_g10` vincula o login sintético de banco a
  tenant/época ativa. Revogação impede novos consumos e consultas; rotação
  requer nova época, mas não libera um nonce já utilizado.
- `consume_operator_nonce_g10(tenant,nonce,expiry,epoch)` não aceita
  `admin_user_id` nem user metadata. Exige `session_user` PostgreSQL,
  operador G8 ativo, aprovador ativo e época independente. Executável
  só pelas contas sintéticas `nexa_g8_tenant_a/b`; nem `service_role`
  nem `anon/authenticated` podem chamar. Testes: 16 conexões concorrentes,
  duas conexões em momentos diferentes, `SET ROLE` sem autenticação,
  outro tenant, revogação e rotação, expiração e limites.
- Como na G8, o login de banco sintético **não** demonstra a sessão real
  `supabase.auth.getUser()` nem valida o atestado Ed25519 G9 por si só.
  A assinatura e a política de `epoch` precisam ser validadas numa
  fronteira de confiança independente **antes** da chamada SQL.
  Esse vínculo ponta a ponta não foi comprovado no hosted.
  Usar senha de banco por operador real não está autorizado.

## 2. Recibo e queda após despacho

A inspeção de recuperação `inspect_receipt_after_crash_g10` é
**somente leitura** e exige a autoridade sintética ainda ativa.
Após persistir um recibo ASSINADO do fixture G9, os testes simulam
queda/reinício abrindo outra conexão PostgreSQL. O status pode ser
`UNKNOWN_WITH_SIGNED_MOCK_DIGEST`, `UNKNOWN_WITHOUT_MOCK`,
`CONFIRMED_HTTP_NOT_BILLING` ou `CLAIMED_REMOTE_UNVERIFIED`.
Os resultados não revelam IDs clínicos, conteúdo da consulta ou digest
da assinatura ao chamador. São sempre `automatic_paid_retry=false`.

O estado `outcome_unknown` continua terminal, mesmo que o mock
afirme `seen` ou `not_found`. O digest original continua imutável.
Não há chamadas pagas, billing real, assinatura de provedor real
ou garantia de exactly-once entre rede externa e banco.

## 3. Evidência Radar — casos adversariais novos

Novos testes concentram a origem de relatos de uso contínuo,
alergias e falta de confirmação do paciente: repetição de fala
por médico/paciente, atalhos não aplicáveis que contradizem falas,
acompanhante e ASR parcial. Falas incertas não viram fatos negados
por paciente. Nenhuma alteração no controlador clínico nem na
identidade visual. **Transcrição textual somente ao fim do atendimento.**

## 4. WebRTC, Core shadow e custo

Os novos testes combinam:
- 502 somente de wrapper sem prova de resposta upstream, falta de
  fallback (STOP), cancelamento voluntário, timeout e erros 400.
- Métricas apenas de status e totais; sem áudio/SDP/PHI/segredo.
- Avaliação sintética de risco clínico e alertas perdidos sem
  release real; denominadores agregados coerentes, divisão por
  zero = `null`, sem fatura, case-mix ou economia causal comprovada.
- O gate combinado é informativo: `live_release_allowed=false`.

## Critérios de merge, bloqueios e rollback

CI NEXA UI deve aprovar sintaxe, testes G10, regressão clínica,
auth, lint/typecheck/build, desktop/mobile e WebKit.
CI PostgreSQL descartável deve aprovar sequência G4–G10.
Qualquer falha obrigatória bloqueia merge, inclusive testes UI.
Jobs opcionais SKIPPED não são SUCCESS.

Após squash merge: verificar CI de push e Pages por fonte capaz de
expor os runs, registrar como **não verificado** se vazia. Se necessário,
rollback por PR com `git revert` do merge G10 e rerun dos gates.
Como não há SQL hosted G10, não existe migração de produção a reverter.

**Preservar:** hosted `realtime-call` v6, `realtime-radar` v12,
`process-consultation` v24, JWT/RLS/segredos e PRs
#118/#119/#121/#134 Draft. Sem dados reais, deploy Edge, migração,
API paga, mudança em UI clínica ou apresentação antecipada de transcrição.

**AÇÕES MANUAIS G10:** nenhuma obrigatória para laboratório. Promoção
hospedada depende de autorização separada, vínculo auth real, governança
de tenant, recibos reais do provedor, análise clínica e auditoria
de faturamento.
