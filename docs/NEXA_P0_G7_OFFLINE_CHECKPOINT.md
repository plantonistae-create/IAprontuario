# NEXA G7 — Crash windows, admin authority e NO-GO clínico (offline)

**Checkpoint-base:** G6 PR #141 merged; main \`8b0abe3fbe3fe90f577bf256b27e5e6bd8f7c679\`.
**Destino:** arquivos de laboratórios, testes, documentação e CI, sem deploy clínico.

## 1. Queda entre reserva, claim, despacho e resposta
G7 acrescenta \`labs/nexa-quota/crash-boundary.G7-LAB-ONLY.sql\`,
**somente** ao container PostgreSQL 16 descartável, após as etapas G4–G6.
A função de inspeção é **somente leitura**, privada para \`service_role\`
e exige membro de tenant ativo, aprovador administrativo ativo, acesso
clínico e posse do encounter; não retorna dados de outro tenant.

| Ponto da queda | Status interpretável | Ação remota automática |
|---|---|---|
| Antes da reserva | NO_VISIBLE_RESERVATION | Nenhuma |
| Reserva confirmada, sem claim | RESERVED_NOT_CLAIMED | Nenhuma sem autorização nova |
| Claim confirmada, sem recibo | CLAIMED_REMOTE_UNVERIFIED | Nunca reexecutar |
| Resposta HTTP registrada | TERMINAL_RESPONSE_RECORDED | Nunca reexecutar |
| Erro/reaper para UNKNOWN | TERMINAL_OUTCOME_UNKNOWN | Nunca reexecutar |

**Limite:** um claim no banco não prova que o provedor recebeu/foi cobrado;
a ausência de recibo não prova que não houve custo. O teste não simula
precisamente todas as falhas interprocessos de rede, crash do cliente
ou recuperação de faturamento. \`automatic_paid_retry=false\` sempre.

A suíte PostgreSQL G7 cobre: rollback de transação, isolamento de tenant
e encounter, revogação de aprovador, 10 workers concorrentes tentando
reclaim, resposta terminal confirmada vs UNKNOWN, e RBAC de browser.

## 2. Autoridade administrativa: fronteira de confiança
O coordenador experimental
\`labs/nexa-quota/trusted-coordinator.G7-LAB-ONLY.mjs\` exige:
- verificação de operador por fonte independente com prova \`auth.getUser\`;
- vínculo do operador e tenant com fonte \`admin_registry\` ativa;
- rejeição de \`user_metadata\`, \`adminId\`, \`service_role\`, claims do
  navegador ou tenant elevado pelo request;
- STOP se a autoridade ou o resultado da reconciliação for incerto.

**Bloqueio de produção explícito:** o RPC PostgreSQL G6
\`reconcile_stale_radar_claims(p_tenant_id,p_admin_user_id,...)\`
recebe o \`p_admin_user_id\` do chamador \`service_role\` sem comprovação
independente de \`session_user\`/identidade administrativa autenticada.
O adaptador G7 melhora o **contrato de orquestração testado**, mas **não**
elimina essa lacuna da função já existente nem comprova autoridade de
um operador real no ambiente hosted. Não ativar quotas hosted.

## 3. Radar e speaker (casos 100% sintéticos)
Testes confrontam a permutação de falas idênticas entre paciente e
acompanhante, repetição de questionamento clínico, acompanhante
negando sintomas, contradição com atalhos, documentação copiada
e ASR incompleto. Origem ambígua não deve ser convertida em resposta
confirmada do paciente; confidence permanece não aferida.

**Não modificar** a identidade visual atual nem exibir transcrição
durante a consulta; a transcrição só é apresentada ao final.
Nenhuma alteração em \`index.html\` ou no controlador Radar neste lote.

## 4. WebRTC, abort, fallback
\`fallback-policy.G7-LAB-ONLY.mjs\` separa:
- status upstream vs erro de wrapper 502 (sem inferir causa raiz);
- cancelamento explícito do usuário vs timeout/abort sem prova;
- fallback local disponível (revisão humana) vs indisponível (STOP);
- HTTP 2xx técnico vs resultado clínico validado (não equivalentes).
Não usa PHI, SDP, áudio, URLs de atendimento, credenciais ou rede paga;
não autoriza retry automático.

## 5. NEXA Core shadow e custos
\`observability-coverage.G7-LAB-ONLY.mjs\` calcula apenas cobertura
de classificação de falhas, desconhecidos e custos declarados por
consulta. Sem denominador válido, devolve \`null\`; rejeita campos
não agregados. \`nexa-g7-shadow-evidence-integrity.mjs\` impede GO live
mesmo quando o cohort sintético e os indicadores agregados parecem bons.

**Não demonstrados:** faturas oficiais, case-mix pareado, custo real por
capacidade, causalidade de economia, segurança clínica prospectiva,
diagnóstico de causa-raiz dos HTTP 400/502 ou validação do provedor.

## Gates, publicação e rollback
- CI NEXA UI: teste unitário G7, regressão clínica, autenticação, build,
  navegador desktop/mobile e WebKit.
- PostgreSQL descartável: testes G4–G7, incluindo rollback, concorrência,
  membro/approver e sem retry. G7 corrige os filtros \`push.paths\` para
  arquivos de testes G6/G7, mas não prova entrega do Pages.
- Se gate obrigatório falhar, NO-GO para merge; corrigir apenas na branch.
- Pós-merge: verificar jobs \`push\` e GitHub Pages. Se o conector não
  expuser resultados, declarar **não verificado**, nunca SUCCESS.
- Se precisar reverter: PR com revert do *squash commit G7* depois de
  identificá-lo, rodar novamente as CIs. Não há SQL hosted a reverter.

## Restrições permanentes
Supabase hosted preservado: \`realtime-call\` v6,
\`realtime-radar\` v12, \`process-consultation\` v24; JWT/RLS e secrets
intactos. Preservar PRs #118/#119/#121/#134 Draft. Sem acesso a dados
reais, chamadas pagas, mudanças em registros de pacientes, migrações
ou deploy Edge.

**Ações manuais G7:** nenhuma para a execução offline.
Futura promoção para produção exigirá autorização própria, prova de
cadeia administrativa por operador, mecanismo confiável de recibo
do provedor, auditoria de PHI e validação clínica.
