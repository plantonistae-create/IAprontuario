# NEXA P0 Economia Real 8.0 — Gate de transporte WebRTC (sem chamadas ao provedor)

Data da verificação: 2026-11-05. PR #118 Draft, base `main` no checkpoint `51e2c950b50b08838b9bc9eb9262ba83b9b78b46`. Somente análise e simulação sintética. **Nenhum arquivo da interface clínica, função Edge, banco, migração, JWT/RLS, prompt, modelo, ASR, cadência ou workflow de produção foi alterado.**

## Evidência reproduzível sobre os 502

O frontend `index.html` envia a oferta de `RTCPeerConnection` ao backend logo após:
```js
const offer = await pc.createOffer();
await pc.setLocalDescription(offer);
// ... body: JSON.stringify({sdp:offer.sdp,...})
```
O objeto `offer.sdp` é um snapshot anterior ao término eventual da coleta ICE. `pc.localDescription?.sdp` pode se modificar após o `setLocalDescription` caso ocorram candidatos novos. O código não espera `iceGatheringState === 'complete'`. Isso é **lacuna técnica plausível**, não diagnóstico causal do 502. WebRTC também pode funcionar com trickle ICE em implementações que o suportam; nenhuma mudança deve ser publicada por essa hipótese isoladamente.

A Edge `realtime-call` v6 passa `sdp` e `session` em form-data para `/v1/realtime/calls`, mas converte *qualquer* status HTTP não-2xx vindo da OpenAI para seu próprio envelope HTTP 502 com corpo `REALTIME_SESSION_FAILED`. Um envelope Edge 502 pode portanto mascarar 400, 401, 403, 422, 429 ou 5xx upstream. A causa e a cobrança reais permanecem **desconhecidas**.

Fontes: https://developers.openai.com/api/reference/resources/realtime/subresources/calls/methods/create ; `index.html`, `supabase/functions/realtime-call/index.ts` no GitHub; cópia da Edge v6 hospedada (somente leitura).

## Verificação da cobertura por versão hospedada

- `realtime-call` hospedada: **v6 ativa, verify_jwt=true**, publicada em **2026-11-05 12:02:18.360 UTC**.
- As janelas somente agregadas **2026-11-05 10:30–12:01 UTC** e **12:03–13:30 UTC** retornaram **zero POSTs** `realtime-call`, zero execuções de sessão WebRTC e zero eventos `nexa_realtime_upstream_v1`. Portanto **não existe tráfego depois do deploy nessa janela capaz de provar se a telemetria está funcionando**.
- Na série de sete dias anterior (29/10 13:30Z até 05/11 13:30Z), houve **161 logs de tentativa WebRTC, todos com envelope HTTP_502**, e **4513 sucessos técnicos / 4515 execuções do fallback em blocos**. Esses números **não são contagens de chamadas faturadas nem prova de resposta HTTP 502 do provedor**.
- A função hospedada v6 possui o helper de status `nexa_realtime_upstream_v1`, mas **não possui** o `emitUsage("realtime.transcription", ...) ` existente na fonte `main` para respostas de fallback, e recebe resposta JSON que pode não fornecer métricas de usage. Assim, a contagem zero de `realtime.transcription` **não mede custo zero do áudio**.
- Não publicar uma substituição da v6 pelo bundle completo da `main` sem reconciliação arquivo-a-arquivo, porque as cópias hospedada/Git estão divergentes.

## Testes isolados gratuitos

`experimental/nexa-webrtc-negotiation-lab.mjs` usa um `RTCPeerConnection` fictício, com SDP fictício e endereço reservado `192.0.2.10`, para demonstrar que o `offer.sdp` original pode conter **0 candidatos**, enquanto `localDescription.sdp` após conclusão da coleta contém **1**. A saída do laboratório contém **somente contagens e flags** — nunca o SDP, endereços, áudio, transcrições ou credenciais. Não há navegador real, microfone, API paga ou acesso à produção.

O mesmo laboratório compara respostas upstream **simuladas** 400, 401, 403, 422, 429, 500 e 503 que se tornam envelope **502** na Edge, provando apenas a ambiguidade do código. Testes em `tests/nexa-webrtc-negotiation-lab.test.mjs` verificam a restrição de rede, a natureza fictícia dos dados e o contrato do frontend. `package.json` liga esses testes à suíte existente de CI.

**Não confundir simulação com reprodução de um incidente real.** A PR não adiciona `ICE gathering`, não envia novas ofertas e não modifica fallback.

## Gates obrigatórios

1. CI completa do HEAD final verde; a primeira etapa pode ter flakiness preexistente do Playwright (clique `#nexaNewCaseBtn` ou alternância PS em viewport mobile), mas não mexer em comportamento clínico apenas para fazer CI passar. Executar rerun e preservar logs de falha.
2. Verificar novo evento `nexa_realtime_upstream_v1` **somente após sessão real que ocorra naturalmente**, com tráfego posterior à v6; não criar sessão real ou chamada paga para teste. Agregar apenas `transport`, `upstream_http_status` e contagem, sem SDP, cabeçalhos, médicos ou paciente.
3. Teste de negociação com mocks e oferta SDP final em navegador descartável, sob dados sintéticos, antes de propor correção de runtime. Comparar 200/4xx/429/5xx, timeout, fallbacks e latência.
4. Obter cobrança agregada oficial da OpenAI por dia UTC/modelo/modalidade (áudio WebRTC e chunks), compatibilizar com janelas Supabase. A análise por tokens observáveis (~US$ 3,75) exclui custo de áudio ainda não observado.
5. Não trocar modelos/ASR ou 12/16s sem equivalência clínica comprovada para alertas, medicamentos, doses, negações, transcrição e auditoria.
6. Mudanças futuras devem ser em PR independente, com rollback explícito. **Sem merge/deploy** da PR #118 nesta etapa.

**Decisão:** P0 segue gate fechado. Mais micro-otimizações de texto sem reconciliação da fatura não demonstram economia real. Priorizar observabilidade do upstream no tráfego natural e exportação de faturamento agregado antes de qualquer troca de transporte.
