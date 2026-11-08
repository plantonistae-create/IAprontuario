# NEXA Core — laboratório mínimo shadow offline G0

**Escopo:** `experimental/nexa-core-shadow-lab.mjs` usa o motor local já existente (`nexa-radar-engine.js`) e a baseline CPU do Core (`services/nexa-core-radar/infer.mjs`). O provedor remoto só é representado por snapshots sintéticos/anonimizados previamente fornecidos; **nenhuma chamada remota**, sem cadastro de outro prontuário, Supabase, rede ou transcrição exibida na UI.

### Entrada e segurança
Caso `nexa-shadow-lab-v1` com `case_id` técnico, `source` synthetic/deidentified, `deidentification_reviewed=true`, até 40 frases com speaker explícito, contexto clínico estruturado de campos permitidos e lista de conceitos críticos definidos pelo revisor. Recusa campos desconhecidos, identificadores óbvios, links e formatos inválidos. Uma revisão humana de anonimização continua obrigatória: filtros de texto **não garantem anonimização**. Não introduzir material clínico real sem base adequada.

### Execução
`node experimental/nexa-core-shadow-lab.mjs < caso_anonimizado.json` imprime **apenas contadores**: latências p50/p95, número de frases, risco de atribuição, cobertura crítica, status, sem reproduzir frases, provas, IDs ou transcrições. A importação é efêmera em memória. A função `replayShadowCase` devolve quadros detalhados somente ao invocador local autorizado para revisão médica.

### Contrato e gates
Cada quadro contém adaptadores normalizados `local`, `remote-offline-snapshot` ou `null`, e `nexa-core-shadow`: `questions`, `alerts`, `contradictions`, `uncertainties`, `evidence` (inclui speaker/confiança desconhecida), `responses` e `audit`. Nenhum resultado shadow altera prontuário. Conceito crítico esperado que não apareça, ou atribuição problemática, bloqueia o teste com `BLOCKED_CLINICAL_REVIEW_REQUIRED`. Status aprovado é **sintético, não validação clínica**.

Próximos gates ainda pendentes: casos reais previamente desidentificados com curadoria, revisão clínica por frase, métricas de falsos alertas e revisão de atribuição, persistência de avaliações médicas, estatística comparável de custo e regressões longitudinais. **Não** ligar o shadow mode à consulta real, nem mudar Edge/JWT/RLS sem autorização e evidências de segurança.
