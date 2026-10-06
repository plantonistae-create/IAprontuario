const PIPELINE_VERSION = "nexa-capability-pipeline-v1";

export const NEXA_AI_CAPABILITIES = Object.freeze({
  "consultation.processing": Object.freeze({
    capabilityVersion: "1.0.0",
    pipelineVersion: PIPELINE_VERSION,
    providerEnv: "AI_PROVIDER",
    defaultProvider: "openai",
    providers: Object.freeze({
      openai: Object.freeze({ adapterVersion: "consultation-openai-legacy-v1" }),
      gemini: Object.freeze({ adapterVersion: "consultation-gemini-legacy-v1" }),
    }),
  }),
  "realtime.call": Object.freeze({
    capabilityVersion: "1.0.0",
    pipelineVersion: PIPELINE_VERSION,
    providerEnv: "NEXA_REALTIME_PROVIDER",
    defaultProvider: "openai",
    providers: Object.freeze({
      openai: Object.freeze({ adapterVersion: "realtime-openai-legacy-v1" }),
    }),
  }),
  "realtime.radar": Object.freeze({
    capabilityVersion: "1.0.0",
    pipelineVersion: PIPELINE_VERSION,
    providerEnv: "NEXA_RADAR_PROVIDER",
    defaultProvider: "openai",
    providers: Object.freeze({
      openai: Object.freeze({ adapterVersion: "radar-openai-legacy-v1" }),
    }),
  }),
  "audit.submit": Object.freeze({
    capabilityVersion: "1.0.0",
    pipelineVersion: PIPELINE_VERSION,
    providerEnv: "NEXA_AUDIT_PROVIDER",
    defaultProvider: "openai",
    providers: Object.freeze({
      openai: Object.freeze({ adapterVersion: "audit-deid-openai-legacy-v1" }),
    }),
  }),
  "audit.backfill": Object.freeze({
    capabilityVersion: "1.0.0",
    pipelineVersion: PIPELINE_VERSION,
    providerEnv: "NEXA_AUDIT_PROVIDER",
    defaultProvider: "openai",
    providers: Object.freeze({
      openai: Object.freeze({ adapterVersion: "audit-backfill-openai-legacy-v1" }),
    }),
  }),
});

export class CapabilityResolutionError extends Error {
  constructor(code) {
    super(code);
    this.name = "CapabilityResolutionError";
    this.code = code;
  }
}

export class CapabilityExecutionError extends Error {
  constructor(code) {
    super(code);
    this.name = "CapabilityExecutionError";
    this.code = code;
  }
}

export function capabilityProviderFromEnv(capability, getEnv = () => undefined) {
  const definition = NEXA_AI_CAPABILITIES[capability];
  if (!definition) throw new CapabilityResolutionError("UNSUPPORTED_CAPABILITY");
  const configured = String(getEnv(definition.providerEnv) || "").trim().toLowerCase();
  return configured || definition.defaultProvider;
}

export function resolveCapability(capability, { provider, model = "" } = {}) {
  const definition = NEXA_AI_CAPABILITIES[capability];
  if (!definition) throw new CapabilityResolutionError("UNSUPPORTED_CAPABILITY");

  const resolvedProvider = String(provider || definition.defaultProvider).trim().toLowerCase();
  const providerDefinition = definition.providers[resolvedProvider];
  if (!providerDefinition) throw new CapabilityResolutionError("UNSUPPORTED_PROVIDER");

  return Object.freeze({
    capability,
    capabilityVersion: definition.capabilityVersion,
    pipelineVersion: definition.pipelineVersion,
    provider: resolvedProvider,
    model: String(model || ""),
    adapterVersion: providerDefinition.adapterVersion,
  });
}

function executionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `nexa-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function errorClass(error) {
  const name = String(error?.name || "");
  const code = String(error?.code || "");
  if (name === "TimeoutError" || name === "AbortError" || code === "TIMEOUT") return "TIMEOUT";
  const source = code || name || "EXECUTION_ERROR";
  const normalized = source.toUpperCase().replace(/[^A-Z0-9_]+/g, "_").slice(0, 80);
  return normalized || "EXECUTION_ERROR";
}

function emitTechnicalObservation(metadata, observer) {
  if (typeof observer === "function") {
    observer(metadata);
    return;
  }
  console.info("NEXA_AI_EXECUTION", JSON.stringify(metadata));
}

function buildMetadata(descriptor, {
  id,
  startedMs,
  finishedMs,
  success,
  errorClass: executionErrorClass = null,
}) {
  return Object.freeze({
    executionId: id,
    capability: descriptor.capability,
    capabilityVersion: descriptor.capabilityVersion,
    pipelineVersion: descriptor.pipelineVersion,
    provider: descriptor.provider,
    model: descriptor.model,
    adapterVersion: descriptor.adapterVersion,
    startedAt: new Date(startedMs).toISOString(),
    finishedAt: new Date(finishedMs).toISOString(),
    durationMs: Math.max(0, finishedMs - startedMs),
    success: Boolean(success),
    errorClass: executionErrorClass,
  });
}

export async function executeCapability({
  capability,
  provider,
  model = "",
  execute,
  validate,
  observer,
  clock = () => Date.now(),
  idFactory = executionId,
}) {
  if (typeof execute !== "function") {
    throw new CapabilityExecutionError("ADAPTER_EXECUTOR_REQUIRED");
  }

  const descriptor = resolveCapability(capability, { provider, model });
  const startedMs = Number(clock());
  const id = String(idFactory());

  try {
    const value = await execute(descriptor);

    if (typeof validate === "function") {
      const valid = await validate(value, descriptor);
      if (!valid) throw new CapabilityExecutionError("INVALID_RESPONSE");
    }

    const responseFailed =
      typeof Response !== "undefined" &&
      value instanceof Response &&
      !value.ok;

    const finishedMs = Number(clock());
    const metadata = buildMetadata(descriptor, {
      id,
      startedMs,
      finishedMs,
      success: !responseFailed,
      errorClass: responseFailed ? `HTTP_${value.status}` : null,
    });

    emitTechnicalObservation(metadata, observer);
    return { value, metadata };
  } catch (error) {
    const finishedMs = Number(clock());
    const metadata = buildMetadata(descriptor, {
      id,
      startedMs,
      finishedMs,
      success: false,
      errorClass: errorClass(error),
    });

    emitTechnicalObservation(metadata, observer);
    throw error;
  }
}

export function technicalExecutionHeaders(metadata) {
  const headers = new Headers();
  headers.set("x-nexa-execution-id", metadata.executionId);
  headers.set("x-nexa-capability", metadata.capability);
  headers.set("x-nexa-capability-version", metadata.capabilityVersion);
  headers.set("x-nexa-pipeline-version", metadata.pipelineVersion);
  headers.set("x-nexa-provider", metadata.provider);
  headers.set("x-nexa-model", metadata.model);
  headers.set("x-nexa-adapter-version", metadata.adapterVersion);
  headers.set("x-nexa-duration-ms", String(metadata.durationMs));
  headers.set("x-nexa-success", String(metadata.success));
  if (metadata.errorClass) headers.set("x-nexa-error-class", metadata.errorClass);
  return headers;
}

export function withTechnicalExecutionHeaders(response, metadata) {
  if (!(response instanceof Response)) {
    throw new CapabilityExecutionError("RESPONSE_REQUIRED");
  }
  const headers = new Headers(response.headers);
  for (const [key, value] of technicalExecutionHeaders(metadata)) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
