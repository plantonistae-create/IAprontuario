# NEXA — G3, comparação offline do contrato multipart e métricas de transporte

Data de checkpoint: 2026-11-07. Uso exclusivo de fixtures fictícias, sem enviar HTTP, SDP real, áudio, chaves ou dados de pacientes.

## Três formas de codificação do multipart
O endpoint oficial OpenAI [POST /v1/realtime/calls](https://developers.openai.com/api/reference/resources/realtime/subresources/calls/methods/create) documenta `sdp` como **string** e `session` como objeto opcional em `multipart/form-data`. Seu exemplo HTTP utiliza `sdp=<offer.sdp;type=application/sdp` (conteúdo de arquivo em um campo multipart tipado, sem `filename`) e `session={...};type=application/json`. Distinguir esta convenção de uma parte que possui `filename`.

Os testes `tests/nexa-realtime-formdata-matrix.test.mjs` comparam: **hospedada v6** usa Blob/filename (`offer.sdp`, `session.json`); **candidata offline** usa `form.set` strings sem filename; **controle no estilo curl** é representado por fixture estática de cabeçalho `Content-Type: application/sdp` sem filename. Em Node, campo string de FormData não permite definir MIME arbitrariamente como Blob sem filename. A comparação comprova apenas **diferenças do envelope**, não qual delas foi rejeitada pelo provedor.

Nenhum teste deve afirmar causa provada para os 400 sem resposta sanitizada do upstream, pois a v6 deliberadamente não registra corpo de erro por privacidade. **Não aumentar logging de corpo, SDP, consulta ou áudio**.

## Evidência agregada
`2026-11-07T01:00:00Z` a `2026-11-08T01:00:00Z`: 771 respostas Edge POST 200, 30 Edge POST 502, 808 OPTIONS 200, 30 registros upstream `webrtc` HTTP 400 e 30/30 pares por `execution_id`. A razão de 502 vinculados ao 400 é 100%; **não** corresponde à taxa de falha WebRTC. Os 771 POST 200 misturam modalidades de transporte, inclusive fallback por chunk. O novo analisador `scripts/nexa-realtime-status-accounting.mjs` exige entradas agregadas e conserva campos para sucesso de WebRTC, faturamento e economia como `null`.

## Segurança de integração e próximos gates
Testes G2 já verificam cancelamento independente do handshake e do parent de chunks na VM. G3 agrega formato de multipart e guardrails quantitativos. Executar CI inteira incluindo Radar e NEXA Core. Não realizar merge/deploy, alterar `main`, `realtime-call` v6, JWT/RLS, PRs #118/#119/#121, segredos ou dados reais.

`savings_attributable_to_nexa_change_usd=null` até obter dados oficiais de cobrança reconciliados e controles válidos de uso clínico. Homologação real e chamadas pagas exigem autorização separada.
