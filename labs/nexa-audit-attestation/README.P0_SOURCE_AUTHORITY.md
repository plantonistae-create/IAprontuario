# NEXA P0 — Gate C: contrato autoritativo de autoria individual (somente laboratório)

Issue #164 | PR #165 Draft | atualização de 2026-11-10 | NÃO EXECUTAR EM PRODUÇÃO.

## Decisão de produto confirmada
Somente o médico autenticado, proprietário de consultation_history.user_id, com acesso clínico ativo, pode submeter sua consulta. Tenant institucional NÃO é requisito do produto neste momento. A RPC get_my_capabilities() não retorna auditSubmit ou tenantId: eram premissas sintéticas da versão anterior do laboratório e foram removidas. professional_id legado não é prova de propriedade. user_id NULL implica STOP. A checagem autoritativa de acesso clínico deve cobrir o resultado de has_active_clinical_access() e o vínculo do slot privado, além do perfil ativo; activeClinicalAccessVerified no laboratório é um RESULTADO confiável do servidor, nunca coluna ou claim de request.

O consentimento existente foi confirmado pelo proprietário para IA externa E auditoria. Porém o DDL consultado tem consent_recorded_at nullable e NÃO comprova um checkpoint servidor que vincule finalidade, médico, versão e conteúdo. A confirmação do produto não substitui esta evidência técnica. Não inventar tabela, função, GRANT ou coluna de consentimento para dizer que o gate passou. A exportação privada schema-only já foi concluída/revisada; NÃO anexar, solicitar nem publicar seu conteúdo bruto.

## Defeito do código real, ainda SEM correção hospedada
main 064757d2, blob submit-audit-case/index.ts 7ae2e5f6: a função lê a fonte por maybeSingle(), não rejeita source=null, usa source?.fields??body?.fields e mistura body.core_context ao contexto do prontuário; mais tarde usa SERVICE_KEY. JWT e RLS histórica não provam por si só a origem nem eliminam TOCTOU durante a chamada externa de IA. Não foi demonstrada exploração.

**Defesa local mínima a ser aplicada futuramente em patch separado:** exigir source existente, encounter_id igual, source.user_id===auth.getUser().id não nulo, acesso clínico ativo e estado ready_for_audit; recusar body.fields e conteúdo clínico de body.core_context como autoridade; exigir versão positiva e esperada, com ACK/checkpoint servidor. Essa defesa é necessária mas insuficiente para liberar escrita administrativa.

## Contrato do checkpoint servidor AUSENTE na instalação atual
É uma PROPOSTA de operação/armazenamento, não DDL aplicado. O servidor precisa gravar um recibo imutável ou versionado (serverReceiptId) após confirmação de sync da revisão clínica, com:
- sourceRowId, encounterId, ownerUserId, syncVersion, snapshotVersion;
- digest canônico versionado de TODOS os campos clínicos persistidos (inclusive chaves dinâmicas), processing_meta, protocol_usage e consent_recorded_at; não usar allowlist fixa;
- prova servidor das finalidades de consentimento external_ai E audit, atrelada ao registro e timestamp, sem inferir escopo apenas do timestamp;
- declaração derivada do servidor de ausência de conflito, reconciliação/adendo, áudio pendente e alterações pós-revisão; timestamp e digest de cada revisão;
- vínculo durável entre conteúdo exato aprovado pelo médico e a versão confirmada pelo banco, com identidade autenticada e evidência de ACK. Propriedades JS do laboratório são apenas representação de contrato, NÃO campos atuais de Supabase.

Nunca usar payload clínico do body, metadados JWT editáveis, hash calculado apenas no cliente ou o rótulo final-v1 como evidência. A IA recebe somente o snapshot atestado, sem consulta a dados reais neste laboratório. O digest syntheticSourceDigest usa canonização JSON local nexa-json-v1 com restrições e inclui campos dinâmicos; não alegar equivalência com um algoritmo SQL que ainda não foi implementado.

