# NEXA P0 G2 — Isolamento offline de cancelamento WebRTC / fallback

Fonte: funções reais de transporte e fallback extraídas do `index.html` HEAD cb95e0e. Nenhum microfone, dado real, API externa ou chamada paga.

## Defeito/riscos verificáveis
A negociação WebRTC usa `radarTransportAbort.signal`; os envios de chunks registram nesse mesmo sinal um listener de cancelamento. Watchdog 10 s inicia fallback sem abortar negociação ainda pendente. Simplesmente abortar `radarTransportAbort` no fallback também rompe a relação de cancelamento dos chunks posteriores. Sobreposição de fetch **não prova faturamento duplicado**.

## Teste de candidata somente em VM
Os novos casos em `tests/nexa-webrtc-fallback-mocked-runtime.test.mjs` injetam uma separação experimental: `radarRealtimeHandshakeAbort` controla só handshake; `radarTransportAbort` mantém sessão e chunks; `stopRealtimeRadar` encerra ambos.

A matriz cobre: (1) watchdog aborta handshake mas permite chunk; (2) timeout chunk 18 s não aborta parent nem produz retry; (3) parada cancela upload e revision obsoleta; (4) parada durante handshake não inicia fallback tardio; (5) `onopen` não inicia fallback e `onclose` aciona apenas um gravador.

## Evidência externa limitada
Na janela `2026-11-07T01:00:00Z` até `2026-11-08T01:00:00Z`, consulta agregada read-only de `function_logs`: 30 eventos `transport=webrtc` e `upstream_http_status=400`. Não comprova causa do 400 nem custo de faturamento. Nenhum áudio, SDP, identificador ou registro clínico foi lido.

**STOP**: nenhuma alteração em frontend produtivo, Edge v6, JWT/RLS, segredos, produção ou PRs #118/#119/#121. Exigir homologação real e autorização específica antes de merge/deploy ou requisições pagas.
