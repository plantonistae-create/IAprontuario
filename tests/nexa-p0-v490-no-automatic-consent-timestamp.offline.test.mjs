import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Source-only contract: never runs the browser, Deno, provider or database.
const file = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('processing cannot mint consent; existing legacy timestamp is not overwritten', () => {
  const html = file('index.html');
  const autosave = file('nexa-encounter-autosave-v18.10.1.js');
  const start = html.indexOf('async function processAudio(){');
  const end = html.indexOf("}$('processBtn').onclick=processAudio;", start);
  assert.ok(start >= 0 && end > start, 'processing boundary missing');
  const processing = html.slice(start, end);

  const carried = 'const epoch=clinicalEpoch,consentRecordedAt=lastProcessedMeta?.consentRecordedAt||null;';
  assert.equal(processing.split(carried).length - 1, 1,
    'processing must carry only an existing legacy timestamp or null');
  assert.doesNotMatch(processing, /consentRecordedAt\s*=\s*(?:new\s+Date\b|Date\.now\s*\()/,
    'processing must not synthesize consent from the current time');
  assert.match(processing, /lastProcessedMeta=\{consentRecordedAt,provider:/,
    'processing metadata contract unexpectedly changed');

  assert.match(html, /lastProcessedMeta=null;/,
    'new consultation must clear previous encounter metadata');
  assert.ok(html.includes('consent_recorded_at:lastProcessedMeta?.consentRecordedAt||null'),
    'legacy insert must not mint a timestamp');
  assert.ok(autosave.includes("consent_recorded_at:previous?.consent_recorded_at||(()=>{try{return lastProcessedMeta?.consentRecordedAt||null}catch{return null}})()"),
    'autosave must preserve an already recorded date without fabricating a new one');
  assert.ok(autosave.includes('consent_recorded_at:rec.consent_recorded_at||null'),
    'remote payload must preserve existing value or null');
});
