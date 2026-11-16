# NEXA Gate C — executor local com bloqueio de privilégios (CANDIDATO NÃO EXECUTADO)

Status em 14/11/2026: **DRAFT ISOLADA · NÃO EXECUTADO · NO-GO · C01–C10/N01–N09 NOT_RUN**.
A entrega NÃO é um executor completo e aprovado dos 19 casos. É o menor avanço de código seguro que pode ser feito sem o schema-only privado, sem executar PostgreSQL e sem conceder permissões artificiais.

## Fontes exatas (não modificar originais)

- PR #165, HEAD 994e172a1042a5fa8d9e319aa5868f5db5976ac7: SQLs candidatos e roteiro C01–C10.
- PR #167, HEAD 944e777405483e9bed3188205b3918959edce85b: produtor de eventos sintético sem persistência autoritativa implementada.
- PR #175, HEAD 160315a6fbf2aaccc0f844ae064c273f347203ff: revisão de mediação de privilégios mínimos; NÃO é script executável.
- PR #176, HEAD 24abb75e31912246d0b0bc80d5b11c4b44c3bf94: migração REVIEW_ONLY de nove SECURITY DEFINER públicos; funções exigem owner NOLOGIN sujeito a RLS. NÃO aplicar.
- Cluster já preparado pelo operador: ~/.nexa-v321-pg16.wsWTxmon, PostgreSQL 16.15. O isolamento externo continua NOT_PROVEN.

## O que o novo código faz

**gate-c-direct-grants-seal.P0-NOT-APPLIED.sql**
- Dentro de uma transação, exige banco nexa_gate_c_lab_*, conexão Unix socket, instalador restrito nexa_gc_install_lab autenticado diretamente e todos os objetos/roles LAB preexistentes.
- Revoga os GRANT diretos originais em cinco tabelas privadas e três funções candidatas para PUBLIC, anon, authenticated e service_role, no LAB apenas.
- Examina privilégios EFETIVOS: owner, membership, superuser/BYPASSRLS, leitura/escrita e EXECUTE. Qualquer privilégio remanescente resulta em exceção, revertendo a transação inteira.
- Não cria roles, não cria tabela, não atribui EXECUTE a mediadores e não altera os SQLs originais. Pode parar deliberadamente se service_role local tiver BYPASSRLS. A negação de acesso é esperada, NÃO um teste positivo C01–C10.
- Sem executor mediado aprovado, as funções SECURITY INVOKER originais continuarão inutilizáveis para consumidores; isso é intencional.

**gate-c-offline-executor.P0-NOT-RUN.mjs**
- --inventory: verifica localmente cluster e hashes dos arquivos públicos exatos de #165/#167/#175/#176 e hash SHA-256 de schema-only privado, sem imprimir DDL/dados.
- --catalog: exige evidência externa revisada de isolamento, verifica postmaster.pid e conecta APENAS via socket Unix privado. Consulta somente metadados do banco (transação READ ONLY), testa identidade do servidor e negação EFETIVA dos acessos diretos. Não declara prova de isolamento.
- --cases: exige roteiro SQL de C01–C10, com arquivos privados individualmente revisados e SHA-256 fixado. Executa dois processos psql concorrentes em C07 e C08, com papéis A/B/revisor restritos; exige barreiras de concorrência implementadas nos próprios roteiros. Captura somente códigos de saída e SQLSTATE, nunca imprime conteúdo.
- Resultado dos casos, mesmo executados: EXECUTED_UNADJUDICATED. PASS exige avaliação independente de invariantes de banco, versão, exclusividade, rollback e ordem de locks. N01–N09 permanecem NOT_RUN.
- NÃO inicia servidor, não cria bancos, não carrega schemas, não aplica o seal automaticamente, não faz chamadas de IA nem usa redes remotas.

## BLOQUEIOS REAIS — STOP antes da sessão SQL

1. O schema-only privado foi previamente exportado, mas sua presença/integridade no Mac NÃO foi demonstrada nesta rodada. Ele jamais deve entrar no GitHub, chat ou logs.
2. Os SQLs da #165 têm GRANTs diretos a service_role; o arquivo seal novo ainda NÃO foi executado ou aprovado como migração. Falta identidade restrita de instalador e mediação autenticada de menor privilégio, com RLS efetiva, sem uso de service_role para forjar identidade.
3. O cluster usa peer local. A/B/revisor com identidade DB independente não foram provisionados; não tratar SET ROLE, argumentos p_actor ou mesmo usuário macOS como prova de Auth.getUser().
4. Não existem na fonte analisada dez roteiros SQL aprovados com assertivas de banco e barreiras concretas para C01–C10. A tabela existente é especificação textual. --cases recusa a ausência deles. Não escrever fixtures positivas sem schema confiável.
5. N01–N09 são citados como NOT_RUN no corpo da #176, mas definições executáveis desses nove casos NÃO foram encontradas nos arquivos inspecionados de #165/#167/#175/#176. Não inventar critérios, contagens ou PASS.
6. O isolamento independente do Mac não foi comprovado; assinatura/arquivo de evidência revisado pelo operador é exigido. O executor NÃO verifica sozinho a verdade física dessa evidência.
7. O candidato #176 mantém bloqueio explícito de ACK final e writer pré-egress desligado. Nenhum resultado desta Draft libera IA externa, auditoria ou produção.
8. O preflight anterior da #165 usa TCP 127.0.0.1: INCOMPATÍVEL com este cluster socket-only. Não reutilizá-lo.

