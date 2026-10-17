import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(([,attrs,body])=>!attrs.includes("src=") && body.trim());
assert.ok(scripts.length >= 3,"Expected NEXA inline runtime scripts");
for(let index=0;index<scripts.length;index++){
  new vm.Script(scripts[index][2],{filename:"index.html:inline-script-"+(index+1)});
}
console.log("NEXA inline scripts syntax: PASS");
