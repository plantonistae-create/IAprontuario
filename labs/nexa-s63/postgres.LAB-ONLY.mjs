// The caller supplies a trusted lab executor bound to one SCRAM login and a private socket.
import { digest, uuid } from './proof.LAB-ONLY.mjs';

const literal = (value, predicate, cast) => {
  if (!predicate(value)) throw Error('S63_DATABASE_ARGUMENT');
  return "'" + value + "'::" + cast;
};
const id = value => literal(value,uuid,'uuid');
const hash = value => literal(value,digest,'s63.digest');
const integer = value => {
  if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647) throw Error('S63_DATABASE_ARGUMENT');
  return String(value);
};
const instant = value => literal(value, x => typeof x === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x),'timestamptz');

export function postgresLabWorker(execute) {
  return Object.freeze({
    async acquire(requestId) {
      const result = await execute('SELECT s63.acquire(' + id(requestId) + ');');
      return result ? JSON.parse(result) : null;
    },
    async commit(input) {
      const values = [id(input.requestId),id(input.grantId),integer(input.revision),hash(input.head),
        hash(input.snapshotDigest),hash(input.keyId),hash(input.derivativesDigest),hash(input.artifactDigest),
        integer(input.rows),instant(input.expires)];
      return await execute('SELECT s63.commit_delivery(' + values.join(',') + ');') === 't';
    },
    async ingest(requestId, artifactDigest) {
      return await execute('SELECT s63.approve_ingestion(' + [id(requestId),hash(artifactDigest)].join(',') + ');') === 't';
    },
  });
}
