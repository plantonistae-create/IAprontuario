# NEXA S6.4 · homologação focal

Base exata: c53c37eca6a7025fbfc7c3c8079df04e90b60d61, branch review/nexa-s64-integration-candidate. Evidências publicadas somente na branch review/nexa-s64-focal-verification. Referência: [contrato S6.4](NEXA_S64_INTEGRATION_CANDIDATE.REVIEW-ONLY.md).

## Resultado observado

| Prova | Resultado |
|---|---|
| PostgreSQL | 9 PASS, 0 FAIL, 0 SKIP. PostgreSQL 16.15, SCRAM, socket Unix 0700 e zero descritores IPv4/IPv6 no postmaster. TCP e UDP IPv4/IPv6 negados com EPERM no Node e no processo filho. Cluster e socket removidos. |
| Aquisição versus verificação | Aquisição sem EXECUTE de entrega ou ingestão. A chamada real de commit foi negada pelo PostgreSQL. O verificador não tem EXECUTE de aquisição. O verificador B não pode liberar material roteado para A. |
| Processos e credenciais | O processo Node de aquisição 2504 entrou como s63_a no backend 2508. O processo Node verificador 2509 entrou como s64_va no backend 2513. Cada filho recebeu apenas a senha do próprio login. A tentativa de usar essa senha no login contraparte recebeu rejeição de autenticação. A inspeção de membership não encontrou a role oposta. |
| Família e concorrência | O mesmo grupo sintético não cruza avaliação/treinamento em datasets, encontros e donos diferentes da mesma família. Uma de duas liberações concorrentes em conflito foi registrada. Famílias distintas mantiveram atribuições distintas. Dataset sem registro e reatribuição de família foram recusados. |
| Prova, prazo e head | Assinatura adulterada recusada. O SQL recusou prazo nulo, ambos os infinitos, prazo expirado e prazo além de 15 segundos. O caso positivo com a prova válida passou. |
| Política de áudio | 13 PASS, 0 FAIL, 0 SKIP em Node v24.22.3. Os casos usam evidências sintéticas já classificadas, sem gravação real, I/O ou prova clínica de desidentificação. |

As suítes de S6.1–S6.3 não foram repetidas.

## Dois defeitos reproduzidos e corrigidos

1. O PostgreSQL retornava true e registrava uma entrega quando o verificador mapeado enviava expected_head nulo. O teste falhou antes da correção. A comparação IS DISTINCT FROM recusa head ausente ou diferente, e a regressão confirmou zero entregas com head nulo antes de aceitar a prova válida.
2. A projeção de preservação marcava como local_verified um áudio local finalizado, com integridade verificada, mas sem manifesto válido. A correção mantém os bytes recuperáveis, classifica a gravação como local_partial e preserva a negação de purga. A regressão cobre manifesto ausente e inválido.

## Fronteira de confiança

A separação observada é de processos Node, logins SCRAM e privilégios SQL. O bootstrap de teste conhece as credenciais sintéticas, mantém a chave efêmera de assinatura e define a chave pública aceita pelo verificador. Os filhos e o bootstrap compartilham o usuário do sistema. O PostgreSQL revalida head, grants, rotas, prazo e família, mas confia no verificador para a validação Ed25519. O ensaio não demonstra custódia independente no sistema operacional nem autenticação independente da origem pelo assinador. Um verificador comprometido continua dentro da fronteira confiável. Essas lacunas bloqueiam uso real do pipeline de exportação.

## Reprodução

    /bin/bash tests/security/run-nexa-s64-isolated.lab.sh
    node --test tests/nexa-s64-audio-policy.lab.test.mjs

Em macOS com Node 24 e PostgreSQL 16 Homebrew, o primeiro comando cria um único cluster descartável e exige os canários e socket privado. O segundo executa a política pura com fixtures. A instalação não depende de instâncias Supabase ou KMS.

## Decisão S6 e preparação S7

Encerrar S6 como homologação focal sintética. Gate C permanece NO-GO 0/19. C01–C10 e N01–N09 NOT_RUN. Sem alterações em produção, M1–M4, flags, segredos ou dados reais. Sem merge, deploy, backup, piloto, retenção ou exportação real.

A preparação do S7 pode avançar de forma independente e com fixtures em dispositivos reais. Priorizar a preservação local do áudio original por proprietário, com prova de gravação interrompida, recarga, segunda consulta, troca de usuário e recuperação do prefixo verificado sem marcar o parcial como completo. Verificar repetição idempotente e manter o áudio local. Backup remoto, custódia, região, piloto clínico, retenção e usos de treinamento requerem seus próprios gates e autorização separada. A preparação não depende de ativar exportação Core.
