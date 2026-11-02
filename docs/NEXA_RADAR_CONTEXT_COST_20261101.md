# Radar: redução conservadora do contexto reenviado

## Medição anterior

Consulta agregada aos logs técnicos de produção em 1/11/2026, janela padrão de 24 horas, somente eventos `nexa_ai_usage_v1` da capacidade `realtime.radar`:

| Modelo | Chamadas | Tokens de entrada | Tokens de saída | Tokens de entrada em cache |
| --- | ---: | ---: | ---: | ---: |
| `gpt-5.6-luna` | 280 | 1.311.380 | 287.937 | 1.082.172 |

O provedor informou cache em 82,5% dos tokens de entrada. A amostra não identifica encontros, usuários ou conteúdo clínico e não inclui faturamento. Não há comparação antes/depois nem economia monetária comprovada.

## Alteração candidata

O contexto enviado ao Radar deixa de repetir `sugestoes_perguntas`, `orientacoes_alta` e `_include_hipotese`. Os dois campos de texto são produzidos pelo aplicativo e não são evidência do relato do paciente. Permanecem queixa, HDA, antecedentes, comorbidades, alergias, medicações, exame, sinais vitais, hipótese, conduta, transcrição e CID. O estado anterior enviado ao provedor mantém respostas manuais e deixa de incluir IDs de médico e encontro e a trilha de perguntas exibidas.

A análise local continua recebendo todos os campos clínicos relevantes. Não há alteração de modelo, prompt, limite de saída, tempo de espera, detecção de sinais de alarme ou função hospedada. A otimização opera apenas quando o frontend publicado for carregado.

## Evidência e limite

Testes de contrato com dispneia e broncoespasmo preservam os mesmos itens, alertas e lacunas críticas. O E2E verifica o corpo enviado pelo navegador, a análise durante gravação e a revisão posterior. A redução de bytes no teste sintético com sugestões extensas é apenas demonstração de mecanismo; o tamanho e custo reais devem ser medidos após publicação com amostragem comparável. É preciso ampliar a telemetria de ASR e documentação após reconciliar as funções hospedadas.

Rollback: retornar o frontend da main ao commit anterior. Nenhuma migration ou mudança de backend é necessária.
