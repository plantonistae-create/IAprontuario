# NEXA S6 · checkpoint para ChatGPT

Base exata: 6394e561b0032c6a2784ee9515f54f801c69f816. Branch local: local/nexa-s6. O relato de entrada registra M4 20261127210800 com POST 131 PASS e CI #46016781657 com 47 PASS e Chromium aprovado. A S6 manteve produção e GitHub sem escrita e não reexecutou esse lote.

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

## Planejador

A prova usa payload::text da captura PostgreSQL, o digest do payload e a cadeia vinculada ao dono e atendimento. O chamador offline precisa fornecer um snapshot e uma atestação de fonte confiável. As respostas legadas de read_chain/verify_chain sozinhas ficam inelegíveis porque não fornecem esse conjunto de prova. Nenhum export foi ativado. A integração de aquisição dessa prova e de direitos revogáveis continua pendente de aprovação.

O planejador bloqueia identificadores internos no material exportável, separa finalidade de avaliação e treinamento e deixa registros com proveniência conflitante ou incompleta fora do treinamento. A captura agora preserva 'unreported' quando o provedor não informa model_version.

## Reprodução

- Node:  node --test tests/nexa-core-capture-eligibility.V523.test.mjs tests/nexa-s6-core-export.offline.test.mjs tests/nexa-inline-syntax.test.mjs
- WebKit: carregar tests/helpers/s6-loopback-browser.cjs com node --require. Usar NEXA_BROWSER=webkit nos testes de histórico e conflito e passar o argumento webkit aos testes de cofre, recuperação multidispositivo e interrupção. O teste tests/nexa-s6-webkit-sync.e2e.cjs seleciona WebKit diretamente. NEXA_PLAYWRIGHT_MODULE aceita a instalação local de Playwright que corresponde aos binários existentes.
- SQL M4: python3 tests/security/run-nexa-s6-m4.lab.py <schema-only privado autorizado>. O runner valida hashes, sobe um cluster com socket Unix e SCRAM, comprova zero descritores IPv4/IPv6 e encerra e remove somente o laboratório que criou.

Gate C NO-GO 0/19. C01–C10 e N01–N09 NOT_RUN. Backup, piloto e retenção operacionais não foram ativados.
