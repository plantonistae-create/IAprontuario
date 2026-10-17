# NEXA Core — Radar independente (contratos e validação)

## O que está implementado nesta branch

- O Radar continua funcionando com o motor determinístico local \`nexa-radar-engine.js\` e, quando habilitado, um provedor remoto de interpretação de falas.
- \`NEXA_RADAR_PROVIDER=openai\` (padrão atual): preserva a rota já existente.
- \`NEXA_RADAR_PROVIDER=nexa-core\`: a Edge Function chama a API HTTP própria configurada. **Não faz fallback silencioso para OpenAI** se a API própria cair. A camada determinística ainda apresenta lacunas/alertas locais; os itens dependentes da IA podem permanecer indisponíveis.
- \`nexa-core-radar-v1\` define entrada, saída, evidência e restrições clínicas. Mesmas funções de validação \`validate\` e \`validateObservations\` filtram respostas de ambos os provedores.
- O cliente jamais recebe \`NEXA_CORE_API_KEY\`, e não deve enviar tokens da sessão do médico à API Core. Exige URL HTTPS, caminho fixo, segredo server-to-server e autenticação prévia pelo Supabase.
- \`nexa-radar-feedback-v1\` conserva apenas ações, conceitos permitidos e contadores, sem respostas textuais, áudio, transcrição, paciente ou horários individuais; o dado só integra **treinamento comercial** após auditoria e liberação separada do dataset, conforme as regras já implementadas.

## Contrato HTTP que o futuro servidor GPU precisa implementar

\`POST https://<domínio-do-core>/v1/radar/analyze\`

**Request** (dados fictícios):
\`\`\`json
{
  "schema_version":"nexa-core-radar-v1",
  "capability":"realtime.radar",
  "model":"nexa-core-radar-candidate",
  "context":{
    "transcript":"Cefaleia desde ontem. Médico: Teve febre? Paciente: Não.",
    "clinical_context":{"hda":"Cefaleia desde ontem."},
    "previous_state":{}
  },
  "allowed_concepts":["fever","headache"],
  "constraints":{
    "no_inferred_negatives":true,
    "evidence_must_be_literal":true,
    "third_party_is_not_patient":true,
    "doctor_question_is_not_patient_response":true,
    "human_decision_is_final":true
  }
}
\`\`\`

**Response** (sem sugestões adicionais por já haver evidência):
\`\`\`json
{
  "schema_version":"nexa-core-radar-v1",
  "result":{"items":[],"observations":[]}
}
\`\`\`

\`items\` (máximo 16): \`concept\` dentre os permitidos, \`priority\` critical/high/moderate/low, \`category\` reconhecida e \`contextEvidence\` **literalmente presente** no contexto. \`observations\` (máximo 32): \`concept\`, \`state\` known_present/known_absent/unknown, \`temporal\` current/recent/prior/resolved, \`subject\` patient/third_party/unclear, \`section\` presente e \`quote\` literal. O backend rejeita observações sem citação verificável, de perguntas do médico ou atribuídas a terceiros.

**Variáveis apenas nas Edge Functions:** \`NEXA_RADAR_PROVIDER=nexa-core\`, \`NEXA_CORE_RADAR_URL=https://.../v1/radar/analyze\`, \`NEXA_CORE_API_KEY=<secret>\`, \`NEXA_CORE_RADAR_MODEL=<modelo-versionado>\`. Secrets nunca no GitHub nem em JavaScript do PWA. A troca deve ocorrer primeiro em staging, sem pacientes reais, e depois ser liberada por etapas.

## Dataset para o Radar

O NEXA já guarda os campos clínicos desidentificados e revisados após auditoria. Agora o pacote \`nexa-dataset-item-v1\` também pode conter \`annotations.radarFeedback\`:
\`\`\`json
{
  "schema_version":"nexa-radar-feedback-v1",
  "actions":[
    {"concept":"fever","action":"dismissed","annotation_type":"physician_interaction_not_clinical_ground_truth"}
  ],
  "action_counts":{"answer":0,"evaluated":0,"dismissed":1,"not_applicable":0},
  "metrics":{"suggested":2,"covered":3,"confirm":0,"alerts":0},
  "no_raw_transcript":true,
  "no_phrases_or_patient_identifiers":true,
  "human_review_required_for_training_labels":true
}
\`\`\`

**ATENÇÃO:** uma sugestão dispensada **não** significa que ela era clinicamente errada; pode ser uma decisão contextual do médico. Da mesma forma, uma fala marcada "já avaliado" não prova que houve resposta positiva ou negativa. Esses eventos são **sinais para revisão e amostragem**, não rótulos supervisionados aceitos automaticamente.

Para treinamento real, o revisor deverá classificar em uma interface de avaliação dedicada (ainda a desenvolver) o erro do Radar: pergunta redundante, resposta ignorada, condição clínica irrelevante, evidência mal atribuída, temporalidade incorreta, sinal de alarme perdido ou sugestão adequada. O dataset deve conter somente citações/desidentificação com revisão apropriada e ser separado treino/validação/teste **por paciente**, sem vazamento entre episódios; esta separação ainda não está implementada.

## Referência de serviço própria já incluída no código

A branch inclui `services/nexa-core-radar/infer.mjs` e `services/nexa-core-radar/server.mjs`: implementação **CPU-only** e **sem chamadas à OpenAI**, conectada ao mesmo motor determinístico do navegador. Ela serve como baseline de integração para a futura API online.

Uso de desenvolvimento: iniciar com `NEXA_CORE_API_KEY=<segredo-aleatório-longo> PORT=8765 node services/nexa-core-radar/server.mjs`. O processo se vincula **apenas a 127.0.0.1**, não recebe conexões externas e precisa de **reverse proxy HTTPS, autenticação, restrições de rede, monitoramento e governança** antes de qualquer instalação remota. A API recusa requisições sem bearer válido e cargas excessivas e não registra prontuários nem falas. `GET /healthz` sinaliza somente que o processo está vivo, **não** que o modelo é clinicamente seguro.

Esta referência é um *baseline de regras*: não faz transcrição, diarização, inferência generativa, gestão de fila nem treinamento GPU. Pode sugerir perguntas clínicas delimitadas pela evidência do contexto. **Não deve ser ativada para atendimentos reais sem validação clínica específica**, e não constitui migração integral do NEXA para infraestrutura própria.

## Motor local + API e limite de independência atual

- A camada local determinística tem execução no navegador, não requer a OpenAI e nunca deve ser substituída por conclusões não verificáveis da IA.
- O adaptador próprio existe em código, mas o serviço remoto GPU, os pesos treinados e a autenticação do serviço Core ainda não foram provisionados. \`nexa-core\` **não deve ser ativado** até a implantação, avaliação e medição sob carga.
- "100% sem OpenAI" exige outros adaptadores independentes: transcrição e diarização da consulta, estruturação de prontuário, análise clínica, desidentificação para auditoria e serviços realtime. Esses componentes ainda dependem do fornecedor atual e **não** são implicitamente substituídos pelo adaptador Radar.
- A futura implantação online deve usar CPU sempre ativa para autenticação/fila/orquestração e workers GPU sob demanda para fala e modelo clínico. Os workers atendem requisições concorrentes com isolamento por médico, custo/limites por conta, observabilidade sem conteúdo clínico, retomada idempotente e rollback de versão.
- Nenhum áudio ou prontuário real deve ser enviado ao ambiente de treino ou à GPU própria sem contratos, base legal documentada, controles de acesso, política de retenção, criptografia e governança para dados de saúde.

## Critérios de homologação do Radar próprio

1. Casos sintéticos com febre, dispneia, síncope, dor torácica, cefaleia súbita, sintomas em terceiros, negativas ambíguas, temporais e perguntas já feitas.
2. Métricas: tempo da fala ao checklist, falsos positivos de perguntas repetidas, recall de sinais de alarme, atribuições equivocadas de paciente/acompanhante, taxa de revisão manual e concordância médico–auditor.
3. Não aprovar modelo com regressões de segurança clínica, mesmo que seu custo ou latência melhore.
4. Comparar versão do modelo e dataset contra baseline isolado, usando a taxonomia \`EVALUATION_RUN\` e \`MODEL_VERSION\`, e só promover modelos treinados e **clinicamente validados**.
5. Testar desligamento da API NEXA Core: nenhuma requisição volta para OpenAI quando \`NEXA_RADAR_PROVIDER=nexa-core\` e o sistema informa a indisponibilidade da camada remota.

**Status:** este documento define e prepara contratos e feedback. **Não** afirma que o NEXA Core independente está funcionando hoje.
