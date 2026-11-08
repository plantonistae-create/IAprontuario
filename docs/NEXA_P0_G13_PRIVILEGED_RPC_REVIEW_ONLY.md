# NEXA G13 — Triagem de RPCs privilegiadas (REVIEW-ONLY / NO-GO)

**Checkpoint de origem:** G12 PR #147 merged, main `4694df3ce09cc5634eb40ba9e96bddba69fa706c`.
**Data do levantamento:** 8 de novembro de 2026.
**Classificação:** documento público apenas com categorias e contagens de avisos.
Não contém inventário de nomes, assinaturas, corpos de funções, ACLs
privadas, linhas de pacientes, chaves, tokens ou consultas SQL.

## Conclusão operacional

**GO para documentação e triagem privada: SIM.**
**GO para ALTERAR ACL/RLS/SQL hospedado, liberar quota, WebRTC real ou promover Core: NÃO.**

Os Security Advisors do Supabase hospedado, acessados somente por
leitura do conector, seguem reportando:
- 11 registros de funções SECURITY DEFINER executáveis pelo papel `anon`;
- 29 registros executáveis pelo papel `authenticated`;
- 13 tabelas públicas com RLS habilitado e sem políticas definidas;
- avisos adicionais de extensão em esquema público e proteção contra
  senhas comprometidas.

A contagem **11 + 29 não equivale a 40 funções distintas**: um mesmo
objeto pode aparecer para ambos os papéis. Aviso de EXECUTE
**não equivale a exploração**; requer validação do corpo, do tipo de
função, da ACL efetiva (incluindo concessões herdadas) e da
autorização real. RLS sem política pode representar proteção
`deny-all` intencional.

As evidências atuais **NÃO abrangem** `pg_get_functiondef`, dono
real, `search_path`, cadeia completa de `GRANT EXECUTE`, código
de cada RPC administrativa ou mapa de dependências de chamada.
Os conectores não apresentaram esses corpos/ACLs sem consultar SQL;
**nenhum SQL, nem de leitura, foi executado no banco hospedado**.
A busca de código GitHub não encontrou implementações correspondentes
indexadas. Ausência no índice de código não é prova de inexistência.

## Matriz de priorização por classe, sem nomes de funções

| Classe | Prioridade | Proposta REVIEW-ONLY | Condição de STOP |
|---|---|---|---|
| RPC administrativa que altera permissões, visível a `anon` | P0 | Verificar ACL efetiva, identidade, regra de admin em dado autoritativo, guarda por alvo/tenant; avaliar revogar acesso anônimo **apenas após prova de compatibilidade** | Não demonstrar autenticação/autorização real ou houver dependência desconhecida |
| RPC clínica/auditoria que lê ou modifica dados, visível a `anon` | P0 | Validar escopo do sujeito, atendimento, tenant, finalidade e consistência; revisar chamada interna de trigger | Consulta ou escrita alcançável fora de escopo, autorização/retensão não auditadas |
| Função de trigger/seed/helper reportada pelo advisor | P1 até confirmar alcançabilidade | Diferenciar trigger interno, RPC exposto e efeito colateral; checar privilégio de execução e quem depende do helper | Proposta de REVOKE pode quebrar cadastro, login ou prontuário |
| RPC `authenticated` com SECURITY DEFINER | P0/P1 por efeito | `authenticated` não é autorização; verificar `auth.uid()`, papel administrativo ativo, escopo de tenant/objeto, owner e `search_path`; considerar `SECURITY INVOKER` somente se RLS cobrir o caso | Dependência de papel editável pelo usuário, ID administrativo fornecido pelo cliente ou RLS incompleta |
| Tabelas com RLS sem policy | P1 por uso esperado | Confirmar `deny-all` intencional versus funcionalidade indisponível; avaliar `GRANT`, views e políticas necessárias | Criar políticas `USING(true)`/acesso amplo por conveniência |

## Procedimento para futura análise PRIVADA

**Fase 1 — inventário estritamente read-only, com autorização separada.**
Proprietário DB verifica em ambiente apropriado e não expõe os
resultados ao GitHub público. Para cada objeto, guardar privadamente:
tipo `trigger_only/rpc_confirmed/unknown`; papel/ACL explícita ou
herdada; contexto `SECURITY DEFINER`; owner; `search_path`;
corpo e guardas de identidade/admin/objeto/tenant; dependências de
login, consentimento, histórico, auditoria e catálogo; plano de
rollback. Nenhum nome, SQL, segredo, ID real de usuário ou PHI deve
ser incluído no snapshot público.

