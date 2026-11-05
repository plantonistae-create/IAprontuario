# NEXA — P0 Economia de Áudio | Contrato e gates (05/11/2026)

## Situação verificada

- `main` base: `756771c27958a82ecdb07c4078944a82267852fa` (PR #110).
- Produção Supabase: `realtime-call` **v5**, `verify_jwt=true`. **Não foi redeployada.**
- Frontend: `index.html` cria RTCPeerConnection, adiciona trilha do microfone e POSTa SDP via função autenticada; recebe SDP de resposta. Trata apenas eventos de transcrição concluída como evidência. Usa fallback com chunks temporários se WebRTC falhar.
- Função v5: sessão conversacional `type: "realtime"`, modelo padrão `gpt-realtime-2.1-mini` e transcrição `gpt-4o-mini-transcribe`. `server_vad` com `create_response:false`. Fallback por arquivo com `gpt-4o-mini-transcribe`. A gravação final é independente e pertence a `process-consultation`.
- **Divergência de release:** a versão v5 hospedada tem entrypoint de 10.260 caracteres; a fonte do Git tem 10.407 (nova instrumentação). O helper `nexa-ai-capability.mjs` também diverge (8.321 vs 8.402), assim como `deno.json` (115 vs 87). Não substituir o bundle v5 com a árvore Git sem reconciliar imports, versão pinada e regressões.

## Candidato não publicado

`experimental/nexa-live-audio-candidate.mjs` contém somente:

1. Seleção **desligada por padrão**. Mesmo com `flag: 'on'`, produção sempre usa `legacy`; a alternativa só aparece como `candidate-protocol-only` em `runtime:'local'`, e é bloqueada quando se exige diarização nativa.
2. Contrato de `session.update` para **WebSocket servidor** `wss://api.openai.com/v1/realtime?intent=transcription`: `type:transcription`, `gpt-live-transcribe`, `audio/pcm` 24 kHz, `languages:['pt']`, `turn_detection:null`, `delay:medium` e sugestões de palavras médicas.
3. Validação de pacotes `input_audio_buffer.append` e `input_audio_buffer.commit`.
4. Coletor determinístico de transcrições **concluídas** por `item_id`, sem transformar deltas em achados, com marcação de lacunas, falhas e reset.
5. Estimador puramente matemático. Sem medidas reais de áudio do modelo conversacional atual, a economia é **desconhecida** (nunca preenchida com zero).

**Não inclui conexão WebSocket real, upload de microfone, autenticação em produção, geração de token de cliente, gravação, armazenamento ou mudanças no frontend/Edge.** Não pode ser usado em atendimentos.

## Preços de referência públicos (05/11/2026)

| Serviço | Referência |
| --- | ---: |
| `gpt-live-transcribe` ao vivo | US$ 0,017/min |
| `gpt-4o-mini-transcribe` transcrição por arquivo | ~US$ 0,003/min |
| `gpt-realtime-2.1-mini` áudio entrada | US$ 10/1M tokens |
| `gpt-realtime-2.1-mini` áudio entrada em cache | US$ 0,30/1M tokens |
| `gpt-realtime-2.1-mini` áudio saída | US$ 20/1M tokens |

Fontes oficiais:
- https://developers.openai.com/api/docs/pricing
- https://developers.openai.com/api/docs/guides/realtime-transcription
- https://developers.openai.com/api/docs/guides/voice-webrtc

**Não comparar US$ 0,017/min apenas com US$ 0,003/min:** o atual modo WebRTC abre uma sessão de modelo conversacional mais transcrição; seu custo efetivo depende dos tokens de áudio, cache e tempo. O candidato dedicado só será mais barato se o custo completo da sessão atual exceder US$ 0,017/min (na mesma configuração, sem contar custos comuns aos dois pipelines).

## Gates antes de qualquer ativação

- Reconciliar código hospedado v5, autenticadores, CORS, import map e rollback.
- Implementar e homologar servidor WebSocket dedicado que nunca exponha a API key ao navegador; verificar PCM16 mono 24 kHz, VAD local, commit e ordem das falas.
- Medir fidelidade de nomes comerciais, princípios ativos, doses, unidades, negadores, hesitações, acompanhantes e atribuição de médico/paciente, inclusive em casos sintéticos e avaliação humana autorizada.
- Testar iPhone/PWA e fallback real para perda de rede, reconexão, latência, ausência de `item_id`, trechos incompletos e navegadores móveis.
- Medir custo real do transporte atual, **sem reutilizar gravações assistenciais** e sem realizar benchmarks pagos nesta fase; somente depois definir ganho/risco.
- Não misturar texto de Radar transitório com transcrição oficial, áudio persistido nem base de auditoria.

## Status

**PR de laboratório — testes offline/CI. Não fazer merge/deploy clínico com base só nesse protocolo.** O caminho atual permanece inalterado.