## Rechecagem atômica pós-IA — contrato, não função criada
Antes de IA: autenticar e consultar via RLS, comprovar owner/slot/acesso ativo, fonte pronta, ACK, consentimento, versão e digest. Aguardar desidentificação externa SEM manter transação aberta. Depois de IA: em UMA transação servidor, revalidar identidade e capacidade atual, origem, recibo/consentimento, digest/versão e estado do audit case, e apenas então inserir/atualizar a auditoria pending. O resultado da IA deve estar vinculado ao MESMO digest e recibo; se qualquer elemento mudar, STOP e rascunho preservado, sem repetir chamada paga cegamente.

Ordem de bloqueios: a RPC submit_audit_review existente bloqueia audit_cases primeiro, depois consultation_history. A nova transação deve respeitar essa ordem para caso existente; para ausência de caso, concorrência por chave lógica (encounter_id,snapshot_version) exige exclusão/constraint única e tratamento de conflito ou SERIALIZABLE com retry curto e limitado. Nunca bloquear consulta primeiro e depois audit case sem análise de deadlock. Provar sessão do ator dentro da via transacional; usar service_role não carrega automaticamente auth.uid. NÃO criar RPC SECURITY DEFINER até revisar owner, search_path, EXECUTE e vínculo da sessão. Atualizações de estado terminal approved/corrected/discarded/locked são proibidas. ALREADY_SUBMITTED/ALREADY_REVIEWED não são prova de igualdade nem autorização para reset. Nenhuma alteração de RLS/ACL está prevista neste laboratório.

## Evidência/testes e decisão
O laboratório testa condições sintéticas de autorização, digest, campos dinâmicos, consentimento, estado terminal e ausência de autorização privilegiada. Mesmo a fixture inteiramente válida retorna apenas PROVISIONAL_SOURCE_MATCH / privilegedWriteAuthorized:false / resetAuthorized:false. Não há checkpoint de servidor implementado, nem rechecagem atômica, nem alteração de Edge. Não concluir C01–C10 a partir de testes JS.

Conforme relato do operador, testes PostgreSQL locais PARCIAIS passaram: RLS/autoria, grants, versão, campo dinâmico, unicidade, rollback e revisão sequencial. A evidência completa das duas sessões concorrentes e do fluxo ponta a ponta C01–C10 NÃO foi apresentada nesta PR; portanto NÃO declarar esses casos como aprovados. O próximo bloqueio é implementar/provar o checkpoint servidor e a rechecagem atômica com schema fiel e C01–C10 isolados.

**STOP:** produção, merge, deploy, alterações RLS/ACL, SQL hospedado, chamada paga, reset locked ou qualquer mudança do guard. Preservar main, G55, PRs #158–#161/#163/#166 e Edge hospedadas. Esta Draft é contrato de laboratório apenas.


## Gate C.3 — implementação isolada (NÃO APLICADA)

**Arquivos novos:** `gate-c-checkpoint-atomic.P0-CANDIDATE-NOT-APPLIED.sql` e `gate-c-edge-offline.P0-CANDIDATE.mjs`, com testes `gate-c-atomic.P0.test.mjs`. Tudo sob `labs/`, fora de migrations e Edge hospedadas.

- A RPC candidata de checkpoint emite um recibo de fonte, consentimento, revisão médica e versão após calcular SHA-256 no próprio PostgreSQL sobre os campos dinâmicos, processing_meta, protocol_usage e consent_recorded_at. A canonicalização PostgreSQL `pg-jsonb-v1` NÃO é o algoritmo Node `nexa-json-v1` e não se deve misturá-las.
- A RPC de commit roda *após* IA em transação curta, revalida owner, perfil/slot ativo, recibo, consentimento, revisão, digest, versão e estado de audit_cases. Usa advisory lock por encontro/versão, lock de audit_cases primeiro e depois consultation_history, igual à ordem da revisão. Caso pending idêntico é idempotente e não sobrescrito; divergência e terminal são STOP.
- O adaptador offline exige autenticação antes e depois da IA, origem exclusiva do checkpoint servidor, valida envelope desidentificado e faz somente UMA chamada ao commit atômico. Rejeita body.fields/core_context e qualquer identidade/tenant vinda do corpo. Falhas não disparam repetição paga nem reset.
- **O bloqueio proposital permanece:** não existem nesta PR os *writers* autoritativos para registrar o consentimento por finalidade e o ACK da revisão médica; as tabelas de evidência começam vazias. Não retropreencher nem aceitar um boolean do cliente para dispensar essas provas.
- **Somente candidato SQL local:** não foi executado em PostgreSQL. Não houve consulta ou alteração de SQL hospedado. As mudanças de GRANT/REVOKE do arquivo dizem respeito exclusivamente a novos objetos propostos do laboratório; nenhuma ACL real foi modificada.
- **Integração não autorizada:** os clientes legados enviam fields/core_context e devem ser adaptados sem perder o contexto clínico. A submissão de produção ainda usa SERVICE_KEY e o fluxo antigo: não recebeu patch.
- **Testes:** apenas Node sintético de sequenciamento/erros e inspeção estática da candidata SQL. As evidências parciais de banco já aceitas permanecem; C01-C10 fim-a-fim, duas sessões e revisor não foram executados aqui. Gate segue NO-GO.

