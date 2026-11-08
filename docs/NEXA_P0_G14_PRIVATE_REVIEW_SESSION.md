# NEXA G14 — Sessão privada de governança (PREPARAÇÃO / NO-GO)

**Base:** G13 PR #148 merged, main `6cf857f5348fda6939e3b5b4fb6c182a52037b3f`.
**Natureza:** plano de sessão, sem SQL hospedado de leitura ou escrita, sem
dados reais, sem migração, sem chamar modelos pagos e sem Edge deploy.

## 1. Decisão de início

A revisão real de ACLs/corpos das funções **NÃO ESTÁ AUTORIZADA** por este
checkpoint. O Supabase Security Advisors (consulta somente ao próprio
recurso de metadados) mantém o registro de:
- 11 avisos de funções SECURITY DEFINER executáveis como `anon`;
- 29 avisos executáveis como `authenticated`;
- 13 tabelas públicas com RLS habilitado e sem policy.

As quantidades acima representam avisos por papel, **não funções
necessariamente distintas**, nem prova de exploração. Uma tabela sem
policy pode estar corretamente em `deny all`. Só consultas internas
de catálogo, autorizadas separadamente, permitiriam verificar
a assinatura, `owner`, ACL efetiva, `search_path`, código e
dependências. Elas **não foram executadas aqui**, nem em modo leitura.

A listagem de Edge Functions segue com `realtime-call v6`,
`realtime-radar v12`, `process-consultation v24` ACTIVE, todas
`verify_jwt=true`. PRs #118/#119/#121/#134 continuam Draft.
A CI push e o Pages pós-G13 continuam **não verificados pelo conector**.

## 2. Proposta de sessão privada — escopo e participantes

**Propósito:** produzir uma matriz privada de evidência mínima para
distinguir função interna/trigger de RPC alcançável, demonstrar os
grants efetivos e avaliar impacto clínico de qualquer correção futura.
Não existe, nesta sessão de planejamento, licença para executar
`SELECT`, `REVOKE`, `ALTER`, deploy, chamadas a API ou acesso
a registros de pacientes.

**Papéis necessários (nomes fora deste repositório):**
- Responsável técnico pelo PostgreSQL/Supabase, capaz de analisar
  ACLs e catálogo em ambiente isolado;
- Revisor de segurança para avaliar identidade, autorização e
  privilégios de `SECURITY DEFINER`;
- Revisor clínico para aprovar os testes de login, consentimento,
  histórico, auditoria e integridade da consulta;
- Responsável pelo rollback, com restauração e plano de parada.

**Armazenamento:** inventário individual de funções, nomes de objetos,
assinaturas, grants, dumps ou outros dados potencialmente sensíveis
devem permanecer em espaço privado externo ao GitHub público.
Nunca colar corpos SQL em issues, PRs ou respostas públicas.
Não solicitar nem processar PHI, tokens reais ou chaves.

## 3. Evidência que precisará ser coletada — SOMENTE após autorização

| Fonte de evidência | Pergunta que precisa responder | Condição STOP |
|---|---|---|
| Definição/ACL efetiva de funções privilegiadas | Quem pode executar, por herança ou GRANT? RPC via Data API, trigger interna ou helper? | Sem prova de alcance e permissões efetivas |
| `SECURITY DEFINER`, owner e `search_path` | A execução eleva o privilégio? Resolve objetos por schema fixo? | Owner/search_path não demonstrados |
| Guarda de identidade do usuário | Qual a origem autenticada e fresca da identidade? | ID, papel ou privilégio autoafirmados pelo cliente |
| Autorização admin/tenant/objeto | Um operador legítimo pode agir apenas no escopo atribuído? Revogação funciona? | Tenant/atendimento/operador não verificáveis |
| RLS, views e `WITH CHECK` | Caminho `SECURITY INVOKER` ou função privilegiada preserva isolamento? | Bypass/RLS sem revisão de dependências |
| Mapa de chamadas e dependentes | Qual efeito da restrição no login, consentimento, histórico, auditoria e consulta? | Possível indisponibilidade não reproduzida em teste |
| Snapshot anterior e rollback | Configuração original e reversão segura testada fora de produção? | Backup/rollback inexistente ou não testado |

**Não prescrever REVOKE em lote.** Uma função exposta pode ter uso
legítimo e remover grants pode bloquear onboarding, login e as
consultas médicas. O tipo de função, as dependências e o benefício
do menor privilégio devem ser confirmados antes da correção mínima.

