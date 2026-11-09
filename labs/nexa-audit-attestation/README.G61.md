# NEXA G61 — Inventário de proveniência clínica (LAB-ONLY)

**Estado final esperado:** mesmo que todos os testes locais sejam aprovados, a cobertura clínica autoritativa permanece **BLOCKED** e `resetAuthorized:false`. Nenhum guard, função hospedada, SQL, PR clínica, deploy ou dados reais é alterado. Base de inspeção: `main 064757d2a39ad4c04c60b0034a8b35756b8eb089`.

## Evidência estática obtida do código real

| Origem | Contrato e elementos identificados | Tratamento G61 |
|---|---|---|
| `index.html` | `fieldKeys`, `sideKeys`, `manualKeys` = 12 campos; `collect()`; flag booleana `_include_hipotese`; `nexaClinicalBridge18101` | 12 mapeados; inclusão de hipótese e metadados precisam prova independente |
| `nexa-encounter-autosave-v18.10.1.js` | `collectFields()` chama bridge e varre todo `.field[data-key]` dinamicamente; acrescenta `exames_sugeridos`, `prescricao`, `conduta` | 14 nomes estáticos em G60; captura dinâmica sem limite: **BLOCKED** |
| `nexa-encounter-autosave-v18.10.1.js` | `buildLocal` preserva `fields`, `processing_meta`, `protocol_usage`, `consent_recorded_at`, estado e versão | Mapeado conceitualmente; equivalência persistida/remota NÃO comprovada |
| `nexa-audit-outbox-v18.9.19.js` | `KEYS` tem apenas 12 campos; snapshot inclui hypothesis_validation, Radar, destino, learning_layers e metadados | **Faltam `exames_sugeridos` e `prescricao` na lista `KEYS`**; não inferir perda automática, pois existem outros caminhos |
| `nexa-radar-*` | Estado, provas, perguntas, proveniência e revisão | Mapeado a `radar_review`, mas inventário de todos os itens dinâmicos pendente |
| `nexa-hypothesis-cid-guard`, `nexa-continuous-soap`, `nexa-clinical-plan-guard` | Revisão de hipótese/CID, condutas e plano | Mapeamento de seções proposto, sem prova de captura completa |
| `nexa-core-radar-review-v3`, medicações `_shared` | Revisões, análise de medicamentos, alergias e recomendações | Mapeado a `medication_review`, escopo variável permanece pendente |
| `index.html`, `nexa-radar-controller.js` | Buffers de transcrição, processamento e metadados de falantes | `transcription` e `processing_meta` no manifesto; retenção/exibição final não é certificada por este inventário |
| `nexa-destination-flow` e `nexa-audit-autosave` | Destino, estado do atendimento e encaminhamento à auditoria | Seções propostas, fonte real requer validação autoritativa |
| `submit-audit-case` e contrato backend | Revisão/versão de fonte e possível `ALREADY_REVIEWED` | Não é atestado de integridade da versão médica efetivamente revisada |

## Verificação G61

- `source-inventory.G61-LAB-ONLY.mjs` fixa o Git blob SHA de **19 arquivos críticos**, além dos **32 módulos adicionais carregados** pelo frontend (51 arquivos ao todo) do checkpoint main. Qualquer alteração de conteúdo nesses arquivos produz `STOP / SOURCE_CHANGED_NEEDS_REVIEW`.
- O inventário extrai os arrays literais de campos do formulário, o array da outbox e as chaves adicionais do autosave. Exige igualdade dos 12 campos index/outbox e união com os 14 campos do manifesto G60.
- Os testes inserem fontes alteradas, nomes dinâmicos inesperados, campo de medicação desconhecido, novo campo UI, arquivo ausente e seção clínica adicional. Cada tentativa deve falhar fechada.
- O inventário também descobre os módulos incluídos pelo loader `nexa-hotfix.js` e as dependências externas do `index.html`. Os módulos carregados ficam todos vinculados por SHA e qualquer mudança obriga revisão. Os **32 módulos adicionais** ainda estão classificados como semanticamente não auditados (integridade de código não é cobertura dos dados).
- O resultado positivo do **contrato estático** continua `BLOCKED / DYNAMIC_CLINICAL_SCOPE_AND_PRODUCTION_AUTHORITY_UNPROVEN`, não aprovação de reset.

## Limites da prova

Esta é uma fotografia estática de 51 arquivos, **não um inventário exaustivo e autoritativo de todas as fontes**. O código pode criar campos dinamicamente, receber payloads adicionais de funções hospedadas ou usar módulos do loader ainda sem revisão completa. SHA de código não prova equivalência entre conteúdo clínico persistido e conteúdo médico auditado. Nenhum hash de prontuário verdadeiro foi calculado ou publicado.

**Próximos gates:** mapear todos os módulos executados pelo loader, observar eventos/campos com fixtures sintéticas em navegador isolado, comprovar correspondência de todo o estado clínico ao envelope e criar um contrato transacional de versão auditada em ambiente descartável com autorização separada. Até isso, **STOP** para `nexa-audit-outbox-v18.9.19.js`, reset pós-`locked`, merge/deploy.

## Executar (offline, Node embutido)

```sh
node --check labs/nexa-audit-attestation/source-inventory.G61-LAB-ONLY.mjs
node --check labs/nexa-audit-attestation/source-inventory.G61.test.mjs
node --test labs/nexa-audit-attestation/receipt-verifier.G59.test.mjs labs/nexa-audit-attestation/authority-model.G60.test.mjs labs/nexa-audit-attestation/source-inventory.G61.test.mjs
```
