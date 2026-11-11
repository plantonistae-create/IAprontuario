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
