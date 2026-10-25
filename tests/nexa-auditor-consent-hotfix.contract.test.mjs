import fs from 'node:fs';
import assert from 'node:assert/strict';

const continuous=fs.readFileSync(new URL('../nexa-continuous-soap-v18.11.js',import.meta.url),'utf8');
const auditor=fs.readFileSync(new URL('../nexa-auditor-exact-v18.9.js',import.meta.url),'utf8');
const loader=fs.readFileSync(new URL('../nexa-hotfix.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

assert.ok(continuous.includes("nativeConsent=$('consent')"),'Unified flow must use the existing native consent checkbox');
assert.ok(continuous.includes("consentHost.prepend(nativeConsent)"),'Native consent must be moved into the visible unified recorder');
assert.ok(continuous.includes('#nexaUnifiedConsent'),'Unified recorder must expose a visible consent host');
assert.ok(!continuous.includes('type="checkbox" id="nexaUnifiedConsent"'),'Hotfix must not create a second consent state');

assert.ok(auditor.includes("'nexaRoleSwitchBtn','nexaDesktopRoleSwitch'"),'Doctor→Auditor role switches must be intercepted by the professional workspace');
assert.ok(auditor.includes('id="axBackMedical192"'),'Professional Auditor workspace must expose an explicit return-to-doctor control');
assert.ok(auditor.includes("document.body.classList.contains('nexa-auditor-view')&&privileged()"),'Legacy restored auditor preference must be promoted to the professional workspace');
assert.ok(auditor.includes("$('nexaBackMedicalBtn')"),'Return-to-doctor must reuse the existing medical role transition');

assert.match(loader,/nexa-auditor-exact-v18\.9\.js\?v=\d{8}-[a-z0-9-]+/,'Auditor module must include a dated cache-busting token');
assert.ok(loader.includes('nexa-continuous-soap-v18.11.js?v=20261019-conduct-library-first'),'Continuous/SOAP module cache bust must be current');
const swHotfix=sw.match(/nexa-hotfix\.js\?v=([a-z0-9-]+)/)?.[1];
const indexHotfix=index.match(/nexa-hotfix\.js\?v=([a-z0-9-]+)/)?.[1];
assert.ok(swHotfix&&indexHotfix&&swHotfix===indexHotfix,'SW and HTML hotfix versions must match');
assert.match(sw,/const CACHE_NAME="nexa-v18-15-[01]-[^"]+"/,'Service Worker must advertise a versioned cache');
assert.ok(loader.includes('nexa-recorder-layout-v18.12.4.js?v=20260928-v18124'),'Recorder layout hotfix must load after the clinical modules');

new Function(continuous);
new Function(auditor);
console.log('NEXA v18.15.0 Auditor + consent + SOAP selector regression contract: PASS');

const cidStart=auditor.indexOf('function normalizeCid(');
const cidEnd=auditor.indexOf('function activeNav(',cidStart);
assert.ok(cidStart>0&&cidEnd>cidStart,'CID grouping helper must exist in auditor');
const cidCounts=new Function('rows','statusClass',auditor.slice(cidStart,cidEnd)+'\nreturn cidStats();');
const syntheticCases=[
 {status:'approved',deidentified_fields:{cid:'A09 — gastroenterite'}},
 {status:'approved',deidentified_fields:{hipotese_diagnostica:'CID-10: A09; gastroenterite'}},
 {status:'approved',deidentified_core_context:{learning_layers:{physician_final:{fields:{cid_medico_final:'J06.9 – infecção aguda'}}}}},
 {status:'corrected',reviewed_fields:{cid_medico_final:'j069 – IVAS'},deidentified_fields:{cid:'B34.9'}},
 {status:'approved',deidentified_fields:{cid:'B34.9 – virose'}},
 {status:'corrected',reviewed_fields:{cid:'B349 – virose'},deidentified_fields:{cid:'J06.9'}},
 {status:'discarded',deidentified_fields:{cid:'R05'}},
 {status:'pending',deidentified_fields:{cid:'R51'}}
];
assert.deepEqual(cidCounts(syntheticCases,s=>s),[['A09',2],['B34.9',2],['J06.9',2]],'Six audited cases must normalize coded descriptions, compact codes and edited fields');
