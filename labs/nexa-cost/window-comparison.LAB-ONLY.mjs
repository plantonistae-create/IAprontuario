// G4: compares DECLARED aggregates only. No raw requests, identifiers, paid calls,
// provider invoice verification, case-mix adjustment or causal savings inference.
import {reconcileAggregateCost} from './aggregate-reconciliation.mjs';
export function compareDeclaredWindows(before,after){
 const a=reconcileAggregateCost(before),b=reconcileAggregateCost(after);
 const period=x=>Date.parse(x.period.end_utc)-Date.parse(x.period.start_utc);
 const keys=x=>x.capabilities.map(c=>c.capability).sort().join('|');
 const comparable=period(before)===period(after)&&keys(before)===keys(after)&&
  before.completed_consultations>0&&after.completed_consultations>0&&
  a.totals_match_declared_invoice&&b.totals_match_declared_invoice;
 const delta=comparable?Math.round(1e6*
  (b.declared_cost_per_completed_consultation_usd-
   a.declared_cost_per_completed_consultation_usd))/1e6:null;
 return Object.freeze({
  comparison_status:comparable?'DECLARED_OBSERVATIONAL_ONLY':'NOT_COMPARABLE',
  declared_cost_per_consultation_delta_usd:delta,
  direction:delta===null?'unknown':delta>0?'higher':delta<0?'lower':'unchanged',
  verified_provider_invoice:false,verified_case_mix_adjustment:false,
  causal_savings_attributable_to_nexa_usd:null,
  approved_for_hosted_optimization:false
 });
}
