# Transcrição farmacológica: checkpoint técnico 1.0

Data: 2026-11-01. Branch candidata: `feature/medication-fidelity-20261101`.

## Escopo implementado

- Validador determinístico, sem nova chamada de IA, que avisa o médico sobre medicamento, quantidade, unidade, frequência ou nome referido omitidos. O validador não altera o texto do ASR nem os campos do prontuário.
- Catálogo lexical versionado com nomes genéricos frequentes, relação Novalgina/dipirona comprovada e Celestrat mantido como nome literal sem princípio ativo atribuído. As entradas genéricas adicionais são candidatas lexicais para revisão; a lista não é uma extração integral validada da DCB.
- Aviso visível no campo Medicações em uso, também recuperável a partir de `processing_meta` quando a consulta é reaberta.
- Corpos de erro dos provedores externos deixam de ser escritos em logs técnicos.

O piloto não atribui princípio ativo ao Celestrat nem presume registro vigente ou apresentação comercial. A associação Novalgina/dipirona gera revisão do nome referido; não substitui automaticamente a marca no prontuário. Doses e apresentações nunca são inferidas a partir do catálogo.

## Fontes verificadas

- A [Anvisa publica a lista DCB atualizada em outubro de 2026](https://www.gov.br/anvisa/pt-br/assuntos/noticias-anvisa/2026/anvisa-publica-lista-atualizada-das-denominacoes-comuns-brasileiras-2). A DCB é referência para a futura expansão do catálogo, não prova de uso pelo paciente.
- Um [rótulo da Novalgina disponibilizado no sistema de consultas da Anvisa](https://consultas.anvisa.gov.br/api/consulta/medicamento/1/25351617747202347/rotulo/P/34730560?Authorization=Guest) identifica dipirona. A correspondência continua sujeita à conferência da apresentação relatada.
- A [documentação oficial da API de transcrição](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create) admite `prompt` para os modelos de transcrição usados, exceto o modelo de diarização. A [orientação de migração](https://developers.openai.com/api/docs/guides/speech-to-text) indica encerramento dos modelos de transcrição legados em 26/02/2027; substituir o ASR exige benchmark clínico específico.

## Limites e gate de publicação

- O catálogo lexical ainda não representa um cadastro farmacológico brasileiro completo nem comprova apresentação, concentração ou uso do paciente.
- O aviso é evidência auxiliar do ASR. Pode haver erro de reconhecimento, falante ou contexto; a decisão permanece médica.
- O corpus de 12 falas sintéticas está em `tests/medication-audio-corpus.json`; `scripts/generate-medication-audio-fixtures.mjs` gerou os arquivos AIFF apenas em `/private/tmp`. Falta transcrevê-los com o ASR real e medir reconhecimento, omissões e trocas. Por isso, as sugestões de vocabulário ao ASR e a nova instrução de estruturação foram retiradas do piloto; permanecem recuperáveis no commit inicial da PR para estudo separado.
- O E2E de captura de áudio da PR #97 passou em Chromium após permitir o servidor de teste local. O piloto farmacológico passou 10 testes focados, suíte geral, lint, typecheck, build, Deno check e E2E de aviso sem alteração do prontuário. O gate hospedado de `process-consultation` e o CI do SHA final ainda devem ser verificados antes de publicação.
- A PR #93 continua sendo a via de persistência integral da transcrição original e suas versões. Este piloto não a substitui.
