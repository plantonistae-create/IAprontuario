# NEXA G9 — fronteiras criptográficas e recibos duráveis (OFFLINE)

**Checkpoint:** G8 PR #143, main `f3fedf64d8104ef229ed14106db3c883083742ec`.

## 1. Autoridade independente sem presumir Supabase Auth

O laboratório `signed-operator.G9-LAB-ONLY.mjs` verifica um
atestado Ed25519 assinado com chave **efêmera gerada pelo teste**,
issuer e audience fixos, operador/tenant vinculados, função
`reconcile_unknown`, validade limitada a 120 segundos e nonce.
A concessão só é aceita se um cadastro administrativo independente
confirma tenant, operador e autorização ativa. Testes tentam falsificar
operador, tenant, perfil, validade, chave, assinatura e nonce, incluindo
16 verificações concorrentes.

**Limitação explícita:** essa é apenas prova de assinatura de um
emissor sintético confiável pelo *laboratório*. Não comprova a identidade
do operador real, a conexão `supabase.auth.getUser()`, o vínculo real
do administrador, o armazenamento durável do nonce, revogação de
chaves ou segurança de um gateway hospedado. A aceitação retorna
`live_approved=false`. O mecanismo G8 de login PostgreSQL permanece
também offline. **NO-GO para migração do banco hospedado.**

## 2. Recibos simulados com origem verificada

O `signed-receipt.G9-LAB-ONLY.mjs` verifica a assinatura Ed25519 de
um evento `offline-provider-fixture` com audience/key ID fixos,
UUID de request/tenant/evento, timestamp e observação
`seen | not_found | indeterminate`. Exige que um claim do banco
descartável exista no mesmo tenant e não esteja reservado sem dispatch.
Devolve somente SHA-256 dos campos assinados e uma observação.

Após validação no processo local, o teste armazena o digest em
`synthetic_receipt_evidence_g9` no PostgreSQL 16 descartável:
- PK por request, FK para claim confirmado, isolamento por tenant;
- apenas a conta de bootstrap do fixture pode invocar a função;
  `service_role`, `anon`, `authenticated` e operadores G8
  não podem gravar/ler a tabela;
- repetição idêntica é idempotente, divergência é conflito imutável;
- 16 persistências concorrentes registram apenas uma linha;
- o recibo não modifica `radar_dispatch_claims`:
  `outcome_unknown` continua terminal e não permite segunda
  tentativa paga.

**Limite de confiança:** o SQL não verifica assinaturas, somente
formato e associação ao claim. A verificação criptográfica ocorre no
adaptador Node testado, e a conta postgres do fixture não é
um serviço público confiável. Os eventos e as chaves são fictícios:
nenhuma cobrança, ausência de cobrança, validação clínica ou
idempotência real do provedor é comprovada. Sem integração hospedada.

## 3. Radar / WebRTC sem dados pessoais

Os testes G9 reforçam origem e confiança em relatos contraditórios,
evidência de acompanhante, documentação copiada, ASR incompleto e
frases duplicadas em diferentes ordens de locutor.

Agregados de traces WebRTC, apenas com status, separam erro 400
upstream, 5xx upstream, erro do wrapper, timeout, cancelamento
e abort não verificado. Rejeitam campos de áudio, SDP, transcript,
usuário ou segredo. Falta de resposta do provedor não comprova
que a requisição não foi cobrada.

**UI intacta:** manter a estética atual do NEXA, e transcrição
textual somente ao término da consulta.

## 4. Core shadow e denominadores

O guard do Core agrega exclusivamente casos sintéticos, revisão
declarada, alertas perdidos e riscos de speaker, sem permitir
promoção clínica. O contrato de denominadores exige
tentativas = tentativas classificadas + desconhecidas e
consultas concluídas <= iniciadas. Taxas com denominador zero
retornam `null`, não sucesso artificial. Custos apenas declarados,
sem faturas oficiais, ajuste de case-mix, causalidade ou evidência
de segurança clínica real.

## Gates e rollback

CI obrigatória: `NEXA UI CI` (auth, regressão clínica, testes G9,
sintaxe, lint/typecheck/build, desktop/mobile e Safari WebKit) +
`NEXA P0 PostgreSQL Quota — Offline` (G4–G9 em banco descartável).
Sem merge até SUCCESS integral; medicação opcional SKIPPED não é SUCCESS.

Após merge, conferir os jobs push e Pages com evidência real;
resposta vazia do conector não equivale a sucesso. Rollback via PR
revertendo o squash commit G9 e reexecutando ambas as CIs.
Não há migração hospedada a reverter.

**Preservação:** hosted `realtime-call` v6,
`realtime-radar` v12 e `process-consultation` v24,
JWT/RLS, segredos, PWA, dados reais, chamadas pagas e
PRs #118/#119/#121/#134 Draft. Sem Edge deploy nem SQL hosted.

**Ações manuais:** nenhuma para a CI offline. A promoção exigirá
autorização separada, prova de autenticação real, protocolo de
recibos do provedor, revisão clínica e governança de tenants.
