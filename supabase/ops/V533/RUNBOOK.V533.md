# NEXA V5.34 — Runbook de implantação do servidor (NADA DESTE ARQUIVO FOI EXECUTADO)

Base: `main` c4caef5b56e9b442673975acac69779beae2f953 + PR #189. Frontend, `sw.js`, `nexa-ui-v3.js` idênticos a 0eabf172; `vaultPilot.enabled=false`, `remotePreservation=false`, `assistAuthority=false`, `audioRetention.enabled=false`.
Gate C: NO-GO 0/19. PASS físico iPhone/Android: NOT_RUN. Piloto dormente. As nove RPCs antigas têm endurecimento separado: este runbook não revoga nada nelas.
**Regra permanente: nenhum rollback apaga dados.** Nunca apagar schemas ou tabelas de captura, backup de áudio ou autorização; reverter é sempre REVOKE (reversível por `reenable.Mk.sql`).

## Arquivos e sha256 completo (conferir com `shasum -a 256` contra a main antes de colar qualquer coisa)
| Item | Arquivo | sha256 |
|---|---|---|
| M1 | `proposals/V515/assist_authority.CANDIDATE.sql` | `03f5700d1c0f2c873f0589ff3ed697ff8e030b262720fea3d408f95d973641e7` |
| M2 | `proposals/V523/capture.CANDIDATE.sql` | `7fb1fd8994831c237ae5d8c1df5f72f19b9de2ca1cdf4c6d76ee4012e42cb60d` |
| M3 | `proposals/V523/audio_backup.CANDIDATE.sql` | `6fb4d478a929947147346f3beb9caca84684dd6cc3401f490b0c99ea08ceb5f2` |
| M4 | `proposals/V525/admin_preservation.CANDIDATE.sql` | `7aeb3758591b18cc411d8f326da56576a7e9820011d3a4f78a64fd9555142e02` |
| rollback.M1 | `proposals/V533/rollback.M1.NON-DESTRUCTIVE.sql` | `5ff6eaa52e9e473d2ade24b7dd2708476023defad38010fc6b93834b5a362911` |
| rollback.M2 | `proposals/V533/rollback.M2.NON-DESTRUCTIVE.sql` | `c8ca364105402d3e3b9a55593fd274a399ca7033da0ffd0830d9010dd1a1ac74` |
| rollback.M3 | `proposals/V533/rollback.M3.NON-DESTRUCTIVE.sql` | `542306a9e7cb3369bc1e4995f458f079c51e3be28e7ce38df6dffae0fc67635e` |
| rollback.M4 | `proposals/V533/rollback.M4.NON-DESTRUCTIVE.sql` | `5936505e4116fe83cdb2547a3217918ce770ce4879b88a65b238c74952e4218f` |
| reenable.M1 | `proposals/V533/reenable.M1.sql` | `1cb2dce9910bf49e2cfd37b579ad82955ce0e0fbafc9be3bb98d52205a1235b7` |
| reenable.M2 | `proposals/V533/reenable.M2.sql` | `8a08dbd16168126a3b8f350ff68623856c2715a511d74f54f54208af6f6b1ef1` |
| reenable.M3 | `proposals/V533/reenable.M3.sql` | `c13f1e63f2c8ec879fa07b299c4535d827f3723bf4cf3604f4c1dc5640f127e7` |
| reenable.M4 | `proposals/V533/reenable.M4.sql` | `e42a1d3c189120c05ebeb88c0c59ee48ef93746b6b8f653cc90c658d8f86db79` |
| verify | `ops/V533/sql/post-apply-verify.V533.READ-ONLY.sql` | `f879ebe9fec51c2e5883e63767af505e989a9fbb20555a9c66aa54eec1bb6f4c` |
| aws_key_policy | `ops/V533/aws/kms-key-policy.json` | `0ce21ad40885f5cb5f306cd4e6e571e779fa3bc1ce50d40e7f958ef1b26ff6f4` |
| aws_identity_policy | `ops/V533/aws/iam-policy.nexa-edge-kms.json` | `7079dfcf384698cf251449363cde0f4a7eabc49541ca34738a38c74acb27058c` |
| aws_boundary | `ops/V533/aws/iam-permissions-boundary.nexa-edge-kms.json` | `0d724572ab9f264b4825560c0e6833c29ddfd29b35d6daa45eefbd2c6e6c89fd` |
| aws_budget | `ops/V533/aws/budget.json` | `326e689e9f4843a47fa58365c8f11fd279b23abccb3890fd9bcc1345a3d57ec0` |

