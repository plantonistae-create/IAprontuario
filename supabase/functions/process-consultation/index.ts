import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import { capabilityProviderFromEnv, executeCapability, withTechnicalExecutionHeaders } from "../_shared/nexa-ai-capability.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function adminSecretKey() {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    if (keys?.default) return String(keys.default);
  } catch {}
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}

function adminClient() {
  const key = adminSecretKey();
  if (!key) return null;
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function loadDefaultStyleExamples(limit = 5) {
  const admin = adminClient();
  if (!admin) return [];

  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id,created_at")
    .eq("is_admin", true)
    .eq("is_reviewer", true)
    .eq("clinical_access", true)
    .eq("access_status", "active")
    .order("created_at", { ascending: true })
    .limit(1);

  if (profileError || !profiles?.[0]?.id) {
    if (profileError) console.warn("NEXA default style owner lookup failed", profileError.message);
    return [];
  }

  const { data: rows, error: styleError } = await admin
    .from("style_examples")
    .select("fields,updated_at,created_at")
    .eq("user_id", profiles[0].id)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (styleError) {
    console.warn("NEXA default style lookup failed", styleError.message);
    return [];
  }

  return (rows || [])
    .map((row: any) => row?.fields && typeof row.fields === "object" ? { ...row.fields } : null)
    .filter(Boolean)
    .reverse();
}

const AI_PROVIDER = capabilityProviderFromEnv(
  "consultation.processing",
  (name: string) => Deno.env.get(name),
);

const ALLOWED_ORIGIN =
  Deno.env.get("ALLOWED_ORIGIN") ||
  "https://plantonistae-create.github.io";


/* ============================================================
   CORS
============================================================ */

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";

  const allow = ALLOWED_ORIGIN
    ? origin === ALLOWED_ORIGIN
      ? origin
      : ""
    : origin;

  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type",
    "Access-Control-Allow-Methods":
      "POST, OPTIONS",
    "Content-Type":
      "application/json",
    "Cache-Control":
      "no-store",
  };
}


function json(
  req: Request,
  body: unknown,
  status = 200
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: cors(req),
    }
  );
}


/* ============================================================
   SCHEMAS
============================================================ */

const documentationSchema = {
  type: "object",

  additionalProperties: false,

  properties: {

    queixa_principal: {
      type: "string"
    },

    hda: {
      type: "string"
    },

    comorbidades: {
      type: "string"
    },

    antecedentes: {
      type: "string"
    },

    medicacoes: {
      type: "string"
    },

    alergias: {
      type: "string"
    },

    meta_sexo: {
      type: "string"
    },

    meta_idade_anos: {
      type: "string"
    }

  },

  required: [
    "queixa_principal",
    "hda",
    "comorbidades",
    "antecedentes",
    "medicacoes",
    "alergias",
    "meta_sexo",
    "meta_idade_anos"
  ]
};


const assistanceSchema = {

  type: "object",

  additionalProperties: false,

  properties: {

    hipotese_diagnostica: {
      type: "string"
    },

    orientacoes_alta: {
      type: "string"
    },

    sugestoes_perguntas: {
      type: "string"
    },

    meta_cid: {
      type: "string"
    }

  },

  required: [
    "hipotese_diagnostica",
    "orientacoes_alta",
    "sugestoes_perguntas",
    "meta_cid"
  ]
};


/* ============================================================
   FORMATAÇÃO
============================================================ */

function caseInstruction(
  caseMode: string
) {

  return caseMode === "upper"

    ? `TODO O TEXTO DE SAÍDA DEVE SER ESCRITO EM LETRAS MAIÚSCULAS, EM TODOS OS CAMPOS, SEM EXCEÇÃO.`

    : `Escreva em português com capitalização normal; não use caixa alta em todo o texto.`;
}


/* ============================================================
   EXEMPLOS DE ESTILO
============================================================ */

