# NEXA G4 — laboratório isolado, resultados e STOP de produção

Data: 2026-11-08. Base: main a25ec36, PR #138 merged. G4 altera apenas código
offline, casos sintéticos, fixture PostgreSQL em GitHub Actions e documentação.
**Não migrar** \`transactional-reservation.REVIEW-ONLY.sql\` para Supabase hosted.

## 1. Radar clínico e falantes

- Regressões adversariais cobrem fala duplicada entre paciente/acompanhante, LOCUTOR
  sem papel confirmado, discordância explícita e silêncio/hesitação.
- Classificação de evidência continua derivada do controlador original, sem
  segunda fonte de verdade nem transcrição exibida durante a consulta.
- Replay Core usa apenas casos artificiais e continua bloqueado por alertas
  esperados faltantes. Um parecer simulado \`approved\` não neutraliza o gate.
- Resultado de teste sintético **não** equivale a validação clínica prospectiva.

## 2. Quotas: separação de autoridade, concorrência e fallback

- O PostgreSQL 16 efêmero ganhou \`tenant_admin_approvers\`. Um vínculo
  \`tenant_memberships\` agora exige \`authorized_by\` e \`authorized_at\`
  referenciando um aprovador do mesmo tenant. Inativação do aprovador deve
  invalidar novas reservas. Nenhuma role pública pode consultar o schema.
- \`service_role\` mantém SELECT/UPDATE(active) mínimo para os bloqueios
  \`FOR SHARE\`, **sem** INSERT de aprovadores nem alteração de \`authorized_by\`.
  Isto prova o comportamento do fixture, **não** a origem administrativa
  dos vínculos do ambiente hospedado.
- \`fail-safe-bridge.LAB-ONLY.mjs\` requer adaptadores servidores para
  \`getVerifiedUser\`, \`getAdminMembership\`, \`ownsEncounter\`, \`reserve\`,
  \`invokeRemote\` e \`localFallback\`. É apenas desenho executável offline;
  nenhum deles está conectado à função hosted.
- Somente retorno \`RESERVED\` confirmado permite **uma** tentativa remota.
  \`ALREADY_RESERVED\` sem recibo conclusivo **não** dispara outra chamada.
  Falha de autoridade, banco, tempo ou limite cai em revisão local; falha
  de fallback gera STOP. Erro após disparo remoto conserva resultado UNKNOWN:
  não repetir automaticamente e não esconder a tentativa potencialmente paga.
- Falta ensaiar auth.getUser(token) real no Edge, vínculo da fonte administrativa,
  isolamento de sessão/autorização, expiração e reconciliação de reservas,
  concorrência com revogação, modelo/preço, limites por tenant e políticas
  operacionais antes de qualquer ativação.
- O fixture não deve armazenar histórico de paciente nem tokens/JWTs.
  IDs são UUIDs fictícios sem relação com a base real.

## 3. WebRTC e fallbacks (sem chamadas de rede)

- O código hospedado devolve \`REALTIME_SESSION_FAILED\` com wrapper 502 em
  falha HTTP upstream, preservando upstream.status no corpo técnico.
- Erros de timeout e abort podem entrar no catch e virar 500 INTERNAL_ERROR;
  quando não há resposta do provedor, o wrapper **não** prova um upstream 400/502.
- \`offline-outcome.LAB-ONLY.mjs\` mantém separados: upstream HTTP 400,
  upstream HTTP 502, wrapper-only 502, timeout, cancelamento voluntário,
  cancelamento de origem desconhecida e exceção antes do status HTTP.
- Proibido registrar SDP, body, áudio, transcrição, tokens, usuário ou URL.
  Retry automático continua desligado. Nenhuma causa-raiz de HTTP 400/502
  foi demonstrada por replay remoto ou inspeção de tráfego vivo.

## 4. Shadow/Core e custos agregados

- \`nexa-g4-shadow-gates.test.mjs\` preserva NO-GO de alertas não equivalentes
  e não transforma snapshots remotos fornecidos offline em validação.
- \`window-comparison.LAB-ONLY.mjs\` compara apenas totais declarados,
  intervalos de mesma duração, mesmas capacidades, consultas não nulas
  e igualdade com faturas também declaradas.
- Diferença descritiva de US$/consulta **não** é economia causal. Não foram
  consultadas faturas oficiais, preços atuais, dados reais ou chamadas pagas.
- Falta conciliar faturas oficiais, mix de modelos e de consultas, janela
  equivalente, volumes por capacidade e medidas de qualidade/latência.

## Condições de GO/NO-GO, publicação e rollback

- GO permitido: testes/documentação e código laboratorial, após CI integral.
- NO-GO: SQL remoto, deploy Edge, JWT/RLS/segredos, mudanças no realtime-call
  hosted v6, realtime-radar v12, process-consultation v24, uso real, cotas live
  ou conclusão clínica sem gate adicional e autorização separada.
- Publicação segura, se aprovada: merge apenas destes arquivos; validar CI
  pós-merge + GitHub Pages. Reversão: revert do commit de merge, sem SQL ou
  dados de produção para restaurar. Manter PRs #118/#119/#121/#134 Draft.

## Ação humana indispensável — nenhuma neste lote

Para um futuro gate hosted: selecionar autoridade administrativa real,
realizar revisão de risco clínico/segurança e autorizar explicitamente
qualquer migração/Edge deploy. Hoje **não executar** nenhum passo desses.
