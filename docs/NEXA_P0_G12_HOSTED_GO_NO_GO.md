# NEXA G12 — GO/NO-GO de produção baseado em evidência

**Data do snapshot:** 08/11/2026. **Base:** main G11 `d7144d304640996ca14eca3b0c4081f99fde62fc`.

## Resumo executivo

**NO-GO para quotas hospedadas, Core live, mudança de RLS e qualquer deploy novo.**
Este lote não inventou um tenant/admin real nem atribuiu causalidade de economia.
O snapshot foi obtido somente por ferramentas de leitura de metadata das
Edge Functions, das tabelas `public` e dos avisos de segurança do Supabase,
além do status de commit GitHub. Não contém linhas de pacientes, tokens,
segredos, SQL executado, áudios, consultórios ou prontuários.

Os seguintes números são um **retrato datado** de advisories, não
constatação de exploração:

| Achado em metadata hospedada | Quantidade | Interpretação / gate |
|---|---:|---|
| Funções SECURITY DEFINER executáveis por `anon` | 11 | P0: revisar EXECUTE, auth interno, dono, search_path, bypass RLS e necessidade funcional antes de alterar |
| SECURITY DEFINER executáveis por `authenticated` | 29 | P0: auditar autorização por operador/tenant/objeto; ser autenticado não basta |
| Tabelas públicas com RLS habilitado | 18/18 | Ponto positivo, **não** comprova política de autorização correta |
| Tabelas públicas sem RLS policy | 13 | Revisar: pode ser bloqueio intencional (deny all), não é vulnerabilidade automática |
| Extensão `pg_trgm` no esquema público | 1 | Risco operacional a avaliar em janela de mudança |
| Proteção de senha vazada | Alerta ativo | Habilitar somente após análise de impacto e aprovação administrativa |

**Nota de divulgação:** esse documento público omite nomes, assinaturas e
implementações de RPCs privilegiados que poderiam facilitar abuso.
Os detalhes existem no painel privado de *Security Advisors* do projeto,
não devem ser publicados em issues públicas ou colados com credenciais.

Referências de revisão oficial:
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/auth/server-side/creating-a-client

## Evidência de autenticação real — o que sabemos e o que falta

A listagem hospedada confirma:
- `realtime-call` v6 ACTIVE, `realtime-radar` v12 ACTIVE,
  `process-consultation` v24 ACTIVE; `verify_jwt=true` nas três.
- As funções hospedadas contêm um caminho de validação
  `supabase.auth.getUser()`; isso é evidência **de autenticação de
  usuário**, não prova completa de autorização administrativa e tenant.
- `public.profiles` possui `is_admin`, `is_reviewer`,
  `clinical_access`, `access_status`, mas não possui coluna
  `tenant_id`. Isso **não exclui** mapeamento em outros schemas ou
  funções: estes não foram auditados aqui.
- `public.consultation_history` possui `user_id` e `encounter_id`;
  a cadeia autoritativa usuário/admin/tenant/atendimento, sua revogação
  e controles de concorrência ainda não foram demonstrados.

A família G4–G11 demonstrou contratos **offline** com operador sintético,
assinatura Ed25519, nonce durável e recibo simulado; nenhum deles é prova
de sessão de usuário Supabase real, assinatura de provedor real,
exatamente-uma-vez de chamada paga ou fatura verificada.

## Roadmap de desbloqueio (com STOP explícito)

### P0. Permissões e privilégios dos RPCs hospedados
**Proprietário:** responsável técnico por DB/Auth.
**Evidência exigida:** inventário PRIVADO de funções SECURITY DEFINER,
seus proprietários, GRANT EXECUTE, search_path, autenticação e
autorização de objetos, casos legítimos de acesso anônimo, e revisões
de RLS com contexto por usuário/tenant. Diferenciar funções de trigger
de funções de RPC; confirmar acessibilidade externa antes de alegar
exploração. Revisão/alteração só com permissão específica, backup e
teste em ambiente isolado, seguida de regressão de login e clínica.
**STOP:** qualquer função privilegiada alcançável sem controles
comprováveis. Não revogar indiscriminadamente: pode quebrar login,
consentimento, histórico e auditoria.

