# G59 — Contrato offline de comprovação da versão auditada

**Escopo:** laboratório exclusivamente sintético, isolado e não integrado ao aplicativo. Não é atestado real e não habilita reset. Referência: issue #162, baseline main 064757d2. PRs #158–#161 e candidato local G55 árvore 01b41e78 permanecem intocados.

## Problema comprovado

O endpoint atual responde ALREADY_REVIEWED com case_id/status, sem atestar a equivalência entre o conteúdo clínico que o médico vê e a versão efetivamente revisada. O estado local locked não prova essa equivalência.

## Contrato proposto, ainda não implementado no servidor

Um servidor de auditoria confiável precisaria autenticar o médico, verificar a instituição/tenant e obter a versão da consulta e o objeto revisado para emitir um recibo assinado com:

- Identidade vinculada de consulta, médico, tenant e objeto de auditoria
- source_sync_version e digest exato dos campos clínicos da versão auditada
- Estado reviewed, finalidade/audience, issuer e key ID
- Timestamps de revisão/emissão/expiração e nonce único por tentativa

Assinatura Ed25519 verificada por chave pública **fixada independentemente por distribuição confiável**, nunca pelo material de chave que venha no próprio recibo. Chaves geradas pelos testes não possuem autoridade real.

## Evidência obtida pelo laboratório

O verificador recusa diferenças de texto (inclusive espaços), versão, usuário, tenant, nonce, status, consentimento, armazenamento, sync, gravação ativa, conflito ou campos desconhecidos. A igualdade verificada é estritamente provisória; até uma prova sintética com assinatura válida retorna status PROVISIONAL_MATCH e resetAuthorized:false.

Nenhum caminho desse laboratório chama clearClinicalSession, performReset, beforeReset ou qualquer função de produção.

## Bloqueios de segurança / STOP

1. Nenhuma função hospedada emite esse recibo e nenhuma chave autoritativa está configurada.
2. Um recibo assinado offline não comprova ausência de nova alteração remota; exigir concessão fresca, autenticada, transacional, de uso único e reconhecida pelo servidor.
3. O conjunto de 12 campos da outbox não prova a cobertura de todos os metadados médicos/alterações na consulta. Toda futura autorização requer escopo completo e especificado; este laboratório falha em campos extras.
4. Alterações pós-auditoria necessitam fluxo explícito de adendo/reconciliação. Não alterar, reabrir, sobrescrever ou reenviar snapshots locked.
5. Checkpoint durável, identidade, consentimento, reconciliação, sincronização e áudio ainda não transcrito permanecem gates obrigatórios.
6. Hash de conteúdo clínico não é anonimização. Nenhum hash ou texto médico real deve ser publicado ou registrado.

## Verificação

Apenas bibliotecas internas do Node: node:crypto, node:test e node:assert/strict.

- node --check labs/nexa-audit-attestation/receipt-verifier.G59-LAB-ONLY.mjs
- node --check labs/nexa-audit-attestation/receipt-verifier.G59.test.mjs
- node --test labs/nexa-audit-attestation/receipt-verifier.G59.test.mjs

Nenhuma instalação de dependências, ambiente clínico, network request, SQL, token real ou chamada paga.

## Gate seguinte

Só discutir alteração do guard após contrato autoritativo de versão revisada, prova autenticada de identidade/tenant, confirmação fresca de nenhum adendo e decisão de uso único não falsificável. Até lá: STOP para o reset após locked e NO-GO para merge/deploy. O CI offline, por si só, não remove esses bloqueios.
