# NEXA — P0 rate limit transacional: implementação INERTE

## Revisão incremental de esquema
No banco hospedado, \`public.profiles\` contém \`id uuid\`, \`clinical_access\` e \`access_status\`, mas **não contém tenant_id ou associação tenant verificada**. \`public.consultation_history\` tem \`user_id uuid\` e \`encounter_id uuid\`. O projeto ainda não fornece origem confiável para tenant multiusuário. **Nenhuma vinculação foi inventada**, nenhum dado real foi consultado.

## O que foi implementado
- \`labs/nexa-quota/transactional-reservation.REVIEW-ONLY.sql\`: protótipo de schema privado, RLS, privilégios explícitos apenas para \`service_role\`, vínculo tenant↔usuário inativo por padrão, \`tenant_limits\` sem entradas pré-configuradas e \`reserve_radar_call\` com \`SECURITY INVOKER\`. A linha \`SELECT ... FOR UPDATE\` no limite do tenant serializa reservas de toda a organização; contadores por usuário, tenant e atendimento são calculados e escritos na **mesma transação**. Limite de tokens de entrada e saída e orçamento cumulativo reservado no atendimento; \`request_id\` idempotente; conferência de proprietário em \`consultation_history\`. Só devolve estado e razão, nunca dados clínicos.
- \`labs/nexa-quota/transaction-model.mjs\`: simulação isolada de serialização, concorrência e limites. **Não prova execução concorrente em PostgreSQL**.
- Testes sobre os contratos de privilégios, identidade, ausência de exposição pública e limite compartilhado sob concorrência sintética.

## NÃO ATIVAR
Código não importado pelo runtime Edge; SQL no laboratório, não em \`supabase/migrations\` e não executado no banco. Nenhum JWT, RLS, função Edge, configuração ou segredo foi alterado. Para ativar, criar fonte administrativa autoritativa de vinculação tenant, aprovação clínica e faturamento, validar auth.getUser(), configurar custos máximos por modelo e por atendimento, usar \`max_output_tokens\` no provedor, verificar migração/rollback/concorrência real em ambiente isolado, medir p50/p95 e casos de falha sem dados clínicos. Se a reserva falhar, **fallback local**, não uma chamada remota sem controle. Faturas oficiais continuam necessárias para afirmar economia.

O SQL é um **candidato a revisão**, não uma migração executável homologada. Não aplicá-lo automaticamente nem executar \`DROP TABLE\` em ambiente com registros sem aprovação explícita. Rollback futuro é desligar a chamada de quota via feature flag antes de alterar schema, preservar reservas para auditoria, comparar hashes e só então planejar remoção após retenção.
