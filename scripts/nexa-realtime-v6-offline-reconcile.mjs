// Offline-only gate. Never deploys, calls OpenAI/Supabase, logs source, or writes a file.
// Build a surgical TEXT multipart candidate exclusively from the exact hosted v6 bytes.
// The source bundle is supplied by an authorized caller IN MEMORY and never committed.
import { createHash } from 'node:crypto';

export const HOSTED_V6 = Object.freeze({
  version: 6,
  verify_jwt: true,
  ezbr_sha256: '1675c95f6b1a25569c6af86e5c461f05fd475ee0d8a759439631d2d56221e005',
  files: Object.freeze({
    'realtime-call/index.ts': Object.freeze({
      characters: 10619,
      sha256: 'ba9f052b8bdcf89053df3ead9c36d111a7d3d7c40edcc662734556175d691588',
    }),
    '_shared/nexa-ai-capability.mjs': Object.freeze({
      characters: 8321,
      sha256: '931c7d375f608f5c527162f3b70f6d85ce4212a0aab0ef553cf04feedb7c884e',
    }),
    '_shared/nexa-realtime-upstream-status.mjs': Object.freeze({
      characters: 791,
      sha256: '3d1765dd31dc07f0cd664569fce8c2973da883aedea55dccbc19e967c0d7453f',
    }),
    'deno.json': Object.freeze({
      characters: 115,
      sha256: 'fc948950021dfa122f56d700420bc205bb9f3b565e96398accba344c3a2665b4',
    }),
  }),
});

const ORIGINAL_MULTIPART = [
  '  const form =',
  '    new FormData();',
  '',
  '  form.append(',
  '    "sdp",',
  '    new Blob(',
  '      [sdp],',
  '      {',
  '        type:',
  '          "application/sdp",',
  '      },',
  '    ),',
  '    "offer.sdp",',
  '  );',
  '',
  '  form.append(',
  '    "session",',
  '    new Blob(',
  '      [',
  '        JSON.stringify(',
  '          session,',
  '        ),',
  '      ],',
  '      {',
  '        type:',
  '          "application/json",',
  '      },',
  '    ),',
  '    "session.json",',
  '  );',
  '',
].join('\n');

const TEXT_MULTIPART = [
  '  const form =',
  '    new FormData();',
  '',
  '  form.set("sdp", sdp);',
  '  form.set("session", JSON.stringify(session));',
  '',
].join('\n');

export class RealtimeV6GateError extends Error {
  constructor(code) {
    super(code);
    this.name = 'RealtimeV6GateError';
    this.code = code;
  }
}

export function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

export function proposeWireOnlyPatch(source) {
  if (typeof source !== 'string') throw new RealtimeV6GateError('ENTRY_SOURCE_REQUIRED');
  if (countOccurrences(source, ORIGINAL_MULTIPART) !== 1) {
    throw new RealtimeV6GateError('HOSTED_V6_MULTIPART_ANCHOR_MISMATCH');
  }
  if (countOccurrences(source, '  const upstream =') !== 2) {
    throw new RealtimeV6GateError('HOSTED_V6_TRANSPORT_BRANCH_MISMATCH');
  }
  const updated = source.replace(ORIGINAL_MULTIPART, TEXT_MULTIPART);
  if (updated.replace(TEXT_MULTIPART, ORIGINAL_MULTIPART) !== source) {
    throw new RealtimeV6GateError('PATCH_NOT_REVERSIBLE');
  }
  if (
    !updated.includes('getAuthenticatedUser(') ||
    !updated.includes('async function transcribeFallback(') ||
    !updated.includes('emitRealtimeUpstreamStatus("webrtc", upstream.status)') ||
    !updated.includes('emitRealtimeUpstreamStatus("chunk", upstream.status)') ||
    countOccurrences(updated, 'AbortSignal.timeout(18000)') !== 2 ||
    !updated.includes('error:\n          "REALTIME_SESSION_FAILED"')
  ) {
    throw new RealtimeV6GateError('HOSTED_V6_SAFETY_INVARIANT_MISMATCH');
  }
  return Object.freeze({
    source,
    updated,
    bytesChanged: Buffer.byteLength(TEXT_MULTIPART) - Buffer.byteLength(ORIGINAL_MULTIPART),
    sourceSha256: sha256Text(source),
    candidateSha256: sha256Text(updated),
  });
}

export function reconcileHostedV6(bundle) {
  if (!bundle || typeof bundle !== 'object' ||
      bundle.version !== HOSTED_V6.version ||
      bundle.verify_jwt !== HOSTED_V6.verify_jwt ||
      bundle.ezbr_sha256 !== HOSTED_V6.ezbr_sha256 ||
      !Array.isArray(bundle.files)) {
    throw new RealtimeV6GateError('HOSTED_V6_METADATA_MISMATCH');
  }
  const expected = Object.keys(HOSTED_V6.files);
  const actual = bundle.files.map(f => f?.name);
  if (actual.length !== expected.length ||
      new Set(actual).size !== expected.length ||
      expected.some(name => !actual.includes(name))) {
    throw new RealtimeV6GateError('HOSTED_V6_FILE_SET_MISMATCH');
  }
  for (const file of bundle.files) {
    const pinned = HOSTED_V6.files[file.name];
    if (typeof file.content !== 'string' ||
        file.content.length !== pinned.characters ||
        sha256Text(file.content) !== pinned.sha256) {
      throw new RealtimeV6GateError('HOSTED_V6_FILE_HASH_MISMATCH');
    }
  }
  const entry = bundle.files.find(file => file.name === 'realtime-call/index.ts');
  const patch = proposeWireOnlyPatch(entry.content);
  const files = bundle.files.map(file => Object.freeze({
    name: file.name,
    content: file.name === entry.name ? patch.updated : file.content,
  }));
  for (const file of files) {
    if (file.name !== entry.name &&
        file.content !== bundle.files.find(f => f.name === file.name).content) {
      throw new RealtimeV6GateError('NON_ENTRY_FILE_MUTATION');
    }
  }
  return Object.freeze({
    sourceVersion: HOSTED_V6.version,
    sourceHostedBundleHash: HOSTED_V6.ezbr_sha256,
    sourceEntrypointSha256: patch.sourceSha256,
    candidateEntrypointSha256: patch.candidateSha256,
    verify_jwt: true,
    alteredFiles: Object.freeze([entry.name]),
    files: Object.freeze(files),
    deploymentAuthorized: false,
    upstreamValidated: false,
  });
}

// Export synthetic test helpers without making the module a runnable deploy script.
export const __testOnly = Object.freeze({
  originalMultipart: ORIGINAL_MULTIPART,
  textMultipart: TEXT_MULTIPART,
});
