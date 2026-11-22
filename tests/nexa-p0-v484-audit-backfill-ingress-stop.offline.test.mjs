import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Synthetic source-contract only: never imports the Edge function, Deno, Supabase
// or any provider. No browser, network, clinical data, SQL or database required.
test('historical audit backfill is stopped before administrative read and AI egress', () => {
  const source = readFileSync(
    new URL('../supabase/functions/audit-backfill/index.ts', import.meta.url), 'utf8');
  const entry = 'serve(async req=>{';
  assert.equal(source.split(entry).length - 1, 1, 'single HTTP entrypoint required');
  const handler = source.slice(source.indexOf(entry));

  const options = "if(req.method==='OPTIONS')return new Response('ok',{headers:cors});";
  const method = "if(req.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);";
  const constant = 'const auditBackfillGateCNoGo=true;';
  const stopped = "if(auditBackfillGateCNoGo)return json({error:'AUDIT_BACKFILL_GATE_C_NO_GO',audit_backfilled:false,external_ai_authorized:false},423);";
  const markers = [options, method, constant, stopped, '\n try{',
    'await requireStaff(req)', 'createClient(URL,SERVICE', 'await inventory(admin)',
    'await deidentify(', ".from('audit_cases').insert({"];
  const offsets = markers.map(marker => {
    assert.equal(handler.split(marker).length - 1, 1, 'unique expected boundary: ' + marker);
    return handler.indexOf(marker);
  });
  for(let i=1;i<offsets.length;i++){
    assert.ok(offsets[i]>offsets[i-1], 'incorrect boundary order: ' + markers[i]);
  }

  // Before the gate, only request-method routing and the literal STOP are
  // permitted; no caller, role or environment-controlled bypass is accepted.
  const preStop = handler.slice(0, offsets[3]);
  assert.doesNotMatch(preStop, /requireStaff\s*\(|createClient\s*\(|inventory\s*\(|deidentify\s*\(|executeCapability\s*\(|\.insert\s*\(|fetch\s*\(/);
  assert.match(handler, /audit_backfilled:false,external_ai_authorized:false\},423\)/);
});