function styleBlock(
  examples: any[]
) {

  if (!examples.length) {
    return "";
  }

  const keys = [
    "queixa_principal",
    "hda",
    "comorbidades",
    "antecedentes",
    "medicacoes",
    "alergias"
  ];

  return `

Exemplos já revisados pelo médico.

Use SOMENTE o estilo de redação e organização.
NUNCA reutilize fatos clínicos dos exemplos.
As regras atuais deste prompt prevalecem sobre padrões antigos presentes nos exemplos.

${examples.map(
  (ex: any, i: number) => {

    const documental =
      Object.fromEntries(
        keys.map(
          k => [
            k,
            String(
              ex?.[k] || ""
            )
          ]
        )
      );

    return `Exemplo ${i + 1}: ${JSON.stringify(documental)}`;
  }
).join("\n")}`;

}


/* ============================================================
   PROMPT DE DOCUMENTAÇÃO
============================================================ */

function documentationPrompt(
  caseMode: string,
  transcript: string,
  examples: any[]
) {

  const consultaAgora =
    new Date();

  const consultaDataLocal =
    new Intl.DateTimeFormat(
      "pt-BR",
      {
        timeZone:
          "America/Campo_Grande",

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit",

        weekday:
          "long"
      }
    ).format(
      consultaAgora
    );


  return `
ETAPA 1 — DOCUMENTAÇÃO CLÍNICA.

DATA LOCAL DE REFERÊNCIA DA CONSULTA:
${consultaDataLocal}

${caseInstruction(caseMode)}

Nesta etapa NÃO faça raciocínio diagnóstico.

Estruture exclusivamente os dados efetivamente relatados durante a consulta.

IMPORTANTE:
Dados de exame físico e sinais vitais falados NÃO devem ser inseridos nos campos documentais abaixo.


============================================================
REGRAS GERAIS
============================================================

- Use português médico técnico, objetivo, claro e conciso.

- Converta expressões leigas para terminologia médica equivalente somente quando isso puder ser feito sem alterar o significado clínico.

- Exclua:
  repetições;
  hesitações;
  vícios de linguagem;
  comentários administrativos;
  diálogos sem relevância clínica;
  detalhes sociais incidentais;
  informações sem utilidade para compreensão do quadro.

- Preserve fielmente:
  temporalidade;
  lateralidade;
  intensidade;
  duração;
  frequência;
  evolução;
  localização;
  irradiação;
  fatores agravantes;
  fatores de alívio;
  tratamentos realizados;
  demais qualificadores efetivamente informados.

- Nunca invente:
  sintomas;
  doses;
  frequência;
  vias;
  horários;
  antecedentes;
  duração;
  temperatura;
  intensidade;
  diagnóstico;
  procedimentos;
  cirurgias;
  ou qualquer outro dado ausente.

- Quando alguma informação não tiver sido fornecida, não tente completá-la por conhecimento médico.


============================================================
NORMALIZAÇÃO TEMPORAL
============================================================

Normalize referências temporais relativas ou por dia da semana para duração clínica em dias quando o intervalo puder ser calculado com segurança em relação à data da consulta.

Exemplos:

Se a consulta ocorre no sábado e o paciente relata início na quinta-feira:
"há 2 dias".

"ontem":
"há 1 dia".

"anteontem":
"há 2 dias".

Evite registrar:
"desde quinta-feira";
"na quinta-feira";
ou equivalentes quando a duração puder ser determinada com segurança.

Quando a referência temporal for ambígua, incompleta ou não permitir cálculo seguro, preserve a informação disponível sem inferir duração.


============================================================
MODO PRONTO-SOCORRO
============================================================

O NEXA está operando atualmente em contexto de PRONTO-SOCORRO.

A documentação deve priorizar o QUADRO AGUDO, EXACERBAÇÃO ou ALTERAÇÃO RECENTE que motivou a procura pelo serviço de emergência.

Não desenvolva na HDA sintomas ou doenças de longa duração que não façam parte diretamente do episódio agudo atual.

Sintomas crônicos antigos não devem ocupar desnecessariamente a narrativa da HDA.

Quando uma condição antiga for relevante para compreensão clínica, porém não representar o episódio agudo atual, registre-a de maneira objetiva em ANTECEDENTES.

EXCEÇÃO:

Quando houver doença ou sintoma crônico com piora ou modificação recente que motivou a ida ao pronto-socorro, concentre a HDA na mudança aguda.

Exemplo:

Paciente com lombalgia há 8 anos procura atendimento por piora importante há 2 dias após esforço.

HDA:
descrever prioritariamente a piora iniciada há 2 dias.

ANTECEDENTES:
pode constar lombalgia crônica há aproximadamente 8 anos, caso pertinente.


============================================================
QUEIXA PRINCIPAL
============================================================

queixa_principal:

Registre o motivo principal que levou o paciente ao pronto-socorro.

Use poucas palavras ou uma frase curta.

Prefira terminologia médica.

Quando houver duração claramente informada e clinicamente útil, ela pode ser incluída.


============================================================
HISTÓRIA DA DOENÇA ATUAL — HDA
============================================================

hda:

Produza uma narrativa médica fluida, concisa e estritamente cronológica.

A ordem obrigatória é:

DO EVENTO OU SINTOMA MAIS ANTIGO DO EPISÓDIO AGUDO
→
PARA O MAIS RECENTE
→
FINALIZANDO COM O ESTADO ATUAL DO PACIENTE, quando informado.

Priorize apenas os fatos necessários para compreender:

- início do quadro agudo;
- evolução;
- progressão;
- características dos sintomas;
- sintomas associados;
- intervenções relevantes;
- tratamentos realizados;
- resposta aos tratamentos;
- condição atual.

Não inclua exame físico.

Não inclua sinais vitais.

Não transforme hipótese em fato.

Não diagnostique dentro da HDA.

Não desenvolva doenças antigas sem relação direta com o episódio atual.

A ÚLTIMA FRASE DA HDA deve ser obrigatoriamente:

No modo normal:
"Sem demais queixas."

No modo caixa alta:
"SEM DEMAIS QUEIXAS."

Não utilize:
"Nega demais queixas";
"Sem outras queixas";
ou variantes.


============================================================
DOR — DECÁLOGO DA DOR
============================================================

Sempre que houver relato de DOR, organize todas as características disponíveis utilizando como referência clínica o Decálogo da Dor.

Avalie as informações efetivamente relatadas sobre:

1. duração;

2. início e evolução;

3. localização;

4. irradiação;

5. intensidade;

6. qualidade;

7. sinais e sintomas concomitantes;

8. fatores desencadeantes;

9. fatores agravantes;

10. fatores de alívio;

11. repercussão funcional ou clínica;

12. tratamentos realizados.

Esses elementos devem ser incorporados à HDA em narrativa médica natural.

NÃO apresente obrigatoriamente como checklist.

NÃO escreva itens ausentes apenas para dizer que não foram informados.

NÃO invente características da dor.

Exemplo de informação recebida:

"Começou ontem, do lado direito da barriga, oito de dez, piora quando caminho, não espalha e dipirona não resolveu."

Forma documental aceitável:

"Dor abdominal à direita iniciada há 1 dia, intensidade 8/10, sem irradiação, agravada à deambulação, sem melhora após uso de dipirona."

Não acrescente informações que não tenham sido relatadas.


============================================================
FEBRE
============================================================

Toda menção a FEBRE deve obedecer às seguintes regras:

Se houver temperatura informada pelo paciente, registre o valor.

Exemplo:

"Febre referida de 38,5 °C."

Se o paciente mencionar febre, porém nenhuma temperatura tiver sido informada, registrar obrigatoriamente:

"febre (não aferida)"

ou, em caixa alta:

"FEBRE (NÃO AFERIDA)"

Não invente temperatura.

Não transforme sensação de calor ou mal-estar em febre quando o paciente não tiver relatado febre.

Se o relato for apenas "sensação febril", preserve essa expressão clínica sem convertê-la automaticamente em febre.


============================================================
COMORBIDADES
============================================================

comorbidades:

Registre doenças prévias ou crônicas efetivamente citadas.

Exemplos:

Hipertensão arterial;
Diabetes mellitus;
Asma;
Doença renal crônica.

Não coloque neste campo cirurgias, procedimentos ou internações antigas.

Se nenhuma comorbidade tiver sido informada:

"NÃO RELATADO NA CONSULTA"

respeitando o modo de capitalização definido.


============================================================
ANTECEDENTES
============================================================

antecedentes:

Registre informações médicas prévias relevantes que não pertençam diretamente ao episódio agudo atual.

Podem ser incluídos quando efetivamente relatados e pertinentes:

- cirurgias prévias;
- procedimentos;
- internações relevantes;
- traumas prévios;
- eventos médicos importantes;
- doenças ou sintomas antigos relevantes;
- condições de longa evolução que não pertençam à HDA aguda atual.

Sempre que houver informação temporal disponível, organize os antecedentes cronologicamente:

DO MAIS ANTIGO
→
PARA O MAIS RECENTE.

Evite repetir em ANTECEDENTES doenças que já estejam adequadamente registradas em COMORBIDADES.

Não transfira automaticamente todas as informações antigas para ANTECEDENTES.

Inclua somente aquelas com relevância clínica.

Exemplo:

"Apêndicectomia há 15 anos; colecistectomia há 8 anos; internação por pneumonia há 2 anos."

Se o tema não for abordado ou não houver informação pertinente:

"NÃO RELATADO NA CONSULTA"

respeitando o modo de capitalização.


============================================================
MEDICAÇÕES EM USO
============================================================

medicacoes:

Registre SOMENTE medicamentos efetivamente referidos.

Liste os itens claramente, preferencialmente separados por "; ".

Para cada medicamento:

1. informe o nome;

2. informe dose quando realmente citada;

3. informe posologia ou frequência somente quando realmente citada;

4. informe horário ou período de uso somente quando realmente informado;

5. se o medicamento tiver sido citado SEM dose, escreva imediatamente após o nome:

"(dose não informada)"

ou em caixa alta:

"(DOSE NÃO INFORMADA)";

6. se for medicamento sintomático utilizado somente de maneira eventual no episódio atual ou recentemente, identifique-o como:

"(uso pontual)"

ou:

"(USO PONTUAL)";

7. não acrescente a indicação coloquial do medicamento.

Evite expressões como:

"para dor";
"para cefaleia";
"para pressão";
"para dormir";
ou equivalentes.

Nunca infira:

dose;
via;
frequência;
horário;
indicação;
adesão;
ou duração de tratamento.

Exemplos:

"Losartana 50 mg 1x/dia; Metformina (dose não informada) 2x/dia."

"Dipirona 500 mg (uso pontual)."

Se o paciente negar medicamentos em uso:

"Nega."

Se o tema não tiver sido abordado:

"NÃO RELATADO NA CONSULTA"

respeitando o modo de capitalização.


============================================================
ALERGIAS
============================================================

alergias:

Escreva:

"NEGA ALERGIAS"

somente quando isso tiver sido explicitamente informado.

Quando alergias não tiverem sido abordadas:

"NÃO RELATADO NA CONSULTA"

Nunca assuma ausência de alergias.


============================================================
METADADOS
============================================================

meta_sexo:

Retorne exclusivamente:

"MASCULINO"

"FEMININO"

ou:

"INDETERMINADO"


meta_idade_anos:

Retorne a idade em anos como string quando tiver sido claramente informada.

Exemplo:

"56"

Quando a idade não estiver disponível:

""


============================================================
EXEMPLOS DE ESTILO
============================================================

Use os exemplos revisados exclusivamente como referência de ESTILO.

Nunca copie fatos clínicos dos exemplos.

As regras deste prompt sempre prevalecem sobre exemplos antigos.

${styleBlock(examples)}


============================================================
TRANSCRIÇÃO
============================================================

${transcript}
`;
}


