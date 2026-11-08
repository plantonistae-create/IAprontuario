# NEXA G5 — teste isolado de despacho único e evidência clínica

Checkpoint: G4 #139 merged, main e97c2a95a837088daf02ee5961732f9605406bd6.
Esta alteração **não** instala funções Edge, migra hosted SQL ou altera atendimento
clínico, identidade visual, transcrição, JWT, RLS, segredos ou dados reais.

## 1. Radar / speaker / evidência — regressão adversarial
- Duplicação idêntica de frase (entre speakers e até pelo mesmo patient)
  não pode produzir origem univocamente atribuída.
- LOCUTOR acústico sem função confirmada, frases do acompanhante, perguntas
  do médico e documentos copiados não resolvem fatos como se fossem do paciente.
- Contradição ganha precedência sobre resposta manual prévia; ASR incompleto
  não resolve fatos positivos automaticamente.
- A UI atual e a transcrição ao final permanecem intocadas.
- Casos sintéticos e regressão automatizada não provam segurança clínica real.

## 2. PostgreSQL descartável — reserva != despacho != resposta
- O script \`labs/nexa-quota/dispatch-claim.G5-LAB-ONLY.sql\` é carregado
  **apenas** depois do fixture G4 em banco \`nexa_quota_lab\` efêmero.
- \`reserve_radar_call\` continua serializando quotas por tenant.
- \`claim_radar_dispatch\` exige identidade, tenant administrativo ativo,
  acesso clínico, propriedade do atendimento e reserva existente.
- A PK da tabela \`radar_dispatch_claims\` permite um único \`CLAIMED_ONCE\`
  mesmo sob 16 requisições concorrentes; nenhuma reserva é autorização
  para reenviar um pedido previamente reivindicado.
- \`record_radar_dispatch_outcome\` aceita estado terminal
  \`confirmed_response\` ou \`outcome_unknown\`. Após um terminal,
  transições contraditórias são negadas. Um 2xx HTTP não é validação
  médica, nem reconciliação de cobrança.
- Revogação do aprovador administrativo bloqueia novas reivindicações;
  registrar o desfecho de uma reivindicação anterior continua possível.
- Ausência de comprovante do provedor após falha significa **UNKNOWN**.
  Atribuir UNKNOWN a "não cobrado" seria incorreto. Não tentar novamente
  automaticamente; revisar manualmente.
- \`claim-aware-bridge.G5-LAB-ONLY.mjs\` é adaptador de prova offline.
  Em runtime futuro, \`auth.getUser(token)\` deve validar o usuário,
  o vínculo tenant virá exclusivamente da fonte administrativa, e
  um recibo único de dispatch precisará estar ligado ao mesmo request_id.
  O laboratório não demonstra essa integração real, atomicidade de
  efeitos externos, crash-recovery, autenticação ou faturamento.
- O sistema ainda carece de política de expiração, reconciliação por
  recibo, cancelamento seguro, ordens de revogação sob concorrência,
  idempotência no provedor e retenção minimizada.

## 3. WebRTC 400/502/abort/timeout — evidência offline
- \`trace-replay.G5-LAB-ONLY.mjs\` admite apenas evento e status;
  rejeita áudio, SDP, transcrição, usuário, URL e chave.
- Diferencia 400 upstream + 502 wrapper, 502 wrapper sem status upstream,
  timeout antes de resposta, cancelamento voluntário, abort de origem
  desconhecida e exceção de transporte.
- Nunca infere causa-raiz HTTP 400 nem afirma diagnóstico de 502 sem
  captura técnica autorizada. Nenhuma chamada de rede nem retry pago.
- Falha do fallback local é STOP explícito, não "sucesso".
- O hosted realtime-call v6 é **preservado**; seu catch genérico de
  exceções ainda precisa de revisão isolada e autorização própria.

## 4. Core shadow e economia — somente dados sintéticos/agregados
- \`nexa-core-shadow-cohort.G5-LAB-ONLY.mjs\` agrega quantidade de
  divergências de alertas, faltas críticas e riscos de speaker sem
  expor diálogos, IDs clínicos ou payloads; live promotion sempre false.
- \`mix-gate.G5-LAB-ONLY.mjs\` verifica alteração das taxas de requisição
  por capacidade por consulta antes de qualquer comparação descritiva
  de custo agregado. Mesmo taxa estável não prova case-mix semelhante.
- Faltam faturas oficiais, volumes e mix de modelos, denominação de custo,
  cobertura, qualidade e consulta equivalentes; **economia causal não
  foi comprovada**.

## Segurança e rollback
- GitHub Actions PostgreSQL roda em container Postgres 16 local, dados UUID
  fictícios, scripts restritos ao laboratório, sem conexão com Supabase hosted.
- Sem permissão de merge/deploy de Edge, SQL hosted, modelos pagos, produção
  clínica, mudança na transcrição, secrets/JWT/RLS ou PRs Draft existentes.
- Gate de merge do lote offline: CI NEXA UI integral e teste Postgres de
  concorrência, proteção de schema, desfecho desconhecido, rollback e
  revogação. Se algum falhar: NO-GO; corrigir na branch.
- Após merge, verificar CI de push e GitHub Pages por fonte que exponha
  esses runs. O conector de workflows por commit filtra \`pull_request\`;
  ausência de registros não significa SUCCESS nem falha.
- Rollback da PR G5 caso necessária = \`git revert\` do merge/squash
  específico, seguida de PR e CI. Não há migração hospedada a reverter.

## Ações humanas
Nenhuma necessária para testes offline. Antes de qualquer quota hosted,
deploy Edge, alteração de segredo, observabilidade com tráfego real ou
promoção clínica: autorização específica separada, evidência da autoridade
de tenant e validação de segurança/clínica.
