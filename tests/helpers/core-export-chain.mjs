import { createHash } from 'node:crypto';

const hash = text => createHash('sha256').update(text).digest('hex');

export function signSyntheticChain(rows, { ownerId, encounterId }) {
  let parent = '0'.repeat(64);
  return rows.map(([kind, payload, payloadText, sequence], index) => {
    const seq = sequence ?? index + 1;
    const payload_canonical = payloadText ?? JSON.stringify(payload);
    const payload_digest = hash(payload_canonical);
    const record_digest = hash([ownerId, encounterId, seq, kind, payload_digest, parent].join('|'));
    const row = { seq, kind, payload, payload_canonical, payload_digest, record_digest, parent_digest: parent };
    parent = record_digest;
    return row;
  });
}

export function syntheticAttestation(chain, { ownerId, encounterId }) {
  return { valid: true, records: chain.length, head: chain.at(-1).record_digest,
    owner_id: ownerId, encounter_id: encounterId };
}
