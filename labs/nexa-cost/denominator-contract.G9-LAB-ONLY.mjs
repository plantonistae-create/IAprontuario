// G9 aggregates only. No PHI, provider key, raw request IDs, or paid calls.
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const fields=['classified_attempts','completed_consultations','declared_cost_usd',
 'started_consultations','total_attempts','unknown_attempts','window'];
function validated(x,window){
 if(!plain(x)||Object.keys(x).sort().join('|')!==fields.slice().sort().join('|')||
   x.window!==window||!['total_attempts','classified_attempts','unknown_attempts',
    'started_consultations','completed_consultations'].every(k=>
      Number.isSafeInteger(x[k])&&x[k]>=0)||
    x.classified_attempts+x.unknown_attempts!==x.total_attempts||
    x.completed_consultations>x.started_consultations||
    typeof x.declared_cost_usd!=='number'||!Number.isFinite(x.declared_cost_usd)||
    x.declared_cost_usd<0)throw Error('G9_DENOMINATOR_CONTRACT_INVALID');
 return x;
}
const rate=(num,den)=>den===0?null:Math.round((num/den)*1e6)/1e6;
export function evaluateDeclaredDenominators(before,after){
 const a=validated(before,'before'),b=validated(after,'after');
 return Object.freeze({
  schema_version:'nexa-g9-denominators-offline-v1',
  before_outcome_coverage:rate(a.classified_attempts,a.total_attempts),
  after_outcome_coverage:rate(b.classified_attempts,b.total_attempts),
  before_attempts_per_completed_consultation:rate(a.total_attempts,a.completed_consultations),
  after_attempts_per_completed_consultation:rate(b.total_attempts,b.completed_consultations),
  before_declared_cost_per_completed_consultation_usd:rate(a.declared_cost_usd,a.completed_consultations),
  after_declared_cost_per_completed_consultation_usd:rate(b.declared_cost_usd,b.completed_consultations),
  comparable_case_mix_verified:false,
  verified_provider_invoices:false,
  causal_savings_claim_allowed:false,
  provider_payment_status_known:false,
  clinical_release_allowed:false,
  status:'DESCRIPTIVE_ONLY_NOT_BILLING_OR_CLINICAL_EVIDENCE'
 });
}
