# NEXA G6 — Reconciliação offline, NO-GO explícito para produção

Base: G5 PR #140, main \`3e8f814680fd2ff589921b96f6e041faa245f6fe\`.

## Sem repetir G4/G5
G6 acrescenta apenas um reconciliador offline de claims abandonadas,
novos contratos adversariais e um gate agregado de release. Não ativa,
substitui ou reimplanta runtime clínico, transcrição, WebRTC, JWT/RLS
nem quota no Supabase hosted.

## 1. Claims antigas e desfecho remoto incerto
- O SQL \`reconcile-stale.G6-LAB-ONLY.sql\` só é executado depois dos fixtures
  G4 e G5 no contêiner PostgreSQL 16 descartável \`nexa_quota_lab\`.
- Somente \`service_role\` e administrador ativo de tenant podem conciliar.
  Sem aprovações baseadas em \`user_metadata\`, identidade de cliente ou
  dados reais.
- Claims \`claimed\` com idade mínima configurada de 60 a 86400 segundos
  são encerradas conservadoramente em \`outcome_unknown\`, com lote de
  1 a 100 registros e bloqueio \`FOR UPDATE SKIP LOCKED\`.
- \`confirmed_response\` nunca pode regredir para UNKNOWN. Conflitos
  entre recibo confirmado e reconciliador terminam em um estado terminal.
  A reconciliação é idempotente, separada por tenant e não devolve
  request IDs, tokens nem dados clínicos.
- \`outcome_unknown\` não prova cobrança nem ausência de cobrança e **nunca**
  reabre autorização de dispatch. O algoritmo offline não liga para o
  provedor. Recuperação e reenvio automático de chamadas pagas permanecem
  proibidos.
- A decisão local \`recovery-decision.G6-LAB-ONLY.mjs\` exige idade,
  autoridade e fallback. Falta de fallback torna o fluxo STOP, não
  "recuperação bem-sucedida".
- Lacunas antes de produção: identidade real validada por \`auth.getUser()\`,
  autoridade de tenant comprovada, origem dos recibos/estado remoto,
  idempotência comprovada no provedor, operações com cancelamentos, queda
  entre commit e dispatch, observabilidade anônima, retenção e autorização
  de rollout.

## 2. Autoridade / concorrência / revogação
- PostgreSQL descartável simula administrador ativo, negando conciliação
  quando sua aprovação é revogada.
- Ensaios verificam 12 reconciliadores simultâneos, corrida com
  confirmação remota, encerramento terminal único, isolamento de tenants,
  parâmetros inválidos, papéis \`anon\`/\`authenticated\` negados.
- O laboratório testa SQL, não prova o vínculo administrativo no ambiente
  hospedado nem a verificação da sessão/JWT nas funções reais.

## 3. Radar: speaker e evidência
- Casos com frase repetida por paciente e acompanhante, frase repetida pelo
  próprio paciente, médico como falante, \`LOCUTOR\` sem identidade, fala
  acompanhada de contradição, ASR incompleto, negação e documentação
  sem fonte atribuída.
- Confiança continua \`not_measured\`; evidência ambígua não vira
  confirmação de paciente. Nenhuma mudança no controller do Radar,
  na identidade visual ou na regra de transcrição **somente ao final**.
- Nenhum resultado sintético substitui aprovação clínica prospectiva.

## 4. WebRTC e fallback (sem rede)
- Matriz offline distingue HTTP 400 upstream com wrapper 502, HTTP 502
  real upstream, apenas wrapper 502, timeout, cancelamento voluntário,
  abort de fonte indefinida e falha de rede antes do HTTP.
- Logs sintéticos são somente status; scripts rejeitam áudio, SDP,
  transcrição, URLs, chaves e identificadores.
- Não foram realizadas chamadas pagas nem identificadas causas reais
  de HTTP 400/502; a função \`realtime-call\` hosted v6 fica intacta.

## 5. Core shadow e custos
- \`nexa-g6-offline-release-guard.mjs\` só admite casos sintéticos e
  agregados declarados, combinando divergências clínicas e intensidade
  relativa de requisições por consulta. Nunca transforma aprovação
  de teste em validação de qualidade clínica ou economia causal.
- Custo oficial, case-mix, cobertura de modelos, faturamento por
  capacidade e causalidade permanecem **não verificados**. Live GO false.

## CI, publicação e rollback
- Gate PR: NEXA UI CI (clin/regressão/auth/sintaxe/testes/build,
  navegador mobile/desktop, WebKit) + PostgreSQL descartável
  (reserva/dispatch e stale reconciliation). Não fazer merge sem SUCCESS.
- O conector de workflows por commit pode retornar apenas runs de PR,
  não de push. Confirmar push/Pages por fonte que exponha os jobs;
  ausência não é sucesso. Se impossível, registrar como pendente.
- Rollback: reverter o squash merge G6 via PR e rerodar CI. Como não
  houve SQL hospedado, não há esquema ou dados reais a restaurar.
- Supabase hospedado: preservar \`realtime-call\` v6,
  \`realtime-radar\` v12 e \`process-consultation\` v24;
  JWT/RLS/segredos intactos. PRs #118/#119/#121/#134 Draft.
- Não executar SQL hosted, Edge deploy, migração, chamadas pagas,
  acesso a dados reais ou modelos clínicos em produção sem
  autorização específica.

## Ações manuais
Nenhuma para completar CI offline e merge seguro. Uma futura
integração hospedada requer autorização adicional, avaliação clínica,
governança de tenant e plano de reconciliação real de cobrança.