/* ============================================================
   ASSISTÊNCIA CLÍNICA
============================================================ */

function assistancePrompt(
  caseMode: string,
  transcript: string,
  docs: any
) {

  return `
ETAPA 2 — ASSISTÊNCIA CLÍNICA.

Esta etapa é SEPARADA da documentação factual.

${caseInstruction(caseMode)}

Com base exclusivamente na transcrição e na documentação abaixo, gere conteúdo AUXILIAR que exige revisão profissional.


============================================================
HIPÓTESE DIAGNÓSTICA
============================================================

hipotese_diagnostica:

Indique a hipótese diagnóstica mais provável com CID-10 ao final.

Não invente informações clínicas para sustentar diagnóstico.

Se o quadro for insuficiente ou inespecífico, utilize:

"QUADRO INESPECÍFICO, HIPÓTESE A ESCLARECER (R69)"


============================================================
CID
============================================================

meta_cid:

Retorne apenas o código CID-10 correspondente à hipótese principal.


============================================================
ORIENTAÇÕES DE ALTA
============================================================

orientacoes_alta:

Produza orientações em linguagem compreensível ao paciente.

Podem incluir:

- cuidados gerais;
- medidas domiciliares pertinentes;
- acompanhamento recomendado;
- sinais de alerta;
- situações que justificam retorno ao serviço de emergência.

Não presuma que essas orientações serão entregues ao paciente sem revisão médica.


============================================================
SUGESTÕES DE PERGUNTAS
============================================================

sugestoes_perguntas:

Identifique perguntas clinicamente relevantes que poderiam complementar a avaliação e que não tenham sido respondidas na consulta.

Para queixas dolorosas, considere especialmente lacunas relevantes do Decálogo da Dor quando essas informações puderem alterar avaliação ou conduta.

Não gere perguntas apenas para completar burocraticamente todos os itens.

Se não houver lacuna clinicamente relevante:

"NENHUMA LACUNA RELEVANTE IDENTIFICADA"


============================================================
SEGURANÇA
============================================================

Não invente:

sintomas;
achados;
exames;
sinais vitais;
antecedentes;
respostas terapêuticas;
ou qualquer informação não presente nos dados recebidos.

Esta etapa NÃO altera os fatos documentais.


============================================================
DOCUMENTAÇÃO
============================================================

${JSON.stringify(docs)}


============================================================
TRANSCRIÇÃO ORIGINAL
============================================================

${transcript}
`;
}


