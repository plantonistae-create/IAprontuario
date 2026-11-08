// G11 FINANCIAL BRIDGE — strictly synthetic aggregates. NO official invoice import.
// Source provenance is fixed to mock; cannot verify invoices or causal savings.
const keys=['currency','end_utc','invoice_total_usd','provider','source','start_utc'];
const allowed=['consultations_completed','declared_cost_usd','provider','start_utc','end_utc'];
const exact=(x,f)=>x&&typeof x==='object'&&!Array.isArray(x)&&
 Object.getPrototypeOf(x)===Object.prototype&&Object.keys(x).sort().join('|')===f.slice().sort().join('|');
const amount=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(s)&&Number.isFinite(Date.parse(s));
export function evaluateSyntheticInvoiceBridge({usage,invoice}={}){
 if(!exact(usage,allowed)||!exact(invoice,keys)||!validDate(usage.start_utc)||
  !validDate(usage.end_utc)||!validDate(invoice.start_utc)||!validDate(invoice.end_utc)||
  Date.parse(usage.end_utc)<=Date.parse(usage.start_utc)||
  Date.parse(invoice.end_utc)<=Date.parse(invoice.start_utc)||
  !amount(usage.declared_cost_usd)||!amount(invoice.invoice_total_usd)||
  !Number.isSafeInteger(usage.consultations_completed)||usage.consultations_completed<0||
  !['radar','transcription','core'].includes(usage.provider)||
  invoice.provider!==usage.provider||invoice.currency!=='USD'||
  invoice.source!=='offline_synthetic_invoice')
  throw Error('G11_AGGREGATE_ONLY_SYNTHETIC');
 const sameWindow=usage.start_utc===invoice.start_utc&&usage.end_utc===invoice.end_utc;
 const delta= Math.round((invoice.invoice_total_usd-usage.declared_cost_usd)*1e6)/1e6;
 const deltaPerCase=usage.consultations_completed===0?null:
  Math.round(delta/usage.consultations_completed*1e6)/1e6;
 return Object.freeze({schema_version:'nexa-g11-cost-synthetic-invoice-v1',
  exact_window_alignment:sameWindow,
  mock_invoice_minus_declared_usd: sameWindow?delta:null,
  mock_delta_per_completed_consultation_usd:sameWindow?deltaPerCase:null,
  billing_denominator_valid:usage.consultations_completed>0,
  official_invoice_verified:false,provider_payment_status_verified:false,
  case_mix_matched:false,causal_savings_attributable:false,
  real_provider_network_calls:0,
  status:sameWindow?'SYNTHETIC_WINDOW_MATCH_ONLY':'STOP_BILLING_WINDOW_MISMATCH'});
}
