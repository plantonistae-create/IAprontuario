import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateSyntheticInvoiceBridge as compare} from '../labs/nexa-cost/synthetic-invoice.G11-LAB-ONLY.mjs';
const usage=()=>({provider:'radar',start_utc:'2026-10-01T00:00:00Z',
 end_utc:'2026-10-08T00:00:00Z',consultations_completed:10,declared_cost_usd:4.1});
const invoice=()=>({provider:'radar',source:'offline_synthetic_invoice',currency:'USD',
 start_utc:'2026-10-01T00:00:00Z',end_utc:'2026-10-08T00:00:00Z',invoice_total_usd:4.4});
test('aligned mock invoice can quantify declared discrepancy but cannot establish real savings',()=>{
 const x=compare({usage:usage(),invoice:invoice()});
 assert.equal(x.exact_window_alignment,true);
 assert.equal(x.mock_invoice_minus_declared_usd,0.3);
 assert.equal(x.mock_delta_per_completed_consultation_usd,0.03);
 assert.equal(x.official_invoice_verified,false);
 assert.equal(x.causal_savings_attributable,false);
});
test('mismatched billing window blocks financial comparison, not approximate matching',()=>{
 const f=invoice();f.end_utc='2026-10-09T00:00:00Z';
 const r=compare({usage:usage(),invoice:f});
 assert.equal(r.exact_window_alignment,false);
 assert.equal(r.mock_invoice_minus_declared_usd,null);
 assert.equal(r.status,'STOP_BILLING_WINDOW_MISMATCH');
});
test('zero completed consultations produces null per-consultation denominator',()=>{
 const u=usage();u.consultations_completed=0;
 const x=compare({usage:u,invoice:invoice()});
 assert.equal(x.mock_delta_per_completed_consultation_usd,null);
 assert.equal(x.billing_denominator_valid,false);
});
test('real invoice, patient id and request-level metadata are rejected',()=>{
 for(const source of ['real_invoice','user_supplied','provider_paid']){
  const f=invoice();f.source=source;
  assert.throws(()=>compare({usage:usage(),invoice:f}),/G11_AGGREGATE_ONLY_SYNTHETIC/);
 }
 const f=invoice();f.patient_id='PRIVATE';
 assert.throws(()=>compare({usage:usage(),invoice:f}),/G11_AGGREGATE_ONLY_SYNTHETIC/);
 const u=usage();u.encounter_id='PRIVATE';
 assert.throws(()=>compare({usage:u,invoice:invoice()}),/G11_AGGREGATE_ONLY_SYNTHETIC/);
});
