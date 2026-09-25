// Existing production transport v4, versioned for staging parity; no changes deployed to production.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const REALTIME_MODEL =
  Deno.env.get("NEXA_REALTIME_MODEL") ||
  "gpt-realtime-2.1-mini";

const TRANSCRIBE_MODEL =
  Deno.env.get("NEXA_REALTIME_TRANSCRIBE_MODEL") ||
  "gpt-4o-mini-transcribe";

const ORIGIN =
  Deno.env.get("ALLOWED_ORIGIN") ||
  "https://plantonistae-create.github.io";

const cors = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(
  body: unknown,
  status = 200,
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...cors,
        "Content-Type":
          "application/json; charset=utf-8",
      },
    },
  );
}

async function getAuthenticatedUser(
  req: Request,
) {
  const auth =
    req.headers.get("Authorization") ||
    "";

  if (
    !auth.startsWith("Bearer ")
  ) {
    return {
      error:
        json(
          {
            error:
              "UNAUTHORIZED",
          },
          401,
        ),
    };
  }

  const userClient =
    createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization:
              auth,
          },
        },
      },
    );

  const {
    data: { user },
    error: userError,
  } =
    await userClient
      .auth
      .getUser();

  if (
    userError ||
    !user
  ) {
    return {
      error:
        json(
          {
            error:
              "UNAUTHORIZED",
          },
          401,
        ),
    };
  }

  const service =
    createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession:
            false,
        },
      },
    );

  const {
    data: profile,
    error: profileError,
  } =
    await service
      .from("profiles")
      .select(
        "clinical_access,access_status",
      )
      .eq(
        "id",
        user.id,
      )
      .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile
      .access_status !==
      "active" ||
    !profile
      .clinical_access
  ) {
    return {
      error:
        json(
          {
            error:
              "CLINICAL_ACCESS_REQUIRED",
          },
          403,
        ),
    };
  }

  return {
    user,
  };
}

async function createRealtimeCall(
  body: Record<string, unknown>,
) {
  const sdp =
    String(
      body?.sdp || "",
    );

  if (
    !sdp.startsWith(
      "v=0",
    )
  ) {
    return json(
      {
        error:
          "INVALID_SDP",
      },
      400,
    );
  }

  const noiseType =
    body?.device_hint ===
    "far_field"
      ? "far_field"
      : "near_field";

  const session = {
    type:
      "realtime",

    model:
      REALTIME_MODEL,

    output_modalities: [
      "text",
    ],

    instructions:
      "NEXA transient transcription transport only. Do not generate assistant replies. Do not answer the consultation. Input audio transcription is used temporarily by the Radar da Consulta.",

    audio: {
      input: {
        noise_reduction: {
          type:
            noiseType,
        },

        transcription: {
          model:
            TRANSCRIBE_MODEL,

          language:
            "pt",

          prompt: [
            "Consulta médica em português brasileiro.",
            "Transcreva fielmente o conteúdo audível.",
            "Preserve terminologia médica.",
            "Preserve nomes de medicamentos.",
            "Preserve doses e apresentações.",
            "Preserve números, sinais vitais e achados de exame físico quando audíveis.",
            "Não resuma.",
            "Não interprete.",
            "Não invente conteúdo.",
          ].join(" "),
        },

        turn_detection: {
          type:
            "server_vad",

          create_response:
            false,

          interrupt_response:
            false,

          prefix_padding_ms:
            300,

          silence_duration_ms:
            800,
        },
      },
    },
  };

  const form =
    new FormData();

  form.append(
    "sdp",
    new Blob(
      [sdp],
      {
        type:
          "application/sdp",
      },
    ),
    "offer.sdp",
  );

  form.append(
    "session",
    new Blob(
      [
        JSON.stringify(
          session,
        ),
      ],
      {
        type:
          "application/json",
      },
    ),
    "session.json",
  );

  const upstream =
    await fetch(
      "https://api.openai.com/v1/realtime/calls",
      {
        method:
          "POST",

        headers: {
          Authorization:
            `Bearer ${OPENAI_API_KEY}`,
        },

        signal: AbortSignal.timeout(18000),
        body:
          form,
      },
    );

  const answerSdp =
    await upstream.text();

  if (
    !upstream.ok
  ) {
    // Do not log consultation audio, transcript or upstream bodies.

    return json(
      {
        error:
          "REALTIME_SESSION_FAILED",

        status:
          upstream.status,

      },
      502,
    );
  }

  return json({
    mode:
      "webrtc",

    sdp:
      answerSdp,

    realtime_model:
      REALTIME_MODEL,

    transcription_model:
      TRANSCRIBE_MODEL,

    transient:
      true,

    official_transcript:
      false,
  });
}

