import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Static, synthetic-only contract. This checks legacy writer source, not
// clinical consent or server authority; never imports the browser runtime.
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const count = (source, token) => source.split(token).length - 1;

test('legacy consultation inserts preserve known timestamp or null without inventing now', () => {
  const html = read('index.html');
  const legacy = read('nexa-history-style-audit-v18.9.7.js');
  const htmlStart = html.indexOf('async function saveHistory(){');
  const htmlEnd = html.indexOf("$('updateHistoryBtn').onclick=saveHistory;", htmlStart);
  const historyStart = legacy.indexOf('async function persistCase(fields){');
  const historyEnd = legacy.indexOf('function coreContext(fields){', historyStart);
  assert.ok(htmlStart >= 0 && htmlEnd > htmlStart, 'native writer boundary missing');
  assert.ok(historyStart >= 0 && historyEnd > historyStart, 'history writer boundary missing');
  const nativeWriter = html.slice(htmlStart, htmlEnd);
  const historyWriter = legacy.slice(historyStart, historyEnd);
  const nativeConsent = 'consent_recorded_at:lastProcessedMeta?.consentRecordedAt||null';
  const historyConsent = 'consent_recorded_at:meta?.consentRecordedAt||null';

  assert.equal(count(nativeWriter, nativeConsent), 1, 'native insert must retain known metadata or null');
  assert.equal(count(historyWriter, historyConsent), 1, 'history insert must retain known metadata or null');
  assert.equal(count(nativeWriter, 'consent_recorded_at:lastProcessedMeta?.consentRecordedAt||now'), 0);
  assert.equal(count(historyWriter, 'consent_recorded_at:meta?.consentRecordedAt||now'), 0);

  // Updating an existing encounter must not clear an already-stored date.
  assert.ok(nativeWriter.includes("update({fields,updated_at:now,status:'draft',processing_meta:lastProcessedMeta||{}})"),
    'native update unexpectedly changed its consent-preserving payload');
  assert.ok(historyWriter.includes("update({fields,updated_at:now,status:'draft',processing_meta:meta})"),
    'history update unexpectedly changed its consent-preserving payload');

  // Legacy metadata is only a timestamp, never purpose-specific consent
  // evidence or a medical ACK for external AI/audit.
  assert.equal(count(nativeWriter, 'external_ai_authorized:true'), 0);
  assert.equal(count(historyWriter, 'external_ai_authorized:true'), 0);
});
