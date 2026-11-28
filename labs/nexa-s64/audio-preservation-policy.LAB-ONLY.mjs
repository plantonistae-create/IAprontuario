// LAB-ONLY pure policy projection. Inputs must come from already verified clinical adapters; booleans are NOT cryptographic evidence or access authorization. No I/O, no clinical activation, no purge.
export function assessClinicalAudio(input) {
  const scope = input?.scope;
  const uuid = v => typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
  const hash = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
  const valid = scope && [scope.ownerId,scope.encounterId,scope.sessionId].every(uuid)
    && Number.isSafeInteger(scope.sourceVersion) && scope.sourceVersion > 0;
  const matches = item => valid && item && ['ownerId','encounterId','sessionId','sourceVersion'].every(k => item[k] === scope[k]);
  const local = matches(input?.local) && input.local.encrypted === true && input.local.integrityVerified === true;
  const complete = local && input.local.finalized === true && input.local.partial === false
    && hash(input.local.manifestDigest);
  const remote = complete && matches(input?.remote) && input.remote.readbackVerified === true
    && hash(input.remote.manifestDigest) && input.remote.manifestDigest === input.local.manifestDigest;
  const status = !valid ? 'invalid_scope' : remote ? 'remote_verified' : complete ? 'local_verified' :
    local ? 'local_partial' : 'unverified';
  return { status, clinicalRecoveryCandidate: Boolean(local || remote),
    remotePreserved: Boolean(remote), trainingAuthorized:false, exportAuthorized:false, purgeAuthorized:false };
}
