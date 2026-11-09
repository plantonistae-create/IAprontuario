/* NEXA G62 OFFLINE ONLY — source-backed semantic register, not a full audit. */
import fs from 'node:fs';
import path from 'node:path';
import {REPO_ROOT,LOADED_RUNTIME_PINS,gitBlobSha} from './source-inventory.G61-LAB-ONLY.mjs';
export const REVIEWED_CALLSITES=Object.freeze([
  {
    "path": "nexa-admin-users-slots-functional-guard-v18.9.18.js",
    "role": "access-control",
    "marker": "nexa:audit-capabilities",
    "note": "access gating; fetch/rpc wrapping"
  },
  {
    "path": "nexa-audit-functional-guard-v18.9.16.js",
    "role": "audit-gate",
    "marker": "nexa:audit-submit-deduplicated",
    "note": "audit submit dedupe; wraps fetch"
  },
  {
    "path": "nexa-audit-supabase-compat-v18.9.16.js",
    "role": "auth-adapter",
    "marker": "window.nexaAuditSupabaseCompat18916",
    "note": "Supabase compatibility/session"
  },
  {
    "path": "nexa-audit-ui-integrity-v18.9.16.js",
    "role": "audit-ui",
    "marker": "window.nexaAuditUiIntegrity18916",
    "note": "audit DOM integrity"
  },
  {
    "path": "nexa-auditor-exact-v18.9.js",
    "role": "audit-editor",
    "marker": "function physicianFields(c)",
    "note": "reviewed fields, medication, plan, Radar"
  },
  {
    "path": "nexa-auditor-panel-queue-v18.9.2.js",
    "role": "audit-ui",
    "marker": "window.nexaAuditorLoadQueue192",
    "note": "audit queue/reviewer pane"
  },
  {
    "path": "nexa-auth-session-v1.js",
    "role": "auth-session",
    "marker": "window.nexaAuthSession",
    "note": "persistent vs ephemeral auth session"
  },
  {
    "path": "nexa-conduct-state-guard-v18.9.13.js",
    "role": "clinical-writer",
    "marker": "nexa:conduct-restored-after-error",
    "note": "conduct textarea restoration after failure"
  },
  {
    "path": "nexa-core-audit-learning-v2.js",
    "role": "audit-editor",
    "marker": "area.dataset.field=name",
    "note": "editable audit learning fields"
  },
  {
    "path": "nexa-destination-advisory-guard-v18.9.14.js",
    "role": "clinical-ui",
    "marker": "window.nexaDestinationAdvisoryGuard18914",
    "note": "destination advisory visibility"
  },
  {
    "path": "nexa-encounter-conflicts-v18.10.2.js",
    "role": "clinical-writer",
    "marker": "reconcileFields(",
    "note": "field-by-field conflict reconciliation"
  },
  {
    "path": "nexa-final-ui-v18.js",
    "role": "workflow-ui",
    "marker": "const CLINICAL_STAGES=['radar','summary','hypothesis','plan'];",
    "note": "clinical stage navigation and consent/recorder DOM"
  },
  {
    "path": "nexa-history-recovery-v1.js",
    "role": "clinical-recovery",
    "marker": "window.nexaRecoverSavedEncounter",
    "note": "recovery of previous clinical draft"
  },
  {
    "path": "nexa-history-style-audit-v18.9.7.js",
    "role": "clinical-writer",
    "marker": "function persistCase(fields)",
    "note": "history/audit submission/reopen and local persistence"
  },
  {
    "path": "nexa-hotfix-v1.js",
    "role": "workflow-ui",
    "marker": "nexa-top-consent",
    "note": "consent/reset control relocation"
  },
  {
    "path": "nexa-layout-static-v18.6.5.js",
    "role": "presentation",
    "marker": "appliesTo:['radar'",
    "note": "responsive clinical stage styles"
  },
  {
    "path": "nexa-medical-layout-state-v18.9.3.js",
    "role": "presentation",
    "marker": "window.nexaReturnToMedicalModeStable",
    "note": "medical layout transition"
  },
  {
    "path": "nexa-mobile-flow-v18.8.1.js",
    "role": "presentation",
    "marker": "window.nexaRepairMobileFlow",
    "note": "mobile flow repair"
  },
  {
    "path": "nexa-mobile-shell-v18.6.7.js",
    "role": "workflow-ui",
    "marker": "const stages=['radar','summary','hypothesis','plan','history'];",
    "note": "mobile clinical stage/theme navigation"
  },
  {
    "path": "nexa-password-onboarding-v1.js",
    "role": "auth-session",
    "marker": "window.nexaPasswordSetup",
    "note": "password onboarding and auth session"
  },
  {
    "path": "nexa-protocol-functional-guard-v18.9.17.js",
    "role": "access-control",
    "marker": "window.nexaProtocolFunctionalGuard18917",
    "note": "protocol action guards"
  },
  {
    "path": "nexa-protocol-library-v18.10.1.js",
    "role": "clinical-writer",
    "marker": "window.nexaInsertProtocolPrescription18101",
    "note": "insertion of protocol prescriptions"
  },
  {
    "path": "nexa-radar-dynamic-focus-v18.16.js",
    "role": "radar-view",
    "marker": "window.nexaRadarDynamicFocus18160",
    "note": "focused Radar rendering"
  },
  {
    "path": "nexa-radar-ps-mode-v18.14.js",
    "role": "radar-view",
    "marker": "window.nexaRadarPsMode18131",
    "note": "Radar presentation/selection"
  },
  {
    "path": "nexa-radar-stable-state-v18.9.4.js",
    "role": "radar-view",
    "marker": "window.nexaRadarStableRefresh194",
    "note": "Radar answered-state view"
  },
  {
    "path": "nexa-radar-visual-flow-v18.13.js",
    "role": "radar-view",
    "marker": "window.nexaRadarVisualFlow18130",
    "note": "Radar events and clinical stage coordination"
  },
  {
    "path": "nexa-record-draft-history-v18.6.6.js",
    "role": "clinical-reader",
    "marker": "window.nexaRefreshDraftHistory",
    "note": "reads fields from DOM and refreshes history"
  },
  {
    "path": "nexa-recorder-layout-v18.12.4.js",
    "role": "workflow-ui",
    "marker": "nexaUnifiedConsent",
    "note": "recorder/consent DOM relocation"
  },
  {
    "path": "nexa-recording-timer-state-v18.9.8.js",
    "role": "workflow-ui",
    "marker": "nexa:consultation-reset",
    "note": "recording timer reset"
  },
  {
    "path": "nexa-sic-documentation-rule-v18.9.8.js",
    "role": "clinical-writer",
    "marker": "window.nexaNormalizeSic198",
    "note": "normalizes narrative documentation"
  },
  {
    "path": "nexa-summary-state-guard-v18.9.10.js",
    "role": "clinical-writer",
    "marker": "nexa:summary-restored-after-error",
    "note": "restores summary fields after failure"
  },
  {
    "path": "nexa-ui-v3.js",
    "role": "workflow-ui",
    "marker": "nexaResetV3",
    "note": "reset UI and Radar/plan layout"
  }
]);
const stop=(code,details={})=>Object.freeze({status:'STOP',code,...details,resetAuthorized:false});
export function assessRuntimeSemantics({root=REPO_ROOT,overrides={}}={}){
  try {
    const recorded=REVIEWED_CALLSITES.map(x=>x.path);
    const expected=Object.keys(LOADED_RUNTIME_PINS).sort();
    if(JSON.stringify([...recorded].sort())!==JSON.stringify(expected))
      return stop('RUNTIME_MODULE_REGISTER_INCOMPLETE');
    const roleCounts={};
    for(const entry of REVIEWED_CALLSITES){
      if(typeof entry.marker!=='string'||entry.marker.length<8||
         typeof entry.note!=='string'||entry.note.length<8)
        return stop('SEMANTIC_EVIDENCE_MISSING',{source:entry.path});
      const text=Object.hasOwn(overrides,entry.path)?overrides[entry.path]:
        fs.readFileSync(path.join(root,entry.path),'utf8');
      if(typeof text!=='string'||gitBlobSha(text)!==LOADED_RUNTIME_PINS[entry.path][0])
        return stop('RUNTIME_SOURCE_DRIFT',{source:entry.path});
      if(!text.includes(entry.marker))
        return stop('SEMANTIC_MARKER_MISSING',{source:entry.path});
      roleCounts[entry.role]=(roleCounts[entry.role]||0)+1;
    }
    return Object.freeze({
      status:'BLOCKED',code:'SEMANTIC_CALLSITES_MAPPED_NOT_EXHAUSTIVELY_PROVEN',
      reviewedModuleCount:REVIEWED_CALLSITES.length,roleCounts,
      clinicalWriters:REVIEWED_CALLSITES.filter(x=>x.role==='clinical-writer').map(x=>x.path),
      partialReview:true,completeDataFlowProof:false,
      dynamicRuntimeInputsUnbounded:true,resetAuthorized:false
    });
  }catch(e){return stop('RUNTIME_SEMANTICS_UNAVAILABLE',{reason:String(e?.message||e)})}
}
