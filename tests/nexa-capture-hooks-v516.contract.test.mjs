import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mod = readFileSync(new URL('../nexa-capture-v516.js', import.meta.url), 'utf8');
test('capture hooks never block the clinical UI and are inert without a configured transport', () => {
  assert.match(html, /nexa-capture-v516\.js/);
  assert.match(html, /async function nexaCapture\(kind,payload,encounterId\)\{try\{/, 'helper swallows every error');
  assert.match(html, /async function nexaCaptureFields\(kind,fields\)\{try\{/);
  for (const kind of ['transcript_provisional', 'transcript_final', 'clinical_fields', 'provenance', 'radar', 'physician_edit', 'audio_ref']) assert.ok(html.includes("'" + kind + "'"), kind + ' hook present');
  // every call site is fire-and-forget (void ...) so a failure can never reject into the processing path
  const sites = html.match(/[^\n]*nexaCapture(Fields)?\('(?:transcript_provisional|clinical_fields|provenance|radar)'[^\n]*/g) || [];
  assert.ok(sites.length >= 4); for (const l of sites.filter(l => !/^async function nexaCapture/.test(l.trim()))) assert.match(l, /void nexaCapture/, l.slice(0, 80));   // the helper definitions themselves are not call sites
  assert.match(mod, /if\(!owner\|\|!UUID\.test\(String\(owner\)\)\)return false;/, 'no owner => nothing queued');
  assert.match(mod, /KINDS=\['audio_ref','transcript_provisional','transcript_final','transcript_corrected','clinical_fields','radar','physician_edit','provenance'\]/);
  assert.doesNotMatch(mod, /training_authorized\s*[:=]\s*true|trainingAuthorized\s*[:=]\s*true/);
  assert.doesNotMatch(mod, /\bfetch\(/, 'the module itself never touches the network: the transport is injected');
});
test('index.html still sends no clinical content to any capture/training/export endpoint by itself', () => {
  assert.doesNotMatch(html, /\/capture\/|core-dataset-export.*capture/);
});
