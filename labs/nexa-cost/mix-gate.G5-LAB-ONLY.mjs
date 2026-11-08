// Descriptive aggregate gate. No request logs, user/encounter IDs, model prices,
// provider invoices or causal interpretation are imported.
import {compareDeclaredWindows} from './window-comparison.LAB-ONLY.mjs';
export function auditDeclaredCostMix(before,after,{maxRelativeDrift=0.15}={}){
 if(typeof maxRelativeDrift!=='number'||!Number.isFinite(maxRelativeDrift)||
   maxRelativeDrift<0||maxRelativeDrift>1)throw Error('MIX_GATE_INVALID');
 const base=compareDeclaredWindows(before,after);
 if(base.comparison_status==='NOT_COMPARABLE')
  return Object.freeze({...base,mix_status:'NOT_ASSESSABLE',max_relative_request_mix_drift:null});
 const rowsA=new Map(before.capabilities.map(x=>[x.capability,x.request_count]));
 const rowsB=new Map(after.capabilities.map(x=>[x.capability,x.request_count]));
 let highest=0;
 for(const [k,v] of rowsA){
  const a=v/before.completed_consultations;
  const b=rowsB.get(k)/after.completed_consultations;
  if(a===0&&b!==0){highest=Infinity;continue;}
  if(a===0)continue;
  highest=Math.max(highest,Math.abs(b-a)/a);
 }
 const stable=highest<=maxRelativeDrift;
 return Object.freeze({...base,
  mix_status:stable?'REQUEST_INTENSITY_STABLE_DECLARED':'REQUEST_INTENSITY_SHIFTED',
  max_relative_request_mix_drift:Number.isFinite(highest)?Math.round(highest*1e6)/1e6:null,
  // Even stable request mix does not establish equal illness severity, case mix,
  // provider billing coverage, intervention causality, or comparable quality.
  eligible_for_causal_savings_claim:false,
  causal_savings_attributable_to_nexa_usd:null});
}