## 4. Roteiro humano mínimo, sem execução hospedada

**Fase A — aprovar o plano documental.**
Confirmar proprietário DB, revisor de segurança, revisor clínico,
responsável pelo rollback, limite de escopo, armazenamento privado,
plano de retenção e ausência de dados clínicos. Conclusão dessa fase
**não é autorização para SQL de leitura**.

**Fase B — solicitar autorização separada, ainda não concedida.**
O proprietário da conta deverá aprovar explicitamente o ambiente,
identidade operacional, janela, escopo da consulta **somente leitura**
de catálogos, logs permitidos, política de retenção e responsável
pela operação. Sem aprovação específica: **STOP**. Nenhuma autorização
para SQL de escrita, mesmo se a leitura vier a ser aprovada.

**Fase C — revisão privada após aprovação, em outro lote.**
Se e somente se houver autorização posterior: revisar inventário
mínimo em ambiente controlado, privilegiando primeiro caminhos
administrativos e clínicos potencialmente acessíveis sem login.
O arquivo privado de evidência deve permanecer fora do repositório.
A ferramenta G13 pode triar somente campos genéricos e gerar contagens
anônimas; não concede GO.

**Fase D — homologação isolada antes de qualquer proposta de alteração.**
Definir e executar com dados fictícios testes negativos/positivos
para usuário sem login, usuário comum, operador autorizado, tenant
diferente, permissão revogada, atendimento sem acesso e credencial
expirada. Verificar também os fluxos legítimos de login, consentimento,
histórico, auditoria, prontuário e exibição da transcrição **somente
ao término da consulta**, preservando o visual atual.

**Fase E — mudança separada, se algum dia aprovada.**
Após revisão de efeito e testes: proposta mínima por classe, backup,
plano de reversão, janela de manutenção e critérios clínicos de parada.
Nada disso está autorizado pelo G14.

## 5. Controle automatizado offline — utilidade e limite

`labs/nexa-security/private-session-preflight.G14-REVIEW-ONLY.mjs`
exige um plano **abstrato sem nomes reais**, com papéis,
etapas de evidência e testes de impacto. A CLI somente aceita
arquivo de plano fora do repositório público, rejeita campos extras
de paciente, operador, nome da função e SQL, e emite STOPs
documentais agregados.

Mesmo se todas as caixas de preparação forem preenchidas, o
resultado é `CHECKLIST_READY_FOR_HUMAN_GOVERNANCE`, **não**
GO operacional. O programa fixa:
- `human_scope_approval_obtained=false`;
- `can_run_hosted_read_sql=false`;
- `can_run_hosted_write_sql=false`;
- `can_change_grants_or_rls=false`;
- `clinical_release_authorized=false`.

O preflight **não valida assinatura, credencial ou concessão real
de autorização**. Ele se limita a um checklist de planejamento.
Os testes automatizados proíbem representar uma autorização
de SQL real como aprovada dentro de arquivo público.

## 6. Checkpoint e rollback

Escopo de publicação permitido: somente guia G14, ferramenta
local, testes de segurança e registro de scripts no `package.json`.
Não criar novo laboratório de quota, Core, Radar ou WebRTC sem
evidência de falha nova. Preservar os gates clínicos existentes.

Merge somente após `NEXA UI CI` integral SUCCESS: autenticação,
regressão clínica, testes do preflight, syntax/lint/typecheck/build,
Chromium desktop/mobile e Safari WebKit. Testes opcionais de
medicação SKIPPED não equivalem a SUCCESS.

Verificar push e Pages após merge pelo SHA; se o conector retornar
vazio, manter **NÃO VERIFICADO**. O rollback do G14, se necessário,
é um PR revertendo o SHA squash com regressão completa;
como nenhum SQL foi executado, não há mudança de banco para reverter.

## 7. AÇÕES MANUAIS

**Agora:** nenhuma para concluir o G14 offline.

**Para desbloquear o G15 de evidência real:** responsável pela
infraestrutura deve definir um espaço privado e confirmar
proprietário DB + revisores de segurança/área clínica. A seguir,
será necessária **autorização específica e separada para SQL
somente leitura**, com escopo e ambiente descritos. Até lá,
nenhuma inspeção de corpos ou ACLs reais é autorizada.

Referências:
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/database/postgres/row-level-security
