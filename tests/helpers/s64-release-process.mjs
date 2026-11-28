// S6.4 integration fixture. Each Node process receives one disposable DB credential.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createPublicKey } from 'node:crypto';
import { promisify } from 'node:util';
import { postgresLabWorker } from '../../labs/nexa-s63/postgres.LAB-ONLY.mjs';
import { createLabExporter } from '../../labs/nexa-s63/export.LAB-ONLY.mjs';
import { createLabTrustStore } from '../../labs/nexa-s63/proof.LAB-ONLY.mjs';

const run = promisify(execFile);
const env = process.env;
const peers = {s63_a:'s64_va',s63_b:'s64_vb',s64_va:'s63_a',s64_vb:'s63_b'};
const role = env.PGUSER;
const counterpart = peers[role];
assert(counterpart && env.PGPASSWORD && env.PGREQUIREAUTH==='scram-sha-256');
assert(/^\/private\/tmp\/s63-sandbox\.[a-zA-Z0-9]+\/pg-[a-zA-Z0-9]+\/s$/.test(env.PGHOST));
assert.equal(env.PGDATABASE,'nexa_s63_lab');
const input = [];
for await (const bytes of process.stdin) input.push(bytes);
const message = JSON.parse(Buffer.concat(input).toString('utf8'));
const identity = [];

const psql = (login,query) => run(env.NEXA_S64_PSQL,
  ['-X','-w','-qAt','-v','ON_ERROR_STOP=1','-U',login,'-c',query],{env,timeout:8000});
const capabilities = "SELECT jsonb_build_object('login',session_user,'backend',pg_backend_pid(),"+
  "'acquire',has_function_privilege(current_user,'s63.acquire(uuid)','EXECUTE'),"+
  "'commit',has_function_privilege(current_user,'s63.commit_delivery(uuid,uuid,integer,s63.digest,s63.digest,s63.digest,s63.digest,s63.digest,integer,timestamptz)','EXECUTE'));";
const execute = async query => {
  const {stdout} = await psql(role,capabilities+query);
  const [actual,...output] = stdout.trim().split('\n');
  const observed = JSON.parse(actual);
  assert.equal(observed.login,role);
  identity.push(observed);
  return output.join('\n');
};
try {
  await assert.rejects(psql(counterpart,'SELECT 1;'),/password authentication failed/i);
  const database = postgresLabWorker(execute);
  const acquire = role.startsWith('s63_');
  let output;
  if (acquire) {
    assert.deepEqual(Object.keys(message),['request']);
    output = await database.acquire(message.request);
  } else {
    const trust = createLabTrustStore();
    trust.pin(createPublicKey({key:Buffer.from(message.publicKey,'base64'),format:'der',type:'spki'}));
    const verifier = createLabExporter({database,signer:null,trust,pseudonymSecret:Buffer.from(message.pseudonymSecret,'hex')});
    output = await verifier.release(message.request,message.prepared);
  }
  console.log(JSON.stringify({pid:process.pid,identity,peerCredentialRejected:true,output}));
} catch (error) {
  const diagnostic = String(error.message).replaceAll(env.PGPASSWORD,'<redacted>');
  console.error(diagnostic);
  process.exitCode = 1;
}