Nota de rastreabilidade: M1–M4 diferem dos arquivos adjudicados em V5.33 **somente em comentários** (texto do rollback). O SQL executável é idêntico: `code_sha256` no manifesto (sha256 do arquivo sem linhas `--`), fixado por teste. Hashes anteriores: M1 `9404f314…`, M2 `e56d25af…`, M3 `850c85db…`, M4 `e9a610fd…`.

## Protocolo por etapa (M1→M2→M3→M4; cada etapa é uma transação e tem rollback independente)
1. **PRE** — rodar `post-apply-verify.V533` (somente leitura, uma instrução). Esperado: linhas P01 (14 baseline, nove RPCs com MD5 V526) PASS; objetos desta etapa e das seguintes `NOT-APPLIED`; etapas anteriores PASS; `P99 PASS`. Qualquer FAIL → STOP.
2. **APLICAR** — colar o arquivo da etapa sem alteração. Erro SQL → a transação reverte sozinha; STOP.
3. **POST** — rodar o verificador de novo. Esperado: todas as linhas P03–P13 desta etapa PASS (ACL efetiva incl. PUBLIC e grant option, dono único e não-API, definição = candidato por md5 do corpo/retorno/volatilidade/search_path, triggers de imutabilidade ativos, inventário exato do schema, ACL de tabelas e schema), baseline inalterada, P02 sem nova função anônima. `P99 PASS`.
4. **FAIL em POST** → aplicar `rollback.Mk.NON-DESTRUCTIVE.sql` **da própria etapa** (e só dela), rodar o verificador (esperado: linhas da etapa em FAIL ACL, nada mais mudou), parar e reportar. Cada rollback ignora objetos ausentes, é idempotente e pode ser aplicado em qualquer instalação parcial.
5. Checkpoint: devolver PRE e POST integrais ao operador antes da etapa seguinte.

## Evidências (PostgreSQL 16 descartável, stubs tipo hospedado — nada hospedado foi tocado)
- Rollbacks: 12 estados parciais instaláveis; em cada um, os quatro rollbacks (ausentes ignorados), duas vezes, sem erro; nenhuma tabela alterada (oid e ACL idênticos); todas as funções da etapa sem EXECUTE para anon/authenticated/service_role/PUBLIC; reverter uma etapa não toca as outras; `reenable` restaura a ACL byte a byte. O rollback combinado antigo abortou em 10 desses 12 estados (prova do defeito).
- Verificador: PASS antes e depois; FAIL em corpo de função alterado, search_path removido, PUBLIC em função interna, grant option, role de API como dono, trigger desativado, função extra no schema, PUBLIC em tabela, USAGE no schema para authenticated.
- Políticas AWS: modelo local da autorização do KMS (negação explícita vence; key policy direta OU delegação+IAM; boundary) com 6 testes; a key policy antiga falha 3 deles. É um modelo, não a AWS: a prova real é o checkpoint K1.

## Edge (S3) — depois de M1–M3, `NEXA_AUDIO_BACKUP` não definido (= desligado)
Funções: `process-consultation`, `realtime-call`, `realtime-radar`, `consultation-speakers` (CORS passa a aceitar `x-nexa-encounter-id`; gate novo em `off` = comportamento atual) e `audio-backup` (503 `AUDIO_BACKUP_DISABLED` sem o interruptor). Não definir `NEXA_ASSIST_GATE`, `NEXA_ASSIST_APPROVED_PROVIDERS` nem `NEXA_AUDIO_BACKUP`.
E0: registrar os ids das versões atuais das quatro funções existentes. E1: OPTIONS devolve o novo allow-header; POST sem JWT em `audio-backup` nunca devolve 200; uma consulta normal no app publicado continua funcionando. Rollback Edge: reimplantar as versões de E0 e remover `audio-backup`.