/* ============================================================
   AUTENTICAÇÃO
============================================================ */

async function requireUser(
  req: Request
) {

  const auth =
    req.headers.get(
      "Authorization"
    ) || "";

  if (
    !auth.startsWith(
      "Bearer "
    )
  ) {
    throw new Error(
      "UNAUTHORIZED"
    );
  }


  const client =
    createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization: auth
          }
        }
      }
    );


  const {
    data,
    error
  } =
    await client.auth.getUser();


  if (
    error ||
    !data.user
  ) {
    throw new Error(
      "UNAUTHORIZED"
    );
  }


  return data.user;
}


/* ============================================================
   OPENAI RESPONSE EXTRACTION
============================================================ */

function extractResponseText(
  response: any
) {

  if (
    response?.output_text
  ) {
    return response.output_text;
  }


  for (
    const item of
    response?.output || []
  ) {

    for (
      const content of
      item?.content || []
    ) {

      if (
        content?.type ===
          "output_text" &&
        content.text
      ) {
        return content.text;
      }

    }

  }


  return "";
}


/* ============================================================
   OPENAI STRUCTURED RESPONSE
============================================================ */

async function openAIResponse(
  key: string,
  model: string,
  prompt: string,
  schema: any,
  name: string
) {

  const resp =
    await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",

        headers: {

          Authorization:
            `Bearer ${key}`,

          "Content-Type":
            "application/json"

        },

        body:
          JSON.stringify({

            model,

            store: false,

            reasoning: {
              effort: "low"
            },

            input: [
              {
                role: "user",

                content: [
                  {
                    type:
                      "input_text",

                    text:
                      prompt
                  }
                ]
              }
            ],

            text: {

              format: {

                type:
                  "json_schema",

                name,

                strict:
                  true,

                schema

              }

            }

          })

      }
    );


  if (
    !resp.ok
  ) {

    const errorText =
      await resp.text();

    console.error(
      "OpenAI structured error:",
      resp.status,
      errorText
    );

    throw new Error(
      `Falha na estruturação OpenAI (${resp.status}).`
    );
  }


  const response =
    await resp.json();


  const text =
    extractResponseText(
      response
    );


  if (
    !text
  ) {
    throw new Error(
      "Resposta estruturada OpenAI vazia."
    );
  }


  return JSON.parse(
    text
  );
}


