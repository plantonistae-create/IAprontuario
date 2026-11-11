# NEXA Gate C — C01–C10 | execução única isolada (NOT_RUN)

**Origem:** PR #165, owner-only. **Não é checklist executado.** Não solicitar, copiar ou publicar schema-only privado.
**Sem chamadas pagas, pacientes reais, Supabase hospedado, CI hospedada com banco, alterações no macOS do proprietário sem autorização operacional local.**

## Pré-condições de STOP

- PostgreSQL descartável com TCP restrito a `127.0.0.1`, base nomeada `nexa_gate_c_lab_*`, sem rotas de saída externa, e usuário de LAB. Testar isolamento de rede fisicamente; conexão local bem-sucedida **não prova** egress negado.
- Usar somente schema local privado já revisado em arquivo do operador, **sem upload, log de DDL bruto ou impressão de dados**; aplicar em cópia descartável, nunca no projeto hospedado.
- DDL LAB em ordem: `gate-c-checkpoint-atomic.P0-CANDIDATE-NOT-APPLIED.sql` → `gate-c-evidence-materializer.P0-NOT-APPLIED.sql`. Primeiro validar compilação, grants, dependências, owner, possíveis políticas e search_path. **Se erro, STOP e registrar somente SQLSTATE/erro sanitizado.**
- Preparar apenas identidades sintéticas médico A, médico B, revisor R, consultas e consentimentos fictícios. Um provedor de eventos simulado de laboratório, executado com role local administrador, pode inserir **eventos explicitamente fictícios** em `private.nexa_gate_c_verified_source_events_lab`. Essa preparação não prova que o NEXA atual capta eventos reais. `service_role` LAB pode ler eventos, mas **não pode INSERT/UPDATE/DELETE nessa tabela**.
- O writer e o commit usam `p_actor` vindo de Auth.getUser() no adaptador simulado; o acesso direto de administrador ao banco não comprova a identidade do chamador na Edge.
- Documentar o digest `pg-jsonb-v1` como derivado do próprio PostgreSQL; **não** comparar diretamente a `syntheticSourceDigest` do Node.

## Uma matriz, sem repetir o que passou antes

| Caso | Execução local com dados fictícios | Resultado esperado |
|---|---|---|
| C01 | Fonte ausente; body clínico falso; pré-IA | STOP; zero escrita, zero desidentificação |
| C02 | Médico B vs consulta A; A inativo ou sem slot | STOP para origem/consentimento/revisão/commit |
| C03 | Sem tenant institucional; forged tenant ou auditSubmit no body | Não usar tenant; apenas A dono + slot/autorização real |
| C04 | `draft`, versão 0/fracionária/obsoleta; consulta posterior editada | STOP, não gerar recibo |
| C05 | Sem evento verificado; apenas checkbox/timestamp; escopo IA/auditoria incompleto; áudio/conflito pendente | STOP, nenhuma evidência positiva fictícia |
| C06 | Campo dinâmico, prescrição, plano, Radar, `processing_meta`, `protocol_usage`, adendo | digest abrange tudo; qualquer alteração pós-ACK bloqueia |
| C07 | **Duas sessões psql concorrentes** submetem mesmo `(encounter_id,final-v1)`; atrasos controlados | um INSERTED_PENDING e outro MATCHED_PENDING (ou conflito seguro), zero duplicação |
| C08 | **Revisor R concorrente** executa `submit_audit_review` enquanto A tenta commit pós-IA | terminal nunca sobrescrito; sem deadlock indefinido; rollback claro |
| C09 | Falha forçada após início da transação, sessão expirada, reenvio | rollback integral; recibo/rascunho preservados; sem retry pago |
| C10 | Casos já pending/approved/corrected/discarded, digest divergente, 409 | apenas igualdade atestada pode ser idempotente; reviewed/locked nunca resetado |

## Método de execução

1. Rodar `gate-c-local-preflight.P0.sh`; se falhar, não carregar DDL. `POSTGRES/PG* / SUPABASE*` de produção não devem estar no ambiente. Nenhum token ou dump em logs.
2. Compilar DDL LAB em transação na instância descartável; se houver diferença estrutural com o schema privado, **não** adaptar a produção. Modificar apenas LAB sob nova evidência.
3. Usar sessões independentes `psql` A, B, R (e uma de observação), com barreiras de concorrência determinísticas em C07/C08. Registrar SQLSTATE, contagem de `audit_cases` e bindings, `sync_version` anterior/posterior, `pending/terminal` e rollback; **nenhum conteúdo clínico**.
4. Validar que o evento consentimento precede a primeira operação de IA no roteiro novo; não inferir retrospectivamente a partir de `consent_recorded_at` legado. Se não houver evento, casos positivos permanecem bloqueados.
5. Ao terminar, destruir instância/perfil descartável conforme autorização humana local e manter relatório sanitizado: SHA da PR, scripts executados, C01–C10 PASS/FAIL/NOT_RUN e bloqueios. Sem prints do schema-only.
6. A aprovação do laboratório **não** autoriza deploy, mudança de RLS/ACL/guard, reset locked ou fluxo de produção.

**Bloqueio ainda aberto:** não existe no código atual um produtor real de `verified_source_events_lab`. O materializador não cria eventos nem aceita o checkbox como evidência. A UI/Edge precisarão, numa etapa futura separada, capturar ação explícita autenticada de consentimento **antes do processamento externo** e confirmação final da revisão médica **após ACK servidor da versão exibida**.
