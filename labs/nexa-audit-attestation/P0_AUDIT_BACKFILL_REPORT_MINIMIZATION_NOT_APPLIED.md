# NEXA P0 — Minimização e completude de `audit-backfill.report` (PROPOSTA LAB, NÃO APLICADA)

**Escopo:** documento de contrato futuro, **sem implementação**, para a Issue #164 / PR #167 Draft. Não altera `audit-backfill/index.ts`, workflow, migrações, privilégios ou Supabase hospedado. **Gate C NO-GO; C01–C10 e N01–N09 NOT_RUN; progresso 2/10 = 20% DO CHECKLIST, não do produto.** Meta 26/11/2026 condicional. Repositório Prescrição independente e fora de escopo.

## 1. Rastro verificável, escopo e limite epistemológico

Fonte versionada examinada: `supabase/functions/audit-backfill/index.ts`, Git blob `d35821b8bf0a191f22a3d7b09505f57ab02862d4`, linhas 14–21, 42–54 e 69–102; contrato LAB existente `audit-backfill-ingress.P0-NOT-DEPLOYED.mjs`. Código do Git **não** comprova equivalência da função efetivamente hospedada. Nenhum dado clínico, consulta hospedada, SQL ou teste de banco foi usado para formular esta proposta.

A rotina atual autentica um usuário de `profiles` com `access_status=active` e `is_admin` ou `is_reviewer` (linhas 15–21). Ela lê `consultation_history` e `audit_cases` por um cliente separado com `SERVICE_ROLE_KEY` (linhas 42–45 e 73–74). Isso significa leitura privilegiada de dados clínicos **em memória da Edge**, apesar de a resposta de sucesso de `report` conter só seis contagens agregadas. **Não é prova de exposição de texto clínico na resposta HTTP nem de vazamento em produção.**

## 2. Ação explícita e ordem futura de validações

Contrato pretendido, **não integrado ao handler**:
1. `OPTIONS` e método: comportamento CORS separado, sem adquirir dados clínicos; somente método permitido.
2. Validar sintaxe e envelope JSON *estrito* **antes de criar cliente privilegiado ou executar inventário**. Exigir exatamente `{ "action": "report" }` no pedido mínimo. Ação ausente, valor desconhecido, `null`, body malformado ou campos extras ⇒ erro sanitizado, nenhum `inventory()`.
3. Identificar ator autenticado no servidor e verificar `active` e **permissão expressa de leitura de agregados de auditoria**. `is_admin`/`is_reviewer` e um JWT válido, isoladamente, não atestam autorização institucional sobre outras consultas. Sem escopo de acesso comprovado, retornar `AUTHORITY_SCOPE_NOT_PROVEN`, negar leitura.
4. Somente depois, admitir operação de agregação *read-only* sob escopo autorizado, com dados mínimos e registro técnico sanitizado. Não aceitar `user_id`, `tenant_id`, `actorId`, `confirmed`, `limit`, `fields`, `core_context`, timestamp de consentimento ou revisão do corpo do browser como autoridade.
5. O backend, e não o cliente, determina a identidade da ação, a política, o escopo e os limites; revalidar identidade/escopo se houver paginação prolongada. Não converter esse relatório em autorização para `run`.

A rotina Git **atual** usa `action=String(body?.action||'report')`, executa `inventory(admin)` **antes** de verificar se a ação é válida e trata JSON inválido como `report` (linhas 73–77). Essa diferença exige mudança futura do handler **não autorizada por este documento**. O candidato LAB já diferencia `audit-backfill.report` de `audit-backfill.run`, mas retorna `reportReadAuthorized:false` em todos os caminhos.

## 3. Dependências de cada uma das seis contagens — sem alterar semântica silenciosamente

| Contagem atualmente devolvida | Cálculo exato no Git (somente primeira janela de até 5.000 linhas) | Metadados necessários para equivalência legada | Atenção futura |
| --- | --- | --- | --- |
| `total_history` | `history.length` | Identificação/contagem das linhas de `consultation_history` no escopo e snapshot definidos | Não chamar de total global se o universo completo não foi provado |
| `already_present` | `present.size` do conjunto de `audit.source_consultation_id` | Somente `source_consultation_id` dos casos de auditoria no universo definido | Mede fontes distintas presentes na **janela de auditoria**, não necessariamente casos dentro da janela histórica; não confundir com total de `audit_cases` |
| `recoverable` | `eligible(h.fields) && !present.has(encounter_id) && !duplicates.has(encounter_id)` | `encounter_id`, assinatura de elegibilidade dos cinco campos clínicos, chave de duplicidade vinculada ao proprietário, conjunto `present` | **Elegibilidade não é consentimento nem ACK**; `recoverable` significa apenas “candidato segundo o filtro legado” |
| `incomplete` | `!eligible(h.fields) && !present.has(encounter_id)` | `encounter_id`, elegibilidade e `present` | Não exclui duplicados; preservar essa distinção ao comparar regras |
| `duplicate_exact` | `duplicates.size`; para cada linha posterior com chave `\${user_id}:\${JSON.stringify(fields||{})}`, adicionar `encounter_id` ao Set | `user_id`, identidade da fonte, assinatura da estrutura integral de `fields` | Ordem dos atributos JSON, normalização e serialização são relevantes; mudar algoritmo/canonicalização pode mudar o número. Não criar digest como se fosse equivalente sem prova |
| `legacy_mapped` | Contagem `String(h.id)!==String(h.encounter_id)` | `id`, `encounter_id` | Depende da janela ordenada por `created_at`; não prova estado global |

