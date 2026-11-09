# G63 — Encadeamento clínico sintético e prova de preservação (OFFLINE ONLY)

**Escopo restrito:** PR Draft #163 contra `review/g59-offline-only-20261109`; main `064757d2`, PRs #158–#161 Draft, candidato G55 local (`01b41e78`), Supabase hospedado e guard `nexa-audit-outbox-v18.9.19.js` intactos.

Este é um **modelo de eventos em memória com fixtures fictícias**, não testes de navegador, nem de funções hospedadas, nem demonstração de cobertura integral do frontend. Toda API pública de teste retorna `resetAuthorized:false`.

## Pontes entre eventos sintéticos e módulos reais (marcadores revistos no G62)

| Etapa de laboratório | Fonte de código correlata | Invariante G63 |
|---|---|---|
| `history_restore` | `nexa-history-recovery-v1.js`, `nexa-history-style-audit-v18.9.7.js` | Mesmo autor, tenant, consulta e versão; registro com campos/seções completos; sem downgrade silencioso |
| `reconciliation_open/resolved` | `nexa-encounter-conflicts-v18.10.2.js` | Marcador de conflito impede auditoria; patch só com campos catalogados e versão esperada |
| `protocol_insert` | `nexa-protocol-library-v18.10.1.js` | Prescrição textual, plano e versão de protocolo evoluem juntos; nenhuma inclusão apenas visual |
| `field_edit`, `plan_update`, `hypothesis_update`, `medication_review` | `index.html`, `nexa-continuous-soap-v18.11.js`, `nexa-clinical-plan-guard-v18.9.12.js` e módulos de revisão | Toda mutação clínica tem revisão local; campos e subcampos não mapeados geram STOP |
| `radar_update` | `nexa-radar-engine.js`, `nexa-radar-auto-review-v18.12.js`, UI/bridge | Alerta, perguntas, ledger e proveniência no mesmo envelope, sem perda de campo |
| `consent_update` | `index.html`, módulos de fluxo, `processing_meta` | Consentimento positivo para processar/revisar; retirada posterior mantém snapshot e barra equivalência |
| `transcript_chunk`, `finish_processing` | `nexa-radar-controller.js`, `index.html` | Texto somente disponível após processamento; itens repetidos e metadados fora do escopo rejeitados |
| `autosave_checkpoint` | `nexa-encounter-autosave-v18.10.1.js` | Gera digest da versão clínica, revisão local e cópia imutável, sem afirmar sincronização com servidor real |
| `audit_lock`, `verify` | `nexa-audit-outbox-v18.9.19.js`, `submit-audit-case` | Apenas após checkpoint íntegro; snapshot revisado sintético não se altera por edições posteriores |

## Funcionamento dos contratos

- `clinical-flow.G63-LAB-ONLY.mjs` integra o `clinical-capture.G62-LAB-ONLY.mjs` e `clinicalDigest` do G60.
- Cada evento exige tipo, ID, identidade/tenant/sessão completos e payload com chaves esperadas. Cópia provisória do estado é validada antes do commit; `STOP` não altera o estado, incluindo a trilha de eventos.
- Event ID repetido com payload idêntico é ignorado; ID repetido com payload diferente é rejeitado. Isso simula idempotência de um processo, não comunicação distribuída.
- O checkpoint captura todas as seções do envelope sintético; a auditoria exige correspondência entre versão salva, revisão e conteúdo capturado.
- A cópia auditada é preservada após edições posteriores. Alterar HDA, prescrição, consentimento ou versão de origem depois do bloqueio causa `STOP`, com necessidade de adendo e revisão explícitos.
- A transcrição só fica disponível para `visibleTranscript()` após `finish_processing`, jamais durante gravação sintética.
- `verify()` pode retornar `PROVISIONAL_SYNTHETIC_MATCH`, mas **nunca autoriza reset**; `requestReset()` sempre retorna `STOP`.

## Limites explícitos

1. O modelo simula módulos e versões, mas **não executa suas funções reais** nem observa DOM, IndexedDB, rede, WebRTC, autenticação/JWT, RLS ou dados de pacientes.
2. O `synced=true` da fixture é estado fictício: não representa confirmação de gravação no Supabase, de tenant nem de revisão efetiva.
3. Campos dinâmicos, metadados futuros e formatos novos do backend permanecem **BLOCKED** até prova com instrumentação isolada e manifesto exaustivo.
4. Ações concorrentes do mundo real, múltiplas abas e eventos atrasados requerem validação separada. O rollback testado é apenas **atomicidade no modelo**; não rollback de dados reais ou do candidato local G55.
5. Assinatura/anti-replay transacional e prova autoritativa de equivalência da versão revisada são requisitos independentes. O G63 não muda o guard nem habilita merge/deploy.

## Comandos usados pela CI isolada

Somente `node --check` e `node --test` das suítes G59–G63, usando bibliotecas internas do Node. Sem instalação, staging, SQL, API paga ou chamadas hospedadas.

**Decisão:** PASS somente para modelo sintético e contratos locais; **BLOCKED** para cobertura real e autorização hospedada; **STOP** para reset após `locked`, merge e produção.
