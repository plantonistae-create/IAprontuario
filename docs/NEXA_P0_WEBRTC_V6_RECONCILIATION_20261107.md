# NEXA P0 — Reconciliação congelada de WebRTC hospedado v6
Data: 2026-11-07. PR #121 permanece **Draft**. Não executar merge, deploy ou chamada paga.

## Proveniência e preservação
- Supabase produção: projeto `fmkrcieubrlltiggyauc`, função `realtime-call` **v6**, `verify_jwt=true`.
- Identificador SHA-256 do bundle hospedado (Supabase): `1675c95f6b1a25569c6af86e5c461f05fd475ee0d8a759439631d2d56221e005`.
- `labs/nexa-realtime-v6/reference/` contém cópia **somente leitura/referência** do código hospedado, helpers e `deno.json`, sem valores de segredos ou informações clínicas reais.
- `labs/nexa-realtime-v6/candidate/index.ts.txt` preserva byte a byte o código v6, exceto o único bloco que constrói `FormData`: duas partes de arquivo são substituídas por campos textuais `sdp` e `session`.
- Os arquivos `.txt` do laboratório são **inertes** e não participam da função real. Não copiar automaticamente a candidata para produção: a assinatura do bundle completo, a validade de JWT e todos os gates devem ser reconfirmados antes de qualquer deploy.

## Evidência agregada read-only recente
- Janela móvel de 24 horas consultada em 07/11/2026: **31** POSTs com envelope HTTP 502 na `realtime-call` v6.
- Os **31** registros de `nexa_realtime_upstream_v1` identificam `transport=webrtc` e `upstream_http_status=400`. Logo, o upstream **de fato respondeu HTTP 400**, e a Edge apresentou esses retornos como 502.
- Na mesma consulta: **812** POSTs com HTTP 200 e **851** preflights OPTIONS com HTTP 200; não inferir equivalência clínica, sucesso de WebRTC ou custo em US$ desses números.
- A suspeita de campos multipart com `filename` é material e reproduzível, mas não é prova isolada de causalidade; ICE incompleto, parâmetros de sessão, acesso e demais hipóteses continuam abertas.
- Nenhum SDP, áudio, transcrição, identificador de paciente ou corpo de upstream foi lido ou incluído na análise.

## Diferenças hospedado x Git
- O `main`/PR #121 parte de um `index.ts` diferente do hospedado: inclui `emitUsage("realtime.transcription",...)` no fallback; o hospedado v6 não. O hosted v6 também possui helper de capacidade e `deno.json` próprios. **Não substituir o pacote v6 pelo Git cegamente.**
- A PR #121 mantém seu teste de contrato multipart; o novo teste valida **a candidata construída a partir do bundle v6 efetivo** e a preservação exata do resto do arquivo.
- As provas sintéticas de fallback, interrupção do data channel, watchdog de 10 s e cancelamentos permanecem na PR #118. Em especial, abortar o controlador compartilhado ingenuamente pode afetar cancelamento dos chunks; nenhuma mudança de runtime é autorizada por esta pesquisa.

## Gates de produção ainda fechados
1. CI integral da PR #121 após este commit; verificar compatibilidade do branch com `main` atualizado.
2. Homologar fallback, cancelamento e timeout em browser isolado, usando apenas dados fictícios; preservar autenticacão e observabilidade.
3. Conciliação financeira por modalidade e período UTC; **nenhuma economia em US$ demonstrada**.
4. Antes de publicar, comparar novamente o bundle hospedado, verificar SHA, rollback, JWT e permissões; autorização específica do usuário para deploy da `realtime-call` e da PR #121.
5. Um teste pago de aceitação upstream e equivalência clínica só pode ocorrer após autorização expressa de custo e proteção dos dados. Não executado.

Referência OpenAI: https://developers.openai.com/api/reference/resources/realtime/subresources/calls/methods/create e https://developers.openai.com/api/docs/guides/voice-webrtc
