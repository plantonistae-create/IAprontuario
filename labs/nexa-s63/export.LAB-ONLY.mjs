// No file writer, network transport, training job, hosted API, or KMS.
import { createHmac } from 'node:crypto';
import { sha, uuid } from './proof.LAB-ONLY.mjs';

const kinds = {
  asr: ['transcript_final','transcript_corrected'],
  documentation: ['clinical_fields','physician_edit'],
  radar: ['radar'],
};
const privatePattern = /[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|[\w.+-]+@[\w-]+\.[\w.-]+|\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\(?\b\d{2}\)?\s?9?\d{4}-?\d{4}\b|\b(?:prontu[aá]rio|paciente)\s*[:#]?\s*\d{4,}/i;
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 4096 && !privatePattern.test(value);
const hasKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length > 0 && Object.keys(value).every(key => keys.includes(key));

function validDerivative(task, payload) {
  if (task === 'asr') return hasKeys(payload, ['text']) && text(payload.text);
  if (task === 'documentation') {
    return hasKeys(payload, ['fields']) && hasKeys(payload.fields, ['hda','assessment','plan'])
      && Object.values(payload.fields).every(text);
  }
  return hasKeys(payload, ['signals']) && Array.isArray(payload.signals) && payload.signals.length > 0
    && payload.signals.length <= 16 && payload.signals.every(value => typeof value === 'string' && /^(?:synthetic_info|synthetic_review)$/.test(value));
}

const manifestKeys = ['schema_version','dataset','task','purpose','modality','policy','records',
  'content_sha256','synthetic_only','clinical_audio'];
const manifestDigest = manifest => sha(JSON.stringify(['nexa-s63-artifact-v1', ...manifestKeys.map(key => manifest[key])]));

function buildArtifact(snapshot, secret) {
  const r = snapshot.request;
  const pertinent = snapshot.records.filter(row => kinds[r.task].includes(row.kind));
  const approved = new Map(snapshot.derivatives.map(row => [row.source_digest, row]));
  if (!pertinent.length || approved.size !== snapshot.derivatives.length || approved.size !== pertinent.length) {
    throw Error('S63_DERIVATIVE_COVERAGE');
  }
  const encounter = createHmac('sha256', secret)
    .update(JSON.stringify(['nexa-s63-dataset-group-v1',r.dataset,r.owner_id,r.encounter_id])).digest('hex');
  const linked = [];
  const rows = pertinent.map((row, index) => {
    const provenance = JSON.parse(row.payload_canonical).provenance;
    if (provenance?.origin !== 'synthetic' || provenance?.generator !== 's63-fixture' || provenance?.version !== '1'
        || !hasKeys(provenance, ['origin','generator','version'])) throw Error('S63_PROVENANCE_NOT_AUTHORIZED');
    const derivative = approved.get(row.record_digest);
    if (!derivative) throw Error('S63_DEIDENTIFICATION_REQUIRED');
    const data = JSON.parse(derivative.payload_canonical);
    if (!validDerivative(r.task, data)) throw Error('S63_DERIVATIVE_UNSAFE');
    linked.push(derivative.source_digest + ':' + derivative.digest);
    return { encounter, index: index + 1, data, provenance: { origin:'synthetic', generator:'s63-fixture', version:'1' },
      transformation: 's63-deid-fixture-v1' };
  });
  const jsonl = rows.map(row => JSON.stringify(row)).join('\n') + '\n';
  const manifest = {
    schema_version: 'nexa-s63-synthetic-manifest-v1', dataset:r.dataset, task:r.task, purpose:r.purpose,
    modality:r.modality, policy:r.policy, records:rows.length, content_sha256:sha(jsonl),
    synthetic_only:true, clinical_audio:false,
  };
  return { derivativesDigest: sha(linked.join(',')), jsonl, manifest: {
    ...manifest, artifact_digest:manifestDigest(manifest),
  } };

}

// Instances live inside the trusted lab worker. Prepare returns internal proof material only.
export function createLabExporter({ database, signer, trust, pseudonymSecret, clock = Date.now }) {
  if (!Buffer.isBuffer(pseudonymSecret) || pseudonymSecret.length !== 32) throw Error('S63_PSEUDONYM_SECRET_REQUIRED');
  const secret = Buffer.from(pseudonymSecret);
  return Object.freeze({
    async prepare(requestId) {
      if (!uuid(requestId)) throw Error('S63_REQUEST_INVALID');
      const snapshot = await database.acquire(requestId);
      if (!snapshot || snapshot.request.id !== requestId) throw Error('S63_ACQUISITION_DENIED');
      return { snapshot, proof:signer.attest(snapshot,clock()) };
    },
    async release(requestId, prepared) {
      const { snapshot, proof } = structuredClone(prepared);
      const claims = trust.verify(proof,snapshot,requestId,clock());
      const { jsonl, manifest, derivativesDigest } = buildArtifact(snapshot,secret);
      const committed = await database.commit({
        requestId, grantId:snapshot.grant.id, revision:snapshot.grant.revision, head:claims.head,
        snapshotDigest:claims.snapshot_digest, keyId:claims.key_id, derivativesDigest,
        artifactDigest:manifest.artifact_digest, rows:manifest.records, expires:claims.expires_at,
      });
      if (committed !== true) throw Error('S63_DELIVERY_DENIED');
      return { jsonl, manifest };
    },
    async approveIngestion(requestId, artifact) {
      const manifest = artifact?.manifest;
      if (!uuid(requestId) || typeof artifact?.jsonl !== 'string' || manifest?.synthetic_only !== true
          || Object.keys(manifest).length !== manifestKeys.length + 1 || !manifestKeys.every(key => Object.hasOwn(manifest,key))
          || sha(artifact.jsonl) !== manifest.content_sha256 || manifestDigest(manifest) !== manifest.artifact_digest) {
        throw Error('S63_ARTIFACT_INVALID');
      }
      if (await database.ingest(requestId,artifact.manifest.artifact_digest) !== true) throw Error('S63_INGESTION_DENIED');
      return true;
    },
  });
}
