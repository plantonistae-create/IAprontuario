// Regression contract for false-positive medical review ACK in P0 runtime.
// Node-only source checks; no network, database, mocks or clinical data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const edge = read('supabase/functions/nexa-source-actions/index.ts');
const ui = read('nexa-p0-physician-source-review.js');

test('review writer response cannot become 2xx without separate readback', () => {
  const start = edge.indexOf('let receiptReadbackVerified = false;');
  const guard = edge.indexOf('if (request.params.p_kind === "review" && !receiptReadbackVerified)');
  const success = edge.indexOf('status: "SOURCE_ACTION_PERSISTED_ONLY"', start);
  assert.ok(start >= 0 && guard > start && success > guard);
  const denied = edge.slice(guard, success);
  assert.match(denied, /FINAL_REVIEW_ACK_READBACK_NOT_VERIFIED/);
  assert.match(denied, /event_state: "UNCONFIRMED"/);
  assert.match(denied, /gate_c_verified: false/);
  assert.match(denied, /\}, 409\)/);
});

test('physician UI requires positive readback before displaying ACK confirmation', () => {
  const start = ui.indexOf("if(!reviewCheck.checked)");
  const confirmed = ui.indexOf("warn('Recibo da revisão desta versão confirmado.");
  assert.ok(start >= 0 && confirmed > start);
  const section = ui.slice(start, confirmed);
  assert.match(section, /resp\.event\?\.receipt_readback_verified!==true/);
  assert.match(section, /PHYSICIAN_FINAL_REVIEW_ACK/);
});

test('ambiguous review cannot generate another gesture id during same session', () => {
  assert.match(ui, /\['consent','revoke','review'\]\.includes\(pendingAction\?\.kind\)/);
  assert.match(ui, /reviewButton\.disabled=out\.source\.final_review_server_completeness_verified!==true\|\|\s*!!pendingAction/);
  assert.match(ui, /if\(pendingAction\?\.key===actionKey\)pendingAction=null;/);
});

test('existing P0 writer hard STOP is not lifted', () => {
  assert.match(edge, /const DEPLOYED_SOURCE_ACTION_WRITER_AUTHORIZED = false;/);
  assert.match(edge, /GATE_C_NO_GO/);
});
