# P0-C: telemetria técnica de uso de IA, candidata

Data da inspeção: 2026-11-01. Branch: `feature/ai-usage-telemetry-20261101`.

## Linha de base observada

Consulta agregada, somente leitura, aos `function_edge_logs` de produção nas últimas 24 horas: `realtime-call` 1.306 requisições (17 respostas 5xx), `realtime-radar` 1.118 (6 respostas 5xx), `process-consultation` 30 (0 respostas 5xx) e `clinical-assistant` 16 (0 respostas 5xx). São contagens de requisições, não de chamadas faturadas, tokens ou custo. O valor de aproximadamente US$ 10/semana foi informado pelo proprietário e não foi conciliado com faturamento do provedor.

## Alteração técnica

Quando o provedor OpenAI informa uso na resposta, as Edge Functions passam a emitir somente `capability`, `model`, contadores de tokens, tokens em cache e/ou duração de áudio. O helper rejeita propriedades livres, identificadores, texto clínico e números inválidos. Não altera a resposta clínica nem envia uma nova requisição ao provedor.

Cobertura inicial: Radar contextual, transcrição final, documentação, assistência clínica e transcrição de fallback em chunks. A sessão WebRTC direta ainda não devolve métricas de uso ao backend neste fluxo. Gemini e NEXA Core também não são contabilizados por esse helper. Falhas upstream sem objeto `usage` continuam visíveis pelos status técnicos, mas não têm valor faturado calculado.

Não há cálculo de custo por consulta, dashboard nem alerta financeiro nesta entrega. Valores monetários exigem preços do modelo efetivo, reconciliação com o faturamento, atribuição segura por consulta e tratamento da lacuna de WebRTC. A próxima otimização de chamadas deve usar essa linha de base, sem atrasar sinais de alarme.

Nenhum dado clínico, áudio, transcrição, identificador de usuário ou encontro deve ser incluído nos eventos técnicos.
