# NEXA — Realtime 502 | Auditoria sem dados clínicos (05/11/2026)

## Evidência existente (somente metadados)

Logs agregados `NEXA_AI_EXECUTION` do projeto Supabase de produção no intervalo consultado:
- 34 tentativas de criar sessão `gpt-realtime-2.1-mini + gpt-4o-mini-transcribe`, todas concluíram com envelope **HTTP_502** na função Edge.
- 977 transcrições em blocos `gpt-4o-mini-transcribe`, todas retornaram sucesso técnico.
- `realtime-call` está em **v5**, ativa, JWT obrigatório, e o frontend usa fallback quando a negociação falha.
- **O 502 NÃO é necessariamente resposta 502 da OpenAI:** a função converte qualquer resposta HTTP não-2xx do upstream em seu próprio `json({error:'REALTIME_SESSION_FAILED',status:upstream.status},502)`. O log de execução observa apenas o envelope 502. Não inferir causa nem faturamento a partir deste código.
- O cliente atualmente envia o SDP da variável `offer.sdp` após `setLocalDescription(offer)`. Não foi validado se a versão enviada incluiu todos os candidatos ICE. Uma comparação com `pc.localDescription?.sdp` após `iceGatheringState === 'complete'` deve ser preparada em navegador descartável **antes** de qualquer alteração clínica. Outros erros possíveis incluem payload de sessão inválido, permissões, limites ou disponibilidade do endpoint. Nenhum deles foi confirmado.

## Alteração desta PR

Instrumentação **somente do status HTTP** retornado pela OpenAI nas tentativas WebRTC e nas falhas do fallback, emitindo:

```json
{"event":"nexa_realtime_upstream_v1","transport":"webrtc","upstream_http_status":400,"successful":false}
```

A linha acima é exemplo sintético e **não representa status observado em produção**.

Nunca registrar SDP, corpo da resposta, cabeçalhos de autorização, transcrição, áudio, prontuário, identificadores de paciente, médico ou encontro. Emissões com payload inválido são ignoradas e falhas do logger não interrompem a consulta. Não muda modo de gravação, limites de tamanho, seleção de modelos, prompt, SSO/JWT, Supabase ou resposta clínica.

## Fonte da produção e entrega segura

`realtime-call` v5 hospedada difere do código atual do Git:
1. `index.ts` remoto 10.260 caracteres versus repo 10.407 por instrumentação anterior de chunks;
2. `_shared/nexa-ai-capability.mjs` 8.321 caracteres hospedados vs 8.402 no Git;
3. `deno.json` inclui configuração `nodeModulesDir` no hosted v5, ausente na fonte do Git.

**Não substituir a função v5 pelo build completo do Git.** Para uma implantação posterior, partir da **cópia byte a byte do bundle hospedado**, acrescentar somente o import e as duas chamadas da instrumentação desta PR, mais o módulo de status aprovado. Verificar diff do entrypoint, outras dependências, `verify_jwt=true`, versão, arquivos implantados e rollback ao bundle anterior. Exigir CI completo verde no HEAD final.

É permitido publicar essa telemetria estritamente sem dados clínicos após gates. A PR não altera API OpenAI nem faz chamadas pagas de teste. A causa upstream exata só será conhecida após observação de **novos eventos reais**, nunca expondo corpo de erro ou dados de paciente.

## Próximo ciclo

1. Agregar `upstream_http_status` por `transport`, sem payload.
2. Se upstream 4xx, validar oferta SDP final, esquema da sessão, modelo e permissões em ambiente sintético autorizado. Se 429, revisar rate limit/quotas. Se 5xx, considerar falha upstream transiente.
3. Inspecionar eventual custo de 502 e latência de fallback a partir de métricas oficiais, separando eventos técnicos de cobrança.
4. Não ativar `gpt-live-transcribe` da PR #111 até homologação e cálculo do transporte completo; preço por minuto do modelo dedicado pode ser maior que o fallback atual.
5. Priorizar fidelidade clínica, negadores, medicamentos, diarização, gravação integral e isolamento entre médicos.

Documentação pública: https://developers.openai.com/api/reference/resources/realtime/subresources/calls/methods/create e https://supabase.com/docs/guides/observability/logs
