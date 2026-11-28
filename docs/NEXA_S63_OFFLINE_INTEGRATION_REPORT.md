# NEXA S6.3 · aquisição e exportação sintética no laboratório

Base exata: d0bfbf2d39f3b0908ca6e9f546e7a1bb4aca203c, branch review/nexa-s62-canonical-contract. Candidato de revisão: review/nexa-s63-integrated-offline. Gate C NO-GO 0/19. C01–C10 e N01–N09 NOT_RUN.

## Implementação

- [PostgreSQL isolado](../labs/nexa-s63/schema.LAB-ONLY.sql) usa uma consulta STABLE e um snapshot MVCC para a cadeia limitada, o head, o grant e os derivados. O worker passa o identificador da solicitação. A origem autorizada resolve proprietário, atendimento, tarefa, finalidade, modalidade e política. A cadeia usa o payload::text do PostgreSQL e preserva escala decimal, genesis, parentesco e os digests M2.
- [Prova criptográfica](../labs/nexa-s63/proof.LAB-ONLY.mjs) usa Ed25519 efêmero com chave pública fixada pelo hash do SPKI. O envelope usa uma tupla JSON UTF-8 com ordem, versão e domínio fixos. Cobre emissor, audiência, ambiente, escopo, quantidade, head, digest do snapshot, tempos e nonce. Chaves privadas ficam em memória. A prova expira em 15 segundos. O registro de chaves no banco e a lista de confiança do verificador podem recusar chaves revogadas. A chave do backup não participa.
- Direitos têm a tupla exata do contrato, revisão inicial 1, base, autor, revisor independente, prazo finito e eventos. Revogar grava revisão 2 e marca entregas afetadas. O LAB não renova automaticamente uma concessão revogada. Owner NOLOGIN/NOBYPASSRLS e FORCE RLS nas onze tabelas. A e B usam logins SCRAM distintos. Workers só têm EXECUTE nos caminhos protegidos. As roles anon, authenticated e service_role não alcançam os dados nem a aquisição.
- [Exportador sintético](../labs/nexa-s63/export.LAB-ONLY.mjs) aceita somente derivados revisados vinculados ao digest do registro, à solicitação e à versão da transformação. Valida a forma por tarefa, exige a proveniência sintética por registro e bloqueia identificadores internos e padrões sensíveis. A saída contém dados derivados e pseudônimos HMAC separados por dataset. IDs internos, cadeia original e digests da fonte ficam no inventário protegido.
- O commit de entrega revalida head, chave, expiração, grant e revisão, derivados, agrupamento protegido e nonce. Ele serializa com mudança de head e revogação. O ensaio emite seis manifests em memória, um por tarefa e finalidade. O digest da entrega vincula metadados e SHA-256 do JSONL. O recheck de ingestão bloqueia conteúdo trocado e novas autorizações após revogação. Nenhum dataset foi escrito, transmitido ou ingerido para treinamento. Modalidade áudio não é exportável neste LAB.

## Evidências

| Prova | Resultado |
|---|---|
| PostgreSQL 16.15, socket Unix 0700 | PASS. SCRAM local e zero descritores IPv4/IPv6 do postmaster. |
| Isolamento IP | PASS. TCP e UDP IPv4/IPv6 receberam EPERM no Node e no filho. A política permite apenas sockets Unix do diretório efêmero do LAB. |
| Seis manifests e leitura da cadeia | PASS. ASR, documentação e Radar × avaliação/treinamento. Escala decimal preservada. IDs e digests internos ausentes da saída. |
| Assinatura, audiência, escopo, nonce, adulteração e prazo | PASS. Recusa de prova e snapshot trocados, assinatura inválida e expiração. |
| ACL e isolamento A/B | PASS. Sem leitura da fonte por outro dono, acesso direto a tabelas ou autoconcessão. |
| Revogação concorrente e head concorrente | PASS. Espera no lock observada no PostgreSQL e liberação obsoleta negada. |
| Entregas concorrentes | PASS. Quatro tentativas no mesmo nonce resultaram em uma entrega. Bloqueio posterior registrado no inventário. |
| Proveniência, desidentificação, modalidade e divisão por paciente | PASS. Recusa de fonte externa, derivado ausente ou inseguro, áudio e mistura treino/avaliação do mesmo grupo. |
| Prazo finito e sinais Radar escalares | Duas regressões falharam antes da correção e passaram depois. |
| Suite nova | 12 PASS, 0 FAIL, 0 SKIP em Node 24.22.3. Cluster e sockets removidos. |

As 28 verificações S6.2 anteriores não foram reexecutadas.

## Reprodução

Em macOS, com Node 24 e PostgreSQL 16 Homebrew disponíveis:

    /bin/bash tests/security/run-nexa-s63-isolated.lab.sh

Use NEXA_S63_NODE com caminho absoluto se o Node não estiver no PATH. O runner cria somente um PostgreSQL descartável, usa socket privado e remove os recursos criados. O código de fixture, a suíte e o cluster não precisam de serviços remotos.

## Limites e próxima revisão

O worker e o executor PostgreSQL fazem parte da fronteira confiável do LAB. O banco revalida estado, escopo, ACL e locks. A verificação Ed25519 ocorre no worker. O schema não expõe RPC de entrega para clientes. Autores, revisores, agrupamento de pacientes e transformação são fixtures. A revisão vinculada e a varredura são complementares e não demonstram anonimização clínica ou direitos reais. Revogação posterior bloqueia novo uso e registra impacto. Ela não desfaz uso anterior.

Nenhuma mudança em M1–M4, produção, segredos, flags, backup, piloto ou retenção. Antes de qualquer uso real, revisar a fronteira do worker, aquisição autorizada e custódia definitiva, a origem dos direitos e o processo de desidentificação. Candidato para revisão, sem autorização de merge, deploy ou exportação clínica.
