# NEXA Radar — lógica de investigação dirigida por decisão (v1)
Data: 26/10/2026 — escopo: atendimento de PS, adultos conversando com o profissional. **Validação clínica prospectiva e revisão editorial ainda necessárias.**

## Problema corrigido
O motor antigo aplicava packs estáticos ao sintoma e listava comorbidades, alergias, medicações e, na cefaleia, estado de consciência como lacunas de prioridade alta/crítica em todos os encontros; o CID orientava pouco as prioridades e a IA podia promovê-las sem regra sindrômica. Isso gerava necessidade de dispensar perguntas sem impacto no atendimento.

## Regras executadas
- **Separar histórico universal de investigação dirigida.** Comorbidades, alergias e medicações permanecem visíveis no histórico, mas não disputam espaço nas três próximas perguntas. Informação não relatada não vira negativa. Alergias continuam clinicamente relevantes *antes de prescrever*.
- **A09/diarreia aguda:** sangue, avaliação de hidratação, tolerância oral, diurese e vômitos; febre e dor abdominal importante; número de evacuações, muco e pus complementam. Sangue nas fezes orienta investigação, não gera indicação automática de antibiótico, porque STEC é um diferencial relevante.
- **Cefaleia:** investigar início abrupto, déficit focal, trauma, febre/meningismo, mudança do padrão, intensidade, duração, caráter, fotofobia, fonofobia, náuseas/vômitos. Glasgow ou avaliação neurológica completa não é exigência universal para paciente alerta; confusão/rebaixamento *explicitamente relatados* seguem como alerta de gravidade.
- **Tosse/quadro respiratório:** dispneia, oxigenação, esforço e frequência respiratória, febre, ausculta e achados focais; se houver broncoespasmo/asma, avaliar sibilância e capacidade de completar frases; hipótese de pneumonia também orienta perguntas focalizadas.
- **CID é pista, não prova.** Hipótese principal registrada como A09, R51, G43, G44, J00–J06, J18, J20, J40, J45 ou J46 pode ativar o conjunto de perguntas, mas não produz achados clínicos ou diagnósticos confirmados.
- **Alertas objetivos preservados** quando observados: sinais vitais muito alterados em adulto, alteração de consciência real, início súbito de cefaleia, sangue nas fezes etc. Sem presunção de gravidade ou alta pelo silêncio da transcrição.
- **IA remota subordinada à pertinência da síndrome:** sugestão remota não cria nova obrigatoriedade fora dos conceitos indicados pelo mecanismo determinístico nem aumenta prioridade aprovada. Não há alteração do prontuário automaticamente.

## Limitações
O conjunto ainda não cobre todas as doenças; esta implantação deve ser considerada a primeira fase de uma biblioteca modular e requer revisão humana das prioridades, auditoria por CID e dados de desempenho. Não usar para dispensar avaliação médica, decidir destino ou indicar antibiótico. Regras adicionais para crianças, gestantes e imunossuprimidos devem ter validação específica; os conceitos atuais não afirmam regras automáticas nessas populações.

## Fontes clínicas de referência (para futura revisão humana)
1. IDSA 2017 — Clinical Practice Guidelines for Infectious Diarrhea: https://www.idsociety.org/practice-guideline/infectious-diarrhea
2. ACEP 2019 — Clinical Policy: Acute Nontraumatic Headache in the ED: https://www.acep.org/siteassets/sites/acep/media/clinical-policies/cp-headache.pdf
3. AAFP 2022 — Acute Headache in Adults: https://www.aafp.org/afp/2022/0900/acute-headache-adults
4. NICE NG250 (2025) — Pneumonia diagnosis and management: https://www.nice.org.uk/guidance/ng250/chapter/recommendations
5. NICE NG120 — Acute cough antimicrobial prescribing: https://www.nice.org.uk/guidance/ng120/chapter/Recommendations
6. GINA 2025 strategy report — Assessment of acute asthma exacerbations: https://ginasthma.org/wp-content/uploads/2025/11/GINA-2025-Update-25_11_08-WMS.pdf

**Documentar o diagnóstico e a tomada de decisão continua sendo responsabilidade do médico.** Regra de interface não é protocolo clínico formal aprovado.
