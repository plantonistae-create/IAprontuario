import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// Static guard for Sprint 8 / D1. The real behaviour is proven in the browser by
// tests/nexa-recorder-session.e2e.cjs; this only prevents the dead wrapper (and the
// false-PASS VM test that exercised it) from coming back.
const hot=fs.readFileSync(new URL('../nexa-hotfix-v1.js',import.meta.url),'utf8');
const idx=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('hotfix-v1 does not patch recorder internals it cannot reach',()=>{
  assert.doesNotMatch(hot,/installRecorderRecovery|recoveredStart|releaseStaleRecorder|snapshotHeldAudio|restoreHeldAudio/);
  assert.doesNotMatch(hot,/\b(startRec|audioBlob|chunks|mediaRecorder)\s*=[^=]/);
});
test('index.html does not leak recorder state to the global scope',()=>{
  assert.doesNotMatch(idx,/window\.(startRec|stopRec|audioBlob|chunks|mediaRecorder)\s*=/);
  assert.doesNotMatch(idx,/defineProperty\(window,'(startRec|audioBlob|chunks|mediaRecorder|recording)'/);
});
test('index.html recovers from a MediaRecorder error via the normal stop path',()=>{
  assert.match(idx,/mediaRecorder\.onerror=\(\)=>\{\s*if\(!recording\)return;[\s\S]{0,400}stopRec\(\);/);
});
test('hotfix-v1 cache key was bumped with the change',()=>{
  const loader=fs.readFileSync(new URL('../nexa-hotfix.js',import.meta.url),'utf8');
  assert.match(loader,/nexa-hotfix-v1\.js\?v=20261116-d1-no-dead-recovery/);
});
