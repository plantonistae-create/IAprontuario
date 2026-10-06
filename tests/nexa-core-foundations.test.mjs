import assert from "node:assert/strict";
import test from "node:test";
import {
  NEXA_CORE_ARTIFACT_TYPES,
  NEXA_CORE_DATASET_SPLITS,
  createAuditedCase,
  createDatasetItem,
  createEvaluationRun,
  createModelVersion,
  deterministicDatasetSplit,
  runEvaluation,
  validateDatasetItem,
} from "../supabase/functions/_shared/nexa-core-foundations.mjs";

function auditedFixture() {
  return createAuditedCase({
    id: "audit-case-1",
    quality_status: "corrected",
    case_data: {
      queixa_principal: "DOR SINTETICA",
      hda: "CASO SINTETICO PARA TESTE",
    },
    learning_profile: {
      original_ai: { hypothesis: "A" },
      physician_final: { hypothesis: "B" },
      audit_corrected: { fields: { hypothesis: "C" } },
      target: { fields: { hypothesis: "C" } },
      destination: { final: "alta" },
      hypothesis_validation: { final: "C" },
    },
    core_schema_version: "3",
    audit_reviewed_at: "2026-10-06T00:00:00.000Z",
    transcript: "SHOULD_NOT_BE_COPIED_FROM_TOP_LEVEL",
    audio: "SHOULD_NOT_BE_COPIED",
    prompt: "SHOULD_NOT_BE_COPIED",
  });
}

test("artifact taxonomy keeps audit, dataset, sets, evaluation and model versions distinct", () => {
  assert.deepEqual(Object.values(NEXA_CORE_ARTIFACT_TYPES), [
    "RAW_CASE",
    "AUDITED_CASE",
    "DATASET_ITEM",
    "TRAINING_SET",
    "VALIDATION_SET",
    "TEST_SET",
    "EVALUATION_RUN",
    "MODEL_VERSION",
  ]);
});

test("only approved or corrected audited rows become AUDITED_CASE artifacts", () => {
  assert.equal(auditedFixture().artifactType, "AUDITED_CASE");
  assert.throws(
    () => createAuditedCase({
      id: "pending",
      quality_status: "pending",
      case_data: {},
      learning_profile: {},
    }),
    /AUDITED_CASE_NOT_ELIGIBLE/,
  );
});

test("dataset item creation requires a real audited artifact and explicit dataset version", () => {
  const audited = auditedFixture();
  assert.throws(() => createDatasetItem({ ...audited, artifactType: "RAW_CASE" }, { datasetVersion: "ds-v1" }), /AUDITED_CASE_REQUIRED/);
  assert.throws(() => createDatasetItem(audited), /DATASET_VERSION_REQUIRED/);

  const item = createDatasetItem(audited, { datasetVersion: "ds-v1" });
  assert.equal(item.artifactType, "DATASET_ITEM");
  assert.equal(item.source.artifactType, "AUDITED_CASE");
  assert.equal(item.datasetVersion, "ds-v1");
  assert.ok(Object.values(NEXA_CORE_DATASET_SPLITS).includes(item.split));
  assert.equal(validateDatasetItem(item).ok, true);

  const serialized = JSON.stringify(item);
  assert.equal(serialized.includes("SHOULD_NOT_BE_COPIED"), false);
});

test("dataset split is deterministic and stable", () => {
  const a = deterministicDatasetSplit("audit-case-123");
  const b = deterministicDatasetSplit("audit-case-123");
  assert.equal(a, b);
  assert.ok(["training", "validation", "test"].includes(a));
});

test("model registry record cannot imply readiness without training and clinical validation evidence", () => {
  const candidate = createModelVersion({
    id: "provider-current-v1",
    capability: "realtime.radar",
    provider: "openai",
    model: "synthetic-model",
    adapterVersion: "radar-openai-legacy-v1",
  });
  assert.equal(candidate.artifactType, "MODEL_VERSION");
  assert.equal(candidate.status, "candidate");
  assert.equal(candidate.evidence.trained, false);
  assert.equal(candidate.evidence.clinicallyValidated, false);
  assert.equal(candidate.deploymentReady, false);

  const validatedButUntrained = createModelVersion({
    id: "candidate-v2",
    capability: "realtime.radar",
    provider: "nexa-core",
    model: "future-model",
    adapterVersion: "future-adapter-v1",
    status: "validated",
    evidence: { clinicallyValidated: true, trained: false },
  });
  assert.equal(validatedButUntrained.deploymentReady, false);
});

test("evaluation harness returns metrics and technical ids without persisting predictions or targets", async () => {
  const item = createDatasetItem(auditedFixture(), {
    datasetVersion: "ds-v1",
    split: "test",
  });
  const run = createEvaluationRun({
    id: "eval-1",
    capability: "consultation.processing",
    datasetVersion: "ds-v1",
    modelVersionId: "model-1",
  });

  const result = await runEvaluation({
    run,
    items: [item],
    predict: async () => ({ fields: { hypothesis: "C" }, privateReasoning: "DO_NOT_PERSIST" }),
    scorers: {
      exact: (prediction, target) =>
        prediction.fields.hypothesis === target.fields.hypothesis ? 1 : 0,
    },
  });

  assert.equal(result.artifactType, "EVALUATION_RUN");
  assert.equal(result.status, "completed");
  assert.equal(result.succeeded, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.metrics.exact, 1);
  assert.equal(result.caseResults[0].datasetItemId, item.datasetItemId);
  assert.equal(result.caseResults[0].metrics.exact, 1);

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("DO_NOT_PERSIST"), false);
  assert.equal(serialized.includes('"target"'), false);
  assert.equal(serialized.includes('"prediction"'), false);
});

test("evaluation failures expose only error class, not error message or clinical output", async () => {
  const item = createDatasetItem(auditedFixture(), {
    datasetVersion: "ds-v1",
    split: "test",
  });
  const run = createEvaluationRun({
    id: "eval-failure",
    capability: "consultation.processing",
    datasetVersion: "ds-v1",
    modelVersionId: "model-1",
  });

  const result = await runEvaluation({
    run,
    items: [item],
    predict: async () => {
      const error = new Error("SENSITIVE CLINICAL PAYLOAD");
      error.name = "ProviderTimeout";
      throw error;
    },
    scorers: { exact: () => 1 },
  });

  assert.equal(result.status, "partial");
  assert.equal(result.failed, 1);
  assert.equal(result.caseResults[0].errorClass, "PROVIDERTIMEOUT");
  assert.equal(JSON.stringify(result).includes("SENSITIVE CLINICAL PAYLOAD"), false);
});
