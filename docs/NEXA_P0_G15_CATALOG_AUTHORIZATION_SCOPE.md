# NEXA G15 — autorização separada e escopo mínimo do catálogo (NÃO AUTORIZADO)

**Checkpoint:** G14 PR #149 merged, `main eafe1fdd855f56e883d5ca3262b47cc2f73e25b3`.
**Objetivo novo:** reduzir o escopo genérico G14 a uma proposta verificável de
**duas consultas de catálogo read-only**, sem executá-las nem revelar resultados.
**Estado final deste documento: STOP / NO-GO hospedado.**

> **ATUALIZAÇÃO DE SEGURANÇA G16.3:** A1 e A2 foram separados fisicamente.
> O arquivo `catalog-phase-a.G15-NOT-AUTHORIZED.sql` contém agora SOMENTE A1.
> A2 está em `catalog-phase-a2.G16-NOT-AUTHORIZED.sql` e exige análise de
> A1 e autorização própria antes de execução. Consulte
> `docs/NEXA_P0_G16_PHASE_A_HARD_STOP.md` para o procedimento atual.
> A descrição histórica abaixo NÃO autoriza executar ambas numa única sessão.



## A. Primeiro desbloqueio: aprovação específica e separada

O pedido G15 **não concede autorização para SQL hosted**, nem leitura.
A primeira ação manual futura é uma aprovação explícita para uma sessão
técnica com responsável por DB/infraestrutura, que identifique:
- o projeto hospedado NEXA correto, a janela, o operador autenticado
  e quem responderá pela revisão e interrupção;
- uso de contexto confiável e armazenamento **privado** de saída,
  fora de GitHub público, issues, logs da CI ou documentos abertos;
- finalidade limitada: conhecer metadados de funções
  `SECURITY DEFINER` do **schema `public`**, inclusive ACL e
  privilégios de execução efetivos;
- proibição de consultar pacientes, prontuários, encontros, autenticações
  de usuários, conteúdos de consulta, tokens e recibos reais;
- proibição de modificar SQL, RLS, privilégios, esquema, JWT,
  Edge Functions, APIs pagas ou quaisquer dados reais.

A conexão do Supabase no ChatGPT é útil para uma futura operação
**somente quando este escopo tiver aprovação explícita posterior**.
Uma autorização genérica como "continue o NEXA" não é suficiente.
O responsável operacional e o armazenamento privado ainda precisam
ser confirmados. Sem isso, permanece STOP.

## B. Fase A proposta — APENAS após aprovação posterior

Arquivo de consulta **não executado**:
`labs/nexa-security/catalog-phase-a.G15-NOT-AUTHORIZED.sql`.

| Operação preparada | Catálogo permitido | Finalidade e limite |
|---|---|---|
| A1 — contagem de candidatas | `pg_catalog.pg_proc`, `pg_catalog.pg_namespace` | Funções `SECURITY DEFINER` do schema `public` com EXECUTE efetivo para `anon` ou `authenticated`; validar quantidade até 250 |
| A2 — inventário privado e limitado | `pg_proc`, `pg_namespace`, `pg_roles` e helpers de privilégio do próprio `pg_catalog` | Identidade, classe, owner, `prosecdef`, `proconfig` (inclusive `search_path` se configurado), ACL declarada, grants efetivos, acesso ao schema, owner superuser/bypass RLS; até 250 linhas |
| Encerramento obrigatório | `ROLLBACK` | Nenhuma persistência. Transação `READ ONLY`, timeouts de instrução e lock |

A2 usa funções **nativas do catálogo** para obter metadados.
Ela **não executa nenhuma função de negócio** do NEXA, não chama
provedores e não lê tabelas clínicas. Nomes de funções, assinaturas
e ACL que surgirem **na saída real** são confidenciais; o arquivo
público contém somente SQL genérico e **nenhum resultado real**.

**Limites importantes da Fase A:**
1. A visão se restringe ao schema `public`; não prova que avisos em
   outros schemas estejam resolvidos nem confirma visibilidade da
   API REST/PostgREST.
2. `has_function_privilege` distingue EXECUTE efetivo por papel, mas
   não prova que a função seja chamável externamente ou que sua guarda
   interna seja correta. Acesso `USAGE` ao schema é sinal adicional,
   também insuficiente para demonstrar alcançabilidade.
