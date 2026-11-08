# G3 — quota real no PostgreSQL descartável (sem produção)

Adicionado um workflow separado em `.github/workflows/nexa-quota-postgres-offline.yml`, com PostgreSQL 16 **em container efêmero do GitHub Actions**, sem conexão com Supabase hosted, JWT, contas, segredos de produção ou OpenAI. O banco tem nome fixo `nexa_quota_lab` e senha fictícia exclusiva deste teste.

`postgres-fixture.LAB-ONLY.sql` cria papéis simplificados e tabelas fictícias; `postgres-seed.LAB-ONLY.sql` usa apenas UUIDs arbitrários. O workflow carrega o candidato `transactional-reservation.REVIEW-ONLY.sql` somente nesse banco. O teste Node bloqueia execução quando PGHOST não é localhost ou o banco não se chama `nexa_quota_lab`. Nenhum componente do NEXA importa o SQL.

**Gates reais:** negação a `anon`/`authenticated`, falha segura em tenant ou atendimento desconhecido, ausência de acesso clínico, teto de tokens, idempotência, 24 transações concorrentes entre dois usuários sob teto agregado 5, isolamento entre dois tenants e `ROLLBACK` transacional. Os testes modelam papeis Supabase, mas não provam autenticação/JWT real nem posse de usuário em produção.

**Ainda bloqueado:** vínculo tenant fornecido pela autoridade administrativa, verificação no Edge de `auth.getUser()`, autorização do uso de `service_role` apenas backend, controle de modelos e preços, tempo de retenção das reservas, adversários com condições de corrida e ensaio de failover. Não ativar SQL ou limites hosted automaticamente. Quota falha => fallback local e bloqueio da chamada remota.

**Rollback:** GitHub Actions é descartável; na publicação apenas documentação/testes do repo mudam. A função hospedada não é tocada.