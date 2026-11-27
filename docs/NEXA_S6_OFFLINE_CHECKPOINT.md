# NEXA S6 · checkpoint para ChatGPT

Base exata: 6394e561b0032c6a2784ee9515f54f801c69f816. Branch de revisão: review/nexa-s6-offline-hardening. Commits preservados: dce8e64 (WebKit), 3994589 (exportação) e 79d3908 (candidato M4 e evidência). O relato de entrada registra M4 20261127210800 com POST 131 PASS e CI #46016781657 com 47 PASS e Chromium aprovado. A homologação S6 foi local. A transferência publica somente a branch de revisão e não reexecuta esse lote.

## Resultados focais

| Prova | Resultado e alcance |
|---|---|
| WebKit 26.5 / Playwright 1.62.1, recuperação multidispositivo | PASS. Um segundo contexto vazio recebeu texto e áudio sintéticos do fixture. Os bytes enviados à transcrição simulada coincidiram. O médico fictício B ficou sem a oferta de A. |
| Cofre no WebKit | 7 PASS. IndexedDB e WebCrypto reais, bytes fictícios, interrupção de append, adulteração, lacuna, cota simulada, replay e troca de proprietário. |
| Interrupção no app | PASS. Fechamento abrupto da aba e reabertura do atendimento vinculado ao mesmo dono, com áudio marcado parcial. Microfone sintético. |
| Histórico e resolução de conflito | PASS nas duas larguras do histórico e no fluxo de revisão de conflitos. Preservação da cópia e da revisão local, CAS, arquivamento, adiamento e recarga. |
| Transporte WebKit | 3 PASS. Socket HTTP de loopback encerrado, reconexão com somente uma inserção e CAS entre dois contextos com preservação do rascunho perdedor. |
| V5.23/V5.31 | 6/6 novas regressões falharam na base e passaram com o patch. Mais 5 contratos do planejador e 1 de sintaxe inline passaram. O canário Node recebeu EPERM sob a política de negação de rede. |
| M4 administrativa, PostgreSQL 16.15 | Na versão pinada, o administrador sintético com access_status 'disabled' ainda recebeu o resumo. O candidato local passou 7/7 verificações. |

A emulação offline nativa do WebKit interfere no I/O de Blob. A prova de transporte usa encerramento real do socket de loopback, enquanto o ensaio do cofre verifica o comportamento local do IndexedDB. A aprovação de navegador refere-se ao WebKit em macOS com fixtures, sem homologação física móvel ou backend hospedado.

## M4

O SHA-256 do SQL original coincide com o manifesto V5.33. O laboratório usou somente a definição de get_my_capabilities() do schema-only autorizado e confirmou o MD5 do runbook, 3e618471f2fd45089768c0bbe43ab4f4. O restante foi montado com DDL e registros fictícios. A identidade da conta foi simulada no limite da role authenticated, sem JWT real. O 42501 na base foi emitido pela asserção do teste, após detectar o retorno indevido.

O candidato S6 exige is_admin e access_status 'active'. A role authenticated mantém o grant existente. Contas desativadas, pendentes, sem status ou perfil e contas ativas sem papel administrativo não recebem agregados. O administrador ativo passa mesmo sem slot clínico. Os grants de anon e service_role continuam negados. A M4 instalada e seus arquivos pinados não foram alterados. Prioridade da próxima revisão: decidir se a correção da M4 deve receber autorização separada de aplicação.

### Artefatos para revisão

| Artefato | SHA-256 |
|---|---|
| [Candidato M4 corrigido](../supabase/proposals/V533/M4-active-admin.S6.REVIEW-ONLY.sql) | 80c0db73164c307cb9d8202e9058740453fb457593ab9bd14b687da447632ee8 |
| [Rollback específico, não destrutivo](../supabase/proposals/V533/rollback.M4-active-admin.S6.NON-DESTRUCTIVE.sql) | 0713b1da3aa9eb2329f26aae7ddcd0ba6e1d1c28c097d2c1b34c2f457f23de46 |
| [Verificador S6 somente leitura](../supabase/ops/V533/sql/post-apply-verify.M4-active-admin.S6.READ-ONLY.sql) | f217d971c9b8e40a78ee243d1aae75fdf899b01dffdc85e1b413c184e40ca2f7 |

O verificador S6 valida somente a M4 corrigida. Checa o MD5 do corpo efetivo, 65be9e2537cd9e0f3ea5255dbc752b8d, os atributos da função, a definição da dependência, o proprietário e os privilégios de execução. O verificador histórico V5.34 mantém o hash da M4 original. Seu P07 da M4 continua sendo a referência anterior à correção. Após eventual aplicação autorizada, use o P99 do verificador S6 para essa função.

O rollback revoga EXECUTE da única RPC da M4 para PUBLIC, anon, authenticated e service_role. Preserva a definição endurecida, o proprietário, as tabelas, os dados e as flags. Não restaura a definição antiga. Após o rollback, P01, P02, P03 e P05 do verificador S6 devem continuar PASS. P04 e P99 devem indicar FAIL porque a RPC foi intencionalmente fechada para authenticated.

Somente os artefatos novos foram validados no PostgreSQL descartável. O verificador reprovou a ausência da função e a versão original, aprovou o candidato corrigido e detectou o fechamento após o rollback. Duas execuções do rollback mantiveram a definição, o proprietário e a contagem sintética de registros. EXECUTE efetivo ficou negado a authenticated, anon e service_role. O laboratório foi removido. Os testes S6 já aprovados não foram reexecutados.

## Planejador

A prova usa payload::text da captura PostgreSQL, o digest do payload e a cadeia vinculada ao dono e atendimento. O chamador offline precisa fornecer um snapshot e uma atestação de fonte confiável. As respostas legadas de read_chain/verify_chain sozinhas ficam inelegíveis porque não fornecem esse conjunto de prova. Nenhum export foi ativado. A integração de aquisição dessa prova e de direitos revogáveis continua pendente de aprovação.

O planejador bloqueia identificadores internos no material exportável, separa finalidade de avaliação e treinamento e deixa registros com proveniência conflitante ou incompleta fora do treinamento. A captura agora preserva 'unreported' quando o provedor não informa model_version.

## Reprodução

- Node:  node --test tests/nexa-core-capture-eligibility.V523.test.mjs tests/nexa-s6-core-export.offline.test.mjs tests/nexa-inline-syntax.test.mjs
- WebKit: carregar tests/helpers/s6-loopback-browser.cjs com node --require. Usar NEXA_BROWSER=webkit nos testes de histórico e conflito e passar o argumento webkit aos testes de cofre, recuperação multidispositivo e interrupção. O teste tests/nexa-s6-webkit-sync.e2e.cjs seleciona WebKit diretamente. NEXA_PLAYWRIGHT_MODULE aceita a instalação local de Playwright que corresponde aos binários existentes.
- SQL M4: python3 tests/security/run-nexa-s6-m4.lab.py <schema-only privado autorizado>. O runner valida hashes, sobe um cluster com socket Unix e SCRAM, comprova zero descritores IPv4/IPv6 e encerra e remove somente o laboratório que criou.

Gate C NO-GO 0/19. C01–C10 e N01–N09 NOT_RUN. Backup, piloto e retenção operacionais não foram ativados.