`eligible()` usa `queixa_principal`, `hda`, `exame_fisico`, `hipotese_diagnostica` e `conduta`; aplica limites de comprimento específicos, incluindo `hda >= 20` ou combinação de campos com pelo menos cinco caracteres. **Não substituir esse cálculo por mera presença de dados, nem usar preenchimento como revisão médica.**

A consulta Git lê `consultation_history: id,encounter_id,user_id,fields,encounter_state,audit_priority,audit_ready_at,created_at,updated_at,sync_version,processing_meta`. Para **essas seis contagens**, `encounter_state`, `audit_priority`, `audit_ready_at`, `updated_at`, `sync_version` e `processing_meta` são desnecessários. `created_at` serve à ordenação da janela atual, embora não apareça nas fórmulas. A consulta de `audit_cases` lê `source_consultation_id,snapshot_version,status`, mas as fórmulas só usam `source_consultation_id`. Atenção: esses campos podem servir ao ramo `run`; a minimização documentada é **somente para a futura implementação de `report`**, nunca uma mudança indiscriminada do `inventory()` compartilhado.

## 4. Abordagem de minimização proposta (sem SQL nem implementação)

**Preferência arquitetural, dependente de aprovação:** executar contagens/derivações em uma **fronteira confiável do servidor**, com escopo administrativo autorizado e sem enviar à Edge objetos `fields` completos para a emissão de seis números. Isso exige decisão explícita sobre leitura privilegiada, quem pode criar/atualizar derivações, fonte de verdade e quais agregações são necessárias. Não redigir migração ou função SQL neste lote.

Candidatos conceituais para a fronteira confiável: `eligibility_indicator` derivado dos cinco campos; `owner_bound_duplicate_fingerprint` derivado de representação canônica **versionada**; `presence_of_audit` conforme escopo; `legacy_mapping_indicator`. Esses indicadores **não existem comprovadamente no schema** e não devem ser inventados como colunas já disponíveis. Um fingerprint canônico futuro não garante paridade com a chave legada `JSON.stringify(fields)`; exige comparação sem dados reais em laboratório autorizado e escolha consciente de política. Registrar autoria/algoritmo/versão, quando atualizado, e invalidação por edição. Sem essa prova, classificar `SEMANTICS_UNVERIFIED`, não publicar contagem aparentemente equivalente.

A política owner-only observada para consultas não estabelece automaticamente autoridade institucional de um revisor sobre todos os médicos. Exigir matriz de papéis, escopo e finalidade aprovada, com negação por falta de prova. Não inferir tenancy real de um campo enviado pelo navegador ou de metadados de perfil.

## 5. Limites, completude, cardinalidade e concorrência

O Git usa `limit(5000)` em **cada** SELECT. `consultation_history` tem ordenação `created_at ascending` e `audit_cases` não indica ordenação explícita. Uma janela com 5.000 linhas **pode** conter o universo inteiro ou apenas uma parte; a contagem observada não prova qual. Além disso, `present` e `duplicates` dependem de janelas potencialmente diferentes. A soma e a classificação podem variar entre duas requisições durante edição e inclusão concorrentes.

Contrato futuro de resposta, **exemplo apenas ilustrativo, não schema implantado**:
- `status: "complete" | "partial" | "unknown"`;
- `scope: "verified_staff_scope"` apenas quando existe atestação real de autorização de escopo; do contrário STOP;
- `as_of` definido pelo servidor, referindo a um snapshot legítimo, **nunca** horário do browser como prova de estabilidade;
- `counts` com as seis métricas, presentes **somente** se o status e a metodologia justificarem seu uso;
- `completeness_proven` true **apenas** mediante prova de paginação/snapshot/universo, nunca inferida de `rows.length < 5000` isoladamente;
- `policy_version`/semântica de duplicidade e elegibilidade explicitamente identificadas;
- `total_scope` somente se confirmado, caso contrário null/omitido.