**Fase 2 — triagem privada local sem efeitos.**
O arquivo `labs/nexa-security/private-rpc-triage.G13-REVIEW-ONLY.mjs`
valida um inventário MANUAL já revisado e usa identificadores opacos
do tipo `R-001`. O relatório emitido contém somente **contagens
e classes de risco**, jamais IDs dos objetos analisados. A CLI
**recusa arquivos de entrada dentro do repositório** e não possui
rede, SQL, segredo, comando `REVOKE` ou execução remota.
O atributo `code_and_acl_review=complete_private_review` é uma
declaração humana não verificada pelo script; ele permanece NO-GO
mesmo quando todos os campos são marcados como revisados.

O modelo exato de campos e valores aceitos está em
`tests/nexa-g13-private-rpc-triage.test.mjs`, com dados fictícios.
Na etapa futura, manter o inventário real em armazenamento privado,
fora do repositório, de chats públicos e de PRs. O script não
aceita nomes SQL, corpos de funções, tokens nem campos clínicos
no formato de entrada.

**Fase 3 — proposta em ambiente isolado, com revisão humana.**
Para cada classe, avaliar mínimo privilégio, eventuais mudanças
de `EXECUTE` e visibilidade do schema, owner, `search_path`,
`auth.uid()`/Auth server e políticas RLS de `USING` e
`WITH CHECK`. Não produzir lote de SQL executável até que
as dependências sejam demonstradas. Uma mudança em function grant
não substitui a revisão do corpo SQL e do bypass de RLS.

**Fase 4 — pré-voo e rollback antes de qualquer alteração hospedada.**
Registrar definição e ACL anteriores de forma privada;
validar restore, janela de manutenção e reversão;
executar testes positivos/negativos para funções privilegiadas;
provar negação a `anon`, usuário sem vínculo, outros tenants,
credencial revogada e sessões expiradas, além de êxito para
operador legítimo. Validar login, onboarding, transcrição final,
consulta, consentimento, histórico, auditoria, biblioteca e
revisões clínicas. Rollback sob responsabilidade do operador DB,
com revisão e autorização explícitas.

## Gates de liberação

**P0 ainda bloqueado:** inventário privado de owner/corpo/ACL e
visibilidade real de RPC; prova de auth administrativa e vínculo de
tenant/atendimento; efeito de revogação; RLS e função de trigger;
recibo verificável e idempotência do provedor (sem redespacho após
UNKNOWN); aprovação clínica independente.

**P1:** evidência de observabilidade e faturas oficiais agregadas
comparáveis; CI de push e GitHub Pages do commit exato; e
alertas secundários de segurança.

Os laboratórios G4–G11 são apenas offline e não resolvem esses
itens. Preservar estética atual do NEXA, exibir transcrição textual
somente ao final, e não criar painel de transcrição durante gravação.

## Status de produção e controle de alterações

**Sem SQL hospedado** (nem consultas SQL de auditoria),
migração, alteração de permissões, Edge deploy, paciente real
ou chamada de modelo paga. Preservar `realtime-call` v6,
`realtime-radar` v12, `process-consultation` v24, verificação
JWT, RLS e segredos e PRs #118/#119/#121/#134 Draft.

A liberação G13 exige somente CI de interface completa da PR
(sintaxe, testes de triagem, auth, clínica, build, Chromium, WebKit);
o workflow PostgreSQL offline anterior não sofre mudanças.
Após squash, verificar CI push e Pages com resultado observável;
retorno vazio permanece **NÃO VERIFICADO**, jamais SUCCESS.

**Rollback da PR G13**: PR de revert do squash G13, CI completa,
sem migração SQL hospedada para reverter.

**AÇÕES MANUAIS OBRIGATÓRIAS NESTE LOTE:** nenhuma.

**BLOQUEIO PARA FUTURA EXECUÇÃO REAL:** autorização distinta e
proprietário DB para revisão do inventário privilegiado e das
dependências em ambiente isolado; nunca retirar EXECUTE diretamente
em produção sem homologar login, consentimento e histórico.

Referências:
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/database/postgres/row-level-security