### P0. Identidade/tenant e revogação ponta a ponta
**Evidência exigida:** sessão autenticada verificada no servidor
(`getUser` para identidade atual, `getClaims` quando apropriado
para JWT validado), autorização por registry independente que não
confie em `user_metadata` editável nem em `p_admin_user_id` de
`service_role`, vínculo de usuário/tenant/atendimento, revogação
imediata e prova de isolamento entre tenants em ambiente isolado.
**STOP:** origem do operador ou tenant, sessão ou revogação incerta.

### P0. Quotas/recibo e recuperação após UNKNOWN
**Evidência exigida:** especificação real de idempotência/recibo
verificável do provedor, mapeamento de request ID, política de
redespacho, custos oficiais e resultado remoto incerto. Demonstrar
reconciliação sem duplicidade em simulação fiel e depois ensaio
autorizado, preservando idempotência sob crash e concorrência.
**STOP:** segundo dispatch automático com resultado UNKNOWN; ausência
de resposta nunca significa ausência de cobrança.

### P0. Segurança clínica / Radar / Core
**Evidência exigida:** critérios clínicos revisados por médicos, casos
representativos aprovados com base legal e minimização de dados,
testes adversariais para contradição/locutor/confiabilidade, plano de
correção de eventos críticos, monitoramento e rollback.
Preservar a estética atual e a **transcrição exibida apenas ao fim
da consulta**, sem painel intermediário. Nenhum GO clínico derivado
apenas de casos fictícios.

### P1. Custos e publicação
**Evidência exigida:** faturas oficiais agregadas, mesmo período UTC,
mesma capacidade e case-mix, denominadores de consultas e tentativas,
além de histórico auditável dos workflows de `push` e GitHub Pages
referentes ao SHA exato. Sem esses itens, não alegar economia causal
nem implantação concluída.

## Atualizações externas que afetam futuros preflights

A documentação vigente distingue `getUser` (consulta a sessão junto ao
Auth server) de `getClaims` (verifica assinatura e claims JWT).
`getSession` isolado não garante validação de identidade do usuário
em ambiente servidor. Nenhuma dessas funções, sozinha, substitui o
vínculo administrativo e tenant no banco.

A changelog de 04/11/2026 informa mudanças importantes no Supabase
CLI v3: operações agora visam a stack local por padrão e ações
hospedadas requerem confirmação. **Nenhuma atualização de CLI foi
feita** neste lote. Há também aviso de retirada de ciphers TLS 1.2
legados a partir de 10/11/2026, a avaliar apenas se surgirem falhas
de clientes antigos; não é motivo para alterar produção agora.

- https://supabase.com/changelog?types=breaking-change
- https://supabase.com/changelog/cbc-tls-ciphers-deprecated

## Artefato e regras de publicação

`labs/nexa-release/g12-observed-metadata.REVIEW-ONLY.json` registra
somente métricas agregadas datadas, proveniência e evidências faltantes.
`readiness-gate.G12-REVIEW-ONLY.mjs` **nunca concede GO** e detecta
falta de evidência, metadados antigos, campos arbitrários com possíveis
dados pessoais e alegações `verified` que não estejam fundamentadas.
A aprovação da CI prova que o **contrato de NO-GO** funciona, não que a
produção foi autorizada.

UI CI normal valida `npm test`/sintaxe, clínica, auth, build,
desktop/mobile e WebKit; PostgreSQL offline histórico não é alterado.
Nenhum SQL hospedado, migração, deploy Edge, alteração de JWT/RLS,
consumo de API paga ou acesso a dados clínicos é autorizado.

**Pós-merge:** conferir `push` e Pages por resultado observável;
resposta vazia deve continuar **NÃO VERIFICADO**.
**Rollback:** PR de `git revert` do squash commit G12 e CI completa.
Nenhuma migração de banco hospedado existirá para desfazer.

**AÇÕES MANUAIS:** nenhuma para documentação e gates offline. Para
corrigir privilégios reais, promover quotas ou usar dados reais, é
necessária autorização separada, proprietário técnico, plano de
backup/rollback e validação clínica.
