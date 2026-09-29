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

assert.ok(loader.includes('nexa-auditor-exact-v18.9.js?v=20260928-v18123'),'Auditor module cache bust must be current');
assert.ok(loader.includes('nexa-continuous-soap-v18.11.js?v=20260929-v18128'),'Continuous/SOAP module cache bust must be current');
assert.ok(sw.includes('nexa-v18-13-1-radar-flow-20260929'),'Service Worker cache must identify the current Radar-flow build');
assert.ok(index.includes('nexa-hotfix.js?v=20260929-v18131'),'HTML must load the current v18.13.1 hotfix loader');
assert.ok(loader.includes('nexa-recorder-layout-v18.12.4.js?v=20260928-v18124'),'Recorder layout hotfix must load after the clinical modules');

new Function(continuous);
new Function(auditor);
console.log('NEXA v18.13.1 Auditor + consent + SOAP selector regression contract: PASS');
