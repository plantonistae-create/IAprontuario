import assert from "node:assert/strict";
import test from "node:test";
import {
  NEXA_AI_CAPABILITIES,
  CapabilityResolutionError,
  CapabilityExecutionError,
  capabilityProviderFromEnv,
  executeCapability,
  resolveCapability,
  technicalExecutionHeaders,
} from "../supabase/functions/_shared/nexa-ai-capability.mjs";

test("registry exposes only the five migrated capability contracts", () => {
  assert.deepEqual(Object.keys(NEXA_AI_CAPABILITIES).sort(), [
    "audit.backfill",
    "audit.submit",
    "consultation.processing",
    "realtime.call",
    "realtime.radar",
  ]);
});

test("provider resolution is central and explicit", () => {
  assert.equal(capabilityProviderFromEnv("consultation.processing", () => ""), "openai");
  assert.equal(
    capabilityProviderFromEnv("consultation.processing", (name) => name === "AI_PROVIDER" ? "GEMINI" : ""),
    "gemini",
  );
  assert.equal(capabilityProviderFromEnv("realtime.radar", () => ""), "openai");

  assert.throws(
    () => resolveCapability("unknown.capability", { provider: "openai" }),
    (error) => error instanceof CapabilityResolutionError && error.code === "UNSUPPORTED_CAPABILITY",
  );
  assert.throws(
    () => resolveCapability("realtime.radar", { provider: "nexa-core" }),
    (error) => error instanceof CapabilityResolutionError && error.code === "UNSUPPORTED_PROVIDER",
  );
});

test("successful execution emits technical-only metadata", async () => {
  const observed = [];
  const ticks = [1000, 1042];
  const clinicalSecret = "PACIENTE JOAO CPF 000.000.000-00";

  const result = await executeCapability({
    capability: "realtime.radar",
    provider: "openai",
    model: "test-model",
    execute: async () => ({ ok: true, ignoredClinicalPayload: clinicalSecret }),
    observer: (metadata) => observed.push(metadata),
    clock: () => ticks.shift(),
    idFactory: () => "exec-test-1",
  });

  assert.equal(result.value.ok, true);
  assert.equal(result.metadata.executionId, "exec-test-1");
  assert.equal(result.metadata.capability, "realtime.radar");
  assert.equal(result.metadata.provider, "openai");
  assert.equal(result.metadata.model, "test-model");
  assert.equal(result.metadata.durationMs, 42);
  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.errorClass, null);
  assert.equal(observed.length, 1);

  const serialized = JSON.stringify(result.metadata);
  assert.equal(serialized.includes("JOAO"), false);
  assert.equal(serialized.includes("CPF"), false);
  assert.equal(serialized.includes("000.000"), false);
  assert.equal(Object.hasOwn(result.metadata, "prompt"), false);
  assert.equal(Object.hasOwn(result.metadata, "transcript"), false);
  assert.equal(Object.hasOwn(result.metadata, "audio"), false);
});

test("provider failure and timeout are observed without leaking error messages", async () => {
  const observed = [];
  const ticks = [2000, 2020];

  await assert.rejects(
    executeCapability({
      capability: "audit.submit",
      provider: "openai",
      model: "deid-model",
      execute: async () => {
        const error = new Error("clinical payload must never reach metadata");
        error.name = "TimeoutError";
        throw error;
      },
      observer: (metadata) => observed.push(metadata),
      clock: () => ticks.shift(),
      idFactory: () => "exec-timeout",
    }),
    /clinical payload/,
  );

  assert.equal(observed.length, 1);
  assert.equal(observed[0].success, false);
  assert.equal(observed[0].errorClass, "TIMEOUT");
  assert.equal(JSON.stringify(observed[0]).includes("clinical payload"), false);
});

test("invalid adapter response is explicit", async () => {
  const observed = [];
  const ticks = [3000, 3001];

  await assert.rejects(
    executeCapability({
      capability: "consultation.processing",
      provider: "openai",
      model: "model-a",
      execute: async () => ({ malformed: true }),
      validate: (value) => value?.fields && typeof value.fields === "object",
      observer: (metadata) => observed.push(metadata),
      clock: () => ticks.shift(),
      idFactory: () => "exec-invalid",
    }),
    (error) => error instanceof CapabilityExecutionError && error.code === "INVALID_RESPONSE",
  );

  assert.equal(observed[0].success, false);
  assert.equal(observed[0].errorClass, "INVALID_RESPONSE");
});

test("HTTP adapter failure is returned but marked unsuccessful", async () => {
  const observed = [];
  const ticks = [4000, 4005];

  const result = await executeCapability({
    capability: "realtime.call",
    provider: "openai",
    model: "realtime-model",
    execute: async () => new Response("upstream failed", { status: 502 }),
    observer: (metadata) => observed.push(metadata),
    clock: () => ticks.shift(),
    idFactory: () => "exec-http",
  });

  assert.equal(result.value.status, 502);
  assert.equal(result.metadata.success, false);
  assert.equal(result.metadata.errorClass, "HTTP_502");
});

test("technical headers contain only execution metadata", () => {
  const descriptor = resolveCapability("audit.backfill", {
    provider: "openai",
    model: "deid-model",
  });

  const metadata = {
    executionId: "exec-header",
    capability: descriptor.capability,
    capabilityVersion: descriptor.capabilityVersion,
    pipelineVersion: descriptor.pipelineVersion,
    provider: descriptor.provider,
    model: descriptor.model,
    adapterVersion: descriptor.adapterVersion,
    durationMs: 12,
    success: true,
    errorClass: null,
  };

  const headers = technicalExecutionHeaders(metadata);
  assert.equal(headers.get("x-nexa-execution-id"), "exec-header");
  assert.equal(headers.get("x-nexa-capability"), "audit.backfill");
  assert.equal(headers.get("x-nexa-provider"), "openai");
  assert.equal(headers.has("authorization"), false);
  assert.equal(headers.has("x-nexa-prompt"), false);
  assert.equal(headers.has("x-nexa-transcript"), false);
});
