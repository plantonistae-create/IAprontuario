# NEXA Core — arquitetura comercial e dataset clínico (proposta v1)

**Status:** branch de desenvolvimento; não constitui um modelo NEXA Core treinado, uma API própria publicada nem autorização para tratamento secundário de dados de pacientes.

## 1. Arquitetura pretendida

```text
NEXA Web (GitHub Pages) / médicos autenticados
  |  TLS, token do médico, autorização por tenant, limites por plano
  v
Gateway API (Supabase Auth + funções de borda)
  |-- transcrição + diarização (adapter temporário OpenAI; substituível)
  |-- confirmação de papéis: médico / paciente / acompanhante / outro
  |-- prontuário (documentação cronológica, SIC, fonte dos relatos)
  |-- auditoria (casos finais desidentificados e revisão clínica)
  |-- exportação governada (admin + base legal + liberação manual)
  |
  v
Fila de jobs para tarefas assíncronas (planejada; ainda não implementada)
  |-> CPU workers: autenticação, normalização, desidentificação, exportações
  |-> GPU workers autoscaláveis: transcrição, diarização, inferência clínica
  |-> Retry/idempotência e dead-letter; filas segregadas por tenant
  v
Serviço de inferência NEXA Core (futuro)
  |  endpoints privados versionados; health, readiness, throughput e rollback
  v
Banco PostgreSQL + storage privado
  |-- prontuários (acesso do médico/tenant)
  |-- auditoria clínica desidentificada (revisores autorizados)
  |-- exportação de datasets (somente casos liberados; sem áudio)
  +-- registro de modelo, evals e versionamento (parcial, em código)
```

**Escolha inicial:** hospedagem online com componentes CPU persistentes pequenos e GPU **sob demanda**. Manter o adaptador de OpenAI enquanto treinamento/validação independentes não atingirem métricas de segurança. O provedor de GPU pode ser trocado sem mudar o formato do contrato clínico.

## 2. Implementação desta branch

- **Diarização:** `consultation-speakers` recebe áudio consentido e autenticado, usa `gpt-4o-transcribe-diarize`, retorna apenas segmentos e identificadores de locutores em memória. Não grava áudio nem transcrição no banco.
- **Revisão clínica:** o médico confirma a correspondência entre os locutores e papéis. Nenhum papel é inferido automaticamente a partir da ordem de fala. Sem confirmação de todos os papéis e presença de um médico, não é produzido documento com atribuição de locutor.
- **Documento:** `process-consultation` aceita segmentos confirmados, passa por validação e gera o prontuário, sem fazer segunda transcrição. Preserva HDA cronológica; fala de acompanhante é atribuída ao acompanhante, não ao paciente; termos leigos não substituíveis com segurança são marcados `(SIC)`; diagnóstico e negativas não podem ser inventados.
- **Radar em tempo real:** permanece no fluxo anterior; ainda não faz diarização ao vivo. A identificação de locutores ocorre **na finalização**.
- **Auditoria:** captura campos revistos e estatísticas agregadas de atribuição (quantidade de falas por papel, confirmação e origem); não captura áudio, transcrição bruta nem modelo biométrico.
- **Direitos de treinamento:** tabela `nexa_core_dataset_approvals`, com revisão de desidentificação, referência de base legal, versão de política e revogação. Casos apenas aprovados clinicamente **não** passam automaticamente ao dataset de treinamento.
- **Exportador:** `core-dataset-export`, apenas para admin ativo autenticado; exige `NEXA_DATASET_HMAC_SECRET` com pelo menos 32 caracteres. Retorna `.jsonl` em lotes máximos de 100, ID pseudônimo via HMAC, campos clínicos em lista permitida, divisão determinística, SHA-256 do lote e registro de exportação sem conteúdo clínico.

## 3. Governança antes de liberar treinamento comercial

Consentimento para gravar e documentar uma consulta **não implica autorização automática para treinamento comercial**. O encarregado pelo tratamento deve documentar fundamento jurídico adequado, informação aos titulares, avaliação de impacto quando necessária, contratos de operadores, transferência internacional, controles de acesso e política de retenção.