/* ============================================================
   OPENAI PIPELINE
============================================================ */

async function processOpenAI(
  audio: File,
  caseMode: string,
  examples: any[]
) {

  const key =
    Deno.env.get(
      "OPENAI_API_KEY"
    );


  if (
    !key
  ) {
    throw new Error(
      "OPENAI_API_KEY não configurada no backend."
    );
  }


  const transcribeModel =
    Deno.env.get(
      "OPENAI_TRANSCRIBE_MODEL"
    ) ||
    "gpt-4o-transcribe";


  const structModel =
    Deno.env.get(
      "OPENAI_STRUCTURING_MODEL"
    ) ||
    "gpt-5.6-terra";


  const clinicalModel =
    Deno.env.get(
      "OPENAI_CLINICAL_MODEL"
    ) ||
    structModel;


  /* TRANSCRIÇÃO */

  const fd =
    new FormData();


  fd.append(
    "file",
    audio,
    audio.name ||
      "consulta.webm"
  );


  fd.append(
    "model",
    transcribeModel
  );


  fd.append(
    "language",
    "pt"
  );


  const tr =
    await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method:
          "POST",

        headers: {
          Authorization:
            `Bearer ${key}`
        },

        body:
          fd
      }
    );


  if (
    !tr.ok
  ) {

    const errorText =
      await tr.text();

    console.error(
      "OpenAI transcription error:",
      tr.status,
      errorText
    );

    throw new Error(
      `Falha na transcrição OpenAI (${tr.status}).`
    );
  }


  const transcriptionData =
    await tr.json();


  const transcript =
    transcriptionData.text || "";


  if (
    !transcript
  ) {
    throw new Error(
      "Transcrição vazia."
    );
  }


  /* DOCUMENTAÇÃO */

  const docs =
    await openAIResponse(

      key,

      structModel,

      documentationPrompt(
        caseMode,
        transcript,
        examples
      ),

      documentationSchema,

      "clinical_documentation"

    );


  /* ASSISTÊNCIA */

  const assist =
    await openAIResponse(

      key,

      clinicalModel,

      assistancePrompt(
        caseMode,
        transcript,
        docs
      ),

      assistanceSchema,

      "clinical_assistance"

    );


  return {

    fields: {
      ...docs,
      ...assist
    },

    provider:
      "openai",

    model:
      `${transcribeModel} + ${structModel} + ${clinicalModel}`,

    stages: [
      "transcription",
      "documentation",
      "clinical_assistance"
    ],

    pipeline_version:
      "2026-09-02-v3.3.3-ps-antecedentes-dor-febre"

  };
}


