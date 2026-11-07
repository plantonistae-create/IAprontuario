# NEXA P0 — Reconciliação offline WebRTC 400/502, v6 hospedada e PR #121

**Data:** 07/11/2026 · **Escopo:** diagnóstico técnico e gate de cancelamento sem áudio real. **Este documento NÃO autoriza publicação da realtime-call v6 ou merge/deploy da PR #121.**

## Evidência objetiva, sem conteúdo clínico

- As duas CIs da PR #132: [#42345017842](https://github.com/plantonistae-create/IAprontuario/actions/runs/42345017842) e [#42345228212](https://github.com/plantonistae-create/IAprontuario/actions/runs/42345228212), concluíram SUCCESS; main em cb95e0e19dcc9d81947e791ff5d10537104d0686 no início deste lote.
- Produção Supabase: função realtime-call **v6**, ativa, verify_jwt=true, hash de bundle hospedado (ezbr_sha256) **1675c95f6b1a25569c6af86e5c461f05fd475ee0d8a759439631d2d56221e005**.
- Staging: realtime-call v5, **não usar como substituto da produção**.
- Bundle v6 observado: quatro arquivos (realtime-call/index.ts, _shared/nexa-ai-capability.mjs, _shared/nexa-realtime-upstream-status.mjs e deno.json).
- Reconsulta agregada de logs técnicos da produção em 07/11/2026 (janela padrão das últimas 24h): **11 eventos nexa_realtime_upstream_v1**, todos transporte webrtc, todos upstream_http_status=400. Isso não comprova custo faturado, nem que o status 400 tenha uma causa única. O envelope HTTP_502 vem do wrapper Edge no ramo não-2xx.
- O bundle v6 constrói os campos sdp e session com Blob e filename, enquanto a referência OpenAI de POST /v1/realtime/calls descreve **sdp como string** e **session como objeto de configuração multipart**. A PR #121 adapta a construção para FormData.set('sdp', sdp) e FormData.set('session', JSON.stringify(session)). É uma correção plausível de contrato, **não evidência de aceitação upstream**.
- A fonte main da realtime-call é mais antiga e diverge da v6 em index.ts, helper de capacidades e deno.json. Não fazer deploy da main ou da PR #121 diretamente: a fonte de verdade para qualquer candidato de deploy futuro é a v6 **hospedada**, com comparação arquivo a arquivo, verify_jwt mantido e plano de rollback.

Referência: https://developers.openai.com/api/reference/resources/realtime/subresources/calls/methods/create

## Achado independente: negociação pendente após fallback

O cliente em index.html inicia fallback após 10 segundos sem abrir o canal WebRTC. Antes deste lote, a negociação HTTP podia continuar pendente mesmo depois de iniciar o fallback; uma requisição órfã pode desperdiçar recursos, mas **não é possível quantificar economia ou afirmar ausência de cobrança** sem metadados oficiais.

Este lote propõe no frontend um controlador de aborto **separado da controladora de chunks**:

1. WebRTC tem radarNegotiationAbort isolado; o fallback cancela somente a negociação.
2. O controlador radarTransportAbort continua responsável por cancelar chunks em stop/revisão.
3. stopRealtimeRadar cancela ambos, e a revisão antiga não pode atualizar a sessão nova.
4. Sem mudança em modelo, prompt, sessão OpenAI, JWT/RLS, payload clínico, limite de chunk, cadência, armazenamento ou backend Supabase.

**Não publicar o frontend apenas com o teste sintético**: a homologação de continuidade de gravação e transcrição pelo proprietário ainda é gate físico/clínico.

## Gates sintéticos implementados

tests/nexa-realtime-lifecycle-offline.test.mjs exercita o código real do frontend num contexto Node isolado com doubles para WebRTC, MediaRecorder, Supabase Auth e fetch, cobrindo:

- upstream 400 / envelope Edge 502: fallback único e fechamento do peer;
- deadline WebRTC 10s: aborto da negociação pendente sem abortar o gravador de chunks;
- stop durante negociação: aborto e ausência de fallback tardio;
- deadline de chunk 18s: aborto somente da requisição do chunk;
- invariantes de autenticação, limite 1 MiB, fila de no máximo quatro chunks, monitoramento técnico por status.

Não há fetch externo: todas as URLs são example.invalid interceptadas por mock. Não há áudio, prontuários, contas reais, segredos, OpenAI paga ou deploy.

## Gates ainda bloqueados

1. **PR #121 permanece Draft e intocada.** Exigir candidato derivado byte a byte da função v6 hospedada, que incorpora apenas o ajuste multipart e preserva helper, deno.json, Auth/JWT e fallback. Fazer diff de cada arquivo e validar versão/hash de rollback.
2. Validar formato final de SDP e coleta de ICE no navegador descartável, separando hipóteses de causa (multipart, ICE, schema de session, modelo, autorização e quota).
3. Validar cancelamentos, falha 400/401/429/5xx, timeouts e troca de fallback com áudio **exclusivamente sintético**, depois homologação humana dos critérios de continuidade e qualidade clínica.
4. Somente depois de **autorização específica** e teto de custo explícito, fazer ensaio autenticado de upstream; sem isso, a causa final do 400 continua não comprovada.
5. Reconciliação financeira requer agregados oficiais de faturamento por dia UTC/modelo/modalidade, especialmente WebRTC/ASR; contagem de POSTs ou 502 não é economia em USD.
6. Não tocar PRs #118/#119, credenciais, políticas JWT/RLS, gravação oficial, NEXA Core, telemetria identificável ou dados reais.

**Rollback:** enquanto esta PR permanecer Draft, não há alteração em produção. Se a alteração do frontend for autorizada e publicada futuramente, reverter apenas o commit de negociação do index.html, executar CI e verificar a restauração do comportamento original de fallback. Não usar rollback genérico de Edge Function que apagaria diferenças existentes da v6.
