# NEXA G60 — Contrato de versão auditada e decisão atômica (LAB-ONLY)

**Decisão:** STOP para reset pós-auditoria em produção. O modelo G60 não é um endpoint, não contém chaves de confiança reais, não usa SQL, não chama Supabase e **nunca retorna `resetAuthorized:true`**. A saída `SYNTHETIC_SINGLE_USE_REDEEMED` comprova exclusivamente a regra simulada em um único processo Node. Issue #162.

## Evidências do código existente (main 064757d2)

- `nexa-encounter-autosave-v18.10.1.js::collectFields()` agrega campos do bridge/DOM e também `exames_sugeridos`, `prescricao` e `conduta`. A lista é dinâmica, portanto **uma lista fechada de 12 campos na outbox não comprova integralidade do dado clínico**.
- `nexa-encounter-autosave-v18.10.1.js::buildLocal()` mantém `fields`, `processing_meta`, `protocol_usage`, `consent_recorded_at`, revisão local e versão sincronizada. Já `processingMeta()` agrega hipótese, plano, Radar e destino; devem estar na prova de conteúdo/versão.
- `nexa-audit-outbox-v18.9.19.js` tem snapshot `final-v1`, estados `locked`, `held_conflict` e `sending`. Nada deles foi alterado.
- `supabase/functions/submit-audit-case/index.ts` retorna `ALREADY_REVIEWED` sem digest do conteúdo exato revisado; não equivale a atestado clínico.

## Contrato experimental G60

`authority-model.G60-LAB-ONLY.mjs` modela uma captura **exclusivamente sintética** com manifesto de 12 seções:

1. `fields` (14 campos sintéticos, incluindo prescrição e exames sugeridos), `processing_meta`, `hypothesis_review`
2. `clinical_plan`, `medication_review`, `protocol_usage`, `radar_review`
3. `destination`, `consent`, `transcription`, `audit_context`, `supplemental_clinical_data`

O fingerprint SHA-256 inclui todo o JSON canonizado sem trim/normalização de texto; rejeita seção ausente/desconhecida, campo dinâmico não catalogado, getters, ciclos, valores inválidos e dados maiores que o limite. Uma alteração em alergias, diagnóstico, prescrição, sinais vitais, Radar, voz, metadados ou adendo altera o digest.

**Limitação fundamental:** essas categorias são um **manifesto de proposta**, não um inventário completo comprovado de cada origem/DOM/metadado existente na aplicação. Antes de qualquer autorização real, será indispensável vincular cada campo médico real a esse manifesto, de forma testável e com rejeição de novos campos não mapeados. Nunca tratar o SHA-256 como anonimização.

## Protocolo autoritativo proposto — não implementado

1. Servidor autenticado resolve **médico/tenant/consulta** a partir da sessão e dos dados persistidos, não do corpo da requisição.
2. Confere checkpoint durável, consentimento, identidade, **versão do source**, `reviewedSourceVersion`, objeto e versão da auditoria, sincronização, revisão, conflito, adendos, áudio e estado da gravação.
3. Carrega a cópia efetivamente revisada, compara o envelope clínico integral com o registro confirmado e emite uma prova assinada Ed25519 por autoridade confiável, vinculada à sessão, à versão e a um nonce curto.
4. **Na mesma transação persistente que marca o nonce como usado**, o servidor faz a segunda leitura de fonte/revisão e revalida todas as condições (CAS, concorrência interprocessos, replay e dupla finalização).
5. Qualquer divergência faz STOP. Alterações posteriores à revisão requerem adendo/reconciliação clínica explícita. Nenhum snapshot `locked` é atualizado ou reaberto.
6. Somente depois de provas remotas, teste de rollback e autorização específica poderá existir integração com o caminho canônico de nova consulta; não há essa integração no G60.

## O que é simulado

- Duas fases `issue` e `redeem`, assinatura Ed25519 com par de chaves criado dentro do teste e janela de 15 segundos.
- No momento de `redeem`, revalidação de origem, identidade, tenant, consentimento, versionamento, auditoria, integralidade dos campos e ausência de adendo/conflito.
- Nonce consumido uma única vez **em memória**. `Promise.all` com 12 chamadas valida no máximo um vencedor **num único event loop**, não sob múltiplos servidores ou panes.
- Falhas de prova, atraso, assinatura, replay, versão, conteúdo, sessão, consentimento, audiogravação, edições, auditoria e reconciliação retornam `STOP`.
- Mesmo no cenário positivo, a saída contém `resetAuthorized:false` e `SERVER_TRANSACTION_NOT_IMPLEMENTED`.

## Bloqueios para qualquer uso real

- Sem fonte autoritativa de digest do objeto efetivamente auditado e sem garantia de cobertura de dados médicos dinâmicos.
- Sem distribuição/rotação confiável de chave e sem serviço assinante autorizado no Supabase.
- Sem transação e persistência atômicas entre instâncias, sem semântica de recuperação após falha do servidor.
- Sem prova end-to-end de autenticação/tenant no banco, de não edição concorrente, adendo/consentimento ou de segurança de UX no guard de reset.
- Sem testes clínicos reais ou homologação de dispositivos.

**Portanto:** GO apenas para a consistência do laboratório, NO-GO para alterar `nexa-audit-outbox-v18.9.19.js`/produzir uma autorização real, merge ou deploy.

## Execução segura da suíte

```sh
node --check labs/nexa-audit-attestation/authority-model.G60-LAB-ONLY.mjs
node --check labs/nexa-audit-attestation/authority-model.G60.test.mjs
node --test labs/nexa-audit-attestation/receipt-verifier.G59.test.mjs labs/nexa-audit-attestation/authority-model.G60.test.mjs
```

Somente Node integrado; não instalar dependências nem executar outros scripts do projeto. A CI da PR #163 mira exclusivamente `review/g59-offline-only-20261109` para evitar a CI padrão de `main`, que invoca o staging.
