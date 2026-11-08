# NEXA P0 — Reconciliação sintética sobre main (07/11/2026)

**Escopo:** branch isolada criada de `cb95e0e19dcc9d81947e791ff5d10537104d0686`, apenas testes, laboratórios, scripts de relatórios agregados, snapshots inertes e documentação copiados das PRs #118 e #121 Draft. Não contém modificações em Edge Functions, banco de dados, frontend clínico, token, JWT/RLS, cache ou credenciais.

## Origem
- PR #118 HEAD `423ad80a0efc5df386feb59f9f1c234f6c6ca071`: 15 arquivos de pesquisa e testes sem alterar código clínico.
- PR #121 HEAD `61d4be5f11ed8850b8e1373e3396e6e0067ee789`: 8 arquivos de referência hospedada v6, documentação e testes. Não copia `supabase/functions/realtime-call/index.ts` nem o novo helper para o runtime.
- `package.json` gerado do `main` com as suítes sintéticas agregadas; arquivos existentes de teste clínico permanecem.

## Evidência e bloqueios
- As PRs #118/#121 haviam divergido 14 commits do `main`. Esta PR cria uma linha de **integração somente de testes**, sem rebase ou alteração das branches originais. Não representa um merge pronto para produção.
- A Edge hospedada `realtime-call` v6 tem SHA-256 `1675c95f6b1a25569c6af86e5c461f05fd475ee0d8a759439631d2d56221e005`, JWT habilitado. A candidata de SDP multipart usa campos string; teste de contrato não comprova resolução causal dos HTTP 400.
- O `main` possui telemetria `emitUsage` no fallback que não consta na hospedada v6. Nenhum bundle novo deve substituir a v6 por simples cópia de Git.
- Cancelamento ingênuo do mesmo AbortController compartilhado com chunks pode interromper fallback. Os testes da PR #118 reproduzem esse risco, mas não modificam o runtime.
- Custo: variação de uso do Radar e cobrança declarada não bastam para aferir poupança; `savings_attributable_to_nexa_change_usd` permanece null.

## Gates
1. Exigir CI integral SUCCESS da nova branch, com testes sintéticos, regressão clínica e `validate-ui`.
2. Confirmar que o diff contra `main` contém **somente** docs/scripts/experimental/tests/labs e `package.json`.
3. Tratar pendências de WebRTC, segurança do fallback, equivalência clínica e exportação oficial de custos em lotes futuros; testes pagos e publicação da `realtime-call` ou da PR #121 requerem autorização separada.
4. Rollback é fechar esta PR Draft. Sem efeitos em produção.

**STOP:** não fazer merge ou deploy desta PR nem das PRs #118/#119/#121 sem novo gate e autorização.
