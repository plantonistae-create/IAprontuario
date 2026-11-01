# Transcrição farmacológica: checkpoint técnico 1.0

Data: 2026-11-01. Branch candidata: `feature/medication-fidelity-20261101`.

## Escopo implementado

- Contexto curto para o ASR reconhecer possíveis nomes de medicamentos e distinguir mL, mg e mg/mL. O contexto não autoriza inserir um medicamento que não foi ouvido.
- Instrução documental para preservar volume relatado mesmo sem concentração conhecida.
- Validador determinístico, sem nova chamada de IA, que avisa o médico sobre medicamento omitido, volume em mL omitido ou substituição do nome referido. O validador não altera o texto do ASR nem os campos do prontuário.
- Aviso visível no campo Medicações em uso, também recuperável a partir de `processing_meta` quando a consulta é reaberta.
- Corpos de erro dos provedores externos deixam de ser escritos em logs técnicos.

O piloto reconhece apenas `omeprazol`, `dipirona`/`Novalgina` e o nome literal `Celestrat`. Não atribui princípio ativo ao Celestrat nem presume registro vigente ou apresentação comercial. A associação Novalgina/dipirona gera revisão do nome referido; não substitui automaticamente a marca no prontuário.

## Fontes verificadas

- A [Anvisa publica a lista DCB atualizada em outubro de 2026](https://www.gov.br/anvisa/pt-br/assuntos/noticias-anvisa/2026/anvisa-publica-lista-atualizada-das-denominacoes-comuns-brasileiras-2). A DCB é referência para a futura expansão do catálogo, não prova de uso pelo paciente.
- Um [rótulo da Novalgina disponibilizado no sistema de consultas da Anvisa](https://consultas.anvisa.gov.br/api/consulta/medicamento/1/25351617747202347/rotulo/P/34730560?Authorization=Guest) identifica dipirona. A correspondência continua sujeita à conferência da apresentação relatada.
- A [documentação oficial da API de transcrição](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create) admite `prompt` para os modelos de transcrição usados, exceto o modelo de diarização. A [orientação de migração](https://developers.openai.com/api/docs/guides/speech-to-text) indica encerramento dos modelos de transcrição legados em 26/02/2027; substituir o ASR exige benchmark clínico específico.

## Limites e gate de publicação

- A lista de três nomes é deliberadamente estreita. Não representa catálogo farmacológico brasileiro validado.
- O aviso é evidência auxiliar do ASR. Pode haver erro de reconhecimento, falante ou contexto; a decisão permanece médica.
- Ainda falta benchmark com áudio sintético para nomes, volumes, concentração, frequência, negações e múltiplos falantes. Não foi feito ensaio com áudio clínico real.
- O E2E geral parou antes do processamento no início da gravação simulada no ambiente local. A mesma falha foi reproduzida em checkout limpo da `main` (`e9c0396`) com as mesmas dependências e navegador. A regressão de captura continua pendente; nenhum deploy ou merge é aprovado apenas pelos testes unitários do validador.
- A PR #93 continua sendo a via de persistência integral da transcrição original e suas versões. Este piloto não a substitui.