/* ============================================================
   GEMINI HELPERS
============================================================ */

function bytesToBase64(
  bytes: Uint8Array
) {

  let binary = "";

  const chunk =
    0x8000;


  for (
    let i = 0;
    i < bytes.length;
    i += chunk
  ) {

    binary +=
      String.fromCharCode(
        ...bytes.subarray(
          i,
          i + chunk
        )
      );

  }


  return btoa(
    binary
  );
}


/* ============================================================
   GEMINI GENERATE
============================================================ */

async function geminiGenerate(
  key: string,
  model: string,
  body: any
) {

  const resp =
    await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {

        method:
          "POST",

        headers: {

          "Content-Type":
            "application/json",

          "x-goog-api-key":
            key

        },

        body:
          JSON.stringify(
            body
          )

      }
    );


  if (
    !resp.ok
  ) {

    const errorText =
      await resp.text();

    console.error(
      "Gemini error:",
      resp.status,
      errorText
    );

    throw new Error(
      `Falha no Gemini (${resp.status}).`
    );
  }


  const data =
    await resp.json();


  const text =
    data
      .candidates?.[0]
      ?.content
      ?.parts?.[0]
      ?.text;


  if (
    !text
  ) {
    throw new Error(
      "Resposta Gemini vazia."
    );
  }


  return text;
}


