import test from 'node:test';
import assert from 'node:assert/strict';
import { assessClinicalAudio } from '../labs/nexa-s64/audio-preservation-policy.LAB-ONLY.mjs';
const cases=[
  [
    "complete local",
    {
      "scope": {
        "ownerId": "11111111-1111-4111-8111-111111111111",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 1
      },
      "local": {
        "ownerId": "11111111-1111-4111-8111-111111111111",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 1,
        "encrypted": true,
        "integrityVerified": true,
        "finalized": true,
        "partial": false,
        "manifestDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    },
    "local_verified"
  ],
  [
    "partial local",
    {
      "scope": {
        "ownerId": "11111111-1111-4111-8111-111111111111",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 1
      },
      "local": {
        "ownerId": "11111111-1111-4111-8111-111111111111",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 1,
        "encrypted": true,
        "integrityVerified": true,
        "finalized": true,
        "partial": true,
        "manifestDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    },
    "local_partial"
  ],
  [
    "remote confirmed",
    {
      "scope": {
        "ownerId": "11111111-1111-4111-8111-111111111111",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 1
      },
      "local": {
        "ownerId": "11111111-1111-4111-8111-111111111111",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 1,
        "encrypted": true,
        "integrityVerified": true,
        "finalized": true,
        "partial": false,
        "manifestDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      "remote": {
        "ownerId": "11111111-1111-4111-8111-111111111111",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 1,
        "readbackVerified": true,
        "manifestDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    },
    "remote_verified"
  ],
  [
    "mismatched manifest",
    {
      "scope": {
        "ownerId": "11111111-1111-4111-8111-111111111111",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 1
      },
      "local": {
        "ownerId": "11111111-1111-4111-8111-111111111111",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 1,
        "encrypted": true,
        "integrityVerified": true,
        "finalized": true,
        "partial": false,
        "manifestDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      "remote": {
        "ownerId": "11111111-1111-4111-8111-111111111111",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 1,
        "readbackVerified": true,
        "manifestDigest": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      }
    },
    "local_verified"
  ],
  [
    "wrong owner",
    {
      "scope": {
        "ownerId": "11111111-1111-4111-8111-111111111111",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 1
      },
      "local": {
        "ownerId": "11111111-1111-4111-8111-111111111111",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 1,
        "encrypted": true,
        "integrityVerified": true,
        "finalized": true,
        "partial": false,
        "manifestDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      "remote": {
        "ownerId": "22222222-2222-4222-8222-222222222222",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 1,
        "readbackVerified": true,
        "manifestDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    },
    "local_verified"
  ],
  [
    "wrong revision",
    {
      "scope": {
        "ownerId": "11111111-1111-4111-8111-111111111111",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 1
      },
      "local": {
        "ownerId": "11111111-1111-4111-8111-111111111111",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 1,
        "encrypted": true,
        "integrityVerified": true,
        "finalized": true,
        "partial": false,
        "manifestDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      "remote": {
        "ownerId": "11111111-1111-4111-8111-111111111111",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 2,
        "readbackVerified": true,
        "manifestDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    },
    "local_verified"
  ],
  [
    "unverified readback",
    {
      "scope": {
        "ownerId": "11111111-1111-4111-8111-111111111111",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 1
      },
      "local": {
        "ownerId": "11111111-1111-4111-8111-111111111111",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 1,
        "encrypted": true,
        "integrityVerified": true,
        "finalized": true,
        "partial": false,
        "manifestDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      "remote": {
        "ownerId": "11111111-1111-4111-8111-111111111111",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 1,
        "readbackVerified": false,
        "manifestDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    },
    "local_verified"
  ],
  [
    "remote alone",
    {
      "scope": {
        "ownerId": "11111111-1111-4111-8111-111111111111",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 1
      },
      "remote": {
        "ownerId": "11111111-1111-4111-8111-111111111111",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 1,
        "readbackVerified": true,
        "manifestDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    },
    "unverified"
  ],
  [
    "no scope",
    {
      "local": {
        "ownerId": "11111111-1111-4111-8111-111111111111",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 1,
        "encrypted": true,
        "integrityVerified": true,
        "finalized": true,
        "partial": false,
        "manifestDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      "remote": {
        "ownerId": "11111111-1111-4111-8111-111111111111",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 1,
        "readbackVerified": true,
        "manifestDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    },
    "invalid_scope"
  ],
  [
    "partial remote cannot claim complete",
    {
      "scope": {
        "ownerId": "11111111-1111-4111-8111-111111111111",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 1
      },
      "local": {
        "ownerId": "11111111-1111-4111-8111-111111111111",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 1,
        "encrypted": true,
        "integrityVerified": true,
        "finalized": true,
        "partial": true,
        "manifestDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      "remote": {
        "ownerId": "11111111-1111-4111-8111-111111111111",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 1,
        "readbackVerified": true,
        "manifestDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    },
    "local_partial"
  ],
  [
    "fake rights cannot authorize",
    {
      "scope": {
        "ownerId": "11111111-1111-4111-8111-111111111111",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 1
      },
      "local": {
        "ownerId": "11111111-1111-4111-8111-111111111111",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 1,
        "encrypted": true,
        "integrityVerified": true,
        "finalized": true,
        "partial": false,
        "manifestDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      "remote": {
        "ownerId": "11111111-1111-4111-8111-111111111111",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 1,
        "readbackVerified": true,
        "manifestDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      "rights": {
        "training": true,
        "export": true,
        "purge": true
      }
    },
    "remote_verified"
  ],
  [
    "unverified local bytes",
    {
      "scope": {
        "ownerId": "11111111-1111-4111-8111-111111111111",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 1
      },
      "local": {
        "ownerId": "11111111-1111-4111-8111-111111111111",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 1,
        "encrypted": true,
        "integrityVerified": false,
        "finalized": true,
        "partial": false,
        "manifestDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      "remote": {
        "ownerId": "11111111-1111-4111-8111-111111111111",
        "encounterId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "sourceVersion": 1,
        "readbackVerified": true,
        "manifestDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    },
    "unverified"
  ]
];
for(const [name,input,want] of cases)test(name,()=>{const r=assessClinicalAudio(input);assert.equal(r.status,want);assert.equal(r.trainingAuthorized,false);assert.equal(r.exportAuthorized,false);assert.equal(r.purgeAuthorized,false)});
