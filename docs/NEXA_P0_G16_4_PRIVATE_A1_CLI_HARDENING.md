# NEXA G16.4 — privacidade da entrada local de A1 (OFFLINE / Draft)

**Base:** G16.3 main `064757d2a39ad4c04c60b0034a8b35756b8eb089`. **Execução hospedada:** nenhuma, nem SELECT.

## Falhas observadas no código G16.3

1. `JSON.parse(readFileSync(...))` sem tratamento de erro podia escrever
   no terminal trechos do JSON inválido. A reprodução local com
   texto **sintético** confirma que o Node inclui trechos da entrada
   no erro `SyntaxError`. **Não há evidência de vazamento real.**
2. A verificação de arquivo dentro do repositório usava `process.cwd()`.
   Quando invocada a CLI a partir de um subdiretório, um arquivo do
   repositório fora do CWD escapava dessa verificação.
3. A CLI exibiria o valor agregado da contagem A1 mesmo quando somente
   o resultado sanitizado do gate era necessário. Isso não expõe
   nomes de funções, mas é exposição evitável de metadados.

## Correção individual em laboratório

- Raiz do repositório derivada do próprio módulo (não do CWD);
  caminhos de entrada e raiz canonicalizados via `realpathSync`
  para rejeitar symlinks que apontem para dentro do repositório.
- Entrada aceita apenas como arquivo regular privado de até
  4 KiB; falha de leitura, JSON inválido e outros erros da CLI
  passam a retornar códigos fixos, sem conteúdo bruto, stack ou path.
- O veredito impresso na CLI não contém `aggregate_candidate_count`.
  O motor puro preserva o valor para seus testes internos sintéticos.
- Comentário desatualizado do A1 ajustado: o arquivo contém
  **um único SELECT**, e A2 só existe em arquivo físico separado.

## Testes e limites

Seis casos sintéticos novos: contagem 250 não exibida; erro JSON
sem eco; execução a partir de subdiretório; symlink externo
apontando para o repositório; entrada excessiva; contagem 251 STOP.
Testados localmente em Node 22: **6/6 SUCCESS**.
A CI obrigatória de integração no GitHub ainda deve ser observada
após a publicação desta PR Draft.

O gate continua sendo uma proteção processual offline. Não
atesta proveniência de A1, privilégios, validade de ACL, reachability
da API, integridade de `search_path`, isolamento tenant/RLS ou
segurança de corpos SQL. Não autoriza leitura hospedada nem A2.

## Privacidade e rollback

Nenhum resultado real, payload clínico, inventário privado ou
credencial foi lido. Sem alterações no runtime NEXA, UI,
transcrição, funções Edge hospedadas, RLS, JWT ou schema.

**Rollback:** fechar a PR Draft sem merge; se um dia fosse
integrada com autorização separada, revert do commit específico
com CI obrigatória. Não existe rollback de Supabase para este lote.

**STOP hosted:** A1/A2 exigem nova autorização explícita,
operador responsável confirmado, destino privado comprovado
para a saída e sessões READ ONLY isoladas. Nunca executar o
arquivo A1 e A2 em lote; fase B exige outra autorização.