Se a leitura for parcial, o relatório deve distinguir **contagens observadas na amostra** de totais verdadeiros e marcar a restrição em toda apresentação. Falha parcial deve produzir erro sanitizado, sem devolver `ok:true` e um número que sugira completude. Não há prova de snapshot estável, consistência de paginação ou contagem total no código atual. Esses pontos dependem de autorização do laboratório PostgreSQL e de esquema/base legítimos.

## 6. Saída, logs, inferência e finalidade

Resposta administrativa mínima: somente as contagens autorizadas, estado de completude e metadados técnicos estritamente necessários. Nunca incluir `fields`, `processing_meta`, identificador de paciente/médico/consulta, texto de HDA/exame, detalhes de erro SQL ou nomes de tabelas internos no cliente. O código Git atual responde seis números, mas ainda consome campos completos internamente.

Falhas devem usar códigos controlados (`INVALID_REPORT_ACTION`, `AUDIT_STAFF_REQUIRED`, `AUTHORITY_SCOPE_NOT_PROVEN`, `REPORT_AGGREGATION_INCOMPLETE` etc.) e mensagens técnicas sanitizadas. O código atual registra `console.error('audit-backfill', e)`; isso **não comprova** que um log sensível foi emitido, mas requer política de serialização de erros sem payload clínico. Aplicar análise futura de risco de inferência por contagens baixas, repetição de relatórios, rastreabilidade de consulta e limites administrativos antes de liberar escopo global.

`report` não é `run`: o relatório **não** deve provocar IA externa, INSERT, UPDATE, reset, criação retroativa de consentimento nem permitir transição implícita para processamento histórico. Não tratar contagem `recoverable` como autorização para transmitir dados. O `audit-backfill.run` atual continua um caminho de IA separado e bloqueado pelo requisito de fonte, consentimento, ACK médico, versionamento e atomicidade ainda não demonstrados.

## 7. Matriz de decisões e STOPs

| Bloqueio | Condição STOP | Evidência necessária para avançar |
| --- | --- | --- |
| `REPORT_ACTION_NOT_EXPLICIT` | Ação ausente, inválida, corpo malformado ou campo estranho | Validação do handler antes de qualquer consulta privilegiada |
| `REPORT_STAFF_SCOPE_NOT_PROVEN` | Ator não autenticado/inativo ou autorização administrativa e escopo não demonstrados | Permissão e titularidade/escopo comprovados em fonte server-side |
| `REPORT_DATA_MINIMIZATION_NOT_PROVEN` | Precisa ler texto clínico integral em memória da Edge para seis contagens | Agregação confiável/minimização real, sem alterar semântica sem revisão |
| `REPORT_SEMANTICS_NOT_VERIFIED` | Nova classificação ou fingerprint diferente da regra histórica | Paridade demonstrada ou decisão de política explícita |
| `REPORT_COMPLETENESS_UNKNOWN` | Limite 5.000, paginação/snapshot/escopo não comprovados | Prova técnica de universo e snapshot consistente; resposta deve indicar desconhecido até lá |
| `REPORT_ERROR_SANITIZATION_NOT_PROVEN` | Exceção pode carregar dados contextuais não revisados | Política de logging sanitizado e verificação autorizada |
| `REPORT_SMALL_CELL_PRIVACY_NOT_REVIEWED` | Contagens repetidas/pequenas com risco de inferência | Revisão de privacidade/escopo e mitigação proporcional |
| `REPORT_RUN_BOUNDARY_NOT_VERIFIED` | Contrato LAB não ligado ao handler; fluxo real continua separado | Integração/validação de segurança em ambiente autorizado, não neste documento |

## 8. Critérios de aceitação documental e continuidade

Documento aprovado para revisão **somente se**:
- descreve fonte versionada e diz que estado hospedado permanece desconhecido;
- mapeia as seis contagens sem renomeá-las nem tratar “recuperável” como consentimento;
- diferencia as colunas necessárias à semântica atual das irrelevantes para **report**;
- exige validação de ação antes de `inventory`;
- define autorização de staff/escopo e negação owner-only quando não houver prova;
- distingue janela observada de total completo, sem declarar que 5.000 é universo completo;
- trata erros/logs e grupos pequenos como questões de privacidade a comprovar;
- preserva `audit-backfill.run` independente e proibido sem Gate C;
- não propõe SQL, execução, instalação, CI manual ou deploy.

**Próximo trabalho técnico futuro (não autorizado por este documento):** implementar um agregador realmente minimizado e testes de semântica concorrente em laboratório PostgreSQL isolado, somente após autorização específica, identidade, PGDATA, baseline e isolamento físico comprovados. Até lá, manter Gate C NO-GO; C01–C10 NOT_RUN; N01–N09 locais NOT_RUN. Transcrição textual NEXA permanece visível apenas ao final. Prescrição segue independente.