## AWS (S4) — preparado, não provisionado
sa-east-1; uma chave simétrica sem alias (o adaptador fixa a ARN completa); rotação automática; usuário IAM `nexa-edge-kms` sem console, uma access key; orçamento US$ 10/mês só KMS (alerta 80%).
Camadas (todas necessárias, nenhuma sozinha basta): (1) **key policy** com `Deny` explícito para qualquer principal que não seja o usuário, para região ≠ sa-east-1, transporte inseguro, ausência do contexto `nexa_aad_sha256`, qualquer outra chave de contexto, qualquer ação além de Encrypt/Decrypt para o usuário e `CreateGrant` para todos — como `Deny` vale em todas as vias (política da chave e política de identidade); (2) **identity policy** só com Encrypt/Decrypt na ARN, mesmas condições, mais `Deny` para qualquer outra ação e para outras chaves; (3) **permissions boundary** com o mesmo Allow. Substituir `<ACCOUNT_ID>`/`<KEY_ID>` apenas. A administração pela conta (root) permanece possível (sem lock-out), mas a raiz também não usa a chave criptograficamente enquanto a política vigorar.
Segredos Edge (só nomes): `NEXA_KMS_PROVIDER=aws`, `NEXA_AWS_REGION=sa-east-1`, `NEXA_AWS_KMS_KEY_ARN`, `NEXA_AWS_ACCESS_KEY_ID`, `NEXA_AWS_SECRET_ACCESS_KEY`, `NEXA_AUDIO_BACKUP_ENVELOPE=v2`; `NEXA_AUDIO_BACKUP=enabled` por ÚLTIMO. Rotação da access key a cada 90 dias; substituir por credenciais temporárias quando houver emissor OIDC comprovado (o adaptador já aceita token de sessão).
K1 (verificação real): IAM Policy Simulator/`aws kms` com contexto correto → permitido; região errada, sem contexto, contexto extra, `GenerateDataKey`, `CreateGrant` → negados; wrap/unwrap sintético por `audio-backup` com usuário e bytes sintéticos; unwrap com AAD errado falha (`LAB_CUSTODY_FAILED`); CloudTrail mostra só Encrypt/Decrypt. Kill switch: remover `NEXA_AUDIO_BACKUP` (503 imediato; cofre local intacto).

## Autorização consolidada S2–S5 (texto a ser dado pelo dono; nada começa sem ela)
"Autorizo executar S2 a S5 do RUNBOOK V5.34 da main (hashes do MANIFEST), na ordem e com os checkpoints descritos, parando em qualquer STOP."
**S2** — M1, M2, M3 (aplicação hospedada de SQL, via conector Supabase, um arquivo por vez com PRE/POST). **S3** — deploy das cinco Edge listadas, sem definir nenhuma variável de gate/backup. **S4** — criação da chave KMS, do usuário IAM, das políticas e do orçamento na AWS; criação dos segredos Edge; `NEXA_AUDIO_BACKUP=enabled` somente após K1. **S5** — M4 com PRE/POST.
Limites: só os arquivos do manifesto com hash conferido; nenhuma alteração em tabelas existentes, nas nove RPCs antigas, em privilégios existentes, no frontend, nas flags do cliente, no piloto ou na retenção; nenhum dado real, nenhuma IA paga; nenhum DROP/DELETE/TRUNCATE; custo AWS limitado ao orçamento acima.
**STOP (parar, não prosseguir, reportar saída integral):** hash divergente; PRE com qualquer FAIL ou baseline alterada; erro SQL; POST com qualquer FAIL (aplicar o rollback da etapa); E1 com resposta inesperada; K1 com qualquer permissão negada indevidamente ou concedida indevidamente; custo AWS acima do orçamento; qualquer ação que exija dado real, credencial do dono ou mudança fora da lista.
Fora desta autorização (exigem pedidos próprios): merge de PR de flags, ativação do piloto, `remotePreservation`/`assistAuthority`, retenção, bitrate, qualquer endurecimento das RPCs antigas.
