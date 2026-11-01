# P0-C: telemetria técnica do Radar, candidata incremental

Data da inspeção: 2026-11-01. Branch: `feature/ai-usage-telemetry-20261101`.

## Linha de base observada

Consulta agregada, somente leitura, aos `function_edge_logs` de produção nas últimas 24 horas: `realtime-call` 1.306 requisições (17 respostas 5xx), `realtime-radar` 1.118 (6 respostas 5xx), `process-consultation` 30 (0 respostas 5xx) e `clinical-assistant` 16 (0 respostas 5xx). São contagens de requisições, não de chamadas faturadas, tokens ou custo. O valor de aproximadamente US$ 10/semana foi informado pelo proprietário e não foi conciliado com faturamento do provedor.

## Primeira publicação limitada

A fonte atualmente hospedada de `realtime-radar` em produção coincide arquivo por arquivo com o código de `main` usado nesta branch. `process-consultation` e `realtime-call` diferem de `main`, então sua instrumentação foi retirada desta PR até reconciliação segura. Esta versão registra somente o uso devolvido pelo provedor OpenAI para o Radar contextual: capacidade, modelo, contadores de entrada/saída e cache. O helper rejeita propriedades livres, identificadores, texto clínico e números inválidos. Não altera a resposta clínica nem envia uma requisição adicional.

O código do backend permanece protegido por JWT. A telemetria não atribui valor monetário nem identifica consultas. O passo seguinte é conciliar consumo agregado com cobrança e verificar o desvio entre requisições à função e chamadas faturadas; otimizações de chamadas devem ser medidas depois, sem atrasar sinais de alarme.

## Lacunas

ASR ao vivo, ASR final, documentação, assistência, Gemini e NEXA Core não são contabilizados nesta primeira publicação. Faltam custo por consulta, painel, alerta financeiro e reconciliação do uso de WebRTC. Não há economia medida. Nenhum áudio, transcrição, identificador de usuário ou encontro deve ser incluído nos eventos técnicos.

Rollback operacional: restaurar a versão anterior de `realtime-radar` preservada antes do deploy; o commit anterior de `main` conserva o código sem a nova telemetria. A ativação hospedada e a verificação pós-deploy são gates separados do CI.
