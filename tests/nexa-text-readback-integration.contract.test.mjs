import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {canonicalJson as serverCanonical} from '../supabase/functions/_shared/nexa-clinical-text-readback.mjs';

const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
const client=read('nexa-text-readback-v1.js');

function load(flag){
  const listeners={};
  const window={addEventListener:(n,f)=>{listeners[n]=f},__NEXA_TEXT_READBACK__:flag};
  const ctx={window,document:{getElementById:()=>null},crypto:globalThis.crypto,TextEncoder,console};
  vm.runInNewContext(client,ctx);
  return {api:window.nexaTextReadback,listeners};
}

test('client canonical JSON is byte-identical to the server contract', () => {
  const {api}=load(undefined);
  for(const v of [{b:1,a:{z:'á',y:[3,{k:null}]}},{texto:'Atendimento fictício "aspas" \n quebra'},[1,'2',true,null],{},{a:{}}])
    assert.equal(api.canonicalJson(v),serverCanonical(v));
  assert.throws(()=>api.canonicalJson({a:undefined,b:()=>1}));
});

test('feature is inert unless the explicit synthetic flag object is set; nothing in the shipped pages sets it', () => {
  assert.equal(/__NEXA_TEXT_READBACK__\s*=/.test(read('index.html')),false);
  assert.equal(/__NEXA_TEXT_READBACK__\s*=/.test(read('nexa-hotfix.js')),false);
  assert.equal(/__NEXA_TEXT_READBACK__\s*=/.test(client),false);
  assert.match(client,/enabled===true&&c\.mode==='synthetic-review-v1'/);
  return Promise.all([undefined,{},{enabled:true},{enabled:'true',mode:'synthetic-review-v1'},{enabled:true,mode:'prod'}].map(bad=>
    load(bad).api.verify('33333333-3333-4333-8333-333333333333').then(r=>assert.equal(r.state,'disabled'))));
});

test('request carries only encounter id and expected version; response scope is text-only', () => {
  assert.match(client,/body:\{encounter_id:id,expected_sync_version:version\}/);
  assert.doesNotMatch(client,/service_role|SUPABASE_SERVICE|localStorage|sessionStorage|indexedDB|\.from\('|fetch\(/);
  assert.match(client,/d\.durable_archive!==false\|\|d\.audio_included!==false/);
  const endpoint=read('supabase/functions/nexa-clinical-text-readback/index.ts');
  assert.match(endpoint,/NEXA_TEXT_READBACK_ENABLED/);
});

test('success is declared only after hash recomputation, field/usage/consent equality and an unchanged local note', () => {
  for(const re of [/recomputed!==d\.canonical_sha256/,/localFields!==remoteFields/,/localUse!==remoteUse/,/consent_recorded_at\|\|null/,/LOCAL_CHANGED/,/p\.sync_version!==version/])
    assert.match(client,re);
  const i=client.indexOf("render('verified'");
  assert.ok(i>client.indexOf('LOCAL_CHANGED'),'verified must be the last step');
  assert.equal((client.match(/render\('verified'/g)||[]).length,1);
});

test('loader registers the client and the legacy blind writer no longer exists', () => {
  assert.match(read('nexa-hotfix.js'),/nexa-text-readback-v1\.js\?v=/);
  const ui=read('nexa-ui-v3.js');
  assert.doesNotMatch(ui,/from\('consultation_history'\)\.update\(\{processing_meta/);
  assert.match(ui,/preserve\('audit_capture'\)/);
});

test('autosave treats an unload-lost acknowledgement as idempotent only when content is identical', () => {
  const a=read('nexa-encounter-autosave-v18.10.1.js');
  assert.match(a,/function remoteHoldsOwnWrite\(remote,payload,expected\)/);
  assert.match(a,/Number\(remote\.sync_version\)>expected/);
  assert.match(a,/stableJson\(remote\.fields\|\|\{\}\)===stableJson\(payload\.fields\|\|\{\}\)/);
  assert.match(a,/if\(remoteHoldsOwnWrite\(current,payload,expected\)\)\{data=current\}\s*else if\(current\)\{/);
});
