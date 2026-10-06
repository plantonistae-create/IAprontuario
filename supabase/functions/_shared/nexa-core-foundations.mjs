export const NEXA_CORE_ARTIFACT_TYPES = Object.freeze({
  RAW_CASE: "RAW_CASE",
  AUDITED_CASE: "AUDITED_CASE",
  DATASET_ITEM: "DATASET_ITEM",
  TRAINING_SET: "TRAINING_SET",
  VALIDATION_SET: "VALIDATION_SET",
  TEST_SET: "TEST_SET",
  EVALUATION_RUN: "EVALUATION_RUN",
  MODEL_VERSION: "MODEL_VERSION",
});

export const NEXA_CORE_DATASET_SPLITS = Object.freeze({
  TRAINING: "training",
  VALIDATION: "validation",
  TEST: "test",
});

export const NEXA_CORE_SCHEMA_VERSIONS = Object.freeze({
  auditedCase: "nexa-audited-case-v1",
  datasetItem: "nexa-dataset-item-v1",
  evaluationRun: "nexa-evaluation-run-v1",
  modelVersion: "nexa-model-version-v1",
});

const AUDIT_ELIGIBLE_STATUSES = new Set(["approved", "corrected"]);
const MODEL_STATUSES = new Set(["candidate", "baseline", "validated", "retired"]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value, code) {
  const text = String(value || "").trim();
  if (!text) throw new Error(code);
  return text;
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function safeErrorClass(error) {
  const source = String(error?.code || error?.name || "EVALUATION_ERROR");
  return source.toUpperCase().replace(/[^A-Z0-9_]+/g, "_").slice(0, 80) || "EVALUATION_ERROR";
}

function stableBucket(value) {
  const text = String(value || "");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 10000;
}

export function createAuditedCase(coreCaseRow) {
  if (!isObject(coreCaseRow)) throw new Error("AUDITED_CASE_REQUIRED");

  const qualityStatus = String(coreCaseRow.quality_status || "").toLowerCase();
  if (!AUDIT_ELIGIBLE_STATUSES.has(qualityStatus)) {
    throw new Error("AUDITED_CASE_NOT_ELIGIBLE");
  }
  if (!isObject(coreCaseRow.case_data)) throw new Error("AUDITED_CASE_DATA_REQUIRED");
  if (!isObject(coreCaseRow.learning_profile)) throw new Error("AUDITED_CASE_LEARNING_PROFILE_REQUIRED");

  return Object.freeze({
    artifactType: NEXA_CORE_ARTIFACT_TYPES.AUDITED_CASE,
    schemaVersion: NEXA_CORE_SCHEMA_VERSIONS.auditedCase,
    auditCaseId: nonEmpty(coreCaseRow.audit_case_id || coreCaseRow.id, "AUDIT_CASE_ID_REQUIRED"),
    qualityStatus,
    caseData: clone(coreCaseRow.case_data),
    learningProfile: clone(coreCaseRow.learning_profile),
    coreSchemaVersion: String(coreCaseRow.core_schema_version || ""),
    auditedAt: String(coreCaseRow.audit_reviewed_at || ""),
  });
}

export function deterministicDatasetSplit(stableId) {
  const bucket = stableBucket(nonEmpty(stableId, "DATASET_SPLIT_ID_REQUIRED"));
  if (bucket < 8000) return NEXA_CORE_DATASET_SPLITS.TRAINING;
  if (bucket < 9000) return NEXA_CORE_DATASET_SPLITS.VALIDATION;
  return NEXA_CORE_DATASET_SPLITS.TEST;
}

export function createDatasetItem(auditedCase, {
  datasetVersion,
  split,
} = {}) {
  if (!isObject(auditedCase) || auditedCase.artifactType !== NEXA_CORE_ARTIFACT_TYPES.AUDITED_CASE) {
    throw new Error("AUDITED_CASE_REQUIRED");
  }
  if (!isObject(auditedCase.learningProfile?.target)) {
    throw new Error("AUDITED_TARGET_REQUIRED");
  }

  const resolvedSplit = split || deterministicDatasetSplit(auditedCase.auditCaseId);
  if (!Object.values(NEXA_CORE_DATASET_SPLITS).includes(resolvedSplit)) {
    throw new Error("INVALID_DATASET_SPLIT");
  }

  return Object.freeze({
    artifactType: NEXA_CORE_ARTIFACT_TYPES.DATASET_ITEM,
    schemaVersion: NEXA_CORE_SCHEMA_VERSIONS.datasetItem,
    datasetVersion: nonEmpty(datasetVersion, "DATASET_VERSION_REQUIRED"),
    datasetItemId: `${auditedCase.auditCaseId}:${datasetVersion}`,
    split: resolvedSplit,
    source: Object.freeze({
      artifactType: NEXA_CORE_ARTIFACT_TYPES.AUDITED_CASE,
      auditCaseId: auditedCase.auditCaseId,
      qualityStatus: auditedCase.qualityStatus,
      coreSchemaVersion: auditedCase.coreSchemaVersion,
      auditedAt: auditedCase.auditedAt,
    }),
    input: Object.freeze({
      caseData: clone(auditedCase.caseData),
      originalAi: clone(auditedCase.learningProfile.original_ai || {}),
      physicianFinal: clone(auditedCase.learningProfile.physician_final || {}),
      destination: clone(auditedCase.learningProfile.destination || {}),
      hypothesisValidation: clone(auditedCase.learningProfile.hypothesis_validation || {}),
    }),
    target: clone(auditedCase.learningProfile.target),
  });
}

export function validateDatasetItem(item) {
  if (!isObject(item) || item.artifactType !== NEXA_CORE_ARTIFACT_TYPES.DATASET_ITEM) {
    return { ok: false, error: "DATASET_ITEM_REQUIRED" };
  }
  if (!String(item.datasetVersion || "")) return { ok: false, error: "DATASET_VERSION_REQUIRED" };
  if (!Object.values(NEXA_CORE_DATASET_SPLITS).includes(item.split)) {
    return { ok: false, error: "INVALID_DATASET_SPLIT" };
  }
  if (!isObject(item.input) || !isObject(item.target)) {
    return { ok: false, error: "DATASET_ITEM_CONTENT_REQUIRED" };
  }
  return { ok: true, error: null };
}

export function createModelVersion({
  id,
  capability,
  provider,
  model,
  adapterVersion,
  status = "candidate",
  createdAt = new Date().toISOString(),
  evidence = {},
}) {
  const normalizedStatus = String(status || "").toLowerCase();
  if (!MODEL_STATUSES.has(normalizedStatus)) throw new Error("INVALID_MODEL_STATUS");

  return Object.freeze({
    artifactType: NEXA_CORE_ARTIFACT_TYPES.MODEL_VERSION,
    schemaVersion: NEXA_CORE_SCHEMA_VERSIONS.modelVersion,
    id: nonEmpty(id, "MODEL_VERSION_ID_REQUIRED"),
    capability: nonEmpty(capability, "MODEL_CAPABILITY_REQUIRED"),
    provider: nonEmpty(provider, "MODEL_PROVIDER_REQUIRED"),
    model: nonEmpty(model, "MODEL_NAME_REQUIRED"),
    adapterVersion: nonEmpty(adapterVersion, "MODEL_ADAPTER_VERSION_REQUIRED"),
    status: normalizedStatus,
    createdAt: String(createdAt),
    evidence: Object.freeze({
      trained: evidence.trained === true,
      clinicallyValidated: evidence.clinicallyValidated === true,
      evaluationRunIds: Array.isArray(evidence.evaluationRunIds)
        ? evidence.evaluationRunIds.map(String)
        : [],
    }),
    deploymentReady:
      normalizedStatus === "validated" &&
      evidence.trained === true &&
      evidence.clinicallyValidated === true,
  });
}

export function createEvaluationRun({
  id,
  capability,
  datasetVersion,
  modelVersionId,
  baselineModelVersionId = "",
  createdAt = new Date().toISOString(),
}) {
  return Object.freeze({
    artifactType: NEXA_CORE_ARTIFACT_TYPES.EVALUATION_RUN,
    schemaVersion: NEXA_CORE_SCHEMA_VERSIONS.evaluationRun,
    id: nonEmpty(id, "EVALUATION_RUN_ID_REQUIRED"),
    capability: nonEmpty(capability, "EVALUATION_CAPABILITY_REQUIRED"),
    datasetVersion: nonEmpty(datasetVersion, "EVALUATION_DATASET_VERSION_REQUIRED"),
    modelVersionId: nonEmpty(modelVersionId, "EVALUATION_MODEL_VERSION_REQUIRED"),
    baselineModelVersionId: String(baselineModelVersionId || ""),
    createdAt: String(createdAt),
    status: "planned",
  });
}

export async function runEvaluation({
  run,
  items,
  predict,
  scorers,
}) {
  if (!isObject(run) || run.artifactType !== NEXA_CORE_ARTIFACT_TYPES.EVALUATION_RUN) {
    throw new Error("EVALUATION_RUN_REQUIRED");
  }
  if (!Array.isArray(items) || !items.length) throw new Error("EVALUATION_ITEMS_REQUIRED");
  if (typeof predict !== "function") throw new Error("EVALUATION_PREDICTOR_REQUIRED");
  if (!isObject(scorers) || !Object.keys(scorers).length) throw new Error("EVALUATION_SCORERS_REQUIRED");

  const caseResults = [];
  const metricTotals = Object.fromEntries(Object.keys(scorers).map((name) => [name, 0]));
  const metricCounts = Object.fromEntries(Object.keys(scorers).map((name) => [name, 0]));

  for (const item of items) {
    const validation = validateDatasetItem(item);
    if (!validation.ok) {
      caseResults.push({
        datasetItemId: String(item?.datasetItemId || ""),
        success: false,
        errorClass: validation.error,
        metrics: {},
      });
      continue;
    }

    try {
      const prediction = await predict(item);
      const metrics = {};
      for (const [name, scorer] of Object.entries(scorers)) {
        if (typeof scorer !== "function") throw new Error("INVALID_SCORER");
        const raw = await scorer(prediction, item.target, item);
        const score = Number(raw);
        if (!Number.isFinite(score)) throw new Error("INVALID_SCORE");
        metrics[name] = score;
        metricTotals[name] += score;
        metricCounts[name] += 1;
      }
      caseResults.push({
        datasetItemId: item.datasetItemId,
        success: true,
        errorClass: null,
        metrics,
      });
    } catch (error) {
      caseResults.push({
        datasetItemId: item.datasetItemId,
        success: false,
        errorClass: safeErrorClass(error),
        metrics: {},
      });
    }
  }

  const metrics = {};
  for (const name of Object.keys(scorers)) {
    metrics[name] = metricCounts[name]
      ? metricTotals[name] / metricCounts[name]
      : null;
  }

  const succeeded = caseResults.filter((result) => result.success).length;
  return Object.freeze({
    ...run,
    status: succeeded === items.length ? "completed" : "partial",
    completedAt: new Date().toISOString(),
    itemCount: items.length,
    succeeded,
    failed: items.length - succeeded,
    metrics: Object.freeze(metrics),
    caseResults: Object.freeze(caseResults),
  });
}