/* ============================================================
   GEMINI JSON
============================================================ */

async function geminiJson(
  key: string,
  model: string,
  prompt: string,
  schema: any
) {

  const properties =
    Object.fromEntries(

      Object.keys(
        schema.properties
      ).map(
        k => [
          k,
          {
            type:
              "STRING"
          }
        ]
      )

    );


  const text =
    await geminiGenerate(
      key,
      model,
      {

        contents: [
          {
            role:
              "user",

            parts: [
              {
                text:
                  prompt
              }
            ]
          }
        ],

        generationConfig: {

          responseMimeType:
            "application/json",

          responseSchema: {

            type:
              "OBJECT",

            properties,

            required:
              schema.required

          }

        }

      }
    );


  return JSON.parse(
    text
  );
}


/* ============================================================
   GEMINI PIPELINE
============================================================ */

async function processGemini(
  audio: File,
  caseMode: string,
  examples: any[]
) {

  const key =
    Deno.env.get(
      "GEMINI_API_KEY"
    );


  if (
    !key
  ) {
    throw new Error(
      "GEMINI_API_KEY não configurada no backend."
    );
  }


  const model =
    Deno.env.get(
      "GEMINI_MODEL"
    ) ||
    "gemini-3.6-flash";


  if (
    audio.size >
    14 * 1024 * 1024
  ) {

    throw new Error(
      "Com Gemini inline, limite este áudio a 14 MB para manter a requisição abaixo do limite multimodal."
    );

  }


  const base64 =
    bytesToBase64(
      new Uint8Array(
        await audio.arrayBuffer()
      )
    );


  /* TRANSCRIÇÃO */

  const transcript =
    await geminiGenerate(
      key,
      model,
      {

        contents: [
          {
            role:
              "user",

            parts: [

              {
                text:
                  "Transcreva fielmente esta consulta médico-paciente em português. Retorne apenas a transcrição, sem resumo nem inferências."
              },

              {
                inlineData: {

                  mimeType:
                    audio.type ||
                    "audio/webm",

                  data:
                    base64

                }
              }

            ]

          }

        ]

      }
    );


  /* DOCUMENTAÇÃO */

  const docs =
    await geminiJson(

      key,

      model,

      documentationPrompt(
        caseMode,
        transcript,
        examples
      ),

      documentationSchema

    );


  /* ASSISTÊNCIA */

  const assist =
    await geminiJson(

      key,

      model,

      assistancePrompt(
        caseMode,
        transcript,
        docs
      ),

      assistanceSchema

    );


  return {

    fields: {
      ...docs,
      ...assist
    },

    provider:
      "gemini",

    model,

    stages: [
      "transcription",
      "documentation",
      "clinical_assistance"
    ],

    pipeline_version:
      "2026-09-02-v3.3.3-ps-antecedentes-dor-febre"

  };
}


/* ============================================================
   SERVER
============================================================ */