async function transcribeFallback(
  req: Request,
) {
  const form =
    await req.formData();

  const audio =
    form.get("audio");

  if (
    !audio || typeof audio === 'string'
  ) {
    return json(
      {
        error:
          "AUDIO_REQUIRED",
      },
      400,
    );
  }

  if(audio.size>1024*1024)return json({error:"CHUNK_TOO_LARGE"},413);

  const upstreamForm =
    new FormData();

  upstreamForm.append(
    "file",
    audio,
    audio instanceof File
      ? audio.name
      : "radar-chunk.webm",
  );

  upstreamForm.append(
    "model",
    TRANSCRIBE_MODEL,
  );

  upstreamForm.append(
    "language",
    "pt",
  );

  upstreamForm.append(
    "prompt",
    [
      "Consulta médica em português brasileiro.",
      "Transcreva fielmente.",
      "Preserve nomes de medicamentos, doses, sintomas, sinais vitais e achados de exame físico.",
      "Não resuma.",
      "Não interprete.",
      "Não invente conteúdo.",
    ].join(" "),
  );

  upstreamForm.append(
    "response_format",
    "json",
  );

  const upstream =
    await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method:
          "POST",

        headers: {
          Authorization:
            `Bearer ${OPENAI_API_KEY}`,
        },

        signal: AbortSignal.timeout(18000),
        body:
          upstreamForm,
      },
    );

  const raw =
    await upstream.text();

  if (
    !upstream.ok
  ) {
    // Do not log consultation audio, transcript or upstream bodies.

    return json(
      {
        error:
          "FALLBACK_TRANSCRIPTION_FAILED",

        status:
          upstream.status,

      },
      502,
    );
  }

  let parsed: {text?: unknown} = {};

  try {
    parsed =
      JSON.parse(raw);
  } catch {
    return json(
      {
        error:
          "INVALID_TRANSCRIPTION_RESPONSE",
      },
      502,
    );
  }

  return json({
    mode:
      "chunk",

    text:
      String(
        parsed?.text ||
        "",
      ),

    transcription_model:
      TRANSCRIBE_MODEL,

    transient:
      true,

    official_transcript:
      false,
  });
}

Deno.serve(async (req: Request) => {
  if (
    req.method ===
    "OPTIONS"
  ) {
    return new Response(
      "ok",
      {
        headers:
          cors,
      },
    );
  }

  if (
    req.method !==
    "POST"
  ) {
    return json(
      {
        error:
          "METHOD_NOT_ALLOWED",
      },
      405,
    );
  }

  try {
    const authResult =
      await getAuthenticatedUser(
        req,
      );

    if (
      authResult.error
    ) {
      return authResult.error;
    }

    const contentType =
      req.headers.get(
        "content-type",
      ) || "";

    /*
     * FALLBACK PARA iPHONE/PWA
     *
     * O frontend envia pequenos chunks
     * temporários de áudio via FormData.
     *
     * Eles servem APENAS para o Radar.
     * A gravação principal continua separada.
     */
    if (
      contentType.includes(
        "multipart/form-data",
      )
    ) {
      return await transcribeFallback(
        req,
      );
    }

    /*
     * TENTATIVA PRINCIPAL:
     * sessão Realtime por WebRTC.
     */
    const body =
      await req
        .json()
        .catch(
          () => ({}),
        );

    return await createRealtimeCall(
      body,
    );
  } catch (error) {
    // Do not log consultation audio, transcript or upstream bodies.

    return json(
      {
        error:
          "INTERNAL_ERROR",
      },
      500,
    );
  }
});