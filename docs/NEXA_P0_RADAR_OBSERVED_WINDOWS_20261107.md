# NEXA P0 — Medição de uso em janelas antes/depois da PR #132 (somente agregado)

Verificação read-only em 2026-11-07, Supabase produção `fmkrcieubrlltiggyauc`, fonte `function_logs`. A PR #132 foi mergeada em 2026-11-07 às 06:02:26 UTC. Usamos janelas de 18 horas **não sobrepostas**, separadas por 30 minutos para evitar misturar o deploy.

| Métrica técnica | Antes: 06/11 12:00–07/11 06:00Z | Depois: 07/11 06:30–08/11 00:30Z |
|---|---:|---:|
| Eventos `nexa_ai_usage_v1` de `realtime.radar` | 223 | 639 |
| Tokens Radar entrada | 1.006.910 | 2.903.358 |
| Tokens Radar entrada cacheados | 871.420 | 2.512.045 |
| Tokens Radar saída | 233.742 | 638.650 |
| Eventos `clinical.documentation` | 8 | 24 |
| Eventos Radar / evento documentação | 27,875 | 26,625 |

A razão técnica cai aproximadamente **4,48%** (-1,25 por evento de documentação), mas a atividade de documentação triplicou; um evento de documentação NÃO equivale necessariamente a uma consulta. Não há contagem confiável de cliques apenas avaliados/dispensados nem deduplicação por encontro nesta telemetria. **Isto não mede economia causada pela PR #132.**

Faturamento oficial OpenAI e áudio WebRTC não foram conciliados. `realtime-call` hospedada v6 não emite `emitUsage("realtime.transcription", ...)` no fallback; ausência de métrica não significa custo zero. Não calcular economia como `POSTs evitados × tarifa`; solicitações HTTP não equivalem a chamadas faturadas.

O novo `scripts/nexa-cost-observed-delta.mjs` apenas compara **agregados de cobrança declarados como oficiais** (por modelo, modalidade, USD e janela UTC) depois de recebidos. A análise rejeita dados identificáveis, eventos brutos, blocos não comparáveis e falta de cobertura de áudio; sempre deixa `savings_attributable_to_nexa_change_usd=null` porque mudança de gasto não demonstra causalidade. Fonte declarada não equivale a exportação autenticada: exige conferência humana contra a cobrança oficial.

Para fechar o gate financeiro: fornecer exportação agregada da OpenAI por dia UTC, projeto, modelo e modalidade, verificar custo de áudio/serviço e contar consultas por agregados independentes; só então comparar janelas equivalentes de uso e qualidade clínica. Nenhuma chamada paga, dado clínico real, alteração de Edge, credencial, JWT/RLS, merge ou deploy foi realizada.
