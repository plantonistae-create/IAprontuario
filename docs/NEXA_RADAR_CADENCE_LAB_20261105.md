# NEXA Radar — Laboratório de cadência econômica (2026-11-05)

## Decisão de release

**Cadências de 12 s e 16 s NÃO aprovadas para produção.** A implementação é um simulador offline, nunca importado pela PWA, controlador de Radar, worker do Supabase ou service worker. `CANDIDATE_ENABLED_IN_PRODUCTION=false`.

**Razão:** os alertas e lacunas do motor local são úteis, mas não comprovadamente exaustivos para toda apresentação atípica. Uma cadência maior pode atrasar exatamente o sintoma que as regras locais ainda não reconhecem. As etiquetas `urgent:true` nas fixtures representam um **oráculo idealizado**, não um detector clínico implementado.

## Estado inicial verificado

- `main`: `6c557c46c5d597454130f1e39e8ef5aafc8cc58b`
- CI `42026966535` **SUCCESS**, GitHub Pages `42026964702` **SUCCESS**
- Supabase `realtime-radar` v12, `realtime-call` v6, `process-consultation` v24; todos ACTIVE, `verify_jwt=true`.
- A PWA usa chunks de `MediaRecorder` de aproximadamente **8 segundos** no fallback de áudio. Os eventos concluídos entram no controlador local que executa `NexaRadarEngine.analyze` em cada recálculo. O agendamento remoto atual usa intervalo mínimo efetivo aproximado de 1,5 s; isso **não** significa que uma consulta real custa 1 chamada a cada 1,5 s.
- Telemetria recente (~24 h) Radar: 941 chamadas, 4.276.648 tokens entrada, 3.680.116 entrada cacheada e 930.928 saída.
- `nexa_realtime_upstream_v1`: nenhum novo evento; a causa histórica dos 502 não foi estabelecida. `NEXA_RADAR_COALESCED_v1`: 0 eventos; não atribuir economia financeira.

## Matriz determinística

Cada caso sintético é uma conversa acumulativa com **nove atualizações em t=0,8,...,64 s**, uma nova situação potencialmente preocupante em t=24 s, análise local em TODAS as nove atualizações e flush obrigatório ao final. Não há requisições pagas nem pacientes reais.

Áreas: respiratória (dispneia), gastrointestinal (sangue nas fezes), osteomuscular (trauma em joelho e dificuldade para apoiar), neurológica (início súbito de cefaleia), cardiovascular (desmaios). Também há fixtures independentes para negadores, doses, falantes e contradições.

| Cadência remota | Chamadas em cada cenário sintético | Evitadas vs. cadência atual | Redução técnica da simulação |
| --- | ---: | ---: | ---: |
| Atual — controle de 1,5 s, com eventos novos a cada 8 s | 9 | 0 | 0% |
| Hipotética — 12 s + bypass urgente idealizado | 7 | 2 | 22,22% |
| Hipotética — 16 s + bypass urgente idealizado | 6 | 3 | 33,33% |

**Essas porcentagens NÃO são economia real, previsão da fatura nem redução testada em pacientes.** O simulador não modela latência do modelo, reescritas ASR, paralelismo, retries, sessões heterogêneas, falhas de chunk ou valor clínico da análise remota. O bypass de um sinal de alarme funciona apenas porque a fixture o marca explicitamente; se um achado atípico não for reconhecido, o modelo remoto **pode atrasar**. A matriz inclui esse teste negativo propositalmente.

A transcrição literal e a análise local permaneceriam disponíveis para cada evento em um desenho futuro, mas **a arquitetura em produção não foi alterada**. Em particular, uma redução de chamadas não justifica atraso no atendimento urgente.

## Critérios obrigatórios para ativação (ainda não satisfeitos)

1. Revisão médica de 5 áreas, incluindo apresentações atípicas, populações especiais, negações, contradições, achados evolutivos, hipoxemia, trauma e sintomas neurológicos.
2. Comparar sugestões, red flags, falsos negativos e tempo até cada pergunta relevante contra a cadência atual, com datasets independentes e rótulos revisados por médico.
3. Demonstrar que uma classificação local *fail-open* encontra sinais de alarme novos sem mascarar mensagens não reconhecidas; não confiar em palavras-chave apenas.
4. Testar com áudio sintético e, mediante autorização apropriada, avaliar localmente condições representativas de ASR/diarização, queda de rede e iPhone. Não usar atendimentos ou gravações reais sem consentimento, segurança e governança.
5. Estabelecer limites de atraso por criticidade, garantias de flush antes de encerrar consulta e fallback imediato. Instrumentar apenas contadores agregados, sem texto clínico.
6. Comparar custos reais e verificar regressão clínica completa. Só depois considerar flag gradativa aprovada, com rollback e possibilidade de desligamento rápido.

## O que fazer sem arriscar qualidade agora

Continuar melhorias de deduplicação estritamente semânticas, eliminar pedidos redundantes com contexto idêntico/formatado, e aguardar o contador de upstream em uso normal. Não trocar ASR/modelo nem ampliar cadência até conclusão da homologação clínica. Priorizar em paralelo a preservação de áudio e casos de auditoria (PRs #92/#93/#94 em Draft), que é um risco operacional independente de custo.


## Gate conservador adicional — implementado no laboratório

A função offline `experimental/nexa-radar-deferral-gate.cjs` utiliza diretamente o motor real `NexaRadarEngine.analyze` para comparar cada atualização clínica com a anterior. Seu resultado possui apenas categorias técnicas, sem conteúdo de paciente.

**Política fail-closed:**
- Qualquer primeira fala, nova palavra, reescrita ASR, mudança de fala, dose, negação, dado do exame, CID, prontuário, médico, encontro, gravação, status da transcrição, retry ou encerramento => `immediate`.
- Mesmo que o motor local não detecte mudança de fatos e perguntas, **uma fala atípica diferente ainda exige análise imediata** (`UNRECOGNIZED_OR_REPHRASED_EVIDENCE`).
- Apenas uma cópia *exatamente idêntica* do contexto completo é classificada como `exact_duplicate`; isso já é deduplicação, não autorização de cadência estendida.
- Nenhuma comparação do gate aprova a cadência de 12/16s; `approvedForLongerCadence` fica sempre `false`.
- O laboratório não altera nem intercepta tráfego de produção e não expõe transcrições em métricas.

`tests/nexa-radar-deferral-gate.test.cjs` cobre os cinco sistemas, falas atípicas não reconhecidas, mudanças em negadores, doses, falantes, contradições, HDA/CID, encerramento, estado de gravação e identidade. A comparação com o simulador demonstra que reduzir chamadas com 12/16s **pode retardar evidências novas não classificadas**, mesmo preservando transcrição final.

**Conclusão:** o projeto ainda não dispõe de um detector de urgência capaz de justificar liberar a cadência maior. As próximas economias de produção devem ser estritamente relacionadas a requisições sem nova informação clínica, sem tocar no prazo das demais análises.