## Contrato dos cenários existentes — todos NOT_RUN

| ID | Condição do documento da #165 | Prova necessária |
| --- | --- | --- |
| C01 | Fonte ausente / body clínico forjado | Negação sem escrita |
| C02 | Médico B / acesso ou slot inválido | Propriedade/slot e negação |
| C03 | Tenant forjado no corpo | Owner-only sem tenant inventado |
| C04 | Draft, versão obsoleta/fracionária | Negação sem recibo |
| C05 | Consentimento/ACK ausente ou pendências | Nenhuma prova positiva fabricada |
| C06 | Alteração de campos clínicos/dinâmicos | Digest e imutabilidade |
| C07 | Duas submissões A/B simultâneas | Chave única e idempotência real |
| C08 | Revisor concorrendo com commit | Ordem de locks, terminal imutável |
| C09 | Falha transacional e reenvio | Rollback atômico, zero retry pago |
| C10 | Estados terminal/pending e digest divergente | Nunca resetar locked/reviewed |

O executor exige nos casos C07 e C08 barreira revisada de banco, mas o campo de manifesto, sozinho, não é prova de sincronização determinística.

## Manifesto PRIVADO futuro (exemplo de formato, NÃO preencher com dados reais)

O manifesto deve ser arquivo local 0600, de propriedade do operador, com caminhos absolutos; o conteúdo do schema-only nunca é publicado:

    {
      "clusterId": ".nexa-v321-pg16.wsWTxmon",
      "database": "nexa_gate_c_lab_exemplo",
      "port": 65439,
      "psqlPath": "/CAMINHO/LOCAL/psql",
      "schemaOnly": {
        "path": "/CAMINHO/PRIVADO/schema-only.sql",
        "sha256": "SHA256_DE_64_HEX_DIGITOS"
      },
      "candidate176": {
        "path": "/CAMINHO/LOCAL/20261114190000_nexa_p0_source_action_writer_REVIEW_ONLY.sql"
      },
      "isolationEvidence": {
        "path": "/CAMINHO/PRIVADO/evidencia-revisada",
        "sha256": "SHA256_DE_64_HEX_DIGITOS",
        "reviewed": false
      },
      "caseSuiteApproval": "PENDENTE",
      "actorIsolationApproval": "PENDENTE",
      "cases": {}
    }

O inventário pode rodar sem evidência de isolamento; os modos que acessam PostgreSQL exigem avaliação externa explícita e arquivo de evidência com hash. Uma autodeclaração no manifesto NÃO constitui comprovação independente. Nenhuma execução está autorizada neste commit.

## Uma futura sessão, SOMENTE após autorização separada

1. **ONLINE:** obter materiais exatos pinados localmente, schema-only privado validado, scripts SQL de casos revisados, atores independentes e mediador aprovado. Se faltar algum, STOP ANTES DE DESLIGAR O WI-FI.
2. **🔧 OFFLINE OBRIGATÓRIO:** no menu superior do macOS, DESLIGAR WI-FI; confirmar Wi-Fi desativado; desconectar Ethernet e hotspot. Evidência independente de ausência de vias externas é necessária; desconectar sozinho não é prova.
3. **STOP se isolamento NOT_PROVEN.** Caso contrário, com autorização física separada, usar somente ~/.nexa-v321-pg16.wsWTxmon, socket privado, TCP desativado, base descartável e nenhum segredo hospedado.
4. Aplicar apenas um schema privado fiel e SQLs LAB aprovados, após inspeção de dependências. Executar o seal sob conta installer restrita, validar negação, configurar mediação revisada e atores independentes; se qualquer direito efetivo permanecer, STOP.
5. Rodar executor local com modo --catalog e, somente com todos os roteiros aprovados, --cases. Não inferir PASS de exit code ou de mocks; conciliação final exige observações de banco e SQLSTATE sanitizados.
6. Parar somente o servidor descartável e preservar os arquivos para análise, sem remoção automática.

**Não executar nesta rodada:** nenhum SQL, serviço, sessão, envio, instalação, CI, merge/deploy ou alteração de produção.

## Resultado desta Draft

- Código LAB novo: sim.
- Revisão estática de fontes e parser JS: possível sem PostgreSQL.
- SQL PostgreSQL executado: NÃO.
- Compilação do seal no PostgreSQL: NÃO COMPROVADA.
- C01–C10: NOT_RUN.
- N01–N09: NOT_RUN, sem definição executável verificada.
- Privilégios mínimos de produção: NOT_PROVEN.
- Gate C: NO-GO 0/19.
