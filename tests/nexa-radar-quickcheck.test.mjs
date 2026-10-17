import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import E from "../nexa-radar-engine.js";

test("PS Radar exposes quick disposition without making up clinical negation",()=>{
  const ui=fs.readFileSync(new URL("../nexa-radar-ps-mode-v18.14.js",import.meta.url),"utf8");
  assert.match(ui,/nexaRadarPsEvaluated18131/);
  assert.match(ui,/nexaRadarPsDismiss18131/);
  assert.match(ui,/radar\.respond\(item\.id,value,action\)/);
  assert.match(ui,/ponto de segurança clínica/);
  const context={fields:{hda:"Dor torácica."}};
  const item=E.analyze(context).items.find(x=>x.id==="dyspnea");
  assert.ok(item);
  const {ledger,context:updated}=E.answer(context,{},item,"Já avaliado pelo médico","evaluated");
  assert.deepEqual(updated.fields,context.fields);
  assert.equal(ledger.dyspnea.action,"evaluated");
  assert.ok(E.analyze(updated,ledger).unresolvedSafety.includes("dyspnea"));
});