A liberação de caso exige revisão humana de desidentificação. O detector automático de CPF, e-mail, telefone e padrões óbvios de nomes é **incompleto**: texto livre pode revelar identidades indiretamente (datas raras, localização, parentescos, eventos incomuns). Um exportador pseudônimo não garante anonimização irreversível. Revogação deve impedir **novas exportações**; versões de datasets já emitidas exigem controle externo de distribuição e revogação.

Dados originais e embeddings/áudio de voz **não** devem integrar o dataset documental. Qualquer projeto futuro de identificação biométrica persistente exigirá sua própria revisão de necessidade, base legal, segurança, retenção e opções de exclusão.

## 4. Contrato de exportação

Por linha JSONL:
- `artifactType=DATASET_ITEM`; `datasetVersion` explícito; `datasetItemId` pseudônimo;
- `split`: training / validation / test (atualmente determinístico por *caso*, não por paciente);
- `input.caseData`, `input.originalAi`, `input.physicianFinal` somente campos textuais clínicos permitidos;
- `input.speakerAttribution`: apenas contagem/atribuição de papéis, sem transcrição ou amostras de voz;
- `target.fields`: dados finais revisados na auditoria;
- `source.auditCaseId`: pseudônimo HMAC, sem ligação exportada com `source_consultation_id`.

**Pendência antes de treinamento real:** implementar separação treino/validação/teste por *paciente* (ou outra unidade anti-vazamento apropriada), preservando no ambiente clínico um agrupador HMAC estável e inacessível ao pipeline de exportação. O split atual por caso é adequado apenas para ensaios sintéticos e de integração.

## 5. Publicação coordenada

1. Executar migration `20261017140000_nexa_core_commercial_dataset_rights_gate.sql` no **staging**, validando RLS, permissões e RPCs antes de aplicar em produção.
2. Configurar nas Edge Functions (somente segredo backend): `OPENAI_API_KEY`, `NEXA_DIARIZATION_MODEL` e `NEXA_DATASET_HMAC_SECRET` gerado aleatoriamente. Não colocar segredos no frontend nem versioná-los.
3. Publicar `consultation-speakers`, `process-consultation`, `submit-audit-case` e `core-dataset-export` juntos, **primeiro em staging**.
4. Homologar em áudio sintético: 2–4 vozes, mudanças de locutor, sobreposição, ruído, falas de familiares, relatos conflitantes, SIC e cronologia. Verificar notas geradas manualmente; não confiar só em teste automatizado.
5. Testar revogação, bloqueio não-admin, exports vazios, PII em texto livre e bloqueio sem documentação de base legal.
6. Submeter a revisão formal de LGPD/segurança, instrumentar métricas **sem PHI**, e fazer rollout controlado para usuários selecionados. Não habilitar volume comercial até medir latência, custo por minuto e erros sob carga.

## 6. Capacidade/escala e cobrança SaaS

Registrar por requisição somente contadores não clínicos: tenant, usuário pseudônimo, duração de áudio, modelo, tempo de GPU, tentativas, sucesso/falha, cobrança estimada, status de revisão. Definir quotas mensais por assinatura e custo marginal por médico antes de fixar preços. Aplicar rate limit, fila priorizada, retry idempotente e auditoria da administração.

Backups cifrados, monitoramento, failover, restauração testada, chaves rotacionáveis, segregação real de tenant no banco e logs mínimos são **pré-requisitos de produção comercial ainda não entregues nesta branch**.

## 7. Reversibilidade

O modo de diarização depende de checkbox na interface. Se serviço temporário indisponível, o aplicativo mostra falha e preserva o áudio na memória para nova tentativa; pode-se desmarcar o recurso para utilizar a transcrição anterior. Não faz fallback silencioso para uma nota com identificação presumida de participantes.

Este é o primeiro incremento de engenharia; não constitui homologação em produção nem comprova funcionamento de um motor NEXA Core próprio.
