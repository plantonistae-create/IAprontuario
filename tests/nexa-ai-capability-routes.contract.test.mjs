import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routes = [
  {
    path: "supabase/functions/process-consultation/index.ts",
    capability: "consultation.processing",
    contract: [/Deno\.serve/, /fd\.get\(\s*"audio"/, /style_source/, /style_example_count/],
  },
  {
    path: "supabase/functions/realtime-call/index.ts",
    capability: "realtime.call",
    contract: [/Deno\.serve/, /REALTIME_SESSION_FAILED/, /FALLBACK_TRANSCRIPTION_FAILED/, /official_transcript/],
  },
  {
    path: "supabase/functions/realtime-radar/index.ts",
    capability: "realtime.radar",
    contract: [/Deno\.serve/, /items,observations,model/, /official_record:false/, /RADAR_AI_FAILED/],
  },
  {
    path: "supabase/functions/submit-audit-case/index.ts",
    capability: "audit.submit",
    contract: [/serve\(async/, /audit_cases/, /ALREADY_SUBMITTED/, /core_ready_after_review/],
  },
  {
    path: "supabase/functions/audit-backfill/index.ts",
    capability: "audit.backfill",
    contract: [/serve\(async/, /action==='report'/, /action!=='run'/, /remaining_recoverable/],
  },
];

test("all migrated routes use the central capability layer without changing endpoint shells", async () => {
  for (const route of routes) {
    const source = await readFile(route.path, "utf8");
    assert.match(source, /_shared\/nexa-ai-capability\.mjs/, `${route.path} must import central capability layer`);
    assert.match(source, /executeCapability\s*\(/, `${route.path} must execute through central layer`);
    assert.ok(source.includes(`capability: "${route.capability}"`) || source.includes(`capability:'${route.capability}'`), `${route.path} must bind ${route.capability}`);
    for (const pattern of route.contract) {
      assert.match(source, pattern, `${route.path} lost an existing endpoint contract marker: ${pattern}`);
    }
  }
});

test("only Radar advertises the NEXA Core adapter; other capabilities remain unported", async () => {
  const registry = await readFile("supabase/functions/_shared/nexa-ai-capability.mjs","utf8");
  const realtimeRadar = await readFile("supabase/functions/realtime-radar/index.ts","utf8");
  assert.match(registry, /"nexa-core": Object\.freeze/);
  assert.match(realtimeRadar, /requestCoreRadar\(/);
  assert.match(realtimeRadar, /if\(radarProvider==='nexa-core'\)/);
  assert.match(registry,/UNSUPPORTED_PROVIDER/);
  const consultation=registry.split('"consultation.processing"')[1].split('"realtime.call"')[0];
  assert.equal(consultation.includes('"nexa-core"'),false);
});

test("observability schema contains no clinical payload fields", async () => {
  const registry = await readFile("supabase/functions/_shared/nexa-ai-capability.mjs", "utf8");
  const metadataBlock = registry.slice(registry.indexOf("function buildMetadata"), registry.indexOf("export async function executeCapability"));
  for (const forbidden of ["audio", "transcript", "prompt", "clinical_context", "fields", "core_context"]) {
    assert.equal(metadataBlock.includes(forbidden), false, `technical metadata must not include ${forbidden}`);
  }
});