A promoção futura depende de uma integração segura do evento de consentimento real e da revisão final do médico, validação de autoria/slot e protocolo de privacidade, revisão de grants/owners/search_path, e C01-C10 em PostgreSQL descartável.


## Gate C.4 — origem verificada e writer fail-closed (11/11/2026)

**Achado no código real:** `index.html` inclui consentimento no checkbox de gravação e registra `consentRecordedAt` no **cliente** durante `processAudio`. O `saveHistory` e o autosave sincronizam campos e `sync_version`, mas não produzem ACK explícito de que o médico revisou a versão integral. `submitCurrentForAudit` faz `confirm()` no navegador, sem registro transacional desse aceite. `nexa-audit-outbox-v18.9.19.js` captura campos locais e sinaliza `hypothesis_validation.status='reviewed'`, que também **não substitui assinatura/evento durável de revisão**. Portanto nenhum desses sinais gera evento confiável automaticamente. A confirmação do proprietário de que a política atual cobre IA externa/auditoria não equivale a prova técnica existente.

**Materializador novo e NÃO APLICADO:** `gate-c-evidence-materializer.P0-NOT-APPLIED.sql` cria, apenas no laboratório, uma tabela privada de eventos que exigem origem do backend verificado e ação positiva do médico. Sem `INSERT` para `authenticated`, `anon` ou `service_role` nesta tabela. Função `nexa_gate_c_materialize_verified_evidence_lab` só transforma um evento previamente existente em prova de finalidade/consentimento ou revisão da versão. Confere owner, slot, timestamp, digest completo, sincronização confirmada, áudio/reconciliação e idempotência. **Não cria eventos de origem** — o fluxo atual não os produz — e não concede reset/locked.

O adaptador Node `gate-c-evidence-writer-offline.P0-CANDIDATE.mjs` usa somente provider server-only e revalida Auth antes de invocar a RPC; o teste `gate-c-evidence-writer.P0.test.mjs` cobre evento inexistente, falso, ator trocado, SQL erro e ausência de retry. **Não é código publicado ou conectado à interface.** O SQL candidato contém grants somente sobre novas tabelas LAB e não é um contrato de privilégio aprovado: a promoção exige estreitar os direitos de escrita ao materializador, revisar `SECURITY INVOKER`/owner/ACL, e integrar um produtor confiável de eventos que não aceite campos do body como prova. Nenhuma ACL real foi alterada.

**C01–C10:** roteiro `GATE_C_C01_C10_SINGLE_SESSION_NOT_RUN.md` e preflight `gate-c-local-preflight.P0.sh` são somente preparação. Não provaram offline egress. O executor atual não possui PostgreSQL/`psql`; Mac/Codex local é necessário para concorrência real, com duas sessões e revisor. Sem dump bruto em GitHub, chats ou logs. Só aceitar evidências sanitizadas de testes novos; não reexecutar os PASS parciais anteriores.

**STOP permanece** para SQL hosted, paciente real, chamadas pagas, merge/deploy, RLS/ACL reais, `locked`, função Edge em produção ou afirmação de que a autoria e consentimento servidor foram comprovados.