Deno.serve(
  async (
    req
  ) => {


    /* OPTIONS */

    if (
      req.method ===
      "OPTIONS"
    ) {

      return new Response(
        null,
        {
          status:
            204,

          headers:
            cors(req)
        }
      );

    }


    /* SOMENTE POST */

    if (
      req.method !==
      "POST"
    ) {

      return json(
        req,
        {
          error:
            "Método não permitido."
        },
        405
      );

    }


    /* ORIGIN */

    const origin =
      req.headers.get(
        "origin"
      ) || "";


    if (
      ALLOWED_ORIGIN &&
      origin !== ALLOWED_ORIGIN
    ) {

      return json(
        req,
        {
          error:
            "Origem não autorizada."
        },
        403
      );

    }


    try {


      /* AUTENTICAÇÃO */

      await requireUser(
        req
      );


      /* FORM DATA */

      const fd =
        await req.formData();


      const audio =
        fd.get(
          "audio"
        );


      if (
        !(audio instanceof File) ||
        audio.size <= 0
      ) {

        return json(
          req,
          {
            error:
              "Áudio ausente ou vazio."
          },
          400
        );

      }


      /* TAMANHO */

      if (
        audio.size >
        24 * 1024 * 1024
      ) {

        return json(
          req,
          {
            error:
              "Áudio maior que 24 MB. Divida a gravação antes de processar."
          },
          413
        );

      }


      /* MODO DE CAPITALIZAÇÃO */

      const caseMode =
        String(
          fd.get(
            "case_mode"
          ) ||
          "upper"
        );


      /* EXEMPLOS DE ESTILO */

      let examples:
        any[] = [];


      try {

        examples =
          JSON.parse(
            String(
              fd.get(
                "style_examples"
              ) ||
              "[]"
            )
          );

      } catch {

        examples = [];

      }


      examples =
        Array.isArray(
          examples
        )
          ? examples.slice(-5)
          : [];

      let styleSource =
        examples.length
          ? "physician_saved"
          : "none";

      if (!examples.length) {
        const defaultExamples =
          await loadDefaultStyleExamples(5);

        if (defaultExamples.length) {
          examples = defaultExamples;
          styleSource = "default_admin_style";
        }
      }


      /* PROCESSAMENTO */

      const capabilityModel =
        AI_PROVIDER === "gemini"
          ? (
              Deno.env.get("GEMINI_MODEL") ||
              "gemini-3.6-flash"
            )
          : [
              Deno.env.get("OPENAI_TRANSCRIBE_MODEL") || "gpt-4o-transcribe",
              Deno.env.get("OPENAI_STRUCTURING_MODEL") || "gpt-5.6-terra",
              Deno.env.get("OPENAI_CLINICAL_MODEL") ||
                Deno.env.get("OPENAI_STRUCTURING_MODEL") ||
                "gpt-5.6-terra",
            ].join(" + ");

      const {
        value: result,
        metadata: executionMetadata,
      } = await executeCapability({
        capability: "consultation.processing",
        provider: AI_PROVIDER,
        model: capabilityModel,
        execute: () =>
          AI_PROVIDER === "gemini"
            ? processGemini(
                audio,
                caseMode,
                examples
              )
            : processOpenAI(
                audio,
                caseMode,
                examples
              ),
        validate: (value) =>
          Boolean(
            value &&
            typeof value === "object" &&
            value.fields &&
            typeof value.fields === "object" &&
            value.provider &&
            value.model
          ),
      });


      return withTechnicalExecutionHeaders(
        json(
          req,
          {
            ...result,
            style_source: styleSource,
            style_example_count: examples.length
          },
          200
        ),
        executionMetadata,
      );


    } catch (
      e
    ) {


      /* SESSÃO */

      if (
        e instanceof Error &&
        e.message ===
          "UNAUTHORIZED"
      ) {

        return json(
          req,
          {
            error:
              "Sessão inválida ou expirada."
          },
          401
        );

      }


      console.error(
        e
      );


      return json(
        req,
        {
          error:
            e instanceof Error
              ? e.message
              : "Falha interna."
        },
        500
      );

    }

  }
);