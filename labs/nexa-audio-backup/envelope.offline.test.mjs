import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {createEnvelopeCodec} from './envelope.NOT-DEPLOYED.mjs';
const scope={ownerId:'11111111-1111-4111-8111-111111111111',encounterId:'22222222-2222-4222-8222-222222222222',sessionId:'33333333-3333-4333-8333-333333333333',sequence:0,sourceVersion:1};
function fixture(){
 const kek=randomBytes(32);let revoked=false;
 const custody={async wrap({aad,key}){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',kek,iv);c.setAAD(Buffer.from(aad));const blob=Buffer.concat([iv,c.update(key),c.final(),c.getAuthTag()]);return {keyId:'synthetic-key',blob:blob.toString('base64')};},async unwrap({aad,wrapped}){if(revoked||wrapped.keyId!=='synthetic-key')throw Error('KEY_UNAVAILABLE');const b=Buffer.from(wrapped.blob,'base64'),d=createDecipheriv('aes-256-gcm',kek,b.subarray(0,12));d.setAAD(Buffer.from(aad));d.setAuthTag(b.subarray(-16));return Buffer.concat([d.update(b.subarray(12,-16)),d.final()]);}};
 return {custody,revoke:()=>{revoked=true}};
}
test('envelope readback in a second codec instance without the first local key',async()=>{const {custody}=fixture(),a=createEnvelopeCodec({custody}),b=createEnvelopeCodec({custody});const bytes=Buffer.from('SYNTHETIC_AUDIO');const r=await a.seal(scope,bytes);assert.deepEqual(await b.open(scope,JSON.parse(JSON.stringify(r))),bytes);assert.notEqual(r.ciphertext,bytes.toString('base64'));});
test('wrong owner, encounter, session, sequence or revision cannot decrypt',async()=>{const {custody}=fixture(),c=createEnvelopeCodec({custody}),r=await c.seal(scope,Buffer.from('FAKE'));for(const s of [{...scope,ownerId:'44444444-4444-4444-8444-444444444444'},{...scope,encounterId:scope.ownerId},{...scope,sessionId:scope.ownerId},{...scope,sequence:1},{...scope,sourceVersion:2}])await assert.rejects(c.open(s,r));});
test('tampering and missing custody fail closed',async()=>{const {custody,revoke}=fixture(),c=createEnvelopeCodec({custody}),r=await c.seal(scope,Buffer.from('FAKE'));await assert.rejects(c.open(scope,{...r,sha256:'0'.repeat(64)}),/BACKUP_READBACK_MISMATCH/);await assert.rejects(c.open(scope,{...r,ciphertext:Buffer.alloc(4).toString('base64')}));revoke();await assert.rejects(c.open(scope,r),/KEY_UNAVAILABLE/);});
test('invalid input is refused before key custody',async()=>{const c=createEnvelopeCodec({custody:{wrap(){throw Error('unexpected')},unwrap(){throw Error('unexpected')}}});await assert.rejects(c.seal(scope,Buffer.alloc(0)),/INVALID_CHUNK/);await assert.rejects(c.seal({...scope,sequence:-1},Buffer.from('FAKE')),/INVALID_BACKUP_SCOPE/);});
