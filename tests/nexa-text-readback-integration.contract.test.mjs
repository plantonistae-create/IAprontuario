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

const autosave=read('nexa-encounter-autosave-v18.10.1.js');
const ack=(()=>{const a=autosave.indexOf('function stableJson'),b=autosave.indexOf('async function syncOne');
  return vm.runInNewContext(autosave.slice(a,b)+';remoteHoldsOwnWrite')})();
const sent={fields:{hda:'x',queixa_principal:'y'},protocol_usage:[{id:1}],processing_meta:{a:{b:1},saved_at:'t',encounter_autosave:{saved_at:'T1',reason:'beforeunload',radar:{n:1},state:'structured'}},consent_recorded_at:'2026-11-16T10:00:00Z',status:'draft',audit_priority:0,encounter_state:'draft'};
const remote=(over={})=>({...JSON.parse(JSON.stringify(sent)),sync_version:5,...over});

test('idempotent ack: only when remote is exactly expected+1 and EVERY sent component matches', () => {
  assert.equal(ack(remote(),sent,4),true);
  assert.equal(ack({...remote(),fields:{queixa_principal:'y',hda:'x'},processing_meta:{encounter_autosave:{state:'structured',radar:{n:1},reason:'beforeunload',saved_at:'T1'},saved_at:'t',a:{b:1}}},sent,4),true,'key order is irrelevant');
  const stamps=remote();stamps.processing_meta.encounter_autosave.saved_at='T2';stamps.processing_meta.encounter_autosave.reason='pagehide';
  assert.equal(ack(stamps,sent,4),true,'only the autosave bookkeeping stamps (saved_at, reason) may differ');
  assert.equal(ack(remote({encounter_state:'ready_for_audit'}),sent,4),true,'server trigger keeps ready_for_audit over draft');
});
test('idempotent ack: real concurrency is never masked', () => {
  const no=(r,e=4)=>assert.equal(ack(r,sent,e),false);
  no(remote({sync_version:6}));            // another writer after ours / two steps ahead
  no(remote({sync_version:4}));            // nothing was applied
  no(remote({sync_version:3}));            // behind
  no(remote(),0);                          // wrong expected -> version mismatch
  no(remote({fields:{hda:'x',queixa_principal:'OUTRO'}}));
  no(remote({fields:{hda:'x'}}));           // missing key
  no(remote({fields:{hda:'x',queixa_principal:'y',extra:'z'}})); // extra key
  no(remote({processing_meta:{a:{b:2},saved_at:'t'}}));
  no(remote({processing_meta:{}}));
  const radar=remote();radar.processing_meta.encounter_autosave.radar={n:2};no(radar);      // autosave payload other than the stamps
  const st=remote();st.processing_meta.encounter_autosave.state='draft';no(st);
  const extra=remote();extra.processing_meta.foreign=1;no(extra);
  const top=remote();top.processing_meta.saved_at='other';no(top);                          // only the nested stamps are exempt
  no(remote({protocol_usage:[]}));
  no(remote({consent_recorded_at:null}));
  no(remote({consent_recorded_at:'2026-11-16T11:00:00Z'}));
  no(remote({status:'final'}));
  no(remote({audit_priority:2}));
  no(remote({encounter_state:'audited'}));
  no(remote({encounter_state:'discarded'}));
  assert.equal(ack({...remote(),encounter_state:'draft'},{...sent,encounter_state:'ready_for_audit'},4),false,'draft never satisfies ready_for_audit');
  no(null);no(undefined);no('x');
  assert.equal(ack(remote(),null,4),false);
});
test('autosave: ack branch precedes the conflict branch and the select covers every compared column', () => {
  assert.match(autosave,/if\(remoteHoldsOwnWrite\(current,payload,expected\)\)\{data=current\}\s*else if\(current\)\{/);
  assert.match(autosave,/select\(columns\+',fields,protocol_usage,consent_recorded_at,processing_meta'\)/);
});

// Schema dependency (documented, NOT inferred about the hosted database): the
// readback endpoint and the autosave payload use columns that no versioned
// migration mentions. The hosted schema must be confirmed by the owner; until
// then both sides fail closed (endpoint 503, autosave pending, UI never verified).
test('columns used by the readback endpoint but not mentioned in any versioned migration are pinned', () => {
  const dir=new URL('../supabase/migrations/',import.meta.url);
  const sql=fs.readdirSync(dir).filter(f=>f.endsWith('.sql'));
  assert.equal(sql.length,14,'migration set changed: re-verify the column dependency below');
  const all=sql.map(f=>fs.readFileSync(new URL(f,dir),'utf8')).join('\n');
  const endpoint=read('supabase/functions/nexa-clinical-text-readback/index.ts');
  const cols=endpoint.match(/\.select\('([^']+)'\)/)[1].split(',');
  const undeclared=cols.filter(c=>!new RegExp('\\b'+c+'\\b').test(all)).sort();
  assert.deepEqual(undeclared,['consent_recorded_at','processing_meta']);
  assert.match(endpoint,/if \(error\) throw new TextReadbackError\('READBACK_UNAVAILABLE', 503\)/);
});

test('scope is explicit: processing_meta is NOT compared locally, so confirmation never claims whole-record integrity', () => {
  const {api}=load(undefined);
  assert.deepEqual([...api.compared],['fields','protocol_usage','consent_recorded_at']);
  assert.deepEqual([...api.not_compared],['processing_meta']);
  assert.match(client,/processing_meta NÃO é comparado/);
  assert.doesNotMatch(client,/p\.processing_meta|rec\.processing_meta/);
  assert.doesNotMatch(client,/integridade (clínica )?(integral|total|completa)/i);
});
