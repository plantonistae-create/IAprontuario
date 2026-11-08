# NEXA G8 — Offline gate

Baseline: G7 PR #142, main `630100a2633dff2a092e370602aadc75f15e699b`.

## Autoridade e tenant
O laboratório G8 utiliza autenticação por login do PostgreSQL descartável para distinguir operadores fictícios por tenant. A nova função deriva a identidade do operador da sessão de banco, sem receber `p_admin_user_id` do pedido. O acesso pelo caminho legado G6 é revogado somente no laboratório G8. Testes cobrem sessão realmente autenticada, tentativa de assumir papel sem login, revogação, isolamentos entre tenants e concorrência.

**Limitação:** logins sintéticos do laboratório não equivalem a autenticação Supabase real. A identidade administrativa em produção permanece não comprovada. É proibido promover o mecanismo diretamente ao banco hospedado.

## Recibos e recuperação
Um adaptador offline usa recibos simulados e nunca executa chamada ao provedor. Resultado `seen`, `not_found` ou `indeterminate` não confirma cobrança, ausência de cobrança nem segurança clínica. Pedidos duplicados e concorrentes reutilizam a mesma leitura simulada. Tentativa paga automática permanece proibida, inclusive em falhas e resultados UNKNOWN.

## Radar, WebRTC e Core
Testes de evidência clínica contemplam falantes ambíguos, frases repetidas, contradições, acompanhante, documentação sem origem e ASR incompleto. O visual atual permanece intacto; transcrição somente ao final da consulta.

Falhas WebRTC HTTP 400/502, autenticação, timeout, cancelamento, abort e fallback são apenas replays locais sem dados identificáveis. Causa-raiz real não demonstrada.

Core shadow usa exclusivamente casos sintéticos; custos são agregados e declarados, sem faturas verificadas, pareamento de casos ou prova de economia causal. GO clínico permanece bloqueado.

## Gates e rollback
Executar CI UI completa, PostgreSQL descartável G4–G8, regressões desktop/mobile e WebKit. Fazer merge somente após SUCCESS dos gates obrigatórios; opcionais SKIPPED não são SUCCESS. Após merge, verificar CI push/Pages por resultados reais; vazio não é sucesso. Reverter por PR o squash commit G8 se necessário.

**Preservações:** funções hosted realtime-call v6, realtime-radar v12 e process-consultation v24; JWT/RLS, dados clínicos reais, segredos, API paga e PRs #118/#119/#121/#134 Draft. Sem SQL hospedado, Edge deploy, migrações ou alteração de frontend.

**Ações manuais:** nenhuma para testes offline. Integração hospedada exige decisão separada e validação de segurança administrativa, clínica e financeira.
