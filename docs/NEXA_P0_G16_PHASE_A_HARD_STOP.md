# NEXA G16.3 — bloqueio verificável entre catálogo A1 e A2 (OFFLINE)

**Origem:** G16.2, após G15 PR #150 (`main 2564bd8dc4089668460d96c766a0620b96ca9020`).
**Falha concreta corrigida:** o G15 entregava A1 e A2 num único arquivo.
Mesmo que A1 contasse mais de 250 candidatas, nada interrompia
automaticamente a execução do SELECT A2. Um `LIMIT 250` isolado
não impede um inventário **parcial e equivocadamente aceito**.

## Correção técnica

1. `catalog-phase-a.G15-NOT-AUTHORIZED.sql` agora contém
   **apenas o SELECT A1 de contagem**, transação READ ONLY e ROLLBACK.
   Não existe SELECT A2 nesse arquivo.
2. `catalog-phase-a2.G16-NOT-AUTHORIZED.sql` é separado,
   expressamente NÃO AUTORIZADO/NÃO EXECUTADO. Além da
   obrigatoriedade de A1 validado antes da sessão, a consulta A2
   usa `eligible` e `counted` MATERIALIZED; só retorna linhas se
   o conjunto elegível contemporâneo tiver entre **1 e 250**
   candidatas. Se tiver 0 ou acima de 250, retorna **zero linhas**;
   o operador deve classificar isso como STOP, nunca como sucesso.
   O limite não é licença para execução nem substitui a parada
   **entre as sessões**.
3. `phase-a-count-gate.G16-REVIEW-ONLY.mjs` é local e offline,
   sem dependência de Supabase, rede, operador ou SQL executável.
   Recebe um pequeno envelope de resultado A1, previamente
   preservado **fora do repositório**, e rejeita: erro, truncamento,
   linhas ausentes/duplicadas, campos inesperados, flag inconsistente,
   contagem zero e contagem superior a 250.
4. `tests/nexa-g16-phase-a-hard-stop.test.mjs` exercita limites
   1 e 250, 251+, entradas malformadas, injeção de campos
   sensíveis e separação física dos SELECTs. Verificação estática
   de SQL não substitui compilação/ensaio em PostgreSQL
   nem autoriza consultas hospedadas.

## Contrato de entrada local, SEM DADOS REAIS

Este exemplo é **sintético**. Um operador privado futuro,
após nova autorização, poderia normalizar a saída A1 assim:

```json
{
  "rows": [
    {
      "candidate_public_definer_routines": 12,
      "within_explicit_review_cap": true
    }
  ],
  "error": null,
  "truncated": false
}
```

O valor agregado não identifica funções ou usuários, mas a saída
real deve permanecer em ambiente privado. A CLI impede carregar
arquivo localizado dentro do repositório público. Ela imprime
apenas uma decisão agregada, nunca nomes de objetos ou corpos SQL.

### Sequência operacional obrigatória — SOMENTE após autorização

**STOP 0:** não há confirmação de autorização separada de leitura
de catálogo, operador responsável e destino privado? NÃO EXECUTAR.

**Fase A1:** se autorizada explicitamente, executar SOMENTE arquivo A1;
guardar o único resultado privadamente; encerrar essa transação.

**STOP 1:** A1 com erro, truncamento, contagem 0 ou acima de 250,
inconsistência de flag, schema divergente? NÃO EXECUTAR A2.
É proibido alterar automaticamente o limite, ampliar schema ou
contornar a etapa. Mesmo se o gate retornar
`A1_COUNT_WITHIN_CAP_REQUIRES_SEPARATE_AUTHORIZATION`, isso
**NÃO** constitui permissão para SQL.

**Fase A2:** somente se o escopo A2 tiver aprovação válida e
comprovação de responsável/armazenamento privado. Executar
SEPARADAMENTE seu arquivo de consulta, **nunca um script que una
A1+A2 automaticamente**. Resultado zero, quantidade divergente
da A1, erro ou truncamento = STOP. A2 não valida corpos SQL,
identidade/tenant, RLS ou chamadas reais via REST.

**STOP 2:** nada disso autoriza Fase B (`pg_get_functiondef`,
dependências, políticas ou dados clínicos), REVOKE, GRANT,
migração, Edge deploy ou GO clínico.

## Situação e privacidade

- A1 e A2 **NÃO EXECUTADOS** no Supabase hospedado, inclusive
  sem consultas SELECT deste lote.
- Nenhum resultado real, nome de função privada, ACL real,
  credencial, token, prontuário, áudio ou outro dado identificável
  foi criado ou publicado.
- A contagem dos avisos do Security Advisor anterior (11 `anon`,
  29 `authenticated`, 13 tabelas RLS sem policy) **não** é
  prova de que o contador A1 retornará esses mesmos valores.
  Avisos não são necessariamente funções distintas.
- Supabase hosted v6/v12/v24, JWT, RLS, segredos e PRs
  #118/#119/#121/#134 Draft devem permanecer inalterados.
- Interface NEXA permanece intacta, com transcrição textual
  apenas no final da consulta.

## Merge e rollback

CI G16 obrigatória: sintaxe e testes de G16 em `npm test`,
lint/typecheck/build, auth, regressão clínica, Chromium e WebKit.
O GitHub Pages e CI pós-merge devem ser verificados por run IDs,
não apenas por ausência de status no conector.

Rollback: PR revertendo o squash da PR G16. Nenhuma migração
ou transação hospedada foi executada, então não existe rollback
do Supabase necessário neste lote.

**AÇÃO MANUAL PARA G16:** nenhuma para a correção offline.
**AÇÃO MANUAL para G17 com SQL real:** aprovar explicitamente o
escopo A1/A2, definir operador responsável e local privado;
a autorização ainda não foi dada.
