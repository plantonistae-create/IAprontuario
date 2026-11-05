# NEXA — P0 Economia Real 7.9 | comparação observacional de 7 dias

**Data do relatório:** 05/11/2026. **Escopo:** pesquisa offline da PR #118 Draft. Sem merge, deploy, alterações clínicas, dados, RLS, Auth/JWT, modelos, ASR, prompts ou cadências 12/16s.

## Fonte e método

Sete consultas ao projeto Supabase de produção, somente leitura, uma para cada janela exata de **24 horas UTC** entre 2026-10-29 13:30Z e 2026-11-05 13:30Z. Cada consulta retorna exclusivamente `countIf` e `sumIf` sobre categorias fixas de eventos técnicos; não busca registros brutos para o modelo, identificadores, nomes, áudio, transcrição ou payload clínico.

As categorias HTTP contam *requisições*, inclusive OPTIONS (preflight) e POST; os eventos `nexa_ai_usage_v1` são logs de métricas retornadas pelo provedor quando instrumentados. **Eventos de telemetria e POSTs não são relacionáveis um-a-um.** Dois dias têm eventos de usage acima da contagem de POSTs no mesmo recorte temporal. Isso demonstra a impropriedade de dividir um pelo outro como métrica de faturamento.

## Inventário diário observado

| Janela começa em UTC | POST Radar | `usage` Radar | POST Realtime | Input Radar | Cache Radar | Output Radar | Estimativa de texto do Radar, USD |
|---|---:|---:|---:|---:|---:|---:|---:|
| 29/out | 19 | 0 | 22 | — | — | — | indisponível |
| 30/out | 571 | 0 | 651 | — | — | — | indisponível |
| 31/out | 589 | 0 | 705 | — | — | — | indisponível |
| 01/nov | 693 | 280 | 730 | 1.311.380 | 1.082.172 | 287.937 | 0,413009 |
| 02/nov | 414 | 414 | 476 | 1.824.413 | 1.604.205 | 384.552 | 0,537588 |
| 03/nov | 907 | 922 | 1.018 | 4.337.739 | 3.616.393 | 908.088 | 1,306303 |
| 04/nov | 922 | 941 | 1.025 | 4.276.648 | 3.680.116 | 930.928 | 1,310022 |
| **Total** | **4.115** | **2.557** | **4.627** | **11.750.180** | **9.982.886** | **2.511.505** | **3,566923** |

Os três dias iniciais não produziram eventos `nexa_ai_usage_v1` no recorte consultado, **não significando custo zero**, pois registraram POSTs de Radar e Realtime. Na janela 01/nov o consumo tem cobertura desconhecida (280 eventos de uso frente a 693 POSTs; números de naturezas diferentes). Não inferir razões de completude por divisão de contadores.

Mais sinais de cobertura: **4.229 OPTIONS Radar**, **4.642 OPTIONS Realtime**, **156 POSTs process-consultation** e **10.280 logs de execução técnica** nas sete janelas. Execução técnica não corresponde automaticamente a cobrança OpenAI.

## Distribuição estimada de custo por capacidade

As tarifas de lista Standard consultadas em 05/11/2026 são **por 1 milhão de tokens**. Fonte oficial: https://developers.openai.com/api/docs/models/gpt-5.6-luna e https://developers.openai.com/api/docs/models/gpt-5.6-terra e https://developers.openai.com/api/docs/models/gpt-4o-transcribe .

| Capacidade observada | Eventos de `usage` | Estimativa parcial USD |
|---|---:|---:|
| Radar (GPT-5.6 Luna) | 2.557 | 3,566923 |
| Documentação (GPT-5.6 Terra) | 5 | 0,082020 |
| Assistência (GPT-5.6 Terra) | 5 | 0,057782 |
| ASR final (GPT-4o Transcribe) | 5 | 0,048245 |
| ASR ao vivo (fallback) | 0 registrados | **não observável** |
| Sessões WebRTC | Não há telemetria faturável correlacionável | **não observável** |
| **Total estimado parcial** | **2.572** | **3,754970** |

No Radar, 84,96% da entrada registrada já está cacheada. A saída representa aproximadamente **84,49% da estimativa teórica do Radar**. Token de raciocínio é parte da saída, sem duplicar preço. Não há prova de ganho financeiro pelo cache atual nem de redução comparativa de cobrança. A modalidade real, service tier, cache writes, custos regionais, impostos e taxas não foram conciliados.

**Limite decisivo:** o método é uma estimativa de tarifas de lista aplicada a eventos de telemetria recuperados, NÃO fatura, NÃO custo real total, NÃO valor economizado, NÃO consumo total do período.

## Hipóteses quantitativas conservadoras — NÃO implantadas

- Se fosse possível eliminar **10% de todas as unidades de consumo de tokens do Radar observadas**, mantendo o mesmo mix (entrada não cacheada, cache e saída), a diferença aritmética seria US$ 0,356692 sobre essa amostra observada. Não extrapolar a produção.
- Se fosse possível eliminar **10% apenas dos tokens de saída do Radar observados**, a diferença aritmética seria US$ 0,301381. Não modificar a saída até haver equivalência clínica de alertas, negações, medicações, perguntas, auditoria e transcrição.
- A existência de 4.627 POSTs ao transporte Realtime sugere necessidade de medir modalidade e sessões, mas não representa 4.627 sessões faturadas. Não há estimativa responsável do custo WebRTC sem relatório externo de uso/faturamento.

As hipóteses de redução de pequenas quantidades de texto têm impacto matemático absoluto limitado nesta amostra conhecida. A prioridade **P0** passa a ser **reconciliação de faturamento de áudio e sessões**, não alterações especulativas de ASR, modelos ou temporização.

## Ferramenta e gates

`scripts/nexa-cost-seven-day-report.mjs`: lê **sete** agregados UTC contíguos (formato de `scripts/nexa-cost-aggregate-report.mjs`), classifica dias sem `usage` mesmo com POSTs, soma tokens e preços apenas quando observados, revela lacunas de áudio, confirma impossibilidade de associar HTTP a cobrança e rejeita campos fora da allowlist. Execução local offline: `node scripts/nexa-cost-seven-day-report.mjs < sete-dias-agregados.json`. Não inserir logs brutos ou dados clínicos; o parser rejeita suas propriedades. 

`tests/nexa-cost-seven-day-report.test.mjs`: fixtures **100% sintéticas e gratuitas**, validam soma, cache, ausência de contadores, recortes incompletos, privacidade e ausência de economia medida. O teste já foi incluído à CI existente. Sem chamadas ao provedor ou ao Supabase.

**Gate para tomar decisão financeira:**
1. Obter na OpenAI somente totais agregados por dia/modelo/modalidade, distinguindo áudio Realtime/WebRTC, transcrição, texto e ajustes de cobrança; evitar API keys, IDs, transcrições ou logs individuais.
2. Conciliar dias completos em fuso UTC, com datas e moeda explícitas; identificar se as modalidades e tiers coincidem com as hipóteses de preço.
3. Antes de qualquer mudança clínica ou de saída, testar equivalência sob supervisão médica: todos os sinais de alarme, medicamentos, doses, negações, transcrição literal, auditoria e latência.
4. Quantificar ganho líquido frente a baseline, preferencialmente com comparação controlada e rollback; sem prova, manter Draft.

**Rollback:** fechamento/revert da PR #118 remove apenas ferramenta/testes/documentação. Nenhum código da produção foi tocado. PRs #115/#117/#92/#93/#94/#111 preservadas.