3. `proacl` pode estar ausente e os grants efetivos podem decorrer de
   privilégios padrão/herdados. O inventário não estabelece
   automaticamente qual seria o `REVOKE` correto.
4. `proconfig` informa configurações explicitamente definidas, mas
   não é um atestado de `search_path` seguro em todos os contextos.
5. O marcador `within_explicit_review_cap=false`, erro de permissão,
   resultado truncado, schema divergente ou ausência de armazenamento
   privado obriga **STOP**, não ampliar escopo automaticamente.
6. O arquivo é **somente proposta**: nenhum teste em SQL hospedado
   e nenhuma prova da sua execução/sintaxe naquele servidor foi obtida.

## C. Fase B — NÃO INCLUÍDA na autorização A

A inspeção de **corpos reais SQL**, dependências, triggers, políticas
RLS, views, cadeia de sessão/admin/tenant e fluxos de chamada exige
um **segundo escopo e nova autorização específicos**, se a Fase A
identificar objetos com revisão necessária. Isso inclui eventual
uso de `pg_get_functiondef`, `pg_depend`, `pg_trigger`,
`pg_policy`, `pg_rewrite` e análise de dependências externas.

**Não consultar** `auth.users`, `auth.sessions`, tabelas clínicas,
Storage, logs ou registros de pacientes nesta fase. O G15
**não autoriza** uso de `pg_get_functiondef` nem corpo SQL de função
privilegiada real.

## D. Provas P0 para GO/NO-GO posteriores

A Fase A pode identificar candidatos, mas a decisão de mudança
depende de: guarda de autenticação no servidor, autorização
administrativa vigente, vínculo autoritativo a tenant e atendimento,
negação entre tenants, revogação efetiva, ACL e owner, `search_path`,
RLS/view compatíveis, classificação RPC versus trigger e mapa de
dependências, além de rollback pré-aprovado e testes dos fluxos
legítimos de login, consentimento, histórico, auditoria, prescrição
e consulta. **Não revogar EXECUTE em lote.**

A clínica exige avaliação independente de segurança; as matrizes
G4–G11 são somente offline. A estética atual do NEXA e a transcrição
textual exibida **somente ao término do atendimento** permanecem
intocadas.

## E. Segurança da publicação / CI / rollback

Publicar somente este procedimento e o **template genérico não
executado**, nunca resultados de catálogo ou dados identificáveis.
O template NÃO autoriza o operador a agir, não traz segredos e
não é importado pelo runtime/CI.

Para aprovar este material documental, executar a CI obrigatória
NEXA UI (auth, regressão clínica, lint/typecheck/build,
Chromium desktop/mobile, Safari WebKit). Nenhum novo
PostgreSQL de laboratório ou chamada ao banco hosted foi solicitado.

Verificar pós-merge `push`/Pages pelo SHA exato; se vazios,
registrar como **NÃO VERIFICADOS**. Rollback de G15:
PR revertendo o squash G15 + CI obrigatória, sem
banco ou Edge hosted a reverter.

**Preservar:** `realtime-call` hosted v6, `realtime-radar` v12,
`process-consultation` v24, JWT/RLS/segredos,
PRs #118/#119/#121/#134 Draft.

## F. AÇÃO MANUAL EXATA (quando desejar desbloquear)

A autorização separada deverá dizer expressamente:

> Autorizo uma sessão supervisionada **exclusivamente de leitura de
> metadados do catálogo PostgreSQL do projeto NEXA conectado**, usando
> apenas as duas consultas A1/A2 descritas no G15, limitadas às
> funções SECURITY DEFINER do schema public, em transação READ ONLY,
> com limite de 250 objetos e sem dados clínicos, sem corpos SQL,
> sem gravação e sem alterações. Os resultados individuais devem
> permanecer privados, sem publicação em GitHub ou logs públicos.
> O operador responsável e a guarda privada dos resultados serão
> definidos antes da execução. Se faltar qualquer condição, STOP.

**Importante:** o texto acima é um **modelo de autorização futura**,
NÃO uma autorização fornecida nesta conversa.
Mesmo com a aprovação, será necessário confirmar separadamente
quem é o responsável operacional e onde a saída confidencial ficará
retida; se isso não puder ser comprovado, NÃO EXECUTAR.

Fontes de verificação:
- https://supabase.com/docs/guides/observability/advisors?queryGroups=lint&lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/observability/advisors?queryGroups=lint&lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/changelog
