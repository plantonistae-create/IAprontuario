# NEXA P0 — contrato mínimo da fonte clínica antes da auditoria

**Escopo:** prova isolada de decisão de autorização, com registros **100% fictícios**. Issue central #164; bloqueio de auditoria imutável #162. **Esta PR NÃO é patch da função hospedada, NÃO modifica o guard e NÃO pode ser aplicada a produção.**

## Código inspecionado, com origem

- `main 064757d2a39ad4c04c60b0034a8b35756b8eb089`, blob Git `7ae2e5f62e6015847db48f39afb8df91f8667725` de `supabase/functions/submit-audit-case/index.ts`.
- O código hospedado `submit-audit-case` v9 foi lido anteriormente e confirmado idêntico a esse arquivo. A função exige JWT, `auth.getUser()` e `get_my_capabilities`, **mas** faz `maybeSingle()` da fonte, depois utiliza `source?.fields??body?.fields`, sem um `if (!source)` que interrompa a operação.
- A consulta SQL feita por esse cliente lê `user_id`, mas o trecho não verifica explicitamente `source.user_id === user.id` antes de usar `SERVICE_KEY`. O `select` não inclui `tenant_id`: **não é correto presumir que exista essa coluna**, nem que o vínculo tenant esteja comprovado. Isso deve ser resolvido pela associação autoritativa real do banco.
- `ALREADY_REVIEWED` devolve case/status, não um atestado de igualdade da versão clínica atual com a revisada.
- A observação do fluxo no código **não prova exploração nem acesso indevido**: políticas RLS, vínculos de tenant e constraints de banco **não foram testados**. Nenhuma chamada hospedada foi feita.

## Contrato fail-closed proposto

`source-authority.P0-LAB-ONLY.mjs` recebe **exclusivamente do servidor**:
- identidade autenticada (médico e tenant), e capacidades de auditoria confirmadas;
- consulta-fonte existente, com `encounter_id`, `user_id`, identidade do tenant obtida de relação confiável, estado `ready_for_audit`, `sync_version` válido e conteúdo clínico integral;
- checkpoint de versão **durável e confirmado pelo servidor**, que vincula médico/tenant/consulta/versão, prova abrangência de campos e metadados, consentimento, ausência de conflito/adendo, áudio pendente e digests iguais;
- estado da auditoria existente obtido pela via autorizada, inclusive autoria/tenant da auditoria, preservando terminal `reviewed`/`locked`.

Somente `requestedEncounterId` e `requestedVersion` são entradas de seleção do cliente; **nenhum campo clínico ou identidade enviada no corpo autoriza uma operação**. A origem em falta, versão 0/stale, campos não mapeados, tenant indefinido, checkpoint local ou revisão terminal geram `STOP`.

A saída positiva é **PROVISIONAL_SOURCE_MATCH**, com `privilegedWriteAuthorized:false` e `resetAuthorized:false`. Não demonstra ausência de edição concorrente, RLS segura, autorização entre instâncias ou prova autoritativa de revisão.

## Delta mínimo recomendado (AINDA NÃO IMPLEMENTADO EM EDGE FUNCTION)

1. Logo após `maybeSingle()`, se `source === null`, **interromper imediatamente** (`SOURCE_NOT_FOUND`). **Remover o fallback `source?.fields??body?.fields`**, utilizando apenas a fonte verificada. Não aceitar `body.core_context` como autoridade sobre fatos clínicos já auditáveis sem reconciliação explícita.
2. Validar `source.user_id` contra `user.id`; confirmar vínculo de tenant a partir de **dados autoritativos do servidor/banco**, nunca `user_metadata` ou body/JWT editável. Se o tenant real não puder ser identificado com prova, **STOP**. Não inventar coluna nem adicionar política hospedada neste estágio.
3. Exigir `ready_for_audit`, versão inteira positiva e match com checkpoint durável de mesma origem/autor/tenant/versão; catalogar campos dinâmicos, consentimento e metadados clínicos sem perdas. Recusar versões ausentes, conflitantes ou pós-revisão.
4. **Antes de qualquer cliente `SERVICE_KEY` gravar ou atualizar `audit_cases`**, revalidar autorização e versão sob semântica transacional de concorrência entre instâncias, com chaves/constraints adequadas. Não substituir uma prova real por comparação de string local.
5. `ALREADY_REVIEWED` permanece terminal para **qualquer mutação**. Nunca sobrescrever a cópia `locked` ou permitir reset por um erro de 409.
6. Somente uma PR de produção **separada e autorizada** poderá propor a aplicação; antes dela, provar com fixtures no banco isolado RLS, autoria/tenant, vínculo de consulta, concorrência, rollback e fluxo de recuperação de adendos. A versão do esquema do Supabase e suas policies atuais precisam ser consultadas com autorização própria, sem tocar o hospedado.

## Evidência e limites dos testes

O arquivo de testes anexa, pelo hash Git, o código fonte real em main, verifica que o fallback ainda existe e testa isoladamente a especificação sintética: ausente, outra conta, outro tenant, autorização incompleta, versão stale, campo desconhecido, consentimento falho, conflito, duplicidade, auditoria terminal, alteração pós-checkpoint e replay. Os hashes usados são **de registros fictícios**; um SHA de prontuário real NÃO anonimiza dados sensíveis.

**O teste positivo é provisório e nunca concede privilégio.** Não há consulta real ao banco, ao Supabase, navegador, endpoint OpenAI ou arquivos de pacientes. Este laboratório não valida o estado real de RLS.

## Verificação permitida

```sh
node --check labs/nexa-audit-attestation/source-authority.P0-LAB-ONLY.mjs
node --check labs/nexa-audit-attestation/source-authority.P0.test.mjs
node --test labs/nexa-audit-attestation/source-authority.P0.test.mjs
```

A revisão é contra `review/g59-offline-only-20261109` para impedir a execução involuntária dos jobs padrão de staging. **Somente código experimental de laboratório e CI offline.** Guard `nexa-audit-outbox-v18.9.19.js`, PRs #158–#161/#163, main, candidato G55 e funções hospedadas permanecem intocados.

**GO:** apenas para especificação/prova sintética. **BLOCKED:** autorização de tenant e imutabilidade reais, deploy e homologação. **STOP:** reset de auditoria `locked`, merge e produção.
