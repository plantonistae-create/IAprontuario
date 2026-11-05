# NEXA — P0 Economia Real 7.8: baseline e gate financeiro (somente agregados)

**Estado:** pesquisa independente; PR Draft; SEM merge/deploy/alteração de endpoint, Auth, JWT, RLS ou dado clínico.  
**Janela imutável:** 2026-11-04 13:30:00 UTC a 2026-11-05 13:30:00 UTC (24h).  
**Fonte:** Supabase produção, consultas somente leitura aos logs `function_logs` e `function_edge_logs`. Foram retornados APENAS agrupamentos e somas, sem mensagens clínicas, usuários, encontros, áudio ou transcrições.

## Baseline dos contadores reportados pelo provedor

| Capacidade | Modelo | Eventos de uso | Entrada | Entrada cacheada | Saída | Custo teórico USD |
|---|---|---:|---:|---:|---:|---:|
| Radar | gpt-5.6-luna | 941 | 4.276.648 | 3.680.116 | 930.928 | 1,310022 |
| Documentação | gpt-5.6-terra | 5 | 27.882 | 0 | 2.188 | 0,082020 |
| Assistência clínica | gpt-5.6-terra | 5 | 6.439 | 0 | 3.742 | 0,057782 |
| ASR final | gpt-4o-transcribe | 5 | 8.510 | 0 | 2.697 | 0,048245 |
| **TOTAL OBSERVÁVEL** | — | **956** | — | — | — | **1,498069** |

Radar: 86,05% da entrada identificada como cacheada e 85,27% do custo teórico oriundo da saída. Tokens de raciocínio são subconjunto de saída; não cobrar duas vezes. Na amostra houve 21.180 tokens de raciocínio no Radar, 996 na documentação, 851 na assistência.

**Transporte HTTP ≠ chamadas pagas:** entre eventos de `function_edge_logs`, `realtime-call` teve 1.025 POST/1.026 OPTIONS, `realtime-radar` teve 922 POST/928 OPTIONS e `process-consultation` 37 POST/35 OPTIONS. Os eventos de uso podem ter retenção, latência e cobertura distintas; NÃO fazer uma divisão entre POSTs e eventos de uso para inferir faturamento ou eficiência. OPTIONS de preflight não é transcrição cobrada.

## Como interpretar os preços

Tarifas públicas da API OpenAI consultadas em 05/11/2026, modalidade Standard (USD por milhão de tokens):
- GPT-5.6 Luna: entrada 0,20; entrada cacheada 0,02; saída 1,20.
- GPT-5.6 Terra: entrada 2,00; entrada cacheada 0,20; saída 12,00.
- GPT-4o Transcribe: entrada 2,50; saída 10,00; custo por duração não somado quando já há tokens.

Fontes: https://developers.openai.com/api/docs/models/gpt-5.6-luna ; https://developers.openai.com/api/docs/models/gpt-5.6-terra ; https://developers.openai.com/api/docs/models/gpt-4o-transcribe ; https://developers.openai.com/api/docs/pricing .

Cálculo para cada linha:
`USD estimado = ((entrada-cache)*taxa_entrada + cache*taxa_cache + saida*taxa_saida)/1.000.000`.
A estimativa ignora mudanças de tier/long-context, impostos, créditos, arredondamentos, registros ausentes e cobranças multimodais sem `usage`. **Não é uma leitura de faturamento.** Não extrapolar janela de 24h como consumo semanal.

## Lacuna P0: áudio ao vivo

O endpoint `realtime-call` pode abrir sessão WebRTC ou executar fallback por pequenos blocos. O código do transporte não apresenta um feed de consumo faturável da sessão WebRTC, tampouco uma ligação confiável entre quantidade de POSTs e duração/uso faturado. Nenhum evento `realtime.transcription` estava disponível no recorte selecionado, embora o fallback tenha instrumentação quando o provedor devolve `usage`. Isso NÃO significa ausência de áudio nem custo zero.

**P0 financeiro seguinte:** conciliar somente o total diário agregado de faturamento do projeto OpenAI (separado por modelo/modalidade, tokens cacheados, minutos de áudio, falhas cobradas) com o relatório de logs por dia. Não coletar identificadores, payloads, gravações nem transcrições. Capturar amostra de sete janelas diárias antes de decidir prioridades. Não expor qualquer segredo da API ou arquivo bruto.

## Impacto de hipóteses (NÃO economia medida)

- Se 10% do consumo **idêntico** de tokens do Radar desaparecesse (sem mudança no mix/cache), a diferença matemática seria US$ 0,131002 nesta janela.
- Se 10% apenas dos tokens de saída do Radar desaparecessem, a diferença matemática seria US$ 0,111711 nesta janela. **Não propor redução da saída clínica antes de equivalência sobre sinais de alarme, medicamentos, negações, transcrição, radar e auditoria.**
- Cache presente não é uma economia adicional implementada nesta PR. Preservar uma análise após aborto de frontend tampouco comprova desconto no faturamento.

## Ferramenta offline e validação

`scripts/nexa-cost-aggregate-report.mjs` aceita SOMENTE JSON com os campos `window`, `usage` (somas por capacidade/modelo) e `http_requests` (contagens agrupadas por função/método). Executar `node scripts/nexa-cost-aggregate-report.mjs < agregado.json` apenas com um JSON já agregado e revisado, nunca com logs brutos. O algoritmo rejeita propriedades não previstas como `transcript`, `patient_id`, `encounter_id`, `event_message` e contadores inconsistentes. Modelos sem tarifa conferida são marcados como não precificados, jamais supostos gratuitos. Não chama APIs.

**Gate de conclusão P0:** (1) CI verde para testes sintéticos e regressão clínica; (2) reconciliação com faturamento real do provedor; (3) evidência de economia líquida entre janelas comparáveis por capacidade/modalidade; (4) avaliação médica de equivalência para QUALQUER mudança no conteúdo ou temporização clínica; (5) rollback revisado. Se faltar item, manter Draft e não publicar.

**Rollback:** a PR só adiciona script/teste/documento e encadeia o teste na CI; fechamento da PR ou revert do commit não toca produção. Nenhuma migração, alteração de runtime, prompt, cadência 12/16 s ou modelo foi feita.
