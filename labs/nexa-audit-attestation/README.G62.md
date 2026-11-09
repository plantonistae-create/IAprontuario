# NEXA G62 — Semântica parcial dos módulos e captura clínica sintética (OFFLINE)

**Base pinada:** `main 064757d2a39ad4c04c60b0034a8b35756b8eb089`. Revisão somente na PR Draft #163, base isolada `review/g59-offline-only-20261109`. Não alterar `nexa-audit-outbox-v18.9.19.js`, produção, Supabase, estado de paciente ou PRs clínicas #158–#161.

## Achados efetivos do código em 32 módulos carregados

`runtime-semantics.G62-LAB-ONLY.mjs` contém um registro individual dos **32 módulos**, com tipo de impacto, observação clínica/operacional e marcador concreto da função/atribuição que foi encontrado no arquivo correspondente. O SHA de todos os arquivos permanece fixado pelo inventário G61.

| Grupo | Evidência específica, sem afirmar prova exaustiva |
|---|---|
| Alteração clínica e conflito | `nexa-encounter-conflicts-v18.10.2.js` chama `reconcileFields`; `nexa-summary-state-guard-v18.9.10.js` e `nexa-conduct-state-guard-v18.9.13.js` restauram campos; `nexa-sic-documentation-rule-v18.9.8.js` normaliza documentação |
| Protocolos/prescrição | `nexa-protocol-library-v18.10.1.js` chama `nexaInsertProtocolPrescription18101`; esse efeito precisa entrar no mesmo checkpoint antes da auditoria |
| Auditoria e histórico | `nexa-auditor-exact-v18.9.js` lê `physician_final.fields`, `reviewed_fields` e revisões; `nexa-core-audit-learning-v2.js` gera editores de campos; `nexa-history-style-audit-v18.9.7.js` possui gravação, recuperação e submissão de campos; `nexa-record-draft-history-v18.6.6.js` lê `field.dataset.key` |
| Autenticação e controles | `nexa-auth-session-v1.js` gerencia sessão efêmera/persistente; guards de auditoria/admin/protocolo controlam acesso e algumas chamadas de rede |
| Radar | Módulos de visualização/foco/PS/estado leem o Radar e suas pendências; mudanças de perguntas/estado podem afetar o conteúdo clínico, embora parte dos módulos seja predominantemente visual |
| Consentimento e workflow | `nexa-final-ui-v18.js`, `nexa-hotfix-v1.js` e `nexa-recorder-layout-v18.12.4.js` movem/ajustam controles de consentimento, gravação ou reset; `nexa-mobile-shell-v18.6.7.js` altera a navegação |
| Recuperação | `nexa-history-recovery-v1.js` e outros módulos de histórico acessam campos guardados e reabrem atendimentos; não inferir que estejam refletidos na versão auditada |
| Aparência e utilidades | Demais módulos de layout/tema/password/ações visuais foram classificados individualmente no registro; a classe visual não equivale a ausência absoluta de efeito clínico |

O registro comprova que um marcador/trecho selecionado está presente em cada versão fixada; **não** é análise de todas as chamadas, efeitos assíncronos, dados emitidos pelo servidor, eventos globais ou caminhos entre módulos. O status de cobertura semântica **continua BLOCKED**.

## Contrato sintético de captura integral — proposta estrita, não integração real

`clinical-capture.G62-LAB-ONLY.mjs` aceita uma fixture que exige:
- Os **12 campos base** do formulário, sem qualquer campo ausente, mais `exames_sugeridos` e `prescricao` explicitamente capturados.
- `domFields` pode conter somente nomes conhecidos e **seus valores devem corresponder** aos mesmos campos do bridge; não substitui divergências silenciosamente.
- `conduta` da fonte extra deve corresponder ao bridge e o checkbox `_include_hipotese` deve ser preservado em `supplemental_clinical_data.includeHypothesis`.
- As 12 seções do envelope G60 passam por schema sintético completo com tipos e chaves **exatamente enumeradas**, inclusive estruturas internas e listas. Campos extras no Radar, medicações, hipótese, plano, consentimento, metadados, transcrição, protocolos, auditoria e destino levam a STOP.
- A transcrição final só é aceita após estado `processed`, descarte do áudio sintético e indicação de exibição final. Nenhum controle da interface foi modificado.
- Falta de consentimento ou estado de auditoria revisada bloqueia. Toda saída, inclusive positiva, mantém `resetAuthorized:false` e `realSourceCoverage:false`.

**Limitação principal:** os esquemas do capturador são **exemplos sintéticos**. O NEXA real possui objetos dinâmicos (`window.nexaClinicalBridge18101.meta()`, `processingMeta()`, `window.nexaRadar.snapshot()`, histórico, auditoria) e formatos do backend que ainda não foram ligados um a um ao manifesto. Portanto, um teste positivo prova a validação *da fixture declarada*, não a cobertura de dados de um atendimento.

## Gates futuros / STOP

1. Identificar todas as mutações de estado clínico nos módulos e chamadas do backend de modo mecanicamente verificável, não apenas por marcador.
2. Instrumentar um navegador descartável offline com fixtures para listar campos, listeners, metadados e eventos enquanto o clínico edita, revisa e encerra, sem exibir transcrição antes do fim.
3. Fazer reconciliação formal de esquema/versão entre captura local, checkpoint, revisão do médico, consentimento, adendo, outbox, servidor e comprovante com transação persistente.
4. Qualquer campo/estado não catalogado precisa gerar STOP, nunca ser omitido do fingerprint ou permitir limpar consulta.
5. Não expor dados clínicos reais, identificadores ou digests em CI e Issues.

**Decisão:** PASS apenas para invariantes offline sobre dados fictícios e integridade de fontes pinadas. BLOCKED para equivalência real ou rastreabilidade autoritativa. **STOP** para alterar o guard, reset pós-`locked`, merge ou deploy.

## CI

O único job `g59-synthetic-offline` executa `node --check` e `node --test` nos arquivos G59/G60/G61/G62. Não executa staging, browser com rede, SQL, AI API nem instalação de dependências.
