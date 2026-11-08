# NEXA G11 — Fronteira integrada de confiança e recibos, laboratório offline

**Checkpoint:** G10 PR #145 merged, main `046caa8d97b98eb5535e16b9eaad52babd82609c`.

## Objetivo novo

Em vez de repetir as matrizes G4–G10, G11 une o caminho completo:
atestado Ed25519 de operador → registro privado de tenant/administrador →
nonce durável consumido em PostgreSQL 16 descartável → inspeção
read-only de claim e recibo fictício após simulação de crash.

O controlador `integrated-gate.G11-LAB-ONLY.mjs` exige assinatura,
audiência, finalidade, operador, tenant, principal de banco,
`key_epoch` da credencial, nonce e validade curta, além de aprovação
independente por um registro administrativo privado. Ao consumir o
nonce, a função G10 valida `session_user` PostgreSQL, autoridade
administrativa ativa e epoch; somente depois é permitida a inspeção
somente leitura do recibo. **Nenhum dispatch externo é invocado.**

## Demonstrações no Postgres descartável

- O mesmo token, repetido em outra conexão/processo, é rejeitado por nonce
  persistido; 16 requisições concorrentes autorizam no máximo
  uma inspeção. Nenhuma credencial do `service_role` em produção.
- Tenant/principal/operador/papel alterados depois de assinados são
  rejeitados antes de chegar ao banco.
- Um token corretamente assinado mas associado a outro tenant ou
  principal falha perante o registro privado.
- Revogação do aprovador e rotação de `key_epoch` bloqueiam
  tokens antigos antes de consumir nonce.
- Crash imediatamente após consumo do nonce: STOP; repetir o token
  antigo não reabre consulta ou dispatch. Um novo token/nonce permite
  somente **inspeção read-only** do estado `outcome_unknown`.
- Uma prova de recibo assinada por emissor **fictício** G9 persiste
  apenas seu digest no PostgreSQL, e após reinício resulta em
  `UNKNOWN_WITH_SIGNED_MOCK_DIGEST`. Esse resultado continua
  **não autoritativo para faturamento** e não autoriza retry pago.
- Qualquer indisponibilidade da autoridade, banco ou inspeção termina
  STOP. O envelope recusa campos arbitrários com dados clínicos.

## Limites explícitos de confiança

- O emissor Ed25519, suas chaves e a identidade de login PostgreSQL
  são **inteiramente sintéticos**; não provam
  `supabase.auth.getUser()`, vínculo de um administrador real,
  segurança de sessão web, operação das chaves, rotação do certificado,
  registro de nonce compartilhado com um gateway real ou RLS hosted.
- A assinatura é verificada por Node em laboratório, não pelo SQL.
  Um serviço que ignorasse o verificador ainda poderia chamar o RPC
  diretamente se possuísse credenciais; **não implantar como solução
  hospedada** sem trust boundary real e revisão de arquitetura.
- A inspeção não verifica fatura oficial nem evento real do provedor;
  indisponibilidade ou ausência de recibo não prova ausência de custo.
  Não existe garantia comprovada de exactly-once do provedor remoto.
- A proteção real contra edição/replay de documentos/pacientes e
  a cadeia de autoridade de `service_role` continuam **NO-GO**.

## Lacuna financeira específica

`synthetic-invoice.G11-LAB-ONLY.mjs` compara apenas agregados de
uso e fatura **marcada `offline_synthetic_invoice`**, com exigência
de mesmo provedor, moeda USD e janelas UTC exatamente idênticas.
Janelas incompatíveis resultam em STOP, e divisão por zero retorna
`null`. Diferenças numéricas são descritivas, sem afirmar economia
causal, case-mix equivalente, cobrança verificada ou fatura oficial.

Nenhum dado real de paciente, pedido, operador ou recebimento foi
acessado para esse relatório.

## Radar, WebRTC e NEXA Core

Não foi identificado risco clínico novo que justificasse repetir a
matriz sintética de falantes, contradição e evidência já aprovada em
G6–G10. O G11 mantém esses gates como regressões existentes,
não altera controlador do Radar, estética atual nem apresenta a
transcrição antes do final do atendimento.

A investigação WebRTC 400/502, abort, timeout e fallback não recebeu
evidência nova de produção, logo os gates existentes continuam;
não se infere a causa raiz real nem se executa rede paga. O NEXA
Core shadow permanece sintético, sem promoção clínica.

## Gates, pós-merge e rollback

CI obrigatória: `NEXA UI CI` (sintaxe, contratos, clínica, auth,
build, desktop/mobile, WebKit) e `NEXA P0 PostgreSQL Quota — Offline`
(PostgreSQL 16 efêmero G4–G11, integrado). Qualquer falha obrigatória
impede merge; jobs opcionais SKIPPED não contam como sucesso.

Depois do merge, consultar CI push/Pages para o SHA final; resposta
vazia do conector não prova sucesso. Rollback por PR revertendo
exatamente o commit squash G11, seguido de ambas as CIs; nenhum
SQL foi aplicado no Supabase hospedado.

**Preservar:** `realtime-call` hosted v6, `realtime-radar` v12 e
`process-consultation` v24, JWT/RLS/segredos, PRs Draft
#118/#119/#121/#134, PWA e dados reais. Sem modelos pagos,
migração hosted, chamadas externas, deploy Edge ou dados identificáveis.

**AÇÕES MANUAIS G11:** nenhuma obrigatória para execução offline.
Para uma futura implantação real, exigem-se autorização separada,
prova de sessão/admin/tenant no ambiente hospedado, governança de chaves
e recibos verificáveis pelo provedor, revisão clínica e auditoria de
cobrança antes de qualquer GO.
